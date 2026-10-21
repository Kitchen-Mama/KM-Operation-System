// Kitchen Mama Operation System — FC1-R2
// THE REGULAR BUILDER MAY NOT TURN "NO BASE" INTO A FORECAST OF ZERO, AND IT ONLY RUNS METHODS IT KNOWS.
//
// D-S8-B3-182, measured before this round: Apply Growth Rate and Adjust From Previous Month read the base
// month as `Number(baseRow[m]) || 0`, from a row the adapter had ALREADY coerced (`parseFloat(x) || 0`),
// and a missing row was `0` outright. So "no row", "blank cell", "a word in the cell" and "a real 0" all
// reached the operator as the same number, in a preview offering to WRITE it. The Owner's rule (FC1-R1,
// confirmed) is that only an explicit 0 is a 0.
//
// THIS FILE WAS WRITTEN BEFORE THE FIX and runs against any version of the page: functions the fix adds
// are loaded only where they exist. Run against 0f8294a5 it fails the cases the round exists for; the
// controls (valid numbers, legal zero, Manual blank/zero, the history refusal) pass on both.
//
// THE CHAIN IS REAL WHERE IT MATTERS. Rows are the REAL adapter's output (normalizeFcRegularForecastRecord
// via adaptFcSummaryWorkspaceSlice, extracted from operation-system-db-api.js) built from the snake_case
// rows 58_ actually sends; the model is committed by the REAL _fcMergeSlice_; the REAL _regularBuildPreview
// builds; the REAL saveRegularUpdate saves into a spy. Only DOM edges and the site/candidate pickers are
// stubbed.
//
// Run: node assets/tests/fc-builder-base-refusal-and-method-guard-fc1-r2.test.js [path-to-fc-summary.js]
// NOTE: no 'use strict' — extracted browser fns run in vm sandboxes (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0;
function ok(c, l, extra) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (extra === undefined ? '' : '\n  got ' + JSON.stringify(extra).slice(0, 600))); }
}
function eq(a, e, l) { ok(JSON.stringify(a) === JSON.stringify(e), l, { exp: e, got: a }); }
function section(t) { console.log('\n== ' + t + ' =='); }

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.isAbsolute(p) ? p : path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read(process.argv[2] || 'assets/js/pages/fc-summary.js');
var DBA = read(process.argv[3] || 'assets/js/api/operation-system-db-api.js');

function fnSrc(src, name) {
  var sig = 'function ' + name + '(', i = src.indexOf(sig);
  if (i < 0) return null;
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
  if (!m) return null;
  var d = 0;
  for (var j = m.index; j < src.length; j++) {
    var c = src[j];
    if (c === '{' || c === '[' || c === '(') d++;
    else if (c === '}' || c === ']' || c === ')') d--;
    else if (c === ';' && d === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('unterminated var: ' + name);
}
function need(s, what) { if (!s) throw new Error('required source not found: ' + what); return s; }
function assignSrc(src, name) {   // `window.KM.DB.x = function (...) {...};`
  var sig = name + ' = function', i = src.indexOf(sig);
  if (i < 0) throw new Error('assignment not found: ' + name);
  var d = 0, started = false;
  for (var j = i; j < src.length; j++) {
    var c = src[j];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, j + 1) + ';'; }
  }
  throw new Error('unbalanced: ' + name);
}

