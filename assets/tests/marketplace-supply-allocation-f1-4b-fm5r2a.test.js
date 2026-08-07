// Kitchen Mama Operation System — MARKETPLACE-receiver monthly supply-allocation contract (F1-4B-FM5-R2A).
// Run: node assets/tests/marketplace-supply-allocation-f1-4b-fm5r2a.test.js
// -----------------------------------------------------------------------------
// Proves the FROZEN marketplace-receiver allocation contract (KMMSA): a platform_fulfilled marketplace is a valid
// MONTHLY_ORDER receiver of the Overseas / Factory shared pools with NO destination warehouse, reusing ONLY the
// frozen KMALLOC allocators (no allocation arithmetic in the adapter). Proves cross-receiver conservation,
// company isolation, UK≡GB via KMCID, eligibility filtering, waterfall (factory demand = residual after overseas),
// valid-zero, and missing != zero. Pure module; no network / DB.

var path = require('path'), fs = require('fs');
var KMMSA = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-marketplace-supply-allocation.js'));
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-marketplace-supply-allocation.js'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function rcv(over) { return Object.assign({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', demandQty: 100, allocationPriority: 1, requiredByDate: '2026-09-30' }, over || {}); }

section('1 · marketplace receiver requires NO destinationWarehouseId (input carries none)');
var r1 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  overseasPools: [{ poolKey: 'OV1', poolType: 'THREE_PL', warehouseId: 'W3PL', effectiveSupplyQty: 500 }],
  receivers: [rcv({ demandQty: 300, eligiblePoolTypes: ['THREE_PL'] })] });
ok(r1.ready === true && r1.blocked === false, 'C1 allocation succeeds with a marketplace receiver + no warehouse id');
ok(!/destinationWarehouseId/.test(JSON.stringify(rcv())), 'C2 the receiver DTO itself carries no destinationWarehouseId');
var k1 = KMMSA.receiverKeyOf(rcv());
eq(r1.byReceiver[k1].allocatedOverseasQty, 300, 'C3 eligible THREE_PL overseas allocated to the marketplace receiver (300 of 500)');

section('4/5 · overseas eligibility — ineligible pool type excluded');
var r5 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  overseasPools: [{ poolKey: 'OV1', poolType: 'THREE_PL', warehouseId: 'W3PL', effectiveSupplyQty: 500 }],
  receivers: [rcv({ demandQty: 300, eligiblePoolTypes: ['FBA'] })] });
eq(r5.byReceiver[KMMSA.receiverKeyOf(rcv())].allocatedOverseasQty, 0, 'E5 receiver eligible only for FBA gets 0 from a THREE_PL pool (lane separation)');

section('6 · factory eligible stock allocated');
var r6 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 400 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv({ demandQty: 250 })] });
eq(r6.byReceiver[KMMSA.receiverKeyOf(rcv())].allocatedFactoryQty, 250, 'F6 factory allocates 250 of 400 to the receiver');

section('14 · cross-receiver CONSERVATION (factory pool 1000; US + CA compete)');
var us = rcv({ marketplace: 'AMAZON_US', demandQty: 600, allocationPriority: 2 });
var ca = rcv({ country: 'CA', marketplace: 'AMAZON_CA', demandQty: 700, allocationPriority: 1 });
var r14 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 1000 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [us, ca] });
var aUS = r14.byReceiver[KMMSA.receiverKeyOf(us)].allocatedFactoryQty;
var aCA = r14.byReceiver[KMMSA.receiverKeyOf(ca)].allocatedFactoryQty;
ok(aUS + aCA === 1000, '14a Σ allocations = 1000 (fully distributed)');
ok(aUS <= 1000 && aCA <= 1000 && aUS < 1000 + 1 && (aUS < 1000 || aCA === 0), '14b conservation: neither receiver independently consumes the full 1000');
ok(aUS === 600 && aCA === 400, '14c §35 FIFO/priority: US(pri 2) 600 then CA gets residual 400 (never 600+700)');
ok(aUS + aCA <= 1000, '14d Σ receiver allocations <= physical eligible factory supply');

