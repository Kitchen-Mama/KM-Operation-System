# S8-R4A — BROWSER / ROUTE-LEVEL READ FATIGUE: RESULTS

Acceptance dataset: the **S8-R4A1 rerun**, 161 measurement windows, scenarios A–F, 8 cycles, 3 warm
returns, 300 s idle, 180 s maxwait. The first attempt (`R4A_HUNG_RUN_1`) is diagnostic evidence only and
contributes nothing here.

```
RERUN_STATUS                  = PASS (with one stated exception, §6)
RERUN_SAMPLE_COUNT            = 161
RERUN_COMPLETED_SURFACE_COUNT = 12 of 12
CDP_COMMAND_TIMEOUT_COUNT     = 0
WATCHDOG_TRIPPED              = NO
CHECKPOINT_WRITES             = 162
```

---

## 1. Page-level measurement

Mount windows only. `stable` is wall-clock from `showSection()` to a quiet window of 2 s with no network and
no DOM mutation in the section subtree, so **every figure includes that 2 s quiet window**; a surface that
reports 2.1 s did approximately 100 ms of work.

| # | Surface | cold | warm | cycle (med) | max | reads/mount after cycle 1 | rows |
|---|---|---|---|---|---|---|---|
| 1 | FC Summary | 62 180 | 2 386 | 2 374 | 62 180 | 0 | 1 |
| 2 | SKU Details | 59 088 | 12 751 | **12 394** | 59 088 | **1** | – |
| 3 | SKU Regional Details | 16 624 | 2 135 | 2 110 | 16 869 | 0 | 50 |
| 4 | Factory Inventory | 12 655 | 2 115 | 2 120 | 15 814 | 0 | 112 |
| 5 | Overseas Inventory | 15 899 | 2 157 | 2 152 | 15 899 | 0 | 240 |
| 6 | Weekly Shipping Plan | 15 870 | 13 983 | **16 070** | 18 482 | **1** | – |
| 7 | Shipment Overview | 17 414 | 2 110 | 2 107 | 17 414 | 0 | – |
| 8 | Shipment Draft | 15 579 | 2 108 | 2 105 | 15 579 | 0 | – |
| 9 | On-the-Way Map | 21 891 | 2 120 | 2 117 | 21 891 | 0 | – |
| 10 | PO Overview | 13 986 | 13 937 | **15 861** | 17 135 | **1** | – |
| 11 | Carrier Rate Card | 9 231 | 2 116 | 2 114 | 9 231 | 0 | – |
| 12 | Site Inventory | 8 738 | 2 102 | 2 116 | 8 738 | 0 | 0 |

**The twelve surfaces are two populations, not a spectrum.**

- **Nine surfaces cache.** After the first mount they issue **zero** application reads and settle in ~2.11 s,
  which is the harness's own quiet window plus roughly 100 ms. Re-entry is effectively free.
- **Three surfaces re-read on every mount** — SKU Details, Weekly Shipping Plan, PO Overview — and cost
  12–16 s every single time.

## 2. For the three that re-read, the time is the backend

| Surface | cycle stable | backend read (med) | page overhead |
|---|---|---|---|
| SKU Details | 12 394 | 9 865 | **529 ms** |
| Weekly Shipping Plan | 16 070 | 12 973 | **1 097 ms** |
| PO Overview | 15 861 | 13 651 | **210 ms** |

`page overhead = stable − 2 000 (quiet window) − backend`.

Between a fifth of a second and one second of the twelve-to-sixteen seconds is the frontend. **The rendering
path is not the cost.** Any repair that targets the client on these three surfaces is targeting 2–7 % of the
problem. The cost is the Apps Script read, and the second-order cost is that these three do not cache.

## 3. Cold open: repeated server executions

> **CORRECTED 2026-10-04 (S8-R4B audit).** This section originally called the repeats a **client retry**.
> That was wrong. Every repeat shares **one Chrome `networkId`**, and a client retry would allocate a new
> fetch and therefore a new id — so this is **one browser fetch following a redirect chain**, not the client
> asking again. The observable cost is unchanged and so is every number below; the owner is not. The
> correction matters because a repair aimed at client retry policy would change nothing. The original
> wording is replaced rather than annotated in place, because a wrong attribution left standing in an
> accepted results document is how it gets built on.

`PAGE_DATA_READY_MS` on a cold FC Summary is 60.1 s, against 7.4 s for the same read warm. The waterfall
says why. Each logical read should be `exec → echo`. On a bounced request the `echo` hop instead redirects
**back to `/exec`**, and each `/exec` hop carries the **same `km_rid`** but produces a **new
`user_content_key`** — a second and third full execution of the handler.

```
FC Summary, cold mount        (all hops share networkId …1968.195 — ONE fetch)
  +0 s      REQ-C000001  exec -> echo   200, 14.0 s           two concurrent workspace reads
  +0 s      REQ-C000002  exec                                  dispatched in the same millisecond
  +6.9 s    REQ-C000002  -> echo                               server execution 1 done, redirected
  +24.7 s   REQ-C000002  -> exec                               BOUNCED BACK — server execution 2
  +40.0 s   REQ-C000002  -> exec   ERR_ABORTED                 server execution 3; client 45 s bound fires
  +62.2 s   page stable
```

