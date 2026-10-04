# S8-R4B-2A — SITE INVENTORY LAZY-ONCE EXPOSURE ARCHITECTURE

**Frozen contract + DB touch preflight. No runtime code was written.**

```
OPERATOR_DECISION = D-S8-SITE-INVENTORY-1 · B — LAZY ONCE PER ACTIVE SITE SCOPE, REUSE MANY
```

---

## 1. The finding that changes the cost of this work

`inventoryReplenishment.workspace.get` **already accepts `only`**, and it is **already live in Production**.

- `60_api_v1_inventory_replenishment_workspace.gs` at the deployed stamp `…-R6-R5` declares it owns
  *"the recentWindow/**only** request contract"*, and the live manifest reports `matches_expected: true`.
- R4B-2 observed it working: a confirmed Search issues the ~357 KB primary read **and** an ~8.5 KB
  `only`-scoped carrier-catalogue read of two tables. Two sizes, one action.

```
NEW_ACTION_REQUIRED                   = NO
ROUTER_CHANGE_REQUIRED                = NO
ACTION_CONTRACT_VERSION_CHANGE_REQUIRED = NO   (no action added or removed — repository rule)
BACKEND_RELEASE_REQUIRED              = NO     (no .gs byte changes)
FRONTEND_RELEASE_REQUIRED             = YES    (assets/js/pages/inventory-replenishment.js only)
SERVER_CACHE_INTRODUCED               = NO     (§19 honoured)
PRODUCTION_DB_WRITE_REQUIRED          = NO     SCHEMA_CHANGE_REQUIRED = NO
```

This is a **frontend-only** change. Both layers are the same existing action with different `only` lists.

---

## 2. First layer — 13 tables

| # | table | why required at first render | UI consumer | CAN DEFER |
|---|---|---|---|---|
| 1 | `marketplaces` | scope identity; company/country/marketplace resolution | selectors, every row's scope | NO |
| 2 | `marketplace_skus` | the row set itself — which SKUs exist at this site | every table row | NO |
| 3 | `sku_details` | lifecycle, series, category, unitsPerCarton | row + Category rail filter | NO |
| 4 | `warehouses` | 3PL pool identity for the 3rd-Party column | `thirdPartyStock` column | NO |
| 5 | `amazon_inventory_snapshot` | `currentInventory` — the primary stock column | collapsed row | NO |
| 6 | `amazon_inventory_health_snapshot` | Long-Term Storage (over90/over180) | LTS filter + expand | NO |
| 7 | `amazon_daily_sales_snapshot` | 7-day sales trend | collapsed row | NO |
| 8 | `amazon_weekly_sales_snapshot` | avg sales/day → Days of Supply | collapsed row (DoS colour) | NO |
| 9 | `fc_regular_forecast` | 60-day forecast + 3-month breakdown | collapsed row | NO |
| 10 | `fc_target_rules` | target days → DoS/need buckets | collapsed row | NO |
| 11 | `fc_special_events` | event uplift → forecast + Upcoming Event | collapsed row | NO |
| 12 | `overseas_inventory_snapshot` | 3PL physical availability | `thirdPartyStock` column | NO |
| 13 | `factory_stock` | CN/TW factory allocation columns | collapsed row | NO |

Every one feeds a **collapsed-row** column. None can be deferred without the primary table lying.

---

## 3. Second layer — 6 tables, and all six are genuinely second-layer

| table | exposure purpose | UI consumer | join identity | why not first-layer |
|---|---|---|---|---|
| `shipments` | remaining incoming by ETA bucket | Shipping Shipment card (expand), `inventory-replenishment.js:2933-2937` | `shipment_id` → lines | the collapsed row's `onTheWay` is **hard-coded 0** (`:11719`, "pending mapping, spec §9") |
| `shipment_lines` | per-line remaining = qty − received | same card | `shipment_line_id`, `shipping_plan_line_id` | same |
| `shipping_plans` | receiver lineage for merged (MULTI) shipments | same card, indirectly | `shipping_plan_id` | consumed **only** to build `lineReceiverById` for the above |
| `shipping_plan_lines` | the lineage rows themselves | same card, indirectly | `shipping_plan_line_id` → plan | same |
| `shipping_allocation_drafts` | persisted Recommendation Summary snapshot + Execution Plan routes | `_recSummaryRows` (`:13099`), `_hydrateAllocationDraftFromDb` (`:5934`) | `allocation_draft_id`, scope + sku | both are expand-only surfaces |
| `shipping_allocation_draft_lines` | the per-window recommended rows / route lines | same | `allocation_draft_line_id` → draft | same |

