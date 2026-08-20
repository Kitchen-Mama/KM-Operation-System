// Kitchen Mama Operation System — Factory source-grain preservation + §41 live reallocation — F1-7N-FA-3B3b.
// Run: node assets/tests/factory-source-grain-reallocation-f1-7n-fa-3b3b.test.js
// Proves (against the REAL bundled KMMSA/KMAR/KMALLOC/KMCALC/KMFSR, via the 43_ functions): the existing initial
// factory allocation's per-source-warehouse grain is preserved ADDITIVELY (no rerun, no guess); cross-company R2G-B
// source identity survives; §41 KMFSR surplus reallocation runs over the preallocated source-attributed coverage with
// NO second §40 allocation; conservation (Σin=Σout, per-source ≤ pool, coverage ≥ 0); T4 visibility-only; unused
// physical residual is NOT donor surplus; determinism.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F43 + '\n return {' +
  ' computeContention: gapOpComputeFactoryContention_, buildAlloc: gapOpBuildSupplyAllocation_,' +
  ' applyF41: gapOpApplyFactorySurplusReallocation_, receiverKey: gapReceiverKey_,' +
  ' ALLOC: (typeof KMALLOC !== "undefined" ? KMALLOC : null) };'))();

var CALC = '2026-08-01';   // T1 = 2026-09, T2 = 2026-10, T3 = 2026-11, T4 = 2026-12
function factoryPool(wh, sku, qty) { return { poolKey: 'FC:' + wh + ':' + sku, poolType: 'FACTORY', warehouseId: wh, effectiveSupplyQty: qty }; }
function recv(o) {
  var r = { company: o.company || 'A', country: o.country || 'US', marketplace: o.marketplace, sku: o.sku || 'X',
    demandQty: o.demandQty, gapQty: (o.gapQty != null ? o.gapQty : o.demandQty), allocationPriority: o.priority || 0,
    requiredByDate: o.requiredByDate || '2026-09-01' };
  r.key = H.receiverKey(r.company, r.country, r.marketplace, r.sku); return r;
}
function pf(factoryPoolsBySku, eids) { return { overseasPoolsByKey: {}, factoryPoolsBySku: factoryPoolsBySku, eligibleFactoryWarehouseIds: eids, priorityByMkt: {} }; }
function build(receivers, poolFacts) { var c = H.computeContention(receivers, poolFacts); return { map: H.buildAlloc(receivers, poolFacts, c).byReceiverKey, contention: c }; }
function srcSum(bySource) { var t = 0; for (var w in bySource) if (Object.prototype.hasOwnProperty.call(bySource, w)) t += bySource[w]; return t; }

// ==========================================================================
section('CASE A/B — source-grain preserved additively; Σ initialAllocationBySource == factoryCoveredQty');
(function () {
  // pool WH1=100; two T1 receivers demand 80 / 50 → FIFO (priority) 80 then 20.
  var rs = [recv({ marketplace: 'AMZ', demandQty: 80, priority: 1 }), recv({ marketplace: 'WMT', demandQty: 50, priority: 0 })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var a1 = b.map[rs[0].key], a2 = b.map[rs[1].key];
  eq(srcSum(a1.factoryBySource), a1.factoryCoveredQty, 'A R1 Σsource == coverage');
  eq(srcSum(a2.factoryBySource), a2.factoryCoveredQty, 'A R2 Σsource == coverage');
  ok(a1.factoryBySource.WH1 === a1.factoryCoveredQty && a2.factoryBySource.WH1 === a2.factoryCoveredQty, 'A single-warehouse grain = WH1');
  eq(a1.factoryCoveredQty + a2.factoryCoveredQty, 100, 'A/C Σ coverage == physical pool 100 (conservation)');
})();

section('CASE B/H — multiple warehouses: initialAllocationBySource keeps every contributing source separately');
(function () {
  // WH1=40, WH2=30 (both eligible); one receiver demand 100 competing with a lower-priority receiver to force FIFO.
  var rs = [recv({ marketplace: 'AMZ', demandQty: 100, priority: 1 }), recv({ marketplace: 'WMT', demandQty: 100, priority: 0 })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 40), factoryPool('WH2', 'X', 30)] }, ['WH1', 'WH2']));
  var a1 = b.map[rs[0].key];
  eq(a1.factoryCoveredQty, 70, 'B R1 draws both pools = 70');
  eq(a1.factoryBySource, { WH1: 40, WH2: 30 }, 'B multi-warehouse grain preserved separately');
  eq(srcSum(a1.factoryBySource), 70, 'B Σsource == coverage');
})();

