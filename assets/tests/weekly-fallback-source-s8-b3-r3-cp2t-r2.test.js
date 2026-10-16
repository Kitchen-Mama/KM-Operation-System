// Kitchen Mama Operation System - S8-B3-R3-CP2T-R2 P0
// A MISSING WEEKLY SOURCE IS NOT A WEEK IN WHICH NOTHING SOLD
//
// Run: node assets/tests/weekly-fallback-source-s8-b3-r3-cp2t-r2.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. The fixture is ANONYMISED and synthetic.
//
// WHY THIS EXISTS, AND IT IS A CORRECTION OF MY OWN ACCEPTANCE. CP2T-R1 recorded, as expected behaviour,
// that a site whose daily rows all fall outside the 90-day window "publishes a rate: 0.0 with no weekly
// row". That sentence is the defect, written down as though it were the design. The frozen owner's ladder
// is "3 or more normal days -> normalized_30d, else weekly_7d / 7", and 42_ hands it `weekly7d`
// initialised to 0 and left there whenever the weekly source cannot be read:
//
//   * no weekly row for the resolved channel at all        -> 0
//   * a weekly row whose sales_units_7d cell is BLANK      -> recoWsNum_ returns null -> 0
//   * null / non-numeric / Infinity                        -> recoWsNum_ returns null -> 0
//   * NEGATIVE (a data error, not an observation)          -> clamped to 0
//
// In every one of those the owner divides 0 by 7 and the column prints a confident `0.0`. A fabricated
// zero is the worst available answer here: it is indistinguishable from a real "nothing sold", it feeds
// Days of Supply, and it silently says the site needs no replenishment.
//
// WHAT SEPARATES THE LEGITIMATE CASE. An EXPLICIT weekly 0 is a real observation and must keep working -
// the repair may not turn "a week with no sales" into a refusal. So availability is tracked at the point
// the cell is READ, not inferred from the value afterwards, and the refusal is raised only when THE OWNER
// ACTUALLY SELECTED the weekly rung. Nothing re-implements the window or the ladder.
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

// The real 42_ with the real frozen owners. KMCID is the shipped module, so the EU source set below is the
// frozen IRCountry.SALES_AGG authority rather than a list this file invents.
var KMCALC = require(path.join(ROOT, 'assets/js/core/supply-planning-calculations.js'));
var KMCID = require(path.join(ROOT, 'assets/js/core/supply-planning-country-identity.js'));
var KMDA = require(path.join(ROOT, 'assets/js/core/supply-planning-demand-allocation.js'));
var KMDR = require(path.join(ROOT, 'assets/js/core/supply-planning-destination-runtime.js'));
var KMSLS = require(path.join(ROOT, 'assets/js/core/supply-planning-shipment-line-source.js'));
var srvBox = {
  console: console, KMCALC: KMCALC, KMCID: KMCID, KMDA: KMDA, KMDR: KMDR, KMSLS: KMSLS,
  KMPA: { assembleProductionRecommendationFacts: function () { return { ready: false, issues: [{ code: 'RECOMMENDATION_RUNTIME_BLOCKED', message: 'runtime blocked (fixture)' }] }; } },
  KMPS: { buildProductionRecommendationSource: function () { return { ready: false, issues: [] }; } },
  KMPCX: { _forecastWeightMonths: function () { return ['2026-10']; } }
};
var srvCtx = vm.createContext(srvBox);
vm.runInContext(RECO, srvCtx);

