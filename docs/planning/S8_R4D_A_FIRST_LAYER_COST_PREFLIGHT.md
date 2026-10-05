# S8-R4D-A — SITE INVENTORY FIRST-LAYER READ COST
## Root-cause preflight · READ ONLY · no implementation

**Measured against the published frontend `f6b4164` with Production backend R42.** No runtime byte was
modified. Two bounded read probes were issued; nothing was written.

```
S8_R4D_A_FIRST_LAYER_COST_PREFLIGHT = PASS
ROOT_CAUSE = THE PER-SHEET FLOOR, NOT ROWS AND NOT BYTES
```

---

## 1. The root cause, in one line of evidence

```
fc_target_rules   0 rows   1,958-2,065 ms
```

An empty sheet is the **second most expensive table in the first layer**. Nine of the thirteen tables were
measured individually and every one of them costs between 1.1 s and 2.1 s — *regardless of how much data it
holds*. Only `amazon_daily_sales_snapshot` exceeds that band, and only by about two seconds.

Thirteen sheets x a ~1.0-2.1 s floor = 13-27 s. The observed range is 18.3-22.6 s. **The row count is very
nearly irrelevant.** This is why removing six sheets in R42 bought nothing measurable: it removed six sheets
holding 58 rows, and the saving was six floors — real, but landing inside the +/-4 s variance of the read.

So "which table should we trim?" is the wrong question. The right one is **"how many sheets do we open, and in
how many round trips?"**

---

## 2. FIRST_LAYER_TABLE_TIMING_SET

Server-reported `slowestTables` across four spaced first-layer reads (R4C) plus one two-sheet probe (today).
Percentages are against the 20,499 ms mean.

| TABLE | ROWS | READ_MS (samples) | MEAN | % OF SERVER TIME |
|---|---|---|---|---|
| amazon_daily_sales_snapshot | 3,814 returned / **9,779 physical** | 4,435 · 4,984 · 4,077 · 3,604 | 4,275 | 20.9% |
| fc_target_rules | **0** | 2,065 · 1,958 | 2,065 | 10.1% |
| fc_regular_forecast | 496 | 2,005 | 2,005 | 9.8% |
| warehouses | 361 | 1,876 · 1,812 · 1,439 · 2,622 | 1,937 | 9.4% |
| sku_details | 192 | 1,649 · 1,712 · 1,803 · 1,671 | 1,709 | 8.3% |
| overseas_inventory_snapshot | 260 | 1,699 | 1,699 | 8.3% |
| marketplace_skus | 495 | 1,202 · 1,392 · 1,411 | 1,335 | 6.5% |
| factory_stock | 112 | 1,316 | 1,316 | 6.4% |
| fc_special_events | 431 | 1,114 | 1,114 | 5.4% |
| *(openSpreadsheet)* | — | 399 · 370 · 352 · 558 | 420 | 2.0% |

**NOT MEASURED — no value invented:** `marketplaces`, `amazon_inventory_snapshot`,
`amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot`. None ever entered a top-five, so each is
below ~1.1 s. By subtraction the four together account for ~2,624 ms (~656 ms each) — **derived, not measured
individually**, and recorded as such.

---

## 3. amazon_daily_sales_snapshot — the current contract

```
CURRENT_READ_OWNER      60_api_v1_inventory_replenishment_workspace.gs
CURRENT_READ_FUNCTION   sirWsRowsToObjects_  ->  sheet.getDataRange().getValues()
CURRENT_SCOPE           NONE — the whole physical sheet, every column, every row
CURRENT_FILTERING_POINT  sirWorkspaceBuild_ (in memory, AFTER the read)
CURRENT_ROWS_READ_FROM_SHEET   9,779
CURRENT_ROWS_RETURNED           3,814
RECENT_WINDOW_APPLIED           YES  (keep 14 dates per company|country|marketplace|sku)
RECENT_WINDOW_APPLIED_BEFORE_OR_AFTER_FULL_SHEET_READ   AFTER
```

Classification: **(A) reads the full physical sheet, then filters.** No bounded helper exists on this path;
`recentWindow` is a post-read projection and nothing more.

### What Site Inventory actually needs

