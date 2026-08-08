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

// ---- shared contamination-source fixtures (R3a) --------------------------------------------------------------
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var CAMP_H = ['campaign_id', 'company', 'country', 'marketplace', 'marketplace_id', 'start_date', 'end_date', 'status'];
var CSL_H = ['campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku'];
var EVT_H = ['event_fc_id', 'company', 'country', 'marketplace', 'marketplace_id', 'sku', 'event_start_date', 'event_end_date', 'status', 'fc_qty'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];
function emptyContam() { return { campaigns: snap(CAMP_H, []), campaignSkuLines: snap(CSL_H, []), fcSpecialEvents: snap(EVT_H, []), marketplaces: snap(MKT_H, [['MP1', 'KM', 'US', 'Amazon']]) }; }
function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; for (var k2 in b) o[k2] = b[k2]; return o; }
function base(dsRows) { return merge({ marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, dsRows || []), amazonWeeklySalesSnapshot: snap(wkHdr, []) }, emptyContam()); }
var dates = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-28', '2026-07-29'];

section('recoWsResolveSalesRate_ — reuses the canonical normalizedAvgSalesPerDay owner EXACTLY (empty contamination = no exclusion)');
var flatRows = dates.map(function (d) { return [d, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 100]; });
var snapsS = base(flatRows);
var rate = H.resolveRate(snapsS, SCOPE, 'CO1100-R', '2026-08-07');
ok(rate.ok === true, 'R1 sales basis resolves ok (contamination sources present but empty → 0 excluded)');
var indep = KMCALC.normalizedAvgSalesPerDay({
  calcDate: '2026-08-07',
  scope: { sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', channel: 'amazon.com', company: 'KM', marketplaceId: 'MP1', marketplaceSkuId: 'MSK-1' },
  weekly7d: 0, dailySales: dates.map(function (d) { return { date: d, sku: 'CO1100-R', units: 100, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'amazon.com' }; }), campaigns: [], events: []
});
eq(rate.avgSalesPerDay, indep.avgSalesPerDay, 'R2 wired rate == canonical owner output over identical inputs (no second averaging engine)');
eq(rate.avgSalesPerDay, 100, 'R3 10 normal days × 100 units → 100/day (normalized_30d rung)');
eq(rate.source, 'normalized_30d', 'R4 owner source surfaced for the trace');

// =============================================================================================================
section('R3a A/B — contaminated campaign days EXCLUDED; NORMAL days retained; present-empty vs missing differentiated');
// Spike days 25–27 (1000 units) vs normal days (100). WITHOUT exclusion avg=(7×100+3×1000)/10=370; WITH exclusion=700/7=100.
var spikeRows = dates.map(function (d) { var spike = (d === '2026-07-25' || d === '2026-07-26' || d === '2026-07-27'); return [d, 'US', 'Amazon', 'amazon.com', 'CO1100-R', spike ? 1000 : 100]; });
var noCampaign = H.resolveRate(base(spikeRows), SCOPE, 'CO1100-R', '2026-08-07');   // present-empty campaigns → A (no exclusion)
ok(noCampaign.ok === true && noCampaign.avgSalesPerDay === 370, 'A1 present-but-empty contamination = legitimate ZERO excluded days → spike days retained → avg 370');
var withCampaign = merge(base(spikeRows), { campaigns: snap(CAMP_H, [['C1', 'KM', 'US', 'Amazon', 'MP1', '2026-07-25', '2026-07-27', 'active']]), campaignSkuLines: snap(CSL_H, [['L1', 'C1', 'MSK-1', 'CO1100-R']]) });
var camp = H.resolveRate(withCampaign, SCOPE, 'CO1100-R', '2026-08-07');
ok(camp.ok === true, 'A2 campaign contamination resolves ok');
eq(camp.excludedDates && camp.excludedDates.length, 3, 'A3 the 3 campaign selling days (25–27) are EXCLUDED (contaminated) — real facts now wired, not []');
eq(camp.normalDayCount, 7, 'A4 NORMAL day count = 7 (10 candidates − 3 contaminated)');
eq(camp.avgSalesPerDay, 100, 'A5 corrected run-rate = 700/7 = 100 (spike removed) — proves exclusion actually applied');

section('R4 §5 — contamination source ABSENT does NOT block (optional filter); PRESENT+0 differentiated from ABSENT');
var missingCampSheet = { marketplaceSkus: snap(mskHdr, mskRows), amazonDailySalesSnapshot: snap(dsHdr, spikeRows), amazonWeeklySalesSnapshot: snap(wkHdr, []), fcSpecialEvents: snap(EVT_H, []), marketplaces: snap(MKT_H, []) };   // campaigns/campaignSkuLines keys ABSENT
var b = H.resolveRate(missingCampSheet, SCOPE, 'CO1100-R', '2026-08-07');
ok(b.ok === true && b.avgSalesPerDay === 370, 'B1 absent campaigns/campaign_sku_lines → NO exclusion (rate 370, spikes retained) — never a spurious BLOCKED (R4 §5)');
eq(b.contaminationSource.campaigns, 'ABSENT', 'B2 sourceStatus differentiates ABSENT (diagnostic) — but never blocks');
eq(noCampaign.contaminationSource.campaigns, 'PRESENT', 'B3 present-but-empty campaigns → PRESENT (0 matches), distinct from ABSENT, also 370 — neither blocks (TABLE PRESENT+0 ≠ UNAVAILABLE)');

section('R4 §5 — ambiguous campaign identity DEGRADES to no-exclusion (never blocks the SKU)');
var ambigLine = merge(base(spikeRows), { campaigns: snap(CAMP_H, [['C1', 'KM', 'US', 'Amazon', 'MP1', '2026-07-25', '2026-07-27', 'active']]), campaignSkuLines: snap(CSL_H, [['L1', 'C1', '', 'CO1100-R']]) });   // blank marketplace_sku_id + master-sku match → owner throws
var c = H.resolveRate(ambigLine, SCOPE, 'CO1100-R', '2026-08-07');
ok(c.ok === true && c.avgSalesPerDay === 370 && c.contaminationApplied === false, 'C1 a malformed campaign line no longer blocks — the basis recomputes WITHOUT contamination (rate 370, contaminationApplied=false)');

section('R3a — historical event selling days excluded (event contamination via the events param, composite scope)');
var evtRows = merge(base(spikeRows), { fcSpecialEvents: snap(EVT_H, [['E1', 'KM', 'US', 'Amazon', '', 'CO1100-R', '2026-07-25', '2026-07-27', 'active', 500]]) });
var ev = H.resolveRate(evtRows, SCOPE, 'CO1100-R', '2026-08-07');
ok(ev.ok === true && ev.excludedDates.length === 3 && ev.avgSalesPerDay === 100, 'K1 a special-event selling window (25–27) excludes those historical days from the rate (avg 100); the FUTURE planned event is added ONCE by KMHP (separate concept — see demand-split E/F)');

section('recoWsResolveSalesRate_ — fail CLOSED (differentiated truthful reasons)');
var noDaily = H.resolveRate(base([]), SCOPE, 'CO1100-R', '2026-08-07');
ok(noDaily.ok === false && noDaily.reason === 'SALES_BASIS_UNAVAILABLE', 'F1 no scoped daily-sales rows → SALES_BASIS_UNAVAILABLE');
var ambig = H.resolveRate(base(flatRows.concat([['2026-07-29', 'US', 'Amazon', 'walmart.com', 'CO1100-R', 50]])), SCOPE, 'CO1100-R', '2026-08-07');   // 2nd channel
ok(ambig.ok === false && ambig.reason === 'SALES_BASIS_AMBIGUOUS', 'F2 ambiguous channel → SALES_BASIS_AMBIGUOUS (conflict, distinct from unavailable)');
var noDate = H.resolveRate(snapsS, SCOPE, 'CO1100-R', null);
ok(noDate.ok === false && noDate.reason === 'CALCULATION_DATE_NOT_CONFIGURED', 'F3 no calc date → fail closed (no clock fallback)');
var otherScope = H.resolveRate(snapsS, { company: 'KM', country: 'CA', marketplace: 'Amazon' }, 'CO1100-R', '2026-08-07');
ok(otherScope.ok === false && otherScope.reason === 'SALES_BASIS_UNAVAILABLE', 'F4 out-of-scope country → no rows → fail closed');

section('valid-zero — a genuine 0-sales scoped history is a real 0 rate, not a block');
var zeroRate = H.resolveRate(base(dates.map(function (d) { return [d, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 0]; })), SCOPE, 'CO1100-R', '2026-08-07');
ok(zeroRate.ok === true && zeroRate.avgSalesPerDay === 0, 'Z1 confirmed-zero-sales history → 0/day (valid), not SALES_BASIS_UNAVAILABLE');

console.log('\n----------------------------------------');
console.log('PLANNING MODEL WIRING (F1-4B-FM5-R4UI-R3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
