// Kitchen Mama Operation System — Day-Horizon Transport Wiring (F1-4B-FM4a handler).
// Run: node assets/tests/recommendation-day-horizon-transport-f1-4b-fm4a.test.js
// -----------------------------------------------------------------------------
// Proves KMHP is bundled + wired into recommendation.workspace.get so each line additively exposes line.horizons
// (D18/D30/D45/D90) driven by the server RECOMMENDATION_CALCULATION_DATE authority — ADDITIVE: when the calc-DATE
// property is absent/invalid, horizons are omitted and the existing monthlyProjection/OP response is unaffected
// (fail-closed, never a fabricated horizon). One read; no writes; monthlyProjection non-regression. No live DB.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return {' +
  ' handle: handleRecommendationWorkspaceGet_, calcDate: recoWsResolveCalcDate_,' +
  ' hasKMHP: (typeof KMHP !== "undefined" && !!KMHP && typeof KMHP.projectHorizons === "function"),' +
  ' bundleInfo: (typeof KM_BUNDLE_INFO !== "undefined" ? KM_BUNDLE_INFO : null) };'))();

function hz(line, wc) { var a = line.horizons || []; for (var i = 0; i < a.length; i++) if (a[i].windowCode === wc) return a[i]; return null; }
function makeSs(tables, counters) {
  counters.getSheetByName = 0; counters.write = 0;
  return { getSheetByName: function (name) {
    counters.getSheetByName++; var t = tables[name]; if (!t) return null; var values = [t.headers].concat(t.rows);
    return { getLastRow: function () { return values.length; }, getDataRange: function () { return { getValues: function () { return values; } }; },
      getRange: function () { counters.write++; return { setValues: function () { counters.write++; }, setValue: function () { counters.write++; } }; }, appendRow: function () { counters.write++; } };
  } };
}
function io(cfgMonth, cfgDate, ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return cfgMonth; }, configDate: function () { return cfgDate; }, openTarget: function () { return ss; } }; }
function body() { return { requestId: 'REQ-FM4A', payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, pagination: { page: 1, size: 100 } } }; }
var FC_HEADERS = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
// aug=3100 sep=3000 oct=3100 nov=3000 (all 100/day); dec=0. sep..dec feed monthlyProjection; aug..nov feed horizons.
function fcRow() { return ['KM', 'US', 'AMAZON_US', 'CO1100', 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 3000, 3100, 3000, 0, 'FC-1']; }
function mpTables() {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'replenishment_model'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100', 'ST', 'forecast_driven']] },   // FM5-R4UI-R3: this suite exercises the FORECAST horizon path explicitly
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', 'AMAZON_US', 'platform_fulfilled', 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: [['CO1100', 40]] },
    fc_regular_forecast: { headers: FC_HEADERS, rows: [fcRow()] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: [['US', 'AMAZON_US', 'CO1100', 5000]] }
  };
}

// =============================================================================
section('bundle registration');
ok(H.hasKMHP, 'KMHP bundled + callable');
ok(H.bundleInfo && H.bundleInfo.modules.length === 37 && H.bundleInfo.modules.some(function (m) { return m.module === 'supply-planning-horizon-projection'; }), 'KM_BUNDLE_INFO = 37 modules incl. horizon-projection (F1-4B-FM6-R2 added KMREX)');

section('calc-DATE authority (Script Property; fail-closed; no clock)');
ok(H.calcDate(io('2026-08', '', null)).error.code === 'RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED', 'missing → NOT_CONFIGURED');
ok(H.calcDate(io('2026-08', '2026-13-40', null)).error.code === 'RECOMMENDATION_CALCULATION_DATE_INVALID', 'malformed → INVALID');
var cd = H.calcDate(io('2026-08', '2026-08-07', null));
ok(cd.ok && cd.calculationDate === '2026-08-07', 'valid YYYY-MM-DD → ok');

section('MARKETPLACE end-to-end — additive line.horizons D18–D90 + monthlyProjection non-regression');
var cM = {}; var envM = H.handle(body(), io('2026-08', '2026-08-07', makeSs(mpTables(), cM)));
ok(envM.success === true, 'M0 success');
var lm = envM.data.lines[0];
ok(Array.isArray(lm.horizons) && lm.horizons.length === 4, 'M1 line.horizons has D18/D30/D45/D90');
ok(hz(lm, 'D18').requiredByDate === '2026-08-25' && hz(lm, 'D18').demandQty === 1800 && hz(lm, 'D18').gapQty === 0, 'M2 D18: reqBy 2026-08-25, demand 1800 (100/day×18), opening 5000 covers → gap 0');
ok(hz(lm, 'D30').requiredByDate === '2026-09-06' && hz(lm, 'D30').demandQty === 3000, 'M3 D30: reqBy 2026-09-06, cross-month demand 3000');
ok(hz(lm, 'D90').requiredByDate === '2026-11-05', 'M4 D90: reqBy 2026-11-05 (multi-month window)');
ok(Array.isArray(lm.monthlyProjection) && lm.monthlyProjection.length === 4, 'M5 monthlyProjection STILL present (non-regression)');
ok(envM.meta.calculationDate === '2026-08-07', 'M6 meta carries the calc-DATE anchor');
ok(cM.getSheetByName === 17 && cM.write === 0, 'M7 one targeted read (17 tables incl. fc_target_rules + FM5-R4UI-R3 daily/weekly sales); ZERO writes — horizons add no write');

section('additive fail-closed — calc-DATE absent → horizons omitted, OP response unaffected');
var cN = {}; var envN = H.handle(body(), io('2026-08', '', makeSs(mpTables(), cN)));
ok(envN.success === true, 'N0 still success without calc-DATE (horizons are additive, never block OP)');
ok(envN.data.lines[0].horizons === undefined, 'N1 line.horizons omitted when RECOMMENDATION_CALCULATION_DATE not configured (no fabricated horizon)');
ok(Array.isArray(envN.data.lines[0].monthlyProjection) && envN.data.lines[0].monthlyProjection.length === 4, 'N2 monthlyProjection unaffected');
ok(envN.meta.calculationDate === null, 'N3 meta.calculationDate null when not configured');
ok(cN.write === 0, 'N4 zero writes');

console.log('\n----------------------------------------');
console.log('DAY-HORIZON TRANSPORT (F1-4B-FM4a): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
