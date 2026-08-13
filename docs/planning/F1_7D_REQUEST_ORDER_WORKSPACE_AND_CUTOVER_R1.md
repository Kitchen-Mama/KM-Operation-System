# F1-7D-REQUEST-ORDER-WORKSPACE-AND-CUTOVER-R1 — Request Order scoped workspace + Draft-page cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE == AFTER).** Baseline HEAD `8f7b507`. The Request Order
Draft page (`request-order-draft.js` — the persisted Draft / Pending Approval / Approved card workflow) now renders from
ONE scoped `requestOrder` workspace — no broad Operation DB for primary render, scoped post-write refresh, fail-closed on
error. No Gap/Forecast/Recommendation/RO→PO/FIFO logic changed; no second engine created.

## §0/§2/§3 Active Request Order pages audited — scope decision
Two nav routes exist and consume **different read models**:
- **`request-order-draft.js`** (`request-order-draft-section`) — the round's **named primary target**. Reads persisted
  `request_orders` / `request_order_lines` (+ `request_order_line_sources`, `warehouses`, `sku_details`,
  `supplier_price_list` for the allocation popup + create modal) via broad-cache `KM.DB` getters. Its browser work is
  DISPLAY_ONLY / READ_MODEL_ASSEMBLY (card grouping, carton math, live validation) — it reconstructs **no** canonical
  business fact. Clean transport cutover. → **MIGRATED.**
- **`request-order.js`** (`request-order-section`, 下單系統/AI-Plan ordering table, ~3.6k lines) — a **different read
  model**: it reconstructs Forecast (`fc_regular_forecast` Σ), site/3rd-party/factory stock, and open-PO remaining
  client-side, and owns `_opMatCache`. Its gap/recommendation/draft path is **already** scoped (`requestOrderDraft.job.*`,
  `_kmGapRead_` materialized gap, allocation drafts). Its first-layer table would need backend Forecast/stock ownership —
  which this round's §5 **forbids** ("Do NOT recompute Gap/Forecast/Recommendation during a read"). Per the mission
  ("primary target request-order-draft.js; do not migrate unrelated read models") → **NOT migrated; documented deferral**
  (see Next slice). Migrating it would trip `REQUEST_ORDER_DTO_REQUIRES_BUSINESS_REDESIGN`.

## §1 Frozen authorities (unchanged)
Order Planning Gap, `recommended_qty`, AI-Plan/recommendation output, `request_order_allocation_drafts`, manual
`order_qty`, company/factory allocation, T1/T2_T3, `generation_type`, scheduled/manual lineage, user-edited draft
protection, `BLOCKED_CONFLICT`, Request Order creation, `request_order_id`/`request_order_line_id`, `requested_qty`,
RO→PO exactly-once, PO split, FIFO, shipment allocation. The Draft page + the new workspace own **none** of these — the
workspace is a READ MODEL that composes persisted truth. The critical chain (Gap → Recommendation → persisted AI-Plan
draft → user decision → Request Order → Purchase Order) is untouched: **no second recommendation engine, no second draft
persister, no second Request Order engine.**

## §4 Request Order workspace (NEW backend `51_api_v1_request_order_workspace.gs`)
- Action `requestOrder.workspace.get` (router dispatch added). Reads ONLY 6 tables — **never `getOperationDb`**.
- Same discipline as `40_`/`50_`: pure builders + injectable `io`; S0/S0.5 exact-ID + validate-only presence; fail-closed.
- **`request_order_line_sources` is OPTIONAL/missing-safe** (its write path is documented PENDING) → absent = `[]`, never a
  `SCHEMA_NOT_PROVISIONED` throw. The provisioned tables (`request_orders`, `request_order_lines`, `warehouses`,
  `sku_details`, `supplier_price_list`) stay fail-closed exactly like `50_`.
- **Input grain:** `{ filters, search, sort, page, include }`. **Output grain:** `{ summary, requestOrders[],
  detailsByRequestOrderId, lineSources[], warehouses[], skuDetails[], supplierPriceList[], filters, pagination }`.
- **DTO facts:** per RO — requestOrderId, requestOrderNo, company, status (`request_status` canonical, legacy `status`
  fallback), createdAt, completedAt, lineCount, totalRequested/totalApproved (line rollups), `raw` passthrough. Per line —
  requestOrderLineId, requestOrderId, sku, company, requestBucket, lineStatus, `raw`. Masters returned as **raw rows**
  (`lineSources`/`warehouses`/`skuDetails`/`supplierPriceList`) so the page adapter re-normalizes them with the SAME
  db-api normalizers → byte-identical records. `requested_qty`/`approved_qty`/`company`/`request_bucket` are passed
  through verbatim — **never recomputed** (no Gap/Forecast/Recommendation).

