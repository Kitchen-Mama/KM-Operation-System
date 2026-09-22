// Kitchen Mama Operation System — INCIDENT-BOOT-FC-R1
// A RETRY THAT SAYS IT RECOVERED HAS TO HAVE RECOVERED
// Run: node assets/tests/fc-retry-canonical-hydration-boot-fc-r1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script. It runs the REAL page functions extracted from
// fc-summary.js against a DOM shim and a scripted workspace response, and drives the REAL state machine.
//
// WHAT THE OPERATOR SAW. FC Summary loaded for a long time, refused with REDIRECT_TARGET_NOT_FOUND, and
// pressing Retry made the refusal disappear — leaving Year at `----`, the filters empty and the table
// saying "Please select a year to view data". It looked like the data had come back empty.
//
// WHAT IT ACTUALLY WAS. The cold load ran `_fcWorkspaceRefresh_().then(afterLoad)`, where afterLoad is
// three things: populate the filters, populate the Year options, render the tables. Retry ran
// `.then(... _fcRerenderTables_())` — only the third. So the read model WAS installed and the rows WERE
// re-rendered against it, but the Year <select> still held the single `----` option built while the model
// was null, and a table whose year filter is '' renders the empty-state string. The banner was cleared
// unconditionally, before any of it, so a page with no year choices was presented as recovered.
//
// The data was never missing. The page simply never asked itself whether it had finished loading.
//
// A SECOND, QUIETER HOLE, FOUND WHILE PROVING THE FIRST. `KM.DB.adaptFcSummaryWorkspace` is TOTAL: it
// answers `data || {}` and `(data.x || [])`, so ANY object adapts to four empty arrays without complaint.
// A `success:true` envelope carrying the wrong payload would therefore have installed a silent empty model
// indistinguishable from a genuinely empty database. Section C proves the adapter really is that
// permissive (by reading it) and then proves the page no longer relies on it to tell the difference.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var JS_REL = 'assets/js/pages/fc-summary.js';
var DBAPI_REL = 'assets/js/api/operation-system-db-api.js';
var APP_REL = 'assets/js/app.js';
var HOME_REL = 'assets/js/pages/home.js';
var JS = read(JS_REL);

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) pass++; else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) pass++; else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 96 - n.length)).join('-')); }

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
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
/** The executable part of a file — the comments here QUOTE the defect they explain, so a raw scan of
 *  the source would read the explanation as the bug. */
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

// =================================================================================================
// A DOM SHIM THAT UNDERSTANDS <select>
// The defect IS the Year <select>, so a shim that cannot hold options could not observe it. Setting
// innerHTML on a select parses its <option> tags, exactly as the page's populate function expects.
// =================================================================================================
function makeDom() {
  var byId = {};
  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
      attrs: {}, style: {}, _text: '', className: '', _id: '', hidden: false, _html: '',
      options: [], _value: '', _listeners: {},
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; }
      },
      setAttribute: function (k, v) { e.attrs[k] = String(v); if (k === 'id') { e.id = String(v); } },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      addEventListener: function (t, fn) { (e._listeners[t] = e._listeners[t] || []).push(fn); },
      dispatch: function (t, ev) { (e._listeners[t] || []).forEach(function (fn) { fn(ev || {}); }); },
      appendChild: function (c) { c.parentNode = e; e.children.push(c); return c; },
      removeChild: function (c) { var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1); return c; },
      querySelector: function (s) { var r = e.querySelectorAll(s); return r.length ? r[0] : null; },
      querySelectorAll: function (sel) {
        var want = String(sel).trim(), out = [];
        function matches(n) {
          if (want.charAt(0) === '.') return n.classList.contains(want.slice(1));
          if (want.charAt(0) === '#') return n.id === want.slice(1);
          return n.tagName === want.toUpperCase();
        }
        (function walk(n) { n.children.forEach(function (c) { if (matches(c)) out.push(c); walk(c); }); })(e);
        return out;
      }
    };
    Object.defineProperty(e, 'id', {
      get: function () { return e._id; },
      set: function (v) { e._id = String(v); e.attrs.id = String(v); byId[e._id] = e; }
    });
    Object.defineProperty(e, 'textContent', {
      get: function () { return e._text || e.children.map(function (c) { return c.textContent; }).join(''); },
      set: function (v) { e._text = String(v); e.children = []; }
    });
    Object.defineProperty(e, 'value', {
      get: function () { return e._value; },
      // A <select> can only hold a value one of its options offers. Accepting anything else would let a
      // test claim a year is selected that the operator could never have chosen.
      set: function (v) {
        var s = String(v);
        if (e.tagName !== 'SELECT') { e._value = s; return; }
        e._value = (s === '' || e.options.some(function (o) { return o.value === s; })) ? s : e._value;
      }
    });
    Object.defineProperty(e, 'innerHTML', {
      get: function () { return e._html; },
      set: function (v) {
        e._html = String(v); e.children = []; e.options = [];
        var re = /<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g, m;
        while ((m = re.exec(e._html))) e.options.push({ value: m[1], text: m[2] });
        if (e.tagName === 'SELECT' && !e.options.some(function (o) { return o.value === e._value; })) e._value = '';
      }
    });
    return e;
  }
  var document = {
    body: El('body'),
    createElement: El,
    getElementById: function (id) { return byId[id] || null; }
  };
  return { document: document, El: El, byId: byId };
}

// =================================================================================================
section('A. THE DIAGNOSIS IS ABOUT THE SHIPPED SOURCE');
// =================================================================================================
var CODE = codeOnly(JS);
ok(CODE.indexOf('function _fcHydrateFromModel_') > -1, 'A1 the page has ONE named hydration authority');
ok(CODE.indexOf('function _fcValidWorkspaceData_') > -1, 'A2 and a payload validator that runs before the adapter');
ok(CODE.indexOf('function _fcValidReadModel_') > -1, 'A3 and a read-model validator that runs before the commit');

// The cold load must not keep its own private copy of "what loading means".
var afterLoad = /var afterLoad\s*=\s*([^;]+);/.exec(CODE);
ok(!!afterLoad, 'A4 the cold load path still names its continuation');
eq((afterLoad ? afterLoad[1] : '').trim(), '_fcHydrateFromModel_',
  'A5 §4A the cold load delegates to the hydration authority rather than restating it');

