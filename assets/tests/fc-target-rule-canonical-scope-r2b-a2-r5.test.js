// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5
// A DROPDOWN THAT OFFERS CHOICES THE DATABASE HAS NEVER HEARD OF
// Run: node assets/tests/fc-target-rule-canonical-scope-r2b-a2-r5.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script. It runs the REAL page functions extracted from
// fc-summary.js against a DOM shim and a CONTROLLED canonical read model.
//
// WHAT THE OPERATOR SAW. The Add Target % Rule modal had no Country selector, and Marketplace offered
// exactly three choices: All, Amazon, Walmart.
//
// WHAT IT ACTUALLY WAS. Every option list in that modal was a static HTML literal. Marketplace was three
// hardcoded <option> tags; Category was `All` plus three product names; Series was five hardcoded codes;
// SKU was a free-text box validated against `upcomingSkuData` / `runningSkuData` / `phasingOutSkuData` —
// the DEMO arrays in assets/js/utils/data.js. Nothing in the page ever populated any of them. A census of
// every JS reference to those five control ids found reads and not one write, so the values a user could
// pick had no relationship to the database the rule would be written against. Amazon and Walmart were not
// "probably stale": they were never derived from anything.
//
// AND THE PAYLOAD AGREED WITH NOBODY. handleUpsertFcTargetRule_ documents `company?, country?` in its body
// contract and the live sheet carries both columns, but the page sent neither — so every rule written from
// this modal recorded a blank owner. In resolveTargetPct (90_generated_supply_planning_bundle.gs) a blank
// company is a WILDCARD: `if (s(r.company) && s(sc.company) && ...)` skips the comparison entirely when the
// rule's company is empty. A blank was not a missing detail; it silently widened the rule to every company.
//
// THE `All` SENTINEL, AND WHY IT IS GONE. Three consumers read these rules and all three disagree:
//   resolveTargetPct (90_)            honours 'ALL' for country and marketplace, has NO 'ALL' for company,
//                                     ignores scope_type entirely and takes the FIRST matching row;
//   procurementTargetRuleResolver_    ignores company, country, marketplace AND year; keys byCat/bySeries/
//     (13_)                           bySku on scope_id, so a Category rule with scope_id 'All' registers
//                                     byCat['ALL'] and matches only a category literally named "All";
//   getEffectiveTargetPct (this page) honours 'All' for marketplace and category, knows nothing of company.
// §2 admits a sentinel only when the server resolver, the downstream matching AND the precedence spec all
// support it. Precedence is not defined anywhere — resolveTargetPct returns `[0]`, so whether an `All` rule
// beats a specific one depends on sheet row order — and as a Category value it resolves nowhere at all. So
// `All` is no longer offerable. That is a REMOVAL of a saveable value, recorded here so it is not
// reintroduced as a convenience.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }
var JS_REL = 'assets/js/pages/fc-summary.js';
var HTML_REL = 'assets/html/pages/fc-summary.html';
var JS = read(JS_REL);
var HTML = read(HTML_REL);
var CSS = read('assets/css/pages/fc-overview.css');

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
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced braces: ' + name);
}
function extractVar(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=\\s*[\\s\\S]*?;[^\\S\\n]*(?:\\/\\/[^\\n]*)?\\r?\\n').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
function swapSrc(src, a, b) {
  var n = src.replace(/\r\n/g, '\n');
  if (n.split(a).length - 1 !== 1) throw new Error('mutation anchor not unique: ' + a.slice(0, 90));
  return n.split(a).join(b);
}

// =================================================================================================
// THE MODAL MARKUP — read from the SHIPPED partial, never retyped
// =================================================================================================
var MODAL = (function () {
  var a = HTML.indexOf('id="fc-add-target-modal"');
  if (a < 0) throw new Error('target modal not found in the shipped partial');
  var b = HTML.indexOf('<!-- Pagination footer', a);
  if (b < 0) throw new Error('modal end marker not found');
  return HTML.slice(a, b);
})();
// id -> tagName, and for <select> its shipped inner markup. A shim built from this cannot drift from the
// markup the way a hand-written fixture can.
var MODAL_CONTROLS = (function () {
  var out = {}, re = /<(select|input|div|button)\b([^>]*)>/g, m;
  while ((m = re.exec(MODAL))) {
    var id = /\bid="([^"]+)"/.exec(m[2]);
    if (id) out[id[1]] = m[1];
  }
  return out;
})();
var MODAL_SELECT_HTML = (function () {
  var out = {}, re = /<select\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g, m;
  while ((m = re.exec(MODAL))) out[m[1]] = m[2];
  return out;
})();

// =================================================================================================
section('A. THE STATIC LITERALS ARE GONE FROM THE MARKUP');
// =================================================================================================
ok(/id="target-country-input"/.test(MODAL), 'A1 the modal has a Country control at all');
eq(MODAL_CONTROLS['target-country-input'], 'select', 'A2 Country is a select');
eq(MODAL_CONTROLS['target-marketplace-input'], 'select', 'A3 Marketplace is a select');
eq(MODAL_CONTROLS['target-category-input'], 'select', 'A4 Category is a select');
eq(MODAL_CONTROLS['target-series-input'], 'select', 'A5 Series is a select');
// SKU was a free-text box. A text box cannot be limited to a canonical universe, so it cannot satisfy §4.
eq(MODAL_CONTROLS['target-sku-input'], 'select', 'A6 SKU is a select, not the old free-text box');
eq(MODAL_CONTROLS['target-year-input'], 'select', 'A7 Year is a select built from canonical years');

// The five data-driven lists ship EMPTY. Scope is deliberately excluded: Category/Series/SKU is a fixed
// vocabulary the server's scope_type contract defines, not a fact about the database.
['target-year-input', 'target-country-input', 'target-marketplace-input',
 'target-category-input', 'target-series-input', 'target-sku-input'].forEach(function (id, i) {
  eq((MODAL_SELECT_HTML[id] || '').replace(/\s/g, ''), '',
    'A8.' + (i + 1) + ' ' + id + ' ships no hardcoded <option>');
});
ok(/<option value="Category">/.test(MODAL_SELECT_HTML['target-scope-input'] || ''),
  'A9 Scope keeps its fixed vocabulary — that one IS a contract, not data');

// The specific literals the operator reported.
ok(MODAL.indexOf('>Amazon<') === -1, 'A10 no hardcoded Amazon survives in the modal');
ok(MODAL.indexOf('>Walmart<') === -1, 'A11 no hardcoded Walmart survives in the modal');
ok(MODAL.indexOf('value="All"') === -1, 'A12 no `All` sentinel is offerable');
ok(MODAL.indexOf('Electric Can Opener') === -1, 'A13 no hardcoded category name survives');
ok(MODAL.indexOf('CO1100') === -1, 'A14 no hardcoded series code survives');

