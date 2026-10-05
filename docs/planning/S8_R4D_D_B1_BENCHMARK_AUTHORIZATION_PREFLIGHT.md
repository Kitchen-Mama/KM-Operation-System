# S8-R4D-D — ADVANCED SHEETS SERVICE B1
## Read-only benchmark authorization preflight · nothing enabled, nothing implemented

```
S8_R4D_D_B1_BENCHMARK_PREFLIGHT = PASS
R43_PRODUCTION_ACCEPTED = YES
```

**The permission question turns out to be the easy half.** No new OAuth scope is needed and no user re-consent.
The hard half is **value semantics**: 41 columns across 12 of the 13 tables carry real `Date` objects today,
every one of them rendered `T16:00:00.000Z`, and the client's date parser is `String(s).slice(0, 10)`. Get the
render options wrong and every sales date shifts by one day while the chart still draws.

---

## 1. The prize, stated before anything else

```
B3 measured:    17 reads removed  ->  ~3,415 ms median  ->  ~200 ms per removed round trip
B1 removes:     13 -> 1  =  12 more round trips
B1_ESTIMATED_SERVER_PRIZE_MS = ~2,400 ms  of a ~17,500 ms read  (~14%)
ESTIMATE_CONFIDENCE = LOW
```

**LOW, and the reason is specific rather than modest.** The 17 reads B3 removed were **header-only** — one row
each. The 12 B1 would remove are **full-sheet** reads whose cost is mostly the bytes, and batching does not
remove bytes. Extrapolating a cheap call's overhead onto expensive calls is exactly the error that turned
"30 → 1 = −97% of round trips" into an actual −16.3%. The estimate could be high **or** low; only the paired
benchmark settles it.

```
Do not restate 13 -> 1 as a 92% latency saving. The structural ratio and the latency ratio are different numbers.
```

## 2. Permissions — cheaper than feared

Re-derived from the shipped `appsscript.json`:

```json
"enabledAdvancedServices": [ { "userSymbol": "BigQuery", "version": "v2", "serviceId": "bigquery" } ],
"oauthScopes": [ "https://www.googleapis.com/auth/spreadsheets",
                 "https://www.googleapis.com/auth/script.scriptapp",
                 "https://www.googleapis.com/auth/bigquery" ],
"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
```

```
ADVANCED_SHEETS_SERVICE_REQUIRED          YES
APPS_SCRIPT_MANIFEST_CHANGE_REQUIRED      YES
MANIFEST_SERVICE_ID                       sheets          MANIFEST_SERVICE_VERSION  v4
                                          (userSymbol: Sheets)
OAUTH_SCOPE_CHANGE_REQUIRED               NO — .../auth/spreadsheets is ALREADY granted
CURRENT_SPREADSHEET_SCOPE                 https://www.googleapis.com/auth/spreadsheets
USER_RECONSENT_REQUIRED                   NO expected — the scope set does not change
GOOGLE_CLOUD_SHEETS_API_REQUIRED          YES
CLOUD_PROJECT_ID_DISCOVERABLE_FROM_REPO   NO
WEB_APP_DEPLOYMENT_PERMISSION_CHANGE      NO    EXECUTE_AS_CHANGE  NO    WHO_HAS_ACCESS_CHANGE  NO
CLOUD_CONSOLE_OPERATOR_ACTION_REQUIRED    YES
```

`USER_RECONSENT_REQUIRED = NO` is an **expectation from the unchanged scope set, not a guarantee** — the
operator should watch for a re-authorisation prompt on the first run and report it if it appears.

`CLOUD_PROJECT_ID_DISCOVERABLE_FROM_REPO = NO`, and no id is guessed. The only project id in the codebase is
`config.sourceProjectId`, a **runtime config value for the BigQuery data source** — not the GCP project
attached to the Apps Script project, which lives in the Apps Script project's own settings.

### §5 — the operator's Cloud action, when and if authorised

* **What:** enable the **Google Sheets API** in the Cloud project attached to this Apps Script project.
* **Which project:** confirm it in **Apps Script → Project Settings → Google Cloud Platform (GCP) Project**.
  If it is the auto-created default project, enabling an API may require switching to a standard project
  first — that is a materially larger change and must be reported back before proceeding, not worked around.
* **Reversible:** yes, the API can be disabled again.
* **Does disabling break a deployed B1 runtime:** **YES.** Every `batchGet` would fail. That is why §20's
  failure semantics and the rollback path are preconditions of implementation, not follow-ups.

