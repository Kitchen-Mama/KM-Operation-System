// Kitchen Mama Operation System - S8-B3-R3-CP2U-R1
// A FAILED READ AND AN EMPTY ANSWER PRINTED THE SAME DASH
//
// Run: node assets/tests/read-state-distinction-s8-b3-r3-cp2u-r1.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes. Every fixture is synthetic.
//
// Two columns, two different defects of the same shape.
//
// AVG SALES had ONE symbol for five facts. `_irCanonicalSalesBasis_` returns null when the read is still in
// flight, when it FAILED, when the result belongs to a site that is no longer displayed, when the scope
// resolved with no line for this SKU, and when a line exists carrying no basis at all. The cell printed `--`
// for all five - and `--` was already taken, because a NAMED quality refusal prints it too. So "retry the
// read", "wait", "chase the data" and "the calculation refused this site" were one glyph.
//
// SUGGESTED QTY had `…` and `—`, which is one more symbol and still not enough: READ_ERROR, a read that
// succeeded over zero rows, a READY answer with no row for this SKU, and a row the calculation BLOCKED all
// returned `{ state: 'NONE' }`. A transport fault read as a business answer.
//
// AND THE ROUND BEFORE THIS ONE GOT THE AVG SALES CAUSE WRONG. CP2U reported that `_irRecoBlank` leaves
// `scope` null during LOADING and that this was why the basis resolver bailed. It is not: the LOADING
// assignment overwrites it on the very next line, stamping both `scope` and `appliedScopeKey` at issue time.
// What is empty during LOADING is `linesBySku`. The two failure arms are not alike either - a read the server
// ANSWERED with success:false goes through `_irRecoApplyEnvelope` and gets a scope, while a THROWN read keeps
// the blank and does not. A `scope === null` test would have called one of those the other. Sections A and B
// pin the actual state objects, so the attribution is executed rather than asserted in prose.
//
// NOTE: no 'use strict' - the shipped IRRECO region is eval'd into MODULE scope.
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');
var SKU = 'CO1200-B';
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var SCOPE_KEY = JSON.stringify(SCOPE);
var OTHER_KEY = JSON.stringify({ company: 'KM', country: 'CA', marketplace: 'Amazon.ca' });

// ---------------------------------------------------------------------------------------------------
// The sandbox. The REAL escaper is bound - this round puts database text into a title attribute for the
// first time, so a stub that returns its input unchanged would be testing the wrong function.
// ---------------------------------------------------------------------------------------------------
var APPLIED_KEY = SCOPE_KEY;
// The cutover predicate is INSIDE the extraction region, so the eval below installs the shipped one over any
// stub. That is the right outcome and the dependency is bound properly instead: `workspaceApiActive` is what
// the real predicate asks, and asking it is the point.
var WS_ACTIVE = true;
global.window = { KM_FLAGS: {}, KM: { api: { workspaceApiActive: function () { return WS_ACTIVE; } } } };
global.document = { querySelectorAll: function () { return []; }, getElementById: function () { return null; } };
global.AbortController = function () { this.signal = {}; this.abort = function () {}; };
global.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
function escapeReplenHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function _irAppliedScopeKey_() { return APPLIED_KEY; }
function _irResultMatchesAppliedScope_(st) {
  if (!st || typeof st.appliedScopeKey !== 'string') return false;
  return st.appliedScopeKey === _irAppliedScopeKey_();
}
function _irRecoRerenderSummaries() {}
function _irRecoUpdateSuggestedCells() {}
function getReplenishmentData() { return []; }
function renderReplenishment() {}
function _irSearchApplied_() { return true; }
function _irRecoActionHtml() { return ''; }
function _irRecoHorizonOutlookTableHtml() { return ''; }

// The quality/state vocabulary region, and the IRRECO region that holds the two authorities.
eval(IRSRC.slice(IRSRC.indexOf('var IR_AVG_QUALITY_TEXT'), IRSRC.indexOf('function _irScrollRowHtml_')));
eval(IRSRC.slice(IRSRC.indexOf('// __IRRECO_START__'), IRSRC.indexOf('// __IRRECO_END__')));
// The Suggested Qty authority + its cell, which live outside that region.
eval(IRSRC.slice(IRSRC.indexOf('function _irSuggestedQtyState_'), IRSRC.indexOf('// Recommendation Summary table body')));

// A line as `_irRecoMapLine` leaves it: the only part the basis picker reads is horizonBasis.
function line(basis) { return { sku: SKU, horizonBasis: basis || null }; }
function basisRate(r) { return { avgSalesPerDay: r, source: 'normalized_30d', warning: null, normalDayCount: 30, basisQualityError: null }; }
function basisErr(code) { return { avgSalesPerDay: null, source: null, warning: null, normalDayCount: null, basisQualityError: code }; }

function recoState(o) {
  o = o || {};
  var st = _irRecoBlank(o.status || 'READY');
  if (o.scope !== undefined) st.scope = o.scope; else st.scope = SCOPE;
  st.appliedScopeKey = (o.appliedScopeKey !== undefined) ? o.appliedScopeKey : APPLIED_KEY;
  st.linesBySku = o.linesBySku || {};
  st.errors = o.errors || [];
  st.loadedOk = o.loadedOk === true;
  return st;
}

// ---------------------------------------------------------------------------------------------------
section('A  THE CP2U ATTRIBUTION, EXECUTED. What the states actually hold.');
// ---------------------------------------------------------------------------------------------------
// The claim under correction is textual, so it is checked against the shipped source, not re-narrated.
var LOAD_SITE = IRSRC.slice(IRSRC.indexOf("_irRecoState = _irRecoBlank('LOADING');"),
  IRSRC.indexOf("_irRecoState = _irRecoBlank('LOADING');") + 400);
