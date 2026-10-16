// Kitchen Mama Operation System - S8-B3-R3-CP2T P0
// EVERY WAY THE COLUMN CAN REFUSE, AND THE EXACT WORDS IT REFUSES WITH
//
// Run: node assets/tests/avg-sales-rejection-causes-s8-b3-r3-cp2t.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. The fixture is ANONYMISED and synthetic.
//
// WHY THIS EXISTS. The live report is "some rows say unavailable, some say --". Those are two different
// states and `--` is itself two different states (no basis published, or a basis with no rate). Until each
// cause is tied to the exact code it produces, a screenshot cannot be read, and the temptation is to
// "make a number appear" - by ignoring campaign exclusion, filling 0, or forcing the weekly rate. Section
// E pins that none of those happen.
//
// THE CHAIN IS RUN, NOT DESCRIBED: the real row reader over a real-shaped snapshot, the real resolver with
// the real frozen KMCALC owner, the real basis builder, the real page mapping, the real picker, and the
// real cell writer. Nothing is asserted against source text.
//
// THE FIXTURE USES THE DESTINATION SHEET'S OWN FIELD NAMES, as `06_amazon_import_config.gs` maps them -
// `snapshot_date, country, channel, sku, currency, sales_units, ...` with `marketplace` a fixedValue - and
// exercises EVERY date representation the shipped normaliser accepts (a Date object, 'YYYY-MM-DD',
// 'YYYY/MM/DD', 'M/D/YYYY') plus the blank one the attachment actually contained. Which of those the live
// sheet stores is not known here, so all of them are covered rather than one of them assumed.
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
var srvBox = { console: console, KMCALC: KMCALC };
var srvCtx = vm.createContext(srvBox);
vm.runInContext(RECO, srvCtx);

