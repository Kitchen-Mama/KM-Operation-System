// Kitchen Mama Operation System — FC1-FINAL
// TWO READ-ONLY REFERENCES, AND STILL NO SOURCE: the builder Preview's "Actual Sales (same month last
// year)" column, and the Special Events table's Actual Qty and Achievement % columns.
//
//   X  counter-examples at BASE_REF: the shared Preview had no such column; the Event table stopped at FC Qty
//   P  the reference period is the TARGET's month a year earlier — never the Base period, never the clock
//   R  the real renderer, for all three methods that legally preview: the column, its place, its dash and why
//   I  site / SKU isolation and the zero rule, on a connected source constructed HERE (the page has none)
//   S  nothing else moved: the preview rows, the formulas, the guards and the Save payload are as they were
//   H  the two phase-2 methods still refuse Preview and Save by name
//   G  a new Preview, a changed Target or a refusal leaves nothing of the previous one behind
//   E  the Event table: order, the shared column schema, the Columns menu, old preferences, Edit mode, writes
//   C  the phase-2 Event contract, in isolation: inclusive days, Daily vs Monthly, zero vs missing,
//      not started, provisional, overlap left undecided, achievement uncapped and never Infinity
//   N  nothing here can reach a source or a clock
//   M  mutants, each re-opening one defect, must be caught
//
// Run: node assets/tests/fc-preview-last-year-actual-and-event-achievement-fc1-final.test.js
// NOTE: no 'use strict' — extracted browser fns run in vm sandboxes (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
var pass = 0, fail = 0, quiet = false, quietFails = 0;
function ok(c, l, extra) {
  if (quiet) { if (!c) quietFails++; return; }
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra).slice(0, 600))); }
}
function eq(a, e, l) { ok(JSON.stringify(a) === JSON.stringify(e), l, { exp: e, got: a }); }
function section(t) { if (!quiet) console.log('\n== ' + t + ' =='); }

var REPO = path.join(__dirname, '..', '..');
var BASE_REF = '2af8d156';
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
function gitRead(p) { return cp.execSync('git show ' + BASE_REF + ':' + p, { cwd: REPO, encoding: 'utf8', maxBuffer: 1e8 }).replace(/\r\n/g, '\n'); }
var JS_REL = 'assets/js/pages/fc-summary.js', HTML_REL = 'assets/html/pages/fc-summary.html';
var FCS = read(JS_REL), HTML = read(HTML_REL);
var FCS_BASE = gitRead(JS_REL), HTML_BASE = gitRead(HTML_REL);

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
function has(src, name) { return src.indexOf('function ' + name + '(') !== -1; }
function hasVar(src, name) { return new RegExp('^var ' + name + '\\s*=', 'm').test(src); }

var HIST_VARS = ['_FC_SHARE_DASH_', 'FC_HISTORY_SOURCE_', 'FC_HISTORY_STATE_', 'FC_HISTORY_STATE_TEXT_',
  'FC_EVENT_HISTORY_SOURCE_', 'FC_EVENT_HISTORY_STATE_', 'FC_EVENT_HISTORY_STATE_TEXT_'];
var HIST_FNS = ['_fcHistoryExplicitNumber_', '_fcHistoryKey_', '_fcHistoryActualCell_', '_fcAchievementCell_',
  '_fcHistoryRecordFor_', '_fcHistoryCellText_', '_fcColEsc_', '_fcPreviewRefPeriod_', '_fcPreviewLastYearHeader_',
  '_fcPreviewLastYearCell_', '_fcEventDay_', '_fcEventDayStr_', '_fcEventPrevDay_', '_fcEventActualCell_',
  '_fcEventAchievementCell_', '_fcEventHistoryText_', '_fcEventHistoryCellsHtml_'];
function histCtx(src, extra) {
  var ctx = vm.createContext(Object.assign({ console: console }, extra || {}));
  HIST_VARS.forEach(function (v) { if (hasVar(src, v)) vm.runInContext(varSrc(src, v), ctx); });
  HIST_FNS.forEach(function (f) { if (has(src, f)) vm.runInContext(fnSrc(src, f), ctx); });
  return ctx;
}

