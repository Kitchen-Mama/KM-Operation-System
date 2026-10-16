// Kitchen Mama Operation System - S8-B3-R3-CP2T-R1 P0
// THE CAMPAIGN AND EVENT DATES, AS THE SHEET ACTUALLY STORES THEM
//
// Run: node assets/tests/campaign-event-date-passing-s8-b3-r3-cp2t-r1.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. The fixture is ANONYMISED and synthetic.
//
// WHY THIS EXISTS. CP2T proved what each refusal code MEANS. It did not ask where the values that trip
// them come from, and one answer was sitting in plain sight: `recoWsResolveSalesRate_` normalises
// `snapshot_date` through toYmd, and `recoWsBuildContaminationFacts_` - a DIFFERENT function - hands
// `campaigns.start_date`, `campaigns.end_date` and `fc_special_events.event_start_date/_end_date` to the
// frozen owner through recoWsStr_, which is String().trim() and nothing else.
//
// A Google Sheets date cell arrives in Apps Script as a JS Date OBJECT. String(Date) is
// "Mon Sep 28 2026 00:00:00 GMT+0800 (Taipei Standard Time)". The frozen owner demands strict YYYY-MM-DD
// and throws; the throw carries the label "campaigns[0].start"; 42_'s catch matches /campaigns\[/ and
// reports SALES_BASIS_CONTAMINATION_UNRESOLVED. So A DATE-FORMAT PROBLEM IS REPORTED AS AN IDENTITY
// PROBLEM, and CP2T's own register entry said that code meant an untieable line. Section H corrects that
// from the running code rather than from an edit to the sentence.
//
// WHAT THIS SUITE REFUSES TO BUY THE NUMBER WITH. The repair normalises at the marshalling boundary and
// nowhere else: the owner still validates, a date it cannot read still refuses BY NAME, no campaign is
// dropped to make the exclusion go away, and the published rate is still the EXCLUDED one. Section B pins
// that numerically - 10.0 excluded against 19.0 un-excluded - so "a number appears now" cannot pass.
//
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope.
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var RECO = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------------------------------
// THE SERVER SANDBOX - the real 42_ with the real frozen owners. KMCALC is the shipped module, so every
// rate below is computed by the frozen owner rather than declared here.
// ---------------------------------------------------------------------------------------------------
var KMCALC = require(path.join(ROOT, 'assets/js/core/supply-planning-calculations.js'));
var KMDA = require(path.join(ROOT, 'assets/js/core/supply-planning-demand-allocation.js'));
var KMDR = require(path.join(ROOT, 'assets/js/core/supply-planning-destination-runtime.js'));
var srvBox = {
  console: console, KMCALC: KMCALC, KMDA: KMDA, KMDR: KMDR,
  KMPA: { assembleProductionRecommendationFacts: function () { return { ready: false, issues: [{ code: 'RECOMMENDATION_RUNTIME_BLOCKED', message: 'runtime blocked (fixture)' }] }; } },
  KMPS: { buildProductionRecommendationSource: function () { return { ready: false, issues: [] }; } },
  KMPCX: { _forecastWeightMonths: function () { return ['2026-10']; } }
};
var srvCtx = vm.createContext(srvBox);
vm.runInContext(RECO, srvCtx);

