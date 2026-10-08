# S8-SITE-INVENTORY-STOCK-DISPLAY-C-R1 — OPTION C PREFLIGHT

```
PHASE 1  spec reconciliation      DONE (2 canonical specs amended)
PHASE 2  DB / mapping / runtime preflight   DONE (below)
PHASE 3  implementation plan      PREPARED, NOT IMPLEMENTED
RUNTIME_MODIFIED = NO · DB = NO · API = NO · DEPLOYED = NO
```

---

## 1. SPEC_CONFLICT_RESOLVED — YES

| spec | before | after |
|---|---|---|
| `INVENTORY_TABLE_MAPPING_SPEC.md` §18 column map | 3rd Party Stock = the pool alone | **PRIMARY = Planning Available · SECONDARY = Shared 3PL Pool**, with the supersession noted |
| `INVENTORY_TABLE_MAPPING_SPEC.md` §16 | Rules 1–7 | **Rule 8 added** — a marketplace-scoped column shows the site's share; one pool is never rendered N times |
| `SUPPLY_PLANNING_CALCULATION_RULES.md` §24.9 | already Option C in both branches | **unchanged**; a reconciliation note records that §18 was the side that moved |

The mapping spec's own §16 opening sentence names §24.9 the **exclusive** owner, so correcting §18 removes an
internal inconsistency rather than overruling anything. Runtime "Round 4 Decision A" is superseded in spec.
**No allocation formula was introduced or altered.**

## 2. CANONICAL_ALLOCATION_CONTRACT (confirmed against the shipped engine, unchanged)

```
pool key                company || country || Master SKU          dedup by warehouse_id, NEVER by marketplace
warehouse eligibility   company + country + warehouse_type='3PL' + is_active === true (tri-state; blank excluded)
company/country         hard isolation — §16 R1, never across either
fulfillment             does NOT gate participation (§16 R2, 2026-07-22): a platform site may hold 3PL reserve
sibling set             every marketplace_sku at that scope, regardless of fulfillment model
18-day survival         minNeed = CEILING(dailyDemand × 18)                                           §24.4
  pool ≥ Σ minNeed      NORMAL_ALLOCATION — each site fully protected, SURPLUS LEFT UNALLOCATED
  pool <  Σ minNeed     SHORTAGE_ALLOCATION — weight = minNeed × MAX(allocation_priority, 1),
                        floor() then deterministic largest-remainder, tiebreak priority → larger unmet
                        need → stable key
integer + conservation  floor + single-unit remainder loop, each site capped at its own minNeed;
                        the loop breaks when every site is capped ⇒ Σ allocated ≤ pool, always, and
                        unallocatedPool = pool − Σ allocated is reported rather than hidden
empty / missing         NO_ELIGIBLE_3PL → 'No 3PL' · MISSING_SNAPSHOT → 'No Data' · NO_DEMAND mode → nothing
                        allocated; a state label is shown, never a fallback number
demand basis            sales_driven → §22 canonical Avg Sales/Day; forecast_driven → planning 2-month FC ÷ 60,
                        and a Target-Rule refusal yields ZERO planning demand, never an invented number
```

## 3. DB_TOUCH_PREFLIGHT

```
TABLES READ (unchanged, already first-layer)   overseas_inventory_snapshot · warehouses · marketplaces ·
                                               marketplace_skus · amazon_weekly_sales_snapshot ·
                                               fc_regular_forecast · fc_target_rules
TABLES WRITTEN                                 NONE
ROWS MODIFIED                                  0
SCHEMA_CHANGE_REQUIRED                         NO
MIGRATION / BACKFILL                           NONE
NEW PERSISTED FIELD                            NONE
```

**SCHEMA_CHANGE_REQUIRED = NO.** Option C is a display selection over values that already exist in memory.

## 4. ALLOCATION_OUTPUT_LINEAGE — reuse confirmed, recomputation NOT required

The task asks this explicitly. **`sitePlanningAllocation` already runs once per row and its full result is
already attached to the row.**

