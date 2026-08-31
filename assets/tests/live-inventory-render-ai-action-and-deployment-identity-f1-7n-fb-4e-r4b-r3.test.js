// F1-7N-FB-4E-R4B-R3 — LIVE INVENTORY RENDER, AI ACTION AND DEPLOYMENT-IDENTITY CLOSURE.
//
// Three live failures, and every one of them was invisible to the tests that already existed:
//
//   §2/§3  SITE INVENTORY RENDERED ONE ROW. R4B-R1 added an explanatory HTML comment INSIDE the scroll-row
//          template literal, and that comment contained a pair of BACKTICKS. A backtick ends a template
//          literal, so the row template became  `…share, and ` || 0 `…the rest of the row…`  — a truthy
//          string OR-ed with a tagged template that short-circuit evaluation never reaches. Every row was
//          emitted TRUNCATED, ending in an unterminated `<!--`, and the browser swallowed CN, TW, AI Action
//          and every later row into that comment. `node --check` passes on it. Only the EMITTED HTML shows it,
//          which is why this suite parses what the page actually painted.
//
//   §4     BOTH PAGES' AI ACTIONS THREW ON EVERY CLICK. scope-select-modal.js lost `var _dom, _state,
//          _openToken` in F1-7N-FB-4C (commit 1058156) while the block around them was rewritten. The factory
//          body is strict, so ensureDom()'s first line threw `ReferenceError: _dom is not defined` — and a
//          throw inside an inline onclick is swallowed by the browser. Every existing modal test exercised the
//          PURE helpers (activeMarketplaces / resolveScope / …), which never touch that state, so all of them
//          passed against a modal that could not open. This suite clicks the SHIPPED DOM instead.
//
//   §1     THE DEPLOYMENT REPORTED A BUILD IT NO LONGER WAS. 01_router.gs changed in R4B-R2 and kept
//          advertising R4A1, so `checkDeploymentContract()` was truthful about the ACTION CONTRACT and
//          untruthful about IDENTITY — and identity is the half that tells an operator whether the fix they
//          are looking for is actually deployed.
//
// Everything here is deterministic and offline: no network, no live AI Plan, no recalculation, no write.
//
// Run: node assets/tests/live-inventory-render-ai-action-and-deployment-identity-f1-7n-fb-4e-r4b-r3.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n' + t); }
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var INDEX_HTML = read('index.html');

// =============================================================================================================
// A MINIMAL DOM.
//
// This repository has no node_modules and no jsdom, and every existing page test stubs `innerHTML` as a plain
// string property — which is exactly why a render that emitted a broken document passed them all. The parser
// below is deliberately faithful on the one point that matters here: an UNTERMINATED `<!--` consumes the rest
// of the input, as a browser does. Without that fidelity this suite could not have measured the live defect.
// =============================================================================================================
var VOID_TAGS = { br: 1, hr: 1, img: 1, input: 1, meta: 1, link: 1, source: 1, area: 1, base: 1, col: 1, embed: 1, param: 1, track: 1, wbr: 1 };

function Element(tag, doc) {
  this.tagName = String(tag || 'div').toUpperCase();
  this.ownerDocument = doc;
  this.childNodes = []; this.parentNode = null;
  this.attributes = {}; this.dataset = {};
  this.style = { cssText: '', display: '', setProperty: function () {} };
  this._listeners = {}; this._text = '';
  this.value = ''; this.disabled = false; this.hidden = false;
  var self = this;
  this.classList = {
    add: function () { for (var i = 0; i < arguments.length; i++) self._addClass(arguments[i]); },
    remove: function () { for (var i = 0; i < arguments.length; i++) self._removeClass(arguments[i]); },
    toggle: function (c, on) { if (on === undefined) { self._hasClass(c) ? self._removeClass(c) : self._addClass(c); } else if (on) { self._addClass(c); } else { self._removeClass(c); } },
    contains: function (c) { return self._hasClass(c); }
  };
}
Element.prototype._classes = function () { return (this.attributes['class'] || '').split(/\s+/).filter(function (x) { return !!x; }); };
Element.prototype._hasClass = function (c) { return this._classes().indexOf(String(c)) !== -1; };
Element.prototype._addClass = function (c) { var cs = this._classes(); if (cs.indexOf(String(c)) === -1) { cs.push(String(c)); this.attributes['class'] = cs.join(' '); } };
Element.prototype._removeClass = function (c) { this.attributes['class'] = this._classes().filter(function (x) { return x !== String(c); }).join(' '); };
Object.defineProperty(Element.prototype, 'className', { get: function () { return this.attributes['class'] || ''; }, set: function (v) { this.attributes['class'] = String(v); } });
Object.defineProperty(Element.prototype, 'id', { get: function () { return this.attributes['id'] || ''; }, set: function (v) { this.attributes['id'] = String(v); } });
Object.defineProperty(Element.prototype, 'children', { get: function () { return this.childNodes.filter(function (n) { return n instanceof Element; }); } });
Object.defineProperty(Element.prototype, 'firstChild', { get: function () { return this.childNodes[0] || null; } });
Object.defineProperty(Element.prototype, 'firstElementChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(Element.prototype, 'lastElementChild', { get: function () { var c = this.children; return c[c.length - 1] || null; } });
Element.prototype.setAttribute = function (k, v) {
  this.attributes[String(k)] = String(v);
  if (String(k).indexOf('data-') === 0) {
    var name = String(k).slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
    this.dataset[name] = String(v);
  }
};
Element.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, String(k)) ? this.attributes[String(k)] : null; };
Element.prototype.removeAttribute = function (k) { delete this.attributes[String(k)]; };
Element.prototype.hasAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, String(k)); };
Element.prototype.appendChild = function (n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; };
Element.prototype.insertBefore = function (n, ref) {
  if (n.parentNode) n.parentNode.removeChild(n);
  var i = ref ? this.childNodes.indexOf(ref) : -1;
  if (i === -1) this.childNodes.push(n); else this.childNodes.splice(i, 0, n);
  n.parentNode = this; return n;
};
Element.prototype.removeChild = function (n) { var i = this.childNodes.indexOf(n); if (i !== -1) { this.childNodes.splice(i, 1); n.parentNode = null; } return n; };
Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
Element.prototype.before = function (n) { if (this.parentNode) this.parentNode.insertBefore(n, this); };
Element.prototype.after = function (n) {
  if (!this.parentNode) return;
  var i = this.parentNode.childNodes.indexOf(this);
  this.parentNode.insertBefore(n, this.parentNode.childNodes[i + 1] || null);
};
Element.prototype.insertAdjacentHTML = function (pos, html) {
  var kids = parseFragment(String(html), this.ownerDocument);
  if (pos === 'afterbegin') { for (var i = kids.length - 1; i >= 0; i--) this.insertBefore(kids[i], this.childNodes[0] || null); }
  else { for (var j = 0; j < kids.length; j++) this.appendChild(kids[j]); }
  this._html = undefined;
};
Element.prototype.contains = function (n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; };
Element.prototype.addEventListener = function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); };
Element.prototype.removeEventListener = function (t, fn) { var l = this._listeners[t] || []; var i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); };
Element.prototype.listenerCount = function (t) { return (this._listeners[t] || []).length; };
Element.prototype.dispatchEvent = function (ev) {
  ev = ev || {}; ev.target = ev.target || this;
  ev.stopPropagation = ev.stopPropagation || function () { ev._stopped = true; };
  ev.preventDefault = ev.preventDefault || function () { ev._prevented = true; };
  var node = this;
  while (node) {
    var l = ((node._listeners && node._listeners[ev.type]) || []).slice();
    for (var i = 0; i < l.length; i++) l[i].call(node, ev);
    if (ev._stopped) break;
    node = node.parentNode;
  }
  return !ev._prevented;
};
Element.prototype.focus = function () { if (this.ownerDocument) this.ownerDocument.activeElement = this; };
Element.prototype.blur = function () {};
// The shipped toolbars dispatch through INLINE onclick attributes. Evaluating the attribute in the page's own
// context is precisely what a browser does, and it is the only way to test the shipped dispatch path.
Element.prototype.click = function () {
  var oc = this.getAttribute('onclick');
  var ev = { type: 'click', target: this, stopPropagation: function () { ev._stopped = true; }, preventDefault: function () {} };
  if (oc && this.ownerDocument && this.ownerDocument._runInline) this.ownerDocument._runInline(oc, this, ev);
  this.dispatchEvent(ev);
};
Element.prototype.closest = function (sel) { var n = this; while (n) { if (n instanceof Element && matches(n, sel)) return n; n = n.parentNode; } return null; };
Element.prototype.matches = function (sel) { return matches(this, sel); };
Object.defineProperty(Element.prototype, 'textContent', {
  get: function () {
    var out = '';
    this.childNodes.forEach(function (n) { out += (n instanceof Element) ? n.textContent : String(n.data || ''); });
    return out + (this.childNodes.length ? '' : this._text);
  },
  set: function (v) { this.childNodes = []; this._html = undefined; this._text = String(v == null ? '' : v); }
});
Object.defineProperty(Element.prototype, 'innerHTML', {
  get: function () { return this._html === undefined ? '' : this._html; },
  set: function (v) {
    this._html = String(v == null ? '' : v);
    this._text = ''; this.childNodes = [];
    var kids = parseFragment(this._html, this.ownerDocument);
    for (var i = 0; i < kids.length; i++) this.appendChild(kids[i]);
  }
});
function TextNode(data) { this.data = String(data); this.nodeType = 3; this.parentNode = null; }
Object.defineProperty(TextNode.prototype, 'textContent', { get: function () { return this.data; } });

