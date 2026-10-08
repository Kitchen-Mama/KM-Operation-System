# S8 — SHARED 3PL ALLOCATION POLICY R3 — PREFLIGHT

**Round:** S8-ALLOC-R3 · **Date:** 2026-10-08 · **Status:** PREFLIGHT — NOT IMPLEMENTED
**Authority:** operator policy freeze (14 items) + Fulfillment Model Resolution Addendum
**Boundary:** read-only audit. No allocation formula changed, no spec frozen, no DB row touched,
no materialized gap rebuilt, no push, no deploy.

> **Why no spec was amended in this round.** The approved policy and the frozen specs disagree on the
> direction of `allocation_priority`. Writing the new direction into the specs now would freeze an
> algorithm the operator has not yet seen numerically. The conflict is reported; nothing is resolved
> by documentation.

---

## 0. Headline

The approved policy and the shipped runtime rank sites in **opposite directions**, and they divide the
pool by **different mechanisms**. Both differences are real, independent, and change allocations by
hundreds of units on ordinary data.

| | Approved policy (R3) | Shipped runtime + frozen specs |
|---|---|---|
| Direction | item 6 — **smaller number ranks first** | `higher number = higher priority` |
| Mechanism | strict rank; equal priority → proportional (item 7) | **weight** `minNeed × MAX(priority,1)`, always proportional |
| Granularity | chronological, **one demand day at a time** (item 5) | one **18-day aggregate**, no day loop |
| Default | 100 = **lowest** rank (items 11+12, range 1..100) | missing → **0**, floored to 1 by `MAX(p,1)` |
| Beyond day 18 | continue daily until pool exhausted (item 9) | **surplus left unallocated** |

**The default is the sharp edge, and the damage is monotone in scarcity.** Under the shipped direction a
newly created marketplace with `allocation_priority = 100` is the *highest*-weighted claimant. It is
partly held in check by a per-site cap at that site's own 18-day need — so at a comfortable pool the two
algorithms nearly agree, and the distortion grows as the pool shrinks (§F sweep, machine-verified):

| pool | coverage | current A/S/T | policy A/S/T | new marketplace's share of pool |
|---|---|---|---|---|
| 630 | 100% | 360 / 180 / 90 | 360 / 180 / 90 | 14% — **identical** |
| 400 | 63% | **130** / **180** / 90 | 235 / 110 / 55 | 23% — Shopify now out-allocates Amazon |
| 200 | 32% | 42 / 68 / **90** | 120 / 55 / 25 | 45% — new site fully served, Amazon at 35% of need |
| 100 | 16% | **3** / 16 / **81** | 60 / 30 / 10 | **81%** |

At 16% coverage the brand-new marketplace takes **81 of 100 units** while the site carrying 57% of the
real demand receives **3**. That is the failure mode — a scarce pool, which is exactly when allocation
matters.

Three specs state the shipped direction, not one:
`INVENTORY_TABLE_MAPPING_SPEC.md` §16 R6 · `SUPPLY_PLANNING_CALCULATION_RULES.md` §20.4:771 ·
`DATABASE_RELATIONSHIP_MAP.md`:32.

---

## A. Canonical daily demand pipeline (as built)

| Stage | Forecast-Driven | Sales-Driven |
|---|---|---|
| Source | `fc_regular_forecast` monthly columns | `weekly_sales` → §22 normalized rate |
| Function | `_irForecastPlanning2mo` (inventory-replenishment.js:509) | `avgSalesPerDay` → `normalizedAvgSalesPerDay` (supply-planning-calculations.js:290) |
| Window | months **+1 and +2** from today | latest 30 eligible normal days within 90 |
| Target % Rule | **applied**, per-month (`targetPct`, refusal → `null`) | **never applied** |
| Special Event / Campaign | **never applied** | **excluded** from the rate (§22 event-day exclusion) |
| Daily rate | `fc60 / 60` — a **flat average**; the month shape is destroyed | flat normalized rate |
| Rounding | `Math.round` per month, then `CEILING(daily × 18)` once | `CEILING(daily × 18)` once |

**A-1 — Policy item 4 is half-implemented.** The Target % Rule reaches Forecast-Driven demand only;
Sales-Driven demand never sees it. Special Event / Campaign demand reaches **neither**.

