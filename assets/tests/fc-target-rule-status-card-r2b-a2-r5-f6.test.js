// Kitchen Mama Operation System — FC-SUMMARY-R2B-A2-R5-F6
// ONE STATUS CARD, NOT TWO MESSAGE BARS
// Run: node assets/tests/fc-target-rule-status-card-r2b-a2-r5-f6.test.js
//
// LOCAL / FAKE-ONLY. No network, no DB, no Apps Script runtime, no writes.
//
// WHAT THIS ROUND CHANGED, AND WHAT IT MUST NOT HAVE.
//
// R5 added a scope note; F5 added a mode note. For the state that matters most they said the same thing
// twice, stacked:
//
//     Existing rule — Update  ·  no change yet. Edit a month to enable Save.
//     Existing rule — Update  ·  fc_target_rules-B56D730F-138
//
// Two bars for one fact, with a database key as the loudest text in the modal. F6 replaces both with one
// card: a title for what the rule IS, a state line for what is true now, and the identity as quiet
// metadata underneath.
//
// This is a PRESENTATION round. The card decides nothing: classification, hydration, the version token,
// the receipt merge and Save enablement are all read, never influenced. Half of this suite is therefore
// about what did NOT move — driven through the same real chain the seam suite uses, because a visual
// round that quietly changed behaviour would be the worst possible outcome of a polish commit.

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var REPO = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO, rel), 'utf8'); }