// Exactly one assignment of the read model from an adapted payload, and it is not the adapter call itself.
// FC-SUMMARY-R3-R1 — the commit site moved out of the full-workspace read (which no longer exists) and
// into _fcMergeSlice_, the one function that writes the read model. Asserting it of the WHOLE FILE rather
// than of one function is stronger than the original: it also catches a second writer appearing anywhere.
var adaptAssign = JS.split('_fcReadModel = window.KM.DB.adapt').length - 1;
eq(adaptAssign, 0, 'A6 §4A an adapter result is never assigned straight into the read model');
var merge = extractFn(JS, '_fcMergeSlice_');
ok(/_fcReadModel\[k\] = adapted\[k\]/.test(merge),
  'A7 §4A the read model is committed in _fcMergeSlice_, key by key, from adapted rows');
var writers = (JS.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
  .match(/_fcReadModel(\[[^\]]+\])?\s*=[^=]/g) || []);
// The FOUR assignments that are allowed, and there are no others: the declaration; _fcMergeSlice_'s lazy
// {} when the first slice lands; _fcMergeSlice_'s per-key write; and _fcRenderError_ nulling it on a cold
// refusal. Anything beyond these is a second authority over the model.
eq(writers.length, 4, 'A7a §4A and nothing else in the file writes the read model', writers);

// The three hydration steps live together, in order.
var hyd = extractFn(JS, '_fcHydrateFromModel_');
var iFilters = hyd.indexOf('_populateFcFilterOptionsFromDb');
var iYear = hyd.indexOf('_populateFcYearFromDb');
var iRows = hyd.indexOf('renderFcRegularTable');
ok(iFilters > -1 && iYear > -1 && iRows > -1, 'A8 the authority populates filters, Year and rows');
ok(iFilters < iYear && iYear < iRows, 'A9 and in that order — options before the render that reads them');
ok(hyd.indexOf('catch') === -1,
  'A10 §4A it does NOT swallow exceptions; a caller that cannot hydrate must keep its refusal');

// =================================================================================================
section('B. THE RETRY PATH — ORDER OF COMMITMENT');
// =================================================================================================
var refresh = extractFn(JS, '_fcRefreshViewNow_');
var rHyd = refresh.indexOf('_fcHydrateFromModel_()');
var rCur = refresh.indexOf('FC_VIEW_.CURRENT');
var rClr = refresh.indexOf('_fcClearBanner_()');
ok(rHyd > -1, 'B1 §4A Retry runs the hydration authority');
ok(rHyd < rCur, 'B2 §4A it hydrates BEFORE declaring the view current');
ok(rCur < rClr, 'B3 §4A and clears the refusal LAST');
ok(refresh.indexOf('_fcRerenderTables_') === -1,
  'B4 §3 Retry no longer uses the rows-only shortcut that caused this');
ok(refresh.indexOf('if (_fcReadbackFlight_) return;') > -1, 'B5 the single-flight latch is intact');

// The post-write readback answers to the same authority, or a write that introduces a new year leaves it
// out of the dropdown until the next reload.
// The function body, not a fixed byte count: Stage B grew past the 1600 characters this used to cut,
// which made a true assertion fail for a reason that had nothing to do with what it asserts.
var afterWrite = extractFn(JS, '_fcAfterWrite');
ok(afterWrite.indexOf('_fcHydrateFromModel_()') > -1,
  'B6 the post-write readback hydrates through the same authority');
ok(/_fcSliceFetch_\(_slice\)/.test(afterWrite),
  'B6a and it reads ONE named slice rather than the whole workspace');

// =================================================================================================
section('C. THE ADAPTER IS TOTAL — PROVEN, THEN NO LONGER TRUSTED TO CLASSIFY');
// =================================================================================================
// The stub used below must be faithful to the real adapter, so the real one is read first. If it ever
// stops being total, this assertion fails and the stub must be revisited rather than silently diverge.
var ADAPT = extractFn(read(DBAPI_REL).slice(read(DBAPI_REL).indexOf('window.KM.DB.adaptFcSummaryWorkspace')
  .valueOf() - 0).replace('window.KM.DB.adaptFcSummaryWorkspace = function', 'function adaptFcSummaryWorkspace'),
  'adaptFcSummaryWorkspace');
ok(/data\s*=\s*data\s*\|\|\s*\{\}/.test(ADAPT), 'C1 the real adapter coerces any falsy payload to {}');
ok((ADAPT.match(/\|\|\s*\[\]\)/g) || []).length >= 4,
  'C2 and every canonical table to [] — so it can never report an unreadable payload');
ok(ADAPT.indexOf('throw') === -1, 'C3 it throws for nothing; classification cannot live there');

// =================================================================================================
section('D. THE REAL STATE MACHINE, DRIVEN');
// =================================================================================================
var VARS = [
  // FC-SUMMARY-R3-R1 — the read paths name a SLICE now, so the slice vocabulary has to be here for
  // _fcAfterWrite and _fcRefreshViewNow_ to resolve. Nothing this section asserts changes.
  'FC_SLICE_', 'FC_FRESH_', '_FC_TAB_SLICE_', '_FC_SLICE_KEYS_', '_FC_MODEL_KEYS_', '_fcSliceState_',
  'FC_VIEW_', 'FC_MSG_', 'FC_RETRY_', 'FC_RETRY_LABEL_',
  // A3-R10 §14.2 — _fcSliceFetch_ checks the model generation at its commit point.
  '_fcModelGen_', '_fcInvalidateReason_',
  // INCIDENT-BOOT-FC-R1 §4D — the stage vocabulary the refusal banner names.
  'FC_STAGE_', 'FC_UNREADABLE_CODES_',
  '_fcViewState_', '_fcReadbackFlight_',
  '_fcReadbackLoads_', '_fcReadModel', '_fcCandidateYears_', '_fcReadSeq', '_fcMeta_'];
var FNS = ['_fcRetryLabel_', '_fcErrDetail_', '_fcBannerHost_', '_fcClearBanner_', '_fcShowBanner_',
  '_fcEpoch_', '_fcOwns_', '_fcNoteEnvMeta_', '_fcHas_', '_fcWorkspaceMode_', '_fcEffectiveWorkspace',
  '_fcGetRegularForecast', '_fcValidWorkspaceData_',
  '_fcValidReadModel_', '_fcYearsOf_', '_fcFailureStage_', '_fcStageText_',
  '_fcHydrateFromModel_', '_populateFcYearFromDb',
  // The slice helpers the read paths resolve. _fcSliceFetch_ stays in the list because this sandbox
  // drives the REAL one against an injected KM.api.
  '_fcTabNow_', '_fcWorkspaceMode_', '_fcHas_', '_fcSliceHasData_', '_fcSliceRec_', '_fcMergeSlice_',
  '_fcFailedSlices_', '_fcEffectiveWorkspace',
  '_populateFcFilterOptionsFromDb', '_fcRerenderTables_', '_fcSliceFetch_', '_fcRefreshViewNow_',
  '_fcRenderError_', '_fcEscapeHtml',
  '_fcModelGenNow_', '_fcInvalidateModel_'];

