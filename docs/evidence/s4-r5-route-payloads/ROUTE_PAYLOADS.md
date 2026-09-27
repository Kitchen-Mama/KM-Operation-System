# S4-R5 — Large route payload removal: Inventory Replenishment + the On-the-Way map

**PRE_SHA** `48b471e` · measured at serverMs 400 · every figure read from a real headless Chrome or
from the files on disk.

---

## Result

```
BOOT   75 local scripts / 5 488 419 bytes (5.23 MB)
   ->  67 local scripts / 3 834 814 bytes (3.66 MB)

REMOVED  1 653 605 bytes = 1 615 KB = 1.58 MB
   36.5% below the S4-R1 baseline of 6 035 912 bytes
```

| | files | boot bytes before | after |
|---|---|---|---|
| Inventory Replenishment | 1 | 947 KB | 0 (+1 KB shared fixture stays) |
| On-the-Way map family | 8 | 809 KB | 0 |

At boot: **0 route scripts appended**, **31 menu items**, and neither page's code has run
(`ops=false`, `global-logistics-map=false`), with nothing thrown getting there.

---

## The ownership audit, and the mistake it nearly made

A first pass classified Inventory Replenishment as **not** route-only. It reported
`core/boot-read-arbiter.js` consuming `_irBootstrapScope_` and `_irResumeGapJobOnMount_`, and
`core/method-registry.js` consuming `_execLastMileOptionsHtml`, `_irCarrierModel`, `_irCarrierStatus`
and `_irCarrierPending`. Six symbols, two of them in *core boot files*.

**Every one of those hits was inside a comment.** Both files open by describing the defect they were
built to fix, and naming the symbols involved is how they describe it. Reading documentation as a
dependency would have declared the largest file in the build un-movable on the strength of an
explanatory sentence. With comments stripped from both sides, neither file names an IR symbol in
code.

Two more dismissed the same way: `fc-summary.js`'s `specialEvents` is an object **key** in a return
literal, not a reference; `shipping-history.js`'s `replenishmentMockData` is a comment describing the
writer that does read it. `utils/inventory-compat.js` — 134 KB and the most plausible candidate —
names no IR symbol in code at all.

### The one real coupling

```
replenishmentMockData   — 7 rows of demo SKU data, declared `const` at IR top level,
                          read UNGUARDED by shipping-plan.js at three call sites.
```

A top-level `const` in a classic script lives in the shared global lexical environment, so this
resolved only because both files were loaded at boot. Route-owning Site Inventory without moving it
would have thrown `ReferenceError` for any operator who opened Weekly Shipping Plan first — which is
the ordinary case, not an edge one.

It moved **verbatim** into `assets/js/data/replenishment-mock-data.js`, which loads at boot: same
identifier, same seven rows, same `const`, same timing. 800 bytes of demo fixture were holding 947 KB
hostage.

> Measured, not argued: with Site Inventory **never loaded** in the process,
> `typeof replenishmentMockData === "object"`, Weekly Shipping Plan and Shipment Overview both open,
> **0** new window errors, **0** undefined globals, **0** unhandled rejections.

### The eval-time side effect that was already doing nothing

`inventory-replenishment.js` registers `document.addEventListener('DOMContentLoaded', …)` at eval
time. Route-loading means DOMContentLoaded has long since fired, so that callback is lost. It was a
**proven no-op**: it calls `_inventoryReplenStaticInit()`, whose second line is
`if (!document.getElementById('ops-section')) return;` — and `#ops-section` does not exist in
`index.html` at all, because it arrives with the partial. The mount calls the same function itself,
after the markup exists. Nothing was lost.

### The map

No file outside the family names any symbol the eight export:

| file | export |
|---|---|
| `world-countries-110m.js` | `KM_WORLD_COUNTRIES` |
| `geo-names-zh-hant.js` | `KM_GEO_NAMES_ZH_HANT` |
| `geo-display-aliases-zh-tw.js` | `KM_GEO_DISPLAY_ALIASES` |
| `geo-admin1-display-names-zh-tw.js` | `KM_GEO_ADMIN1_DISPLAY_NAMES` |
| `geo-name-resolver.js` | `KM.geoNames` |
| `km-geo-topology.js` | `KM.geoTopology` |
| `km-globe.js` | `KMGlobe` |
| `global-logistics-map.js` | `KM_MAP_GLOBE_DIAGNOSTICS`, `_glmPendingSelect`, and `glm` — used by its own partial |

§5 warned against assuming all geo files are map-only, so each was asked separately;
`world-countries-110m.js` in particular is not in `MAP_BROWSER_FILES` and carries its own token
family. It has no non-map consumer either.

They are declared in the router **in the order index.html loaded them** — names and geometry, the
resolver that reads them, the topology, the globe, the page — and the loader inserts each set with
`async = false`, so that order is what runs.

`assets/css/pages/global-logistics-map.css` (44 KB) **stays** in index.html. Stylesheets are not what
the script loader loads, and moving one is outside the contract this round expands.

---

## The routes

