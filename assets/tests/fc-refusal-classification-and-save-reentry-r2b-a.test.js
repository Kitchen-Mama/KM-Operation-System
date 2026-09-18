// Kitchen Mama Operation System — FC-SUMMARY-R2B-A
// PROVEN-ZERO-WRITE REFUSAL CLASSIFICATION, AND SAVE RE-ENTRY AFTER A SUCCESSFUL SAVE
//
// TWO DEFECTS, BOTH ABOUT TELLING THE OPERATOR SOMETHING UNTRUE.
//
// (1) FC Summary's write adapters answer `!json.success` by THROWING, so a deterministic server refusal and a
//     dead socket arrived down the same `.catch` and were both reported as "The save result could not be
//     confirmed." For a `PRODUCTION_SAFETY:` schema refusal that is wrong in all three directions at once: the
//     outcome IS confirmed, nothing was written, and retrying cannot help. The shared adapter has always known
//     which strings carry that proof — `_kmZeroWriteProven_` — but the rule was private to the weekly command
//     runner, so this page could not ask. R2B-A publishes it and this page asks it. It does NOT restate it: if
//     the export is missing, the answer is `false` and the outcome stays UNKNOWN, which claims less rather
//     than more.
//
// (2) `_fcSetSaveEnabled(false)` / `_fcEventSetSaveEnabled(false)` were reversed only on the refusal and catch
//     branches. After a SUCCESSFUL save the flag stayed `true`, `exitEditMode` never cleared it, and entering
//     edit mode again showed a visible, permanently dead Save until the operator happened to type in a cell.
//
// Every assertion drives the REAL page functions in a vm sandbox and reads observable state: which message was
// shown, what the write state machine ended in, whether the Save control is usable, how many requests were
// issued. Mutants are scored the same way — never by source text.
// Run: node assets/tests/fc-refusal-classification-and-save-reentry-r2b-a.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
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
function score(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var FC = fs.readFileSync(path.join(__dirname, '..', 'js/pages/fc-summary.js'), 'utf8').replace(/\r\n/g, '\n');
var DBAPI = fs.readFileSync(path.join(__dirname, '..', 'js/api/operation-system-db-api.js'), 'utf8').replace(/\r\n/g, '\n');

function extractFn(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function extractVar(src, name) {
  var re = new RegExp('^var ' + name + '\\s*=', 'm');
  var m = re.exec(src);
  if (!m) throw new Error('var not found: ' + name);
  var i = m.index, d = 0;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(i, j + 1);
  }
  throw new Error('unterminated var: ' + name);
}
function mutate(src, from, to) {
  var n = src.split(from).length - 1;
  if (n !== 1) { console.error('  (mutant anchor matched ' + n + ' times — not applied)'); return null; }
  return src.split(from).join(to);
}

// ---- THE SHARED AUTHORITY, taken from the adapter source rather than re-typed here -----------------
// If this page's idea of a proven zero write and the adapter's ever diverge, that divergence is the bug
// this suite must see. So the suite runs the adapter's REAL function as the page's collaborator.
var ZERO_WRITE_SRC = extractFn(DBAPI, '_kmZeroWriteProven_');
var CANON_SRC = extractFn(DBAPI, '_kmExtractCanonicalCode_');
var CANON_LIST = extractVar(DBAPI, 'KM_CANONICAL_CODES');

var VARS = ['FC_PREREQ_', 'FC_WRITE_', 'FC_VIEW_', 'FC_MSG_',
  // FC-SUMMARY-R2B-A2-R3 — the retry-state map. The banner's LABEL and the sentence that names it now
  // come from one place, so both must be in the sandbox for the functions below to resolve.
  'FC_RETRY_', 'FC_RETRY_LABEL_',
  '_fcPrereqState_', '_fcPrereqFlight_',
  '_fcPrereqLoads_', '_fcPrereqTransition_', '_fcWriteState_', '_fcWriteFlight_', '_fcViewState_',
  '_fcReadbackFlight_', '_fcReadbackLoads_', '_fcLastReceipt_', '_fcEbStage_', '_fcEbCommitted_', '_fcMeta_'];
var FNS = ['_fcEpoch_', '_fcOwns_', '_fcMetricsSnapshot_',
  // FC-SUMMARY-R2B-A2-R3 — the label accessor the refusal and unknown-outcome banners now consult.
  '_fcRetryLabel_', '_fcBannerHost_', '_fcClearBanner_',
  '_fcShowBanner_', '_fcRerenderTables_', '_fcRefreshViewNow_', '_fcWriteBegin_', '_fcWriteEnd_',
  '_fcClassifyWrite_', '_fcSummaryOf_', '_fcCountsLine_', '_fcReceipt_', '_fcRefusalText_',
  '_fcUnknownOutcome_', '_fcSettleWrite_', '_fcZeroWriteProven_', '_fcCanonicalCode_',
  '_fcZeroWriteRefusal_', '_fcBuilderFailure_', '_fcFailWrite_', '_fcErrDetail_', '_fcEffectiveWorkspace',
  // §5 — the edit-mode entry/exit pair for both tables
  '_fcEditCounts', '_fcUpdateEditStatus', '_fcSetEditLock', '_fcSetSaveEnabled', 'confirmFcEdit',
  'exitEditMode', '_fcEventCounts', '_fcEventUpdateStatus', '_fcEventSetEditLock',
  '_fcEventSetSaveEnabled', 'enterEventEditMode', 'exitEventEditMode'];

function pageSource(src) {
  return VARS.map(function (v) { return extractVar(src, v); })
    .concat(FNS.map(function (f) { return extractFn(src, f); })).join('\n');
}

// -------------------------------------------------------------------------------------------------
function makeDom() {
  var byId = Object.create(null);
  function el(tag) {
    var self = {
      tagName: tag, children: [], _text: '', _html: '', hidden: false, disabled: false,
      dataset: {}, attrs: {}, onclick: null, style: {}, _id: null, classList: { toggle: function () {} },
      appendChild: function (c) { self.children.push(c); return c; },
      remove: function () { if (self._id) delete byId[self._id]; },
      setAttribute: function (k, v) { self.attrs[k] = String(v); },
      removeAttribute: function (k) { delete self.attrs[k]; },
      getAttribute: function (k) { return self.attrs[k] === undefined ? null : self.attrs[k]; },
      click: function () { if (typeof self.onclick === 'function') self.onclick({}); },
      text: function () { return self._text + self.children.map(function (c) { return c.text ? c.text() : ''; }).join(' '); }
    };
    Object.defineProperty(self, 'textContent', {
      get: function () { return self._text; }, set: function (v) { self._text = String(v); } });
    Object.defineProperty(self, 'innerHTML', {
      get: function () { return self._html; },
      set: function (v) { self._html = String(v); if (v === '') self.children.length = 0; } });
    Object.defineProperty(self, 'id', {
      get: function () { return self._id; }, set: function (v) { self._id = String(v); byId[self._id] = self; } });
    return self;
  }
  var doc = {
    createElement: el,
    getElementById: function (id) { return byId[id] || null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    __add: function (id) { var e = el('div'); e.id = id; return e; },
    __byId: byId
  };
  ['fc-view-banner', 'fc-mode-select-refusal'].forEach(function (i) { doc.__add(i).hidden = true; });
  ['fc-save-btn', 'fc-cancel-btn', 'fc-edit-btn', 'fc-event-save-btn', 'fc-event-cancel-btn',
   'fc-event-edit-btn', 'fc-target-save-btn', 'fc-action-buttons', 'fc-summary-section',
   'fc-year-select', 'fc-sku-input', 'fc-page-size'].forEach(function (i) { doc.__add(i); });
  return doc;
}

/** Build a sandbox holding the REAL page functions plus the REAL shared classifier. */
function rig(opts) {
  opts = opts || {};
  var src = opts.src || FC;
  var seen = { alerts: [], closes: 0, renders: 0, readbacks: 0, errorRedraws: 0, writes: 0 };
  var doc = makeDom();
  var epoch = { n: opts.epoch === undefined ? 1 : opts.epoch, current: opts.current === undefined ? 1 : opts.current };

  // The adapter export under test. `shared:false` models an older cached adapter that never published it.
  var DB = { refreshCacheTables: function () { return Promise.resolve(); } };
  var sandbox = {
    console: console, Promise: Promise, Date: Date, JSON: JSON, Object: Object, Array: Array,
    String: String, Number: Number, Math: Math, Map: Map, Set: Set, setTimeout: setTimeout,
    RegExp: RegExp, document: doc,
    alert: function (m) { seen.alerts.push(String(m)); },
    window: { KM: { DB: DB,
      lifecycle: {
        currentEpoch: function () { return epoch.n; },
        commitGuard: function (e, sec) { return e === epoch.current && sec === 'fc-summary-section'; },
        isCurrent: function (e) { return e === epoch.current; } },
      api: { workspaceApiActive: function () { return opts.workspaceActive !== false; } } } },
    _fcReadModel: opts.readModel === undefined ? { fcRegularForecast: [1] } : opts.readModel,
    _fcUseDb: function () { return opts.live !== false; },
    _fcResetSecondaryCache: function () {},
    _fcWorkspaceRefresh_: function () { seen.readbacks++; return Promise.resolve(); },
    _fcRenderError_: function () { seen.errorRedraws++; },
    renderFcRegularTable: function () { seen.renders++; },
    renderFcEventTable: function () { seen.renders++; },
    renderTargetRulesTable: function () { seen.renders++; },
    renderFcRegularTableEditable: function () { seen.renders++; },
    renderFcEventTableEditable: function () { seen.renders++; },
    closeFcModal: function () { seen.closes++; },
    // §5 collaborators for edit-mode entry
    fcEditState: { isEditing: false, isEditingEvent: false, dirty: new Map(), dirtyEvent: new Map(),
      editRows: null, editEventRows: null, modifiedRows: new Set(), modifiedEventRows: new Set(),
      originalData: null, originalEventData: null },
    fcPaginationState: { currentPage: 1, pageSize: 25 },
    getFcFilters: function () { return {}; },
    _fcRegularEditSource: function () { return opts.rows || [{ sku: 'A' }]; },
    _fcEventEditSource: function () { return opts.rows || [{ sku: 'A' }]; },
    filterFcRegular: function (s) { return s; },
    filterFcEvent: function (s) { return s; }
  };
  sandbox.window.document = doc;
  vm.createContext(sandbox);
  // the REAL shared classifier, as the adapter publishes it
  vm.runInContext(CANON_LIST + '\n' + ZERO_WRITE_SRC + '\n' + CANON_SRC, sandbox, { filename: 'km-db-adapter.js' });
  if (opts.shared !== false) {
    DB.zeroWriteProven = function (m) { return sandbox._kmZeroWriteProven_(m); };
    DB.canonicalErrorCode = function (m) { return sandbox._kmExtractCanonicalCode_(m); };
  }
  vm.runInContext(pageSource(src), sandbox, { filename: 'fc-r2ba-sandbox.js' });
  sandbox.__seen = seen; sandbox.__doc = doc; sandbox.__epoch = epoch;
  return sandbox;
}

var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
function settle(n) { var p = Promise.resolve(); for (var i = 0; i < (n || 6); i++) p = p.then(tick); return p; }
function banner(S) { return S.__doc.getElementById('fc-view-banner'); }
function saveBtn(S) { return S.__doc.getElementById('fc-save-btn'); }
function evSaveBtn(S) { return S.__doc.getElementById('fc-event-save-btn'); }
function lastAlert(S) { return S.__seen.alerts[S.__seen.alerts.length - 1] || ''; }

var SCHEMA_ERR = new Error('PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH [campaigns]');
var TIMEOUT_ERR = new Error('No answer arrived within 60s.');

// =================================================================================================
section('A — THE CLASSIFIER BRIDGE ASKS THE SHARED AUTHORITY, AND DOES NOT RESTATE IT');
// =================================================================================================
(function () {
  var S = rig();
  ok(S._fcZeroWriteProven_(SCHEMA_ERR) === true, 'A1  a PRODUCTION_SAFETY refusal is a PROVEN zero write');
  ok(S._fcZeroWriteProven_(new Error('zero rows written')) === true, 'A2  so is a documented pre-write refusal');
  ok(S._fcZeroWriteProven_(new Error('could not acquire lock')) === true, 'A3  so is an unavailable lock');
  ok(S._fcZeroWriteProven_(TIMEOUT_ERR) === false, 'A4  a transport timeout is NOT — the write may have landed');
  ok(S._fcZeroWriteProven_(new Error('API returned 502')) === false, 'A5  nor is a gateway error');
  ok(S._fcZeroWriteProven_(null) === false, 'A6  nor is a missing error object');
  eq(S._fcCanonicalCode_(SCHEMA_ERR), 'PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH',
    'A7  the canonical token is recovered, so the operator is told WHICH refusal this is');
  eq(S._fcCanonicalCode_(TIMEOUT_ERR), '', 'A8  and a transport error carries no canonical token');
})();
(function () {
  // The decisive one: with the shared export absent, the page must NOT fall back to its own regex.
  var S = rig({ shared: false });
  ok(S._fcZeroWriteProven_(SCHEMA_ERR) === false,
    'A9  with the shared authority unavailable the answer is false — no page-local re-approximation');
  eq(S._fcCanonicalCode_(SCHEMA_ERR), '', 'A10 and no page-local token parsing either');
})();

// =================================================================================================
section('B — THE FOUR-WAY SPLIT, ACROSS EVERY CONTROL THAT SHARES _fcFailWrite_');
// =================================================================================================
var CONTROLS = ['baseEdit', 'event', 'regular', 'targetRule', 'targetRuleDelete', 'import'];
CONTROLS.forEach(function (ctl) {
  var S = rig();
  var re = [];
  S._fcWriteBegin_(ctl);
  S._fcFailWrite_(SCHEMA_ERR, { ctl: ctl, epoch: 1, reenable: function (v) { re.push(v); } });
  eq(S._fcWriteState_[ctl], 'CONFIRMED_REFUSAL', 'B1 ' + ctl + ': a proven zero write settles as CONFIRMED_REFUSAL');
  ok(lastAlert(S).indexOf('refused the save and wrote nothing') > -1,
    'B2 ' + ctl + ': the operator is told nothing was written', lastAlert(S));
  ok(lastAlert(S).indexOf('could not be confirmed') === -1,
    'B3 ' + ctl + ': and is NOT told the result could not be confirmed');
  ok(lastAlert(S).indexOf('PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH') > -1,
    'B4 ' + ctl + ': the canonical token is named');
  eq(re, [true], 'B5 ' + ctl + ': Save is re-enabled exactly once');
  eq(S.__seen.closes, 0, 'B6 ' + ctl + ': no modal was closed — every input is preserved');
  eq(S.__seen.errorRedraws, 0, 'B7 ' + ctl + ': the table was not replaced by an error');
});
CONTROLS.forEach(function (ctl) {
  var S = rig();
  var re = [];
  S._fcWriteBegin_(ctl);
  S._fcFailWrite_(TIMEOUT_ERR, { ctl: ctl, epoch: 1, reenable: function (v) { re.push(v); } });
  eq(S._fcWriteState_[ctl], 'OUTCOME_UNKNOWN', 'B8 ' + ctl + ': an unreadable failure STAYS unknown');
  ok(lastAlert(S).indexOf('could not be confirmed') > -1, 'B9 ' + ctl + ': and says so');
  ok(lastAlert(S).indexOf('wrote nothing') === -1,
    'B10 ' + ctl + ': it must never claim nothing was written when it cannot know');
  eq(re, [true], 'B11 ' + ctl + ': the control is released either way');
});

// A refusal inside a readable envelope is unchanged — this round did not touch that path.
(function () {
  var S = rig();
  S._fcWriteBegin_('regular');
  var out = S._fcSettleWrite_({ success: false, error: 'Missing campaign_name' },
    { ctl: 'regular', op: 'x', rows: 1, epoch: 1, reenable: function () {} });
  eq(out, 'CONFIRMED_REFUSAL', 'B12 an explicit success:false is still a confirmed refusal');
  ok(lastAlert(S).indexOf('The server refused the save: Missing campaign_name') > -1,
    'B13 with its own message, unchanged by this round', lastAlert(S));
})();

// =================================================================================================
section('C — NO AUTOMATIC RETRY, AND THE REMEDY OFFERED IS A READ');
// =================================================================================================
(function () {
  var S = rig();
  S._fcWriteBegin_('baseEdit');
  S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
  return settle().then(function () {
    eq(S.__seen.writes, 0, 'C1  a refusal issues no replay of the write');
    ok(banner(S).hidden === false, 'C2  a non-blocking banner is shown');
    ok(/Check latest data/.test(banner(S).text()), 'C3  offering a READ, never another Save', banner(S).text());
    eq(S.__seen.readbacks, 0, 'C4  and the read only happens when the operator asks for it');
    // press it
    var btn = banner(S).children.filter(function (c) { return c.tagName === 'button'; })[0];
    if (btn) btn.click();
    return settle().then(function () { eq(S.__seen.readbacks, 1, 'C5  pressing it issues exactly one read'); });
  });
})();
(function () {
  // Route away mid-flight: the outcome is still recorded, but nothing is drawn.
  var S = rig({ epoch: 1, current: 2 });
  S._fcWriteBegin_('event');
  var re = [];
  S._fcFailWrite_(SCHEMA_ERR, { ctl: 'event', epoch: 1, reenable: function (v) { re.push(v); } });
  eq(S._fcWriteState_['event'], 'UNMOUNTED', 'C6  a refusal that lands after route-away is marked UNMOUNTED');
  eq(S.__seen.alerts, [], 'C7  and shows nothing');
  eq(re, [], 'C8  and touches no control');
})();

// =================================================================================================
section('D — THE SPECIAL EVENT BUILDER NAMES THE STAGE AND THE PARTIAL MANIFEST');
// =================================================================================================
(function () {
  var S = rig();
  S._fcEbStage_ = 'stage 1 — campaigns'; S._fcEbCommitted_ = [];
  S._fcWriteBegin_('eventBuilder');
  S._fcBuilderFailure_(SCHEMA_ERR, 1);
  eq(S._fcWriteState_['eventBuilder'], 'CONFIRMED_REFUSAL', 'D1  a proven refusal at stage 1 is CONFIRMED_REFUSAL');
  ok(lastAlert(S).indexOf('refused at stage 1 — campaigns') > -1, 'D2  the stage is named', lastAlert(S));
  ok(lastAlert(S).indexOf('Nothing had been committed by an earlier stage') > -1,
    'D3  and the manifest says nothing exists to reconcile');
})();
(function () {
  var S = rig();
  S._fcEbStage_ = 'stage 2 — campaign_sku_lines'; S._fcEbCommitted_ = ['campaigns'];
  S._fcWriteBegin_('eventBuilder');
  S._fcBuilderFailure_(SCHEMA_ERR, 1);
  ok(lastAlert(S).indexOf('refused at stage 2 — campaign_sku_lines') > -1, 'D4  a stage-2 refusal names stage 2');
  ok(lastAlert(S).indexOf('campaigns were already committed and still need reconciling') > -1,
    'D5  and reports the committed stage — the sequence is NOT atomic and says so', lastAlert(S));
})();
(function () {
  var S = rig();
  S._fcEbStage_ = 'stage 3 — fc_special_events'; S._fcEbCommitted_ = ['campaigns', 'campaign_sku_lines'];
  S._fcWriteBegin_('eventBuilder');
  S._fcBuilderFailure_(TIMEOUT_ERR, 1);
  eq(S._fcWriteState_['eventBuilder'], 'OUTCOME_UNKNOWN', 'D6  an unreadable stage-3 failure stays UNKNOWN');
  ok(lastAlert(S).indexOf('could not be confirmed') > -1, 'D7  and says so');
  ok(lastAlert(S).indexOf('campaigns + campaign_sku_lines were already committed') > -1,
    'D8  while still reporting exactly what the earlier stages committed', lastAlert(S));
})();
(function () {
  var S = rig({ epoch: 1, current: 2 });
  S._fcWriteBegin_('eventBuilder');
  S._fcBuilderFailure_(SCHEMA_ERR, 1);
  eq(S._fcWriteState_['eventBuilder'], 'UNMOUNTED', 'D9  after route-away the builder draws nothing');
  eq(S.__seen.alerts, [], 'D10 and shows nothing');
})();

// =================================================================================================
section('E — BASE FC: SAVE IS USABLE WHEN EDIT MODE IS RE-ENTERED AFTER A SUCCESS');
// =================================================================================================
(function () {
  var S = rig();
  // open
  S.confirmFcEdit();
  ok(saveBtn(S).disabled === false, 'E1  entering edit mode leaves Save usable');
  // a successful save disables it, then exits edit mode (exactly what the success path does)
  S._fcSetSaveEnabled(false);
  S.exitEditMode();
  ok(saveBtn(S).disabled === true, 'E2  the in-flight save disabled it, and exit did not re-enable it');
  // re-open — this is the defect
  S.confirmFcEdit();
  ok(saveBtn(S).disabled === false, 'E3  RE-ENTERING edit mode after a successful save leaves Save usable');
  ok(S.fcEditState.isEditing === true, 'E4  and the page really is in edit mode');
})();
(function () {
  // An invalid cell must still disable it — the fix must not become "always enabled".
  var S = rig();
  S.confirmFcEdit();
  S.fcEditState.dirty = new Map([['k', { months: {}, invalid: { jan: 1 } }]]);
  S._fcUpdateEditStatus();
  ok(saveBtn(S).disabled === true, 'E5  an invalid cell still disables Save');
  S.fcEditState.dirty = new Map([['k', { months: { jan: 5 }, invalid: {} }]]);
  S._fcUpdateEditStatus();
  ok(saveBtn(S).disabled === false, 'E6  and fixing it re-enables Save');
})();
(function () {
  // Refusal path: Save must be usable and edit mode must still be open.
  var S = rig();
  S.confirmFcEdit();
  S._fcWriteBegin_('baseEdit');
  S._fcSetSaveEnabled(false);
  S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: S._fcSetSaveEnabled });
  ok(saveBtn(S).disabled === false, 'E7  after a refusal Save is usable again');
  ok(S.fcEditState.isEditing === true, 'E8  and edit mode was never left — the edits survive');
})();
(function () {
  var S = rig();
  S.confirmFcEdit();
  S._fcWriteBegin_('baseEdit');
  S._fcSetSaveEnabled(false);
  S._fcFailWrite_(TIMEOUT_ERR, { ctl: 'baseEdit', epoch: 1, reenable: S._fcSetSaveEnabled });
  ok(saveBtn(S).disabled === false, 'E9  after an unknown outcome Save is usable again');
  ok(S.fcEditState.isEditing === true, 'E10 and the edits still survive');
})();
(function () {
  var S = rig({ epoch: 1, current: 2 });
  S.confirmFcEdit();
  S._fcWriteBegin_('baseEdit');
  S._fcSetSaveEnabled(false);
  S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: S._fcSetSaveEnabled });
  ok(saveBtn(S).disabled === true, 'E11 after route-away no control is touched (the dead page draws nothing)');
})();

