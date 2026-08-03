// Kitchen Mama Operation System — Allocation pure runtime tests (Round 10B).
// Run: node assets/tests/supply-planning-allocations.test.js
// Exercises the frozen §40 contract implemented in assets/js/core/supply-planning-allocations.js.
// Pure Node, no DOM/DB/Runtime. Canonical literal expectations only (no in-test recomputation of the engine).

'use strict';
var A = require('../js/core/supply-planning-allocations.js');
var allocateOverseasSharedPool = A.allocateOverseasSharedPool;
var allocateFactoryDeterministic = A.allocateFactoryDeterministic;

var fail = 0, pass = 0;
function ok(cond, label) { if (!cond) { fail++; console.error('FAIL ' + label); } else { pass++; console.log('ok   ' + label); } }
function eq(actual, expected, label) {
  var X = JSON.stringify(actual), E = JSON.stringify(expected);
  if (X !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + X); } else { pass++; console.log('ok   ' + label); }
}
function throwsType(fn, label) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }
function throwsRange(fn, label) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + label + ' (no throw)'); }
function byDemand(res) { var m = {}; res.allocations.forEach(function (a) { m[a.demandKey] = (m[a.demandKey] || 0) + a.allocatedQty; }); return m; }

function pool(k, t, w, q, over) { var o = { poolKey: k, poolType: t, warehouseId: w, effectiveSupplyQty: q }; if (over) for (var j in over) o[j] = over[j]; return o; }
function rcv(k, over) { var o = { receiverKey: k, demandKey: 'D-' + k, marketplace: 'amz', destinationWarehouseId: 'W-' + k, fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 50, allocationPriority: 5, demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] }; if (over) for (var j in over) o[j] = over[j]; return o; }
function ov(pools, recvs) { return allocateOverseasSharedPool({ company: 'KM', country: 'US', masterSku: 'GA', supplyPools: pools, receivers: recvs }); }
function fp(k, w, q, over) { var o = { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; if (over) for (var j in over) o[j] = over[j]; return o; }
function fd(k, over) { var o = { demandKey: k, company: 'KM', marketplace: 'amz', destinationWarehouseId: 'W-' + k, requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 100, eligibleFactoryWarehouseIds: ['CN'] }; if (over) for (var j in over) o[j] = over[j]; return o; }
function fac(pools, dems) { return allocateFactoryDeterministic({ masterSku: 'GA', factoryPools: pools, demands: dems }); }

// ==========================================================================
console.log('\n== allocateOverseasSharedPool — general ==');
eq(ov([], []), { allocationType: 'OVERSEAS_SHARED_POOL', allocationMode: 'NORMAL_ALLOCATION', allocations: [], unallocatedDemand: [], unusedSupply: [], blockedInputs: [], totalDemandQty: 0, totalSupplyQty: 0, totalAllocatedQty: 0, totalUnallocatedDemandQty: 0, totalUnusedSupplyQty: 0 }, 'OV empty → empty result');
(function () { var r = ov([pool('P', 'THREE_PL', 'W', 0)], [rcv('A', { demandQty: 0, survivalNeedQty: 0 })]); eq(r.totalAllocatedQty, 0, 'OV zero demand+supply → 0 alloc'); ok(r.totalAllocatedQty + r.totalUnallocatedDemandQty === r.totalDemandQty, 'OV zero conservation demand'); })();
(function () { var r = ov([pool('P', 'THREE_PL', 'W', 0)], [rcv('A', { demandQty: 100, survivalNeedQty: 0 })]); eq(r.totalUnallocatedDemandQty, 100, 'OV zero supply → all demand unallocated'); })();
(function () { var r = ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 0, survivalNeedQty: 0 })]); eq(r.totalUnusedSupplyQty, 100, 'OV zero demand → all supply unused'); })();
(function () { var r = ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 60, survivalNeedQty: 40 })]); eq(byDemand(r)['D-A'], 60, 'OV one receiver one pool = demand cap'); eq(r.totalUnusedSupplyQty, 40, 'OV leftover unused'); })();