var SKU = 'CO1150-BM';
var COMPANY = 'Kitchen Mama';
var SCOPE = { company: COMPANY, country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-US' };
var EU_SCOPE = { company: COMPANY, country: 'EU', marketplace: 'Amazon', marketplaceId: 'MKT-EU' };
var CALC_DATE = '2026-10-15';                      // frozen window = 2026-07-17 .. 2026-10-14
var CALC = { calculationDate: CALC_DATE, calculationMonth: '2026-10', planningCycle: 'W1' };
var VMETA = { formulaVersion: 'v1', sourceDataAsOf: CALC_DATE };
var CH = 'Amazon.com';

var DAILY_H = ['snapshot_date', 'country', 'channel', 'sku', 'sales_units', 'marketplace'];
var WEEKLY_H = ['week_end_date', 'country', 'channel', 'sku', 'sales_units_7d', 'marketplace'];

function snap(headers, rows) { return { headers: headers, rows: rows }; }
function dRow(date, units, o) {
  o = o || {};
  return [date, o.country || 'US', o.channel === undefined ? CH : o.channel, o.sku || SKU, units, o.marketplace || 'Amazon'];
}
function wRow(units, o) {
  o = o || {};
  return [o.weekEnd || '2026-10-12', o.country || 'US', o.channel === undefined ? CH : o.channel, o.sku || SKU, units, o.marketplace || 'Amazon'];
}
// n dated rows INSIDE the window (2026-09-xx), and the same count BEFORE it opens (2026-04-xx).
function inWindow(n, units, o) { var r = []; for (var i = 1; i <= n; i++) r.push(dRow('2026-09-' + ('0' + i).slice(-2), units === undefined ? 5 : units, o)); return r; }
function beforeWindow(n, units, o) { var r = []; for (var i = 1; i <= n; i++) r.push(dRow('2026-04-' + ('0' + i).slice(-2), units === undefined ? 5 : units, o)); return r; }

function snaps(o) {
  o = o || {};
  var s = {
    marketplaceSkus: snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
      o.mskRows || [[SKU, COMPANY, o.scopeCountry || 'US', 'Amazon', 'MSKU-1', o.model || 'sales_driven', 'SS-1']]),
    marketplaces: snap(['company', 'country', 'marketplace', 'marketplace_id', 'status'],
      [[COMPANY, 'US', 'Amazon', 'MKT-US', o.mktStatus || 'active'], [COMPANY, 'EU', 'Amazon', 'MKT-EU', 'active']]),
    campaigns: snap(['campaign_id', 'status', 'start_date', 'end_date'], o.campaigns || []),
    campaignSkuLines: snap(['campaign_id', 'marketplace_sku_id', 'sku'], o.campaignLines || []),
    fcSpecialEvents: snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'], o.events || []),
    fcRegularForecast: snap(['sku'], []), fcTargetRules: snap(['company'], []),
    skuDetails: snap(['sku', 'units_per_carton'], [[SKU, 12]])
  };
  s.amazonDailySalesSnapshot = snap(DAILY_H, o.daily || []);
  // `weeklyAbsent` means the TABLE was not in the read at all; `weekly: []` means read and empty.
  if (!o.weeklyAbsent) s.amazonWeeklySalesSnapshot = snap(WEEKLY_H, o.weekly || []);
  return s;
}
function resolve(s, scope) {
  srvBox.__s = s;
  return vm.runInContext('recoWsResolveSalesRate_(__s, ' + JSON.stringify(scope || SCOPE) + ', '
    + JSON.stringify(SKU) + ', ' + JSON.stringify(CALC_DATE) + ')', srvCtx);
}
function basisOf(sr, mode) {
  srvBox.__sr = sr; srvBox.__m = mode || 'sales_driven';
  return vm.runInContext('recoWsBasisOf_(__sr, __m)', srvCtx);
}
var RULE_H = ['company', 'country', 'marketplace', 'destination_warehouse_id', 'status', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'effective_from', 'effective_to'];
function withWarehouse(s) {
  s.warehouses = snap(['warehouse_id', 'company', 'is_active', 'warehouse_code', 'warehouse_name'], [['WH-A', COMPANY, true, 'A', 'Alpha']]);
  s.replenishmentDemandAllocationRules = snap(RULE_H, [[COMPANY, 'US', 'Amazon', 'WH-A', 'active', 1, 1, '2026-01-01', '']]);
  return s;
}
function expandWarehouse(s) {
  srvBox.__read = { snapshots: s };
  return vm.runInContext('recoWsExpandWarehouse_(__read, null, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', "SS-1", ' + JSON.stringify(CALC) + ', ' + JSON.stringify(VMETA) + ')', srvCtx);
}
function expandMarketplace(s) {
  srvBox.__read = { snapshots: s };
  return vm.runInContext('recoWsExpandMarketplace_(__read, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', "SS-1", ' + JSON.stringify(CALC) + ', ' + JSON.stringify(VMETA) + ', null)', srvCtx);
}

var WEEKLY_REASON = 'SALES_BASIS_WEEKLY_UNAVAILABLE';

