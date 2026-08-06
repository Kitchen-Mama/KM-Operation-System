# Phase F1-4B-FM — Unified Destination-Node Recommendation Runtime — Audit + HALT (decision required)

> **Status: AUDIT COMPLETE — IMPLEMENTATION HALTED BEFORE CODE CHANGES (2026-08-06).** Per §3 ("HALT only if an
> active frozen owner explicitly contradicts this newly authorized decision, or a required canonical identity cannot
> be source-proven"). The **WAREHOUSE** fanout is buildable (F1-4B-E adapter already feeds the frozen runtime). The
> **MARKETPLACE** convergence trips both §3 triggers: (1) the frozen **Weekly** resolver caps `recommendedQty` at
> warehouse-pool allocation → a marketplace (no warehouse pool) computes to `0` on the endpoint's Weekly path, and a
> real marketplace order is the **Monthly** resolver's semantics (a *different* frozen resolver — an unspecified
> business decision); (2) MARKETPLACE **Qualified Incoming** has no source-proven identity. No code changed. Evidence
> is code-cited (both audits). Three precise decisions are escalated.

---

## A. Current call chain (F1-4B-A, `recommendationType = 'WEEKLY_SHIPPING'`)

```
recommendation.workspace.get → validate (mandatory ONE destinationWarehouseId + calcMonth + planningCycle)
  → exact Spreadsheet-ID gate → KMPS.readCanonicalSnapshots (11 tables)
  → per SKU: KMPA.assembleProductionRecommendationFacts (requires destinationWarehouseId → KMPCX validateDestination)
             KMPS.buildProductionRecommendationSource → projection (warehouse-only supply) → allocator → Weekly resolver
  → recommendationWorkspaceBuild_ → { success, data:{lines[]}, meta, errors }
```

## B. §3 required confirmations (source-verified, both audits)

1. **Warehouse-only assumptions.** KMPA `validateRequest` **hard-requires** `destinationWarehouseId`
   (`supply-planning-production-assembly.js:86` → blocks) and stamps it on every receiver/routing/businessScope
   (`:130,180,181`); KMPCX `validateDestination` requires the id to exist + be active + same-company in `warehouses`
   (`supply-planning-planning-context.js:64-76`); the allocation-input projector requires a per-receiver `dest`
   warehouse (`supply-planning-source-facts.js:451,495`); the supply projection keys **every** row by `warehouse_id`
   (`supply-planning-source-projection.js:210-211,224-225,239-240`; supply header `:382` has no marketplace column);
   qualified-incoming classifies by `destinationWarehouseId` (`supply-planning-qualified-incoming.js:129,226-227`).
2. **Functions needing destination-node support.** KMPCX `validateDestination` (§5-authorized), KMPA `validateRequest`
   (:86) + receiver/routing stamping, and the allocation-input projector's `dest` requirement.
3. **Can calculateGap / allocator / resolver remain untouched?** `calculateGap` — **YES** (4 caller-owned scalars:
   `demand`, `destinationCurrentStock`, `timelyQualifiedIncoming`, `timelyApprovedCommittedSupply`; injectable via the
   KMAF receiver passthrough `planning-context.js:194` and via `planningFacts.calculatedGap`). **Weekly** resolver —
   **NO for marketplace**: `recommendedQty = min(gap, totalAllocated)` floored (`source-facts.js:622,641-646`), and
   `totalAllocated` = pool-allocator output → `0` with no warehouse pool. **Monthly** resolver — untouched and
   allocator-independent: `recommendedQty = calculateSuggestedOrderQty(netOrderNeed, upc)` (`:804-806`).
4. **Canonical Amazon inventory source.** `amazon_inventory_snapshot.available_qty` (normalized `availableQty`,
   `operation-system-db-api.js:606`), keyed `country + marketplace + sku (+asin)` — **marketplace-level, no
   `company`/`siteSku`/`warehouse_id`** (`SOURCE_CONTRACT §442`). Source-proven for MARKETPLACE current stock.
5. **MARKETPLACE incoming without a fake warehouse.** **Not source-provable.** Shipments/plans expose only
   `destination_warehouse_id` + `destination_type` + free-text `destination`/`warehouse_code`; **no `marketplace_id`**,
   and `marketplace` may be `"MULTI"` (`operation-system-db-api.js:913-922,747-751`). qualified-incoming keys on
   `destinationWarehouseId` only. ⇒ Marketplace-destined incoming can only be surfaced as
   `MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED` (§6 pre-authorized diagnostic; incoming = 0 + diagnostic, rec still
   computes from FC + FBA stock).