// ---------------------------------------------------------------------------------------------------
// The sheets, by their own column names (06_amazon_import_config.gs for the snapshot; the campaign and
// event tables by the field names recoWsBuildContaminationFacts_ actually reads).
// ---------------------------------------------------------------------------------------------------
var SKU = 'CO1150-AG';
var COMPANY = 'Kitchen Mama';
var OTHER_COMPANY = 'Res US';
var SCOPE = { company: COMPANY, country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-1' };
var CALC_DATE = '2026-10-15';                       // window = 2026-07-17 .. 2026-10-14 (frozen owner)
var CALC = { calculationDate: CALC_DATE, calculationMonth: '2026-10', planningCycle: 'W1' };
var VMETA = { formulaVersion: 'v1', sourceDataAsOf: CALC_DATE };

function snap(headers, rows) { return { headers: headers, rows: rows }; }

// 27 normal days at 10 units + 3 campaign days at 100. The two averages are 10.0 (excluded, correct) and
// 19.0 (un-excluded). Any "fix" that buys the number by skipping the exclusion lands on 19.0.
var NORMAL_UNITS = 10, SPIKE_UNITS = 100;
var CAMP_DAYS = ['2026-09-28', '2026-09-29', '2026-09-30'];
var DAILY_HEADERS = ['snapshot_date', 'country', 'channel', 'sku', 'currency', 'sales_units', 'marketplace'];
function dailyRow(date, units, o) {
  o = o || {};
  return [date, o.country || 'US', o.channel === undefined ? 'Amazon.com' : o.channel, o.sku || SKU, 'USD', units, o.marketplace || 'Amazon'];
}
function dailyRows() {
  var r = [];
  for (var d = 1; d <= 27; d++) r.push(dailyRow('2026-09-' + ('0' + d).slice(-2), NORMAL_UNITS));
  CAMP_DAYS.forEach(function (d) { r.push(dailyRow(d, SPIKE_UNITS)); });
  return r;
}

var CAMP_HEADERS = ['campaign_id', 'status', 'start_date', 'end_date'];
var CLINE_HEADERS = ['campaign_id', 'marketplace_sku_id', 'sku'];
var EVT_HEADERS = ['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'];

function baseSnaps(o) {
  o = o || {};
  var model = o.model || 'sales_driven';
  return {
    amazonDailySalesSnapshot: snap(DAILY_HEADERS, o.daily || dailyRows()),
    amazonWeeklySalesSnapshot: snap(['week_end_date', 'country', 'channel', 'sku', 'sales_units_7d', 'marketplace'], o.weekly || []),
    marketplaceSkus: snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'],
      o.mskRows || [[SKU, COMPANY, 'US', 'Amazon', 'MSKU-1', model, 'SS-1']]),
    marketplaces: snap(['company', 'country', 'marketplace', 'marketplace_id'], [[COMPANY, 'US', 'Amazon', 'MKT-1']]),
    campaigns: snap(CAMP_HEADERS, o.campaigns || []),
    campaignSkuLines: snap(CLINE_HEADERS, o.campaignLines || []),
    fcSpecialEvents: snap(EVT_HEADERS, o.events || []),
    fcRegularForecast: snap(['sku'], []), fcTargetRules: snap(['company'], []),
    skuDetails: snap(['sku', 'units_per_carton'], [[SKU, 12]])
  };
}
// One campaign covering CAMP_DAYS, with its start/end written the way the caller asks.
function campaignOn(start, end) { return [['CMP-1', 'active', start, end]]; }
var CAMP_LINES = [['CMP-1', 'MSKU-1', SKU]];

function resolve(snaps, calcDate) {
  srvBox.__s = snaps;
  return vm.runInContext('recoWsResolveSalesRate_(__s, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', ' + JSON.stringify(calcDate === undefined ? CALC_DATE : calcDate) + ')', srvCtx);
}
function contamFacts(snaps, mSkuId) {
  srvBox.__s = snaps;
  return vm.runInContext('recoWsBuildContaminationFacts_(__s, ' + JSON.stringify(SCOPE) + ', '
    + JSON.stringify(SKU) + ', ' + JSON.stringify(mSkuId === undefined ? 'MSKU-1' : mSkuId) + ')', srvCtx);
}
function basisOf(sr, mode) {
  srvBox.__sr = sr; srvBox.__m = mode || 'sales_driven';
  return vm.runInContext('recoWsBasisOf_(__sr, __m)', srvCtx);
}
function expandWarehouse(snaps) {
  srvBox.__read = { snapshots: snaps };
  return vm.runInContext('recoWsExpandWarehouse_(__read, null, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU)
    + ', "SS-1", ' + JSON.stringify(CALC) + ', ' + JSON.stringify(VMETA) + ')', srvCtx);
}
var RULE_HEADERS = ['company', 'country', 'marketplace', 'destination_warehouse_id', 'status', 'forecast_allocation_ratio', 'sales_allocation_ratio', 'effective_from', 'effective_to'];
function withWarehouse(snaps) {
  snaps.warehouses = snap(['warehouse_id', 'company', 'is_active', 'warehouse_code', 'warehouse_name'], [['WH-A', COMPANY, true, 'A', 'Alpha']]);
  snaps.replenishmentDemandAllocationRules = snap(RULE_HEADERS, [[COMPANY, 'US', 'Amazon', 'WH-A', 'active', 1, 1, '2026-01-01', '']]);
  return snaps;
}

