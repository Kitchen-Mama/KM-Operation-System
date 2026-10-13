// =============================================================================================================
// S8-B3-R3-CP2M-R2 — THE NAVIGATION PERFORMANCE OBSERVATION, AS EVIDENCE
// -------------------------------------------------------------------------------------------------------------
// S4-R1 measured route navigations from OUTSIDE the page and said so plainly: it "cannot separate shell from
// partial from JS from render", and its route deltas (-82 to +154 ms) sat inside the baseline's own 840 ms
// spread with two of them negative. That was the INSTRUMENT'S limit, not the question's.
//
// This asserts on measurements taken from inside the process, with the real clock. It checks four things:
//
//   1. THE PHASES ARE SEPARATED — click, shell/partial, JS download, JS execution, API and render each carry
//      their own number, and the two paint metrics are distinct.
//   2. COLD AND WARM ARE NOT MIXED — cold is a fresh process doing ONE navigation; warm is a return visit.
//   3. THE SAMPLE IS REAL — counts, not a single run, and the spread is recorded beside the median.
//   4. WHAT WAS NOT MEASURED IS NAMED — the stub API's latency is synthetic and is labelled as such, so no
//      reader can mistake it for a production figure.
//
// IT ASSERTS NO LATENCY BUDGET. There is no agreed threshold for these routes, and inventing one here would
// turn an observation into a gate nobody approved. What it does assert is that the measurement HAPPENED, that
// it is internally consistent, and that the recorded bottleneck is still the bottleneck.
//
// Re-capture with:  node assets/tests/_cp2m-r2-perf-runner.js <outDir> 5 5
//                   (then copy perf.json into docs/evidence/cp2m-r2-perf/)
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

const EV = JSON.parse(read('docs/evidence/cp2m-r2-perf/perf.json'));
const CENSUS = JSON.parse(read('docs/evidence/cp2m-r2-perf/boot-census.json'));

const runsFor = (route, phase) => (EV.runs || []).filter(r => r.route === route && r.phase === phase && r.result && r.result.ok);
const ROUTES = ['ops', 'global-logistics-map', 'site-priority', 'carrier-rate-card', 'product-strategy'];

// -------------------------------------------------------------------------------------------------------------
section('A. the evidence is current, or it is not evidence');

ok(EV.ok === true, 'A1 the capture succeeded');
ok(!!EV.browser, 'A1a and names the browser', EV.browser);
ok(/^\d{4}-\d{2}-\d{2}$/.test(String(EV.capturedAt)), 'A1b and when');
const sha = (rel) => crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);
Object.keys(EV.sources || {}).forEach(function (rel) {
  eq(sha(rel), EV.sources[rel], 'A2 ' + rel.split('/').pop() + ' is unchanged since the capture');
});
['index.html', 'assets/js/app.js', 'assets/js/core/script-loader.js',
 'assets/js/core/perf-observer.js'].forEach(function (rel) {
  ok(Object.prototype.hasOwnProperty.call(EV.sources || {}, rel), 'A3 the hash covers ' + rel);
});

// -------------------------------------------------------------------------------------------------------------
section('B. the measurement states what it did NOT measure');

eq(EV.apiLatencyIsSynthetic, true, 'B1 the API latency is declared synthetic');
ok(typeof EV.apiThinkTimeMs === 'number', 'B1a and its value is stated', EV.apiThinkTimeMs);
// The runner must never freeze the clock it is reading.
const RUNNER_CODE = read('assets/tests/_cp2m-r2-perf-runner.js')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(RUNNER_CODE.indexOf('--virtual-time-budget') === -1,
  'B2 no virtual time — under it performance.now() measures scheduling, not work');
ok(/MAP \* ~NOTFOUND/.test(RUNNER_CODE), 'B3 and the browser could not reach any host but loopback');

// -------------------------------------------------------------------------------------------------------------
section('C. cold and warm are separate, with real sample counts');

ok(EV.coldRepeats >= 3, 'C1 cold was repeated', EV.coldRepeats);
ok(EV.warmRepeats >= 3, 'C1a warm was repeated', EV.warmRepeats);
ROUTES.forEach(function (r) {
  ok(runsFor(r, 'cold').length >= 3, 'C2 ' + r + ' has cold samples', runsFor(r, 'cold').length);
  ok(runsFor(r, 'warm').length >= 3, 'C2a ' + r + ' has warm samples', runsFor(r, 'warm').length);
});
// A cold process performs exactly ONE navigation; a warm one visits, leaves and returns.
ROUTES.forEach(function (r) {
  const c = runsFor(r, 'cold')[0], w = runsFor(r, 'warm')[0];
  if (c) eq(c.result.program.length >= 1, true, 'C3 ' + r + ' cold ran its program');
  if (w) ok(w.result.program.length >= 3, 'C3a ' + r + ' warm visited, left and returned', w.result.program.length);
});

// -------------------------------------------------------------------------------------------------------------
section('D. the phases really are separated');

