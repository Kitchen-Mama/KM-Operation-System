// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5-F5-F1
// THE SEAM BETWEEN THREE ROW SHAPES
// Run: node assets/tests/fc-target-rule-canonical-row-shape-seam-r2b-a2-r5-f5-f1.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// WHY THIS SUITE EXISTS, AND WHY THE PREVIOUS ONE DID NOT CATCH THE DEFECT IT WAS WRITTEN FOR.
//
// F5 shipped rehydration with 76 passing assertions and twelve killed mutants, and in production both
// existing Target Rules were still classified NEW and offered twelve 100s. The suite proved the classifier
// correct — against fixtures it injected directly:
//
//     'function _trExistingRules_() { return __RULES__; }'      <- the F5 suite, line 195
//
// _trExistingRules_ IS the defect. Stubbing it replaced the boundary under test with a working one, so the
// tests could not fail for the reason the product did. That is the same mistake as the getEffectiveFcSafe
// census that blanked the FC route in R2-F1: verify the unit, assume the seam.
//
// So this suite stubs NOTHING between the server payload and the classifier. It starts from a
// production-shaped response and runs, in order and unmodified:
//
//     payload  ->  KM.DB.adaptFcSummaryWorkspace   (the REAL adapter, from operation-system-db-api.js)
//              ->  normalizeFcTargetRuleRecord     (the REAL normalizer, called by that adapter)
//              ->  _fcReadModel
//              ->  _fcGetTargetRules / _getDbTargetRules / _trExistingRules_   (the REAL page functions)
//              ->  _trKeyOf_ -> _trClassify_ -> _trSyncSession_ -> _trHydrateFrom_ -> _trGate_
//              ->  _trMergeReceipt_
//
// THE THREE SHAPES, because the whole defect is that they are not interchangeable:
//   canonical   { target_rule_id, scope_type, scope_id, jan_pct..dec_pct }   sheet / server / receipt
//   normalized  { ruleId, scopeType, scopeId, targetPercentage, raw }        the read model
//   display     { id, scope, year, ..., percentages }                        the table
//
// The two rows used as fixtures are the ACTUAL production rows, copied from the canonical read.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

