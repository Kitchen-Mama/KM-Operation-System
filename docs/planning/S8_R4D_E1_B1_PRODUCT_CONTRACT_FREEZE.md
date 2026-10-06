# S8-R4D-E1 — B1 PRODUCT ARCHITECTURE DECISION FREEZE
## The contract an implementation round must satisfy. Nothing implemented, no release cut.

```
MODE                        ARCHITECTURE FREEZE / NO PRODUCT IMPLEMENTATION
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0 · R44_RELEASE_CUT = NO
PRODUCTION_ROWS_WRITTEN = 0 · PRODUCTION_ROWS_DELETED = 0 · SCHEMA_CHANGES = 0
```

---

## §0 — Operator cleanup gate: NOT CLOSED

```
TEMP_PROBE_FILE_PRESENT_POST     = UNCONFIRMED
TEMP_BENCHMARK_FILE_PRESENT_POST = UNCONFIRMED
```

No operator message has reported either file deleted from the Production Apps Script project. This gate is
procedural, not technical — both files are proven read-only — but "TEMP" only means something if it is
enforced, and a tidy `NO` recorded for something nobody checked is worth less than an honest `UNCONFIRMED`.

**Operator action:** Apps Script editor → delete `TEMP_S8_R4D_D2_SHEETS_AVAILABILITY_PROBE.gs` and
`TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs`, confirm both are gone. No deployment version is required;
neither file is reachable from `01_router.gs` and neither registers an action.

Everything below is independent of that gate and is frozen as specified. `IMPLEMENTATION_READY` stays **NO**
until it closes.

## §1 — Accepted evidence (frozen, not reopened)

```
CONTROL_MEDIAN_MS = 22006 · B1_MEDIAN_MS = 2265
PAIRED_MEDIAN_SAVING_MS = 19830 · PAIRED_MEDIAN_SAVING_PERCENT = 90.1
B1_WIN_COUNT = 5 · CONTROL_WIN_COUNT = 0
SEMANTIC_RESULT_DIFF_COUNT = 0 · DATE = 0 · IDENTITY = 0 · TRAILING_BLANK = 0 · TYPE = 0
B1_SEMANTIC_ACCEPTANCE = PASS · B1_PERFORMANCE_EFFECT = CLEAR · B1_RUNTIME_JUSTIFIED = YES
```

One standing caveat carried forward, not a reopening: the 90.1% is a **transport-layer** measurement taken in
the editor. The CONTROL arm (22,006 ms) is 4,477 ms slower than R43's whole Web App handler (17,529 ms), so
the end-to-end page figure is unknown until measured the way R43's was. Acceptance item 13 covers it.

## §2 — Decision 1 frozen: first layer only

```
B1_PRODUCT_SCOPE = SITE INVENTORY FIRST-LAYER 13 TABLES ONLY
B1_PRODUCT_TABLE_COUNT = 13
UNRELATED_IO_READTABLE_CALLER_CHANGE_COUNT = 0
```

**This is structurally guaranteed, not merely intended.** `readTable` is not a shared module — **each
workspace file defines its own private copy**:

```
40_ :305   50_ :312   51_ :239   52_ :148   53_ :224   54_ :174
55_ :125   56_ :272   57_ :352   58_ :532   59_ :185   60_ :676
```

Twelve independent definitions. Editing 60_'s cannot reach any other file, so the eight non-first-layer
tables — which are read through **60_'s own** `readTable` on the exposure and carrier requests — are the only
other consumers to keep working, and they stay on the existing reader inside the same file.

The implementation shape that follows: 60_'s table loop partitions the resolved request into the B1 set
(batched) and everything else (per-sheet, unchanged). Two readers in one file is a cost this decision accepts
knowingly; §6's drift detector and acceptance item 1 are what keep them honest.

```
NOTE, NOT THIS ROUND: the other eleven workspace files each still pay the full per-sheet floor on their
own reads. That is a measured opportunity, and it is explicitly out of scope here.
```

## §3 — DB touch preflight

```
READ_TABLE_COUNT = 13 · WRITE_TABLE_COUNT = 0 · DELETE_TABLE_COUNT = 0
ACCESS = READ (all) · DIRECT_CELL_WRITE = NO (all) · RECOVERY = NONE — READ ONLY (all)
OPERATOR_APPROVAL_REQUIRED = NO (all) — every table is already read by R43 on this exact request
EXPECTED_MAX_ROW_COUNT ceiling = SIR_WS_ROW_MAX_ = 80,000 (the existing backstop, reported via `capped`)
```

