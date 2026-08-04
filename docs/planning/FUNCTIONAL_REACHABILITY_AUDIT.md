# Functional Reachability Audit — CHECKPOINT F1 Baseline (2026-08-04)

> **Round:** PHASE API-0. **READ-ONLY.** This is the **F1 Functional Gap Baseline** — the frozen record of what each active page control actually does today, so later API phases can prove no working function was lost (F2–F6).
> **Repo/HEAD:** `Operation System` @ `8dfbb3d`. **Transport:** uniform `WEB_APP_FETCH` (see `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`).
> **Method:** control-by-control inspection of `assets/html/pages/*.html` + `assets/js/pages/*.js` + the transport adapter. Every verdict is **SOURCE-PROVEN** unless marked. **No control was silently repaired** (§No-Silent-Repair).
> **Status vocabulary & severity** per the round spec (FULLY_CONNECTED / PARTIALLY_CONNECTED / FRONTEND_ONLY / BACKEND_ONLY / MOCK_OR_DEMO_ONLY / PERSISTENCE_MISSING / READBACK_MISSING / ROUTER_MISSING / HANDLER_MISSING / DTO_MISMATCH / RESPONSE_MISMATCH / BLOCKED_BY_SCHEMA_OR_DATA / INTENTIONALLY_NOT_IMPLEMENTED / UNREACHABLE / UNKNOWN_EVIDENCE_GAP; P0…P4).

---

## 0. Active page inventory (22 pages)

| # | Page | Route → section | Transport style | Connected core? |
|---|---|---|---|---|
| 1 | home | `showSection('home')` | STATIC_DEMO | no (demo/empty) |
| 2 | sku-details | `sku` | MIXED (fetch + localStorage) | **yes** |
| 3 | sku-regional-details | `sku-regional-details` | WEB_APP_FETCH | **yes** |
| 4 | sku-handbook | `sku-handbook` | read-only (DB + demo) | read-only |
| 5 | fc-summary | `fc-summary` | MIXED | **yes (builder)** / P0 false-success on legacy Edit |
| 6 | forecast | `forecast` | read dashboard + demo | read-only / stubs |
| 7 | campaign-risk | `campaign-risk` | MIXED (DB read + localStorage write) | **no (localStorage-only writes)** |
| 8 | carrier-rate-card | `carrier-rate-card` | WEB_APP_FETCH | **yes** |
| 9 | inventory-replenishment | `ops` | MIXED_TRANSPORT | **yes** |
| 10 | factory-stock | `factory-stock` | WEB_APP_FETCH | **yes** |
| 11 | overseas-stock | `overseas-stock` | WEB_APP_FETCH | **yes** |
| 12 | overseas-inbound | (disabled nav) | DIRECT_LOCAL_RUNTIME | UNREACHABLE / preview |
| 13 | overseas-outbound | (disabled nav) | DIRECT_LOCAL_RUNTIME | UNREACHABLE / preview |
| 14 | overseas-ops-preview | (engine, not routed) | STATIC_DEMO | preview engine |
| 15 | supplychain | `supplychain` | LOCAL_STORAGE_ONLY | local canvas |
| 16 | global-logistics-map | `global-logistics-map` | WEB_APP_FETCH (read) | read-only |
| 17 | shipping-plan | `shippingplan` | MIXED | **yes** |
| 18 | shipment-draft / overview | `shipment-draft` / `shippinghistory` | MIXED | **yes** |
| 19 | shipping-history | `shippinghistory` (= overview) | MIXED | read/view |
| 20 | request-order | `request-order` | MIXED | **yes** (user-qty) |
| 21 | request-order-draft | `request-order-draft` | WEB_APP_FETCH (honest empty) | **yes** |
| 22 | purchase-order-overview / list | `purchase-order-overview` / `-list` | WEB_APP_FETCH | **yes** / read-list |

---

## 1. HEADLINE FINDINGS (most severe first)

