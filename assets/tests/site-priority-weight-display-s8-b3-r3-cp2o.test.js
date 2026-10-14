// =============================================================================================================
// S8-B3-R3-CP2O-R1 — HOW A WEIGHT IS SHOWN
// -------------------------------------------------------------------------------------------------------------
// THE APPROVED RULE: at most two decimals, trailing zeros removed. `110.00000000000001` reads as `110`.
// Precision is raised ONLY where it must be — when two DIFFERENT weights in the SAME COMPANY would otherwise
// print the same string. Very small and very large values keep their exponent.
//
// WHAT THIS SUITE REPLACED, AND WHY. CP2O asserted that every display round-trips to its own exact value.
// That is a real property and it does make a fake tie impossible — and it is NOT the requirement. It also
// put `110.00000000000001` in a table cell, which is precisely what the rule exists to prevent. An invariant
// that is easy to state and easy to prove was substituted for the behaviour that was asked for, and the
// suite then certified the substitution. Round-tripping is therefore NOT an acceptance condition here. What
// is asserted is the rule: the short form by default, escalation only on a real collision, and an
// approximate display that is never presented as the stored value.
//
// SO A DISPLAY MAY BE APPROXIMATE. Where it is, the stored figure is still readable — in the cell's `title`,
// and in the sentences, which append the exact value rather than quoting a rounded one as what was stored.
//
// AND THE NUMBER STILL REACHES THE WRITER UNTOUCHED. §G drives a real drag and compares the captured payload
// bit for bit.
//
// Run: node assets/tests/site-priority-weight-display-s8-b3-r3-cp2o.test.js
// =============================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var PAGE_SRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/site-priority.js'), 'utf8');
var CODE = PAGE_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

// -------------------------------------------------------------------------------------------------------------
// DOM shim + page boot. innerHTML is recorded as TEXT and there is no layout, so every assertion is about
// WHAT THE PAGE EMITS and WHAT IT CALLS.
// -------------------------------------------------------------------------------------------------------------
function El(id) {
  this.id = id || ''; this.value = ''; this.hidden = false; this.textContent = ''; this.innerHTML = '';
  this.className = ''; this._attrs = {}; this._listeners = {};
  this.classList = { _s: {}, add: function (c) { this._s[c] = 1; }, remove: function (c) { delete this._s[c]; },
    contains: function (c) { return !!this._s[c]; } };
}
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; };
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
El.prototype.focus = function () { this._focused = true; };

function bootPage(opts) {
  opts = opts || {};
  var byId = {};
  ['site-priority-section', 'sp-status', 'sp-rows', 'sp-empty', 'sp-filter-company', 'sp-filter-country',
   'sp-refresh', 'sp-draft', 'sp-drag-help'].forEach(function (id) { byId[id] = new El(id); });
  var document_ = {
    addEventListener: function () {},
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  var calls = { upsert: [] };
  var win = {};
  var rstore = {};
  var refCache = {
    get: function (key, loader) {
      if (rstore[key]) return rstore[key];
      var pr = Promise.resolve().then(loader).catch(function (e) { delete rstore[key]; throw e; });
      rstore[key] = pr; return pr;
    },
    invalidate: function (key) { delete rstore[key]; },
    invalidateMany: function (ks) { (ks || []).forEach(function (k) { refCache.invalidate(k); }); },
    clear: function () { rstore = {}; }
  };
  win.KM = {
    lifecycle: { register: function (name, hooks) { win.KM._hooks = hooks; } },
    partialLoader: { loadPartial: function () { return Promise.resolve(true); } },
    countryIdentity: require(path.join(ROOT, 'assets', 'js', 'core', 'supply-planning-country-identity.js')),
    referenceCache: refCache,
    DB: {
      getMarketplaceReference: function () {
        return refCache.get('marketplaces', function () {
          (opts.rows || []).forEach(function (r) {
            if (!Object.prototype.hasOwnProperty.call(r, 'marketplaceId')) {
              r.marketplaceId = 'MKT-' + String(r.company) + '-' + String(r.country) + '-' + String(r.marketplace);
            }
          });
          return Promise.resolve((opts.rows || []).map(function (r) {
            var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; }); return c;
          }));
        });
      },
      setMarketplaceAllocationPriority: function (payload) {
        calls.upsert.push(payload);
        (opts.rows || []).forEach(function (r) {
          if (String(r.company) === payload.company && String(r.country) === payload.country
              && String(r.marketplace) === payload.marketplace) {
            r.allocationPriority = payload.allocation_priority;
          }
        });
        refCache.invalidate('marketplaces');
        return Promise.resolve({ outcome: 'CONFIRMED_COMMITTED', code: 'OK', message: '' });
      }
    }
  };
  var fn = new Function('window', 'document', 'console', 'CSS', 'KM', PAGE_SRC);
  fn(win, document_, { warn: function () {}, log: function () {} }, null, win.KM);
  return { win: win, byId: byId, calls: calls, api: win.KM.sitePriority, hooks: win.KM._hooks };
}
function html(b) { return b.byId['sp-rows'].innerHTML; }
function draftHtml(b) { return b.byId['sp-draft'].innerHTML; }
function statusText(b) { return b.byId['sp-status'].textContent + ' ' + b.byId['sp-status'].innerHTML; }

