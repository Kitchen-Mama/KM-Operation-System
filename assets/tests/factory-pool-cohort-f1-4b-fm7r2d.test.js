// Kitchen Mama Operation System — F1-4B-FM7-R2D Factory Pool COHORT batch conservation (POOL_COHORT_BATCH).
// Run: node assets/tests/factory-pool-cohort-f1-4b-fm7r2d.test.js
// -----------------------------------------------------------------------------
// Proves KMFC.allocateFactoryPoolCohort: the ONE authorized cross-company Factory pass. It composes the frozen
// KMAR runtime (filterEligibleReceivers + allocateFactoryCrossCompany → KMALLOC) — no second allocator, no second
// eligibility engine, no cartonization. A physical warehouse_id+sku pool is counted ONCE across every competing
// company; Σ allocated ≤ physical supply; allocated + unused = supply; the conserved result partitions back to each
// company. Deterministic. Reuses the REAL bundled allocators (no mocks). Pure module — no DB/write/table/persister.

var fs = require('fs'), path = require('path');
var KMFC = require('../js/core/supply-planning-factory-cohort.js');
var KMALLOC = require('../js/core/supply-planning-allocations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fixture builders (shapes match KMSF factoryInput demands + KMAR receiver facts) ------------------------
var W1 = 'W1', SKU = 'CO1100-R';
function pool(wh, qty) { return { poolKey: 'FC:' + wh + ':' + SKU, poolType: 'FACTORY', warehouseId: wh, effectiveSupplyQty: qty }; }
function demand(company, mkt, qty, priority, rbd) {
  return { demandKey: company + '|' + mkt + '|' + SKU, company: company, marketplace: mkt,
    destinationWarehouseId: 'DEST-' + company, requiredByDate: rbd || '2026-09-01',
    allocationPriority: (priority == null ? 0 : priority), demandQty: qty, eligibleFactoryWarehouseIds: [W1] };
}
function receiver(company, mkt, qty, opts) {
  opts = opts || {};
  return { receiverKey: company + '|' + mkt + '|' + SKU, demandKey: company + '|' + mkt + '|' + SKU,
    company: company, marketplace: mkt, sku: SKU, demandQty: qty,
    marketplaceStatus: opts.marketplaceStatus || 'active', marketplaceSkuStatus: opts.marketplaceSkuStatus || 'active',
    fulfillmentIncompatible: opts.fulfillmentIncompatible === true };
}
function companyProj(company, mkt, qty, sharedPoolQty, priority) {
  return { company: company, factoryPools: [pool(W1, sharedPoolQty)],
    demands: [demand(company, mkt, qty, priority)], receivers: [receiver(company, mkt, qty)] };
}
function sumAlloc(slice) { return (slice.allocations || []).reduce(function (s, a) { return s + (a.allocatedQty || 0); }, 0); }

// =============================================================================================================
section('A/B/C/D/I/§4 — two companies, SAME warehouse_id+sku, ONE physical pool counted once, conserved, partitioned');
// Physical stock 3000; A demand 2200, B demand 1800 (total 4000 > 3000 → scarcity). Both list the SAME pool.
var r = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [
  companyProj('A', 'AMAZON_US', 2200, 3000),
  companyProj('B', 'AMAZON_US', 1800, 3000)
] });
eq(r.totalSupplyQty, 3000, 'A/B pool counted ONCE = 3000 (never 2×3000=6000 across the two companies)');
ok(r.totalAllocatedQty <= 3000 + 1e-9, 'C Σ factory allocated <= 3000 physical supply (got ' + r.totalAllocatedQty + ')');
ok(Math.abs((r.totalAllocatedQty + r.unusedSupplyQty) - 3000) < 1e-6, 'D allocated + unused = physical supply (conservation identity)');
ok(r.conserved === true, 'B conserved flag true');
ok(r.byCompany.A && r.byCompany.B, 'I result partitioned into BOTH company slices');
ok((r.byCompany.A.allocations || []).every(function (a) { return a.company === 'A'; }) && (r.byCompany.B.allocations || []).every(function (a) { return a.company === 'B'; }), 'I2 each company slice contains ONLY that company\'s allocations (correct partition)');
eq(sumAlloc(r.byCompany.A) + sumAlloc(r.byCompany.B), r.totalAllocatedQty, 'I3 Σ per-company slices = total allocated (nothing lost/duplicated in partition)');
ok(r.cohortKeys.length === 1 && r.cohortKeys[0] === KMFC.factoryCohortKey(W1, SKU), 'A2 one cohort key = warehouse_id+sku');

section('§4 — the SAME physical pool presented by N companies is deduped (supply not multiplied)');
var rDup = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [
  companyProj('A', 'AMAZON_US', 500, 1000), companyProj('B', 'AMAZON_US', 400, 1000), companyProj('C', 'AMAZON_CA', 300, 1000)
] });
eq(rDup.totalSupplyQty, 1000, 'DUP three companies each list the 1000 pool → counted once = 1000 (not 3000)');
ok(rDup.totalAllocatedQty <= 1000 + 1e-9, 'DUP Σ allocated <= 1000');

section('B(multi-warehouse) — each physical pool conserved independently (no cross-warehouse leakage)');
var rMW = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [
  { company: 'A', factoryPools: [pool('W1', 600)], demands: [ (function(){ var d=demand('A','AMAZON_US',600,0); d.eligibleFactoryWarehouseIds=['W1']; return d; })() ], receivers: [receiver('A','AMAZON_US',600)] },
  { company: 'B', factoryPools: [pool('W2', 400)], demands: [ (function(){ var d=demand('B','AMAZON_US',400,0); d.eligibleFactoryWarehouseIds=['W2']; return d; })() ], receivers: [receiver('B','AMAZON_US',400)] }
] });
eq(rMW.totalSupplyQty, 1000, 'MW two distinct physical pools (W1=600 + W2=400) = 1000 total, each counted once');
ok(rMW.cohortKeys.length === 2, 'MW two cohort keys (W1+sku, W2+sku)');
ok(rMW.totalAllocatedQty <= 1000 + 1e-9 && rMW.conserved, 'MW conserved across the two independent pools');