**Confirmed: all six are second-layer-only.** Checked specifically against the two things that would have
forced a STOP:

- **Suggested Qty** (a collapsed-row column) resolves through `_irSuggestedQtyState_` (`:2030`), which reads
  the materialised gap state or the recommendation workspace — **never** the allocation drafts.
- **On the Way** (a collapsed-row column) is the literal `onTheWay: 0`. The shipment-derived buckets
  (`within18days` … `shipOverdue`) sit below the `// Stock Card detail (expand)` marker.

```
FIRST_LAYER_TABLE_COUNT = 13     EXPOSURE_TABLE_COUNT = 6     19 - 6 = 13, and the UI audit agrees
```

---

## 4. Cache ownership, key, and the per-site map

The exposure cache lives in **the same module scope that already owns `_irReadModel`**
(`assets/js/pages/inventory-replenishment.js`). No parallel cache authority is created.

```
EXPOSURE_CACHE_MAP_OWNER = inventory-replenishment.js module scope, beside _irReadModel
EXPOSURE_CACHE_OWNER     = one entry of that map, per site scope
EXPOSURE_CACHE_STATE     = NOT_LOADED | LOADING | READY | FAILED      (per entry)
IN_FLIGHT_OWNER          = the entry's own Promise — every concurrent expand joins it
INDEX_OWNER              = the entry; indexes are built ONCE on transition to READY

EXPOSURE_CACHE_KEY_FIELDS = company | country | marketplace_id        (+ workspace generation)
EXPOSURE_CACHE_KEY        = [company, country, marketplaceId].join('|')  — the same triple
                            _irHydrateDraftForAppliedScope_ already uses as its scope key (:6233)
```

**SKU is not in the key.** The cache is per site, never per SKU.

```
cache['ResUS|US|MKT-RESUS-US-AMAZON'] = READY
cache['ResTW|CA|MKT-RESTW-CA-AMAZON'] = READY
cache['ResTW|JP|MKT-RESTW-JP-AMAZON'] = NOT_LOADED
```

---

## 5. Lazy-once semantics

```
NOT_LOADED  exposure absent BY DESIGN. Must never render as "0 shipments" / "no allocation".
LOADING     exactly ONE request. Concurrent expands join the SAME in-flight Promise.
            CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1
READY       normalized model + indexes held. Every later expand: NETWORK_REQUEST_COUNT = 0.
FAILED      truthful unavailable state. No empty READY cache. No automatic retry loop.
            One explicit operator-initiated retry allowed; on success -> READY.
```

```
LAZY_FIRST_REQUEST_COUNT                 = 1 per site scope
PER_SKU_EXPAND_REQUEST_AFTER_READY       = 0
20_SKU_EXPAND_ADDITIONAL_REQUEST_COUNT   = 0
PER_SITE_FIRST_EXPOSURE_REQUEST_MAX      = 1 while the entry remains valid
CROSS_SITE_PREFETCH_COUNT                = 0      LOAD_ONLY_REQUESTED_SITE = YES
PER_SKU_N_PLUS_ONE_COUNT                 = 0
```

---

## 6. Invalidation — per entry, never global

```
PER_SITE_INVALIDATION_RULE
  an entry is invalidated ONLY by:
    1. explicit Refresh for THAT site
    2. a successful canonical write that changes exposure truth for THAT site
    3. explicit workspace reset/disposal affecting that entry
    4. loss of the browser/application lifecycle holding the map
    5. a future explicit memory-eviction policy

GLOBAL_INVALIDATION_RULE
  the whole map is dropped ONLY when the workspace lifecycle is actually destroyed
  (hard reload / new application lifecycle). Never because the operator switched site.

INVALIDATE_ON_SCOPE_CHANGE      = NO  — switch KEY, do not discard. Target READY -> 0 requests;
                                        target NOT_LOADED -> exactly 1 request for that site.
INVALIDATE_ON_EXPLICIT_REFRESH  = YES — that site's entry only
INVALIDATE_ON_ROUTE_RETURN      = NO
INVALIDATE_ON_HARD_RELOAD       = YES — unavoidable; the map is in memory
INVALIDATE_AFTER_RELEVANT_WRITE = YES — that site's entry only (see §9)
```

Required sequence, frozen as acceptance:

```
US  first expand -> 1      switch CA -> 1      back to US -> 0      back to CA -> 0
```

---

## 7. Route away / return — survives, and no new architecture is needed

Audited `KM.lifecycle.register('ops-section', …)` (`:13907`). The `unmount()` body removes the allocation
panel DOM node, destroys the sticky-header and category-rail observers, removes expand panels and scroll
handlers — and **touches neither `_irReadModel` nor `_irSearch`**. Both are module-scope `var`s that outlive
the unmount.