var FCS = read('assets/js/pages/fc-summary.js');
var API = read('assets/js/api/operation-system-db-api.js');
var HTML = read('assets/html/pages/fc-summary.html');
var CSS = read('assets/css/pages/fc-overview.css');

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; } else { fail++; console.error('FAIL  ' + l + (d === undefined ? '' : '\n   got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; } else { fail++; console.error('FAIL  ' + l + '\n   expected ' + E + '\n   actual   ' + A); }
}
function section(n) { console.log('\n-- ' + n + ' ' + new Array(Math.max(2, 100 - n.length)).join('-')); }

// ------------------------------------------------------------------ extraction ------------------
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
function assignFnSrc(src, dotted) {
  var m = new RegExp('(?:^|\\n)' + dotted.replace(/\./g, '\\.') + '\\s*=\\s*function').exec(src);
  if (!m) throw new Error('assignment not found: ' + dotted);
  var start = src.indexOf(dotted, m.index);
  return src.slice(start, scanTo(src, src.indexOf('{', src.indexOf(')', start)), false)) + ';';
}

// ------------------------------------------------------------------ fixtures --------------------
// The two ACTUAL production rows.
var ROW_SERIES = {
  target_rule_id: 'fc_target_rules-B56D730F-138', scope: 'SERIES', year: 2026, company: 'ResUS',
  marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: '',
  jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100, may_pct: 100, jun_pct: 100,
  jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 100, nov_pct: 100, dec_pct: 110,
  created_by: 'fc-summary', created_at: '2026-09-19T08:41:43.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:44:47.000Z', note: '',
  scope_type: 'SERIES', scope_id: 'CO1100', target_percentage: ''
};
var ROW_SKU = {
  target_rule_id: 'fc_target_rules-0E0E2EFC-9FF', scope: 'SKU', year: 2026, company: 'ResUS',
  marketplace: 'Amazon', country: 'US', category: 'Electric Can Opener', series: 'CO1100', sku: 'CO1100-R',
  jan_pct: 110, feb_pct: 105, mar_pct: 100, apr_pct: 100, may_pct: 100, jun_pct: 100,
  jul_pct: 100, aug_pct: 100, sep_pct: 100, oct_pct: 150, nov_pct: 100, dec_pct: 110,
  created_by: 'fc-summary', created_at: '2026-09-19T08:45:49.000Z',
  updated_by: 'fc-summary', updated_at: '2026-09-19T08:45:49.000Z', note: '',
  scope_type: 'SKU', scope_id: 'CO1100-R', target_percentage: ''
};
function fcRow(sku, extra) {
  var r = { forecast_id: 'FC-' + sku, year: 2026, company: 'ResUS', country: 'US', marketplace: 'Amazon',
            sku: sku, category: 'Electric Can Opener', series: 'CO1100',
            jan: 10, feb: 10, mar: 10, apr: 10, may: 10, jun: 10, jul: 10, aug: 10, sep: 10,
            oct: 10, nov: 10, dec: 10, forecast_status: 'active', fc_share: '' };
  if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
var FORECAST = [fcRow('CO1100-R'), fcRow('CO1100-B')];
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ------------------------------------------------------------------ the world ------------------
function makeDom(controls) {
  var els = {};
  Object.keys(controls).forEach(function (id) {
    var el = { _v: String(controls[id]), placeholder: '', textContent: '', className: '',
               style: {}, disabled: false, hidden: false,
               removeChild: function () {}, appendChild: function () {} };
    Object.defineProperty(el, 'value', {
      get: function () { return this._v; },
      set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); },
      enumerable: true
    });
    els[id] = el;
  });
  return { getElementById: function (id) { return els[id] || null; }, _els: els };
}

function world(rules, sel, months) {
  var controls = {
    'target-year-input': sel.year === undefined ? '2026' : sel.year,
    'target-country-input': sel.country === undefined ? 'US' : sel.country,
    'target-marketplace-input': sel.marketplace === undefined ? 'Amazon' : sel.marketplace,
    'target-scope-input': sel.scope === undefined ? 'SERIES' : sel.scope,
    'target-category-input': sel.category === undefined ? 'Electric Can Opener' : sel.category,
    'target-series-input': sel.series === undefined ? 'CO1100' : sel.series,
    'target-sku-input': sel.sku === undefined ? '' : sel.sku,
    'target-base-pct-input': '',
    'target-status-card': '', 'target-status-icon': '', 'target-status-title': '',
    'target-status-state': '', 'target-status-meta': '', 'target-load-latest-btn': '',
    'fc-target-save-btn': ''
  };
  MONTHS.forEach(function (m) { controls['target-' + m] = (months && months[m] !== undefined) ? months[m] : 100; });
  var dom = makeDom(controls);
  var win = { KM: { DB: {} } };
  var saveEnabled = [];
  var ctx = vm.createContext({ document: dom, console: console, window: win });

  vm.runInContext([
    fnSrc(API, 'normalizeFcTargetRuleRecord'), fnSrc(API, 'normalizeFcRegularForecastRecord'),
    fnSrc(API, 'normalizeFcSpecialEventRecord'), fnSrc(API, 'normalizeMarketplaceRecord'),
    'window.KM = window.KM || {}; window.KM.DB = window.KM.DB || {};',
    assignFnSrc(API, 'window.KM.DB.adaptFcSummaryWorkspace')
  ].join('\n'), ctx);
  ctx.__PAYLOAD__ = { fcRegularForecast: FORECAST, fcSpecialEvents: [], fcTargetRules: rules,
                      marketplaces: [{ marketplace_id: 'M1', company: 'ResUS', country: 'US', marketplace: 'Amazon' }] };
  vm.runInContext('var _fcReadModel = window.KM.DB.adaptFcSummaryWorkspace(__PAYLOAD__);', ctx);

  vm.runInContext([
    varSrc(FCS, '_TR_ORDER_'), varSrc(FCS, '_TR_CTL_'), varSrc(FCS, '_TR_LABEL_'),
    varSrc(FCS, '_TR_SCOPES_'), varSrc(FCS, '_TR_SCOPE_FIELDS_'),
    varSrc(FCS, '_TR_FP_MONTHS_'), varSrc(FCS, '_TR_FP_FIELDS_'), varSrc(FCS, '_TR_FP_NUMERIC_'),
    varSrc(FCS, '_FC_MONTH_KEYS'), varSrc(FCS, '_trSession_'), varSrc(FCS, '_TR_UNAVAILABLE_'),
    varSrc(FCS, '_TR_STATUS_SCOPE_LABEL_'),
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
    fnSrc(FCS, '_trStatusIdentity_'), fnSrc(FCS, '_trRenderStatus_'), fnSrc(FCS, '_trStatusMessage_'),
    fnSrc(FCS, '_trGate_'), fnSrc(FCS, '_trApplyGate_'), fnSrc(FCS, '_trBuildPayload_'),
    fnSrc(FCS, '_trNormalizeCanonical_'), fnSrc(FCS, '_trMergeReceipt_'),
    fnSrc(FCS, '_fcGetTargetRules'), fnSrc(FCS, '_fcGetRegularForecast'),
    fnSrc(FCS, '_getDbTargetRules'), fnSrc(FCS, '_getDbFcRegularData'), fnSrc(FCS, '_fcUseDb'),
    'function _fcMarketplaceLabel(m) { return String(m) + " Store"; }',
    'var __SAVE__ = [];',
    'function _fcSetTargetSaveEnabled_(on) { __SAVE__.push(!!on); }'
  ].join('\n'), ctx);
  return { ctx: ctx, dom: dom, win: win, saveEnabled: saveEnabled };
}
function run(w, e) { return vm.runInContext(e, w.ctx); }
function card(w) {
  return {
    cls: w.dom._els['target-status-card'].className,
    display: w.dom._els['target-status-card'].style.display,
    icon: w.dom._els['target-status-icon'].textContent,
    title: w.dom._els['target-status-title'].textContent,
    state: w.dom._els['target-status-state'].textContent,
    meta: w.dom._els['target-status-meta'].textContent
  };
}
function render(w) { run(w, '_trSyncSession_(); _trApplyGate_();'); return card(w); }
function saveOn(w) { return run(w, '__SAVE__[__SAVE__.length - 1]'); }

var SEL_SERIES = { scope: 'SERIES', series: 'CO1100', sku: '' };
var SEL_SKU = { scope: 'SKU', series: 'CO1100', sku: 'CO1100-R' };
var RULES = [ROW_SERIES, ROW_SKU];

// ================================================================================================
section('A. ONE COMPONENT — the two bars are gone from markup, styling and code');
// ================================================================================================
ok(/id="target-status-card"/.test(HTML), 'A1  the modal carries the status card');
ok(/id="target-status-title"/.test(HTML) && /id="target-status-state"/.test(HTML)
  && /id="target-status-meta"/.test(HTML), 'A2  with a title, a state line and metadata');
ok(!/id="target-mode-note"/.test(HTML), 'A3  and the mode bar is gone from the markup');
ok(!/id="target-scope-note"/.test(HTML), 'A4  and so is the scope bar');
ok(!/getElementById\('target-mode-note'\)/.test(FCS), 'A5  no code writes to the retired mode bar');
ok(!/getElementById\('target-scope-note'\)/.test(FCS), 'A6  nor to the retired scope bar');
// Exactly one card element, so "one status component" is a fact about the markup, not a hope.
eq((HTML.match(/id="target-status-card"/g) || []).length, 1, 'A7  exactly one status card in the modal');
eq((HTML.match(/class="fc-target-status"/g) || []).length, 1, 'A7a and one element carrying its class');
ok(/role="status"/.test(HTML) && /aria-live="polite"/.test(HTML),
  'A8  it is a polite live region — the mode change is announced without stealing focus mid-edit');
ok(/aria-hidden="true"/.test(HTML), 'A8a and the decorative icon is hidden from assistive tech');

// ================================================================================================
section('B. EXISTING — loaded, not warned about');
// ================================================================================================
var wB = world(RULES, SEL_SERIES);
var cB = render(wB);
eq(cB.title, 'Existing rule loaded', 'B1  the title says what the rule IS');
eq(cB.state, 'No changes yet. Edit a monthly value to enable Save.', 'B2  and the state says what is true now');
ok(cB.cls.indexOf('is-existing') > -1, 'B3  styled as the existing state', cB.cls);
ok(cB.cls.indexOf('is-duplicate') === -1 && cB.cls.indexOf('is-unavailable') === -1,
  'B3a and NOT as a refusal — an ordinary load is not a warning', cB.cls);
// The rule id is present but demoted: it is in the metadata line, not the title and not the state.
ok(cB.meta.indexOf('fc_target_rules-B56D730F-138') > -1, 'B4  the rule id is in the metadata', cB.meta);
ok(cB.title.indexOf('fc_target_rules') === -1 && cB.state.indexOf('fc_target_rules') === -1,
  'B4a and NOT in the title or the state line — it is how you confirm which row, not the message');
ok(cB.meta.indexOf('SERIES') > -1, 'B5  the scope badge is shown', cB.meta);
ok(cB.meta.indexOf('CO1100') > -1, 'B5a and the selected identity', cB.meta);
eq(saveOn(wB), false, 'B6  Save is disabled while unchanged — unchanged by this round');

// ================================================================================================
section('C. DIRTY — a state of the same rule, not a different rule');
// ================================================================================================
var wC = world(RULES, SEL_SKU);
render(wC);
var cClean = card(wC);
wC.dom._els['target-oct'].value = 160;
var cDirty = render(wC);
eq(cDirty.title, cClean.title, 'C1  the title holds still — the card does not change subject when you type');
eq(cDirty.state, 'Unsaved changes', 'C2  the state becomes Unsaved changes');
ok(cDirty.cls.indexOf('is-dirty') > -1, 'C3  with a dirty marker', cDirty.cls);
ok(cDirty.cls.indexOf('is-existing') > -1, 'C3a still the existing state', cDirty.cls);
eq(saveOn(wC), true, 'C4  and Save is enabled by the existing authority');
wC.dom._els['target-oct'].value = 150;
var cBack = render(wC);
eq(cBack.state, 'No changes yet. Edit a monthly value to enable Save.', 'C5  reverting restores the clean state');
ok(cBack.cls.indexOf('is-dirty') === -1, 'C5a and drops the dirty marker', cBack.cls);
eq(saveOn(wC), false, 'C6  and disables Save again');

// ================================================================================================
section('D. NEW — informational, and never a technical id');
// ================================================================================================
var wD = world(RULES, { scope: 'SKU', series: 'CO1100', sku: 'CO1100-B' });
var cD = render(wD);
eq(cD.title, 'New rule', 'D1  the title');
eq(cD.state, 'No saved rule exists for this selection. Monthly values start at 100%.', 'D2  and the copy');
ok(cD.cls.indexOf('is-new') > -1, 'D3  neutral informational styling', cD.cls);
ok(cD.cls.indexOf('is-duplicate') === -1 && cD.cls.indexOf('is-unavailable') === -1,
  'D3a not a refusal style', cD.cls);
ok(cD.meta.indexOf('fc_target_rules') === -1, 'D4  and no technical id — there is no rule to name', cD.meta);
eq(saveOn(wD), true, 'D5  a complete new identity may still be saved');

// ================================================================================================
section('E. DUPLICATE — destructive, with the ids as secondary detail');
// ================================================================================================
var DUP = JSON.parse(JSON.stringify(ROW_SERIES));
DUP.target_rule_id = 'fc_target_rules-DUPLICATE-001';
var wE = world([ROW_SERIES, DUP, ROW_SKU], SEL_SERIES);
var cE = render(wE);
eq(cE.title, 'Duplicate rules for this identity', 'E1  the title names the problem in words');
ok(cE.state.indexOf('2 saved rules share this identity') > -1, 'E2  the state explains it', cE.state);
ok(cE.state.indexOf('Save is disabled') > -1, 'E2a and says Save is disabled', cE.state);
ok(cE.cls.indexOf('is-duplicate') > -1, 'E3  destructive styling', cE.cls);
ok(cE.meta.indexOf('fc_target_rules-B56D730F-138') > -1
  && cE.meta.indexOf('fc_target_rules-DUPLICATE-001') > -1,
  'E4  BOTH conflicting ids are shown, as secondary technical detail', cE.meta);
ok(cE.title.indexOf('fc_target_rules') === -1, 'E4a and not in the title');
eq(saveOn(wE), false, 'E5  Save disabled');

// ================================================================================================
section('F. UNAVAILABLE — a warning that cannot be mistaken for NEW');
// ================================================================================================
var wF = world(RULES, SEL_SERIES);
run(wF, 'delete _fcReadModel.fcTargetRules[0].raw;');
var cF = render(wF);
eq(cF.title, 'Saved rules could not be verified', 'F1  the title');
ok(cF.state.indexOf('Save is disabled') > -1, 'F2  the state says Save is disabled', cF.state);
ok(cF.state.indexOf('blank') > -1, 'F2a and that the months are left blank', cF.state);
ok(cF.cls.indexOf('is-unavailable') > -1, 'F3  warning styling', cF.cls);
ok(cF.cls.indexOf('is-new') === -1, 'F4  and NOT the new-rule styling — the whole hazard is looking like NEW', cF.cls);
ok(cF.title !== 'New rule', 'F4a nor the new-rule title');
eq(saveOn(wF), false, 'F5  Save disabled');
eq(wF.dom._els['target-jan'].value, '', 'F6  and the months really are blank, not 100');

// ================================================================================================
section('G. INCOMPLETE — no card rather than an empty box');
// ================================================================================================
var wG = world(RULES, { scope: 'SERIES', series: '', sku: '' });
var cG = render(wG);
ok(cG.state !== '', 'G1  an incomplete selection says which dimension is missing', cG.state);
ok(cG.cls.indexOf('is-incomplete') > -1, 'G1a and is styled as incomplete, not as a refusal', cG.cls);
ok(cG.meta.indexOf('fc_target_rules') === -1,
  'G1b and carries no rule id — nothing is loaded, so naming a row would be a lie', cG.meta);
eq(saveOn(wG), false, 'G2  Save disabled');

// ================================================================================================
section('H. BEHAVIOUR DID NOT MOVE — the seam, the key, the months, the token');
// ================================================================================================
var wH = world(RULES, SEL_SERIES);
render(wH);
eq(run(wH, '_trClassify_(_trSel_(), "ResUS").key'), '2026|RESUS|US|AMAZON|SERIES|CO1100',
  'H1  the canonical business key is unchanged');
eq(run(wH, '_trExistingRules_().length'), 2, 'H2  the seam still yields canonical rows');
ok(run(wH, '_trExistingRules_()[0].scope_type === "SERIES"'), 'H2a carrying scope_type');
eq(run(wH, '_trSession_.id'), 'fc_target_rules-B56D730F-138', 'H3  SERIES still binds to its rule');
eq(MONTHS.map(function (m) { return wH.dom._els['target-' + m].value; }),
  ['110', '105', '100', '100', '100', '100', '100', '100', '100', '100', '100', '110'],
  'H4  SERIES hydration is byte-identical to before the polish');
var wH2 = world(RULES, SEL_SKU);
render(wH2);
eq(wH2.dom._els['target-oct'].value, '150', 'H5  SKU October is still 150');
eq(wH2.dom._els['target-base-pct-input'].value, '', 'H6  apply-to-all still blank for a mixed rule');
eq(wH2.dom._els['target-base-pct-input'].placeholder, 'mixed', 'H6a and still says mixed');
// the version token and the payload
wH2.dom._els['target-oct'].value = 160;
var payH = run(wH2, '_trBuildPayload_(_trGate_())');
eq(payH.target_rule_id, 'fc_target_rules-0E0E2EFC-9FF', 'H7  the payload still names the row');
eq(payH.expected_row_version, run(wH2, '_trFingerprint_(_trExistingRules_()[1])'),
  'H8  and still carries the canonical fingerprint as the version');
ok(payH.expected_row_version.indexOf('2026-09-19') === -1, 'H8a updated_at is still not the version');
// the receipt merge
var wH3 = world(RULES, SEL_SERIES);
var R = JSON.parse(JSON.stringify(ROW_SERIES)); R.dec_pct = 115;
wH3.ctx.__R__ = R;
eq(run(wH3, '_trMergeReceipt_(__R__)'), true, 'H9  the receipt still merges');
eq(run(wH3, '_fcReadModel.fcTargetRules.length'), 2, 'H9a and two rows stay two rows');
eq(run(wH3, '_getDbTargetRules()[0].percentages.dec'), 115, 'H9b with the saved value visible at once');

// ================================================================================================
section('I. STYLING — the card is styled, bounded, and calm where it should be');
// ================================================================================================
ok(/\.fc-target-status\s*\{/.test(CSS), 'I1  the card has a ruleset');
// is-dirty is a COMPOUND selector — .fc-target-status.is-existing.is-dirty — because dirty is a state
// OF the loaded rule, never a state on its own. Matching it anywhere in a card selector says what is
// meant: this class is styled, not silent.
['is-existing', 'is-dirty', 'is-new', 'is-duplicate', 'is-unavailable', 'is-incomplete'].forEach(function (c, i) {
  ok(new RegExp('\\.fc-target-status[\\w.-]*\\.' + c).test(CSS), 'I2.' + (i + 1) + '  ' + c + ' is styled, not silent');
});
// A long rule id must wrap inside the card instead of widening the modal. Both halves are needed:
// the wrap rule, and min-width:0 on the flex child, without which a flex item refuses to shrink.
var body = /\.fc-target-status-body\s*\{([^}]*)\}/.exec(CSS);
ok(body && /min-width:\s*0/.test(body[1]), 'I3  the card body may shrink below its content width', body && body[1]);
var meta = /\.fc-target-status-meta\s*\{([^}]*)\}/.exec(CSS);
ok(meta && /overflow-wrap:\s*anywhere|word-break:\s*break-word/.test(meta[1]),
  'I3a and a long rule id wraps rather than overflowing', meta && meta[1]);