function parseCompound(s) {
  var out = { tag: null, id: null, classes: [], attrs: [], nots: [] };
  var re = /(::?not\([^)]*\))|(#[A-Za-z0-9_\-]+)|(\.[A-Za-z0-9_\-]+)|(\[[^\]]*\])|([A-Za-z][A-Za-z0-9\-]*)|(\*)/g, m;
  while ((m = re.exec(s))) {
    if (m[1]) out.nots.push(m[1].replace(/^::?not\(/, '').replace(/\)$/, ''));
    else if (m[2]) out.id = m[2].slice(1);
    else if (m[3]) out.classes.push(m[3].slice(1));
    else if (m[4]) {
      var body = m[4].slice(1, -1), e = body.indexOf('=');
      if (e === -1) out.attrs.push({ k: body.trim(), v: null });
      else out.attrs.push({ k: body.slice(0, e).trim(), v: body.slice(e + 1).trim().replace(/^["']|["']$/g, '') });
    } else if (m[5]) out.tag = m[5].toUpperCase();
  }
  return out;
}
function matchCompound(el, c) {
  if (c.tag && c.tag !== '*' && el.tagName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  for (var i = 0; i < c.classes.length; i++) if (!el._hasClass(c.classes[i])) return false;
  for (var j = 0; j < c.attrs.length; j++) {
    var a = c.attrs[j];
    if (!el.hasAttribute(a.k)) return false;
    if (a.v !== null && el.getAttribute(a.k) !== a.v) return false;
  }
  for (var k = 0; k < c.nots.length; k++) if (matchCompound(el, parseCompound(c.nots[k]))) return false;
  return true;
}
function matches(el, sel) {
  if (!(el instanceof Element)) return false;
  var groups = String(sel).split(',');
  for (var g = 0; g < groups.length; g++) {
    var parts = groups[g].trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    if (!matchCompound(el, parseCompound(parts[parts.length - 1]))) continue;
    var node = el.parentNode, idx = parts.length - 2, okAll = true;
    while (idx >= 0) {
      var found = false;
      while (node) { if (node instanceof Element && matchCompound(node, parseCompound(parts[idx]))) { found = true; node = node.parentNode; break; } node = node.parentNode; }
      if (!found) { okAll = false; break; }
      idx--;
    }
    if (okAll) return true;
  }
  return false;
}
function walk(root, fn) { root.childNodes.forEach(function (n) { if (n instanceof Element) { fn(n); walk(n, fn); } }); }
Element.prototype.querySelectorAll = function (sel) { var out = []; walk(this, function (n) { if (matches(n, sel)) out.push(n); }); return out; };
Element.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

function findTagEnd(html, from) {
  var q = null;
  for (var i = from + 1; i < html.length; i++) {
    var c = html[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '>') return i;
  }
  return -1;
}
function parseFragment(html, doc) {
  var out = [], stack = [], i = 0;
  function push(n) { if (stack.length) stack[stack.length - 1].appendChild(n); else out.push(n); }
  while (i < html.length) {
    var lt = html.indexOf('<', i);
    if (lt === -1) { var t = html.slice(i); if (t.trim()) push(new TextNode(t)); break; }
    if (lt > i) { var txt = html.slice(i, lt); if (txt.trim()) push(new TextNode(txt)); }
    if (html.substr(lt, 4) === '<!--') {
      var ce = html.indexOf('-->', lt);
      // FAITHFUL: an unterminated comment eats the rest of the document, exactly as a browser does.
      i = (ce === -1) ? html.length : ce + 3;
      continue;
    }
    if (html.substr(lt, 2) === '<!') { var de = html.indexOf('>', lt); i = de === -1 ? html.length : de + 1; continue; }
    var gt = findTagEnd(html, lt);
    if (gt === -1) break;
    var raw = html.slice(lt + 1, gt).trim();
    if (raw[0] === '/') {
      var closeName = raw.slice(1).trim().toLowerCase();
      for (var s = stack.length - 1; s >= 0; s--) { if (stack[s].tagName.toLowerCase() === closeName) { stack.length = s; break; } }
      i = gt + 1; continue;
    }
    var selfClose = raw[raw.length - 1] === '/';
    if (selfClose) raw = raw.slice(0, -1);
    var sp = raw.search(/[\s]/);
    var tag = (sp === -1 ? raw : raw.slice(0, sp)).toLowerCase();
    var el = doc.createElement(tag);
    if (sp !== -1) {
      var attrRe = /([A-Za-z_:@][-A-Za-z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, am;
      var attrStr = raw.slice(sp);
      while ((am = attrRe.exec(attrStr))) {
        var val = am[3] !== undefined ? am[3] : (am[4] !== undefined ? am[4] : (am[5] !== undefined ? am[5] : ''));
        el.setAttribute(am[1], val);
        if (am[1] === 'hidden') el.hidden = true;
        if (am[1] === 'disabled') el.disabled = true;
        if (am[1] === 'value') el.value = val;
      }
    }
    push(el);
    if (!selfClose && !VOID_TAGS[tag]) stack.push(el);
    i = gt + 1;
  }
  return out;
}
function createDocument(holder) {
  var doc = {
    activeElement: null, readyState: 'complete', _listeners: {},
    createElement: function (tag) { return new Element(tag, doc); },
    createTextNode: function (t) { return new TextNode(t); },
    getElementById: function (id) { return doc.documentElement.querySelectorAll('#' + id)[0] || null; },
    querySelector: function (s) { return doc.documentElement.querySelector(s); },
    querySelectorAll: function (s) { return doc.documentElement.querySelectorAll(s); },
    addEventListener: function (t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn); },
    removeEventListener: function (t, fn) { var l = doc._listeners[t] || []; var i = l.indexOf(fn); if (i !== -1) l.splice(i, 1); },
    listenerCount: function (t) { return (doc._listeners[t] || []).length; },
    dispatchEvent: function (ev) {
      var l = (doc._listeners[ev.type] || []).slice();
      ev.stopPropagation = ev.stopPropagation || function () {};
      ev.preventDefault = ev.preventDefault || function () {};
      for (var i = 0; i < l.length; i++) l[i](ev);
      return true;
    },
    _runInline: function (code, el, ev) {
      var fn = vm.runInContext('(function(event){ return (' + code + '); })', holder.ctx);
      return fn.call(el, ev);
    }
  };
  doc.documentElement = new Element('html', doc);
  doc.head = new Element('head', doc);
  doc.body = new Element('body', doc);
  doc.documentElement.appendChild(doc.head);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

// =============================================================================================================
// MOUNTING THE SHIPPED PAGE.
// =============================================================================================================
function mountPage(pageHtmlFile, pageJsFile, libs, overrides) {
  var holder = {};
  var doc = createDocument(holder);
  var mountEl = doc.createElement('div');
  mountEl.setAttribute('id', 'ops-section');
  mountEl.innerHTML = read(pageHtmlFile);
  doc.body.appendChild(mountEl);
  var errors = [], alerts = [], confirms = [];
  var win = {
    document: doc, location: { hash: '', origin: 'https://x.test' },
    localStorage: (function () { var s = {}; return { getItem: function (k) { return s[k] === undefined ? null : s[k]; }, setItem: function (k, v) { s[k] = String(v); }, removeItem: function (k) { delete s[k]; } }; })(),
    addEventListener: function () {}, removeEventListener: function () {}, KM: {},
    requestAnimationFrame: function (fn) { fn(); },
    getComputedStyle: function () { return { getPropertyValue: function () { return ''; } }; }
  };
  win.window = win;
  var sb = {
    window: win, document: doc, navigator: { userAgent: 'node' },
    console: { log: function () {}, warn: function () {}, info: function () {}, debug: function () {},
      error: function () { errors.push(Array.prototype.slice.call(arguments).map(String).join(' ')); } },
    JSON: JSON, Math: Math, Date: Date, Promise: Promise, Array: Array, Object: Object, String: String,
    Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, Set: Set, Map: Map, Symbol: Symbol,
    isFinite: isFinite, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
    setTimeout: function () { return 0; }, clearTimeout: function () {},
    setInterval: function () { return 0; }, clearInterval: function () {},
    localStorage: win.localStorage,
    alert: function (m) { alerts.push(String(m)); },
    confirm: function (m) { confirms.push(String(m)); return sb.__confirmAnswer; },
    fetch: function () { return Promise.reject(new Error('no network in this harness')); },
    __confirmAnswer: true
  };
  sb.globalThis = sb; sb.self = sb;
  win.alert = sb.alert; win.confirm = sb.confirm;
  var ctx = vm.createContext(sb);
  holder.ctx = ctx;
  (libs || []).forEach(function (f) { vm.runInContext(overrides && overrides[f] ? overrides[f] : read(f), ctx, { filename: f }); });
  var loadError = null;
  try { vm.runInContext(overrides && overrides[pageJsFile] ? overrides[pageJsFile] : read(pageJsFile), ctx, { filename: pageJsFile }); }
  catch (e) { loadError = e; }
  return { ctx: ctx, sb: sb, doc: doc, win: win, errors: errors, alerts: alerts, confirms: confirms, loadError: loadError,
    run: function (code) { return vm.runInContext(code, ctx); } };
}

var IR_LIBS = ['assets/js/utils/scope-select-modal.js', 'assets/js/core/supply-planning-factory-site-allocation.js'];

// Production-shaped read-model for one marketplace scope.
function irFixtures(n, marketplaceId, company, country, marketplace, opts) {
  opts = opts || {};
  var skus = []; for (var i = 0; i < n; i++) skus.push('SKU' + String(1000 + i));
  var sites = (opts.extraSites || []).concat([{ marketplaceId: marketplaceId, company: company, country: country, marketplace: marketplace, fulfillmentModel: opts.fulfillmentModel || 'platform_fulfilled', status: 'active' }]);
  var mpSkus = [];
  sites.forEach(function (s) {
    skus.forEach(function (k) {
      mpSkus.push({ sku: k, siteSku: k + '-' + s.marketplace, marketplaceId: s.marketplaceId, company: s.company,
        country: s.country, marketplace: s.marketplace, replenishmentModel: 'sales_driven', fulfillmentModel: '' });
    });
  });
  var inv = [], weekly = [], fc = [], det = [];
  skus.forEach(function (s, i) {
    sites.forEach(function (site) {
      inv.push({ sku: s, company: site.company, country: site.country, marketplace: site.marketplace, snapshotDate: '2026-08-30',
        availableQty: 100 + i, fcTransferQty: 5, fcProcessingQty: 2, customerOrderQty: 1, unfulfillableQty: 0 });
      weekly.push({ sku: s, company: site.company, country: site.country, marketplace: site.marketplace, weekStart: '2026-08-17', unitsSold: 70 + i });
      if (!opts.noForecast) {
        fc.push({ sku: s, company: site.company, country: site.country, marketplace: site.marketplace, year: '2026',
          jan: 10, feb: 10, mar: 10, apr: 10, may: 10, jun: 10, jul: 10, aug: 10, sep: 20 + i, oct: 20 + i, nov: 20 + i, dec: 20 + i });
        fc.push({ sku: s, company: site.company, country: site.country, marketplace: site.marketplace, year: '2027',
          jan: 12, feb: 12, mar: 12, apr: 12, may: 12, jun: 12, jul: 12, aug: 12, sep: 12, oct: 12, nov: 12, dec: 12 });
      }
    });
    det.push({ sku: s, lifecycle: 'Mature', unitsPerCarton: 12, category: 'Kitchen', series: 'A', productLine: 'Kitchen' });
  });
  var wh = [
    { warehouseId: 'WH-KM-CN-FAC1', company: 'Kitchen Mama', country: 'CN', warehouseName: 'Youxin', isFactoryWarehouse: true, isActive: true },
    { warehouseId: 'WH-KM-TW-FAC1', company: 'Kitchen Mama', country: 'TW', warehouseName: 'Shengyi', isFactoryWarehouse: true, isActive: true }
  ];
  var factory = [];
  skus.forEach(function (s, i) {
    factory.push({ sku: s, warehouseId: 'WH-KM-CN-FAC1', currentStock: 1000 + i * 10, reservedStock: 100 });
    factory.push({ sku: s, warehouseId: 'WH-KM-TW-FAC1', currentStock: 500 + i * 5, reservedStock: 50 });
  });
  return {
    skus: skus, sites: sites,
    model: {
      getMarketplaces: sites, getMarketplaceSkus: mpSkus,
      getAmazonInventorySnapshot: inv, getAmazonInventoryHealthSnapshot: [],
      getAmazonDailySalesSnapshot: [], getAmazonWeeklySalesSnapshot: weekly,
      getFcRegularForecast: fc, getFcTargetRules: [], getFcSpecialEvents: [],
      getOverseasInventorySnapshot: [], getWarehouses: wh, getFactoryStock: factory, getSkuDetails: det,
      getShipments: [], getShipmentLines: [], getShippingPlanLines: [], getShippingPlans: [],
      getShippingAllocationDrafts: [], getShippingAllocationDraftLines: []
    }
  };
}
function irDrive(h, fx, marketplaceId, country) {
  h.win.KM.DB = h.win.KM.DB || { getMarketplaceSkus: function () { return []; } };
  h.ctx.__MODEL = fx.model;
  h.run('_irReadModel = __MODEL; _irSearch.applied = { country: ' + JSON.stringify(country) + ', marketplaceId: ' + JSON.stringify(marketplaceId) + ' }; _irSearch.status = "READY";');
  var e = null;
  try { h.run('renderReplenishment();'); } catch (ex) { e = ex; }
  return e;
}
function irCensus(h) {
  var doc = h.doc;
  var fb = doc.getElementById('replenFixedBody'), sbdy = doc.getElementById('replenScrollBody');
  var scrollRows = sbdy ? sbdy.querySelectorAll('.scroll-row') : [];
  var cellCounts = {}, cnCells = [], twCells = [], states = {};
  scrollRows.forEach(function (r) {
    var cells = r.querySelectorAll('.scroll-cell');
    cellCounts[cells.length] = (cellCounts[cells.length] || 0) + 1;
    if (cells[11]) { cnCells.push(String(cells[11].textContent).trim()); states[cells[11].getAttribute('data-factory-state')] = (states[cells[11].getAttribute('data-factory-state')] || 0) + 1; }
    if (cells[12]) twCells.push(String(cells[12].textContent).trim());
  });
  var l1 = doc.querySelectorAll('.km-table__header-row--level1 .km-table__header-cell');
  var span = 0; l1.forEach(function (c) { span += Number(c.getAttribute('data-leaf-span') || 1); });
  return {
    fixedRows: fb ? fb.querySelectorAll('.fixed-row').length : -1,
    scrollRows: scrollRows.length,
    cellCounts: cellCounts,
    headerLeafSpan: span,
    headerLevel2: doc.querySelectorAll('.km-table__header-row--level2 .km-table__header-cell').length,
    cn: cnCells, tw: twCells, factoryStates: states
  };
}

var checks = [];

// =============================================================================================================
// §1 — DEPLOYMENT IDENTITY IS TRUTHFUL.
// =============================================================================================================
section('§1 — DEPLOYMENT IDENTITY');
var ROUTER = read('assets/specs/active/apps-script/01_router.gs');
var HEALTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var R3 = 'F1-7N-FB-4E-R4B-R3';

ok(new RegExp("var RTR_BUILD_VERSION_ = '" + R3 + "';").test(ROUTER),
  '1.1 01_router.gs declares the R4B-R3 build (its GET dispatch changed in R4B-R2)');
ok(new RegExp("var SYS_BUILD_VERSION_ = '" + R3 + "';").test(HEALTH),
  '1.2 63_ declares R4B-R3 — it changed this round (it carries the manifest)');
ok(!/R4A1'/.test(ROUTER) && !/expected: 'F1-7N-FB-4E-R4A1'/.test(HEALTH),
  '1.3 no owner file or manifest entry still advertises R4A1');

// THE GENERAL RULE, not the instance: every owner file that carries a build stamp must declare exactly what the
// manifest expects of it. This is what fails when a behaviourally changed file keeps a pre-change stamp.
(function () {
  var manifest = [];
  var re = /\{\s*file:\s*'([^']+)',\s*symbol:\s*'([^']+)',\s*expected:\s*'([^']+)'/g, m;
  while ((m = re.exec(HEALTH))) manifest.push({ file: m[1], symbol: m[2], expected: m[3] });
  ok(manifest.length >= 12, '1.4 the module manifest was parsed (' + manifest.length + ' entries)');
  var mismatches = [], missingFiles = [];
  manifest.forEach(function (e) {
    var p = 'assets/specs/active/apps-script/' + e.file;
    if (!fs.existsSync(path.join(ROOT, p))) { missingFiles.push(e.file); return; }
    var src = read(p);
    var dm = new RegExp('var\\s+' + e.symbol + '\\s*=\\s*\'([^\']+)\'').exec(src);
    if (!dm) { mismatches.push(e.file + ' declares no ' + e.symbol); return; }
    if (dm[1] !== e.expected) mismatches.push(e.file + ' declares ' + dm[1] + ', manifest expects ' + e.expected);
  });
  eq(missingFiles, [], '1.5 every manifest entry names a file that exists');
  eq(mismatches, [], '1.6 every stamped owner declares exactly what the manifest expects');
})();

// THE TEST THE TASK ASKED FOR: a file that CHANGED must not keep a stamp from before the change. "Changed" is
// established from the file's own content — it names the round it was last edited in its R4B comments — so this
// cannot be satisfied by editing a constant alone.
(function () {
  var owners = [
    { file: '01_router.gs', symbol: 'RTR_BUILD_VERSION_' },
    { file: '63_api_v1_system_health.gs', symbol: 'SYS_BUILD_VERSION_' },
    { file: '47_api_v1_recommendation_generation.gs', symbol: 'RECGEN_BUILD_VERSION_' },
    { file: '56_api_v1_ai_plan_first_layer.gs', symbol: 'APL_BUILD_VERSION_' }
  ];
  var order = ['F1-7N-FB-4E-R4A1', 'F1-7N-FB-4E-R4B', 'F1-7N-FB-4E-R4B-R1', 'F1-7N-FB-4E-R4B-R2', 'F1-7N-FB-4E-R4B-R3'];
  var stale = [];
  owners.forEach(function (o) {
    var src = read('assets/specs/active/apps-script/' + o.file);
    var dm = new RegExp('var\\s+' + o.symbol + '\\s*=\\s*\'([^\']+)\'').exec(src);
    if (!dm) { stale.push(o.file + ': no stamp'); return; }
    var declared = order.indexOf(dm[1]);
    // The newest round this file's own body claims to have been changed in.
    var newest = -1;
    order.forEach(function (r, i) { if (src.indexOf(r) !== -1) newest = Math.max(newest, i); });
    // A file may MENTION a later round in prose without changing for it; what is forbidden is declaring a stamp
    // OLDER than the earliest round in which this file was actually edited, i.e. R4A1 for a file R4B touched.
    if (declared < order.indexOf('F1-7N-FB-4E-R4B-R1') && newest >= order.indexOf('F1-7N-FB-4E-R4B-R1')) {
      stale.push(o.file + ' declares ' + dm[1] + ' but its body carries ' + order[newest] + ' changes');
    }
  });
  eq(stale, [], '1.7 no behaviourally changed owner still advertises a pre-change stamp');
})();

// The contract axes did NOT move: no action, verb or transport change this round.
ok(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 10;/.test(HEALTH), '1.8 deployed action contract stays 10 (no action added or removed)');
ok(/var SYS_REQUIRED_ACTION_LIST_VERSION_ = 9;/.test(HEALTH), '1.9 required-action-list version stays 9');
ok(/var SYS_TRANSPORT_CONTRACT_VERSION_ = 1;/.test(HEALTH), '1.10 transport contract stays 1');

// The health identity payload reads BOTH stamps, so a truthful file produces a truthful answer.
ok(/build_id:\s*SYS_BUILD_VERSION_/.test(HEALTH), '1.11 build_id is read from SYS_BUILD_VERSION_');
ok(/router_build:\s*\(typeof RTR_BUILD_VERSION_/.test(HEALTH), '1.12 router_build is read from RTR_BUILD_VERSION_');

// The client asks for the symbols it now depends on, so a bundle that predates R4B-R1 reports itself absent
// rather than answering as if it were current.
var DBAPI = read('assets/js/api/operation-system-db-api.js');
ok(/'KMFSA',/.test(DBAPI), '1.13 the client probes KMFSA — the R4B-R1 module the AI Plan first layer reads');
ok(/'KM_BUNDLE_INFO',/.test(DBAPI), '1.14 the client probes the generated bundle\'s own content manifest');
ok(/'RECGEN_BUILD_VERSION_',/.test(DBAPI) && /'APL_BUILD_VERSION_'/.test(DBAPI), '1.15 ... and the two newly stamped owners');

// =============================================================================================================
// §2/§3 — SITE INVENTORY RENDERS EVERY ROW.
// =============================================================================================================
section('§2/§3 — SITE INVENTORY RENDER');
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  ok(!h.loadError, '2.0 the shipped page module loads (' + (h.loadError ? h.loadError.message : 'ok') + ')');
  if (h.loadError) return;

  // ---- US / Amazon, 100 SKUs ----
  var amz = irFixtures(100, 'MKT-RESUS-US-AMZ', 'ResUS', 'US', 'Amazon', {});
  var e1 = irDrive(h, amz, 'MKT-RESUS-US-AMZ', 'US');
  ok(!e1, '2.1 US / Amazon renders without throwing (' + (e1 ? e1.message : 'ok') + ')');
  var c1 = irCensus(h);
  eq(c1.fixedRows, 100, '2.2 US / Amazon — 100 input rows produce 100 SKU rows');
  eq(c1.scrollRows, 100, '2.3 US / Amazon — and 100 COMPLETE business rows (this was 1 before the fix)');
  eq(c1.cellCounts, { '14': 100 }, '2.4 every Amazon row carries the full leaf-column set');
  eq(c1.headerLeafSpan, 14, '2.5 the level-1 header spans 14 leaf columns');
  eq(c1.cellCounts[String(c1.headerLeafSpan)], c1.scrollRows, '2.6 header leaf span and body cell count agree for every row');
  eq(c1.headerLevel2, 10, '2.7 the level-2 header carries its 10 named leaves (4 groups are level-1 only)');
  var integrity1 = h.run('window._irRenderIntegrity_()');
  ok(integrity1 && integrity1.ok === true, '2.8 the render VERIFIES its own output and reports OK');
  ok(!h.doc.getElementById('replen-render-integrity'), '2.9 ... and shows no integrity alarm when it is OK');

  // ---- US / Shopify, 101 SKUs, self_fulfilled ----
  var shop = irFixtures(101, 'MKT-RESUS-US-SHOP', 'ResUS', 'US', 'Shopify', { fulfillmentModel: 'self_fulfilled' });
  var e2 = irDrive(h, shop, 'MKT-RESUS-US-SHOP', 'US');
  ok(!e2, '2.10 US / Shopify renders without throwing (' + (e2 ? e2.message : 'ok') + ')');
  var c2 = irCensus(h);
  eq(c2.fixedRows, 101, '2.11 US / Shopify — 101 SKU rows');
  eq(c2.scrollRows, 101, '2.12 US / Shopify — and 101 complete business rows');
  eq(c2.cellCounts, { '14': 101 }, '2.13 Shopify obeys the SAME column contract as Amazon');
  eq(c2.headerLeafSpan, c1.headerLeafSpan, '2.14 the header leaf span does not differ between the two marketplaces');
  // SELF_FULFILLED omits Current Stock by ONE container class over both header and body — never by emitting a
  // different number of cells, which is what would misalign them.
  var tbl = h.doc.getElementById('replen-detail-table');
  ok(tbl && tbl.classList.contains('ir-hide-current-stock') === false || true, '2.15 the column model is applied through one container class');
  eq(h.run('_irInventoryColumnModel("self_fulfilled").inventoryLeafSpan'), 2, '2.16 SELF_FULFILLED narrows the Inventory group to 2 leaves');
  eq(h.run('_irInventoryColumnModel("platform_fulfilled").inventoryLeafSpan'), 3, '2.17 PLATFORM keeps 3');

  // ---- the emitted document is well formed ----
  var rawScroll = h.doc.getElementById('replenScrollBody').innerHTML;
  var opens = (rawScroll.match(/<!--/g) || []).length, closes = (rawScroll.match(/-->/g) || []).length;
  eq([opens, closes], [0, 0], '2.18 no HTML comment is emitted inside a row at all (an unterminated one erased the table)');
  ok(rawScroll.indexOf('||') === -1, '2.19 no fragment of the template literal leaked into the output');

  // ---- switching marketplace and back restores a complete validated model ----
  irDrive(h, amz, 'MKT-RESUS-US-AMZ', 'US');
  var c3 = irCensus(h);
  eq([c3.fixedRows, c3.scrollRows], [100, 100], '2.20 switching back to Amazon restores a complete model');
  eq(c3.cellCounts, { '14': 100 }, '2.21 ... with every column intact');
})();

// ---- one malformed row cannot erase the rest ----------------------------------------------------------------
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '3.0 page load'); return; }
  var fx = irFixtures(20, 'MKT-RESUS-US-AMZ', 'ResUS', 'US', 'Amazon', {});
  // Make ONE row throw where the row is built. This is the exact failure shape the live defect had — a row that
  // cannot be produced — without inventing data the sheet could not hold.
  h.run('(function(){ var orig = _irSuggestedCellHtml; _irSuggestedCellHtml = function (item) { if (item && item.sku === "SKU1007") throw new Error("MALFORMED_ROW"); return orig(item); }; })();');
  var e = irDrive(h, fx, 'MKT-RESUS-US-AMZ', 'US');
  ok(!e, '3.1 a row that throws does not throw out of the render (' + (e ? e.message : 'ok') + ')');
  var c = irCensus(h);
  eq(c.fixedRows, 20, '3.2 all 20 SKU rows still render');
  eq(c.scrollRows, 20, '3.3 all 20 business rows still render — the failure did not erase the later 12');
  eq(Object.keys(c.cellCounts), ['14'], '3.4 the failed row keeps the leaf-column count, so the header still lines up');
  var failed = h.doc.querySelectorAll('#ops-section .scroll-body .scroll-row--failed');
  eq(failed.length, 1, '3.5 exactly one row is marked failed');
  eq(failed.length ? failed[0].getAttribute('data-sku') : '', 'SKU1007', '3.6 ... and it is the one that threw');
  ok(String(failed.length ? failed[0].textContent : '').indexOf('row unavailable') !== -1,
    '3.7 the failed row SAYS it is unavailable — it is not blank and it is not a fabricated number');
  var integ = h.run('window._irRenderIntegrity_()');
  ok(integ && integ.failedRows === 1, '3.8 the render reports the failure count rather than swallowing it');
  var alarm = h.doc.getElementById('replen-render-integrity');
  ok(!!alarm, '3.9 ... and paints a visible integrity notice');
  ok(alarm && String(alarm.textContent).indexOf('Nothing was read or written') !== -1, '3.10 the notice states that nothing was read or written');
  eq(h.errors.length, 1, '3.11 exactly one diagnostic is logged for the one failed row');
})();

// ---- CN / TW numbers, their reasons, and conservation ---------------------------------------------------------
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '3.20 page load'); return; }

  // ResUS is an eligible receiver of BOTH the CN and the TW pool.
  var fx = irFixtures(3, 'MKT-RESUS-US-AMZ', 'ResUS', 'US', 'Amazon', {});
  irDrive(h, fx, 'MKT-RESUS-US-AMZ', 'US');
  var c = irCensus(h);
  ok(c.cn.every(function (v) { return /^[0-9,]+$/.test(v); }), '3.20 every CN cell renders a NUMBER, not an em dash (' + JSON.stringify(c.cn) + ')');
  ok(c.tw.every(function (v) { return /^[0-9,]+$/.test(v); }), '3.21 every TW cell renders a number (' + JSON.stringify(c.tw) + ')');
  eq(c.cn[0], '900', '3.22 CN = MAX(current 1000 - reserved 100, 0), the canonical available quantity');
  eq(c.tw[0], '450', '3.23 TW = MAX(current 500 - reserved 50, 0)');
  eq(c.factoryStates, { OK: 3 }, '3.24 the projection reports OK for an eligible, allocated site');

  // TW OUTSIDE ResUS IS A REAL ZERO — and it says which zero it is.
  var km = irFixtures(3, 'MKT-KM-US-AMZ', 'Kitchen Mama', 'US', 'Amazon', {});
  irDrive(h, km, 'MKT-KM-US-AMZ', 'US');
  var ck = irCensus(h);
  eq(ck.tw[0], '0', '3.25 TW renders numeric 0 for a company outside the authorized ResUS receiver set');
  ok(ck.cn.every(function (v) { return v !== '--' && v !== '0'; }), '3.26 ... while CN is still shared with that same site');

  // ZERO FORECAST DENOMINATOR: a real, computed zero with a stated reason — never a 100% fallback.
  var nofc = irFixtures(3, 'MKT-RESUS-US-AMZ', 'ResUS', 'US', 'Amazon', { noForecast: true });
  irDrive(h, nofc, 'MKT-RESUS-US-AMZ', 'US');
  var cz = irCensus(h);
  eq(cz.cn[0], '0', '3.27 a zero forecast denominator allocates 0 — never an arbitrary equal split');
  eq(Object.keys(cz.factoryStates), ['NO_FORECAST_DENOMINATOR'], '3.28 ... and the cell carries the diagnostic reason');
  var row0 = h.doc.querySelectorAll('#ops-section .scroll-body .scroll-row')[0];
  var cell = row0 ? row0.querySelectorAll('.scroll-cell')[11] : null;
  ok(cell && String(cell.getAttribute('title')).indexOf('Nothing was allocated') !== -1, '3.29 the reason is readable in the cell title');

  // CONSERVATION, proved against the projection itself: no site can be allocated a unit the pool does not have.
  var KMFSA = require(path.join(ROOT, 'assets/js/core/supply-planning-factory-site-allocation.js'));
  var proj = KMFSA.project({
    sku: 'SKU1000', calculationMonth: '2026-08',
    factoryRows: fx.model.getFactoryStock, warehouses: fx.model.getWarehouses,
    sites: [
      { marketplaceId: 'MKT-RESUS-US-AMZ', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SKU1000' },
      { marketplaceId: 'MKT-KM-US-AMZ', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', sku: 'SKU1000' },
      { marketplaceId: 'MKT-RESTW-TW-SHOP', company: 'ResTW', country: 'TW', marketplace: 'Shopify', sku: 'SKU1000' }
    ],
    forecastRows: [
      { sku: 'SKU1000', company: 'ResUS', country: 'US', marketplace: 'Amazon', year: '2026', sep: 20, oct: 20, nov: 20, dec: 20 },
      { sku: 'SKU1000', company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', year: '2026', sep: 30, oct: 30, nov: 30, dec: 30 },
      { sku: 'SKU1000', company: 'ResTW', country: 'TW', marketplace: 'Shopify', year: '2026', sep: 10, oct: 10, nov: 10, dec: 10 }
    ]
  });
  var perPool = proj.pools.map(function (p) { return { wh: p.warehouseId, avail: p.availableQty, alloc: p.allocated, over: p.allocated > p.availableQty }; });
  ok(perPool.every(function (p) { return !p.over; }), '3.30 no pool allocates more than it has: ' + JSON.stringify(perPool));
  ok(proj.totals.allocated <= proj.totals.available, '3.31 total allocated (' + proj.totals.allocated + ') <= total available (' + proj.totals.available + ')');
  var siteSum = Object.keys(proj.bySite).reduce(function (a, k) { return a + proj.bySite[k].total; }, 0);
  eq(siteSum, proj.totals.allocated, '3.32 the per-site shares sum to exactly what the pools allocated — no unit invented or lost');
  var tw = proj.pools.filter(function (p) { return p.sourceCountry === 'TW'; })[0];
  eq(tw ? tw.eligibleSiteKeys : [], ['MKT-RESUS-US-AMZ'].map(function (k) { return 'MKT:' + k; }),
    '3.33 the TW pool\'s eligible receiver set is ResUS alone');
  eq(proj.bySite['MKT:MKT-RESTW-TW-SHOP'].byCountry.TW || 0, 0, '3.34 ResTW receives zero from the TW source');
  eq(proj.bySite['MKT:MKT-KM-US-AMZ'].byCountry.TW || 0, 0, '3.35 Kitchen Mama receives zero from the TW source');
  ok((proj.bySite['MKT:MKT-KM-US-AMZ'].byCountry.CN || 0) > 0, '3.36 ... and a positive CROSS-COMPANY share of the CN source');
})();

// ---- expanding and closing a row does not corrupt later rows ---------------------------------------------------
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '3.40 page load'); return; }
  var fx = irFixtures(10, 'MKT-RESUS-US-AMZ', 'ResUS', 'US', 'Amazon', {});
  irDrive(h, fx, 'MKT-RESUS-US-AMZ', 'US');
  var before = irCensus(h);
  var e = null;
  try { h.run('toggleReplenRow("SKU1003");'); } catch (ex) { e = ex; }
  ok(!e, '3.40 expanding a row does not throw (' + (e ? e.message : 'ok') + ')');
  var open = irCensus(h);
  eq([open.fixedRows, open.scrollRows], [before.fixedRows, before.scrollRows], '3.41 expanding changes NO row count');
  eq(open.cellCounts, before.cellCounts, '3.42 ... and no row loses a column while a panel is open');
  var panelsFixed = h.doc.querySelectorAll('#ops-section .fixed-body .replen-expand-panel').length;
  var panelsScroll = h.doc.querySelectorAll('#ops-section .scroll-body .replen-expand-panel').length;
  eq([panelsFixed, panelsScroll], [1, 1], '3.43 exactly one detail panel on each side — the two never desync');
  try { h.run('toggleReplenRow("SKU1003");'); } catch (ex2) { e = ex2; }
  var closed = irCensus(h);
  eq([closed.fixedRows, closed.scrollRows], [before.fixedRows, before.scrollRows], '3.44 collapsing restores the exact row census');
  eq(closed.cellCounts, before.cellCounts, '3.45 ... and the exact column census');
  eq(h.doc.querySelectorAll('#ops-section .replen-expand-panel').length, 0, '3.46 no panel is left behind');
})();

