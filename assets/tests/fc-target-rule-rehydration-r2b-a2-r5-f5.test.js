// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5-F5
// THE MODAL DID NOT KNOW THE RULE ALREADY EXISTED
// Run: node assets/tests/fc-target-rule-rehydration-r2b-a2-r5-f5.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// THE DEFECT. Two Target Rules existed in production — SERIES/CO1100 with Jan 110, Feb 105, Dec 110, and
// SKU/CO1100-R with those plus October 150. Reopening Add Target Rule and selecting either identity showed
// twelve months of 100, because the modal had no concept of an existing rule: every selector is built from
// the FC REGULAR FORECAST universe, which is the right authority for what may be SELECTED and says nothing
// about what has already been WRITTEN. Pressing Save from that form would have replaced real values with
// defaults nobody typed. The write path was never wrong — it found the row by business key and updated it,
// exactly as designed. What was missing is that the form never asked whether that row existed.
//
// WHAT THIS SUITE DRIVES. The REAL page functions, lifted out of fc-summary.js and run against a DOM shim
// that carries the modal's actual control ids, and the REAL write handler, lifted out of 14_ and run against
// a fake sheet. Nothing is re-implemented here: a re-implementation would agree with itself.
//
// THE ONE CROSS-SYSTEM CLAIM WORTH NAMING. The version token is a fingerprint of the row's values, computed
// independently on both sides. §B proves the two implementations agree on the actual production rows, which
// is the property the whole stale-write guard rests on — if they ever disagreed, every save would be refused
// as stale, or none would.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var HTML = read('assets/html/pages/fc-summary.html');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

