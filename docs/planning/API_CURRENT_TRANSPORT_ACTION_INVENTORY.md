# API Current Transport & Action Inventory — Phase API-0 (2026-08-04)

> **Round:** PHASE API-0 — Current Transport, Action & Functional Reachability Audit. **READ-ONLY / NO IMPLEMENTATION.**
> **Repo:** `Operation System` · **Branch:** `main` · **PRE HEAD:** `8dfbb3d8e5c2e75463504fa6dc4f442a7c774f31` (`feat(safety): enforce schema guards across active runtimes`).
> **Scope:** the current UI → transport → router → handler → runtime → DB reality, as **source-proven** from the repository. The Apps Script `.gs` files are a **source mirror (NOT deployed)**; where a live deployment could differ, this is marked. This document is the input to **API-1 Foundation Contract Freeze** — it is not itself a contract.
> **Evidence keys:** SOURCE-PROVEN (read in repo) · SPEC-SUPPORTED · INFERRED · UNKNOWN. Governance: no business code changed, no live Sheet accessed, Golden 39/1/0, Scenario #34 Pending.

---

## 1. Transport architecture (SOURCE-PROVEN)

- **Single transport file:** `assets/js/api/operation-system-db-api.js` (3778 lines). **100% of backend I/O lives here** — pages never call `fetch`/`google.script.run` directly; they call `window.KM.DB.*` wrappers.
- **One endpoint:** `OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/AKfyc…/exec'` (`:6`), a real configured Apps Script Web App. `isOperationDbApiConfigured()` (`:12`) returns **true**.
- **Transport style = `WEB_APP_FETCH`** everywhere. **Zero `google.script.run`, zero `XMLHttpRequest`** in the whole `assets/js` tree.
- **Reads:** `GET ?action=getOperationDb` (whole-DB, all 44 tabs — `:40`) and `GET ?action=getTable&table=…` (`:54`).
- **Writes:** `POST` to the base URL with `headers:{'Content-Type':'text/plain'}` (CORS-preflight-avoidance) and `body: JSON.stringify(Object.assign({action}, payload))`. On `!resp.ok`→throw; on `json.success===false`→throw (no fake success); **on success → `await loadOperationDb({force:true})`** = a real canonical **readback** before the UI re-renders.
- **Write gate:** `isCloudWriteEnabled() = isConfigured() && dataSourceMode==='google-sheet'` (`:2370`). When the initial GET fails, mode flips to `'mock'` (`:2085`) and write-gated pages fall back to sessionStorage/in-memory (disclosed, not silent-success).
- **No timeout / no AbortController / no retry / no request-cancellation** in the transport layer → **STALE_RESPONSE_RISK** on scope changes (P3, §Performance).
- **Shared write helper:** only the Weekly-Plan L1/L2 group uses `_kmShippingPost_(action,payload,errMsg,reloadAfter)` (`:2722`); all other writers inline the same fetch block.

---

## 2. Router registry (SOURCE-PROVEN — `01_router.gs`, 307 lines)

- **doGet** dispatches `getOperationDb` → `handleGetOperationDb_` (`03_master_data_handlers.gs:13`) and `getTable` → `handleGetTable_` (`03:34`). Read-only, no lock.
- **doPost** parses `JSON.parse(e.postData.contents)`, reads `body.action`, dispatches via an if-chain (`01:43-307`). Uniform envelope: success → `jsonResponse_({success:true,data:…})` (`02_core_sheet_db.gs:268`); failure → `{success:false,error:err.message}` (top-level catch `01:305`).
- **61 total actions registered** (2 GET + 59 doPost branches).
- **Envelope caveat:** `jsonResponse_` does not enforce a shape; each handler chooses it. Recommendation handlers add `stage`/`schemaValidation` keys.

---

## 3. Master action inventory (transport ↔ router ↔ handler ↔ runtime ↔ tables ↔ disposition)

Legend — **Txn**: F=frontend caller exists, ∅=no UI caller. **Lock**: ✔=LockService. **Disp** (API migration disposition): see `API_MIGRATION_MASTER_PLAN.md` §Classification.

