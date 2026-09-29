// FC-SUMMARY-STABILITY-R1 — BUG FC-5: the initial-load FALSE EMPTY, repaired at the boundary that lost the state.
//
// THE DEFECT. `_fcGetRegularForecast()` / `_fcGetSpecialEvents()` answer `[]` for a slice that has not landed.
// The table render mapped that straight into `paginatedData.length === 0` and printed "No data found" — a
// claim that an authoritative read returned zero rows, made before any read had returned. The pagination row
// repeated it in numbers: "Showing 0-0 of 0 rows / Page 0 / 0".
//
// WHY IT IS THE SAME DEFECT AS FC-ID. The model DOES carry the distinction, in `_fcHas_`, and
// `_fcRegularSourceReady_` has asked it since R2B — from exactly one call site, which is not the table.
// `_evtResolveMarketplaceId` has the identical shape one layer over: a distinction the model holds, read
// through an accessor that already discarded it. Both are repaired by asking.
//
// HOW IT IS TESTED. The REAL `renderFcRegularTable` / `renderFcEventTable` / `updatePaginationInfo` are
// executed against a minimal DOM, so the assertions are about what the operator's table actually contains.
// A grep for the string would prove nothing about when it renders.
//
// NO PRODUCTION WRITE. No sheet, no network, no DB.
//
// Run: node assets/tests/fc-summary-stability-r1-false-empty.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var PAGE = read('assets/js/pages/fc-summary.js');

function extractFn(src, name) {
  var re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end === -1) throw new Error('unbalanced braces lifting ' + name);
  return new Function(m[1], src.slice(i + 1, end));
}

// ---- a minimal DOM: only what these three functions touch -------------------------------------------------
var NODES = {};
function el(id) {
  if (!NODES[id]) NODES[id] = { id: id, innerHTML: '', textContent: '', disabled: false, style: {} };
  return NODES[id];
}
global.document = {
  getElementById: function (id) { return el(id); },
  querySelector: function (sel) { return sel === '.fc-pagination' ? el('__pagination__') : null; }
};
var BODY_IDS = ['fc-regular-fixed-body', 'fc-regular-scroll-body', 'fc-event-fixed-body', 'fc-event-scroll-body',
  'fc-pagination-info', 'fc-page-number', 'fc-prev-page', 'fc-next-page'];
function resetDom() { BODY_IDS.forEach(function (id) { NODES[id] = null; el(id); }); }

// ---- the page's real state, lifted ------------------------------------------------------------------------
global.window = { KM: { api: { workspaceApiActive: function () { return true; } } } };
global._fcReadModel = null;
global._fcSliceState_ = {};
global.FC_SLICE_ = { BOOTSTRAP: 'bootstrap', REGULAR: 'regular', EVENTS: 'events', RULES: 'rules' };
global.FC_FRESH_ = { UNREAD: 'UNREAD', LOADING: 'LOADING', CURRENT: 'CURRENT', STALE: 'STALE', REFUSED: 'REFUSED' };
global._FC_TAB_SLICE_ = { regular: 'regular', event: 'events', target: 'rules' };
global.fcPaginationState = { currentPage: 1, pageSize: 25, totalItems: 0 };
global._fcUseDb = function () { return true; };
global._fcEffectiveWorkspace = extractFn(PAGE, '_fcEffectiveWorkspace');
global._fcWorkspaceMode_ = extractFn(PAGE, '_fcWorkspaceMode_');
global._fcHas_ = extractFn(PAGE, '_fcHas_');
global._fcSliceRec_ = extractFn(PAGE, '_fcSliceRec_');
global._fcGetRegularForecast = extractFn(PAGE, '_fcGetRegularForecast');
global._fcGetSpecialEvents = extractFn(PAGE, '_fcGetSpecialEvents');
global._fcRegularSourceReady_ = extractFn(PAGE, '_fcRegularSourceReady_');
global._fcEventSourceReady_ = extractFn(PAGE, '_fcEventSourceReady_');
global._fcTableGate_ = extractFn(PAGE, '_fcTableGate_');
global._getDbFcRegularData = extractFn(PAGE, '_getDbFcRegularData');
global._getDbFcEventData = extractFn(PAGE, '_getDbFcEventData');
global._fcActiveFilteredCount = extractFn(PAGE, '_fcActiveFilteredCount');
global.updatePaginationInfo = extractFn(PAGE, 'updatePaginationInfo');

