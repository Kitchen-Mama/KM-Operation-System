# S8-R4B — READ-PATH STABILITY ROOT-CAUSE REPAIR: DB TOUCH PREFLIGHT + REPAIR SCOPE FREEZE

**AUDIT / PREFLIGHT ONLY.** No Product repair implemented, nothing deployed, no Production data touched.

```
FEATURE_HEAD  = 3f33f86     ORIGIN_FEATURE = 3f33f86
MAIN_HEAD     = 26e5f10     ORIGIN_MAIN    = 26e5f10
```

---

## 0. A correction to the R4A report, before anything is planned on top of it

The R4A results document and my report of it said the cold-open cost was **a client retry**. That was wrong,
and the evidence that corrects it was already in the dataset.

Every repeat shares **one Chrome `networkId`**. A client retry allocates a new fetch and therefore a new
networkId. One networkId across all hops means **one browser fetch following a redirect chain**. The shape,
identical across all 7 multi-hop requests in the matrix:

```
exec -> echo -> exec -> echo [-> exec -> echo]
```

Each `exec` hop carries the **same `km_rid`** and produces a **new `user_content_key`** — so each one is a
**full server execution** of the handler. The client dispatched once; the transport executed the handler two
or three times.

```
FC Summary  nid …1968.195   6 hops   exec +0 · echo +6.9s · exec +24.7s · echo +30.2s · exec +40.0s · echo +45.8s
SKU Details nid …1968.388   4 hops   exec +0 · echo +13.6s · exec +44.2s · echo +56.0s
```

The `ERR_ABORTED` endings are the client's own 45 s `AbortController` bound
(`KM_READ_TIMEOUT_MS_ = 45000`, `_kmFetchBounded_`) firing part-way through the chain.

**This matters for R4B scope:** a repair aimed at client retry policy would change nothing, because the
client is not retrying. Candidate 2 is a transport defect, not a retry-policy defect.

## 1. A second correction: R4A never measured the Site Inventory defect

R4A reported Site Inventory as the second-fastest surface (2 116 ms, `rows = 0`). That is true **of the
pre-Search shell**, and it is not the surface R3B measured.

- The mount read is `inventoryScope.registry.get` — 4.8 s.
- The 30 s read is `inventoryReplenishment.workspace.get`, and
  `assets/js/pages/inventory-replenishment.js:8988` states the table **"is fed by
  `inventoryReplenishment.workspace.get`, and ONLY by a confirmed Search."**
- Scenario F proved the gate exists by tripping it: `alert — "Please select Country and Marketplace before
  searching."`

So R3B's `~31.7 s → ~71.4 s → ~133.8 s` degradation stands **unrefuted and unmeasured by R4A**. R4A's
"Site Inventory is fast" must not be read as evidence against it.

---

## 2. Harness follow-up — the open-map defect

```
OPEN_MAP_ROOT_CAUSE = `var open = {}` (s8-r4a-browser-fatigue.js:245) is keyed by networkId, written on
                      Fetch.requestPaused (:304) and deleted ONLY in settleFrom() (:317). Nothing clears it
                      on Page.navigate (:602) or at window start. Scenario D's rapid burst navigates away
                      mid-flight by design; a request the renderer drops without a matching
                      Network.loadingFinished/loadingFailed stays in the map forever, and the stability
                      predicate `stillOpen.length === 0` can never be true again for the rest of the run.

OPEN_MAP_FIX_SCOPE  = assets/tools/s8-fatigue/s8-r4a-browser-fatigue.js ONLY. Two changes:
                      (a) clear `open` in hardReload() immediately after Page.navigate resolves;
                      (b) age out entries older than KM_READ_TIMEOUT_MS_ at the top of each poll, and
                          RECORD each eviction in the sample, so a dropped read is visible rather than
                          silently forgiven.
                      No product file. No test file other than the resilience suite.

TARGETED_REGRESSION_SURFACES  = FC Summary, Site Inventory          (the two scenario-E surfaces)
TARGETED_REGRESSION_SCENARIOS = D then E, in that order, in one process
                                — D is the only scenario that creates the stuck entry, so a regression that
                                  skips it cannot reproduce the defect.
FULL_MATRIX_RERUN_REQUIRED = NO
```

