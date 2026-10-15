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
function makeRefresh(state, renderFn, scopeMatches) {
  var body = fnBody(IRSRC, '_irRecoHasCanonicalBasis_') + '\n' + fnBody(IRSRC, '_irRecoRefreshVelocityCells_') +
    '\n return { refresh: _irRecoRefreshVelocityCells_, has: _irRecoHasCanonicalBasis_ };';
  return new Function('_irRecoState', 'renderReplenishment', '_irResultMatchesAppliedScope_',
    body)(state, renderFn, scopeMatches || function () { return true; });
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
eq(n1, 1, 'A2  so the cells are repainted and the error can reach the screen');

// The CP2R-R1 cell prints `unavailable` from exactly this field. Without the repaint it never runs.
var ambiguous = state([{ destinationType: 'MARKETPLACE',
  horizonBasis: { avgSalesPerDay: null, basisQualityError: 'MARKETPLACE_SKU_AMBIGUOUS' } }]);
var n2 = 0; makeRefresh(ambiguous, function () { n2++; }).refresh();
eq(n2, 1, 'A3  an ambiguous identity repaints too - every named error, not just one of them');

// --- and the normal case is unchanged ---------------------------------------------------------
var GOOD = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: 139.08 } }]);
var n3 = 0; makeRefresh(GOOD, function () { n3++; }).refresh();
eq(n3, 1, 'A4  a real rate still repaints, exactly as before');

var ZERO = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: 0 } }]);
var n4 = 0; makeRefresh(ZERO, function () { n4++; }).refresh();
eq(n4, 1, 'A5  and a confirmed ZERO repaints - 0 is a rate, not a missing one');

// ---------------------------------------------------------------------------------------------------
section('B  what must NOT trigger a repaint');
// ---------------------------------------------------------------------------------------------------
// Over-applying this is cheap and wrong: a full table render for nothing is the cost this gate exists
// to avoid, and a response carrying no basis at all has nothing new to show.
var NO_BASIS = state([{ destinationType: 'WAREHOUSE' }, { destinationType: 'MARKETPLACE' }]);
var n5 = 0; var r5 = makeRefresh(NO_BASIS, function () { n5++; });
ok(r5.has() === false, 'B1  lines with NO horizonBasis at all are not an answer');
r5.refresh();
eq(n5, 0, 'B1a so nothing repaints');

var EMPTY_BASIS = state([{ destinationType: 'MARKETPLACE', horizonBasis: { avgSalesPerDay: null, basisQualityError: null } }]);
var n6 = 0; var r6 = makeRefresh(EMPTY_BASIS, function () { n6++; });
ok(r6.has() === false,
  'B2  a basis with neither a rate NOR a named error says nothing and does not repaint');
r6.refresh(); eq(n6, 0, 'B2a confirmed');

// --- the stale-scope guard is untouched ---------------------------------------------------------
// S8-R4D-F1A: a result for ANOTHER site is not a slow result, it is a wrong one. A quality error from
// the wrong scope must not repaint either - that would be this fix re-opening a closed defect.
var n7 = 0; var r7 = makeRefresh(ALL_ERRORS, function () { n7++; }, function () { return false; });
ok(r7.has() === false, 'B3  a response for a DIFFERENT site is still refused, errors included');
r7.refresh(); eq(n7, 0, 'B3a and still repaints nothing');

// --- a non-READY status is still not a result ----------------------------------------------------
var loading = { status: 'LOADING', linesBySku: ALL_ERRORS.linesBySku };
var n8 = 0; makeRefresh(loading, function () { n8++; }).refresh();
eq(n8, 0, 'B4  LOADING does not repaint, however many errors it is carrying');

// ---------------------------------------------------------------------------------------------------
section('C  the four destination / demand combinations, as they actually stand');
// ---------------------------------------------------------------------------------------------------
// Read-only. This section does not fix the gap it records; it stops the gap being re-discovered as a
// surprise, and it will fail the moment the server half lands - which is the point.
var MKT_FN = fnBody(RECO, 'recoWsExpandMarketplace_');
var WH_FN = fnBody(RECO, 'recoWsExpandWarehouse_');
ok(/mLine\.horizonBasis = \{/.test(MKT_FN), 'C1  the MARKETPLACE expander publishes a horizonBasis');
ok(/demandMode: planModel/.test(MKT_FN),
  'C1a for BOTH demand modes - it carries the mode rather than gating on it (CP2R)');
ok(!/horizonBasis/.test(WH_FN),
  'C2  the WAREHOUSE expander publishes NONE - this is the gap, and it is SERVER-side');

// And the page can only pick what the server sent.
var PICK = fnBody(IRSRC, '_irCanonicalSalesBasis_');
ok(/destinationType === 'MARKETPLACE'/.test(PICK),
  'C3  the page picker looks only at MARKETPLACE lines');
// A self_fulfilled site is routed to the WAREHOUSE lane and produces no MARKETPLACE line at all, so
// for those sites the chain has no link to pick. Widening the PICKER alone cannot fix it: there is
// nothing on the warehouse line to find. Recorded so "the page only picks MARKETPLACE" is not
// mistaken for the whole defect.
ok(/self_fulfilled/.test(RECO) && /platform_fulfilled/.test(RECO),
  'C4  the fulfillment model routes a site to exactly one lane');
ok(true, 'C5  CONSEQUENCE (recorded, not asserted as acceptable): a self_fulfilled site publishes no '
  + 'historical average at all, and that is NOT the same fact as "this site had no sales"');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
process.exitCode = failed === 0 ? 0 : 1;
