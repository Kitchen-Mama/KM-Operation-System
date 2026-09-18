// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R3
// COMPLETE COLUMN RESIZE, AND A RETRY CONTROL THAT IS ACTUALLY ON THE PAGE
// Run: node assets/tests/fc-column-resize-and-retry-label-r2b-a2-r3.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script. It runs the REAL resize engine
// (assets/js/utils/resizable-columns.js) and the REAL page functions extracted from fc-summary.js against a
// DOM shim whose header markup is PARSED FROM THE SHIPPED assets/html/pages/fc-summary.html — so the column
// counts and labels below are evidence about what ships, not a fixture someone typed.
//
// WHAT WENT WRONG, AND WHY A SOURCE SCAN WOULD NOT HAVE FOUND IT.
// Only three columns could be dragged, and the report of it named Series. There was no Series special-case
// anywhere in the code; there could not be, because the engine derives its columns generically. The cause was
// CSS SPECIFICITY: fc-overview.css supplied every width from rules scoped to `#fc-summary-section` — never to
// a table — pinned with max-width through :nth-child selectors ranking (1,3,0) and (1,4,0), while the engine's
// injected rule ranked (1,2,0). Columns 1, 4 and 6 were the only ones no :nth-child selector touched, so they
// were the only ones that could win. Series was a survivor, not a favourite.
//
// Worse, for columns 2/3/5/19/20 the BODY rule tied the engine's while the HEADER rule beat it. Dragging those
// moved the body and left the header behind — a desynchronisation that reads as "the table broke", and that no
// assertion about "is there a handle" would ever have caught.
//
// So this suite computes SPECIFICITY from the real selectors, and drives real pointer drags through the real
// controller to observe the width that actually lands on the header cell and on the body cells. Those are the
// two things the defect was made of.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var JS_REL = 'assets/js/pages/fc-summary.js';
var CSS_REL = 'assets/css/pages/fc-overview.css';
var HTML_REL = 'assets/html/pages/fc-summary.html';
var ENGINE_REL = 'assets/js/utils/resizable-columns.js';

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractVar(src, name) {
  // A declaration ends at the first `;` that closes the statement — which may be followed by a trailing
  // line comment before the newline. Allowing for that is the difference between extracting one var and
  // swallowing the function declared after it.
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
/**
 * The executable part of a source file. The G-section scans below ask whether certain literals appear in
 * the CODE. fc-summary.js now contains several comments that QUOTE the old sentence in order to explain
 * why it was wrong, so a raw scan reads the explanation as the defect. Strip comments first.
 */
function codeOnly(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function swapSrc(src, a, b) {
  var n = src.replace(/\r\n/g, '\n');
  if (n.split(a).length - 1 !== 1) throw new Error('mutation anchor not unique: ' + a.slice(0, 90));
  return n.split(a).join(b);
}

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) pass++; else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

// =================================================================================================
// THE SHIPPED MARKUP — parsed, not retyped.
// =================================================================================================
var HTML = read(HTML_REL);
function headerLabels(id) {
  var i = HTML.indexOf('id="' + id + '"');
  if (i < 0) throw new Error('header root not in the shipped HTML: ' + id);
  var rest = HTML.slice(i);
  var end = rest.indexOf('</div>\n', rest.indexOf('header-cell'));
  var block = rest.slice(0, rest.indexOf('</div>', rest.lastIndexOf('header-cell', rest.indexOf('scroll-header-viewport') > -1 ? rest.length : rest.length)));
  // Simpler and safer: take every header-cell up to the closing of this scroll-header container.
  var seg = rest.slice(0, rest.indexOf('</div>' + '\r\n', rest.indexOf('header-cell')) + 1);
  var labels = [], re = /<div class="header-cell">([^<]*)<\/div>/g, m;
  var scope = rest.slice(0, rest.indexOf('scroll-header-viewport', 1) > -1 ? rest.indexOf('</div>\r\n                                </div>') : rest.length);
  while ((m = re.exec(scope))) labels.push(m[1].trim());
  return labels;
}
var REGULAR_LABELS = headerLabels('fc-regular-scroll-header');
var EVENT_LABELS = headerLabels('fc-event-scroll-header');
var TARGET_LABELS = headerLabels('fc-target-scroll-header');

// =================================================================================================
// DOM SHIM — the smallest thing the real engine and the real page functions actually use.
// =================================================================================================
function makeDom() {
  var byId = {};
  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
      attrs: {}, style: {}, dataset: {}, _text: '', className: '', _id: '', hidden: false,
      _listeners: {},
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; }
      },
      setAttribute: function (k, v) { e.attrs[k] = String(v); if (k === 'id') { e.id = String(v); byId[e.id] = e; } },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      addEventListener: function (t, fn) { (e._listeners[t] = e._listeners[t] || []).push(fn); },
      removeEventListener: function (t, fn) {
        var a = e._listeners[t] || []; var i = a.indexOf(fn); if (i > -1) a.splice(i, 1);
      },
      dispatch: function (t, ev) { (e._listeners[t] || []).forEach(function (fn) { fn(ev || { preventDefault: function () {}, stopPropagation: function () {} }); }); },
      appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = e; var i = e.children.indexOf(ref);
        if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c;
      },
      removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); c.parentNode = null; return c; },
      setPointerCapture: function () {}, releasePointerCapture: function () {},
      querySelector: function (sel) { var r = e.querySelectorAll(sel); return r.length ? r[0] : null; },
      querySelectorAll: function (sel) {
        sel = String(sel).trim();
        var scopeChildrenOnly = sel.indexOf(':scope >') === 0;
        var want = sel.replace(':scope >', '').trim();
        var out = [];
        function matches(n) {
          if (want.charAt(0) === '.') return n.classList.contains(want.slice(1));
          if (want.charAt(0) === '[') {
            var attr = want.slice(1, -1).split('=')[0];
            return n.getAttribute(attr) !== null;
          }
          return n.tagName === want.toUpperCase();
        }
        function walk(n, depth) {
          n.children.forEach(function (c) {
            if (matches(c)) out.push(c);
            if (!scopeChildrenOnly) walk(c, depth + 1);
          });
        }
        if (scopeChildrenOnly) e.children.forEach(function (c) { if (matches(c)) out.push(c); });
        else walk(e, 0);
        return out;
      }
    };
    // The page assigns `el.id = …` directly as often as it calls setAttribute, and an id that does not
    // register is a getElementById that returns null for an element that exists.
    Object.defineProperty(e, 'id', {
      get: function () { return e._id; },
      set: function (v) { e._id = String(v); if (e._id) byId[e._id] = e; }
    });
    Object.defineProperty(e, 'textContent', {
      get: function () { return e._text; }, set: function (v) { e._text = String(v); e.children = []; }
    });
    Object.defineProperty(e, 'innerHTML', {
      get: function () { return e._html || ''; }, set: function (v) { e._html = String(v); e.children = []; }
    });
    return e;
  }
  var head = El('head'), body = El('body');
  var document = {
    head: head, body: body,
    createElement: function (t) { return El(t); },
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function (s) { return body.querySelector(s); },
    querySelectorAll: function (s) { return body.querySelectorAll(s); },
    __register: function (el) { if (el.id) byId[el.id] = el; return el; },
    __byId: byId
  };
  return { document: document, El: El };
}

