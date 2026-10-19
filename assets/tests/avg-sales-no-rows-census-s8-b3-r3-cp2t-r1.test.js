// Kitchen Mama Operation System - S8-B3-R3-CP2T-R1 P1
// "NO ROWS" IS FOUR DIFFERENT FACTS, AND THEY ARE FOUR DIFFERENT REPAIRS
//
// Run: node assets/tests/avg-sales-no-rows-census-s8-b3-r3-cp2t-r1.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. The fixture is ANONYMISED and synthetic.
//
// WHY THIS EXISTS. One row of the live CA report still refuses after the campaign-date repair, and the
// question asked of it is which of four things happened: the source was never read, it was read and holds
// nothing for this SKU, it holds rows for the SKU that belong to no scope dimension here, or it holds rows
// that match and sit outside the 90-day window. Before this round all four arrived as one sentence - "no
// daily or weekly rows @ CA/Amazon" - which names the symptom and none of the causes.
//
// AND THE FOURTH IS NOT EVEN IN THAT SENTENCE. Rows that match the scope but fall outside the window never
// reach the no-rows return at all: they pass through to the frozen owner, which samples none of them,
// counts ZERO normal days and drops to the weekly rung. What happens THERE depends entirely on whether a
// weekly source can be read, and section D is where this file was wrong.
//
// CORRECTED BY CP2T-R2. As first written, section D asserted that this case "publishes a rate: 0.0 with no
// weekly row" and called it expected behaviour. It was the defect written down as the design: 42_ handed
// the owner a weekly total of 0 that had never been read, the owner divided it by 7, and the column printed
// a confident 0.0 indistinguishable from a real week of no sales - which then fed Days of Supply as
// infinite cover. The condition is now a DEFECT REGRESSION here, and the behaviour it covers lives in
// weekly-fallback-source-s8-b3-r3-cp2t-r2.test.js. An out-of-window history prints a number only when a
// weekly source actually exists to divide.
//
// WHAT THIS IS NOT. The planning model is not one of the four. A forecast_driven SKU has a real historical
// average and publishes it (CP2S-R1); the model decides which HORIZON formula consumes the rate, not
// whether the site has a sales history. Section E pins that, because "it is forecast_driven" is the
// explanation that most invites itself here and it is not an explanation.
//
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var RECO = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').replace(/\r\n/g, '\n');
var KMCALC = require(path.join(ROOT, 'assets/js/core/supply-planning-calculations.js'));
var KMDR = require(path.join(ROOT, 'assets/js/core/supply-planning-destination-runtime.js'));
var srvBox = { console: console, KMCALC: KMCALC, KMDR: KMDR };
var srvCtx = vm.createContext(srvBox);
vm.runInContext(RECO, srvCtx);

// The site under investigation: a CA marketplace SKU on the forecast-driven model.
var SKU = 'CO1150-BM';
var COMPANY = 'Kitchen Mama';
var SCOPE = { company: COMPANY, country: 'CA', marketplace: 'Amazon', marketplaceId: 'MKT-CA' };
var CALC_DATE = '2026-10-15';            // frozen window = 2026-07-17 .. 2026-10-14
var DAILY_H = ['snapshot_date', 'country', 'channel', 'sku', 'sales_units', 'marketplace'];
var WEEKLY_H = ['week_end_date', 'country', 'channel', 'sku', 'sales_units_7d', 'marketplace'];

