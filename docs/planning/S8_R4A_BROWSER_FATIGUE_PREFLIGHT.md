# S8-R4A — Browser / Route-Level Read Fatigue: DB Touch Preflight + CDP Safety Design

**Status:** PREFLIGHT AND SAFETY DESIGN ONLY — awaiting operator approval. No browser fatigue executed, no
Production request sent, nothing written, nothing deleted.
**Governed by:** [S8_STANDING_DB_AUTHORIZATION_GATE.md](S8_STANDING_DB_AUTHORIZATION_GATE.md) (authoritative).
**Carries:** [S8_R3B_READ_PATH_FATIGUE_RESULTS.md](S8_R3B_READ_PATH_FATIGUE_RESULTS.md).

```
S8_R4A_PREFLIGHT_READY       = YES
R4A_BROWSER_EXECUTION_SAFE   = YES, conditional on the four approvals in §11
PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_ROWS_DELETED = 0   PRODUCTION_FATIGUE_EXECUTED = NO
R4A_WRITE_TABLE_COUNT = 0     R4A_DELETE_TABLE_COUNT = 0
```

---

## §0 — The one thing that changed my own design

The CDP guard was written host-first: *is this `script.google.com`?* — and everything else was third-party,
therefore allowed. The local interception proof aimed `gapJob.status.get` at a sink on `127.0.0.1` and **the
sink recorded it arriving.**

A guard whose refusal depends on the destination is not refusing the action; it is refusing one address for it.
The guard now extracts the action from **every** request and a recognised application action makes the request
an application request regardless of host. The proof fires four requests across two hosts for exactly this
reason — running only the application-host pair is how the broken version passed its own first run.

This is first because it is the kind of defect that would have been discovered in Production or not at all.

---

## §1 — Repository state

```
FEATURE_HEAD   = this round's commit        ORIGIN_FEATURE = 811feb7 at round start, then pushed
MAIN_HEAD      = 26e5f10                    ORIGIN_MAIN    = 26e5f10
FEATURE_REMOTE_SYNCED = YES                 MAIN_UNCHANGED = YES
```

`811feb7` was still unpushed at the start of this round and was a clean fast-forward of `origin/feature`, so it
was pushed. `main` was not touched, not merged into, and not fast-forwarded.

---

## §2 — Proposed browser surfaces

Twelve were offered for evaluation. **Eleven are proposed; one is not.** Section id is the `KM.lifecycle`
registration key — this is a single-page application (`index.html` + `partial-loader` + `lifecycle`), so a
"route" is a section switch, not a URL.

| # | Surface | Section id | Page file | Mount reads | Lazy / user | Deferred | Writes reachable |
|---|---|---|---|---|---|---|---|
| 1 | FC Summary | `fc-summary-section` | `fc-summary.js` | partial HTML → `fcSummary.workspace.get` | `fcSummary.workspace.get` with `include.slice` | — | 0 |
| 2 | SKU Details | `sku-section` | `sku-details.js` | `skuDetails.workspace.get` | — | — | 0 |
| 3 | SKU Regional Details | `sku-regional-details-section` | `sku-regional-details.js` | **`getOperationDb`** + `skuDetails.workspace.get` | — | — | `pricing.update` |
| 4 | Factory Inventory | `factory-stock-section` | `factory-stock.js` | **`getTable`** ×3 (`factory_stock`, `sku_details`, `warehouses`) | `getTable` ×2 | — | 4 |
| 5 | Overseas Inventory | `overseas-stock-section` | `overseas-stock.js` | `overseasStock.workspace.get` (+ legacy `getTable` ×4) | — | — | 0 |
| 6 | Weekly Shipping Plan | `shippingplan-section` | `shipping-plan.js` | **`getOperationDb`** | `weeklyShipping.workspace.get`, `factoryStockGuard.get` | — | 1 |
| 7 | Shipment Overview | `shippinghistory-section` | `shipping-history.js` | **`getOperationDb`** | `shipment.workspace.get` | — | 0 |
| 8 | Shipment Draft | `shipment-draft-section` | `shipping-history.js` | **`getOperationDb`** | `shipment.workspace.get` | — | 0 |
| 9 | On-the-Way Map | `global-logistics-map-section` | `global-logistics-map.js` | `shipment.workspace.get` | — | — | 3 |
| 10 | PO Overview | `purchase-order-overview-section` | `purchase-order-overview.js` | **`getOperationDb`** + `purchaseOrder.workspace.get` | — | — | 0 |
| 11 | Carrier Rate Card | `carrier-rate-card-section` | `carrier-rate-card.js` | **`getTable`** ×2 (`carrier_rate_cards`, `carriers`) + **`getOperationDb`** | deferred read `carrier_lead_times` | `carrierRateCard.leadTimes` | 0 at mount |
| — | **Site Inventory** | `ops-section` | `inventory-replenishment.js` | see §7 | | `gapJob.status.get:INVENTORY` | 2 |

