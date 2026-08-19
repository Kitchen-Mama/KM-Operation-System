// Kitchen Mama Operation System — F1-7N-C1 Weekly AI Plan recommendation-draft persistence wiring.
// Run: node assets/tests/weekly-ai-plan-recommendation-draft-persistence-f1-7n-c1-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the THIN adapter buildWeeklySourceAllocation (F1-7N-B §35A) → bridgeRecommendationFactsToPlan →
// runRecommendationGeneration (existing locked persistence engine) → shipping_allocation_drafts / _lines.
// The adapter recalculates nothing; the plan is captured via an injected fake lockedApply (no real DB / no lock).
// Deep persistence behaviors (REUSE/refresh, user-edit fingerprinting, locking internals, MONTHLY) are owned by the
// REUSED engine and covered by its own suites (production-writer / persistence / orchestrator / monthly) — this
// suite proves the NEW seam is correct and reaches those guards.

var fs = require('fs'), path = require('path');
var A = require('../js/core/supply-planning-weekly-recommendation-draft.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A2 = JSON.stringify(a), E = JSON.stringify(e); if (A2 === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A2); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-CN-YOUXIN', TW = 'WH-TW-SHENGYI';
function opool(k, w, q) { return { poolKey: k, poolType: 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function rcv(dk, over) { var o = { receiverKey: 'R-' + dk, demandKey: dk, marketplace: 'amz', destinationWarehouseId: 'DEST-' + dk, fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 0, allocationPriority: 5, demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] }; if (over) for (var k in over) o[k] = over[k]; return o; }
function fpool(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function fdem(dk, over) { var o = { demandKey: dk, company: 'KM', marketplace: 'amz', destinationWarehouseId: 'DEST-' + dk, requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 100, eligibleFactoryWarehouseIds: [CN, TW] }; if (over) for (var k in over) o[k] = over[k]; return o; }
function wf(dk, site, gap, upc) { var o = { recommendationType: 'WEEKLY_SHIPPING', sku: 'SKU1', siteSku: site, windowCode: 'D30', demandKey: dk, calculatedGap: gap }; if (upc !== undefined) o.unitsPerCarton = upc; return o; }

function builder(over, fac, facts, scopeOver) {
  return { planningCycle: '2026-W37', businessScope: scopeOver || { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, masterSku: 'SKU1', overseasInput: over, factory: fac, weeklyPlanningFacts: facts };
}
// Drive the adapter with fake repo/lock deps that capture the persistence plan.
function persist(builderInput, over, depOver) {
  var captured = {};
  var deps = {
    loadActiveContext: function () { return (depOver && depOver.active) || { status: 'CREATE' }; },
    loadPriorSnapshot: function () { return (depOver && depOver.prior !== undefined) ? depOver.prior : null; },
    lockedApply: function (plan, token, opts) { captured.plan = plan; captured.token = token; captured.opts = opts; return (depOver && depOver.lockResult) || { status: 'COMPLETED' }; }
  };
  var input = { builderInput: builderInput, mode: (over && over.mode) || 'SCHEDULED_REFRESH', planningCycle: '2026-W37', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'inventory_replenishment' }, actor: 't', now: '2026-08-19' };
  if (over && over.scope) input.businessScope = over.scope;
  var res = A.persistWeeklyRecommendationDraft(input, deps);
  return { res: res, plan: captured.plan, token: captured.token, opts: captured.opts };
}
function linesOf(plan) { return (plan && plan.lineOps) || []; }
function srcIds(plan) { return linesOf(plan).map(function (l) { return l.naturalKey.source_warehouse_id; }).sort(); }
function plannedSum(plan) { var s = 0; linesOf(plan).forEach(function (l) { s += (typeof l.row.planned_qty === 'number' ? l.row.planned_qty : 0); }); return s; }

// =================================================================================================================
section('A/B — B output → canonical WEEKLY_SHIPPING header + per-source lines (CREATE)');
var e2e = persist(builder(
  { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 30)], receivers: [rcv('D1', { demandQty: 100 })] },
  { factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 100, 1)]));
