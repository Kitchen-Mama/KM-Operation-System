// =============================================================================================================
// S8-B3-R3-CP2M-R4-R1 — THE MAP CANVAS DISAPPEARED, AND THIS SAYS WHY
// -------------------------------------------------------------------------------------------------------------
// CP2M-R4's pixel capture failed once in three runs with `canvasAppeared: true` followed by `canvasCount: 0`
// for over four seconds, and the honest report at the time was "intermittent, consistent with the desktop
// teardown recorded as open". That is a symptom with four possible causes and no way to choose between them:
//
//     the HOST removed from the document but kept alive   (detachGlobe does exactly this, ON PURPOSE)
//     the globe INSTANCE destroyed and rebuilt
//     the WebGL CONTEXT lost
//     a late response rendering over a page the operator left
//
// So the page was given a lifecycle probe FIRST, with no behaviour change, and the before capture was taken
// through the same code path the operator runs. What it found:
//
//     during a forced refresh, the host is OUT OF THE DOCUMENT in 13 of 40 samples — exactly the 13 where
//     `state.loading` is true, i.e. the entire server round trip — while globeCreates stays 1,
//     globeDestroys 0 and contextLost 0.
//
// The engine was never rebuilt and no context was ever lost. `render()` calls `detachGlobe()` before the
// `state.loading` early-return, and only the full render path calls `attachGlobe()` again, so for the whole
// duration of a refresh the map is simply not on the page.
//
// WHAT THIS SUITE WILL NOT DO. It does not raise a wait limit until a run passes, and it does not pick the
// good run out of three. It asserts a BEFORE capture that contains the defect and an AFTER capture that does
// not, from the same runner, at the same read delay, with the sources hashed.
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

const BEFORE = JSON.parse(read('docs/evidence/cp2m-r4r1-map/before.json'));
const AFTER = JSON.parse(read('docs/evidence/cp2m-r4r1-map/after.json'));
const PAGE = read('assets/js/pages/global-logistics-map.js');
const CODE = PAGE.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const phase = (ev, name) => (ev.timeline || []).filter(s => String(s.tag).replace(/-\d+$/, '') === name);
const detachedIn = (ev, name) => phase(ev, name).filter(s => s.hostExists && !s.hostInDocument).length;
const loadingIn = (ev, name) => phase(ev, name).filter(s => s.loading).length;

// -------------------------------------------------------------------------------------------------------------
section('A. the evidence is current, and both captures describe the same experiment');

[['before', BEFORE], ['after', AFTER]].forEach(([n, ev]) => {
  eq(ev.ok, true, 'A1 ' + n + ' the capture succeeded');
  ok(!ev.fatal, 'A1a ' + n + ' with no fatal page error', ev.fatal);
  ok((ev.timeline || []).length > 80, 'A1b ' + n + ' and a dense timeline', (ev.timeline || []).length);
});
// SAME EXPERIMENT, SAME DELAY. A faster read on the "after" run would make the defect window smaller and
// could be mistaken for the fix.
eq(BEFORE.readDelayMs, AFTER.readDelayMs, 'A2 both runs used the SAME server read delay');
ok(AFTER.readDelayMs >= 500, 'A2a and it is long enough for the loading window to be sampled', AFTER.readDelayMs);
eq(loadingIn(BEFORE, 'refresh'), loadingIn(AFTER, 'refresh'),
  'A3 and the refresh spent the SAME number of samples loading — the wait was not shortened or hidden');

// The AFTER capture must match the CURRENT source, or it is describing some other build.
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(AFTER.sources || {}).forEach((rel) => {
  eq(sha(rel), AFTER.sources[rel], 'A4 ' + rel.split('/').pop() + ' is unchanged since the after capture');
});
ok(Object.prototype.hasOwnProperty.call(AFTER.sources || {}, 'assets/js/pages/global-logistics-map.js'),
  'A4a the hash covers the page that was fixed');
ok(BEFORE.sources['assets/js/pages/global-logistics-map.js']
   !== AFTER.sources['assets/js/pages/global-logistics-map.js'],
  'A5 and the two captures were taken against DIFFERENT source — otherwise one is a copy of the other');

// -------------------------------------------------------------------------------------------------------------
section('B. BEFORE — the host leaves the document for the whole refresh');

ok(detachedIn(BEFORE, 'refresh') >= 5,
  'B1 during a forced refresh the host was OUT OF THE DOCUMENT in many samples', detachedIn(BEFORE, 'refresh'));
eq(detachedIn(BEFORE, 'refresh'), loadingIn(BEFORE, 'refresh'),
  'B2 and in EXACTLY the samples where the page was loading — the whole round trip, not a frame of it');
ok(phase(BEFORE, 'pre-refresh').every(s => s.hostInDocument),
  'B3 while immediately before the refresh it was on the page');
ok(phase(BEFORE, 'refresh-settled').every(s => s.hostInDocument),
  'B4 and it came back once the data arrived — so this is a WINDOW, not a permanent loss');

// -------------------------------------------------------------------------------------------------------------
section('C. BEFORE — and it was NOT an engine rebuild, which is the whole point of measuring');

// `detachGlobe` keeps the host node AND `state.globe`. Without these three counters, "the canvas is gone"
// would have been filed as a renderer fault and the fix aimed at the wrong layer.
eq(BEFORE.summary.globeCreates, 1, 'C1 the globe was created exactly ONCE across the entire run');
eq(BEFORE.summary.globeDestroys, 0, 'C2 and never destroyed');
eq(BEFORE.summary.contextLost, 0, 'C3 and no WebGL context was ever lost');
const ids = (BEFORE.timeline || []).map(s => s.globeInstanceId || 0).filter(Boolean);
eq(new Set(ids).size, 1, 'C4 one instance id throughout — the same engine, start to finish');
ok(phase(BEFORE, 'refresh').every(s => s.globeAlive),
  'C5 and the instance was alive even while the host was off the page');

