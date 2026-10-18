// Kitchen Mama Operation System - S8-B3-R3-CP2U-R3-R1
// THE SWEEP STOPS AT THE FIRST POLLUTED SOURCE, AND CANNOT RUN TWICE AT ONCE
//
// Run: node assets/tests/sweep-pollution-guards-s8-b3-r3-cp2u-r3-r1.test.js
//
// LOCAL / OFFLINE. The sweeps driven here run over a TEMP directory of trivial suites and are given an
// injected dirty-probe, so no repository file is mutated and no real suite is executed. A guard that
// protects the worktree must be testable without staging a real disaster in it.
//
// WHAT IS BEING GUARDED. A mutation suite restores its source in a `finally`. That covers returning and
// throwing; it does not cover being KILLED, and this driver kills any suite exceeding its per-suite
// timeout. When that kill lands inside a mutation window the mutant stays on disk, and - before this
// round - the sweep kept going, so every later suite read a source no commit contains. Three suites
// were recorded NOT_CLEAN that way and two of them were innocent.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SWEEP = require(path.join(ROOT, 'assets', 'tools', 'run-regression-sweep.js'));

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; console.log('ok   ' + m); } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

// A temp directory of four trivial suites, each printing a parseable summary and exiting 0.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-guard-'));
['alpha', 'bravo', 'charlie', 'delta'].forEach(function (n, i) {
  fs.writeFileSync(path.join(TMP, n + '.test.js'),
    'console.log("' + n + ' ran");\nconsole.log("PASS  ' + (i + 1) + ' passed, 0 failed");\n');
});

// -------------------------------------------------------------------------------------------------------------
section('A. a clean run over the temp suites is complete and not aborted');

{
  const ru = SWEEP.sweep({ dir: TMP, quiet: true, noLock: true, dirtyProbe: () => [] });
  eq(ru.registered_count, 4, 'A1  all four suites were registered');
  eq(ru.executed_count, 4, 'A1a and all four executed');
  eq(ru.aborted, null, 'A2  nothing aborted');
  eq(ru.complete, true, 'A2a the run is marked complete');
  eq(ru.worktree_integrity, 'INTACT', 'A3  integrity INTACT');
}

// -------------------------------------------------------------------------------------------------------------
section('B. pollution after a suite ABORTS the sweep, before the next one can read it');

{
  // The probe reports a leaked source from the moment the second suite finishes.
  let calls = 0;
  const LEAK = ' M assets/js/product-strategy/psb-board-ui.js';
  const ru = SWEEP.sweep({
    dir: TMP, quiet: true, noLock: true,
    dirtyProbe: () => { calls++; return calls >= 3 ? [LEAK] : []; }
  });
  ok(!!ru.aborted, 'B1  the sweep aborted', ru.aborted);
  eq(ru.complete, false, 'B1a and is NOT marked complete');
  eq(ru.executed_count, 2, 'B2  it stopped after the second suite');
  eq(ru.aborted.remaining_suites, 2,
    'B2a the two suites that would have read the polluted source were NOT run - which is the entire '
    + 'point, and is what did not happen in the first CP2U-R3 sweep');
  ok(ru.aborted.polluted_entries.indexOf(LEAK) !== -1, 'B3  the leaked path is named', ru.aborted.polluted_entries);
  ok(/git checkout -- /.test(ru.aborted.restore_command), 'B3a with the restore command', ru.aborted.restore_command);
  ok(/psb-board-ui\.js/.test(ru.aborted.restore_command), 'B3b naming the file', ru.aborted.restore_command);
  ok(typeof ru.aborted.after_suite === 'string' && ru.aborted.after_suite.length > 0,
    'B4  and the suite that leaked it', ru.aborted.after_suite);
  // The polluted file is left alone on purpose: it is the evidence.
  ok(!Object.prototype.hasOwnProperty.call(ru.aborted, 'restored'),
    'B5  the sweep does not silently restore - the operator is told, not surprised');
}

// -------------------------------------------------------------------------------------------------------------
section('C. pre-existing dirt is NOT mistaken for pollution');