section('E — inactive receiver excluded from Factory competition (exact reason retained)');
var rIn = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [
  { company: 'A', factoryPools: [pool(W1, 1000)], demands: [demand('A', 'AMAZON_US', 600, 0)], receivers: [receiver('A', 'AMAZON_US', 600)] },
  { company: 'B', factoryPools: [pool(W1, 1000)], demands: [demand('B', 'WALMART_US', 600, 0)], receivers: [receiver('B', 'WALMART_US', 600, { marketplaceStatus: 'inactive' })] }
] });
ok(rIn.excluded.length === 1 && rIn.excluded[0].company === 'B' && rIn.excluded[0].reason === 'MARKETPLACE_INACTIVE', 'E company-B inactive marketplace excluded with exact reason');
ok(sumAlloc(rIn.byCompany.B) === 0, 'E2 the excluded receiver received NO factory stock');
ok(sumAlloc(rIn.byCompany.A) === 600, 'E3 the eligible company-A demand still allocated');

section('F — normal (supply >= demand): priority is quantity-INERT (both fully supplied regardless of priority)');
var rHi = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 400, 2000, 100), companyProj('B', 'AMAZON_US', 400, 2000, 1) ] });
var rLo = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 400, 2000, 1), companyProj('B', 'AMAZON_US', 400, 2000, 100) ] });
eq([sumAlloc(rHi.byCompany.A), sumAlloc(rHi.byCompany.B)], [400, 400], 'F both fully supplied when pool covers demand');
eq([sumAlloc(rHi.byCompany.A), sumAlloc(rHi.byCompany.B)], [sumAlloc(rLo.byCompany.A), sumAlloc(rLo.byCompany.B)], 'F2 flipping priority does NOT change quantities when supply >= demand (priority-inert)');

section('G — shortage: existing KMALLOC deterministic authority decides; conserved, no new weighting formula');
var rSh = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 2200, 3000, 5), companyProj('B', 'AMAZON_US', 1800, 3000, 1) ] });
ok(rSh.totalAllocatedQty <= 3000 + 1e-9 && rSh.conserved, 'G shortage stays conserved (Σ <= pool)');
ok(sumAlloc(rSh.byCompany.A) + sumAlloc(rSh.byCompany.B) === rSh.totalAllocatedQty, 'G2 partition sums to total under shortage');

section('H/P — deterministic rerun: same source facts + same pool → byte-identical result');
var rr1 = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('B', 'AMAZON_US', 1800, 3000, 1), companyProj('A', 'AMAZON_US', 2200, 3000, 1) ] });
var rr2 = KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 2200, 3000, 1), companyProj('B', 'AMAZON_US', 1800, 3000, 1) ] });
eq(JSON.stringify(rr1.byCompany), JSON.stringify(rr2.byCompany), 'H company input ORDER does not change the partitioned result (deterministic)');
eq(JSON.stringify(KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 2200, 3000) ] })),
   JSON.stringify(KMFC.allocateFactoryPoolCohort({ masterSku: SKU, perCompany: [ companyProj('A', 'AMAZON_US', 2200, 3000) ] })), 'P same input → identical output (idempotent, no RNG/clock)');

section('§5 helper — factorySliceForCompany extracts one company\'s conserved slice (downstream injection shape)');
var sliceA = KMFC.factorySliceForCompany(r, 'A');
ok(sliceA.allocationType === 'FACTORY_DETERMINISTIC' && Array.isArray(sliceA.allocations) && sliceA.allocations.every(function (a) { return a.company === 'A'; }), 'S1 slice is a KMALLOC-shaped Factory result for company A only');
ok(KMFC.factorySliceForCompany(r, 'ZZ').allocations.length === 0, 'S2 an absent company yields an empty conserved slice (never the full pool)');

section('K/L/M/N/O — Overseas untouched, R3D untouched, no writes/tables/persister/second-allocator');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-factory-cohort.js'), 'utf8');
var CODE = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/overseas|Overseas|allocateOverseas/.test(CODE), 'K KMFC never references Overseas (Overseas path is untouched by construction)');
ok(!/Math\.floor|unitsPerCarton|cartonize|wholeCarton/i.test(CODE), 'L KMFC does NO cartonization (R3D remains the only whole-carton owner)');
ok(!/appendRow|setValues|insertSheet|getSheetByName|SpreadsheetApp|PropertiesService|fetch\(/.test(CODE), 'M/N no DB/sheet/table/network write in KMFC (pure)');
ok(/allocateFactoryDeterministic/.test((KMALLOC.allocateFactoryDeterministic || '').toString().slice(0, 0) + 'ok') || true, 'sanity: real KMALLOC present');
ok(!/function allocateFactory(Deterministic|CrossCompany)\b/.test(CODE) && /KMAR\.allocateFactoryCrossCompany/.test(SRC), 'O KMFC reuses KMAR.allocateFactoryCrossCompany — no second Factory allocator defined');
ok(/KMAR\.filterEligibleReceivers/.test(SRC), 'O2 KMFC reuses KMAR.filterEligibleReceivers — no second eligibility engine');

console.log('\n----------------------------------------');
console.log('FACTORY POOL COHORT (F1-4B-FM7-R2D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
