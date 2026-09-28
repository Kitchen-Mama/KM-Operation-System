# S5-R2A — D-S5-1 acceptance and S5 decision freeze completion

**Base** `32e5541` · contract: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part III** ·
suite: `assets/tests/s5-r2a-contention-policy-freeze.test.js`

Spec-only. `BEHAVIOR_CHANGED = NO`.

```
D_S5_1 = FROZEN (SEQUENTIAL_GREEDY)    D_S5_2..D_S5_6 = FROZEN (unchanged)
UNRESOLVED_DECISION_COUNT = 0          S5_DECISION_FREEZE_COMPLETE = YES
S5_R1_CONTENTION_PREMISE = SUPERSEDED_BY_S5_R2_EVIDENCE
```

The operator accepted the already-live §41 policy. The proposed 50/50 split is rejected and is **not carried
as a branch** anywhere — not modelled, not stored, not mutated. No receiver-count-specific rule exists.

---

## The contract, and how it is tested

```
RECEIVER_SORT     = requiredByDate ASC -> allocationPriority DESC -> demandKey ASC
ALLOCATION_METHOD = SEQUENTIAL_GREEDY
DONOR_START_QTY   = releasableSurplusQty = MAX(0, initialFactoryAllocationQty - protectedFactoryQty)
RECEIVER_CAP      = eligible residual gap
```

The frozen rule is written as a **spec model** — the sort, then the greedy — and the live module is executed
beside it over every fixture. Agreement is the assertion.

That is deliberately stronger than a table of expected numbers. A table only proves the numbers someone typed;
a model proves the *rule*, and a mutant that breaks the model or the module must then produce disagreement.
It is also what lets §4's requirement be met honestly: **which receiver goes first is derived from the sort
contract, never from a name.** Each sort axis is proved on an input built so that only that axis can decide —
naming A the winner because it is called A would pass while proving nothing.

```
requiredByDate ASC decides        B (later-dated A loses)        model and live agree
allocationPriority DESC decides   B (priority 9 beats 1)         model and live agree
demandKey ASC tie-break           A (beats Z)                    model and live agree
stable under permutation          same set, any input order      identical result
```

## Worked examples — executed

| # | Donor | Gaps | Result |
|---|---|---|---|
| A | 100 | 100 · 100 | **100 / 0** |
| B | 100 | 20 · 100 | **20 / 80** |
| C | 100 | 20 · 30 | **20 / 30**, 50 unallocated |
| D | 101 | 100 · 100 | **100 / 1** |
| E | 100 | 100 · 100 · 100 | **100 / 0 / 0** |

**Example D settles the odd-quantity question Part II §18a raised.** That question existed only because a
proportional split must divide an odd number. A sequential greedy divides nothing — each receiver is capped at
its own residual and the remainder flows on. `ROUNDING_POLICY = NOT_APPLICABLE`.

## One algorithm at every receiver count

Proved two ways: running 0, 1, 2, 3 and 4 receivers against one model that contains no count branch, and
planting a count-specific branch at 2 as a mutant (E7, killed).

```
ZERO / ONE / TWO / THREE_PLUS  — all derive from SEQUENTIAL_GREEDY
```

## The finding: the donor cap is enforced three times

Found by two successive mutants that **survived**, not by reading the code.

1. `donorRemainingSurplus` — a term in the `MIN` inside `applyFeasibleReallocation`
2. `timelyTransferableQty` — the §41.5A pass-through, the **same** `avail`, in that same `MIN`
3. `df.releasableSurplusQty <= 0` — gates the donor loop, so an exhausted donor is skipped for the next receiver

Removing one changed nothing. Removing two changed nothing. Only removing all three over-allocates. So **a
single-guard defect in this function cannot over-allocate a donor** — a stronger safety property than the
contract asked for. It is now asserted in both directions: full removal over-allocates (E5), partial removal
still conserves (E5a).

This is the fifth round in this repository in which a defence turned out to be doubled.

## Invariants, measured

```
OVER_ALLOCATION = 0    RECEIVER_OVERFILL = 0    DOUBLE_CONSUMPTION = 0
DETERMINISTIC = YES    MARKETPLACE_IN_POOL_KEY = NO
duplicate lineage -> fails closed        negative gap -> fails closed (never clamped to 0)
donor's own allocated need protected     reserved / unallocated residual never enters the donor pool (§43.6)
```

## Suites