const anySample = (EV.runs || []).map(r => (r.result && r.result.samples) || []).reduce((a, b) => a.concat(b), []);
ok(anySample.length >= 10, 'D1 samples were recorded across the matrix', anySample.length);
const withJs = anySample.filter(s => s.t_js_start !== null && s.t_js_end !== null);
ok(withJs.length >= 3, 'D2 some samples carry a JS phase', withJs.length);
/* THE SPLIT COMES FROM RESOURCE TIMING, NOT FROM THE PER-SCRIPT WRAPPER, and that is a measured fact
   rather than a design preference: scriptLoader.ensure() calls its module-local `load`, so wrapping the
   exported KM.scriptLoader.load never intercepts a route set. The first matrix run recorded ZERO per-script
   timings for every route for exactly that reason. Reaching into the module to wrap the internal function
   would be a change to the Loader, which this observation is not permitted to make -- and the browser's own
   ledger already has the number. So `samples[].scripts` is expected to be empty for route sets, and the
   split is asserted where it actually lives. */
const withResources = anySample.filter(s => (s.resources || []).some(r => r.kind === 'script'));
ok(withResources.length >= 3, 'D3 script resource timings were captured by the browser', withResources.length);
// DOWNLOAD vs EXECUTION is the separation S4-R1 reported as NOT_OBSERVABLE from outside the process:
// scriptLoader resolves on the element's onload (AFTER the file has run) and Resource Timing says when its
// last byte landed. The difference is execution.
const DEC = JSON.parse(read('docs/evidence/cp2m-r2-perf/phase-decomposition.json'));
/* THE SECOND HALF IS A TAIL, NOT TOTAL CPU. async=false means scripts execute as they arrive, so
   execution overlaps download and what remains after the last byte is only the part that could not
   overlap. The field is named for what it measures; `jsExecMs` invited exactly the wrong reading. */
const split = Object.keys(DEC).filter(k => typeof DEC[k].jsDownloadMs === 'number'
                                        && typeof DEC[k].jsTailAfterLastByteMs === 'number');
ok(split.length >= 3, 'D4 and the decomposition separates JS download from the post-last-byte execution tail', split);
split.forEach(function (k) {
  const v = DEC[k];
  ok(v.jsDownloadMs >= 0 && v.jsTailAfterLastByteMs >= 0, 'D4a ' + k + ' both halves are non-negative', [v.jsDownloadMs, v.jsTailAfterLastByteMs]);
  ok(v.jsDownloadMs + v.jsTailAfterLastByteMs <= v.jsTotalMs + 2,
    'D4b ' + k + ' and they account for the whole JS phase', [v.jsDownloadMs, v.jsTailAfterLastByteMs, v.jsTotalMs]);
  ok(v.scriptBytes > 0, 'D4c ' + k + ' with the bytes that were actually fetched', v.scriptBytes);
});
// The loopback caveat, asserted so no reader can take the download figure for a production one.
ok(DEC['ops|cold'] && DEC['ops|cold'].scriptBytes > 900000,
  'D4d the largest route really is ~1 MB of JavaScript', DEC['ops|cold'] && DEC['ops|cold'].scriptBytes);
ok(DEC['ops|cold'] && DEC['ops|cold'].jsDownloadMs < 60,
  'D4e and it downloads in milliseconds over LOOPBACK — a lower bound, not a production figure',
  DEC['ops|cold'] && DEC['ops|cold'].jsDownloadMs);
const withShell = anySample.filter(s => s.t_shell_visible !== null);
const withData = anySample.filter(s => s.t_data_visible !== null);
ok(withShell.length >= 5, 'D5 a shell paint was recorded', withShell.length);
ok(withData.length >= 3, 'D6 and a DATA paint, separately', withData.length);
// The whole point: they are not the same instant.
const bothDiffer = anySample.filter(s => s.t_shell_visible !== null && s.t_data_visible !== null
  && (s.t_data_visible - s.t_shell_visible) > 1);
ok(bothDiffer.length >= 1,
  'D7 and on at least one route the data paint is LATER than the shell paint — the gap a spinner cannot close',
  bothDiffer.length);

// THE NUMBER THE WHOLE OBSERVATION IS ABOUT: "the request finished" is not "the screen changed".
const gaps = Object.keys(DEC).filter(k => typeof DEC[k].apiDoneToVisibleMs === 'number');
ok(gaps.length >= 1, 'D8 at least one route records the interval between the API finishing and the screen changing', gaps);
gaps.forEach(function (k) {
  ok(DEC[k].apiDoneToVisibleMs > 0,
    'D8a ' + k + ' and it is positive — the screen changed AFTER the request was already done',
    DEC[k].apiDoneToVisibleMs);
});

// -------------------------------------------------------------------------------------------------------------
section('E. warm is cheaper than cold, which is how we know the phases are real');