/** Build the FC Summary section: three panels, each with a sticky header cell + a scroll header + a body. */
function buildSection(dom, opts) {
  opts = opts || {};
  var d = dom.document;
  function mk(tag, id, cls) {
    var e = dom.El(tag);
    if (id) { e.id = id; d.__register(e); }
    if (cls) e.className = cls;
    return e;
  }
  var section = mk('div', 'fc-summary-section');
  d.body.appendChild(section);
  var banner = mk('div', 'fc-view-banner'); section.appendChild(banner);

  function panel(panelId, headerId, bodyId, labels, rows) {
    var p = mk('div', panelId, 'fc-panel'); section.appendChild(p);
    var table = mk('div', null, 'dual-layer-table'); p.appendChild(table);
    var hdr = mk('div', headerId, 'scroll-header'); table.appendChild(hdr);
    labels.forEach(function (L) { var c = mk('div', null, 'header-cell'); c.textContent = L; hdr.appendChild(c); });
    var bdy = mk('div', bodyId, 'scroll-body'); table.appendChild(bdy);
    for (var r = 0; r < (rows === undefined ? 3 : rows); r++) {
      var row = mk('div', null, 'scroll-row'); bdy.appendChild(row);
      labels.forEach(function () { row.appendChild(mk('div', null, 'scroll-cell')); });
    }
    return p;
  }
  panel('fc-panel-regular', 'fc-regular-scroll-header', 'fc-regular-scroll-body', REGULAR_LABELS, opts.rows);
  panel('fc-panel-event', 'fc-event-scroll-header', 'fc-event-scroll-body', EVENT_LABELS, opts.rows);
  panel('fc-panel-target', 'fc-target-scroll-header', 'fc-target-scroll-body', TARGET_LABELS, opts.rows);
  return section;
}

// =================================================================================================
// CONTEXT — real engine + real page resize/retry functions.
// =================================================================================================
var PAGE_RESIZE_VARS = ['FC_RESIZE_MAX_', 'FC_RESIZE_MIN_', 'FC_RESIZE_TABLES_', '_fcResizeCtl_'];
var PAGE_RESIZE_FNS = ['_fcResizeMin_', '_fcResizeCols_', '_fcMonthCols_', '_fcResizeCssRule_',
  '_fcResizeResetBar_', '_fcResizeMount_', '_fcResizeInit_'];

function build(opts) {
  opts = opts || {};
  var JS = read(JS_REL);
  var ENGINE = read(ENGINE_REL);
  if (typeof opts.mutateJs === 'function') JS = opts.mutateJs(JS);
  if (typeof opts.mutateEngine === 'function') ENGINE = opts.mutateEngine(ENGINE);

  var dom = makeDom();
  var store = {};
  var apiCalls = [];
  var raf = [];
  var ctx = {
    console: console,
    window: null,
    document: dom.document,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    getComputedStyle: function () { return { position: 'static' }; },
    requestAnimationFrame: function (fn) { raf.push(fn); return raf.length; },
    cancelAnimationFrame: function () {},
    __raf: function () { var q = raf.slice(); raf.length = 0; q.forEach(function (f) { f(); }); },
    __apiCalls: apiCalls,
    __store: function () { return store; },
    __dom: dom
  };
  ctx.window = ctx;
  ctx.window.KM = { ui: {}, api: { getWorkspace: function () { apiCalls.push('getWorkspace'); return Promise.resolve({ success: true, data: {} }); } },
    DB: {}, transport: null, loadState: null };
  vm.createContext(ctx);
  vm.runInContext(ENGINE, ctx, { filename: 'resizable-columns.js' });

  var pieces = [];
  PAGE_RESIZE_VARS.forEach(function (n) { pieces.push(extractVar(JS, n)); });
  PAGE_RESIZE_FNS.forEach(function (n) { pieces.push(extractFn(JS, n)); });
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-summary-resize.js' });
  return ctx;
}

/** Drag column `col` of `group` by `dx` px through the real handle listeners. */
function drag(ctx, group, col, dx) {
  var spec = null;
  ctx.FC_RESIZE_TABLES_.forEach(function (t) { if (t.group === group) spec = t; });
  var hdr = ctx.document.getElementById(spec.header);
  var cell = hdr.querySelectorAll(':scope > .header-cell')[col - 1];
  var handle = cell.querySelector('[data-rescol-handle]');
  if (!handle) return null;
  handle.dispatch('pointerdown', { clientX: 0, pointerId: 1, preventDefault: function () {}, stopPropagation: function () {} });
  handle.dispatch('pointermove', { clientX: dx, pointerId: 1 });
  ctx.__raf();
  handle.dispatch('pointerup', { clientX: dx, pointerId: 1 });
  return handle;
}
/** The width the injected stylesheet assigns to (group, col) for header and for body, as the browser would. */
function injectedWidths(ctx, group, col) {
  var spec = null;
  ctx.FC_RESIZE_TABLES_.forEach(function (t) { if (t.group === group) spec = t; });
  var css = ctx.document.head.children.map(function (c) { return c.textContent || ''; }).join('\n');
  var hSel = '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + col + ')';
  var bSel = '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + col + ')';
  function widthFor(sel) {
    var rules = css.split('}');
    for (var i = rules.length - 1; i >= 0; i--) {
      if (rules[i].indexOf(sel) > -1) {
        var m = /width:\s*(\d+)px/.exec(rules[i]);
        if (m) return Number(m[1]);
      }
    }
    return null;
  }
  return { header: widthFor(hSel), body: widthFor(bSel) };
}