6. **Does any active doc forbid `marketplace_id` as a destination identity?** **No.** `SUPPLY_PLANNING_DECISION_REGISTER.md`
   **D-F1-4B-E0R-1 AUTHORIZES** a MARKETPLACE node (marketplace identity, no fake warehouse_id). D-F1-5B-1 / SC-11.3
   only forbid *inferring* a warehouse from marketplace — not a marketplace destination. A canonical `marketplaces`
   table (`marketplace_id + status + company/country/marketplace`, `db-api.js:361-383`) can validate the destination.

## C. §3 HALT triggers (both met)

- **Trigger 1 — a frozen owner contradicts the authorized "same resolver" convergence.** §2 requires MARKETPLACE +
  WAREHOUSE to "converge into the **same existing frozen** Gap/Allocation/Recommendation resolver," and §7/§11 require
  a real marketplace `recommendedQty`. But the endpoint's Weekly resolver caps `recommendedQty` at warehouse-pool
  allocation (`source-facts.js:646`), so a marketplace destination yields **0**. Producing a real marketplace order
  requires the **Monthly** resolver's order-need formula — a *different* frozen resolver — **or** modifying the
  Weekly resolver/allocator (forbidden §2) **or** fabricating a warehouse pool/id (forbidden §2). "Which resolver a
  marketplace recommendation uses / what it means numerically" is an **unspecified business decision**.
- **Trigger 2 — a required canonical identity is not source-provable.** MARKETPLACE Qualified Incoming (see B5).
  §6 pre-authorizes a diagnostic, but it means every Amazon recommendation ships with Qualified Incoming unresolved —
  a correctness caveat to confirm, not silently assume.

## D. Decisions required (small, unblock a correct build)

- **D-1 — MARKETPLACE recommendation numerical semantics (drives the resolver).**
  - **A (recommended) — ORDER-NEED via the frozen Monthly resolver.** `recommendedQty = CEIL(gap / units_per_carton) ×
    units_per_carton` (`calculateSuggestedOrderQty`), `gap = ΣRegularFC(M+1..M+4) − FBA available_qty −
    marketplaceIncoming(UNRESOLVED→0) − 0` via the frozen `calculateGap`. **No allocator, no warehouse pool, no
    duplication** — reuses two frozen calc owners. This is "how much Amazon needs ordered." Requires routing MARKETPLACE
    to the Monthly resolver + destination-node identity refactor (D-3).
  - **B — SHIP-FROM-POOL via the Weekly resolver.** Treat the marketplace as an allocation receiver of the overseas/
    factory pools. Requires the allocation-input projector + qualified-incoming to accept a marketplace destination
    (modifying frozen allocation/qualified-incoming logic — **forbidden §2**) and still yields 0 today.
  - **Recommend A.**
- **D-2 — MARKETPLACE Qualified Incoming.** Confirm the §6 `MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED` disposition
    (incoming = 0 + diagnostic; recommendation computes from FC + FBA stock) is acceptable for Phase-1, **or** supply a
    source-proven shipment→marketplace destination mapping (none exists today).
- **D-3 — Frozen-runtime refactor scope.** §5 authorizes the KMPCX destination-node refactor. Confirm that KMPA
    (`:86` + receiver/routing stamping) and the allocation-input projector's per-receiver `dest` may also be refactored
    to accept a **destination-node identity** (marketplace_id with `warehouseId=null`) — as *destination-node support*,
    **not** an allocation-math change — so a MARKETPLACE node threads through without a fabricated warehouse_id.

## E. Recommended next round (after D-1=A, D-2 confirmed, D-3 authorized) — F1-4B-FM′

Pure `normalizeRecommendationDestination` (MARKETPLACE via `marketplaces`; WAREHOUSE via `warehouses`) + KMPCX/KMPA/
allocation-input **identity** refactor (destination-node, no warehouse fabrication) + a pure MARKETPLACE order-need
adapter (FC + FBA `available_qty` → `calculateGap` → Monthly `calculateSuggestedOrderQty`; incoming UNRESOLVED
diagnostic) + the WAREHOUSE Weekly fanout (F1-4B-E `resolveScopeWarehouseDemandFacts`) + `RECOMMENDATION_CALCULATION_MONTH`
config + `planningCycle = RECO-{YYYY-MM}` + server rule reader + bundle rebuild (build tool only) + additive response
identity (`destinationType`/`destinationRefId`/…) + scope-only page request + the compact per-destination UI + tests,
**with the 40-scenario golden matrix protected** (the identity refactor must not change any warehouse/Weekly/Monthly
golden result). WAREHOUSE alone is unblocked today; MARKETPLACE needs D-1/D-2/D-3.

## F. Governance

Audit-only. **No** page / Apps-Script handler / router / bundle / core-module (KMPA/KMPCX/KMAF/KMPS/allocation) / API-
contract / Workspace-DTO / DB / schema change; no new formula; no live DB access. Docs-only checkpoint. Full suite
unchanged (91 files / 0 failing — no code touched); Golden Matrix 39/1/0; Scenario #34 Pending. No push, no deploy.
