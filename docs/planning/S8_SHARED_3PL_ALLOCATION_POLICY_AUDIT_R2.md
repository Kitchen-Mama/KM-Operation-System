# S8 — SHARED 3PL ALLOCATION POLICY R2 · AUDIT ONLY

```
NO ALLOCATION FORMULA CHANGED. NO SPEC FROZEN. NO IMPLEMENTATION.
Nothing in this document alters runtime, DB, API or Apps Script behaviour.
```

---

## §1 — THE HEADLINE: THE PRIORITY DIRECTION IS INVERTED

The approved policy says **"Priority is an integer ranking, smaller number first."**
Every frozen spec and every shipped allocator says the opposite.

```
INVENTORY_TABLE_MAPPING_SPEC.md §16 Rule 6     "higher number = higher priority"
SUPPLY_PLANNING_CALCULATION_RULES.md §20.4     "allocationPriority ... (higher = higher, §20.4)"
                                      §35      order: "(2) higher allocationPriority"
                                      §40      weight = survivalNeedQty × MAX(allocationPriority, 1);
                                               remainder ordered by "(1) higher allocationPriority"
                                               — FROZEN contract, 112 unit assertions
runtime  inventory-replenishment.js:694        w = minNeed × MAX(allocationPriority, 1)      higher = more
                                      :708     remainder sort: b.allocationPriority − a.allocationPriority
runtime  43_api_v1_gap_materialization.gs:423  priorityByMkt — fed to the same weighting
runtime  71_api_v1_factory_stock_guard.gs:141  same field, same direction
```

**This is not a wording difference.** Under the current engine a larger number wins; under the approved
policy a smaller number wins. The two produce opposite allocations from the same data.

### It changes what the new default of 100 MEANS

Task 1 authorized, and this round implemented, `allocation_priority = 100` on marketplace CREATE.

```
under the SHIPPED direction (higher = higher)   100 makes every new marketplace the HIGHEST-priority
                                                 claimant — it outranks every established site in a shortage
under the APPROVED policy (smaller first)        100 is a sensible LOW default — new sites queue behind
                                                 established ones
```

The stored number is the one that was authorized and is correct under the approved policy. **Until the
direction is settled, a newly created marketplace will outrank established ones whenever the pool is short.**
Existing rows are unaffected (no backfill), and the practical blast radius today is: only marketplaces created
from now on, only in a SHORTAGE, only within the same company + country + SKU pool.

**DECISION REQUIRED (D-1).** Either confirm "smaller first" and the engine + §16 R6 + §20.4 + §35 + §40 must
be inverted together, or confirm "higher = higher" and the default should not be 100.

---

## §2 — CURRENT SHORTAGE ALGORITHM vs DAY-BY-DAY PRIORITY ALLOCATION

**Current (`_allocateShared`, mirroring §24.7 / §40):**

```
if pool >= Σ minNeed       every site gets its FULL 18-day need; the surplus is left UNALLOCATED
else                       weight_i = minNeed_i × MAX(priority_i, 1)
                           raw_i    = pool × weight_i / Σweight
                           qty_i    = MIN(floor(raw_i), minNeed_i)
                           remainder distributed one unit at a time, ordered by
                             (1) largest fractional part  (2) higher priority
                             (3) larger unmet 18-day need (4) stable key
```

It is **proportional-with-priority-weighting**, not strict priority. Every site with demand receives
something as long as its weighted share rounds to ≥ 1.

**Strict priority (what "smaller number first" normally implies):**

```
sort sites by priority ascending; serve each site's FULL 18-day need before the next site receives anything;
the first site that cannot be fully served takes the remainder; every later site gets zero.
```

**§2 ANSWER — YES, THE CURRENT ALGORITHM VIOLATES A STRICT-PRIORITY POLICY.** Priority today is a *weight*,
not a *rank*. A low-priority site is never starved; it is merely allocated less. If the approved policy means
rank, the weighting must be replaced, not re-signed. See the worked numbers in §4.

---

## §3 — WHAT IS ALREADY CORRECT (and must survive any change)

```
conservation      Σ allocated ≤ pool, always. Each site capped at its own minNeed; the remainder loop
                  breaks when every site is capped. unallocatedPool is reported, never hidden.
non-negative      floor() of a non-negative raw share; no path can produce a negative.
integers          floor + single-unit remainder steps. No fractional quantity is ever emitted.
determinism       the remainder order ends in a stable key, so equal inputs always produce equal outputs —
                  "never by input order, never randomly, never by locale" (§40).
isolation         company AND country, both hard. Pool key = company || country || Master SKU.
eligibility       warehouse_type='3PL' AND is_active === true, tri-state (blank/unknown excluded).
dedup             by warehouse_id, never by marketplace.
```

---

