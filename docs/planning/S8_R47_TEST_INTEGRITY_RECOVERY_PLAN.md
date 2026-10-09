# S8-R47 — TEST INTEGRITY RECOVERY — TASK PLAN

**Status: PLANNED, NOT IMPLEMENTED.** Prepared by the S8-R46 Production Release Closure round. No R47
work was performed; this document is the handoff.

---

## 1. WHY THIS ROUND EXISTS

Every round from here is measured against a regression baseline that **reports 6 when the truth is 17**,
and against a Pages build that **had no encoding gate at all**. Both failures are the same shape: a check
that returns a clean answer while the thing it checks is broken.

Three proven instances, all from this release cycle:

1. **Eleven suites exit nonzero and print no `FAIL` line.** The sweep's detector is `^FAIL`-based, so they
   are counted as neither pass nor failure. Ten are `ReferenceError`s thrown *before* any output.
2. **One suite prints a `FAIL` line and exits 0** (`s2-r4b-shipping-history-and-fc-warm-race`). The two
   detectors each miss what the other catches.
3. **A latin1 write put invalid UTF-8 into the release ledger** (`4065ba3`) and broke GitHub Pages for two
   consecutive builds. Nothing in the suite, the deploy-surface gate, or the release-stamp gate noticed.
   It was found only by tracing a failed deployment backwards.

A fourth, found while writing this: `live-readback-and-display-closure-f1-7n-fb-4e-r4b` reports
**78 passed / 3 FAILED** and prints no `^FAIL` line. That is not a dead harness — it is a **live failing
suite that has been invisible**. It must be triaged, not merely re-counted.

---

## 2. SCOPE — FIVE WORK ITEMS

| # | Item | Carry-forward ref |
|---|---|---|
| R47-A | Repair the ten silently dead F1A suites | item 26 |
| R47-B | Exit-code-aware regression harness | item 27 |
| R47-C | Vacuous-test detection | item 28 |
| R47-D | Restate the baseline as 17 with categories | item 29 |
| R47-E | **UTF-8 / encoding integrity gate for tracked documents** | item 31 (new) |

### R47-A — the ten dead suites

All ten are F1A-era harnesses that inject free variables by name and were never told about
`_irResultMatchesAppliedScope_` / `_irAppliedScopeKey_`. All pre-existing at `0511b9b`. One
(`sales-velocity-authority-f1-4b-fm5r4jlive9`) was already repaired this cycle and is the worked example.

**Triage first, repair second.** A suite that starts running may reveal a real failure, as
`live-readback-and-display-closure` already has. Report any such failure as a finding; do **not** silence it.

### R47-B — exit-code-aware harness

The driver at `scratchpad/sweep-r46/run.sh` already captures exit codes; the **detector** is still FAIL-line
based. A suite is not-clean if **either** signal fires. Required output per suite: `exit_code`,
`fail_line_count`, `printed_summary`, and a verdict from the union.

### R47-C — vacuous-test detection

`M12` (advanced-sheets) and `M13` both went vacuous this cycle — an injection that injected nothing, passing
for the wrong reason. Only two suites self-report vacuity today. Minimum bar: a mutant that survives and a
mutant set that is empty must be **distinguishable in the output**, and an empty mutant set must fail.

### R47-D — baseline restatement

The canonical baseline becomes **17 not-clean suites** with categories preserved: 6 FAIL-line
(`BASELINE_FAILURE_SET`, byte-identical), 11 silent nonzero, and the inverse case (FAIL line, exit 0).
Each of the 17 attributed to the round that introduced it.

### R47-E — encoding integrity gate

A test that fails when **any tracked text document** is not valid UTF-8. Must have caught `4065ba3`.

- Strict decode over all tracked `.md` (and any other text extension Pages serves).
- Current census: **316 tracked `.md`, 0 invalid.** That is the clean floor the gate starts from.
- Also assert **no `0x14`/`0x1A` control bytes** outside code fences — the 14 mojibake em-dashes were
  *valid* UTF-8 and would have passed a decode-only check.
- Should be cheap enough to run on every round, not only at release.

---

## 3. ALLOWED FILES