{
  // An operator who passes --allow-dirty keeps working: entries present BEFORE the run must not trip
  // the abort, or the guard would be unusable and would be switched off.
  const PRE = ' M docs/planning/NOTES.md';
  const ru = SWEEP.sweep({
    dir: TMP, quiet: true, noLock: true, allowDirty: true, dirtyProbe: () => [PRE]
  });
  eq(ru.aborted, null, 'C1  a tree that was already dirty does not abort on its own dirt');
  eq(ru.executed_count, 4, 'C1a and the sweep runs to the end');
  eq(ru.worktree_integrity, 'INTACT', 'C2  integrity compares like with like');
}
{
  // ...but NEW dirt on top of pre-existing dirt still aborts.
  const PRE = ' M docs/planning/NOTES.md';
  const LEAK = ' M assets/js/product-strategy/psb-board-ui.js';
  let calls = 0;
  const ru = SWEEP.sweep({
    dir: TMP, quiet: true, noLock: true, allowDirty: true,
    dirtyProbe: () => { calls++; return calls >= 2 ? [PRE, LEAK] : [PRE]; }
  });
  ok(!!ru.aborted, 'C3  new dirt on top of old dirt still aborts');
  eq(ru.aborted.polluted_entries.length, 1, 'C3a and only the NEW entry is reported as pollution',
    ru.aborted && ru.aborted.polluted_entries);
  eq(ru.aborted.polluted_entries[0], LEAK, 'C3b which is the leaked source');
}

// -------------------------------------------------------------------------------------------------------------
section('D. a dirty tree is refused as a baseline');

{
  let threw = null;
  try {
    SWEEP.sweep({ dir: TMP, quiet: true, noLock: true, dirtyProbe: () => [' M assets/js/pages/x.js'] });
  } catch (e) { threw = e; }
  ok(threw && threw.code === 'SWEEP_DIRTY_START', 'D1  a dirty start is refused', threw && threw.code);
  ok(threw && /Commit or stash first/.test(threw.message), 'D1a with what to do about it');
  ok(threw && /--allow-dirty/.test(threw.message), 'D1b and the override is named, with its cost');
}

// -------------------------------------------------------------------------------------------------------------
section('D2. the guard fires where there is something to guard, and nowhere else');

{
  // A sweep over a TEMP directory of synthetic fixtures mutates nothing in the repository, so the state
  // of the working tree is irrelevant to it. The first version of this guard refused such a sweep and
  // broke sweep-driver-integration-s8-r47d, which does exactly this on a developer's dirty tree.
  // Scoping is therefore part of the contract, not an implementation detail.
  let threw = null, ru = null;
  try { ru = SWEEP.sweep({ dir: TMP, quiet: true, noLock: true }); } catch (e) { threw = e; }
  ok(!threw, 'D2a a temp-directory sweep is NOT refused, whatever the repository looks like',
    threw && threw.code);
  ok(ru && ru.executed_count === 4, 'D2b and it runs every fixture', ru && ru.executed_count);
  // ...while the real tests directory keeps the guard. Proven through the injected probe, because
  // actually dirtying the repository to test this would be the very thing the guard prevents.
  let threw2 = null;
  try {
    SWEEP.sweep({ dir: TMP, quiet: true, noLock: true, dirtyProbe: () => [' M assets/js/pages/x.js'] });
  } catch (e) { threw2 = e; }
  eq(threw2 && threw2.code, 'SWEEP_DIRTY_START',
    'D2c but an explicitly guarded sweep still refuses a dirty start');
}

// -------------------------------------------------------------------------------------------------------------
section('E. the lock, exercised in an ISOLATED namespace');

// THE PREVIOUS VERSION OF THIS SECTION WAS DANGEROUS. It called SWEEP.lockPath() and deleted the file,
// then later overwrote it with a fabricated stale lock. During a full regression THAT FILE IS THE RUNNING
// SWEEP'S OWN LOCK: this suite was unlocking the sweep that was executing it, and leaving a forged lock
// behind afterwards. A lock test must never touch the live lock; it gets its own namespace.
const LOCKDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-lock-ns-'));
const NS = (n) => path.join(LOCKDIR, n + '.lock');

// The live worktree lock, recorded before any of this runs, so section H can prove it was untouched.
const REAL_LOCK = SWEEP.lockPath();
function realLockSnapshot() {
  try { return { exists: true, bytes: fs.readFileSync(REAL_LOCK, 'utf8') }; }
  catch (e) { return { exists: false, bytes: null }; }
}
const REAL_BEFORE = realLockSnapshot();

