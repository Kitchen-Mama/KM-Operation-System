// Kitchen Mama Operation System - S8-B3-R3-CP2T P1
// THE prevMonth BUILDER, ACCEPTED ON A REAL-BROWSER OPERATION
//
// Run: node assets/tests/fc-prevmonth-operation-acceptance-s8-b3-r3-cp2t.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing.
//
// FCB1 derived the Based period from Target and locked both fields, and FCB1-R1 accepted that from the
// shipped source. This suite reads a capture of the OPERATION: open the page, click "+ New FC Update",
// choose Regular, Next, switch the method to "Adjust From Previous Month Forecast", type Target 2027 /
// January, and look at what the page does.
//
// TWO THINGS THE RUNNER HAD TO LEARN, both recorded here because they change what the numbers mean:
//
//   * THE BUILDER IS NOT REACHED BY CALLING ITS OPENER. `openRegularUpdateModal()` REFUSES when the
//     builder prerequisites are not loaded and re-opens the mode-select modal instead. The first run
//     called it directly and reported "modal not visible", which would have read as a page defect; the
//     operator's route is the button, the card and Next, which loads the prerequisites first.
//
//   * A PROGRAMMATIC ASSIGNMENT IS NOT EDITING. The first instrument set `el.value` and concluded the
//     field was editable when the assignment stuck. `readonly` and `disabled` restrain the USER AGENT,
//     not a script, so that check would have failed against a perfectly locked field. What the browser
//     DOES enforce is checked instead - a disabled control cannot take focus - and the readonly input is
//     reported as readOnly plus off the tab order, with the keystroke half stated as NOT tested rather
//     than implied.
//
// AND THE DEFENCE THAT HOLDS WHEN THE LOCK DOES NOT: with the Based fields FORCED to 1999 / June by
// script, Preview still computed for Jan 2027. The lock stops the operator; deriving the period from
// Target is what stops everything else, and that is FCB1's actual repair.
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

const EV = JSON.parse(read('docs/evidence/cp2t-fc-prevmonth/fc-prevmonth.json'));
const R = EV.result || {};
const C = R.checks || {};

// -------------------------------------------------------------------------------------------------------------
section('A. the capture is current');
ok(!R.fatal, 'A1  the operation completed without a fatal', R.fatal);
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A1b and when');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
['assets/js/pages/fc-summary.js', 'assets/html/pages/fc-summary.html'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});

// -------------------------------------------------------------------------------------------------------------
section('B. the operator route reaches the builder');
ok(C.addButtonFound === true, 'B1  the "+ New FC Update" entry point exists on the page');
ok(C.modeSelectVisible === true, 'B2  it opens the mode-select modal');
ok(C.builderVisible === true,
  'B3  and Next loads the prerequisites and opens the Regular builder - the opener alone does not, which '
  + 'is why the first run of this capture reported a modal that never appeared');

// -------------------------------------------------------------------------------------------------------------
section('C. Target 2027 / January derives Based 2026 / December');
ok(C.basedRowVisible === true, 'C1  the prevMonth method shows the Based row');
ok(C.baseRowHiddenUnderPrevMonth === true, 'C1a and hides the growth Base row, so only one pair is on screen');
eq(C.target && C.target.year, '2027', 'C2  Target year is what was typed');
eq(C.target && C.target.month, '0', 'C2a and Target month is January');
eq(C.derived && C.derived.basedYear, '2026', 'C3  Based YEAR rolled back across the year boundary');
eq(C.derived && C.derived.basedMonthText, 'December', 'C3a and Based MONTH is December');
eq(C.derivedAfterYearChange && C.derivedAfterYearChange.basedYear, '2027',
  'C4  and it follows a later Target change (2028 January -> 2027 December)');

// -------------------------------------------------------------------------------------------------------------
section('D. neither Based field is editable by the operator');
const by = C.basedYearLock || {}, bm = C.basedMonthLock || {};
ok(by.readOnly === true, 'D1  Based Year is readonly');
ok(by.keyboardReachable === false, 'D1a and off the tab order, so it is not reachable by keyboard either');
ok(by.uaLocked === true, 'D1b -> user-agent locked');
ok(bm.disabled === true, 'D2  Based Month is disabled');
ok(bm.focusTaken === false,
  'D2a and the browser REFUSED it focus - a real, browser-enforced check rather than an attribute reading');
ok(bm.uaLocked === true, 'D2b -> user-agent locked');
ok(by.programmaticAssignmentStuck === true && bm.programmaticAssignmentStuck === true,
  'D3  a script CAN still assign both - recorded so nobody mistakes the previous instrument for a lock test');

// -------------------------------------------------------------------------------------------------------------
section('E. Preview, and its revocation');
ok(C.previewShown === true, 'E1  Preview renders for a scoped SKU', { scope: C.scope, sku: C.sku });
ok(C.saveEnabledAfterPreview === true, 'E1a and Save becomes available');
eq(C.previewVisibleAfterTargetChange, false, 'E2  changing Target WITHDRAWS the preview');
eq(C.saveDisabledAfterTargetChange, true, 'E2a and disables Save - a preview for a period nobody chose may not be saved');

// -------------------------------------------------------------------------------------------------------------
section('F. the defence that holds when the lock does not');
ok(C.forcedPreviewShown === true, 'F1  with Based FORCED to 1999 / June, Preview still runs');
ok(/Jan\s*2027/i.test(String(C.forcedPreviewText || '')),
  'F2  and it computes for Jan 2027 - the period is DERIVED from Target, not read back out of the field',
  C.forcedPreviewText);
eq(C.basedAfterForcedPreview && C.basedAfterForcedPreview.year, '1999',
  'F2a while the forced value is still sitting in the DOM, so F2 is not passing by accident');

// -------------------------------------------------------------------------------------------------------------
section('G. Apply Growth Rate keeps ITS OWN base editable');
ok(C.growthRowVisible === true, 'G1  switching back to Apply Growth Rate shows the growth Base row');
ok(C.growthBaseYearAttrs && C.growthBaseYearAttrs.readOnly === false && C.growthBaseYearAttrs.disabled === false,
  'G2  its Base Year carries neither lock');
ok(C.growthBaseMonthAttrs && C.growthBaseMonthAttrs.disabled === false, 'G2a nor its Base Month');
ok(C.growthBaseYearEditable === true, 'G3  and the year still takes a new value');
ok(C.growthBaseMonthEditable === true, 'G3a and so does the month - the round that locked one pair did not lock the other');

// -------------------------------------------------------------------------------------------------------------
section('H. what this capture does NOT establish');
ok(true, 'H1  NOT TESTED: that a KEYSTROKE is refused by the readonly input. Proving that needs real key '
  + 'injection; what is proven is readOnly + off the tab order + the derived-period defence in F.');
ok(true, 'H2  NOT CLAIMED: the preview QUANTITIES. The fixture\'s forecast rows did not match the shapes the '
  + 'page reads, so the preview rendered its period correctly over empty values. The period is what P1 asks about.');
ok(true, 'H3  NOT DONE: Save. The Owner acceptance for this builder is Preview / Cancel, and the run never clicks Save.');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