eq(e2e.res.status, 'COMPLETED', 'A CREATE → COMPLETED');
ok(e2e.res.wrote === true && e2e.res.coreAction === 'CREATE', 'A wrote=true, coreAction=CREATE');
eq(e2e.plan.recommendationType, 'WEEKLY_SHIPPING', 'A plan type WEEKLY_SHIPPING');
eq(e2e.plan.sourceTables, { header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines' }, 'A writes only the shipping draft tables');
eq(e2e.plan.headerOp.op, 'INSERT', 'B header INSERT');
eq([e2e.plan.headerOp.row.planning_cycle, e2e.plan.headerOp.row.company, e2e.plan.headerOp.row.country, e2e.plan.headerOp.row.marketplace, e2e.plan.headerOp.row.source_page], ['2026-W37', 'KM', 'US', 'AMAZON_US', 'inventory_replenishment'], 'B header carries K3 scope');
eq(e2e.plan.headerOp.row.status, 'draft', 'B header status = draft (non-commit)');

section('E — Overseas + CN + TW → three per-source execution lines (planned_qty per source; recommended_qty aggregate)');
eq(srcIds(e2e.plan), [CN, TW, 'W-OV'].sort(), 'E one line per physical source (Overseas + CN + TW)');
var byWh = {}; linesOf(e2e.plan).forEach(function (l) { byWh[l.naturalKey.source_warehouse_id] = l.row; });
eq([byWh['W-OV'].planned_qty, byWh[CN].planned_qty, byWh[TW].planned_qty], [30, 30, 40], 'E per-source planned_qty = §35A Overseas 30 / CN 30 / TW 40');
eq([byWh['W-OV'].recommended_qty, byWh[CN].recommended_qty, byWh[TW].recommended_qty], [100, 100, 100], 'E recommended_qty = aggregate 100 (verbatim on each source line; never re-split)');
eq(plannedSum(e2e.plan), 100, 'M/E conservation: per-source planned_qty sums to the aggregate (count-once; never over-allocated)');

section('C — Overseas-only fully covers → single overseas line, factory untouched');
var C = persist(builder(
  { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 100)], receivers: [rcv('D1', { demandQty: 100 })] },
  { factoryPools: [fpool('FC', CN, 50), fpool('FT', TW, 50)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 100, 1)]));
eq(srcIds(C.plan), ['W-OV'], 'C single overseas source line (CN/TW untouched)');
eq(byLine(C.plan, 'W-OV').planned_qty, 100, 'C overseas planned_qty = 100');

section('D — Overseas + CN (TW untouched)');
var D = persist(builder(
  { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 60)], receivers: [rcv('D1', { demandQty: 100 })] },
  { factoryPools: [fpool('FC', CN, 100), fpool('FT', TW, 100)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 100, 1)]));
eq(srcIds(D.plan), [CN, 'W-OV'].sort(), 'D overseas + CN lines only (TW untouched)');

section('G — carton FLOOR persisted verbatim (Gap 100, CN 95, UPC 24 → recommended 72; residual 28 NOT persisted as an order)');
var G = persist(builder(null,
  { factoryPools: [fpool('FC', CN, 95)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 100, 24)]));
eq(byLine(G.plan, CN).recommended_qty, 72, 'G recommended_qty = FLOOR(95/24)*24 = 72 (verbatim from B)');
eq(byLine(G.plan, CN).planned_qty, 72, 'G planned_qty = 72 (whole-carton execution)');

section('F/W/X — unresolved production need does NOT create a procurement record / reservation / PO');
var full = JSON.stringify(G.plan);
ok(full.indexOf('request_order') === -1 && full.indexOf('purchase_order') === -1, 'F/W plan touches NO request_order / purchase_order table');
ok(full.indexOf('reserve') === -1 && full.indexOf('reservation') === -1 && full.indexOf('deduct') === -1, 'X plan performs NO reservation / stock deduction');
ok(G.res.status === 'COMPLETED', 'F residual (28) is informational only — the draft still persists the shipping recommendation');

section('U — NO carrier / rate / lead-time / ETA / cost fields anywhere in the persisted plan');
['carrier_id', 'recommended_carrier_id', 'selected_carrier_id', 'rate_card_id', 'selected_rate_card_id', 'lead_time_id', 'selected_lead_time_id', 'expected_arrival', 'estimated_cost', 'freight', 'duty', 'customs', 'landed'].forEach(function (f) {
  ok(full.indexOf(f) === -1, 'U plan contains NO forbidden logistics field: ' + f);
});
// (eta guard: allow no standalone eta key)
ok(!/"[a-z_]*eta[a-z_]*"\s*:/.test(full), 'U plan contains no ETA field');

