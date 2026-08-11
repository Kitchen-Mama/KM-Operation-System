// Kitchen Mama Operation System — F1-4B-FM6-R4E2 Request Order Draft Snapshot Completeness.
// Run: node assets/tests/gap-backed-draft-snapshot-f1-4b-fm6r4e2.test.js
// -----------------------------------------------------------------------------
// Proves the gap authority becomes the canonical persisted MONTHLY_ORDER draft quantity, WITHOUT schema change,
// formula change, second cartonization, or a second persister:
//   (A) the PURE gap-row → draft-facts mapper (recGenMapGapRowToFacts_, extracted from 47_) emits recommended_qty =
//       tN_suggested_qty VERBATIM, calculated_gap_qty_snapshot = tN_gap_qty, canonical UPC, carton = suggested/UPC,
//       T1/T2/T3 only (T4 never actionable), and FAILS CLOSED on missing/BLOCKED/no-UPC gap;
//   (B) feeding those facts through the EXISTING locked writer (KMPW → KMPR) persists every target column onto
//       request_order_allocation_draft_lines (schema already sufficient) and read-back returns the same values;
//   (C) the frozen user-edit protection preserves a manually edited order_qty across a regenerate while
//       recommended_qty refreshes from the new gap (no second protection engine);
//   (D) the 47_ gap-backed path + router wire the backend contract with NO calculateGap/KMSF recompute, no sheet
//       creation, no frontend wiring.

// NOTE: no top-level 'use strict' — the PURE 47_ block is eval'd into module scope (strict eval would sandbox it).
var KMPW = require('../js/core/supply-planning-production-writer.js');
var fs = require('fs'), path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return src.slice(a, b); }

var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS_ROUTER = read('specs/active/apps-script/01_router.gs');

// ---- extract + eval the PURE gap-row → facts mapper (no globals beyond Math/Number) ----
eval(slice(GS47, '// __GAPDRAFT_PURE_START__', '// __GAPDRAFT_PURE_END__'));
ok(typeof recGenMapGapRowToFacts_ === 'function', 'X1 recGenMapGapRowToFacts_ eval OK');

// ---- fakes / helpers for the end-to-end persist (mirrors supply-planning-production-writer.test.js) ----
function fakeLock() { var st = { acquired: 0, released: 0 }; return { acquire: function () { st.acquired++; return true; }, release: function () { st.released++; }, _st: st }; }
function rowsAsObjects(sheetSet, table) { var t = sheetSet[table]; return t.rows.map(function (r) { var o = {}; t.headers.forEach(function (h, i) { o[h] = r[i]; }); return o; }); }
function seedMonthly() {
  var s = KMPW.seedSheetSet('MONTHLY_ORDER');
  // The LIVE line schema (15_) carries additive user-edit provenance columns beyond DRAFT_HEADERS — include them so a
  // manual edit round-trips through loadDraftSnapshot (else every row is only legacy-protected).
  var lt = s.request_order_allocation_draft_lines;
  ['user_edited', 'user_edited_by'].forEach(function (h) { if (lt.headers.indexOf(h) < 0) lt.headers.push(h); });
  return s;
}
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'CO1100-R' };
function persistGapFacts(sheetSet, lines, mode, confirm) {
  var request = { recommendationType: 'MONTHLY_ORDER', mode: mode || 'MANUAL_REGENERATE', planningCycle: '2026-M08', businessScope: MSCOPE };
  var env = { sheetSet: sheetSet, canonicalSpreadsheet: {}, request: request, lock: fakeLock() };
  var deps = KMPW.sheetSetDeps(env);
  deps.computeFacts = function () { return { lines: lines, ready: true, formulaVersion: 'ORDER_PLANNING_GAP', sourceDataAsOf: '2026-08-10T00:00:00Z' }; };
  return KMPW.persistProductionRecommendation({
    recommendationType: 'MONTHLY_ORDER', mode: mode || 'MANUAL_REGENERATE', planningCycle: '2026-M08',
    businessScope: MSCOPE, confirmRegenerateOverUserEdits: confirm === true, actor: 'sys', now: 'T1'
  }, deps);
}
// mutate one persisted line in place (simulate a user edit landing on the sheet)
function editLine(sheetSet, bucket, patch) {
  var t = sheetSet.request_order_allocation_draft_lines; var ci = {}; t.headers.forEach(function (h, i) { ci[h] = i; });
  for (var r = 0; r < t.rows.length; r++) { if (String(t.rows[r][ci.request_bucket]) === bucket) { for (var k in patch) if (ci[k] != null) t.rows[r][ci[k]] = patch[k]; } }
}