`MOUNT OWNER` is `KM.lifecycle.switchTo` → `registry[section].mount(epoch)`; `LIFECYCLE OWNER` is
`assets/js/core/lifecycle.js`, which also owns the per-page listener scope released on unmount. That matters for
§12's listener-duplication question: the lifecycle manager, not each page, is where a leak would show.

**Carrier Rate Card is proposed, reversing S8-R3A.** R3A deferred it because the page reaches
`carrierLeadTime.upsert`. At *route level* that is not a mount read — the mount is two `getTable` calls plus the
broad read, and the write is behind a user action the scenario matrix forbids. Under deny-by-default
interception the write cannot leave the browser even if something tried.

**Request Order is absent**, as the task's list has it. It was S8-R3B surface 7; it is not proposed here.

### Where the census stops seeing

The mount trace follows local function calls two levels deep. FC Summary's mount calls `window.initFcSummaryPage`,
a **global**, so the trace stops there and the entry was recovered by reading the file's three
`KM.api.getWorkspace('fcSummary', …)` call sites directly. Stated because a reader is entitled to know which
rows rest on a weaker derivation.

---

## §3 — The additional action set

```
R4A_ADDITIONAL_ACTION_COUNT = 5
R4A_ADDITIONAL_ACTION_SET   = getOperationDb · getTable · getClientCapabilities ·
                              inventoryScope.registry.get · system.health
R4A_APPROVED_ACTION_CANDIDATE_SET = the 11 frozen in S8-R3B + these 5 = 16
```

**S8-R3B's own estimate was wrong and this corrects it.** R3B §6 proposed four additional actions —
`getTaxReferralRates`, `getTaxRateComponents`, `getSkuRegionalDetails`, `loadOperationDb`. The first three are
not actions at all: they are **cache accessors** over `window._opDbCache`, which is filled by `getOperationDb`
or `getTable`. The fourth is a client orchestrator whose action is `getOperationDb`. The real set is below.

| | `getOperationDb` |
|---|---|
| HTTP VERB PATH | GET, `?action=getOperationDb&_ts=…` — its own `doGet` branch, not the read table |
| ROUTER CLASSIFICATION | `doGet` own branch (`01_router.gs:255`) |
| HANDLER | `handleGetOperationDb_` (`03_master_data_handlers.gs:55`) |
| TABLES READ | **44** — the handler's own `validTabs`, read in one execution |
| ZERO-WRITE PROOF | handler body sliced by brace depth, comments *and* string literals stripped: **no** write primitive, and none in the 3 helpers it calls |
| PAGE CALLER | `loadOperationDb` → `getOperationDbFromSheet` ; mount read on surfaces 3, 6, 7, 8, 10, 11 |
| WHY R4A NEEDS IT | it is a **mount** read on six of the eleven surfaces. A browser round that excluded it would not be measuring those pages at all |
| R3A APPROVED | **NO** |

| | `getTable` |
|---|---|
| HTTP VERB PATH | GET, `?action=getTable&table=<name>` — own `doGet` branch |
| ROUTER CLASSIFICATION | `doGet` own branch (`01_router.gs:259`) |
| HANDLER | `handleGetTable_` (`03_:76`) — refuses any name outside the **same 44** `validTabs` |
| TABLES READ | exactly one per request |
| ZERO-WRITE PROOF | as above — none direct, none one level down |
| PAGE CALLER | `loadScopedTables`, `refreshCacheTables`, `refreshFactoryStockTables`; **one request per table name** |
| WHY R4A NEEDS IT | mount read on surfaces 4, 5 (legacy), 11; it is also the single largest source of request-count amplification, which is §13's whole subject |
| R3A APPROVED | **NO** |

| | `getClientCapabilities` |
|---|---|
| HTTP VERB PATH | GET, own `doGet` branch (`01_router.gs:264`) |
| HANDLER | `handleGetClientCapabilities_` (`03_`) — no spreadsheet read; feature flags only |
| TABLES READ | **none** |
| ZERO-WRITE PROOF | none direct, none in 5 helpers |
| PAGE CALLER | `app.js` DOMContentLoaded → `KM.DB.applyClientCapabilities()`, fire-and-forget, declared to the boot arbiter |
| WHY R4A NEEDS IT | it fires on **every** session before any route. Blocking it would change boot timing and make every cold measurement a measurement of the guard |
| R3A APPROVED | **NO** |