/* The real _regularRenderPreview, in a box that holds only what it touches. */
function renderCtx(src, preview) {
  var box = { innerHTML: '', style: { display: 'none' }, querySelectorAll: function () { return []; }, querySelector: function () { return null; } };
  var cnt = { textContent: '' };
  var ctx = histCtx(src, { document: { getElementById: function (id) { return id === 'regular-preview' ? box : (id === 'regular-affected-count' ? cnt : null); } },
    _regularPreview: preview, __box: box, __cnt: cnt });
  vm.runInContext('function _fmvEscapeHtml(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }', ctx);
  vm.runInContext(fnSrc(src, '_regularOnManualInput'), ctx);
  vm.runInContext(fnSrc(src, '_regularRenderPreview'), ctx);
  return ctx;
}
function headers(html) { var out = []; html.replace(/<th[^>]*>([^<]*)<\/th>/g, function (m, t) { out.push(t); return m; }); return out; }
function rowsOf(html) {
  var out = [];
  html.replace(/<tr>([\s\S]*?)<\/tr>/g, function (m, inner) {
    if (/<th/.test(inner)) return m;
    var cells = []; inner.replace(/<td([^>]*)>([\s\S]*?)<\/td>/g, function (mm, attrs, txt) { cells.push({ attrs: attrs, text: txt }); return mm; });
    out.push(cells); return m;
  });
  return out;
}
var EXISTING = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function previewOf(method, ty, tm) {
  return { targetYear: ty, targetMonth: tm, method: method, baseYear: 2024, baseMonth: 2,
    rows: [{ sku: 'SKU-1', company: 'KM', country: 'US', marketplace: 'Amazon', category: 'C', series: 'S',
             existing: EXISTING, oldQty: 10, newQty: method === 'manual' ? null : 12, base: method === 'manual' ? null : { year: 2024, month: 2, value: 11 } },
           { sku: 'SKU-2', company: 'KM', country: 'US', marketplace: 'Amazon', category: 'C', series: 'S',
             existing: EXISTING, oldQty: null, newQty: method === 'manual' ? null : 0, base: method === 'manual' ? null : { year: 2024, month: 2, value: 0 } }] };
}

// ===================================================================================================
section('X  counter-examples at ' + BASE_REF + ' (before FC1-FINAL)');
var X = renderCtx(FCS_BASE, previewOf('actual', 2027, 9));
vm.runInContext('_regularRenderPreview()', X);
eq(headers(X.__box.innerHTML), ['SKU', 'Category / Series', 'Current Forecast (Oct 2027)', 'New Forecast', 'Change'],
  'X1  the shared Preview had five columns and no last-year Actual Sales');
var evHeadBase = HTML_BASE.slice(HTML_BASE.indexOf('id="fc-event-scroll-header"'), HTML_BASE.indexOf('table-body-bar', HTML_BASE.indexOf('id="fc-event-scroll-header"')));
ok(/FC Qty<\/div>\s*<\/div>/.test(evHeadBase) && evHeadBase.indexOf('Actual Qty') === -1, 'X2  the Special Events header ended at FC Qty: no Actual Qty, no Achievement %');
ok(!has(FCS_BASE, '_fcEventActualCell_') && !has(FCS_BASE, '_fcPreviewLastYearCell_'), 'X3  and no contract existed for either');

