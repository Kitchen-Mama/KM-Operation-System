// Kitchen Mama Operation System — INCIDENT-BOOT-FC-R2-F1
// A PAGE THAT THROWS WHILE LOADING IS A ROUTE THAT CANNOT MOUNT
// Run: node assets/tests/route-mount-registration-boot-fc-r2-f1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// THE INCIDENT. After release 3f90cd4 the FC Summary menu item went active and the entire main content
// area stayed white — no title, no Loading, no Retry, no error. Nothing in the network tab looked wrong,
// because nothing in the network tab WAS wrong: every file returned 200 with the exact committed bytes.
//
// The cause was one line. cd3fd8f deleted a dead four-function chain from fc-summary.js, and the census
// that authorised the deletion searched for CALL SITES — `getEffectiveFcSafe(` — so it did not see
//
//     window.fcDebug = { ..., getEffectiveFc: getEffectiveFcSafe, ... };
//
// which names the function without calling it. A bare identifier in an object literal is evaluated like
// any other expression, so that line threw ReferenceError at load.
//
// WHY THAT PRODUCES A WHITE PAGE RATHER THAN AN ERROR. A classic <script> that throws at top level is
// ABORTED AT THAT POINT: everything above the throw exists, everything below it never comes into being,
// the browser logs one console error, and then it loads the next script as though nothing happened. The
// throw was at line 1759 of 5065. `KM.lifecycle.register('fc-summary-section', ...)` is at line 5044.
// So the section was never registered, `switchTo` found no controller, and the route went active with no
// mount to run. Every symptom follows from that, including the absence of an error surface: the failure
// happened during script load, long before anything had a route to report it on.
//
// WHAT THIS SUITE ASSERTS, and why it is stronger than re-checking that one line: it loads the REAL
// script graph in the REAL order index.html declares, into one shared global the way a browser does,
// and then asks two questions no static read can answer —
//
//   1. did every shipped script evaluate to completion?
//   2. is every route the navigation can switch to actually registered by the time loading ends?
//
// The second question is the load-bearing one. It is answered by EXECUTION, so it covers the page that
// registers through a variable (`register(P.SECTION_ID, ...)`) which no grep for a string literal can
// see, and it automatically covers pages that do not exist yet.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var INDEX = read('index.html');
var APP = read('assets/js/app.js');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

// ================================================================================================
// THE SCRIPT GRAPH, TAKEN FROM index.html RATHER THAN FROM A LIST MAINTAINED HERE. A hand-kept list
// would drift from the page it claims to describe, and the drift would be invisible: the suite would
// keep passing while testing a graph the browser no longer loads.
// ================================================================================================
function scriptGraph(html) {
  var out = [], re = /<script[^>]*\ssrc="([^"]+)"[^>]*>/g, m;
  while ((m = re.exec(html)) !== null) {
    var src = m[1];
    if (/^https?:|^\/\//.test(src)) continue;            // CDN — not ours to evaluate
    out.push({ rel: src.split('?')[0], tag: m[0], deferred: /\sdefer\b/.test(m[0]) });
  }
  return out;
}

// Sections the navigation can actually switch to.
function switchableSections(appSrc) {
  var s = {}, re = /'[A-Za-z-]+':\s*'([a-z-]+-section)'/g, m;
  while ((m = re.exec(appSrc)) !== null) s[m[1]] = 1;
  return Object.keys(s).sort();
}

// ================================================================================================
// THE BROWSER SHIM. Deliberately minimal and deliberately NOT jsdom: the question is whether a script
// completes and registers, not whether it renders. Every DOM accessor answers something harmless so a
// page cannot fail for a reason a real browser would not have.
// ================================================================================================
function makeElement() {
  var e = {
    style: {}, dataset: {}, children: [], childNodes: [], value: '', innerHTML: '', textContent: '',
    options: [], selectedIndex: -1, checked: false, disabled: false, id: '', className: '',
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function () {}, insertBefore: function () {}, replaceChild: function () {}, remove: function () {},
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    setAttribute: function () {}, getAttribute: function () { return null; },
    removeAttribute: function () {}, hasAttribute: function () { return false; },
    querySelector: function () { return makeElement(); }, querySelectorAll: function () { return []; },
    closest: function () { return null; }, matches: function () { return false; },
    focus: function () {}, blur: function () {}, click: function () {}, submit: function () {},
    cloneNode: function () { return makeElement(); }, contains: function () { return false; },
    insertAdjacentHTML: function () {}, scrollIntoView: function () {},
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  };
  return e;
}

