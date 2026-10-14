// =============================================================================================================
// S8-B3-R3-CP2M-R4 — DRAG TO REORDER: THE RULE, THE DRAFT, AND THE SAVE
// -------------------------------------------------------------------------------------------------------------
// Three rounds of proposal preceded this one and NONE of them built anything, so this suite is the first time
// the rule exists as something that can be run. What it checks splits cleanly in two, and the split is the
// honest part:
//
//   THE RULE IS ARITHMETIC and is tested as arithmetic. "A weight strictly between its neighbours" is a
//   numeric claim, so the boundary cases are numbers, not screenshots: a product that cannot escape zero, a
//   midpoint that overflows the obvious formula, a factor that fails to move a denormal at all. Section A
//   runs those against the shipped functions.
//
//   THE GESTURE IS LAYOUT and is NOT tested here. There is no jsdom; `getBoundingClientRect` would return
//   zeros, so a pointer path driven through this shim would prove only that the shim returns zeros. The node
//   suite therefore drives lift / move / drop through the same functions the pointer and keyboard handlers
//   call, and the REAL mouse, touch and keyboard gestures are exercised against a real browser by
//   `_cp2m-r2-viewport-runner.js`, whose evidence section R asserts. Neither one stands in for the other.
//
// WHAT THE PAGE MAY NOT DO, asserted as hard as what it must: no renumbering, no neighbour writes, no second
// writer, no Missing backfill, no value invented for a position that has none, and no claim that an
// unconfirmed write was saved.
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return require('./_read-source.js').readSource(ROOT, rel); }

var pass = 0, fail = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) { ok(a === b, label + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var PAGE_SRC = read('assets/js/pages/site-priority.js');
// COMMENTS ARE NOT CODE, and this suite walked into that trap three times before this line existed: the
// header explains WHY `TOP_FROM_ZERO = 1.0` and the 0.01 floor were not adopted, and a grep over the whole
// file read each explanation as the violation it was describing. Every "this must not appear" check below
// runs against CODE, never against PAGE_SRC.
var CODE = PAGE_SRC.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var HTML_SRC = read('assets/html/pages/site-priority.html');
var CSS_SRC = read('assets/css/pages/site-priority.css');

// -------------------------------------------------------------------------------------------------------------
// DOM SHIM. Deliberately the same shape as the S8-B2-R1 suite's: it records innerHTML as TEXT and has no
// layout. Every assertion below is therefore about WHAT THE PAGE EMITS and WHAT IT CALLS.
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
El.prototype.listenerCount = function (t) { return (this._listeners[t] || []).length; };
El.prototype.fire = function (t, ev) {
  var ls = this._listeners[t] || [];
  for (var i = 0; i < ls.length; i++) ls[i](ev);
  return ls.length;
};
El.prototype.focus = function () { this._focused = true; };

function makeDom() {
  var byId = {};
  ['site-priority-section', 'sp-status', 'sp-rows', 'sp-empty', 'sp-filter-company', 'sp-filter-country',
   'sp-refresh', 'sp-draft', 'sp-drag-help'].forEach(function (id) { byId[id] = new El(id); });
  var extra = [];
  var docListeners = {};
  return {
    byId: byId, extra: extra, docListeners: docListeners,
    document: {
      addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
      getElementById: function (id) { return byId[id] || null; },
      querySelector: function (sel) {
        for (var i = 0; i < extra.length; i++) if (extra[i]._sel === sel) return extra[i];
        return null;
      },
      querySelectorAll: function (sel) {
        return extra.filter(function (e) { return e._sel === sel || (sel === '[data-sp-input]' && e._isInput); });
      }
    }
  };
}

function bootPage(opts) {
  opts = opts || {};
  var dom = makeDom();
  var calls = { upsert: [], refLoads: 0, invalidate: [], pendingReads: [] };
  var win = {};
  var rstore = {};
  var refCache = {
    get: function (key, loader) {
      if (rstore[key]) return rstore[key];
      var pr = Promise.resolve().then(loader).catch(function (e) { delete rstore[key]; throw e; });
      rstore[key] = pr;
      return pr;
    },
    invalidate: function (key) { calls.invalidate.push(key); delete rstore[key]; },
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
          calls.refLoads++;
          if (opts.readThrowsFrom !== undefined && calls.refLoads >= opts.readThrowsFrom) {
            return Promise.reject(new Error('reference unreadable'));
          }
          (opts.rows || []).forEach(function (r) {
            if (!Object.prototype.hasOwnProperty.call(r, 'marketplaceId')) {
              r.marketplaceId = 'MKT-' + String(r.company) + '-' + String(r.country) + '-' + String(r.marketplace);
            }
          });
          // A SNAPSHOT, so a test that edits `opts.rows` between loads produces a genuinely different answer
          // on the next load — which is how "the neighbour changed under you" is staged.
          var snap = (opts.rows || []).map(function (r) {
            var c = {}; Object.keys(r).forEach(function (k) { c[k] = r[k]; }); return c;
          });
          if (opts.manualReads) {
            return new Promise(function (res, rej) {
              calls.pendingReads.push({ resolve: function () { res(snap); }, reject: rej });
            });
          }
          return Promise.resolve(snap);
        });
      },
      setMarketplaceAllocationPriority: function (payload) {
        calls.upsert.push(payload);
        // A COMMITTED WRITE ACTUALLY CHANGES THE DATA. A stub that accepted the write and left the rows
        // alone would make every read-back a VALUE_MISMATCH, so the suite would "pass" its failure paths and
        // never once exercise the success one.
        function applyIt() {
          (opts.rows || []).forEach(function (r) {
            if (String(r.company) === payload.company && String(r.country) === payload.country
                && String(r.marketplace) === payload.marketplace) {
              r.allocationPriority = payload.allocation_priority;
            }
          });
          if (opts.onUpsert) opts.onUpsert(payload);
        }
        if (opts.writeOutcome) {
          var o = opts.writeOutcome;
          // `applyAnyway` is the case the whole OUTCOME_UNKNOWN design exists for: the write LANDED and the
          // ANSWER was lost. It is not a contradiction, it is the situation nobody can tell apart from a
          // total failure, and it has to be stageable.
          if (o.outcome === 'CONFIRMED_COMMITTED' || opts.applyAnyway) {
            applyIt();
            refCache.invalidate('marketplaces');
          }
          return Promise.resolve(o);
        }
        applyIt();
        refCache.invalidate('marketplaces');
        return Promise.resolve({ outcome: 'CONFIRMED_COMMITTED', code: 'OK', message: '' });
      }
    }
  };
  var code = fs.readFileSync(path.join(ROOT, 'assets/js/pages/site-priority.js'), 'utf8');
  var fn = new Function('window', 'document', 'console', 'CSS', 'KM', code);
  fn(win, dom.document, { warn: function () {}, log: function () {} }, null, win.KM);
  return { win: win, dom: dom, calls: calls, opts: opts, api: win.KM.sitePriority, hooks: win.KM._hooks };
}

// The fixture is the proposal's §3 table, so the test cases and the design document describe one list.
function FIXTURE() {
  return [
    { company: 'KitchenMama', country: 'US', marketplace: 'Amazon',  allocationPriority: 100 },
    { company: 'KitchenMama', country: 'GB', marketplace: 'Amazon',  allocationPriority: 80 },
    { company: 'KitchenMama', country: 'DE', marketplace: 'Amazon',  allocationPriority: 80 },
    { company: 'KitchenMama', country: 'JP', marketplace: 'Rakuten', allocationPriority: 0 },
    { company: 'KitchenMama', country: 'CA', marketplace: 'Walmart', allocationPriority: '' },
    { company: 'ResourceUS',  country: 'US', marketplace: 'Amazon',  allocationPriority: 50 },
    // INVALID IS A NEGATIVE HERE, AND THAT IS A CORRECTION. The first version of this fixture used
    // '7abc', which `classify` does read as INVALID -- but NO REAL READ CAN PRODUCE IT. The shipped
    // normalizer in operation-system-db-api.js collapses an unparseable cell to null before the page
    // ever sees it, so '7abc' arrives as MISSING. The BROWSER capture is what caught this: the row was
    // drawn with a drag handle, as a site waiting for its first priority, in a suite that was asserting
    // it had none. A negative IS preserved by that normalizer, by its own explicit decision, so it is
    // the only INVALID the real read path delivers. A fixture that only a hand can produce tests a
    // state the application does not have.
    { company: 'ResourceUS',  country: 'US', marketplace: 'eBay',    allocationPriority: -5 }
  ];
}
var K = {
  us:   'KitchenMama\u0001US\u0001Amazon',
  gb:   'KitchenMama\u0001GB\u0001Amazon',
  de:   'KitchenMama\u0001DE\u0001Amazon',
  jp:   'KitchenMama\u0001JP\u0001Rakuten',
  ca:   'KitchenMama\u0001CA\u0001Walmart',
  rus:  'ResourceUS\u0001US\u0001Amazon',
  ebay: 'ResourceUS\u0001US\u0001eBay'
};