// ===================================================================================================
function checks(src, html) {
  var C = histCtx(src);
  var S = C.FC_HISTORY_STATE_, E = C.FC_EVENT_HISTORY_STATE_;

  section('P  the reference period: Target Year - 1, the same Target Month');
  eq(C._fcPreviewRefPeriod_(2027, 9), { year: 2026, month: 9, label: 'Oct 2026' }, 'P1  Target Oct 2027 -> Oct 2026');
  eq(C._fcPreviewRefPeriod_(2027, 0), { year: 2026, month: 0, label: 'Jan 2026' }, 'P2  across the year: Target Jan 2027 -> Jan 2026 (not Dec 2026)');
  eq(C._fcPreviewRefPeriod_(2028, 11), { year: 2027, month: 11, label: 'Dec 2027' }, 'P3  Target Dec 2028 -> Dec 2027');
  eq(C._fcPreviewLastYearHeader_(2027, 9), 'Actual Sales (Oct 2026)', 'P4  the heading names the period');
  ok(C._fcPreviewRefPeriod_(NaN, 3) === null && C._fcPreviewRefPeriod_(2027, 12) === null && C._fcPreviewRefPeriod_(2027, -1) === null
    && C._fcPreviewRefPeriod_(2027.5, 1) === null, 'P5  no Target, no period: nothing is defaulted');
  ok(!/Date|base|Base/.test(fnSrc(src, '_fcPreviewRefPeriod_')), 'P6  the period reads neither the clock nor the Base period');

  section('R  the real renderer, for each method that legally previews');
  ['actual', 'prevMonth', 'manual'].forEach(function (method, k) {
    var R = renderCtx(src, previewOf(method, 2027, 9));
    vm.runInContext('_regularRenderPreview()', R);
    var h = headers(R.__box.innerHTML), rows = rowsOf(R.__box.innerHTML);
    eq(h, ['SKU', 'Category / Series', 'Actual Sales (Oct 2026)', 'Current Forecast (Oct 2027)', 'New Forecast', 'Change'],
      'R' + (k * 4 + 1) + ' ' + method + ': one new column, between Category / Series and Current Forecast');
    ok(rows.length === 2 && rows.every(function (c) { return c.length === 6 && c[2].text === '—'; }),
      'R' + (k * 4 + 2) + ' ' + method + ': every row shows a dash in it, never 0', rows.map(function (c) { return c[2] && c[2].text; }));
    ok(rows.every(function (c) { return /data-fc-history-state="FC_HISTORY_NOT_CONNECTED"/.test(c[2].attrs) && /data-fc-ref-period="2026-10"/.test(c[2].attrs)
      && /not connected yet \(phase 2\)/.test(c[2].attrs) && /not used by New Forecast, Change or Save/.test(c[2].attrs); }),
      'R' + (k * 4 + 3) + ' ' + method + ': each cell names its state, its period and why it is empty', rows[0] && rows[0][2].attrs);
    ok(method === 'manual' ? (R.__box.innerHTML.match(/class="reg-prev-new"/g) || []).length === 2 && rows[0][4].text.indexOf('data-idx="0"') > -1
      : rows[0][3].text === '10' && rows[0][4].text === '12', 'R' + (k * 4 + 4) + ' ' + method + ': the Forecast cells are where they were, unchanged');
  });

  section('I  isolation and the zero rule, on a connected source built here');
  var live = { connected: true };
  var recs = {};
  function put(co, ct, mk, sku, y, m, units, fin) { recs[C._fcHistoryKey_(co, ct, mk, sku, y, m)] = { actual_units: units, is_final: fin !== false }; }
  put('KM', 'US', 'Amazon', 'SKU-1', 2026, 9, 120);
  put('KM', 'US', 'Walmart', 'SKU-2', 2026, 9, 999);     // another SITE's month: must not answer for Amazon SKU-2
  put('KM', 'CA', 'Amazon', 'SKU-2', 2026, 9, 888);      // another COUNTRY
  put('KM', 'US', 'Amazon', 'SKU-3', 2026, 9, 0);        // an explicit, final 0
  put('KM', 'US', 'Amazon', 'SKU-4', 2027, 9, 777);      // the TARGET year's month (a forecast-shaped neighbour)
  put('KM', 'US', 'Amazon', 'SKU-5', 2026, 9, '');       // blank
  put('KM', 'US', 'Amazon', 'SKU-6', 2026, 9, 50, false);// not closed
  function cellFor(sku, mk) { return C._fcPreviewLastYearCell_({ company: 'KM', country: 'US', marketplace: mk || 'Amazon', sku: sku }, 2027, 9, live, function (k) { return recs[k] || null; }); }
  eq([cellFor('SKU-1').state, cellFor('SKU-1').text], [S.VALUE, '120'], 'I1  its own site, SKU and month: 120');
  eq([cellFor('SKU-2').state, cellFor('SKU-2').text], [S.ACTUAL_MISSING, '—'], 'I2  another marketplace or country never answers for it');
  eq(cellFor('SKU-2', 'Walmart').text, '999', 'I2b ... while that Walmart row gets its own month');
  eq([cellFor('SKU-3').state, cellFor('SKU-3').text], [S.VALUE, '0'], 'I3  an explicit, final 0 shows 0');
  eq(cellFor('SKU-4').state, S.ACTUAL_MISSING, 'I4  the Target year\'s own month is not last year\'s actual');
  eq([cellFor('SKU-5').state, cellFor('SKU-5').text], [S.ACTUAL_MISSING, '—'], 'I5  blank is missing, not 0');
  eq(cellFor('SKU-6').state, S.ACTUAL_NOT_FINAL, 'I6  an unclosed month is not shown as a result');
  eq(cellFor('SKU-1', 'amazon').text, '120', 'I7  the marketplace matches the way _regularFindFc matches it (case-insensitive)');
  var calls = 0;
  var un = C._fcPreviewLastYearCell_({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1' }, 2027, 9, C.FC_HISTORY_SOURCE_, function () { calls++; return recs[Object.keys(recs)[0]]; });
  ok(un.state === S.NOT_CONNECTED && un.text === '—' && calls === 0, 'I8  the page\'s source is unconnected: the lookup is never called, so no read can follow', { un: un, calls: calls });

  section('S  nothing else moved');
  var P0 = previewOf('actual', 2027, 9), before = JSON.stringify(P0);
  var R2 = renderCtx(src, P0);
  vm.runInContext('_regularRenderPreview()', R2);
  ok(JSON.stringify(R2._regularPreview) === before, 'S1  rendering adds nothing to the preview rows (Save builds its payload from those rows)');
  ['_regularBuildPreview', 'saveRegularUpdate', '_regularBaseValue_', '_regularDerivedBasePeriod_', '_regularFindFc', '_regularExistingMonths', '_regularOnManualInput']
    .forEach(function (f, i) { ok(fnSrc(src, f) === fnSrc(FCS_BASE, f), 'S' + (i + 2) + '  ' + f + ' is byte-identical to ' + BASE_REF); });
  ok(fnSrc(src, 'fcBuildEventWriteRows') === fnSrc(FCS_BASE, 'fcBuildEventWriteRows') && fnSrc(src, 'updateEventFcQty') === fnSrc(FCS_BASE, 'updateEventFcQty'),
    'S9  the Special Event write rows and the FC Qty editor are byte-identical too');

  section('H  the two phase-2 methods still refuse');
  ok(/if \(_fcIsHistoryMethod_\(method\)\) \{\n\s+_regularClearPreview\(\); _setRegularManualHelp\(_fcHistoryMethodRefusalText_\(\), '#b45309'\); return;/.test(fnSrc(src, '_regularBuildPreview')),
    'H1  Preview is refused for Last Year Same Month Actual and Interval Average, before any branch');
  ok(/FC_HISTORY_METHOD_REFUSAL_/.test(fnSrc(src, '_fcHistoryMethodRefusalText_')) && /_fcIsHistoryMethod_/.test(fnSrc(src, 'saveRegularUpdate')),
    'H2  ... by name (FC_HISTORY_METHOD_NOT_AVAILABLE), and Save refuses them too');

  section('G  nothing of a previous Preview survives');
  var G = renderCtx(src, previewOf('actual', 2027, 9));
  vm.runInContext('_regularRenderPreview()', G);
  vm.runInContext('_regularPreview = ' + JSON.stringify(previewOf('prevMonth', 2028, 2)) + '; _regularRenderPreview();', G);
  ok(headers(G.__box.innerHTML)[2] === 'Actual Sales (Mar 2027)' && G.__box.innerHTML.indexOf('Oct 2026') === -1 && G.__box.innerHTML.indexOf('2026-10') === -1,
    'G1  a new Preview for Mar 2028 reads Mar 2027 everywhere, and Oct 2026 is gone', headers(G.__box.innerHTML));
  ok(/function _regularClearPreview\(\) \{\n  _regularPreview = null;\n  var box = document\.getElementById\('regular-preview'\); if \(box\) \{ box\.style\.display = 'none'; box\.innerHTML = ''; \}/.test(src),
    'G2  a changed Target, method or scope clears the whole table (heading included) — the existing clear, unchanged');

  section('E  the Special Events table');
  var evHead = html.slice(html.indexOf('id="fc-event-scroll-header"'), html.indexOf('table-body-bar', html.indexOf('id="fc-event-scroll-header"')));
  var labels = []; evHead.replace(/<div class="header-cell"[^>]*>([^<]*)<\/div>/g, function (m, t) { labels.push(t); return m; });
  eq(labels.slice(-3), ['FC Qty', 'Actual Qty', 'Achievement %'], 'E1  the header: FC Qty, then Actual Qty, then Achievement %');
  eq(labels.length, 11, 'E2  eleven scroll columns; columns 1-9 did not move');
  var spec = vm.runInContext('(' + varSrc(src, 'FC_RESIZE_TABLES_').replace(/^var FC_RESIZE_TABLES_\s*=\s*/, '').replace(/;$/, '') + ')',
    vm.createContext({ _fcResizeCols_: function (w, label, group) { return { w: w, label: label, group: group || 'identity' }; },
      _fcMonthCols_: function (n) { return n.map(function (x) { return { w: 70, label: x, group: 'months' }; }); } }));
  var ev = spec.filter(function (t) { return t.group === 'fc-event'; })[0];
  eq(ev.cols.map(function (c) { return c.label; }), labels, 'E3  the shared column schema (widths, Columns menu, visibility) declares the same eleven');
  eq(ev.cols.slice(-2).map(function (c) { return [c.w, c.group]; }), [[100, 'summary'], [120, 'summary']], 'E4  both are Summary columns, 100px and 120px');
  // the Columns-menu registry and an OLD stored preference
  var store = { 'km.ui.fcSummary.hiddenColumns.v1': JSON.stringify({ v: 1, hidden: { 'fc-event': ['event-period'], 'fc-regular': ['sep'] } }) };
  var V = vm.createContext({ localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = v; } },
    _fcResizeCols_: function (w, label, group) { return { w: w, label: label, group: group || 'identity' }; },
    _fcMonthCols_: function (n) { return n.map(function (x) { return { w: 70, label: x, group: 'months' }; }); } });
  ['FC_RESIZE_TABLES_', 'FC_COLPREF_KEY_', 'FC_COLPREF_VERSION_', '_fcVisibleColsState'].forEach(function (v) { vm.runInContext(varSrc(src, v), V); });
  ['_fcHasLocalStorage_', '_fcColKey_', 'fcColumnRegistry_', '_fcColPrefRead_', 'fcResolveVisibleColumns_'].forEach(function (f) { vm.runInContext(fnSrc(src, f), V); });
  var reg = vm.runInContext('fcColumnRegistry_("fc-event")', V);
  eq(reg.slice(-2).map(function (c) { return [c.key, c.col, c.hideable]; }), [['actual-qty', 10, true], ['achievement-pct', 11, true]],
    'E5  the Columns menu offers them as actual-qty (col 10) and achievement-pct (col 11)');
  var st = vm.runInContext('fcResolveVisibleColumns_(true)', V);
  var evVis = {}; st['fc-event'].forEach(function (c) { evVis[c.key] = c.visible; });
  ok(evVis['actual-qty'] === true && evVis['achievement-pct'] === true, 'E6  a preference saved before they existed does not hide them');
  ok(evVis['event-period'] === false && st['fc-regular'].filter(function (c) { return c.key === 'sep'; })[0].visible === false,
    'E7  ... and keeps every other choice it held, in both tables');
  eq(JSON.parse(store['km.ui.fcSummary.hiddenColumns.v1']).hidden, { 'fc-event': ['event-period'], 'fc-regular': ['sep'] }, 'E8  reading it rewrites nothing');
  // the cells, read-only and in Edit Event FC mode
  var item = { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', campaignId: 'CMP-1', startDate: '2026-11-19', endDate: '2026-11-30',
    fcQty: 40, raw: { fc_qty: 40 } };
  var ro = C._fcEventHistoryCellsHtml_(item, ''), ed = C._fcEventHistoryCellsHtml_(item, 'fc-cell-readonly');
  ok((ro.match(/<div class="scroll-cell/g) || []).length === 2 && /data-fc-evt-col="actual-qty"[^>]*>—<\/div>/.test(ro) && /data-fc-evt-col="achievement-pct"[^>]*>—<\/div>/.test(ro),
    'E9  two cells, a dash in each', ro);
  ok((ro.match(/FC_HISTORY_NOT_CONNECTED/g) || []).length === 2 && /not connected yet \(phase 2\)/.test(ro), 'E10 each names the unconnected source in its state and tooltip');
  ok(/fc-cell-readonly/.test(ed) && ed.indexOf('<input') === -1, 'E11 Edit Event FC mode: plain read-only text, never an input');
  var editFn = fnSrc(src, 'renderFcEventTableEditable');
  ok((editFn.match(/<input/g) || []).length === 1 && /_fcEventHistoryCellsHtml_\(item, 'fc-cell-readonly'\)/.test(editFn), 'E12 the edit row still has exactly one input: FC Qty');
  ok(/_fcEventHistoryCellsHtml_\(item, ''\)/.test(fnSrc(src, 'renderFcEventTable')), 'E13 the read-only row renders the same two cells');

  section('C  the phase-2 Event contract, in isolation');
  var on = { connected: true };
  var ev1 = { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', campaignId: 'CMP-1', startDate: '2026-11-19', endDate: '2026-11-21' };
  function day(date, units, o) { return Object.assign({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', date: date, units: units }, o || {}); }
  var full = { daily: [day('2026-11-18', 1000), day('2026-11-19', 10), day('2026-11-20', 20), day('2026-11-21', 30), day('2026-11-22', 1000),
    day('2026-11-20', 500, { sku: 'SKU-2' }), day('2026-11-20', 500, { marketplace: 'Walmart' })] };
  eq(C._fcEventActualCell_(on, ev1, full, '2026-12-01'), { state: S.VALUE, value: 60 }, 'C1  start and end days included, the days around them and other SKUs / sites not: 60');
  eq(C._fcEventActualCell_(C.FC_EVENT_HISTORY_SOURCE_, ev1, full, '2026-12-01').state, S.NOT_CONNECTED, 'C2  the page\'s source is unconnected: NOT_CONNECTED whatever data is handed in');
  eq(C._fcEventActualCell_(on, ev1, { daily: [day('2026-11-19', 0), day('2026-11-20', 0), day('2026-11-21', 0)] }, '2026-12-01'), { state: S.VALUE, value: 0 },
    'C3  every day present and explicitly 0: the actual is 0');
  eq(C._fcEventActualCell_(on, ev1, { daily: [day('2026-11-19', 5), day('2026-11-21', 5)] }, '2026-12-01').state, E.INCOMPLETE, 'C4  a missing day: INCOMPLETE, never counted as 0');
  eq(C._fcEventActualCell_(on, ev1, { daily: [day('2026-11-19', 5), day('2026-11-20', ''), day('2026-11-21', 5)] }, '2026-12-01').state, E.INCOMPLETE, 'C5  a blank day is a missing day');
  eq(C._fcEventActualCell_(on, ev1, { daily: full.daily.concat([day('2026-11-20', 1)]) }, '2026-12-01').state, E.DUPLICATE_DAY, 'C6  a day recorded twice is refused, not summed');
  eq(C._fcEventActualCell_(on, ev1, full, '2026-11-18').state, E.NOT_STARTED, 'C7  not started: NOT_STARTED, not 0');
  eq(C._fcEventActualCell_(on, ev1, full, '2026-11-19').state, E.NOT_STARTED, 'C8  on its first day there is no completed day yet');
  eq(C._fcEventActualCell_(on, ev1, full, '2026-11-21'), { state: E.PROVISIONAL, value: 30 }, 'C9  running: the completed days so far, marked PROVISIONAL');
  eq(C._fcEventHistoryText_(C._fcEventActualCell_(on, ev1, full, '2026-11-21'), 'units'), '30 (provisional)', 'C10 ... and it says so where it is shown');
  eq(C._fcEventActualCell_(on, ev1, full, '2026-11-22'), { state: S.VALUE, value: 60 }, 'C11 the day after the end day: final');
  eq(C._fcEventActualCell_(on, ev1, full, '2026-12-01', { overlapping: true }).state, E.OVERLAP_UNRESOLVED, 'C12 an overlap with another event is left undecided, not counted twice');
  eq(C._fcEventActualCell_(on, Object.assign({}, ev1, { campaignId: '' }), full, '2026-12-01').state, E.IDENTITY_MISSING, 'C13 no campaign identity: nothing is matched by name');
  eq(C._fcEventActualCell_(on, Object.assign({}, ev1, { endDate: '2026-11-18' }), full, '2026-12-01').state, E.PERIOD_INVALID, 'C14 an end before the start is not a period');
  eq(C._fcEventActualCell_(on, Object.assign({}, ev1, { startDate: 'Thu Nov 19 2026' }), full, '2026-12-01').state, E.PERIOD_INVALID, 'C15 a day that is not YYYY-MM-DD is not parsed');
  eq(C._fcEventActualCell_(on, ev1, full, null).state, E.AS_OF_MISSING, 'C16 no site calendar day supplied: nothing is assumed');
  // Monthly: only for a WHOLE calendar month inside the period, only when complete; never shared out by day.
  var evM = Object.assign({}, ev1, { startDate: '2026-10-30', endDate: '2026-12-02' });
  function mon(month, units, complete) { return { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', month: month, units: units, complete: complete }; }
  var edges = [day('2026-10-30', 1), day('2026-10-31', 2), day('2026-12-01', 3), day('2026-12-02', 4)];
  eq(C._fcEventActualCell_(on, evM, { daily: edges, monthly: [mon('2026-11', 300, true)] }, '2026-12-10'), { state: S.VALUE, value: 310 },
    'C17 a whole November from its complete monthly figure, the part months from daily: 1+2+300+3+4 = 310');
  eq(C._fcEventActualCell_(on, evM, { daily: edges, monthly: [mon('2026-11', 300, false)] }, '2026-12-10').state, E.INCOMPLETE, 'C18 a monthly figure not marked complete is not used');
  eq(C._fcEventActualCell_(on, evM, { daily: [day('2026-10-30', 1), day('2026-10-31', 2)], monthly: [mon('2026-11', 300, true), mon('2026-12', 900, true)] }, '2026-12-10').state,
    E.INCOMPLETE, 'C19 a PART month (Dec 1-2) is never taken from a monthly figure, nor shared out by day count');
  eq(C._fcEventActualCell_(on, evM, { daily: edges, monthly: [mon('2026-11', 300, true)] }, '2026-11-20').state, E.INCOMPLETE,
    'C20 a month still running is not "whole", so its monthly figure is not used');
  eq(C._fcEventActualCell_(on, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', campaignId: 'C', startDate: '2026-12-31', endDate: '2027-01-01' },
    { daily: [day('2026-12-31', 7), day('2027-01-01', 8)] }, '2027-01-02'), { state: S.VALUE, value: 15 }, 'C21 across the year end, by calendar day');
  eq(C._fcEventActualCell_(on, { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', campaignId: 'C', startDate: '2028-02-28', endDate: '2028-03-01' },
    { daily: [day('2028-02-28', 1), day('2028-02-29', 1), day('2028-03-01', 1)] }, '2028-03-02'), { state: S.VALUE, value: 3 }, 'C22 a leap day is a day');
  // Achievement
  var A = function (fc, act) { return C._fcEventAchievementCell_(fc, act); };
  var val = function (n) { return { state: S.VALUE, value: n }; };
  eq(A(40, val(0)), { state: S.VALUE, value: 0 }, 'C23 Actual 0 on FC 40: 0.0%');
  eq(C._fcEventHistoryText_(A(40, val(0)), 'pct'), '0.0%', 'C24 ... printed 0.0%');
  eq(C._fcEventHistoryText_(A(40, val(60)), 'pct'), '150.0%', 'C25 over 100% is not capped');
  eq(C._fcEventHistoryText_(A(3, val(1)), 'pct'), '33.3%', 'C26 one decimal');
  eq(A(0, val(5)).state, S.FORECAST_ZERO, 'C27 FC 0: undefined, never Infinity');
  eq(A('', val(5)).state, S.FORECAST_MISSING, 'C28 FC missing: named');
  eq(A(40, { state: E.INCOMPLETE, value: null }).state, E.INCOMPLETE, 'C29 an actual that is not a number passes its own reason through');
  eq(C._fcEventHistoryText_(A(40, { state: E.PROVISIONAL, value: 30 }), 'pct'), '75.0% (provisional)', 'C30 a running actual gives a provisional achievement');
  ok(!/Infinity|NaN/.test(C._fcEventHistoryText_(A(0, val(5)), 'pct')), 'C31 nothing prints Infinity or NaN');
  var item0 = { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU-1', campaignId: 'CMP-1', fcQty: 0, raw: { fc_qty: '' } };
  ok(/FC_HISTORY_NOT_CONNECTED/.test(C._fcEventHistoryCellsHtml_(item0, '')), 'C32 a row whose stored FC is blank still shows the unconnected source first');

  section('N  no source, no clock');
  var newFns = ['_fcPreviewRefPeriod_', '_fcPreviewLastYearHeader_', '_fcPreviewLastYearCell_', '_fcEventDay_', '_fcEventDayStr_', '_fcEventPrevDay_',
    '_fcEventActualCell_', '_fcEventAchievementCell_', '_fcEventHistoryText_', '_fcEventHistoryCellsHtml_'].map(function (f) { return fnSrc(src, f); }).join('\n');
  ok(!/fetch\(|XMLHttpRequest|google\.script|KM\.api|KM\.DB|_fcPrereq|loadPartial/.test(newFns), 'N1  none of the new code can issue a request');
  ok(!/new Date|Date\.now|getUTC|toISOString/.test(newFns), 'N2  none of it reads a clock or converts through UTC');
  ok(Object.isFrozen(C.FC_EVENT_HISTORY_SOURCE_) && C.FC_EVENT_HISTORY_SOURCE_.connected === false && C.FC_EVENT_HISTORY_SOURCE_.daily === null,
    'N3  the Event source is frozen, unconnected, and names no table yet');
}
checks(FCS, HTML);

// ===================================================================================================
section('B  the real-browser evidence (_fc1-final-runner.js, 1440 and 820, fixture only, Save never clicked)');
var BEV = 'docs/evidence/fc1-final/';
var bAfter = JSON.parse(read(BEV + 'after/fc1-final.json')), bBefore = JSON.parse(read(BEV + 'before/fc1-final.json'));
ok(bAfter.mode === 'after' && bAfter.summary.failed === 0 && bAfter.summary.checks >= 50, 'B1  after: every check passed', bAfter.summary);
var crypto = require('crypto');
function sha16(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }
var staleB = [JS_REL, HTML_REL, 'assets/css/pages/fc-overview.css'].filter(function (f) { return bAfter.sources[f] !== sha16(f); });
ok(staleB.length === 0, 'B2  the after-evidence was taken on exactly these sources', staleB);
['1440', '820'].forEach(function (w) {
  ok(bAfter.checks.some(function (c) { return c.ok && c.name.indexOf('P ' + w + ' Apply Growth Rate: the column is "Actual Sales (Oct 2026)"') === 0; })
    && bAfter.checks.some(function (c) { return c.ok && c.name.indexOf('P ' + w + ': the modal stays inside the window') === 0; })
    && bAfter.checks.some(function (c) { return c.ok && c.name.indexOf('E ' + w + ': scrolled to the far right, header and body still aligned') === 0; })
    && bAfter.checks.some(function (c) { return c.ok && c.name.indexOf('E ' + w + ' Edit Event FC: exactly one input per row') === 0; }),
    'B3  ' + w + ': the column, the modal fit, the scrolled alignment and Edit mode were each seen to hold');
});
ok(bAfter.checks.some(function (c) { return c.ok && /^W zero writes/.test(c.name); }), 'B4  every request the page made was a read');
var bFailed = bBefore.checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.name; });
ok(bBefore.base_ref === BASE_REF && bFailed.length >= 20 && bFailed.every(function (n) { return /^[PE] /.test(n); }),
  'B5  before (' + BASE_REF + '): the same runner fails, and only on the columns this round adds', bFailed.slice(0, 6));

// ===================================================================================================
section('M  mutants - each re-opens one defect and must be caught');
var MUTANTS = [
  ['M1  the reference year is the Target year', "  return { year: y - 1, month: m, label: MON[m] + ' ' + (y - 1) };", "  return { year: y, month: m, label: MON[m] + ' ' + (y - 1) };"],
  ['M2  an unconnected source is asked anyway', "  var record = (connected && key && typeof recordFor === 'function') ? recordFor(key) : null;",
   "  var record = (key && typeof recordFor === 'function') ? recordFor(key) : null;"],
  ['M3  the key drops the marketplace', "  var key = p ? _fcHistoryKey_(row.company, row.country, row.marketplace, row.sku, p.year, p.month) : null;",
   "  var key = p ? _fcHistoryKey_(row.company, row.country, 'Amazon', row.sku, p.year, p.month) : null;"],
  ['M4  the reference stored on the preview row', "    var ly = _fcPreviewLastYearCell_(r, _regularPreview.targetYear, _regularPreview.targetMonth,\n      FC_HISTORY_SOURCE_, _fcHistoryRecordFor_);\n",
   "    var ly = _fcPreviewLastYearCell_(r, _regularPreview.targetYear, _regularPreview.targetMonth,\n      FC_HISTORY_SOURCE_, _fcHistoryRecordFor_);\n    r.lastYearActual = ly.value;\n"],
  ['M5  a missing day counted as zero', "      if (v == null) { complete = false; break; }", "      if (v == null) { v = 0; }"],
  ['M6  a monthly figure shared into a part month', "      if (d0 === 1 && d1 === dim && mr && mr.complete === true && mv != null) seg = mv;",
   "      if (mr && mr.complete === true && mv != null) seg = mv;"],
  ['M7  achievement capped at 100%', "  return { state: a.state, value: Math.round(a.value / f * 1000) / 10 };",
   "  return { state: a.state, value: Math.min(100, Math.round(a.value / f * 1000) / 10) };"],
  ['M8  not started shown as zero', "  if (asOf.s <= st.s) return { state: S.NOT_STARTED, value: null };", "  if (asOf.s <= st.s) return { state: FC_HISTORY_STATE_.VALUE, value: 0 };"],
  ['M9  a running event shown as final', "  return { state: last === en.s ? FC_HISTORY_STATE_.VALUE : S.PROVISIONAL, value: total };", "  return { state: FC_HISTORY_STATE_.VALUE, value: total };"]
];
MUTANTS.forEach(function (mu) {
  var n = FCS.split(mu[1]).length - 1;
  if (n !== 1) { fail++; console.error('FAIL ' + mu[0] + ' - anchor found ' + n + 'x (vacuous mutant)'); return; }
  quiet = true; quietFails = 0;
  try { checks(FCS.replace(mu[1], mu[2]), HTML); } catch (e) { quietFails++; }
  quiet = false;
  ok(quietFails > 0, mu[0] + ' -> caught (' + quietFails + ' assertion(s) failed)');
});
(function () {
  var mu = ['M10 the Achievement % header dropped', '<div class="header-cell" title="Actual Qty / FC Qty x 100, one decimal. Historical sales are not connected yet (phase 2).">Achievement %</div>', ''];
  var n = HTML.split(mu[1]).length - 1;
  if (n !== 1) { fail++; console.error('FAIL ' + mu[0] + ' - anchor found ' + n + 'x (vacuous mutant)'); return; }
  quiet = true; quietFails = 0;
  try { checks(FCS, HTML.replace(mu[1], mu[2])); } catch (e) { quietFails++; }
  quiet = false;
  ok(quietFails > 0, mu[0] + ' -> caught (' + quietFails + ' assertion(s) failed)');
}());

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed, ' + (MUTANTS.length + 1) + ' mutants');
process.exitCode = fail ? 1 : 0;
