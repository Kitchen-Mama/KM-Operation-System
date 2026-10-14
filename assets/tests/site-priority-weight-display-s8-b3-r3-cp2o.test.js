// =============================================================================================================
// S8-B3-R3-CP2O — HOW A WEIGHT IS SHOWN, AND WHAT MUST NEVER BE SHOWN
// -------------------------------------------------------------------------------------------------------------
// The drag rule is arithmetic on IEEE doubles, so midpoints land on float tails and `String(n)` put
// `0.30000000000000004` in a table cell. The obvious repair — round everything to two decimals — introduces
// something far worse than a long number: TWO DIFFERENT STORED WEIGHTS PRINTING THE SAME STRING. On this page
// the order IS the meaning, so two rows that read identically while ranking differently is the one thing the
// table must never show.
//
// THE RULE: print the two-decimal form ONLY when it IS the value; otherwise print the shortest string that
// reads back as exactly that number — which is what `String(n)` already gives, scientific notation included.
//
// WHICH MAKES THE FAKE TIE IMPOSSIBLE RATHER THAN UNLIKELY. Both branches return a string `s` with
// `Number(s) === n`, so two different numbers cannot produce the same string: if they did, `Number(s)` would
// have to equal both at once. That is injectivity by construction, and §A proves it over a generated sweep
// rather than over the half-dozen cases somebody thought of.
//
// AND NOTHING IS EVER APPROXIMATE, so nothing has to be labelled approximate. The round required that an
// approximate display must not be misrepresented as the exact stored value; this meets that requirement by
// not producing one.
//
// THE OTHER HALF, AND THE MORE DANGEROUS ONE: formatted text must never reach the payload, the compare-and-set,
// the ordering comparator or the midpoint arithmetic. §E drives a real drag whose midpoint is a float tail and
// proves the writer was handed the NUMBER, bit for bit.
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
// DOM shim + page boot. Same shape as the CP2M-R4 drag suite's: innerHTML is recorded as TEXT and there is no
// layout, so every assertion is about WHAT THE PAGE EMITS and WHAT IT CALLS.
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
        // THE PAYLOAD IS CAPTURED BEFORE ANYTHING ELSE TOUCHES IT, so §E compares what the writer was
        // actually handed and not a later copy of it.
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

// =============================================================================================================
section('A. the format, as arithmetic — and injective over a sweep, not over a handful');
// =============================================================================================================

ok(typeof F === 'function', 'A0 formatWeight is exported');

// The ordinary cases: at most two decimals, trailing zeros gone.
eq(F(0), '0', 'A1 zero prints as 0 — not 0.00, and never blank');
eq(F(90), '90', 'A1a a whole number has no decimal point');
eq(F(100), '100', 'A1b nor a larger one');
eq(F(70.5), '70.5', 'A1c one decimal keeps one');
eq(F(1.5), '1.5', 'A1d and the trailing zero of toFixed(2) is trimmed');
eq(F(2.0), '2', 'A1e a value that is whole prints whole');
eq(F(0.25), '0.25', 'A1f two decimals print two');
eq(F(12.34), '12.34', 'A1g');

// The float tails this round exists for.
eq(F(0.1 + 0.2), '0.30000000000000004',
  'A2 a float tail is printed EXACTLY — rounding it to 0.3 would invent a tie with a real 0.3');
eq(F(0.3), '0.3', 'A2a while a real 0.3 prints short');
ok(F(0.3) !== F(0.1 + 0.2), 'A2b so the two are DISTINGUISHABLE on screen');

// The midpoint the CP2M-R4 round named: 0.04 -> 0.044.
eq(F(0.044), '0.044', 'A3 three decimals are kept when two would not be the value');
ok(F(0.044) !== F(0.04), 'A3a and 0.044 never reads as 0.04');

