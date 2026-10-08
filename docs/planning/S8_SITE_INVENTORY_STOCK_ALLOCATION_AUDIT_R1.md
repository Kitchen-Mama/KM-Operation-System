# S8-SITE-INVENTORY-STOCK-ALLOCATION-AUDIT-R1

```
READ-ONLY AUDIT. RUNTIME_MODIFIED = NO · DB = NO · API = NO · DEPLOYED = NO
No safety gate was touched. No allocation percentage or distribution formula was invented.
STATUS = STOPPED AT THE DECISION GATE — two canonical specs disagree.
```

## §0 — THE ANSWER IN ONE PARAGRAPH

Shopify, Target and KM Walmart show the same 3rd Party Stock number **because the Site Inventory column
deliberately renders the PHYSICAL SHARED POOL, not this site's allocation**. That is a recorded runtime
decision ("Round 4 Decision A") and it agrees with `INVENTORY_TABLE_MAPPING_SPEC.md` §18 Column Map. It
**contradicts** `SUPPLY_PLANNING_CALCULATION_RULES.md` §24.9, the canonical v4.1 display contract, which
requires the site-scoped value to be an allocation. The allocation engine that would produce that value is
**already implemented and already runs on every row** — its output is computed and then discarded for display.
The duplication is **display-only**: the backend gap engine allocates the same pool exactly once across the
competing receiver set, so Suggested Qty is not inflated.

---

## §1 — CANONICAL SOURCES READ

| spec | status |
|---|---|
| `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md` | present — §3.1, §16, §17, §18 column map |
| `docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md` | present — §20, §23.6, §24.2, §24.7, §24.9, §24.11, §25 |
| `docs/planning/DATABASE_RELATIONSHIP_MAP.md` | present |
| `docs/planning/SUPPLY_CHAIN_SYSTEM_FLOW.md` | present |
| `docs/planning/SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` | present |
| `docs/planning/SYSTEM_RUNTIME_ARCHITECTURE.md` | present |
| `project-current-state.md` | **NOT FOUND** in this repository (searched `docs/**`) |

Additional canonical material discovered and used: `docs/evidence/s6-r3-mapping-freeze/MAPPING_FREEZE.md`,
`docs/evidence/s6-r4a-live-overseas-header-and-storage-contract/LIVE_STORAGE_CONTRACT.md`,
`docs/planning/F1_UX_OVERSEAS_INVENTORY_SCOPED_IMPORT_R1.md`,
`docs/planning/F1_5B_SHIP_R2_FIFO_ALLOCATION_AUDIT.md`.

---

## §2 — THE ORIGINAL BUSINESS CONTRACT, QUESTION BY QUESTION

**1. Which marketplaces are fulfilled from overseas warehouses?**
Not a fixed list. `marketplaces.fulfillment_model` and `marketplace_skus.fulfillment_model` carry it, and
**the Marketplace SKU's model decides** (`INVENTORY_TABLE_MAPPING_SPEC.md` §16 Rule 4). Runtime:
`IR.resolveFulfillment(scopeMktReg, mp)` — `inventory-replenishment.js:12292`.
*Self* → 3PL is the primary inventory; *Hybrid* → both shown; *Platform/FBA* → FBA is a separate bucket.