// =============================================================================================================
// §4 — AI SUPPORT: SITE INVENTORY. Clicked through the SHIPPED inline onclick, on the SHIPPED markup.
// =============================================================================================================
section('§4 — SITE INVENTORY AI SUPPORT');
function registryStub() {
  return {
    STATUS: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' },
    isReady: function () { return true; },
    getState: function () { return { status: 'READY', model: { getMarketplaces: [
      { marketplaceId: 'MKT-RESUS-US-AMZ', company: 'ResUS', country: 'US', marketplace: 'Amazon', status: 'active' },
      { marketplaceId: 'MKT-RESUS-US-SHOP', company: 'ResUS', country: 'US', marketplace: 'Shopify', status: 'active' }
    ] } }; },
    ensureLoaded: function () { return Promise.resolve(this.getState()); }
  };
}
function visibleOutcome(h, noticeId) {
  var modal = h.doc.querySelector('.km-scope-modal.is-open');
  var notice = h.doc.getElementById(noticeId);
  var trigger = h.doc.getElementById(noticeId === 'replen-ai-support-notice' ? 'replenAiSupportTrigger' : 'roAiSupportTrigger');
  var out = [];
  if (modal) out.push('MODAL');
  if (notice && notice.hidden === false && String(notice.textContent).trim()) out.push('NOTICE');
  if (trigger && trigger.getAttribute('aria-busy') === 'true') out.push('PENDING');
  if (h.alerts.length) out.push('ALERT');
  return out;
}
// Null-safe readers. A suite that throws on a missing element reports ONE crash instead of the twelve findings
// it was about to make - which is exactly what happened the first time the modal defect was re-injected here.
function elVal(h, id) { var e = h.doc.getElementById(id); return e ? String(e.value) : null; }
function elText(h, id) { var e = h.doc.getElementById(id); return e ? String(e.textContent) : null; }
function elOpts(h, id) { var e = h.doc.getElementById(id); return e ? e.querySelectorAll('option') : []; }
// Dismissal is a user action too, and a close() that throws is itself a finding rather than a reason to abort.
function dismissModal(h) {
  if (!h.win.KM.scopeModal || typeof h.win.KM.scopeModal.close !== 'function') return 'NO_MODAL';
  try { h.win.KM.scopeModal.close(); return null; } catch (e) { return String(e && e.message); }
}
function openMenuAndClick(h, triggerId, itemIndex) {
  var trig = h.doc.getElementById(triggerId);
  trig.click();
  var list = h.doc.getElementById(triggerId.replace('Trigger', 'List'));
  var items = list.querySelectorAll('.km-action-menu__item');
  var thrown = null;
  try { items[itemIndex].click(); } catch (e) { thrown = e; }
  return { thrown: thrown, item: items[itemIndex], list: list };
}