// =================================================================================================
section('F — SPECIAL EVENT: THE SAME GUARANTEE');
// =================================================================================================
(function () {
  var S = rig();
  S.enterEventEditMode();
  ok(evSaveBtn(S).disabled === false, 'F1  entering Special Event edit mode leaves Save usable');
  S._fcEventSetSaveEnabled(false);
  S.exitEventEditMode();
  ok(evSaveBtn(S).disabled === true, 'F2  a successful save left it disabled');
  S.enterEventEditMode();
  ok(evSaveBtn(S).disabled === false, 'F3  RE-ENTERING after a successful save leaves Save usable');
  ok(S.fcEditState.isEditingEvent === true, 'F4  and the page really is in event edit mode');
})();
(function () {
  var S = rig();
  S.enterEventEditMode();
  S.fcEditState.dirtyEvent = new Map([['k', { fcQty: 1, invalid: true }]]);
  S._fcEventUpdateStatus();
  ok(evSaveBtn(S).disabled === true, 'F5  an invalid event cell still disables Save');
})();
(function () {
  var S = rig();
  S.enterEventEditMode();
  S._fcWriteBegin_('event');
  S._fcEventSetSaveEnabled(false);
  S._fcFailWrite_(SCHEMA_ERR, { ctl: 'event', epoch: 1, reenable: S._fcEventSetSaveEnabled });
  ok(evSaveBtn(S).disabled === false, 'F6  after a refusal event Save is usable again');
  ok(S.fcEditState.isEditingEvent === true, 'F7  and event edit mode was never left');
})();

