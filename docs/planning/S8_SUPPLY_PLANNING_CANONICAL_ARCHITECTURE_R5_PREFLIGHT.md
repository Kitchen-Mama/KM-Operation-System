# S8 — SUPPLY PLANNING CANONICAL ARCHITECTURE R5 — PREFLIGHT

**Round:** S8-R5 · **Date:** 2026-10-08 · **Status:** PREFLIGHT — NOT IMPLEMENTED
**Supersedes:** all unexecuted S8 Supply Planning R3A / R4 / Consolidated instructions
**Source evidence:** `S8_SHARED_3PL_ALLOCATION_POLICY_PREFLIGHT_R3.md` (completed R3 audit)
**Boundary:** no runtime change, no DB write, no Apps Script sync, no deployment, no push.

---

## 1. R5_PREFLIGHT_STATUS

**COMPLETE — with three findings that change the roadmap's shape, not just its content.**

| Finding | Consequence |
|---|---|
| **The 90-day dated engine already exists and already obeys most of Part A.** `supply-planning-horizon-projection.js` (KMHP) over `supply-planning-time-phased-projection.js` (KMTPP) distributes monthly FC across real calendar days at full precision, rounds **once** at checkpoint emission, runs both demand modes, excludes Target % from Sales-Driven, and adds event FC at 100% un-target-adjusted. | R5-F is **adoption, not construction**. The work is wiring Inventory Replenishment's allocation path to the engine the recommendation path already uses. |
| **An activity beyond Day 90 can never be inside the 45-day capture window.** Capture opens at `start − 45..51` days; Day 90 is 90 days out. `51 < 90`, so the two sets are disjoint. | A6's cross-horizon double-count hazard is **arithmetically impossible** under the approved rule. This **removes** a decision gate. |
| **Campaign FC is not a second demand table.** `campaigns` / `campaign_sku_lines` is the promotion SSOT; `fc_special_events` is the supply-chain forecast SSOT; they are **linked** by `campaign_id` / `campaign_sku_line_id`, explicitly *not* two-way synced (`DATABASE_RELATIONSHIP_MAP.md`:192). | Adding "Campaign FC" as a separate additive term would **double-count every campaign already materialised into `fc_special_events`**. See §7. |

**STOP GATE honoured.** No runtime file, spec file, or DB row was modified. No sweep was run concurrently with another task (Part J).

---

## 2. FINAL_CANONICAL_BUSINESS_RULE_MATRIX

| # | Rule | Source | Shipped state |
|---|---|---|---|
| A1 | Planning horizon = future 90 calendar days, dated | R5 A1 | **EXISTS** (KMHP D18/D30/D45/D90); IR allocation path still 18-day aggregate |
| A1b | 18 days is a coverage benchmark, not an allocation pass | R5 A1 | **CONFLICT** — `_allocateShared` makes it the entire allocation |
| A1c | Do not extrapolate demand past Day 90 to exhaust stock | R5 A1 | **CONFORMANT** — KMHP stops at maxN |
| A2 | Forecast-Driven: Regular FC + monthly Target % by each demand date's month | R5 A2 | **EXISTS** in KMHP; **PARTIAL** in IR (`_irForecastPlanning2mo`, flat 2-month average) |
| A2b | Sales-Driven: Target % **INACTIVE** | R5 A2 | **CONFORMANT** in KMHP and IR |
| A3 | Avg Sales canonical for **both** modes | R5 A3 | **FRONTEND DONE** (S8-R2); **BACKEND BLOCKED** (`42_:699`) |
| A4 | Target Rules stay monthly; re-resolve at month boundary; never on event/campaign FC | R5 A4 | **CONFORMANT** — KMHP keys FC per `YYYY-MM`; events bypass target |
| A5 | Event + Campaign FC = additional demand at 100%, never target-adjusted | R5 A5 | **CONFORMANT for events**; **campaign term is a double-count hazard** (§7) |
| A6 | Capture = Monday of the week containing `start − 45d` | R5 A6 | **CONFLICT** — shipped rule is a raw `start − 30d`, no Monday snap |
| A6b | Do **not** consume physical stock on the capture date | R5 A6 | **VIOLATED** — KMHP places 100% of event demand *on* `prepDate` |
| A7 | Event demand timing must be classified | R5 A7 | **CLASSIFIED** — §8; it is a replenishment-timing transform used as a consumption transform |
| B1 | Platform stock planned independently; never show 3PL as platform on-hand | R5 B1 | **CONFORMANT** (§23.6/§24.9 lanes; `_tpBreakdown` separation) |
| B2 | Pool = Company + Country + Master SKU + eligible warehouse | R5 B2 | **CONFORMANT in IR**; **VIOLATED in `request-order.js:489`** |
| B3 | Fulfillment hierarchy, fail closed under hybrid | R5 B3 | **1 of 3 resolvers conformant** (§18) |
| B4 | Allocation is DATE-MAJOR, rank ascending, proportional within rank | R5 B4 | **NOT IMPLEMENTED** — shipped engine is a single weighted aggregate |
| B4b | Rank is ordering, not a multiplier | R5 B4 | **VIOLATED** — `minNeed × MAX(priority,1)` is literally a multiplier |
| B5 | `Allocated + Residual = Eligible Physical Pool`, integers | R5 B5 | **CONFORMANT** in IR; residual currently 370/1000 in the §F1 case |
| C1 | Accumulate fractional demand; integerise at one canonical boundary | R5 C1 | **EXISTS** in KMHP (`hround` at checkpoint emission only) |
| C2 | Coverage from dated projection; future inbound ≠ Day 1 stock | R5 C2 | **INBOUND CONFORMANT**; **coverage outputs do not exist** (§14) |
| D1-D5 | Admin rank governance | R5 D | **GREENFIELD** — no Administration page exists (§15) |
| E | Request Order company isolation | R5 E | **DEFECT CONFIRMED** (§17) |
| F | Option C display | R5 F | **BLOCKED** on per-row column model (§19) |

