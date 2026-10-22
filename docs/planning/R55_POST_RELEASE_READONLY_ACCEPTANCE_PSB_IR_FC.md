# R55 post-release read-only acceptance — PSB / IR / FC (record)

**Written for: the Owner and the reviewer of the R55 release.**

**Run:** 2026-10-22, 10:14–10:41 Taipei.
- **Browser:** a real Chrome (`--headless=new`, 1440×1000, fresh profile) on the **published** site
  `https://kitchen-mama.github.io/KM-Operation-System/`, against the **production** `/exec`.
- **Data:** production data only. No fixture, no local replay and no page injection.
- **Evidence:** `docs/evidence/r55-readonly-acceptance/run-1/`. The driver is
  `assets/tests/_r55-prod-readonly-driver.js`.

**Boundary kept:** reads, Preview/Cancel and PSB in-memory simulation only. Nothing was saved,
submitted, recalculated, imported or repriced, and nothing was pushed or deployed. FX was not
re-initialised.

## 0. How reads and writes were told apart (the acceptance rules, as corrected by the Owner)

1. **By the action contract, not by verb or name.**
   - Every request to `script.google.com/macros/` was paused **inside Chrome, before it left**, and
     classified by its `action`. The action was read from the query, the body and `km_body`. A request
     whose query action and body action disagree is blocked.
   - Only two kinds of action were let through, both read from `01_router.gs` at start-up:
     - the five `doGet` branches (`getOperationDb`, `getTable`, `getClientCapabilities`,
       `system.health`, `inventoryScope.registry.get`);
     - the 26 keys of `rtrGetReadHandlers_()`, the read table whose zero-write behaviour R4A1 asserts.
     The list is in `guard-allowlist.json`.
   - Anything else would have been failed in the browser (`BlockedByClient`) and never reached
     production.
   - **Result:** 24 requests, **24 contract reads, 0 blocked, 0 failed.** Every one was HTTP 200 through
     the `/exec` → `googleusercontent` echo. Each raw answer is saved, or its SHA-256 if over 1 MB.
2. **"No campaign option" is not evidence of missing data.** P2 compares the menu against the
   production `productPricing.workspace.get` response, field by field.
3. **SUPERSEDED is split by cause.** That is: a request replaced by a site switch; a source written
   since; a cycle or day change; cache expiry; a version change. IR reads the page's own read-only
   diagnostics, `_irRecoReadDiag_()`, `_irRecoAnswerSource_()`, `_irMatReadDiag_()` and
   `KM.DB.sourceWriteEpoch()`, for each step.
4. **A known OPEN item is not an automatic pass.** Each row says whether one affected it.

## 1. R55 dependencies — `system.health` (C2)

**The Owner reported their health check as passing, but its raw text was not included in the message,
so it is NOT saved here.** The agent's own read, made through the page's
`KM.DB.checkDeploymentContract()`, is saved as `bodies/0004-system.health.json` (server time
2026-10-22 10:15:05).

| field | expected (runbook §4) | production | |
|---|---|---|---|
| `deployment_release` / `build_id` | `…-R55` | `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55` | ✅ |
| `deployed_action_contract_version` | 21 | 21 | ✅ |
| `required_action_list_version` | 18 | 18 | ✅ |
| required actions | 50, including `fxRateBook.get` | 50, including `fxRateBook.get` | ✅ |
| `transport_contract_version` | 1 | 1 | ✅ |
| `mixed_deployment` | false | false (`UNIFORM`) | ✅ |
| `stale_modules` / `absent_modules` / `missing_actions` | `[]` | `[]` / `[]` / `[]` | ✅ |
| module stamps | all match | 34 of 35 match. The 35th is the **optional** `TEMP_migrate_shipping_allocation_ai_lifecycle.gs`, `present:false`, which is expected | ✅ |

The page check returned `DEPLOYMENT_CONTRACT_OK`. **C1 ✅:** no page showed
`DEPLOYMENT_CONTRACT_MISMATCH`. **C3 ✅:** reads only (§0).

## 2. PSB — Product Strategy → Category Analysis