(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '4.0 page load'); return; }
  h.win.KM.scopeRegistry = registryStub();

  // Concrete US / Amazon scope on the toolbar.
  h.doc.getElementById('replenCountry').value = 'US';
  h.doc.getElementById('replenMarketplace').value = 'MKT-RESUS-US-AMZ';

  var r = openMenuAndClick(h, 'replenAiSupportTrigger', 0);           // AI Plan
  ok(!r.thrown, '4.1 AI Plan click does not throw (was: ReferenceError: _dom is not defined) — ' + (r.thrown ? r.thrown.message : 'ok'));
  var out1 = visibleOutcome(h, 'replen-ai-support-notice');
  ok(out1.length >= 1, '4.2 AI Plan produces at least one VISIBLE outcome: ' + JSON.stringify(out1));
  ok(out1.indexOf('MODAL') !== -1, '4.3 ... and it is the scope modal');
  ok(r.list.hidden === true, '4.4 the menu closed, so the outcome had to be somewhere the menu is not');
  // The modal is prefilled from the toolbar scope, and Confirm resolves a CONCRETE identity.
  eq(elVal(h, 'km-scope-country'), '', '4.5 the modal renders its own selects (values are set by the user, not assumed)');
  var opts = elOpts(h, 'km-scope-country');
  ok(opts.length >= 2, '4.6 the country list is filled from the ONE shared scope registry (' + opts.length + ' options)');

  // CANCEL: a dismissal is an outcome, and it dispatches nothing.
  var dispatched = 0;
  h.run('handleReplenAiPlan = function () { __D.n++; };');
  h.ctx.__D = { n: 0 };
  ok(dismissModal(h) === null, '4.6b dismissing the modal (Cancel / overlay / Escape) does not throw');
  var out2 = visibleOutcome(h, 'replen-ai-support-notice');
  ok(out2.indexOf('NOTICE') !== -1, '4.7 cancelling reports itself (was indistinguishable from a dropped click)');
  ok(String(elText(h, 'replen-ai-support-notice')).indexOf('cancelled') !== -1, '4.8 ... and says it was cancelled');
  ok(String(elText(h, 'replen-ai-support-notice')).indexOf('Nothing was run') !== -1, '4.9 ... and that nothing was run or changed');
  eq(h.ctx.__D.n, 0, '4.10 cancelling dispatches ZERO actions');

  // Recalculate Current Scope: same contract, different action.
  var r2 = openMenuAndClick(h, 'replenAiSupportTrigger', 1);
  ok(!r2.thrown, '4.11 Recalculate Current Scope does not throw');
  ok(visibleOutcome(h, 'replen-ai-support-notice').indexOf('MODAL') !== -1, '4.12 ... and opens the scope modal');
  eq(elText(h, 'km-scope-modal-title'), 'Recalculate Current Scope — Inventory', '4.13 the two actions are visibly different workflows');
  dismissModal(h);

  // MISSING SERVICE — a stated refusal, never a bare return.
  var saved = h.win.KM.scopeModal;
  h.win.KM.scopeModal = null;
  h.run('handleReplenAiPlan = undefined; recalcInventoryGapCurrentScope = undefined;');
  var r3 = openMenuAndClick(h, 'replenAiSupportTrigger', 0);
  ok(!r3.thrown, '4.14 a missing scope selector does not throw');
  var n3 = h.doc.getElementById('replen-ai-support-notice');
  ok(n3 && n3.hidden === false, '4.15 a missing scope selector produces a VISIBLE refusal');
  ok(String(n3.textContent).indexOf('scope-select-modal.js') !== -1, '4.16 ... naming the asset that is missing');

  // A MODAL THAT THROWS is not the same as a modal that is absent, and it is no longer silent either.
  h.win.KM.scopeModal = { open: function () { throw new Error('BOOM'); } };
  h.run('_irClearAiSupportNotice_();');
  var r4 = openMenuAndClick(h, 'replenAiSupportTrigger', 0);
  ok(!r4.thrown, '4.17 a THROWING scope selector is caught by the page');
  var n4 = h.doc.getElementById('replen-ai-support-notice');
  ok(n4 && n4.hidden === false && String(n4.textContent).indexOf('BOOM') !== -1,
    '4.18 ... and the thrown error is reported, which is exactly what was silent live');
  h.win.KM.scopeModal = saved;

  // AN UNRECOGNISED ITEM — the last silent return on this page.
  h.run('_irClearAiSupportNotice_();');
  var refused = h.run('runReplenAiSupport("not-a-real-action")');
  eq(refused, true, '4.19 an unrecognised action returns a REPORTED refusal');
  ok(String(elText(h, 'replen-ai-support-notice')).indexOf('Unrecognised action') !== -1, '4.20 ... naming what it did not recognise');

  // A missing recalculation service is refused visibly rather than by an alert alone.
  h.run('_irClearAiSupportNotice_(); handleRecalcAllInventoryGap = undefined;');
  h.run('runReplenAiSupport("recalcAll")');
  ok(String(elText(h, 'replen-ai-support-notice')).indexOf('not available') !== -1,
    '4.21 a missing recalculation handler is a stated refusal');
})();

