# S8-R4B-2B — SITE INVENTORY LAZY-ONCE EXPOSURE: IMPLEMENTATION

**Frontend only. No backend byte changed, no action added, no contract version moved, no row written.**

```
OPERATOR_DECISION = D-S8-SITE-INVENTORY-1 · B — LAZY ONCE PER ACTIVE SITE SCOPE, REUSE MANY
RUNTIME FILES CHANGED = 3   assets/js/pages/inventory-replenishment.js
                            assets/js/utils/inventory-compat.js
                            assets/css/pages/inventory-replenishment.css
TESTS = 1 new suite + 6 re-aimed suites
BACKEND_FILES_CHANGED = 0   ROUTER_FILES_CHANGED = 0   ACTION_CONTRACT_CHANGED = NO
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   SCHEMA_CHANGE = 0
WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0
```

---

## 1. What this changes, and the one measurement it rests on

R4B-2 established that the Site Inventory read costs **per sheet, not per row**: a 6-row table costs
1,238 ms and a 3,814-row table costs ~3,000 ms, so nineteen sheets cost 14.4–22.1 s of handler time whatever
the data holds. No single table dominates (the largest is 12–20% of the total) and the spreadsheet open is
~1% — so the only lever is **how many sheets one read touches**.

Six of the nineteen feed **only** the expanded SKU panel. They are now read lazily, once per site scope, and
held.

| layer | tables | when |
|---|---|---|
| first | 13 | the read the screen waits on |
| exposure | 6 | first expand of a SKU at that site, once |

`13 + 6 = 19`. The suite asserts the union against `60_`'s own `SIR_WORKSPACE_TABLES_`, which is what proves
the split **dropped nothing and invented nothing** rather than merely asserting it.

```
FIRST_LAYER_TABLE_COUNT = 13    FIRST_LAYER_EXPOSURE_TABLE_READ_COUNT = 0    EXPOSURE_TABLE_COUNT = 6

FIRST_LAYER_ONLY_SET = marketplaces · marketplace_skus · sku_details · warehouses ·
  amazon_inventory_snapshot · amazon_inventory_health_snapshot · amazon_daily_sales_snapshot ·
  amazon_weekly_sales_snapshot · fc_regular_forecast · fc_target_rules · fc_special_events ·
  overseas_inventory_snapshot · factory_stock

EXPOSURE_ONLY_SET = shipments · shipment_lines · shipping_plans · shipping_plan_lines ·
  shipping_allocation_drafts · shipping_allocation_draft_lines
```

`amazon_inventory_health_snapshot` remains `UNAUTHORIZED_UNKNOWN`, READ ONLY under the standing bounded
Site Inventory contract. `PERMANENT_REGISTRY_CHANGE = NO`.

---

## 2. No backend work was required, and that is a finding rather than a convenience

`inventoryReplenishment.workspace.get` has accepted `only` since the deployed stamp
`SIR_BUILD_VERSION_ = F1-7N-FC-1B-E3-R4-A2-R1-R6-R5`, and R4B-2 watched it work in Production: a confirmed
Search issues the ~357 KB primary read **and** an ~8.5 KB `only`-scoped carrier-catalogue read. Two sizes,
one action.

Both layers are therefore the same existing action with different `only` lists.

```
NEW_ACTION_REQUIRED = NO     ROUTER_CHANGE_REQUIRED = NO     ACTION_CONTRACT_VERSION_CHANGED = NO
BACKEND_RELEASE_REQUIRED = NO    SERVER_CACHE_INTRODUCED = NO    PERSISTENT_HARD_RELOAD_CACHE_INTRODUCED = NO
```

---

## 3. The cache

```
EXPOSURE_CACHE_OWNER = _irExposureByScope, module scope in inventory-replenishment.js, beside _irReadModel
EXPOSURE_CACHE_KEY   = company | country | marketplace_id      (SKU is NOT in the key)
CACHE_STATE_MODEL    = NOT_LOADED | LOADING | READY | FAILED
ENTRY                = { key, state, promise, model, indexes, loadedAt, generation, error }
```

It lives beside `_irReadModel` deliberately: the `ops-section` `unmount()` touches neither, so **route away
and back is free** with no new persistence. A hard reload loses the map, by decision.

`NO_SCOPE` is a fifth **reported** state, not a fifth cache state. With no applied site there is nothing to
attribute a shipment to and no read that could ever be issued, so a panel must be able to **settle** on it
rather than wait forever for an answer that cannot come.

### Counts

