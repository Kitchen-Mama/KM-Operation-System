// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R10
// INITIAL READ RECOVERY · MARKETPLACES OWNERSHIP · EVENT PERIOD UX
//
// Production smoke at R18 found four defects, and two of them were one fact held in two places.
//
//   A  The FC Summary initial load could fail REQUEST_TIMEOUT at 60 s, and Retry could then leave
//      "FC Summary data could not be loaded. Stage: transport." — or, worse, a table that drew
//      EMPTY with no error at all. Two causes, both reproduced here:
//        A1  `_fcReadModel` (the data) and `_fcSliceState_` (the ledger describing it) were two
//            authorities over one fact. A refusal nulled the model — correctly — and left the
//            ledger saying CURRENT about rows that no longer existed. Retry asks only for what the
//            ledger calls failed, so it never asked for them again. Section A drives exactly that.
//        A2  The cold mount dispatched beside the boot capability read. A client timeout starts at
//            DISPATCH, so the read spent part of its own 60 s budget queueing. The bound is NOT
//            enlarged; the page joins the boot arbiter that already exists for this.
//
//   B  The Special Builder's first Next could fail HTTP_TRANSPORT_ERROR / getTable / marketplaces —
//      a second physical read for rows the bootstrap slice had already brought.
//
//   C  A saved event offered a "confirm the period change" tick above dates it was not showing, and
//      a new event asked for a period it had hidden. `toggleEventFlagFields` was the ONLY owner of
//      the period row and was keyed on the event flag alone — and both `openEventModal` and
//      `_evtHydrateExisting_` set that flag PROGRAMMATICALLY, which raises no change event.
//
//   D  The Builder's copy described campaigns, forecast ids and "identity" to an operator.
//
// Run: node assets/tests/fc-initial-read-recovery-and-period-ux-r2b-a3-r10.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutants = [], survived = [];
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mutant(l, caught) {
  mutants.push(l);
  if (caught === true) { pass++; console.log('ok   ' + l + ' (caught)'); }
  else { survived.push(l); fail++; console.error('FAIL ' + l + ' — MUTANT SURVIVED'); }
}
var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var HTML = read('assets/html/pages/fc-summary.html');
var SPEC = read('docs/planning/FC_SUMMARY_SPEC.md');
var ARB = read('assets/js/core/boot-read-arbiter.js');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = (src.slice(Math.max(0, i - 6), i) === 'async ') ? i - 6 : i;
  var d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
// A mutant that injects nothing cannot fail, so every fault proves it landed.
function faulted(src, from, to, label) {
  var out = src.split(from).join(to);
  if (out === src) throw new Error(label + ' anchor drifted — the mutant would inject nothing');
  return out;
}

// =========================================================================================================
// THE READ WORLD — the real slice machinery against an injected workspace API.
// =========================================================================================================
var READ_VARS = ['FC_SLICE_', 'FC_FRESH_', '_FC_TAB_SLICE_', '_FC_SLICE_KEYS_', '_FC_MODEL_KEYS_',
                 '_fcSliceState_', '_fcModelGen_', '_fcInvalidateReason_'];
var READ_FNS = ['_fcModelGenNow_', '_fcInvalidateModel_', '_fcSliceRec_', '_fcSliceStates_', '_fcHas_',
                '_fcSliceHasData_', '_fcTabNow_', '_fcMergeSlice_', '_fcSliceFetch_', '_fcFailedSlices_',
                '_fcModelUsable_', '_fcSlicesNeededNow_', '_fcGetRegularForecast', '_fcGetMarketplaces',
                '_fcGetSpecialEvents'];

function readWorld(opts) {
  opts = opts || {};
  var reads = [];
  var sb = {
    console: console, Promise: Promise, JSON: JSON, Array: Array, Object: Object, String: String,
    Date: Date, document: undefined, window: {},
    _fcReadModel: null, _fcCandidateYears_: null,
    _fcWorkspaceMode_: function () { return true; },
    _fcYearsOf_: function () { return []; },
    _fcValidWorkspaceData_: function (d) {
      return !!(d && (Array.isArray(d.fcRegularForecast) || Array.isArray(d.fcSpecialEvents)
        || Array.isArray(d.fcTargetRules) || Array.isArray(d.marketplaces)));
    },
    _fcActiveTab: function () { return opts.tab || 'regular'; }
  };
  sb.__reads = reads;
  sb.window.KM = {
    api: { getWorkspace: function (n, p) {
      var slice = p && p.include && p.include.slice;
      reads.push(slice);
      return sb.__server(slice);
    } },
    DB: { adaptFcSummaryWorkspaceSlice: function (d) {
      var o = {};
      ['fcRegularForecast', 'fcSpecialEvents', 'fcTargetRules', 'marketplaces'].forEach(function (k) {
        if (Array.isArray(d[k])) o[k] = d[k].slice();
      });
      if (d.slice) o.slice = d.slice;
      return o;
    } } };
  var W = vm.createContext(sb);
  READ_VARS.forEach(function (v) { vm.runInContext(varSrc(FCS, v), W); });
  READ_FNS.forEach(function (f) { vm.runInContext(opts.src && opts.src[f] ? opts.src[f] : fnSrc(FCS, f), W); });
  // The DOM half of _fcRenderError_ is not what is under test; the reset it delegates IS.
  vm.runInContext('function _fcRenderError_(err) { _fcInvalidateModel_((err && err.code) || "FC_SUMMARY_READ_FAILED"); }', W);
  return sb;
}
function payload(slice) {
  if (slice === 'bootstrap') {
    return { slice: 'bootstrap', fcTargetRules: [{ ruleId: 'R1' }],
             marketplaces: [{ marketplaceId: 'MP-US-AMA', marketplace: 'Amazon', company: 'ResUS', country: 'US' }] };
  }
  if (slice === 'regular') return { slice: 'regular', fcRegularForecast: [{ forecastId: 'F1', sku: 'CO1100-R' }] };
  if (slice === 'events') return { slice: 'events', fcSpecialEvents: [{ eventId: 'E1', sku: 'CO1100-R' }] };
  return { slice: slice, fcTargetRules: [] };
}
function okEnv(slice) { return Promise.resolve({ success: true, data: payload(slice) }); }
function timeoutEnv() {
  return Promise.resolve({ success: false, errors: [{ code: 'REQUEST_TIMEOUT',
    message: 'No answer arrived within 60s.' }] });
}
// what the page's Retry control actually asks for
function retryScope(W) {
  var bad = vm.runInContext('_fcFailedSlices_()', W);
  vm.runInContext('_fcSlicesNeededNow_()', W).forEach(function (n) { if (bad.indexOf(n) === -1) bad.push(n); });
  return bad;
}