// ---------------------------------------------------------------------------------------------------
section('A  the case CP2T-R1 accepted as correct - and it is the defect');
// ---------------------------------------------------------------------------------------------------
// 30 dated rows, every one of them BEFORE the window opens, and no weekly row anywhere. The owner samples
// none of them, counts zero normal days, takes the weekly rung, and divides a weekly total that was never
// read. CP2T-R1 wrote this down as "publishes a rate: 0.0 with no weekly row" and moved on.
var A = resolve(snaps({ daily: beforeWindow(30, 5), weekly: [] }));
eq(A.ok, false, 'A1  it must NOT resolve - there is no observation anywhere to average');
eq(A.reason, WEEKLY_REASON, 'A1a and it refuses by a NAMED reason');
ok(A.avgSalesPerDay === undefined, 'A1b publishing no rate at all - 0.0 here is a fabrication, not a measurement');
ok(/normal day|window|weekly/i.test(String(A.detail || '')),
  'A2  with a detail that says the weekly rung was reached and had nothing to divide', A.detail);
eq(basisOf(A).basisQualityError, WEEKLY_REASON, 'A3  and the basis the page reads carries the code');
eq(basisOf(A).avgSalesPerDay, null, 'A3a with a null rate, never a zero');

// The same shape with the weekly TABLE absent from the read, rather than read and empty.
var Aa = resolve(snaps({ daily: beforeWindow(30, 5), weeklyAbsent: true }));
eq(Aa.ok, false, 'A4  an ABSENT weekly table is not a weekly zero either');
eq(Aa.reason, WEEKLY_REASON, 'A4a same named reason');

// ---------------------------------------------------------------------------------------------------
section('B  fewer than 3 normal days, with every unusable weekly value');
// ---------------------------------------------------------------------------------------------------
// Two in-window days is below the frozen ladder's threshold, so the weekly rung is selected. Each case
// below differs ONLY in what the weekly cell holds, and none of them is an observation of zero.
var BAD = [
  ['absent table', { weeklyAbsent: true }],
  ['no row for this channel', { weekly: [] }],
  ['row present, cell BLANK', { weekly: [wRow('')] }],
  ['row present, cell null', { weekly: [wRow(null)] }],
  ['row present, non-numeric', { weekly: [wRow('n/a')] }],
  ['row present, Infinity', { weekly: [wRow(Infinity)] }],
  ['row present, NEGATIVE', { weekly: [wRow(-14)] }]
];
BAD.forEach(function (c) {
  var r = resolve(snaps(Object.assign({ daily: inWindow(2, 5) }, c[1])));
  eq(r.ok, false, 'B1 ' + c[0] + ' -> does not resolve');
  eq(r.reason, WEEKLY_REASON, 'B1a ' + c[0] + ' -> named reason, not a zero');
  ok(r.avgSalesPerDay === undefined, 'B1b ' + c[0] + ' -> no rate published');
});
// A weekly row that belongs to ANOTHER channel is not this basis's weekly source.
var Bch = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(70, { channel: 'Other.com' })] }));
eq(Bch.reason, WEEKLY_REASON, 'B2  a weekly row for a DIFFERENT channel is not a source for this one');
// Nor is one for another SKU or another site.
eq(resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(70, { sku: 'CO1100-R' })] })).reason, WEEKLY_REASON,
  'B3  nor one for another SKU');
eq(resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(70, { country: 'CA' })] })).reason, WEEKLY_REASON,
  'B4  nor one for another country');

// ---------------------------------------------------------------------------------------------------
section('C  an EXPLICIT weekly zero is a real observation and still works');
// ---------------------------------------------------------------------------------------------------
// This is the line the repair must not cross. "A week in which nothing sold" is a measurement; refusing it
// would trade one fabricated answer for one withheld truth.
var C = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(0)] }));
eq(C.ok, true, 'C1  an explicit 0 in sales_units_7d RESOLVES', C);
eq(C.avgSalesPerDay, 0, 'C1a to 0 / 7 = 0 - the owner ladder is untouched');
eq(C.source, 'weekly_7d', 'C1b on the weekly rung');
eq(C.warning, 'insufficient_normal_days', 'C1c with the unchanged warning, so the rung is never silent');
eq(basisOf(C).basisQualityError, null, 'C1d and no quality error - this is an answer, not a refusal');

