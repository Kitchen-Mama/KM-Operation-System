// S8-R4A1 — HARNESS RESILIENCE SAFETY SUITE.
//
// THE INCIDENT THIS SUITE EXISTS FOR. The first R4A matrix measured for thirty minutes and then stood still
// for three hours, holding a live browser, with zero bytes of its measurement on disk. Nothing was wrong with
// the product. The harness sent a CDP command, the browser never replied, and the promise had no timeout — so
// the measurement loop parked inside an `await` that its own `while (elapsed < MAX_WAIT_MS)` deadline could
// never reach. maxwait bounded nothing. When the run was finally stopped, three hours of completed
// measurement windows went with it, because samples were written once, at the end.
//
// Each of those is a separate defect and each gets its own section here:
//   A  every CDP command is bounded, and a missing reply fails in finite time
//   B  a LATE reply cannot settle a newer command, and a timeout leaks no pending id
//   C  a dead transport settles every live command instead of parking the process
//   D  dialogs are always answered, always with the no-write outcome; CONFIRM_ACCEPTED_COUNT is an invariant
//   E  every completed window is durable the moment it completes, and never half-written
//   F  the watchdog trips on real silence and not on scenario E's planned idle
//   G  the runner is actually wired to all of the above — the defect was reachable code, so absence is proven
//   H  none of this weakened the R4A safety contract
//
// NO BROWSER. NO NETWORK. NO PRODUCTION READ. The registry takes its clock and its timers, so a twenty-second
// timeout is tested in microseconds; a defect that can only be reproduced by running the matrix for three
// hours is a defect that does not get reproduced.
// TEST_DATA_CLASSIFICATION = FIXTURES_AND_SOURCE_TEXT   PRODUCTION_WRITE_AUTHORIZED = NO
//
// Run: node assets/tests/s8-r4a1-harness-resilience.test.js

'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var TOOLS = 'tools/s8-fatigue/';
var R_F = TOOLS + 's8-r4a-resilience.js';
var RUN_F = TOOLS + 's8-r4a-browser-fatigue.js';

var R = require(path.join(ROOT, R_F));
var AL = require(path.join(ROOT, TOOLS + 's8-r4a-action-allowlist.js'));
var RSRC = read(R_F), RUN = read(RUN_F);

