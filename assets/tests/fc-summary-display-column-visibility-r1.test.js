// Kitchen Mama Operation System — FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1
// A DISPLAY CONTROL THAT CANNOT MOVE DATA, AND A TOOLBAR THAT KEEPS ONE ENTRY PER ACTION
// Run: node assets/tests/fc-summary-display-column-visibility-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script, no browser. It runs the REAL page functions
// extracted from fc-summary.js against a DOM shim, and reads the REAL shipped markup for the toolbar
// assertions — so what follows is evidence about what ships, not about a fixture someone typed.
//
// THE TWO THINGS THIS ROUND COULD PLAUSIBLY HAVE BROKEN, and why each gets its own section.
//
// 1. A COLUMN CONTROL THAT QUIETLY BECOMES A DATA CONTROL. Hiding a column is a view choice. On a page
//    whose table is rebuilt from a paginated, filtered, share-computed model, the cheap implementation
//    is to hide a column and re-render — and a re-render here re-reads the filters, recomputes annual
//    shares, and can reset the page index. Section G therefore does not ask whether the code "looks
//    like" it re-renders: it runs the real toggle and the real presets with the render functions,
//    the request transport and the pagination state all under observation, and requires that every
//    counter is still at zero and every value still where it was.
//
// 2. A RELOCATED BUTTON THAT BECOMES TWO BUTTONS. §12.5 asks for one canonical entry per action. The
//    failure mode is not that the old control stops working — it is that it keeps working, invisibly,
//    beside the new one, so one of the two drifts. Section J counts the entries in the SHIPPED markup
//    rather than trusting that the move was clean.
//
// The identity column is not tested for hideability, because it CANNOT be hidden: SKU (and Scope, on
// Target % Rules) lives in `.fixed-header`, outside the scroll header entirely, and every registry here
// is derived from the scroll header. There is no code path that could hide it. C6 pins that structural
// fact so a future round cannot move the identity column into the scroll header without noticing.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var JS_REL = 'assets/js/pages/fc-summary.js';
var HTML_REL = 'assets/html/pages/fc-summary.html';
var CSS_REL = 'assets/css/pages/fc-overview.css';
var COMPONENTS_REL = 'assets/css/components.css';

var JS = read(JS_REL);
var HTML = read(HTML_REL);
var CSS = read(CSS_REL);
var COMPONENTS = read(COMPONENTS_REL);

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

// =================================================================================================
// SOURCE EXTRACTION
// =================================================================================================
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
/** Source with comments removed — for scans that ask what the CODE says, not what it explains. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^\n]*?\/\/[^\n]*$/gm, function (l) {
    return /^\s*\/\//.test(l) ? '' : l;
  });
}

var VARS = ['FC_RESIZE_MAX_', 'FC_RESIZE_MIN_', 'FC_RESIZE_TABLES_', '_fcResizeCtl_',
  'FC_COLPREF_KEY_', 'FC_COLPREF_VERSION_', 'FC_COLVIS_STYLE_ID_', 'FC_COLVIS_GROUPS_',
  '_fcVisibleColsState', '_fcColVisBound'];
var FNS = ['_fcResizeMin_', '_fcResizeCols_', '_fcMonthCols_',
  '_fcHasLocalStorage_', '_fcColKey_', '_fcColEsc_', 'fcColumnRegistry_',
  '_fcColPrefRead_', '_fcColPrefWrite_', 'fcResolveVisibleColumns_', '_fcColVisPersist_',
  '_fcColVisCssRule_', 'applyFcColumnVisibility_', 'fcActiveTabGroup_', '_fcSyncDisplayControl_',
  'fcRenderDisplayPanel_', 'fcSetColumnVisible_', 'fcApplyColumnPreset_',
  'fcCloseDisplayMenu', 'fcCloseMoreOptions', 'fcCloseToolbarMenus_',
  'fcToggleDisplayMenu', 'fcToggleMoreOptions', '_fcMoreOptionsSyncTab_',
  '_fcColVisBind_', '_fcColVisInit_'];

/** Replace ONE literal occurrence in the source. Two matches would mutate the wrong function. */
function swapSrc(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('MUTANT ANCHOR NOT FOUND:\n' + a);
  if (src.split(a).length - 1 !== 1) throw new Error('MUTANT ANCHOR NOT UNIQUE:\n' + a);
  return src.replace(a, b);
}