// '0' as a STRING is the same observation; a sheet may store either.
var Cs = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow('0')] }));
eq(Cs.ok, true, 'C2  a string "0" is the same observation');
eq(Cs.avgSalesPerDay, 0, 'C2a and the same rate');

// ---------------------------------------------------------------------------------------------------
section('D  an explicit POSITIVE weekly value is unchanged');
// ---------------------------------------------------------------------------------------------------
var D = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(21)] }));
eq(D.ok, true, 'D1  resolves');
eq(D.avgSalesPerDay, 3, 'D1a to 21 / 7 = 3.0 - the frozen division, not a new one');
eq(D.source, 'weekly_7d', 'D1b on the weekly rung');
eq(D.warning, 'insufficient_normal_days', 'D1c warning unchanged');
// Weekly-ONLY (no daily rows at all) is the R5A case and still reaches its rung.
var Dw = resolve(snaps({ daily: [], weekly: [wRow(70, { channel: '' })] }));
eq(Dw.ok, true, 'D2  a weekly-ONLY site still resolves (the R5A repair is intact)', Dw);
eq(Dw.avgSalesPerDay, 10, 'D2a at 70 / 7 = 10.0');
// The LATEST week is the one taken, and an older usable row does not rescue an unusable latest one.
var Dl = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(70, { weekEnd: '2026-09-28' }), wRow('', { weekEnd: '2026-10-12' })] }));
eq(Dl.reason, WEEKLY_REASON,
  'D3  a BLANK latest week is not rescued by an older readable one - the owner rung is the latest week, and '
  + 'silently reaching back a week would be a second window policy invented here');

// ---------------------------------------------------------------------------------------------------
section('E  enough normal days - a missing weekly source is then irrelevant');
// ---------------------------------------------------------------------------------------------------
// The refusal keys on THE RUNG THE OWNER ACTUALLY SELECTED, so a site with a real daily sample is never
// refused for lacking a fallback it does not use.
var E = resolve(snaps({ daily: inWindow(30, 5), weeklyAbsent: true }));
eq(E.ok, true, 'E1  30 in-window days with NO weekly table at all still resolves', E);
eq(E.avgSalesPerDay, 5, 'E1a to the daily rate');
eq(E.source, 'normalized_30d', 'E1b on the normalized rung');
eq(E.warning, '', 'E1c with no warning');
// Exactly 3 normal days is the ladder's boundary: still the daily rung, with the low-sample warning.
var E3 = resolve(snaps({ daily: inWindow(3, 5), weeklyAbsent: true }));
eq(E3.ok, true, 'E2  exactly 3 normal days resolves without any weekly source', E3);
eq(E3.source, 'normalized_30d', 'E2a on the normalized rung - 3 is the frozen threshold');
eq(E3.warning, 'low_sample_warning', 'E2b with the low-sample warning, unchanged');
// And 2 days WITH a usable weekly source resolves, so E and B differ by the weekly source alone.
var E2w = resolve(snaps({ daily: inWindow(2, 5), weekly: [wRow(14)] }));
eq(E2w.ok, true, 'E3  2 normal days WITH a usable weekly source resolves');
eq(E2w.avgSalesPerDay, 2, 'E3a at 14 / 7 - so B is about the SOURCE, not about the day count');

// ---------------------------------------------------------------------------------------------------
section('F  a confirmed zero day count still publishes 0');
// ---------------------------------------------------------------------------------------------------
var F = resolve(snaps({ daily: inWindow(30, 0), weeklyAbsent: true }));
eq(F.ok, true, 'F1  30 confirmed zero-unit days resolve');
eq(F.avgSalesPerDay, 0, 'F1a to 0 - a reported zero is an observation and this round does not touch it');
eq(F.normalDayCount, 30, 'F1b over 30 normal days');
eq(F.source, 'normalized_30d', 'F1c on the normalized rung');
eq(basisOf(F).basisQualityError, null, 'F1d with no quality error');
ok(F.source !== C.source || F.normalDayCount !== 0,
  'F2  and it is DISTINGUISHABLE from the weekly-zero answer in C, which is the reason both are allowed to '
  + 'print 0.0 at all');

