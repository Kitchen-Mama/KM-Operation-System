// Kitchen Mama Operation System — F1-4B-FM7-R2B canonical allocation runtime.
// Run: node assets/tests/allocation-runtime-f1-4b-fm7r2b.test.js
// -----------------------------------------------------------------------------
// KMAR (window.KM.allocationRuntime) is a PURE orchestration over the frozen KMALLOC allocators — NOT a second
// engine. It adds the three FM7 authorities that lacked a runtime owner: (1) eligible-receiver filtering, (2)
// CROSS-COMPANY Factory conservation (physical pool = warehouse_id+sku; ALL companies compete for ONE pool via a
// single KMALLOC pass so Σ factory allocated ≤ physical available), (3) NORMAL/RISK/CRITICAL/COMPETITION health
// projection from frozen facts only. Overseas stays company-owned via KMALLOC (NORMAL/SHORTAGE unchanged).

var KMAR = require('../js/core/supply-planning-allocation-runtime.js');
var KMALLOC = require('../js/core/supply-planning-allocations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var WH = 'CN01', SKU = 'CO1100-R';
function pool(qty) { return { poolKey: 'FC:' + WH + ':' + SKU, poolType: 'FACTORY', warehouseId: WH, effectiveSupplyQty: qty }; }
function fd(demandKey, company, marketplace, demandQty, priority) {
  return { demandKey: demandKey, company: company, marketplace: marketplace, destinationWarehouseId: 'DEST-' + company,
    requiredByDate: '2026-03-01', allocationPriority: priority, demandQty: demandQty, eligibleFactoryWarehouseIds: [WH] };
}
// One per-company factory input carries the SAME physical pool (as each company's projectAllocationInputs would).
function companyInput(company, demands) { return { company: company, factoryPools: [pool(1000)], demands: demands }; }

section('§11 — cross-company Factory: same physical pool counted ONCE; Σ allocated never exceeds physical available');
(function () {
  var inputs = [
    companyInput('ResUS', [fd('ResUS|US|Amazon|X', 'ResUS', 'Amazon', 700, 0)]),
    companyInput('ResTW', [fd('ResTW|EU|Amazon|X', 'ResTW', 'Amazon', 600, 0)])
  ];
  var r = KMAR.allocateFactoryCrossCompany(SKU, inputs);
  ok(r.totalSupplyQty === 1000, 'physical pool deduped to 1000 (NOT 2000) — each company does not see its own full copy');
  ok(r.totalAllocatedQty <= 1000, 'Σ factory allocated across BOTH companies ≤ 1000 (no cross-company over-use)');
  ok(r.totalAllocatedQty === 1000 && r.totalUnusedSupplyQty === 0, 'demand 1300 > pool 1000 → pool fully consumed');
  ok(r.totalAllocatedQty + r.totalUnusedSupplyQty === r.totalSupplyQty, 'conservation: allocated + unused == physical supply');
  // FIFO (same requiredByDate, equal priority → company asc): ResTW before ResUS? company asc = ResTW < ResUS.
  var byCo = {}; r.allocations.forEach(function (a) { byCo[a.company] = (byCo[a.company] || 0) + a.allocatedQty; });
  ok((byCo.ResTW || 0) + (byCo.ResUS || 0) === 1000, 'both companies drew from the ONE pool, summing to 1000');
})();

section('§11 — several marketplaces per company, same SKU + Factory warehouse');
(function () {
  var inputs = [
    companyInput('KM', [fd('KM|US|Amazon|X', 'KM', 'Amazon', 400, 0), fd('KM|US|Walmart|X', 'KM', 'Walmart', 300, 0)]),
    companyInput('ResUS', [fd('ResUS|US|Amazon|X', 'ResUS', 'Amazon', 600, 0)])
  ];
  var r = KMAR.allocateFactoryCrossCompany(SKU, inputs);
  ok(r.totalSupplyQty === 1000, 'pool still counted once across 3 receivers / 2 companies');
  ok(r.totalAllocatedQty === 1000, 'Σ demand 1300 > 1000 → allocated exactly the physical 1000');
  ok(r.totalAllocatedQty <= r.totalSupplyQty, 'never exceeds physical available');
})();

section('§11 — NORMAL mode (pool ≥ Σ demand): every receiver fully supplied, none over-allocated');
(function () {
  var inputs = [companyInput('A', [fd('A|US|Amazon|X', 'A', 'Amazon', 700, 0)]), companyInput('B', [fd('B|EU|Amazon|X', 'B', 'Amazon', 600, 0)])];
  inputs[0].factoryPools = [pool(2000)]; inputs[1].factoryPools = [pool(2000)];
  var r = KMAR.allocateFactoryCrossCompany(SKU, inputs);
  ok(r.totalSupplyQty === 2000 && r.totalAllocatedQty === 1300 && r.totalUnusedSupplyQty === 700, 'sufficient pool → each fully supplied (700+600), 700 unused');
})();

section('§11 — priority affects FIFO order under scarcity (higher priority drawn first), still conserved');
(function () {
  var lo = KMAR.allocateFactoryCrossCompany(SKU, [companyInput('A', [fd('A|US|Amazon|X', 'A', 'Amazon', 700, 10)]), companyInput('B', [fd('B|EU|Amazon|X', 'B', 'Amazon', 700, 90)])]);
  var byCo = {}; lo.allocations.forEach(function (a) { byCo[a.company] = a.allocatedQty; });
  ok(byCo.B === 700 && byCo.A === 300, 'same required-by → higher priority (B=90) served first: B 700, A 300 (Σ=1000)');
  ok(lo.totalAllocatedQty === 1000, 'still conserved to the physical 1000');
})();

section('§11 — deterministic / no RNG / input-order independent');
(function () {
  var a = KMAR.allocateFactoryCrossCompany(SKU, [companyInput('ResUS', [fd('ResUS|US|Amazon|X', 'ResUS', 'Amazon', 700, 0)]), companyInput('ResTW', [fd('ResTW|EU|Amazon|X', 'ResTW', 'Amazon', 600, 0)])]);
  var b = KMAR.allocateFactoryCrossCompany(SKU, [companyInput('ResTW', [fd('ResTW|EU|Amazon|X', 'ResTW', 'Amazon', 600, 0)]), companyInput('ResUS', [fd('ResUS|US|Amazon|X', 'ResUS', 'Amazon', 700, 0)])]);
  eq(a.allocations, b.allocations, 'swapping company input order yields identical allocations (deterministic)');
})();

section('§11 — duplicate demandKey across companies fails closed (never silently double-counts a receiver)');
(function () {
  var threw = false;
  try { KMAR.allocateFactoryCrossCompany(SKU, [companyInput('A', [fd('DUP', 'A', 'Amazon', 100, 0)]), companyInput('B', [fd('DUP', 'B', 'Amazon', 100, 0)])]); } catch (e) { threw = true; }
  ok(threw, 'duplicate demandKey across companies → throws (fail-closed)');
})();

// ---- OVERSEAS (company-owned pool via KMALLOC; runtime reuses the frozen allocator) --------------------------
function recv(receiverKey, marketplace, demandQty, survival, priority, demandWeight) {
  return { receiverKey: receiverKey, demandKey: receiverKey, marketplace: marketplace, destinationWarehouseId: 'FBA-' + marketplace,
    fulfillmentModel: 'platform_fulfilled', demandQty: demandQty, survivalNeedQty: survival, allocationPriority: priority,
    demandWeight: demandWeight, eligiblePoolTypes: ['FBA'] };
}
function overseas(poolQty, receivers) {
  return { company: 'ResUS', country: 'US', masterSku: SKU, supplyPools: [{ poolKey: 'FBA:US:' + SKU, poolType: 'FBA', warehouseId: 'FBA-US', effectiveSupplyQty: poolQty }], receivers: receivers };
}

section('§12 — Overseas SHORTAGE: pool 800 < Σ survival 1000 → priority-weighted survival, Σ = 800');
(function () {
  var r = KMAR.allocateOverseas(overseas(800, [recv('A', 'Amazon', 500, 500, 100, 0.5), recv('B', 'Walmart', 500, 500, 90, 0.5)]));
  ok(r.allocationMode === 'SHORTAGE_ALLOCATION', 'pool < Σ survival → SHORTAGE mode (reused, not rewritten)');
  ok(r.totalAllocatedQty === 800, 'Σ allocated = 800 (full pool distributed)');
  ok(r.allocations.every(function (a) { return a.allocatedQty <= 500; }), 'each receiver ≤ its demand cap (500)');
  var byR = {}; r.allocations.forEach(function (a) { byR[a.demandKey] = a.allocatedQty; });
  ok((byR.A || 0) >= (byR.B || 0), 'higher priority A (100) receives ≥ B (90) under the survival×priority weighting');
})();

section('§13 — Overseas NORMAL: priority has NO quantity effect (only demandWeight drives the split)');
(function () {
  // Sufficient pool (≥ Σ survival). Two receivers, identical demand facts, wildly different priority.
  var hi = KMAR.allocateOverseas(overseas(1000, [recv('A', 'Amazon', 400, 200, 100, 0.5), recv('B', 'Walmart', 400, 200, 10, 0.5)]));
  var byHi = {}; hi.allocations.forEach(function (a) { byHi[a.demandKey] = a.allocatedQty; });
  ok(hi.allocationMode !== 'SHORTAGE_ALLOCATION', 'sufficient supply → NOT shortage');
  // Flip the priorities; the proportional (demandWeight 0.5/0.5) quantities must be unchanged.
  var flip = KMAR.allocateOverseas(overseas(1000, [recv('A', 'Amazon', 400, 200, 10, 0.5), recv('B', 'Walmart', 400, 200, 100, 0.5)]));
  var byFlip = {}; flip.allocations.forEach(function (a) { byFlip[a.demandKey] = a.allocatedQty; });
  ok(byHi.A === byFlip.A && byHi.B === byFlip.B, 'changing ONLY allocation_priority does not change normal proportional quantities');
})();

section('health projection — NORMAL / RISK / CRITICAL / COMPETITION (frozen facts, no new formula)');
(function () {
  eq(KMAR.projectHealth({ allocatedQty: 500, demandQty: 500, survivalNeedQty: 360, poolSupply: 2000, sumSurvivalNeed: 700 }).healthState, 'NORMAL', 'fully supplied → NORMAL');
  eq(KMAR.projectHealth({ allocatedQty: 400, demandQty: 500, survivalNeedQty: 360, poolSupply: 2000, sumSurvivalNeed: 700 }).healthState, 'RISK', 'survival met (≥360) but < demand → RISK');
  var crit = KMAR.projectHealth({ allocatedQty: 300, demandQty: 500, survivalNeedQty: 360, poolSupply: 2000, sumSurvivalNeed: 700 });
  eq(crit.healthState, 'CRITICAL', 'below survival floor → CRITICAL');
  ok(crit.survivalShortfallQty === 60 && crit.requiresExpediteReview === true, 'CRITICAL → shortfall 60 + requiresExpediteReview');
  var comp = KMAR.projectHealth({ allocatedQty: 500, demandQty: 500, survivalNeedQty: 360, poolSupply: 300, sumSurvivalNeed: 700 });
  ok(comp.competition === true && comp.requiresExpediteReview === true, 'poolSupply 300 < Σsurvival 700 → COMPETITION flag + expedite (POOL condition)');
  ok(comp.healthState === 'NORMAL', 'COMPETITION is a POOL flag; this fully-supplied receiver is still NORMAL (not conflated with CRITICAL)');
})();

section('§6 — eligible-receiver filter excludes inactive marketplaces / SKUs / invalid identity, with reasons');
(function () {
  var receivers = [
    { receiverKey: 'ok', company: 'KM', marketplace: 'Amazon', sku: SKU, demandQty: 100, marketplaceStatus: 'active', marketplaceSkuStatus: 'active' },
    { receiverKey: 'mpOff', company: 'KM', marketplace: 'Amazon', sku: SKU, demandQty: 100, marketplaceStatus: 'inactive' },
    { receiverKey: 'skuOff', company: 'KM', marketplace: 'Amazon', sku: SKU, demandQty: 100, marketplaceSkuStatus: 'cancelled' },
    { receiverKey: 'noId', company: '', marketplace: 'Amazon', sku: SKU, demandQty: 100 },
    { receiverKey: 'noDemand', company: 'KM', marketplace: 'Amazon', sku: SKU }
  ];
  var res = KMAR.filterEligibleReceivers(receivers);
  ok(res.eligible.length === 1 && res.eligible[0].receiverKey === 'ok', 'only the fully-valid active receiver is eligible');
  var reasons = {}; res.excluded.forEach(function (x) { reasons[x.receiver.receiverKey] = x.reason; });
  eq([reasons.mpOff, reasons.skuOff, reasons.noId, reasons.noDemand], ['MARKETPLACE_INACTIVE', 'MARKETPLACE_SKU_INACTIVE', 'INVALID_PLANNING_IDENTITY', 'DEMAND_AUTHORITY_UNRESOLVED'], 'each exclusion carries the exact reason (no silent drop / no demandWeight to an invalid receiver)');
  ok(KMAR.isPlannableStatus('') === true && KMAR.isPlannableStatus('active') === true && KMAR.isPlannableStatus('inactive') === false, 'blank/active plannable; inactive not (0/null priority is a separate axis, never disabled here)');
})();

section('no second engine / no cartonization here (source contract)');
(function () {
  var fs = require('fs'), path = require('path');
  var SRC = fs.readFileSync(path.join(__dirname, '..', 'js/core/supply-planning-allocation-runtime.js'), 'utf8');
  ok(/ALLOC\.allocateFactoryDeterministic|ALLOC\.allocateOverseasSharedPool/.test(SRC), 'runtime calls the frozen KMALLOC allocators (no reimplementation)');
  // Strip comments, then prove there is NO carton-rounding operation (no Math.floor / units_per_carton division) —
  // cartonization stays at the R3D execution boundary downstream.
  var code = SRC.replace(/\/\/[^\n]*/g, '');
  ok(!/Math\.floor/.test(code) && !/unitsPerCarton/.test(code), 'NO cartonization/rounding in the runtime (stays at the R3D execution boundary)');
  ok(!/localStorage|sessionStorage|fetch\(|KM\.DB|reserved_stock|setValues/.test(SRC), 'NO DB / storage / reservation / stock write');
})();

console.log('\n----------------------------------------');
console.log('ALLOCATION RUNTIME (F1-4B-FM7-R2B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