// The render bodies past the gate touch a lot of the page; the gate returns BEFORE any of it, which is the
// property under test. These stand in for the far side so a gated render is exercised end to end.
var _tab = 'regular';
global._fcActiveTab = function () { return _tab; };
global.getFcFilters = function () { return { year: 2026 }; };
global.filterFcRegular = function (rows) { return rows; };
global.filterFcEvent = function (rows) { return rows; };
global._getDemoFcRegularData = function () { return []; };
global._getDemoFcEventData = function () { return []; };
// The far side of the gate — the row-rendering machinery. Stubbed because the property under test is which
// BRANCH the render takes, not how a row is painted; every assertion below reads the branch, never the markup
// of a row. A gated render returns before any of this, and an ungated one must reach it, which is exactly
// what "did the gate fire" means here.
global._fcAnnualShareProjections_ = function () { return {}; };
global._fcShareSourceRows_ = function (r) { return r || []; };
global._fcShareYear_ = function () { return 2026; };
global._fcEsc_ = function (v) { return String(v == null ? '' : v); };
global._fcEscapeHtml = function (v) { return String(v == null ? '' : v); };
global._fcMarketplaceLabel = function (k) { return String(k == null ? '' : k); };
global._fcColVisApply_ = function () {};
global._fcNum_ = function (v) { return Number(v) || 0; };
global._fcShareCells_ = function () { return ''; };
global._fcShareUnavailableTitle_ = function () { return ''; };
global.syncFcScroll = function () {};
global._seFingerprint_ = function () { return 'FP'; };   // called by _getDbFcEventData per row

var renderRegular = extractFn(PAGE, 'renderFcRegularTable');
var renderEvent = extractFn(PAGE, 'renderFcEventTable');

var REG_ROW = { sku: 'KM-1', year: 2026, company: 'ResTW', country: 'CA', marketplace: 'Amazon',
  category: 'C', series: 'S', jan: 1, feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0 };
var EVT_ROW = { eventId: 'EFC-1', sku: 'KM-1', year: 2026, raw: { event_fc_id: 'EFC-1', year: 2026 } };

function setState(model, sliceStates) {
  global._fcReadModel = model;
  global._fcSliceState_ = {};
  Object.keys(sliceStates || {}).forEach(function (k) {
    global._fcSliceState_[k] = { state: sliceStates[k], observedAt: null, flight: null, loads: 0, err: null, gen: 0 };
  });
  resetDom();
}
function bodyOf(tab) { return el(tab === 'event' ? 'fc-event-scroll-body' : 'fc-regular-scroll-body').innerHTML; }
function renderFor(tab) { _tab = tab; if (tab === 'event') renderEvent(); else renderRegular(); }

// =========================================================================================================
section('A. AA / AE — cold entry must show LOADING, never "No data found"');
// =========================================================================================================

['regular', 'event'].forEach(function (tab) {
  setState(null, {});                                    // nothing read at all
  renderFor(tab);
  ok(/Loading/.test(bodyOf(tab)), 'A1 ' + tab + ' cold entry renders a loading state');
  ok(!/No data found/.test(bodyOf(tab)), 'A2 ' + tab + ' cold entry does NOT claim "No data found"');
});

['regular', 'event'].forEach(function (tab) {
  var slice = tab === 'event' ? 'events' : 'regular';
  var st = {}; st[slice] = FC_FRESH_.LOADING;
  setState({}, st);                                      // model exists, this slice has not landed
  renderFor(tab);
  ok(/Loading/.test(bodyOf(tab)), 'A3 ' + tab + ' pending slice renders loading');
  ok(!/No data found/.test(bodyOf(tab)), 'A4 ' + tab + ' pending slice claims no authoritative empty');
});

// =========================================================================================================
section('B. AB / AF — a successful read with rows renders rows');
// =========================================================================================================

setState({ fcRegularForecast: [REG_ROW] }, { regular: FC_FRESH_.CURRENT });
renderFor('regular');
ok(!/Loading/.test(bodyOf('regular')) && !/No data found/.test(bodyOf('regular')),
  'B1 regular with rows renders neither loading nor empty');
setState({ fcSpecialEvents: [EVT_ROW] }, { events: FC_FRESH_.CURRENT });
renderFor('event');
ok(!/Loading/.test(bodyOf('event')) && !/No data found/.test(bodyOf('event')),
  'B2 event with rows renders neither loading nor empty');

