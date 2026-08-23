# Two Main Flows — End-to-End Connectivity Audit (F1-7N-FA-4A-P0)

**Strictly READ-ONLY.** No code changed, no live write, no Submit/Shipment/PO/document/deduction/migration. Classifications are **source/spec/schema-derived**, not live-verified (no live run was performed). All citations are `file:line` in `assets/`.

> **Start-condition note (factual).** The referenced K2 controlled-scope remediation is **PREPARED / STAGED OFF**, not executed: the R6F2G/R6F2G1 migration confirmation constant is a placeholder, COMMIT refuses, and `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false`. So `FROZEN_SCOPE_VALIDATED` and K2 REUSE 0/0 are **contract-proven in tests, not yet live-confirmed**. This audit is read-only and independent of that migration, so it proceeds; the K2 state is recorded here as an input fact.

## 0. Transport & routing model (shared)
Single-endpoint dispatch: every write is `POST {action, ...payload}` to `OP_DB_API_BASE_URL` ([operation-system-db-api.js:6](../../assets/js/api/operation-system-db-api.js#L6)); the Apps Script [01_router.gs](../../assets/specs/active/apps-script/01_router.gs) is a linear `if (action===…)` chain (per-action, not REST). There is **no `google.script.run`** — a static SPA over `/exec`, so "APPS_SCRIPT_DIRECT" never occurs; canonical writes = the `{action}` POST. `*_api_v1_*` files (40_–62_) are scoped **READ** owners; writes live in the lower-numbered direct handlers (11_–37_).

---

## 1. FLOW A connectivity matrix — Inventory → Shipment

| # | Node | Frontend fn | API action → backend | Tables W/R | Src→Tgt status | Classification |
|---|---|---|---|---|---|---|
| 1 | Inventory/factory/overseas/GAP facts | inventory-replenishment.js render | reads (`getOperationDb`/GAP) | R: warehouses, overseas/amazon snapshots, factory_stock, GAP job | — | CONNECTED_AND_VERIFIED |
| 2 | Inventory **AI Plan** | `handleReplenAiPlan` [inventory-replenishment.js:4380](../../assets/js/pages/inventory-replenishment.js#L4380) | default in-browser `KMREC.generateInventoryRecommendation`; DB path `weeklyAiPlan.generate`→`handleGenerateWeeklyAiPlanDraft_` (61_) gated OFF | none (default) / atomic K2 (gated) | — | **LOCAL_BROWSER_ONLY** (default); CONNECTED_NOT_LIVE_VERIFIED behind flag=false |
| 3 | `shipping_allocation_drafts` | `_saveAllocationDraftFromDom` [inventory-replenishment.js:2808](../../assets/js/pages/inventory-replenishment.js#L2808) | `upsertShippingAllocationDraft`→`handleUpsertShippingAllocationDraft_` (16_) | W: drafts | draft | CONNECTED_AND_VERIFIED |
| 4 | `shipping_allocation_draft_lines` | same (`upsertShippingAllocationDraftLines`) | `handleUpsertShippingAllocationDraftLines_` (16_) | W: draft_lines | — | CONNECTED_AND_VERIFIED |
| 5 | **Submit Allocation Draft** | — (no UI caller) | `submitShippingAllocationDrafts`→`handleSubmitShippingAllocationDrafts_` [16_:806](../../assets/specs/active/apps-script/16_shipping_allocation_handlers.gs#L806) | W: drafts (status only) | draft→submitted | **STATUS_TRANSITION_MISSING** — marks submitted only; **does NOT create shipping_plans** (explicit HALT 16_:827-833); adapter has **no UI caller** |
| 6 | Weekly Shipping Plan UI | shipping-plan.js (`renderShippingPlanFromDb`) | reads | R: shipping_plans/_lines | — | CONNECTED (live DB path); legacy sessionStorage path = LEGACY_COMPATIBILITY_ONLY |
| 7 | `shipping_plans` | `submitReplenishmentPlans` [inventory-replenishment.js:2129](../../assets/js/pages/inventory-replenishment.js#L2129) | `createShippingPlansBatch`→`handleCreateShippingPlansBatch_` (11_) | W: shipping_plans/_lines | →draft | **PARTIALLY_CONNECTED** — plans are created **directly from the inventory page batch**, bypassing node 5; the Allocation-Draft→Plan boundary is not the submit path |
| 8 | `shipping_plan_lines` | same batch | same | W: plan_lines | — | CONNECTED_AND_VERIFIED |
| 9 | Plan review/approve/reject/return | `spDbApprove/Reject/Cancel/Done` [shipping-plan.js:1159](../../assets/js/pages/shipping-plan.js#L1159) | `updateShippingPlanStatus{submit\|approve\|reject\|cancel}` / `completeShippingPlan` (11_:678) | W: shipping_plans | draft↔pending_approval→approved/rejected/cancelled/completed | CONNECTED_AND_VERIFIED |
| 10 | Shipment Draft | (side-effect of Approve) `spDbApprove` success reads `res.data.shipment` | `createShipmentFromApprovedPlan_` [12_:314](../../assets/specs/active/apps-script/12_shipment_handlers.gs#L314) auto-called in approve | W: shipments/_lines; marks plan.transferred_* | approved plan→shipment draft | CONNECTED_NOT_LIVE_VERIFIED (explicit `createShipmentFromPlan` retry adapter = UNIMPLEMENTED_STUB, no UI) |
| 11 | `shipments` | `shSaveExecution/shReadyToShip/shShip` [shipping-history.js:1313](../../assets/js/pages/shipping-history.js#L1313) | `updateShipment` (12_) | W: shipments (exec fields) | draft→ready_to_ship→shipped | CONNECTED_AND_VERIFIED |
| 12 | `shipment_lines` | (from plan snapshot) | `createShipmentFromApprovedPlan_` | W: shipment_lines | — | CONNECTED_AND_VERIFIED |
| 13 | Carrier / route authority | read-only "Carrier (from plan)" [shipping-history.js:1127](../../assets/js/pages/shipping-history.js#L1127); KMRA eligibility | `getShippingMethodCandidates` (read) implemented; **`selectShippingPlanCarrier`/`getWeeklyPlanRateCandidates`/`updateShippingPlanRationale`/`combineShippingPlans`/`uncombineShippingPlans` REMOVED from router (01_:277-285)** but still exposed in db-api | — | **API_ROUTE_DIVERGED / BLOCKED_BY_MISSING_AUTHORITY** — no wired persistence of a chosen carrier/rate onto shipping_plans |
| 14 | Route/event creation | `shConfirmShipment`→`_shRunConfirm` [shipping-history.js:1507](../../assets/js/pages/shipping-history.js#L1507) | `confirmShipmentAndDispatch`→`handleConfirmShipmentAndDispatch_` [22_:35](../../assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs#L35) | W: shipment_routes (snapshot/node), shipment_events (`departed_origin`) | — | CONNECTED_NOT_LIVE_VERIFIED |
| 15 | Factory stock reservation/deduction | (dispatch) | `handleConfirmShipmentAndDispatch_` 22_:162-177 | W: factory_stock.current_stock −=, factory_stock_movements `shipment_out` | draft→in_transit | CONNECTED_NOT_LIVE_VERIFIED; **reservation node = NOT_IMPLEMENTED** (see §7) |
| 16 | PO/source-line allocation & deduction | `_shRunConfirm` step `generateShipmentLineAllocations` then dispatch | `generateShipmentLineAllocations`→32_ (draft FIFO); `slaApplyExecution_` [32_:373](../../assets/specs/active/apps-script/32_shipment_line_allocation_handlers.gs#L373) at dispatch | W: shipment_line_allocations; SET purchase_order_lines.shipped_qty/remaining_qty | draft→executed | CONNECTED_NOT_LIVE_VERIFIED |
| 17 | Confirm Shipment / Shipped | `shConfirmShipment` | `confirmShipmentAndDispatch` (ScriptLock, rollback stack) | W: shipments status | draft→in_transit | CONNECTED_NOT_LIVE_VERIFIED |
| 18 | Document generation | `shGenerateShipmentDoc` [shipping-history.js:1401](../../assets/js/pages/shipping-history.js#L1401) | `shipmentDocument.generate`→`handleShipmentDocumentGenerate_` (36_) | W: generated_documents + Drive file | — | CONNECTED_NOT_LIVE_VERIFIED (SHIPDETAIL+PL only; CI/Customs/Booking = NOT_IMPLEMENTED) |
| 19 | Document download | `shOpenShipmentDoc` [shipping-history.js:1431](../../assets/js/pages/shipping-history.js#L1431) | opens Drive `download_url`/`pdf_file_url` via `window.open` | — | **LOCAL_BROWSER_ONLY** (Drive URL; no expiry/missing-file check) |
| 20 | Shipment Overview | `renderShipmentOverview` (shipping-history.js) | scoped `shipment.workspace.get` (57_); reads **persisted `shipments.status`** | R: shipments | — | CONNECTED_AND_VERIFIED (status snapshot, not events) |
| 21 | On-the-Way Map | global-logistics-map.js | `shipment.workspace.get {routes,events}` — reads **canonical `shipment_events`+`shipment_routes`** | R: events/routes | — | CONNECTED_AND_VERIFIED |
| 22 | Subsequent event/status updates | GLM handlers [global-logistics-map.js:852](../../assets/js/pages/global-logistics-map.js#L852) | `shipment.receipt.update` / `shipment.eta.update` / `shipment.route.advance` (31_) | W: shipment_lines/shipments/routes/events | forward-only | CONNECTED_NOT_LIVE_VERIFIED |
| 23 | Delivered/received posting + reversal | receipt handler | `handleUpdateShipmentReceipt_` [31_:268](../../assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs#L268) | W: shipment_lines.shipment_received_qty (monotonic), overseas snapshot/movements | →partially_received/received | **REVERSAL_MISSING** — monotonic, `RECEIPT_BACKWARD` fail-closed; no cancel/reverse handler exists |

---

## 2. FLOW B connectivity matrix — Ordering → Purchase Order

Cutover: `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true` (permanent, [00_config.gs:37](../../assets/specs/active/apps-script/00_config.gs#L37)).

| # | Node | Frontend fn | API action → backend | Tables W/R | Classification |
|---|---|---|---|---|---|
| 1 | Order planning / GAP / recommendation | forecast/request-order pages | MONTHLY_ORDER flat via `KMRDV2P.generateMonthlyFlat` ([24_:199](../../assets/specs/active/apps-script/24_recommendation_orchestrator.gs#L199)) | W: request_order_allocation_drafts (53-col flat) | CONNECTED_AND_VERIFIED |
| 2 | Request Order Draft (Flat V2) | request-order.js render/edit + autosave | `upsertRequestOrderAllocationDraft(Lines)`→15_ | W: flat draft row (tier order_qty) | CONNECTED_AND_VERIFIED |
| 3 | Flat header/line authority | KMRDV2 `V2_HEADERS` (53 cols) [supply-planning-request-draft-v2.js:39](../../assets/js/core/supply-planning-request-draft-v2.js#L39) | — | PK `request_allocation_draft_id` deterministic | CONNECTED_AND_VERIFIED |
| 4 | Allocation/source authority | client `explodeSendRequestLinesFromDto` exists but **not on the live Send path** | — | — | **PARTIALLY_CONNECTED** — Send builds lines from `_roSendOrderQty_`, not the eligible-tier explode helper |
| 5 | **Submit Request Order Draft (Send)** | `handleSendRequest` [request-order.js:3187](../../assets/js/pages/request-order.js#L3187) | `createRequestOrderDraft`→`handleCreateRequestOrderDraft_`→`roCreateRequestOrderCore_` [13_:733](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L733) | W: request_orders + request_order_lines + request_order_line_sources | CONNECTED_AND_VERIFIED (backend idempotent) — but **backend TRUSTS frontend lines; does not re-read Flat V2** (see §J) |
| 6 | Purchase Order Workspace | `convertToPo` [request-order-draft.js:842](../../assets/js/pages/request-order-draft.js#L842) | `createPurchaseOrderFromRequest`→`handleCreatePurchaseOrderFromRequest_` [13_:1543](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1543) | W: purchase_orders + purchase_order_lines | CONNECTED_AND_VERIFIED |
| 7 | Review/edit/approve | PO workspace pages | `updatePurchaseOrderStatus/Line/Header` (13_) | W: purchase_orders/_lines | CONNECTED_AND_VERIFIED |
| 8 | `purchase_orders` | — | 13_ | 48-col; status `order_status` | CONNECTED_AND_VERIFIED |
| 9 | `purchase_order_lines` | — | 13_ | 37-col | CONNECTED_AND_VERIFIED |
| 10 | PO number issuance | — | `handleUpdatePurchaseOrderStatus_` `issue` [13_:1971](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1971) | `po_no` minted at create; issue sets order_date + deposit_due | CONNECTED_AND_VERIFIED |
| 11 | Purchase Order List | purchase-order-list.js | `handlePurchaseOrderWorkspaceGet_` [50_:276](../../assets/specs/active/apps-script/50_api_v1_purchase_order_workspace.gs#L276) | R: purchase_orders/_lines | CONNECTED_AND_VERIFIED |
| 12 | Production/shipped/received updates | PO pages | `updatePurchaseOrderStatus`; `receivePurchaseOrderLines` [13_:2255](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L2255) | W: purchase_order_lines, factory_stock(+recv), factory_stock_movements `po_receipt` | CONNECTED_AND_VERIFIED |
| 13 | `factory_stock` / `factory_stock_movements` | — | written on **receive** (not issue); dispatch `shipment_out` | see §D | CONNECTED_AND_VERIFIED |
| 14 | Cancellation/correction/reversal | PO cancel = soft (pre-dispatch) | `updatePurchaseOrderStatus{cancel}` | soft; no stock movement | PARTIALLY_CONNECTED — post-receive reversal = REVERSAL_MISSING |
| 15 | PO/order lines as shipment allocation sources | (Flow A node 16) | `slaApplyExecution_` consumes purchase_order_lines | W: purchase_order_lines.shipped_qty | CONNECTED_NOT_LIVE_VERIFIED |

---

## 3. DB authority matrix

| Table | Schema const : cols | PK | FK(s) | Natural/idempotency key | Status authority | Writers | Readers | 02_core switch? |
|---|---|---|---|---|---|---|---|---|
| shipping_allocation_drafts | `SHIPPING_ALLOCATION_DRAFTS_HEADERS_`:30 | allocation_draft_id | scope cols; calculation_run_id | K3 scope; K2 `SADH-K2-` | `status` {draft,site_confirmed,submitted,cancelled} | 16_ upsert/atomic/submit/cancel | 16_ resolvers/workspace | **no** (default) |
| shipping_allocation_draft_lines | `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_`:30 | allocation_draft_line_id | allocation_draft_id | `SADL-`/`SADL-K2-` | `line_status` | 16_ keyed/atomic | 16_ | **no** |
| shipping_plans | `SHIPPING_PLANS_HEADERS_`:49 | shipping_plan_id | parent_shipping_plan_id, transferred_shipment_id, carrier_id | submit_batch_id + payload fingerprint | `status` draft→pending_approval→approved/rejected/cancelled/completed | 11_ | 11_,12_ | yes (193) |
| shipping_plan_lines | `SHIPPING_PLAN_LINES_HEADERS_`:30 | shipping_plan_line_id | shipping_plan_id | — | — | 11_ | 11_,12_ | yes (198) |
| shipments | `SHIPMENTS_HEADERS_`:63 | shipment_id | shipping_plan_id, carrier_id, rate_card_id | dedupe on shipping_plan_id | `status` draft→in_transit→(partially_)received | 12_,22_,31_ | 12_/22_/31_/57_ | yes (205) |
| shipment_lines | `SHIPMENT_LINES_HEADERS_`:27 | shipment_line_id | shipment_id, purchase_order_line_id, shipping_plan_line_id | — | (none; received_qty cumulative) | 12_,31_ | 22_,31_,32_ | yes (210) |
| **shipment_events** | `EVENT_HEADERS`/`SHIP_EVENT_HEADERS_`:20 | shipment_event_id | shipment_id, shipment_route_id | `source_event_id` (`confirm:`/`route:`/`receipt-`) | `event_status` | 22_,31_ | 57_/GLM | no |
| **shipment_routes** | `ROUTE_HEADERS`:24 | shipment_route_id | shipment_id, route_template_id, route_template_node_id | one-row-per-node | node `status` {completed,current,planned} | 22_,31_ | 57_/GLM | no |
| **shipment_line_allocations** | `SHIPMENT_LINE_ALLOCATIONS_HEADERS_`:14 | shipment_line_allocation_id | shipment_line_id, purchase_order_line_id | delete-then-append draft set | `allocation_status` {draft,executed,**reversed=unused**} | 32_ | 32_ | no |
| request_order_allocation_drafts (Flat V2) | `KMRDV2.V2_HEADERS`:53 | request_allocation_draft_id (deterministic) | lineage→request_order_line_sources | optimistic {draft_version,userEditFingerprint} | tier `tN_status` | persistence.js/15_ | 15_,request-order.js | (name not in switch) |
| request_order_allocation_draft_lines (LEGACY) | `REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_`:33 | request_allocation_line_id | request_allocation_draft_id | — | — | dormant (manual path only) | KMPR MONTHLY_ORDER | — |
| request_orders | `REQUEST_ORDERS_HEADERS_`:35 | request_order_id | — | `source_ref_id`=ROEXEC key | `request_status` | 13_ roCreate | 13_,51_ | yes |
| request_order_lines | `REQUEST_ORDER_LINES_HEADERS_`:30 | request_order_line_id | request_order_id, purchase_order_line_id | — | — | 13_ | 13_,51_ | yes |
| request_order_line_sources | `REQUEST_ORDER_LINE_SOURCES_HEADERS_`:27 | request_order_line_source_id | request_order_line_id, request_order_id, request_allocation_draft_id | — | — | 13_ | 51_ | — |
| purchase_orders | `PURCHASE_ORDERS_HEADERS_`:48 | purchase_order_id | request_order_id | conversion lineage (poFindConversionState_) | `order_status` draft→issued→confirmed→in_production→ready_to_ship→complete/cancel | 13_ | 13_,50_ | yes |
| purchase_order_lines | `PURCHASE_ORDER_LINES_HEADERS_`:37 | purchase_order_line_id | purchase_order_id, request_order_line_id | — | — | 13_,32_,receive | 13_,32_,50_ | yes |
| factory_stock | (column-presence; no const) | factory_stock_id (`FS-wh-sku`) | warehouse_id+sku | wh+sku identity | (balance cols) | 21_,22_,13_ receive | 21_,22_,32_ | — |
| factory_stock_movements | `MOV_HEADERS`:15 | factory_stock_movement_id | related_entity_type+id | ledger ref | movement_type | 21_,22_,13_ | ledger | — |
| document_templates | `DOCUMENT_TEMPLATES_HEADERS_`:30 | template_id | (root) | scope dims (8) | `status`/`is_active`/effective window | 36_ | 36_ | — |
| document_template_fields | `DOCUMENT_TEMPLATE_FIELDS_HEADERS_`:23 | field_id | template_id | — | — | 36_ | 36_ | — |
| generated_documents | `GENERATED_DOCUMENTS_HEADERS_`:30 | document_id (`GDOC-`) | template_id, related_entity_id→shipment_id, regenerated_from_document_id | key = related_entity_id\|type\|template_id\|template_version | `status` {generated,regenerated} | 36_/37_ | 36_ | — |

**Storage authority (documents):** the binary lives in **Google Drive**, never the DB/bytes. `generated_documents` stores Drive identifiers/URLs: `file_id`/`file_url` (editable Google-Sheet copy) + `pdf_file_id`/`pdf_file_url` (exported PDF) + `output_folder_id`. Fill/export via `dfoDefaultIo_` ([37_:149](../../assets/specs/active/apps-script/37_shipment_document_file_renderer.gs#L149)). **HS/country/currency/declared-value authority = `tax_referral_rates`**, frozen into the R2B snapshot `shipment_final_output_lines` at finalize ([34_:126](../../assets/specs/active/apps-script/34_shipment_final_output_handlers.gs#L126)); the renderer reads the snapshot only.

---

## 4. Button / API matrix — divergence findings
- **API_ROUTE_DIVERGED (latent):** 5 Weekly-Plan carrier/rationale/combine actions — `getWeeklyPlanRateCandidates`, `updateShippingPlanRationale`, `selectShippingPlanCarrier`, `combineShippingPlans`, `uncombineShippingPlans` — were **removed from the router** ([01_:277-285](../../assets/specs/active/apps-script/01_router.gs#L277)) but **still exposed** in db-api (`3491-3501`). Any call now hits the `Invalid POST action` default. No page currently wires them → latent, not live.
- **UNIMPLEMENTED_STUB (wired adapter, no UI caller):** `submitShippingAllocationDrafts` (3645), `createShipmentFromPlan` (3506), `upsertShippingAllocationDraftAtomic` (routed 16_:455, no db-api export).
- **LEGACY_COMPATIBILITY_ONLY:** shipping-plan.js sessionStorage path (`submitToPending`/`approvePlan`/…); inventory `createShippingPlansBatch` sessionStorage fallback when cloud-write disabled.

## 5. Status-transition matrix
| Boundary | Handler | Source→Target | Lock | Idempotency | Reversal |
|---|---|---|---|---|---|
| Allocation Draft submit | `handleSubmitShippingAllocationDrafts_` | draft→submitted | none | none | cancel (soft, ScriptLock) |
| Plan lifecycle | `handleUpdateShippingPlanStatus_` | draft↔pending→approved/rejected/cancelled | none | version bump on resubmit | reject→draft; cancel(soft) |
| Plan→Shipment Draft | `createShipmentFromApprovedPlan_` | approved→shipment draft | none | 1/plan (`already_exists`) | none |
| Shipment dispatch | `handleConfirmShipmentAndDispatch_` | draft→in_transit | **ScriptLock+rollback** | status/existence + `source_event_id` | in-txn rollback only; **no post-commit reverse** |
| Receipt | `handleUpdateShipmentReceipt_` | →(partially_)received | ScriptLock | monotonic ledger ref | **none (RECEIPT_BACKWARD)** |
| RO Send | `handleCreateRequestOrderDraft_` | →request_orders | **ScriptLock** | `ROEXEC-sha256` reuse | compensating delete on error |
| RO→PO | `handleCreatePurchaseOrderFromRequest_` | approved RO→PO draft | **ScriptLock** | conversion-state lineage | soft cancel (pre-receive) |
| PO issue | `handleUpdatePurchaseOrderStatus_ issue` | draft→issued | — | prev-status guard | cancel(soft) |
| PO receive | `handleReceivePurchaseOrderLines_` | +completed_qty,+factory_stock | ScriptLock+LIFO journal | delta | **none** |

## 6. Missing-FK / idempotency / reversal findings
- **REVERSAL_MISSING (systemic):** no post-commit reversal for (a) dispatched shipment → factory deduction + PO `shipped_qty`, (b) shipment receipt (monotonic), (c) PO receive → factory_stock. `shipment_line_allocations.released_*` + `allocation_status='reversed'` are declared but **unimplemented**.
- **IDEMPOTENCY_MISSING (frontend):** RO **Send has no single-flight** — button never disabled, no shared in-flight promise ([request-order.js:3187](../../assets/js/pages/request-order.js#L3187)); double-click protection is backend-key only.
- **STATUS_TRANSITION_MISSING:** Allocation-Draft submit does not create shipping_plans (node 5); the wired handoff is `createShippingPlansBatch` from the inventory page (node 7), so the two are disjoint.
- **FK note:** shipment_lines correctly FK `purchase_order_line_id` + `shipping_plan_line_id` (1:1 receiver lineage) — present, not missing.

## 7. Exact disconnected / at-risk nodes
1. **Factory stock RESERVATION = NOT_IMPLEMENTED** → **over-commit risk**: `reserved_stock`/`fac_reserved_stock` is initialized to 0 and never written; nothing reserves between plan-approval/shipment-draft and dispatch; `reservedByOthers` counts only other shipments' **draft** allocations, never approved plans. Two approved plans can target the same `current_stock`/PO line until one dispatches. Only guard = first-come sufficiency check at dispatch ([22_:129](../../assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs#L129)).
2. **Carrier/rate SELECTION persistence = BLOCKED_BY_MISSING_AUTHORITY** (the 5 diverged routes) — carrier is inherited read-only from the plan; no wired write of a chosen carrier/rate onto shipping_plans.
3. **Post-dispatch/receipt REVERSAL = REVERSAL_MISSING.**
4. **CI / Customs / Booking documents = NOT_IMPLEMENTED** (SHIPDETAIL + PL only; renderer returns `UNSUPPORTED_DOCUMENT_TYPE`).
5. **RO Send server-owned derivation = STILL_REQUIRED** — backend trusts frontend lines, no Flat V2 re-read (§J).
6. **RO Send single-flight = STILL_REQUIRED.**
7. **"All Request" bounded job = STILL_REQUIRED** (synchronous browser loop).
8. **generated_documents expired/deleted-Drive-file detection = NOT_IMPLEMENTED** (reuses a row with a dead URL).
9. **Latent diverged carrier routes** still exported in db-api (§4).

## 8. What is connected / appears connected / not connected / missing authority (FINAL ANSWER)
- **Already connected & source-verified:** RO Draft (Flat V2) build/edit/Send with idempotent ROEXEC; RO→PO convert; PO issue/list/receive (+factory_stock on receive); allocation-draft save; shipping-plan lifecycle; shipment draft (via approve)/exec/confirm-dispatch (factory deduction + PO consumption + route + event under one lock); receipt; Shipment Overview (status snapshot); On-the-Way Map (canonical events/routes); document generate (SHIPDETAIL/PL) to Drive + download.
- **Appears connected but is not the real boundary / not live-verified:** Allocation-Draft "Submit" (orphan stub — plans actually come from `createShippingPlansBatch`); Inventory AI Plan DB persistence (flag OFF → in-browser only); `createShipmentFromPlan`/`submitShippingAllocationDrafts`/atomic adapters (wired, no UI); the eligible-tier explode helper (exists, not on the Send path); every dispatch/receipt/document path is source-connected but **not live-verified**.
- **Not connected / not implemented:** factory-stock reservation; carrier/rate selection persistence (diverged); post-commit reversal (dispatch/receipt/PO); CI/Customs/Booking docs; RO Send server-owned re-derivation; RO Send single-flight; bounded All-Request job; document expiry detection.
- **Missing DB/spec authority:** a **reservation ledger** (or `reserved_stock` writer + release); a **carrier-selection persistence** contract on shipping_plans (the diverged actions never had handlers); a **reversal/cancellation** authority for dispatched shipments/receipts; the **CI/Customs** renderer + `tax_referral_rates`/legal-importer authority gap.

---

## 9. Prioritized implementation batches (I) — not implemented here
Each: files · tables · tests · deployment type · live gate.
- **Batch A — Allocation Draft → Shipping Plan.** Decide the canonical boundary (wire `submitShippingAllocationDrafts` to create plans, OR formally retire it in favour of `createShippingPlansBatch`). Files: 16_, 11_, inventory-replenishment.js, shipping-plan.js. Tables: shipping_allocation_drafts/_lines, shipping_plans/_lines. Deployment: Apps Script + bundle-N/A. Gate: one controlled draft→plan with deterministic ids, no duplicate.
- **Batch B — Shipping Plan → Shipment.** Harden approve→createShipmentFromApprovedPlan (add lock/idempotency assertions); wire or retire `createShipmentFromPlan` retry. Files: 11_,12_. Gate: one approve creates exactly one shipment draft; retry `already_exists`.
- **Batch C — inventory/order deductions + reversal.** Add factory-stock **reservation** (reserve at plan-approval or shipment-draft; release on cancel) + **reversal** for dispatch/receipt/PO. Files: 21_,22_,31_,32_,13_. Tables: factory_stock(reserved_stock), factory_stock_movements, shipment_line_allocations(released_*). Gate: reserve→dispatch→cancel round-trips conserve stock; no double-count.
- **Batch D — route/events + Overview/Map.** Wire carrier/rate **selection persistence** (revive the 5 diverged actions with real handlers) + consider projecting Overview status from `shipment_events`. Files: 11_,22_,31_,57_, shipping-plan.js, global-logistics-map.js. Gate: chosen carrier persists to plan→shipment; Overview/Map agree.
- **Batch E — document generation/download.** Add CI/Customs/Booking renderers + `generated_documents` expiry/missing-file detection. Files: 34_,35_,36_,37_. Gate: CI renders from snapshot; dead-URL row regenerates.
- **Batch F — Request Order Draft → PO Workspace → PO List.** Server-owned Send re-derivation (backend re-reads Flat V2 + KMRDV2 builder; frontend lines advisory only), typed lock-contention, single-flight, bounded All-Request job. Files: 13_,15_,48_, request-order.js, KMRDV2/KMRDV2P. Gate: controlled one-series Send; double-click→one order; retry REUSED; All-Request resume-safe.
- **Batch G — end-to-end controlled functional validation** (one SKU / one series, flag-gated, read-back each boundary).
- **Batch H — API migration / performance / button synchronization** (remove or re-home the diverged adapters; align db-api ↔ router).

## 10. Controlled live-validation plan
Per boundary, run ONE minimal controlled case behind existing flags, read back, then STOP for USER review: (1) one allocation draft→plan; (2) one plan approve→shipment draft; (3) one shipment confirm (verify factory deduction + PO shipped_qty + route + event + rollback on induced failure); (4) one receipt (+overseas) and prove the missing-reversal gap; (5) one RO series Send (double-click → one order, retry → REUSED); (6) one RO→PO convert→issue; (7) one PO receive (+factory_stock); (8) one SHIPDETAIL doc generate+download. No "All Request", no bulk, no migration.

---

## J. R6A1A reconciliation (historical acceptance criteria — NOT an implementation instruction)

| # | R6A1A item | Current state (source) | Classification |
|---|---|---|---|
| 1 | Flat V2 schema count/hash | `V2_HEADERS`=**53** cols; validated by value (`join('|')`), **no numeric hash** | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 2 | Active Draft / eligible-tier counts | Live figures are **67 canonical draft rows / 65 legacy draft-lines / 41 frozen IDs** (TEMP diag), **not** "65/149" | REQUIRES_UPDATED_LIVE_COUNT |
| 3 | Send frontend fn | `handleSendRequest` [request-order.js:3187](../../assets/js/pages/request-order.js#L3187) | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 4 | API/adapter/backend handler | `createRequestOrderDraft`→`handleCreateRequestOrderDraft_`→`roCreateRequestOrderCore_` (13_) | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 5 | Frontend-authored lines accepted as final authority? | **YES** — `roCreateRequestOrderCore_` writes `body.lines` verbatim (13_:734,784,811) | CONFLICTS_WITH_CURRENT_AUTHORITY (R6A1A wanted server-owned) → STILL_REQUIRED |
| 6 | Backend rereads canonical Flat V2 + KMRDV2 builder? | **NO** — never reads the flat table; explode helper is client-side and not even on the live Send path | STILL_REQUIRED |
| 7 | RO header/line/source tables | request_orders(35)/request_order_lines(30)/request_order_line_sources(27) | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 8 | Execution/idempotency key | `ROEXEC-sha256(company\|cycle\|series\|sorted draft-id set)[:32]` (13_:658) | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 9 | Lock contention response | generic `{error:'Could not acquire lock; please retry.', stage:'lock'}` — **not** the typed `IN_PROGRESS_SAME_EXECUTION_KEY` R6A1A wanted | PARTIALLY_IMPLEMENTED |
| 10 | Double-click / single-flight | **none on Send** (button not disabled, no shared promise); backend key only | STILL_REQUIRED |
| 11 | Retry REUSED vs duplicate | exact retry → `reused:true`; >1 pre-existing → `REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT` | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 12 | Changed-payload conflict | different draft-set → **new** order (new key); same-key content change → allocation-layer `CONCURRENCY_TOKEN_MISMATCH` | PARTIALLY_IMPLEMENTED |
| 13 | "All Request" behavior | **synchronous** browser loop (one `createRequestOrderDraft` per series); **not** chunked/continuation | STILL_REQUIRED (bounded job) |
| 14 | Grouping authority for one RO | by **series** (frontend `bySeries`), backend key scoped by company\|cycle\|series\|draft-set | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 15 | Send creates PO rows? | **NO** — only the 3 request-order tables (test-asserted) | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 16 | RO → PO Workspace boundary | `convertToPo`→`createPurchaseOrderFromRequest` (13_:1543); PO pages via 50_ | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 17 | Popup / background resume | completion `alert()` + silent `_roLoadCanonicalDraftsForScope_` reload | ALREADY_IMPLEMENTED_AND_VERIFIED |
| 18 | Legacy `request_order_allocation_draft_lines` dependency | header path clean (Flat V2), but **manual line-upsert + legacy submit fallback still touch it** | PARTIALLY_IMPLEMENTED (remove) |
| 19 | API migration divergence on Send | 53-vs-26 header-authority selector = the documented `HEADER_MISSING` guard; the 5 diverged carrier actions are Flow A, not Send | API_ROUTE_CHANGED |

### New replacement task outline (based on audited authority)
**TASK F1-7N-FA-4B — REQUEST SEND SERVER-OWNED DERIVATION + SINGLE-FLIGHT + BOUNDED ALL-REQUEST (supersedes R6A1A).** Scope = only the *actual* missing Send boundary, cleanly connecting to the audited RO→PO boundary.
1. **Server-owned lines** — `handleCreateRequestOrderDraft_` re-reads the canonical `request_order_allocation_drafts` (53-col) for the submitted draft-id set and derives Send lines with `KMRDV2P.buildSendRequestLines`/`explodeSendRequestLinesFromDto` on the **backend**; frontend `body.lines` become advisory/verified-against, never authoritative (fail-closed on divergence). Preserve deterministic ids + ROEXEC idempotency + compensating delete.
2. **Typed lock contention** — return `IN_PROGRESS_SAME_EXECUTION_KEY` (read-back by execution key) instead of generic `stage:'lock'`; never advise blind retry.
3. **Frontend single-flight** — disable Send on first click; share one in-flight promise; restore only on terminal response; stable execution key across navigation.
4. **Bounded "All Request"** — replace the synchronous per-series loop with a resume-safe continuation job (reuse the 48_ job pattern: START→CONTINUE(≤N series)→DONE, Script-Property state, manual-only completion popup, silent background resume); one Request Order per series grouping authority; no duplicate on re-enter.
5. **Remove legacy line-table dependency** — route the manual line-upsert + submit fallback off `request_order_allocation_draft_lines` under the permanent Flat V2 cutover.
6. **Clean handoff to RO→PO** — assert the produced request_orders/lines/sources satisfy `handleCreatePurchaseOrderFromRequest_`'s lineage expectations (one controlled convert as the live gate).
Deployment: 13_/15_/48_ + request-order.js + KMRDV2/KMRDV2P (bundle rebuild if a core module changes); tests per item; live gate = one controlled series Send + one convert, read-back, then STOP.

---

## Tests / baseline
Flow-relevant suites pass: `shipping-allocation-draft-persistence`, `shipment-runtime`, `shipping-plan-runtime` (ALL PASS), `shipment-draft-allocation-wiring` 22/0, `request-order-draft-v2-audit-all26` 23/0, `request-order-alltier-…-r6b2` 51/0. **Full sweep = 329 files pass / 4 known baseline failures** (gap-job-done-notice, order-planning-monthly-projection-consumer, replen-header-toggle, supply-planning-route-inventory), 0 new. No production code was modified for this audit.