### 1.1 P0 — False-success (data silently not saved)
- **fc-summary → "Edit Base FC" → Save Changes** (`saveFcChanges`, `fc-summary.js:703`) and **"Edit Event FC" → Save Changes** (`saveEventChanges`, `:841`): both `console.log` + **`alert('Successfully saved N changes')`** with **no KM.DB write** (`:720-722`, `:858-860`); the editable grid binds to the **empty legacy mock** `fcRegularMock`/`fcEventMock` (`:11-12`). Buttons are shown in live mode (`updateActionButtons` `:481/:497`). **A user is told the forecast saved when nothing persisted.** Status: **FRONTEND_ONLY / false-success**, **P0**. (The real persistence path for the same data is the separate *builder* Save, which IS connected — so the fix is to retire these legacy Edit buttons, not add a handler. NO SILENT REPAIR performed.)

### 1.2 P1 — Persistence missing / core workflow gaps
- **campaign-risk → Add Promotion / Delete Promotions** (`submitAddPromotion` `:927`, `deletePromotionRecordsByIds` `:1068`): persist to **localStorage only** (`LOCALSTORAGE_KEY`, `:55/:955`); the existing `upsertCampaign`/`upsertCampaignSkuLines` write API is **never called**. Added promotions never become real campaigns; Delete can only remove localStorage-overlay rows, never DB campaigns. Status: **PERSISTENCE_MISSING**, **P1**. (No fake-success toast — disclosed by a modal note — so not P0.)
- **Recommendation generation (WEEKLY_SHIPPING / MONTHLY_ORDER) has no UI**: `generateRecommendationDraftLocked` is router-reachable + lock-enforced + fails-closed (`24:55`), but there is **no transport writer, no UI control, and the JS recommendation runtime is not even loaded by `index.html`** (only 5 core scripts load; `supply-planning-*.js` are referenced solely by tests). "AI Plan" buttons on inventory-replenishment (`handleReplenAiPlan` `:3241`) and request-order (`handleRequestOrderAiPlan` `:2335`) are **local recompute no-ops**. Status: **BACKEND_ONLY**, **P1-visibility** — but consistent with the accepted plan (Submit/engine deferred), so **INTENTIONALLY_NOT_IMPLEMENTED at the UI layer**, not a defect.
- **request-order → Send Request** works end-to-end (`upsertRequestOrderAllocationDraft`→`…Lines`→`createRequestOrderDraft`→`submitRequestOrderAllocationDrafts`) but persists **user `order_qty` only; `recommended_qty` deliberately not sent** ("Engine B not implemented", `:2290`). FULLY_CONNECTED for the manual path; the recommendation-seeded path is absent by design.

### 1.3 HANDLER_MISSING (mirror) — Weekly Plan L1/L2
- `getWeeklyPlanRateCandidates` / `updateShippingPlanRationale` / `selectShippingPlanCarrier` / `combineShippingPlans` / `uncombineShippingPlans`: **wired in `doPost` but no handler function defined in any `.gs`** (grep = 0 definitions); transport writers exist (`api.js:2735-2743`) but **no UI control invokes them**. In the mirror, a call returns `{success:false,error:'…is not defined'}`. **Double gap (handler + UI).** Live-deploy status **UNKNOWN**. Severity **P2** (feature not offered in UI, so no user hits it today).

---

## 2. Page-by-page function matrix (F1)

Each row: control → status / severity / evidence (file:line) / gap. Uniform "view/filter/DOM-only" controls are summarized once per page.

### Page 2 — sku-details — **connected**
| Function | Status | Sev | Evidence / gap |
|---|---|---|---|
| Add / Edit SKU (Save) | FULLY_CONNECTED | — | `upsertSkuDetail` `js:1050` + readback |
| Row status change | FULLY_CONNECTED | — | `updateSkuLifecycle` `:209`; guarded localStorage fallback `:219` |
| Tax rate Save | FULLY_CONNECTED | — | `upsertTaxReferralRate` `:1315` |
| Import Template | PERSISTENCE_MISSING | P2 | validate/preview only; alert "write-back: next phase" `:259` (labeled) |
| Export template / Refresh DB | FULLY_CONNECTED | — | client CSV / `loadOperationDb` |
| Tax component editor / Supplier block | INTENTIONALLY_NOT_IMPLEMENTED | P3/P4 | read-only / "not implemented yet" `:895` |
| Filters, CM-KG, columns | FRONTEND_ONLY (view) | — | correct |

### Page 3 — sku-regional-details — **connected**
Add/Edit Regional (Save) → `upsertSkuRegionalDetail` `:491` + readback = FULLY_CONNECTED. Tax link delegates to sku-details. Filters/paging = FRONTEND_ONLY. No gaps.