function html(b) { return b.dom.byId['sp-rows'].innerHTML; }
function bar(b) { return b.dom.byId['sp-draft'].innerHTML; }
function status(b) { return b.dom.byId['sp-status'].textContent; }
// The identities of the ordered rows, in the order the page emitted them.
function rowOrder(b) {
  var out = [], re = /data-sp-row="([^"]*)"/g, m;
  while ((m = re.exec(html(b)))) out.push(m[1].replace(/&#1;|\u0001/g, '\u0001'));
  return out;
}

var T = [];                       // the async test queue, run in order at the bottom
function test(name, fn) { T.push({ name: name, fn: fn }); }

// =============================================================================================================
section('A. THE RULE IS ARITHMETIC — every position, and every boundary a double has');

var P = bootPage({ rows: [] }).api;
var PW = P.proposeWeight;

// ---- the three positions, on ordinary numbers
eq(PW(100, 80).value, 90, 'A1 MIDDLE — between 100 and 80 the weight is the midpoint, 90');
eq(PW(100, 80).basis, 'MIDDLE', 'A1a and it is reported as a midpoint');
eq(PW(null, 100).value, 110.00000000000001, 'A2 TOP — above a leader of 100 the weight is 100 x 1.1');
eq(PW(null, 100).basis, 'TOP', 'A2a and it is reported as a top placement');
eq(PW(20, null).value, 18, 'A3 BOTTOM — below a last place of 20 the weight is 20 x 0.9');
eq(PW(20, null).basis, 'BOTTOM', 'A3a and it is reported as a bottom placement');

// THE TOP RULE IS PURE. Rev 1 and Rev 2 carried a `+1` minimum that silently took over below hi = 10, so
// "ten percent above the leader" was false at every small magnitude. D3 removed it; this is that removal
// stated as numbers rather than as prose.
eq(PW(null, 10).value, 11, 'A4 at hi = 10 the top is exactly 11');
eq(PW(null, 5).value, 5.5, 'A4a at hi = 5 it is 5.5, NOT 6 — the +1 minimum is gone');
eq(PW(null, 1).value, 1.1, 'A4b at hi = 1 it is 1.1, NOT 2');
eq(PW(null, 0.5).value, 0.55, 'A4c at hi = 0.5 it is 0.55 — the 0..1 range is usable (D4)');

// THE BOTTOM RULE IS PURE TOO, which is the change this round makes to Rev 3. Rev 3's `lo - max(1, lo x 0.1)`
// still carried the very term D3 had removed from the top; both ends now use one factor.
eq(PW(5, null).value, 4.5, 'A5 at lo = 5 the bottom is 4.5, NOT 4 — no `max(1, ...)` term survives');
eq(PW(0.5, null).value, 0.45, 'A5a at lo = 0.5 it is 0.45, and never clamps to 0');
ok(PW(0.5, null).value > 0, 'A5b so a bottom placement below 1 is a real weight, not a collapse to zero');

// ---- the two ends that multiplication cannot escape
eq(PW(null, 0).ok, false, 'A6 TOP from a leader of 0 is REFUSED — 0 x 1.1 is 0, which is not above 0');
eq(PW(null, 0).code, 'TOP_FROM_ZERO', 'A6a with its own code');
ok(/explicitly/i.test(PW(null, 0).reason), 'A6b and it says to set a value explicitly');
// AND THE REFUSAL IS THE POINT. Rev 3 decided a named constant TOP_FROM_ZERO = 1.0 for this case; Owner
// withdrawn in R4 as never having been approved. A page that filled in 1.0 here would be inventing a weight
// nobody expressed — and Rev 3 listing it as decided did not make it one.
// TOP_FROM_ZERO SURVIVES AS THE NAME OF THE REFUSAL, which is the exact opposite of what Rev 3 named it:
// there it was a constant holding 1.0, here it is the code for declining to invent one. The assertion is
// therefore about what it is ASSIGNED, not about whether the string appears.
ok(/code:\s*'TOP_FROM_ZERO'/.test(CODE), 'A6c TOP_FROM_ZERO exists only as a REFUSAL code');
ok(!/TOP_FROM_ZERO\s*=/.test(CODE), 'A6c1 and is never assigned a value — it is not a constant any more');
ok(!/\b(DEFAULT|FALLBACK)[A-Z_]*\s*=\s*1(\.0)?\b/.test(CODE), 'A6d and no default weight is declared under any name');
eq(PW(0, null).ok, false, 'A7 BOTTOM below a last place of 0 is REFUSED — nothing is below zero');
eq(PW(0, null).code, 'BOTTOM_AT_ZERO', 'A7a with its own code');
eq(PW(null, null).ok, false, 'A8 with NO comparison basis at all the drag is REFUSED');
eq(PW(null, null).code, 'NO_BASIS', 'A8a rather than defaulted to anything');

// ---- equal neighbours
eq(PW(80, 80).ok, false, 'A9 between two sites at the SAME weight there is no weight — REFUSED');
eq(PW(80, 80).code, 'EQUAL_NEIGHBOURS', 'A9a and the code names the cause');
ok(PW(80, 80).reason.indexOf('80') !== -1, 'A9b and the message quotes the weight that is duplicated');

// ---- 0.04 -> 0.044, THE CASE REV 3 COULD NOT RESOLVE
// U4 existed ONLY because Rev 2/Rev 3 rounded to 2dp before the bracket check: 0.044 rounded back to 0.04.
// R4 does not adopt the rounding, so the case is not resolved by choosing one of its three candidate fixes —
// it stops existing. This asserts the SPECIFIC number, because "it works now" is what a rounding bug says too.
var t29 = PW(null, 0.04);
eq(t29.ok, true, 'A10 T29 — a top placement above 0.04 now ACCEPTS');
eq(t29.value, 0.044000000000000004, 'A10a at 0.044000000000000004, the unrounded double');
ok(t29.value > 0.04, 'A10b which is STRICTLY above 0.04 — the property the rounding destroyed');
eq(Number(t29.value.toFixed(2)), 0.04, 'A10c and rounding it to 2dp WOULD have collapsed it — U4, reproduced');
/* S8-B3-R3-CP2O - A10d IS SCOPED TO THE RULE, WHICH IS WHAT THE SENTENCE WAS ALWAYS ABOUT, AND IT IS THE
   THIRD TIME THIS REPOSITORY HAS MADE THE SAME MISTAKE IN A GATE (E2, G4, G6 before it): a statement about
   ONE function written as a statement about the WHOLE FILE.

   What A10d means is that the WEIGHT RULE must not round - rounding to 2dp is precisely what collapsed
   0.044 back to 0.04 and created U4. That is still asserted, now where it is true.

   CP2O adds a DISPLAY formatter that calls toFixed(2) to decide whether two decimals ARE the value. It is
   not a computed weight and never becomes one: nothing parses its output back, and §A10f pins that. The old
   form would have failed this round while its own sentence stayed true. */
var RULE_SRC = CODE.slice(CODE.indexOf('function proposeWeight'), CODE.indexOf('function displayOrder'));
ok(RULE_SRC.length > 400, 'A10d0 (the weight rule was located in the source)', RULE_SRC.length);
ok(RULE_SRC.indexOf('proposeWeight') !== -1 && RULE_SRC.indexOf('midpoint') !== -1,
  'A10d1 (and it contains both the proposal and the midpoint)');
ok(!/toFixed|Math\.round/.test(RULE_SRC), 'A10d and no rounding of a computed weight exists in the RULE');
/* The ONE place rounding may appear, and it is display-only. CP2O-R1 moved the toFixed into
   `weightFormAt(n, dp)`, which the display path calls with 2 by default and with a higher dp ONLY when two
   weights in a company would otherwise print the same string. The landmark is the function, not the literal
   `toFixed(2)` - pinning the literal was a pin on how the rounding is spelled rather than on where it
   lives. */
var FMT_SRC = CODE.slice(CODE.indexOf('function weightFormAt'), CODE.indexOf('function validateInput'));
ok(FMT_SRC.indexOf('n.toFixed(dp)') !== -1, 'A10e the display formatter is the one place rounding happens');
ok(/formatWeight[\s\S]{0,200}weightFormAt\(n, 2\)/.test(FMT_SRC),
  'A10e0 and two decimals is its default');
eq((CODE.match(/toFixed/g) || []).length, 1, 'A10e1 and it is the ONLY toFixed in the page');
eq((CODE.match(/Math\.round/g) || []).length, 0, 'A10e2 with no Math.round anywhere at all');
ok(CODE.indexOf('Number(formatWeight') === -1,
  'A10f and nothing parses the formatted text back into a number, so it can never re-enter the arithmetic');

// ---- the very small end, where a factor stops moving a number at all
eq(PW(null, Number.MIN_VALUE).ok, false,
  'A11 a top placement above the smallest double is REFUSED — MIN_VALUE x 1.1 rounds back onto MIN_VALUE');
eq(PW(null, Number.MIN_VALUE).code, 'INDISTINGUISHABLE', 'A11a as indistinguishable, not as success');
eq(PW(Number.MIN_VALUE, null).ok, false, 'A12 and a bottom placement below it is REFUSED for the same reason');
eq(PW(Number.MIN_VALUE, null).code, 'INDISTINGUISHABLE', 'A12a with the same code');
// THE TRAP THIS CATCHES: "multiplying a positive number by 1.1 increases it" is false at the bottom of the
// range, so a top rule that trusted its own formula would store a weight equal to the one it must beat.
eq(Number.MIN_VALUE * 1.1, Number.MIN_VALUE, 'A12b (the premise, verified rather than asserted)');

// ---- adjacent doubles: a gap with nothing in it
var succ80 = 80 + Math.pow(2, Math.floor(Math.log(80) / Math.LN2) - 52);
ok(succ80 > 80, 'A13 (the premise) 80 has a representable successor');
eq(PW(succ80, 80).ok, false, 'A13a between two ADJACENT doubles there is no midpoint — REFUSED');
eq(PW(succ80, 80).code, 'INDISTINGUISHABLE', 'A13b as indistinguishable');
// AND THIS IS WHAT REPLACES REV 3's 0.01 DEPLETION FLOOR. The floor was a guess at where usefulness ends;
// this is the actual point at which the number system runs out, and it needs no constant.
ok(CODE.indexOf('0.01') === -1, 'A13c no 0.01 minimum-gap constant exists in the code');

// ---- overflow
eq(PW(null, Number.MAX_VALUE).ok, false, 'A14 a top placement above the largest double OVERFLOWS — REFUSED');
eq(PW(null, Number.MAX_VALUE).code, 'NOT_FINITE', 'A14a and is reported as not finite, never stored as Infinity');
eq(Number.MAX_VALUE * 1.1, Infinity, 'A14a1 (the premise, verified)');
// THE MIDPOINT MUST SURVIVE WHERE THE OBVIOUS FORMULA DOES NOT. `(hi + lo) / 2` forms a SUM that is
// unrepresentable even when the ANSWER is perfectly representable.
var bigHi = Number.MAX_VALUE, bigLo = Number.MAX_VALUE / 1.0000001;
eq((bigHi + bigLo) / 2, Infinity, 'A15 (the premise) the naive midpoint of two large weights is Infinity');
var big = PW(bigHi, bigLo);
eq(big.ok, true, 'A15a the shipped midpoint still ACCEPTS there');
ok(big.value > bigLo && big.value < bigHi, 'A15b and lands strictly between them', big.value);
eq(P.midpoint(bigLo, bigHi), big.value, 'A15c because it is computed as lo + (hi - lo) / 2');
ok(/lo\s*\+\s*\(\s*hi\s*-\s*lo\s*\)\s*\/\s*2/.test(PAGE_SRC), 'A15d which is the form in the source');
ok(!/\(\s*hi\s*\+\s*lo\s*\)\s*\/\s*2|\(\s*lo\s*\+\s*hi\s*\)\s*\/\s*2/.test(CODE),
  'A15e and the overflowing form appears nowhere in the code');

// ---- non-finite and negative neighbours are refused rather than coerced
[Infinity, -Infinity, NaN, -1].forEach(function (bad, i) {
  eq(PW(bad, null).ok, false, 'A16.' + i + ' a non-storable neighbour (' + bad + ') refuses rather than coerces');
});
eq(PW(NaN, null).code, 'NEIGHBOUR_UNUSABLE', 'A16a with a code naming the neighbour, not the result');
eq(P.isStorableWeight(0), true, 'A17 0 IS storable — the lowest valid weight (§45.A, D4)');
eq(P.isStorableWeight(-0.0001), false, 'A17a a negative is not');
eq(P.isStorableWeight(Infinity), false, 'A17b nor is a non-finite value');

// ---- EVERY accepted result satisfies the position it claims. A sweep, so no case is accepted by accident.
var sweepBad = 0, sweepN = 0;
[0, 0.001, 0.04, 0.5, 1, 1.5, 2, 7, 10, 80, 100, 1e6, 1e300].forEach(function (lo) {
  [0, 0.001, 0.04, 0.5, 1, 1.5, 2, 7, 10, 80, 100, 1e6, 1e300].forEach(function (hi) {
    [[null, hi], [lo, null], [hi, lo]].forEach(function (pair) {
      var r = PW(pair[0], pair[1]);
      sweepN++;
      if (!r.ok) return;
      if (!isFinite(r.value) || r.value < 0) { sweepBad++; return; }
      if (pair[0] !== null && !(r.value < pair[0])) sweepBad++;
      else if (pair[1] !== null && !(r.value > pair[1])) sweepBad++;
    });
  });
});
ok(sweepN > 400, 'A18 the sweep really ran', sweepN);
eq(sweepBad, 0, 'A18a across every pair, NO accepted weight fails the position it was computed for');

// =============================================================================================================
section('B. ORDER — highest weight first, within a company, with a tie-break that does not move');

var ord = P.displayOrder;
var r = function (co, ct, mk, p) { return { company: co, country: ct, marketplace: mk, allocationPriority: p }; };
ok(ord(r('A', 'US', 'X', 10), r('A', 'US', 'Y', 5)) < 0, 'B1 a higher weight sorts first');
ok(ord(r('A', 'US', 'X', 5), r('A', 'US', 'Y', 10)) > 0, 'B1a and a lower weight after');
ok(ord(r('A', 'US', 'X', 0), r('A', 'US', 'Y', 0.5)) > 0, 'B2 0 sorts below 0.5 — it is a weight, not an absence');
ok(ord(r('A', 'ZZ', 'X', 80), r('A', 'AA', 'Y', 80)) > 0, 'B3 EQUAL weights break by canonical identity');
// A TIE-BREAK THAT IS A TOTAL ORDER, not "whatever the sheet returned". `Array.prototype.sort` is only
// guaranteed stable from ES2019, and stability would anchor equal weights to the read order — which moves
// whenever someone inserts a row above them, swapping two sites on screen for no reason of their own.
eq(ord(r('A', 'US', 'X', 80), r('A', 'US', 'X', 80)), 0, 'B3a identical identities compare equal');
ok(ord(r('A', 'US', 'X', 1), r('B', 'US', 'Y', 1000)) < 0, 'B4 company leads everything — bands never interleave');
ok(ord(r('A', 'US', 'X', null), r('A', 'US', 'Y', 0)) > 0, 'B5 a MISSING row sorts AFTER every weighted row');
ok(ord(r('A', 'US', 'X', 'junk'), r('A', 'US', 'Y', 0)) > 0, 'B5a and so does an INVALID one');
eq(P.isOrdered(r('A', 'US', 'X', 0)), true, 'B6 0 has a position');
eq(P.isOrdered(r('A', 'US', 'X', null)), false, 'B6a MISSING does not');
eq(P.isOrdered(r('A', 'US', 'X', '7abc')), false, 'B6b INVALID does not');
eq(P.weightOf(r('A', 'US', 'X', null)), null, 'B6c and a MISSING row yields no weight to compare');

// =============================================================================================================
test('C. RENDER — the list is ordered, grouped, and says what cannot be dragged', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    var o = rowOrder(b);
    eq(o.length, 7, 'C1 every fixture row is rendered');
    eq(o[0], K.us, 'C2 KitchenMama leads with its highest weight (100)');
    eq(o[1], K.de, 'C2a then the FIRST of the two 80s by identity — DE before GB');
    eq(o[2], K.gb, 'C2b then the second');
    eq(o[3], K.jp, 'C2c then 0, which is last among the weighted rows but still one of them');
    eq(o[4], K.ca, 'C2d then the MISSING row, outside the order');
    eq(o[5], K.rus, 'C3 and ResourceUS forms its own band');
    eq(o[6], K.ebay, 'C3a with its INVALID row unordered');

    var h = html(b);
    ok(h.indexOf('No priority set') !== -1, 'C4 the unordered rows have their own sub-heading');
    eq((h.match(/data-sp-unset=/g) || []).length, 2, 'C4a one per company that has any');
    ok(/data-sp-grip="KitchenMama\u0001US\u0001Amazon"/.test(h) || h.indexOf('data-sp-grip') !== -1,
      'C5 ordered rows carry a drag handle');
    eq((h.match(/data-sp-grip=/g) || []).length, 5,
      'C5a five of them: four KitchenMama (incl. the MISSING one, which may be dragged IN) and one ResourceUS');
    // THE INVALID ROW HAS NO HANDLE, and that is a decision rather than an oversight: placing it would mean
    // choosing what its unreadable value was supposed to be.
    ok(h.indexOf('data-sp-grip="ResourceUS\u0001US\u0001eBay"') === -1, 'C6 the INVALID row has NO handle');
  // THE NORMALIZER IS THE REASON THIS FIXTURE USES -5, pinned here so it cannot quietly drift back to a
  // shape the reader cannot deliver.
  var NORM = read('assets/js/api/operation-system-db-api.js');
  ok(NORM.indexOf('(apNum !== null && isFinite(apNum)) ? apNum : null') !== -1,
    'C6d the shipped reader NULLS an unparseable priority, so text never reaches this page as INVALID');
  ok(/A NEGATIVE value is preserved, not clamped and not nulled/.test(NORM),
    'C6e while a NEGATIVE is preserved - the only INVALID a real read can deliver');
  eq(P.classify(-5).state, 'INVALID', 'C6f and the page reads a negative as INVALID');
  eq(P.classify(null).state, 'MISSING',
    'C6g while the nulled text reads as MISSING - so an unreadable cell is offered a FIRST SET, not a repair');
    ok(/sp-grip--off/.test(h), 'C6a it shows a disabled handle instead of nothing at all');
    ok(/cannot be read as a priority/.test(h), 'C6b carrying the reason');
    ok(/colspan="7"/.test(h), 'C7 the group bands span the new handle column');
    eq((h.match(/sp-rank/g) || []).length, 5, 'C8 the five ordered rows show their rank; the unordered do not');
  });
});