| | `inventoryScope.registry.get` |
|---|---|
| HTTP VERB PATH | GET, own `doGet` branch (`01_router.gs:289`); routed on both verbs |
| HANDLER | `handleInventoryScopeRegistryGet_` (`64_api_v1_scope_registry.gs`) |
| TABLES READ | **1** — `marketplaces`, a six-column bounded projection |
| ZERO-WRITE PROOF | none direct, none in 7 helpers |
| PAGE CALLER | Site Inventory `_irBootstrapScope_`, at t≈120 ms per the boot arbiter's measured timeline |
| WHY R4A NEEDS IT | it is one of the four requests in the cold-boot race the arbiter exists to fix. Measuring Site Inventory without it measures a different page |
| R3A APPROVED | **NO** |

| | `system.health` |
|---|---|
| HTTP VERB PATH | GET **and** POST — deliberately routed on both (`01_router.gs:273`) |
| HANDLER | `handleSystemHealth_` (`63_api_v1_system_health.gs`) |
| TABLES READ | **none** — returns no spreadsheet id, Drive id, token or row data |
| ZERO-WRITE PROOF | none direct, none in 10 helpers |
| PAGE CALLER | `KM.DB.checkDeploymentContract` / `checkPageDeploymentContract(pageKey)` — **conditional**, fired by a page that asks whether the deployment can serve its read |
| WHY R4A NEEDS IT | it is conditional, so it *may* fire during a route cycle. Under deny-by-default an unapproved request is aborted — which would turn a normal deployment check into a visible error and contaminate §12's `CONSOLE_ERROR_COUNT` |
| R3A APPROVED | **NO** |

**Not inferred from the name.** Every one of the five was read as code: handler body sliced by brace depth, with
comments and string literals stripped first, plus every named helper it calls followed one level down. Result
for all five: **no `setValue(s)`, `appendRow`, `insertSheet`, `deleteRow`, `clearContent*`, `setProperty`,
`deleteProperty`, `DriveApp`, `MailApp`, `newTrigger`, `deleteTrigger` or `LockService`.**

---

## §4 — `gapJob.status.get` hard exclusion

```
REACHABLE_FROM_BROWSER            = YES — from ONE surface only
INTERCEPTION_REQUIRED             = YES
REQUEST_CAN_BE_ABORTED_PRE_NETWORK = YES — demonstrated, see §5
```

| Surface | `GAP_JOB_STATUS_REACHABLE` | Condition | Interceptable pre-network |
|---|---|---|---|
| 1–11 (all others) | **NO** | the string does not occur in any of those page files | n/a |
| Site Inventory | **YES** | `_irResumeGapJobOnMount_` → boot-arbiter deferred lane → `resumeIfRunning({product:'INVENTORY'})`, which **short-circuits unless `mayHaveActiveJob('INVENTORY')`** — and that reads `localStorage`, not the server | **YES** |

Ten of the eleven proposed surfaces cannot reach it at all. The eleventh reaches it through a client-side
condition, which is why the gate's more-restrictive reading applies: client state is not a server guarantee.

---

## §5 — CDP interception design

```
CDP_INTERCEPTION_LAYER        = Fetch domain — Fetch.enable / Fetch.requestPaused /
                                Fetch.failRequest / Fetch.continueRequest
MATCH_KEY                     = the application ACTION, from the URL query or the POST body
ALLOWLIST_OWNER               = KMS8R3B (assets/tools/s8-fatigue/s8-r3b-read-allowlist.js) — injected,
                                never duplicated, so there is one allowlist in the system
DENY_DEFAULT                  = YES
ABORT_METHOD                  = Fetch.failRequest, errorReason BlockedByClient
REQUEST_SENT_BEFORE_DECISION  = NO
```

`Fetch.enable({ patterns: [{ urlPattern: '*', requestStage: 'Request' }] })` pauses each request **before it is
issued**. Two alternatives are named forbidden in the guard, because either would silently invert the property
the design exists for:

```
FORBIDDEN  requestStage: 'Response'               the request has already been sent
FORBIDDEN  Network.setRequestInterception         observation, not control
```

### Demonstrated, not asserted

`assets/tools/s8-fatigue/s8-r4a-cdp-proof.js` — local only, no Production request. A TLS sink on `127.0.0.1`
records everything that actually arrives; Chrome resolves the application host to it via
`--host-resolver-rules`. Four requests, two hosts:

```
local  https://127.0.0.1:PORT/exec?action=fcSummary.workspace.get   ABORT  ENDPOINT_NOT_STABLE_EXEC
local  https://127.0.0.1:PORT/exec?action=gapJob.status.get         ABORT  ACTION_FORBIDDEN
app    https://script.google.com/macros/s/…/exec?action=fcSummary…  ALLOW
app    https://script.google.com/macros/s/…/exec?action=gapJob…     ABORT  ACTION_FORBIDDEN

sink saw 1 of 5 requests — the permitted read, and nothing else
16 checks, 0 failures
```

The sink is the witness. A request sent and then cancelled would still have been recorded; nothing carrying the
forbidden action ever arrived. The TLS sink is required rather than convenient: over plain http the permitted
request would be refused for the *wrong* reason (`ENDPOINT_NOT_STABLE_EXEC`) and the proof would stop exercising
the allow path at all — so the tool **stops** if it cannot build one rather than degrading.

---

## §6 — Non-application network traffic

| Class | Policy | Why |
|---|---|---|
| **A** STATIC_ASSET | **CONTINUE**, counted | same-origin HTML partials (`assets/html/pages/*.html`), scripts, styles, fonts, images, and non-network schemes. A guard narrow enough to be safe can also block the application's own stylesheet, and a page that never rendered produces measurements that look like a performance finding |
| **B** APPROVED_APPLICATION_READ | **CONTINUE**, counted and timed | on the frozen allowlist, correct verb, stable `/exec` endpoint |
| **C** FORBIDDEN_APPLICATION_ACTION | **ABORT**, counted, itemised | never retried, never substituted with another action |
| **D** THIRD_PARTY / PLATFORM | **CONTINUE**, and record the chain | includes the `script.googleusercontent.com` echo target — blocking it means no answer ever arrives. **A Google interstitial or redirect stays observable**; converting it to a success would erase the evidence S8-R3B F3 needs |
| **E** UNKNOWN | **ABORT and REPORT** | an application-shaped request nobody classified is exactly what standing-gate rule 2 is about |

An application-host request carrying **no** action is class E, not D — the one exception being the echo target,
which is part of every answer.

---

## §7 — Site Inventory

```
SITE_INVENTORY_ROUTE_LEVEL_TEST_SAFE = YES — conditional on an ephemeral browser profile (§11.4)
EXPECTED_FORBIDDEN_REQUEST_COUNT     = 0 on a fresh profile; 1 per mount if a job marker exists
EXPECTED_ABORT_BEHAVIOR              = net::ERR_BLOCKED_BY_CLIENT; the client classifies it
                                       HTTP_TRANSPORT_ERROR
EXPECTED_UI_EFFECT                   = none visible. The Recalculate button stays in its idle label
```

The chain, traced rather than assumed:

```
_irResumeGapJobOnMount_            deferred lane, boot arbiter
  └ resumeIfRunning({product:'INVENTORY'})
      ├ mayHaveActiveJob('INVENTORY') === false  → RESUME_SKIPPED_NO_KNOWN_JOB, NO REQUEST AT ALL
      └ otherwise → statusFn() → aborted at the socket
          → _kmGapRead_ catches → { success:false, error:{ code:'HTTP_TRANSPORT_ERROR' } }
          → _stateOf(res).status is undefined
              → not DONE, not PENDING, not RUNNING
              → clearJobLiveness(product) ; RESUME_SKIPPED ; return
```

No retry, no poll loop, no UI transition: `pollJob` is reached only for a PENDING/RUNNING status **with**
lifecycle liveness, and a transport error supplies neither. `ui.resume` fires only for an active job.

**The route does not become semantically invalid**, and that is the shipped source's own judgement, not mine —
the boot arbiter says of this read: *"This is a status poll for a gap job that is USUALLY NOT RUNNING, fired
unconditionally on every mount… Nothing on screen depends on it."*

**Three consequences the operator should weigh:**

1. **The abort writes to the browser's localStorage.** `clearJobLiveness(product)` runs on the refusal path. In
   a throwaway profile that is nothing; in the operator's own profile it would erase their memory of a running
   recalculation. **R4A must use a dedicated ephemeral profile.** This is §11.4.
2. **Each abort produces one console error.** `CONSOLE_ERROR_COUNT` must separate guard aborts from application
   errors or the measurement reports its own instrument.
3. **If anyone starts a gap job during the window**, a marker appears and the count stops being 0. §11's
   coordination contract covers it.

### Also on this surface