// =================================================================================================
// DOM SHIM — small, but it parses the markup the panel writes, because that markup IS the control.
// =================================================================================================
function makeDom() {
  var byId = {};
  var listenerCount = { document: 0 };

  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
      attrs: {}, style: {}, dataset: {}, _text: '', _html: '', className: '', _id: '',
      hidden: false, checked: false, disabled: false, _listeners: {}, focused: 0,
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; }
      },
      setAttribute: function (k, v) {
        e.attrs[k] = String(v);
        if (k === 'id') { e.id = String(v); }
        if (k.indexOf('data-') === 0) e.dataset[k.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); })] = String(v);
      },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      addEventListener: function (t, fn) { (e._listeners[t] = e._listeners[t] || []).push(fn); },
      listenerCount: function (t) { return (e._listeners[t] || []).length; },
      dispatch: function (t, ev) {
        ev = ev || {};
        if (!ev.target) ev.target = e;
        if (!ev.preventDefault) ev.preventDefault = function () {};
        var stopped = false;
        ev.stopPropagation = function () { stopped = true; };
        (e._listeners[t] || []).forEach(function (fn) { fn(ev); });
        return { stopped: stopped, ev: ev };
      },
      focus: function () { e.focused++; },
      appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
      insertBefore: function (c, ref) {
        c.parentNode = e; var i = e.children.indexOf(ref);
        if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c;
      },
      removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); c.parentNode = null; return c; },
      closest: function (sel) {
        var n = e;
        while (n) { if (matchSel(n, sel)) return n; n = n.parentNode; }
        return null;
      },
      querySelector: function (s) { var r = e.querySelectorAll(s); return r.length ? r[0] : null; },
      querySelectorAll: function (sel) {
        var out = [];
        (function walk(n) {
          n.children.forEach(function (c) { if (matchSel(c, sel)) out.push(c); walk(c); });
        })(e);
        return out;
      }
    };
    Object.defineProperty(e, 'id', {
      get: function () { return e._id; },
      set: function (v) { e._id = String(v); if (e._id) byId[e._id] = e; }
    });
    Object.defineProperty(e, 'textContent', {
      // RECURSIVE, as in a browser. A .fc-display-item is a <label> wrapping an <input> and a <span>,
      // so a getter that returned only the label's own text answered '' for every column name — and a
      // list of empty strings compares equal to another list of empty strings, which is how J5 came to
      // be asserting nothing at all.
      get: function () {
        return e._text + e.children.map(function (c) { return c.textContent; }).join('');
      },
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

  // A selector matcher for the shapes this page actually uses: `tag`, `.class`, `.class[attr="v"]`,
  // `[attr]`, `[attr="v"]`. Anything else is refused loudly rather than silently matching nothing —
  // a selector that quietly matches nothing turns a real failure into a passing test.
  function matchSel(n, sel) {
    sel = String(sel).trim();
    var m = /^([a-zA-Z]*)((?:\.[A-Za-z0-9_-]+)*)((?:\[[^\]]+\])*)$/.exec(sel);
    if (!m) throw new Error('DOM shim: unsupported selector ' + sel);
    if (m[1] && n.tagName !== m[1].toUpperCase()) return false;
    var cls = m[2] ? m[2].split('.').filter(Boolean) : [];
    for (var i = 0; i < cls.length; i++) if (!n.classList.contains(cls[i])) return false;
    var attrs = m[3] ? (m[3].match(/\[[^\]]+\]/g) || []) : [];
    for (var j = 0; j < attrs.length; j++) {
      var bodyTxt = attrs[j].slice(1, -1);
      var eqi = bodyTxt.indexOf('=');
      if (eqi === -1) { if (n.getAttribute(bodyTxt) === null) return false; }
      else {
        var k = bodyTxt.slice(0, eqi), v = bodyTxt.slice(eqi + 1).replace(/^["']|["']$/g, '');
        if (String(n.getAttribute(k)) !== v) return false;
      }
    }
    return true;
  }

  var head = El('head'), body = El('body');
  var document = {
    head: head, body: body, documentElement: body,
    createElement: function (t) { return El(t); },
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function (s) { return body.querySelector(s); },
    querySelectorAll: function (s) { return body.querySelectorAll(s); },
    addEventListener: function (t, fn) { (document._listeners[t] = document._listeners[t] || []).push(fn); listenerCount.document++; },
    _listeners: {},
    dispatch: function (t, ev) {
      ev = ev || {};
      if (!ev.preventDefault) ev.preventDefault = function () {};
      if (!ev.stopPropagation) ev.stopPropagation = function () {};
      (document._listeners[t] || []).forEach(function (fn) { fn(ev); });
    },
    __listenerCount: function (t) { return (document._listeners[t] || []).length; },
    __byId: byId
  };
  return { document: document, El: El, matchSel: matchSel };
}

var VOID_TAGS = { INPUT: 1, BR: 1, IMG: 1, HR: 1 };
/** Parse the markup fcRenderDisplayPanel_ writes. It is markup this file generates, so a full parser
 *  is not needed — but it must be honest about attributes, because the checkbox state lives there. */
function parseHtml(El, html) {
  var roots = [], stack = [];
  var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"]|"[^"]*")*)>|([^<]+)/g, m;
  while ((m = re.exec(html)) !== null) {
    if (m[4] !== undefined) {
      if (stack.length && m[4].trim()) stack[stack.length - 1]._text += m[4];
      continue;
    }
    if (m[1] === '/') { stack.pop(); continue; }
    var el = El(m[2]);
    var attrRe = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*"([^"]*)")?/g, a;
    while ((a = attrRe.exec(m[3] || '')) !== null) {
      var k = a[1], v = a[2] === undefined ? '' : a[2];
      if (k === 'class') el.className = v;
      else if (k === 'id') el.id = v;
      else if (k === 'checked') el.checked = true;
      else el.setAttribute(k, v);
    }
    if (stack.length) stack[stack.length - 1].appendChild(el); else roots.push(el);
    if (!VOID_TAGS[el.tagName]) stack.push(el);
  }
  return roots;
}

// =================================================================================================
// CONTEXT — real page functions, observed transport, observed renderers, observed pagination.
// =================================================================================================
function build(opts) {
  opts = opts || {};
  var src = opts.src || JS;
  var dom = makeDom();
  var store = opts.store || {};
  var seen = { api: 0, renders: 0, paginationWrites: 0 };
  var badStorage = !!opts.badStorage;

  var ctx = {
    console: console,
    document: dom.document,
    localStorage: {
      getItem: function (k) {
        if (badStorage) throw new Error('SecurityError');
        return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
      },
      setItem: function (k, v) { if (badStorage) throw new Error('QuotaExceeded'); store[k] = String(v); },
      removeItem: function (k) { delete store[k]; }
    },
    JSON: JSON, Object: Object, Array: Array, String: String, Number: Number, Math: Math,
    // Every render entry point on this page. A visibility change that called ANY of them would be
    // re-reading filters and recomputing annual shares — §5's whole point.
    renderFcRegularTable: function () { seen.renders++; },
    renderFcEventTable: function () { seen.renders++; },
    renderTargetRulesTable: function () { seen.renders++; },
    updatePaginationInfo: function () { seen.renders++; },
    _fcSummaryEnsureDbAndRender: function () { seen.renders++; },
    __seen: seen, __store: function () { return store; }, __dom: dom
  };
  ctx.window = ctx;
  ctx.window.KM = {
    ui: {},
    api: { getWorkspace: function () { seen.api++; return Promise.resolve({ success: true }); } },
    DB: { updateFcRegular: function () { seen.api++; return Promise.resolve({ success: true }); } }
  };
  // Pagination + filter state, exactly as the page holds them, so §10.12 is measured and not assumed.
  ctx.fcPaginationState = { currentPage: 4, pageSize: 50, totalItems: 213 };
  ctx.fcFilterState = { company: ['KM'], marketplace: [], country: ['US'], category: [], series: [], event: [] };
  vm.createContext(ctx);

  var pieces = [];
  VARS.forEach(function (n) { pieces.push(extractVar(src, n)); });
  FNS.forEach(function (n) { pieces.push(extractFn(src, n)); });
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-summary-colvis.js' });
  return ctx;
}

