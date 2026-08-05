// Kitchen Mama Operation System — Production recommendation source wiring tests (Round 1S-P2).
// Run: node assets/tests/supply-planning-production-source.test.js
// Proves the READ-ONLY production path: fake canonical Sheets → KMPS.readCanonicalSnapshots → KMSP Projection →
// KMSRP Production Reader → whole chain → Plan Builder (Weekly 96 / Monthly 24), the orchestrator source seam
// (SOURCE_READER_PENDING replaced) via the REAL KMORCH with a fake locked-apply (NO write), FACTORY_SHARED,
// factory as-of, destination ownership, status mapping, fail-closed issues, and no-write purity.

'use strict';
var KMPS = require('../js/core/supply-planning-production-source.js');
var ORCH = require('../js/core/supply-planning-recommendation-orchestrator.js');
var PB = require('../js/core/supply-planning-plan-builder.js');
var fs = require('fs'); var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fake SpreadsheetApp (read-only; any write method increments a counter → proves no writes) ----------
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'clear', 'clearContent', 'copyTo', 'moveTo'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; return range; }; });
    var sheet = { getLastRow: function () { return values.length; }, getLastColumn: function () { return values[0] ? values[0].length : 0; },
      getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; return sheet; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (name) { return Object.prototype.hasOwnProperty.call(sheetMap, name) ? fakeSheet(sheetMap[name]) : null; } };
}

