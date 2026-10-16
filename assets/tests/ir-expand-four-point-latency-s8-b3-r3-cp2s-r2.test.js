// Kitchen Mama Operation System - S8-B3-R3-CP2S-R2 item 6 (C9)
// THE FOUR POINTS ARE SEPARATED AND MEASURED. THE FIRST-FRAME WORK IS NOT REMOVED.
//
// Run: node assets/tests/ir-expand-four-point-latency-s8-b3-r3-cp2s-r2.test.js
//
// LOCAL / OFFLINE. Reads the capture; captures nothing.
//
// WHAT THIS SUITE IS FOR, AND WHAT IT REFUSES TO SAY. C9 has two halves: separate the expand into four
// measurement points, then remove the work that sits on the first one. The first half is done and the
// capture is here. THE SECOND HALF IS NOT DONE, and this suite asserts that the record says so - a round
// that measured a thing and a round that fixed it must not read the same afterwards.
//
// WHY THE SEPARATION MATTERED. CP2R reported `ms_click_to_paint` and `calls_by_turn`, which blend the
// outline, the fill callbacks and the chart into one number, so "the expand is slow" could not be
// attributed and any change aimed at the first frame could not be shown to have moved the first frame
// rather than the total. The capture now carries them apart, and - the point of the exercise - an
// inventory of what runs BEFORE the outline, which is the only list a first-frame repair may shorten.
//
// WHAT THE INVENTORY SAYS: two to three FULL row assemblies run before the panel has a layout box,
// 37-60 ms of the 39-76 ms the operator waits. Two of them are inside ONE synchronous render pass, which
// the CP2P-R2 scope is supposed to collapse; the pass is invalidated mid-handler because the dependency
// snapshot's `exposureEntry` / `exposureState` move while the handler runs.
//
// AND ONE ATTEMPT THAT DID NOT WORK, recorded because a failed hypothesis is evidence too. Asking for the
// second layer before the rows are built - so the pass would not be invalidated by its own handler - did
// NOT reduce the assemblies (still 2, 41.8-43.9 ms) and did not improve the outline. It was reverted
// rather than kept, because a change that does not produce the effect it was made for is not a fix even
// when it is harmless.
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

const EV = JSON.parse(read('docs/evidence/cp2s-r2-c9/c9-frames.json'));
const R = EV.result || {};
const X = R.expands || [];

// -------------------------------------------------------------------------------------------------------------
section('A. the capture is current, and it was taken on a real clock');

ok(!R.fatal, 'A1  the run completed without a fatal', R.fatal);
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}T/.test(String(EV.takenAt)), 'A1b and when');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok(X.length >= 2, 'A3  at least a cold and a warm expand were measured', X.length);

// -------------------------------------------------------------------------------------------------------------
section('B. FOUR POINTS, separately - not one blended number');

X.forEach(function (e) {
  ok(typeof e.p1_outline_ms === 'number' && e.p1_outline_ms > 0,
    'B1 [' + e.tag + '] point 1 outline visible is a real observed frame', e.p1_outline_ms);
  ok(Array.isArray(e.p2_fill_callbacks) && e.p2_fill_callbacks.length >= 2,
    'B2 [' + e.tag + '] point 2 each fill callback is timed on its own, by name',
    (e.p2_fill_callbacks || []).map(f => f.name));
  ok(e.p2_fill_callbacks.every(f => typeof f.ms === 'number'),
    'B2a [' + e.tag + '] with its own duration, not a sum');
  ok(typeof e.p3_chart_box_ms === 'number',
    'B3 [' + e.tag + '] point 3 chart/layout has its own frame', e.p3_chart_box_ms);
  ok(typeof e.p4_full_ready_ms === 'number' && e.p4_full_ready_ms > 0,
    'B4 [' + e.tag + '] point 4 full ready is captured IN THE SAME RUN, so a first-frame win paid for '
    + 'out of full-ready cannot be reported as a win', e.p4_full_ready_ms);
  ok(e.p4_full_ready_ms >= e.p1_outline_ms,
    'B4a [' + e.tag + '] and full ready is not earlier than the outline - a sanity check on the clock');
});

// -------------------------------------------------------------------------------------------------------------
section('C. the inventory: what runs BEFORE the operator sees anything');

X.forEach(function (e) {
  const b = e.before_outline || {};
  ok(typeof b.assemblies === 'number',
    'C1 [' + e.tag + '] the pre-outline work is counted in ASSEMBLIES, not calls - a render pass makes '
    + 'repeat calls free, so counting calls would overstate the cost', b);
  ok(b.assemblies >= 1,
    'C2 [' + e.tag + '] and there IS first-frame work: ' + b.assemblies + ' full row assemblies, '
    + b.assembly_ms + ' ms, before the panel has a box');
  eq(b.fill_calls, 0, 'C3 [' + e.tag + '] no fill callback runs before the outline - the fills are not the '
    + 'first-frame cost, which is why the previous blended number could not be acted on');
});

// -------------------------------------------------------------------------------------------------------------
section('D. what this capture does NOT establish');

// The harness serves a Chart stub, so a chart CONSTRUCTION is timed but a chart RENDER is not. Reporting
// chart_ms ~= 0 as "charts are free" would be an artefact of the fixture, so the suite pins the limitation.
const anyChart = X.some(e => (e.p3_chart_calls || []).length > 0);
ok(anyChart, 'D1  a chart was constructed during the expand', X.map(e => (e.p3_chart_calls || []).length));
ok(true, 'D2  NOT CLAIMED: the chart cost. window.Chart is the harness stub, so point 3 locates charts in '
  + 'time and does not price them. A real Chart.js build is a separate capture.');
ok(true, 'D3  NOT CLAIMED: that the expand delay is fixed. C9 asks for the first-frame work to be REMOVED '
  + 'after it is separated. It is separated. It is not removed.');

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