// A real Sheets date cell: a JS Date at LOCAL midnight. This is what getValues() returns, and it is the
// value the shipped code has been String()-ing.
function cell(y, m, d) { return new Date(y, m - 1, d); }

// ---------------------------------------------------------------------------------------------------
section('A  a real Sheet Date cell on a campaign - the boundary where it was String()-ed');
// ---------------------------------------------------------------------------------------------------
var sA = baseSnaps({ campaigns: campaignOn(cell(2026, 9, 28), cell(2026, 9, 30)), campaignLines: CAMP_LINES });
var fA = contamFacts(sA);
ok(fA.ok === true, 'A0  the marshaller itself never fails - a source problem is not its to refuse');
eq(fA.campaigns.length, 1, 'A0a and the campaign that touches this SKU is passed through');
eq(fA.campaigns[0].start, '2026-09-28',
  'A1  THE MARSHALLED start IS THE CANONICAL YYYY-MM-DD - a Date cell is coerced at the boundary, exactly as '
  + 'snapshot_date already was, instead of reaching the owner as "Mon Sep 28 2026 00:00:00 GMT+0800 (...)"');
eq(fA.campaigns[0].end, '2026-09-30', 'A1a and so is end');

var rA = resolve(sA);
ok(rA.ok === true, 'A2  and the SKU RESOLVES - the date cell is no longer a refusal', rA);
eq(rA.ok === true ? rA.excludedDates : null, CAMP_DAYS,
  'A2a with the campaign days excluded, which is the whole reason the dates are passed at all');

// ---------------------------------------------------------------------------------------------------
section('B  the number is the EXCLUDED average, not the one that appears if exclusion is skipped');
// ---------------------------------------------------------------------------------------------------
// 27 normal days at 10 and 3 campaign days at 100. The only way to read 19.0 is to have dropped the
// campaign; the only way to read 10.0 is to have excluded it.
eq(rA.ok === true ? rA.avgSalesPerDay : null, 10, 'B1  27 normal days of 10 units = 10.0 per day');
ok(rA.ok !== true || rA.avgSalesPerDay !== 19,
  'B1a and NOT 19.0, which is what 30 days including the spike average to');
eq(rA.ok === true ? rA.normalDayCount : null, 27, 'B2  the owner counted 27 normal days, not 30');
eq(rA.ok === true ? rA.source : null, 'normalized_30d', 'B2a over the normalized_30d rung');
eq(rA.ok === true ? rA.warning : null, '', 'B2b with no low-sample warning - 27 days is a real sample');

// The same fixture with the campaign REMOVED is the control: it is the number a dropped campaign produces.
var rCtl = resolve(baseSnaps({}));
eq(rCtl.ok === true ? rCtl.avgSalesPerDay : null, 19,
  'B3  CONTROL - with no campaign at all the same rows average 19.0, so B1 discriminates and is not a tautology');

