# S5-R4 — recommendation action + evidence-backed reason derivation (Slice A)

**Base** `2b82288` · first S5 production-runtime slice · additive only
`DB_MIGRATION_REQUIRED = NO` · `ACTION_PERSISTED = NO` · `REASON_TOKENS_PERSISTED = NO`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part V, §54–§59**.

---

## The gate question was answered by running the allocator, and the answer blocks a branch

§4 required establishing, before implementing, whether `REALLOCATE` and `NEW_ORDER` can truthfully coexist.
They can. The live §41 allocator already has a name for it — `SURPLUS_REALLOCATION_PARTIAL`
(`supply-planning-surplus-reallocation.js:253`), sitting in the same `coverageReason` ladder as
`SURPLUS_REALLOCATION_COVERED`. Partial coverage is an expected outcome, not an edge case.

Measured, not argued:

```
A needs 100, holds 0 factory   ->  reallocatedIn 30 · remainingShortage 70 · SURPLUS_REALLOCATION_PARTIAL
B needs 0,   holds 30 factory  ->  reallocatedOut 30 · remainingShortage 0 · DONOR_SURPLUS_RELEASED
```

Flattened to the gap grain KMREC reads, receiver A is **one row** carrying `reallocation_in_qty_snapshot = 30`
and a positive order need of 70.

```
ACTION_MULTIPLICITY_DECISION_REQUIRED = YES
```

So `REALLOCATE` is **not emitted**. Picking either label would hide the other half of the truth, and inventing
an array would contradict a frozen contract that expects one action per row.

**This also corrects my own S5-R3 §45**, which proposed evaluating `REALLOCATE` before `NEW_ORDER` and defended
it as "the reallocation is the part that must be acted on first". That is exactly the silent primary choice §4
rules out. The precedence rule is withdrawn; it was never implemented.

Three things make the withholding honest rather than a hole:

- **It is typed.** `recommendationActionUnavailableReason = 'ACTION_MULTIPLICITY_DECISION_REQUIRED'`, following
  the owner's own existing `totalUnavailableReason` shape.
- **It is one rule.** Withheld whenever `reallocation_in_qty_snapshot > 0`, including when the reallocation
  fully covered the need — emitting `REALLOCATE` only for the covered case would quietly redefine the enum
  member as "reallocation was sufficient", which is not what it means.
- **Nothing is lost.** Tokens are evidence, not verdict, so a contended row emits its full evidence
  (`FACTORY_SUPPLY_APPLIED`, `FACTORY_SURPLUS_REALLOCATION_APPLIED`, `RESIDUAL_SHORTAGE`, `NEW_ORDER_REQUIRED`).
  Only the single-label verdict waits for an operator.

---

## Quantity safety was captured, not asserted

Every fixture ran through the module **as committed at `2b82288`** (`git show`, compiled in memory) and through
the working tree, comparing every pre-existing key:

```
fixtures 10 · CHANGED_PRE_EXISTING_KEYS 0 · ADDED_KEYS 3 · UNEXPECTED_ADDED_KEY_COUNT 0
RECOMMENDATION_QTY_PRE == RECOMMENDATION_QTY_POST = IDENTICAL
OVERSEAS_DOUBLE_SUBTRACTION = 0    FACTORY_DOUBLE_SUBTRACTION = 0
```

The decoration runs **after** the quantity build, so it structurally cannot alter a number it only reads.
`factory_supply_used` gates a token and never enters an arithmetic path — which is what keeps DC-1 closed.

---

## Three probes of mine were wrong, and one of my code paths was dead

| probe | claimed | actually |
|---|---|---|
| `G1` | the derivation assigns no quantity | the regex `=` matched `===`, so it was flagging *comparisons*. A probe that cannot tell a comparison from an assignment is not checking what it claims. |
| `J1` | removing the `NO_ACTION` branch is observable | **it was not** — the final fallback also returned `NO_ACTION`, so the branch could be deleted with no effect |
| `J7` | replacing the order filter with `Object.keys()` changes the order | **inert** — today's emit branches happen to fire in declaration order |