Observed counts are the R4D-D live census — evidence from one date, not a ceiling.

| TABLE | CLASSIFICATION | PURPOSE | EXPECTED_SCOPE | OBSERVED ROWS × COLS | RUNTIME_OWNER |
|---|---|---|---|---|---|
| marketplaces | MASTER | site identity, display name, allocation priority | whole sheet | 15 × 15 | `03_master_data_handlers` |
| marketplace_skus | MASTER | SKU ↔ site membership, launch date | whole sheet | 495 × 15 | `03_` |
| sku_details | MASTER | product attributes, dimensions, pricing | whole sheet | 192 × 42 | `03_`, `04_` |
| warehouses | REFERENCE | warehouse identity, factory flag, activity | whole sheet | 361 × 28 | passive master — no confirmed writer |
| amazon_inventory_snapshot | SNAPSHOT | on-hand / inbound / days-of-supply | whole sheet | 259 × 33 | `06_`–`10_` |
| amazon_inventory_health_snapshot | SNAPSHOT | inventory age buckets | whole sheet | 346 × 23 | `06_`–`10_` |
| amazon_daily_sales_snapshot | SNAPSHOT | daily units/amount; `salesTrend7d` input | whole sheet read, **14 periods kept** | 3,817 *(9,777 physical)* × 36 | `06_`–`10_` |
| amazon_weekly_sales_snapshot | SNAPSHOT | `avgSalesPerDay` authority | whole sheet read, **4 periods kept** | 247 × 29 | `06_`–`10_` |
| fc_regular_forecast | PLAN | monthly baseline forecast | whole sheet | 496 × 26 | `04_` |
| fc_target_rules | PLAN | target share rules | whole sheet | **0 × 0** | `14_fc_write_handlers` |
| fc_special_events | PLAN | event windows and event FC | whole sheet | 431 × 29 | `14_` |
| overseas_inventory_snapshot | SNAPSHOT | overseas stock and reservations | whole sheet | 260 × 17 | `05_overseas_inventory_handlers` |
| factory_stock | SNAPSHOT | factory on-hand CN/TW | whole sheet | 112 × 8 | `21_`, `03_` baseline |

The recent-window trim (`SIR_WS_RECENT_WINDOW_`, `60_:128`) happens **after** the read, in
`sirWorkspaceBuild_`. `batchGet` fetches the whole sheet exactly as `getDataRange()` does, so B1 changes
nothing there — and equally, B1 does **not** reduce the 9,777 physical daily-sales rows on the wire. Column
projection remains unexplored and out of scope.

```
amazon_inventory_health_snapshot = UNAUTHORIZED_UNKNOWN · READ ONLY · PERMANENT_REGISTRY_CHANGE = NO
NO FOURTEENTH TABLE.
```

## §4 / §5 — Decision 2 frozen: an explicit versioned map

```
PRODUCT_DATE_COLUMN_MAP_AUTHORITY = EXPLICIT DECLARED VERSIONED MAP
PRODUCT_DATE_COLUMN_MAP_SOURCE    = EXPLICIT_VERSIONED_B1_CONTRACT
FORBIDDEN: runtime value inference · column-name heuristics · serial-magnitude heuristics ·
           CONTROL runtime oracle in Product
```

It is a first-class mapping contract and it is **not derived from live data**. The live census seeded it; the
census is evidence, not authority, and saying otherwise would re-import the oracle the product does not have.

| TABLE | DATE_COLUMNS |
|---|---|
| marketplaces | `created_at`, `updated_at` |
| marketplace_skus | `launch_date`, `created_at`, `updated_at` |
| sku_details | `created_at`, `updated_at` ⚠ 5% populated |
| warehouses | `created_at`, `updated_at` |
| amazon_inventory_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at` |
| amazon_inventory_health_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at` |
| amazon_daily_sales_snapshot | `snapshot_date`, `synced_at`, `created_at`, `updated_at`, `data_window_start_date`, `data_window_end_date`, `latest_source_date` |
| amazon_weekly_sales_snapshot | `snapshot_month`, `week_start_date`, `week_end_date`, `synced_at`, `created_at`, `updated_at` |
| fc_regular_forecast | `created_at`, `updated_at` |
| fc_target_rules | `created_at`, `updated_at` — **declared only, zero live evidence** |
| fc_special_events | `event_start_date`, `event_end_date`, `created_at`, `updated_at` |
| overseas_inventory_snapshot | `created_at`, `updated_at`, `snapshot_date`✻, `wh_on_the_way_eta`✻, `last_movement_at`✻ |
| factory_stock | `created_at`, `updated_at`, `last_transaction_at` ⚠ 4% populated |

