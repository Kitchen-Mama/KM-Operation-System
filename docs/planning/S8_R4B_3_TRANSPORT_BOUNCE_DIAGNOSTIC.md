# S8-R4B-3 — TRANSPORT BOUNCE DIAGNOSTIC

**DIAGNOSTIC ONLY.** No transport repaired, no Product runtime changed, no new Production traffic created —
every number here is recomputed from the R4A1 acceptance dataset.

---

## 1. Terminology, frozen

```
LOGICAL_BROWSER_READ          one browser/network request identity (one Chrome networkId) initiated by
                              the application. The client calls fetch() once.
SERVER_EXECUTION              one actual Apps Script handler execution. Identified by a distinct
                              /exec hop producing a distinct user_content_key.
EXEC_HOP_COUNT_PER_LOGICAL_READ   server executions caused by one logical browser read.
                              TARGET = 1. Not implemented in this round.
```

The distinction is the whole finding: **the client's request count and the server's execution count are not
the same number**, and every instrument before this one reported only the first.

## 2. Quantified — recomputed from the R4A1 dataset

```
TOTAL_LOGICAL_READS   = 137
BOUNCED_LOGICAL_READS = 7
BOUNCE_RATE           = 5.1%
EXEC_HOP_DISTRIBUTION = 1 exec: 130 reads  |  2 exec: 6 reads  |  3 exec: 1 read
SERVER_EXECUTIONS     = 145 for 137 logical reads   (+5.8% invisible server load)

AFFECTED_ACTIONS  = skuDetails.workspace.get ×2 · shipment.workspace.get ×2 ·
                    fcSummary.workspace.get ×1 · overseasStock.workspace.get ×1 · getTable ×1
AFFECTED_SURFACES = SKU Details ×2 · Shipment Overview ×2 · FC Summary ×1 ·
                    Overseas Inventory ×1 · Carrier Rate Card ×1
AFFECTED_SCENARIOS= F-mount ×4 · A-cold ×2 · F-interact ×1
```

> The earlier figure of "7 of 145" conflated reads with executions. **7 of 137 logical reads** bounced, and
> those 7 produced **15 executions where 7 were asked for**; 145 is the *execution* total. Same defect,
> correct denominator.

Five distinct actions across five surfaces. **The bounce is not action-specific and not surface-specific** —
which is itself evidence that it belongs to the transport and not to any handler.

| ACTION | SURFACE | SCENARIO | KM_RID | EXECS | WALL ms | FINAL RESULT | VISIBLE FAILURE |
|---|---|---|---|---|---|---|---|
| `fcSummary.workspace.get` | FC Summary | A-cold | REQ-C000002 | **3** | 45 787 | `ERR_ABORTED` | **YES** |
| `skuDetails.workspace.get` | SKU Details | A-cold | REQ-C000001 | 2 | 56 005 | HTTP 200 | NO |
| `skuDetails.workspace.get` | SKU Details | F-mount | REQ-C000003 | 2 | 58 436 | `ERR_ABORTED` | **YES** |
| `overseasStock.workspace.get` | Overseas Inventory | F-mount | REQ-C000005 | 2 | 53 877 | HTTP 200 | NO |
| `shipment.workspace.get` | Shipment Overview | F-mount | REQ-C000007 | 2 | 60 017 | `ERR_ABORTED` | **YES** |
| `shipment.workspace.get` | Shipment Overview | F-interact | REQ-C000008 | 2 | 41 091 | `ERR_ABORTED` | **YES** |
| `getTable` | Carrier Rate Card | F-mount | – | 2 | 23 249 | **HTTP 404** | **YES** |

**Five of seven bounced reads failed visibly.** Two succeeded after ~55 s. A bounced read is not a slow
read — it is mostly a *failed* read that cost two or three server executions on the way to failing.

## 3. Per-hop detail (§5)

Representative — the 3-execution chain. All seven have the same alternating shape.