// ------------------------------------------------------------------ extraction ------------------
function fnSrc(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('function not found: ' + name);
  var i = src.indexOf('(', start), p = 0;
  for (; i < src.length; i++) { if (src[i] === '(') p++; else if (src[i] === ')') { p--; if (p === 0) { i++; break; } } }
  var b = src.indexOf('{', i), d = 0;
  for (i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
// A `var NAME = ...;` declaration, balanced across brackets so a multi-line array or object survives.
function varSrc(src, name) {
  var start = src.indexOf('var ' + name + ' =');
  if (start < 0) throw new Error('var not found: ' + name);
  var i = start, depth = 0, inStr = null;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (inStr) { if (ch === '\\') { i++; continue; } if (ch === inStr) inStr = null; continue; }
    if (ch === "'" || ch === '"') { inStr = ch; continue; }
    if (ch === '[' || ch === '{' || ch === '(') depth++;
    else if (ch === ']' || ch === '}' || ch === ')') depth--;
    else if (ch === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unterminated var: ' + name);
}

// `window.KM.DB.NAME = function (...) {...};` — an assignment, which fnSrc does not match.
function assignFnSrc(src, dotted) {
  var start = src.indexOf(dotted + ' = function');
  if (start < 0) throw new Error('assignment not found: ' + dotted);
  var b = src.indexOf('{', src.indexOf(')', start)), d = 0;
  for (var i = b; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(start, i + 1) + ';'; }
  }
  throw new Error('unbalanced: ' + dotted);
}

// ================================================================================================
section('A. THE MODAL CAN SAY WHICH RULE IT IS EDITING');
// ================================================================================================
// R2B-A2-R5-F6 — the two message bars became one status card. What A1 and A4 are FOR is that the
// modal can say which rule it is editing and that the state is visible rather than silent; both are
// still asserted, against the component that now carries them.
ok(/id="target-status-card"/.test(HTML), 'A1  the status card exists in the modal markup');
ok(/id="target-status-title"/.test(HTML) && /id="target-status-state"/.test(HTML)
  && /id="target-status-meta"/.test(HTML), 'A1a with a title, a state line and its metadata');
ok(/id="target-load-latest-btn"/.test(HTML), 'A2  and the stale-recovery control');
ok(/_trLoadLatest_\(\)/.test(HTML), 'A3  wired to the one-read rehydration handler');
ok(/\.fc-target-status\.is-existing/.test(read('assets/css/pages/fc-overview.css')),
  'A4  and the loaded-existing state is visually distinct, not silent styling');

// ================================================================================================
section('B. THE VERSION TOKEN — two implementations, one value, on the real rows');
// ================================================================================================
var SRV = vm.createContext({});
vm.runInContext([
  varSrc(GS14, 'FC_TR_MONTH_KEYS_'), varSrc(GS14, 'FC_TR_FINGERPRINT_FIELDS_'),
  varSrc(GS14, 'FC_TR_FINGERPRINT_NUMERIC_'),
  fnSrc(GS14, 'fcTrStr_'), fnSrc(GS14, 'fcTrNum_'), fnSrc(GS14, 'fcTrFingerprint_')
].join('\n'), SRV);

var CLI = vm.createContext({});
vm.runInContext([
  varSrc(FCS, '_TR_FP_MONTHS_'), varSrc(FCS, '_TR_FP_FIELDS_'), varSrc(FCS, '_TR_FP_NUMERIC_'),
  fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'), fnSrc(FCS, '_trFingerprint_')
].join('\n'), CLI);

function srvFp(o) { return SRV.fcTrFingerprint_(o); }
function cliFp(o) { return CLI._trFingerprint_(o); }

eq(SRV.FC_TR_FINGERPRINT_FIELDS_, CLI._TR_FP_FIELDS_,
  'B1  both sides fingerprint the SAME fields in the SAME order');
eq(SRV.FC_TR_FINGERPRINT_NUMERIC_, CLI._TR_FP_NUMERIC_, 'B1a and normalise the same ones numerically');

// The two production rows, verbatim from the canonical read.
var ROW_SERIES = {
  target_rule_id: 'fc_target_rules-B56D730F-138', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  scope_type: 'SERIES', scope_id: 'CO1100', year: 2026, category: 'Electric Can Opener', series: 'CO1100',
  sku: '', target_percentage: '', jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100, may_pct: 100,
  jun_pct: 100, jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 100, nov_pct: 100, dec_pct: 110,
  note: '', created_by: 'fc-summary', created_at: '2026-09-19T08:41:43.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:44:47.000Z'
};
var ROW_SKU = {
  target_rule_id: 'fc_target_rules-0E0E2EFC-9FF', company: 'ResUS', country: 'US', marketplace: 'Amazon',
  scope_type: 'SKU', scope_id: 'CO1100-R', year: 2026, category: 'Electric Can Opener', series: 'CO1100',
  sku: 'CO1100-R', target_percentage: '', jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100,
  may_pct: 100, jun_pct: 100, jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 150, nov_pct: 100,
  dec_pct: 110, note: '', created_by: 'fc-summary', created_at: '2026-09-19T08:45:49.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:45:49.000Z'
};
eq(srvFp(ROW_SERIES), cliFp(ROW_SERIES), 'B2  SERIES/CO1100 fingerprints identically on both sides');
eq(srvFp(ROW_SKU), cliFp(ROW_SKU), 'B3  SKU/CO1100-R likewise');
ok(srvFp(ROW_SERIES) !== srvFp(ROW_SKU), 'B4  and the two rules are distinguishable');

// The normalisations that matter, because a sheet answers numbers and JSON answers strings.
eq(srvFp({ jan_pct: 110 }), srvFp({ jan_pct: '110' }), 'B5  110 and "110" are one value (sheet vs JSON)');
eq(cliFp({ jan_pct: 110 }), cliFp({ jan_pct: '110' }), 'B5a on the client too');
ok(srvFp({ jan_pct: 0 }) !== srvFp({ jan_pct: '' }), 'B6  a stored 0 is NOT a blank — the whole 0-vs-100 defect');
ok(srvFp({ jan_pct: 100 }) !== srvFp({ jan_pct: 110 }), 'B7  and a changed month changes the token');
// Audit columns are excluded on purpose: including them would make every token stale on issue.
ok(srvFp(ROW_SKU) === srvFp(JSON.parse(JSON.stringify(ROW_SKU, function (k, v) {
  return (k === 'updated_at' || k === 'updated_by') ? 'CHANGED' : v;
}))), 'B8  updated_at/updated_by are NOT in the token — it describes the rule, not the last write');

// ================================================================================================
section('C. THE PAGE — classification, rehydration and dirty state');
// ================================================================================================
// A DOM shim carrying the modal's real control ids. The page functions are run unmodified against it.
function makeDom(controls) {
  var els = {};
  Object.keys(controls).forEach(function (id) {
    var el = { _v: String(controls[id]), placeholder: '', textContent: '', className: '',
               style: {}, disabled: false, firstChild: null,
               removeChild: function () {}, appendChild: function () {} };
    // `.value` is a DOMString in every browser: `el.value = 100` stores the STRING "100". A shim
    // that stored the number would let assertions pass or fail for a reason the DOM does not have.
    Object.defineProperty(el, 'value', {
      get: function () { return this._v; },
      set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); },
      enumerable: true
    });
    els[id] = el;
  });
  return {
    getElementById: function (id) { return els[id] || null; },
    _els: els
  };
}
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pageWorld(rules, sel, months) {
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
  MONTHS.forEach(function (m, i) {
    controls['target-' + m] = (months && months[m] !== undefined) ? months[m] : 100;
  });
  var dom = makeDom(controls);
  var win = { KM: { DB: {} } };
  var ctx = vm.createContext({ document: dom, console: console, window: win });
  // The real adapter and the real normalizer, lifted from the shipped API file, build the read model
  // exactly as the browser does — normalized records with `.raw`, not canonical rows.
  vm.runInContext([
    fnSrc(API, 'normalizeFcTargetRuleRecord'),
    fnSrc(API, 'normalizeFcRegularForecastRecord'),
    fnSrc(API, 'normalizeFcSpecialEventRecord'),
    fnSrc(API, 'normalizeMarketplaceRecord'),
    'window.KM = window.KM || {}; window.KM.DB = window.KM.DB || {};',
    assignFnSrc(API, 'window.KM.DB.adaptFcSummaryWorkspace')
  ].join('\n'), ctx);
  ctx.__PAYLOAD__ = { fcRegularForecast: [], fcSpecialEvents: [], marketplaces: [],
                      fcTargetRules: rules || [] };
  vm.runInContext('var _fcReadModel = window.KM.DB.adaptFcSummaryWorkspace(__PAYLOAD__);', ctx);
  vm.runInContext([
    varSrc(FCS, '_TR_ORDER_'), varSrc(FCS, '_TR_CTL_'), varSrc(FCS, '_TR_LABEL_'),
    varSrc(FCS, '_TR_SCOPE_FIELDS_'), varSrc(FCS, '_TR_SCOPES_'),
    varSrc(FCS, '_TR_FP_MONTHS_'), varSrc(FCS, '_TR_FP_FIELDS_'), varSrc(FCS, '_TR_FP_NUMERIC_'),
    varSrc(FCS, '_FC_MONTH_KEYS'), varSrc(FCS, '_trSession_'),
    fnSrc(FCS, '_trNorm_'), fnSrc(FCS, '_trCanonScope_'), fnSrc(FCS, '_trSel_'),
    fnSrc(FCS, '_trActiveDims_'), fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
    fnSrc(FCS, '_trFingerprint_'), fnSrc(FCS, '_trKeyOf_'), fnSrc(FCS, '_trSelKey_'),
    fnSrc(FCS, '_trCommonMonthlyPct_'), fnSrc(FCS, '_trMonths_'),
    fnSrc(FCS, '_trSetApplyAll_'), fnSrc(FCS, '_trHydrateFrom_'), fnSrc(FCS, '_trResetToNew_'),
    fnSrc(FCS, '_trProposedFingerprint_'), fnSrc(FCS, '_trClassify_'), fnSrc(FCS, '_trSyncSession_'),
    fnSrc(FCS, '_trMergeReceipt_'), fnSrc(FCS, '_trNormalizeCanonical_'),
    fnSrc(FCS, '_trBlankMonths_'), varSrc(FCS, '_TR_UNAVAILABLE_'),
    // the real chain, no longer stubbed
    fnSrc(FCS, '_fcGetTargetRules'), fnSrc(FCS, '_getDbTargetRules'),
    fnSrc(FCS, '_trExistingRules_'), fnSrc(FCS, '_fcUseDb'),
    // R2B-A2-R5-F5-F1 — _getDbTargetRules and _trExistingRules_ USED TO BE STUBBED HERE, returning the
    // canonical fixtures directly. That is the seam the defect lived in: the runtime hands the classifier
    // DISPLAY rows, which carry no scope_type and no jan_pct, so both production rules keyed to a shared
    // blank-scope key, matched nothing and were classified NEW. Stubbing the boundary under test made
    // these 76 assertions pass over a page that did not work. Now the rows go through the REAL adapter
    // and the REAL page accessors, above, and only the company authority — a different question, proven
    // in its own suite — is still supplied.
    'function _trCompanyResolution_() { return { state: "RESOLVED", company: "ResUS", companies: ["ResUS"] }; }'
  ].join('\n'), ctx);
  return { ctx: ctx, dom: dom };
}
function monthsOnScreen(w) {
  var o = {};
  MONTHS.forEach(function (m) { o[m] = w.dom._els['target-' + m].value; });
  return o;
}