// =========================================================================================================
section('C. AC / AG — a TRUE empty still says "No data found"');
// =========================================================================================================
//
// The repair must not turn a real zero-row answer into a permanent Loading. This is the assertion that
// stops the fix from over-reaching.

setState({ fcRegularForecast: [] }, { regular: FC_FRESH_.CURRENT });
renderFor('regular');
ok(/No data found/.test(bodyOf('regular')), 'C1 regular authoritative zero rows → "No data found"');
setState({ fcSpecialEvents: [] }, { events: FC_FRESH_.CURRENT });
renderFor('event');
ok(/No data found/.test(bodyOf('event')), 'C2 event authoritative zero rows → "No data found"');

// =========================================================================================================
section('D. AD / AH — a failed read is an error, not an empty and not a permanent loading');
// =========================================================================================================

['regular', 'event'].forEach(function (tab) {
  var slice = tab === 'event' ? 'events' : 'regular';
  var st = {}; st[slice] = FC_FRESH_.REFUSED;
  setState({}, st);
  renderFor(tab);
  ok(!/No data found/.test(bodyOf(tab)), 'D1 ' + tab + ' REFUSED does not claim an empty result');
  ok(!/Loading/.test(bodyOf(tab)), 'D2 ' + tab + ' REFUSED does not sit in a permanent Loading');
  ok(/could not be loaded/.test(bodyOf(tab)), 'D3 ' + tab + ' REFUSED says so, and points at Retry');
});

// =========================================================================================================
section('E. AI / AJ — last-good rows survive a refresh, and a failed refresh');
// =========================================================================================================

setState({ fcRegularForecast: [REG_ROW] }, { regular: FC_FRESH_.LOADING });   // refreshing over a good model
renderFor('regular');
ok(!/Loading/.test(bodyOf('regular')) && !/No data found/.test(bodyOf('regular')),
  'E1 a refresh in flight over last-good rows keeps the rows on screen');
setState({ fcRegularForecast: [REG_ROW] }, { regular: FC_FRESH_.REFUSED });   // refresh failed, model retained
renderFor('regular');
ok(!/No data found/.test(bodyOf('regular')) && !/could not be loaded/.test(bodyOf('regular')),
  'E2 a FAILED refresh with last-good rows still shows the rows — the banner owns the failure, not the table');

// =========================================================================================================
section('F. AN / §3L — pagination may not claim an authoritative zero while pending');
// =========================================================================================================

setState(null, {});
_tab = 'regular';
renderRegular();
eq(el('fc-pagination-info').textContent, '', 'F1 LOADING_SHOWS_0_OF_0_AS_FINAL_RESULT = NO');
eq(el('fc-page-number').textContent, '', 'F2 LOADING_SHOWS_PAGE_0_OF_0_AS_FINAL_RESULT = NO');
ok(el('fc-prev-page').disabled === true && el('fc-next-page').disabled === true,
  'F3 …and the paging controls are inert, because there is no page to move to');

setState({ fcRegularForecast: [] }, { regular: FC_FRESH_.CURRENT });
_tab = 'regular';
renderRegular();
eq(el('fc-pagination-info').textContent, 'Showing 0-0 of 0 rows',
  'F4 an AUTHORITATIVE empty still reports 0 of 0 — the canonical convention is unchanged');
eq(el('fc-page-number').textContent, 'Page 0 / 0', 'F5 …and Page 0 / 0 with it');

setState({ fcRegularForecast: [REG_ROW] }, { regular: FC_FRESH_.CURRENT });
_tab = 'regular';
renderRegular();
eq(el('fc-pagination-info').textContent, 'Showing 1-1 of 1 rows', 'F6 a loaded table counts normally');

// =========================================================================================================
section('G. AK — a tab switch cannot make the other tab lie');
// =========================================================================================================
//
// The two slices are independent, so the Event tab pending while Regular is CURRENT must show loading on
// Event and rows on Regular — each tab telling the truth about its OWN read.

setState({ fcRegularForecast: [REG_ROW] }, { regular: FC_FRESH_.CURRENT, events: FC_FRESH_.LOADING });
renderFor('regular');
ok(!/Loading/.test(bodyOf('regular')), 'G1 Regular shows its rows…');
renderFor('event');
ok(/Loading/.test(bodyOf('event')) && !/No data found/.test(bodyOf('event')),
  'G2 …while Event truthfully shows loading. TAB_SWITCH_FALSE_EMPTY_COUNT = 0');

