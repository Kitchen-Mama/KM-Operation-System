# S5-R8 — Ordering mainline closing / integration readiness seal

**Base** `7d2e54b` · closing audit · no production write · no new business rule · no schema change

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part X, §92–§98**.

---

## The gate found a claim with no evidence behind it

§0 asked to verify `S5_WRITE_EXECUTION_WIRING_SEAL = YES`. It was reported in the S5-R7A turn output and
**never written into the repo** — so the only thing supporting it was my own message. It is recorded now, in
the R7A evidence where it belongs. That is the whole difference between a claim and evidence, and a gate that
reads the repository rather than the transcript is what exposed it.

Everything else the gate asked for verified: all prior seals present, canonical digest
`596eeb64…` reproducing from the five canonical suites alone, worktree clean.

---

## The seal is a suite, not a paragraph

`s5-r8-ordering-mainline-seal` asserts the chain rather than a slice: ten stages, each with one owner, no
second calculation or write path, the quantity authorities distinct, the action matrix covering the enum
exactly, and the shipping boundary intact.

It pins a NAME in exactly one place, because there the name is the constraint:
`KMPR.applyPersistencePlanWithLock` drives the legacy line tables and MONTHLY must never reach it. Confusing
those two is the mistake S5-R5 made; it is now a test rather than a memory. Everywhere else the claim is
singularity, so a future rename is not a regression.

```
s5-r8-ordering-mainline-seal   69 passed / 0 failed   7/7 mutants
```

Two of my own probes were defective and are recorded rather than quietly fixed: `H1` asserted a regex that is
always false and then re-read the unmutated file, so it could not fail; and `H6` used a partial decision input
and died inside `planFlat` on a missing scope, testing the wrong thing. Counting planner definers is now a
function of source text, so a mutant can be handed to the same probe.

---

## The correction this round owes on the deploy set

§12 asked for the sync set derived from the **last deployed baseline**. That is not the base the previous
rounds measured from.

```
last recorded production evidence   build_id R13 at commit 3249749
release-identity base used by R6/R7A   e583057 ("R25 starts here")
```

Both answers were true about what they claimed. The five-file set the per-round reports named is correct *since
R25*; the operator's actual sync list is measured *since what production holds*:

```
APPS SCRIPT   12 to copy, 1 to delete   (five were reported; seven more plus a retirement were not)
  01_ · 04_ · 14_ · 20_ · 47_ · 58_ · 59_ · 63_ · 72_ · 73_ (new) · 90_
  DELETE TEMP_migrate_fc_target_rules_header_r2ba2.gs
FRONTEND      46 files — index.html, 6 stylesheets, 39 js modules and pages
```

An operator following the per-round reports alone would have copied five files and been short seven. The
reports were answering the release-identity question while the operator needs the deployment question, and
only this closing round was asked for the second.

**And the limit on it**: the ledger records what was entered. It cannot prove R14–R24 were never deployed
without an entry. Read this as what the ledger supports, not as a claim about the live project — only the
operator knows what was actually pasted.

---

## What is carried forward, and why none of it blocks

```
DEFERRED_TO_POST_S7_FATIGUE   production write smoke · large S5 fatigue
DEFERRED_TO_PHASE2            the eleven D-S5-8 snapshot fields (incl. day-precision required_by_date and
                              starting_gap_qty reconstruction) · physical cross-company reservation §41.1
NOT S5, CARRIED               the pre-existing A0 §G.9 label-ban hit at carrier-rate-card.js:840
BLOCKING_DEBT                 none
```

The production smoke is deferred for a structural reason, not a scheduling one: **the canonical write owner has
no delete**, so no bounded test can restore the exact pre-state. That was established in R7A and is unchanged.

The eleven deferred fields are the only debt a test could let back in silently, which is why `s5-r3 §J3` pairs
each withdrawn token with its evidence column in both directions — if a column ever lands, the suite fails
until its token returns. The withdrawal reverses itself rather than waiting for someone to remember.

---

## Results

```
S5 suites          R1 · R2 · R2A · R3 · R4/R4A · R5 · R6 · R7A · R8   all green
dependent          89 Request Order / Flat-V2 / Recommendation / performance suites, 0 failing
FOCUSED            69/0      MUTATION  7/7
```

## Sweep

```
563 passed / 568   canonical 5   19 lines   DIRTY 0   WORKTREE_CLEAN_AT_END = YES
CANONICAL_DIGEST = 596eeb6448f3911ff876a3f7c21606e747a4892f43df9fa7c4186830ed9069ba
CANONICAL_FAILURE_SET_CHANGED = NO — byte-identical to the §0 baseline
```

Canonical on the first run, which is what a closing round should look like: 568 rather than 567 because this
round added one suite, and not one line moved.

```
S5_READY_FOR_INTEGRATION = YES
S5_LARGE_FATIGUE_DEFERRED = YES
FUTURE_FATIGUE_GATE = POST_S7_SYSTEM_FATIGUE_AND_WRITE_VALIDATION
NEXT_TASK = S6-R1 — Shipping / Inventory Execution mainline contract audit
```