// =============================================================================================================
test('D. LIFT AND DROP — a drop is a PROPOSAL, and proposes exactly one row', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    // JP (0) to the TOP of KitchenMama: the ordered list without JP is 100, 80, 80.
    eq(b.api._drag.beginLift(K.jp, true), true, 'D1 the row lifts');
    eq(b.api._state().move.live, true, 'D1a and is marked live — nothing is written by lifting');
    eq(b.api._state().move.origRank, 3, 'D1b the lift remembers where it started');
    b.api._drag.setSlot(1);
    var p = b.api._drag.currentProposal();
    eq(p.ok, true, 'D2 slot 1 — between 100 and 80 — is a legal position');
    eq(p.value, 90, 'D2a and proposes 90');
    ok(/90/.test(bar(b)), 'D3 the bar names the weight that WOULD be stored');
    ok(/not saved/i.test(bar(b)) || /Drop here/.test(bar(b)), 'D3a and says it is not saved');
    eq(b.calls.upsert.length, 0, 'D4 NOTHING has been written');

    b.api._drag.dropLift();
    eq(b.api._state().move.live, false, 'D5 the drop ends the lift');
    eq(b.calls.upsert.length, 0, 'D5a and STILL writes nothing — a drop is a proposal');
    ok(/Proposed, not saved/.test(bar(b)), 'D5b the bar says exactly that');
    ok(/Save this move/.test(bar(b)), 'D5c and offers Save');
    var o = rowOrder(b);
    eq(o[1], K.jp, 'D6 the preview draws the row in its new position');
    ok(/sp-row--preview/.test(html(b)), 'D6a marked as a preview');
    ok(/was 0/.test(html(b)), 'D6b showing what it was, so the preview cannot read as a stored value');
    ok(/sp-badge--preview/.test(html(b)), 'D6c with a badge that is not "Set"');

    return b.api._drag.saveMove().then(function (okSave) {
      eq(okSave, true, 'D7 Save succeeds');
      eq(b.calls.upsert.length, 1, 'D8 EXACTLY ONE write was dispatched');
      var pl = b.calls.upsert[0];
      eq(pl.allocation_priority, 90, 'D8a carrying the proposed weight');
      eq(pl.marketplace, 'Rakuten', 'D8b for the dragged row');
      eq(pl.expected_allocation_priority, 0, 'D9 with the compare-and-set stating what the page had read');
      eq(pl.expected_allocation_priority_state, 'SET', 'D9a and its state');
      ok(!!pl.expected_marketplace_id, 'D9b and the row identity');
      // NO NEIGHBOUR IS TOUCHED. This is the property that makes one drag incapable of a cross-row partial
      // failure, so it is asserted on the dispatched calls rather than inferred from the design.
      eq(b.calls.upsert.filter(function (c) { return c.marketplace !== 'Rakuten'; }).length, 0,
        'D10 no neighbour was written');
      eq(b.api._state().move, null, 'D11 the draft is cleared once it settles');
      // "VERIFIED" ALONE IS SATISFIED BY "NOT VERIFIED", which is how this assertion passed while D7 failed.
      ok(/Saved and VERIFIED/.test(status(b)), 'D12 and the save is reported as verified by a read-back');
      ok(/places it 2 of 4/.test(status(b)),
        'D13 WITH THE READ-BACK POSITION, not the previewed one — D1 asks for the ordering, not just the value');
    });
  });
});

