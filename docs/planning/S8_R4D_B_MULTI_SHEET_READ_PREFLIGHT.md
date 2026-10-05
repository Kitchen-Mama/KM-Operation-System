# S8-R4D-B — SITE INVENTORY MULTI-SHEET READ ARCHITECTURE
## Preflight · READ ONLY · no implementation

**Audited against the published frontend `f6b4164` with Production backend R42.** No runtime byte was
modified. One bounded 13-table read was issued; nothing was written.

```
S8_R4D_B_MULTI_SHEET_READ_PREFLIGHT = PASS
```

**The headline is not the one the task expected.** The handler does not make 13 read calls. It makes **30**,
and **17 of them are header reads that the 13th already contains**. Over half the round trips are removable
with no new API, no manifest change and no OAuth scope — which makes that, not batching, the first thing to do.

---

## 1. The current call graph, proved from source

`readTable(ss, name, requiredCols, optional)` — `60_…workspace.gs:537` — expands to this, per table:

| step | source | service calls |
|---|---|---|
| optional existence probe | `if (optional && !ss.getSheetByName(name))` | `getSheetByName` ×1 *(9 optional tables only)* |
| `prodRequireSheet_(ss, name, [])` | `29_production_safety_adapter.gs:53` | `ss.getId()` · `getSheetByName` · `getLastRow` · `getLastColumn` · **`getRange(1,1,1,lastCol).getValues()`** |
| `prodRequireColumns_(sheet, requiredCols)` | `29_:69` | `getLastColumn` · **`getRange(1,1,1,lastCol).getValues()`** *(only the 4 tables with requiredCols)* |
| `sirWsRowsToObjects_(sheet)` | `60_:517` | `getDataRange()` · **`.getValues()`** |

Only four first-layer tables carry `requiredCols` — `marketplaces`, `marketplace_skus`, `sku_details`,
`warehouses`. The other nine are `optional: true` with `requiredCols: []`.

| | per table | × tables | total |
|---|---|---|---|
| `prodRequireSheet_` header read | 1 | 13 | **13** |
| `prodRequireColumns_` header read | 1 | 4 | **4** |
| `getDataRange().getValues()` full-sheet read | 1 | 13 | **13** |

```
CURRENT_FIRST_LAYER_SPREADSHEET_SERVICE_CALL_COUNT = 30 getValues() range reads
                                                     (+ ~80 accessor/metadata calls:
                                                      openById 1 · getId 14 · getSheetByName 22 ·
                                                      getLastRow 13 · getLastColumn 17 · getDataRange 13)
INDEPENDENT_SHEET_READ_CALL_COUNT = 13 full-sheet reads
MEASURED_PER_CALL_FLOOR_SUPPORTED = YES, as a consistency check only
```

**Why the count differs from 13, as §2 asks.** The handler reads each sheet's header row *twice over* before
reading the sheet: once in the safety gate and again — for four tables — in the column check. Then
`getDataRange().getValues()` returns the whole sheet **including row 1**, which `sirWsRowsToObjects_` uses as
`data[0]` for exactly the same headers. The information is fetched two or three times.

Dividing the measured 1.1–2.1 s per table by its 2–3 range reads gives ~0.5–0.9 s per read — consistent with
the floor, but **the per-call cost was not separately measured** and cannot be without instrumenting a
deployed handler. It is offered as arithmetic, not as a measurement.

---

## 2. Batch-read capability census

```
EXISTING_BATCH_READ_OWNER        = NONE
EXISTING_BATCH_READ_PRECEDENT_COUNT = 0
```

No occurrence of `Sheets.Spreadsheets`, `values.batchGet`, `batchGetByDataFilter` or `getRangeList` anywhere in
`assets/specs/active/apps-script/`. The only prior mention in the repository is
`docs/evidence/s3-r6-server-read-cost/census.json`, which deferred the question in the same terms this round
takes it up: *"whether the Advanced Sheets API batchGet is admissible here is an architecture question this
round does not open."*

**One structural fact worth stating plainly:** `SpreadsheetApp` has **no multi-range bulk read**.
`RangeList` exposes `getRanges()` and bulk *setters* and *clearers* — it has no `getValues()`. So there is no
SpreadsheetApp-native way to batch these reads. B3 cannot be "batch without the Advanced Service"; it can only
be "stop making calls you do not need".

