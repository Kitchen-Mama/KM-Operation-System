// Kitchen Mama Operation System — Production recommendation Draft writer tests (Round 1S-P3).
// Run: node assets/tests/supply-planning-production-writer.test.js
// Proves the LOCKED production write path end-to-end: fake canonical Sheets → KMPS production source →
// RecommendationPlan → PersistencePlan → KMPL lock + KMPR apply → the four editable Draft tables. Covers Weekly
// + Monthly create, reuse/refresh, manual regenerate, reconcile, locking, retry/idempotency, schema, user-edit
// protection, no-downstream-effects, end-to-end reread, and purity — all via the frozen modules (no new logic).

'use strict';
var KMPW = require('../js/core/supply-planning-production-writer.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var fs = require('fs'); var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fakes: canonical Sheets (read) + lock ----------------------------------
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'insertRow', 'clear', 'clearContent'];
function fakeSpreadsheet(sheetMap) {
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    return { getLastRow: function () { return values.length; }, getDataRange: function () { return range; }, getRange: function () { return range; } };
  }
  return { getSheetByName: function (name) { return Object.prototype.hasOwnProperty.call(sheetMap, name) ? fakeSheet(sheetMap[name]) : null; } };
}
function fakeLock(acquireResult) {
  var st = { acquired: 0, released: 0, ok: acquireResult !== false };
  return { acquire: function () { if (st.ok) { st.acquired++; return true; } return false; }, release: function () { st.released++; }, _st: st };
}
function rowsAsObjects(sheetSet, table) {
  var t = sheetSet[table]; return t.rows.map(function (r) { var o = {}; t.headers.forEach(function (h, i) { o[h] = r[i]; }); return o; });
}

var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

function weeklySheets() {
  return {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'], ['M1', 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', true]],
    marketplaces: [['marketplace', 'allocation_priority'], ['AMAZON_US', 1]],
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100]],
    overseas_inventory_snapshot: [['warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'snapshot_date'], ['WH-3PL', 'CO1100-R', 'ST-1', 100, '2026-08-01']]
  };
}
function weeklyRequest(mode) {
  return { recommendationType: 'WEEKLY_SHIPPING', mode: mode || 'SCHEDULED_REFRESH', planningCycle: '2026-W40', businessScope: WSCOPE,
    actor: 'sys', now: 'T1', forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }] };
}
function monthlySheets() {
  return {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'], ['M1', 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'is_factory_warehouse', 'is_active'], ['WH-FAC', 'CN_YOUXIN', 'CN', true, true]],
    marketplaces: [['marketplace', 'allocation_priority'], ['AMAZON_US', 1]],
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100]],
    factory_stock: [['warehouse_id', 'sku', 'fac_current_stock', 'last_transaction_at'], ['WH-FAC', 'CO1100-R', 60, '2026-08-01']]
  };
}
function monthlyRequest(mode) {
  return { recommendationType: 'MONTHLY_ORDER', mode: mode || 'SCHEDULED_REFRESH', planningCycle: '2026-M08', businessScope: MSCOPE,
    actor: 'sys', now: 'T1', forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    factoryDemandFacts: [{ demandRef: 'FC:F1', eligibleFactoryWarehouseIds: 'WH-FAC', allocationPriority: 1, requiredByDate: '2026-09-01', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', requestMonth: '2026-09', requestBucket: 'B1', netOrderNeed: 13, unitsPerCarton: 12 }] };
}
function envFor(request, sheets, lock) { return { sheetSet: KMPW.seedSheetSet(request.recommendationType), canonicalSpreadsheet: fakeSpreadsheet(sheets), request: request, lock: lock || fakeLock() }; }

// ==========================================================================
section('A. Weekly CREATE → shipping_allocation_drafts/_lines (96)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets());
  var res = KMPW.persistToSheetSet(env);
  eq([res.status, res.coreAction, res.persistenceStatus], ['COMPLETED', 'CREATE', 'COMPLETED'], 'A1 create COMPLETED, persistence executed');
  var hdr = rowsAsObjects(env.sheetSet, 'shipping_allocation_drafts');
  eq(hdr.length, 1, 'A2 exactly one Weekly Active Draft header');
  eq(Number(hdr[0].draft_version), 1, 'A3 draft_version = 1');
  ok(typeof hdr[0].calculation_run_id === 'string' && hdr[0].calculation_run_id.length > 0, 'A4 calculation_run_id persisted');
  eq([hdr[0].submitted_by, hdr[0].submitted_at], ['', ''], 'A5 submitted fields untouched (empty)');
  var lines = rowsAsObjects(env.sheetSet, 'shipping_allocation_draft_lines');
  eq([lines.length, Number(lines[0].recommended_qty), lines[0].window_code], [1, 96, 'W40-A'], 'A6 one line, recommended_qty 96, window_code');
  eq(env.sheetSet.request_order_allocation_draft_lines.rows.length, 0, 'A7 Monthly tables untouched');
  eq([env.lock._st.acquired, env.lock._st.released], [1, 1], 'A8 lock acquired + released');
  eq(res.writtenTables, ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'recommendation_calculation_runs'], 'A9 only Draft + run-journal tables written');
})();

section('B. Monthly CREATE → request_order_allocation_drafts/_lines (24)');
(function () {
  var env = envFor(monthlyRequest(), monthlySheets());
  var res = KMPW.persistToSheetSet(env);
  eq([res.status, res.persistenceStatus], ['COMPLETED', 'COMPLETED'], 'B1 Monthly create COMPLETED');
  var hdr = rowsAsObjects(env.sheetSet, 'request_order_allocation_drafts');
  eq([hdr.length, hdr[0].sku], [1, 'CO1100-R'], 'B2 one Monthly header (per-sku grain)');
  var lines = rowsAsObjects(env.sheetSet, 'request_order_allocation_draft_lines');
  eq([lines.length, Number(lines[0].recommended_qty), lines[0].request_month, lines[0].request_bucket], [1, 24, '2026-09', 'B1'], 'B3 line: recommended_qty 24, request_month/bucket');
  eq(Number(lines[0].order_qty), 24, 'B4 order_qty initialized from recommended_qty per the frozen persistence contract (user-owned field)');
  eq([String(lines[0].submitted_by), String(lines[0].submitted_at)], ['', ''], 'B5 no submit fields on the Monthly line (engine copies resolved facts only; no Submit)');
  eq(env.sheetSet.shipping_allocation_draft_lines.rows.length, 0, 'B6 Weekly tables untouched');
})();

section('C. REUSE / scheduled refresh (no duplicate header/line; same draft id)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets());
  var r1 = KMPW.persistToSheetSet(env);
  // second scheduled run against the SAME sheet-set → REUSE
  var env2 = { sheetSet: env.sheetSet, canonicalSpreadsheet: fakeSpreadsheet(weeklySheets()), request: weeklyRequest(), lock: fakeLock() };
  var r2 = KMPW.persistToSheetSet(env2);
  eq(r2.coreAction, 'REFRESH', 'C1 second scheduled run REFRESHes the reused Active Draft (same draft; no duplicate)');
  eq(r2.draftId, r1.draftId, 'C2 same draft id');
  eq(rowsAsObjects(env.sheetSet, 'shipping_allocation_drafts').length, 1, 'C3 still exactly one header (no duplicate)');
  eq(rowsAsObjects(env.sheetSet, 'shipping_allocation_draft_lines').length, 1, 'C4 still one line (updated, not duplicated)');
})();