---

## 3. SPEC_CONFLICT_MATRIX

| # | Conflict | Current source | Approved replacement | Runtime consumers | DB | Tests | Release |
|---|---|---|---|---|---|---|---|
| **C-01** | 18-day vs 90-day planning | `SUPPLY_PLANNING_CALCULATION_RULES.md` §24.4-24.7; `inventory-replenishment.js:679` | 90-day dated; 18d = benchmark | IR page, `_allocateShared` | none | 53 suites | R5-F |
| **C-02** | Priority weight vs rank | §24.7:1026-1028 `priority_factor = MAX(p,1)` | rank ordering only | 6 comparators, IR | none | §40 112 frozen | R5-G |
| **C-03** | Higher-number vs lower-number | §20.4:771 · `INVENTORY_TABLE_MAPPING_SPEC.md` §16 R6 · `DATABASE_RELATIONSHIP_MAP.md`:32 | **smaller = higher** | all of the above | **value semantics flip** | 53 suites | R5-E |
| **C-04** | Monthly Target Rule applicability | §20.4 / §7 | monthly, per demand date's month | KMHP, KMPD, IR | none | fc-target-rule suites | R5-A |
| **C-05** | Sales-Driven Target % | — | **disabled** (already true) | KMHP `demandMode` | none | none | **no change** |
| **C-06** | Activity FC 100% additional | §24.2 / KMPD | 100%, never targeted (already true) | KMHP, KMPD | none | none | **no change** |
| **C-07** | 45-day Monday capture | `supply-planning-planning-demand.js:29` `= 30` (and `90_:12061`) | `Monday(start − 45d)` | KMPD, KMHP, 90_ bundle | none | KMPD suites | R5-A + R5-F |
| **C-08** | Event demand date vs capture date | KMHP:96-100 places 100% on `prepDate` | capture ≠ consumption (A6b) | KMHP, KMTPP | none | horizon suites | R5-F |
| **C-09** | Activity double counting | `DATABASE_RELATIONSHIP_MAP.md`:192 link model | **one term only**, dedup by `campaign_sku_line_id` | KMPD | none | new | R5-A |
| **C-10** | Platform vs 3PL stock | §23.6 / §24.9 | unchanged | allocations.js lanes | none | none | **no change** |
| **C-11** | Hybrid fulfillment | 3 resolvers (§18) | unify on `42_` semantics | IR, 42_, 90_ | none | 42_ suites | R5-H |
| **C-12** | Fractional demand rounding | §24.4 `CEILING(daily×18)` per site | cumulative, one boundary | IR | none | 53 suites | R5-F |
| **C-13** | Coverage Days | none exists | dated first-shortage (§14) | new | none | new | R5-F |
| **C-14** | Cross-company stock isolation | `request-order.js:428` | company required | Request Order | none | new fixtures | R5-C |
| **C-15** | Administration rank governance | none exists | ordered groups → derived rank | new page + API | **new write path** | new | R5-D |
| **C-16** | Submitted-plan immutability | §24.10 | preserved | drafts | none | existing | all |

**Nothing in this matrix was written into a spec in this round.** Each row is a proposal awaiting approval.

---

## 4. NINETY_DAY_DAILY_PLANNING_CONTRACT

**Adopt `KM.core.horizonProjection` (KMHP) as the single dated engine.** Verified by execution, not inspection:

```
calculationDate 2026-10-08, opening 2000, FC 3100/3000/3100/3100 (Oct..Jan), UPC 12

  D18  by 2026-10-26   demand 1800   covered 1800   gap    0   suggested    0
  D30  by 2026-11-07   demand 3000   covered 2000   gap 1000   suggested 1008
  D45  by 2026-11-22   demand 4500   covered 2000   gap 2500   suggested 2508
  D90  by 2027-01-06   demand 9000   covered 2000   gap 7000   suggested 7008
```

Properties that already satisfy Part A and Part C, confirmed in source:

- **No clock.** `calculationDate` is supplied by the caller; the module contains no `Date.now`, no `new Date()`, no timezone. Deterministic replay (fixture 25) is structural.
- **Real month lengths**, leap-aware (`daysInMonth`), never a fixed 30.
- **Full precision per day**, integerised **once** at checkpoint emission (`hround`) — exactly C1's "single canonical boundary".
- **Missing FC is `UNAVAILABLE`, never a fabricated 0** (`windowHasMissing`).
- **Fails closed** on unknown `demandMode` and on `sales_driven` without a finite rate.

