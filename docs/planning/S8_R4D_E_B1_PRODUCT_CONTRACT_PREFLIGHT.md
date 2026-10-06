# S8-R4D-E — B1 PRODUCT IMPLEMENTATION CONTRACT PREFLIGHT
## Architecture + contract + DB touch. Nothing implemented, no release cut.

```
MODE                        ARCHITECTURE + CONTRACT + DB TOUCH PREFLIGHT ONLY
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0
R44_RELEASE_CUT = NO
PRODUCTION_ROWS_WRITTEN = 0 · PRODUCTION_ROWS_DELETED = 0 · SCHEMA_CHANGES = 0
```

---

# PART 1 — CLOSING S8-R4D-D2

## 1.1 The measurement

All five pairs, nothing discarded, recomputed independently from the operator's log:

| PAIR | ORDER | CONTROL_MS | B1_MS | SAVING_MS | SEMANTIC_DIFF | ERROR |
|---|---|---|---|---|---|---|
| 1 | CONTROL → B1 | 21,899 | 2,069 | 19,830 | 0 | none |
| 2 | B1 → CONTROL | 22,006 | 2,176 | 19,830 | 0 | none |
| 3 | CONTROL → B1 | 27,203 | 2,874 | 24,329 | 0 | none |
| 4 | B1 → CONTROL | 23,707 | 2,500 | 21,207 | 0 | none |
| 5 | CONTROL → B1 | 19,960 | 2,265 | 17,695 | 0 | none |

```
CONTROL_MEDIAN_MS = 22,006        B1_MEDIAN_MS = 2,265
PAIRED_MEDIAN_SAVING_MS = 19,830  PAIRED_MEDIAN_SAVING_PERCENT = 90.1
B1_WIN_COUNT = 5                  CONTROL_WIN_COUNT = 0
RATIO = 9.72x                     SIGN TEST (one-sided, n=5) p = 0.031
CONTROL_SERVICE_CALL_COUNT = 13   B1_REMOTE_CALL_COUNT = 2
BENCHMARK_COMPLETED_ALL_5_PAIRS = YES   PAIR_ORDER_MATCH = YES
CONTROL_ARM_COUNT = 5             B1_ARM_COUNT = 5
```

The distributions do not come close to touching: the **smallest** saving (17,695 ms) is more than six times the **largest** B1 sample (2,874 ms). The alternation found no order effect worth correcting — CONTROL measured {21,899 · 27,203 · 19,960} when it ran first and {22,006 · 23,707} when it ran second; the two sets interleave.

```
B1_SEMANTIC_ACCEPTANCE = PASS
  DATE_SEMANTIC_DIFF_COUNT = 0 · IDENTITY_TYPE_DIFF_COUNT = 0
  TRAILING_BLANK_SEMANTIC_DIFF_COUNT = 0 · TYPE_DIFF_COUNT = 0
  SEMANTIC_RESULT_DIFF_COUNT = 0 · failures = []
B1_PERFORMANCE_EFFECT = CLEAR
B1_RUNTIME_JUSTIFIED  = YES (transport), SUBJECT TO PART 2
```

No normalization exception was introduced to reach those zeros.

## 1.2 The ~2.4 s estimate was wrong by a factor of eight, and here is why

R4D-D predicted a ~2.4 s prize. The measurement is 19.8 s. Recorded as required, with the cause rather than the apology:

The 2.4 s came from B3's ~200 ms per removed round trip × 12. That 200 ms was measured on **header-only** reads — `getRange(1,1,1,n)` — and it was derived as a *difference of medians* across two Production samples whose own spread was 19,035–40,860 ms. I then generalised a small number, measured on the cheapest possible read, under heavy noise, to full-sheet reads. The LOW-confidence caveat I attached was correct and insufficient: the right conclusion from "the removed reads were header-only" was *this number does not transfer*, not *this number transfers weakly*.

**The older model was right and I replaced it with a narrower measurement.** `per-sheet-floor-not-rows` says an Apps Script sheet read costs ~1–2 s whatever it holds. 13 × 1,693 ms = 22,006 ms — the CONTROL median, almost exactly. The benchmark did not overturn that model; it confirmed it and refuted the refinement.

What the number actually means: **the cost is the SpreadsheetApp range bridge, not the payload.** `batchGet` moves the same bytes in 2.3 s. So 13 → 2 is not "eleven fewer round trips"; it is a different transport.

## 1.3 The caveat that must travel with the headline number

```
CONTROL arm (13 reads only, editor)        22,006 ms
R43 whole handler (reads + view model + envelope, Web App)   17,529 ms
```

**The benchmark's CONTROL arm is 4,477 ms SLOWER than the entire R43 handler it is supposed to be a subset of.** The two were measured through different execution paths on different days. Both numbers are real; they are not comparable.

