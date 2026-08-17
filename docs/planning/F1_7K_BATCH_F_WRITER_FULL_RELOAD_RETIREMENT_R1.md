# F1-7K-BATCH-F-WRITER-FULL-RELOAD-RETIREMENT-R1 — retire WRITE_FORCES_FULL_RELOAD (47 → 0)

**Outcome: TRANSPORT / INVALIDATION only. No business formula, authority, schema, response-shape, idempotency, or
transaction-boundary change. No app.js prime removal. FRONTEND-ONLY (operation-system-db-api.js +
inventory-replenishment.js) — NO .gs / router / /exec / bundle / DB change.** Baseline PRE HEAD `655d3bc`.
A successful write no longer refreshes the WHOLE Operation DB; canonical/scoped consumer pages own their bounded
post-write readback, and the shared global `_opDbCache` is left to go stale (§13) except where a rollback posture or a
bare broad-cache primary surface genuinely needs it.

## §0 Exact PRE writer inventory (source-grounded, HEAD 655d3bc) — EXACTLY 47, no drift
`await loadOperationDb({ force: true })` reached, directly or indirectly, from **47 writer success paths**:
- **43 direct writers** each with their own `await loadOperationDb({ force: true })`, plus
- **4 writers** through the shared `_kmShippingPost_(…, reloadAfter=true)` helper (`updateShippingPlanRationale`,
  `selectShippingPlanCarrier`, `combineShippingPlans`, `uncombineShippingPlans`; the 2 READ helpers pass `false`).

Physical call sites in db-api = 45 (`43 direct + 1 shared _kmShippingPost_ + 1 debug reloadOperationDb`); the
`_kmWeeklyCommand_` writers already did NO reload (the target pattern), and `refreshFactoryStockTables` /
`factoryInventoryImportCommit` were already bounded/decoupled. **PRE writer full-reload count = 47 → matches the
authoritative baseline exactly.**

### Domain grouping (source-reconfirmed)
SKU/marketplace 7 (updateSkuLifecycle, upsertMarketplace, upsertMarketplaceSku, updateMarketplaceSkuModel,
upsertSkuDetail, importMarketplaceSkusBatch, syncMarketplaceSkusToSkuRegionalDetails) · SKU-regional 1
(upsertSkuRegionalDetail) · Tax 2 · Forecast/Campaign 8 · Request Order 8 · Purchase Order 5 · Shipping Plan 5 ·
Shipment 7 · Inventory 3 · Carrier 1. (= 47.)

## §0 Caller post-write readback audit (7-domain fan-out) — the universal pattern
For **every** writer, in the **canonical/workspace posture (production default: all 8 workspaces active,
`KM_SCOPED_PAGE_READS !== false`)** the calling page performs its OWN scoped readback after the awaited write —
`getWorkspace(...)` (weeklyShipping/purchaseOrder/requestOrder/shipment/fcSummary/skuDetails/IR), `_xAfterWrite → loadScopedTables`
(factory-stock/overseas-stock/carrier-rate-card), or a live `getActiveRequestOrderDrafts` re-read — and the broad
`_opDbCache` is deliberately ignored. In the **Legacy kill-switch posture** the same helpers render from the broad
getters with no re-read, so they depend on a whole-DB reload. **The pre-existing `_kmWeeklyCommand_` writers already
behave this way, so Legacy staleness-after-write without an internal reload is a pre-existing accepted condition, and
the kill switches are rollback levers.**

No-caller / no-op writers (removing the reload is inert today): `updatePurchaseOrderLine`, `deleteFcSpecialEvent`,
`upsertTaxRateComponent`, `createShipmentFromPlan`, the 4 unwired shipping-plan adapters, and
`syncMarketplaceSkusToSkuRegionalDetails` (alert only, no re-render).

## §1/§13/§23 The mechanism (one seam, auto-coupled, plus a bounded patch — no new cache, no TTL)
`operation-system-db-api.js`:
- **`_kmScopedPostureActive_()`** — read-only posture probe. Returns `true` ONLY when it can POSITIVELY confirm the
  read side is fully scoped: `KM_WRITER_FULL_RELOAD !== true` AND `KM_SCOPED_PAGE_READS !== false` AND the Foundation
  (`KM.api.workspaceApiActive`) is present AND all **8 canonical workspaces** are active. Any uncertainty (kill switch
  engaged, Foundation absent, or an exception) → `false`.
