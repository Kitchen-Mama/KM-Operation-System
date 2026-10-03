# S8-R3B — Read-Path Fatigue + Performance Baseline

**Status:** EXECUTED. Measurement and diagnosis only — nothing repaired, nothing written.
**Governed by:** [S8_STANDING_DB_AUTHORIZATION_GATE.md](S8_STANDING_DB_AUTHORIZATION_GATE.md) (authoritative version).
**Run:** 2026-10-03, against deployment `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R39` (router build), frontend `5462ead`.

```
S8_R3B_READ_PATH_FATIGUE  = PASS (executed; defects found and reported, none repaired)
SURFACES_TESTED           = 11      READ_TABLE_COUNT = 44 approved / 40 reached
WRITE_TABLE_COUNT         = 0       DELETE_TABLE_COUNT = 0
PRODUCTION_ROWS_WRITTEN   = 0       PRODUCTION_ROWS_DELETED = 0      SCHEMA_CHANGES = 0
GAP_WRITE_COUNT           = 0       GAP_JOB_START_COUNT = 0          GAP_JOB_STATUS_POLL_COUNT = 0
SCRIPT_TRIGGER_MUTATION_COUNT = 0   DRIVE_WRITE_COUNT = 0            PROPERTY_WRITE_COUNT = 0
DIRECT_CELL_WRITE_COUNT   = 0
```

---

## §0 — What was dispatched

```
Run A   105 requests   full 11-surface fatigue      28 min wall, 28 min server
Run B     9 requests   recommendation, re-measured with a scope
Run C     9 requests   gap read, re-measured with a scope
probe     4 requests   1 shape validation + 2 envelope dumps + 1 scope derivation
-------------------------------------------------------------------------------
        127 requests   118 GET · 9 POST · 0 refused · 0 outside the approved eleven
```

Every one passed `KMS8R3B.decide()` before a socket was opened. The guard is **deny by default**: an action
outside the approved set is refused with `ACTION_NOT_IN_APPROVED_SET`, which is the behaviour the standing
gate's rule 2 requires and the opposite of what a blocklist would have done.

---

## §1 — Performance table

Times are **wall-clock at the client**, which is what a user experiences: Apps Script project load, handler
execution, the mandatory `/exec` → `googleusercontent` redirect hop, and transfer. Concurrency was 1 throughout.

| # | Surface | Action | COLD | WARM med | WARM max | WARM min | N | KB | rows | fails |
|---|---|---|---|---|---|---|---|---|---|---|
| 11 | Site Inventory — primary | `inventoryReplenishment.workspace.get` | **40 823** | **36 624** | **133 755** | 30 319 | 8 | **12 180** | 13 053 | 0 |
| 11 | Site Inventory — recommendation *(Run B)* | `recommendation.workspace.get` | 31 381 | **28 308** | 32 467 | 23 000 | 7 | 320 | 100 | 0 |
| 4 | Factory guard indicator | `factoryStockGuard.get` | 13 691 | 13 777 | 41 914 | 10 180 | 8 | 69 | 119 | **2** |
| 7 | Request Order | `requestOrder.workspace.get` | 12 763 | 13 604 | 45 615 | 9 844 | 8 | 617 | 614 | **1** |
| 6 | Weekly Shipping Plan | `weeklyShipping.workspace.get` | 12 756 | 11 135 | 14 352 | 8 927 | 8 | 28 | 10 | 0 |
| 8/9 | Shipment Draft / Overview / Map | `shipment.workspace.get` | 11 061 | 11 126 | **150 020** | 8 711 | 8 | 629 | 672 | **1** |
| 5 | Overseas Inventory | `overseasStock.workspace.get` | 11 089 | 11 009 | 15 680 | 8 018 | 8 | 144 | 457 | 0 |
| 10 | PO Overview | `purchaseOrder.workspace.get` | 9 296 | 10 173 | 13 410 | 7 223 | 8 | 95 | 560 | 0 |
| 2/3 | SKU Details / SKU Regional | `skuDetails.workspace.get` | 8 646 | 8 961 | 11 832 | 7 437 | 8 | 334 | 485 | 0 |
| 1 | FC Summary | `fcSummary.workspace.get` | **8 246** | **8 149** | 35 413 | 6 899 | 8 | 528 | 942 | 0 |
| 11 | Site Inventory — gap read *(Run C)* | `inventoryReplenishmentGap.get` | 6 803 | 6 554 | 7 412 | 4 871 | 7 | 42 | 100¹ | 0 |