```
s5-r2a-contention-policy-freeze.test.js    59 passed / 0 failed    8 mutants killed / 8   (NEW)
s5-r2-decision-freeze.test.js              35 passed / 0 failed    6 mutants killed / 6   (rescoped)
s5-r1-recommendation-contract-freeze.test.js  99 passed / 0 failed 9 mutants killed / 9   (§7 guard re-run)
deterministic across 3 runs · no file written · tree clean
```

**The R2 suite was rescoped, not left to rot.** It previously carried the contention fixtures, a reference
model of the 50/50 split, and a pin on the divergence between them. With D-S5-1 resolved, the model and the
pin assert a branch the system does not have and a conflict that no longer exists — coverage for behaviour
nobody can reach. They were removed, the contention fixtures moved to the R2A suite that owns the algorithm
properly, and R2 now owns the frozen spec vocabulary alone. The split is recorded in both headers.

Mutants break the **live module** here, not only the model: a mutated copy is recompiled in memory
(`Module._compile`, nothing written) so the claim is that the shipped implementation enforces the rule, not
that my model is sensitive to it.

## Carried unchanged

```
D_S5_2 = { REALLOCATE, NEW_ORDER, NO_ACTION, MANUAL_REVIEW }   derived, stored nowhere
D_S5_3 = EXISTING_CANONICAL_CONSUMPTION_ORDER (§44.6 + §41.3)
D_S5_4 = 9 closed reason tokens + numeric evidence + lineage   FREE_TEXT_IS_AUTHORITY = NO
D_S5_5 = STATE_VOCABULARY_CHANGED = NO        D_S5_6 = DISPLAY_FLAG_ONLY

STORAGE_OWNER = flat-V2 drafts + order_planning_gap + recommendation_calculation_runs
NEW_TABLE_REQUIRED = NO   SCHEMA_EXTENSION_REQUIRED = NO   DB_MIGRATION_REQUIRED = NO
OVERSEAS_DOUBLE_SUBTRACTION = 0   FACTORY_DOUBLE_SUBTRACTION = 0
SHIPPING_REQUIRED_QTY_IS_PURCHASE_DEMAND = NO   PHASE2_ORCHESTRATION_IMPLEMENTED = NO
```

Three optional fields (`own_supply_qty_snapshot`, `overseas_supply_qty_snapshot`,
`committed_supply_qty_snapshot`) remain **proposed only** — listed again in Part III §38, not implemented.

`NEXT_TASK = S5-R3 — Recommendation schema / mapping + implementation plan`

---

## Sweep: a pre-existing intermittent in the browser-driver mutation suites

**The canonical failure set did NOT come back byte-identical, and that must not be reported as if it had.**

Two full sweeps were run on `1a67403`. Both returned **556 passed / 562** with **six** failing suites rather
than the canonical five — and the sixth was a **different suite each time**:

| run | sixth suite | surviving mutant | canonical 13 lines |
|---|---|---|---|
| 1 | `s4-r3-route-owned-code` | `G4 a partially loaded set is recorded as loaded` | all present |
| 2 | `s4-r7-final-seal` | `H1 the expand handler loads the second layer again` | all present |

The **13 canonical fail lines are intact in both runs**; the digest moved only because each run added two
extra lines from whichever suite flaked. The canonical five suites are stable.

**It is not this round's change.** The commit adds two node-only test files and two documents; neither suite
reads any of them. `s4-r3-route-owned-code` also reproduces the flake **standalone, with no sweep load at
all** — five consecutive runs gave four clean and one with a survived mutant.

**It is a timing intermittent in the headless-Chrome mutation probes**, the same class S4-R7 diagnosed and
partially fixed: a probe that measures at a moment which is quiet for the wrong reason. Worth stating plainly
— **S4-R7's `settle()` remediation reduced this but did not eliminate it**, and `H1` is one of the two mutants
that round specifically repaired. Under full-sweep load it still slips roughly one run in five.

**Not fixed here, deliberately.** This is a spec-only round with `BEHAVIOR_CHANGED = NO`, and the round's own
gate says not to reopen S3/S4 unless a deterministic regression blocks S5 work. This is neither deterministic
nor blocking. It is recorded as a bounded follow-up:

> `SWEEP_MUTATION_INTERMITTENCY` — the browser-driver mutation suites (`s4-r3-route-owned-code`,
> `s4-r7-final-seal`, and any sibling using the same probe pattern) need their mutant measurement points moved
> from "nothing in flight" to a proven-quiescent state, as S4-R7 did for its retry probes. Roughly 1 run in 5.
> An intermittently surviving mutant is worse than a failing one: it reads as coverage.