// ---------------------------------------------------------------------------------------------------
// THE REAL ADAPTER and THE REAL MERGE
// ---------------------------------------------------------------------------------------------------
function adapt(payload) {
  var ctx = vm.createContext({ window: { KM: { DB: {} } }, console: console });
  vm.runInContext(need(fnSrc(DBA, 'normalizeFcRegularForecastRecord'), 'normalizer'), ctx);
  ['normalizeFcSpecialEventRecord', 'normalizeFcTargetRuleRecord', 'normalizeMarketplaceRecord', 'normalizePricingListRecord']
    .forEach(function (f) { vm.runInContext('function ' + f + '(r){ return r; }', ctx); });
  vm.runInContext(assignSrc(DBA, 'window.KM.DB.adaptFcSummaryWorkspaceSlice'), ctx);
  return ctx.window.KM.DB.adaptFcSummaryWorkspaceSlice(payload);
}
function mergeIntoModel(adapted) {
  var ctx = vm.createContext({ console: console, _fcReadModel: null, _fcCandidateYears_: null });
  ['FC_FRESH_', '_FC_SLICE_KEYS_', '_FC_MODEL_KEYS_', '_fcSliceState_'].forEach(function (v) { vm.runInContext(need(varSrc(FCS, v), v), ctx); });
  vm.runInContext('function _fcYearsOf_(){ return []; }', ctx);
  ['_fcHas_', '_fcSliceHasData_', '_fcSliceRec_', '_fcMergeSlice_'].forEach(function (f) { vm.runInContext(need(fnSrc(FCS, f), f), ctx); });
  ctx.adapted = adapted;
  vm.runInContext('_fcMergeSlice_("regular", adapted)', ctx);
  return ctx._fcReadModel;
}

// What 58_ sends: sheet rows, snake_case, cells exactly as Sheets returns them ('' for an empty cell).
function sheetRow(sku, year, months) {
  var r = { forecast_id: 'FC-' + sku + '-' + year, year: year, company: 'KM', country: 'US', marketplace: 'Amazon', sku: sku,
    category: 'C', series: 'S' };
  ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function (m, i) { r[m] = months[i]; });
  return r;
}
var Z12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
function withMonth(arr, idx, v) { var a = arr.slice(); a[idx] = v; return a; }
var PAYLOAD_ROWS = [
  // 2025 bases. June (5) and December (11) carry the cases.
  sheetRow('SKU-A', 2025, withMonth(withMonth(Z12, 5, 100), 11, 50)),      // valid
  sheetRow('SKU-B', 2025, withMonth(withMonth(Z12, 5, ''), 11, '')),       // blank cells
  // SKU-C has NO 2025 row at all
  sheetRow('SKU-D', 2025, withMonth(Z12, 5, 'abc')),                       // a word
  sheetRow('SKU-Z', 2025, withMonth(Z12, 5, 0)),                           // a legal zero
  sheetRow('SKU-E', 2025, withMonth(Z12, 5, '1,200')),                     // a formatted string parseFloat reads as 1
  // 2026 targets, with a blank and a zero among the months that must be preserved on write
  sheetRow('SKU-A', 2026, [11, 22, 0, '', 55, 66, 77, 88, 99, 100, 111, 122]),
  sheetRow('SKU-B', 2026, [11, 22, 0, '', 55, 66, 77, 88, 99, 100, 111, 122])
];
function payload(capped) {
  return { slice: 'regular', fcRegularForecast: PAYLOAD_ROWS.map(function (r) { return Object.assign({}, r); }),
    counts: { fcRegularForecast: PAYLOAD_ROWS.length }, capped: { fcRegularForecast: !!capped } };
}

// ---------------------------------------------------------------------------------------------------
// THE BUILDER + SAVE SANDBOX
// ---------------------------------------------------------------------------------------------------
var OPTIONAL_VARS = ['FC_HISTORY_METHODS_', 'FC_HISTORY_METHOD_REFUSAL_', 'FC_REGULAR_METHODS_', 'FC_BASE_REASON_TEXT_', '_FC_SHARE_DASH_'];
var OPTIONAL_FNS = ['_fcIsHistoryMethod_', '_fcHistoryMethodRefusalText_', '_fcHistoryExplicitNumber_', '_regularMethodVerdict_',
  '_regularBaseValue_', '_regularSourceIntegrity_', '_regularRefusePreview_', '_regularBaseRefusalText_'];

