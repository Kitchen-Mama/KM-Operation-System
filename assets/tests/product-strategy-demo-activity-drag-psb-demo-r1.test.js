// Kitchen Mama Operation System — PSB-DEMO-R1
// THE ACTIVITY PRICE VIEW, THE TEMPORARY COMPETITORS AND THE PRICE-POINT DRAG.
//
// Run: node assets/tests/product-strategy-demo-activity-drag-psb-demo-r1.test.js
//
// LOCAL / OFFLINE. Three parts:
//   A  the selector rules, executed on the shipped psb-selectors.js (catalogue, price states, read time)
//   B  the renderer's promises read from the shipped source (memory only, no write, no canonical edit)
//   C  the real-browser demo (docs/evidence/psb-demo-r1/demo.json, taken by _psb-demo-runner.js) —
//      pinned to the sources it was taken against, so a later edit forces a re-take, not a re-pin
//   M  mutants: each rule that matters is shown to be load-bearing
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d).slice(0, 600))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }

var SELSRC = read('assets/js/product-strategy/psb-selectors.js');
var UISRC = read('assets/js/product-strategy/psb-board-ui.js');
function loadSel(src) {
  var box = { console: console, Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array, String: String, Number: Number, isFinite: isFinite };
  box.global = box; box.window = box;
  var ctx = vm.createContext(box);
  vm.runInContext(read('assets/js/product-strategy/psb-data-contract.js'), ctx);
  vm.runInContext(src || SELSRC, ctx);
  return box.PSB_SELECTORS;
}
var S = loadSel();

function line(id, extra) {
  var o = { campaign_id: id, campaign_name: 'Act ' + id, status: 'active', line_status: 'active',
    start_date: '2026-10-07', end_date: '2026-10-08', promo_price: 31.99, price_units: 'USD',
    unverifiable_scope_columns: null };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return o;
}
function node(members, cur) {
  return { currency: cur || 'USD', members: members.map(function (m, i) {
    return { identity: 'MSKU:' + i, master_sku: 'KM' + i, campaigns: m }; }) };
}

function partA(SS) {
  SS = SS || S;
  var r = {};
  r.priced = SS.campaignPriceFor(node([[line('A')]]), 'A');
  r.notIn = SS.campaignPriceFor(node([[line('B')]]), 'A');
  r.missing = SS.campaignPriceFor(node([[line('A', { promo_price: null })]]), 'A');
  r.unresolved = SS.campaignPriceFor(node([[line('A', { price_units: '' })]]), 'A');
  r.mismatch = SS.campaignPriceFor(node([[line('A', { price_units: 'EUR' })]]), 'A');
  r.scope = SS.campaignPriceFor(node([[line('A', { unverifiable_scope_columns: ['company'] })]]), 'A');
  r.lineDead = SS.campaignPriceFor(node([[line('A', { line_status: 'cancelled' })]]), 'A');
  r.dup = SS.campaignPriceFor(node([[line('A', { promo_price: 31.99 }), line('A', { promo_price: 29.99 })]]), 'A');
  r.conflict = SS.campaignPriceFor(node([[line('A', { promo_price: 31.99 })], [line('A', { promo_price: 27.99 })]]), 'A');
  r.partial = SS.campaignPriceFor(node([[line('A', { promo_price: 31.99 })], []]), 'A');
  r.same = SS.campaignPriceFor(node([[line('A', { promo_price: 31.99 })], [line('A', { promo_price: 31.99 })]]), 'A');
  r.zeroForecast = SS.campaignPriceFor(node([[line('A', { promo_price: null, discount_percent: 20, regular_price_snapshot: 39.99, fc_qty: 500 })]]), 'A');
  return r;
}

section('A. the selector rules, on the shipped selectors');
var A = partA();
eq([A.priced.state, A.priced.deal_c], ['PRICED', 3199], 'A1  one line, one price in the panel currency: PRICED at the recorded promo_price');
eq(A.notIn.state, 'NOT_IN_ACTIVITY', 'A2  a product with no line in this activity is NOT_IN_ACTIVITY');
eq([A.missing.state, A.missing.deal_c], ['DEAL_PRICE_MISSING', null], 'A3  no promo_price: DEAL_PRICE_MISSING, and no price');
eq([A.zeroForecast.state, A.zeroForecast.deal_c], ['DEAL_PRICE_MISSING', null],
  'A3b and a discount %, a regular-price snapshot or a forecast quantity never stand in for the missing deal price');