**A-2 — The page shows one forecast and allocates with another.** `forecast60d` (:481) is the displayed
"90 days FC": **3** months **plus** scope-matched Special Events. `_irForecastPlanning2mo` (:509) is the
allocation input: **2** months, **no** events. Two different numbers on the same row, by design
(the comment at :507 says so), but the operator sees only the first.

**A-3 — There is no daily horizon.** Nothing in the shipped path produces per-day demand. Policy items
5, 8 and 9 all require a day index that does not exist yet. `fc60/60` is the closest thing, and it is a
flat average: a December peak and a flat December allocate identically.

**A-4 — Determinism caveat.** `_irForecastPlanning2mo` calls `new Date()` (:526) to choose months +1/+2.
Identical DB inputs produce different allocations across a month boundary. The invariant "identical
inputs produce identical outputs" holds only with the clock pinned.

---

## B. Allocation implementations compared

| # | Implementation | Scope | Priority use | Day loop | Surplus |
|---|---|---|---|---|---|
| B1 | `IR.sitePlanningAllocation` → `_allocateShared` (inventory-replenishment.js:679/730) | company + country + master SKU | weight, **higher first**; also tie-break (1) descending | none — 18-day aggregate | **unallocated** |
| B2 | `allocateOverseasSharedPool` (supply-planning-allocations.js:187..223) | per `FBA` / `THREE_PL` lane | 4 comparators, **all** `b − a` descending | none | distributed by `demandWeight` |
| B3 | `43_api_v1_gap_materialization.gs` (:423, :641, :727) | materialized gap | carried; missing → **0** | none | n/a |
| B4 | `supply-planning-surplus-reallocation.js:170` | surplus pass | `b − a` descending | none | n/a |
| B5 | `71_api_v1_factory_stock_guard.gs:141` | factory guard | carried | n/a | n/a |
| B6 | `request-order.js:489` `thirdParty(sku, country)` | **no allocation at all** | — | — | — |

**B-1 — B1 and B2 are two different algorithms, not one engine in two places.** B1 protects an 18-day
floor then stops. B2 carries `survivalNeedQty`, `demandQty`, `demandWeight` and `eligiblePoolTypes`,
runs `FBA` and `THREE_PL` as separate lanes, and has a third mode (`PROTECTED_REALLOCATION`) that B1
does not. Any policy change must land in both or they will disagree.

**B-2 — B1's shortage branch is spec-conformant; §24.7 is the thing that conflicts with the policy.**
`SUPPLY_PLANNING_CALCULATION_RULES.md` §24.7:1026-1028 states `priority_factor = MAX(allocation_priority, 1)`
and the weighted product verbatim. The code matches the spec exactly. The policy overrules the spec,
not the code.

**B-3 — §24.5 step 3 is not implemented, and that is D-4.** §24.5:1009 says the remaining pool *is*
distributed after every site reaches its floor. B1 leaves it unallocated and says so in its own comment
(:674-676). Scenario S1: **370 of 1,000 units** sit unallocated that the spec says should be distributed.
This is a spec-vs-runtime conflict **independent of the direction question**.

---

## C. Pool isolation and double counting

| Path | Company | Country | Allocated or raw | Verdict |
|---|---|---|---|---|
| `IR.sitePlanningAllocation` | filtered (`scope.company`) | filtered | **allocated** | conformant |
| `sharedPhysicalPool` → `eligible3plWarehouses` | warehouse-side `company + country + 3PL + is_active` | filtered | pool build | conformant |
| `request-order.js:489` `thirdParty(sku, country)` | **NOT FILTERED** | filtered (warehouse country, :437) | **raw pool** | **leaks + double-counts** |

**C-1 — Request Order shows the undivided pool, once per site, with no company filter.**
`thirdParty(sku, country)` (:428) sums every non-factory warehouse row matching SKU + warehouse country.
In the US, a Kitchen Mama row includes ResUS 3PL stock, and vice versa. It then prints that same total on
every marketplace row for that SKU — the exact "one pool shown N times as if each site owned it" defect
that Site Inventory was repaired for in F1-7N-FB-4E-R4B-R1.

This violates policy item 1 (company boundary) and item 2 (never double-counted), and the invariants
"no cross-company leakage" and "no duplicate shared-pool consumption". Pre-existing, display-side,
**not repaired in this round** — it is its own decision (D-5).

---

## D. Canonical algorithm pseudocode (proposed — NOT frozen)