```
SKU Details, cold mount       (networkId …1968.388)
  +0 s      REQ-C000001  exec
  +13.6 s                -> echo
  +44.2 s                -> exec   200, 12.4 s                 server execution 2
  +59.1 s   page stable
```

Two findings, and the second is the expensive one:

1. **FC Summary dispatches two concurrent `fcSummary.workspace.get` on mount**, in the same millisecond
   (the `bootstrap` and `regular` slices). This was already seen in R3B and is confirmed here.
2. **A bounced request executes the handler two or three times.** The client asked once. The executions are
   serialized behind one another, so the page waits for the whole chain — 62 s for a surface that costs
   2.4 s warm. The `ERR_ABORTED` endings are the client's own 45 s bound expiring against the *chain*, which
   also means a read whose single execution would have returned in ~14 s is reported as a timeout.

**Scope:** 7 of 145 application reads bounced (4.8 %), all on cold or first-mount paths. Warm and cycle
mounts issue no reads at all on nine of twelve surfaces and so cannot bounce.

## 4. Site Inventory root cause

> **SCOPE CORRECTION 2026-10-04 (S8-R4B audit).** Everything below is true of the **pre-Search shell**, and
> only of that. The surface's table is fed by `inventoryReplenishment.workspace.get` **and only by a
> confirmed Search** (`inventory-replenishment.js:8988`) — a read this matrix never issued, because the
> gate below is exactly what stopped it. R3B's `~31.7 s → ~71.4 s → ~133.8 s` degradation of that read is
> therefore **neither reproduced nor refuted here**, and this section must not be read as evidence against
> it.

**Before a Search, Site Inventory is not slow. It renders nothing.**

- Cycle stable 2 116 ms — the second fastest of the twelve.
- `rows = 0` and `chars = 594` in every one of the 8 cycles.
- One read on mount (`inventoryScope.registry.get`, 4.8 s), then nothing.

Scenario F explains it. A read-only click produced a native dialog:

```
alert — "Please select Country and Marketplace before searching."
```

The surface is gated: until a country and a marketplace are chosen it holds an empty shell. What has been
reported as slowness here is a surface that completed quickly and showed nothing, which is a different
defect with a different repair.

**This same dialog is what stalled the first matrix** — same surface, same stage. §5 of this document has
the mechanism.

## 5. The correction this round forces

The R4A preflight named **`getOperationDb` — the 44-tab whole-database read — as the leading suspect** for
page time the per-action measurements could not account for, and stated it was a mount read on six of eleven
surfaces.

**`getOperationDb` was never dispatched. Not once, in 161 windows, on any of the twelve surfaces.** The
complete observed vocabulary is:

```
skuDetails.workspace.get 24 · getTable 26 · getClientCapabilities 17 · purchaseOrder.workspace.get 17
weeklyShipping.workspace.get 17 · fcSummary.workspace.get 14 · shipment.workspace.get 14
overseasStock.workspace.get 6 · system.health 5 · inventoryScope.registry.get 5
```

The preflight's claim was read off the source rather than measured, and it was wrong. The leading suspect
for the unexplained page time is the bounced execution chain in §3, not a wide read.

## 6. The exception to PASS

Four of 161 windows — `E-before` and `E-return` for FC Summary and Site Inventory — report
`PAGE_FULL_STABLE_MS = null`. **This is a harness accounting defect, not a product timeout.**

All four carry the same stall reason: one open request, `shipment.workspace.get`. Scenario D's rapid burst
navigates away mid-flight by design; one shipment read was dropped by the renderer without a
`Network.loadingFinished` or `loadingFailed` the harness could match, and the runner's `open` map is global
and never pruned across windows or reloads. From that point the "no open requests" condition could never be
true again, so the next two scenario-E windows each ran the full 180 s.

What survives in those windows is still valid: first-content times (262–266 ms) and request counts. The
request counts carry the scenario-E result:

```
E-before   FC Summary       5 requests, 2 application reads
E-before   Site Inventory   4 requests, 1 application read
E-return   FC Summary       0 requests          <- after a 5-minute idle
E-return   Site Inventory   0 requests
```

**A five-minute idle does not invalidate the cache.** Returning to an idle surface issues no request at all.

This is a sixth harness defect, found by the rerun and not repaired in this round. Pruning `open` on
navigation is a small fix; whether to re-run the matrix to recover four windows is the operator's call.

## 7. Amplification, duplication, leaks

**Request amplification: none.** Application reads per mount across 8 cycles, every surface:

```
FC Summary            [2 0 0 0 0 0 0 0]      Shipment Overview   [1 0 0 0 0 0 0 0]
SKU Details           [1 1 1 1 1 1 1 1]      Shipment Draft      [0 0 0 0 0 0 0 0]
SKU Regional Details  [1 0 0 0 0 0 0 0]      On-the-Way Map      [1 0 0 0 0 0 0 0]
Factory Inventory     [3 0 0 0 0 0 0 0]      PO Overview         [1 1 1 1 1 1 1 1]
Overseas Inventory    [1 0 0 0 0 0 0 0]      Carrier Rate Card   [2 0 0 0 0 0 0 0]
Weekly Shipping Plan  [2 1 1 1 1 1 1 1]      Site Inventory      [1 0 0 0 0 0 0 0]
```