// =============================================================================================================
test('E. EVERY POSITION, END TO END, against the real list', function () {
  function at(slot, key) {
    var b = bootPage({ rows: FIXTURE() });
    return b.hooks.mount().then(function () {
      b.api._drag.beginLift(key || K.jp, true);
      b.api._drag.setSlot(slot);
      return { b: b, p: b.api._drag.currentProposal() };
    });
  }
  // Lifting JP out leaves 100, 80, 80 — so slot 0 is above 100, slot 2 is between the tied pair, slot 3 is last.
  return at(0).then(function (x) {
    eq(x.p.ok, true, 'E1 TOP of the list accepts');
    eq(x.p.value, 110.00000000000001, 'E1a at 100 x 1.1');
    return at(1);
  }).then(function (x) {
    eq(x.p.value, 90, 'E2 between 100 and 80 the midpoint is 90');
    return at(2);
  }).then(function (x) {
    eq(x.p.ok, false, 'E3 BETWEEN THE TIED PAIR there is no weight — refused');
    eq(x.p.code, 'EQUAL_NEIGHBOURS', 'E3a as equal neighbours');
    ok(/No position/.test(html(x.b)), 'E3b the row is drawn where it was dropped, with NO weight');
    ok(/sp-pri--refused/.test(html(x.b)), 'E3c marked refused rather than given an invented number');
    ok(bar(x.b).indexOf('Save this move') === -1, 'E3d and Save is not offered');
    return at(3);
  }).then(function (x) {
    // DROPPING JP AT SLOT 3 IS WHERE IT ALREADY IS. With JP lifted the reduced list has three rows, so slot 3
    // IS its original last place -- `slot === origRank` in reduced coordinates. The no-change case and the
    // bottom case are the same slot for the last row, which is exactly why the comparison is made in reduced
    // coordinates instead of being argued about.
    eq(x.p.ok, false, 'E4 the LAST row dropped at the bottom has not moved');
    eq(x.p.code, 'NO_CHANGE', 'E4a and says so rather than computing a new weight for the same place');
    // A REAL BOTTOM PLACEMENT, on a list whose last weight is not 0.
    var rows = FIXTURE(); rows[3].allocationPriority = 20;
    var b = bootPage({ rows: rows });
    return b.hooks.mount().then(function () {
      b.api._drag.beginLift(K.us, true);       // 100 -> the bottom, under JP's 20
      b.api._drag.setSlot(3);
      var p = b.api._drag.currentProposal();
      eq(p.ok, true, 'E4b BOTTOM of the list accepts');
      eq(p.value, 18, 'E4c at 20 x 0.9 — pure, with no `max(1, ...)` term');
      eq(p.basis, 'BOTTOM', 'E4d reported as a bottom placement');
    });
  }).then(function () {
    return at(3, K.jp).then(function (x) {
    eq(x.p.ok, false, 'E4e (re-entry)');
    });
  }).then(function () {
    // AND THE BOTTOM FROM ZERO IS THE ONE THAT CANNOT. Drag US (100) below JP (0): the list without US is
    // 80, 80, 0, so slot 3 sits under a last place of 0.
    return at(3, K.us);
  }).then(function (x) {
    eq(x.p.ok, false, 'E5 below a last place of 0 the drag is REFUSED');
    eq(x.p.code, 'BOTTOM_AT_ZERO', 'E5a because nothing is below zero');
    return at(0, K.us);
  }).then(function (x) {
    eq(x.p.ok, false, 'E6 dropping US where it already is changes nothing');
    eq(x.p.code, 'NO_CHANGE', 'E6a which is reported as such');
    ok(/already in that position/.test(bar(x.b)), 'E6b in words');
    ok(bar(x.b).indexOf('Save this move') === -1, 'E6c and Save is NOT offered — there is nothing to write');
  });
});

