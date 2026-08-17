# F1-7M-B-POST-WRITE-BOUNDED-READBACK-R1

**Mode:** AUDIT → AUTHORITY PROOF → ATOMIC IMPLEMENTATION → VALIDATION.
**Goal:** reduce post-write readback over-fetch WITHOUT changing business authority, formulas, write semantics, freshness, or UI-visible canonical facts. Post-write state stays SERVER-AUTHORITATIVE — no optimistic client mutation substituted for a readback.
**PRE HEAD:** `927d205` (on origin). **Baseline:** `F1_7M_PERFORMANCE_AND_INTERACTION_BASELINE_R1.md`.

Frozen invariants held: `WRITE_FORCES_FULL_RELOAD=0` · `ACTIVE_PRIMARY_BROAD=0` · `ACTIVE_SECONDARY_BROAD=0` · `APP_PRIME_READ_DEPENDENCY=0` · `CANONICAL_STARTUP_WHOLE_DB_PRIME=0`. No business/formula/schema/idempotency/conflict change.

**Implemented (frontend-only, no new endpoint):** B2 (RO Target%/FC), B4 (Factory Stock), B5 (Overseas Stock).
**Deferred with source-grounded reasons:** B1 Shipment, B3 IR (both NEW_BOUNDED_ENDPOINT_REQUIRED — need a backend deployment); B6 PO, B7 RO Draft (see §Deferred).

---

## Audit / classification matrix

| Surface | Old readback | New readback | Authority source | Requests B/A | Tables B/A | API change? | Deploy impact | Verdict |
|---|---|---|---|---|---|---|---|---|
| **B2 RO Target%** | `refreshCacheTables(_RO_L2_TABLES=7)` → then → `getAiPlanFirstLayer` (serial) | `refreshCacheTables(['fc_target_rules'])` ‖ `getAiPlanFirstLayer` (parallel, render-gated) | fc_target_rules (bounded getTable) + composer | 8 → **2** | 7 → **1** (+composer) | none | frontend | **SAFE_BOUNDED_READBACK** ✅ |
| **B2 RO FC** | same 7 + composer, serial | `refreshCacheTables(['fc_regular_forecast'])` ‖ composer | composer re-derives first-layer FC; fc_regular_forecast getTable serves expand | 8 → **2** | 7 → **1** (+composer) | none | frontend | **SAFE_BOUNDED_READBACK** ✅ |
| **B4 Factory Stock** | `loadScopedTables([factory_stock, movements, sku_details, warehouses])` (4), full read-model replace | `loadScopedTables([factory_stock, movements])` (2), MERGE onto retained static | factory_stock + movements (server); sku_details/warehouses retained from mount | 1 → 1 | 4 → **2** | none | frontend | **SAFE_BOUNDED_READBACK** ✅ |
| **B5 Overseas Stock** | `loadScopedTables([snapshot, movements, warehouses, sku_details])` (4), full replace | `loadScopedTables([snapshot, movements])` (2), MERGE onto retained static | snapshot + movements (server); warehouses/sku_details retained from mount | 1 → 1 | 4 → **2** | none | frontend | **SAFE_BOUNDED_READBACK** ✅ |
| **B1 Shipment** | full `shipment.workspace.get` size=3000 + includes (routes/events/locations/templates) | — (unchanged) | — | — | — | would need new filter | backend | **NEW_BOUNDED_ENDPOINT_REQUIRED** — deferred |
| **B3 Inventory Replenishment** | full `inventoryReplenishment.workspace.get` (~19 tables) | — (unchanged) | — | — | — | would need new endpoint | backend | **NEW_BOUNDED_ENDPOINT_REQUIRED** — deferred |
| **B6 Purchase Order** | full `purchaseOrder.workspace.get` size=2000 | — (unchanged) | — | — | — | exact by-PO-id filter absent | backend | EXISTING_SCOPED_ENDPOINT_REUSABLE (partial) — deferred |
| **B7 RO Draft** | full `requestOrder.workspace.get` size=2000 | — (unchanged) | — | — | — | filter exists, needs list-reconcile | frontend (non-trivial) | EXISTING_SCOPED_ENDPOINT_REUSABLE — deferred |

---

## B2 — RO Target% / FC edit (IMPLEMENTED)

