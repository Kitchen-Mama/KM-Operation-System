# S8-AVG-SALES-EVENT-EXCLUSION-AUDIT-R1

```
READ-ONLY. RUNTIME_MODIFIED = NO · CSS = NO · DB = NO · API = NO · DEPLOYED = NO
No fabricated sales were written anywhere. Every fixture is local to the audit suite.
VERDICT: the ENGINE is correct on every point asked. The DISPLAY WIRING has three gaps.
```

## §0 — THE ANSWER

**Yes, the exclusion works** — Special Event and Campaign dates are excluded from Avg. Sales/day, per SKU and
per site, start and end inclusive, overlaps counted once, cancelled records excluding nothing, and the
excluded days removed from **both** the numerator and the denominator. All 44 assertions pass against the
shipped engine, including the 2026-10-06 / 2026-10-07 scenario with missing days.

**What is wrong is not the maths, it is what reaches the screen.** The engine returns `source`, `warning`,
`normalDayCount` and `excludedDates`; the page drops all four at the workspace boundary. And before the
canonical basis resolves, the column shows the raw weekly rate — the one number §22 says must never be a
default.

---

## §1 — CANONICAL_FORMULA

`SUPPLY_PLANNING_CALCULATION_RULES.md` §22 / §22.1–§22.3 (CANONICAL v4.1):

```
Sales-Driven Avg Sales/Day
  = SUM(units over the selected days) / normal_day_count
  selected days = search BACKWARD within the latest 90 COMPLETED calendar days (calc date excluded),
                  collect the LATEST 30 ELIGIBLE NORMAL days,
                  skipping any day overlapping a Special Event / Campaign / Deal that applies to THIS SKU
  divided by the ACTUAL normal_day_count — never a fixed 30

ladder (§22.3)   >= 7 normal days -> source normalized_30d, warning ''
                 3-6              -> source normalized_30d, warning low_sample_warning
                 < 3              -> source weekly_7d,      warning insufficient_normal_days,
                                     value = sales_units_7d / 7
```

§22 is explicit that `weekly_7d` is **only** the `<3` rung — *"never a 'no-contamination default'"*. When a SKU
has no event in the window the excluded count is simply **0** and the same ladder still applies.

## §2 — ACTUAL_RUNTIME_FORMULA

**The engine is implemented**, in the shared pure calculation core:
`assets/js/core/supply-planning-calculations.js:290  normalizedAvgSalesPerDay(input)`.

Lineage to the screen:

```
amazon_daily_sales_snapshot + campaigns(+sku lines) + fc_special_events
  -> KMCALC.normalizedAvgSalesPerDay                       42_api_v1_recommendation_workspace.gs:304
  -> { avgSalesPerDay, source, warning, normalDayCount, excludedDates }                           :322
  -> horizonBasis.avgSalesPerDay                                                                  :351
  -> workspace line -> page passthrough                    inventory-replenishment.js:13554-13559
  -> _irCanonicalSalesBasis_(sku)  ->  _avgDisplay                                           :12265-12273
```

The page authors no rate of its own (asserted F1). There is a **second, local** function
`IR.avgSalesPerDay(weeklyRows, scope)` = `sales_units_7d / 7` which is used as the pre-resolution display and
for Forecast-Driven SKUs — see §9.

> **Documentation defect:** `SUPPLY_PLANNING_CALCULATION_RULES.md`'s §22 changelog still states *"Runtime
> remains NOT IMPLEMENTED; Executable Tests PENDING."* That is stale — the engine ships and this round
> executed it with 44 deterministic assertions.

## §3 — SPECIAL_EVENT_EXCLUSION — CORRECT

Matched on **exact Master SKU** and then on site: an event carrying `marketplaceId` is in scope **only** on an
exact `marketplace_id` match (no composite rescue); an event without one falls back to the **complete**
`company + country + marketplace` composite. An ID-bearing event against an unresolved scope **fails fast**
rather than being silently dropped — a silent drop would let contamination leak through as a false
out-of-scope. Verified: B1, C2, C3.

## §4 — CAMPAIGN_EXCLUSION — CORRECT

Matched on `campaign_sku_line.marketplace_sku_id === scope.marketplaceSkuId`, **never** on Master SKU alone. A
same-Master-SKU line missing `marketplace_sku_id` is treated as unresolved canonical identity and throws
rather than guessing. Verified: B1, C1.

## §5 — DATE_BOUNDARY

```
window            [calc - 90d, calc - 1d]  — the calc date itself is NEVER sampled        A6
range inclusivity BOTH start and end inclusive                                            D5
clipping          a range extending past the window edge is clipped, not rejected         D6
far edge          calc - 90 is in-window, but the sample takes only the LATEST 30         A7/A8
timezone          all dates are parsed and compared as ISO calendar dates in UTC
                  (_parseIso + MS_PER_DAY arithmetic, _isoOf for the key). There is no
                  marketplace-local timezone conversion anywhere in the engine.
```

> **Recorded, not a defect today:** the engine is timezone-free by construction — it compares calendar dates,
> and `amazon_daily_sales_snapshot.snapshot_date` is already a calendar date. A marketplace whose selling day
> does not align to UTC would need a local-day rule, and no spec defines one. Flagged as an open question,
> not a finding.

## §6 — SKU_SITE_MATCHING

