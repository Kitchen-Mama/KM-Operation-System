# CP2U-R3-R1 — the mutation leak, diagnosed

`leaked-sweep-records.json` preserves the parts of the **first** CP2U-R3 full regression that matter.
That run ended `DIRTY_AFTER_SWEEP`, and it is the only direct record of the leak; the raw sweep JSON
lives in a session-scoped scratchpad that will not survive, so its path is recorded inside the file and
the load-bearing fields are copied out.

## What the evidence says

| suite (alphabetical execution order) | duration | outcome |
|---|---|---|
| `product-strategy-corrections-p1-b8d-r9` | **629,317 ms** | **`timed_out: true`, `exit_code: null`** |
| `product-strategy-lifecycle-p1-b8d-r8` | 88,654 ms | exit 1 — 3 FAIL lines, all about *fullscreen* |
| `product-strategy-site-selection-p1-b8d-r5` | 403 ms | exit 1 — 2 FAIL lines, both about *fullscreen* |

The per-suite limit is **600,000 ms**. The first suite exceeded it and was **killed**. The mutant it had
installed stayed on disk:

```
-    if (SHOW_CHART_FULLSCREEN) {
+    if (true) {
```

Everything after that follows. `lifecycle-r8`'s third failure is not an assertion at all — it is
`PROBE ERROR: ANCHOR MATCHED 0 TIMES`, because the anchor that suite searches for is the exact line the
mutant had replaced. The other failures assert that no fullscreen control is rendered, and under
`if (true)` one is. **Two of the three suites were innocent**; on a restored tree all three pass, and the
same `corrections-r9` that took 629 s took **68.7 s** on the re-run.

## The mechanism — and the correction

D-S8-B3-115 originally said the harness "restores on the caught path and not on the survived path".
**That was wrong, and it was never tested.** `withSrc` restores inside a `finally`, and a `finally`
cannot distinguish a caught mutant from a surviving one: both are simply *the probe returned*. The
caught/survived distinction is made by the caller, after the restore has already happened. There was no
survived-path hole, and adding a second `finally` would have been a change made to a guess.

`finally` runs on return and on throw. It does **not** run when the process is killed — a terminated
process executes no further JavaScript. That is the whole mechanism, and
`mutation-harness-restore-contract-s8-b3-r3-cp2u-r3-r1.test.js` proves each half of it against the
**shipped** `withSrc`, extracted by name and run over an isolated temp file: caught, survived, throw,
assertion-failure and anchor-miss all restore byte-exactly (CRLF included), a failed restore propagates
rather than being swallowed, and a child killed mid-probe leaves the mutant installed.

## Why the window is wide

`corrections-r9` launches a **real browser for every probe** (`measure()` → `RUN.shot`), and all 17 of
its mutation windows are held open across a browser launch and render. The window in which a kill can
land is therefore seconds long and a large fraction of the suite's runtime — which is why a timeout kill
landed inside one rather than between them.

## What is NOT established

**Why that suite took 9× longer on that particular run.** It is browser-bound and therefore
load-sensitive, and a contention tail is consistent with what was seen, but no specific contender was
identified for that window. No concurrent mutation process was found: the 16 Chrome processes alive at
the time belonged to a long-running browser owned by the user (parent PID 24684, started the previous
day), not to this harness. The question is left open rather than closed by re-running until green.

**The protections do not depend on answering it.** A recurrence now aborts the sweep at the first
unrestored source instead of silently corrupting every later result:

- the sweep **refuses to start on a dirty tree** (`--allow-dirty` overrides, and forfeits detection);
- it checks for pollution **after every suite** and **aborts**, naming the suite, the paths, whether
  that suite timed out, how many suites were skipped, and the exact `git checkout --` to restore;
- it does **not** auto-restore — the polluted file is the evidence, and a tool that quietly rewrites a
  working tree is a worse hazard than the one it is fixing;
- a **worktree lock** in the OS temp directory prevents two sweeps in one tree, and is reclaimed if its
  owner has died.

`sweep-pollution-guards-s8-b3-r3-cp2u-r3-r1.test.js` exercises all of it over a temp directory of
trivial suites with an injected dirty-probe, so the guard is proven without staging a real disaster in
the repository.