- **`_kmWriterPostWrite_()`** — `if (!_kmScopedPostureActive_()) await loadOperationDb({ force: true });`. Replaces the
  47 writers' former reload. In the default posture it does **NOTHING → 47 whole-DB reloads become 0**; any read-side
  kill switch AUTOMATICALLY re-arms the old reload (single-lever rollback stays fresh-after-write). This mirrors the
  EXACT signal each page uses to choose scoped-vs-Legacy render (`workspaceApiActive(name)` / `KM_SCOPED_PAGE_READS`),
  so whenever a consumer would render stale from the broad cache the writer reloads, and never otherwise.
- **`_kmRefreshCacheTables_(tableNames)`** — bounded targeted cache patch (§1 option C / §13-sanctioned): re-GET only
  the named tables via the EXISTING `getTable` action, run the SAME `normalizeOperationDb` per-table logic, and patch
  ONLY those slices into `_opDbCache`. Used for the ONE primary surface that reads a broad-cache slice in every mode.

Cache behavior: BEFORE — every write replaced the whole global `_opDbCache`. AFTER — canonical consumers ignore
`_opDbCache` (own scoped read-model), so it may go stale; it is refreshed only (a) by the posture-gated seam in a
rollback posture, (b) the one bounded slice patch, or (c) the unchanged app.js prime / manual `reloadOperationDb`.

## §12/§17 Response & error semantics (unchanged)
Writers write; reads read — no write response was inflated into a read DTO. Every writer's seam/patch call sits in the
SUCCESS branch (after the `if (!json.success) throw` guard, or inside `if (json && json.success) { … }`), so a failed
write NEVER triggers invalidation and never clears visible data. Idempotency / double-click guards / lease / token
concurrency are all in code paths left byte-identical.

## Per-domain proofs (§4–§11, §14–§18) — post-write freshness preserved
| Domain | Writers | Post-write freshness AFTER |
|---|---|---|
| SKU/marketplace/tax | 10 | sku-details/SRD/IR pages scoped `_xAfterWrite`; `upsertMarketplace` unchanged (its IR dropdown already read the scoped read-model in Workspace mode — pre-existing; Legacy fresh via the seam). |
| **importMarketplaceSkusBatch (CSV, IR:4749)** | — | **PAGE FIX**: readback routed through `_irAfterWrite` (scoped IR re-read in Workspace; Legacy render + seam-reload) — now matches the single-row Add path (was a direct `renderReplenishment()` that assumed the writer reloaded). |
| Forecast/Campaign | 8 | fc-summary canonical `_fcAfterWrite` (scoped `getWorkspace('fcSummary')`). RO 2nd-layer FC-edit surfaces are §14 secondary (self-heal on open; documented, not redesigned). |
| Request Order | 8 | request-order-draft `loadAndRender → getWorkspace('requestOrder')`; request-order live `getActiveRequestOrderDrafts` re-read. |
| **upsertRequestOrderSiteConfirmations** | — | **BOUNDED PATCH**: `_roLoadConfirmationsFromDb → getRequestOrderSiteConfirmations()` reads the broad slice in EVERY mode, so this writer keeps ONLY `requestOrderSiteConfirmations` fresh via `_kmRefreshCacheTables_` (bounded, not whole-DB). |
| Purchase Order | 5 | purchase-order-overview / request-order-draft `loadAndRender → getWorkspace('purchaseOrder'/'requestOrder')`. `updatePurchaseOrderLine` has no caller. |
| Shipping Plan | 5 | createShippingPlansBatch → `renderShippingPlan → getWorkspace('weeklyShipping')` (canonical default). 4 adapters unwired (latent). |
| Shipment (HIGH RISK) | 7 | shipping-history `_shLoadAndRender → _shRefresh_ → getWorkspace('shipment')`; global-logistics-map `afterShipmentWrite → ensureDb(true) → getWorkspace('shipment')`. Allocations / PO-shipped / FIFO / factory-stock deduction / receipt / route progression are backend-authoritative and re-read scoped — no frontend quantity patching, transaction boundaries untouched. `createShipmentFromPlan` has no caller. |
| Inventory | 3 | factory-stock/overseas-stock `_fsAfterWrite`/`_osAfterWrite → loadScopedTables`. `refreshFactoryStockTables` stays a bounded per-table re-read. |
| Carrier | 1 | carrier-rate-card `_crcAfterWrite → loadScopedTables`. |