function snap(headers, rows) { return { headers: headers, rows: rows }; }
function dRow(date, units, o) {
  o = o || {};
  return [date, o.country || 'CA', o.channel === undefined ? 'Amazon.ca' : o.channel, o.sku || SKU, units, o.marketplace || 'Amazon'];
}
// Dated rows INSIDE the window.
function inWindow(n, units, o) {
  var r = [];
  for (var i = 1; i <= n; i++) r.push(dRow('2026-09-' + ('0' + i).slice(-2), units === undefined ? 4 : units, o));
  return r;
}
// Dated rows BEFORE the window opens (2026-07-17).
function beforeWindow(n, units, o) {
  var r = [];
  for (var i = 1; i <= n; i++) r.push(dRow('2026-04-' + ('0' + i).slice(-2), units === undefined ? 4 : units, o));
  return r;
}
function snaps(o) {
  o = o || {};
  var s = {
    marketplaceSkus: snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
      o.mskRows || [[SKU, COMPANY, 'CA', 'Amazon', 'MSKU-CA', o.model || 'forecast_driven', 'SS-CA']]),
    marketplaces: snap(['company', 'country', 'marketplace', 'marketplace_id'], [[COMPANY, 'CA', 'Amazon', 'MKT-CA']]),
    campaigns: snap(['campaign_id', 'status', 'start_date', 'end_date'], []),
    campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], []),
    fcSpecialEvents: snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'], [])
  };
  // `undefined` means the table was NEVER IN THE READ - a different fact from an empty table.
  if (!o.dailyAbsent) s.amazonDailySalesSnapshot = snap(DAILY_H, o.daily || []);
  if (!o.weeklyAbsent) s.amazonWeeklySalesSnapshot = snap(WEEKLY_H, o.weekly || []);
  return s;
}
function resolve(s) {
  srvBox.__s = { snapshots: s };   // CP2X-R2 D - the three per-SKU helpers take `read` now, so they can reach the per-request
  // row cache (recoWsRows_). The fixture is the same; it is handed over in the envelope the
  // runtime hands over. A FRESH object per call, so no caching is shared between cases.
  return vm.runInContext('recoWsResolveSalesRate_(__s, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', ' + JSON.stringify(CALC_DATE) + ')', srvCtx);
}
function basisOf(sr, mode) {
  srvBox.__sr = sr; srvBox.__m = mode || 'forecast_driven';
  return vm.runInContext('recoWsBasisOf_(__sr, __m)', srvCtx);
}

// ---------------------------------------------------------------------------------------------------
section('A  NOT READ - the table was never in the read scope');
// ---------------------------------------------------------------------------------------------------
// The workspace read is an explicit 13-table `only` list. A table missing from it, or a read that failed
// for it, is not "this SKU has no history" - it is "nobody looked". Those need opposite repairs.
var A = resolve(snaps({ dailyAbsent: true, weeklyAbsent: true }));
eq(A.ok, false, 'A1  with neither snapshot in the read, the basis does not resolve');
eq(A.reason, 'SALES_BASIS_UNAVAILABLE', 'A1a under the same code as every other no-history case');
ok(/daily ABSENT/.test(String(A.detail || '')),
  'A2  but the DETAIL says the daily table was ABSENT, not empty - "nobody looked" is now distinguishable', A.detail);
ok(/weekly ABSENT/.test(String(A.detail || '')), 'A2a and so does the weekly table', A.detail);

var Ad = resolve(snaps({ dailyAbsent: true, weekly: [] }));
ok(/daily ABSENT/.test(String(Ad.detail || '')) && /weekly PRESENT/.test(String(Ad.detail || '')),
  'A3  one absent and one present-but-empty are reported SEPARATELY - a partial read is its own diagnosis', Ad.detail);

// ---------------------------------------------------------------------------------------------------
section('B  NO SOURCE - the table was read and holds nothing for this SKU anywhere');
// ---------------------------------------------------------------------------------------------------
// This is the only one of the four that means what the dash looks like it means.
var B = resolve(snaps({ daily: inWindow(30, 4, { sku: 'CO1100-R' }), weekly: [] }));
eq(B.ok, false, 'B1  a daily table full of OTHER SKUs does not resolve this one');
ok(/daily PRESENT, 30 rows, 0 for this SKU/.test(String(B.detail || '')),
  'B2  and the detail says so: the table is PRESENT, it has rows, and NONE of them are this SKU', B.detail);

