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
section('E. one sweep per worktree');

{
  const lp = SWEEP.lockPath();
  // No lock held to begin with (any stale one is reclaimable, asserted below).
  try { if (fs.existsSync(lp)) fs.unlinkSync(lp); } catch (e) { /* ignore */ }

  const held = SWEEP.acquireLock();
  ok(fs.existsSync(held), 'E1  the lock is taken', held);
  ok(path.dirname(path.resolve(held)) === path.resolve(os.tmpdir()),
    'E1a and it lives in the OS temp dir, so taking it cannot dirty the tree it protects', held);

  let threw = null;
  try { SWEEP.acquireLock(); } catch (e) { threw = e; }
  ok(threw && threw.code === 'SWEEP_LOCKED', 'E2  a second sweep in the same worktree is refused',
    threw && threw.code);
  ok(threw && /pid \d+/.test(threw.message), 'E2a naming the holder', threw && threw.message);

  SWEEP.releaseLock(held);
  ok(!fs.existsSync(held), 'E3  releasing removes it');

  // A crashed sweep must not block the next one forever.
  fs.writeFileSync(lp, JSON.stringify({ pid: 999999999, root: ROOT, startedAt: 'long ago' }));
  let re = null;
  try { re = SWEEP.acquireLock(); } catch (e) { re = null; }
  ok(!!re, 'E4  a lock whose owner is gone is stale and is reclaimed');
  SWEEP.releaseLock(re);

  eq(SWEEP.pidAlive(process.pid), true, 'E5  liveness detection recognises a live pid');
  eq(SWEEP.pidAlive(999999999), false, 'E5a and a dead one');
}

// -------------------------------------------------------------------------------------------------------------
section('F. the timeout that caused this is still the one in force, and is recorded');

eq(SWEEP.PER_SUITE_TIMEOUT_MS, 600000,
  'F1  the per-suite limit is 600000 ms - product-strategy-corrections-p1-b8d-r9 ran 629317 ms and was '
  + 'killed inside a mutation window, which is the whole mechanism');

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* best effort */ }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + '  ' + pass + ' passed, ' + fail + ' failed');
process.exitCode = fail === 0 ? 0 : 1;
