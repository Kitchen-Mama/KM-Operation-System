// Kitchen Mama Operation System — Unified Destination Recommendation Transport (F1-4B-FM1-T) handler suite.
// Run: node assets/tests/supply-planning-recommendation-workspace-f1-4b-a.test.js
// -----------------------------------------------------------------------------
// Drives the REAL bundled runtime (90_generated_supply_planning_bundle.gs) + the REAL handler
// (42_api_v1_recommendation_workspace.gs) together in one Apps-Script-like scope with an injected io + a fake
// spreadsheet. Proves: scope-only request; server-owned calc month/cycle; targeted read ONCE (no per-SKU/per-
// destination re-open); zero writes; MARKETPLACE end-to-end order-need; WAREHOUSE per-warehouse fanout identity;
// canonical response DTO + stable identity; fulfillment resolution; missing/blocked behavior. No live Spreadsheet.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Eval the bundle + handler in ONE scope; expose the handler + pure helpers.
var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return {' +
  ' handle: handleRecommendationWorkspaceGet_, validate: validateRecommendationWorkspaceRequest_,' +
  ' calc: recoWsResolveCalcContext_, fulfill: recoWsResolveFulfillment_, fcByMonth: recoWsRegularForecastByMonth_' +
  '};'))();
ok(typeof H.handle === 'function', 'X0 bundle + handler eval OK');

// ---- fake spreadsheet built from { sheetName: {headers, rows} } (read-only; write methods are tripwires) ----
function makeSs(tables, counters) {
  counters.getSheetByName = 0; counters.write = 0;
  return { getSheetByName: function (name) {
    counters.getSheetByName++;
    var t = tables[name]; if (!t) return null;
    var values = [t.headers].concat(t.rows);
    return {
      getLastRow: function () { return values.length; },
      getDataRange: function () { return { getValues: function () { return values; } }; },
      getRange: function () { counters.write++; return { setValues: function () { counters.write++; }, setValue: function () { counters.write++; } }; },
      appendRow: function () { counters.write++; }
    };
  } };
}
function io(cfgMonth, ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return cfgMonth; }, openTarget: function () { return ss; } }; }
function body() { return { requestId: 'REQ-TEST1', payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, pagination: { page: 1, size: 100 }, include: { diagnostics: true } } }; }

var FC_HEADERS = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
function fcRow(sku) { return ['KM', 'US', 'AMAZON_US', sku, 2026, 0, 0, 0, 0, 0, 0, 0, 0, 250, 250, 250, 250, 'FC-1']; }   // M+1..M+4 (2026-09..12) = 250 each → 1000

function baseTables(fulfillment) {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100', 'ST-CO1100']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', 'AMAZON_US', fulfillment, 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_code', 'warehouse_name', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', 'USA', 'US A', '3PL'], ['WH-B', 'KM', 'US', 'TRUE', 'FALSE', 'USB', 'US B', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton', 'lifecycle'], rows: [['CO1100', 12, 'Running in the Market']] },
    fc_regular_forecast: { headers: FC_HEADERS, rows: [fcRow('CO1100')] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', 'AMAZON_US', 'CO1100', 120]] }
  };
}

// =====================================================================================================
section('A. calculation-month authority (server config; no clock)');
ok(H.calc(io('', null)).error.code === 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED', 'A1 missing config → NOT_CONFIGURED');
ok(H.calc(io('2026-13', null)).error.code === 'RECOMMENDATION_CALCULATION_MONTH_INVALID', 'A2 invalid config → INVALID');
var okCalc = H.calc(io('2026-08', null));
ok(okCalc.ok && okCalc.calculationMonth === '2026-08' && okCalc.planningCycle === 'RECO-2026-08', 'A3 valid config → planningCycle RECO-{YYYY-MM}');

section('B. scope-only request validation');
var vr = H.validate({ scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } });
ok(vr.ok && !('destinationWarehouseId' in (vr.request || {})), 'B1 valid scope-only request (no destination required)');
ok(!H.validate({ scope: { company: 'KM', country: 'US' } }).ok, 'B2 missing marketplace → VALIDATION_FAILED');
var vdep = H.validate({ scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, destinationWarehouseId: 'WH-X', calculationMonth: '2099-01' });
ok(vdep.ok && vdep.deprecatedCompat.destinationWarehouseId === 'WH-X' && vdep.deprecatedCompat.calculationMonth === '2099-01', 'B3 legacy dest/month accepted as deprecated compat (never drives fanout)');

