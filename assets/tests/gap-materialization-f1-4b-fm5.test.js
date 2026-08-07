// Kitchen Mama Operation System — Materialized Gap Tables + Manual Batch Recalculation (F1-4B-FM5).
// Run: node assets/tests/gap-materialization-f1-4b-fm5.test.js
// -----------------------------------------------------------------------------
// Proves the server-side materialization owner (43_api_v1_gap_materialization.gs): canonical D18/D30/D45/D90
// and T1–T4 mapping (verbatim, no page math, no Inventory↔Order convergence), valid-zero preserved, missing !=
// zero, multi-warehouse INDEPENDENT-first then SUM-aggregate (never pooled), bounded UPSERT (insert then update
// with NO duplicate), ONE canonical read per scope (never per-SKU), writes ONLY the allowed gap table. The .gs is
// eval'd with stubs for the S0.5 safety resolver + injected io (no live Spreadsheet, no bundle, no network).

var fs = require('fs'), path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '43_api_v1_gap_materialization.gs'), 'utf8');
var ROUTER = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '01_router.gs'), 'utf8');
var DBAPI = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- eval the module with safety-resolver stubs -----------------------------------------------------
var lastRequireSheetTable = null;
function makeStubEnv() {
  var stubs = ''
    + 'var prodExpectedDbId_ = function(){ return "DB-1"; };\n'
    + 'var prodAssertDbTarget_ = function(){ return true; };\n'
    + 'var prodSchemaError_ = function(tok){ var e = new Error(tok); e.safetyToken = tok; return e; };\n'
    + 'var Utilities = { formatDate: function(){ return "2026-08-07 12:00:00"; } };\n'
    + 'var Session = { getScriptTimeZone: function(){ return "Asia/Taipei"; } };\n'
    + 'var SpreadsheetApp = { openById: function(){ return null; } };\n'
    + 'var handleRecommendationWorkspaceGet_ = function(){ return { success:false, errors:[{code:"NOT_STUBBED"}] }; };\n'
    + 'var recommendationWorkspaceDefaultIo_ = function(){ return {}; };\n'
    + 'var prodRequireSheet_ = function(ss, name){ __setReq(name); return ss.getSheetByName(name); };\n';
  return (new Function('__setReq', stubs + SRC + '\nreturn {'
    + ' gapInvMapFromLines_: gapInvMapFromLines_, gapOpMapFromLines_: gapOpMapFromLines_,'
    + ' gapUpsertByKey_: gapUpsertByKey_, gapEnumerateScopes_: gapEnumerateScopes_,'
    + ' handleRecalculateInventoryReplenishmentGapBatch_: handleRecalculateInventoryReplenishmentGapBatch_,'
    + ' handleRecalculateOrderPlanningGapBatch_: handleRecalculateOrderPlanningGapBatch_,'
    + ' INV_GAP_HEADERS_: INV_GAP_HEADERS_, OP_GAP_HEADERS_: OP_GAP_HEADERS_ };'))(function (n) { lastRequireSheetTable = n; });
}
var M = makeStubEnv();

// fake header-mapped sheet (array rows; header row implicit)
function makeSheet(headers, rows) {
  rows = rows || []; var writes = { setValues: 0, appendRow: 0 };
  return {
    _rows: rows, _writes: writes,
    getName: function () { return '(sheet)'; },
    getLastColumn: function () { return headers.length; },
    getLastRow: function () { return rows.length + 1; },
    getDataRange: function () { return { getValues: function () { return [headers.slice()].concat(rows.map(function (r) { return r.slice(); })); } }; },
    getRange: function (r, c, numR, numC) {
      return {
        getValues: function () { if (r === 1) return [headers.slice()]; var out = []; for (var i = 0; i < numR; i++) out.push((rows[(r - 2) + i] || []).slice()); return out; },
        setValues: function (vals) { writes.setValues++; rows[r - 2] = vals[0].slice(); }
      };
    },
    appendRow: function (arr) { writes.appendRow++; rows.push(arr.slice()); }
  };
}
function hz(wc, gap, sug, req) { return { windowCode: wc, requiredByDate: req || '2026-08-25', demandQty: gap + 10, coveredQty: 10, gapQty: gap, suggestedOrderQty: sug }; }
function invLine(over) { var L = { sku: 'CO1100-R', blocked: false, horizons: [hz('D18', 100, 120), hz('D30', 200, 200), hz('D45', 300, 320), hz('D90', 0, 0)] }; if (over) for (var k in over) L[k] = over[k]; return L; }
function tier(t, m, gap, sug) { return { tier: t, month: m, remainingGapQty: gap, suggestedOrderQty: sug }; }
function opLine(over) { var L = { sku: 'CO1100-R', blocked: false, monthlyProjection: [tier('T1', '2026-09', 2026, 2040), tier('T2', '2026-10', 4282, 4320), tier('T3', '2026-11', 7500, 7520), tier('T4', '2026-12', 0, 0)] }; if (over) for (var k in over) L[k] = over[k]; return L; }
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };

// =============================================================================
section('Inventory mapping — D18/D30/D45/D90 verbatim + valid zero');
var ri = M.gapInvMapFromLines_([invLine()], SCOPE, 'CO1100-R', '2026-08-07');
eq([ri.calculation_status, ri.calculation_date], ['READY', '2026-08-07'], 'INV1 READY + calc_date from authority');
eq([ri.d18_gap_qty, ri.d18_suggested_qty, ri.d30_gap_qty, ri.d45_gap_qty], [100, 120, 200, 300], 'INV2 D18/D30/D45 gap+suggested verbatim');
eq([ri.d90_gap_qty, ri.d90_suggested_qty], [0, 0], 'INV3 D90 valid zero → 0 (not blank)');

section('Inventory — missing != zero');
var rBlk = M.gapInvMapFromLines_([invLine({ blocked: true, blockedReason: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', horizons: null })], SCOPE, 'CO1100-R', '2026-08-07');
eq([rBlk.calculation_status, rBlk.d18_gap_qty, rBlk.note], ['BLOCKED', null, 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED'], 'INV4 blocked → BLOCKED, qty null (NEVER 0)');
var rNoHz = M.gapInvMapFromLines_([invLine({ horizons: [] })], SCOPE, 'CO1100-R', '2026-08-07');
eq([rNoHz.calculation_status, rNoHz.d18_gap_qty, rNoHz.note], ['BLOCKED', null, 'HORIZONS_NOT_AVAILABLE'], 'INV5 no horizons → BLOCKED, qty null');
var rMiss = M.gapInvMapFromLines_([invLine({ horizons: [hz('D18', 100, 120), hz('D30', 200, 200), hz('D45', 300, 320), { windowCode: 'D90', gapQty: null, suggestedOrderQty: null }] })], SCOPE, 'CO1100-R', '2026-08-07');
eq([rMiss.calculation_status, rMiss.d18_gap_qty], ['BLOCKED', null], 'INV6 one missing window → whole row BLOCKED (missing != 0)');

section('Inventory — multi-warehouse INDEPENDENT then SUM (aggregation, NOT pooling)');
var whA = invLine({ horizons: [hz('D18', 100, 120), hz('D30', 0, 0), hz('D45', 0, 0), hz('D90', 0, 0)] });
var whB = invLine({ horizons: [hz('D18', 900, 920), hz('D30', 0, 0), hz('D45', 0, 0), hz('D90', 0, 0)] });
var rAgg = M.gapInvMapFromLines_([whA, whB], SCOPE, 'CO1100-R', '2026-08-07');
eq([rAgg.d18_gap_qty, rAgg.d18_suggested_qty], [1000, 1040], 'INV7 site D18 = 100+900 gap / 120+920 suggested (SUM after independent calc)');

section('Order Planning mapping — T1–T4 month/gap/suggested verbatim + Inventory formula NOT used');
var ro = M.gapOpMapFromLines_([opLine()], SCOPE, 'CO1100-R', '2026-08');
eq([ro.calculation_status, ro.calculation_month], ['READY', '2026-08'], 'OP1 READY + calc_month from authority');
eq([ro.t1_month, ro.t1_gap_qty, ro.t1_suggested_qty], ['2026-09', 2026, 2040], 'OP2 T1 month/gap(remainingGapQty)/suggested verbatim');
eq([ro.t4_month, ro.t4_gap_qty, ro.t4_suggested_qty], ['2026-12', 0, 0], 'OP3 T4 valid zero → 0');
ok(!('d18_gap_qty' in ro), 'OP4 Order Planning row carries NO Inventory D18 field (no convergence)');
var roBlk = M.gapOpMapFromLines_([opLine({ monthlyProjection: [] })], SCOPE, 'CO1100-R', '2026-08');
eq([roBlk.calculation_status, roBlk.t1_gap_qty, roBlk.note], ['BLOCKED', null, 'MONTHLY_PROJECTION_NOT_AVAILABLE'], 'OP5 no projection → BLOCKED, qty null');
var roAgg = M.gapOpMapFromLines_([opLine({ monthlyProjection: [tier('T1', '2026-09', 10, 40), tier('T2', '2026-10', 0, 0), tier('T3', '2026-11', 0, 0), tier('T4', '2026-12', 0, 0)] }), opLine({ monthlyProjection: [tier('T1', '2026-09', 20, 40), tier('T2', '2026-10', 0, 0), tier('T3', '2026-11', 0, 0), tier('T4', '2026-12', 0, 0)] })], SCOPE, 'CO1100-R', '2026-08');
eq(roAgg.t1_gap_qty, 30, 'OP6 multi-warehouse T1 gap = 10+20 (SUM after independent calc)');

section('UPSERT — insert then update, NO duplicate; valid 0 written, null → blank');
var sheet = makeSheet(M.INV_GAP_HEADERS_, []);
var a1 = M.gapUpsertByKey_(sheet, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 0, d90_gap_qty: null });
eq([a1, sheet._rows.length], ['insert', 1], 'UP1 first write → INSERT one row');
eq([sheet._rows[0][6], sheet._rows[0][12]], [0, ''], 'UP2 valid zero written as 0; null written as blank');
var a2 = M.gapUpsertByKey_(sheet, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', calculation_status: 'READY', d18_gap_qty: 555 });
eq([a2, sheet._rows.length], ['update', 1], 'UP3 same business key → UPDATE, NO duplicate row');
eq(sheet._rows[0][6], 555, 'UP4 updated numeric persisted');
var a3 = M.gapUpsertByKey_(sheet, { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'OTHER', calculation_status: 'READY' });
eq([a3, sheet._rows.length], ['insert', 2], 'UP5 different sku → new row (still one per key)');

section('Batch — ONE canonical read per scope (never per-SKU), writes only the allowed table');
var invSheet = makeSheet(M.INV_GAP_HEADERS_, []);
var wsCalls = [];
var io = {
  now: function () { return 0; }, tz: function () { return 'Asia/Taipei'; },
  openTarget: function () { return { getSheetByName: function (n) { return n === 'inventory_replenishment_gap' ? invSheet : null; } }; },
  enumerateScopes: function () { return [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA' }]; },
  workspaceGet: function (body) { wsCalls.push(body); return { success: true, meta: { calculationDate: '2026-08-07' }, data: { lines: [invLine({ sku: 'SKU-A' }), invLine({ sku: 'SKU-B' }), invLine({ sku: 'SKU-C' })] } }; }
};
lastRequireSheetTable = null;
var env = M.handleRecalculateInventoryReplenishmentGapBatch_({}, io);
ok(env.success === true, 'B0 batch success');
eq(wsCalls.length, 2, 'B1 ONE canonical read per scope (2 scopes) — NOT per-SKU (6 SKUs)');
ok(wsCalls[0].payload.pagination.size >= 100, 'B2 bounded page size (all SKUs in one scope read)');
eq(env.data.totalScopes, 2, 'B3 summary totalScopes');
eq([env.data.written, env.data.ready], [6, 6], 'B4 summary written/ready per SKU row');
eq(lastRequireSheetTable, 'inventory_replenishment_gap', 'B5 writes ONLY inventory_replenishment_gap (validated table)');
eq(invSheet._rows.length, 6, 'B6 six UPSERTed rows (2 scopes × 3 SKUs), no duplicate');
ok(typeof env.data.calculatedAt === 'string', 'B7 batch summary carries calculatedAt timestamp');

section('Router + KM.DB wiring');
ok((ROUTER.match(/inventoryReplenishmentGap\.recalculate\.all/g) || []).length === 1 && (ROUTER.match(/orderPlanningGap\.recalculate\.all/g) || []).length === 1, 'W1 router registers BOTH batch actions exactly once');
ok(/handleRecalculateInventoryReplenishmentGapBatch_\(body\)/.test(ROUTER) && /handleRecalculateOrderPlanningGapBatch_\(body\)/.test(ROUTER), 'W2 router delegates to the batch owners');
ok(/recalculateInventoryReplenishmentGapAll = function/.test(DBAPI) && /recalculateOrderPlanningGapAll = function/.test(DBAPI), 'W3 KM.DB exposes both one-command batch methods');
ok(/_kmWeeklyCommand_\('inventoryReplenishmentGap\.recalculate\.all'/.test(DBAPI), 'W4 uses the canonical text-first command runner (one request, never per-SKU)');

section('Negative constraints — no forbidden writes, no browser formula');
var CODE = SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
// F1-4B-FM5-R2b: the Order Planning batch now LEGITIMATELY READS the current-stock snapshots factory_stock +
// overseas_inventory_snapshot to build the FROZEN lineage-net Overseas/Factory allocatable pools (source contract
// §C; R2b §4/§5) — these are the source-of-truth current-stock authorities, never written. The batch STILL never
// re-sources demand/incoming (fc_regular_forecast/shipment) nor touches order/draft tables, and STILL writes only
// the gap tables (proven by order-planning-supply-allocation-f1-4b-fm5r2b AD). Forbidden set narrowed accordingly.
ok(!/fc_regular_forecast|shipment|request_order|purchase_order|allocation_draft/i.test(CODE.replace(/marketplace_skus/g, '')), 'N1 batch never re-sources demand/incoming (FC/shipment) nor touches order/draft tables (factory_stock/overseas_inventory_snapshot are the R2b current-stock pool reads)');
ok(!/Math\.(ceil|floor|round)/.test(CODE), 'N2 no gap/carton arithmetic invented in the materializer (reuses canonical runtime)');

console.log('\n----------------------------------------');
console.log('GAP MATERIALIZATION (F1-4B-FM5): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