// =================================================================================================
section('G — MUTANTS');
// =================================================================================================
function withSrc(src, fn) { if (src === null) return false; try { return fn(rig({ src: src })); } catch (e) { return false; } }

score('N1  the zero-write bridge always answers false (every refusal becomes UNKNOWN again)',
  withSrc(mutate(FC, "  if (!DB || typeof DB.zeroWriteProven !== 'function') return false;\n  try { return DB.zeroWriteProven(msg) === true; } catch (e) { return false; }",
    '  return false;'), function (S) {
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
      return S._fcWriteState_['baseEdit'] !== 'CONFIRMED_REFUSAL';
    }));

score('N2  the bridge always answers true (a dead socket claimed as a proven zero write)',
  withSrc(mutate(FC, "  if (!DB || typeof DB.zeroWriteProven !== 'function') return false;\n  try { return DB.zeroWriteProven(msg) === true; } catch (e) { return false; }",
    '  return true;'), function (S) {
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(TIMEOUT_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
      return S._fcWriteState_['baseEdit'] !== 'OUTCOME_UNKNOWN';
    }));

score('N3  the page re-approximates the rule with its own regex instead of asking the shared authority',
  withSrc(mutate(FC, "  if (!DB || typeof DB.zeroWriteProven !== 'function') return false;",
    "  if (!DB || typeof DB.zeroWriteProven !== 'function') return /^PRODUCTION_SAFETY:/.test(msg);"),
    function () {
      // the observable: with the shared export ABSENT, a page with its own copy still claims proof
      var S = rig({ shared: false, src: mutate(FC, "  if (!DB || typeof DB.zeroWriteProven !== 'function') return false;",
        "  if (!DB || typeof DB.zeroWriteProven !== 'function') return /^PRODUCTION_SAFETY:/.test(msg);") });
      return S._fcZeroWriteProven_(SCHEMA_ERR) !== false;
    }));

score('N4  the refusal path stops re-enabling the control (Save stays dead after a refusal)',
  withSrc(mutate(FC, '  if (opts.reenable) opts.reenable(true);          // the modal stays open and every input is preserved',
    '  /* removed */'), function (S) {
      var re = [];
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function (v) { re.push(v); } });
      return re.length === 0;
    }));

