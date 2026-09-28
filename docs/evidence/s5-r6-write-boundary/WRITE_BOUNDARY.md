# S5-R6 — operator decision → draft allocation / request order candidate + write boundary

**Base** `40e8f05` · pure mapping only · `PRODUCTION_ROWS_WRITTEN = 0` · `WRITE_PLAN_IS_PURE = YES`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part VIII, §74–§82**.

---

## The write owner was not the one the last round named

S5-R5 recorded `KMPR.applyPersistencePlanWithLock` as the next write owner. §1 required confirming
ownership rather than assuming it, and the answer is different: that function drives the **legacy line
tables**, and under the flat-V2 cutover MONTHLY_ORDER never reaches it. Every flat path — generate, edit,
submit, cancel — goes through one injected dep into `rpoFlatLockedApply_` (`24_:155`).

```
DRAFT_WRITE_OWNER = rpoFlatLockedApply_     RUN_WRITE_OWNER = KMRDV2P.applyFlat
WRITE_IDENTITY    = RD::MONTHLY_ORDER::<YYYY-MM>::<sorted scopeKey>
IDEMPOTENCY_RULE  = upsert on that id under {draft_version, userEditFingerprint}, revalidated UNDER the lock
```

Naming the wrong owner would not have been a cosmetic error: it would have sent the next round to add a
second write path beside the live one.

---

## What shipped: one pure function, and no second planner

`KMRDV2P.planOperatorDecision` decides whether an operator decision may become a write, and then calls
`planFlat` — which stays the only planner — to produce the plan. It reads no sheet, takes no lock, has no
clock, and derives neither the recommendation nor its staleness: both arrive as values.

Four refusals in a **frozen precedence**, so an operator who confirms a stale row is told the row is stale
rather than that they failed to confirm:

```
RECOMMENDATION_UNAVAILABLE  →  absent / unknown action. Missing is not NO_ACTION.
RECOMMENDATION_STALE        →  refuse; never a silent upgrade to newer values.
ACTION_AUTHORIZES_NO_ORDER  →  REALLOCATE · NO_ACTION · MANUAL_REVIEW
OPERATOR_AUTHORIZATION_REQUIRED → a visible recommendation is not an authorized one.
```

Every branch refuses, so the order changes the message and never whether a write happens. A mutant that
reorders it is killed.

---

## The finding: the number on screen is not the number to write

```
KMREC.totalRecommendedQty = cartonize(t1_gap + t2_gap + t3_gap) ONCE
draft.tN_recommended_qty  = order_planning_gap.tN_suggested_qty, each tier already cartonized
```

With `units_per_carton = 12` and gaps of 13 and 13 those are **36** and **48**. Adopting the displayed total
as a write value would not have been a convenience — it would have been a second quantity authority
persisting a different number than the live generation path persists for the same row. The gate never reads
it, and the suite exhibits the divergence rather than asserting the rule.

---

## There was no combined quantity to forbid

The flat 53-column draft has **no reallocation column at all**. The §41 transfer is already persisted by its
own owner in `order_planning_gap.reallocation_in_qty_snapshot`. So the two meanings are not competing for one
field: only the new-order meaning has a home here.

```
COMBINED_QTY_WRITTEN = NO     DECISION_REQUIRED = NO
```

A test lists every reallocation token inside the gate: two, and both are the flag that *declares none was
written*.

---

## Two release-identity gates found a stamp that had been marched twice

`fc-target-rule-release-stamp` and `controlled-no-action-activation-manifest` both failed, and the first one
was right about something older than this round.

`git log e583057..HEAD` on `01_router.gs` and `73_api_v1_pricing_write.gs` names three commits: the R25
pricing-receipt work, and then **two releases that edited nothing in those files but the stamp line**. R26 and
R27 marched them. A stamp records the round a file last changed; marching it to keep a gate green makes it
report the round a release was cut in, and then it can no longer distinguish a synced copy from a stale one —
which is the single thing it is for.

What forced the march was `C2`, which asserted *"01_router.gs IS the release — an action was routed"*. True of
R21. Still being demanded three releases later. **A gate written to catch marched stamps was the thing
requiring one.** It now asks whether the file changed, the same repair this suite's own header describes
making for the release literal.

The second half is a list that was answering two questions at once. R25 was the last release cut against a
shipped tree; R26, R27 and R28 have accumulated on it unshipped, so *"what must be copied"* and *"what changed
this release"* stopped being the same set. `RELEASE_CARRIED` is that partition — the same one
`GENERATED_OWNERS` already made for a file that is copied but never stamped.

Both stamps are back at **R25**, the round they last actually changed.

---

## Release

```
BACKEND_RELEASE = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R28   (R27 -> R28; R27 has not shipped, and that is not a
                  licence to reuse its id — the ruling recorded for R7, R10, R11, R22->R23 and R23->R24)
APPS_SCRIPT_SYNC_SET (cumulative, unshipped since R25) =
  90_generated_supply_planning_bundle.gs   sha256 1bdace5c2e48c6d56bc9563dfb2f27b5fa7b3c1bb1b098f512c0d3c6a3d37ea8   (generated — identified by hash, never stamped)
  63_api_v1_system_health.gs               R28  (changed THIS release)
  01_router.gs                             R25  (carried)
  73_api_v1_pricing_write.gs               R25  (carried)
FRONTEND_DEPLOY_REQUIRED = NO — no frontend byte changed this round
APPLICATION_TOKEN = s5r4-actionreason-20260928   TOKEN_ROTATION_REQUIRED = NO
```

---

## Data safety

The S5-R3 §52 classification is re-verified and unchanged: every table in this path is PRODUCTION, two of them
MIXED. `PRODUCTION_WRITE_AUTHORIZATION_REQUIRED = YES`, so no write test was performed and the proposed one is
stated rather than run. Every test runs against in-memory fixtures and an in-memory sheet set built from the
real `V2_HEADERS`.

---

## Results

```
s5-r6-write-boundary-mapping   112 passed / 0 failed   12/12 mutants
IMPLEMENTATION_CLASS = C — pure mapping ready; write execution blocked on operator authorization
```

## Sweep

```
SWEEP 561 passed / 566   canonical 5   DIRTY 0   WORKTREE_CLEAN_AT_END = YES
CANONICAL_DIGEST = 596eeb6448f3911ff876a3f7c21606e747a4892f43df9fa7c4186830ed9069ba
CANONICAL_FAILURE_SET_CHANGED = NO   (the same five suites as S5-R5)
```

566 rather than 565 because this round added one suite.

**The canonical line count moved from 13 to 19, and none of the six is new.** They all come from
`positive-residual-and-submit-readiness-census`, a suite that was already failing before this round. The
previous sweep harness did not capture its FAIL lines; this one does. Rather than assume that, the suite was
run at `40e8f05` in a detached worktree and at `3a0ec04` here, and the two outputs are byte-identical:

```
M1a a live positive-residual world is READY_TO_AUTHORIZE      M3f named individually rather than counted
M1b with no condition unmet                                   M4a and the deployment build is the one ...
M3e and no field is unknown or unreadable                     M5  a BEFORE baseline was frozen
```

A digest that changes because the instrument improved is not the same thing as a regression, and the only way
to tell them apart is to run both trees.

```
S5_WRITE_MAPPING_SLICE_SEAL = YES
OPEN_S5_DEBT = the write EXECUTION slice is unwired by design — planOperatorDecision reaches no route yet
NEXT_TASK = S5-R7 — operator authorization for a bounded production write, then wiring
```