var pass = 0, fail = 0, mutants = 0, survived = 0;
function ok(c, l, x) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (x === undefined ? '' : '\n  got ' + JSON.stringify(x))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function loadMutated(rel, from, to) {
  var src = read(rel);
  if (src.indexOf(from) === -1) throw new Error('mutation anchor not found in ' + rel + ': ' + from);
  var mod = { exports: {} };
  new Function('module', 'exports', 'require', src.replace(from, to))(mod, mod.exports, require);
  return mod.exports;
}
// Load the module against an in-memory fs that RECORDS the call sequence. Atomicity is a property of HOW the
// bytes reach the destination, not of what is left lying around afterwards, so it can only be tested by
// watching the writes themselves.
function loadWithSpyFs(rel, from, to) {
  var src = read(rel);
  if (from && src.indexOf(from) === -1) throw new Error('mutation anchor not found: ' + from);
  var files = {}, calls = [];
  var spy = {
    writeFileSync: function (p, t) { calls.push(['write', p]); files[p] = t; },
    renameSync: function (a, b) {
      if (!Object.prototype.hasOwnProperty.call(files, a)) { var e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      calls.push(['rename', a, b]); files[b] = files[a]; delete files[a];
    },
    unlinkSync: function (p) { calls.push(['unlink', p]); delete files[p]; },
    existsSync: function (p) { return Object.prototype.hasOwnProperty.call(files, p); },
    mkdirSync: function () {}
  };
  var mod = { exports: {} };
  new Function('module', 'exports', 'require', from ? src.replace(from, to) : src)(
    mod, mod.exports, function (n) { return n === 'fs' ? spy : require(n); });
  return { mod: mod.exports, calls: calls, files: files };
}

var pendingMutants = [];
function mut(label, rel, from, to, probe) {
  pendingMutants.push({ label: label, rel: rel, from: from, to: to, probe: probe });
}
async function runMutants() {
  for (var i = 0; i < pendingMutants.length; i++) {
    var m = pendingMutants[i];
    mutants++;
    var caught = false;
    try { caught = (await m.probe(loadMutated(m.rel, m.from, m.to))) === true; } catch (e) { caught = true; }
    if (caught) { pass++; console.log('ok   MUTANT CAUGHT — ' + m.label); }
    else { survived++; fail++; console.error('FAIL MUTANT SURVIVED — ' + m.label); }
  }
}

// ------------------------------------------------------------------------------------------------------------
// A controllable clock and timer set. The registry takes both by injection precisely so the timeout path can
// be driven deterministically instead of by sleeping through it.
// ------------------------------------------------------------------------------------------------------------
function fakeEnv() {
  var t = 1000, timers = [], seq = 0;
  return {
    now: function () { return t; },
    setTimer: function (fn, ms) { var h = { id: ++seq, at: t + ms, fn: fn, dead: false }; timers.push(h); return h; },
    clearTimer: function (h) { if (h) { h.dead = true; } },
    advance: function (ms) {
      t += ms;
      timers.slice().sort(function (a, b) { return a.at - b.at; }).forEach(function (h) {
        if (!h.dead && h.at <= t) { h.dead = true; h.fn(); }
      });
    },
    liveTimers: function () { return timers.filter(function (h) { return !h.dead; }).length; }
  };
}
function settled(p) {
  // Did the promise settle, and how? Resolved to a tag so a test can assert on the outcome without hanging.
  return Promise.race([
    p.then(function (v) { return { state: 'resolved', value: v }; },
           function (e) { return { state: 'rejected', code: e && e.code, method: e && e.method,
                                   surface: e && e.surface, elapsedMs: e && e.elapsedMs }; }),
    new Promise(function (res) { setTimeout(function () { res({ state: 'pending' }); }, 25); })
  ]);
}
function mkReg(env, extra) {
  var o = { now: env.now, setTimer: env.setTimer, clearTimer: env.clearTimer, timeoutMs: 20000 };
  Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
  return R.createPendingRegistry(o);
}

async function main() {

// ============================================================================================================
section('A. EVERY CDP COMMAND IS BOUNDED — A MISSING REPLY FAILS IN FINITE TIME');
// ============================================================================================================
// The defect, stated as a test: a command whose reply never arrives must not stay pending forever.

var env = fakeEnv();
var seen = [];
var reg = mkReg(env, { onTimeout: function (i) { seen.push(i); } });
var id1 = reg.nextId();
var p1 = reg.register(id1, 'Runtime.evaluate', { surface: 'Site Inventory', scenario: 'F-interact', cycle: 1 });

ok(reg.pendingCount() === 1, 'a registered command is pending before its deadline');
eq((await settled(p1)).state, 'pending', 'and it is still unsettled one tick in — a timeout is not an instant failure');

env.advance(19999);
eq((await settled(p1)).state, 'pending', 'at 19999 ms it has NOT timed out — the bound is a deadline, not a guess');

env.advance(2);
var out1 = await settled(p1);
eq(out1.state, 'rejected', 'at 20001 ms the command rejects rather than waiting for a reply that is not coming');
eq(out1.code, 'CDP_COMMAND_TIMEOUT', 'and it rejects with a typed code the caller can recognise');
eq(out1.method, 'Runtime.evaluate', 'the rejection names the METHOD — the hung run could not say which command died');
eq(out1.surface, 'Site Inventory', 'and the SURFACE, which is what makes the dump actionable');
ok(out1.elapsedMs >= 20000, 'and the elapsed time it waited', out1.elapsedMs);
eq(seen.length, 1, 'the onTimeout hook fires exactly once so the runner can log it');
eq([seen[0].method, seen[0].surface, seen[0].scenario], ['Runtime.evaluate', 'Site Inventory', 'F-interact'],
   'and the hook carries the full window context');

// A delayed-but-valid reply must still succeed. A timeout that is too eager turns a slow page into a fake
// failure, which is the same class of error as the hang: a measurement of the harness, not the product.
var env2 = fakeEnv(), reg2 = mkReg(env2);
var id2 = reg2.nextId();
var p2 = reg2.register(id2, 'Runtime.evaluate', { surface: 'FC Summary' });
env2.advance(19000);
eq(reg2.deliver({ id: id2, result: { result: { value: 42 } } }), 'RESOLVED',
   'a reply at 19 s — inside the bound — resolves the command');
var out2 = await settled(p2);
eq(out2.state, 'resolved', 'a slow but real reply is NOT a timeout');
eq(out2.value.result.result.value, 42, 'and the caller receives the real payload unchanged');
eq(reg2.timeouts().length, 0, 'no timeout is recorded for a command that answered');
eq(env2.liveTimers(), 0, 'and its timer is cleared, so a resolved command cannot fire a late timeout');

eq(R.CDP_COMMAND_TIMEOUT_MS, 20000, 'the shipped bound is 20 s');
ok(R.CDP_COMMAND_TIMEOUT_MS < 180000 / 4,
   'and it is substantially smaller than a 180 s surface maxwait, as §3 requires', R.CDP_COMMAND_TIMEOUT_MS);

// ============================================================================================================
section('B. A LATE REPLY CANNOT CORRUPT A NEWER COMMAND, AND A TIMEOUT LEAKS NOTHING');
// ============================================================================================================
// The subtle one. If ids were recycled after a timeout, a reply that arrived four minutes late would settle
// whichever command now held that id — and the measurement would silently attribute one page's result to
// another. Monotonic ids plus tombstones make that unrepresentable.

var env3 = fakeEnv(), reg3 = mkReg(env3);
var a = reg3.nextId();
var pa = reg3.register(a, 'Runtime.evaluate', { surface: 'Site Inventory' });
env3.advance(20001);
eq((await settled(pa)).state, 'rejected', 'the first command times out');
eq(reg3.pendingCount(), 0, 'NO PENDING ID IS LEAKED — the timed-out entry is removed from the live set');
eq(reg3.tombstoneCount(), 1, 'it becomes a tombstone instead, so the id stays spoken for');

var b = reg3.nextId();
ok(b !== a, 'the next id is NOT the timed-out id — ids are monotonic and never recycled', { a: a, b: b });
var pb = reg3.register(b, 'Page.navigate', { surface: 'PO Overview' });
eq(reg3.deliver({ id: a, result: { result: { value: 'stale' } } }), 'LATE_IGNORED',
   'the late reply to the dead command is identified as late and discarded');
eq((await settled(pb)).state, 'pending', 'AND THE NEWER COMMAND IS UNTOUCHED — no cross-settling');
eq(reg3.deliver({ id: b, result: { result: { value: 'mine' } } }), 'RESOLVED', 'the newer command settles on its OWN reply');
eq((await settled(pb)).value.result.result.value, 'mine', 'with its own payload');
eq(reg3.deliver({ id: 9999 }), 'UNKNOWN_ID', 'a reply to an id that was never issued is reported, not swallowed');
eq(reg3.deliver({ method: 'Network.loadingFinished' }), 'NOT_A_REPLY', 'an event is not mistaken for a reply');

var env4 = fakeEnv(), reg4 = mkReg(env4);
[1, 2, 3].forEach(function () { var i = reg4.nextId(); reg4.register(i, 'X').catch(function () {}); });
eq(reg4.pendingCount(), 3, 'three commands in flight');
env4.advance(20001);
eq(reg4.pendingCount(), 0, 'all three time out — the registry does not leak under load');
eq(reg4.timeouts().length, 3, 'and each is itemised for the dump');

// ============================================================================================================
section('C. A DEAD TRANSPORT SETTLES EVERY LIVE COMMAND');
// ============================================================================================================
// If the socket dies, a command whose reply can never arrive must fail NOW. Waiting the full timeout for a
// socket that is already closed is just the hang again, with a shorter fuse.

var env5 = fakeEnv(), reg5 = mkReg(env5);
var c1 = reg5.nextId(), c2 = reg5.nextId();
var pc1 = reg5.register(c1, 'Runtime.evaluate'), pc2 = reg5.register(c2, 'Page.navigate');
eq(reg5.rejectAll('devtools socket closed'), 2, 'closing the socket rejects both live commands');
var oc = await settled(pc1);
eq(oc.state, 'rejected', 'the first is rejected');
eq(oc.code, 'CDP_TRANSPORT_CLOSED', 'with a code that distinguishes a dead socket from a slow page');
eq((await settled(pc2)).state, 'rejected', 'and so is the second');
eq(reg5.pendingCount(), 0, 'nothing is left pending');
eq(env5.liveTimers(), 0, 'and no timer survives to fire against a settled command');

// ============================================================================================================
section('D. DIALOGS ARE ALWAYS ANSWERED, ALWAYS WITH THE NO-WRITE OUTCOME');
// ============================================================================================================
// An open native dialog blocks the renderer, which is how every later evaluate hangs. The rule is not merely
// "handle it" — it is "handle it in the direction that cannot write".

eq(R.dialogDecision({ type: 'alert' }).accept, false, 'alert is dismissed');
eq(R.dialogDecision({ type: 'confirm' }).accept, false, 'CONFIRM IS DISMISSED — never accepted');
eq(R.dialogDecision({ type: 'prompt' }).accept, false, 'prompt is dismissed');
eq(R.dialogDecision({ type: 'prompt' }).promptText, '', 'and submits no text');
eq(R.dialogDecision({ type: 'CONFIRM' }).accept, false, 'the type match is case-insensitive, so odd casing cannot accept a confirm');
eq(R.dialogDecision({ type: 'beforeunload' }).accept, true,
   'beforeunload is accepted — it runs no application handler, and dismissing it would cancel the navigation');
eq(R.dialogDecision({ type: 'beforeunload' }).action, 'ACCEPT_NAVIGATION', 'and it is labelled as navigation, not as an application dialog');
eq(R.dialogDecision({ type: 'something-new' }).action, 'ABORT_SURFACE',
   'an UNKNOWN dialog type cannot be proven read-only-safe, so §4 aborts the surface');
eq(R.dialogDecision({ type: 'something-new' }).accept, false, 'and is still never accepted');
eq(R.dialogDecision({}).action, 'ABORT_SURFACE', 'a dialog with no type is unknown, not assumed benign');

var dh = R.createDialogHandler();
var h1 = dh.handle({ type: 'confirm', message: 'Delete 400 allocation rows?' },
                   { surface: 'Site Inventory', scenario: 'F-interact', cycle: 1 });
eq(h1.command.method, 'Page.handleJavaScriptDialog', 'the decision becomes the CDP command that unblocks the renderer');
eq(h1.command.params.accept, false, 'with accept=false for a confirm');
eq(h1.record.surface, 'Site Inventory', 'and the dialog is recorded against the surface that raised it');
eq(h1.record.message, 'Delete 400 allocation rows?', 'with its message, so the operator can see what was refused');
dh.handle({ type: 'alert', message: 'done' }, {});
dh.handle({ type: 'prompt', message: 'name?' }, {});
var hUnknown = dh.handle({ type: 'weird' }, { surface: 'PO Overview' });
eq(dh.count(), 4, 'every dialog is counted');
eq(dh.confirmAcceptedCount(), 0, 'CONFIRM_ACCEPTED_COUNT = 0');
eq(dh.defaultAction, 'DISMISS', 'DIALOG_DEFAULT_ACTION = DISMISS');
eq(dh.abortedSurfaces().length, 1, 'the unknown dialog marks its surface aborted');
eq(hUnknown.command.method, 'Page.handleJavaScriptDialog',
   'AND THE UNKNOWN DIALOG IS STILL ANSWERED — abandoning the measurement must not re-create the hang');

// ============================================================================================================
section('E. EVERY COMPLETED WINDOW IS DURABLE THE MOMENT IT COMPLETES');
// ============================================================================================================
// END_OF_RUN_ONLY_EVIDENCE_DEPENDENCY = NO. If the process dies after window N, N windows survive.

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a1-ckpt-'));
var ck = R.createCheckpointWriter(dir);
ck.record({ surface: 'FC Summary', scenario: 'A-cold', PAGE_FULL_STABLE_MS: 16000 },
          { scenario: 'A-cold', surface: 'FC Summary', safety: { WRITE_ACTIONS_SENT: 0 } });

ok(fs.existsSync(ck.files.samples), 'the samples file exists after the FIRST window, not at the end of the run');
ok(fs.existsSync(ck.files.progress), 'so does the progress file');
ok(fs.existsSync(ck.files.safety), 'and the safety counters file');
var s1 = JSON.parse(fs.readFileSync(ck.files.samples, 'utf8'));
eq(s1.count, 1, 'one window is recorded');
eq(s1.samples[0].surface, 'FC Summary', 'with its real content');
eq(JSON.parse(fs.readFileSync(ck.files.safety, 'utf8')).WRITE_ACTIONS_SENT, 0,
   'THE SAFETY COUNTERS ARE READABLE MID-RUN — the hung run could not report them at all');
var pr1 = JSON.parse(fs.readFileSync(ck.files.progress, 'utf8'));
eq(pr1.completedWindows, 1, 'progress names the completed count');
eq(pr1.surface, 'FC Summary', 'and the surface under measurement, which §11 needs for the human-test avoid-list');

ck.record({ surface: 'Site Inventory', scenario: 'A-cold' }, { scenario: 'A-cold', surface: 'Site Inventory' });
var s2 = JSON.parse(fs.readFileSync(ck.files.samples, 'utf8'));
eq(s2.count, 2, 'the second window is appended, not overwritten');
eq(s2.samples[0].surface, 'FC Summary', 'and window 1 is still there — losing window N+1 costs only window N+1');
eq(JSON.parse(fs.readFileSync(ck.files.progress, 'utf8')).surface, 'Site Inventory', 'progress advanced to the live surface');

// Atomic: the reader never sees a partial document.
var target = path.join(dir, 'atomic.json');
R.writeAtomic(target, JSON.stringify({ a: 1 }));
R.writeAtomic(target, JSON.stringify({ a: 2, b: 'x' }));
eq(JSON.parse(fs.readFileSync(target, 'utf8')).a, 2, 'an atomic rewrite replaces the whole document');
eq(fs.readdirSync(dir).filter(function (f) { return f.indexOf('.tmp-') !== -1; }).length, 0,
   'and leaves no temp file behind');

// The strategy itself, watched call by call: the destination must never be opened for writing. That is the
// whole of atomicity — both a direct write and a temp-then-rename end with the right bytes in place, but only
// one of them can be interrupted halfway and leave a corrupt file under the real name.
var spyLoad = loadWithSpyFs(R_F, null, null);
spyLoad.mod.writeAtomic('/out/s8-r4a-samples.partial.json', '{"count":1}');
eq(spyLoad.calls.map(function (c) { return c[0]; }), ['write', 'rename'],
   'a checkpoint is written to a temp file and then RENAMED over the destination');
ok(!spyLoad.calls.some(function (c) { return c[0] === 'write' && c[1] === '/out/s8-r4a-samples.partial.json'; }),
   'the destination is never written to directly, so a reader never sees a partial document');

ck.note({ status: 'WATCHDOG_EXIT', surface: 'Site Inventory' });
eq(JSON.parse(fs.readFileSync(ck.files.progress, 'utf8')).status, 'WATCHDOG_EXIT',
   'an abnormal exit is recorded in the progress file, so a dead run says why it died');
fs.rmSync(dir, { recursive: true, force: true });

// ============================================================================================================
section('F. THE WATCHDOG TRIPS ON REAL SILENCE, NOT ON PLANNED IDLE');
// ============================================================================================================

var env6 = fakeEnv(), tripped = [];
var wd = R.createWatchdog({ thresholdMs: 300000, now: env6.now, setTimer: env6.setTimer,
                            clearTimer: env6.clearTimer, onTrip: function (d) { tripped.push(d); } });
wd.progress('A-cold:FC Summary');
env6.advance(299999);
eq(wd.check(), null, 'just under the threshold it does not trip — a slow surface is not a hang');
env6.advance(2);
var dump = wd.check();
ok(dump !== null, 'past the threshold it trips');
eq(dump.reason, 'WATCHDOG_NO_PROGRESS', 'with a named reason');
eq(dump.lastProgress, 'A-cold:FC Summary', 'and the last thing that made progress');
ok(dump.idleMs >= 300000, 'and how long the silence lasted', dump.idleMs);
eq(tripped.length, 1, 'the trip hook fires once');
eq(wd.check(), null, 'and only once — a tripped watchdog does not trip repeatedly while the process exits');

var env7 = fakeEnv();
var wd2 = R.createWatchdog({ thresholdMs: 300000, now: env7.now, setTimer: env7.setTimer, clearTimer: env7.clearTimer });
wd2.progress('E-before:Site Inventory');
wd2.pause('scenario-E-idle');
env7.advance(600000);
eq(wd2.check(), null, 'SCENARIO E IDLES FIVE MINUTES BY DESIGN — paused, the watchdog does not call that a hang');
ok(wd2.isPaused() === true, 'and it knows it is paused');
wd2.resume();
eq(wd2.idleMs(), 0, 'resuming restarts the clock rather than counting the planned idle against the next surface');
env7.advance(300001);
ok(wd2.check() !== null, 'and after resuming, a real silence still trips it');

var env8 = fakeEnv();
var wd3 = R.createWatchdog({ thresholdMs: 300000, now: env8.now, setTimer: env8.setTimer, clearTimer: env8.clearTimer });
env8.advance(200000); wd3.progress('C-cycle:PO Overview');
env8.advance(200000);
eq(wd3.check(), null, 'progress resets the clock, so a long but advancing run is never killed');

ok(R.WATCHDOG_THRESHOLD_MS > R.CDP_COMMAND_TIMEOUT_MS,
   'the watchdog is the BACKSTOP: a dead command fails on its own bound long before the watchdog sees it');

// ============================================================================================================
section('G. THE RUNNER IS WIRED TO ALL OF IT — UNBOUNDED_CDP_SEND_REACHABLE = NO');
// ============================================================================================================
// The defect was reachable code, so its absence has to be proven against the shipped source, not assumed.

ok(RUN.indexOf("require('./s8-r4a-resilience.js')") !== -1, 'the runner loads the resilience module');
ok(RUN.indexOf('R.createPendingRegistry') !== -1, 'and its CDP client delegates id allocation to the bounded registry');
ok(RUN.indexOf('pending[myId] = res') === -1,
   'THE UNBOUNDED SEND IS GONE — no command stores a bare resolver with no deadline');
ok(/send:\s*function\s*\(method, params\)\s*\{[\s\S]{0,400}?reg\.register\(/.test(RUN),
   'every send() goes through register(), so there is no second, unbounded path');
ok(RUN.indexOf("reg.rejectAll('devtools socket closed')") !== -1, 'a closed socket settles the live commands');
ok(RUN.indexOf("c.on('Page.javascriptDialogOpening'") !== -1, 'the dialog handler is registered');
ok(RUN.indexOf('dialogs.handle(p, windowTag)') !== -1, 'and routed through the tested policy rather than an inline decision');
ok(RUN.indexOf('c.emit(cmd.method, cmd.params)') !== -1,
   'the Fetch continue/abort is fire-and-forget, so interception cannot fill the registry with commands nobody reads');
ok(RUN.indexOf('c.send(cmd.method, cmd.params)') === -1, 'and the old awaited form is gone');
ok(RUN.indexOf('R.createCheckpointWriter(OUT)') !== -1, 'the checkpoint writer is created against the output directory');
ok((RUN.match(/persist\(/g) || []).length >= 4, 'and every sample path persists — note(), D-burst and F-interact',
   (RUN.match(/persist\(/g) || []).length);
ok(RUN.indexOf('watchdog.start()') !== -1, 'the watchdog is started');
ok(RUN.indexOf("watchdog.pause('scenario-E-idle')") !== -1, 'paused around the planned idle');
ok(RUN.indexOf('watchdog.resume()') !== -1, 'and resumed after it');
ok(RUN.indexOf('process.exit(3)') !== -1, 'a tripped watchdog exits NON-ZERO rather than parking the process for hours');

// Found by fault injection, not by reading: with a 1 ms bound every command timed out, the top-level catch
// ran — and the process still hung for six minutes. process.exitCode only takes effect when the event loop
// drains, and a spawned Chrome plus a listening server never let it drain. The hang had a second mouth.
ok(/\}\)\(\)\.catch\(function \(e\) \{[\s\S]{0,400}?teardown\(\);[\s\S]{0,120}?process\.exit\(1\);/.test(RUN),
   'A FAILED RUN TEARS DOWN AND EXITS — it does not set exitCode and wait for an event loop that never drains');
ok(RUN.indexOf('try { chrome.kill(); } catch (e) {}') !== -1, 'teardown kills the ephemeral browser');
ok(RUN.indexOf('try { server.close(); } catch (e) {}') !== -1, 'and closes the listening server');
ok(RUN.indexOf('watchdog.start()') < RUN.indexOf("await c.send('Fetch.enable'"),
   'THE WATCHDOG IS ARMED BEFORE THE CDP DOMAINS ARE ENABLED — a hang during setup is still a hang',
   { start: RUN.indexOf('watchdog.start()'), enable: RUN.indexOf("await c.send('Fetch.enable'") });
ok(/dump\.pendingCdpCommands = 'unavailable'/.test(RUN),
   'and its dump is defensive, because arming it early means it can trip while that state is still undefined');
ok(/catch \(e\) \{ return undefined; \}/.test(RUN),
   'a timed-out evaluate returns undefined instead of throwing the whole run away');
ok(RUN.indexOf("ended = 'CDP_TIMEOUT'") !== -1, 'and the measurement loop breaks out of a surface whose commands are dying');
ok(RUN.indexOf("ended = 'DIALOG_ABORT'") !== -1, 'as it does for a surface whose dialog could not be proven safe');
ok(RUN.indexOf('AUTOMATED_FATIGUE_STATUS = RUNNING') !== -1, 'the §11 human-test banner is emitted at rerun start');
ok(RUN.indexOf('HUMAN_TEST_SAFE = YES') !== -1, 'with HUMAN_TEST_SAFE = YES');
ok(RUN.indexOf('CONFIRM_ACCEPTED_COUNT = ') !== -1, 'and the final report prints CONFIRM_ACCEPTED_COUNT');

// ============================================================================================================
section('H. THE R4A SAFETY CONTRACT IS UNCHANGED');
// ============================================================================================================
// A resilience repair that quietly widened the write surface would be a far worse outcome than the hang.

eq(AL.approvedActions().length, 16, 'the allowlist is still exactly 16 actions');
eq(AL.decide({ action: 'gapJob.status.get', method: 'GET' }).ok, false, 'gapJob.status.get is still refused');
eq(AL.decide({ action: 'gapJob.status.get', method: 'GET' }).code, 'ACTION_FORBIDDEN', 'as forbidden, not as unknown');
eq(AL.decide({ action: 'inventory.adjust', method: 'POST' }).ok, false, 'an unapproved write action is still refused');
eq(AL.decide({ action: 'getOperationDb', method: 'POST' }).ok, false, 'and a verb outside the approved set is still refused');
ok(RSRC.indexOf('Page.handleJavaScriptDialog') !== -1, 'the dialog command is named in the resilience module');
var acceptTrue = RSRC.split('\n').filter(function (l) { return /accept:\s*true/.test(l); });
ok(acceptTrue.length === 1 && acceptTrue[0].indexOf('ACCEPT_NAVIGATION') !== -1,
   'accept:true appears exactly ONCE in the whole module, and it is the beforeunload branch', acceptTrue);
ok(RUN.indexOf('Fetch.enable') !== -1 && RUN.indexOf("requestStage: 'Request'") !== -1,
   'interception is still PRE-NETWORK, at the Request stage');
ok(RUN.indexOf('fs.mkdtempSync(path.join(os.tmpdir()') !== -1, 'and the browser profile is still ephemeral');

// ============================================================================================================
section('I. S8-R4B-0 — ABANDONED READS LEAVE THE OPEN MAP, AND AN EVICTION IS NEVER A COMPLETION');
// ============================================================================================================
// The R4A matrix lost the stable time of 4 of 161 windows because scenario D's deliberate mid-flight
// navigation left a read in the map that nothing could ever remove. The repair must remove it WITHOUT
// inventing a duration for it and WITHOUT making a page look stable that is not.

var envM = fakeEnv();
var om = R.createOpenMap({ now: envM.now, staleMs: 90000 });
var recA = { action: 'fcSummary.workspace.get', surface: 'FC Summary', scenario: 'A-cold', cycle: 0 };
om.add('net-1', recA);
eq(om.size(), 1, 'an intercepted read is tracked as open');
eq(om.ids(), ['net-1'], 'by its network id');
eq(om.actions(), ['fcSummary.workspace.get'], 'and the action is reportable while it is in flight');
eq(om.add(null, {}), false, 'a request with no network id is NOT tracked — an untrackable entry could never be removed');
eq(om.add('', {}), false, 'and neither is an empty one');
eq(om.size(), 1, 'so the map is unchanged by either');

// A REAL completion.
envM.advance(8100);
var doneRec = om.settle('net-1');
eq(doneRec.ms, 8100, 'a settled read records its measured backend duration');
eq(om.size(), 0, 'and leaves the map');
eq(doneRec.abandoned, undefined, 'a settled read is NOT marked abandoned');
eq(om.evictionCount(), 0, 'and no eviction is recorded for it');
eq(om.settle('net-1'), null, 'settling it twice is a no-op, so a duration cannot be overwritten');

// AN EVICTION.
var envN = fakeEnv();
var om2 = R.createOpenMap({ now: envN.now, staleMs: 90000 });
var recB = { action: 'shipment.workspace.get', surface: 'Shipment Overview', scenario: 'D-burst', cycle: 1 };
om2.add('net-2', recB);
envN.advance(5000);
var ev = om2.evict('net-2', 'DOCUMENT_REPLACED');
eq(recB.ms, undefined, 'AN EVICTED READ NEVER GAINS AN `ms` — BACKEND_DURATION_MUTATED = NO');
eq(recB.http, undefined, 'and never gains an http status');
eq(recB.abandoned, 'DOCUMENT_REPLACED', 'it is marked abandoned, with the reason');
eq(recB.abandoned_after_ms, 5000, 'and how long it had been open — a field that cannot be mistaken for a duration');
eq(om2.size(), 0, 'it leaves the map, so it can no longer block stability');
eq(om2.evictionCount(), 1, 'the eviction is RECORDED, never silent');
eq([ev.action, ev.surface, ev.scenario, ev.why], ['shipment.workspace.get', 'Shipment Overview', 'D-burst', 'DOCUMENT_REPLACED'],
   'with the action, surface, scenario and reason — enough to attribute it afterwards');
eq(om2.settle('net-2'), null, 'AND IT CANNOT BE RESURRECTED — a late settle on an evicted id does nothing');
eq(recB.ms, undefined, 'so a late event still cannot give it a duration');

// evictAll — the navigation case, which is the defect that was observed.
var envO = fakeEnv();
var om3 = R.createOpenMap({ now: envO.now, staleMs: 90000 });
om3.add('n1', { action: 'a' }); om3.add('n2', { action: 'b' }); om3.add('n3', { action: 'c' });
envO.advance(1200);
var all = om3.evictAll('DOCUMENT_REPLACED');
eq(all.length, 3, 'a navigation evicts every open entry');
eq(om3.size(), 0, 'the map is empty afterwards — this is the four-window defect, removed');
eq(om3.evictionList().map(function (e) { return e.why; }), ['DOCUMENT_REPLACED', 'DOCUMENT_REPLACED', 'DOCUMENT_REPLACED'],
   'and all three are recorded');

// evictStale — the in-document case.
var envP = fakeEnv();
var om4 = R.createOpenMap({ now: envP.now, staleMs: 90000 });
om4.add('fresh', { action: 'live' });
envP.advance(89999);
eq(om4.evictStale().length, 0, 'a read still inside the bound is NOT evicted');
eq(om4.size(), 1, 'it stays open, because it can still answer');
envP.advance(2);
eq(om4.evictStale().length, 1, 'past the bound it is evicted');
eq(om4.evictionList()[0].why, 'STALE_BEYOND_CLIENT_BOUND', 'with the reason that justifies it');
eq(om4.size(), 0, 'and the map is clear');

eq(R.CLIENT_READ_BOUND_MS, 45000, 'the bound is derived from the application, not chosen: KM_READ_TIMEOUT_MS_');
eq(R.STALE_OPEN_MS, 90000, 'and the stale bound is TWICE it');
ok(R.STALE_OPEN_MS > R.CLIENT_READ_BOUND_MS,
   'FALSE_STABILITY_POSSIBLE = NO rests on this: past twice its own abort bound the application has ' +
   'provably stopped listening, so an evicted response can no longer mutate the page');

// Wiring.
ok(RUN.indexOf('R.createOpenMap(') !== -1, 'the runner uses the module map rather than a second inline one');
ok(!/(?<![\w.])open\[/.test(RUN), 'and no bare open[...] access survives in the runner');
ok(RUN.indexOf("openMap.evictAll('DOCUMENT_REPLACED')") !== -1, 'a navigation evicts in the runner');
ok(RUN.indexOf('openMap.evictAll') > RUN.indexOf("await c.send('Page.navigate'"),
   'and it happens AFTER Page.navigate, not before, so it clears the document that is actually gone');
ok(RUN.indexOf('openMap.evictStale()') !== -1, 'the measurement loop ages out abandoned reads');
ok(RUN.indexOf('open_map_evictions: openMap.evictionCount() - evi0') !== -1,
   'and every window records how many evictions happened inside it, so a contaminated measurement is identifiable');
ok(RSRC.indexOf('o.rec.ms = clock() - o.t0;') !== -1 && RSRC.split('o.rec.ms =').length === 2,
   'ms is written in EXACTLY ONE place in the module — settle() — and nowhere else');

// ============================================================================================================
section('J. S8-R4B-3 — THE REDIRECT DIAGNOSTIC OBSERVES, AND CHANGES NOTHING');
// ============================================================================================================
// R4B-3 established the bounce's SHAPE from the R4A dataset but not its STATUS: per-hop HTTP status and
// Location were never recorded, so "the echo hop redirects back to /exec" was inferred from the next hop's
// URL. This capture closes that — and the thing it must not do is buy the observation with the safety
// property that the whole round rests on.

ok(RUN.indexOf('p.redirectResponse') !== -1, 'the runner records the redirect that caused each hop');
ok(RUN.indexOf("requestStage: 'Request'") !== -1,
   'AND INTERCEPTION IS STILL AT THE REQUEST STAGE — the diagnostic did not buy observability with the ' +
   'pre-network guarantee');
ok(!/requestStage:\s*'Response'/.test(RUN), 'nothing is intercepted at the Response stage');
ok(RUN.indexOf('Fetch.enable') < RUN.indexOf('p.redirectResponse') ||
   RUN.indexOf('p.redirectResponse') !== -1, 'the capture rides the existing Network domain, not a new Fetch pattern');
ok(RUN.indexOf('locationPresent: !!loc') !== -1,
   'the Location header is reduced to PRESENCE — a Location carries a user_content_key, and a diagnostic ' +
   'has no business writing a token into a report');
ok(!/location:\s*loc\b/.test(RUN) && !/user_content_key:/.test(RUN), 'no raw redirect target is stored');
ok(RUN.indexOf('REDIRECT_HOPS_OBSERVED: redirects.length') !== -1, 'and the count reaches the report');

// The diagnostic must not have touched the allowlist or the guard.
eq(AL.approvedActions().length, 16, 'the approved action count is still 16 after the diagnostic');
eq(AL.decide({ action: 'gapJob.status.get', method: 'GET' }).code, 'ACTION_FORBIDDEN',
   'and gapJob.status.get is still refused');

// ============================================================================================================
section('MUTANTS');
// ============================================================================================================

mut('the command timeout is removed and send can hang forever', R_F,
  '        rec.timer = setTimer(function () {', '        rec.timer = (function () { return null; })(function () {',
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); var p = g.register(i, 'Runtime.evaluate'); p.catch(function () {});
    e.advance(999999);
    return (await settled(p)).state === 'pending';
  });

mut('ids are recycled after a timeout, so a late reply settles a newer command', R_F,
  '    function nextId() { seq++; return seq; }',
  '    function nextId() { var t = Object.keys(tombstone); if (t.length) { var r = t[0]; delete tombstone[r]; return Number(r); } seq++; return seq; }',
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); g.register(i, 'A').catch(function () {});
    e.advance(20001);
    var j = g.nextId();
    return j === i;                       // the newer command now wears the dead command's id
  });

mut('a timed-out id stays in the live pending set', R_F,
  '          delete pending[id];\n          var elapsed = clock() - startedAt;',
  '          var elapsed = clock() - startedAt;',
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); g.register(i, 'A').catch(function () {});
    e.advance(20001);
    return g.pendingCount() !== 0;
  });

mut('a late reply is delivered to the dead command instead of being ignored', R_F,
  "      if (tombstone[msg.id]) { return 'LATE_IGNORED'; }", "      void 0;",
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); g.register(i, 'A').catch(function () {});
    e.advance(20001);
    return g.deliver({ id: i }) !== 'LATE_IGNORED';
  });