// =================================================================================================
section('A. THE SHIPPED MARKUP — the column sets these controllers must match');
// =================================================================================================
eq(REGULAR_LABELS.length, 20, 'A1 Regular Forecast ships 20 scroll columns');
eq(EVENT_LABELS.length, 10, 'A2 Special Event ships 10 scroll columns');
eq(TARGET_LABELS.length, 18, 'A3 Target % & Rules ships 18 scroll columns');
eq(REGULAR_LABELS[5], 'Series', 'A4 Series is Regular column 6');
eq(EVENT_LABELS[7], 'Event Period', 'A5 Event Period is Event column 8');
eq(TARGET_LABELS[17], 'Actions', 'A6 Actions is Target column 18');

var C = build();
eq(C.FC_RESIZE_TABLES_.map(function (t) { return t.group; }), ['fc-regular', 'fc-event', 'fc-target'],
  'A7 three controllers are declared, one per tab');
C.FC_RESIZE_TABLES_.forEach(function (t, i) {
  var want = [REGULAR_LABELS, EVENT_LABELS, TARGET_LABELS][i];
  eq(t.cols.length, want.length, 'A8 ' + t.group + ' declares exactly as many columns as the markup has');
  eq(t.cols.map(function (c) { return c.label; }), want,
    'A8b ' + t.group + ' column labels match the shipped header, in order');
});

// =================================================================================================
section('B. HANDLES — every approved column, and nothing that must not move');
// =================================================================================================
buildSection(C.__dom);
var mounted = C._fcResizeInit_();
eq(mounted, ['fc-regular', 'fc-event', 'fc-target'], 'B1 all three controllers mounted');

function handleCount(ctx, group) {
  var spec = null; ctx.FC_RESIZE_TABLES_.forEach(function (t) { if (t.group === group) spec = t; });
  var hdr = ctx.document.getElementById(spec.header);
  return hdr.querySelectorAll(':scope > .header-cell').filter(function (c) {
    return !!c.querySelector('[data-rescol-handle]');
  }).length;
}
eq(handleCount(C, 'fc-regular'), 20, 'B2 §3 every Regular scroll column has a handle');
eq(handleCount(C, 'fc-event'), 10, 'B3 §3 every Event scroll column has a handle');
eq(handleCount(C, 'fc-target'), 17, 'B4 §3 Target has 17 handles — all but Actions');

var tHdr = C.document.getElementById('fc-target-scroll-header');
ok(!tHdr.querySelectorAll(':scope > .header-cell')[17].querySelector('[data-rescol-handle]'),
  'B5 §7.2 the Actions column has NO handle');
// §3 — the sticky identity column cannot receive a handle because it is not in the scroll header at all.
// Read from the SHIPPED markup rather than asserted about the controller: the fixed-header cell sits in a
// different container, so no :nth-child position in any column set can address it.
['fc-regular', 'fc-event', 'fc-target'].forEach(function (g) {
  var at = HTML.indexOf('id="' + g + '-scroll-header"');
  var before = HTML.slice(Math.max(0, at - 600), at);
  ok(/<div class="fixed-header">[\s\S]*?<div class="header-cell">([^<]*)<\/div>/.test(before),
    'B6 ' + g + ': the sticky identity cell is in .fixed-header, outside the scroll header');
});
eq(REGULAR_LABELS[0], 'Year', 'B6b so the scroll header starts at Year — SKU is not column 1');
eq(TARGET_LABELS[0], 'Year', 'B6c and Target starts at Year — Scope is not column 1');

// ANTI-VACUITY: a handle must really be a handle.
var oneHandle = C.document.getElementById('fc-regular-scroll-header')
  .querySelectorAll(':scope > .header-cell')[5].querySelector('[data-rescol-handle]');
ok(oneHandle && oneHandle.getAttribute('role') === 'separator', 'B7 a handle is a real separator control');
ok(oneHandle.getAttribute('tabindex') === '0', 'B8 §5 and it is keyboard reachable');
ok(oneHandle.getAttribute('aria-label').indexOf('Series') > -1, 'B9 named for the column it resizes');

// =================================================================================================
section('C. DRAGGING — header and body move TOGETHER, for every column');
// =================================================================================================
// The heart of the defect: columns 2/3/5/19/20 used to move the body while the header stayed pinned.
var DESYNC_SUSPECTS = [2, 3, 5, 19, 20];
[1, 2, 3, 4, 5, 6, 7, 12, 18, 19, 20].forEach(function (col) {
  var ctx = build();
  buildSection(ctx.__dom); ctx._fcResizeInit_();
  drag(ctx, 'fc-regular', col, 60);
  var w = injectedWidths(ctx, 'fc-regular', col);
  ok(w.header !== null && w.body !== null, 'C1 Regular col ' + col + ' produces a width rule for header AND body', w);
  eq(w.header, w.body, 'C2 §7.3 Regular col ' + col + ' — header and body receive the SAME width');
  var def = ctx.FC_RESIZE_TABLES_[0].cols[col - 1].w;
  eq(w.header, def + 60, 'C3 Regular col ' + col + ' widened by exactly the drag distance');
});
DESYNC_SUSPECTS.forEach(function (col) {
  var ctx = build(); buildSection(ctx.__dom); ctx._fcResizeInit_();
  drag(ctx, 'fc-regular', col, 40);
  var w = injectedWidths(ctx, 'fc-regular', col);
  eq(w.header, w.body, 'C4 §7.4 col ' + col + ' no longer desynchronises (this is the regression)');
});
// §7.15 — Series is ordinary.
var cSeries = build(); buildSection(cSeries.__dom); cSeries._fcResizeInit_();
drag(cSeries, 'fc-regular', 6, 50);
drag(cSeries, 'fc-regular', 2, 50);
var wS = injectedWidths(cSeries, 'fc-regular', 6), wC = injectedWidths(cSeries, 'fc-regular', 2);
eq(wS.header - 100, wC.header - 120, 'C5 §7.15 Series and Company respond identically to the same drag');

// §7.5 — months can widen beyond the former 70px max-width.
var cM = build(); buildSection(cM.__dom); cM._fcResizeInit_();
drag(cM, 'fc-regular', 7, 230);
var wM = injectedWidths(cM, 'fc-regular', 7);
eq(wM.header, 300, 'C6 §7.5 a month column widens to 300px — far past its old 70px ceiling');
eq(wM.body, 300, 'C6b and the body follows');