ok(/_irRecoState\.scope = scopeReq;/.test(LOAD_SITE),
  'A1  THE LOADING STATE IS GIVEN ITS REQUESTED SCOPE on the line after the blank - so "LOADING implies a '
  + 'null scope", which CP2U offered as the cause, is false in the shipped code');
ok(/_irRecoState\.appliedScopeKey = _irAppliedScopeKey_\(\);/.test(LOAD_SITE),
  'A1a and its appliedScopeKey too, stamped at issue time, so a LOADING state SATISFIES the scope guard');

var blank = _irRecoBlank('LOADING');
eq(blank.scope, null, 'A2  the blank factory does return a null scope');
eq(blank.linesBySku, {}, 'A2a and an empty linesBySku, which is what is actually empty while a read is open');

// The server-answered failure arm keeps a scope; the thrown arm does not. One test could not tell them apart.
var APPLY = IRSRC.slice(IRSRC.indexOf('function _irRecoApplyEnvelope'), IRSRC.indexOf('function _irRecoApplyEnvelope') + 900);
ok(/_irRecoState = _irRecoBlank\(_isConfig \? 'CONFIG_NOT_READY' : 'API_ERROR'\);\s*\n\s*_irRecoState\.contextKey = ctxKey; _irRecoState\.scope = reqScope;/.test(APPLY),
  'A3  a read the server ANSWERED with success:false is given a scope');
var CATCH = IRSRC.slice(IRSRC.indexOf("_irRecoState = _irRecoBlank('API_ERROR'); _irRecoState.contextKey = ctxKey; _irRecoState.seq = my;"),
  IRSRC.indexOf("_irRecoState = _irRecoBlank('API_ERROR'); _irRecoState.contextKey = ctxKey; _irRecoState.seq = my;") + 240);
ok(!/_irRecoState\.scope = /.test(CATCH),
  'A3a while a THROWN read keeps the blank and is NOT - so the two API_ERROR arms differ in exactly the '
  + 'field CP2U proposed testing, and `scope === null` would have classified one of them as the other');
ok(IRSRC.indexOf('CP2U ATTRIBUTED THIS TO A NULL SCOPE DURING LOADING. IT IS NOT THAT.') !== -1,
  'A4  and the correction is recorded where the authority is defined, not only in a report');

// ---------------------------------------------------------------------------------------------------
section('B  AVG SALES - five absences, told apart, keyed on the ACTUAL status');
// ---------------------------------------------------------------------------------------------------
_irRecoState = recoState({ status: 'LOADING', linesBySku: {} });
var B1 = _irAvgSalesCellState_(SKU);
eq([B1.state, B1.reason], ['PENDING', 'IN_FLIGHT'], 'B1  an OPEN read is PENDING');
ok(_irResultMatchesAppliedScope_(_irRecoState),
  'B1a and it reached that verdict with the scope guard SATISFIED, not bypassed by a null scope');

// A thrown read and an answered failure are both READ_FAILED, and the answered one keeps its code.
_irRecoState = recoState({ status: 'API_ERROR', scope: null, errors: [{ code: 'PAGE_READ_FAILED' }] });
var B2 = _irAvgSalesCellState_(SKU);
eq([B2.state, B2.reason, B2.detail], ['READ_FAILED', 'READ_FAILED', 'PAGE_READ_FAILED'],
  'B2  a THROWN read is READ_FAILED and carries the code');
_irRecoState = recoState({ status: 'API_ERROR', errors: [{ code: 'WORKSPACE_ERROR' }] });
eq(_irAvgSalesCellState_(SKU).state, 'READ_FAILED',
  'B2a and so is one the server ANSWERED with success:false, though it carries a scope and the other does not');
_irRecoState = recoState({ status: 'CONFIG_NOT_READY', errors: [{ code: 'CALCULATION_MONTH_NOT_CONFIGURED' }] });
eq([_irAvgSalesCellState_(SKU).state, _irAvgSalesCellState_(SKU).reason],
  ['READ_FAILED', 'CONFIG_NOT_READY'], 'B2b a configuration state is a failed read with its own reason');

// CROSS-SITE. A result for another site is not this site's absence of one.
_irRecoState = recoState({ status: 'READY', appliedScopeKey: OTHER_KEY, linesBySku: {}, loadedOk: true });
var B3 = _irAvgSalesCellState_(SKU);
eq([B3.state, B3.reason], ['PENDING', 'SCOPE_SUPERSEDED'],
  'B3  CROSS-SITE: a loaded result from another site is PENDING, never NONE and never that site number');

// NO LINE vs NO SITE. Both are "nothing published", and they send the operator to different places.
_irRecoState = recoState({ status: 'READY', linesBySku: { 'OTHER-SKU': [line(basisRate(4))] }, loadedOk: true });
eq(_irAvgSalesCellState_(SKU).reason, 'NO_LINE_FOR_SKU',
  'B4  a READY site with no line for THIS sku says so');
_irRecoState = recoState({ status: 'EMPTY', linesBySku: {}, loadedOk: true });
eq(_irAvgSalesCellState_(SKU).reason, 'SCOPE_RESOLVED_NO_LINES',
  'B4a while a read that answered with no lines AT ALL is a different reason');

// THE D-S8-B3-98 SHAPE: a line exists and carries no basis whatever. Not "no history" - WITHHELD.
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(null)];
var B5 = _irAvgSalesCellState_(SKU);
eq([B5.state, B5.reason], ['NONE', 'BASIS_WITHHELD'],
  'B5  a line with NO horizonBasis at all is reported as WITHHELD - the MARKETPLACE_DESTINATION_INACTIVE '
  + 'shape (D-S8-B3-98), which the bare dash was reporting as a site without sales');