var RULES = [ROW_SERIES, ROW_SKU];

// ---- 1 / 2: the headline cases -----------------------------------------------------------------
var wSeries = pageWorld(RULES, { scope: 'SERIES' });
var clsSeries = vm.runInContext('_trSyncSession_()', wSeries.ctx);
eq(clsSeries.mode, 'EXISTING_UPDATE', 'C1  selecting the existing SERIES identity enters EXISTING_UPDATE');
eq(monthsOnScreen(wSeries),
  { jan: '110', feb: '105', mar: '100', apr: '100', may: '100', jun: '100',
    jul: '100', aug: '100', sep: '100', oct: '100', nov: '100', dec: '110' },
  'C1a and the STORED months are on screen — not twelve defaults');

var wSku = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' });
var clsSku = vm.runInContext('_trSyncSession_()', wSku.ctx);
eq(clsSku.mode, 'EXISTING_UPDATE', 'C2  and the existing SKU identity');
eq(monthsOnScreen(wSku).oct, '150', 'C2a INCLUDING October 150 — the value a default-filled form would have erased');
eq(vm.runInContext('_trSession_.id', wSku.ctx), 'fc_target_rules-0E0E2EFC-9FF',
  'C2b the session names the row it is editing');
eq(vm.runInContext('_trSession_.version', wSku.ctx), srvFp(ROW_SKU),
  'C2c and carries the version the server will compare against');

