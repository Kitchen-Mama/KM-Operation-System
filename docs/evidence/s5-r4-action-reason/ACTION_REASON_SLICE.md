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

## Two spelling seals collided with a legitimate rebuild

KMREC ships **twice** — browser-served at `index.html:479` and bundled verbatim into Apps Script — so the
bundle was rebuilt. Two suites then failed, and they were not the same kind of failure:

**`live-inventory-render-…-r4b-r3` §1.6 was RIGHT.** It refused a bundle whose content hash no longer matched
the `63_` manifest — precisely the half-synced deployment it exists to catch. The manifest's expectation moved
with the bundle, in the same commit.

**Two others were seals on a spelling**, and both were repaired using a pattern already in the repo:

| probe | was | now |
|---|---|---|
| `recommendation-generation` B2 | grepped the literal stamp `kmrec-fm6r1-1` to prove KMREC is bundled — so any stamp bump breaks a test whose subject is bundling | derives the expected stamp from the loaded module, proving the bundle carries the **current** KMREC, not merely some KMREC |
| `fc-summary-workspace-slices` E9 | hardcoded the bundle hash to assert *that round* performed no rebuild | asserts manifest and bundle **agree**, derived from both declarations — the same shape `E8.3` three lines above already uses for `01_router.gs` |

E9's original claim is about a release that shipped long ago and cannot be re-verified from today's tree; as a
permanent seal it would fail every future round that legitimately rebuilds. Both replacements are strictly
stronger and never need editing again.

---

## Results

```
s5-r4-action-reason-derivation   74 passed / 0 failed   10/10 mutants
dependent suites (every suite naming KMREC, the bundle, or the builder)   all exit 0
s5-r1 · s5-r2 · s5-r2a · s5-r3   all exit 0

FILES_CHANGED = 7
  assets/js/core/supply-recommendation.js            the slice
  assets/specs/.../90_generated_supply_planning_bundle.gs   rebuilt (deterministic: same hash twice)
  assets/specs/.../63_api_v1_system_health.gs        manifest hash moved with the bundle
  index.html                                         cache token rotated, that one file only
  assets/tests/s5-r4-action-reason-derivation.test.js   new
  assets/tests/recommendation-generation-f1-4b-fm6.test.js   seal repaired
  assets/tests/fc-summary-workspace-slices-r3-r1.test.js     seal repaired

RECOMMENDATION_OWNER_COUNT = 1    SECOND_CALCULATION_PATH_COUNT = 0
SHIPPING_ACTION_COUNT = 0         PHASE2_ORCHESTRATION_IMPLEMENTED = NO
PRODUCTION_ROWS_WRITTEN = 0       EXISTING_CONSUMER_REGRESSION_COUNT = 0
MANUAL_SCHEDULED_DERIVATION_DRIFT = 0
```

## Release

```
IS_KMREC_BROWSER_SERVED = YES     IS_KMREC_APPS_SCRIPT_RUNTIME = YES
FRONTEND_DEPLOY_REQUIRED  = YES
TOKEN_ROTATION_REQUIRED   = YES   FINAL_TOKEN = s5r4-action-reason-20260928
APPS_SCRIPT_SYNC_REQUIRED = YES
APPS_SCRIPT_SYNC_SET      = 90_generated_supply_planning_bundle.gs · 63_api_v1_system_health.gs
DB_MIGRATION_REQUIRED     = NO
```

Only the changed file's token moved. `atomic-release-cache-identity-f1-7n-fc-1a-r1-hf1` records the failure
that avoids — a round that *"measured the token it had moved rather than the files it had changed"*.

```
S5_ACTION_REASON_SLICE_SEAL = YES
OPEN_S5_DEBT = D-S5-9 ACTION_MULTIPLICITY — operator decision required
NEXT_TASK = operator decision on D-S5-9, then S5-R5 — read-model + operator-facing integration
```
