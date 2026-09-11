// Kitchen Mama Operation System — PRODUCT STRATEGY BOARD test harness.
// NOT a test. Shared by product-strategy-board-p1-b2.test.js and -p1-b2a.test.js.
//
// WHY IT IS A MODULE AND NOT A COPY. It carries a DOM shim, and a shim is a model of a browser: two
// copies of a model agree on the day they are written and disagree quietly afterwards, so the second
// suite would be testing a slightly different browser from the first and neither would say so. It
// moved here the moment there was a second reader.
//
// THE SHIM IS DELIBERATELY NARROW. It implements the DOM surface prototype.js actually uses and
// nothing else, so what it proves is what the page does rather than what a full browser tolerates. Its
// selector engine THROWS on a syntax it cannot parse rather than returning an empty list, because an
// engine that answers "no matches" to what it cannot read turns every DOM assertion into a passing
// one. Its event dispatch really bubbles and really honours stopPropagation, because "click outside to
// close" is implemented with those and a shim without them would pass whether or not the page had it.
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var PROTO = path.join(ROOT, 'docs', 'prototypes', 'product-strategy-board');
/**
 * LINE ENDINGS ARE NORMALIZED ON READ, AND THIS IS LOAD-BEARING.
 *
 * The repository is configured `core.autocrlf=true`, so every checkout of these files lands CRLF in
 * the working tree while the blob stays LF. Nothing this suite asserts is about a line ending — but a
 * mutant's anchor is a multi-line string, and an anchor that matches zero times makes `swap` throw,
 * which `mut` reports as MUTANT SURVIVED. That is the worst failure mode available: the suite goes red
 * with a message about a rule, when what actually happened is that git touched the file.
 *
 * It was not hypothetical. Six mutants — every one whose anchor spans more than a line — flipped to
 * SURVIVED the moment a `git stash pop` re-checked these files out, and the code they target had not
 * changed by a byte. Normalizing here fixes it for every reader, including the next clone.
 */