// Scientific notation is KEPT, not expanded into a wall of zeros.
eq(F(1e-7), '1e-7', 'A4 a very small value keeps its exponent');
eq(F(Number.MIN_VALUE), '5e-324', 'A4a including the smallest positive double');
eq(F(Number.MAX_VALUE), '1.7976931348623157e+308',
  'A4b and the largest finite double prints as 23 characters, not 309');
eq(F(1e21), '1e+21', 'A4c the boundary where JS itself switches to exponent form');

// Not a number, or not finite: nothing to show. Never "NaN", never "Infinity", never "0".
eq(F(NaN), '', 'A5 NaN prints as nothing');
eq(F(Infinity), '', 'A5a Infinity prints as nothing');
eq(F(-Infinity), '', 'A5b and -Infinity too');
eq(F(null), '', 'A5c a null weight prints as nothing');
eq(F(undefined), '', 'A5d so does undefined');
eq(F('90'), '', 'A5e AND SO DOES A STRING — this function takes numbers, and a string reaching it is a bug');

// ---- THE INVARIANT, OVER A SWEEP ---------------------------------------------------------------------------
// Every displayed string must read back as exactly its own value. That single property is what makes a fake
// tie impossible: two different numbers cannot share a string, because Number(s) cannot equal both.
var SWEEP = [];
(function build() {
  var seeds = [0, 1, 2, 0.5, 90, 100, 0.044, 0.3, 0.1 + 0.2, 0.04, 0.048, 12.34, 1e-7, 1e21,
    Number.MIN_VALUE, Number.MAX_VALUE, 1 / 3, 2 / 3, 0.07 * 3, 1e-300, 1e300];
  seeds.forEach(function (s) { SWEEP.push(s); });
  // Midpoints of adjacent seeds — the shape the drag rule actually produces.
  for (var i = 0; i + 1 < seeds.length; i++) {
    var lo = Math.min(seeds[i], seeds[i + 1]), hi = Math.max(seeds[i], seeds[i + 1]);
    var mid = lo + (hi - lo) / 2;
    if (isFinite(mid) && mid >= 0) SWEEP.push(mid);
  }
  // The two factors the rule uses.
  seeds.forEach(function (s) {
    if (isFinite(s * 1.1) && s * 1.1 >= 0) SWEEP.push(s * 1.1);
    if (isFinite(s * 0.9) && s * 0.9 >= 0) SWEEP.push(s * 0.9);
  });
}());
var distinct = [];
SWEEP.forEach(function (n) { if (distinct.indexOf(n) === -1) distinct.push(n); });
ok(distinct.length > 40, 'A6 (the sweep is large enough to be worth running)', distinct.length);

var badRound = [], seen = {}, collisions = [];
distinct.forEach(function (n) {
  var s = F(n);
  if (Number(s) !== n) badRound.push({ n: String(n), s: s });
  if (Object.prototype.hasOwnProperty.call(seen, s)) collisions.push({ a: String(seen[s]), b: String(n), s: s });
  else seen[s] = n;
});
eq(badRound.length, 0, 'A6a EVERY displayed string reads back as exactly its own value', badRound.slice(0, 4));
eq(collisions.length, 0, 'A6b and NO two distinct weights share a string — no fake tie is possible',
  collisions.slice(0, 4));

// The "generally two decimals" half of the contract, measured rather than asserted.
var twoDp = distinct.filter(function (n) { var s = F(n); var d = s.indexOf('.'); return d === -1 || (s.length - d - 1) <= 2; });
ok(twoDp.length >= 1, 'A7 (some values do print at two decimals or fewer)', twoDp.length);
[0, 90, 100, 70.5, 1.5, 0.25, 12.34].forEach(function (n) {
  var s = F(n);
  var d = s.indexOf('.');
  ok(d === -1 || (s.length - d - 1) <= 2, 'A7a the ordinary case stays within two decimals: ' + n + ' -> ' + s);
});

// =============================================================================================================
section('B. the table shows the formatted weight, and carries the raw one');
// =============================================================================================================

