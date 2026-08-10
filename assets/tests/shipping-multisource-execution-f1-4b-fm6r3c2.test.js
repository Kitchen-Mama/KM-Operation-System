// Kitchen Mama Operation System — F1-4B-FM6-R3C2 Inventory multi-source execution persistence.
// Run: node assets/tests/shipping-multisource-execution-f1-4b-fm6r3c2.test.js
// -----------------------------------------------------------------------------
// ONE recommendation (aggregate recommended_qty per sku/site/window, produced + cartonized ONCE by KMPB) persists
// as MULTIPLE per-physical-source execution lines. The aggregate is NEVER recomputed or split-cartonized; each
// source line carries the SAME aggregate recommended_qty (non-summable) + a SEPARATE source_allocated_qty_snapshot
// (the KMALLOC per-source qty). Blank source = unsourced (all-uncovered), never a fabricated warehouse. Driven
// through the REAL KMPB.buildRecommendation + KMPR key/validation (no mocks of the engine).

var PB = require('../js/core/supply-planning-plan-builder.js');
var REPO = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// A resolved WEEKLY fact: aggregate recommendedQty + a per-source allocationBreakdown carried in lineage
// (verbatim from KMALLOC/KMMSA, as the bridge now threads it). breakdown = [{sourceWarehouseId, allocatedQty}].
function fact(recommendedQty, breakdown, over) {
  return Object.assign({
    sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', blocked: false,
    recommendedQty: recommendedQty,
    lineage: { allocationBreakdown: breakdown || [] }
  }, over || {});
}
function build(lines) {
  return PB.buildRecommendation({
    recommendationType: 'WEEKLY_SHIPPING', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-W40',
    businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', source_page: 'inventory_replenishment' },
    calculationRunId: 'RUN-1', lines: lines
  });
}
// A persisted-row view of a command line: split the 5-part key + read the source snapshot from lineDetails.row.
function lineView(cmd, lineKey) {
  var nk = PB.splitLineKey('WEEKLY_SHIPPING', lineKey);
  var d = cmd.lineDetails[lineKey] || { row: {} };
  var cl = cmd.command.recommendedLines.filter(function (l) { return l.lineKey === lineKey; })[0] || {};
  return { source: nk.source_warehouse_id, route: nk.route_no, recommendedQty: cl.recommendedQty, sourceAllocated: d.row.source_allocated_qty_snapshot, code: d.row.source_warehouse_code_snapshot };
}

section('CO1100-R — 4200 aggregate → Overseas 1100 + Factory 3000 (+ 100 uncovered, NOT a line)');
(function () {
  var cmd = build([fact(4200, [
    { sourceWarehouseId: 'OVERSEAS-A', sourceWarehouseCode: '3PL-A', allocatedQty: 1100 },
    { sourceWarehouseId: 'FACTORY-B', sourceWarehouseCode: 'FCT-B', allocatedQty: 3000 }
  ])]);
  var lines = cmd.command.recommendedLines;
  ok(lines.length === 2, 'two source-distinct execution lines (one per physical source)');
  var byKey = {}; lines.forEach(function (l) { var v = lineView(cmd, l.lineKey); byKey[v.source] = v; });
  ok(!!byKey['OVERSEAS-A'] && !!byKey['FACTORY-B'], 'both source warehouses present as distinct lines');
  ok(byKey['OVERSEAS-A'].recommendedQty === 4200 && byKey['FACTORY-B'].recommendedQty === 4200, 'aggregate recommended_qty = 4200 UNCHANGED on EACH source line (never split-cartonized)');
  ok(byKey['OVERSEAS-A'].sourceAllocated === 1100 && byKey['FACTORY-B'].sourceAllocated === 3000, 'source_allocated_qty_snapshot = per-source KMALLOC qty (1100 / 3000)');
  var sumAlloc = byKey['OVERSEAS-A'].sourceAllocated + byKey['FACTORY-B'].sourceAllocated;
  ok(sumAlloc === 4100, 'Σ source_allocated = 4100 (≤ recommended 4200)');
  ok((4200 - sumAlloc) === 100, 'uncovered = recommended − Σallocated = 100 (derived; NOT persisted as a fake warehouse line)');
  ok(byKey['OVERSEAS-A'].code === '3PL-A' && byKey['FACTORY-B'].code === 'FCT-B', 'source_warehouse_code_snapshot captured per source');
})();

section('conservation — one warehouse appearing in multiple pool entries is summed into ONE line (no duplicate key)');
(function () {
  var cmd = build([fact(5000, [
    { sourceWarehouseId: 'OVERSEAS-A', allocatedQty: 700 },
    { sourceWarehouseId: 'OVERSEAS-A', allocatedQty: 400 },
    { sourceWarehouseId: 'FACTORY-B', allocatedQty: 3000 }
  ])]);
  ok(cmd.command.recommendedLines.length === 2, 'two lines (OVERSEAS-A pools merged into one, FACTORY-B one) — no duplicate natural key');
  var byKey = {}; cmd.command.recommendedLines.forEach(function (l) { var v = lineView(cmd, l.lineKey); byKey[v.source] = v; });
  ok(byKey['OVERSEAS-A'].sourceAllocated === 1100, 'OVERSEAS-A allocatedQty summed 700+400 = 1100 (pool conserved, no double line)');
})();