```
✻ declared, currently 100% blank in live data
DATE_COLUMN_COUNT = 46 declared = 41 observed populated + 5 declared-blank
```

**Explicitly NOT date columns, and each one is a trap a heuristic falls into:**

```
fc_special_events.event_month                number  (11)                      — a month ORDINAL
fc_special_events.event_period               string  ("2026-11-19~2026-11-30")
amazon_weekly_sales_snapshot.snapshot_week   string  ("2026-09-21~2026-09-27")
```

`event_month` is the decisive one. Under `SERIAL_NUMBER` it arrives as the bare number `11`, indistinguishable
from a date serial. A map that trusted the `_month` suffix would convert it to 1900-01-10 and silently
destroy every FC event window — in the same table where `event_start_date` genuinely is a Date. This is why
the map is declared per column and never inferred.

## §6 — Date-map drift detector

```
DATE_MAP_DRIFT_DETECTOR_SOURCE = TWO, at two cadences:
  (1) IN-REPO   the versioned contract artifact, compared every sweep
  (2) OUT-OF-BAND  Sheets API effectiveFormat.numberFormat.type, sampled by a bounded diagnostic
DATE_MAP_DRIFT_DETECTOR_MODE   = DETECT ONLY · OUT OF THE READ PATH · FAIL CLOSED ON DETECTION ·
                                 NEVER AUTO-REMAP
```

**Why `numberFormat` is the right physical evidence.** `SpreadsheetApp.getValues()` returns a `Date` when a
cell holds a numeric value *and* its effective number format type is `DATE` / `DATE_TIME` / `TIME`. The number
format is therefore the mechanism that decides the type the product has always seen — not the writer, which
§E3.5 showed is not an authority at all (`fcWriteTimestamp_()` returns a **string** and the cell holds a
`Date`, because Sheets parses date-shaped strings on write).

```
detector call:  spreadsheets.get(id, {
                  ranges: ['<sheet>!A2:ZZ2', ...],          // ONE data row per sheet
                  fields: 'sheets.properties.title,sheets.data.rowData.values.effectiveFormat.numberFormat.type'
                })
compare:        numberFormat.type ∈ {DATE, DATE_TIME}  ⟺  column ∈ declared map
```

Two honest limits, stated rather than designed around:

- A column that is **entirely blank and never formatted** carries no number format, so the detector cannot
  confirm the five `✻` entries. It can only confirm they have not become something else.
- `fc_target_rules` has no row 2, so it is undetectable until it has data. It is reported as
  `UNDETECTABLE_NO_DATA`, never as "agrees".

Layer (1) is free and catches the likelier failure — a careless edit to the map itself. It runs in the sweep
and asserts that the declared map equals the versioned contract, and that every column it names exists in the
recorded header set for that table.

**A detected drift produces a READ CONTRACT FAILURE or a diagnostic alert. It never remaps.** Auto-remapping
would be the runtime inference §4 forbids, arriving through the back door.

## §7 — Date conversion contract (frozen)

```
valueRenderOption = UNFORMATTED_VALUE · dateTimeRenderOption = SERIAL_NUMBER
tz = ss.getSpreadsheetTimeZone()   ← read at runtime. NEVER a hard-coded '+08:00'.

ms   = Math.round(serial * 86400000)
wall = new Date(Date.UTC(1899, 11, 30) + ms)
out  = Utilities.parseDate(Utilities.formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss'), tz, 'yyyy-MM-dd HH:mm:ss')
```

Proven: 0 date diffs across 5 pairs over 41 live date columns, and the D1 harness tests it to the
millisecond (F1, F2) with mutant M14 guarding the hard-coded-offset fault.