var P = bootPage({ rows: [] }).api;
var F = P.formatWeight;
var MAP = P.weightDisplayMap;
var TAIL = 110.00000000000001;     // the value the rule is written about
var NEARLY_THREE = 0.1 + 0.2;      // 0.30000000000000004

// =============================================================================================================
section('A. the default form — two decimals, trailing zeros gone');
// =============================================================================================================

ok(typeof F === 'function', 'A0 formatWeight is exported');
ok(typeof MAP === 'function', 'A0a and the company-scoped pass');

eq(F(TAIL), '110', 'A1 110.00000000000001 READS AS 110 — the case the rule is written about');
eq(F(110), '110', 'A1a and a real 110 reads the same way');
eq(F(0), '0', 'A2 zero is 0 — not 0.00, never blank');
eq(F(90), '90', 'A2a a whole number has no decimal point');
eq(F(70.5), '70.5', 'A2b one decimal keeps one');
eq(F(1.5), '1.5', 'A2c and toFixed(2)’s trailing zero is trimmed');
eq(F(0.25), '0.25', 'A2d two decimals print two');
eq(F(12.345), '12.35', 'A3 THREE decimals are ROUNDED to two — the short form is the default');
eq(F(0.044), '0.04', 'A3a including the drag midpoint, which is shown rounded');
eq(F(NEARLY_THREE), '0.3', 'A3b and a float tail reads as the number an operator expects');

// Two cases two decimals cannot express.
eq(F(1e-7), '1e-7', 'A4 a non-zero value NEVER prints as 0 — the exponent is kept');
eq(F(Number.MIN_VALUE), '5e-324', 'A4a including the smallest positive double');
eq(F(Number.MAX_VALUE), '1.7976931348623157e+308', 'A4b and the largest finite one stays 23 characters');
eq(F(1e21), '1e+21', 'A4c at the boundary where JS itself switches form');

eq(F(NaN), '', 'A5 NaN prints as nothing');
eq(F(Infinity), '', 'A5a Infinity too');
eq(F(null), '', 'A5b and a null weight');
eq(F('90'), '', 'A5c AND A STRING — this takes numbers, and a string arriving here is a bug');

// Approximation is DETECTED, not hidden.
eq(P.weightIsApprox(TAIL, '110'), true, 'A6 the page knows when a display is a rounded view');
eq(P.weightIsApprox(110, '110'), false, 'A6a and when it is the value');
eq(P.weightIsApprox(0.044, '0.04'), true, 'A6b');

// =============================================================================================================
section('B. WITHOUT a collision the short form stands — precision is not raised speculatively');
// =============================================================================================================

var m1 = MAP([TAIL, 90, 0, 70.5]);
eq(m1.text(TAIL), '110', 'B1 110.00000000000001 stays 110 when nothing else in the company collides with it');
eq(m1.approx(TAIL), true, 'B1a and is reported as approximate');
eq(m1.text(90), '90', 'B2 its neighbours are untouched');
eq(m1.text(0), '0', 'B2a');
eq(m1.text(70.5), '70.5', 'B2b');
eq(m1.approx(90), false, 'B2c and an exact one is not reported as approximate');

var m2 = MAP([0.044, 90]);
eq(m2.text(0.044), '0.04', 'B3 a midpoint with no collision also keeps the short form');
eq(m2.approx(0.044), true, 'B3a marked approximate');

