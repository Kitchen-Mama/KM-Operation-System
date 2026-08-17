# F1-7J-REMAINING-SECONDARY-SURFACES-AND-AUTHORITY-MASTER-AUDIT-R1 — Final remaining-migration map (AUDIT ONLY)

**Outcome: AUDIT / DECISION ONLY — no runtime code, no API, no writer, no app-prime change.** Baseline HEAD `c636c8a`
(= `origin/main`). This is the authoritative, source-grounded map of what remains after all 8 registered page workspaces
became canonical scoped-read workspaces (F1-7B…F1-7I). It supersedes the approximate figures in `F1_7A_…_R1.md`
("~40 writers", "≈6 broad-cache") with EXACT counts. Successor implementation rounds need no further broad repo scan.

## §0 Frozen milestone
- REGISTERED page workspaces: **8 / 8 IMPLEMENTED + CANONICAL** (weeklyShipping, recommendation, purchaseOrder,
  requestOrder, shipment, fcSummary, skuDetails, inventoryReplenishment). **REGISTERED-only = 0.**
- Primary-read API migration is COMPLETE for every registered page workspace. **Full system migration is NOT complete** —
  6 non-workspace pages, 14 secondary broad-cache surfaces, 47 writer full-reloads, the app.js global prime, and 3
  frontend authority debts remain. This audit maps all of them.

---

## §1 — SYSTEM-WIDE BROAD-CACHE INVENTORY (EXACT)

The real broad loader is `loadOperationDb` (`operation-system-db-api.js:2093`) → one GET `?action=getOperationDb`
populating the global singleton `window._opDbCache` (`:2021`, no TTL). ~90 `KM.DB.getX()` getters (`:2159-2562`) are
synchronous reads of that cache. **`getOperationDb(` has ZERO active occurrences** — the public JS accessor is never
defined; the one call site (`:889`, `KM.display.carrierName`) is `typeof …==='function'`-guarded → always false → dead.

**Canonical-active broad-cache consumers = 60**, by role:

