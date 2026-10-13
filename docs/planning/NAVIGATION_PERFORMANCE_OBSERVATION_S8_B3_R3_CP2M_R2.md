# NAVIGATION PERFORMANCE OBSERVATION — S8-B3-R3-CP2M-R2

> **Scope.** The bounded, Owner-approved observation: Sandbox only, memory only, disableable, OFF in a release
> candidate. No business request added, nothing uploaded, nothing written to Production, and no change to the
> Loader, IR 13+6, the Boot Read Arbiter, the transport, timeouts, caching or hydration.
>
> **Evidence.** `docs/evidence/cp2m-r2-perf/perf.json` (53 runs), `phase-decomposition.json`,
> `boot-census.json`. Asserted by `assets/tests/navigation-performance-observation-s8-b3-r3-cp2m-r2.test.js`
> (397) and `assets/tests/perf-observer-bounds-s8-b3-r3-cp2m-r2.test.js` (71).

---

## 1. WHY A NEW INSTRUMENT, AND WHAT THE OLD ONE COULD NOT DO

S4-R1 timed the Chrome **process** from Node and said plainly what that cost: it *"cannot separate SHELL from
PARTIAL from JS from RENDER"*, and its single-entry route deltas (−82 to +154 ms) sat **inside the baseline
run's own 840 ms spread, two of them negative**. A number whose error bar is wider than the effect cannot find
a bottleneck.

That was the instrument's limit, not the question's. From **inside** the process every boundary is observable,
and two of them are observable without touching anything at all.

| Source | What it gives | What it perturbs |
|---|---|---|
| `PerformanceObserver('resource')` | when every script, partial and request started and when its last byte landed, with sizes | **nothing** — the browser's own ledger |
| Pass-through wrappers on five KM seams | the phase boundaries: navigation declared, partial injected, route set executed, mount entered | nothing: each takes a timestamp, calls `orig.apply(this, arguments)` and returns what it returned |
| `MutationObserver` + double `requestAnimationFrame` | **when the screen actually changed** | nothing |

### Three things that had to be got right, each learned by getting it wrong first

**`--virtual-time-budget` cannot be used, and cannot be used for the viewport capture either.** Under it Chrome
freezes the clock while a task runs, so `performance.now()` measures scheduling rather than work. Worse, against
*this* application it never terminates: tried at 8000 and at 15000, **both ran the full 90-second cap and
returned no measurement at all**, because a page that always has a timer due never lets virtual time drain. A
regression test asserts the perf runner never passes it.

**`spawnSync` cannot be used when the page is served by this process.** It blocks Node's event loop, so the
HTTP server could not answer a single request while Chrome waited. The symptom was total and silent —
"requests served: 0", a zero-byte screenshot, a browser that looked hung — and it survived a change of resolver
rules, of virtual-time budget and a fresh profile, because none of those was the problem.

**The page holds its own `load` event.** `--screenshot` fires at load, and this application is not finished at
load: the route is entered afterwards, its scripts arrive afterwards, the table renders afterwards. So the page
requests a holding image last and the server does not answer until the page has reported. `--timeout` does not
hold `--headless=new` open; it produced near-blank screenshots (2.9 KB at 360px) with no measurements.

### "Request finished" is not "screen shown", and the instrument refuses to conflate them

Every phase above ends when some promise resolves, which means the data is in a variable. The operator is not
looking at a variable. So two paint timestamps are recorded, both after a **double** `requestAnimationFrame`
(one rAF runs *before* the paint it belongs to):

- **`t_shell_visible`** — the first frame with any content in the section. **A spinner satisfies this.**
- **`t_data_visible`** — the first frame with real content and no visible loading affordance.

Reporting only the first is how "we added a skeleton" becomes "we fixed the latency". Both are recorded, on
every sample, and the gap between them is reported as its own column.

---

## 2. WHAT WAS MEASURED, AND WHAT IS NOT REAL