```
IR:12222   var thirdPartyPlan = IR.sitePlanningAllocation({ scope, overseasRows, warehouses, mpSkus,
                                   marketplacesReg, weeklyRows, fcRows, targetRules });
IR:12320   thirdPartyPlan: thirdPartyPlan        <- the WHOLE result, already on the row
```

Fields available today, with no new call, no new request and no new field on any API:

```
sitePlanningAvailable   this site's allocated share        <- becomes the PRIMARY value
physicalPool            Σ available_stock, eligible 3PL    <- becomes the SECONDARY value
allocatedToCurrent · allocatedToOthers · unallocatedPool · minNeed · allocationMode · allocationBasis ·
coverageRate · contributions · eligibleCount · snapshotAt · siteCount · warn · state
```

The current display deliberately discards `sitePlanningAvailable` and renders
`buildPhysicalThirdPartyBreakdown(plan).total` instead (IR:12234-12243, "Round 4 Decision A"). **Option C is a
one-value swap plus a secondary label**, not a new computation.

Marketplace / SKU identity mapping: the row's scope carries `company`, `country`, `marketplace`,
`marketplaceId` and Master `sku`; sibling sites are keyed on `marketplaceId` (falling back to the
`company|country|marketplace` composite) — unchanged.

## 5. API_CONTRACT_IMPACT — NONE

No action added, no request field added, no response field added or removed, no contract version moved. The
first-layer `only` list is unchanged (`overseas_inventory_snapshot` and `warehouses` are already first-layer
tables). **No Apps Script file is touched, so no deployment version is required.**

## 6. FRONTEND_CHANGE_PLAN (Phase 3 — prepared, not implemented)

```
1  IR:12241-12243   thirdPartyDisplay := planning-available formatting
                    state labels unchanged: NO_ELIGIBLE_3PL -> 'No 3PL', MISSING_SNAPSHOT -> 'No Data'
                    a numeric 0 that is a REAL allocation must render 0, never '—'
2  IR:12322         _irThirdPartyTitle / _irRenderThirdPartyDetail already carry the pool and the split;
                    the pool becomes the labelled SECONDARY value in the cell, not only in the tooltip
3  IR:12319         delete the stale comment "// Site Planning Available (or state label)" — it has said
                    the right thing above the wrong value since Round 4
4  copy             the column header and the secondary label must make "shared" unmistakable
                    (§24.9: "Never label site Planning Available as confirmed site-owned physical stock")
5  header/body      the cell count does NOT change — one cell, two values. No leaf-span impact
```

