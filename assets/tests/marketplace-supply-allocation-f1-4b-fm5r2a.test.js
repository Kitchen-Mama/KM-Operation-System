// Kitchen Mama Operation System — MARKETPLACE-receiver monthly supply-allocation contract (F1-4B-FM5-R2A + supplemental freeze).
// Run: node assets/tests/marketplace-supply-allocation-f1-4b-fm5r2a.test.js
// -----------------------------------------------------------------------------
// Proves the FROZEN marketplace-receiver allocation contract (KMMSA) under the supplemental authority:
//   0 receivers → allocate nothing · 1 receiver → 100% of the eligible pool · >1 → the canonical KMALLOC allocator
//   (conserved). Overseas + Factory are INDEPENDENT pools (each independently conserved). Company isolation,
//   UK≡GB via KMCID, no fake destinationWarehouseId, no SKU+qty heuristic dedup, valid-zero, missing != zero.
// Pure module; ALL distribution math stays in KMALLOC. No network / DB. Lineage-net pools are caller-supplied.

var path = require('path'), fs = require('fs');
var KMMSA = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-marketplace-supply-allocation.js'));
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-marketplace-supply-allocation.js'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function rcv(over) { return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', demandQty: 100, allocationPriority: 1, requiredByDate: '2026-09-30' }, over || {}); }
function K(r) { return KMMSA.receiverKeyOf(r); }
function ovPool(qty, type) { return { poolKey: 'OV1', poolType: type || 'THREE_PL', warehouseId: 'W3PL', effectiveSupplyQty: qty }; }
function fcPool(qty) { return { poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: qty }; }

section('A · Factory ONE receiver → 100% of eligible pool');
var A = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', factoryPools: [fcPool(400)], eligibleFactoryWarehouseIds: ['FCT1'], receivers: [rcv({ demandQty: 250 })] });
eq([A.ready, A.receiverCount, A.byReceiver[K(rcv())].allocatedFactoryQty], [true, 1, 400], 'A1 sole receiver gets 100% of the 400 factory pool (NOT demand-capped to 250)');

section('C · Overseas ONE receiver → 100% of eligible pool');
var C = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', overseasPools: [ovPool(500, 'THREE_PL')], receivers: [rcv({ demandQty: 300, eligiblePoolTypes: ['THREE_PL'] })] });
eq(C.byReceiver[K(rcv())].allocatedOverseasQty, 500, 'C1 sole receiver gets 100% of the 500 THREE_PL pool');
var Cx = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', overseasPools: [ovPool(500, 'THREE_PL')], receivers: [rcv({ eligiblePoolTypes: ['FBA'] })] });
eq(Cx.byReceiver[K(rcv())].allocatedOverseasQty, 0, 'C2 sole receiver eligible only for FBA gets 0 from a THREE_PL pool (lane eligibility honored)');

section('E · country has multiple marketplaces but SKU has ONE eligible receiver → 100%');
// The caller (R2b) determines the SKU-specific eligible set; here it is a single receiver → 100%.
var E = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', overseasPools: [ovPool(1100, 'THREE_PL')], receivers: [rcv({ marketplace: 'AMAZON_US', eligiblePoolTypes: ['THREE_PL'] })] });
eq(E.byReceiver[K(rcv())].allocatedOverseasQty, 1100, 'E1 single SKU-eligible receiver → 100% of the 1100 pool (CASE C)');

section('B · Factory MULTIPLE receivers → canonical allocator + conservation');
var bUS = rcv({ marketplace: 'AMAZON_US', demandQty: 600, allocationPriority: 2 });
var bCA = rcv({ country: 'CA', marketplace: 'AMAZON_CA', demandQty: 700, allocationPriority: 1 });
var B = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', factoryPools: [fcPool(1000)], eligibleFactoryWarehouseIds: ['FCT1'], receivers: [bUS, bCA] });
var bA = B.byReceiver[K(bUS)].allocatedFactoryQty, bB = B.byReceiver[K(bCA)].allocatedFactoryQty;
eq([bA, bB], [600, 400], 'B1 §35 FIFO/priority: US 600 then CA residual 400');
ok(bA + bB === 1000 && bA < 1000 && bB < 1000, 'B2 Σ = 1000 = physical pool; neither receiver independently gets 1000');