// The two that already worked keep working.
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(basisErr('SALES_BASIS_WEEKLY_UNAVAILABLE'))];
eq(_irAvgSalesCellState_(SKU).state, 'REFUSED',
  'B6  a NAMED quality refusal is REFUSED - this round does not rename what CP2R/CP2T already named');
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(basisRate(0))];
eq(_irAvgSalesCellState_(SKU).state, 'READY',
  'B7  AND A CONFIRMED ZERO IS STILL READY. A legitimate 0 is a measurement and must not be swept into '
  + 'any of the absence states this round introduced');
_irRecoState.linesBySku[SKU] = [line(basisRate(4.5))];
eq(_irAvgSalesCellState_(SKU).state, 'READY', 'B7a as is a positive rate');

// The rendering-cost guard: a caller that already resolved the basis is not made to resolve it twice.
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(basisRate(9))];
eq(_irAvgSalesCellState_(SKU, basisErr('SALES_BASIS_UNAVAILABLE')).state, 'REFUSED',
  'B8  a basis passed in is USED rather than re-resolved, so a table render does not pay for the picker twice');
eq(_irAvgSalesCellState_(SKU, undefined).state, 'READY', 'B8a and omitting it resolves its own');

// ---------------------------------------------------------------------------------------------------
section('C  THE AVG SALES CELL - what the operator actually reads');
// ---------------------------------------------------------------------------------------------------
function cellFor(state, reason, detail, qErr) {
  var item = { avgSalesCellState: state, avgSalesCellReason: reason, avgSalesCellDetail: detail || null,
    avgSalesQualityError: qErr || null, avgSalesWarning: null };
  return { note: _irAvgSalesQualityNote_(item), cls: _irAvgSalesCellClass_(item), flag: _irAvgSalesFlagHtml_(item) };
}
var cFail = cellFor('READ_FAILED', 'READ_FAILED', 'PAGE_READ_FAILED');
ok(/could not be READ/.test(cFail.note), 'C1  a failed read SAYS it is a failed read');
ok(/PAGE_READ_FAILED/.test(cFail.note), 'C1a and names the code it failed with');
ok(cFail.cls === ' replen-cell--avg-error', 'C1b carrying the error class');
ok(/read failed/.test(cFail.flag), 'C1c and a visible mark that is NOT the word "unavailable"');

var cPend = cellFor('PENDING', 'IN_FLIGHT', null);
ok(/still being read/.test(cPend.note), 'C2  a pending read says it is still reading');
eq(cPend.cls, '', 'C2a and does NOT take the error class - a first paint is not a fault');
eq(cPend.flag, '', 'C2b nor a failure flag');

var cNone = cellFor('NONE', 'NO_LINE_FOR_SKU', null);
ok(/no destination line for this SKU/.test(cNone.note), 'C3  an empty answer says what was empty');
eq(cNone.cls, '', 'C3a neutrally - nothing is broken');
var cWith = cellFor('NONE', 'BASIS_WITHHELD', null);
ok(/withheld/.test(cWith.note), 'C3b and a withheld basis is distinguished from an absent one');

// A named refusal is MORE specific and still wins, which is the rule every earlier round set.
var cRef = cellFor('REFUSED', null, null, 'SALES_BASIS_WEEKLY_UNAVAILABLE');
ok(/no weekly sales figure could be read/.test(cRef.note),
  'C4  A NAMED REFUSAL STILL WINS over any state note - CP2T-R2 words, unchanged');
ok(/unavailable/.test(cRef.flag), 'C4a keeping its own flag');
var cBoth = cellFor('READ_FAILED', 'READ_FAILED', 'X', 'SALES_BASIS_UNAVAILABLE');
ok(/No usable daily or weekly/.test(cBoth.note),
  'C4b and it wins even when a state is also present, because it is a statement about a resolved basis');

// DISABLED must stay silent: a build that never asked the question may not annotate every cell.
var cDis = cellFor('DISABLED', null, null);
eq([cDis.note, cDis.cls, cDis.flag], ['', '', ''], 'C5  a DISABLED column says NOTHING - no note, no class, no flag');
WS_ACTIVE = false;
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(basisRate(5))];
eq(_irAvgSalesCellState_(SKU).state, 'DISABLED',
  'C5a and the authority reaches it through the SHIPPED cutover predicate - a build with the workspace read '
  + 'off annotates nothing, even holding a loaded rate');
WS_ACTIVE = true;
eq(_irAvgSalesCellState_(SKU).state, 'READY', 'C5b turning it back on restores the real answer');

// ---------------------------------------------------------------------------------------------------
section('D  THE PROJECTION - a pending cell stops borrowing the dash');
// ---------------------------------------------------------------------------------------------------
var PROJ = IRSRC.slice(IRSRC.indexOf("var _avgDisplay = '--';"),
  IRSRC.indexOf('// Forecast breakdown (next 3 months, Target Rule applied)'));
var IR_DAYS = { daysOfSupply: function (stock, rate) { return (rate == null || rate <= 0) ? null : Math.floor(stock / rate); } };
function project(basis, state) {
  var f = new Function('_irCanonicalSalesBasis_', '_irAvgSalesCellState_', 'IR', 'mp', 'currentStock', 'Math',
    PROJ + ' return { avg: _avgDisplay, dos: _dosDisplay, state: _avgCellState, reason: _avgCellReason, detail: _avgCellDetail };');
  return f(function () { return basis; }, state === undefined ? undefined : function () { return state; },
    IR_DAYS, { sku: SKU }, 500, Math);
}
var D1 = project(null, { state: 'PENDING', reason: 'IN_FLIGHT', detail: null });
eq(D1.avg, '…', 'D1  A PENDING AVG SALES CELL PRINTS THE PENDING MARKER, not the dash it shared with "no answer"');
eq(D1.dos, '…', 'D1a and Days of Supply waits with it rather than claiming no demand');
var D2 = project(null, { state: 'READ_FAILED', reason: 'READ_FAILED', detail: 'PAGE_READ_FAILED' });
eq(D2.avg, '--', 'D2  a FAILED read still prints the dash - there is no number - but it is now labelled');
eq([D2.state, D2.detail], ['READ_FAILED', 'PAGE_READ_FAILED'], 'D2a with the state and code carried to the row');
var D3 = project(basisRate(10), { state: 'READY', reason: null, detail: null });
eq(D3.avg, '10.0', 'D3  a resolved rate is unaffected');
var D4 = project(basisRate(0), { state: 'READY', reason: null, detail: null });
eq(D4.avg, '0.0', 'D4  AND A CONFIRMED ZERO STILL PRINTS 0.0, never the pending marker and never a dash');

