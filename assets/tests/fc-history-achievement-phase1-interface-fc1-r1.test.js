// Kitchen Mama Operation System — FC1-R1 PHASE 1
// HISTORICAL ACTUAL AND ACHIEVEMENT: AN INTERFACE WITH AN ANSWER FOR EVERY CELL AND A NUMBER FOR NONE.
//
// The Owner split the FC history work. Phase 1 ships the month views, the two history-based builder
// methods and the data contract, and connects NO source: no history API, no BigQuery, no empty table,
// no fixture shown as data. So the properties worth proving are the ones that keep phase 1 honest:
//
//   A-D  the contract: an explicit 0 is a value, everything absent is a NAMED missing state, and an
//        unconnected source answers by name BEFORE any record is looked at - so a stray record (a
//        fixture, a cache, a guess) can never become a displayed number;
//   E    the Forecast month view is the table it always was, character for character;
//   F    nothing in the history code can reach a source;
//   G-I  the two new methods show at most three history cells, and neither Preview nor Save can
//        produce a write - including through the old fall-through to the Manual branch;
//   J    the three existing methods compute EXACTLY what they computed at the R55 candidate, proved by
//        running both versions of _regularBuildPreview on the same inputs, not by reading them;
//   M    four mutants, each re-opening one of the defects above, must be caught.
//
// Run: node assets/tests/fc-history-achievement-phase1-interface-fc1-r1.test.js
// NOTE: no 'use strict' — extracted browser fns run in vm sandboxes (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var pass = 0, fail = 0, quiet = false, quietFails = 0;
function ok(c, l, extra) {
  if (quiet) { if (!c) quietFails++; return; }
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra))); }
}
function eq(a, e, l) { ok(JSON.stringify(a) === JSON.stringify(e), l, { exp: e, got: a }); }
function section(t) { if (!quiet) console.log('\n== ' + t + ' =='); }

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var HTML = read('assets/html/pages/fc-summary.html');
var CANDIDATE = '7376bee8';   // the frozen R55 candidate: the "before" for §J
var FCS_BEFORE = cp.execSync('git show ' + CANDIDATE + ':assets/js/pages/fc-summary.js', { cwd: REPO, encoding: 'utf8' })
  .replace(/\r\n/g, '\n');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var d = 0, started = false, start = i;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}