**Interaction with the open S8-SITE-INVENTORY-RENDER-INTEGRITY-R1 round:** that round repairs
`data-leaf-span` and the fulfillment-aware Current Stock visibility (§7 of this task's Phase 3). Option C adds
no column and removes none, so the two are **independent** — but both touch the same render region and the
same cache token, so they must be sequenced, not merged.

## 7. FULFILLMENT_MODEL_BEHAVIOR

```
self_fulfilled      platform Current Stock hidden (already shipped). 3rd Party column = Planning Available
                    primary + Shared Pool secondary. §24.9 FBM branch.
platform_fulfilled  Current Stock retained. The 3PL value is the "3PL Replenishment Reserve" of §24.9 —
                    shown, and MUST NOT be added into FBA Current Stock (separate buckets, separate lineage).
hybrid              both inventory sections remain visible (§16 Rule 4). NO ambiguity, NO decision gate.
unknown / blank     fail-safe to the full column structure (existing behaviour, unchanged).
```

Participation is warehouse-side only (§16 R2) — fulfillment model never gates whether a site receives an
allocation, only how the result is labelled and which columns are visible.

## 8. DOUBLE_COUNTING_GUARDS

```
within Site Inventory   Option C IS the guard: Σ(displayed primary) ≤ pool by construction (§2 conservation).
                        Today Σ(displayed) = N × pool across N marketplaces.
exports                 NONE AT RISK. The only Blob/CSV in the page is the marketplace_skus IMPORT TEMPLATE
                        (IR:12912-12918) and it does not carry this column. No Site Inventory export emits it.
summaries               no Site Inventory summary row totals this column.
downstream quantities    unchanged — Suggested Qty comes from the materialized gap, which allocates the same
                        pool once across the competing receiver set (43_api_v1_gap_materialization.gs:399).
                        The page's needBuckets() is a zero stub. Option C touches display only.
```

> **CROSS-PAGE INCONSISTENCY — flagged, NOT in scope, and it should not be discovered later as a regression.**
> `request-order.js` computes its own `thirdParty(sku, country)` (:489) — scoped by **SKU + country only**: no
> company filter, no `warehouse_type='3PL'`, no `is_active`, and no allocation — and renders it at :2050.
> After Option C ships, **Site Inventory will show this site's share while Order Planning still shows the
> undivided pool for the same SKU**, and Order Planning's figure additionally crosses the company boundary
> that §16 Rule 1 forbids. That is a pre-existing defect, independent of this decision. It needs its own
> round; Option C neither creates nor repairs it.

## 9. REGRESSION_PLAN

```
NEW          Option C display contract: primary = sitePlanningAvailable; secondary = physicalPool, labelled;
             Σ(primary over sibling marketplaces) ≤ pool; a real 0 renders 0; state labels preserved;
             no cell-count change. Mutants: swap primary back to the pool; drop the secondary label;
             render '—' for a real 0.
RE-RUN       site-inventory-fulfillment-aware-columns-f1-7n-r1 ·
             live-inventory-render-ai-action-and-deployment-identity-f1-7n-fb-4e-r4b-r3 (cell counts) ·
             supply-planning-allocation-facts-f1-5a · replen-header-toggle (BASELINE-FAILING, unrelated) ·
             presentation-state-and-resting-layout-s8-r4d-f1b ·
             notice-visibility-and-resting-layout-s8-r4d-f1b-r3 · cache-token-rotation-s8-r4c-p1
UNCHANGED    every gap / Suggested Qty assertion must be byte-identical — if one moves, Option C has leaked
             out of the display layer and the round stops
SWEEP        canonical 620-suite serial sweep against the 6-suite baseline
```

## 10. FILES_TO_CHANGE (if implementation is authorized)

```
ALLOWED        assets/js/pages/inventory-replenishment.js    display selection + the stale comment
               assets/css/pages/inventory-replenishment.css  ONLY if the secondary value needs a class
               assets/tests/**                               new Option C suite + re-runs
               index.html · assets/js/app.js · assets/tests/_release-order.js   application token
               docs/planning/**                              record
DO-NOT-TOUCH   _allocateShared · sitePlanningAllocation · sharedPhysicalPool · eligible3plWarehouses
               43_api_v1_gap_materialization.gs · any Apps Script file · any DB row
               the F1A scope guard · F1B preload/commit · the R3 notice position
               request-order.js (the cross-page defect above — separate round)
```

## 11. DECISION_GATES_REMAINING

```
GATE C-1  OPEN   Does the PLATFORM_FULFILLED lane label its 3PL value "3PL Replenishment Reserve" (§24.9's
                 own words) while self_fulfilled says "Planning Available"? §24.9 names both, so the contract
                 is clear; what is NOT decided is whether one column header can carry two labels or whether
                 the header text varies by fulfillment model. This is copy + header behaviour, not formula.
GATE C-2  OPEN   Secondary presentation inside one cell: "420 / 1,200 shared" vs a two-line cell vs primary
                 in the cell with the pool in a persistent sub-label. Affects the compact layout and the
                 sticky column widths. Pure UI.
NOT A GATE       hybrid (§16 R4 settles it) · allocation policy (frozen, untouched) · schema (none)
```

## 12. IMPLEMENTATION_AUTHORIZATION_REQUIRED — YES

Nothing was implemented. Phase 1's spec updates are complete and are the only writes in this round. Runtime
work needs: Option C authorization to proceed **plus** answers to C-1 and C-2, **plus** a sequencing decision
against the open render-integrity round (both touch the same render region and the same cache token).

**No new persisted allocation field, no database write, no API redesign and no allocation policy change is
required** — so no separate STOP under Phase 2's condition is triggered.