// A single value is never escalated.
eq(MAP([NEARLY_THREE]).text(NEARLY_THREE), '0.3', 'B4 one value alone always gets the short form');

// =============================================================================================================
section('C. WITH a collision — and only the values that collide');
// =============================================================================================================

var c1 = MAP([110, TAIL, 90, 0]);
ok(c1.text(110) !== c1.text(TAIL),
  'C1 two weights that would both read 110 are separated', { a: c1.text(110), b: c1.text(TAIL) });
eq(c1.text(110), '110', 'C1a the exact one keeps the readable form');
eq(c1.text(TAIL), '110.00000000000001', 'C1b and the one that needs precision gets exactly enough');
eq(c1.approx(TAIL), false, 'C1c which is then no longer an approximation');
// THE REST OF THE COMPANY IS NOT PUNISHED FOR ONE AWKWARD PAIR.
eq(c1.text(90), '90', 'C2 an unrelated weight keeps its short form');
eq(c1.text(0), '0', 'C2a and so does zero');

var c2 = MAP([0.3, NEARLY_THREE, 90]);
ok(c2.text(0.3) !== c2.text(NEARLY_THREE),
  'C3 0.3 and 0.1+0.2 are distinguishable', { a: c2.text(0.3), b: c2.text(NEARLY_THREE) });
eq(c2.text(90), '90', 'C3a while the rest of the company is unaffected');

// The escalation is the MINIMUM that separates them, not a jump to full precision for everything.
var c3 = MAP([1.111, 1.112]);
eq(c3.text(1.111), '1.111', 'C4 three decimals is enough here, so three decimals is what is used');
eq(c3.text(1.112), '1.112', 'C4a');
ok(c3.text(1.111).length <= 5, 'C4b and not a seventeen-digit expansion', c3.text(1.111));

// Distinctness across the WHOLE company, not just within the colliding pair.
var c4 = MAP([110, TAIL, 110.5, 109.999]);
var seen = {}, dupes = [];
[110, TAIL, 110.5, 109.999].forEach(function (v) {
  var t = c4.text(v);
  if (seen[t]) dupes.push(t); seen[t] = 1;
});
eq(dupes.length, 0, 'C5 every weight in the company ends up with its own string', dupes);

// =============================================================================================================
section('D. the table — short form on screen, stored figure in reach');
// =============================================================================================================

var dDone = (function () {
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: TAIL },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 90 },
    { company: 'KM', country: 'JP', marketplace: 'Rakuten', allocationPriority: 0 },
    { company: 'KM', country: 'CA', marketplace: 'Walmart', allocationPriority: '' },
    { company: 'KM', country: 'FR', marketplace: 'Amazon', allocationPriority: -5 }
  ] });
  return b.hooks.mount().then(function () {
    var h = html(b);
    ok(h.indexOf('>110<') !== -1, 'D1 the tail weight is drawn as 110 — NOT as 110.00000000000001');
    ok(h.indexOf('110.00000000000001<') === -1, 'D1a the raw double is not the cell text');
    ok(h.indexOf('>90<') !== -1, 'D1b and an exact weight is drawn plainly');
    ok(h.indexOf('>0<') !== -1, 'D1c zero is drawn as 0');

    // THE STORED FIGURE IS STILL READABLE, and the title says which is which.
    ok(/title="Shown rounded\. Stored value: 110\.00000000000001"/.test(h),
      'D2 the rounded cell says it is rounded AND gives the stored value');
    ok(/title="90"/.test(h), 'D2a an exact cell simply carries its value');
    ok(h.indexOf('sp-pri--approx') !== -1, 'D2b and a rounded cell is marked as such');
    eq((h.match(/sp-pri--approx/g) || []).length, 1, 'D2c only the rounded one');

    // MISSING / INVALID are unchanged.
    ok(h.indexOf('sp-pri--none') !== -1, 'D3 a MISSING row still shows a dash, not a formatted zero');
    ok(h.indexOf('sp-badge--missing') !== -1, 'D3a badged Missing');
    ok(h.indexOf('sp-badge--invalid') !== -1, 'D3b and a NEGATIVE stored value is badged Invalid');
    ok(h.indexOf('>-5<') === -1, 'D3c with its value never drawn as a weight');
  });
}());