```
SITE_INVENTORY_DAILY_SALES_REQUIRED_WINDOW = 7 calendar dates per scope key,
                                             ending on that key's OWN latest present date
```

Traced end to end rather than assumed:

* `getAmazonDailySalesSnapshot` has **exactly one** browser consumer — `inventory-replenishment.js:11941` ->
  `IR.salesTrend7d` (line 376), which builds seven dates ending on the latest date present in the scoped result.
* IR's **Avg Sales / Day does not come from this table at all.** `IR.avgSalesPerDay` (line 418) reads
  `amazon_weekly_sales_snapshot`.
* The 90-day / 30-eligible-NORMAL-day rule lives in `KMCALC.normalizedAvgSalesPerDay` and runs **server-side**
  in `42_api_v1_recommendation_workspace.gs` and the generated bundle, over
  `supply-planning-production-source`'s own canonical snapshot read. It reaches Site Inventory already
  computed, as `horizonBasis.avgSalesPerDay`, via a **different action**.

So the 90-day business rule and this transport do not touch each other, and the server's 14-date window is
already **twice** what the only consumer reads.

---

## 4. Bounded read vs post-read filter — the load-bearing distinction

```
CAN_AVOID_FULL_DAILY_SALES_SHEET_READ = NO for rows · PARTIALLY YES for columns
EXPECTED_SERVER_BENEFIT = LOW
```

* **Rows — no.** The window is "the last 14 dates *per key*". Which physical rows those are cannot be known
  without reading the key and date columns of all 9,779 rows. Reading only the last N physical rows would
  assume the sheet is append-ordered by date; nothing guarantees that, and being wrong would silently empty a
  site's chart — the exact class of quiet wrongness the `recentWindow` design notes refuse.
* **Columns — yes, genuinely.** Six of thirty-six fields are consumed, and all six lie in **columns 1-9**
  (`snapshot_date, country, marketplace, channel, sku, ... sales_units`) — one contiguous range. A
  `getRange(1, 1, lastRow, 9).getValues()` reads **25% of the cells**. That is a real reduction in cells read,
  not a cosmetic filter.
* **But the server benefit is small**, because the cost is mostly the floor. Of this table's ~4,275 ms,
  ~1,958 ms is the per-sheet floor that `fc_target_rules` exposes. The cell-dependent remainder is ~2,300 ms,
  of which a 9-of-36-column read could recover perhaps ~1,700 ms — **~8% of a 20.5 s read.**

The payload benefit, by contrast, is large. See §6.

### Business contract — all NO

```
AVG_SALES_CHANGED               = NO   (sourced from amazon_weekly_sales_snapshot, untouched)
CAMPAIGN_EXCLUSION_CHANGED      = NO   (server-side, 42_/bundle, different read path)
SPECIAL_EVENT_EXCLUSION_CHANGED = NO   (same)
FALLBACK_BEHAVIOR_CHANGED       = NO
RECOMMENDATION_CHANGED          = NO
GAP_CALCULATION_CHANGED         = NO   (inventoryReplenishmentGap.get, separate owner)
SUBMIT_PAYLOAD_CHANGED          = NO
REQUEST_ORDER_HANDOFF_CHANGED   = NO
```

A column projection confined to this one table on this one action changes no business truth — **provided** the
seven dates the chart needs remain reachable, which keeping the existing 14-date window guarantees.

---

## 5. fc_target_rules — the empty-sheet cost

```
FIRST_LAYER_CONSUMER               _irForecastPlanning2mo(ctx.fcRows, ctx.targetRules, siteScope)
IS_REQUIRED_FOR_TRUTHFUL_FIRST_RENDER   YES
EMPTY_TABLE_DETECTION_MECHANISM    none — emptiness is discovered by reading
CURRENT_READ_PATH                  getSheetByName -> getDataRange().getValues()
CURRENT_SHEET_TOUCH_COST           1,958-2,065 ms for 0 rows
```

It is read because Target % feeds the forecast shown in the collapsed row. Production holds **zero** rules
today, so every row falls back to 100% — but *today's emptiness is not a contract*. A rule added tomorrow must
appear, so the table cannot be dropped on the grounds that it is currently empty.