section('H — zero recommendation (gap 0) → line with recommended_qty 0 (valid zero, not blocked)');
var H = persist(builder(null, { factoryPools: [fpool('FC', CN, 0)], demands: [fdem('D1', { demandQty: 0 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 0, 1)]));
ok(linesOf(H.plan).length >= 1 && linesOf(H.plan)[0].row.recommended_qty === 0, 'H recommended_qty = 0 (valid zero)');

section('I — blocked recommendation (missing UPC) → blocked line, recommended_qty blank (never fabricated)');
var I = persist(builder(null, { factoryPools: [fpool('FC', CN, 95)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 100)]));
ok(linesOf(I.plan).some(function (l) { return l.targetLineStatus === 'blocked'; }), 'I blocked line present');
ok(linesOf(I.plan).every(function (l) { return l.row.recommended_qty === '' || l.row.recommended_qty === null || l.row.recommended_qty === undefined; }), 'I blocked → recommended_qty blank (no fabricated qty)');

section('J — multi-SKU → one aggregate/per-source set per SKU');
var J = persist(builder(null,
  { factoryPools: [fpool('FC', CN, 200)], demands: [fdem('D1', { demandQty: 50 }), fdem('D2', { demandQty: 50 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 50, 1), { recommendationType: 'WEEKLY_SHIPPING', sku: 'SKU1', siteSku: 'S2', windowCode: 'D30', demandKey: 'D2', calculatedGap: 50, unitsPerCarton: 1 }]));
var jSites = {}; linesOf(J.plan).forEach(function (l) { jSites[l.naturalKey.site_sku] = 1; });
eq(Object.keys(jSites).sort(), ['S1', 'S2'], 'J both SKUs/sites persisted as distinct lines');

section('K/L — scope isolation: the K3 draft id reflects company/country/marketplace scope');
var K = persist(builder(
  { company: 'AC', country: 'CA', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 100)], receivers: [rcv('D1', { demandQty: 100 })] },
  null, [wf('D1', 'S1', 100, 1)],
  { company: 'AC', country: 'CA', marketplace: 'AMAZON_CA' }),
  { scope: { company: 'AC', country: 'CA', marketplace: 'AMAZON_CA', source_page: 'inventory_replenishment' } });
ok(/company=AC\|country=CA\|marketplace=AMAZON_CA/.test(K.res.draftId), 'K/L different scope → distinct K3 draft id (company/country/marketplace isolated)');

section('N — K3 Active REUSE (matching canonical draft) proceeds (not a foreign/conflict)');
var reuseDraftId = e2e.res.draftId;   // the CREATE canonical id for the KM/US/AMAZON_US scope
var N = persist(builder(
  { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 30)], receivers: [rcv('D1', { demandQty: 100 })] },
  { factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] },
  [wf('D1', 'S1', 100, 1)]),
  null,
  { active: { status: 'REUSE', draftId: reuseDraftId }, prior: { draft: { allocation_draft_id: reuseDraftId, status: 'draft', draft_version: 1 }, lines: [], runs: [] } });
ok(N.res.status === 'COMPLETED' && N.res.draftId === reuseDraftId, 'N REUSE with matching canonical id → proceeds on the SAME K3 draft (REFRESH)');

section('O — K3 duplicate Active → BLOCKED_CONFLICT');
var O = persist(builder(null, { factoryPools: [fpool('FC', CN, 30)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 100, 1)]),
  null, { active: { status: 'BLOCKED_CONFLICT', matchCount: 2 } });
eq(O.res.status, 'BLOCKED_CONFLICT', 'O duplicate Active → BLOCKED_CONFLICT');
ok(/DUPLICATE_ACTIVE_DRAFT/.test(O.res.reason), 'O reason = DUPLICATE_ACTIVE_DRAFT');

section('T — terminal (submitted) draft is not mutated as an active working draft');
var T = persist(builder(null, { factoryPools: [fpool('FC', CN, 30)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 100, 1)]),
  null, { prior: { draft: { allocation_draft_id: 'X', status: 'submitted', draft_version: 1 }, lines: [], runs: [] } });
eq(T.res.status, 'BLOCKED_CONFLICT', 'T terminal submitted → BLOCKED_CONFLICT (not mutated)');
ok(/IMMUTABLE_TERMINAL_STATUS|GENERATION_BLOCKED_STATUS/.test(T.res.reason), 'T reason = terminal/generation-blocked guard');

section('Q — idempotency: identical input → identical plan line natural keys (deterministic)');
var q1 = persist(builder({ company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 30)], receivers: [rcv('D1', { demandQty: 100 })] }, { factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 100, 1)]));
var q2 = persist(builder({ company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: [opool('OV1', 'W-OV', 30)], receivers: [rcv('D1', { demandQty: 100 })] }, { factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], demands: [fdem('D1', { demandQty: 100 })], cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, [wf('D1', 'S1', 100, 1)]));
eq(linesOf(q1.plan).map(function (l) { return l.naturalKey; }), linesOf(q2.plan).map(function (l) { return l.naturalKey; }), 'Q identical input → identical line natural keys (no duplicate on rerun)');

section('adapter is WEEKLY-only + reuses the existing engine (no second persistence engine)');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-weekly-recommendation-draft.js'), 'utf8');
ok(/runRecommendationGeneration/.test(SRC) && /bridgeRecommendationFactsToPlan/.test(SRC) && /buildWeeklySourceAllocation/.test(SRC), 'adapter delegates to the existing builder + bridge + orchestrator (no reimplementation)');
ok(/recommendationType: 'WEEKLY_SHIPPING'/.test(SRC) && SRC.indexOf('MONTHLY_ORDER') === -1, 'adapter is WEEKLY_SHIPPING-only (never touches MONTHLY_ORDER)');
ok(!/generateRecommendationDraft\s*=|function generateRecommendationDraft|SpreadsheetApp|appendRow|setValues|new Gap|calculateGap|allocate[A-Z]/.test(SRC), 'adapter introduces NO second persistence/allocation engine, NO I/O, NO formula');

function byLine(plan, wh) { var r = null; linesOf(plan).forEach(function (l) { if (l.naturalKey.source_warehouse_id === wh) r = l.row; }); return r || {}; }

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN DRAFT PERSISTENCE (F1-7N-C1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