async function main() {

// =========================================================================================================
section('A. INITIAL LOAD — THE MODEL AND THE LEDGER ARE ONE FACT (§14.1)');
// =========================================================================================================
await (async function () {
  var W = readWorld();
  W.__server = function (s) { return okEnv(s); };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);

  await Promise.all([fetchSlice('bootstrap'), fetchSlice('regular')]);
  eq(W.__reads.slice().sort(), ['bootstrap', 'regular'], 'A1  a cold mount reads exactly two slices');
  ok(vm.runInContext('_fcModelUsable_("regular")', W) === true,
    'A2  and the Regular tab is drawable from them');
  eq(vm.runInContext('_fcFailedSlices_()', W), [], 'A3  with nothing marked failed');
})();

await (async function () {
  // THE REPRODUCTION. Regular lands, bootstrap times out, the refusal discards the model.
  var W = readWorld();
  W.__server = function (s) { return s === 'regular' ? okEnv(s) : timeoutEnv(); };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);

  await fetchSlice('regular');
  try { await fetchSlice('bootstrap'); } catch (e) { /* the page renders the refusal */ }
  ok(vm.runInContext('_fcModelUsable_("regular")', W) === false,
    'A4  a missing bootstrap makes the page undrawable, whatever else landed');

  vm.runInContext('_fcRenderError_({ code: "REQUEST_TIMEOUT" })', W);
  eq(vm.runInContext('_fcReadModel', W), null, 'A5  the refusal discards the model — never a broad-cache fallback');
  eq(vm.runInContext('_fcSliceStates_()', W), {},
    'A6  AND the ledger that described it, in ONE operation — no record outlives its rows');

  // Retry
  W.__server = function (s) { return okEnv(s); };
  var bad = retryScope(W);
  eq(bad.slice().sort(), ['bootstrap', 'regular'],
    'A7  so Retry asks for BOTH — the regression was asking only for bootstrap');
  W.__reads.length = 0;
  for (var i = 0; i < bad.length; i++) { try { await fetchSlice(bad[i]); } catch (e) {} }

  eq(W.__reads.slice().sort(), ['bootstrap', 'regular'], 'A8  one fresh request per missing slice, and no more');
  ok(vm.runInContext('_fcGetRegularForecast()', W).length === 1,
    'A9  the Regular rows come back — the silent empty table is gone');
  ok(vm.runInContext('_fcModelUsable_("regular")', W) === true, 'A10 and the tab is drawable again');
  eq(vm.runInContext('_fcFailedSlices_()', W), [], 'A11 with the banner cleared, because nothing is still failed');
})();

await (async function () {
  // A retry that issues no request is a control that lies. After an invalidation the ledger is EMPTY
  // rather than failed, so a scope derived from failures alone would ask for nothing at all.
  var W = readWorld();
  W.__server = function (s) { return okEnv(s); };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);
  await Promise.all([fetchSlice('bootstrap'), fetchSlice('regular')]);
  vm.runInContext('_fcRenderError_({ code: "REDIRECT_TARGET_NOT_FOUND" })', W);
  eq(vm.runInContext('_fcFailedSlices_()', W), [], 'A12 an invalidated ledger marks nothing as failed');
  eq(retryScope(W).sort(), ['bootstrap', 'regular'], 'A13 yet Retry still asks for what the tab needs');
})();

await (async function () {
  // Permanent LOADING is the other way a page never recovers.
  var W = readWorld();
  W.__server = function () { return timeoutEnv(); };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);
  try { await fetchSlice('bootstrap'); } catch (e) {}
  eq(vm.runInContext('_fcSliceStates_().bootstrap', W), 'REFUSED',
    'A14 a failed slice settles to REFUSED, never LOADING for ever');
  eq(vm.runInContext('_fcSliceRec_("bootstrap").flight', W), null,
    'A15 and its single-flight handle is released, so Retry gets a genuinely fresh request');
})();

(function () {
  // The loading region is a THIRD holder of "what is on screen". The refusal leaves it ERROR, and
  // the mount announces a load while Retry did not — so the two recovery paths disagreed about what
  // the region said. Nothing repaints from it today, which is why this was invisible rather than
  // absent; it is the same class of defect as §14.1 and is closed the same way.
  var RETRY = fnSrc(FCS, '_fcRetryFailedSlices_');
  var MOUNT = fnSrc(FCS, '_fcMountLoad_');
  var announce = 'var rg = _fcRegion_(); if (rg) rg.beginLoad(!!_fcReadModel);';
  ok(MOUNT.indexOf(announce) !== -1, 'A16 the mount announces its load to the region');
  ok(RETRY.indexOf(announce) !== -1,
    'A17 and Retry announces the same thing, so the region stops describing a refusal it left behind');
  ok(/rg\.set\(window\.KM\.loadState\.STATES\.ERROR\)/.test(fnSrc(FCS, '_fcRenderError_')),
    'A18 while a refusal still sets it to ERROR in the first place');
})();