### Page 4 — sku-handbook — read-only viewer
Lang toggle, card modal, filters, search = FRONTEND_ONLY (correct). No write controls; no gap.

### Page 5 — fc-summary — **connected builder + P0 legacy false-success**
| Function | Status | Sev | Evidence |
|---|---|---|---|
| New FC Update → Regular builder Save | FULLY_CONNECTED | — | `importFcRegularForecastBatch` `:3084` |
| New FC Update → Event builder Save | FULLY_CONNECTED | — | `upsertCampaign`+`upsertCampaignSkuLines`+`upsertFcSpecialEvent` `:3007`; aborts if writers missing `:2976` |
| Import Forecast | FULLY_CONNECTED | — | `importFcRegularForecastBatch` `:3627` |
| Add / Delete Target Rule | FULLY_CONNECTED | — | `upsertFcTargetRule` `:1040` / `deleteFcTargetRule` `:1140` |
| **Edit Base FC → Save Changes** | **FRONTEND_ONLY / false-success** | **P0** | `saveFcChanges` `:703` log-only + hardcoded success alert `:720`; edits empty mock |
| **Edit Event FC → Save Changes** | **FRONTEND_ONLY / false-success** | **P0** | `saveEventChanges` `:841` same |
| Add-SKU modal (`saveNewSku`) | UNREACHABLE (dead) + FRONTEND_ONLY | P3 | `openAddSkuModal` has no caller; in-memory only |
| Inline cell edits | FRONTEND_ONLY | — | in-memory mock |

### Page 6 — forecast — read dashboard + stubs
| Function | Status | Sev | Evidence |
|---|---|---|---|
| Edit Target FC / FC Update (row) | INTENTIONALLY_NOT_IMPLEMENTED (false control) | P2 | `alert('… not implemented yet')` `:1702/:1706` |
| Send Request (T1/T2/T3) | FRONTEND_ONLY (false control) | P2 | `alert('mock only, no real submit')` `:1699` |
| Forecast Accuracy card (95/92/88%) | MOCK_OR_DEMO_ONLY | P3 | hardcoded literals `:1056` ("mock data for now" `:1044`) |
| Cumulative Goal ($5M) | MOCK_OR_DEMO_ONLY | P3 | demo-only `:1062`; else `—` |
| Filters, chart toggles | FRONTEND_ONLY (view) | — | correct |

### Page 7 — campaign-risk — **localStorage-only writes**
| Function | Status | Sev | Evidence |
|---|---|---|---|
| Add Promotion (modal) | PERSISTENCE_MISSING / FRONTEND_ONLY | **P1** | localStorage `:955`; never calls `upsertCampaign` |
| Delete Promotions | PERSISTENCE_MISSING / FRONTEND_ONLY | **P1** | localStorage `:652`; cannot delete DB campaigns |
| Scope selects, rails, paging | FRONTEND_ONLY (view) | — | correct; buttons gated until scope resolves |
| Table data | read-only (DB campaigns) | — | `getCampaigns` `:100` |

### Page 8 — carrier-rate-card — **connected**
Update/Master import → `importCarrierRateCards` `:905` + readback = FULLY_CONNECTED. Download templates = client XLSX. Search/filters = FRONTEND_ONLY. No gaps.

### Page 9 — inventory-replenishment — **connected (compute + persist)**
| Function | Status | Sev | Evidence |
|---|---|---|---|
| Submit Plan | FULLY_CONNECTED (→ sessionStorage in mock mode) | P2 (mock) | `createShippingPlansBatch` `:1936`; fallback `:1959` |
| Route edits auto-save draft | FULLY_CONNECTED | — | `upsertShippingAllocationDraft(+Lines)` `:2114/2157` |
| Add SKU / Add Marketplace / Edit SKU | FULLY_CONNECTED | — | `importMarketplaceSkusBatch` / `upsertMarketplace` / `updateMarketplaceSkuModel` |
| Import SKU + template | FULLY_CONNECTED | — | `importMarketplaceSkusBatch` |
| Delete SKU | INTENTIONALLY_NOT_IMPLEMENTED | P3 | stub `alert('not enabled yet')` `:3673` |
| AI Plan | FRONTEND_ONLY (recompute) | P4 | `renderReplenishment()` only `:3241` |
| Submit allocation draft to snapshot | UI-MISSING | P2 | `submitShippingAllocationDrafts` has 0 UI callers |