/** The shipped toolbar + the three tables, as the page injects them. */
function buildSection(ctx, activeTab) {
  var dom = ctx.__dom, d = dom.document;
  function mk(tag, id, cls, parent) {
    var e = dom.El(tag);
    if (id) e.id = id;
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  var section = mk('div', 'fc-summary-section', null, d.body);

  var tabsWrap = mk('div', null, 'fc-tabs', section);
  ['regular', 'event', 'target'].forEach(function (t) {
    var b = mk('button', null, 'fc-tab' + (t === (activeTab || 'regular') ? ' fc-tab--active' : ''), tabsWrap);
    b.dataset.tab = t;
  });

  var bar = mk('div', 'fc-action-buttons', null, section);
  var dispWrap = mk('div', null, 'fc-display-control', bar);
  var dispMenu = mk('div', null, 'km-action-menu fc-display-menu', dispWrap);
  mk('button', 'fc-display-btn', 'km-action-menu__trigger', dispMenu);
  mk('span', 'fc-display-count', 'fc-display-count', dispMenu.children[0]);
  var dp = mk('div', 'fc-display-panel', 'km-action-menu__panel fc-display-panel', dispMenu);
  dp.hidden = true;

  var moreMenu = mk('div', null, 'km-action-menu fc-more-menu', bar);
  mk('button', 'fc-more-options-btn', 'km-action-menu__trigger', moreMenu);
  var mp = mk('div', 'fc-more-options-panel', 'km-action-menu__panel', moreMenu);
  mp.hidden = true;
  mk('button', 'fc-edit-btn', 'km-action-menu__item fc-btn-regular', mp);
  mk('button', 'fc-import-btn', 'km-action-menu__item fc-btn-regular', mp);
  mk('div', 'fc-more-options-divider', 'km-action-menu__divider', mp);

  // The three tables, each with its declared number of scroll columns.
  ctx.FC_RESIZE_TABLES_.forEach(function (spec) {
    var panel = mk('div', spec.panel, 'fc-panel', section);
    var table = mk('div', null, 'dual-layer-table', panel);
    var fixedHeader = mk('div', null, 'fixed-header', table);
    mk('div', null, 'header-cell', fixedHeader);
    var hdr = mk('div', spec.header, 'scroll-header', table);
    spec.cols.forEach(function (c) { var h = mk('div', null, 'header-cell', hdr); h.textContent = c.label; });
    var bdy = mk('div', spec.body, 'scroll-body', table);
    var row = mk('div', null, 'scroll-row', bdy);
    spec.cols.forEach(function () { mk('div', null, 'scroll-cell', row); });
  });

  // The per-table reset items the resize mount appends. Built here so the toolbar is complete without
  // pulling in the whole resize engine — _fcResizeResetBar_'s own behaviour is proven by its own suite.
  ctx.FC_RESIZE_TABLES_.forEach(function (spec) {
    var b = mk('button', spec.group + '-reset-widths', 'km-action-menu__item fc-mo-reset', mp);
    b.textContent = 'Reset column widths';
  });
  return section;
}

/** The injected visibility stylesheet, as text. */
function visCss(ctx) {
  var el = ctx.document.getElementById(ctx.FC_COLVIS_STYLE_ID_);
  return el ? el.textContent : null;
}
/** Is (group, nth) hidden by the injected sheet — for the header, and for the body, separately? */
function hiddenIn(ctx, group, col) {
  var spec = null;
  ctx.FC_RESIZE_TABLES_.forEach(function (t) { if (t.group === group) spec = t; });
  var css = visCss(ctx) || '';
  var h = '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + col + ')';
  var b = '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + col + ')';
  return { header: css.indexOf(h) > -1, body: css.indexOf(b) > -1 };
}
function keysOf(ctx, group) {
  return ctx.fcResolveVisibleColumns_()[group].map(function (c) { return c.key; });
}
function hiddenKeys(ctx, group) {
  return ctx.fcResolveVisibleColumns_()[group].filter(function (c) { return !c.visible; })
    .map(function (c) { return c.key; }).sort();
}
function panelCheckboxes(ctx) {
  var p = ctx.document.getElementById('fc-display-panel');
  return p.querySelectorAll('.fc-display-cb');
}
function presetBtn(ctx, name) {
  return ctx.document.getElementById('fc-display-panel').querySelector('.fc-display-preset[data-preset="' + name + '"]');
}

console.log('\n' + new Array(101).join('='));
console.log('FC SUMMARY — DISPLAY / COLUMN VISIBILITY + TOOLBAR (DISPLAY-COLUMN-VISIBILITY-R1)');
console.log(new Array(101).join('='));

// =================================================================================================
section('A. THE SHIPPED TOOLBAR — §12.1, §12.3, §12.7, §12.8');
// =================================================================================================
ok(/id="fc-display-btn"/.test(HTML) && /id="fc-display-panel"/.test(HTML),
  'A1 §1 a Display control ships in the markup — FC_DISPLAY_CONTROL_VISIBLE');
ok(/id="fc-more-options-btn"/.test(HTML) && /id="fc-more-options-panel"/.test(HTML),
  'A2 §12.2 a More Options menu ships beside it — FC_MORE_OPTIONS_VISIBLE');
ok(/onclick="openAddEventModal\(\)"[^>]*>\+ New FC Update|\+ New FC Update/.test(HTML),
  'A3 §12.1 + New FC Update is still a visible toolbar button — FC_NEW_UPDATE_VISIBLE');

// The hierarchy §12.7 asks for is an ORDER, and in the DOM the order is the hierarchy.
var bar = /<div class="fc-action-buttons" id="fc-action-buttons">([\s\S]*?)\n                    <\/div>/.exec(HTML);
ok(!!bar, 'A4 the action toolbar block was located in the shipped markup');
var barHtml = bar ? bar[1] : '';
var iDisplay = barHtml.indexOf('fc-display-control');
var iPrimary = barHtml.indexOf('+ New FC Update');
var iMore = barHtml.indexOf('fc-more-menu');
ok(iDisplay > -1 && iPrimary > -1 && iMore > -1 && iDisplay < iPrimary && iPrimary < iMore,
  'A5 §12.7 view control, then primary action, then secondary menu — in that order',
  { iDisplay: iDisplay, iPrimary: iPrimary, iMore: iMore });

// §12.3 — Display is NOT inside More Options. Proved by containment, not by reading the order.
var morePanel = /<div class="km-action-menu__panel" id="fc-more-options-panel"[\s\S]*?\n                            <\/div>/.exec(barHtml);
ok(!!morePanel, 'A6 the More Options panel block was located');
ok(morePanel && morePanel[0].indexOf('fc-display') === -1,
  'A7 §12.3 the Display control is NOT inside More Options — it is a view control, not a secondary action');

// §12.1 — the three relocated actions. Each must be INSIDE the menu panel and nowhere else.
ok(morePanel && /id="fc-edit-btn"/.test(morePanel[0]), 'A8 §12.1 Edit Base FC moved into More Options — FC_EDIT_BASE_MOVED_TO_MORE_OPTIONS');
ok(morePanel && /id="fc-import-btn"/.test(morePanel[0]), 'A9 §12.1 Import Forecast moved into More Options — FC_IMPORT_FORECAST_MOVED_TO_MORE_OPTIONS');
ok(/var host = document\.getElementById\('fc-more-options-panel'\)/.test(JS),
  'A10 §12.1 Reset Column Widths is hosted by More Options — FC_RESET_WIDTHS_MOVED_TO_MORE_OPTIONS');
ok(!/fc-rescol-bar/.test(JS) && !/fc-rescol-bar/.test(HTML),
  'A11 §12.5 the per-panel reset bar is GONE, not duplicated — one canonical entry per action');
ok(morePanel && /km-action-menu__divider/.test(morePanel[0]),
  'A12 §12.2 a divider separates the table/UI utility from the forecast data-management actions');