```
EMPTY_SHEET_SKIP_CAN_AVOID_TABLE_READ_COST = NO (not demonstrable)
```

Every candidate detector — `getLastRow()`, sheet metadata, a manifest, a count — is **another Sheets service
round trip**, and the round trip is what the 1,958 ms is. Replacing one round trip with another saves nothing
reliably, and proving otherwise would require deploying an instrumented handler, which this round forbids.

So strategy **(B) is not demonstrable**, **(D) defer is refused** (the rules are required for truthful first
render), and **(A) keep the current read** stands unless **(C)** becomes available — a shared bootstrap source
that already holds the rules. One exists in principle: `fc-summary` and `request-order` read the same table on
their own paths. Making one of them authoritative for Site Inventory is an **architecture decision**, not a
technical repair.

---

## 6. Payload

```
FIRST_LAYER_PAYLOAD_BYTES = 6,168,676
amazon_daily_sales_snapshot = ~3,989,000 B = ~64.7% of the whole response   [MEASURED, not estimated]
```

Measured directly: a two-sheet probe for `amazon_daily_sales_snapshot` + `fc_target_rules` returned
**3,989,702 bytes** with `fc_target_rules` contributing zero rows.

| | |
|---|---|
| rows returned | 3,814 |
| fields returned | **36** |
| fields consumed by Site Inventory | **6** — `snapshot_date, country, marketplace, channel, sku, sales_units` |
| UNUSED_FIELD_COUNT | **30** |
| bytes per row | ~1,035 |

The thirty unused fields include `source_row_hash`, `sync_batch_id`, `source_file_id`, `source_sheet_name`,
`browser_page_views`, `app_session` and twenty-four more. The import-provenance block alone is a large share of
every row.

```
SAFE_PROJECTION_POSSIBLE     = YES, for amazon_daily_sales_snapshot on this action only
ESTIMATED_PAYLOAD_REDUCTION  = ~3.4 MB of 6.17 MB (~55%); ~3.7 MB (~60%) if the window also drops 14 -> 7
```

**The guard that makes this narrow.** `normalizeAmazonDailySalesSnapshotRecord` keeps `raw: r`, and `.raw` *is*
read elsewhere on this page — for `fc_target_rules` (line 449), `warehouses` (617) and the allocation drafts
(6047 / 6107 / 6142). It is **never** read for daily sales. So a projection is safe for this one table and
would be unsafe as a general rule. No field may be dropped from any other table on this evidence.

```
CALLER_COUNT = 3   for inventoryReplenishment.workspace.get
  1. inventory-replenishment.js   primary render     13 tables   <- the only caller asking for daily sales
  2. inventory-replenishment.js   exposure read       6 tables
  3. method-registry.js           carrier catalogue   2 tables (include-gated)
```

Only caller 1 requests this table, so a projection cannot reach the other two.

---

## 7. Wall vs server

```
SERVER_MS   19,443 (in-browser) · 20,499 mean (direct)
WALL_MS     26,252 (in-browser)
GAP         ~6,800 ms
```

Two data points, and they say something useful:

| | payload | serverMs | wallMs | gap |
|---|---|---|---|---|
| 13-table first layer | 6.17 MB | 19,443 | 26,252 | 6,809 |
| 2-table probe (today) | 3.99 MB | 5,507 | 11,797 | 6,290 |

The gap barely moves while the payload drops by a third. **It is dominated by a fixed cost — the `/exec` 302 ->
`script.googleusercontent.com/macros/echo` round trip — not by bytes.** With n=2 that is an indication, not a
proof.

```
TRANSPORT_MS / DOWNLOAD_MS / PARSE_MS / NORMALIZATION_MS / RENDER_MS = NOT SEPARATELY MEASURED
UNACCOUNTED_CLIENT_MS = ~6,300-6,800
```

Server-side stages *are* measured and exonerate the handler's own work: `BUILD_VIEW_MODEL = 78 ms`.

---

## 8. Route-away / return — already solved, and the re-read is deliberate

