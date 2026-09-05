// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R4 — LAST-MILE COMPLETION · VISIBLE ADVICE RECONCILIATION · SAVE-TARGET IDENTITY
// ----------------------------------------------------------------------------------------------------------------
// R6-R3's live retest left three gaps, and each of them turns out to be the same shape: TWO OWNERS FOR ONE
// QUESTION, where only one of them was ever asked.
//
//   1. "Choose a last mile", with nothing to choose with. The picker's ambiguity came from the METHOD OPTION;
//      the arrival's came from `serviceProfilesForRoute` read straight off carrier_lead_times. The registry
//      builds options from EITHER table — rate cards when the lane is priced, lead times when it is not — and
//      only the lead-time branch ever carried a last mile. So on a PRICED lane the option knew nothing, the row
//      rendered a hidden field, and the calculator (which never reads options) still saw two profiles and
//      correctly refused to pick one. Measured below on both branches, before and after.
//
//   2. 920 / 520 / 400 was nowhere on screen. The strip is complete, styled, hosted, and repainted on every
//      quantity change — and its first line is `if (recommended === null) return ''`, reading a map that only
//      handleReplenAiPlan fills. On an ordinary load it is `{}`. The page's DECLARED authority for that number
//      is `_irSuggestedQtyState_` (F1-7N-FB-4G-A0 §I), and that is what it asks now.
//
//   3. Four included header ids, two visible rows. Station-level inclusion and SKU-level contribution are
//      different sets, and the diagnostic reported only the first. It now reports both, and freezes what a save
//      would touch by REPLAYING the write path's own resolver rather than a copy of its rule.
//
// Everything here RUNS the shipped owners. The grid claims are resolved with a real implementation of the CSS
// Grid track algorithm. Nothing in this file writes, submits, or mutates.
//
// Run: node assets/tests/last-mile-completion-advice-reconciliation-and-save-identity-f1-7n-fc-1b-e3-r4-a2-r1-r6-r4.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
// The revision this round was written against, NAMED rather than tracked. `HEAD` moves; the defect does not.
var BEFORE_REV = '530f93a';
function atRev(rev, rel) {
  return cp.execSync('git show ' + rev + ':"' + rel + '"', { cwd: ROOT, encoding: 'buffer', maxBuffer: 1 << 28 }).toString('utf8');
}
function atHead(rel) { return atRev(BEFORE_REV, rel); }
// Comments are prose and prose is not behaviour.
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var s = m.index, i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return src.slice(s, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function mutateFn(src, name, find, repl) {
  var body = extractFn(src, name);
  if (body.indexOf(find) === -1) throw new Error('mutation anchor not found in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, repl));
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var PAGEC = code(PAGE);
var CSS = read('assets/css/pages/inventory-replenishment.css');
var INDEX = read('index.html');
var CENSUS = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var CENSUSC = code(CENSUS);
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var G16 = read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs');
var G69 = read('assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs');
var RO = require('./_release-order.js');
var CMP = require('../js/utils/inventory-compat.js');

// ================================================================================================================
section('§0 — invariants this round must not move');
// ================================================================================================================
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(code(CFG)),
  'A1  the AI Plan DB generation flag is still declared false');
var allowlist = /var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[([\s\S]*?)\];/.exec(code(CFG))[1];
eq((allowlist.match(/\{/g) || []).length, 1, 'A2  the activation allowlist still holds exactly one entry');
ok(allowlist.indexOf("sku: 'CO1100-R'") !== -1, 'A3  and it is still the single live scope');
ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R4') !== -1, 'A4  R6-R4 is a registered owner stamp');
eq(RO.staleAppTokenRefs(INDEX), [], 'A5  no index.html asset is left behind on an older app token');
// R6-R5 RESTATEMENT. "60_ does not move" was a statement about R6-R4's OWN diff — it proved no server defect,
// so it changed no server file — and it is not a claim about every future round. R6-R5 was required by its §3
// to add router-entry and stage evidence to this handler, which necessarily moves the stamp. What R6-R4
// asserted is therefore checked where it is still checkable: R6-R4's own commit touched no server file.
var _r4Files = cp.execSync('git show --name-only --format= ' + 'f60f683', { cwd: ROOT, encoding: 'utf8' })
  .split(/\r?\n/).filter(Boolean);
eq(_r4Files.filter(function (p) { return /60_api_v1_inventory_replenishment_workspace\.gs$/.test(p); }), [],
  'A6  R6-R4 did not touch 60_ — it proved no server defect, so it moved that stamp not at all');
// The registry DID change this round, and a changed asset must be served under a new token or a browser keeps
// the old one. That is the rule; the token's spelling is not.
ok(INDEX.indexOf('method-registry.js?v=' + RO.currentMethodRegistryToken()) !== -1,
  'A7  index.html serves the CURRENT method-registry token');
ok(RO.currentMethodRegistryToken() !== 'fc1be3r4a2r1r6r1-method-registry-20260905',
  'A7a and it moved, because resolve() changed this round');
ok(atHead('assets/js/core/method-registry.js') !== read('assets/js/core/method-registry.js'),
  'A7b — verified against the previous revision, not asserted');

// ================================================================================================================
section('§2 — the option identity, measured before the design is chosen');
// ================================================================================================================
// A sandbox holding the REAL registry, with the REAL shared service-identity test beside it.
function loadRegistry(src) {
  var win = { IRService: CMP.IRService };
  var ctx = vm.createContext({ window: win, self: win, console: { log: function () {} },
    module: { exports: {} }, JSON: JSON, Math: Math, Date: Date, RegExp: RegExp });
  vm.runInContext(src, ctx);
  return win.KM.methodRegistry;
}
var MR = loadRegistry(read('assets/js/core/method-registry.js'));
var MR_BEFORE = loadRegistry(atHead('assets/js/core/method-registry.js'));

var M_AMBIG = 'SVC-OCEAN', M_ONE = 'SVC-AIR';
var TRUCK = 'TRUCK', PARCEL = 'PARCEL';
function lt(o) {
  return { originCountry: o.f || 'CN', destinationCountry: o.t || 'US', shippingMethod: o.m,
    lastMileDelivery: o.lm === undefined ? '' : o.lm, minDays: o.mn, avgDays: o.av,
    maxDays: o.mx === undefined ? '' : o.mx, carrierId: o.c || 'C' };
}
// The live shape: one service with TWO last miles across two carriers, one with a single last mile.
var LEADS = [
  lt({ m: M_AMBIG, lm: TRUCK,  mn: 20, av: 25, mx: 31, c: 'C1' }),
  lt({ m: M_AMBIG, lm: TRUCK,  mn: 22, av: 24, mx: 26, c: 'C4' }),   // slower max wins across carriers
  lt({ m: M_AMBIG, lm: PARCEL, mn: 18, av: 22, mx: 26, c: 'C2' }),
  lt({ m: M_ONE,   lm: PARCEL, mn: 9,  av: 12, mx: 14, c: 'C3' }),
  lt({ m: 'SVC-RAIL', lm: TRUCK, mn: 20, av: 24, mx: '', c: 'C6' }), // blank max_days
  lt({ m: 'SVC-DOMESTIC', f: 'US', t: 'US', lm: TRUCK, mn: 2, av: 3, mx: 5, c: 'C7' })
];
function rc(m) {
  return { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon', shippingMethod: m,
    shippingMethodLabel: 'PRICED ' + m, lastMileDelivery: 'A LAST MILE NO CARRIER RUNS', carrierId: 'C1', status: 'active' };
}
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var LANE = { originCountry: 'CN', destinationCountry: 'US', marketplace: 'Amazon' };
function resolveWith(reg, cards) {
  reg.invalidate();
  reg.adopt(SCOPE, { getCarrierRateCards: cards, getCarrierLeadTimes: LEADS });
  return reg.resolve(SCOPE, LANE);
}
var PRICED = resolveWith(MR, [rc(M_AMBIG), rc(M_ONE)]);
var UNPRICED = resolveWith(MR, []);
eq(PRICED.method_source, 'CARRIER_RATE_CARDS', 'B1  a priced lane still takes its METHOD SET from the price list');
eq(UNPRICED.method_source, 'CARRIER_LEAD_TIMES', 'B1a and an unpriced lane still falls back to the transit authority');
eq([PRICED.last_mile_source, UNPRICED.last_mile_source], ['CARRIER_LEAD_TIMES', 'CARRIER_LEAD_TIMES'],
  'B2  but the LAST MILE comes from the transit authority on BOTH branches — it is a property of the lane');
function optOf(res, v) { return (res.methods || []).filter(function (m) { return m.value === v; })[0]; }
eq(optOf(PRICED, M_AMBIG).lastMileOptions, [PARCEL, TRUCK], 'B3  the priced option now knows both last miles');
eq(optOf(PRICED, M_AMBIG).lastMileOptions, optOf(UNPRICED, M_AMBIG).lastMileOptions,
  'B3a and the two branches answer identically');
eq(optOf(PRICED, M_ONE).lastMileDelivery, PARCEL, 'B4  a method running exactly one carries it, ambiguity false');
eq(optOf(PRICED, M_ONE).lastMileAmbiguous, false, 'B4a — so no question is put to the operator');
// The measurement the design decision rests on: the DOM value is the method token alone, and it must stay that
// way, because ricK4GroupKey_ hashes the service and the last mile as two SEPARATE identity axes.
ok((PRICED.methods || []).every(function (m) { return typeof m.value === 'string' && m.value.indexOf('|') === -1; }),
  'B5  an option VALUE is the shipping_method token — never a compound of method and last mile');
ok(/ricCanonicalService_\(h\.recommended_shipping_method/.test(G69) &&
   /pick\('recommended_last_mile_delivery', 'last_mile_delivery'\)/.test(G69),
  'B5a and 69_ proves why: the two are separate axes of the K4 route identity');
// THE DEFECT, at the previous revision, on the branch the live lane is on.
var PRICED_BEFORE = resolveWith(MR_BEFORE, [rc(M_AMBIG), rc(M_ONE)]);
eq(optOf(PRICED_BEFORE, M_AMBIG).lastMileOptions, undefined,
  'B6  BEFORE: on a priced lane the option carried NO last-mile knowledge at all');
eq(optOf(resolveWith(MR_BEFORE, []), M_AMBIG).lastMileAmbiguous, true,
  'B6a BEFORE: while the unpriced branch did — one question, two answers, decided by which table replied');
// A rate card's own last mile is deliberately NOT the source: a priced last mile with no transit row would be
// an option that resolves to LAST_MILE_NOT_ON_THIS_METHOD the moment it is chosen.
ok(optOf(PRICED, M_AMBIG).lastMileOptions.indexOf('A LAST MILE NO CARRIER RUNS') === -1,
  'B7  a last mile only the PRICE LIST names is not offered — it could not produce an arrival');

// ================================================================================================================
section('§3 — one service identity, and the label is never parsed');
// ================================================================================================================
var FIVE = [
  lt({ m: 'air', lm: 'parcel', mn: 5, av: 7, mx: 9 }),
  lt({ m: 'sea', lm: 'parcel', mn: 30, av: 38, mx: 45 }),
  lt({ m: 'sea', lm: 'truck', mn: 32, av: 40, mx: 48 }),
  lt({ m: 'sea_express', lm: 'parcel', mn: 18, av: 22, mx: 26 }),
  lt({ m: 'sea_express', lm: 'truck', mn: 20, av: 25, mx: 31 })
];
var FIVE_P = MR.serviceProfilesForRoute(FIVE, LANE);
eq(FIVE_P.length, 5, 'C1  air+parcel, sea+parcel, sea+truck, sea_express+parcel and sea_express+truck stay five');
eq(FIVE_P.map(function (p) { return p.profileKey; }).sort(),
  ['air|parcel', 'sea_express|parcel', 'sea_express|truck', 'sea|parcel', 'sea|truck'].sort(),
  'C1a each with its own stable profile key');
eq(MR.profilesForMethod(FIVE_P, 'sea').length, 2, 'C2  sea selects its own two profiles');
eq(MR.profilesForMethod(FIVE_P, 'sea_express').length, 2, 'C2a and never absorbs sea_express');
eq(MR.profilesForMethod(FIVE_P, 'sea').map(function (p) { return p.method; }), ['sea', 'sea'],
  'C2b exact token first — a canonical neighbour is not collected while the token itself has rows');
// The label is presentation. The IDENTITY test is the shared one, and nothing parses display text.
var choicesFn = extractFn(PAGEC, '_irLastMileChoices_');
ok(!/IR_LABEL_TO_LEAD_KEY_|_irMethodToLeadKey/.test(choicesFn),
  'C3  the last-mile resolver consults no display-label translation table');
ok(!/Amazon/.test(choicesFn), 'C3a and no destination is inferred from a marketplace word');
ok(/window\.IRService/.test(choicesFn), 'C3b identity is decided by the ONE shared service test');
var profFn = extractFn(PAGEC, '_irLeadTimeProfileFor_');
ok(/reg\.profilesForMethod/.test(profFn),
  'C4  and the arrival selects its profiles through the REGISTRY — the same owner that built the option');

// ================================================================================================================
section('§2/§3 — the control, run against the shipped page');
// ================================================================================================================
function makeLmApi(pageSrc, rows) {
  var win = { IRService: CMP.IRService, KM: { methodRegistry: MR } };
  function tableOf(n) { return new RegExp('var ' + n + ' = \\{[\\s\\S]*?\\};').exec(pageSrc)[0]; }
  function obj(n) { return eval('(' + tableOf(n).replace(/^var [A-Z_]+ = /, '').replace(/;$/, '') + ')'); }
  var leadKey = new Function('IR_SERVICE_TO_LEAD_KEY_', 'IR_LABEL_TO_LEAD_KEY_',
    extractFn(pageSrc, '_irMethodToLeadKey') + '\nreturn _irMethodToLeadKey;')(
    obj('IR_SERVICE_TO_LEAD_KEY_'), obj('IR_LABEL_TO_LEAD_KEY_'));
  var names = ['_irLastMileChoices_', '_irLastMileCellHtml_', '_irPaintLastMileCell_',
    '_execLastMileOptionsHtml', '_irLeadTimeProfileFor_', '_irComputeRouteEta',
    '_irProjectCalendarDay_', '_irIsoPlusDays_'];
  var src = names.map(function (n) { return extractFn(pageSrc, n); }).join('\n') +
    '\nreturn { choices: _irLastMileChoices_, cell: _irLastMileCellHtml_, paint: _irPaintLastMileCell_,' +
    ' opts: _execLastMileOptionsHtml, eta: _irComputeRouteEta };';
  return new Function('window', '_execEsc', '_irMethodToLeadKey', '_irCarrierGet', 'Intl', src)(
    win, function (x) { return String(x == null ? '' : x); }, leadKey, function () { return rows; }, Intl);
}
var LM = makeLmApi(PAGE, LEADS);

[['PRICED lane', PRICED], ['UNPRICED lane', UNPRICED]].forEach(function (pair) {
  var tag = pair[0], methods = pair[1].methods || [];
  var etaBlank = LM.eta('US', { shipping_method: M_AMBIG, last_mile_delivery: '' }, 'CN');
  eq(etaBlank.source, 'LAST_MILE_REQUIRED', 'D1  ' + tag + ': the arrival asks for a last mile');
  var html = LM.cell(methods, M_AMBIG, '', etaBlank, 'CO1100-R', false);
  ok(/<select/.test(html) && html.indexOf(TRUCK) !== -1 && html.indexOf(PARCEL) !== -1,
    'D2  ' + tag + ': and the cell renders an ACTIONABLE control naming both candidates');
  ok(/data-field="last_mile_delivery"/.test(html) && /aria-label="Last mile"/.test(html),
    'D2a ' + tag + ': labelled, and collected under its own field name');
  var single = LM.cell(methods, M_ONE, '', null, 'CO1100-R', false);
  ok(!/<select/.test(single) && /value="PARCEL"/.test(single),
    'D3  ' + tag + ': a method with one last mile carries it without asking anyone');
  ok(/lastmile-static/.test(single), 'D3a ' + tag + ': and SHOWS it — a K4 identity axis is no longer invisible');
});
// THE INVARIANT: never the sentence without the control. Even with an empty option list.
var orphan = LM.cell([], M_AMBIG, '', { source: 'LAST_MILE_REQUIRED', last_mile_options: [PARCEL, TRUCK] },
  'CO1100-R', false);
ok(/<select/.test(orphan) && orphan.indexOf(TRUCK) !== -1,
  'D4  a refusal whose option list is EMPTY still produces a control from the refusal\'s own candidates');
var etaFn = extractFn(PAGEC, '_irUpdateRouteEtas');
ok(/_irPaintLastMileCell_/.test(etaFn),
  'D4a because the function that WRITES the sentence repaints the cell on the same pass');
ok(etaFn.indexOf('cell.textContent = eta.text') < etaFn.indexOf('_irPaintLastMileCell_'),
  'D4b — after the sentence is written, from the same eta object');
// Invalidation on a change that makes the stored value impossible.
eq(LM.choices(PRICED.methods, M_ONE, TRUCK, null).value, PARCEL,
  'D5  changing the Method drops a last mile the new method does not run');
eq(LM.choices(PRICED.methods, M_ONE, TRUCK, null).invalidated, true, 'D5a and says so, rather than silently');
eq(LM.choices(PRICED.methods, M_AMBIG, TRUCK, null).value, TRUCK,
  'D5b while a still-eligible choice survives a repaint untouched');
eq(LM.choices(PRICED.methods, 'SVC-NOT-ON-LANE', TRUCK, null).value, TRUCK,
  'D6  a lane that knows NO profile keeps the persisted value verbatim — a thin table is not a data change');
eq(LM.choices(PRICED.methods, 'SVC-NOT-ON-LANE', TRUCK, null).options, [],
  'D6a offering nothing it cannot stand behind');
// A From/To change is a LANE change, and a lane change re-derives the whole set.
var DOMESTIC = MR.serviceProfilesForRoute(LEADS, { originCountry: 'US', destinationCountry: 'US' });
eq(DOMESTIC.map(function (p) { return p.method; }), ['SVC-DOMESTIC'],
  'D7  a US->US lane offers only what runs US->US — a From change invalidates the CN service entirely');
eq(LM.eta('US', { shipping_method: M_AMBIG, last_mile_delivery: TRUCK }, 'US').available, false,
  'D7a and the CN service produces no arrival on that lane');

// ================================================================================================================
section('§3 — arrivals: conservative, fail-closed, and independent of price');
// ================================================================================================================
var mkt = LM.eta('US', { shipping_method: M_AMBIG, last_mile_delivery: TRUCK }, 'CN');
eq([mkt.available, mkt.max_days], [true, 31],
  'E1  marketplace destination resolves, on the SLOWEST max across carriers that run it (26 vs 31 -> 31)');
eq(mkt.basis, 'MAX_DAYS_CONSERVATIVE', 'E1a and declares its basis');
var wh = LM.eta('US', { shipping_method: M_ONE, last_mile_delivery: PARCEL }, 'CN');
eq([wh.available, wh.max_days], [true, 14], 'E2  warehouse destination resolves on its own conservative max');
ok(mkt.date !== wh.date, 'E2a and the two get DIFFERENT dates — one is not answering for the other');
var parcelLeg = LM.eta('US', { shipping_method: M_AMBIG, last_mile_delivery: PARCEL }, 'CN');
eq(parcelLeg.max_days, 26, 'E3  the SAME method on a different last mile is a different transit time');
ok(parcelLeg.date !== mkt.date, 'E3a which is exactly why the choice cannot be made for the operator');
var blank = LM.eta('US', { shipping_method: 'SVC-RAIL', last_mile_delivery: TRUCK }, 'CN');
eq([blank.available, blank.source, blank.max_days], [false, 'NO_USABLE_MAX_DAYS', null],
  'E4  a blank max_days FAILS CLOSED — an absent number is not a zero-day transit');
eq(MR.methodsForRoute([], LANE).length, 0, 'E5  with zero rate cards the price list names nothing');
eq(LM.eta('US', { shipping_method: M_AMBIG, last_mile_delivery: TRUCK }, 'CN').available, true,
  'E5a and the arrival is unaffected — a rate card prices a lane, it does not time one');
eq(mkt.pricing.reason, 'NOT_REQUIRED_FOR_TRANSIT', 'E5b stated on the answer rather than left to be inferred');
ok(/buffer/i.test(JSON.stringify(mkt.buffer_excluded_note)) &&
   mkt.days === Math.round(mkt.max_days),
  'E6  the 7-day buffer is excluded — the displayed days ARE the rounded max, with nothing added');

// ================================================================================================================
section('§5 — 920 / 520 / 400, and where each number comes from');
// ================================================================================================================
function El(tag) {
  this.tag = tag || 'div'; this.children = []; this.attrs = {}; this.value = '';
  this.className = ''; this.innerHTML = '';
}
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return this.attrs[k] === undefined ? null : this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };
El.prototype.querySelectorAll = function (sel) {
  var out = [], m = /^\[data-field="([^"]+)"\]$/.exec(sel), cls = /^\.([\w-]+)$/.exec(sel);
  (function walk(n) {
    n.children.forEach(function (c) {
      if (m && c.attrs['data-field'] === m[1]) out.push(c);
      else if (cls && String(c.className).split(/\s+/).indexOf(cls[1]) !== -1) out.push(c);
      walk(c);
    });
  })(this);
  return out;
};
function routeRow(qty, whId, whName, whCountry) {
  var row = new El(); row.className = 'exec-route-row';
  var q = new El('input'); q.setAttribute('data-field', 'qty'); q.value = String(qty); row.appendChild(q);
  var from = new El('select'); from.setAttribute('data-field', 'source_warehouse_id'); from.value = whId;
  from.selectedIndex = 0;
  from.options = [{ getAttribute: function (k) {
    return k === 'data-wh-name' ? whName : k === 'data-wh-country' ? whCountry : k === 'data-wh-type' ? 'FACTORY' : '';
  } }];
  row.appendChild(from);
  return row;
}
function makeRecon(pageSrc, opts) {
  var list = new El(); list.className = 'exec-routes-list';
  (opts.rows || []).forEach(function (r) { list.appendChild(r); });
  var doc = { getElementById: function (id) { return id === 'shipping-methods-CO1100-R' ? list : null; } };
  var win = { _irLastAdvice: opts.advice || null, _irExecPlanChangedByLastRun: false };
  // R6-R6: the strip delegates its cell and its tooltip, so both are lifted with it.
  // OPTIONALLY, because this harness is also pointed at the BEFORE revision, where neither helper exists yet —
  // and a BEFORE that cannot be BUILT is a BEFORE/AFTER proof that proves nothing.
  function optFn(src, name) { try { return extractFn(src, name); } catch (e) { return ''; } }
  var src = optFn(pageSrc, '_irReconTooltip_') + '\n' + optFn(pageSrc, '_irReconCell_') + '\n' + extractFn(pageSrc, '_irAdviceVsPlan_') + '\n' + extractFn(pageSrc, '_irAdviceVsPlanHtml_') +
    '\nreturn { model: _irAdviceVsPlan_, html: _irAdviceVsPlanHtml_ };';
  return new Function('document', 'window', '_irRecoByKey', '_irIsComposerEl_', 'getReplenishmentData',
    '_irSuggestedQtyState_', '_irInventoryAiPlanDbGenerationEnabled_', '_execEsc', src)(
      doc, win, opts.recoByKey || {},
      function (el) { return String(el.className).indexOf('exec-route-composer') !== -1; },
      function () { return opts.items || []; },
      opts.suggested || function () { return { state: 'NONE', value: null }; },
      function () { return false; },
      function (x) { return String(x == null ? '' : x); });
}
var LIVE_ROWS = [routeRow(320, 'WH-CN-YX', 'CN FACTORY', 'CN'), routeRow(200, 'WH-CN-YX', 'CN FACTORY', 'CN')];
var LIVE_ITEMS = [{ sku: 'CO1100-R', country: 'US' }];
// The ordinary session: no AI Plan has been run, so `_irRecoByKey` is empty — the live condition.
var recon = makeRecon(PAGE, { rows: LIVE_ROWS, items: LIVE_ITEMS, recoByKey: {},
  suggested: function () { return { state: 'READY', value: 920 }; },
  advice: { scopes: [{ supply_sources: ['WH-RESUS-US-3PL-AMZLGS'] }] } });
var M = recon.model('CO1100-R');
eq([M.recommended_quantity, M.currently_planned_quantity, M.remaining_unplanned], [920, 520, 400],
  'F1  920 recommended, 520 currently planned, 400 not yet in a route');
eq(M.route_count, 2, 'F1a over the two saved routes');
eq(M.recommendation_source, 'MATERIALIZED_SUGGESTED_QTY',
  'F2  and the number is named for what it is — the standing gap read, not an AI plan');
var H = recon.html('CO1100-R');
ok(H.indexOf('920') !== -1 && H.indexOf('520') !== -1 && H.indexOf('400') !== -1,
  'F3  all three numbers are RENDERED — this is what the live screen was missing');
ok(/Recommended</.test(H) && !/AI recommends/.test(H),
  'F3a labelled "Recommended", because no AI Plan produced it');
// R6-R6 RESTATEMENT. The basis was a sub-line under the number — 'standing suggested quantity — no AI Plan
// has been run this session' — and it is one of the sentences the operator named as being in the way. The
// claim it stood for is that the strip never shows a number without recording WHICH claim it is, and that is
// unchanged: the source is published on the element, where a diagnostic and this test can both read it and an
// operator is not made to. F3a above still proves the visible LABEL distinguishes the two cases.
ok(/data-recommendation-source="MATERIALIZED_SUGGESTED_QTY"/.test(H),
  'F3b with its basis recorded on the element rather than printed as prose');
ok(/data-recommendation-state="READY"/.test(H),
  'F3b1 and the state of that owner alongside it, so PENDING can never be read as zero');
// The previous revision, same inputs: nothing at all.
var reconBefore = makeRecon(atHead('assets/js/pages/inventory-replenishment.js'),
  { rows: LIVE_ROWS, items: LIVE_ITEMS, recoByKey: {},
    suggested: function () { return { state: 'READY', value: 920 }; } });
eq(reconBefore.model('CO1100-R').recommended_quantity, null,
  'F4  BEFORE: the recommendation read a map only the AI Plan button fills, so it was null');
eq(reconBefore.html('CO1100-R'), '', 'F4a BEFORE: and the whole strip rendered as an empty string');
// An AI DTO, when one exists, still wins and is labelled as such.
var reconAi = makeRecon(PAGE, { rows: LIVE_ROWS, items: LIVE_ITEMS,
  recoByKey: { 'CO1100-R': { suggestedQty: 760 } },
  suggested: function () { return { state: 'READY', value: 920 }; } });
eq(reconAi.model('CO1100-R').recommended_quantity, 760, 'F5  an AI Plan recommendation still takes precedence');
// R6-R6 RESTATEMENT. The visible label is now 'Recommended' in both cases: WHICH recommendation this is counts
// as source authority — internal vocabulary the operator explicitly asked to have off the screen. It is not
// lost; it is published on the element, where the diagnostic that needs it reads it and an operator is not
// made to. The claim that mattered is that the two remain DISTINGUISHABLE, and that is what is checked here;
// F5 above still proves the AI DTO takes precedence.
ok(/data-recommendation-source="AI_PLAN_RECOMMENDATION"/.test(reconAi.html('CO1100-R')),
  'F5a and the answer is still identifiable as the AI\'s, on the element rather than in prose');
ok(!/data-recommendation-source="AI_PLAN_RECOMMENDATION"/.test(H),
  'F5b while the standing-gap answer is not — the two never collapse into one claim');
// PENDING and NONE are not zero.
var reconPending = makeRecon(PAGE, { rows: LIVE_ROWS, items: LIVE_ITEMS,
  suggested: function () { return { state: 'PENDING', value: null }; } });
eq(reconPending.model('CO1100-R').recommended_quantity, null,
  'F6  a PENDING read is not a recommendation of 0 — no number is invented');
// R6-R6 RESTATEMENT: same guarantee, compact form. An unknown number renders as an em dash and NEVER as 0 —
// which is the half that matters — and the reason it is unknown moves to the title, where it is available
// without occupying the line. The zero-check is kept verbatim.
var _pendingH = reconPending.html('CO1100-R');
ok(_pendingH.indexOf('\u2014') !== -1 && /title="Still loading"/.test(_pendingH),
  'F6a and the strip shows an em dash with the reason on hover, never a fabricated figure');
ok(!/\b0\b/.test(_pendingH.replace(/520|400/g, '')),
  'F6a1 and 0 appears nowhere — PENDING is not a recommendation of nothing');
// The two supply origins, and the sentence that stops the wrong subtraction.
eq(M.existing_route_source_countries, ['CN'], 'F7  the existing plan\'s origin is read from the ROWS themselves');
eq(M.recommendation_supply_sources, ['WH-RESUS-US-3PL-AMZLGS'], 'F7a the advice\'s origin from the advice');
eq(M.supply_sources_comparable, false, 'F7b and they are NOT the same supply');
// R6-R6 RESTATEMENT: four words on the line, the specifics in the accessible description. The warning is the
// part that must survive compaction — and the part that must still be ABSENT when the sources agree.
ok(/Different inventory sources/.test(H) && /aria-label="Different inventory sources/.test(H),
  'F8  so the strip still warns that the two numbers describe different stock');
ok(/Recommendation: WH-RESUS-US-3PL-AMZLGS/.test(H),
  'F8b and the detail names each side\'s own supply, where an operator who wants it can reach it');
// The denial is gone because the claim is: a strip of three labelled numbers asserts nothing about who wrote
// what. Checked as the absence, which is stricter than the sentence was.
ok(!/(applied|added automatically|already here)/i.test(H),
  'F8a and it makes no claim about application at all — there is nothing left to deny');
ok(!/\b(CN|from CN)\b[^<]*400|400[^<]*from CN/.test(H),
  'F8b the 400 is never presented as another shipment from the CN factory');

// ================================================================================================================
section('§4/§7 — the save-target freeze, replaying the write path\'s own resolver');
// ================================================================================================================
var HEADER_COLS = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace',
  'marketplace_id', 'status', 'lifecycle_status', 'generation_type', 'generation_run_id', 'calculation_run_id',
  'source_data_as_of', 'destination_marketplace', 'destination_warehouse_id', 'recommended_destination_warehouse_id',
  'source_warehouse_id', 'recommended_source_warehouse_id', 'recommended_shipping_method',
  'recommended_last_mile_delivery', 'create_idempotency_key', 'created_at', 'created_by', 'updated_at',
  'updated_by', 'draft_version'];
var LINE_COLS = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'source_warehouse_id',
  'source_warehouse_code', 'destination_kind', 'destination_warehouse_id', 'destination_marketplace',
  'planned_qty', 'recommended_qty', 'shipping_method', 'last_mile_delivery', 'expected_arrival', 'line_status'];