```
fcSummary.workspace.get / FC Summary / A-cold          networkId …51968.195   (ONE fetch)

HOP  URL_CLASS  METHOD  HTTP_STATUS    REDIRECT_TO   KM_RID        USER_CONTENT_KEY  BODY        HANDLER_EXECUTED
 1   EXEC       GET     not-observed   ECHO          REQ-C000002   none              NO (query)  YES (inferred)
 2   ECHO       GET     not-observed   EXEC          –             present #1        NO (query)  NO
 3   EXEC       GET     not-observed   ECHO          REQ-C000002   none              NO (query)  YES (inferred)
 4   ECHO       GET     not-observed   EXEC          –             present #2        NO (query)  NO
 5   EXEC       GET     not-observed   ECHO          REQ-C000002   none              NO (query)  YES (inferred)
 6   ECHO       GET     not-observed   (chain end)   –             present #3        NO (query)  NO

distinct user_content_keys in this chain: 3    (values redacted — a key is a token)
```

**What is observed and what is inferred, kept apart:**

| | |
|---|---|
| **Observed** | one networkId across all 6 hops · the alternating EXEC/ECHO URL classes · the same `km_rid` on every EXEC hop · three *distinct* `user_content_key` values · GET throughout, no body · the final `ERR_ABORTED` and, on Carrier Rate Card, an HTTP **404** |
| **Inferred** | `REDIRECT_TO` — read from the *next* hop's URL class, not from a `Location` header · `HANDLER_EXECUTED` — a new `user_content_key` cannot be minted without the handler running |
| **Not observed** | the per-hop HTTP status and the `Location` header. R4A intercepted at the Request stage only and never recorded `redirectResponse`. |

**That gap is now closed for the next run.** The harness records
`Network.requestWillBeSent.redirectResponse` — status, statusText, mime, and the Location reduced to
*presence and class*, never the token. It needed **no change to the interception stage**: Fetch stays at
`Request`, nothing is intercepted at `Response`, and the pre-network safety guarantee is untouched. Pinned
by the suite, because buying observability with that guarantee would be a bad trade made quietly.

## 4. Ownership (§8)

```
BOUNCE_OWNER = APPS_SCRIPT_PLATFORM  (the ECHO endpoint emits the redirect back to /exec)
ROOT_CAUSE_CONFIDENCE = ownership HIGH · mechanism LOW
```

The three candidates the task required be kept apart:

**A — a redirect required by the platform.** `exec → echo` is **confirmed A**. Apps Script serves
`ContentService` output from `script.googleusercontent.com` behind a 302; every one of the 137 logical reads
makes this hop, including the 130 clean ones. It is normal and not a defect.

**B — a redirect introduced by our transport.** **Ruled out, on code and on evidence.**
`_kmReadUrl_` builds every URL from `base`; `_kmGapRead_` states the redirect URL *"is never stored, never
re-requested and never treated as an endpoint: every attempt is rebuilt from `base`"*; its own recovery
allocates a **fresh request id**, and the observed chains keep **one** `km_rid` throughout. One networkId
means the browser, not the application, issued hops 3 and 5. There is no service worker in the repository.

**C — a platform redirect our implementation handles incorrectly.** **Open, and the leading candidate for
the `echo → exec` hop.** This codebase already names the family: `km-transport.js:203` defines
`HTML_SOURCE.EXPIRED_USERCONTENT_REDIRECT`, and `:268` codes the exact signature
`httpStatus === 404 && redirected === true && source === EXPIRED_USERCONTENT_REDIRECT`. The operator-facing
text reads *"reload the page so the Apps Script session redirect is re-established"* — so the system already
believes there is a session-scoped redirect that can expire. **R4A observed precisely that outcome**: the
Carrier Rate Card chain ended HTTP 404.

What would distinguish A from C in one run: the status and `Location` of the `echo → exec` hop, which the
capture added in this round now records. **A 302 from `echo` carrying a `Location` back to `/exec` is C.**