**Coercion is TYPE-GATED and that is load-bearing.** It applies only when the wire value is a `number`. A
string in a declared date column passes through untouched — not hypothetical: `marketplace_skus.launch_date`
is written as `String(...).trim()` by both write paths (`03_:430`, `03_:509`) while all 495 live rows hold
Dates, so a string in that column is one upsert away.

| test case | why it exists |
|---|---|
| date-only midnight | the 41-column baseline — must render `…T16:00:00.000Z` under Asia/Taipei |
| date/time | `fc_special_events.created_at` = `2026-09-18T07:44:07.000Z`, a real fractional serial |
| timezone boundary | a date whose Taipei midnight falls on the **previous** UTC calendar day |
| leap day | 2028-02-29 |
| blank | stays `''` — never epoch, never `Invalid Date` |
| declared date column with no values | the five `✻` columns — all-blank must stay all-blank |
| non-date numeric adjacent to date columns | `event_month = 11` must remain the number 11 |
| serial 0 / negative | a genuine zero must not silently become 1899-12-30 |

```
DATE_SEMANTIC_DIFF_TARGET = 0
```

## §8 / §9 / §10 — Decision 3 frozen: bounded transient fallback

```
RECOMMENDED_FALLBACK_POLICY = BOUNDED TRANSIENT FALLBACK TO THE R43 READER
PRIMARY  = B1 Sheets API reader        FALLBACK = the existing R43 SpreadsheetApp first-layer reader
MAX_FALLBACK_COUNT = 1 per logical read         NO automatic multi-retry loop (§19)
```

| | FALLBACK_ALLOWED_ERROR_CLASSES |
|---|---|
| `SHEETS_QUOTA_EXCEEDED` | HTTP 429 |
| `SHEETS_SERVICE_ERROR` | 500 · 502 · 503 · 504 |
| `ADVANCED_SHEETS_SERVICE_UNAVAILABLE` | the `Sheets` namespace does not resolve at call time |

| | NON_FALLBACK_ERROR_CLASSES — fail closed, typed |
|---|---|
| `SHEETS_RANGE_REJECTED` | 400, bad range |
| `SHEETS_PERMISSION_DENIED` | 403 |
| `SHEETS_API_DISABLED` | 403 `SERVICE_DISABLED` |
| `SCHEMA_NOT_PROVISIONED` | required sheet absent |
| `HEADER_MISSING` · `HEADER_BLANK` · `HEADER_DUPLICATE` | header faults |
| `MISSING_REQUIRED_HEADER` | required column absent |
| `DATE_MAP_DRIFT` | the declared map disagrees with physical evidence |
| `SHEETS_PARTIAL_RESPONSE` | malformed batch response |
| any semantic contract mismatch | — |

```
READ_FAILURE != EMPTY DATA.
Never fabricate 0 inventory · 0 sales · empty FC · empty target-rule state.
```

**The one that will be got wrong.** `batchGet` returns one `valueRange` per requested range, in order, and a
range holding no data has **no `values` key at all**. Treating a missing `values` as `[]` is correct;
treating a missing *valueRange* as `[]` fabricates an empty table. The two are one line apart and only the
second is a lie — hence `SHEETS_PARTIAL_RESPONSE` as a first-class, non-fallback failure.

A 403 never falls back. Falling back on a permission or configuration error would convert a deployment fault
into a permanent silent 22-second path, which is precisely the failure mode option B was rejected for.

```
FALLBACK OBSERVABILITY — required on every read, fallback or not:
  primary_reader       = 'SHEETS_API'
  fallback_used        = true | false
  fallback_reason      = <human-readable>  |  null
  fallback_error_class = <token from the allowed table>  |  null
  fallback_count       = 0 | 1
  final_reader         = 'SHEETS_API' | 'SPREADSHEET_APP'
No silent fallback. No secret, token or spreadsheet id in meta.
```

An unreported fallback is indistinguishable from the feature working, which is how a dependency outage hides
until the day both readers fail at once.

## §11 — Decision 4 frozen: fc_target_rules

```
FC_TARGET_RULES_B1_BEHAVIOR = SEMANTICALLY_IDENTICAL_TO_R43
```

