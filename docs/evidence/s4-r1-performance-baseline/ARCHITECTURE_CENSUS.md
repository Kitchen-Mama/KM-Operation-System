# S4-R1 — Loading architecture census

**Written for:** the operator and whoever implements S4-R2. Nothing here was changed; everything here
was measured or read out of the source.

```
PRE_SHA = 65d18e4    S3_FINAL_SEAL = YES
INSTRUMENTS = assets/tests/_s4r1-route-census-runner.js · assets/tests/_s4r1-shell-timing-runner.js
EVIDENCE    = docs/evidence/s4-r1-performance-baseline/measurements.json
```

---

## §1 — The model this application already has

The repository has its own vocabulary and this round uses it rather than inventing one.

| concept | owner in this repo |
|---|---|
| **APP SHELL** | `index.html` + `assets/js/app.js` (`showSection`, `setHomeShellVisible`, `KM_STAGED_SECTIONS_`) |
| **MENU** | `index.html` `.menu-parent` / `.menu-item`, `toggleMenu()` in `app.js` |
| **ROUTE** | `showSection(key)` in `assets/js/app.js` — two section maps, one for mount and one for visibility |
| **PARTIAL** | `assets/html/pages/*.html`, fetched `cache: 'no-store'` |
| **PARTIAL LOADER** | `assets/js/core/partial-loader.js` (`loadPartial`, `_loaded`, `_inflight`) |
| **PAGE MOUNT / UNMOUNT** | `assets/js/core/lifecycle.js` — `KM.lifecycle.register/switchTo`, nav epochs, `enforceSingleActiveSection` |
| **TRANSPORT** | `assets/js/core/km-transport.js` — bounds, classification, `scopedSingleFlight` |
| **WORKSPACE READ** | `assets/js/api/km-api-foundation.js` — `KM.api.getWorkspace(name, params)` |
| **REFERENCE DATA / BROAD CACHE** | `window._opDbCache`, written by `operation-system-db-api.js` |
| **PAGE-LOCAL MODEL** | per page: `_fcReadModel`, `_srdReadModel`, `_skReadModel`, `_crReadModel`, `_crcReadModel`, `_fsReadModel` |
| **SINGLE FLIGHT / IN-FLIGHT SHARING** | `km-transport.js` `scopedSingleFlight` (transport-wide) and `_fcPrereqInflightTables_` (FC page) |
| **ROUTE RETENTION** | none by name. What exists is *DOM retention*: a left page keeps its markup and its model |
| **PRELOAD** | none |
| **PREFETCH** | one, narrow: `_fcOnModeSelected_` starts the FC builder's prerequisite read when a card is chosen |
| **LAZY LOAD** | per-page HTML partials; and, since S3-R13, two FC Special tables |
| **SKELETON** | per page, ad hoc (`.srd-skel`, `[data-state=loading]`, `KM.loadState` regions) |
| **FIRST USEFUL UI** | not a concept in the source. This round introduces it only as a measurement |

```
APP_SHELL_OWNER           = assets/js/app.js  (+ index.html)
MENU_OWNER                = index.html markup + toggleMenu() in assets/js/app.js
ROUTE_OWNER               = showSection() in assets/js/app.js
PARTIAL_LOADER_OWNER      = assets/js/core/partial-loader.js
LIFECYCLE_OWNER           = assets/js/core/lifecycle.js
TRANSPORT_OWNER           = assets/js/core/km-transport.js
CURRENT_SHARED_CACHE_OWNERS = window._opDbCache (reference data) · sessionStorage (2 keys) · localStorage (4 keys)
CURRENT_PAGE_CACHE_OWNERS   = _fcReadModel · _srdReadModel · _skReadModel · _crReadModel · _crcReadModel · _fsReadModel
                              + _fcPrereqLoadedTables_ (per-table freshness record, FC only)
```