// A collision in the real table escalates there too.
var dColl = (function () {
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: TAIL },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 110 }
  ] });
  return b.hooks.mount().then(function () {
    var h = html(b);
    ok(h.indexOf('>110.00000000000001<') !== -1,
      'D4 when both 110s are present the colliding one is drawn at full precision');
    ok(h.indexOf('>110<') !== -1, 'D4a and the exact one still reads 110');
  });
}());

// =============================================================================================================
section('E. the preview, the "was" value and the move bar');
// =============================================================================================================

var eDone = (function () {
  /* Dropping between 0.048 and 0.04 proposes EXACTLY 0.044 - the midpoint of those two doubles lands on the
     0.044 literal, which is worth knowing rather than assuming: the 0.044000000000000004 the drag round
     named comes from a TOP placement (0.04 x 1.1), not from this midpoint.

     AND THE PROPOSAL COLLIDES WITH ITS OWN NEIGHBOUR AT TWO DECIMALS: 0.04 and 0.044 both read `0.04`. So
     the company pass escalates, which is exactly the case the rule exists for - a proposal that printed the
     same as the row above it would be unreadable. */
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 0.048 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 0.04 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 0.004 }
  ] });
  return b.hooks.mount().then(function () {
    var key = 'KM\u0001DE\u0001Amazon';
    ok(b.api._drag.beginLift(key, true), 'E0 (the row lifts)');
    b.api._drag.setSlot(1);
    var p = b.api._drag.currentProposal();
    ok(p.ok, 'E0a (the slot has a legal weight)', p);
    eq(String(p.value), '0.044', 'E0b (this midpoint is exactly 0.044)');

    // What the company pass says these weights read as, computed rather than guessed.
    var m = MAP([0.048, 0.04, 0.004, p.value]);
    eq(m.text(0.04), '0.04', 'E1 the neighbour keeps the short form');
    eq(m.text(p.value), '0.044', 'E1a and the PROPOSAL is escalated, because 0.04 would have read the same');
    ok(m.text(p.value) !== m.text(0.04), 'E1b so the two are distinguishable on screen');

    var live = draftHtml(b);
    ok(live.indexOf('Drop here to propose') !== -1, 'E2 the live bar offers a proposal');
    ok(live.indexOf('<strong>' + m.text(p.value) + '</strong>') !== -1,
      'E2a quoting it exactly as the table will draw it');

    b.api._drag.dropLift();
    var ready = draftHtml(b);
    ok(ready.indexOf('Proposed, not saved') !== -1, 'E3 the dropped bar says it is not saved');
    ok(ready.indexOf('would be stored as <strong>' + m.text(p.value) + '</strong>') !== -1,
      'E3a and names the weight in the same form', ready.slice(0, 220));
    // THIS proposal is exact, so no qualification is added - one is only owed when the figure is rounded.
    eq(m.approx(p.value), false, 'E3b (this proposal is exact)');
    ok(ready.indexOf('(exactly') === -1, 'E3c so nothing is appended that is not needed');
    ok(ready.indexOf('between ' + m.text(0.048) + ' and ' + m.text(0.04)) !== -1,
      'E3d and both neighbours are quoted in the same form', ready.slice(0, 260));

    var h = html(b);
    ok(h.indexOf('sp-pri--preview') !== -1, 'E4 the row draws a preview cell');
    ok(h.indexOf('>' + m.text(p.value) + '<') !== -1, 'E4a carrying the same form as the bar');
    ok(h.indexOf('was ' + m.text(0.004)) !== -1, 'E4b and the "was" value is formatted the same way');
    ok(h.indexOf('Not saved') !== -1, 'E4c badged as not saved');
    return { b: b, p: p, m: m };
  });
}());

