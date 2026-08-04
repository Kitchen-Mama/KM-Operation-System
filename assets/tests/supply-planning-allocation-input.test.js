// Kitchen Mama Operation System — Allocation Input source projection tests (Phase 2C, Round 1L).
// Run: node assets/tests/supply-planning-allocation-input.test.js
// Pure Node — exercises projectAllocationInputs in assets/js/core/supply-planning-source-facts.js. Builds inputs
// with the REAL buildDemandLedger / buildSupplyLedger, joins caller-supplied planning facts, and calls the REAL
// allocateOverseasSharedPool / allocateFactoryDeterministic (never reimplemented). Verifies §40 DTO shape,
// demand/supply authority consumption, FBA/THREE_PL separation, factory FIFO, blocked propagation, missing≠zero,
// determinism/purity. New assertion count reported separately.

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = '';
var IDENTITY = { company: 'KM', country: 'US', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' };

function demandEntry(sourceRef, dest, mkt, qty, rbd) {
  return { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: mkt, destinationWarehouseId: dest, planningCycle: '2026-W40', requiredByDate: rbd || '2026-09-01', sourceRef: sourceRef, quantity: qty };
}
function buildDL(entries) { return LEDGER.buildDemandLedger({ entries: entries }); }
function dk(dl, ref) {
  for (var i = 0; i < dl.entries.length; i++) { var k = dl.entries[i].demandKey; if (k.slice(-ref.length) === ref && k.charAt(k.length - ref.length - 1) === SEP) return k; }
  throw new Error('no demandKey ending with ' + ref);
}
function supplyEntry(lineage, wh, poolType, qty, bucket) {
  return { supplyLineageRef: lineage, masterSku: 'CO1100-R', company: 'KM', warehouseId: wh, poolType: poolType, lifecycleBucket: bucket || 'CURRENT_STOCK', quantity: qty };
}
function buildSL(entries) { return LEDGER.buildSupplyLedger({ entries: entries }); }
function poolKeyFor(sl, wh, poolType) { for (var i = 0; i < sl.pools.length; i++) { var p = sl.pools[i]; if (p.warehouseId === wh && p.poolType === poolType) return p.poolKey; } throw new Error('no pool ' + wh + '/' + poolType); }
function recv(key, demandKey, elig, extra) {
  var r = { receiverKey: key, demandKey: demandKey, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', fulfillmentModel: 'self_fulfilled', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, eligiblePoolTypes: elig };
  if (extra) for (var k in extra) r[k] = extra[k];
  return r;
}

// ==========================================================================
section('O. overseas DTO — join + authority + eligibility');
(function () {
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  var r = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq([r.ready, r.overseasInput.company, r.overseasInput.country, r.overseasInput.masterSku], [true, 'KM', 'US', 'CO1100-R'], 'O1 overseas scope company/country/masterSku from identity');
  eq([r.overseasInput.receivers.length, r.overseasInput.receivers[0].demandQty, r.overseasInput.receivers[0].eligiblePoolTypes], [1, 100, ['THREE_PL']], 'O1b demandQty = effectiveDemandQty (Ledger authority); eligiblePoolTypes projected');
  eq(r.overseasInput.supplyPools[0].effectiveSupplyQty, 200, 'O1c supplyPool effectiveSupplyQty = Supply Ledger authority');
  // FBA receiver + FBA pool
  var dlf = buildDL([demandEntry('f1', 'WH-FBA', 'AMAZON_US', 80)]);
  var slf = buildSL([supplyEntry('sf', 'WH-FBA', 'FBA', 80)]);
  var rf = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dlf, supplyLedger: slf, receiverFacts: [recv('RF', dk(dlf, 'f1'), ['FBA'])] });
  eq(rf.overseasInput.receivers[0].eligiblePoolTypes, ['FBA'], 'O2 FBA-eligible receiver');
  // receiver eligible for both → dedup + sorted
  var rb = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('RB', dk(dl, 'd1'), ['THREE_PL', 'FBA', 'FBA'])] });
  eq(rb.overseasInput.receivers[0].eligiblePoolTypes, ['FBA', 'THREE_PL'], 'O3 both-eligible → deduped + deterministic order');
  // no eligible pools → empty eligibility → unallocated (not an invented pool)
  var re = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('RE', dk(dl, 'd1'), [])] });
  eq([re.overseasInput.receivers[0].eligiblePoolTypes.length, re.overseasAllocation.totalAllocatedQty], [0, 0], 'O4 empty eligiblePoolTypes → demand unallocated');
  // marketplace provenance retained
  eq(r.overseasInput.receivers[0].marketplace, 'AMAZON_US', 'O5 marketplace provenance retained');
  // survival via dailyDemand derivation ceil(18*x)
  var rd = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('RD', dk(dl, 'd1'), ['THREE_PL'], { survivalNeedQty: undefined, dailyDemand: 2.5 })] });
  eq(rd.overseasInput.receivers[0].survivalNeedQty, 45, 'O6 survivalNeedQty derivable = ceil(18 × dailyDemand) (§20.3/§24.4)');
})();

