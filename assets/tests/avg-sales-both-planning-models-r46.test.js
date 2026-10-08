// S8-R5-B / R46 — Avg Sales is a HISTORICAL metric and stops being gated on the Planning Model.
//
// Run: node assets/tests/avg-sales-both-planning-models-r46.test.js
//
// The defect: 42_api_v1_recommendation_workspace.gs CALLED the canonical §22 resolver only under
// sales_driven, so a Forecast-Driven SKU had no historical rate to publish and the page showed '--'.
// The repair moves the call out of the branch; the PLANNING basis stays inside it.
//
// This suite proves three separable things:
//   §A/§F  the SOURCE contract of 42_ — what is called, what stays branch-scoped, what is published.
//   §B..§E the §22 engine EXECUTED, so "both modes show the same rate" is arithmetic, not an assertion
//          about an assertion. The engine is mode-blind by construction: 42_ makes ONE call with no mode
//          argument, so a single executed result IS both modes' answer.
//   §G     the release governance R46 travels under.
// Nothing is written anywhere; every fixture is local to this file.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var KMCALC = require('../js/core/supply-planning-calculations.js');
var RO = require('./_release-order.js');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var GS = path.join(ROOT, 'assets/specs/active/apps-script/');
var RECO = fs.readFileSync(GS + '42_api_v1_recommendation_workspace.gs', 'utf8');
var HEALTH = fs.readFileSync(GS + '63_api_v1_system_health.gs', 'utf8');
var IR = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');