It stays in the first-layer thirteen. Today R43 reaches it, finds `getLastRow() < 1`, and throws
`HEADER_MISSING` — which, because the table is declared `optional: true`, means the request still completes.
B1 must reproduce that **exactly**, by the same geometry decision, from the metadata pre-step
(`gridProperties.rowCount === 0`).

Forbidden, each for its own reason:

```
create fake headers         — invents a schema the sheet does not have
run the pending migration   — a separate task; three required columns (scope_type, scope_id,
                              target_percentage) are recorded absent at 14_:102
remove it from first layer   — changes the read contract under cover of a transport change
invent a B1-specific schema  — two readers would then disagree by construction
treat empty as business truth — it is an unprovisioned table, not "no rules"
```

That last line is the whole point of §16's seven states: "empty" and "not provisioned" must not collapse,
because one is a fact about the business and the other is a fact about the deployment.

## §12 — Ragged rows (frozen)

```
pad every row to canonical header width with '' BEFORE blank-row classification,
BEFORE row-to-object mapping, BEFORE any schema semantics
TRAILING_BLANK_SEMANTIC_DIFF_TARGET = 0
```

The order is the contract. `String(undefined)` is `"undefined"`, which is not empty, so without padding the
all-blank-row drop **inverts** and blank rows survive into the view model. Live, not theoretical: three of the
thirteen end in an all-blank column (`marketplaces.note`, `amazon_weekly_sales_snapshot.note`,
`overseas_inventory_snapshot.note`). Harness F3/F3a/F3b/F3c and mutant M11 cover it.

## §13 — Mixed identity (frozen)

```
IDENTITY_TYPE_DIFF_TARGET = 0 · NO blanket String() normalization
sku_details.sku · overseas_inventory_snapshot.sku · warehouses.postal_code · warehouses.contact_phone
```

Four columns, not two. `UNFORMATTED_VALUE` already preserves per-cell type — evidenced by
`IDENTITY_TYPE_DIFF_COUNT = 0` across all four, live. Harness F5d asserts that a number silently becoming a
string **is** a diff; mutant M10 exists for the "coerce both sides until it passes" repair.

## §14 — Formula contract (frozen)

```
FORMULA_VALUE_DIFF_TARGET = 0
UNFORMATTED_VALUE returns the COMPUTED value, exactly as getValues() does. Formula TEXT is never consumed:
that would require valueRenderOption = FORMULA, which this contract forbids.
```

## §15 — Metadata pre-step (frozen)

```
CALL 1  Sheets.Spreadsheets.get   — existence, width, range derivation
        fields = 'sheets.properties(title,gridProperties(rowCount,columnCount))'
CALL 2  Sheets.Spreadsheets.Values.batchGet
        ranges = derived · valueRenderOption = UNFORMATTED_VALUE · dateTimeRenderOption = SERIAL_NUMBER
B1_REMOTE_CALL_COUNT = 2
```

The mask is narrower than the benchmark's (`gridProperties` in full) — only `rowCount` and `columnCount` are
used, so only those are requested.

**One honest tension in §15's "do not silently request all Product spreadsheet contents".** To detect an
ABSENT sheet you must ask **without naming it**: passing a non-existent sheet in `ranges` makes the call
throw, which defeats the check. So call 1 is unfiltered and returns `properties` for every sheet in the
spreadsheet — 100 of them in Production. That is **titles and grid dimensions only**: no cell values, no
formats, no formulas, no contents. The alternative, naming ranges, cannot distinguish ABSENT from EMPTY and
is rejected by §16.

Widths come from `gridProperties.columnCount`, never a frozen literal: the schema contract runs
`extraColumnsPolicy: 'ALLOW'`, so a hard-coded `A:AP` would silently truncate column 43 of `sku_details` the
day someone adds one. Harness E1/E2 and mutant M13 guard this.

## §16 — Optional / absent contract (frozen)

| state | decided by |
|---|---|
| `SHEET_ABSENT` | not in call 1 → excluded from ranges; `[]` if optional, `SCHEMA_NOT_PROVISIONED` if required |
| `EMPTY` | present, `gridProperties.rowCount === 0` → `HEADER_MISSING` on geometry, as R43 decides it |
| `HEADER_ONLY` | one row returned → `[]` rows, schema valid |
| `HEADER_MISSING` | geometry says no row 1 |
| `HEADER_BLANK` | row 1 present, a cell blank |
| `REQUIRED_COLUMN_MISSING` | `MISSING_REQUIRED_HEADER`, naming the columns |
| `VALID` | — |

