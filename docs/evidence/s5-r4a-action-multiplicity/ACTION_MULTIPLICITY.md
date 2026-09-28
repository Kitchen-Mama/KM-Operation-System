# S5-R4A — D-S5-9 resolved: the combined action

**Base** `273af9a` · bounded completion of S5-R4 · `ACTION_PERSISTED = NO` · `DB_MIGRATION_REQUIRED = NO`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part VI, §60–§64**.

---

## The decision

Both truths are named. The enum gains `REALLOCATE_AND_NEW_ORDER`; `recommendationType` stays a single string,
not an array; the S5-R4 withhold is retired.

```
R and not N -> REALLOCATE        not R and N -> NEW_ORDER        R and N -> REALLOCATE_AND_NEW_ORDER
neither, and KMREC called the row NO_ACTION -> NO_ACTION         anything else -> MANUAL_REVIEW
```

Two asymmetries in that table are deliberate:

**`HAS_NEW_ORDER` must be KNOWN, not merely not-positive.** `totalRecommendedQty` is `null` when
units-per-carton could not be resolved. Calling that row `REALLOCATE` would assert that no order is needed, so
an unreadable order side is `MANUAL_REVIEW` whatever its reallocation says.

**A MISSING reallocation snapshot is never read as a zero.** It means §41 recorded nothing for this receiver,
so the action does not claim a reallocation. Absence removes a claim; it does not create an ambiguity, because
the order side is decided by fields that are present. That keeps *missing is never zero* intact without turning
every ordinary row into `MANUAL_REVIEW`.

## Two actions, two quantities, no third

```
REALLOCATION_QTY_OWNER = §41 reallocation_in_qty_snapshot    NEW_ORDER_QTY_OWNER = KMREC totalRecommendedQty
COMBINED_QUANTITY_FIELD_CREATED = NO
```

This is the specific hazard of naming two actions at once: someone adds the two numbers. They are not the same
kind of thing — one is supply **already assigned**, the other supply that must be **bought**. The suite asserts
no field of the DTO equals their sum, so an accidental `30 + 70 = 100` cannot appear unnoticed.

## Verified against the live allocator, not hand-made rows

| case | live `KMFSR` output | action |
|---|---|---|
| A | `in 30 · short 70 · SURPLUS_REALLOCATION_PARTIAL` | `REALLOCATE_AND_NEW_ORDER` |
| B | `in 30 · short 0 · SURPLUS_REALLOCATION_COVERED` | `REALLOCATE` |
| C | no reallocation, cartonized 60 | `NEW_ORDER` |
| D | nothing actionable | `NO_ACTION` |
| E | not READY | `MANUAL_REVIEW` |

The allocator already distinguishes `PARTIAL` from `COVERED` in its own `coverageReason`, so the new enum
member tracks a distinction the canonical owner had been making all along — it was being discarded at the gap
boundary, not invented here.

---

## The decision exposed a token defect

Case B came out as `REALLOCATE` carrying `NO_ACTION_REQUIRED` — self-contradictory on its face. The token's
evidence (`actionableGapQty <= 0`) is only about the **order** side; its name asserts that *nothing* is
required. Before D-S5-9 a reallocating row had no action at all, so the clash never surfaced.

That is exactly the fault D-S5-7 exists to prevent — a name asserting more than its evidence — so the token is
now emitted only when there is no reallocation either. The closed set stays at seven, and no
`REALLOCATE_AND_NEW_ORDER_REASON` was invented merely because the action exists.

```
REALLOCATE row tokens   FACTORY_SUPPLY_APPLIED · FACTORY_SURPLUS_REALLOCATION_APPLIED
combined row tokens     + RESIDUAL_SHORTAGE · NEW_ORDER_REQUIRED
idle row tokens         NO_ACTION_REQUIRED
TOKEN_WITHOUT_EVIDENCE_COUNT = 0
```

---

## Release: R27, and a token that deliberately did not move