### §6 — the precedent, and where it stops

```
EXISTING_ADVANCED_SERVICES = [ { SERVICE: BigQuery, VERSION: v2, serviceId: bigquery } ]
  USED_BY_FILES   08_amazon_import_sources.gs  (BigQuery.Jobs.query / getQueryResults)
  RELEASE PRECEDENT  the manifest is NOT a stamped release owner and carries no build version; it has
                     never moved in the R11..R43 span this ledger covers
```

So the project has enabled an advanced service before and it works. **But the precedent does not transfer
cleanly**, and this is the governance gap: `appsscript.json` is not in `RELEASE_OWNERS`, `RELEASE_CARRIED` or
`RELEASE_UNMOVED`, no suite asserts its contents, and `system.health` cannot report it. A manifest change is
therefore **invisible to every gate this repository has**. B1 must add manifest coverage — a stamp, a health
field, or a test — *before* the manifest moves, or the one thing that can silently un-deploy B1 will be the one
thing nothing watches.

## 3. The range design

```
SPREADSHEET_ID source = PRODUCTION_DB_SPREADSHEET_ID_ (00_config.gs), via the existing prodExpectedDbId_()
                        and prodAssertDbTarget_ gate — unchanged, so the exact-target guard still applies.
```

Measured widths (from the live 13-table read, R4D-B/R4D-D):

| TABLE | ROWS | COLS | RANGE |
|---|---|---|---|
| marketplaces | 15 | 15 | `'marketplaces'!A:O` |
| marketplace_skus | 495 | 15 | `'marketplace_skus'!A:O` |
| sku_details | 192 | **42** | `'sku_details'!A:AP` |
| warehouses | 361 | 28 | `'warehouses'!A:AB` |
| amazon_inventory_snapshot | 259 | 33 | `'amazon_inventory_snapshot'!A:AG` |
| amazon_inventory_health_snapshot | 345 | 23 | `'amazon_inventory_health_snapshot'!A:W` |
| amazon_daily_sales_snapshot | 3,814 *(9,777 physical)* | 36 | `'amazon_daily_sales_snapshot'!A:AJ` |
| amazon_weekly_sales_snapshot | 247 | 29 | `'amazon_weekly_sales_snapshot'!A:AC` |
| fc_regular_forecast | 496 | 26 | `'fc_regular_forecast'!A:Z` |
| fc_target_rules | **0** | **UNKNOWN** | width not derivable — the sheet is empty |
| fc_special_events | 431 | 29 | `'fc_special_events'!A:AC` |
| overseas_inventory_snapshot | 260 | 17 | `'overseas_inventory_snapshot'!A:Q` |
| factory_stock | 112 | 8 | `'factory_stock'!A:H` |

**A fixed literal range is the wrong answer here, and §7's "exact necessary width" should be read as
*exact*, not *frozen*.** `prodRequireSheet_` runs with `extraColumnsPolicy: 'ALLOW'` — this schema contract
**explicitly permits additive columns**. A hard-coded `A:AP` would silently truncate the day someone adds
column 43 to `sku_details`, which is precisely the silent-undercount class this project has spent three rounds
eliminating. And `fc_target_rules` cannot be given a literal width at all today.

```
RECOMMENDED: derive each range from the pre-step's sheet metadata (gridProperties.columnCount), so the
ranges are EXACT and ADAPTIVE. Fixed literals only if the pre-step is rejected — and then with a gate that
fails when a sheet's width exceeds its literal.
```

### §8 — the optional/absent pre-step

One absent optional sheet must not take down the other twelve. `batchGet` rejects the **whole request** when a
named range's sheet does not exist.

| | SERVICE_CALL_COUNT | CAN_DISTINGUISH_ABSENT | PERMISSION_COST | SEMANTIC_RISK |
|---|---|---|---|---|
| **A** `SpreadsheetApp.getSheets()` | 1 (+ the openById already made) | YES | none — already held | LOW; but gives no column widths |
| **B** Sheets API `spreadsheets.get` with `fields=sheets.properties` | 1 | YES | same API as B1 | **LOWEST** — also returns `gridProperties.columnCount`, solving §7 in the same call |
| **C** existing canonical registry/manifest | 0 | NO — it records intent, not live sheets | none | **HIGH**; a registry is not a witness |
| **D** fixed required/optional split | 0 | NO — it assumes, never checks | none | **HIGH**; an absent *required* sheet must still fail closed, and this cannot tell |