// No animation was added; the repo's reduced-motion policy needs nothing new to respect.
var cardBlock = /\.fc-target-status\s*\{([^}]*)\}/.exec(CSS)[1];
ok(!/animation|transition/.test(cardBlock), 'I4  the card animates nothing', cardBlock);
// The existing state must not be painted as a warning.
var ex = /\.fc-target-status\.is-existing\s*\{([^}]*)\}/.exec(CSS)[1];
ok(!/#c62828|#ef6c00|#e65100/.test(ex), 'I5  the loaded state uses no red or warning orange', ex);
ok(/#0277bd|rgba\(2,\s*119,\s*189/.test(ex), 'I5a it is the calm blue', ex);
var dup = /\.fc-target-status\.is-duplicate\s*\{([^}]*)\}/.exec(CSS)[1];
ok(/#c62828|rgba\(198,\s*40,\s*40/.test(dup), 'I6  and the duplicate refusal IS red', dup);
// The month grid and the buttons were not touched by this round.
ok(!/fc-target-status/.test(CSS.slice(0, CSS.indexOf('.fc-target-status'))),
  'I7  the card rules are introduced once, in one place');

// ================================================================================================
section('J. MUTANTS');
// ================================================================================================
var mutants = 0, survived = 0;
function mutant(label, probe) {
  mutants++;
  var caught = false;
  try { caught = !probe(); } catch (e) { caught = true; }
  if (caught) console.log('  caught: ' + label);
  else { survived++; fail++; console.error('SURVIVED: ' + label); }
}
// Each mutant is applied to the SHIPPED source text and the world rebuilt from it.
// `after` runs BEFORE the first render (to break the read model); `edit` runs AFTER it, which is the
// only way to make a loaded rule dirty — setting a month at construction is undone by hydration.
function mutatedCard(mutate, rules, sel, months, after, edit) {
  var saved = FCS;
  FCS = mutate(FCS);
  try {
    var w = world(rules, sel, months);
    if (after) after(w);
    var c = render(w);
    if (edit) { edit(w); c = render(w); }
    return { card: c, w: w };
  } finally { FCS = saved; }
}
mutant('M1  the existing state is painted as a refusal', function () {
  var r = mutatedCard(function (s) { return s.replace("card.className = 'fc-target-status is-existing'", "card.className = 'fc-target-status is-duplicate'"); }, RULES, SEL_SERIES);
  return r.card.cls.indexOf('is-existing') > -1 && r.card.cls.indexOf('is-duplicate') === -1;
});
mutant('M2  the rule id is promoted into the title', function () {
  var r = mutatedCard(function (s) { return s.replace("put(title, 'Existing rule loaded');", "put(title, 'Existing rule loaded ' + _trSession_.id);"); }, RULES, SEL_SERIES);
  return r.card.title.indexOf('fc_target_rules') === -1;
});
mutant('M3  DATA_UNAVAILABLE is dressed as a new rule', function () {
  var r = mutatedCard(function (s) { return s.replace("card.className = 'fc-target-status is-unavailable';", "card.className = 'fc-target-status is-new';"); },
    RULES, SEL_SERIES, null, function (w) { run(w, 'delete _fcReadModel.fcTargetRules[0].raw;'); });
  return r.card.cls.indexOf('is-unavailable') > -1;
});
mutant('M4  the duplicate ids stop being shown', function () {
  var r = mutatedCard(function (s) { return s.replace("put(meta, bits.concat([cls.matches.map(function (r) { return r.target_rule_id; }).join(', ')]).join('  ·  '));", "put(meta, bits.join('  ·  '));"); },
    [ROW_SERIES, DUP, ROW_SKU], SEL_SERIES);
  return r.card.meta.indexOf('fc_target_rules-DUPLICATE-001') > -1;
});
mutant('M5  the dirty state renames the rule', function () {
  var r = mutatedCard(function (s) { return s.replace("put(title, 'Existing rule loaded');", "put(title, dirty ? 'Different rule' : 'Existing rule loaded');"); },
    RULES, SEL_SKU, null, null, function (w) { w.dom._els['target-oct'].value = 160; });
  return r.card.title === 'Existing rule loaded' && r.card.state === 'Unsaved changes';
});
mutant('M6  the card starts deciding whether Save is enabled', function () {
  var r = mutatedCard(function (s) { return s.replace("if (typeof _fcSetTargetSaveEnabled_ === 'function') _fcSetTargetSaveEnabled_(!!g.ok);", "if (typeof _fcSetTargetSaveEnabled_ === 'function') _fcSetTargetSaveEnabled_(true);"); },
    RULES, SEL_SERIES);
  return saveOn(r.w) === false;
});
mutant('M7  the unavailable state stops blanking the months', function () {
  var r = mutatedCard(function (s) { return s.replace("    _trBlankMonths_();", "    _trResetToNew_();"); },
    RULES, SEL_SERIES, null, function (w) { run(w, 'delete _fcReadModel.fcTargetRules[0].raw;'); });
  return r.w.dom._els['target-jan'].value === '';
});
// M8 has been retargeted twice, and the reason is worth recording rather than hiding. The first
// version mutated the hide-the-card branch — which could not run at all, so the mutation changed
// nothing. The second aimed at stale metadata under an incomplete selection, but _trSyncSession_
// already clears the session the moment the identity key changes, so the rule id is gone before the
// card renders and the hazard cannot occur. Two unkillable mutants in a row is a signal that the
// mutation is describing a risk the design has already removed, not that the guard is missing.
//
// What the incomplete state genuinely owes the user is the gate's instruction. A title asking for a
// scope, with no line saying WHICH dimension is missing, is a dead end.
mutant('M8  the incomplete card stops saying which dimension is missing', function () {
  var r = mutatedCard(function (s) { return s.replace("  put(state, refused ? refused.text : '');", "  put(state, '');"); },
    RULES, { scope: 'SERIES', series: '', sku: '' });
  return r.card.state !== '';
});

// ================================================================================================
section('K. VACUITY');
// ================================================================================================
ok(FCS.indexOf('_trRenderStatus_') > -1, 'V1  the renderer under test exists in the shipped page');
ok(CSS.indexOf('.fc-target-status') > -1, 'V2  and the card is styled in the shipped CSS');
eq(ROW_SKU.oct_pct, 150, 'V3  the SKU fixture really carries the October value asserted in H5');
ok(card(world(RULES, SEL_SERIES)).title === '', 'V4  a freshly built world has an EMPTY card — the assertions above are rendering, not fixtures');

// ================================================================================================
console.log('\n' + new Array(101).join('='));
console.log((fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived, vacuity clean');
console.log(new Array(101).join('='));
process.exit(fail === 0 ? 0 : 1);