**Not the owner:** FRONTEND_TRANSPORT (ruled out above) · SERVICE_WORKER (none exists) · BROWSER (following
a `Location` is correct behaviour) · DEPLOYMENT_REDIRECT (the stable `/exec` is reached directly on hop 1).

## 5. Correlations

### §11 — FC Summary

```
FC_BOOTSTRAP_EXEC_HOPS = 1
FC_REGULAR_EXEC_HOPS   = 3
FC_16S_SAMPLE_BOUNCED  = YES
FC_CONCURRENT_READ_CAUSALITY = INCONCLUSIVE   (unchanged, as instructed)
```

This is the cleanest result in the round. On the cold FC Summary mount the two concurrent slices behaved
**completely differently**:

- `bootstrap` (REQ-C000001) — **1 execution**, HTTP 200 in 14.0 s. Clean.
- `regular` (REQ-C000002) — **3 executions**, aborted at 45.8 s.

So the "two concurrent reads cost ~16 s each" framing never described what happened. One slice was clean and
roughly a cold-boot single read; the other was bounced three times and failed. **The 62 s cold FC Summary is
a bounce observation, not a concurrency observation.**

That weakens the contention hypothesis further rather than supporting it, and it leaves
`FC_CONCURRENT_READ_CAUSALITY = INCONCLUSIVE` exactly where it was — the controlled comparison still has not
been run. Across the whole dataset FC Summary made 12 logical reads with exec-hop counts
`1,3,1,1,1,1,1,1,1,1,1,1`: **one bounce in twelve.** Nothing is serialized, combined or deferred.

### §10 — the Shipment 150 s outlier

```
SHIPMENT_150S_SAMPLE_BOUNCED = UNKNOWN — and unknowable from R3B
EXEC_HOP_COUNT               = not recorded by that instrument
TRANSPORT_CORRELATION        = PLAUSIBLE, unproven
```

The R3B sample is not in the R4A dataset, so it cannot be looked up. More importantly it could not have been
measured: **`s8-r3b-fatigue-runner.js` uses Node's global `fetch` with default `redirect: 'follow'`** and
records only total wall time. A bounced chain and a single slow execution are *the same observation* to that
instrument.

Two bounced `shipment.workspace.get` reads appear in R4A (of 12 logical), so the action demonstrably can
bounce. A 150 s wall time is consistent with a multi-execution chain — but consistent is not proven, and
**no shipment repair follows from this.**

**A caveat that matters more than the shipment case:** R3B's Site Inventory degradation
(31.7 → 71.4 → 133.8 s) was measured with the **same redirect-following instrument**. Those numbers may
include bounce multiplication too. R4B-2 must count exec hops or it will reproduce R3B's ambiguity at
greater cost.

### §9 — Request Order interstitial

```
REQUEST_ORDER_INTERSTITIAL_TRANSPORT_CORRELATION = LIKELY
```

**Evidence.** `requestOrder.workspace.get` is on the GET read table (`01_router.gs:90`) and therefore uses
the identical `/exec → echo` transport as the seven bounced reads. The interstitial symptom — an HTML page
where JSON was expected — is the output the transport's own classifier is built to fingerprint
(`HTML_SOURCE`, seven variants including `GOOGLE_AUTH_OR_ACCESS` and `EXPIRED_USERCONTENT_REDIRECT`). R4A
observed a bounced chain terminating in an HTTP 404 on Carrier Rate Card, which is the same class of
outcome from a different surface.

Not PROVEN: the R3B observation itself carries no hop detail, and an interstitial can also come from an auth
or access state unrelated to bouncing. **No new read is required to make this determination**, so none is
requested and the approved read surface is not expanded. If R4C exercises `requestOrder.workspace.get` with
the hop capture, it settles at no extra cost.

## 6. Repair