// ---------------------------------------------------------------------------------------------------
section('G  EU must not publish a zero with no usable member week either');
// ---------------------------------------------------------------------------------------------------
// The EU roll-up SUMS each eligible member latest week. A member with no row is skipped, so a sum over no
// members is 0 - the same fabrication one level up. The frozen IRCountry.SALES_AGG membership is read from
// the shipped KMCID, not declared here.
function euSnaps(o) {
  var s = snaps(Object.assign({ scopeCountry: 'EU' }, o));
  s.marketplaceSkus = snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
    [[SKU, COMPANY, 'EU', 'Amazon', 'MSKU-EU', 'sales_driven', 'SS-EU']]);
  return s;
}
var euDaily2 = [dRow('2026-09-01', 5, { country: 'IT' }), dRow('2026-09-02', 5, { country: 'IT' })];
var G = resolve(euSnaps({ daily: euDaily2, weekly: [wRow(70, { country: 'GB', channel: '' })] }), EU_SCOPE);
eq(G.ok, false, 'G1  an EU scope whose only weekly row is a NON-member country does not resolve', G);
eq(G.reason, WEEKLY_REASON, 'G1a by the named reason, not a summed-over-nothing zero');

var Gb = resolve(euSnaps({ daily: euDaily2, weekly: [wRow('', { country: 'IT', channel: '' })] }), EU_SCOPE);
eq(Gb.reason, WEEKLY_REASON, 'G2  nor does a member whose weekly cell is blank');

var Gn = resolve(euSnaps({ daily: euDaily2, weekly: [wRow(-7, { country: 'IT', channel: '' })] }), EU_SCOPE);
eq(Gn.reason, WEEKLY_REASON, 'G3  nor a negative member week');

// One member reporting an explicit 0 IS a usable source for the roll-up.
var Gz = resolve(euSnaps({ daily: euDaily2, weekly: [wRow(0, { country: 'IT', channel: '' })] }), EU_SCOPE);
eq(Gz.ok, true, 'G4  one member reporting an explicit 0 resolves', Gz);
eq(Gz.avgSalesPerDay, 0, 'G4a to 0 - a reported zero across the roll-up is still a reading');

// And a usable member beside an unusable one still sums the usable one only.
var Gm = resolve(euSnaps({ daily: euDaily2, weekly: [wRow(70, { country: 'IT', channel: '' }), wRow('', { country: 'DE', channel: '' })] }), EU_SCOPE);
eq(Gm.ok, true, 'G5  a readable member beside an unreadable one resolves');
eq(Gm.avgSalesPerDay, 10, 'G5a at 70 / 7 - the unreadable member contributes nothing and does not become a 0 reading');
ok(true, 'G5b NOT CHANGED: no per-member coverage threshold, no freshness rule and no TTL was introduced - '
  + 'one usable member is what the frozen roll-up already accepted, and widening that is not this round.');

// ---------------------------------------------------------------------------------------------------
section('H  the more specific reasons still win');
// ---------------------------------------------------------------------------------------------------
// A campaign date or identity failure says what is actually wrong; it must not be flattened into the new
// weekly reason just because the weekly rung would also have been empty.
var CAMP_LINES = [['CMP-1', 'MSKU-1', SKU]];
var H1 = resolve(snaps({ daily: inWindow(2, 5), weeklyAbsent: true, campaigns: [['CMP-1', 'active', 'next Tuesday', '2026-09-02']], campaignLines: CAMP_LINES }));
eq(H1.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'H1  an unreadable campaign DATE keeps its own reason (CP2T-R1), not the weekly one');
var H2 = resolve(snaps({ daily: inWindow(2, 5), weeklyAbsent: true, campaigns: [['CMP-1', 'active', '2026-09-01', '2026-09-02']], campaignLines: [['CMP-1', '', SKU]] }));
eq(H2.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'H1a and so does an untieable campaign LINE');
var H3 = resolve(snaps({ daily: inWindow(2, 5, { channel: CH }).concat(inWindow(1, 5, { channel: 'Other.com' })), weeklyAbsent: true }));
eq(H3.reason, 'SALES_BASIS_AMBIGUOUS', 'H2  an ambiguous channel keeps its reason too');
var H4 = resolve(snaps({ daily: [], weeklyAbsent: true }));
eq(H4.reason, 'SALES_BASIS_UNAVAILABLE',
  'H3  and a scope with NO rows at all keeps SALES_BASIS_UNAVAILABLE - the new reason is for a rung that was '
  + 'reached and found empty, not for a site with nothing to read');