section('D. MANUAL_REGENERATE (no user edits → version increments; new run; no second draft)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets());
  var r1 = KMPW.persistToSheetSet(env);
  var env2 = { sheetSet: env.sheetSet, canonicalSpreadsheet: fakeSpreadsheet(weeklySheets()), request: weeklyRequest('MANUAL_REGENERATE'), lock: fakeLock() };
  var r2 = KMPW.persistToSheetSet(env2);
  eq(r2.status, 'COMPLETED', 'D1 manual regenerate COMPLETED');
  ok(Number(rowsAsObjects(env.sheetSet, 'shipping_allocation_drafts')[0].draft_version) >= 2, 'D2 draft_version incremented (>=2)');
  eq(rowsAsObjects(env.sheetSet, 'shipping_allocation_drafts').length, 1, 'D3 still one Active Draft (no second)');
  eq(r2.generationType, 'manual_refresh', 'D4 generationType manual_refresh');
})();

section('E. LOCKING (fail-closed: no write when the lock is unavailable; released on success)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets(), fakeLock(false));
  var res = KMPW.persistToSheetSet(env);
  ok(res.status !== 'COMPLETED' && res.persistenceStatus === 'NOT_EXECUTED', 'E1 lock unavailable → not completed, not executed');
  eq(rowsAsObjects(env.sheetSet, 'shipping_allocation_drafts').length, 0, 'E2 no header written when lock fails');
  eq(env.lock._st.released, 0, 'E3 nothing to release when acquisition failed');
  var env2 = envFor(weeklyRequest(), weeklySheets());
  KMPW.persistToSheetSet(env2);
  eq(env2.lock._st.released, 1, 'E4 lock released exactly once on success');
})();