Never collapsed. One absent optional table is excluded from the ranges and must not fail the batch for the
other twelve — which is the entire reason call 1 exists, since `batchGet` rejects the **whole request** when a
named range's sheet does not exist.

## §17 — Meta timing compatibility: the frontend audit, and a correction

**Audit result — the STOP condition does NOT fire.** Three consumers, all read-only diagnostics, all
null-degrading:

| site | code | behaviour without timing |
|---|---|---|
| `inventory-replenishment.js:10381` | `slowest_tables: _m.slowestTables \|\| null` | captures whatever arrives |
| `:5715` | `out.server_slowest_tables = (… .slowest_tables) \|\| null` | passthrough |
| `:10200` | `((meta && meta.slowest_tables) \|\| []).forEach(s => slow[s.table] = s.ms)` | empty lookup → `server_read_ms: null` |

No arithmetic, no sorting, no comparison, no threshold, no render branch. `_irWorkspaceTableRoles_` is a
`window`-exposed manual diagnostic with no caller in any render path.

**But the preferred representation in §17 would throw.** `_irWorkspaceTableRoles_` is **not** wrapped in
try/catch, and line 10200 calls `.forEach` on whatever arrives:

```
slowestTables = []                            → ok, {}                       ✔
slowestTables = null                          → ok, {}                       ✔
slowestTables = 'UNAVAILABLE_IN_BATCH_MODE'   → TypeError: not a function    ✘
slowestTables = { mode: 'BATCH' }             → TypeError: not a function    ✘
```

A string or object in that field raises a `TypeError` in a function a test already extracts and executes
(`cold-boot-…-r6-r5.test.js:516`). So the typed marker must live in a **sibling field** and `slowestTables`
must stay an array:

```
META_TIMING_COMPATIBILITY_CONTRACT
  slowestTables    = []                      ← stays an ARRAY. Empty BY TRANSPORT, not by failure.
  timingMode       = 'BATCH' | 'PER_TABLE'
  perTableTiming   = 'UNAVAILABLE_IN_BATCH_MODE'
  batchMetadataMs  = <number>
  batchValuesMs    = <number>
  normalizationMs  = <number>
  perTableRows     = { <table>: <rows> }     ← the `rows` half of slowestTables, preserved
```

Server-side, the fixture suite (`live-read-contract-…-r4-a1.test.js:143/145`) must be re-aimed to branch on
`timingMode` — asserting per-table milliseconds under `PER_TABLE` and the typed unavailability under `BATCH`.
Deleting those assertions would be the wrong repair: per-table timing is a real contract being traded for
speed deliberately, and the trade should be visible in the gate that used to protect it.

```
FRONTEND_CHANGE_REQUIRED = NO — all three consumers already null-degrade under the shape above.
PER_TABLE_TIMING_LOSS = ACCEPTED, and it is a genuine diagnostic regression. Per-table cost stays
obtainable from a diagnostic tool when a question needs it.
```

## §18 / §19 — Observability and quota

```
readerMode · metadataMs · batchGetMs · normalizationMs · tableCount · rangeCount · rowCounts
fallbackUsed · fallbackReason · failureClass
No spreadsheet id, token or secret in meta, ever.
```

```
QUOTA_LIMIT = UNKNOWN
```

Not invented. The operator was asked to record Cloud Console → Google Sheets API → Quotas while enabling and
no figures have been reported. The repository cannot derive them, and a plausible-looking number here would
be worse than the honest gap.

Observability substitutes for the unknown ceiling: count 429s, report them with `fallback_error_class`, and
alarm on the **rate** rather than against a guessed limit. **No automatic multi-retry loop** — the single
bounded fallback of §8 is the entire retry budget, because a retry loop against an unknown quota is how a
soft limit becomes a hard one.

## §20 — Manifest runtime governance

```
MANIFEST_RUNTIME_GOVERNANCE_REQUIRED = YES
```

Sheets v4 becomes a **Product runtime dependency** only once B1 ships. Today's guard checks repository bytes;
afterwards the fact that matters is whether the **deployed project** has the service, and no repository file
can see that. The right home exists: `sysRuntimeAuthorityChecks_` (`63_:800`), whose own comment calls it
*"the executed invariant, which a version string cannot fake in either direction."*