```
OPTIONAL_SHEET_PRESTEP = B — one Sheets API spreadsheets.get(fields=sheets.properties)
TOTAL B1 SERVICE CALLS = 2  (1 metadata + 1 batchGet)   replacing 13 getValues + ~40 accessor calls
```

C and D are rejected outright: neither can tell ABSENT from EMPTY, and §9 forbids collapsing them.

## 4. Value semantics — the part that can silently corrupt the product

Measured across all 13 tables, every row, live:

```
COLUMN TYPE TOTALS      string 134 · number 89 · ISO_DATE 41 · ALL_BLANK 27 · boolean 6 · number+string 4
```

### Hazard 1 — the one-day date shift

41 columns carry a real `Date` today. Every date cell comes back as **`…T16:00:00.000Z`** — UTC+8 midnight,
because the manifest sets `"timeZone": "Asia/Taipei"`.

```
amazon_daily_sales_snapshot.snapshot_date  =  "2026-07-18T16:00:00.000Z"      (the cell displays 2026-07-19)
client:  function ymd(s) { return String(s == null ? '' : s).trim().slice(0, 10); }   ->  "2026-07-18"
```

**The entire Sales Trend is calibrated on that UTC-shifted date.** Now consider the two wrong options:

* `dateTimeRenderOption: FORMATTED_STRING` → the **Taipei** date `2026/7/19`. `ymd` slices it to `"2026/7/19"`,
  which matches none of the `YYYY-MM-DD` keys `salesTrend7d` builds. The chart renders **empty** — and an empty
  chart is the exact "NOT_LOADED is not zero" failure the lazy-once round was convened to eliminate.
* `valueRenderOption: FORMATTED_VALUE` → display strings for numbers and `"TRUE"`/`"FALSE"` for booleans.

```
VALUE_RENDER_OPTION    = UNFORMATTED_VALUE
DATETIME_RENDER_OPTION = SERIAL_NUMBER
```

`UNFORMATTED_VALUE` is also required for **identity**, not only for arithmetic: `sku_details.sku` and
`overseas_inventory_snapshot.sku` are **mixed `number+string`** columns today (a SKU that looks numeric arrives
as a number). `FORMATTED_VALUE` would stringify them and change row identity.

`SERIAL_NUMBER` then makes a **serial→Date coercion layer mandatory** for all 41 columns, reproducing today's
exact instant (sheet epoch 1899-12-30, script timezone Asia/Taipei). This is the single largest semantic risk
in B1 and must be proved column by column by the benchmark, never assumed.

### Hazard 2 — ragged rows silently inverting the blank-row rule

`batchGet` **omits trailing empty cells**, so rows come back shorter than the header. Three tables have a
trailing all-blank column today:

```
marketplaces.note · amazon_weekly_sales_snapshot.note · overseas_inventory_snapshot.note
```

The shipped converter does:

```js
o[headers[c]] = data[r][c];
if (String(data[r][c]).trim() !== '') blank = false;
```

With a short row, `data[r][c]` is `undefined` → `String(undefined)` is **`"undefined"`**, which is not empty →
**`blank` never becomes true, so the all-blank-row drop stops working**, and every row gains `note: undefined`.
A B1 implementation **must pad every row to `headers.length` with `''`** before conversion. The header row
anchors the width, which is what the current converter already relies on.

### §11 — formulas

```
FORMULA_PRESENT = NOT ESTABLISHED for all 13 tables
```

These are import/snapshot tables written by Apps Script and the BigQuery importer, so stored formulas are
unlikely — but "unlikely" is not evidence, and it cannot be settled without the API that is not yet enabled.
`UNFORMATTED_VALUE` returns a formula's **computed value**, matching `getValues()`, so the intended behaviour is
correct by construction; the benchmark must *confirm* it rather than the design assume it.

```
FORMULA_VALUE_SEMANTIC_DIFF_COUNT_TARGET = 0     SEMANTIC_RESULT_DIFF_COUNT_TARGET = 0
```

### §9 — fail-closed contract, preserved