function builder(opts) {
  opts = opts || {};
  var els = {};
  function el(v) { return { value: v, style: {}, innerHTML: '', textContent: '', disabled: false, dataset: {},
    querySelectorAll: function () { return []; }, querySelector: function () { return null; } }; }
  els['regular-target-year'] = el(String(opts.targetYear == null ? 2026 : opts.targetYear));
  els['regular-target-month'] = el(String(opts.targetMonth == null ? 5 : opts.targetMonth));
  els['regular-update-method'] = el(opts.method || 'actual');
  els['regular-growth-rate'] = el('10');
  els['regular-base-year'] = el(opts.baseYear === undefined ? '2025' : opts.baseYear);
  els['regular-base-month'] = el(opts.baseMonth === undefined ? '5' : opts.baseMonth);
  els['regular-preview'] = el(''); els['regular-affected-count'] = el('');
  var model = opts.model;
  var box = { console: console, document: { getElementById: function (id) { return els[id] || null; } },
    els: els, REG_MONTH_KEYS: ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    ROWS: (model && model.fcRegularForecast) || [], _fcReadModel: model || null, READY: opts.ready !== false,
    SKUS: opts.skus || ['SKU-A'], _regularPreview: null, saveEnabled: false, rendered: 0, help: '', alerts: [], writes: [],
    window: { KM: { DB: { importFcRegularForecastBatch: function (rows) {
      box.writes.push(rows); return { then: function () { return { catch: function () {} }; } };
    } } } } };
  var ctx = vm.createContext(box);
  [ 'function _regularCloseAllMs(){}',
    'function _regularRenderPreview(){ rendered++; }',
    'function _setRegularSaveEnabled(on){ saveEnabled = !!on; }',
    'function _setRegularManualHelp(m){ help = String(m || ""); }',
    'function _regularClearPreview(){ _regularPreview = null; saveEnabled = false; }',
    'function _regularMode(){ return SKUS.length > 1 ? "batch" : "single"; }',
    'function _regularSelectedSite(){ return { company: "KM", country: "US", marketplace: "Amazon" }; }',
    'function _regularCandidateSkus(){ return SKUS.map(function(s){ return { sku: s, category: "C", series: "S", company: "KM" }; }); }',
    'function _regularFcRows(){ return ROWS; }',
    'function _fcRegularSourceReady_(){ return READY; }',
    'function _fcWorkspaceMode_(){ return true; }',
    'function _fmvEscapeHtml(s){ return String(s == null ? "" : s); }',
    'function _fcColEsc_(s){ return String(s == null ? "" : s); }',
    'function alert(m){ alerts.push(String(m)); }',
    'function _fcUseDb(){ return true; }', 'function _fcWriteBegin_(){ return true; }', 'function _fcEpoch_(){ return 1; }',
    'function _fcSettleWrite_(){}', 'function _fcFailWrite_(){}', 'function _fcAfterWriteScoped_(){}',
    'function _fcCountsLine_(){ return ""; }', 'function renderFcRegularTable(){}', 'function closeFcModal(){}',
    'var FC_SLICE_ = { REGULAR: "regular" }; var FC_MSG_ = { SAVED: "Saved" };'
  ].forEach(function (s) { vm.runInContext(s, ctx); });
  OPTIONAL_VARS.forEach(function (v) { var s = varSrc(FCS, v); if (s) vm.runInContext(s, ctx); });
  OPTIONAL_FNS.forEach(function (f) { var s = fnSrc(FCS, f); if (s) vm.runInContext(s, ctx); });
  ['_regularFindFc', '_regularExistingMonths', '_regularDerivedBasePeriod_', '_regularBuildPreview', 'saveRegularUpdate']
    .forEach(function (f) { vm.runInContext(need(fnSrc(FCS, f), f), ctx); });
  ctx.preview = function () { vm.runInContext('_regularBuildPreview()', ctx); return ctx; };
  ctx.save = function () { vm.runInContext('saveRegularUpdate()', ctx); return ctx; };
  ctx.said = function () { return ctx.help + ' ' + ctx.els['regular-preview'].innerHTML + ' ' + ctx.alerts.join(' '); };
  return ctx;
}
var MODEL = mergeIntoModel(adapt(payload(false)));
var MODEL_CAPPED = mergeIntoModel(adapt(payload(true)));

