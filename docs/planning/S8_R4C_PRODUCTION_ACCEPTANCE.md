# S8-R4C — SITE INVENTORY LAZY-ONCE PRODUCTION ACCEPTANCE

**Measured against `f6b4164` — the published frontend — with Production backend at R42.**

```
SITE_INVENTORY_LAZY_ONCE_SEAL = YES
FIRST_LAYER_PERFORMANCE = NO_MEANINGFUL_CHANGE      FIRST_LAYER_PERFORMANCE_DECISION_REQUIRED = YES
```

The architecture does everything it was built to do. The first layer is **not meaningfully faster**, and that
is the finding this round exists to hand back.

---

## 1. The lifecycle contract — every gate passed

| gate | required | measured |
|---|---|---|
| first-layer requests | 1 | **1** (13 tables, 0 exposure tables, 7,027 rows) |
| Site A first exposure | 1 | **1** (6 tables, scope echoed) |
| first-layer re-read during exposure | 0 | **0** |
| cross-site prefetch | 0 | **0** |
| 2nd / 10th / 20th SKU expand | 0 each | **0 / 0 / 0** (100 rows available) |
| concurrent consumers → requests | ≥2 → 1 | **3 → 1**, all sharing one Promise |
| Site B first exposure | 1 | **1** |
| return A / return B | 0 / 0 | **0 / 0**, both entries still READY |
| route away → return | 0 | **0** exposure requests, entry survived READY |
| Refresh: Site A / Site B | invalidate / preserve | **invalidated / preserved** (1 request, then 0 on B) |

Refresh issued **zero** `gapJob` requests and **zero** non-GET requests — it is a read-only re-read, not a job.

---

## 2. The data boundary — the thing R42 was cut for

```
SITE_A_FOREIGN_ROW_COUNT = 0
Site B rows in Site A response = 0        Site C (KM|US|Shopify) rows in Site A response = 0
```

Site A returned 1 shipment · 2 shipment lines · 3 plans · 4 plan lines · 11 drafts · 9 draft lines. Every row
was re-checked against the **canonical lineage rule**, not against a header-marketplace match: plans by their
own triple, plan lines by parent plan, shipment lines by frozen lineage with the blank-lineage header
fallback, shipments by reachability, drafts by the client's own scope rule. Nothing foreign survived.

The **before/after** pair is what makes this evidence rather than assertion. The same two requests against
R41, one hour earlier:

| | R41 | R42 |
|---|---|---|
| Site A / Site B row counts | identical (4·10·6·12·12·14) | **1·2·3·4·11·9** / **0 across all six** |
| same shipment & plan ID sets | **true** | false |
| incomplete scope | accepted, returned everything | **refused**, `tablesRead = 0` |

---

## 3. NOT_LOADED is never rendered as zero

```
FALSE_EMPTY_COUNT = 0        QTY_ZERO_REGRESSION_REACHABLE = NO
SITE_B_NOT_LOADED_FALSE_EMPTY_COUNT = 0      SITE_B_READY_EMPTY_RENDER_PASS = YES
```

Captured from the live DOM, mid-load:

```
NOT_LOADED   data-ir-exposure="NOT_LOADED"
             "Incoming shipments load once for this site."
             Within 18 days …   Within 30 days …   Within 45 days …   45+ days …
READY        data-ir-exposure="READY"
             Overdue 200   Within 18 days 0   Within 30 days 0   Within 45 days 0   45+ days 0
```

The pending state renders **…**, not `0`. No "not generated", no fabricated quantity. Site B — which is
legitimately empty — reached `READY` with zero rows and only then rendered empty business states.

A third proof arrived unplanned: when the first-layer read timed out, the page said *"Search failed — no
results were loaded… This is a read failure, not an empty result — nothing about your data changed."*

---

## 4. Failure state — simulated client-side, never provoked in Production

```
LIVE_FAILURE_TEST = RUN_CLIENT_SIDE_SIMULATION       (no outage manufactured, no error traffic sent)
```

The transport boundary was substituted **inside the ephemeral browser** for exposure-only requests. The two
failing calls never left the machine; exactly one real request reached Production, and that was the recovery.

- FAILED did **not** become READY-empty — state held `FAILED`.
- **No auto-loop**: five forced re-renders produced **zero** additional requests.
- Explicit retry is **bounded**: one retry → exactly one more attempt.
- Recovery works: with the substitution removed, the next retry reached **READY**.

*Not captured:* the FAILED card's own markup. The five forced re-renders collapse the expanded row, so the
card was absent when sampled. The state machine is proven; the FAILED card's rendering is fixture-proven only.

---

