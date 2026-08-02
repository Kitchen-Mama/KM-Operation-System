// Kitchen Mama Operation System — Demand / Supply Ledger pure runtime tests (Round 9B).
// Run: node assets/tests/supply-planning-ledgers.test.js
// Exercises the frozen §39 contract implemented in assets/js/core/supply-planning-ledgers.js.
// Pure Node, no DOM/DB/Runtime. Canonical literal expectations only (no in-test recomputation of the engine).

'use strict';
var L = require('../js/core/supply-planning-ledgers.js');
var buildDemandLedger = L.buildDemandLedger;
var buildSupplyLedger = L.buildSupplyLedger;

var fail = 0, pass = 0;
function ok(cond, label) { if (!cond) { fail++; console.error('FAIL ' + label); } else { pass++; console.log('ok   ' + label); } }
function eq(actual, expected, label) {
  var A = JSON.stringify(actual), E = JSON.stringify(expected);
  if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); }
  else { pass++; console.log('ok   ' + label); }
}
function throwsType(fn, label) {
  try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ', expected TypeError)'); return; }
  fail++; console.error('FAIL ' + label + ' (no throw)');
}
function throwsRange(fn, label) {
  try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; console.log('ok   ' + label); return; } fail++; console.error('FAIL ' + label + ' (threw ' + (e && e.name) + ', expected RangeError)'); return; }
  fail++; console.error('FAIL ' + label + ' (no throw)');
}

// --- fixtures --------------------------------------------------------------
function d(over) {
  var base = { demandType: 'REGULAR', masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US',
    destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', requiredByDate: '2026-08-20', eventId: undefined,
    sourceRef: 'FC-1', quantity: 100 };
  var o = {}; for (var k in base) o[k] = base[k]; if (over) for (var j in over) o[j] = over[j]; return o;
}
function s(over) {
  var base = { supplyLineageRef: 'SHIP-1', masterSku: 'GA0450', company: 'KM', warehouseId: 'US-3PL-1',
    poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 };
  var o = {}; for (var k in base) o[k] = base[k]; if (over) for (var j in over) o[j] = over[j]; return o;
}

// ==========================================================================
console.log('\n== buildDemandLedger ==');

// empty
eq(buildDemandLedger({ entries: [] }), { ledgerType: 'DEMAND_LEDGER', entries: [], totalEffectiveDemandQty: 0, blockedCount: 0 }, 'D empty entries → empty ledger');

// each demand type counted
(function () {
  var r = buildDemandLedger({ entries: [d({ demandType: 'REGULAR', sourceRef: 'R1', quantity: 10 })] });
  eq(r.totalEffectiveDemandQty, 10, 'D REGULAR counted'); eq(r.entries[0].state, 'COUNTED', 'D REGULAR state COUNTED'); eq(r.entries[0].eventId, null, 'D non-event eventId null');
})();
eq(buildDemandLedger({ entries: [d({ demandType: 'SALES_RUN_RATE', sourceRef: 'S1', quantity: 20 })] }).totalEffectiveDemandQty, 20, 'D SALES_RUN_RATE counted');
eq(buildDemandLedger({ entries: [d({ demandType: 'SAFETY', sourceRef: 'SF1', quantity: 30 })] }).totalEffectiveDemandQty, 30, 'D SAFETY counted');

// one special event
(function () {
  var r = buildDemandLedger({ entries: [d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 300 })] });
  eq(r.totalEffectiveDemandQty, 300, 'D one SPECIAL_EVENT counted'); eq(r.entries[0].eventId, 'EVT-A', 'D event eventId preserved');
})();

// #27 two different events same month remain separate
(function () {
  var r = buildDemandLedger({ entries: [
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 300 }),
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-B', quantity: 200 })
  ] });
  eq(r.entries.length, 2, 'D #27 two distinct events → two entries');
  eq(r.totalEffectiveDemandQty, 500, 'D #27 distinct events summed (500)');
  eq(r.blockedCount, 0, 'D #27 no conflict');
})();

// #27 same event repeated identically counts once
(function () {
  var r = buildDemandLedger({ entries: [
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 300, marketplace: 'AMAZON_US' }),
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 300, marketplace: 'SHOPIFY' })
  ] });
  eq(r.entries.length, 1, 'D #27 same event (diff marketplace) counts once');
  eq(r.totalEffectiveDemandQty, 300, 'D #27 duplicate event not doubled (300)');
})();