### Root cause
Both edits share one post-write path: `_roBindEditModal` success → `_roReloadAndRerender()` → `_roEnsureL2Tables(true)` (force-refresh the **full 7-table `_RO_L2_TABLES`**) **then** (serial `.then`) `_opLoadFirstLayerComposer_()`. Audit proof:
- **Target%** write (`upsertFcTargetRule` → `handleUpsertFcTargetRule_`, 14_fc_write_handlers.gs) mutates **`fc_target_rules` only**. The composer (`56_api_v1_ai_plan_first_layer.gs`, `APL_TABLES_`) does **NOT** read `fc_target_rules` — Target% is applied client-side in render (`_roTargetPct` reads the `fc_target_rules` cache). So the authority for the changed Target% value is the bounded `fc_target_rules` getTable, not the composer.
- **FC** write (`importFcRegularForecastBatch`) mutates **`fc_regular_forecast` only**. The composer re-derives the first-layer Base FC from `fc_regular_forecast` server-side → composer re-read IS the authority for the visible first-layer FC. The `fc_regular_forecast` getTable serves the still-open second-layer expand panel.
- The other 5–6 tables in `_RO_L2_TABLES` (`fc_special_events, factory_stock, warehouses, purchase_orders, purchase_order_lines`, and the non-edited one of fc_regular_forecast/fc_target_rules) are **server-unchanged** by either edit.

### Change
`_roBindEditModal(saveFn, changedTables)` forwards the modal's known changed table(s) to `_roReloadAndRerender(changedTables)`. Target% passes `['fc_target_rules']`; FC passes `['fc_regular_forecast']`. `_roReloadAndRerender`:
- When the full L2 set is already primed (`_roL2Ready`, guaranteed because the edit is launched from an expanded row whose open already ran `_roEnsureL2Tables`) AND a changed table is named → `refreshCacheTables(changedTables)` (bounded).
- Else → the prior `_roEnsureL2Tables(true)` full refresh (byte-identical fallback).
- The refresh promise is handed to `_opLoadFirstLayerComposer_(refreshP)` (the A1 render-gate): the composer fires in the **same wave** as the refresh (parallel), and the SUCCESS render waits for **both** so the still-open expand panel reads the fresh changed value. Composer re-read (server authority) retained.

### Proof
- **REQUEST_COUNT_REDUCTION:** 8 → 2 per edit.
- **TABLE_READ_REDUCTION:** the refresh reads 1 table (was 7).
- **SERIAL_WAVE_REDUCTION:** 2 waves → 1 (refresh ‖ composer, was refresh→composer).
- **UI/business equivalence:** the composer output (first-layer AI-Plan facts) is re-read identically; the changed Target%/FC value is re-read from its authoritative table; the 5–6 dropped tables were server-unchanged. Render still gated on the fresh cache → BEFORE==AFTER visible state.
- **Error semantics:** composer failure → existing bounded ERROR (no fake success); refresh failure → same `.catch`-swallow as before (write already durable server-side); stale/out-of-order render dropped by the existing `_opFirstLayerSeq` guard.

## B4 — Factory Stock / B5 — Overseas Stock (IMPLEMENTED)

### Root cause + authority proof
`_fsAfterWrite` / `_osAfterWrite` re-read **4 tables** and **replace the whole read-model** after every write. Two of the four are static reference:
- **B4:** `21_factory_inventory_handlers.gs` — the ONLY `setValue`/`appendRow` targets are `factory_stock` + `factory_stock_movements`; `sku_details` and `warehouses` are read-only validation context. A factory write **cannot** mutate them.
- **B5:** `05_overseas_inventory_handlers.gs` — writes only `overseas_inventory_snapshot` + `overseas_inventory_movements`; `warehouses` is read-only validation; `sku_details` is not referenced at all. An overseas write **cannot** mutate them.
Both static tables are already loaded at mount into the same read-model.

### Change
Post-write, re-read **only the two mutable tables** and **merge** their fresh normalized slices onto the retained read-model (retaining the mount-loaded static tables), instead of re-fetching all four and replacing. Because `normalizeOperationDb` returns **every** table key (empties for absent tables), the merge overlays **only** the two mutable camelCase keys (`factoryStock`+`factoryStockMovements` / `overseasInventorySnapshot`+`overseasInventoryMovements`) — a blanket `Object.assign` would clobber the retained static tables with `[]`. Fallback: read-model not yet primed → full 4-table read (unchanged mount behavior).

### Proof
- **TABLE_READ_REDUCTION:** 4 → 2 per write on both surfaces.
- **Server-authoritative:** the mutable snapshot/movement facts are fully re-read from the server every write (no optimistic mutation). Static reference is retained, not cached-with-staleness (the write provably cannot change it; a mount / explicit reload still refreshes it).
- **No row-removal hazard:** adjust/import only upsert snapshot cells + append movements (never delete SKUs/warehouses) → merge is always coherent.

---

## Deferred surfaces (source-grounded)