¹ the gap read is page-capped at 100; it is not a table row count.

**COLD here is the first execution of that handler in the run.** The only unambiguous *project* cold start is
the very first request of Run A — `fcSummary.workspace.get` at **8 246 ms**. Apps Script has no server cache to
warm; "cold" is project load and compile, which is paid once per idle instance, not per surface. The per-action
cold premium was accordingly small and sometimes negative:

```
inventoryReplenishment  +4 199 ms  ×1.11      overseasStock   +80 ms  ×1.01
weeklyShipping          +1 621 ms  ×1.15      fcSummary       +97 ms  ×1.01
purchaseOrder             -877 ms  ×0.91      requestOrder   -841 ms  ×0.94
```

A negative premium is not a measurement error — it says the handler's cost dominates the project load so
completely that ordinary variance is larger than the cold penalty.

---

## §2 — Findings

### F1 — BLOCKING_TIMEOUT · Site Inventory exceeds the client's own read timeout

The repository already has the acceptance number: **`KM_READ_TIMEOUT_MS_ = 45 000`**
(`operation-system-db-api.js:4180`). Nothing is invented here.

```
inventoryReplenishment.workspace.get, in dispatch order (seconds)
  cold  40.8 │ warm  31.7   71.4   133.8 │ repeat  84.1  36.7  36.6  30.3  33.6
                             ▲      ▲▲▲            ▲
                             over 45 s — REQUEST_TIMEOUT in a browser
```

**3 of 9 samples exceeded the client timeout.** They succeeded here only because the harness allowed 150 s; in
the shipped client they are a failed read, which on screen is permanent loading.

Two things make this the round's primary finding:

1. **It degrades under immediate repetition and recovers when spaced.** The three back-to-back warm requests ran
   31.7 → 71.4 → 133.8 s — a 4.2× escalation. The repeat-cycle samples, separated by the other ten surfaces,
   returned to 30–37 s. That is a fatigue signature, not a flat cost.
2. **The surface is not one request.** Site Inventory needs the primary read **plus** the recommendation read
   **plus** the gap read for one scope:

```
   inventoryReplenishment.workspace.get   36.6 s median   12.2 MB   19 count keys / 20 declared tables
   recommendation.workspace.get           28.3 s median    0.3 MB
   inventoryReplenishmentGap.get           6.6 s median    0.04 MB
   ------------------------------------------------------------------
   ~71 s of server time for one scope, against a 45 s per-request budget
```

The 12.2 MB payload is the largest in the application by a factor of 19. `SIR_WORKSPACE_TABLES_` declares 20
tables and the response carries 13 053 rows.

**Classification: BLOCKING_TIMEOUT.** Not repaired — §12.

### F2 — FUNCTIONAL_DEFECT · a read is dispatched on the verb this repo proved cannot survive the redirect

`factoryStockGuard.get` is a **read** — its handler returns `zero_write: true` (`71_:266-280`) and holds no
write primitive. But it is **not on the router's GET read table**, so the client sends it through
`_kmWeeklyCommand_`, which is the POST write path.

The router's own header records what happens to a POST at the `/exec` hop, measured by the R4A1 matrix:

> `fetch POST   302 → echo 404   NO handler   body LOST   → HTTP_TRANSPORT_ERROR`
> `fetch POST (echo resolves back)   302 → doGet 200   body LOST   → REQUEST_METHOD_DOWNGRADED`

That is exactly what was measured:

```
2 of 9 POSTs → POST_ONLY_ACTION_ON_GET
   "Missing or invalid action parameter. Use: getOperationDb, getTable, system.health
    or inventoryScope.registry.get"
failure rate 22%   ·   no retry exists on the write path (maxRetries = 0 for a write)
```

The other 7 succeeded in 10.2–17.5 s. **Consequence:** the Factory Available / Allocated / Overage indicator on
Weekly Shipping Plan and Factory Inventory degrades to a stated "unavailable" roughly one time in five, for a
read that has no reason to be on the failing verb.

**Classification: FUNCTIONAL_DEFECT (non-blocking — the indicator is explicitly non-blocking by design).**
Not repaired — §12. The shape of the repair is obvious and is therefore *not* this round's business.

### F3 — FUNCTIONAL_DEFECT · one non-JSON Google HTML page