function readProto(f) {
  return fs.readFileSync(path.join(PROTO, f), 'utf8').replace(/\r\n/g, '\n');
}
/** Comments AND string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var SRC = {
  contract: readProto('data-contract.js'),
  selectors: readProto('selectors.js'),
  fixture: readProto('preview-fixture.js'),
  prototype: readProto('prototype.js'),
  index: readProto('index.html'),
  css: readProto('prototype.css')
};

// ===================================================================================================
// THE DOM SHIM.
//
// Deliberately narrow: it implements the DOM surface prototype.js actually uses and nothing else, so
// what it proves is what the page does rather than what a full browser might tolerate. The selector
// engine handles the shapes the file uses — #id, .class, tag, [attr], [attr="v"], compounds of those,
// descendant chains, and comma lists — and throws on anything it does not understand rather than
// silently returning an empty list, because a selector engine that answers "no matches" to a syntax it
// cannot parse would turn every DOM assertion into a passing one.
// ===================================================================================================
function makeDom(skeleton) {
  function Node(tag, ns) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag);
    this.namespaceURI = ns || null;
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
  }
  Object.defineProperty(Node.prototype, 'className', {
    get: function () { return this.attributes['class'] || ''; },
    set: function (v) { this.attributes['class'] = String(v); }
  });
  Object.defineProperty(Node.prototype, 'id', {
    get: function () { return this.attributes.id || ''; },
    set: function (v) { this.attributes.id = String(v); }
  });
  Object.defineProperty(Node.prototype, 'firstChild', {
    get: function () { return this.childNodes.length ? this.childNodes[0] : null; }
  });
  Object.defineProperty(Node.prototype, 'textContent', {
    get: function () {
      var out = '';
      this.childNodes.forEach(function (k) {
        out += k.nodeType === 3 ? k.data : k.textContent;
      });
      return out;
    }
  });
  Node.prototype.appendChild = function (k) {
    if (!k) throw new Error('appendChild(null)');
    if (k.parentNode) k.parentNode.removeChild(k);
    k.parentNode = this;
    this.childNodes.push(k);
    return k;
  };
  Node.prototype.removeChild = function (k) {
    var i = this.childNodes.indexOf(k);
    if (i < 0) throw new Error('removeChild: not a child');
    this.childNodes.splice(i, 1);
    k.parentNode = null;
    return k;
  };
  Node.prototype.setAttribute = function (n, v) { this.attributes[n] = String(v); };
  Node.prototype.getAttribute = function (n) {
    return Object.prototype.hasOwnProperty.call(this.attributes, n) ? this.attributes[n] : null;
  };
  Node.prototype.hasAttribute = function (n) {
    return Object.prototype.hasOwnProperty.call(this.attributes, n);
  };
  Node.prototype.addEventListener = function (t, f) {
    (this.listeners[t] = this.listeners[t] || []).push(f);
  };
  /**
   * REAL BUBBLING, because the behaviour under test depends on it.
   *
   * "Click outside to close" is implemented as one document-level listener plus `stopPropagation` on
   * the controls that open a panel. A shim that fired listeners only on the target would make that
   * pass with no bubbling at all — and would equally pass if the stopPropagation were missing. So the
   * walk is the real one: target, then each ancestor, then the document, halting on stopPropagation.
   */
  Node.prototype.dispatchEvent = function (ev) {
    var path = [], n = this;
    while (n) { path.push(n); n = n.parentNode; }
    if (documentRef) path.push(documentRef);
    for (var i = 0; i < path.length; i++) {
      var target = path[i];
      var fns = (target.listeners || {})[ev.type] || [];
      for (var j = 0; j < fns.length; j++) {
        if (ev.__stopped) return true;
        fns[j].call(target, ev);
      }
      if (ev.__stopped) return true;
      if (!ev.bubbles && i === 0) return true;
    }
    return true;
  };
  Node.prototype.click = function () { this.dispatchEvent(new Ev('click', { bubbles: true })); };

  function Text(data) { this.nodeType = 3; this.data = String(data); this.parentNode = null;
    this.childNodes = []; }
  Object.defineProperty(Text.prototype, 'textContent', {
    get: function () { return this.data; }
  });

  function Ev(type, opts) {
    this.type = type;
    this.bubbles = !!(opts && opts.bubbles);
    this.key = (opts && opts.key) || undefined;
    this.__stopped = false;
  }
  Ev.prototype.stopPropagation = function () { this.__stopped = true; };
  Ev.prototype.preventDefault = function () {};

  // ---- the selector engine ----
  function parseCompound(txt) {
    var c = { tag: null, id: null, classes: [], attrs: [] };
    var rest = txt;
    while (rest.length) {
      var m;
      if ((m = /^#([A-Za-z0-9_-]+)/.exec(rest))) { c.id = m[1]; }
      else if ((m = /^\.([A-Za-z0-9_-]+)/.exec(rest))) { c.classes.push(m[1]); }
      else if ((m = /^\[([A-Za-z0-9_-]+)(?:=("([^"]*)"|'([^']*)'))?\]/.exec(rest))) {
        c.attrs.push({ name: m[1],
          value: m[2] === undefined ? undefined : (m[3] !== undefined ? m[3] : m[4]) });
      } else if ((m = /^([A-Za-z][A-Za-z0-9-]*)/.exec(rest))) { c.tag = m[1].toLowerCase(); }
      else { throw new Error('selector shim cannot parse: ' + txt); }
      rest = rest.slice(m[0].length);
    }
    return c;
  }
  function matches(node, c) {
    if (node.nodeType !== 1) return false;
    if (c.tag !== null && node.localName.toLowerCase() !== c.tag) return false;
    if (c.id !== null && node.id !== c.id) return false;
    var cls = String(node.className || '').split(/\s+/);
    for (var i = 0; i < c.classes.length; i++) {
      if (cls.indexOf(c.classes[i]) < 0) return false;
    }
    for (var j = 0; j < c.attrs.length; j++) {
      var a = c.attrs[j];
      if (!node.hasAttribute(a.name)) return false;
      if (a.value !== undefined && node.getAttribute(a.name) !== a.value) return false;
    }
    return true;
  }
  function descendants(node, out) {
    node.childNodes.forEach(function (k) {
      if (k.nodeType === 1) { out.push(k); descendants(k, out); }
    });
    return out;
  }
  /**
   * SPLIT ON WHITESPACE, BUT NOT INSIDE A QUOTED ATTRIBUTE VALUE. Naive whitespace splitting broke
   * `tr[data-category="Electric Can Opener"]` in half — and because the parser throws on what it
   * cannot read, that showed up as an error instead of as a silently empty match list.
   */
  function splitTop(txt, mode) {
    var out = [], buf = '', q = null;
    function isSep(ch) {
      return mode === 'comma' ? ch === ',' : (ch === ' ' || ch === '\t' || ch === '\n');
    }
    for (var i = 0; i < txt.length; i++) {
      var ch = txt.charAt(i);
      if (q) {
        buf += ch;
        if (ch === q) q = null;
        continue;
      }
      if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
      if (isSep(ch)) {
        if (buf.length) { out.push(buf); buf = ''; }
        continue;
      }
      buf += ch;
    }
    if (buf.length) out.push(buf);
    return out;
  }
  function qsaOn(root, sel) {
    var seen = [], result = [];
    splitTop(String(sel), 'comma').forEach(function (part) {
      var chain = splitTop(part.trim(), 'space').map(parseCompound);
      if (!chain.length) return;
      var current = [root];
      chain.forEach(function (c) {
        var next = [];
        current.forEach(function (n) {
          descendants(n, []).forEach(function (k) {
            if (matches(k, c) && next.indexOf(k) < 0) next.push(k);
          });
        });
        current = next;
      });
      current.forEach(function (n) { if (seen.indexOf(n) < 0) { seen.push(n); } });
    });
    // document order
    var all = descendants(root, []);
    all.forEach(function (n) { if (seen.indexOf(n) >= 0) result.push(n); });
    return result;
  }
  Node.prototype.querySelectorAll = function (sel) { return qsaOn(this, sel); };
  Node.prototype.querySelector = function (sel) {
    var r = qsaOn(this, sel);
    return r.length ? r[0] : null;
  };

  var doc = new Node('html');
  var head = new Node('head');
  var body = new Node('body');
  doc.appendChild(head);
  doc.appendChild(body);

  var documentRef = null;
  var document = {
    listeners: {},
    addEventListener: function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    dispatchEvent: function (ev) {
      var self = this;
      (this.listeners[ev.type] || []).slice().forEach(function (f) {
        if (!ev.__stopped) f.call(self, ev);
      });
      return true;
    },
    documentElement: doc,
    head: head,
    body: body,
    createElement: function (t) { return new Node(t, null); },
    createElementNS: function (ns, t) { return new Node(t, ns); },
    createTextNode: function (t) { return new Text(t); },
    getElementById: function (id) {
      var hit = null;
      descendants(doc, []).forEach(function (n) { if (!hit && n.id === id) hit = n; });
      return hit;
    },
    querySelectorAll: function (sel) { return qsaOn(doc, sel); },
    querySelector: function (sel) {
      var r = qsaOn(doc, sel);
      return r.length ? r[0] : null;
    }
  };
  documentRef = document;
  skeleton(document, head, body, function (t) { return new Node(t, null); });
  return { document: document, Event: Ev, body: body, head: head,
    window: { print: function () { window.__printed = (window.__printed || 0) + 1; } } };
}

/**
 * THE PAGE SKELETON, AND IT IS HELD TO index.html RATHER THAN TRANSCRIBED FROM IT.
 *
 * Every id below is asserted to exist in the real file, and the script/link tags are extracted FROM the
 * real file, so this cannot drift into a shape the page does not have. A skeleton nobody checks is a
 * second page, and a suite that tests a second page proves nothing about the first.
 */
var PAGE_IDS = ['banner', 'notice', 'shell', 'side', 'nav', 'btnRail', 'btnPresent', 'btnPrint',
  'main', 'topbar', 'crumbs', 'stBadge', 'btnStDetail', 'scope', 'view', 'selftest', 'stList',
  'printHint', 'tip'];
/**
 * TEXT THE PAGE ASSERTS ON MUST COME FROM THE PAGE. The banner sentence is one of the things the
 * prototype checks by value ("the banner says it exactly"), so a skeleton that created an empty span
 * would have failed a real assertion for a reason that was the shim's fault. Both strings are lifted
 * out of index.html, which also means a change to the wording there cannot silently pass here.
 */
function pageText(id) {
  var re = new RegExp('id="' + id + '"[^>]*>([^<]*)<');
  var m = re.exec(SRC.index);
  if (!m) throw new Error('index.html has no text for #' + id);
  return m[1].trim();
}
/**
 * ATTRIBUTES THE PAGE ASSERTS ON, ALSO TAKEN FROM THE PAGE. The prototype checks that the print button
 * "says what it does" by reading its title, so the skeleton must carry the real one. Returning null for
 * an id that has no title is deliberate: it makes a missing attribute look like a missing attribute
 * rather than like an empty string somebody chose.
 */
function pageTitle(id) {
  var block = new RegExp('id="' + id + '"[\\s\\S]{0,200}?>').exec(SRC.index);
  if (!block) return null;
  var m = /title="([^"]*)"/.exec(block[0]);
  return m ? m[1] : null;
}
function pageClassText(cls) {
  var re = new RegExp('class="' + cls + '"[^>]*>([^<]*)<');
  var m = re.exec(SRC.index);
  if (!m) throw new Error('index.html has no text for .' + cls);
  return m[1].trim();
}
var PAGE_TREE = [
  ['div', 'banner', 'banner', [
    ['span', 'notice', 'notice', null, function () { return pageText('notice'); }],
    ['span', null, 'badge-demo', null, function () { return pageClassText('badge-demo'); }]]],
  ['div', 'shell', 'shell', [
    ['nav', 'side', 'side', [
      ['button', 'btnRail', 'railbtn'],
      ['ul', 'nav', 'nav'],
      ['button', 'btnPresent', 'act'],
      ['button', 'btnPrint', 'act']]],
    ['main', 'main', 'main', [
      ['header', 'topbar', 'topbar', [
        ['div', 'crumbs', 'crumbs'],
        ['span', 'stBadge', 'stbadge'],
        ['button', 'btnStDetail', 'linkbtn']]],
      ['section', 'scope', 'scope'],
      ['section', 'view', 'view'],
      ['section', 'selftest', 'selftest', [['div', 'stList', 'stlist']]],
      ['p', 'printHint', 'printhint']]]]],
  ['div', 'tip', 'tip']
];
function buildSkeleton(document, head, body, mk) {
  // the head, taken from the real index.html
  var scripts = SRC.index.match(/<script src="([^"]+)"><\/script>/g) || [];
  scripts.forEach(function (tag) {
    var n = mk('script');
    n.setAttribute('src', /src="([^"]+)"/.exec(tag)[1]);
    head.appendChild(n);
  });
  var links = SRC.index.match(/<link rel="stylesheet" href="([^"]+)">/g) || [];
  links.forEach(function (tag) {
    var n = mk('link');
    n.setAttribute('rel', 'stylesheet');
    n.setAttribute('href', /href="([^"]+)"/.exec(tag)[1]);
    head.appendChild(n);
  });
  (function place(spec, parent) {
    spec.forEach(function (s) {
      var n = mk(s[0]);
      if (s[1]) n.id = s[1];
      if (s[2]) n.className = s[2];
      if (s[1] === 'selftest' || s[1] === 'tip') n.hidden = true;
      parent.appendChild(n);
      if (s[4]) n.appendChild(document.createTextNode(s[4]()));
      if (s[1]) {
        var t = pageTitle(s[1]);
        if (t !== null) n.setAttribute('title', t);
      }
      if (s[3]) place(s[3], n);
    });
  }(PAGE_TREE, body));
}