**Why NO.** The contamination is bounded and its mechanism is understood. A stuck entry can only *delay*
`stillOpen.length === 0`; it cannot shorten a measurement, inflate a request count, or alter a backend
duration. Scenarios A–C ran before D existed and are untouched; F's windows are time-boxed, not
stability-gated. The four affected windows are exactly the four that report
`PAGE_FULL_STABLE_MS = null` — the defect announces itself. If the targeted D→E regression shows any
*other* window affected, that evidence would change this answer.

---

## 3. Candidate 1 — Site Inventory

```
SITE_INVENTORY_CONFIRMED_ROOT_CAUSE = NOT YET CONFIRMED. Two mechanisms are evidenced and neither is
                                      excluded; they are not mutually exclusive.
ROOT_CAUSE_LAYER = backend read volume (evidenced) + transport re-execution (evidenced, §4)
```

### ROOT_CAUSE_EVIDENCE

**(a) The read is 19 tables in one execution.** `SIR_WORKSPACE_TABLES_`
(`60_api_v1_inventory_replenishment_workspace.gs:57`) lists 21 tables, of which 19 are read on the primary
render; `carrier_lead_times` and `carrier_rate_cards` are include-gated behind `carrierPlanning` and are not.

**(b) It is not lock contention, and that is established rather than assumed.** The handler returns
`lock: null` and the source states *"No lock is taken on this path. Stated, so 'lock contention' is an
answered question and not an unexamined possibility."* No `LockService` appears in the handler or one level
down.

**(c) There is no server-side cache.** `60_:329` — *"NOTHING IS PERSISTED. No sheet row, no CacheService, no
PropertiesService."* Every call re-reads all 19 sheets.

**(d) The handler is already instrumented to answer "which table".** It returns per-table `tableMs`,
`slowestTables` (top 5), `openMs`, staged timings and `serverDurationMs`. **No new instrumentation is needed
to find the slow table — one scoped Search returns it.** That is the cheapest next evidence in this whole
preflight and it has not been collected, because R4A never performed a Search.

**(e) The degradation shape fits serialized re-execution.** 31.7 → 71.4 → 133.8 s is roughly ×2 per
repetition. With no lock and no cache, three overlapping executions each re-reading 19 sheets of one
spreadsheet is a sufficient explanation; so is §4's bounce, which turns one user action into two or three
executions. **Distinguishing them requires one measurement, not a repair.**

### REPAIR_OPTIONS

| | **SI-A — collect the evidence first** | **SI-B — narrow the table set** | **SI-C — address the bounce** |
|---|---|---|---|
| FILES | none (read-only observation) | `60_api_v1_inventory_replenishment_workspace.gs`, `assets/js/pages/inventory-replenishment.js` | see §4 |
| DB_TOUCH | READ only, one scoped Search | READ only | READ only |
| EXPECTED_EFFECT | names the slow table and the real execution count | removes whole-sheet reads the render does not use | removes 1–2 redundant executions per action |
| RISK | none | **HIGH** — a table dropped from the read is a facet or a column that silently stops existing | medium |
| CONTRACT_CHANGE | NO | **YES** | possibly |
| ARCHITECTURE_DECISION_REQUIRED | **NO** | **YES** | **YES** |

**SI-A is the only option I recommend authorizing now,** and it is not a repair. SI-B is first-load vs
lazy/deferred data and a payload contract change — a Product/Architecture Decision Gate. **I am not choosing
it for you.**

---

## 4. Candidate 2 — cold-boot re-execution