// THE REGRESSION GUARD FOR EVERY OTHER AVG-SALES SUITE. Those harnesses bind the picker and not this
// authority; inside `new Function` an unbound name is `typeof undefined`, so the block must fall through
// to its pre-CP2U behaviour instead of throwing. CP2T-R1 shipped exactly this bug in a harness once.
var D5 = project(null, undefined);
eq([D5.avg, D5.state], ['--', null],
  'D5  WITH THE AUTHORITY UNBOUND the projection behaves exactly as it did before this round - which is '
  + 'what the seven older avg-sales suites measure, and why none of them had to change');
ok(/typeof _irAvgSalesCellState_ === 'function'/.test(PROJ),
  'D5a because the call is typeof-guarded, as the picker beside it already was');

// ---------------------------------------------------------------------------------------------------
section('E  SUGGESTED QTY - four facts that were one NONE');
// ---------------------------------------------------------------------------------------------------
function matState(o) {
  o = o || {};
  return { status: o.status, scopeKey: SCOPE_KEY, appliedScopeKey: (o.appliedScopeKey !== undefined) ? o.appliedScopeKey : APPLIED_KEY,
    bySku: o.bySku || {}, rows: o.rows || [], loadedOk: o.loadedOk === true, error: o.error || null,
    handlerVersion: o.handlerVersion || null, scope: SCOPE, appliedAt: 1 };
}
function row(o) {
  o = o || {};
  return { sku: SKU, calculation_status: o.status === undefined ? 'READY' : o.status,
    note: o.note === undefined ? null : o.note, calculation_date: o.date || '2026-10-15',
    calculated_at: o.at || '2026-10-15 03:00:00', d18_gap_qty: 0, d18_suggested_qty: 0,
    d30_gap_qty: 0, d30_suggested_qty: 0, d45_gap_qty: 0, d45_suggested_qty: 0,
    d90_gap_qty: o.gap === undefined ? 40 : o.gap, d90_suggested_qty: o.qty === undefined ? 40 : o.qty };
}
var ITEM = { sku: SKU };

_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READ_FAILED', message: 'boom' } });
var E1 = _irSuggestedQtyState_(ITEM);
eq([E1.state, E1.reason, E1.detail], ['NONE', 'READ_FAILED', 'READ_FAILED'],
  'E1  A FAILED READ IS NAMED. It was indistinguishable from a refusal, which is the one that reads as an '
  + 'answer about the data');
eq(E1.value, null, 'E1a and it is NOT a quantity');

_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READER_UNAVAILABLE' } });
eq(_irSuggestedQtyState_(ITEM).detail, 'READER_UNAVAILABLE', 'E1b carrying whichever code actually failed');

_irMatState = matState({ status: 'EMPTY', loadedOk: true });
eq(_irSuggestedQtyState_(ITEM).reason, 'READ_EMPTY',
  'E2  a read that SUCCEEDED over zero rows is a different fact from one that failed');

var by = {}; by['OTHER-SKU'] = row();
_irMatState = matState({ status: 'READY', bySku: by, rows: [by['OTHER-SKU']], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM).reason, 'NO_ROW_FOR_SKU',
  'E3  a calculated site with no row for THIS sku is a third');

var byB = {}; byB[SKU] = row({ status: 'BLOCKED', note: 'No marketplace SKU mapping for this site' });
_irMatState = matState({ status: 'READY', bySku: byB, rows: [byB[SKU]], loadedOk: true });
var E4 = _irSuggestedQtyState_(ITEM);
eq([E4.state, E4.reason, E4.detail], ['NONE', 'REFUSED', 'BLOCKED'],
  'E4  and a row the calculation DECLINED is the fourth - an OLD REFUSAL, which is what CP2U item 3 asks to '
  + 'tell apart from a missing row and a failed read');
eq(E4.note, 'No marketplace SKU mapping for this site',
  'E4a carrying the stored reason, which the normal card replaces with generic wording');

var byE = {}; byE[SKU] = row({ status: 'ERROR', note: null });
_irMatState = matState({ status: 'READY', bySku: byE, rows: [byE[SKU]], loadedOk: true });
eq([_irSuggestedQtyState_(ITEM).detail, _irSuggestedQtyState_(ITEM).note], ['ERROR', null],
  'E4b an ERROR row with no stored note reports the status and does not invent one');

var byN = {}; byN[SKU] = row({ qty: '' });
_irMatState = matState({ status: 'READY', bySku: byN, rows: [byN[SKU]], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM).reason, 'NO_STORED_VALUE',
  'E5  a READY row storing no quantity keeps the reason it already had');

// THE LEGITIMATE ANSWERS. A stored 0 is a real recommendation of nothing.
var byZ = {}; byZ[SKU] = row({ qty: 0 });
_irMatState = matState({ status: 'READY', bySku: byZ, rows: [byZ[SKU]], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM), { state: 'READY', value: 0 },
  'E6  A STORED ZERO IS STILL READY WITH VALUE 0 - a real "order nothing", not an absence');