// #27 same event conflicting quantity → BLOCKED
(function () {
  var r = buildDemandLedger({ entries: [
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 300 }),
    d({ demandType: 'SPECIAL_EVENT', eventId: 'EVT-A', quantity: 250 })
  ] });
  eq(r.entries.length, 1, 'D #27 conflict → one entry');
  eq(r.entries[0].state, 'BLOCKED_CONFLICT', 'D #27 conflict state');
  eq(r.entries[0].reason, 'DEMAND_EVENT_QTY_CONFLICT', 'D #27 conflict reason');
  eq(r.entries[0].effectiveDemandQty, 0, 'D #27 conflict qty 0');
  eq(r.totalEffectiveDemandQty, 0, 'D #27 conflict total 0');
  eq(r.blockedCount, 1, 'D #27 blockedCount 1');
})();

// non-event duplicate by same sourceRef counts once
(function () {
  var r = buildDemandLedger({ entries: [ d({ sourceRef: 'R1', quantity: 40 }), d({ sourceRef: 'R1', quantity: 40, marketplace: 'SHOPIFY' }) ] });
  eq(r.entries.length, 1, 'D non-event same sourceRef counts once'); eq(r.totalEffectiveDemandQty, 40, 'D non-event dedup qty 40');
})();

// non-event conflicting quantity blocks
(function () {
  var r = buildDemandLedger({ entries: [ d({ sourceRef: 'R1', quantity: 40 }), d({ sourceRef: 'R1', quantity: 55 }) ] });
  eq(r.entries[0].state, 'BLOCKED_CONFLICT', 'D non-event conflict blocked');
  eq(r.entries[0].reason, 'DEMAND_SOURCE_QTY_CONFLICT', 'D non-event conflict reason');
})();

// marketplace difference does not create physical duplicate for same key
(function () {
  var r = buildDemandLedger({ entries: [ d({ sourceRef: 'R9', quantity: 70, marketplace: 'AMAZON_US' }), d({ sourceRef: 'R9', quantity: 70, marketplace: 'WALMART' }) ] });
  eq(r.entries.length, 1, 'D marketplace not part of identity (dedup)'); eq(r.totalEffectiveDemandQty, 70, 'D marketplace dedup qty 70');
})();

// zero quantity valid
eq(buildDemandLedger({ entries: [ d({ sourceRef: 'Z', quantity: 0 }) ] }).entries[0].effectiveDemandQty, 0, 'D zero quantity valid (0)');

// stable ordering + permutation invariance
(function () {
  var a = [ d({ sourceRef: 'A', quantity: 1, requiredByDate: '2026-09-01' }), d({ sourceRef: 'B', quantity: 2, requiredByDate: '2026-08-01' }), d({ demandType: 'SPECIAL_EVENT', eventId: 'E1', quantity: 3, requiredByDate: '2026-08-01' }) ];
  var r1 = buildDemandLedger({ entries: a });
  var r2 = buildDemandLedger({ entries: [a[2], a[0], a[1]] });
  eq(r1, r2, 'D permutation invariance (identical output)');
  eq(r1.entries.map(function (e) { return e.requiredByDate; }), ['2026-08-01', '2026-08-01', '2026-09-01'], 'D sorted by requiredByDate');
  eq(r1.entries[0].demandType <= r1.entries[1].demandType, true, 'D tie-break by demandType');
})();

// totalEffectiveDemandQty + blockedCount aggregate
(function () {
  var r = buildDemandLedger({ entries: [
    d({ sourceRef: 'K1', quantity: 10 }), d({ sourceRef: 'K2', quantity: 20 }),
    d({ sourceRef: 'K3', quantity: 5 }), d({ sourceRef: 'K3', quantity: 6 })
  ] });
  eq(r.totalEffectiveDemandQty, 30, 'D total counts only COUNTED (30)'); eq(r.blockedCount, 1, 'D blockedCount aggregate (1)');
})();