// A resolved command's timer must be CLEARED, not merely rendered harmless. The timeout callback does also
// guard on `pending[id]`, so leaving the timer armed produces no wrong answer — but every command in a
// multi-hour matrix would leave a live 20 s timer holding its closure and keeping the event loop alive.
// The probe therefore checks the timer set directly rather than the outcome.
mut('a resolved command leaves its timer armed, leaking one live timer per command', R_F,
  '        clearTimer(rec.timer);\n        delete pending[msg.id];', '        delete pending[msg.id];',
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); var p = g.register(i, 'A'); p.catch(function () {});
    g.deliver({ id: i, result: {} });
    return e.liveTimers() !== 0;          // checked BEFORE advancing: the timer must already be gone
  });

mut('a dead socket drops its commands without settling them, parking the process exactly as before', R_F,
  '        rec.reject(err);', '        void err;',
  async function (m) {
    var e = fakeEnv(), g = m.createPendingRegistry({ now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer, timeoutMs: 20000 });
    var i = g.nextId(); var p = g.register(i, 'A'); p.catch(function () {});
    g.rejectAll('socket closed');
    e.advance(999999);                 // the timer was cleared, so nothing can rescue it
    return (await settled(p)).state === 'pending';
  });

mut('confirm is ACCEPTED instead of dismissed', R_F,
  "    if (type === 'alert' || type === 'confirm' || type === 'prompt') {\n      return { known: true, accept: false, promptText: '', action: 'DISMISS',",
  "    if (type === 'alert' || type === 'confirm' || type === 'prompt') {\n      return { known: true, accept: true, promptText: '', action: 'DISMISS',",
  async function (m) {
    var d = m.createDialogHandler();
    d.handle({ type: 'confirm', message: 'Delete?' }, {});
    return m.dialogDecision({ type: 'confirm' }).accept === true || d.confirmAcceptedCount() > 0;
  });

