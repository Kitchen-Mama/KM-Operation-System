# CP2P - where the expand latency goes, and why the obvious fix was not shipped

Captured by `assets/tests/_cp2p-ir-expand-runner.js` against the REAL page (real index.html, real app.js,
real partial loader, real `toggleReplenRow`) with a 100-SKU workspace fixture answered over loopback.

    node assets/tests/_cp2p-ir-expand-runner.js <outDir> --label <name> [--skus 100] [--gap ok|slow|error]

| file | what it is |
|---|---|
| `shipped-1..10.json` | the handler as it ships, at `fb8b99ad` |
| `deferred-variant-1..10.json` | the shell-first variant, WITHDRAWN |
| `rejected-single-frame.json` | an earlier single-frame variant, also rejected, with its own reason |
| `scenarios-ok.json` | A then B in one station, station switch, leaving the page mid-build |
| `scenarios-gap-slow.json` | the gap read is never answered |
| `scenarios-gap-error.json` | the gap read is refused by the server |

The twenty latency captures are **INTERLEAVED PAIRS**: shipped, variant, shipped, variant, ten times, each
pair back to back. Everything below is a PAIRED comparison for that reason - see "the method" at the end.

## Where the time goes (shipped handler, 100 SKUs)

| | median |
|---|---|
| click -> handler entry | under 1 ms |
| click -> first paint | 83 ms |
| click -> Execution panel resolved | 241 ms |
| `getReplenishmentData()` calls per capture of five expands | 60 |
| mean cost of one such call | ~20 ms |

The dispatch was never the cost. `toggleReplenRow` builds the panel synchronously, and the panel needs
`getReplenishmentData()`, which re-assembles EVERY row of the station from twelve source tables. Three
separate callers do it - the handler, `_irRevealSkuData_`, and `_irRecoRerenderSummariesRender_` - so one
expand pays for it about nine times. Nothing memoises it.

## The variant that was built and withdrawn

A shell inserted in the click pass, the panel built two frames later.

| pair | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| first paint delta (ms) | -88 | -84 | -80 | -80 | -71 | -84 | -76 | -54 | -68 | -70 |
| **Execution resolved delta (ms)** | **+20** | **+49** | **+30** | **+26** | **+55** | **+2** | **+25** | **+73** | **+81** | **+71** |

First paint 83 ms -> 8 ms. Total completion **later in ten of ten pairs**, median **+39.5 ms (+15%)**.

That is the trade this round forbids: a first paint bought by a later finish is an appearance, not a fix.
Deferring by a frame costs a frame by construction, so no variant of the approach escapes it. The change
was withdrawn rather than shipped against the rule, and the measurement is handed to the Owner instead.

What the variant DID get right, recorded so nobody re-derives it: expanding B while A was open left exactly
one panel; switching station left none open; leaving the page mid-build left no panel and no orphaned
shell, and threw nothing. Those captures carry the VARIANT source hash, and the suite asserts that they do.

## The method, which is part of the finding

An earlier comparison of four runs per side, **pooled** rather than paired, showed the variant **22%
FASTER** and would have shipped it. The shipped side alone varies run to run by 216-279 ms - more than the
effect being measured. Only interleaved pairs, each its own control, separated the two. A single-frame
variant was rejected earlier for a different measured reason: a single `requestAnimationFrame` runs before
the browser lays out the frame the shell was inserted in, so the build still forced that layout and the
same calls went from a 23 ms mean to a 43 ms mean.

One harness defect is recorded here too, because it produced a capture that read like a page defect: a
fixed 500 ms wait before the first click lost a race on a loaded machine (`showSection is not defined`,
after a 7.1 s boot). The harness now waits for the application and records the boot wait.

## What these captures do NOT show

- **The Owner reports about a second. This fixture does not reproduce it.** The worst first paint measured
  on the shipped handler is about 106 ms, on one machine, at 100 SKUs, over loopback. The production figure
  stays UNVERIFIED.
- **Nothing about production read latency.** The gap read is answered by a local stub in microseconds.
- The captures pin the page module and the API module by hash, deliberately NOT index.html or app.js: those
  carry the cache token, and hashing them would force a re-capture on every token rotation for a behaviour
  that does not depend on it.