**Two things worth naming.** `showSection` carries the section map **twice** — one copy decides what
mounts, the other what becomes visible — and the file's own comment records that they already disagree
by one entry (`global-logistics-map` is in the mount map and not the visibility map). And the
**Product Strategy Board has no menu item at all**: it is `enabled: true` in `KM_STAGED_SECTIONS_` and
reachable only through `showProductStrategyView()`, which nothing in `index.html` calls.

---

## §2 / §5 — Page census

21 user-visible routes, each entered cold, left, and re-entered. Counts are from the **400 ms** run.

| route | requests | rounds | initial actions | warm re-entry | listeners cold / warm | DOM nodes |
|---|---|---|---|---|---|---|
| Site Inventory (`ops`) | 2 | 1 | `inventoryScope.registry.get`, `gapJob.status.get` | **1** (`gapJob.status.get`) | 6 / −1 | 297 |
| Factory Inventory | 4 | 2 | 4 × `getTable` (factory_stock, movements, sku_details, warehouses) | 0 | 65 / **+60** | 348 |
| Overseas Inventory | 1 | 1 | `overseasStock.workspace.get` | 0 | 77 / **+74** | 309 |
| Forecast | 0 | 0 | — | 0 | 61 / **+38** | 159 |
| Order Planning | 3 | 1 | `aiPlanFirstLayer.get`, `gapJob.status.get`, `getTable:marketplaces` | **2** | 12 / +4 | 127 |
| FC Summary | 2 | 1 | `fcSummary…:bootstrap`, `fcSummary…:regular` | 0 | 379 / **+336** | 913 |
| Weekly Shipping Plan | 2 | 1 | `system.health`, `weeklyShipping.workspace.get` | **2** | −3 / −3 | 36 |
| Shipment Draft | 1 | 1 | `shipment.workspace.get` | 0 | −3 / −3 | 17 |
| Shipment Overview | 0 | 0 | — | 0 | 7 / −3 | 46 |
| On-the-Way Map | 1 | 1 | `shipment.workspace.get` | 0 | 8 / −3 | 62 |
| Request Order Draft | 1 | 1 | `requestOrder.workspace.get` | **1** | −3 / −3 | 20 |
| Purchase Order Overview | 1 | 1 | `purchaseOrder.workspace.get` | **1** | −3 / −3 | 17 |
| Purchase Order Workspace | 1 | 1 | `purchaseOrder.workspace.get` | **1** | −3 / −3 | 53 |
| Promotion Risk Tracker | **5** | **3** | 5 × `getTable` (campaigns, campaign_sku_lines, marketplace_skus, marketplaces, sku_details) | 0 | 67 / **+63** | 73 |
| SKU Details | 1 | 1 | `skuDetails.workspace.get` | **1** | 678 / −3 | **3 863** |
| SKU Regional Details | 1 | 1 | `skuDetails.workspace.get` | 0 | 11 / −3 | 325 |
| Product Strategy Board | 1 | 1 | `productPricing.siteUniverse.get` | **1** | 1 / −3 | 22 |
| Carrier Rate Card | 3 | 2 | 3 × `getTable` (carriers, rate cards, lead times) | 0 | −3 / −3 | 119 |
| SKU Handbook | 2 | 1 | 2 × `getTable` (sku_details, product_features) | 0 | −2 / −2 | 29 |
| Supply Chain Canvas | 0 | 0 | — | 0 | 0 / 0 | 76 |
| Automation Schedule | 1 | 1 | `automationSchedule.get` | **1** | −3 / −3 | 8 |

```
USER_VISIBLE_ROUTE_COUNT = 21   (20 reachable from the menu; Product Strategy Board is not)
ROUTES_THAT_REFETCH_ON_WARM_REENTRY = 9
ROUTES_THAT_KEEP_THEIR_MODEL        = 12
```

**Route transitions** (rapid A→B mid-read, then A→B→A), on the representatives:

```
VISIBLE_SECTIONS at every sample = 1        ORPHANED_REQUESTS = 0
STALE_RESPONSE_COMMITS = 0                  PERMANENT_LOADING = 0
A -> B -> A  re-entry cost = 0 requests for routes that keep a model; 1 for `ops` (gapJob.status.get)
```

The lifecycle is the strongest part of this application. Latest-navigation-wins, the single-visible-
section invariant and the nav epochs all hold under rapid switching, and no route left a request open.

---

## §3 — First useful UI, as the current source defines it

This is an audit of what the code requires today, not a judgement that the requirement is right.

**SKU Regional Details** — the §3 example, completed:

| dependency | loaded initially | consumed by the first screen |
|---|---|---|
| `skuDetails` (via workspace read) | YES | **YES** — the master list is this |
| `marketplaceSkus` (`include.regional`) | YES | **YES** — the country/marketplace chips |
| `skuRegionalDetails` (`include.regional`) | YES | **YES** — the detail panel |
| `pricingList` (`include.pricing`) | YES | **NO** — read when a pricing tab or the bulk modal opens |

`FIRST_USEFUL_UI_CURRENT_REQUIREMENTS = skuDetails + marketplaceSkus + skuRegionalDetails`.
All three ride **one** request, so `pricingList` costs no extra round trip — it costs payload. That is
a different trade from FC's, and it is why this is a decision rather than a repair.

The same classification for every route with more than one initial dependency is in
[DECISION_BOARD.md](DECISION_BOARD.md); routes with a single dependency have nothing to classify.

---

## §4 — What the browser could and could not tell us

```
APP_INITIAL_HTML_TO_SHELL_MS               = NOT_OBSERVABLE
APP_INITIAL_HTML_TO_MENU_USABLE_MS         = NOT_OBSERVABLE
APP_INITIAL_HTML_TO_FIRST_ROUTE_VISIBLE_MS = NOT_OBSERVABLE
MENU_CLICK_TO_ROUTE_SHELL_MS               = NOT_OBSERVABLE
MENU_CLICK_TO_LOADING_SURFACE_MS           = NOT_OBSERVABLE
MENU_CLICK_TO_FIRST_USEFUL_UI_MS           = NOT_OBSERVABLE
SHELL / PARTIAL / JS / RENDER split        = NOT_OBSERVABLE
```

**Why, in two measured steps rather than one assertion.**

1. *The page has no clock.* Under `--virtual-time-budget` Chrome freezes time while a task runs. A
   page executing `while (Date.now() - t < 300) {}` **never terminates** — the probe had to be killed.
   Every `ms` in S3's evidence is called `pollMs` for this reason.
2. *Timing the Chrome process from outside does not rescue it at this scale.* Baseline — a run
   that does **nothing** — has a spread of **840 ms** across five repeats. Single-entry route
   deltas came out between **−82 ms and +154 ms**, inside that spread, and two of them are
   NEGATIVE: a route cannot cost less than doing nothing, which is what a measurement drowned in
   noise looks like. Amplifying with 20-cycle loops failed to complete its cycles, so the runner
   prints `NOT_OBSERVABLE` rather than dividing by cycles that did not happen.

> Every stop point — shell, menu, light route, medium route, render-heavy route, rounds-heavy
> route — finishes inside the same **1.67–1.90 s** band as a run that does nothing at all
> (1.75 s). No route’s client work rises above the noise, and the runner says so in its own
> verdict rather than leaving it to the report: `resolvedAboveNoise = []`.

That is the single most useful negative result in this round, and it points every optimization at
request count, round count and payload rather than at rendering.

---

## §6 — Menu and partial loader

```
MENU_ROUTE_BLOCKING_COUNT      = 0
PARTIAL_DUPLICATE_LOAD_COUNT   = 0
JS_DUPLICATE_LOAD_COUNT        = 0
HIDDEN_PAGE_MOUNT_COUNT        = 0
ROUTE_BEFORE_OWNER_SETTLED_COUNT = 0
```