| | |
|---|---|
| **REAL** | the route's JavaScript bytes, their download, their **execution**, the partial fetch, DOM construction, style, layout, and the two paints that prove the screen changed; the order and count of requests |
| **NOT REAL — API latency** | `/__api` answers after a declared **120 ms**. That is a constant, not a measurement of Apps Script. **Production API latency is NOT MEASURED** and could not be without reading Production. |
| **NOT REAL — download time** | served over **loopback**. 1 MB in 5.2 ms is a lower bound that says the bytes exist, not what they cost on a real link. §5 models that separately. |
| **NOT REAL — data volume** | the fixture's. Where a page renders 0 rows the figure is an **empty-state** render and is marked as such. |

The browser was launched with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, so **no Production
contact was possible** — enforced by the browser rather than promised by a comment.

---

## 3. THE MEASUREMENTS

**53 runs, all successful. 5 cold + 5 warm per route; 3 runs × 6 sub-pages for Product Strategy.**
COLD = a freshly launched Chrome with an empty profile performing exactly **one** navigation.
WARM = inside one process: visit, leave to Home, return. Medians; spreads in `phase-decomposition.json`.

All times in ms, measured from the **click**.

| Route | phase | n | click→nav | shell/partial | JS total | JS **download** | JS **execute** | files | KB | mount | API* | **shell visible** | **data visible** | shell→data | **API done→visible** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Site Inventory (`ops`) | cold | 5 | 0.4 | 7.5 | 16.4 | 5.2 | **11.6** | 2 | 1012 | 1.6 | 129.4 | 37.4 | — | — | — |
| Site Inventory | warm | 5 | 0 | — | 0.3 | — | — | — | — | 0.2 | — | **3.6** | — | — | — |
| On the Way Map | cold | 5 | 0.2 | 6.2 | 11.5 | 6.6 | **5.0** | 8 | 679 | 0.3 | 128.0 | 19.4 | **504.1** | 485.0 | **349.4** |
| On the Way Map | warm | 5 | 0 | — | 0.3 | — | — | — | — | 0.1 | — | **3.4** | 3.4 | 0.1 | — |
| Site Priority | cold | 5 | 0.3 | 3.8 | 4.4 | 3.1 | **1.4** | 2 | 41 | 0.3 | 125.5 | 13.4 | **148.4** | 135.7 | **7.8** |
| Site Priority | warm | 5 | 0 | — | 0.3 | — | — | — | — | 0.1 | — | **3.0** | 3.0 | 0 | — |
| Carrier Rate Card | cold | 5 | 0.3 | 4.8 | — † | — | — | — | — | 0.5 | 133.1 | 25.9 | — | — | — |
| Carrier Rate Card | warm | 5 | 0 | — | — † | — | — | — | — | 0.1 | — | **1.6** | — | — | — |
| Product Strategy | cold | 5 | 0 | 6.7 | 11.1 | 6.1 | **4.9** | 7 | 569 | 0.3 | 125.5 | 22.0 | — | — | — |
| Product Strategy | warm | 5 | 0 | — | 0.2 | — | — | — | — | 0.2 | 123.8 | **1.5** | — | — | — |

\* synthetic (§2). † Carrier Rate Card is a **plain** section, not a route asset: its code is already on the
boot path, so it has no JS phase to measure — which is itself the finding in §4.

**Home** — the boot route. Medians across 25 cold processes: `responseEnd` **111.7**, DOMContentLoaded
**313.3**, load **316.9**, first contentful paint **312.0**. As a *return* destination (25 samples) Home is
visible **4.8 ms** after the click.

**Product Strategy — all six sub-pages, now on a POPULATED board (CP2M-R3).**

CP2M-R2 timed these at 0–0.1 ms and said the figure was "honest and nearly meaningless", because the board was
in its no-data state. CP2M-R3 supplies a lawful `productPricing.workspace.get`, `productPricing.siteUniverse.get`
and capability envelope, every field taken from the consumer that reads it (`_cp2m-r3-fixtures.js`), and drives
the scope chooser the way an operator does. The board renders: the DOM census rises from 37 elements to
**184–417 per view**, with 6 SVG charts and 35 table rows on Advanced Details.

| view | repaint to next painted frame | long tasks |
|---|---|---|
| overview | 16.5 ms | 0 |
| category | 17.6 ms | 0 |
| risk | 16.9 ms | 0 |
| quality | 26.6 ms | 0 |
| workspace | 32.9 ms | 0 |
| advanced | 21.8 ms | 0 |