// =============================================================================================================
test('F. A TOP PLACEMENT ABOVE A LEADER OF 0 IS REFUSED, NOT FILLED IN', function () {
  // Every KitchenMama weight is 0, so there is a comparison basis but no way to get above it.
  var rows = FIXTURE().map(function (x) {
    if (x.company === 'KitchenMama' && x.allocationPriority !== '' ) x.allocationPriority = 0;
    return x;
  });
  var b = bootPage({ rows: rows });
  return b.hooks.mount().then(function () {
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(0);
    var p = b.api._drag.currentProposal();
    eq(p.ok, false, 'F1 refused');
    eq(p.code, 'TOP_FROM_ZERO', 'F1a with the zero-leader code');
    ok(/Edit/.test(p.reason), 'F2 and it points at the explicit editor instead');
    b.api._drag.dropLift();
    eq(b.calls.upsert.length, 0, 'F3 dropping it writes nothing');
    ok(bar(b).indexOf('Save this move') === -1, 'F3a and Save is never offered');
    // THE WHOLE POINT OF THE WITHDRAWAL: no 1.0 appears from nowhere.
    // THE RANK CELL ALSO RENDERS ">1</span>", so the check is made on the PRIORITY cell alone.
    var pris = (html(b).match(/class="sp-pri[^"]*">([^<]*)</g) || []).map(function (m) {
      return m.replace(/.*">/, '').replace(/</, '');
    });
    ok(pris.length > 0, 'F4 (the priority cells were found)', pris);
    eq(pris.filter(function (t) { return t === '1'; }).length, 0,
      'F4a no weight of 1 was invented in any priority cell');
  });
});

// =============================================================================================================
test('G. MISSING IS A FIRST SET, AND IT IS EXPLICIT; INVALID IS NOT TOUCHED', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    eq(b.api._drag.beginLift(K.ca, true), true, 'G1 a MISSING row CAN be dragged into the list');
    eq(b.api._state().move.origRank, -1, 'G1a and it starts outside the order');
    b.api._drag.setSlot(1);
    var p = b.api._drag.currentProposal();
    eq(p.value, 90, 'G2 it takes the midpoint like any other row');
    b.api._drag.dropLift();
    ok(/was Missing/.test(html(b)), 'G2a and the preview says what it was');
    return b.api._drag.saveMove().then(function () {
      var pl = b.calls.upsert[0];
      eq(pl.expected_allocation_priority_state, 'MISSING', 'G3 THE CAS CLAIMS MISSING, not 0');
      ok(!('expected_allocation_priority' in pl), 'G3a and sends no expected NUMBER for a blank cell');
      eq(pl.allocation_priority, 90, 'G3b while the new value is the computed weight');
      eq(b.calls.upsert.length, 1, 'G4 one row, one write — no backfill of the other Missing rows');
    });
  }).then(function () {
    // AND THE INVALID ROW CANNOT BE DRAGGED AT ALL — not by the UI, and not by calling the lift directly.
    var b2 = bootPage({ rows: FIXTURE() });
    return b2.hooks.mount().then(function () {
      ok(html(b2).indexOf('data-sp-grip="ResourceUS\u0001US\u0001eBay"') === -1,
        'G5 the INVALID row is rendered without a handle');
      eq(b2.calls.upsert.length, 0, 'G5a and nothing was written for it');
    });
  });
});

// =============================================================================================================
test('H. CANCEL IS A ZERO WRITE, FROM EVERY STAGE', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    var before = rowOrder(b).join('|');
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.cancelMove();
    eq(b.api._state().move, null, 'H1 cancelling a LIVE lift clears the move');
    eq(b.calls.upsert.length, 0, 'H1a with zero writes');
    eq(rowOrder(b).join('|'), before, 'H1b and the list returns to the stored order');

    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    ok(/sp-row--preview/.test(html(b)), 'H2 (a dropped draft exists)');
    b.api._drag.cancelMove();
    eq(b.calls.upsert.length, 0, 'H2a cancelling a DROPPED draft also writes nothing');
    eq(rowOrder(b).join('|'), before, 'H2b and restores the order');
    ok(html(b).indexOf('sp-row--preview') === -1, 'H2c with no preview left behind');
    eq(bar(b), '', 'H2d and the bar is emptied');
  });
});

// =============================================================================================================
test('I. THE PRE-SAVE RE-READ IS A REAL READ, AND IT CHECKS THE NEIGHBOURS', function () {
  var rows = FIXTURE();
  var b = bootPage({ rows: rows });
  return b.hooks.mount().then(function () {
    var loadsAfterMount = b.calls.refLoads;
    eq(loadsAfterMount, 1, 'I1 (the mount read happened once)');
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    eq(b.calls.refLoads, 1, 'I1a and preparing the draft did NOT re-read — the preview uses what is on screen');
    return b.api._drag.saveMove().then(function () {
      // THE CHECK MUST NOT BE ANSWERABLE FROM THE MEMO THE PREVIEW CAME FROM. The shared reference cache would
      // happily return the same promise; invalidating the key first is what makes this a read rather than a
      // second look at the same snapshot. `refLoads` counts LOADER calls, so it can tell the difference.
      ok(b.calls.refLoads > loadsAfterMount, 'I2 saving caused a genuine re-read', b.calls.refLoads);
      ok(b.calls.invalidate.indexOf('marketplaces') !== -1, 'I2a by invalidating this page’s own key first');
      eq(b.calls.invalidate.filter(function (k) { return k !== 'marketplaces'; }).length, 0,
        'I2b and no other consumer’s key');
    });
  });
});