So the 90.1% is a **transport-layer** result, measured fairly, and it is not an end-to-end page-latency forecast. Nothing here licenses "the page will get 90% faster". The product-level number has to be measured after implementation the same way R43's was — against a same-day baseline, through the Web App. Stating this is the same discipline §3 asks for in the other direction: do not substitute an estimate for a measurement, including an estimate derived *from* a measurement.

## 1.4 TEMP cleanup — NOT CONFIRMED

```
TEMP_S8_R4D_D2_SHEETS_AVAILABILITY_PROBE.gs   = UNCONFIRMED
TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs   = UNCONFIRMED
TEMP_BENCHMARK_FILE_PRESENT_POST              = UNCONFIRMED — not NO
```

No operator message has stated either file was deleted. §22 and §5 both require the benchmark file to be absent whatever the verdict, and the instruction on an unconfirmed file is to stop and ask rather than record a tidy value. **Both files must be removed from the Production Apps Script project and confirmed before R4D-E proceeds to implementation.** The benchmark tool is read-only, so its presence is not dangerous — it is simply undeployed code compiled on every execution, and the rule exists so that "TEMP" means something.

---

# PART 2 — S8-R4D-E PREFLIGHT

## E1 — Product target, and a correction to its scope

The target is to replace the reader behind the Site Inventory first-layer read. One correction to the framing, because it changes the contract:

**`io.readTable` serves 21 tables, not 13.** `SIR_WORKSPACE_TABLES_` (`60_…workspace.gs:67`) declares 21 entries. The thirteen are what the **client asks for** on the first layer (`IR_FIRST_LAYER_TABLES_`, `inventory-replenishment.js:9019`); six more are the exposure family fetched by a second request, and two carrier tables are `include`-gated.

```
FIRST LAYER   13 tables   IR_FIRST_LAYER_TABLES_        — benchmarked, authorized
EXPOSURE       6 tables   IR_EXPOSURE_TABLES_           — second request, same reader
CARRIER        2 tables   include: 'carrierPlanning'    — gated, same reader
                 = 21 entries in SIR_WORKSPACE_TABLES_
```

This does **not** widen the DB touch surface: R43 already reads all 21 through SpreadsheetApp, so B1 introduces **no new table**. It does mean the batch must be built from the **resolved request**, not from a constant 13 — and it means the date map (E3) must eventually cover all 21, or the implementation must be bounded to the first layer and leave two readers in one file.

```
ARCHITECTURE DECISION 1 — B1 SCOPE
  (a) first layer only      13 tables batched, 8 still per-sheet → TWO readers, two semantics
  (b) whole reader          21 tables batched → ONE reader, needs a 21-table date map
  RECOMMENDATION: (b). Two readers in one file is how the two-path date drift in §E3.5 happened.
  Not a decision this preflight may take — the authorized benchmark covered 13.
```

## E2 — DB touch preflight

```
READ_TABLE_COUNT = 13 · WRITE_TABLE_COUNT = 0 · DELETE_TABLE_COUNT = 0
ACCESS = READ for all thirteen · DIRECT_CELL_WRITE = NO · TEST_LINEAGE = N/A · RECOVERY = NONE (reads only)
```

Row counts are the live R4D-D census, i.e. **observed on one date**, not a declared ceiling.

| TABLE | CLASSIFICATION | PURPOSE IN THE FIRST LAYER | OBSERVED ROWS | COLS | RUNTIME OWNER (writer) | GROWTH | OP APPROVAL |
|---|---|---|---|---|---|---|---|
| marketplaces | MASTER | site identity, display names, allocation priority | 15 | 15 | `03_master_data_handlers` | bounded | NO |
| marketplace_skus | MASTER | SKU ↔ site membership, launch date | 495 | 15 | `03_` | bounded | NO |
| sku_details | MASTER | product attributes, dimensions, pricing | 192 | 42 | `03_`, `04_` | bounded | NO |
| warehouses | REFERENCE | warehouse identity, factory flag, activity | 361 | 28 | *not confirmed — passive master* | bounded | NO |
| amazon_inventory_snapshot | SNAPSHOT | on-hand / inbound / DoS per site-SKU | 259 | 33 | `06_`–`10_` importers | replaced per import | NO |
| amazon_inventory_health_snapshot | SNAPSHOT | inventory age buckets | 346 | 23 | `06_`–`10_` | replaced | NO |
| amazon_daily_sales_snapshot | SNAPSHOT | daily units/amount; `salesTrend7d` input | 3,817 *(9,777 physical)* | 36 | `06_`–`10_` (BigQuery, rolling, 90d) | **unbounded in time** | NO |
| amazon_weekly_sales_snapshot | SNAPSHOT | `avgSalesPerDay` authority | 247 | 29 | `06_`–`10_` | grows weekly | NO |
| fc_regular_forecast | PLAN | monthly baseline forecast | 496 | 26 | `04_` | grows yearly | NO |
| fc_target_rules | PLAN | target share rules | **0** | **0** | `14_fc_write_handlers` | — | NO |
| fc_special_events | PLAN | event windows and event FC | 431 | 29 | `14_` | grows | NO |
| overseas_inventory_snapshot | SNAPSHOT | overseas warehouse stock and reservations | 260 | 17 | `05_overseas_inventory_handlers` | replaced | NO |
| factory_stock | SNAPSHOT | factory on-hand CN/TW | 112 | 8 | `21_`, `03_` baseline | bounded | NO |