```
FIRST_EXPOSURE_REQUEST_COUNT          = 1      CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1
PER_SKU_EXPAND_REQUEST_AFTER_READY    = 0      20_SKU_ADDITIONAL_REQUEST_COUNT       = 0
US_FIRST = 1   CA_FIRST = 1   RETURN_US = 0   RETURN_CA = 0   CROSS_SITE_PREFETCH_COUNT = 0
ROUTE_RETURN_REQUEST_COUNT = 0         LOAD_ONLY_REQUESTED_SITE = YES
INVALIDATION_ON_SITE_SWITCH = NO       INVALIDATION_ON_EXPLICIT_REFRESH = that site's entry only
GLOBAL_CACHE_CLEAR_ON_REFRESH = NO
```

---

## 4. "Not loaded" is not zero — the four false-empty surfaces

`adaptInventoryReplenishmentWorkspace` maps `(data.shipments || [])`. A table the request did not **ask for**
therefore arrives as `[]` — byte-identical to a site that genuinely has no shipments. That single fact is why
the sentinel is **null**, not `[]`: `_irExposureGet_` answers `null` until the entry is READY, and four
surfaces turn on the difference.

| # | surface | before | now |
|---|---|---|---|
| 1 | Shipping Shipment card | `${skuData?.within18days \|\| 0}` on all five buckets | `…` while unread; a truthful `0` only when READY; a named failure with Retry when FAILED |
| 2 | row builder | `shipRemainByReceiver[key] \|\| {overdue:0, …}` | the projection is **null** until READY, so the zeroed default is reachable only *through* a loaded projection; the DTO carries `null` |
| 3 | Recommendation Summary | empty drafts → "No recommendation generated" | that claim is made only by a READY site; unread says it is loading, failed says so. **No request is issued for this label** |
| 4 | Execution Plan editor | hydrate false → default editor | `executionReadiness` gains a fifth input, so an unread draft table holds the panel in the **skeleton it already owns** |

```
FALSE_EMPTY_RISK_COUNT_PRE = 4     FALSE_EMPTY_RISK_COUNT_POST = 0
QTY_ZERO_REGRESSION_REACHABLE = NO
AFFECTED_UI_SET = Shipping Shipment card · Recommendation Summary table · Execution Plan route editor ·
                  the row-builder shipRem default
```

**On #4.** The historical Qty 0 defect — an editor seeded `parseInt(skuData.suggestedQty) || 0` — had already
been removed from `initializeShippingAllocation`, which now renders an empty state. But an empty state is a
*claim about the database*, and deferring the draft tables would have let that claim be made about tables
nobody had read. The hydrate now **refuses a null source** instead of `|| []`-ing it into an empty one, and
the Execution gate holds the panel until the lazy read settles. The defect does not return by a new road.

**First-expand UX.** `FIRST_EXPAND_LOADING_SURFACE` = the expanded panel's second-layer sections only.
`OTHER_FIRST_LAYER_UI_BLOCKED = NO` — the table, filters, sorting and every collapsed-row column stay live.

The five new state classes are **styled**, not merely named. A state class with no CSS rule is a state the
operator cannot see, and this repository has shipped that mistake before.

---

## 5. Two defects found while building this, both in my own change

**The settle closed the row the operator had just opened.** `_irOnExposureSettled_` called
`_irHydrateDraftForAppliedScope_()`, whose success path calls `renderReplenishment()` — which sets
`currentExpandedRow = null` and abandons both reveal generations. Expand a SKU, wait for the lazy read, and
the panel would vanish. The hydrate gained `skipRerender`, used only by this caller. Nothing on the collapsed
row depends on the six tables (On the Way is the literal `0`; Suggested Qty resolves through the materialised
gap state), so there is nothing in the table to repaint. Pinned by `E7` and mutant `M19`.

**A missing workspace API was a pause rather than a failure.** The early return resolved `null`, leaving the
entry NOT_LOADED — which is exactly what holds the Execution Plan in its skeleton. The operator would have
watched a spinner nothing was going to settle. It now records FAILED, which is both true and terminal, and
carries a Retry. Pinned by `C10` and mutant `M20`.

---

## 6. Invalidation, and the debt that is not hidden

An entry is dropped **only** by an explicit operator Refresh for that site, or by this page's own successful
write. Not by expand, collapse, a different SKU, filter, sort, pagination, drawer or tab switch, site switch,
or route away and back.