console.log('\n== conservation + ordering + immutability ==');
(function () {
  var pools = [pool('P2', 'THREE_PL', 'W2', 300), pool('P1', 'THREE_PL', 'W1', 300)];
  var recvs = [rcv('B', { allocationPriority: 3, demandWeight: 1 }), rcv('A', { allocationPriority: 9, demandWeight: 1 })];
  var r1 = ov(pools, recvs);
  var r2 = ov([pools[1], pools[0]], [recvs[1], recvs[0]]);
  eq(r1, r2, 'OV permutation invariance');
  var keys = r1.allocations.map(function (a) { return a.sourcePoolKey; });
  eq(keys.slice().sort(), keys, 'OV allocations sorted by sourcePoolKey');
  ok(r1.totalAllocatedQty + r1.totalUnallocatedDemandQty === r1.totalDemandQty, 'OV demand conservation');
  ok(r1.totalAllocatedQty + r1.totalUnusedSupplyQty === r1.totalSupplyQty, 'OV supply conservation');
})();
(function () {
  var input = { company: 'KM', country: 'US', masterSku: 'GA', supplyPools: [pool('P', 'THREE_PL', 'W', 100)], receivers: [rcv('A', { demandQty: 60, survivalNeedQty: 40 })] };
  var frozen = JSON.stringify(input);
  var r = allocateOverseasSharedPool(input);
  eq(JSON.stringify(input), frozen, 'OV input not mutated');
  r.allocations[0].allocatedQty = 999; r.allocations.push({}); r.unusedSupply.push({});
  var r2 = allocateOverseasSharedPool(input);
  eq(byDemand(r2)['D-A'], 60, 'OV fresh output per call');
  ok(r.allocations !== r2.allocations, 'OV fresh allocations array');
})();

console.log('\n== NORMAL_ALLOCATION ==');
(function () {
  var r = ov([pool('P', 'THREE_PL', 'W', 1000)], [rcv('A', { demandQty: 600, survivalNeedQty: 100, demandWeight: 2 }), rcv('B', { demandQty: 600, survivalNeedQty: 100, demandWeight: 1 })]);
  eq(r.allocationMode, 'NORMAL_ALLOCATION', 'NORMAL mode token');
  eq(byDemand(r)['D-A'], 600, 'NORMAL A weighted+survival=600 (capped)');
  eq(byDemand(r)['D-B'], 400, 'NORMAL B absorbs overflow=400');
  eq(r.totalUnusedSupplyQty, 0, 'NORMAL unused 0');
  ok(r.allocations.every(function (a) { return a.allocatedQty > 0; }), 'NORMAL no zero-qty records');
})();
(function () { var r = ov([pool('P', 'THREE_PL', 'W', 300)], [rcv('A', { demandQty: 500, survivalNeedQty: 100, demandWeight: 1 }), rcv('B', { demandQty: 500, survivalNeedQty: 100, demandWeight: 1 })]); ok(r.allocations.some(function (a) { return a.allocationReason === 'SURVIVAL_18D'; }), 'NORMAL survival reason present'); ok(r.allocations.some(function (a) { return a.allocationReason === 'WEIGHTED_REMAINDER'; }), 'NORMAL weighted reason present'); })();

console.log('\n== PROTECTED_REALLOCATION ==');
(function () {
  var r = ov([pool('P', 'THREE_PL', 'W', 1000)], [rcv('A', { demandQty: 900, survivalNeedQty: 100, demandWeight: 9 }), rcv('B', { demandQty: 900, survivalNeedQty: 200, demandWeight: 1 })]);
  eq(r.allocationMode, 'PROTECTED_REALLOCATION', 'PROTECTED mode token');
  ok(byDemand(r)['D-B'] >= 200, 'PROTECTED B reaches survival floor 200');
  ok(byDemand(r)['D-A'] >= 100, 'PROTECTED donor A never below survival 100');
  eq(r.totalAllocatedQty, 1000, 'PROTECTED conserves pool');
  ok(r.allocations.some(function (a) { return a.allocationReason === 'PROTECTION_REALLOCATION'; }), 'PROTECTED protection reason present');
})();
(function () { // donor never below floor even with extreme weight skew
  var r = ov([pool('P', 'THREE_PL', 'W', 400)], [rcv('A', { demandQty: 400, survivalNeedQty: 150, demandWeight: 99 }), rcv('B', { demandQty: 400, survivalNeedQty: 150, demandWeight: 1 })]);
  ok(byDemand(r)['D-A'] >= 150 && byDemand(r)['D-B'] >= 150, 'PROTECTED both keep survival floor under skew');
})();