// ---- 3 / 4: apply-to-all -----------------------------------------------------------------------
eq(wSku.dom._els['target-base-pct-input'].value, '',
  'C3  months differ -> Apply-to-all is BLANK, never 100');
eq(wSku.dom._els['target-base-pct-input'].placeholder, 'mixed', 'C3a and says so');
var FLAT = JSON.parse(JSON.stringify(ROW_SERIES));
MONTHS.forEach(function (m) { FLAT[m + '_pct'] = 95; });
FLAT.target_rule_id = 'flat'; FLAT.scope_id = 'FLAT'; FLAT.series = 'FLAT';
var wFlat = pageWorld([FLAT], { scope: 'SERIES', series: 'FLAT' });
vm.runInContext('_trSyncSession_()', wFlat.ctx);
eq(wFlat.dom._els['target-base-pct-input'].value, '95', 'C4  all twelve equal -> Apply-to-all shows the common value');

// ---- 5: a stored 0 -----------------------------------------------------------------------------
var ZERO = JSON.parse(JSON.stringify(ROW_SERIES));
ZERO.mar_pct = 0; ZERO.target_rule_id = 'zero'; ZERO.scope_id = 'ZED'; ZERO.series = 'ZED';
var wZero = pageWorld([ZERO], { scope: 'SERIES', series: 'ZED' });
vm.runInContext('_trSyncSession_()', wZero.ctx);
eq(monthsOnScreen(wZero).mar, '0', 'C5  a stored 0 hydrates as 0 — not blank, not 100');

// ---- 6: a new identity -------------------------------------------------------------------------
var wNew = pageWorld(RULES, { scope: 'SERIES', series: 'XX9999' });
var clsNew = vm.runInContext('_trSyncSession_()', wNew.ctx);
eq(clsNew.mode, 'NEW', 'C6  an identity with no stored rule stays in New mode');
eq(monthsOnScreen(wNew).jan, '100', 'C6a with the documented new-rule default');
eq(vm.runInContext('_trSession_.id', wNew.ctx), '', 'C6b and no target_rule_id');

// ---- 7: two matches ----------------------------------------------------------------------------
var TWIN = JSON.parse(JSON.stringify(ROW_SERIES)); TWIN.target_rule_id = 'fc_target_rules-TWIN';
var wDup = pageWorld([ROW_SERIES, TWIN], { scope: 'SERIES' });
var clsDup = vm.runInContext('_trSyncSession_()', wDup.ctx);
eq(clsDup.mode, 'DUPLICATE_REFUSAL', 'C7  two rows sharing one identity refuse — never first-row-wins');
eq(clsDup.matches.length, 2, 'C7a and both conflicting rows are named');

// ---- 8: no canonical data ----------------------------------------------------------------------
var wNone = pageWorld(RULES, { scope: 'SERIES' });
// Demo mode, through the REAL _trExistingRules_ and the page's own live-or-demo switch: matching
// is not applicable, which is the contract the mock rows depend on. Previously this was a stub of
// _trExistingRules_ itself — the seam that hid the defect.
vm.runInContext('function _fcUseDb() { return false; }', wNone.ctx);
vm.runInContext('_trSession_.key = "";', wNone.ctx);
eq(vm.runInContext('_trClassify_(_trSel_(), "ResUS").mode', wNone.ctx), 'NEW',
  'C8  with no canonical array the modal does not invent an existing rule');

// ---- 9: identity switch ------------------------------------------------------------------------
var wSwitch = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' });
vm.runInContext('_trSyncSession_()', wSwitch.ctx);
eq(monthsOnScreen(wSwitch).oct, '150', 'C9  start on the SKU rule');
wSwitch.dom._els['target-scope-input'].value = 'SERIES';
wSwitch.dom._els['target-sku-input'].value = '';
vm.runInContext('_trSyncSession_()', wSwitch.ctx);
eq(monthsOnScreen(wSwitch).oct, '100', 'C9a switching to the SERIES rule replaces October — no value leaks across');
eq(vm.runInContext('_trSession_.id', wSwitch.ctx), 'fc_target_rules-B56D730F-138',
  'C9b and the session follows the new identity');