```
TRANSPORT_REPAIR_REQUIRED      = UNKNOWN — the mechanism is not yet established
ARCHITECTURE_DECISION_REQUIRED = YES, if the repair turns out to be C
```

Nothing is implemented. The options, for the gate only:

| | Option | Depends on | Architecture decision |
|---|---|---|---|
| T-1 | collect the redirect status/Location on the next run (already wired, costs nothing) | — | NO |
| T-2 | if C: adjust request construction (`credentials`, `cache`, header handling) so the echo hop is accepted first time | T-1 | **YES** — it changes the shipped transport contract |
| T-3 | if A: accept the bounce and make the client bound per-hop rather than per-chain, so a bounced read fails fast instead of consuming 45 s | T-1 | **YES** — changes timeout semantics |
| T-4 | surface `EXEC_HOP_COUNT` in the response meta so the bounce is visible in production, not only under a harness | — | NO, but it is a product change and out of this round |

**T-1 is the only one that should happen next, and it is already in place.**

---

## 7. R4B-2 — Site Inventory controlled Search: DB TOUCH PREFLIGHT

For the **next** round. Not consumed here — no Search was executed.

Classifications below are read from `s8-data-classification.js`, not asserted from memory. **They correct
the labels used in the R4B preflight**, which said "PROTECTED_PRODUCTION" generically; the registry's actual
classes are `PROTECTED_MASTER`, `REBUILDABLE_OPERATIONAL_STATE` and `TEST_OWNED_TRANSACTION`.

```
RUNTIME_OWNER        = handleInventoryReplenishmentWorkspaceGet_ (60_), via the canonical GET read route
ACCESS               = READ only, on every table. No INSERT, UPDATE or DELETE anywhere in R4B-2.
DIRECT_CELL_WRITE    = NO
EXPECTED_SCOPE       = one scoped Search (one country + one marketplace), repeated 3× immediately to
                       reproduce the R3B degradation, plus one warm repeat. 4 reads total.
EXPECTED_MAX_ROW_COUNT = bounded by SIR_WS_ROW_MAX_ = 80000; truncation reported via `capped`, never silent
RECOVERY/CLEANUP     = not applicable — a read creates nothing to undo
TEST_LINEAGE         = R3B read-path fatigue → R4A/R4A1 browser fatigue → R4B-2
```

| # | TABLE | REGISTRY CLASSIFICATION | ACCESS | APPROVAL |
|---|---|---|---|---|
| 1 | `marketplaces` | PROTECTED_MASTER | READ | required |
| 2 | `marketplace_skus` | PROTECTED_MASTER | READ | required |
| 3 | `sku_details` | PROTECTED_MASTER | READ | required |
| 4 | `warehouses` | PROTECTED_MASTER | READ | required |
| 5 | `amazon_inventory_snapshot` | PROTECTED_MASTER | READ | required |
| 6 | **`amazon_inventory_health_snapshot`** | **UNAUTHORIZED_UNKNOWN** (registered = false) | **READ** | **pre-approved by operator for this round; PERMANENT_REGISTRY_CHANGE = NO** |
| 7 | `amazon_daily_sales_snapshot` | PROTECTED_MASTER | READ | required |
| 8 | `amazon_weekly_sales_snapshot` | PROTECTED_MASTER | READ | required |
| 9 | `fc_regular_forecast` | PROTECTED_MASTER | READ | required |
| 10 | `fc_target_rules` | PROTECTED_MASTER | READ | required |
| 11 | `fc_special_events` | PROTECTED_MASTER | READ | required |
| 12 | `overseas_inventory_snapshot` | REBUILDABLE_OPERATIONAL_STATE | READ | required · **no mutation (Rule 10)** |
| 13 | `factory_stock` | REBUILDABLE_OPERATIONAL_STATE | READ | required · **no mutation (Rule 10)** |
| 14 | `shipments` | TEST_OWNED_TRANSACTION | READ | required |
| 15 | `shipment_lines` | TEST_OWNED_TRANSACTION | READ | required |
| 16 | `shipping_plans` | TEST_OWNED_TRANSACTION | READ | required |
| 17 | `shipping_plan_lines` | TEST_OWNED_TRANSACTION | READ | required |
| 18 | `shipping_allocation_drafts` | TEST_OWNED_TRANSACTION | READ | required |
| 19 | `shipping_allocation_draft_lines` | TEST_OWNED_TRANSACTION | READ | required |
| — | `carrier_lead_times` | PROTECTED_MASTER | **NOT READ** | include-gated on `carrierPlanning`; R4B-2 will not set it |
| — | `carrier_rate_cards` | PROTECTED_MASTER | **NOT READ** | as above |