{
  const lp = NS('basic');
  const h = SWEEP.acquireLock(lp);
  ok(h && h.path === lp, 'E1  the lock is taken at the path it was asked for', h && h.path);
  ok(h && typeof h.token === 'string' && h.token.length >= 16,
    'E1a and carries a token, because pids are reused and a pid alone cannot prove ownership');
  eq(SWEEP.inspectLock(lp).state, 'VALID', 'E1b the file on disk parses as a lock');

  let threw = null;
  try { SWEEP.acquireLock(lp); } catch (e) { threw = e; }
  eq(threw && threw.code, 'SWEEP_LOCKED', 'E2  a second acquisition of a live lock is refused');
  eq(SWEEP.inspectLock(lp).held.token, h.token, 'E2a and the holder\'s record is untouched by the refusal');

  eq(SWEEP.releaseLock(h), true, 'E3  the owner can release it');
  eq(SWEEP.inspectLock(lp).state, 'ABSENT', 'E3a and it is gone');
  eq(SWEEP.releaseLock(h), false, 'E3b releasing twice is a no-op, not an error');
}

// -------------------------------------------------------------------------------------------------------------
section('E2. release cannot remove somebody else\'s lock');

{
  const lp = NS('ownership');
  const holder = SWEEP.acquireLock(lp);
  const bytesBefore = fs.readFileSync(lp, 'utf8');

  // A handle with the right path and the WRONG token - what a stale handle, or a pid that has been
  // recycled into a different process, looks like.
  eq(SWEEP.releaseLock({ path: lp, token: 'not-the-right-token', pid: process.pid }), false,
    'E2a a handle with a foreign token releases nothing');
  // A bare path, which is what the pre-R2 API handed out. It cannot prove ownership, so it is refused.
  eq(SWEEP.releaseLock(lp), false, 'E2b a bare path cannot release a lock - it proves no ownership');
  eq(fs.readFileSync(lp, 'utf8'), bytesBefore, 'E2c the holder\'s record is byte-identical afterwards');
  eq(SWEEP.releaseLock(holder), true, 'E2d while the real owner still can');
}

// -------------------------------------------------------------------------------------------------------------
section('E3. an unreadable lock is refused, and age does not make it deletable');

{
  // A lock caught mid-write, or written by a version with a different shape. It is NOT assumed
  // abandoned, and - since CP2U-R3-R3 - no amount of elapsed time changes that.
  const lp = NS('partial');
  fs.writeFileSync(lp, '{"pid": 12345, "tok');          // truncated on purpose
  const before = fs.readFileSync(lp, 'utf8');
  eq(SWEEP.inspectLock(lp).state, 'UNREADABLE', 'E3a an incomplete lock is classified UNREADABLE');

  let threw = null;
  try { SWEEP.acquireLock(lp); } catch (e) { threw = e; }
  eq(threw && threw.code, 'SWEEP_LOCK_UNREADABLE', 'E3b acquiring over it is REFUSED');
  ok(threw && /must not be destroyed by a reader/.test(threw.message), 'E3c and says why');
  ok(threw && threw.lockPath === lp, 'E3d the refusal names the path', threw && threw.lockPath);
  ok(threw && typeof threw.ageMs === 'number', 'E3e and reports its age as information', threw && threw.ageMs);
  ok(threw && /remove the lock file yourself/.test(threw.message),
    'E3f and tells the operator what only they can safely do');
  eq(fs.readFileSync(lp, 'utf8'), before, 'E3g the file is byte-identical - nothing was renamed or deleted');

  // CONTRACT CHANGE, RECORDED. R2 reclaimed an unreadable lock once it was older than a grace window.
  // Age does not establish that a holder is gone - a long sweep is old by design - so the threshold is
  // gone and an ancient lock is refused exactly like a fresh one.
  const old = Date.now() - (99 * 24 * 3600 * 1000);
  fs.utimesSync(lp, new Date(old), new Date(old));
  let threw2 = null;
  try { SWEEP.acquireLock(lp); } catch (e) { threw2 = e; }
  eq(threw2 && threw2.code, 'SWEEP_LOCK_UNREADABLE',
    'E3h a 99-DAY-OLD unreadable lock is still refused - elapsed time is not evidence of abandonment');
  eq(fs.readFileSync(lp, 'utf8'), before, 'E3i and it too is left byte-identical');
  eq(SWEEP.LOCK_UNREADABLE_GRACE_MS, undefined,
    'E3j the grace window no longer exists as a concept in the tool');
}