score('N5  the proven refusal borrows the unknown-outcome sentence',
  withSrc(mutate(FC, '  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);\n  else _fcUnknownOutcome_(opts.ctl, err);',
    '  _fcUnknownOutcome_(opts.ctl, err);'), function (S) {
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
      return lastAlert(S).indexOf('wrote nothing') === -1;
    }));

score('N6  the refusal offers another Save rather than a read',
  // FC-SUMMARY-R2B-A2-R3 — the anchor follows the source; the label is now read from the retry-state map.
  // The assertion is untouched: a proven zero-write refusal must still offer a READ, never another Save.
  withSrc(mutate(FC,
    "    _fcRetryLabel_(FC_RETRY_.REFUSED_ZERO),",
    "    'Save again',"),
  function (S) {
    S._fcWriteBegin_('baseEdit');
    S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
    return !/Check latest data/.test(banner(S).text());
  }));

score('N7  Base FC edit-mode entry stops asking the enablement authority (the re-entry defect returns)',
  withSrc(mutate(FC, '  _fcUpdateEditStatus();\n  renderFcRegularTableEditable();', '  renderFcRegularTableEditable();'),
    function (S) {
      S.confirmFcEdit(); S._fcSetSaveEnabled(false); S.exitEditMode(); S.confirmFcEdit();
      return saveBtn(S).disabled === true;
    }));