// input immutability + fresh nested output
(function () {
  var input = { entries: [ d({ sourceRef: 'IMM', quantity: 12 }) ] };
  var frozen = JSON.stringify(input);
  var r = buildDemandLedger(input);
  eq(JSON.stringify(input), frozen, 'D input not mutated');
  r.entries[0].effectiveDemandQty = 999; r.entries.push({});
  var r2 = buildDemandLedger(input);
  eq(r2.entries.length, 1, 'D mutating one output does not affect a later call'); eq(r2.entries[0].effectiveDemandQty, 12, 'D fresh output per call');
  ok(r.entries !== r2.entries, 'D fresh entries array each call');
})();

// TypeError matrix (Demand)
throwsType(function () { buildDemandLedger(null); }, 'D TypeError input null');
throwsType(function () { buildDemandLedger([]); }, 'D TypeError input array');
throwsType(function () { buildDemandLedger({ entries: {} }); }, 'D TypeError entries non-array');
throwsType(function () { buildDemandLedger({ entries: [null] }); }, 'D TypeError entry null');
throwsType(function () { buildDemandLedger({ entries: [d({ masterSku: '' })] }); }, 'D TypeError empty masterSku');
throwsType(function () { buildDemandLedger({ entries: [d({ company: 5 })] }); }, 'D TypeError non-string company');
throwsType(function () { buildDemandLedger({ entries: [d({ demandType: 42 })] }); }, 'D TypeError non-string demandType');
throwsType(function () { buildDemandLedger({ entries: [d({ requiredByDate: 20260820 })] }); }, 'D TypeError non-string requiredByDate');
throwsType(function () { buildDemandLedger({ entries: [d({ quantity: '100' })] }); }, 'D TypeError non-number quantity');
throwsType(function () { buildDemandLedger({ entries: [d({ country: 7 })] }); }, 'D TypeError non-string/null country');
throwsType(function () { buildDemandLedger({ entries: [d({ demandType: 'SPECIAL_EVENT', eventId: undefined })] }); }, 'D TypeError SPECIAL_EVENT missing eventId');
throwsType(function () { buildDemandLedger({ entries: [d({ demandType: 'SPECIAL_EVENT', eventId: '' })] }); }, 'D TypeError SPECIAL_EVENT empty eventId');

// RangeError matrix (Demand)
throwsRange(function () { buildDemandLedger({ entries: [d({ demandType: 'MYSTERY' })] }); }, 'D RangeError bad demandType enum');
throwsRange(function () { buildDemandLedger({ entries: [d({ quantity: NaN })] }); }, 'D RangeError NaN quantity');
throwsRange(function () { buildDemandLedger({ entries: [d({ quantity: Infinity })] }); }, 'D RangeError Infinity quantity');
throwsRange(function () { buildDemandLedger({ entries: [d({ quantity: -1 })] }); }, 'D RangeError negative quantity');
throwsRange(function () { buildDemandLedger({ entries: [d({ requiredByDate: '2026-8-20' })] }); }, 'D RangeError non-strict date');
throwsRange(function () { buildDemandLedger({ entries: [d({ requiredByDate: '2026-02-30' })] }); }, 'D RangeError non-real date');

// extra properties ignored (no throw, no effect)
eq(buildDemandLedger({ entries: [d({ sourceRef: 'X', quantity: 9, extraJunk: 'ignore-me' })] }).totalEffectiveDemandQty, 9, 'D unexpected extra property ignored');

// ==========================================================================
console.log('\n== buildSupplyLedger ==');

// empty
eq(buildSupplyLedger({ entries: [] }), { ledgerType: 'SUPPLY_LEDGER', pools: [], totalEffectiveSupplyQty: 0, blockedCount: 0 }, 'S empty entries → empty ledger');

// each poolType
eq(buildSupplyLedger({ entries: [s({ supplyLineageRef: 'F1', poolType: 'FBA', quantity: 50 })] }).pools[0].poolType, 'FBA', 'S FBA poolType');
eq(buildSupplyLedger({ entries: [s({ supplyLineageRef: 'T1', poolType: 'THREE_PL', quantity: 60 })] }).pools[0].poolType, 'THREE_PL', 'S THREE_PL poolType');
eq(buildSupplyLedger({ entries: [s({ supplyLineageRef: 'C1', poolType: 'FACTORY', warehouseId: 'CN_YOUXIN', quantity: 70 })] }).pools[0].poolType, 'FACTORY', 'S FACTORY poolType');