let warmCheaper = 0, compared = 0;
ROUTES.forEach(function (r) {
  const colds = runsFor(r, 'cold').map(x => (x.result.program[0] || {}).sampleShellVisible).filter(v => typeof v === 'number');
  const warms = runsFor(r, 'warm').map(x => (x.result.program[2] || {}).sampleShellVisible).filter(v => typeof v === 'number');
  if (!colds.length || !warms.length) return;
  compared++;
  const med = a => a.slice().sort((p, q) => p - q)[Math.floor(a.length / 2)];
  if (med(warms) < med(colds)) warmCheaper++;
});
ok(compared >= 3, 'E1 enough routes had both phases to compare', compared);
ok(warmCheaper >= compared - 1,
  'E2 a return visit is faster than a first visit on essentially every route', { warmCheaper, compared });

// -------------------------------------------------------------------------------------------------------------
section('F. the observation changed no business result, and left nothing behind');

(EV.runs || []).forEach(function (r) {
  if (!r.result || !r.result.ok) return;
  const t = r.result.teardown || {};
  eq(t.wasEnabled, true, 'F1 ' + r.route + '/' + r.phase + '#' + r.iteration + ' the observer was on during the run');
  eq(r.result.installedAfterDisable, 0, 'F2 ' + r.route + '/' + r.phase + '#' + r.iteration + ' and nothing is installed after disable');
  const lk = r.result.listenerLeakCheck || {};
  eq(lk.afterDisable, 0, 'F3 ' + r.route + '/' + r.phase + '#' + r.iteration + ' count is zero before re-enabling');
  eq(lk.afterEnable, lk.afterSecondEnable,
    'F4 ' + r.route + '/' + r.phase + '#' + r.iteration + ' a second enable installs nothing further — no duplicate listener');
  eq(lk.afterSecondDisable, 0, 'F5 ' + r.route + '/' + r.phase + '#' + r.iteration + ' and the cycle returns to zero');
});

// A page that threw is not a page that was slow; the harness records errors so the two cannot be confused.
const errored = (EV.runs || []).filter(r => r.result && r.result.ok && (r.result.pageErrorCount || 0) > 0);
eq(errored.length, 0, 'F6 no run recorded a page error',
  errored.slice(0, 3).map(r => [r.route, (r.result.pageErrors || [])[0]]));

// -------------------------------------------------------------------------------------------------------------
section('G. the recorded bottleneck is still the bottleneck');

// The census is recomputed from the CURRENT index.html, so this cannot quietly describe a past build.
const h = read('index.html');
const srcs = (h.match(/<script[^>]*\bsrc="([^"]+)"/g) || []).map(s => (/src="([^"]+)"/.exec(s) || [])[1].split('?')[0]);
const existing = srcs.filter(p => fs.existsSync(path.join(ROOT, p)));
const totalBytes = existing.reduce((a, p) => a + fs.statSync(path.join(ROOT, p)).size, 0);
const pageScripts = existing.filter(p => p.indexOf('assets/js/pages/') === 0);
const pageBytes = pageScripts.reduce((a, p) => a + fs.statSync(path.join(ROOT, p)).size, 0);

eq(existing.length, CENSUS.bootScriptCount, 'G1 the boot script count matches the recorded census');
eq(totalBytes, CENSUS.bootScriptBytes, 'G2 and the byte total');
eq(pageScripts.length, CENSUS.pageScriptCount, 'G3 and the page-script count');
eq(pageBytes, CENSUS.pageScriptBytes, 'G4 and their bytes');
ok(totalBytes > 3000000, 'G5 the boot payload really is multiple megabytes', totalBytes);
ok(pageBytes / totalBytes > 0.5,
  'G6 and over half of it is page code for pages that are not Home', +(pageBytes / totalBytes).toFixed(3));
// Home is the only page script the boot actually needs.
ok(pageScripts.some(p => /home\.js$/.test(p)), 'G7 home.js is on the boot path (it is the boot route)');
ok(CENSUS.routeOwnedAlready >= 4, 'G8 four routes are already route-owned — the mechanism exists and works',
  CENSUS.routeOwnedAlready);
ok(CENSUS.mechanicallyCleanCandidates >= 1,
  'G9 and the census names candidates that could follow them', CENSUS.mechanicallyCleanCandidates);

// -------------------------------------------------------------------------------------------------------------
section('H. (non-vacuity) the runs describe real navigations');

const okRuns = (EV.runs || []).filter(r => r.result && r.result.ok);
ok(okRuns.length >= 20, 'H1 the matrix really ran', okRuns.length);
eq((EV.runs || []).length - okRuns.length, 0, 'H2 and every run completed',
  (EV.runs || []).filter(r => !(r.result && r.result.ok)).map(r => [r.route, r.phase, r.result && r.result.reason]));
// A navigation that was DRIVEN rather than called proves the click path was exercised.
const clicked = okRuns.filter(r => (r.result.program || []).some(s => s.how === 'click'));
ok(clicked.length >= 10, 'H3 most navigations were driven by a real click on the menu item', clicked.length);
// And the boot numbers are present, so "cold" includes the boot it actually pays for.
okRuns.forEach(function (r) {
  const b = r.result.boot || {};
  ok(b.bootScriptCount > 50, 'H4 ' + r.route + '/' + r.phase + ' the boot census was captured', b.bootScriptCount);
});

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('NAVIGATION PERFORMANCE OBSERVATION (S8-B3-R3-CP2M-R2): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
