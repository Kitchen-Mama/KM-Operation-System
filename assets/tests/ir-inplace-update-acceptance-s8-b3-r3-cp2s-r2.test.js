// Kitchen Mama Operation System - S8-B3-R3-CP2S-R2
// THE IN-PLACE UPDATE, ACCEPTED ON REAL-BROWSER EVIDENCE
//
// Run: node assets/tests/ir-inplace-update-acceptance-s8-b3-r3-cp2s-r2.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing.
//
// WHY THE EVIDENCE IS A BROWSER CAPTURE. CP2S-R1 accepted the in-place update with a hand-built DOM in
// node, and that fixture tracked focus with a local variable the code under test was never given:
// `focused === T.panels['SKU-A'].input` compared the harness to itself and would have passed against a
// function that cleared focus. There was no document.activeElement, no layout, no scrolling, because a
// fake object has none of them.
//
// `_cp2s-r2-inplace-dom-runner.js` runs the real page in real Chrome, expands a real row, puts a
// half-typed quantity in the real Execution Plan field, scrolls the real containers, and lets a SECOND
// real `recommendation.workspace.get` land on top of all of it. This suite reads what came back.
//
// BOTH HALVES OR NEITHER. A table that never updates preserves everything and a full rebuild updates
// everything, so the capture must show the cells CHANGING and the operator's work SURVIVING. A2 pins the
// capture to the files it was taken from, so a later edit to the page cannot keep quoting this result.
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

const EV = JSON.parse(read('docs/evidence/cp2s-r2-inplace/inplace-dom.json'));
const R = EV.result || {};
const V = R.verdict || {};
const B = R.before || {};
const A = R.after || {};

// -------------------------------------------------------------------------------------------------------------
section('A. the capture is current, and it is a capture');

ok(!R.fatal, 'A1  the run completed without a fatal', R.fatal);
ok(!!EV.browser, 'A1a and names the browser it ran in', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A1b and when it was taken');
eq(EV.recoReadsServed, 2, 'A1c TWO workspace reads were served - the second arrival was real, not simulated');

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
['index.html', 'assets/js/pages/inventory-replenishment.js'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});
ok((EV.actionLog || []).some(a => a.action === 'recommendation.workspace.get'),
  'A4  the page really asked for the recommendation workspace over the wire');

// -------------------------------------------------------------------------------------------------------------
section('B. the update HAPPENED - half the claim, and the half a preserving no-op would pass');

// CP2U-R3 - THE EXPECTED NUMBERS, NAMED. "Not a dash" was the old bar, and CP2U-R2 walked under it: the
// in-flight cell now has a marker of its own, so "not a dash" accepts a cell that is STILL LOADING, and it
// always accepted a cell that says the read FAILED. The fixture serves 7 then 11; those are what the cell
// must hold, and the runner records them in the capture so this suite and the harness cannot drift apart.
const EXP = EV.expected || {};
ok(EXP.firstAvgCell === '7.0' && EXP.secondAvgCell === '11.0',
  'B0  the capture names the two rates its fixture served', EXP);
ok(V.firstReadResolved === true,
  'B1  the first read resolved a rate into the cell - a WAREHOUSE-lane site, which had no marketplace line '
  + 'to fall back on and showed "--" before this round', V.firstCell);
eq(V.firstCell, EXP.firstAvgCell, 'B1a and it is the FIRST read\'s rate, not a loading mark and not a failure');
eq(B.avgCell, EXP.firstAvgCell, 'B1b the cell still held that number at the moment the operator was typing');
ok(V.cellUpdated === true, 'B2  and the second arrival CHANGED it', { before: B.avgCell, after: A.avgCell });
eq(A.avgCell, EXP.secondAvgCell,
  'B2a to the SECOND read\'s rate specifically - not merely to something different');
ok(V.secondCellIsExpectedNumber === true,
  'B2b and the harness confirmed that in the live cell, with no pending mark, no failure wording and no '
  + 'error class', V.secondCellIsExpectedNumber);
ok(A.dosCell !== B.dosCell, 'B2c and Days of Supply moved with it', { before: B.dosCell, after: A.dosCell });
ok(V.dosMovedToNumber === true,
  'B2d to a NUMBER - a Days of Supply that fell back to a dash would also have "moved"', A.dosCell);

// -------------------------------------------------------------------------------------------------------------
section('C. and it cost the operator NOTHING');

ok(V.noFullRebuild === true, 'C1  renderReplenishment was never called - no full-table rebuild', A.renderReplenishmentCalls);
ok(V.panelKept === true,
  'C2  the expanded Execution Plan card is the SAME NODE - identified by a marker property set before the '
  + 'arrival, which a rebuilt node cannot carry', { sameNode: A.panelSameNode, mark: A.panelMark });
ok(V.focusKept === true, 'C3  document.activeElement is still the field the operator was typing in', A.activeMark);
ok(V.inputSameNode === true, 'C3a and that field is still in the document');
eq(A.value, '1234', 'C4  the half-typed value survived');
ok(V.scrollKept === true, 'C5  the scroll positions are untouched',
  { v: EV.result.scrollerV, h: EV.result.scrollerH, beforeTop: B.scrollTop, afterTop: A.scrollTop,
    beforeLeft: B.scrollLeft, afterLeft: A.scrollLeft });
ok(B.scrollTop > 0 || B.scrollLeft > 0,
  'C5a and at least one of them was genuinely scrolled first - 0 preserved as 0 proves nothing',
  { top: B.scrollTop, left: B.scrollLeft });

// -------------------------------------------------------------------------------------------------------------
section('D. what the capture could NOT measure, recorded rather than claimed');

// A check the page makes impossible is not a check that passed. Both of these are reported by the runner
// as NOT_MEASURABLE_* with a reason, and both are asserted to be EXACTLY that - so if the page later grows
// a text field or a scrolling window, this suite fails and the claim has to be re-made on real evidence.
const na = (v) => typeof v === 'string' && v.indexOf('NOT_MEASURABLE') === 0;
ok(V.selectionKept === true || na(V.selectionKept),
  'D1  caret position: either preserved, or named unmeasurable with its reason', V.selectionKept);
if (na(V.selectionKept)) {
  ok(/number/.test(String((R.notes || []).join(' '))),
    'D1a the reason is on the record - the only editable field in the open panel is <input type=number>, '
    + 'which exposes no selectionStart in Chrome', R.notes);
}
ok(V.windowScrollKept === true || na(V.windowScrollKept),
  'D2  window scroll: either preserved, or named unmeasurable because the window does not scroll', V.windowScrollKept);

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