```
ROUTE_AWAY_RETURN_CACHE_BEHAVIOR = the exposure map survives, because it lives exactly where the
  existing read model already survives. Expanding a SKU after route-return issues ZERO exposure requests.
ARCHITECTURE_DECISION_REQUIRED (for route-return persistence) = NO — reuses the existing owner.
ARCHITECTURE_DECISION_REQUIRED (for hard-reload persistence)  = YES, and NOT proposed here. Surviving a
  hard reload would need a new persistent client cache contract (localStorage/sessionStorage), which §F
  forbids introducing silently.
```

Note for expectations: route-return still re-runs `_irBootstrapScope_()`, which performs a **first-layer**
read when a scope is remembered. That is unchanged by this decision — 1 first-layer read, 0 exposure reads.

---

## 8. Exposure read scope — B1

```
RECOMMENDED_EXPOSURE_SCOPE = B1 — all six exposure tables for the ACTIVE SITE, in ONE request
WHY = B2 ("only rows for SKUs already in the first-layer result") cannot be expressed without either
  sending the SKU list as a request parameter — which makes the request vary per filter/pagination state
  and reopens N+1 by the back door — or adding server-side scope logic, which is a backend change this
  decision does not take. The six tables are SMALL: R4B-2 measured shipments 4, shipment_lines 10,
  shipping_plans 6, shipping_plan_lines 12, shipping_allocation_drafts 12,
  shipping_allocation_draft_lines 14 = 58 rows total. Row count is not the cost; sheet count is.
  B1 is one request of six sheets, which by the R4B-2 per-sheet floor (0.8–1.3 s) predicts roughly
  5–8 s — to be MEASURED in R4C, not promised here.
```

```
EXISTING_ACTION_REUSABLE = YES
PROPOSED_EXPOSURE_ACTION = inventoryReplenishment.workspace.get
                           payload { only: [the six], recentWindow: true }
  READ only · canonical GET/read transport · zero mutation · one scoped request · starts no job ·
  touches no gap materialisation · never calls gapJob.status.get
FIRST_LAYER_REQUEST       = inventoryReplenishment.workspace.get
                           payload { only: [the thirteen], recentWindow: true }
```

---

## 9. Write invalidation contract (defined, not implemented)

A successful canonical write that changes exposure truth for a site must either

- **A** invalidate that site's entry, or
- **B** patch the held model from the authoritative write receipt.

Serving known-stale exposure is forbidden. A write affecting US exposure must not invalidate CA or JP
unless the business write genuinely spans them.

**Current Product writes cannot signal Site Inventory**, so this is marked as separate downstream work.
Until it exists, option **A on explicit Refresh** is the only honest mechanism, and the operator should
know that an allocation draft saved elsewhere in the same session may not be reflected until Refresh.

---

## 10. False-empty risk — 4 surfaces

```
FALSE_EMPTY_RISK_COUNT = 4
```

| # | surface | current behaviour when the six tables are absent | why it lies |
|---|---|---|---|
| 1 | Shipping Shipment card (`:2933-2937`) | `${skuData?.within18days \|\| 0}` on all five buckets | prints **0** for "not loaded" |
| 2 | row builder default (`:11618`) | `shipRemainByReceiver[key] \|\| {overdue:0, d0_18:0, …}` | manufactures a zeroed object before the UI is even reached |
| 3 | Recommendation Summary (`_recSummaryRows`, `:2089`) | empty `_recDraftLines` → honest "not generated" state | correct for *generated-but-empty*, **wrong** for *not loaded* |
| 4 | Execution Plan route editor (`_hydrateAllocationDraftFromDb`, `:5934`) | returns false → default Add Route editor seeded `parseInt(suggestedQty) \|\| 0` | this is the historical **"Qty 0"** defect, already documented in that function's own comment |

All four need a NOT_LOADED state distinct from LOADED_EMPTY. **The collapsed row is already immune** —
`onTheWay` is hard-coded 0 today, so deferral changes nothing there.

```
AFFECTED_UI_SET = Shipping Shipment card · Recommendation Summary table · Execution Plan route editor ·
                  the row-builder shipRem default
```

---

## 11. First expand UX

```
FIRST_EXPAND_LOADING_SURFACE  = the expanded SKU panel's second-layer sections ONLY
                                (Shipping Shipment card, Recommendation Summary, Execution Plan)
OTHER_FIRST_LAYER_UI_BLOCKED  = NO
```