function refused(B, l, sku, period, code) {
  ok(B._regularPreview === null && B.saveEnabled === false, l + ': no preview object and Save disabled',
    { preview: B._regularPreview && B._regularPreview.rows, save: B.saveEnabled });
  var s = B.said();
  ok((!sku || s.indexOf(sku) !== -1) && (!period || s.indexOf(period) !== -1) && (!code || s.indexOf(code) !== -1),
    l + ': the refusal names ' + [sku, period, code].filter(Boolean).join(' / '), s.slice(0, 300));
}
function newQtys(B) { return B._regularPreview ? B._regularPreview.rows.map(function (r) { return [r.sku, r.newQty]; }) : null; }

// ===================================================================================================
section('A  the real adapter keeps the cell as Sheets sent it, beside the coerced display value');
var aRow = MODEL.fcRegularForecast.filter(function (r) { return r.sku === 'SKU-B' && r.year === '2025'; })[0];
ok(aRow && aRow.jun === 0 && aRow.raw && aRow.raw.jun === '', 'A1  SKU-B 2025 Jun: coerced to 0 for display, still \'\' in raw - the distinction survives the adapter', aRow && [aRow.jun, aRow.raw && aRow.raw.jun]);
ok(MODEL_CAPPED && MODEL_CAPPED.capped && MODEL_CAPPED.capped.fcRegularForecast === true,
  'A2  a CAPPED answer reaches the page model as capped - truncation is not dropped at the adapter', MODEL_CAPPED && MODEL_CAPPED.capped);
ok(MODEL && MODEL.capped && MODEL.capped.fcRegularForecast === false, 'A3  and a complete one as not capped', MODEL && MODEL.capped);

section('B  CONTROLS - valid numbers, a legal zero, both methods, across the year boundary');
eq(newQtys(builder({ model: MODEL }).preview()), [['SKU-A', 110]], 'B1  Apply Growth: base 100 x 1.10 = 110');
var bz = builder({ model: MODEL, skus: ['SKU-Z'] }).preview();
eq(newQtys(bz), [['SKU-Z', 0]], 'B2  an explicit 0 base is a base: 0, and the preview stands');
ok(bz.saveEnabled === true, 'B3  and it can be saved');
var bx = builder({ model: MODEL, method: 'prevMonth', targetMonth: 0 }).preview();
eq(newQtys(bx), [['SKU-A', 55]], 'B4  Previous Month across the year: Jan 2026 reads Dec 2025 (50 x 1.10 = 55)');
eq(bx._regularPreview && [bx._regularPreview.baseYear, bx._regularPreview.baseMonth], [2025, 11], 'B5  and records the derived period');

section('C  a base that is not there is REFUSED, by SKU, period and reason - never offered as 0');
refused(builder({ model: MODEL, skus: ['SKU-B'] }).preview(), 'C1  blank base cell', 'SKU-B', '2025-06', 'BASE_MONTH_BLANK');
refused(builder({ model: MODEL, skus: ['SKU-C'] }).preview(), 'C2  no base row at all', 'SKU-C', '2025-06', 'BASE_ROW_MISSING');
refused(builder({ model: MODEL, skus: ['SKU-D'] }).preview(), 'C3  a word in the base cell', 'SKU-D', '2025-06', 'BASE_VALUE_INVALID');
refused(builder({ model: MODEL, skus: ['SKU-E'] }).preview(), 'C4  "1,200" is not silently read as 1', 'SKU-E', '2025-06', 'BASE_VALUE_INVALID');
refused(builder({ model: MODEL, skus: ['SKU-B'], method: 'prevMonth', targetMonth: 0 }).preview(),
  'C5  Previous Month across the year, blank Dec 2025', 'SKU-B', '2025-12', 'BASE_MONTH_BLANK');

