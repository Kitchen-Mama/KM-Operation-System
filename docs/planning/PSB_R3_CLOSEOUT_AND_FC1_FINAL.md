# PSB-DEMO-R3 close-out and FC1-FINAL (phase 1 close-out)

**Written for: the Owner and the reviewer of the next release.**

This round makes no production write, adds no API, `.gs`, schema or Property change, and touches no FX.
Everything below joins the **unreleased r64 candidate** (`r64-psbdemor3-20261022`), which R3 prepared and
which has not been deployed. Release governance allows that, so no new token is cut.

## 1. PSB-DEMO-R3 close-out — the R55 findings F-2 and F-1

### F-2: right-edge clipping, re-verified with the discount line

R55 P3 saw `44.79` printed as `44.7` (CO5600-Q, ResUS US Amazon, BFCM). P6 saw the competitor header
cut. R3 had already repaired both:
- an edge label flips to the left of its marker;
- the competitor header anchors to the right edge when it does not fit.

**This round therefore changes no F-2 code.** It re-verifies F-2 in a real Chrome, on production's
responses of 2026-10-22, with R3's new discount line under every deal price. The scope:
- **Charts:** the R55 P3 chart (US Amazon, Electric Can Opener, BFCM) at 1920, 1440 and 820.
- **Competitor:** each chart is checked again with a competitor entered, in both the activity view and
  the everyday view.
- **Layout-only:** the two-currency, long-name copy at all three widths.

The runner is `_psb-demo-r3c-runner.js` and its evidence is `docs/evidence/psb-demo-r3/close-out/`.
- **Before** (`2af8d156`) and **after** both pass every F-2 check: 99 of them.
- **No label leaves the drawing or overlaps another.** The deal-price, discount and header type stays
  13 / 12 / 12 px on screen or larger.
- **The right-most label prints in full.** `44.79`, the full recorded price, matches the table, with
  `20% off` under it. It ends 41–68 px inside the edge.
- **The competitor header prints in full**: `Competitors · entered this session · not saved`.

### F-1: the activity period as readable days

**Root cause.**
- Production serialises the sheet's Date with `toString()`. A period therefore arrives as
  `Thu Nov 19 2026 00:00:00 GMT+0800 (台北標準時間)`, and the board printed it exactly so.
- The menu was also sorted on that text, so "Thu…" (BFCM, November) came before "Tue…" (Fall Prime,
  October).

**Fix (display only).**
- `S.campaignDayOf` reads the day **literally** from the text. It accepts an ISO day, or the long form,
  whose day is the wall-clock date in the offset the text names.
- No Date is made and nothing passes through UTC. Read through UTC, a Taipei midnight would print the
  day before, which is F-3's defect on IR.
- `S.campaignPeriodText` prints `2026-11-19 to 2026-11-30`.
- An unreadable value is shown as recorded and named; it is never guessed.
- The menu and the tooltip use it, and the menu is ordered by start day.

**Unchanged:** the value carried, the adapter's `isoDay` contract, period validity, and every
comparison.

**Evidence:**
- **Browser, before:** 7 F-1 failures, the only failures, out of 117 checks.
- **Browser, after:** 117 / 117. The menu reads `Fall Prime 2026 · 2026-10-06 to 2026-10-07` and then
  `BFCM 2026 · 2026-11-19 to 2026-11-30`. The tooltip matches, and there is no `GMT` on the board.
- **Node:** `product-strategy-activity-period-days-psb-demo-r3c.test.js`, 35 assertions and 4 of 4
  mutants caught. The mutants are: read through UTC, sorted by the raw text, an unreadable value
  guessed, and the tooltip printing the raw value.

## 2. FC1-FINAL

The full contract is in `FC_HISTORY_ACHIEVEMENT_PHASE1_CONTRACT.md` §7.

### 2.1 Preview: "Actual Sales (same month last year)"

**Where:**
- **Table:** the shared Preview of the Regular Forecast Builder (New FC Update → Regular).
- **Methods:** Apply Growth Rate, Previous Month and Manual.
- **Position:** one column between Category / Series and Current Forecast.

**The period:** Target Year − 1, the same Target Month. Target Oct 2027 → `Actual Sales (Oct 2026)`.
It is never the Base period and never the clock.

**Lookup:**
- It reuses the FC1-R1 monthly key: the row's own company, country, marketplace and SKU.
- The source is unconnected, so the lookup is not even called.

**Display:**
- Every cell is `—`.
- Each cell carries `data-fc-history-state="FC_HISTORY_NOT_CONNECTED"`, the period, and a tooltip:
  *reference only, not used by New Forecast, Change or Save; historical sales are not connected yet
  (phase 2)*.
- A connected source in the test shows an explicit 0 as 0. Missing or blank values show `—`.

**Nothing else moved.** These are byte-identical to `2af8d156`:
- `_regularBuildPreview`, `saveRegularUpdate` and the base / period helpers;
- the Event write rows.