var SKU = 'CO1100-R';
// FOUR station-included headers, TWO of which carry a line for this SKU — the live shape §4 describes.
function buildSheets(extra) {
  var H = [HEADER_COLS.slice()], L = [LINE_COLS.slice()];
  function h(o) { H.push(HEADER_COLS.map(function (c) { return o[c] === undefined ? '' : o[c]; })); }
  function l(o) { L.push(LINE_COLS.map(function (c) { return o[c] === undefined ? '' : o[c]; })); }
  h({ allocation_draft_id: 'SAD-C787D1B1-D', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'draft', destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-YX',
      recommended_shipping_method: 'sea_express', recommended_last_mile_delivery: TRUCK, draft_version: 3 });
  l({ allocation_draft_line_id: 'SADL-A1', allocation_draft_id: 'SAD-C787D1B1-D', sku: SKU, planned_qty: 320,
      line_status: 'draft', source_warehouse_id: 'WH-CN-YX', destination_kind: 'MARKETPLACE',
      destination_marketplace: 'Amazon' });
  h({ allocation_draft_id: 'SAD-27976058-2', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'draft', recommended_destination_warehouse_id: 'WH-AMZLGS-IN',
      recommended_source_warehouse_id: 'WH-CN-YX', recommended_shipping_method: 'air', draft_version: 2 });
  l({ allocation_draft_line_id: 'SADL-B1', allocation_draft_id: 'SAD-27976058-2', sku: SKU, planned_qty: 200,
      line_status: 'draft', source_warehouse_id: 'WH-CN-YX', destination_kind: 'WAREHOUSE',
      destination_warehouse_id: 'WH-AMZLGS-IN' });
  // Two more headers that count toward the STATION but carry no CO1100-R line — other SKUs' work.
  h({ allocation_draft_id: 'SADH-K4-38523A90', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'draft', recommended_destination_warehouse_id: 'WH-OTHER', recommended_source_warehouse_id: 'WH-TW-1' });
  l({ allocation_draft_line_id: 'SADL-O1', allocation_draft_id: 'SADH-K4-38523A90', sku: 'OTHER-SKU-1',
      planned_qty: 90, line_status: 'draft' });
  h({ allocation_draft_id: 'SADH-K4-A3872518', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      status: 'draft', recommended_destination_warehouse_id: 'WH-OTHER-2', recommended_source_warehouse_id: 'WH-TW-2' });
  l({ allocation_draft_line_id: 'SADL-O2', allocation_draft_id: 'SADH-K4-A3872518', sku: 'OTHER-SKU-2',
      planned_qty: 40, line_status: 'draft' });
  // Terminal headers that share Route A's identity exactly — they must never become a target.
  ['cancelled', 'expired', 'submitted'].forEach(function (st, i) {
    h({ allocation_draft_id: 'SADH-TERM-' + st, company: 'ResUS', country: 'US', marketplace: 'Amazon',
        status: st, destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-YX',
        recommended_shipping_method: 'sea_express', recommended_last_mile_delivery: TRUCK });
    l({ allocation_draft_line_id: 'SADL-T' + i, allocation_draft_id: 'SADH-TERM-' + st, sku: SKU,
        planned_qty: 999, line_status: 'draft' });
  });
  (extra || []).forEach(function (o) { h(o); });
  return { shipping_allocation_drafts: H, shipping_allocation_draft_lines: L };
}
function runCensus(censusSrc, sheets) {
  var LOG = [];
  var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: Date, String: String,
    Number: Number, Object: Object, Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat,
    parseInt: parseInt, Error: Error, RegExp: RegExp, Boolean: Boolean };
  sb.global = sb;
  sb.Logger = { log: function (m) { LOG.push(String(m)); } };
  var writes = { appendRow: 0, setValues: 0 };
  sb.SpreadsheetApp = { openById: function () { return { getSheetByName: function (n) {
    var rows = sheets[n]; if (!rows) return null;
    return {
      getDataRange: function () { return { getValues: function () { return rows; } }; },
      appendRow: function () { writes.appendRow++; },
      getRange: function () { return { setValues: function () { writes.setValues++; },
        setValue: function () { writes.setValues++; } }; }
    };
  } }; } };
  var ctx = vm.createContext(sb);
  vm.runInContext(read('assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs'), ctx);
  // The REAL route-identity and save-target owners, lifted from the shipped server sources — so this replays
  // the write path rather than a test's idea of it.
  vm.runInContext([
    'function prodExpectedDbId_() { return "FAKE"; }',
    'function prodAssertDbTarget_() { return true; }',
    // ricCanonicalService_ reads two module-level tables; without them the K4 key throws on the first header
    // that carries a real shipping method, and the freeze would report RESOLVER_ERROR for a sandbox reason.
    (/var RIC_CANONICAL_SERVICES_ = [^;]+;/.exec(G69) || [''])[0],
    (/var RIC_SERVICE_LABELS_ = \{[\s\S]*?\};/.exec(G69) || [''])[0],
    extractFn(G69, 'ricDestinationIdentity_'),
    extractFn(G69, 'ricCanonicalService_'),
    extractFn(G69, 'ricK4GroupKey_'),
    extractFn(G69, 'ricK4DeterministicHeaderId_'),
    extractFn(G16, 'sadFnv1a_'),
    extractFn(G16, 'sadK4ResolveActiveDraft_')
  ].join('\n'), ctx);
  vm.runInContext(censusSrc, ctx);
  var res = null, threw = null;
  try { res = vm.runInContext('RUN_R6R4_SAVE_TARGET_FREEZE()', ctx); } catch (e) { threw = e; }
  return { res: res, threw: threw, writes: writes, log: LOG.join('\n') };
}
var FREEZE = runCensus(CENSUS, buildSheets());
ok(!FREEZE.threw, 'G0  the R6-R4 entry point runs' + (FREEZE.threw ? ' — ' + FREEZE.threw.message : ''));
var R = FREEZE.res || {};
eq(R.census, 'RUN_R6R4_SAVE_TARGET_FREEZE', 'G0a and reports which runner produced the answer');
eq(R.delegates_to, 'RUN_R6R2_ROUTE_PROVENANCE', 'G0b as a WRAPPER — the authority is not duplicated');
eq(R.station_included_header_ids.length, 4, 'G1  four headers count toward this STATION\'s current plan');
eq(R.sku_contributing_header_ids.length, 2, 'G1a of which two carry a line for this SKU');
eq(R.headers_included_without_sku_line.length, 2, 'G1b and two carry none — other SKUs in the same station');
eq(R.visible_route_rows.length, 2, 'G1c so the screen shows exactly two rows, which is the reduction §4 asks for');
eq(R.reduction.station_included + '/' + R.reduction.visible_rows, '4/2', 'G1d stated as arithmetic, not as prose');
eq(R.sku_contributing_line_ids, ['SADL-A1', 'SADL-B1'], 'G2  and names the exact lines behind them');
eq(R.ui_current_plan_total, 520, 'G2a whose quantities are the 520 on screen');
eq(R.totals_agree, true, 'G2b UI and census agree');
// Every visible row resolves to exactly one save target, and it is its own header.
eq(R.visible_route_rows.map(function (r) { return r.save_target_status; }), ['REUSE', 'REUSE'],
  'G3  each visible row resolves to exactly ONE existing active header');