```
ABSENT_TABLE_SEMANTICS_PRESERVED    = YES, via the pre-step — never via the batchGet error
EMPTY_TABLE_SEMANTICS_PRESERVED     = YES — a sheet present with no `values` key maps to []
SCHEMA_MISMATCH_SEMANTICS_PRESERVED = YES — classifySchemaMismatch takes a header ARRAY and never touched
                                      a Sheet, so it is unchanged by where the array came from
```

ABSENT, EMPTY and SCHEMA_MISMATCH stay three states. `fc_target_rules` is the live EMPTY case today, and
`HEADER_MISSING` must keep coming from sheet geometry (`gridProperties`) rather than from an absent `values`
key, exactly as R43 keeps it on `getLastRow`/`getLastColumn`.

## 5. Diagnostics lost

```
PER_TABLE_RUNTIME_TIMING_AFTER_B1 = LOST — one batched call can report only one duration
PRESERVATION_STRATEGY = C + A  — keep the aggregate in runtime; retain per-table timing in a DIAGNOSTIC MODE
                        that falls back to the R43 per-sheet reader on request
```

Grouped `batchGet` (B) is **rejected as a metrics-preservation device**: splitting the call to keep timing
spends the very round trips the change exists to remove, which §14 forbids. Per-table timing is how R4D-A,
R4D-B and R4D-C were each decided, so losing it in runtime is a real cost — but a diagnostic mode that can
re-run the old reader preserves the capability without paying for it on every request.

## 6. The benchmark

```
READ_ONLY_B1_BENCHMARK_TOOL_DESIGN
  A TEMP_ Apps Script file, operator-pasted, manually run, removed after use. It is NOT router-reachable,
  registers NO action, and is NOT Product code.
  CONTROL    the R43 reader, called exactly as 60_'s io.readTable calls it today
  CANDIDATE  spreadsheets.get(fields=sheets.properties) + one values.batchGet
             (UNFORMATTED_VALUE / SERIAL_NUMBER) + serial->Date coercion + pad-to-header
  Both run in ONE execution against the SAME spreadsheet, so platform variance hits both arms equally.
  Returns: CONTROL_MS · BATCH_MS · OUTPUT_DIFF_COUNT · SERVICE_CALL_COUNTS · ROW_COUNTS · VALUE_TYPE_DIFFS
  Equality is per table, per row, per field, TYPE-SENSITIVE: identifiers and business quantities compare
  exactly, never approximately.
```

```
BENCHMARK_PAIR_COUNT = 5
PAIR_ORDER = ALTERNATING, starting CONTROL->BATCH and flipping each pair (C,B / B,C / C,B / B,C / C,B)
```

Alternating rather than fixed order, because a fixed order hands the second arm a warmed spreadsheet handle
every time — and with Production variance running 19.0–40.9 s on one build, a systematic warm-up advantage is
easily larger than the ~2.4 s being measured. Pairs are compared **within** themselves and judged on the median
paired difference.

### Safety

```
READ ONLY · db_writes 0 · rows_modified 0 · rows_deleted 0 · schema_changes 0
property_writes 0 · drive_writes 0 · trigger_writes 0 · emails 0
no Product write, no gap job, no movement ledger, no Script Properties, no persistent cache
reads ONLY the approved 13 first-layer tables
```

### §17 — DB touch preflight

All thirteen: `CLASSIFICATION = existing first-layer read` · `ACCESS = READ` · `DIRECT_CELL_WRITE = NO` ·
`OPERATOR_APPROVAL_REQUIRED = YES` (the benchmark is operator-run by construction). `RANGE`, `EXPECTED_MAX_ROWS`
and `EXPECTED_MAX_COLUMNS` are the table in §3; `fc_target_rules` is `0 rows / width UNKNOWN`, which is itself
a reason the pre-step must supply widths.

```
READ_TABLE_COUNT = 13   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0   NEW_TABLE_REQUIRED = NO
amazon_inventory_health_snapshot — UNAUTHORIZED_UNKNOWN · READ ONLY · PERMANENT_REGISTRY_CHANGE = NO
```

Naming a sheet in a range list is what `SIR_WORKSPACE_TABLES_` already does; it creates no registry entry and
no new authority.

## 7. Failure, rollback, quota

```
B1_FAILURE_SEMANTICS
  Sheets API unavailable · Advanced Service disabled · quota error · 400 · 429 · 5xx
  -> a TYPED READ FAILURE, surfaced as the existing INVENTORY_REPLENISHMENT_WORKSPACE_BUILD_FAILED class
     with the HTTP status carried in details. NEVER [] and never a partial table set: an empty result is
     indistinguishable from a site with no data, which is the defect this whole line of work exists to prevent.
  A silent fall back to the SpreadsheetApp reader is REJECTED for the runtime: it would mask a broken
  dependency behind a slow-but-working path, and nobody would ever learn the API had been disabled.
```