// -------------------------------------------------------------------------------------------------------------
section('E4. a lock whose recorded owner is dead is REFUSED, not reclaimed');

{
  const lp = NS('stale');
  const seed = JSON.stringify({ pid: 999999999, token: 'dead', root: ROOT, startedAt: 'long ago' });
  fs.writeFileSync(lp, seed);
  eq(SWEEP.inspectLock(lp).state, 'VALID', 'E4a a dead holder\'s lock still parses');

  let threw = null;
  try { SWEEP.acquireLock(lp); } catch (e) { threw = e; }
  eq(threw && threw.code, 'SWEEP_LOCK_STALE',
    'E4b it is REFUSED with its own code - distinct from a live holder, because the operator needs to '
    + 'know which situation they are in');
  eq(threw && threw.ownerAlive, false, 'E4c the refusal states that the owner is not running');
  eq(threw && threw.owner && threw.owner.pid, 999999999, 'E4d and names the owner it could read');
  ok(threw && /NOT RECLAIMED AUTOMATICALLY/.test(threw.message), 'E4e and says it will not act on that');
  eq(fs.readFileSync(lp, 'utf8'), seed, 'E4f the file is byte-identical - no rename, no unlink');

  eq(SWEEP.pidAlive(process.pid), true, 'E4g liveness detection recognises a live pid');
  eq(SWEEP.pidAlive(999999999), false, 'E4h and a dead one');
  fs.unlinkSync(lp);                                   // the operator's job, done here by the test
}

// -------------------------------------------------------------------------------------------------------------
section('E5. THE RECLAIM RACE - why automatic reclaim was removed');

// THE COUNTER-EXAMPLE. R2 judged a lock stale and then renamed it aside. Judgement and act are two
// steps, and the act lands on a PATH: between them the path can come to hold a DIFFERENT, LIVE lock,
// which the reclaimer then destroys. The interleaving below is driven deterministically rather than
// hoped for, and it ends with two holders at once.
{
  const GRACE = 10 * 60 * 1000;                        // R2's constant, reproduced with the algorithm
  function inspectLocal(lp) {
    let raw, st;
    try { raw = fs.readFileSync(lp, 'utf8'); st = fs.statSync(lp); }
    catch (e) { return { state: 'ABSENT', held: null, ageMs: null }; }
    let held = null;
    try { held = JSON.parse(raw); } catch (e) { held = null; }
    const ageMs = Date.now() - st.mtimeMs;
    if (!held || typeof held.pid !== 'number') return { state: 'UNREADABLE', held: null, ageMs: ageMs };
    return { state: 'VALID', held: held, ageMs: ageMs };
  }
  // R2's acquireLock, reproduced. `hooks.beforeReclaim` is the only addition, and it only PAUSES.
  function OLD_R2_acquire(lp, pid, token, hooks) {
    const payload = JSON.stringify({ pid: pid, token: token, startedAt: 'r2' });
    for (let attempt = 0; attempt < 5; attempt++) {
      const tmp = lp + '.tmp-' + pid + '-' + Math.random().toString(16).slice(2);
      let published = false;
      try {
        fs.writeFileSync(tmp, payload, 'utf8');
        try { fs.linkSync(tmp, lp); published = true; }
        catch (e) { if (e.code !== 'EEXIST') throw e; }
      } finally { try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ } }
      if (published) return { path: lp, token: token, pid: pid };

      const cur = inspectLocal(lp);
      if (cur.state === 'ABSENT') continue;
      if (cur.state === 'VALID' && SWEEP.pidAlive(cur.held.pid)) { const e = new Error('locked'); e.code = 'SWEEP_LOCKED'; throw e; }
      if (cur.state === 'UNREADABLE' && cur.ageMs < GRACE) { const e = new Error('unreadable'); e.code = 'SWEEP_LOCK_UNREADABLE'; throw e; }

      if (hooks && hooks.beforeReclaim) hooks.beforeReclaim();     // <-- the gap, made visible

      const parked = lp + '.stale-' + pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      try { fs.renameSync(lp, parked); } catch (e) { continue; }
      try { fs.unlinkSync(parked); } catch (e) { /* ignore */ }
    }
    throw new Error('contended');
  }

  const lp = NS('reclaim-race');
  const seed = JSON.stringify({ pid: 999999999, token: 'dead-owner', startedAt: 'long ago' });
  fs.writeFileSync(lp, seed);

  // P2 is paused after it has judged the lock stale but before it acts on that judgement. While it is
  // paused, P1 completes a full, legitimate R2 reclaim and becomes the holder.
  let p1 = null, fired = false;
  const p2 = OLD_R2_acquire(lp, process.pid, 'TOKEN-P2', {
    beforeReclaim: function () {
      if (fired) return;
      fired = true;
      p1 = OLD_R2_acquire(lp, process.pid, 'TOKEN-P1');            // P1 takes it, validly
      eq(inspectLocal(lp).held.token, 'TOKEN-P1', 'E5a P1 legitimately holds the lock');
    }
  });

  ok(fired, 'E5b the interleaving was exercised');
  ok(!!p1 && !!p2, 'E5c BOTH calls returned a handle - R2 handed ONE lock to TWO holders', { p1: !!p1, p2: !!p2 });
  eq(inspectLocal(lp).held.token, 'TOKEN-P2',
    'E5d and P1\'s live lock was destroyed by P2\'s reclaim - the judgement was about a file, the act '
    + 'landed on a path');

  // THE NEW BEHAVIOUR, on exactly the same starting state.
  fs.writeFileSync(lp, seed);
  const before = fs.readFileSync(lp, 'utf8');
  let a = null, threw = null;
  try { a = SWEEP.acquireLock(lp); } catch (e) { threw = e; }
  ok(!a, 'E5e the shipped version acquires nothing when a lock is already there');
  eq(threw && threw.code, 'SWEEP_LOCK_STALE', 'E5f it refuses instead');
  eq(fs.readFileSync(lp, 'utf8'), before,
    'E5g and the existing lock is byte-identical - there is no interleaving to exploit because there is '
    + 'no second step');
  fs.unlinkSync(lp);
}