### Page 10 — factory-stock — **connected**
Inventory Adjustment → Confirm → `adjustFactoryInventory` `:1055` (lock backend) + readback = FULLY_CONNECTED. Tabs/search/filters = FRONTEND_ONLY. No gaps.

### Page 11 — overseas-stock — **connected**
Import → `importOverseasInventorySnapshotBatch` `:712`; Adjust → `adjustOverseasInventory` `:923` (lock) + readback = FULLY_CONNECTED. No gaps.

### Pages 12–14 — overseas-inbound / outbound / ops-preview — **preview, UNREACHABLE**
All lifecycle/create/qty controls = **INTENTIONALLY_NOT_IMPLEMENTED** (in-memory session `OO._sessions`, honestly badged "Preview — no `overseas_inventory_movements` posted" `overseas-ops-preview.js:456`), **P4**. Inbound/Outbound are **UNREACHABLE via nav** (disabled menu + `app.js:53-55` guard). Refresh/read = FULLY_CONNECTED (read). No false connections.

### Page 15 — supplychain — local canvas
All toolbar/edit controls = **FRONTEND_ONLY / LOCAL_STORAGE_ONLY** (`localStorage['supplychain-canvas']` `:1525`), **P3**. No backend by design; no false "server saved" claim. (If a shared diagram was intended → PERSISTENCE_MISSING backend, but nothing claims it.)

### Page 16 — global-logistics-map — read-only
Refresh/retry/select = FULLY_CONNECTED (read); zoom/filters = FRONTEND_ONLY; honest "FALLBACK data (not production)" badge on API failure `:263`. No write controls. No gaps.

### Page 17 — shipping-plan (Weekly) — **connected**
| Function | Status | Sev | Evidence |
|---|---|---|---|
| Save qty / Submit / Approve(+auto shipment) / Reject / Cancel / Done / Note | FULLY_CONNECTED | P1–P3 | `updateShippingPlanLineQty`/`updateShippingPlanStatus`/`completeShippingPlan`/`appendShippingPlanNote` `js:934-1015` + readback |
| Demo-mode Submit/Approve/… | FRONTEND_ONLY (sessionStorage, by design) | P3 | `:413-503` |
| Carrier rationale / carrier select / combine / uncombine | HANDLER_MISSING + UI-MISSING | P2 | writers `api:2737-2743`; no control; handlers absent |

### Page 18/19 — shipment-draft / overview / history — **connected**
Save / Ready-to-Ship / Ship / Return-to-Draft / Done / Advance = FULLY_CONNECTED (`updateShipment`). **Confirm & Dispatch** → `confirmShipmentAndDispatch` `:1352` inspects `res.success`/`stage` (no fake success), **P0-safe**. Overview mock cards = MOCK_OR_DEMO_ONLY fallback (P3). No create control (Approve auto-creates; `createShipmentFromPlan` retry = 0 callers, P2).

### Page 20 — request-order — **connected (manual)**
Send Request → 4-step (`upsertRequestOrderAllocationDraft`→`…Lines`→`createRequestOrderDraft`→`submitRequestOrderAllocationDrafts`) = FULLY_CONNECTED, **user-qty only** (`recommended_qty` not sent, `:2290`). Confirm Site → `upsertRequestOrderSiteConfirmations` (does not create request_orders, by spec). AI Plan → recompute no-op (P3). Demo Send = in-memory, disclosed.

### Page 21 — request-order-draft — **connected**
New Manual Draft → `createRequestOrderDraft`; Save/Submit → `updateRequestOrderLineQty`+`updateRequestOrderStatus`; Approve/Reject/Cancel/Done/Cancel-Tier/Note → connected; **Convert to PO → `createPurchaseOrderFromRequest`** = FULLY_CONNECTED. Honest empty state when DB off. No gaps.

### Page 22 — purchase-order-overview / list — **connected / read**
Overview: Receive → `receivePurchaseOrderLines`; Save → `updatePurchaseOrderHeader`; Send PO/Cancel → `updatePurchaseOrderStatus` = FULLY_CONNECTED. Gaps: **`updatePurchaseOrderLine` (edit line qty/cost) 0 callers** (P2); PO transitions `confirm/start_production/ready_to_ship/complete` not exposed (P2). List = read-only (correct).