var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };
var W_ORCH_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' };

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
function weeklyRequest() {
  return { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE,
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
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
function monthlyRequest() {
  return { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-M08', businessScope: MSCOPE,
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    factoryDemandFacts: [{ demandRef: 'FC:F1', eligibleFactoryWarehouseIds: 'WH-FAC', allocationPriority: 1, requiredByDate: '2026-09-01', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', requestMonth: '2026-09', requestBucket: 'B1', netOrderNeed: 13, unitsPerCarton: 12 }] };
}

// ==========================================================================
section('A. Apps Script canonical-table reader (fake SpreadsheetApp; read-only, value-preserving)');
(function () {
  var ss = fakeSpreadsheet(weeklySheets());
  var read = KMPS.readCanonicalSnapshots(ss, null);
  ok(read.snapshots.sku_details === undefined && read.snapshots.skuDetails, 'A1 canonical Sheet mapped by key (sku_details → skuDetails)');
  eq(read.snapshots.skuDetails.headers, ['sku', 'units_per_carton'], 'A2 header row preserved');
  eq(read.snapshots.fcRegularForecast.rows[0], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100], 'A3 numeric values preserved (incl. 100)');
  ok(read.issues.some(function (x) { return x.sourceType === 'factoryStock' && x.reason === 'SOURCE_NOT_AVAILABLE'; }), 'A4 absent optional Sheet → SOURCE_NOT_AVAILABLE issue (not synthesized)');
  eq(ss._writes.count, 0, 'A5 no write method invoked by the reader');
  // value preservation: Date / numeric zero / blank
  var vp = fakeSpreadsheet({ overseas_inventory_snapshot: [['warehouse_id', 'sku', 'wh_available_stock', 'snapshot_date'], ['WH-3PL', 'CO1100-R', 0, new Date('2026-08-01T00:00:00Z')]] });
  var r2 = KMPS.readCanonicalSnapshots(vp, null);
  var row = r2.snapshots.overseasInventorySnapshot.rows[0];
  eq(row[2], 0, 'A6 numeric zero preserved (not blank)');
  ok(row[3] instanceof Date, 'A7 Date cell preserved as Date');
  ok(JSON.parse(JSON.stringify(r2.snapshots.overseasInventorySnapshot)) && true, 'A8 snapshot JSON-safe');
  // empty sheet (header only / no rows)
  var mt = fakeSpreadsheet({ sku_details: [] });
  ok(KMPS.readCanonicalSnapshots(mt, null).issues.some(function (x) { return x.sourceType === 'skuDetails' && x.reason === 'MISSING_SNAPSHOT'; }), 'A9 empty Sheet → MISSING_SNAPSHOT');
  throwsType(function () { KMPS.readCanonicalSnapshots({}, null); }, 'A10 missing getSheetByName → TypeError');
})();

section('B. Weekly full Apps Script read path → read-only RecommendationPlan (96)');
(function () {
  var ss = fakeSpreadsheet(weeklySheets());
  var res = KMPS.buildProductionRecommendationSource(ss, weeklyRequest());
  eq([res.ready, res.status, res.persistenceStatus], [true, 'READY', 'NOT_EXECUTED'], 'B1 read-only result, persistence NOT_EXECUTED');
  eq(res.recommendationPlan.command.recommendedLines[0].recommendedQty, 96, 'B2 recommendedQty 96 through the whole chain');
  eq(res.lines[0].recommendedQty, 96, 'B3 bridge line 96');
  ok(!res.recommendationPlan.hasOwnProperty('draftId') && !res.hasOwnProperty('draftId'), 'B4 no draft id fabricated');
  eq(ss._writes.count, 0, 'B5 no Sheet write invoked');
  // Plan Builder accepts it directly too (read-only)
  eq(PB.buildRecommendation(KMPS.buildProductionRecommendationSource(fakeSpreadsheet(weeklySheets()), weeklyRequest()).lines ? { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE, mode: 'SCHEDULED_REFRESH', calculationRunId: 'RO', lines: KMPS.buildProductionRecommendationSource(fakeSpreadsheet(weeklySheets()), weeklyRequest()).lines } : {}).command.recommendedLines[0].recommendedQty, 96, 'B6 read-only lines re-buildable → 96');
})();

section('C. Monthly full Apps Script read path (24) + FACTORY_SHARED');
(function () {
  var ss = fakeSpreadsheet(monthlySheets());
  var res = KMPS.buildProductionRecommendationSource(ss, monthlyRequest());
  eq([res.ready, res.persistenceStatus], [true, 'NOT_EXECUTED'], 'C1 read-only Monthly result');
  eq(res.recommendationPlan.command.recommendedLines[0].recommendedQty, 24, 'C2 CEILING(13/12)*12 = 24');
  var recLine = res.recommendationPlan.command.recommendedLines[0];
  ok(!recLine.hasOwnProperty('order_qty') && !recLine.hasOwnProperty('orderQty'), 'C3 no order_qty written (engine-owned recommendation only)');
  eq(ss._writes.count, 0, 'C4 no Sheet write');
})();

section('D. Orchestrator source seam (SOURCE_READER_PENDING replaced) via REAL KMORCH + fake locked-apply');
(function () {
  var ss = fakeSpreadsheet(weeklySheets());
  var captured = null;
  var r = ORCH.runRecommendationGeneration(
    { recommendationType: 'WEEKLY_SHIPPING', mode: 'SCHEDULED_REFRESH', planningCycle: '2026-W40', businessScope: W_ORCH_SCOPE, actor: 'sys', now: 'T' },
    { loadActiveContext: function () { return { status: 'CREATE' }; }, loadPriorSnapshot: function () { return null; },
      computeFacts: function () { return KMPS.resolveProductionFacts(ss, weeklyRequest()); },
      lockedApply: function (p) { captured = p; return { status: 'COMPLETED' }; } }
  );
  eq([r.status, r.coreAction], ['COMPLETED', 'CREATE'], 'D1 production facts flow through the REAL orchestrator → COMPLETED');
  var recQ = captured.lineOps.map(function (o) { return o.row && o.row.recommended_qty; }).filter(function (v) { return typeof v === 'number'; });
  eq(recQ, [96], 'D2 recommended_qty 96 reaches the (captured) plan — no SOURCE_READER_PENDING');
  eq(ss._writes.count, 0, 'D3 no Sheet write invoked (fake locked-apply captured only)');
  // missing planning facts → fail closed (not SOURCE_READER_PENDING, not empty-success)
  var noFacts = weeklyRequest(); noFacts.planningFacts = [];
  var f = KMPS.resolveProductionFacts(fakeSpreadsheet(weeklySheets()), noFacts);
  eq([f.ready, f.lines.length], [false, 0], 'D4 missing planning facts → ready:false fail-closed');
  ok(f.reason !== 'SOURCE_READER_PENDING', 'D5 reason is a real projection reason, never SOURCE_READER_PENDING');
})();

section('E. FACTORY_SHARED production behavior (one shared pool; not duplicated)');
(function () {
  var res = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(monthlySheets()), monthlyRequest());
  var proj = res; // lineage carries supplyCount
  eq(res.lineage.supplyCount, 1, 'E1 one factory_stock row → ONE projected supply pool (not 2×)');
  // warehouse owner company must not become the pool company
  var m = monthlySheets(); m.warehouses = [['warehouse_id', 'company', 'country', 'is_factory_warehouse', 'is_active'], ['WH-FAC', 'RESUS', 'CN', true, true]];
  var r2 = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(m), monthlyRequest());
  eq(r2.recommendationPlan.command.recommendedLines[0].recommendedQty, 24, 'E2 warehouse owner change does not alter the shared pool result');
})();

section('F. Factory as-of / destination / status propagation (fail-closed issues not swallowed)');
(function () {
  // factory as-of missing → SOURCE_AS_OF_MISSING surfaced
  var noAsOf = monthlySheets(); noAsOf.factory_stock = [['warehouse_id', 'sku', 'fac_current_stock'], ['WH-FAC', 'CO1100-R', 60]];
  var r1 = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(noAsOf), monthlyRequest());
  ok(r1.issues.some(function (x) { return x.reason === 'SOURCE_AS_OF_MISSING'; }), 'F1 missing factory as-of → SOURCE_AS_OF_MISSING');
  // missing destination → MISSING_DESTINATION_WAREHOUSE (demand blocked)
  var noRoute = weeklyRequest(); noRoute.routing = {};
  var r2 = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(weeklySheets()), noRoute);
  ok(r2.issues.some(function (x) { return x.reason === 'MISSING_DESTINATION_WAREHOUSE'; }), 'F2 missing destination → MISSING_DESTINATION_WAREHOUSE');
  // non-canonical (legacy) shipment status → UNKNOWN_STATUS fail-closed via the canonical bridge (F1-3b; SC-11.4-B
  // vocab = draft/ready_to_ship/shipped/in_transit/arrived/received/closed/cancelled; `completed` is not canonical).
  var legacy = weeklySheets(); legacy.shipments = [['status', 'sku', 'company', 'shipment_qty', 'destination_warehouse_id', 'shipment_id', 'shipment_line_id', 'source_data_as_of'], ['completed', 'CO1100-R', 'KM', 30, 'WH-3PL', 'SH9', 'SL9', '2026-08-01']];
  var r3 = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(legacy), weeklyRequest());
  ok(r3.issues.some(function (x) { return String(x.reason).indexOf('UNKNOWN_STATUS') >= 0; }), 'F3 non-canonical shipment status → UNKNOWN_STATUS fail-closed (not silently mapped)');
})();

