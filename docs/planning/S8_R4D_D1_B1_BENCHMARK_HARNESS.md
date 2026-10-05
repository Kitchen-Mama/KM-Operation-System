# S8-R4D-D1 — MANIFEST GOVERNANCE + READ-ONLY B1 BENCHMARK HARNESS
## Infrastructure only · nothing enabled, nothing deployed, no Product byte moved

```
S8_R4D_D1_B1_BENCHMARK_HARNESS = PASS
PRODUCT_RUNTIME_FILE_CHANGE_COUNT = 0        R44_RELEASE_CUT = NO
```

Three things exist now that did not before: a guard over the manifest, a benchmark that can be run, and a
runbook for enabling the service. **The service is still off**, and nothing here authorises the B1 product
reader.

---

## 1. The manifest guard — closing the gap before the manifest moves

`appsscript.json` was in no `RELEASE_OWNERS` set, no suite asserted it, and `system.health` cannot report it.
It is the one artefact that can silently un-deploy a feature built on an advanced service, and it was the one
artefact nothing watched. That gap is only cheap to close **before** the manifest changes, which is now.

```
assets/tests/_advanced-services-state.js   the DECLARED intent
assets/tests/b1-advanced-sheets-benchmark-harness-s8-r4d-d1.test.js   checks it against the manifest BYTES
```

The expectation lives **outside** the file being guarded. A guard that read its expectation out of its subject
would pass for any contents at all.

```
SHEETS_ENABLED = false        ← PRE_ENABLE, and the suite asserts Sheets is ABSENT
```

Two states, one explicit transition — flipping that boolean is a deliberate, reviewable, one-line commit a
human has to write:

| | PRE_ENABLE | POST_ENABLE |
|---|---|---|
| Sheets entry | **must be absent** | **exactly once**, `{Sheets, v4, sheets}` |
| BigQuery | present once, unchanged | present once, unchanged |
| service count | exactly 1 | exactly 2 |
| OAuth scopes | unchanged | unchanged — B1 needs no new scope |
| webapp | `USER_DEPLOYING` / `ANYONE_ANONYMOUS` | unchanged |

There is no state in which *"the service appeared and nobody decided it should"* passes.

```
CURRENT_ADVANCED_SERVICE_SET = [ { BigQuery, v2, bigquery } ]
FUTURE_ADVANCED_SERVICE_SET  = [ { BigQuery, v2, bigquery }, { Sheets, v4, sheets } ]
MANIFEST_GOVERNANCE_IMPLEMENTED = YES
```

## 2. The benchmark tool

```
BENCHMARK_TOOL = assets/tools/apps-script-diagnostics/TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs
                 PASTE · RUN · REPORT · REMOVE — registers no action, unreachable from 01_router.gs,
                 never called by a handler, deleted after the run whatever the result.
```

```
CONTROL_SERVICE_CALL_COUNT = 13   SpreadsheetApp range reads — the accepted R43 reader
B1_REMOTE_CALL_COUNT       = 2    1 × Sheets.Spreadsheets.get (fields=sheets.properties)
                                  1 × Sheets.Spreadsheets.Values.batchGet
```

The metadata call earns its place twice: it answers **existence** (so an absent optional sheet is never named
in a range, and cannot take the other twelve down with a 400) and it supplies **width** (so ranges are derived,
not frozen — the schema contract runs `extraColumnsPolicy: ALLOW`, and a hard-coded `A:AP` would truncate
column 43 in silence).

Both arms share one converter, byte-equivalent to 60_'s `sirWsRowsFromValues_` at R43, so a difference can
never be an artefact of two different converters.

## 3. The three hazards, each with a test that bites

### The date shift

41 columns carry a real `Date` today, every one `…T16:00:00.000Z` because the script timezone is Asia/Taipei
and a date cell is local midnight. The browser does `String(s).slice(0, 10)`, so the whole Sales Trend is
calibrated on that UTC-shifted date.

```js
b1bmSerialToDate_(serial, tz)   // Date.UTC(1899,11,30) + serial·86400000 → wall clock → parseDate in tz
```

```
F1   a date serial coerces to 2026-07-18T16:00:00.000Z — the exact instant getValues() returns
F1a  and it goes through parseDate against the SHEET's timezone, never a hard-coded +08:00
F2   a fractional serial (a timestamp) round-trips to the millisecond
F5a  a ONE DAY shift is caught and reported in milliseconds
F5b  a ONE SECOND drift is caught too
F5b1 and the gate is SECOND-resolution by construction — a sub-second delta is NOT a diff
```

