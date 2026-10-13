// =============================================================================================================
// S8-B3-R3-CP2M-R2 — SITE PRIORITY VIEWPORT ACCEPTANCE, AGAINST THE REAL SHELL
// -------------------------------------------------------------------------------------------------------------
// THIS REPLACES THE CP2M-R1 ACCEPTANCE, AND THE REASON IS THAT THE R1 EVIDENCE DESCRIBED A PAGE THAT DOES NOT
// EXIST. That runner wrote its own shell into the test page:
//
//     .app-layout{display:block;}  nav.sidebar{display:none;}  .main-content{margin-left:0;}
//     @media (min-width:1024px){ nav.sidebar{...} .main-content{margin-left:240px;} }
//
// with a comment asserting the sidebar is "collapsed on phones". It is not. layout.css gives `.sidebar` a fixed
// 240px and `.main-content` a margin-left of 240px, and NO media query anywhere in the build changes either —
// the only responsive rules on the shell are two padding tweaks. So at a 360px viewport the real content column
// is 105px, not 360px, and the R1 capture measured a layout the application never produces.
//
// What that hid is recorded in `before-fix.json` and asserted below: the Country and Company selects cut off by
// 86px, and at 768px the ENTIRE Edit column invisible with the last row impossible to operate.
//
// THE EVIDENCE IS THE SUBJECT, so it is checked before it is believed. Every source the runner rendered is
// hashed at capture time and re-hashed here — and the hashed set now includes index.html and the SHELL's own
// stylesheets, which is precisely what R1's three-file hash could not notice changing.
//
// Re-capture with:  node assets/tests/_cp2m-r2-viewport-runner.js <shotsDir>
//                   (then copy measurements.json into docs/evidence/cp2m-r2-viewport/)
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

const EV = JSON.parse(read('docs/evidence/cp2m-r2-viewport/measurements.json'));
const BEFORE = JSON.parse(read('docs/evidence/cp2m-r2-viewport/before-fix.json'));
const at = (ev, id) => (ev.results || []).filter(r => r.id === id)[0];
const m = (ev, id) => ((at(ev, id) || {}).measurements) || {};

// -------------------------------------------------------------------------------------------------------------
section('A. the evidence is current, or it is not evidence');

ok(EV.ok === true, 'A1 the capture succeeded');
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}$/.test(String(EV.capturedAt)), 'A1b and when');

const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
// THE HASHED SET IS THE POINT. R1 pinned three page files, so a change to index.html or to the shell's own
// stylesheet could not invalidate its evidence — which is exactly the change that would.
['index.html', 'assets/css/layout.css', 'assets/css/pages/site-priority.css',
 'assets/js/pages/site-priority.js', 'assets/js/app.js',
 'assets/tests/_cp2m-r2-viewport-runner.js'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});
ok(Object.keys(EV.sources || {}).length >= 10, 'A3a ten sources are pinned, not three', Object.keys(EV.sources || {}).length);

// -------------------------------------------------------------------------------------------------------------
section('B. the shell under test is the REAL one');

eq(EV.testCssOverrides, 0, 'B1 the runner declares no layout overrides');
const RUNNER = read('assets/tests/_cp2m-r2-viewport-runner.js');
/* COMMENTS ARE NOT CODE — the same trap the perf-observer suite fell into. The runner's header QUOTES the
   four CSS lines the CP2M-R1 harness used, as the explanation for why they are gone, so a check run over
   the whole file reports the explanation as the violation. Only the code is the claim. */
