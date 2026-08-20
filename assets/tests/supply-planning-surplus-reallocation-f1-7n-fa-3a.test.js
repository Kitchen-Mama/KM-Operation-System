// Kitchen Mama Operation System — Factory Surplus Reallocation (KMFSR) tests — F1-7N-FA-3A.
// Run: node assets/tests/supply-planning-surplus-reallocation-f1-7n-fa-3a.test.js
// Exercises the frozen §41 / §41.5A / §43 orchestration implemented in
// assets/js/core/supply-planning-surplus-reallocation.js (KMFSR.projectSurplusReallocation).
// Pure Node, no DOM/DB/Runtime/clock. Canonical literal expectations + §41.9 conservation invariants.

'use strict';
var K = require('../js/core/supply-planning-surplus-reallocation.js');
var project = K.projectSurplusReallocation;

var fail = 0, pass = 0;
function ok(cond, label) { if (!cond) { fail++; console.error('FAIL ' + label); } else { pass++; console.log('ok   ' + label); } }
function eq(actual, expected, label) {
  var X = JSON.stringify(actual), E = JSON.stringify(expected);
  if (X !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + X); } else { pass++; console.log('ok   ' + label); }
}
function throwsType(fn, label) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ': ' + (e && e.message) + ')'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }
function throwsRange(fn, label) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }
function tierRank(t) { return t === 'T1' ? 1 : (t === 'T2' ? 2 : (t === 'T3' ? 3 : 0)); }
function byKey(res) { var m = {}; res.receivers.forEach(function (f) { m[f.demandKey] = f; }); return m; }

var CALC = '2026-08-20';
// tier dates relative to CALC=2026-08-20: T1 monthDelta 0/1, T2 =2, T3 =3, T4 =4, null >=5.
var T1a = '2026-08-25', T1b = '2026-08-26', T1c = '2026-09-10';
var T2a = '2026-10-15', T2b = '2026-10-16', T3a = '2026-11-15', T4a = '2026-12-15', OORa = '2027-01-15';