mut('an unknown dialog type is treated as safe to dismiss rather than aborting the surface', R_F,
  "    return { known: false, accept: false, promptText: '', action: 'ABORT_SURFACE',",
  "    return { known: true, accept: false, promptText: '', action: 'DISMISS',",
  async function (m) { return m.dialogDecision({ type: 'whatever' }).action !== 'ABORT_SURFACE'; });

mut('the unknown dialog is left unanswered, re-creating the renderer block', R_F,
  "        command: { method: 'Page.handleJavaScriptDialog',",
  "        command: { method: (d.action === 'ABORT_SURFACE' ? 'Noop.doNothing' : 'Page.handleJavaScriptDialog'),",
  async function (m) {
    var d = m.createDialogHandler();
    return d.handle({ type: 'weird' }, {}).command.method !== 'Page.handleJavaScriptDialog';
  });

mut('checkpoints are written only at the end, not per window', R_F,
  "      writeAtomic(files.samples, JSON.stringify({ round: ROUND, count: samples.length, samples: samples }, null, 1));",
  "      void 0;",
  async function (m) {
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a1-mut-'));
    var w = m.createCheckpointWriter(d);
    w.record({ surface: 'X' }, {});
    var missing = !fs.existsSync(w.files.samples);
    fs.rmSync(d, { recursive: true, force: true });
    return missing;
  });