section('G. Failure paths (fail-closed; no empty-success)');
(function () {
  // no canonical sheets at all → projection blocks (SOURCE_NOT_AVAILABLE), never SOURCE_READER_PENDING, never empty-success
  var f = KMPS.resolveProductionFacts(fakeSpreadsheet({}), weeklyRequest());
  eq(f.ready, false, 'G1 no source Sheets → ready:false');
  ok(f.reason && f.reason !== 'SOURCE_READER_PENDING', 'G2 real fail-closed reason (not the stub)');
  // invalid recommendationType propagates as TypeError from the projection
  throwsType(function () { KMPS.buildProductionRecommendationSource(fakeSpreadsheet(weeklySheets()), { recommendationType: 'NOPE', planningCycle: 'c', businessScope: {} }); }, 'G3 invalid recommendationType → TypeError');
  throwsType(function () { KMPS.resolveProductionFacts(fakeSpreadsheet(weeklySheets()), null); }, 'G4 null request → TypeError');
})();

section('H. Purity / non-write / boundary source scans');
(function () {
  var inp = weeklyRequest(); var ss = fakeSpreadsheet(weeklySheets());
  var snap = JSON.stringify(inp);
  var a = KMPS.buildProductionRecommendationSource(ss, inp);
  ok(JSON.stringify(inp) === snap, 'H1 request not mutated');
  var b = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(weeklySheets()), weeklyRequest());
  eq(a.recommendationPlan.command.recommendedLines[0].recommendedQty, b.recommendationPlan.command.recommendedLines[0].recommendedQty, 'H2 deterministic (96 == 96)');
  eq(ss._writes.count, 0, 'H3 zero writes across full read path');
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  // pure JS contains no SpreadsheetApp/LockService/Cache and no clock/random/locale
  var pure = code(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-source.js'), 'utf8'));
  ok(!/SpreadsheetApp|LockService|CacheService/.test(pure), 'H4 pure KMPS has no SpreadsheetApp/LockService/Cache');
  ok(!/Date\.now|Math\.random|localeCompare/.test(pure), 'H5 pure KMPS has no clock/random/locale');
  // .gs wrapper: no business formula, no write methods
  var gs27 = code(fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '27_recommendation_production_source.gs'), 'utf8'));
  ok(!/setValues|setValue\b|appendRow|deleteRow|insertRow|clearContent|LockService|executeLockedPersistence|applyPersistencePlan/.test(gs27), 'H6 27_.gs invokes no write/lock/persistence method');
  ok(!/calculateGap|calculateSuggestedOrderQty|CEILING|FLOOR|survival|allocation_priority\s*=|SHIPMENT_STATUS\s*=/.test(gs27), 'H7 27_.gs contains no business formula');
  // 24_.gs: SOURCE_READER_PENDING no longer the active return; delegates to KMPS
  var gs24 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '24_recommendation_orchestrator.gs'), 'utf8');
  ok(/KMPS\.resolveProductionFacts/.test(gs24), 'H8 24_ orchestrator delegates to KMPS.resolveProductionFacts');
  ok(!/return\s*\{\s*lines:\s*\[\],\s*ready:\s*false,\s*reason:\s*'SOURCE_READER_PENDING'\s*\}/.test(gs24), 'H9 active SOURCE_READER_PENDING return removed');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1S-P2 Production Source Wiring assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