const RUNNER_CODE = RUNNER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(/read\('index\.html'\)/.test(RUNNER_CODE), 'B2 the page under test IS index.html');
ok(!/nav\.sidebar\s*\{[^}]*display\s*:\s*none/.test(RUNNER_CODE), 'B3 and the runner never hides the sidebar');
ok(!/\.main-content\s*\{[^}]*margin-left\s*:\s*0/.test(RUNNER_CODE), 'B4 nor removes its margin');
ok(!/\.app-layout\s*\{/.test(RUNNER_CODE), 'B5 nor restyles the layout at all');
ok(/nav\.sidebar/.test(RUNNER), 'B5a (and the header still records what it replaced, so the rule survives)');

const WANT = ['360', '390', '768', '1280', '1920'];
eq((EV.results || []).length, WANT.length, 'B6 five viewports were captured');
WANT.forEach(function (w) {
  const r = at(EV, w);
  ok(!!r, 'B7 ' + w + 'px was captured');
  if (!r) return;
  const mm = r.measurements || {};
  ok(!mm.error, 'B7a ' + w + 'px measured without error', mm.error);
  // Headless Chrome will not shrink its WINDOW below a minimum, so --window-size=360 silently yields ~500px.
  // The frame is the viewport; this assertion is what keeps that true.
  eq(mm.viewport, Number(w), 'B7b and the document really was ' + w + 'px wide');
  ok(r.pngBytes > 20000, 'B7c a real screenshot was produced', r.pngBytes);
  // The shell as the application actually defines it.
  ok(mm.shell && mm.shell.sidebar, 'B7d the sidebar is present in the captured page');
  /* S8-B3-R3-CP2M-R3 — THE MARGIN IS NOW RESPONSIVE, AND THAT IS THE FIX.
     CP2M-R2 asserted 240px at EVERY width, which is what the shell did and why a 360px phone was left a
     105px column. Below the drawer breakpoint the sidebar leaves the flow and the margin goes to 0; at
     desktop widths it is unchanged. Both halves are asserted, so neither can regress unnoticed. */
  if (Number(w) <= 1024) {
    eq(mm.shell.mainContent.marginLeft, '0px', 'B7e ' + w + 'px the content takes the full width (drawer layout)');
  } else {
    eq(mm.shell.mainContent.marginLeft, '240px', 'B7e ' + w + 'px the desktop 240px margin is unchanged');
  }
  eq(mm.shell.mainContent.overflowX, 'hidden', 'B7f and its overflow-x is hidden at ' + w + 'px');
});

/* The consequence, stated as a number so it cannot be argued with.
   CP2M-R2 measured 105px here and recorded it as the defect. CP2M-R3's drawer gives the page the
   viewport back; the BEFORE capture still carries the 105px and section G asserts the delta. */
ok(m(EV, '360').shell.usableContentWidth >= 320,
  'B8 at 360px the content column is now most of the viewport', m(EV, '360').shell.usableContentWidth);
ok(m(EV, '768').shell.usableContentWidth >= 700,
  'B8a and a 768px tablet gets its full width', m(EV, '768').shell.usableContentWidth);
ok(m(EV, '1920').shell.usableContentWidth > 1500,
  'B8b while the desktop layout is unchanged', m(EV, '1920').shell.usableContentWidth);
/* AND IT IS 1665 NOW, NOT 1680, WHICH IS REPORTED RATHER THAN ROUNDED PAST. CP2M-R4 added a column, a
   move bar and two paragraphs of explanation, so the page is taller -- tall enough at 768 and 1920 to
   need a vertical scrollbar it did not need before, and a scrollbar costs 15px of content column. The
   same 15px was already being paid at 360, 390 and 1280, which is why only those two widths moved.
   Nothing is clipped at any width and no row became unreachable (sections D and E), so this is a cost
   worth naming rather than a defect, and naming it is what stops it being read as one later. */
eq(m(EV, '1920').shell.usableContentWidth, 1665, 'B8c exactly 1665 - 1680 less a 15px vertical scrollbar');
eq(m(EV, '768').shell.usableContentWidth, 753, 'B8d and 753 at 768px, for the same 15px');
eq(m(EV, '1280').shell.usableContentWidth, 1025, 'B8e while 1280px is unchanged - it already had one');

// -------------------------------------------------------------------------------------------------------------
section('C. the page renders, at every width');

WANT.forEach(function (w) {
  const mm = m(EV, w);
  eq(mm.rowCount, 7, 'C1 ' + w + 'px draws all seven fixture rows');
  /* S8-B3-R3-CP2M-R4 - THE BAND COUNT SPLIT, because a second kind of band now exists. The ordered
     rows sit under their company; the rows §45.A gives no position to -- MISSING and INVALID -- sit
     under "No priority set" below them. `groupCount` counts both kinds, so pinning it to 2 would read
     the new structure as the old one having regressed. Each kind is asserted on its own instead. */
  eq(mm.companyGroupCount, 2, 'C2 ' + w + 'px draws both company bands');
  eq(mm.unsetGroupCount, 2, 'C2a ' + w + 'px and an unordered band under each, for the Missing and Invalid rows');
  eq(mm.groupCount, 4, 'C2b ' + w + 'px four band headers in total');
  eq(mm.sectionPresent, true, 'C3 ' + w + 'px reached the section by clicking its menu item');
});
ok((EV.fixtureRows || 0) >= 7, 'C4 the fixture carried enough rows to fill two companies', EV.fixtureRows);

// -------------------------------------------------------------------------------------------------------------
section('D. nothing an operator needs is cut off');

WANT.forEach(function (w) {
  const mm = m(EV, w);
  eq(mm.fullyInvisibleCount, 0, 'D1 ' + w + 'px no watched control is entirely invisible');
  eq(mm.partlyInvisibleCount, 0, 'D2 ' + w + 'px no watched control is partly cut off');
  eq(mm.horizontalOverflow, false, 'D3 ' + w + 'px the PAGE still does not scroll sideways');
});

// The Country control, by name, because that is the one the Owner asked about.
WANT.forEach(function (w) {
  const c = (m(EV, w).watched || []).filter(x => x.label === 'country[0]')[0];
  ok(!!c, 'D4 ' + w + 'px the Country control was measured');
  if (c) ok(c.visibleFraction >= 0.95, 'D4a ' + w + 'px the Country control is fully visible', c.visibleFraction);
});

// -------------------------------------------------------------------------------------------------------------
section('E. the last row can be reached AND operated');

WANT.forEach(function (w) {
  const lr = m(EV, w).lastRow || {};
  eq(lr.reachableAndOperable, true, 'E1 ' + w + 'px the last row\'s Edit control is hit-testable after scrolling');
  // elementFromPoint returning the control itself is what separates "in the DOM" from "usable".
  ok(/button/.test(String(lr.elementAtPoint || '')), 'E1a ' + w + 'px and the element at its centre IS the control', lr.elementAtPoint);
});
/* S8-B3-R3-CP2M-R3 — THE SIDEWAYS SCROLL IS GONE AT 768px, and it went for the right reason.
   CP2M-R2 made the table wrapper scroll so the Edit column stopped being amputated; that was the fix
   available without touching the shell, and it cost a horizontal scroll on a tablet. With the shell
   responsive the tablet now gets its whole 768px and the table fits, so the scroller is still there as
   the safety net but nothing needs it. */
eq((m(EV, '768').lastRow || {}).neededHorizontalScroll, false,
  'E2 at 768px the table fits — no sideways scroll is needed any more');
eq((m(EV, '1920').lastRow || {}).neededHorizontalScroll, false, 'E2a nor at 1920px');

// -------------------------------------------------------------------------------------------------------------
section('F. touch targets, by input rather than by layout');

WANT.forEach(function (w) {
  const mm = m(EV, w);
  if (Number(w) <= 1024) {
    ok(mm.minButtonH >= 38, 'F1 ' + w + 'px touch targets are at least 38px tall', mm.minButtonH);
    ok(mm.minSelectH >= 30, 'F1a ' + w + 'px filter controls are reachable too', mm.minSelectH);
  } else {
    ok(mm.minButtonH >= 28, 'F2 ' + w + 'px desktop controls are a sane size', mm.minButtonH);
  }
  ok(mm.minFontSize >= 11, 'F3 ' + w + 'px no cell text is shrunk below legibility', mm.minFontSize);
});

// -------------------------------------------------------------------------------------------------------------
section('G. the fix is a FIX — the before evidence says what it was');

ok(BEFORE.ok === true, 'G0 the before capture is present and succeeded');
// The two defects the real shell exposed, asserted as having been real.
ok(m(BEFORE, '360').partlyInvisibleCount > 0,
  'G1 BEFORE: controls were cut off at 360px', m(BEFORE, '360').partlyInvisibleCount);
ok(m(BEFORE, '390').partlyInvisibleCount > 0,
  'G1a BEFORE: and at 390px', m(BEFORE, '390').partlyInvisibleCount);
ok(m(BEFORE, '768').fullyInvisibleCount >= 7,
  'G2 BEFORE: the whole Edit column was invisible at 768px', m(BEFORE, '768').fullyInvisibleCount);
eq((m(BEFORE, '768').lastRow || {}).reachableAndOperable, false,
  'G3 BEFORE: and the last row could not be operated at all on a tablet');
// The country select specifically, which is what was asked about.
const cBefore = (m(BEFORE, '360').watched || []).filter(x => x.label === 'country[0]')[0];
ok(cBefore && cBefore.visibleFraction < 0.6,
  'G4 BEFORE: the Country control was about half cut off at 360px', cBefore && cBefore.visibleFraction);
ok(cBefore && cBefore.clippedBy.some(c => /main-content/.test(c.by)),
  'G4a BEFORE: by .main-content, which cannot scroll — so it was unreachable, not merely hidden');

// AFTER, every one of those is zero. Asserted as a DELTA so neither half can drift alone.
ok(m(BEFORE, '360').partlyInvisibleCount > m(EV, '360').partlyInvisibleCount, 'G5 360px improved');
ok(m(BEFORE, '390').partlyInvisibleCount > m(EV, '390').partlyInvisibleCount, 'G5a 390px improved');
ok(m(BEFORE, '768').fullyInvisibleCount > m(EV, '768').fullyInvisibleCount, 'G5b 768px improved');

// And the fixes are really in the stylesheet, not only in the measurement.
const CSS = read('assets/css/pages/site-priority.css');
ok(/overflow-x:\s*auto/.test(CSS), 'G6 the table wrapper scrolls rather than clipping');
ok(/\.sp-select\s*\{[^}]*min-width:\s*0/.test(CSS), 'G7 the narrow select releases its 180px min-width');
ok(/flex-wrap:\s*wrap;/.test(CSS), 'G8 the card cell wraps rather than overflowing');

// -------------------------------------------------------------------------------------------------------------
section('H. (non-vacuity) the two captures are different measurements of different code');

ok(JSON.stringify(BEFORE.sources) !== JSON.stringify(EV.sources),
  'H1 before and after were taken against different sources — otherwise one of them is a copy');
/* S8-B3-R3-CP2M-R3 — index.html DOES differ now, and the assertion is inverted deliberately.
   In CP2M-R2 it had to be IDENTICAL, because that round fixed only the page's own stylesheet and the
   claim was "the shell is not what was fixed". CP2M-R3 fixed the shell itself -- a drawer opener and a
   backdrop in index.html, a breakpoint in layout.css -- so an unchanged index.html would now mean the
   shell work never shipped. */
ok(BEFORE.sources['index.html'] !== EV.sources['index.html'],
  'H1a index.html DID change — the shell is what CP2M-R3 fixed');
ok(BEFORE.sources['assets/css/layout.css'] !== EV.sources['assets/css/layout.css'],
  'H1b and layout.css with it — the responsive rules live there');
ok(BEFORE.sources['assets/css/pages/site-priority.css'] !== EV.sources['assets/css/pages/site-priority.css'],
  'H1c the page stylesheet also differs, from the CP2M-R2 clipping fix');
ok((EV.results || []).every(r => r.png), 'H2 every width produced a screenshot file');
ok(WANT.every(w => m(EV, w).watched && m(EV, w).watched.length >= 5),
  'H3 every width measured a real set of controls, not an empty one');

// =============================================================================================================
section('J. S8-B3-R3-CP2M-R4 — THE DRAG GESTURE, IN A REAL BROWSER, AT EVERY WIDTH');
// -------------------------------------------------------------------------------------------------------------
// The node suite proves the RULE by calling the same functions the handlers call. It cannot prove the GESTURE:
// a headless DOM has no layout, getBoundingClientRect returns zeros, and a pointer path driven there would be
// measuring the shim. These assertions are taken from real PointerEvents and real KeyboardEvents dispatched
// against the shipped page and the shipped stylesheet.

WANT.forEach(function (w) {
  const d = (m(EV, w) || {}).drag || {};
  ok(!d.error, 'J0 ' + w + 'px the probe ran without error', d.error);

  // FIVE HANDLES, AND THE TWO ROWS THAT MAY NOT MOVE DO NOT GET ONE. ResourceUS has a single weighted
  // site — nothing to reorder it against — and an INVALID one, which has no position to move from.
  eq(d.gripCount, 5, 'J1 ' + w + 'px five rows carry a drag handle');
  eq((d.offGripKeys || []).length, 2, 'J1a ' + w + 'px and two carry a DISABLED one with the reason');
  ok((d.offGripKeys || []).indexOf('ResourceUS/US/eBay') !== -1,
    'J1b ' + w + 'px the INVALID row is one of them', d.offGripKeys);
  ok((d.offGripKeys || []).indexOf('ResourceUS/US/Amazon') !== -1,
    'J1c ' + w + 'px and so is the only weighted site in its company', d.offGripKeys);

  /* THE MOVE BAR IS NOT DRAWN WHEN THERE IS NO MOVE. It sets `display: flex`, which beats the UA's
     `[hidden] { display: none }` on specificity, so for one capture it was an empty bordered rectangle on
     every width. This asserts the COMPUTED display rather than the attribute, because the attribute was
     set correctly the whole time -- it just was not winning. */
  ok(d.barAtRest, 'J1d ' + w + 'px the move bar was measured at rest', d.barAtRest);
  eq((d.barAtRest || {}).hiddenAttr, true, 'J1e ' + w + 'px it carries the hidden attribute');
  eq((d.barAtRest || {}).display, 'none', 'J1f ' + w + 'px and that attribute actually hides it');
  eq((d.barAtRest || {}).h, 0, 'J1g ' + w + 'px so it occupies no height');

  // THE HANDLE IS A BUTTON, so it is in the tab order and announced as operable.
  eq(d.gripIsButton, true, 'J2 ' + w + 'px the handle is a real button');
  eq(d.gripTabbable, true, 'J2a ' + w + 'px and reachable by keyboard');

  // TOUCH-ACTION IS READ AS COMPUTED, NOT AS WRITTEN. A declaration that is present in the stylesheet and
  // overridden by anything else would pass a source grep and fail a finger; without it the browser claims
  // the gesture as a scroll and cancels the pointer stream, so touch silently does nothing.
  eq(d.touchAction, 'none', 'J3 ' + w + 'px the handle computes touch-action: none');
  if (Number(w) <= 1024) {
    ok(d.gripBox && d.gripBox.w >= 38 && d.gripBox.h >= 38,
      'J3a ' + w + 'px and is a finger-sized target below the drawer breakpoint', d.gripBox);
  }

  // THREE INPUTS, ONE RESULT. Mouse, touch and keyboard put the same row in the same slot at the same
  // weight. If any one of them diverged, one of the three has its own code path — which is the thing the
  // single lift/nudge/drop implementation exists to prevent.
  const kb = (d.keyboard || {}).afterDrop || {};
  const mo = (d.mouse || {}).afterUp || {};
  const to = (d.touch || {}).afterUp || {};
  eq(kb.slot, 1, 'J4 ' + w + 'px KEYBOARD drops the row in slot 1');
  eq(mo.slot, 1, 'J4a ' + w + 'px MOUSE lands in the same slot');
  eq(to.slot, 1, 'J4b ' + w + 'px TOUCH lands in the same slot');
  eq(kb.weight, '90', 'J5 ' + w + 'px KEYBOARD proposes 90 — the midpoint of 100 and 80');
  eq(mo.weight, '90', 'J5a ' + w + 'px MOUSE proposes the same weight');
  eq(to.weight, '90', 'J5b ' + w + 'px TOUCH proposes the same weight');
  eq(kb.key, d.targetKey, 'J5c ' + w + 'px and it is the dragged row that moved');

  // THE KEYBOARD CLAIMS ITS KEYS, so Space does not scroll the page out from under the lift.
  eq((d.keyboard || {}).liftPrevented, true, 'J6 ' + w + 'px Space is claimed when it lifts');
  eq((d.keyboard || {}).dropPrevented, true, 'J6a ' + w + 'px and when it drops');
  // FOCUS SURVIVES THE RE-RENDER. Every slot change rebuilds the row, so without deliberate restoration
  // the handle the operator is holding is destroyed under them and focus falls back to the body.
  eq((d.keyboard || {}).focusKept, true, 'J7 ' + w + 'px focus stays on the handle across the re-render');

  // A REFUSAL IS VISIBLE BEFORE THE DROP, drawn where it was dropped and with NO invented weight.
  eq((d.tiedPair || {}).weight, '—', 'J8 ' + w + 'px between two equal weights the preview shows no number');
  eq(d.tiedPairOffersSave, false, 'J8a ' + w + 'px and Save is not offered');

  // CANCEL RESTORES THE LIST — `slot: -1` means no preview row is left anywhere in the table.
  eq(((d.keyboard || {}).afterCancel || {}).slot, -1, 'J9 ' + w + 'px cancelling a keyboard move clears the preview');
  eq(((d.mouse || {}).afterCancel || {}).slot, -1, 'J9a ' + w + 'px and a mouse move');
  eq(((d.touch || {}).afterCancel || {}).slot, -1, 'J9b ' + w + 'px and a touch move');

  // AND THE WHOLE PROBE WROTE NOTHING. The write wrapper was replaced by a counter for its duration, so a
  // gesture that dispatched a save would be a number here rather than a changed fixture nobody looked at.
  eq(d.writesDispatched, 0, 'J10 ' + w + 'px NOT ONE write was dispatched by any gesture');
});

// The probe is not vacuous: it really found a row, and really had rows to move it past.
ok((m(EV, '360').drag || {}).targetKey, 'J11 the probe identified the row it moved',
  (m(EV, '360').drag || {}).targetKey);
ok(((m(EV, '360').drag || {}).mouse || {}).otherRows >= 2, 'J11a with other rows to position against');
ok(((m(EV, '360').drag || {}).mouse || {}).aim, 'J11b and aimed at a measured point, not a guessed one',
  ((m(EV, '360').drag || {}).mouse || {}).aim);

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('SITE PRIORITY VIEWPORT ACCEPTANCE (S8-B3-R3-CP2M-R2): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