**But the project has enabled an advanced service before.** `appsscript.json` already carries BigQuery v2,
used live in `08_amazon_import_sources.gs`. The pattern is established.

---

## 3. Permission and manifest — the good news

Shipped `assets/specs/active/apps-script/appsscript.json`:

```json
"enabledAdvancedServices": [ { "userSymbol": "BigQuery", "version": "v2", "serviceId": "bigquery" } ],
"oauthScopes": [ "https://www.googleapis.com/auth/spreadsheets",
                 "https://www.googleapis.com/auth/script.scriptapp",
                 "https://www.googleapis.com/auth/bigquery" ]
```

```
ADVANCED_SHEETS_SERVICE_REQUIRED      = YES for B1/B2 · NO for B3
MANIFEST_CHANGE_REQUIRED              = YES for B1/B2 (add Sheets to enabledAdvancedServices) · NO for B3
OAUTH_SCOPE_CHANGE_REQUIRED           = **NO** — .../auth/spreadsheets is ALREADY granted
CLOUD_PROJECT_ENABLEMENT_REQUIRED     = YES for B1/B2 (Google Sheets API in the associated Cloud project)
                                        — OPERATOR MUST VERIFY; not observable from the repository
DEPLOYMENT_PERMISSION_CHANGE_REQUIRED = NO (executeAs / access unchanged); a NEW VERSION is required either way
```

`spreadsheets.values.batchGet` needs exactly the `.../auth/spreadsheets` scope the Web App already holds. **No
new scope means no re-consent prompt and no change to `executeAs: USER_DEPLOYING` / `access:
ANYONE_ANONYMOUS`.** The remaining gate is enabling the advanced service in the manifest and the Sheets API in
the Cloud project — an architecture/release decision, and the one place the operator's approval is load-bearing.

```
ARCHITECTURE / RELEASE DECISION REQUIRED = YES (for B1/B2 only)
```

---

## 4. The 13 approved tables — DB touch preflight

Measured today in one bounded read (`serverMs 21,986 · 6,168,742 B · 7,027 rows · R42`). Every row below is
`ACCESS = READ` · `CLASSIFICATION = existing first-layer read` · `DIRECT_CELL_WRITE = NO` ·
`RUNTIME_OWNER = 60_api_v1_inventory_replenishment_workspace.gs` · `RANGE REQUIRED = whole sheet` (sole
exception noted) · `OPERATOR_APPROVAL_REQUIRED = NO to read (already the shipped contract), YES to change`.

| TABLE | ROWS | COLS | ~BYTES | PURPOSE |
|---|---|---|---|---|
| marketplaces | 15 | 15 | 6,565 | scope + filter options |
| marketplace_skus | 495 | 15 | 233,115 | the SKU list itself |
| sku_details | 192 | **42** | 194,446 | category, units per carton |
| warehouses | 361 | 28 | 318,026 | filters and the From/To pickers |
| amazon_inventory_snapshot | 259 | 33 | 268,229 | current stock |
| amazon_inventory_health_snapshot | 345 | 23 | 263,254 | stock health |
| amazon_daily_sales_snapshot | 3,814 *(9,779 physical)* | 36 | **3,987,885** | Sales Trend; **cols 1–9 only** |
| amazon_weekly_sales_snapshot | 247 | 29 | 220,570 | Avg Sales / Day |
| fc_regular_forecast | 496 | 26 | 215,574 | forecast + days of supply |
| fc_target_rules | **0** | 0 | 0 | forecast targets |
| fc_special_events | 431 | 29 | 318,218 | the upcoming-event column |
| overseas_inventory_snapshot | 260 | 17 | 108,874 | 3PL stock column |
| factory_stock | 112 | 8 | 30,202 | CN/TW stock + allocation hint |

`EXPECTED_MAX_COLUMNS` across the set is **42** (`sku_details`), so a uniform candidate range of `A:AZ` covers
every table with headroom. `EXPECTED_MAX_ROWS` is as measured, except `amazon_daily_sales_snapshot` whose
physical height is **9,779** (the 3,814 is after the 14-date window).