eq(R.visible_route_rows.map(function (r) { return r.save_would_update_this_header; }), [true, true],
  'G3a and it is that row\'s OWN header — a save UPDATES, it does not reassign');
eq(R.visible_route_rows.map(function (r) { return r.save_would_mint_new_header; }), [false, false],
  'G4  no visible row would MINT a new header — the existing active identity is reused');
eq(R.ambiguous_save_targets, [], 'G4a nothing is ambiguous');
eq(R.shared_k4_groups, [], 'G4b and no two visible rows share a K4 route identity');
eq(R.ready_for_manual_route_save_test, true, 'G5  so the save-target freeze is clean');
ok(/sadK4ResolveActiveDraft_/.test(String(R.save_target_authority)),
  'G5a decided by the WRITE PATH\'s own resolver, replayed read-only');
// Terminal headers sharing the identity exist, and are still not the target.
ok(R.visible_route_rows[0].terminal_headers_sharing_this_identity >= 3,
  'G6  three terminal headers carry Route A\'s exact route identity');
eq(R.visible_route_rows[0].save_target_allocation_draft_id, 'SAD-C787D1B1-D',
  'G6a and the target is still the ACTIVE one — cancelled/expired/submitted cannot become an update target');
// Manual ownership survives.
ok(R.visible_route_rows.every(function (r) { return /^MANUAL/.test(r.ownership); }),
  'G7  both rows remain MANUAL — no generation_run_id was invented for them');