// ---------------------------------------------------------------------------------------------------
section('C  every representation a Sheet can hold, for campaigns AND events');
// ---------------------------------------------------------------------------------------------------
// The date-format coverage CP2T built reached snapshot_date only. These are the OTHER four date columns.
var REPS = [
  ['Date object', cell(2026, 9, 28), cell(2026, 9, 30)],
  ['YYYY-MM-DD', '2026-09-28', '2026-09-30'],
  ['YYYY/MM/DD', '2026/09/28', '2026/09/30'],
  ['M/D/YYYY', '9/28/2026', '9/30/2026']
];
REPS.forEach(function (rep) {
  var r = resolve(baseSnaps({ campaigns: campaignOn(rep[1], rep[2]), campaignLines: CAMP_LINES }));
  ok(r.ok === true, 'C1 campaign start/end as ' + rep[0] + ' resolves', r.ok === true ? undefined : r);
  eq(r.ok === true ? r.excludedDates : null, CAMP_DAYS, 'C1a ' + rep[0] + ' excludes the same three days');
  eq(r.ok === true ? r.avgSalesPerDay : null, 10, 'C1b ' + rep[0] + ' gives the same excluded average');
});
REPS.forEach(function (rep) {
  var ev = [[SKU, 'active', 'MKT-1', COMPANY, 'US', 'Amazon', rep[1], rep[2]]];
  var r = resolve(baseSnaps({ events: ev }));
  ok(r.ok === true, 'C2 fc_special_events start/end as ' + rep[0] + ' resolves', r.ok === true ? undefined : r);
  eq(r.ok === true ? r.excludedDates : null, CAMP_DAYS, 'C2a ' + rep[0] + ' excludes the same three event days');
  eq(r.ok === true ? r.avgSalesPerDay : null, 10, 'C2b ' + rep[0] + ' gives the same excluded average');
});

// ---------------------------------------------------------------------------------------------------
section('D  a date that is genuinely unreadable STILL refuses, by name');
// ---------------------------------------------------------------------------------------------------
// The marshaller coerces what it recognises and passes everything else through UNCHANGED, so the frozen
// owner remains the validator. Normalising is not the same as accepting.
var dBad = resolve(baseSnaps({ campaigns: campaignOn('next Tuesday', '2026-09-30'), campaignLines: CAMP_LINES }));
eq(dBad.ok, false, 'D1  an unparseable campaign start does not resolve');
eq(dBad.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'D1a and refuses by name');
ok(/next Tuesday/.test(String(dBad.detail || '')),
  'D1b naming the value it could not read, so the operator knows which cell to repair', dBad.detail);
ok(dBad.avgSalesPerDay === undefined, 'D1c and publishes NO rate - an un-excluded average is not this average');

var dBlank = resolve(baseSnaps({ campaigns: campaignOn('', ''), campaignLines: CAMP_LINES }));
eq(dBlank.ok, false, 'D2  a campaign with BLANK dates does not resolve either');
eq(dBlank.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'D2a it is still a named refusal, not a silent skip');

var dReal = resolve(baseSnaps({ campaigns: campaignOn('2026-09-31', '2026-09-31'), campaignLines: CAMP_LINES }));
eq(dReal.ok, false, 'D3  2026-09-31 is a well-FORMED date that does not exist');
eq(dReal.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'D3a the owner calendar check still runs - no validation was loosened');

var dInvalidDate = resolve(baseSnaps({ campaigns: campaignOn(new Date('nope'), '2026-09-30'), campaignLines: CAMP_LINES }));
eq(dInvalidDate.ok, false, 'D4  an Invalid Date OBJECT is not coerced into a plausible day');
eq(dInvalidDate.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'D4a it refuses rather than inventing one');

// And the campaign is never deleted to make the problem disappear.
var fBad = contamFacts(baseSnaps({ campaigns: campaignOn('next Tuesday', '2026-09-30'), campaignLines: CAMP_LINES }));
eq(fBad.campaigns.length, 1, 'D5  the unreadable campaign is still PASSED to the owner, not filtered out');
eq(fBad.campaigns[0].start, 'next Tuesday', 'D5a with its value intact, so the owner is the one that judges it');