```
EXPECTED_SCOPE = whole sheet, every row, for all thirteen — except the two the recent-window
                 projection trims server-side (SIR_WS_RECENT_WINDOW_, 60_:128):
                 amazon_daily_sales_snapshot  keep 14 periods by snapshot_date
                 amazon_weekly_sales_snapshot keep 4  periods by week_end_date / snapshot_week
amazon_inventory_health_snapshot = UNAUTHORIZED_UNKNOWN · READ ONLY · PERMANENT_REGISTRY_CHANGE = NO
NO FOURTEENTH TABLE.
```

**One consequence of the recent-window rule for B1.** The trim happens *after* the read, in `sirWorkspaceBuild_`. `batchGet` fetches the whole sheet exactly as `getDataRange()` does, so B1 changes nothing here — but it also means B1 does **not** reduce the 9,777 physical rows of daily sales that cross the wire. A column projection (the A+C idea) remains unexplored and is explicitly **not** part of B1.

## E3 — The declared date map, and why it cannot be derived

This is the contract the benchmark did not and could not test. **The benchmark used CONTROL as the oracle.** It scored 0 date diffs because the shipped reader *told it* which columns were Dates. A product reader has no oracle. Zero diffs with an oracle says nothing about the error rate without one.

Under `UNFORMATTED_VALUE` + `SERIAL_NUMBER`, a date and a number are **the same wire value**. Only the map distinguishes them.

### E3.1 — There is no canonical schema registry

Searched exhaustively. The repository has no single `EXPECTED_HEADERS` constant covering the thirteen. Columns are resolved everywhere by live header name (`headers.indexOf(name)`). The declared material that exists is partial and per-table:

| source | covers |
|---|---|
| `14_fc_write_handlers.gs:50` `FC_SPECIAL_EVENTS_HEADERS_` | `fc_special_events` (24 names, **order differs from the live sheet**) |
| `14_fc_write_handlers.gs:61` `FC_TARGET_RULES_HEADERS_` | `fc_target_rules` (28 names — the only schema that table has) |
| `04_marketplace_forecast_import.gs:247` `requiredHeaders` | `sku_details`, `marketplace_skus`, `fc_regular_forecast` |
| `05_overseas_inventory_handlers.gs:118` required-header validation | `overseas_inventory_snapshot` |
| `06_amazon_import_config.gs:43` `IMPORT_CONFIGS[].dateFields` | the four Amazon tables |
| `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md:437` "As-of column" table | 5 tables, explicitly date-typed |

```
PRODUCT_DATE_COLUMN_MAP_SOURCE = DECLARED_EXPLICIT_MAP
  seeded from the live value-type census, reconciled against importer dateFields and the
  As-of contract, hand-declared per column, and GATED BY A DRIFT DETECTOR (E3.6).
  It is NOT "DECLARED_CANONICAL_SCHEMA", because no such artifact exists.
```

### E3.2 — A name heuristic is wrong in both directions, measurably

```
fc_special_events.event_month        number 431/431    sample 11
amazon_weekly_sales_snapshot.snapshot_week   string 247/247   sample "2026-09-21~2026-09-27"
fc_special_events.event_period       string 431/431    sample "2026-11-19~2026-11-30"
```

`event_month` is a **month ordinal, 11**. Under `SERIAL_NUMBER` it arrives as the number 11 — indistinguishable from a date serial. A map that trusted the `_month` suffix would convert it to 1900-01-10 and silently destroy every FC event window. In the same table, `event_start_date` and `event_end_date` genuinely are Dates. **Four date-flavoured names, three different types, one table.**

### E3.3 — A value heuristic misses what is not there today

```
overseas_inventory_snapshot.snapshot_date      blank 260/260
overseas_inventory_snapshot.wh_on_the_way_eta  blank 260/260
overseas_inventory_snapshot.last_movement_at   blank 260/260
fc_target_rules                                0 rows, 0 columns — no header row at all
```