```
system.health.runtime_authority.advanced_services = {
  advanced_sheets_required         : true,
  advanced_sheets_manifest_expected: { userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' },
  advanced_sheets_runtime_mode     : 'RESOLVED' | 'MISSING',
  resolves: (typeof Sheets !== 'undefined' && !!(Sheets.Spreadsheets && Sheets.Spreadsheets.Values))
}
mixed_deployment becomes true when a required advanced service does not resolve.
```

It costs **zero API calls** — `typeof Sheets` is a namespace check, not a request. A project where someone
removed the service then reports `MIXED_OR_PARTIAL_SYNC` from the health probe instead of failing at the
first user read.

Repository-side guards carry forward unchanged and must keep failing on: Sheets absent · wrong version ·
declared twice · BigQuery dropped · scope set changed · Web App settings changed · declaration and manifest
disagreeing. That is the D2 transition suite, 24 assertions and 18 mutants, already green.

## §21 — Amazon inventory date issue: separated

```
amazon_inventory_snapshot blank source-Date importer defect = CARRIED, NOT REPAIRED HERE
DO NOT modify 06_ / 07_ / 08_ / 09_ / 10_ · DO NOT run the Amazon import · DO NOT backfill source Dates
```

B1 reads current table truth. Repairing ingestion inside a round that changes the reader makes any semantic
difference unattributable between the two. The census shows `snapshot_date` populated as `ISO_DATE` across
the column, so the defect is **per-row**, not a blank column — useful for the ingestion round, irrelevant here.

## §22 — Mainline non-regression: FROZEN

```
INVENTORY_REPLENISHMENT_SUBMIT_CHANGED = NO    REQUEST_ORDER_HANDOFF_CHANGED = NO
PURCHASE_ORDER_FLOW_CHANGED = NO               WEEKLY_SHIPPING_PLAN_SUBMIT_CHANGED = NO
SHIPMENT_DRAFT_CREATION_CHANGED = NO           SHIPMENT_DISPATCH_CHANGED = NO
GAP_CALCULATION_CHANGED = NO                   GAP_MATERIALIZATION_CHANGED = NO
BUSINESS_DECISION_SOURCE_CHANGED = NO
```

Structurally supported: `60_` contains **zero** write primitives, declares **one** action
(`inventoryReplenishment.workspace.get`), and its reader helpers appear in **no other file**. B1 changes the
mechanism that moves identical bytes.

## §23 — Release preflight

```
R44_RELEASE_REQUIRED = YES
R44_EXPECTED_OWNER_SET = { 60_api_v1_inventory_replenishment_workspace.gs,
                           63_api_v1_system_health.gs }
ACTION_CONTRACT_VERSION_CHANGE   = NO — stays 18; no action added or removed
ROUTER_CHANGE_REQUIRED           = NO — 01_ stays R41 and must NOT be stamped R44
GENERATED_BUNDLE_CHANGE_REQUIRED = NO — 90_ is built from assets/js/core/ and contains none of 60_
FRONTEND_RUNTIME_CHANGE_EXPECTED = NO — per the §17 audit
CACHE_TOKEN_ROTATION_REQUIRED    = NO — follows from the line above
appsscript.json                  = already carries Sheets v4. EDITOR-APPLIED, never pasted.
```

`appsscript.json` already sits in the `EDITOR_APPLIED_MEMBERS` partition of the release ledger, so R44's
**copy list stays `{60_, 63_}`** and the manifest is not in it. The release must land as **one commit** — the
stamp gate ties each stamp to its file's last change.

Tests and docs expected to move with it, named so the round is not surprised: the D1 harness, the D2
transition suite, `live-read-contract-…-r4-a1` (§17), a new date-map contract suite, and a new drift-detector
suite.

## §24 — Rollback

```
PRODUCT   revert 60_ to the R43 reader and cut the reverting release. ONE commit.
DATA      NONE REQUIRED — B1 is a read. PRODUCTION_ROWS_WRITTEN = 0 by construction.
SERVICE   the Sheets advanced service MAY remain enabled during rollback; nothing else depends on it.
MANIFEST  MAY remain, because it is explicitly governed — the D2 transition suite fails if the
          declaration and the manifest ever disagree, so "harmless" is asserted rather than assumed.
          Removing it is a separate cleanup, and both halves move in ONE commit.
CLOUD API may remain enabled unless the operator chooses cleanup.
ROLLBACK MUST NOT REQUIRE BUSINESS-DATA MUTATION — and it does not, by design rather than luck.
```