// ---------------------------------------------------------------------------------------------------
section('E  Asia/Taipei - the normaliser reads the calendar day, not a UTC slice of it');
// ---------------------------------------------------------------------------------------------------
// A Date at local midnight in a +08:00 zone is 16:00 of the PREVIOUS day in UTC, so toISOString().slice(0,10)
// silently reports the day before. This runs the shipped normaliser in a CHILD PROCESS pinned to
// Asia/Taipei and asks it for both readings, so the trap is shown to be live in that zone and the shipped
// answer is shown to avoid it. Asserting this in-process would prove nothing on a UTC runner.
var probe = path.join(__dirname, '_cp2t-r1-tz-probe.js');
var tz = cp.spawnSync(process.execPath, [probe], { encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'Asia/Taipei' }) });
var TZ = null;
try { TZ = JSON.parse(String(tz.stdout || '').trim()); } catch (e) { TZ = null; }
ok(TZ !== null, 'E0  the Asia/Taipei probe ran', String(tz.stderr || tz.stdout || '').slice(0, 300));
if (TZ) {
  eq(TZ.offsetMinutes, -480, 'E0a and the child really is at UTC+08:00, so the rest of E is not vacuous');
  eq(TZ.toISO, '2026-09-04',
    'E1  the TRAP IS LIVE: toISOString().slice(0,10) on local midnight 2026-09-05 reports the 4th');
  eq(TZ.ymd, '2026-09-05', 'E1a the shipped normaliser reports the 5th - local calendar components, no UTC slice');
  eq(TZ.campaignStart, '2026-09-05', 'E2  and a campaign start cell normalises to the 5th through the marshaller');
  eq(TZ.eventStart, '2026-09-05', 'E2a and so does an event start cell');
  eq(TZ.lateYmd, '2026-09-05',
    'E3  a cell carrying a late-evening time on the 5th is still the 5th - the time of day is not a day boundary');
}

// ---------------------------------------------------------------------------------------------------
section('F  a FUTURE campaign is passed legally and the OWNER decides the window');
// ---------------------------------------------------------------------------------------------------
// The marshaller does not filter by date, and must not start: deciding what lies inside the 90-day window
// is the frozen owner's job (_addRangeWithinWindow clips it). A future campaign is a legitimate row.
var sF = baseSnaps({ campaigns: campaignOn(cell(2027, 3, 1), cell(2027, 3, 5)), campaignLines: CAMP_LINES });
var fF = contamFacts(sF);
eq(fF.campaigns.length, 1, 'F1  a future campaign is still handed to the owner');
eq(fF.campaigns[0].start, '2027-03-01', 'F1a normalised, not filtered');
var rF = resolve(sF);
ok(rF.ok === true, 'F2  and it resolves - a future campaign is not an error', rF);
eq(rF.ok === true ? rF.excludedDates : null, [],
  'F2a with NOTHING excluded, because the owner clipped it to the window rather than the marshaller dropping it');
eq(rF.ok === true ? rF.avgSalesPerDay : null, 19,
  'F2b so the average is the full 30-day one - those spike days are not a campaign in this fixture');

// A campaign that STRADDLES the window edge is clipped, not rejected.
var rStr = resolve(baseSnaps({ campaigns: campaignOn(cell(2026, 9, 28), cell(2027, 1, 31)), campaignLines: CAMP_LINES }));
ok(rStr.ok === true, 'F3  a campaign running past the window end resolves', rStr);
eq(rStr.ok === true ? rStr.excludedDates : null, CAMP_DAYS,
  'F3a and only its in-window, in-sample days are excluded');

// ---------------------------------------------------------------------------------------------------
section('G  both planning models, both destinations, company isolation, confirmed zero');
// ---------------------------------------------------------------------------------------------------
['sales_driven', 'forecast_driven'].forEach(function (model) {
  var sM = baseSnaps({ model: model, campaigns: campaignOn(cell(2026, 9, 28), cell(2026, 9, 30)), campaignLines: CAMP_LINES });
  var rM = resolve(sM);
  var bM = basisOf(rM, model);
  eq(bM.demandMode, model, 'G1 ' + model + ' basis carries its mode');
  eq(bM.avgSalesPerDay, 10,
    'G1a ' + model + ' publishes the excluded rate - the history is a fact about the site SKU, not an input to one formula');
  eq(bM.basisQualityError, null, 'G1b ' + model + ' has no quality error');
  var W = expandWarehouse(withWarehouse(sM));
  ok(W.lines.length >= 1, 'G2 ' + model + ' WAREHOUSE expands');
  eq(W.lines[0].horizonBasis && W.lines[0].horizonBasis.avgSalesPerDay, 10,
    'G2a ' + model + ' and every warehouse line carries the SAME excluded rate');
});