## §4 — WORKED NUMERICAL SCENARIOS (for user review; expected outputs under BOTH policies)

Pool = **1,000** units. Company KM, country US, one Master SKU. Three competing marketplace SKUs.
`minNeed = CEILING(dailyDemand × 18)`.

### Scenario 1 — SURPLUS (pool covers everyone)

```
site      daily   minNeed     priority
Amazon    20      360         1
Shopify   10      180         2
Target     5       90         3
                  Σ 630
CURRENT   Amazon 360 · Shopify 180 · Target 90 · unallocated 370
STRICT    identical — nobody competes when there is enough
```
**No policy difference when the pool is sufficient.** Both leave 370 unallocated (see §5).

### Scenario 2 — SHORTAGE, priorities differ (pool 400 vs need 630)

```
CURRENT (weight = minNeed × MAX(priority,1), "higher wins")
  weights  Amazon 360×1=360 · Shopify 180×2=360 · Target 90×3=270   Σ 990
  raw      Amazon 145.45 · Shopify 145.45 · Target 109.09
  floor    145 / 145 / 109 = 399;  1 unit by largest remainder (tie → higher priority → Target)
  RESULT   Amazon 145 · Shopify 145 · Target 110        every site served, none starved

STRICT PRIORITY, smaller number first (1 = best)
  Amazon takes its full 360; 40 left
  Shopify takes 40 (partial); 0 left
  Target gets 0
  RESULT   Amazon 360 · Shopify 40 · Target 0           rank honoured, tail starved

STRICT PRIORITY read the OTHER way (3 = best, today's direction)
  Target 90 · Shopify 180 · Amazon 130
```

**Three defensible answers from one dataset.** This single scenario is the decision: the numbers differ by
more than 200 units on the largest site.

### Scenario 3 — SAME PRIORITY (the tie case)

```
Amazon minNeed 360, Shopify minNeed 180, both priority 1. Pool 400.
CURRENT   weights 360 / 180 → raw 266.67 / 133.33 → 266 / 133 = 399, +1 by largest remainder
          (0.67 > 0.33) → Amazon 267 · Shopify 133          proportional to need
STRICT, ties broken by NEED       Amazon 360 · Shopify 40
STRICT, ties broken by SHARE      Amazon 267 · Shopify 133  (= current behaviour)
STRICT, ties broken by STABLE KEY Amazon 360 · Shopify 40    (alphabetical)
```

**DECISION REQUIRED (D-2).** Equal priority is not defined by the approved policy. Today it falls through to
proportional-by-need, which is defensible and is NOT a bug — but it is also NOT a rank.

### Scenario 4 — demand edge cases (all current behaviour, all deliberate)

```
zero sales        daily 0 → minNeed 0 → weight 0 → allocated 0, and if EVERY site is 0 the mode is
                  NO_DEMAND and nothing is allocated at all (pool untouched)
missing sales     §22 refuses to invent a rate; a Sales-Driven SKU with no canonical rate contributes
                  ZERO planning demand — it is NOT treated as zero sales, it simply cannot claim
forecast-driven   daily = planning 2-month FC ÷ 60; a Target-Rule the resolver cannot identify yields
                  null, and `null > 0` is false → zero planning demand rather than a guessed number
event-driven      §22 EXCLUDES campaign/event days from the rate, so an event spike does NOT inflate
                  minNeed. Event demand is added ONCE, separately (§20.5 count-once) — it is not in minNeed
rounding          minNeed = CEILING(daily × 18). Always rounds UP, so a 0.06/day site still claims 2 units.
                  A fractional daily demand can therefore claim slightly more than 18 days of true cover;
                  that is deliberate protection, not drift.
```

**DECISION NOTE (D-3).** `CEILING` is the only rounding in the demand path and it is per-site. With many
tiny-demand sites the ceilings sum to more than the true 18-day requirement, which inflates Σ minNeed and so
makes a shortage appear slightly earlier than it truly is. Not a defect; worth knowing before the policy is
frozen.

---

## §5 — SURPLUS BEYOND 18 DAYS

Today: when `pool ≥ Σ minNeed`, every site is capped at its 18-day need and **the entire surplus is left
unallocated** (`unallocatedPool`). In Scenario 1 that is 370 of 1,000 units — 37% of the pool — shown to
nobody as theirs.

```
OPTION S1  keep it unallocated (today). Honest: nobody has claimed it. The pool is visible as a
           separate figure and any site can draw on it when its need grows.
OPTION S2  distribute the surplus by priority after the 18-day round. This is what §16 Rule 6 literally
           describes: "After all sites reach the 18-day survival stock, REMAINING inventory is allocated
           by allocation_priority." The runtime does NOT do this — it stops at the survival round.
OPTION S3  distribute the surplus proportionally to demand beyond 18 days (a second-horizon round).
```

