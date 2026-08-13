# F1-7C-PO-WORKSPACE-AND-CUTOVER-R1 — Purchase Order scoped workspace + page cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE == AFTER).** Baseline HEAD `7784285`. Both active
Purchase Order pages (`purchase-order-overview.js`, `purchase-order-list.js`) now render from ONE scoped
`purchaseOrder` workspace — no broad Operation DB for primary render, scoped post-write refresh, and `remaining_qty`
owned by the backend DTO. No PO/RO/FIFO/Shipment business logic changed.

## §1 Frozen PO authorities (unchanged)
`ordered_qty` (persisted), `completed_qty` (persisted), `shipped_qty` (persisted, from executed allocations —
passed through verbatim), `remaining_qty = max(0, completed - shipped)` (the SAME definition `13_` persists at write
time), PO lifecycle/status, RO lineage, request bucket (T1/T2_T3), supplier/company/factory/currency,
shipment_line_allocations, FIFO, factory stock, receipt, RO→PO exactly-once. The frontend owns none of these.

## §2 Read-path audit (before)
Both pages: `loadAndRender()` force-loaded the whole Operation DB (`loadOperationDb({force:true})`), then `buildModels`
joined `purchase_orders`+`purchase_order_lines`+`sku_details`+`warehouses` from `_opDbCache`. Only
`purchase-order-list.js` derived a canonical fact — `remaining = (l.remainingQty present ? l.remainingQty : max(0,
completed - shipped))` — i.e. a **LEGACY_PARALLEL_BUSINESS_FACT fallback** (it already preferred the persisted value;
the fallback fired only on blank cells). `purchase-order-overview.js` computes only display aggregates + "Unreceived =
ordered - completed" (DISPLAY_ONLY / READ_MODEL_ASSEMBLY) — no remaining/status authority.

## §3/§4 Purchase Order workspace (NEW backend `50_api_v1_purchase_order_workspace.gs`)
- Action `purchaseOrder.workspace.get` (router dispatch added). Reads ONLY the 4 PO tables — **never `getOperationDb`**.
- Same discipline as `40_`: pure builders + injectable `io`; S0/S0.5 exact-ID + validate-only presence; fail-closed.
- **Input grain:** `{ filters, search, sort, page, include }`. **Output grain:** `{ summary, purchaseOrders[],
  detailsByPurchaseOrderId, skuDetails[], warehouses[], filters, pagination }`.
- **DTO fields:** per PO — purchaseOrderId, poNo, requestOrderId, requestBucket, company, factoryId, warehouseId,
  factoryName (joined), supplierId/Name, currency, status, orderDate, orderedQty/completedQty/shippedQty/remainingQty
  (line rollups), lineCount, `raw` (passthrough). Per line — purchaseOrderLineId, purchaseOrderId, sku, series,
  category, orderedQty, completedQty, shippedQty, **remainingQty (backend-owned)**, `raw`. Plus scoped `skuDetails`
  (sku/category/series) and `warehouses` (id/name) subsets — NOT the whole masters.
- **remaining_qty owner:** the backend `poLineRemaining_(row)` = persisted `remaining_qty` when present, else
  `max(0, completed_qty - shipped_qty)` — the SAME projection `13_` persists. **No second shipped calc, no FIFO, no
  shipment recompute.** The value proven identical to the old client fallback for both cases (test).

## §5 Detail grain
The collection carries enough line detail (`detailsByPurchaseOrderId`) for both pages in ONE bounded read; the client
requests one large page (size 2000, cap 2000) because the pages filter/paginate client-side. `pagination.totalItems`
lets the client detect if the (Phase-1-safe) bound were ever exceeded. No per-line/N+1 calls; no separate detail call.

## §6/§7 Frontend cutover
- `purchaseOrder` activated as a **CANONICAL** workspace (`WORKSPACE_CANONICAL.purchaseOrder = true`, per-workspace flag
  default ON) — master-flag-independent; kill switch `KM.api.setWorkspaceEnabled('purchaseOrder', false)`.
- Each page: a module `_poReadModel` / `_polReadModel` sourced from `KM.api.getWorkspace('purchaseOrder')` →
  `KM.DB.adaptPurchaseOrderWorkspace(data)` (which runs the SAME canonical normalizers on the DTO `raw` → byte-identical
  records, and overrides `remainingQty` from the backend DTO). `buildModels` reads that read-model when canonical, else
  the Legacy getters. Mount + post-write refresh no longer force-load the broad DB in Workspace mode.
- **No hidden broad fallback:** the Workspace read branch contains no `getOperationDb/loadOperationDb/_opDbCache`; on
  error it shows a bounded region ERROR (never a Legacy full-DB render). Reuses `KM.loadState` (F1-7B).