console.log('\n== SHORTAGE_ALLOCATION ==');
(function () {
  var r = ov([pool('P', 'THREE_PL', 'W', 150)], [rcv('A', { demandQty: 500, survivalNeedQty: 150, allocationPriority: 2, demandWeight: 1 }), rcv('B', { demandQty: 500, survivalNeedQty: 150, allocationPriority: 1, demandWeight: 1 })]);
  eq(r.allocationMode, 'SHORTAGE_ALLOCATION', 'SHORTAGE mode token');
  eq(byDemand(r)['D-A'], 100, 'SHORTAGE A weighted 100');
  eq(byDemand(r)['D-B'], 50, 'SHORTAGE B weighted 50');
  eq(r.totalAllocatedQty, 150, 'SHORTAGE conserves supply (no loss/dup)');
  ok(r.allocations.every(function (a) { return a.allocationReason === 'SHORTAGE_LARGEST_REMAINDER'; }), 'SHORTAGE reason');
})();
(function () { // equal remainders / equal priority → deterministic tie-break, no input-order dependence
  var mk = function () { return [rcv('A', { demandQty: 100, survivalNeedQty: 100, allocationPriority: 1, demandWeight: 1 }), rcv('B', { demandQty: 100, survivalNeedQty: 100, allocationPriority: 1, demandWeight: 1 }), rcv('C', { demandQty: 100, survivalNeedQty: 100, allocationPriority: 1, demandWeight: 1 })]; };
  var r1 = ov([pool('P', 'THREE_PL', 'W', 100)], mk());
  var r2 = ov([pool('P', 'THREE_PL', 'W', 100)], mk().reverse());
  eq(r1, r2, 'SHORTAGE equal remainders deterministic (permutation invariant)');
  eq(r1.totalAllocatedQty, 100, 'SHORTAGE leftover distributed, total 100');
})();
(function () { // zero demandWeight in a pool>=survival regime: survival protected, weighted remainder undistributable → leftover unused
  var r = ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 100, survivalNeedQty: 20, allocationPriority: 1, demandWeight: 0 }), rcv('B', { demandQty: 100, survivalNeedQty: 20, allocationPriority: 1, demandWeight: 0 })]);
  eq(r.totalAllocatedQty, 40, 'weight-zero → only survival allocated (40)'); eq(r.totalUnusedSupplyQty, 60, 'weight-zero → remaining pool unused (60)');
  ok(r.totalAllocatedQty + r.totalUnusedSupplyQty === r.totalSupplyQty, 'weight-zero supply conservation'); })();

console.log('\n== FBA / THREE_PL lane behavior ==');
(function () { // #10 FBA-only receiver leaves THREE_PL untouched
  var r = ov([pool('F1', 'FBA', 'WF', 200), pool('T1', 'THREE_PL', 'WT', 500)], [rcv('A', { demandQty: 500, survivalNeedQty: 100, eligiblePoolTypes: ['FBA'] })]);
  ok(r.allocations.every(function (a) { return a.sourcePoolType === 'FBA'; }), 'FBA-only receiver draws only FBA');
  ok(r.unusedSupply.some(function (u) { return u.poolKey === 'T1' && u.unusedQty === 500; }), 'THREE_PL untouched when receiver FBA-only');
})();
(function () { // #10 THREE_PL-only leaves FBA untouched, records preserve source type
  var r = ov([pool('F1', 'FBA', 'WF', 200), pool('T1', 'THREE_PL', 'WT', 500)], [rcv('A', { demandQty: 500, survivalNeedQty: 100, eligiblePoolTypes: ['THREE_PL'] })]);
  ok(r.allocations.every(function (a) { return a.sourcePoolType === 'THREE_PL' && a.sourcePoolKey === 'T1'; }), 'THREE_PL-only preserves sourcePoolType/Key');
  ok(r.unusedSupply.some(function (u) { return u.poolKey === 'F1' && u.unusedQty === 200; }), 'FBA untouched, never merged');
})();
(function () { // eligible for both → each lane processed independently, no cross-type fallback
  var r = ov([pool('F1', 'FBA', 'WF', 100), pool('T1', 'THREE_PL', 'WT', 100)], [rcv('A', { demandQty: 100, survivalNeedQty: 50, eligiblePoolTypes: ['FBA', 'THREE_PL'] })]);
  var types = {}; r.allocations.forEach(function (a) { types[a.sourcePoolType] = (types[a.sourcePoolType] || 0) + a.allocatedQty; });
  eq(types.FBA, 100, 'both-eligible: FBA lane allocated independently'); eq(types.THREE_PL, 100, 'both-eligible: THREE_PL lane allocated independently');
})();
(function () { var r = ov([pool('T1', 'THREE_PL', 'WT', 100)], [rcv('A', { demandQty: 100, survivalNeedQty: 50, eligiblePoolTypes: [] })]); eq(r.totalAllocatedQty, 0, 'neither-eligible receiver gets nothing'); eq(r.totalUnusedSupplyQty, 100, 'neither-eligible leaves supply unused'); })();
(function () { // #11 platform receiver consumes THREE_PL reserve, source stays THREE_PL, reserve reason
  var r = ov([pool('T1', 'THREE_PL', 'WT', 500)], [rcv('P', { fulfillmentModel: 'platform_fulfilled', demandQty: 300, survivalNeedQty: 100, eligiblePoolTypes: ['THREE_PL'] })]);
  ok(r.allocations.every(function (a) { return a.allocationReason === 'THREE_PL_REPLENISHMENT_RESERVE'; }), 'platform → THREE_PL reserve reason');
  ok(r.allocations.every(function (a) { return a.sourcePoolType === 'THREE_PL'; }), 'platform reserve source stays THREE_PL (not reclassified FBA)');
})();
(function () { // same physical supply not double consumed across lanes
  var r = ov([pool('T1', 'THREE_PL', 'WT', 100)], [rcv('A', { demandQty: 100, survivalNeedQty: 50, eligiblePoolTypes: ['THREE_PL'] }), rcv('B', { demandQty: 100, survivalNeedQty: 50, eligiblePoolTypes: ['THREE_PL'] })]);
  ok(r.totalAllocatedQty <= 100, 'THREE_PL pool consumed at most once (<=100)');
  ok(r.totalAllocatedQty + r.totalUnusedSupplyQty === r.totalSupplyQty, 'no double consumption (supply conservation)');
})();

