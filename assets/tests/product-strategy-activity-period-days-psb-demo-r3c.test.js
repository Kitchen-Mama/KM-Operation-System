// PSB-DEMO-R3 CLOSE-OUT — the R55 findings F-1 (raw date strings) and F-2 (the right-edge clip).
// Run: node assets/tests/product-strategy-activity-period-days-psb-demo-r3c.test.js
//
// OFFLINE. The shipped selectors in a vm, on the production responses of 2026-10-22
// (docs/evidence/psb-demo-r3/production-read), adapted by the shipped km-product-pricing-adapter.
// The real-browser half is _psb-demo-r3c-runner.js; its saved evidence is read in section E.
//
//   X  counter-examples at BASE_REF: the period printed raw, and the menu out of date order
//   F  F-1: the period is read as the calendar day the record holds — literally, never through UTC
//   O  the activity menu is in start-day order
//   U  every place the board prints a period uses the one reader
//   E  the browser evidence: before fails exactly F-1, after passes everything, F-2 included
//   M  mutants of the shipped sources, each caught
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var BASE_REF = '2af8d156';
var EV = 'docs/evidence/psb-demo-r3/production-read/';
var R3C = 'docs/evidence/psb-demo-r3/close-out/';
var passed = 0, failed = 0, quiet = false, quietFails = 0;
function ok(c, m, d) {
  if (quiet) { if (!c) quietFails++; return; }
  if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d).slice(0, 500))); }
}
function section(t) { if (!quiet) console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function gitRead(rel) { return cp.execFileSync('git', ['show', BASE_REF + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n'); }

var SEL_REL = 'assets/js/product-strategy/psb-selectors.js';
var UI_REL = 'assets/js/product-strategy/psb-board-ui.js';
var SELSRC = read(SEL_REL), UISRC = read(UI_REL);

function loadAll(selSrc) {
  var box = { console: { log: function () {} }, Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array, String: String,
    Number: Number, isFinite: isFinite, RegExp: RegExp, Error: Error, parseFloat: parseFloat, parseInt: parseInt };
  box.global = box; box.window = box; box.root = box; box.self = box;
  var ctx = vm.createContext(box);
  ['assets/js/utils/km-image-reference-policy.js', 'assets/js/utils/km-repo-asset-manifest.js',
    'assets/js/api/km-product-pricing-adapter.js', 'assets/js/product-strategy/psb-data-contract.js'].forEach(function (f) {
    vm.runInContext(read(f), ctx, { filename: f });
  });
  vm.runInContext(selSrc, ctx, { filename: SEL_REL });
  return { S: box.PSB_SELECTORS, A: box.KM_PRODUCT_PRICING_ADAPTER };
}
var PROD = {
  ca: JSON.parse(read(EV + 'workspace-ResTW-CA-Amazon.json')),
  usAmz: JSON.parse(read(EV + 'workspace-ResUS-US-Amazon.json'))
};
function catalogue(L, key) { return L.S.campaignCatalogue(L.A.adapt(PROD[key], {}).rows).activities; }
var RAW_FP = 'Tue Oct 06 2026 00:00:00 GMT+0800 (台北標準時間)';

// =================================================================================================
section('X  counter-examples at ' + BASE_REF + ' (the R3 head, before this close-out)');
var B = loadAll(gitRead(SEL_REL));
var bCat = catalogue(B, 'ca');
ok(typeof B.S.campaignDayOf === 'undefined' && typeof B.S.campaignPeriodText === 'undefined',
  'X1  there was no period reader: the selectors carried the period as the raw text');
ok(bCat.length === 2 && bCat[0].campaign_name === 'BFCM 2026' && bCat[1].campaign_name === 'Fall Prime 2026',
  'X2  production CA: BFCM (November) was listed BEFORE Fall Prime (October) — "Thu …" sorts before "Tue …"', bCat.map(function (a) { return a.campaign_name; }));
var bUi = gitRead(UI_REL);
ok(/\(a\.start_date \|\| '\?'\) \+ ' to '/.test(bUi), 'X3  the UI printed a.start_date as it arrived ("Thu Nov 19 2026 00:00:00 GMT+0800 …")');

function checks(selSrc, uiSrc) {
  var L = loadAll(selSrc);
  var S = L.S;
  // ===============================================================================================
  section('F  F-1: the calendar day the record holds');
  var DS = S.CAMPAIGN_DAY_STATE || {};
  var d = S.campaignDayOf(RAW_FP);
  ok(d.day === '2026-10-06' && d.state === DS.DATE_STRING_DAY, 'F1  production "Tue Oct 06 2026 00:00:00 GMT+0800 (台北標準時間)" -> 2026-10-06', d);
  ok(S.campaignDayOf('Thu Nov 19 2026 00:00:00 GMT+0800 (台北標準時間)').day === '2026-11-19', 'F2  BFCM start -> 2026-11-19');
  ok(S.campaignDayOf('Mon Nov 30 2026 00:00:00 GMT+0800 (台北標準時間)').day === '2026-11-30', 'F3  BFCM end -> 2026-11-30 (inclusive end day unchanged)');
  // The Taipei midnight is the instant 2026-10-05T16:00Z. A reader that went through UTC prints the 5th.
  ok(S.campaignDayOf('Tue Oct 06 2026 00:00:00 GMT+0800').day === '2026-10-06', 'F4  never the UTC day (2026-10-05), which is R55 F-3\'s defect on IR');
  ok(S.campaignDayOf('Wed Oct 07 2026 23:30:00 GMT-0700 (PDT)').day === '2026-10-07', 'F5  any offset: the day written, not the day elsewhere');
  ok(S.campaignDayOf('2026-11-19').day === '2026-11-19' && S.campaignDayOf('2026-11-19').state === DS.ISO_DAY, 'F6  an ISO day is that day');
  ok(S.campaignDayOf('').state === DS.MISSING && S.campaignDayOf(null).day === null, 'F7  blank is MISSING, not a day');
  ok(S.campaignDayOf('2026-02-30').state === DS.NOT_RECOGNISED, 'F8  an impossible ISO day is not recognised');
  ok(S.campaignDayOf('Mon Feb 30 2026 00:00:00 GMT+0800').state === DS.NOT_RECOGNISED, 'F9  nor an impossible day in the long form');
  ok(S.campaignDayOf('2026-11-19T16:00:00.000Z').state === DS.NOT_RECOGNISED, 'F10 a UTC instant is NOT cut to its UTC day; it is reported');
  ok(S.campaignDayOf('11/19/2026').state === DS.NOT_RECOGNISED, 'F11 a locale date is not guessed');
  var a = { campaign_name: 'X', start_date: RAW_FP, end_date: 'Wed Oct 07 2026 00:00:00 GMT+0800 (台北標準時間)' };
  ok(S.campaignPeriodText(a) === '2026-10-06 to 2026-10-07', 'F12 the period reads "2026-10-06 to 2026-10-07"', S.campaignPeriodText(a));
  ok(S.campaignPeriodText({ start_date: '', end_date: '2026-10-07' }) === 'start not recorded to 2026-10-07', 'F13 a missing end of the period is named, not invented');
  ok(S.campaignPeriodText({ start_date: '11/19/2026', end_date: '2026-11-30' }) === 'unreadable date "11/19/2026" to 2026-11-30', 'F14 an unreadable one is shown as recorded and named');
  ok(a.start_date === RAW_FP, 'F15 display only: the activity still carries the value it was given');

  // ===============================================================================================
  section('O  the activity menu in start-day order');
  var cat = catalogue(L, 'ca');
  ok(cat.length === 2 && cat[0].campaign_name === 'Fall Prime 2026' && cat[1].campaign_name === 'BFCM 2026',
    'O1  production CA: Fall Prime (2026-10-06) before BFCM (2026-11-19)', cat.map(function (x) { return x.campaign_name; }));
  ok(cat[0].start_date === RAW_FP, 'O2  ... and the catalogue still carries the recorded value, unconverted');
  var us = catalogue(L, 'usAmz');
  ok(us.length === 2 && S.campaignDayOf(us[0].start_date).day <= S.campaignDayOf(us[1].start_date).day, 'O3  production US Amazon: in start-day order too', us.map(function (x) { return x.campaign_name; }));
  var adapterDay = L.A.isoDay(RAW_FP);
  ok(adapterDay === null, 'O4  the adapter\'s isoDay contract is unchanged: it still reports this value as not an ISO day (period validity is not decided here)', adapterDay);

  // ===============================================================================================
  section('U  one reader for every printed period');
  ok((uiSrc.match(/SEL\.campaignPeriodText\(a\)/g) || []).length === 2, 'U1  the activity menu label and the tooltip both print SEL.campaignPeriodText(a)');
  ok(!/a\.start_date \|\| '\?'|a\.end_date \|\| '\?'/.test(uiSrc), 'U2  no place prints a.start_date / a.end_date raw');
  ok(!/new Date\(|toISOString|getUTC/.test(selSrc.slice(selSrc.indexOf('S.CAMPAIGN_DAY_STATE'), selSrc.indexOf('S.campaignPeriodText'))),
    'U3  the reader makes no Date, no ISO instant and no UTC call');
}
checks(SELSRC, UISRC);

// =================================================================================================
section('E  the browser evidence (_psb-demo-r3c-runner.js on production responses)');
var after = JSON.parse(read(R3C + 'after/r3c.json')), before = JSON.parse(read(R3C + 'before/r3c.json'));
ok(after.mode === 'after' && after.summary.failed === 0 && after.summary.checks >= 110, 'E1  after: every check passed', after.summary);
var bFails = before.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
ok(before.base_ref === BASE_REF && bFails.length > 0 && bFails.every(function (n) { return /^F-1 /.test(n); }),
  'E2  before (' + BASE_REF + '): only F-1 checks fail — F-2 was already repaired by R3, and stays repaired', bFails);
var f2 = after.checks.filter(function (c) { return /^F-2 /.test(c.name); });
ok(f2.length >= 80 && f2.every(function (c) { return c.ok; }), 'E3  after: ' + f2.length + ' F-2 checks at 1920 / 1440 / 820, with the discount line and a competitor, all pass');
ok(after.checks.some(function (c) { return /CO5600 at 55\.99/.test(c.name) && c.ok; }), 'E4  ... including the R55 P3 label itself: CO5600 at 55.99 prints 44.79 in full');
ok(after.checks.some(function (c) { return /competitor header reads in full/.test(c.name) && c.ok; }), 'E5  ... and the competitor header R55 P6 saw cut');
var rel = ['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
  'assets/js/product-strategy/psb-chart-layout.js', 'assets/css/product-strategy-board.css'];
var crypto = require('crypto');
function sha(f) { return crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 16); }
var stale = rel.filter(function (f) { return after.sources[f] !== sha(f); });
ok(stale.length === 0, 'E6  the after-evidence was taken on exactly these sources', stale);

// =================================================================================================
section('M  mutants — each re-opens one defect and must be caught');
var MUT = [
  ['M1  the day read through UTC', SEL_REL,
   "      return { day: m[3] + '-' + pad2_(MONTH_OF_[m[1]]) + '-' + m[2], state: S.CAMPAIGN_DAY_STATE.DATE_STRING_DAY, raw: s };",
   "      return { day: new Date(s).toISOString().slice(0, 10), state: S.CAMPAIGN_DAY_STATE.DATE_STRING_DAY, raw: s };"],
  ['M2  the menu sorted by the raw text again', SEL_REL,
   "      var sa = S.campaignDayOf(a.start_date).day || '9999', sb = S.campaignDayOf(b.start_date).day || '9999';",
   "      var sa = a.start_date || '9999', sb = b.start_date || '9999';"],
  ['M3  an unreadable value guessed as a day', SEL_REL,
   "    return { day: null, state: S.CAMPAIGN_DAY_STATE.NOT_RECOGNISED, raw: s };",
   "    return { day: s.slice(0, 10), state: S.CAMPAIGN_DAY_STATE.NOT_RECOGNISED, raw: s };"],
  ['M4  the tooltip prints the raw value again', UI_REL,
   "(a.campaign_name || a.campaign_id) + '  ' + SEL.campaignPeriodText(a)",
   "(a.campaign_name || a.campaign_id) + '  ' + (a.start_date || '?') + ' to ' + (a.end_date || '?')"]
];
MUT.forEach(function (mu) {
  var src = mu[1] === SEL_REL ? SELSRC : UISRC;
  var n = src.split(mu[2]).length - 1;
  if (n !== 1) { failed++; console.log('FAIL ' + mu[0] + ' - anchor found ' + n + 'x (vacuous mutant)'); return; }
  var m = src.replace(mu[2], mu[3]);
  quiet = true; quietFails = 0;
  try { checks(mu[1] === SEL_REL ? m : SELSRC, mu[1] === UI_REL ? m : UISRC); } catch (e) { quietFails++; }
  quiet = false;
  ok(quietFails > 0, mu[0] + ' -> caught (' + quietFails + ' assertion(s) failed)');
});

console.log('\n' + (failed ? 'FAIL' : 'PASS') + '  ' + passed + ' passed, ' + failed + ' failed, ' + MUT.length + ' mutants');
process.exitCode = failed ? 1 : 0;