// ---------------------------------------------------------------------------------------------------
section('I  both planning modes, both lanes, and the cell');
// ---------------------------------------------------------------------------------------------------
['sales_driven', 'forecast_driven'].forEach(function (model) {
  var bad = resolve(snaps({ model: model, daily: inWindow(2, 5), weeklyAbsent: true }));
  eq(basisOf(bad, model).basisQualityError, WEEKLY_REASON, 'I1 ' + model + ' carries the refusal');
  eq(basisOf(bad, model).avgSalesPerDay, null, 'I1a ' + model + ' with a null rate');
  var good = resolve(snaps({ model: model, daily: inWindow(2, 5), weekly: [wRow(21)] }));
  eq(basisOf(good, model).avgSalesPerDay, 3, 'I1b ' + model + ' and a usable weekly source still publishes 3.0');
});
var Iw = expandWarehouse(withWarehouse(snaps({ daily: inWindow(2, 5), weeklyAbsent: true })));
eq(Iw.lines.length, 1, 'I2  the WAREHOUSE lane answers');
eq(Iw.lines[0].horizonBasis && Iw.lines[0].horizonBasis.basisQualityError, WEEKLY_REASON,
  'I2a and its line carries the refusal rather than a 0 rate');
eq(Iw.lines[0].horizonBasis && Iw.lines[0].horizonBasis.avgSalesPerDay, null, 'I2b with a null rate');
var Im = expandMarketplace(snaps({ daily: inWindow(2, 5), weeklyAbsent: true }));
eq(Im && Im.horizonBasis && Im.horizonBasis.basisQualityError, WEEKLY_REASON,
  'I3  and so does the MARKETPLACE lane', Im && Im.horizonBasis);

// ---------------------------------------------------------------------------------------------------
section('J  the page half - mapping, picker, cell');
// ---------------------------------------------------------------------------------------------------
var F1A = require('./_f1a-scope-guard.js');
var IRREGION = IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__'));
var DOMROWS = [];
global.window = { IRContext: { toScopeRequest: function () { return { company: COMPANY, country: 'US', marketplace: 'Amazon' }; } }, KM_FLAGS: {} };
global.document = { querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? DOMROWS : []; }, getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
global.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
var REPLEN_ITEMS = [];
function escapeReplenHtml(s) { return String(s == null ? '' : s); }
function getReplenishmentData() { return REPLEN_ITEMS; }
function updateReplenRecoContext() { return {}; }
function _irRecoRerenderSummaries() {}
function _legacyRecSummaryTableHtml() { return ''; }
function _recSummaryRows() { return ''; }
function _irSearchApplied_() { return true; }
function renderReplenishment() {}
eval(F1A.guardPreamble(IRSRC));
eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRREGION);
var PROJ = IRSRC.slice(IRSRC.indexOf("var _avgDisplay = '--';"),
  IRSRC.indexOf('// Forecast breakdown (next 3 months, Target Rule applied)'));
var IR_DAYS = { daysOfSupply: function (stock, rate) { return (rate == null || rate <= 0) ? null : Math.floor(stock / rate); } };
function el(tag, cls) {
  return { tag: tag, className: cls || '', innerHTML: '', textContent: '', _attrs: {}, children: [],
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getAttribute: function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    querySelector: function (sel) {
      var want = sel.replace('.', '');
      for (var i = 0; i < this.children.length; i++) {
        if ((' ' + this.children[i].className + ' ').indexOf(' ' + want + ' ') !== -1) return this.children[i];
      } return null;
    } };
}
function cellFor(serverLines) {
  _irRecoApplyEnvelope({ success: true, data: { lines: serverLines }, meta: { requestId: 'r1' } },
    'ctx', { company: COMPANY, country: 'US', marketplace: 'Amazon' });
  var f = new Function('_irCanonicalSalesBasis_', 'IR', 'mp', 'currentStock', 'Math',
    PROJ + ' return { avgDailySales: _avgDisplay, daysOfSupply: _dosDisplay, avgSalesQualityError: _avgQualityError,'
    + ' avgSalesSource: _avgSource, avgSalesWarning: _avgWarning, avgSalesNormalDayCount: _avgNormalDays };');
  var item = f(_irCanonicalSalesBasis_, IR_DAYS, { sku: SKU }, 500, Math);
  item.sku = SKU;
  var row = el('div', 'scroll-row'); row.setAttribute('data-sku', SKU);
  var avg = el('div', 'scroll-cell replen-avg-cell'); avg.innerHTML = '--';
  var dos = el('div', 'scroll-cell replen-dos-cell'); dos.textContent = '--';
  row.children.push(avg, dos);
  DOMROWS = [row]; REPLEN_ITEMS = [item];
  _irRecoUpdateVelocityCells_();
  return { item: item, avg: avg, dos: dos };
}
var Jbad = cellFor(expandWarehouse(withWarehouse(snaps({ daily: inWindow(2, 5), weeklyAbsent: true }))).lines);
ok(Jbad.avg.innerHTML.indexOf('unavailable') !== -1,
  'J1  THE CELL REFUSES instead of printing a confident 0.0 over a week nobody reported', Jbad.avg.innerHTML);