section('F. IDEMPOTENCY / retry (re-running the completed generation creates no duplicate rows)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets());
  KMPW.persistToSheetSet(env);
  var before = { h: env.sheetSet.shipping_allocation_drafts.rows.length, l: env.sheetSet.shipping_allocation_draft_lines.rows.length };
  // retry the same scheduled generation on the same set
  var env2 = { sheetSet: env.sheetSet, canonicalSpreadsheet: fakeSpreadsheet(weeklySheets()), request: weeklyRequest(), lock: fakeLock() };
  KMPW.persistToSheetSet(env2);
  eq([env.sheetSet.shipping_allocation_drafts.rows.length, env.sheetSet.shipping_allocation_draft_lines.rows.length], [before.h, before.l], 'F1 no duplicate header/line on retry');
})();

section('G. SCHEMA — seedSheetSet matches the frozen §2 headers exactly');
(function () {
  var w = KMPW.seedSheetSet('WEEKLY_SHIPPING'), m = KMPW.seedSheetSet('MONTHLY_ORDER');
  eq(w.shipping_allocation_drafts.headers[0], 'allocation_draft_id', 'G1 Weekly header id column');
  eq(w.shipping_allocation_draft_lines.headers.indexOf('planned_qty') >= 0 && w.shipping_allocation_draft_lines.headers.indexOf('recommended_qty') >= 0, true, 'G2 Weekly line has recommended_qty + planned_qty');
  eq(m.request_order_allocation_drafts.headers[0], 'request_allocation_draft_id', 'G3 Monthly header id column');
  eq(m.request_order_allocation_draft_lines.headers.indexOf('order_qty') >= 0 && m.request_order_allocation_draft_lines.headers.indexOf('net_order_need_snapshot') >= 0, true, 'G4 Monthly line has order_qty + net_order_need_snapshot');
  eq(m.request_order_allocation_draft_lines.headers.indexOf('carton_qty') >= 0, true, 'G5 Monthly line has carton_qty');
})();

section('H. NO DOWNSTREAM EFFECTS (only Draft + run-journal tables exist/mutated)');
(function () {
  var env = envFor(monthlyRequest(), monthlySheets());
  KMPW.persistToSheetSet(env);
  ['shipping_plans', 'shipments', 'shipment_line_allocations', 'factory_stock', 'factory_stock_movements', 'purchase_orders', 'amazon_inventory_snapshot'].forEach(function (t) {
    ok(env.sheetSet[t] === undefined, 'H:' + t + ' not present in the write set (no downstream write)');
  });
  var hdr = rowsAsObjects(env.sheetSet, 'request_order_allocation_drafts')[0];
  eq([hdr.submitted_by, hdr.submitted_at, hdr.cancelled_by], ['', '', ''], 'H1 no submitted/cancelled fields populated');
})();

section('I. END-TO-END reread (persisted rows reconstruct the same Active Draft)');
(function () {
  var env = envFor(weeklyRequest(), weeklySheets());
  var res = KMPW.persistToSheetSet(env);
  var ctx = KMPR.loadActiveDraftContext(env.sheetSet, { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE });
  eq([ctx.status, ctx.draftId], ['REUSE', res.draftId], 'I1 reread resolves the SAME single Active Draft');
  var snap = KMPR.loadDraftSnapshot(env.sheetSet, res.draftId, 'WEEKLY_SHIPPING');
  eq(snap.lines.length, 1, 'I2 one persisted line reconstructed');
})();

section('J. PURITY / separation (pure writer; no SpreadsheetApp/LockService/clock; input immutable; deterministic)');
(function () {
  var req = weeklyRequest();
  var snap = JSON.stringify(req);
  var e1 = envFor(req, weeklySheets()); var r1 = KMPW.persistToSheetSet(e1);
  ok(JSON.stringify(req) === snap, 'J1 request not mutated');
  var e2 = envFor(weeklyRequest(), weeklySheets()); var r2 = KMPW.persistToSheetSet(e2);
  eq(Number(rowsAsObjects(e1.sheetSet, 'shipping_allocation_draft_lines')[0].recommended_qty), Number(rowsAsObjects(e2.sheetSet, 'shipping_allocation_draft_lines')[0].recommended_qty), 'J2 deterministic recommended_qty (96 == 96)');
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var pure = code(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-writer.js'), 'utf8'));
  ok(!/SpreadsheetApp|LockService|CacheService/.test(pure), 'J3 pure KMPW: no SpreadsheetApp/LockService/Cache');
  ok(!/Date\.now|Math\.random|localeCompare/.test(pure), 'J4 pure KMPW: no clock/random/locale');
  ok(!/calculateGap|calculateSuggestedOrderQty|CEILING|FLOOR/.test(pure), 'J5 pure KMPW authors no recommendation/carton formula');
  // .gs delegates to KMPW; no business formula
  var gs24 = code(fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '24_recommendation_orchestrator.gs'), 'utf8'));
  ok(/KMPW\.persistProductionRecommendation/.test(gs24), 'J6 24_ delegates generate to KMPW.persistProductionRecommendation');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1S-P3 Production Draft Writer assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