That last line is stated rather than left to be discovered: the coercion formats through
`yyyy-MM-dd HH:mm:ss`, so sub-second precision is outside the gate. Every timestamp in these thirteen tables
is stored to the second (`synced_at = 09:30:08`), so the gate matches the data it guards — but a future table
carrying millisecond precision would need this revisited.

**A finding for any product round, surfaced by building this:** `batchGet` + `SERIAL_NUMBER` returns a plain
number, so **it cannot tell you which columns are dates** — serial 46222 and the integer 46222 are identical on
the wire. The benchmark resolves this by taking the date-column map from CONTROL, which *can* tell. A shipped
B1 has no oracle, so it would need a **declared date-column map** or a second call for number formats. The
report emits `B1_DATE_COLUMN_MAP_SOURCE = CONTROL_ORACLE` so this cannot be forgotten.

### The inverted blank-row rule

`batchGet` omits **trailing empty cells**. Three tables end in an all-blank `note` column today
(`marketplaces`, `amazon_weekly_sales_snapshot`, `overseas_inventory_snapshot`). Without padding,
`data[r][c]` is `undefined`, `String(undefined)` is `"undefined"` — which is not empty — so the all-blank-row
**drop silently inverts** and every row gains `note: undefined`.

```
F3   a short row is padded to header width with empty strings
F3a  and the all-blank row is then correctly DROPPED
F3b  WITHOUT padding the drop INVERTS — asserted against the unpadded input, not described
F3c  and a padded cell is "" — never the string "undefined"
```

### Identity coercion

`sku_details.sku` and `overseas_inventory_snapshot.sku` are **mixed `number+string`** columns today.

```
F5d  a number silently becoming a string IS a diff — identity must not be coerced to pass
F5e  and so is a boolean rendered as display text
```

`UNFORMATTED_VALUE` is therefore required for **identity**, not only for arithmetic.

```
VALUE_RENDER_OPTION = UNFORMATTED_VALUE     DATETIME_RENDER_OPTION = SERIAL_NUMBER
DATE_SEMANTIC_DIFF_TARGET = 0   IDENTITY_TYPE_DIFF_TARGET = 0
TRAILING_BLANK_DIFF_TARGET = 0  FORMULA_VALUE_DIFF_TARGET = 0   SEMANTIC_RESULT_DIFF_TARGET = 0
```

**Formulas:** `UNFORMATTED_VALUE` returns a formula's computed value, matching `getValues()`, so the intended
behaviour is correct by construction — but `FORMULA_CELL_COUNT` is **not establishable without the API**, so
the benchmark measures it rather than this document asserting it.

## 4. Safety and design

```
ZERO_WRITE_PROOF = C1 asserts no setValue(s), appendRow, insert/deleteRow(s), insert/deleteSheet,
                   clearContent, clearFormat, .clear(, SpreadsheetApp.flush, PropertiesService, DriveApp,
                   ScriptApp.newTrigger, MailApp, GmailApp, setProperty or deleteProperty in the tool's
                   code (comments stripped first — the file SAYS it does not write, and a raw scan would
                   fail it for saying so).
WRITE_PRIMITIVE_COUNT = 0   PROPERTY_WRITE_COUNT = 0   DRIVE_WRITE_COUNT = 0   TRIGGER_WRITE_COUNT = 0
READ_TABLE_COUNT = 13   WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0
amazon_inventory_health_snapshot — UNAUTHORIZED_UNKNOWN · READ ONLY · PERMANENT_REGISTRY_CHANGE = NO
DAILY_SALES_PROJECTION_INCLUDED = NO — causal isolation; the benchmark compares reads, not payloads
```

```
BENCHMARK_PAIR_COUNT = 5
PAIR_ORDER = CONTROL→B1, B1→CONTROL, CONTROL→B1, B1→CONTROL, CONTROL→B1
```

Alternating, because a fixed order hands the second arm a warmed spreadsheet handle every pair — and with
Production variance running 19.0–40.9 s on one build, a systematic warm-up advantage is easily larger than the
~2.4 s being measured. Every pair is recorded; **nothing is discarded for being slow**.

```
B1_FAILURE_SEMANTICS  unavailable service / 400 / 403 / 429 / 5xx / quota → a TYPED benchmark failure.
                      NEVER [] and never an empty table. There is NO fallback inside a measured arm:
                      falling back would silently time the wrong implementation.
```