```
READ_TABLE_COUNT = 13   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0
NEW_PHYSICAL_TABLE_REQUIRED = NO
```

**Per-table timing is now known for 11 of 13** (R4D-A had 9). Added today: `amazon_inventory_snapshot`
1,704 ms · `amazon_inventory_health_snapshot` 1,586 ms · `overseas_inventory_snapshot` 1,721 ms. Still never
named in any top-five, so still **unmeasured individually**: `marketplaces`, `amazon_weekly_sales_snapshot`.
No value invented for either.

---

## 5. Result-shape compatibility

```
BUSINESS_RESULT_SHAPE_CHANGED = NO   (required, and achievable)
```

| contract | CURRENT | BATCH_CANDIDATE | SEMANTIC_DRIFT_RISK |
|---|---|---|---|
| header discovery | `data[0]` of `getDataRange()` | `values[0]` of the range | **LOW** — identical shape |
| row→object mapping | `sirWsRowsToObjects_`, skips all-blank rows | unchanged, same function | **LOW** — operates on arrays, not on Sheet objects |
| missing-column behaviour | `prodRequireColumns_` throws `MISSING_REQUIRED_HEADER` | same check against `values[0]` | **LOW** |
| optional-table behaviour | `getSheetByName` → `[]` | **must pre-filter the range list** | **HIGH** — see §6 |
| schema mismatch detection | `classifySchemaMismatch` on the header array | same, same input | **LOW** |
| empty-sheet behaviour | `data.length < 2` → `[]` | `values` absent or length < 2 → `[]` | **MEDIUM** — batchGet omits `values` entirely for an empty range |
| table-specific metadata | `tableMs[name]`, `counts`, `capped` | per-table timing **is lost** in one batched call | **MEDIUM** — a real diagnostic regression |
| `recentWindow` | applied in `sirWorkspaceBuild_`, post-read | unchanged — it never touched the Sheet | **NONE** |

Two of these deserve to be named rather than buried.

**Per-table timing is lost.** `meta.slowestTables` is how this round and the last two were able to say anything
at all. One batched call can report only one duration. That is an acceptable trade *after* the architecture is
proven, and a bad one before — an argument for benchmarking B3 first, where the timing survives.

**`classifySchemaMismatch` is already array-based.** It takes `actualHeaders` and never touches a Sheet
(`90_…bundle.gs:12978`). With `expectedHeaders: []` — which is what `60_` passes — it checks only
HEADER_MISSING / HEADER_BLANK / HEADER_DUPLICATE, all computable from `data[0]`. **This is why the redundant
header read can be removed without weakening the guard.**

---

## 6. Absent / empty / mismatch — the three states must not collapse

```
ABSENT_TABLE_SEMANTICS_PRESERVED        = YES, but ONLY with an explicit pre-step
EMPTY_TABLE_SEMANTICS_PRESERVED         = YES
SCHEMA_MISMATCH_SEMANTICS_PRESERVED     = YES
```

* **ABSENT.** Today: `getSheetByName(name)` returns null → `[]` for an optional table; `SCHEMA_NOT_PROVISIONED`
  for a required one. Under `values.batchGet`, **naming a range on a sheet that does not exist fails the entire
  request with a 400** — so one missing optional sheet would take all thirteen tables down. This is the single
  largest implementation risk in the whole candidate set. The mitigation is one `ss.getSheets()` call up front
  to build the range list from sheets that exist, which costs one metadata call and restores the distinction
  exactly. It must be designed in from the start, not discovered in Production.
* **EMPTY.** `batchGet` omits the `values` key for an empty range rather than returning `[[]]`. Absent `values`
  must map to `[]` *and must not be confused with ABSENT*, which the pre-step already separates.
  `fc_target_rules` makes this a live case today, not a hypothetical: it is empty in Production right now.
* **SCHEMA_MISMATCH.** Unaffected — the classifier works on the header array either way.

---

## 7. Candidate architectures

