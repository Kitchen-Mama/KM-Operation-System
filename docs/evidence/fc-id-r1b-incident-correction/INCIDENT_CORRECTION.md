# FC-ID-R1B — CA / Amazon `marketplace_id`: the incident, corrected

**Base** `6adf2e5` · diagnostic correction only · `PRODUCTION_ROWS_WRITTEN = 0` · `S6_BEHAVIOR_CHANGED = NO`

Suite: `assets/tests/fc-id-r1b-registry-hydration-incident.test.js` — 39 passed / 0 failed, 4/4 mutants.
Supersedes the **incident** conclusion of `docs/evidence/fc-id-r1-marketplace-id/ROOT_CAUSE.md`.
No marketplace row was added. No backfill was run.

---

## The correction

```
CA_MARKETPLACE_MASTER_MISSING = NO
CA_CANONICAL_MARKETPLACE_ID = MKT-RESTW-CA-AMAZON     (ResTW · CA · Amazon · active)
UK_CANONICAL_MARKETPLACE_ID = MKT-RESTW-UK-AMAZON     (the control)

FC_ID_R1_MECHANISM_PROVEN     = YES   — unchanged, and re-proved here
FC_ID_R1_INCIDENT_ROOT_CAUSE  = NOT_PROVEN — "master data missing" is DISPROVEN
```

R1 proved a mechanism and then attached the wrong incident cause to it. The mechanism stands: the picker is
built from the registry **∪** `fc_regular_forecast`, while `_evtResolveMarketplaceId` reads the registry alone.
What was wrong was the assumption about *why* the registry lacked the row — I inferred absence from the sheet
when the real candidate is absence from the **runtime model**.

Every fixture in the new suite **contains the real CA row**, and a blank id is still produced. That is the
discriminator the task asked for:

```
BLANK_ID_SAVE_REPRODUCED_WITH_EXISTING_MASTER_ROW = YES
```

---

## What the registry actually is, and why it can be missing while the page looks fine

```
REGISTRY_VARIABLE    _fcReadModel.marketplaces
REGISTRY_LOAD_OWNER  _fcSliceFetch_(FC_SLICE_.BOOTSTRAP)          — the PRIMARY page read
REGISTRY_API_ACTION  KM.api.getWorkspace('fcSummary', { include: { slice: 'bootstrap' } })
REGISTRY_TABLE       marketplaces                                  (58_ slice spec, emits fcTargetRules + marketplaces)
REGISTRY_CACHE_OWNER _fcGetMarketplaces() — read model first, then the broad cache in Legacy mode
REGISTRY_FAILURE     Workspace mode: accessor returns []. `_fcHas_` distinguishes unread from empty —
                     but only for the CALLER that asks; the resolver does not ask.
PICKER_CAN_HAVE_SITE_WHILE_REGISTRY_MISSING = YES
```

The registry lives in the **bootstrap** slice. The forecast rows that feed the picker live in the **regular**
slice. They are fetched and fail independently, which is what makes a mixed-freshness state reachable at all:

```
_FC_SLICE_KEYS_   bootstrap: ['fcTargetRules', 'marketplaces']      regular: ['fcRegularForecast']
```

And the Special Event builder never waits for the registry:

```
_FC_PREREQ_TABLES_.event = ['sku_details', 'marketplace_skus', 'campaigns']      ← no `marketplaces`
proceedToFcMode gates on  _fcPrereqNeeded_ + _fcBaseFcSourceMissing_             ← neither mentions it
_fcPrereqAndSources_ awaits prerequisites + Base FC + Special Events             ← none of them is it

REGISTRY_READINESS_REQUIRED_BEFORE_SAVE = NO
CURRENT_UI_ENFORCES_REGISTRY_READY      = NO
HYDRATION_RACE_REACHABLE                = YES
MIXED_REFERENCE_FRESHNESS_ALLOWED       = YES
SECOND_ENTRY_REFRESHES_MARKETPLACES     = NO — it is in neither prerequisite list, so re-entry cannot repair it
```

---

## The four scenarios, executed

| | state | CA selectable | resolved id |
|---|---|---|---|
| **1 healthy control** | bootstrap + regular landed | yes | `MKT-RESTW-CA-AMAZON` |
| **2 registry unread** | bootstrap absent, regular landed | **yes** | **`''`** |
| **2b registry empty** | bootstrap landed carrying `[]` | **yes** | **`''`** |
| **3 timeout then Retry** | Retry lands bootstrap | yes | `MKT-RESTW-CA-AMAZON` |
| **4 second entry** | failed registry survives — not in any prerequisite list | yes | `''` |

Scenario 3 is the one worth dwelling on: **Retry is the cure, and the operator skipped it.** That is not a
criticism of the operator — nothing in the flow made Retry necessary, because Next did not depend on the thing
Retry would have fixed.

---

## Where I have to stop short, and why it matters

§5C sets a seven-condition bar. Six are proven outright:

```
1 canonical CA row exists                                   PROVEN (operator evidence)
3 operator can continue without a successful Retry          PROVEN (no gate in the chain)
4 CA / Amazon remains selectable                            PROVEN (scenarios 2, 2b, 4)
5 resolver returns blank                                    PROVEN
6 Save accepts the blank                                    PROVEN (client sends it; 14_ writes it)
7 healthy / retried control resolves the id                 PROVEN (scenarios 1, 3)
```