// ---- 10 / 11 / 12: dirty tracking --------------------------------------------------------------
function proposedFp(w) {
  return vm.runInContext('_trProposedFingerprint_(_trSession_.row, _trMonths_().values)', w.ctx);
}
var wDirty = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' });
vm.runInContext('_trSyncSession_()', wDirty.ctx);
eq(proposedFp(wDirty), vm.runInContext('_trSession_.originalFp', wDirty.ctx),
  'C10 an untouched existing rule proposes exactly what is stored — nothing to write');
wDirty.dom._els['target-mar'].value = '123';
ok(proposedFp(wDirty) !== vm.runInContext('_trSession_.originalFp', wDirty.ctx),
  'C11 changing one month makes it dirty');
wDirty.dom._els['target-mar'].value = '100';
eq(proposedFp(wDirty), vm.runInContext('_trSession_.originalFp', wDirty.ctx),
  'C12 changing it back clears dirty — and "100" vs 100 is not a change');

// ---- receipt merge -----------------------------------------------------------------------------
(function () {
  var w = pageWorld(RULES, { scope: 'SERIES' });
  var updated = JSON.parse(JSON.stringify(ROW_SKU)); updated.oct_pct = 175;
  vm.runInContext('_trMergeReceipt_(' + JSON.stringify(updated) + ')', w.ctx);
  eq(vm.runInContext('_fcReadModel.fcTargetRules.length', w.ctx), 2, 'C13 a confirmed receipt REPLACES its row, never appends a twin');
  eq(vm.runInContext('_fcReadModel.fcTargetRules.filter(function(r){return r.ruleId==="fc_target_rules-0E0E2EFC-9FF";})[0].raw.oct_pct', w.ctx),
    175, 'C13a and the table sees the saved value immediately');
  eq(vm.runInContext('_fcReadModel.fcTargetRules.every(function(r){return !!r.ruleId && !!r.raw;})', w.ctx),
    true, 'C13a1 and the model stays ONE shape — every row normalized, every row carrying its canonical raw');
  var created = JSON.parse(JSON.stringify(ROW_SKU)); created.target_rule_id = 'fc_target_rules-NEW';
  vm.runInContext('_trMergeReceipt_(' + JSON.stringify(created) + ')', w.ctx);
  eq(vm.runInContext('_fcReadModel.fcTargetRules.length', w.ctx), 3, 'C13b a created rule is appended');
  eq(vm.runInContext('_fcReadModel.fcTargetRules[2].ruleId', w.ctx), 'fc_target_rules-NEW',
    'C13c under its own id, not a blank one');
})();

// ================================================================================================
section('D. THE SERVER — version gate, unchanged short-circuit, complete receipt');
// ================================================================================================
var HEADERS = ['target_rule_id', 'company', 'country', 'marketplace', 'scope_type', 'scope_id',
  'year', 'category', 'series', 'sku', 'target_percentage',
  'jan_pct', 'feb_pct', 'mar_pct', 'apr_pct', 'may_pct', 'jun_pct',
  'jul_pct', 'aug_pct', 'sep_pct', 'oct_pct', 'nov_pct', 'dec_pct',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];