```
ALLOCATE_SHARED_3PL(company, country, masterSku, today) :

  # ---- pool (unchanged from §20.1 / §23.6) --------------------------------
  pool = SUM available_qty  over overseas_inventory_snapshot rows where
           warehouse.company = company AND warehouse.country = country
           AND warehouse.warehouse_type = '3PL' AND warehouse.is_active
         available = current - reserved - damaged/hold/non_sellable

  # ---- sites --------------------------------------------------------------
  sites = marketplace_skus WHERE company,country,sku match   # fulfillment model NOT a filter
  for s in sites :
      s.priority = marketplaces[s.marketplaceId].allocation_priority
                   default 100 ; REQUIRE integer in [1,100] else UNRESOLVED
      s.demand[d] for d = 1..H =                             # H = horizon in DAYS
            canonical_daily_FC(s, today + d)                 # Forecast- or Sales-Driven
          * target_pct(s, month_of(today + d)) / 100         # item 4, both modes
          + special_event_demand(s, today + d)               # item 4, on its OWN days

  # ---- chronological allocation (items 5,6,7,8,9) -------------------------
  remaining = pool ;  alloc[s] = 0
  for d = 1 .. H :
      if remaining <= 0 : break
      want = { s : s.demand[d] for s in sites if s.demand[d] > 0 }
      if want is empty : continue
      for g in groups_of(want) ordered by priority ASCENDING :   # item 6, smaller first
          if remaining <= 0 : break
          if SUM want[g] <= remaining :
              give = INTEGERIZE(want[g])                         # full service
          else :
              give = LARGEST_REMAINDER(remaining, weights=want[g])  # item 7, item 10
          for s in g : alloc[s] += give[s] ; remaining -= give[s]

  return { alloc, unallocated = remaining }
```

**D-a — The 18-day protection horizon is emergent, not a separate rule.** Because the loop is day-major,
day 19 is reached only after day 18 has been served for every site. No site can receive day-19 stock
while another lacks day 18. Item 8 is therefore a **reporting boundary**, and items 8 and 9 collapse
into one uniform loop. This is a simplification worth confirming — it is not what the current engine does.

**D-b — Integer rounding has two defensible placements** (item 10 does not settle it):

- **R-a per day** — integerize inside each day. Simple, but up to H roundings accumulate.
- **R-b carry the fraction** — accumulate exact reals, integerize once at the end by largest remainder.
  The total is exact; a single day's figure is then not independently meaningful.

Scenario S10 is computed under **R-b**. Under R-a the same inputs give different per-site totals.

**D-c — `INTEGERIZE` of a single-member group is undefined.** When one site alone holds a priority rank
and wants 20.4 units on day d, largest-remainder over one element has no remainder to compare. R-b makes
the question disappear; R-a needs a stated rule.

---

## E. Invariant proof status (current runtime)

| Invariant | `IR.sitePlanningAllocation` | `request-order.js` |
|---|---|---|
| Sum of allocations <= pool | **PROVEN** — floors capped at `minNeed`, remainder loop breaks when all capped | N/A (no allocation) |
| Nonnegative integers | **PROVEN** — `Math.max(...,0)`, `Math.floor`, `Math.ceil`, `+= 1` only | N/A |
| No cross-company leakage | **PROVEN** — company equality required on every sibling row | **FAILS** (C-1) |
| No cross-country leakage | **PROVEN** | holds (warehouse country, :437) |
| No duplicate shared-pool consumption | **PROVEN** — one `_allocateShared` call per scope | **FAILS** (C-1) |
| Identical inputs produce identical outputs | **CONDITIONAL** — `new Date()` at :526 (A-4) | N/A |
| Target % applied exactly once | **PARTIAL** — Forecast-Driven only (A-1) | N/A |
| Event demand applied exactly once | **FAILS** — applied **zero** times in allocation (A-1) | N/A |
| Warehouse + marketplace identity mappings intact | **PROVEN** — untouched this round | unchanged |

---

## F. Numerical scenarios

**Fixture** — KM / US / `CO1100-R`, three sites, Sales-Driven:

| Site | priority | daily demand | 18-day need |
|---|---|---|---|
| Amazon | 1 | 20.0 | 360 |
| Shopify | 10 | 10.0 | 180 |
| Target *(new, default)* | 100 | 5.0 | 90 |
| | | **35.0/day** | **total 630** |

Every "current runtime" figure below was produced by **extracting `_allocateShared` verbatim from
`inventory-replenishment.js` and executing it**, not by hand arithmetic. The policy column was produced
by executing the §D pseudocode under rounding option **R-b**.