## 5. Performance — the honest answer

```
PRE_19_TABLE_SERVER_RANGE  = 14,400–22,100 ms   (R4B-2, n=9)
POST_13_TABLE_SERVER_MS    = 18,328–22,569 ms   (n=4 spaced direct reads, mean 20,499) · 19,443 ms in-browser
POST_13_TABLE_WALL_MS      = 25,258–88,091 ms   (mean 42,100) · 26,252 ms in-browser
SERVER_IMPROVEMENT_MS      = NOT MEASURABLE — the post range sits INSIDE the pre range
SERVER_IMPROVEMENT_PERCENT = ~0
FIRST_LAYER_PAYLOAD_BYTES  = 6,168,676   FIRST_LAYER_ROWS = 7,027
```

**Why removing six sheets bought nothing.** Those six hold **58 rows in total across every site**. The cost
lives in the thirteen that remain, and the server's own per-table timing names them:

```
amazon_daily_sales_snapshot  3,604–4,984 ms   3,814 rows     ← the single largest cost, every time
warehouses                   1,439–2,622 ms     361 rows
sku_details                  1,649–1,803 ms     192 rows
marketplace_skus             1,202–1,411 ms     495 rows
fc_target_rules              2,065 ms             0 rows     ← an EMPTY sheet still costs two seconds
openMs                         352–558 ms                    ← opening the spreadsheet is ~2% of the total
```

`fc_target_rules` is the clearest statement of the problem: zero rows, two seconds. The cost is **per sheet**,
exactly as R4B-2 measured, and thirteen sheets is still thirteen sheets.

**The read is marginal against the client's 60 s bound.** Fired back-to-back, three consecutive searches all
hit `REQUEST_TIMEOUT` (one at 50 s after being superseded, two at the full 60 s). Spaced ~40 s apart, 4/4
direct reads succeeded. The harness was the variable in the first case — but a real operator reloading twice
in a minute is the same variable, so this is a usability fact and not only a test artifact.

**And 6.1 MB is the other half.** Server time is ~20 s; wall time is ~26 s in-browser. The gap is transfer.
Deferring more tables would not touch `amazon_daily_sales_snapshot`, which is both the slowest sheet and a
first-layer necessity.

**This is an operator architecture decision, not an optimisation to take unilaterally.** The seal is granted
because the lazy-once and site-scope contracts are correct and stable; the first-layer cost is a separate
problem that pre-dates this round and was not what R42 set out to fix.

---

## 6. Safety

```
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
WRITE_ACTIONS_SENT = 0        GAP_JOB_STATUS_REQUEST_SENT_COUNT = 0   GAP_JOB_START_COUNT = 0   GAP_WRITE_COUNT = 0
PROPERTY / DRIVE / TRIGGER / DIRECT_CELL_WRITE_COUNT = 0
server self-report, after acceptance: read_only = true · db_writes = 0 · drive_writes = 0 ·
                                      status_transitions = 0 · emails = 0 · demo_mutations = 0
```

The guard allowed **zero** non-GET requests across both runs and aborted two `getTable` calls — the Factory
Inventory page's own read during the route-away step, correctly denied because it was not on the approved
list. Zero dialogs, zero console errors. Ephemeral Chrome profile throughout; the operator's profile was
never used.

Tables touched: the approved 13 + 6. No fourteenth, no seventh.
`amazon_inventory_health_snapshot` remains `UNAUTHORIZED_UNKNOWN`, read-only, no registry change.

---

## 7. Carried limits — not falsified

```
MULTI_HEADER_PRESERVED        = FIXTURE_PROVEN / PRODUCTION_NOT_EXERCISED
AMBIGUOUS_LINEAGE_FAIL_CLOSED = FIXTURE_PROVEN / PRODUCTION_NOT_EXERCISED
```

Production contains no merged/MULTI shipment header and no dangling lineage, so neither path can be exercised
live. Neither was created for the sake of a green line. Both are proven by fixture in
`site-scoped-exposure-read-s8-r4b-2d`.

One more, recorded rather than hidden: **route-away and return re-runs the first-layer read** (one request on
remount). The exposure cache survives it — zero exposure requests — but the 13-table read is paid again, and
at ~20 s server it is the most expensive consequence of leaving the page.

---

## 8. Post-acceptance health

```
build = release = R42 · router = R41 · workspace_module = R42 · contract = 18 · list_version = 14
mixed_deployment = false · missing_required = [] · stale_required = [] · missing_actions = []
R42 owners = [60_, 63_]   unexpected R42 owners = 0
```

Unchanged from the pre-acceptance gate. Nothing the acceptance did moved the deployment.