**AND THE FIRST POPULATED RUN REPORTED ~935 ms FOR EVERY ONE OF THESE, WHICH WAS AN INSTRUMENT FAULT.**
`markInteraction` opens its sample BEFORE dispatching the interaction, so the most recent pending click was the
PREVIOUS view's — inside the one-second claim window, and therefore claimed. Each sample was measured from the
previous step's click: its 900 ms wait plus the real cost. Long Tasks reporting **zero** blocking throughout is
what exposed it; a 900 ms repaint that blocks nothing is not a repaint. An off-by-one click is the same fault as
a stale callback, arriving from the other direction.

**WHAT THESE NUMBERS DO NOT SAY.** For an in-page view switch the section and a `.psb-view` element are present
both before and after, so the shell and data predicates are already satisfied and cannot isolate "the new view's
own content appeared". What is evidenced is the next painted frame, zero main-thread blocking, and a DOM census
that demonstrably differs per view. A precise per-view render time is **NOT MEASURED**.

### The three findings in that table

**1. The route-asset mechanism works, and the numbers are not marginal.** Warm is 4×–17× cheaper than cold on
every route (37.4→3.6, 19.4→3.4, 13.4→3.0, 25.9→1.6, 22.0→1.5). The second visit pays for neither the download
nor the execution. S4-R3's split is doing exactly what it was built to do.

**2. The post-last-byte tail is the larger half — and this is the separation S4-R1 called NOT_OBSERVABLE.**
Site Inventory's 1,012 KB takes **~5 ms to arrive and ~10 ms more before `ensure` resolves** over loopback.

> **CP2M-R3 CORRECTION — THIS IS NOT TOTAL JS CPU TIME, AND MUST NEVER BE REPORTED AS IT.**
> Scripts are inserted with `async = false`, which means they EXECUTE AS THEY ARRIVE, in document order: the
> first file is already running while the second is still downloading. The interval between the LAST byte and
> `scriptLoader.ensure` resolving is therefore only the execution **tail** — the part that could not overlap a
> download. Total JS CPU is not observable from here at all. The field is now named `jsTailAfterLastByteMs`;
> it was `jsExecMs`, which invited exactly the wrong reading.
>
> What IS observable, and is what actually hurts an operator, is a task that blocks the main thread for more
> than 50 ms. The observer now watches **Long Tasks** for that. Across the whole CP2M-R3 matrix the count is
> **zero** — no route entry and no view switch blocked the main thread.

**3. "The request finished" is not "the screen changed", and the map proves it by 349 ms.** The map's API
answered at ~128 ms and the globe was on screen **349.4 ms later** — 69% of the whole 504 ms wait happens
*after* the last byte arrived. Site Priority's equivalent gap is 7.8 ms, so this is a property of what the map
does with the answer, not of the transport. **No loading state can move that 349 ms**, which is precisely why
the brief forbids claiming a latency fix on the strength of one.

---

## 4. THE COLD-START BOTTLENECK — measured, and PARTLY addressed in CP2M-R3

> **CP2M-R3 moved two routes off the boot path.** Carrier Rate Card (98 KB) and Overseas Stock (106 KB) now own
> their own code, under the same `KM_ROUTE_ASSETS_` mechanism the previous four routes use.
>
> | | before | after |
> |---|---|---|
> | boot scripts | 67 | **65** |
> | boot JavaScript | 4,007,712 B | **3,803,037 B** |
> | removed | — | **204,675 B** |
> | browser-observed requests | 99 | **97** |
>
> **AND THE WALL CLOCK DID NOT IMPROVE, WHICH IS REPORTED RATHER THAN BURIED.** Across 63 runs each side the
> medians moved the WRONG way — DOMContentLoaded +9.2 ms, first contentful paint +8.0 ms — inside spreads of
> 256–406 ms (before) and 261–521 ms (after). That is noise, and the after-run spread is wider, so the machine
> was busier. **This is the S4-R1 trap and it is not being walked into twice: a delta inside the spread is not
> a result.** On loopback with a warm cache 200 KB costs essentially nothing to transfer, so there is nothing
> for the clock to show. The benefit is a property of BYTES OVER A REAL LINK (§5): about 16 ms at 100 Mbit,
> about 390 ms at 4 Mbit, modelled from the byte count and **not measured**.
>
> Evidence: `docs/evidence/cp2m-r3-coldstart/{before,after}.json`, captured around the change only. The byte
> census itself is recomputed from `index.html` on every test run, so it cannot drift.