**J1 was a code defect, not just a test defect.** A branch whose deletion changes nothing is dead weight. The
fallback now fails **closed** to `MANUAL_REVIEW`: reaching it means READY, no reallocation, and a total that is
neither null nor positive — a contradictory row. Reporting "nothing to do" for a row nobody can explain is the
dangerous answer.

**J7 was retargeted rather than banked.** The load-bearing guarantee is that the *declaration* drives the
order, so the declaration is what gets mutated — two adjacent members swapped, same set, different order. A
first attempt reordered the whole array and dropped members, which changes *what* is emitted, not the order of
it, and proves nothing about ordering. The honest note stays in the test: `Object.keys()` is inert today.

---

## The release identity, and the three passes it took to get right

KMREC ships **twice** — browser-served from `index.html` and bundled verbatim into Apps Script — and that one
fact drove everything below. The full sweep had to run three times; each run found something the previous
dependent-suite selection had missed, because these gates live in suites that never name KMREC.

### The rebuild was not optional, and it forced a release cut

`H9` and `B5` require the committed bundle to be byte-reproducible from the approved builder, so a changed core
module **must** be rebuilt. Deferring would also have left the SCHEDULED path calling the old derivation while
the manual path called the new one — the exact drift this slice forbids. From there the chain is forced:

```
bundle rebuilt -> content hash moved -> 63_ declares that hash, so 63_ changed
              -> E4: a changed manifest owner must move its own stamp
              -> E2: 63_'s two symbols must agree
              -> A4: the declared release must be the newest owner stamp
```

The repo had already ruled on this for R23: *"an id naming two different trees cannot answer the question it
exists for."* R25 is unshipped — the ledger records the deployed backend still at **R13** — and this is not
R25's tree, so the in-flight batch becomes **R26** and its owners carry it. Marching `01_`/`73_` is not the
fault `C1` forbids: editing a stamp is a change to the file, so file and stamp land in the same commit, and
both are owners of the same undeployed batch.

### Four things I had wrong

| what | I did | what was true |
|---|---|---|
| cache token scope | invented a bespoke per-file token | the repo keeps **one append-only list**; the newest entry IS the current token and a round rotates the whole family. S4-R7 changed 7 source files and rotated **51** tokens |
| where tokens live | rotated `index.html` only | 8 more are route assets inside `app.js` — same family, different loader |
| token shape | `s5r4-action-reason-20260928` | the series is `^[a-z0-9]+-[a-z0-9]+-\d{8}$` — two segments, not three. A three-segment token is unrecognisable as application-family |
| generated artifacts | added `90_` to `RELEASE_OWNERS` | its identity is a content **hash**, so `C3` can never see it — that fixed `I1` and broke `C3`. It needs its own list |

The generated-owner repair follows the suite's own precedent: it had already met this shape once and answered
by **partitioning** (a deletion is not a copy) rather than widening the expected set. So `GENERATED_OWNERS` is
checked by `I1`, which is about copying, and excluded from `C3`, which is about stamps.

### Gates that were right, and seals that were not

`live-inventory-render §1.6` and `controlled-no-action BP3/P7c` were **correct** — a manifest hash and an
activation pin that lag the release refuse a healthy deployment. Both moved with the release.

Four probes were seals on a *spelling* rather than on behaviour, and each was rebuilt to derive from the
declaration:

| probe | was | now |
|---|---|---|
| `recommendation-generation` B2 | grepped the literal stamp `kmrec-fm6r1-1` | derives from the loaded module — proves the bundle carries the **current** KMREC |
| `fc-summary` E9 | hardcoded the bundle hash to assert *that round* did no rebuild | asserts manifest and bundle **agree**, the shape `E8.3` uses three lines above |
| `s4-r7` G5 | `currentAppToken() === 's4r7-finalseal-20260927'` | `tokenAtOrAfter(...)` — the series may move forward, never back |