**2. How does Company determine eligible warehouses?**
`company` must match, and it is resolved from the **warehouse**, not the row:
`overseas_inventory_snapshot` is keyed by `warehouse_id + sku`; company/country are resolved via `warehouses`
at read time and are **not stored on the snapshot rows** (`INVENTORY_TABLE_MAPPING_SPEC.md` §18, line "keyed
by `warehouse_id + sku` … resolved via `warehouses` at read time — not stored on the rows").
Runtime: `eligible3plWarehouses()` — `inventory-replenishment.js:9...` (`IR` module, function at :758 region).

**3. How does Country / Marketplace affect eligibility?**
Country **must** match. Marketplace does **not** gate eligibility at all:
> §16 Rule 1 — "Allocate inventory **only within the same Company and same Country**. **Never** allocate
> across companies or across countries."
> §16 Rule 2 (2026-07-22 addendum) — eligibility is **warehouse-side only**
> (`company + country + warehouse_type='3PL' + is_active`), **never** marketplace fulfillment model.
Runtime matches exactly: `eligible3plWarehouses` filters company, country, `warehouseType === '3PL'`,
`isActive === true` (tri-state: blank/unknown excluded).

**4. Can multiple marketplaces share the same physical stock pool?**
**Yes — that is the design.** The pool is `company + country + Master SKU`; sibling sites are *every* scoped
`marketplace_sku` in that scope "regardless of fulfillment model", each contributing an 18-day need
(`sitePlanningAllocation`, `inventory-replenishment.js:741-745`).

**5. Allocated by which key?**
`company || canonical country || Master SKU`, deduplicated **by `warehouse_id`, never by marketplace**
(`sharedPhysicalPool`, :772 comment). The backend uses the identical key:
`gapStr_(meta.company) + '||' + meta.country + '||' + sku`
(`assets/specs/active/apps-script/43_api_v1_gap_materialization.gs:432`).

**6. Are reservations / commitments / pending shipments deducted?**
The pool is built from **`wh_available_stock`**, which is already net of reserved and damaged
(`overseas_inventory_snapshot` carries `wh_physical_stock`, `wh_available_stock`, `wh_reserved_stock`,
`wh_damaged_stock` — `INVENTORY_TABLE_MAPPING_SPEC.md` §3.1/§103). Pending shipments are **not** subtracted
and must not be: "a quantity transitioned to SHIPPED_IN_TRANSIT lives in `shipments` … never in these
snapshots — so NO heuristic subtraction and NO SKU+qty dedup" (`43_api_v1_gap_materialization.gs:408-410`).

**7. What does the Site Inventory stock column actually represent?**
**Today: the physical shared pool.** `inventory-replenishment.js:12234-12243` —
> "3rd Party Stock card = **PHYSICAL 3PL availability (Round 4 Decision A)** … **it is NEVER
> sitePlanningAvailable** (the 18-day virtual planning allocation stays in the planning path only)."
`thirdPartyDisplay = buildPhysicalThirdPartyBreakdown(thirdPartyPlan).total`, formatted with
`toLocaleString()`. **The field comment one screen later still says `// Site Planning Available (or state
label)` (:12319) — that comment is stale and states the opposite of the code.**

**8. How are duplicate counting and overselling prevented?**
At the **backend**, by allocating once across the complete receiver set:
> "the allocation MUST be computed ONCE across the complete bounded receiver set and only then fed back into
> each receiver's own projection — **never one marketplace at a time (which would duplicate a shared pool)**"
> (`43_api_v1_gap_materialization.gs:399-401`)
Overseas and Factory are independent pools, independently conserved; FBA is excluded from the 3PL lane so it
is never double-counted. **At the frontend display layer there is no such protection, by decision.**

**9. Physical vs allocated vs available.**
```
wh_physical_stock      everything in the warehouse
wh_available_stock     physical − reserved − damaged      <- what the pool is built from
physicalPool           Σ wh_available_stock over eligible 3PL warehouses (company+country+SKU)
sitePlanningAvailable  THIS site's share of physicalPool after the 18-day + priority allocation
```
§24.9: "**Never** label site Planning Available as confirmed site-owned physical stock."

**10. Implemented / missing / contradictory.**
```
IMPLEMENTED    warehouse eligibility (company+country+3PL+active)        inventory-replenishment.js eligible3plWarehouses
               shared pool, dedup by warehouse_id                        sharedPhysicalPool
               18-day protected need, CEILING(daily x 18)                sitePlanningAllocation (§24.4)
               shortage split weighted minNeed x allocation_priority,    _allocateShared (§24.7)
               largest-remainder with priority tiebreak
               backend allocate-once across the competing receiver set   43_api_v1_gap_materialization.gs
MISSING        the §24.9 display contract: the site-scoped column shows the POOL, not the allocation
               the FBA four-bucket layout (FBA Current Stock · 3PL Replenishment Reserve · Qualified
               On-the-Way · Calculated Gap) is not what the first layer renders
CONTRADICTORY  INVENTORY_TABLE_MAPPING_SPEC §18 column map  vs  SUPPLY_PLANNING_CALCULATION_RULES §24.9
               and the stale `// Site Planning Available` comment at inventory-replenishment.js:12319
```

---

## §3 — RUNTIME LINEAGE

```
overseas_inventory_snapshot (warehouse_id + sku; wh_available_stock)
  -> warehouses join: company, country, warehouse_type='3PL', is_active   [company/country NOT on the row]
  -> 60_ workspace first layer: 'overseas_inventory_snapshot' + 'warehouses' are both first-layer tables
     (IR_FIRST_LAYER_TABLES_, inventory-replenishment.js:9022-9028)
  -> IR.sitePlanningAllocation(...)                         inventory-replenishment.js:12222
       |- sharedPhysicalPool  -> physicalPool
       |- _allocateShared     -> sitePlanningAvailable        <-- COMPUTED
  -> thirdPartyDisplay = buildPhysicalThirdPartyBreakdown(plan).total   <-- POOL rendered
  -> row.thirdPartyStock (a FORMATTED STRING)              :12319
  -> rendered at :1809 · request-order.js:2050 · forecast.js:1667
```

**Do Shopify, Target and KM Walmart receive the same raw quantity?** **Yes — identical**, whenever they share
company + country + Master SKU and at least one eligible 3PL warehouse. Nothing in the display path varies by
marketplace. `sitePlanningAvailable` — which does vary — is carried on the row inside `thirdPartyPlan` and is
used only by the expanded detail and tooltip (`_irRenderThirdPartyDetail`, `_irThirdPartyTitle`).

**Display-only, or does it propagate?** **DISPLAY-ONLY.** Three independent proofs:

1. The page's own need engine is a **stub**: `needBuckets()` returns
   `{ need0_18: 0, need19_30: 0, need31_45: 0, need46_90: 0, suggestedQty: 0 }` (`inventory-replenishment.js`,
   called at :12252). The page contributes nothing to Suggested Qty.
2. The real Suggested Qty comes from the **materialized gap** (`_irMatState.bySku[sku].d90_suggested_qty` via
   `_irSuggestedQtyState_`), computed server-side.
3. The server computes it from an **allocated** pool, once per competing set, with the explicit prohibition
   against per-marketplace evaluation quoted in §2.8.

A fourth, structural barrier: the displayed value is a `toLocaleString()` **string** (`"1,200"`), so it cannot
enter arithmetic without parsing. That is a latent trap rather than a safeguard, and is recorded as such.

---

## §4 — SCENARIO PROOF (deterministic, from source; no live data touched)

Take Master SKU `S`, company `KM`, country `US`, eligible 3PL warehouses `W1 (700)` + `W2 (500)` on
`wh_available_stock`, and three competing marketplace_skus: Shopify, Target, KM Walmart.

```
actual warehouse stock          W1 700 · W2 500
eligible pool (co+country+SKU)  1,200          sharedPhysicalPool — dedup by warehouse_id, not by marketplace
allocation (18-day need)        per site CEILING(daily x 18); surplus stays UNALLOCATED when pool >= sum(need)
                                shortage -> pool x (minNeed x allocation_priority) / sum, largest remainder
Site Inventory displayed        Shopify 1,200 · Target 1,200 · KM Walmart 1,200     <-- the pool, three times
quantity in downstream calc     the backend's allocated share, summing to <= 1,200   <-- conserved
```

The displayed column therefore sums to **3,600 across three rows against a 1,200 pool**, while the number that
drives replenishment does not. Any operator totalling the column across marketplaces is reading 3×.

---

## §5 — THE CONFLICT (why this stops at the gate)

```
SUPPLY_PLANNING_CALCULATION_RULES.md §24.9  (CANONICAL v4.1)
  self_fulfilled/FBM : primary value = "Planning Available"  [= the ALLOCATION]
                       expanded detail = Physical Shared Pool · Allocated to Current Site · Allocated to
                       Other Sites · Unallocated Pool · Reserved · Damaged · ... · Allocation Priority
                       "Never label site Planning Available as confirmed site-owned physical stock."
  platform_fulfilled : four separate buckets incl. "3PL Replenishment Reserve (shared-pool ALLOCATION for
                       this scope)", shown but never merged into FBA Current Stock