// gap fixtures (canonical carton-rounded suggested already stored; UPC 40 from sku_details).
function gapRow(over) {
  var base = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY',
    calculation_month: '2026-08', calculated_at: '2026-08-10T00:00:00Z', updated_at: '2026-08-10T00:00:00Z',
    t1_month: '2026-08', t1_gap_qty: 0, t1_suggested_qty: 0,
    t2_month: '2026-09', t2_gap_qty: 0, t2_suggested_qty: 0,
    t3_month: '2026-10', t3_gap_qty: 0, t3_suggested_qty: 0,
    t4_month: '2026-11', t4_gap_qty: 9999, t4_suggested_qty: 10000 };
  for (var k in (over || {})) base[k] = over[k];
  return base;
}
var UPC = 40;

// =============================================================================
section('A/§2/§5/§9 — PURE mapper: recommended = tN_suggested VERBATIM, gap snapshot, canonical carton, T1/T2/T3 only');
(function () {
  var built = recGenMapGapRowToFacts_(gapRow({ t2_gap_qty: 3884, t2_suggested_qty: 3920, t3_gap_qty: 7500, t3_suggested_qty: 7520 }), UPC);
  ok(built.ready === true, 'A0 mapper ready');
  eq(built.lines.map(function (l) { return l.request_bucket; }), ['T1', 'T2', 'T3'], 'A1 T1/T2/T3 only — T4 never an actionable line');
  eq(built.lines.map(function (l) { return l.recommendedQty; }), [0, 3920, 7520], 'A2 recommended_qty = tN_suggested_qty VERBATIM (no re-ceiling)');
  eq(built.lines.map(function (l) { return l.snapshotRow.calculated_gap_qty_snapshot; }), [0, 3884, 7500], 'A3 calculated_gap_qty_snapshot = tN_gap_qty');
  eq(built.lines.map(function (l) { return l.snapshotRow.units_per_carton; }), [40, 40, 40], 'A4 UPC = canonical sku_details authority');
  eq(built.lines.map(function (l) { return l.snapshotRow.carton_qty; }), [0, 98, 188], 'A5 carton_qty = recommended_qty / UPC (existing canonical representation)');
  eq(built.lines.map(function (l) { return l.request_month; }), ['2026-08', '2026-09', '2026-10'], 'A6 request_month = tN_month');
  ok(built.lines.every(function (l) { return !('source_warehouse_id' in l.snapshotRow) && !('source_warehouse_id' in l); }), 'A7/Fixture D — quantity snapshot needs NO source warehouse lineage');
  ok(built.lines.every(function (l) { return l.snapshotRow.allocation_method === 'ORDER_PLANNING_GAP'; }), 'A8 lineage marker: quantity authority = ORDER_PLANNING_GAP');
})();

section('F/§6 — FAIL CLOSED: missing / BLOCKED / no-UPC / missing-month never fabricate a draft quantity');
(function () {
  eq(recGenMapGapRowToFacts_(null, UPC).ready, false, 'F1 missing gap row → not ready');
  eq(recGenMapGapRowToFacts_(gapRow({ calculation_status: 'BLOCKED' }), UPC).ready, false, 'F2 BLOCKED gap → not ready');
  eq(recGenMapGapRowToFacts_(gapRow({ calculated_at: '' }), UPC).ready, false, 'F3 no calculated_at → not ready');
  eq(recGenMapGapRowToFacts_(gapRow(), 0).reason, 'UNITS_PER_CARTON_UNAVAILABLE', 'F4 no canonical UPC → UNITS_PER_CARTON_UNAVAILABLE');
  eq(recGenMapGapRowToFacts_(gapRow({ t2_month: '' }), UPC).ready, false, 'F5 missing actionable tier month → not ready');
  eq(recGenMapGapRowToFacts_(gapRow({ t2_suggested_qty: '' }), UPC).ready, false, 'F6 blank suggested on a READY tier → not ready (never coerced to 0)');
  eq(recGenMapGapRowToFacts_(gapRow(), UPC).ready, true, 'F7 all-zero suggested is VALID (no order needed) — 0 is not "missing"');
})();