function fp(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function rc(demandKey, over) {
  var o = { demandKey: demandKey, company: 'KM', marketplace: 'amz', destinationWarehouseId: 'W-' + demandKey,
    requiredByDate: T1a, allocationPriority: 5, demandQty: 100, projectedRequirementQty: 100, eligibleFactoryWarehouseIds: ['CN'] };
  if (over) for (var j in over) o[j] = over[j];
  return o;
}
function run(pools, recvs, calc) { return project({ masterSku: 'GA', calculationDate: calc || CALC, factoryPools: pools, receivers: recvs }); }

// ---- §41.9 conservation invariant checker (applied across scenarios) ----
function invariants(res, label) {
  ok(res.totals.totalInitialAllocatedQty <= res.totals.totalFactorySupplyQty, label + ' §41.9(1) Σinitial ≤ supply');
  var sumShort = 0; res.receivers.forEach(function (f) { if (f.actionable) sumShort += f.remainingShortageQty; });
  eq(res.totalNetOrderNeed, sumShort, label + ' §41.9(7) netOrderNeed = Σ actionable remaining shortage');
  var inByR = {}, outByD = {};
  res.transferLedger.forEach(function (t) {
    inByR[t.receiverDemandKey] = (inByR[t.receiverDemandKey] || 0) + t.qty;
    outByD[t.donorDemandKey] = (outByD[t.donorDemandKey] || 0) + t.qty;
    ok(tierRank(t.donorTier) > 0 && tierRank(t.receiverTier) > 0 && tierRank(t.donorTier) <= tierRank(t.receiverTier), label + ' §41.9(9) tier ordering ' + t.donorDemandKey + '->' + t.receiverDemandKey);
    ok(t.reason === 'FACTORY_SURPLUS_REALLOCATION', label + ' ledger reason ' + t.donorDemandKey);
  });
  res.receivers.forEach(function (f) {
    eq(f.reallocatedInQty, inByR[f.demandKey] || 0, label + ' §41.9(6) in matches ledger ' + f.demandKey);
    eq(f.reallocatedOutQty, outByD[f.demandKey] || 0, label + ' §41.9(5) out matches ledger ' + f.demandKey);
    ok(f.reallocatedOutQty <= f.initialFactoryAllocationQty - f.protectedFactoryQty, label + ' §41.9(8) out ≤ initial-protected ' + f.demandKey);
    ok(f.releasableSurplusQty >= 0 && f.remainingShortageQty >= 0, label + ' §41.9(2,3) non-negative remainders ' + f.demandKey);
    ok(f.protectedFactoryQty >= 0 && f.protectedFactoryQty <= f.initialFactoryAllocationQty, label + ' §41.9(4) protected in [0,initial] ' + f.demandKey);
    ok([f.initialFactoryAllocationQty, f.reallocatedInQty, f.reallocatedOutQty, f.remainingShortageQty, f.protectedFactoryQty, f.releasableSurplusQty].every(Number.isInteger), label + ' integer qtys ' + f.demandKey);
  });
}

// ==========================================================================
console.log('\n== A. canonical cross-company partial coverage (T1 donor → T2 receiver) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 100)], [
    rc('D1', { requiredByDate: T1a, demandQty: 100, projectedRequirementQty: 60 }),
    rc('D2', { company: 'ResUS', requiredByDate: T2a, demandQty: 50, projectedRequirementQty: 50 })
  ]);
  var m = byKey(res);
  eq(m.D1.initialFactoryAllocationQty, 100, 'D1 initial 100');
  eq(m.D1.protectedFactoryQty, 60, 'D1 protected 60');
  eq(m.D1.reallocatedOutQty, 40, 'D1 out 40');
  eq(m.D1.releasableSurplusQty, 0, 'D1 releasable remaining 0');
  eq(m.D1.coverageReason, 'DONOR_SURPLUS_RELEASED', 'D1 coverage DONOR_SURPLUS_RELEASED');
  eq(m.D2.reallocatedInQty, 40, 'D2 in 40 (cross-company KM→ResUS)');
  eq(m.D2.remainingShortageQty, 10, 'D2 remaining shortage 10');
  eq(m.D2.netOrderNeed, 10, 'D2 netOrderNeed 10');
  eq(res.totalNetOrderNeed, 10, 'totalNetOrderNeed 10');
  eq(res.transferLedger.length, 1, 'one transfer ledger row');
  eq(res.transferLedger[0], { sourceWarehouseId: 'CN', donorDemandKey: 'D1', receiverDemandKey: 'D2', qty: 40, donorTier: 'T1', receiverTier: 'T2', reason: 'FACTORY_SURPLUS_REALLOCATION' }, 'ledger row exact');
  invariants(res, 'canonical');
})();

console.log('\n== B. no shortage / no surplus (factory initial covers) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 100)], [rc('S1', { demandQty: 100, projectedRequirementQty: 100 })]);
  var m = byKey(res);
  eq(m.S1.initialFactoryAllocationQty, 100, 'S1 initial 100');
  eq(m.S1.releasableSurplusQty, 0, 'S1 no surplus');
  eq(m.S1.remainingShortageQty, 0, 'S1 no shortage');
  eq(m.S1.coverageReason, 'FACTORY_INITIAL_COVERED', 'S1 FACTORY_INITIAL_COVERED');
  eq(res.totalNetOrderNeed, 0, 'no net order need');
  eq(res.transferLedger.length, 0, 'no transfers');
  invariants(res, 'no-shortage');
})();

console.log('\n== C. same-company eligible full coverage ==');
(function () {
  var res = run([fp('CN-1', 'CN', 60)], [
    rc('K1', { requiredByDate: T1a, demandQty: 60, projectedRequirementQty: 20 }), // releasable 40
    rc('K2', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 40 })   // shortage 40
  ]);
  var m = byKey(res);
  eq(m.K1.reallocatedOutQty, 40, 'K1 out 40 (same company)');
  eq(m.K2.reallocatedInQty, 40, 'K2 in 40');
  eq(m.K2.remainingShortageQty, 0, 'K2 fully covered');
  eq(m.K2.coverageReason, 'SURPLUS_REALLOCATION_COVERED', 'K2 SURPLUS_REALLOCATION_COVERED');
  eq(res.totalNetOrderNeed, 0, 'full coverage → 0 net need');
  invariants(res, 'same-company');
})();

