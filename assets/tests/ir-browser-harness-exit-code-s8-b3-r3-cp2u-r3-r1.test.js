// Kitchen Mama Operation System - S8-B3-R3-CP2U-R3-R1
// THE BROWSER HARNESS MUST BE ABLE TO FAIL
//
// Run: node assets/tests/ir-browser-harness-exit-code-s8-b3-r3-cp2u-r3-r1.test.js
//
// LOCAL / OFFLINE. Pure function under test; no browser, no network, no files written.
//
// WHY THIS SUITE EXISTS. CP2U-R3 added a --states scenario that drives five read states through the real
// loader and checks twenty things about the cells. It printed its results and THEN EXITED 0 WHATEVER THEY
// SAID: the exit code was computed from the in-place checks alone. A harness that cannot fail is not
// evidence, it is a log - and the capture it writes would have been promoted into docs/evidence by a
// green run that proved nothing.
//
// THE COUNTER-EXAMPLE IS PART OF THE SUITE. Section A re-implements the OLD algorithm verbatim and feeds
// it inputs that are plainly broken, showing it returns 0 for each. Section B feeds the SAME inputs to
// the shipped function and requires 1. Without A, B would only assert that today's code does what today's
// code does; with A, the regression it prevents is on the record and executable.
'use strict';
const path = require('path');
const RUNNER = require(path.join(__dirname, '_cp2s-r2-inplace-dom-runner.js'));
const { evaluateRun, REQUIRED_STATE_KEYS, REQUIRED_SWITCH_TRUE, MIN_STATE_ARRIVALS } = RUNNER;

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// -------------------------------------------------------------------------------------------------------------
// THE OLD ALGORITHM, copied from the runner as it stood at 30b5d06d. Kept verbatim so the defect is
// reproducible rather than described.
function OLD_exitCode(evidence, statesMode) {
  const r = (evidence && evidence.result) || {};
  const v = r.verdict || {};
  const KEYS = ['firstReadResolved', 'cellUpdated', 'secondCellIsExpectedNumber', 'dosMovedToNumber',
    'focusKept', 'selectionKept', 'valueKept', 'inputSameNode',
    'panelKept', 'scrollKept', 'windowScrollKept', 'noFullRebuild'];
  let bad = 0;
  KEYS.forEach(k => {
    const val = v[k];
    const na = typeof val === 'string' && val.indexOf('NOT_MEASURABLE') === 0;
    if (val !== true && !na) bad++;
  });
  if (statesMode && r.states && r.states.verdict) {
    // This is the whole of what the old code did with the states verdict: it PRINTED it.
    Object.keys(r.states.verdict).forEach(() => {});
  }
  return (bad === 0 && !r.fatal) ? 0 : 1;
}

// A run whose in-place half is perfect, so only the states half can fail it.
function goodInPlace() {
  return {
    firstReadResolved: true, cellUpdated: true, secondCellIsExpectedNumber: true, dosMovedToNumber: true,
    focusKept: true, selectionKept: 'NOT_MEASURABLE_NO_TEXT_FIELD', valueKept: true, inputSameNode: true,
    panelKept: true, scrollKept: true, windowScrollKept: 'NOT_MEASURABLE_WINDOW_DOES_NOT_SCROLL',
    noFullRebuild: true
  };
}
function goodStateVerdict(override) {
  const sv = {};
  REQUIRED_STATE_KEYS.forEach(k => { sv[k] = true; });
  Object.keys(override || {}).forEach(k => { sv[k] = override[k]; });
  return sv;
}
function goodSwitch(override) {
  const sw = { anyRowStillFailed: false, newSiteCell: { text: '31.0' } };
  REQUIRED_SWITCH_TRUE.forEach(k => { sw[k] = true; });
  Object.keys(override || {}).forEach(k => { sw[k] = override[k]; });
  return sw;
}
function run(stateOverride, switchOverride, extra) {
  const ev = { result: Object.assign({
    fatal: null,
    verdict: goodInPlace(),
    states: {
      arrivals: [1, 2, 3, 4, 5].map(i => ({ label: 'a' + i })),
      verdict: goodStateVerdict(stateOverride),
      siteSwitch: goodSwitch(switchOverride)
    }
  }, extra || {}) };
  return ev;
}

