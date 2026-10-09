# S8-R47-D — BASELINE RECONCILIATION — HANDOFF

**Status: PREPARED, NOT EXECUTED.** R47-D was explicitly not authorized in the R47-B+C round. This
document is the handoff and nothing in it has been run.

Three evidence layers are kept **separate** and must not be merged into one number:

| Layer | What it is | Status |
|---|---|---|
| **L1 Historical** | The 17-suite baseline as recorded in `S8_R46_RELEASE_READINESS.md` §8 | frozen, do not edit |
| **L2 Targeted** | Per-suite results from R47-A/B/C, measured on named suites only | complete |
| **L3 Full sweep** | 623 suites under the R47-B collector | **not yet run** |

L2 is not a substitute for L3. It proves what happened to the suites that were touched; it says
nothing about the other ~600.

---

## 1. L1 — THE EXACT HISTORICAL 17

```
6  FAIL-line suites (the frozen BASELINE_FAILURE_SET)
     gap-job-done-notice-f1-small-r1                                        3 FAIL  exit 1
     order-planning-monthly-projection-consumer-f1-4b-fm3d                  1 FAIL  exit 1
     positive-residual-and-submit-readiness-census-…-r5-r1                  6 FAIL  exit 1
     replen-header-toggle                                                   7 FAIL  exit 1
     supply-planning-route-inventory                                        2 FAIL  exit 1
     s2-r4b-shipping-history-and-fc-warm-race                               1 FAIL  exit 0  ← inverse case
11 silent nonzero (exit 1, no ^FAIL match)
     10 F1A harnesses dead on ReferenceError
      1 live-readback-and-display-closure-f1-7n-fb-4e-r4b  (78 passed / 3 failed, INDENTED FAIL lines)
```

**Arithmetic note, because it has been got wrong twice.** `s2-r4b` is a MEMBER of the frozen six, not
a seventh item. 6 + 11 = 17, and exit-code-nonzero = 5 + 11 = 16. An interim R47-A3 report said the
remainder would be 7 and a later one said 8; both double-counted `s2-r4b`, and the second also
assumed live-readback had been repaired when it had not. **The correct remainder is 6.**

## 2. L2 — WHAT R47-A/B/C ACTUALLY CHANGED

**R47-A (`85dc6f3`)** — ten F1A harnesses recovered. 678 assertions that had never executed now run;
10/10 exit 0, zero failed, zero surviving mutants. Nine stale-scope negatives added (mismatched and
missing stamps). No runtime file changed.

**R47-B (`6043882`)** — the union collector. 52 passed, 0 failed, 9 mutants, 0 survived. Validated
against real output on 12 suites with zero false positives *after* two of its own defects were found
and fixed by that validation (see §8).

**R47-C (`eea4188`)** — live-readback repaired. 78/3 → **85 passed, 0 failed**. One root cause (a
2000-character window against a 2346-character branch), three reported failures, zero product
defects. Three mutants added.

**R47-E (`c4c2c43`)** — UTF-8 document integrity gate. 23 passed, 5 mutants, 0 survived.

## 3. EXPECTED REMAINING FAILURES — exactly 6

All six are the frozen set, confirmed under the collector at `eea4188`:

```
gap-job-done-notice-f1-small-r1                 [NONZERO_EXIT, FAIL_LINES, SUMMARY_FAILED]   26/3
order-planning-monthly-projection-consumer-…    [NONZERO_EXIT, FAIL_LINES, SUMMARY_FAILED]   32/1
positive-residual-and-submit-readiness-census-… [NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY]   6 FAIL
replen-header-toggle                            [NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY]   7 FAIL
supply-planning-route-inventory                 [NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY]   2 FAIL
s2-r4b-shipping-history-and-fc-warm-race        [FAIL_LINES, MISSING_SUMMARY, FAIL_WITH_ZERO_EXIT]
```

**None of the six is silent any more** — each carries explicit reason codes. Four report
`MISSING_SUMMARY`: they print FAIL lines but no parseable totals. That is a reporting gap worth
fixing, but it is **not** licence to edit those suites; they are frozen.

## 4. THE ONE-FULL-SWEEP EXECUTION PLAN

**One sweep, once, after everything else has landed.** Roughly 30 minutes serial over 623 suites.

1. Confirm a clean worktree and record the exact HEAD. The sweep rewrites real source during
   mutation, so **the tree must be committed before it starts**.