// -------------------------------------------------------------------------------------------------------------
section('E6. TWO PROCESSES RACING - the winner HOLDS while both verdicts are read');

// The R2 version of this test let the winner exit as soon as it reported. That cannot distinguish
// "both contended and one was refused" from "the first finished and released, and the second then
// acquired legitimately" - two sequential successes would have looked the same. The winner now holds
// the lock until the parent has read BOTH results and inspected the file, and only then is released.
{
  const lp = NS('race');
  const goFile = path.join(LOCKDIR, 'GO');
  const relFile = path.join(LOCKDIR, 'RELEASE');
  const driver = path.join(LOCKDIR, 'contender.js');
  fs.writeFileSync(driver, [
    'var fs = require("fs");',
    'var SWEEP = require(' + JSON.stringify(path.join(ROOT, 'assets', 'tools', 'run-regression-sweep.js')) + ');',
    'var lp = process.argv[2], go = process.argv[3], out = process.argv[4], ready = process.argv[5],',
    '    rel = process.argv[6], held = process.argv[7];',
    'function nap(ms){ try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }',
    '  catch (e) { var u = Date.now() + ms; while (Date.now() < u) {} } }',
    'fs.writeFileSync(ready, String(process.pid));',
    'var dl = Date.now() + 30000;',
    'while (!fs.existsSync(go) && Date.now() < dl) nap(5);',
    'var res, handle = null;',
    'try { handle = SWEEP.acquireLock(lp); res = { ok: true, pid: process.pid, token: handle.token }; }',
    'catch (e) { res = { ok: false, pid: process.pid, code: e.code }; }',
    'fs.writeFileSync(out, JSON.stringify(res));',
    'if (handle) {',
    '  fs.writeFileSync(held, String(process.pid));',
    '  var dl2 = Date.now() + 60000;',
    '  while (!fs.existsSync(rel) && Date.now() < dl2) nap(10);',   // HOLD until the parent says so
    '  SWEEP.releaseLock(handle);',
    '}'
  ].join('\n'));

  function napMs(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
    catch (e) { const u = Date.now() + ms; while (Date.now() < u) { /* spin */ } }
  }
  const outs = [path.join(LOCKDIR, 'r0.json'), path.join(LOCKDIR, 'r1.json')];
  const readys = [path.join(LOCKDIR, 'k0'), path.join(LOCKDIR, 'k1')];
  const helds = [path.join(LOCKDIR, 'h0'), path.join(LOCKDIR, 'h1')];
  const kids = [0, 1].map(i => cp.spawn(process.execPath,
    [driver, lp, goFile, outs[i], readys[i], relFile, helds[i]], { stdio: 'ignore' }));
  const alive = () => kids.map(k => k.exitCode === null && k.signalCode === null);

  let dl = Date.now() + 30000;
  while (!(fs.existsSync(readys[0]) && fs.existsSync(readys[1])) && Date.now() < dl) napMs(20);
  ok(fs.existsSync(readys[0]) && fs.existsSync(readys[1]), 'E6a both contenders reached the barrier');

  fs.writeFileSync(goFile, 'go');                      // released at the same instant
  dl = Date.now() + 30000;
  while (!(fs.existsSync(outs[0]) && fs.existsSync(outs[1])) && Date.now() < dl) napMs(20);
  ok(fs.existsSync(outs[0]) && fs.existsSync(outs[1]), 'E6b both reported a verdict');

  const res = outs.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } });
  const winners = res.filter(r => r && r.ok === true);
  const losers = res.filter(r => r && r.ok === false);
  eq(winners.length, 1, 'E6c EXACTLY ONE acquired the lock', res);
  eq(losers.length, 1, 'E6d and exactly one was refused', res);
  eq(losers[0] && losers[0].code, 'SWEEP_LOCKED',
    'E6e the loser was refused because the lock was LIVE - not stale, not unreadable', losers[0]);

  // THE POINT OF THE REWRITE: the winner is still running and still holding, so the loser's refusal
  // provably happened while the lock was held. A sequential pair could not produce this state.
  const winnerIdx = res.findIndex(r => r && r.ok === true);
  ok(alive()[winnerIdx], 'E6f the winner is STILL RUNNING at the moment both verdicts are judged');
  ok(fs.existsSync(helds[winnerIdx]), 'E6g and had declared itself holding');
  const onDisk = SWEEP.inspectLock(lp);
  eq(onDisk.state, 'VALID', 'E6h the lock is held right now');
  eq(onDisk.held.token, winners[0].token, 'E6i by the winner');
  eq(onDisk.held.pid, winners[0].pid, 'E6j and records the winner\'s pid - the loser changed nothing');

  fs.writeFileSync(relFile, 'release');                // only now may the winner let go
  dl = Date.now() + 30000;
  while (alive().some(Boolean) && Date.now() < dl) napMs(20);
  kids.forEach(k => { try { k.kill(); } catch (e) { /* already gone */ } });
  eq(SWEEP.inspectLock(lp).state, 'ABSENT',
    'E6k and when the winner releases, the lock is gone - released by its owner, not reclaimed by anyone');
}