// The demo arrays are out of the write path entirely.
var CODE = codeOnly(JS);
ok(CODE.indexOf('upcomingSkuData') === -1 && CODE.indexOf('runningSkuData') === -1
  && CODE.indexOf('phasingOutSkuData') === -1,
  'A15 §3 the demo SKU arrays are no longer referenced by any code path in this page');
// Scoped to the TARGET RULE code, not the whole page: the Special Event Builder and the CSV import are
// documented (58_api_v1_fc_summary_workspace.gs) as still reading the broad cache lazily, and migrating
// them is a separate follow-up. What §3 forbids is THIS modal reaching for it.
// R2B-A2-R5-F5 — _trRebuild_ now classifies the identity and rehydrates an existing rule before the
// gate runs, so the session helpers are part of its dependency closure.
var TR_CODE = codeOnly(['_trRows_', '_trDataState_', '_trRowsFor_', '_trDistinct_', '_trRebuild_',
  '_trStrTok_', '_trNumTok_', '_trFingerprint_', '_trKeyOf_', '_trSelKey_', '_trExistingRules_',
  '_trSetApplyAll_', '_trHydrateFrom_', '_trResetToNew_', '_trProposedFingerprint_',
  // R2B-A2-R5-F5-F1 — the canonical row-shape seam: the blank-months state and the borrowed
  // normalization authority the receipt merge now goes through.
  '_trBlankMonths_', '_trNormalizeCanonical_', '_fcGetTargetRules', '_getDbTargetRules',
  '_trClassify_', '_trSyncSession_', '_trRenderMode_', '_trMergeReceipt_',
  '_trOnChange_', '_trCompanyResolution_', '_trGate_', '_trApplyGate_', '_trBuildPayload_',
  'openAddTargetRuleModal', 'updateTargetScopeFields', 'saveNewTargetRule']
  .map(function (f) { return extractFn(JS, f); }).join('\n'));
ok(TR_CODE.indexOf('_opDbCache') === -1, 'A16 §3 the Target Rule code uses no broad-cache handle');
ok(TR_CODE.indexOf('getMarketplaceSkus') === -1, 'A17 §3 and issues no second generic fan-out');
ok(TR_CODE.indexOf('localStorage') === -1, 'A18 §3 localStorage is never treated as server truth here');
ok(TR_CODE.indexOf('getTable') === -1, 'A18b §3 nor a generic getTable read');
// and it really does read the canonical source
ok(TR_CODE.indexOf('_getDbFcRegularData') > -1, 'A18c it reads the canonical FC read model');