§14 said not to assume either outcome. The rule is recorded in `63_` across five precedents:

> *"R22 has not shipped, so this is the SAME unshipped release with one more file in it — **and it takes a new
> id**"* · *"R23 is SUPERSEDED AS A CANDIDATE and may not be reused … the ruling recorded for R7, R10 and R11
> above, **each of them likewise never deployed**."*

Unshipped is explicitly not a licence to reuse. KMREC changed → bundle rebuilt → content hash moved → R26's
tree and this one differ. **R26 → R27**, carried by the same four owners.

The cache token did **not** rotate, and that asymmetry is reasoned rather than sloppy:

| axis | hazard | rule |
|---|---|---|
| release id | an id naming two trees cannot report a partial sync | never reuse, **including unshipped ids** |
| cache token | a browser keeps bytes it already holds | the **published** token must not be reused |

`s5r4-actionreason-20260928` has never been pushed — `origin` is still at `2b82288` — so nothing holds bytes
under it, and the bytes it will first serve are these. Rotating would re-stamp 60 references to remove a hazard
that does not exist. **This is a judgement call and is flagged as one**: if strict symmetry is preferred, it is
a one-line append plus a mechanical re-stamp.

```
RELEASE = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R27      FINAL_TOKEN = s5r4-actionreason-20260928 (unchanged)
APPS_SCRIPT_SYNC_SET = 90_generated_supply_planning_bundle.gs · 63_api_v1_system_health.gs ·
                       01_router.gs · 73_api_v1_pricing_write.gs
FRONTEND_DEPLOY_SET  = assets/js/core/supply-recommendation.js
```

---

## No consumer, and that is recorded rather than fixed

Nothing reads `recommendationAction` or `reasonTokens` — not a page, not a handler, not `KMREX`. §10 says to
record that rather than invent an integration, so the suite asserts it. S5-R5 owns the read model, and the
first real consumer will be a deliberate act rather than a drift.

```
STRICT_ACTION_CONSUMERS = 0   UNKNOWN_ACTION_CONSUMER_COUNT = 0   EXISTING_CONSUMER_REGRESSION_COUNT = 0
KMREC_CALLER_COUNT = 4        MANUAL_SCHEDULED_DERIVATION_DRIFT = 0
```

## Results

```
s5-r4-action-reason-derivation   92 passed / 0 failed   16/16 mutants
release-identity + KMREC/bundle suites   all exit 0      s5-r1..r3   exit 0

FILES_CHANGED = 9
  assets/js/core/supply-recommendation.js                   the derivation + the token correction
  assets/specs/.../90_generated_supply_planning_bundle.gs   rebuilt (deterministic)
  assets/specs/.../63_, 01_router.gs, 73_                   R27
  assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_...gs   activation pin -> R27
  assets/tests/_release-order.js                            R27 appended
  assets/tests/s5-r4-action-reason-derivation.test.js       extended
  2 docs

PRODUCTION_ROWS_WRITTEN = 0     SHIPPING_ACTION_COUNT = 0     ACTION_DETERMINISTIC = YES
```

## Sweep

```
559 passed / 564 · canonical 5 suites · 13 fail lines · DIRTY 0 · clean at end
CANONICAL_DIGEST = f809dca8d4e41954d98bb87ce0c2f9eb69c65fea9530acd030d639405bfc76b1
CANONICAL_FAILURE_SET_CHANGED = NO
```

Canonical on the first run, unlike S5-R4, which took three. The difference was method rather than luck: S5-R4
selected dependent suites by name and missed every release-identity gate, so this round ran the whole
release-identity set — the stamp suite, the manifest, the activation pin, the token series, the boot seal —
before committing, because those are the gates that react to a release cut and never mention the subject.

```
S5_ACTION_REASON_SLICE_FINAL_SEAL = YES
UNRESOLVED_DECISION_COUNT = 0     OPEN_S5_DEBT = none
NEXT_TASK = S5-R5 — Recommendation read-model + operator-facing integration
```