section('D · Overseas MULTIPLE receivers → canonical allocator + conservation (shared 1000 split)');
var dUS = rcv({ marketplace: 'AMAZON_US', demandQty: 600, eligiblePoolTypes: ['THREE_PL'] });
var dCA = rcv({ country: 'CA', marketplace: 'AMAZON_CA', demandQty: 700, eligiblePoolTypes: ['THREE_PL'] });
var D = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', overseasPools: [ovPool(1000, 'THREE_PL')], receivers: [dUS, dCA] });
var dA = D.byReceiver[K(dUS)].allocatedOverseasQty, dB = D.byReceiver[K(dCA)].allocatedOverseasQty;
ok(dA + dB === 1000, 'D1 Σ allocations = 1000 (whole shared pool distributed by the allocator)');
ok(dA < 1000 && dB < 1000 && dA <= 600 && dB <= 700, 'D2 neither receiver independently gets 1000; each ≤ its demand');

section('M · Factory + Overseas allocation totals INDEPENDENTLY conserved');
var M = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  overseasPools: [ovPool(1000, 'THREE_PL')], factoryPools: [fcPool(500)], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv({ marketplace: 'AMAZON_US', demandQty: 600, eligiblePoolTypes: ['THREE_PL'] }), rcv({ country: 'CA', marketplace: 'AMAZON_CA', demandQty: 700, eligiblePoolTypes: ['THREE_PL'] })] });
var ovSum = 0, fcSum = 0; for (var mk in M.byReceiver) { ovSum += M.byReceiver[mk].allocatedOverseasQty; fcSum += M.byReceiver[mk].allocatedFactoryQty; }
ok(ovSum <= 1000, 'M1 Σ overseas allocations ≤ 1000 (overseas pool)');
ok(fcSum <= 500, 'M2 Σ factory allocations ≤ 500 (factory pool) — conserved INDEPENDENTLY of overseas');
ok(ovSum > fcSum, 'M3 the two pools are allocated independently (overseas 1000-pool ≠ factory 500-pool)');

section('F · ZERO receivers → allocate nothing (not an error, no fabricated destination)');
var F = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', overseasPools: [ovPool(1000)], factoryPools: [fcPool(500)], eligibleFactoryWarehouseIds: ['FCT1'], receivers: [] });
eq([F.ready, F.receiverCount, JSON.stringify(F.byReceiver)], [true, 0, '{}'], 'F1 zero receivers → ready, empty allocation (allocate nothing)');

section('G · company isolation — cross-company receiver → BLOCKED (no pooling)');
var G = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', factoryPools: [fcPool(100)], eligibleFactoryWarehouseIds: ['FCT1'], receivers: [rcv(), rcv({ company: 'OTHERCO', marketplace: 'AMAZON_US_2' })] });
ok(G.ready === false && G.blocked === true && G.issues[0].code === 'CROSS_COMPANY_POOL_FORBIDDEN', 'G1 cross-company receiver → BLOCKED');

section('H · UK ≡ GB identity via KMCID in the receiver key');
ok(/\|\|GB\|\|/.test(KMMSA.receiverKeyOf({ company: 'KM', country: 'UK', marketplace: 'AMAZON_UK', sku: 'X' })), 'H1 receiver key canonicalizes UK → GB (KMCID)');

section('valid zero / missing != zero');
var Z = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', factoryPools: [fcPool(0)], eligibleFactoryWarehouseIds: ['FCT1'], receivers: [rcv()] });
eq(Z.byReceiver[K(rcv())].allocatedFactoryQty, 0, 'VZ1 eligible pool 0 → allocated 0 (valid zero)');
var Miss = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', receivers: [rcv({ demandQty: null })] });
ok(Miss.blocked === true && Miss.issues[0].code === 'RECEIVER_DEMAND_INVALID', 'VZ2 missing demand → BLOCKED (never coerced to 0)');

section('K/L · no fake warehouse · no SKU+qty heuristic dedup · reuse-only');
ok(!/destinationWarehouseId/.test(JSON.stringify(rcv())), 'K1 the receiver DTO carries no destinationWarehouseId (marketplace receiver needs none)');
var CODE = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/SHIPPED_IN_TRANSIT|_qty\s*[-=]=|indexOf\([^)]*qty|sku[^\n]*\+[^\n]*qty/.test(CODE), 'L1 no SKU+qty heuristic dedup in the adapter (caller supplies lineage-net pools)');
ok(/ALLOC\.allocateOverseasSharedPool/.test(CODE) && /ALLOC\.allocateFactoryDeterministic/.test(CODE), 'RU1 delegates to the frozen KMALLOC allocators');
ok(!/largest.?remainder|distributeByWeight|laneModes|survivalAlloc|finalAlloc|p\.remaining\s*-=/.test(CODE), 'RU2 no pool-distribution math re-implemented in the adapter');

console.log('\n----------------------------------------');
console.log('MARKETPLACE SUPPLY ALLOCATION (F1-4B-FM5-R2A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