**`_irAfterWrite` is the one canonical write signal that exists today.** The allocation drafts it reconciles
*are* exposure tables, so a readback of the first layer alone would have reconciled everything **except** the
rows the write just changed. It invalidates and re-reads the **active site only** — a write to US has no
business discarding what is known about CA. This also discharges the `7M-B` B3 deferral: the bounded endpoint
it was waiting for already existed.

```
WRITE_DRIVEN_INVALIDATION_DEBT = RECORDED, NOT SOLVED
```

Writes made on **other pages** still cannot signal this cache. Until a canonical cross-page signal exists,
the **Refresh** control on the Shipping Shipment card is the operator's path to re-read exposure truth for
that site, and an allocation draft saved elsewhere in the same session may not appear until they use it.
No polling was introduced. A future signal must either invalidate only the affected site entry or patch it
from the authoritative write receipt.

---

## 7. R4C acceptance plan — prepared, NOT executed

Measure; promise nothing. The arithmetic below is a projection from R4B-2's measured per-sheet floor
(0.8–1.3 s), not a commitment.

```
PRE   19-table broad read   server 14.4-22.1 s · wall 23.4-31.8 s   (R4B-2, 9 samples)
POST  13-table first layer  FIRST_LAYER_SERVER_MS / FIRST_LAYER_WALL_MS
      6-table exposure      EXPOSURE_FIRST_LOAD_SERVER_MS / EXPOSURE_FIRST_LOAD_WALL_MS
PROJECTION ONLY   13 sheets ~= 11-17 s   ·   6 sheets ~= 5-8 s
```

Hard criteria:

```
SECOND / TENTH / TWENTIETH_SKU_EXPAND_REQUEST_COUNT = 0
CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1          (expand 3 SKUs inside the loading window)
US -> CA -> US: RETURN_US_EXPOSURE_REQUEST_COUNT = 0
CA -> US -> CA: RETURN_CA_EXPOSURE_REQUEST_COUNT = 0
CROSS_SITE_PREFETCH_COUNT = 0
FIRST_LAYER_TABLE_COUNT = 13   EXPOSURE_TABLE_COUNT = 6
```

Also re-test: false empty · permanent loading · route away/return · filter/sort · a failed lazy read · the
explicit retry · the explicit Refresh.

**The 13-table first layer is not reduced further in this round.** Whether ~11–17 s is acceptable is a new,
evidence-backed decision for R4C, and this one does not pre-empt it.

---

## 8. Tests

```
TARGETED_TESTS = site-inventory-lazy-once-exposure-s8-r4b-2b.test.js — 140 passed, 0 failed
MUTATION_TESTS = 20 caught, 0 missed, 0 vacuous
```

The state machine is **executed**, not scanned: a counting `getWorkspace` stub drives single-flight,
ready-reuse, the per-site map, failure semantics and the late-answer guard. An async mutant is scored on its
real comparison rather than a placeholder `true`, and a vacuity section asserts every mutation target is
present **exactly once** in the shipped source, so a probe can never be scored against a line that moved.

Six suites were **re-aimed, not relaxed** — each had pinned an exact shape this round moved:

| suite | what it pinned | restated as |
|---|---|---|
| `live-read-contract-…-a1` | `_wsPayload = { recentWindow: true }` | the explicit thirteen, plus T2a–T2g proving 13+6 = the server's nineteen |
| `first-load-timeout-…-r4` | the built client's lift set | lifts both lists from the page; I4b1/I4b2 pin the payload |
| `shipment-card-real-data-…r5` | the inline projection call | the same call in the index builder, plus "never laundered into a zero bucket" |
| `shipment-merged-lineage-…r6` | the inline lineage build | the same build in the index builder, plus the consumer |
| `api-inventory-replenishment-workspace-7i` | `_irWsGet('getShipments')` reads the read model | moved to a **first-layer** getter — the old claim would have passed only because that sandbox defines no `_irEffectiveWorkspace` |
| `api-bounded-backend-readback-*` · `api-post-write-bounded-readback` | "still the full unfiltered workspace" | bounded to thirteen **plus** the active site's exposure |

### Sweep

```
FULL_SWEEP = 607 suites
CANONICAL_FAILURE_SET_CHANGED = NO
```

Pre-existing failures, each confirmed by running the suite against the unmodified tree:

```
gap-job-done-notice-f1-small-r1                                 exit 1, 3 fail lines
order-planning-monthly-projection-consumer-f1-4b-fm3d           exit 1, 1
positive-residual-and-submit-readiness-census-…-r5-r1           exit 1, 6
product-strategy-visual-integration-p1-b8d-r6                   exit 1, 1
replen-header-toggle                                            exit 1, 7
s2-r4b-shipping-history-and-fc-warm-race                        exit 0, 1   (exit-code blind)
supply-planning-route-inventory                                 exit 1, 2
```