```
requestOrder.workspace.get   1 of 9   after 45 615 ms   7 718 bytes
  <!DOCTYPE html><html lang="zh"><head><script nonce="…">window['ppConfig'] = {productName: '26981ed0…
```

A Google-side interstitial, not an application envelope. The client would classify this `HTTP_TRANSPORT_ERROR`.
**The cause is not determinable from the response body** — it carries no application error — and the Apps Script
execution transcript that would name it is operator-owned. Recorded, not diagnosed.

### F4 — one hard timeout on an otherwise healthy surface

```
shipment.workspace.get   8.7  9.9  10.1  11.1  11.1  11.1  12.0  12.2 s   and once: >150 s (aborted)
```

One sample in nine, at more than 12× the median, on a surface whose other eight samples are tight. Not enough
to characterise. **BLOCKING_TIMEOUT (1 occurrence).**

### F5 — SKU Details is NOT a 35-second read at the server · §7 answered

§7 carried forward *SKU Details ~35 s, SKU Regional ~28 s*. **The scoped read does not reproduce it:**

```
skuDetails.workspace.get   cold 8 646   median 8 961   max 11 832   min 7 437 ms   (11 samples, 0 failures)
```

Both pages share this one action, so both measure the same ~9 s. The determination §7 asked for, stated only as
far as the evidence reaches:

| Candidate cause | Verdict |
|---|---|
| server execution | **excluded** for this action — 9 s median, 0 failures, 0 timeouts in 11 samples |
| payload size | **excluded** — 334 KB, mid-range |
| duplicate requests / N+1 / frontend lifecycle / shared cold path | **NOT MEASURED** — see §4 |

The remaining ~26 s is **not** in `skuDetails.workspace.get`. Where it *is* cannot be settled by this
instrument: the SKU pages also issue `getTaxReferralRates`, `getTaxRateComponents`, `getSkuRegionalDetails` and
the broad `loadOperationDb` cache read, **none of which is in the approved R3A action set**, so none was
dispatched. Naming the cause would require either widening the approved surface or the browser-instrumented
round proposed in §6.

### F6 — FC Summary is better than the carried-forward numbers · §6 answered

```
                        carried forward      MEASURED 2026-10-03
cold                      ~25 000 ms         8 246 ms   (the run's true project cold start)
warm                       ~9 700 ms         8 149 ms median   ·   min 6 899   ·   max 35 413
```

**Do not read this as "FC Summary was fixed."** The historical figures were page-level observations; this is one
scoped read. What can be said: the read's own cost is ~8 s, cold and warm, and the ~25 s cold is not reproduced
at this action. The known analysis (~6.3 s floor, ~4.7 s handler, ~30 service calls where ~14 may suffice) is
consistent with an ~8 s floor-dominated read.

**Two spikes remain**: 28.9 s and 35.4 s inside the warm phase, against a 6.9 s minimum — a 5× spread on an
otherwise stable surface. The response bytes and all four row counts were byte-identical across every sample,
so the spikes are not a different amount of work. Unexplained; recorded.

Read-only behaviour around Regular FC, Special-Event FC and the campaign/pricing data the workspace needs was
verified structurally (58_ holds no write primitive) and behaviourally (`fc_regular_forecast` 496,
`fc_special_events` 431, `fc_target_rules` 0, `marketplaces` 15 — identical across all 11 samples).
**No FC data was edited. No gap rebuild was run.**

### F7 — route-away / return · weak evidence, stated as weak

```
fcSummary   before 5 585 → away(overseasStock) 11 063 → return 10 010 ms   delta +4 425
skuDetails  before 7 111 → away(purchaseOrder)  9 842 → return  7 475 ms   delta   +364
```

FC Summary paid 1.8× on return; SKU Details did not. **Two pairs is not a result.** It is enough to say the
behaviour differs by surface and worth one dedicated measurement, not enough to classify.

---

## §3 — Safety assertions (§11)

```
PRODUCTION_ROWS_WRITTEN       = 0     PRODUCTION_ROWS_DELETED = 0     SCHEMA_CHANGES = 0
GAP_WRITE_COUNT               = 0     GAP_JOB_START_COUNT     = 0     GAP_JOB_STATUS_POLL_COUNT = 0
SCRIPT_TRIGGER_MUTATION_COUNT = 0     DRIVE_WRITE_COUNT       = 0     PROPERTY_WRITE_COUNT = 0
DIRECT_CELL_WRITE_COUNT       = 0     requests refused        = 0     forbidden attempts   = 0
```