Daily rows are isolated by the **persisted source natural key** (`snapshot_date + country + marketplace +
channel + sku`) **plus** the Analysis-Layer `company`, which is required and never inferred from
channel / country / marketplace. US holds both KM and ResUS, so country alone is insufficient. Two rows on one
source key resolving to different companies → **fail closed** (verified C4, the real thrown message is
quoted in the suite). A row of another resolved company is never sampled.

## §7 — NUMERATOR_DENOMINATOR_BEHAVIOR — CORRECT

Excluded days are removed from **both** sides. Proven numerically:

```
30 days at 10 units, with 2026-10-06 = 100 and 2026-10-07 = 200
  unexcluded                     (28x10 + 100 + 200) / 30   = 19.33     B0
  with both days excluded        280 / 28                   = 10.00     B2/B3
```

Missing vs zero are correctly distinct:

```
MISSING source date   absent from the sample; denominator 27, rate unchanged at 10        B5/B6
CONFIRMED zero row    an eligible day; denominator 28, rate falls to 9.64                 B7/B8
```

## §8 — CACHE_INVALIDATION

```
live Avg Sales   NOT CACHED. The API cache layer is memory-only with TTL = 0 — `get` always returns null
                 (km-api-foundation.js:266-270, "interface present, never actually caches"). Every Search
                 re-reads recommendation.workspace.get, so the rate is recomputed from live campaign/event
                 rows. An event edit is reflected on the next Search.
materialized     STALE UNTIL RECALCULATED. Suggested Qty comes from the persisted materialized gap
gap              (inventoryReplenishmentGap.get), refreshed by "Recalculate Current Scope / All Sites" or the
                 daily job — NOT by editing an event. This is the documented Analysis-Layer cadence
                 (§24.10), not a defect, but it means an event edit changes the displayed Avg Sales before it
                 changes Suggested Qty.
```

## §9 — SPEC_RUNTIME_DIFF — three display gaps, no engine gap

**D1 — the quality fields are dropped at the page boundary.** `horizonBasis` passthrough
(`inventory-replenishment.js:13554-13559`) keeps `demandMode`, `avgSalesPerDay`, `horizonOpeningQty`,
`qualifiedIncomingCount`. It drops **`source`, `warning`, `normalDayCount`, `excludedDates`** — all four of
which the backend returns (`42_...gs:322`). §22.3 makes `source` and `warning` *"fully decoupled … independent
fields"* precisely so both can be shown. Today an operator cannot tell a `normalized_30d` rate from a
`weekly_7d` one, cannot see `low_sample_warning`, and cannot see which dates were excluded. Verified F4–F7.

**D2 — the column defaults to the weekly rate before the canonical basis resolves.**
`var _avgDisplay = avg.toFixed(1);` (:12263) where `avg = IR.avgSalesPerDay(...)` = `sales_units_7d / 7`. If
the reco/gap chain has not yet answered, that uncorrected, **event-contaminated** number is what is on screen.
§22 forbids `weekly_7d` as a default. The shipped comment calls this "no regression", which is true of the
previous behaviour and not of the rule. Verified F8.
*Mitigation already present:* once a sales-driven basis IS resolved and its rate is null, the column shows
`--` rather than silently reverting (F10). The gap is the window before resolution.

**D3 — Forecast-Driven SKUs display the un-normalized weekly rate.** The override is gated on
`_canonBasis.demandMode === 'sales_driven'` (:12266, F9). §22.4 says Avg Sales is *auxiliary reference only*
for Forecast-Driven **and** that *"the normalization still applies to the displayed Avg Sales"*. So a
Forecast-Driven SKU's displayed Avg Sales is contaminated by its own event days.

**D4 — documentation.** §22's changelog still says Runtime NOT IMPLEMENTED / Executable Tests PENDING.

## §10 — TEST_RESULTS

`assets/tests/avg-sales-event-exclusion-audit-s8-r1.test.js` — **44 assertions, 0 failures**, executed against
the shipped engine. Sections: A window/baseline · **B the 2026-10-06 / 2026-10-07 dated scenario incl.
missing days** · C scope isolation · D status, overlap, boundaries · E the fallback ladder · F the page wiring.

## §11 — FIX_REQUIRED

```
ENGINE            NONE. Correct on all ten audited points.
DISPLAY           THREE gaps (D1, D2, D3). All frontend-only.
DOCUMENTATION     ONE stale changelog line (D4).
BACKEND/API/DB    NONE.
```

**D1 and D3 are mechanical** — carry four existing fields across a boundary they already cross, and extend the
override to Forecast-Driven as §22.4 requires. Neither needs a new calculation; the values already exist on
the response.

**D2 is a product decision, and it is why this round stops.** Three options, none chosen here:

* **(a)** show `--` until the canonical basis resolves — never display an uncorrected rate, consistent with the
  existing null handling, but the column is briefly empty on every Search;
* **(b)** show the weekly rate **labelled** as such (the `source` field D1 would carry makes this possible) —
  nothing is hidden and nothing is misread;
* **(c)** keep today's silent weekly default — simplest, and the one §22 explicitly forbids.

(b) is the smallest change that makes the screen honest and is the natural companion to D1. **It is not chosen
here**, because deciding what an operator sees while a rate is still loading is a product call, and because
§22.4's "normalization still applies to the displayed Avg Sales" has to be read against the Forecast-Driven
"reference only" framing before D3 is implemented. Both are business-rule readings, not code questions.

**STOPPED. No implementation.**