`refreshCacheTables(['shipping_allocation_drafts','shipping_allocation_draft_lines'])` asks `getTable` for two
names that are **not in its `validTabs`** — two refused requests per Search. It is now guarded: in workspace
mode the call returns early (`_irEffectiveWorkspace()`), so it should fire **zero** times. R4A can confirm that
cheaply, and a non-zero count would mean the page is in legacy mode.

---

## §8 — DB TOUCH PREFLIGHT

```
R4A_READ_TABLE_COUNT   = 51 distinct physical tables
R4A_WRITE_TABLE_COUNT  = 0        R4A_DELETE_TABLE_COUNT = 0
ACCESS for every table below            = READ
DIRECT_CELL_WRITE for every table below = NO
TEST_LINEAGE                            = N/A — a read-only round creates no rows
RECOVERY / CLEANUP MODEL                = NONE — READ ONLY; nothing to recover
EXPECTED_SCOPE                          = whole tab (getOperationDb / getTable are unfiltered) or the
                                          owner's own bound for a scoped workspace read
EXPECTED_MAX_ROW_COUNT                  = the tab's row count; the largest observed in S8-R3B was
                                          amazon_daily_sales_snapshot at 9 781
RUNTIME_OWNER                           = 03_ (getOperationDb / getTable) or the scoped owner in §2
```

The 44 tables of `handleGetOperationDb_`'s `validTabs` and the 44 approved in S8-R3A are **not the same 44**.
They overlap in 37.

### Already approved in S8-R3A and still read — 37 tables · approval NO

`sku_details` · `sku_regional_details` · `marketplace_skus` · `marketplaces` · `pricing_list` ·
`fc_regular_forecast` · `fc_special_events` · `fc_target_rules` · `campaigns` · `campaign_sku_lines` ·
`warehouses` · `logistics_locations` · `carriers` · `carrier_rate_cards` · `carrier_lead_times` ·
`shipment_route_templates` · `shipment_route_template_nodes` · `tax_referral_rates` · `tax_rate_components` ·
`amazon_inventory_snapshot` · `amazon_daily_sales_snapshot` · `amazon_weekly_sales_snapshot` ·
`request_orders` · `request_order_lines` · `request_order_line_sources` · `purchase_orders` ·
`purchase_order_lines` · `shipping_plans` · `shipping_plan_lines` · `shipments` · `shipment_lines` ·
`shipment_events` · `shipment_routes` · `factory_stock` · `overseas_inventory_snapshot` ·
`overseas_inventory_movements` · `amazon_inventory_health_snapshot`

### NEW — reached only because the whole-database read reaches them — 7 tables · **approval YES**

| TABLE | CLASSIFICATION | PURPOSE | SURFACE(S) | ACTION(S) | APPROVAL |
|---|---|---|---|---|---|
| `product_features` | **UNAUTHORIZED_UNKNOWN** | SKU feature master | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES — §9** |
| `sku_handbook_summaries` | **UNAUTHORIZED_UNKNOWN** | handbook text | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES — §9** |
| `pricing_change_log` | PROTECTED_PRODUCTION | pricing audit trail | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES** |
| `factory_stock_movements` | **MOVEMENT_RETAIN** | factory ledger | 4, 3, 6, 7, 8, 10, 11 | `getOperationDb`, `getTable` | **YES** |
| `request_order_allocation_drafts` | TEST_OWNED_TRANSACTION | RO allocation draft | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES** |
| `request_order_allocation_draft_lines` | TEST_OWNED_TRANSACTION | RO draft lines | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES** |
| `request_order_site_confirmations` | TEST_OWNED_TRANSACTION | RO site confirmation | 3, 6, 7, 8, 10, 11 | `getOperationDb` | **YES** |

`factory_stock_movements` is `MOVEMENT_RETAIN`. **READ only; rule 9 is untouched** — nothing in R4A deletes or
can delete a movement row, and the registry refuses it at the delete gate regardless.

### Approved in S8-R3A, still read via their scoped owners — 7 tables · approval NO

`shipping_allocation_drafts` · `shipping_allocation_draft_lines` · `generated_documents` ·
`factory_stock_override_audit` · `inventory_replenishment_gap` · `order_planning_gap` · `supplier_price_list`

These are **not** in the whole-database read's `validTabs`; they reach R4A only through the eleven scoped
actions already approved in S8-R3B. Listed so the total reconciles rather than appearing to shrink.

```
37 already approved + 7 new + 7 scoped-only = 51      WRITE 0      DELETE 0
```

**No INSERT, UPDATE or DELETE is requested on any table. No schema change. The registry is not extended.**

---

## §9 — Unregistered live tables