The site was **ResUS / US / Amazon**: 100 listings, 11 campaigns in the table, 2 in scope. The
category was Electric Can Opener (12 models, 36 variants), plus Grinders for P2.

| # | result | evidence | what was observed |
|---|---|---|---|
| P1 | **PASS** | `P1-category-analysis.png` | The header reads `database read 2026-10-22 10:17 (Taipei)`. That equals the server `read_at` 1792635440671 = 10:17:20 Taipei. `prepared` appears nowhere in the DOM. After the reload in P8 it reads 10:29 |
| P2 | **PASS** — finding **F-1** | `P2-activity-menu.png`, `P2-grinders-fallprime.png`, `bodies/0010` | The menu lists exactly the 2 in-scope campaigns in the response, `CMP-808C4BD5-7` *BFCM 2026* and `CMP-E03D27B5-B` *Fall Prime 2026*, each with period and `recorded status: active`. Nothing shows `LIVE`. **Not invented:** GM3060, which is in no Fall Prime line, shows `—` in the table, has no diamond, and its tooltip says *Not in this activity*. GM3000 shows `31.99 *` and *4 of 5 variants*, matching the response (GM3000-R1 has no Fall Prime line). **Not exercisable here:** a currency mismatch, a duplicate row and a price conflict. This site's production data has none of them, so their marks were not seen. |
| P3 | **FAIL** — **F-2** | `P3-bfcm-chart.png`, `P3-tooltip-*.png` | **The values agree.** All 12 table *Activity price* cells, all 12 diamond label texts and both tooltips equal the response's BFCM `promo_price`. CO2100 is correctly *PRICED_PARTIAL*: `27.99 *`, the table pill *some variants*, the tooltip *3 of 6 variants*. **But one visible label is wrong.** CO5600-Q's label `44.79` runs 8 px past the SVG's right edge (text right 1395, SVG right 1387), so the chart shows **`44.7`** beside a table that says 44.79 |
| P4 | **PASS** | `P4-mid-drag.png`, `P4-after-drag.png`, `P4-typed-and-keys.png`, `snapshots/p4-*.json` | A real pointer drag of CO1150 (34.99 → 39.99) was checked in price units against the axis ticks. **During the drag and after:** only that point moved, all 24 floor/MSRP caps are unchanged, and the ticks (20–65) are unchanged. After release the original is shown hollow and dashed (*Original*). Typing 37.50 + Enter gives exactly 37.50. ↑ once gives 38.50, and ↓ twice gives 36.50 |
| P5 | **PASS** | `P5-*.png` | Undo goes back one step (38.50 → 37.50). With two simulated (CO1200 and CO1150), **Reset this product** resets CO1150 only. **Reset all** returns every point to the pre-drag snapshot and disables Undo and Reset all |
| P6 | **PASS** — one sub-item NOT RUN | `P6-two-competitors.png` | A price-only competitor (Rival A 33.00) draws a point and no band. A competitor with bounds (Rival B 45, 40–52) draws a band. Edit (33.00 → 34.00) and Delete both work. The table stays 12 rows and the KPIs are unchanged; neither mentions a competitor. The axis is unchanged. **NOT RUN: the two-currency panel.** Every category of this site is USD-only and one panel exists, so no production category could exercise it |
| P7 | **PASS** — see the method note | `P7a-mid-drag.png`, `P7b-*.png`, `P7d-*.png` | **(a)** Esc during a drag returns the point at once. The release commits nothing, with no readout or drag state left. **(b)** Leaving mid-drag left no drag, did not commit the interrupted drag, and kept the completed competitor in memory. The next ordinary drag then committed (CO1100 → 33.99). **(c)** Everyday, BFCM and Fall Prime each keep their own simulations, and the competitor exists only in Everyday. Going back to a context restores its own state. **(d)** After ResUS Amazon → Walmart → Amazon, Category Analysis shows 0 simulations and 0 competitors, in both Everyday and BFCM |
| P8 | **PASS** | `P8-after-reload.png`, `snapshots/p8-after-reload.json` | With 1 simulation and 1 competitor present, the page was reloaded. Afterwards: 0 and 0, and every point and cap equals the first-load snapshot |

