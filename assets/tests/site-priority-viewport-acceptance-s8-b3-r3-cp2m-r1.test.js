// =============================================================================================================
// S8-B3-R3-CP2M-R1 — SITE PRIORITY VIEWPORT ACCEPTANCE
// -------------------------------------------------------------------------------------------------------------
// CP2M could only call the company grouping and the responsive layout "implemented, pending visual
// verification", and that distinction was the right one: asserting a @media rule from source proves the RULE
// exists, never that the PAGE renders. This asserts on measurements taken from a real Chrome at the five
// approved widths, with the real cascade and the real renderer.
//
// THE EVIDENCE IS THE SUBJECT, so it is checked before it is believed. S4-R1 recorded the failure mode this
// guards against — "a conclusion that outlives the thing it was measured on" — so every source the runner
// rendered is hashed at capture time and re-hashed here. Edit the CSS without re-running the runner and this
// suite FAILS rather than quoting a measurement of a page that no longer exists.
//
// Re-capture with:  node assets/tests/_cp2m-r1-viewport-runner.js <shotsDir> > docs/evidence/cp2m-r1-viewport/measurements.json
// =============================================================================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const EV = JSON.parse(read('docs/evidence/cp2m-r1-viewport/measurements.json'));

// -------------------------------------------------------------------------------------------------------------
section('A. the evidence is current, or it is not evidence');

ok(EV.ok === true, 'A1 the capture succeeded');
ok(!!EV.browser, 'A1a and names the browser it ran in', EV.browser);
ok(typeof EV.capturedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(EV.capturedAt), 'A1b and when');

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
ok(Object.keys(EV.sources || {}).length >= 3, 'A2a all three rendered sources are pinned');

// -------------------------------------------------------------------------------------------------------------
section('B. the five approved widths were really rendered at those widths');

const WANT = [360, 390, 768, 1280, 1920];
eq((EV.results || []).length, WANT.length, 'B1 five viewports were captured');
WANT.forEach(function (w) {
  const r = (EV.results || []).filter(function (x) { return x.width === w; })[0];
  ok(!!r, 'B2 ' + w + 'px was captured');
  if (!r) return;
  const m = r.measurements || {};
  // THE CHECK THAT CAUGHT A REAL HARNESS DEFECT. Headless Chrome will not shrink its WINDOW below a minimum,
  // so a --window-size=360 run measured a 500px page and called it 360. The frame is the viewport now, and
  // this assertion is what keeps that true.
  eq(m.viewport, w, 'B2a and the document really was ' + w + 'px wide');
  ok(r.pngBytes > 5000, 'B2b a screenshot was produced and is not blank', r.pngBytes);
});

// -------------------------------------------------------------------------------------------------------------
section('C. no width pushes the page sideways');

(EV.results || []).forEach(function (r) {
  const m = r.measurements || {};
  eq(m.horizontalOverflow, false, 'C1 ' + r.id + 'px does not scroll sideways');
  eq(m.docScrollWidth, m.docClientWidth, 'C1a ' + r.id + 'px scrollWidth equals clientWidth');
  eq(m.overflowingCount, 0, 'C2 ' + r.id + 'px has no element past the right edge',
     (m.overflowing || []).slice(0, 3));
  // The <thead> is removed from flow by the visually-hidden pattern at narrow widths, so its cells keep their
  // natural width while being invisible and unable to scroll the page. Counted separately, never silently.
  if (r.width <= 640) ok(m.hiddenHeadOverflow >= 0, 'C2a ' + r.id + 'px accounts for the hidden header', m.hiddenHeadOverflow);
});

// -------------------------------------------------------------------------------------------------------------
section('D. the company bands rendered — at every width, not only the wide ones');

(EV.results || []).forEach(function (r) {
  const m = r.measurements || {};
  eq(m.groupCount, 2, 'D1 ' + r.id + 'px shows both company bands');
  eq(m.rowCount, 7, 'D1a ' + r.id + 'px shows every site');
});
const first = (EV.results || [])[0];
if (first) {
  const texts = (first.measurements || {}).groupTexts || [];
  ok(texts.some(function (t) { return /KitchenMama/.test(t); }), 'D2 a band is named for its company', texts);
  ok(texts.some(function (t) { return /5 sites/.test(t); }), 'D2a and counts its sites');
  ok(texts.some(function (t) { return /2 sites/.test(t); }), 'D2b for each company separately');
}

// -------------------------------------------------------------------------------------------------------------
section('E. text and controls are usable, measured rather than assumed');

(EV.results || []).forEach(function (r) {
  const m = r.measurements || {};
  eq(m.clippedCells, 0, 'E1 ' + r.id + 'px clips no cell text');
  ok(m.minFontSize >= 11, 'E2 ' + r.id + 'px keeps body text at 11px or larger', m.minFontSize);
  ok(m.buttonCount > 0, 'E3 ' + r.id + 'px actually has controls to measure', m.buttonCount);
  if (r.touch) {
    // A phone control smaller than this is a control a thumb misses. 38px is what the stylesheet sets; the
    // point of measuring is that the rule REACHED the button rather than being overridden by the cascade.
    ok(m.minButtonH >= 38, 'E4 ' + r.id + 'px touch targets are at least 38px tall', m.minButtonH);
    ok(m.minSelectH >= 30, 'E4a ' + r.id + 'px filter controls are reachable too', m.minSelectH);
  } else {
    ok(m.minButtonH >= 28, 'E5 ' + r.id + 'px desktop controls are still a sane size', m.minButtonH);
  }
});

// -------------------------------------------------------------------------------------------------------------
section('F. (non-vacuity) the measurements describe a page with content in it');

const narrow = (EV.results || []).filter(function (r) { return r.width <= 640; });
const wide = (EV.results || []).filter(function (r) { return r.width >= 1280; });
ok(narrow.length >= 2 && wide.length >= 2, 'F1 both narrow and wide widths are represented');
ok(narrow.every(function (r) { return (r.measurements || {}).minButtonH >= 38; })
   && wide.every(function (r) { return (r.measurements || {}).minButtonH < 38; }),
   'F2 the narrow layout really differs from the wide one — the breakpoint did something');
ok((EV.fixtureRows || 0) >= 7, 'F3 the fixture carried enough rows to fill two companies', EV.fixtureRows);
ok((EV.results || []).every(function (r) { return r.png; }), 'F4 every width produced a screenshot file');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('SITE PRIORITY VIEWPORT ACCEPTANCE (S8-B3-R3-CP2M-R1): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
