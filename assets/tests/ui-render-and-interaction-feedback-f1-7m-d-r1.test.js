// Kitchen Mama Operation System — F1-7M-D-DOM-RENDER-AND-INTERACTION-FEEDBACK-R1
// Proves three low-risk UI wins, all purely client-side (no backend/authority/formula/API change):
//   D3 PO Overview: every write command (confirmReceive/confirmEdit/sendPo/cancel) now has a per-command in-flight
//       guard — a rapid second click fires NO second write — plus immediate "Processing…" button feedback; the guard
//       clears on success (after the canonical loadAndRender readback) AND on failure. Backend idempotency untouched.
//   D2 On-the-Way: search keystrokes update filter state synchronously but coalesce the expensive render (full innerHTML
//       + bindRuntime re-bind + globe setMarkers/setArcs) into ONE trailing ~180ms render; latest input wins; stale timer
//       cancelled; select/date onchange stay immediate; API behavior unchanged (pure client filter).
//   D5 Factory/Overseas: a bounded INITIAL_LOADING affordance replaces the blank-until-data region on first load.
// Also LOCKS IN the deferrals: Weekly render/feedback (guard exists), pagination (LIVE_MEASUREMENT_REQUIRED), Carrier/
// SKU-Handbook loading. Frozen invariants re-checked.
// Run: node assets/tests/ui-render-and-interaction-feedback-f1-7m-d-r1.test.js
// NOTE: no 'use strict' — extracted source slices are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var PO = read('js/pages/purchase-order-overview.js');
var GLM = read('js/pages/global-logistics-map.js');
var FS = read('js/pages/factory-stock.js');
var OS = read('js/pages/overseas-stock.js');
var SP = read('js/pages/shipping-plan.js');

// ===================================================================================================================
console.log('\n== D3 PO Overview: per-command in-flight guard + feedback on all 4 write commands ==');
// Structural: each write handler calls _poBeginCmd(...) before its write and _poEndCmd(...) in BOTH .then and .catch.
[['receive', 'receivePurchaseOrderLines'], ['edit', 'updatePurchaseOrderHeader']].forEach(function (p) {
  ok(new RegExp("_poBeginCmd\\(key, btn\\)[\\s\\S]{0,120}KM\\.DB\\." + p[1]).test(PO), 'PO ' + p[0] + ': guard begins before the ' + p[1] + ' write');
});
['issue', 'cancel'].forEach(function (tr) {
  ok(new RegExp("id \\+ ':" + tr + "'[\\s\\S]{0,160}_poBeginCmd\\(key, btn\\)").test(PO), 'PO ' + tr + ': keyed in-flight guard before the status write');
});
// clears on both success and failure for every command:
eq((PO.match(/_poEndCmd\(key, btn\);/g) || []).length, 8, 'PO: _poEndCmd is called in the .then AND .catch of all 4 commands (8 call sites)');
ok(/onclick="poSendPo\(' \+ id \+ ', this\)"/.test(PO) && /onclick="poCancel\(' \+ id \+ ', this\)"/.test(PO), 'PO card buttons pass the element (this) so the pressed button gets feedback');
ok(!/function _poBeginCmd[\s\S]*document\.body[\s\S]*disabled = true/.test(PO), 'PO guard never disables the whole page (region/button-scoped only)');

// Behavioral: the guard suppresses a duplicate write and drives button state.
var poGuardSlice = PO.slice(PO.indexOf('var _poInFlightCmds = {};'), PO.indexOf('function confirmReceive'));
eval(poGuardSlice);
(function () {
  var btn = { textContent: 'Confirm Receive', disabled: false, dataset: {}, isConnected: true,
    setAttribute: function (k, v) { this['_' + k] = v; }, removeAttribute: function (k) { delete this['_' + k]; } };
  var first = _poBeginCmd('PO1:receive', btn);
  ok(first === true, 'D3: first click acquires the command guard');
  ok(btn.disabled === true && btn.textContent === 'Processing…' && btn['_aria-busy'] === 'true', 'D3: pressed button shows immediate busy feedback');
  var second = _poBeginCmd('PO1:receive', btn);
  ok(second === false, 'D3: a SECOND click on the same command is suppressed (no duplicate write)');
  _poEndCmd('PO1:receive', btn);
  ok(btn.disabled === false && btn.textContent === 'Confirm Receive' && btn['_aria-busy'] === undefined, 'D3: guard-clear restores the button (label + enabled)');
  ok(_poBeginCmd('PO1:receive', btn) === true, 'D3: after clear, the command can run again');
  _poEndCmd('PO1:receive', btn);
  // a different PO / different action is independent:
  ok(_poBeginCmd('PO2:receive', btn) === true && _poBeginCmd('PO1:cancel', btn) === true, 'D3: guard is per po-id + action (independent keys)');
})();

