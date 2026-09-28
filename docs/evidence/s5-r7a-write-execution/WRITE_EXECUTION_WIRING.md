# S5-R7A — draft write execution wiring + write-truth seal

**Base** `7898f36` · no production write · `PRODUCTION_ROWS_WRITTEN = 0` · `REAL_DB_WRITE_TEST_COUNT = 0`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part IX, §83–§91**.

---

## The gate, verified rather than adopted

§0 supplied a canonical baseline and asked for it to be checked first. The five canonical suites were run at
`40e8f05` in a detached worktree and at `7898f36`: same five suites, byte-identical FAIL lines, and the digest
`596eeb64…` reproduces from those five alone — so all 19 lines originate inside the already-failing set and
`CANONICAL_FAILURE_SET_CHANGED = NO` holds.

---

## One owner, on the path that writes

S5-R6 produced the eligibility rule and left it in a function nothing called. This round makes it an owner and
puts it where the write happens.

```
WRITE_ELIGIBILITY_OWNER = KMRDV2P.actionAuthorizesOrderWrite            COUNT = 1
MONTHLY_FLAT_WRITE_OWNER = rpoFlatLockedApply_ (24_:155)                COUNT = 1
LEGACY_PARALLEL_WRITE_PATH_COUNT = 0
```

`recGenBuildGapDraftBody_` in 47_ asks KMREC for the verdict and attaches it to the body. That builder is the
only place a stored gap row becomes a draft body, and **both** live entries pass through it — the manual AI
Plan job and the scheduled driver — so the verdict is produced once, by the canonical owner, and read as a
value thereafter. A test asserts the eligible-action set is spelled in exactly one file and that no `.gs`
consumer derives it.

The refusals are measured, not asserted: **zero draft rows, zero run rows, and zero entries into the writer**,
because the guard runs before `planFlat`.

---

## Two defects the wiring surfaced, one of them mine

**The summarizer would have called a correct refusal a failure.** `NOT_ELIGIBLE` and `STALE_RECOMMENDATION`
carry a reason `recGenSummarizeDraftResult_` did not recognise, so they would have fallen to its default and
reached the operator as **FAILED** — the R5C incident in a new place, where every committed flat write was
classified `GENERATION_FAILED` because its shape was unrecognised and the operator saw *Failed 99* over 41 rows
that had committed. Both map onto the **existing** `NOT_READY` status rather than a new one, because 48_'s
per-SKU code map answers anything it does not know with `F`:

```
codeFor('NOT_READY') = 'G'      codeFor('SOMETHING_NEW') = 'F'
```

**The guard was placed where it took other gates' reasons.** Inserted at the top of
`recGenBuildGapDraftBody_`, it answered before the readiness and planning-cycle gates. A caller asking why a
SKU was skipped would have been told the bundle was missing when the real answer was a stringified planning
cycle — precisely the failure `request-order-ai-plan-cycle-boundary` exists to reproduce, and it caught it
within one sweep. The guard now runs last and decides only whether an otherwise-ready body may be built
without a verdict.

Three harnesses that run the real 47_ now publish the real KMREC beside the KMRDV2/KMRDV2P they already
published, and the real KMCALC on the global. Stubbing it would have made them agree with something that is
not shipped — the choice `s5-r4` already made for the cartonizer.

---

## The quantity authority, re-measured through the real path

```
units_per_carton = 12, gaps 13 and 13
  KMREC cartonize-once total    = 36   ← display
  written tiers                 = 24, 24   (Σ 48)   ← order_planning_gap.tN_suggested_qty, verbatim
KMREC_TOTAL_IS_WRITE_SOURCE = NO    SECOND_QUANTITY_AUTHORITY_COUNT = 0
```

`36` appears in no column. Neither the planner nor the body builder reads `totalRecommendedQty` at all.

---

## Operator authority, stated exactly

```
OPERATOR_ACTION_OWNER = assets/js/pages/request-order.js
OPERATOR_ACTION_NAME  = handleRequestOrderAiPlan
DOUBLE_CLICK_DUPLICATE_DISPATCH = 0
```

**And the qualification this round owes.** `WRITE_CAN_START_WITHOUT_OPERATOR_ACTION = NO` for the path S5
introduces — and **not** universally. A second entry exists and is not operator-initiated: the scheduled
ORDER_PLANNING refresh (45_/47_ trigger → 49_ → the same 48_ job, mode `SCHEDULED_REFRESH`). It predates S5 and
is deliberate.

What makes it acceptable is not its age. It is that a refresh can only move system-suggestion columns —
`refresh` skips any tier a user has edited — and that nothing on the path creates a Request Order, a PO or a
shipment. A draft is a proposal; issuing it stays an operator act. Reporting `NO` without that sentence would
have been the easy answer and the false one.

