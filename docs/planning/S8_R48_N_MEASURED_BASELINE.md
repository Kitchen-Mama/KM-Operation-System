# S8-R48-N — MEASURED REGRESSION BASELINE

**Supersedes** `S8_R48_G_MEASURED_BASELINE.md` as the current baseline. The R48-G evidence and its
reclassification are preserved unchanged; this is a new measurement, not a revision of that one.

| | registered | CLEAN | FAILING | UNVERIFIABLE |
|---|---|---|---|---|
| R48-G (reclassified, official) | 627 | 582 | 6 | 39 |
| **R48-N (this measurement)** | **627** | **587** | **1** | **39** |
| delta | 0 | +5 | -5 | 0 |

Every number above comes from executing all 627 suites. None is derived by arithmetic.

## Provenance

- evidence run: `docs/evidence/s8-r48-sweep/r48n-full`
- schema: `km-sweep-evidence/1`
- sweep-time commit: `d2f42a316b320ef151fd026bf73c81d3cd6a6910`
- collector sha256: `04b8cdb279ff77df7b86a51ab23b47071c413becfa0b659454709fd941be436e`
- suite registry hash: `39b419793505c773cc280c3916b529b6f8a34828d3e1f85cc5d3354213d71e7e`
- worktree at sweep time: INTACT · secret scan: CLEAN (independently rescanned: 1254 files, 0 hits)
- integrity: ok, 0 problems · offline replay: 627 records, **0 verdict differences**

The registry hash is **identical** to R48-G's, so the two baselines enumerate the same 627 suites in the
same order: there are no additions or removals to explain.

The collector hash differs from the R48-G *manifest* (`4a7a3e92…`) and matches its *reclassification*
(`04b8cdb2…`). R48-G's sweep was measured at `5606d94`, before the second R48-G collector fix `71f07fc`
landed; the reclassification is the record of replaying the same bytes through the finished collector.
`71f07fc` is still the last commit to touch the collector, so this sweep used exactly the collector the
official R48-G baseline was computed with. Nothing about the collector changed in this round.

## Every bucket transition — seven, all attributed

**Six FAILING to CLEAN. The targeted frozen recovery is 6 of 6, confirmed by execution:**

| suite | recovered in |
|---|---|
| `replen-header-toggle` | R48-J2 |
| `gap-job-done-notice-f1-small-r1` | R48-J3 / K1 |
| `supply-planning-route-inventory` | R48-K2 |
| `order-planning-monthly-projection-consumer-f1-4b-fm3d` | R48-L1 |
| `s2-r4b-shipping-history-and-fc-warm-race` | R48-L2 |
| `positive-residual-and-submit-readiness-census-…-r5-r1` | R48-M1/M2/M3 + R48-N1 |

**One CLEAN to FAILING — `s7-r5-supporting-mainline-final-integration`.**

Not repaired here: this task does not authorize repairing newly discovered failures. Raw evidence is
preserved at `r48n-full/raw/s7-r5-supporting-mainline-final-integration.{out,err}.txt`.

The failing assertion is G1, at `assets/tests/s7-r5-supporting-mainline-final-integration.test.js:496`:

    var s7Changed = changedBetween(S7_BASE, 'HEAD');      // line 494 - OPEN at one end
    var s7Only    = changedBetween(S7_BASE, S7_END);      // line 495 - correctly bounded
    eq(s7Changed.filter(/forecast/i), [], 'G1 … no file whose path names forecast changed in ANY S7 round');

G1 intends to assert that the S7 rounds changed no forecast file. It measures an interval that is open at
one end, so it actually asserts that no forecast-named path has changed at any time since — a claim that
grows with every later round. The file already computes the correctly bounded interval on the line above
and uses the open one.

**There is no product defect.** On `S7_BASE..S7_END` — the interval the guard's own sentence describes —
zero forecast files changed, so the claim G1 defends is still true. The six paths it caught are all under
`docs/evidence/`, every one an evidence artefact named after the suite whose output it captures:

    docs/evidence/s8-r48-sweep/r48g-full/raw/fc-base-forecast-source-and-warm-state-r2b-a3-r5.{out,err}.txt
    docs/evidence/s8-r48-sweep/r48g-full/raw/forecast-missing-means-zero-and-ai-plan-unblock-….{out,err}.txt
    docs/evidence/s8-r48-sweep/r48g-full/raw/manual-composer-expected-state-and-forecast-rollover-….{out,err}.txt

They were added by `6d05056 docs(r48-g): the baseline, and this time the bytes it was read from` — R48-G's
own evidence commit. R48-G's sweep ran at `5606d94`, which precedes `6d05056`, so the guard was still
passing when that baseline was measured. **This failure has existed since R48-G committed its evidence;
this sweep is the first run to observe it.** It is not caused by R48-N1 (`d2f42a3`), which changed no path
matching `forecast`.

**Committing this round's evidence extends the same condition.** `r48n-full/raw` contains six more
forecast-named artefacts, so the open interval will report twelve paths rather than six at the next run.
That is a property of the guard, not of the evidence, and the operator should know it before the next
sweep rather than discover it in the output.

## UNVERIFIABLE — 39, and the same 39

The set is **identical** to R48-G's, suite for suite, not merely equal in count. 38 carry `MISSING_SUMMARY`
alone; `supply-planning-golden-scenarios` carries `INCOMPLETE, MISSING_SUMMARY` and is the one suite in the
corpus that declares its own run unfinished.

A correction to the R48-M report, which expected three suites to leave this set by gaining numeric
summaries: none did. The recovered suites moved from FAILING, not from UNVERIFIABLE.

## Reason-code distribution (overlapping; verdicts are exclusive)

`MISSING_SUMMARY` 39 · `NONZERO_EXIT` 1 · `FAIL_LINES` 1 · `SUMMARY_FAILED` 1 · `INCOMPLETE` 1

The 40 NOT_CLEAN suites are 1 FAILING + 39 UNVERIFIABLE. Reason codes overlap by design: the single
FAILING suite carries three of them.

## Open

- `s7-r5-supporting-mainline-final-integration` G1 — the interval, diagnosed above, unrepaired by design.
- R46 Production Functional Acceptance remains OPEN.
- 90-day allocator and Admin Marketplace Priority remain NOT ACTIVATED.
