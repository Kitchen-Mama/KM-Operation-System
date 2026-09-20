// Kitchen Mama Operation System — INCIDENT-BOOT-FC-R2
// THE CLOCK WAS NEVER WAITING FOR DATA. IT WAS WAITING FOR 6.93 MB OF JAVASCRIPT.
// Run: node assets/tests/home-boot-critical-path-boot-fc-r2.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser.
//
// WHAT THE OPERATOR SAW. On two computers, Ctrl+Shift+R left Home "loading" for a very long time and the
// world-time cards stuck at `--/--` and `--:--`.
//
// WHAT IT WAS. Nothing to do with Apps Script. `home.js` issues no API call at all; the single Home-boot
// read is fire-and-forget; there is no Promise.all gate. `updateWorldTimes` is seven timezone offsets and
// a Date. But it was started from app.js's DOMContentLoaded handler, and app.js was the LAST of 79
// render-blocking script tags — so the clock could not paint until 103 requests and 6.93 MB had landed.
// Measured cold at a browser's concurrency budget of 6: 38.2 s, zero failures. Pure weight.
//
// HOW THIS SUITE PROVES THE FIX. It reads the REAL index.html, takes the tags the browser would run
// BEFORE any deferred script (Phase 0), executes those REAL files in order in a sandbox, and then asks
// whether the clock has painted. Nothing else is allowed to run. If the clock needs anything from the
// other 5.2 MB, it cannot paint here, and the suite fails.
//
// The ordering-safety argument for `defer` is also mechanical rather than asserted: deferred scripts
// execute in DOCUMENT ORDER before DOMContentLoaded, so deferring preserves every existing relationship.
// The only way it breaks is a still-blocking script reading, at brace depth 0, a global that only a
// deferred script provides. Section C computes that condition over the whole file set.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) pass++; else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

// =================================================================================================
// THE SHIPPED index.html, PARSED THE WAY A BROWSER WOULD
// =================================================================================================
/** HTML comments first: several of them quote the words "script src" while explaining an eager load, and
 *  a raw scan pairs an opening tag inside a comment with a closing tag far below, swallowing real tags. */
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, function (c) { return c.replace(/[^\n]/g, ' '); });
}
function scriptTags(html) {
  var h = stripComments(html), out = [], m;
  var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  while ((m = re.exec(h))) {
    var attrs = m[1];
    out.push({
      order: out.length + 1,
      src: (/\bsrc="([^"]+)"/.exec(attrs) || [, null])[1],
      defer: /\bdefer\b/.test(attrs),
      async: /\basync\b/.test(attrs),
      inline: !/\bsrc="/.test(attrs),
      body: m[2]
    });
  }
  return out;
}
var INDEX = read('index.html');
var TAGS = scriptTags(INDEX);
function rel(t) { return t.src ? t.src.replace(/\?.*$/, '') : null; }
var BLOCKING = TAGS.filter(function (t) { return !t.defer && !t.async; });
var DEFERRED = TAGS.filter(function (t) { return t.defer; });

// =================================================================================================
section('A. THE DOCUMENT — what the browser is actually told to do');
// =================================================================================================
// An independent count, so a parser bug in this suite cannot agree with itself.
var srcCount = (stripComments(INDEX).match(/<script\b[^>]*\bsrc=/g) || []).length;
var tagCount = (stripComments(INDEX).match(/<script\b/g) || []).length;
eq(TAGS.length, srcCount, 'A1 every script tag parsed carries a src — cross-checked independently');
eq(TAGS.length, tagCount, 'A2 and no tag was missed');
eq(TAGS.filter(function (t) { return t.inline; }).length, 0,
  'A3 there are NO inline scripts — nothing can interleave between deferred files');
eq(TAGS.filter(function (t) { return t.async; }).length, 0,
  'A4 and no `async` anywhere: async would abandon execution order, which defer preserves');

ok(BLOCKING.length <= 8, 'A5 §3 Phase 0 is small: ' + BLOCKING.length + ' parser-blocking tags', BLOCKING.length);
ok(DEFERRED.length > 60, 'A6 §4 the bulk of the application defers: ' + DEFERRED.length + ' tags', DEFERRED.length);

var PHASE0 = BLOCKING.map(rel);
console.log('   Phase 0: ' + PHASE0.map(function (p) { return p.replace('assets/js/', ''); }).join(' -> '));

function bytesOf(list) {
  return list.reduce(function (s, t) {
    var r = rel(t);
    if (!r || /^https?:/.test(r)) return s;
    try { return s + fs.statSync(path.join(REPO, r)).size; } catch (e) { return s; }
  }, 0);
}
var blockingBytes = bytesOf(BLOCKING), deferredBytes = bytesOf(DEFERRED);
console.log('   parser-blocking local JS: ' + (blockingBytes / 1048576).toFixed(3) + ' MB');
console.log('   deferred local JS       : ' + (deferredBytes / 1048576).toFixed(2) + ' MB  (+2 CDN, ~1.10 MB measured)');
ok(blockingBytes < 120 * 1024,
  'A7 §7 parser-blocking JS is under 120 KB (was 5.23 MB)', (blockingBytes / 1024).toFixed(0) + ' KB');

// The two CDN libraries must not be on the critical path, and must not have been silently changed.
var cdn = TAGS.filter(function (t) { return t.src && /^https?:/.test(t.src); });
eq(cdn.length, 2, 'A8 §5 exactly two third-party scripts');
cdn.forEach(function (t) {
  ok(t.defer, 'A9 §5 the third-party library is deferred, off the Home critical path: ' + t.src.split('/').pop());
});
// §5 — this round may move an approved URL, never change it. Pinned to what was audited.
eq(cdn.map(function (t) { return t.src; }).sort(),
  ['https://cdn.jsdelivr.net/npm/chart.js', 'https://cdn.jsdelivr.net/npm/exceljs/dist/exceljs.min.js'],
  'A10 §5 neither third-party URL or version was changed by this round');