- **Does the shell wait for the API?** No — measured at the only moment that can answer it: how many
  of a mount's requests had **settled** when its section became visible. At 400 ms per response the
  answer is **0 for every route**. Every page draws its shell first.
- **Does navigation reload the partial?** No. Cold entry fetches one partial; warm re-entry fetches
  none, on all 21 routes. The S3-R11 in-flight join holds.
- **Does it reload or re-run JS?** No scripts are appended after boot on any route.
- **Are hidden sections mounted?** No. `mountedSections` never exceeds 1.
- **Are listeners left alive?** **Yes, on five pages** — see §8 item 3.
- **Do reads start before route ownership is settled?** No: `lastDiscarded` was null throughout and no
  request outlived its route.

---

## §7 — Caching and sharing, inventoried

Each of these is a different thing and the round keeps them apart, because calling a single-flight a
cache is how a round ends up "removing a cache" that never held a row.

### CACHE — holds rows after the request has settled

| | `window._opDbCache` | `sessionStorage` | `localStorage` |
|---|---|---|---|
| **owner** | `operation-system-db-api.js` | `shipping-plan.js`, `shipping-history.js` | `sku-overrides.js`, `home.js` |
| **scope** | whole tab | whole origin | whole origin |
| **key** | table → camelCase slice (`_KM_TABLE_CACHE_KEY_`) | `allShippingPlans`, `shippingHistory` | `km_sku_*_overrides_v1`, `personalTodos` |
| **TTL** | none | none | none |
| **eviction** | per-table, on a write whose scope names it (`_fcResetSecondaryCache`) | never | never |
| **survives route change** | YES | YES | YES |
| **survives hard reload** | NO | YES | YES |
| **authority** | **AUTHORITATIVE** reference data | **AUTHORITATIVE-looking, never invalidated** | operator overrides — authoritative by design |

### IN-FLIGHT SHARE — holds a promise, never a row, and is evicted on settle

| | `scopedSingleFlight` | `_fcPrereqInflightTables_` | `partial-loader` `_inflight` |
|---|---|---|---|
| **owner** | `km-transport.js` | `fc-summary.js` | `partial-loader.js` |
| **key** | `action \0 canonicalScope(payload)` | table name | page key |
| **eviction** | on settle, both outcomes | on settle, both outcomes | on settle |
| **survives route change** | only while in flight | only while in flight | only while in flight |
| **authority** | none — it is a promise | none | none |

`scopedSingleFlight` refuses to share a read that carries an AbortSignal, and records why
(`noteShareSkipped`), so a missed coalesce can be told from an absent one.

### PAGE MODEL — the adapted result of one page's own read

`_fcReadModel`, `_srdReadModel`, `_skReadModel`, `_crReadModel`, `_crcReadModel`, `_fsReadModel`.
Tab-scoped, no TTL, dropped on a write the page performs, **survive route changes** — which is exactly
why twelve routes re-enter at zero requests and nine do not.

### FRESHNESS RECORD — not a cache, but it decides whether one is used

`_fcPrereqLoadedTables_` / `_fcPrereqLoadedPaths_` / `_fcDeferredEverUsed_` in `fc-summary.js`.
Per-table, invalidated by write scope. FC Summary is the only page with this; every other page's
freshness is all-or-nothing on its model.

---

## §8 — Measured performance debt, ranked by user impact

**1 · Every page's JavaScript is parsed and executed on every boot** — category J
`PAGE = all` · `MEASURED_EFFECT` = **5.86 MB of JS across 82 scripts**, 79 deferred, all executed
before `DOMContentLoaded`, which is when the menu becomes usable. `inventory-replenishment.js` is
946 KB; `km-globe.js` + world geometry + zh-Hant names is 460 KB for a route most sessions never open.
`ROOT_CAUSE_CONFIDENCE` = certain (read from `index.html` and disk).
`SAFE_LOCAL_FIX_EXISTS` = NO · `PRODUCT_DECISION_REQUIRED` = **YES** — this is "what loads first".