mut('the sample file is overwritten with only the newest window', R_F,
  '      samples.push(sample);', '      samples = [sample];',
  async function (m) {
    var d = fs.mkdtempSync(path.join(os.tmpdir(), 's8r4a1-mut-'));
    var w = m.createCheckpointWriter(d);
    w.record({ surface: 'first' }, {}); w.record({ surface: 'second' }, {});
    var s = JSON.parse(fs.readFileSync(w.files.samples, 'utf8'));
    fs.rmSync(d, { recursive: true, force: true });
    return s.count !== 2 || s.samples[0].surface !== 'first';
  });

mut('the destination is written directly, so a reader can see a half-written document', R_F,
  "    var tmp = file + '.tmp-' + process.pid;\n    fs.writeFileSync(tmp, text);",
  "    var tmp = file + '.tmp-' + process.pid;\n    fs.writeFileSync(file, text);",
  async function () {
    // The mutant is detected by the CALL SEQUENCE, not by the end state: both versions leave the right bytes
    // at the destination. Only one of them can be interrupted halfway and leave a corrupt file.
    var spy = loadWithSpyFs(R_F, "    var tmp = file + '.tmp-' + process.pid;\n    fs.writeFileSync(tmp, text);",
                                 "    var tmp = file + '.tmp-' + process.pid;\n    fs.writeFileSync(file, text);");
    spy.mod.writeAtomic('/out/a.json', '{"a":1}');
    return spy.calls.some(function (c) { return c[0] === 'write' && c[1] === '/out/a.json'; });
  });

