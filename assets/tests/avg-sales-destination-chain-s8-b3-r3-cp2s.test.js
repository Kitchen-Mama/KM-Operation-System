// Kitchen Mama Operation System - S8-B3-R3-CP2S section B
// A RESPONSE IN WHICH EVERY AVERAGE FAILED IS STILL A RESPONSE
//
// Run: node assets/tests/avg-sales-destination-chain-s8-b3-r3-cp2s.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes.
//
// THE DEFECT. `_irRecoRefreshVelocityCells_` is the in-place update that runs when the workspace read
// lands. It repaints only if `_irRecoHasCanonicalBasis_()` is true, and that predicate asks for ONE
// line anywhere with `horizonBasis.avgSalesPerDay != null`. So a response in which every SKU resolved
// to a NAMED QUALITY ERROR - ambiguous identity, unresolved contamination, no history - looks
// identical to a response that never arrived: the predicate says false, nothing repaints, and the
// column sits on the placeholder it had before the request was issued.
//
// That is the exact confusion CP2R-R1 spent a round removing one layer down. The server now says WHY
// no rate exists and the page now has a cell that can print it, and in between sits a gate that
// discards the whole answer because the answer was bad news. A permanent '--' is the page telling the
// operator "no sales", when what happened is "I asked, and every answer was an error I can name".
//
// WHAT THIS SUITE ALSO PINS, read-only: which of the four destination/demand combinations actually
// carry a basis at all. Three of the four questions in the round's item 5 are answered by section C and
// the answer is that the WAREHOUSE lane carries none - which is a SERVER gap, not a page gap, and is
// reported rather than papered over here.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var IRSRC = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8').replace(/\r\n/g, '\n');
var RECO = fs.readFileSync(path.join(ROOT, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8').replace(/\r\n/g, '\n');

// Whole function text, braces balanced, straight out of the shipped file.
function fnBody(src, name) {
  var i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('fn not found: ' + name);
  var d = 0, started = false;
  for (var k = i; k < src.length; k++) {
    var c = src[k];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced: ' + name);
}
// The REAL predicate + the REAL refresh, with their free variables injected by name.
// CP2S-R1 - the injected collaborator is the IN-PLACE UPDATER, not renderReplenishment. Counting renders
// was the acceptance CP2S used and the one this round replaces: it proves the right numbers arrive and
// says nothing about what arriving costs. Sections A/B still own WHEN the update runs; section E owns
// what it does to a live table, which is where the real claim lives.
function makeRefresh(state, updateFn, scopeMatches, paintFn) {
  // CP2U-R2 - the refresh now has a SECOND arm: READY-with-a-basis takes the numeric updater, and every
  // other read state takes `_irRecoPaintReadStateCells_`, which writes the marker and the sentence
  // without a row assembly. That function is declared outside this slice, so it is injected (the
  // CP2P-R2 rule). A no-op is the right stub HERE: what this suite asserts is WHEN THE NUMERIC UPDATE
  // runs, and the state painter deliberately never writes a number. The delivery of those states is
  // owned by read-state-delivery-s8-b3-r3-cp2u-r2, which drives the real loaders.
  var body = fnBody(IRSRC, '_irRecoHasCanonicalBasis_') + ';' + fnBody(IRSRC, '_irRecoRefreshVelocityCells_') +
    '; return { refresh: _irRecoRefreshVelocityCells_, has: _irRecoHasCanonicalBasis_ };';
  return new Function('_irRecoState', '_irRecoUpdateVelocityCells_', '_irResultMatchesAppliedScope_',
    '_irRecoPaintReadStateCells_',
    body)(state, updateFn, scopeMatches || function () { return true; }, paintFn || function () {});
}
function state(lines) { return { status: 'READY', linesBySku: { 'SKU-A': lines } }; }

// ---------------------------------------------------------------------------------------------------
section('A  a response where every average failed must still land on screen');
// ---------------------------------------------------------------------------------------------------
// Every line resolved, and every one of them resolved to a NAMED error. There is no rate anywhere.
var ALL_ERRORS = state([
  { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: null,
    basisQualityError: 'SALES_BASIS_CONTAMINATION_UNRESOLVED' } }
]);
var n1 = 0; var r1 = makeRefresh(ALL_ERRORS, function () { n1++; });
ok(r1.has() === true,
  'A1  a basis carrying a NAMED quality error counts as an answer, not as silence');
r1.refresh();
eq(n1, 1, 'A2  so the two cells are updated in place and the error can reach the screen');

// The CP2R-R1 cell prints `unavailable` from exactly this field. Without the repaint it never runs.
var ambiguous = state([{ destinationType: 'MARKETPLACE',
  horizonBasis: { avgSalesPerDay: null, basisQualityError: 'MARKETPLACE_SKU_AMBIGUOUS' } }]);
var n2 = 0; makeRefresh(ambiguous, function () { n2++; }).refresh();
eq(n2, 1, 'A3  an ambiguous identity updates too - every named error, not just one of them');

// --- and the normal case is unchanged ---------------------------------------------------------
var GOOD = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: 139.08 } }]);
var n3 = 0; makeRefresh(GOOD, function () { n3++; }).refresh();
eq(n3, 1, 'A4  a real rate still updates, exactly as before');