eq(A.unresolved.state, 'PROMOTION_CURRENCY_UNRESOLVED', 'A4  blank price_units: PROMOTION_CURRENCY_UNRESOLVED (campaign contract code)');
eq(A.mismatch.state, 'PROMOTION_CURRENCY_MISMATCH', 'A5  price_units of another currency: never placed on this axis');
eq(A.scope.state, 'CAMPAIGN_SCOPE_INCOMPLETE', 'A6  a line whose scope 72_ could not verify: CAMPAIGN_SCOPE_INCOMPLETE');
eq(A.lineDead.state, 'LINE_NOT_ACTIVE', 'A7  a cancelled line is not a deal price');
eq([A.dup.state, A.dup.deal_c], ['DUPLICATE_CAMPAIGN_LINE', null], 'A8  two lines for one SKU in one activity: a duplicate, and NOT the lower price');
eq([A.conflict.state, A.conflict.deal_c], ['DEAL_PRICE_CONFLICT', null], 'A9  two variants at two deal prices: a conflict, and NOT the lower price');
eq([A.partial.state, A.partial.deal_c, A.partial.members_priced, A.partial.members_total], ['PRICED_PARTIAL', 3199, 1, 2],
  'A10 one variant priced, one not in the activity: the price is shown and the coverage is stated');
eq([A.same.state, A.same.deal_c], ['PRICED', 3199], 'A11 two variants at the SAME price agree: PRICED');
var cat = S.campaignCatalogue([
  { marketplace_sku_id: 'X1', campaigns: [line('B', { campaign_name: 'Black Friday', start_date: '2026-11-27', end_date: '2026-12-01', status: 'scheduled' }), line('A')] },
  { marketplace_sku_id: 'X2', campaigns: [line('A'), { campaign_id: '', promo_price: 1 }] }]);
eq(cat.activities.map(function (a) { return a.campaign_id + ':' + a.sku_count + ':' + a.start_date + ':' + a.status; }),
  ['A:2:2026-10-07:active', 'B:1:2026-11-27:scheduled'], 'A12 one activity per campaign_id, ordered by start, with recorded period and status');
eq(cat.unidentified_lines, 1, 'A13 a line with no campaign_id is counted and never listed');
ok(!/live/i.test(JSON.stringify(cat)) && !/today|now\(|new Date\(\)/.test(S.campaignCatalogue.toString() + S.campaignPriceFor.toString()),
  'A14 the catalogue and the price states carry no "live" verdict and read no clock');
var rt = S.readTimeOf({ schema: { read_at: Date.UTC(2026, 9, 21, 8, 41, 0), read_at_is: 'the server clock when this read ran' } });
eq([rt.known, rt.text], [true, '2026-10-21 16:41'], 'A15 72_ read_at (epoch ms) is shown in Taipei time');
eq(S.readTimeOf({ schema: { read_at: '2026-09-12T00:00:00.000Z' } }).text, '2026-09-12 08:00', 'A16 and an ISO read_at the same way');
eq([S.readTimeOf({ schema: { read_at: null } }).known, S.readTimeOf(null).known, S.readTimeOf({ schema: { read_at: 'yesterday' } }).known],
  [false, false, false], 'A17 no read time, no provenance, or a value that is not a time: NOT KNOWN, never a guess');
var ing = S.ingest({ campaigns: [line('A')], provenance: {} }, null, null);
ok(Array.isArray(ing.campaigns) && ing.campaigns.length === 1, 'A18 ingest carries the campaign lines the contract field list used to drop');

section('B. the renderer, read from the shipped source');
function demoRegion(src) {
  var a = src.indexOf('6A  PSB-DEMO-R1');
  var b = src.indexOf('function renderChart(panel, thrC, findings)');
  return src.slice(a, b);
}
var DEMO = demoRegion(UISRC);
ok(DEMO.length > 5000, 'B0  the demo region is found in psb-board-ui.js');
ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|location\.(hash|search|href)\s*=/.test(DEMO),
  'B1  the demo keeps nothing in browser storage, a cookie or the URL');