console.log('\n== D. T2→T1 and T3→T1 rejected (later surplus never covers earlier shortage) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 60)], [
    rc('LATE', { requiredByDate: T2a, demandQty: 60, projectedRequirementQty: 20 }), // T2 donor, releasable 40
    rc('EARLY', { requiredByDate: T1a, demandQty: 0, projectedRequirementQty: 40 })  // T1 receiver, shortage 40
  ]);
  var m = byKey(res);
  eq(res.transferLedger.length, 0, 'T2→T1 no transfer');
  eq(m.EARLY.remainingShortageQty, 40, 'EARLY shortage remains 40');
  eq(m.EARLY.coverageReason, 'SHORTAGE_REMAINS', 'EARLY SHORTAGE_REMAINS');
  eq(res.totalNetOrderNeed, 40, 'net need 40 (rejected transfer)');
  invariants(res, 'T2->T1');

  var res3 = run([fp('CN-1', 'CN', 60)], [
    rc('L3', { requiredByDate: T3a, demandQty: 60, projectedRequirementQty: 20 }), // T3 donor
    rc('E1', { requiredByDate: T1a, demandQty: 0, projectedRequirementQty: 40 })   // T1 receiver
  ]);
  eq(res3.transferLedger.length, 0, 'T3→T1 no transfer');
  invariants(res3, 'T3->T1');
})();

console.log('\n== E. T4 + out-of-range are visibility-only (no allocation, no reallocation, no net need) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 100)], [
    rc('T4R', { requiredByDate: T4a, demandQty: 100, projectedRequirementQty: 80 }),
    rc('OOR', { requiredByDate: OORa, demandQty: 100, projectedRequirementQty: 80 })
  ]);
  var m = byKey(res);
  eq(m.T4R.tier, 'T4', 'T4R tier T4');
  eq(m.T4R.initialFactoryAllocationQty, 0, 'T4 gets NO factory allocation');
  eq(m.T4R.netOrderNeed, 0, 'T4 never in Request/PO payload → netOrderNeed 0');
  eq(m.T4R.coverageReason, 'NON_ACTIONABLE_VISIBILITY_ONLY', 'T4 visibility-only');
  eq(m.OOR.tier, null, 'OOR tier null (monthDelta ≥ 5)');
  eq(m.OOR.actionable, false, 'OOR not actionable');
  eq(res.totals.totalInitialAllocatedQty, 0, 'no actionable demand → nothing allocated');
  eq(res.totals.totalUnusedFactorySupplyQty, 100, 'all supply unused (no actionable claim)');
  eq(res.totalNetOrderNeed, 0, 'T4/OOR contribute 0 net need');
  invariants(res, 'T4-visibility');
})();
// T4 donor cannot release surplus even alongside an actionable receiver
(function () {
  var res = run([fp('CN-1', 'CN', 100)], [
    rc('T4D', { requiredByDate: T4a, demandQty: 100, projectedRequirementQty: 0 }),  // would-be donor, but T4
    rc('R1', { requiredByDate: T1a, demandQty: 0, projectedRequirementQty: 50 })     // T1 receiver, shortage 50
  ]);
  var m = byKey(res);
  eq(m.T4D.initialFactoryAllocationQty, 0, 'T4 donor gets no allocation → no surplus');
  eq(res.transferLedger.length, 0, 'no transfer from a T4 donor');
  eq(m.R1.remainingShortageQty, 50, 'R1 shortage unmet by T4 donor');
  invariants(res, 'T4-donor');
})();

console.log('\n== F. source-aware eligibility (multi-source donor; receiver eligible for VN only) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 30), fp('VN-1', 'VN', 30)], [
    rc('MS', { requiredByDate: T1a, demandQty: 60, projectedRequirementQty: 20, eligibleFactoryWarehouseIds: ['CN', 'VN'] }),
    rc('RV', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 50, eligibleFactoryWarehouseIds: ['VN'] })
  ]);
  var m = byKey(res);
  eq(m.MS.initialFactoryAllocationQty, 60, 'MS initial 60 (CN30+VN30)');
  eq(m.MS.sourceBreakdown, [{ warehouseId: 'CN', initialAllocatedQty: 30 }, { warehouseId: 'VN', initialAllocatedQty: 30 }], 'MS source breakdown CN30/VN30');
  eq(m.RV.reallocatedInQty, 30, 'RV receives only 30 (VN source only)');
  eq(m.MS.releasableSurplusQty, 10, 'MS retains 10 CN surplus (RV not CN-eligible)');
  eq(m.RV.remainingShortageQty, 20, 'RV remaining 20 (CN 10 not consumable)');
  eq(res.transferLedger.length, 1, 'single VN transfer');
  eq(res.transferLedger[0].sourceWarehouseId, 'VN', 'transfer from VN source');
  invariants(res, 'source-aware');
})();