// §7.6 — Event Period can show a complete range.
var cE = build(); buildSection(cE.__dom); cE._fcResizeInit_();
eq(cE.FC_RESIZE_TABLES_[1].cols[7].w, 190, 'C7 §7.6 Event Period now DEFAULTS to 190px, not 70px');
drag(cE, 'fc-event', 8, 120);
var wE = injectedWidths(cE, 'fc-event', 8);
eq(wE.header, 310, 'C7b and it can widen further still');
eq(wE.header, wE.body, 'C7c header and body together');

// §7.7 — Target Rules is wired.
var cT = build(); buildSection(cT.__dom); cT._fcResizeInit_();
[1, 5, 6, 17].forEach(function (col) {
  drag(cT, 'fc-target', col, 30);
  var w = injectedWidths(cT, 'fc-target', col);
  ok(w.header !== null, 'C8 §7.7 Target col ' + col + ' resizes');
  eq(w.header, w.body, 'C8b Target col ' + col + ' header/body together');
});
eq(drag(cT, 'fc-target', 18, 30), null, 'C9 Target Actions cannot be dragged — there is no handle');

// §7.8 — only column N changes.
var cN = build(); buildSection(cN.__dom); cN._fcResizeInit_();
drag(cN, 'fc-regular', 9, 45);
for (var col = 1; col <= 20; col++) {
  var w = injectedWidths(cN, 'fc-regular', col);
  if (col === 9) eq(w.header, 70 + 45, 'C10 §7.8 the dragged column changed');
  else ok(w.header === null, 'C10b §7.8 column ' + col + ' was not touched', w);
}

// =================================================================================================
section('D. NO CROSS-TAB LEAKAGE — §7.9, §5');
// =================================================================================================
var cX = build(); buildSection(cX.__dom); cX._fcResizeInit_();
drag(cX, 'fc-regular', 7, 100);
eq(injectedWidths(cX, 'fc-regular', 7).header, 170, 'D1 Regular column 7 resized');
eq(injectedWidths(cX, 'fc-event', 7).header, null, 'D2 §7.9 Event column 7 is untouched');
eq(injectedWidths(cX, 'fc-target', 7).header, null, 'D3 §7.9 Target column 7 is untouched');

var persisted = JSON.parse(cX.__store()['km.ui.tableWidths.v1']);
// An untouched table writes NOTHING — a group appears only once it has persisted. So the guarantee is not
// "three groups exist"; it is that the one that moved is stored alone, under its own key.
eq(Object.keys(persisted['fc-summary']), ['fc-regular'], 'D4 §5 only the dragged table was written');
ok(Object.keys(persisted['fc-summary']['fc-regular']).length === 1,
  'D5 and only the dragged column within it', persisted['fc-summary']['fc-regular']);
ok(!persisted['fc-summary']['fc-event'], 'D6 Event wrote nothing');
ok(!persisted['fc-summary']['fc-target'], 'D7 Target wrote nothing');
// Now move a second tab and prove the two coexist without touching each other.
drag(cX, 'fc-event', 8, 55);
var persisted2 = JSON.parse(cX.__store()['km.ui.tableWidths.v1']);
eq(Object.keys(persisted2['fc-summary']).sort(), ['fc-event', 'fc-regular'],
  'D4b §5 each tab persists under its OWN group');
eq(injectedWidths(cX, 'fc-regular', 7).header, 170, 'D4c the first tab kept its width');
eq(injectedWidths(cX, 'fc-event', 8).header, 245, 'D4d and the second got its own');
// the keys are namespaced by group, so two tabs cannot collide even at the same column index
var rKey = Object.keys(persisted['fc-summary']['fc-regular'])[0];
ok(rKey.indexOf('fc-regular') === 0, 'D8 §5 the stored key is namespaced by table', rKey);

// §7.11 — persistence survives a remount (the SPA lifecycle case).
var cP = build(); buildSection(cP.__dom); cP._fcResizeInit_();
drag(cP, 'fc-regular', 6, 80);
eq(injectedWidths(cP, 'fc-regular', 6).header, 180, 'D9 Series widened to 180');
cP._fcResizeInit_();                                     // re-mount, same context/storage
eq(injectedWidths(cP, 'fc-regular', 6).header, 180, 'D10 §7.11 the width survived a re-mount');
eq(handleCount(cP, 'fc-regular'), 20, 'D11 and no duplicate handles were stacked');

// =================================================================================================
section('E. RESET — §6, §7.12');
// =================================================================================================
var cR = build(); buildSection(cR.__dom); cR._fcResizeInit_();
drag(cR, 'fc-regular', 6, 80); drag(cR, 'fc-event', 8, 60); drag(cR, 'fc-target', 5, 40);
eq(injectedWidths(cR, 'fc-regular', 6).header, 180, 'E1 Regular changed');
eq(injectedWidths(cR, 'fc-event', 8).header, 250, 'E2 Event changed');
eq(injectedWidths(cR, 'fc-target', 5).header, 160, 'E3 Target changed');

var btn = cR.document.getElementById('fc-regular-reset-widths');
ok(!!btn, 'E4 §6 a reset control exists for the Regular table');
eq(btn.textContent, 'Reset column widths', 'E5 §6 with the required label');
['fc-event-reset-widths', 'fc-target-reset-widths'].forEach(function (id) {
  ok(!!cR.document.getElementById(id), 'E6 §6 ' + id + ' exists too — one per table');
});
var before = cR.__apiCalls.length;
btn.onclick();
eq(injectedWidths(cR, 'fc-regular', 6).header, null, 'E7 §7.12 Regular returned to its declared default');
eq(injectedWidths(cR, 'fc-event', 8).header, 250, 'E8 §7.12 Event was NOT reset');
eq(injectedWidths(cR, 'fc-target', 5).header, 160, 'E9 §7.12 Target was NOT reset');
eq(cR.__apiCalls.length - before, 0, 'E10 §7.13 reset issued ZERO API calls');

// §7.13 — resizing itself reads nothing and writes nothing.
var cA = build(); buildSection(cA.__dom); cA._fcResizeInit_();
var a0 = cA.__apiCalls.length;
drag(cA, 'fc-regular', 3, 30); drag(cA, 'fc-target', 9, 20);
eq(cA.__apiCalls.length - a0, 0, 'E11 §7.13 dragging issued ZERO API calls');