The cell is computed at render and stored on no row, so a Save payload cannot carry it. The two phase-2
methods still refuse with `FC_HISTORY_METHOD_NOT_AVAILABLE`.

**Re-preview.** A new Target, method or scope clears the whole table, heading included, so nothing of
an earlier Preview survives.

### 2.2 Special Events: Actual Qty and Achievement %

**Placement:**
- Columns 10 and 11, right of FC Qty, right-aligned and read-only.
- Widths: 100 and 120 px, declared in the shared column schema.

**Columns menu and preferences:**
- The Columns menu offers them, with keys `actual-qty` and `achievement-pct`.
- An older stored preference does not hide them, and it keeps every other choice.
- Positions 1–9 do not move, so no stored width moves.

**Cells:** each is `—` with the not-connected reason.

**Edit Event FC:** they stay plain text, and FC Qty is still the only input on a row.

**The phase-2 contract** is written and tested in isolation. The page connects nothing:
- **Days:** inclusive.
- **Sales grain:** Daily for part months; Monthly only for a whole month that is marked complete, never
  pro-rated by day.
- **No UTC:** days are compared as the dates they are, never converted through UTC.
- **Zero vs missing:** zero is shown only when it is explicit and complete. Missing, duplicate and
  not-started each have a named state.
- **Running events:** provisional, and labelled so.
- **Achievement:** uncapped, one decimal, never Infinity.

**Left to the Owner for phase 2:** overlap ownership (answered `FC_EVENT_OVERLAP_UNRESOLVED`, not
counted twice) and returns.

### 2.3 Evidence

**Counter-examples first.**
- At `2af8d156` the Preview had five columns and the Event table stopped at FC Qty.
- The same browser runner on that source scores **19 / 54**. Every failure is a check this round adds.

**Node:** `fc-preview-last-year-actual-and-event-achievement-fc1-final.test.js`, 107 assertions and
10 of 10 mutants caught. The mutants are:
- the Target year used as the reference year;
- an unconnected source asked anyway;
- the marketplace dropped from the key;
- the reference stored on a preview row;
- a missing day counted as 0;
- a monthly figure shared into a part month;
- achievement capped at 100%;
- not started shown as 0;
- a running event shown as final;
- a header dropped.

**Real Chrome:** `_fc1-final-runner.js`, at 1440 and 820, **54 / 54**. The fixture is served only by
that runner, and Save is never clicked.
- **Preview:** the column, its place and its cells, for all three methods.
- **Save:** still enabled.
- **Clearing:** the Preview is withdrawn on a method or Target change. Jan 2028 then reads Jan 2027,
  with nothing of Oct 2026 left.
- **Refusal:** Last Year Same Month Actual is refused by name.
- **Modal fit:** the modal stays inside the window at 820, Save and Cancel stay reachable, and no cell
  is cut.
- **Event table:** order, cells and tooltips, header and body alignment, including after a horizontal
  scroll to the end.
- **Columns menu:** hide and re-show.
- **Old preference:** honoured, without hiding the new columns.
- **Edit mode:** one input per row.
- **Reads only:** `fcSummary.workspace.get`, `getClientCapabilities`, `inventoryScope.registry.get` and
  the legacy read `getTable`.

## 3. Correction of the R55 acceptance record

Recorded in `R55_POST_RELEASE_READONLY_ACCEPTANCE_PSB_IR_FC.md` §8. Only the wording changed; no result
or evidence did.
- **Totals:** 18 items, **17 PASS, 1 FAIL** (P3). The NOT RUN sub-items stay NOT RUN.
- **IR:** the same 100 rows on every visit. **17 rows were unavailable from the first read** (Avg `--`);
  83 have Avg / DoS / Suggested. I1's earlier "all 100 rows have Avg" was wrong.
- **Production P3 stays FAIL** until the release is approved and deployed and production is accepted
  again.

## 4. Tests that changed, and why

| suite | change | reason |
|---|---|---|
| `fc-column-resize-and-retry-label-r2b-a2-r3` | A2: 9 → 11 Event columns; A2c pins FC Qty, Actual Qty, Achievement % | two columns added after FC Qty |
| `fc-summary-display-column-visibility-r1` | J6: 9 → 11 | same |
| `fc-retry-canonical-hydration-boot-fc-r1` | H3 cuts the new col-11 width rule from both sides, like col 10 | styling this round declares |
| `fc-history-achievement-phase1-interface-fc1-r1` | M4's anchor starts at `_fcAchievementCell_`'s own first line | the event achievement repeats the two guard lines; the mutant is unchanged |
| `fc-summary-stability-r1-false-empty` | stubs `_fcEventHistoryCellsHtml_` | the row renderer calls it; stubbed like the month cells |

**Re-taken captures** (pinned to sources this round changed; re-taken, not re-pinned):
- `cp2t-fc-prevmonth`: 9 / 9.
- `psb-demo-r1`: 48 / 48.
- `psb-demo-r2`: 52 / 52, with PREFIX and M1–M6 each caught.