mut('the watchdog never trips', R_F,
  '      if (idle < thresholdMs) { return null; }', '      if (true) { return null; }',
  async function (m) {
    var e = fakeEnv();
    var w = m.createWatchdog({ thresholdMs: 300000, now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer });
    w.progress('x'); e.advance(900000);
    return w.check() === null;
  });

mut('the watchdog trips during the planned scenario-E idle', R_F,
  '      if (paused || tripped) { return null; }', '      if (tripped) { return null; }',
  async function (m) {
    var e = fakeEnv();
    var w = m.createWatchdog({ thresholdMs: 300000, now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer });
    w.progress('x'); w.pause('scenario-E-idle'); e.advance(600000);
    return w.check() !== null;
  });

mut('resume does not reset the clock, so the planned idle is charged to the next surface', R_F,
  '    function resume() { paused = false; last = clock(); }', '    function resume() { paused = false; }',
  async function (m) {
    var e = fakeEnv();
    var w = m.createWatchdog({ thresholdMs: 300000, now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer });
    w.progress('x'); w.pause('idle'); e.advance(600000); w.resume();
    return w.check() !== null;
  });

mut('progress stops resetting the idle clock, so an advancing run is killed', R_F,
  '    function progress(label) { last = clock(); if (label) { lastLabel = label; } }',
  '    function progress(label) { if (label) { lastLabel = label; } }',
  async function (m) {
    var e = fakeEnv();
    var w = m.createWatchdog({ thresholdMs: 300000, now: e.now, setTimer: e.setTimer, clearTimer: e.clearTimer });
    e.advance(200000); w.progress('a'); e.advance(200000);
    return w.check() !== null;
  });

