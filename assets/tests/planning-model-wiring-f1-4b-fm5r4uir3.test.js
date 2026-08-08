// Kitchen Mama Operation System — Planning Model workspace wiring (F1-4B-FM5-R4UI-R3).
// Run: node assets/tests/planning-model-wiring-f1-4b-fm5r4uir3.test.js
// -----------------------------------------------------------------------------
// Proves the recommendation-workspace (42) wiring of the Planning Model split:
//   • recoWsResolvePlanningModel_  — reads marketplace_skus.replenishment_model (blank → sales_driven default;
//     unknown value passed through verbatim so KMHP fails closed; never guessed).
//   • recoWsResolveSalesRate_      — marshals the FROZEN KMCALC.normalizedAvgSalesPerDay owner (no second averaging
//     engine); stamps scope company; derives the channel (unambiguous or fail-closed); returns a truthful
//     {ok:false,reason} on any missing/ambiguous/throwing basis (never a fabricated 0, never a forecast fallback).
// Handler-eval harness (BUNDLE + 42 in a new Function) — no network / live DB.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var KMCALC = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F42 + '\n return {' +
  ' resolveModel: recoWsResolvePlanningModel_,' +
  ' resolveRate: recoWsResolveSalesRate_ };'))();

function snap(headers, rows) { return { headers: headers, rows: rows }; }
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };

// -------------------------------------------------------------------------------------------------------------
section('recoWsResolvePlanningModel_ — canonical column, DB default, unknown passthrough');
var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var mskRows = [
  ['KM', 'US', 'Amazon', 'CO1100-R', 'MSK-1', 'sales_driven'],
  ['KM', 'US', 'Amazon', 'FC-ONLY', 'MSK-2', 'forecast_driven'],
  ['KM', 'US', 'Amazon', 'BLANK', 'MSK-3', ''],
  ['KM', 'US', 'Amazon', 'WEIRD', 'MSK-4', 'monthly_magic']
];
var snapsM = { marketplaceSkus: snap(mskHdr, mskRows) };
eq(H.resolveModel(snapsM, SCOPE, 'CO1100-R'), 'sales_driven', 'M1 explicit sales_driven');
eq(H.resolveModel(snapsM, SCOPE, 'FC-ONLY'), 'forecast_driven', 'M2 explicit forecast_driven');
eq(H.resolveModel(snapsM, SCOPE, 'BLANK'), 'sales_driven', 'M3 blank cell → sales_driven (DB writer default)');
eq(H.resolveModel(snapsM, SCOPE, 'WEIRD'), 'monthly_magic', 'M4 unknown value passed through verbatim (KMHP fails closed, not this layer)');
eq(H.resolveModel(snapsM, SCOPE, 'NO-ROW'), 'sales_driven', 'M5 no marketplace_skus row → sales_driven default (never throws)');

section('recoWsResolveSalesRate_ — reuses the canonical normalizedAvgSalesPerDay owner EXACTLY');
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var dates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'];
var dsRows = dates.map(function (d) { return [d, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 100]; });
var snapsS = { marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, dsRows), amazonWeeklySalesSnapshot: snap(['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'], []) };
var rate = H.resolveRate(snapsS, SCOPE, 'CO1100-R', '2026-08-07');
ok(rate.ok === true, 'R1 sales basis resolves ok');
// independently compute the canonical owner over the SAME inputs (stamp company; single channel).
var indep = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-08-07',
  scope: { sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', channel: 'amazon.com', company: 'KM', marketplaceId: null, marketplaceSkuId: 'MSK-1' },
  weekly7d: 0, dailySales: dates.map(function (d) { return { date: d, sku: 'CO1100-R', units: 100, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon.com' }; }), campaigns: [], events: []
});
eq(rate.avgSalesPerDay, indep.avgSalesPerDay, 'R2 wired rate == canonical owner output over identical inputs (no second averaging engine)');
eq(rate.avgSalesPerDay, 100, 'R3 10 normal days × 100 units → 100/day (normalized_30d rung)');
eq(rate.source, 'normalized_30d', 'R4 owner source surfaced for the trace');

section('recoWsResolveSalesRate_ — fail CLOSED (truthful reason, never a fabricated 0, never a forecast fallback)');
var noDaily = H.resolveRate({ marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, []) }, SCOPE, 'CO1100-R', '2026-08-07');
ok(noDaily.ok === false && noDaily.reason === 'SALES_BASIS_UNAVAILABLE', 'F1 no scoped daily-sales rows → SALES_BASIS_UNAVAILABLE');
var ambigRows = dsRows.concat([['2026-07-29', 'US', 'Amazon', 'walmart.com', 'CO1100-R', 50]]);   // 2nd channel → ambiguous
var ambig = H.resolveRate({ marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, ambigRows) }, SCOPE, 'CO1100-R', '2026-08-07');
ok(ambig.ok === false && ambig.reason === 'SALES_BASIS_UNAVAILABLE', 'F2 ambiguous channel → fail closed (never guessed)');
var noDate = H.resolveRate(snapsS, SCOPE, 'CO1100-R', null);
ok(noDate.ok === false && noDate.reason === 'CALCULATION_DATE_NOT_CONFIGURED', 'F3 no calc date → fail closed (no clock fallback)');
var otherScope = H.resolveRate(snapsS, { company: 'KM', country: 'CA', marketplace: 'Amazon' }, 'CO1100-R', '2026-08-07');
ok(otherScope.ok === false && otherScope.reason === 'SALES_BASIS_UNAVAILABLE', 'F4 out-of-scope country → no rows → fail closed');

section('valid-zero — a genuine 0-sales scoped history is a real 0 rate, not a block');
var zeroRows = dates.map(function (d) { return [d, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 0]; });
var zeroRate = H.resolveRate({ marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, zeroRows), amazonWeeklySalesSnapshot: snap(['week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'], []) }, SCOPE, 'CO1100-R', '2026-08-07');
ok(zeroRate.ok === true && zeroRate.avgSalesPerDay === 0, 'Z1 confirmed-zero-sales history → 0/day (valid), not SALES_BASIS_UNAVAILABLE');

console.log('\n----------------------------------------');
console.log('PLANNING MODEL WIRING (F1-4B-FM5-R4UI-R3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