// =============================================================================================================
test('J. THE NEIGHBOUR CHANGED — four ways, each refused BEFORE anything is sent', function () {
  function staged(mutate, expectWord) {
    var rows = FIXTURE();
    var b = bootPage({ rows: rows });
    return b.hooks.mount().then(function () {
      b.api._drag.beginLift(K.jp, true);
      b.api._drag.setSlot(1);                 // between US 100 and DE 80
      b.api._drag.dropLift();
      mutate(rows);                            // the world moves while the operator deliberates
      return b.api._drag.saveMove().then(function (r) {
        eq(r, false, 'J.' + expectWord + ' the save is refused');
        eq(b.calls.upsert.length, 0, 'J.' + expectWord + 'a and NOTHING was dispatched');
        ok(/NOT SAVED/.test(status(b)), 'J.' + expectWord + 'b said plainly');
        ok(new RegExp(expectWord, 'i').test(status(b)), 'J.' + expectWord + 'c naming the cause', status(b));
        eq(b.api._state().move, null, 'J.' + expectWord + 'd and the stale draft is dropped');
        return b;
      });
    });
  }
  // THE DISPLAY ORDER IS NOT THE FIXTURE ORDER, and the first version of this got that wrong twice. With JP
  // lifted the ordered list is US 100, DE 80, GB 80 — DE before GB on canonical country — so the neighbours
  // of slot 1 are US (rows[0]) and DE (rows[2]). Mutating rows[1] moves GB, which is not a neighbour at all,
  // and the suite was asserting against a message about a different row.
  // 1. THE NEIGHBOUR'S WEIGHT MOVED — the §4 losing sequence, caught by the re-read.
  return staged(function (rows) { rows[2].allocationPriority = 85; }, 'changed weight').then(function () {
    // 2. A THIRD ROW APPEARED BETWEEN THEM. Both neighbour weights are UNCHANGED, so no weight comparison
    //    would notice — only adjacency does. This is the check that is easy to leave out.
    return staged(function (rows) {
      rows.push({ company: 'KitchenMama', country: 'FR', marketplace: 'Amazon', allocationPriority: 90 });
    }, 'between the two');
  }).then(function () {
    // 3. THE TARGET'S OWN VALUE MOVED — the CAS would catch this at the server, but refusing before dispatch
    //    means the operator is told the truth without a write attempt at all.
    return staged(function (rows) { rows[3].allocationPriority = 5; }, 'own priority changed');
  }).then(function () {
    // 3b. THE UPPER NEIGHBOUR MOVED, AND IT STILL BRACKETS. US goes 100 -> 120: the midpoint 90 is still
    //     strictly between 120 and 80, the two neighbours are still adjacent, and the save would land in the
    //     same POSITION. It is refused anyway, and that is the stricter half of §4.A being deliberate rather
    //     than accidental: the operator previewed "90, between 100 and 80", and that sentence is no longer
    //     true. A mutation that deleted this check survived the first version of this suite, because every
    //     other case happened to move the LOWER neighbour.
    return staged(function (rows) { rows[0].allocationPriority = 120; }, 'above this position changed weight');
  }).then(function () {
    // 4. THE NEIGHBOUR IS GONE.
    return staged(function (rows) { rows.splice(2, 1); }, 'no longer there');
  }).then(function () {
    // AND THE LIST THE OPERATOR IS LEFT LOOKING AT IS THE FRESH ONE, not the stale one the preview used.
    var rows = FIXTURE();
    var b = bootPage({ rows: rows });
    return b.hooks.mount().then(function () {
      b.api._drag.beginLift(K.jp, true);
      b.api._drag.setSlot(1);
      b.api._drag.dropLift();
      rows[2].allocationPriority = 95;
      return b.api._drag.saveMove().then(function () {
        ok(/95/.test(html(b)), 'J5 after a refused preflight the table shows what the reference NOW holds');
        ok(/drag again/.test(status(b)), 'J5a and says what to do, without re-sending anything');
      });
    });
  });
});

// =============================================================================================================
test('K. THE WRITE OUTCOMES — an unknown one HOLDS the position, unconfirmed', function () {
  function withOutcome(outcome, onUpsert) {
    var b = bootPage({ rows: FIXTURE(), writeOutcome: outcome, onUpsert: onUpsert });
    return b.hooks.mount().then(function () {
      b.api._drag.beginLift(K.jp, true);
      b.api._drag.setSlot(1);
      b.api._drag.dropLift();
      return b.api._drag.saveMove().then(function (r) { return { b: b, r: r }; });
    });
  }
  // CONFIRMED_REJECTED — a PROVEN zero write. The row goes back where it was stored, because it never moved.
  return withOutcome({ outcome: 'CONFIRMED_REJECTED', code: 'PRIORITY_CHANGED', message: 'stale' })
    .then(function (x) {
      eq(x.r, false, 'K1 a REFUSED write does not report success');
      ok(/REFUSED/.test(status(x.b)), 'K1a and is reported as refused');
      ok(/nothing was written/i.test(status(x.b)), 'K1b with the zero write stated, because it was PROVEN');
      eq(x.b.api._state().move, null, 'K1c the draft is dropped');
      eq(rowOrder(x.b)[3], K.jp, 'K1d and the row is back in its stored position');
      return withOutcome({ outcome: 'CONFIRMED_NOT_STARTED', code: 'API_ENDPOINT_CONFIGURATION_INVALID', message: 'no endpoint' });
    }).then(function (x) {
      ok(/NOT SENT/.test(status(x.b)), 'K2 a NOT STARTED write says nothing left the browser');
      eq(x.b.api._state().move, null, 'K2a and the draft is dropped — also a proven zero write');
      // OUTCOME_UNKNOWN WHERE THE READ-BACK DOES NOT SETTLE IT. This is §3.5's T25, and it is the one case
      // that must not be simplified in either direction: the list may not snap back (that asserts a zero
      // write nobody proved) and the value may not be shown as stored.
      return withOutcome({ outcome: 'OUTCOME_UNKNOWN', code: 'HTTP_TRANSPORT_ERROR', message: 'answer lost' });
    }).then(function (x) {
      eq(x.r, false, 'K3 an UNKNOWN outcome whose read-back disagrees is not a success');
      eq(x.b.calls.upsert.length, 1, 'K3a one write was dispatched');
      ok(!!x.b.api._state().move, 'K4 THE MOVE SURVIVES — the row holds the position it was dragged to');
      eq(x.b.api._state().move.unconfirmed, true, 'K4a flagged unconfirmed');
      eq(rowOrder(x.b)[1], K.jp, 'K4b and is still drawn there, not snapped back');
      ok(/sp-badge--unconfirmed/.test(html(x.b)), 'K4c with an Unconfirmed badge, never "Set"');
      ok(/Unconfirmed/.test(bar(x.b)), 'K5 the bar says unconfirmed');
      ok(/NOT a saved value/.test(bar(x.b)), 'K5a and refuses to call it saved');
      ok(/not be re-sent|Nothing will be re-sent/i.test(bar(x.b)), 'K5b and promises no automatic resend');
      ok(bar(x.b).indexOf('Save this move') === -1, 'K5c Save is WITHDRAWN — a retry is the one unsafe action');
      // A SECOND SAVE IS IMPOSSIBLE FROM THIS STATE, asserted by calling it rather than by reading the markup.
      return x.b.api._drag.saveMove().then(function (again) {
        eq(again, false, 'K6 calling Save again from an unconfirmed hold does nothing');
        eq(x.b.calls.upsert.length, 1, 'K6a and dispatches NO second write');
        x.b.api._drag.cancelMove();
        eq(x.b.calls.upsert.length, 1, 'K7 dismissing the marker also writes nothing — there is no rollback');
      });
    });
});

