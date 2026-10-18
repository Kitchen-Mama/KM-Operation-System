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
section('E3. a lock that is not readable is NOT treated as deletable');

{
  // A lock caught mid-write, or written by a version with a different shape. The old code parsed it,
  // failed, called it stale and DELETED it - destroying a lock it did not understand.
  const lp = NS('partial');
  fs.writeFileSync(lp, '{"pid": 12345, "tok');          // truncated on purpose
  const before = fs.readFileSync(lp, 'utf8');
  eq(SWEEP.inspectLock(lp).state, 'UNREADABLE', 'E3a an incomplete lock is classified UNREADABLE');

  let threw = null;
  try { SWEEP.acquireLock(lp); } catch (e) { threw = e; }
  eq(threw && threw.code, 'SWEEP_LOCK_UNREADABLE', 'E3b acquiring over it is REFUSED');
  ok(threw && /NOT being treated as stale/.test(threw.message), 'E3c and says why');
  ok(fs.existsSync(lp), 'E3d the file still exists - it was not destroyed by a reader');
  eq(fs.readFileSync(lp, 'utf8'), before, 'E3e byte-identical');

  // Only after the grace window does it become reclaimable, and even then through the atomic hand-off.
  const old = Date.now() - (SWEEP.LOCK_UNREADABLE_GRACE_MS + 60000);
  fs.utimesSync(lp, new Date(old), new Date(old));
  const h = SWEEP.acquireLock(lp);
  ok(!!h, 'E3f after the grace window an unreadable lock is reclaimable');
  eq(SWEEP.inspectLock(lp).held.token, h.token, 'E3g and the new holder owns it');
  SWEEP.releaseLock(h);
}

// -------------------------------------------------------------------------------------------------------------
section('E4. a lock whose owner is gone is reclaimed; a live one never is');

{
  const lp = NS('stale');
  fs.writeFileSync(lp, JSON.stringify({ pid: 999999999, token: 'dead', root: ROOT, startedAt: 'long ago' }));
  eq(SWEEP.inspectLock(lp).state, 'VALID', 'E4a a dead holder\'s lock still parses');
  const h = SWEEP.acquireLock(lp);
  ok(!!h, 'E4b and is reclaimed, so a crashed sweep cannot block the next one forever');
  eq(SWEEP.inspectLock(lp).held.pid, process.pid, 'E4c by this process');
  SWEEP.releaseLock(h);

  eq(SWEEP.pidAlive(process.pid), true, 'E4d liveness detection recognises a live pid');
  eq(SWEEP.pidAlive(999999999), false, 'E4e and a dead one');
}

// -------------------------------------------------------------------------------------------------------------
section('E5. TWO PROCESSES RACING FOR THE SAME LOCK - exactly one wins');

// The counter-example the atomicity claim needs. `existsSync` then `writeFileSync` is a check and an act
// with a gap; two processes can pass the check together and both write. Here both children are held at a
// barrier and released at the same instant, so they contend for real. No mutation runs and nothing
// outside this temp namespace is touched.
{
  const lp = NS('race');
  const goFile = path.join(LOCKDIR, 'GO');
  const driver = path.join(LOCKDIR, 'contender.js');
  fs.writeFileSync(driver, [
    'var fs = require("fs"), path = require("path");',
    'var SWEEP = require(' + JSON.stringify(path.join(ROOT, 'assets', 'tools', 'run-regression-sweep.js')) + ');',
    'var lp = process.argv[2], go = process.argv[3], out = process.argv[4], ready = process.argv[5];',
    'function nap(ms){ try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }',
    '  catch (e) { var u = Date.now() + ms; while (Date.now() < u) {} } }',
    'fs.writeFileSync(ready, String(process.pid));',
    'var deadline = Date.now() + 30000;',
    'while (!fs.existsSync(go) && Date.now() < deadline) nap(5);',   // barrier
    'var res;',
    'try { var h = SWEEP.acquireLock(lp); res = { ok: true, pid: process.pid, token: h.token }; }',
    'catch (e) { res = { ok: false, pid: process.pid, code: e.code }; }',
    'fs.writeFileSync(out, JSON.stringify(res));'
  ].join('\n'));

  function napMs(ms) {
    try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
    catch (e) { const u = Date.now() + ms; while (Date.now() < u) { /* spin */ } }
  }
  const outs = [path.join(LOCKDIR, 'r0.json'), path.join(LOCKDIR, 'r1.json')];
  const readys = [path.join(LOCKDIR, 'k0'), path.join(LOCKDIR, 'k1')];
  const kids = [0, 1].map(i => cp.spawn(process.execPath, [driver, lp, goFile, outs[i], readys[i]], { stdio: 'ignore' }));

  let dl = Date.now() + 30000;
  while (!(fs.existsSync(readys[0]) && fs.existsSync(readys[1])) && Date.now() < dl) napMs(20);
  ok(fs.existsSync(readys[0]) && fs.existsSync(readys[1]), 'E5a both contenders reached the barrier');

  fs.writeFileSync(goFile, 'go');                      // released at the same instant
  dl = Date.now() + 30000;
  while (!(fs.existsSync(outs[0]) && fs.existsSync(outs[1])) && Date.now() < dl) napMs(20);
  kids.forEach(k => { try { k.kill(); } catch (e) { /* already gone */ } });

  ok(fs.existsSync(outs[0]) && fs.existsSync(outs[1]), 'E5b both reported a result');
  const res = outs.map(f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } });
  const winners = res.filter(r => r && r.ok === true);
  const losers = res.filter(r => r && r.ok === false);
  eq(winners.length, 1, 'E5c EXACTLY ONE acquired the lock', res);
  eq(losers.length, 1, 'E5d and exactly one was refused', res);
  eq(losers[0] && losers[0].code, 'SWEEP_LOCKED', 'E5e the loser was refused as locked, not by an error',
    losers[0]);

  // The loser must not have touched the winner's record.
  const onDisk = SWEEP.inspectLock(lp);
  eq(onDisk.state, 'VALID', 'E5f the lock on disk is valid');
  eq(onDisk.held.token, winners[0] && winners[0].token, 'E5g and holds the WINNER\'s token - the loser '
    + 'did not overwrite it');
  eq(onDisk.held.pid, winners[0] && winners[0].pid, 'E5h and the winner\'s pid');
  // Neither child is alive any more, so the lock is now stale and reclaimable - which is the correct
  // end state, and is reached without anyone deleting anyone else's file.
  const mine = SWEEP.acquireLock(lp);
  ok(!!mine, 'E5i once both contenders are gone the lock is reclaimable');
  SWEEP.releaseLock(mine);
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
