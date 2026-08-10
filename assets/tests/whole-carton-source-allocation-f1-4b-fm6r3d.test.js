// Kitchen Mama Operation System — F1-4B-FM6-R3D whole-carton source EXECUTION allocation (FROZEN business rule).
// Run: node assets/tests/whole-carton-source-allocation-f1-4b-fm6r3d.test.js
// -----------------------------------------------------------------------------
// Automatic source allocation uses WHOLE CARTONS ONLY. The already-frozen aggregate recommendedQty R (cartonized once
// upstream by KMCALC) is DECOMPOSED — never recomputed — into per-physical-source execution quantities: Overseas
// sources fill before Factory, each source contributes only whole cartons of ITS OWN available units, loose residual
// units are NEVER auto-allocated (a human may later override), and allocated + uncovered == R. recommended_qty stays
// the aggregate demand authority; planned_qty (userQty) carries the per-source cartonized EXECUTION allocation.
// Driven through the REAL KMPB.allocateWholeCartonSources + KMPB.buildRecommendation + the Persistence Core.

var PB = require('../js/core/supply-planning-plan-builder.js');
var CORE = require('../js/core/supply-planning-persistence.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var OV = 'THREE_PL', FC = 'FACTORY';
function src(id, tier, avail, seq) { return { sourceWarehouseId: id, routeNo: '', tier: tier, availableQty: avail, seq: seq || 0 }; }

section('wholeCartonAvailable(x,UPC) = floor(max(0,x)/UPC)*UPC');
ok(PB.wholeCartonAvailable(1149, 40) === 1120, '1149 → 1120');
ok(PB.wholeCartonAvailable(39, 40) === 0, '39 → 0 (a loose partial carton is not available)');
ok(PB.wholeCartonAvailable(-5, 40) === 0 && PB.wholeCartonAvailable(0, 40) === 0, 'negative / zero → 0');
ok(PB.wholeCartonAvailable(2000, 40) === 2000, 'exact multiple unchanged');

section('§13.A — R=2000 UPC=40 O=1149 F>=880 → Overseas 1120, Factory 880, uncovered 0');
(function () {
  var r = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 1149), src('F', 'FACTORY', 880)]);
  ok(r.overseasAllocated === 1120, 'Overseas allocated 1120 (loose 29 excluded)');
  ok(r.factoryAllocated === 880, 'Factory fills the cartonized remainder 880');
  ok(r.uncoveredQty === 0, 'uncovered 0');
  eq(r.perSource.map(function (p) { return [p.sourceWarehouseId, p.allocatedQty]; }), [['O', 1120], ['F', 880]], 'Overseas line first, then Factory');
})();

section('§13.B — O=39 (<1 carton) → Overseas allocation 0 (loose never auto-allocated)');
(function () {
  var r = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 39)]);
  ok(r.overseasAllocated === 0 && r.perSource[0].allocatedQty === 0, 'Overseas 0');
  ok(r.uncoveredQty === 2000, 'all 2000 uncovered');
})();

section('§13.C — O=2041 → Overseas 2000 (caps at R), Factory 0');
(function () {
  var r = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 2041), src('F', 'FACTORY', 5000)]);
  ok(r.overseasAllocated === 2000, 'Overseas covers all of R (2040 carton-available, capped at 2000)');
  ok(r.factoryAllocated === 0, 'Factory 0 (nothing left to fill)');
  ok(r.uncoveredQty === 0, 'uncovered 0');
})();

section('§13.D — O=1149 F=879 → Overseas 1120, Factory 840, uncovered 40');
(function () {
  var r = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 1149), src('F', 'FACTORY', 879)]);
  ok(r.overseasAllocated === 1120, 'Overseas 1120');
  ok(r.factoryAllocated === 840, 'Factory floor(879/40)*40 = 840 (loose 39 factory excluded)');
  ok(r.uncoveredQty === 40, 'uncovered 40 (one carton the sources cannot cover in whole cartons)');
})();

section('§13.E/§2 — every automatic source allocation is a carton multiple + allocated+uncovered == R');
(function () {
  var cases = [[2000, 40, 1149, 879], [4000, 25, 3013, 990], [1000, 10, 333, 671], [520, 40, 41, 41]];
  cases.forEach(function (c) {
    var r = PB.allocateWholeCartonSources(c[0], c[1], [src('O', 'OVERSEAS', c[2]), src('F', 'FACTORY', c[3])]);
    var okMul = r.perSource.every(function (p) { return p.allocatedQty % c[1] === 0; });
    ok(okMul, 'R=' + c[0] + ' UPC=' + c[1] + ': each source allocation divisible by UPC');
    ok(r.overseasAllocated + r.factoryAllocated + r.uncoveredQty === c[0], 'R=' + c[0] + ': allocated + uncovered == R');
    ok(r.uncoveredQty >= 0, 'R=' + c[0] + ': uncovered >= 0');
  });
})();