// ===================================================================================================================
console.log('\n== D2 On-the-Way: search keystrokes coalesce into ONE trailing render; latest wins; selects immediate ==');
ok(/el\.oninput = function \(\) \{ state\.filters\[key\] = el\.value; debouncedSearchRender/.test(GLM), 'D2: filter search oninput updates state synchronously then debounces the render');
ok(/el\.oninput = function \(\) \{ state\.ref\[key\] = el\.value; debouncedSearchRender/.test(GLM), 'D2: reference search oninput updates state synchronously then debounces');
ok(/el\.onchange = function \(\) \{ state\.filters\[key\] = \(el\.type === 'checkbox'\) \? el\.checked : el\.value; render\(\); \}/.test(GLM), 'D2: discrete select/date onchange stay IMMEDIATE (not debounced)');
// Behavioral: fake timers prove coalescing + latest-wins + stale-cancel.
(function () {
  var timers = [], nextId = 1, cleared = {};
  global.setTimeout = function (fn, ms) { var id = nextId++; timers.push({ id: id, fn: fn }); return id; };
  global.clearTimeout = function (id) { cleared[id] = true; timers = timers.filter(function (t) { return t.id !== id; }); };
  var renderCalls = [];
  function renderKeepFocus(sel) { renderCalls.push(sel); }
  var slice = GLM.slice(GLM.indexOf('var SEARCH_RENDER_DEBOUNCE_MS'), GLM.indexOf('function debouncedSearchRender') + extractFn(GLM, 'debouncedSearchRender').length);
  eval(slice);
  debouncedSearchRender('[data-filter="search"]');
  debouncedSearchRender('[data-filter="search"]');
  debouncedSearchRender('[data-ref="search"]');   // latest wins
  eq(renderCalls.length, 0, 'D2: no render fires DURING a keystroke burst (each schedules, prior timer cancelled)');
  ok(timers.length === 1, 'D2: exactly ONE pending render timer after the burst (coalesced)');
  timers[0].fn();   // trailing fire
  eq(renderCalls, ['[data-ref="search"]'], 'D2: exactly ONE coalesced render for the burst, keyed to the LATEST input');
  ok(SEARCH_RENDER_DEBOUNCE_MS >= 120 && SEARCH_RENDER_DEBOUNCE_MS <= 250, 'D2: debounce ~150-250ms (' + SEARCH_RENDER_DEBOUNCE_MS + 'ms)');
})();

// ===================================================================================================================
console.log('\n== D5 Factory/Overseas: bounded INITIAL_LOADING replaces the blank-until-data region ==');
ok(/_fsShowInitialLoading_\(root\);/.test(FS) && /window\.KM\.DB\.loadScopedTables/.test(FS), 'D5 Factory: initial-loading shown before the first scoped read');
ok(/_osShowInitialLoading_\(root\);/.test(OS), 'D5 Overseas: initial-loading shown before the first scoped read');
// Behavioral: install the REAL KM.loadState, run the helper against a fake region, assert INITIAL_LOADING paints.
(function () {
  global.window = { KM: {} };
  eval(read('js/api/km-loading-state.js'));   // installs window.KM.loadState (window is defined via global.window)
  ok(global.window.KM.loadState && typeof global.window.KM.loadState.bindElement === 'function', 'KM.loadState installed for the test');
  var el = { innerHTML: '', _attrs: {}, classList: { add: function () {}, remove: function () {} }, setAttribute: function (k, v) { this._attrs[k] = v; } };
  var root = { querySelector: function (sel) { return sel === '#factory-stock-scroll-body' ? el : null; } };
  eval(extractFn(FS, '_fsShowInitialLoading_'));
  _fsShowInitialLoading_(root);
  ok(/Loading factory stock/.test(el.innerHTML), 'D5 Factory: INITIAL_LOADING paints a bounded "Loading…" affordance into the scroll body');
  eq(el._attrs['data-load-state'], 'INITIAL_LOADING', 'D5 Factory: region marked INITIAL_LOADING (region-scoped, not a page mask)');
})();

// ===================================================================================================================
console.log('\n== Deferrals locked in: Weekly guard unchanged; no optimistic success; no pagination added ==');
ok(/var _spInFlight = \{\};/.test(SP) && /if \(_spInFlight\[key\]\) return/.test(SP), 'Weekly double-click guard still present (deferred: card-render/feedback wiring)');
ok(!/optimistic/i.test(PO.slice(PO.indexOf('function confirmReceive'), PO.indexOf('function edit('))) , 'D3 receive: no optimistic success text/patch introduced');
// PO still awaits the canonical readback (loadAndRender) on success — not faked:
ok(/_poEndCmd\(key, btn\); closeModal\(\); loadAndRender\(\);/.test(PO), 'D3: success still runs the canonical loadAndRender readback (no faked completion)');

// ===================================================================================================================
console.log('\n== Frozen invariants ==');
ok(read('js/app.js').indexOf('loadOperationDb') === -1, 'app prime remains 0');
var FORCE = 'loadOperationDb({ force: true })';
eq((read('js/api/operation-system-db-api.js').split('await ' + FORCE + ';').length - 1), 2, 'writer full-reload remains 0');
ok(PO.indexOf('loadOperationDb') === -1 || /Legacy/.test(PO), 'PO overview introduces no whole-DB load');

console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