section('C. fulfillment authority');
ok(H.fulfill([{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', fulfillment_model: 'platform_fulfilled', status: 'active' }], { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }).mode === 'MARKETPLACE', 'C1 platform_fulfilled → MARKETPLACE');
ok(H.fulfill([{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', fulfillment_model: 'self_fulfilled', status: 'active' }], { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }).mode === 'WAREHOUSE', 'C2 self_fulfilled → WAREHOUSE');
ok(H.fulfill([{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', fulfillment_model: 'hybrid', status: 'active' }], { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }).mode === null, 'C3 hybrid/unknown → null (transport blocks honestly)');

section('D. missing config / MARKETPLACE end-to-end');
var c1 = {}; var envNoCfg = H.handle(body(), io('', makeSs(baseTables('platform_fulfilled'), c1)));
ok(envNoCfg.success === false && envNoCfg.errors[0].code === 'RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED' && c1.getSheetByName === 0, 'D1 missing calc config fails closed BEFORE any read');
var cM = {}; var ssM = makeSs(baseTables('platform_fulfilled'), cM);
var envM = H.handle(body(), io('2026-08', ssM));
ok(envM.success === true, 'D2 MARKETPLACE scope → success');
var lm = envM.data.lines[0];
ok(envM.data.lines.length === 1 && lm.recommendationMode === 'MARKETPLACE_ORDER_NEED', 'D3 one MARKETPLACE_ORDER_NEED line');
ok(lm.destinationType === 'MARKETPLACE' && lm.marketplaceId === 'MP1' && lm.warehouseId === null, 'D4 MARKETPLACE identity = marketplace_id, warehouseId null (no fabricated warehouse)');
ok(lm.calculatedGap === 880 && lm.recommendedQty === 888, 'D5 order-need via Monthly CEIL: gap 1000-120=880 → CEIL(880/12)*12 = 888');
ok(lm.currentStockQty === 120 && lm.incomingCompleteness === 'COMPLETE', 'D6 FBA available_qty=120; no unresolved incoming → COMPLETE');
ok(envM.meta.calculationMonth === '2026-08' && envM.meta.planningCycle === 'RECO-2026-08' && envM.meta.sourceReadCount === 1, 'D7 meta carries server calc context + one source read');
ok(cM.getSheetByName === 13, 'D8 targeted read ONCE (13 canonical tables; no per-SKU/per-destination re-open)');
ok(cM.write === 0, 'D9 zero writes');
ok(lm.recommendationLineId.indexOf('MARKETPLACE_ORDER_NEED') === 0 && lm.recommendationLineId.indexOf(lm.destinationKey) > -1, 'D10 stable line id includes mode + destinationKey');

section('E. WAREHOUSE per-warehouse fanout (frozen ratio) + identity');
var whTables = baseTables('self_fulfilled');
whTables.replenishment_demand_allocation_rules = { headers: ['allocation_rule_id', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'status'], rows: [['R1', 'KM', 'US', 'AMAZON_US', 'WH-A', 0.30, 0.30, 'active'], ['R2', 'KM', 'US', 'AMAZON_US', 'WH-B', 0.70, 0.70, 'active']] };
var cW = {}; var envW = H.handle(body(), io('2026-08', makeSs(whTables, cW)));
ok(envW.success === true, 'E1 WAREHOUSE scope → success (per-warehouse lines)');
var lines = envW.data.lines;
ok(lines.length === 2 && lines[0].recommendationMode === 'WAREHOUSE_REPLENISHMENT' && lines[1].recommendationMode === 'WAREHOUSE_REPLENISHMENT', 'E2 two WAREHOUSE_REPLENISHMENT lines (one per configured warehouse)');
var a = lines.filter(function (l) { return l.warehouseId === 'WH-A'; })[0], b = lines.filter(function (l) { return l.warehouseId === 'WH-B'; })[0];
ok(a && b && a.allocatedForecastQty === 300 && b.allocatedForecastQty === 700, 'E3 30/70 fanout: 1000 → 300 / 700 (per-month largest-remainder, conserved)');
ok(a.destinationKey !== b.destinationKey && a.recommendationLineId !== b.recommendationLineId, 'E4 two warehouses never collide (distinct destinationKey + line id)');
ok(a.destinationType === 'WAREHOUSE' && a.destinationRefId === 'WH-A' && a.marketplaceId === null, 'E5 WAREHOUSE identity = warehouse_id');
ok(cW.getSheetByName === 13 && cW.write === 0, 'E6 ONE targeted read for 2-destination fanout (no per-destination re-open); zero writes');

section('F. missing rules / unknown fulfillment fail closed');
var noRules = baseTables('self_fulfilled');   // self_fulfilled but NO allocation rules
var envNR = H.handle(body(), io('2026-08', makeSs(noRules, {})));
ok(envNR.success === true && envNR.data.lines[0].blocked === true && envNR.data.lines[0].blockedReason === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'F1 self_fulfilled + no rules → blocked DEMAND_ALLOCATION_RULE_NOT_CONFIGURED (never a default)');
var envHy = H.handle(body(), io('2026-08', makeSs(baseTables('hybrid'), {})));
ok(envHy.data.lines[0].blocked === true && envHy.data.lines[0].blockedReason === 'DESTINATION_AUTHORITY_UNRESOLVED', 'F2 hybrid/unknown fulfillment → DESTINATION_AUTHORITY_UNRESOLVED (no guess)');
var noScope = baseTables('platform_fulfilled'); noScope.marketplace_skus = { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku'], rows: [] };
var envNS = H.handle(body(), io('2026-08', makeSs(noScope, {})));
ok(envNS.success === false && envNS.errors[0].code === 'MISSING_SKU_MAPPING', 'F3 no marketplace_skus in scope → MISSING_SKU_MAPPING');

console.log('\n----------------------------------------');
console.log('RECOMMENDATION TRANSPORT (F1-4B-FM1-T): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