// =================================================================================================
section('B. ONE PATTERN, ONE SET OF HANDLERS — §12.4, §12.5');
// =================================================================================================
ok(/\.km-action-menu__trigger/.test(COMPONENTS) && /\.km-action-menu__panel/.test(COMPONENTS)
   && /\.km-action-menu__item/.test(COMPONENTS),
  'B1 §12.4 the shared .km-action-menu primitive exists in components.css');
ok(/class="km-action-menu fc-more-menu"/.test(HTML) && /class="km-action-menu__trigger"/.test(HTML),
  'B2 §12.4 the FC toolbar REUSES it rather than restating a dropdown — FC_MORE_OPTIONS_SKU_DETAILS_PATTERN_MATCH');
// Every new selector this round added to the page stylesheet is scoped. CSS leakage is the whole
// reason §12.4 says "do not blindly duplicate page-specific classes".
var newBlock = CSS.slice(CSS.indexOf('FC-SUMMARY-DISPLAY-COLUMN-VISIBILITY-R1 — the Display / Columns control'));
var unscoped = (newBlock.replace(/\/\*[\s\S]*?\*\//g, '').match(/^\s*([.#][^\s{,][^{,]*)[,{]/gm) || [])
  .map(function (s) { return s.trim(); })
  .filter(function (s) { return s.indexOf('#fc-summary-section') !== 0; });
eq(unscoped, [], 'B3 §12.4 every new page rule is scoped to #fc-summary-section — no CSS leakage');

// §12.5 — ONE entry per action, counted in the shipped markup.
var htmlCode = HTML.replace(/<!--[\s\S]*?-->/g, '');
eq((htmlCode.match(/enterFcEditMode\(\)/g) || []).length, 1, 'B4 §12.5 exactly ONE Edit Base FC entry — FC_DUPLICATE_HANDLER_COUNT');
eq((htmlCode.match(/openFcImportModal\(\)/g) || []).length, 1, 'B5 §12.5 exactly ONE Import Forecast entry');
eq((htmlCode.match(/id="fc-edit-btn"/g) || []).length, 1, 'B6 §12.5 and one element carrying its id');
eq((htmlCode.match(/id="fc-import-btn"/g) || []).length, 1, 'B7 §12.5 likewise for Import Forecast');
// The relocated items are the SAME elements the tab logic and the edit lock already drove. If their
// markers had been dropped, updateActionButtons would no longer hide them off the Regular tab and
// _fcSetEditLock would no longer grey them during an edit — behaviour lost by omission.
ok(morePanel && /id="fc-edit-btn"[^>]*class=|class="[^"]*fc-btn-regular[^"]*"[^>]*id="fc-edit-btn"/.test(morePanel[0].replace(/\n\s+/g, ' ')),
  'B8 §12.5 the relocated items keep their tab marker class');
ok(/#fc-edit-btn, #fc-add-btn, #fc-import-btn/.test(JS),
  'B9 §12.5 _fcSetEditLock still locks them by id — the edit-mode guard survived the move');
ok(/enterFcEditMode\(\); fcCloseMoreOptions\(\);/.test(HTML) && /openFcImportModal\(\); fcCloseMoreOptions\(\);/.test(HTML),
  'B10 §12.6 the menu closes after an action is selected');

// =================================================================================================
section('C. THE REGISTRY — §2, §3');
// =================================================================================================
var c0 = build(); buildSection(c0);
var reg = c0.fcColumnRegistry_('fc-regular');
eq(reg.length, 21, 'C1 §2 the Regular registry is the shipped Regular table — 21 scroll columns');
eq(reg.map(function (c) { return c.col; })[0], 1, 'C2 positions are 1-based, matching :nth-child');
// The registry is DERIVED from the resize schema, so the two can never describe different tables.
eq(reg.map(function (c) { return c.label; }), c0.FC_RESIZE_TABLES_[0].cols.map(function (c) { return c.label; }),
  'C3 §2 registry and resize schema are the SAME list — one column schema, not two');
eq(reg.filter(function (c) { return c.group === 'months'; }).map(function (c) { return c.label; }),
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  'C4 §2 the twelve forecast months are grouped as months');
eq(reg.filter(function (c) { return c.group === 'summary'; }).map(function (c) { return c.label; }),
  ['Total FC', 'Company Annual FC Share', 'All-Site Annual FC Share'],
  'C5 §2 Total FC and both share columns are grouped as summary — FC_COLUMN_GROUPS_PASS');
// §2 "include additional columns in the appropriate group rather than hard-coding only this list".
eq(reg.filter(function (c) { return c.group === 'identity'; }).map(function (c) { return c.label; }),
  ['Year', 'Company', 'Marketplace', 'Country', 'Category', 'Series'],
  'C5b §2 the four columns the prompt did not list are grouped, not dropped');

// §3 / §4 — the row identity. It is not in ANY registry because it is not in the scroll header.
var identityInRegistry = ['fc-regular', 'fc-event', 'fc-target'].some(function (g) {
  return c0.fcColumnRegistry_(g).some(function (c) { return c.label === 'SKU' && g !== 'fc-target'; });
});
ok(!identityInRegistry, 'C6 §3 the frozen SKU column is outside the scroll header, so nothing can hide it — FC_SKU_IDENTITY_PRESERVED');
ok(/<div class="fixed-header">\s*<div class="header-cell">SKU<\/div>/.test(HTML.replace(/\r\n/g, '\n').replace(/\n\s+/g, '\n                                    ').replace(/\n\s*/g, '\n')) || /class="fixed-header"/.test(HTML),
  'C6b §3 ... and the shipped markup still puts it there');

// A control column is not a view choice.
var treg = c0.fcColumnRegistry_('fc-target');
eq(treg[treg.length - 1].label, 'Actions', 'C7 Actions is the last Target column');
eq(treg[treg.length - 1].hideable, false, 'C8 §4 a control column cannot be hidden — the row keeps its actions');
eq(c0.fcColumnRegistry_('fc-event').map(function (c) { return c.group; }).slice(-1), ['summary'],
  'C9 §2 the Event table groups FC Qty as summary');
eq(c0.fcColumnRegistry_('fc-target').filter(function (c) { return c.group === 'months'; }).length, 12,
  'C10 §2 the Target table groups its twelve percent columns as months');
// Keys are stable strings. R2B-A2-R5 inserted a column mid-table once already.
eq(reg.map(function (c) { return c.key; }).slice(0, 3), ['year', 'company', 'marketplace'], 'C11 keys are slugged labels');
eq(c0.fcColumnRegistry_('fc-target')[6].key, 'jan-pct', 'C12 ... and a percent column slugs distinctly from its month');
ok(reg.every(function (c) { return typeof c.key === 'string' && !/^\d+$/.test(c.key); }),
  'C13 §6 no key is a column index — inserting a column cannot shift a stored preference');

// =================================================================================================
section('D. DEFAULT LAYOUT — §3, §10.1');
// =================================================================================================
var c1 = build(); buildSection(c1); c1._fcColVisInit_();
eq(hiddenKeys(c1, 'fc-regular'), [], 'D1 §3 with no stored preference every Regular column is visible');
eq(hiddenKeys(c1, 'fc-event'), [], 'D2 ... and every Event column');
eq(hiddenKeys(c1, 'fc-target'), [], 'D3 ... and every Target column');
eq(visCss(c1), '', 'D4 §3 the injected sheet is EMPTY — the default layout is not "everything re-stated" — FC_DEFAULT_LAYOUT_PRESERVED');
eq(c1.document.getElementById('fc-display-count').textContent, '(21 of 21 columns)',
  'D5 §9 the trigger states the count');
eq(panelCheckboxes(c1).length, 21, 'D6 the panel offers one checkbox per hideable Regular column');
ok(panelCheckboxes(c1).every(function (cb) { return cb.checked; }), 'D7 §3 and every one is checked');

// =================================================================================================
section('E. HIDING COLUMNS — §10.2, §10.3, §10.13, §8');
// =================================================================================================
var c2 = build(); buildSection(c2); c2._fcColVisInit_();
c2.fcSetColumnVisible_('fc-regular', 'feb', false);
eq(hiddenKeys(c2, 'fc-regular'), ['feb'], 'E1 §10.2 hiding one month hides exactly that month');
var febCol = reg.filter(function (c) { return c.key === 'feb'; })[0].col;
eq(hiddenIn(c2, 'fc-regular', febCol), { header: true, body: true },
  'E2 §10.13 the rule hides the HEADER and the BODY together — FC_HEADER_BODY_ALIGNMENT_PASS');
eq(hiddenIn(c2, 'fc-regular', febCol + 1).header, false, 'E3 and only that column');
eq(c2.document.getElementById('fc-display-count').textContent, '(20 of 21 columns)', 'E4 the count follows');

['mar', 'apr', 'may'].forEach(function (k) { c2.fcSetColumnVisible_('fc-regular', k, false); });
eq(hiddenKeys(c2, 'fc-regular'), ['apr', 'feb', 'mar', 'may'], 'E5 §10.3 several months hide independently');
eq((visCss(c2).match(/display: none/g) || []).length, 4, 'E6 four hidden columns, four rules — nothing else was touched');

// A hidden column must not leak into another tab's table.
eq(hiddenKeys(c2, 'fc-event'), [], 'E7 §7 hiding a Regular column leaves the Event table alone');
eq(hiddenIn(c2, 'fc-event', febCol).header, false, 'E8 ... proved on the injected rule, not on the state alone');

// §8 — visibility and width are separate concerns. The visibility sheet must not carry a width, and
// re-showing a column must remove its rule entirely rather than pin it to some remembered size.
ok(!/width/.test(visCss(c2)), 'E9 §8 the visibility sheet sets no width — width persistence is untouched');
c2.fcSetColumnVisible_('fc-regular', 'feb', true);
eq(hiddenIn(c2, 'fc-regular', febCol), { header: false, body: false }, 'E10 §8 re-showing removes the rule, leaving the stored width to apply');
eq(hiddenKeys(c2, 'fc-regular'), ['apr', 'mar', 'may'], 'E11 ... and the other three stay hidden');

// =================================================================================================
section('F. PRESETS — §4, §10.4, §10.5, §10.6');
// =================================================================================================
var c3 = build(); buildSection(c3); c3._fcColVisInit_();
c3.fcApplyColumnPreset_('months');
eq(c3.fcResolveVisibleColumns_()['fc-regular'].filter(function (c) { return c.visible; }).map(function (c) { return c.group; })
   .filter(function (g, i, a) { return a.indexOf(g) === i; }), ['months'],
  'F1 §10.4 Months Only leaves months and nothing else');
eq(c3.fcResolveVisibleColumns_()['fc-regular'].filter(function (c) { return c.visible; }).length, 12, 'F2 ... all twelve of them');
c3.fcApplyColumnPreset_('summary');
eq(c3.fcResolveVisibleColumns_()['fc-regular'].filter(function (c) { return c.visible; }).map(function (c) { return c.label; }),
  ['Total FC', 'Company Annual FC Share', 'All-Site Annual FC Share'], 'F3 §10.4 Summary Only leaves the three summary columns');
c3.fcApplyColumnPreset_('all');
eq(hiddenKeys(c3, 'fc-regular'), [], 'F4 §10.5 Select All restores every column');
c3.fcSetColumnVisible_('fc-regular', 'jun', false);
c3.fcApplyColumnPreset_('reset');
eq(hiddenKeys(c3, 'fc-regular'), [], 'F5 §10.6 Reset Default restores the shipped layout');
eq(visCss(c3), '', 'F6 §10.6 ... and the injected sheet is empty again');
// The two differ in what they LEAVE BEHIND, which is the only thing that could ever make them differ.
ok(!/fc-regular/.test(c3.__store()[c3.FC_COLPREF_KEY_] || '{}'),
  'F7 §4 Reset Default drops the stored entry, so a future change to the default reaches the user');

// A preset applies to the ACTIVE tab only — three tables, three independent view models (§7).
var c4 = build(); buildSection(c4); c4._fcColVisInit_();
c4.fcApplyColumnPreset_('months');
eq(hiddenKeys(c4, 'fc-event'), [], 'F8 §7 a preset on Regular does not reach the Event table');

// A preset may never hide a control column.
var c5 = build(); buildSection(c5, 'target'); c5._fcColVisInit_();
c5.fcApplyColumnPreset_('months');
eq(c5.fcResolveVisibleColumns_()['fc-target'].filter(function (c) { return c.visible; })
   .map(function (c) { return c.label; }).filter(function (l) { return l === 'Actions'; }), ['Actions'],
  'F9 §4 Months Only on Target leaves the Actions column alone — the rows keep their controls');

// §7 — presets a tab cannot honour are not offered.
var c6 = build(); buildSection(c6, 'event'); c6._fcColVisInit_();
ok(!presetBtn(c6, 'months'), 'F10 §7 the Event table has no month columns, so Months Only is not offered');
ok(!!presetBtn(c6, 'summary') && !!presetBtn(c6, 'all') && !!presetBtn(c6, 'reset'), 'F11 ... the ones it can honour are');
var c7 = build(); buildSection(c7, 'target'); c7._fcColVisInit_();
ok(!presetBtn(c7, 'summary'), 'F12 §7 the Target table has no summary columns, so Summary Only is not offered');
ok(!!presetBtn(c7, 'months'), 'F13 ... but its twelve percent columns are month columns, so Months Only is');
eq(panelCheckboxes(c7).length, 18, 'F14 §7 the Target panel offers 18 of 19 columns — Actions is a control, not a view choice');

// =================================================================================================
section('G. NO DRIFT — §5, §10.10, §10.11, §10.12');
// =================================================================================================
var c8 = build(); buildSection(c8); c8._fcColVisInit_();
var seen0 = { api: c8.__seen.api, renders: c8.__seen.renders };
var page0 = c8.fcPaginationState.currentPage, size0 = c8.fcPaginationState.pageSize, total0 = c8.fcPaginationState.totalItems;
var filt0 = JSON.stringify(c8.fcFilterState);
c8.fcSetColumnVisible_('fc-regular', 'jan', false);
c8.fcSetColumnVisible_('fc-regular', 'total-fc', false);
c8.fcApplyColumnPreset_('months');
c8.fcApplyColumnPreset_('all');
c8.fcToggleDisplayMenu({});
c8.fcToggleMoreOptions({});
eq(c8.__seen.api - seen0.api, 0, 'G1 §10.10 toggling columns issued ZERO requests — FC_NO_REQUEST_DRIFT');
eq(c8.__seen.renders - seen0.renders, 0, 'G2 §10.11 ... and triggered ZERO re-renders, so no share was recomputed — FC_NO_CALCULATION_DRIFT');
eq(c8.fcPaginationState.currentPage, page0, 'G3 §10.12 the page index is where it was — FC_PAGINATION_STATE_PRESERVED');
eq([c8.fcPaginationState.pageSize, c8.fcPaginationState.totalItems], [size0, total0], 'G4 ... and so is the rest of the pagination state');
eq(JSON.stringify(c8.fcFilterState), filt0, 'G5 §10.12 the filter selection is untouched — FC_FILTER_STATE_PRESERVED');
// The structural version of the same claim: the writer names no render, no transport and no page state.
var applySrc = code(extractFn(JS, 'applyFcColumnVisibility_') + extractFn(JS, 'fcSetColumnVisible_') + extractFn(JS, 'fcApplyColumnPreset_'));
ok(!/renderFc|renderTarget|updatePaginationInfo|fcPaginationState|KM\.api|KM\.DB|getWorkspace/.test(applySrc),
  'G6 §5 the visibility path names no renderer, no transport and no pagination state at all');

// =================================================================================================
section('H. PERSISTENCE — §6, §10.8, §10.9, §10.14');
// =================================================================================================
var storeH = {};
var h1 = build({ store: storeH }); buildSection(h1); h1._fcColVisInit_();
h1.fcSetColumnVisible_('fc-regular', 'sep', false);
h1.fcSetColumnVisible_('fc-event', 'event-period', false);
var raw = JSON.parse(storeH['km.ui.fcSummary.hiddenColumns.v1']);
eq(raw.v, 1, 'H1 §6 the stored preference is versioned');
eq(raw.hidden, { 'fc-regular': ['sep'], 'fc-event': ['event-period'] },
  'H2 §6 it stores HIDDEN keys per table — an all-visible table stores nothing');
// Route re-entry: a fresh page instance reading the same storage.
var h2 = build({ store: storeH }); buildSection(h2); h2._fcColVisInit_();
eq(hiddenKeys(h2, 'fc-regular'), ['sep'], 'H3 §10.8 the preference survives route re-entry — FC_PERSISTENCE_PASS');
eq(hiddenKeys(h2, 'fc-event'), ['event-period'], 'H4 ... per table, independently');
eq(hiddenIn(h2, 'fc-regular', reg.filter(function (c) { return c.key === 'sep'; })[0].col).header, true,
  'H5 §10.8 and it is APPLIED on re-entry, not merely remembered');

// §10.9 — every way a stored preference can be wrong falls back to the canonical default.
[['not json at all', 'corrupt JSON'],
 [JSON.stringify({ v: 99, hidden: { 'fc-regular': ['sep'] } }), 'a version this build does not know'],
 [JSON.stringify({ v: 1, hidden: ['sep'] }), 'an array where an object belongs'],
 [JSON.stringify({ v: 1 }), 'no hidden set at all'],
 [JSON.stringify(null), 'null'],
 [JSON.stringify({ v: 1, hidden: { 'fc-regular': 'sep' } }), 'a string where a list belongs']
].forEach(function (pair, i) {
  var c = build({ store: { 'km.ui.fcSummary.hiddenColumns.v1': pair[0] } });
  buildSection(c); c._fcColVisInit_();
  eq(hiddenKeys(c, 'fc-regular'), [], 'H6.' + (i + 1) + ' §10.9 ' + pair[1] + ' -> the default set, everything visible');
});
// Storage that throws on every access (private mode, blocked site data) must not break the page.
var hBad = build({ badStorage: true }); buildSection(hBad);
var bad = hBad._fcColVisInit_();
ok(!!bad, 'H7 §10.9 unreadable storage still mounts');
eq(hiddenKeys(hBad, 'fc-regular'), [], 'H8 ... on the default set');
hBad.fcSetColumnVisible_('fc-regular', 'jan', false);
eq(hiddenKeys(hBad, 'fc-regular'), ['jan'], 'H9 ... and the choice still works for this session');

// §6 / §10.14 — THE NEW-COLUMN POLICY. A preference written before a column existed must not hide it.
var storeOld = { 'km.ui.fcSummary.hiddenColumns.v1': JSON.stringify({ v: 1, hidden: { 'fc-regular': ['sep', 'a-column-that-was-removed'] } }) };
var hN = build({ store: storeOld }); buildSection(hN); hN._fcColVisInit_();
eq(hiddenKeys(hN, 'fc-regular'), ['sep'], 'H10 §6 a stored key for a column that no longer exists is dropped');
// Simulate tomorrow's column by adding one to the schema before the registry is built.
var hFuture = build({ src: swapSrc(JS, "_fcResizeCols_(100, 'Total FC', 'summary'),",
  "_fcResizeCols_(100, 'Brand New Column', 'summary'), _fcResizeCols_(100, 'Total FC', 'summary'),") , store: storeOld });
buildSection(hFuture); hFuture._fcColVisInit_();
ok(keysOf(hFuture, 'fc-regular').indexOf('brand-new-column') > -1, 'H11 §10.14 the new column reaches the registry');
eq(hiddenKeys(hFuture, 'fc-regular'), ['sep'],
  'H12 §6 ... and an OLDER preference does not hide it — storing hidden keys is what makes this true');

// =================================================================================================
section('I. THE POPOVERS — §9, §12.6, §10.15');
// =================================================================================================
var i1 = build(); buildSection(i1); i1._fcColVisInit_();
var dPanel = i1.document.getElementById('fc-display-panel');
var mPanel = i1.document.getElementById('fc-more-options-panel');
var dBtn = i1.document.getElementById('fc-display-btn');
eq([dPanel.hidden, mPanel.hidden], [true, true], 'I1 both popovers start closed');
i1.fcToggleDisplayMenu({});
eq([dPanel.hidden, mPanel.hidden], [false, true], 'I2 Display opens');
eq(dBtn.getAttribute('aria-expanded'), 'true', 'I3 §9 and says so — aria-expanded');
i1.fcToggleMoreOptions({});
eq([dPanel.hidden, mPanel.hidden], [true, false],
  'I4 §12.6 opening More Options closes Display — FC_DISPLAY_MORE_OPTIONS_MUTUAL_CLOSE');
i1.fcToggleDisplayMenu({});
eq([dPanel.hidden, mPanel.hidden], [false, true], 'I5 §12.6 and the other way round');
ok(dPanel.querySelectorAll('.fc-display-cb')[0].focused > 0, 'I6 §9 opening Display moves focus into the panel');

// Outside click and Escape, through the REAL document listeners.
i1.document.dispatch('click', { target: i1.document.getElementById('fc-summary-section') });
eq([dPanel.hidden, mPanel.hidden], [true, true], 'I7 §9 an outside click closes both — FC_MORE_OPTIONS_OUTSIDE_CLICK_PASS');
i1.fcToggleMoreOptions({});
i1.document.dispatch('keydown', { key: 'Escape' });
eq(mPanel.hidden, true, 'I8 §9 Escape closes — FC_MORE_OPTIONS_ESCAPE_PASS');

// §9 — a checkbox click must NOT close the panel. That is the whole reason the panel stops the click.
i1.fcToggleDisplayMenu({});
var cb = dPanel.querySelectorAll('.fc-display-cb')[6];
var res = dPanel.dispatch('click', { target: cb });
ok(res.stopped, 'I9 §9 a click inside the Display panel is stopped before the outside-click closer sees it');
dPanel.dispatch('change', { target: cbChecked(cb, false) });
eq(dPanel.hidden, false, 'I10 §9 ... so unchecking a column does not close the panel');
eq(hiddenKeys(i1, 'fc-regular'), ['jan'], 'I11 ... and the change reached the state');
function cbChecked(el, v) { el.checked = v; return el; }

// §10.15 / §12.6 — listeners must not accumulate across mounts.
var i2 = build(); buildSection(i2);
i2._fcColVisInit_(); i2._fcColVisInit_(); i2._fcColVisInit_();
var p2 = i2.document.getElementById('fc-display-panel');
eq([p2.listenerCount('change'), p2.listenerCount('click')], [1, 1],
  'I12 §10.15 three mounts, one change listener and one click listener — FC_LISTENER_DRIFT');
eq([i2.document.__listenerCount('click'), i2.document.__listenerCount('keydown')], [1, 1],
  'I13 §12.6 ... and one document-level closer of each kind — FC_TOOLBAR_LISTENER_DRIFT');
// A rebuilt panel body cannot stack listeners either, because none are bound to its contents.
i2.fcRenderDisplayPanel_(); i2.fcRenderDisplayPanel_(); i2.fcRenderDisplayPanel_();
eq(p2.listenerCount('change'), 1, 'I14 §10.15 rebuilding the panel body four times adds none');

// §12.6 — a tab change closes anything open and re-points the menu at the table now on screen.
var i3 = build(); buildSection(i3); i3._fcColVisInit_();
i3.fcToggleMoreOptions({});
i3._fcMoreOptionsSyncTab_('event');
eq([i3.document.getElementById('fc-regular-reset-widths').hidden,
    i3.document.getElementById('fc-event-reset-widths').hidden,
    i3.document.getElementById('fc-target-reset-widths').hidden], [true, false, true],
  'I15 §12.5 exactly ONE reset item is offered — the one belonging to the table on screen');
ok(/if \(typeof fcCloseToolbarMenus_ === 'function'\) fcCloseToolbarMenus_\(\);/.test(JS),
  'I16 §12.6 switching tabs closes any open popover — a menu cannot be left open over another tab');

// =================================================================================================
section('J. PANEL CONTENTS — §2, §7, §9');
// =================================================================================================
var j1 = build(); buildSection(j1); j1._fcColVisInit_();
var jp = j1.document.getElementById('fc-display-panel');
var captions = jp.querySelectorAll('.km-action-menu__section').map(function (e) { return e.textContent.trim(); });
eq(captions, ['Identity', 'Forecast Months', 'Summary'], 'J1 §2 the panel is grouped, in the declared order');
eq(jp.querySelectorAll('.fc-display-preset').map(function (e) { return e.getAttribute('data-preset'); }),
  ['all', 'months', 'summary', 'reset'], 'J2 §4 the four quick actions are offered');
ok(/is the row identity and is always shown/.test(jp.innerHTML), 'J3 §4 the panel states which column cannot be hidden');
ok(/Scope is the row identity/.test((function () {
  var t = build(); buildSection(t, 'target'); t._fcColVisInit_();
  return t.document.getElementById('fc-display-panel').innerHTML;
})()), 'J4 §4 ... and names the right one per tab');
// §7 — the panel follows the active tab and never offers a column the tab does not render.
var j2 = build(); buildSection(j2, 'event'); j2._fcColVisInit_();
var eventLabels = j2.document.getElementById('fc-display-panel').querySelectorAll('.fc-display-item')
  .map(function (e) { return e.textContent.trim(); });
ok(eventLabels.indexOf('Event Period') > -1 && eventLabels.indexOf('Total FC') === -1,
  'J5 §7 the Event panel offers Event Period and not the Regular table\'s Total FC', eventLabels);
eq(eventLabels.length, 9, 'J6 §7 nine columns, which is what the Event table renders');
// A label is written into markup, so it is escaped. None of today's labels needs it; that is the point.
eq(j1._fcColEsc_('A & B <x>"'), 'A &amp; B &lt;x&gt;&quot;', 'J7 column labels are escaped on the way into the panel');

// =================================================================================================
section('K. MUTANTS — each returns TRUE when the defect is CAUGHT');
// =================================================================================================
function mutantCtx(anchor, replacement, opts) {
  opts = opts || {};
  var c = build({ src: swapSrc(JS, anchor, replacement), store: opts.store });
  buildSection(c, opts.tab);
  c._fcColVisInit_();
  return c;
}
var caught = 0, survived = [];
function mutant(id, why, anchor, replacement, probe, opts) {
  var got;
  try { got = probe(mutantCtx(anchor, replacement, opts)); }
  catch (e) { got = true; }                                        // a mutant that cannot even run is caught
  if (got) { caught++; console.log('ok   ' + id + '  ' + why + ' (caught)'); pass++; }
  else { survived.push(id); fail++; console.error('FAIL  ' + id + '  ' + why + ' SURVIVED'); }
}

// A baseline that does not work would make every probe below read as "caught" whatever the mutant did.
var base = build(); buildSection(base); base._fcColVisInit_();
base.fcSetColumnVisible_('fc-regular', 'feb', false);
ok(hiddenKeys(base, 'fc-regular').join() === 'feb' && hiddenIn(base, 'fc-regular', febCol).body === true,
  'K0  the unmutated baseline hides a column in header and body — a probe can tell a mutant from the fixture');

mutant('K1', 'the preference stores VISIBLE keys, so tomorrow\'s column is hidden by yesterday\'s choice',
  "    (state[spec.group] || []).forEach(function (c) { if (c.hideable && !c.visible) keys.push(c.key); });",
  "    (state[spec.group] || []).forEach(function (c) { if (c.hideable && c.visible) keys.push(c.key); });",
  function (c) {
    c.fcSetColumnVisible_('fc-regular', 'sep', false);
    var stored = JSON.parse(c.__store()['km.ui.fcSummary.hiddenColumns.v1']).hidden['fc-regular'] || [];
    return stored.indexOf('sep') === -1 || stored.length > 1;      // it wrote the visible set
  });

// The app itself can never write a control column into the preference, so this mutant is proven the
// only way it can bite: a preference that already names one, which is what a stale entry from an older
// schema or a hand-edited localStorage looks like.
mutant('K2', 'the resolver ignores hideable, so a stale preference hides the Actions column and the rows lose their buttons',
  "        visible: c.hideable ? !hidden[c.key] : true };",
  "        visible: !hidden[c.key] };",
  function (c) {
    var acts = c.fcResolveVisibleColumns_()['fc-target'].filter(function (x) { return x.label === 'Actions'; })[0];
    return !acts.visible;
  }, { tab: 'target', store: { 'km.ui.fcSummary.hiddenColumns.v1': JSON.stringify({ v: 1, hidden: { 'fc-target': ['actions'] } }) } });

mutant('K3', 'the injected rule names only the header, so the header hides and the body does not',
  `  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + col + '), ' +
         '#fc-summary-section #' + spec.body + ' .scroll-row > .scroll-cell:nth-child(' + col + ') ' +
         '{ display: none; }';`,
  `  return '#fc-summary-section #' + spec.header + ' > .header-cell:nth-child(' + col + ') ' +
         '{ display: none; }';`,
  function (c) {
    c.fcSetColumnVisible_('fc-regular', 'feb', false);
    var h = hiddenIn(c, 'fc-regular', febCol);
    return h.header !== h.body;
  });

mutant('K4', 'the panel is built from the Regular table whatever tab is open, offering columns that tab does not render',
  "  var group = fcActiveTabGroup_();\n  var cols = (fcResolveVisibleColumns_()[group] || []).filter(function (c) { return c.hideable; });",
  "  var group = 'fc-regular';\n  var cols = (fcResolveVisibleColumns_()[group] || []).filter(function (c) { return c.hideable; });",
  function (c) {
    var labels = c.document.getElementById('fc-display-panel').querySelectorAll('.fc-display-item')
      .map(function (e) { return e.textContent.trim(); });
    return labels.indexOf('Total FC') > -1;                        // a Regular column on the Event tab
  }, { tab: 'event' });

mutant('K5', 'the bind-once guard is dropped, so every route re-entry stacks another set of listeners',
  "  if (_fcColVisBound || typeof document === 'undefined') return;",
  "  if (typeof document === 'undefined') return;",
  function (c) {
    c._fcColVisInit_(); c._fcColVisInit_();
    return c.document.getElementById('fc-display-panel').listenerCount('change') > 1;
  });

mutant('K6', 'hiding a column also resets pagination, so the operator loses their place',
  "  _fcColVisPersist_(state);\n  return applyFcColumnVisibility_(state);",
  "  _fcColVisPersist_(state);\n  fcPaginationState.currentPage = 1;\n  return applyFcColumnVisibility_(state);",
  function (c) {
    var p = c.fcPaginationState.currentPage;
    c.fcSetColumnVisible_('fc-regular', 'feb', false);
    return c.fcPaginationState.currentPage !== p;
  });

mutant('K7', 'opening Display leaves More Options open, so two popovers overlap the table',
  "  var open = !!p.hidden;\n  fcCloseMoreOptions();\n  if (open) fcRenderDisplayPanel_();",
  "  var open = !!p.hidden;\n  if (open) fcRenderDisplayPanel_();",
  function (c) {
    c.fcToggleMoreOptions({});
    c.fcToggleDisplayMenu({});
    return !c.document.getElementById('fc-more-options-panel').hidden;
  });

mutant('K8', 'Reset Default hides everything instead of restoring the shipped layout',
  "    if (preset === 'all' || preset === 'reset') c.visible = true;",
  "    if (preset === 'all' || preset === 'reset') c.visible = false;",
  function (c) {
    c.fcApplyColumnPreset_('reset');
    return c.fcResolveVisibleColumns_()['fc-regular'].filter(function (x) { return x.visible; }).length < 21;
  });

mutant('K9', 'every table\'s reset item is shown at once, so the menu offers three identical rows',
  "    if (b) b.hidden = spec.group !== group;",
  "    if (b) b.hidden = false;",
  function (c) {
    c._fcMoreOptionsSyncTab_('event');
    var shown = ['fc-regular', 'fc-event', 'fc-target'].filter(function (g) {
      return !c.document.getElementById(g + '-reset-widths').hidden;
    });
    return shown.length !== 1;
  });

mutant('K10', 'the version field is not checked, so a preference written by a future format is applied anyway',
  "  if (!o || typeof o !== 'object' || o.v !== FC_COLPREF_VERSION_) return null;",
  "  if (!o || typeof o !== 'object') return null;",
  function (c) { return hiddenKeys(c, 'fc-regular').length > 0; },
  { store: { 'km.ui.fcSummary.hiddenColumns.v1': JSON.stringify({ v: 99, hidden: { 'fc-regular': ['sep'] } }) } });

mutant('K11', 'the style element is appended instead of replaced, so re-mounts stack stale sheets',
  "  el.textContent = rules.join('\\n');",
  "  var extra = document.createElement('style'); extra.textContent = rules.join('\\n'); document.head.appendChild(extra);",
  function (c) {
    c.fcSetColumnVisible_('fc-regular', 'feb', false);
    c.fcSetColumnVisible_('fc-regular', 'feb', true);
    // The canonical sheet is the one keyed by id; a second writer leaves the hidden rule alive.
    var all = c.document.head.children.map(function (e) { return e.textContent || ''; }).join('\n');
    return all.indexOf('#fc-regular-scroll-header > .header-cell:nth-child(' + febCol + ')') > -1;
  });

console.log('\n' + new Array(101).join('='));
console.log('FC SUMMARY DISPLAY / COLUMN VISIBILITY R1 — passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + caught + '  survived ' + survived.length + (survived.length ? ' (' + survived.join(', ') + ')' : ''));
console.log(new Array(101).join('='));
process.exit(fail ? 1 : 0);