console.log('\n== G. multi-donor (receiver draws from two donors, deterministic order) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 80)], [
    rc('DA', { requiredByDate: T1a, demandQty: 40, projectedRequirementQty: 10 }), // releasable 30
    rc('DB', { requiredByDate: T1b, demandQty: 40, projectedRequirementQty: 10 }), // releasable 30
    rc('RB', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 50 })   // shortage 50
  ]);
  var m = byKey(res);
  eq(m.RB.reallocatedInQty, 50, 'RB fully covered from two donors');
  eq(m.DA.reallocatedOutQty, 30, 'DA gives 30 first (earliest req-by)');
  eq(m.DB.reallocatedOutQty, 20, 'DB gives remaining 20');
  eq(res.transferLedger.length, 2, 'two transfer rows');
  eq(res.totalNetOrderNeed, 0, 'RB covered');
  invariants(res, 'multi-donor');
})();

console.log('\n== H. multi-receiver (one donor; earliest-required receiver filled first) ==');
(function () {
  var res = run([fp('CN-1', 'CN', 60)], [
    rc('BIG', { requiredByDate: T1a, demandQty: 60, projectedRequirementQty: 0 }),  // releasable 60
    rc('R1', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 40, allocationPriority: 9 }),
    rc('R2', { requiredByDate: T2b, demandQty: 0, projectedRequirementQty: 40, allocationPriority: 5 })
  ]);
  var m = byKey(res);
  eq(m.R1.reallocatedInQty, 40, 'R1 (earliest) fully covered 40');
  eq(m.R2.reallocatedInQty, 20, 'R2 gets remaining 20');
  eq(m.R2.remainingShortageQty, 20, 'R2 partial');
  eq(res.totalNetOrderNeed, 20, 'net need 20');
  invariants(res, 'multi-receiver');
})();

console.log('\n== I. explicit zero supply / zero requirement ==');
(function () {
  var res0 = run([fp('CN-1', 'CN', 0)], [rc('Z', { demandQty: 100, projectedRequirementQty: 100 })]);
  eq(byKey(res0).Z.remainingShortageQty, 100, 'zero supply → full shortage');
  eq(res0.totalNetOrderNeed, 100, 'zero supply net need 100');
  invariants(res0, 'zero-supply');
  var resR = run([fp('CN-1', 'CN', 100)], [rc('N', { demandQty: 0, projectedRequirementQty: 0 })]);
  var mn = byKey(resR).N;
  eq(mn.coverageReason, 'NO_REQUIREMENT', 'zero requirement → NO_REQUIREMENT');
  eq(mn.remainingShortageQty, 0, 'zero requirement no shortage');
  eq(resR.totals.totalUnusedFactorySupplyQty, 100, 'all supply unused');
  invariants(resR, 'zero-requirement');
})();