// =================================================================================================
section('B. THE CLOCK IS HOME-OWNED, AND THERE IS ONLY ONE OF IT');
// =================================================================================================
var APP = read('assets/js/app.js');
var HOME = read('assets/js/pages/home.js');
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
var APPC = codeOnly(APP), HOMEC = codeOnly(HOME);

ok(APPC.indexOf('function updateWorldTimes') === -1, 'B1 §4 app.js no longer defines the clock');
ok(APPC.indexOf('function initWorldTimes') === -1, 'B2 §4 nor starts it');
ok(APPC.indexOf('initWorldTimes()') === -1, 'B3 §4 and the boot handler does not call it — no second authority');
ok(HOMEC.indexOf('function updateWorldTimes') > -1, 'B4 home.js owns the paint');
ok(HOMEC.indexOf('function initWorldTimes') > -1, 'B5 and the start');
ok(HOMEC.indexOf('function stopWorldTimes') > -1, 'B6 §3 and the stop — an unmounted route must not tick');
eq((HOMEC.match(/setInterval\(/g) || []).length, 1, 'B7 exactly one setInterval in the Home module');
eq((APPC.match(/setInterval\(updateWorldTimes/g) || []).length, 0, 'B8 and none left in app.js');

// The clock must not acquire a data dependency, ever.
['KM.api', 'getWorkspace', 'fetch(', 'await ', '.then(', 'executeCommand'].forEach(function (tok) {
  var fnSrc = HOME.slice(HOME.indexOf('function updateWorldTimes'), HOME.indexOf('function initWorldTimes'));
  ok(fnSrc.indexOf(tok) === -1, 'B9 the clock contains no "' + tok + '" — it is local arithmetic');
});
// home.js as a whole still issues no API request (§6.21).
['KM.api.getWorkspace', 'executeCommand', 'loadOperationDb'].forEach(function (tok) {
  ok(HOMEC.indexOf(tok) === -1, 'B10 §6.21 home.js adds no API request: no "' + tok + '"');
});

// =================================================================================================
section('C. DEFER IS ORDER-SAFE — computed over every file, not asserted');
// =================================================================================================
// A deferred script executes after every blocking script. So the ONLY breakage `defer` can cause is a
// still-blocking script reading, at brace depth 0, a global that only a deferred script provides.
function blank(src) {
  var out = '', i = 0, n = src.length;
  while (i < n) {
    var c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += (src[i] === '\n' ? '\n' : ' '); i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; out += ' '; i++;
      while (i < n && src[i] !== q) { if (src[i] === '\\') { out += ' '; i++; } out += (src[i] === '\n' ? '\n' : ' '); i++; }
      out += ' '; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
function depth0(src) {
  var b = blank(src), depth = 0, start = 0, parts = [];
  for (var i = 0; i < b.length; i++) {
    var c = b[i];
    if (c === '{' || c === '(' || c === '[') { if (depth === 0) parts.push(b.slice(start, i)); depth++; }
    else if (c === '}' || c === ')' || c === ']') { depth--; if (depth === 0) start = i + 1; if (depth < 0) depth = 0; }
  }
  if (depth === 0) parts.push(b.slice(start));
  return parts.join('\n');
}
var RESERVED = {}; ('var let const function return if else for while do switch case break continue new typeof '
  + 'instanceof delete void in of this null true false undefined try catch finally throw class extends super '
  + 'yield await async static get set default export import from as with debugger arguments eval')
  .split(' ').forEach(function (w) { RESERVED[w] = 1; });
var HOST = {}; ('window document console Math JSON Date Array Object String Number Boolean RegExp Error Promise '
  + 'Map Set WeakMap Symbol parseInt parseFloat isNaN isFinite encodeURIComponent decodeURIComponent setTimeout '
  + 'setInterval clearTimeout clearInterval fetch localStorage sessionStorage location navigator history '
  + 'requestAnimationFrame cancelAnimationFrame alert confirm prompt performance URL URLSearchParams Intl '
  + 'Function Blob FormData Headers Request Response AbortController TextEncoder TextDecoder structuredClone '
  + 'globalThis self top parent screen CustomEvent Event MutationObserver IntersectionObserver')
  .split(' ').forEach(function (w) { HOST[w] = 1; });

var provides = {}, usesAt0 = {};
TAGS.forEach(function (t) {
  var r = rel(t);
  if (!r || /^https?:/.test(r)) return;
  var src;
  try { src = read(r); } catch (e) { return; }
  var d0 = depth0(src), mm;
  var FN = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  while ((mm = FN.exec(src))) (provides[mm[1]] = provides[mm[1]] || []).push(t);
  [/\bvar\s+([A-Za-z_$][\w$]*)\s*=/g, /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g].forEach(function (P) {
    var x; while ((x = P.exec(d0))) (provides[x[1]] = provides[x[1]] || []).push(t);
  });
  var ID = /([A-Za-z_$][\w$]*)/g, u = {};
  while ((mm = ID.exec(d0))) {
    var id = mm[1];
    if (RESERVED[id] || HOST[id]) continue;
    if (d0.charAt(mm.index - 1) === '.') continue;
    if (d0.charAt(ID.lastIndex) === ':') continue;
    u[id] = 1;
  }
  usesAt0[t.order] = Object.keys(u);
});

var breaks = [];
BLOCKING.forEach(function (t) {
  (usesAt0[t.order] || []).forEach(function (sym) {
    var provs = provides[sym];
    if (!provs || !provs.length) return;
    if (provs.indexOf(t) > -1) return;                       // self-provided
    if (provs.some(function (p) { return !p.defer; })) return; // some blocking provider exists
    breaks.push(rel(t) + ' reads ' + sym + ' at depth 0, provided only by deferred ' + rel(provs[0]));
  });
});
eq(breaks, [], 'C1 §4 no parser-blocking script reads a deferred script\'s global at depth 0');

// C1 came back empty, and the honest reading of that is worth stating: the five Phase 0 files read NO
// cross-file global at depth 0 at all. That is a property of the set, not a broken scan — so the
// anti-vacuity check has to exercise the same machinery where such reads certainly do exist.
// The rule, factored out so the real run and the planted control use the SAME code.
function breaksFor(blockingList, usesFor) {
  var out = [];
  blockingList.forEach(function (t) {
    (usesFor(t) || []).forEach(function (sym) {
      var provs = provides[sym];
      if (!provs || !provs.length) return;
      if (provs.indexOf(t) > -1) return;
      if (provs.some(function (p) { return !p.defer; })) return;
      out.push(rel(t) + ' reads ' + sym);
    });
  });
  return out;
}
// POSITIVE CONTROL. `DataRepo` is provided only by utils/data.js, which this round defers. A blocking
// script that read it at depth 0 would be a genuine ReferenceError at boot — precisely the failure §4C
// forbids trading the stall for. Plant exactly that and require the rule to catch it; a checker that
// stays silent on a planted break tells us nothing when it is silent on the real document.
ok((provides['DataRepo'] || []).length > 0 && (provides['DataRepo'] || []).every(function (p) { return p.defer; }),
  'C2a the control symbol DataRepo is provided only by a DEFERRED file');
var planted = { order: -1, src: 'assets/js/__planted__.js', defer: false, async: false };
var plantedBreaks = breaksFor(BLOCKING.concat([planted]), function (t) {
  return t === planted ? ['DataRepo'] : (usesAt0[t.order] || []);
});
eq(plantedBreaks, ['assets/js/__planted__.js reads DataRepo'],
  'C2b the break rule CATCHES a planted blocking read of a deferred global — so C1 means something');
eq(breaksFor(BLOCKING, function (t) { return usesAt0[t.order] || []; }), [],
  'C2c and the same rule, run on the real document, finds nothing');
eq(BLOCKING.map(function (t) { return (usesAt0[t.order] || []).filter(function (sym) {
    var p = provides[sym]; return p && p.length && p.indexOf(t) === -1; }).length; }).reduce(function (a, b) { return a + b; }, 0),
  0, 'C2b and Phase 0 reads none of them — it depends on nothing that defers');

// Deferred scripts that register DOMContentLoaded still work: defer runs BEFORE that event.
var dclDeferred = DEFERRED.filter(function (t) {
  var r = rel(t); if (!r || /^https?:/.test(r)) return false;
  try { return /addEventListener\s*\(\s*['"]DOMContentLoaded/.test(read(r)); } catch (e) { return false; }
});
ok(dclDeferred.length > 0, 'C3 ' + dclDeferred.length + ' deferred scripts register DOMContentLoaded');
ok(TAGS.every(function (t) { return !t.async; }),
  'C4 none of them is `async`, which would let the event fire first');

// =================================================================================================
section('D. THE LOADER HARNESS — Phase 0 executed for real');
// =================================================================================================
function makeDom() {
  var byId = {};
  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null, attrs: {},
      style: {}, _text: '', className: '', _id: '', hidden: false, _html: '',
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; }
      },
      setAttribute: function (k, v) { e.attrs[k] = String(v); if (k === 'id') e.id = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      addEventListener: function () {}, removeEventListener: function () {},
      appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
      removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); return c; },
      remove: function () { if (e.parentNode) e.parentNode.removeChild(e); },
      querySelector: function (s) { var r = e.querySelectorAll(s); return r.length ? r[0] : null; },
      querySelectorAll: function (sel) {
        var want = String(sel).trim(), out = [];
        function match(n) {
          if (want.charAt(0) === '.') return n.classList.contains(want.slice(1));
          if (want.charAt(0) === '#') return n.id === want.slice(1);
          return n.tagName === want.toUpperCase();
        }
        (function walk(n) { n.children.forEach(function (c) { if (match(c)) out.push(c); walk(c); }); })(e);
        return out;
      }
    };
    Object.defineProperty(e, 'id', { get: function () { return e._id; },
      set: function (v) { e._id = String(v); e.attrs.id = String(v); byId[e._id] = e; } });
    Object.defineProperty(e, 'textContent', {
      get: function () { return e._text || e.children.map(function (c) { return c.textContent; }).join(''); },
      set: function (v) { e._text = String(v); e.children = []; } });
    Object.defineProperty(e, 'innerHTML', { get: function () { return e._html; },
      set: function (v) { e._html = String(v); e.children = []; } });
    return e;
  }
  var doc = { body: El('body'), head: El('head'), createElement: El,
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function (s) { return doc.body.querySelector(s); },
    querySelectorAll: function (s) { return doc.body.querySelectorAll(s); },
    addEventListener: function (t, fn) { (doc._dcl = doc._dcl || []).push({ t: t, fn: fn }); } };

  // the world-time bar exactly as index.html ships it: static markup, present before any script runs
  var bar = El('div'); bar.id = 'world-time-bar'; doc.body.appendChild(bar);
  ['AU', 'JP', 'DE', 'UK', 'US-East', 'US-Middle', 'US-West'].forEach(function (z) {
    var card = El('div'); card.id = 'card-' + z;
    [['local-date', '--/--/--'], ['local-time', '--:--'], ['timezone-offset', 'TP--']].forEach(function (p) {
      var cell = El('div'); cell.className = p[0]; cell.textContent = p[1]; card.appendChild(cell);
    });
    bar.appendChild(card);
  });
  // #home-section is deliberately ABSENT: it is what the Home partial injects, and pre-creating it makes
  // _ensureHomeMarkup short-circuit so the fetch path is never exercised.
  ['home-mount', 'eventsList', 'announcementsList', 'urgentIssuesList', 'todoList',
   'goalYear', 'achievementRate', 'goalAmount', 'salesAmount', 'progressFill', 'progressText']
    .forEach(function (id) { var d = El(id === 'progressFill' ? 'div' : 'div'); d.id = id; doc.body.appendChild(d); });
  return { document: doc, El: El, byId: byId };
}

/**
 * Run PHASE 0 — the non-deferred tags — exactly as the browser would, and nothing else.
 * @param opts.partial  'pending' (default) | 'ok' | 'fail' — how the Home partial fetch behaves
 * @param opts.hash     location.hash for the deep-link guard
 * @param opts.src      {relPath: mutatedSource} overrides for mutation testing
 * @param opts.tags     override tag list (mutation testing of index.html itself)
 */
function boot(opts) {
  opts = opts || {};
  var dom = makeDom();
  var intervals = [], cleared = [], fetches = [], errors = [];
  var ctx = {
    console: { log: function () {}, warn: function () {}, error: function (m) { errors.push(String(m)); } },
    window: null, document: dom.document,
    Date: Date, Math: Math, JSON: JSON, Promise: Promise, String: String, Number: Number,
    Object: Object, Array: Array, RegExp: RegExp, Error: Error, isNaN: isNaN, parseInt: parseInt,
    location: { hash: opts.hash || '' },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    setInterval: function (fn, ms) { var h = { fn: fn, ms: ms, live: true }; intervals.push(h); return h; },
    clearInterval: function (h) { if (h) { h.live = false; cleared.push(h); } },
    setTimeout: function (fn) { return fn && 0; },
    fetch: function (u) {
      fetches.push(u);
      if (opts.partial === 'ok') return Promise.resolve({ ok: true, text: function () { return Promise.resolve('<div id="home-section"></div>'); } });
      if (opts.partial === 'fail') return Promise.reject(new Error('partial unavailable'));
      return new Promise(function () {});                       // pending forever — the default
    },
    __intervals: intervals, __cleared: cleared, __fetches: fetches, __errors: errors
  };
  ctx.window = ctx;
  vm.createContext(ctx);

  var ran = [];
  (opts.tags || BLOCKING).forEach(function (t) {
    var r = rel(t);
    if (!r || /^https?:/.test(r)) return;                       // a CDN in Phase 0 would be a defect, caught in A9
    var src = (opts.src && opts.src[r]) !== undefined ? opts.src[r] : read(r);
    try { vm.runInContext(src, ctx, { filename: r }); ran.push(r); }
    catch (e) { errors.push(r + ': ' + e.message); }
  });

  ctx.__ran = ran;
  ctx.__clock = function () {
    return ['AU', 'JP', 'DE', 'UK', 'US-East', 'US-Middle', 'US-West'].map(function (z) {
      var c = dom.document.getElementById('card-' + z);
      return c.querySelector('.local-date').textContent + ' ' + c.querySelector('.local-time').textContent;
    });
  };
  ctx.__painted = function () { return ctx.__clock().every(function (s) { return s.indexOf('--') === -1; }); };
  ctx.__liveIntervals = function () { return intervals.filter(function (h) { return h.live; }).length; };
  ctx.__fireDCL = function () { (dom.document._dcl || []).forEach(function (h) { if (h.t === 'DOMContentLoaded') h.fn(); }); };
  return ctx;
}

// =================================================================================================
section('E. §6.1-6.11 — THE HOME MATRIX');
// =================================================================================================
var b1 = boot();
eq(b1.__errors, [], 'E1 Phase 0 executes with no error', b1.__errors);
console.log('   ran: ' + b1.__ran.map(function (r) { return r.replace('assets/js/', ''); }).join(' -> '));

// 6.2 — the headline claim.
ok(b1.__painted(),
  'E2 §6.2 the world clocks show a real date and time with ONLY Phase 0 executed', b1.__clock()[0]);
ok(b1.__clock()[0].indexOf('--/--') === -1, 'E3 §6.2 no card is left at `--/--`');

// 6.1 / 6.5 / 6.6 / 6.7 / 6.8 — every noncritical script is, by construction, absent from this run.
eq(b1.__ran.length, BLOCKING.filter(function (t) { return rel(t) && !/^https?:/.test(rel(t)); }).length,
  'E4 §6.1 only Phase 0 ran — every other module is still "pending"');
ok(b1.__ran.indexOf('assets/js/pages/inventory-replenishment.js') === -1,
  'E5 §6.7 Inventory Replenishment (936 KB) had not loaded, and the clock did not care');
ok(b1.__ran.indexOf('assets/js/pages/request-order.js') === -1,
  'E6 §6.8 nor Request Order (353 KB)');
ok(b1.__ran.indexOf('assets/js/api/operation-system-db-api.js') === -1,
  'E7 §6.5/6.6 nor the DB API, Chart.js or ExcelJS');

// 6.3 / 6.4 — the capability read cannot block what never waited for it.
ok(b1.__fetches.every(function (u) { return String(u).indexOf('script.google') === -1; }),
  'E8 §6.3 Phase 0 issues no Apps Script request at all');
eq(b1.__fetches.filter(function (u) { return String(u).indexOf('home.html') > -1; }).length, 1,
  'E9 the only Phase 0 fetch is the Home partial');
var bFail = boot({ partial: 'fail' });
ok(bFail.__painted(), 'E10 §6.4 the clock paints even when the Home partial FAILS');
var bOk = boot({ partial: 'ok' });
ok(bOk.__painted(), 'E11 and when it succeeds');

// 6.9 / 6.10 / 6.11 — interval ownership.
eq(b1.__liveIntervals(), 1, 'E12 §6.9 the Home mount created exactly ONE clock interval');
b1.KM.lifecycle.switchTo('some-other-section');
eq(b1.__liveIntervals(), 0, 'E13 §6.10 unmount cleared it');
b1.KM.lifecycle.switchTo('home-section');
eq(b1.__liveIntervals(), 1, 'E14 §6.11 remount created ONE new interval, not two');
b1.KM.lifecycle.switchTo('x'); b1.KM.lifecycle.switchTo('home-section');
b1.KM.lifecycle.switchTo('y'); b1.KM.lifecycle.switchTo('home-section');
eq(b1.__liveIntervals(), 1, 'E15 §6.19 and still exactly one after three full route cycles');
eq(b1.__intervals.length, 4, 'E16 four mounts created four intervals in total, three of them stopped');

// A second initWorldTimes() call must not start a rival interval (§4: no second authority).
b1.initWorldTimes(); b1.initWorldTimes();
eq(b1.__liveIntervals(), 1, 'E17 §4 a stale caller calling initWorldTimes again does NOT add an interval');

// 6.20 — app.js's boot handler must still be harmless when it eventually runs.
ok(codeOnly(read('assets/js/app.js')).indexOf('initWorldTimes') === -1,
  'E18 §6.20 app.js cannot double-start the clock: the call is gone');

// =================================================================================================
section('F. §6.12-6.18 — ROUTING IS UNCHANGED');
// =================================================================================================
// The early mount must not hijack a deep link.
var bHash = boot({ hash: '#inventory-section' });
ok(!bHash.__painted(),
  'F1 §6.18 a deep link to another section is NOT overridden by the early Home mount');
eq(bHash.__liveIntervals(), 0, 'F2 §6.18 and no Home clock is started for it');
ok(bHash.KM.lifecycle.currentEpoch() === 0 || bHash.__ran.length > 0,
  'F3 §6.18 the lifecycle is present and simply was not asked to mount Home');
// ...but app.js's own boot still mounts Home for such a load, exactly as before this round.
ok(read('assets/js/app.js').indexOf("KM.lifecycle.switchTo('home-section')") > -1,
  'F4 §6.16 app.js still performs the canonical initial navigation — no second router replaced it');

var bHome = boot({ hash: '#home-section' });
ok(bHome.__painted(), 'F5 §6.18 an explicit #home-section deep link does mount Home early');

// One router, one lifecycle: home.js must not have grown its own.
var HOMEC2 = codeOnly(read('assets/js/pages/home.js'));
ok(HOMEC2.indexOf('addEventListener(\'popstate\'') === -1 && HOMEC2.indexOf('addEventListener("popstate"') === -1,
  'F6 §3 home.js did not add a second router (no popstate listener)');
eq((HOMEC2.match(/KM\.lifecycle\.register\(/g) || []).length, 1, 'F7 it registers exactly one section');
// Two call sites: showHome() (pre-existing, the logo) and this round's Phase 0 handoff. Both call the ONE
// authority; neither implements navigation. Pinned so a third cannot appear unnoticed.
eq((HOMEC2.match(/KM\.lifecycle\.switchTo\(/g) || []).length, 2,
  'F8 §3 home.js calls the one lifecycle authority from exactly two known sites');
ok(read('assets/js/core/lifecycle.js') === read('assets/js/core/lifecycle.js'),
  'F9 lifecycle.js is read, not modified (see H for the byte-identity assertion)');

// 6.14 — provider before consumer, for the Phase 0 set specifically.
var order = BLOCKING.map(rel).filter(Boolean);
ok(order.indexOf('assets/js/core/namespace.js') === 0, 'F10 §6.14 the namespace is created first');
ok(order.indexOf('assets/js/core/lifecycle.js') < order.indexOf('assets/js/pages/home.js'),
  'F11 §6.14 the lifecycle authority exists before Home registers with it');
ok(order.indexOf('assets/js/core/partial-loader.js') < order.indexOf('assets/js/pages/home.js'),
  'F12 §6.14 and the partial loader before Home asks it to load the partial');

// =================================================================================================
section('G. MUTATION — every defect restored must be caught');
// =================================================================================================
// Each entry returns whether the behaviour is CORRECT. The loop derives caught = !correct, so section H's
// vacuity question is the honest one: neutered, is the behaviour correct again?
/* ONE MUTATION HANDLE. Five of these mutants change STRUCTURE — a defer attribute, the tag order, an
 * appended function — rather than swapping source text. When only source swaps were neuterable, those
 * five reported "caught" under both conditions and the vacuity audit correctly called them vacuous.
 * Every operation a mutant can perform now lives here, so neutering the handle neuters all of them. */
function realHandle() {
  return {
    live: true,
    src: function (src, a, b) {
      var n = src.replace(/\r\n/g, '\n');
      if (n.split(a).length - 1 !== 1) throw new Error('anchor not unique: ' + a.slice(0, 80));
      return n.split(a).join(b);
    },
    append: function (src, text) { return src + text; },
    undefer: function (list, relPath) {
      return list.map(function (t) {
        var c = Object.assign({}, t);
        if (rel(c) === relPath || (relPath.charAt(0) === '~' && (c.src || '').indexOf(relPath.slice(1)) > -1)) c.defer = false;
        return c;
      });
    },
    undeferAll: function (list) {
      return list.map(function (t) { var c = Object.assign({}, t); c.defer = false; return c; });
    },
    hoist: function (list, relPath, beforeRel) {
      var out = list.slice();
      var hi = out.map(rel).indexOf(relPath), bi = out.map(rel).indexOf(beforeRel);
      if (hi < 0 || bi < 0) return out;
      var item = out[hi]; out.splice(hi, 1);
      out.splice(out.map(rel).indexOf(beforeRel), 0, item);
      return out;
    }
  };
}
function deadHandle() {
  return {
    live: false,
    src: function (src) { return src.replace(/\r\n/g, '\n'); },
    append: function (src) { return src; },
    undefer: function (list) { return list; },
    undeferAll: function (list) { return list; },
    hoist: function (list) { return list; }
  };
}
var HOME_REL = 'assets/js/pages/home.js';
var MUTANTS = [
  ['M1 the clock is moved back behind DOMContentLoaded', function (M) {
    var m = M.src(HOME, '            initWorldTimes();\n', '            document.addEventListener(\'DOMContentLoaded\', initWorldTimes);\n');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    return c.__painted();
  }],
  ['M2 the clock starts before Home owns its DOM and never retries on mount', function (M) {
    // started once at parse time and removed from mount: a remount then shows a dead bar
    var m = M.src(HOME, '            initWorldTimes();\n', '');
    m = M.src(m, 'window.stopWorldTimes = stopWorldTimes;', 'window.stopWorldTimes = stopWorldTimes;\ninitWorldTimes();');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    c.KM.lifecycle.switchTo('other');
    c.KM.lifecycle.switchTo('home-section');
    return c.__liveIntervals() === 1;     // correct code re-arms on remount; this mutant leaves zero
  }],
  ['M3 unmount fails to clear the interval', function (M) {
    var m = M.src(HOME, '            stopWorldTimes();   // an unmounted route must not keep a timer alive', '');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    c.KM.lifecycle.switchTo('other');
    return c.__liveIntervals() === 0;
  }],
  ['M4 remount creates a duplicate interval', function (M) {
    var m = M.src(HOME, '    if (_homeClockTimer !== null) return;\n', '');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    c.initWorldTimes(); c.initWorldTimes();
    return c.__liveIntervals() === 1;
  }],
  ['M5 a heavy route module is restored to the parser-blocking Home path', function (M) {
    var t = M.undefer(TAGS, 'assets/js/pages/inventory-replenishment.js');
    return t.filter(function (x) { return !x.defer && !x.async; })
            .every(function (x) { return rel(x) !== 'assets/js/pages/inventory-replenishment.js'; });
  }],
  ['M6 an external library is restored to the Home critical path', function (M) {
    var t = M.undefer(TAGS, '~cdn.jsdelivr.net/npm/chart.js');
    return t.filter(function (x) { return !x.defer && !x.async; })
            .every(function (x) { return !/cdn\.jsdelivr/.test(x.src || ''); });
  }],
  ['M7 a consumer is loaded before its provider', function (M) {
    // home.js hoisted ABOVE the lifecycle authority it registers with
    var c = boot({ tags: M.hoist(BLOCKING, HOME_REL, 'assets/js/core/lifecycle.js') });
    return c.__painted();      // registration is skipped, the mount never runs, nothing paints
  }],
  ['M8 the deep-link guard is removed and the early mount hijacks another route', function (M) {
    var m = M.src(HOME, "    if (!location.hash || location.hash === '#' || location.hash === '#home-section') {",
                     '    if (true) {');
    var c = boot({ hash: '#inventory-section', src: { 'assets/js/pages/home.js': m } });
    return !c.__painted();
  }],
  ['M9 a late module mutates an unmounted route', function (M) {
    // the clock keeps painting after unmount
    var m = M.src(HOME, '    if (_homeClockTimer === null) return;\n    clearInterval(_homeClockTimer);\n    _homeClockTimer = null;',
                     '    return;');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    c.KM.lifecycle.switchTo('other');
    return c.__liveIntervals() === 0;
  }],
  ['M10 the legacy eager clock remains in app.js alongside the new one', function (M) {
    var appWith = M.append(APP, '\nfunction initWorldTimes(){ setInterval(function(){}, 1000); }\n');
    return codeOnly(appWith).indexOf('function initWorldTimes') === -1;
  }],
  ['M11 the clock is started inside the partial fetch\'s .then', function (M) {
    // THE REAL SHAPE OF "a module failure blanks the shell": put the local clock behind the remote
    // thing. A pending or rejected partial then leaves the bar at `--/--` exactly as before this round.
    var m = M.src(HOME, '            initWorldTimes();\n            // Ensure partial markup',
                        '            // Ensure partial markup');
    m = M.src(m, '                if (window.setHomeShellVisible) window.setHomeShellVisible(true);',
                 '                initWorldTimes();\n                if (window.setHomeShellVisible) window.setHomeShellVisible(true);');
    var c = boot({ partial: 'fail', src: { 'assets/js/pages/home.js': m } });
    return c.__painted() && c.__liveIntervals() === 1;
  }],
  ['M12 the clock acquires a data dependency', function (M) {
    var m = M.src(HOME, '    updateWorldTimes();                      // paint immediately',
                        '    if (!window.KM.api) return;\n    updateWorldTimes();                      // paint immediately');
    var c = boot({ src: { 'assets/js/pages/home.js': m } });
    return c.__painted();
  }],
  ['M13 index.html reverts to a fully parser-blocking graph', function (M) {
    return M.undeferAll(TAGS).filter(function (x) { return !x.defer && !x.async; }).length <= 8;
  }]
];

var survived = [];
for (var i = 0; i < MUTANTS.length; i++) {
  var correct;
  try { correct = MUTANTS[i][1](realHandle()); } catch (e) { correct = 'threw:' + e.message; }
  ok(correct === false, 'G' + (i + 1) + ' ' + MUTANTS[i][0], correct);
  if (correct !== false) survived.push(MUTANTS[i][0]);
}

// =================================================================================================
section('H. VACUITY + SEALED REGRESSIONS');
// =================================================================================================
// Neuter EVERY mutation operation at once — source swap, append, defer attribute and tag order.
var vacuous = [];
for (var j = 0; j < MUTANTS.length; j++) {
  var still;
  try { still = MUTANTS[j][1](deadHandle()); } catch (e) { still = 'threw:' + e.message; }
  ok(still === true, 'H' + (j + 1) + ' neutered, ' + MUTANTS[j][0].split(' ')[0] + ' survives', still);
  if (still !== true) vacuous.push(MUTANTS[j][0]);
}

var cp = require('child_process');
function atRev(rev, rel2) {
  try { return cp.execFileSync('git', ['-C', REPO, 'show', rev + ':' + rel2], { maxBuffer: 1 << 28 }).toString('utf8').replace(/\r\n/g, '\n'); }
  catch (e) { return '__git_unavailable__'; }
}
// STILL SEALED AGAINST THE WORKING TREE. These are the shared files this round was forbidden to touch and
// no later round has needed to; comparing the live tree keeps catching an edit the moment it happens.
var SEALED = ['assets/js/core/lifecycle.js', 'assets/js/api/km-transport.js', 'assets/js/api/km-api-foundation.js',
  'assets/js/utils/resizable-columns.js', 'assets/js/utils/dual-layer-resize.js'];
// FC-SUMMARY-R3-R1 — operation-system-db-api.js leaves the BYTE seal, for the same reason fc-summary.js
// did in R2B-A2-R5 and recorded directly above: a working-tree seal turns 'the Home round did not touch
// this' into 'no round ever may', and R3-R1 widens the adapter under an authorised scope. What the Home
// round actually cared about is narrower and is asserted instead — its boot path is untouched, and the
// only growth is the slice projection, which calls the SAME canonical normalizers as the full adapter.
var DBAPI_R3 = 'assets/js/api/operation-system-db-api.js';
// EVALUATED COMMIT-TO-COMMIT. 'the Home commit changed no FC behaviour' is a statement about fa23471, not
// about whatever the tree holds today. Comparing the working tree made it a claim that every later round
// must leave FC alone, which is not what it means — FC-SUMMARY-R2B-A2-R5 adds a Country column to the
// Target table and correctly changes both of these files. Against the commit, the claim stays true, and it
// still fails if fa23471 is ever rewritten to carry an FC change.
var FC_OWNED = ['assets/css/pages/fc-overview.css', 'assets/js/pages/fc-summary.js'];
var base = atRev('3b6d83f', SEALED[0]);
if (base !== '__git_unavailable__') {
  SEALED.forEach(function (f) {
    eq(read(f).replace(/\r\n/g, '\n'), atRev('3b6d83f', f),
      'H14 §5 byte-identical to the FC release commit: ' + f.split('/').pop());
  });
  // The narrower claim that replaces the byte seal on the db-api file.
  var dbNow = read(DBAPI_R3).replace(/\r\n/g, '\n');
  var dbThen = atRev('3b6d83f', DBAPI_R3);
  ['loadOperationDb', 'getOperationDbFromSheet', 'normalizeOperationDb', 'isOperationDbApiConfigured']
    .forEach(function (fn, i) {
      var a = dbThen.indexOf('function ' + fn + '('), b = dbNow.indexOf('function ' + fn + '(');
      eq(b > -1, a > -1, 'H14a §5 the db-api boot entrypoint ' + fn + ' still exists');
    });
  ok(dbNow.indexOf('adaptFcSummaryWorkspaceSlice') > -1 && dbNow.length > dbThen.length,
    'H14b §5 and the only growth since is the R3-R1 slice projection');
  ['normalizeFcRegularForecastRecord', 'normalizeFcSpecialEventRecord',
   'normalizeFcTargetRuleRecord', 'normalizeMarketplaceRecord'].forEach(function (n, i) {
    eq((dbNow.match(new RegExp('function ' + n + '\\(', 'g')) || []).length, 1,
      'H14c.' + (i + 1) + ' §5 ' + n + ' still has exactly ONE definition — no second normalizer');
  });
  // §8 — this commit must not have touched FC behaviour.
  FC_OWNED.forEach(function (f) {
    eq(atRev('fa23471', f), atRev('3b6d83f', f),
      'H15 §8 the Home commit changed no FC behaviour: ' + f.split('/').pop());
  });
} else {
  console.log('   (git unavailable — H14/H15 skipped)');
}
// EVERY FILE THIS COMMIT CHANGES MUST CARRY THE CURRENT CACHE TOKEN.
//
// home.js sat on `r6c-navlifecycle-20260822`, which is not in ROUND_TOKENS at all — and staleAppTokenRefs
// skips unrecognised tokens by design, so it reported a clean tree while a file this round rewrites was
// pinned to a token that would never rotate. A new index.html beside a cached old home.js means the clock
// repair does not reach a returning browser. 21 of the 103 assets in index.html are on unrecorded tokens;
// only the ones this commit touches are this round's business, and the list comes from git so it cannot
// drift out of date the way a hand-written one would.
var REL = require('./_release-order.js');
var changed;
try {
  // '3b6d83f' alone compares that commit to the WORKING TREE, so this reads correctly both before this
  // round is committed and after it. Adding 'HEAD' would report nothing until the commit exists.
  changed = cp.execFileSync('git', ['-C', REPO, 'diff', '--name-only', '3b6d83f'], { maxBuffer: 1 << 24 })
    .toString('utf8').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
} catch (e) { changed = null; }
if (changed) {
  var tokens = REL.parseIndexTokens(INDEX);
  var cur = REL.currentAppToken();
  var offToken = changed.filter(function (f) {
    return Object.prototype.hasOwnProperty.call(tokens, f) && tokens[f] !== cur;
  });
  eq(offToken, [], 'H17 every changed, index-referenced asset carries the current cache token', offToken);
  // Anti-vacuity: the rule must actually be looking at files that ARE referenced by index.html.
  var covered = changed.filter(function (f) { return Object.prototype.hasOwnProperty.call(tokens, f); });
  ok(covered.length >= 2, 'H18 and it covers the shipped assets this commit changed', covered);
} else {
  console.log('   (git unavailable — H17/H18 skipped)');
}

// §6.24/6.25 — nothing here can write.
['executeCommand', 'saveTargetRule', 'migrate', 'POST'].forEach(function (tok) {
  ok(HOMEC2.indexOf(tok) === -1, 'H16 §6.25 home.js contains no write token "' + tok + '"');
});

// =================================================================================================
section('I. NO SIBLING SUITE MAY READ THESE TAGS WITH A PATTERN THAT MISSES ATTRIBUTES');
// =================================================================================================
// Adding `defer` broke six suites that matched `<script src="..."></script>` — the closing bracket
// directly after the quote. Four failed loudly, one crashed before printing anything, and the shared
// visual runner silently generated a page with NO scripts and reported "no measurements" about code it
// had never loaded. An under-matching pattern does not fail; it stops measuring, which is worse.
var TESTS_DIR = path.join(REPO, 'assets', 'tests');
// THE INVARIANT IS SIMPLER THAN ANY PARTICULAR SPELLING: a pattern that places `>` immediately after the
// closing quote cannot match a tag that carries an attribute. My first version of this rule required the
// exact `src="([^"]+)"` capture form and therefore missed two offenders that spell the path out — one of
// which CRASHED its suite and one of which left a MUTANT SURVIVING while reporting failed=0. Both are
// invisible to the canonical FAIL-line hash, so the scanner has to be the thing that catches them.
// Assembled from parts so this file does not match its own rule.
var BRITTLE = new RegExp('"' + '><' + '\\\\' + '/script>');
var offenders = [];
fs.readdirSync(TESTS_DIR).filter(function (f) { return /\.js$/.test(f); }).forEach(function (f) {
  var src;
  try { src = fs.readFileSync(path.join(TESTS_DIR, f), 'utf8'); } catch (e) { return; }
  // only files that read the ROOT index.html — a prototype index has no defer and is not this rule's business
  if (!/readFileSync\([^)]*'index\.html'|read\('index\.html'\)|join\([^)]*ROOT[^)]*,\s*'index\.html'\)/.test(src)) return;
  if (BRITTLE.test(src)) offenders.push(f);
});
eq(offenders, [], 'I1 no suite reading the root index.html anchors on `"></script>`', offenders);

// Positive control: the rule must be able to see an offender, or its silence means nothing. The sample is
// ASSEMBLED FROM PARTS rather than written out, because a file containing the forbidden literal would be
// reported by its own rule — and excluding this file by name would blind the rule to its own regressions.
var CONTROL = 'var x = SRC.index.match(/<script src="([^"]+)"><' + '\\' + '/script>/g);';
ok(BRITTLE.test(CONTROL), 'I2 the rule recognises the pattern it forbids', CONTROL);
// And the two counts that made the difference, stated as evidence rather than prose.
// Assembled, not written out — for the same reason as CONTROL above.
var STRICT_RE = new RegExp('<script src="([^"]+)"><' + '\\' + '/script>', 'g');
var strictCount = (INDEX.match(STRICT_RE) || []).length;
var tolerantCount = (INDEX.match(/<script\s[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g) || []).length;
ok(strictCount < tolerantCount / 4,
  'I3 the brittle pattern really does under-match this document (' + strictCount + ' of ' + tolerantCount + ')',
  [strictCount, tolerantCount]);
eq(tolerantCount, TAGS.length, 'I4 and the tolerant one agrees with the parser used throughout this suite');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + MUTANTS.length + ' mutants, ' + survived.length + ' survived'
  + (vacuous.length ? ', ' + vacuous.length + ' VACUOUS' : ', vacuity clean'));
if (survived.length) console.error('SURVIVED: ' + survived.join(' | '));
if (vacuous.length) console.error('VACUOUS:  ' + vacuous.join(' | '));
process.exit(fail === 0 && !survived.length && !vacuous.length ? 0 : 1);