eq(R.visible_route_rows.map(function (r) { return r.quantity; }), [320, 200], 'G7a with their quantities intact');
eq(R.visible_route_rows.map(function (r) { return r.last_mile_delivery; }), [TRUCK, ''],
  'G7b and the stored last mile reported as it is — blank is reported blank, never filled in');
// A SECOND active header with the same identity is a refusal, not a choice.
// A SECOND ACTIVE header carrying Route A's exact identity — the one case the write path must refuse.
var CONFLICT = runCensus(CENSUS, buildSheets([{ allocation_draft_id: 'SADH-DUPE', company: 'ResUS',
  country: 'US', marketplace: 'Amazon', status: 'draft', destination_marketplace: 'Amazon',
  recommended_source_warehouse_id: 'WH-CN-YX', recommended_shipping_method: 'sea_express',
  recommended_last_mile_delivery: TRUCK }]));
var conflictRow = (CONFLICT.res.visible_route_rows || []).filter(function (r) {
  return r.allocation_draft_id === 'SAD-C787D1B1-D'; })[0];
eq(conflictRow.save_target_status, 'BLOCKED_CONFLICT',
  'G8  two active headers sharing one identity is a REFUSAL — the write path does not choose between them');
ok(CONFLICT.res.ambiguous_save_targets.length > 0, 'G8a reported as an ambiguous save target');
eq(CONFLICT.res.ready_for_manual_route_save_test, false,
  'G8b and READY_FOR_MANUAL_ROUTE_SAVE_TEST goes to NO, exactly as §7 requires');
