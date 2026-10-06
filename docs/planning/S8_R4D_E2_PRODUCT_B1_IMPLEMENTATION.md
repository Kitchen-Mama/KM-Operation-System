# S8-R4D-E2 — PRODUCT B1 IMPLEMENTATION + R44 RELEASE CUT
## Implemented and cut. Not deployed, not pushed.

```
R44 = F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R44
OWNERS 60_api_v1_inventory_replenishment_workspace.gs · 63_api_v1_system_health.gs
PRODUCTION_ROWS_WRITTEN = 0 · PRODUCTION_ROWS_DELETED = 0 · SCHEMA_CHANGES = 0
```

The thirteen first-layer tables now read through one `Sheets.Spreadsheets.get` and one
`Values.batchGet`. The other eight tables this handler can read stay on the per-sheet reader in the same
file, and the eleven other workspace files are untouched — each defines its **own private** `readTable`, so
the change is structurally unable to reach them.

---

## 1. Three things the implementation had to get right that the benchmark did not test

### `gridProperties.rowCount` is the allocated grid, not the content

The obvious range is `'sheet'!A1:<col><rowCount>`. It is wrong: an empty sheet has `rowCount` 1000, so that
range asks for a thousand empty rows and — far worse — makes an empty sheet indistinguishable from a full
one. Ranges are **column-bounded and row-open** (`'sheet'!A:AP`), and emptiness is decided by the response.

### `batchGet` cannot tell `HEADER_MISSING` from `HEADER_BLANK`

Both come back with no `values` key. R43 decides between them on sheet **geometry**, and §11 required
`fc_target_rules` — present, empty, and a required consumer input — to behave identically. So a table that
returns empty costs one `getLastRow` probe: a metadata accessor R43 already ran per table, not a range read.
The exact token is bought for nothing, and only for tables that came back empty.

### A missing `valueRange` is not an empty table

`batchGet` returns one entry per requested range, in order. A range holding no data has no `values` **key**;
that is different from the **entry** being absent. Treating the first as `[]` is correct. Treating the second
as `[]` fabricates an empty business table out of a malformed response, and the two are one line apart — so
`SHEETS_PARTIAL_RESPONSE` is a first-class, non-fallback failure.

## 2. The date map, and why it is declared

```
SIR_B1_DATE_MAP_         46 columns across 13 tables
SIR_B1_NON_DATE_TRAPS_    3 columns that must NEVER enter it
SIR_B1_DATE_MAP_VERSION_  B1-DATE-MAP-R44-1
```

Under `UNFORMATTED_VALUE` + `SERIAL_NUMBER` a date and a number are the same wire value. The benchmark
scored zero date diffs because it asked the old reader which columns were Dates. `fc_special_events` holds
the whole argument by itself:

| column | live type | a name heuristic would |
|---|---|---|
| `event_start_date` | Date | correctly convert |
| `event_month` | **number `11`** | convert to **1900-01-10** and destroy every FC event window |
| `event_period` | string `"2026-11-19~2026-11-30"` | convert garbage |
| `created_at` | Date `07:44:07` | convert, but only if fractional serials are handled |

**The coercion is type-gated and that is load-bearing, not defensive.** It fires only on a `number`. A string
in a declared date column passes through untouched — `marketplace_skus.launch_date` is written as
`String(...).trim()` by both write paths while all 495 live rows hold Dates, so a string in that column is
one upsert away.

The drift detector reads `effectiveFormat.numberFormat.type`, because that is the mechanism that actually
decides whether `SpreadsheetApp` returns a Date — not what a writer intended. `fcWriteTimestamp_()` returns a
**string** and the cell holds a **Date**, since Sheets parses date-shaped strings on write. It runs out of
band, detects only, and never remaps: auto-remapping would be the runtime inference the contract forbids,
arriving through the back door. Its two blind spots report themselves (`UNDETECTABLE_NO_DATA`,
`DECLARED_BUT_UNFORMATTED`) rather than counting as agreement.

## 3. A design error the sweep found, and the correction

I first folded the advanced-service attestation into `runtime_authority.uniform`, so a deployment without
Sheets v4 reported `mixed_deployment = true`. **Five suites that model a fully synced deployment immediately
reported themselves broken, and that unanimity was the signal rather than the noise.**