## §3 APIs reused (no duplication)
The workspace does NOT re-implement gap/recommendation/draft APIs. `request-order.js`'s existing scoped path
(`generateRecommendationDraftLocked`, `requestOrderDraft.generateFromGap`, `48_` job state, `requestOrderDraft.getActive`)
is untouched. The workspace composes only persisted `request_orders`/`request_order_lines`.

## §6 `_opMatCache`
`_opMatCache` is owned exclusively by `request-order.js` (a scoped client cache of the materialized Gap DTO). The Draft
page never touches it. Because `request-order.js` is not migrated this round, `_opMatCache` is **unchanged** (before ==
after; remaining consumer = `request-order.js`). No new persistent client authority was introduced.

## §7 Frontend business math classification (request-order-draft.js)
| Calc | Class | Disposition |
|---|---|---|
| `buildRowModel` (group lines by bucket/sku, per-company aggregate) | READ_MODEL_ASSEMBLY | stays (display aggregation of persisted per-line facts) |
| `recomputeCard` carton = ceil(qty/upc) | DISPLAY_ONLY | stays |
| `validateCard` full-carton + company-split | DISPLAY_ONLY (UI gate; authority = backend `updateRequestOrderLineQty`) | stays |
| `roFactoryDisplay` warehouse-name lookup | FORMAT_ONLY | stays |
No canonical business fact is reconstructed client-side → **nothing to move to the backend.** No frontend Gap/Forecast/
Recommendation/FIFO/PO-remaining reconstruction (PO-remaining lives only in `request-order.js`, not migrated).

## §8/§9 Frontend cutover
- `requestOrder` activated as **CANONICAL** (`WORKSPACE_CANONICAL.requestOrder = true`, per-workspace flag default ON) —
  master-flag-independent; kill switch `KM.api.setWorkspaceEnabled('requestOrder', false)`.
- `request-order-draft.js`: a module `_roReadModel` sourced from `KM.api.getWorkspace('requestOrder')` →
  `KM.DB.adaptRequestOrderWorkspace(data)` (SAME normalizers on the DTO `raw` → byte-identical records). Read-model-first
  accessors (`_roGetOrders/_roGetLines/_roGetLineSources/_roGetWarehousesArr/_roGetSkuMaster/_roGetSupplierPriceListArr`)
  swap the source: Workspace → DTO, Legacy → the broad-cache getters unchanged. Primary render + create-modal masters +
  allocation popup all read the read-model in Workspace mode → the modal never needs a broad DB load.
- **No hidden broad fallback:** the Workspace read branch contains no `getOperationDb/loadOperationDb/_opDbCache`; on error
  it shows a bounded region ERROR (never a Legacy full-DB render). Reuses `KM.loadState` (INITIAL_LOADING/READY/EMPTY/
  REFRESHING/ERROR), region-scoped — the page shell renders independently of the data load.

## §10 Writes — scoped refresh (payload/authority unchanged)
| Write | Backend owner | Old refresh | New refresh |
|---|---|---|---|
| `updateRequestOrderLineQty` (Save / tier note) | 24_ | `loadAndRender` → broad reload | `loadAndRender` → scoped `requestOrder` re-read |
| `updateRequestOrderStatus` (submit/approve/reject/cancel/done) | 24_ | broad reload | scoped re-read |
| `cancelRequestOrderTier` | 24_ | broad reload | scoped re-read |
| `createRequestOrderDraft` (manual create) | 24_ | broad reload | scoped re-read |
| `createPurchaseOrderFromRequest` (Convert to PO) | 13_ | broad reload | scoped re-read |
Write API/validation/idempotency/error codes/status semantics unchanged; writes stay on `KM.DB.*` (no `KM.api` workspace
write). **Boundary note:** the shared `KM.DB.*` writers still call `loadOperationDb({force:true})` INTERNALLY (the
~40-writer WRITE_FORCES_FULL_RELOAD pattern) — that populates `_opDbCache` the page now ignores. Removing that internal
reload is the deferred **Batch F** cleanup; this round makes the PAGE's post-write refresh scoped.

## §11/§12/§13 Protected contracts (proved untouched)
- **User-edit protection / single-active draft / lease / `BLOCKED_CONFLICT` / scheduled vs manual `generation_type`** — all
  live in `request-order.js` + `48_`/`49_`/`24_`, none touched. The workspace read alters none of them (source guards:
  `51_` runs no generation, persists nothing, creates no RO).
- **Monthly Recommendation chain** (`runMonthlyOrderRecommendation → 49_ → 48_ → 24_ → persisted canonical draft`) — the
  workspace reads the resulting persisted truth; it never invokes generation and never hides a missing Order Planning Gap
  (missing prerequisite stays fail-closed). Unchanged.
