// Kitchen Mama Operation System — Recommendation READ-ONLY Workspace API (F1-4B-A) focused suite.
// Run: node assets/tests/supply-planning-recommendation-workspace-f1-4b-a.test.js
// -----------------------------------------------------------------------------
// Proves the read endpoint (42_api_v1_recommendation_workspace.gs) is a pure read boundary over the completed
// runtime: validate → targeted KMPS.readCanonicalSnapshots → KMPA → KMPS.buildProductionRecommendationSource →
// resolver → bounded envelope. Real recommendedQty from raw canonical snapshots; source-proven currentStock/QI/gap;
// validation before reads; wrong-ID fail-closed; zero writes; + API Foundation registration + default-false flags.
// The .gs handler is loaded via a non-strict Function with KMPA/KMPS injected (no SpreadsheetApp; fixture io).

'use strict';
var fs = require('fs');
var path = require('path');
var KMPA = require('../js/core/supply-planning-production-assembly.js');
var KMPS = require('../js/core/supply-planning-production-source.js');
var KMAPI = require('../js/api/km-api-foundation.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function jsonSafe(o) { try { return JSON.parse(JSON.stringify(o)) && true; } catch (e) { return false; } }

// ---- load the .gs handler (non-strict Function; inject the runtime globals it references) -----------------
var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '42_api_v1_recommendation_workspace.gs'), 'utf8');
var H = (new Function('KMPA', 'KMPS', GS + '\nreturn { handle: handleRecommendationWorkspaceGet_, validate: validateRecommendationWorkspaceRequest_, build: recommendationWorkspaceBuild_ };'))(KMPA, KMPS);

// ---- fake read-only SpreadsheetApp (write methods increment a counter) ------------------------------------
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'clear', 'clearContent', 'insertSheet'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; return range; }; });
    var sheet = { getLastRow: function () { return values.length; }, getLastColumn: function () { return values[0] ? values[0].length : 0; }, getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; return sheet; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (n) { return has(sheetMap, n) ? fakeSheet(sheetMap[n]) : null; } };
}
function sheets() {
  return {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'], ['M1', 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', true]],
    marketplaces: [['marketplace', 'allocation_priority'], ['AMAZON_US', 1]],
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov', 'dec'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 120, 130, 140]],
    overseas_inventory_snapshot: [['warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'snapshot_date'], ['WH-3PL', 'CO1100-R', 'ST-1', 100, '2026-08-01']],
    shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'],
      ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'shipped', '2026-08-25', '2026-08-01']]
  };
}
function body(over) {
  var b = { apiVersion: '1', action: 'recommendation.workspace.get', requestId: 'REQ-ABC', payload: {
    scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, destinationWarehouseId: 'WH-3PL',
    calculationMonth: '2026-08', planningCycle: '2026-W40', filters: { sku: null }, pagination: { page: 1, size: 50 }, include: { diagnostics: false } } };
  if (over) { for (var k in over) b.payload[k] = over[k]; }
  return b;
}
function makeIo(ss) { var n = { openCount: 0 }; return { _n: n, now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { n.openCount++; return ss; } }; }