function makeWorld() {
  var registered = [];     // [{ id, handlers }] in registration order
  var intervals = 0;
  var doc = {
    readyState: 'loading', title: '',
    documentElement: makeElement(), body: makeElement(), head: makeElement(),
    addEventListener: function () {}, removeEventListener: function () {},
    createElement: function () { return makeElement(); },
    createDocumentFragment: function () { return makeElement(); },
    createTextNode: function () { return makeElement(); },
    getElementById: function () { return null; },
    getElementsByClassName: function () { return []; },
    getElementsByTagName: function () { return []; },
    getElementsByName: function () { return []; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    execCommand: function () { return false; }, cookie: ''
  };
  var win = {
    KM: {
      lifecycle: {
        register: function (id, handlers) { registered.push({ id: String(id), handlers: Object.keys(handlers || {}) }); },
        switchTo: function () {}, commitGuard: function () { return true; },
        currentEpoch: function () { return 1; }, epochOf: function () { return 1; },
        isActive: function () { return true; }, unregister: function () {}
      },
      core: {}, DB: {}, state: {}, api: {}, utils: {}
    },
    location: { href: 'https://example.invalid/', hash: '', pathname: '/', search: '', origin: 'https://example.invalid' },
    history: { pushState: function () {}, replaceState: function () {}, back: function () {}, forward: function () {} },
    navigator: { userAgent: 'node-shim', language: 'en', onLine: true, clipboard: { writeText: function () { return Promise.resolve(); } } },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, clear: function () {} },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {}, clear: function () {} },
    addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return true; },
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { intervals++; return intervals; }, clearInterval: function () {},
    requestAnimationFrame: function () { return 0; }, cancelAnimationFrame: function () {},
    requestIdleCallback: function () { return 0; },
    matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {}, removeListener: function () {} }; },
    fetch: function () { return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve({}); }, text: function () { return Promise.resolve(''); } }); },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; },
    scrollTo: function () {}, alert: function () {}, confirm: function () { return false; }, prompt: function () { return null; },
    open: function () { return null; }, print: function () {}, close: function () {},
    document: doc,
    console: { log: function () {}, warn: function () {}, error: function () {}, info: function () {}, debug: function () {}, table: function () {}, group: function () {}, groupEnd: function () {} }
  };
  win.window = win; win.self = win; win.globalThis = win; win.top = win; win.parent = win; win.frames = win;
  doc.defaultView = win;

  var ctx = vm.createContext(win);
  ['Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'Node', 'HTMLElement', 'Element',
   'FormData', 'Blob', 'File', 'FileReader', 'Image', 'XMLHttpRequest', 'AbortController',
   'IntersectionObserver', 'MutationObserver', 'ResizeObserver', 'Worker'].forEach(function (n) {
    ctx[n] = function () { return makeElement(); };
  });
  ctx.URL = URL; ctx.URLSearchParams = URLSearchParams; ctx.Promise = Promise;
  ctx.TextEncoder = TextEncoder; ctx.TextDecoder = TextDecoder;
  ctx.setTimeout = win.setTimeout; ctx.clearTimeout = win.clearTimeout;
  ctx.setInterval = win.setInterval; ctx.clearInterval = win.clearInterval;
  ctx.console = win.console; ctx.document = doc; ctx.fetch = win.fetch;
  ctx.requestAnimationFrame = win.requestAnimationFrame;
  ctx.getComputedStyle = win.getComputedStyle; ctx.matchMedia = win.matchMedia;
  ctx.localStorage = win.localStorage; ctx.sessionStorage = win.sessionStorage;
  ctx.navigator = win.navigator; ctx.location = win.location; ctx.history = win.history;
  ctx.alert = win.alert; ctx.confirm = win.confirm;

  return { win: win, ctx: ctx, registered: registered, doc: doc };
}