---

## Write truth, executed

§J lifts the real `rpoFlatLockedApply_` out of 24_ and runs all four states against fakes.

| state | outcome | writes attempted |
|---|---|---|
| committed + verified | `WRITE_COMMITTED_VERIFIED` | 1 |
| committed + readback failed | `WRITE_COMMITTED_READBACK_FAILED` + `requiresReconciliation` + committed id | 1 |
| token / duplicate conflict | `WRITE_REJECTED` | 0 |
| lock not acquired | `WRITE_NOT_STARTED` | 0 |

```
FALSE_NOT_WRITTEN_CLAIM_COUNT = 0    AUTOREPLAY_ON_UNKNOWN = NO
```

The unknown state is none of the three confident answers, and `applyFlat` is entered exactly once per call.

---

## Why R7B cannot be authorized yet

```
PRODUCTION_SMOKE_READY = NO
```

The blocker is a property of the design, not an oversight: **the canonical write owner has no delete.**
`applyFlat` appends or replaces; `rprWriteBack_` records that terminal rows are never removed because the pure
module only supersedes; `rpoKeyedDeltaWrite_` writes changed and appended rows only. Verified by grep — no
`deleteRow` / `removeRow` anywhere in the write owner.

So an INSERT smoke cannot be undone through any canonical path (`cancelMonthlyFlat` leaves a *cancelled* row,
which is a different state, not the prior one), and an UPDATE smoke cannot either (restoring the values through
`editMonthlyFlat` advances `draft_version` and stamps `user_edited`, so the post-restore row is not the
pre-state).

§14 says not to request authorization when rollback is non-deterministic, so it is not requested. The proposal
is recorded in full in the round report so the operator can see what would be asked for and what would have to
exist first.

---

## Release

```
BACKEND_RELEASE = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R29   (R28 -> R29; R28 unshipped is not a licence to reuse)
APPS_SCRIPT_SYNC_SET (cumulative, unshipped since R25) =
  90_generated_supply_planning_bundle.gs   sha256 c6080ffce8b0d4ac6ff888490c3d489e9824411ab2103281a1baad3d2d2b733d
  63_api_v1_system_health.gs   R29   ·   47_api_v1_recommendation_generation.gs   R29   (changed this release)
  01_router.gs   R25   ·   73_api_v1_pricing_write.gs   R25                            (carried)
FRONTEND_DEPLOY_REQUIRED = NO — no frontend byte changed
APPLICATION_TOKEN = s5r4-actionreason-20260928   TOKEN_ROTATION_REQUIRED = NO
```

**The half-sync this release can produce**, and why the two owners travel together: 47_ at R29 beside an older
bundle answers `RECOMMENDATION_OWNER_UNAVAILABLE` and writes nothing, which is the intended fail-closed half.
The reverse is the dangerous one — a new bundle beside an older 47_ means the guard exists, nothing ever hands
it a verdict, every SKU is written exactly as before, and every probe reports healthy.

**It lands as ONE commit.** The first sweep passed and the second caught `E4`: 47_'s stamp had been set in one
commit and 47_ changed again in the next, and E4 ties a stamp's commit to the file's last change. The two local
commits were squashed, which is the recorded remedy.

---

## Results

```
s5-r7a-write-execution-wiring   99 passed / 0 failed   10/10 mutants
s5-r6 112/0 12/12 · s5-r5 64/0 · s5-r4 96/0 16/16 · s5-r3 134/0

sweep 1   567 suites · 9 failing · the four above
sweep 2   567 suites · 6 failing · E4, repaired by squashing
sweep 3   562 passed / 567 · canonical 5 · 19 lines · DIRTY 0 · clean

CANONICAL_SUITE_COUNT = 5   CANONICAL_FAIL_LINE_COUNT = 19
CANONICAL_DIGEST = 596eeb6448f3911ff876a3f7c21606e747a4892f43df9fa7c4186830ed9069ba
CANONICAL_FAILURE_SET_CHANGED = NO   — byte-identical to the §0 baseline this round was given
```

567 rather than 566 because this round added one suite.

The digest returning to its starting value is the useful fact here. Sweep 1 moved it (four suites), sweep 2
moved it again (E4), and sweep 3 landed back on the number §0 supplied — so every line that fires now is one
that fired before this round began.

```
S5_WRITE_EXECUTION_WIRING_SEAL = YES
OPEN_S5_DEBT = production write smoke (deferred - rollback is non-deterministic, see above)
```

*(Recorded in S5-R8. The seal was reported in the round output and not written down here, which is the whole
difference between a claim and evidence — S5-R8's gate had to check it and found only my own turn text.)*