INVENTORY_TABLE_MAPPING_SPEC.md §18 column map
  3rd Party Stock = "total available stock across eligible Overseas Warehouses
                     (overseas_inventory_snapshot.available_stock, eligible warehouses only)"   [= the POOL]

RUNTIME, "Round 4 Decision A"   inventory-replenishment.js:12234
  physical 3PL availability; "it is NEVER sitePlanningAvailable"                                 [= the POOL]
```

Two further facts make this a decision rather than a bug report:

* **The mapping spec subordinates itself.** §16 opens: *"This chapter is a UI / data-mapping summary and
  consumer. The authoritative overseas allocation formula is owned **exclusively** by
  `SUPPLY_PLANNING_CALCULATION_RULES.md` §20; this section only maps / displays that owner output and does
  not own or generate the rule."* On its own terms, §18's column map cannot overrule §24.9 — which makes the
  mapping spec **internally inconsistent**, not merely in tension with the rules spec.
* **The identical defect class was already fixed elsewhere in this very file.** The Factory CN/TW columns once
  showed the undivided pool; F1-7N-FB-4E-R4B-R1 §1 split them into per-site allocations, and the surviving
  comment reads: *"It must NEVER be rendered in a marketplace-scoped column again: that is the defect (one
  pool shown N times as if each site owned it)."* The 3rd Party column does exactly that, by a later decision.

---

## §6 — DELIVERABLES

```
CANONICAL_ALLOCATION_RULES
  §16 R1 same company AND same country only, never across either
  §16 R2 warehouse-side eligibility only (company+country+3PL+is_active); fulfillment model does NOT gate
         participation in the 3PL replenishment reserve (2026-07-22 addendum)
  §16 R3 self-fulfilled uses shared overseas inventory; allocation REQUIRED
  §16 R4 hybrid shows both platform and 3rd-party; the marketplace_sku model decides fulfillment
  §16 R5 18-day minimum survival first, highest priority           §24.4 CEILING(daily x 18)
  §16 R6 remainder by marketplaces.allocation_priority, higher = higher   §24.7 weighted largest-remainder
  §24.2 FBA source precedence: snapshot preferred, estimated ledger fallback, never both, never redistributed
  No allocation percentage or distribution formula was invented; all of the above are quoted owners.