// ---------------------------------------------------------------------------------------------------
section('C  NOT MATCHED - rows for this SKU exist, but not for this site');
// ---------------------------------------------------------------------------------------------------
// The repair here is a MAPPING repair, and it is the one most easily mistaken for B: the SKU does sell,
// just not under the country / marketplace / channel identity this scope resolves to.
var C = resolve(snaps({ daily: inWindow(30, 4, { country: 'US' }), weekly: [] }));
eq(C.ok, false, 'C1  30 rows for this SKU under ANOTHER country do not resolve the CA site');
ok(/daily PRESENT, 30 rows, 30 for this SKU/.test(String(C.detail || '')),
  'C2  and the detail separates it from B: 30 rows, ALL of them this SKU, none of them this site', C.detail);
ok(/@ CA\/Amazon/.test(String(C.detail || '')),
  'C2a naming the scope that found none of them, so the mismatch has two readable sides', C.detail);

var Cm = resolve(snaps({ daily: inWindow(30, 4, { marketplace: 'Walmart' }), weekly: [] }));
ok(/30 rows, 30 for this SKU/.test(String(Cm.detail || '')),
  'C3  a MARKETPLACE mismatch reads the same way - the census counts the SKU, the scope filters the site', Cm.detail);

// A CA row written as "Canada" is a canonicalisation question, not an absence. KMCID owns it; with no
// KMCID in this sandbox the fallback is an uppercase compare, so this records what the census shows
// rather than claiming the live canonicaliser behaves this way.
var Cc = resolve(snaps({ daily: inWindow(30, 4, { country: 'ca' }), weekly: [] }));
ok(Cc.ok === true, 'C4  a lower-case country still matches - the compare is canonical, not byte-exact', Cc);

// ---------------------------------------------------------------------------------------------------
section('D  OUT OF WINDOW - matched, dated, too old. It prints a number ONLY if a week can be read.');
// ---------------------------------------------------------------------------------------------------
// It never reaches the no-rows refusal: the rows pass to the frozen owner, which samples none, counts zero
// normal days, and falls to the weekly rung. THE FIRST VERSION OF THIS SECTION STOPPED THERE and recorded
// the 0.0 that came back as the expected answer. CP2T-R2 keeps the condition and inverts the verdict.
var D = resolve(snaps({ daily: beforeWindow(30, 4), weekly: [] }));
eq(D.ok, false,
  'D1  REGRESSION GUARD: an out-of-window history with NO weekly source must NOT resolve. This assertion '
  + 'read `true` when it was written, and the 0.0 behind it was a fabrication, not a measurement.');
eq(D.reason, 'SALES_BASIS_WEEKLY_UNAVAILABLE', 'D2  it refuses by name instead');
ok(D.avgSalesPerDay === undefined, 'D2a publishing no rate at all');
eq(basisOf(D).basisQualityError, 'SALES_BASIS_WEEKLY_UNAVAILABLE', 'D2b and the basis carries the code');
eq(basisOf(D).avgSalesPerDay, null, 'D2c with a null rate, never a zero');

// With a weekly source the same out-of-window history DOES publish a number, and that is correct: the
// week is a real observation even though no day in the window is.
var Dw0 = resolve(snaps({ daily: beforeWindow(30, 4), weekly: [['2026-10-12', 'CA', 'Amazon.ca', SKU, 21, 'Amazon']] }));
eq(Dw0.ok, true, 'D3  the SAME history with a readable weekly row resolves', Dw0);
eq(Dw0.avgSalesPerDay, 3, 'D3a to 21 / 7 - so D1 is about the weekly SOURCE, not about the window');
eq(Dw0.normalDayCount, 0, 'D3b still with zero normal days');
eq(Dw0.source, 'weekly_7d', 'D3c on the weekly rung');
eq(Dw0.warning, 'insufficient_normal_days', 'D3d which the row declares rather than implying');

// And a REAL zero is still a real zero.
var Dz = resolve(snaps({ daily: inWindow(30, 0), weekly: [] }));
eq(Dz.avgSalesPerDay, 0, 'D4  a site with 30 CONFIRMED zero days publishes 0');
eq(Dz.normalDayCount, 30, 'D4a over 30 normal days');
eq(Dz.source, 'normalized_30d', 'D4b on the normalized rung');
eq(basisOf(Dz).basisQualityError, null, 'D4c with no quality error');
ok(D.ok === false && Dz.ok === true,
  'D5  SO THE TWO ARE NO LONGER BOTH ZEROES. One is a measurement and the other is a refusal, which is a '
  + 'sharper separation than the normalDayCount / source comparison this assertion used to make - that '
  + 'comparison was true, and it was distinguishing two numbers only one of which should have existed.');