score('N8  Special Event edit-mode entry stops asking it (the same defect, the other table)',
  withSrc(mutate(FC, '  _fcEventUpdateStatus();   // FC-SUMMARY-R2B-A §5 — see confirmFcEdit: identical defect, identical fix.\n', ''),
    function (S) {
      S.enterEventEditMode(); S._fcEventSetSaveEnabled(false); S.exitEventEditMode(); S.enterEventEditMode();
      return evSaveBtn(S).disabled === true;
    }));

score('N9  the builder reports a proven refusal as an unknown outcome',
  withSrc(mutate(FC, '  var proven = _fcZeroWriteProven_(e);\n  var stage = _fcEbStage_', '  var proven = false;\n  var stage = _fcEbStage_'),
    function (S) {
      S._fcEbStage_ = 'stage 1 — campaigns'; S._fcEbCommitted_ = [];
      S._fcWriteBegin_('eventBuilder');
      S._fcBuilderFailure_(SCHEMA_ERR, 1);
      return S._fcWriteState_['eventBuilder'] !== 'CONFIRMED_REFUSAL';
    }));

score('N10 the builder drops the committed-stage manifest (a partial write becomes invisible)',
  withSrc(mutate(FC, "    ? ' The earlier stage(s) ' + _fcEbCommitted_.join(' + ') + ' were already committed and still need reconciling.'",
    "    ? ''"), function (S) {
      S._fcEbStage_ = 'stage 2 — campaign_sku_lines'; S._fcEbCommitted_ = ['campaigns'];
      S._fcWriteBegin_('eventBuilder');
      S._fcBuilderFailure_(SCHEMA_ERR, 1);
      return lastAlert(S).indexOf('already committed') === -1;
    }));