```
UNAUTHORIZED_UNKNOWN_READ_TABLES = product_features · sku_handbook_summaries ·
                                   supplier_price_list · amazon_inventory_health_snapshot      (4)
OPERATOR_APPROVAL_REQUIRED_TABLES = the 7 new tables in §8                                     (7)
```

`product_features` and `sku_handbook_summaries` are among the 43 observed live tabs outside the registry. They
are declared here because `getOperationDb` reads them, not because anything wants them.

**READ is proposed for operator approval. WRITE remains forbidden. Neither is added to the registry** — the
registry stays at 58 entries, exactly as `supplier_price_list` and `amazon_inventory_health_snapshot` did in
S8-R3B, and section J of the R3B suite asserts it.

---

## §10 — Browser fatigue scenario matrix (designed, not run)

Per approved surface:

| | Scenario | Shape | Count |
|---|---|---|---|
| **A** | COLD OPEN | hard reload (`Page.reload({ignoreCache:true})`), then first switch to the section | 1 per surface |
| **B** | WARM RETURN | switch away to a cheap neighbour, switch back | 3 per surface |
| **C** | REPEATED ROUTE CYCLES | full round of all surfaces, repeated | **8 cycles** — §13 needs ≥4 after excluding cycle 1, and 8 gives a tail long enough to call a rise monotonic |
| **D** | RAPID ROUTE CYCLES | 10 switches with no settle wait between them | 1 burst per surface pair |
| **E** | IDLE + RETURN | 10 min idle, then reopen | 1 per surface, Site Inventory and FC Summary first |
| **F** | FILTER / LAZY PANEL | read-only UI only: tab switch, filter, search, pagination, expand | per surface, scripted |

**Forbidden in every scenario, enforced by the guard and not by discipline:** Save · Submit · Confirm · Adjust ·
Dispatch · Approve · Cancel · Import · Recalculate · Generate document · Edit · any retry that is a write.
Under deny-by-default none of these can leave the browser even if a scripted interaction hit one by mistake.

Scenario D is deliberately bounded: a rapid burst is how lifecycle duplication shows, and also the fastest way
to put avoidable load on a Production backend whose reads already run 8–37 s.

---

## §11 — Human test coordination contract

The future execution report must publish, continuously:

```
AUTOMATED_FATIGUE_STATUS = RUNNING | COMPLETE
HUMAN_TEST_SAFE          = YES | NO
HUMAN_TEST_AVOID         = [the surfaces currently in the measurement window]
HUMAN_TEST_SAFE_SURFACES = [every other surface]
WINDOW_STARTED / WINDOW_ENDS
```

While `AUTOMATED_FATIGUE_STATUS = RUNNING`, the operator avoids the listed surfaces — not for safety (every
request is a read) but for **measurement integrity**: a human opening Site Inventory during a cycle adds
requests and backend queueing to a count that is the round's whole output.

Two measurement-integrity hazards specific to this round:

1. **A gap job started by anyone** puts a liveness marker in *their* browser, not the harness's — but a running
   job changes backend contention and `inventoryReplenishment.workspace.get` timings. §14 is about exactly that
   degradation, so a concurrent job would corrupt the finding.
2. **A write by anyone** changes row counts mid-run and breaks the row-count invariant that S8-R3B used as
   behavioural proof of zero writes.

### §11.4 — The four approvals R4A needs

```
1. the 7 new read tables in §8                                            (operator DB approval)
2. the 5 additional read actions in §3                                    (operator action approval)
3. CDP request interception as the enforcement mechanism                  (operator mechanism approval)
4. a DEDICATED EPHEMERAL CHROME PROFILE, never the operator's own         (operator acknowledgement)
```

Approval 4 is not a formality. The abort path calls `clearJobLiveness`, a localStorage write; run in the
operator's profile it would erase their record of a running recalculation.

---

## §12 — Measurement contract