### 3.1 Reads

| Action | Transport (api.js) | Handler / file | Runtime owner | Tables read | Disp |
|---|---|---|---|---|---|
| `getOperationDb` | GET `:40` | `handleGetOperationDb_` `03:13` | handler | ALL 44 tabs (`readSheetAsObjects_`) | MERGE_INTO_WORKSPACE_API (whole-DB read is the #1 perf issue) |
| `getTable` | GET `:54` | `handleGetTable_` `03:34` | handler | 1 whitelisted tab | WRAP_AS_API_V1 |
| `getShippingMethodCandidates` | POST `:2733` | `handleGetShippingMethodCandidates_` `17:663` | handler (carrier match) | carrier_rate_cards, carriers | SPLIT_READ_WRITE (read) |
| `getWeeklyPlanRateCandidates` | POST `:2735` (F) | **MISSING** (no `function` in any `.gs`) | — | — | REQUIRES_MAPPING_DECISION (handler absent in mirror) |
| `getRecommendationDraftToken` | POST `:2834` (F, used by alloc-lines optimistic concurrency) | `handleGetRecommendationDraftToken_` `25:23` | KMPR (token) | request/shipping allocation drafts+lines | KEEP_AS_INTERNAL_RUNTIME |
| `auditFcSpecialEventIds` | ∅ (editor-run) | `handleAuditFcSpecialEventIds_` `14:296` | handler | fc_special_events | DO_NOT_API_YET (admin) |

### 3.2 Writes — connected to a UI control (F)

| Action | Transport | Handler / file | Lock | Tables written | UI page | Disp |
|---|---|---|---|---|---|---|
| `updateSkuLifecycle` | `:2394` | `handleUpdateSkuLifecycle_` `03:50` | | sku_details | sku-details | WRAP_AS_API_V1 |
| `upsertSkuDetail` | `:2477` | `handleUpsertSkuDetail_` `03:237` | | sku_details | sku-details | WRAP_AS_API_V1 |
| `upsertMarketplace` | `:2420` | `handleUpsertMarketplace_` `03:521` | | marketplaces | inventory-replen | WRAP_AS_API_V1 |
| `upsertMarketplaceSku` | `:2438` | `handleUpsertMarketplaceSku_` `03:318` | | marketplace_skus | inventory-replen | WRAP_AS_API_V1 |
| `updateMarketplaceSkuModel` | `:2456` | `handleUpdateMarketplaceSkuModel_` `03:411` | | marketplace_skus | inventory-replen | WRAP_AS_API_V1 |
| `upsertSkuRegionalDetail` | `:2505` | `handleUpsertSkuRegionalDetail_` `18:112` | | sku_regional_details, marketplace_skus | sku-regional | WRAP_AS_API_V1 |
| `syncMarketplaceSkusToSkuRegionalDetails` | `:2603` | `handleSyncMarketplaceSkusToSkuRegionalDetails_` `18:177` | | sku_regional_details | sku-regional | WRAP_AS_API_V1 |
| `upsertTaxReferralRate` | `:2530` | `handleUpsertTaxReferralRate_` `19:154` | | tax_referral_rates | sku-details | WRAP_AS_API_V1 |
| `upsertTaxRateComponent` | `:2553` | `handleUpsertTaxRateComponent_` `19:281` | | tax_rate_components | (read-only in UI) | KEEP_AS_INTERNAL_RUNTIME |
| `importMarketplaceSkusBatch` | `:3322` | `handleImportMarketplaceSkusBatch_` `04:25` | | marketplace_skus | inventory-replen | SPLIT_READ_WRITE (batch) |
| `importFcRegularForecastBatch` | `:3346` | `handleImportFcRegularForecastBatch_` `04:485` | | fc_regular_forecast | fc-summary | WRAP_AS_API_V1 |
| `upsertFcTargetRule` | `:3285` | `handleUpsertFcTargetRule_` `14:394` | | fc_target_rules | fc-summary | WRAP_AS_API_V1 |
| `deleteFcTargetRule` | `:3304` | `handleDeleteFcTargetRule_` `14:412` | | fc_target_rules | fc-summary | WRAP_AS_API_V1 |
| `upsertFcSpecialEvent` | `:3246` | `handleUpsertFcSpecialEvent_` `14:254` | | fc_special_events | fc-summary (Event builder) | WRAP_AS_API_V1 |
| `deleteFcSpecialEvent` | `:3265` | `handleDeleteFcSpecialEvent_` `14:282` | | fc_special_events | fc-summary | WRAP_AS_API_V1 |
| `upsertCampaign` | `:3212` | `handleUpsertCampaign_` `20:102` | | campaigns | fc-summary (Event builder) | WRAP_AS_API_V1 |
| `upsertCampaignSkuLines` | `:3230` | `handleUpsertCampaignSkuLines_` `20:139` | | campaign_sku_lines | fc-summary | WRAP_AS_API_V1 |
| `importOverseasInventorySnapshotBatch` | `:3375` | `handleImportOverseasInventorySnapshotBatch_` `05:28` | | overseas_inventory_snapshot | overseas-stock | SPLIT_READ_WRITE |
| `adjustOverseasInventory` | `:3398` | `handleAdjustOverseasInventory_` `05:204` | ✔`05:304` | overseas_inventory_snapshot, _movements | overseas-stock | WRAP_AS_API_V1 |
| `adjustFactoryInventory` | `:3421` | `handleAdjustFactoryInventory_` `21:37` | ✔`21:110` | factory_stock, factory_stock_movements | factory-stock | WRAP_AS_API_V1 |
| `importCarrierRateCards` | `:3024` | `handleImportCarrierRateCards_` `17:115` | | carrier_rate_cards | carrier-rate-card | SPLIT_READ_WRITE |
| `createShippingPlansBatch` | `:2623` | `handleCreateShippingPlansBatch_` `11:264` | | shipping_plans, shipping_plan_lines | inventory-replen (Submit Plan) | WRAP_AS_API_V1 |
| `updateShippingPlanStatus` | `:2642` | `handleUpdateShippingPlanStatus_` `11:503` | | shipping_plans (+ auto shipment on approve) | shipping-plan | WRAP_AS_API_V1 |
| `updateShippingPlanLineQty` | `:2661` | `handleUpdateShippingPlanLineQty_` `11:621` | | shipping_plan_lines | shipping-plan | WRAP_AS_API_V1 |
| `appendShippingPlanNote` | `:2681` | `handleAppendShippingPlanNote_` `11:775` | | shipping_plans | shipping-plan | WRAP_AS_API_V1 |
| `completeShippingPlan` | `:2701` | `handleCompleteShippingPlan_` `11:707` | | shipping_plans | shipping-plan | WRAP_AS_API_V1 |
| `createShipmentFromPlan` | `:2748` (∅ — Approve auto-creates) | `handleCreateShipmentFromPlan_` `12:565` | | shipments, shipment_lines | (retry only) | RETIRE_AFTER_API_CUTOVER |
| `updateShipment` | `:2770` | `handleUpdateShipment_` `12:654` | | shipments, shipment_lines | shipment-draft/overview | WRAP_AS_API_V1 |
| `confirmShipmentAndDispatch` | `:2577` | `handleConfirmShipmentAndDispatch_` `22:35` | ✔`22:47` | shipments, factory_stock_movements, shipment_routes/events | shipment-draft | KEEP_AS_INTERNAL_RUNTIME (atomic) |
| `createRequestOrderDraft` | `:2798` | `handleCreateRequestOrderDraft_` `13:539` | | request_orders, request_order_lines, _line_sources | request-order(-draft) | WRAP_AS_API_V1 |
| `updateRequestOrderStatus` | `:3037` | `handleUpdateRequestOrderStatus_` `13:717` | | request_orders | request-order-draft | WRAP_AS_API_V1 |
| `updateRequestOrderLineQty` | `:3057` | `handleUpdateRequestOrderLineQty_` `13:869` | | request_order_lines | request-order-draft | WRAP_AS_API_V1 |
| `cancelRequestOrderTier` | `:3077` | `handleCancelRequestOrderTier_` `13:1229` | | request_orders, request_order_lines | request-order-draft | WRAP_AS_API_V1 |
| `createPurchaseOrderFromRequest` | `:3097` | `handleCreatePurchaseOrderFromRequest_` `13:1317` | | purchase_orders, purchase_order_lines | request-order-draft | WRAP_AS_API_V1 |
| `updatePurchaseOrderStatus` | `:3117` | `handleUpdatePurchaseOrderStatus_` `13:1569` | | purchase_orders | purchase-order-overview | WRAP_AS_API_V1 |
| `updatePurchaseOrderHeader` | `:3159` | `handleUpdatePurchaseOrderHeader_` `13:1652` | | purchase_orders | purchase-order-overview | WRAP_AS_API_V1 |
| `receivePurchaseOrderLines` | `:3182` | `handleReceivePurchaseOrderLines_` `13:1801` | | purchase_order_lines, purchase_orders | purchase-order-overview | WRAP_AS_API_V1 |
| `upsertRequestOrderAllocationDraft` | `:2821` | `handleUpsertRequestOrderAllocationDraft_` `15:117` | ✔`15:118` | request_order_allocation_drafts | request-order (Send Request) | KEEP_AS_INTERNAL_RUNTIME |
| `upsertRequestOrderAllocationDraftLines` | `:2847` | `handleUpsertRequestOrderAllocationDraftLines_` `15:224`→`25:48` | ✔ | request_order_allocation_draft_lines | request-order | KEEP_AS_INTERNAL_RUNTIME |
| `submitRequestOrderAllocationDrafts` | `:2865` | `handleSubmitRequestOrderAllocationDrafts_` `15:256` | | drafts→submitted; request_orders | request-order | DO_NOT_API_YET (Submit boundary) |
| `upsertRequestOrderSiteConfirmations` | `:2915` | `handleUpsertRequestOrderSiteConfirmations_` `16_request_site_confirmation:36` | | request_order_site_confirmations | request-order | WRAP_AS_API_V1 |
| `upsertShippingAllocationDraft` | `:2880` | `handleUpsertShippingAllocationDraft_` `16_shipping_allocation:118` | ✔ | shipping_allocation_drafts | inventory-replen (route edits) | KEEP_AS_INTERNAL_RUNTIME |
| `upsertShippingAllocationDraftLines` | `:2891` | `handleUpsertShippingAllocationDraftLines_` `16_shipping_allocation:223` | ✔ | shipping_allocation_draft_lines | inventory-replen | KEEP_AS_INTERNAL_RUNTIME |

### 3.3 Backend-only / dead / missing-handler actions (NO working UI path)

| Action | Router | Handler | State | Evidence | Disp |
|---|---|---|---|---|---|
| `generateRecommendationDraftLocked` | `01:249` | `handleGenerateRecommendationDraftLocked_` `24:55` (lock ✔`24:72`, fails closed) | **BACKEND_ONLY** — no transport writer, no UI, JS runtime not loaded in browser | SOURCE-PROVEN | DO_NOT_API_YET |
| `updateRecommendationDecisionLocked` | `01:255` | `handleUpdateRecommendationDecisionLocked_` `25:39` (lock ✔) | reached only **indirectly** via `upsertRequestOrderAllocationDraftLines` (`15:241`) | SOURCE-PROVEN | KEEP_AS_INTERNAL_RUNTIME |
| `submitShippingAllocationDrafts` | `01:236` | `handleSubmitShippingAllocationDrafts_` `16_shipping_allocation:324` | transport writer exists (`:2901`) but **0 UI callers** | SOURCE-PROVEN | DO_NOT_API_YET |
| `updatePurchaseOrderLine` | `01:168` | `handleUpdatePurchaseOrderLine_` `13:1701` | writer exists (`:3136`), **0 UI callers** (Edit modal writes header only) | SOURCE-PROVEN | RETIRE_AFTER_API_CUTOVER |
| `getWeeklyPlanRateCandidates` | `01:113` | **HANDLER MISSING** | transport writer exists (`:2735`, F); ReferenceError at runtime | SOURCE-PROVEN (mirror); deploy UNKNOWN | REQUIRES_MAPPING_DECISION |
| `updateShippingPlanRationale` | `01:116` | **HANDLER MISSING** | writer `:2737` (F, but no UI control) | SOURCE-PROVEN; deploy UNKNOWN | REQUIRES_MAPPING_DECISION |
| `selectShippingPlanCarrier` | `01:119` | **HANDLER MISSING** | writer `:2739`; no UI | SOURCE-PROVEN; deploy UNKNOWN | REQUIRES_MAPPING_DECISION |
| `combineShippingPlans` | `01:122` | **HANDLER MISSING** | writer `:2741`; no UI | SOURCE-PROVEN; deploy UNKNOWN | REQUIRES_MAPPING_DECISION |
| `uncombineShippingPlans` | `01:125` | **HANDLER MISSING** | writer `:2743`; no UI | SOURCE-PROVEN; deploy UNKNOWN | REQUIRES_MAPPING_DECISION |
| `runAmazonSnapshotImports` | `01:84` | `handleRunAmazonSnapshotImports_` `07:26` (lock ✔`07:178`) | no UI caller; scheduled/admin trigger | SOURCE-PROVEN | KEEP_AS_INTERNAL_RUNTIME |
| `backfillFcSpecialEventIds`/`auditFcSpecialEventIds`/`retireShipmentLabelColumns`/`seedSinotransCarrier` | `01:190/194/268/277` | present (`14_`/`12_`/`17_`) | admin/migration editor-run | SOURCE-PROVEN | DO_NOT_API_YET |

**`handleRecommendationSourcePreview_`** (`27:43`) exists but is **NOT router-registered** → editor-only/internal (SOURCE-PROVEN).

---

## 4. Coverage counts (SOURCE-PROVEN)

- Router actions: **61** (2 GET + 59 doPost). Frontend distinct write actions: **49** + 3 POST-reads + 2 GET-reads.
- **Every frontend action maps to a registered router action → 0 ROUTER_MISSING from the frontend.**
- **5 registered actions have no handler defined in the mirror → HANDLER_MISSING** (Weekly L1/L2 group). Live-deploy status UNKNOWN.
- Actions with a router+handler but **no UI caller (BACKEND_ONLY/admin/dead): ~13** (recommendation generation, submit-shipping-alloc, update-PO-line, createShipmentFromPlan-retry, runAmazonSnapshotImports, 4 admin one-offs, + the 5 missing-handler set which are also UI-less).
- Tables: 44 tabs exposed by `getOperationDb`; write handlers touch ~30 canonical tables (§3).

---

## 5. Transport / DTO risks feeding API-1 (SOURCE-PROVEN unless noted)

1. **Whole-DB read on every load + after every write** (`loadOperationDb({force:true})`) — `getOperationDb` returns all 44 tabs; every successful write triggers a full re-read. Largest latency + payload driver → Workspace-API + targeted-invalidation candidate (§Perf).
2. **No stale-response protection** (no AbortController) — scope changes can race. STALE_RESPONSE_RISK.
3. **Envelope not enforced** — `jsonResponse_` shape is per-handler; recommendation adds `stage`/`schemaValidation`. API-1 must freeze one envelope.
4. **`text/plain` POST** — deliberate CORS-preflight avoidance; API-1 should preserve or formalize.
5. **Mirror vs deploy drift** — the 5 missing handlers prove the mirror can diverge from the deployed Web App. API-1 must reconcile the mirror as the contract source or record the deploy delta. UNKNOWN which the live Web App contains.

---

*Companion documents:* `FUNCTIONAL_REACHABILITY_AUDIT.md` (page-by-page control status = Checkpoint F1) · `API_MIGRATION_MASTER_PLAN.md` (phases, vertical slices, F1–F6, Submit boundary). Documentation only; no code/DB/deploy changes implied.