**19 tables read.** Nothing outside this list; a 20th appearing at runtime is a STOP under Rule 3.

```
campaigns          REGISTRY_CLASSIFICATION = PROTECTED_MASTER, registered = true   (confirmed, §12)
campaign_sku_lines REGISTRY_CLASSIFICATION = PROTECTED_MASTER, registered = true   (confirmed, §12)
```

Neither is in the Site Inventory read set — they belong to the FC `graph` slice, which runs only after a
write attempt. **Out of scope for R4B-2 and not read by it.**

**What R4B-2 must record that R3B could not:** `EXEC_HOP_COUNT_PER_LOGICAL_READ`, the handler's own
`slowestTables` / `tableMs` / `openMs`, and `serverDurationMs` alongside client wall time. Without the first
of these, a repeat of R3B's degradation cannot be attributed between a slow handler and a bounced chain.

---

## 8. R4B-1 — Factory Guard implementation boundary

Prepared, **not executed**.

```
DB_WRITE_REQUIRED              = NO
API_CONTRACT_CHANGE            = YES, additive only (gains a GET route, keeps POST)
ARCHITECTURE_DECISION_REQUIRED = NO
DB TABLES READ (unchanged by the fix) = warehouses · factory_stock · shipping_allocation_drafts ·
                                        shipping_allocation_draft_lines · shipping_plans · shipping_plan_lines
DB TABLES WRITTEN              = none
```

| | |
|---|---|
| **FILES_TO_CHANGE** | `01_router.gs` (add to `rtrGetReadHandlers_`) · `operation-system-db-api.js` (add to `_KM_GET_READ_ACTIONS_`; route `KM.DB.factoryStockGuardGet` through the read dispatcher) · `s8-r3b-read-allowlist.js` (verb) · `s8-r3b-read-path-fatigue-safety.test.js` (assertion A5) |
| **FILES_NOT_TO_TOUCH** | `71_api_v1_factory_stock_guard.gs` — the handler is correct and read-only; the defect is entirely in how it is reached · `shipping-plan.js` beyond its single call site · the POST branch at `01_router.gs:1160`, which stays for compatibility |
| **BACKEND_ACTIONS_AFFECTED** | `factoryStockGuard.get` only |
| **FRONTEND_CALLERS_AFFECTED** | one — `shipping-plan.js:1536` |
| **CACHE_BEHAVIOR_CHANGE** | none |
| **TRANSPORT_BEHAVIOR_CHANGE** | YES — the point of the repair: POST → GET, a read request id instead of a write one, and a timeout that reports a read as retryable rather than INDETERMINATE |
| **PUBLIC_API_CONTRACT_CHANGE** | additive; no action name, payload or response shape changes |
| **PRODUCT_BEHAVIOR_CHANGE** | the Weekly Shipping Plan factory-availability indicator should resolve instead of failing |

**One thing to be deliberate about:** `s8-r3b-read-path-fatigue-safety.test.js:118` asserts
*"factoryStockGuard.get is the ONE approved read that travels on POST"*. That assertion is **correct today**
and becomes false **by design**. It must be re-aimed at the new contract, never deleted — a safety assertion
that is removed because it started failing is how a contract quietly stops being checked.