// ---- S8-R4B-0 ----------------------------------------------------------------------------------------------
mut('an eviction writes ms, inventing a backend duration for a read that never answered', R_F,
  "      o.rec.abandoned = why;\n      o.rec.abandoned_after_ms = openMs;     // deliberately NOT `ms`",
  "      o.rec.abandoned = why;\n      o.rec.ms = openMs;",
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now, staleMs: 90000 });
    var r = { action: 'x' }; g.add('n', r); e.advance(1000); g.evict('n', 'DOCUMENT_REPLACED');
    return r.ms !== undefined;
  });

mut('a navigation leaves the entries in the map — the original four-window defect', R_F,
  "      return Object.keys(open).map(function (k) { return evict(k, why); }).filter(Boolean);",
  "      return [];",
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now, staleMs: 90000 });
    g.add('n', { action: 'x' }); g.evictAll('DOCUMENT_REPLACED');
    return g.size() !== 0;
  });

mut('the stale bound drops to zero, so a live in-flight read is evicted and the page can look stable early', R_F,
  '  var STALE_OPEN_MS = CLIENT_READ_BOUND_MS * 2;', '  var STALE_OPEN_MS = 0;',
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now });   // takes the module default
    g.add('n', { action: 'x' });
    return g.evictStale().length > 0;                          // evicted with 0 ms elapsed
  });