Every series is flat or falls to zero. **No surface issues more requests on cycle 8 than on cycle 2.**

**Stable-time drift across 8 cycles** is ±19 ms on the nine cached surfaces. The three that re-read drift
+2 093 ms (Weekly Shipping Plan) and +2 895 ms (PO Overview) between cycle 2 and cycle 8 — but their
per-cycle series is non-monotonic (`13977 12909 13438 17138 18482 16326 16070`), so that is backend variance,
not client accumulation. SKU Details drifts **−2 560 ms**, in the opposite direction.

**N+1:** one candidate, `getTable` on Factory Inventory — 3 calls on cold mount, each for a different table,
then 0 on every subsequent mount. Three tables fetched once is not an N+1; it is three tables.

**Duplicate requests:** 3 in 161 windows (FC Summary ×2, SKU Details ×1), all on cold mounts, all accounted
for by the bounced execution chain in §3.

**Listener / lifecycle duplication: none detectable.** Row counts and character counts are byte-identical
across all 8 cycles on every surface that renders rows (FC Summary 1, SKU Regional 50, Factory 112, Overseas
240, Site Inventory 0). A duplicated listener or a re-registered lifecycle hook would show as growing row
counts, growing content, or growing request counts; none of the three appears.

The runner's lifecycle probe read `window.__kmLifecycleLog`, which this application does not define, so
every reading is 0. **That metric measured nothing and should not be read as evidence of absence** — the row
and content invariance above is the actual evidence.

## 8. Required items that did not reproduce

Reported as not-reproduced rather than as absent:

- **Factory Guard defect — NOT REPRODUCED.** `factoryStockGuard.get` was never dispatched in 161 windows.
  It is called only from `shipping-plan.js:1536`, behind an interaction scenario F's read-only click filter
  deliberately excludes. Reproducing it needs an interaction scenario that is not read-only, which is
  outside this round's authorization.
- **Request Order interstitial — NOT MEASURED.** No Request Order surface is in the approved twelve.
- **Shipment 150 s outlier — NOT REPRODUCED.** Across 36 mount windows the three shipment surfaces ran
  2 105–21 891 ms. The slowest shipment observation in the entire dataset is On-the-Way Map's 21.9 s cold.

## 9. Safety

```
PRODUCTION_ROWS_WRITTEN                = 0
PRODUCTION_ROWS_DELETED                = 0
SCHEMA_CHANGES                         = 0
GAP_WRITE_COUNT                        = 0
GAP_JOB_START_COUNT                    = 0
GAP_JOB_STATUS_REQUEST_SENT_COUNT      = 0
GAP_JOB_STATUS_REQUEST_INTERCEPTED_COUNT = 0
SCRIPT_TRIGGER_MUTATION_COUNT          = 0
DRIVE_WRITE_COUNT                      = 0
PROPERTY_WRITE_COUNT                   = 0
DIRECT_CELL_WRITE_COUNT                = 0
UNKNOWN_APPLICATION_REQUEST_SENT_COUNT = 0
WRITE_ACTIONS_SENT                     = 0
CONFIRM_ACCEPTED_COUNT                 = 0
EPHEMERAL_PROFILE_ONLY                 = YES
OPERATOR_PROFILE_TOUCHED               = NO
```

2 534 requests intercepted pre-network at the `Request` stage. 145 application reads, all from the frozen
16-action allowlist; 2 246 static assets; 143 platform/third-party. **0 aborts**, because nothing outside
the allowlist was ever dispatched — the guard was never asked to refuse anything.

The ten observed actions are a subset of the sixteen approved. `gapJob.status.get` was never dispatched and
never reached the network. One dialog was raised and dismissed; no confirm was ever accepted.

Console errors across the whole matrix: **1** — a single 404 on a static resource.

## 10. Sweep

```
FULL_SWEEP                   = 605 suites, 7 problems
CANONICAL_FAILURE_SET_CHANGED = NO
```

The seven are the pre-existing canonical set, unchanged by this round, name for name:

```
gap-job-done-notice-f1-small-r1                    announceManualDone called EXACTLY once
order-planning-monthly-projection-consumer-f1-4b-fm3d   K/W manual Order Qty default (frozen write path)
positive-residual-and-submit-readiness-census-…    M1a live positive-residual world READY_TO_AUTHORIZE
product-strategy-visual-integration-p1-b8d-r6      B5.3 this round did not touch layout.css
replen-header-toggle                               A1 leaf header sequence
s2-r4b-shipping-history-and-fc-warm-race           A3 no shipping_history table declared   (exit=0, FAIL line)
supply-planning-route-inventory                    D locked generation delegates to KMORCH
```

The suite count rose from 604 to 605: this round's `s8-r4a1-harness-resilience.test.js`, which passes.
No Product repair was made in this round, and none of the seven moved.