### The remaining bottleneck, unchanged in shape

Recomputed from `index.html` on every test run, so it cannot quietly describe a past build.

| | |
|---|---|
| Boot scripts | **67 files** |
| Boot JavaScript | **4,007,712 bytes — 3.82 MB** |
| Of which **page scripts** | **22 files, 2,418,203 bytes — 2.31 MB (60.3%)** |
| Page scripts the boot actually needs | **one** — `home.js`, 17,771 bytes |
| Boot requests (browser-observed) | 99 |
| Third-party scripts on the boot path | 2 (`chart.js`, `exceljs` from a CDN) |
| Routes already route-owned | **4 routes / 18 files** (`ops`, `global-logistics-map`, `site-priority`, `product-strategy`) — `boot-census.json`'s `routeOwnedAlready` counts the FILES |

**64 of the 69 script tags are `defer`; the other five are synchronous** (`namespace`, `lifecycle`, `state`,
`partial-loader`, `home`), which blocks parsing even earlier. Either way the result is the same: a deferred
script still executes before `DOMContentLoaded`, and `DOMContentLoaded` is where `app.js` routes to Home. So
**all 3.82 MB parses and executes before Home can appear**, including the code for twenty-one pages nobody has
opened.

**This is not an R52 regression.** It is a pre-existing property of every release to date, and no part of the
current release depends on it.

### The ten largest page scripts on the boot path

| File | Bytes | Why it is still on the boot path |
|---|---|---|
| `fc-summary.js` | 525,628 | 3 cross-file references, 1 DOMContentLoaded handler |
| `request-order.js` | 389,641 | 12 cross-file references |
| `sku-details.js` | 158,244 | 7 cross-file references, 1 DOMContentLoaded handler |
| `shipping-history.js` | 136,144 | 5 cross-file refs, 2 `index.html` inline handlers, 1 DCL |
| `factory-stock.js` | 134,103 | 4 cross-file references |
| `sku-regional-details.js` | 126,569 | 1 cross-file reference |
| `shipping-plan.js` | 111,844 | 3 cross-file references |
| `overseas-stock.js` | 108,363 | **nothing — mechanically clean** |
| `carrier-rate-card.js` | 98,329 | **nothing — mechanically clean** |
| `campaign-risk.js` | 85,511 | 1 cross-file reference, 1 DOMContentLoaded handler |

### The minimal plan, and why it is not executed here

Applying S4-R3's own stated test — *no file outside the route names a symbol it defines*, and *no
DOMContentLoaded handler* — mechanically to all 21 non-Home page scripts:

| | Files | Bytes |
|---|---|---|
| Mechanically clean at CP2M-R2 | 10 | 545,024 |
| **Taken by CP2M-R3** | **2** | **204,675** |
| **Mechanically clean remaining** | **8** | **340,349** |
| Blocked by a cross-file reference | 11 | — |
| Blocked by an `index.html` inline handler | 1 | — |
| Carrying their own DOMContentLoaded handler | 4 | — |

The clean ten are `overseas-stock`, `carrier-rate-card`, `request-order-draft`, `supplychain`,
`sku-regional-pricing`, `purchase-order-list`, `overseas-ops-preview`, `automation-schedule`,
`overseas-outbound`, `overseas-inbound`.

**NOT DONE, AND NOT CLAIMED.** No script was moved and no before/after exists for this finding. Three reasons,
stated rather than implied:

1. **"Mechanically clean" is a heuristic, not a clearance.** It is my own symbol extraction. S4-R3's comments
   show each of its four routes needed a hand argument about load order, shared fixtures and boot callbacks.