console.log('\n== blocked inputs ==');
(function () {
  var r = ov([pool('P', 'THREE_PL', 'W', 100), pool('BAD', 'THREE_PL', 'W', 0, { state: 'BLOCKED_CONFLICT', reason: 'PHYSICAL_POOL_QTY_CONFLICT' })], [rcv('A', { demandQty: 60, survivalNeedQty: 40 })]);
  eq(r.blockedInputs, [{ kind: 'SUPPLY', key: 'BAD', reason: 'PHYSICAL_POOL_QTY_CONFLICT' }], 'blocked supply reported verbatim');
  eq(r.totalSupplyQty, 100, 'blocked supply excluded from totalSupplyQty');
  eq(byDemand(r)['D-A'], 60, 'eligible set still allocated despite blocked pool');
})();
(function () {
  var r = ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 60, survivalNeedQty: 40 }), { receiverKey: 'BR', demandKey: 'D-BR', state: 'BLOCKED_CONFLICT', reason: 'DEMAND_EVENT_QTY_CONFLICT' }]);
  eq(r.blockedInputs, [{ kind: 'DEMAND', key: 'D-BR', reason: 'DEMAND_EVENT_QTY_CONFLICT' }], 'blocked demand reported verbatim');
  eq(r.totalDemandQty, 60, 'blocked demand excluded from totalDemandQty');
})();

console.log('\n== OV validation ==');
throwsType(function () { allocateOverseasSharedPool(null); }, 'OV TypeError input null');
throwsType(function () { allocateOverseasSharedPool([]); }, 'OV TypeError input array');
throwsType(function () { ov('x', []); }, 'OV TypeError supplyPools non-array');
throwsType(function () { allocateOverseasSharedPool({ company: 'KM', country: 'US', masterSku: 'GA', supplyPools: [], receivers: {} }); }, 'OV TypeError receivers non-array');
throwsType(function () { ov([pool('', 'THREE_PL', 'W', 10)], []); }, 'OV TypeError empty poolKey');
throwsType(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { marketplace: 5 })]); }, 'OV TypeError non-string marketplace');
throwsType(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { demandQty: '5' })]); }, 'OV TypeError non-number demandQty');
throwsType(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { eligiblePoolTypes: 'THREE_PL' })]); }, 'OV TypeError eligiblePoolTypes non-array');
throwsRange(function () { ov([pool('P', 'MYSTERY', 'W', 10)], []); }, 'OV RangeError bad poolType');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { fulfillmentModel: 'ghost' })]); }, 'OV RangeError bad fulfillmentModel');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', -1)], []); }, 'OV RangeError negative supply');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', NaN)], []); }, 'OV RangeError NaN supply');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', Infinity)], []); }, 'OV RangeError Infinity supply');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { demandWeight: -1 })]); }, 'OV RangeError negative weight');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { eligiblePoolTypes: ['NOPE'] })]); }, 'OV RangeError bad eligiblePoolTypes token');
throwsRange(function () { ov([pool('P1', 'THREE_PL', 'W', 10), pool('P1', 'THREE_PL', 'W', 5)], []); }, 'OV RangeError duplicate poolKey');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A'), rcv('A')]); }, 'OV RangeError duplicate receiverKey');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10)], [rcv('A', { demandKey: 'SAME' }), rcv('B', { demandKey: 'SAME' })]); }, 'OV RangeError duplicate demandKey');
throwsRange(function () { ov([pool('P', 'THREE_PL', 'W', 10, { state: 'WEIRD' })], []); }, 'OV RangeError bad Ledger state');
eq(ov([pool('P', 'THREE_PL', 'W', 10, { extra: 'x' })], [rcv('A', { demandQty: 10, survivalNeedQty: 0, extra: 'y' })]).totalAllocatedQty, 10, 'OV extra properties ignored');

