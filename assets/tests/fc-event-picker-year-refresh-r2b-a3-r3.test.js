// Kitchen Mama Operation System — FC-SUMMARY-R2B-A3-R3
// THE EXISTING-EVENT PICKER FOLLOWS THE TARGET YEAR, AND THE RELEASE TOKEN FOLLOWS THE BYTES
//
// THE LIVE DEFECT THIS LOCKS SHUT. A3-R1 gave the Special Event Builder a picker that lists the events
// already persisted in the selected scope AND YEAR, so an operator edits an existing window instead of
// composing a second one over it. `_evtExistingEvents_()` filters by `event-target-year` — but nothing
// was bound to that control, and `_evtPopulateExistingSelect()` was called from exactly two places:
// builder open, and scope change. Measured live on the deployed build, 17 of 17 clean attempts:
//
//     pickerAfterScope    = 2      ← the 2026 BFCM event is listed
//     pickerAfterYearOnly = 1      ← change the YEAR alone and it is not
//
// The Builder opens on next year, where production holds no event. An operator who corrects the year to
// 2026 still saw only "+ New event" and would compose a new event for a window that already exists. The
// server refused it with zero writes, so no data was ever at risk — the WORKFLOW was broken, and the
// operator was shown "no existing event" when the truth was "none for a year you cannot see me filter on".
//
// THE SECOND BLOCKER. b664895 changed production frontend bytes (operation-system-db-api.js) without
// rotating the application cache token. index.html served that file under the A3-R1 token, which had
// already been published, so a returning browser would keep its cached copy — the one population the
// transport repair exists for. _release-order.js records the rule this violates in its own history:
// "A token may only be reused while nothing carrying it has been published."
//
// HOW IT IS PROVED. The binding is not asserted by eyeballing the attribute: the `onchange` expression is
// PARSED OUT of fc-summary.html and EVALUATED in a sandbox holding the real page functions, so a mutant
// that deletes it, or points it at another field or another function, changes an observed picker value.
//
// Run: node assets/tests/fc-event-picker-year-refresh-r2b-a3-r3.test.js
// NOTE: no 'use strict' — extracted browser fns are eval'd into a sandbox (the F1-7H convention).

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, survived = [], mutants = [];
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
function mutant(label, caught) {
  mutants.push(label);
  if (caught === true) { pass++; console.log('ok   ' + label + ' (caught)'); }
  else { survived.push(label); fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var REPO = path.join(__dirname, '..', '..');
function read(p) { return fs.readFileSync(path.join(REPO, p), 'utf8').replace(/\r\n/g, '\n'); }
var FCS = read('assets/js/pages/fc-summary.js');
var HTML = read('assets/html/pages/fc-summary.html');
var INDEX = read('index.html');
var RO = require(path.join(REPO, 'assets/tests/_release-order.js'));

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
  var re = new RegExp('var ' + name + ' = [\\s\\S]*?;\\n');
  var m = re.exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
// The binding under test, read from the page rather than restated here. A drifted attribute throws.
function yearBinding() {
  var tag = /<input[^>]*id="event-target-year"[^>]*>/.exec(HTML);
  if (!tag) throw new Error('event-target-year input not found in fc-summary.html');
  var m = /onchange="([^"]*)"/.exec(tag[0]);
  return { tag: tag[0], onchange: m ? m[1] : null };
}

// ---- the page world -----------------------------------------------------------------------------
function makeEl(tag) {
  var el = { tagName: tag || 'DIV', _v: '', innerHTML: '', textContent: '', className: '', hidden: false,
    dataset: {}, style: {}, disabled: false, options: [], children: [], childNodes: [],
    appendChild: function (c) { this.children.push(c); this.options.push(c); this.lastElementChild = c; return c; },
    removeChild: function () {}, remove: function () {}, setAttribute: function () {}, removeAttribute: function () {},
    classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } },
    querySelector: function (sel) { return (this._q && this._q[sel]) || null; },
    querySelectorAll: function () { return []; }, closest: function () { return null; } };
  Object.defineProperty(el, 'value', {
    get: function () { return this._v; },
    set: function (v) { this._v = (v === null || v === undefined) ? '' : String(v); }, enumerable: true });
  return el;
}