// ------------------------------------------------------------------ extraction ------------------
// String- and comment-aware, because `var X = [...].concat(...)` and a brace inside a string both
// defeat the naive version.
function scanTo(s, from, semicolon) {
  var i = from, depth = 0, opened = false;
  while (i < s.length) {
    var c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; i++;
      while (i < s.length) { if (s[i] === '\\') { i += 2; continue; } if (s[i] === q) { i++; break; } i++; }
      continue;
    }
    if (c === '{' || c === '[' || c === '(') { depth++; opened = true; i++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; i++; if (!semicolon && depth === 0 && opened) return i; continue; }
    if (semicolon && c === ';' && depth === 0) return i + 1;
    i++;
  }
  throw new Error('unterminated from ' + from);
}
function fnSrc(src, name) {
  var m = new RegExp('(?:^|\\n)\\s*function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var start = src.indexOf('function', m.index);
  return src.slice(start, scanTo(src, src.indexOf('{', src.indexOf(')', start)), false));
}
function varSrc(src, name) {
  var m = new RegExp('(?:^|\\n)var\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  var start = src.indexOf('var', m.index);
  return src.slice(start, scanTo(src, src.indexOf('=', start) + 1, true));
}
// `window.KM.DB.NAME = function (...) {...};` — an assignment, not a declaration.
function assignFnSrc(src, dotted) {
  var m = new RegExp('(?:^|\\n)' + dotted.replace(/\./g, '\\.') + '\\s*=\\s*function').exec(src);
  if (!m) throw new Error('assignment not found: ' + dotted);
  var start = src.indexOf(dotted, m.index);
  return src.slice(start, scanTo(src, src.indexOf('{', src.indexOf(')', start)), false)) + ';';
}

// ------------------------------------------------------------------ fixtures --------------------
// The two ACTUAL production rows, verbatim from the canonical read of 2026-09-19.
var ROW_SERIES = {
  target_rule_id: 'fc_target_rules-B56D730F-138', scope: 'SERIES', year: 2026, company: 'ResUS',
  marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: '',
  jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100, may_pct: 100, jun_pct: 100,
  jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 100, nov_pct: 100, dec_pct: 110,
  status: 'active', priority: '', created_by: 'fc-summary', created_at: '2026-09-19T08:41:43.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:44:47.000Z', note: '',
  scope_type: 'SERIES', scope_id: 'CO1100', target_percentage: ''
};
var ROW_SKU = {
  target_rule_id: 'fc_target_rules-0E0E2EFC-9FF', scope: 'SKU', year: 2026, company: 'ResUS',
  marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R',
  jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100, may_pct: 100, jun_pct: 100,
  jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 150, nov_pct: 100, dec_pct: 110,
  status: 'active', priority: '', created_by: 'fc-summary', created_at: '2026-09-19T08:45:49.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:45:49.000Z', note: '',
  scope_type: 'SKU', scope_id: 'CO1100-R', target_percentage: ''
};
// The selection universe. Target Rules are NOT selectable from themselves — every control is built from
// fc_regular_forecast, which is why the modal could offer an identity it had no rule for.
function fcRow(sku, extra) {
  var r = { forecast_id: 'FC-' + sku, year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon',
            sku: sku, category: 'Electric Can Opener', series: 'CO1100',
            jan: 10, feb: 10, mar: 10, apr: 10, may: 10, jun: 10, jul: 10, aug: 10, sep: 10,
            oct: 10, nov: 10, dec: 10, forecast_status: 'active', fc_share: '' };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
var FORECAST = [fcRow('CO1100-R'), fcRow('CO1100-B'), fcRow('CO1200-R', { series: 'CO1200' })];

function payloadWith(rules) {
  return { fcRegularForecast: FORECAST, fcSpecialEvents: [], fcTargetRules: rules,
           marketplaces: [{ marketplace_id: 'MKT-RESUS-US-AMAZON', company: 'ResUS', country: 'US', marketplace: 'Amazon' }] };
}

// ------------------------------------------------------------------ the world ------------------
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function makeDom(controls) {
  var els = {};
  Object.keys(controls).forEach(function (id) {
    var el = { _v: String(controls[id]), placeholder: '', textContent: '', className: '',
               style: {}, disabled: false, firstChild: null,
               removeChild: function () {}, appendChild: function () {} };
    // `.value` is a DOMString in every browser: `el.value = 100` stores "100". A shim that stored the
    // number would let assertions pass or fail for a reason the DOM does not have.
    Object.defineProperty(el, 'value', {
      get: function () { return this._v; },
      set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); },
      enumerable: true
    });
    els[id] = el;
  });
  return { getElementById: function (id) { return els[id] || null; }, _els: els };
}

// The page source, assembled once. `mutate` rewrites the SHIPPED text before evaluation, so a mutant is
// a change to the product, not to a copy of it.
function pageSource(mutate) {
  var src = [
    varSrc(FCS, '_TR_ORDER_'), varSrc(FCS, '_TR_CTL_'), varSrc(FCS, '_TR_LABEL_'),
    varSrc(FCS, '_TR_SCOPES_'), varSrc(FCS, '_TR_SCOPE_FIELDS_'),
    varSrc(FCS, '_TR_FP_MONTHS_'), varSrc(FCS, '_TR_FP_FIELDS_'), varSrc(FCS, '_TR_FP_NUMERIC_'),
    varSrc(FCS, '_FC_MONTH_KEYS'), varSrc(FCS, '_trSession_'), varSrc(FCS, '_TR_UNAVAILABLE_'),
    fnSrc(FCS, '_trNorm_'), fnSrc(FCS, '_trCanonScope_'), fnSrc(FCS, '_trSel_'),
    fnSrc(FCS, '_trActiveDims_'), fnSrc(FCS, '_trDistinct_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'), fnSrc(FCS, '_trFingerprint_'),
    fnSrc(FCS, '_trKeyOf_'), fnSrc(FCS, '_trSelKey_'),
    fnSrc(FCS, '_trCommonMonthlyPct_'), fnSrc(FCS, '_trMonths_'),
    fnSrc(FCS, '_trSetApplyAll_'), fnSrc(FCS, '_trHydrateFrom_'),
    fnSrc(FCS, '_trResetToNew_'), fnSrc(FCS, '_trBlankMonths_'),
    fnSrc(FCS, '_trProposedFingerprint_'),
    fnSrc(FCS, '_trRows_'), fnSrc(FCS, '_trRowsFor_'), fnSrc(FCS, '_trDataState_'),
    fnSrc(FCS, '_trCompanyResolution_'),
    fnSrc(FCS, '_trExistingRules_'), fnSrc(FCS, '_trClassify_'), fnSrc(FCS, '_trSyncSession_'),
    fnSrc(FCS, '_trStatusIdentity_'), varSrc(FCS, '_TR_STATUS_SCOPE_LABEL_'),
    fnSrc(FCS, '_trRenderStatus_'), fnSrc(FCS, '_trGate_'), fnSrc(FCS, '_trBuildPayload_'),
    fnSrc(FCS, '_trNormalizeCanonical_'), fnSrc(FCS, '_trMergeReceipt_'),
    fnSrc(FCS, '_fcGetTargetRules'), fnSrc(FCS, '_fcGetRegularForecast'),
    fnSrc(FCS, '_getDbTargetRules'), fnSrc(FCS, '_getDbFcRegularData'),
    fnSrc(FCS, '_fcUseDb')
  ].join('\n');
  return mutate ? mutate(src) : src;
}

// One world = one server payload carried all the way to the modal, through the real adapter.
function world(rules, sel, months, mutate) {
  var controls = {
    'target-year-input': sel.year === undefined ? '2026' : sel.year,
    'target-country-input': sel.country === undefined ? 'US' : sel.country,
    'target-marketplace-input': sel.marketplace === undefined ? 'Amazon' : sel.marketplace,
    'target-scope-input': sel.scope === undefined ? 'SERIES' : sel.scope,
    'target-category-input': sel.category === undefined ? 'Electric Can Opener' : sel.category,
    'target-series-input': sel.series === undefined ? 'CO1100' : sel.series,
    'target-sku-input': sel.sku === undefined ? '' : sel.sku,
    'target-base-pct-input': '',
    'target-mode-note': '', 'target-scope-note': '', 'target-load-latest-btn': ''
  };
  MONTHS.forEach(function (m) { controls['target-' + m] = (months && months[m] !== undefined) ? months[m] : 100; });
  var dom = makeDom(controls);

  // The REAL adapter and the REAL normalizer, lifted from the shipped API file and run here.
  var win = { KM: { DB: {} } };
  var ctx = vm.createContext({ document: dom, console: console, window: win });
  vm.runInContext([
    fnSrc(API, 'normalizeFcTargetRuleRecord'),
    fnSrc(API, 'normalizeFcRegularForecastRecord'),
    fnSrc(API, 'normalizeFcSpecialEventRecord'),
    fnSrc(API, 'normalizeMarketplaceRecord'),
    'window.KM = window.KM || {}; window.KM.DB = window.KM.DB || {};',
    assignFnSrc(API, 'window.KM.DB.adaptFcSummaryWorkspace')
  ].join('\n'), ctx);

  ctx.__PAYLOAD__ = payloadWith(rules);
  vm.runInContext('var _fcReadModel = window.KM.DB.adaptFcSummaryWorkspace(__PAYLOAD__);', ctx);
  vm.runInContext(pageSource(mutate), ctx);
  // Display-only helpers the gate touches; neither participates in identity.
  vm.runInContext('function _fcMarketplaceLabel(m) { return String(m); }', ctx);
  return { ctx: ctx, dom: dom, win: win };
}
function run(w, expr) { return vm.runInContext(expr, w.ctx); }
function monthsOnScreen(w) {
  var o = {}; MONTHS.forEach(function (m) { o[m] = w.dom._els['target-' + m].value; }); return o;
}
var SEL_SERIES = { scope: 'SERIES', series: 'CO1100', sku: '' };
var SEL_SKU = { scope: 'SKU', series: 'CO1100', sku: 'CO1100-R' };

// ================================================================================================
section('A. THE CHAIN IS REAL — no stub between the payload and the classifier');
// ================================================================================================
var wA = world([ROW_SERIES, ROW_SKU], SEL_SERIES);

eq(run(wA, '_fcReadModel.fcTargetRules.length'), 2, 'A1  the real adapter carries both rules into the read model');
eq(run(wA, 'Object.keys(_fcReadModel.fcTargetRules[0]).sort()'),
  ['company', 'country', 'marketplace', 'raw', 'ruleId', 'scopeId', 'scopeType', 'targetPercentage'],
  'A2  and the read model holds the NORMALIZED shape, .raw included');
eq(run(wA, '_fcReadModel.fcTargetRules[0].scope_type'), undefined,
  'A2a  a normalized record has no scope_type — the field the key builder reads');
eq(run(wA, '_getDbTargetRules().length'), 2, 'A3  the TABLE mapper still produces two display rows');
eq(run(wA, '_getDbTargetRules()[0].scope_type'), undefined,
  'A3a  and a display row has no scope_type either — which is what broke classification');
eq(run(wA, '_getDbTargetRules()[0].jan_pct'), undefined, 'A3b  nor jan_pct: its months live under .percentages');

var canonKeys = run(wA, '_trExistingRules_().map(function (r) { return r.target_rule_id; })');
eq(canonKeys, ['fc_target_rules-B56D730F-138', 'fc_target_rules-0E0E2EFC-9FF'],
  'A4  _trExistingRules_ hands the classifier CANONICAL rows');
eq(run(wA, '_trExistingRules_().map(_trKeyOf_)'),
  ['2026|RESUS|US|AMAZON|SERIES|CO1100', '2026|RESUS|US|AMAZON|SKU|CO1100-R'],
  'A5  so each row keys to its own identity, not to a shared blank-scope key');
ok(run(wA, '_trExistingRules_()[0] === _fcReadModel.fcTargetRules[0].raw'),
  'A5a  and those ARE the read model\'s own raw rows — not a copy that could drift');
// The regression this suite exists for, stated as the thing that must never come back.
ok(run(wA, '_trExistingRules_().every(function (r) { return r.scope_type !== undefined; })'),
  'A6  every row reaching the classifier carries scope_type');
ok(run(wA, '_trExistingRules_().every(function (r) { return r.jan_pct !== undefined; })'),
  'A6a and jan_pct, so hydration can read it by name');

// ================================================================================================
section('B. SERIES — the existing identity the operator actually selected');
// ================================================================================================
var wB = world([ROW_SERIES, ROW_SKU], SEL_SERIES);
var clsB = run(wB, '_trSyncSession_()');
eq(clsB.key, '2026|RESUS|US|AMAZON|SERIES|CO1100', 'B1  the selection resolves to the exact canonical key');
eq(clsB.mode, 'EXISTING_UPDATE', 'B2  mode = EXISTING_UPDATE');
eq(run(wB, '_trSession_.id'), 'fc_target_rules-B56D730F-138', 'B3  bound to the SERIES rule id');
eq(monthsOnScreen(wB),
  { jan: '110', feb: '105', mar: '100', apr: '100', may: '100', jun: '100',
    jul: '100', aug: '100', sep: '100', oct: '100', nov: '100', dec: '110' },
  'B4  the STORED months are on screen — Jan 110, Feb 105, Dec 110');
eq(wB.dom._els['target-base-pct-input'].value, '', 'B5  apply-to-all is blank for a mixed rule');
eq(wB.dom._els['target-base-pct-input'].placeholder, 'mixed', 'B5a and says so');
eq(run(wB, '_trGate_().code'), 'UNCHANGED', 'B6  nothing has changed, so Save is refused');
eq(run(wB, '_trGate_().ok'), false, 'B6a Save disabled');

// ================================================================================================
section('C. SKU — the narrower identity, and October 150');
// ================================================================================================
var wC = world([ROW_SERIES, ROW_SKU], SEL_SKU);
var clsC = run(wC, '_trSyncSession_()');
eq(clsC.key, '2026|RESUS|US|AMAZON|SKU|CO1100-R', 'C1  the SKU selection resolves to its own key');
eq(clsC.mode, 'EXISTING_UPDATE', 'C2  mode = EXISTING_UPDATE');
eq(run(wC, '_trSession_.id'), 'fc_target_rules-0E0E2EFC-9FF', 'C3  bound to the SKU rule id');
eq(monthsOnScreen(wC).oct, '150', 'C4  October is 150 — the value that distinguishes this rule');
eq(monthsOnScreen(wC),
  { jan: '110', feb: '105', mar: '100', apr: '100', may: '100', jun: '100',
    jul: '100', aug: '100', sep: '100', oct: '150', nov: '100', dec: '110' },
  'C4a and every other month is its stored value');
eq(run(wC, '_trGate_().ok'), false, 'C5  unchanged, so Save is disabled');
// The SERIES rule shares year/company/country/marketplace. Only scope decides, and it must.
ok(clsC.key !== clsB.key, 'C6  SERIES and SKU are different identities despite a shared site');

// ================================================================================================
section('D. DIRTY TRACKING — the edit, and the change of mind');
// ================================================================================================
var wD = world([ROW_SERIES, ROW_SKU], SEL_SKU);
run(wD, '_trSyncSession_()');
eq(run(wD, '_trGate_().ok'), false, 'D1  clean on open');
wD.dom._els['target-oct'].value = 160;
eq(run(wD, '_trGate_().ok'), true, 'D2  changing October enables Save');
eq(run(wD, '_trGate_().mode'), 'EXISTING_UPDATE', 'D2a still an update, not a create');
wD.dom._els['target-oct'].value = 150;
eq(run(wD, '_trGate_().code'), 'UNCHANGED', 'D3  putting it back disables Save again');
// The string/number equivalence that makes "unchanged" mean unchanged.
wD.dom._els['target-jan'].value = '110';
eq(run(wD, '_trGate_().code'), 'UNCHANGED', 'D4  the string "110" equals the stored number 110');
wD.dom._els['target-jan'].value = '110.0';
eq(run(wD, '_trGate_().code'), 'UNCHANGED', 'D4a and so does "110.0"');

// ================================================================================================
section('E. NEW — only when the canonical key matches nothing');
// ================================================================================================
var wE = world([ROW_SERIES, ROW_SKU], { scope: 'SKU', series: 'CO1100', sku: 'CO1100-B' });
var clsE = run(wE, '_trSyncSession_()');
eq(clsE.mode, 'NEW', 'E1  an identity with no rule is NEW');
eq(clsE.key, '2026|RESUS|US|AMAZON|SKU|CO1100-B', 'E1a keyed on its own identity');
eq(monthsOnScreen(wE).jan, '100', 'E2  and NEW is where the documented 100 defaults belong');
eq(run(wE, '_trSession_.id'), '', 'E3  no target_rule_id');
eq(run(wE, '_trSession_.version'), '', 'E3a no expected_row_version');
var gE = run(wE, '_trGate_()');
eq(gE.ok, true, 'E4  a complete new identity may be saved');
eq(gE.target_rule_id, undefined, 'E4a and the payload gate carries no id');
var payE = run(wE, '_trBuildPayload_(_trGate_())');
eq(payE.target_rule_id, undefined, 'E5  the built payload carries no id');
eq(payE.expected_row_version, undefined, 'E5a and no version — a create is not an update');
// zero rules is a legitimate answer, and it is NEW, not unavailable
var wE0 = world([], SEL_SERIES);
eq(run(wE0, '_trClassify_(_trSel_(), "ResUS").mode'), 'NEW', 'E6  an empty rule table is NEW, not DATA_UNAVAILABLE');

// ================================================================================================
section('F. DUPLICATE — two rows, one identity, nothing written');
// ================================================================================================
var DUP = JSON.parse(JSON.stringify(ROW_SERIES));
DUP.target_rule_id = 'fc_target_rules-DUPLICATE-001';
var wF = world([ROW_SERIES, DUP, ROW_SKU], SEL_SERIES);
var clsF = run(wF, '_trSyncSession_()');
eq(clsF.mode, 'DUPLICATE_REFUSAL', 'F1  two rules on one identity refuse');
eq(clsF.matches.length, 2, 'F1a both are reported, not silently reduced to one');
var gF = run(wF, '_trGate_()');
eq(gF.ok, false, 'F2  Save disabled');
eq(gF.code, 'DUPLICATE_TARGET_RULE_IDENTITY', 'F2a with the typed refusal');
ok(gF.text.indexOf('fc_target_rules-B56D730F-138') !== -1
  && gF.text.indexOf('fc_target_rules-DUPLICATE-001') !== -1, 'F3  and BOTH ids are shown');
eq(run(wF, '_trSession_.id'), '', 'F4  no rule is bound — the form is not editing either one');

// ================================================================================================
section('G. UNREADABLE IS NOT EMPTY — the state that must never become NEW');
// ================================================================================================
// A normalized record whose .raw did not survive. The canonical identity cannot be derived from it,
// so the rule set cannot be compared — and an identity that cannot be compared is not "new".
var wG = world([ROW_SERIES, ROW_SKU], SEL_SERIES);
run(wG, 'delete _fcReadModel.fcTargetRules[0].raw;');
var clsG = run(wG, '_trClassify_(_trSel_(), "ResUS")');
eq(clsG.mode, 'DATA_UNAVAILABLE', 'G1  a row with no canonical record makes the whole read unavailable');
ok(clsG.mode !== 'NEW', 'G1a and specifically NOT new');
var gG = run(wG, '_trGate_()');
eq(gG.ok, false, 'G2  Save disabled');
eq(gG.code, 'TARGET_RULE_DATA_UNAVAILABLE', 'G2a with its own typed refusal');
var wG2 = world([ROW_SERIES, ROW_SKU], SEL_SERIES);
run(wG2, 'delete _fcReadModel.fcTargetRules[0].raw; _trSyncSession_();');
eq(monthsOnScreen(wG2).jan, '', 'G3  the months are BLANK, not the 100 defaults a NEW rule would show');
eq(wG2.dom._els['target-base-pct-input'].placeholder, '', 'G3a and apply-to-all claims nothing');
// the whole model missing is the same verdict
var wG3 = world([ROW_SERIES], SEL_SERIES);
run(wG3, '_fcReadModel.fcTargetRules = null;');
eq(run(wG3, '_trClassify_(_trSel_(), "ResUS").mode'), 'DATA_UNAVAILABLE', 'G4  a missing array is unavailable too');
// Demo mode keeps its own contract: its mock rows carry a `percentages` object rather than
// jan_pct..dec_pct, so fingerprinting them against canonical rows would call every rule stale.
// Driven through _fcUseDb — the page's own live-or-demo switch, and the only thing
// _trExistingRules_ consults. That is a different question from the seam under test, proven in its
// own suite; the seam itself stays real here, which is the whole point of this file.
var wG4 = world([ROW_SERIES], SEL_SERIES);
run(wG4, 'function _fcUseDb() { return false; }');
eq(run(wG4, '_trExistingRules_()'), null, 'G5  Demo mode returns null — matching not applicable');
eq(run(wG4, '_trClassify_(_trSel_(), "ResUS").mode'), 'NEW', 'G5a and Demo still classifies as NEW, unchanged');

// ================================================================================================
section('H. RECEIPT MERGE — two rows must stay two rows');
// ================================================================================================
var wH = world([ROW_SERIES, ROW_SKU], SEL_SERIES);
eq(run(wH, '_fcReadModel.fcTargetRules.length'), 2, 'H1  the model starts with two rows');
var RECEIPT = JSON.parse(JSON.stringify(ROW_SERIES));
RECEIPT.dec_pct = 115;
wH.ctx.__RECEIPT__ = RECEIPT;
eq(run(wH, '_trMergeReceipt_(__RECEIPT__)'), true, 'H2  the confirmed row merges');
eq(run(wH, '_fcReadModel.fcTargetRules.length'), 2, 'H3  and the model still has TWO rows, not three');
eq(run(wH, '_fcReadModel.fcTargetRules.map(function (r) { return r.ruleId; })'),
  ['fc_target_rules-B56D730F-138', 'fc_target_rules-0E0E2EFC-9FF'],
  'H3a the same two ids, in place');
eq(run(wH, '_fcReadModel.fcTargetRules[0].raw.dec_pct'), 115, 'H4  carrying the new December');
eq(run(wH, '_getDbTargetRules()[0].percentages.dec'), 115, 'H5  which the table renders immediately');
eq(run(wH, '_getDbTargetRules().length'), 2, 'H5a with no phantom third row');
ok(run(wH, '_getDbTargetRules().every(function (r) { return r.id !== ""; })'), 'H6  and no blank-id row');
eq(run(wH, '_getDbTargetRules()[0].scope'), 'SERIES', 'H7  the merged row still renders its scope');
// and the merged row is still rehydratable — the property a canonical-shaped merge would have lost
var clsH = run(wH, '_trSession_.key = ""; _trSyncSession_()');
eq(clsH.mode, 'EXISTING_UPDATE', 'H8  the merged row still classifies as the existing rule');
eq(monthsOnScreen(wH).dec, '115', 'H8a and rehydrates the value that was just saved');

// ================================================================================================
section('I. A GENUINELY NEW RECEIPT MAY APPEND — exactly one row');
// ================================================================================================
var wI = world([ROW_SERIES, ROW_SKU], SEL_SERIES);
var NEWRECEIPT = JSON.parse(JSON.stringify(ROW_SKU));
NEWRECEIPT.target_rule_id = 'fc_target_rules-NEW-0001';
NEWRECEIPT.scope_id = 'CO1100-B'; NEWRECEIPT.sku = 'CO1100-B'; NEWRECEIPT.oct_pct = 120;
wI.ctx.__NEW__ = NEWRECEIPT;
eq(run(wI, '_trMergeReceipt_(__NEW__)'), true, 'I1  a new id merges');
eq(run(wI, '_fcReadModel.fcTargetRules.length'), 3, 'I2  appending exactly one row');
eq(run(wI, '_fcReadModel.fcTargetRules[2].ruleId'), 'fc_target_rules-NEW-0001', 'I2a with its id');
ok(run(wI, '!!_fcReadModel.fcTargetRules[2].raw'), 'I3  and its canonical row preserved');
eq(run(wI, '_getDbTargetRules().length'), 3, 'I4  the table renders three');
eq(run(wI, '_getDbTargetRules()[2].percentages.oct'), 120, 'I4a with the saved October');
var wI2 = world([ROW_SERIES], SEL_SERIES);
wI2.ctx.__BLANK__ = (function () { var r = JSON.parse(JSON.stringify(ROW_SKU)); r.target_rule_id = ''; return r; })();
eq(run(wI2, '_trMergeReceipt_(__BLANK__)'), false, 'I5  a blank-id receipt is refused');
eq(run(wI2, '_fcReadModel.fcTargetRules.length'), 1, 'I5a and the model is untouched');

// ================================================================================================
section('J. THE STALE-WRITE CONTRACT STILL HOLDS, AND IS BUILT FROM THE CANONICAL ROW');
// ================================================================================================
var wJ = world([ROW_SERIES, ROW_SKU], SEL_SKU);
run(wJ, '_trSyncSession_()');
wJ.dom._els['target-oct'].value = 160;
var gJ = run(wJ, '_trGate_()');
var payJ = run(wJ, '__G__ = ' + JSON.stringify({}) + '; _trBuildPayload_(_trGate_())');
eq(payJ.target_rule_id, 'fc_target_rules-0E0E2EFC-9FF', 'J1  an update names the row it updates');
ok(!!payJ.expected_row_version, 'J2  and carries a version token');
eq(payJ.expected_row_version, run(wJ, '_trFingerprint_(_trExistingRules_()[1])'),
  'J3  the token is the fingerprint of the CANONICAL row, not of a display row');
ok(payJ.expected_row_version.indexOf('SKU|CO1100-R') !== -1,
  'J3a which is visible in the token itself — a display row would have left scope blank');
ok(payJ.expected_row_version.indexOf('2026-09-19') === -1,
  'J4  and updated_at is NOT the version — second precision cannot order two saves');
eq(gJ.expected_row_version, run(wJ, '_trSession_.version'), 'J5  the gate sends the version the session opened with');
eq(payJ.oct_pct, 160, 'J6  the edit is in the payload');

// ================================================================================================
section('K. THE PAGE STILL EVALUATES, AND THE ROUTE STILL REGISTERS');
// ================================================================================================
// R2-F1 blanked FC Summary because a top-level ReferenceError aborted the script AFTER the functions
// above it existed and BEFORE the registration below it ran. Extracted functions cannot show that;
// only evaluating the whole file can. The all-routes assertion lives in
// route-mount-registration-boot-fc-r2-f1.test.js, which loads every script in index.html order.
var registered = [];
var kShim = {
  KM: { lifecycle: { register: function (n) { registered.push(n); } }, DB: {}, ui: {} },
  document: { getElementById: function () { return null; }, querySelector: function () { return null; },
              querySelectorAll: function () { return []; }, addEventListener: function () {},
              createElement: function () { return { style: {}, classList: { add: function () {} },
                                                    appendChild: function () {}, setAttribute: function () {} }; } },
  console: console, setTimeout: function () {}, clearTimeout: function () {},
  location: { href: '', hash: '' }, navigator: { userAgent: 'node' }
};
kShim.window = kShim;
var kCtx = vm.createContext(kShim);
var evaluated = true, evalErr = null;
try { vm.runInContext(FCS, kCtx, { filename: 'fc-summary.js' }); }
catch (e) { evaluated = false; evalErr = e && e.message; }
ok(evaluated, 'K1  fc-summary.js evaluates top to bottom with no top-level throw', evalErr);
ok(registered.indexOf('fc-summary-section') !== -1,
  'K2  and execution reaches KM.lifecycle.register(\'fc-summary-section\')', registered);
ok(!/[^.\w]getEffectiveFcSafe\b/.test(FCS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')),
  'K3  no live reference to the removed getEffectiveFcSafe remains');

// ================================================================================================
section('L. MUTANTS — every one of these was, or would have been, the shipped bug');
// ================================================================================================
var mutants = 0, survived = 0;
function mutant(label, mutate, probe) {
  mutants++;
  var caught = false, why = '';
  try {
    var w = world([ROW_SERIES, ROW_SKU], SEL_SERIES, null, mutate);
    caught = !probe(w);
  } catch (e) { caught = true; why = ' (threw: ' + e.message + ')'; }
  if (caught) console.log('  caught: ' + label + why);
  else { survived++; fail++; console.error('SURVIVED: ' + label); }
}
// A mutation that does not change the source cannot prove anything; assert each one bites.
function bites(mutate, label) {
  var before = pageSource(), after = pageSource(mutate);
  ok(before !== after, 'L0  the mutation for "' + label + '" actually changes the shipped source');
}

var M = [
  ['M1  _trExistingRules_ hands back display rows again',
   function (s) { return s.replace('var rows = (typeof _fcGetTargetRules === \'function\') ? _fcGetTargetRules() : null;',
                                   'var rows = (typeof _getDbTargetRules === \'function\') ? _getDbTargetRules() : null;'); }],
  ['M2  the .raw mapping is dropped',
   function (s) { return s.replace('out.push(raw);', 'out.push(rows[i]);'); }],
  ['M3  a missing canonical record becomes an empty list',
   function (s) { return s.replace(/if \(!raw \|\| typeof raw !== 'object'\) return _TR_UNAVAILABLE_;/,
                                   'if (!raw || typeof raw !== \'object\') continue;'); }],
  ['M4  DATA_UNAVAILABLE is answered as NEW',
   function (s) { return s.replace("if (rules === _TR_UNAVAILABLE_) return { mode: 'DATA_UNAVAILABLE', key: key, matches: [] };",
                                   "if (rules === _TR_UNAVAILABLE_) return { mode: 'NEW', key: key, matches: [] };"); }],
  ['M5  the receipt merge compares canonical target_rule_id against normalized rows',
   function (s) { return s.replace('if (list[i] && _trStrTok_(list[i].ruleId) === id)',
                                   'if (list[i] && _trStrTok_(list[i].target_rule_id) === id)'); }],
  ['M6  the receipt is appended instead of replacing',
   function (s) { return s.replace('{ list[i] = rec; return true; }', '{ list.push(rec); return true; }'); }],
  ['M7  the receipt is stored without normalization',
   function (s) { return s.replace('var rec = _trNormalizeCanonical_(row);', 'var rec = row;'); }],
  // Either guard alone is a no-op: they refuse the same thing on two sides of normalization.
  ['M8  BOTH blank-id refusals are removed',
   function (s) {
     return s.replace('if (!row || !_trStrTok_(row.target_rule_id)) return false;', 'if (!row) return false;')
             .replace('if (!id) return false;                       // never a blank-id row in the model', '');
   }],
  ['M9  hydration reads the display percentages instead of canonical month names',
   function (s) { return s.replace("var v = row[m + '_pct'];", 'var v = row.percentages ? row.percentages[m] : undefined;'); }],
  ['M10 an existing match is reset to the 100 defaults',
   function (s) { return s.replace('    _trHydrateFrom_(row);', '    _trResetToNew_();'); }],
  ['M11 a duplicate identity silently picks the first row',
   function (s) { return s.replace("return { mode: 'DUPLICATE_REFUSAL', key: key, matches: matches };",
                                   "return { mode: 'EXISTING_UPDATE', key: key, matches: matches, row: matches[0] };"); }],
  ['M12 the fingerprint is computed from a display row',
   function (s) { return s.replace('function _trProposedFingerprint_(row, monthValues) {',
                                   'function _trProposedFingerprint_(row, monthValues) { row = _getDbTargetRules()[0];'); }]
];
M.forEach(function (m) { bites(m[1], m[0]); });

// M1, M2: the classifier must still find the SERIES rule.
mutant(M[0][0], M[0][1], function (w) { return run(w, '_trSyncSession_().mode') === 'EXISTING_UPDATE'; });
mutant(M[1][0], M[1][1], function (w) { return run(w, '_trSyncSession_().mode') === 'EXISTING_UPDATE'; });
// M3, M4: a broken read must refuse, not offer a new-rule form.
mutant(M[2][0], M[2][1], function (w) {
  run(w, 'delete _fcReadModel.fcTargetRules[0].raw;');
  return run(w, '_trClassify_(_trSel_(), "ResUS").mode') === 'DATA_UNAVAILABLE';
});
mutant(M[3][0], M[3][1], function (w) {
  run(w, 'delete _fcReadModel.fcTargetRules[0].raw;');
  return run(w, '_trClassify_(_trSel_(), "ResUS").mode') === 'DATA_UNAVAILABLE';
});
// M5, M6, M7, M8: the model must stay two consistent normalized rows.
function mergeProbe(w) {
  var r = JSON.parse(JSON.stringify(ROW_SERIES)); r.dec_pct = 115;
  w.ctx.__R__ = r; run(w, '_trMergeReceipt_(__R__)');
  return run(w, '_fcReadModel.fcTargetRules.length') === 2
      && run(w, '_getDbTargetRules().length') === 2
      && run(w, '_getDbTargetRules()[0].percentages.dec') === 115
      && run(w, '_getDbTargetRules().every(function (x) { return x.id !== ""; })');
}
mutant(M[4][0], M[4][1], mergeProbe);
mutant(M[5][0], M[5][1], mergeProbe);
mutant(M[6][0], M[6][1], mergeProbe);
mutant(M[7][0], M[7][1], function (w) {
  var r = JSON.parse(JSON.stringify(ROW_SERIES)); r.target_rule_id = '';
  w.ctx.__R__ = r;
  return run(w, '_trMergeReceipt_(__R__)') === false
      && run(w, '_fcReadModel.fcTargetRules.length') === 2
      && run(w, '_getDbTargetRules().every(function (x) { return x.id !== ""; })');
});
// And the standing fact the mutant above rests on: each guard alone is redundant, which is why
// only removing both changes behaviour. Asserted so a later reader does not "simplify" one away
// believing the other is decorative — they are belt and braces across a normalization boundary.
(function () {
  var only1 = function (s) { return s.replace('if (!row || !_trStrTok_(row.target_rule_id)) return false;', 'if (!row) return false;'); };
  var w1 = world([ROW_SERIES, ROW_SKU], SEL_SERIES, null, only1);
  var r1 = JSON.parse(JSON.stringify(ROW_SERIES)); r1.target_rule_id = '';
  w1.ctx.__R__ = r1;
  eq(run(w1, '_trMergeReceipt_(__R__)'), false, 'L1  dropping the canonical guard alone still refuses a blank id');
  eq(run(w1, '_fcReadModel.fcTargetRules.length'), 2, 'L1a the normalized guard holds the line on its own');
})();
// M9, M10: the stored months must reach the screen.
mutant(M[8][0], M[8][1], function (w) { run(w, '_trSyncSession_()'); return monthsOnScreen(w).jan === '110'; });
mutant(M[9][0], M[9][1], function (w) { run(w, '_trSyncSession_()'); return monthsOnScreen(w).jan === '110'; });
// M11: a duplicate must refuse.
mutants++;
(function () {
  var caught = false;
  try {
    var w = world([ROW_SERIES, DUP, ROW_SKU], SEL_SERIES, null, M[10][1]);
    caught = run(w, '_trGate_().code') === 'DUPLICATE_TARGET_RULE_IDENTITY' ? false : true;
  } catch (e) { caught = true; }
  if (caught) console.log('  caught: ' + M[10][0]);
  else { survived++; fail++; console.error('SURVIVED: ' + M[10][0]); }
})();
// M12: the version token must describe the canonical row.
mutant(M[11][0], M[11][1], function (w) {
  run(w, '_trSyncSession_()');
  return run(w, '_trSession_.version') === run(w, '_trProposedFingerprint_(_trSession_.row, _trMonths_().values)');
});

// ================================================================================================
section('M. VACUITY — the suite can fail');
// ================================================================================================
// Every case above rests on the fixtures being what this file says they are. If the rows were not the
// production rows, or the world were not built from the real adapter, the assertions would still pass
// against whatever they did describe. These make that impossible to do silently.
eq(ROW_SERIES.dec_pct, 110, 'V1  the SERIES fixture really carries the December value asserted in B4');
eq(ROW_SKU.oct_pct, 150, 'V2  the SKU fixture really carries the October value asserted in C4');
ok(ROW_SERIES.scope_type === 'SERIES' && ROW_SKU.scope_type === 'SKU', 'V3  and their real scope types');
ok(FCS.indexOf('function _trExistingRules_') !== -1, 'V4  the function under test exists in the shipped page');
ok(API.indexOf('window.KM.DB.adaptFcSummaryWorkspace') !== -1, 'V5  the real adapter exists in the shipped API');
ok(pageSource().indexOf('_TR_UNAVAILABLE_') !== -1, 'V6  the unavailable sentinel is in the extracted source');
// And the negative control: a world whose read model is emptied must NOT report EXISTING_UPDATE.
var wV = world([], SEL_SERIES);
ok(run(wV, '_trSyncSession_().mode') !== 'EXISTING_UPDATE', 'V7  with no rules, nothing classifies as existing');

// ================================================================================================
console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived, vacuity clean');
console.log(new Array(101).join('='));
process.exit(fail === 0 ? 0 : 1);