The verdict is computed, not left to the reader — `B1_BENCHMARK_SEMANTIC_PASS` is `YES` only when
`worstDiff === 0 && failures.length === 0`. **One diff is enough to reject B1, and there is no exception list.**

## 5. Cloud enablement runbook — for S8-R4D-D2, not now

**Do not run these steps as part of this round.** No project id is guessed anywhere in this repository; the
only project id in the codebase is `config.sourceProjectId`, a runtime config value for the **BigQuery data
source**, which is *not* the GCP project attached to the Apps Script project.

1. **Identify the linked Cloud project.** Apps Script editor → ⚙ **Project Settings** → *Google Cloud Platform
   (GCP) Project*. Note the project number/id shown.
2. **Verify it is the correct Production project.** It must be the project this Web App already runs under —
   the same one BigQuery v2 works through today. If it shows a **default/auto-created** project, **STOP and
   report back**: enabling an API there may require attaching a standard project first, which is a materially
   larger change than this round authorises.
3. **Enable the Google Sheets API.** Cloud Console → that project → APIs & Services → Library → *Google Sheets
   API* → **Enable**. While there, read APIs & Services → *Google Sheets API* → **Quotas** and record the
   limits; this repository cannot prove them and none are invented here.
4. **Add the advanced service.** Apps Script editor → **Services** `+` → *Google Sheets API* → version **v4**,
   identifier **`Sheets`** → Add. Confirm the editor's manifest now shows exactly one `sheets` entry alongside
   `bigquery`.
5. **Preserve everything else.** Do not touch *Execute as*, *Who has access*, or the OAuth scopes. B1 needs no
   new scope — `.../auth/spreadsheets` is already granted.
6. **Watch for an authorization prompt.** None is expected, because the scope set does not change.
7. **STOP if a new OAuth scope or an unexpected consent screen appears.** That would mean the change is larger
   than analysed, and it must come back for re-analysis rather than be clicked through.

Then, and only then: paste the TEMP tool, run `B1BM_runBenchmark`, copy the JSON report out, and delete the
file.

## 6. Afterwards

```
NO_GO_CLEANUP_MODEL
  1. delete the TEMP tool from the Apps Script project
  2. remove the Sheets advanced service (Apps Script → Services → Sheets → remove) unless separately
     approved to retain, and flip SHEETS_ENABLED back to false in the same commit as the manifest revert
  3. the Google Sheets API may be disabled again — no other Product dependency uses it
  No Product runtime rollback is needed, because B1 was never deployed. That is the point of this shape.

GO_NEXT_ROUND_MODEL
  The TEMP tool is still removed. Benchmark success does NOT authorise adoption; it authorises a separate
  B1 product implementation round, which must carry: the declared date-column map (the oracle does not
  exist in production), the absent-sheet pre-step, the padding, a fail-closed error path, manifest
  governance moved from "benchmark" to "runtime dependency", and its own release — that round decides R44.
```

```
PAIRED RESULT FIELDS the benchmark will report
  CONTROL_MEDIAN_MS · B1_MEDIAN_MS · PAIRED_MEDIAN_SAVING_MS · PAIRED_MEDIAN_SAVING_PERCENT
  PAIR_WIN_COUNT_B1 · PAIR_WIN_COUNT_CONTROL · SEMANTIC_RESULT_DIFF_COUNT · failures[]
```

No pass threshold is set. A ~2.4 s saving must be weighed against a permanent Advanced Service dependency, a
Cloud API whose disabling breaks the runtime, the loss of per-table timing, and a 41-column date coercion that
must be right forever — on ~14% of one page's read, on a page whose wall time is dominated by a fixed ~6 s
transport cost this change does not touch.

```
MAINLINE_NON_REGRESSION_BOUNDARY = FROZEN
TRANSPORT_REPAIR_INCLUDED = NO     A_PLUS_C_STATUS = DEFERRED
PRODUCTION_ROWS_WRITTEN = 0   ROWS_DELETED = 0   SCHEMA_CHANGES = 0
OPERATOR_ACTION_REQUIRED = ENABLE GOOGLE SHEETS API + ADVANCED SHEETS SERVICE,
                           ONLY AFTER THIS ROUND PASSES
NEXT_TASK = S8-R4D-D2 — ENABLE SERVICE + RUN READ-ONLY B1 BENCHMARK
```
