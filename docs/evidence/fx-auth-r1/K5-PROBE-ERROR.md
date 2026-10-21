# K5 — PROBE ERROR in the full regression at `0170d40c`, cause UNRESOLVED

**Status: OPEN. Not fixed, not explained, not retried away.**

## What was observed
- Suite: `assets/tests/product-strategy-lifecycle-p1-b8d-r8.test.js`, assertion **K5** ("a refused site B
  restores site A's board"). It was the only not-clean suite of 695 in the sweep.
- Recorded line, verbatim, from `sweep-at-0170d40c.json`:
  `FAIL K5  a refused site B restores site A's board — PROBE ERROR: UNKNOWN: unknown error, open '…\assets\js\pages\product-strategy-board.js'`
- The same run reported `mutants 17, survived 1`, which is how this suite reports a probe that could
  not run. It is not evidence that a mutant genuinely survived.
- Worktree integrity after the sweep: **INTACT**. `git status` was clean.

## What was run after it
- The suite alone, once, at the same commit: `183 passed, 0 failed | mutants caught 18 survived 0`
  (`rerun-lifecycle-p1-b8d-r8-at-0170d40c.stdout.txt`).

## What this does NOT establish
- **The cause.** The error is an OS-level `open` failure (`UNKNOWN`) on a source file the suite reads
  while swapping in a mutant. The commit message of `c0f0f6fa` called it "a transient Windows I/O fault".
  That was a guess, not a finding, and is withdrawn here: nothing was captured to show which process
  held the file, or whether it would recur.
- **That it is fixed.** The passing rerun shows only that the suite can pass. It does not show that the
  failure cannot happen again.
- No assertion was loosened and no automatic retry was added.

## If it recurs
Keep the full stdout and stderr of that sweep and the suite's record. Note what else was running on
the machine at the time. Report it **without re-running to get a green result**.