```
COLD_BOOT_RETRY_OWNER      = NOT the client. The Apps Script /exec -> /macros/echo redirect contract,
                             re-entered by the browser: the echo hop returns a redirect back to /exec,
                             and each /exec hop re-executes the handler.
RETRY_TRIGGER              = NOT a timeout and NOT a client policy. Proven by: one networkId across all
                             hops; same km_rid; new user_content_key per exec hop; intervals (6.9 s,
                             24.7 s) that match no client bound.
MAX_RETRY_COUNT            = client policy is irrelevant here. OBSERVED chain length: 3 exec hops
                             (FC Summary), 2 exec hops (SKU Details, Overseas Inventory, Shipment
                             Overview, Carrier Rate Card). 7 of 145 application reads bounced (4.8%).
REQUESTS_CREATED           = 1 fetch per logical read.
SERVER_EXECUTIONS_CREATED  = 2 or 3 per logical read, on every bounced request.
BACKOFF                    = none. The browser follows redirects immediately (echo -> exec gaps of
                             497 / 523 / 535 ms).
CLIENT_TIMEOUT_INTERACTION = KM_READ_TIMEOUT_MS_ = 45000 bounds the WHOLE chain, not a hop. A 3-hop chain
                             is aborted part-way, which is the ERR_ABORTED in the data. The server
                             executions already started are NOT cancelled by the abort.
CACHE_INTERACTION          = none server-side. Client-side caching is why 9 of 12 surfaces never re-read
                             and therefore never bounce after cycle 1 — the bounce is a COLD-PATH defect.
```

### Can it amplify?

| | |
|---|---|
| latency | **YES, proven** — 62 s observed for a surface that costs 2.4 s warm. |
| server contention | **YES, by construction** — 2–3 concurrent executions where the user asked for one. |
| simultaneous executions | **YES** — and an aborted client does not stop an execution already running. |
| Apps Script quota pressure | **LIKELY** — execution count and total runtime are the quota units, and both are multiplied. Not directly measured; flagged, not asserted. |
| false timeout | **YES, proven** — the 45 s bound expires against a chain, so a read whose single execution would have returned in ~14 s is reported as a timeout. |

This is the strongest candidate in the round: it is proven, it is upstream of three other candidates, and
nothing about it is speculative. **But the repair is not yet determined**, because why the echo hop bounces
back to `/exec` is not established from the client side. `_kmGapRead_` already documents the family
(*"an echo that resolves back into doGet with no body"*) and carries a bounded 2-attempt recovery — but that
recovery allocates a **new** request id, and the observed chain does not, which is further proof the
recovery is not what fired.

**SMALLEST EVIDENCE-SUPPORTED REPAIR — not authorized here, proposed for the gate:** capture
`Fetch.requestPaused.responseStatusCode` and `responseHeaders` on the echo hop in the harness (harness-only,
zero product change, zero DB touch) so the bounce's HTTP status and `Location` are known. Until that is
known, any product-side change is a guess with a deploy attached.

---

## 5. Candidate 3 — FC Summary concurrent reads

```
FC_CONCURRENT_READ_CAUSALITY     = INCONCLUSIVE
FC_ARCHITECTURE_DECISION_REQUIRED = YES
```

**The causality claim is not supported, and the design already argues the opposite.**
`assets/js/pages/fc-summary.js:5944` records the measurement the current design was built on:

> *"Two requests fired TOGETHER cost 4.5 s where two fired in sequence cost 10 s… A bootstrap followed by a
> lazy slice would pay two platform floors and be slower than the single request it replaced."*

Serializing them is therefore a change **against** an existing measurement, not an obvious win.

The `~16 s each vs ~8.1 s single` comparison that motivated this candidate is **confounded**: the 16 s
figures are cold FC Summary windows, and the cold FC Summary read is exactly the one §4 shows executing the
handler **three times**. It compares a bounced cold chain with a clean warm read. On warm and cycle mounts
FC Summary issues **zero** reads and settles in 2 374 ms, so concurrency costs nothing there.

**What IS proven, by code rather than by timing — a duplicate read.** `FCS_SLICE_SPECS_`
(`58_api_v1_fc_summary_workspace.gs:116`):

```
bootstrap  reads ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'marketplaces']
                 emits ['fcTargetRules', 'marketplaces']
regular    reads ['fc_regular_forecast']
                 emits ['fcRegularForecast']
```