2. **It is a 10-file behavioural change** in the same round that first built the instrument to measure it.
   Shipping the measurement and the change together leaves nothing to measure the change against.
3. **The round's own precondition is not met.** The brief asks for the final candidate *"once stable"*; this
   is the finding that makes it not yet stable.

**What it would take**, so the next round starts from a position rather than a blank page: one route-asset
entry per file in `KM_ROUTE_ASSETS_` (the mechanism already exists and already carries four routes), the
section-id mapping each already has, a re-run of this harness for before/after, and the S4-R3/R5/R6 conformance
suites re-anchored. **The agent is not authorised to decide this; it is in the Owner checklist.**

---

## 5. WHAT THE LOOPBACK NUMBERS DO NOT SAY

Download over `http://127.0.0.1` is effectively free, so §3's download column is a **lower bound**. The byte
counts, however, are real, and transfer time at a stated bandwidth is arithmetic rather than a measurement:

| Link | 3.82 MB boot | + `ops` 1,012 KB | + map 679 KB |
|---|---|---|---|
| 100 Mbit (office LAN) | ~0.3 s | +0.08 s | +0.05 s |
| 25 Mbit (typical home) | ~1.3 s | +0.32 s | +0.22 s |
| 10 Mbit (congested / mobile) | ~3.2 s | +0.81 s | +0.54 s |
| 4 Mbit (poor mobile) | ~8.0 s | +2.0 s | +1.4 s |

These are **transfer only** — not latency, not TLS, not Apps Script think time, and not the execution cost
measured in §3, which is additive and real on every link. They are presented as a model and are **not** offered
as measurements. The one thing they establish is the shape: on anything slower than an office LAN the boot
payload, not the route payload, is what the operator waits through.

---

## 6. THE OBSERVER'S BOUNDS, AND HOW EACH IS ENFORCED

| Bound | How it is enforced |
|---|---|
| OFF in a release candidate | **`index.html` does not reference the file.** A candidate carries zero bytes of it and registers nothing. Asserted. |
| Disableable | `disable()` restores every wrapped function **by identity** and releases every listener. Asserted by object identity, not behaviour. |
| No duplicate listeners | a second `enable()` is refused; two enable/disable cycles install the same count and return to zero. Asserted on **every one of the 53 runs**. |
| No business request added | the source contains no `fetch`, XHR, `sendBeacon`, socket, image beacon or script insertion. Asserted on code with comments stripped. |
| Memory only | one capped array. No `localStorage`, `sessionStorage`, IndexedDB or cookie. Asserted. |
| No sensitive data | URLs are reduced to a basename with the **query string removed**; the file never reads `textContent`, `innerText` or `.value`. Asserted. |
| Loader/IR/Arbiter/transport/timeout/cache/hydration unchanged | the observer names none of them; it wraps exactly five KM seams and the test pins that number at five. |
| Enabling changes no business result | every wrapper forwards with `apply(this, arguments)` — **required**, because `switchTo` reads `navToken === undefined` as "a fresh intent"; a fixed arity would rewrite the navigation authority. Asserted by call-arity probes. |

**One limitation, recorded rather than worked around.** `scriptLoader.ensure()` calls its *module-local* `load`,
so wrapping the exported `KM.scriptLoader.load` does not intercept a route set — the first matrix run captured
zero per-script timings for every route because of this. Reaching into the module to wrap the internal function
would be a change to the Loader, which this observation may not make. The download/execute split is taken from
Resource Timing instead, which needs no seam at all.

---

## 7. OWNER CHECKLIST

1. **The cold-start fix (§4).** Authorise, defer, or reject moving the ten mechanically-clean page scripts off
   the boot path. Nothing happens without this.
2. **Production API latency is unmeasured (§2).** The only real figures come from an operator timing the live
   system. If that matters, it needs its own authorisation — it is a Production read.
3. **Product Strategy's six sub-pages are timed on an empty board (§3).** A populated measurement needs the
   `productPricing.workspace.get` envelope, which the harness will not invent.
4. **The map's 349 ms post-request render (§3).** Measured and reported; **no fix attempted**, because a fix
   would touch the globe's own render path and nothing in this round authorises that.