## §25 — The one bounded implementation unit

```
S8-R4D-E2 — PRODUCT B1 IMPLEMENTATION + R44 RELEASE CUT
  IN:  60_ first-layer 13-table batch reader (metadata pre-step + batchGet), the declared date map,
       the drift detector, the fallback policy, the meta timing contract, 63_ service attestation,
       R44 cut as ONE commit, and the test set named in §23.
  OUT: Amazon importer blank-Date repair · transport redirect repair · A+C payload projection ·
       fc_target_rules migration · the all-21-table reader migration · the other eleven workspaces.
```

---

# REQUIRED REPORT

```
S8_R4D_E1_B1_PRODUCT_CONTRACT_FREEZE = BLOCKED on §0 — every other section is frozen and complete

TEMP_PROBE_FILE_PRESENT_POST     = UNCONFIRMED — operator confirmation required
TEMP_BENCHMARK_FILE_PRESENT_POST = UNCONFIRMED — operator confirmation required

B1_PRODUCT_TABLE_COUNT = 13
UNRELATED_IO_READTABLE_CALLER_CHANGE_COUNT = 0  (structural: twelve private readTable definitions)

PRODUCT_DATE_COLUMN_MAP_SOURCE = EXPLICIT_VERSIONED_B1_CONTRACT
PRODUCT_DATE_COLUMN_MAP = 46 columns / 13 tables — §4, with 3 named NON-date traps

DATE_MAP_DRIFT_DETECTOR = in-repo contract comparison every sweep
                        + out-of-band Sheets effectiveFormat.numberFormat.type sampling
                          DETECT ONLY · OUT OF THE READ PATH · FAIL CLOSED · NEVER AUTO-REMAP

RECOMMENDED_FALLBACK_POLICY   = BOUNDED TRANSIENT FALLBACK TO THE R43 READER
FALLBACK_ALLOWED_ERROR_CLASSES = 429 · 500/502/503/504 · Sheets namespace unresolved
NON_FALLBACK_ERROR_CLASSES     = 400 · 403 · SERVICE_DISABLED · missing sheet/header/column ·
                                 DATE_MAP_DRIFT · SHEETS_PARTIAL_RESPONSE · semantic mismatch
MAX_FALLBACK_COUNT = 1 per logical read · no automatic multi-retry loop

FC_TARGET_RULES_B1_BEHAVIOR = SEMANTICALLY_IDENTICAL_TO_R43

META_TIMING_COMPATIBILITY_CONTRACT = slowestTables stays an ARRAY ([]); timingMode / perTableTiming /
  batchMetadataMs / batchValuesMs / normalizationMs / perTableRows are siblings.
  CORRECTION: the preferred `slowestTables = UNAVAILABLE_IN_BATCH_MODE` would throw a TypeError at
  inventory-replenishment.js:10200, which is not inside a try/catch and is executed by a test.

MANIFEST_RUNTIME_GOVERNANCE_REQUIRED = YES

READ_TABLE_COUNT = 13 · WRITE_TABLE_COUNT = 0 · DELETE_TABLE_COUNT = 0

R44_RELEASE_REQUIRED = YES
R44_EXPECTED_OWNER_SET = { 60_, 63_ }
ACTION_CONTRACT_VERSION_CHANGE = NO (18)
ROUTER_CHANGE_REQUIRED = NO (01_ stays R41)
FRONTEND_CHANGE_REQUIRED = NO

MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN

ARCHITECTURE_DECISIONS_REMAINING = NONE for E2. Two deferred items are named, neither blocking:
  · the other eleven workspace files each still pay the per-sheet floor — a later round
  · fc_target_rules' pending header migration — a separate task, and B1 does not wait on it

IMPLEMENTATION_READY = NO — pending §0 only. YES the moment both TEMP files are confirmed absent.

NEXT_TASK_PROPOSAL = S8-R4D-E2 — PRODUCT B1 IMPLEMENTATION + R44 RELEASE CUT
```