**P7(b) method, stated plainly.** The site has no URL routing, and a pointer that is holding a drag cannot
also click a menu. So the departure was made by calling the Site Inventory menu's own handler,
`showSection('ops')`, while the button was held. The return was a real click on the *Category Analysis*
menu item.

**Observation O-1.** Opening *Category Analysis* from the side menu with no site chosen shows the site
picker. After a site is chosen, the board opens on **Executive Overview**, not Category Analysis. It
was not counted as a failure.

## 3. IR — Site Inventory

**Site A** was ResUS / US / Amazon, 100 SKUs. **Site B** was ResUS / US / Walmart, 18 SKUs. Submit was not
pressed. KM / US / KM Amazon was tried first as site B and holds **no SKUs**: the table shows *No SKUs
match*, and `recommendation.workspace.get` answers `MISSING_SKU_MAPPING`. Those two agree, which makes
it a data fact, not a defect. It cannot test a return, so Walmart was used.

| # | result | evidence | what was observed |
|---|---|---|---|
| I1 | **PASS** — finding **F-3** | `I1-siteA-loaded.png`, `snapshots/i1-siteA.json` | All 100 rows have Avg / Days of Supply / Suggested, with none PENDING. Example: CO1100-R 142.9 / 158.2 / 0. The answer is `SERVER READY REQ-C000004`, `calculationDate 2026-08-19`, cache `STORED`, source epoch `planning 0 / exposure 0`. The Avg title on 83 READY rows names the anchor 2026-08-19 and says the Gap date differs. That is D-S8-B3-186, **not a failure**. **F-3:** that Gap date prints as `2026-10-20T16:00:00.000Z` |
| I2 | **PASS** | `I2-siteB-walmart.png`, `I2-backA.png`, `I2-returned.png`, `snapshots/i2-*.json` | Steps: B, then back to A, then leave (PSB), then return. **Back to A:** cache `HIT` and the answer `SESSION_CACHE READY REQ-C000004`, the same request as I1. All 100 rows' Avg / DoS / Suggested are identical to I1. None is PENDING or blank. **After leave and return:** the same, again identical to I1 |
| I3 | **PASS** | `net.json` seq 60–63, `snapshots/i2-return.json` | **Back to A:** no request at all. **Return:** only the main `inventoryReplenishment.workspace.get` was re-sent. `recommendation.workspace.get` was **not** re-sent: cache HIT, reason `SERVED_REVISION_INCOMPLETE`. The gap read was **not** re-sent: `_irMatReadDiag_` gives `REUSE`, with 4 reader calls and 3 network reads |

**I3 — SUPERSEDED, by cause:**
- **No SUPERSEDED anywhere, and no UNKNOWN in the table.**
- **A request replaced by a site switch:** none. Each switch was made after the previous read had
  settled.
- **A source written since:** none. `sourceWriteEpoch` stayed `planning 0 / exposure 0`, and nothing was
  written.
- **A day change:** none. It was 2026-10-22 Taipei throughout.
- **Cache expiry:** not reached. Every return was a HIT.
- **A version change:** none. Handler `fm5-r4ui-r5e` was accepted throughout, under build R55.

**Recorded, not failed.** The cached answer is served with `revisionComplete: false`, because
`formulaVersion` and `sourceDataAsOf` are null in production. By design that is served and reported,
never read as "unchanged".

## 4. FC — FC Summary

**Forecast** and **history** are two separate views. The **Forecast** view is the stored
`fc_regular_forecast` (938 rows; 503 shown for 2026 under All filters). The **history** views
(*Actual* and *Achievement %*) are phase 1, with no source connected.