**What is missing and must be built:** per-day *output* (KMHP emits only the four cumulative checkpoints), the coverage outputs of §14, and the multi-site allocator of §12 — which sits **above** KMHP, consuming one projection per site.

---

## 5. FORECAST_VS_SALES_DRIVEN_CONTRACT

| | Forecast-Driven | Sales-Driven |
|---|---|---|
| Daily regular demand | `Target%-adjusted monthly FC ÷ that month's real days` | flat `normalizedAvgSalesPerDay` |
| Target % | applied, per the demand date's own month | **never** |
| Missing basis | month omitted → window `UNAVAILABLE` | `SALES_BASIS_UNAVAILABLE`, fail closed |
| Event FC | additive, 100%, un-targeted | additive, 100%, un-targeted |

**Already correct in KMHP.** The conflict is confined to the IR page, where `_irForecastPlanning2mo` flattens months +1 and +2 into one average and feeds `_allocateShared`. Mode is never switched by allocation in either path — A2's final clause holds.

---

## 6. MONTHLY_TARGET_RULE_CONTRACT

Rules stay monthly; **no daily Target Rule table is needed**, confirmed. Resolution is per `YYYY-MM`, so crossing a month boundary re-resolves structurally (`regularFcByMonth` is keyed by month; KMHP looks up `dISO.slice(0,7)` for each day).

- Applied **only** to Forecast-Driven regular FC (`adjustedRegularFc`, planning-demand.js:205).
- **Never** to Special Event FC — `scopedSpecialEventPreps` returns raw `fc_qty`, and KMHP's comment states "never target-adjusted".
- **Never** to Campaign FC — see §7; there is no second campaign demand path to target.
- **Double application is structurally prevented**: the target multiply happens once, in `adjustedRegularFc`, before the daily division. Events bypass that function entirely.
- Missing monthly rule → `resolveTargetPct` returns `null` → `adjustedRegularFc` returns `null` → the month is missing → the window is `UNAVAILABLE`. **Canonical refusal preserved; no conflict found, so it is left unchanged** per A4's final clause.

---

## 7. EVENT_CAMPAIGN_100_PERCENT_DEMAND

```
Effective Demand(date) = Regular Demand(date)
                       + Eligible Activity FC(date) at 100%
```

**One activity term, not two — and this is a correction to the task's framing, offered because A5 itself asks to prevent exactly this double count.**

`DATABASE_RELATIONSHIP_MAP.md`:192 states the model: `campaigns` + `campaign_sku_lines` is the **promotion** source of truth; `fc_special_events` is the **supply-chain forecast** source of truth; they are **linked** by `campaign_id` / `campaign_sku_line_id` and explicitly *not* blind two-way synced. The FC Summary Special Event Builder writes `campaigns` → `campaign_sku_lines` → `fc_special_events` in sequence (:195).

So a campaign that has been through the Builder **already exists as `fc_special_events` rows**. Summing "Special Event FC + Campaign FC" would count it twice.

**Recommended contract:** `fc_special_events` is the sole demand-bearing activity source. A `campaign_sku_lines` row with no linked `fc_special_events` row is an **un-forecast campaign** — surface it as a planning *warning*, never as silent demand. Dedup key = `campaign_sku_line_id` where present, else `event_fc_id`.

Verified additive at 100% and un-targeted (fixture F3): adding a 500-unit event raises D18 demand from 1800 to 2300 and D18 gap from 0 to 300. Exactly +500, no target multiply.

Scope mapping is preserved by `eventScopeMatch` (planning-demand.js:224): SKU, company, country, marketplace, with dead statuses excluded.

---

## 8. EVENT_45_DAY_MONDAY_CAPTURE

```
capture_reference_date = activity_start_date − 45 calendar days
capture_start_date     = Monday of the calendar week containing capture_reference_date
```

The Monday snap always moves capture **0–6 days earlier**, so the effective lead is **45–51 days** — more conservative, never less. Confirmed:

```
calculationDate 2026-10-08 (Thu)      Day 90 = 2027-01-06

  activity start   −45d            Monday snap        shipped (−30d)
  2026-12-01       2026-10-17 Sat  2026-10-12 Mon     2026-11-01
  2027-01-20       2026-12-06 Sun  2026-11-30 Mon     2026-12-21
  2027-02-15       2027-01-01 Fri  2026-12-28 Mon     2027-01-16
```

### 8a. The cross-horizon hazard cannot occur

A6 asks for examples of an activity **outside** Day 90 that is **inside** the capture window. **There are none, and there cannot be.**

```
capture open today   requires   start <= today + 51
beyond Day 90        requires   start >  today + 90
51 < 90              =>         the two conditions are disjoint
```

The capture lead (45–51 days) is strictly shorter than the horizon (90 days), so every activity in its capture window is already inside the 90-day ledger. **The double-count A6 guards against is unreachable** — this removes a decision gate rather than adding one. It would only reappear if the horizon were shortened below ~51 days or the capture lead extended beyond 90.

