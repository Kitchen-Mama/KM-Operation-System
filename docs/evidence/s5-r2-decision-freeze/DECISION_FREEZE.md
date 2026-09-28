# S5-R2 — Recommendation business decision freeze

**Base** `a119b62` · contract: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part II** ·
suite: `assets/tests/s5-r2-decision-freeze.test.js`

Spec round. `BEHAVIOR_CHANGED = NO`.

```
D_S5_1_DONOR_CONTENTION      = CONTRACT_CONFLICT — STOPPED
D_S5_2_RECOMMENDATION_ACTION = FROZEN     D_S5_3_PRIORITY   = FROZEN
D_S5_4_EXPLAINABILITY        = FROZEN     D_S5_5_STATE      = FROZEN (unchanged)
D_S5_6_STALENESS             = FROZEN (display-flag only)

UNRESOLVED_DECISION_COUNT = 1      S5_DECISION_FREEZE_COMPLETE = NO
```

---

## The finding: S5-R1 asked D-S5-1 on a false premise

S5-R1 wrote that §32A fixes per-pair eligibility and §41 fixes donor protection *"but neither arbitrates
between two eligible receivers competing for the same surplus."* **That was wrong**, and the operator chose a
rule without this on the table.

`KMFSR.runReallocation` (`supply-planning-surplus-reallocation.js:169-231`) arbitrates explicitly — a
**sequential greedy over N receivers**, ordered `requiredByDate` asc → `allocationPriority` desc → `demandKey`
asc, each receiver served in full before the next. It is live: `43_:762` → `43_:557`, landed by FA-3B3b.

S5-R1 read §41's prose, which fixes donor protection and per-pair feasibility, and did not read the loop —
where the contention rule actually lives, and which the prose never states. That is the same
comments-and-prose-are-not-code failure this repository has hit before, one layer up.

## The divergence, measured against the operator's own examples

The live module was executed, not described:

| Case | Operator §3 | Live §41 | Agree |
|---|---|---|---|
| donor 100 · A 100 · B 100 | **50 / 50** | **100 / 0** | **NO** |
| donor 100 · A 20 · B 100 | 20 / 80 | 20 / 80 | yes |
| donor 100 · A 20 · B 30 | 20 / 30 (50 unused) | 20 / 30 (50 unused) | yes |

**The two agreements are coincidental to the shape, not structural.** Case 3 has no contention at all. Case 2
agrees only because A's gap sits below its 50% share. The rules differ exactly where contention is real —
donor below combined gap with both gaps above half — which is the case §3 exists to legislate.

`DIVERGENT_CASES = 1 / 3`, and that one disagreement is what backs `UNRESOLVED_DECISION_COUNT = 1`.

## Two things found by running the rule rather than reading it

**Three-plus receivers is already owned.** Executed: donor 100, gaps 100/100/100 → live returns
`{A:100, B:0, C:0}` — deterministic, no error, no manual-review path. The task's default
(`>2 → MANUAL_REVIEW`) applied without checking would have **specified a regression**: withdrawing a working,
tested answer and replacing it with a stop.

**The §3 rule is under-specified for odd quantities.** Donor 101 with two gaps of 100: FLOOR gives 50 each and
the leftover unit goes to whichever receiver the loop reaches first. §3 names no receiver ordering, so that
unit's destination is an artefact of iteration order. Not a rounding question — §43 answers that — but the
same ordering gap that makes §3 silent at 3+. The live greedy already has a tie-break; a proportional rule
would need one too.

## What was frozen

**Action (§22)** — closed set of four: `REALLOCATE · NEW_ORDER · NO_ACTION · MANUAL_REVIEW`. No shipment
action (other mainline), no factory action (coverage is evidence, not an instruction). Derived by an ordered
rule, `MANUAL_REVIEW` first, `REALLOCATE` before `NEW_ORDER`. A line that reallocates *and* still needs an
order is `REALLOCATE` with a non-zero quantity and both residual tokens — so the single label loses nothing.
**Stored nowhere.**

**Priority (§23)** — `EXISTING_CANONICAL_CONSUMPTION_ORDER`, owner §44.6 composed with §41.3. The
recommendation creates no second optimization order; the only place it could diverge is receiver contention,
which is why that is a STOP rather than a freeze.

**Explainability (§24)** — closed nine-token set, every token gated on its own numeric evidence, so none can
claim what the numbers do not support. A field with no honest source is null and its token is absent.
`FREE_TEXT_IS_AUTHORITY = NO`; the operator `note` stays the operator's and no business behaviour reads it.

**State (§21)** — unchanged. **Staleness (§21)** — derived at read time, never stored, so `CURRENT`/`STALE`
cannot collide with the frozen vocabulary.

## Storage — the conclusion survived the model getting richer

```
STORAGE_OWNER = request_order_allocation_drafts (flat V2) + order_planning_gap + recommendation_calculation_runs
NEW_TABLE_REQUIRED = NO        SCHEMA_EXTENSION_REQUIRED = NO for Phase 1 as specified
```

Action, reason tokens and staleness are all **derived**, so classification **B — derived read model only**.

And `factory_supply_used` needs no column either: the live identity at `43_:566` is
`factoryCoveredQty = MAX(0, initial − out + in)`, and all three inputs are already persisted columns. That is
transport arithmetic over stored facts — it reproduces the producer's own line rather than deriving coverage a
second way.

Genuinely unexposed, computed then dropped at the `order_planning_gap` boundary: `own_supply_used`,
`overseas_supply_used`, `committed_supply_used`. Three additive columns are **proposed only** in Part II §26,
following the `OP_GAP_FACTORY_SNAPSHOT_COLS_` precedent. `DB_MIGRATION_REQUIRED = NO`.

`committed_supply_used` carries a caveat worth keeping: a PO line with a blank `expected_completion_date`
fails closed as `ONGOING_ORDER_ETA_UNRESOLVED` and contributes zero timed incoming while staying admitted. The
exposed total must mean *"committed supply timed into this window"*, not *"committed supply that exists"*.

## Suite

```
s5-r2-decision-freeze.test.js    103 passed / 0 failed    9 mutants killed / 9
s5-r1-recommendation-contract-freeze.test.js (§2 re-run)   99 passed / 0 failed   9 / 9
deterministic across 3 runs · writes no file · leaves the tree clean
```

Ten §16 fixtures executed against the live module, each checked for conservation, no overfill, and donor
protection; plus fail-closed proof for a negative gap and for the same lineage presented twice.

One mutant was **inert on its first version** and was replaced rather than banked: it flipped a filter to
`predicate !== false`, but `null > 0` is already `false`, so the "loose" set was identical to the honest one.
The realistic defect — coercing a MISSING field to `0` and testing `>= 0` — is what it plants now.

## What the operator owns

**D-S5-1.** Option A keep the live greedy (no change, no regression, N receivers covered — and what S5-R1
recommended). Option B adopt §3's 50/50, which changes a frozen §41 core with 369 existing assertions,
re-validates FA-3B3b's live wiring, records an explicit §43.4 override, and must name a receiver ordering.
Option C split by residual gap, which generalises to N but is a larger change still. **Recommended: A**, and
if sharing under scarcity is wanted, take it as its own slice with its own regression budget.