- **B1 Shipment — NEW_BOUNDED_ENDPOINT_REQUIRED.** Both post-write refreshers (`shipping-history.js:_shRefresh_`, `global-logistics-map.js:afterShipmentWrite`→`ensureDb`) call the single `shipment.workspace.get` with `size:3000`; the map also re-pulls **static** includes (locations, route templates, template nodes) every write. The handler (`57_…`) has **no shipment-id filter** and emits `shipment_routes/shipment_events/logistics_locations/templates` as **full unscoped tables** — it cannot return one shipment + only its deps. `updateShipment` / `confirmShipmentAndDispatch` responses carry only ids/counts (no rows). A correct bounded readback needs a new server filter that ALSO scopes the include tables by shipment id → backend change/deploy → out of scope for a frontend readback round. (Receipt/route-advance/ETA writers DO return their mutated rows, but reconstructing the full map view-model — coords, derived position — from partial write responses risks missing a server-owned field, so it is not a safe frontend-only substitute.)
- **B3 Inventory Replenishment — NEW_BOUNDED_ENDPOINT_REQUIRED.** A visible IR row is a genuine ~19-table join (identity/master + inventory snapshots + sales velocity + forecast/target/events + 3PL/factory + shipment lineage + allocation-draft, composed with separately-owned Gap/Recommendation + canonical sales basis). `handleInventoryReplenishmentWorkspaceGet_` (`60_…`) accepts **no** sku/marketplace_sku_id/scope filter (full-set by design); writer responses carry only identity + generated IDs (a newly-created SKU has no snapshot/sales history yet). A correct single-SKU projection requires a new bounded server endpoint → backend deploy → deferred.
- **B6 Purchase Order — EXISTING_SCOPED_ENDPOINT_REUSABLE (partial).** The PO workspace GET (`50_…`) has `filters{company,status,factoryId,warehouseId,requestBucket,supplierId,requestOrderId}` + `search` + `page` + `include`, but **no exact `purchaseOrderId`** filter. Bounding to the exact affected PO needs a one-line backend filter addition (NEW_BOUNDED_ENDPOINT_REQUIRED for the exact key) → deferred to a backend slice.
- **B7 Request Order Draft — EXISTING_SCOPED_ENDPOINT_REUSABLE.** An exact `requestOrderId` filter already exists server-side (`51_…:120`) and is unused by `_roRefresh_` (size=2000). A safe bounded readback would return one draft, but the list view holds all drafts → requires delete/cancel-aware list reconciliation (a mutation that removes a draft must remove its row; the current full re-read handles this uniformly). Non-trivial frontend reconcile with a real correctness edge → deferred (candidate for a focused follow-up, frontend-only).

---

## Safety
Optimistic patch introduced? **NO** (every changed flow still does a server readback; B4/B5 fully re-read mutable facts, retain only provably-immutable reference). Business authority / formula / schema / conflict / idempotency changed? **NO**. Error semantics changed? **NO** (existing envelopes/catches preserved). Stale-response protection: RO uses the `_opFirstLayerSeq` guard (unchanged); B4/B5 have no ordering hazard (full mutable re-read + merge). Writer full-reload 0 / app prime 0 / canonical broad 0: **all preserved**.

## Tests
- New focused `api-post-write-bounded-readback-f1-7m-b-r1.test.js` — 39/0 (B2 structural + behavioral parallel/gated/bounded/error/stale; B4/B5 merge-not-clobber + un-primed fallback; B1/B3 deferral lock-in; invariants).
- Contract updates (reload-path shape changed by B2): `api-serial-request-elimination-f1-7m-a-r1` 28/0, `api-app-prime-retirement-f1-7l-r1` 56/0.
- Full regression: **233 suites pass; 4 fail = the 4 known historical baseline failures** (`gap-job-done-notice-f1-small-r1`, `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`). **Zero new failures.**

## Deployment
Apps Script sync = **NO** · router = **NO** · new /exec = **NO** · bundle = **NO** · DB/schema = **NONE** · **frontend deploy = YES**.
Frontend files changed: `assets/js/pages/request-order.js` (B2), `assets/js/pages/factory-stock.js` (B4), `assets/js/pages/overseas-stock.js` (B5).

## Rollback
Revert the single commit. Each surface is an isolated, backward-compatible change (`_roReloadAndRerender`/`_roBindEditModal` gain optional params defaulting to the prior full behavior; `_fsAfterWrite`/`_osAfterWrite` fall back to the full 4-table read when the model is not primed).

## LIVE_MEASUREMENT_REQUIRED
Absolute ms for: RO Target%/FC edit readback (8→2 requests, 1 wave) and Factory/Overseas write readback (4→2 tables). Capture via DevTools network waterfall post-edit.

## Recommended next task
**F1-7M-C** (lazy include / reference session cache) per the baseline roadmap — OR a dedicated backend slice for B1/B3/B6 bounded endpoints (separately gated, since it requires an Apps Script deployment). Do not begin automatically.
