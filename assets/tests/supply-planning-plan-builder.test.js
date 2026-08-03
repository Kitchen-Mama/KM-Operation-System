// Kitchen Mama Operation System — Recommendation Plan Builder tests (Phase 2C, Round 1G).
// Run: node assets/tests/supply-planning-plan-builder.test.js
// Pure Node — exercises assets/js/core/supply-planning-plan-builder.js. Verifies the frozen Analysis/Snapshot/
// Decision boundary: recommended_qty snapshot only, live-analysis excluded, no decision overwrite, deterministic.

'use strict';
var PB = require('../js/core/supply-planning-plan-builder.js');
var CORE = require('../js/core/supply-planning-persistence.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = PB.SEP;
var SCOPE_W = { planning_cycle: '2026-W32', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'REPLENISH' };
var SCOPE_M = { planning_cycle: '2026-08', company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'regular', sku: 'GA0450' };

function wInput(over) {
  var base = {
    recommendationType: 'WEEKLY_SHIPPING', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-W32',
    businessScope: SCOPE_W, calculationRunId: 'RUN-W-1', formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03', draftVersion: 1,
    lines: [
      { sku: 'GA0450', site_sku: 'ST1', window_code: 'W32', recommendedQty: 50, snapshotRow: { recommended_source_warehouse_id: 'WH-CN' }, lineage: { allocationKey: 'AK1' } },
      { sku: 'GA0450', site_sku: 'ST2', window_code: 'W32', recommendedQty: 30 }
    ]
  };
  if (over) for (var k in over) base[k] = over[k];
  return base;
}
function mInput(over) {
  var base = {
    recommendationType: 'MONTHLY_ORDER', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-08',
    businessScope: SCOPE_M, calculationRunId: 'RUN-M-1', formulaVersion: 'v4.7', sourceDataAsOf: '2026-08-03', draftVersion: 1,
    lines: [
      { request_month: '2026-08', request_bucket: 'T1', recommendedQty: 100, snapshotRow: { carton_qty: 5, units_per_carton: 20, allocation_method: 'ENGINE_B' } },
      { request_month: '2026-08', request_bucket: 'T2', recommendedQty: 137, snapshotRow: { carton_qty: 7, units_per_carton: 20 } }
    ]
  };
  if (over) for (var k in over) base[k] = over[k];
  return base;
}

// ==========================================================================
section('A. generation-type mapping');
(function () {
  eq(PB.mapGenerationType('SCHEDULED_REFRESH'), 'scheduled', 'A: SCHEDULED_REFRESH → scheduled');
  eq(PB.mapGenerationType('MANUAL_REGENERATE'), 'manual_refresh', 'A: MANUAL_REGENERATE → manual_refresh');
  throwsRange(function () { PB.mapGenerationType('user_created'); }, 'A: user_created is not an engine mode → RangeError');
  throwsRange(function () { PB.mapGenerationType('SUBMIT'); }, 'A: unsupported mode → RangeError');
  eq(PB.buildRecommendation(wInput()).generationType, 'scheduled', 'A: generationType surfaced on build');
  eq(PB.buildRecommendation(wInput({ mode: 'MANUAL_REGENERATE' })).generationType, 'manual_refresh', 'A: manual regenerate mapping on build');
})();

section('B. Weekly projection');
(function () {
  var out = PB.buildRecommendation(wInput());
  eq(out.command.recommendationType, 'WEEKLY_SHIPPING', 'B: command type');
  eq(out.command.mode, 'SCHEDULED_REFRESH', 'B: command mode preserved for Core');
  eq(out.command.recommendedLines.length, 2, 'B: two command lines');
  // stable ordering + reversible line keys
  eq(out.command.recommendedLines.map(function (l) { return l.lineKey; }),
    ['GA0450' + SEP + 'ST1' + SEP + 'W32', 'GA0450' + SEP + 'ST2' + SEP + 'W32'], 'B: reversible SEP-joined line keys, stable-sorted');
  eq(out.command.recommendedLines[0].recommendedQty, 50, 'B: recommendedQty carried (snapshot)');
  eq(out.command.recommendedLines[0].lineState, 'OK', 'B: OK lineState');
  ok(out.command.recommendedLines[0].planned_qty === undefined && out.command.recommendedLines[0].userQty === undefined, 'B: builder does NOT set a decision qty (Core initializes planned_qty)');
  // detail map carries structured natural key + extra snapshot row (no decision col)
  var d = out.lineDetails['GA0450' + SEP + 'ST1' + SEP + 'W32'];
  eq(d.naturalKey, { sku: 'GA0450', site_sku: 'ST1', window_code: 'W32' }, 'B: structured natural key in detail');
  eq(d.row, { recommended_source_warehouse_id: 'WH-CN' }, 'B: extra snapshot row preserved');
  ok(d.row.planned_qty === undefined && d.row.recommended_qty === undefined, 'B: detail row carries neither decision nor recommended_qty (added downstream)');
  eq(d.lineage, { allocationKey: 'AK1' }, 'B: runtime lineage retained in detail (not necessarily persisted)');
  // splitLineKey round-trips
  eq(PB.splitLineKey('WEEKLY_SHIPPING', out.command.recommendedLines[1].lineKey), { sku: 'GA0450', site_sku: 'ST2', window_code: 'W32' }, 'B: splitLineKey reconstructs natural key');
  // Core accepts the command unchanged
  var gen = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  eq(gen.result.status, 'COMPLETED', 'B: Persistence Core accepts the built command → COMPLETED');
  eq(gen.store.lines.length, 2, 'B: Core created two lines from the command');
  ok(gen.store.lines[0].userQty === 50 || gen.store.lines[1].userQty === 50, 'B: Core initialized planned qty from recommendedQty');
})();

section('C. Weekly blocked line — no fabricated zero');
(function () {
  var out = PB.buildRecommendation(wInput({ lines: [
    { sku: 'GA0450', site_sku: 'ST3', window_code: 'W33', blocked: true, reason: 'SUPPLY_LINEAGE_CONFLICT' }
  ] }));
  var l = out.command.recommendedLines[0];
  eq(l.recommendedQty, null, 'C: blocked line recommendedQty = null (never fabricated 0)');
  eq(l.lineState, 'BLOCKED', 'C: blocked lineState');
  eq(l.reason, 'SUPPLY_LINEAGE_CONFLICT', 'C: blocked reason carried');
  eq(out.lineDetails[l.lineKey].targetLineStatus, 'blocked', 'C: detail targetLineStatus=blocked');
  throwsType(function () { PB.buildRecommendation(wInput({ lines: [{ sku: 'X', site_sku: 'Y', window_code: 'Z', blocked: true }] })); }, 'C: blocked without reason → TypeError');
})();

section('D. Monthly projection + partial-carton exact');
(function () {
  var out = PB.buildRecommendation(mInput());
  eq(out.command.recommendationType, 'MONTHLY_ORDER', 'D: monthly type');
  eq(out.command.recommendedLines.map(function (l) { return l.lineKey; }), ['2026-08' + SEP + 'T1', '2026-08' + SEP + 'T2'], 'D: monthly line keys (month+bucket)');
  eq(out.command.recommendedLines[1].recommendedQty, 137, 'D: partial-carton recommended value carried exactly (not re-rounded)');
  var d2 = out.lineDetails['2026-08' + SEP + 'T2'];
  eq(d2.row.carton_qty, 7, 'D: carton_qty snapshot preserved');
  eq(d2.row.units_per_carton, 20, 'D: units_per_carton snapshot preserved');
  // company/sku live on the header scope, NOT on the line natural key (B-5 grain)
  eq(PB.splitLineKey('MONTHLY_ORDER', out.command.recommendedLines[0].lineKey), { request_month: '2026-08', request_bucket: 'T1' }, 'D: monthly line key excludes company/sku (B-5 grain)');
  ok(SCOPE_M.company === 'KM' && out.command.businessScope.sku === 'GA0450', 'D: company/sku carried on businessScope (header grain)');
  var gen = CORE.generateRecommendationDraft(CORE.createStore(), out.command);
  eq(gen.result.status, 'COMPLETED', 'D: Core accepts monthly command');
})();

section('E. live-analysis exclusion');
(function () {
  throwsRange(function () { PB.buildRecommendation(mInput({ lines: [{ request_month: '2026-08', request_bucket: 'T1', recommendedQty: 100, snapshotRow: { gap: 40 } }] })); }, 'E: snapshotRow.gap → RangeError (never persisted authority)');
  throwsRange(function () { PB.buildRecommendation(mInput({ lines: [{ request_month: '2026-08', request_bucket: 'T1', recommendedQty: 100, snapshotRow: { days_of_supply: 12 } }] })); }, 'E: snapshotRow.days_of_supply → RangeError');
  throwsRange(function () { PB.buildRecommendation(mInput({ lines: [{ request_month: '2026-08', request_bucket: 'T1', recommendedQty: 100, snapshotRow: { suggested_qty: 99 } }] })); }, 'E: snapshotRow.suggested_qty → RangeError');
  // assertNoLiveAnalysisAuthority is directly callable
  throwsRange(function () { PB.assertNoLiveAnalysisAuthority({ shortage: 1 }, 'x'); }, 'E: assertNoLiveAnalysisAuthority rejects shortage');
  ok(PB.buildRecommendation(mInput()).command.recommendedLines.length === 2, 'E: clean snapshotRow passes');
})();

section('F. determinism + validation');
(function () {
  // input-order independence: reversed input yields identical command
  var a = PB.buildRecommendation(wInput());
  var b = PB.buildRecommendation(wInput({ lines: wInput().lines.slice().reverse() }));
  eq(a.command, b.command, 'F: reversed input → identical command (stable-sorted)');
  eq(a, b, 'F: full build output deterministic');
  // validation
  throwsRange(function () { PB.buildRecommendation(wInput({ recommendationType: 'X' })); }, 'F: bad recommendationType → RangeError');
  throwsRange(function () { PB.buildRecommendation(wInput({ mode: 'NOPE' })); }, 'F: bad mode → RangeError');
  throwsType(function () { PB.buildRecommendation(wInput({ lines: 'x' })); }, 'F: non-array lines → TypeError');
  throwsType(function () { PB.buildRecommendation(wInput({ lines: [{ sku: 'A', site_sku: 'B', window_code: 'C', recommendedQty: 'x' }] })); }, 'F: non-number recommendedQty → TypeError');
  throwsRange(function () { PB.buildRecommendation(wInput({ lines: [{ sku: 'A', site_sku: 'B', window_code: 'C', recommendedQty: -1 }] })); }, 'F: negative recommendedQty → RangeError');
  throwsRange(function () { PB.buildRecommendation(wInput({ lines: [
    { sku: 'A', site_sku: 'B', window_code: 'C', recommendedQty: 1 },
    { sku: 'A', site_sku: 'B', window_code: 'C', recommendedQty: 2 }
  ] })); }, 'F: duplicate natural key → RangeError');
  throwsRange(function () { PB.buildRecommendation(wInput({ lines: [{ sku: 'A', site_sku: '', window_code: 'C', recommendedQty: 1 }] })); }, 'F: blank natural-key part → RangeError');
})();

section('G. boundary — no Submit / handoff surface');
(function () {
  var keys = Object.keys(PB);
  ok(keys.indexOf('submit') === -1 && keys.indexOf('sendRequest') === -1 && keys.indexOf('createWeeklyPlan') === -1 && keys.indexOf('createPO') === -1, 'G: module exposes no Submit/handoff/PO surface');
  // builder output has no committed-record side channel
  var out = PB.buildRecommendation(mInput());
  ok(out.command.recommendedLines.every(function (l) { return l.approved_qty === undefined && l.submitted === undefined; }), 'G: no approved/submitted fields in command lines');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1G Recommendation Plan Builder assertions passed (' + pass + ' assertions).');