// ==========================================================================
console.log('\n== allocateFactoryDeterministic ==');
eq(fac([], []), { allocationType: 'FACTORY_DETERMINISTIC', allocations: [], unallocatedDemand: [], unusedSupply: [], blockedInputs: [], totalDemandQty: 0, totalSupplyQty: 0, totalAllocatedQty: 0, totalUnallocatedDemandQty: 0, totalUnusedSupplyQty: 0 }, 'FAC empty → empty result');
(function () { var r = fac([fp('FP', 'CN', 100)], [fd('D', { demandQty: 80 })]); eq(byDemand(r)['D'], 80, 'FAC one pool one demand'); eq(r.totalUnusedSupplyQty, 20, 'FAC leftover unused'); })();
(function () { // one pool, two companies, earliest requiredByDate first, allocated once
  var r = fac([fp('FP', 'CN', 100)], [fd('DA', { company: 'KM', requiredByDate: '2026-09-01', demandQty: 80 }), fd('DB', { company: 'ResUS', requiredByDate: '2026-10-01', demandQty: 80 })]);
  eq(byDemand(r)['DA'], 80, 'FAC earliest req-by consumes first (80)'); eq(byDemand(r)['DB'], 20, 'FAC later req-by gets remainder (20)');
  ok(r.totalAllocatedQty <= 100, 'FAC each factory unit allocated at most once'); ok(r.totalAllocatedQty + r.totalUnallocatedDemandQty === r.totalDemandQty, 'FAC demand conservation');
})();
(function () { // priority tie-break when requiredByDate equal
  var r = fac([fp('FP', 'CN', 50)], [fd('DA', { requiredByDate: '2026-09-01', allocationPriority: 1, demandQty: 50 }), fd('DB', { requiredByDate: '2026-09-01', allocationPriority: 9, demandQty: 50 })]);
  eq(byDemand(r)['DB'], 50, 'FAC higher priority first on equal req-by'); eq(byDemand(r)['DA'] || 0, 0, 'FAC lower priority gets remainder 0');
})();
(function () { // company/marketplace/destination/demandKey tie-break chain (all else equal)
  var mk = function () { return [fd('D2', { company: 'ZCo', requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 40 }), fd('D1', { company: 'ACo', requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 40 })]; };
  var r = fac([fp('FP', 'CN', 40)], mk());
  eq(byDemand(r)['D1'], 40, 'FAC company asc tie-break (ACo before ZCo)');
})();
(function () { // multiple factory pools consumed in ascending poolKey; eligibility respected
  var r = fac([fp('FP2', 'CN2', 50), fp('FP1', 'CN1', 50)], [fd('D', { demandQty: 70, eligibleFactoryWarehouseIds: ['CN1', 'CN2'] })]);
  eq(r.allocations.map(function (a) { return a.sourcePoolKey; }), ['FP1', 'FP2'], 'FAC pools consumed ascending poolKey');
  eq(byDemand(r)['D'], 70, 'FAC spans multiple pools');
})();
(function () { var r = fac([fp('FP', 'CN', 100)], [fd('D', { demandQty: 50, eligibleFactoryWarehouseIds: ['OTHER'] })]); eq(r.totalAllocatedQty, 0, 'FAC no eligible factory → 0 alloc'); eq(byDemand(r)['D'] || 0, 0, 'FAC ineligible demand unallocated'); eq(r.totalUnusedSupplyQty, 100, 'FAC ineligible → supply unused'); })();
(function () { var r = fac([fp('FP', 'CN', 200)], [fd('D', { demandQty: 80 })]); eq(r.totalUnusedSupplyQty, 120, 'FAC supply > demand → unused'); })();
(function () { var r = fac([fp('FP', 'CN', 30)], [fd('D', { demandQty: 80 })]); eq(r.totalUnallocatedDemandQty, 50, 'FAC demand > supply → unallocated'); eq(r.unallocatedDemand[0].allocationReason, 'FACTORY_SUPPLY_EXHAUSTED', 'FAC unmet reason'); })();
(function () { var r = fac([fp('FP', 'CN', 0)], [fd('D', { demandQty: 0 })]); eq(r.totalAllocatedQty, 0, 'FAC zero supply/demand valid'); })();
(function () { // permutation invariance + immutability
  var pools = [fp('FP1', 'CN', 100)]; var dems = [fd('DB', { requiredByDate: '2026-10-01', demandQty: 60 }), fd('DA', { requiredByDate: '2026-09-01', demandQty: 60 })];
  var input = { masterSku: 'GA', factoryPools: pools, demands: dems }; var frozen = JSON.stringify(input);
  var r1 = allocateFactoryDeterministic(input); eq(JSON.stringify(input), frozen, 'FAC input not mutated');
  var r2 = allocateFactoryDeterministic({ masterSku: 'GA', factoryPools: pools, demands: [dems[1], dems[0]] });
  eq(r1, r2, 'FAC permutation invariance');
  r1.allocations[0].allocatedQty = 999; var r3 = allocateFactoryDeterministic(input); eq(r3.allocations[0].allocatedQty, 60, 'FAC fresh output per call');
})();
(function () { var r = fac([fp('FP', 'CN', 100), fp('BAD', 'CN', 0, { state: 'BLOCKED_CONFLICT', reason: 'SUPPLY_LINEAGE_CONFLICT' })], [fd('D', { demandQty: 80 })]); eq(r.blockedInputs, [{ kind: 'SUPPLY', key: 'BAD', reason: 'SUPPLY_LINEAGE_CONFLICT' }], 'FAC blocked pool reported'); eq(r.totalSupplyQty, 100, 'FAC blocked excluded from totalSupplyQty'); })();

