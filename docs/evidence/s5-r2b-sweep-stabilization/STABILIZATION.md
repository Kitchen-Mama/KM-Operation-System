# S5-R2B — canonical sweep mutation-intermittency stabilization

**Base** `4531413` · harness only · `PRODUCTION_CODE_CHANGED = NO` · `BEHAVIOR_CHANGED = NO`

Four files changed, all under `assets/tests/`. No production file, no schema, no business rule, no S5
contract.

---

## What was actually wrong — and it was not the settle logic

S4-R7 had already diagnosed one intermittency class in these probes (measuring at a moment that is quiet for
the wrong reason) and repaired it with `settle()` and a `done !== true` guard. The natural assumption was that
G4 and H1 were more of the same. **They were not.** Both were driving a browser whose application had never
finished booting.

The discriminator was found by measurement, not reading:

| | G4 (`s4-r3-route-owned-code`) | H1 (`s4-r7-final-seal`) |
|---|---|---|
| Symptom | `blocked: 0`, `errorBox: 0` | `toggleCount: 0`, `expandCount: 0` |
| Discriminating field | `wasLoaded: **null**` | no rows painted, `prepareGapReads` sometimes 0 |
| Why the verdict passed | mutant output identical to baseline | `[].some(...)` is `false` |
| Pre-fix kill rate | 8 / 10 | **5 / 10** |

`loaded()` answers `null` when there is no `window.KM.scriptLoader` to ask. `!null` is truthy, so the guard
`if (!wasLoaded)` **entered** the failure block on a dead page: nothing was inserted, nothing was refused, and
the mutant read exactly like the baseline. That is the repo's own *missing is never zero* rule, in probe form
— **unknown is not false**, and a probe that cannot tell must say so rather than guess.

## `SHARED_ROOT_CAUSE = YES` — two shared defects, repaired in both runners

**1. Chrome had no private profile.** Neither runner passed `--user-data-dir`, so every headless launch shared
the default profile and contended on its lock and disk cache. This was not a guess: boot failed in a
**systematic period** — `RR.RR.RR`, every third run — and a period like that is shared state, not noise. A
precedent for the fix already existed in the repo (`_p1b8c-r3r2-image-consumer-runner.js:172-175`), so it was
copied rather than invented: `fs.mkdtempSync` per launch, removed in `finally`.

**2. Boot readiness was a duration, not a latch.** The only gate was `await tick(900)` (s4-r3) and
`await tick(700)` (s4r6). The signal those ticks stood in for was *already being computed* in s4-r3 and merely
recorded as `scriptLoaderReady`. Both now wait on the condition itself — script loader present, `isLoaded`
callable, route table present — and keep the original tick afterwards so the boot-window counts are measured
over the same window as before.

The cap is deliberately large (300 000) because it is spent in **virtual** time, where an 80-script boot is
not quick. This is not a sleep-until-green: `until` returns the instant the condition holds, so a healthy run
pays nothing for the headroom. A 20 000 cap was measured first and was genuinely too short — 14/16.

## And an unexercised scenario can no longer return a verdict

Even with boot fixed, the structural defect would remain: both suites let a scenario that never ran produce a
mutation verdict. That is worse than a failing test, because it is intermittent **and it accuses working
code**. Both now report it as a `HARNESS ERROR`, which still **fails the suite** — the condition is made
visible, never tolerated:

```
s4-r3   mode 'failure' and (attempted !== true or blocked === 0)  -> HARNESS ERROR
s4-r7   mode 'l2'      and toggleCount === 0                      -> HARNESS ERROR
```

This is what turned the original silent, intermittent survival into a loud, self-describing message —
*"failure scenario not exercised (script loader unavailable at failure phase)"* — which is how the second
root cause was found at all.

## Measured results

```
                          BEFORE          AFTER
boot readiness (s4-r3)    6 / 8           20 / 20
G4 mutant kill            8 / 10          20 / 20      varying fields: none
H1 mutant kill            5 / 10          20 / 20
MUTANT_SOURCE_RESTORE_MISMATCH_COUNT      0
S4_R3_REPEAT_PASS         10 / 10
S4_R7_REPEAT_PASS         10 / 10
```

Intermediate measurements are kept because they are the argument: profile isolation alone took s4-r3 boot to
11/12 and H1 to 13/20 — better, and still not deterministic. Only the boot latch closed both. Reporting the
end state alone would hide that two independent causes were stacked.

## Nothing was masked

No mutant removed · no assertion weakened · no suite excluded · no arbitrary sleep added to make a run pass ·
no sweep retried until green · canonical digest not updated · no intermittent survivor recorded as a known
failure. The two guards added make failures **more** visible, not less.

## S5 contract untouched

```
s5-r1  99 passed / 0 failed  9/9 mutants
s5-r2  35 passed / 0 failed  6/6 mutants
s5-r2a 59 passed / 0 failed  8/8 mutants
S5_DECISION_FREEZE_COMPLETE = YES      S5_BUSINESS_CONTRACT_CHANGED = NO
```

## Remaining, recorded not fixed

`--user-data-dir` is still absent from **fifteen other Chrome-launching runners** in `assets/tests/`
(`_s3r3-lifecycle`, `_s3r4-read-shape`, `_s3r5a-concurrency`, `_s4r1-*`, `_s4r2-reentry`, `_s4r4-deferred-read`,
`_s4r5-route-payload`, `_s3r11-interaction`, `_p1b8c-replay`, `_p1b8c-visual`, and others). They carry the same
latent defect. This round repaired the two runners with proven failures and measured them; extending the change
to the rest is a bounded follow-up that needs its own per-suite stability evidence, not a blanket edit.

> `SWEEP_RUNNER_PROFILE_ISOLATION_PENDING` — 15 runners still share the default Chrome profile.

---

## The follow-up became part of the round, because sweep run 3 said so

The first three serial sweeps after the G4/H1 repair returned:

```
run 1   canonical 5 · 13 lines · f809dca8…   ✓
run 2   canonical 5 · 13 lines · f809dca8…   ✓
run 3   6 suites · 15 lines · a6ec4faf…      ✗  s4-r4-deferred-reads, "H1 the deferred tables go
                                                 back on the mount read SURVIVED"
```

A **third** suite, with the same shared-profile defect — one of the fifteen this document had just recorded as
a bounded follow-up. Run 3 is the evidence that deferring it does not reach the round's goal, so the profile
fix was extended to all ten remaining Chrome-launching runners in `assets/tests/`.

**Deliberately narrower than the s4-r3/s4r6 repair.** Those two got a directory per *run*, because they were
measured at 20/20 that way and are not being re-opened. The other ten get one directory per *process*, created
at module load and removed on exit. Within a process every launch is `spawnSync` — sequential, already
exited — so per-process isolation removes the cross-process contention with the smallest possible edit, and
touches no runner's `try`/`finally` structure. No boot latch was added to them: that repair is scenario-shaped
and belongs with a measured failure, not with a blanket edit.

```
s4-r4-deferred-reads        6 / 6 after the fix   (the run-3 flake)
s3-r11-interaction-performance          PASS
s4-r1-performance-baseline              PASS
s4-r5-route-payloads                    PASS
s4-r2-warm-reentry-and-listeners        PASS
s3-r3-runtime-lifecycle-audit           PASS
```

Two of those were first checked under the wrong filename and reported "not found". A missing file is not a
passing suite, so they were re-run under their real names rather than counted.

`SWEEP_RUNNER_PROFILE_ISOLATION_PENDING` is now **closed**: every Chrome-launching runner under
`assets/tests/` passes `--user-data-dir`.