// =============================================================================================================
test('L. AN UNKNOWN OUTCOME WHOSE VALUE *IS* FOUND IS STILL NOT A CONFIRMED SAVE', function () {
  var rows = FIXTURE();
  // THE WRITE LANDS AND THE ANSWER IS LOST. It has to be applied BY THE WRITE, not before it: applying it
  // up front would change the target's own value, and the preflight would correctly refuse the move before
  // anything was ever dispatched — which is a different test that proves nothing about this one.
  var b = bootPage({ rows: rows, applyAnyway: true,
    writeOutcome: { outcome: 'OUTCOME_UNKNOWN', code: 'HTTP_TRANSPORT_ERROR', message: 'answer lost' } });
  return b.hooks.mount().then(function () {
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    return b.api._drag.saveMove().then(function (r) {
      eq(r, true, 'L1 the page reports the value is present');
      ok(/UNKNOWN/.test(status(b)), 'L1a while stating the outcome was unknown');
      ok(/does NOT prove this request/.test(status(b)), 'L2 and refusing to attribute the value to this request');
      ok(/audit fields may be incomplete/.test(status(b)), 'L2a including the audit columns');
      ok(/unconfirmed/.test(status(b)), 'L2b the save is called unconfirmed');
      ok(/places it 2 of 4/.test(status(b)), 'L3 with the read-back POSITION, from the fresh read');
      eq(b.calls.upsert.length, 1, 'L4 and nothing was re-sent');
    });
  });
});

// =============================================================================================================
test('M. A FAILED READ-BACK NEVER BECOMES A SUCCESS', function () {
  var b = bootPage({ rows: FIXTURE(),
    writeOutcome: { outcome: 'CONFIRMED_COMMITTED', code: 'OK', message: '' }, readThrowsFrom: 3 });
  return b.hooks.mount().then(function () {
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    return b.api._drag.saveMove().then(function (r) {
      eq(r, false, 'M1 a confirmed write with an unreadable read-back is NOT reported as verified');
      ok(/read-back FAILED/.test(status(b)), 'M1a it says the read-back failed');
      ok(/not\s+verified/i.test(status(b)), 'M1b and that persistence is unverified');
      ok(/Do NOT re-save/.test(status(b)), 'M2 and never suggests saving again');
    });
  });
});

// =============================================================================================================
test('N. A FILTER MAY NOT HIDE A NEIGHBOUR, AND MAY NOT DISCARD A DRAFT', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    // A COUNTRY FILTER CAN SPLIT A COMPANY. The rows left on screen look adjacent and are not, so a midpoint
    // computed from them is the wrong number — and it would save perfectly happily.
    b.dom.byId['sp-filter-country'].value = 'US';
    b.dom.byId['site-priority-section'].fire('change', { target: b.dom.byId['sp-filter-country'] });
    ok(/Reordering is off/.test(html(b)), 'N1 with rows hidden, the company says reordering is off');
    ok(/hidden by the Country filter/.test(html(b)), 'N1a and why');
    eq((html(b).match(/data-sp-grip=/g) || []).length, 0, 'N2 and no row offers a handle');
    eq(b.api._drag.beginLift(K.us, true), false, 'N2a nor can a lift be forced');

    // AND THAT LAST ASSERTION PROVES LESS THAN IT LOOKS, which a mutation showed: with only one KitchenMama
    // row left visible, the lift also refuses for NO_BASIS, so deleting the filter guard entirely changed
    // nothing. The guard needs a company that keeps TWO weighted rows after filtering — two sites in one
    // country, with the rest of the company elsewhere.
    var rows2 = FIXTURE();
    rows2.push({ company: 'KitchenMama', country: 'US', marketplace: 'Walmart', allocationPriority: 60 });
    var b2 = bootPage({ rows: rows2 });
    return b2.hooks.mount().then(function () {
      b2.dom.byId['sp-filter-country'].value = 'US';
      b2.dom.byId['site-priority-section'].fire('change', { target: b2.dom.byId['sp-filter-country'] });
      var vis = b2.api._state().rows.filter(function (r) {
        return String(r.company) === 'KitchenMama' && String(r.country) === 'US';
      });
      eq(vis.length, 2, 'N2b (the setup) two KitchenMama sites survive the filter, so NO_BASIS cannot apply');
      eq(b2.api._drag.beginLift(K.us, true), false,
        'N2c and the lift is STILL refused — by the filter lock itself, not by an empty list');
      ok(/hidden by the Country filter/.test(status(b2)), 'N2d saying which filter is hiding what');
      eq(b2.api._state().move, null, 'N2e with no move created');
      eq((html(b2).match(/data-sp-grip=/g) || []).length, 0, 'N2f and no handle anywhere');
    }).then(function () {

    // A COMPANY FILTER CANNOT: it removes whole companies and never splits one.
    b.dom.byId['sp-filter-country'].value = '';
    b.dom.byId['sp-filter-company'].value = 'KitchenMama';
    b.dom.byId['site-priority-section'].fire('change', { target: b.dom.byId['sp-filter-company'] });
    ok(html(b).indexOf('Reordering is off') === -1, 'N3 a COMPANY filter does not lock anything');
    ok((html(b).match(/data-sp-grip=/g) || []).length > 0, 'N3a handles remain');

    // AND A FILTER CHANGE WITH A DRAFT PENDING IS NEITHER OBEYED NOR IGNORED.
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    var sel = b.dom.byId['sp-filter-company'];
    sel.value = 'ResourceUS';
    b.dom.byId['site-priority-section'].fire('change', { target: sel });
    eq(sel.value, 'KitchenMama', 'N4 the select is PUT BACK, not left showing a scope the table is not using');
    ok(!!b.api._state().move, 'N4a the draft survives — it is not silently discarded');
    eq(b.calls.upsert.length, 0, 'N4b and it is certainly not auto-saved');
    ok(/Save it or Cancel it/.test(status(b)), 'N4c the operator is asked to finish it');

    // REFRESH IS THE SAME HAZARD WEARING A DIFFERENT BUTTON: it would replace the rows the preview was
    // computed against.
    b.dom.byId['site-priority-section'].fire('click', { target: b.dom.byId['sp-refresh'] });
    ok(!!b.api._state().move, 'N5 Refresh does not discard a pending draft either');
    eq(b.calls.upsert.length, 0, 'N5a and writes nothing');
    });
  });
});

// =============================================================================================================
test('O. REPEATED SAVE, AND A LATE ANSWER', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    b.api._drag.beginLift(K.jp, true);
    b.api._drag.setSlot(1);
    b.api._drag.dropLift();
    // TWO SAVES FROM ONE DRAFT. The second is issued before the first has settled, which is what a double
    // click is. One write, not two — a second would carry the same CAS and could land twice.
    var a = b.api._drag.saveMove();
    var c = b.api._drag.saveMove();
    return Promise.all([a, c]).then(function (rs) {
      eq(b.calls.upsert.length, 1, 'O1 a second Save during the first dispatches NO second write');
      eq(rs[1], false, 'O1a and reports that it did nothing');
      // AND AFTER IT SETTLES THE DRAFT IS GONE, so a third click has nothing to re-send.
      eq(b.api._state().move, null, 'O2 the draft is consumed by the save that used it');
      return b.api._drag.saveMove().then(function (r3) {
        eq(r3, false, 'O2a so Save again does nothing');
        eq(b.calls.upsert.length, 1, 'O2b and still exactly one write exists');
      });
    });
  }).then(function () {
    // A LATE ANSWER MAY NOT SPEAK FOR THE CURRENT PAGE. Leaving the page retires the save; its completion
    // must not then write a banner over whatever the operator is now looking at.
    var b2 = bootPage({ rows: FIXTURE() });
    return b2.hooks.mount().then(function () {
      b2.api._drag.beginLift(K.jp, true);
      b2.api._drag.setSlot(1);
      b2.api._drag.dropLift();
      var pr = b2.api._drag.saveMove();
      b2.hooks.unmount();
      return pr.then(function () {
        eq(b2.api._state().mounted, false, 'O3 the page was left while the save was in flight');
        // The "Checking the sites…" banner was written BEFORE the page was left, which is legitimate. What
        // must never appear is a VERDICT written after it: a success, a refusal or a not-verified notice
        // belonging to a page the operator is no longer looking at.
        ok(!/VERIFIED|REFUSED|NOT SENT|NOT SAVED|Saved and/.test(status(b2)),
          'O3a and the late answer wrote NO verdict onto the next page', status(b2));
        eq(b2.api._state().move, null, 'O3b leaving also discards the draft — it was never written');
      });
    });
  });
});

