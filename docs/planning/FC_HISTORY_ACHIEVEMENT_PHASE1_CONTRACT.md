# FC History and Achievement — PHASE 1 CONTRACT (FC1-R1)

**Status: PHASE 1 IMPLEMENTED — no source connected.** 2026-10-21. Written for: the Owner, and whoever
connects the source in phase 2.

Phase 1 is the interface and the contract. Phase 2 is the source, the calculation and switching the two
new methods on. The split is the Owner's, and this document records where the line sits.

## 1. What phase 1 ships

| surface | what the operator sees |
|---|---|
| **Regular table → Months: Forecast / Actual / Achievement %** | A view switch over the twelve month cells. **Forecast** is the table exactly as before. **Actual** and **Achievement %** show `—` in every cell, each cell carrying the state `FC_HISTORY_NOT_CONNECTED` and a tooltip saying why. No column is added; Total FC and both Annual Share columns stay forecast figures in every view. The switch is hidden while Base FC is being edited, and entering edit returns the table to Forecast. |
| **Builder → Last Year Same Month Actual × Growth (phase 2)** | The method, its description, and one reference cell naming the month it would read (`Actual Jun 2025` for a June 2026 target), marked not connected. |
| **Builder → Interval Average excl. Events × Growth (phase 2)** | The method, Interval From / To month controls, and one reference cell naming the interval (or naming the problem: no interval, or From after To). |

**At most three history cells appear in the builder** (Owner: anything wider makes the modal worse, not
better). Each method uses one.

**Neither history method can produce a write.** Preview refuses with `FC_HISTORY_METHOD_NOT_AVAILABLE`
and builds no preview object. Save refuses on its own, whether the selected method or a leftover preview
names a history method. Before this round an unrecognised method fell through to the Manual branch of the
preview, which builds an editable preview that Save writes; the guard sits ahead of that branch.

## 2. The display rule (Owner-confirmed)

| input | displayed | state |
|---|---|---|
| explicit numeric `0` (or `"0"`) | `0` | `VALUE` |
| any other explicit number | the number | `VALUE` |
| `null`, `''`, `undefined`, `NaN`, a word | `—` | `FC_ACTUAL_MISSING` |
| no row for that key | `—` | `FC_ACTUAL_MISSING` |
| row present, month not final | `—` | `FC_ACTUAL_NOT_FINAL` |
| **source not connected (all of phase 1)** | `—` | `FC_HISTORY_NOT_CONNECTED` |

The source is consulted **before** any record: while `connected` is false, a complete and final record
still yields `FC_HISTORY_NOT_CONNECTED`. So nothing — a fixture, a cache, the CP2W test port — can turn
into a number on this page by being handed to it.

**Achievement %** = actual ÷ forecast × 100, one decimal. It is produced only when both sides are
explicit numbers:

| condition | state |
|---|---|
| actual is not `VALUE` | the actual's own state, passed through |
| forecast blank / missing | `FC_FORECAST_MISSING` |
| forecast exactly 0 | `FC_ACHIEVEMENT_UNDEFINED_ZERO_FORECAST` (never Infinity, never 0%) |
| otherwise | `VALUE` |

The forecast side reads the month **as stored** (`fcRaw`), because the display array `months` turns a
blank into 0 and achievement must tell "forecast 0" from "no forecast". `months` itself is unchanged.

## 3. The row contract phase 2 must satisfy — `fc_achievement_monthly`

