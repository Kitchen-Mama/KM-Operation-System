// Kitchen Mama Operation System — Planning-Input Semantics Correction (F1-4B-FM3f-1, Authorities A/D/E/F).
// Run: node assets/tests/recommendation-planning-inputs-correction-f1-4b-fm3f1.test.js
// -----------------------------------------------------------------------------
// Proves the corrected canonical planning inputs flow end-to-end into recommendation.workspace.get:
//   A Site Stock opening = available + fc_transfer + fc_processing (customer_order + unfulfillable EXCLUDED).
//   D current-month remaining demand consumed BEFORE T1 (reduces T1 opening; not a writable tier).
//   E Target%-adjusted regular FC.   F special-event FC (100%, prep month, once).
// Chronology stays KMTPP (count-once carry-forward). Additive DTO: destinationGapQty / overseasCoveredQty(0) /
// factoryCoveredQty(0) / residualOrderNeedQty. CO1100-R corrected business trace. No page-side math, no write.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return { handle: handleRecommendationWorkspaceGet_ };'))();
function T(line, t) { var a = line.monthlyProjection || []; for (var i = 0; i < a.length; i++) if (a[i].tier === t) return a[i]; return null; }
function HZ(line, wc) { var a = line.horizons || []; for (var i = 0; i < a.length; i++) if (a[i].windowCode === wc) return a[i]; return null; }
function makeSs(tables, c) {
  c.getSheetByName = 0; c.write = 0;
  return { getSheetByName: function (n) { c.getSheetByName++; var t = tables[n]; if (!t) return null; var v = [t.headers].concat(t.rows);
    return { getLastRow: function () { return v.length; }, getDataRange: function () { return { getValues: function () { return v; } }; },
      getRange: function () { c.write++; return { setValues: function () { c.write++; }, setValue: function () { c.write++; } }; }, appendRow: function () { c.write++; } }; } };
}
function io(m, d, ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return m; }, configDate: function () { return d; }, openTarget: function () { return ss; } }; }
function body() { return { requestId: 'REQ-FM3F1', payload: { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, pagination: { page: 1, size: 100 } } }; }
var FCH = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
// CO1100-R live-shaped fixture: Aug 3100 (100/day), Sep 7000, Oct 4282, Nov 7500, Dec 0.
function fcRow() { return ['KM', 'US', 'AMAZON_US', 'CO1100-R', 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 7000, 4282, 7500, 0, 'FC-1']; }
function tables(extra) {
  var t = {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'replenishment_model'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST', 'forecast_driven']] },   // FM5-R4UI-R3: this suite exercises the FORECAST horizon path explicitly
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', 'AMAZON_US', 'platform_fulfilled', 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton', 'series', 'category'], rows: [['CO1100-R', 40, 'CO', 'OPENER']] },
    fc_regular_forecast: { headers: FCH, rows: [fcRow()] },
    // Authority A: Site Stock = available 5286 + fc_transfer 365 + fc_processing 1723 = 7374 (customer_order 45 + unfulfillable 223 EXCLUDED).
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty', 'fc_transfer_qty', 'fc_processing_qty', 'customer_order_qty', 'unfulfillable_qty'], rows: [['US', 'AMAZON_US', 'CO1100-R', 5286, 365, 1723, 45, 223]] }
  };
  if (extra) for (var k in extra) t[k] = extra[k];
  return t;
}

// =============================================================================
section('A · Site Stock opening = available + fc_transfer + fc_processing (customer_order + unfulfillable excluded)');
var cM = {}; var env = H.handle(body(), io('2026-08', '2026-08-07', makeSs(tables(), cM)));
ok(env.success === true, 'A0 success');
var lm = env.data.lines[0];
eq(lm.currentStockQty, 7374, 'A1 Site Stock opening = 5286 + 365 + 1723 = 7374 (NOT available_qty 5286 only)');

section('D · current-month remaining demand consumed BEFORE T1 (Aug 8–31 = 24 × 100 = 2400)');
eq([lm.currentMonthRemaining.requiredByDate, lm.currentMonthRemaining.demandQty], ['2026-08-31', 2400], 'D1 pre-T1 current-month remaining = 2400 (2026-08-08..31), requiredBy month end');
eq(T(lm, 'T1').openingSupplyQty, 4974, 'D2 T1 opening = Site Stock 7374 − pre-T1 2400 = 4974 (opening counted ONCE, carried forward)');