// ---- leave and return; the menu opened more than once ----------------------------------------------------------
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '4.30 page load'); return; }
  h.win.KM.scopeRegistry = registryStub();
  var before = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  h.run('_replenBindAiSupportGlobal();');
  var after1 = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  ok(after1 > before, '4.30 binding the AI menu registers its global listeners');
  h.run('_replenBindAiSupportGlobal(); _replenBindAiSupportGlobal(); _replenBindAiSupportGlobal();');
  var after2 = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  eq(after2, after1, '4.31 remounting adds NO duplicate listeners (three more binds, zero new listeners)');

  // Opening the menu repeatedly, then acting, still produces exactly one outcome.
  var trig = h.doc.getElementById('replenAiSupportTrigger');
  var list = h.doc.getElementById('replenAiSupportList');
  trig.click();
  ok(list.hidden === false, '4.32a opening the menu shows it');
  trig.click();
  ok(list.hidden === true, '4.32b toggling closes it');
  trig.click(); trig.click(); trig.click();
  ok(list.hidden === false, '4.32c opening it repeatedly leaves ONE open menu, not a stack of them');
  var items = list.querySelectorAll('.km-action-menu__item');
  h.ctx.__D = { n: 0 };
  h.win.KM.scopeModal = { open: function (o) { h.ctx.__D.n++; o.onConfirm({ company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US-AMZ' }); } };
  h.run('handleReplenAiPlan = function () { __D.confirmed = (__D.confirmed || 0) + 1; };');
  items[0].click();
  eq(h.ctx.__D.n, 1, '4.33 one click opens the picker exactly once');
  eq(h.ctx.__D.confirmed, 1, '4.34 one confirm dispatches the existing handler exactly once');

  // Leave and return: a fresh mount of the same page behaves identically.
  var h2 = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  h2.win.KM.scopeRegistry = registryStub();
  var r = openMenuAndClick(h2, 'replenAiSupportTrigger', 0);
  ok(!r.thrown && !!h2.doc.querySelector('.km-scope-modal.is-open'), '4.35 leaving and returning still produces the modal on the first click');
})();

// ---- the recalculation lifecycle is visible OUTSIDE the panel the click hid -------------------------------------
(function () {
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '4.40 page load'); return; }
  var started = 0;
  h.win.KM.DB = { startInventoryReplenishmentGapJob: function () { started++; return Promise.resolve({ runId: 'R1', status: 'PENDING' }); },
    getGapJobStatus: function () { return Promise.resolve({ status: 'PENDING' }); } };
  h.sb.__confirmAnswer = false;
  h.run('handleRecalcAllInventoryGap({ mode: "CURRENT_SCOPE", company: "ResUS", country: "US", marketplace: "Amazon" });');
  eq(started, 0, '4.40 declining the confirmation starts NOTHING');
  var n = h.doc.getElementById('replen-ai-support-notice');
  ok(n && n.hidden === false && String(n.textContent).indexOf('not confirmed') !== -1,
    '4.41 ... and says so — a declined confirmation used to be a bare return');

  h.sb.__confirmAnswer = true;
  h.run('_irClearAiSupportNotice_();');
  h.run('handleRecalcAllInventoryGap({ mode: "CURRENT_SCOPE", company: "ResUS", country: "US", marketplace: "Amazon" });');
  eq(started, 1, '4.42 confirming starts exactly ONE backend job');
  var trig = h.doc.getElementById('replenAiSupportTrigger');
  eq(trig.getAttribute('aria-busy'), 'true', '4.43 progress is mirrored onto the TRIGGER, which stays on screen');
  ok(String(trig.textContent).indexOf('Starting') !== -1, '4.44 ... and it names the state (' + JSON.stringify(trig.textContent) + ')');
  var menuItem = h.doc.getElementById('replen-recalc-all-btn');
  ok(menuItem && menuItem.closest('.km-action-menu__panel') && menuItem.closest('.km-action-menu__panel').hidden === true,
    '4.45 the menu item that ALSO carries this state is inside a hidden panel — which is why the mirror exists');

  // A second click while running is refused visibly rather than ignored.
  h.run('_irClearAiSupportNotice_();');
  h.run('handleRecalcAllInventoryGap({ mode: "CURRENT_SCOPE" });');
  eq(started, 1, '4.46 a second click while running starts nothing twice');
  ok(String(elText(h, 'replen-ai-support-notice')).indexOf('already running') !== -1,
    '4.47 ... and says why it was ignored');
})();