| # | Input | Policy R3 result | Current runtime result | Delta |
|---|---|---|---|---|
| **S1** | pool 1000 (abundant) | A 580 · S 280 · T 140 · **unalloc 0** | `NORMAL` A 360 · S 180 · T 90 · **unalloc 370** | A **+220** |
| **S2** | pool 630 (exact) | A 360 · S 180 · T 90 | `NORMAL` A 360 · S 180 · T 90 | **none** |
| **S3** | pool 400 (63% coverage) | A 235 · S 110 · T 55 | `SHORTAGE` **A 130 · S 180** · T 90 | A **-105**, and **S > A** |
| **S3b** | pool 100 (16% coverage) | A 60 · S 30 · T 10 | `SHORTAGE` **A 3 · S 16 · T 81** | A **-57**, T **+71** |
| **S4** | pool 200, all priority 10 | A 133 · S 67 | `SHORTAGE` A 133 · S 67 | **none** |
| **S5** | Target priority missing | default **100** → lowest rank | sentinel 0 → `MAX(0,1)=1`; at pool 400 gives **A 134 · S 180 · T 86** vs 130/180/90 when stored as 100 | **missing ≠ 100** |
| **S6** | Target daily = 0 | T 0 | T 0 | none |
| **S7** | all daily = 0 | nothing allocated | `NO_DEMAND`, nothing allocated | none |
| **S8** | Target Rule refuses for Amazon | **undecided** (D-7) | `null` → daily 0 → **silently dropped** | silent |
| **S9** | pool 5000, FC horizon 60d | **undecided** (D-8) | never arises (stops at 18d) | — |
| **S10** | daily 20.4 / 10.3 / 5.1, pool 100 | A 61 · S 29 · T 10 | `SHORTAGE` **A 3 · S 16 · T 81** | A **-58** |
| **S11** | 3 sites x 0.4/day, pool 22 | A 8 · B 7 · C 7 | `CEIL(7.2)=8` x3 = 24 > 22 → `SHORTAGE` **A 6 · B 8 · C 8** | **wrong mode**, and A loses to both |
| **S12** | KM-US 600 + ResUS-US 400 | KM sees 600 | `thirdParty` returns **1000** to both | **400 leaked** |

### F-1 — The per-site cap, not the priority, is doing the protective work

`_allocateShared` caps each site's floor at its own `minNeed` (`if (fl > x.s.minNeed) fl = x.s.minNeed`)
and then distributes the leftover **round-robin** among sites still below their need. At pool 400 the
weighted raw split would have given Target 322.58 — but Target's whole 18-day need is 90, so it is capped
there and **234 units fall into the round-robin**, which refills Shopify and Amazon almost evenly.

That cap is why the two algorithms converge at comfortable pool levels, and why they diverge sharply when
the pool is too small for the cap to bind. **The protection is incidental.** It is a side effect of a cap
written for a different purpose, not a policy anyone chose — which is precisely why it should not be
relied on once the direction is settled.

### F-2 — The ordering inverts before the extreme case does

At pool 400 (a routine 63%-coverage shortage) Shopify receives **180** and Amazon **130**, although Amazon
carries twice Shopify's demand and ranks first under the approved policy. No alarm fires; the numbers look
plausible. The 81%-of-pool case is the visible failure, but **this is the one that would ship unnoticed.**

### F-3 — S4 bounds the risk

When every site carries the **same** priority, `minNeed x k` is proportional to `minNeed`, so the weighted
split and the chronological proportional split give the **same integers** — verified, not argued. **The
entire divergence is driven by priority spread.** A tenancy where all marketplaces share one priority
value is already policy-conformant today, which makes the live value census (§H) the first thing worth
reading before anything is changed.

---

## G. Required file changes (if the policy is adopted — NOT authorized)