var byP = {}; byP[SKU] = row({ qty: 120 });
_irMatState = matState({ status: 'READY', bySku: byP, rows: [byP[SKU]], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM), { state: 'READY', value: 120 }, 'E6a and a positive value is unchanged');

// PENDING and CROSS-SITE keep the verdicts F1A set.
_irMatState = matState({ status: 'LOADING' });
eq(_irSuggestedQtyState_(ITEM).state, 'PENDING', 'E7  an open read is still PENDING');
_irMatState = matState({ status: 'READY', appliedScopeKey: OTHER_KEY, bySku: byP, rows: [byP[SKU]], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM).state, 'PENDING',
  'E7a CROSS-SITE: another site result is still PENDING, never this sku NONE and never that site number');

// NEITHER A FAILURE NOR AN ABSENCE BECOMES A QUANTITY.
['READ_ERROR', 'EMPTY'].forEach(function (stt, i) {
  _irMatState = matState({ status: stt, error: { code: 'READ_FAILED' } });
  eq(_irSuggestedQtyState_(ITEM).value, null, 'E8.' + (i + 1) + ' ' + stt + ' publishes no value');
});
_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READ_FAILED' } });
eq(_irSuggestedQtyNumber_(ITEM), 0,
  'E8a the EDITOR SEED is still 0, and that is correct - it is the number the operator starts typing from, '
  + 'declared as such, and it is reached only through a function that asks for a seed');
eq(_irSuggestedQtyState_(ITEM).value, null,
  'E8b while the AUTHORITY still refuses to call it a quantity - the two answers stay different on purpose');

// ---------------------------------------------------------------------------------------------------
section('F  THE SUGGESTED QTY CELL - distinct, and ESCAPED');
// ---------------------------------------------------------------------------------------------------
function sugCell() { return _irSuggestedCellHtml(ITEM); }
_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READ_FAILED' } });
var F1 = sugCell();
ok(/failed read, not a refused calculation/.test(F1), 'F1  the cell SAYS a failed read is a failed read');
ok(/--read-failed/.test(F1), 'F1a with its own modifier class, because it is the only one a retry fixes');
_irMatState = matState({ status: 'EMPTY', loadedOk: true });
ok(/no stored gap rows at all/.test(sugCell()), 'F2  an empty read says what was empty');
_irMatState = matState({ status: 'READY', bySku: by, rows: [by['OTHER-SKU']], loadedOk: true });
ok(/none for this SKU/.test(sugCell()), 'F3  a missing row says the row is missing');
_irMatState = matState({ status: 'READY', bySku: byB, rows: [byB[SKU]], loadedOk: true });
ok(/declined this SKU \[BLOCKED\]/.test(sugCell()), 'F4  and a refusal names the status');
ok(/No marketplace SKU mapping/.test(sugCell()), 'F4a and shows the stored reason');

// All four are different sentences. A distinction nobody can read is not a distinction.
var seen = {};
[['READ_ERROR', {}], ['EMPTY', {}], ['READY', by], ['READY', byB]].forEach(function (c) {
  _irMatState = matState({ status: c[0], bySku: c[1], loadedOk: c[0] !== 'READ_ERROR', error: { code: 'READ_FAILED' } });
  var t = /title="([^"]*)"/.exec(sugCell());
  seen[t ? t[1] : ''] = true;
});
eq(Object.keys(seen).length, 4, 'F5  FOUR DISTINCT EXPLANATIONS where there was one');

// THE ESCAPING. A stored note is database text and reaches a title attribute for the first time here.
var byX = {}; byX[SKU] = row({ status: 'BLOCKED', note: 'bad " onmouseover=alert(1) <b>x</b> & \'q\'' });
_irMatState = matState({ status: 'READY', bySku: byX, rows: [byX[SKU]], loadedOk: true });
var FX = sugCell();
ok(FX.indexOf('onmouseover=alert(1)') !== -1, 'F6  the stored note does reach the cell');
ok(!/" onmouseover/.test(FX),
  'F6a BUT ITS QUOTE DOES NOT CLOSE THE ATTRIBUTE - the title is built through escapeReplenHtml, which the '
  + 'old literal titles never needed and these do', FX);
ok(FX.indexOf('&quot;') !== -1 && FX.indexOf('&lt;b&gt;') !== -1 && FX.indexOf('&amp;') !== -1 && FX.indexOf('&#39;') !== -1,
  'F6b with quote, angle bracket, ampersand and apostrophe all escaped');