| Role | Count | Sites |
|---|---|---|
| PRIMARY (page's main render, no scoped workspace) | **6** | factory-stock `:16`, overseas-stock `:28`, overseas-ops-preview `:43/47` (+inbound/outbound delegate), campaign-risk `:592`, carrier-rate-card `:239`, sku-regional-details `:590` |
| SECONDARY (workspace page canonical-ON; a modal/expand calls `loadOperationDb`) | **5** | fc-summary `:1604` (Regular Builder), `:2211` (Event Builder), `:1712` (prefill guard), `:3460` (`_fcEnsureBroadCacheThen` shared lazy loader), request-order `:2014` (2nd-layer expand) |
| BACKGROUND | **2** | app.js `:382` global prime (all tables), sku-details `:2082` manual "Refresh DB" |
| WRITE-REFRESH (full reload on write-success) | **47** | `operation-system-db-api.js` writers — see §4 |

Plus **2 targeted (non-full-reload) `_opDbCache` mutators**: `refreshFactoryStockTables` (`db-api.js:3894`, targeted re-GET
of factoryStock/movements), `_spPatchLocalQty` (`shipping-plan.js:1053`, patches shippingPlanLines after qty save; inert
under the canonical weeklyShipping render but still executes).

**Excluded from the 60:**
- **Kill-switch legacy fallbacks (~12 sites)** — reachable ONLY when a named workspace flag is toggled OFF in production;
  never execute in canonical/default mode: shipping-plan `:1283`/`:1081`, fc-summary `:3661`, inventory-replenishment
  `:3701`, shipping-history `:835`/`:892`, purchase-order-overview `:93`, purchase-order-list `:78`, request-order-draft
  `:95`, request-order `:456`, global-logistics-map `:140` (+ `:338` diagnostic read).
- **Dead: 1** — `db-api.js:889` `getOperationDb()` (unreachable).
- Console/debug helpers (`db-api.js:3909-4042`), tests, docs.

**Note (broad-getter reads without a `loadOperationDb` call):** the 60 counts sites that *load* the cache. A larger set of
surfaces *read* broad getters directly (`KM.DB.getX()`) and depend on the cache already being warm — these are the
app-prime-dependent surfaces in §5 (e.g. sku-handbook, which never calls `loadOperationDb` and so is absent from the 60,
yet fails without the prime).

---

## §2 — SECONDARY SURFACE INVENTORY (classified)

Distinct secondary broad-cache surfaces = **14** (self-heal = lazy `loadOperationDb` on open; prime-dep = reads a broad
getter directly with no self-load → fails if the global prime is removed).

| # | Surface | file:line | Class | Self-heal? | Fix path |
|---|---|---|---|---|---|
| 1 | fc-summary Regular Forecast Builder modal | `fc-summary.js:1604` | BROAD_CACHE_SECONDARY | YES (lazy) | scoped builder read or extend fcSummary include |
| 2 | fc-summary Special Event Builder modal | `fc-summary.js:2211` | BROAD_CACHE_SECONDARY | YES (lazy) | ″ |
| 3 | fc-summary Event Assist base reads | `fc-summary.js:2617/2640` | FRONTEND_BUSINESS_AUTHORITY | partial | F1-7J-C (Event Assist redesign) |
| 4 | fc-summary Add-SKU / Target-Rule / Import modals | `fc-summary.js:1102/1166/3708` | BROAD_CACHE_SECONDARY | YES (lazy) | scoped/lazy read |
| 5 | request-order 2nd-layer expand (forecast breakdown / Edit Target% / FC Update) | `request-order.js:2014` | BROAD_CACHE_SECONDARY | YES (lazy) | lazy scoped read |
| 6 | request-order order-planning scope resolver `getMarketplaces` | `request-order.js:1316` | BROAD_CACHE_SECONDARY | NO (prime-dep) | recommendation ws already carries marketplaces |
| 7 | shipping-plan line-logistics editor `getSkuDetails` | `shipping-plan.js:987` | DISPLAY_ONLY / prime-dep | NO | sku_details already in weeklyShipping ws payload |
| 8 | purchase-order-list detail view modal | `purchase-order-list.js:547` | BROAD_CACHE_SECONDARY | NO (prime-dep) | point `view()` at `_polReadModel` |
| 9 | inventory-replenishment reference lookups `getMarketplaces`/`getWarehouses` | `inventory-replenishment.js:171/4358/4446/4776/4855/5134/5141` | BROAD_CACHE_SECONDARY | NO (prime-dep) | route through `_irWsGet` (already in `_irReadModel`) |
| 10 | inventory-replenishment Execution-Plan ETA `getCarrierLeadTimes` | `inventory-replenishment.js:2977` | BROAD_CACHE_SECONDARY | NO (prime-dep) | **needs carrier_lead_times in IR include (new bounded read)** |
| 11 | inventory-replenishment carrier-method reco `getCarrierRateCards` | `inventory-replenishment.js:2899` | BROAD_CACHE_SECONDARY | NO | scoped carrier read |
| 12 | inventory-replenishment allocation-draft hydrate | `inventory-replenishment.js:2507` | BROAD_CACHE_SECONDARY | NO | scoped SSOT `getShippingAllocationDraftWorkspace` already exists |
| 13 | inventory-replenishment Monthly Achievement FC read | `inventory-replenishment.js:3355` | BROAD_CACHE_SECONDARY (metric itself DEAD_CODE stub `:3348`) | NO | scoped fc read (metric unimplemented) |
| 14 | inventory-replenishment Add-SKU / Add-Marketplace modal `getMarketplaces` | `inventory-replenishment.js:171/3438` | BROAD_CACHE_SECONDARY | NO | route through `_irWsGet` |

Already-scoped secondary surfaces (no debt): PO-overview build/aggregation, PO/RO first-layer, shipping-history reads,
global-logistics-map read-model, sku-details reads, request-order-draft reads, recommendation overlay, IR primary+search,
allocation-draft write (scoped SSOT), tax resolution (DISPLAY_ONLY read-only join).

---

## §3 — FRONTEND BUSINESS AUTHORITY DEBT

| Fact | Frontend function (file:line) | Persisted? | Backend owner? | New owner req? | Redesign req? | Blocks Batch F? |
|---|---|---|---|---|---|---|
| **Incoming inventory** (MAX(0,qty−received) + ETA bucket + receiver attribution + shipping-plan lineage) | `inventory-replenishment.js:80` `_irBuildShipmentRemainingByReceiver` (+`:20/:33/:52/:63`), wired `:4016` | No (display) | **No** — shipment.workspace.get leaves it presentation-side | Yes | Yes — `INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` (open gaps: `MERGED_SHIPMENT_FROZEN_SHARE_AUTHORITY_GAP`, `SHIPMENT_OVERDUE_BUCKET_AUTHORITY_GAP`) | **NO** (read-side over scoped raw rows; §20-permitted) |
| **Site-Planning 18-day 3PL pool** (shared physical pool, per-site 18-day protection, §24.7 weighted largest-remainder) | `inventory-replenishment.js:708` `IRMap.sitePlanningAllocation` (+`:622/:658`), wired `:4072` | No (display) | No | Yes | Yes (allocation policy; surplus distribution deliberately unimplemented) | **NO** (display; no movement/reserve/write) |
| **FC Event Assist fc_qty** (newFc = round(base×(1+g%)) / round(base+val)) | `fc-summary.js:3026` `_evtApplyForecastAssist`, persisted via `:3087 saveEventUpdate → upsertFcSpecialEvent({fc_qty})` `:3215` | **Yes** | No — backend owns id/idempotency, not the quantity | Yes — a forecast-generation authority | Yes — `EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED` | **NO** (write already reconciles via scoped `_fcAfterWrite`; base reads need scoped/lazy source before prime removal) |
| RO Suggested-Qty carton rounding | `request-order.js:122` `_roTierSuggested` = ceil(recommended/box)*box over backend shortage | No | Yes (shortage from composer) | No | No | NO |
| PO-list remaining_qty fallback | `purchase-order-list.js:191` max(0,completed−shipped) | No | **Yes** (DTO supplies remaining_qty; frontend calc = Legacy-blank fallback only) | No | No | NO |
| Shipping-plan CBM/gross/net/carton | `shipping-plan.js:992` `_spLineLogistics`, carton=ceil(qty/upc) | No | user-entered approved_qty; logistics = display recompute | No | No | NO |

**Net:** exactly **2 authority debts with no backend owner** (incoming inventory, site-planning pool — both read-side/display,
DEFERRED) + **1 persisted computed authority** (Event Assist, DEFERRED). **None strictly blocks Batch F** — every persisted
write path already carries a scoped post-write reconcile (`_fcAfterWrite`/`_irAfterWrite`/`_shRefresh_`/`_poRefresh_`).

---

## §4 — WRITER FULL-RELOAD INVENTORY (EXACT = 47)

Every `window.KM.DB.*` writer in `operation-system-db-api.js` whose success path calls `loadOperationDb({force:true})`
(directly, or via `_kmShippingPost_(…, reloadAfter=true)` `:3129`). Excludes `_kmWeeklyCommand_`/`_kmGapRead_` writers
(no reload) and the 2 targeted mutators in §1.

| Domain | Count | Writers |
|---|---|---|
| SKU | 7 | updateSkuLifecycle, upsertSkuDetail, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch |
| Settings-MasterData | 1 | upsertMarketplace |
| Tax | 2 | upsertTaxReferralRate, upsertTaxRateComponent¹ |
| Forecast | 8 | upsertFcSpecialEvent, importFcSpecialEventsBatch, deleteFcSpecialEvent¹, upsertFcTargetRule, deleteFcTargetRule, importFcRegularForecastBatch, upsertCampaign, upsertCampaignSkuLines |
| Request Order | 8 | createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations |
| Purchase Order | 5 | createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine¹, updatePurchaseOrderHeader, receivePurchaseOrderLines |
| Shipping Plan | 5 | createShippingPlansBatch, updateShippingPlanRationale¹, selectShippingPlanCarrier¹, combineShippingPlans¹, uncombineShippingPlans¹ |
| Shipment | 7 | createShipmentFromPlan¹, updateShipment, confirmShipmentAndDispatch, generateShipmentLineAllocations, updateShipmentReceipt, advanceShipmentRoutePoint, updateShipmentEta |
| Inventory | 3 | adjustFactoryInventory, adjustOverseasInventory, importOverseasInventorySnapshotBatch |
| Templates-Documents / Carrier | 1 | importCarrierRateTemplate |
| **TOTAL** | **47** | (¹ = wired but NO `pages/*.js` caller: 8 total — upsertTaxRateComponent, deleteFcSpecialEvent, updatePurchaseOrderLine, updateShippingPlanRationale, selectShippingPlanCarrier, combineShippingPlans, uncombineShippingPlans, createShipmentFromPlan. Live-callable = 39.) |

**Batch-F removability:** the 44 writers whose domain maps to a canonical workspace (SKU/Forecast/RO/PO/ShippingPlan/
Shipment/Tax + upsertMarketplace) can swap the full reload for scoped invalidation of the listed workspace(s) — the
consumer pages already re-read scoped post-write. The **3 Inventory writers** (adjustFactoryInventory, adjustOverseasInventory,
importOverseasInventorySnapshotBatch) target factory-stock/overseas pages that have **no scoped workspace** → cannot drop
the full reload until those pages are migrated (adjustFactoryInventory has the targeted `refreshFactoryStockTables`
alternative already). importCarrierRateTemplate similarly serves the non-workspace carrier page.

---

## §5 — APP.JS GLOBAL PRIME DEPENDENCY MAP

Prime: `app.js:382` `loadOperationDb({force:true})` on DOMContentLoaded. **Surfaces that FAIL if removed today = 7**
(read a broad getter directly with NO self-load and NO scoped fetch):

| # | Surface | Function (file:line) | Tables | P/S | Fix |
|---|---|---|---|---|---|
| S1 | **SKU Handbook (whole page)** | `sku-handbook.js:51` `getSkuKnowledgeItems` (mount `:747`) | sku_details, product_features, sku_handbook_summaries | **PRIMARY** | **NEW bounded read** (or extend skuDetails ws with the 2 extra tables) |
| S2 | Weekly Shipping line-logistics editor | `shipping-plan.js:987` `_spSkuDetail` | sku_details | SEC | wire to weeklyShipping payload (already carries sku_details) |
| S3 | PO detail modal | `purchase-order-list.js:547` `view()` | purchase_orders, purchase_order_lines | SEC | point at `_polReadModel` |
| S4 | Order-Planning scope resolver | `request-order.js:1316` `getMarketplaces` | marketplaces | SEC | recommendation ws carries marketplaces |
| S5 | IR reference/registry lookups | `inventory-replenishment.js:171/4358/4446/4776/4855/5134/5141` | marketplaces, warehouses | SEC | route through `_irWsGet` |
| S6 | IR Execution-Plan ETA | `inventory-replenishment.js:2977` `getCarrierLeadTimes` | carrier_lead_times | SEC | **NEW bounded read** (add to IR include) |
| S7 | IR allocation-draft hydrate | `inventory-replenishment.js:2507` | shipping_allocation_drafts/_lines | SEC | scoped `getShippingAllocationDraftWorkspace` already exists |

**Fix distribution:** 4 by wiring to an EXISTING workspace/readModel (S2, S3, S5, S7) + S4 (reference read) = 5; **2 need a
NEW bounded read / include extension** (S1, S6); 0 need authority redesign.

**Self-healing (NOT prime-dependent, but still whole-broad-DB consumers):** the 6 non-workspace PRIMARY pages
(factory-stock, overseas-stock, overseas-ops-preview, carrier-rate-card, sku-regional-details, campaign-risk) run their own
`loadOperationDb` on mount, plus fc-summary's lazy secondary modals. Removing the prime only loses their warm-cache
head-start; it does not break them. **But the prime cannot be removed while it is the thing keeping the cache warm for the
7 dependent surfaces AND while these 6 pages still broad-load** — the true prerequisite for prime removal is migrating both
sets to scoped reads.

---

## §6 — WORKSPACE COVERAGE MATRIX

REGISTERED-only = **0** — all 8 re-`register()`-ed with `status: IMPLEMENTED` + live resolver
(`km-api-foundation.js:423/459/488/518/548/577/606/634`); all canonical + default-ON (`:343-344`).

| Workspace | Backend owner (.gs) | Router action | Frontend adapter | Primary canonical ON | Broad DB for primary? | Secondary broad remains? | Kill switch |
|---|---|---|---|---|---|---|---|
| weeklyShipping | 40_ | weeklyShipping.workspace.get | inline `_spAdaptWorkspaceToRecords` (shipping-plan.js:654) | YES | NO | YES (line-logistics editor S2) | setWorkspaceEnabled('weeklyShipping',false) |
| recommendation | 42_ | recommendation.workspace.get | inline in consumers | YES (overlay) | NO | NO (scoped materialized gap) | ('recommendation',false) |
| purchaseOrder | 50_ | purchaseOrder.workspace.get | adaptPurchaseOrderWorkspace | YES | NO | YES (PO-list view modal S3) | ('purchaseOrder',false) |
| requestOrder | 51_ | requestOrder.workspace.get | adaptRequestOrderWorkspace | YES | NO | NO (draft fully readModel) | ('requestOrder',false) |
| shipment | 57_ | shipment.workspace.get | adaptShipmentWorkspace | YES | NO | NO (both consumers readModel) | ('shipment',false) |
| fcSummary | 58_ | fcSummary.workspace.get | adaptFcSummaryWorkspace | YES | NO | YES self-healed (builder/import modals lazy) | ('fcSummary',false) |
| skuDetails | 59_ | skuDetails.workspace.get | adaptSkuDetailsWorkspace | YES | NO | (regional page separate, self-loads) | ('skuDetails',false) |
| inventoryReplenishment | 60_ | inventoryReplenishment.workspace.get | adaptInventoryReplenishmentWorkspace | YES | NO | YES (S5/S6/S7 + carrier/monthly/add) | ('inventoryReplenishment',false) |

Adapter note: weeklyShipping and recommendation adapt inline (no `KM.DB.adaptXWorkspace`); the other 6 use named adapters
(`db-api.js:2364-2499`). No new workspace should be created merely because a secondary surface exists — prefer extending
the existing canonical workspace's include set (S6 carrier_lead_times, S1 handbook tables).

---

## §7 — AUTHORITY ISOLATION CHECK

| Boundary | Expected | Runtime evidence | Violation? |
|---|---|---|---|
| Inventory Replenishment flow | Gap → Recommendation → Shipping Plan → Shipment (NOT Request Order) | IR Submit → `createShippingPlansBatch` (inventory-replenishment.js:2225); zero createRequestOrder/PO/order-planning-gap/AI-plan in IR (F1-7I §18 guard, tested) | **NO** |
| Procurement flow | Order Planning Gap → AI Plan → Request Order → Purchase Order | request-order composer `getAiPlanFirstLayer`; `createPurchaseOrderFromRequest` (request-order-draft.js:838) | **NO** |
| Shipment | consumes EXISTING PO lines via FIFO | `generateShipmentLineAllocations`, `confirmShipmentAndDispatch` (+factory_stock deduction) | **NO** |
| Factory | shared factory ≠ company | IR sitePlanningAllocation keyed company+country; factory pool summed per SKU, no company inference | **NO** |
| RAW inventory ≠ allocated supply | raw passthrough; allocation is display | IR workspace raw passthrough; sitePlanningAllocation display-only | **NO** |
| RAW forecast ≠ adjusted planning demand | raw fc tables; adjustment in composer/recommendation | fcSummary raw; RO composer owns first-layer | **NO** |
| RO decision ≠ PO physical execution | separate writers | createRequestOrderDraft vs createPurchaseOrderFromRequest | **NO** |

**No active runtime domain-boundary violation.** (Note: `EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED` and
`INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` are frontend-authority *debts*, not boundary violations — they compute a
fact the backend does not yet own, but they do not cross a domain boundary.)

---

## §8 — API TRANSPORT DEBT

| Surface | Current read | Classification |
|---|---|---|
| 6 non-workspace PRIMARY pages (factory-stock, overseas-stock, overseas-ops-preview, campaign-risk, carrier-rate-card, sku-regional-details) | broad `loadOperationDb` on mount | **MUST_MIGRATE_BEFORE_BATCH_F** (they hold the 3 Inventory + 1 Carrier writers' reload and block prime removal); sku-regional-details → reuse skuDetails ws (trivial) |
| SKU Handbook (S1) | broad getter, no self-load | MUST_MIGRATE_BEFORE_APP_PRIME_REMOVAL (needs new bounded read) |
| IR Execution-Plan ETA carrier_lead_times (S6) | broad getter | MUST_MIGRATE (extend IR include) |
| S2/S3/S4/S5/S7 secondary reads | broad getters | CAN_REMAIN_LAZY_API short-term; wire to existing workspace before prime removal |
| fc-summary builder/import modals, RO 2nd-layer expand | lazy `loadOperationDb` | CAN_REMAIN_LAZY_API (self-heal); tighten to scoped later |
| Kill-switch legacy fallback branches (~12) | broad, gated OFF | LEGACY_ONLY (remove with kill-switch retirement) |
| `db-api.js:889` getOperationDb | dead | REMOVE_WITH_DEAD_CODE |
| Incoming inventory / site-planning pool authorities | frontend compute | REQUIRES_PRODUCT_DECISION (F1-7J-B / -D) |
| Event Assist persisted fc_qty | frontend compute → persist | REQUIRES_PRODUCT_DECISION (F1-7J-C) |

---

## §9 — PERFORMANCE BASELINE MAP (for the later Performance round — no optimization now)

| Interaction | Current latency source |
|---|---|
| Initial app boot | FULL_OPERATION_DB_RELOAD (app.js:382 global prime, ~48 tables) + NETWORK/APPS_SCRIPT |
| Workspace page first paint | scoped MULTIPLE_API_CALLS (workspace + gap/recommendation overlays) + APPS_SCRIPT |
| Writer success path | **FULL_OPERATION_DB_RELOAD** (47 writers post-write `loadOperationDb{force:true}`) — the dominant "card disappears after Save, returns after refresh" lineage |
| Post-write readback (cut-over pages) | scoped re-read (`_xAfterWrite`) — LOW |
| Re-render | DOM_RENDER + FRONTEND_RECOMPUTE (cross-domain browser joins in IR/RO/shipping-plan) |
| Secondary modal open (fc-summary builders, RO expand) | lazy FULL_OPERATION_DB_RELOAD on first open |
| Expand panel (IR Monthly Achievement / Execution Plan) | FRONTEND_RECOMPUTE + broad-getter reads |
| Non-workspace page mount (factory/overseas/campaign/carrier/regional) | FULL_OPERATION_DB_RELOAD |
| Amazon snapshot import | INTENTIONAL_BACKGROUND_JOB |

Top blockers unchanged from F1-7A: (1) global prime; (2) per-writer full-DB refetch; (3) non-workspace page bootstraps.

---

## §10 — NEXT-SLICE PLAN (ordered by dependency)

Adjusted from the suggested shape based on findings — **the true Batch-F / prime-removal prerequisite is migrating the 6
non-workspace pages + 7 prime-dependent surfaces to scoped reads**, so those move earlier.

- **F1-7J-A — Secondary surfaces reusing EXISTING workspaces/readModels (no redesign, no new backend).** S2 (weekly
  line-logistics → weeklyShipping sku_details), S3 (PO-list view → `_polReadModel`), S4 (RO scope → recommendation ws),
  S5+S9/S14 (IR reference lookups → `_irWsGet`), S7 (IR allocation-draft → scoped SSOT), and sku-regional-details.js →
  skuDetails workspace (include.regional). Pure wiring; BEFORE==AFTER.
- **F1-7J-A2 — Small include extensions (new bounded reads, no authority change).** S1 (SKU Handbook: product_features +
  sku_handbook_summaries — new bounded read or skuDetails extension), S6 (carrier_lead_times into IR include), IR
  carrier-method reco + Execution-Plan (scoped carrier read).
- **F1-7J-A3 — Remaining non-workspace PRIMARY pages → scoped reads.** factory-stock, overseas-stock/overseas-ops-preview,
  campaign-risk, carrier-rate-card (new small workspaces or bounded reads). Unblocks the 3 Inventory + 1 Carrier writers and
  app-prime removal.
- **F1-7J-B — Incoming Inventory canonical authority redesign** (`INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED`;
  receipt/attribution semantics — product decision).
- **F1-7J-C — FC Event Assist backend write-authority redesign** (`EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED`).
- **F1-7J-D — Site-Planning 18-day 3PL pool authority** (`IRMap.sitePlanningAllocation`) + residual frontend cleanup
  (PO-list remaining_qty Legacy fallback, shipping-plan logistics — confirm display-only).
- **F1-7K — Batch F:** replace the 47 writer `WRITE_FORCES_FULL_RELOAD` with scoped workspace invalidation. Ready for the
  44 workspace-mapped writers now; the 3 Inventory + 1 Carrier writers gated on F1-7J-A3.
- **F1-7L — Remove app.js global Operation DB prime.** Gated on F1-7J-A/A2/A3 (all 7 prime-dependent surfaces + 6
  self-loading pages migrated).
- **F1-7M — Performance + interaction optimization** (Save/Submit/Cancel, scoped invalidation, optimistic/local state where
  safe, parallel bounded reads, lazy secondary reads, render, loading UX).
- **F1-PHASE1-LIVE-ACCEPTANCE-R2** (resume; currently PAUSED_BY_USER_FOR_API_MIGRATION).

---

## §11 — HALT / RISK TOKENS (findings, not runtime changes)

| Token | Present? | Note |
|---|---|---|
| ACTIVE_PRIMARY_BROAD_DB_DEPENDENCY | **YES** | 6 non-workspace pages + SKU Handbook (7 primary broad-cache surfaces); NONE on any of the 8 canonical workspace pages' primary render |
| SECONDARY_BROAD_DB_DEPENDENCY | **YES** | 14 secondary surfaces (§2) |
| WRITER_FULL_RELOAD_DEPENDENCY | **YES** | 47 writers (§4) |
| APP_PRIME_DEPENDENCY | **YES** | 7 surfaces fail without prime (§5); + 6 self-loading pages keep it useful |
| INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED | **YES** (deferred) | read-side; does not block Batch F |
| EVENT_ASSIST_AUTHORITY_REDESIGN_REQUIRED | **YES** (deferred) | persisted; write already scoped-reconciled |
| FRONTEND_PLANNING_AUTHORITY_REMAINS | **YES** | site-planning 18-day 3PL pool (§3) |
| DOMAIN_BOUNDARY_VIOLATION | **NO** | §7 all clean |
| UNKNOWN_DATA_AUTHORITY | **NO** | every fact traced to a source |
| SCHEMA_CHANGE_REQUIRED | **NO** | none for the transport/reload work; F1-7J-B/-C authority redesigns may introduce owner columns (decide in-round) |

---

## §12 recommended next task
**F1-7J-A** (secondary surfaces reusing existing workspaces/readModels — no authority redesign, no new backend, BEFORE==AFTER).
Do NOT begin automatically — awaits an explicit round spec.

**STOP after F1-7J-…AUDIT-R1. No implementation begins automatically.**
