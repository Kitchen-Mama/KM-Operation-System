# FC-SUMMARY-STABILITY-R2 — the cold path

**Base** `5d0185c` · `PRODUCTION_ROWS_WRITTEN = 0` · `DB_MIGRATION_REQUIRED = NO`
`FORECAST_FORMULA_CHANGED = NO` · `GAP_FORMULA_CHANGED = NO` · `S5/S6_BEHAVIOR_CHANGED = NO`

Suite: `assets/tests/fc-summary-stability-r2-cold-path.test.js` — 47 passed / 0 failed, 8/8 mutants.

```
FC1_TIMEOUT_REPAIR_SEAL     = YES
FC3_REFRESH_REPAIR_SEAL     = YES (by consequence — see §9)
FC4_GROUP_CARD_REPAIR_SEAL  = NO  — isolation complete, read cost unrepaired, contract specified
FC2_STATUS                  = MONITORED_NOT_REPRODUCED
FC_SUMMARY_STABILITY_FINAL_SEAL = NO
```

---

## FC-1 — the third table was the second round

The arithmetic is the whole argument, and it was measurable without instrumentation:

```
_kmReadTablesBounded_  issues ONE request PER TABLE
KM_SCOPED_READ_CONCURRENCY_ = 2 lanes
  2 tables -> 1 round        3 tables -> 2 rounds
```

The Special path declared three, so it paid **two serial 45-second budgets** before the modal could open.
The third was `campaigns`, and the comment defending it said it *"fills the Base Campaign dropdown on open"*.

That is not what the code does. `campaigns` has exactly two consumers:

| consumer | when it runs |
|---|---|
| `_evtPopulateBaseCampaigns` | one outer call site: `if (method === 'growth')` in the Event Assist method handler |
| `_evtHydrateExisting_` | when an existing event is picked — and it **already defers `campaign_sku_lines` at that very boundary** |

Neither runs on open. So `campaigns` joins `_FC_DEFERRED_TABLES_` and is bought by whichever consumer is
reached first. The hydration path awaits both deferred tables **together**, because two sequential subsection
waits for one operator action would move the cost rather than remove it.

```
SPECIAL_COLD_BLOCKING_REQUEST_COUNT   3 -> 2   (table requests; + the events slice, concurrent)
SPECIAL_COLD_ROUNDS                   2 -> 1
REGULAR_COLD                          2 requests / 1 round — unchanged, which was the regression to avoid
CAMPAIGNS_COLD_BLOCKING               YES -> NO
CAMPAIGNS_FIRST_REAL_CONSUMER         _evtPopulateBaseCampaigns (growth) | _evtHydrateExisting_ (edit)
READ_TIMEOUT_MS   45000 -> 45000      LANES  2 -> 2
```

**Nothing was bought with a bigger budget.** Both knobs are planted as mutants (`G2` raises the timeout, `G3`
widens the lane pool) and both are caught.

### §2 — dependency classification, frozen

| table | current boundary | target boundary | why |
|---|---|---|---|
| `sku_details` | CRITICAL_BEFORE_OPEN | unchanged | the SKU datalist the first editable UI draws |
| `marketplace_skus` | CRITICAL_BEFORE_OPEN | unchanged | scope, and the in-scope answer the price cell needs **before** pricing lands |
| `campaigns` | CRITICAL_BEFORE_OPEN | **FIRST_CONSUMER_DEFERRED** | both consumers are post-open |
| `campaign_sku_lines` | FIRST_CONSUMER_DEFERRED | unchanged | saved-event rehydration |
| `pricing_list` | FIRST_CONSUMER_DEFERRED | unchanged | price-bearing card |
| `fc_special_events` | events slice | unchanged | `FULL_TABLE_EVENT_READ_COUNT_POST = 0` |
| `fc_regular_forecast` | regular slice | unchanged | |
| `marketplaces` | bootstrap slice | unchanged | **deliberately NOT moved onto the cold path** (§11) |

Nothing moved to Save. Both deferred consumers gate before they read, and the Save path validates its own
prerequisites independently — including the identity boundary below.

---

## FC-3 — already correct, and now cheaper

R1's root cause was *"the same heavy reads repeated"*, not corrupted state, and the lifecycle was already
right: `_fcResetSecondaryCache` invalidates only the written slice's tables and keeps receipt-reconciled ones;
`_fcPostWriteWarm_` warms only tables this session holds, concurrently with the slice readback; and on failure
**nothing is latched and no banner is raised**, so a failed refresh cannot make the next open worse than not
running at all.

```
WRITE_SUCCESS_REFRESH_FAILURE_DISTINGUISHED = YES
NEXT_MODAL_POISONED_BY_REFRESH_FAILURE      = NO
FAILED_PROMISE_CACHE_COUNT = 0   FALSE_READY_COUNT = 0   PERMANENT_LOADING_COUNT = 0
```

