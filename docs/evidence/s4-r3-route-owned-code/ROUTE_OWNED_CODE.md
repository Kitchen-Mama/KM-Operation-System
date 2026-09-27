# S4-R3 — Route-owned code, and two reads nobody needed

Measured on `4ed2760` (before) and on this round's tree (after), in one real browser over the
S3-R11 fixture world at `serverMs = 400`. Every number is from
[`measurements.json`](measurements.json), produced by
[`_s4r3-code-split-runner.js`](../../../assets/tests/_s4r3-code-split-runner.js).

---

## 1 · Boot

| | before | after |
|---|---|---|
| `<script src>` tags | 82 | 76 |
| local scripts | 80 | **74** |
| local JS bytes | 6 035 912 (5.76 MB) | **5 461 069 (5.21 MB)** |

**561 KB removed from boot.** The script loader itself adds 4.6 KB back, which is in that figure.

`MENU_AVAILABLE_BEFORE_ROUTE_SCRIPTS = YES`, and that is measured rather than reasoned: at boot the
menu has all 31 items including the board’s six sidebar children, the loader reports the route as not
loaded, `KM.pages.productStrategyBoard` is undefined and **zero** scripts have been appended. The
board’s renderer has not run.

### What is still at the top of the boot list

| | KB | |
|---|---|---|
| 1 | 946 | `inventory-replenishment.js` |
| 2 | 476 | `fc-summary.js` |
| 3 | 455 | `operation-system-db-api.js` |
| 4 | 355 | `request-order.js` |
| 5 | 200 | `km-globe.js` |
| 6 | 153 | `sku-details.js` |
| 7 | 135 | `world-countries-110m.js` |

---

## 2 · The pilot, and the route that was withdrawn from it

`PILOT_SCRIPT_SET` is **seven Product Strategy modules** — 567 KB for a route that has no menu
item at all. `PILOT_ROUTES = product-strategy`.

**The On-the-Way Map is not in the pilot, and that is a decision rather than an oversight.** Its four
scripts are 584 KB for a route most sessions never open, which made it the obvious first candidate,
and it was **measured working** under route ownership before being withdrawn: 4 fetched, 4 executed,
one mounted section, zero re-fetch and zero re-execution on a warm return or a rapid round trip.

What stopped it is that those files sit under a dense cache-identity and load-**order** rule set —
roughly twenty-five assertions across seven suites — and every one of them asks its question of
`index.html`, because `index.html` was where the tags were:

- *"index.html cache-busts km-globe.js"*
- *"geo-names-zh-hant.js carries a token from the map series"*
- *"km-geo-topology.js loads before km-globe.js"*
- *"data BEFORE resolver — the resolver reads the global the data defines"*

Every one of those claims remains **true** under route ownership. Only their expression assumed one
location. But re-writing deployment-safety rules this round did not author, in the same round that
moves the files they protect, is how a bounded pilot stops being bounded — so the map was put back,
byte-identical and in its original position, and recorded as the next candidate.

The piece that was missing is now in place: `_release-order.js` answers *"how is this asset
cache-busted in this release?"* from **both** `index.html` and `KM_ROUTE_ASSETS_`
(`releaseAssetToken`, `parseRouteAssetTokens`, `isRouteLoadedAsset`). Re-expressing those seven
suites on top of it is its own round, and the map follows immediately after.

The board’s win is 567 KB against the map’s 584 KB — effectively the same size, without the rule set.


### `psb-views.js` stayed at boot, and the measurement is why

The pilot was eight modules until the browser disagreed. `mountStagedMenus()` runs **at boot** and
builds the Product Strategy sidebar entry; its six children come from `PSB_VIEWS.VIEWS`, read through
`KM.nav.stagedChildren`. With `psb-views.js` loaded on route entry, that read happened before the file
existed — and `stagedChildren` answers `[]` rather than throwing, so nothing failed loudly and the menu
was simply built with **zero children**.

| | menu items | staged parent | its children |
|---|---|---|---|
| before | 31 | 1 | **6** |
| route-loaded *(rejected)* | 25 | 1 | **0** |
| shipped | 31 | 1 | **6** |

`psb-views.js` is 7.9 KB and is a **declaration the shell depends on**, so it stays at boot. The
567 KB that is genuinely route-only is what moved.

This also caught a fault in this round’s own instrument. The boot check asserted
`menuItems >= 20` and read 25 as healthy — **a count is not completeness**. The staged parent and its
six children are now counted on their own, which is what would have failed immediately.

### Cache-busting followed the files

Moving a tag must not move a file out from under a rule. Every route-loaded script carries its
family's current token in `KM_ROUTE_ASSETS_`, and the suite asserts it against
`currentAppToken()` / `currentMapToken()` rather than against a literal.

---

## 3 · Load before mount

The contract §4 states, measured:

| | value |
|---|---|
| cold entry: scripts fetched / executed | 7 / 7 |
| `DUPLICATE_SCRIPT_FETCH_COUNT` (warm re-entry) | **0** |
| `DUPLICATE_SCRIPT_EXECUTION_COUNT` | **0** |
| rapid A→B→A: re-fetched / re-executed | 0 / 0 |
| `DUPLICATE_MOUNT_COUNT` | **0** (one mounted section throughout) |
| `MOUNT_BEFORE_SCRIPT_READY_COUNT` | **0** |
| visible sections | 1, always |

`switchTo` is reached **only inside the loader's `.then`**, so a mount cannot precede the code
structurally, not merely in practice.

**`switchTo` is delayed, never skipped, and it runs on both outcomes.** That is what keeps a failed
load from leaving the app half-navigated: it unmounts the page the operator left, and with nothing
registered under the target id it mounts nothing — a visible shell carrying a truthful refusal.
Skipping it would strand the previous page as mounted-but-invisible with its listeners still bound,
which is the drift S4-R2 spent a round removing.