```
FIRST_LAYER_ROUTE_RETURN_RE_READ = YES
ROUTE_RETURN_FIRST_LAYER_REUSE_CLASS = NEITHER BUG NOR TECHNICAL REPAIR — ARCHITECTURE_DECISION
```

This corrects the R4C side-finding. The reuse **already exists**: `_irBootstrapScope_` (line 9613) has a
`RESTORED` branch that paints the retained model immediately — no loading state, no blocking request — bounded
by `_IR_RESULT_TTL_MS = 10 min` and `_irSameScope_`. The one first-layer request R4C observed on remount is the
**quiet revalidation** that runs *behind* the painted table (`owner: 'RESTORED_MOUNT_REVALIDATION'`), which
never touches `status` and whose failure leaves the restored result in place.

So the operator does **not** wait ~20 s on return. The server work is paid, off the critical path. Removing it
would mean painting inventory the server has not confirmed — a freshness contract, and the task's own
instruction applies: *do not silently retain potentially stale inventory data.* That makes it the operator's
call, not a repair.

---

## 9. Burst reliability

```
BURST_TIMEOUT_REPRODUCIBLE = YES — reproduced today OUTSIDE the browser harness
BURST_TIMEOUT_ROOT_CAUSE   = NOT ESTABLISHED; best supported = Apps Script service-side contention
                             at the /exec -> usercontent echo hop
CONFIDENCE = LOW-MEDIUM
```

Today's first probe attempt returned **HTTP 404 with an HTML body after 50.8 s**, for a two-sheet read that
succeeded 60 s later in 11.8 s wall / 5.5 s server. It was a plain `node fetch` — **no Chrome, no CDP, no
harness** — which removes HARNESS_EFFECT as the sole explanation of the R4C burst timeouts.

The shipped transport already names this failure: `EXPIRED_USERCONTENT_REDIRECT` —
*"The API redirect target had already expired, so a 404 page came back instead of data. Nothing was read."*
Classification is therefore **TRANSPORT BOUNCE**, not SERVER EXECUTION: the handler finished (or never started)
and the redirect target was gone. SERVER EXECUTION is positively excluded for this instance — 5.5 s of handler
work cannot produce a 50.8 s wall.

```
CLIENT_TIMEOUT_MS = 60,000
OWNER             = km-transport.js:329  `_readTimeoutMs`, the DEFAULT (no caller passes deps.readTimeoutMs)
IS_TIMEOUT_ACTION_SPECIFIC = NO — for reads the per-action table only ever widens, and it is write-only
RETRY_POLICY      = read retry on 408 / 429 / 5xx only; a 404 is NOT retried (operation-system-db-api.js:4279)
```

**A latent inconsistency, recorded not fixed:** a second read bound exists — `KM_READ_TIMEOUT_MS_ = 45,000`
(operation-system-db-api.js:4180). The live 60 s message proves the km-transport default is what governs this
path. Two divergent read bounds in one codebase is a trap for a future round. Raising either is not an
optimization and is not proposed.

---

## 10. Candidates

| | A — bound daily sales | B — skip empty fc_target_rules | C — projection / payload | D — route-return reuse |
|---|---|---|---|---|
| ROOT_CAUSE_SUPPORTED | PARTLY | **NO** | **YES** | NO |
| TECHNICAL_FIX_AVAILABLE | YES (columns 1-9) | NO | YES | already shipped |
| EXPECTED_BENEFIT | server ~8%; no payload gain alone | none demonstrable | **payload ~55-60%**; server low | none |
| BUSINESS_CONTRACT_CHANGE | NO | NO | NO | **YES — freshness** |
| ARCHITECTURE_DECISION_REQUIRED | NO | YES (shared source) | NO | **YES** |
| BACKEND_CHANGE_REQUIRED | `60_` | `60_` | `60_` | none |
| FRONTEND_CHANGE_REQUIRED | none | none | none | inventory-replenishment.js |
| DB_WRITE_REQUIRED | NO | NO | NO | NO |

A and C are the same edit seen from two sides: a bounded column read of `amazon_daily_sales_snapshot` reduces
both cells read *and* bytes returned, because the 30 unused fields are exactly the columns not read.