- `assets/tests/**` — the ten named dead suites, plus new suites for R47-C and R47-E
- `assets/tests/_release-order.js` — **only** if a new suite must register; append-only, no token rotation
- `scratchpad/sweep-*/run.sh` or its successor — the harness driver
- `docs/planning/S8_R46_RELEASE_READINESS.md` — §8 baseline restatement only
- One new `docs/planning/S8_R47_*.md` completion report

## 4. DO NOT TOUCH

- Runtime JS, Apps Script (`assets/specs/active/apps-script/**`), HTML, CSS
- Database, planning calculations, allocation logic
- **Release stamps and cache tokens** — R47 is not a release; `SYS_DEPLOYMENT_RELEASE_`,
  `SYS_BUILD_VERSION_`, every `*_BUILD_VERSION_`, and `ROUND_TOKENS` all stay put
- `docs/planning/DEPLOYMENT_RELEASE_LOG.md` — no R47 entry; there is no release to record
- The 6 frozen `BASELINE_FAILURE_SET` suites — **re-categorised, never "fixed" to make a number look better**
- `.nojekyll` / GitHub Pages configuration
- `C:/km-lb`

## 5. ACCEPTANCE GATES

1. All ten dead suites **execute and print a summary**. Repaired-to-passing where the defect was the
   harness; reported as a **finding** where a real failure surfaces.
2. `live-readback-and-display-closure-f1-7n-fb-4e-r4b`'s 3 failures triaged and attributed.
3. Harness verdict is the **union** of exit code and FAIL line. Proven both ways: a suite that exits 1
   silently is caught, and a suite that prints FAIL and exits 0 is caught.
4. Baseline restated as 17 with categories and per-round attribution.
5. Encoding gate fails on a reintroduced `4065ba3`-style corruption and passes on the current tree.
6. **No assertion weakened or deleted to obtain a pass.** A suite that cannot be repaired honestly is
   reported as still-dead, with the reason.
7. Total suite count and the 6 FAIL-line set unchanged except as item 1 explicitly justifies.
8. Every touched `.md` validates as UTF-8 — this round, of all rounds, cannot ship an encoding defect.

## 6. MUTATION-SENSITIVE TESTING REQUIREMENTS

Every gate added in R47 must carry mutants, because each one is a **detector**, and an undetected broken
detector is precisely the failure class this round exists to end.

- **R47-B** — at least two mutants: (a) a suite that exits nonzero and prints nothing; (b) a suite that
  prints `FAIL` and exits 0. Both must be caught. A harness that catches only (a) has reproduced the
  original blind spot.
- **R47-C** — a mutant whose injection injects nothing must be reported **vacuous**, not passing.
- **R47-E** — at least three mutants: a standalone `0xA7`; a truncated multi-byte sequence; a `0x14`
  mojibake byte that is *valid* UTF-8. The third is the one a decode-only gate misses.
- **No mutant may survive.** Report `mutants N, survived 0`, and self-report vacuity where the suite
  supports it.
- Mutants must restore the file exactly. The sweep rewrites real source — a killed run leaves a mutant
  behind, so never interrupt it mid-run.

## 7. EXECUTION NOTES

- Repo is **CRLF** (`core.autocrlf=true`). `sed -i` flattens it and `grep -c $'\r'` cannot detect it. Use
  the Edit tool or explicit byte-level writes with **explicit `utf8` encoding** — the latin1 default is
  exactly what caused item 31.
- `python3` is not available in this Git Bash; `python` and `node` are.
- Full sweep is ~30 minutes serial over 623 suites. Do not run it concurrently with another mutating task.
- Scope substitutions to the entry being edited: field names like `APPS_SCRIPT_DEPLOYMENT_PERFORMED` recur
  in **every** release entry, and a file-wide replace hits the wrong round. (Caught by an anchor-uniqueness
  guard during R46 closure.)

## 8. WHAT R47 IS NOT

Not a release. Not a feature round. No runtime behaviour changes, so there is no Apps Script sync, no
deployment, no cache-token rotation and no ledger entry. R46's functional acceptance is **not** in scope
and remains OPEN independently.
