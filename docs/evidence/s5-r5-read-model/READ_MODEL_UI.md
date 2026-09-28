# S5-R5 — recommendation read-model + operator-facing integration

**Base** `a36c3fd` · read/display only · `ACTION_PERSISTED = NO` · `PRODUCTION_ROWS_WRITTEN = 0`

Owner of record: `docs/planning/S5_RECOMMENDATION_DECISION_ENGINE_CONTRACT.md` **Part VII, §65–§73**.

---

## The surface already existed, and so did its home for this

§1 required finding the operator surface rather than designing one. `request-order.js` already renders a
**Recommendation Summary** card inside the SKU expand, next to Demand Summary, Order Allocation and a collapsed
diagnostics block. The action belongs there — placement **B**, second-level detail.

The decisive property is that the recommendation is generated **in the browser from gap rows the scope read
already loaded**. That is what makes "no per-SKU fetch" structural rather than promised: the render makes no
request at all, so there is nothing to avoid.

```
READ_MODEL_OWNER = _opMatCache.bySku      PAGE_MODEL_OWNER = _roRecoByKey
RENDER_OWNER     = _roRecoActionHtml      TRANSPORT = the existing scope-level gap read, unchanged
FRONTEND_REDERIVES_ACTION = NO   FRONTEND_REDERIVES_REASON_TOKENS = NO
SECOND_RECOMMENDATION_CALCULATION_PATH = 0
```

---

## The defect this round fixes

The page rendered its verdict from `dto.status` — a **readiness** state, not a decision:

```js
if (dto.status === 'NO_ACTION') return '... No order action required across T1–T4 ...';
```

A row whose need was **fully covered by a reallocation** has exactly that status. It displayed *"No order
action required"* while a transfer was in fact required, and the operator would have believed it.

This was latent before D-S5-9 and became reachable the moment `REALLOCATE` could be emitted — so the decision
that made the enum honest also made a display bug reachable. The page now reads `recommendationAction`.

**Structural greps would not have caught it**, because it was a correct-looking branch reading the wrong field.
That is why this suite lifts the real render function out of the page and **executes** it against DTOs from the
real KMREC, asserting on rendered markup.

---

## What the operator sees

```
Recommended Action
[ Reallocate + New Order ]   Move existing factory surplus AND order the shortage it does not cover.
Reallocation  30     New Order  70
> Why this recommendation
     Factory supply is already counted toward this need            FACTORY_SUPPLY_APPLIED
     Factory surplus was reallocated in from another site          FACTORY_SURPLUS_REALLOCATION_APPLIED
     A shortage remains after the supply already counted           RESIDUAL_SHORTAGE
     That shortage rounds up to a whole-carton order               NEW_ORDER_REQUIRED
```

**The two quantities are never added.** The suite asserts the string `100` appears nowhere in that row's markup.
A missing reallocation snapshot renders **no line at all** rather than a zero.

**The reason lines claim exactly what their tokens prove.** The reallocation line says *"from another site"*,
not "cross-company": §41 groups receivers by `company||sku`, so the snapshot proves a site transfer. A mutant
changing that one word to "company" is killed.

**An unnameable action is "unavailable", never "No Action"** — an action the page cannot name is missing, not
absent, and those are different claims.

Labels are presentation and live in the page; the enum is authority and lives in KMREC. All 19 emitted CSS
classes have rules — an unstyled state class ships as an invisible one, which is the defect
`PSB_STATE_CLASSES_HAVE_NO_CSS` records.

---

## Measured, not asserted

No new performance harness was invented; the suites that already own these questions were run against the
changed page.

| observation | result | owner |
|---|---|---|
| cold entry | stable at 0 ms and 400 ms; no request left open on leave | `s4-r1` |
| warm re-entry | **0 requests** (immediate, delayed, rapid A→B→A) | `s4-r2 §A2` |
| first / second / third SKU expand | **0 requests each**; `ops` route specifically 0 | `s4-r7 §C1/§C4a` |
| duplicate reads | 0 | `s4-r7 §B2` |
| listeners / timers | `LISTENER_DRIFT = 0`, `TIMER_DRIFT = 0` over ten return trips | `s4-r2 §E` |

**Search is reported honestly.** `s3-r11` measures zero-request search on SKU Details, not Request Order, so no
Request Order search number is claimed. What is proven instead is structural and tested: the render is
synchronous with no `fetch`, no `Promise`/`await`, no `setTimeout`, no `addEventListener` (§G2–G5), so no
interaction can gain a request through it.