Five columns and one whole table are invisible to any map derived from values. They are dates by declaration (`05_…:118` names `wh_on_the_way_eta` in the required set) and will arrive as bare serials the day they are populated.

### E3.4 — And it is fragile on partial evidence

```
sku_details.updated_at             ISO_DATE 10, blank 182   —  5% dated
factory_stock.last_transaction_at  ISO_DATE  4, blank 108   —  4% dated
```

Two columns are dates in under one row in twenty. The R4D-D census caught them only because it read **every** row. A census over a sample would have classified both ALL_BLANK, and those rows' dates would have become raw serial numbers in production.

### E3.5 — The writers are not an authority either

`fcWriteTimestamp_()` (`14_…:122`) returns a **string**, `'yyyy-MM-dd HH:mm:ss'`. The census shows `fc_special_events.created_at` is a real `Date` — sample `2026-09-18T07:44:07.000Z`. **Google Sheets parsed the string into a Date on write.** Same story for `marketplace_skus.launch_date`: both write paths (`03_…:430` and `:509`) write `String(body.launch_date || '').trim()`, and all 495 live rows hold Dates.

So the stored type is decided by **Sheets' own parsing**, not by the writer. The sheet is the only authority, which is exactly why the map is a *copy* of a truth that lives elsewhere, and why it needs a detector rather than a comment.

There is also a live inconsistency worth separating: two read paths produce two date wire formats. `02_core_sheet_db.gs:257` `formatValue_` coerces every Date to `'yyyy-MM-dd'` on the `getOperationDb`/`getTable` path; `60_` returns raw Dates, which serialise to `…T16:00:00.000Z`. B1 must preserve the `60_` behaviour exactly and must not "fix" the divergence — §12 of the D1 contract, still binding.

### E3.6 — The map

41 date columns observed live, +5 declared-but-blank, across 12 tables (`fc_target_rules` contributes none observable).

| TABLE | DATE_COLUMNS |
|---|---|
| marketplaces | `created_at`, `updated_at` |
| marketplace_skus | `launch_date`, `created_at`, `updated_at` |
| sku_details | `created_at`, `updated_at` ⚠ 5% populated |
| warehouses | `created_at`, `updated_at` |
| amazon_inventory_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at` |
| amazon_inventory_health_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at` |
| amazon_daily_sales_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at`, `data_window_start_date`, `data_window_end_date`, `latest_source_date` |
| amazon_weekly_sales_snapshot | `snapshot_month`, `week_start_date`, `week_end_date`, `synced_at`, `created_at`, `updated_at` — **NOT `snapshot_week`** |
| fc_regular_forecast | `created_at`, `updated_at` |
| fc_target_rules | `created_at`, `updated_at` — **declared only**, zero live evidence |
| fc_special_events | `event_start_date`, `event_end_date`, `created_at`, `updated_at` — **NOT `event_month`, NOT `event_period`** |
| overseas_inventory_snapshot | `created_at`, `updated_at`, + **declared-blank**: `snapshot_date`, `wh_on_the_way_eta`, `last_movement_at` |
| factory_stock | `created_at`, `updated_at`, `last_transaction_at` ⚠ 4% populated |

```
DATE_COLUMN_COUNT = 41 observed + 5 declared-blank = 46 declared
B1_DATE_COLUMN_MAP_SOURCE (benchmark)  = CONTROL_RUNTIME_ORACLE
PRODUCT_B1_DATE_MAP_CONTRACT_UNRESOLVED = YES
```

**It stays UNRESOLVED, and the reason is specific rather than procedural.** `fc_target_rules` is in the thirteen, has no header row, and three of its declared REQUIRED columns (`scope_type`, `scope_id`, `target_percentage`) are recorded at `14_…:102` as absent from the live sheet pending a migration that has not run. A map entry for a table whose schema is both undeclared-live and known-incomplete is a guess, and this is the one place where a guess converts silently into wrong business numbers.

```
ARCHITECTURE DECISION 2 — DATE MAP AUTHORITY  (operator)
  (a) hand-declared map + drift detector      ← recommended
  (b) second Sheets call for number formats   — +1 remote call, authoritative, self-maintaining
  (c) derive from values at runtime           — REJECTED: that is CONTROL, i.e. B1 does not exist
  The drift detector is NOT optional under (a): a test that re-derives the map from a full live
  read and fails on any difference, so the copy cannot rot in silence.