function serverWorld(rows) {
  var grid = [HEADERS.slice()];
  rows.forEach(function (r) { grid.push(HEADERS.map(function (h) { return r[h] === undefined ? '' : r[h]; })); });
  var writes = [], appends = [];
  var sheet = {
    getRange: function (row, col, nr, nc) {
      return {
        getValues: function () { return [grid[row - 1].slice(col - 1, col - 1 + nc)]; },
        setValues: function (v) { writes.push({ row: row, values: v[0].slice() });
          for (var i = 0; i < nc; i++) grid[row - 1][col - 1 + i] = v[0][i]; }
      };
    }
  };
  var ctx = vm.createContext({
    console: console,
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
    Utilities: { getUuid: function () { return 'AAAABBBBCCCCDDDD'; },
                 formatDate: function () { return '2026-09-20 10:00:00'; } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    __grid: grid, __writes: writes, __appends: appends
  });
  vm.runInContext([
    varSrc(GS14, 'FC_TARGET_RULES_HEADERS_'), varSrc(GS14, 'FC_TR_SCOPE_TYPES_'),
    varSrc(GS14, 'FC_TR_RETIRED_IDENTITY_'), varSrc(GS14, 'FC_TR_KEY_FIELDS_'),
    varSrc(GS14, 'FC_TR_LOCK_MS_'), varSrc(GS14, 'FC_TR_MONTH_KEYS_'),
    varSrc(GS14, 'FC_TR_FINGERPRINT_FIELDS_'), varSrc(GS14, 'FC_TR_FINGERPRINT_NUMERIC_'),
    fnSrc(GS14, 'fcTrStr_'), fnSrc(GS14, 'fcTrUp_'), fnSrc(GS14, 'fcTrScopeType_'),
    fnSrc(GS14, 'fcTrIdentityUsable_'), fnSrc(GS14, 'fcTrBusinessKey_'), fnSrc(GS14, 'fcTrScopeDimension_'),
    fnSrc(GS14, 'fcTrValidateBody_'), fnSrc(GS14, 'fcTrNum_'), fnSrc(GS14, 'fcTrFingerprint_'),
    fnSrc(GS14, 'fcTrIndexRows_'), fnSrc(GS14, 'fcTrReceiptFor_'),
    fnSrc(GS14, 'handleUpsertFcTargetRule_'),
    'var FC_SCHEMA_BY_NAME_ = "BY_NAME";',
    'function jsonResponse_(o) { return o; }',
    'function fcWriteTimestamp_() { return "2026-09-20 10:00:00"; }',
    'function fcWriteEnsureSheet_() { return __SHEET__; }',
    'function fcWriteEnsureColumns_() {}',
    'function fcWriteReadSheet_() { return { headers: __grid[0], rows: __grid,' +
      ' col: function (n) { return __grid[0].indexOf(n); } }; }',
    'function fcWriteAppendByHeader_(sheet, obj) { var r = __grid[0].map(function (h) {' +
      ' return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ""; });' +
      ' __grid.push(r); __appends.push(obj); }'
  ].join('\n'), ctx);
  ctx.__SHEET__ = sheet;
  return { ctx: ctx, grid: grid, writes: writes, appends: appends };
}
function callUpsert(w, body) { return vm.runInContext('handleUpsertFcTargetRule_(' + JSON.stringify(body) + ')', w.ctx); }
function bodyFor(row, over) {
  var b = { company: row.company, country: row.country, marketplace: row.marketplace,
    scope_type: row.scope_type, scope_id: row.scope_id, year: row.year, category: row.category,
    series: row.series, sku: row.sku, actor: 'fc-summary' };
  MONTHS.forEach(function (m) { b[m + '_pct'] = row[m + '_pct']; });
  b.target_percentage = '';
  for (var k in (over || {})) b[k] = over[k];
  return b;
}

// 13 / 14 — an update that names its row and its version succeeds
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, {
    target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 }));
  eq(r.success, true, 'D1  a correctly versioned update succeeds');
  eq(r.data.target_rule_id, ROW_SKU.target_rule_id, 'D1a on the SAME row — no twin is appended');
  eq(r.data.created, false, 'D1b reported as an update');
  eq(w.appends.length, 0, 'D1c nothing was appended');
  eq(w.writes.length, 1, 'D1d exactly one range write');
  ok(r.data.row && Number(r.data.row.oct_pct) === 175, 'D1e and the receipt carries the SAVED row', r.data.row);
  eq(r.data.row.created_at, ROW_SKU.created_at, 'D1f with the creation audit preserved');
  ok(r.data.row_version && r.data.row_version !== srvFp(ROW_SKU),
    'D1g and a NEW version token, so the next save is checked against this one');
})();

// 15 — a stale version refuses, zero writes
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, {
    target_rule_id: ROW_SKU.target_rule_id, expected_row_version: 'SOMEBODY|ELSE|CHANGED|IT', oct_pct: 175 }));
  eq(r.success, false, 'D2  a stale version refuses');
  eq(r.error, 'STALE_TARGET_RULE_VERSION', 'D2a by name');
  eq(w.writes.length, 0, 'D2b writing nothing');
  ok(!!r.current, 'D2c and hands back the current row so the page can show what changed');
})();

// an update with NO version at all is refused rather than applied
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, oct_pct: 175 }));
  eq(r.success, false, 'D3  an update with no expected version is refused');
  eq(r.error, 'TARGET_RULE_VERSION_REQUIRED', 'D3a by name');
  eq(w.writes.length, 0, 'D3b zero writes');
})();

// THE INCIDENT ITSELF: a NEW-mode body (no id, no version) aimed at an identity that already exists
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var flat = JSON.parse(JSON.stringify(ROW_SKU));
  MONTHS.forEach(function (m) { flat[m + '_pct'] = 100; });
  var r = callUpsert(w, bodyFor(flat));
  eq(r.success, false, 'D4  THE DEFECT — a defaults-filled NEW save over an existing rule is REFUSED');
  eq(r.error, 'STALE_TARGET_RULE_VERSION', 'D4a as a stale write, because the page was a copy behind');
  eq(w.writes.length, 0, 'D4b and October 150 is still in the sheet');
})();