section('O. overseas DTO — missing / invalid planning facts fail closed');
(function () {
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  function base(extra) { return SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'], extra)] }); }
  eq(base({ survivalNeedQty: undefined }).issues[0].reason, 'MISSING_SURVIVAL_NEED', 'O7 missing survivalNeedQty (no dailyDemand) → issue, no fabricated default');
  eq(base({ allocationPriority: undefined }).issues[0].reason, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY', 'O8 missing allocationPriority → issue');
  eq(base({ demandWeight: undefined }).issues[0].reason, 'MISSING_OR_INVALID_DEMAND_WEIGHT', 'O9 missing demandWeight → issue');
  eq(base({ fulfillmentModel: 'MARS' }).issues[0].reason.indexOf('INVALID_FULFILLMENT_MODEL') === 0, true, 'O10 invalid fulfillmentModel → issue');
  eq(base({ eligiblePoolTypes: ['FACTORY'] }).issues[0].reason.indexOf('INVALID_ELIGIBLE_POOL_TYPES') === 0, true, 'O11 FACTORY not allowed in overseas eligiblePoolTypes → issue');
  eq(base({ allocationPriority: -1 }).issues[0].reason, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY', 'O12 negative priority → issue (no coercion)');
  // fulfillmentModel falls back to identity when receiver omits it
  eq(base({ fulfillmentModel: undefined }).overseasInput.receivers[0].fulfillmentModel, 'self_fulfilled', 'O13 fulfillmentModel falls back to identity.fulfillmentModel');
  // duplicate receiverKey / demandKey
  var dup = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL']), recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  ok(dup.issues.some(function (x) { return x.reason === 'DUPLICATE_RECEIVER_KEY' || x.reason === 'DUPLICATE_DEMAND_KEY'; }), 'O14 duplicate receiver/demand key → issue, excluded (no allocator RangeError)');
  // demandKey not in ledger
  eq(SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R9', 'nope', ['THREE_PL'])] }).issues[0].reason, 'DEMAND_KEY_NOT_IN_LEDGER', 'O15 demandKey not in ledger → issue');
})();

section('O. overseas scope — one company/country/masterSku');
(function () {
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  // mixed company: identity KM but receiver's ledger entry is KM → OK; simulate mismatch via different identity company
  var mm = SF.projectAllocationInputs({ identity: { company: 'OTHERCO', country: 'US', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' }, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq(mm.issues[0].reason, 'COMPANY_SCOPE_MISMATCH', 'O16 receiver whose Ledger company != scope → fail closed');
  var mc = SF.projectAllocationInputs({ identity: { company: 'KM', country: 'CA', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' }, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq(mc.issues[0].reason, 'COUNTRY_SCOPE_MISMATCH', 'O17 receiver whose Ledger country != scope → fail closed');
})();

// ==========================================================================
section('A. overseas allocation — real allocator (NORMAL / SHORTAGE / PROTECTED)');
(function () {
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var normal = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq([normal.overseasAllocation.allocationMode, normal.overseasAllocation.totalAllocatedQty, normal.overseasAllocation.totalUnusedSupplyQty], ['NORMAL_ALLOCATION', 100, 100], 'A1 NORMAL: 100 allocated, 100 unused');
  // SHORTAGE: pool < sum survival
  var slShort = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 30)]);
  var shortage = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: slShort, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq([shortage.overseasAllocation.allocationMode, shortage.overseasAllocation.totalAllocatedQty], ['SHORTAGE_ALLOCATION', 30], 'A2 SHORTAGE: pool(30) < survival(50) → 30 allocated');
  // PROTECTED: pool>=sumSurvival but weight split starves one below survival
  var dl2 = buildDL([demandEntry('a', 'WH-3PL', 'MP-A', 100), demandEntry('b', 'WH-3PL', 'MP-B', 100)]);
  var sl2 = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 100)]);
  var prot = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl2, supplyLedger: sl2, receiverFacts: [
    recv('RA', dk(dl2, 'a'), ['THREE_PL'], { marketplace: 'MP-A', survivalNeedQty: 50, demandWeight: 9 }),
    recv('RB', dk(dl2, 'b'), ['THREE_PL'], { marketplace: 'MP-B', survivalNeedQty: 50, demandWeight: 1 })
  ] });
  eq(prot.overseasAllocation.allocationMode, 'PROTECTED_REALLOCATION', 'A3 PROTECTED: survival floor forces reallocation vs pure weight');
  eq(prot.overseasAllocation.totalAllocatedQty, 100, 'A3b PROTECTED conserves the 100-unit pool');
})();

section('A. FBA/THREE_PL separation + platform reserve + conservation');
(function () {
  // THREE_PL receiver with only an FBA pool → unallocated (no cross-type fallback)
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var slFbaOnly = buildSL([supplyEntry('sf', 'WH-FBA', 'FBA', 100)]);
  var noLane = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: slFbaOnly, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  eq([noLane.overseasAllocation.totalAllocatedQty, noLane.overseasAllocation.totalUnusedSupplyQty], [0, 100], 'A4 THREE_PL receiver + FBA-only pool → 0 allocated, no cross-type fallback');
  // platform_fulfilled + THREE_PL lane → THREE_PL_REPLENISHMENT_RESERVE reason
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 100)]);
  var plat = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'], { fulfillmentModel: 'platform_fulfilled' })] });
  ok(plat.overseasAllocation.allocations.some(function (a) { return a.allocationReason === 'THREE_PL_REPLENISHMENT_RESERVE'; }), 'A5 platform_fulfilled + THREE_PL → THREE_PL_REPLENISHMENT_RESERVE');
  // conservation
  var c = plat.overseasAllocation;
  eq([c.totalAllocatedQty + c.totalUnallocatedDemandQty === c.totalDemandQty, c.totalAllocatedQty + c.totalUnusedSupplyQty === c.totalSupplyQty], [true, true], 'A6 conservation holds (demand + supply)');
})();