// =========================================================================================================
section('B. GENERATIONS — A LATE ANSWER MAY NOT OVERWRITE A NEWER ONE (§14.2)');
// =========================================================================================================
await (async function () {
  var W = readWorld();
  var release;
  W.__server = function (s) {
    if (s === 'regular') return new Promise(function (r) { release = function () { r({ success: true, data: payload('regular') }); }; });
    return okEnv(s);
  };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);
  var slow = fetchSlice('regular');          // in flight, belonging to generation N
  var gen0 = vm.runInContext('_fcModelGenNow_()', W);

  vm.runInContext('_fcRenderError_({ code: "REQUEST_TIMEOUT" })', W);   // the model it was asked for is gone
  ok(vm.runInContext('_fcModelGenNow_()', W) > gen0, 'B1  invalidating the model advances the generation');

  await fetchSlice('bootstrap');             // a NEWER model is built
  release();
  var landed = null;
  try { await slow; landed = 'MERGED'; } catch (e) { landed = (e && e.code) || 'THREW'; }
  eq(landed, 'FC_SUMMARY_READ_SUPERSEDED',
    'B2  the older answer is dropped at the COMMIT point, not merely ignored at the draw');
  ok(vm.runInContext('_fcHas_("fcRegularForecast")', W) === false,
    'B3  so it cannot repopulate the model the reset had just emptied');
  eq(vm.runInContext('_fcSliceStates_().regular', W), undefined,
    'B4  and it leaves no record on a ledger that has been reset under it');
})();

await (async function () {
  // The guard must not fire on the ordinary path, or every read would fail.
  var W = readWorld();
  W.__server = function (s) { return okEnv(s); };
  var fetchSlice = vm.runInContext('_fcSliceFetch_', W);
  await fetchSlice('bootstrap');
  await fetchSlice('regular');
  ok(vm.runInContext('_fcHas_("fcRegularForecast")', W) === true,
    'B5  an answer whose generation is still current commits normally');
})();