| | **B1** one batchGet | **B2** grouped batchGets | **B3** remove redundant calls |
|---|---|---|---|
| SERVICE_CALL_COUNT | 1 batchGet + 1 `getSheets()` + 1 `openById` | 2–4 batchGets + 1 `getSheets()` + 1 `openById` | **13** full-sheet reads |
| round trips vs today (30) | **→ 1** (−97%) | → 2–4 (−87 to −93%) | **→ 13** (−57%) |
| CAN_READ_MULTIPLE_SHEETS | YES | YES | N/A — no bulk read exists |
| CAN_PRESERVE_HEADERS | YES (row 1 is in the range) | YES | YES |
| CAN_PRESERVE_OPTIONAL_TABLES | only with the `getSheets()` pre-step | same | **YES, unchanged** |
| OAUTH / MANIFEST IMPACT | manifest YES · **scope NO** · Cloud API YES | same | **NONE** |
| per-table timing retained | NO | partially | **YES** |
| IMPLEMENTATION_COMPLEXITY | **MEDIUM-HIGH** | HIGH | **LOW** |

```
BATCH_PLUS_DAILY_COLUMN_PROJECTION_COMPATIBLE = YES
```

`values.batchGet` takes an independent A1 range per entry, so
`'amazon_daily_sales_snapshot'!A:I` sits beside `'sku_details'!A:AZ` in the same call with no special handling.
Column projection is batchGet's natural strength, and this is the only approved way to combine R4D-A's A+C with
a batch architecture. Caveat for implementation: A1 column ranges span the sheet's full height, so trailing
blank rows must be trimmed the way `getDataRange()` implicitly does.

```
AVG_SALES_CHANGED = NO   CAMPAIGN_EXCLUSION_CHANGED = NO   SPECIAL_EVENT_EXCLUSION_CHANGED = NO
GAP_CALCULATION_CHANGED = NO   SUBMIT_PAYLOAD_CHANGED = NO   REQUEST_ORDER_HANDOFF_CHANGED = NO
```

Unchanged from R4D-A and for the same reason: the projection is bounded to one table on one action whose only
consumer is `salesTrend7d`, and the 90-day Avg Sales rule runs server-side in `42_` over a different read path.

---

## 8. Performance

```
CURRENT_SERVICE_CALL_COUNT        = 30 range reads (13 full-sheet + 17 header)
BEST_CANDIDATE_SERVICE_CALL_COUNT = 1 (B1)  ·  13 (B3)
THEORETICAL_ROUND_TRIP_REDUCTION  = 97% (B1)  ·  57% (B3)
EXPECTED_BENEFIT                  = HIGH_POTENTIAL (B1) · MEDIUM-HIGH_POTENTIAL (B3)
```

**No seconds are claimed.** There is no repository precedent for Sheets `batchGet` latency and no measurement of
per-call cost, so converting a round-trip count into a duration would be invention. The round-trip hypothesis
itself — that cost scales with calls rather than data — is *supported* by `fc_target_rules` costing ~2 s for
zero rows, but it is **not yet proven**, and B1's whole value rests on it.

---

## 9. The benchmark, and why its sequencing matters

```
READ_ONLY_BATCH_BENCHMARK_POSSIBLE = YES — with one condition
```

* **B3 can be benchmarked today.** No manifest change, no advanced service, no new scope. A temporary
  read-only function in the existing project reads the 13 tables both ways and compares.
* **B1/B2 cannot.** Measuring the batch candidate requires the Advanced Sheets Service, which requires the
  manifest change — *the very permission decision the measurement was meant to inform.* There is no way to buy
  the evidence before paying the permission.

That asymmetry is the practical argument of this round. B3 is both a 57% reduction **and** the experiment that
proves or kills the round-trip model, at zero permission cost. If removing 17 of 30 round trips moves the
20.5 s read, B1 is worth the manifest change. If it does not, the model is wrong and B1 would have been a
permission change bought for nothing.

A future benchmark/implementation must satisfy, for all 13 tables: table presence · header set · row count ·
canonical row identities · the field values Site Inventory consumes · the `recentWindow` result · the
first-layer 100-SKU result.

```
SEMANTIC_RESULT_DIFF_COUNT = 0   (required future target)
```