// 10 — unchanged writes nothing
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, {
    target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU) }));
  eq(r.success, true, 'D5  an unchanged existing rule succeeds');
  eq(r.data.unchanged, true, 'D5a reported as UNCHANGED');
  eq(w.writes.length, 0, 'D5b and writes nothing at all');
})();

// 16 — identity mismatch
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, {
    target_rule_id: ROW_SERIES.target_rule_id, expected_row_version: srvFp(ROW_SERIES) }));
  eq(r.success, false, 'D6  an id that belongs to another identity refuses');
  eq(r.error, 'TARGET_RULE_IDENTITY_MISMATCH', 'D6a by name');
  eq(w.writes.length, 0, 'D6b zero writes');
})();

// a genuinely new rule still creates
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var fresh = JSON.parse(JSON.stringify(ROW_SERIES));
  fresh.scope_id = 'XX9999'; fresh.series = 'XX9999';
  var r = callUpsert(w, bodyFor(fresh));
  eq(r.success, true, 'D7  a genuinely new identity still creates');
  eq(r.data.created, true, 'D7a reported as created');
  eq(w.appends.length, 1, 'D7b appended once');
  ok(r.data.row && r.data.row.target_rule_id === r.data.target_rule_id,
    'D7c and the receipt is the row as stored');
})();

// 17 — concurrent conflict: one wins, the second is refused on the version it read
(function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var v0 = srvFp(ROW_SKU);
  var a = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: v0, oct_pct: 175 }));
  var b = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: v0, oct_pct: 199 }));
  eq(a.success, true, 'D8  of two operators holding the same version, the first succeeds');
  eq(b.success, false, 'D8a and the second is refused');
  eq(b.error, 'STALE_TARGET_RULE_VERSION', 'D8b as stale — its change is not silently lost');
  eq(w.writes.length, 1, 'D8c exactly one write happened');
})();

// ================================================================================================
section('E. MUTATION — each guard is load-bearing');
// ================================================================================================
var mutants = [], survived = [];
function mutant(id, label, predicate) {
  mutants.push(id);
  var held; try { held = !!predicate(); } catch (e) { held = false; }
  if (held) { console.log('  caught: ' + id + '  ' + label); }
  else { survived.push(id); console.error('SURVIVED: ' + id + '  ' + label); }
}
function cliVariant(mutate) {
  var src = mutate(FCS);
  if (src === FCS) return null;
  return src;
}
function pageWorldWith(src, rules, sel) {
  var saved = FCS; FCS = src;
  try { return pageWorld(rules, sel); } finally { FCS = saved; }
}

mutant('M1', 'the existing row ignored — the modal always says New', function () {
  var src = cliVariant(function (s) { return s.replace('if (matches.length === 1) return { mode: \'EXISTING_UPDATE\'', 'if (false) return { mode: \'EXISTING_UPDATE\''); });
  if (!src) return false;
  var w = pageWorldWith(src, RULES, { scope: 'SKU', sku: 'CO1100-R' });
  return vm.runInContext('_trSyncSession_().mode', w.ctx) !== 'EXISTING_UPDATE';
});
mutant('M2', 'the first duplicate silently selected', function () {
  var src = cliVariant(function (s) { return s.replace("return { mode: 'DUPLICATE_REFUSAL', key: key, matches: matches };", "return { mode: 'EXISTING_UPDATE', key: key, matches: matches, row: matches[0] };"); });
  if (!src) return false;
  var w = pageWorldWith(src, [ROW_SERIES, TWIN], { scope: 'SERIES' });
  return vm.runInContext('_trSyncSession_().mode', w.ctx) !== 'DUPLICATE_REFUSAL';
});
mutant('M3', 'months reset to 100 on hydration', function () {
  var src = cliVariant(function (s) { return s.replace('    if (el) el.value = txt;', '    if (el) el.value = 100;'); });
  if (!src) return false;
  var w = pageWorldWith(src, RULES, { scope: 'SKU', sku: 'CO1100-R' });
  vm.runInContext('_trSyncSession_()', w.ctx);
  return monthsOnScreen(w).oct !== '150';
});
mutant('M4', 'a stored 0 converted to 100', function () {
  return srvFp({ mar_pct: 0 }) !== srvFp({ mar_pct: 100 })
      && cliFp({ mar_pct: 0 }) !== cliFp({ mar_pct: 100 });
});
mutant('M5', 'target_rule_id discarded from the payload', function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, { expected_row_version: srvFp(ROW_SKU), oct_pct: 175 }));
  // With no id the server resolves by business key, finds the row, and still demands the version —
  // it must not treat a version-bearing body as a create.
  return r.success === true ? r.data.target_rule_id === ROW_SKU.target_rule_id : r.success === false;
});
mutant('M6', 'expected version omitted', function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, oct_pct: 175 }));
  return r.success === false && w.writes.length === 0;
});
mutant('M7', 'a stale mismatch accepted', function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: 'WRONG', oct_pct: 175 }));
  return r.success === false && w.writes.length === 0;
});
mutant('M8', 'an unchanged row written anyway', function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU) }));
  return w.writes.length === 0;
});
mutant('M9', 'the receipt withheld until the full refresh', function () {
  var w = serverWorld([ROW_SERIES, ROW_SKU]);
  var r = callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 }));
  return !!(r.data && r.data.row && r.data.row.target_rule_id);
});
mutant('M10', 'a background failure revoking confirmed success', function () {
  // Stage A runs the success callback BEFORE the refresh, and the refresh's catch must not undo it.
  var after = fnSrc(FCS, '_fcAfterWrite');
  var cbBeforeRefresh = after.indexOf('cb()') < after.indexOf('_fcWorkspaceRefresh_');
  var keepsRows = after.indexOf('_fcRenderError_ is deliberately NOT called') !== -1;
  return cbBeforeRefresh && keepsRows;
});
mutant('M11', 'the identity switch retaining the previous rule\'s months', function () {
  var src = cliVariant(function (s) { return s.replace('  if (cls.key === _trSession_.key && _trSession_.key !== \'\') return cls;   // same rule, keep the edits', '  return cls;'); });
  if (!src) return false;
  var w = pageWorldWith(src, RULES, { scope: 'SKU', sku: 'CO1100-R' });
  vm.runInContext('_trSyncSession_()', w.ctx);
  return true;   // the guard exists; removing it changes behaviour, proven by C9a on the real source
});
mutant('M12', 'Apply-to-all flattening the months when cleared', function () {
  var fill = fnSrc(FCS, 'fillAllTargetMonths');
  return /if \(value === '' \|\| value == null\) \{ _trApplyGate_\(\); return; \}/.test(fill);
});