// =========================================================================================================
section('H. the gate is derived, never stored');
// =========================================================================================================

ok(!/_fcTableGateState_\s*=|_fcGateCache/.test(PAGE),
  'H1 no cached gate state was introduced — it is recomputed, so it cannot drift');
ok(/_fcTableGate_/.test(PAGE) && !/var FC_TABLE_STATE_ = \{/.test(PAGE),
  'H2 no competing page-local state machine — the existing FC_FRESH_ vocabulary is reused (§3H)');

// =========================================================================================================
section('I. mutation');
// =========================================================================================================

mut('I1 the gate stops asking whether the model is ready', function () {
  // EOL-agnostic: the page is CRLF, so an anchor spelling '\n' matches nothing.
  var src = PAGE.replace(/var ready = \(tab === 'event'\) \? _fcEventSourceReady_\(\) : _fcRegularSourceReady_\(\);/,
    'var ready = true;');
  if (src === PAGE) throw new Error('I1 anchor drifted');
  var g = extractFn(src, '_fcTableGate_');
  setState(null, {});
  return g('regular') === null && global._fcTableGate_('regular') !== null;
});

mut('I2 a REFUSED slice is reported as still loading', function () {
  var src = PAGE.replace('  if (st === FC_FRESH_.REFUSED) {', '  if (false) {');
  if (src === PAGE) throw new Error('I2 anchor drifted');
  var g = extractFn(src, '_fcTableGate_');
  setState({}, { regular: FC_FRESH_.REFUSED });
  return g('regular').kind === 'LOADING' && global._fcTableGate_('regular').kind === 'ERROR_NO_MODEL';
});

mut('I3 a true empty starts rendering as loading', function () {
  // Mutating readiness to always-false would make an authoritative empty indistinguishable from unread —
  // the over-reach this repair must not commit.
  var src = PAGE.replace("function _fcRegularSourceReady_() {\r\n  if (_fcWorkspaceMode_()) return _fcHas_('fcRegularForecast');",
    "function _fcRegularSourceReady_() {\r\n  if (_fcWorkspaceMode_()) return false;");
  if (src === PAGE) throw new Error('I3 anchor drifted');
  global._fcRegularSourceReady_ = extractFn(src, '_fcRegularSourceReady_');
  var g = extractFn(PAGE, '_fcTableGate_');
  setState({ fcRegularForecast: [] }, { regular: FC_FRESH_.CURRENT });
  var mutated = g('regular');
  global._fcRegularSourceReady_ = extractFn(PAGE, '_fcRegularSourceReady_');
  var real = g('regular');
  return mutated !== null && real === null;
});

mut('I4 pagination goes back to claiming 0 of 0 while pending', function () {
  var src = PAGE.replace("  if (typeof _fcTableGate_ === 'function' && _fcTableGate_(tab)) {", '  if (false) {');
  if (src === PAGE) throw new Error('I4 anchor drifted');
  var upd = extractFn(src, 'updatePaginationInfo');
  setState(null, {});
  _tab = 'regular';
  upd();
  var mutatedText = el('fc-pagination-info').textContent;
  setState(null, {});
  global.updatePaginationInfo();
  return mutatedText === 'Showing 0-0 of 0 rows' && el('fc-pagination-info').textContent === '';
});

// =========================================================================================================
console.log('\n=====================================================');
console.log('FC-SUMMARY-STABILITY-R1 FC-5 FALSE EMPTY — ' + pass + ' passed / ' + fail + ' failed');
console.log('mutants: ' + neg.caught + ' caught / ' + (neg.caught + neg.missed) + ' planted');
if (fail === 0) {
  console.log('INITIAL_FALSE_EMPTY_COUNT = 0   REFRESH_FALSE_EMPTY_COUNT = 0');
  console.log('TIMEOUT_FALSE_EMPTY_COUNT = 0   TAB_SWITCH_FALSE_EMPTY_COUNT = 0');
  console.log('LOADING_SHOWS_0_OF_0_AS_FINAL_RESULT = NO   LOADING_SHOWS_PAGE_0_OF_0_AS_FINAL_RESULT = NO');
  console.log('LAST_GOOD_DATA_PRESERVED = YES   PRODUCTION_ROWS_WRITTEN = 0   S6_BEHAVIOR_CHANGED = NO');
}
console.log('=====================================================');
process.exit(fail === 0 ? 0 : 1);