- **RO→PO contract** — `requested_qty`, `request_order_id`, `request_order_line_id`, request bucket, T1/T2_T3, company,
  `factory_id`, RO→PO exactly-once, PO `ordered_qty` all pass through verbatim (`51_` is read-only; conversion still owned
  by `createPurchaseOrderFromRequest`/13_). The F1-7C Purchase Order workspace is untouched.

## §14 BEFORE == AFTER
The adapter runs the SAME canonical normalizers (`normalizeRequestOrderRecord`/`…Line`/`…LineSource` + master
normalizers) on the DTO `raw` passthrough, applying the SAME per-array filters as `normalizeOperationDb` → the adapted
arrays equal the legacy getters exactly. Proven across single/multi-SKU, KM/ResTW/ResUS, T1/T2_T3, status filter, search,
sort, pagination, empty, API error, optional-missing line sources, and the create-modal masters.

## §15 app.js global prime
Unchanged (KEEP). The Draft page is now independent of it in Workspace mode; **Request Order Draft page independent:
YES.** `request-order.js` + ~10 other legacy pages still consume `_opDbCache`, so global-prime removal remains Batch F.

## Tests
New `api-request-order-workspace-f1-7d-r1.test.js` **58/0**: RO rollups/status-fallback, company passthrough, filter/
sort/search/pagination, empty, invalid-sort fail-closed, raw passthrough, optional line-sources missing-safe (pure + io),
orchestrator envelope + 6-table scope, no-second-engine source guards (no getOperationDb/write/Recommendation/Forecast/
draft-gen/FIFO/RO-create/PO-create; no Gap/Forecast/shipment tables), activation + router dispatch, adapter reuses
canonical + master normalizers with matching filters, page workspace-primary-read + no-broad-DB + fail-closed +
read-model accessors + KM.loadState + writes-unchanged, and `request-order.js` deferral guard. Contract tests updated to
the post-cutover contract (requestOrder canonical): km-api-foundation (R3b "other four"; F2/F3 repointed to `shipment`),
km-api-foundation-compat (NS1/NS2 + FF4 repointed to `shipment`; PG1 CUTOVER_PAGES + PG1e), km-api-weekly-workspace (CR2
`shipment`), api-purchase-order-workspace-f1-7c (canonical regex tolerant). **Full regression: 219 files, only the 4 known
baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## §18 Deployment / version
- **PRE HEAD** `8f7b507` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `51_api_v1_request_order_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment version: YES** — a new router action + backend handler were added; the deployed Web App must
  include them for the (canonical-ON) frontend to reach `requestOrder.workspace.get`.
- **⚠ DEPLOY ORDERING:** because `requestOrder` is canonical-ON, the frontend calls the new action immediately. Deploy the
  **backend (51_ + router, new /exec) FIRST (or together)**, then the frontend. If the frontend ships before the backend
  `/exec`, the Draft page fails-closed with a bounded read error (never Legacy, never silent) until the backend is live —
  or hold the cutover with the kill switch `KM.api.setWorkspaceEnabled('requestOrder', false)` during the gap.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `request-order-draft.js`. (`index.html`
  unchanged — `km-loading-state.js` already included in F1-7B.)
- **Bundle rebuild: NO** (`51_` is not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `requestOrder.workspace.get` (new READ workspace); no existing route/DTO changed. The
  F1-7C `purchaseOrder` workspace is untouched.
- **Rollback:** revert to `8f7b507`; or runtime kill switch `KM.api.setWorkspaceEnabled('requestOrder', false)` → instant
  Legacy restore (no deploy).

## FINAL GATE — PASS
Request Order Draft primary render = scoped API ✓ · no broad Operation DB dependency ✓ · no second Recommendation/Draft/RO
engine ✓ · canonical business facts backend-owned (persisted) ✓ · user-edited drafts protected (request-order.js/48_/49_
untouched) ✓ · Monthly scheduled flow canonical ✓ · RO→PO contract unchanged ✓ · post-write refresh scoped ✓ · BEFORE ==
AFTER ✓ · no silent broad fallback ✓ · no new regression failures ✓.

**Request Order scoped read: DONE.**

**Exact next slice:** BATCH D — `shipment` workspace + page cutover, or `fcSummary` / `skuDetails`. The larger
`request-order.js` (AI-Plan first-layer Forecast/stock/PO-remaining table) is a SEPARATE follow-up that first needs a
backend Forecast/inventory read owner (currently forbidden by the transport-only guardrail) — propose it as its own
bounded round. Do NOT begin automatically.