| Metric | How it is detected — browser event, never a stopwatch |
|---|---|
| `PAGE_FIRST_CONTENT_READY_MS` | `Page.frameStoppedLoading` for the partial, or the section element gaining `.active` via a `MutationObserver` installed before the switch |
| `PAGE_DATA_READY_MS` | the settlement of the **last** class-B request in the mount set, from `Network.responseReceived` + `Network.loadingFinished` |
| `PAGE_FULL_STABLE_MS` | 2 s with no new request and no DOM mutation in the section subtree. Both conditions, because either alone is satisfied by a page that is still broken |
| `REQUEST_COUNT_TOTAL` | one `Fetch.requestPaused` per request — the guard sees every one by construction |
| `APPLICATION_READ_REQUEST_COUNT` | class B only |
| `DUPLICATE_REQUEST_COUNT` | same action **and** same `km_body` within one cycle, counted beyond the first |
| `FORBIDDEN_REQUEST_ABORT_COUNT` / `UNKNOWN_REQUEST_ABORT_COUNT` | the guard's ledger, itemised not just counted |
| COLD / WARM / RETURN | scenarios A / B / E, never averaged together |
| `FALSE_EMPTY_COUNT` | a successful class-B response with rows > 0 whose rendered row container is empty after `PAGE_FULL_STABLE_MS`. **Both halves required** — an empty table whose read returned nothing is correct, not a defect |
| `PERMANENT_LOADING_COUNT` | a loading indicator still present at `PAGE_FULL_STABLE_MS` + 30 s |
| `VISIBLE_ERROR_COUNT` | error elements in the section subtree |
| `CONSOLE_ERROR_COUNT` | `Runtime.consoleAPICalled` + `Log.entryAdded`, **with guard aborts subtracted and reported separately** |
| `N_PLUS_ONE_EVIDENCE` | ≥3 requests of the same action with different `km_body` inside one mount set |
| `REQUEST_LEAK_EVIDENCE` | §13 |
| `LISTENER_DUPLICATION_EVIDENCE` | `DOMDebugger.getEventListeners` on the section root before cycle 2 and after cycle 8; a count that grows with cycles |
| `LIFECYCLE_DUPLICATION_EVIDENCE` | `[Lifecycle] Mounted:`/`Unmounted:` console lines per cycle — must be exactly one each |
| `CACHE_HIT / MISS` | `Network.requestServedFromCache`, plus a class-B count of 0 for a registry that is already READY (the repo's own `cache_hit` target) |

The repository's existing acceptance numbers are used, not invented:
`KM_READ_TIMEOUT_MS_ = 45 000` · `metadata_cold` p50 1 500 / p95 4 000 ms · `workspace_scoped` p50 3 000 /
p95 8 000 ms · `cache_hit` = 0 requests.

---

## §13 — Request amplification detection

```
cycle 1   excluded — baseline, and the cycle where partials are still uncached
cycle 2   BASE
cycle 3..8 must equal BASE
```

Verdicts: `FLAT` · `REQUEST_LEAK_CANDIDATE` (rise in ≥60 % of tail steps **and** max delta > 0) ·
`VARIABLE_NOT_MONOTONIC` · `INSUFFICIENT_CYCLES` (< 4).

**Cycle 1 is excluded deliberately.** A page that caches its HTML partial on first open legitimately makes
*fewer* requests from cycle 2 onward; baselining on cycle 1 would report the cache working as a negative leak,
and scattered variance is not a leak either. Implemented and mutation-tested in
`KMS8R4A.amplification`.

---

## §14 — Site Inventory degradation scenario

S8-R3B measured 31.7 → 71.4 → 133.8 s under immediate repetition, recovering to 30–37 s when spaced. The
browser round must separate the candidate causes rather than pick one:

| Candidate | What the capture must show |
|---|---|
| client request stacking | `Fetch.requestPaused` timestamps — do the three component reads overlap? |
| route lifecycle duplication | exactly one Mounted/Unmounted pair per cycle; two mounts means two read sets |
| simultaneous component reads | the boot arbiter's declared critical lane vs the deferred lane, per cycle |
| server-side serialization | response **order** vs dispatch order. Out-of-order settlement with growing wait is queueing |
| ScriptLock contention | the read handlers hold no `LockService` (proved structurally in S8-R3B §2.5), so this can only come from a **concurrent write by someone else** — which is what §11's coordination window is for |
| backend cache behaviour | identical `km_body` across cycles with growing duration rules out a different amount of work |

Capture per request: dispatch time, first byte, settle time, overlap with every other open request, and the
section's lifecycle events on the same clock. **No fix in R4A.**

---

## §15 — FC Summary / SKU page reconciliation

S8-R3B measured FC Summary's read at ~8.1 s and `skuDetails.workspace.get` at ~9 s, against page-level history
of ~25 s and ~35 s. The gap is not in those two reads. What R4A will capture:

| Surface | Actions per mount | Serial or parallel | What else is in the page time |
|---|---|---|---|
| FC Summary | `fcSummary.workspace.get` FULL, **plus** `include.slice` variants | to be measured | the partial HTML fetch, `_fcSummaryStaticInit`, render of 942 rows |
| SKU Details | `skuDetails.workspace.get` | single | render, hydration |
| SKU Regional Details | **`getOperationDb` (44 tables)** + `skuDetails.workspace.get` | to be measured | the broad read is the obvious suspect and was never measured |

**A finding already visible without running anything:** SKU Regional Details mounts on the **whole-database
read**. S8-R3B measured only its scoped read and reported ~9 s. If `getOperationDb` is the dominant cost, the
historical ~28 s is explained by a read S8-R3B never issued — which is precisely why §3 asks for it.

FC Summary's slice variants are a second candidate: the page has three `getWorkspace('fcSummary', …)` call
sites, and only the slice-less one was measured. The `graph` slice is reachable **only after a write attempt**
and is therefore out of scope for a read-only round.

---

## §16 — Factory guard defect (observe only)

```
factoryStockGuard.get
PAGE_DEPENDENCY                    = Weekly Shipping Plan ONLY, and only while a Draft is being edited
CURRENT_TRANSPORT_DEFECT_OBSERVABLE = YES, but only under scenario F — it does not fire at mount
```

**This corrects S8-R3B's own attribution.** R3B labelled it "Factory Inventory / Weekly Shipping Plan guard
indicator". `factory-stock.js` does not reference it at all; the only caller is `shipping-plan.js:1536`,
`factoryStockGuardGet({ shipping_plan_id: planId })`.

R4A would **observe** the 22 % failure rate at route level and record how the page renders it. The verb is not
rewritten, the transport is not changed, and no repair is attempted. Including it in the allowlist asks the
operator to approve measuring a request whose current transport behaviour is known to be defective — it is
read-only either way (`zero_write: true`, `71_:266-280`).

---

## §17 — Request Order interstitial capture plan

S8-R3B saw one Google HTML page after 45.6 s on `requestOrder.workspace.get`. Request Order is **not** in the
R4A surface list, so the capture plan attaches to whichever surface reproduces it. Per occurrence:

```
request URL + action + km_rid        HTTP status of every hop
the full redirect chain              Network.requestWillBeSentExtraInfo / responseReceivedExtraInfo
content-type and body first 2 KB     final origin
the browser's visible outcome        the client's typed classification
timing of every hop                  whether a retry followed (there must be none)
```

Apps Script execution correlation is **operator-owned**: the execution transcript is in the Apps Script
project, which no agent reads. The capture gives the operator the `km_rid` and timestamp to match against it.

**Not classified as an application defect without evidence.** One occurrence in nine is a rate, not a cause.

---

## §18 — Shipment 150 s outlier

One sample of nine, against eight at 8.7–12.2 s. The plan is **repetition, not interpretation**: 30 samples of
`shipment.workspace.get` across scenarios A, B and C, each with full waterfall capture, and the outlier
classified only if it recurs.

```
no timeout increase        no blind retry        no architecture change
```

If it does not recur in 30 samples it is reported as **non-reproducible at n=30**, which is a result.

---

## §19 — Safety gates before execution

| Gate | State |
|---|---|
| `DB_TOUCH_PREFLIGHT_APPROVED` | **PENDING** — this document |
| `WRITE_TABLE_COUNT = 0` | YES |
| `DELETE_TABLE_COUNT = 0` | YES |
| `APPROVED_ACTION_ALLOWLIST_FROZEN` | YES — 11 + 5 pending approval; frozen in `KMS8R3B` |
| `gapJob.status.get` absent / blocked before network | **YES — demonstrated** (§5) |
| `UNKNOWN_APPLICATION_REQUEST_DEFAULT = ABORT` | YES |
| `REQUEST_SENT_BEFORE_DECISION = NO` | **YES — demonstrated** |
| `SCRIPT_TRIGGER_MUTATION_REACHABLE = NO` | YES — no approved action's owner contains `newTrigger`/`deleteTrigger` |
| `DRIVE_WRITE_REACHABLE = NO` | YES — no `DriveApp` in any approved owner |
| `PROPERTY_WRITE_REACHABLE = NO` | YES — no `setProperty`/`deleteProperty` in any approved owner |
| `DIRECT_CELL_WRITE_REACHABLE = NO` | YES — `directCellWriteAuthorized()` returns false for every table |

```
R4A_BROWSER_EXECUTION_SAFE = YES, conditional on the four approvals in §11.4
```

---

## §20 — What this round did not do

No browser fatigue. No Production request of any kind — the only browser launched talked to a loopback sink. No
write, no delete, no schema change, no registry change, no repair of F1–F4, no deployment, no `main` push.

```
NEXT_STEP = WAIT_FOR_OPERATOR_DB_AND_BROWSER_SAFETY_APPROVAL
```

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