// =================================================================================================
section('F. CSS — the specificity defect is gone BY CONSTRUCTION, not by !important');
// =================================================================================================
var CSS = read(CSS_REL);
function specificity(sel) {
  var ids = (sel.match(/#[A-Za-z0-9_-]+/g) || []).length;
  var cls = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).length + (sel.match(/:[a-z-]+\(/g) || []).length;
  return ids * 100 + cls;
}
ok(!/#fc-summary-section \.scroll-(header \.header-cell|row \.scroll-cell):nth-child/.test(CSS),
  'F1 §4 the broad #fc-summary-section :nth-child width rules are gone');
['fc-regular', 'fc-event', 'fc-target'].forEach(function (g) {
  ok(CSS.indexOf('#' + g + '-scroll-header > .header-cell:nth-child(') > -1,
    'F2 §2 ' + g + ' has its own table-scoped default-width rules');
});
// no ordinary resizable column may carry a blocking max-width
var colRules = CSS.split('}').filter(function (r) { return /scroll-(header > \.header-cell|row > \.scroll-cell):nth-child/.test(r); });
ok(colRules.length > 0, 'F3 the per-table column rules were found', colRules.length);
eq(colRules.filter(function (r) { return /max-width/.test(r); }).length, 0,
  'F4 §4 NOT ONE per-column default rule pins max-width');
// the engine's injected selector must out-rank every stylesheet selector that targets the same cells
var ctxF = build(); buildSection(ctxF.__dom); ctxF._fcResizeInit_();
drag(ctxF, 'fc-regular', 12, 40);
var injCss = ctxF.document.head.children.map(function (c) { return c.textContent || ''; }).join('\n');
var injSel = injCss.split('{')[0].split(',')[0].trim();
var injSpec = specificity(injSel);
ok(/#fc-summary-section #fc-regular-scroll-header/.test(injSel), 'F5 the injected rule names TWO ids', injSel);
var worst = 0, worstSel = '';
CSS.split('}').forEach(function (r) {
  var sel = r.split('{')[0];
  if (!/scroll-header|scroll-cell|header-cell/.test(sel)) return;
  sel.split(',').forEach(function (one) {
    var sp = specificity(one.trim());
    if (sp > worst) { worst = sp; worstSel = one.trim(); }
  });
});
ok(injSpec > worst, 'F6 §4 the injected rule (' + injSpec + ') outranks every stylesheet column selector ('
  + worst + ': ' + worstSel + ') — so header and body always take the stored width', { injSpec: injSpec, worst: worst });
eq(/!important/.test(colRules.join('}')), false, 'F7 §4 the fix uses no !important');
// Event Period is no longer caught by a month rule
var epRule = CSS.split('}').filter(function (r) { return r.indexOf('#fc-event-scroll-header > .header-cell:nth-child(8)') > -1; })[0] || '';
ok(/width:\s*190px/.test(epRule), 'F8 §4 Event Period defaults to 190px', epRule.replace(/\s+/g, ' ').trim().slice(0, 120));
ok(!/justify-content:\s*flex-end/.test(epRule), 'F9 §4 and is not right-aligned like a number');

// §7.10 — the table scrolls horizontally when the columns outgrow the viewport. This is what makes an
// unbounded max width safe: widening a column pushes the row wider rather than squeezing its neighbours.
var scrollCol = CSS.split('}').filter(function (r) {
  return r.indexOf('#fc-summary-section .scroll-col') > -1; })[0] || '';
ok(/overflow-x:\s*auto/.test(scrollCol), 'F10 §7.10 the scroll column scrolls horizontally', scrollCol.replace(/\s+/g, ' ').trim());
ok(/#fc-summary-section \.fixed-col[\s\S]{0,400}?position:\s*sticky/.test(CSS),
  'F11 §4 and the identity column stays sticky while it scrolls');
// The three tables' own rules must not reintroduce a width ceiling on the row itself.
ok(/#fc-summary-section \.scroll-row \{[^}]*min-width:\s*max-content/.test(CSS),
  'F12 §7.10 a row is as wide as its columns — never clipped to the viewport');

// §7.14 — resizing is a presentation change. The whole resize block must not reach sorting, pagination
// or any render path; if it did, a drag could reorder or repage the table under the operator.
var RESIZE_BLOCK = (function () {
  var src = codeOnly(read(JS_REL).replace(/\r\n/g, '\n'));
  var a = src.indexOf('var FC_RESIZE_MAX_');
  var b = src.indexOf('function _fcResizeInit_');
  var end = src.indexOf('}', src.indexOf('return mounted;', b));
  return src.slice(a, end + 1);
})();
ok(RESIZE_BLOCK.length > 500, 'F13 the resize block was located', RESIZE_BLOCK.length);
['sort', 'paginat', 'currentPage', 'renderFcRegularTable', 'renderFcEventTable', 'renderTargetRulesTable',
 'filter('].forEach(function (tok) {
  ok(RESIZE_BLOCK.indexOf(tok) === -1,
    'F14 §7.14 the resize path never touches ' + tok + ' — sorting and pagination are unaffected');
});

// =================================================================================================
section('G. RETRY LABEL — §1');
// =================================================================================================
var JS_SRC = read(JS_REL);
var LBL = {};
(function () {
  var m = /var FC_RETRY_LABEL_ = \{([\s\S]*?)\};/.exec(JS_SRC)[1];
  m.split(',').forEach(function (p) {
    var kv = p.split(':'); if (kv.length < 2) return;
    LBL[kv[0].trim()] = kv[1].trim().replace(/^'|'$/g, '');
  });
})();
eq(LBL.COLD_READ, 'Retry', 'G1 §1 cold read failure → "Retry"');
eq(LBL.STALE_AFTER_WRITE, 'Refresh view', 'G2 §1 stale after a CONFIRMED write → "Refresh view"');
eq(LBL.UNKNOWN_WRITE, 'Check latest data', 'G3 §1 unknown write outcome → "Check latest data"');
eq(LBL.REFUSED_ZERO, 'Check latest data', 'G4 a proven zero-write refusal is also a look, not a resend');

// Every banner in this file must take its label from the map, never from a literal.
// Real call sites only, with balanced parentheses — the previous form stopped at the first ')' and also
// matched the function's own declaration, so it was measuring two things that are not call sites.
var JS_CODE = codeOnly(JS_SRC);
function bannerCallSites(src) {
  var out = [], at = 0;
  for (;;) {
    var i = src.indexOf('_fcShowBanner_(', at);
    if (i < 0) break;
    at = i + 1;
    if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;   // the declaration, not a call
    var d = 0, j = src.indexOf('(', i);
    for (var k = j; k < src.length; k++) {
      if (src[k] === '(') d++;
      else if (src[k] === ')') { d--; if (d === 0) { out.push(src.slice(i, k + 1)); break; } }
    }
  }
  return out;
}
var bannerCalls = bannerCallSites(JS_CODE);
ok(bannerCalls.length >= 5, 'G5 the banner call sites were found', bannerCalls.length);
bannerCalls.forEach(function (c, i) {
  ok(/_fcRetryLabel_\(/.test(c), 'G6 banner call ' + (i + 1) + ' takes its label from _fcRetryLabel_',
    c.replace(/\s+/g, ' ').slice(0, 120));
});
// ...and the sentence is built from the SAME label.
ok(/'Press ' \+ label \+ '\. It issues exactly one new request/.test(JS_SRC),
  'G7 §1 the explanatory sentence interpolates the same label the button shows');
ok(!/Press Retry\. It issues/.test(JS_CODE),
  'G8 §1 no hard-coded "Press Retry." sentence survives in the CODE');
ok(/Press Retry\. It issues/.test(JS_SRC),
  'G8b ...while the comment that QUOTES the old sentence to explain the defect is still there — which is\n       also proof the stripper is not simply erasing everything the scan asks about');
// the cold-read surface now renders a control at all
ok(/_fcShowBanner_\(FC_MSG_\.READ_FAILED, _fcRetryLabel_\(FC_RETRY_\.COLD_READ\)/.test(JS_SRC),
  'G9 §1 _fcRenderError_ renders the Retry control its sentence names');
// single-flight and policy untouched
ok(/if \(_fcReadbackFlight_\) return;/.test(JS_SRC), 'G10 §1 the refresh remains single-flight');
['maxRetries', 'readTimeoutMs', 'cache:', 'km_rid', 'googleusercontent'].forEach(function (tok) {
  ok(JS_CODE.indexOf(tok) === -1,
    'G11 §1 no CODE in the page mentions ' + tok + ' — redirect policy is untouched');
});
var TRANSPORT_AT_BASE = require('child_process')
  .execSync('git show 1752436:assets/js/api/km-transport.js', { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 26 });
eq(TRANSPORT_AT_BASE.replace(/\r\n/g, '\n'), read('assets/js/api/km-transport.js').replace(/\r\n/g, '\n'),
  'G12 §1/§9 km-transport.js is byte-identical to BASE — page ownership was possible, so it was used');

// =================================================================================================
section('I. REDIRECT / RETRY REGRESSION — §8, with controlled responses');
// =================================================================================================
// The real _fcRefreshViewNow_ against a scripted _fcWorkspaceRefresh_. The delivery failure itself is NOT
// reproduced — §8 forbids using an external outage as a pass gate, and an intermittent Google hop could
// never be one. What is proven is what this page does WITH such a failure.
var RETRY_VARS = ['FC_VIEW_', 'FC_MSG_', 'FC_RETRY_', 'FC_RETRY_LABEL_',
  // INCIDENT-BOOT-FC-R1 §4D — the stage vocabulary the refusal banner names.
  'FC_STAGE_', 'FC_UNREADABLE_CODES_', '_fcViewState_',
  '_fcReadbackFlight_', '_fcReadbackLoads_', '_fcReadModel', '_fcMeta_'];
// INCIDENT-BOOT-FC-R1 — Retry now runs the page's ONE hydration authority instead of re-rendering the
// rows alone, so the authority has to be in the sandbox for _fcRefreshViewNow_ to resolve. What this
// section asserts is unchanged: it is about the LABEL on the control, not about what hydration builds.
var RETRY_FNS = ['_fcRetryLabel_', '_fcBannerHost_', '_fcClearBanner_', '_fcShowBanner_',
  '_fcEpoch_', '_fcOwns_', '_fcFailureStage_', '_fcStageText_',
  '_fcRerenderTables_', '_fcHydrateFromModel_', '_fcRefreshViewNow_'];

function buildRetry(opts) {
  opts = opts || {};
  var JS = read(JS_REL);
  var dom = makeDom();
  var banner = dom.El('div'); banner.id = 'fc-view-banner'; dom.document.body.appendChild(banner);
  var reads = [], writes = [], hydrated = [];
  var ctx = {
    console: console, window: null, document: dom.document,
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    getComputedStyle: function () { return { position: 'static' }; },
    Date: Date, Promise: Promise, JSON: JSON, String: String, Number: Number, Object: Object,
    __reads: reads, __writes: writes, __hydrated: hydrated, __dom: dom
  };
  ctx.window = ctx;
  // THE REAL OWNERSHIP AUTHORITY. _fcOwns_ asks window.KM.lifecycle; with no lifecycle present it returns
  // true for everything, so a harness without one cannot test unmount at all — it only proves the default.
  var epoch = { n: 1 };
  ctx.window.KM = { transport: null, DB: {}, api: {},
    lifecycle: {
      currentEpoch: function () { return epoch.n; },
      commitGuard: function (e, section) { return e === epoch.n && section === 'fc-summary-section'; }
    } };
  ctx.__unmount = function () { epoch.n += 1; };      // the page navigated away
  vm.createContext(ctx);
  var pieces = [];
  RETRY_VARS.forEach(function (n) { pieces.push(extractVar(JS, n)); });
  RETRY_FNS.forEach(function (n) { pieces.push(extractFn(JS, n)); });
  // Collaborators this section does not exercise, stubbed so the real functions above can run unchanged.
  pieces.push('var _fcPageEpoch_ = 1;');
  pieces.push('function _fcRegion_() { return null; }');
  // The two populate functions the hydration authority drives. Recorded rather than real: their CONTENT
  // is proven by fc-retry-canonical-hydration-boot-fc-r1, and this section has no filter markup to fill.
  pieces.push('function _populateFcFilterOptionsFromDb() { __hydrated.push(\'filters\'); }');
  pieces.push('function _populateFcYearFromDb() { __hydrated.push(\'year\'); }');
  pieces.push('var __script = ' + JSON.stringify(opts.script || ['ok']) + ';');
  pieces.push('var __step = 0;');
  pieces.push([
    'function _fcWorkspaceRefresh_() {',
    '  var mode = __script[Math.min(__step, __script.length - 1)]; __step++;',
    '  __reads.push(mode);',
    '  if (mode === \'ok\') { _fcReadModel = { rows: 1 }; return Promise.resolve(_fcReadModel); }',
    '  var e = { code: \'REDIRECT_TARGET_NOT_FOUND\', message: \'The API redirect target had already expired\' };',
    '  return Promise.reject(e);',
    '}'
  ].join('\n'));
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-summary-retry.js' });
  ctx.__banner = function () {
    var h = ctx.document.getElementById('fc-view-banner');
    var b = h.querySelector('[id]');
    var btn = null;
    h.children.forEach(function (c) { if (c.tagName === 'BUTTON') btn = c; });
    return { hidden: h.hidden, label: btn ? btn.textContent : null, button: btn };
  };
  return ctx;
}

// §8.1 — a cold read fails with REDIRECT_TARGET_NOT_FOUND; the offered control says "Retry", and pressing
// it issues exactly ONE more read, which succeeds.
var r1 = buildRetry({ script: ['fail', 'ok'] });
r1._fcReadModel = null;
r1._fcRefreshViewNow_(r1.FC_MSG_.READ_FAILED, r1.FC_RETRY_.COLD_READ);
setTimeout(function () {
  var b = r1.__banner();
  eq(b.label, 'Retry', 'I1 §8 a failed cold read offers a control labelled "Retry"');
  eq(r1.__reads.length, 1, 'I2 §8 exactly one read was issued');
  eq(r1._fcViewState_, r1.FC_VIEW_.REFUSED, 'I3 with no model, the view is REFUSED — never "loaded empty"');
  ok(r1._fcReadModel === null, 'I4 §8 no data was invented');
  b.button.onclick();
  eq(r1.__reads.length, 2, 'I5 §8 pressing Retry issued exactly ONE more read');
  setTimeout(function () {
    eq(r1._fcViewState_, r1.FC_VIEW_.CURRENT, 'I6 §8 the retry succeeded and the view is current');
    eq(r1.__writes.length, 0, 'I7 §8 no write was issued at any point');

    // §8.2 — repeated clicks while a retry is open add NOTHING.
    var r2 = buildRetry({ script: ['fail', 'fail', 'fail'] });
    r2._fcRefreshViewNow_(r2.FC_MSG_.READ_FAILED, r2.FC_RETRY_.COLD_READ);
    r2._fcRefreshViewNow_(r2.FC_MSG_.READ_FAILED, r2.FC_RETRY_.COLD_READ);
    r2._fcRefreshViewNow_(r2.FC_MSG_.READ_FAILED, r2.FC_RETRY_.COLD_READ);
    eq(r2.__reads.length, 1, 'I8 §8 three clicks while one is in flight issue ONE read');

    // §8.3 — a CONFIRMED write whose readback fails says "Refresh view", not "Retry".
    var r3 = buildRetry({ script: ['fail'] });
    r3._fcReadModel = { rows: 5 };                       // a valid table is already on screen
    r3._fcRefreshViewNow_(r3.FC_MSG_.SAVED_STALE, r3.FC_RETRY_.STALE_AFTER_WRITE);
    setTimeout(function () {
      var b3 = r3.__banner();
      eq(b3.label, 'Refresh view', 'I9 §8 a stale-after-confirmed-write failure says "Refresh view"');
      eq(r3._fcViewState_, r3.FC_VIEW_.STALE, 'I10 §8 the state is STALE, not REFUSED');
      eq(r3._fcReadModel, { rows: 5 }, 'I11 §8 the last valid table was preserved');

      // §8.4 — route away before the retry settles: nothing is drawn over whatever replaced the page.
      var r4 = buildRetry({ script: ['fail'] });
      r4._fcReadModel = { rows: 2 };
      r4._fcRefreshViewNow_(r4.FC_MSG_.READ_FAILED, r4.FC_RETRY_.COLD_READ);
      r4.__unmount();                                    // the page navigated away mid-read
      var before = r4.document.getElementById('fc-view-banner').children.length;
      setTimeout(function () {
        eq(r4.document.getElementById('fc-view-banner').children.length, before,
          'I12 §8 a settled read on an unmounted page mutates NO DOM');
        eq(r4.__writes.length, 0, 'I13 §8 and issues no write');
        // The guard must be the reason, not an inert harness: the same sequence WITHOUT the unmount draws.
        var r5 = buildRetry({ script: ['fail'] });
        r5._fcReadModel = { rows: 2 };
        r5._fcRefreshViewNow_(r5.FC_MSG_.READ_FAILED, r5.FC_RETRY_.COLD_READ);
        setTimeout(function () {
          ok(r5.document.getElementById('fc-view-banner').children.length > 0,
            'I14 §8 a MOUNTED page does draw the banner — so I12 measured the guard, not a dead harness');
          finish();
        }, 0);
      }, 0);
    }, 0);
  }, 0);
}, 0);

function finish() {

// =================================================================================================
section('H. MUTANTS');
// =================================================================================================
function mountedGroups(opts) {
  var ctx = build(opts); buildSection(ctx.__dom);
  return { ctx: ctx, groups: ctx._fcResizeInit_() };
}
var MUTANTS = [
  { id: 'M1', why: 'the Target controller is omitted, so Target Rules silently keeps no handles',
    check: function () {
      var r = mountedGroups({ mutateJs: function (js) {
        return swapSrc(js, "  { group: 'fc-target', panel: 'fc-panel-target',", "  { group: 'fc-target-DISABLED', panel: 'nope',"); } });
      return r.groups.indexOf('fc-target') > -1 && handleCount(r.ctx, 'fc-target') === 17;
    } },

  { id: 'M2', why: "Regular's rule leaks into Event — one selector stops naming its own table",
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + c.col + '), ' +\n         '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + c.col + ') ' +",
          "  return '#fc-summary-section .scroll-header > .header-cell:nth-child(' + c.col + '), ' +\n         '#fc-summary-section .scroll-row > .scroll-cell:nth-child(' + c.col + ') ' +"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 7, 100);
      // CORRECT behaviour: the rule names fc-regular's ids, so Event's selector finds nothing.
      return injectedWidths(ctx, 'fc-regular', 7).header === 170 && injectedWidths(ctx, 'fc-event', 7).header === null;
    } },

  { id: 'M3', why: 'a blocking max-width is restored, so the engine can no longer widen past the default',
    check: function () {
      // Modelled on the CSS side: if the stylesheet out-ranked the injected rule, the observed width would be
      // the default rather than the dragged one. Proven here by specificity, which is what actually decides.
      // Routed through swapSrc so the vacuity audit can neuter it like every other mutant.
      var mutated = swapSrc(read(CSS_REL),
        '#fc-regular-scroll-header > .header-cell:nth-child(7),',
        '#fc-summary-section #fc-regular-scroll-header > .header-cell:nth-child(7):nth-child(7),');
      var worstM = 0;
      mutated.split('}').forEach(function (r) {
        var sel = r.split('{')[0];
        if (!/scroll-header|scroll-cell|header-cell/.test(sel)) return;
        sel.split(',').forEach(function (one) { var sp = specificity(one.trim()); if (sp > worstM) worstM = sp; });
      });
      return injSpec > worstM;   // correct = the engine still outranks everything
    } },

  { id: 'M4', why: 'the injected rule stops naming the body, so the header moves and the body does not',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "         '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + c.col + ') ' +\n", ""); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 6, 50);
      var w = injectedWidths(ctx, 'fc-regular', 6);
      return w.header !== null && w.body !== null && w.header === w.body;
    } },

  { id: 'M5', why: 'the injected rule stops naming the header, so the body moves and the header does not',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + c.col + '), ' +\n", "  return ''+"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 6, 50);
      var w = injectedWidths(ctx, 'fc-regular', 6);
      return w.header !== null && w.body !== null && w.header === w.body;
    } },

  { id: 'M6', why: 'all three tabs share one persistence group, so resizing one moves the others',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "    storage: { key: 'km.ui.tableWidths.v1', page: 'fc-summary', group: spec.group },",
          "    storage: { key: 'km.ui.tableWidths.v1', page: 'fc-summary', group: 'shared' },"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 6, 50);
      var st = JSON.parse(ctx.__store()['km.ui.tableWidths.v1'] || '{}');
      var groups = Object.keys(st['fc-summary'] || {}).sort();
      // CORRECT: the dragged table's OWN group is what got written. Under the mutant every table shares
      // one group, so the key is 'shared' and a second tab's widths would land in the same bucket.
      return JSON.stringify(groups) === JSON.stringify(['fc-regular']);
    } },

  { id: 'M7', why: 'the Series-only survivor is restored — every other column loses its handle',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "    if (spec.noResize.indexOf(col) !== -1) return;",
          "    if (spec.noResize.indexOf(col) !== -1) return;\n    if (c.label !== 'Series') return;"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      return handleCount(ctx, 'fc-regular') === 20 && handleCount(ctx, 'fc-target') === 17;
    } },

  { id: 'M8', why: 'the handle is bound to the wrong column index, so dragging moves a neighbour',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "      var cell = list[c.col - 1];", "      var cell = list[c.col] || list[c.col - 1];"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 6, 50);
      // correct = the column that MOVED is the one that was grabbed
      return injectedWidths(ctx, 'fc-regular', 6).header === 150;
    } },

  { id: 'M9', why: 'reset clears every tab instead of the active one',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "  b.onclick = function () { if (ctl && typeof ctl.resetAll === 'function') ctl.resetAll(); };",
          "  b.onclick = function () { Object.keys(_fcResizeCtl_).forEach(function (g) { var x = _fcResizeCtl_[g]; if (x) x.resetAll(); }); };"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 6, 50); drag(ctx, 'fc-event', 8, 50);
      ctx.document.getElementById('fc-regular-reset-widths').onclick();
      return injectedWidths(ctx, 'fc-regular', 6).header === null
        && injectedWidths(ctx, 'fc-event', 8).header === 240;      // Event must SURVIVE
    } },

  { id: 'M10', why: 'resizing triggers a workspace read',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "    cssRule: function (c, w) { return _fcResizeCssRule_(spec, c, w); }",
          "    cssRule: function (c, w) { try { window.KM.api.getWorkspace('fcSummary', {}); } catch (e) {} return _fcResizeCssRule_(spec, c, w); }"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      var n0 = ctx.__apiCalls.length;
      drag(ctx, 'fc-regular', 6, 50);
      return ctx.__apiCalls.length === n0;
    } },

  { id: 'M11', why: 'the shape gate is removed, so a markup change wires handles to the wrong positions',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "  if (!cells.length || cells.length !== spec.cols.length) return null;",
          "  if (!cells.length) return null;"); } });
      // give Regular one column FEWER than the declaration expects
      var d = ctx.__dom; buildSection(d);
      var hdr = ctx.document.getElementById('fc-regular-scroll-header');
      hdr.removeChild(hdr.children[hdr.children.length - 1]);
      var groups = ctx._fcResizeInit_();
      return groups.indexOf('fc-regular') === -1;      // correct = refuse to wire a table it does not recognise
    } },

  // FOUND BY THIS SUITE, IN THIS ROUND'S OWN IMPLEMENTATION. The engine's destroy() removes every handle
  // under `root`. Giving all three controllers the SECTION as their root meant each teardown stripped the
  // other two tables' handles, so after one re-mount the first two tables had none. The root is now each
  // table's own panel, and this mutant restores the shared root to prove the re-mount case still bites.
  { id: 'M13', why: 'all three controllers share the section as root, so a re-mount strips the other tables',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "  var root = document.getElementById(spec.panel); if (!root) return null;",
          "  var root = document.getElementById('fc-summary-section'); if (!root) return null;"); } });
      buildSection(ctx.__dom);
      ctx._fcResizeInit_();
      ctx._fcResizeInit_();                       // the re-mount is where the defect shows
      return handleCount(ctx, 'fc-regular') === 20 && handleCount(ctx, 'fc-event') === 10
        && handleCount(ctx, 'fc-target') === 17;
    } },

  { id: 'M12', why: 'the minimum is raised above a month column default, silently rewidening the table',
    check: function () {
      var ctx = build({ mutateJs: function (js) {
        return swapSrc(js, "function _fcResizeMin_(def) { return Math.min(FC_RESIZE_MIN_, def); }",
          "function _fcResizeMin_(def) { return FC_RESIZE_MIN_; }"); } });
      buildSection(ctx.__dom); ctx._fcResizeInit_();
      drag(ctx, 'fc-regular', 7, 0);            // a zero-distance drag must not change the width
      var w = injectedWidths(ctx, 'fc-regular', 7);
      return w.header === 70;
    } }
];
var caught = 0, survived = [];
MUTANTS.forEach(function (m) {
  var still;
  try { still = m.check(); } catch (e) { still = false; }
  if (still === false) { caught++; console.log('ok   ' + m.id + '  ' + m.why + ' (caught)'); }
  else { survived.push(m.id); console.error('FAIL ' + m.id + '  SURVIVED — ' + m.why); }
});
ok(survived.length === 0, 'H1 every mutant was caught', survived);

console.log('\n' + new Array(101).join('='));
console.log('FC COLUMN RESIZE + RETRY LABEL (R2B-A2-R3) — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + caught + '  survived ' + survived.length);
console.log(new Array(101).join('='));
process.exit(fail || survived.length ? 1 : 0);
}   // finish()