ok(!/KM\.(DB|api)|fetch\(|XMLHttpRequest|sendBeacon|transport/.test(DEMO), 'B2  the demo makes no request of any kind');
ok(!/CANON\.rows\[|\._regular_c\s*=|\._deal_c\s*=|\.promo_price\s*=|\.campaigns\s*=/.test(DEMO),
  'B3  the demo never assigns to a canonical row, a node price or a campaign line');
ok(/demoSiteKey\(\) \+ '\|' \+ demoPriceCtx\(\)/.test(DEMO) && /demoSiteKey\(\) \+ '\|' \+ \(category \|\| ''\) \+ '\|' \+ demoPriceCtx\(\)/.test(DEMO),
  'B4  simulations are keyed by site + price context, competitors by site + category + price context');
ok(/demoClearAll\(\);\s+\/\/ PSB-DEMO-R1/.test(UISRC), 'B5  a site change (clearScenarioState) drops the demo state');
var chart = UISRC.slice(UISRC.indexOf('function renderChart(panel, thrC, findings)'), UISRC.indexOf('function ariaFor('));
ok(/demoAttachDrag\(s, mk, n, geo\)/.test(chart) && /demoAttachDrag\(s, ag, n, geo\)/.test(chart),
  'B6  the drag handle is the single price point: the everyday marker, or the activity deal marker');
ok(!/demoAttachDrag\([^)]*(cap|band)/.test(chart), 'B7  no floor cap, list cap or band is ever a drag handle');
ok(/while \(next < minC\) next \+= step;/.test(DEMO) && /while \(next > maxC\) next -= step;/.test(DEMO),
  'B8  a drag is clamped to the axis already drawn, so the scale cannot move under it');
ok(/sm\.to_c < lay\.axisLoC/.test(chart) && /sm\.to_c > lay\.axisHiC/.test(chart),
  'B9  a simulation widens the axis only when it falls outside the one the recorded prices produce');
var modelSrc = SELSRC.slice(SELSRC.indexOf('S.deriveBoardModel = function'));
ok(!/competitor|DEMO/i.test(modelSrc), 'B10 competitors and simulations never reach the board model, its findings or its counts');
ok(!/prepared ' \+ PREVIEW_TODAY/.test(UISRC) && /SEL\.readTimeOf\(LOAD && LOAD\.provenance\)/.test(UISRC),
  'B11 the header no longer prints the constant "prepared" date; it prints the source’s read time');

section('C. the real-browser demo (docs/evidence/psb-demo-r1/demo.json)');
var EV = JSON.parse(read('docs/evidence/psb-demo-r1/demo.json'));
['assets/js/product-strategy/psb-board-ui.js', 'assets/js/product-strategy/psb-selectors.js',
  'assets/css/product-strategy-board.css', 'assets/tests/_psb-demo-capture.js', 'assets/tests/_psb-demo-runner.js']
  .forEach(function (f) { eq(EV.sources[f], sha(f), 'C0  ' + f + ' is unchanged since the capture'); });
ok(EV.complete === true && EV.failed === 0 && EV.passed >= 45, 'C1  the whole sequence ran in Chrome and every check held (' + EV.passed + ')', { failed: EV.failed, error: EV.error });
function has(name) { return EV.checks.some(function (c) { return c.ok && c.name.indexOf(name) === 0; }); }
['the axis did not move at any point during the drag',
  'every other activity price point stayed where it was',
  'floor and list caps did not move',
  'the canonical rows are byte-identical after everything',
  'zero write requests on the wire for the whole demo',
  'no fetch, XHR or beacon left the page',
  'nothing was written to browser storage or the URL',
  'after a reload: no simulation, no competitor, everyday view, recorded prices',
  'a site change drops every simulation and competitor',
  'another activity shows none of the first activity',
  'zoomed and scrolled, two gridlines of pointer travel is two gridlines of price',
  'narrow (820px): controls, chart and legend do not overlap',
  'desktop: controls, chart and legend do not overlap',
  'missing, currency and duplicate lines are named, never priced',
  'no activity is called live'].forEach(function (n) { ok(has(n), 'C2  browser: ' + n); });

section('M. mutants');
function mutate(src, find, repl) {
  if (src.indexOf(find) === -1) return null;
  return src.split(find).join(repl);
}
var mutants = [
  ['M1 conflict resolved by taking the lowest price', "if (distinct.length > 1) { out.state = 'DEAL_PRICE_CONFLICT'; return out; }",
    "if (distinct.length > 1) { distinct.sort(function(a,b){return a-b;}); distinct = [distinct[0]]; }",
    function (r) { return r.conflict.state !== 'DEAL_PRICE_CONFLICT'; }],
  ['M2 currency mismatch ignored', "else if (cur !== '' && units !== cur) ms.state = 'PROMOTION_CURRENCY_MISMATCH';", '',
    function (r) { return r.mismatch.state !== 'PROMOTION_CURRENCY_MISMATCH'; }],
  ['M3 a blank currency assumed to be the panel’s', "else if (units === '') ms.state = 'PROMOTION_CURRENCY_UNRESOLVED';", '',
    function (r) { return r.unresolved.state !== 'PROMOTION_CURRENCY_UNRESOLVED'; }],
  ['M4 duplicates treated as one line', 'if (lines.length > 1) {', 'if (false) {',
    function (r) { return r.dup.state !== 'DUPLICATE_CAMPAIGN_LINE'; }],
  ['M5 unverifiable scope trusted', "if (unver && unver.length) ms.state = 'CAMPAIGN_SCOPE_INCOMPLETE';\n        else ", '',
    function (r) { return r.scope.state !== 'CAMPAIGN_SCOPE_INCOMPLETE'; }]
];
mutants.forEach(function (m) {
  var src = mutate(SELSRC, m[1], m[2]);
  if (!src) { ok(false, m[0] + ' - mutation target absent'); return; }
  var r = partA(loadSel(src));
  ok(m[3](r), m[0] + ': CAUGHT');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed ? 1 : 0;
