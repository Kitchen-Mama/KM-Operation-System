# S8-R47-D — BASELINE RECONCILIATION — CLOSURE

**One full sweep, executed once.** 626 registered suites, serial, uninterrupted, every suite
classified through `_suite-result-collector.js`. Worktree **INTACT** before and after — no suite died
mid-mutation.

**The headline, stated in two numbers rather than one.** A single "not-clean" count would be
misleading here, and conflating these would repeat the error this whole round exists to end:

```
FAILING        6     the frozen six, unchanged — identical to the L1 historical set
UNVERIFIABLE 121     suites that PASS (exit 0, zero FAIL lines) but emit no parseable counts
CLEAN        499
                     626 = 499 + 6 + 121
```

**No newly discovered failures. No frozen suite became clean.** The six that fail are byte-for-byte
the six that failed before R47 began.

---

## 1. L1 / L2 / L3 ATTRIBUTION

| Layer | Count | Status |
|---|---|---|
| **L1 Historical** | 17 not-clean (6 FAIL-line incl. `s2-r4b`, + 11 silent) | frozen, unedited |
| **L2 Targeted** | 10 F1A harnesses + 1 live-readback recovered | all 11 CLEAN |
| **L3 Full sweep** | 626 suites → 6 failing, 121 unverifiable, 499 clean | **this document** |

**L1 → L3 reconciliation is exact.** 17 − 11 recovered = 6. Every one of the 11 silent suites is now
clean; the 6 frozen remain. Nothing was added to the accepted baseline.

## 2. THE SIX — ALL HISTORICAL, NONE NEW

| Suite | exit | p/f | FAIL lines | Category |
|---|---|---|---|---|
| `gap-job-done-notice-f1-small-r1` | 1 | 26/3 | 3 | historical, unknown root cause |
| `order-planning-monthly-projection-consumer-f1-4b-fm3d` | 1 | 32/1 | 1 | historical, unknown |
| `positive-residual-and-submit-readiness-census-…-r5-r1` | 1 | — | 6 | historical, unknown |
| `replen-header-toggle` | 1 | — | 7 | historical, unknown |
| `supply-planning-route-inventory` | 1 | — | 2 | historical, unknown |
| `s2-r4b-shipping-history-and-fc-warm-race` | **0** | — | 1 | historical, the inverse case |

Each is **HISTORICAL KNOWN_FAILURE**, not newly discovered. Root causes are **not** classified as
product defect / obsolete contract / infrastructure in this round: R47-D measures and attributes, it
does not diagnose, and guessing a category without reading each failure would be exactly the kind of
unverified claim this round was convened to stop. Four emit no parseable summary, which is why their
p/f columns are blank — they are in the 121 as well as the 6.

**Frozen-six integrity: zero commits touched any of them during R47** (verified per file against
`14b1c50..HEAD`).

## 3. THE 121 — PASSING BUT UNVERIFIABLE

All 121 exit 0 with **zero** FAIL lines. They are not failing. They simply never say how many
assertions ran, in dialects such as:

```
ALL PASS
All Amazon daily-sales dedup dry-run assertions passed (29 assertions)
```

The collector fails closed on these by design: **you cannot confirm a suite passed if it will not
tell you what it ran.** That is the exact condition the ten dead F1A harnesses were in — exit 0 would
have looked identical. So these are recorded as **DEFERRED TEST DEBT**, never as failures and never
as verified passes.

They are **not** fixed here, and no attempt was made to add 121 parser dialects. That would be
whack-a-mole against output formats rather than a fix, and R47 is not a general test refactor.

## 4. A COLLECTOR DEFECT THE SWEEP ITSELF EXPOSED

The raw sweep reported **140** not-clean, including **13 VACUOUS**. All 13 were false accusations
from two parser defects, now fixed in `666c4d7`:

- **Whole-transcript mutant parsing.** Counts were taken from the first match anywhere in the output,
  so prose far above the summary became the mutation score. `b1-product-first-layer-batch-read`
  prints `16 mutants, 0 survived, vacuity clean` and was classified `mutants=0` → VACUOUS.