Design constraints for that tool, for the record and not for execution: zero write · no PropertiesService ·
no trigger · no email · no schema change · exactly the approved 13 tables/ranges · compares canonical output
identity · records service duration · runs only on manual operator execution · removed from Production after
use. **Not created, not pasted, not run in this task.**

---

## 10. Boundaries held

```
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
WRITE / PROPERTY / DRIVE / TRIGGER / DIRECT_CELL_WRITE_COUNT = 0
TRANSPORT_REPAIR_INCLUDED = NO
ROUTE_RETURN_CACHE_CHANGED = NO
MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN
```

* **`EXPIRED_USERCONTENT_REDIRECT` stays a separate defect.** A shorter handler reduces *exposure* to platform
  expiry; it is not a repair, and nothing in `km-transport` was touched or proposed.
* **Route-return revalidation is untouched** — a freshness/product decision, outside this round.
* **`amazon_inventory_health_snapshot` is not formalized.** Naming a sheet in a range list is what
  `SIR_WORKSPACE_TABLES_` already does; no registry entry, no new authority. It remains
  `UNAUTHORIZED_UNKNOWN` · READ ONLY · `PERMANENT_REGISTRY_CHANGE = NO`.
* Mainline write contracts — submit, request-order handoff, purchase order, weekly shipping plan, shipment
  draft/dispatch, gap calculation/materialization, business decision source — all `= NO`. **No write payload
  may depend on the batch-read representation**, and none does: the read produces the same row objects.

Diagnostics issued this round: **one** GET read of `inventoryReplenishment.workspace.get` naming the approved
13 tables. No other action reached Production.

---

## 11. Decision matrix

| | B1 one batchGet | B2 grouped | B3 remove redundant reads | A+C only (daily-sales projection) |
|---|---|---|---|---|
| PERFORMANCE_POTENTIAL | **HIGH** (30→1) | HIGH (30→2-4) | **MEDIUM-HIGH** (30→13) | LOW server · HIGH payload |
| IMPLEMENTATION_RISK | MEDIUM-HIGH | HIGH | **LOW** | LOW |
| PERMISSION_CHANGE | manifest + Cloud API | manifest + Cloud API | **NONE** | NONE |
| BUSINESS_CONTRACT_RISK | LOW (shape preserved) | LOW | **NONE** | NONE |
| TESTABILITY | blocked until enabled | blocked until enabled | **immediate** | immediate |
| ROLLBACK_COMPLEXITY | MEDIUM (manifest + version) | MEDIUM | **LOW** (one file) | LOW |

```
RECOMMENDED_CANDIDATE = B3 FIRST, then B1 — in that order, and the order is the recommendation.

  B3  remove the 17 redundant header reads in 60_'s own io: validate headers from data[0] of the
      getDataRange() read the handler already performs. 30 round trips -> 13. One file, no manifest,
      no OAuth, per-table timing retained, immediately benchmarkable.

  B1  one values.batchGet across all 13 ranges (with the getSheets() pre-step for optional tables, and
      'amazon_daily_sales_snapshot'!A:I carrying R4D-A's column projection). 13 -> 1.
      Gated on the manifest change AND on B3's measurement supporting the round-trip model.
```

B3 is recommended first not because it is the larger win — it is not — but because it is the only one that
**produces the evidence the larger win depends on**, and it costs nothing to reverse.

---

## 12. Release impact (estimates — no release cut)

| candidate | BACKEND_FILES | FRONTEND_FILES | MANIFEST | OAUTH | BACKEND_RELEASE | ACTION_CONTRACT_VERSION | FRONTEND_PUBLICATION | CACHE_TOKEN_ROTATION |
|---|---|---|---|---|---|---|---|---|
| B3 | `60_` | none | NO | NO | YES (R43) | **no change** | NO | **NO** |
| B1 | `60_` + `appsscript.json` | none | **YES** | NO | YES | no change | NO | NO |
| B2 | `60_` + `appsscript.json` | none | YES | NO | YES | no change | NO | NO |
| A+C | `60_` | none | NO | NO | YES | no change | NO | NO |

No candidate changes the action contract or any frontend byte, so **none requires a cache-token rotation or a
frontend publication**. B3 and A+C are a single-file Apps Script change apiece — the cheapest release shape this
system has.