// active bucket contribution table
['COMMITTED_PRODUCTION', 'APPROVED_SHIPPING_PLAN', 'SHIPPED_IN_TRANSIT', 'DELIVERED_NOT_RECEIVED', 'RECEIVED_NOT_REFLECTED', 'CURRENT_STOCK'].forEach(function (b, i) {
  var r = buildSupplyLedger({ entries: [s({ supplyLineageRef: 'AB-' + i, lifecycleBucket: b, quantity: 100 })] });
  eq(r.totalEffectiveSupplyQty, 100, 'S active bucket ' + b + ' contributes 100');
  eq(r.pools[0].byLifecycleBucket[b], 100, 'S active bucket ' + b + ' visible in byLifecycleBucket');
});
// excluded buckets contribute 0 (visible)
['DRAFT', 'CANCELLED_INVALID', 'CORRECTION_REVERSAL'].forEach(function (b, i) {
  var r = buildSupplyLedger({ entries: [s({ supplyLineageRef: 'EX-' + i, lifecycleBucket: b, quantity: 100 })] });
  eq(r.totalEffectiveSupplyQty, 0, 'S excluded bucket ' + b + ' contributes 0');
  eq(r.pools[0].byLifecycleBucket[b], 100, 'S excluded bucket ' + b + ' still visible (qty 100)');
});

// same lineage identical duplicate counts once
(function () {
  var r = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'DUP', quantity: 100 }), s({ supplyLineageRef: 'DUP', quantity: 100 }) ] });
  eq(r.totalEffectiveSupplyQty, 100, 'S identical duplicate lineage counts once (100)');
  eq(r.pools[0].lineageRefs, ['DUP'], 'S dedup lineageRefs = [DUP]');
})();

// #17 same lineage in two active buckets → SUPPLY_LINEAGE_CONFLICT (0, not 200)
(function () {
  var r = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'L17', lifecycleBucket: 'SHIPPED_IN_TRANSIT', quantity: 100 }), s({ supplyLineageRef: 'L17', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 }) ] });
  eq(r.pools[0].state, 'BLOCKED_CONFLICT', 'S #17 same lineage two buckets blocked');
  eq(r.pools[0].reason, 'SUPPLY_LINEAGE_CONFLICT', 'S #17 reason SUPPLY_LINEAGE_CONFLICT');
  eq(r.totalEffectiveSupplyQty, 0, 'S #17 blocked total 0 (not 200/300)');
  eq(r.blockedCount, 1, 'S #17 blockedCount 1');
})();

// #17 one lineage in one bucket = 100 (counted once)
eq(buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'L17b', lifecycleBucket: 'SHIPPED_IN_TRANSIT', quantity: 100 }) ] }).totalEffectiveSupplyQty, 100, 'S #17 single-bucket lineage = 100');

// distinct lineages same pool+bucket → sum
eq(buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'A', quantity: 100 }), s({ supplyLineageRef: 'B', quantity: 100 }) ] }).totalEffectiveSupplyQty, 200, 'S distinct lineages same pool+bucket sum (200)');

// #15 delivered-not-received does not become CURRENT_STOCK
(function () {
  var r = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'D15', lifecycleBucket: 'DELIVERED_NOT_RECEIVED', quantity: 100 }) ] });
  eq(r.pools[0].byLifecycleBucket.DELIVERED_NOT_RECEIVED, 100, 'S #15 delivered bucket present');
  eq(r.pools[0].byLifecycleBucket.CURRENT_STOCK, undefined, 'S #15 not current stock');
  eq(r.totalEffectiveSupplyQty, 100, 'S #15 delivered contributes as supply (100), non-current-stock');
})();

// #16 receipt posted lifecycle (received-not-reflected / current stock)
(function () {
  var r = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'R16', lifecycleBucket: 'RECEIVED_NOT_REFLECTED', quantity: 100 }) ] });
  eq(r.pools[0].byLifecycleBucket.RECEIVED_NOT_REFLECTED, 100, 'S #16 received-not-reflected present');
  eq(r.totalEffectiveSupplyQty, 100, 'S #16 received-not-reflected contributes (100)');
  var r2 = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'R16b', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 }) ] });
  eq(r2.pools[0].byLifecycleBucket.CURRENT_STOCK, 100, 'S #16 current stock present');
})();