// Read-only, throughout.
eq([R.db_writes, R.writer_constructed, R.submit_calls, R.reservation_writes, R.carrier_master_data_writes],
  [0, false, 0, 0, 0], 'G9  zero DB writes, no writer, no Submit, no reservation, no carrier master data');
eq([FREEZE.writes.appendRow, FREEZE.writes.setValues], [0, 0],
  'G9a and the SHEET saw no mutation — measured on the stub, not asserted');
var freezeSrc = extractFn(CENSUSC, 'RUN_R6R4_SAVE_TARGET_FREEZE') + extractFn(CENSUSC, 'RUN_R6R2_ROUTE_PROVENANCE');
ok(!/appendRow|setValue|deleteRow|getRange\([^)]*\)\.set/.test(freezeSrc),
  'G9b neither runner constructs a mutation of any kind');
ok(typeof R.output_bytes === 'number' && R.output_bytes < 200000,
  'G10 the result stays bounded (' + R.output_bytes + ' bytes)');
ok(Array.isArray(R.stage_timings) && R.stage_timings.length >= 10 &&
   R.stage_timings.every(function (s) { return typeof s.elapsed_ms === 'number'; }),
  'G10a with a timing for every stage');
ok(R.stage_timings.some(function (s) { return s.stage === 'FREEZE_VISIBLE_ROW_SAVE_TARGETS'; }),
  'G10b including the freeze itself');