**Both concurrent requests read `fc_regular_forecast`** — the largest table on the surface (496 rows /
197 KB by the file's own note). `bootstrap` reads it only to derive filter facets and deliberately does not
emit it. So a cold mount reads the biggest sheet **twice, in two executions**, to serve one page.

That is real, evidenced, duplicated work. The repair is not mechanical: deriving the facets from the
`regular` payload, combining the slices, or deferring one are each a change to what the first load contains
and what the payload contract promises. **ARCHITECTURE_DECISION_REQUIRED = YES. I am not choosing.**

---

## 6. Candidate 4 — Factory Guard transport

```
FACTORY_GUARD_ROOT_CAUSE = factoryStockGuard.get is a read dispatched through the WRITE transport.
```

Three independent confirmations that it is a read:

1. The handler takes no write primitive, directly or one level down (`71_`, brace-depth slice, comments and
   string literals stripped, 5 helpers followed).
2. Every return path sets `zero_write: true`.
3. `63_api_v1_system_health.gs:463` registers it as *"read only"*.

And three ways the transport treats it as a write:

| | |
|---|---|
| `shipping-plan.js:1536` → `window.KM.DB.factoryStockGuardGet` → `operation-system-db-api.js:5344` → `_kmWeeklyCommand_` | the **write** dispatcher: POST, `_kmNextWriteRequestId_`, `_kmMutationShape_` |
| `_kmGapRead_`'s own comment | *"A POST cannot survive that hop — per the Fetch spec the redirect is re-issued as a GET with the body dropped"* — which is precisely R3B's reproduced failure |
| timeout classification | a timed-out read is reported **INDETERMINATE / "may have been committed"** for an action that cannot commit anything |

It is absent from **both** read registries: `_KM_GET_READ_ACTIONS_` (`operation-system-db-api.js:5411`) and
the router's `rtrGetReadHandlers_()` (`01_router.gs:85`). It exists only in the POST if-chain
(`01_router.gs:1160`).

```
MINIMAL_FIX = four coordinated edits, additive, no removal:
  1. 01_router.gs                 — add 'factoryStockGuard.get': handleFactoryStockGuardGet_ to
                                    rtrGetReadHandlers_(). KEEP the POST branch, so nothing that
                                    already POSTs it breaks.
  2. operation-system-db-api.js   — add 'factoryStockGuard.get': 1 to _KM_GET_READ_ACTIONS_, and route
                                    KM.DB.factoryStockGuardGet through the READ dispatcher instead of
                                    _kmWeeklyCommand_.
  3. s8-r3b-read-allowlist.js     — the frozen spec pins verb 'POST'.
  4. s8-r3b-…-safety.test.js:118  — assertion A5, "the ONE approved read that travels on POST",
                                    becomes false by design and must be re-aimed, not deleted.

DB_WRITE_REQUIRED    = NO
API_CONTRACT_CHANGE  = YES, but ADDITIVE — the action gains a GET route and keeps its POST route.
                       No action name, payload or response shape changes.
ARCHITECTURE_DECISION_REQUIRED = NO
```

**This is the only candidate in the round that is proven, bounded, and free of an architecture decision.**

---

## 7. Candidate 5 — Shipment outlier

```
SHIPMENT_REPAIR_AUTHORIZED_RECOMMENDATION = NO
```

R3B saw one ~150 s `shipment.workspace.get`. R4A ran 36 shipment mount windows across three surfaces; the
slowest observation in the entire 161-window dataset is On-the-Way Map at 21 891 ms cold, and all three
settle at ~2 107 ms warm. Classification stays **TRANSIENT / INCONCLUSIVE**.

One caveat worth carrying rather than burying: `shipment.workspace.get` **is** in the bounced set
(nid …968.6001 and …968.6002, both `ERR_ABORTED`). If §4's bounce is the mechanism, a 150 s shipment
observation is explainable without a shipment-specific defect — which is another reason not to invent a
shipment repair. Monitor in R4C.

---

## 8. Carried debt — Request Order

```
REQUEST_ORDER_INTERSTITIAL_STATUS = UNRESOLVED / NOT INVALIDATED
```

`requestOrder.workspace.get` is GET-routed (`01_router.gs:90`). R4A did not test it — no Request Order
surface is in the approved twelve — so R3B's single Google HTML interstitial is neither reproduced nor
refuted.

**A hypothesis worth testing rather than assuming:** an HTML interstitial where JSON was expected is what a
reader sees when an `echo` hop returns a Google page instead of the payload. That is the same transport
family as §4. If §4's diagnostic is run, it may settle Request Order at no extra cost.

**Safest validation point:** a targeted read-only R4C reproduction. `requestOrder.workspace.get` is a
workspace read on the GET read table and needs no write to exercise. **No repair without reproduction.**

---

## 9. R4B DB TOUCH PREFLIGHT

R4B as scoped is **code repair only**. The tables below are those the audited read paths touch and that an
R4C regression would exercise. **Every one is READ. No INSERT, UPDATE or DELETE is requested anywhere in
this round.**

```
PRODUCTION_DB_WRITE_REQUIRED     = NO
PRODUCTION_DATA_MUTATION_REQUIRED = NO
SCHEMA_CHANGE_REQUIRED           = NO
DIRECT_CELL_WRITE                = NO, on every table below
RUNTIME_OWNER                    = the canonical Apps Script handler named per surface; never the harness
RECOVERY / CLEANUP MODEL         = not applicable — a read creates nothing to undo
```

| # | TABLE | CLASSIFICATION | ACCESS | READ BY | APPROVAL |
|---|---|---|---|---|---|
| 1 | `marketplaces` | PROTECTED_PRODUCTION | READ | Site Inv · FC Summary · Factory Guard | required |
| 2 | `marketplace_skus` | PROTECTED_PRODUCTION | READ | Site Inv · SKU Details · FC (pricing) | required |
| 3 | `sku_details` | PROTECTED_PRODUCTION | READ | Site Inv · SKU Details · Weekly Shipping | required |
| 4 | `sku_regional_details` | PROTECTED_PRODUCTION | READ | SKU Details / SKU Regional | required |
| 5 | `warehouses` | PROTECTED_PRODUCTION | READ | Site Inv · Weekly Shipping · Factory Guard | required |
| 6 | `amazon_inventory_snapshot` | PROTECTED_PRODUCTION | READ | Site Inventory | required |
| 7 | **`amazon_inventory_health_snapshot`** | **UNAUTHORIZED_UNKNOWN** | **READ — see STOP below** | Site Inventory | **STOP** |
| 8 | `amazon_daily_sales_snapshot` | PROTECTED_PRODUCTION | READ | Site Inventory | required |
| 9 | `amazon_weekly_sales_snapshot` | PROTECTED_PRODUCTION | READ | Site Inventory | required |
| 10 | `fc_regular_forecast` | PROTECTED_PRODUCTION | READ | Site Inv · FC bootstrap **and** FC regular (§5) | required |
| 11 | `fc_target_rules` | PROTECTED_PRODUCTION | READ | Site Inv · FC Summary | required |
| 12 | `fc_special_events` | PROTECTED_PRODUCTION | READ | Site Inv · FC Summary | required |
| 13 | `overseas_inventory_snapshot` | PROTECTED_PRODUCTION | READ | Site Inventory | required · no mutation (Rule 10) |
| 14 | `factory_stock` | PROTECTED_PRODUCTION | READ | Site Inventory · Factory Guard | required · no mutation (Rule 10) |
| 15 | `shipments` | PROTECTED_PRODUCTION | READ | Site Inventory | required |
| 16 | `shipment_lines` | PROTECTED_PRODUCTION | READ | Site Inventory | required |
| 17 | `shipping_plans` | PROTECTED_PRODUCTION | READ | Site Inv · Weekly Shipping · Factory Guard | required |
| 18 | `shipping_plan_lines` | PROTECTED_PRODUCTION | READ | Site Inv · Weekly Shipping · Factory Guard | required |
| 19 | `shipping_allocation_drafts` | PROTECTED_PRODUCTION | READ | Site Inventory · Factory Guard | required |
| 20 | `shipping_allocation_draft_lines` | PROTECTED_PRODUCTION | READ | Site Inventory · Factory Guard | required |
| 21 | `carrier_lead_times` | PROTECTED_PRODUCTION | READ (include-gated) | Site Inv only if `carrierPlanning` | required |
| 22 | `carrier_rate_cards` | PROTECTED_PRODUCTION | READ (include-gated) | Site Inv only if `carrierPlanning` | required |
| 23 | `carriers` | PROTECTED_PRODUCTION | READ | Weekly Shipping Plan | required |
| 24 | `pricing_list` | PROTECTED_PRODUCTION | READ | SKU Details · FC pricing slice | required |
| 25 | `tax_referral_rates` | PROTECTED_PRODUCTION | READ | SKU Details | required |
| 26 | `tax_rate_components` | PROTECTED_PRODUCTION | READ | SKU Details | required |
| 27 | `campaigns` | REGISTRY_CONFIRMATION_REQUIRED | READ | FC graph slice (post-write only) | **confirm before R4C** |
| 28 | `campaign_sku_lines` | REGISTRY_CONFIRMATION_REQUIRED | READ | FC graph slice (post-write only) | **confirm before R4C** |

**EXPECTED_SCOPE** for every row: whole-sheet read by the canonical handler, unchanged from today's
production behaviour — R4B proposes no change to which tables are read.
**EXPECTED_MAX_ROW_COUNT:** bounded by the handlers' own caps, `SIR_WS_ROW_MAX_ = 80000` and
`FCS_WS_ROW_MAX_`; truncation is reported via `capped` and is never silent.
**TEST_LINEAGE:** R3B read-path fatigue → R4A/R4A1 browser fatigue → proposed R4C. No fixture writes to any
production table; the harness has never written a cell and is structurally prevented from doing so.

### STOP — Rule 6

**`amazon_inventory_health_snapshot` is read by `handleInventoryReplenishmentWorkspaceGet_` on the primary
render, and it is still classified `UNAUTHORIZED_UNKNOWN`** — carried as unknown through R3B and R4A and
never registered.

This is not a new read introduced by R4B; production performs it today on every Site Inventory Search. But
the Standing Gate's Rule 6 says an unknown physical table is `UNAUTHORIZED_UNKNOWN` and a **STOP**, and
Rule 2 says an omitted table is unauthorized. **R4C cannot exercise a Site Inventory Search until this table
is either registered or the read is explicitly approved for the round.** Flagging it rather than quietly
reading it is the whole point of the gate.

`campaigns` and `campaign_sku_lines` are reached only by the FC `graph` slice, which the source says runs
only after a write attempt — out of scope for a read-only R4C, but listed because omission would make them
unauthorized if that assumption is wrong.

---

## 10. Proposed repair units

| Unit | Content | Shares root cause | Safe to batch | Why |
|---|---|---|---|---|
| **R4B-0** | Harness open-map fix + D→E targeted regression | NO — harness only | **NO** | Touches no product file. Must land and be verified alone, or a product repair and a measurement repair arrive together and neither can be attributed. |
| **R4B-1** | Factory Guard read transport (§6) | NO | **NO** | The one proven, bounded, decision-free repair. Independently verifiable: the action either answers on GET or it does not. Batching it with anything would put the round's only certain win behind an uncertain one. |
| **R4B-2** | Site Inventory evidence collection, SI-A (§3) | shares §4's transport layer | **NO** | Not a repair. One scoped Search returning the handler's existing `slowestTables`. Must precede any Site Inventory repair. |
| **R4B-3** | Transport bounce diagnostic (§4) | parent of §3, §5, §7, §8 | **NO** | Harness-only observation. Upstream of four candidates, so it runs before any of them is designed. |
| **GATED** | Site Inventory table-set reduction (SI-B) | §3 | — | **Architecture Decision Gate — operator only.** |
| **GATED** | FC Summary duplicate `fc_regular_forecast` (§5) | §5 | — | **Architecture Decision Gate — operator only.** |

**Explicitly NOT batched.** R4B-1 and the Site Inventory work are both "read-path performance", which is
precisely the reason the task warns against batching. They share no root cause, no file and no test.

```
GET_OPERATION_DB_OPTIMIZATION_IN_R4B = NOT AUTHORIZED, and no evidence found in this audit that would
                                       change that. getOperationDb dispatch count remains 0.
```

---

## 11. R4C acceptance plan

**Do not execute.** Designed now so the repair is built against a known acceptance bar.

**Prerequisite:** the §9 STOP must be resolved before any Site Inventory Search is exercised.

| Stage | Content |
|---|---|
| C1 backend read fatigue | `inventoryReplenishment.workspace.get` **with a real scope** (the read R3B measured and R4A could not reach), `fcSummary.workspace.get` both slices, `skuDetails.workspace.get`, `weeklyShipping.workspace.get`, `factoryStockGuard.get` **on GET**. Record `slowestTables`, `serverDurationMs`, and the **exec-hop count per logical read**. |
| C2 browser route fatigue | the repaired harness, cold + warm, 8 repeated route cycles, rapid burst, idle+return |
| C3 stability assertions | request-count stability per cycle · no timeout · no false empty · no permanent loading · no request leak · no lifecycle duplication (row and character invariance, the metric that actually worked in R4A) |
| C4 carried debt | Request Order targeted **read-only** reproduction attempt; Shipment workspace monitoring only |

**Mandatory surfaces:** Site Inventory · FC Summary · Factory Guard / Weekly Shipping Plan · SKU Details ·
SKU Regional Details.

**Two acceptance gates R4A would have failed, added because of what this round found:**
`EXEC_HOP_COUNT_PER_LOGICAL_READ = 1` and `CONFIRM_ACCEPTED_COUNT = 0`.

**Do not reuse the R4A dataset as the R4C baseline for Site Inventory** — R4A never measured that read.
R3B is the only baseline it has.

---

## 12. Human test checklist

After R4B repair, before the R4C seal. **No Production write is required for any step.** Each step is open
the surface, let it settle, and report what you see — a surface that renders nothing is a finding, not a
pass.

| # | Surface | What to do | What a PASS looks like |
|---|---|---|---|
| 1 | **Site Inventory** | select Country + Marketplace, Search; then immediately Search **again, twice** | rows appear; the 2nd and 3rd Search are not dramatically slower than the 1st *(this is the R3B degradation, and it is the single most important step)* |
| 2 | **FC Summary — Regular** | open cold, then leave and return | table draws; the return is visibly faster and issues no spinner |
| 3 | **FC Summary — Special Event** | switch to the Special Event tab | events draw; switching back to Regular does not re-fetch |
| 4 | **SKU Details** | open cold, then return | details draw both times |
| 5 | **SKU Regional Details** | open and scan the list | rows present, not an empty shell |
| 6 | **Weekly Shipping Plan** | open; watch the factory-availability indicator | the indicator resolves to a value, **not an error or a permanent dash** *(this is the Factory Guard fix)* |
| 7 | **Factory Inventory** | open | rows present |
| 8 | **Overseas Inventory** | open | rows present |
| 9 | **Shipment Overview** | open | rows present; note any wait beyond ~30 s |
| 10 | **PO Overview** | open | rows present |

**Report for any step:** a wait beyond ~30 s · a permanently empty table · a spinner that never stops · a
browser dialog · any error banner. **Do not press Save, Submit, Confirm, Adjust, Dispatch, Receive,
Generate or Import Confirm at any point** — this is a read-path acceptance.

---

## 13. Architecture decisions required — operator only

1. **Site Inventory table set (SI-B).** Does the primary render need all 19 tables on first load, or may some
   become lazy/deferred? This is first-load content, payload contract and business-data freshness.
2. **FC Summary duplicate `fc_regular_forecast` read.** Combine the two slices into one request, derive the
   bootstrap facets from the `regular` payload, or accept the duplicate read? This changes what the first
   load contains and what the payload contract promises — and it would overturn a design that an existing
   measurement supports.
3. **Transport contract**, if §4's diagnostic shows the bounce needs a client- or server-side change to the
   `/exec` → `echo` handling.

I have deliberately not chosen any of these.