## 5. Release (frontend only; joins the unreleased r64)

**Runtime files changed since `origin/main` `8da211de`:**

| file | why |
|---|---|
| `assets/js/product-strategy/psb-selectors.js` | R3 + F-1 |
| `assets/js/product-strategy/psb-chart-layout.js` | R3 |
| `assets/js/product-strategy/psb-board-ui.js` | R3 + F-1 |
| `assets/css/product-strategy-board.css` | R3 |
| `assets/js/pages/fc-summary.js` | FC1-FINAL |
| `assets/html/pages/fc-summary.html` | FC1-FINAL (partial, fetched `no-store`) |
| `assets/css/pages/fc-overview.css` | FC1-FINAL |
| `index.html`, `assets/js/app.js` | token r63 → r64 (R3) |

- **APPS_SCRIPT_SYNC_REQUIRED:** none. **BUNDLE_REBUILD_REQUIRED:** no.
- No Property, schema, schedule or FX change.

**Remaining limitations, and items kept open:**
- PSB: F-3 (IR's UTC gap date) and the IR date format are not touched.
- FC: F-4 (`total_fc` differs from the month sum by 1) is not touched.
- `map-canvas-acceptance`'s desktop cold run is still open.
- Production P3 stays FAIL until it is accepted again.
- Phase 2 needs the event sales source, and the Owner's decisions on overlap and returns.

## 6. Final full regression (one run, on the frozen candidate `0d0c5387`, kept raw)

`docs/evidence/fc1-final/sweep-at-0d0c5387.*`: **699 / 701 clean**, worktree INTACT, stderr 0,
complete.

The two suites that were not clean:
- **`navigation-performance-observation` (G2 / G4).** This was a pin, not a fault. The boot census
  counts boot-script bytes from disk, and `fc-summary.js` grew by exactly 13,976 bytes
  (549,369 → 563,345, CRLF on disk). No script entered or left the boot set.
  - **Fix:** the census was re-measured from disk, as every earlier round did: boot 3,881,051 →
    3,895,027 and page 2,265,712 → 2,279,688, with the account in its note.
  - **Re-run of the suite alone:** 465 / 465.
  - The full regression was **not** run again.
- **`map-canvas-acceptance`.** The same open finding as R3: its capture is pinned to the pre-r64
  `index.html` / `app.js`, and the desktop cold run cannot be re-taken
  (`docs/evidence/psb-demo-r3/MAP-DESKTOP-COLD-RUN-FINDING.md`). It is not re-pinned, and it is
  outside this round.

## 7. R64 release-candidate close-out: the map capture, and the final regression

**The map capture was re-taken through its documented entry.**
- PSB-DEMO-R3's three attempts ran `_cp2m-r2-map-runner.js`. That runner forces `--use-gl=swiftshader`,
  which the probe now measures as losing its context at 2702 ms after 1 frame.
- The suite names `_cp2o-r2-gl-probe.js`, then `_cp2o-r2-map-capture.js`. On Chrome's real adapter
  (Intel Iris Xe, ANGLE / D3D11) the context held for 10 s.
- **The capture**, taken cold, with no warm-up and no retry of a failed render:
  - desktop and mobile both captured;
  - A/B noise floor 0;
  - a real drag changed 45.2% / 72.9% of the canvas;
  - the globe fills 99.8% of the canvas;
  - the unchanged suite: **75 / 75**.
- The PNGs are byte-identical to the 2026-10-21 capture.
- **One environment fact.** From this non-ASCII worktree path, a relative output folder makes Chrome's
  `--screenshot=` write nothing. That attempt is kept; the passing one used an absolute ASCII folder.
- `MAP-DESKTOP-COLD-RUN-FINDING.md` is corrected: no product defect was shown. Its original text and
  attempts are kept.
- No map, globe or loader code changed.
- Evidence: `docs/evidence/r64-map-recapture/`.
- **Targeted suites:** map 75 / 75, navigation 465 / 465.

**Final full regression, on the frozen candidate `f203c00c`: 701 / 701 clean**, worktree INTACT,
stderr 0, complete. It is kept raw in `docs/evidence/r64-map-recapture/sweep-at-f203c00c.*`. The
earlier 699 / 701 record at `0d0c5387` (§6) is kept as it was.

**r64 release list** (frontend only), changed since `origin/main` `8da211de`:
- `index.html`, `assets/js/app.js` (token r64);
- `assets/js/product-strategy/psb-selectors.js`, `psb-chart-layout.js`, `psb-board-ui.js`;
- `assets/css/product-strategy-board.css`;
- `assets/js/pages/fc-summary.js`, `assets/html/pages/fc-summary.html`, `assets/css/pages/fc-overview.css`.

`.gitignore` changed as well; it is repository-only and is not deployed.

No `.gs`, no Apps Script manifest, no Property, no bundle. Production P3 stays FAIL until r64 is deployed
and production is accepted again.