section('D  one bad SKU refuses the WHOLE batch, and names only the bad one');
var mixed = builder({ model: MODEL, skus: ['SKU-A', 'SKU-B', 'SKU-Z', 'SKU-C'] }).preview();
refused(mixed, 'D1  mixed batch', 'SKU-B', '2025-06', 'BASE_MONTH_BLANK');
ok(mixed.said().indexOf('SKU-C') !== -1, 'D2  every bad SKU is listed, not just the first');
ok(!/SKU-A[^-]/.test(mixed.help) || mixed.help.indexOf('SKU-A') === -1, 'D3  a good SKU is not reported as bad', mixed.help);
mixed.save();
eq(mixed.writes.length, 0, 'D4  Save after the refusal writes NOTHING');

section('E  a blank base MONTH is not January');
refused(builder({ model: MODEL, baseMonth: '' }).preview(), 'E1  Apply Growth with no Base Month', null, null, 'BASE_PERIOD_MISSING');
refused(builder({ model: MODEL, baseYear: '' }).preview(), 'E2  Apply Growth with no Base Year', null, null, 'BASE_PERIOD_MISSING');

section('F  an incomplete source produces nothing saveable - and the control does');
refused(builder({ model: MODEL_CAPPED }).preview(), 'F1  capped source, Apply Growth', null, null, 'FC_SOURCE_CAPPED');
refused(builder({ model: MODEL_CAPPED, method: 'manual' }).preview(), 'F2  capped source, Manual - a missing target row would be written blank', null, null, 'FC_SOURCE_CAPPED');
refused(builder({ model: MODEL, ready: false }).preview(), 'F3  source not ready', null, null, 'FC_SOURCE_NOT_READY');
eq(newQtys(builder({ model: MODEL }).preview()), [['SKU-A', 110]], 'F4  CONTROL: the same rows, complete and ready, give the same 110');

section('G  methods are a closed list');
var hist = builder({ model: MODEL, method: 'lastYearActual' }).preview();
refused(hist, 'G1  a history method', null, null, 'FC_HISTORY_METHOD_NOT_AVAILABLE');
var unk = builder({ model: MODEL, method: 'growthFromMars' }).preview();
refused(unk, 'G2  an unknown method is refused by name, not run as Manual', null, null, 'FC_METHOD_UNKNOWN');
unk.save(); eq(unk.writes.length, 0, 'G3  and cannot be saved');

section('H  an old preview cannot be used for something else');
var stale = builder({ model: MODEL }).preview();
ok(stale.saveEnabled === true, 'H1  setup: a valid Apply Growth preview');
stale.els['regular-update-method'].value = 'prevMonth'; stale.save();
eq(stale.writes.length, 0, 'H2  method switched under it -> Save writes nothing');
ok(stale.said().indexOf('FC_PREVIEW_METHOD_MISMATCH') !== -1, 'H3  and says why', stale.said().slice(0, 200));
var stale2 = builder({ model: MODEL }).preview();
stale2.els['regular-base-year'].value = '2024'; stale2.save();
eq(stale2.writes.length, 0, 'H4  base period edited after Preview -> Save writes nothing (FC_PREVIEW_STALE)');
var clr = builder({ model: MODEL }).preview();
clr.SKUS = ['SKU-B']; clr.preview();
ok(clr._regularPreview === null && clr.saveEnabled === false, 'H5  a refused rebuild CLEARS the earlier saveable preview');
clr.save(); eq(clr.writes.length, 0, 'H6  so Save has nothing to write');
var forged = builder({ model: MODEL, skus: ['SKU-B'] });
forged._regularPreview = { targetYear: 2026, targetMonth: 5, method: 'actual', baseYear: 2025, baseMonth: 5,
  rows: [{ sku: 'SKU-B', company: 'KM', country: 'US', marketplace: 'Amazon', existing: { jan: 1 }, oldQty: 66, newQty: 0 }] };