var ROWS = function () {
  return [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 100 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 0.1 + 0.2 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 0.3 },
    { company: 'KM', country: 'JP', marketplace: 'Rakuten', allocationPriority: 0 },
    { company: 'KM', country: 'CA', marketplace: 'Walmart', allocationPriority: '' },
    { company: 'KM', country: 'FR', marketplace: 'Amazon', allocationPriority: -5 }
  ];
};

var bDone = (function () {
  var b = bootPage({ rows: ROWS() });
  return b.hooks.mount().then(function () {
    var h = html(b);
    ok(h.indexOf('>0.30000000000000004<') !== -1, 'B1 the float-tail weight is printed exactly in the cell');
    ok(h.indexOf('>0.3<') !== -1, 'B1a and the real 0.3 is printed short');
    ok(h.indexOf('>100<') !== -1, 'B1b a whole weight has no decimal point');
    ok(h.indexOf('>0<') !== -1, 'B1c and a weight of 0 is shown as 0, not blank and not a dash');

    // THE RAW VALUE IS READABLE WITHOUT ENTERING EDIT.
    ok(/title="0\.30000000000000004"/.test(h), 'B2 the cell carries the raw stored value in its title');
    ok(/title="100"/.test(h), 'B2a for every SET row');
    eq((h.match(/class="sp-pri" title=/g) || []).length, 4,
      'B2b one per SET row — and only SET rows, so Missing and Invalid gain no false precision');

    // MISSING AND INVALID ARE UNCHANGED.
    ok(h.indexOf('sp-pri--none') !== -1, 'B3 a MISSING row still shows a dash, not a formatted zero');
    ok(h.indexOf('sp-badge--missing') !== -1, 'B3a and is still badged Missing');
    ok(h.indexOf('sp-badge--invalid') !== -1, 'B3b an INVALID row is still badged Invalid');
    ok(h.indexOf('>-5<') === -1, 'B3c and its negative value is NOT printed as a weight');
  });
}());

// =============================================================================================================
section('C. the drag preview and the move bar use the same format');
// =============================================================================================================

var cDone = (function () {
  // Dropping between 0.04 and 0.048 produces 0.044 — a value two decimals cannot express.
  var rows = [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 0.048 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 0.04 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 0.004 }
  ];
  var b = bootPage({ rows: rows });
  return b.hooks.mount().then(function () {
    var key = 'KM\u0001DE\u0001Amazon';
    ok(b.api._drag.beginLift(key, true), 'C0 (the row lifts)');
    b.api._drag.setSlot(1);
    var p = b.api._drag.currentProposal();
    ok(p.ok, 'C0a (and the slot has a legal weight)', p);

    var live = draftHtml(b);
    ok(live.indexOf(F(p.value)) !== -1, 'C1 the live move bar shows the proposal in display format');
    ok(live.indexOf('Drop here to propose') !== -1, 'C1a as a proposal, not as a stored value');

    b.api._drag.dropLift();
    var ready = draftHtml(b);
    ok(ready.indexOf('Proposed, not saved') !== -1, 'C2 the dropped bar still says it is not saved');
    ok(ready.indexOf(F(p.value)) !== -1, 'C2a and shows the weight in display format');
    ok(ready.indexOf(F(0.048)) !== -1 && ready.indexOf(F(0.04)) !== -1,
      'C2b with BOTH neighbours in the same format, so the three numbers can be compared by eye');

    var h = html(b);
    ok(h.indexOf('sp-pri--preview') !== -1, 'C3 the row draws a preview cell');
    ok(h.indexOf(F(p.value)) !== -1, 'C3a carrying the same formatted weight');
    ok(h.indexOf('was ' + F(0.004)) !== -1, 'C3b and the "was" value is formatted too');
    ok(h.indexOf('Not saved') !== -1, 'C3c badged as not saved');
  });
}());

