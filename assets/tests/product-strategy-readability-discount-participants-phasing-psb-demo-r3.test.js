// PSB-DEMO-R3 — chart readability, the activity discount, who is actually in an activity, and no Phasing Out.
// Run: node assets/tests/product-strategy-readability-discount-participants-phasing-psb-demo-r3.test.js
//
// OFFLINE. The shipped selectors and layout engine, in a vm, on synthetic counter-examples AND on the
// production responses of 2026-10-22 (docs/evidence/psb-demo-r3/production-read), adapted by the shipped
// km-product-pricing-adapter. The real-browser half is _psb-demo-r3-runner.js.
//
//   C  the participants and the activity photograph — the ResTW CA CO1150 counter-example first
//   B  the discount: basis, shown price, missing / different bases, nothing borrowed
//   D  Phasing Out excluded before grouping; unknown lifecycle reported, never excluded
//   A  the layout engine sizes the type at >= 14px and gives it room; no stylesheet second opinion
//   M  mutants of the shipped sources, each caught
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.join(__dirname, '..', '..');
var BASE_REF = '70778e82';
var EV = 'docs/evidence/psb-demo-r3/production-read/';
var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d).slice(0, 500))); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n'); }
function gitRead(rel) { return cp.execFileSync('git', ['show', BASE_REF + ':' + rel], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n'); }

var SEL_REL = 'assets/js/product-strategy/psb-selectors.js';
var LAY_REL = 'assets/js/product-strategy/psb-chart-layout.js';
var UI_REL = 'assets/js/product-strategy/psb-board-ui.js';
var CSS_REL = 'assets/css/product-strategy-board.css';
var SELSRC = read(SEL_REL), LAYSRC = read(LAY_REL), UISRC = read(UI_REL), CSSSRC = read(CSS_REL);

function loadAll(selSrc) {
  var box = { console: { log: function () {} }, Math: Math, JSON: JSON, Date: Date, Object: Object, Array: Array, String: String,
    Number: Number, isFinite: isFinite, RegExp: RegExp, Error: Error, parseFloat: parseFloat, parseInt: parseInt };
  box.global = box; box.window = box; box.root = box; box.self = box;
  var ctx = vm.createContext(box);
  ['assets/js/utils/km-image-reference-policy.js', 'assets/js/utils/km-repo-asset-manifest.js',
    'assets/js/api/km-product-pricing-adapter.js', 'assets/js/product-strategy/psb-data-contract.js'].forEach(function (f) {
    vm.runInContext(read(f), ctx, { filename: f });
  });
  vm.runInContext(selSrc || SELSRC, ctx, { filename: SEL_REL });
  return { S: box.PSB_SELECTORS, A: box.KM_PRODUCT_PRICING_ADAPTER };
}
function loadLayout(src) {
  var box = { Math: Math, Number: Number, String: String, isFinite: isFinite, Infinity: Infinity };
  vm.createContext(box);
  vm.runInContext((src || LAYSRC) + '\n;this.__L = PSB_CHART_LAYOUT;', box);
  return box.__L;
}
var PROD = {
  ca: JSON.parse(read(EV + 'workspace-ResTW-CA-Amazon.json')),
  usAmz: JSON.parse(read(EV + 'workspace-ResUS-US-Amazon.json')),
  usWal: JSON.parse(read(EV + 'workspace-ResUS-US-Walmart.json'))
};
var SITE = { ca: { company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
  usAmz: { company: 'ResUS', country: 'US', marketplace: 'Amazon' },
  usWal: { company: 'ResUS', country: 'US', marketplace: 'Walmart' } };
var FALL_PRIME_CA = 'CMP-BEEB2104-9', BFCM_US = 'CMP-808C4BD5-7';

function model(L, key, filters) {
  var rows = L.A.adapt(PROD[key], {}).rows;
  return L.S.deriveBoardModel({ rows: rows, selection: SITE[key], filters: filters || {} });
}
function nodeOf(L, m, label, regC) {
  return L.S.groupNodes(m.rows).filter(function (n) { return n.label === label && n._regular_c === regC; })[0] || null;
}

/* ---- synthetic rows, in the canonical shape the selectors read ---- */
function row(o) {
  var r = { identity: o.id, marketplace_sku_id: o.id, master_sku: o.sku, site_sku: o.sku, product_name: o.name || o.sku,
    category: o.cat || 'Cat', series: o.series || 'S1', variant_group: o.group === undefined ? 'G1' : o.group,
    variant_name: o.sku, company: 'KM', country: 'US', marketplace: 'Amazon', source_status: o.status || 'active',
    marketplace_sku_status: o.status || 'active', lifecycle_status: o.lifecycle === undefined ? 'Running in the Market' : o.lifecycle,
    currency: 'USD', regular_price: o.reg || 50, minimum_price: 30, msrp: o.msrp || 60,
    resolved_regular_price: o.reg || 50, resolved_minimum_price: 30, resolved_msrp: o.msrp || 60,
    product_image: o.img || null, image_identity_status: o.img ? 'VERIFIED_DB_MAPPING' : 'IMAGE_SOURCE_MISSING',
    regional: { site_sku: o.sku }, campaigns: o.campaigns || [], missing_reasons: [], findings: [], provenance: {} };
  Object.keys(o.extra || {}).forEach(function (k) { r[k] = o.extra[k]; });
  return r;
}
function line(id, promo, snap, extra) {
  var c = { campaign_id: id, campaign_name: 'Act ' + id, status: 'active', line_status: 'active',
    start_date: '2026-11-19', end_date: '2026-11-30', promo_price: promo, regular_price_snapshot: snap,
    price_units: 'USD', unverifiable_scope_columns: null };
  Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
  return c;
}
function synthModel(L, rows) {
  return L.S.deriveBoardModel({ rows: rows, selection: { company: 'KM', country: 'US', marketplace: 'Amazon' }, filters: {} });
}

/* =========================================== THE GATES =========================================== */
/* Each returns its list of violations, so the same gate judges the shipped source and every mutant. */
function gateC(L) {
  var v = [];
  var m = model(L, 'ca', { category: 'Electric Can Opener' });
  var n = nodeOf(L, m, 'CO1150', 4799);
  if (!n) { v.push('C_NODE_MISSING'); return v; }
  var a = L.S.campaignPriceFor(n, FALL_PRIME_CA);
  var parts = (a.participants || []).map(function (p) { return p.master_sku; }).join(',');
  if (a.state !== 'PRICED_PARTIAL') v.push('C_STATE ' + a.state);
  if (parts !== 'CO1150-XR,CO1150-ZW') v.push('C_PARTICIPANTS ' + parts);
  if (!a.representative || a.representative.master_sku !== 'CO1150-XR') v.push('C_REPRESENTATIVE ' + (a.representative && a.representative.master_sku));
  if (a.representative && !/CO1150-XR\.jpg$/.test(a.representative.image || '')) v.push('C_REP_IMAGE ' + a.representative.image);
  if (a.representative && parts.split(',').indexOf(a.representative.master_sku) < 0) v.push('C_REP_NOT_A_PARTICIPANT');
  if (a.representative_state !== 'PARTICIPANT_PHOTOGRAPH') v.push('C_REP_STATE ' + a.representative_state);
  // participants with no photograph: nobody's picture, and a node outside the activity has no participant at all
  var sm = synthModel(L, [row({ id: 'a', sku: 'A1', img: 'assets/img/products/A1.jpg' }),
    row({ id: 'b', sku: 'A2', campaigns: [line('X', 40, 50)] })]);
  var sn = L.S.groupNodes(sm.rows)[0];
  var sa = L.S.campaignPriceFor(sn, 'X');
  if (!sa.participants || sa.participants.length !== 1 || sa.participants[0].master_sku !== 'A2') v.push('C_SYNTH_PARTICIPANTS');
  if (sa.representative !== null || sa.representative_state !== 'NO_PARTICIPANT_PHOTOGRAPH') v.push('C_SYNTH_BORROWED ' + sa.representative_state);
  var none = L.S.campaignPriceFor(sn, 'NOPE');
  if (none.representative_state !== 'NO_PARTICIPANT' || none.state !== 'NOT_IN_ACTIVITY') v.push('C_SYNTH_NOT_IN ' + none.representative_state);
  // the existing guards still bite
  function st(members) { return L.S.campaignPriceFor({ currency: 'USD', members: members.map(function (cs, i) { return { identity: 'I' + i, master_sku: 'K' + i, campaigns: cs }; }) }, 'X').state; }
  if (st([[line('X', 40, 50)], []]) !== 'PRICED_PARTIAL') v.push('C_GUARD_PARTIAL');
  if (st([[line('X', 40, 50)], [line('X', 39, 50)]]) !== 'DEAL_PRICE_CONFLICT') v.push('C_GUARD_CONFLICT');
  if (st([[line('X', 40, 50), line('X', 40, 50)]]) !== 'DUPLICATE_CAMPAIGN_LINE') v.push('C_GUARD_DUPLICATE');
  if (st([[line('X', 40, 50, { price_units: 'EUR' })]]) !== 'PROMOTION_CURRENCY_MISMATCH') v.push('C_GUARD_CURRENCY');
  return v;
}
function gateB(L) {
  var v = [];
  var S = L.S;
  if (typeof S.campaignDiscountFor !== 'function') return ['B_NO_DISCOUNT_FUNCTION'];
  function act(lines, reg) {
    var ms = lines.map(function (cs, i) { return row({ id: 'm' + i, sku: 'M' + i, reg: reg, campaigns: cs }); });
    var n = S.groupNodes(synthModel(L, ms).rows)[0];
    return S.campaignPriceFor(n, 'X');
  }
  var a1 = act([[line('X', 40, 50)]], 50);
  var d1 = S.campaignDiscountFor(a1);
  if (d1.state !== 'OK' || d1.pct !== 20 || d1.text !== '20% off' || d1.basis_c !== 5000) v.push('B_50_40 ' + JSON.stringify(d1));
  var d2 = S.campaignDiscountFor(a1, 3500);
  if (d2.pct !== 30 || d2.text !== '30% off' || d2.basis_c !== 5000) v.push('B_SIM_35 ' + JSON.stringify(d2));
  var d3 = S.campaignDiscountFor(a1, 5500);
  if (d3.text !== '10% above original') v.push('B_ABOVE ' + d3.text);
  // the line's own discount_percent and the MSRP are never the basis
  var a4 = act([[line('X', 40, 50, { discount_percent: 99 })]], 50);
  if (S.campaignDiscountFor(a4).pct !== 20) v.push('B_USED_LINE_DISCOUNT_PERCENT');
  var a5 = act([[line('X', 40, null)]], 50);
  var d5 = S.campaignDiscountFor(a5);
  if (d5.state !== 'BASIS_MISSING' || d5.text !== '—' || d5.pct !== null) v.push('B_MISSING ' + JSON.stringify(d5));
  var a6 = act([[line('X', 40, 0)]], 50);
  if (S.campaignDiscountFor(a6).state !== 'BASIS_MISSING') v.push('B_ZERO_BASIS');
  // two colours, one deal price, two originals: no common discount
  var a7 = act([[line('X', 40, 50)], [line('X', 40, 45)]], 50);
  var d7 = S.campaignDiscountFor(a7);
  if (a7.state !== 'PRICED' || d7.state !== 'BASIS_DIFFERS' || d7.text !== '—' || d7.per_member.length !== 2) v.push('B_DIFFERS ' + JSON.stringify(d7));
  // one participant with a snapshot and one without: not a common basis either
  var a8 = act([[line('X', 40, 50)], [line('X', 40, null)]], 50);
  if (S.campaignDiscountFor(a8).state !== 'BASIS_MISSING') v.push('B_HALF_MISSING');
  // partial: only the participants' bases count
  var a9 = act([[line('X', 40, 50)], []], 50);
  if (S.campaignDiscountFor(a9).pct !== 20) v.push('B_PARTIAL');
  // the production numbers: 38.39 on 47.99 is 20%; 35.99 is 25%; 34.99 is 27.1%
  var m = model(L, 'ca', { category: 'Electric Can Opener' });
  var ca = S.campaignPriceFor(nodeOf(L, m, 'CO1150', 4799), FALL_PRIME_CA);
  if (S.campaignDiscountFor(ca).text !== '20% off') v.push('B_PROD_20');
  if (S.campaignDiscountFor(ca, 3599).text !== '25% off') v.push('B_PROD_25');
  if (S.campaignDiscountFor(ca, 3499).text !== '27.1% off') v.push('B_PROD_27_1 ' + S.campaignDiscountFor(ca, 3499).text);
  if (S.campaignDiscountFor(ca, 3499).basis_c !== 4799) v.push('B_BASIS_MOVED');
  if (S.campaignDiscountFor({ deal_c: null, participants: [] }).state !== 'NO_DEAL_PRICE') v.push('B_NO_DEAL');
  return v;
}
function gateD(L) {
  var v = [];
  var S = L.S;
  var img = function (k) { return 'assets/img/products/' + k + '.jpg'; };
  var rows = [
    // mixed group: two selling colours, one Phasing Out — and the Phasing Out one was the photograph
    row({ id: 'p1', sku: 'MX-P', group: 'MX', lifecycle: 'Phasing Out', img: img('MX-P'), campaigns: [line('X', 40, 50)] }),
    row({ id: 'p2', sku: 'MX-A', group: 'MX', img: img('MX-A'), campaigns: [line('X', 40, 50)] }),
    row({ id: 'p3', sku: 'MX-B', group: 'MX', campaigns: [line('X', 40, 50)] }),
    // every member Phasing Out: the node must disappear
    row({ id: 'g1', sku: 'GO-1', group: 'GO', reg: 70, lifecycle: 'Phasing Out', img: img('GO-1') }),
    row({ id: 'g2', sku: 'GO-2', group: 'GO', reg: 70, status: 'phasing_out' }),
    // the only participant of activity Y is Phasing Out: Y must not be in the catalogue
    row({ id: 'y1', sku: 'ONLY-Y', group: 'OY', reg: 80, lifecycle: 'Phasing Out', campaigns: [line('Y', 60, 80)] }),
    // controls: a selling SKU with zero stock is kept (the board reads no stock); unknown lifecycles are kept and reported
    row({ id: 'z1', sku: 'ZERO-STOCK', group: 'ZS', reg: 90, extra: { current_stock: 0, inventory_qty: 0, available_qty: 0 } }),
    row({ id: 'u1', sku: 'BLANK-LC', group: 'UL', reg: 95, lifecycle: '' }),
    row({ id: 'u2', sku: 'LOWER-LC', group: 'UL2', reg: 96, lifecycle: 'phasing out' })
  ];
  var m = synthModel(L, rows);
  var ids = m.rows.map(function (r) { return r.master_sku; }).sort().join(',');
  if (ids !== 'BLANK-LC,LOWER-LC,MX-A,MX-B,ZERO-STOCK') v.push('D_ROWS ' + ids);
  var ex = m.universe.excluded.filter(function (e) { return e.reason === 'EXCLUDED_PHASING_OUT'; });
  if (ex.length !== 4) v.push('D_EXCLUDED_COUNT ' + ex.length);
  if (!ex.some(function (e) { return e.authority === 'marketplace_sku_status'; })) v.push('D_SITE_STATUS_NOT_EXCLUDED');
  if (m.universe.counts.excluded_phasing_out !== 4) v.push('D_COUNT_FIELD');
  var nodes = S.groupNodes(m.rows);
  var mx = nodes.filter(function (n) { return n.label === 'MX'; })[0];
  if (!mx || mx.variant_count !== 2 || mx.representative_image_sku !== 'MX-A' || /MX-P/.test(JSON.stringify(mx.skus))) v.push('D_MIXED ' + JSON.stringify(mx && [mx.variant_count, mx.representative_image_sku, mx.skus]));
  var ax = mx ? S.campaignPriceFor(mx, 'X') : null;
  if (!ax || ax.state !== 'PRICED' || ax.members_total !== 2) v.push('D_MIXED_ACTIVITY ' + (ax && ax.state));
  if (nodes.some(function (n) { return n.label === 'GO' || n.label === 'OY'; })) v.push('D_ALL_EXCLUDED_NODE_REMAINS');
  var cat = S.campaignCatalogue(m.rows).activities.map(function (a) { return a.campaign_id; });
  if (cat.indexOf('Y') >= 0) v.push('D_ONLY_PHASING_ACTIVITY_LISTED');
  if (cat.indexOf('X') < 0) v.push('D_ACTIVITY_X_LOST');
  var lq = m.universe.dataQuality.lifecycle_missing_or_unrecognised || [];
  if (lq.slice().sort().join(',') !== 'u1,u2') v.push('D_DQ ' + JSON.stringify(lq));
  // production: ResUS Amazon 100 -> 97 and CO2100 keeps CO2102-*; ResUS Walmart 18 -> 15 and Grinders is gone
  var ua = model(L, 'usAmz');
  if (ua.universe.counts.eligible !== 97) v.push('D_PROD_US_AMZ ' + ua.universe.counts.eligible);
  var co = nodeOf(L, model(L, 'usAmz', { category: 'Electric Can Opener' }), 'CO2100', 3499);
  if (!co || co.variant_count !== 3 || co.representative_sku !== 'CO2102-P' || co.skus.join(',') !== 'CO2102-P,CO2102-R,CO2102-T') v.push('D_PROD_CO2100 ' + JSON.stringify(co && [co.variant_count, co.representative_sku, co.skus]));
  if (co && S.campaignPriceFor(co, BFCM_US).state !== 'PRICED') v.push('D_PROD_CO2100_BFCM ' + S.campaignPriceFor(co, BFCM_US).state);
  var uw = model(L, 'usWal');
  if (uw.universe.counts.eligible !== 15) v.push('D_PROD_US_WAL ' + uw.universe.counts.eligible);
  var cats = (uw.categoryOptions.options || uw.categoryOptions || []).map ? JSON.stringify(uw.categoryOptions) : '';
  if (/Grinders/.test(cats)) v.push('D_PROD_GRINDERS_STILL_OFFERED');
  if (uw.rows.some(function (r) { return /^GM1100/.test(r.master_sku); })) v.push('D_PROD_GM1100_KEPT');
  return v;
}
function gateA(Lay, css, ui) {
  var v = [];
  Lay.DENSITY_ORDER.forEach(function (k) {
    var d = Lay.DENSITY[k];
    if (!(d.labelPx >= 14 && d.tickPx >= 14)) v.push('A_SIZE ' + k + ' ' + d.labelPx + '/' + d.tickPx);
    if (!(d.dealPx >= 13)) v.push('A_DEAL_SIZE ' + k);
    if (!(d.row2 - d.row1 >= d.subPx + 4)) v.push('A_LANE_ROWS ' + k);
    if (!(d.laneH >= d.row2 + 8)) v.push('A_LANE_H ' + k);
  });
  [[1094, 12], [1574, 12], [560, 12], [1094, 25], [740, 9]].forEach(function (c) {
    var r = Lay.deriveResponsiveChartLayout({ containerWidth: c[0], availableHeight: 640, productCount: c[1], domainLowC: 1999, domainHighC: 9999 });
    if (r.labelChars * Lay.CHAR_EM * r.labelPx > r.colW * r.labelStride - 6 + 0.01) v.push('A_LABEL_ROOM ' + c.join('x'));
    var tickChars = (Math.floor(r.axisHiC / 100)).toString().length + 3;
    if (tickChars * Lay.CHAR_EM * r.tickPx + 12 > r.padL) v.push('A_PAD_L ' + c.join('x') + ' ' + r.padL);
    if (r.labelPx < 14 || r.tickPx < 14) v.push('A_ASSEMBLED_SIZE ' + c.join('x'));
  });
  ['xlabel', 'xsub', 'ytick', 'axtitle', 'mk-activity-label', 'demo-comp-head', 'demo-readout'].forEach(function (cls) {
    var re = new RegExp('\\.psb-page \\.' + cls.replace(/-/g, '\\-') + ' \\{[^}]*font(-size)?:', 'm');
    if (re.test(css)) v.push('A_CSS_SECOND_OPINION ' + cls);
  });
  ["'class': 'ytick',\n        'font-size': lay.tickPx, style: pxStyle(lay.tickPx)", "'class': 'xlabel',\n        'font-size': lay.labelPx, style: pxStyle(lay.labelPx)",
    "'class': 'xsub',\n        'font-size': lay.subPx, style: pxStyle(lay.subPx)", "var PAD_L = lay.padL || LAYOUT.PAD_L;"].forEach(function (s) {
    if (ui.indexOf(s) < 0) v.push('A_UI_NOT_FROM_ENGINE ' + s.slice(0, 30));
  });
  return v;
}

/* =========================================== RUN =========================================== */
var L = loadAll();
var LAY = loadLayout();

section('C. who is in the activity, and whose photograph it is');
var c = gateC(L);
ok(c.length === 0, 'C  ResTW CA Fall Prime CO1150 47.99: participants XR+ZW, photograph XR; no borrowed photograph; guards intact', c);
var OLD = loadAll(gitRead(SEL_REL));
(function () {
  var m = model(OLD, 'ca', { category: 'Electric Can Opener' });
  var n = nodeOf(OLD, m, 'CO1150', 4799);
  var a = OLD.S.campaignPriceFor(n, FALL_PRIME_CA);
  var shown = n.representative_sku;
  var priced = a.member_states.filter(function (x) { return x.state === 'PRICED'; }).map(function (x) { return x.master_sku; });
  ok(shown === 'CO1150-BM' && priced.indexOf(shown) < 0 && a.participants === undefined,
    'C0 COUNTER-EXAMPLE at ' + BASE_REF + ': the activity node offered only the everyday representative CO1150-BM, which is not priced in Fall Prime', { shown: shown, priced: priced });
}());

section('B. the discount');
var b = gateB(L);
ok(b.length === 0, 'B  50->40 is 20%, 35 is 30%, missing / zero / differing bases are "—", nothing borrowed, the basis never moves', b);
ok(gateB(OLD).join() === 'B_NO_DISCOUNT_FUNCTION', 'B0 at ' + BASE_REF + ' there was no discount derivation at all');

section('D. Phasing Out');
var d = gateD(L);
ok(d.length === 0, 'D  excluded at the entry by either authority; mixed groups rebuilt; empty nodes and activities gone; unknown lifecycle reported; zero stock kept', d);
var d0 = gateD(OLD);
ok(d0.indexOf('D_PROD_US_AMZ 100') >= 0 && d0.indexOf('D_PROD_US_WAL 18') >= 0, 'D0 at ' + BASE_REF + ' production Phasing Out SKUs were on the board (ResUS Amazon 100, Walmart 18)', d0.slice(0, 6));

section('A. the layout engine and the stylesheet');
var a = gateA(LAY, CSSSRC, UISRC);
ok(a.length === 0, 'A  every profile prints >= 14px, the lane and margin fit the type, and the stylesheet no longer overrides the size', a);
var a0 = gateA(loadLayout(gitRead(LAY_REL)), gitRead(CSS_REL), gitRead(UI_REL));
ok(a0.some(function (x) { return /^A_SIZE/.test(x); }) && a0.some(function (x) { return /^A_CSS_SECOND_OPINION xlabel/.test(x); }),
  'A0 at ' + BASE_REF + ' the type was 10.5-12.5px and the stylesheet overrode the engine', a0.slice(0, 6));

section('M. mutants');
var MUT = [
  ['M1 participants include unpriced colours', SEL_REL, "out.participants = out.member_states.filter(function (x) { return x.state === 'PRICED'; });", "out.participants = out.member_states.filter(function (x) { return x.state !== 'NOT_IN_ACTIVITY' || true; });", 'C'],
  ['M2 the activity photograph is the first member, priced or not', SEL_REL, "if (out.participants[pi].image) { out.representative = out.participants[pi]; break; }", "if (out.member_states[pi] && out.member_states[pi].image) { out.representative = out.member_states[pi]; break; }", 'C'],
  ['M3 a participant without a photograph borrows a colleague’s', SEL_REL, "image: m._image || null, line_count: lines.length };", "image: m._image || (members.filter(function (q) { return q._image; })[0] || {})._image || null, line_count: lines.length };", 'C'],
  ['M4 the basis is the MSRP', SEL_REL, "var snap = S.cents(c.regular_price_snapshot);", "var snap = S.cents(m.msrp);", 'B'],
  ['M5 differing bases take the first one', SEL_REL, "if (Object.keys(bases).length > 1) { out.state = 'BASIS_DIFFERS'; return out; }", "", 'B'],
  ['M6 a missing basis counts as zero', SEL_REL, "ms.snapshot_c = (snap !== null && snap > 0) ? snap : null;", "ms.snapshot_c = snap === null ? 1 : snap;", 'B'],
  ['M7 the percentage ignores the shown (simulated) price', SEL_REL, "var shown = (shownC === null || shownC === undefined) ? act.deal_c : shownC;", "var shown = act.deal_c;", 'B'],
  ['M8 the Phasing Out gate is removed', SEL_REL, "      var po = S.phasingOutBy(row);\n      if (po) {", "      var po = null;\n      if (po) {", 'D'],
  ['M9 a site status of phasing_out is let through', SEL_REL, "if (str(row && row[S.STATUS_FIELD]).toLowerCase() === S.PHASING_OUT_SITE_STATUS) return 'marketplace_sku_status';", "", 'D'],
  ['M10 the lifecycle is case-folded before it is matched', SEL_REL, "var v = str(row && row.lifecycle_status);", "var v = str(row && row.lifecycle_status).replace(/^phasing out$/i, 'Phasing Out');", 'D'],
  ['M11 a blank lifecycle is treated as Phasing Out', SEL_REL, "if (v === '') return 'LIFECYCLE_MISSING';", "if (v === '') return 'PHASING_OUT';", 'D'],
  ['M12 the engine prints the axis at 11.5px again', LAY_REL, "labelPx: 16, subPx: 13.5, tickPx: 15,", "labelPx: 16, subPx: 13.5, tickPx: 11.5,", 'A'],
  ['M13 the label budget forgets the larger type', LAY_REL, "var chars = Math.max(3, Math.floor((colW * stride - 6) / (L.CHAR_EM * d.labelPx)));", "var chars = Math.max(3, Math.floor((colW * stride - 6) / L.CHAR_W_AT_11_5));", 'A'],
  ['M14 the stylesheet declares the label size again', CSS_REL, ".psb-page .xlabel { font-family: var(--sans); font-weight: 600; fill: var(--ink-1); }", ".psb-page .xlabel { font-family: var(--sans); font-weight: 600; font-size: 12.5px; fill: var(--ink-1); }", 'A'],
  ['M15 the chart draws from the module margin, not the engine’s', UI_REL, "var PAD_L = lay.padL || LAYOUT.PAD_L;", "var PAD_L = LAYOUT.PAD_L;", 'A']
];
var caught = 0;
MUT.forEach(function (mt) {
  var src = { sel: SELSRC, lay: LAYSRC, ui: UISRC, css: CSSSRC };
  var k = mt[1] === SEL_REL ? 'sel' : mt[1] === LAY_REL ? 'lay' : mt[1] === UI_REL ? 'ui' : 'css';
  if (src[k].split(mt[2]).length !== 2) { ok(false, mt[0] + ' -> anchor not unique / not found'); return; }
  src[k] = src[k].replace(mt[2], mt[3]);
  var r;
  try {
    if (mt[4] === 'A') r = gateA(loadLayout(src.lay), src.css, src.ui);
    else { var LL = loadAll(src.sel); r = mt[4] === 'C' ? gateC(LL) : mt[4] === 'B' ? gateB(LL) : gateD(LL); }
  } catch (e) { r = ['THREW ' + e.message]; }
  if (r.length) caught++;
  ok(r.length > 0, mt[0] + ' -> caught', r.slice(0, 3));
});

console.log('\nPSB-DEMO-R3 — passed ' + passed + '  failed ' + failed + '  |  mutants caught ' + caught + ' of ' + MUT.length);
process.exitCode = failed ? 1 : 0;