// ==========================================================================
section('F. factory DTO + allocation (real allocator)');
(function () {
  var dl = buildDL([demandEntry('fa', 'WH-3PL', 'AMAZON_US', 100, '2026-09-01'), demandEntry('fb', 'WH-3PL', 'AMAZON_US', 100, '2026-09-10')]);
  var sl = buildSL([supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)]);
  function fdem(key, elig, extra) { var d = { demandKey: key, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', allocationPriority: 1, eligibleFactoryWarehouseIds: elig }; if (extra) for (var k in extra) d[k] = extra[k]; return d; }
  var r = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: [fdem(dk(dl, 'fa'), ['WH-FAC']), fdem(dk(dl, 'fb'), ['WH-FAC'])] });
  eq([r.factoryInput.factoryPools[0].warehouseId, r.factoryInput.demands.length], ['WH-FAC', 2], 'F1 FACTORY pool + factory demands projected');
  eq(r.factoryInput.demands[0].demandQty, 100, 'F1b factory demandQty = Ledger authority');
  // earliest requiredByDate first: fa(09-01) gets the 60, fb(09-10) gets 0
  eq([r.factoryAllocation.totalAllocatedQty, r.factoryAllocation.allocations[0].demandKey.slice(-2)], [60, 'fa'], 'F2 earliest requiredByDate consumes the 60 units first (FIFO)');
  // eligibility: demand eligible for a different warehouse → unallocated
  var r2 = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: [fdem(dk(dl, 'fa'), ['WH-OTHER'])] });
  eq(r2.factoryAllocation.totalAllocatedQty, 0, 'F3 demand eligible only for a non-present warehouse → unallocated');
  // missing eligibility → issue
  var r3 = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: [{ demandKey: dk(dl, 'fa'), marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', allocationPriority: 1 }] });
  eq(r3.issues[0].reason, 'INVALID_ELIGIBLE_FACTORY_WAREHOUSES', 'F4 missing eligibleFactoryWarehouseIds → issue');
  // missing/invalid requiredByDate (ledger entry has valid; force invalid via override)
  var r4 = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: [fdem(dk(dl, 'fa'), ['WH-FAC'], { requiredByDate: '2026-13-40' })] });
  eq(r4.issues[0].reason, 'MISSING_OR_INVALID_REQUIRED_BY_DATE', 'F5 invalid requiredByDate → issue (fail closed, no allocator throw)');
  // factory conservation
  eq([r.factoryAllocation.totalAllocatedQty + r.factoryAllocation.totalUnallocatedDemandQty === r.factoryAllocation.totalDemandQty], [true], 'F6 factory demand conservation');
})();