// Strip line comments before asserting on code. FB-4E-R3's G4 passed VACUOUSLY because a prose comment
// contained the token it was grepping for; this suite does not repeat that.
function code(src) {
  return src.split('\n').map(function (l) {
    var i = l.indexOf('//');
    if (i === -1) return l;
    var before = l.slice(0, i);
    // crude but sufficient: only strip when the // is not inside a quoted string
    var q = (before.match(/'/g) || []).length;
    return (q % 2 === 0) ? before : l;
  }).join('\n');
}
var RECO_CODE = code(RECO);

// ---- fixtures ----------------------------------------------------------------------------------------------
var SCOPE = { marketplaceSkuId: 'MSKU-1', marketplaceId: 'MP-US-AMZ', sku: 'SKU-A',
  company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' };
var CALC = '2026-10-08';
function iso(d) { return d.toISOString().slice(0, 10); }
function daysBack(from, n) { var d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
var D1 = daysBack(CALC, 1);   // 2026-10-07 — the Campaign day
var D2 = daysBack(CALC, 2);   // 2026-10-06 — the Special Event day

function dailyRun(overrides, omit, scopeOver) {
  var rows = [];
  for (var n = 1; n <= 30; n++) {
    var date = daysBack(CALC, n);
    if (omit && omit.indexOf(date) !== -1) continue;
    var units = (overrides && Object.prototype.hasOwnProperty.call(overrides, date)) ? overrides[date] : 10;
    var r = { date: date, sku: 'SKU-A', units: units, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' };
    if (scopeOver) Object.keys(scopeOver).forEach(function (k) { r[k] = scopeOver[k]; });
    rows.push(r);
  }
  return rows;
}
function campaign(start, end) {
  return { status: 'active', start: start, end: end, skuLines: [{ marketplaceSkuId: 'MSKU-1', sku: 'SKU-A' }] };
}
function event(start, end) {
  return { status: 'active', start: start, end: end, sku: 'SKU-A', marketplaceId: 'MP-US-AMZ' };
}
function run(o) {
  o = o || {};
  return KMCALC.normalizedAvgSalesPerDay({
    calcDate: CALC, scope: o.scope || SCOPE, weekly7d: (o.weekly7d != null) ? o.weekly7d : 700,
    dailySales: o.dailySales || dailyRun(), campaigns: o.campaigns || [], events: o.events || []
  });
}

// =============================================================================================================
section('A — THE GATE MOVED OFF THE RESOLVER CALL (42_ source contract)');
// =============================================================================================================
// A1 is the defect itself: the resolver used to be reachable ONLY from inside the sales_driven branch.
var callLine = RECO_CODE.split('\n').filter(function (l) { return /var sr = recoWsResolveSalesRate_\(/.test(l); });
eq(callLine.length, 1, 'A1  the MARKETPLACE branch calls recoWsResolveSalesRate_ exactly once');
ok(!/if \(planModel === 'sales_driven'\) \{ var sr = recoWsResolveSalesRate_/.test(RECO_CODE),
  'A2  and that call is NO LONGER inside the sales_driven branch — the gate that caused the defect is gone');
ok(/^\s*var sr = recoWsResolveSalesRate_\(snaps, scope, sku, calc\.calculationDate\);\s*$/m.test(RECO_CODE),
  'A3  it stands alone, so it runs for EVERY SKU in both Planning Models');

// =============================================================================================================
section('B — THE §22 ENGINE, EXECUTED (task fixture A)');
// =============================================================================================================
// 28 normal days @ 10, one Campaign day @ 100, one Special Event day @ 200 → expected 10.
var fixtureA = run({
  dailySales: dailyRun({ [D1]: 100, [D2]: 200 }),
  campaigns: [campaign(D1, D1)],
  events: [event(D2, D2)]
});
eq(fixtureA.avgSalesPerDay, 10, 'B1  28 normal days @10 + Campaign @100 + Event @200 → 10, not 16.33');
eq(fixtureA.normalDayCount, 28, 'B2  and exactly 28 days were counted — both activity days excluded');
eq(fixtureA.source, 'normalized_30d', 'B3  the source names the normalized rung');
eq(fixtureA.warning, '', 'B4  28 of 30 is a healthy sample, so no warning');
// B5 is the whole point of the round: ONE call, no mode argument, so the number cannot differ by mode.
ok(!/normalizedAvgSalesPerDay[\s\S]{0,400}?(planModel|demandMode|replenishment_model)/.test(RECO_CODE),
  'B5  no Planning Model token reaches the resolver call — the rate is mode-blind by construction');
var contaminated = run({ dailySales: dailyRun({ [D1]: 100, [D2]: 200 }) });   // same sales, NO exclusions declared
ok(contaminated.avgSalesPerDay > 10,
  'B6  and the exclusion is load-bearing — without the activity records the same sales give ' + contaminated.avgSalesPerDay);

// =============================================================================================================
section('C — ZERO, MISSING, LOW SAMPLE, FALLBACK');
// =============================================================================================================
var zero = run({ dailySales: dailyRun((function () { var o = {}; for (var n = 1; n <= 30; n++) o[daysBack(CALC, n)] = 0; return o; })()) });
eq(zero.avgSalesPerDay, 0, 'C1  thirty confirmed zero-sales days are a REAL zero');
eq(zero.normalDayCount, 30, 'C2  ...counted as thirty observations, not as missing data');
var missing = run({ dailySales: dailyRun(null, [D1, D2]) });
eq(missing.normalDayCount, 28, 'C3  two dates with NO row at all are missing — 28 observations, never 30');
eq(missing.avgSalesPerDay, 10, 'C4  ...and a missing date is not a zero, so the rate is unmoved');
var lowSample = run({ dailySales: dailyRun().slice(0, 4) });
eq(lowSample.normalDayCount, 4, 'C5  four normal days is a low sample');
ok(/low_sample/.test(String(lowSample.warning || '')), 'C6  ...and it carries the low-sample warning (' + lowSample.warning + ')');
var fallback = run({ dailySales: dailyRun().slice(0, 2), weekly7d: 700 });
eq(fallback.source, 'weekly_7d', 'C7  under three normal days the canonical fallback rung is taken');
eq(fallback.avgSalesPerDay, 100, 'C8  ...weekly_7d ÷ 7 = 100');
ok(/insufficient/.test(String(fallback.warning || '')), 'C9  ...and it is LABELLED, never a silent substitution');

// =============================================================================================================
section('D — ISOLATION');
// =============================================================================================================
var otherCompany = run({ dailySales: dailyRun(null, null, { company: 'ResUS' }) });
var otherMarket = run({ dailySales: dailyRun(null, null, { marketplace: 'Shopify', channel: 'Shopify' }) });
ok(otherCompany.avgSalesPerDay !== 10 || otherCompany.source === 'weekly_7d',
  'D1  rows belonging to another COMPANY do not feed this scope\'s rate (source=' + otherCompany.source + ')');
ok(otherMarket.avgSalesPerDay !== 10 || otherMarket.source === 'weekly_7d',
  'D2  rows belonging to another MARKETPLACE do not feed it either (source=' + otherMarket.source + ')');

// =============================================================================================================
section('E — THE FIVE DIAGNOSTICS TRAVEL, AND ARE NOT INVENTED');
// =============================================================================================================
['avgSalesPerDay', 'source', 'warning', 'normalDayCount', 'excludedDates'].forEach(function (f, i) {
  ok(Object.prototype.hasOwnProperty.call(fixtureA, f),
    'E' + (i + 1) + '  the §22 owner already returns ' + f + ' — 42_ forwards it rather than inventing it');
});
ok(/source: \(sr\.ok \? sr\.source : null\)/.test(RECO_CODE)
  && /warning: \(sr\.ok \? sr\.warning : null\)/.test(RECO_CODE)
  && /normalDayCount: \(sr\.ok \? sr\.normalDayCount : null\)/.test(RECO_CODE)
  && /excludedDates: \(sr\.ok \? sr\.excludedDates : null\)/.test(RECO_CODE),
  'E6  horizonBasis forwards all four quality fields verbatim from the owner');
ok(/avgSalesPerDay: \(sr\.ok \? sr\.avgSalesPerDay : null\)/.test(RECO_CODE),
  'E7  ...and the rate itself, with an unresolved basis staying NULL — never a fabricated 0');
ok(/excludedDates/.test(IR) && /avgSalesExcludedDates/.test(IR),
  'E8  the page already carries excludedDates through to the row (landed S8-R2)');

// =============================================================================================================
section('F — PLANNING DEMAND IS UNTOUCHED');
// =============================================================================================================
ok(/if \(planModel === 'sales_driven'\) \{ if \(sr\.ok\) salesRate = sr\.avgSalesPerDay; else salesReason =/.test(RECO_CODE),
  'F1  salesRate and salesReason are STILL assigned only under sales_driven');
ok(!/salesRate = sr\.avgSalesPerDay;[\s\S]{0,80}\}\s*$/m.test(RECO_CODE.replace(/if \(planModel === 'sales_driven'\)[^\n]*\n/, '')),
  'F2  ...and nowhere else — a Forecast-Driven SKU never acquires a planning basis');
ok(/recoWsBuildHorizons_\(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, horizonOpening, mIncoming, upc, nd\.destination, planModel, salesRate\)/.test(RECO_CODE),
  'F3  recoWsBuildHorizons_ still receives (planModel, salesRate) — byte-identical planning inputs');
ok(/avgSalesPerDay: \(mode === 'sales_driven' \? avgSalesPerDay : null\)/.test(RECO_CODE),
  'F4  and KMHP is still handed a rate ONLY under sales_driven, so forecast demand cannot shift');
ok(/\(planModel === 'sales_driven' && salesRate === null\) \? null/.test(RECO_CODE),
  'F5  the sales_driven fail-closed horizon guard is intact');
ok(/else mLine\.horizonsBlockedReason = salesReason \|\| 'HORIZON_PROJECTION_UNAVAILABLE'/.test(RECO_CODE),
  'F6  ...and because salesReason stays null for forecast_driven, a Forecast-Driven horizon failure can '
  + 'never be mislabelled SALES_BASIS_UNAVAILABLE');
ok(!/Target|target_pct|targetPct/.test(RECO_CODE.slice(RECO_CODE.indexOf('var sr = recoWsResolveSalesRate_'),
  RECO_CODE.indexOf('var sr = recoWsResolveSalesRate_') + 2000)),
  'F7  no Target Rule token appears anywhere in the changed region — Target behaviour is untouched');

// =============================================================================================================
section('G — R46 RELEASE GOVERNANCE');
// =============================================================================================================
var R46 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R46';
var R45 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R45';
eq((HEALTH.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1], R46,
  'G1  63_ declares R46 — the manifest is where a release is cut');
eq((HEALTH.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1], R46,
  'G2  ...and 63_\'s own module stamp moved, because 63_ itself changed');
var sir = fs.readFileSync(GS + '60_api_v1_inventory_replenishment_workspace.gs', 'utf8');
eq((sir.match(/var SIR_BUILD_VERSION_ = '([^']+)'/) || [])[1], R45,
  'G3  60_ STAYS at R45 — it did not change in R46, and marching it would claim a round it had no part in');
ok(RO.stampAtOrAfter(R46, R45) && !RO.stampAtOrAfter(R45, R46),
  'G4  R46 is ordered strictly after R45 in the append-only stamp list');
ok(!/BUILD_VERSION_|_RELEASE_ =/.test(RECO_CODE),
  'G5  42_ declares no build symbol — it is a STAMPLESS owner, copied and stamped by nobody');
var LOG = fs.readFileSync(path.join(ROOT, 'docs/planning/DEPLOYMENT_RELEASE_LOG.md'), 'utf8');
ok(LOG.indexOf(R46) !== -1, 'G6  R46 has a ledger entry');
ok(/NOT DEPLOYED/.test(LOG.slice(LOG.indexOf(R46))), 'G7  ...which records that nobody has deployed it');
ok(/60_api_v1_inventory_replenishment_workspace\.gs/.test(LOG.slice(LOG.indexOf(R46))),
  'G8  ...and names R45\'s still-pending 60_ in the paste set, because it has never been synced');

// =============================================================================================================
section('X — MUTANTS');
// =============================================================================================================
function mutant(id, what, fn) { ok(fn(), 'X  MUTANT CAUGHT — ' + id + ' ' + what); }
mutant('X1', 'the resolver call is put back inside the sales_driven branch', function () {
  var m = RECO_CODE.replace(/^(\s*)var sr = recoWsResolveSalesRate_\(([^)]*)\);\s*$/m,
    '$1if (planModel === \'sales_driven\') { var sr = recoWsResolveSalesRate_($2); }');
  return m !== RECO_CODE && /if \(planModel === 'sales_driven'\) \{ var sr = recoWsResolveSalesRate_/.test(m);
});
mutant('X2', 'horizonBasis goes back to publishing the rate only for sales_driven', function () {
  var m = RECO_CODE.replace('avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null)',
    "avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null)");
  return m !== RECO_CODE && !/avgSalesPerDay: \(sr\.ok \? sr\.avgSalesPerDay : null\)/.test(m);
});
mutant('X3', 'salesRate leaks out of its branch and becomes a forecast planning basis', function () {
  var m = RECO_CODE.replace(/if \(planModel === 'sales_driven'\) \{ if \(sr\.ok\) salesRate = sr\.avgSalesPerDay;/,
    'if (sr.ok) salesRate = sr.avgSalesPerDay; if (planModel === \'sales_driven\') { if (false) salesRate = null;');
  return m !== RECO_CODE
    && !/if \(planModel === 'sales_driven'\) \{ if \(sr\.ok\) salesRate = sr\.avgSalesPerDay;/.test(m);
});
mutant('X4', 'an unresolved basis is published as 0 instead of null', function () {
  var m = RECO_CODE.replace('avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : null)',
    'avgSalesPerDay: (sr.ok ? sr.avgSalesPerDay : 0)');
  return m !== RECO_CODE && /avgSalesPerDay: \(sr\.ok \? sr\.avgSalesPerDay : 0\)/.test(m);
});
mutant('X5', '60_ is marched to R46 although it did not change', function () {
  return (sir.match(/var SIR_BUILD_VERSION_ = '([^']+)'/) || [])[1] !== R46;
});
mutant('X6', 'the §22 exclusion is removed and the activity days re-enter the average', function () {
  return run({ dailySales: dailyRun({ [D1]: 100, [D2]: 200 }) }).avgSalesPerDay !== 10;
});

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exitCode = 1;