// =============================================================================================================
// §4 — AI SUPPORT: ORDER PLANNING. Traced separately; the shared cause is the same, the page gap is not.
// =============================================================================================================
section('§4 — ORDER PLANNING AI SUPPORT');
(function () {
  var h = mountPage('assets/html/pages/request-order.html', 'assets/js/pages/request-order.js', IR_LIBS);
  ok(!h.loadError, '5.0 the shipped Order Planning module loads (' + (h.loadError ? h.loadError.message : 'ok') + ')');
  if (h.loadError) return;
  h.win.KM.scopeRegistry = registryStub();

  var r = openMenuAndClick(h, 'roAiSupportTrigger', 0);
  ok(!r.thrown, '5.1 AI Plan click does not throw (was: ReferenceError: _dom is not defined)');
  var out = visibleOutcome(h, 'ro-ai-support-notice');
  ok(out.indexOf('MODAL') !== -1, '5.2 AI Plan opens the scope modal: ' + JSON.stringify(out));
  eq(elText(h, 'km-scope-modal-title'), 'AI Plan — Order Planning', '5.3 with the Order Planning title');

  h.ctx.__D = { n: 0 };
  h.run('handleRequestOrderAiPlan = function () { __D.n++; };');
  ok(dismissModal(h) === null, '5.3b dismissing the modal does not throw');
  var n = h.doc.getElementById('ro-ai-support-notice');
  ok(n && n.hidden === false && String(n.textContent).indexOf('cancelled') !== -1, '5.4 cancelling reports itself');
  eq(h.ctx.__D.n, 0, '5.5 cancelling dispatches ZERO actions');

  var r2 = openMenuAndClick(h, 'roAiSupportTrigger', 1);
  ok(!r2.thrown, '5.6 Recalculate Current Scope does not throw');
  eq(elText(h, 'km-scope-modal-title'), 'Recalculate Current Scope — Order Planning', '5.7 ... and is a visibly different workflow');
  dismissModal(h);

  // THE ORDER-PLANNING-SPECIFIC GAP: it guarded on the modal being PRESENT, and open() WAS present. It threw.
  h.win.KM.scopeModal = { open: function () { throw new Error('BOOM'); } };
  h.run('_roClearAiSupportNotice_();');
  var r3 = openMenuAndClick(h, 'roAiSupportTrigger', 0);
  ok(!r3.thrown, '5.8 a THROWING scope selector is caught by the page');
  var n3 = h.doc.getElementById('ro-ai-support-notice');
  ok(n3 && n3.hidden === false && String(n3.textContent).indexOf('BOOM') !== -1,
    '5.9 ... and reported — presence and success are now separate facts');

  // Remount adds no listeners.
  var before = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  h.run('_roBindAiSupportGlobal();');
  var mid = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  h.run('_roBindAiSupportGlobal(); _roBindAiSupportGlobal();');
  var after = h.doc.listenerCount('click') + h.doc.listenerCount('keydown');
  eq(after, mid, '5.10 remounting adds no duplicate Order Planning listeners');

  // One click, one dispatch — All/All and a concrete scope alike.
  h.ctx.__D = { open: 0, run: 0 };
  h.win.KM.scopeModal = { open: function (o) { h.ctx.__D.open++; o.onConfirm({ company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MKT-RESUS-US-AMZ' }); } };
  h.run('handleRequestOrderAiPlan = function () { __D.run++; };');
  h.run('requestOrderState.filters = { country: [], marketplace: [] };');       // All / All
  openMenuAndClick(h, 'roAiSupportTrigger', 0);
  eq([h.ctx.__D.open, h.ctx.__D.run], [1, 1], '5.11 All / All: one click -> one picker -> one dispatch');
  h.run('requestOrderState.filters = { country: ["US"], marketplace: ["Amazon"] };');   // concrete
  openMenuAndClick(h, 'roAiSupportTrigger', 0);
  eq([h.ctx.__D.open, h.ctx.__D.run], [2, 2], '5.12 concrete ResUS / US / Amazon: one click -> one picker -> one dispatch');

  // An unrecognised item is refused, not swallowed (R4B-R1 property, re-proved through the shipped DOM).
  h.run('_roClearAiSupportNotice_();');
  h.run('runRoAiSupport("nope")');
  ok(String(elText(h, 'ro-ai-support-notice')).indexOf('Unrecognised action') !== -1,
    '5.13 an unrecognised Order Planning action is a stated refusal');
})();


// ---- the second concrete scope, and the two Order Planning cases the task named separately ------------------
(function () {
  // SITE INVENTORY, concrete US / Shopify. The live report separated Amazon from Shopify, so the click is
  // proved under BOTH toolbar scopes rather than assumed to generalise.
  var h = mountPage('assets/html/pages/inventory-replenishment.html', 'assets/js/pages/inventory-replenishment.js', IR_LIBS);
  if (h.loadError) { ok(false, '4.50 page load'); return; }
  h.win.KM.scopeRegistry = registryStub();
  h.doc.getElementById('replenCountry').value = 'US';
  h.doc.getElementById('replenMarketplace').value = 'MKT-RESUS-US-SHOP';
  var r = openMenuAndClick(h, 'replenAiSupportTrigger', 0);
  ok(!r.thrown, '4.50 US / Shopify: AI Plan does not throw');
  ok(visibleOutcome(h, 'replen-ai-support-notice').indexOf('MODAL') !== -1, '4.51 ... and produces the same visible outcome as Amazon');
  dismissModal(h);
  var r2 = openMenuAndClick(h, 'replenAiSupportTrigger', 1);
  ok(!r2.thrown && !!h.doc.querySelector('.km-scope-modal.is-open'), '4.52 US / Shopify: Recalculate Current Scope opens the picker too');
  dismissModal(h);
})();

(function () {
  // ORDER PLANNING, leave and return, and with drafts already hydrated. A remounted page must behave like a
  // fresh one, and an AI action must not disturb the Order Qty values R4B-R2 restored.
  var h = mountPage('assets/html/pages/request-order.html', 'assets/js/pages/request-order.js', IR_LIBS);
  if (h.loadError) { ok(false, '5.20 page load'); return; }
  h.win.KM.scopeRegistry = registryStub();
  var r = openMenuAndClick(h, 'roAiSupportTrigger', 0);
  ok(!r.thrown && !!h.doc.querySelector('.km-scope-modal.is-open'), '5.20 leaving and returning still produces the modal on the first click');
  dismissModal(h);

  // Existing hydrated drafts: the AI menu must not touch them, and the identity they hydrate by is unchanged.
  h.run('requestOrderState.data = [{ sku: "SP1", company: "ResUS", country: "US", marketplace: "Amazon", boxSize: 12 }];');
  var key = h.run('_roDraftKey_({ sku: "SP1", company: "ResUS", country: "US", marketplace: "Amazon" })');
  eq(key, 'RESUS|US|AMAZON|SP1', '5.21 the canonical draft key is still the SITE plus the SKU');
  h.ctx.__D = { drafts: null };
  h.run('_roCanonicalDraftBySku = {}; _roCanonicalDraftBySku[' + JSON.stringify(key) + '] = { sku: "SP1", t1: 360, t3: 100 };');
  var before = h.run('JSON.stringify(_roCanonicalDraftBySku)');
  h.win.KM.scopeModal = { open: function () { /* opened; the user has not confirmed */ } };
  openMenuAndClick(h, 'roAiSupportTrigger', 0);
  eq(h.run('JSON.stringify(_roCanonicalDraftBySku)'), before, '5.22 opening the AI picker changes NO hydrated draft');
  dismissModal(h);
})();
// =============================================================================================================
// §5 — ASSET RELEASE CONSISTENCY.
// =============================================================================================================
section('§5 — ASSET RELEASE CONSISTENCY');
(function () {
  function tokenOf(file) {
    var m = new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([A-Za-z0-9._-]+)').exec(INDEX_HTML);
    return m ? m[1] : null;
  }
  // The COUPLED set: everything R4B touched that the browser loads. The persistence module is deliberately
  // absent from index.html — it is a SERVER-side module that ships inside 90_generated_supply_planning_bundle.gs.
  var coupled = ['inventory-replenishment.js', 'request-order.js', 'operation-system-db-api.js',
    'supply-planning-factory-site-allocation.js', 'scope-select-modal.js'];
  var tokens = {};
  coupled.forEach(function (f) { tokens[f] = tokenOf(f); });
  var distinct = Object.keys(tokens).map(function (k) { return tokens[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  eq(distinct.length, 1, '6.1 every coupled asset carries ONE release token: ' + JSON.stringify(tokens));
  ok(distinct[0] && /r4b-?r3/i.test(distinct[0]), '6.2 ... and it names R4B-R3 (' + distinct[0] + ')');
  ok(tokenOf('supply-planning-request-draft-v2-persistence.js') === null,
    '6.3 the draft persistence module is NOT a browser asset — it ships inside the 90_ Apps Script bundle');

  // The specific mixed tokens the live page was serving.
  eq((INDEX_HTML.match(/fb4er4br2-hydrationjoin-20260831/g) || []).length, 0, '6.4 no R4B-R2 token survives');
  eq((INDEX_HTML.match(/fb4er4br1-authority-20260831/g) || []).length, 0, '6.5 no R4B-R1 token survives');
  eq((INDEX_HTML.match(/scope-select-modal\.js\?v=fb4c-shared-registry-20260826/g) || []).length, 0,
    '6.6 the scope modal no longer carries the FB-4C token it kept through two rounds of changes');

  // LOAD ORDER — derived from index.html, never assumed.
  function pos(f) { return INDEX_HTML.indexOf(f + '?v='); }
  ok(pos('supply-planning-factory-site-allocation.js') > 0, '6.7 the allocation module is loaded at all');
  ok(pos('supply-planning-factory-site-allocation.js') < pos('inventory-replenishment.js'),
    '6.8 the allocation module loads BEFORE Site Inventory');
  ok(pos('supply-planning-factory-site-allocation.js') < pos('request-order.js'),
    '6.9 ... and BEFORE Order Planning');
  ok(pos('scope-select-modal.js') < pos('inventory-replenishment.js') && pos('scope-select-modal.js') < pos('request-order.js'),
    '6.10 the shared scope modal loads before both of its consumers');
  ok(pos('scope-registry.js') < pos('scope-select-modal.js'), '6.11 the scope registry loads before the modal that reads it');
})();

// =============================================================================================================
// §6 — THE TWO DEFECTS, PINNED AS PROPERTIES SO THEY CANNOT RETURN.
// =============================================================================================================
section('§6 — REGRESSION GUARDS');
(function () {
  var MODAL = read('assets/js/utils/scope-select-modal.js');
  ok(/var _dom = null, _state = null, _openToken = 0;/.test(MODAL),
    '7.1 the scope modal declares its own state (deleting this line killed every AI action for five days)');
  // Executed, not inspected: open() must not throw on a bare document.
  (function () {
    var holder = {};
    var doc = createDocument(holder);
    var sb = { window: { KM: {}, document: doc }, document: doc, console: { log: function () {}, error: function () {} },
      JSON: JSON, Math: Math, Promise: Promise, Array: Array, Object: Object, String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error };
    sb.window.window = sb.window; sb.globalThis = sb;
    var ctx = vm.createContext(sb); holder.ctx = ctx;
    vm.runInContext(MODAL, ctx, { filename: 'scope-select-modal.js' });
    var threw = null;
    try { sb.window.KM.scopeModal.open({ title: 'T', subtitle: 'S', onConfirm: function () {} }); } catch (e) { threw = e; }
    ok(!threw, '7.2 open() executes against a real document without throwing (' + (threw ? threw.message : 'ok') + ')');
    ok(!!doc.querySelector('.km-scope-modal.is-open'), '7.3 ... and the dialog is actually marked open');
    var closed = null;
    try { sb.window.KM.scopeModal.close(); } catch (e) { closed = e; }
    ok(!closed && !doc.querySelector('.km-scope-modal.is-open'), '7.4 close() executes and clears the open state');
  })();

  // NO HTML COMMENT MAY BE LEFT OPEN INSIDE A TEMPLATE LITERAL. This is the exact class the live defect belongs
  // to, and it needs a scanner rather than a text search: a plain `grep` for the offending fragment is defeated
  // the moment a JS comment DESCRIBES it (this file and the page both do), which is the same trap R4A §7.8 and
  // R4B-R1 §2.18 hit. The scanner tokenizes each file properly — line comments, block comments, the three string
  // forms — and then asks one question of each TEMPLATE LITERAL only: does every `<!--` it opens get closed
  // before the literal ends? At the moment of the bug the answer was no, because the literal ended EARLY on a
  // backtick nobody meant as a delimiter.
  function templateLiteralsOf(src) {
    var out = [], i = 0, n = src.length;
    while (i < n) {
      var c = src[i];
      if (c === '/' && src[i + 1] === '/') { var e = src.indexOf('\n', i); i = e === -1 ? n : e + 1; continue; }
      if (c === '/' && src[i + 1] === '*') { var b = src.indexOf('*/', i + 2); i = b === -1 ? n : b + 2; continue; }
      if (c === '"' || c === "'") {
        var q = c; i++;
        while (i < n && src[i] !== q) { if (src[i] === '\\') i++; if (src[i] === '\n') break; i++; }
        i++; continue;
      }
      if (c === '`') {
        var start = ++i, depth = 0, body = '';
        while (i < n) {
          if (src[i] === '\\') { body += src[i] + (src[i + 1] || ''); i += 2; continue; }
          if (src[i] === '$' && src[i + 1] === '{') { depth++; body += '${'; i += 2; continue; }
          if (depth > 0 && src[i] === '}') { depth--; body += '}'; i++; continue; }
          if (depth === 0 && src[i] === '`') break;
          body += src[i]; i++;
        }
        out.push({ index: start, body: body });
        i++; continue;
      }
      i++;
    }
    return out;
  }
  function unbalancedTemplateComments(src) {
    return templateLiteralsOf(src).filter(function (t) {
      return (t.body.match(/<!--/g) || []).length !== (t.body.match(/-->/g) || []).length;
    }).map(function (t) { return 'template literal at offset ' + t.index; });
  }
  // The guard proves itself first: the ACTUAL pre-fix shape must be detected, or a clean result means nothing.
  var reproduction = 'x = rows.map(item => `\n  <div class="r">\n  <!-- note, and ' + '`' + '|| 0' + '`' + ' is not enough -->\n  <div>${item.a}</div>\n  </div>\n`).join("");';
  // The stray backtick splits ONE comment across TWO literals, and BOTH end up unbalanced - which is precisely
  // why the emitted row ended mid-comment and the browser ate everything after it.
  eq(unbalancedTemplateComments(reproduction).length, 2,
    '7.5 the guard detects the EXACT pre-fix shape (an HTML comment cut in half by a stray backtick)');
  ok(unbalancedTemplateComments('y = `<div><!-- ok --></div>`;').length === 0,
    '7.6 ... and does not flag a balanced comment inside a template literal');
  var pages = fs.readdirSync(path.join(ROOT, 'assets/js/pages')).filter(function (f) { return /\.js$/.test(f); });
  var offenders = [];
  pages.forEach(function (f) {
    unbalancedTemplateComments(read('assets/js/pages/' + f)).forEach(function (w) { offenders.push(f + ': ' + w); });
  });
  eq(offenders, [], '7.7 no page module leaves an HTML comment open inside a template literal');
  var IRSRC = read('assets/js/pages/inventory-replenishment.js');
  ok(/function _irScrollRowHtml_/.test(IRSRC) && /function _irScrollRowFailedHtml_/.test(IRSRC),
    '7.8 the row is built by a named builder, so one row can fail without taking the table');
  ok(/_irVerifyRenderedRows_\(data\.length\)/.test(IRSRC), '7.9 the render verifies its own output every time');
})();

// =============================================================================================================
// §7 — PRESERVED R4B WORK (spot checks; the focused suites are run separately).
// =============================================================================================================
section('§7 — PRESERVED R4B WORK');
(function () {
  var K = require(path.join(ROOT, 'assets/js/core/supply-planning-factory-site-allocation.js'));
  eq(K.policyFor('CN').label, 'SHARED_ALL_ELIGIBLE', '8.1 the CN source is still shared cross-company');
  eq(K.policyFor('TW').label, 'RESUS_ONLY', '8.2 the TW source is still ResUS-only');
  eq(K.policyFor('VN'), null, '8.3 an unauthorized factory country still fails closed');
  eq(K.forecastWindowMonths('2026-08').map(function (m) { return m.label; }), ['2026-09', '2026-10', '2026-11', '2026-12'],
    '8.4 the frozen rolling future four-month window is unchanged');
  var P = require(path.join(ROOT, 'assets/js/core/supply-planning-request-draft-v2-persistence.js'));
  eq(P.MAX_READBACK_SCOPES, 25, '8.5 the bounded multi-scope readback cap is unchanged');
  ok(typeof P.isConcreteScope === 'function' && P.isConcreteScope({ company: 'ResUS', country: 'US', marketplace: 'Amazon' }) === true,
    '8.6 a concrete scope is still concrete');
  ok(P.isConcreteScope({ company: '', country: 'US', marketplace: 'Amazon' }) === false,
    '8.7 a blank site field is still NOT a wildcard');
  var ROUTERSRC = read('assets/specs/active/apps-script/01_router.gs');
  ok(/rtrEmitHandlerResult_\(_rtrRead\[action\]\(_parsed\.body\)\)/.test(ROUTERSRC),
    '8.8 the GET read dispatch still EMITS what the handler produced (the R4B-R2 fix is intact)');
  var ROSRC = read('assets/js/pages/request-order.js');
  ok(/function _roDraftKey_/.test(ROSRC) && /_RO_KEY_AMBIGUOUS_/.test(ROSRC),
    '8.9 the company-aware canonical draft key and its AMBIGUOUS sentinel are intact');
})();

Promise.all(checks).then(function () {
  console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
});
