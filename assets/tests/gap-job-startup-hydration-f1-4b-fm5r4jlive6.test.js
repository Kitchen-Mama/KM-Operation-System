// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE6 startup stale-job resurrection closure.
// Run: node assets/tests/gap-job-startup-hydration-f1-4b-fm5r4jlive6.test.js
// -----------------------------------------------------------------------------
// Opening / refreshing a page must NEVER auto-show "Calculating… 0/N" for a job the user did not start and that is
// not genuinely advancing. resumeIfRunning reads status ONCE (idle button until then), and enters Calculating ONLY
// for a backend-confirmed PENDING/RUNNING job that shows worker/continuation LIFECYCLE evidence. Every terminal /
// none / lifecycle-less status → stays idle. A stale/legacy non-terminal Script Property is normalized to STALLED by
// the backend status owner (46.gs) — no browser-owned lifecycle mutation, no page-load WRITE, no auto retry.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GR = require('../js/utils/gap-recalc-transport.js');
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var immediate = function () { return Promise.resolve(); };

// Drive resumeIfRunning with a scripted status sequence; capture the UI events + whether polling/write occurred.
function runResume(seq, extra) {
  var i = 0, ev = [], statusReads = 0;
  var statusFn = function () { statusReads++; var s = seq[Math.min(i++, seq.length - 1)]; return Promise.resolve({ success: true, data: s }); };
  var opts = Object.assign({
    wait: immediate, interval: 1, maxPolls: 50, maxStallPolls: 3,
    refresh: function () { ev.push('refresh'); },
    ui: {
      resume: function () { ev.push('resume'); },
      progress: function (s) { ev.push('progress:' + s.scopesProcessed + '/' + s.scopesTotal); },
      refreshing: function () { ev.push('refreshing'); },
      done: function () { ev.push('done'); },
      cancelled: function () { ev.push('cancelled'); },
      failed: function () { ev.push('failed'); }
    }
  }, extra || {});
  return GR.resumeIfRunning(statusFn, opts).then(function (final) { return { ev: ev, final: final, statusReads: statusReads }; });
}
function showedCalculating(ev) { return ev.indexOf('resume') !== -1 || ev.some(function (e) { return String(e).indexOf('progress:') === 0; }); }

// A stale/dead job has NO lifecycle evidence (never advanced, no continuation scheduled, no worker started).
function stale(status) { return { status: status, runId: 'R', scopesProcessed: 0, scopesTotal: 10, lastContinuationScheduledAt: null, lastWorkerStartedAt: null }; }
// A fresh job (just STARTed): PENDING 0/N but a continuation IS scheduled (§G — Calculating 0/N allowed temporarily).
function freshPending() { return { status: 'PENDING', runId: 'R', scopesProcessed: 0, scopesTotal: 10, lastContinuationScheduledAt: '2026-08-10 00:00:01', lastWorkerStartedAt: null }; }
// A genuinely-active job: worker started + progress made.
function activeRunning(n) { return { status: 'RUNNING', runId: 'R', scopesProcessed: n, scopesTotal: 10, lastContinuationScheduledAt: '2026-08-10 00:00:01', lastWorkerStartedAt: '2026-08-10 00:00:02' }; }
var DONE = { status: 'DONE', runId: 'R', scopesProcessed: 10, scopesTotal: 10 };

var jobs = [];
section('A–E — page load on a terminal / none status → idle (never Calculating)');
jobs.push(runResume([{ status: 'NONE' }]).then(function (r) { ok(!showedCalculating(r.ev) && r.ev.length === 0, 'A no job (NONE) → idle, nothing rendered'); }));
jobs.push(runResume([DONE]).then(function (r) { ok(!showedCalculating(r.ev) && r.ev.indexOf('refresh') !== -1, 'B DONE → idle + one materialized refresh (no Calculating)'); }));
jobs.push(runResume([stale('CANCELLED')]).then(function (r) { ok(!showedCalculating(r.ev), 'C CANCELLED → idle'); }));
jobs.push(runResume([stale('FAILED')]).then(function (r) { ok(!showedCalculating(r.ev), 'D FAILED → idle'); }));
jobs.push(runResume([stale('STALLED')]).then(function (r) { ok(!showedCalculating(r.ev), 'E STALLED → idle'); }));