// Company isolation: another company's campaign on another marketplace_sku_id is not this site's campaign.
var sIso = baseSnaps({ campaigns: campaignOn(cell(2026, 9, 28), cell(2026, 9, 30)), campaignLines: [['CMP-1', 'MSKU-OTHER', 'OTHER-SKU']] });
var rIso = resolve(sIso);
ok(rIso.ok === true, 'G3  a campaign touching neither our marketplace_sku_id nor our master sku resolves', rIso);
eq(rIso.ok === true ? rIso.excludedDates : null, [], 'G3a and excludes nothing - it was never ours');

// Event isolation runs on the OWNER's rule, which is not the company column. An event carrying a
// marketplace_id is isolated by that id ALONE - a drafted assertion here expected a foreign `company`
// string to exclude an event stamped with OUR marketplace_id, and the owner was right: marketplace_id is
// authoritative and no composite rescues or overrides it. Both of its branches are covered below.
var sEvtOther = baseSnaps({ events: [[SKU, 'active', 'MKT-OTHER', OTHER_COMPANY, 'US', 'Amazon', cell(2026, 9, 28), cell(2026, 9, 30)]] });
var rEvtOther = resolve(sEvtOther);
ok(rEvtOther.ok === true, 'G4  an event carrying ANOTHER site marketplace_id resolves', rEvtOther);
eq(rEvtOther.ok === true ? rEvtOther.excludedDates : null, [],
  'G4a and excludes nothing - an id mismatch is out of scope even with country and marketplace matching');
eq(rEvtOther.ok === true ? rEvtOther.avgSalesPerDay : null, 19, 'G4b so the spike days stay in the sample');

var sEvtComposite = baseSnaps({ events: [[SKU, 'active', '', OTHER_COMPANY, 'US', 'Amazon', cell(2026, 9, 28), cell(2026, 9, 30)]] });
var rEvtComposite = resolve(sEvtComposite);
ok(rEvtComposite.ok === true, 'G5  an event with NO marketplace_id falls back to the company composite', rEvtComposite);
eq(rEvtComposite.ok === true ? rEvtComposite.excludedDates : null, [],
  'G5a and another company does not contaminate this one - the date repair changed no isolation rule');

var sEvtOurs = baseSnaps({ events: [[SKU, 'active', 'MKT-1', OTHER_COMPANY, 'XX', 'Nowhere', cell(2026, 9, 28), cell(2026, 9, 30)]] });
var rEvtOurs = resolve(sEvtOurs);
eq(rEvtOurs.ok === true ? rEvtOurs.excludedDates : null, CAMP_DAYS,
  'G6  and an event stamped with OUR marketplace_id IS ours however its company / country columns read - '
  + 'marketplace_id is the authority, which is the owner rule, not this layer and not this round');

// A confirmed zero is a real observation and still is.
var zeroDaily = [];
for (var z = 1; z <= 27; z++) zeroDaily.push(dailyRow('2026-09-' + ('0' + z).slice(-2), 0));
CAMP_DAYS.forEach(function (d) { zeroDaily.push(dailyRow(d, SPIKE_UNITS)); });
var rZero = resolve(baseSnaps({ daily: zeroDaily, campaigns: campaignOn(cell(2026, 9, 28), cell(2026, 9, 30)), campaignLines: CAMP_LINES }));
ok(rZero.ok === true, 'G7  27 confirmed zero days with a campaign spike resolves', rZero);
eq(rZero.ok === true ? rZero.avgSalesPerDay : null, 0,
  'G7a to 0 - a reported zero is an observation, and the campaign spike does not rescue it into a positive number');
eq(basisOf(rZero, 'sales_driven').basisQualityError, null, 'G7b and 0 is not a quality error');