section('§13.F — loose source remainder is NOT consumed (availableQty − allocated stays as loose)');
(function () {
  var r = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 1149)]);
  var p = r.perSource[0];
  ok(p.availableQty - p.allocatedQty === 29, '29 loose overseas units remain unallocated (visible availability, human-override only)');
})();

section('§13.G — a shared physical pool is never double-allocated across competing receivers');
(function () {
  // KMALLOC conserves a 1149-unit overseas pool across two receivers (700 + 449). The whole-carton decomposition
  // only FLOORS each receiver\'s conserved share, so Σ allocated can never exceed the physical pool.
  var pool = 1149;
  var r1 = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 700)]);
  var r2 = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 449)]);
  ok(r1.overseasAllocated === 680 && r2.overseasAllocated === 440, 'each receiver floors its own conserved share (680 / 440)');
  ok(r1.overseasAllocated + r2.overseasAllocated <= pool, 'Σ allocated (1120) ≤ shared pool (1149) — no double-allocation');
})();

section('§13.H — identical inputs are deterministic / idempotent (input order-independent)');
(function () {
  var a = PB.allocateWholeCartonSources(2000, 40, [src('O', 'OVERSEAS', 1149, 2), src('F', 'FACTORY', 880, 1)]);
  var b = PB.allocateWholeCartonSources(2000, 40, [src('F', 'FACTORY', 880, 1), src('O', 'OVERSEAS', 1149, 2)]);
  eq(a, b, 'same result regardless of source input order (Overseas-first, then sequence, deterministic)');
})();

section('assertions — R must already be a whole-carton multiple; UPC must be a positive integer');
(function () {
  var threw = false; try { PB.allocateWholeCartonSources(1990, 40, [src('O', 'OVERSEAS', 5000)]); } catch (e) { threw = e instanceof RangeError; }
  ok(threw, 'non-carton R → RangeError (the frozen cartonization is NOT re-run here)');
  var threw2 = false; try { PB.allocateWholeCartonSources(2000, 0, [src('O', 'OVERSEAS', 100)]); } catch (e) { threw2 = e instanceof TypeError; }
  ok(threw2, 'UPC 0 → TypeError');
})();

// ---- END-TO-END: the §3 / CO1100-R fixture through the REAL builder + Persistence Core -----------------------
function weeklyFact(recommendedQty, upc, breakdown) {
  return { sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', blocked: false, recommendedQty: recommendedQty,
    lineage: { allocationBreakdown: breakdown, unitsPerCarton: upc } };
}
function buildWeekly(lines) {
  return PB.buildRecommendation({ recommendationType: 'WEEKLY_SHIPPING', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-W40',
    businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' },
    calculationRunId: 'RUN-1', lines: lines });
}
function persist(built) { return CORE.generateRecommendationDraft(CORE.createStore(), built.command); }

section('§3/§9 CO1100-R — 2000 / UPC 40 / Overseas 1149 / Factory 880 → planned 1120 + 880 (uncovered 0)');
(function () {
  var cmd = buildWeekly([weeklyFact(2000, 40, [
    { sourceWarehouseId: 'WH-3PL', sourceWarehouseCode: '3PL-A', sourcePoolType: 'THREE_PL', allocatedQty: 1149, allocationSequence: 1 },
    { sourceWarehouseId: 'WH-FCT', sourceWarehouseCode: 'FCT-B', sourcePoolType: 'FACTORY', allocatedQty: 880, allocationSequence: 2 }
  ])]);
  var lines = cmd.command.recommendedLines;
  ok(lines.length === 2, 'two per-source execution lines');
  var byUser = {}; lines.forEach(function (l) { byUser[PB.splitLineKey('WEEKLY_SHIPPING', l.lineKey).source_warehouse_id] = l; });
  ok(byUser['WH-3PL'].userQty === 1120, 'Overseas planned execution = 1120 (whole cartons of 1149)');
  ok(byUser['WH-FCT'].userQty === 880, 'Factory planned execution = 880 (cartonized remainder)');
  ok(byUser['WH-3PL'].recommendedQty === 2000 && byUser['WH-FCT'].recommendedQty === 2000, 'aggregate recommended_qty = 2000 on EACH line (demand authority, not summed)');
  ok(byUser['WH-3PL'].userQty + byUser['WH-FCT'].userQty === 2000, 'Σ planned execution (1120+880) == R (uncovered 0)');
  // Persistence Core writes planned_qty per source from the execution qty (NOT the aggregate).
  var g = persist(cmd);
  eq(g.result.status, 'COMPLETED', 'Core persists the multi-source draft → COMPLETED');
  var planned = {}; g.store.lines.forEach(function (l) { planned[PB.splitLineKey('WEEKLY_SHIPPING', l.lineKey).source_warehouse_id] = l.userQty; });
  ok(planned['WH-3PL'] === 1120 && planned['WH-FCT'] === 880, 'store planned_qty per source = 1120 / 880 (NOT the 2000 aggregate — no N×R over-plan)');
  var recSum = g.store.lines.reduce(function (a, l) { return a + (l.recommendedQty || 0); }, 0);
  var userSum = g.store.lines.reduce(function (a, l) { return a + (l.userQty || 0); }, 0);
  ok(userSum === 2000, 'Σ store planned_qty == R = 2000 (execution reconciles to the recommendation)');
  ok(recSum === 4000, 'Σ store recommended_qty = 4000 (aggregate repeated per source — MUST NOT be summed as demand)');
})();