// A plausible number produced by zero in-window daily rows is exactly why nobody went looking for a defect
// here - which is the whole reason D1 had to be inverted rather than merely annotated.

// ---------------------------------------------------------------------------------------------------
section('E  the planning model is NOT one of the four');
// ---------------------------------------------------------------------------------------------------
// "It is forecast_driven" explains nothing about a missing historical average. The model selects the
// horizon formula; the average is a published fact about the site SKU in both models (CP2S-R1).
['forecast_driven', 'sales_driven'].forEach(function (model) {
  var r = resolve(snaps({ model: model, daily: inWindow(30, 4), weekly: [] }));
  eq(r.ok, true, 'E1 ' + model + ' with 30 in-window days resolves');
  eq(r.avgSalesPerDay, 4, 'E1a ' + model + ' publishes the same rate - the model did not gate the history');
  eq(basisOf(r, model).avgSalesPerDay, 4, 'E1b ' + model + ' and it survives into the basis the page reads');
  eq(basisOf(r, model).demandMode, model, 'E1c ' + model + ' with the mode recorded beside it, not instead of it');
});

// A SKU with NO marketplace_skus row at all resolves to the DB default model, and still has a history.
var E2 = resolve(snaps({ mskRows: [], daily: inWindow(30, 4), weekly: [] }));
eq(E2.ok, true, 'E2  and a SKU with no marketplace_skus row still resolves its sales history');
srvBox.__s2 = { snapshots: snaps({ mskRows: [] }) };
eq(vm.runInContext('recoWsResolvePlanningModel_(__s2, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU) + ')', srvCtx),
  'sales_driven', 'E2a its model falls back to the documented DB default, not to a blocked line');

// ---------------------------------------------------------------------------------------------------
section('F  the census is DIAGNOSTIC ONLY - no published value moved');
// ---------------------------------------------------------------------------------------------------
eq(B.reason, 'SALES_BASIS_UNAVAILABLE', 'F1  the reason code is the one it always was');
eq(B.blankDateRows, 0, 'F1a and the counted-blank field still reports a count, not a null');
ok(B.avgSalesPerDay === undefined, 'F2  no rate is published on a refusal');
var Fb = resolve(snaps({ daily: [dRow('', 9), dRow('', 9)], weekly: [] }));
eq(Fb.blankDateRows, 2, 'F3  the undated-row count still arrives on a refusal (CP2S-R2), beside the census');
ok(/undated rows skipped/.test(String(Fb.detail || '')), 'F3a and the undated note is still in the detail', Fb.detail);
ok(/daily PRESENT, 2 rows, 2 for this SKU/.test(String(Fb.detail || '')),
  'F3b with the census next to it - the rows exist, they are this SKU, and none of them has a date', Fb.detail);

// ---------------------------------------------------------------------------------------------------
section('G  what this suite does NOT establish');
// ---------------------------------------------------------------------------------------------------
ok(true, 'G1  NOT KNOWN: which of A-E the live CA row actually is. This round makes the four separable and '
  + 'prints the census in the refusal detail; which one it prints for that row is read off the live response, '
  + 'not off this file.');
ok(true, 'G2  NOT TESTED HERE: the canonical country authority (KMCID). C4 runs on the uppercase fallback '
  + 'because no KMCID is bound in this sandbox, so it records the fallback behaviour and claims nothing about '
  + 'the live canonicaliser - avg-sales-destination-chain owns that.');
ok(true, 'G3  CORRECTED: section D of this file asserted the fabricated zero as expected behaviour when it '
  + 'was written. A suite that accepts a defect protects it, and this one protected it for exactly one round. '
  + 'The condition is kept and the verdict inverted, so the regression it now guards is the one it caused.');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