mut('an evicted id can be resurrected by a late settle, giving it a duration after all', R_F,
  '    function settle(id) {\n      var o = open[id];\n      if (!o) { return null; }',
  '    function settle(id) {\n      var o = open[id] || { rec: {}, t0: clock() };',
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now, staleMs: 90000 });
    g.add('n', { action: 'x' }); g.evict('n', 'DOCUMENT_REPLACED');
    return g.settle('n') !== null;
  });

mut('evictions stop being recorded, so a forgiven request becomes invisible', R_F,
  '      evictions.push(ev);', '      void ev;',
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now, staleMs: 90000 });
    g.add('n', { action: 'x' }); g.evict('n', 'DOCUMENT_REPLACED');
    return g.evictionCount() === 0;
  });

mut('a request with no network id is tracked anyway, creating an entry nothing can ever remove', R_F,
  "      if (id === null || id === undefined || id === '') { return false; }",
  "      if (false) { return false; }",
  async function (m) {
    var e = fakeEnv(), g = m.createOpenMap({ now: e.now, staleMs: 90000 });
    g.add(null, { action: 'x' });
    return g.size() > 0;
  });

await runMutants();

// ============================================================================================================
console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ' — ' + pass + ' passed, ' + fail + ' failed, '
  + mutants + ' mutants, ' + survived + ' survived');
if (fail !== 0) process.exitCode = 1;

}

main().catch(function (e) { console.error('SUITE CRASHED: ' + (e && e.stack || e)); process.exitCode = 1; });