| Layer | File | Change |
|---|---|---|
| Spec | `SUPPLY_PLANNING_CALCULATION_RULES.md` §20.4, §24.5–24.7, §40.5/40.7 | invert direction; replace weighted shortage with chronological rank; state the day loop |
| Spec | `INVENTORY_TABLE_MAPPING_SPEC.md` §16 R6 | invert direction |
| Spec | `DATABASE_RELATIONSHIP_MAP.md`:32 | invert direction; add the 1..100 integer domain |
| DB | `marketplaces.allocation_priority` | **no schema change**; values must be re-stated (see H) |
| API | `03_master_data_handlers.gs` :599/:628/:648 | CREATE default 100; add integer 1..100 validation (currently **none**) |
| Runtime | `inventory-replenishment.js` `_allocateShared` :679 | replace engine; missing-priority sentinel 0 → fail-closed 100 |
| Runtime | `supply-planning-allocations.js` :187, :205, :214, :223, :350 | 5 comparators |
| Runtime | `supply-planning-surplus-reallocation.js` :170 | 1 comparator |
| Runtime | `43_`, `71_`, `61_`, `90_` | carried-value defaults `0` → `100` |
| Runtime | `request-order.js` :489 | add company filter; consume the allocation, not the raw pool (D-5) |

---

## H. DB write / migration preflight

- **No schema change.** `allocation_priority` already exists on `marketplaces` and is numeric.
- **Existing values carry the opposite meaning.** Every row stored under "higher = higher" means the
  reverse under the new policy. A site deliberately set to 90 to be *important* becomes nearly the
  *least* important. **A direction flip without a value migration silently inverts live allocations.**
- **No backfill is authorized by this round**, and none should be written before the operator sees the
  current live distribution of values. That census is a read and can be produced on request.
- **No validation exists today.** `03_:599` takes `body.allocation_priority` verbatim — no integer check,
  no range check, no sign check. Policy item 12 (integer 1..100) is currently unenforced at every writer.
- **`0` is both a legal stored value and the missing-value sentinel** (frontend `:753`, `43_:641`/`:727`).
  Under "smaller first" a stray `0` would become the **top** rank. Fail-closed handling of `0` is a
  prerequisite, not a polish item.

---

## I. API contract impact

- `GET` marketplaces — unchanged shape; **meaning** of the field changes.
- `POST` create marketplace — gains a default and a validation error path (new refusal string).
- `recommendation_workspace` lines — `allocationPriority` passthrough unchanged in shape.
- Materialized gap records — `allocation_priority` is **persisted** into gap rows (`43_:641`). Existing
  materialized gaps carry the old direction; they are **not** rebuilt by this round and must not be.

---

## J. Downstream impact

Weekly AI Plan · Order Planning supply allocation · factory stock guard · surplus reallocation ·
gap materialization · shipping allocation drafts. `allocation_priority` reaches **21 runtime files**.
Submitted plans are protected: §24.10 snapshots at Submit, so already-submitted quantities do not move.
Future plans carry the new basis.

---

## K. Regression risk

**53 of 622 test suites (8.5%)** reference `allocationPriority` / `allocation_priority`, including the
**112 frozen §40 assertions** in `supply-planning-allocations.test.js` and the golden-scenario suite.
A direction flip fails them by construction — they encode the current direction as the expected result.
Each must be **restated with attribution**, not deleted. This is the largest single-change blast radius
in the S8 sequence so far.

---

## L. ADDENDUM — Fulfillment model resolution

### FULFILLMENT_RESOLUTION_STATUS — three implementations, two of them divergent

| Resolver | Hierarchy (addendum 1-5) | Fail-closed (item 6) | Verdict |
|---|---|---|---|
| `IR.resolveFulfillment` (inventory-replenishment.js:870) | correct | **NO** — hybrid + missing SKU model returns `'hybrid'`; unknown marketplace falls back to the SKU value | **fail-open** |
| `recoWsResolveFulfillment_` + `recoWsFulfillmentModelBySku_` (42_:404/:395, gate at :911) | correct — SKU consulted **only** when marketplace = `hybrid` | **YES** — `DESTINATION_AUTHORITY_UNRESOLVED` | **conformant** |
| `90_generated_supply_planning_bundle.gs:5292` | **wrong** — reads `marketplace_skus.fulfillment_model` unconditionally; never reads `marketplaces.fulfillment_model` | null → deferred | **violates rules 3 and 4** |

Rule 7 (never infer from marketplace name) — **satisfied**; no name-based inference found in any path.
Rule 8 (company + country boundaries) — **preserved** in all three.

### HYBRID_SKU_MAPPING_STATUS

Implemented end-to-end in `42_` only. Write paths validate: `03_:512-518` checks
`VALID_SKU_FULFILLMENT_MODELS_`; the IR CSV import requires a `fulfillment_model` column for hybrid
marketplaces and rejects anything but `platform_fulfilled` / `self_fulfilled` (:12902, :12927-12928).
`04_marketplace_forecast_import.gs:378/:424` writes the value through without that gate.