section('B/§7 — END-TO-END persist through the EXISTING locked writer: every target column lands on the draft line');
(function () {
  var built = recGenMapGapRowToFacts_(gapRow({ t2_gap_qty: 3884, t2_suggested_qty: 3920, t3_gap_qty: 7500, t3_suggested_qty: 7520 }), UPC);
  var set = seedMonthly();
  var res = persistGapFacts(set, built.lines);
  eq([res.status, res.persistenceStatus], ['COMPLETED', 'COMPLETED'], 'B0 persist COMPLETED via KMPW (no second persister)');
  var lines = rowsAsObjects(set, 'request_order_allocation_draft_lines').filter(function (l) { return ['T1', 'T2', 'T3'].indexOf(String(l.request_bucket)) >= 0; });
  lines.sort(function (a, b) { return String(a.request_bucket) < String(b.request_bucket) ? -1 : 1; });
  eq(lines.map(function (l) { return String(l.request_bucket); }), ['T1', 'T2', 'T3'], 'B1 three tiered lines persisted (no T4)');
  eq(lines.map(function (l) { return Number(l.recommended_qty); }), [0, 3920, 7520], 'B2 recommended_qty persisted VERBATIM from gap suggested');
  eq(lines.map(function (l) { return Number(l.order_qty); }), [0, 3920, 7520], 'B3 order_qty initialized from recommended_qty (frozen CREATE contract)');
  eq(lines.map(function (l) { return Number(l.calculated_gap_qty_snapshot); }), [0, 3884, 7500], 'B4 calculated_gap_qty_snapshot persisted (schema already sufficient)');
  eq(lines.map(function (l) { return Number(l.units_per_carton); }), [40, 40, 40], 'B5 units_per_carton persisted');
  eq(lines.map(function (l) { return Number(l.carton_qty); }), [0, 98, 188], 'B6 carton_qty persisted (recommended/UPC — no second cartonization)');
  eq(lines.map(function (l) { return String(l.request_month); }), ['2026-08', '2026-09', '2026-10'], 'B7 request_month = tN_month persisted');
})();

section('C/Fixture C — Factory-enough (gap suggested 0) persists recommended_qty 0 (never fabricated)');
(function () {
  var built = recGenMapGapRowToFacts_(gapRow(), UPC);   // all suggested 0
  var set = seedMonthly();
  persistGapFacts(set, built.lines);
  var lines = rowsAsObjects(set, 'request_order_allocation_draft_lines').filter(function (l) { return ['T1', 'T2', 'T3'].indexOf(String(l.request_bucket)) >= 0; });
  eq(lines.map(function (l) { return Number(l.recommended_qty); }), [0, 0, 0], 'C1 all-zero gap → recommended_qty 0 persisted');
})();

section('Fixture B — cross-company FM7 conservation preserved: A+B persist verbatim, do NOT re-expand toward 4000');
(function () {
  // FM7 already conserved the shared factory: A residual suggested 600 + B residual suggested 400 = 1000 (not 2200+1800).
  var builtA = recGenMapGapRowToFacts_(gapRow({ company: 'KM_A', sku: 'CO1100-R', t1_suggested_qty: 600, t1_gap_qty: 600 }), UPC);
  var builtB = recGenMapGapRowToFacts_(gapRow({ company: 'KM_B', sku: 'CO1100-R', t1_suggested_qty: 400, t1_gap_qty: 400 }), UPC);
  var a = builtA.lines[0].recommendedQty, b = builtB.lines[0].recommendedQty;
  eq([a, b, a + b], [600, 400, 1000], 'B/FM7 verbatim conserved residual (1000) — the persister has no factory logic to re-expand it');
})();

section('E/§3/§7 — manual order_qty preserved across regenerate while recommended_qty refreshes from new gap');
(function () {
  var set = seedMonthly();
  var built1 = recGenMapGapRowToFacts_(gapRow({ t1_suggested_qty: 3920, t1_gap_qty: 3884 }), UPC);
  persistGapFacts(set, built1.lines, 'MANUAL_REGENERATE');
  var t1a = rowsAsObjects(set, 'request_order_allocation_draft_lines').filter(function (l) { return String(l.request_bucket) === 'T1'; })[0];
  eq([Number(t1a.recommended_qty), Number(t1a.order_qty)], [3920, 3920], 'E1 initial: recommended=3920, order_qty=3920');
  // user edits order_qty on the sheet (explicit user_edited provenance)
  editLine(set, 'T1', { order_qty: 3600, user_edited: 'TRUE', user_edited_by: 'vic' });
  // new gap authority (suggested 4000) → confirmed regenerate
  var built2 = recGenMapGapRowToFacts_(gapRow({ t1_suggested_qty: 4000, t1_gap_qty: 3960 }), UPC);
  persistGapFacts(set, built2.lines, 'MANUAL_REGENERATE', true);
  var t1b = rowsAsObjects(set, 'request_order_allocation_draft_lines').filter(function (l) { return String(l.request_bucket) === 'T1'; })[0];
  eq(Number(t1b.recommended_qty), 4000, 'E2 recommended_qty refreshed to the new gap authority (4000)');
  eq(Number(t1b.order_qty), 3600, 'E3 manually edited order_qty PRESERVED (3600) — existing protection, no second engine');
})();