// Load the graph in declared order into ONE global, exactly as the browser does. `overrides` lets a
// mutant replace one file's source without touching disk.
//
// THE RECORDER IS INSTALLED OVER THE REAL LIFECYCLE, NOT IN PLACE OF IT. namespace.js assigns
// `window.KM = { ... }` outright and lifecycle.js then installs the genuine `register` over a private
// closure registry. A stub planted before the graph runs is therefore thrown away by the second script
// and records nothing — which is exactly what the first draft of this suite did, reporting that no page
// registers anything. So after every script the real `register` is re-wrapped: the recorder observes the
// call and DELEGATES to the authentic implementation, so what is measured is the real registry being
// filled, not a fixture agreeing with itself.
function loadGraph(graph, overrides) {
  overrides = overrides || {};
  var world = makeWorld();
  var throws = [];
  function installRecorder() {
    var lc = world.win.KM && world.win.KM.lifecycle;
    if (!lc || typeof lc.register !== 'function' || lc.register.__kmRecorded) return;
    var real = lc.register;
    var wrapped = function (id, hooks) {
      world.registered.push({ id: String(id), handlers: Object.keys(hooks || {}) });
      try { return real.apply(this, arguments); } catch (e) { return undefined; }
    };
    wrapped.__kmRecorded = true;
    lc.register = wrapped;
  }
  installRecorder();
  graph.forEach(function (g) {
    var src;
    if (Object.prototype.hasOwnProperty.call(overrides, g.rel)) { src = overrides[g.rel]; }
    else {
      try { src = read(g.rel); } catch (e) { throws.push({ rel: g.rel, name: 'MissingFile', message: String(e.message), line: 0 }); return; }
    }
    try {
      vm.runInContext(src, world.ctx, { filename: g.rel });
    } catch (e) {
      var ln = 0;
      var m = new RegExp(g.rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+)').exec(String(e.stack || ''));
      if (m) ln = Number(m[1]);
      throws.push({ rel: g.rel, name: e.name, message: e.message, line: ln });
    }
    installRecorder();
  });
  return { world: world, throws: throws,
           sections: world.registered.map(function (r) { return r.id; }) };
}

var GRAPH = scriptGraph(INDEX);
var SWITCHABLE = switchableSections(APP);

// ================================================================================================
section('A. THE GRAPH UNDER TEST IS THE ONE THE PAGE ACTUALLY DECLARES');
// ================================================================================================
ok(GRAPH.length >= 70, 'A1  index.html declares a full script graph (' + GRAPH.length + ' local scripts)');
ok(SWITCHABLE.length >= 20, 'A2  and the navigation can switch to ' + SWITCHABLE.length + ' sections');
ok(GRAPH.some(function (g) { return g.rel === 'assets/js/pages/fc-summary.js'; }),
  'A3  fc-summary.js is in the graph');
ok(GRAPH.some(function (g) { return g.rel === 'assets/js/core/supply-planning-planning-demand.js'; }),
  'A4  and so is the shared Target Rule resolver added by this release');

// ================================================================================================
section('B. EVERY SHIPPED SCRIPT EVALUATES TO COMPLETION');
// ================================================================================================
var RUN = loadGraph(GRAPH);
eq(RUN.throws.map(function (t) { return t.rel + ':' + t.line + '  ' + t.name + ': ' + t.message; }), [],
  'B1  no shipped script throws at top level — a throw here silently discards the REST of that file');

// ================================================================================================
section('C. EVERY ROUTE THE NAVIGATION OFFERS IS REGISTERED');
// ================================================================================================
// EXECUTED, not grepped. product-strategy-board.js registers through a variable —
// `register(P.SECTION_ID, ...)` — which no search for a string literal can see. Running the graph
// sees it, and will see the next page that does the same without this suite being told about it.
var unregistered = SWITCHABLE.filter(function (s) { return RUN.sections.indexOf(s) === -1; });
eq(unregistered, [],
  'C1  every section app.js can switchTo has a registered lifecycle controller — an unregistered '
  + 'section goes ACTIVE and stays empty, with no mount to draw it and no error to report');