### 8b. Two real conflicts remain

- **C-07 — the shipped offset is 30 days, not 45, and there is no Monday snap.**
  `supply-planning-planning-demand.js:29` and `90_generated_supply_planning_bundle.gs:12061` both hold
  `SPECIAL_EVENT_PREP_OFFSET_DAYS = 30`. Changing it touches a **generated Apps Script bundle**, which
  carries its own release cut.
- **C-08 — capture currently *consumes* stock, which A6 forbids.**
  KMHP places **100% of the activity's demand as a demand event on `prepDate`** (horizon-projection.js:96-100).
  A6 says "Do not automatically consume physical stock on the capture date. Activity demand consumption
  remains tied to the actual activity demand schedule." These are incompatible as built.

---

## 9. AI_SUPPORT_PARITY

AI Support consumes the recommendation workspace (`42_`) and the weekly AI plan (`61_`), both of which already
read KMHP-derived windows and `allocationPriority`. Parity therefore follows automatically for A1/A2/A4/A5
once IR adopts the same engine — **they are already on it; IR is the outlier.**

The two divergences AI Support inherits today are `42_:699` (§10) and the priority direction (§12). No
third, AI-specific calculation path was found.

---

## 10. AVG_SALES_BOTH_MODELS

Frontend landed in S8-R2: display opens at `--`, takes the canonical §22 rate for both demand modes, and
carries `source` / `warning` / `normalDayCount` / `excludedDates` as independent fields.

**Backend still blocked.** `42_api_v1_recommendation_workspace.gs:699`:

```js
avgSalesPerDay: (planModel === 'sales_driven' ? salesRate : null)
```