// =============================================================================================================
section('D. the save read-back sentence uses the same format');
// =============================================================================================================

var dDone = (function () {
  var rows = [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 0.048 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 0.04 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 0.004 }
  ];
  var b = bootPage({ rows: rows });
  return b.hooks.mount().then(function () {
    var key = 'KM\u0001DE\u0001Amazon';
    b.api._drag.beginLift(key, true);
    b.api._drag.setSlot(1);
    var p = b.api._drag.currentProposal();
    b.api._drag.dropLift();
    return b.api._drag.saveMove().then(function () {
      var s = statusText(b);
      ok(s.indexOf('Saved and VERIFIED') !== -1, 'D1 the save is verified by a fresh read');
      ok(s.indexOf('now has priority ' + F(p.value)) !== -1,
        'D1a and the read-back sentence quotes the weight in display format', s.slice(0, 200));
      ok(s.indexOf('0.044000000000000004') === -1 || F(p.value) === '0.044000000000000004',
        'D1b it does not print a raw tail the format would have shortened');
      return { b: b, p: p };
    });
  });
}());

// =============================================================================================================
section('E. the WRITER receives the number, unchanged — formatting never reaches the payload');
// =============================================================================================================

var eDone = dDone.then(function (ctx) {
  var b = ctx.b, p = ctx.p;
  eq(b.calls.upsert.length, 1, 'E1 exactly one write was dispatched');
  var payload = b.calls.upsert[0];

  eq(typeof payload.allocation_priority, 'number',
    'E2 the payload carries a NUMBER — not the formatted string');
  ok(payload.allocation_priority === p.value,
    'E2a and it is bit-for-bit the proposed value',
    { sent: String(payload.allocation_priority), proposed: String(p.value) });
  ok(payload.allocation_priority !== F(p.value),
    'E2b which is NOT the display string (they are different types)',
    { sent: typeof payload.allocation_priority, display: typeof F(p.value) });

  // THE COMPARE-AND-SET IS A NUMBER TOO. A formatted expectation would make the handler compare a string
  // against a cell and refuse every save on a value with a tail.
  eq(payload.expected_allocation_priority_state, 'SET', 'E3 the CAS names the previous state');
  eq(typeof payload.expected_allocation_priority, 'number', 'E3a and carries the previous value as a NUMBER');
  eq(payload.expected_allocation_priority, 0.004, 'E3b exactly as it was read');

  // A value that would have been MANGLED by a two-decimal format is the whole point of this test.
  ok(F(p.value) !== String(p.value) || p.value.toFixed(2) !== String(p.value),
    'E4 (the chosen value is one where formatting and raw actually differ in some way)',
    { raw: String(p.value), shown: F(p.value) });
});

// =============================================================================================================
section('F. what the format must not have touched');
// =============================================================================================================

// Sorting compares NUMBERS. If display text ever reached the comparator, "100" would sort before "90".
var fDone = (function () {
  var b = bootPage({ rows: [
    { company: 'KM', country: 'US', marketplace: 'Amazon', allocationPriority: 100 },
    { company: 'KM', country: 'GB', marketplace: 'Amazon', allocationPriority: 90 },
    { company: 'KM', country: 'DE', marketplace: 'Amazon', allocationPriority: 9 }
  ] });
  return b.hooks.mount().then(function () {
    var h = html(b);
    var iUS = h.indexOf('KM\u0001US\u0001Amazon'), iGB = h.indexOf('KM\u0001GB\u0001Amazon'), iDE = h.indexOf('KM\u0001DE\u0001Amazon');
    ok(iUS < iGB && iGB < iDE, 'F1 100 > 90 > 9 — numeric order, not the lexical order of the display text',
      { iUS: iUS, iGB: iGB, iDE: iDE });
  });
}());