// canonical 100-unit lifecycle: each single-stage representation totals 100 (never 200/300)
['COMMITTED_PRODUCTION', 'APPROVED_SHIPPING_PLAN', 'SHIPPED_IN_TRANSIT', 'DELIVERED_NOT_RECEIVED', 'RECEIVED_NOT_REFLECTED', 'CURRENT_STOCK'].forEach(function (b) {
  eq(buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'LC', lifecycleBucket: b, quantity: 100 }) ] }).totalEffectiveSupplyQty, 100, 'S 100-unit lifecycle stage ' + b + ' = 100');
});

// #32 one physical pool copied across 3 marketplaces (same lineage) → 1000, not 3000
(function () {
  var r = buildSupplyLedger({ entries: [
    s({ supplyLineageRef: 'POOL-32', quantity: 1000 }),
    s({ supplyLineageRef: 'POOL-32', quantity: 1000 }),
    s({ supplyLineageRef: 'POOL-32', quantity: 1000 })
  ] });
  eq(r.pools.length, 1, 'S #32 one physical pool');
  eq(r.totalEffectiveSupplyQty, 1000, 'S #32 pool copied across marketplaces stays 1000 (not 3000)');
  eq(r.pools[0].byLifecycleBucket.CURRENT_STOCK, 1000, 'S #32 byLifecycleBucket 1000');
})();

// #32 conflicting snapshots for same physical pool → PHYSICAL_POOL_QTY_CONFLICT
(function () {
  var r = buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'POOL-32C', quantity: 1000 }), s({ supplyLineageRef: 'POOL-32C', quantity: 900 }) ] });
  eq(r.pools[0].state, 'BLOCKED_CONFLICT', 'S #32 conflicting snapshot blocked');
  eq(r.pools[0].reason, 'PHYSICAL_POOL_QTY_CONFLICT', 'S #32 reason PHYSICAL_POOL_QTY_CONFLICT');
  eq(r.totalEffectiveSupplyQty, 0, 'S #32 conflict total 0 (not summed/picked)');
})();

// #10/#11 FBA and THREE_PL stay separate; platform provenance does not reclassify THREE_PL as FBA
(function () {
  var r = buildSupplyLedger({ entries: [
    s({ supplyLineageRef: 'FBA-1', poolType: 'FBA', quantity: 200 }),
    s({ supplyLineageRef: 'RES-1', poolType: 'THREE_PL', quantity: 500 })
  ] });
  eq(r.pools.length, 2, 'S #10/#11 FBA and THREE_PL are two separate pools');
  var byType = {}; r.pools.forEach(function (p) { byType[p.poolType] = p.effectiveSupplyQty; });
  eq(byType.FBA, 200, 'S #10 FBA pool 200');
  eq(byType.THREE_PL, 500, 'S #11 THREE_PL reserve 500 (not reclassified as FBA)');
  eq(r.totalEffectiveSupplyQty, 700, 'S #10/#11 total 700, buckets never merged');
})();

// FACTORY pool remains separate
(function () {
  var r = buildSupplyLedger({ entries: [
    s({ supplyLineageRef: 'FAC-1', poolType: 'FACTORY', warehouseId: 'CN_YOUXIN', quantity: 300 }),
    s({ supplyLineageRef: 'TPL-1', poolType: 'THREE_PL', quantity: 100 })
  ] });
  eq(r.pools.length, 2, 'S FACTORY pool separate from THREE_PL');
})();

// stable pool ordering + lineageRefs sort + permutation invariance
(function () {
  var arr = [
    s({ supplyLineageRef: 'Z', warehouseId: 'W2', quantity: 10 }),
    s({ supplyLineageRef: 'A', warehouseId: 'W1', quantity: 20 }),
    s({ supplyLineageRef: 'M', warehouseId: 'W1', quantity: 5 })
  ];
  var r1 = buildSupplyLedger({ entries: arr });
  var r2 = buildSupplyLedger({ entries: [arr[2], arr[0], arr[1]] });
  eq(r1, r2, 'S permutation invariance (identical output)');
  var keys = r1.pools.map(function (p) { return p.poolKey; });
  eq(keys.slice().sort(), keys, 'S pools sorted by poolKey');
  var w1 = r1.pools.filter(function (p) { return p.warehouseId === 'W1'; })[0];
  eq(w1.lineageRefs, ['A', 'M'], 'S lineageRefs sorted ascending');
  eq(w1.effectiveSupplyQty, 25, 'S W1 pool sums distinct lineages (25)');
})();