section('E · Target% (default 100 here) + corrected T1 business gap');
eq(T(lm, 'T1').demandQty, 7000, 'E1 T1 demand = adjusted Sep FC @100% = 7000');
eq(T(lm, 'T1').destinationGapQty, 2026, 'E2 T1 destinationGap = 7000 − 4974 = 2026 (was the WRONG 1714 under available-only + no pre-T1)');
eq([T(lm, 'T1').residualOrderNeedQty, T(lm, 'T1').overseasCoveredQty, T(lm, 'T1').factoryCoveredQty], [2026, 0, 0], 'E3 residualOrderNeed = destinationGap (overseas/factory coverage = 0; Commit-2)');
eq(T(lm, 'T1').suggestedOrderQty, Math.ceil(2026 / 40) * 40, 'E4 suggested = CEIL(2026/40)*40 = 2040 (cartonized RESIDUAL new-order need)');
eq([T(lm, 'T2').demandQty, T(lm, 'T2').destinationGapQty], [4282, 4282], 'E5 T2: opening 0 → gap 4282');
eq([T(lm, 'T3').demandQty, T(lm, 'T3').destinationGapQty], [7500, 7500], 'E6 T3: gap 7500');
eq([T(lm, 'T4').demandQty, T(lm, 'T4').destinationGapQty], [0, 0], 'E7 T4: demand 0, gap 0 (valid zero)');
ok((lm.monthlyProjection || []).length === 4, 'E8 monthlyProjection stays 4 tiers (pre-T1 is not a writable tier)');

section('E · Target% ≠ 100 changes T1 adjusted demand (via canonical owner, not page math)');
var t80 = tables({ fc_target_rules: { headers: ['company', 'country', 'marketplace', 'scope_id', 'sku', 'year', 'sep_pct', 'target_percentage'], rows: [['KM', 'US', 'AMAZON_US', 'CO1100-R', 'CO1100-R', 2026, 80, '']] } });
var env80 = H.handle(body(), io('2026-08', '2026-08-07', makeSs(t80, {})));
eq(T(env80.data.lines[0], 'T1').demandQty, 5600, 'E9 Sep @ 80% = round(7000×0.8) = 5600 (Target% applied by canonical KMPD owner)');

section('F · Special-event FC (100%, prep month, once) enters the demand');
// Event start 2026-10-01 → prep 2026-09-01 → adds to Sep (T1). 100% (never target-adjusted).
var tEvt = tables({ fc_special_events: { headers: ['event_fc_id', 'company', 'country', 'marketplace', 'sku', 'event_start_date', 'fc_qty', 'status'], rows: [['E1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', '2026-10-01', 500, 'active']] } });
var envE = H.handle(body(), io('2026-08', '2026-08-07', makeSs(tEvt, {})));
eq(T(envE.data.lines[0], 'T1').demandQty, 7500, 'F1 T1 demand = adjusted Sep 7000 + special 500 (prep 2026-09-01) = 7500');
eq(T(envE.data.lines[0], 'T2').demandQty, 4282, 'F2 special counted ONCE (Sep only) — not duplicated into Oct');

section('horizons consume the SAME corrected inputs (Site Stock opening + adjusted FC)');
eq(HZ(lm, 'D18').demandQty, 1800, 'HZ1 D18 (Aug 8–25) = 18 × (adjusted 3100/31) = 1800');
eq(HZ(lm, 'D18').openingSupplyQty, 7374, 'HZ2 horizon opening = Site Stock 7374 (same Authority-A owner)');

section('request-count / write-safety / demand owner (no page-side formula)');
ok(cM.getSheetByName === 15 && cM.write === 0, 'ONE read (15 tables incl. fc_target_rules + FM5-R4UI-R3 daily/weekly sales); ZERO writes');
ok(/KMPD\.planningDemandByMonth/.test(HANDLER) && /KMPD\.currentMonthRemainingDemand/.test(HANDLER), 'demand owned by canonical KMPD (no handler FC×Target)');
ok(!/\* *r\.target|fc *\* *target|target_percentage *\/ *100/i.test(HANDLER), 'no page/handler-side FC×Target arithmetic');

console.log('\n----------------------------------------');
console.log('PLANNING-INPUT CORRECTION (F1-4B-FM3f-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
