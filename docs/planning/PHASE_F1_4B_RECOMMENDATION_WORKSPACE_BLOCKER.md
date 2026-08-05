# Phase F1-4B — Read-Only Recommendation Workspace API Seam — Readiness + BLOCKER

> **Status: READINESS AUDIT COMPLETE — IMPLEMENTATION HALTED (2026-08-05).** Per the round's §2 first
> checkpoint ("Before editing, produce a short source-proven table") and its HALT rule, this is the deliverable.
> The API/Apps-Script seam that F1-4A had to defer is now *in scope* — so F1-4A's blocker #1 (no read-API) is
> **resolved by this round's mandate**. But a **deeper, distinct blocker** surfaces on source-proof: the
> recommendation runtime **cannot produce `recommendedQty` for the Inventory Replenishment scope without inventing
> missing source data** — the planning-facts producer (gap / net-order-need + receiver survival-weight-eligibility
> + D-3 destination routing) is **caller-owned and NOT IMPLEMENTED**. This is exactly the round's **HALT condition
> #2** (and D-3 touches #3). No runtime / API / page code changed. Evidence is code-verified (file:line).

---

## A. One-line result

The read-only seam is *structurally* buildable (the server path already exists —
[`27_recommendation_production_source.gs`](../../assets/specs/active/apps-script/27_recommendation_production_source.gs)
`buildProductionRecommendationSource_`, explicitly "kept for a future authorized read-only route"), **but wiring it
would return `BLOCKED` for every real page scope**, because the production projection **routes, never computes** the
planning facts a recommendation needs. Producing them from the canonical DB is the still-missing
**Recommendation Planning-Facts Projection Runtime** (SC-1 "single biggest freeze finding" / SC-9 #1 remainder) — a
**formula/runtime build**, which this round forbids ("Do not create new formulas"; §6 "Do not duplicate or rewrite …
gap formula … order quantity formula"). Emitting a recommendation anyway would violate "Do not output fake zeroes as
canonical recommendation results."

---

## B. §2 Readiness table (source-proven)

| Requirement | Status | Source (file:line) |
|---|---|---|
| F1-3b production Qualified-Incoming bridge connected | **PARTIAL** — *supply* lifecycle only | `supply-planning-source-projection.js:249-342` routes `shipping_plans`/`shipments` through canonical `KMSF.projectSupplyLifecycle` (§2E `evaluateQualifiedIncoming` + §39.5 + `buildSupplyLedger`). **Demand/planning-facts side not produced** (rows below). |
| Current Stock input authority available | **YES** | `supply-planning-source-projection.js:205-247` — FBA `amazon_inventory_snapshot.available_qty`, THREE_PL `overseas_inventory_snapshot.wh_available_stock`, FACTORY `factory_stock.fac_current_stock` → `lifecycle_bucket:'CURRENT_STOCK'` supply rows. |
| Forecast/Demand source available | **PARTIAL / CALLER-GATED** | `:156-199` assembles demand from `fc_regular_forecast[forecastMonth]` + `fc_special_events.fc_qty`, but **requires caller `input.forecastMonth`** (`:163` else `MISSING_FORECAST`), `input.requiredByDate` (`:159`), and a resolvable **destination** (`:174-175`/`:192-193` else `MISSING_DESTINATION_WAREHOUSE`). |
| Qualified Incoming output available | **YES** (as supply-ledger `SHIPPED_IN_TRANSIT`) | `:249-342` (F1-3b canonical bridge); reachable buckets APPROVED_SHIPPING_PLAN / SHIPPED_IN_TRANSIT / CURRENT_STOCK. |
| Existing `recommendedQty` resolver callable server-side | **YES, but requires planning facts** | `supply-planning-production-source.js:109-129` `buildProductionRecommendationSource` → `KMSP.projectAndRead` → resolver `supply-planning-source-facts.js:566-707` (`resolveWeeklyRecommendationFacts`) / `:720-833` (Monthly). |
| Existing page SKU/scope identity sufficient | **NO** | Page supplies scope `{planning_cycle,company,country,marketplace}` but **no `destinationWarehouseId`, no `windowCode`/`requestMonth`, no `calculatedGap`/`netOrderNeed`, no receiver/factory facts** (F1-4A audit §C; D-3 `RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` SC-11.3). |
| Read-only API implementable without DB/schema changes | **YES (structurally)** — but returns BLOCKED for real scope | Server path present (`27_…gs`); Weekly-Workspace DI pattern (`40_api_v1_weekly_workspace.gs`) mirrors cleanly; no schema/header write needed. |

---

## C. The blocker — planning facts are ROUTED, not COMPUTED (HALT #2)

The production projection's own header is explicit:
> `supply-planning-source-projection.js:25` — "(windowCode / requestMonth / requestBucket / **calculatedGap** /
> netOrderNeed) are **CALLER-OWNED** (frozen contract)".

And the code proves it:

- **Planning facts are a pass-through of `input.planningFacts`** (`:345-356`): Weekly sets
  `row.window_code = f.windowCode; row.calculated_gap_qty = f.calculatedGap;` Monthly sets
  `row.net_order_need_snapshot = f.netOrderNeed`. Nothing derives them.
- **Fail-closed presence gate** (`:403-407`): `demand + supply + planningFacts` must all have produced rows, else
  `hardReason = 'SOURCE_NOT_AVAILABLE'` → `ready:false` (BLOCKED). `planningRows` comes *only* from caller facts, so
  **no caller planning facts → BLOCKED**.
- **Receiver / factory allocation facts are caller-owned too** (`:358-377`): `survival_need_qty`, `daily_demand`,
  `demand_weight`, `eligible_pool_types`, `eligible_factory_warehouse_ids` are copied from `input.receiverFacts` /
  `input.factoryDemandFacts`; without them the allocator yields no allocated source, so the Weekly resolver's
  `recommendedQty` (FLOOR over *allocated* source, `supply-planning-source-facts.js:638-646`) is 0/blocked even if a
  gap were supplied.
- **Destination is caller-owned (D-3)** (`:147-154`, `:174-175`, `:192-193`): with no `factHint`, no `routing[ref]`,
  and no `scope.destinationWarehouseId`, every demand row is dropped with `MISSING_DESTINATION_WAREHOUSE`.

The resolver's `calculateGap` owner is frozen and *can* compute a gap from the four raw inputs
(`supply-planning-source-facts.js:588-596`: `demand`, `destinationCurrentStock`, `timelyQualifiedIncoming`,
`timelyApprovedCommittedSupply`) — **but nothing produces those four inputs from the canonical DB for a fresh scope.**
This is precisely the contract's own "single biggest freeze finding"
(`RECOMMENDATION_SOURCE_CONTRACT_SPEC.md` SC-1, ~L131-140): *"there is NO implemented Forecast/Sales/warehouse →
planning-facts projector … today they are caller-supplied DTO facts with no persisted producer."* The implemented
"Projection Runtime" (Round 1S-P1.5B) assembles **demand + supply** rows from snapshots; it deliberately leaves the
**planning facts** (gap / net-order-need / survival / weight / eligibility / destination) to the caller.

The **only** callers that supply those facts today are the **test fixtures** (Weekly 96 / Monthly 24 come from crafted
`planningFacts`/`receiverFacts`, not from the DB). The Inventory Replenishment page supplies none.

### Net effect of wiring the seam now
A `recommendation.workspace.get` scoped to `{company,country,marketplace}` (what the page can send) →
`buildProductionRecommendationSource` → `ready:false`, `reason:'SOURCE_NOT_AVAILABLE'` /
`MISSING_DESTINATION_WAREHOUSE` / `MISSING_FORECAST` → **no lines, no `recommendedQty`**. Suggested Qty — the point of
the round — is unobtainable without inventing the gap / allocation / destination facts. Of the three target fields,
only Current Stock and Qualified Incoming are computed at all (in the supply ledger), and they are reachable only if
the whole chain reaches `ready`, which it will not for the page scope. Surfacing them alone through a chain that
BLOCKS would be a fabricated partial success.

---

## D. Why this is HALT, not "implement with honest empty state"

The round's §2 is unambiguous: **"HALT before implementation only if … (2) The resolver cannot produce recommendedQty
without inventing missing source data."** That condition is met. When it is met, the rule is: *"make no runtime/API/
page code changes; document the exact missing dependency; provide the smallest next slice; create only a docs
checkpoint."* Building the API + router + Foundation flag + page wiring + ~30 tests that assert *BLOCKED for every real
call* would (a) breach the explicit "make no code changes" HALT instruction, and (b) be unable to satisfy §17
acceptance ("Suggested Qty is source-proven"; "Existing canonical runtime is invoked", returning real values). D-3
(caller-owned destination; the page has none) independently trips the same wall.

Delta vs F1-4A: F1-4A halted on *"no read-API / server-side only"* (its blocker #1) **and** on Coverage/DOS/Projected/
Reason not existing (#2). F1-4B's mandate dissolves F1-4A #1 (the seam is now allowed, and in fact already stubbed in
`27_…gs`). What remains — and is fatal for *this* round — is a blocker F1-4A also named in passing: the recommendation
needs a **source DTO the page cannot build**, and no runtime builds it from the DB. F1-4B makes that concrete and
cited: it is the **planning-facts producer**, not the API seam, that is missing.

---

## E. Smallest next slice (recommended, separately authorized)

**F1-4B-PRE — Recommendation Planning-Facts Projection Runtime** (SC-1 convergent gap / SC-9 #1 remainder). A pure
runtime that, from the canonical DB rows the projection already reads, PRODUCES the caller-owned planning facts the
resolver consumes:

1. **Demand → gap inputs**: demand-entry assembly (already present, `:156-199`) → per-line `demand`,
   `destinationCurrentStock` (from the CURRENT_STOCK supply rows), `timelyQualifiedIncoming` (from the F1-3b
   SHIPPED_IN_TRANSIT ledger), `timelyApprovedCommittedSupply` → **Engine-A `calculateGap`** (frozen owner; *invoked,
   not rewritten*) → Weekly `calculatedGap`.
2. **Monthly** `netOrderNeed` via the frozen Engine-A→B `sumRemainingShortages` (§12/§32) — invoked, not rewritten.
3. **Receiver / factory facts**: `survivalNeedQty` (§20.3/§24.4), `dailyDemand` (§22/§2D), `demandWeight` (§7/§24.5),
   `eligiblePoolTypes` (§23.6/§24.9), `eligibleFactoryWarehouseIds` (§40/§35) — from `marketplaces`/`marketplace_skus`/
   `warehouses` + forecast/sales — invoking the frozen owners.
4. **D-3 destination**: resolve `destinationWarehouseId` from a caller/planning-scope routing input (the page must
   provide an explicit destination selection per SC-11.3 — a small page/UX prerequisite, not an inference).

Because #1–#3 *invoke frozen calc owners* rather than authoring new math, F1-4B-PRE is closer to a **wiring/projection**
round than a formula round — but it still crosses this round's "no new formula logic / no planning-facts derivation"
line, so it must be **authorized on its own** (it is the SC-1 producer that SC-5/SC-9 always named as the prerequisite).

**Then F1-4B (this seam) becomes meaningful**: `recommendation.workspace.get` → `buildProductionRecommendationSource`
now returns real `recommendedQty` + `calculatedGap`, plus Current Stock + Qualified Incoming from the ledger; the page
replaces its `suggestedQty`/`onTheWay` stubs. F1-5 (Coverage/DOS/Projected/Reason) stays separate and later.

Until F1-4B-PRE lands, the page's honest stubs (`onTheWay:0`, `suggestedQty:0`, `status:'Sufficient'`) must remain — a
BLOCKED-for-everything API is not preferable to the stub.

---

## F. Governance

No new formula, no new runtime, no recommendation/planning-facts derivation; no API / router / Foundation / page /
DB / schema / Apps Script / bundle / CSS change. F1-3b (supply lifecycle bridge) is confirmed landed at HEAD
(`source-projection.js:249-342`; commit `97df611`). Read-only audit; docs-only checkpoint. No live DB accessed. No
push, no deploy. Full suite unchanged (83/83); Golden Matrix 39/1/0; Scenario #34 Pending.