section('§13.F end-to-end — loose 29 overseas units stay visible as raw source availability, NOT auto-shipped');
(function () {
  var cmd = buildWeekly([weeklyFact(2000, 40, [
    { sourceWarehouseId: 'WH-3PL', sourcePoolType: 'THREE_PL', allocatedQty: 1149, allocationSequence: 1 },
    { sourceWarehouseId: 'WH-FCT', sourcePoolType: 'FACTORY', allocatedQty: 880, allocationSequence: 2 }
  ])]);
  var d = {}; cmd.command.recommendedLines.forEach(function (l) { d[PB.splitLineKey('WEEKLY_SHIPPING', l.lineKey).source_warehouse_id] = cmd.lineDetails[l.lineKey].row; });
  ok(d['WH-3PL'].source_allocated_qty_snapshot === 1149, 'raw overseas availability 1149 preserved (loose 29 visible; planned only 1120)');
  ok(d['WH-FCT'].source_allocated_qty_snapshot === 880, 'raw factory availability 880 preserved');
})();

section('§13.I — Order Planning (MONTHLY) is NOT fanned out and NOT whole-carton decomposed (order_qty init = recommended)');
(function () {
  var cmd = PB.buildRecommendation({ recommendationType: 'MONTHLY_ORDER', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08',
    businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', draft_purpose: 'regular', sku: 'CO1100-R' },
    calculationRunId: 'RUN-1',
    lines: [{ request_month: '2026-09', request_bucket: 'T1', blocked: false, recommendedQty: 137, lineage: { allocationBreakdown: [{ sourceWarehouseId: 'X', sourcePoolType: 'FACTORY', allocatedQty: 137 }], unitsPerCarton: 20 } }] });
  ok(cmd.command.recommendedLines.length === 1, 'MONTHLY stays 1:1 (no per-source fan-out)');
  ok(cmd.command.recommendedLines[0].userQty === undefined, 'MONTHLY carries NO execution userQty → Core defaults order_qty to the recommendation');
  var g = persist(cmd);
  ok(g.store.lines[0].userQty === 137 && g.store.lines[0].recommendedQty === 137, 'order_qty init = recommended 137 (Monthly math untouched — no carton re-decomposition)');
})();

section('§13.J — a manual order_qty edit is preserved (never overwritten by the execution rule)');
(function () {
  var cmd = PB.buildRecommendation({ recommendationType: 'MONTHLY_ORDER', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08',
    businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', draft_purpose: 'regular', sku: 'CO1100-R' },
    calculationRunId: 'RUN-1', lines: [{ request_month: '2026-09', request_bucket: 'T1', blocked: false, recommendedQty: 137, lineage: { allocationBreakdown: [] } }] });
  var g = persist(cmd);
  var lk = g.store.lines[0].lineKey;
  var edited = CORE.applyUserEdit(g.store, { draftId: g.store.lines[0].draftId, lineKey: lk, userQty: 200, actor: 'planner' });
  var line = edited.store.lines[0];
  ok(line.userQty === 200 && line.userEdited === true, 'manual order_qty=200 recorded with provenance');
  ok(line.recommendedQty === 137, 'recommended_qty snapshot unchanged by the manual edit');
})();

console.log('\n----------------------------------------');
console.log('WHOLE-CARTON SOURCE ALLOCATION (F1-4B-FM6-R3D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