One fact this round makes explicit and asserts: **no FC write scope changes any builder prerequisite.**
`_FC_SLICE_PREREQ_TABLES_` covers `fc_regular_forecast`, `campaigns`, `campaign_sku_lines`,
`fc_special_events`, `fc_target_rules`; the cold set is `sku_details` + `marketplace_skus`. The two are
disjoint, so a save can no longer cool the cold path at all — which is what makes FC-3 cheap rather than
merely correct. `campaigns` remains re-warmed after a write through `_fcDeferredEverUsed_`, so a session that
edits saved events keeps R2-STABILITY's "wait once at Save" guarantee.

---

## FC-4 — not repaired, and not claimed

**The isolation §7 asks for is already the shipped state.** Verified and asserted rather than assumed:

```
PRICING_RETRY_REQUEST_COUNT = 1         Retry asks for pricing ALONE
SUCCESSFUL_SIBLING_DATA_DISCARDED_COUNT = 0   it re-reads no sku_details / marketplace_skus / campaigns / events
DUPLICATE_PRICING_REQUEST_COUNT = 0     _evtRequestPricing_ is single-flight
cards stay rendered, entries intact     _evtOnPricingFailed_ is a subsection refusal
PENDING != MISSING                      an unread price is never a false zero
Save refuses a pending price            "the group cards cannot be saved from"
```

So §7 option **C is done**. What remains is the read itself, and it cannot be shrunk from the client:

> `getTable` takes **no filter**. `_kmReadTablesBounded_` says so in its own words — *"The table name IS the
> complete scope: getTable takes no filter, so two reads of one table are the same read."*

```
PRICING_FULL_TABLE_SCAN_ON_GROUP_BUILD_PRE  = 1
PRICING_FULL_TABLE_SCAN_ON_GROUP_BUILD_POST = 1   (unchanged)
PRICING_READ_SCOPE_POST = FULL TABLE
```

**Option A was checked and rejected on evidence.** `72_api_v1_product_pricing_workspace.gs` is site-scoped and
reads `pricing_list` by `marketplace_sku_id` — but it is flag-gated behind `PRODUCT_STRATEGY_ENABLED_ = false`,
is not deployed, has **no page caller**, and owns a different question (site membership). Adopting it would be
enabling an unshipped feature to serve FC Summary, which is the "second pricing authority" §7 forbids.

### The contract for option B, specified and not invented

One bounded projection, riding the slice mechanism that already exists on `58_` — `payload.include.slice`, so
**no new routed action and no change to `01_router.gs`**:

```
ACTION    fcSummary workspace get, include: { slice: 'pricing', marketplace_sku_ids: [...] }
READS     pricing_list  (the SAME one authority — projected, never duplicated)
FILTER    rows whose marketplace_sku_id is in the supplied set
EMITS     pricingList   (the existing model key, same normalizer, same shape)
SCOPE     the builder already knows every marketplace_sku_id: it is resolved from marketplace_skus,
          which is CRITICAL and loaded before any price cell renders.
CLIENT    _fcEnsureDeferredTable_(pricing) becomes a scoped fetch; the PENDING/MISSING states, the
          single-flight, the subsection refusal and the Save gate are all unchanged.
```

Two honest caveats. The slice mechanism currently reads a whole table and emits it, so **row filtering is new
behaviour in `58_`**, not a configuration of what is there. And it is a backend change on a branch that already
carries undeployed backend work — which is exactly the accumulation §20 warns about. I am specifying it rather
than landing it in the same round that repaired FC-1.

---

## §11 — the identity seal is intact

```
FC_CANONICAL_IDENTITY_BOUNDARY_SEAL_HELD = YES
BLANK_MARKETPLACE_ID_WRITE_COUNT = 0
CANONICAL_MARKETPLACE_ID_REQUIRED_FOR_SAVE = YES
```

The save still resolves through the one identity owner, still refuses every non-`READY_UNIQUE` state, and the
gate still sits above `_fcWriteBegin_`. **`marketplaces` was deliberately not dragged onto the cold path** to
make identity cheaper — it stays a save-boundary concern on the bootstrap slice, which is what FC-ID-R1B
proved it must be. Asserted, with a mutant (`G5`) planting a weakened guard.

## §17 — FC-5 semantics preserved

```
INITIAL_FALSE_EMPTY_COUNT = 0   REFRESH_FALSE_EMPTY_COUNT = 0   TIMEOUT_FALSE_EMPTY_COUNT = 0
LAST_GOOD_DATA_PRESERVED = YES
```

The new campaigns branch obeys the same rule the table gate does: it renders **"Loading campaigns…"** while
unread and disables with a stated reason on failure — never `(no matching campaign with FC data)`, which is a
claim about the data. Mutant `G7` removes that branch and is caught by the false-absence it produces.

---

## What the sweep caught that the focused runs could not

The first sweep failed **five** suites no focused or dependent run touched, and two of them had **surviving
mutants**. In total eleven suites had pinned this one table's placement.

### Four mutants had gone blind

| probe | why it stopped seeing its fault |
|---|---|
| `M10` prefetch | compared two path lists that are now identical — "fetch one" and "fetch both" became the same observation |
| `M8` warm-state | watched a **path-level** view of a table no path holds any more |
| `N14` stability-share | the events-scoped warm intersected nothing, returned early, and the planted fault never executed |
| `N16` stability-share | same, plus nothing was latched for the faulted reset to discard |