- **The `mutants killed 6/6` dialect.** With `killed` between the word and the number, every fallback
  skids past and matches the `failed 0` in *front* of `mutants`, declaring nine 6-of-6 `s5-*` suites
  vacuous. killed/total also means survivors are the *remainder*.

All 13 verified CLEAN under the repaired collector, **suite by suite rather than by re-running the
sweep**. The single authorized sweep stands; its VACUOUS verdicts are superseded by that targeted
re-verification, and the corrected L3 figures above reflect it.

**The lesson is the important part.** The collector passed its own fixture suite with both defects
present. Only the 626-suite sweep exposed them. A detector validated solely against the strings its
author imagined is a detector that agrees with its author — which is how a baseline reported 6 for
several rounds while the truth was 17.

## 5. STRUCTURAL TEST DEBT CENSUS (report only — nothing modified)

| Category | Count | Note |
|---|---|---|
| **Magic-number source slices** | **210 files** | bounded `{0,N}` extraction windows |
| → high risk (≥300 chars) | **108 files** | large enough to span a block that grows |
| → medium (100–299) | 105 | |
| → low (<100) | 85 | tight patterns, low drift risk |
| **Missing summary output** | **121 suites** | §3 above |
| **Mutation coverage gaps** | **306 of 626** | no mutant/mutation construct in the source at all |
| **Potentially vacuous** | **0** | after `666c4d7`; was 13, all false |
| High-risk stale anchors | 2 found, both repaired | live-readback `{0,2000}`, sales-velocity `+900` |

The 108 high-risk windows are the same defect class that silently broke live-readback (`{0,2000}`
against a 2346-character block) and sales-velocity. Each is a tripwire that re-arms itself whenever
the guarded code grows, and the failure mode is a *silent null match*, not an error. This is a
materially larger surface than the handoff anticipated.

**306 suites with no mutation coverage** is the bigger number and the quieter risk: an assertion
nobody has ever seen fail is an assertion whose sensitivity is unmeasured.

## 6. ACCEPTANCE GATES

| Gate | Result |
|---|---|
| Exactly one full sweep | **YES** — one run, not repeated for a better result |
| Every registered suite accounted for | **626/626**, no duplicates, no missing records |
| Every suite classified by the collector | **YES** — single path, no short-circuit |
| UTF-8 gate PASS | **YES** — 23/0, 5 mutants, 0 survived |
| Runtime hashes unchanged | **YES** — all six reference files IDENTICAL |
| Frozen six preserved | **YES** — 0 commits touched them |
| No hidden silent failures | **YES** — every suite carries explicit reason codes |
| Historical / current separated | **YES** — §1 |
| Newly discovered failures reported | **NONE EXIST** |
| No unauthorized production changes | **YES** |
| Carry-forward preserved | **YES** — all 31 |

## 7. WHAT IS AND IS NOT CLOSED

- **VERIFIED CLEAN:** 499 suites, including all 11 recovered in R47-A/C.
- **HISTORICAL KNOWN_FAILURE:** 6, unchanged, uneditable without authorization.
- **NEWLY DISCOVERED:** none.
- **INFRASTRUCTURE FAILURE:** one, found and fixed within the round (`666c4d7`).
- **DEFERRED TEST DEBT:** 121 unverifiable summaries, 108 high-risk windows, 306 mutation gaps.
- **The test suite is NOT marked PASS.** Six suites remain not-clean and 121 remain unverifiable.
- **R46 Production Functional Acceptance remains OPEN.** Nothing in this round is production
  evidence, and none was sought.

---

## CARRY-FORWARD — all 31 preserved

**CLOSED:** 26 (ten dead suites) · 27 (exit-code-aware harness) · 29 (full baseline attribution —
this document) · 31 (UTF-8 integrity).
**Partially addressed:** 28 (vacuous-test detection) — the collector detects vacuity and no suite now
reports it, but **306 suites carry no mutation coverage to be vacuous about**, so the underlying
exposure is larger than the signal suggests.
**OPEN:** all remaining items, unchanged. **R46 functional acceptance OPEN.**