console.log('\n== FAC validation ==');
throwsType(function () { allocateFactoryDeterministic(null); }, 'FAC TypeError input null');
throwsType(function () { allocateFactoryDeterministic({ masterSku: 'GA', factoryPools: 5, demands: [] }); }, 'FAC TypeError factoryPools non-array');
throwsType(function () { fac([fp('FP', 'CN', 10)], [fd('D', { requiredByDate: 20260901 })]); }, 'FAC TypeError non-string requiredByDate');
throwsType(function () { fac([fp('FP', 'CN', 10)], [fd('D', { company: '' })]); }, 'FAC TypeError empty company');
throwsType(function () { fac([fp('FP', 'CN', 10)], [fd('D', { eligibleFactoryWarehouseIds: 'CN' })]); }, 'FAC TypeError eligibleFactoryWarehouseIds non-array');
throwsRange(function () { fac([fp('FP', 'CN', 10, { poolType: 'THREE_PL' })], []); }, 'FAC RangeError non-FACTORY poolType');
throwsRange(function () { fac([fp('FP', 'CN', 10)], [fd('D', { requiredByDate: '2026-13-01' })]); }, 'FAC RangeError invalid date');
throwsRange(function () { fac([fp('FP', 'CN', 10)], [fd('D', { requiredByDate: '2026-2-1' })]); }, 'FAC RangeError non-strict date');
throwsRange(function () { fac([fp('FP', 'CN', -5)], []); }, 'FAC RangeError negative supply');
throwsRange(function () { fac([fp('FP', 'CN', Infinity)], []); }, 'FAC RangeError Infinity supply');
throwsRange(function () { fac([fp('P', 'CN', 10), fp('P', 'CN', 5)], []); }, 'FAC RangeError duplicate poolKey');
throwsRange(function () { fac([fp('FP', 'CN', 10)], [fd('SAME'), fd('SAME')]); }, 'FAC RangeError duplicate demandKey');

// determinism
eq(fac([fp('FP', 'CN', 100)], [fd('D', { demandQty: 80 })]), fac([fp('FP', 'CN', 100)], [fd('D', { demandQty: 80 })]), 'FAC determinism repeated identical');
eq(ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 60, survivalNeedQty: 40 })]), ov([pool('P', 'THREE_PL', 'W', 100)], [rcv('A', { demandQty: 60, survivalNeedQty: 40 })]), 'OV determinism repeated identical');

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 10B Allocation assertions passed (' + pass + ' assertions).');