Each reported green while testing nothing. **None was deleted.** M10 now plants an event-only sentinel instead
of naming a member; M8 observes the table freshness record the deferred consumers actually read; N14 and N16
state the precondition they always had implicitly — that this session has used the deferred table — through
the mechanism that now carries it. All four are independent of which tables happen to sit on a path.

### And one suite asserted the false justification

`s3-r13` **A3** asserted that campaigns stays on the cold path *"because `_evtPopulateBaseCampaigns` fills a
control while the builder opens"*. The source comment said the same thing. So the test and the code agreed
with each other and **neither agreed with the runtime** — which is how a whole extra read round survived three
consecutive rounds of cold-path work. Both are corrected.

### The rest

- **Strict-subset claims** (`s3-r12` A3, `fc-stability` A6a) became containment. The hazard they guard —
  attaching a Regular open to a Special load and opening a builder over unfetched tables — requires Special to
  need *more* than Regular. It no longer does, so `>` would have forbidden the improvement rather than the
  defect.
- **Membership pins** (`s3-r13` A1/A4, `fc-id-r1b` E1, `api-app-prime`'s floor of 3) became named-table or
  derived claims.
- **Two source-mutating harness anchors** (`s3-r12` J6, `s3-r13` J7) re-aimed at the lists this round left.
- **`fc-campaign-lock` E7b** and **`fc-regular-writer` J1a** both asserted "and that is not vacuously none".
  Both are now vacuously none for a good reason, and both assert the reason instead: the builder cold set and
  the FC write surface are disjoint.

---

## Release

No backend file changed. `fc-summary.js` changed again.

```
BACKEND_RELEASE          = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R30   (unchanged — no .gs file touched)
APPS_SCRIPT_SYNC_REQUIRED = NO for this round
FRONTEND_DEPLOY_REQUIRED  = YES
FRONTEND_DEPLOY_SET       = assets/js/pages/fc-summary.js

APPLICATION_TOKEN        = s5r4-actionreason-20260928
TOKEN_ROTATION_REQUIRED  = YES, AT DEPLOY — and now mandatory rather than advisable
```

**`fc-summary.js` has now changed in THREE unshipped rounds under one unrotated token** —
FC-SUMMARY-STABILITY-R1 (the FC-5 gate), FC-ID-R2 (the identity boundary) and this one. A deploy that does not
rotate it leaves returning browsers on the cached copy, so all three repairs would appear to have shipped and
none would be running. §20 states this outright, and it is the single most consequential line in this report.

### Cumulative deploy sets, for the eventual coherent release

```
FRONTEND   assets/js/pages/fc-summary.js          (R1 + FC-ID-R2 + R2)  — token rotation REQUIRED
APPS SCRIPT  14_fc_write_handlers.gs              (FC-ID-R2 identity validation)
             63_api_v1_system_health.gs           (R30 release + manifest)
             01_, 47_, 73_, 90_                   carried unchanged from earlier unshipped releases
S5_DEPLOYMENT = HOLD   S6_DEPLOYMENT = HOLD
```

## Tests

```
FOCUSED    fc-summary-stability-r2-cold-path   47 passed / 0 failed   8/8 mutants
DEPENDENT  11 suites repaired, all green; s3-r12 66/0 · s3-r13 160/0 · fc-stability-share 202/0 (18 mutants,
           0 survived) · prefetch 135/0 · warm-state 105/0 · fc-campaign-lock 135/0 · api-app-prime · fc-id-r1b
           41/0 · fc-regular-writer 181/0 · fc-id-r2 70/0 · fc-summary-stability-r1 34/0

FULL_SWEEP 573 passed / 578      canonical 5 suites, 19 FAIL lines
578 rather than 577 because this round adds one suite. It contributed zero fail lines.
SUITES THAT LEFT THE TREE DIRTY = 0
CANONICAL_FAILURE_SET_CHANGED = NO — diff-clean against the R1 artifact
CANONICAL_DIGEST = ebcf7bc1651e792f7dbab73544cfa2593f91664a9ed399a04f9a5ba9c9bc4f92   (reproduced)
WORKTREE_CLEAN_AT_END = YES
```

Canonical on the second sweep. The first was the one that mattered: it found five suites and two dead mutants
that no focused or dependent run could reach.

## Open debt

```
OPEN_FC_DEBT
  FC-4  pricing_list full-table read at the Group Card boundary. Isolation complete; read cost unrepaired.
        Needs the bounded server projection specified above. NEXT_FC_TASK.
  FC-2  first-click focus — MONITORED_NOT_REPRODUCED. Needs real DOM event ordering; no timer hack added.
  §19   bounded runtime stability (listener/timer drift, request leak) is asserted structurally through the
        existing single-flight and in-flight-index guards, NOT executed in a browser. A real browser harness
        remains the honest way to close it.
```

`NEXT_FC_TASK = FC-SUMMARY-STABILITY-R3 — the bounded pricing projection (option B above)`
