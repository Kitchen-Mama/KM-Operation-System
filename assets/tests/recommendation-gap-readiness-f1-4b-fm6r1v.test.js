// Kitchen Mama Operation System — F1-4B-FM6-R1V Recommendation → Execution boundary AUDIT + GAP-DONE readiness gate.
// Run: node assets/tests/recommendation-gap-readiness-f1-4b-fm6r1v.test.js
// -----------------------------------------------------------------------------
// AUDIT ROUND. It proves the CURRENT (audited) boundaries and locks the ONE bounded repair — the GAP-DONE readiness
// gate on the automation-ready callable runRecommendationGeneration (47.gs). It does NOT build the (still absent)
// Recommendation → Execution draft handoff. Facts proven here:
//   • KMREC is the ONE recommendation owner (manual AI Plan + backend callable both call it); it produces an
//     ephemeral DTO from a materialized gap row — NO allocation, NO execution lines, NO persistence.
//   • The Recommendation → Execution/allocation → draft-persistence handoff is NOT IMPLEMENTED (KMREC DTO exposes no
//     allocatedQty / uncoveredQty / executionLines) — documented HALT, not built.
//   • Order Planning actionable total was FROZEN in R1 (SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE) — never Σ of per-tier cartons.
//   • Recommendation generation FAILS CLOSED unless the durable gap job is DONE/absent (§11) — never partial rows.
//   • AI Plan is display-only: no PO / shipment / stock / submit / persistence write.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
// KMREC delegates the OP actionable-total carton rounding to the canonical KMCALC owner (bundle global in prod).
global.KMCALC = require('../js/core/supply-planning-calculations.js');
var KMREC = require('../js/core/supply-recommendation.js');
var F47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var F47CODE = F47.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var INV = read('js/pages/inventory-replenishment.js');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Extract the PURE readiness decision helper from 47.gs and evaluate it in isolation (no Apps Script globals).
var m = F47.match(/function recGenGapReadyFromState_\(state\) \{[\s\S]*?\n\}/);
ok(!!m, 'gate helper recGenGapReadyFromState_ is defined');
var ready = m ? (new Function('return (' + m[0] + ')'))() : function () { return { ready: false }; };

section('§11/§13 A-C — GAP-DONE readiness gate (fail closed on any incomplete/failed gap cycle)');
eq(ready({ status: 'DONE' }).ready, true, 'A gap job DONE → recommendation ALLOWED');
eq(ready(null).ready, true, 'A2 no in-flight job (NONE) → allowed (a complete cycle; state was never started/was cleared)');
eq(ready({ status: 'PENDING' }).ready, false, 'B gap job PENDING → NOT advanced');
eq(ready({ status: 'RUNNING' }).ready, false, 'B2 gap job RUNNING → NOT advanced (never consume partial rows)');
eq(ready({ status: 'FAILED' }).ready, false, 'C gap job FAILED → no recommendation');
eq(ready({ status: 'BLOCKED' }).ready, false, 'C2 gap job BLOCKED → no recommendation');
eq(ready({ status: 'ERROR' }).ready, false, 'C3 gap job ERROR → no recommendation');
eq(ready({ status: 'STALLED' }).ready, false, 'C4 a (non-durable) STALLED status is also treated as not-ready (defensive)');

section('§11 — the gate is wired INTO the automation-ready callable BEFORE any gap-row read');
ok(/recGenGapReadyFromState_\(recGenReadGapJobState_\(p\)\)/.test(F47), 'G1 runRecommendationGeneration evaluates the readiness gate for the product');
ok(/GAP_JOB_NOT_DONE/.test(F47), 'G2 a not-ready gate returns the explicit GAP_JOB_NOT_DONE deferral code');
// the gate short-circuits BEFORE recGenReadGapRows_ (never reads partial rows)
ok(F47.indexOf('recGenGapReadyFromState_(recGenReadGapJobState_(p))') < F47.indexOf('var rows = recGenReadGapRows_(p)'), 'G3 the gate runs BEFORE reading gap rows (fail-closed: partial rows are never consumed)');
ok(/gapJobReadState_\(gapJobDefaultEnv_\(product\), product\)/.test(F47), 'G4 job state is read via the canonical 46.gs owner (no new state owner)');

section('§2 — CO1100-R Inventory trace: KMREC produces the recommendation; execution handoff is NOT IMPLEMENTED');
// deterministic fixture equivalent to the live example (recommendedQty derived from the stored row, NOT hard-coded).
var D90_SUGGESTED = 4200, D90_GAP = 4180;
var co1100 = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY',
  calculation_date: '2026-08-10', d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 0, d30_suggested_qty: 0,
  d45_gap_qty: 0, d45_suggested_qty: 0, d90_gap_qty: D90_GAP, d90_suggested_qty: D90_SUGGESTED, calculated_at: '2026-08-10 13:30:00' };