| field | type | rule |
|---|---|---|
| `company` | string | as `marketplaces` / `marketplace_skus` define it — **never** inferred from channel, country or marketplace |
| `country` | string | upper-cased for the join |
| `marketplace` | string | lower-cased for the join |
| `sku` | string | the internal SKU, upper-cased for the join |
| `month` | `YYYY-MM` | one calendar month |
| `actual_units` | number \| null | **null means unknown.** 0 means a confirmed zero, and is only allowed where the source can prove it (contract §4.2, #3) |
| `is_final` | boolean | true only once the month can no longer change |

**Join key:** `COMPANY|COUNTRY|marketplace|SKU|YYYY-MM` — the FC upsert key (`year + company + country +
marketplace + sku`, `04_`) plus a month, normalised exactly as `_regularFindFc` compares. Implemented as
`_fcHistoryKey_`.

**One row per key.** A duplicate key is a source defect to be refused, not summed.

## 4. Deferred to phase 2 — not resolved

- `MISSING_OWNER_INPUT #1` (raw row → selling entity) and `#3` (completion signal, omit-zero rule,
  coverage). **Deferred by the Owner**, with the short read-only entry check in
  `FC_HISTORICAL_SALES_SOURCE_CONTRACT.md` §9.
- Which physical source feeds the **interval** method. It excludes campaign and event **days**, which a
  monthly aggregate cannot do, so it needs daily history (contract §4.2), not `fc_achievement_monthly`.
- The read path, its query, its byte cost and its GS increment. **Not measured and not requested in
  phase 1**; the GS headroom is 1,159 bytes and belongs to nothing yet.
- Switching either method on.

## 5. What did not move

Prev Month, Apply Growth Rate (`actual`, which reads `fc_regular_forecast` and has never read sales),
Manual, Site Inventory Avg Sales, every campaign / event exclusion, Total FC and both Annual Share
columns. The acceptance suite proves the three existing builder methods compute **identical previews** to
the R55 candidate `7376bee8` by running both versions of `_regularBuildPreview` on the same inputs.

**D-S8-B3-182 — FIXED in FC1-R2 (Owner-approved).** Apply Growth Rate and Previous Month used to turn a
missing base row, a blank base cell or a non-number into 0 in a saveable preview. They now read the base
from the cell as stored and refuse the whole preview, naming SKU, period and reason (`BASE_ROW_MISSING`,
`BASE_MONTH_BLANK`, `BASE_VALUE_INVALID`, `BASE_PERIOD_MISSING`). An explicit 0 is still a base. The
formula for a valid base is unchanged. All three methods also refuse when the Regular forecast is not
loaded (`FC_SOURCE_NOT_READY`) or arrived truncated (`FC_SOURCE_CAPPED`), and methods are a closed list
(`FC_METHOD_UNKNOWN`). Evidence: `fc-builder-base-refusal-and-method-guard-fc1-r2.test.js`.

## 6. Evidence

`assets/tests/fc-history-achievement-phase1-interface-fc1-r1.test.js` — the real page functions in
sandboxes: display rule, state ordering, no-source scan, builder cap, Preview and Save refusals, the
before/after preview comparison, and four mutants (guard removed, source switched on, blank coerced to 0,
zero forecast divided) each of which must be caught.

## 7. FC1-FINAL — two more phase-1 columns on the same contract (2026-10-22)

Both are **read-only reference columns**. Each cell shows `—` with the not-connected state and tooltip
until phase 2 connects a source. Each cell is computed at render time from the row in hand and is
stored on no row, so it cannot reach a write. No request, formula, rounding, base guard or Save payload
changed.

**7.1 Builder Preview — "Actual Sales (Mon YYYY)".**
- **Where:** the shared Preview of the Regular Forecast Builder (New FC Update → Regular), between
  Category / Series and Current Forecast.
- **Which methods:** Apply Growth Rate, Previous Month and Manual.
- **Period:** **Target Year − 1, the same Target Month**. Target Oct 2027 → Actual Sales (Oct 2026). It
  is never the Base period and never the clock.
- **Join:** the §3 key, using the row's own company, country, marketplace and SKU. Another site,
  another SKU and the Target year's own month never answer for it.
- **Display:** the §2 rule. An explicit final 0 shows 0. A missing or blank value shows `—`, never 0.
  An unclosed month is NOT_FINAL.
- **Unconnected source:** while the source is unconnected the lookup is not called at all.
- **The two phase-2 methods** still refuse Preview and Save with `FC_HISTORY_METHOD_NOT_AVAILABLE`.
- Implemented as `_fcPreviewRefPeriod_`, `_fcPreviewLastYearHeader_` and `_fcPreviewLastYearCell_`.

**7.2 Special Events — Actual Qty and Achievement %, columns 10 and 11, right of FC Qty.**
- **Visibility:** shown by default. The Columns menu keys are `actual-qty` and `achievement-pct`. A
  preference saved before they existed does not hide them, and it keeps its other choices.
- **Edit Event FC:** both stay read-only text. FC Qty is still the only input on a row.

**Phase-2 contract, written now and connected to nothing** (`_fcEventActualCell_`,
`_fcEventAchievementCell_`, proven in isolation only):

| rule | contract |
|---|---|
| Actual Qty | units for the event's company / country / marketplace / SKU, start day to end day **inclusive** |
| identity | the event row itself (`event_fc_id` / `campaign_id` and its own period); never matched by name. No campaign identity → `FC_EVENT_IDENTITY_MISSING` |
| days | the site's activity-calendar days as recorded, `YYYY-MM-DD`; nothing passes through UTC |
| part months | **Daily** sales only |
| Monthly sales | only for a **whole** calendar month inside the period, marked complete; never pro-rated by day count |
| Avg Sales event-day exclusion | does **not** apply: these are the event's days |
| zero | an explicit, complete 0 for every day is 0 |
| not a number | unconnected, a missing day (`FC_EVENT_ACTUAL_INCOMPLETE`), a duplicate day (`…_DUPLICATE_DAY`), not started (`FC_EVENT_NOT_STARTED`) — named, never 0 |
| running event | the completed days so far, `FC_EVENT_ACTUAL_PROVISIONAL`, printed "(provisional)" |
| Achievement % | Actual / FC × 100, one decimal, **uncapped**; Actual 0 on FC > 0 → 0.0%; Actual missing, FC missing or FC = 0 → named state, never Infinity |
| **open — Owner, phase 2** | which event owns a day that two events of one SKU share (an overlap is answered `FC_EVENT_OVERLAP_UNRESOLVED`, not counted twice); whether returns are netted |

The daily / monthly event source is **not named yet** (`FC_EVENT_HISTORY_SOURCE_` has `daily: null`,
`monthly: null`, `connected: false`).

**Evidence:**
- `assets/tests/fc-preview-last-year-actual-and-event-achievement-fc1-final.test.js` covers:
  - counter-examples at `2af8d156`;
  - the real renderer for the three methods;
  - isolation and the zero rule, on a connected source built inside the test;
  - unchanged functions and payloads;
  - the Event table, the Columns menu and old preferences;
  - the contract;
  - ten mutants.
- `assets/tests/_fc1-final-runner.js` and `docs/evidence/fc1-final/` are a real Chrome run at 1440 and
  820, on a fixture served only by that runner. Save is never clicked.