// A proposal that IS approximate: a TOP placement multiplies by 1.1 and lands on a float tail.
var eApprox = (function () {
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 0.04 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 0.02 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 0.01 }
  ] });
  return b.hooks.mount().then(function () {
    b.api._drag.beginLift('KM\u0001DE\u0001Amazon', true);
    b.api._drag.setSlot(0);                       // above the current highest
    var p = b.api._drag.currentProposal();
    ok(p.ok, 'E5 (a top placement is legal here)', p);
    eq(String(p.value), '0.044000000000000004', 'E5a (0.04 x 1.1 lands on a float tail)');
    b.api._drag.dropLift();
    var ready = draftHtml(b);
    var m = MAP([0.04, 0.02, 0.01, p.value]);
    eq(m.text(p.value), '0.044', 'E6 it is escalated to three decimals, because 0.04 would have read the same');
    eq(m.approx(p.value), true, 'E6a and three decimals is STILL a rounded view of it');
    ok(ready.indexOf('would be stored as <strong>0.044</strong>') !== -1,
      'E7 the bar quotes the readable form');
    ok(ready.indexOf('(exactly 0.044000000000000004)') !== -1,
      'E7a AND states the exact value beside it — "would be stored as 0.044" alone would be false',
      ready.slice(0, 300));
    return { b: b, p: p };
  });
}());

// =============================================================================================================
section('F. the save read-back sentence');
// =============================================================================================================

var fDone = eDone.then(function (ctx) {
  var b = ctx.b, p = ctx.p;
  return b.api._drag.saveMove().then(function () {
    var s = statusText(b);
    ok(s.indexOf('Saved and VERIFIED') !== -1, 'F1 the save is verified by a fresh read');
    ok(s.indexOf('now has priority 0.044') !== -1, 'F1a the sentence quotes the weight', s.slice(0, 200));
    ok(s.indexOf('stored as') === -1,
      'F1b and adds no qualification, because this value is exact', s.slice(0, 200));
    return { b: b, p: p };
  });
});

// The rounded case must say which figure is which.
var fApprox = eApprox.then(function (ctx) {
  var b = ctx.b, p = ctx.p;
  return b.api._drag.saveMove().then(function () {
    var s = statusText(b);
    ok(s.indexOf('now has priority 0.04') !== -1, 'F2 the sentence quotes the readable form', s.slice(0, 200));
    ok(s.indexOf('(stored as 0.044000000000000004)') !== -1,
      'F2a AND names the exact stored value — a rounded figure is never called what was stored',
      s.slice(0, 240));
  });
});

// =============================================================================================================
section('G. the WRITER receives the number, unchanged');
// =============================================================================================================

var gDone = fDone.then(function (ctx) {
  var b = ctx.b, p = ctx.p;
  eq(b.calls.upsert.length, 1, 'G1 exactly one write was dispatched');
  var payload = b.calls.upsert[0];
  eq(typeof payload.allocation_priority, 'number', 'G2 the payload carries a NUMBER');
  ok(payload.allocation_priority === p.value, 'G2a bit-for-bit the proposed value',
    { sent: String(payload.allocation_priority), proposed: String(p.value) });
  eq(payload.allocation_priority, 0.044, 'G2b the exact proposed double, not a parsed display string');
  eq(payload.expected_allocation_priority_state, 'SET', 'G3 the CAS names the previous state');
  eq(typeof payload.expected_allocation_priority, 'number', 'G3a and carries it as a NUMBER');
  eq(payload.expected_allocation_priority, 0.004, 'G3b exactly as read');
});

// =============================================================================================================
section('H. what the format must not have touched');
// =============================================================================================================

var hDone = (function () {
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 100 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 90 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 9 }
  ] });
  return b.hooks.mount().then(function () {
    var h = html(b);
    var iUS = h.indexOf('KM\u0001US\u0001Amazon'), iGB = h.indexOf('KM\u0001GB\u0001Amazon'), iDE = h.indexOf('KM\u0001DE\u0001Amazon');
    ok(iUS < iGB && iGB < iDE, 'H1 100 > 90 > 9 — numeric order, not the lexical order of display text',
      { iUS: iUS, iGB: iGB, iDE: iDE });
  });
}());

eq(typeof P.midpoint(0.04, 0.048), 'number', 'H2 midpoint still returns a number');
eq(typeof P.proposeWeight(0.048, 0.04).value, 'number', 'H2a proposeWeight still returns a number');
eq(P.proposeWeight(null, null).ok, false, 'H2b and still refuses with no basis');
eq(P.proposeWeight(0, null).ok, false, 'H2c and still refuses below zero');
eq(P.TOP_FACTOR, 1.1, 'H3 the factors are unchanged');
eq(P.BOTTOM_FACTOR, 0.9, 'H3a');
eq(P.classify(0).state, 'SET', 'H4 zero is still a VALID weight');
eq(P.classify('').state, 'MISSING', 'H4a blank is still MISSING');
eq(P.classify(-5).state, 'INVALID', 'H4b a negative is still INVALID');