`s4-r7 G5` is worth naming: `_release-order.js` exists *because* four suites had pinned a literal token and
"would have failed the first time an APPLICATION round legitimately moved it". S4-R7 re-introduced that exact
defect one round later, and mine was the round that hit it.

One probe error — `product-strategy-final-usability` L4 failing to open a 110 KB file that is present — did not
reproduce and is recorded as transient rather than explained away.

---

## Results

```
s5-r4-action-reason-derivation   74 passed / 0 failed   10/10 mutants
every release-identity and KMREC/bundle-dependent suite   exit 0
s5-r1 · s5-r2 · s5-r2a · s5-r3   exit 0

FILES_CHANGED = 16
  assets/js/core/supply-recommendation.js                   the slice
  assets/specs/.../90_generated_supply_planning_bundle.gs   rebuilt (deterministic)
  assets/specs/.../63_api_v1_system_health.gs               bundle hash + release id + own stamp
  assets/specs/.../01_router.gs, 73_api_v1_pricing_write.gs owner stamps -> R26
  assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_...gs   activation pin -> R26
  index.html (52 tokens), assets/js/app.js (8 route assets)
  assets/tests/_release-order.js                            token appended to the series
  4 test suites: 1 new, 3 seals repaired
  2 docs

RECOMMENDATION_OWNER_COUNT = 1    SECOND_CALCULATION_PATH_COUNT = 0
SHIPPING_ACTION_COUNT = 0         PHASE2_ORCHESTRATION_IMPLEMENTED = NO
PRODUCTION_ROWS_WRITTEN = 0       EXISTING_CONSUMER_REGRESSION_COUNT = 0
MANUAL_SCHEDULED_DERIVATION_DRIFT = 0
```

## Release

```
IS_KMREC_BROWSER_SERVED = YES     IS_KMREC_APPS_SCRIPT_RUNTIME = YES
RELEASE   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25 -> R26   (R25 unshipped; deployed backend still R13)
FRONTEND_DEPLOY_REQUIRED  = YES
TOKEN_ROTATION_REQUIRED   = YES   FINAL_TOKEN = s5r4-actionreason-20260928
APPS_SCRIPT_SYNC_REQUIRED = YES
APPS_SCRIPT_SYNC_SET      = 90_generated_supply_planning_bundle.gs · 63_api_v1_system_health.gs
                          · 01_router.gs · 73_api_v1_pricing_write.gs
                          (TEMP_AI_PLAN_ACTIVATION_CENSUS is a diagnostic, synced only if in use)
DB_MIGRATION_REQUIRED     = NO
```

## Sweep

```
run 1   8 suites · 20 lines · digest changed   release identity: token family, generated owner, stamps
run 2   9 suites · 20 lines · digest changed   token SHAPE, activation pin, s4-r7 self-seal
run 3   559 passed / 564 · canonical 5 · 13 lines · DIRTY 0 · clean

CANONICAL_DIGEST = f809dca8d4e41954d98bb87ce0c2f9eb69c65fea9530acd030d639405bfc76b1
CANONICAL_FAILURE_SET_CHANGED = NO
```

564 rather than 563 because this round added one suite. Every failure across runs 1 and 2 was a release-identity
gate doing its job on my own change — none was a pre-existing defect, and none was worked around.

The lesson is the same one S5-R2B recorded and I repeated here: **choosing dependent suites by name misses the
gates that never mention your subject.** I selected suites naming KMREC, the bundle or the builder; every
failure came from suites naming none of them. Only the sweep finds those, and only running it to green proves
anything.

```
S5_ACTION_REASON_SLICE_SEAL = YES
OPEN_S5_DEBT = D-S5-9 ACTION_MULTIPLICITY — operator decision required
NEXT_TASK = operator decision on D-S5-9, then S5-R5 — read-model + operator-facing integration
```