// ================================================================================================================
section('§6 — seven tracks, one definition, every row the same');
// ================================================================================================================
function parseTracks(cssBlock) {
  var m = /grid-template-columns:([\s\S]*?);/.exec(cssBlock);
  if (!m) throw new Error('no grid-template-columns');
  var body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ').trim();
  var out = [], re = /minmax\(\s*(\d+)px\s*,\s*(auto|[\d.]+fr)\s*\)|(\d+)px/g, t;
  while ((t = re.exec(body))) {
    if (t[3] !== undefined) out.push({ kind: 'fixed', min: +t[3] });
    else if (t[2] === 'auto') out.push({ kind: 'auto', min: +t[1] });
    else out.push({ kind: 'flex', min: +t[1], flex: parseFloat(t[2]) });
  }
  return out;
}
function resolveTracks(tracks, containerPx, gapPx, contentWidths) {
  var base = tracks.map(function (t) { return t.min; });
  var free = containerPx - gapPx * (tracks.length - 1) - base.reduce(function (a, b) { return a + b; }, 0);
  if (free < 0) free = 0;
  tracks.forEach(function (t, i) {
    if (t.kind !== 'auto') return;
    var give = Math.min(Math.max(0, (contentWidths[i] || 0) - base[i]), free);
    base[i] += give; free -= give;
  });
  var totalFlex = tracks.reduce(function (a, t) { return a + (t.kind === 'flex' ? t.flex : 0); }, 0);
  if (totalFlex > 0 && free > 0) tracks.forEach(function (t, i) { if (t.kind === 'flex') base[i] += free * (t.flex / totalFlex); });
  return base.map(function (w) { return Math.round(w * 100) / 100; });
}
function trackOffsets(widths, gapPx) {
  var o = [], x = 0;
  for (var i = 0; i < widths.length; i++) { o.push(Math.round(x * 100) / 100); x += widths[i] + gapPx; }
  return o;
}
function textW(s) {
  var w = 0;
  for (var i = 0; i < String(s).length; i++) w += (String(s).charCodeAt(i) > 0x2e80) ? 11 : 6;
  return w + 2;
}
var BLOCK = (function () {
  var i = CSS.indexOf('#ops-section .ir-exec-plan__grid {');
  return CSS.slice(i, CSS.indexOf('}', i));
})();
var TRACKS = parseTracks(BLOCK);
eq(TRACKS.length, 7, 'H1  seven tracks: From · To · Qty · Method · Last Mile · Expected Arrival · Action');
eq(TRACKS.filter(function (t) { return t.kind === 'auto'; }).length, 0,
  'H2  not one of them is content-sized — R6-R3\'s defect does not come back with the new column');
eq(TRACKS.map(function (t) { return t.kind; }),
  ['flex', 'flex', 'fixed', 'flex', 'flex', 'flex', 'fixed'],
  'H2a Qty and Action fixed; every other track a fraction of the CONTAINER');