// =================================================================================================
section('B. THE SANDBOX — real page functions, one controlled canonical model');
// =================================================================================================
// One country+marketplace with one owner; one with a DIFFERENT marketplace set; one with TWO owners; one
// marketplace that was never in the old hardcoded list; and a second year.
var CANON = [
  { year: '2026', company: 'ResTW', country: 'US', marketplace: 'Amazon',  category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R' },
  { year: '2026', company: 'ResTW', country: 'US', marketplace: 'Amazon',  category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-S' },
  { year: '2026', company: 'ResTW', country: 'US', marketplace: 'Amazon',  category: 'Silicone Product',    series: 'SP3120', sku: 'SP3120-A' },
  { year: '2026', company: 'ResTW', country: 'US', marketplace: 'Walmart', category: 'Electric Can Opener', series: 'CO1150', sku: 'CO1150-ZW' },
  { year: '2026', company: 'ResTW', country: 'CA', marketplace: 'Amazon',  category: 'Manual Opener',       series: 'MO5600', sku: 'MO5600-K' },
  // The SAME product line sold in a second country. Without a row like this every downstream value is
  // cleared by the rebuild's own 'keep only what is still offered' rule, and the separate clear-the-
  // downstream guard can never be observed failing.
  { year: '2026', company: 'ResTW', country: 'CA', marketplace: 'Amazon',  category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R' },
  { year: '2026', company: 'ResTW', country: 'JP', marketplace: 'Rakuten', category: 'Manual Opener',       series: 'MO5600', sku: 'MO5600-J' },
  { year: '2026', company: 'ResTW', country: 'DE', marketplace: 'Amazon',  category: 'Manual Opener',       series: 'MO5600', sku: 'MO5600-D' },
  { year: '2026', company: 'KM-EU', country: 'DE', marketplace: 'Amazon',  category: 'Manual Opener',       series: 'MO5600', sku: 'MO5600-E' },
  { year: '2025', company: 'ResTW', country: 'US', marketplace: 'Amazon',  category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R' }
];

function makeDom() {
  var byId = {};
  function El(tag) {
    var e = {
      tagName: String(tag || 'div').toUpperCase(), children: [], parentNode: null,
      attrs: {}, style: {}, _text: '', className: '', _id: '', _html: '', disabled: false,
      options: [], _value: '',
      classList: {
        add: function (c) { if ((' ' + e.className + ' ').indexOf(' ' + c + ' ') < 0) e.className = (e.className ? e.className + ' ' : '') + c; },
        remove: function (c) { e.className = (' ' + e.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
        contains: function (c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') > -1; }
      },
      setAttribute: function (k, v) { e.attrs[k] = String(v); if (k === 'id') e.id = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(e.attrs, k) ? e.attrs[k] : null; },
      removeAttribute: function (k) { delete e.attrs[k]; },
      // The page builds options with createElement/appendChild, so the shim has to understand that and
      // not only innerHTML — otherwise every list would read as empty and every assertion would pass.
      appendChild: function (c) { c.parentNode = e; e.children.push(c); if (c.tagName === 'OPTION') e.options.push(c); return c; },
      removeChild: function (c) {
        var i = e.children.indexOf(c); if (i > -1) e.children.splice(i, 1);
        var j = e.options.indexOf(c); if (j > -1) e.options.splice(j, 1);
        return c;
      },
      querySelectorAll: function () { return []; },
      querySelector: function () { return null; }
    };
    Object.defineProperty(e, 'firstChild', { get: function () { return e.children.length ? e.children[0] : null; } });
    Object.defineProperty(e, 'id', {
      get: function () { return e._id; },
      set: function (v) { e._id = String(v); e.attrs.id = String(v); byId[e._id] = e; }
    });
    Object.defineProperty(e, 'textContent', {
      get: function () { return e._text || e.children.map(function (c) { return c.textContent; }).join(''); },
      set: function (v) { e._text = String(v); e.children = []; e.options = []; }
    });
    Object.defineProperty(e, 'value', {
      get: function () { return e._value; },
      // A <select> can only hold a value one of its options offers — otherwise a test could claim a
      // marketplace is selected that the operator was never shown.
      set: function (v) {
        var s = String(v);
        if (e.tagName !== 'SELECT') { e._value = s; return; }
        e._value = (s === '' || e.options.some(function (o) { return String(o.value) === s; })) ? s : '';
      }
    });
    Object.defineProperty(e, 'innerHTML', {
      get: function () { return e._html; },
      set: function (v) {
        e._html = String(v); e.children = []; e.options = [];
        var re = /<option value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g, m;
        while ((m = re.exec(e._html))) e.options.push({ value: m[1], text: m[2] });
        if (e.tagName === 'SELECT' && !e.options.some(function (o) { return String(o.value) === e._value; })) e._value = '';
      }
    });
    return e;
  }
  return { El: El, byId: byId, document: { body: El('body'), createElement: El, getElementById: function (id) { return byId[id] || null; } } };
}

var TR_FNS = ['_trCanonScope_', '_trNorm_', '_trRows_', '_trDataState_', '_trDistinct_', '_trRowsFor_',
  '_trSel_', '_trActiveDims_', '_trFillSelect_', '_trRebuild_', '_trOnChange_', '_trCompanyResolution_',
  '_trStrTok_', '_trNumTok_', '_trFingerprint_', '_trKeyOf_', '_trSelKey_', '_trExistingRules_',
  '_trSetApplyAll_', '_trHydrateFrom_', '_trResetToNew_', '_trProposedFingerprint_',
  // R2B-A2-R5-F5-F1 — the canonical row-shape seam.
  '_trBlankMonths_', '_trNormalizeCanonical_', '_fcGetTargetRules', '_getDbTargetRules',
  '_trClassify_', '_trSyncSession_', '_trRenderMode_', '_trMergeReceipt_',
  '_trMonths_', '_trGate_', '_trApplyGate_', '_trBuildPayload_', '_trCommonMonthlyPct_',
  'openAddTargetRuleModal', 'updateTargetScopeFields', 'fillAllTargetMonths', 'saveNewTargetRule',
  '_fcWriteBegin_', '_fcWriteEnd_', '_fcSetTargetSaveEnabled_'];
var TR_VARS = ['_TR_ORDER_', '_TR_CTL_', '_TR_LABEL_', '_TR_SCOPE_FIELDS_', '_TR_SCOPES_',
  // R2B-A2-R5-F5 — the edit session and the version-token field lists.
  '_TR_FP_MONTHS_', '_TR_FP_FIELDS_', '_TR_FP_NUMERIC_', '_trSession_',
  // R2B-A2-R5-F5-F1 — the sentinel that distinguishes 'could not read the rules' from 'there are none'.
  '_TR_UNAVAILABLE_',
  '_FC_MONTH_KEYS', 'FC_VIEW_', 'FC_WRITE_', 'FC_MSG_'];

function build(opts) {
  opts = opts || {};
  var src = opts.mutateJs ? opts.mutateJs(JS) : JS;
  var rows = opts.rows === undefined ? CANON : opts.rows;
  var dom = makeDom();
  var S = {
    writes: [], alerts: [], apiCalls: [], dom: dom, saveEnabled: null,
    document: dom.document, console: console, Date: Date, JSON: JSON, Math: Math,
    parseInt: parseInt, parseFloat: parseFloat, isFinite: isFinite, Number: Number,
    String: String, Array: Array, Object: Object, RegExp: RegExp, Error: Error, Promise: Promise
  };
  S.window = {
    KM: {
      DemoData: { isEnabled: function () { return !!opts.demo; } },
      DB: {
        upsertFcTargetRule: function (p) { S.writes.push(p); S.apiCalls.push('upsertFcTargetRule');
          return { then: function (f) { return { catch: function () { return null; } }; } }; }
      }
    }
  };
  S.alert = function (m) { S.alerts.push(String(m)); };
  S.targetRules = [];
  S._fcViewState_ = opts.viewState || 'CURRENT';
  S._fcWriteFlight_ = {}; S._fcWriteState_ = {}; S._fcMeta_ = {};
  S._getDbFcRegularData = function () { S.apiCalls.push('_getDbFcRegularData'); return rows; };
  S._getDemoFcRegularData = function () { return opts.demoRows || []; };
  // R2B-A2-R5-F5-F1 — _trExistingRules_ now reads the read model through _fcGetTargetRules. This suite
  // exercises the cascade, not rule matching, so the model is present and EMPTY: zero rules is a real
  // state that classifies as NEW, which is the behaviour every case here was already written against.
  S._fcReadModel = opts.readModel || { fcTargetRules: [] };
  // A deliberately DIFFERENT label from the value, so any assertion that passes only because the two are
  // the same string would fail here.
  S._fcMarketplaceLabel = function (k) { return k ? k + ' · Store' : ''; };
  S._fcUseDb = function () { return !opts.demo; };
  S._fcEpoch_ = function () { return 1; };
  S._fcSettleWrite_ = function () {}; S._fcFailWrite_ = function () {};
  S._fcAfterWrite = function (f) { f(); };
  S.renderTargetRulesTable = function () {}; S.closeFcModal = function () {}; S.showFcModal = function () {};
  vm.createContext(S);
  var code = TR_VARS.map(function (v) { return extractVar(src, v); })
    .concat(TR_FNS.map(function (f) { return extractFn(src, f); })).join('\n');
  vm.runInContext(code, S);

  // Build the modal from the SHIPPED control census.
  Object.keys(MODAL_CONTROLS).forEach(function (id) {
    var el = dom.El(MODAL_CONTROLS[id]);
    el.id = id;
    if (MODAL_CONTROLS[id] === 'select' && MODAL_SELECT_HTML[id]) el.innerHTML = MODAL_SELECT_HTML[id];
    if (/^target-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/.test(id)) el.value = '100';
  });
  var save = dom.El('button'); save.id = 'fc-target-save-btn';
  var pageYear = dom.El('select'); pageYear.id = 'fc-year-select';
  pageYear.innerHTML = '<option value="">----</option><option value="2026">2026</option>';
  pageYear.value = opts.pageYear === undefined ? '2026' : opts.pageYear;
  S.get = function (id) { return dom.byId[id] || null; };
  S.val = function (id) { var e = dom.byId[id]; return e ? e.value : null; };
  S.opts = function (id) {
    var e = dom.byId[id];
    return e ? e.options.map(function (o) { return String(o.value); }).filter(function (v) { return v !== ''; }) : null;
  };
  S.labels = function (id) {
    var e = dom.byId[id];
    return e ? e.options.map(function (o) { return String(o.textContent === undefined ? o.text : o.textContent); }) : null;
  };
  S.set = function (id, v) { var e = dom.byId[id]; if (e) e.value = v; return e ? e.value : null; };
  S.note = function () { var e = dom.byId['target-scope-note']; return e ? e.textContent : ''; };
  return S;
}

var B = build();
ok(!!B.get('target-country-input'), 'B1 the sandbox mounted the shipped modal controls');
eq(B.opts('target-scope-input'), ['Category', 'Series', 'SKU'], 'B2 Scope carries its fixed vocabulary');

// =================================================================================================
section('C. §7.1-7.6 — THE CASCADE IS THE DATA');
// =================================================================================================
var c1 = build();
c1.openAddTargetRuleModal();
eq(c1.opts('target-year-input'), ['2026', '2025'], 'C1a Year options are the canonical distinct years, newest first');
eq(c1.val('target-year-input'), '2026', 'C1b the page year seeds the modal when it exists canonically');
eq(c1.opts('target-country-input'), ['CA', 'DE', 'JP', 'US'], 'C1c §7.1 Country comes from the canonical rows');
c1.set('target-country-input', 'US'); c1._trOnChange_('country');
eq(c1.opts('target-marketplace-input'), ['Amazon', 'Walmart'], 'C1d §7.1 US offers exactly its canonical marketplaces');

var c2 = build();
c2.openAddTargetRuleModal();
c2.set('target-country-input', 'CA'); c2._trOnChange_('country');
eq(c2.opts('target-marketplace-input'), ['Amazon'], 'C2 §7.2 a different country offers only ITS marketplaces');

var c3 = build();
c3.openAddTargetRuleModal();
c3.set('target-country-input', 'JP'); c3._trOnChange_('country');
eq(c3.opts('target-marketplace-input'), ['Rakuten'],
  'C3a §7.3 a marketplace absent from the old hardcoded list is offered');
ok(c3.opts('target-marketplace-input').indexOf('Amazon') === -1
  && c3.opts('target-marketplace-input').indexOf('Walmart') === -1,
  'C3b §7.3 and the hardcoded ones do NOT survive where the data has none');
ok(c3.opts('target-marketplace-input').indexOf('All') === -1, 'C3c §2 no `All` sentinel is offered');

// §7.4 — a demo array cannot contribute. Demo OFF must ignore the demo source entirely.
var c4 = build({ demoRows: [{ year: '2026', company: 'DEMO', country: 'ZZ', marketplace: 'DemoPlace',
  category: 'Demo Cat', series: 'DEMO1', sku: 'DEMO-1' }] });
c4.openAddTargetRuleModal();
ok(c4.opts('target-country-input').indexOf('ZZ') === -1,
  'C4a §7.4 a demo row cannot reach the option list on the live path', c4.opts('target-country-input'));
eq(c4.opts('target-country-input'), ['CA', 'DE', 'JP', 'US'], 'C4b only canonical countries are offered');

// §7.5 / §7.6 — resets.
var c5 = build();
c5.openAddTargetRuleModal();
c5.set('target-country-input', 'US'); c5._trOnChange_('country');
c5.set('target-marketplace-input', 'Amazon'); c5._trOnChange_('marketplace');
c5.set('target-category-input', 'Silicone Product'); c5._trOnChange_('category');
eq(c5.val('target-category-input'), 'Silicone Product', 'C5a a category was selected under US/Amazon');
c5.set('target-country-input', 'CA'); c5._trOnChange_('country');
eq(c5.val('target-marketplace-input'), 'Amazon',
  'C5b §7.5 CA has one marketplace, so it auto-selects (a single option may auto-select)');
eq(c5.val('target-category-input'), '',
  'C5c §7.5 the stale Silicone Product is gone and CA/Amazon offers two categories, so none auto-selects');
ok(c5.opts('target-category-input').indexOf('Silicone Product') === -1,
  'C5d §7.5 and it is not even offered any more');

var c6 = build();
c6.openAddTargetRuleModal();
c6.set('target-scope-input', 'Series'); c6.updateTargetScopeFields();
c6.set('target-country-input', 'US'); c6._trOnChange_('country');
c6.set('target-marketplace-input', 'Amazon'); c6._trOnChange_('marketplace');
c6.set('target-category-input', 'Electric Can Opener'); c6._trOnChange_('category');
c6.set('target-series-input', 'CO1100'); c6._trOnChange_('series');
eq(c6.val('target-series-input'), 'CO1100', 'C6a a series was selected under US/Amazon');
c6.set('target-marketplace-input', 'Walmart'); c6._trOnChange_('marketplace');
eq(c6.val('target-series-input'), 'CO1150',
  'C6b §7.6 changing marketplace cleared CO1100; Walmart offers only CO1150, which auto-selects');
ok(c6.opts('target-series-input').indexOf('CO1100') === -1,
  'C6c §7.6 CO1100 is not offered under Walmart at all');

// Labels may be friendly; VALUES must be canonical (§4).
var cL = build();
cL.openAddTargetRuleModal();
cL.set('target-country-input', 'US'); cL._trOnChange_('country');
ok(cL.labels('target-marketplace-input').indexOf('Amazon · Store') > -1,
  'C7a the marketplace label is the friendly display name');
eq(cL.opts('target-marketplace-input'), ['Amazon', 'Walmart'],
  'C7b but the VALUES are the canonical keys, never the labels');

// =================================================================================================
section('D. §7.7-7.9 — THE SCOPE DECIDES WHAT IS SENT');
// =================================================================================================
function selectUSAmazon(S, scope) {
  S.openAddTargetRuleModal();
  S.set('target-scope-input', scope); S.updateTargetScopeFields();
  S.set('target-country-input', 'US'); S._trOnChange_('country');
  S.set('target-marketplace-input', 'Amazon'); S._trOnChange_('marketplace');
  S.set('target-category-input', 'Electric Can Opener'); S._trOnChange_('category');
  if (scope === 'Series' || scope === 'SKU') { S.set('target-series-input', 'CO1100'); S._trOnChange_('series'); }
  if (scope === 'SKU') { S.set('target-sku-input', 'CO1100-S'); S._trOnChange_('sku'); }
  return S;
}
function months(S, base) {
  ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function (m, i) {
    S.set('target-' + m, String(base + i));
  });
  S._trApplyGate_();
  return S;
}

var d7 = months(selectUSAmazon(build(), 'Category'), 91);
d7.saveNewTargetRule();
eq(d7.writes.length, 1, 'D7a §7.7 a Category-scope save dispatches one write');
var p7 = d7.writes[0];
eq(p7.scope_type, 'CATEGORY', 'D7b scope_type is the canonical UPPERCASE token (R5-F2)');
eq(p7.scope_id, 'Electric Can Opener', 'D7c scope_id is the category identity');
eq([p7.series, p7.sku], ['', ''], 'D7d §7.7 Category scope sends NO series and NO sku');
eq(p7.category, 'Electric Can Opener', 'D7e and it does send the category');

var d8 = months(selectUSAmazon(build(), 'Series'), 91);
d8.saveNewTargetRule();
var p8 = d8.writes[0];
eq(p8.scope_type, 'SERIES', 'D8a Series scope, canonical uppercase');
eq(p8.scope_id, 'CO1100', 'D8b scope_id is the series identity');
eq([p8.category, p8.series, p8.sku], ['Electric Can Opener', 'CO1100', ''],
  'D8c §7.8 Series scope sends category + series and NO sku');

var d9 = months(selectUSAmazon(build(), 'SKU'), 91);
d9.saveNewTargetRule();
var p9 = d9.writes[0];
eq(p9.scope_type, 'SKU', 'D9a SKU scope, canonical uppercase');
eq(p9.scope_id, 'CO1100-S', 'D9b scope_id is the SKU identity');
eq([p9.category, p9.series, p9.sku], ['Electric Can Opener', 'CO1100', 'CO1100-S'],
  'D9c §7.9 SKU scope sends all three — the old code sent no category at all');

// §5 — a hidden control contributes nothing. Select a SKU, then drop back to Series scope.
var dH = selectUSAmazon(build(), 'SKU');
dH.set('target-scope-input', 'Series'); dH.updateTargetScopeFields();
eq(dH.val('target-sku-input'), '', 'D10a the now-hidden SKU control was emptied, not merely hidden');
eq(dH.opts('target-sku-input'), [], 'D10b it holds no options either');
months(dH, 91).saveNewTargetRule();
eq(dH.writes[0].sku, '', 'D10c §5 and no stale SKU reached the payload');

// =================================================================================================
section('E. §7.10-7.13 — COMPANY, AND WHAT "NO DATA" MEANS');
// =================================================================================================
var e10 = months(selectUSAmazon(build(), 'Category'), 91);
e10.saveNewTargetRule();
eq(e10.writes[0].company, 'ResTW', 'E10a §7.10 a single owner is derived and written');
eq(e10.writes[0].country, 'US', 'E10b and country is written — the old payload carried neither');
eq(e10.writes[0].marketplace, 'Amazon', 'E10c and marketplace');

// §7.11 — DE/Amazon/Manual Opener is owned by TWO companies.
var e11 = build();
e11.openAddTargetRuleModal();
e11.set('target-scope-input', 'Category'); e11.updateTargetScopeFields();
e11.set('target-country-input', 'DE'); e11._trOnChange_('country');
e11.set('target-marketplace-input', 'Amazon'); e11._trOnChange_('marketplace');
e11.set('target-category-input', 'Manual Opener'); e11._trOnChange_('category');
eq(e11._trCompanyResolution_().state, 'AMBIGUOUS', 'E11a §7.11 two owners are reported as ambiguous');
eq(e11._trCompanyResolution_().companies, ['KM-EU', 'ResTW'], 'E11b and both are named');
eq(e11._trGate_().code, 'OWNERSHIP_SCOPE_AMBIGUOUS', 'E11c the gate refuses');
e11.saveNewTargetRule();
eq(e11.writes.length, 0, 'E11d §7.11 and the refusal writes NOTHING');
ok(e11.note().indexOf('KM-EU') > -1 && e11.note().indexOf('ResTW') > -1,
  'E11e the user is told which owners collide, not just that something is wrong');

// ... but narrowing to a SKU resolves it, because one SKU has one owner.
var e11b = build();
e11b.openAddTargetRuleModal();
e11b.set('target-scope-input', 'SKU'); e11b.updateTargetScopeFields();
e11b.set('target-country-input', 'DE'); e11b._trOnChange_('country');
e11b.set('target-marketplace-input', 'Amazon'); e11b._trOnChange_('marketplace');
e11b.set('target-category-input', 'Manual Opener'); e11b._trOnChange_('category');
e11b.set('target-series-input', 'MO5600'); e11b._trOnChange_('series');
e11b.set('target-sku-input', 'MO5600-E'); e11b._trOnChange_('sku');
months(e11b, 91).saveNewTargetRule();
eq(e11b.writes.length, 1, 'E11f narrowing to one SKU resolves the owner and the save proceeds');
eq(e11b.writes[0].company, 'KM-EU', 'E11g with the owner that actually owns that SKU — not the first');

// §7.12 — nothing to select.
var e12 = build({ rows: [] });
e12.openAddTargetRuleModal();
eq(e12.opts('target-country-input'), [], 'E12a no canonical rows means no options');
eq(e12._trGate_().code, 'DATA_UNAVAILABLE', 'E12b §7.12 the gate reports DATA_UNAVAILABLE');
eq(e12.get('fc-target-save-btn').disabled, true, 'E12c §7.12 and Save is disabled');
e12.saveNewTargetRule();
eq(e12.writes.length, 0, 'E12d clicking anyway writes nothing');

// §7.13 — loaded-empty is NOT the same as unreadable.
var e13 = build({ rows: [], viewState: 'REFRESH_REFUSED' });
e13.openAddTargetRuleModal();
eq(e13._trGate_().code, 'DATA_UNREADABLE',
  'E13a §7.13 a refused read is UNREADABLE, distinct from an empty table');
ok(e13.note().indexOf('not an empty database') > -1,
  'E13b and it says so, rather than implying the database is empty');
var e13b = build({ rows: [], viewState: 'REFRESHING' });
e13b.openAddTargetRuleModal();
eq(e13b._trGate_().code, 'DATA_LOADING', 'E13c and an in-flight read is LOADING, distinct from both');
eq(build({ rows: [] })._trDataState_(), 'EMPTY', 'E13d only a settled, genuinely empty read is EMPTY');

// =================================================================================================
section('F. §7.14-7.18 — THE MODAL AND THE WRITE');
// =================================================================================================
var f14 = selectUSAmazon(build(), 'Series');
eq(f14.val('target-series-input'), 'CO1100', 'F14a a series is selected');
f14.closeFcModal(); f14.openAddTargetRuleModal();
eq(f14.opts('target-country-input'), ['CA', 'DE', 'JP', 'US'],
  'F14b §7.14 reopening rebuilds every list from the current model');
ok(f14._trGate_().ok || f14._trGate_().code === 'INCOMPLETE',
  'F14c and the reopened modal is in a coherent state');

var f15 = build();
var before15 = f15.apiCalls.filter(function (c) { return c === 'upsertFcTargetRule'; }).length;
f15.openAddTargetRuleModal();
eq(f15.apiCalls.filter(function (c) { return c === 'upsertFcTargetRule'; }).length - before15, 0,
  'F15a §7.15 opening the modal issues ZERO write requests');
ok(f15.apiCalls.indexOf('_getDbFcRegularData') > -1,
  'F15b it reads the ALREADY-LOADED model instead — that is not a request');
ok(codeOnly(extractFn(JS, 'openAddTargetRuleModal')).indexOf('KM.DB.') === -1,
  'F15c §7.15 and the open path names no DB call at all');

// §7.16 — double Save is one logical write. The guard is the REAL _fcWriteBegin_.
var f16 = months(selectUSAmazon(build(), 'Category'), 91);
f16.saveNewTargetRule();
f16.saveNewTargetRule();
eq(f16.writes.length, 1, 'F16 §7.16 a second click adds ZERO logical writes');

// §7.17 — a client refusal keeps the inputs and leaves Save usable.
var f17 = selectUSAmazon(build(), 'Category');
f17.set('target-jan', 'not-a-number');
f17._trApplyGate_();
eq(f17._trGate_().code, 'MONTH_INVALID', 'F17a an invalid month is refused');
f17.saveNewTargetRule();
eq(f17.writes.length, 0, 'F17b §7.17 with zero writes');
eq(f17.val('target-category-input'), 'Electric Can Opener', 'F17c and every other input is preserved');
f17.set('target-jan', '91'); f17._trApplyGate_();
eq(f17.get('fc-target-save-btn').disabled, false, 'F17d correcting the field re-enables Save');
f17.saveNewTargetRule();
eq(f17.writes.length, 1, 'F17e and the corrected save goes through');

// §7.18 — the page never replays a write by itself.
ok(codeOnly(extractFn(JS, 'saveNewTargetRule')).indexOf('setTimeout') === -1,
  'F18a §7.18 the save path schedules no retry');
ok((codeOnly(extractFn(JS, 'saveNewTargetRule')).match(/upsertFcTargetRule\(/g) || []).length === 1,
  'F18b and dispatches from exactly one place');

// =================================================================================================
section('G. §7.19-7.24 — TWELVE MONTHS, AND WHAT MUST NOT MOVE');
// =================================================================================================
var g19 = months(selectUSAmazon(build(), 'SKU'), 91);
g19.saveNewTargetRule();
var P = g19.writes[0];
eq([P.jan_pct, P.feb_pct, P.mar_pct, P.apr_pct, P.may_pct, P.jun_pct,
    P.jul_pct, P.aug_pct, P.sep_pct, P.oct_pct, P.nov_pct, P.dec_pct],
   [91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102],
   'G19 §7.19 twelve distinct values land in twelve NAMED fields');
// R5-F2 — twelve DIFFERENT months, so the authoring summary is BLANK. It used to be the January alias,
// and procurement and Inventory Replenishment read it in place of a month, so 91 was applied to March.
eq(P.target_percentage, '',
  'G19b target_percentage is blank when the twelve months differ');
var gFlat = selectUSAmazon(build(), 'Category');
['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].forEach(function (m) { gFlat.set('target-' + m, '80'); });
gFlat._trApplyGate_(); gFlat.saveNewTargetRule();
eq(gFlat.writes[0].target_percentage, 80,
  'G19b2 and carries the common value when all twelve agree');
eq(P.year, 2026, 'G19c year is a number, as the server contract expects');

// A deliberate zero must survive. The old reader was `parseInt(v) || 100`.
var g0 = selectUSAmazon(build(), 'Category');
months(g0, 91); g0.set('target-mar', '0'); g0._trApplyGate_();
g0.saveNewTargetRule();
eq(g0.writes[0].mar_pct, 0, 'G19d a deliberate 0% is written as 0, not silently turned into 100');

// §7.20 — the identity written is the identity that can be read back.
eq(Object.keys(P).sort(), ['actor', 'apr_pct', 'aug_pct', 'category', 'company', 'country', 'dec_pct',
  'feb_pct', 'jan_pct', 'jul_pct', 'jun_pct', 'mar_pct', 'marketplace', 'may_pct', 'nov_pct', 'oct_pct',
  'scope_id', 'scope_type', 'sep_pct', 'series', 'sku', 'target_percentage', 'year'],
  'G20a §7.20 the payload carries exactly the canonical field set');
ok(P.scope_id === P.sku, 'G20b and scope_id is recoverable from the scope dimension');
// every canonical key the payload names must exist in the server's header contract
var GS = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
var HEADERS = (function () {
  var a = GS.indexOf('var FC_TARGET_RULES_HEADERS_'), b = GS.indexOf('];', a);
  return (GS.slice(a, b).match(/'([a-z_]+)'/g) || []).map(function (s) { return s.slice(1, -1); });
})();
var unknown = Object.keys(P).filter(function (k) { return k !== 'actor' && HEADERS.indexOf(k) === -1; });
eq(unknown, [], 'G20c every payload field is a real fc_target_rules column', unknown);
['company', 'country'].forEach(function (k, i) {
  ok(HEADERS.indexOf(k) > -1, 'G20d.' + (i + 1) + ' the server header really does carry ' + k);
});

// §7.21 — resize.
ok(/#fc-target-scroll-header > \.header-cell:nth-child\(19\)/.test(CSS),
  'G21a §7.21 the Target table declares 19 columns in CSS');
ok(/_fcResizeCols_\(100, 'Country'\), _fcResizeCols_\(120, 'Marketplace'\)/.test(JS),
  'G21b and the resize controller declares Country before Marketplace');
ok(/noResize: \[19\]/.test(JS), 'G21c Actions is still the one column with no handle');

// §7.22 — Special Event is untouched.
['upsertFcSpecialEvent', 'deleteFcSpecialEvent'].forEach(function (a, i) {
  eq(codeOnly(extractFn(JS, 'saveNewTargetRule')).indexOf(a), -1,
    'G22.' + (i + 1) + ' §7.22 the Target save never names ' + a);
});
ok(codeOnly(extractFn(JS, '_trBuildPayload_')).indexOf('campaign') === -1,
  'G22c and the payload names no campaign field');

// §7.23 / §7.24 — no migration, no broad cache.
['TEMP_migrate', 'TEMP_R2BA2', 'getOperationDb', 'getTable('].forEach(function (a, i) {
  eq(CODE.indexOf(a), -1, 'G23.' + (i + 1) + ' §7.23-7.24 the page never names ' + a);
});

// =================================================================================================
section('H. MUTANTS');
// =================================================================================================
var mutants = [];
function mut(label, fn) { mutants.push({ label: label, correct: fn }); }

// 1 / 2 — a hardcoded marketplace is restored to the markup. The census in section A is what catches it,
// so the mutant is applied to the MARKUP and re-read the way section A reads it.
function markupHas(mutatedModal, needle) { return mutatedModal.indexOf(needle) > -1; }
mut('M1  a hardcoded Amazon <option> is restored to the Marketplace list', function () {
  var m = MODAL.replace('<select id="target-marketplace-input"',
    '<select data-x="1" id="target-marketplace-input"')
    .replace('onchange="_trOnChange_(\'marketplace\')"></select>',
             'onchange="_trOnChange_(\'marketplace\')"><option value="Amazon">Amazon</option></select>');
  if (m === MODAL) throw new Error('M1 mutation did not apply');
  return !markupHas(m, '>Amazon<');      // correct = the literal is absent
});
mut('M2  a hardcoded Walmart <option> is restored', function () {
  var m = MODAL.replace('onchange="_trOnChange_(\'marketplace\')"></select>',
                        'onchange="_trOnChange_(\'marketplace\')"><option value="Walmart">Walmart</option></select>');
  if (m === MODAL) throw new Error('M2 mutation did not apply');
  return !markupHas(m, '>Walmart<');
});
// 3 — country is dropped from the payload.
mut('M3  country is omitted from the payload', function () {
  var S = months(selectUSAmazon(build({ mutateJs: function (js) {
    return swapSrc(js, '    country: g.sel.country,\n', ''); } }), 'Category'), 91);
  S.saveNewTargetRule();
  return !!(S.writes[0] && S.writes[0].country === 'US');
});
// 4 — the first company is silently taken from an ambiguous set.
mut('M4  the first company is silently chosen from an ambiguous set', function () {
  var S = build({ mutateJs: function (js) {
    return swapSrc(js, "  if (comps.length === 1) return { state: 'RESOLVED', companies: comps, company: comps[0] };",
      "  if (comps.length >= 1) return { state: 'RESOLVED', companies: comps, company: comps[0] };"); } });
  S.openAddTargetRuleModal();
  S.set('target-scope-input', 'Category'); S.updateTargetScopeFields();
  S.set('target-country-input', 'DE'); S._trOnChange_('country');
  S.set('target-marketplace-input', 'Amazon'); S._trOnChange_('marketplace');
  S.set('target-category-input', 'Manual Opener'); S._trOnChange_('category');
  months(S, 91); S.saveNewTargetRule();
  return S.writes.length === 0;            // correct = the ambiguous scope is refused
});
// 5 — an upstream change stops clearing downstream values.
// Electric Can Opener / CO1100 exists under BOTH US and CA, so the rebuild's 'still offered' rule alone
// would keep it. Only the clear-downstream guard removes it, which is what this mutant deletes.
function pickUSCascade(S) {
  S.openAddTargetRuleModal();
  S.set('target-scope-input', 'Series'); S.updateTargetScopeFields();
  S.set('target-country-input', 'US'); S._trOnChange_('country');
  S.set('target-marketplace-input', 'Amazon'); S._trOnChange_('marketplace');
  S.set('target-category-input', 'Electric Can Opener'); S._trOnChange_('category');
  S.set('target-series-input', 'CO1100'); S._trOnChange_('series');
  S.set('target-country-input', 'CA'); S._trOnChange_('country');
  return S;
}
mut('M5  changing an upstream selector no longer clears what is below it', function () {
  var S = pickUSCascade(build({ mutateJs: function (js) {
    return swapSrc(js, "      if (el) el.value = '';", "      if (el) { /* not cleared */ }"); } }));
  // correct = switching country dropped the category chosen under the old one, even though CA offers it too
  return S.val('target-category-input') === '';
});
// 6 — a hidden SKU leaks into a Series payload.
// TWO INDEPENDENT GUARDS stop a hidden SKU reaching the payload: the rebuild empties every inactive
// control, and the payload gates each field on the scope. Removing either alone changes nothing, which
// is the point of defence in depth — so each is observed where it alone decides, and M13 removes both.
mut('M6  the rebuild stops emptying controls the scope has deactivated', function () {
  var S = build({ mutateJs: function (js) {
    return swapSrc(js, '    if (dead) { while (dead.firstChild) dead.removeChild(dead.firstChild); dead.value = \'\'; }',
                       '    if (dead) { /* left as it was */ }'); } });
  var T = selectUSAmazon(S, 'SKU');
  T.set('target-scope-input', 'Series'); T.updateTargetScopeFields();
  return T.val('target-sku-input') === '';   // correct = the deactivated control holds nothing
});
mut('M13  BOTH guards are removed, so the hidden SKU reaches the payload', function () {
  var S = build({ mutateJs: function (js) {
    var a = swapSrc(js, '    if (dead) { while (dead.firstChild) dead.removeChild(dead.firstChild); dead.value = \'\'; }',
                        '    if (dead) { /* left as it was */ }');
    return swapSrc(a, "    sku: fields.indexOf('sku') !== -1 ? g.sel.sku : '',", "    sku: g.sel.sku || '',");
  } });
  var T = selectUSAmazon(S, 'SKU');
  T.set('target-scope-input', 'Series'); T.updateTargetScopeFields();
  months(T, 91); T.saveNewTargetRule();
  return !!(T.writes[0] && T.writes[0].sku === '');
});
// 7 — a blank company is accepted. In resolveTargetPct a blank company is a WILDCARD.
mut('M7  a blank company is accepted instead of refusing', function () {
  var S = build({ rows: CANON.map(function (r) {
      return { year: r.year, company: '', country: r.country, marketplace: r.marketplace,
               category: r.category, series: r.series, sku: r.sku }; }),
    mutateJs: function (js) {
      return swapSrc(js, "  if (cr.state !== 'RESOLVED') {",
                         "  if (false) {"); } });
  var T = selectUSAmazon(S, 'Category');
  months(T, 91); T.saveNewTargetRule();
  return T.writes.length === 0;            // correct = no owner, no write
});
// 8 — scope_id is built from the label rather than the canonical value.
mut('M8  scope_id is built from the display label instead of the canonical value', function () {
  var S = build({ mutateJs: function (js) {
    return swapSrc(js, '    scope_id: g.sel[fields[fields.length - 1]],',
                       '    scope_id: _fcMarketplaceLabel(g.sel[fields[fields.length - 1]]),'); } });
  var T = months(selectUSAmazon(S, 'SKU'), 91);
  T.saveNewTargetRule();
  return !!(T.writes[0] && T.writes[0].scope_id === 'CO1100-S');
});
// 9 — a refused read is presented as an empty option list.
mut('M9  a refused read is converted into an empty option list', function () {
  var S = build({ rows: [], viewState: 'REFRESH_REFUSED', mutateJs: function (js) {
    return swapSrc(js, "  if (refused) return 'UNREADABLE';", "  if (false) return 'UNREADABLE';"); } });
  S.openAddTargetRuleModal();
  return S._trGate_().code === 'DATA_UNREADABLE';
});
// 10 — a broad-cache fallback is restored behind the canonical source.
mut('M10  a broad-cache fallback is restored behind the canonical rows', function () {
  var S = build({ rows: [], mutateJs: function (js) {
    return swapSrc(js, '  var rows = demoOn ? _getDemoFcRegularData() : _getDbFcRegularData();',
      '  var rows = demoOn ? _getDemoFcRegularData() : (_getDbFcRegularData().length ? _getDbFcRegularData() : _getDemoFcRegularData());'); },
    demoRows: [{ year: '2026', company: 'DEMO', country: 'ZZ', marketplace: 'DemoPlace',
                 category: 'Demo Cat', series: 'DEMO1', sku: 'DEMO-1' }] });
  S.openAddTargetRuleModal();
  return S.opts('target-country-input').indexOf('ZZ') === -1;
});
// 11 — the duplicate-click guard is removed.
mut('M11  the duplicate-click guard is removed', function () {
  var S = months(selectUSAmazon(build({ mutateJs: function (js) {
    return swapSrc(js, "  if (!_fcWriteBegin_('targetRule')) return;", "  _fcWriteBegin_('targetRule');"); } }),
    'Category'), 91);
  S.saveNewTargetRule(); S.saveNewTargetRule();
  return S.writes.length === 1;
});
// 12 — monthly fields are written positionally.
mut('M12  the monthly fields are written positionally instead of by name', function () {
  var S = months(selectUSAmazon(build({ mutateJs: function (js) {
    return swapSrc(js, "  _FC_MONTH_KEYS.forEach(function (m) { payload[m + '_pct'] = g.months[m]; });",
      "  _FC_MONTH_KEYS.forEach(function (m, i) { payload[_FC_MONTH_KEYS[(i + 1) % 12] + '_pct'] = g.months[m]; });"); } }),
    'Category'), 91);
  S.saveNewTargetRule();
  return !!(S.writes[0] && S.writes[0].jan_pct === 91 && S.writes[0].dec_pct === 102);
});

var caught = 0, survived = [];
mutants.forEach(function (m) {
  var correct;
  try { correct = !!m.correct(); }
  catch (e) { correct = false; console.error('   (' + m.label + ' threw: ' + e.message + ')'); }
  // The predicate answers "did the CORRECT behaviour hold". Under a mutant it must not.
  if (!correct) { caught++; console.log('ok   ' + m.label + ' (caught)'); }
  else { survived.push(m.label); console.error('FAIL ' + m.label + ' — MUTANT SURVIVED'); fail++; }
});

// =================================================================================================
section('I. VACUITY — every mutant must be vacuous-free, and the suite must be able to fail');
// =================================================================================================
// Each predicate is re-run UNMUTATED. If it still answers "not correct", it was never testing the mutation.
var vacuous = [];
[['M3', function () { var S = months(selectUSAmazon(build(), 'Category'), 91); S.saveNewTargetRule();
    return !!(S.writes[0] && S.writes[0].country === 'US'); }],
 ['M4', function () { var S = build(); S.openAddTargetRuleModal();
    S.set('target-scope-input', 'Category'); S.updateTargetScopeFields();
    S.set('target-country-input', 'DE'); S._trOnChange_('country');
    S.set('target-marketplace-input', 'Amazon'); S._trOnChange_('marketplace');
    S.set('target-category-input', 'Manual Opener'); S._trOnChange_('category');
    months(S, 91); S.saveNewTargetRule(); return S.writes.length === 0; }],
 ['M5', function () { return pickUSCascade(build()).val('target-category-input') === ''; }],
 ['M6', function () { var T = selectUSAmazon(build(), 'SKU');
    T.set('target-scope-input', 'Series'); T.updateTargetScopeFields();
    return T.val('target-sku-input') === ''; }],
 ['M13', function () { var T = selectUSAmazon(build(), 'SKU');
    T.set('target-scope-input', 'Series'); T.updateTargetScopeFields();
    months(T, 91); T.saveNewTargetRule(); return !!(T.writes[0] && T.writes[0].sku === ''); }],
 ['M8', function () { var T = months(selectUSAmazon(build(), 'SKU'), 91); T.saveNewTargetRule();
    return !!(T.writes[0] && T.writes[0].scope_id === 'CO1100-S'); }],
 ['M9', function () { var S = build({ rows: [], viewState: 'REFRESH_REFUSED' }); S.openAddTargetRuleModal();
    return S._trGate_().code === 'DATA_UNREADABLE'; }],
 ['M10', function () { var S = build({ rows: [], demoRows: [{ year: '2026', country: 'ZZ' }] });
    S.openAddTargetRuleModal(); return S.opts('target-country-input').indexOf('ZZ') === -1; }],
 ['M11', function () { var S = months(selectUSAmazon(build(), 'Category'), 91);
    S.saveNewTargetRule(); S.saveNewTargetRule(); return S.writes.length === 1; }],
 ['M12', function () { var S = months(selectUSAmazon(build(), 'Category'), 91); S.saveNewTargetRule();
    return !!(S.writes[0] && S.writes[0].jan_pct === 91 && S.writes[0].dec_pct === 102); }]
].forEach(function (p) {
  var held;
  try { held = !!p[1](); } catch (e) { held = false; }
  if (!held) vacuous.push(p[0]);
});
eq(vacuous, [], 'I1 every mutant predicate holds on the UNMUTATED source — none is vacuous', vacuous);

// The suite must be able to observe a broken cascade at all.
var probe = build({ mutateJs: function (js) {
  return swapSrc(js, '    var opts = _trDistinct_(rows, dim);', '    var opts = [];'); } });
probe.openAddTargetRuleModal();
eq(probe.opts('target-country-input'), [],
  'I2 positive control — with the option builder neutered the lists really do go empty');
var i3 = build(); i3.openAddTargetRuleModal();
eq(i3.opts('target-country-input'), ['CA', 'DE', 'JP', 'US'],
  'I3 and they are NOT empty on the shipped source, so I2 proves something');

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants.length + ' mutants, ' + survived.length + ' survived, '
  + (vacuous.length === 0 ? 'vacuity clean' : 'VACUOUS: ' + vacuous.join(',')));
console.log(new Array(101).join('='));
process.exit(fail === 0 ? 0 : 1);