function rows(year, n) {
  var out = [];
  for (var i = 0; i < (n || 1); i++) out.push({ forecastId: 'F' + year + '-' + i, sku: 'SKU' + i, year: String(year) });
  return out;
}
function envOk(data) { return { success: true, data: data, meta: { action: 'fcSummary.workspace.get' } }; }

/**
 * @param opts.script  array of responses, one per read: an envelope object, or 'fail' to reject with a
 *                     REDIRECT_TARGET_NOT_FOUND exactly as the transport reports it.
 * @param opts.src     an already-mutated fc-summary.js source (mutation testing).
 */
function build(opts) {
  opts = opts || {};
  var src = opts.src || JS;
  var dom = makeDom();
  var banner = dom.El('div'); banner.id = 'fc-view-banner'; dom.document.body.appendChild(banner);
  var sel = dom.El('select'); sel.id = 'fc-year-select'; dom.document.body.appendChild(sel);
  ['fc-regular-scroll-body', 'fc-event-scroll-body', 'fc-regular-fixed-body', 'fc-event-fixed-body']
    .forEach(function (id) { var d = dom.El('div'); d.id = id; dom.document.body.appendChild(d); });

  var reads = [], writes = [], renders = [], filterSyncs = [];
  var ctx = {
    console: console, window: null, document: dom.document,
    Date: Date, Promise: Promise, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, RegExp: RegExp, Error: Error,
    __reads: reads, __writes: writes, __renders: renders, __filterSyncs: filterSyncs, __dom: dom
  };
  ctx.window = ctx;
  var epoch = { n: 1 };
  ctx.window.KM = {
    transport: null,
    lifecycle: {
      currentEpoch: function () { return epoch.n; },
      commitGuard: function (e, s) { return e === epoch.n && s === 'fc-summary-section'; }
    },
    DB: {
      // Faithful to the real adapter, whose totality section C proved by reading it.
      adaptFcSummaryWorkspace: function (data) {
        data = data || {};
        return {
          fcRegularForecast: (data.fcRegularForecast || []).slice(),
          fcSpecialEvents: (data.fcSpecialEvents || []).slice(),
          fcTargetRules: (data.fcTargetRules || []).slice(),
          marketplaces: (data.marketplaces || []).slice()
        };
      },
      // FC-SUMMARY-R3-R1 — the read path calls the SLICE adapter now. Faithful to the real one in the
      // respect that matters: a key the payload did not carry is ABSENT, never [], because [] would
      // claim the server looked and found nothing.
      adaptFcSummaryWorkspaceSlice: function (data) {
        data = data || {};
        var out = {};
        ['fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces'].forEach(function (k) {
          if (Array.isArray(data[k])) out[k] = data[k].slice();
        });
        if (data.facets) out.facets = data.facets;
        if (data.observed_at) out.observedAt = String(data.observed_at);
        if (data.slice) out.slice = String(data.slice);
        return out;
      }
    },
    api: {
      getWorkspace: function () {
        var step = Math.min(reads.length, opts.script.length - 1);
        var mode = opts.script[step];
        reads.push(mode === 'fail' ? 'fail' : 'ok');
        if (mode === 'fail') {
          return Promise.reject({ code: 'REDIRECT_TARGET_NOT_FOUND',
            message: 'The API redirect target had already expired' });
        }
        return Promise.resolve(mode);
      }
    },
    loadState: { STATES: { READY: 'READY', EMPTY: 'EMPTY', ERROR: 'ERROR' } }
  };
  ctx.__unmount = function () { epoch.n += 1; };
  vm.createContext(ctx);

  var pieces = [];
  VARS.forEach(function (n) { pieces.push(extractVar(src, n)); });
  FNS.forEach(function (n) { pieces.push(extractFn(src, n)); });
  pieces.push('var _fcPageEpoch_ = 1;');
  pieces.push('function _fcRegion_() { return null; }');
  // The stub has to be at least as robust as the function it stands in for. The real _fcSyncFilterOptions
  // reads through _getDbFcRegularData/_fcGetMarketplaces, which tolerate a dataset that is not loaded; this
  // one dereferenced .marketplaces unconditionally and threw, which turned a merged-but-empty model into a
  // refusal and made M1 look like it had been caught when nothing had caught it.
  pieces.push('function _fcSyncFilterOptions() { __filterSyncs.push((_fcReadModel && _fcReadModel.marketplaces) ? _fcReadModel.marketplaces.length : -1); }');
  pieces.push('function renderFcRegularTable() { __renders.push("regular"); }');
  pieces.push('function renderFcEventTable() { __renders.push("event"); }');
  pieces.push('function renderTargetRulesTable() { __renders.push("target"); }');
  vm.runInContext(pieces.join('\n'), ctx, { filename: 'fc-boot-r1.js' });

  ctx.__years = function () { return ctx.document.getElementById('fc-year-select').options.map(function (o) { return o.value; }); };
  ctx.__bannerText = function () {
    var h = ctx.document.getElementById('fc-view-banner'), t = '';
    h.children.forEach(function (c) { if (c.tagName === 'SPAN') t = c.textContent; });
    return t;
  };
  ctx.__banner = function () {
    var h = ctx.document.getElementById('fc-view-banner'), btn = null;
    h.children.forEach(function (c) { if (c.tagName === 'BUTTON') btn = c; });
    return { hidden: h.hidden, shown: h.children.length > 0, label: btn ? btn.textContent : null, button: btn };
  };
  return ctx;
}
function tick(n) { return new Promise(function (r) { var i = 0; (function step() { i++; i >= (n || 6) ? r() : setTimeout(step, 0); })(); }); }

