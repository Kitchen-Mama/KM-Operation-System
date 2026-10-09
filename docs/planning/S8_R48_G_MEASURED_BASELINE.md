# S8-R48-G — THE MEASURED BASELINE, WITH ITS EVIDENCE

One full sweep of the registered suite set, executed serially, classified by the committed
collector, with every byte of output persisted and replayable.

```
627 registered

CLEAN         582
FAILING         6     the frozen six, unchanged
UNVERIFIABLE   39     exit 0, zero FAIL lines, no parseable assertion count

              627 = 582 + 6 + 39
worktree: INTACT (before and after)
```

**No newly discovered failures. No frozen suite became clean. No previously-clean suite regressed.**

Evidence: `docs/evidence/s8-r48-sweep/r48g-full/` (manifest + 1254 raw stream files, ~3.1 MB).
Final classification: `docs/evidence/s8-r48-sweep/r48g-full-reclassification.json`.

---

## 1. THE DELTA IS THE COLLECTOR, NOT THE SUITES

This is the first baseline that can prove that claim rather than assert it.

The same stored bytes were replayed through the **R47-D-era collector** (`57bb51d`) and through the
collector committed in this round:

| Collector, over the IDENTICAL bytes | CLEAN | NOT_CLEAN |
|---|---|---|
| R47-D era (`57bb51d`) | **500** | 127 |
| R48-G (final) | **582** | 45 |

The historical baseline recorded **499 / 6 / 121 across 626 suites**. Replaying today's bytes under
the historical collector reproduces it exactly: 500 clean of 627, the single extra being
`sweep-evidence-replay-s8-r48f`, the suite added in R48-F. The registry grew by one; nothing drifted.

So the whole improvement is **recovered measurement, not changed behaviour**:

- **82 suites recovered** — previously unverifiable, now reporting a real assertion count.
- **0 suites regressed.**
- **0 new failures.**

The historical **499 / 6 / 121** result stands as recorded. It is not amended; it is explained.

## 2. THE FROZEN SIX — BYTE-FOR-BYTE UNCHANGED

| Suite | exit | p/f | FAIL lines | reason codes |
|---|---|---|---|---|
| `gap-job-done-notice-f1-small-r1` | 1 | 26/3 | 3 | NONZERO_EXIT, FAIL_LINES, SUMMARY_FAILED |
| `order-planning-monthly-projection-consumer-f1-4b-fm3d` | 1 | 32/1 | 1 | NONZERO_EXIT, FAIL_LINES, SUMMARY_FAILED |
| `positive-residual-and-submit-readiness-census-…-r5-r1` | 1 | — | 6 | NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY |
| `replen-header-toggle` | 1 | — | 7 | NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY |
| `supply-planning-route-inventory` | 1 | — | 2 | NONZERO_EXIT, FAIL_LINES, MISSING_SUMMARY |
| `s2-r4b-shipping-history-and-fc-warm-race` | **0** | — | 1 | FAIL_LINES, MISSING_SUMMARY, FAIL_WITH_ZERO_EXIT |

Identical to the R47-D table, including the exit-0 inverse case. **Not edited, not unfrozen, not
reclassified.** Four still emit no parseable summary, so they are in the 39 as well as the 6 — the
same double-membership recorded in R47-D.

## 3. THE COLLECTOR FALSE POSITIVE THIS SWEEP FOUND

The sweep's own result is the reason this section exists, and the number moved because of it.

At sweep time the collector reported **574 CLEAN / 53 NOT_CLEAN**. Attribution showed eight suites
that the R47-D-era collector had called CLEAN were now `INCOMPLETE`. A new not-clean verdict is
never accepted silently, so each was read:

```
== B. Incomplete scope is not a persistence failure (§4) ==
== A. route-incomplete new Draft never creates K3 ==
== §F/§G — INCOMPLETE IS NAMED, NEVER SILENT; AND DIRTY IS DIRTY ==
== D — ZERO, MISSING, INACTIVE, INCOMPLETE. None of them become a fake share. ==
   caught: M8  the incomplete card stops saying which dimension is missing
```