WAREHOUSE_MARKETPLACE_MAPPING
  NONE — and that is the contract. There is no warehouse->marketplace mapping table. Warehouses are eligible
  per company+country, and marketplaces compete for the resulting pool. Any per-marketplace warehouse
  assignment would be a NEW business rule, not a repair.

COMPANY_BOUNDARY
  Hard. Company is resolved from `warehouses`, never from the snapshot row. KM and ResUS in the same country
  are separate pools because their marketplace_ids differ and the warehouse carries the company.

PHYSICAL_VS_AVAILABLE_STOCK
  physical = wh_physical_stock · available = wh_available_stock (net of reserved + damaged) · pool = sum of
  available over eligible warehouses · planning available = this site's allocated share of that pool.
  Pending shipments are NOT deducted anywhere, deliberately (they live in `shipments`).

DUPLICATE_COUNTING_RISK
  DISPLAY LAYER: PRESENT AND REALISED. N marketplaces in one company+country show the same pool; the column
  sums to N x pool. An operator totalling it, or exporting it, over-counts by N.
  CALCULATION LAYER: NOT PRESENT. Allocated once server-side across the competing receiver set.
  LATENT: the displayed value is a formatted string, so a future consumer doing arithmetic gets NaN rather
  than an inflated number. That is luck, not design.