Four independent kinds of evidence, because a single kind would be a claim rather than a proof:

| | Evidence | What it shows |
|---|---|---|
| 1 | **Structural** — comments *and* string literals stripped, then probed | the 9 whole-file read owners hold **no** `setValue(s)`, `appendRow`, `insertSheet`, `deleteRow`, `clearContent*`, `setProperty`, `deleteProperty`, `DriveApp`, `MailApp`, `newTrigger`, `deleteTrigger`. The 2 read handlers inside write-bearing files (`71_`, `43_`) were probed **per handler**, by brace-depth slice, not per file |
| 2 | **Dispatch ledger** | 127 requests, every one of the eleven approved actions, every one decided before dispatch. `gapJob.status.get` was never constructed — `buildRequest()` returns no URL for it |
| 3 | **Behavioural row-count invariant** | per owner, first sample vs every later one: **9 owners · 83 successful reads · 47 count keys · 0 moved** |
| 4 | **Server self-report** | 9 responses carried `zero_write: true`; **0** carried `zero_write: false` |

**One honest limit on GAP_WRITE_COUNT.** No gap job was started, polled or re-armed, and `43_`'s read path holds
no write primitive — so no gap write *could* have originated here. But the gap read is page-capped at 100 rows,
so this round did **not** independently observe the gap tables' row totals. The zero rests on evidence 1, 2
and 4, not on a direct count.

---

## §4 — What this instrument cannot measure, and why that matters

§5 asks for `REQUEST_COUNT_FIRST / WARM / AFTER_REPEATED_CYCLES`, `N_PLUS_ONE_EVIDENCE`,
`REQUEST_LEAK_EVIDENCE` and `LIFECYCLE_DUPLICATION_EVIDENCE`. **This round reports NOT MEASURED for all five**,
and the reason is not laziness:

- The harness is an **HTTP instrument**. It issues exactly one request per sample by construction, so its
  request count is 1 by definition. Counting requests the *browser* makes requires the browser.
- **The one page where route-level fatigue would answer these questions is the one page the gate forbids
  mounting.** `_irResumeGapJobOnMount_` (`inventory-replenishment.js:10371`) fires `gapJob.status.get` on every
  Site Inventory mount. It is conditional — `resumeIfRunning` skips the read when the client holds no
  job-liveness evidence — but that is client-side state, not a server guarantee, and the gate's more-restrictive
  reading wins. So Site Inventory was exercised through its three component reads and never mounted.

Reporting a zero for these would have been worse than reporting nothing: a request-leak count of 0 from an
instrument that cannot leak requests reads like a clean bill of health.

§6 proposes the round that can answer them.

---

## §5 — Corrections to S8-R3A

Found while freezing the surface, and listed because the preflight the operator approved contains them.

| | S8-R3A said | Actually |
|---|---|---|
| 1 | surface 4 Factory Inventory reads `rawInventory.get` | **no shipped frontend file references it.** Routed and handled; unreachable |
| 2 | surface 10 PO Overview reads `openPoRemaining.raw.get` | **same — no shipped caller** |
| 3 | `leadTime.raw.get` is one of the two readers of `supplier_price_list` | true in the backend, but it too **has no shipped caller** |
| 4 | — | `recommendation.workspace.get` and `inventoryReplenishmentGap.get` **require a scope**; S8-R3A did not record it |

Consequence of 1–3: three of the actions in the approved preflight cannot be exercised through the application
at all. They were excluded, with the reason recorded in `KMS8R3B.EXCLUDED`, and the "no shipped caller" claim is
re-checked by section I of the suite on every run rather than resting on one grep.

Consequence of 4 is a mistake this round made and caught: Run A sent unscoped requests and both owners refused
them in ~1 ms (`VALIDATION_FAILED`, `INVALID_SCOPE`). 18 of 105 samples measured **the validator, not the
surface**, and the first analysis classified them as FUNCTIONAL_DEFECT. They were the harness's own missing
parameter. Runs B and C re-measured both with a scope derived from an approved read, and the analyser now
separates unscoped samples instead of averaging them in.

### The two bounded-READ tables (§9, §10)