and `horizonBasis` never emits the four diagnostic fields. Until this one line changes, Forecast-Driven
SKUs show `--`. This is **R5-B**, a backend-only release, and it must not be bundled with planning-demand
changes (A3's final clause).

---

## 11. PLATFORM_VS_3PL_STOCK_CONTRACT

Unchanged and already conformant. `FBA` and `THREE_PL` are separate lanes with no cross-lane fallback
(§24.9 / §40.8); a `platform_fulfilled` receiver may draw a `THREE_PL` reserve, emitted as a distinct
record with `allocationReason: THREE_PL_REPLENISHMENT_RESERVE`, and that never reclassifies the supply as
FBA current stock. `supply-planning-allocations.js:239` uses `fulfillmentModel` **only** for that reason
label, never to gate eligibility — correctly distinguishing fulfillment mode from reserve eligibility (B3's
final clause). **No change proposed.**

---

## 12. DAILY_RANK_ALLOCATION_CONTRACT

```
ALLOCATE(company, country, masterSku, calculationDate) :
  pool = eligible physical 3PL pool (company + country + 3PL + is_active)
  for each site s : proj[s] = KMHP.projectHorizons(... per-site demand ...)   # dated, full precision
  remaining = pool ; alloc[s] = 0
  for d = 1 .. 90 :                                   # DATE-MAJOR
      if remaining <= 0 : break
      for group in ranks ascending :                  # smaller number first
          if remaining <= 0 : break
          want[s] = outstanding effective demand of s on day d
          if SUM(want) <= remaining : serve all
          else                      : largest-remainder proportional to want
          remaining -= allocated
  residual = remaining                                # B5: explicit, never fabricated demand
```

**Rank is an ordering key only.** It appears in no arithmetic expression — the shipped
`minNeed × MAX(priority,1)` multiplier is removed, satisfying B4's "Rank is not a demand multiplier".

**"Never allocate one site's entire 18-day demand before other sites' Day 1"** is satisfied structurally:
the loop is date-major, so day *d+1* is unreachable until day *d* is served for every rank group. The
18-day protection the old engine coded explicitly becomes **emergent** — which is why A1 can demote 18 days
to a benchmark without losing the protection it provided.

---

## 13. CUMULATIVE_ROUNDING_PROPOSAL

**Recommendation: cumulative carry-forward with a single integerisation boundary — the rule KMHP already
implements.** Comparison against the alternative:

| | Cumulative floor + carry (recommended) | Per-day CEILING (shipped, §24.4) |
|---|---|---|
| Low-volume SKU (0.4/day × 3 sites) | 18-day need 21.6 → pool 22 **covers** it | `CEIL(7.2)=8` ×3 = **24** → false SHORTAGE |
| Rounding events | one, at emission | one per site per window |
| Conservation | `Σ alloc + residual = pool` exactly | inflation up to *N sites* units |
| Replay stability | exact | exact but inflated |
| Rank semantics | preserved (ordering applied to exact reals) | distorted (ceiling changes the weights) |

**Exact algorithm.** Accumulate exact real demand per site across dates; allocate against exact reals;
integerise once at the end by deterministic largest remainder, tie-broken by (larger fraction → smaller
rank → stable site key). This preserves daily chronology (the loop is still date-major), rank semantics,
equal-rank proportionality, integer conservation, and low-volume fairness.

**D-3 resolved by this choice:** `CEILING(daily × 18)` disappears, so the mode-flip of fixture F11 cannot
occur.

**Open sub-decision (D-6a):** whether a *displayed* per-day figure is also integerised. Recommendation: no —
publish exact reals per day and integers only at the allocation boundary, so daily figures sum to the total.

---

## 14. COVERAGE_DAYS_FORMULA

**Does not exist today** — KMTPP emits no coverage or first-shortage output, and the IR page shows only
`daysOfSupply(currentStock, avgPerDay)`, a flat ratio.

Proposed, from the dated projection:

```
balance(0)  = valid available inventory                      # future inbound NOT included
balance(d)  = balance(d-1) + inbound_at(d) - effectiveDemand(d)

First Shortage Date     = min d where balance(d) < 0, else null
Continuous Coverage Days= (First Shortage Date - calculationDate) - 1, else >= 90
Projected End Balance   = balance(90)
Total Unmet Demand      = SUM over d of max(0, -balance_uncarried(d))
Suggested Qty           != Total Unmet Demand   # carton/MOQ/lead-time constraints still apply
```

Worked from the §4 fixture (opening 2000, 100/day from 2026-10-09): balance reaches 0 on 2026-10-28,
**First Shortage Date = 2026-10-29**, **Continuous Coverage Days = 20**. Consistent with the engine's
`D18 gap = 0` and `D30 gap = 1000`.

`Inventory ÷ Avg Daily Demand` is retained **only as a labelled secondary estimate**; it equals the
chronological answer only when demand is flat, which is exactly when it is uninformative.

---

## 15. ADMIN_PRIORITY_UI_API_PREFLIGHT

**Greenfield, and larger than it looks.**

- **There is no Administration page.** Pages present: `automation-schedule, campaign-risk, carrier-rate-card,
  factory-stock, fc-summary, forecast, global-logistics-map, home, inventory-replenishment, overseas-inbound,
  overseas-ops-preview, overseas-outbound, overseas-stock, product-strategy-board, purchase-order-list,
  purchase-order-overview, request-order-draft, request-order, shipping-history, shipping-plan, sku-details,
  sku-handbook, sku-regional-details, sku-regional-pricing, supplychain`. Marketplace master editing lives
  **inside `inventory-replenishment.js`**.
- **`allocation_priority` has no input field in any HTML**, and `saveMarketplace()` does **not** send it
  (payload carries `marketplace_display_name`, `fulfillment_model`, …, but not `allocation_priority`).
  The field is reachable only by direct API call. That is why §16's census matters so much.
- **No admin/permission spec exists** beyond `DEPLOYMENT_RELEASE_GOVERNANCE.md`; the authorization model
  for D2's "Authorized Admin-only editing" has **no current owner** and is a decision, not a lookup.

**Proposed contract.** Persist the **ordering**, derive the rank:

```
marketplace_allocation_priority_groups   group_id, company, country, group_order, status, updated_by/at
marketplace_allocation_priority_members  group_id, marketplace_id

effective_rank(marketplace) = dense ordinal of its group within (company, country), 1-based
  => 1..100, integer, equal within group, deterministic, no decimals/negatives
  => reject a configuration with more than 100 groups in one (company, country)
```

`marketplaces.allocation_priority` remains the **single canonical persisted rank** (D3's "no second
independently authoritative ranking model"); the group tables are the *input*, the column is the *derived
output*. One translation, one direction.

---

## 16. EXISTING_PRIORITY_CENSUS

**NOT RUN — and deliberately so.** D4 requires a read-only census first, and reading production is outside
this round's boundary (Part J: no production reads of live planning state were performed).

What the source already tells us, which shapes what the census will find:

- No UI writes the field, so most rows are likely **blank or 0**.
- `0` is simultaneously a legal stored value and the missing-value sentinel (`|| 0` in IR; `!= null ? : 0`
  in `43_:641`/`:727`). Under "smaller = higher", a stray `0` becomes the **top** rank.
- There is **no validation at any writer** — `03_:599` takes `body.allocation_priority` verbatim: no
  integer check, no range check, no sign check.

**Census query to authorise (read-only):** distinct `allocation_priority` values with row counts, grouped by
`company` + `country`, plus a count of blank/0/non-integer/out-of-range values. One `getTable` read.

**D4 is honoured:** no automatic reversal is proposed. The census feeds an Admin confirmation flow; the user
confirms an ordering; only then is a rank derived.

---

## 17. REQUEST_ORDER_COMPANY_ISOLATION

**Defect confirmed and bounded.**

`request-order.js:428` `thirdParty(sku, country)` filters on SKU and **warehouse country** (:437), excludes
factory warehouses (:438-439), and refuses rows whose warehouse is unknown (:440-441) — but takes **no
company argument at all**. Called at :489 as `thirdParty(m.sku, m.country)`.

Two violations in one call:

1. **Cross-company leakage** — in the US, a Kitchen Mama row sums ResUS 3PL stock and vice versa.
2. **Raw pool, repeated** — the undivided pool is printed on **every** marketplace row for that SKU, the
   same "one pool shown N times" defect Site Inventory was repaired for in F1-7N-FB-4E-R4B-R1.

**Blast radius — display only.** The row that consumes it is flagged `_dbPlaceholder: true`, and `risk`,
`remaining`, `suggestedOrder` are all explicit `null` placeholders with no formula. No draft quantity and
no persisted order reads this value. **Submitted orders and snapshots are unaffected.**

Other 3PL read paths audited and **clean**: `overseas-stock.js` (physical warehouse view, a different
domain by design), `factory-stock.js:665` (explicitly never reads overseas), `overseas-ops-preview.js`
(bounded preview). `forecast.js:1487` is `Math.random()` demo data, not a DB read.

**Minimal repair (R5-C):** add the company parameter, require a warehouse company match, and consume the
allocation rather than the raw pool. Fixtures: identical SKU + identical country + two companies.

---

## 18. HYBRID_FULFILLMENT_RESOLUTION

| Resolver | Hierarchy | Fail closed | Verdict |
|---|---|---|---|
| `recoWsResolveFulfillment_` + `recoWsFulfillmentModelBySku_` (`42_:404`/`:395`, gate `:911`) | correct — SKU consulted **only** when marketplace = `hybrid` | **YES** — `DESTINATION_AUTHORITY_UNRESOLVED` | **canonical** |
| `IR.resolveFulfillment` (`inventory-replenishment.js:870`) | correct | **NO** — hybrid + missing SKU returns `'hybrid'`; unknown marketplace falls back to SKU | fail-open |
| `90_generated_supply_planning_bundle.gs:5292` | **wrong** — reads `marketplace_skus.fulfillment_model` unconditionally, never consults `marketplaces` | n/a | violates B3 rules 1-2 |

**Unify on `42_` semantics.** Rule 7 (never infer from marketplace name) is satisfied everywhere — no
name-based inference exists in any path. Rule 8 (company + country) is preserved in all three.

---

## 19. OPTION_C_DISPLAY_PREFLIGHT

Approved display is unchanged from the Option C preflight. The blocker is structural:

`_irApplyInventoryColumnModel` toggles **one class on the whole table**
(`tbl.classList.toggle('ir-hide-current-stock', …)`, :1740), and `_irScopeFulfillmentModel()` (:1727)
resolves the **marketplace-level** model only. A hybrid marketplace therefore renders the full 3-column
Inventory group for **every** SKU, including its `self_fulfilled` ones. **Mixed fulfillment in one table is
structurally impossible today** — this is a per-row column-model redesign, not a resolver fix.

Constraints the redesign must preserve, all currently load-bearing: `data-leaf-span` as the **structural**
body-cell count (repaired in S8-R2 — it must keep meaning the one thing `_irVerifyRenderedRows_` reads it
for), header/body cell-count parity, sorting, filtering, export, the render-integrity guard, and the
stale-state / epoch protections.

---

## 20. DB_MAPPING_RUNTIME_IMPACT

| Table / column | Change | Risk |
|---|---|---|
| `marketplaces.allocation_priority` | **no schema change**; semantics flip; values re-derived from Admin ordering | **high** — existing values mean the opposite |
| `marketplace_allocation_priority_groups` / `_members` | **new tables** (R5-D) | new write path, needs authorization model |
| `fc_special_events` | **no change**; becomes the sole demand-bearing activity source | — |
| `campaign_sku_lines` | **no change**; unlinked rows surface as warnings | — |
| `fc_target_rules` | **no change**; stays monthly | — |
| materialized gap rows | `allocation_priority` is **persisted** (`43_:641`) under the old direction; **must not be rebuilt** in R5-A..E | silent re-interpretation if rebuilt early |
| `request_order_allocation_drafts` / `_lines` | **no change**; §24.10 snapshots protect submitted plans | — |

**API:** `GET` marketplaces shape unchanged, meaning changed. `POST` create gains a default and a new
validation refusal. Recommendation-workspace line shape unchanged.

**Apps Script ownership:** `03_`, `42_`, `90_` and the generated bundle are each operator-owned release
surfaces. `90_` is **generated** — changing `SPECIAL_EVENT_PREP_OFFSET_DAYS` there requires a bundle rebuild,
not a hand edit.

**Cache tokens:** frontend-only batches rotate the application token
(55 refs in `index.html` + 8 in `app.js`). IR-CSS rotates only if a stylesheet byte moves — none of the
proposed batches requires that except R5-H.

---

## 21. NUMERICAL_FIXTURE_RESULTS

Executed against the real modules where one exists; "proposed" marks a contract with no implementation yet.

| # | Fixture | Result |
|---|---|---|
| 1 | Forecast-Driven + monthly Target % | **KMHP executed** — D18 1800 / D30 3000 / D45 4500 / D90 9000 |
| 2 | Sales-Driven, Target % disabled | **KMHP executed** — identical totals from a flat 100/day; no target path reachable |
| 3 | Event FC +100%, no Target | **KMHP executed** — +500 event raises D18 demand 1800→2300, gap 0→300. Exactly +500 |
| 4 | Campaign FC +100% | **CONTRACT CHANGE** — no separate term; dedup by `campaign_sku_line_id` (§7) |
| 5 | Regular + Event + Campaign combined | follows 3+4; one activity term |
| 6 | Capture Monday, 45d before start | **computed** — start 2026-12-01 → ref 2026-10-17 (Sat) → **capture 2026-10-12 (Mon)** |
| 7 | Activity outside 90d, inside capture | **IMPOSSIBLE** — proven disjoint (§8a) |
| 8 | Oct/Nov Target transition | per-month keys; Oct 31d → 100/day, Nov 30d → 100/day; re-resolved at boundary |
| 9 | Dec/Jan transition | same mechanism across the year boundary (`nextDay` rolls `y`) |
| 10 | Equal Rank groups | **executed** — both engines agree exactly (pool 200, p=10/10 → A 133 / S 67) |
| 11 | Different Rank groups | **executed** — divergence is entirely priority-spread driven |
| 12 | Pool 630 / 400 / 200 / 100 | **executed** (table below) |
| 13 | Fractional daily demand | **executed** — 20.4/10.3/5.1, pool 100 → proposed A 61 / S 29 / T 10 vs shipped A 3 / S 16 / T 81 |
| 14 | Cumulative rounding | **proposed** — one boundary; §13 |
| 15 | Day 1 shortage | date-major loop allocates rank 1 first on day 1; lower ranks get 0 that day |
| 16 | Day 18 boundary | **executed** — D18 is a reporting checkpoint; `gap=0` while covered |
| 17 | Day 19–90 continuation | **executed** — D30/D45/D90 continue from the same ledger |
| 18 | Excess stock residual | **executed** — pool 1000, need 630 → proposed residual 0 after 90d; shipped leaves 370 unallocated |
| 19 | Zero demand | **executed** — shipped returns `NO_DEMAND`, allocates nothing; proposed identical |
| 20 | Future-dated inbound | **KMHP executed** — 3000 @ 2026-11-15: incoming 0 at D18/D30, 3000 at D45/D90. **Not Day 1 stock** |
| 21 | Platform / self / hybrid | §18 — one conformant resolver of three |
| 22 | Same SKU+Country, different Company | **defect** — `thirdParty` returns 1000 to both (§17) |
| 23 | Admin reorder / grouping | **proposed** — §15 |
| 24 | Rank validation + default placement | **no validation exists today**; new marketplace → lowest group |
| 25 | Deterministic replay | **structural** — KMHP reads no clock |
| 26 | Physical stock conservation | **executed** — `Σ alloc ≤ pool` proven in shipped engine; residual explicit in proposed |
| 27 | No double Target application | **structural** — single multiply in `adjustedRegularFc`; events bypass it |
| 28 | No duplicate activity demand | **requires §7's dedup key**; not currently enforced |
| 29 | Coverage Days / first shortage | **computed** — opening 2000, 100/day → first shortage 2026-10-29, coverage 20 days |
| 30 | Submitted snapshot immutability | §24.10 snapshots at Submit; no proposed batch writes drafts |

**Fixture 12 — machine-verified both columns** (sites Amazon p1 20/day, Shopify p10 10/day, Target p100 5/day):

| pool | coverage | shipped A/S/T | proposed A/S/T |
|---|---|---|---|
| 1000 | 159% | 360 / 180 / 90 (residual 370) | 580 / 280 / 140 (residual 0) |
| 630 | 100% | 360 / 180 / 90 | 360 / 180 / 90 — **identical** |
| 400 | 63% | **130 / 180** / 90 | 235 / 110 / 55 |
| 200 | 32% | 42 / 68 / **90** | 120 / 55 / 25 |
| 100 | 16% | **3** / 16 / **81** | 60 / 30 / 10 |

At 63% coverage the shipped engine already gives Shopify more than Amazon although Amazon carries twice the
demand — plausible-looking numbers, already inverted. At 16% a default-100 marketplace takes 81% of the pool.

---

## 22. REGRESSION_BLAST_RADIUS

- **53 of 622 suites** reference `allocationPriority` / `allocation_priority`, including the **112 frozen
  §40 assertions** (`supply-planning-allocations.test.js`) and the golden-scenario suite. A direction flip
  fails them **by construction** — they encode the current direction as the expected result.
- **21 runtime files** carry the field.
- Horizon/KMPD suites additionally gate the 30→45 day offset and the Monday snap.
- **Baseline:** 622 suites, 6 failing (`BASELINE_FAILURE_SET`, byte-identical FAIL lines, re-confirmed at
  `0511b9b`). Any batch must return to exactly this set.
- **Mutation requirement:** each restated assertion needs a mutant proving it still catches the inversion —
  restating an assertion to match new behaviour without a mutant is how a gate becomes decorative.
- Part J honoured: **no mutation-heavy sweep was run in this round.**

---

## 23. SAFE_IMPLEMENTATION_BATCHES

Dependency-ordered. Two changes to the proposed sequence, both forced by evidence:

| Batch | Content | Depends on | Surface |
|---|---|---|---|
| **R5-A** | Spec reconciliation (§3 matrix), activity dedup contract, 45d Monday capture **as specification only** | — | docs |
| **R5-B** | Avg Sales backend correction (`42_:699` + 4 diagnostic fields) | — | Apps Script, own cut |
| **R5-C** | Request Order company isolation | — | frontend |
| **R5-D** | Administration page + priority group tables + API + authorization model | R5-A | frontend + Apps Script + **new DB** |
| **R5-E** | Priority census → operator confirmation → rank derivation | R5-D | read, then one write |
| **R5-F** | 90-day dated engine **adoption** in IR + coverage outputs + capture/consumption split | R5-A | frontend (+ `90_` for the offset) |
| **R5-G** | Date-major rank allocator + downstream parity | R5-E **and** R5-F | frontend + Apps Script |
| **R5-H** | Option C display + per-row hybrid column model | R5-G | frontend + CSS |
| **R5-I** | Stability, performance, acceptance | all | — |

**Change 1 — R5-F is adoption, not construction** (§1). The engine exists and is already correct on A1/A2/A4/A5/C1.

**Change 2 — R5-E and R5-G must land together or the semantics coexist.** D4 forbids old weighted and new
rank semantics in one active calculation. Deriving ranks (R5-E) while `_allocateShared` still multiplies by
them (R5-G pending) is exactly that forbidden state. **Recommendation: R5-E writes ranks but leaves them
inert behind the existing engine until R5-G ships in the same release, or R5-E is deferred to immediately
before R5-G.**

Also honoured: the new default of 100 is **not** activated under old weighted semantics — it stays withheld
(it already is, from S8-R2) until R5-G.

---

## 24. REMAINING_DECISION_GATES

| ID | Gate | Status |
|---|---|---|
| D-1 | Priority direction | **CLOSED** — R3 item 6, smaller first |
| D-2 | Equal-priority tie | **CLOSED** — proportional on that day's demand |
| D-3 | `CEILING(daily×18)` inflation | **CLOSED** by §13 (cumulative rounding removes it) |
| D-4 | Surplus beyond day 18 | **CLOSED** — A1/B4 continue to day 90, residual explicit |
| D-5 | Request Order isolation | **CLOSED** — repair authorised as R5-C |
| D-6 | Rounding placement | **CLOSED** — cumulative carry, one boundary |
| D-6a | Is the *displayed* per-day figure integerised? | **OPEN** — recommend no |
| D-7 | Missing FC / refused Target Rule silently drops a site | **OPEN** — KMHP says `UNAVAILABLE`, IR says 0. Which wins? |
| D-8 | Horizon ends before pool exhausted | **CLOSED** — A1: do not extrapolate; keep residual |
| D-9 | Hybrid self_fulfilled SKU rendering a Current Stock cell | **OPEN** (R5-H) |
| D-10 | Should `IR.resolveFulfillment` fail closed? | **OPEN** — recommend yes |
| D-11 | Is `90_`'s SKU-first resolution a defect or deliberate? | **OPEN** |
| D-12 | Existing stored priority values | **OPEN** — census first (§16), no auto-reversal |
| **D-13** | **Campaign FC as a second additive term** | **OPEN — recommend one term + dedup (§7)** |
| **D-14** | **Capture vs consumption split** (A6b vs KMHP `prepDate` consumption) | **OPEN — blocks R5-F** |
| **D-15** | **30 → 45 day offset touches the generated `90_` bundle** | **OPEN — needs a bundle rebuild decision** |
| **D-16** | **Authorization model for Admin-only priority editing** | **OPEN — no owner exists** |

---

## 25. NEXT_ATOMIC_TASK

**R5-B — Avg Sales backend correction.** It is the only batch with **zero dependencies**, a **single-line**
primary change plus four additive diagnostic fields, a **bounded** blast radius, and it closes a defect that
is currently visible to users (Forecast-Driven Avg Sales shows `--`). It needs its own Apps Script release
cut, which it can have without waiting on any decision gate above.

Everything else is gated: R5-A needs D-13/D-14/D-15, R5-D needs D-16, R5-F needs D-14, R5-G needs R5-E.

---

## 26. SAFETY PREFLIGHT (Part J)

```
PRE HEAD        b181514b68fc33214d4059928b5a720aa389669e
BRANCH          feature/product-strategy-board-p0
ORIGIN/MAIN     6b9735e7642eda2963295cf2db970052dfe808f6   (8 commits behind HEAD)
WORKTREE        wt-product-strategy-board-p0                (clean)
SUITES          622
```

**Allowed in this round:** this document only.
**Do-not-touch, and untouched:** every file under `assets/js/`, `assets/specs/active/apps-script/`,
`assets/html/`, `assets/css/`, every frozen spec in `docs/planning/`, every test, `C:/km-lb`.
**Production:** no writes, no live recalculation, no Submit, no reads of live planning state.
**Rollback:** this round is additive documentation; `git revert` of one commit is complete rollback.
**Submitted-plan safety:** §24.10 snapshots at Submit; no proposed batch before R5-G writes a draft.
**Sweep:** not run (Part J — no mutation-heavy sweep concurrent with another task).

### STOP GATE

No runtime implementation. No production DB modification. No automatic priority migration. No Apps Script
sync or deployment. No git push. **User approval required before implementation.**