/** Load the four files into one context and let boot() run, exactly as the browser would. */
function bootPage(mutateSrc) {
  var dom = makeDom(buildSkeleton);
  var sandbox = { console: { log: function () {}, error: function () {}, warn: function () {} } };
  var ctx = vm.createContext(sandbox);
  vm.runInContext('var window = this;', ctx);
  ctx.document = dom.document;
  ctx.Event = dom.Event;
  ctx.window = ctx;
  ctx.print = dom.window.print;
  var order = ['contract', 'selectors', 'fixture', 'prototype'];
  var thrown = null;
  try {
    order.forEach(function (k) {
      var src = SRC[k];
      if (mutateSrc) src = mutateSrc(k, src);
      vm.runInContext(src, ctx, { filename: k + '.js' });
    });
  } catch (e) { thrown = e; }
  return { ctx: ctx, dom: dom, thrown: thrown };
}

/** The page's own self-test verdict, read off the page the way a person reads it. */
function selfTestVerdict(p) {
  var badge = p.dom.document.getElementById('stBadge');
  var items = p.dom.document.getElementById('stList').childNodes.map(function (n) {
    return { ok: String(n.className).indexOf('st-ok') >= 0, text: n.textContent };
  });
  return {
    badge: badge ? badge.textContent : null,
    ok: items.filter(function (i) { return i.ok; }).length,
    bad: items.filter(function (i) { return !i.ok; }),
    total: items.length
  };
}

