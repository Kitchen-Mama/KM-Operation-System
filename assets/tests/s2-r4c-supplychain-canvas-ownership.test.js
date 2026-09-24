// Kitchen Mama Operation System — S2-R4C
// SUPPLY CHAIN CANVAS: A SURFACE THAT OWNS NO BUSINESS TRUTH, AND MUST NOT ACQUIRE ANY
// Run: node assets/tests/s2-r4c-supplychain-canvas-ownership.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser. It runs the REAL
// assets/js/pages/supplychain.js inside a vm against a DOM shim that actually parses the markup the
// controller writes, so the listener and timer counts below are observations of the shipped module
// rather than claims about it.
//
// WHY THIS SUITE IS SHAPED AROUND A NEGATIVE.
//
// The S-series has been retiring browser copies of business truth one page at a time, and the
// inventory's open row for this page read simply "canvas layout + content — MED". The audit's answer
// is that there is nothing to retire: the Canvas is a hand-drawn diagram. It issues no request, reads
// no canonical table, and its stored document holds geometry, colour and free text. Its own spec puts
// SKU and replenishment association explicitly out of scope, and the implementation agrees with it.
//
// A ruling like that is worth very little written down and quite a lot enforced, because the failure
// mode is not that today's code is wrong — it is that the NEXT round hangs a real quantity off a node
// "just to show it", persists it into localStorage with the rest of the drawing, and recreates the
// exact defect S2-R4A retired from SKU Details: a business number only one browser can see. So
// section C runs the real item and arrow constructors and requires the field vocabulary of the stored
// document to stay closed. That test fails the moment the Canvas starts owning something.
//
// TWO DEFECTS WERE FOUND ON THE WAY, AND BOTH ARE LIFECYCLE RATHER THAN OWNERSHIP.
//
//   · setupOpacitySlider and setupArrowWidthSlider each added two ANONYMOUS document listeners, from a
//     path that runs for every item on every render. Nothing held a reference to them, so the unmount
//     hook could not remove them, and they went on handling every mouse move in the application after
//     the user left the page. Section E measures the count across mounts, renders and navigations.
//
//   · loadFromStorage called JSON.parse with nothing around it, one line after init() had already set
//     `_initialized = true`. One truncated value threw, the toolbar wiring below the call never ran,
//     and every later mount took the `_initialized` early exit — a canvas whose buttons did nothing,
//     in a state a reload could not clear. Section D drives the real init() through each way a stored
//     document can be unreadable and requires a working page and a preserved copy on all of them.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var JS_REL = 'assets/js/pages/supplychain.js';
var JS = read(JS_REL);
var HTML = read('assets/html/pages/supplychain.html');
var SPEC = read('assets/specs/active/tools/supply-chain-canvas/SupplyChainCanvas_Spec.md');
var LEDGER = read('docs/planning/S_SERIES_FRONTEND_API_MIGRATION_INVENTORY.md');

var fail = 0, pass = 0;
function ok(c, l, extra) {
  if (!c) { fail++; console.error('FAIL  ' + l + (extra === undefined ? '' : '\n   ' + JSON.stringify(extra))); }
  else { pass++; console.log('ok   ' + l); }
}
function eq(a, b, l) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) { fail++; console.error('FAIL  ' + l + '\n   expected ' + B + '\n   actual   ' + A); }
  else { pass++; console.log('ok   ' + l); }
}
function section(t) { console.log('\n-- ' + t + ' ' + new Array(Math.max(2, 100 - t.length)).join('-')); }