// ===========================================================================================================
section('A. END-TO-END read — raw snapshots → KMPA → KMPS → resolver → envelope');
(function () {
  var ss = fakeSpreadsheet(sheets());
  var res = H.handle(body(), makeIo(ss));
  ok(res.success === true && res.errors.length === 0, 'A1 success envelope');
  ok(res.data.lines.length === 1, 'A2 one recommendation line');
  var L = res.data.lines[0];
  ok(L.recommendedQty === 96, 'A3 REAL recommendedQty = 96 (from raw snapshots via existing resolver)');
  ok(L.calculatedGap === 100, 'A4 calculatedGap = 100 (source-proven, frozen calculateGap owner)');
  ok(L.currentStockQty === 100, 'A5 currentStockQty = 100 (CURRENT_STOCK supply source — source-proven)');
  ok(L.qualifiedIncomingQty === 24, 'A6 qualifiedIncomingQty = 24 (SHIPPED_IN_TRANSIT supply source — source-proven)');
  ok(L.sku === 'CO1100-R' && L.siteSku === 'ST-1' && L.destinationWarehouseId === 'WH-3PL', 'A7 identity fields');
  ok(L.blocked === false && L.blockedReason === null, 'A8 unblocked');
  ok(!has(L, 'projectedInventory') && !has(L, 'coverage') && !has(L, 'daysOfSupply') && !has(L, 'riskStatus') && !has(L, 'actionReason'), 'A9 no invented Coverage/DOS/Projected/Reason/Status');
  ok(res.meta.requestId === 'REQ-ABC' && res.meta.source === 'recommendation.workspace.get' && res.meta.mode === 'WORKSPACE', 'A10 meta: requestId echoed + canonical source/mode');
  ok(typeof res.meta.serverDurationMs === 'number' && res.meta.tablesRead >= 1, 'A11 serverDurationMs + tablesRead reported');
  ok(res.data.pagination.total === 1 && res.data.pagination.page === 1 && res.data.pagination.size === 50, 'A12 pagination');
  ok(ss._writes.count === 0, 'A13 ZERO Sheet writes (pure read)');
  ok(jsonSafe(res), 'A14 JSON-safe envelope');
})();

section('B. Validation fails BEFORE any table read (io.openTarget not called)');
(function () {
  function failsBeforeRead(payloadOver, expectCode, label) {
    var io = makeIo(fakeSpreadsheet(sheets()));
    var res = H.handle(body(payloadOver), io);
    ok(res.success === false && res.errors[0].code === expectCode && io._n.openCount === 0, label);
  }
  failsBeforeRead({ scope: { company: '', country: 'US', marketplace: 'AMAZON_US' } }, 'VALIDATION_FAILED', 'B1 missing company → VALIDATION_FAILED before read');
  failsBeforeRead({ destinationWarehouseId: '' }, 'MISSING_DESTINATION_WAREHOUSE', 'B2 missing destination → before read');
  failsBeforeRead({ calculationMonth: '' }, 'MISSING_CALCULATION_MONTH', 'B3 missing calculationMonth → before read');
  failsBeforeRead({ planningCycle: '' }, 'MISSING_PLANNING_CYCLE', 'B4 missing planningCycle → before read');
  failsBeforeRead({ filters: { demandDriver: 'SALES' } }, 'UNSUPPORTED_PHASE1_DEMAND_DRIVER', 'B5 client SALES driver override rejected before read');
})();

section('C. Fail-closed + missing-source (never fake zero)');
(function () {
  // wrong Spreadsheet target → openTarget throws → structured failure (no crash across boundary)
  var throwIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { var e = new Error('wrong target'); e.safetyToken = 'WRONG_SPREADSHEET_TARGET'; throw e; } };
  var wrong = H.handle(body(), throwIo);
  ok(wrong.success === false && wrong.errors[0].code === 'WRONG_SPREADSHEET_TARGET', 'C1 wrong Spreadsheet ID fails closed (structured)');
  // missing FC month → assembly blocks (MISSING_FORECAST_WEIGHT_SOURCE) → structured failure, NOT a zero line
  var missFcSheets = sheets(); missFcSheets.fc_regular_forecast = [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 120, 130]];
  var miss = H.handle(body(), makeIo(fakeSpreadsheet(missFcSheets)));
  ok(miss.success === false && miss.errors.some(function (e) { return e.code === 'MISSING_FORECAST_WEIGHT_SOURCE'; }), 'C2 missing FC month → structured failure (not a fake-zero line)');
  ok(miss.data === null, 'C3 failure envelope has data:null (no empty-success)');
  // no marketplace_skus in scope → MISSING_SKU_MAPPING
  var noMsk = sheets(); noMsk.marketplace_skus = [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model']];
  var nm = H.handle(body(), makeIo(fakeSpreadsheet(noMsk)));
  ok(nm.success === false && nm.errors.some(function (e) { return e.code === 'MISSING_SKU_MAPPING'; }), 'C4 no SKU mapping → MISSING_SKU_MAPPING');
})();