// ==========================================================================
section('B. blocked input propagation (Ledger conflicts surfaced, not reinterpreted)');
(function () {
  // blocked demand: same key different qty → BLOCKED_CONFLICT
  var dlB = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100), demandEntry('d1', 'WH-3PL', 'AMAZON_US', 120)]);
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  var rb = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dlB, supplyLedger: sl, receiverFacts: [recv('R1', dk(dlB, 'd1'), ['THREE_PL'])] });
  ok(rb.blockedInputs.some(function (x) { return x.kind === 'DEMAND' && x.reason === 'DEMAND_SOURCE_QTY_CONFLICT'; }), 'B1 blocked demand surfaced (not turned into 0 demand)');
  eq(rb.overseasInput, null, 'B1b blocked demand excluded → no receiver → no overseas allocation');
  // blocked supply pool: same lineage different qty → PHYSICAL_POOL_QTY_CONFLICT
  var slB = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 100), supplyEntry('s1', 'WH-3PL', 'THREE_PL', 120)]);
  var dl = buildDL([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)]);
  var rs = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: slB, receiverFacts: [recv('R1', dk(dl, 'd1'), ['THREE_PL'])] });
  ok(rs.blockedInputs.some(function (x) { return x.kind === 'SUPPLY' && x.reason === 'PHYSICAL_POOL_QTY_CONFLICT'; }), 'B2 blocked supply pool surfaced + excluded');
  eq(rs.overseasAllocation.totalSupplyQty, 0, 'B2b blocked pool excluded from allocator supply (valid subset still allocates)');
})();

// ==========================================================================
section('Z. missing / zero + error + purity');
(function () {
  var dl = buildDL([demandEntry('d0', 'WH-3PL', 'AMAZON_US', 0)]);
  var sl = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 0)]);
  var z = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd0'), ['THREE_PL'], { survivalNeedQty: 0, allocationPriority: 0, demandWeight: 0 })] });
  eq([z.ready, z.overseasInput.receivers[0].demandQty, z.overseasAllocation.totalAllocatedQty], [true, 0, 0], 'Z1 explicit zero demand/supply/survival/priority/weight all valid, 0 allocated');
  // malformed structural → TypeError
  throwsType(function () { SF.projectAllocationInputs(null); }, 'Z2 null input → TypeError');
  throwsType(function () { SF.projectAllocationInputs({ identity: IDENTITY }); }, 'Z3 missing demandLedger.entries → TypeError');
  throwsType(function () { SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [42] }); }, 'Z4 non-object receiverFact → TypeError');
  // purity
  var input = { identity: IDENTITY, demandLedger: dl, supplyLedger: sl, receiverFacts: [recv('R1', dk(dl, 'd0'), ['THREE_PL'], { survivalNeedQty: 0 })] };
  var snap = JSON.stringify(input);
  var a1 = SF.projectAllocationInputs(input);
  ok(JSON.stringify(input) === snap, 'Z5 input not mutated');
  var a2 = SF.projectAllocationInputs(input);
  eq(a1, a2, 'Z6 repeat deep-equal (deterministic)');
  ok(a1 !== a2 && a1.overseasInput !== a2.overseasInput, 'Z7 fresh result objects');
  a1.issues.push({ tampered: 1 });
  eq(SF.projectAllocationInputs(input).issues.length, 0, 'Z8 mutating a prior result does not leak');
  // permutation invariance of receiver order
  var dlp = buildDL([demandEntry('p1', 'WH-3PL', 'MP-A', 40), demandEntry('p2', 'WH-3PL', 'MP-B', 60)]);
  var slp = buildSL([supplyEntry('s1', 'WH-3PL', 'THREE_PL', 200)]);
  var order1 = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dlp, supplyLedger: slp, receiverFacts: [recv('RA', dk(dlp, 'p1'), ['THREE_PL'], { marketplace: 'MP-A' }), recv('RB', dk(dlp, 'p2'), ['THREE_PL'], { marketplace: 'MP-B' })] });
  var order2 = SF.projectAllocationInputs({ identity: IDENTITY, demandLedger: dlp, supplyLedger: slp, receiverFacts: [recv('RB', dk(dlp, 'p2'), ['THREE_PL'], { marketplace: 'MP-B' }), recv('RA', dk(dlp, 'p1'), ['THREE_PL'], { marketplace: 'MP-A' })] });
  eq(order1.overseasAllocation.totalAllocatedQty, order2.overseasAllocation.totalAllocatedQty, 'Z9 permutation-invariant allocation total');
  eq(order1.lineage, order2.lineage, 'Z10 permutation-invariant lineage');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1L Allocation Input source-projection assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