forged.saveEnabled = true; forged.save();
eq(forged.writes.length, 0, 'H7  a preview object whose rows carry no proven base is refused by Save itself, not by the button');

section('I  Manual is unchanged: blank skips, an explicit 0 writes 0');
var man = builder({ model: MODEL, method: 'manual' }).preview();
ok(man._regularPreview && man._regularPreview.rows.length === 1 && man._regularPreview.rows[0].newQty === null,
  'I1  Manual builds its editable preview as before');

section('J  END TO END - real adapter, real merge, real builder, real Save');
var e2e = builder({ model: MODEL }).preview().save();
eq(e2e.writes.length, 1, 'J1  the complete chain writes once');
var w = e2e.writes[0] && e2e.writes[0][0];
eq(w && w.jun, 110, 'J2  the target month carries the computed value');
eq(w && [w.jan, w.feb, w.mar, w.apr, w.may, w.jul, w.aug, w.sep, w.oct, w.nov, w.dec], [11, 22, 0, '', 55, 77, 88, 99, 100, 111, 122],
  'J3  every other month is the stored value, including the real 0 and the blank');
var e2eBad = builder({ model: MODEL, skus: ['SKU-B'] }).preview().save();
eq(e2eBad.writes.length, 0, 'J4  the refused chain writes NOTHING - the stored 66 stays 66');

// ===================================================================================================
// MUTANTS — run only from the top-level invocation. Each re-opens one defect in a TEMP copy of the page
// (the repository file is never touched) and re-runs this suite against it; the suite must fail.
var MUTANTS = process.argv[2] ? [] : [
  ['M1  base read from the coerced display field', FCS, "  var cell = (row.raw && typeof row.raw === 'object') ? row.raw[key] : row[key];", "  var cell = row[key];"],
  ['M2  bad bases silently skipped', FCS, "  if (badBases.length) { _regularRefusePreview_(badBases[0].code, badBases); return; }", ''],
  ['M3  capped source not checked', FCS, "  if (cap && cap.fcRegularForecast === true) return { ok: false, code: 'FC_SOURCE_CAPPED' };", ''],
  ['M4  Save trusts the preview method', FCS, "    if (_regularPreview.method !== _selMethod) return 'FC_PREVIEW_METHOD_MISMATCH';", ''],
  ['M5  capped dropped by the adapter', DBA, "    if (data.capped && typeof data.capped === 'object') out.capped = data.capped;", '']
];
if (MUTANTS.length) section('M  mutants');
var os = require('os'), cp = require('child_process');
MUTANTS.forEach(function (mu) {
  var src = mu[1], n = src.split(mu[2]).length - 1;
  if (n !== 1) { ok(false, mu[0] + ' - anchor found ' + n + 'x (vacuous mutant)'); return; }
  var isDba = src === DBA;
  var tmp = path.join(os.tmpdir(), 'km-fc1r2-mutant-' + process.pid + (isDba ? '-dba.js' : '-fcs.js'));
  fs.writeFileSync(tmp, src.replace(mu[2], mu[3]), 'utf8');
  var r = cp.spawnSync(process.execPath, [__filename].concat(isDba
    ? [path.join(REPO, 'assets/js/pages/fc-summary.js'), tmp] : [tmp]), { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (e) {}
  var failed = (String(r.stdout).match(/^FAIL /mg) || []).length + (String(r.stderr).match(/^FAIL /mg) || []).length;
  ok(r.status !== 0 && failed > 0, mu[0] + ' -> caught (' + failed + ' failing assertion lines)');
});

console.log('\n' + (fail ? 'FAIL' : 'PASS') + '  ' + pass + ' passed, ' + fail + ' failed' + (MUTANTS.length ? ', ' + MUTANTS.length + ' mutants' : ''));
if (fail) process.exitCode = 1;