```
ROLLBACK_MODEL
  1. revert 60_ to the R43 reader and cut a release  -> runtime restored, no manifest change needed
  2. the manifest entry MAY remain  — an unused advanced service costs nothing and avoids a second
     re-authorisation if B1 is retried
  3. the Cloud Sheets API MAY remain enabled — likewise, and disabling it is the one action that would
     break a still-deployed B1
  Rollback is therefore ONE file and ONE release, provided step 1 lands before 2 or 3 are touched.
```

```
QUOTA / PLATFORM RISK
  Does batchGet consume Sheets API quota distinct from the SpreadsheetApp service?   YES (different quota pools)
  Current limits                                                                      UNKNOWN — not provable
                                                                                      from this repository
  Could expected usage approach them?                                                 UNKNOWN
  Is a fallback reader appropriate?                                                   NOT for runtime (above);
                                                                                      YES as the diagnostic mode
```

No Google quota numbers are invented. The operator can read the live limits in Cloud Console → APIs & Services
→ Google Sheets API → Quotas once the project is identified, and that reading should be part of the
authorisation decision rather than this document's guess.

## 8. Release impact and boundaries

```
BACKEND_FILE_SET      60_api_v1_inventory_replenishment_workspace.gs, 63_api_v1_system_health.gs
MANIFEST_FILE_SET     assets/specs/active/apps-script/appsscript.json
FRONTEND_FILE_SET     (none)

BACKEND_RELEASE_REQUIRED                 YES (R44)
ACTION_CONTRACT_VERSION_CHANGE_REQUIRED  NO — no action added or removed
FRONTEND_PUBLICATION_REQUIRED            NO        CACHE_TOKEN_ROTATION_REQUIRED  NO
```

```
MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN
  submit · request-order handoff · purchase-order flow · weekly shipping plan · shipment draft/dispatch ·
  gap calculation/materialization · business decision source  — all NO.
  A B1 reader is transport of identical read truth. If output equality is not 0, it is not B1.

A_PLUS_C_STATUS = DEFERRED     ~65% of payload · ~8% server · NO demonstrated wall-time benefit (gap flat
                               at ~6-7 s from 3.99 MB to 6.17 MB, n=4). Decide after the B1 benchmark.
TRANSPORT_REPAIR_INCLUDED = NO  EXPIRED_USERCONTENT_REDIRECT stays a separate unrepaired defect, and a
                                bounce must never be attributed to batchGet.
DAILY_SALES_PROJECTION_INCLUDED = NO — causal isolation; the benchmark compares reads, not payloads.
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
```

## 9. The decision model to apply afterwards

```
B1_RUNTIME_JUSTIFIED = YES  only if  median paired saving is material AND consistent across the 5 pairs
                             AND SEMANTIC_RESULT_DIFF_COUNT = 0 AND VALUE_TYPE_DIFFS = 0
                       NO   if the saving is within pair-to-pair noise, or any semantic diff survives
                       INCONCLUSIVE if transport or variance prevents a clean paired read
```

**A ~2.4 s saving is not automatically sufficient**, and the costs it must clear are not only engineering time:
a permanent Advanced Service dependency, a Cloud API dependency whose disabling breaks the runtime, a manifest
that **no gate in this repository currently watches**, the loss of per-table timing, and a 41-column date
coercion layer that must be right forever. Set against ~14% of one page's read, on a page whose wall time is
dominated by a fixed ~6 s transport cost this change does not touch.

**My reading: the semantic risk is the deciding factor, not the milliseconds.** If the benchmark shows exact
output equality across all 41 date columns, the mixed-type identity columns and the three ragged-row tables,
then ~2.4 s is worth having. If it shows even one diff, B1 should be abandoned rather than patched — the
failure mode is a silently shifted date, and that is not a class of bug worth 14%.

```
OPERATOR_APPROVAL_REQUIRED = YES
NEXT_STEP = WAIT FOR OPERATOR DECISION WHETHER TO ENABLE ADVANCED SHEETS SERVICE
            AND RUN THE READ-ONLY B1 BENCHMARK
```