// -------------------------------------------------------------------------------------------------------------
section('F. the timeout that caused this is still the one in force, and is recorded');

eq(SWEEP.PER_SUITE_TIMEOUT_MS, 600000,
  'F1  the per-suite limit is 600000 ms - product-strategy-corrections-p1-b8d-r9 ran 629317 ms and was '
  + 'killed inside a mutation window, which is the whole mechanism');

// -------------------------------------------------------------------------------------------------------------
section('H. the live worktree lock was never touched by any of the above');

// When this suite runs inside a full regression, SWEEP.lockPath() is the lock held by the sweep that is
// executing it. Everything above used an isolated namespace precisely so that this holds.
{
  const after = realLockSnapshot();
  eq(after.exists, REAL_BEFORE.exists,
    'H1  the real worktree lock is in the same state as before this suite ran'
    + (REAL_BEFORE.exists ? ' (held by the parent sweep)' : ' (absent - run standalone)'));
  eq(after.bytes, REAL_BEFORE.bytes, 'H1a byte-identical - ownership was neither taken, forged nor released');
  const inNs = (p) => path.resolve(p).indexOf(path.resolve(LOCKDIR)) === 0;
  ok(inNs(NS('basic')) && !inNs(REAL_LOCK),
    'H2  the namespace used above is disjoint from the real lock path',
    { ns: LOCKDIR, real: REAL_LOCK });
}

try { fs.rmSync(LOCKDIR, { recursive: true, force: true }); } catch (e) { /* best effort */ }

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