var GAP = 8;
var MIN_TOTAL = TRACKS.reduce(function (a, t) { return a + t.min; }, 0) + GAP * (TRACKS.length - 1);
ok(MIN_TOTAL <= 560, 'H3  the seven minima fit the narrowest panel §6 names (' + MIN_TOTAL + 'px <= 560px)');
// Header + one, two and four route rows, short and long names, empty and populated ETA, last mile both ways.
var ROW_CASES = [
  { l: 'HEADER', c: ['From', 'To', 'Qty', 'Method', 'Last Mile', 'Expected Arrival', '×'] },
  { l: 'Route A marketplace dest', c: ['CN侑鑫', 'Amazon', '320', M_AMBIG, TRUCK, '2026-10-06 (latest, 31d)', '×'] },
  { l: 'Route B warehouse dest', c: ['CN侑鑫', 'AMZLG&S IN', '200', M_ONE, PARCEL, '2026-09-19 (latest, 14d)', '×'] },
  { l: 'Route C last mile REQUIRED', c: ['CN侑鑫', 'Amazon', '80', M_AMBIG, 'Last mile…', 'Choose a last mile', '×'] },
  { l: 'Route D empty everything', c: ['', '', '', '', '—', '—', '×'] },
  { l: 'Route E long everything',
    c: ['Shenzhen Consolidated Export Warehouse No. 4', 'AMZLG&S Indianapolis Receiving Dock 12', '99999',
        'Sea Express (weekly sailing)', 'Ground Parcel Delivery', '2026-09-15 – 2026-10-06 (latest, 31d)', '×'] }
];
[720, 620, 560].forEach(function (W) {
  var layouts = {};
  ROW_CASES.forEach(function (r) {
    var widths = resolveTracks(TRACKS, W, GAP, r.c.map(textW));
    layouts[JSON.stringify(trackOffsets(widths, GAP))] = (layouts[JSON.stringify(trackOffsets(widths, GAP))] || 0) + 1;
  });
  eq(Object.keys(layouts).length, 1, 'H4  at ' + W + 'px every row and the header resolve ONE column layout');
});
// Header labels are readable at every tested width — a clipped heading is worse than a clipped value.
[720, 620, 560].forEach(function (W) {
  var widths = resolveTracks(TRACKS, W, GAP, ROW_CASES[0].c.map(textW));
  ok(ROW_CASES[0].c.every(function (s, i) { return widths[i] >= textW(s); }),
    'H5  at ' + W + 'px no COLUMN HEADING is clipped');
});
// The long row does not resize the short one — the property R6-R3 established, now at seven tracks.
var shortAt620 = trackOffsets(resolveTracks(TRACKS, 620, GAP, ROW_CASES[2].c.map(textW)), GAP);
var longAt620 = trackOffsets(resolveTracks(TRACKS, 620, GAP, ROW_CASES[5].c.map(textW)), GAP);
eq(shortAt620, longAt620, 'H6  a 43-character warehouse name moves no column in any other row');
// The header declares no template of its own, and the markup emits seven cells.
var headBlock = /#ops-section \.ir-exec-plan__grid--head \{([\s\S]*?)\}/.exec(CSS)[1];
ok(!/grid-template-columns/.test(headBlock), 'H7  the header does NOT re-declare the template it shares');
var headHtml = /ir-exec-plan__grid--head">([\s\S]*?)<\/div>/.exec(PAGE)[1];
eq((headHtml.match(/<span/g) || []).length, 7, 'H7a and emits exactly seven heading cells');
ok(/<span>Last Mile<\/span>/.test(headHtml), 'H7b including Last Mile, between Method and Expected Arrival');
ok(headHtml.indexOf('Last Mile') > headHtml.indexOf('Method') &&
   headHtml.indexOf('Last Mile') < headHtml.indexOf('Expected Arrival'),
  'H7c in that order');
var rowFn = extractFn(PAGE, '_renderExecutionRoute');
ok(/replen-card__lastmile-cell/.test(rowFn), 'H8  and the ROW emits a Last Mile cell of its own');
ok(rowFn.indexOf('replen-card__lastmile-cell') > rowFn.indexOf('replen-card__method-cell') &&
   rowFn.indexOf('replen-card__lastmile-cell') < rowFn.indexOf('replen-card__eta'),
  'H8a in the same position the heading occupies');
ok(/#ops-section \.replen-card__lastmile-cell \{[^}]*min-width: 0;/.test(CSS),
  'H9  the cell may shrink below its content, so a long value clips inside its own track');
ok(/\.replen-card__lastmile-static \{[^}]*text-overflow: ellipsis/.test(CSS),
  'H9a and a long static value ellipsises rather than widening a column');
ok(/lastmile-static" title="/.test(PAGE), 'H9b with the full value kept in its title');
ok(BLOCK.indexOf('#ops-section') === 0, 'H10 the layout authority is still scoped to #ops-section');