score('N11 the refusal starts closing the modal, discarding the operator\'s entries',
  withSrc(mutate(FC, "function _fcZeroWriteRefusal_(ctl, err) {\n  var code = _fcCanonicalCode_(err);",
    "function _fcZeroWriteRefusal_(ctl, err) {\n  closeFcModal();\n  var code = _fcCanonicalCode_(err);"),
    function (S) {
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
      return S.__seen.closes > 0;
    }));

score('N12 ownership is dropped, so a dead page draws a refusal over whatever replaced it',
  withSrc(mutate(FC, "  if (!_fcOwns_(opts.epoch)) { _fcWriteState_[opts.ctl] = FC_WRITE_.UNMOUNTED; return; }\n  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);",
    '  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);'), function () {
      var S = rig({ epoch: 1, current: 2, src: mutate(FC, "  if (!_fcOwns_(opts.epoch)) { _fcWriteState_[opts.ctl] = FC_WRITE_.UNMOUNTED; return; }\n  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);",
        '  if (proven) _fcZeroWriteRefusal_(opts.ctl, err);') });
      S._fcWriteBegin_('baseEdit');
      S._fcFailWrite_(SCHEMA_ERR, { ctl: 'baseEdit', epoch: 1, reenable: function () {} });
      return S.__seen.alerts.length > 0;
    }));

// =================================================================================================
setTimeout(function () {
  console.log('\n' + new Array(101).join('='));
  console.log('FC REFUSAL CLASSIFICATION + SAVE RE-ENTRY (R2B-A) — passed ' + pass + '  failed ' + fail +
    '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
  console.log(new Array(101).join('='));
  process.exit((fail === 0 && neg.missed === 0) ? 0 : 1);
}, 60);