/* S8-B3-R3-CP2O-R1 - AND WHAT AN ACCEPTANCE LIST MAY NOT PROMISE ABOUT GARBLED TEXT.
   `classify` is this page's reading of whatever it is handed, and handed the string 'abc' it answers
   INVALID. That is NOT what an operator sees, because the shipped browser normalizer collapses an
   unparseable cell to `null` BEFORE the page is given it - so the row arrives as MISSING, reads as
   Missing, and carries a live drag handle. The refusal is real and it happens at the SERVER.
   A checklist that promises an Invalid badge for a garbled cell promises something that never appears,
   and would then report a working safeguard as broken. Pinned here so it cannot be written again. */
eq(P.classify('abc').state, 'INVALID', 'H4c classify() alone reads unparseable TEXT as INVALID');
eq(P.classify(null).state, 'MISSING', 'H4d but the normalizer hands this page `null` for such a cell');
eq(P.classify(null).value, null, 'H4d1 with no value');
var NORM = fs.readFileSync(path.join(ROOT, 'assets/js/api/operation-system-db-api.js'), 'utf8');
ok(/var allocationPriority = \(apNum !== null && isFinite\(apNum\)\) \? apNum : null;/.test(NORM),
  'H4e — which is the shipped normalizer’s own line, not an assumption');

// The EDIT control carries the RAW value — it is what an operator types against.
ok(/value="' \+ esc\(c\.state === 'SET' \? String\(c\.value\) : ''\) \+ '"/.test(CODE),
  'H5 the Edit input still carries the raw stored value');

// Formatted text reaches no payload, no CAS, no comparator, no arithmetic.
var payloadStart = CODE.indexOf('var payload = {');
var casLine = 'if (before.state === \'SET\') payload.expected_allocation_priority = before.value;';
var payloadEnd = CODE.indexOf(casLine, payloadStart);
ok(payloadStart > -1 && payloadEnd > payloadStart, 'H6pre (payload landmarks resolve in order)');
var payloadBlock = CODE.slice(payloadStart, payloadEnd + casLine.length);
ok(payloadBlock.indexOf('allocation_priority: v.value') !== -1, 'H6 (it really is the payload)');
ok(payloadBlock.indexOf('formatWeight') === -1 && payloadBlock.indexOf('weightDisplayMap') === -1,
  'H6a the payload block never formats');
var cmpBlock = CODE.slice(CODE.indexOf('function displayOrder'), CODE.indexOf('function displayOrder') + 900);
ok(cmpBlock.indexOf('formatWeight') === -1, 'H6b nor does the ordering comparator');
var ruleBlock = CODE.slice(CODE.indexOf('function proposeWeight'), CODE.indexOf('function proposeWeight') + 2500);
ok(ruleBlock.indexOf('formatWeight') === -1, 'H6c nor the weight rule');
ok(CODE.indexOf('Number(formatWeight') === -1 && CODE.indexOf('Number(dmap.text') === -1,
  'H6d and nothing parses a formatted string back into a number');

// No batch, no autosave, no renumbering was introduced.
ok(CODE.indexOf('setMarketplaceAllocationPriority') !== -1, 'H7 (the single writer is present)');
eq((CODE.match(/db\.setMarketplaceAllocationPriority\(payload\)/g) || []).length, 1,
  'H7a dispatched from exactly ONE place — no batch loop');
ok(!/forEach[\s\S]{0,200}setMarketplaceAllocationPriority/.test(CODE),
  'H7b and never from inside an iteration');

// =============================================================================================================
Promise.all([dDone, dColl, eDone, eApprox, fDone, fApprox, gDone, hDone]).then(function () {
  console.log('\n----------------------------------------');
  console.log('SITE PRIORITY WEIGHT DISPLAY (S8-B3-R3-CP2O-R1): ' + pass + ' passed, ' + fail + ' failed');
  if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
  if (fail > 0) process.exitCode = 1;
}).catch(function (e) {
  console.error('FAIL harness error: ' + (e && e.stack || e));
  process.exitCode = 1;
});