var ZERO = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: 0 } }]);
var n4 = 0; makeRefresh(ZERO, function () { n4++; }).refresh();
eq(n4, 1, 'A5  and a confirmed ZERO updates - 0 is a rate, not a missing one');

// ---------------------------------------------------------------------------------------------------
section('B  what must NOT trigger a repaint');
// ---------------------------------------------------------------------------------------------------
// Over-applying this is cheap and wrong: a full table render for nothing is the cost this gate exists
// to avoid, and a response carrying no basis at all has nothing new to show.
var NO_BASIS = state([{ destinationType: 'WAREHOUSE' }, { destinationType: 'MARKETPLACE' }]);
var n5 = 0; var r5 = makeRefresh(NO_BASIS, function () { n5++; });
ok(r5.has() === false, 'B1  lines with NO horizonBasis at all are not an answer');
r5.refresh();
eq(n5, 0, 'B1a so nothing is updated');

var EMPTY_BASIS = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: null, basisQualityError: null } }]);
var n6 = 0; var r6 = makeRefresh(EMPTY_BASIS, function () { n6++; });
ok(r6.has() === false,
  'B2  a basis with neither a rate NOR a named error says nothing and does not update');
r6.refresh(); eq(n6, 0, 'B2a confirmed');

// --- the stale-scope guard is untouched ---------------------------------------------------------
// S8-R4D-F1A: a result for ANOTHER site is not a slow result, it is a wrong one. A quality error from
// the wrong scope must not repaint either - that would be this fix re-opening a closed defect.
var n7 = 0; var r7 = makeRefresh(ALL_ERRORS, function () { n7++; }, function () { return false; });
ok(r7.has() === false, 'B3  a response for a DIFFERENT site is still refused, errors included');
r7.refresh(); eq(n7, 0, 'B3a and still updates nothing');

// --- a non-READY status is still not a result ----------------------------------------------------
var loading = { status: 'LOADING', linesBySku: ALL_ERRORS.linesBySku };
var n8 = 0; makeRefresh(loading, function () { n8++; }).refresh();
eq(n8, 0, 'B4  LOADING does not update, however many errors it is carrying');

// ---------------------------------------------------------------------------------------------------
section('C  the four destination / demand combinations, now that the server half landed');
// ---------------------------------------------------------------------------------------------------
// CP2S recorded this table as a GAP and said this section would fail when the server half landed. It did,
// in CP2S-R1, and that is the only reason the text below changed.
var MKT_FN = fnBody(RECO, 'recoWsExpandMarketplace_');
var WH_FN = fnBody(RECO, 'recoWsExpandWarehouse_');
var BUILDER = fnBody(RECO, 'recoWsBasisOf_');

