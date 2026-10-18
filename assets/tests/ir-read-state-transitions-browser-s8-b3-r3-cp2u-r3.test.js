// Kitchen Mama Operation System - S8-B3-R3-CP2U-R3
// THE READ STATES, ACCEPTED ON REAL-BROWSER EVIDENCE
//
// Run: node assets/tests/ir-read-state-transitions-browser-s8-b3-r3-cp2u-r3.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing.
//
// WHY A SECOND BROWSER CAPTURE. CP2U-R2 connected the read states to the screen and accepted that in node,
// driving the real loaders against a real DOM-less document. That suite is worth what it costs, but it
// cannot answer the question an operator asks: with a row expanded and a half-typed quantity in it, does
// the failed read SHOW, and does it cost me my work? `_cp2s-r2-inplace-dom-runner.js --states` answers it
// in real Chrome - five arrivals through the real loader, the cell read back after each, and the five
// things that must survive measured every time.
//
// WHAT MAKES THIS DIFFERENT FROM "THE TEXT CHANGED". Every absence this page can report renders as a dash,
// so a dash proves nothing on its own. Each arrival is identified by the SENTENCE the cell carries - the
// title attribute - and by its class, which is how "the read failed" is told apart from "this site has no
// line" and from "the basis was withheld". A legitimate zero is asserted to be a ZERO, because that is the
// one case where a dash would be a lie.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const EV = JSON.parse(read('docs/evidence/cp2u-r3-state-transitions/state-transitions.json'));
const R = EV.result || {};
const ST = R.states || {};
const V = ST.verdict || {};
const ARR = {};
(ST.arrivals || []).forEach(function (a) { ARR[a.label] = a; });
const avgOf = (label) => ((ARR[label] || {}).avg || {});
const dosOf = (label) => ((ARR[label] || {}).dos || {});

// -------------------------------------------------------------------------------------------------------------
section('A. the capture is current, and it is a capture');

ok(!R.fatal, 'A1  the run completed without a fatal', R.fatal);
ok(!!EV.browser, 'A1a and names the browser it ran in', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A1b and when it was taken');

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
['index.html', 'assets/js/pages/inventory-replenishment.js'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});
// Nine reads: 7, 11, failed, empty, withheld, zero, recovered, failed-again, and the new site.
ok(EV.recoReadsServed >= 9,
  'A4  every arrival was a REAL read served over the wire - nothing was injected into page state',
  EV.recoReadsServed);
ok((ST.arrivals || []).length >= 5, 'A4a and five states were driven through the loader', (ST.arrivals || []).length);
ok(V.everyArrivalSettled === true, 'A4b each one reached a settled cell within its own wait', V.everyArrivalSettled);

// -------------------------------------------------------------------------------------------------------------
section('B. a read that FAILED says so - and says it without inventing a number');

ok(V.failedSaysFailed === true, 'B1  the cell says "read failed"', avgOf('failed').text);
ok(V.failedCarriesErrorClass === true, 'B1a and carries the error class', avgOf('failed').cls);
ok(/could not be READ/i.test(avgOf('failed').title || ''),
  'B1b and the sentence names it a failed read rather than a site without history', avgOf('failed').title);
ok(V.failedIsNotZero === true, 'B2  the Avg cell is NOT a zero - a transport failure is not a sales fact', avgOf('failed').text);
ok(V.failedDosNotZero === true, 'B2a and Days of Supply is a dash, not a fabricated shortage', dosOf('failed').text);
// The arrival the node suites cannot see: the cell during the flight, sampled in the dispatching turn.
ok(V.loadingMarkSeen === true,
  'B3  the IN-FLIGHT cell carried the pending mark before the failure landed - loading and failed are '
  + 'two states on screen, not one', (ARR.failed || {}).loadingFrame);

// -------------------------------------------------------------------------------------------------------------
section('C. and the three silent absences are told APART');

ok(V.emptySaysNoLines === true,
  'C1  a read that resolved NO destination line says exactly that', avgOf('empty').title);
ok(V.emptyIsNotError === true, 'C1a and is not dressed as a failure', avgOf('empty').cls);
ok(V.withheldSaysWithheld === true,
  'C2  a line that carries no basis at all says the basis was WITHHELD (D-S8-B3-98, now visible)',
  avgOf('withheld').title);
ok(V.withheldIsDistinctFromEmpty === true,
  'C2a and that sentence is DIFFERENT from the empty one - both render a dash, so the dash is not the '
  + 'thing being tested', { empty: avgOf('empty').title, withheld: avgOf('withheld').title });
ok(V.zeroIsARealZero === true,
  'C3  a legitimate zero renders as 0 - the one case where a dash would be a lie', avgOf('zero').text);
ok(V.zeroHasNoFailureText === true, 'C3a and carries no failure wording', avgOf('zero').text);
ok(V.recoveredShowsNumber === true, 'C4  a failure is NOT sticky: the next good read shows its number',
  avgOf('recovered').text);
ok(V.recoveredClearedTitle === true,
  'C4a and the explanatory tooltip is REMOVED, not left behind as an empty box', avgOf('recovered').title);

// -------------------------------------------------------------------------------------------------------------
section('D. none of it cost the operator anything');

ok(V.noFullRebuildThroughout === true,
  'D1  renderReplenishment was never called across any arrival - a loading notice must not rebuild the table',
  (ST.arrivals || []).map(a => a.renderCalls));
ok(V.valueKeptThroughout === true, 'D2  the half-typed 1234 survived every state');
ok(V.focusKeptThroughout === true, 'D3  document.activeElement stayed on the field being typed in');
ok(V.inputSameNodeThroughout === true, 'D3a and that field is the same node throughout');
ok(V.panelKeptThroughout === true, 'D4  the expanded Execution Plan card is the same node throughout');
ok(V.scrollKeptThroughout === true, 'D5  both scroll positions are untouched',
  { before: { t: (ST.before || {}).scrollTop, l: (ST.before || {}).scrollLeft },
    after: (ST.arrivals || []).map(a => [a.scrollTop, a.scrollLeft]) });
ok(((ST.before || {}).scrollTop > 0) || ((ST.before || {}).scrollLeft > 0),
  'D5a and at least one of them was genuinely scrolled first - 0 preserved as 0 proves nothing',
  { top: (ST.before || {}).scrollTop, left: (ST.before || {}).scrollLeft });

// -------------------------------------------------------------------------------------------------------------
section('E. a failure on one site does not follow the operator to the next');

const SW = ST.siteSwitch || {};
ok(SW.ran === true, 'E1  the capture actually switched marketplace and re-searched', SW);
ok(SW.failedBeforeSwitch === true,
  'E1a with a FAILED read on screen at the moment of the switch - otherwise there is nothing to contaminate',
  SW.failedBeforeSwitch);
ok(SW.newSiteShowsItsOwnNumber === true, 'E2  the new site shows ITS OWN number', (SW.newSiteCell || {}).text);
ok(SW.newSiteFreeOfOldFailure === true,
  'E2a and carries neither the previous site\'s wording nor its error class', SW.newSiteCell);
eq(SW.anyRowStillFailed, false,
  'E3  no row anywhere in the new station is still reporting the previous station\'s failed read');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