ok(Jbad.avg.innerHTML.indexOf('0.0') === -1, 'J1a and the fabricated zero is nowhere in the cell');
eq(Jbad.dos.textContent, '--', 'J1b Days of Supply refuses with it - a 0 rate here would have read as infinite cover');
eq(Jbad.item.avgSalesQualityError, WEEKLY_REASON, 'J1c with the code on the row');
ok(/week/i.test(String(IR_AVG_QUALITY_TEXT[WEEKLY_REASON] || '')),
  'J1d and the operator-facing text names the weekly source rather than a bare code',
  IR_AVG_QUALITY_TEXT[WEEKLY_REASON]);

var Jzero = cellFor(expandWarehouse(withWarehouse(snaps({ daily: inWindow(2, 5), weekly: [wRow(0)] }))).lines);
ok(Jzero.avg.innerHTML.indexOf('0.0') === 0,
  'J2  while a REPORTED weekly zero still prints 0.0 at the cell', Jzero.avg.innerHTML);
ok(/divided by seven/.test(Jzero.avg.innerHTML),
  'J2a carrying the warning that says which rung produced it - a silent 0.0 and this 0.0 are different answers, '
  + 'and an equality assertion against the bare string would have accepted the silent one');
eq(Jzero.item.avgSalesQualityError, null, 'J2a with no quality error');
eq(Jzero.item.avgSalesWarning, 'insufficient_normal_days', 'J2b and the rung still declared');

// ---------------------------------------------------------------------------------------------------
section('K  what this suite does NOT establish');
// ---------------------------------------------------------------------------------------------------
ok(true, 'K1  NOT CHANGED: the frozen KMCALC ladder, its 3-day threshold, its 90-day window, the division '
  + 'by seven, and the latest-week selection. The refusal keys on the rung the OWNER selected; nothing here '
  + 'recomputes which rung that is.');
ok(true, 'K2  NOT INTRODUCED: a member-coverage threshold, a data-freshness rule or a TTL for the EU roll-up. '
  + 'One usable member week is what the frozen authority already accepted.');
ok(true, 'K3  NOT KNOWN: how many live rows were reading a fabricated 0. That is read off the live response '
  + 'once the new handler is deployed, not off this file.');

// Found while fixing this suite's own fixture, recorded rather than repaired: the MARKETPLACE lane blocks on
// an inactive destination BEFORE the basis is attached, so its line carries no horizonBasis at all and the
// cell prints the bare dash. That is the same shape CP2S-R2 repaired for the WAREHOUSE lane, where a missing
// allocation rule withheld the site SKU's sales history. It is NOT in this round's scope and is not fixed.
var Kinactive = expandMarketplace(snaps({ daily: inWindow(30, 5), weekly: [wRow(70)],
  mktStatus: 'inactive' }));
eq(Kinactive && Kinactive.blockedReason, 'MARKETPLACE_DESTINATION_INACTIVE',
  'K4  an inactive marketplace destination blocks the lane');
ok(Kinactive && Kinactive.horizonBasis === undefined,
  'K4a and the line carries NO horizonBasis, so the cell prints the bare dash even though the site has 30 days '
  + 'of readable history. RECORDED, NOT FIXED: same shape as the warehouse ruleset gate CP2S-R2 repaired, '
  + 'out of scope for this round.', Kinactive && Kinactive.horizonBasis);

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