section('15 · LINEAGE-net pool (caller supplies pool already net of shipped 400 → cap 600)');
var r15 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 600 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv({ demandQty: 1000 })] });
ok(r15.byReceiver[KMMSA.receiverKeyOf(rcv({ demandQty: 1000 }))].allocatedFactoryQty <= 600, '15a allocatable factory <= 600 (never the pre-lineage 1000)');
ok(!/SHIPPED_IN_TRANSIT|shipped|_qty.*match|indexOf.*qty/.test(SRC.replace(/\/\/[^\n]*/g, '')), '15b adapter does NOT identify lineage by qty guessing (caller supplies lineage-net pools)');

section('Waterfall · factory demand = residual after overseas (frozen FM3f-1 order)');
var rw = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  overseasPools: [{ poolKey: 'OV1', poolType: 'THREE_PL', warehouseId: 'W3PL', effectiveSupplyQty: 400 }],
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 1000 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv({ demandQty: 1000, eligiblePoolTypes: ['THREE_PL'] })] });
var kw = KMMSA.receiverKeyOf(rcv({ demandQty: 1000 }));
eq(rw.byReceiver[kw].allocatedOverseasQty, 400, 'W1 overseas covers 400 first');
eq(rw.byReceiver[kw].allocatedFactoryQty, 600, 'W2 factory covers the residual 1000 − 400 = 600 (not the full 1000)');

section('9 · company isolation (cross-company → BLOCKED, no pooling)');
var r9 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 100 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv(), rcv({ company: 'OTHERCO', marketplace: 'AMAZON_US_2' })] });
ok(r9.ready === false && r9.blocked === true && r9.issues[0].code === 'CROSS_COMPANY_POOL_FORBIDDEN', '9a cross-company receiver → BLOCKED (no cross-company pooling)');

section('10 · UK ≡ GB identity via KMCID in the receiver key');
var kUK = KMMSA.receiverKeyOf({ company: 'KM', country: 'UK', marketplace: 'AMAZON_UK', sku: 'X' });
ok(/\|\|GB\|\|/.test(kUK), '10a receiver key canonicalizes UK → GB (KMCID), never raw UK');

section('11/12 · valid zero preserved; missing != zero');
var r11 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R',
  factoryPools: [{ poolKey: 'F1', warehouseId: 'FCT1', effectiveSupplyQty: 100 }], eligibleFactoryWarehouseIds: ['FCT1'],
  receivers: [rcv({ demandQty: 0 })] });
eq(r11.byReceiver[KMMSA.receiverKeyOf(rcv({ demandQty: 0 }))].allocatedFactoryQty, 0, '11a demand 0 → allocated 0 (valid zero)');
var r12 = KMMSA.allocateMarketplaceReceiverSupply({ company: 'KM', masterSku: 'CO1100-R', receivers: [rcv({ demandQty: null })] });
ok(r12.blocked === true && r12.issues[0].code === 'RECEIVER_DEMAND_INVALID', '12a missing demand → BLOCKED (never coerced to 0)');

section('Reuse-only · allocation math stays in KMALLOC (adapter has none)');
var CODE = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/ALLOC\.allocateOverseasSharedPool/.test(CODE) && /ALLOC\.allocateFactoryDeterministic/.test(CODE), 'RU1 adapter delegates to the frozen KMALLOC allocators');
// The adapter may normalize inputs (waterfall residual demand, survival cap) but must NOT re-implement the
// pool DISTRIBUTION (largest-remainder / weighted split / lane assignment) — that stays in KMALLOC.
ok(!/largest.?remainder|distributeByWeight|laneModes|survivalAlloc|finalAlloc|p\.remaining\s*-=/.test(CODE), 'RU2 no pool-distribution math re-implemented in the adapter (delegated to KMALLOC)');

console.log('\n----------------------------------------');
console.log('MARKETPLACE SUPPLY ALLOCATION (F1-4B-FM5-R2A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
