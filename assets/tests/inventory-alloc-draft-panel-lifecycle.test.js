// Kitchen Mama Operation System — Allocation Draft persistence panel lifecycle guard (UI, Round 4).
// Run: node assets/tests/inventory-alloc-draft-panel-lifecycle.test.js
// -----------------------------------------------------------------------------
// The persistent cream top strip was #alloc-draft-persistence-panel appended to <body>: _ensureAllocDraftPanel's
// host lookup targeted #inventory-replenishment / .inventory-replenishment (which DO NOT EXIST) and fell back to
// document.body, so the bg-less 128px panel sat in body flow on EVERY page and pushed .app-layout down (body cream
// #FFF8F0 showed through it). It was also opened with a false SAVE_FAILED before a valid Country/Marketplace scope
// existed (the initial load fired a readback on an incomplete scope).
//
// This guard (no browser layout engine in Node — round §8 fallback) EXECUTES the real extracted lifecycle helpers
// against a fake DOM (panel attaches to the Inventory page root, never body; legacy body node migrates; fail-closed
// with no page root) + source-scans the ownership fix, the incomplete-scope guard, unmount removal, and the
// secondary body-level CSS fail-safe. No Sheet/DB/API, no network, no writes.

'use strict';
var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function strip(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }

var IR = read('js/pages/inventory-replenishment.js');
var IR_CODE = strip(IR);
var CSS = strip(read('css/layout.css'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =====================================================================================================
section('A. Panel host is the Inventory page root — NEVER document.body');
ok(/getElementById\('opsSection'\)\s*\|\|\s*document\.getElementById\('ops-section'\)/.test(IR_CODE),
  'A1 _ensureAllocDraftPanel host = #opsSection / #ops-section (the real Inventory page root)');
ok(!/getElementById\('inventory-replenishment'\)/.test(IR_CODE) && !/querySelector\('\.inventory-replenishment'\)/.test(IR_CODE),
  'A2 the non-existent #inventory-replenishment / .inventory-replenishment host lookups are gone');
// The panel-ensure function must never fall back to document.body.
var ensureBlock = IR.slice(IR.indexOf('function _ensureAllocDraftPanel'), IR.indexOf('// Truthful persistence panel'));
ok(!/\|\|\s*document\.body/.test(ensureBlock) && !/host\s*=\s*[^;]*document\.body/.test(ensureBlock),
  'A3 _ensureAllocDraftPanel never falls back to document.body (fail-closed instead)');
ok(/if \(!host\)\s*\{[^}]*return null/.test(ensureBlock), 'A4 fail-closed: returns null when the page root is absent (panel never orphaned to body)');

section('B. Incomplete scope is not a persistence failure (§4)');
ok(/function _allocDraftScopeComplete/.test(IR_CODE), 'B1 a scope-completeness guard exists');
ok(/if \(!ws \|\| !_allocDraftScopeComplete\(scope\)\) return;/.test(IR_CODE), 'B2 _allocDraftInitialLoad returns early on an incomplete scope (no readback → no false SAVE_FAILED)');
ok(!/getOperationDb/.test(ensureBlock) && /getShippingAllocationDraftWorkspace/.test(IR_CODE), 'B3 targeted readback only (getShippingAllocationDraftWorkspace) — no whole-DB reload added');

section('C. Lifecycle cleanup + legacy migration + secondary CSS fail-safe (§3/§5/§6)');
ok(/function _removeLegacyBodyAllocPanel/.test(IR_CODE) && /querySelector\('body > #alloc-draft-persistence-panel'\)/.test(IR_CODE), 'C1 legacy body-level cleanup helper targets ONLY body > #alloc-draft-persistence-panel');
var unmountBlock = IR.slice(IR.indexOf("console.log('[Replenishment] unmount')"), IR.indexOf("console.log('[Replenishment] unmount')") + 600);
ok(/getElementById\('alloc-draft-persistence-panel'\)[\s\S]*?\.remove\(\)/.test(unmountBlock) && /_removeLegacyBodyAllocPanel\(\)/.test(unmountBlock), 'C2 Inventory unmount removes the panel + sweeps any legacy body node');
ok(/body > #alloc-draft-persistence-panel\s*\{\s*display:\s*none\s*!important/.test(CSS), 'C3 secondary CSS fail-safe collapses a body-level instance (never a page-local one)');
ok(!/#alloc-draft-persistence-panel\s*\{\s*display:\s*none/.test(CSS.replace(/body > #alloc-draft-persistence-panel\s*\{\s*display:\s*none\s*!important;?\s*\}/, '')), 'C4 the fail-safe is scoped to body-level only (does not hide all .alloc-draft-panel / page-local panels)');

// =====================================================================================================
section('D. Execute the REAL panel-ownership helpers against a fake DOM');
function makeDom() {
  var byId = {};
  function Node(tag) { this.tag = tag; this._id = ''; this.className = ''; this.children = []; this.parentElement = null; this.attrs = {}; }
  Node.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  Object.defineProperty(Node.prototype, 'id', { get: function () { return this._id; }, set: function (v) { this._id = v; if (v) byId[v] = this; } });
  Object.defineProperty(Node.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
  Node.prototype._detach = function (c) { var i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentElement = null; };
  Node.prototype.insertBefore = function (el, ref) {
    if (el.parentElement) el.parentElement._detach(el);
    if (ref == null) this.children.push(el); else { var i = this.children.indexOf(ref); if (i < 0) this.children.push(el); else this.children.splice(i, 0, el); }
    el.parentElement = this; return el;
  };
  Node.prototype.remove = function () { if (this.parentElement) this.parentElement._detach(this); if (this._id && byId[this._id] === this) delete byId[this._id]; };
  var body = new Node('body');
  var doc = {
    getElementById: function (id) { return byId[id] || null; },
    createElement: function (tag) { return new Node(tag); },
    querySelector: function (sel) {
      if (sel === 'body > #alloc-draft-persistence-panel') { for (var i = 0; i < body.children.length; i++) if (body.children[i]._id === 'alloc-draft-persistence-panel') return body.children[i]; return null; }
      return null;
    }
  };
  return { doc: doc, body: body, mkSection: function () { var s = new Node('div'); s.id = 'opsSection'; body.insertBefore(s, null); return s; } };
}
// Extract the REAL helpers (not a re-implementation) and bind them to the fake document via closure.
var helperSrc = IR.slice(IR.indexOf('function _removeLegacyBodyAllocPanel'), IR.indexOf('// Truthful persistence panel'));
var scopeSrc = IR.slice(IR.indexOf('function _allocDraftScopeComplete'), IR.indexOf('// Initial targeted load'));
function loadHelpers(doc) {
  return (function (document) {
    return eval(helperSrc + scopeSrc + '\n;({ ensure: _ensureAllocDraftPanel, removeLegacy: _removeLegacyBodyAllocPanel, scopeComplete: _allocDraftScopeComplete });');
  })(doc);
}

// D1 — with the page root present, the panel attaches INSIDE it, never body.
(function () {
  var dom = makeDom(); var ops = dom.mkSection();
  var api = loadHelpers(dom.doc);
  var el = api.ensure();
  ok(el && el.parentElement === ops, 'D1 panel is created inside #opsSection (the page root)');
  ok(dom.doc.querySelector('body > #alloc-draft-persistence-panel') === null, 'D2 no body-level panel exists');
  ok(el.attrs.role === 'status' && el.attrs['aria-live'] === 'polite', 'D3 role=status + aria-live=polite preserved');
  var el2 = api.ensure();
  ok(el2 === el && ops.children.filter(function (c) { return c._id === 'alloc-draft-persistence-panel'; }).length === 1, 'D4 re-calling reuses ONE panel (no duplicate node/id)');
})();

// D5 — a legacy body-level panel is MIGRATED into the page root (not duplicated, not left on body).
(function () {
  var dom = makeDom();
  var legacy = dom.doc.createElement('div'); legacy.id = 'alloc-draft-persistence-panel'; dom.body.insertBefore(legacy, null);
  var ops = dom.mkSection();
  var api = loadHelpers(dom.doc);
  var el = api.ensure();
  ok(el === legacy && el.parentElement === ops, 'D5 legacy body node migrated into #opsSection (same node, reparented)');
  ok(dom.doc.querySelector('body > #alloc-draft-persistence-panel') === null, 'D6 no body-level panel remains after migration');
})();

// D7 — fail-closed: no page root → returns null, never creates a body-level node; legacy body node is swept.
(function () {
  var dom = makeDom();
  var legacy = dom.doc.createElement('div'); legacy.id = 'alloc-draft-persistence-panel'; dom.body.insertBefore(legacy, null);
  var api = loadHelpers(dom.doc);
  var el = api.ensure();
  ok(el === null, 'D7 _ensureAllocDraftPanel returns null when the page root is absent (never orphans to body)');
  ok(dom.doc.querySelector('body > #alloc-draft-persistence-panel') === null, 'D8 the stale legacy body node is swept when there is no page root');
})();

// D9 — scope completeness gate (drives the no-false-SAVE_FAILED behavior).
(function () {
  var api = loadHelpers(makeDom().doc);
  ok(api.scopeComplete({ planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }) === true, 'D9 a complete K3 scope is complete → the single targeted read is allowed');
  ok(api.scopeComplete({ planning_cycle: '2026-W40', company: 'KM', country: '', marketplace: '' }) === false, 'D10 an incomplete scope is NOT complete → no readback, no false SAVE_FAILED');
  ok(api.scopeComplete(null) === false && api.scopeComplete({}) === false, 'D11 null/empty scope is not complete');
})();

// =====================================================================================================
console.log('\n----------------------------------------');
console.log('ALLOC-DRAFT PANEL LIFECYCLE GUARD (Round 4): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