**2 · Nine routes re-read on warm re-entry; twelve do not** — category D
`MEASURED_EFFECT` = one full workspace read per re-entry on Site Inventory, Order Planning (2),
Weekly Shipping Plan (2), Request Order Draft, Purchase Order Overview, Purchase Order Workspace,
SKU Details, Product Strategy Board, Automation Schedule.
The sharpest case: **SKU Details re-reads and SKU Regional Details does not, from the same action** —
the read-model reuse was a hotfix applied to one page and not its sibling.
`ROOT_CAUSE_CONFIDENCE` = certain · `SAFE_LOCAL_FIX_EXISTS` = **YES, per page** ·
`PRODUCT_DECISION_REQUIRED` = **YES** — reuse is a freshness decision, not a performance one.

**3 · Five pages re-bind their listeners on every mount and release none** — category K/F
`MEASURED_EFFECT` = FC Summary **+336 listeners per re-entry** (379 on first mount), Overseas
Inventory +74, Promotion Risk Tracker +63, Factory Inventory +60, Forecast +38. Across one census the
process went from **31 listeners to 2 049**. SKU Details, by contrast, binds 678 once and +1 after.
`ROOT_CAUSE_CONFIDENCE` = certain, counted at `addEventListener`/`removeEventListener`.
`SAFE_LOCAL_FIX_EXISTS` = **YES** (bind-once, or release on unmount) · `PRODUCT_DECISION_REQUIRED` = NO.
**This is the one item on the list that is a straightforward repair.**

**4 · Promotion Risk Tracker pays three sequential read rounds; Factory Inventory and Carrier Rate
Card pay two** — category C
`MEASURED_EFFECT` = 5 requests / 3 rounds, 4 / 2, 3 / 2. The read pool is 2 by design
(`KM_SCOPED_READ_CONCURRENCY_`), so the rounds are arithmetic, not a defect — but a page that needs
five broad tables to draw a KPI strip is paying three server round trips for one screen.
`ROOT_CAUSE_CONFIDENCE` = certain · `SAFE_LOCAL_FIX_EXISTS` = NO ·
`PRODUCT_DECISION_REQUIRED` = **YES** (a purpose-built scoped read, as Overseas Inventory already has).

**5 · `gapJob.status.get` and `system.health` are re-issued on every mount** — category B/L
`MEASURED_EFFECT` = Site Inventory's only warm-re-entry cost is `gapJob.status.get`; Weekly Shipping
Plan re-issues `system.health` beside its workspace read on every entry, warm or cold.
`ROOT_CAUSE_CONFIDENCE` = certain · `SAFE_LOCAL_FIX_EXISTS` = YES ·
`PRODUCT_DECISION_REQUIRED` = **YES** — a health check that is never repeated is not a health check.

```
PROVEN_PERFORMANCE_DEBT_COUNT = 5
CATEGORIES WITH NO PROVEN INSTANCE = A (shell latency), E (orphaned reads), G (render cost),
                                     I (broad-table read as a bottleneck), K (hidden mounts)
```

Categories A, E and K are not merely unproven — they were **measured and came back clean**: shell
before data on every route, zero open requests on every leave, one mounted section at all times.

---

## §11 — One defect found, recorded rather than fixed

```
DEFECT = assets/js/utils/data.js:254 — getForecastReviewData() reads `forecastReviewData`,
         a global that is defined NOWHERE in the repository (line 302 reads
         `forecastReviewDataLastYear`, likewise undefined).
OBSERVED = two unhandled rejections during the census run
BLOCKS_CENSUS = NO   CAUSED_BY_HARNESS = NO
ACTION = recorded for S4-R2 per §11. It is neither a measurement fault nor a blocker, and repairing a
         page's data path is not what this round is authorized to do.
```