| # | result | evidence | what was observed |
|---|---|---|---|
| F1 | **PASS** — data finding **F-4** | `F1-fc-2026-forecast.png`, `bodies/0066` | The view loads with year 2026, *Showing 1-25 of 503 rows*. The month figures equal the response, e.g. CO1100-R Jan–Dec 8557 … 15000 |
| F2 | **PASS** | `F2-preview.png`, `F2-after-cancel.png` | Builder → Apply Growth Rate, CO1100-R, base 2026-10 (4282), +10%, target 2027-10. Preview shows `1 of 1 SKU(s) will change … 0 → 4,710`, which is 4282 × 1.1 = 4710.2 rounded. **Save was not pressed.** After Cancel the builder is gone and the table is identical to F1. Preview and Cancel sent **no request at all**. Opening the builder sent only 2 `getTable` reads |
| F3 | **PASS** | `F3-actual.png`, `F3-achievement.png`, `F3-builder-*.png` | In *Actual* and in *Achievement %*, all 300 visible month cells show `—`, titled *Historical sales are not connected yet (phase 2)*. **No number is shown.** Total FC and both Annual Share columns stay forecast. Switching back to *Forecast* gives a table identical to F1, so **the existing forecast figures are kept**. In the builder, *Last Year Same Month Actual* and *Interval Average* each refuse: `FC_HISTORY_METHOD_NOT_AVAILABLE`, nothing previewed and nothing saved |
| F4 | **PASS** | `F4-missing-base.png` | With base 2025-10 (there are no 2025 rows), the whole preview is refused **by name**: `CO1100-R 2025-10 BASE_ROW_MISSING — there is no forecast row for this SKU in that year`. Save stays disabled, and no 0 is offered |

## 5. Findings (none was fixed; each is for the Owner to schedule)

| id | where | what | severity, as observed |
|---|---|---|---|
| **F-1** | PSB menu and tooltip | Campaign periods print as raw JavaScript date strings, `Thu Nov 19 2026 00:00:00 GMT+0800 (台北標準時間)`. The response's `start_date` / `end_date` already arrive in that form, so the server serialises the sheet's Date with `toString()`. The days are right (Taipei midnight) | display |
| **F-2** | PSB chart | A deal-price label in the right-most column is clipped by the SVG edge: `44.79` reads as `44.7` (**P3 FAIL**). The same edge also clips the competitor header `Competitors · entered this session ·` (P6 screenshot) | **visible wrong value** |
| **F-3** | IR Avg title | The Gap date prints as an ISO UTC instant, `2026-10-20T16:00:00.000Z`. That is Taipei 2026-10-21 00:00, so a reader sees the 20th for a gap computed on the 21st | display, misleading date |
| **F-4** | FC data | CO1100-R 2026: the stored `total_fc` is 89964, but the twelve months sum to 89963. The page shows the sum, 89,963. That is a stored-total inconsistency in the data, not changed here | data |
| O-1 | PSB navigation | Side-menu *Category Analysis* opens Executive Overview after the site is chosen | observation |

**Known OPEN items:**
- **D-S8-B3-186** was seen as documented in I1. Its date *format* is F-3.
- **189 (K5)** was not touched by these steps.
- **190 (boot Escape listeners):** Escape behaved correctly in P7(a).
- **191 (duplicate chart-control ids):** not affected. Single panel, ids suffixed `-USD`.
- **187 and 188** were not exercised by these steps.

None was waived. None changed a result above.

## 6. Incidents during the run

- **Wrong-element click (IR, ~10:30).** A malformed helper call clicked the page's **first** `<button>`.
  That is the hidden mobile menu toggle `#kmNavOpen` (`toggleSidebar()`, not displayed). The click
  landed at viewport (0,0), on the blank header. **No request followed, the page was unchanged**
  (`I1-after-misclick-check.png`), and the network guard was active throughout. The click helpers were
  then changed to refuse hidden elements.
- **The `/stop` write of the driver** is where `net.json` and `console.json` come from. The console has
  90 entries, **all `log`**, with no error, warning or exception.

## 7. Outcome

| | PASS | FAIL | NOT RUN |
|---|---|---|---|
| Common C1–C3 | 3 | 0 | 0 |
| PSB P1–P8 | 7 | **1 (P3, F-2)** | sub-items only: P2 three data-dependent marks; P6 two-currency panel |
| IR I1–I3 | 3 | 0 | 0 |
| FC F1–F4 | 4 | 0 | 0 |

**Every read was a contract read, and nothing was written.** The one failure is visual (F-2). The values
behind it are correct in the DOM, the tooltip and the table.