var EVENT_ROW = {
  event_fc_id: 'EFC-AAA111', campaign_id: 'CMP-BFCM26', campaign_sku_line_id: 'CSL-1',
  company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MP-US-AMA',
  scope_type: 'sku', scope_id: 'CO1100-R', sku: 'CO1100-R', series: 'CO1100', category: 'Opener',
  event_name: 'BFCM', event_period: 'Nov 18 - Nov 29', event_start_date: '2026-11-18',
  event_end_date: '2026-11-29', event_month: 11, year: 2026, fc_qty: 13000, note: ''
};
function evRec(over) {
  var raw = Object.assign({}, EVENT_ROW, over || {});
  return { eventId: raw.event_fc_id, campaignId: raw.campaign_id, campaignSkuLineId: raw.campaign_sku_line_id,
    company: raw.company, country: raw.country, marketplace: raw.marketplace, sku: raw.sku,
    event: raw.event_name, eventStartDate: raw.event_start_date, eventEndDate: raw.event_end_date,
    year: raw.year, fcQty: raw.fc_qty, raw: raw };
}
var CAMPS = [
  { raw: { campaign_id: 'CMP-BFCM26', campaign_name: 'BFCM 2026', marketplace_id: 'MP-US-AMA',
           promotion_type: 'BFCM', major_event_flag: 'BFCM', event_flag: 'BFCM', duration: '', status: 'active' } },
  { raw: { campaign_id: 'CMP-DEC26', campaign_name: 'BFCM 2026', marketplace_id: 'MP-US-AMA',
           promotion_type: 'BFCM', major_event_flag: 'BFCM', event_flag: 'BFCM', duration: '', status: 'active' } }
];
var LINES = [
  { raw: { campaign_sku_line_id: 'CSL-1', campaign_id: 'CMP-BFCM26', sku: 'CO1100-R',
           promo_price: 23.99, regular_price: 29.99, discount_percent: 20 } },
  { raw: { campaign_sku_line_id: 'CSL-2', campaign_id: 'CMP-DEC26', sku: 'CO1100-R',
           promo_price: 21.99, regular_price: 29.99, discount_percent: 26 } }
];