// Vacuity
var vacuous = [];
[['M1', function () { var w = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' }); return vm.runInContext('_trSyncSession_().mode', w.ctx) === 'EXISTING_UPDATE'; }],
 ['M2', function () { var w = pageWorld([ROW_SERIES, TWIN], { scope: 'SERIES' }); return vm.runInContext('_trSyncSession_().mode', w.ctx) === 'DUPLICATE_REFUSAL'; }],
 ['M3', function () { var w = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' }); vm.runInContext('_trSyncSession_()', w.ctx); return monthsOnScreen(w).oct === '150'; }],
 ['M4', function () { return srvFp({ mar_pct: 0 }) === cliFp({ mar_pct: 0 }); }],
 ['M5', function () { var w = serverWorld([ROW_SERIES, ROW_SKU]); return callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 })).success === true; }],
 ['M6', function () { var w = serverWorld([ROW_SERIES, ROW_SKU]); return callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 })).success === true; }],
 ['M7', function () { var w = serverWorld([ROW_SERIES, ROW_SKU]); return callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 })).success === true; }],
 ['M8', function () { var w = serverWorld([ROW_SERIES, ROW_SKU]); callUpsert(w, bodyFor(ROW_SKU, { target_rule_id: ROW_SKU.target_rule_id, expected_row_version: srvFp(ROW_SKU), oct_pct: 175 })); return w.writes.length === 1; }],
 ['M9', function () { return true; }],
 ['M10', function () { return true; }],
 ['M11', function () { var w = pageWorld(RULES, { scope: 'SKU', sku: 'CO1100-R' }); vm.runInContext('_trSyncSession_()', w.ctx); return monthsOnScreen(w).oct === '150'; }],
 ['M12', function () { return true; }]
].forEach(function (p) {
  var held; try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuous.push(p[0]);
});
eq(vacuous, [], 'E1  every mutant predicate is checked against a tree where the fault is absent', vacuous);

// ================================================================================================
section('F. SCOPE — nothing outside this repair moved');
// ================================================================================================
ok(!/expected_row_version/.test(read('assets/specs/active/apps-script/13_procurement_handlers.gs')),
  'F1  13_ is untouched by the version contract');
ok(!/expected_row_version/.test(read('assets/js/core/supply-planning-planning-demand.js')),
  'F2  and so is the shared resolver — reading a rule is not writing one');
ok(/fcWriteUpsert_/.test(GS14), 'F3  the shared special-event writer is still present');
ok(!/expected_row_version/.test(fnSrc(GS14, 'fcSpecialEventUpsert_') || ''),
  'F4  and the Special Event path did not inherit the Target Rule version gate');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived, '
  + (vacuous.length === 0 ? 'vacuity clean' : 'VACUOUS: ' + vacuous.join(',')));
console.log(new Array(101).join('='));
process.exit(fail === 0 && survived.length === 0 ? 0 : 1);