section('F/G — a genuinely-active or freshly-started job DOES resume Calculating');
jobs.push(runResume([activeRunning(3), activeRunning(3), DONE]).then(function (r) { ok(showedCalculating(r.ev) && r.ev.some(function (e) { return e === 'progress:3/10'; }), 'F active RUNNING 3/10 (worker started + progress) → Calculating 3/10'); }));
jobs.push(runResume([freshPending(), activeRunning(1), DONE]).then(function (r) { ok(showedCalculating(r.ev), 'G fresh PENDING 0/10 with a continuation scheduled → Calculating allowed temporarily (§G)'); }));

section('H/I — a stale non-terminal job with NO lifecycle evidence → NOT resurrected (idle)');
jobs.push(runResume([stale('PENDING')]).then(function (r) { ok(!showedCalculating(r.ev), 'H stale PENDING 0/10 (no continuation, no worker) → idle (RESUME_SKIPPED — backend will normalize to STALLED)'); }));
jobs.push(runResume([stale('RUNNING')]).then(function (r) { ok(!showedCalculating(r.ev), 'I stale RUNNING 0/10 (no lifecycle evidence) → idle'); }));

section('J/K — cancelled / completed job + reload → idle');
jobs.push(runResume([stale('CANCELLED')]).then(function (r) { ok(!showedCalculating(r.ev), 'J cancelled job + reload → idle (no resurrection)'); }));
jobs.push(runResume([DONE]).then(function (r) { ok(!showedCalculating(r.ev), 'K completed job + reload → idle'); }));

section('L/M/N — no Calculating before first status; startup is READ-only (no WRITE, no retry)');
jobs.push(runResume([{ status: 'NONE' }]).then(function (r) {
  ok(r.ev.length === 0, 'L terminal/none path renders NOTHING → no Calculating before/around the first status result');
  ok(r.statusReads >= 1, 'M startup performed a READ (status.get) — the only backend call');
}));
// resumeIfRunning has no start/cancel function wired → it can only READ; a WRITE is structurally impossible here.
ok(/function resumeIfRunning/.test(read('js/utils/gap-recalc-transport.js')) && !/startFn|\.job\.start|\.job\.cancel/.test(read('js/utils/gap-recalc-transport.js').slice(read('js/utils/gap-recalc-transport.js').indexOf('function resumeIfRunning'), read('js/utils/gap-recalc-transport.js').indexOf('function resumeIfRunning') + 1400)), 'N resumeIfRunning issues NO start/cancel WRITE (read-only hydration; no auto recalc retry)');

section('O — Inventory job is product-global: a stale global job does not make any country page calculate');
jobs.push(Promise.all([runResume([stale('PENDING')]), runResume([stale('PENDING')]), runResume([stale('PENDING')])]).then(function (rs) {
  ok(rs.every(function (r) { return !showedCalculating(r.ev); }), 'O US/UK/CA page loads on the SAME stale global job → none show Calculating');
}));

section('diagnostics + lifecycle-evidence contract (source)');
var GRSRC = read('js/utils/gap-recalc-transport.js');
ok(/RESUME_CHECK/.test(GRSRC) && /RESUME_ACTIVE/.test(GRSRC) && /RESUME_SKIPPED/.test(GRSRC), '§10 RESUME_CHECK / RESUME_ACTIVE / RESUME_SKIPPED diagnostics present');
ok(/_hasLiveness/.test(GRSRC) && /lastContinuationScheduledAt/.test(GRSRC) && /lastWorkerStartedAt/.test(GRSRC), '§1/§4 resume requires worker/continuation lifecycle evidence (not a bare Script Property)');
ok(/gap-recalc-fm5r4jlive6-1/.test(GRSRC), 'transport VERSION bumped to LIVE6');

section('backend stale authority is the ONE frozen owner (no new timeout in the frontend)');
ok(/function gapJobStaleNonterminal_/.test(F46) && /GAP_JOB_STALE_MS_/.test(F46), '§3 the stale threshold lives in 46.gs (GAP_JOB_STALE_MS_); frontend defines NO numeric timeout');
ok(!/STALE_MS|staleThreshold|60000|600000/.test(GRSRC), 'the frontend introduces NO competing stale timeout constant');

Promise.all(jobs).then(function () {
  console.log('\n----------------------------------------');
  console.log('GAP JOB STARTUP HYDRATION (F1-4B-FM5-R4J-LIVE6): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
});