All eight are **section headings and mutant labels**. Every one of these suites is *about*
incompleteness as a domain concept; none reports an unfinished run. The `INCOMPLETE` signal added in
R48-A matched the bare adjective, and the terminal window amplified rather than contained it: the
window keeps the last 15 **non-result** lines, so in an assertion-heavy suite those fifteen lines
reach back across the entire transcript and collect every heading in it.

This is prose read as result for the fourth time in this programme — after the `NOT VACUOUS`
heading, the whole-transcript mutation counts, and this collector reporting itself.

**The rule is now declarative only.** A suite stating its own run unfinished says `NOT COMPLETE`;
the adjective describes the thing under test. Verified across all 627 captured transcripts: exactly
one uses the declarative form (`FULL 40-SCENARIO MATRIX NOT COMPLETE`, in
`supply-planning-golden-scenarios`) and **no suite anywhere uses `INCOMPLETE` as a self-report**, so
the narrowing loses no true positive. Pinned by five real heading fixtures and mutant X17.

**No second sweep was run.** The correction was applied to the stored bytes — which is the entire
point of persisting them, and its first real use.

### How the correction is recorded

The manifest in `r48g-full/` holds the verdicts **as classified at sweep time**, and is left alone.
The final classification is published separately in `r48g-full-reclassification.json`, naming both
collector hashes and listing all eight superseded records. Replaying `r48g-full` under the current
collector therefore yields **8 expected diffs** — a visible comparison, which is what
`collector_sha256` exists for, not a silent substitution and not tampering.

## 4. THE REMAINING 39

| Reason | Count |
|---|---|
| `MISSING_SUMMARY` | 38 |
| `INCOMPLETE` + `MISSING_SUMMARY` | 1 (`supply-planning-golden-scenarios`) |

All exit 0 with zero FAIL lines. They are **not failures and not verified passes** — a suite that
will not say what it ran cannot be confirmed to have passed, which is the exact condition the ten
dead F1A harnesses were in. The large remaining block prints `ALL PASS`, which carries no number;
that is not a parser problem and must not be solved by inventing one. They stay **DEFERRED TEST
DEBT**.

Projection accuracy, for calibration: R48-A projected ~594 CLEAN / ~27 UNVERIFIABLE from a 1-in-4
sample. Measured: **582 / 39**. The projection was optimistic by ~12 suites, outside its stated ±8
band — sampling the dialect census overestimated recovery, because a captured dialect does not
guarantee a parseable line in every suite that uses it.

## 5. EVIDENCE AND SECURITY

- **Schema** `km-sweep-evidence/1`; stdout and stderr stored and hashed **separately**.
- **Integrity** all 1254 raw files match their stored sha256; `verifyIntegrity` ok, 0 problems.
- **Secret scan** ran **before** any write and reported `CLEAN`; an independent re-scan of the
  committed bytes found **no** findings. Nothing was quarantined.
- **Size** ~3.1 MB over 1256 files; 615 stderr files are empty, which is the schema's cost for
  keeping the two streams distinguishable — the distinction that revealed the ten dead harnesses.
- **EOL** raw files, manifest and the reclassification record are pinned `-text`, so the stored
  hashes survive a fresh clone.

## 6. WHAT THIS DOES NOT SAY

- **The test suite is NOT marked PASS.** Six suites fail and 39 remain unverifiable.
- **R46 Production Functional Acceptance remains OPEN.** Nothing here touches production; a sweep is
  not functional evidence.
- All **32 S8 carry-forward items are preserved**, none closed by this round.
- The **90-day allocator** and **Admin Marketplace Priority** remain **NOT ACTIVATED**.
- A replay reproduces **classification**, not execution. It proves what the collector concludes from
  those bytes; it does not re-prove the bytes.