function varSrc(src, name) {
  var m = new RegExp('^var ' + name + '\\s*=', 'm').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  var d = 0;
  for (var j = m.index; j < src.length; j++) {
    var c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unterminated var: ' + name);
}

// FC1-R2 — the builder's closed method list, base reader and source gate, loaded wherever the page has them.
var FC1R2_VARS = ['FC_REGULAR_METHODS_', 'FC_BASE_REASON_TEXT_'];
var FC1R2_FNS = ['_fcHistoryExplicitNumber_', '_regularMethodVerdict_', '_regularSourceIntegrity_', '_regularBaseValue_',
  '_regularBaseRefusalText_', '_regularRefusePreview_'];
function loadFc1r2(ctx, src) {
  vm.runInContext('function _fmvEscapeHtml(s){ return String(s == null ? "" : s); }', ctx);
  FC1R2_VARS.forEach(function (v) { if (src.indexOf('\nvar ' + v + ' =') !== -1) vm.runInContext(varSrc(src, v), ctx); });
  FC1R2_FNS.forEach(function (f) { if (src.indexOf('function ' + f + '(') !== -1) vm.runInContext(fnSrc(src, f), ctx); });
}

var HISTORY_VARS = ['FC_HISTORY_SOURCE_', 'FC_HISTORY_STATE_', 'FC_HISTORY_STATE_TEXT_', 'FC_REGULAR_MONTH_VIEWS_',
  '_fcRegularMonthView_', 'FC_HISTORY_METHODS_', 'FC_BUILDER_HISTORY_MAX_CELLS_', 'FC_HISTORY_METHOD_REFUSAL_', '_FC_SHARE_DASH_'];
var HISTORY_FNS = ['_fcHistoryExplicitNumber_', '_fcHistoryKey_', '_fcHistoryActualCell_', '_fcAchievementCell_',
  '_fcHistoryRecordFor_', '_fcHistoryCellText_', '_fcRegularMonthCellsHtml_', '_fcIsHistoryMethod_',
  '_fcHistoryRefCells_', '_fcHistoryMethodRefusalText_', '_fcColEsc_'];

function historyCtx(src, extra) {
  var ctx = vm.createContext(Object.assign({ console: console }, extra || {}));
  HISTORY_VARS.forEach(function (v) { vm.runInContext(varSrc(src, v), ctx); });
  HISTORY_FNS.forEach(function (f) { vm.runInContext(fnSrc(src, f), ctx); });
  return ctx;
}

// The preview sandbox, shaped like FCB1's: the real builder, the real row finder, stubbed DOM edges.
var FC_ROWS = [
  { sku: 'SKU-1', year: 2026, company: 'KM', country: 'US', marketplace: 'Amazon',
    jan: 100, feb: 0, mar: '', apr: 40, may: 50, jun: 60, jul: 70, aug: 80, sep: 90, oct: 10, nov: 11, dec: 12 },
  { sku: 'SKU-1', year: 2025, company: 'KM', country: 'US', marketplace: 'Amazon',
    jan: 7, feb: 8, mar: 9, apr: 1, may: 2, jun: 333, jul: 4, aug: 5, sep: 6, oct: 7, nov: 8, dec: 9 }
];
function previewCtx(src, method, opts) {
  opts = opts || {};
  var els = {};
  function el(v) { return { value: v, style: {}, innerHTML: '', textContent: '', disabled: false }; }
  els['regular-target-year'] = el('2026'); els['regular-target-month'] = el(String(opts.targetMonth == null ? 5 : opts.targetMonth));
  els['regular-update-method'] = el(method); els['regular-growth-rate'] = el('10');
  els['regular-base-year'] = el('2025'); els['regular-base-month'] = el('5');
  var box = { document: { getElementById: function (id) { return els[id] || null; } }, console: console,
    _regularPreview: null, REG_MONTH_KEYS: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    FC_ROWS: FC_ROWS, saveEnabled: false, rendered: 0, help: '' };
  var ctx = vm.createContext(box);
  vm.runInContext('function _regularCloseAllMs(){}', ctx);
  vm.runInContext('function _regularRenderPreview(){ rendered++; }', ctx);
  vm.runInContext('function _setRegularSaveEnabled(on){ saveEnabled = !!on; }', ctx);
  vm.runInContext('function _setRegularManualHelp(m){ help = String(m || ""); }', ctx);
  vm.runInContext('function _regularClearPreview(){ _regularPreview = null; saveEnabled = false; }', ctx);
  vm.runInContext('function _regularMode(){ return "single"; }', ctx);
  vm.runInContext('function _regularSelectedSite(){ return { company: "KM", country: "US", marketplace: "Amazon" }; }', ctx);
  vm.runInContext('function _regularCandidateSkus(){ return [{ sku: "SKU-1", category: "C", series: "S", company: "KM" }]; }', ctx);
  vm.runInContext('function _regularFcRows(){ return FC_ROWS; }', ctx);
  ['_regularFindFc', '_regularExistingMonths', '_regularDerivedBasePeriod_', '_regularBuildPreview'].forEach(function (f) {
    vm.runInContext(fnSrc(src, f), ctx);
  });
  if (src.indexOf('function _fcIsHistoryMethod_(') !== -1) {
    vm.runInContext(varSrc(src, 'FC_HISTORY_METHODS_'), ctx);
    vm.runInContext(varSrc(src, 'FC_HISTORY_METHOD_REFUSAL_'), ctx);
    vm.runInContext(fnSrc(src, '_fcIsHistoryMethod_'), ctx);
    vm.runInContext(fnSrc(src, '_fcHistoryMethodRefusalText_'), ctx);
  }
  loadFc1r2(ctx, src);
  return ctx;
}

function saveCtx(src, selectValue, preview) {
  var els = { 'regular-update-method': { value: selectValue }, 'regular-base-year': { value: '2025' }, 'regular-base-month': { value: '5' } };
  var box = { console: console, document: { getElementById: function (id) { return els[id] || null; } },
    REG_MONTH_KEYS: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    alerts: [], captured: null, help: '', _regularPreview: preview,
    window: { KM: { DB: { importFcRegularForecastBatch: function (rows) {
      box.captured = rows; return { then: function () { return { catch: function () {} }; } };
    } } } } };
  var ctx = vm.createContext(box);
  ['function alert(m){ alerts.push(String(m)); }', 'function _fcUseDb(){ return true; }', 'function _fcWriteBegin_(){ return true; }',
   'function _setRegularSaveEnabled(){}', 'function _setRegularManualHelp(m){ help = String(m || ""); }', 'function _fcEpoch_(){ return 1; }',
   'function _fcSettleWrite_(){}', 'function _fcFailWrite_(){}', 'function _fcAfterWriteScoped_(){}', 'function _fcCountsLine_(){ return ""; }',
   'function renderFcRegularTable(){}', 'function closeFcModal(){}', 'var FC_SLICE_ = { REGULAR: "regular" }; var FC_MSG_ = { SAVED: "Saved" };',
   'function _regularSelectedSite(){ return { company: "KM", country: "US", marketplace: "Amazon" }; }',
   'function _regularClearPreview(){ _regularPreview = null; }'
  ].forEach(function (s) { vm.runInContext(s, ctx); });
  loadFc1r2(ctx, src);
  vm.runInContext(varSrc(src, 'FC_HISTORY_METHODS_'), ctx);
  vm.runInContext(varSrc(src, 'FC_HISTORY_METHOD_REFUSAL_'), ctx);
  vm.runInContext(fnSrc(src, '_fcIsHistoryMethod_'), ctx);
  vm.runInContext(fnSrc(src, '_fcHistoryMethodRefusalText_'), ctx);
  vm.runInContext(fnSrc(src, 'saveRegularUpdate'), ctx);
  vm.runInContext('saveRegularUpdate()', ctx);
  return box;
}

var EXISTING = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
var WRITABLE_ROWS = [{ sku: 'SKU-1', company: 'KM', country: 'US', marketplace: 'Amazon', existing: EXISTING, oldQty: 6, newQty: 999,
  base: { year: 2025, month: 5, value: 908 } }];   // FC1-R2 — a real preview row carries the base it was computed from

// ===================================================================================================
function checks(src) {
  var C = historyCtx(src);
  var S = C.FC_HISTORY_STATE_;

  section('A  the source is named, and it is not connected');
  eq(C.FC_HISTORY_SOURCE_.table, 'fc_achievement_monthly', 'A1  the designated monthly source is fc_achievement_monthly');
  ok(C.FC_HISTORY_SOURCE_.connected === false, 'A2  and phase 1 has it NOT connected');
  ok(Object.isFrozen(C.FC_HISTORY_SOURCE_), 'A3  the flag is frozen - no runtime path can flip it on');

  section('B  an explicit 0 is a number; absence is not');
  eq(C._fcHistoryExplicitNumber_(0), 0, 'B1  0 -> 0');
  eq(C._fcHistoryExplicitNumber_('0'), 0, 'B2  "0" -> 0');
  eq(C._fcHistoryExplicitNumber_(12.5), 12.5, 'B3  12.5 -> 12.5');
  [['', 'B4  "" -> missing'], [null, 'B5  null -> missing'], [undefined, 'B6  undefined -> missing'],
   [NaN, 'B7  NaN -> missing'], ['n/a', 'B8  words -> missing'], ['  ', 'B9  blank -> missing']].forEach(function (p) {
    eq(C._fcHistoryExplicitNumber_(p[0]), null, p[1]);
  });

  section('C  an unconnected source answers by name BEFORE any record is read');
  var full = { actual_units: 42, is_final: true };
  eq(C._fcHistoryActualCell_(C.FC_HISTORY_SOURCE_, full).state, S.NOT_CONNECTED,
    'C1  a complete, final record handed to the unconnected source still yields NOT_CONNECTED');
  eq(C._fcHistoryActualCell_(C.FC_HISTORY_SOURCE_, full).value, null, 'C2  and no value escapes with it');
  var live = { connected: true };   // a connected source, constructed HERE - the page has none
  eq(C._fcHistoryActualCell_(live, { actual_units: 0, is_final: true }), { state: S.VALUE, value: 0 },
    'C3  connected: an explicit, final 0 is the VALUE 0');
  eq(C._fcHistoryActualCell_(live, null).state, S.ACTUAL_MISSING, 'C4  connected: no row is ACTUAL_MISSING, never 0');
  eq(C._fcHistoryActualCell_(live, { actual_units: null, is_final: true }).state, S.ACTUAL_MISSING, 'C5  null actual is missing');
  eq(C._fcHistoryActualCell_(live, { actual_units: '', is_final: true }).state, S.ACTUAL_MISSING, 'C6  blank actual is missing');
  eq(C._fcHistoryActualCell_(live, { actual_units: 5 }).state, S.ACTUAL_NOT_FINAL, 'C7  an unclosed month is NOT_FINAL, not a value');
  eq(C._fcHistoryCellText_({ state: S.VALUE, value: 0 }, 'units'), '0', 'C8  and the value 0 DISPLAYS as 0');
  eq(C._fcHistoryCellText_({ state: S.ACTUAL_MISSING, value: null }, 'units'), '—', 'C9  missing displays as a dash, not 0');

  section('D  achievement is refused unless both sides are explicit numbers');
  var v = function (n) { return { state: S.VALUE, value: n }; };
  eq(C._fcAchievementCell_(100, v(50)), { state: S.VALUE, value: 50 }, 'D1  50 of 100 -> 50.0%');
  eq(C._fcAchievementCell_('200', v(0)), { state: S.VALUE, value: 0 }, 'D2  an explicit 0 actual is 0% - a real result');
  eq(C._fcAchievementCell_(0, v(5)).state, S.FORECAST_ZERO, 'D3  forecast 0 -> UNDEFINED, never Infinity or 0%');
  eq(C._fcAchievementCell_('', v(5)).state, S.FORECAST_MISSING, 'D4  no forecast -> FORECAST_MISSING');
  eq(C._fcAchievementCell_(100, { state: S.NOT_CONNECTED, value: null }).state, S.NOT_CONNECTED,
    'D5  an actual that is not a value passes its OWN reason through');
  eq(C._fcHistoryCellText_(C._fcAchievementCell_(3, v(1)), 'pct'), '33.3%', 'D6  one decimal place');

  section('E  the Forecast view is unchanged; the history views are named and empty');
  var item = { sku: 'SKU-1', year: 2026, company: 'KM', country: 'US', marketplace: 'Amazon',
    months: [1200, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], fcRaw: [1200, 0, '', 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  var before = item.months.map(function (m) { return '<div class="scroll-cell cell-month">' + m.toLocaleString() + '</div>'; }).join('');
  eq(C._fcRegularMonthCellsHtml_(item, 'forecast'), before, 'E1  Forecast view: the exact markup the table always rendered');
  eq(C._fcRegularMonthCellsHtml_(item, undefined), before, 'E2  an unset view falls back to Forecast, not to history');
  ['actual', 'achievement'].forEach(function (view, k) {
    var html = C._fcRegularMonthCellsHtml_(item, view);
    var states = html.match(/data-fc-history-state="[^"]+"/g) || [];
    eq(states.length, 12, 'E' + (3 + 2 * k) + '  ' + view + ' view: twelve cells, each carrying a named state');
    ok(states.every(function (s) { return s.indexOf(S.NOT_CONNECTED) !== -1; }) && !/>[0-9]/.test(html),
      'E' + (4 + 2 * k) + '  ' + view + ' view: every cell NOT_CONNECTED and not one digit shown - not even the stored 0', html.slice(0, 160));
  });
  var srcRender = fnSrc(src, 'renderFcRegularTable');
  ok(/_fcRegularMonthCellsHtml_\(item, _fcRegularMonthView_\)/.test(srcRender) && /cell-total">\$\{total\.toLocaleString\(\)\}/.test(srcRender),
    'E7  the table paints months through the view helper and Total FC is still the forecast total');

  section('F  nothing in the history code can reach a source');
  var body = HISTORY_FNS.concat(['_fcRenderHistoryRef_', 'fcSetRegularMonthView']).map(function (f) { return fnSrc(src, f); }).join('\n');
  ok(!/KM\.DB|KM\.api|fetch\(|getWorkspace|google\.script|XMLHttpRequest|require\(|fixture|_fc-historical/i.test(body),
    'F1  no transport, no workspace read, no fixture and no test port is referenced');
  eq([C._fcHistoryRecordFor_('KM|US|amazon|SKU-1|2025-06'), C._fcHistoryRecordFor_(null)], [null, null],
    'F2  the record lookup has nothing to look IN');
  eq(C._fcHistoryKey_('km', 'us', 'Amazon', 'sku-1', 2025, 5), 'KM|US|amazon|SKU-1|2025-06',
    'F3  the phase-2 join key is the FC upsert key plus a YYYY-MM month');

  section('G  the builder methods: an interface of at most three cells');
  ok(/<option value="lastYearActual">/.test(HTML) && /<option value="intervalAverage">/.test(HTML),
    'G1  both history methods are offered in the builder');
  ok(/id="regular-interval-from"/.test(HTML) && /id="regular-interval-to"/.test(HTML) && /id="regular-history-ref"/.test(HTML),
    'G2  with an interval control and a history reference box');
  eq(C.FC_BUILDER_HISTORY_MAX_CELLS_, 3, 'G3  the cap is three, as the Owner set it');
  var refs = [C._fcHistoryRefCells_('lastYearActual', 2026, 5), C._fcHistoryRefCells_('lastYearActual', NaN, NaN),
    C._fcHistoryRefCells_('intervalAverage', 2026, 5, '2025-01', '2025-12'), C._fcHistoryRefCells_('intervalAverage', 2026, 5, '', ''),
    C._fcHistoryRefCells_('intervalAverage', 2026, 5, '2025-09', '2025-02')];
  ok(refs.every(function (r) { return r.length >= 1 && r.length <= 3; }), 'G4  every input yields between one and three cells', refs.map(function (r) { return r.length; }));
  eq(refs[0][0].label, 'Actual Jun 2025', 'G5  last year same month names the month it would read');
  ok(refs.every(function (r) { return r.every(function (c) { return c.state === S.NOT_CONNECTED; }); }),
    'G6  and every reference cell states NOT_CONNECTED');
  eq(refs[4][0].label, 'Interval From is after Interval To', 'G7  a reversed interval is named, not silently swapped');
  eq(C._fcHistoryRefCells_('actual', 2026, 5), [], 'G8  an existing method gets no history cells at all');

  section('H  Preview refuses a history method by name and builds nothing');
  ['lastYearActual', 'intervalAverage'].forEach(function (m, k) {
    var P = previewCtx(src, m);
    vm.runInContext('_regularPreview = { method: "manual", rows: [1] }; saveEnabled = true; _regularBuildPreview()', P);
    ok(P._regularPreview === null && P.saveEnabled === false && P.rendered === 0,
      'H' + (1 + 2 * k) + '  ' + m + ': no preview object, nothing rendered, Save disabled - even over a stale one', { p: P._regularPreview, s: P.saveEnabled });
    ok(P.help.indexOf('FC_HISTORY_METHOD_NOT_AVAILABLE') !== -1, 'H' + (2 + 2 * k) + '  and the refusal names its code', P.help);
  });

  section('I  Save cannot write for a history method, by either route');
  var s1 = saveCtx(src, 'lastYearActual', { targetYear: 2026, targetMonth: 5, method: 'manual', rows: WRITABLE_ROWS });
  ok(s1.captured === null, 'I1  history method selected over a leftover writable preview -> no write call');
  var s2 = saveCtx(src, 'actual', { targetYear: 2026, targetMonth: 5, method: 'intervalAverage', rows: WRITABLE_ROWS });
  ok(s2.captured === null, 'I2  a preview object claiming a history method -> no write call');
  ok(s1.help.indexOf('FC_HISTORY_METHOD_NOT_AVAILABLE') !== -1, 'I3  and the operator is told why');
  var s3 = saveCtx(src, 'actual', { targetYear: 2026, targetMonth: 5, method: 'actual', baseYear: 2025, baseMonth: 5, rows: WRITABLE_ROWS });
  ok(s3.captured && s3.captured.length === 1 && s3.captured[0].jun === 999, 'I4  CONTROL: an existing method still writes exactly as before');

  section('J  the three existing methods compute exactly what the R55 candidate computed');
  ['actual', 'prevMonth', 'manual'].forEach(function (m, k) {
    [0, 5].forEach(function (tm, t) {
      var A = previewCtx(FCS_BEFORE, m, { targetMonth: tm }), B = previewCtx(src, m, { targetMonth: tm });
      vm.runInContext('_regularBuildPreview()', A); vm.runInContext('_regularBuildPreview()', B);
      // FC1-R2 — rows now carry the base proof Save checks, so the comparison is of what was COMPUTED.
      var proj = function (P) { return P && { t: [P.targetYear, P.targetMonth, P.method, P.baseYear, P.baseMonth],
        rows: P.rows.map(function (r) { return [r.sku, r.oldQty, r.newQty, r.existing]; }) }; };
      ok(A._regularPreview && JSON.stringify(proj(A._regularPreview)) === JSON.stringify(proj(B._regularPreview)) && A.saveEnabled === B.saveEnabled,
        'J' + (1 + 2 * k + t) + '  ' + m + ', target month ' + tm + ': identical preview, row for row', { before: A._regularPreview, after: B._regularPreview });
    });
  });

  section('K  the month view is a view choice, refused while editing');
  var K = historyCtx(src, { fcEditState: { isEditing: false }, renders: 0, document: undefined });
  vm.runInContext('function renderFcRegularTable(){ renders++; }', K);
  vm.runInContext(fnSrc(src, '_fcSyncRegularMonthViewButtons_'), K);
  vm.runInContext(fnSrc(src, 'fcSetRegularMonthView'), K);
  vm.runInContext('fcSetRegularMonthView("bogus")', K);
  ok(K._fcRegularMonthView_ === 'forecast' && K.renders === 0, 'K1  an unknown view is ignored');
  vm.runInContext('fcSetRegularMonthView("actual")', K);
  ok(K._fcRegularMonthView_ === 'actual' && K.renders === 1, 'K2  a known view switches and re-renders once');
  vm.runInContext('fcEditState.isEditing = true; fcSetRegularMonthView("achievement")', K);
  ok(K._fcRegularMonthView_ === 'actual' && K.renders === 1, 'K3  and nothing switches while Base FC is being edited');
  ok(/_fcRegularMonthView_ = 'forecast'/.test(fnSrc(src, 'confirmFcEdit')), 'K4  entering edit returns the table to Forecast');
}

checks(FCS);

// ===================================================================================================
section('M  mutants - each re-opens one defect and must be caught');
var MUTANTS = [
  ['M1  the preview guard removed (history method falls through to the Manual preview)',
   "  if (_fcIsHistoryMethod_(method)) {\n    _regularClearPreview(); _setRegularManualHelp(_fcHistoryMethodRefusalText_(), '#b45309'); return;\n  }\n", ''],
  ['M2  the source switched on', "table: 'fc_achievement_monthly', connected: false", "table: 'fc_achievement_monthly', connected: true"],
  ['M3  a blank coerced to zero', "  if (typeof v === 'string' && /^\\s*-?\\d+(\\.\\d+)?\\s*$/.test(v)) return Number(v);",
   "  if (typeof v === 'string') return Number(v) || 0;"],
  // FC1-FINAL — _fcEventAchievementCell_ states the same two guard lines, so the anchor now starts at the
  // line only _fcAchievementCell_ has. The mutant is unchanged: the zero-forecast guard removed.
  ['M4  zero forecast divided anyway',
   "  var f = _fcHistoryExplicitNumber_(forecastRaw);\n  if (f == null) return { state: FC_HISTORY_STATE_.FORECAST_MISSING, value: null };\n  if (f === 0) return { state: FC_HISTORY_STATE_.FORECAST_ZERO, value: null };\n",
   "  var f = _fcHistoryExplicitNumber_(forecastRaw);\n  if (f == null) return { state: FC_HISTORY_STATE_.FORECAST_MISSING, value: null };\n"]
];
MUTANTS.forEach(function (mu) {
  var n = FCS.split(mu[1]).length - 1;
  if (n !== 1) { fail++; console.error('FAIL ' + mu[0] + ' - anchor found ' + n + 'x (vacuous mutant)'); return; }
  quiet = true; quietFails = 0;
  try { checks(FCS.replace(mu[1], mu[2])); } catch (e) { quietFails++; }
  quiet = false;
  ok(quietFails > 0, mu[0] + ' -> caught (' + quietFails + ' assertion(s) failed)');
});

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, ' + MUTANTS.length + ' mutants');
if (fail) process.exitCode = 1;