### One ordering claim is NOT made

§4 asks for *route click → shell visible → script resolves → mount*. The first two cannot be
separated here: under `--virtual-time-budget` a `file://` script resolves before the first poll, so
the instrument reports the code as already loaded at the moment the shell appears. That is recorded
as `NOT_OBSERVABLE` rather than asserted.

What the router actually does is fetch the 9 KB partial and the 567 KB of scripts **in parallel**, and
reveal the shell on the partial. The ordering is a property of the two payload sizes; this harness
cannot time it, and no millisecond is claimed.

---

## 4 · When the code does not arrive

All seven route-owned scripts refused at the network:

| | |
|---|---|
| shell still visible | **yes** |
| refusals shown | **1**, scoped to the route |
| data reads attempted | **0** — `SCRIPT_LOAD_FAILURE_FALSE_EMPTY = 0` |
| `HALF_MOUNT_COUNT` | **0** — not mounted, and its global does not exist |
| loader recorded the set as loaded | **no** — a partial set is not a loaded set |
| other routes usable | **yes** |
| `RETRY_DUPLICATE_LOAD_COUNT` | **0** — Retry is exactly one new attempt |
| recovery once the network allows it | **yes**, in one more attempt |

The refusal says the page could not be loaded, that **nothing was read**, that it is a connection or
deployment problem rather than a data one, and that every other page still works. There is no silent
fall back to a legacy global.

**One defect found and fixed mid-round.** The refusal originally rendered before the partial landed,
so it went into the mount element and the partial's `innerHTML` then wiped it: a failed route showed
an empty shell and no message at all. The refusal now waits for the markup. The 1.4–9 KB that costs
is the difference between a truthful refusal and a blank page.

---

## 5 · `system.health` — once per app session

S4-R1 recorded this as "re-issued on every mount". Measured precisely, it has **exactly one**
production consumer: Weekly Shipping Plan's mount, through
`checkPageDeploymentContract('weekly-shipping-plan')` → `checkDeploymentContract`.

| | before | after |
|---|---|---|
| owners | 1 | 1 |
| requests, first mount | 1 | 1 |
| requests, re-entry | 1 | **0** |

`SYSTEM_HEALTH_TTL = NONE`. Nothing expires on a clock, and the suite asserts there is no
`setTimeout`, `Date.now`, `ttl`, `maxAge` or `expires` anywhere in the holding function.

`SYSTEM_HEALTH_INVALIDATION_KEY` is the deployment identity —
`build_id | deployed_action_contract_version | transport_contract_version | router_build`. It is
dropped by a new app session (a reload; it is a plain module variable) or by
`KM.DB.invalidateDeploymentContract()`.

**Only a successful verdict is held.** A failure is never retained — a probe that could not reach the
deployment must stay retryable, and caching *unreachable* would turn one bad moment into a page that
refuses for as long as the tab is open. A **mismatch** is not retained either: the operator fixes it
by publishing, and the next mount has to be able to see that they did.

> The fixture's `system.health` answer had to be corrected to measure this at all. It carried two
> fields, so `checkDeploymentContract` found no `caller_probe` and returned
> `DEPLOYMENT_CONTRACT_MISMATCH` — a verdict the session share deliberately does not retain. The stub
> now answers with the identity fields at top level, where `handleSystemHealth_` puts them.

---

## 6 · `gapJob.status.get` — asked when a job might be running

Two owners, measured: Site Inventory and Order Planning, one read each per mount. Unrelated routes
already issued **zero**, so §7's headline was already satisfied; what was not is the page's own
comment: *"a status poll for a gap job that is USUALLY NOT RUNNING, fired unconditionally on every
mount."*

| | after |
|---|---|
| unrelated route | **0** |
| Site Inventory, no known job | **0** |
| Order Planning, no known job | **0** |
| a job that MAY be running | **1** |
| explicit refresh (`force`) | 1, always |

The gate is a **liveness marker**, not a cached status: one fact — this product has a job nobody has
seen finish — written by the code that starts a job and cleared by the code that sees a terminal one.
Both live in `gap-recalc-transport.js`, so there is exactly one owner. It is in `localStorage`
because that is what makes the recovery survive: a module variable would be gone on the refresh that
recovery exists for, and invisible to a second tab.

No polling interval was introduced.

**Stated failure mode:** a job already running when this ships has no marker, so it will not be
resumed by a mount. It self-corrects after one job cycle and the backend is unaffected — the job
still completes. A marker left by a crashed tab costs exactly one status read on the next mount,
which reads `DONE` and clears it.

---

## 7 · Regressions

`GLOBAL_MISSING_SYMBOL_COUNT = 0` — no error and no unhandled rejection anywhere in the run.
A non-pilot route (SKU Details) mounts with 120 rows and one visible section, unchanged.
`LISTENER_DRIFT` and the R2 warm-re-entry contract are asserted intact.

---

## 8 · Scope held

- No bundler, no framework, no dynamic-import machinery. The loader is 130 lines and implements the
  same contract `partial-loader.js` already proved: **loaded** and **in flight** are different
  answers and get different registries, and a failure is never cached as a failure.
- Scripts are inserted with `async = false`, the documented way to say *download in parallel, execute
  in document order*, so a set behaves exactly as the same tags in `index.html` did.
- No service worker, no TTL, no prefetch, no business-data cache.
- Nothing from §10 was touched: Promotion Risk, Factory Inventory, Carrier Rate Card and the SKU
  Regional pricing split are all as they were.
- No `.gs` file, no DB migration. `system.health` and `gapJob.status.get` are asked **less often**;
  neither action, payload nor response shape changed and the contract pin stays at 17.