The table, filters, sorting and every collapsed-row column stay live and interactive. No full-screen loader.

---

## 12. DB touch preflight

Common to every table in both layers: `ACCESS = READ` · `DIRECT_CELL_WRITE = NO` · `TEST_LINEAGE = N/A` ·
`RECOVERY = NONE — READ ONLY` · `RUNTIME_OWNER = 60_api_v1_inventory_replenishment_workspace.gs (read)`.

```
WRITE_TABLE_COUNT = 0   DELETE_TABLE_COUNT = 0   (both layers)
```

**FIRST LAYER (13)** — scope: active site; row counts measured in R4B-2 for US/Amazon:

| table | classification | max rows (measured) | operator approval |
|---|---|---|---|
| `marketplaces` | PROTECTED_MASTER | 15 | no |
| `marketplace_skus` | PROTECTED_MASTER | 495 | no |
| `sku_details` | PROTECTED_MASTER | 192 | no |
| `warehouses` | PROTECTED_MASTER | 361 | no |
| `amazon_inventory_snapshot` | PROTECTED_MASTER | 259 | no |
| `amazon_inventory_health_snapshot` | **UNAUTHORIZED_UNKNOWN** | 345 | **bounded read approval already standing; no permanent registration** |
| `amazon_daily_sales_snapshot` | PROTECTED_MASTER | 3814 (after recentWindow; 9779 before) | no |
| `amazon_weekly_sales_snapshot` | PROTECTED_MASTER | 247 | no |
| `fc_regular_forecast` | PROTECTED_MASTER | 496 | no |
| `fc_target_rules` | PROTECTED_MASTER | 0 | no |
| `fc_special_events` | PROTECTED_MASTER | 431 | no |
| `overseas_inventory_snapshot` | REBUILDABLE_OPERATIONAL_STATE | 260 | no |
| `factory_stock` | REBUILDABLE_OPERATIONAL_STATE | 112 | no |

**EXPOSURE LAYER (6)** — scope: active site, one request:

| table | classification | max rows (measured) | purpose | operator approval |
|---|---|---|---|---|
| `shipments` | TEST_OWNED_TRANSACTION | 4 | incoming ETA buckets | no |
| `shipment_lines` | TEST_OWNED_TRANSACTION | 10 | per-line remaining | no |
| `shipping_plans` | TEST_OWNED_TRANSACTION | 6 | receiver lineage | no |
| `shipping_plan_lines` | TEST_OWNED_TRANSACTION | 12 | receiver lineage | no |
| `shipping_allocation_drafts` | TEST_OWNED_TRANSACTION | 12 | recommendation snapshot + routes | no |
| `shipping_allocation_draft_lines` | TEST_OWNED_TRANSACTION | 14 | per-window rows | no |

No table outside these nineteen is reached by either request.

---

## 13. R4C acceptance plan

Measure, do not promise. No savings number is asserted here.

```
PRE   19-table broad read      FIRST_LAYER_SERVER_MS / FIRST_LAYER_WALL_MS   (R4B-2 baseline:
                               server 14.4–22.1 s, wall 23.4–31.8 s, 9 samples)
POST  13-table first layer     FIRST_LAYER_SERVER_MS / FIRST_LAYER_WALL_MS
      6-table exposure         EXPOSURE_FIRST_LOAD_SERVER_MS / EXPOSURE_FIRST_LOAD_WALL_MS

HARD ACCEPTANCE
  SECOND_SKU_EXPAND_NETWORK_REQUESTS = 0
  TENTH_SKU_EXPAND_NETWORK_REQUESTS  = 0
  CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1   (expand 3 SKUs within the in-flight window)

CROSS-SITE
  US  first expand 1 · 20 expansions 0      CA  first expand 1 · 20 expansions 0
  back to US 0 · back to CA 0               CROSS_SITE_PREFETCH_COUNT = 0

ROUTE
  route away / return, same scope, expand -> 0 exposure requests

FAILURE
  force one exposure failure -> state FAILED, no empty READY, no retry storm,
  one explicit retry succeeds -> READY -> all later expansions 0
```

---

## 14. What is still open

```
ARCHITECTURE_DECISIONS_REMAINING
  1. Hard-reload persistence of the exposure map. NOT proposed. Needs a persistent client cache
     contract and separate approval.
  2. Write-driven invalidation (§9). Current Product writes cannot signal Site Inventory.
  3. Whether the 13-table first layer is itself still too slow. R4B-2's per-sheet floor predicts
     roughly 11–17 s for 13 sheets. If that is unacceptable, a further first-layer reduction is a
     NEW decision — this one does not pre-empt it.
```