// `overrides` lets a mutant replace one real function with a faulted copy; everything else stays real.
function pageWorld(events, opts) {
  opts = opts || {};
  var els = {}, netCalls = [], dbWrites = [];
  ['event-existing-select', 'event-existing-note', 'event-editing-banner', 'event-start-date',
   'event-end-date', 'event-target-year', 'event-name-input', 'event-country', 'event-marketplace',
   'event-sku-rows', 'event-add-row-btn', 'event-sku-datalist'].forEach(function (id) { els[id] = makeEl(); });
  els['event-target-year'].value = String(opts.year === undefined ? 2027 : opts.year);
  els['event-marketplace'].value = 'ResUS|US|Amazon';
  els['event-country'].value = 'US';
  els['event-name-input'].options = [{ value: 'BFCM' }, { value: 'Normal' }];

  var rowsHost = els['event-sku-rows'];
  rowsHost.children = [];
  rowsHost.appendChild = function (c) { this.children.push(c); this.lastElementChild = c; return c; };
  Object.defineProperty(rowsHost, 'innerHTML', {
    get: function () { return ''; }, set: function () { this.children = []; this.lastElementChild = null; },
    configurable: true });

  var dom = { getElementById: function (id) { return els[id] || null; },
    createElement: function (t) { return makeEl(t); },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  // Every DB accessor is counted. A read is in-memory and allowed; anything write-shaped is recorded and
  // must stay empty. `fetch`/`XMLHttpRequest` are absent, so a network call would throw rather than pass.
  var win = { KM: { DB: {
    getFcSpecialEvents: function () { netCalls.push('getFcSpecialEvents'); return events; },
    getCampaigns: function () { netCalls.push('getCampaigns'); return CAMPS; },
    getCampaignSkuLines: function () { netCalls.push('getCampaignSkuLines'); return LINES; },
    upsertCampaign: function () { dbWrites.push('upsertCampaign'); return Promise.resolve({}); },
    upsertCampaignSkuLines: function () { dbWrites.push('upsertCampaignSkuLines'); return Promise.resolve({}); },
    upsertFcSpecialEvent: function () { dbWrites.push('upsertFcSpecialEvent'); return Promise.resolve({}); }
  } } };
  var ctx = vm.createContext({ document: dom, window: win, console: console, Array: Array, Object: Object,
    String: String, Number: Number, JSON: JSON, isNaN: isNaN, parseFloat: parseFloat, parseInt: parseInt });
  var parts = [
    varSrc(FCS, '_SE_FP_FIELDS_'), varSrc(FCS, '_SE_FP_NUMERIC_'),
    varSrc(FCS, '_CMP_FP_FIELDS_'), varSrc(FCS, '_CMP_FP_NUMERIC_'),
    fnSrc(FCS, '_trStrTok_'), fnSrc(FCS, '_trNumTok_'),
    fnSrc(FCS, '_seFingerprint_'), fnSrc(FCS, '_cmpFingerprint_'),
    'var EVT_MAX_ROWS = 8;',
    'var _fcPrereqLoadedPaths_ = { event: true };',
    'var _fcReadModel = null;',
    'var _evtGroups = [];',
    'function _fcHas_() { return false; }',
    'function _fcResolveMarketplaceKey(v) { return String(v == null ? "" : v).trim(); }',
    'function _evtSelectedSite() { return { company: "ResUS", country: "US", marketplace: "Amazon" }; }',
    'function _evtClearPeriodError() {}',
    'function _evtSwitchMode() {}',
    'function _evtUpdateAddRowBtn() {}',
    'function _evtApplyRowPricing() {}',
    'function _evtPopulateSkuDatalist() {}',
    'function _evtRefreshSingleRowPrices() {}',
    'function _evtBuildGroups() {}',
    'var _evtAddedRows = [];',
    'function _evtAddSingleRow() {',
    '  var host = document.getElementById("event-sku-rows");',
    '  function cell() { var c = { _v: "" }; Object.defineProperty(c, "value", {',
    '    get: function () { return this._v; },',
    '    set: function (v) { this._v = (v === null || v === undefined) ? "" : String(v); } }); return c; }',
    '  var row = { dataset: {}, _cells: { ".evt-sku": cell(), ".evt-deal": cell(),',
    '    ".evt-disc": cell(), ".evt-fc": cell(), ".evt-reg": cell() },',
    '    querySelector: function (s) { return this._cells[s] || null; } };',
    '  host.children.push(row); host.lastElementChild = row; _evtAddedRows.push(row);',
    '}',
    fnSrc(FCS, '_evtEditingActive_'), fnSrc(FCS, '_evtBuilderEventRows_'),
    fnSrc(FCS, '_evtCampaignRows_'), fnSrc(FCS, '_evtCampaignLineRows_'),
    (opts.existingEvents || fnSrc(FCS, '_evtExistingEvents_')),
    fnSrc(FCS, '_evtExistingLabel_'),
    (opts.populate || fnSrc(FCS, '_evtPopulateExistingSelect')),
    fnSrc(FCS, '_evtOnExistingChange'),
    fnSrc(FCS, '_evtClearEditing_'), fnSrc(FCS, '_evtSetEditingChrome_'),
    fnSrc(FCS, '_evtHydrateExisting_'), fnSrc(FCS, '_evtOnScopeChange'),
    'var _evtEditing_ = null;'
  ];
  vm.runInContext(parts.join('\n'), ctx, { filename: 'a3r3-page.js' });
  ctx.__els = els;
  ctx.__net = netCalls;
  ctx.__writes = dbWrites;
  ctx.__setYear = function (y) { els['event-target-year'].value = String(y); };
  // Fire the binding EXACTLY as the page declares it — not a hand-written call.
  ctx.__fireYearChange = function (expr) { vm.runInContext(expr, ctx, { filename: 'onchange' }); };
  return ctx;
}
function pickerLabels(W) {
  var sel = W.__els['event-existing-select'];
  var out = [];
  String(sel.innerHTML).replace(/<option[^>]*>([\s\S]*?)<\/option>/g, function (_, t) { out.push(t); return ''; });
  return out;
}

// =========================================================================================================
section('A. THE BINDING EXISTS, AND IT IS THE EXISTING PICKER PATH');
// =========================================================================================================
var BIND = yearBinding();
ok(BIND.onchange !== null, 'A1  event-target-year declares an onchange', BIND.tag);
eq(BIND.onchange, '_evtPopulateExistingSelect()',
  'A2  and it is the EXISTING picker path — no new loader, no new model, no new request');
// the sibling controls this page binds the same way, so the discipline is the page\'s, not invented here
ok(/id="event-country"[^>]*onchange="_evtOnCountryChange\(\)"/.test(HTML),
  'A3  scope binds inline the same way (country)');
ok(/id="event-marketplace"[^>]*onchange="_evtOnScopeChange\(\)"/.test(HTML),
  'A4  and marketplace — the page owns its listener discipline inline');
ok(/id="event-existing-select"[^>]*onchange="_evtOnExistingChange\(\)"/.test(HTML),
  'A5  and the picker itself');

// call-site census, read from source
// The declaration matches the same text as a call, so it is excluded — counting it would have made this
// assertion describe the file's shape rather than its call sites.
var populateCalls = (FCS.match(/_evtPopulateExistingSelect\(\)/g) || []).length
  - (FCS.match(/function _evtPopulateExistingSelect\(\)/g) || []).length;
eq(populateCalls, 2, 'A6  the JS still calls the picker refresh from exactly its two lifecycle points');
ok(/_evtEditing_ = null;\n\s*_evtSetEditingChrome_\(\);\n\s*_evtPopulateExistingSelect\(\);/.test(FCS),
  'A7  builder open still initialises the picker');
ok(/if \(_evtEditingActive_\(\)\) _evtClearEditing_\(\);\n\s*_evtPopulateExistingSelect\(\);/.test(FCS),
  'A8  scope change still refreshes it');

// =========================================================================================================
section('B. YEAR CHANGE NOW RE-FILTERS THE PICKER');
// =========================================================================================================
(function () {
  var W = pageWorld([evRec({})], { year: 2027 });           // production: the only event is in 2026
  W._evtPopulateExistingSelect();                            // builder open, at the default year
  eq(pickerLabels(W), ['+ New event'], 'B1  at 2027 the picker offers only a new event (A)');

  W.__setYear(2026);
  W.__fireYearChange(BIND.onchange);
  var after = pickerLabels(W);
  eq(after.length, 2, 'B2  changing the YEAR alone now reveals the 2026 event (B) — the live defect');
  ok(/BFCM/.test(after[1]) && /2026-11-18/.test(after[1]),
    'B3  and the option carries its window, so two windows stay distinguishable', after[1]);

  W.__setYear(2027);
  W.__fireYearChange(BIND.onchange);
  eq(pickerLabels(W), ['+ New event'], 'B4  changing it back hides it again (C)');
})();

(function () {
  var W = pageWorld([evRec({})], { year: 2026 });
  W._evtPopulateExistingSelect();
  var once = pickerLabels(W).length;
  W.__fireYearChange(BIND.onchange);
  W.__fireYearChange(BIND.onchange);
  eq(pickerLabels(W).length, once, 'B5  same scope + same year, fired repeatedly: no duplicate rows (D)');
})();

// =========================================================================================================
section('C. SELECTION STATE ACROSS A YEAR CHANGE');
// =========================================================================================================
(function () {
  var W = pageWorld([evRec({})], { year: 2026 });
  W._evtPopulateExistingSelect();
  W.__els['event-existing-select'].value = 'CMP-BFCM26';
  W._evtOnExistingChange();
  ok(W._evtEditingActive_() === true, 'C1  an existing 2026 event is selected and loaded');
  eq(W.__els['event-sku-rows'].children[0].querySelector('.evt-fc').value, '13000',
    'C2  with its persisted fc_qty');
  eq([W.__els['event-sku-rows'].children[0].dataset.eventFcId,
      W.__els['event-sku-rows'].children[0].dataset.campaignSkuLineId], ['EFC-AAA111', 'CSL-1'],
    'C3  and its canonical ids');

  W.__setYear(2027);
  W.__fireYearChange(BIND.onchange);
  eq(W.__els['event-existing-select'].value, '',
    'C4  a selection invalidated by the new year does not survive it (E)');
  ok(W._evtEditingActive_() === false,
    'C5  and the editing session is cleared, so the old campaign_id cannot be saved under the new year');
  eq(W.__els['event-start-date'].value, '', 'C6  the window it owned is cleared with it');
})();

(function () {
  var W = pageWorld([evRec({})], { year: 2026 });
  W._evtPopulateExistingSelect();
  W.__els['event-existing-select'].value = 'CMP-BFCM26';
  W._evtOnExistingChange();
  W.__fireYearChange(BIND.onchange);          // same year — the selection is still valid
  eq(W.__els['event-existing-select'].value, 'CMP-BFCM26',
    'C7  a selection still valid under the same year is preserved (F)');
  ok(W._evtEditingActive_() === true, 'C8  and stays loaded');
})();

// =========================================================================================================
section('D. NO SERVER REQUEST, NO WRITE');
// =========================================================================================================
(function () {
  var W = pageWorld([evRec({})], { year: 2027 });
  W._evtPopulateExistingSelect();
  W.__net.length = 0; W.__writes.length = 0;
  W.__setYear(2026);
  W.__fireYearChange(BIND.onchange);
  ok(W.__net.every(function (c) { return c === 'getFcSpecialEvents'; }),
    'D1  a year change reads ONLY the already-loaded event rows (H)', W.__net);
  eq(W.__writes, [], 'D2  and writes nothing (G)');
  ok(typeof W.fetch === 'undefined' && typeof W.XMLHttpRequest === 'undefined',
    'D3  the sandbox has no fetch and no XHR, so a network call would have thrown rather than passed');
})();
(function () {
  // The picker must refuse rather than invent "+ New event" when the rows are not loaded at all.
  var W = pageWorld(null, { year: 2026 });
  vm.runInContext('_fcPrereqLoadedPaths_ = {}; window.KM.DB.getFcSpecialEvents = function () { return null; };', W);
  W.__fireYearChange(BIND.onchange);
  ok(W.__els['event-existing-select'].disabled === true,
    'D4  with the rows unavailable a year change disables the picker rather than offering a create');
})();

// =========================================================================================================
section('E. MULTI-WINDOW / MULTI-YEAR CORRECTNESS IS UNCHANGED');
// =========================================================================================================
(function () {
  var A = evRec({});
  var B = evRec({ event_fc_id: 'EFC-BBB', campaign_id: 'CMP-DEC26', campaign_sku_line_id: 'CSL-2',
                  event_start_date: '2026-12-10', event_end_date: '2026-12-14', fc_qty: 1200 });
  var W = pageWorld([A, B], { year: 2026 });
  W.__fireYearChange(BIND.onchange);
  eq(pickerLabels(W).length, 3, 'E1  same SKU, same year, two windows: BOTH listed (6)');
  var labels = pickerLabels(W);
  ok(labels[1] !== labels[2], 'E2  and they are distinguishable — same campaign name, different window (7)');

  W.__els['event-existing-select'].value = 'CMP-DEC26';
  W._evtOnExistingChange();
  eq(W.__els['event-sku-rows'].children[0].querySelector('.evt-fc').value, '1200',
    'E3  selecting the second window loads the SECOND window (10)');
  eq(W.__els['event-sku-rows'].children[0].dataset.campaignSkuLineId, 'CSL-2',
    'E4  with its own canonical line id (12)');
})();
(function () {
  var other = evRec({ event_fc_id: 'EFC-2028', campaign_id: 'CMP-2028', year: 2028 });
  var W = pageWorld([evRec({}), other], { year: 2026 });
  W.__fireYearChange(BIND.onchange);
  eq(pickerLabels(W).length, 2, 'E5  a 2028 event is not offered under 2026 (3)');
  ok(pickerLabels(W)[0] === '+ New event', 'E6  "+ New event" is offered, and only once (8)');
})();

// =========================================================================================================
section('F. THE A3-R2 TRANSPORT REPAIR IS UNTOUCHED');
// =========================================================================================================
var API = read('assets/js/api/operation-system-db-api.js');
['upsertCampaign', 'upsertCampaignSkuLines', 'upsertFcSpecialEvent'].forEach(function (a, i) {
  ok(new RegExp("_kmCanonicalWrite_\\('" + a + "'").test(API),
    'F' + (i + 1) + '  ' + a + ' still dispatches through the canonical write transport');
});
ok(!/window\.KM\.DB\.upsertCampaign[\s\S]{0,400}?await fetch\(/.test(API),
  'F4  no raw fetch was reintroduced into the campaign writer');
ok(/RETRY_ONLY_ON_ = \['REQUEST_METHOD_DOWNGRADED', 'RESPONSE_CORRELATION_UNPROVEN'\]/.test(API),
  'F5  the retry is still gated on the two transport codes that prove the request never ran');
ok(/attempt >= 2\) break;/.test(API), 'F6  and is still bounded to one extra attempt');
var GS20 = read('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var GS14 = read('assets/specs/active/apps-script/14_fc_write_handlers.gs');
ok(/CAMPAIGN_KEY_FIELDS_\s*=\s*\['company', 'country', 'marketplace', 'promotion_type', 'event_flag',\n\s*'start_date', 'end_date'\]/.test(GS20),
  'F7  HEADER_IDENTITY_KEY unchanged');
['DUPLICATE_CAMPAIGN_IDENTITY', 'STALE_CAMPAIGN_VERSION'].forEach(function (t, i) {
  ok(GS20.indexOf(t) > -1, 'F8.' + i + ' ' + t + ' still refused server-side');
});
ok(GS14.indexOf('STALE_SPECIAL_EVENT_VERSION') > -1, 'F9  the special-event stale guard is still refused');

// =========================================================================================================
section('G. THE CACHE TOKEN FOLLOWS THE BYTES');
// =========================================================================================================
var TOK = RO.currentAppToken();
ok(/^[a-z0-9]+-[a-z0-9]+-\d{8}$/.test(TOK), 'G1  the current application token matches the series shape', TOK);
ok(TOK !== 'speventidentity-r2ba3r1-20260920',
  'G2  and it is NOT the A3-R1 token, whose bytes were already published');
// FC-SUMMARY-R2B-A3-R4 — DERIVED FROM THIS ROUND'S OWN TOKEN, not from the end of the list. This read
// ROUND_TOKENS[length - 2], which says 'A3-R3's token is the newest' — true only until the next round
// appends, which A3-R4 duly did. What G3 is FOR is that A3-R3 APPENDED rather than rewrote, and that is
// answerable from where its own token sits, for as many rounds as follow.
var R3_TOKEN = 'speventwritefix-r2ba3r3-20260921';
var r3At = RO.ROUND_TOKENS.indexOf(R3_TOKEN);
ok(r3At > 0, 'G3  the A3-R3 token is in the series', r3At);
eq(RO.ROUND_TOKENS[r3At - 1], 'speventidentity-r2ba3r1-20260920',
  'G3a and the token it superseded sits immediately before it — the series is append-only');
eq(RO.ROUND_TOKENS.length, new Set(RO.ROUND_TOKENS).size, 'G4  and no token is ever reused');

var idxRefs = (INDEX.match(new RegExp(TOK, 'g')) || []).length;
ok(idxRefs > 0, 'G5  index.html serves its assets under the current token', idxRefs);
// ASK THE AUTHORITY, do not restate it. "Every asset carries the current token" is NOT the rule: the
// series' first entry is the BASE token, deliberately still carried by assets that have never had to
// rotate, and staleAppTokenRefs() is where that exemption is written down. A hand-rolled "no previous
// token anywhere" check reports the base as a defect and would fail on a correct tree.
eq(RO.staleAppTokenRefs(INDEX), [],
  'G6  and the canonical gate finds no asset left behind on a superseded token');
ok(INDEX.indexOf('assets/js/api/operation-system-db-api.js?v=' + TOK) > -1,
  'G7  the file A3-R2 changed is served under the NEW token — the point of rotating it');
ok(INDEX.indexOf('assets/js/pages/fc-summary.js?v=' + TOK) > -1,
  'G8  and so is the page whose modal markup A3-R3 changed');
// misplaced: a map-series token must never appear in the application set, and vice versa
var misplaced = RO.ROUND_TOKENS.filter(function (t) { return RO.isMapToken && RO.isMapToken(t); });
eq(misplaced, [], 'G9  no map-series token has leaked into the application series');

// =========================================================================================================
section('H. MUTANTS');
// =========================================================================================================
// H1 — the binding is deleted (the defect, restored)
mutant('M1 year onchange removed', (function () {
  var W = pageWorld([evRec({})], { year: 2027 });
  W._evtPopulateExistingSelect();
  W.__setYear(2026);
  /* fire nothing — exactly what the page did before the fix */
  return pickerLabels(W).length === 1;
})());

// H2 — the binding points at the wrong field: the year moves but the handler reads scope only
mutant('M2 refresh bound to the wrong field', (function () {
  var W = pageWorld([evRec({})], { year: 2027 });
  W._evtPopulateExistingSelect();
  W.__els['event-country'].value = 'US';      // a scope "change" that changes nothing
  W.__fireYearChange('_evtPopulateExistingSelect()');  // correct handler, but the YEAR was never set
  return pickerLabels(W).length === 1;
})());

// H3 — the year is ignored inside the filter
mutant('M3 target year ignored in filtering', (function () {
  var faulted = fnSrc(FCS, '_evtExistingEvents_')
    .replace('if (year && _trNumTok_(raw.year || r.year) !== _trNumTok_(year)) return;', '');
  if (faulted.indexOf('_trNumTok_(year)') > -1) throw new Error('M3 anchor drifted');
  var W = pageWorld([evRec({})], { year: 2027, existingEvents: faulted });
  W.__fireYearChange(BIND.onchange);
  return pickerLabels(W).length !== 1;    // the 2026 event leaks into 2027
})());

// H4 — an invalidated selection is kept
mutant('M4 stale selected event kept across a year change', (function () {
  var faulted = fnSrc(FCS, '_evtPopulateExistingSelect')
    .replace("else if (prev) { sel.value = ''; _evtClearEditing_(); }", '');
  if (faulted.indexOf('_evtClearEditing_();') > -1) throw new Error('M4 anchor drifted');
  var W = pageWorld([evRec({})], { year: 2026, populate: faulted });
  W._evtPopulateExistingSelect();
  W.__els['event-existing-select'].value = 'CMP-BFCM26';
  W._evtOnExistingChange();
  W.__setYear(2027);
  W.__fireYearChange(BIND.onchange);
  return W._evtEditingActive_() === true;   // caught: the 2026 session survived into 2027
})());

// H5 — two windows collapse into one (campaign_name becomes identity again)
mutant('M5 two windows collapsed into one', (function () {
  var faulted = fnSrc(FCS, '_evtExistingEvents_')
    .replace('var cid = _trStrTok_(r.campaignId || raw.campaign_id);',
             'var cid = _trStrTok_(raw.campaign_name || r.campaignId || raw.campaign_id);');
  var A = evRec({});
  var B = evRec({ event_fc_id: 'EFC-BBB', campaign_id: 'CMP-DEC26', campaign_sku_line_id: 'CSL-2',
                  event_start_date: '2026-12-10', event_end_date: '2026-12-14' });
  A.raw.campaign_name = 'BFCM 2026'; B.raw.campaign_name = 'BFCM 2026';
  var W = pageWorld([A, B], { year: 2026, existingEvents: faulted });
  W.__fireYearChange(BIND.onchange);
  return pickerLabels(W).length !== 3;      // caught: the two windows merged
})());

// H6 — a year change issues a server request
mutant('M6 server request issued on a year change', (function () {
  var faulted = fnSrc(FCS, '_evtPopulateExistingSelect')
    .replace('var groups = _evtExistingEvents_();',
             'window.KM.DB.upsertCampaign({}); var groups = _evtExistingEvents_();');
  var W = pageWorld([evRec({})], { year: 2026, populate: faulted });
  W.__writes.length = 0;
  W.__fireYearChange(BIND.onchange);
  return W.__writes.length > 0;
})());

// H7 — the old application token is restored
// Roll the series back one entry, so a token whose bytes were already published becomes 'current'.
// index.html carries the REAL current token, so under the rolled-back series it no longer matches —
// which is exactly the half-updated deployment the series exists to prevent.
mutant('M7 old app token restored', (function () {
  var truncated = RO.ROUND_TOKENS.slice(0, -1);
  var nowCurrent = truncated[truncated.length - 1];
  return nowCurrent !== RO.currentAppToken() && INDEX.indexOf(nowCurrent) === -1;
})());

// H8 — one stale token reference left behind in index.html
mutant('M8 one stale token reference left in index.html', (function () {
  var broken = INDEX.replace('assets/js/api/operation-system-db-api.js?v=' + TOK,
    'assets/js/api/operation-system-db-api.js?v=speventidentity-r2ba3r1-20260920');
  if (broken === INDEX) throw new Error('M8 anchor drifted');
  return RO.staleAppTokenRefs(broken).length > 0;
})());

// H9 — the Special Event identity key gains campaign_name again
mutant('M9 campaign_name returned to the identity key', (function () {
  var faulted = GS20.replace("'promotion_type', 'event_flag',", "'campaign_name', 'promotion_type', 'event_flag',");
  if (faulted === GS20) throw new Error('M9 anchor drifted');
  return !/CAMPAIGN_KEY_FIELDS_\s*=\s*\['company', 'country', 'marketplace', 'promotion_type', 'event_flag',\n\s*'start_date', 'end_date'\]/.test(faulted);
})());

// =========================================================================================================
section('I. VACUITY — every mutant predicate is checked against a tree where the fault is absent');
// =========================================================================================================
(function () {
  var W = pageWorld([evRec({})], { year: 2027 });
  W._evtPopulateExistingSelect();
  eq(pickerLabels(W).length, 1, 'I1  the unfaulted tree really does start with one option at 2027');
  W.__setYear(2026);
  W.__fireYearChange(BIND.onchange);
  eq(pickerLabels(W).length, 2, 'I2  and really does gain one when the year moves — so M1/M2 can fail');
  eq(W.__writes, [], 'I3  and writes nothing — so M6 can fail');
})();

console.log('\n' + new Array(101).join('='));
console.log((fail === 0 && survived.length === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail
  + ' failed, ' + mutants.length + ' mutants, ' + survived.length + ' survived');
console.log(new Array(101).join('='));
process.exit((fail === 0 && survived.length === 0) ? 0 : 1);