```
RECOMMENDED_NEXT_REPAIR = CANDIDATE A+C AS ONE CHANGE —
  read amazon_daily_sales_snapshot by bounded column range (cols 1-9 of 36) in 60_,
  on the primary-render path only.
  Expected: payload 6.17 MB -> ~2.7 MB; server ~20.5 s -> ~18.8 s.
```

Recommended because it is the only candidate that is **evidence-supported, contract-neutral, single-file,
single-caller and reversible**. It is explicitly **not** a fix for the twenty-second read.

### The caveat the operator must weigh

**No candidate on this list makes the first layer fast.** The measured root cause is a ~1.0-2.1 s floor paid
once per sheet, thirteen times, and none of A/B/C/D removes a sheet. The only changes that would are:

1. **One round trip instead of thirteen** — the Advanced Sheets Service `spreadsheets.values.batchGet` reads
   many ranges in a single call. If the floor is the per-sheet round trip, this collapses ~17 s into one. It
   replaces the read primitive for this handler. **Not audited in this round; no evidence yet.**
2. **Server-side scope filtering** — the page's own manifest already records that 9 of 13 tables are
   `scope_filterable_server_side: true`. It reduces rows and bytes, not sheet count, so by this round's
   evidence it would help the payload and not the floor.

Both are architecture decisions. Neither is proposed here.

---

## 11. Safety and boundary

```
READ_TABLE_COUNT = 13    WRITE_TABLE_COUNT = 0    DELETE_TABLE_COUNT = 0
WRITE_PRIMITIVE_COUNT = 0   PROPERTY_WRITE_COUNT = 0   DRIVE_WRITE_COUNT = 0
TRIGGER_WRITE_COUNT = 0     DIRECT_CELL_WRITE_COUNT = 0
GAP_WRITE_REACHABLE = NO    JOB_START_REACHABLE = NO    gapJob.status.get = NOT ISSUED
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
NEW_PHYSICAL_TABLE_REQUIRED = NO
amazon_inventory_health_snapshot = UNAUTHORIZED_UNKNOWN · READ ONLY · PERMANENT_REGISTRY_CHANGE = NO
```

All thirteen candidate tables carry the same classification, because this round changed none of them:
`CLASSIFICATION = existing first-layer read` · `ACCESS = READ` · `EXPECTED_SCOPE = whole sheet (current
contract)` · `RUNTIME_OWNER = 60_api_v1_inventory_replenishment_workspace.gs` · `DIRECT_CELL_WRITE = NO` ·
`TEST_LINEAGE = N/A` · `RECOVERY = NONE — READ ONLY` · `OPERATOR_APPROVAL_REQUIRED = NO` for reading (already
the shipped contract), **YES** for any change to them.

`EXPECTED_MAX_ROW_COUNT` is measured where observed (§2) and `UNKNOWN` for the four unmeasured tables; no
ceiling was invented.

Diagnostics issued this round: **two** GET reads of `inventoryReplenishment.workspace.get` (one failed in
transport, one succeeded), each naming two tables. No other action reached Production.

```
MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN
  INVENTORY_REPLENISHMENT_SUBMIT_CHANGED / REQUEST_ORDER_HANDOFF_CHANGED /
  PURCHASE_ORDER_FLOW_CHANGED / WEEKLY_SHIPPING_PLAN_SUBMIT_CHANGED /
  SHIPMENT_DRAFT_CREATION_CHANGED / SHIPMENT_DISPATCH_CHANGED /
  GAP_CALCULATION_CHANGED / GAP_MATERIALIZATION_CHANGED /
  BUSINESS_DECISION_SOURCE_CHANGED  = NO
```

---

## 12. Publication impact (estimates — no release cut)

| candidate | BACKEND_OWNER_SET | FRONTEND_FILE_SET | RELEASE_CUT_REQUIRED | CACHE_TOKEN_ROTATION_REQUIRED |
|---|---|---|---|---|
| A + C | `60_` | none | YES (R43) | **NO** — no frontend byte moves |
| B | `60_` | none | YES | NO |
| D | none | `inventory-replenishment.js` | YES | YES (application family) |

A+C is the cheapest to publish: one Apps Script file, no frontend change, therefore no token rotation.