console.log('\n== J. §43 integer safety — no ratio step, no over-allocation, residual retained ==');
(function () {
  // §43.8: FA-3A uses §40 integer FIFO — NO ratio→unit conversion. Every allocated/transferred qty is an integer,
  // Σinitial ≤ supply, and unallocated physical residual is reported SEPARATELY (never a donor surplus).
  var res = run([fp('CN-1', 'CN', 100)], [rc('R', { demandQty: 30, projectedRequirementQty: 30 })]);
  var m = byKey(res).R;
  eq(m.initialFactoryAllocationQty, 30, 'FLOOR/integer FIFO: exactly 30 allocated');
  eq(m.releasableSurplusQty, 0, 'residual is NOT donor surplus');
  eq(res.totals.totalUnusedFactorySupplyQty, 70, '70 residual retained separately (§43.6)');
  ok(res.totals.totalInitialAllocatedQty <= res.totals.totalFactorySupplyQty, '§43.5 Σalloc ≤ available (never over-allocate)');
  ok([m.initialFactoryAllocationQty, m.remainingShortageQty].every(Number.isInteger), '§43.3 integer allocation only');
  // over-allocation guard across a busier scenario: Σ(protected + reallocatedIn) ≤ Σ initial (analysis conserves)
  var res2 = run([fp('CN-1', 'CN', 80)], [
    rc('P1', { requiredByDate: T1a, demandQty: 80, projectedRequirementQty: 30 }),
    rc('P2', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 100 })
  ]);
  var totalProtectedPlusIn = 0, totalInitial = 0;
  res2.receivers.forEach(function (f) { totalProtectedPlusIn += f.protectedFactoryQty + f.reallocatedInQty; totalInitial += f.initialFactoryAllocationQty; });
  ok(totalProtectedPlusIn <= totalInitial, 'Σ(protected+in) ≤ Σinitial — no physical unit conjured');
  ok(res2.totals.totalReallocatedQty <= res2.totals.totalReleasableSurplusQty, 'Σreallocated ≤ Σreleasable surplus');
  invariants(res2, 'over-alloc-guard');
})();

console.log('\n== K. determinism (§41.9(10)) — permuted input → identical output ==');
(function () {
  var pools = [fp('CN-1', 'CN', 30), fp('VN-1', 'VN', 30)];
  var recvs = [
    rc('MS', { requiredByDate: T1a, demandQty: 60, projectedRequirementQty: 20, eligibleFactoryWarehouseIds: ['CN', 'VN'] }),
    rc('RV', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 50, eligibleFactoryWarehouseIds: ['VN'] })
  ];
  var r1 = run(pools, recvs);
  var r2 = run([pools[1], pools[0]], [recvs[1], recvs[0]]);
  eq(r1, r2, 'permutation invariance');
})();

console.log('\n== L. input immutability + fresh output per call ==');
(function () {
  var input = { masterSku: 'GA', calculationDate: CALC, factoryPools: [fp('CN-1', 'CN', 100)],
    receivers: [rc('D1', { requiredByDate: T1a, demandQty: 100, projectedRequirementQty: 60 }), rc('D2', { requiredByDate: T2a, demandQty: 0, projectedRequirementQty: 50 })] };
  var frozen = JSON.stringify(input);
  var r = project(input);
  eq(JSON.stringify(input), frozen, 'input not mutated');
  r.receivers[0].initialFactoryAllocationQty = 999; r.transferLedger.push({});
  var r2 = project(input);
  eq(byKey(r2).D1.initialFactoryAllocationQty, 100, 'fresh output per call (mutation did not leak)');
})();

console.log('\n== M. malformed input (strict validation) ==');
throwsType(function () { project(null); }, 'null input → TypeError');
throwsType(function () { project({ calculationDate: CALC, factoryPools: [], receivers: [] }); }, 'missing masterSku → TypeError');
throwsType(function () { project({ masterSku: 'GA', factoryPools: [], receivers: [] }); }, 'missing calculationDate → TypeError');
throwsType(function () { project({ masterSku: 'GA', calculationDate: CALC, factoryPools: {}, receivers: [] }); }, 'factoryPools not array → TypeError');
throwsType(function () { project({ masterSku: 'GA', calculationDate: CALC, factoryPools: [], receivers: [{ company: 'KM', requiredByDate: T1a, allocationPriority: 5, demandQty: 1, projectedRequirementQty: 1, marketplace: 'a', destinationWarehouseId: 'w', eligibleFactoryWarehouseIds: ['CN'] }] }); }, 'receiver missing demandKey → TypeError');
throwsRange(function () { run([fp('CN-1', 'CN', 10)], [rc('DUP'), rc('DUP')]); }, 'duplicate demandKey → RangeError');
throwsRange(function () { run([fp('CN-1', 'CN', 10)], [rc('NEG', { projectedRequirementQty: -1 })]); }, 'negative projectedRequirementQty → RangeError');
throwsRange(function () { run([fp('CN-1', 'CN', 10)], [rc('BAD', { requiredByDate: '2026-13-40' })]); }, 'bad requiredByDate → RangeError (classifier)');

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All F1-7N-FA-3A KMFSR assertions passed (' + pass + ' assertions).');