eq((FX.match(/title="/g) || []).length, 1, 'F6c and exactly one title attribute is produced');
// The detail code is interpolated too, so it is escaped on that path as well.
_irMatState = matState({ status: 'READ_ERROR', error: { code: 'X" onerror=1' } });
ok(!/X" onerror/.test(sugCell()), 'F6d and so is an error code, which is also server text');

// ---------------------------------------------------------------------------------------------------
section('G  LATE RESPONSES - the transitions, in the order they really happen');
// ---------------------------------------------------------------------------------------------------
// Avg Sales across one scope lifetime: nothing -> open -> answered. Each step is read, not assumed.
APPLIED_KEY = SCOPE_KEY;
_irRecoState = _irRecoBlank('DISABLED');
eq(_irAvgSalesCellState_(SKU).state, 'DISABLED', 'G1  before anything is asked the authority is silent');
_irRecoState = recoState({ status: 'LOADING', linesBySku: {} });
eq(_irAvgSalesCellState_(SKU).state, 'PENDING', 'G1a the read opens -> PENDING');
_irRecoState = recoState({ status: 'READY', linesBySku: {}, loadedOk: true });
_irRecoState.linesBySku[SKU] = [line(basisRate(7))];
eq(_irAvgSalesCellState_(SKU).state, 'READY', 'G1b the answer lands -> READY');

// THE LATE RESPONSE. The operator switched sites while a read was open; it arrives for the old one.
APPLIED_KEY = OTHER_KEY;
eq([_irAvgSalesCellState_(SKU).state, _irAvgSalesCellState_(SKU).reason], ['PENDING', 'SCOPE_SUPERSEDED'],
  'G2  A LATE RESPONSE FOR THE PREVIOUS SITE is PENDING, so the stale rate is withheld rather than printed '
  + 'against the site now on screen');
eq(_irCanonicalSalesBasis_(SKU), null, 'G2a the picker refuses it too - this round did not loosen that gate');
APPLIED_KEY = SCOPE_KEY;
eq(_irAvgSalesCellState_(SKU).state, 'READY', 'G2b and switching back makes the same result current again');

// The same sequence on the Gap side, including the arm where a late failure must not erase a good answer.
_irMatState = matState({ status: 'IDLE' });
eq(_irSuggestedQtyState_(ITEM).state, 'PENDING', 'G3  IDLE is pending, not "no recommendation"');
_irMatState = matState({ status: 'LOADING' });
eq(_irSuggestedQtyState_(ITEM).state, 'PENDING', 'G3a as is LOADING');
_irMatState = matState({ status: 'READY', bySku: byP, rows: [byP[SKU]], loadedOk: true });
eq(_irSuggestedQtyState_(ITEM).value, 120, 'G3b and the answer lands');
_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READ_FAILED' } });
eq(_irSuggestedQtyState_(ITEM).reason, 'READ_FAILED',
  'G3c a later REFRESH that fails reports a failed read - it does not keep showing the number it no longer '
  + 'has a current basis for, and it does not call the failure a refusal');

// ---------------------------------------------------------------------------------------------------
section('H  calculationDate - already served, and no longer discarded');
// ---------------------------------------------------------------------------------------------------
var GS = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8');
ok(/calculationDate: /.test(GS), 'H1  42_ already stamps calculationDate on the success meta');
ok(/RECOMMENDATION_CALCULATION_DATE/.test(GS), 'H1a from the Script Property that is its authoritative source');
APPLIED_KEY = SCOPE_KEY;
_irRecoApplyEnvelope({ success: true, data: { lines: [{ sku: SKU, destinationType: 'MARKETPLACE' }] },
  meta: { requestId: 'r1', calculationMonth: '2026-10', calculationDate: '2026-10-15', planningCycle: 'M' },
  errors: [] }, SCOPE_KEY, SCOPE);
eq(_irRecoState.calculationDate, '2026-10-15',
  'H2  AND THE PAGE NOW KEEPS IT. The month and the cycle were stored and the DATE - the one field that '
  + 'places the 90-day window - was dropped on arrival');
eq(_irRecoAnswerSource_().calculationDate, '2026-10-15', 'H2a and the existing probe reports it');
eq([_irRecoAnswerSource_().calculationMonth, _irRecoAnswerSource_().planningCycle], ['2026-10', 'M'],
  'H2b beside the two it already reported');
// Read-only: the authoritative source is a Script Property and nothing here writes one.
ok(!/setProperty|setProperties/.test(IRSRC.slice(IRSRC.indexOf('function _irRecoApplyEnvelope'), IRSRC.indexOf('function _irRecoApplyEnvelope') + 2000)),
  'H3  and it is obtained by READING the answer, never by writing or probing a Property');

// ---------------------------------------------------------------------------------------------------
section('I  THE GAP PROBE - read-only, and honest about what it is not');
// ---------------------------------------------------------------------------------------------------
var byMix = {};
byMix['CO1200-B'] = row({ qty: 40, gap: 40 });
byMix['CO1200-O'] = row({ status: 'BLOCKED', note: 'Horizons not available', qty: '', gap: '' });
_irMatState = matState({ status: 'READY', bySku: byMix, rows: [byMix['CO1200-B'], byMix['CO1200-O']],
  loadedOk: true, handlerVersion: 'fm5-r4ui-r5c' });
var I = _irMatAnswerSource_();
eq(Object.keys(I.rows), ['CO1200-B', 'CO1200-O', 'CO1200-WR'],
  'I1  with no argument it answers for the three SKUs under investigation');
eq(I.rows['CO1200-WR'], { present: false, under_status: 'READY' },
  'I1a and a SKU absent from the answer says so WITH the status it was absent under - absent from a '
  + 'READ_ERROR would mean nothing was read at all');
// The six fields CP2U item 3 asks to compare, on one row, without a debug flag or an expand.
['calculation_status', 'note', 'calculation_date', 'calculated_at', 'd90_gap_qty', 'd90_suggested_qty']
  .forEach(function (f, i) {
    ok(Object.prototype.hasOwnProperty.call(I.rows['CO1200-O'], f), 'I2.' + (i + 1) + ' it reports ' + f);
  });
eq(I.rows['CO1200-O'].note, 'Horizons not available',
  'I2a INCLUDING the stored note, which the normal card replaces with "Calculation unavailable"');
eq(I.rows['CO1200-O'].d90_suggested_qty, null, 'I2b and a blank quantity is null, never 0');
eq(I.rows['CO1200-B'].d90_suggested_qty, 40, 'I2c while a stored one is the stored number');
eq(I.rows['CO1200-O'].cell_state.reason, 'REFUSED',
  'I2d and the probe reports what the CELL does with the row, from the cell own authority, so the two can '
  + 'never disagree about which is right');

eq(I.issued_request, false, 'I3  THE PROBE ISSUES NO REQUEST');
ok(/Not a fresh read/.test(I.reflects),
  'I3a and says so: this is the response ALREADY APPLIED, which is not a freshness claim');
eq([I.status, I.scope, I.row_count], ['READY', SCOPE, 2], 'I4  it reports the status, the scope and the row count');
eq(I.matches_displayed_scope, true, 'I4a and whether that scope is the one on screen');
_irMatState = matState({ status: 'READ_ERROR', error: { code: 'READ_FAILED', message: 'boom' } });
var Ie = _irMatAnswerSource_('CO1200-B');
eq([Ie.status, Ie.error.code, Ie.loaded_ok], ['READ_ERROR', 'READ_FAILED', false],
  'I5  and on a failed read it reports the ERROR, which is the state no surface could show before');
eq(Ie.rows['CO1200-B'].present, false, 'I5a with the row correctly absent rather than guessed at');

// 42_ and 43_ VERSION INDEPENDENTLY. The strings look like one series and are two.
_irMatState = matState({ status: 'READY', bySku: byMix, loadedOk: true, handlerVersion: 'fm5-r4ui-r5c' });
eq(_irMatAnswerSource_().gapMaterializationHandlerVersion, 'fm5-r4ui-r5c',
  'I6  the 43_ gap handler marker is reported');
ok(/NOT compared against the 42_/.test(_irMatAnswerSource_().handler_marker_note),
  'I6a and explicitly NOT measured against the 42_ accept list');
var MAT = IRSRC.slice(IRSRC.indexOf('function _irMatAnswerSource_'), IRSRC.indexOf('window._irMatAnswerSource_'));
ok(!/_IR_RECO_CACHE_HANDLERS|_irRecoHandlerOk_/.test(MAT),
  'I6b which the code keeps true - the recommendation accept list is not consulted here, so a string the '
  + 'two markers happen to share can never be read as agreement between them');
ok(_irRecoAnswerSource_().handlersAccepted.indexOf('fm5-r4ui-r5c') === -1,
  'I6c and the 42_ list genuinely does NOT accept r5c, so conflating them would have inverted the answer');
ok(/GAP_MATERIALIZATION_HANDLER_VERSION_/.test(
  fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/43_api_v1_gap_materialization.gs'), 'utf8')),
  'I6d and 43_ does own its own marker, so this is reporting a real field');

// ---------------------------------------------------------------------------------------------------
section('J  THE THREE READS - separated, and the sum stops wearing a clock');
// ---------------------------------------------------------------------------------------------------
var STAGES = IRSRC.slice(IRSRC.indexOf('var IR_READ_STAGES_'), IRSRC.indexOf('var IR_STAGE_IGNORED_ACTIONS_'));
ok(/\{ stage: 'recommendation_read', actions: \['recommendation.workspace.get'\] \}/.test(STAGES),
  'J1  recommendation_read is the RECOMMENDATION read only');
ok(/stage: 'materialized_gap_read'/.test(STAGES), 'J1a the materialized gap read is its own stage');
ok(/stage: 'gap_job_status'/.test(STAGES), 'J1b and the job status is a third');
ok(/stage: 'inventory_workspace'/.test(STAGES), 'J1c beside the main table, which was already separate');

// The three names older suites pin are all still declared.
['deployment_contract', 'scope_registry', 'inventory_workspace', 'recommendation_read',
 'allocation_hydration', 'carrier_authorities'].forEach(function (st, i) {
  ok(STAGES.indexOf("stage: '" + st + "'") !== -1, 'J2.' + (i + 1) + ' ' + st + ' is still declared');
});

var STAGEFN = IRSRC.slice(IRSRC.indexOf('function _irReadStageReport_'), IRSRC.indexOf('window._irReadStageReport_'));
ok(/client_elapsed_sum_ms/.test(STAGEFN), 'J3  the sum is reported under a name that says it is a sum');
ok(/client_elapsed_sum_is_not_wall_clock/.test(STAGEFN), 'J3a and is flagged as not a wall clock');
ok(/client_total_elapsed_ms/.test(STAGEFN),
  'J3b while the original key is KEPT - a pinned contract and its callers read it, and renaming it would '
  + 'have been a second defect in place of the first');
ok(/overlap/i.test(STAGEFN) && /page_boot_elapsed_ms is the only measured wall clock/.test(STAGEFN),
  'J3c with the reason recorded beside it');

// The timing report itself, over a timeline where the two reads provably overlap.
var TL = { peak_concurrent_requests: 2, request_timeline: [
  { seq: 1, action: 'inventoryReplenishment.workspace.get', dispatch_ms: 0, settled_ms: 900, elapsed_ms: 900,
    server_ms: 700, server_answered: true, code: null, phase: 'ok', http_status: 200, request_id: 'a',
    attempts: 1, marks_source: 'OBSERVED', concurrent_at_dispatch: 0, overlapped_with: [] },
  { seq: 2, action: 'recommendation.workspace.get', dispatch_ms: 1000, settled_ms: 4000, elapsed_ms: 3000,
    server_ms: null, server_answered: true, code: null, phase: 'ok', http_status: 200, request_id: 'b',
    attempts: 1, marks_source: 'OBSERVED', concurrent_at_dispatch: 1,
    overlapped_with: ['inventoryReplenishmentGap.get'] },
  { seq: 3, action: 'inventoryReplenishmentGap.get', dispatch_ms: 1010, settled_ms: 2500, elapsed_ms: 1490,
    server_ms: 1200, server_answered: true, code: null, phase: 'ok', http_status: 200, request_id: 'c',
    attempts: 1, marks_source: 'EXTERNAL_RECONSTRUCTED', concurrent_at_dispatch: 2,
    overlapped_with: ['recommendation.workspace.get'] } ] };
global.window.KM.transport = { timeline: function () { return TL; } };
eval(IRSRC.slice(IRSRC.indexOf('var IR_TIMED_READS_'), IRSRC.indexOf('window._irReadTimingReport_')));
var J = _irReadTimingReport_();
eq(J.available, true, 'J4  the report reads the timeline the transport was already keeping');
eq(J.reads.length, 4, 'J4a with a row per read');
eq(J.reads.map(function (r) { return r.read; }),
  ['inventory_workspace', 'recommendation', 'materialized_gap', 'gap_job_status'],
  'J4b THE THREE READS SEPARATED, plus the job status');
eq(J.completion_order, ['inventory_workspace', 'materialized_gap', 'recommendation'],
  'J5  AND THE ORDER THEY FINISHED IN, which is not the order they were fired and was recorded nowhere');
eq(J.dispatch_order, ['inventory_workspace', 'recommendation', 'materialized_gap'],
  'J5a beside the order they were dispatched in, so the difference is visible');
eq(J.client_elapsed_sum_ms, 5390, 'J6  the sum is 5390ms');
eq(J.observed_span_ms, 4000, 'J6a WHILE ONLY 4000ms PASSED - the sum exceeds the span, which is the '
  + 'arithmetic proof that these reads overlapped and the reason a sum may not be read as elapsed time');
ok(/DERIVED/.test(J.span_basis), 'J6b and the span declares that it is derived, not one measured interval');
eq(J.client_elapsed_sum_is_not_wall_clock, true, 'J6c the sum says what it is not');
eq(J.overlapping_pairs.length, 2, 'J7  the overlap is reported from the recorded intervals');

// server_ms: REPORTED OR NULL. Never derived from the client number.
eq(J.reads[0].server_ms, 700, 'J8  a read whose server costed itself reports that cost');
eq(J.reads[1].server_ms, null, 'J8a one that did not reports NULL');
eq(J.server_ms_missing_for, ['recommendation'], 'J8b and is NAMED as missing rather than filled in');
var TIMEFN = IRSRC.slice(IRSRC.indexOf('function _irReadTimingReport_'), IRSRC.indexOf('window._irReadTimingReport_'));
ok(/typeof r.server_ms === 'number'/.test(TIMEFN) && !/elapsed_ms \* |ms \* 0\.|estimate/i.test(TIMEFN),
  'J8c with no arithmetic anywhere that could turn a client duration into a server one');

// marks_source TRAVELS. A reconstructed interval may not pass as a measured one.
eq(J.reads[2].marks_source, 'EXTERNAL_RECONSTRUCTED', 'J9  marks_source is carried onto every row');
eq(J.reconstructed_marks, [{ read: 'materialized_gap', marks_source: 'EXTERNAL_RECONSTRUCTED' }],
  'J9a and a reconstructed row is listed');
eq(J.classification, 'OBSERVED_WITH_RECONSTRUCTED_ROWS',
  'J9b so the whole report declines to call itself purely observed');
eq(J.reads[3].not_observed, true,
  'J10 a read that never dispatched is NOT_OBSERVED, not a duration of zero - "did not happen" and '
  + '"happened instantly" are the same number and opposite facts');
eq(J.reads[3].client_elapsed_ms, null, 'J10a so its elapsed time is null');

global.window.KM.transport = null;
eq(_irReadTimingReport_().classification, 'TRANSPORT_TIMELINE_UNAVAILABLE',
  'J11 and with no transport it says it cannot see, rather than reporting zeros');

// ---------------------------------------------------------------------------------------------------
section('K  BOUNDS - what this round did not do');
// ---------------------------------------------------------------------------------------------------
var GAPGS = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/43_api_v1_gap_materialization.gs'), 'utf8');
eq(/var GAP_MATERIALIZATION_HANDLER_VERSION_ = 'fm5-r4ui-r5c';/.test(GAPGS), true,
  'K1  43_ handler marker UNCHANGED at r5c - no server behaviour moved');
eq(/var RECO_WS_HANDLER_VERSION_ = 'fm5-r4ui-r5e';/.test(GS), true,
  'K1a and 42_ UNCHANGED at r5e - this round is page-side only, so neither handler was restamped');
// No new request, no changed cache policy, no timeout, no schedule.
var NEWFNS = TIMEFN + MAT + IRSRC.slice(IRSRC.indexOf('function _irAvgSalesCellState_'), IRSRC.indexOf('window._irAvgSalesCellState_'));
ok(!/getWorkspace|getInventoryReplenishmentGap|fetch\(|\.get\(/.test(NEWFNS),
  'K2  NOT ONE of the three functions added this round issues a read - a diagnostic that costs a request is '
  + 'the thing under investigation');
ok(!/setTimeout|setInterval/.test(NEWFNS), 'K2a and none of them schedules anything');
ok(/'fm5-r4ui-r5e'/.test(IRSRC) && (IRSRC.match(/_IR_RECO_CACHE_HANDLERS = /g) || []).length === 1,
  'K3  the recommendation accept list is untouched - no cache policy moved');
ok(/EU_SALES_SOURCE_/.test(fs.readFileSync(path.join(ROOT, 'assets/js/core/supply-planning-country-identity.js'), 'utf8')),
  'K4  EU membership still lives in the shipped identity module, and this round did not touch it');
ok(true,
  'K5  NOT CLAIMED BY THIS ROUND: that the EU root cause is fixed, that any read got faster, or that any '
  + 'data is now current. Nothing here changes what is read, when, or from where - it changes only what the '
  + 'page can SAY about a read it already made.');
ok(true,
  'K6  STILL OPEN, unchanged: D-S8-B3-98 (the MARKETPLACE lane withholds the basis on an inactive '
  + 'destination - section B5 now makes it VISIBLE as BASIS_WITHHELD, which is not the same as fixing it), '
  + 'the C9 expand delay, the Gap timeout diagnostic, and the FC historical-sales features.');

console.log('\n' + passed + ' passed / ' + failed + ' failed');
if (failed) process.exitCode = 1;