```

## E4 — Date parity

The conversion is already proven. `b1bmSerialToDate_` produced 0 date diffs across 5 pairs and 41 live columns, and the harness tests it to the millisecond:

```js
ms   = round(serial * 86400000)
wall = new Date(Date.UTC(1899, 11, 30) + ms)
out  = Utilities.parseDate(formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss'), tz, 'yyyy-MM-dd HH:mm:ss')
```

`tz` is the **spreadsheet's** timezone read at runtime (`ss.getSpreadsheetTimeZone()`), never a hard-coded `+08:00` — mutant M14 of the D1 harness exists for exactly that fault.

**Coercion is type-gated, and that is load-bearing, not defensive.** It applies only when the incoming value is a `number`. A string in a declared date column passes through unchanged — which is not hypothetical: `launch_date` is written as a string today, and a future row could hold one.

Required test cases, each with the reason it is there:

| case | why |
|---|---|
| midnight date | the 41-column baseline; must render `…T16:00:00.000Z` under Asia/Taipei |
| fractional serial | `fc_special_events.created_at` = `07:44:07` — a real timestamp, not midnight |
| timezone boundary | a date whose Taipei midnight is the **previous** UTC calendar day |
| leap day | 2028-02-29 |
| blank | must stay `''`, never epoch, never `Invalid Date` |
| string in a date column | `launch_date` — must pass through untouched |
| number in a non-date column | `event_month = 11` — must stay the number 11 |
| serial 0 / negative | must not silently become 1899-12-30 for a genuine zero |

```
REQUIRED: DATE_SEMANTIC_DIFF_COUNT = 0
```

## E5 — Mixed identity types

```
sku_details.sku                     number+string
overseas_inventory_snapshot.sku     number+string
warehouses.postal_code              number+string
warehouses.contact_phone            number+string
```

Four columns, not two. These must arrive with the **same JavaScript type per cell** as `getValues()` produces. `UNFORMATTED_VALUE` already does this — the benchmark's `IDENTITY_TYPE_DIFF_COUNT = 0` is live evidence over all four.

No global `String()`. The D1 harness carries mutant M10 for precisely the "coerce both sides so the test passes" fault, and F5d asserts that a number silently becoming a string **is** a diff.

```
REQUIRED: IDENTITY_TYPE_DIFF_COUNT = 0
```

## E6 — Ragged rows

`batchGet` omits trailing empty cells; `getDataRange()` does not. Canonical rule, unchanged from the harness:

```
pad every row to header width with '' BEFORE the all-blank-row drop and before mapping
```

The order is the whole point. `String(undefined)` is `"undefined"`, which is not empty — so without padding the all-blank-row drop **inverts**, and blank rows survive into the view model. Three tables end in an all-blank column today (`marketplaces.note`, `amazon_weekly_sales_snapshot.note`, `overseas_inventory_snapshot.note`), so this is live, not theoretical. Harness assertions F3/F3a/F3b/F3c and mutant M11 cover it.

```
REQUIRED: TRAILING_BLANK_SEMANTIC_DIFF_COUNT = 0
```

## E7 — Optional / absent sheets

`batchGet` rejects the **whole request** when a named range's sheet does not exist, so one absent optional sheet would take down the other twelve. The metadata pre-step is what prevents that, and it must preserve all seven states separately:

| state | how B1 decides it |
|---|---|
| `SHEET_ABSENT` | not in `spreadsheets.get` → excluded from ranges; `[]` if optional, throw `SCHEMA_NOT_PROVISIONED` if required |
| `EMPTY` | present, `gridProperties` says 0 rows / 0 columns → `HEADER_MISSING` (geometry, as R43 decides it) |
| `HEADER_ONLY` | one row returned → `[]` rows, valid schema |
| `HEADER_MISSING` | geometry says no row 1 |
| `HEADER_BLANK` | row 1 present, a cell blank |
| `REQUIRED_COLUMN_MISSING` | `MISSING_REQUIRED_HEADER` with the names |
| `VALID` | — |

These must not be collapsed. `fc_target_rules` is simultaneously **present, empty, and header-missing**, and it is a required consumer input — so the distinction decides whether the page shows "no rules" or "this table is not provisioned".

Fail closed: a required sheet that is absent fails the request. It never returns `[]`.

## E8 — Failure contract

```
READ FAILURE != EMPTY DATA.
Never fabricate 0 inventory, 0 sales, an empty forecast or an empty rule set.
```

This is already the shipped behaviour — `60_` *throws* `prodSchemaError_`, which becomes a typed envelope error the client classifies (`IR_REVEAL_SENTENCE`, `INVENTORY_REPLENISHMENT_READ_FAILED`). B1 must preserve it, and adds failure modes R43 cannot have:

| condition | typed token | behaviour |
|---|---|---|
| `Sheets` namespace undefined | `ADVANCED_SHEETS_SERVICE_UNAVAILABLE` | fail closed |
| Sheets API disabled (403 `SERVICE_DISABLED`) | `SHEETS_API_DISABLED` | fail closed |
| 400 bad range | `SHEETS_RANGE_REJECTED` + the range | fail closed |
| 403 permission | `SHEETS_PERMISSION_DENIED` | fail closed |
| 429 | `SHEETS_QUOTA_EXCEEDED` | fail closed, retry policy per E10 |
| 5xx | `SHEETS_SERVICE_ERROR` | fail closed |
| metadata call fails | `SHEETS_METADATA_FAILED` | fail closed — ranges cannot be built |
| **fewer `valueRanges` than ranges requested** | `SHEETS_PARTIAL_RESPONSE` | **fail closed** |

The last row is the one that will be got wrong. `batchGet` returns one `valueRange` per requested range, in order, and a range with no data has **no `values` key at all**. Treating a missing `values` as `[]` is correct; treating a missing *valueRange* as `[]` fabricates an empty table. The two look identical one line apart, and only the second is a lie.

## E9 — Fallback: three options, one recommendation, operator's decision

| | STABILITY | LATENCY | FAILURE_VISIBILITY | DEPENDENCY_RISK | SEMANTIC_RISK |
|---|---|---|---|---|---|
| **A** fail closed, no fallback | lowest — one API outage is a page outage | best, 2.3 s | **highest** — a failure is a failure | highest — single point | **lowest** — one reader, one semantics |
| **B** always fall back to R43 | highest | worst case 2.3 + 22 s, i.e. **slower than today** | **lowest** — outages hide as slowness until the day both fail | lowest | **highest** — two readers must agree forever, unverified on every fallback |
| **C** bounded fallback for 429 / 5xx only | high | 2.3 s normally; bounded worst case | medium — fallback is *counted and reported* | medium | medium — two readers, but entered only on named transient codes |

```
RECOMMENDED_FALLBACK_POLICY = C, bounded — fall back ONLY on 429 and 5xx, at most once,
  and REPORT it in meta (`readTransport: 'SPREADSHEETAPP_FALLBACK'`, `fallbackReason`).
RECOMMENDED_FAILURE_CONTRACT = fail closed for everything else, typed, never empty data.
```

Reasoning: A is semantically cleanest and operationally brittle — this page is a daily working surface, and a Google-side 5xx becoming a hard outage is a real cost. B is the trap: it is the option that *looks* safest and quietly reintroduces the 22 s path while hiding the signal that it happened. C keeps the fallback narrow enough to reason about and, crucially, **visible** — an unreported fallback is indistinguishable from the feature working.

**This is an operator architecture decision and is not taken here.** Note that B and C both mean two readers must produce identical output forever; the drift detector of E3.6 becomes mandatory under either.

## E10 — Quota and dependency

```
SHEETS_API_QUOTA_LIMITS = UNKNOWN
```

Not invented. The operator was asked to record them from Cloud Console → APIs & Services → Google Sheets API → Quotas while enabling, and no figures have been reported back. The repository cannot derive them.

Dependencies acquired, stated plainly:

```
Google Sheets API enabled in the attached Cloud project    ← can be disabled outside this repo
Sheets v4 advanced service in the Apps Script project      ← can be removed in the editor
appsscript.json declares it                                ← guarded since S8-R4D-D1
a shared quota pool with any other Sheets API consumer     ← none known today
```

Each of those is a way for the feature to stop working without a commit. That is the real dependency cost, and it is why E12 matters more than it looks.

**Observability substitutes for the unknown quota**: count 429s, report them, and alarm on the rate rather than guessing a ceiling.

## E11 — Observability, and a contract field B1 breaks

`60_` times **every table** and ships the result:

```js
meta.slowestTables = [ { table, ms, rows }, ... ]   // 60_:708, capped at five
```

It is consumed by the client (`inventory-replenishment.js:10381`) and asserted by a fixture suite:
`live-read-contract-…-r4-a1.test.js:143` requires `length > 0`, `:145` requires `typeof t.ms === 'number'`.

**B1 cannot produce per-table milliseconds.** One `batchGet` has one duration. The three bad answers are: report `[]` (breaks the gate), split the batch duration across tables (inventing numbers), or drop the field (breaks the client contract). The honest answer is a typed statement that the transport does not have that information:

```
meta.readTransport   = 'SHEETS_BATCHGET' | 'SPREADSHEETAPP' | 'SPREADSHEETAPP_FALLBACK'
meta.readProfile     = { metadataMs, batchGetMs, normalizationMs, rangeCount, tableCount, totalBytes? }
meta.perTableRows    = { <table>: <rows> }          // the `rows` half of slowestTables, preserved
meta.slowestTables   = []                            // empty BY TRANSPORT, not by failure
meta.perTableTiming  = 'UNAVAILABLE_BY_TRANSPORT'
```

and the suite is re-aimed to branch on `readTransport` — asserting per-table timing under `SPREADSHEETAPP` and the typed unavailability under `SHEETS_BATCHGET`. Deleting the assertion would be the wrong repair; it is a real contract, and it is being traded for speed deliberately.

```
PER_TABLE_TIMING_LOSS = ACCEPTED, and it is a genuine diagnostic regression.
  Per-table cost stays obtainable from a diagnostic tool when a question needs it.
  No sensitive id, token or spreadsheet id is ever placed in meta.
```

## E12 — Manifest governance promoted to runtime

Today the manifest guard checks **repository bytes**. Once B1 ships, the fact that matters is whether the **deployed project** has the service — and a repository file cannot see that. The right home already exists: `sysRuntimeAuthorityChecks_` (`63_…:800`), described in its own comment as *"the executed invariant, which a version string cannot fake in either direction."*

```
system.health.runtime_authority.advanced_services = {
  sheets_required: true,
  sheets_resolves: (typeof Sheets !== 'undefined' && !!(Sheets.Spreadsheets && Sheets.Spreadsheets.Values)),
  verdict: 'ADVANCED_SHEETS_MISSING — the deployment cannot serve the first-layer read'
}
and mixed_deployment becomes true when a required service does not resolve.
```

It costs **zero API calls** — `typeof Sheets` is a namespace check, not a request. A project where someone removed the service then reports `MIXED_OR_PARTIAL_SYNC` from the health probe instead of failing at the first user read.

Repository-side guards carry forward unchanged and must keep failing on: Sheets absent, wrong version, declared twice, BigQuery dropped, scope set changed, Web App settings changed, and declaration/manifest disagreement (the D2 transition suite, 18 mutants).

```
MANIFEST_RUNTIME_GOVERNANCE_REQUIRED = YES
```

## E13 — Mainline non-regression

```
INVENTORY_REPLENISHMENT_SUBMIT_CHANGED = NO
REQUEST_ORDER_HANDOFF_CHANGED          = NO
PURCHASE_ORDER_FLOW_CHANGED            = NO
WEEKLY_SHIPPING_PLAN_SUBMIT_CHANGED    = NO
SHIPMENT_DRAFT_CREATION_CHANGED        = NO
SHIPMENT_DISPATCH_CHANGED              = NO
GAP_CALCULATION_CHANGED                = NO
GAP_MATERIALIZATION_CHANGED            = NO
BUSINESS_DECISION_SOURCE_CHANGED       = NO
```

Structurally supported rather than merely asserted: `60_` contains **zero write primitives**, declares **one** action (`inventoryReplenishment.workspace.get`), has **one** `io.readTable` call site, and its reader helpers (`sirWsRowsFromValues_`, `sirWsHeaderFromValues_`, `sirWsRowsToObjects_`) appear in **no other file**. B1 changes the mechanism that moves identical bytes.

## E14 — The Amazon snapshot issue stays separate

```
amazon_inventory_snapshot blank source-Date importer defect = CARRIED, NOT REPAIRED HERE
DO NOT run the import · DO NOT alter 06_/07_/08_/09_/10_ · DO NOT backfill source Dates
```

B1 reads the table as it currently stands. Repairing ingestion inside a round that changes the reader would make any semantic difference unattributable between the two — which is the one thing this evidence chain exists to prevent. The census does show `snapshot_date` populated as `ISO_DATE` across the column, so the defect is **per-row**, not a blank column; that is a useful fact for the ingestion round and changes nothing here.

## E15 — Release preflight

```
R44_RELEASE_REQUIRED             = YES — a deployed runtime file changes
R44_OWNER_SET                    = { 60_api_v1_inventory_replenishment_workspace.gs,
                                     63_api_v1_system_health.gs }
ACTION_CONTRACT_VERSION_CHANGE   = NO — stays 18; no action added or removed
ROUTER_CHANGE_REQUIRED           = NO — 01_ must NOT be stamped R44
GENERATED_BUNDLE_CHANGE_REQUIRED = NO — 90_ is built from assets/js/core/, and contains none of 60_
FRONTEND_CHANGE_REQUIRED         = NO for correctness (the client reads `_m.slowestTables || null`)
                                   OPTIONAL to surface readTransport / readProfile
CACHE_TOKEN_ROTATION_REQUIRED    = only if the frontend changes
APPSSCRIPT_JSON                  = already carries Sheets v4; it is EDITOR-APPLIED, never pasted
```

`appsscript.json` is already in the `EDITOR_APPLIED_MEMBERS` partition of the release ledger, so R44's copy list stays `{60_, 63_}` and the manifest is not in it. The release must land as **one commit** — the stamp gate ties each stamp to its file's last change.

Test files expected to move with it: the D1 harness, the D2 transition suite, `live-read-contract-…-r4-a1` (E11), and a new date-map contract suite.

## E16 — Rollback

```
PRODUCT      revert 60_ to the R43 reader and cut the reverting release. ONE commit.
DATA         NONE REQUIRED — B1 reads only. PRODUCTION_ROWS_WRITTEN = 0 by construction.
SERVICE      the Sheets advanced service MAY stay enabled; nothing else depends on it, and
             removing it is a separate, reversible operator action.
MANIFEST     may stay. SHEETS_ENABLED stays true while the declaration is true — the two move
             together or not at all (D2 transition suite T3).
CLOUD API    may stay enabled. No other Product dependency uses it.
```

Rollback requires no data recovery, and that is a property of the design rather than luck: the whole B1 path is a read.

## E17 — Acceptance plan for the implementation round

1. Fixture semantic equality — both readers over the same stub, byte-identical output
2. Live read-only semantic equality — re-run the paired benchmark against the **implemented** reader
3. Exact read set — 13 on the first layer, and the resolved set for every other request shape
4. **Date map contract** — every declared column, plus the eight E4 cases, plus the drift detector
5. Mixed identity — all four `number+string` columns
6. Ragged blanks — the three `note`-terminated tables, padding before the drop
7. Formula values — unchanged under `UNFORMATTED_VALUE`
8. All seven schema states of E7, each distinguishable
9. Failure semantics — every token in E8, and `SHEETS_PARTIAL_RESPONSE` in particular
10. Quota / error handling — 429 counted and reported
11. Mainline non-regression — the nine frozen flows
12. R44 health — `system.health` attests the service, `mixed_deployment` fires without it
13. **Production first-layer performance acceptance, measured through the Web App against a same-day R43 baseline** — because §1.3 means the 90.1% has not yet been shown end to end

---

# REQUIRED REPORT

```
S8_R4D_E_B1_PRODUCT_PREFLIGHT = PASS (with two architecture decisions escalated)

D2_BENCHMARK_FINAL_VERDICT = PASS
CONTROL_MEDIAN_MS = 22006 · B1_MEDIAN_MS = 2265
PAIRED_MEDIAN_SAVING_MS = 19830 · PAIRED_MEDIAN_SAVING_PERCENT = 90.1
B1_WIN_COUNT = 5 · CONTROL_WIN_COUNT = 0 · sign test p = 0.031

B1_SEMANTIC_ACCEPTANCE = PASS
B1_PERFORMANCE_EFFECT  = CLEAR
B1_RUNTIME_JUSTIFIED   = YES (transport equivalence proven; date-map contract NOT proven)

TEMP_BENCHMARK_FILE_PRESENT_POST = UNCONFIRMED — operator confirmation required

PRODUCT_B1_DATE_MAP_CONTRACT_UNRESOLVED = YES
PRODUCT_DATE_COLUMN_MAP = 46 columns across 13 tables (41 observed + 5 declared-blank) — §E3.6
PRODUCT_DATE_COLUMN_MAP_SOURCE = DECLARED_EXPLICIT_MAP + DRIFT DETECTOR
                                 (no DECLARED_CANONICAL_SCHEMA exists in this repository)

READ_TABLE_COUNT = 13 · WRITE_TABLE_COUNT = 0 · DELETE_TABLE_COUNT = 0

RECOMMENDED_FAILURE_CONTRACT = fail closed, typed, never empty data; SHEETS_PARTIAL_RESPONSE explicit
RECOMMENDED_FALLBACK_POLICY  = C — bounded, 429/5xx only, once, and REPORTED in meta

MANIFEST_RUNTIME_GOVERNANCE_REQUIRED = YES — executed probe in sysRuntimeAuthorityChecks_

R44_RELEASE_REQUIRED = YES
R44_OWNER_SET = { 60_, 63_ }
ACTION_CONTRACT_VERSION_CHANGE = NO (stays 18)
ROUTER_CHANGE_REQUIRED = NO
FRONTEND_CHANGE_REQUIRED = NO (optional only)

PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0 · R44_RELEASE_CUT = NO
PRODUCTION_ROWS_WRITTEN = 0 · PRODUCTION_ROWS_DELETED = 0 · SCHEMA_CHANGES = 0

ARCHITECTURE_DECISIONS_REQUIRED =
  1. B1 SCOPE — first layer only (13) or the whole reader (21)
  2. DATE MAP AUTHORITY — hand-declared + drift detector, or a second Sheets call for number formats
  3. FALLBACK — A, B or C
  4. fc_target_rules — a table with no header row is in the thirteen; implement around it,
     or run the pending header migration first

OPERATOR_APPROVAL_REQUIRED = YES
NEXT_STEP = WAIT FOR OPERATOR APPROVAL TO IMPLEMENT PRODUCT B1
```