// zero quantity valid (supply)
eq(buildSupplyLedger({ entries: [ s({ supplyLineageRef: 'ZQ', quantity: 0 }) ] }).totalEffectiveSupplyQty, 0, 'S zero quantity valid (0)');

// input immutability + fresh nested output
(function () {
  var input = { entries: [ s({ supplyLineageRef: 'IMM-S', quantity: 44 }) ] };
  var frozen = JSON.stringify(input);
  var r = buildSupplyLedger(input);
  eq(JSON.stringify(input), frozen, 'S input not mutated');
  r.pools[0].effectiveSupplyQty = 999; r.pools[0].byLifecycleBucket.CURRENT_STOCK = 999; r.pools.push({});
  var r2 = buildSupplyLedger(input);
  eq(r2.pools.length, 1, 'S mutating one output does not affect a later call');
  eq(r2.pools[0].effectiveSupplyQty, 44, 'S fresh output per call');
  ok(r.pools !== r2.pools, 'S fresh pools array each call');
  ok(r.pools[0].byLifecycleBucket !== r2.pools[0].byLifecycleBucket, 'S fresh byLifecycleBucket each call');
})();

// TypeError matrix (Supply)
throwsType(function () { buildSupplyLedger(null); }, 'S TypeError input null');
throwsType(function () { buildSupplyLedger({ entries: 5 }); }, 'S TypeError entries non-array');
throwsType(function () { buildSupplyLedger({ entries: [null] }); }, 'S TypeError entry null');
throwsType(function () { buildSupplyLedger({ entries: [s({ supplyLineageRef: '' })] }); }, 'S TypeError empty supplyLineageRef');
throwsType(function () { buildSupplyLedger({ entries: [s({ warehouseId: 3 })] }); }, 'S TypeError non-string warehouseId');
throwsType(function () { buildSupplyLedger({ entries: [s({ poolType: 9 })] }); }, 'S TypeError non-string poolType');
throwsType(function () { buildSupplyLedger({ entries: [s({ lifecycleBucket: 9 })] }); }, 'S TypeError non-string lifecycleBucket');
throwsType(function () { buildSupplyLedger({ entries: [s({ quantity: '100' })] }); }, 'S TypeError non-number quantity');

// RangeError matrix (Supply)
throwsRange(function () { buildSupplyLedger({ entries: [s({ poolType: 'HYBRID' })] }); }, 'S RangeError bad poolType enum');
throwsRange(function () { buildSupplyLedger({ entries: [s({ lifecycleBucket: 'ARRIVED' })] }); }, 'S RangeError bad lifecycleBucket enum');
throwsRange(function () { buildSupplyLedger({ entries: [s({ quantity: NaN })] }); }, 'S RangeError NaN quantity');
throwsRange(function () { buildSupplyLedger({ entries: [s({ quantity: -Infinity })] }); }, 'S RangeError -Infinity quantity');
throwsRange(function () { buildSupplyLedger({ entries: [s({ quantity: -5 })] }); }, 'S RangeError negative quantity');

// extra properties ignored
eq(buildSupplyLedger({ entries: [s({ supplyLineageRef: 'XP', quantity: 8, marketplace: 'AMAZON_US', siteSku: 'SITE-1' })] }).totalEffectiveSupplyQty, 8, 'S unexpected extra property ignored (marketplace/siteSku not identity)');

// determinism: repeated identical call
eq(buildSupplyLedger({ entries: [s({ supplyLineageRef: 'DET', quantity: 123 })] }), buildSupplyLedger({ entries: [s({ supplyLineageRef: 'DET', quantity: 123 })] }), 'S determinism: repeated identical input → identical output');
eq(buildDemandLedger({ entries: [d({ sourceRef: 'DET', quantity: 123 })] }), buildDemandLedger({ entries: [d({ sourceRef: 'DET', quantity: 123 })] }), 'D determinism: repeated identical input → identical output');

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 9B Demand/Supply Ledger assertions passed (' + pass + ' assertions).');