section('§8/idempotency — a second identical gap generation makes no duplicate active draft/line');
(function () {
  var built = recGenMapGapRowToFacts_(gapRow({ t2_suggested_qty: 3920, t2_gap_qty: 3884 }), UPC);
  var set = seedMonthly();
  persistGapFacts(set, built.lines, 'MANUAL_REGENERATE');
  var h1 = rowsAsObjects(set, 'request_order_allocation_drafts').length, l1 = rowsAsObjects(set, 'request_order_allocation_draft_lines').length;
  persistGapFacts(set, built.lines, 'MANUAL_REGENERATE');   // reuse same set → REUSE/REGENERATE, never a second draft
  eq([rowsAsObjects(set, 'request_order_allocation_drafts').length, rowsAsObjects(set, 'request_order_allocation_draft_lines').length], [h1, l1], 'ID1 no duplicate header/line on a second identical run');
  eq(rowsAsObjects(set, 'request_order_allocation_drafts').length, 1, 'ID2 exactly one active MONTHLY draft (per-sku header grain)');
})();

section('D/§4 — the 47_ gap-backed path recomputes NO quantity + creates NO sheet; router wires the backend contract');
(function () {
  var r4e2 = GS47.slice(GS47.indexOf('// __GAPDRAFT_PURE_START__'));
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var body = code(r4e2);
  ok(!/calculateGap|calculateSuggestedOrderQty|resolveMonthlyRecommendationFacts|KMSF|KMCALC|KMALLOC|KMAR|KMMSA/.test(body), 'D1 no gap/quantity recompute + no allocation engine in the gap-backed path');
  ok(!/insertSheet|createSheet|procurementEnsureSheet_/.test(body), 'D2 read-back creates NO sheet (read-only; uses gapReadObjects_)');
  ok(/formulaVersion:\s*'ORDER_PLANNING_GAP'/.test(r4e2) && /facts:\s*\{\s*lines:/.test(r4e2), 'D3 injects verbatim gap facts via the existing body.facts seam');
  ok(/rpoGenerateRecommendationDraftLockedResult_\(b\.body\)/.test(r4e2), 'D4 persistence delegated to the EXISTING locked writer core (no second persister)');
  ok(/R4E2_ACTIONABLE_TIERS_\s*=\s*\['T1',\s*'T2',\s*'T3'\]/.test(r4e2) && !/'T4'/.test(slice(GS47, '// __GAPDRAFT_PURE_START__', '// __GAPDRAFT_PURE_END__')), 'D5 T4 is never an actionable tier');
  ok(/request_order_allocation_drafts/.test(r4e2) && /request_order_allocation_draft_lines/.test(r4e2), 'D6 read-back reads the canonical draft header + lines');
  ok(/requestOrderDraft\.generateFromGap/.test(GS_ROUTER) && /handleGenerateRequestOrderDraftFromGap_/.test(GS_ROUTER), 'D7 router wires generateFromGap');
  ok(/requestOrderDraft\.getActive/.test(GS_ROUTER) && /handleGetActiveRequestOrderDraftReadback_/.test(GS_ROUTER), 'D8 router wires getActive read-back');
  // frontend generation wired in R4E3 — via the RESUMABLE JOB (startRequestOrderDraftJob), never the per-SKU
  // direct generateFromGap fan-out (which would be one POST per SKU). See ai-plan-canonical-job-f1-4b-fm6r4e3.
  var r4e2Front = read('js/pages/request-order.js');
  ok(/startRequestOrderDraftJob/.test(r4e2Front) && !/generateFromGap/.test(r4e2Front), 'D9 request-order.js drives the resumable draft JOB (F1-4B-FM6-R4E3), never the per-SKU generateFromGap fan-out');
})();

console.log('\n----------------------------------------');
console.log('GAP-BACKED DRAFT SNAPSHOT (F1-4B-FM6-R4E2): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