section('edge cases — single source, zero-overseas→factory-only, overseas-fully-covers, all-uncovered');
(function () {
  var single = build([fact(1100, [{ sourceWarehouseId: 'OVERSEAS-A', allocatedQty: 1100 }])]);
  ok(single.command.recommendedLines.length === 1 && lineView(single, single.command.recommendedLines[0].lineKey).source === 'OVERSEAS-A', 'single-source → one line');

  var factoryOnly = build([fact(3000, [{ sourceWarehouseId: 'FACTORY-B', allocatedQty: 3000 }])]);
  ok(factoryOnly.command.recommendedLines.length === 1 && lineView(factoryOnly, factoryOnly.command.recommendedLines[0].lineKey).source === 'FACTORY-B', 'zero overseas → factory-only single line');

  var noSource = build([fact(4200, [])]);
  var nv = lineView(noSource, noSource.command.recommendedLines[0].lineKey);
  ok(noSource.command.recommendedLines.length === 1 && nv.source === '' && nv.recommendedQty === 4200 && nv.sourceAllocated === 0, 'all-uncovered → ONE line, BLANK source (not a fake warehouse), recommended 4200, source_allocated 0');
})();

section('validator + idempotency — 5-part key accepts blank nullable parts; identical rerun is deterministic');
(function () {
  var cmd = build([fact(4200, [{ sourceWarehouseId: 'OVERSEAS-A', allocatedQty: 1100 }, { sourceWarehouseId: 'FACTORY-B', allocatedQty: 3000 }])]);
  // Two lines differ only by source → DISTINCT keys (never collide).
  var keys = cmd.command.recommendedLines.map(function (l) { return l.lineKey; });
  ok(keys[0] !== keys[1], 'two source lines have DISTINCT natural keys');
  // Rerun byte-identical (deterministic ordering).
  var cmd2 = build([fact(4200, [{ sourceWarehouseId: 'FACTORY-B', allocatedQty: 3000 }, { sourceWarehouseId: 'OVERSEAS-A', allocatedQty: 1100 }])]);
  eq(cmd2.command.recommendedLines.map(function (l) { return l.lineKey; }), keys, 'identical rerun (input order swapped) → same sorted line keys (deterministic, no duplicate)');
  // A blank nullable key part is a VALID plan op (no throw) via the relaxed validator.
  var okValidate = true;
  try {
    REPO.validatePersistencePlan({
      recommendationType: 'WEEKLY_SHIPPING', sourceTables: { header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines' },
      draftId: 'SAD-1', activeKey: 'WEEKLY_SHIPPING::k', calculationRunId: 'RUN-1', draftVersion: 1,
      expectedToken: { draft_version: 1, userEditFingerprint: 'x' }, runMeta: {},
      headerOp: { op: 'INSERT', row: { allocation_draft_id: 'SAD-1' } },
      lineOps: [{ op: 'INSERT', naturalKey: { sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', source_warehouse_id: '', route_no: '' }, row: { recommended_qty: 4200 }, targetLineStatus: 'active' }],
      lineageOps: [], totals: {}, stages: REPO.STAGES.slice(), auditEvents: []
    });
  } catch (e) { okValidate = false; }
  ok(okValidate, 'validatePersistencePlan ACCEPTS a WEEKLY line op with blank source_warehouse_id/route_no (nullable key parts)');
})();

section('MONTHLY_ORDER unchanged — no per-source fan-out, 2-part key');
(function () {
  var cmd = PB.buildRecommendation({
    recommendationType: 'MONTHLY_ORDER', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08',
    businessScope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', draft_purpose: 'regular', sku: 'CO1100-R' },
    calculationRunId: 'RUN-1',
    lines: [{ request_month: '2026-09', request_bucket: 'T1', blocked: false, recommendedQty: 500, lineage: { allocationBreakdown: [{ sourceWarehouseId: 'X', allocatedQty: 500 }] } }]
  });
  ok(cmd.command.recommendedLines.length === 1, 'MONTHLY line NOT fanned out (allocationBreakdown ignored for MONTHLY)');
  eq(PB.splitLineKey('MONTHLY_ORDER', cmd.command.recommendedLines[0].lineKey), { request_month: '2026-09', request_bucket: 'T1' }, 'MONTHLY key stays 2-part (request_month + request_bucket)');
})();

section('config — WEEKLY line key + nullable designation');
eq(REPO.TABLES.WEEKLY_SHIPPING.lineKey, ['sku', 'site_sku', 'window_code', 'source_warehouse_id', 'route_no'], 'WEEKLY_SHIPPING.lineKey = 5-part');
ok(REPO.TABLES.WEEKLY_SHIPPING.nullableLineKey && REPO.TABLES.WEEKLY_SHIPPING.nullableLineKey.source_warehouse_id === 1 && REPO.TABLES.WEEKLY_SHIPPING.nullableLineKey.route_no === 1, 'source_warehouse_id + route_no are nullable key parts');
eq(REPO.TABLES.MONTHLY_ORDER.lineKey, ['request_month', 'request_bucket'], 'MONTHLY_ORDER.lineKey UNCHANGED');
ok(REPO.TABLES.WEEKLY_SHIPPING.userQty === 'planned_qty', 'planned_qty is the user decision column (NOT overloaded — source qty is source_allocated_qty_snapshot)');

console.log('\n----------------------------------------');
console.log('SHIPPING MULTI-SOURCE EXECUTION (F1-4B-FM6-R3C2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