section('CASE C/I — per-source physical conservation: Σ WH1 attribution across receivers ≤ WH1 physical');
(function () {
  var rs = [recv({ marketplace: 'AMZ', demandQty: 70, priority: 1 }), recv({ marketplace: 'WMT', demandQty: 70, priority: 0 })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var total = 0; rs.forEach(function (r) { total += (b.map[r.key].factoryBySource.WH1 || 0); });
  ok(total <= 100, 'C Σ WH1 attribution (' + total + ') ≤ 100 physical');
  eq(total, 100, 'I no source over-allocation (exactly 100 drawn)');
})();

section('CASE D — cross-company R2G-B: original physical source warehouse survives (never receiver/company)');
(function () {
  // sku X pool WH1=60 contended by companies A and B → KMAR cross-company; source WH1 must survive in partitionBySource.
  var rs = [recv({ company: 'A', marketplace: 'AMZ', demandQty: 100, priority: 1 }), recv({ company: 'B', marketplace: 'AMZ', demandQty: 100, priority: 0 })];
  var c = H.computeContention(rs, pf({ X: [factoryPool('WH1', 'X', 60)] }, ['WH1']));
  ok(c.contendedSkus.X === 1, 'D sku X is cross-company contended');
  var totalWh1 = 0; Object.keys(c.partitionBySource).forEach(function (k) { totalWh1 += (c.partitionBySource[k].WH1 || 0); });
  ok(totalWh1 <= 60 && totalWh1 > 0, 'D source WH1 preserved through R2G-B (Σ=' + totalWh1 + ' ≤ 60)');
  Object.keys(c.partitionBySource).forEach(function (k) { Object.keys(c.partitionBySource[k]).forEach(function (w) { ok(w === 'WH1', 'D source key is physical WH1, not synthetic/company (' + w + ')'); }); });
})();

section('CASE E — §41 eligible surplus reallocation: donor surplus → eligible receiver; Σin == Σout');
(function () {
  // R1: T1, demand 100 but gap 40 (site stock 60) → gets factory 100, surplus 60. R2: T2, gap 50, factory 0 → shortage.
  var rs = [recv({ marketplace: 'AMZ', demandQty: 100, gapQty: 40, priority: 1, requiredByDate: '2026-09-01' }),
            recv({ marketplace: 'WMT', demandQty: 100, gapQty: 50, priority: 0, requiredByDate: '2026-10-01' })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var a1 = b.map[rs[0].key], a2 = b.map[rs[1].key];
  var initial1 = a1.factoryCoveredQty, initial2 = a2.factoryCoveredQty;   // 100 / 0 (FIFO priority to R1)
  eq(initial1, 100, 'E R1 initial factory 100'); eq(initial2, 0, 'E R2 initial factory 0');
  var res = H.applyF41(b.map, rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  ok(res.applied && res.groups >= 1, 'E §41 applied');
  var inSum = (a1.reallocationInQty || 0) + (a2.reallocationInQty || 0), outSum = (a1.reallocationOutQty || 0) + (a2.reallocationOutQty || 0);
  eq(inSum, outSum, 'E Σin == Σout (conservation)');
  ok(a1.reallocationOutQty === 50 && a2.reallocationInQty === 50, 'E donor R1 releases 50 to shortage receiver R2 (surplus 60, need 50)');
  eq(a1.factoryCoveredQty, 50, 'E R1 post coverage = 100 − 50');
  eq(a2.factoryCoveredQty, 50, 'E R2 post coverage = 0 + 50');
  ok(a1.factoryCoveredQty >= 0 && a2.factoryCoveredQty >= 0, 'E no negative coverage');
  eq(a1.factoryCoveredQty + a2.factoryCoveredQty, 100, 'E Σ coverage still == physical 100 (no supply created)');
})();

section('CASE F — ineligible direction (later-tier donor → earlier-tier receiver) → no transfer');
(function () {
  // R1: T2 with surplus; R2: T1 with shortage. Donor tier(2) > receiver tier(1) → §32A ineligible.
  var rs = [recv({ marketplace: 'AMZ', demandQty: 100, gapQty: 40, priority: 1, requiredByDate: '2026-10-01' }),
            recv({ marketplace: 'WMT', demandQty: 100, gapQty: 50, priority: 0, requiredByDate: '2026-09-01' })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var a1 = b.map[rs[0].key], a2 = b.map[rs[1].key];
  H.applyF41(b.map, rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  eq((a1.reallocationOutQty || 0) + (a2.reallocationInQty || 0), 0, 'F no transfer across ineligible tier direction');
})();

section('CASE G — T4 receiver is visibility-only: excluded from §41, coverage untouched');
(function () {
  var rs = [recv({ marketplace: 'AMZ', demandQty: 100, gapQty: 40, priority: 1, requiredByDate: '2026-12-01' })];   // monthDelta 4 → T4
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var before = b.map[rs[0].key].factoryCoveredQty;
  H.applyF41(b.map, rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  eq(b.map[rs[0].key].factoryCoveredQty, before, 'G T4 coverage unchanged (no actionable reallocation)');
  ok(b.map[rs[0].key].reallocationInQty === undefined, 'G T4 not processed by §41');
})();

section('CASE J — unused physical residual is NOT donor surplus (§43.6)');
(function () {
  // pool 100, single-lane demand small → only 30 allocated across two receivers; 70 unused. §41 must NOT treat 70 as surplus.
  var rs = [recv({ marketplace: 'AMZ', demandQty: 20, gapQty: 20, priority: 1 }), recv({ marketplace: 'WMT', demandQty: 10, gapQty: 10, priority: 0 })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var initTotal = b.map[rs[0].key].factoryCoveredQty + b.map[rs[1].key].factoryCoveredQty;
  eq(initTotal, 30, 'J only 30 initially allocated (demand-capped by FIFO)');
  H.applyF41(b.map, rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  var postTotal = b.map[rs[0].key].factoryCoveredQty + b.map[rs[1].key].factoryCoveredQty;
  eq(postTotal, 30, 'J post coverage still 30 — the 70 unused physical residual was NOT injected as donor surplus');
})();

section('CASE K — no second §40 allocation: KMFSR path calls allocateFactoryDeterministic ZERO times');
(function () {
  var rs = [recv({ marketplace: 'AMZ', demandQty: 100, gapQty: 40, priority: 1, requiredByDate: '2026-09-01' }),
            recv({ marketplace: 'WMT', demandQty: 100, gapQty: 50, priority: 0, requiredByDate: '2026-10-01' })];
  var b = build(rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']));
  var calls = 0, realFn = H.ALLOC.allocateFactoryDeterministic;
  H.ALLOC.allocateFactoryDeterministic = function () { calls++; return realFn.apply(this, arguments); };
  try { H.applyF41(b.map, rs, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC); }
  finally { H.ALLOC.allocateFactoryDeterministic = realFn; }
  eq(calls, 0, 'K §41 live path made ZERO allocateFactoryDeterministic calls (calls=' + calls + ')');
})();

section('CASE M — determinism: receiver ordering does not change canonical output');
(function () {
  var mk = function () { return [recv({ marketplace: 'AMZ', demandQty: 100, gapQty: 40, priority: 1, requiredByDate: '2026-09-01' }),
                                  recv({ marketplace: 'WMT', demandQty: 100, gapQty: 50, priority: 0, requiredByDate: '2026-10-01' })]; };
  var r1 = mk(), b1 = build(r1, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1'])); H.applyF41(b1.map, r1, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  var r2 = mk().reverse(), b2 = build(r2, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1'])); H.applyF41(b2.map, r2, pf({ X: [factoryPool('WH1', 'X', 100)] }, ['WH1']), CALC);
  function canon(m) { var o = {}; Object.keys(m).sort().forEach(function (k) { o[k] = m[k]; }); return o; }   // key-order-independent (per-key values are the canonical facts)
  eq(canon(b1.map), canon(b2.map), 'M canonical allocMap identical regardless of receiver order');
})();

// ==========================================================================
console.log('\n' + (fail ? ('FAILED ' + fail + ' / ' + (pass + fail)) : ('OK — all ' + pass + ' assertions passed')));
if (fail) process.exit(1);