### Page 1 — home — STATIC_DEMO
Add Todo → localStorage write but render overridden to demo/empty → **effectively dead** (P3). Cards = MOCK_OR_DEMO_ONLY (empty when demo off), P4.

---

## 3. Aggregate counts (F1 baseline)

- **FULLY_CONNECTED** control groups: **~38** (SKU ×5, FC builder+target ×6, carrier ×2, inventory ×6, factory ×1, overseas-stock ×2, shipping-plan ×7, shipment ×7, request-order ×3, request-order-draft ×9, PO ×4, plus reads).
- **PARTIALLY_CONNECTED / degrade-to-local:** Submit Plan (mock→sessionStorage), sku-details status (localStorage fallback).
- **FRONTEND_ONLY (no persist):** fc Edit-FC ×2 (P0 false-success), forecast Send Request, AI-Plan ×2, home Add-Todo, supplychain canvas.
- **BACKEND_ONLY (no UI):** recommendation generation, `updateRecommendationDecisionLocked` (indirect), `submitShippingAllocationDrafts`, `updatePurchaseOrderLine`, `createShipmentFromPlan`-retry, `runAmazonSnapshotImports`, 4 admin one-offs.
- **HANDLER_MISSING (mirror):** 5 Weekly L1/L2 actions.
- **MOCK_OR_DEMO_ONLY:** home cards, forecast Accuracy/Goal, shipment overview fallback, campaign-risk overlay.
- **PERSISTENCE_MISSING:** campaign-risk Add/Delete (P1), sku-details Import (P2, labeled).
- **INTENTIONALLY_NOT_IMPLEMENTED:** overseas in/out previews, Delete SKU, tax-component editor, forecast row stubs, recommendation Submit boundary.
- **UNREACHABLE:** overseas-inbound/outbound (nav-disabled), fc Add-SKU modal (dead).
- **ROUTER_MISSING:** **0** (every frontend action is registered).
- **DTO_MISMATCH / RESPONSE_MISMATCH:** **0 observed** (envelope uniform `{success,data,error}`; `confirmShipmentAndDispatch` handled structurally). UNKNOWN vs live deploy.
- **P0:** 2 (fc-summary Edit-FC/Edit-Event false-success). **P1:** campaign-risk ×2, recommendation-UI-absence (deferred), request-order recommended_qty-absence (deferred). **P2/P3/P4:** as tabled.

## 4. Severity ledger
- **P0 (destructive/false-success):** fc-summary `saveFcChanges`, `saveEventChanges` — hardcoded "Successfully saved" with no persist. Disposition: **retire the legacy Edit buttons** (builder path already persists); do not add a fake handler. No live destructive-delete false-success found (Confirm&Dispatch, cancels, receive are all honest + readback).
- **P1:** campaign-risk localStorage-only writes (route to `upsertCampaign*`); recommendation generation UI absent (deferred by plan); request-order `recommended_qty` absent (Engine B deferred).
- **P2:** Weekly L1/L2 (handler+UI missing); `submitShippingAllocationDrafts` UI; `updatePurchaseOrderLine` + PO advanced transitions; sku Import write-back; forecast row stubs; Submit-Plan mock degradation.
- **P3/P4:** home Add-Todo dead; forecast KPI demo; supplychain localStorage; previews; tax component; dead fc Add-SKU modal.

## 5. Evidence gaps (UNKNOWN)
- The Apps Script **live deployment** is not in-repo; whether the deployed Web App defines the 5 missing handlers, and whether every handler's live DTO/response matches the frontend, is **UNKNOWN** (SOURCE-PROVEN only for the mirror).
- Whole-page micro-handlers (sort/paginate) were sampled, not exhaustively read; none observed touch a write API (view-state only).

---

*This is CHECKPOINT F1.* Companion: `API_CURRENT_TRANSPORT_ACTION_INVENTORY.md`, `API_MIGRATION_MASTER_PLAN.md`. No control was modified or repaired; all gaps are recorded as future tasks. Golden 39/1/0; Scenario #34 Pending.