**This is a SPEC-vs-RUNTIME CONFLICT, and it is independent of the direction question.** §16 Rule 6 says
remaining inventory IS allocated by priority; the engine leaves it unallocated and uses priority only as a
shortage weight. **DECISION REQUIRED (D-4).**

---

## §6 — SITE INVENTORY vs BACKEND MATERIALIZED GAP

Two allocators consume the same pool with the same eligibility and the same priority field:

```
frontend  inventory-replenishment.js  _allocateShared        display only (Option C's primary value)
backend   43_api_v1_gap_materialization.gs                   drives Suggested Qty, once per competing set
```

Both are weighted-largest-remainder with `MAX(priority, 1)`; both conserve. **They agree today.** Any change
to the policy must land in BOTH or the displayed allocation and the replenishment quantity will disagree —
and the backend one is an Apps Script change requiring an operator sync and a new deployment version.

A third consumer shares the field by §16 Rule 7: `71_api_v1_factory_stock_guard.gs:141`. Inverting the
direction would silently re-order factory allocation too.

---

## §7 — CROSS_COMPANY_RISK — REAL, AND NOT IN SITE INVENTORY

```
Site Inventory      company AND country both enforced.                          NO LEAKAGE
backend gap         pool key = company || canonicalCountry || sku.               NO LEAKAGE
Order Planning      request-order.js:489  thirdParty(sku, country)
                      - matches on SKU + COUNTRY ONLY
                      - NO company filter          <-- crosses the §16 Rule 1 boundary
                      - NO warehouse_type='3PL' filter
                      - NO is_active filter
                      - NO allocation: the whole pool is shown per row
```

In the US both **KM** and **ResUS** operate. Order Planning therefore shows a KM row a quantity that includes
ResUS warehouse stock, and vice versa — the one thing §16 Rule 1 forbids ("**Never** allocate across
companies"). It is display-side, pre-existing, and independent of every decision in this round.

**DECISION REQUIRED (D-5)** — whether Order Planning is in scope for a follow-up. It is not repaired here.

---

## §8 — DOWNSTREAM EFFECT ON SUGGESTED QTY AND SUBMIT

```
Suggested Qty    comes from the materialized gap, which consumes the ALLOCATED pool share. A policy change
                 therefore MOVES Suggested Qty for every site in a shortage. Scenario 2: Amazon's share
                 moves 145 → 360 under strict priority, so its gap shrinks by 215 units.
Submit Plan      §24.10 — at Submit, the current Planning Available and its calculation context are COPIED
                 into the Decision Snapshot, and after Execution Commit the Shipment reads that snapshot and
                 never recalculates. So plans already submitted are SAFE from any policy change; plans
                 submitted after it will carry the new basis. There is no retroactive mutation.
materialized     the stored gap is refreshed by Recalculate or the daily job, not by a code change. After a
gap              policy change the displayed and stored numbers will disagree until a recalculation runs —
                 that window must be planned for, not discovered.
```

---

## §9 — REQUIRED REPORT FIELDS

```
ALLOCATION_POLICY_DIFF
  (1) DIRECTION INVERTED — approved "smaller first" vs frozen/shipped "higher = higher" in §16 R6, §20.4,
      §35, §40 (112 frozen assertions), the page allocator, the gap materializer and the factory guard.
  (2) MECHANISM DIFFERENT — approved wording implies a RANK; the engine implements a WEIGHT. No site is
      ever starved today.
  (3) SURPLUS — §16 R6 says remaining inventory is allocated by priority; the engine leaves it unallocated.
  Conservation, non-negativity, integer output, determinism, company/country isolation and eligibility are
  all already correct and are not in dispute.

SHORTAGE_ALLOCATION_EXAMPLES   §4, Scenarios 1-4, with expected outputs under each candidate policy.
SURPLUS_POLICY_OPTIONS         §5 — S1 keep unallocated (today) · S2 priority round (what §16 R6 says) ·
                               S3 proportional second horizon.
SAME_PRIORITY_POLICY_OPTIONS   §4 Scenario 3 — proportional-by-need (today) · strict by need · stable key.
CROSS_COMPANY_RISK             §7 — Site Inventory and the backend gap are clean; Order Planning
                               (request-order.js:489) crosses company AND skips the 3PL/active filters.
SPEC_RUNTIME_CONFLICTS         direction (approved vs §16 R6 / §20.4 / §35 / §40) · surplus (§16 R6 vs the
                               engine) · and the already-corrected §22 status line.
DECISION_GATES_REMAINING       D-1 direction · D-2 equal-priority tie · D-3 CEILING inflation (accept or
                               revisit) · D-4 surplus policy · D-5 Order Planning scope.
```

**Nothing here is implemented, and no spec was changed by this audit — deliberately, so an undecided
algorithm is not frozen by documentation.**