CURRENT_RUNTIME_BEHAVIOR
  Site Inventory 3rd Party Stock = physical shared pool (Round 4 Decision A), identical for every marketplace
  in the scope. The 18-day/priority allocation IS computed for every row and is used only for the expanded
  detail and the tooltip.

SPEC_RUNTIME_DIFF
  §24.9 requires the site-scoped primary value to be the ALLOCATION. Runtime renders the POOL.
  §18 column map agrees with the runtime and contradicts §24.9, while §16 declares §24.9 the exclusive owner.
  Stale code comment: inventory-replenishment.js:12319 says "// Site Planning Available (or state label)"
  and the code three lines earlier says it is never that.

DOWNSTREAM_IMPACT
  NONE on quantities. Suggested Qty / gap come from 43_api_v1_gap_materialization.gs, which allocates once.
  The page's needBuckets() is a zero stub. Consumers of row.thirdPartyStock (inventory-replenishment.js:1809,
  request-order.js:2050, forecast.js:1667) are all render-only.
  IMPACT ON JUDGEMENT: real. Three sites each appearing to hold the full pool invites over-committing it.

ROOT_CAUSE_STATUS
  CONFIRMED as behaviour and location. NOT A DEFECT UNTIL A POLICY IS CHOSEN — the runtime implements one
  canonical spec and contradicts another.

RECOMMENDED_FIX_SCOPE
  Frontend display only, IF option B or C is chosen. The allocation engine, the eligibility rules, the
  backend and the DB all stay untouched: sitePlanningAvailable is already computed on every row.
  Files that would change: assets/js/pages/inventory-replenishment.js (the thirdPartyDisplay selection and
  the stale comment), plus the column header/tooltip copy, plus whichever spec the decision amends.
  No DB column, no API field, no Apps Script change.

DECISION_GATE_REQUIRED
  YES.
```

---

## §7 — DECISION GATE: THE THREE BUSINESS ALTERNATIVES

**A — KEEP the physical pool (status quo).** Every marketplace in a company+country shows the same number.
*Consequences:* no code change; §24.9 must be formally amended to say the site column shows the pool; the
column must be re-labelled so it cannot be read as site-owned ("Shared 3PL Pool" rather than "3rd Party
Stock"); the Factory precedent in the same page is then inconsistent with it.

**B — SHOW Planning Available (what §24.9 already specifies).** The column becomes this site's allocated
share; the pool moves to the expanded detail, where it is already rendered.
*Consequences:* numbers become site-specific and conserve across marketplaces; the displayed figure for any
one site **drops**, which will look like inventory disappearing until it is explained; `§18` column map must
be amended; Round 4 Decision A is reversed. Zero new engine — the value is already computed.

**C — SHOW BOTH in the column** (allocation as the primary number, pool as secondary), which is literally
what §24.9's FBA branch asks for with its four separate buckets.
*Consequences:* nothing is lost and the shared nature becomes visible at a glance; the column carries two
values, so the header contract and the compact layout change; it satisfies both specs without amending
either's intent, though §18's wording still needs correcting.

**What I would recommend, and why it is still your decision:** **C**, falling back to **B**. §24.9 is the
exclusive owner by §16's own words, both of its branches describe an allocation, and the repository has
already ruled that rendering one pool under N marketplace scopes is "the defect". But A is a legitimate
business position — an operator who wants to see what physically exists before deciding how to split it is
asking for the pool — and it is the shipped behaviour, so changing it alters what every planner currently
believes they have. **I am not choosing an allocation policy.**

**One correction to make regardless of the outcome:** the comment at `inventory-replenishment.js:12319` says
`// Site Planning Available (or state label)` directly above a value that is explicitly never that. Whichever
option is chosen, that line is wrong today and will mislead the next reader.