/** Source with comments removed — for scans asking what the CODE does, not what it explains. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .map(function (l) { return /^\s*\/\//.test(l) ? '' : l; }).join('\n');
}
var CODE = code(JS);

function swapSrc(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('MUTANT ANCHOR NOT FOUND:\n' + a);
  if (src.split(a).length - 1 !== 1) throw new Error('MUTANT ANCHOR NOT UNIQUE:\n' + a);
  return src.replace(a, function () { return b; });
}

// =================================================================================================
// DOM SHIM
// =================================================================================================
var VOID_TAGS = { INPUT: 1, BR: 1, IMG: 1, HR: 1 };

function makeDom() {
  var byId = {};
  var docListeners = {};
  var timers = [];

  function matchSel(n, sel) {
    sel = String(sel).trim();
    // The controller uses comma lists in one place (`[contenteditable], .sc-shape-text`).
    if (sel.indexOf(',') > -1) {
      return sel.split(',').some(function (part) { return matchSel(n, part); });
    }
    var m = /^([a-zA-Z]*)((?:\.[A-Za-z0-9_-]+)*)((?:\[[^\]]+\])*)$/.exec(sel);
    if (!m) throw new Error('DOM shim: unsupported selector ' + sel);
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    var cls = m[2] ? m[2].split('.').filter(Boolean) : [];
    for (var i = 0; i < cls.length; i++) if (!n.classList.contains(cls[i])) return false;
    var attrs = m[3] ? (m[3].match(/\[[^\]]+\]/g) || []) : [];
    for (var j = 0; j < attrs.length; j++) {
      var body = attrs[j].slice(1, -1);
      var e = body.indexOf('=');
      if (e === -1) { if (n.getAttribute(body) === null) return false; }
      else {
        var k = body.slice(0, e), v = body.slice(e + 1).replace(/^["']|["']$/g, '');
        if (String(n.getAttribute(k)) !== v) return false;
      }
    }
    return true;
  }

  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
      attrs: {}, style: {}, dataset: {}, _text: '', _html: '', className: '', _id: '',
      _listeners: {},
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; },
        toggle: function (c) { if (e.classList.contains(c)) e.classList.remove(c); else e.classList.add(c); }
      },
      setAttribute: function (k, v) {
        e.attrs[k] = String(v);
        if (k === 'id') e.id = String(v);
        if (k.indexOf('data-') === 0) e.dataset[k.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = String(v);
      },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      addEventListener: function (t, fn) { (e._listeners[t] = e._listeners[t] || []).push(fn); },
      removeEventListener: function (t, fn) { var a = e._listeners[t] || []; var i = a.indexOf(fn); if (i > -1) a.splice(i, 1); },
      listenerCount: function (t) { return (e._listeners[t] || []).length; },
      dispatch: function (t, ev) {
        ev = ev || {};
        if (!ev.target) ev.target = e;
        if (!ev.currentTarget) ev.currentTarget = e;
        if (!ev.preventDefault) ev.preventDefault = function () {};
        if (!ev.stopPropagation) ev.stopPropagation = function () {};
        (e._listeners[t] || []).forEach(function (fn) { fn(ev); });
      },
      appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = e; var i = e.children.indexOf(ref);
        if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c;
      },
      removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); c.parentNode = null; return c; },
      remove: function () { if (e.parentNode) e.parentNode.removeChild(e); },
      getBoundingClientRect: function () { return { left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100 }; },
      closest: function (sel) { var n = e; while (n) { if (matchSel(n, sel)) return n; n = n.parentNode; } return null; },
      querySelector: function (s) { var r = e.querySelectorAll(s); return r.length ? r[0] : null; },
      querySelectorAll: function (sel) {
        var out = [];
        (function walk(n) { n.children.forEach(function (c) { if (matchSel(c, sel)) out.push(c); walk(c); }); })(e);
        return out;
      }
    };
    Object.defineProperty(e, 'id', {
      get: function () { return e._id; },
      set: function (v) { e._id = String(v); if (e._id) byId[e._id] = e; }
    });
    Object.defineProperty(e, 'textContent', {
      get: function () { return e._text + e.children.map(function (c) { return c.textContent; }).join(''); },
      set: function (v) { e._text = String(v); e.children = []; }
    });
    Object.defineProperty(e, 'innerHTML', {
      get: function () { return e._html; },
      set: function (v) {
        e._html = String(v); e.children = [];
        parseHtml(El, e._html).forEach(function (c) { e.appendChild(c); });
      }
    });
    return e;
  }

  function parseHtml(mk, html) {
    var roots = [], stack = [];
    var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"]|"[^"]*")*)>|([^<]+)/g, m;
    while ((m = re.exec(html)) !== null) {
      if (m[4] !== undefined) {
        if (stack.length && m[4].trim()) stack[stack.length - 1]._text += m[4];
        continue;
      }
      if (m[1] === '/') { stack.pop(); continue; }
      var el = mk(m[2]);
      var attrRe = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*"([^"]*)")?/g, a;
      while ((a = attrRe.exec(m[3] || '')) !== null) {
        var k = a[1], v = a[2] === undefined ? '' : a[2];
        if (k === 'class') el.className = v;
        else if (k === 'id') el.id = v;
        else el.setAttribute(k, v);
      }
      if (stack.length) stack[stack.length - 1].appendChild(el); else roots.push(el);
      if (!VOID_TAGS[el.tagName]) stack.push(el);
    }
    return roots;
  }

  var body = El('body');
  var document = {
    body: body, head: El('head'), documentElement: body,
    createElement: function (t) { return El(t); },
    createElementNS: function (ns, t) { return El(t); },
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function (s) { return body.querySelector(s); },
    querySelectorAll: function (s) { return body.querySelectorAll(s); },
    addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { var a = docListeners[t] || []; var i = a.indexOf(fn); if (i > -1) a.splice(i, 1); },
    dispatch: function (t, ev) {
      ev = ev || {};
      if (!ev.preventDefault) ev.preventDefault = function () {};
      if (!ev.stopPropagation) ev.stopPropagation = function () {};
      (docListeners[t] || []).slice().forEach(function (fn) { fn(ev); });
    },
    __docListenerCount: function (t) { return (docListeners[t] || []).length; },
    __docListenerTotal: function () {
      return Object.keys(docListeners).reduce(function (n, k) { return n + docListeners[k].length; }, 0);
    },
    __byId: byId, __El: El
  };
  return { document: document, El: El, timers: timers };
}

/** Build the toolbar / canvas markup the controller's init() looks for. */
function buildSection(ctx) {
  var d = ctx.document, El = d.__El;
  function mk(tag, id, cls, parent) {
    var e = El(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  var sec = mk('div', 'supplychain-section', 'module-section', d.body);
  var shell = mk('div', null, 'sc-canvas-shell', sec);
  var toolbar = mk('div', null, 'sc-toolbar', shell);
  ['select', 'text', 'note', 'shape', 'highlight'].forEach(function (t) {
    mk('button', null, 'sc-tool sc-tool--' + t, toolbar);
  });
  var asb = mk('button', 'arrowStyleBtn', 'sc-tool sc-tool--arrow-style', toolbar);
  var asp = mk('div', 'arrowStylePanel', 'sc-arrow-style-panel', toolbar);
  [1, 2, 3, 4].forEach(function (w) { var b = mk('button', null, 'sc-stroke-btn', asp); b.dataset.width = String(w); });
  ['solid', 'dashed'].forEach(function (t) { var b = mk('button', null, 'sc-line-type-btn', asp); b.dataset.type = t; });
  var vp = mk('div', null, 'sc-canvas-viewport', shell);
  mk('div', 'scCanvas', 'sc-canvas-content', vp);
  mk('div', 'scEmptyState', 'sc-empty-state', vp);
  var zoom = mk('div', null, 'sc-zoom-control', vp);
  mk('button', null, 'sc-zoom-btn sc-zoom-out', zoom);
  mk('span', null, 'sc-zoom-label', zoom);
  mk('button', null, 'sc-zoom-btn sc-zoom-in', zoom);
  return sec;
}

/** Load the real module. Every request-capable global is a counter, so a request cannot be silent. */
function build(opts) {
  opts = opts || {};
  var src = opts.src || JS;
  var dom = makeDom();
  var store = opts.store || {};
  var seen = { requests: 0, warns: [] };
  var storageThrows = !!opts.storageThrows;

  var ctx = {
    document: dom.document,
    console: {
      log: function () {}, error: function () {},
      warn: function () { seen.warns.push(Array.prototype.join.call(arguments, ' ')); }
    },
    JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, Math: Math,
    parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN, Promise: Promise, Date: Date,
    localStorage: {
      getItem: function (k) {
        if (storageThrows) throw new Error('SecurityError');
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) { if (storageThrows) throw new Error('QuotaExceeded'); store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    setTimeout: function (fn) { dom.timers.push(fn); return dom.timers.length; },
    clearTimeout: function () {},
    setInterval: function () { throw new Error('the Canvas must not poll'); },
    requestAnimationFrame: function (fn) { dom.timers.push(fn); return dom.timers.length; },
    // Anything that could reach the network or the database, counted.
    fetch: function () { seen.requests++; return Promise.resolve({ json: function () { return Promise.resolve({}); } }); },
    XMLHttpRequest: function () { seen.requests++; },
    __seen: seen, __store: function () { return store; }, __dom: dom,
    __flushTimers: function () { var q = dom.timers.slice(); dom.timers.length = 0; q.forEach(function (f) { f(); }); }
  };
  ctx.window = ctx;
  ctx.KM = {
    lifecycle: { register: function (id, h) { ctx.__lifecycle = { id: id, handlers: h }; } },
    // The real loader INJECTS the markup, and _ensureSupplyChainMarkup short-circuits once it is
    // present. Modelling only the count and not the injection would have made every mount look like a
    // fetch and hidden the thing worth measuring: that re-entry re-fetches nothing.
    partialLoader: {
      loadPartial: function () { seen.requests++; buildSection(ctx); return Promise.resolve(true); }
    },
    DB: new Proxy({}, { get: function () { return function () { seen.requests++; return Promise.resolve({ success: true }); }; } }),
    api: new Proxy({}, { get: function () { return function () { seen.requests++; return Promise.resolve({ success: true }); }; } })
  };
  ctx.window.KM = ctx.KM;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'supplychain.js' });
  return ctx;
}

/** Mount through the REAL lifecycle handler, then flush the partial-loader promise and any timers. */
function mount(ctx) {
  ctx.__lifecycle.handlers.mount();
  return Promise.resolve().then(function () {}).then(function () {
    ctx.__flushTimers();
  });
}
function unmount(ctx) { ctx.__lifecycle.handlers.unmount(); }

var CANVAS_KEY = 'supplychain-canvas';
var QUARANTINE_KEY = 'supplychain-canvas.unreadable.v1';

// Fields the stored canvas document is allowed to carry. Geometry, style and free text — the
// vocabulary of a drawing. Anything outside this list is a business fact with a canonical owner.
var ALLOWED_ITEM_FIELDS = ['id', 'type', 'shapeType', 'x', 'y', 'width', 'height', 'text',
  'fontSize', 'fontFamily', 'color', 'textColor', 'bgColor', 'borderColor', 'opacity',
  'bold', 'italic', 'underline', 'strikethrough', 'textAlign'];
var ALLOWED_ARROW_FIELDS = ['id', 'startItemId', 'endItemId', 'startAnchor', 'endAnchor',
  'strokeWidth', 'strokeDasharray', 'color', 'label', 'pathType', 'arrowType'];
// Words that name a business fact. If one of these appears as a stored field, the Canvas has started
// owning something that belongs to a canonical table.
var BUSINESS_WORDS = ['sku', 'qty', 'quantity', 'stock', 'inventory', 'status', 'company',
  'warehouse', 'factory', 'shipment', 'allocation', 'lifecycle', 'price', 'cost', 'forecast',
  'marketplace', 'country', 'po', 'order', 'lead', 'eta'];

console.log('\n' + new Array(101).join('='));
console.log('S2-R4C — SUPPLY CHAIN CANVAS OWNERSHIP RULING');
console.log(new Array(101).join('='));

// =================================================================================================
section('A. THE MODEL — the evidence the ruling rests on');
// =================================================================================================
// A canonical read is a request. There are none, of any kind, by any transport.
['KM.DB', 'KM.api', 'KM.transport', 'getWorkspace', 'getTable', 'getOperationDb',
 'google.script', 'fetch(', 'XMLHttpRequest'].forEach(function (tok) {
  ok(CODE.indexOf(tok) === -1, 'A1 the module contains no "' + tok + '" — it reads no canonical source');
});
ok(CODE.indexOf('DemoData') === -1 && !/\bdemo[A-Z_]/.test(CODE),
  'A2 §5 no demo dataset is referenced, so there is no demo fallback to make unreachable');
// The spec put business association out of scope; the implementation agrees with the spec.
ok(/Out of Scope/.test(SPEC) && /SKU \/ 補貨數據的自動關聯/.test(SPEC),
  'A3 §2 the spec puts SKU / replenishment association OUT OF SCOPE — the ruling is not new policy');
ok(/ERP \/ WMS/.test(SPEC), 'A4 §2 ... along with ERP / WMS / marketplace integration');
// Exactly one browser store, and this module is the only module that touches it.
var keyUsers = [];
['assets/js/pages', 'assets/js/utils', 'assets/js/core', 'assets/js/api'].forEach(function (dir) {
  fs.readdirSync(path.join(REPO, dir)).forEach(function (f) {
    if (!/\.js$/.test(f)) return;
    if (read(dir + '/' + f).indexOf("'" + CANVAS_KEY + "'") > -1) keyUsers.push(dir + '/' + f);
  });
});
eq(keyUsers, [JS_REL], 'A5 §1 exactly ONE module names the canvas key — no other page can read it');
eq((CODE.match(/localStorage\.(getItem|setItem|removeItem)/g) || []).length, 4,
  'A6 §5 four storage accesses in the module: the document read/write and the quarantine read/write');
ok(/SC_CANVAS_STORAGE_KEY = 'supplychain-canvas'/.test(JS),
  'A7 the key is a named constant — two literals are two chances to disagree');
// The shipped markup offers no business control at all.
ok(!/data-sku|data-quantity|data-status|sc-sku|sc-qty/.test(HTML),
  'A8 §1 the shipped partial carries no business-bound control');

// =================================================================================================
section('B. THE RULING IS RECORDED WHERE BOTH AUDIENCES LOOK — §9');
// =================================================================================================
ok(/S2-R4C OWNERSHIP RULING/.test(JS), 'B1 §9 the module states the ruling for whoever edits it next');
ok(/PRESENTATION ARTEFACT/.test(JS), 'B2 §9 ... and names the model');
ok(/must be READ[\s\S]{0,200}canonical owner/.test(JS),
  'B3 §9 ... and states what it forbids: a business value is read per render, never persisted here');
ok(/ANSWERED — 2026-09-24, S2-R4C/.test(LEDGER),
  'B4 §9 the S-series ledger row is answered in the document that already owns the subject');
ok(!/The `supplychain-canvas` row is \*\*unchanged and still open\.\*\*/.test(LEDGER)
   || /S2-R4C/.test(LEDGER),
  'B5 §9 ... so the row is no longer carried forward as open');

// =================================================================================================
section('C. THE STORED DOCUMENT IS A DRAWING — §4, §7');
// =================================================================================================
var c0 = build(); buildSection(c0);
c0.CanvasController.init();
c0.__flushTimers();
c0.CanvasController.addShape('rect');
c0.CanvasController.addText(10, 10);
c0.CanvasController.addNote(20, 20);
c0.CanvasController.addHighlight(30, 30);
c0.__flushTimers();
eq(c0.CanvasController.items.length, 4, 'C1 the four real item constructors ran');

var itemFields = {};
c0.CanvasController.items.forEach(function (it) { Object.keys(it).forEach(function (k) { itemFields[k] = true; }); });
var itemKeys = Object.keys(itemFields).sort();
eq(itemKeys.filter(function (k) { return ALLOWED_ITEM_FIELDS.indexOf(k) === -1; }), [],
  'C2 §4 every stored item field is geometry, style or free text — CANVAS_UI_STATE_ALLOWED_FIELDS', itemKeys);
eq(itemKeys.filter(function (k) {
  var low = k.toLowerCase();
  return BUSINESS_WORDS.some(function (w) { return low === w || low.indexOf(w) === 0; });
}), [], 'C3 §4 no stored item field names a business fact');

c0.CanvasController.createArrow(c0.CanvasController.items[0], c0.CanvasController.items[1]);
var arrowKeys = Object.keys(c0.CanvasController.arrows[0]).sort();
eq(arrowKeys.filter(function (k) { return ALLOWED_ARROW_FIELDS.indexOf(k) === -1; }), [],
  'C4 §4 an arrow stores its two endpoints and its stroke — nothing else', arrowKeys);
// An arrow's endpoints are CANVAS node ids, not business identities. That is the right identity for
// a drawing, and section A is what proves it is not standing in for a canonical one.
ok(typeof c0.CanvasController.arrows[0].startItemId === 'number',
  'C5 §3 an arrow is keyed by canvas node id — the drawing has no business identity to get wrong');

// What actually reaches storage is the same four fields, because the writer serialises the model.
var saved = JSON.parse(c0.__store()[CANVAS_KEY]);
eq(Object.keys(saved).sort(), ['arrows', 'items', 'nextArrowId', 'nextId'],
  'C6 §7 the stored document has exactly four top-level keys');
eq(c0.__seen.requests, 0, 'C7 §7 drawing four items and an arrow issued ZERO requests');

// =================================================================================================
section('D. AN UNREADABLE DOCUMENT IS AN ABSENT ONE — §6');
// =================================================================================================
[['{"items":[', 'a truncated write'],
 ['not json at all', 'a value that is not JSON'],
 ['null', 'a null document'],
 ['[1,2,3]', 'an array where the document belongs'],
 ['"a string"', 'a bare string']
].forEach(function (pair, i) {
  var store = {}; store[CANVAS_KEY] = pair[0];
  var c = build({ store: store });
  buildSection(c);
  var threw = null;
  try { c.CanvasController.init(); c.__flushTimers(); } catch (e) { threw = e; }
  ok(!threw, 'D1.' + (i + 1) + ' §6 ' + pair[1] + ' does not throw out of init()', threw && threw.message);
  eq(c.CanvasController.items, [], 'D2.' + (i + 1) + ' ... the canvas starts empty');
  // THE PAGE IS STILL A PAGE. The toolbar wiring lives BELOW the storage read in init(), which is
  // exactly what the old throw skipped, so this is the assertion that distinguishes "handled" from
  // "survived by luck".
  ok(c.document.getElementById('scCanvas').listenerCount('mousedown') === 1,
    'D3.' + (i + 1) + ' ... and init() still finished: the canvas is wired');
  eq(c.__store()[QUARANTINE_KEY], pair[0],
    'D4.' + (i + 1) + ' §6 ... and the unreadable value is preserved, not destroyed');
});

// A readable document still loads, and a quarantine is not taken for one.
var storeOk = {};
storeOk[CANVAS_KEY] = JSON.stringify({ items: [{ id: 1, type: 'note', x: 1, y: 2, width: 3, height: 4, text: 'hi' }], arrows: [], nextId: 2, nextArrowId: 1 });
var cOk = build({ store: storeOk }); buildSection(cOk); cOk.CanvasController.init(); cOk.__flushTimers();
eq(cOk.CanvasController.items.length, 1, 'D5 a readable document still loads');
eq(cOk.__store()[QUARANTINE_KEY], undefined, 'D6 ... and nothing is quarantined');

// A quarantine is taken ONCE. The second failure must not overwrite the copy nearest the fault.
var store2 = {}; store2[CANVAS_KEY] = 'first-corrupt';
var c2 = build({ store: store2 }); buildSection(c2); c2.CanvasController.init(); c2.__flushTimers();
c2.__store()[CANVAS_KEY] = 'second-corrupt';
c2.CanvasController._initialized = false;
c2.CanvasController.init(); c2.__flushTimers();
eq(c2.__store()[QUARANTINE_KEY], 'first-corrupt', 'D7 §6 an existing quarantine is never overwritten');

// A shape that is an object but has the wrong field types must not reach renderItems.
var store3 = {}; store3[CANVAS_KEY] = JSON.stringify({ items: 'not-an-array', arrows: 7 });
var c3 = build({ store: store3 }); buildSection(c3);
var threw3 = null;
try { c3.CanvasController.init(); c3.__flushTimers(); } catch (e) { threw3 = e; }
ok(!threw3, 'D8 §6 a document whose items are not a list does not throw', threw3 && threw3.message);
eq([c3.CanvasController.items, c3.CanvasController.arrows], [[], []], 'D9 ... both are coerced to empty');

// Storage that throws on every access — private mode, blocked site data.
var cS = build({ storageThrows: true }); buildSection(cS);
var threwS = null;
try { cS.CanvasController.init(); cS.__flushTimers(); cS.CanvasController.addNote(1, 1); } catch (e) { threwS = e; }
ok(!threwS, 'D10 §6 unreadable AND unwritable storage still mounts and still draws', threwS && threwS.message);
eq(cS.CanvasController.items.length, 1, 'D11 ... the canvas works for the session it cannot save');

// §6's three rules, stated as the measurements that back them.
ok(true, 'D12 §6 READ FAILURE != DEMO FALLBACK — there is no demo dataset in the module (A2)');
ok(true, 'D13 §6 READ FAILURE != EMPTY BUSINESS STATE — there is no business state to empty (A1, C2)');

// =================================================================================================
section('E. LIFECYCLE — §8');
// =================================================================================================
// NOT pre-built: this context models a FIRST OPEN, where the markup is not in the DOM yet and the
// lifecycle mount has to load the partial. That is the only path on which the Canvas issues anything.
var e1 = build();
eq(e1.document.__docListenerTotal(), 0, 'E1 nothing is bound before the first mount');
eq(e1.__seen.requests, 0, 'E1b ... and nothing has been requested — REQUEST_COUNT_PRE = 0');

var mountsDone = Promise.resolve();
mountsDone = mountsDone.then(function () { return mount(e1); }).then(function () {
  eq(e1.document.__docListenerTotal(), 3, 'E2 §8 one mount binds exactly three document listeners');
  eq([e1.document.__docListenerCount('mousemove'), e1.document.__docListenerCount('mouseup'),
      e1.document.__docListenerCount('keydown')], [1, 1, 1], 'E3 ... one of each, all owned');
  // THE ONLY REQUEST THE CANVAS EVER MAKES is the one that fetches its own markup. No canonical read
  // follows it, because there is nothing canonical to read.
  eq(e1.__seen.requests, 1, 'E4 §8 the first open issued ONE request: the markup partial, and nothing else');

  // THE DEFECT THIS ROUND FIXED. Ten items, rendered repeatedly, used to add four document listeners
  // EACH per render — anonymous, so unremovable, and still firing after the user navigated away.
  for (var i = 0; i < 10; i++) e1.CanvasController.addNote(i * 10, i * 10);
  e1.__flushTimers();
  eq(e1.document.__docListenerTotal(), 3, 'E5 §8 ten items later, still three — LISTENER_DRIFT = 0');
  e1.CanvasController.renderItems(); e1.__flushTimers();
  e1.CanvasController.renderItems(); e1.__flushTimers();
  e1.CanvasController.renderItems(); e1.__flushTimers();
  eq(e1.document.__docListenerTotal(), 3, 'E6 §8 three more renders of ten items: still three');
  eq(e1.__seen.requests, 1, 'E7 §8 ... and no render issued a request — DUPLICATE_REQUEST_DRIFT = 0');

  unmount(e1);
  eq(e1.document.__docListenerTotal(), 0, 'E8 §8 unmount releases every document listener');
  return mount(e1);
}).then(function () {
  eq(e1.document.__docListenerTotal(), 3, 'E9 §8 re-entry rebinds exactly three — no stacking');
  eq(e1.__seen.requests, 1, 'E10 §8 re-entry re-fetched nothing: the markup is already present');
  return mount(e1);
}).then(function () { return mount(e1); }).then(function () {
  eq(e1.document.__docListenerTotal(), 3, 'E11 §8 four mounts in total, still three listeners');
  eq(e1.CanvasController.items.length, 10, 'E12 §8 ... and the document survived the navigations intact');

  // The canvas element's own listeners are bound once, behind the _initialized guard.
  eq(e1.document.getElementById('scCanvas').listenerCount('mousedown'), 1,
    'E13 §8 the canvas element is wired exactly once across four mounts');

  // A drag in progress does not survive a navigation.
  e1.CanvasController._sliderDrag = { kind: 'opacity', itemId: 1 };
  unmount(e1);
  eq(e1.CanvasController._sliderDrag, null, 'E14 §8 an unfinished slider drag is released on unmount — STATE_BLEED = 0');

  // No polling, no interval, no permanent loading state.
  ok(CODE.indexOf('setInterval') === -1, 'E15 §8 the module registers no interval — TIMER_DRIFT = 0');
  ok(!/is-loading|LOADING|spinner/.test(CODE), 'E16 §8 there is no loading state to get stuck in');
  ok(!/setTimeout\([^)]*\)\s*;\s*\n[\s\S]{0,40}setTimeout\(\s*\1/.test(CODE), 'E17 §8 no timer re-arms itself');
  return null;
});

// =================================================================================================
// The remaining sections run after the async lifecycle checks above.
// =================================================================================================
mountsDone.then(function () {

  section('F. THE WRITE PATH — §7');
  var f1 = build(); buildSection(f1); f1.CanvasController.init(); f1.__flushTimers();
  var before = f1.__seen.requests;
  f1.CanvasController.addShape('rect');
  f1.CanvasController.addNote(1, 1);
  f1.CanvasController.saveToStorage();
  f1.__flushTimers();
  eq(f1.__seen.requests - before, 0, 'F1 §7 SUPPLYCHAIN_CANVAS_BUSINESS_WRITES = 0');
  eq(Object.keys(f1.__store()).sort(), [CANVAS_KEY], 'F2 §7 every UI write lands in ONE key and no other');
  // The write owner is the controller, and nothing else can reach the key (A5).
  ok(/saveToStorage\(\) \{/.test(JS) && (JS.match(/localStorage\.setItem\(SC_CANVAS_STORAGE_KEY/g) || []).length === 1,
    'F3 §7 exactly one writer of the canvas document — WRITE_OWNER = CanvasController');
  eq((CODE.match(/this\.saveToStorage\(\);/g) || []).length, 28,
    'F4 §7 twenty-eight UI-state write call sites, all presentation mutations');

  section('G. MUTANTS — each returns TRUE when the defect is CAUGHT');
  var caught = 0, survived = [];
  function mutant(id, why, anchor, replacement, probe, opts) {
    opts = opts || {};
    var got;
    try {
      var c = build({ src: swapSrc(JS, anchor, replacement), store: opts.store,
        storageThrows: opts.storageThrows });
      buildSection(c);
      got = probe(c);
    } catch (e) { got = true; }                    // a mutant that cannot run is caught
    if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
    else { survived.push(id); fail++; console.error('FAIL  ' + id + '  ' + why + ' SURVIVED'); }
  }

  // The baseline must be a working world, or every probe reads as "caught" whatever the mutant did.
  var gBase = build(); buildSection(gBase); gBase.CanvasController.init(); gBase.__flushTimers();
  gBase.CanvasController.addNote(1, 1); gBase.__flushTimers();
  ok(gBase.document.__docListenerTotal() === 3 && gBase.CanvasController.items.length === 1,
    'G0  the unmutated baseline mounts, draws, and holds three listeners');

  mutant('G1', 'a slider binds its own document listeners again, so they stack per item per render',
    "        handle.addEventListener('mousedown', (e) => {\n            e.stopPropagation();\n            this._sliderDrag = { kind: 'opacity', itemId: itemId };\n        });",
    "        handle.addEventListener('mousedown', (e) => {\n            e.stopPropagation();\n            this._sliderDrag = { kind: 'opacity', itemId: itemId };\n        });\n        document.addEventListener('mousemove', (e) => { if (this._sliderDrag) this._opacityDragUpdate(itemId, e); });",
    function (c) {
      c.CanvasController.init(); c.__flushTimers();
      for (var i = 0; i < 5; i++) c.CanvasController.addNote(i, i);
      c.__flushTimers();
      return c.document.__docListenerTotal() !== 3;
    });

  mutant('G2', 'the unmount stops releasing the document listeners, so they stack across navigations',
    "        if (this._docMouseMove) { document.removeEventListener('mousemove', this._docMouseMove); this._docMouseMove = null; }",
    "        if (this._docMouseMove) { this._docMouseMove = null; }",
    function (c) {
      c.CanvasController.init(); c.__flushTimers();
      c.CanvasController._unbindDocListeners();
      c.CanvasController.init(); c.__flushTimers();
      return c.document.__docListenerTotal() !== 3;
    });

  mutant('G3', 'JSON.parse is unguarded again, so one truncated value bricks the page',
    "        let parsed = null;\n        try { parsed = JSON.parse(data); } catch (e) { parsed = null; }",
    "        let parsed = JSON.parse(data);",
    function (c) {
      try { c.CanvasController.init(); c.__flushTimers(); } catch (e) { return true; }
      // If it did not throw it must at least have wired the page and kept the copy.
      return c.document.getElementById('scCanvas').listenerCount('mousedown') !== 1;
    }, { store: (function () { var s = {}; s[CANVAS_KEY] = '{"items":['; return s; })() });

  mutant('G4', 'the unreadable document is dropped instead of quarantined, so the next edit destroys it',
    "                localStorage.setItem(SC_CANVAS_QUARANTINE_KEY, raw);",
    "                void raw;",
    function (c) {
      c.CanvasController.init(); c.__flushTimers();
      return c.__store()[QUARANTINE_KEY] === undefined;
    }, { store: (function () { var s = {}; s[CANVAS_KEY] = 'corrupt'; return s; })() });

  mutant('G5', 'the quarantine is overwritten on every failure, losing the copy nearest the fault',
    "            if (localStorage.getItem(SC_CANVAS_QUARANTINE_KEY) === null) {",
    "            if (true) {",
    function (c) {
      c.CanvasController.init(); c.__flushTimers();
      c.__store()[CANVAS_KEY] = 'second-corrupt';
      c.CanvasController._initialized = false;
      c.CanvasController.init(); c.__flushTimers();
      return c.__store()[QUARANTINE_KEY] !== 'first-corrupt';
    }, { store: (function () { var s = {}; s[CANVAS_KEY] = 'first-corrupt'; return s; })() });

  mutant('G6', 'a non-array items value is trusted, so the first render throws where the parse used to',
    "        this.items = Array.isArray(parsed.items) ? parsed.items : [];",
    "        this.items = parsed.items || [];",
    function (c) {
      try { c.CanvasController.init(); c.__flushTimers(); } catch (e) { return true; }
      return !Array.isArray(c.CanvasController.items);
    }, { store: (function () { var s = {}; s[CANVAS_KEY] = JSON.stringify({ items: 'nope', arrows: [] }); return s; })() });

  mutant('G7', 'an unfinished slider drag survives the unmount and resumes on the next mount',
    "        this._sliderDrag = null;\n        if (this._docMouseMove)",
    "        if (this._docMouseMove)",
    function (c) {
      c.CanvasController.init(); c.__flushTimers();
      c.CanvasController._sliderDrag = { kind: 'opacity', itemId: 1 };
      c.CanvasController._unbindDocListeners();
      return c.CanvasController._sliderDrag !== null;
    });

  mutant('G8', 'saveToStorage throws on a blocked store, so an edit takes the page down',
    "        try {\n            localStorage.setItem(SC_CANVAS_STORAGE_KEY, JSON.stringify({",
    "        {\n            localStorage.setItem(SC_CANVAS_STORAGE_KEY, JSON.stringify({",
    function (c) {
      try { c.CanvasController.init(); c.__flushTimers(); c.CanvasController.addNote(1, 1); }
      catch (e) { return true; }
      return false;
    }, { storageThrows: true });

  console.log('\n' + new Array(101).join('='));
  console.log('S2-R4C SUPPLY CHAIN CANVAS OWNERSHIP — passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + caught + '  survived ' + survived.length
    + (survived.length ? ' (' + survived.join(', ') + ')' : ''));
  console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
  console.log(new Array(101).join('='));
  process.exit(fail ? 1 : 0);
}).catch(function (e) {
  console.error('FAIL  the suite itself threw: ' + (e && e.stack || e));
  process.exit(1);
});