2. Run serially: `for f in assets/tests/*.test.js; do node "$f"; done`, capturing **exit code and
   merged stdout+stderr per suite**. Never run it concurrently with another mutating task.
3. **Never interrupt it mid-run.** A killed sweep leaves a mutant in a real source file.
4. Feed every record through `_suite-result-collector.js` `classify()`, then `rollup()`.
5. Verify `git status` is clean afterwards. A dirty tree means a suite died mid-mutation; identify it
   and restore before trusting any number.
6. Publish the roll-up as the new L3 baseline, with per-suite reason codes.

**Expected L3 outcome: 6 NOT_CLEAN.** Anything else is a finding, not a baseline.

## 5. PER-SUITE ATTRIBUTION RULES

- Attribute each not-clean suite to the round that introduced its failure, by `git log` on the suite
  and on the runtime it covers — never by assumption.
- A suite in the frozen six keeps its existing attribution unchanged.
- A newly not-clean suite is attributed to the round whose change it first fails against, found by
  bisection, not by proximity in time.
- A suite whose only reason code is `MISSING_SUMMARY` is a **reporting** defect, recorded separately
  from an assertion failure; it must not be counted as a product regression.
- `VACUOUS` and `MUTANTS_SURVIVED` are test-quality findings and get their own category. They are
  not assertion failures and must not inflate the regression count.
- Attribution is evidence, not inference. **Do not conclude a suite was repaired because it is absent
  from a later list** — that error was made once this cycle about live-readback and had to be undone.

## 6. UTF-8 GATE INTEGRATION REQUIREMENTS

- `utf8-document-integrity-s8-r47.test.js` runs in the sweep like any other suite and must be CLEAN.
- Its one frozen exception (`LEGACY_ALLOCATION_DRAFT_RECONCILIATION_F1-7N-FB-4F.md`, `0x01` at byte
  10765, deliberate SOH-separator documentation) is asserted by **equality**. If the roll-up shows it
  failing, read the finding before assuming new damage: an exception that disappeared also fails.
- For per-round use, prefer `--changed` mode; the full census belongs to the sweep.
- Current floor: **317 tracked `.md`, 0 invalid** beyond that single frozen exception.

## 7. STOP CONDITIONS FOR NEWLY DISCOVERED REGRESSIONS

**STOP and report — do not repair inside R47-D — if any of these appear:**

1. Any suite outside the frozen six is NOT_CLEAN.
2. Any of the frozen six changes its FAIL output, count, or exit code. They are frozen in both
   directions: a frozen suite that starts passing is also a finding.
3. `git status` is dirty after the sweep (a mutant was left behind).
4. The UTF-8 gate reports anything other than its one frozen exception.
5. Any runtime, Apps Script, HTML/CSS, release-stamp or cache-token file differs from HEAD.
6. A suite reports `MUTANTS_SURVIVED`.
7. The sweep's total suite count differs from the expected 625 (623 + the two R47 suites) without a
   commit that explains it.

R47-D's job is to **measure and attribute**, never to repair. A repair found necessary becomes its
own authorized round.

## 8. TWO WARNINGS THIS ROUND EARNED

**Validate a detector against real output, not only fixtures.** The R47-B collector passed its own
fixture suite while carrying two defects that only real output exposed: it read
`mutants caught 12  survived 0` as *twelve survivors* (the count sits in front of the word), and it
read co1100r's section heading `AND IT IS NOT VACUOUS` as a vacuity verdict. Both would have
reported clean suites as failing. A detector that cries wolf gets ignored, which is how a baseline
rots in the first place.

**A fixed-length extraction window is a tripwire that re-arms itself.** R47-C's failure and
sales-velocity's were the same defect in two places: a character budget that the guarded code
eventually outgrew. Both are now structural cuts that fail closed. Any remaining
`[\s\S]{0,N}` window in the suite set is a future silent failure, and finding them is a reasonable
R47-D by-product — **report them, do not fix them in that round.**

---

## CARRY-FORWARD

All **31** S8 Legacy Carry-Forward items preserved. **Item 26** (ten dead suites) and **item 31**
(UTF-8 integrity) are CLOSED. **Item 27** (exit-code-aware harness) is closed by R47-B. **Item 28**
(vacuous-test detection) is partially addressed — the collector detects vacuity, but per-suite
self-reporting is still only ~13 of 623. **Item 29** (full baseline attribution) is exactly what
R47-D is for and remains **OPEN**.

**R46 Production Functional Acceptance remains OPEN** and is untouched by any of this.