// =========================================================================================================
section('C. THE COLD MOUNT IS ARBITRATED, NOT RE-TIMED (§14.3)');
// =========================================================================================================
(function () {
  var TR = read('assets/js/api/km-transport.js');
  ok(/var _readTimeoutMs = \(deps\.readTimeoutMs > 0\) \? deps\.readTimeoutMs : 60000;/.test(TR),
    'C1  the read bound is still 60 000 ms — a timeout is not fixed by enlarging it');
  ok(/if \(code === CODES\.REQUEST_TIMEOUT\) return false;/.test(TR),
    'C2  and a timeout is still never retried automatically: the bound already elapsed');

  var DISPATCH = fnSrc(FCS, '_fcDispatchWhenBootClear_');
  ok(/window\.KM\.bootArbiter/.test(DISPATCH),
    'C3  the mount waits on the EXISTING boot arbiter, not on a second coordinator');
  ok(/dependencyState\(n\) === 'PENDING'/.test(DISPATCH),
    'C4  and only for a dependency that is actually open');
  ok(/if \(!pending\.length\) \{ go\(\); return; \}/.test(DISPATCH),
    'C5  nothing open → dispatch immediately, exactly as before');
  ok(/if \(!ba \|\| typeof ba\.whenReady !== 'function'/.test(DISPATCH),
    'C6  no arbiter → dispatch immediately, so nothing depends on the module being present');
  ok(/\.then\(go, go\)/.test(DISPATCH),
    'C7  and a FAILED dependency releases the read exactly like a settled one');
  eq(varSrc(FCS, '_FC_BOOT_DEPS_').indexOf('capabilities') !== -1, true,
    'C8  the dependency is the boot capability read app.js already declares');
  ok(/bootArbiter\.declare\('capabilities'\)/.test(read('assets/js/app.js')),
    'C9  which app.js does declare, so the name is not invented here');
  ok(/w\.waited_ms/.test(ARB) && /capped\.forEach/.test(ARB),
    'C10 and the arbiter caps that wait, so it can only make the read start sooner');

  var MOUNT = fnSrc(FCS, '_fcMountLoad_');
  ok(/_fcDispatchWhenBootClear_\(function \(\) \{/.test(MOUNT),
    'C11 the cold mount goes through it');
  ok(/need\.forEach\(function \(n\) \{/.test(MOUNT),
    'C12 and still fires every missing slice TOGETHER — 4.5 s measured against 10 s sequential');
  ok(/if \(!need\.length\) \{\n    draw\(\);\n    return;/.test(MOUNT),
    'C13 while a warm re-entry still issues ZERO requests and never reaches the wait');
  ok(MOUNT.indexOf('_fcDispatchWhenBootClear_') > MOUNT.indexOf('if (!need.length)'),
    'C14 in that order — a page with everything in memory must not wait for a boot read');
})();

// =========================================================================================================
section('D. MARKETPLACES HAS ONE OWNER (§14.4)');
// =========================================================================================================
(function () {
  var PRE = varSrc(FCS, '_FC_PREREQ_TABLES_');
  ok(!/'marketplaces'/.test(PRE), 'D1  marketplaces is NOT a builder prerequisite on either path');
  ok(/'marketplace_skus'/.test(PRE),
    'D2  while marketplace_skus still is — no workspace read carries it');
  var sb = { console: console }; vm.createContext(sb); vm.runInContext(PRE, sb);
  eq(sb._FC_PREREQ_TABLES_.regular.slice().sort(), ['fc_regular_forecast', 'marketplace_skus', 'sku_details'],
    'D3  the Regular path is three tables');
  eq(sb._FC_PREREQ_TABLES_.event.slice().sort(),
    ['campaign_sku_lines', 'campaigns', 'fc_special_events', 'marketplace_skus', 'pricing_list', 'sku_details'],
    'D4  and the Special path six');

  ok(varSrc(FCS, '_FC_SLICE_KEYS_').indexOf('marketplaces') !== -1,
    'D5  because the bootstrap slice owns those rows');
  var API = read('assets/js/api/operation-system-db-api.js');
  ok(/out\.marketplaces = data\.marketplaces\.map\(normalizeMarketplaceRecord\)\.filter\(function\(r\) \{ return r\.marketplaceId \|\| r\.marketplace; \}\);/.test(API),
    'D6  the workspace adapter runs normalizeMarketplaceRecord with the canonical filter');
  ok(/marketplaces: \(db\.marketplaces \|\| \[\]\)\.map\(normalizeMarketplaceRecord\)\.filter\(function\(r\) \{ return r\.marketplaceId \|\| r\.marketplace; \}\)/.test(API),
    'D7  and the broad cache runs the SAME one — the two stores are the same rows in the same shape');

  eq((FCS.match(/window\.KM\.DB\.getMarketplaces\(\)/g) || []).length, 1,
    'D8  exactly one direct broad-cache call remains, inside the accessor itself');
  var GET = fnSrc(FCS, '_fcGetMarketplaces');
  ok(/if \(_fcHas_\('marketplaces'\)\) return _fcReadModel\.marketplaces;/.test(GET),
    'D9  which is read-model-first, so no second cache authority was created');
  ['_populateRegularScopeSelects', '_fcRegularSiteOptions', '_populateEventScopeSelects',
   '_evtResolveMarketplaceId'].forEach(function (f, i) {
    ok(/_fcGetMarketplaces\(\)/.test(fnSrc(FCS, f)),
      'D1' + String(i) + (i === 0 ? '0' : '') + ' ' + f + ' asks the page accessor');
  });
  // demo isolation is a live-vs-demo rule and must not be lost in the move
  ok(/demoOn \? \[\] : _fcGetMarketplaces\(\)/.test(FCS),
    'D14 and the Demo guard survives — a demo dataset is never mixed into live');
})();

await (async function () {
  // Behaviourally: the rows the Builder resolves come out of the bootstrap slice.
  var W = readWorld();
  W.__server = function (s) { return okEnv(s); };
  await vm.runInContext('_fcSliceFetch_', W)('bootstrap');
  eq(vm.runInContext('_fcGetMarketplaces().length', W), 1,
    'D15 after a bootstrap read the accessor answers from the model, with zero further requests');
  W.__reads.length = 0;
  vm.runInContext('_fcGetMarketplaces()', W);
  eq(W.__reads, [], 'D16 and asking again issues nothing at all');
})();

// =========================================================================================================
section('E. EVENT PERIOD UX — ONE OWNER (§10.2)');
// =========================================================================================================
function makeEl(tag) {
  var el = { tagName: tag || 'DIV', _v: '', innerHTML: '', textContent: '', className: '', hidden: false,
    checked: false, dataset: {}, style: {}, disabled: false, options: [], children: [],
    appendChild: function (c) { this.children.push(c); this.lastElementChild = c; return c; },
    removeChild: function () {}, setAttribute: function () {}, removeAttribute: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  Object.defineProperty(el, 'value', {
    get: function () { return this._v; },
    set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); }, enumerable: true });
  return el;
}
var SAVED = { campaignId: 'CMP-PD26', eventName: 'Prime Day', startDate: '2026-07-01',
              endDate: '2026-07-15', year: 2026, skuCount: 13, lines: {} };

function uxWorld(opts) {
  opts = opts || {};
  var els = {};
  ['event-period-row', 'event-window-confirm-row', 'event-window-confirm', 'event-window-confirm-help',
   'event-start-date', 'event-end-date', 'event-start-date-label', 'event-end-date-label',
   'event-editing-banner', 'event-name-input', 'event-method-description', 'event-period-error-row',
   'event-period-error', 'event-country', 'event-marketplace', 'event-target-year',
   'evt-add-row-btn', 'event-window-change-notice'].forEach(function (id) { els[id] = makeEl(); });
  var dom = { getElementById: function (id) { return els[id] || null; },
    createElement: function (t) { return makeEl(t); },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  var sb = { document: dom, window: {}, console: console, Array: Array, Object: Object, String: String,
             Number: Number, JSON: JSON, RegExp: RegExp };
  sb.__els = els;
  var W = vm.createContext(sb);
  [ fnSrc(FCS, '_trStrTok_'),
    'var _evtEditing_ = ' + JSON.stringify(opts.editing || null) + ';',
    'var _evtGroups = [];',
    'function _evtEditingActive_() { return !!_evtEditing_; }',
    'function _evtApplyCurrentFcLabel_() {}',
    'function _evtBuildGroups() {}',
    fnSrc(FCS, '_evtWindowConfirmEl_'), fnSrc(FCS, '_evtWindowConfirmChecked_'),
    fnSrc(FCS, '_evtClearPeriodError'),
    fnSrc(FCS, '_evtClearWindowChangeNotice_'),
    fnSrc(FCS, '_evtFmtDay_'), fnSrc(FCS, '_evtSavedWindowText_'),
    opts.syncSrc || fnSrc(FCS, '_evtSyncPeriodUi_'),
    fnSrc(FCS, '_evtOnWindowConfirmToggle_'),
    fnSrc(FCS, '_evtSetEditingChrome_')
  ].forEach(function (s) { vm.runInContext(s, W); });
  if (opts.editing) { els['event-start-date'].value = opts.editing.startDate; els['event-end-date'].value = opts.editing.endDate; }
  return sb;
}
function shown(W, id) {
  var el = W.__els[id];
  return id === 'event-window-confirm-row' ? !el.hidden : el.style.display !== 'none';
}

(function () {
  // NEW EVENT — §6
  var W = uxWorld({ editing: null });
  vm.runInContext('_evtSyncPeriodUi_()', W);
  ok(shown(W, 'event-period-row') === true, 'E1  New event: the date fields are visible');
  ok(shown(W, 'event-window-confirm-row') === false, 'E2  New event: no period-confirmation tick');
  eq(W.__els['event-start-date-label'].textContent, 'Event Start Date *', 'E3  labelled as the event\'s dates');
  eq(W.__els['event-end-date-label'].textContent, 'Event End Date *', 'E4  both of them');
  eq(W.__els['event-editing-banner'].hidden, false, 'E5  (banner state is the chrome\'s, not the period owner\'s)');

  // the flag must not be able to take them away — §0 FAIL C
  W.__els['event-name-input'].value = 'Normal';
  vm.runInContext('_evtSyncPeriodUi_()', W);
  ok(shown(W, 'event-period-row') === true, 'E6  and the event flag cannot hide them');
})();

(function () {
  // EXISTING EVENT, UNCONFIRMED — §7
  var W = uxWorld({ editing: SAVED });
  vm.runInContext('_evtSetEditingChrome_()', W);
  ok(shown(W, 'event-window-confirm-row') === true, 'E7  Existing: the confirmation row is shown');
  ok(shown(W, 'event-period-row') === false, 'E8  Existing: the date editor is hidden by default');
  eq(W.__els['event-window-confirm-help'].textContent,
    'Saved period 2026/07/01 → 2026/07/15. Tick to change it.',
    'E9  with the saved window stated in words, right under the tick');

  // CONFIRMED
  W.__els['event-window-confirm'].checked = true;
  vm.runInContext('_evtOnWindowConfirmToggle_()', W);
  ok(shown(W, 'event-period-row') === true, 'E10 ticking reveals the period editor');
  eq(W.__els['event-start-date'].value, '2026-07-01', 'E11 prefilled with the saved start');
  eq(W.__els['event-end-date'].value, '2026-07-15', 'E12 and the saved end');
  eq(W.__els['event-start-date-label'].textContent, 'New Start Date *', 'E13 labelled as the NEW dates');
  eq(W.__els['event-end-date-label'].textContent, 'New End Date *', 'E14 both of them');
  eq(W.__els['event-window-confirm-help'].textContent,
    'Saved period 2026/07/01 → 2026/07/15. Enter the new dates below.',
    'E15 and the saved window stays visible beside the new ones');

  // UNTICK = ABANDON
  W.__els['event-start-date'].value = '2026-08-01';
  W.__els['event-window-confirm'].checked = false;
  vm.runInContext('_evtOnWindowConfirmToggle_()', W);
  eq(W.__els['event-start-date'].value, '2026-07-01',
    'E16 unticking puts the saved window back — an abandoned edit is not left in a hidden field');
  ok(shown(W, 'event-period-row') === false, 'E17 and hides the editor again');
})();

(function () {
  // The controls follow the MODE, through the real entry points.
  var W = uxWorld({ editing: SAVED });
  vm.runInContext('_evtSetEditingChrome_()', W);
  ok(shown(W, 'event-period-row') === false && shown(W, 'event-window-confirm-row') === true,
    'E18 loading a saved event lands in the unconfirmed state');
  vm.runInContext('_evtEditing_ = null; _evtSetEditingChrome_();', W);
  ok(shown(W, 'event-period-row') === true && shown(W, 'event-window-confirm-row') === false,
    'E19 and going back to a new event restores the dates — the regression was leaving them hidden');
})();

(function () {
  // ONE OWNER — the property, asserted as a property.
  var writers = [];
  ['event-period-row', 'event-window-confirm-row'].forEach(function (id) {
    var re = new RegExp("getElementById\\('" + id + "'\\)", 'g');
    var m = FCS.match(re) || [];
    writers.push(id + '=' + m.length);
  });
  eq(writers, ['event-period-row=1', 'event-window-confirm-row=1'],
    'E20 each period row is reached from exactly ONE place in the page');
  var SYNC = fnSrc(FCS, '_evtSyncPeriodUi_');
  ok(/getElementById\('event-period-row'\)/.test(SYNC) && /getElementById\('event-window-confirm-row'\)/.test(SYNC),
    'E21 and that place is _evtSyncPeriodUi_');
  var FLAG = fnSrc(FCS, 'toggleEventFlagFields');
  ok(!/event-period-row/.test(FLAG) && /_evtSyncPeriodUi_\(\);/.test(FLAG),
    'E22 the event flag no longer owns visibility and defers to it');
  ok(/_evtSyncPeriodUi_\(\);/.test(fnSrc(FCS, '_evtSetEditingChrome_')),
    'E23 so does the editing chrome');
  ok(/_evtSyncPeriodUi_\(\);/.test(fnSrc(FCS, '_evtRestoreLoadedWindow_')),
    'E24 and so does the restore path, which clears the tick');
  ok(/onchange="_evtOnWindowConfirmToggle\(\)"/.test(HTML),
    'E25 and the tick itself is wired to the toggle handler');
  ok(/id="event-start-date-label"/.test(HTML) && /id="event-end-date-label"/.test(HTML),
    'E26 with addressable labels for it to write');
  // hydration sets the flag programmatically — the regression's mechanism
  var HYD = fnSrc(FCS, '_evtHydrateExisting_');
  ok(/flagEl\.value = g\.eventName;/.test(HYD) && /_evtSetEditingChrome_\(\);/.test(HYD),
    'E27 hydration still assigns the flag programmatically, and now recomputes through the chrome');
})();

// =========================================================================================================
section('F. SAVE BEHAVIOUR — THE CONFIRMATION DECIDES, NOT THE VISIBILITY (§8)');
// =========================================================================================================
(function () {
  var SAVE = fnSrc(FCS, 'saveEventUpdate');
  ok(/var _winGate = _evtWindowChangeGate_\(eventStartDate, eventEndDate\);/.test(SAVE)
     && /if \(_winGate\.blocked\) \{ _evtShowWindowChangeNotice_\(_winGate\); return; \}/.test(SAVE),
    'F1  a changed window without the tick still writes NOTHING');
  ok(SAVE.indexOf('_evtWindowChangeGate_') < SAVE.indexOf('DB.upsertCampaign'),
    'F2  and it is refused before stage 1, so zero tables are touched');
  ok(!/if \(_evtEditingActive_\(\) && !_evtWindowConfirmChecked_\(\)\) \{\n    eventStartDate =/.test(SAVE),
    'F3  the save does NOT substitute the saved window for the form — swallowing a change is worse than refusing it');
  var GATE = fnSrc(FCS, '_evtWindowChangeGate_');
  ok(/if \(!_evtWindowChanged_\(startDate, endDate\)\) return \{ blocked: false, code: '' \};/.test(GATE),
    'F4  a ticked box with UNCHANGED dates is an ordinary save — the tick alone is not a change');
  ok(/return _evtWindowChanged_\(startDate, endDate\) && _evtWindowConfirmChecked_\(\);/
     .test(fnSrc(FCS, '_evtWindowEditActive_')),
    'F5  and reassignment needs BOTH a real change and the confirmation');
  ok(/for a non-Normal event/.test(SAVE),
    'F6  the dates are still required when an event is actually being written');
})();

// =========================================================================================================
section('G. OPERATOR-FACING COPY (§9)');
// =========================================================================================================
(function () {
  function copyOf(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''); }
  var CHROME = copyOf(fnSrc(FCS, '_evtSetEditingChrome_'));
  ok(!/campaign|forecast id|identity|scope|reassign/i.test(CHROME),
    'G1  the editing banner carries no write-path vocabulary');
  var W = uxWorld({ editing: SAVED });
  vm.runInContext('_evtSetEditingChrome_()', W);
  var lines = W.__els['event-editing-banner'].children.map(function (c) { return c.textContent; });
  eq(lines.length, 2, 'G2  and it is two short lines');
  eq(lines[0], 'Editing Prime Day · 2026/07/01 → 2026/07/15 · 13 SKUs',
    'G3  line 1: which event, its saved window, how many SKUs');
  ok(/Forecast quantities and prices can be edited here\./.test(lines[1]),
    'G4  line 2: that the forecast can be edited');
  ok(/Change the event period/.test(lines[1]),
    'G5  and that the period changes through the control the form actually shows');
  ok(lines[0].length <= 80 && lines[1].length <= 120, 'G6  both short');

  var LABEL = (/<input type="checkbox" id="event-window-confirm"[^>]*>\s*<span>([^<]+)<\/span>/.exec(HTML) || [])[1];
  eq(LABEL, 'Change the event period', 'G7  the tick says what it does, in four words');
  ok(lines[1].indexOf(LABEL) !== -1,
    'G8  and the banner names it by that exact label, so the two cannot drift apart');

  var NOTE = copyOf(fnSrc(FCS, '_evtPopulateExistingSelect'));
  ok(!/more than one window/.test(NOTE),
    'G9  the picker no longer advertises a second window per SKU — §10.1 forbids exactly that');
  ok(/saved event/.test(NOTE), 'G10 and counts saved events, which is what the list holds');
})();

// =========================================================================================================
section('H. NON-REGRESSION');
// =========================================================================================================
(function () {
  ok(/function _evtRowCap_\(\) \{ return _evtEditingActive_\(\) \? Infinity : EVT_MAX_ROWS; \}/.test(FCS),
    'H1  MAX 8 is still an authoring limit only — an existing event has no cap');
  ok(/var EVT_MAX_ROWS = 8;/.test(FCS), 'H2  and it is still 8 for a new one');
  ok(/FC_SE_UNIQUENESS_FIELDS_/.test(read('assets/specs/active/apps-script/14_fc_write_handlers.gs')),
    'H3  the server uniqueness guard is untouched');
  ok(/_evtDuplicateConflicts_/.test(FCS), 'H4  and so is the client preflight');
  ok(/REDIRECT_TARGET_NOT_FOUND/.test(read('assets/js/api/operation-system-db-api.js')),
    'H5  the expired-redirect read recovery is untouched');
  ok(/_kmCanonicalWrite_/.test(read('assets/js/api/operation-system-db-api.js')),
    'H6  and the write transport is unchanged');
  ok(/SPECIAL_EVENT_UNIQUENESS_KEY/.test(SPEC), 'H7  §10.1 is still frozen');
  ok(/### 10\.2 Event period/.test(SPEC) && /## 14\. FC Summary initial read/.test(SPEC),
    'H8  with §10.2 and §14 frozen beside it');
  // the B1 preflight must survive this round
  ok(/importFcRegularForecastBatch/.test(read('assets/js/api/operation-system-db-api.js')),
    'H9  the Regular batch writer still exists — B1 hardened it in place');
  var SAVE = fnSrc(FCS, 'saveEventUpdate');
// B1-PERF converted it, which is what A3-R10 recorded this line in anticipation of. Inverted rather
// than deleted: the loop must not come back, and the batch must be the ONE request that replaced it.
ok(!/for \(var k = 0; k < lines\.length; k\+\+\)/.test(SAVE),
  'H10 Special stage 3 is no longer a per-SKU loop');
ok(/DB\.importFcSpecialEventsBatch\(evRows/.test(SAVE),
  'H10a it is one batch request over the action that already existed');
ok(!/await DB\.upsertFcSpecialEvent\(/.test(SAVE),
  'H10b and the per-SKU writer is not called from the builder save at all');
})();

// =========================================================================================================
section('M. MUTANTS — each injects a real fault and must be caught');
// =========================================================================================================
await (async function () {
  // M1 the ledger is left behind when the model is discarded — the original defect
  var m = faulted(fnSrc(FCS, '_fcInvalidateModel_'),
    '  _fcSliceState_ = {};          // and nothing may still claim to describe what was just discarded\n', '',
    'M1');
  var W = readWorld({ src: { _fcInvalidateModel_: m } });
  W.__server = function (s) { return s === 'regular' ? okEnv(s) : timeoutEnv(); };
  var f = vm.runInContext('_fcSliceFetch_', W);
  await f('regular');
  try { await f('bootstrap'); } catch (e) {}
  vm.runInContext('_fcRenderError_({ code: "REQUEST_TIMEOUT" })', W);
  // AIMED AT THE DIVERGENCE ITSELF, not at the empty table it used to produce. §14.1's retry scope
  // (A13) independently asks for what the tab is missing, so it MASKS this fault downstream — the
  // rows come back either way. A mutant that a second fix covers proves nothing about the first, so
  // this asserts the property the reset alone owns: no record may claim CURRENT about rows the model
  // does not hold.
  var states = vm.runInContext('_fcSliceStates_()', W);
  var lying = Object.keys(states).filter(function (s) {
    return states[s] === 'CURRENT' && vm.runInContext('_fcSliceHasData_("' + s + '")', W) === false;
  });
  mutant('M1 the ledger outlives the model it described', lying.length > 0);
})();

await (async function () {
  // M2 Retry asks only for what is marked failed
  var m = faulted(fnSrc(FCS, '_fcSlicesNeededNow_'), '  return need;', '  return [];', 'M2');
  var W = readWorld({ src: { _fcSlicesNeededNow_: m } });
  W.__server = function (s) { return okEnv(s); };
  var f = vm.runInContext('_fcSliceFetch_', W);
  await Promise.all([f('bootstrap'), f('regular')]);
  vm.runInContext('_fcRenderError_({ code: "REQUEST_TIMEOUT" })', W);
  mutant('M2 Retry issues no request at all after an invalidation', retryScope(W).length === 0);
})();

await (async function () {
  // M3 the generation guard is removed
  var m = faulted(fnSrc(FCS, '_fcSliceFetch_'),
    '      if (_fcModelGenNow_() !== gen) {', '      if (false) {', 'M3');
  var W = readWorld({ src: { _fcSliceFetch_: m } });
  var release;
  W.__server = function (s) {
    if (s === 'regular') return new Promise(function (r) { release = function () { r({ success: true, data: payload('regular') }); }; });
    return okEnv(s);
  };
  var f = vm.runInContext('_fcSliceFetch_', W);
  var slow = f('regular');
  vm.runInContext('_fcRenderError_({ code: "REQUEST_TIMEOUT" })', W);
  await f('bootstrap');
  release();
  try { await slow; } catch (e) {}
  mutant('M3 a superseded answer is merged into the newer model',
    vm.runInContext('_fcHas_("fcRegularForecast")', W) === true);
})();

await (async function () {
  // M4 a failed slice keeps its single-flight handle — the "reload fixes it" bug
  var m = faulted(fnSrc(FCS, '_fcSliceFetch_'),
    '  rec.flight = p.then(function (v) { rec.flight = null; return v; },\n                      function (e) { rec.flight = null; throw e; });',
    '  rec.flight = p.then(function (v) { rec.flight = null; return v; },\n                      function (e) { throw e; });', 'M4');
  var W = readWorld({ src: { _fcSliceFetch_: m } });
  var n = 0;
  W.__server = function (s) { n++; return n === 1 ? timeoutEnv() : okEnv(s); };
  var f = vm.runInContext('_fcSliceFetch_', W);
  try { await f('bootstrap'); } catch (e) {}
  var second = null;
  try { await f('bootstrap'); second = 'OK'; } catch (e) { second = 'REUSED_FAILURE'; }
  mutant('M4 a failed flight is left in the record, so Retry re-awaits the rejection', second === 'REUSED_FAILURE');
})();

(function () {
  // M5 the cold mount dispatches without asking the arbiter
  var m = faulted(fnSrc(FCS, '_fcDispatchWhenBootClear_'),
    "    try { return ba.dependencyState(n) === 'PENDING'; } catch (e) { return false; }",
    '    return false;', 'M5');
  var sb = { console: console, Promise: Promise, window: { KM: { bootArbiter: {
    dependencyState: function () { return 'PENDING'; },
    whenReady: function () { waited = true; return Promise.resolve({ waited_ms: 1, capped: [] }); },
    noteIntent: function () {} } } } };
  var waited = false, went = false;
  vm.createContext(sb);
  vm.runInContext(varSrc(FCS, '_FC_BOOT_DEPS_'), sb);
  vm.runInContext(m, sb);
  sb.__go = function () { went = true; };
  vm.runInContext('_fcDispatchWhenBootClear_(__go)', sb);
  mutant('M5 the mount dispatches beside an open boot read', waited === false && went === true);
})();

(function () {
  // M6 marketplaces is re-added as a prerequisite — the duplicate physical read returns
  var sb = { console: console }; vm.createContext(sb);
  vm.runInContext(faulted(varSrc(FCS, '_FC_PREREQ_TABLES_'),
    "  regular: ['sku_details', 'marketplace_skus', 'fc_regular_forecast'],",
    "  regular: ['sku_details', 'marketplace_skus', 'marketplaces', 'fc_regular_forecast'],", 'M6'), sb);
  mutant('M6 marketplaces is fetched again although the bootstrap slice carries it',
    sb._FC_PREREQ_TABLES_.regular.indexOf('marketplaces') !== -1);
})();

(function () {
  // M7 the period rows are keyed on the event flag again
  var m = faulted(fnSrc(FCS, '_evtSyncPeriodUi_'),
    '  var showDates = !editing || confirmed;',
    "  var showDates = (document.getElementById('event-name-input') || {}).value !== 'Normal';", 'M7');
  var W = uxWorld({ editing: null, syncSrc: m });
  W.__els['event-name-input'].value = 'Normal';
  vm.runInContext('_evtSyncPeriodUi_()', W);
  mutant('M7 the event flag can hide a new event\'s dates again', shown(W, 'event-period-row') === false);
})();

(function () {
  // M8 a saved event shows its date editor unasked
  var m = faulted(fnSrc(FCS, '_evtSyncPeriodUi_'),
    '  var showDates = !editing || confirmed;', '  var showDates = true;', 'M8');
  var W = uxWorld({ editing: SAVED, syncSrc: m });
  vm.runInContext('_evtSyncPeriodUi_()', W);
  mutant('M8 an existing event exposes its period editor by default', shown(W, 'event-period-row') === true);
})();

(function () {
  // M9 the confirmation tick is offered on a NEW event
  var m = faulted(fnSrc(FCS, '_evtSyncPeriodUi_'),
    '  if (confirmRow) confirmRow.hidden = !editing;', '  if (confirmRow) confirmRow.hidden = false;', 'M9');
  var W = uxWorld({ editing: null, syncSrc: m });
  vm.runInContext('_evtSyncPeriodUi_()', W);
  mutant('M9 a new event offers a period-change confirmation', shown(W, 'event-window-confirm-row') === true);
})();

(function () {
  // M10 unticking leaves the abandoned edit in the hidden field
  var TOG = fnSrc(FCS, '_evtOnWindowConfirmToggle_');
  var m = faulted(TOG,
    "    var sd = document.getElementById('event-start-date'); if (sd) sd.value = _trStrTok_(o.startDate);", '', 'M10');
  var W = uxWorld({ editing: SAVED });
  vm.runInContext(m, W);
  W.__els['event-window-confirm'].checked = true;
  vm.runInContext('_evtOnWindowConfirmToggle_()', W);
  W.__els['event-start-date'].value = '2026-08-01';
  W.__els['event-window-confirm'].checked = false;
  vm.runInContext('_evtOnWindowConfirmToggle_()', W);
  mutant('M10 an abandoned period edit survives in a hidden field',
    W.__els['event-start-date'].value === '2026-08-01');
})();

(function () {
  // M11 the banner reverts to write-path vocabulary
  var m = faulted(fnSrc(FCS, '_evtSetEditingChrome_'),
    "      l2.textContent = 'Forecast quantities and prices can be edited here. '",
    "      l2.textContent = 'Its campaign, line and forecast ids are preserved. '", 'M11');
  var W = uxWorld({ editing: SAVED });
  vm.runInContext(m, W);
  vm.runInContext('_evtSetEditingChrome_()', W);
  var txt = W.__els['event-editing-banner'].children.map(function (c) { return c.textContent; }).join(' ');
  mutant('M11 the banner describes storage to an operator', /campaign|forecast id/i.test(txt));
})();

(function () {
  // M12 an unknown SKU count is stated as a fact. The first version of this mutant asserted the
  // GUARD instead of faulting it — it changed nothing in the source and therefore could not fail,
  // which reads as an assertion but is a blank. This one removes the guard.
  var m = faulted(fnSrc(FCS, '_evtSetEditingChrome_'),
    "        + (n ? (' \u00b7 ' + n + ' SKU' + (n === 1 ? '' : 's')) : '');",
    "        + (' \u00b7 ' + n + ' SKU' + (n === 1 ? '' : 's'));", 'M12');
  var W = uxWorld({ editing: Object.assign({}, SAVED, { skuCount: undefined }) });
  vm.runInContext(m, W);
  vm.runInContext('_evtSetEditingChrome_()', W);
  var l0 = W.__els['event-editing-banner'].children[0].textContent;
  mutant('M12 an unknown SKU count is stated as a number anyway', /undefined SKU/.test(l0));
})();

// =========================================================================================================
section('V. VACUITY — the instruments must be able to fail');
// =========================================================================================================
(function () {
  var W = uxWorld({ editing: SAVED });
  vm.runInContext('_evtSyncPeriodUi_()', W);
  ok(shown(W, 'event-period-row') === false && shown(W, 'event-window-confirm-row') === true,
    'V1  `shown` really does read both a style.display and a hidden flag');
  W.__els['event-period-row'].style.display = '';
  ok(shown(W, 'event-period-row') === true, 'V2  and it changes when the element does');
})();
await (async function () {
  var W = readWorld();
  W.__server = function () { return timeoutEnv(); };
  try { await vm.runInContext('_fcSliceFetch_', W)('regular'); } catch (e) {}
  ok(vm.runInContext('_fcGetRegularForecast()', W).length === 0,
    'V3  a failed read really does leave the accessor empty, so A9 is not a tautology');
})();

console.log('\n' + '='.repeat(100));
console.log((fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log('='.repeat(100));
if (survived.length) console.error('SURVIVED: ' + survived.join(' | '));
process.exitCode = fail ? 1 : 0;
}

main().catch(function (e) { console.error('HARNESS ERROR', e); process.exitCode = 1; });