Identical counts before and after. The 158 suites that read any changed file were run separately and show
**zero** new failures.

**One suite could not be run: `s3-r5a-transport-redirect-authority`.** It is a live transport harness and it
hung indefinitely in this environment (the shell `timeout` does not kill a Windows node child, so it was
terminated by PID). It reads **none** of the changed files, so it is out of scope for this round — but it was
**not observed passing**, and that is recorded rather than rounded off.

---

## 9. OPEN RELEASE BLOCKER — the cache tokens have NOT been rotated

**This round is complete as an implementation and is NOT deployable as it stands.** Stated here rather than
left to be discovered, because the failure mode is silent: the deployment would report success and the change
would reach nobody who already uses the application.

Three files changed, and they sit under **two** token series:

| file | series | current token | rotated? |
|---|---|---|---|
| `assets/js/pages/inventory-replenishment.js` | application set (`currentAppToken`, via `KM_ROUTE_ASSETS_` in `app.js`) | `p1-cumulative-20261002` | **NO** |
| `assets/js/utils/inventory-compat.js` | application set (`index.html`) | `p1-cumulative-20261002` | **NO** |
| `assets/css/pages/inventory-replenishment.css` | IR CSS series (`currentIrCssToken`) | `ircompactrecon-20260905` | **NO** |

**The reuse rule is closed.** `_release-order.js` states it four rounds running: a token may be reused only
while the bytes it names provably have not reached a browser, and that evidence is gone the moment `main`
moves. `origin/main` is at `8856aeb` and carries `p1-cumulative-20261002`, so those bytes have been served.

**What a half-updated browser would do here**, which is why both series matter and not just the JS one:

- **Old JS, new index.** The returning browser keeps the nineteen-sheet read. The entire round — the 13/6
  split, the lazy cache, all four false-empty repairs — ships to nobody who already uses the app, while every
  measurement taken afterwards says it shipped. This is the `s3r2`/`s3r4` case verbatim.
- **New JS, old CSS.** This is the worse half and it is specific to this round. The card now emits five state
  classes that did not exist before — `replen-card__value--pending`, `replen-card__note`,
  `replen-card__row--error`, `replen-card__row--meta`, `ir-exposure-retry`/`ir-exposure-refresh`. Against the
  cached stylesheet every one of them has **zero rules**: the pending `…` renders as unstyled body text beside
  real quantities, the failure row loses its alert framing, and Retry/Refresh render as default browser
  buttons inside a data card. The states would still be *correct* and would look like a bug.

**Why it was not done here.** Minting a token is a release act, not an implementation one. Every entry in
`ROUND_TOKENS` is written with `origin/main` named as the evidence that the previous token is spent, and this
task is explicit: `Do NOT deploy`, `Do NOT run Production acceptance yet`, R4C next. Rotating now would also
spend two tokens that cannot be reused if R4C moves any further bytes — which would force a third rotation for
the same change.

**What the release step must do**, in ONE commit, before any deploy:

```
1. mint a new application token (e.g. s8r4b2b-lazyexposure-<date>) and append it to ROUND_TOKENS with the
   reasoning above, including the origin/main SHA that spends p1-cumulative-20261002
2. rotate ALL current-token references together — the set does not rotate partially:
     index.html                            55 refs
     assets/js/app.js                       8 refs   (includes inventory-replenishment.js)
     assets/tests/_p1b8c-acceptance.html     9 refs
3. mint a new IR CSS token, append it to IR_CSS_TOKEN_SERIES, and rotate both references:
     index.html:43  ·  assets/tests/_p1b8c-acceptance.html:32
4. re-run the cache-identity suites
```

```
CACHE_TOKEN_ROTATION_REQUIRED = YES   ·   PERFORMED_IN_THIS_ROUND = NO   ·   DEPLOY_BLOCKED_UNTIL_DONE = YES
```

No currently shipped test fails without this — `staleAppTokenRefs(index)` is `[]` because every reference is
on its series' *current* token. The gate is the governance rule, not a red suite, which is exactly why it is
written down here instead of being left to a green sweep.

---

## 10. What is still open

```
ARCHITECTURE_DECISIONS_REMAINING
  1. Hard-reload persistence of the exposure map. NOT proposed; needs a persistent client cache contract.
  2. Write-driven invalidation from other pages (§6).
  3. Whether the 13-table first layer is itself still too slow — an R4C question, not pre-empted here.
```