// ---------------------------------------------------------------------------------------------------
section('H  CONTAMINATION_UNRESOLVED is NOT necessarily an identity problem - both causes, from the code');
// ---------------------------------------------------------------------------------------------------
// CP2T recorded this code as "a campaign line that cannot be tied to this site". That is ONE of its
// causes. A campaign line whose DATE the owner cannot read produces exactly the same code, because the
// catch in 42_ discriminates on the owner's error LABEL (campaigns[...]) and both throws carry it.
var hIdentity = resolve(baseSnaps({ campaigns: campaignOn('2026-09-28', '2026-09-30'), campaignLines: [['CMP-1', '', SKU]] }));
eq(hIdentity.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'H1  an untieable line gives the code (the cause CP2T recorded)');
ok(/marketplaceSkuId/.test(String(hIdentity.detail || '')), 'H1a and its detail names the identity', hIdentity.detail);
eq(dBad.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED', 'H2  an unreadable DATE gives the SAME code');
ok(/start|YYYY-MM-DD/.test(String(dBad.detail || '')), 'H2a and its detail names the date', dBad.detail);
ok(hIdentity.detail !== dBad.detail,
  'H3  THE DETAIL IS WHAT SEPARATES THEM. The code alone does not, so a report carrying only the code cannot '
  + 'be read as an identity problem - which is the sentence this round corrects.');

// ---------------------------------------------------------------------------------------------------
section('I  the page half - mapping, picker, cell');
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

// THE WHOLE CHAIN IN ONE CALL: real expander -> real envelope -> real mapping -> real picker -> real cell.
//
// The projection slice BELOW calls `_irCanonicalSalesBasis_(mp.sku)` itself, so the picker is handed in
// rather than its result. An earlier draft of this file passed a pre-computed `_canonBasis` instead; the
// slice redeclares that name from its own call, `typeof _irCanonicalSalesBasis_` was false inside the
// Function, and EVERY case printed the dash - a harness that reported the page defect this round is about
// while the page was fine. The picker, IR and mp cross the boundary; nothing is recomputed on this side.
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
    + ' avgSalesSource: _avgSource, avgSalesWarning: _avgWarning, avgSalesNormalDayCount: _avgNormalDays,'
    + ' avgSalesExcludedDates: _avgExcluded };');
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
var wCamp = expandWarehouse(withWarehouse(baseSnaps({ campaigns: campaignOn(cell(2026, 9, 28), cell(2026, 9, 30)), campaignLines: CAMP_LINES })));
var cellCamp = cellFor(wCamp.lines);
eq(cellCamp.avg.innerHTML, '10.0',
  'I1  THE CELL PRINTS 10.0 - reader, marshaller, frozen owner, basis, mapping, picker and cell, with a real '
  + 'Sheet Date cell on the campaign. That is the end of the chain this round is about.');
var wBad = expandWarehouse(withWarehouse(baseSnaps({ campaigns: campaignOn('next Tuesday', '2026-09-30'), campaignLines: CAMP_LINES })));
eq(cellCamp.dos.textContent, '50', 'I1a with Days of Supply from the same rate (500 units of stock)');
eq(cellCamp.item.avgSalesExcludedDates, CAMP_DAYS, 'I1b and the ROW carries the excluded days - the evidence for 10.0 rather than 19.0');
eq(cellCamp.item.avgSalesNormalDayCount, 27, 'I1c over 27 normal days');
eq(cellCamp.item.avgSalesSource, 'normalized_30d', 'I1d on the normalized rung');
var cellBad = cellFor(wBad.lines);
ok(cellBad.avg.innerHTML.indexOf('unavailable') !== -1,
  'I2  and an unreadable date reaches the cell as a REFUSAL, not as a number and not as the bare dash',
  cellBad.avg.innerHTML);
eq(cellBad.item.avgSalesQualityError, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'I2a carrying the code, so the row says which refusal it is');

// ---------------------------------------------------------------------------------------------------
section('J  what this suite does NOT establish');
// ---------------------------------------------------------------------------------------------------
ok(true, 'J1  NOT KNOWN: which representation the live campaigns / fc_special_events sheets actually store. '
  + 'All four are covered rather than one assumed, which is why C exists in this shape.');
ok(true, 'J2  NOT CLAIMED: that this was the only cause of the live column. It is A cause, reproduced from the '
  + 'shipped code; the CP2T rejection-cause table still enumerates the others.');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