**Condition 2 is proven as a system property and NOT as a description of that session**, and one piece of the
operator's own evidence argues against the simplest version of it.

The message reported was *"Prerequisite data could not be loaded."* That is `FC_MSG_.PREREQ_FAILED`, raised by
`_fcShowPrereqRefusal_` for the **builder prerequisite** loader — `sku_details`, `marketplace_skus`,
`campaigns`. It is **not** the message a failed bootstrap produces; that one reads *"the selector data could
not be loaded"* and comes with a banner and a Retry. More decisively, a page whose bootstrap never landed is
**not drawable at all** — `_fcModelUsable_` requires the bootstrap slice — so the operator could not have
reached the builder in scenario 2's state.

Which leaves **scenario 2b** as the variant that actually fits a working page: 58_ emits
`tables.marketplaces || []`, so an empty array is a legitimate answer, `_fcHas_` accepts it as *present*, and
the page draws normally over an empty registry. The suite reproduces the blank id in exactly that state.

```
INCIDENT_ROOT_CAUSE_PROVEN = NO   — strictly, per §5C
FIRST_CONDITION_NOT_PROVEN = 2, as it applies to the operator's session
ROOT_CAUSE = A — marketplace registry hydration failure (runtime model, not master data)
CONFIDENCE = HIGH on the mechanism and its reachability · MEDIUM on this specific session
FIRST_BAD_BOUNDARY = the bootstrap slice's `marketplaces` array as consumed by _evtResolveMarketplaceId
```

**The one check that would settle it**, and it costs nothing: reproduce the operator's sequence with the
browser devtools network tab open, and read the `fcSummary` bootstrap response. If `data.marketplaces` is an
empty array — or is missing the CA row while `fc_regular_forecast` carries CA rows — condition 2 is confirmed
and the root cause moves to HIGH. If it carries the CA row, then the blank came from somewhere else and this
document should not be treated as closed.

I would rather hand you that check than promote a MEDIUM to a HIGH by writing more confidently about it.

---

## Repair direction (proposed, not implemented)

The invariant, stated without reference to CA, ResTW, Amazon or any id:

> **A Special Event may not be committed when the canonical marketplace identity of its selected site cannot
> be resolved.**

```
MINIMAL_FIX
  saveEventUpdate() (fc-summary.js:5030), at the ONE call site that already computes the value
  (fc-summary.js:5170 — it feeds both the campaign header and every event row):
      marketplaceId === ''  →  refuse, naming the site triple and pointing at Retry.
  Cost: one branch. No new read, no new state, no CA-specific anything.

DEFENSE_IN_DEPTH_OPTION  (two layers, in this order of value)
  1. LIFECYCLE — add `marketplaces` to the event prerequisite path, or gate Next on bootstrap readiness,
     so the identity-dependent boundary cannot be crossed over an unhydrated registry. This fixes the
     CLASS; the refusal above only catches the instance.
  2. SERVER — 14_ validating marketplace_id against the registry before accepting the write.
     RECOMMENDED ONLY WITH A CAVEAT: the task rightly says not to choose server re-derivation without
     proving canonical uniqueness. Uniqueness of (company, country, marketplace) is NOT proven — nothing
     enforces it, and the backfill probe below treats two matches as NO CANDIDATE for that reason. So the
     server should VALIDATE (refuse an id that names no row) and must NOT DERIVE (invent one from the name).
```

Not implemented, for the same reason as R1: whether to block a save that currently succeeds is a product
decision, and §13's bar excludes it.

---

## Existing rows

No production DB access is assumed and **no counts are claimed**.

```
BACKFILL_KEY = company + country + marketplace, matched against the marketplaces registry
BACKFILL_ONE_TO_ONE_REQUIREMENT = YES
  exactly one matching registry row  → deterministic candidate
  zero matches                       → NO CANDIDATE
  two or more matches                → NO CANDIDATE (never a guess)
BACKFILL_DETERMINISTIC = YES for rows that satisfy the one-to-one requirement; NO in general
```

The suite exercises all three branches of that predicate. **It was not executed against any data**, and
`campaigns.marketplace_id` carries the same blank from the same save and belongs in the same census.

---

## Results

```
FOCUSED   fc-id-r1b-registry-hydration-incident   39 passed / 0 failed   4/4 mutants
FILES_CHANGED  1 new test   SPECS_CHANGED  1 new evidence doc + a correction marker on the R1 doc
BEHAVIOR_CHANGED NO · PRODUCTION_ROWS_WRITTEN 0 · DB_MIGRATION_REQUIRED NO
APPS_SCRIPT_SYNC_REQUIRED NO · FRONTEND_DEPLOY_REQUIRED NO · S6_BEHAVIOR_CHANGED NO
CODE_FIX_REQUIRED = YES (proposed, not implemented — carries a product decision)
```

## Sweep

```
568 passed / 573   canonical 5   19 lines   DIRTY 0   WORKTREE_CLEAN_AT_END = YES
573 rather than 572 because this round adds one suite. It contributed zero fail lines.
CANONICAL_FAILURE_SET_CHANGED = NO — diff-clean against the R8 artifact
CANONICAL_DIGEST = ebcf7bc1651e792f7dbab73544cfa2593f91664a9ed399a04f9a5ba9c9bc4f92   (reproduced)
```

Canonical on the first sweep. The R1 suite still passes unchanged: its mechanism assertions were correct and
only its incident conclusion was wrong, so nothing in it needed weakening.