// =============================================================================================================
test('P. (non-vacuity) the shim really drove the page', function () {
  var b = bootPage({ rows: FIXTURE() });
  return b.hooks.mount().then(function () {
    ok(html(b).length > 500, 'P1 the table really rendered', html(b).length);
    eq(b.api._state().rows.length, 7, 'P2 against the whole fixture');
    eq(b.api._drag.beginLift(K.ebay, true), false, 'P3 and an unliftable row really refuses');
    // The document-level pointer stream is attached ONCE, at module scope. A listener per mount would move
    // the row N times after N visits.
    eq((b.dom.docListeners['pointermove'] || []).length, 1, 'P4 exactly one document pointermove listener');
    eq((b.dom.docListeners['pointerup'] || []).length, 1, 'P4a and one pointerup');
    eq((b.dom.docListeners['pointercancel'] || []).length, 1, 'P4b and one pointercancel');
    return b.hooks.mount().then(function () {
      return b.hooks.mount().then(function () {
        eq((b.dom.docListeners['pointermove'] || []).length, 1, 'P5 THREE mounts later, still one');
        eq(b.dom.byId['site-priority-section'].listenerCount('pointerdown'), 1,
          'P5a and one delegated pointerdown on the section');
        eq(b.dom.byId['site-priority-section'].listenerCount('keydown'), 1, 'P5b and one keydown');
      });
    });
  });
});

// =============================================================================================================
section('Q. THE SOURCE INVARIANTS — what the implementation may not contain');

// ONE WRITER, and it is the bounded R52 one.
eq((CODE.match(/setMarketplaceAllocationPriority/g) || []).length, 2,
  'Q1 the bounded writer is named exactly twice — the availability check and the call');
ok(CODE.indexOf('upsertMarketplace') === -1, 'Q2 the unguarded writer is never named in code');
// ONE DISPATCH SITE. A drag that built its own payload would be a second writer wearing one name.
eq((CODE.match(/db\.setMarketplaceAllocationPriority\(payload\)/g) || []).length, 1,
  'Q3 there is exactly ONE place a write is dispatched from');
eq((CODE.match(/allocation_priority:/g) || []).length, 1, 'Q3a and exactly one payload is constructed');
eq((CODE.match(/expected_allocation_priority_state:/g) || []).length, 1, 'Q4 with exactly one CAS construction');

// NO MULTI-ROW ANYTHING. Renumbering, respreading and backfill are all multi-row writes, and §5 of the
// proposal records that a multi-row write has no all-or-nothing story on this backend.
ok(!/forEach[\s\S]{0,200}setMarketplaceAllocationPriority/.test(CODE),
  'Q5 no loop dispatches writes');
ok(!/renumber|respread|normalise|normalize|reindex|backfill/i.test(CODE),
  'Q6 no renumbering, respreading or backfill exists');
ok(!/Promise\.all\([\s\S]{0,120}setMarketplace/.test(CODE), 'Q6a and no batch of writes is assembled');

// THE RE-READ BEFORE SAVING IS REAL, which means the cache key is dropped first.
ok(/invalidateMarketplaceReference\(\);\s*\n\s*return loadRows\(\)/.test(CODE),
  'Q7 preflightMove invalidates the reference key and only then loads');
ok(/function preflightMove/.test(CODE), 'Q7a and the preflight is a named function, not an inline afterthought');

// THE ALLOCATOR IS NOT TOUCHED. A drag stores a weight; it has no opinion about allocation.
ok(!/survivalNeed|demandWeight|distributeByWeight|SHORTAGE_ALLOCATION/.test(CODE),
  'Q8 nothing in this page reaches into the allocator');
ok(!/Math\.max\(\s*\w*[Pp]riority\s*,\s*1\s*\)/.test(CODE),
  'Q8a and the shortage clamp is not reimplemented here — it belongs to one branch of one mode');

// THE FACTORS ARE ONE NUMBER EACH, DECLARED ONCE. Two copies of 1.1 is how a rule and its documentation
// drift apart.
eq((CODE.match(/TOP_FACTOR\s*=\s*1\.1/g) || []).length, 1, 'Q9 the top factor is declared once');
eq((CODE.match(/BOTTOM_FACTOR\s*=\s*0\.9/g) || []).length, 1, 'Q9a and the bottom factor once');
eq((CODE.match(/\*\s*TOP_FACTOR/g) || []).length, 1, 'Q9b each is applied in exactly one place');
eq((CODE.match(/\*\s*BOTTOM_FACTOR/g) || []).length, 1, 'Q9c');
ok(!/[^.\w]1\.1[^\d]/.test(CODE.replace(/TOP_FACTOR\s*=\s*1\.1/, '')), 'Q9d with no stray literal 1.1');

// THE MARKUP AND THE STYLESHEET CARRY THEIR HALF.
ok(/id="sp-draft"/.test(HTML_SRC), 'Q10 the partial has the move bar');
ok(/id="sp-drag-help"/.test(HTML_SRC), 'Q10a and the keyboard instructions');
ok(/aria-describedby="sp-drag-help"/.test(PAGE_SRC), 'Q10b which every handle points at');
ok(/<kbd>Esc<\/kbd>/.test(HTML_SRC), 'Q10c including how to cancel');
// TOUCH-ACTION IS THE ONE DECLARATION THAT DECIDES WHETHER TOUCH WORKS AT ALL. Without it the browser claims
// the gesture as a scroll and cancels the pointer stream, so the feature would be desktop-only while looking
// complete in every desktop test.
ok(/\.sp-grip[\s\S]{0,400}touch-action:\s*none/.test(CSS_SRC),
  'Q11 the handle sets touch-action: none, without which touch cannot drag at all');
ok(/@media \(max-width: 640px\)[\s\S]{0,400}\.sp-grip[\s\S]{0,200}38px/.test(CSS_SRC),
  'Q11a and the handle keeps a finger-sized target on the card layout');
ok(/sp-badge--unconfirmed/.test(CSS_SRC), 'Q11b the unconfirmed state is styled, not just named');
ok(/sp-pri--refused/.test(CSS_SRC), 'Q11c and so is a slot with no legal weight');

// THE PAGE IS STILL A ROUTE ASSET, so none of this returned to the boot path.
var APP_SRC = read('assets/js/app.js');
ok(/'site-priority':\s*\{[\s\S]{0,300}pages\/site-priority\.js/.test(APP_SRC),
  'Q12 site-priority.js is still loaded by route, not at boot');
ok(read('index.html').indexOf('pages/site-priority.js') === -1, 'Q12a and index.html does not load it');

// =============================================================================================================
// RUN
// =============================================================================================================
(function run(i) {
  if (i >= T.length) {
    console.log('\n----------------------------------------');
    console.log('SITE PRIORITY DRAG (S8-B3-R3-CP2M-R4): ' + pass + ' passed, ' + fail + ' failed');
    if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
    if (fail > 0) process.exitCode = 1;
    return;
  }
  section(T[i].name);
  var p;
  try { p = Promise.resolve(T[i].fn()); } catch (e) { p = Promise.reject(e); }
  p.then(function () { run(i + 1); }, function (e) {
    fail++;
    console.log('FAIL ' + T[i].name + ' THREW: ' + (e && e.stack ? e.stack : e));
    run(i + 1);
  });
})(0);