// ---------------------------------------------------------------------------------------------------
// The destination sheet, by its own column names.
// ---------------------------------------------------------------------------------------------------
var SKU = 'CO1150-AG';
var COMPANY = 'Kitchen Mama';
var OTHER_COMPANY = 'Res US';
var SCOPE = { company: COMPANY, country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-1' };
var CALC_DATE = '2026-10-15';

var DAILY_HEADERS = ['snapshot_date', 'country', 'channel', 'sku', 'currency', 'sales_units',
  'sales_amount', 'return_units', 'total_orders', 'session', 'page_view', 'marketplace'];
function dailyRow(date, units, opts) {
  opts = opts || {};
  return [date, opts.country || 'US', opts.channel === undefined ? 'Amazon.com' : opts.channel, opts.sku || SKU,
    'USD', units, (units || 0) * 19.99, 0, units, 10, 20, opts.marketplace || 'Amazon'];
}
// EVERY representation the shipped toYmd accepts, so a sheet that stores any of them is covered.
function datedRows(units) {
  var rows = [];
  for (var d = 1; d <= 7; d++) rows.push(dailyRow(new Date(2026, 8, d), units));            // Date object
  for (var e = 8; e <= 14; e++) rows.push(dailyRow('2026-09-' + ('0' + e).slice(-2), units)); // YYYY-MM-DD
  for (var f = 15; f <= 21; f++) rows.push(dailyRow('2026/09/' + ('0' + f).slice(-2), units)); // YYYY/MM/DD
  for (var g = 22; g <= 28; g++) rows.push(dailyRow('9/' + g + '/2026', units));              // M/D/YYYY
  return rows;
}
function snap(headers, rows) { return { headers: headers, rows: rows }; }
function baseSnaps(units, o) {
  o = o || {};
  var daily = datedRows(units === undefined ? 10 : units);
  if (o.blanks) for (var i = 0; i < o.blanks; i++) daily.push(dailyRow('', 99));
  if (o.extraDaily) o.extraDaily.forEach(function (r) { daily.push(r); });
  var mskRows = o.mskRows || [[SKU, COMPANY, 'US', 'Amazon', 'MSKU-1', 'sales_driven', 'SS-1']];
  return {
    amazonDailySalesSnapshot: snap(DAILY_HEADERS, daily),
    amazonWeeklySalesSnapshot: snap(['week_end_date', 'country', 'channel', 'sku', 'sales_units_7d', 'marketplace'],
      o.weekly || []),
    marketplaceSkus: snap(['sku', 'company', 'country', 'marketplace', 'marketplace_sku_id', 'replenishment_model', 'site_sku'], mskRows),
    marketplaces: snap(['company', 'country', 'marketplace', 'marketplace_id'], [[COMPANY, 'US', 'Amazon', 'MKT-1']]),
    campaigns: o.campaigns === null ? undefined : snap(['campaign_id', 'status', 'start_date', 'end_date'], o.campaigns || []),
    campaignSkuLines: o.campaigns === null ? undefined : snap(['campaign_id', 'marketplace_sku_id', 'sku'], o.campaignLines || []),
    fcSpecialEvents: snap(['sku', 'status', 'marketplace_id', 'company', 'country', 'marketplace', 'event_start_date', 'event_end_date'], o.events || [])
  };
}
function resolve(snaps, calcDate) {
  srvBox.__s = snaps;
  return vm.runInContext('recoWsResolveSalesRate_(__s, ' + JSON.stringify(SCOPE) + ', ' + JSON.stringify(SKU) + ', '
    + JSON.stringify(calcDate === undefined ? CALC_DATE : calcDate) + ')', srvCtx);
}
function basisOf(sr, mode) {
  srvBox.__sr = sr; srvBox.__m = mode || 'sales_driven';
  return vm.runInContext('recoWsBasisOf_(__sr, __m)', srvCtx);
}

// ---------------------------------------------------------------------------------------------------
// The page half: real mapping, real picker, real cell.
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
// reader -> resolver -> envelope -> mapping -> picker -> cell, in one call.
function wholeChain(snaps, opts) {
  opts = opts || {};
  var sr = resolve(snaps, opts.calcDate);
  var basis = basisOf(sr, opts.mode);
  var lines = [{ sku: SKU, siteSku: 'SS-1', destinationType: 'WAREHOUSE', warehouseId: 'WH-A',
    blocked: true, blockedReason: 'RECOMMENDATION_RUNTIME_BLOCKED', horizonBasis: basis }];
  _irRecoApplyEnvelope({ success: true, data: { lines: lines }, meta: { requestId: 'r1' } },
    'ctx', { company: COMPANY, country: 'US', marketplace: 'Amazon' });
  var picked = _irCanonicalSalesBasis_(SKU);
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
  return { sr: sr, basis: basis, picked: picked, item: item, avg: avg, dos: dos };
}

// ---------------------------------------------------------------------------------------------------
section('A  the healthy path, through every date format the sheet may hold');
// ---------------------------------------------------------------------------------------------------
var A = wholeChain(baseSnaps(10));
eq(A.sr.ok, true, 'A1  the resolver accepts a sheet mixing Date objects, YYYY-MM-DD, YYYY/MM/DD and M/D/YYYY');
eq(A.sr.avgSalesPerDay, 10, 'A1a and the frozen owner returns the rate');
eq(A.avg.innerHTML, '10.0', 'A2  the CELL prints it');
eq(A.dos.textContent, '50', 'A2a with Days of Supply from the same rate');

var Ab = wholeChain(baseSnaps(10, { blanks: 353 }));
eq(Ab.sr.ok, true, 'A3  353 undated rows beside dated ones do not delete the dated ones');
eq(Ab.basis.blankDateRows, 353, 'A3a and the skipped count reaches the basis');
eq(Ab.avg.innerHTML, '10.0', 'A3b the cell is unaffected by them');

// ---------------------------------------------------------------------------------------------------
section('B  each REFUSAL, and the exact code it puts on the row');
// ---------------------------------------------------------------------------------------------------
// B1 - no scoped history at all. The commonest cause of a dash that reads as "no sales".
var B1 = wholeChain(baseSnaps(10, { extraDaily: [] }), {});
var noHistory = baseSnaps(10); noHistory.amazonDailySalesSnapshot = snap(DAILY_HEADERS, []);
var B1r = wholeChain(noHistory);
eq(B1r.sr.reason, 'SALES_BASIS_UNAVAILABLE', 'B1  no daily and no weekly rows -> SALES_BASIS_UNAVAILABLE');
eq(B1r.item.avgSalesQualityError, 'SALES_BASIS_UNAVAILABLE', 'B1a which reaches the row');
ok(B1r.avg.innerHTML.indexOf('unavailable') !== -1, 'B1b and the cell says unavailable, not "--"');

// B2 - the SKU is listed under another company only. Company isolation, and what it looks like.
var B2 = wholeChain(baseSnaps(10, { mskRows: [[SKU, OTHER_COMPANY, 'US', 'Amazon', 'MSKU-9', 'sales_driven', 'SS-9']] }));
eq(B2.sr.ok, true,
  'B2  a marketplace_skus row belonging to ANOTHER company does not supply this scope an id - and the '
  + 'daily basis still resolves, because the snapshot is one-company-per-scope by construction');
eq(B2.sr.avgSalesPerDay, 10, 'B2a so the rate is unchanged');

// B3 - two ids for one scope+sku. Named, and deliberately not resolved by picking one.
var B3 = wholeChain(baseSnaps(10, { mskRows: [
  [SKU, COMPANY, 'US', 'Amazon', 'MSKU-1', 'sales_driven', 'SS-1'],
  [SKU, COMPANY, 'US', 'Amazon', 'MSKU-2', 'sales_driven', 'SS-1']] }));
eq(B3.sr.reason, 'MARKETPLACE_SKU_AMBIGUOUS', 'B3  two marketplace_sku_id for one scope+SKU -> MARKETPLACE_SKU_AMBIGUOUS');
eq(B3.item.avgSalesQualityError, 'MARKETPLACE_SKU_AMBIGUOUS', 'B3a on the row');
eq(B3.basis.blankDateRows, 0, 'B3b and the count it had already taken is still reported');

// B4 - more than one channel in the scoped rows.
var B4 = wholeChain(baseSnaps(10, { extraDaily: [dailyRow('2026-09-10', 5, { channel: 'Amazon.ca' })] }));
eq(B4.sr.reason, 'SALES_BASIS_AMBIGUOUS', 'B4  two channels in the scoped rows -> SALES_BASIS_AMBIGUOUS');
ok(B4.avg.innerHTML.indexOf('unavailable') !== -1, 'B4a the cell refuses rather than averaging across them');

// B5 - a campaign line that cannot be tied to this site.
var B5 = wholeChain(baseSnaps(10, {
  campaigns: [['C1', 'active', '2026-09-05', '2026-09-06']],
  campaignLines: [['C1', '', SKU]] }));          // no marketplace_sku_id -> unresolved identity
eq(B5.sr.reason, 'SALES_BASIS_CONTAMINATION_UNRESOLVED',
  'B5  a campaign line with no marketplace_sku_id -> SALES_BASIS_CONTAMINATION_UNRESOLVED (fail closed)');
ok(B5.avg.innerHTML.indexOf('unavailable') !== -1, 'B5a and the cell says so');
eq(B5.item.avgDailySales, '--', 'B5b with NO number beside it - an un-excluded average is not this average');

// B6 - no calculation date. Before the filter, so no count is claimed.
var B6 = wholeChain(baseSnaps(10), { calcDate: '' });
eq(B6.sr.reason, 'CALCULATION_DATE_NOT_CONFIGURED', 'B6  no calculation date -> CALCULATION_DATE_NOT_CONFIGURED');
eq(B6.basis.blankDateRows, null, 'B6a and blankDateRows is null - it never counted, it did not count zero');

// ---------------------------------------------------------------------------------------------------
section('C  what must still WORK - the three things a "make a number appear" fix would break');
// ---------------------------------------------------------------------------------------------------
// C1 - a resolvable campaign still removes its days, and the rate changes because of it.
var C1 = wholeChain(baseSnaps(10, {
  campaigns: [['C1', 'active', '2026-09-05', '2026-09-06']],
  campaignLines: [['C1', 'MSKU-1', SKU]] }));
eq(C1.sr.ok, true, 'C1  a RESOLVABLE campaign resolves');
ok((C1.sr.excludedDates || []).length > 0, 'C1a and its selling days are excluded', C1.sr.excludedDates);
ok(C1.sr.normalDayCount < 28, 'C1b so the denominator is the actual normal-day count, not a fixed 30', C1.sr.normalDayCount);

// C2 - a confirmed zero is a rate.
var C2 = wholeChain(baseSnaps(0));
eq(C2.sr.ok, true, 'C2  thirty days of reported zero is a resolvable basis');
eq(C2.sr.avgSalesPerDay, 0, 'C2a with a rate of 0');
eq(C2.avg.innerHTML, '0.0', 'C2b and the cell prints 0.0 - never "--", never "unavailable"');

// C3 - the legitimate weekly rung, and ONLY when the ladder reaches it.
var weeklyOnly = baseSnaps(10); weeklyOnly.amazonDailySalesSnapshot = snap(DAILY_HEADERS, []);
weeklyOnly.amazonWeeklySalesSnapshot = snap(['week_end_date', 'country', 'channel', 'sku', 'sales_units_7d', 'marketplace'],
  [['2026-10-12', 'US', 'Amazon.com', SKU, 70, 'Amazon']]);
var C3 = wholeChain(weeklyOnly);
eq(C3.sr.ok, true, 'C3  a scope with ONLY weekly history still resolves - the frozen ladder has that rung');
eq(C3.sr.source, 'weekly_7d', 'C3a through the weekly rung');
eq(C3.sr.warning, 'insufficient_normal_days', 'C3b and it is MARKED, so a fallback is never read as a normal average');
eq(C3.avg.innerHTML.indexOf('10.0'), 0, 'C3c 70 / 7 = 10.0 reaches the cell');

// ---------------------------------------------------------------------------------------------------
section('D  the two "--" are different, and the page can tell them apart');
// ---------------------------------------------------------------------------------------------------
// A dash with NO basis at all is a pre-sync / not-published answer; a dash with a basis carrying a named
// error is a published refusal. The Owner's screen shows both words, so the distinction decides where to look.
var noBasisLines = [{ sku: SKU, destinationType: 'WAREHOUSE', warehouseId: 'WH-A' }];
_irRecoApplyEnvelope({ success: true, data: { lines: noBasisLines }, meta: {} }, 'ctx',
  { company: COMPANY, country: 'US', marketplace: 'Amazon' });
eq(_irCanonicalSalesBasis_(SKU), null, 'D1  a line with NO horizonBasis resolves to nothing - the "--" with no reason');
var D2 = wholeChain(baseSnaps(10, { mskRows: [
  [SKU, COMPANY, 'US', 'Amazon', 'MSKU-1', 'sales_driven', 'SS-1'],
  [SKU, COMPANY, 'US', 'Amazon', 'MSKU-2', 'sales_driven', 'SS-1']] }));
ok(D2.picked && D2.picked.basisQualityError === 'MARKETPLACE_SKU_AMBIGUOUS',
  'D2  while a published refusal carries its reason - the "unavailable" with one');

// ---------------------------------------------------------------------------------------------------
section('E  and none of the forbidden shortcuts is present');
// ---------------------------------------------------------------------------------------------------
eq(B5.item.avgDailySales, '--', 'E1  an unresolved campaign identity did NOT fall back to an un-excluded rate');
eq(B1r.item.avgDailySales, '--', 'E2  no history did NOT become 0');
eq(C2.item.avgDailySales, '0.0', 'E2a while a REPORTED zero still prints 0.0 - the two are not merged');
eq(B4.item.avgDailySales, '--', 'E3  an ambiguous channel did NOT average across channels');
ok(C3.sr.warning === 'insufficient_normal_days',
  'E4  the weekly rung is never silent - a forced weekly average would be indistinguishable from a normalized one');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