var dto = KMREC.generateInventoryRecommendation(co1100, { now: 'T' });
eq([dto.status, dto.primaryWindow], ['READY', 'D90'], 'T1 earliest non-zero shortage window = D90 (D18/D30/D45 all zero)');
eq(dto.suggestedQty, co1100.d90_suggested_qty, 'T2 recommendedQty = the STORED d90_suggested_qty (derived from the materialized row, never fabricated)');
// The execution/allocation stage does not exist yet → the DTO carries NO execution fields. Documented HALT.
ok(!('allocatedQty' in dto) && !('uncoveredQty' in dto) && !('executionLines' in dto), 'T3 KMREC DTO exposes NO allocatedQty / uncoveredQty / executionLines — the Recommendation → Execution handoff is NOT IMPLEMENTED (HALT, not built)');

section('§8 — NO_ACTION / BLOCKED never fabricate a quantity');
var noAct = KMREC.generateInventoryRecommendation(Object.assign({}, co1100, { d90_gap_qty: 0, d90_suggested_qty: 0 }), { now: 'T' });
eq([noAct.status, noAct.suggestedQty], ['NO_ACTION', null], 'E NO_ACTION → no action quantity');
var blocked = KMREC.generateInventoryRecommendation(Object.assign({}, co1100, { calculation_status: 'BLOCKED' }), { now: 'T' });
eq([blocked.status, blocked.suggestedQty], ['BLOCKED', null], 'F BLOCKED → no fabricated quantity, no draft');

section('§9/§22 — Order Planning total authority was FROZEN in R1 (never Σ of per-tier cartonized suggested)');
eq(KMREC.ORDER_TOTAL_AUTHORITY, 'SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE', 'P1 OP total authority = raw T1–T3 gap sum, cartonized ONCE (frozen)');
var op = KMREC.generateOrderPlanningRecommendation({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', calculation_month: '2026-08',
  t1_month: '2026-09', t1_gap_qty: 10, t1_suggested_qty: 40, t2_month: '2026-10', t2_gap_qty: 10, t2_suggested_qty: 40,
  t3_month: '2026-11', t3_gap_qty: 0, t3_suggested_qty: 0, t4_month: '2026-12', t4_gap_qty: 500, t4_suggested_qty: 520, calculated_at: '2026-08-10 03:30:00' }, { now: 'T', unitsPerCarton: 40 });
eq(op.tiers.map(function (t) { return t.suggestedQty; }), [40, 40, 0, 520], 'N OP T1–T4 preserved INDIVIDUALLY (each stored suggested verbatim)');
eq(op.totalRecommendedQty, 40, 'P2 actionable total = cartonize(10+10+0)=40 — NOT 40+40=80 (no invented Σ-of-cartons total)');
eq(op.forwardVisibility.t4GapQty, 500, 'P3 T4 excluded from the actionable total (forward visibility only)');

section('§7/§10 — AI Plan is DISPLAY-ONLY; manual + auto share the ONE KMREC owner; no execution/persistence write');
var invPlan = INV.slice(INV.indexOf('function handleReplenAiPlan'), INV.indexOf('window.handleReplenAiPlan'));
ok(/generateInventoryRecommendation/.test(invPlan) && /renderReplenishment\(\)/.test(invPlan), 'U1 Inventory AI Plan generates via KMREC then re-renders (display)');
ok(!/appendRow|setValues|createPurchaseOrder|purchase_order|createShipment|shipping_plan|submitPlan|deduct|allocat/i.test(invPlan), 'U2 Inventory AI Plan does NOT allocate / persist / create PO / shipment / submit (§7)');
var roPlan = RO.slice(RO.indexOf('function handleRequestOrderAiPlan'), RO.indexOf('window.handleRequestOrderAiPlan'));
ok(/generateOrderPlanningRecommendation/.test(roPlan) && !/order_qty|orderQty\s*=|createPurchaseOrder|createShipment/i.test(roPlan), 'U3 OP AI Plan generates via KMREC and never writes Order Qty / PO / shipment (§7/§9)');
ok(/KMREC\.generateBatch\(p, rows/.test(F47) && /window\.KMREC\.generateInventoryRecommendation/.test(INV) && /window\.KMREC\.generateOrderPlanningRecommendation/.test(RO), 'M manual (both pages) + automatic (47.gs) call the SAME KMREC owner — no browser-only execution engine');
ok(!/appendRow|setValues|setValue\(|insertSheet|createSheet|purchase_order|createShipment|shipping_plan/i.test(F47CODE), 'L 47.gs writes nothing (no PO / shipment / execution / persistence) — still ephemeral summary');

console.log('\n----------------------------------------');
console.log('RECOMMENDATION GAP READINESS + BOUNDARY AUDIT (F1-4B-FM6-R1V): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