// -------------------------------------------------------------------------------------------------------------
section('D. AFTER — the refresh no longer takes the map away');

eq(detachedIn(AFTER, 'refresh'), 0, 'D1 NOT ONE sample has the host out of the document during a refresh');
eq(AFTER.summary.samplesHostDetached, 0, 'D1a nor anywhere else in the run');
ok(AFTER.summary.teardownsAvoided >= 1,
  'D2 and the page recorded avoiding the teardown rather than it merely not happening',
  AFTER.summary.teardownsAvoided);
// THE WAIT IS STILL THERE. The fix stops the teardown; it does not pretend the read got faster, and a
// Loading state that merely moved would be exactly the substitution this round was told not to make.
ok(loadingIn(AFTER, 'refresh') >= 5,
  'D3 the refresh still genuinely spends time loading — the wait was not hidden', loadingIn(AFTER, 'refresh'));

// -------------------------------------------------------------------------------------------------------------
section('E. AFTER — the instance is still preserved, not rebuilt to paper over it');

eq(AFTER.summary.globeCreates, 1, 'E1 the globe is still created exactly once');
eq(AFTER.summary.globeDestroys, 0, 'E2 and never destroyed');
eq(AFTER.summary.contextLost, 0, 'E3 with no context loss');
eq(AFTER.summary.globeCreates, BEFORE.summary.globeCreates,
  'E4 the fix did not change how many times the engine is built');

// -------------------------------------------------------------------------------------------------------------
section('F. LEAVE AND RETURN — what the probe found, stated honestly');

// This did NOT reproduce, and recording that is worth more than a reassuring assertion. On re-entry the
// read model is already cached, so `ensureDb` calls back SYNCHRONOUSLY: `state.loading` is true and false
// within one tick and the detach never survives a frame. The reachable teardown is the FORCED refresh.
eq(detachedIn(BEFORE, 'return'), 0,
  'F1 leave-and-return did NOT lose the host even before the fix — the cached read makes it synchronous');
eq(loadingIn(BEFORE, 'return'), 0, 'F1a which is why no sample caught it loading at all');
eq(detachedIn(AFTER, 'return'), 0, 'F2 and it still does not');
ok(phase(AFTER, 'return').every(s => s.canvasPresent), 'F3 with the canvas present throughout the return');

// -------------------------------------------------------------------------------------------------------------
section('G. the source carries the fix, and does not carry what it must not');

ok(/_glmDiag\.everRendered/.test(CODE), 'G1 the page knows whether it has anything worth preserving');
ok(/if \(state\.loading && _glmDiag\.everRendered\)/.test(CODE),
  'G2 and a load with something to preserve does not rebuild the body');
ok(/teardownsAvoided\+\+/.test(CODE), 'G3 and counts when it declined to, so the fix is observable');
// A NAVIGATION GENERATION, because a read that outlives a navigation must not render on the next page.
ok(/_glmNavGen/.test(CODE), 'G4 a navigation generation exists');
ok(/unmount: function \(\) \{ _glmNavGen\+\+; _glmReadSeq\+\+;/.test(CODE),
  'G5 leaving retires both the navigation and the in-flight read');
/* S8-B3-R3-CP2M-R4-R2 — G6 IS SCOPED TO boot(), WHICH IS WHAT IT WAS ALWAYS ABOUT.
   It counted the generation check across the WHOLE FILE and expected exactly three. That is a count of
   boot()'s three re-checks written as a count of the file, so the first later round to consult the same
   generation anywhere else failed an assertion whose sentence was still true. CP2M-R4-R2 is that round:
   the mount continuation now captures the generation too, which makes four in the file and three in boot.
   The number is not relaxed — it is measured where the sentence says it is. */
const BOOT_BODY = (CODE.split('function boot(force)')[1] || '').split('function ensureMarkup')[0];
ok(BOOT_BODY.length > 200, 'G6pre (boot was located in the source)', BOOT_BODY.length);
eq((BOOT_BODY.match(/myNav !== _glmNavGen/g) || []).length, 3,
  'G6 and the boot callback re-checks it at each point it would otherwise render');

// THE ENGINE, THE GEOMETRY AND THE TRANSPORT ARE UNTOUCHED — this round changed when the host is on the
// page, nothing about what is drawn on it or how the data arrives.
const GLOBE = read('assets/js/lib/km-globe.js');
ok(GLOBE.length > 1000, 'G7 (the globe engine was read)');
ok(!/_glmDiag|_glmNavGen|everRendered/.test(GLOBE), 'G7a and contains none of this round’s additions');
ok(!/getWorkspace\(|adaptShipmentWorkspace/.test(
     CODE.split('function render()')[1] ? CODE.split('function render()')[1].slice(0, 3000) : ''),
  'G8 and render() still does no reading of its own');
// detachGlobe still exists and still keeps the host: the fix is about WHEN it runs, not about removing it.
ok(/function detachGlobe\(\)/.test(CODE), 'G9 detachGlobe still exists');
ok(/removeChild\(state\.globeHost\)/.test(CODE), 'G9a and still only removes the host, never destroys it');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('MAP CANVAS LIFECYCLE (S8-B3-R3-CP2M-R4-R1): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