## §8 Writes (overview) — scoped refresh
| Write | Backend owner | Old refresh | New refresh |
|---|---|---|---|
| receivePurchaseOrderLines (Receive) | 13_ | `loadAndRender` → broad reload | `loadAndRender` → scoped `purchaseOrder` workspace re-read |
| updatePurchaseOrderHeader (Save) | 13_ | broad reload | scoped re-read |
| updatePurchaseOrderStatus (Send/Confirm/…) | 13_ | broad reload | scoped re-read |
Write API/validation/idempotency/error codes/status semantics unchanged; `purchase-order-list.js` is read-only.
**Boundary note:** the shared `KM.DB.*` write methods still call `loadOperationDb({force:true})` INTERNALLY (the
~40-writer WRITE_FORCES_FULL_RELOAD pattern) — that populates `_opDbCache` the PO page now ignores. Removing that
internal reload is the deferred **Batch F** cleanup; this round makes the PAGE's post-write refresh scoped (it no longer
depends on or triggers the broad load for its own render).

## §9 Legacy parallel client math — downgraded
`purchase-order-list.js` remaining: in Workspace mode the DTO always supplies `remainingQty`, so the client `max(0,
completed - shipped)` branch is bypassed — the browser now DISPLAYS the backend value. The fallback survives only for
old Legacy broad-cache rows with a blank cell. Proven: DTO remaining == the old client formula for the same fixture.

## §10 Relationships / §13 PO→Shipment guards
Joins are server-side/bounded (request_order lineage via `raw`, factory name from `warehouses`, category/series from
`sku_details`). **factory_id NEVER determines company** — proven: two POs sharing Factory A keep distinct companies
(KM/ResTW). Source guards prove `50_` reads no `shipment_line_allocations`/`shipment_lines`/`factory_stock`, runs no
FIFO, and writes nothing; `shipped_qty` is passed through verbatim → completed capacity, shipped reconciliation,
remaining capacity, factory stock, and shipment physical qty are untouched (transport-only change).

## §15 app.js global prime
Unchanged (KEEP). PO pages are now independent of it in Workspace mode; ~11 legacy pages still consume `_opDbCache`, so
global-prime removal remains a later Batch F step. **PO pages independent: YES.**

## Tests
New `api-purchase-order-workspace-f1-7c-r1.test.js` **56/0**: remaining-owner (persisted + fallback == legacy formula),
PO rollups, join, filter/sort/pagination, empty, invalid-sort fail-closed, raw passthrough, shared-factory/RO-lineage,
PO→Shipment/FIFO/factory-stock source guards, activation + router dispatch, adapter reuses canonical normalizers +
backend remaining, page workspace-primary-read + fail-closed + no broad DB + remaining backend-owned. Updated to the
post-cutover contract (purchaseOrder canonical): km-api-foundation, km-api-foundation-compat (PG1 cutover set),
api-weekly-shipping-cutover-f1-7b. **Full regression: 218 files, only the 4 known baseline failures (none new).**
Bundle unchanged (`aaf5b07`, --check PASS).

## §16 Deployment / version
- **PRE HEAD** `7784285` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `50_api_v1_purchase_order_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment version: YES** — a new router action + backend handler were added; the deployed Web App
  must include them for the (canonical-ON) frontend to reach `purchaseOrder.workspace.get`.
- **⚠ DEPLOY ORDERING:** because `purchaseOrder` is canonical-ON, the frontend calls the new action immediately. Deploy
  the **backend (50_ + router, new /exec) FIRST (or together)**, then the frontend. If the frontend ships before the
  backend `/exec`, the PO pages fail-closed with a bounded read error (never Legacy, never silent) until the backend is
  live — or hold the cutover with the kill switch `KM.api.setWorkspaceEnabled('purchaseOrder', false)` during the gap.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `purchase-order-overview.js`,
  `purchase-order-list.js`. (`index.html` unchanged — `km-loading-state.js` already included in F1-7B.)
- **Bundle rebuild: NO** (`50_` is not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `purchaseOrder.workspace.get` (new READ workspace); no existing route/DTO changed.
- **Rollback:** revert to `7784285`; or runtime kill switch `KM.api.setWorkspaceEnabled('purchaseOrder', false)` →
  instant Legacy restore (no deploy).

## FINAL GATE — PASS
PO primary render = scoped API ✓ · no full Operation DB dependency ✓ · remaining_qty = backend DTO authority ✓ ·
post-write refresh scoped ✓ · BEFORE == AFTER ✓ · RO/PO/FIFO/Shipment contracts unchanged ✓ · no business authority
moved to frontend ✓ · no silent broad fallback ✓ · no new regression failures ✓.

**Purchase Order scoped read: DONE.**

**Exact next slice:** BATCH C continued — `requestOrder` workspace + `request-order-draft.js` cutover (same pattern),
or BATCH D `shipment` workspace. Do NOT begin automatically.