`mixed_deployment`'s own message tells the operator to *"re-copy those files and publish a NEW deployment
version"*. That does not fix a missing advanced service — they have to add it in the editor. Right alarm,
wrong address.

```
runtime_authority.advanced_services = { advanced_sheets_required, advanced_sheets_manifest_expected,
                                        advanced_sheets_runtime_mode: RESOLVED | MISSING, verdict }
module_build_stamps.advanced_services_ok = true | false
mixed_deployment                          — left to describe FILE sync, which is what it means
```

It is attested **by execution** (`typeof Sheets`) and costs zero API calls. The action-registry suite builds
a second deployment *without* the service and asserts it reports `MISSING` and `advanced_services_ok: false`
— without that inverse, the flag could be hard-coded to `RESOLVED` and nothing would notice.

## 4. The meta contract

```
slowestTables   []        ← STAYS AN ARRAY. Empty BY TRANSPORT, not by failure.
timingMode      BATCH | PER_TABLE
perTableTiming  UNAVAILABLE_IN_BATCH_MODE | AVAILABLE
batchMetadataMs · batchValuesMs · normalizationMs · rangeCount · remoteCallCount · perTableRows
readerMode · primaryReader · fallbackUsed · fallbackReason · fallbackErrorClass · fallbackCount · finalReader
```

The E1 audit found `inventory-replenishment.js:10200` calls `.forEach` on `slowestTables` inside no
try/catch. A string or object sentinel raises a `TypeError` on the page, so the typed marker lives in sibling
fields. The suite proves this against the consumer's real expression rather than asserting it.

## 5. Fallback

```
ALLOWED   429 · 500/502/503/504 · the Sheets namespace not resolving        MAX 1 per logical read
DENIED    400 · 403 · SERVICE_DISABLED · missing sheet/header/column · DATE_MAP_DRIFT ·
          SHEETS_PARTIAL_RESPONSE · anything unrecognised
```

An unrecognised failure is **not** transient — the default is to fail closed rather than quietly take the
22-second path forever. There is no retry loop; the single fallback is the entire budget.

## 6. Evidence

```
NEW SUITE   b1-product-first-layer-batch-read-s8-r4d-e2   140 passed · 16 mutants · 0 survived · 0 vacuous
TARGETED    20 suites · 0 failures
FULL SWEEP  613 suites · 608 OK · 0 timeouts · 19 FAIL lines · tree clean after
CANONICAL_FAILURE_SET_CHANGED = NO   byte-identical to the R4C baseline
```

Eight gates were re-aimed and none loosened. The D1/D2-era claims that B1 was absent from the Product path
are pinned at the rounds that made them; the head halves state what R44 did on purpose.

Two faults worth recording because neither was a test being wrong about the code. A `sed -i` on the
activation census flattened 9,352 line endings in the working tree — the committed bytes were identical, so
it was invisible to `git diff`, and three unrelated suites went red only in the **next** sweep. And the
post-sweep fix commit broke `release-needs-one-commit`: `63_`'s stamp moved in the release commit while its
last change landed in the follow-up, so the two were collapsed with `git reset --soft`.

## 7. Apps Script sync set and release plan

```
COPY (paste into the Production Apps Script project):
  60_api_v1_inventory_replenishment_workspace.gs
  63_api_v1_system_health.gs

EDITOR-APPLIED (already present since S8-R4D-D2 — verify, do NOT paste):
  appsscript.json   Sheets v4, identifier `Sheets`, beside BigQuery v2

DELETE (confirm absent):
  TEMP_S8_R4D_D2_SHEETS_AVAILABILITY_PROBE.gs
  TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs

THEN create a NEW VERSION on the EXISTING Production Web App. Do not create a second Web App.
VERIFY system.health:
  deployment_build = …-R44
  mixed_deployment = false
  module_build_stamps.advanced_services_ok = true
  runtime_authority.advanced_services.advanced_sheets_runtime_mode = RESOLVED
```

**Deployment is S8-R4D-E3, and it is not this round.** The Production acceptance must measure the page the
way R43's was measured — through the Web App, against a same-day baseline — because the 90.1% is a
transport-layer figure and the end-to-end number is still unknown.

```
R44_RELEASE_CUT = YES   DEPLOYED = NO   PUSHED = NO
```