// The arithmetic is untouched: the rule still returns numbers and still refuses what it always refused.
var mid = P.midpoint(0.04, 0.048);
eq(typeof mid, 'number', 'F2 midpoint still returns a number');
ok(P.isStorableWeight(mid), 'F2a and a storable one');
var prop = P.proposeWeight(0.048, 0.04);
eq(typeof prop.value, 'number', 'F3 proposeWeight still returns a number');
eq(P.proposeWeight(null, null).ok, false, 'F3a and still refuses when there is no basis');
eq(P.proposeWeight(0, null).ok, false, 'F3b and still refuses to go below zero');

// The EDIT control is the raw value, deliberately: it is what the operator types back.
ok(/value="' \+ esc\(c\.state === 'SET' \? String\(c\.value\) : ''\) \+ '"/.test(CODE),
  'F4 the Edit input still carries the RAW value, not the formatted one');
ok(CODE.indexOf('formatWeight(c.value)') !== -1, 'F5 while the read-only cell uses the format');

// NOT IN THE PAYLOAD, NOT IN THE CAS, NOT IN THE COMPARATOR, NOT IN THE ARITHMETIC — asserted on the source,
// because a future edit could reintroduce it somewhere this suite does not drive.
// The end landmark is the LAST line of the payload construction, not `_busy = true;` — that string occurs
// twice in the file and its FIRST occurrence is above the payload, which made this slice empty and the
// assertion vacuously true in the first draft.
var payloadStart = CODE.indexOf('var payload = {');
var casLine = 'if (before.state === \'SET\') payload.expected_allocation_priority = before.value;';
var payloadEnd = CODE.indexOf(casLine, payloadStart);
ok(payloadStart > -1 && payloadEnd > payloadStart, 'F6pre (both payload landmarks resolve, in order)',
  { start: payloadStart, end: payloadEnd });
var payloadBlock = CODE.slice(payloadStart, payloadEnd + casLine.length);
ok(payloadBlock.length > 100, 'F6 (the payload block was located)', payloadBlock.length);
ok(payloadBlock.indexOf('allocation_priority: v.value') !== -1,
  'F6z and it really is the payload — it carries the value the writer is handed');
ok(payloadBlock.indexOf('formatWeight') === -1, 'F6a the payload block never calls formatWeight');
var cmpBlock = CODE.slice(CODE.indexOf('function displayOrder'), CODE.indexOf('function displayOrder') + 900);
ok(cmpBlock.indexOf('formatWeight') === -1, 'F6b nor does the ordering comparator');
var ruleBlock = CODE.slice(CODE.indexOf('function proposeWeight'), CODE.indexOf('function proposeWeight') + 2500);
ok(ruleBlock.indexOf('formatWeight') === -1, 'F6c nor the weight rule');
ok(CODE.indexOf('Number(formatWeight') === -1, 'F6d and nothing parses a formatted string back into a number');

// The factors and the §45.A semantics are untouched by a display round.
eq(P.TOP_FACTOR, 1.1, 'F7 the top factor is unchanged');
eq(P.BOTTOM_FACTOR, 0.9, 'F7a and the bottom factor');
eq(P.classify(0).state, 'SET', 'F8 zero is still a VALID weight');
eq(P.classify('').state, 'MISSING', 'F8a blank is still MISSING');
eq(P.classify(-5).state, 'INVALID', 'F8b a negative is still INVALID');
eq(P.classify('abc').state, 'INVALID', 'F8c and unparseable text is still INVALID to this page');

// =============================================================================================================
Promise.all([bDone, cDone, dDone, eDone, fDone]).then(function () {
  console.log('\n----------------------------------------');
  console.log('SITE PRIORITY WEIGHT DISPLAY (S8-B3-R3-CP2O): ' + pass + ' passed, ' + fail + ' failed');
  if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
  if (fail > 0) process.exitCode = 1;
}).catch(function (e) {
  console.error('FAIL harness error: ' + (e && e.stack || e));
  process.exitCode = 1;
});