### SITE_INVENTORY_DISPLAY_IMPACT

`_irScopeFulfillmentModel()` (:1727) resolves **marketplace-level only** — `_replenDarFulfillmentOf`
over the marketplaces master, keyed by `marketplaceId`. `marketplace_skus` is never consulted.

- A **hybrid** marketplace yields `'hybrid'` → `hideCurrentStock = false` → the full 3-column Inventory
  group for **every** SKU, including its `self_fulfilled` SKUs, which have no platform Current Stock.
- **A mixed-fulfillment marketplace cannot render both SKU types correctly.** The model is applied as
  **one class on the whole table** (`tbl.classList.toggle('ir-hide-current-stock', ...)`, :1740) — it is
  per-table, not per-row, so it is structurally incapable of mixing.

Changing this is a **column-model redesign** (per-row visibility), not a resolver fix. Out of scope here.

### SHARED_3PL_ALLOCATION_IMPACT — none, and that is correct

`sitePlanningAllocation` sets `participates = true` unconditionally (:737) and selects sibling sites
**regardless of fulfillment model** (:742). Eligibility is warehouse-side only
(`company + country + warehouse_type='3PL' + is_active`). This matches addendum item 9 and
`SUPPLY_PLANNING_CALCULATION_RULES.md` §23.6/§24.9 — a platform-fulfilled marketplace may hold 3PL
replenishment reserve. **No change required. Flagged so it is not "fixed" into a regression.**

### DOWNSTREAM_CONTRACT_DIFF

- `42_` projects the **effective per-SKU** model onto `ln.fulfillmentModel` (:925).
- `90_` emits the **raw SKU-level** value into receiver facts (:5292, :10215).
- `supply-planning-allocations.js` uses `fulfillmentModel === 'platform_fulfilled'` only to label the
  reserve **reason** (`THREE_PL_REPLENISHMENT_RESERVE`), never to gate eligibility — consistent with item 9.

### REQUIRED_FIXES (not performed)

1. `IR.resolveFulfillment` — return an explicit `UNRESOLVED` for hybrid + missing/unknown SKU model
   instead of `'hybrid'`; remove the unknown-marketplace SKU fallback (rules 3/4 must lock).
2. `90_:5292` — consult `marketplaces.fulfillment_model` first; use the SKU value only under `hybrid`.
3. Site Inventory column model — per-row visibility if mixed-fulfillment rendering is required.
4. `04_` import — apply the same validation as `03_`.

### DECISION_GATES (addendum)

- **D-9** Does a hybrid marketplace's `self_fulfilled` SKU render a Current Stock cell (today: yes)?
- **D-10** Should `IR.resolveFulfillment` fail closed, given its only consumer is a display row?
- **D-11** Is `90_`'s SKU-first resolution a defect or a deliberate deviation for receiver facts?

---

## M. Remaining product decisions

| ID | Decision | Status |
|---|---|---|
| **D-1** | Priority direction — policy says smaller-first; three specs and six comparators say higher-first | **ANSWERED by R3 item 6; migration undecided (H)** |
| **D-2** | Equal-priority tie | **ANSWERED by item 7** — proportional on that day's demand |
| **D-3** | `CEILING(daily x 18)` inflates need and can flip the mode (S11) | **OPEN** |
| **D-4** | §24.5 step 3 surplus: spec distributes it, engine leaves it unallocated | **ANSWERED by item 9** — continue daily; §24.5 needs restating |
| **D-5** | `request-order.js:489` cross-company leak + raw-pool double count | **OPEN** |
| **D-6** | Rounding placement: per-day (R-a) vs carried fraction (R-b) | **OPEN** |
| **D-7** | Missing FC / refused Target Rule silently drops a site to 0 | **OPEN** |
| **D-8** | FC horizon ends before the pool is exhausted — stop, or extrapolate? | **OPEN** |
| **D-9..D-11** | Fulfillment resolution (§L) | **OPEN** |
| **D-12** | Existing stored priority values under an inverted direction (§H) | **OPEN** |

---

## N. Boundary statement

No allocation formula changed. No spec frozen. No DB row read or written. No materialized gap rebuilt.
No Apps Script file modified. No push, no deploy. Implementation remains unauthorized pending operator
approval of this preflight.