// Each case is a run that is WRONG in exactly one way, with everything else healthy.
const CASES = [
  ['every single state assertion failed',
    run((function () { const o = {}; REQUIRED_STATE_KEYS.forEach(k => { o[k] = false; }); return o; })())],
  ['a failed read showed a zero instead of saying it failed', run({ failedIsNotZero: false })],
  ['the loading mark was never seen', run({ loadingMarkSeen: false })],
  ['empty and withheld rendered the same sentence', run({ withheldIsDistinctFromEmpty: false })],
  ['a legitimate zero was not rendered as a zero', run({ zeroIsARealZero: false })],
  ['the table was fully rebuilt on an arrival', run({ noFullRebuildThroughout: false })],
  ['the operator lost the half-typed value', run({ valueKeptThroughout: false })],
  ['one required state key is MISSING entirely', (function () {
    const ev = run(); delete ev.result.states.verdict.recoveredShowsNumber; return ev;
  })()],
  ['the states section is missing altogether', (function () {
    const ev = run(); delete ev.result.states; return ev;
  })()],
  ['the states verdict was never computed', (function () {
    const ev = run(); delete ev.result.states.verdict; return ev;
  })()],
  ['only three arrivals were driven', (function () {
    const ev = run(); ev.result.states.arrivals = [1, 2, 3].map(i => ({ label: 'a' + i })); return ev;
  })()],
  ['the site switch never ran', run(null, { ran: false })],
  ['the site switch ran with NO failure on screen - it proves nothing', run(null, { failedBeforeSwitch: false })],
  ['the marketplace select never moved', run(null, { selectMoved: false })],
  ['the new site did not show its own number', run(null, { newSiteShowsItsOwnNumber: false })],
  ['the new site still carried the old failure', run(null, { newSiteFreeOfOldFailure: false })],
  ['a row somewhere still reported the previous station\'s failure', run(null, { anyRowStillFailed: true })],
  ['anyRowStillFailed is missing, so contamination was never checked', (function () {
    const ev = run(); delete ev.result.states.siteSwitch.anyRowStillFailed; return ev;
  })()],
  ['the site switch section is missing', (function () {
    const ev = run(); delete ev.result.states.siteSwitch; return ev;
  })()]
];

// -------------------------------------------------------------------------------------------------------------
section('A. the defect, reproduced: the OLD algorithm passes every one of these');

CASES.forEach(function (c) {
  eq(OLD_exitCode(c[1], true), 0, 'A  old code exits 0 when ' + c[0]);
});

// -------------------------------------------------------------------------------------------------------------
section('B. the fix: every one of them now fails the run');

CASES.forEach(function (c) {
  const ev = evaluateRun(c[1], { states: true });
  ok(ev.exitCode === 1, 'B  exit 1 when ' + c[0], ev.exitCode);
  ok(ev.failures.length > 0, 'B  and the reason is stated when ' + c[0], ev.failures);
});

// -------------------------------------------------------------------------------------------------------------
section('C. and a healthy run still passes - the check is not simply always-fail');

const healthy = run();
const hv = evaluateRun(healthy, { states: true });
eq(hv.exitCode, 0, 'C1  a complete, all-true states run exits 0');
eq(hv.failures.length, 0, 'C1a with nothing to report', hv.failures);
ok(hv.rows.some(r => /state transitions/.test(r)), 'C1b and the state rows were printed');

// The in-place half must keep working on its own, and must NOT demand a states section when not asked.
const inplaceOnly = { result: { fatal: null, verdict: goodInPlace() } };
eq(evaluateRun(inplaceOnly, { states: false }).exitCode, 0,
  'C2  an in-place-only run is judged on the in-place checks alone');
eq(evaluateRun(inplaceOnly, { states: true }).exitCode, 1,
  'C2a but asking for --states and getting no states section is a FAILURE, not a default pass');

// -------------------------------------------------------------------------------------------------------------
section('D. the two waivers are narrow, and nothing else may use them');

const waived = { result: { fatal: null, verdict: goodInPlace() } };
eq(evaluateRun(waived, { states: false }).exitCode, 0,
  'D1  selectionKept / windowScrollKept may answer NOT_MEASURABLE_*');
const smuggled = { result: { fatal: null, verdict: Object.assign(goodInPlace(), { focusKept: 'NOT_MEASURABLE_BECAUSE_I_SAID_SO' }) } };
eq(evaluateRun(smuggled, { states: false }).exitCode, 1,
  'D2  but a check that is NOT waivable cannot buy a pass by calling itself unmeasurable');
const missingKey = { result: { fatal: null, verdict: (function () { const v = goodInPlace(); delete v.noFullRebuild; return v; })() } };
eq(evaluateRun(missingKey, { states: false }).exitCode, 1,
  'D3  a missing in-place key is a failure, not an absence');

// -------------------------------------------------------------------------------------------------------------
section('E. a fatal always fails, whatever the verdict says');

const fatalRun = run();
fatalRun.result.fatal = 'NO_INPUT';
eq(evaluateRun(fatalRun, { states: true }).exitCode, 1, 'E1  a fatal fails the run');
eq(OLD_exitCode(fatalRun, true), 1, 'E1a the old code got this one right - recorded so the fix is not over-claimed');

// -------------------------------------------------------------------------------------------------------------
section('F. the required lists are real, and are what the suite above relies on');

ok(REQUIRED_STATE_KEYS.length >= 20, 'F1  twenty state checks are required', REQUIRED_STATE_KEYS.length);
ok(REQUIRED_SWITCH_TRUE.length >= 5, 'F2  five site-switch preconditions are required', REQUIRED_SWITCH_TRUE.length);
eq(MIN_STATE_ARRIVALS, 5, 'F3  five arrivals are required');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