ok(RUN.sections.indexOf('fc-summary-section') !== -1,
  'C2  fc-summary-section specifically — the route this incident blanked');
ok(RUN.sections.indexOf('request-order-section') !== -1, 'C3  request-order-section still registers');
ok(RUN.sections.indexOf('ops-section') !== -1, 'C4  ops-section (Inventory Replenishment) still registers');
ok(RUN.sections.indexOf('home-section') !== -1, 'C5  home-section still registers');
ok(RUN.sections.indexOf('product-strategy-board-section') !== -1,
  'C6  product-strategy-board-section too, which only an EXECUTED check can see');

// No section may be claimed twice: two controllers for one id means one silently replaces the other.
(function () {
  var seen = {}, dupes = [];
  RUN.sections.forEach(function (s) { if (seen[s]) { if (dupes.indexOf(s) === -1) dupes.push(s); } seen[s] = 1; });
  eq(dupes, [], 'C7  no section is registered twice — the second would silently replace the first');
})();

// Each controller must actually carry a mount.
(function () {
  var noMount = RUN.world.registered.filter(function (r) { return r.handlers.indexOf('mount') === -1; })
    .map(function (r) { return r.id; });
  eq(noMount, [], 'C8  every registered controller exposes a mount');
})();

// ================================================================================================
section('D. THE SPECIFIC DEFECT CANNOT COME BACK');
// ================================================================================================
var FCS = read('assets/js/pages/fc-summary.js');
['getEffectiveFcSafe', 'getEffectiveTargetPct', 'calculateEffectiveFC', 'determineRuleSource']
  .forEach(function (fn, i) {
    // The names may still be NAMED in prose — the comment explaining the deletion does exactly that,
    // and that is not a defect. What must not exist is a live reference in evaluated code.
    var code = FCS.split(/\r?\n/).filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); }).join('\n');
    ok(code.indexOf(fn) === -1,
      'D' + (i + 1) + '  ' + fn + ' is not referenced in evaluated code (comments may still explain it)');
  });
ok(!/getEffectiveFc\s*:/.test(FCS), 'D5  and window.fcDebug no longer carries the dangling key');

// ================================================================================================
section('E. LOAD ORDER — the shared resolver precedes every consumer');
// ================================================================================================
function idx(rel) { for (var i = 0; i < GRAPH.length; i++) if (GRAPH[i].rel === rel) return i; return -1; }
var RES = 'assets/js/core/supply-planning-planning-demand.js';
eq(GRAPH.filter(function (g) { return g.rel === RES; }).length, 1, 'E1  the resolver is declared exactly once');
ok(GRAPH[idx(RES)].deferred, 'E2  and deferred, so it is off the Home critical path');
['assets/js/pages/fc-summary.js', 'assets/js/pages/request-order.js',
 'assets/js/pages/inventory-replenishment.js'].forEach(function (c, i) {
  ok(idx(c) > idx(RES), 'E3.' + (i + 1) + ' ' + c.split('/').pop() + ' is declared after it');
});
eq(GRAPH.filter(function (g) { return !g.deferred; }).length, 5,
  'E4  Home Phase 0 is still five blocking scripts');

// ================================================================================================
section('F. MUTATION — each guard above is load-bearing');
// ================================================================================================
var mutants = [], survived = [];
function mutant(id, label, predicate) {
  mutants.push(id);
  var held; try { held = !!predicate(); } catch (e) { held = false; }
  if (held) { console.log('  caught: ' + id + '  ' + label); }
  else { survived.push(id); console.error('SURVIVED: ' + id + '  ' + label); }
}