section('D. Pagination + filtering + stable order');
(function () {
  var vr = H.validate(body().payload);
  ok(vr.ok === true && vr.size === 50 && vr.page === 1, 'D1 validate returns bounded page/size');
  var big = H.validate(body({ pagination: { page: 1, size: 500 } }).payload);
  ok(big.size === 100, 'D2 page size capped at 100');
  // SKU filter that excludes the only line → empty page (successful empty, not error)
  var filtered = H.handle(body({ filters: { sku: 'NOPE' } }), makeIo(fakeSpreadsheet(sheets())));
  ok(filtered.success === true && filtered.data.lines.length === 0 && filtered.data.pagination.total === 0, 'D3 SKU filter with no match → successful empty page');
})();

section('E. API Foundation registration + default-false flags + no dual/fallback');
(function () {
  var api = KMAPI.createApiFoundation({});
  var ws = api.registry.get('recommendation');
  ok(ws && ws.status === KMAPI.WORKSPACE_STATUS.IMPLEMENTED && typeof ws.resolver === 'function', 'E1 recommendation workspace registered + IMPLEMENTED with a resolver');
  ok(api.getFlags().USE_WORKSPACE_API === false, 'E2 master flag default false');
  ok(api.getWorkspaceFlags().recommendation === false, 'E3 recommendation per-workspace flag default false');
  ok(api.effectiveMode('recommendation') === KMAPI.SOURCE.LEGACY, 'E4 master OFF → legacy (no workspace call)');
  api.setWorkspaceApiEnabled(true);
  ok(api.effectiveMode('recommendation') === KMAPI.SOURCE.LEGACY, 'E5 master ON + per-ws OFF → legacy (needs explicit enable)');
  api.setWorkspaceEnabled('recommendation', true);
  ok(api.effectiveMode('recommendation') === KMAPI.SOURCE.WORKSPACE, 'E6 master ON + per-ws ON → workspace');
  // other workspaces unaffected + weekly still implemented
  ok(api.registry.get('weeklyShipping').status === KMAPI.WORKSPACE_STATUS.IMPLEMENTED && api.getWorkspaceFlags().weeklyShipping === false, 'E7 weeklyShipping unaffected (still implemented, default false)');
  // DTO builder: no client formula/driver override; bounded shape
  var dto = api.recommendation.buildRequestDTO({ scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40' });
  ok(dto.action === 'recommendation.workspace.get' && dto.payload.destinationWarehouseId === 'WH-3PL' && !has(dto.payload, 'demandDriver') && !has(dto.payload, 'formulaVersion'), 'E8 DTO bounded: canonical action, explicit destination, no driver/formula override');
  // resolver failure surfaces as structured failure (no silent legacy fallback) via injected invoke
  var apiFail = KMAPI.createApiFoundation({ flags: { USE_WORKSPACE_API: true }, workspaceFlags: { recommendation: true }, workspaceInvoke: function () { return Promise.resolve({ success: false, errors: [{ code: 'RECOMMENDATION_RUNTIME_BLOCKED', message: 'blocked' }] }); } });
  return apiFail.getWorkspace('recommendation', { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40' }).then(function (r) {
    ok(r.success === false && r.errors[0].code === 'RECOMMENDATION_RUNTIME_BLOCKED', 'E9 workspace failure surfaces (no silent legacy fallback)');
    console.log('\n----------------------------------------');
    console.log('RECOMMENDATION WORKSPACE API (F1-4B-A): ' + pass + ' passed, ' + fail + ' failed');
    if (fail > 0) { process.exitCode = 1; }
  });
})();