// ================================================================================================================
section('MUTATION PROBES — each breaks a semantic guard, none a spelling');
// ================================================================================================================
mut('M1  the priced branch going back to options that know no last mile', function () {
  var m = mutateFn(read('assets/js/core/method-registry.js'), 'resolve',
    'methods: withTransitLastMile(methods, entry.leadTimes, route)', 'methods: methods');
  var reg = loadRegistry(m);
  reg.adopt(SCOPE, { getCarrierRateCards: [rc(M_AMBIG)], getCarrierLeadTimes: LEADS });
  var broken = optOf(reg.resolve(SCOPE, LANE), M_AMBIG);
  return broken.lastMileAmbiguous === undefined && optOf(PRICED, M_AMBIG).lastMileAmbiguous === true;
});
mut('M2  the refusal losing its own candidate list, leaving nothing to build a control from', function () {
  var m = mutateFn(PAGE, '_irLastMileChoices_',
    "if (eta && eta.source === 'LAST_MILE_REQUIRED') {", 'if (false) {');
  var api = makeLmApi(m, LEADS);
  var broken = api.cell([], M_AMBIG, '', { source: 'LAST_MILE_REQUIRED', last_mile_options: [PARCEL, TRUCK] }, 'S', false);
  return !/<select/.test(broken) && /<select/.test(orphan);
});
mut('M3  a stale last mile surviving a method change', function () {
  var m = mutateFn(PAGE, '_irLastMileChoices_',
    'else if (opts.length === 1) value = opts[0];', 'else if (opts.length === 1) value = sel || opts[0];');
  var api = makeLmApi(m, LEADS);
  return api.choices(PRICED.methods, M_ONE, TRUCK, null).value === TRUCK &&
         LM.choices(PRICED.methods, M_ONE, TRUCK, null).value === PARCEL;
});
mut('M4  a BLANK last mile counted as a competing claim, inventing an ambiguity', function () {
  var m = mutateFn(read('assets/js/core/method-registry.js'), 'lastMileFacts',
    'if (v && opts.indexOf(v) === -1) opts.push(v);', 'if (opts.indexOf(v) === -1) opts.push(v);');
  var reg = loadRegistry(m);
  var rows = [lt({ m: 'X', lm: '', mn: 1, av: 2, mx: 3 }), lt({ m: 'X', lm: TRUCK, mn: 1, av: 2, mx: 3 })];
  var f = reg.lastMileFacts(reg.serviceProfilesForRoute(rows, LANE));
  var good = MR.lastMileFacts(MR.serviceProfilesForRoute(rows, LANE));
  return f.lastMileAmbiguous === true && good.lastMileAmbiguous === false;
});
mut('M5  the arrival adding the operational buffer to a displayed date', function () {
  var m = mutateFn(PAGE, '_irComputeRouteEta', 'var _d = Math.round(_mx);', 'var _d = Math.round(_mx) + 7;');
  return makeLmApi(m, LEADS).eta('US', { shipping_method: M_ONE, last_mile_delivery: PARCEL }, 'CN').days === 21 &&
         wh.days === 14;
});
mut('M6  a blank max_days becoming a zero-day transit', function () {
  var m = mutateFn(PAGE, '_irComputeRouteEta',
    'if (_mx === null || _mx === undefined) {', 'if (false) {');
  var b = makeLmApi(m, LEADS).eta('US', { shipping_method: 'SVC-RAIL', last_mile_delivery: TRUCK }, 'CN');
  return b.days === 0 && blank.available === false;
});
mut('M7  the fastest carrier deciding a service\'s transit time', function () {
  var m = mutateFn(read('assets/js/core/method-registry.js'), 'serviceProfilesForRoute',
    'if (mx !== null) p.maxDays = (p.maxDays === null) ? mx : Math.max(p.maxDays, mx);',
    'if (mx !== null) p.maxDays = (p.maxDays === null) ? mx : Math.min(p.maxDays, mx);');
  var reg = loadRegistry(m);
  var p = reg.profilesForMethod(reg.serviceProfilesForRoute(LEADS, LANE), M_AMBIG)
    .filter(function (x) { return x.lastMileDelivery === TRUCK; })[0];
  return p.maxDays === 26 && mkt.max_days === 31;
});
mut('M8  the reconciliation going back to the map only the AI Plan button fills', function () {
  var m = mutateFn(PAGE, '_irAdviceVsPlan_', 'if (recommended === null) {', 'if (false) {');
  var r = makeRecon(m, { rows: LIVE_ROWS, items: LIVE_ITEMS, recoByKey: {},
    suggested: function () { return { state: 'READY', value: 920 }; } });
  return r.model('CO1100-R').recommended_quantity === null && M.recommended_quantity === 920;
});
mut('M9  a PENDING read printed as a recommendation of zero', function () {
  var m = mutateFn(PAGE, '_irAdviceVsPlan_',
    "if (_st.state === 'READY' || _st.state === 'LEGACY') {", 'if (true) {');
  var r = makeRecon(m, { rows: LIVE_ROWS, items: LIVE_ITEMS,
    suggested: function () { return { state: 'PENDING', value: null }; } });
  return r.model('CO1100-R').recommended_quantity === 0 &&
         reconPending.model('CO1100-R').recommended_quantity === null;
});
mut('M10 the difference presented as comparable when the supply differs', function () {
  var m = mutateFn(PAGE, '_irAdviceVsPlanHtml_',
    "if (r.supply_sources_comparable === false) {", 'if (false) {');
  var r = makeRecon(m, { rows: LIVE_ROWS, items: LIVE_ITEMS, recoByKey: {},
    suggested: function () { return { state: 'READY', value: 920 }; },
    advice: { scopes: [{ supply_sources: ['WH-RESUS-US-3PL-AMZLGS'] }] } });
  return !/Different inventory sources/.test(r.html('CO1100-R')) && /Different inventory sources/.test(H);
});
mut('M11 station-level inclusion reported as the visible-row set', function () {
  var m = mutateFn(CENSUS, 'RUN_R6R2_ROUTE_PROVENANCE',
    'if (skuLineHeaderIds[sk] === 1) out.sku_contributing_header_ids.push(sk);',
    'if (true) out.sku_contributing_header_ids.push(sk);');
  var r = runCensus(m, buildSheets());
  return r.res.sku_contributing_header_ids.length === 4 && R.sku_contributing_header_ids.length === 2;
});
mut('M12 a terminal header becoming a legal update target', function () {
  var m = mutateFn(G16, 'sadK4ResolveActiveDraft_',
    "var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1 };",
    "var ACTIVE = { draft: 1, site_confirmed: 1, partially_submitted: 1, cancelled: 1, expired: 1, submitted: 1 };");
  // Replay the resolver directly: the mutant must turn one clean target into a conflict.
  var sb = { Error: Error, String: String };
  var ctx = vm.createContext(sb);
  vm.runInContext([(/var RIC_CANONICAL_SERVICES_ = [^;]+;/.exec(G69) || [''])[0],
    (/var RIC_SERVICE_LABELS_ = \{[\s\S]*?\};/.exec(G69) || [''])[0],
    extractFn(G69, 'ricDestinationIdentity_'), extractFn(G69, 'ricCanonicalService_'),
    extractFn(G69, 'ricK4GroupKey_'), extractFn(G69, 'ricK4DeterministicHeaderId_'),
    extractFn(G16, 'sadFnv1a_'), extractFn(m, 'sadK4ResolveActiveDraft_')].join('\n'), ctx);
  var rows = [
    { allocation_draft_id: 'A', status: 'draft', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-YX' },
    { allocation_draft_id: 'B', status: 'cancelled', company: 'ResUS', country: 'US', marketplace: 'Amazon',
      destination_marketplace: 'Amazon', recommended_source_warehouse_id: 'WH-CN-YX' }
  ];
  sb.rows = rows;
  var got = vm.runInContext('sadK4ResolveActiveDraft_(rows, rows[0]).status', ctx);
  return got === 'BLOCKED_CONFLICT' && R.visible_route_rows[0].save_target_status === 'REUSE';
});
mut('M13 the seventh column sized by its own text', function () {
  var mutated = BLOCK.replace('minmax(68px, 1fr)', 'minmax(68px, auto)');
  var t = parseTracks(mutated);
  var a = trackOffsets(resolveTracks(t, 620, GAP, ROW_CASES[2].c.map(textW)), GAP);
  var b = trackOffsets(resolveTracks(t, 620, GAP, ROW_CASES[5].c.map(textW)), GAP);
  return JSON.stringify(a) !== JSON.stringify(b) && JSON.stringify(shortAt620) === JSON.stringify(longAt620);
});
mut('M14 the header re-declaring its own template', function () {
  return !/grid-template-columns/.test(headBlock) && TRACKS.length === 7;
});
mut('M15 the last-mile control losing its own grid track and hiding in the Method cell again', function () {
  return /replen-card__lastmile-cell/.test(rowFn) &&
    (extractFn(atHead('assets/js/pages/inventory-replenishment.js'), '_renderExecutionRoute')
      .indexOf('replen-card__lastmile-cell') === -1);
});
mut('M16 the ETA refresher forgetting to carry the row\'s chosen last mile', function () {
  var m = mutateFn(PAGE, '_irUpdateRouteEtas',
    "last_mile_delivery: _lmEl ? String(_lmEl.value || '').trim() : '',", "last_mile_delivery: '',");
  return /last_mile_delivery: ''/.test(extractFn(m, '_irUpdateRouteEtas')) &&
    /_lmEl \? String\(_lmEl\.value/.test(etaFn);
});
mut('M17 the save-target freeze answering from its own copy of the rule', function () {
  var freeze = extractFn(CENSUSC, 'RUN_R6R2_ROUTE_PROVENANCE');
  return /sadK4ResolveActiveDraft_\(headers, vh\)/.test(freeze) &&
    !/var ACTIVE = \{ draft: 1/.test(freeze);
});
mut('M18 a size bound dropping the very rows the freeze exists to report', function () {
  var trim = /if \(bytes > LIM\.max_output_bytes\) \{([\s\S]*?)\n    \}/.exec(CENSUSC)[1];
  return !/visible_route_rows|future_save_targets|ambiguous_save_targets/.test(trim) &&
    R.visible_route_rows.length === 2;
});

console.log('\n---------------------------------------------------------------');
console.log('passed ' + pass + '  failed ' + fail);
console.log('mutants caught ' + neg.caught + ' of ' + (neg.caught + neg.missed));
console.log('---------------------------------------------------------------');
if (fail) process.exit(1);