ok(/mLine\.horizonBasis = recoWsBasisOf_\(/.test(MKT_FN), 'C1  MARKETPLACE publishes a basis');
ok(/ln\.horizonBasis = whBasis/.test(WH_FN), 'C2  WAREHOUSE publishes one too - the gap CP2S recorded is closed');
ok(/demandMode: planModel/.test(BUILDER),
  'C3  through ONE builder, so the two lanes cannot drift into describing the basis differently');

// --- both demand modes, in BOTH lanes ----------------------------------------------------------
ok(/^\s*var sr = recoWsResolveSalesRate_\(/m.test(MKT_FN),
  'C4  the marketplace lane resolves the rate ungated by demand mode');
ok(/^\s*var wsr = recoWsResolveSalesRate_\(/m.test(WH_FN),
  'C4a and so does the warehouse lane now - a forecast_driven site still HAS a historical average');
ok(/if \(whPlanModel === 'sales_driven'\) \{ if \(wsr\.ok\) whSalesRate/.test(WH_FN),
  'C4b while the PLANNING input stays gated on sales_driven - displaying a rate is not driving demand with it');

// --- one basis per site SKU, never per warehouse -----------------------------------------------
// The two forbidden shapes are a per-warehouse recompute and an average of averages. Both would need the
// resolver or the builder INSIDE the per-warehouse loop, so that is what is checked.
// Bounded at BOTH ends on purpose: an open-ended slice runs to the end of the function and would have
// swallowed the post-loop attachment, so C5a would have failed for the one shape that is correct.
var whLoop = WH_FN.slice(WH_FN.indexOf('ruleset.warehouses.forEach'), WH_FN.indexOf('var whBasis'));
ok(!/recoWsResolveSalesRate_/.test(whLoop),
  'C5  the resolver is NOT called inside the per-warehouse loop - one site SKU, one resolution');
ok(!/recoWsBasisOf_/.test(whLoop),
  'C5a nor is the builder - every warehouse line carries the SAME basis object, not its own');
ok(/var whBasis = recoWsBasisOf_\(wsr, whPlanModel\);/.test(WH_FN), 'C5b built once, from that one resolution');
ok(!/avgSalesPerDay[^\n]*\/\s*(ruleset\.warehouses\.length|lines\.length)/.test(WH_FN),
  'C5c and nothing divides a rate by a warehouse count - there is no averaged average here');

// --- not disabled by a horizon or a configuration failure --------------------------------------
// S8-B3-R3-CP2S-R2 - SUPERSEDED BY AN EXECUTED PROOF, AND C6a IS THE REASON TO DISTRUST THE OLD PAIR.
//
// C6 matched the attachment literal; C6a asserted that it sits after the LAST `lines.push(`, and called
// that "so no early return can miss it". Both PASSED on a build where an early return DID miss it: the
// ruleset gate pushes its blocked line and returns about sixty lines above the attachment, so it is
// textually before it and the ordering check was satisfied by the very return that defeated it. A
// statement about CONTROL FLOW was tested by comparing two string offsets.
//
// What replaces it runs the real expander against a scope with no demand-allocation rule and reads the
// basis off the line it returns: avg-sales-warehouse-cell-chain-s8-b3-r3-cp2s-r2 section A. Both exits
// now go through one `whReturn_`, which is what makes a third exit safe; that is asserted here as a
// structural fact, with the behaviour owned by the suite that executes it.
ok(/function whReturn_\(ls\) \{ ls\.forEach\(function \(ln\) \{ ln\.horizonBasis = whBasis; \}\); return \{ lines: ls \}; \}/.test(WH_FN),
  'C6  ONE exit helper attaches the basis - so a new return cannot forget it');
ok(!/\n  return \{ lines: lines \};/.test(WH_FN),
  'C6a and no return bypasses it - every exit from this function goes through whReturn_');

// --- opening / incoming stay null on a warehouse line ------------------------------------------
ok(/var whBasis = recoWsBasisOf_\(wsr, whPlanModel\);/.test(WH_FN),
  'C7  the warehouse basis is built with NO opening/incoming - those are per-warehouse horizon inputs, and '
  + 'per-warehouse numbers on a shared object is how a reader starts believing the averages differ');
ok(/horizonOpeningQty: \(openingQty === undefined \? null : openingQty\)/.test(BUILDER),
  'C7a so the builder renders them null rather than 0 - absent is not zero');

// --- the skip count reaches the response -------------------------------------------------------
ok(/blankDateRows: \(sr\.blankDateRows == null \? null : sr\.blankDateRows\)/.test(BUILDER),
  'C8  the undated-row count travels on the basis, for BOTH lanes, because one builder owns the shape');
ok(/blankDateRows: _irNumOrNull\(L\.horizonBasis\.blankDateRows\)/.test(IRSRC),
  'C8a and the page response mapping carries it through');

// --- the formulas this round must not move -----------------------------------------------------
ok(/KMDA\.allocateMarketplaceDemand\(fcMonth, ruleset, 'forecast'\)/.test(WH_FN),
  'C9  the demand split is still forecast-driven and unchanged');
ok(!/allocateMarketplaceDemand\([^)]*(avgSalesPerDay|whSalesRate)/.test(RECO),
  'C9a no sales rate reached the allocation call');

// ---------------------------------------------------------------------------------------------------
section('D  the REAL response boundary, executed end to end');
// ---------------------------------------------------------------------------------------------------
// CP2S-R1. Sections A-C read the shipped text. This one RUNS the two boundaries a value actually crosses:
// the server's basis builder, and the page's response mapper. A count that is only ever asserted at the
// resolver is a count nobody has shown reaching a surface.
var vmD = require('vm');
var boxD = { console: console };
var ctxD = vmD.createContext(boxD);
vmD.runInContext(fnBody(RECO, 'recoWsBasisOf_'), ctxD);
vmD.runInContext(fnBody(IRSRC, '_irNumOrNull'), ctxD);
vmD.runInContext(fnBody(IRSRC, '_irRecoMapLine'), ctxD);
vmD.runInContext('function _irRecoMapHorizon(h){ return h; }', ctxD);

function roundTrip(sr, planModel, opening, incoming) {
  boxD.__sr = sr; boxD.__pm = planModel; boxD.__op = opening; boxD.__in = incoming;
  var basis = vmD.runInContext('recoWsBasisOf_(__sr, __pm, __op, __in)', ctxD);
  boxD.__line = { sku: 'SKU-A', destinationType: 'WAREHOUSE', horizonBasis: basis };
  return { basis: basis, mapped: vmD.runInContext('_irRecoMapLine(__line)', ctxD) };
}

// --- a resolved basis, with skipped rows --------------------------------------------------------
var OKSR = { ok: true, avgSalesPerDay: 10, source: 'normalized_30d', warning: '', normalDayCount: 30,
  excludedDates: [], contaminationSource: { campaigns: 'PRESENT', events: 'ABSENT' }, blankDateRows: 353 };
var t1 = roundTrip(OKSR, 'sales_driven');
eq(t1.basis.blankDateRows, 353, 'D1  the server basis carries the skipped-row count');
eq(t1.mapped.horizonBasis.blankDateRows, 353, 'D2  and the PAGE RESPONSE MAPPING carries it through');
eq(t1.mapped.horizonBasis.avgSalesPerDay, 10, 'D2a beside the rate it did not stop');
eq(t1.mapped.horizonBasis.source, 'normalized_30d', 'D2b and the quality fields');

// --- and on a FAILURE, which is where the count explains something ------------------------------
var FAILSR = { ok: false, reason: 'SALES_BASIS_UNAVAILABLE',
  detail: 'no daily or weekly rows @ US/Amazon (9 undated rows skipped)', blankDateRows: 9 };
var t2 = roundTrip(FAILSR, 'forecast_driven');
eq(t2.mapped.horizonBasis.blankDateRows, 9,
  'D3  a FAILED basis still reports how many rows it could not date - "no usable rows" and "they were all '
  + 'undated" are different repairs');
eq(t2.mapped.horizonBasis.basisQualityError, 'SALES_BASIS_UNAVAILABLE', 'D3a with the named reason beside it');
eq(t2.mapped.horizonBasis.avgSalesPerDay, null, 'D3b and no rate - a count is not a substitute for one');

// --- zero skips reports 0, not nothing ----------------------------------------------------------
var t3 = roundTrip({ ok: true, avgSalesPerDay: 4, source: 'weekly_7d', warning: 'insufficient_normal_days',
  normalDayCount: 2, excludedDates: null, blankDateRows: 0 }, 'sales_driven');
eq(t3.mapped.horizonBasis.blankDateRows, 0, 'D4  a clean scope reports 0 rather than null - absent is not zero');
eq(t3.mapped.horizonBasis.warning, 'insufficient_normal_days', 'D4a and the fallback is still marked');

// --- a resolver that never set the field at all -------------------------------------------------
var t4 = roundTrip({ ok: false, reason: 'MARKETPLACE_SKU_AMBIGUOUS' }, 'sales_driven');
eq(t4.mapped.horizonBasis.blankDateRows, null,
  'D5  a reason unrelated to dates carries null, not 0 - it did not count zero, it did not count');

// --- the WAREHOUSE shape the lane actually builds ------------------------------------------------
var t5 = roundTrip(OKSR, 'forecast_driven');           // no opening, no incoming - the warehouse call
eq(t5.mapped.horizonBasis.horizonOpeningQty, null, 'D6  a warehouse basis maps opening as null');
eq(t5.mapped.horizonBasis.qualifiedIncomingCount, null, 'D6a and incoming count as null');
eq(t5.mapped.horizonBasis.demandMode, 'forecast_driven', 'D6b carrying the demand mode it was built for');
eq(t5.mapped.horizonBasis.avgSalesPerDay, 10,
  'D6c and a forecast_driven WAREHOUSE line publishes a real historical rate - the chain is complete');

// --- the marketplace shape keeps its per-line numbers --------------------------------------------
var t6 = roundTrip(OKSR, 'sales_driven', 500, 3);
eq(t6.mapped.horizonBasis.horizonOpeningQty, 500, 'D7  a marketplace basis still carries its own opening');
eq(t6.mapped.horizonBasis.qualifiedIncomingCount, 3, 'D7a and its own incoming count');

// ---------------------------------------------------------------------------------------------------
section('E  the update is IN PLACE - what the operator was doing survives it');
// ---------------------------------------------------------------------------------------------------
// CP2S accepted "renderReplenishment was called once" as the acceptance here, which proves the right
// numbers arrive and says nothing about what arriving costs. renderReplenishment rebuilds the whole main
// table, and this runs on an async arrival that can land seconds after the paint: an expanded row
// collapses, the Execution Plan nodes inside it are destroyed, a half-typed input loses its value, focus
// moves to the body and the scroll position jumps. So the acceptance is now what SURVIVES.
//
// A hand-built DOM, because there is no jsdom here and this repo's convention is a fake supporting exactly
// what the code under test touches. Node IDENTITY is tracked, so "still there" means the same object and
// not an equal-looking replacement.
function el(tag, cls) {
  return { tag: tag, className: cls || '', innerHTML: '', textContent: '', _attrs: {}, children: [],
    setAttribute: function (k, v) { this._attrs[k] = String(v); },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getAttribute: function (k) { return this._attrs[k] === undefined ? null : this._attrs[k]; },
    querySelector: function (sel) {
      var want = sel.replace('.', '');
      for (var i = 0; i < this.children.length; i++) {
        if ((' ' + this.children[i].className + ' ').indexOf(' ' + want + ' ') !== -1) return this.children[i];
      }
      return null;
    } };
}
function buildTable(skus) {
  var rows = [], panels = {};
  skus.forEach(function (sku) {
    var row = el('div', 'scroll-row');
    row.setAttribute('data-sku', sku);
    var avg = el('div', 'scroll-cell replen-avg-cell');  avg.innerHTML = '--';
    var dos = el('div', 'scroll-cell replen-dos-cell');  dos.textContent = '--';
    var other = el('div', 'scroll-cell replen-suggested-cell'); other.innerHTML = 'PENDING';
    row.children.push(avg, dos, other);
    rows.push(row);
    var panel = el('div', 'replen-panel');
    var exec = el('div', 'exec-plan-node'); exec.innerHTML = 'ROUTE-A';
    var input = el('input', 'exec-qty'); input.value = '1234';
    panel.children.push(exec, input);
    panels[sku] = { panel: panel, exec: exec, input: input };
  });
  return { rows: rows, panels: panels };
}

var T = buildTable(['SKU-A', 'SKU-B']);
var scroller = { scrollTop: 880, scrollLeft: 240 };
var focused = T.panels['SKU-A'].input;

var ITEMS = [
  { sku: 'SKU-A', avgDailySales: '12.5', daysOfSupply: '41', avgSalesQualityError: null,
    avgSalesWarning: 'low_sample_warning', avgSalesSource: 'normalized_30d' },
  { sku: 'SKU-B', avgDailySales: '--', daysOfSupply: '--',
    avgSalesQualityError: 'SALES_BASIS_CONTAMINATION_UNRESOLVED', avgSalesWarning: null }
];

var boxE = { console: console, renderCount: 0, ITEMS: ITEMS, ROWS: T.rows,
  document: { querySelectorAll: function (sel) { return /scroll-row/.test(sel) ? boxE.ROWS : []; } } };
var ctxE = vmD.createContext(boxE);
vmD.runInContext('function escapeReplenHtml(v){ return String(v==null?"":v); }', ctxE);
vmD.runInContext('function renderReplenishment(){ renderCount++; }', ctxE);
// _irDosCellClass_ reads window.IRMap for its colour band. The BAND is not what this section is about -
// it is declared so the real function can run rather than be stubbed out of the test it belongs in.
vmD.runInContext('var window = { IRMap: { dosColorClass: function (d) { return d === "--" ? "" : "dos-ok"; } } };', ctxE);
vmD.runInContext('function getReplenishmentData(){ return ITEMS; }', ctxE);
['IR_AVG_QUALITY_TEXT', 'IR_AVG_WARNING_TEXT'].forEach(function (name) {
  var i = IRSRC.indexOf('var ' + name + ' = {');
  vmD.runInContext(IRSRC.slice(i, IRSRC.indexOf('};', i) + 2), ctxE);
});
['_irAvgSalesQualityNote_', '_irAvgSalesWindowNote_', '_irAvgSalesTitleText_', '_irAvgSalesCellClass_', '_irAvgSalesFlagHtml_', '_irDosCellClass_',
 '_irRecoUpdateVelocityCells_'].forEach(function (fn) { vmD.runInContext(fnBody(IRSRC, fn), ctxE); });

var beforeExecA = T.panels['SKU-A'].exec, beforeInputA = T.panels['SKU-A'].input;
var beforeOtherA = T.rows[0].children[2], beforeOtherHtml = beforeOtherA.innerHTML;

vmD.runInContext('_irRecoUpdateVelocityCells_()', ctxE);

// --- the numbers DID arrive ---------------------------------------------------------------------
ok(T.rows[0].children[0].innerHTML.indexOf('12.5') === 0, 'E1  the Avg cell now shows the canonical rate',
  T.rows[0].children[0].innerHTML);
eq(T.rows[0].children[1].textContent, '41', 'E1a and Days of Supply with it');
ok(T.rows[0].children[0].innerHTML.indexOf('replen-avg-flag--warning') !== -1,
  'E1b the low-sample mark is beside the number');
ok(String(T.rows[0].children[0].getAttribute('title')).indexOf('seven normal days') !== -1,
  'E1c and the title explains it');

// --- an ALL-ERROR response still reaches the screen ----------------------------------------------
ok(T.rows[1].children[0].innerHTML.indexOf('unavailable') !== -1,
  'E2  a row whose basis is a NAMED error renders unavailable - the whole point of B7',
  T.rows[1].children[0].innerHTML);
ok(T.rows[1].children[0].className.indexOf('replen-cell--avg-error') !== -1, 'E2a with the error class');
ok(T.rows[1].children[0].className.indexOf('replen-avg-cell') !== -1,
  'E2b and the hook class survives the rewrite, or the NEXT update would find nothing');

// --- and nothing else moved ----------------------------------------------------------------------
eq(boxE.renderCount, 0, 'E3  renderReplenishment was NOT called - no full-table rebuild');
ok(T.panels['SKU-A'].exec === beforeExecA,
  'E4  the Execution Plan node is the SAME NODE - not destroyed and rebuilt');
ok(T.panels['SKU-A'].input === beforeInputA, 'E4a and so is the input the operator was typing into');
eq(T.panels['SKU-A'].input.value, '1234', 'E5  the half-typed value is still there');
ok(focused === T.panels['SKU-A'].input, 'E6  focus still points at a node that still exists');
eq([scroller.scrollTop, scroller.scrollLeft], [880, 240], 'E7  the scroll position is untouched');
ok(T.rows[0].children[2] === beforeOtherA, 'E8  a neighbouring cell is the same node');
eq(T.rows[0].children[2].innerHTML, beforeOtherHtml, 'E8a with its content untouched - only two cells are written');

// --- a row with no current data is LEFT ALONE, never blanked -------------------------------------
var T2 = buildTable(['SKU-GONE']);
T2.rows[0].children[0].innerHTML = '9.9';
boxE.ROWS = T2.rows;
vmD.runInContext('_irRecoUpdateVelocityCells_()', ctxE);
eq(T2.rows[0].children[0].innerHTML, '9.9',
  'E9  a row absent from the current data keeps what it had - an update is not a reason to blank a cell');

// --- the title is REMOVED when the quality note clears --------------------------------------------
var T3 = buildTable(['SKU-A']);
T3.rows[0].children[0].setAttribute('title', 'stale note');
boxE.ROWS = T3.rows;
boxE.ITEMS = [{ sku: 'SKU-A', avgDailySales: '7.0', daysOfSupply: '12', avgSalesQualityError: null,
  avgSalesWarning: null, avgSalesSource: 'normalized_30d' }];
vmD.runInContext('_irRecoUpdateVelocityCells_()', ctxE);
eq(T3.rows[0].children[0].getAttribute('title'), null,
  'E10 a recovered cell loses its old tooltip rather than keeping an empty one');

// --- and the refresh gate calls the in-place updater, not the rebuild -----------------------------
// COMMENTS STRIPPED. The prose inside the function NAMES renderReplenishment in order to record that it
// is deliberately not called, so a regex over the raw text would be testing the comment - and would
// start passing the moment somebody deleted it.
var REFRESH = fnBody(IRSRC, '_irRecoRefreshVelocityCells_').split('\n').map(function (L) { return L.replace(/\/\/.*$/, ''); }).join(' ');
ok(/_irRecoUpdateVelocityCells_\(\)/.test(REFRESH), 'E11 the async arrival routes to the in-place update');
ok(!/renderReplenishment\(\)/.test(REFRESH), 'E11a and never to the full rebuild');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