// ===================================================================================================
// A HANDLE ON THE PIPELINE, WITHOUT THE PAGE. The selectors are pure, so most of this suite needs no
// DOM at all — which is the whole reason they were moved out of the render file.
// ===================================================================================================
function pipeline() {
  var ctx = vm.createContext({ console: console });
  vm.runInContext(SRC.contract, ctx, { filename: 'data-contract.js' });
  vm.runInContext(SRC.selectors, ctx, { filename: 'selectors.js' });
  vm.runInContext(SRC.fixture, ctx, { filename: 'preview-fixture.js' });
  var C = vm.runInContext('PSB_CONTRACT', ctx);
  var F = vm.runInContext('PSB_PREVIEW', ctx);
  var S = vm.runInContext('PSB_SELECTORS', ctx);
  return { C: C, F: F, S: S, canon: F.PreviewProductStrategyDataAdapter.loadCanonical().rows };
}

module.exports = {
  ROOT: ROOT, PROTO: PROTO, SRC: SRC, readProto: readProto, bare: bare,
  makeDom: makeDom, buildSkeleton: buildSkeleton, bootPage: bootPage,
  selfTestVerdict: selfTestVerdict, pipeline: pipeline,
  PAGE_IDS: PAGE_IDS, PAGE_TREE: PAGE_TREE
};