// =================================================================================================
section('E. §6.1-6.12 — THE REQUIRED MATRIX');
// =================================================================================================
(async function () {

  // --- 6.1 cold load + valid non-empty -----------------------------------------------------------
  var c1 = build({ script: [envOk({ fcRegularForecast: rows(2026, 3).concat(rows(2025, 2)), marketplaces: [{ marketplaceId: 'M1' }] })] });
  await c1._fcRefreshViewNow_(c1.FC_MSG_.READ_FAILED, c1.FC_RETRY_.COLD_READ); await tick();
  eq(c1.__years(), ['', '2026', '2025'], 'E1 §6.1 a valid non-empty load populates the real Year options');
  eq(c1._fcViewState_, c1.FC_VIEW_.CURRENT, 'E2 §6.1 and the view is current');
  eq(c1.__renders, ['regular', 'event', 'target'], 'E3 §6.1 all three tables rendered');
  ok(!c1.__banner().shown, 'E4 §6.1 no refusal is on screen');

  // --- 6.2 cold load + typed redirect refusal -----------------------------------------------------
  var c2 = build({ script: ['fail'] });
  c2._fcReadModel = null;
  c2._fcRefreshViewNow_(c2.FC_MSG_.READ_FAILED, c2.FC_RETRY_.COLD_READ); await tick();
  eq(c2.__banner().label, 'Retry', 'E5 §6.2 the refusal offers a control labelled "Retry"');
  eq(c2._fcViewState_, c2.FC_VIEW_.REFUSED, 'E6 §6.2 REFUSED — never "loaded empty"');
  ok(c2._fcReadModel === null, 'E7 §6.2 no model was committed');
  eq(c2.__years(), [], 'E8 §6.2 and no year was invented');

  // --- 6.3 refusal -> Retry -> valid data: selectors AND table recover together --------------------
  var c3 = build({ script: ['fail', envOk({ fcRegularForecast: rows(2026, 4), marketplaces: [{ marketplaceId: 'M1' }] })] });
  c3._fcReadModel = null;
  c3._fcRefreshViewNow_(c3.FC_MSG_.READ_FAILED, c3.FC_RETRY_.COLD_READ); await tick();
  eq(c3.__years(), [], 'E9  §6.3 before the retry there are no year options');
  c3.__banner().button.onclick(); await tick();
  eq(c3.__reads.length, 2, 'E10 §6.3 pressing Retry issued exactly one more read');
  eq(c3.__years(), ['', '2026'], 'E11 §6.3 THE DEFECT: the Year options recover with the table');
  ok(c3.__renders.indexOf('regular') > -1, 'E12 §6.3 and the rows rendered');
  ok(c3.__filterSyncs.length > 0, 'E13 §6.3 and the filters were rebuilt from the same model');
  eq(c3._fcViewState_, c3.FC_VIEW_.CURRENT, 'E14 §6.3 only now is the view current');
  ok(!c3.__banner().shown, 'E15 §6.3 and only now is the refusal cleared');

  // --- 6.4 refusal -> Retry -> null ---------------------------------------------------------------
  var c4 = build({ script: ['fail', { success: true, data: null }] });
  c4._fcReadModel = null;
  c4._fcRefreshViewNow_(c4.FC_MSG_.READ_FAILED, c4.FC_RETRY_.COLD_READ); await tick();
  c4.__banner().button.onclick(); await tick();
  ok(c4.__banner().shown, 'E16 §6.4 a null payload leaves the refusal standing');
  eq(c4._fcViewState_, c4.FC_VIEW_.REFUSED, 'E17 §6.4 and the state REFUSED');
  ok(c4._fcReadModel === null, 'E18 §6.4 and commits no model');

  // --- 6.5 refusal -> Retry -> HTML/404 body ------------------------------------------------------
  var html404 = '<!DOCTYPE html><html><title>找不到網頁</title></html>';
  var c5 = build({ script: ['fail', { success: true, data: html404 }] });
  c5._fcReadModel = null;
  c5._fcRefreshViewNow_(c5.FC_MSG_.READ_FAILED, c5.FC_RETRY_.COLD_READ); await tick();
  c5.__banner().button.onclick(); await tick();
  ok(c5.__banner().shown, 'E19 §6.5 a 404 HTML body reaching the page is still a refusal');
  ok(c5._fcReadModel === null, 'E20 §6.5 and never becomes four empty arrays');
  eq(c5.__years(), [], 'E21 §6.5 and never becomes a year list');

  // --- 6.6 refusal -> Retry -> wrong envelope / wrong shape ---------------------------------------
  var c6 = build({ script: ['fail', envOk({ someOtherWorkspace: [] })] });
  c6._fcReadModel = null;
  c6._fcRefreshViewNow_(c6.FC_MSG_.READ_FAILED, c6.FC_RETRY_.COLD_READ); await tick();
  c6.__banner().button.onclick(); await tick();
  ok(c6.__banner().shown, 'E22 §6.6 a payload carrying no canonical table is refused');
  ok(c6._fcReadModel === null, 'E23 §6.6 and commits nothing');
  var c6b = build({ script: [envOk({ fcRegularForecast: 'not-an-array' })] });
  c6b._fcRefreshViewNow_(c6b.FC_MSG_.READ_FAILED, c6b.FC_RETRY_.COLD_READ); await tick();
  ok(c6b._fcReadModel === null, 'E24 §6.6 a canonical key of the wrong type is refused, not coerced');

  // --- 6.7 valid loaded-empty is DISTINCT from refusal ---------------------------------------------
  var c7 = build({ script: [envOk({ fcRegularForecast: [], fcSpecialEvents: [], fcTargetRules: [], marketplaces: [] })] });
  c7._fcRefreshViewNow_(c7.FC_MSG_.READ_FAILED, c7.FC_RETRY_.COLD_READ); await tick();
  eq(c7._fcViewState_, c7.FC_VIEW_.CURRENT, 'E25 §6.7 an explicitly empty workspace is a SUCCESS');
  ok(c7._fcReadModel !== null, 'E26 §6.7 and commits a real (empty) model');
  eq(c7.__years(), [''], 'E27 §6.7 whose only Year option is the truthful placeholder');
  ok(!c7.__banner().shown, 'E28 §6.7 with no refusal — loaded-empty is not a failure');
  ok(c7._fcViewState_ !== c2._fcViewState_, 'E29 §6.7 loaded-empty and refused are different states');

  // --- 6.8 selector hydration throws: no banner clearing --------------------------------------------
  var c8 = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })] });
  c8._fcShowBanner_('stuck', 'Retry', function () {});
  c8._populateFcYearFromDb = function () { throw new Error('hydration exploded'); };
  c8.__renders.length = 0;
  c8._fcRefreshViewNow_(c8.FC_MSG_.READ_FAILED, c8.FC_RETRY_.COLD_READ); await tick();
  ok(c8.__banner().shown, 'E30 §6.8 a hydration failure leaves the refusal on screen');
  ok(c8._fcViewState_ !== c8.FC_VIEW_.CURRENT, 'E31 §6.8 and the view is NOT declared current');
  eq(c8.__renders, [], 'E32 §6.8 and the rows were not drawn over a half-built page');

  // --- 6.9 three Retry clicks -> one logical read ---------------------------------------------------
  var c9 = build({ script: ['fail', 'fail', 'fail'] });
  c9._fcRefreshViewNow_(c9.FC_MSG_.READ_FAILED, c9.FC_RETRY_.COLD_READ);
  c9._fcRefreshViewNow_(c9.FC_MSG_.READ_FAILED, c9.FC_RETRY_.COLD_READ);
  c9._fcRefreshViewNow_(c9.FC_MSG_.READ_FAILED, c9.FC_RETRY_.COLD_READ);
  eq(c9.__reads.length, 1, 'E33 §6.9 three clicks while one is in flight issue ONE read');
  await tick();

  // --- 6.10 superseded / unmounted -> zero DOM mutation ---------------------------------------------
  var c10 = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })] });
  c10._fcRefreshViewNow_(c10.FC_MSG_.READ_FAILED, c10.FC_RETRY_.COLD_READ);
  c10.__unmount();
  await tick();
  eq(c10.__years(), [], 'E34 §6.10 a read settling after unmount writes no options');
  eq(c10.__renders, [], 'E35 §6.10 and draws no rows');
  // The guard has to be the reason, not an inert harness.
  var c10b = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })] });
  c10b._fcRefreshViewNow_(c10b.FC_MSG_.READ_FAILED, c10b.FC_RETRY_.COLD_READ); await tick();
  ok(c10b.__years().length > 0, 'E36 §6.10 the same sequence WITHOUT the unmount does hydrate');

  // --- 6.11 previous valid model + readback failure --------------------------------------------------
  var c11 = build({ script: [envOk({ fcRegularForecast: rows(2026, 3), marketplaces: [] }), 'fail'] });
  c11._fcRefreshViewNow_(c11.FC_MSG_.READ_FAILED, c11.FC_RETRY_.COLD_READ); await tick();
  var yearsBefore = c11.__years();
  var modelBefore = c11._fcReadModel;
  c11._fcRefreshViewNow_(c11.FC_MSG_.SAVED_STALE, c11.FC_RETRY_.STALE_AFTER_WRITE); await tick();
  eq(c11.__years(), yearsBefore, 'E37 §6.11 a failed readback preserves the Year options');
  ok(c11._fcReadModel === modelBefore, 'E38 §6.11 and the last valid model');
  eq(c11._fcViewState_, c11.FC_VIEW_.STALE, 'E39 §6.11 the view is STALE — old, not wrong');
  eq(c11.__banner().label, 'Refresh view', 'E40 §6.11 and the control says so');

  // --- 6.12 recovery never writes ---------------------------------------------------------------------
  eq(c3.__writes.length, 0, 'E41 §6.12 no recovery path issued a write');
  var RECOVERY = codeOnly(extractFn(JS, '_fcRefreshViewNow_') + extractFn(JS, '_fcHydrateFromModel_')
    + extractFn(JS, '_fcSliceFetch_'));
  ['executeCommand', '.save', 'Save(', 'write', 'POST'].forEach(function (tok) {
    ok(RECOVERY.indexOf(tok) === -1, 'E42 §6.12 the recovery path contains no "' + tok + '"');
  });

  // --- §4D the operator is told WHICH stage failed ----------------------------------------------------
  var d1 = build({ script: ['fail'] });
  d1._fcRefreshViewNow_(d1.FC_MSG_.READ_FAILED, d1.FC_RETRY_.COLD_READ); await tick();
  ok(/Stage: transport\.$/.test(d1.__bannerText()), 'E43 §4D a delivery failure is named as transport', d1.__bannerText());
  eq(d1._fcMeta_.classification, 'REDIRECT_TARGET_NOT_FOUND', 'E44 §4D and classified by its real code');

  var d2 = build({ script: [envOk({ someOtherWorkspace: [] })] });
  d2._fcRefreshViewNow_(d2.FC_MSG_.READ_FAILED, d2.FC_RETRY_.COLD_READ); await tick();
  ok(/Stage: invalid response\.$/.test(d2.__bannerText()),
    'E45 §4D an unreadable payload is NOT reported as a network failure', d2.__bannerText());

  var d3 = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })] });
  d3._populateFcYearFromDb = function () { throw new Error('boom'); };
  d3._fcRefreshViewNow_(d3.FC_MSG_.READ_FAILED, d3.FC_RETRY_.COLD_READ); await tick();
  ok(/Stage: hydration\.$/.test(d3.__bannerText()),
    'E46 §4D good data that could not be rebuilt is named as hydration, not blamed on Google', d3.__bannerText());
  eq(d3._fcMeta_.stage, 'hydration', 'E47 §4D and the snapshot records the stage');
  // The three must be DISTINCT, or naming them achieves nothing.
  ok(d1.__bannerText() !== d2.__bannerText() && d2.__bannerText() !== d3.__bannerText(),
    'E48 §4D the three stages read differently');
  // §4D forbids claiming Google causation beyond the evidence.
  [d1, d2, d3].forEach(function (d, i) {
    ok(!/Google|expired|jsdelivr/i.test(d.__bannerText()),
      'E49 §4D banner ' + (i + 1) + ' names a stage, not a culprit', d.__bannerText());
  });

  // =================================================================================================
  section('F. MUTATION — each defect is restored, and must be caught');
  // =================================================================================================
  // EACH ENTRY RETURNS WHETHER THE BEHAVIOUR IS CORRECT — not whether the mutant was caught. The loop
  // derives `caught = !correct`, which makes section G's question the honest one: with the mutation
  // neutered the behaviour must be correct again, so every mutant must SURVIVE. A predicate that
  // reports 'caught' under both conditions is measuring the harness, not the code.
  var MUTANTS = [
    ['M1 an invalid response is accepted as CURRENT', function (sw) {
      // R3-R1: the shape gate moved into _fcSliceFetch_ and validates the SLICE payload.
      var m = sw(JS, 'if (!_fcValidWorkspaceData_(d) && !hasFacets) {', 'if (false) {');
      var c = build({ script: [envOk({ someOtherWorkspace: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () { return c._fcViewState_ !== c.FC_VIEW_.CURRENT; });
    }],
    ['M2 a hydration failure is swallowed and the banner cleared anyway', function (sw) {
      // The old rows-only path wrapped every render in `try { ... } catch (e) {}`. Restore that swallow
      // and the page clears the refusal and calls itself CURRENT over a view that never finished
      // building — which is precisely how a failure gets reported as a recovery.
      // The same two statements appear in the post-write readback, so the anchor carries the comment
      // line that belongs only to the Retry path. A mutation landing in the wrong one proves nothing.
      var A = '    stage = FC_STAGE_.HYDRATION;\n    _fcHydrateFromModel_();';
      var m = sw(JS, A, A.split('    _fcHydrateFromModel_();').join('    try { _fcHydrateFromModel_(); } catch (e) {}'));
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })], src: m });
      c._fcShowBanner_('stuck', 'Retry', function () {});
      c._populateFcYearFromDb = function () { throw new Error('boom'); };
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      // correct = the refusal is still on screen AND the view was never declared current
      return tick().then(function () { return c.__banner().shown && c._fcViewState_ !== c.FC_VIEW_.CURRENT; });
    }],
    ['M3 Year population is skipped', function (sw) {
      var m = sw(JS, '  _populateFcYearFromDb();\n  if (typeof renderFcRegularTable', '  if (typeof renderFcRegularTable');
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () { return c.__years().length > 0; });
    }],
    ['M4 Retry calls the partial refresh instead of the canonical hydration', function (sw) {
      var m = sw(JS, '    _fcHydrateFromModel_();\n    _fcViewState_ = FC_VIEW_.CURRENT;\n    _fcClearBanner_();\n  }).catch(function (err) {\n    _fcMeta_.readbackEnd = Date.now(); _fcReadbackFlight_ = false;',
        '    _fcRerenderTables_();\n    _fcViewState_ = FC_VIEW_.CURRENT;\n    _fcClearBanner_();\n  }).catch(function (err) {\n    _fcMeta_.readbackEnd = Date.now(); _fcReadbackFlight_ = false;');
      var c = build({ script: ['fail', envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () {
        c.__banner().button.onclick();
        return tick().then(function () { return c.__years().length > 0; });   // the original bug, exactly
      });
    }],
    ['M5 loaded-empty is collapsed into refusal', function (sw) {
      var m = sw(JS, '  return present > 0;', '  return present > 0 && data.fcRegularForecast && data.fcRegularForecast.length > 0;');
      var c = build({ script: [envOk({ fcRegularForecast: [], fcSpecialEvents: [], fcTargetRules: [], marketplaces: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () { return c._fcViewState_ === c.FC_VIEW_.CURRENT; });
    }],
    ['M6 the single-flight latch is removed', function (sw) {
      // R3-R1 — THERE ARE TWO LATCHES NOW, and the mutant has to remove both. _fcRefreshViewNow_ holds
      // the readback latch; _fcSliceFetch_ holds a per-slice flight latch of its own. Removing either
      // alone still yields one read, so a single-line mutation would describe no reachable hazard.
      // That the property survives losing one of them is a fact about the design worth stating.
      var m = sw(JS, '  if (_fcReadbackFlight_) return;', '  if (false) return;');
      m = m.split('  if (rec.flight) return rec.flight;').join('  if (false) return rec.flight;');
      var c = build({ script: ['fail', 'fail', 'fail'], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      var single = c.__reads.length === 1;
      return tick().then(function () { return single; });
    }],
    ['M7 the unmount guard is removed', function (sw) {
      var m = sw(JS, '    if (!_fcOwns_(epoch)) return;\n    // INCIDENT-BOOT-FC-R1 §4A — HYDRATE FIRST', '    if (false) return;\n    // INCIDENT-BOOT-FC-R1 §4A — HYDRATE FIRST');
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      c.__unmount();
      return tick().then(function () { return c.__years().length === 0; });
    }],
    ['M8 the stale model is cleared on a read failure', function (sw) {
      // Anchored on the stage record, which only the Retry catch writes — the post-write catch has the
      // same state line and a mutation landing there would prove nothing about a failed readback.
      var A = '    _fcViewState_ = _fcReadModel ? FC_VIEW_.STALE : FC_VIEW_.REFUSED;\n    _fcMeta_.stage =';
      var m = sw(JS, A, '    _fcReadModel = null;\n' + A);
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 3), marketplaces: [] }), 'fail'], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () {
        c._fcRefreshViewNow_(c.FC_MSG_.SAVED_STALE, c.FC_RETRY_.STALE_AFTER_WRITE);
        return tick().then(function () { return c._fcReadModel !== null && c._fcViewState_ === c.FC_VIEW_.STALE; });
      });
    }],
    ['M9 the commit happens before validation (the poisoned model)', function (sw) {
      // R3-R1: the commit is _fcMergeSlice_, and the guard that must precede it is the carried-key check.
      // Restoring the defect means merging FIRST and validating after — the poisoned model.
      var m = sw(JS,
        '      var carried = _FC_MODEL_KEYS_.filter(function (k) { return d[k] !== undefined && d[k] !== null; });',
        '      _fcMergeSlice_(name, adapted);\n      var carried = _FC_MODEL_KEYS_.filter(function (k) { return d[k] !== undefined && d[k] !== null; });');
      // A payload the SHAPE gate lets through but the MODEL gate must stop: the adapter is handed an
      // object whose canonical key is present in the payload, and the stub answers a broken model for it.
      var c = build({ script: [envOk({ marketplaces: [{ marketplaceId: 'M1' }] })], src: m });
      c.window.KM.DB.adaptFcSummaryWorkspaceSlice = function () { return { marketplaces: null }; };
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () { return c._fcReadModel === null; });
    }],
    ['M11 every failure is reported as a network failure', function (sw) {
      // The stage collapses back to one word. A hydration fault then reads as a delivery fault, which
      // sends the operator to check their connection over a problem that is entirely in the page.
      var m = sw(JS, '  if (stage === FC_STAGE_.HYDRATION) return FC_STAGE_.HYDRATION;',
                     '  if (false) return FC_STAGE_.HYDRATION;');
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 2), marketplaces: [] })], src: m });
      c._populateFcYearFromDb = function () { throw new Error('boom'); };
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () { return /Stage: hydration\.$/.test(c.__bannerText()); });
    }],
    ['M10 the year list outlives the model it came from', function (sw) {
      // A3-R10 §14.1 — the nulling moved into _fcInvalidateModel_, the ONE operation that discards
      // the model and the ledger together; _fcRenderError_ now delegates to it. Same rule, named
      // where it now lives — not loosened, and still driven through _fcRenderError_ below.
      var m = sw(JS, '  _fcCandidateYears_ = null;    // the year list belongs to the model', '  // the year list belongs to the model');
      var c = build({ script: [envOk({ fcRegularForecast: rows(2026, 3), marketplaces: [] })], src: m });
      c._fcRefreshViewNow_(c.FC_MSG_.READ_FAILED, c.FC_RETRY_.COLD_READ);
      return tick().then(function () {
        c._fcRenderError_({ code: 'REDIRECT_TARGET_NOT_FOUND', message: 'gone' });
        return c._fcCandidateYears_ === null;
      });
    }]
  ];

  var survived = [];
  for (var i = 0; i < MUTANTS.length; i++) {
    var correct = await MUTANTS[i][1](swapSrc);   // is the MUTATED code still behaving correctly?
    ok(correct === false, 'F' + (i + 1) + ' ' + MUTANTS[i][0], correct);
    if (correct !== false) survived.push(MUTANTS[i][0]);
  }

  // =================================================================================================
  section('G. VACUITY — with mutation neutered, every mutant must SURVIVE');
  // =================================================================================================
  var identity = function (src) { return src.replace(/\r\n/g, '\n'); };
  var vacuous = [];
  for (var j = 0; j < MUTANTS.length; j++) {
    var stillCorrect;
    try { stillCorrect = await MUTANTS[j][1](identity); } catch (e) { stillCorrect = 'threw:' + e.message; }
    ok(stillCorrect === true, 'G' + (j + 1) + ' neutered, ' + MUTANTS[j][0].split(' ')[0]
      + ' survives — it measures the mutation, not the weather', stillCorrect);
    if (stillCorrect !== true) vacuous.push(MUTANTS[j][0]);
  }

  // =================================================================================================
  section('H. §6.21-6.25 — SEALED REGRESSIONS');
  // =================================================================================================
  var cp = require('child_process');
  function atBase(rel) {
    try { return cp.execFileSync('git', ['-C', REPO, 'show', '90d705c:' + rel], { maxBuffer: 1 << 28 }).toString('utf8'); }
    catch (e) { return '__git_unavailable__'; }
  }
  var BASE_JS = atBase(JS_REL);
  if (BASE_JS !== '__git_unavailable__') {
    // §6.21-6.23 — the column-resize work sealed at 90d705c. FC-SUMMARY-R2B-A2-R5 added a Country column
    // to the Target table, which by construction changes that table's declaration and its nth-child width
    // rules. Re-pinning the seal to the new bytes would make it assert 'whatever is there now', so it is
    // split along the line that carries the meaning instead: the ENGINE and the OTHER TWO TABLES are still
    // byte-identical, and only the Target table's own shape moved. The behaviour is proven where it always
    // was — fc-column-resize-and-retry-label-r2b-a2-r3.test.js, re-run at 185 passed / 0 failed / 13
    // mutants / 0 survived, with its arity assertions rewritten to derive from the shipped header.
    // The ORIGINAL sealed span, with exactly one thing excised: the fc-target column declaration. Everything
    // else — every helper, the mount, the drag maths, the persistence, the Regular and Event declarations —
    // must still be byte-identical to 90d705c.
    function resizeBlockSansTarget(src) {
      var a = src.indexOf('var FC_RESIZE_MAX_');
      var b = src.indexOf('function _fcResizeInit_');
      var end = src.indexOf('}', src.indexOf('return mounted;', b));
      var whole = src.slice(a, end + 1).replace(/\r\n/g, '\n');
      var ta = whole.indexOf("{ group: 'fc-target'");
      var tb = whole.indexOf('];', ta);
      if (ta === -1 || tb === -1) throw new Error('fc-target declaration not located in the resize block');
      return whole.slice(0, ta) + whole.slice(tb);
    }
    ok(resizeBlockSansTarget(JS).length > 500, 'H1 the resize block was located');
    eq(resizeBlockSansTarget(JS), resizeBlockSansTarget(BASE_JS),
      'H2 §6.21-6.23 the resize block is byte-identical to the sealed commit apart from the Target columns');
    // and the Target declaration is the ONLY thing that moved: it still declares one entry, still names the
    // same roots, and Actions is still the single no-handle position.
    ok(/\{ group: 'fc-target', panel: 'fc-panel-target',/.test(JS.replace(/\r\n/g, '\n')),
      'H2b the Target table still declares the same group and panel');
    // The stylesheet, everything outside the Target table's own rules. The excised span runs from the start
    // of the Target section to the shared fixed-column rules that follow it.
    function cssOutsideTarget(src) {
      var t = src.replace(/\r\n/g, '\n');
      // FC-SUMMARY-R2B-A3-R7 — the Special Event card gained a ninth column (Base Event FC, the value
      // the event already has stored, beside the computational baseline rather than replacing it), so
      // its grid template is the one declaration OUTSIDE the Target block that this round moves. It is
      // normalised to a placeholder rather than excised: the column count may change, and every other
      // byte of the stylesheet — this declaration's neighbours included — is still compared against the
      // sealed commit. The rule this assertion exists for is unchanged, and is still that a round may
      // not disturb styling it has not declared.
      t = t.replace(/grid-template-columns: minmax\(90px,1\.6fr\)[^;]*;/, 'grid-template-columns: <fc-evt-line>;');
      // FC-SUMMARY-R2B-B1-PERF §2 — the ONE block this round declares: `.fc-inline-check`, which
      // stops `.fc-form-group input { width: 100% }` stretching the period-change checkbox across
      // its column. Excised, not normalised, because it is new text rather than a moved value.
      var c0 = t.indexOf('/* FC-SUMMARY-R2B-B1-PERF \u00a72');
      if (c0 !== -1) {
        var helpAt = t.indexOf('.fc-inline-check-help', c0);
        var c1 = helpAt === -1 ? -1 : t.indexOf('}', helpAt);
        if (c1 === -1) throw new Error('fc-overview.css B1 inline-check block not located');
        // The prefix already ends with the blank line that separated the block from its neighbour,
        // so the cut is the block AND the newlines after it — not any of the prefix's.
        var c2 = c1 + 1;
        while (t.charAt(c2) === '\n') c2++;
        t = t.slice(0, c0) + t.slice(c2);
      }
      var a = t.indexOf('/* R2B-A2-R5');
      if (a === -1) a = t.indexOf('/* --- Target % & Rules:');
      var b = t.indexOf('/* Fixed column');
      if (a === -1 || b === -1 || b < a) throw new Error('fc-overview.css Target section not located');
      return t.slice(0, a) + t.slice(b);
    }
    eq(cssOutsideTarget(read('assets/css/pages/fc-overview.css')),
      cssOutsideTarget(atBase('assets/css/pages/fc-overview.css')),
      'H3 §6.21-6.23 the stylesheet is byte-identical everywhere outside the Target table block');
  } else {
    console.log('   (git unavailable — H1-H3 skipped)');
  }
  // §6.24 — the R1/R2B contracts this round's edits pass through are unchanged in shape.
  ok(codeOnly(JS).indexOf('_fcRetryLabel_(FC_RETRY_.STALE_AFTER_WRITE)') > -1,
    'H4 §6.24 the stale-after-write label contract still stands');
  ok(codeOnly(JS).indexOf('FC_RETRY_.REFUSED_ZERO') > -1,
    'H5 §6.24 and the proven-zero-write refusal contract');
  // §6.25 / §4C — redirect, endpoint, timeout, retry count and cache mode are not this page's business.
  var PAGE = codeOnly(JS);
  ['maxRetries', 'readTimeoutMs', 'writeTimeoutMs', "cache:", 'km_rid', 'googleusercontent', 'redirect:']
    .forEach(function (tok) {
      ok(PAGE.indexOf(tok) === -1, 'H6 §4C the page still contains no "' + tok + '"');
    });
  if (BASE_JS !== '__git_unavailable__') {
    eq(read('assets/js/api/km-transport.js').replace(/\r\n/g, '\n'),
      atBase('assets/js/api/km-transport.js').replace(/\r\n/g, '\n'),
      'H7 §4C km-transport.js is byte-identical — no redirect policy changed');
    // R3-R1 WIDENS THIS FILE ON PURPOSE, so a byte pin is no longer the right assertion — it would
    // fail for the one change the round was authorised to make. What must still hold is the claim the
    // pin existed to protect: the FULL adapter is untouched, and the only addition is the slice
    // projection that calls the SAME normalizers.
    var dbNow = read(DBAPI_REL).replace(/\r\n/g, '\n');
    var dbBase = atBase(DBAPI_REL).replace(/\r\n/g, '\n');
    var fullNow = dbNow.slice(dbNow.indexOf('window.KM.DB.adaptFcSummaryWorkspace = function'));
    var fullBase = dbBase.slice(dbBase.indexOf('window.KM.DB.adaptFcSummaryWorkspace = function'));
    eq(fullNow.slice(0, fullBase.indexOf('};') + 2), fullBase.slice(0, fullBase.indexOf('};') + 2),
      'H8 §5 the FULL fcSummary adapter is byte-identical — it was not widened');
    var added = dbNow.length - dbBase.length;
    ok(added > 0 && dbNow.indexOf('adaptFcSummaryWorkspaceSlice') > -1,
      'H8a and the only growth is the R3-R1 slice projection', added);
    ['normalizeFcRegularForecastRecord', 'normalizeFcSpecialEventRecord',
     'normalizeFcTargetRuleRecord', 'normalizeMarketplaceRecord'].forEach(function (n, i) {
      eq((dbNow.match(new RegExp('function ' + n + '\\(', 'g')) || []).length, 1,
        'H8b.' + (i + 1) + ' ' + n + ' still has exactly ONE definition — no second normalizer');
    });
    eq(read('assets/js/api/km-api-foundation.js').replace(/\r\n/g, '\n'),
      atBase('assets/js/api/km-api-foundation.js').replace(/\r\n/g, '\n'),
      'H9 §5 km-api-foundation.js is byte-identical');
  }

  // =================================================================================================
  section('I. THE HOME BOOT — the census this suite recorded, now asserted as REPAIRED');
  // =================================================================================================
  // BOOT-FC-R1 recorded this census as a DEFECT, because the repair needed app.js and the structure of
  // index.html and neither was authorised yet. BOOT-FC-R2 authorised and made that repair, so the
  // assertions below now check the same three facts from the other side.
  //
  // The full Home boot contract — Phase 0 executed for real, interval ownership, deep-link guard,
  // defer order-safety — belongs to home-boot-critical-path-boot-fc-r2.test.js. What stays HERE is the
  // part an FC change could plausibly break: the clock must never acquire a data dependency, and Home
  // must never start issuing API requests.
  var APP = read(APP_REL), HOME = read(HOME_REL), INDEX = read('index.html');

  // The world clock is pure-local arithmetic, and it now lives in home.js rather than app.js.
  var uwt = extractFn(HOME, 'updateWorldTimes');
  ['KM.api', 'getWorkspace', 'fetch(', 'await ', '.then('].forEach(function (tok) {
    ok(uwt.indexOf(tok) === -1, 'I1 the world clock contains no "' + tok + '" — it is local arithmetic');
  });
  // ...and home.js issues no API request at all, so no Home card is behind an Apps Script read.
  ['KM.api.getWorkspace', 'executeCommand', 'loadOperationDb'].forEach(function (tok) {
    ok(codeOnly(HOME).indexOf(tok) === -1, 'I2 home.js issues no "' + tok + '"');
  });
  // THE DEFECT, NOW REPAIRED. The clock used to be started from app.js's DOMContentLoaded handler, which
  // cannot fire until every render-blocking script has downloaded and executed — measured cold at
  // concurrency 6: 103 requests, 6.93 MB, 38.2 s. That was the whole of the "--/--" window, and no API
  // was involved in any of it.
  var dcl = APP.slice(APP.indexOf("addEventListener('DOMContentLoaded'"));
  ok(dcl.indexOf('initWorldTimes()') === -1,
    'I3 REPAIRED: the local clock is no longer started from DOMContentLoaded');
  ok(codeOnly(HOME).indexOf('function initWorldTimes') > -1,
    'I3b REPAIRED: it is started by the Home mount instead, in Phase 0');
  var scripts = (INDEX.match(/<script src="/g) || []).length;
  var deferredTags = (INDEX.match(/<script[^>]+\bdefer\b/g) || []).length;
  ok(scripts > 60, 'I4 index.html still loads ' + scripts + ' scripts — none was deleted', scripts);
  ok(deferredTags > 60,
    'I5 REPAIRED: ' + deferredTags + ' of them defer, so they no longer block the clock', deferredTags);
  ok(/<script src="https:\/\/cdn\.jsdelivr\.net[^"]*" defer/.test(INDEX),
    'I6 REPAIRED: the third-party CDN scripts are off the critical path (URL and version unchanged)');
  // The capability read, at least, is already fire-and-forget: Home does not wait on Apps Script.
  ok(/_capP\.then\(function \(\) \{ _capSettle\(true\); \}, function \(\) \{ _capSettle\(false\); \}\)/.test(APP),
    'I7 the one Home-boot API read is fire-and-forget and settles either way');
  ok(dcl.indexOf('Promise.all') === -1,
    'I8 there is no all-or-nothing gate in the Home boot — one rejection cannot freeze the rest');

  // =================================================================================================
  console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
    + MUTANTS.length + ' mutants, ' + survived.length + ' survived'
    + (vacuous.length ? ', ' + vacuous.length + ' VACUOUS' : ', vacuity clean'));
  if (survived.length) console.error('SURVIVED: ' + survived.join(' | '));
  if (vacuous.length) console.error('VACUOUS:  ' + vacuous.join(' | '));
  process.exit(fail === 0 && !survived.length && !vacuous.length ? 0 : 1);
})().catch(function (e) { console.error('HARNESS ERROR', e); process.exit(1); });