// M1 is the incident itself, reconstructed byte-for-byte.
mutant('M1', 'THE INCIDENT — the dangling getEffectiveFcSafe reference restored', function () {
  var broken = FCS.replace(
    /(\n\s*)\/\/ R2-F1 — getEffectiveFc REMOVED[\s\S]*?including the lifecycle\.register that draws the page\.\r?\n/,
    '$1  getEffectiveFc: getEffectiveFcSafe,\n');
  if (broken === FCS) return false;                       // the mutation must really apply
  var r = loadGraph(GRAPH, { 'assets/js/pages/fc-summary.js': broken });
  return r.throws.length > 0 && r.sections.indexOf('fc-summary-section') === -1;
});
mutant('M2', 'a throw anywhere before the registration', function () {
  var broken = 'throw new Error("boom");\n' + FCS;
  var r = loadGraph(GRAPH, { 'assets/js/pages/fc-summary.js': broken });
  return r.throws.length > 0 && r.sections.indexOf('fc-summary-section') === -1;
});
mutant('M3', 'the lifecycle.register call removed outright', function () {
  var broken = FCS.replace("KM.lifecycle.register('fc-summary-section'", "KM.lifecycle.register('nope-section'");
  var r = loadGraph(GRAPH, { 'assets/js/pages/fc-summary.js': broken });
  return r.sections.indexOf('fc-summary-section') === -1;
});
mutant('M4', 'a controller registered without a mount', function () {
  var w = makeWorld();
  w.win.KM.lifecycle.register('x-section', { unmount: function () {} });
  return w.registered[0].handlers.indexOf('mount') === -1;
});
mutant('M5', 'two controllers claiming one section', function () {
  var secs = RUN.sections.concat(['fc-summary-section']);
  var seen = {}, dup = false;
  secs.forEach(function (s) { if (seen[s]) dup = true; seen[s] = 1; });
  return dup;
});
mutant('M6', 'the resolver moved after a consumer', function () {
  var moved = GRAPH.slice();
  var r = moved.splice(idx(RES), 1)[0];
  moved.push(r);
  function i2(rel) { for (var i = 0; i < moved.length; i++) if (moved[i].rel === rel) return i; return -1; }
  return i2(RES) > i2('assets/js/pages/fc-summary.js');
});
mutant('M7', 'a route added to the navigation with no page to mount it', function () {
  var withGhost = SWITCHABLE.concat(['ghost-section']);
  return withGhost.filter(function (s) { return RUN.sections.indexOf(s) === -1; }).length > 0;
});
mutant('M8', 'the resolver tag made blocking', function () {
  return GRAPH.filter(function (g) { return !g.deferred; }).length === 5
      && !GRAPH.filter(function (g) { return !g.deferred; })
             .some(function (g) { return g.rel === RES; });
});

// Vacuity — every predicate must be FALSE on the unmutated tree.
var vacuous = [];
[['M1', function () { return RUN.throws.length === 0 && RUN.sections.indexOf('fc-summary-section') !== -1; }],
 ['M2', function () { return RUN.throws.length === 0; }],
 ['M3', function () { return RUN.sections.indexOf('fc-summary-section') !== -1; }],
 ['M4', function () { return RUN.world.registered.every(function (r) { return r.handlers.indexOf('mount') !== -1; }); }],
 ['M5', function () { var s = {}, d = false; RUN.sections.forEach(function (x) { if (s[x]) d = true; s[x] = 1; }); return !d; }],
 ['M6', function () { return idx(RES) < idx('assets/js/pages/fc-summary.js'); }],
 ['M7', function () { return SWITCHABLE.filter(function (s) { return RUN.sections.indexOf(s) === -1; }).length === 0; }],
 ['M8', function () { return GRAPH[idx(RES)].deferred; }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuous.push(p[0]);
});
eq(vacuous, [], 'F1  every mutant predicate is checked against a tree where the fault is absent', vacuous);

// Positive control — the harness really executes, and really observes registration.
(function () {
  var r = loadGraph(GRAPH, { 'assets/js/pages/fc-summary.js': 'KM.lifecycle.register("probe-section", { mount: function(){} });' });
  ok(r.sections.indexOf('probe-section') !== -1,
    'F2  positive control — a registration made by the loaded source is genuinely observed');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived, '
  + (vacuous.length === 0 ? 'vacuity clean' : 'VACUOUS: ' + vacuous.join(',')));
console.log(new Array(101).join('='));
process.exit(fail === 0 && survived.length === 0 ? 0 : 1);