## §16 Latency class change
BEFORE: `WRITE + whole-DB getOperationDb + whole normalizeOperationDb + global cache replace + PAGE READBACK`.
AFTER: `WRITE + PAGE SCOPED READBACK` (canonical posture). The full-DB network refetch and full global normalization are
removed from the success path. No fixed ms promised.

## §14 Secondary broad readers (left in place, documented)
- **request-order 2nd-layer expand** (forecast breakdown / Edit Target% / FC Update): self-heals on OPEN
  (`if (!_opDbCache) loadOperationDb`). After a write elsewhere it shows the change on next open/reload — accepted §13
  staleness. NOT migrated / NOT redesigned. The two RO-expand FC-edit save handlers (`_roSaveTargetPct`, `_roSaveFc`)
  therefore reflect edits on reopen rather than instantly.
- **fc-summary builder/import modals**: fc-summary is the canonical `fcSummary` workspace page and reconciles via the
  scoped `_fcAfterWrite`, so its primary surfaces stay fresh without the whole-DB reload.

## §15 app.js global prime — UNCHANGED (F1-7L owns removal)
Batch F makes the global cache less critical after writes but does NOT remove the startup prime. It remains for the IR
allocation-draft hydrate (HALT E), the secondary lazy surfaces, and the Legacy kill-switch paths.

## Debt reconciliation (§21/§33–§44)
| Metric | PRE (655d3bc) | POST |
|---|---|---|
| **Writer full-reload (the 47)** | **47** | **0** |
| whole-DB `loadOperationDb({force:true})` CALLS in db-api | 45 (44 writer + 1 debug) | 2 (seam fallback + debug util) |
| ACTIVE_PRIMARY broad reads | 0 | 0 (unchanged) |
| ACTIVE_SECONDARY broad readers | 2 | 2 (RO expand, fc modals — untouched) |
| BACKGROUND broad reads | 2 | 2 (app.js prime, sku-details manual) |
| LEGACY_ONLY broad reads | 13 | 13 (kill-switch branches — untouched) |
| app-prime-dependent surfaces | 1 | 1 (IR allocation-draft hydrate, HALT E — untouched) |
| Incoming / sitePlanning / Event-Assist / allocation-hydrate authority | — | UNCHANGED |

## §23 Rollback
1. Revert the commit; OR 2. **`window.KM_WRITER_FULL_RELOAD = true`** — one temporary transport flag restoring the OLD
whole-DB reload for ALL 47 writers with no redeploy. Any read-side kill switch (`setWorkspaceEnabled(name,false)`,
`KM_SCOPED_PAGE_READS=false`) also auto-restores the reload for its scope.

## Delivery
- **Files** — runtime: `assets/js/api/operation-system-db-api.js` (3 helpers + 47-writer conversion + site-conf bounded
  patch), `assets/js/pages/inventory-replenishment.js` (CSV-import readback → `_irAfterWrite`). Tests: NEW
  `api-batch-f-writer-full-reload-retirement-f1-7k-r1.test.js` (152/0) + 5 stale-contract assertion updates
  (api-bounded-reference-include-extensions-f1-7j-a2, api-non-workspace-primary-scoped-cutover-f1-7j-a3,
  fc-special-event-persist, shipment-draft-allocation-wiring-f1-5b-ship-r3c, shipment-map-route-eta-receiving-f1-shipment-map-r10).
  Docs: this file + master-plan delta.
- **API contract delta** — NONE. **Apps Script sync: NO. Router: NO. New /exec: NO. Bundle: NO (`aaf5b07…2782`).
  DB/schema: NONE.** Frontend deploy YES: operation-system-db-api.js + inventory-replenishment.js.
- **Tests** — new 152/0; full regression **233 files, only the 4 known baselines** (`gap-job-done-notice-f1-small-r1`,
  `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`).
- **HALT/risk tokens** — none. HALT E (`IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER`) remains deferred and is the
  sole app-prime-removal blocker (F1-7L), untouched here.

**FINAL GATE: PASS** — writer full-reload 47→0; all business side effects/authorities unchanged; existing scoped page
readbacks provide freshness; no canonical consumer requires the whole global cache refresh; no transaction/idempotency
change; app.js prime untouched; no new regression.

**STOP after F1-7K. Do NOT begin F1-7L automatically. Do NOT redesign authority debts.**