---

## Four tests failed, and every one was right

Two came from the dependent run and two more from the sweep — and they were not the same kind of thing.


**`s5-r4 G7/G8`** asserted that *nothing* read the derived fields. True when S5-R4A wrote it; false the moment
this round shipped a read model. A test pinning "nobody reads it" would have to be deleted the first time
anyone did — so it is replaced by the claim that must never change: a consumer may **read** the verdict and may
never **derive** it.

**`home-boot H17`** caught `request-order.css`, changed this round and still served at `toolbarui-20260811`,
dated 2026-08-11. That is exactly the failure `atomic-release-cache-identity` records — a file whose bytes moved
served under a token a returning browser already holds. Rotated to the current application token.

**`toolbar-action-hierarchy`** then pinned that same literal token. Its own comment, twelve lines above, spells
out why that is wrong — *"was right until the first round that legitimately rotated the file, and then it failed
while describing a correct tree"* — and the line directly above it already asks the series instead of a literal,
for `inventory-replenishment.css`. The lesson had been learned in the same file and applied to every line but
this one. Repaired to match its neighbour.

**`product-strategy B6`** was **not** a seal, and was not repaired. It is an allow-list that requires any round
changing another page's stylesheet to record a substantive reason (`B6c` enforces the length, `B6b` forbids
exempting Product Strategy's own sheet). That is the mechanism working exactly as designed, so this round added
its entry: new selectors only, scoped to `#request-order-section` like the existing `.ro-reco-*` rules, nothing
existing edited, nothing touching `.psb-page`.

Telling those two apart mattered. Weakening `B6` would have removed a real guard; declaring a reason to
`toolbar` would have left a literal that breaks again on the next rotation.

---

## Release

Only frontend bytes changed — no core module, no Apps Script file — so the bundle needed no rebuild and the
tree R27 names is untouched.

```
BACKEND_RELEASE = ...R27   UNCHANGED      APPLICATION_TOKEN = s5r4-actionreason-20260928   KEPT
TOKEN_ROTATION_REQUIRED = NO
APPS_SCRIPT_SYNC_REQUIRED (this round) = NO
APPS_SCRIPT_SYNC_SET (accumulated, pending from S5-R4A) =
  90_generated_supply_planning_bundle.gs · 63_api_v1_system_health.gs · 01_router.gs · 73_api_v1_pricing_write.gs
FRONTEND_DEPLOY_SET = index.html · assets/js/pages/request-order.js · assets/css/pages/request-order.css
```

## Next write slice — audited, not implemented

```
NEXT_WRITE_OWNER   = KMRDV2P.planFlat -> KMPR.applyPersistencePlanWithLock
NEXT_WRITE_TARGET  = request_order_allocation_drafts (flat V2) + recommendation_calculation_runs
NEXT_WRITE_PAYLOAD = scope + planning_cycle + per-tier { month, recommendedQty } + provenance
                     — the action and tokens are NOT part of it; they stay derived
PRODUCTION_DATA_CLASSIFICATION = PRODUCTION (real operator drafts alongside demo-seeded rows)
```

The action is a **verdict about** a draft, not a field **of** one. Writing it would duplicate a value KMREC
already derives.

## Results

```
s5-r5-recommendation-read-model   64 passed / 0 failed   10/10 mutants
80 dependent suites run; the only failures were the two canonical ones and the two repaired above
FILES_CHANGED = 5    BEHAVIOR_CHANGED = YES (display only)
BEHAVIOR_INTENTIONALLY_UNCHANGED = quantities · state machine · operator edit · network shape
```

## Sweep

```
run 1   7 suites · 15 lines · digest changed   the two stylesheet gates above
run 2   560 passed / 565 · canonical 5 · 13 lines · DIRTY 0 · clean

CANONICAL_DIGEST = f809dca8d4e41954d98bb87ce0c2f9eb69c65fea9530acd030d639405bfc76b1
CANONICAL_FAILURE_SET_CHANGED = NO
```

565 rather than 564 because this round added one suite.

Worth recording: three of this round's four failures were **release and scope identity** gates, not anything
about recommendations. The subject of a round is a poor predictor of what it will break — the gates that fire
are the ones watching files, tokens and stylesheets, and none of them mentions KMREC.

```
S5_READ_MODEL_UI_SLICE_SEAL = YES
OPEN_S5_DEBT = none
NEXT_TASK = S5-R6 — operator decision -> Draft Allocation / Request Order candidate mapping
```