Both were exercised. Both remain `UNAUTHORIZED_UNKNOWN`; **neither was registered**, and the registry is still
58 entries — asserted by section J of the suite.

```
requestOrder.workspace.get      requestOrders 7 · lineSources 54 · warehouses 361 · skuDetails 192 ·
                                supplierPriceList 0        ← present, readable, EMPTY
inventoryReplenishment…get      amazon_inventory_health_snapshot 346   ← optional path present and used
```

**`supplier_price_list` is required and empty.** S8-R3A §1.2 recorded that `51_` declares it with
`requiredCols: ['sku']` and fails closed without it — and it is indeed present and readable, so the Request
Order read succeeded in all 9 samples. But it returned **0 rows**, identically across every sample. The owner's
requirement is satisfied by the *sheet and its header*; the supplier lead-time and price join it exists to feed
contributes nothing today.

This is reported as an **observation, not a defect**: an empty reference table may be exactly correct for the
current state of the business, and this round has no basis for deciding that. §10 asked for the optional path's
absence to be recorded rather than forced; the same courtesy applies here. Two other zeros were stable across
the run and are noted for the same reason: `fc_target_rules` 0 and `overseas_inventory_movements` 0.

None of the three is a FALSE_EMPTY — a false empty is a read that returns nothing while rows exist, and every
one of these returned the same zero on every one of 83 successful reads.

---

## §6 — Next round, and its DB TOUCH PREFLIGHT

Proposed: **S8-R4A — BROWSER-INSTRUMENTED READ FATIGUE**, to answer the five §4 questions and to attribute F5's
missing ~26 s. It is proposed, **not begun**.

```
TABLE                      = (none beyond the S8-R3B set)
CLASSIFICATION             = as S8-R3B — 22 PROTECTED_PRODUCTION · 16 TEST_OWNED_TRANSACTION ·
                             2 REBUILDABLE_OPERATIONAL_STATE · 2 READ_ONLY_DERIVED · 2 UNAUTHORIZED_UNKNOWN
ACCESS                     = READ only.  No INSERT. No UPDATE. No DELETE.
PURPOSE                    = count the requests a real page issues on mount, on re-render and after N
                             route cycles; detect listener duplication and request leak
EXPECTED_SCOPE             = the same eleven actions, plus — REQUIRING APPROVAL — the reads the SKU pages
                             issue that S8-R3B could not dispatch:
                               getTaxReferralRates · getTaxRateComponents · getSkuRegionalDetails ·
                               loadOperationDb (broad cache read)
EXPECTED_MAX_ROW_COUNT     = unchanged per table; the broad cache read is whole-table by nature
RUNTIME_OWNER              = unchanged
DIRECT_CELL_WRITE          = NO
TEST_LINEAGE               = n/a — a read-only round creates no rows
RECOVERY / CLEANUP MODEL   = n/a — nothing to recover
OPERATOR_APPROVAL_REQUIRED = YES, for the four additional read actions above and for one mechanism:
```

**The mechanism needing approval.** A browser mounting Site Inventory would call `gapJob.status.get`. S8-R4A
would therefore run Chrome with **CDP request interception that aborts any non-allowlisted request before it
leaves the browser** — `KMS8R3B.decide()` enforced at the socket rather than at the caller. That is strictly
stronger than this round's guard, but it is a new mechanism and it changes what a page does, so it is the
operator's call, not mine. Without it, Site Inventory stays unmountable and the §4 questions stay open for
that page.

Three smaller candidates, in priority order:

1. **F2 repair** — move `factoryStockGuard.get` onto the router's GET read table. A read on the write verb with
   a measured 22% failure rate. Needs no new table and no new permission.
2. **F1 decomposition** — `inventoryReplenishment.workspace.get` already accepts `only` and `recentWindow`
   (`buildInventoryReplenishmentRequestDTO`). Measuring the 20-table read against a narrowed one would say
   whether the 12.2 MB is necessary. Read-only; same tables.
3. **F3** — needs the Apps Script execution transcript for the failing request. Operator-owned; no code round.

---

## §7 — What this round did not do

No repair. No deployment. No frontend publish. No write of any kind. No schema change. No registry change —
still 58 entries. No new router action. `gapJob.status.get` was never called, and the harness contains no code
path that can construct it.

```
NEXT_STEP = WAIT_FOR_OPERATOR_DECISION_ON_S8_R4A_PREFLIGHT
```

---

*Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>*