| | declared | cold fetch | cold exec | dup fetch | dup exec | warm | rapid A→B→A | mounted |
|---|---|---|---|---|---|---|---|---|
| Site Inventory | 1 | 1 | 1 | 0 | 0 | 0 / 0 | 0 / 0 | 1 |
| On the Way | 8 | 8 | 8 | 0 | 0 | 0 / 0 | 0 / 0 | 1 |

Nothing left open on leave. One visible section throughout. A control route this round did not touch
still opens normally.

## Failure

| | shell | refusal | code ran | data read | half-mounted | other routes | Retry | refusal after |
|---|---|---|---|---|---|---|---|---|
| Site Inventory | visible | 1 | no | **0** | no | usable | 1 load | **0** |
| On the Way | visible | 1 | no | **0** | no | usable | 8 loads | **0** |

`SCRIPT_LOAD_FAILURE_FALSE_EMPTY = 0` — the refusal says *"could not be loaded … nothing was read"*
and never says "no data".

---

## A defect this round found in S4-R3's router

`kmRetryRouteScripts` rewrites the refusal box to *"Loading &lt;page&gt;…"* and re-navigates. **Nothing
ever removed it.** A Retry that *succeeded* therefore left the working page with a "Loading…" banner
pinned to the top of it, permanently — a false permanent-loading affordance on a page that had
finished loading.

It survived S4-R3 because that round's runner asked whether the route **mounted** and whether its
code was **present**. Both were true. It never asked whether the refusal was **gone**.

Repaired: `_kmClearRouteScriptFailure_(section)` on the success branch. Measured `errorBox` after
Retry: **1 → 0** on both routes, with the page mounted and its code present. Mutant H7 guards it.

---

## Tokens — three families, none collapsed

```
APPLICATION_TOKEN = s4r5-routepayload-20260927     (new: 48b471e is on origin/main)
MAP_TOKEN         = map-transporticons-r10-20260926 (UNCHANGED)

STALE_APPLICATION_TOKEN_REFS = 0    (index.html and the route table)
STALE_MAP_TOKEN_REFS         = 0
MISPLACED_TOKEN_FAMILY_REFS  = 0
```

**The map family deliberately did not rotate.** Not one map byte moved, and a file whose bytes stand
still must not be re-versioned or every browser refetches the whole 809 KB set for nothing — which
the map-token series says about itself in its own comments. `world-countries-110m.js` keeps its
`country-boundary` family. `inventory-replenishment.js`, which *did* change, is on the current
application token.

The family rules had to follow the assets: `misplacedIndexTokens` and `staleAppTokenRefs` read
`index.html` and only `index.html`, so once the whole map family moved into `app.js` the map-token
rule had **nothing left to look at** — correct, and unreachable. `misplacedReleaseTokens` and
`staleRouteAssetTokenRefs` ask the same questions of both halves of the release.

---

## What is not claimed

**Map fidelity is not asserted from the browser**, and saying otherwise would be the comfortable lie:
markers, transport-mode icons, tooltips, multi-leg behaviour and camera state are not answerable
against a WebGL globe in headless Chrome. They are owned by the map suites that load those sources
into a vm and test them directly — and this round changed **not one byte of any map file**, which is
what the suite asserts instead (`git diff` over the eight files, empty). The fidelity evidence is
those suites passing in the sweep.

**Milliseconds** are not reported. Under `--virtual-time-budget` Chrome freezes the clock inside a
task; S4-R1 measured it and S4-R3 and S4-R4 repeated it.

**Shell-before-code as an ordering proof** is not claimed — a `file://` script resolves before the
first poll. The observable form of §10 is asserted instead: at boot the menu is complete and neither
route's code has run.

**§8-B, hard reload into the target route: NOT SUPPORTED BY THE APP.** There is no hash route, no
deep link and no restored-route mechanism; `KM.pendingRoute` is internal to the Product Strategy
board. The app always boots to home, so the case is moot rather than untested.

---

## Lifecycle

`LISTENER_DRIFT = 0` · `OPEN_REQUEST_LEAK_COUNT = 0` · `GLOBAL_MISSING_SYMBOL_COUNT = 0` ·
`DUPLICATE_MOUNT_COUNT = 0` · no unhandled rejection, no window error, on both routes across four
mount/unmount cycles. Drift is measured **after** one full cycle, because a first mount registers
listeners a live page is entitled to — S4-R4 published a false +89 by counting those, and this runner
does not repeat it.

---

## Two latches, for the third round running

Mutant H4 — "the loader re-inserts a script it already has" — was inert in its first form. `ensure()`
short-circuits on the **set** key before `load()` is ever reached, so removing the per-URL guard alone
changes nothing observable. The mutant has to remove **both** to be a mutant at all.

S4-R3 found the same shape in its route table, S4-R4 found it between the deferred-read helper and
the transport's in-flight share, and here it is again in the loader. Worth stating as a property of
this codebase rather than rediscovering each round: **defences here are habitually doubled, so a
single-point mutant proves nothing.**

Two further mutants were repaired rather than banked: H3 watched `halfMounted`, which stays false on
the failure path because the refusal still renders — its real signature is `mountedSections` **0**
where a healthy route reports 1. H6 read the source *after* the harness restored it, so it inspected
a healthy tree; the harness now takes the probe's snapshot **before** restoring.
