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

---

# F1-7N-FA-4B — FLOW A CLOSURE: Inventory AI Plan Submit authority (allocation drafts → Weekly Shipping Plan)

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED.** One local commit; not pushed/deployed; no Submit run; `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_` unchanged (false). This section supersedes the Flow-A "STATUS_TRANSITION_MISSING" / "PARTIALLY_CONNECTED" gaps recorded above.

## Final Flow A route (canonical, server-owned)
materialized Inventory GAP → Weekly Inventory AI Plan → `shipping_allocation_drafts` + `shipping_allocation_draft_lines` → user review/edit → **Submit** → `submitAllocationDraftsToShippingPlans` → `handleSubmitAllocationDraftsToShippingPlans_` (16_) **re-reads the persisted drafts server-side** → derives the plan payload → `shippingPlanCommitFromLines_` (11_, the ONE writer) → `shipping_plans` + `shipping_plan_lines` → drafts transition to `submitted` after readback. Shipping Plan → Shipment remains a later approval boundary (NOT created here).

## Compatibility cutover (one mutation authority; no duplicate writer)
- **`shippingPlanCommitFromLines_` (11_)** — the SINGLE shipping_plans write authority (lock-free core): derive → canonical fingerprint (`spfp-1`) → find-or-reuse classify (REUSED / CONFLICT / DUPLICATE_CONFLICT / COMMITTED_UNVERIFIED / RECONCILIATION_REQUIRED) → write → **readback-verify** (typed COMMITTED_UNVERIFIED on shortfall). Takes an already-derived, server-owned `lines[]`.
- **`handleSubmitAllocationDraftsToShippingPlans_` (16_)** — THE canonical Submit authority: ScriptLock (30 000 ms; typed `IN_PROGRESS_SAME_EXECUTION_KEY` on contention) → re-read drafts/lines → 13-point validation → derive `lines[]` → delegate to the writer → transition drafts.
- **`handleCreateShippingPlansBatch_` (11_)** — DEPRECATED compatibility wrapper: delegates when `allocation_draft_ids` present; refuses legacy frontend-`lines[]` with `SUBMIT_ROUTE_DEPRECATED` (zero write). No independent writer.
- **`handleSubmitShippingAllocationDrafts_` (16_)** — the orphan status-only stub is RETIRED → deprecated alias delegating to the canonical authority.
- **Frontend (staged, not deployed)**: `submitReplenishmentPlans` → `_replenCanonicalSubmit` → `submitAllocationDraftsToShippingPlans({ allocation_draft_ids, execution_key })`. Sends only draft ids + a stable execution key — never authored plan lines. Single-flight: one in-flight Promise per execution key.

## DB authority matrix (Flow A)
| Table | Role | Authority / headers | marketplace |
|---|---|---|---|
| shipping_allocation_drafts | Submit SOURCE (header: route/scope/lineage) | `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` (16_) | header-level (`marketplace`) |
| shipping_allocation_draft_lines | Submit SOURCE (sku/qty/window/snapshots) | `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_` (16_) | none (via draft header) |
| shipping_plans | Submit DEST (header) | `SHIPPING_PLANS_HEADERS_` 49 cols (11_) | header `marketplace` (`MULTI` when ≥2 distinct) |
| shipping_plan_lines | Submit DEST (line) | `SHIPPING_PLAN_LINES_HEADERS_` 30 cols (11_) | **line `marketplace` (real per-line value)** |

## API / button / handler mapping
| Button / entrypoint | API action | Handler | Status |
|---|---|---|---|
| Inventory "Submit Plan" (staged) | `submitAllocationDraftsToShippingPlans` | `handleSubmitAllocationDraftsToShippingPlans_` (16_) | CANONICAL |
| (legacy name) | `createShippingPlansBatch` | `handleCreateShippingPlansBatch_` (11_) → delegates/refuses | DEPRECATED WRAPPER |
| (legacy name) | `submitShippingAllocationDrafts` | `handleSubmitShippingAllocationDrafts_` (16_) → delegates | DEPRECATED ALIAS |

## Status transition (Inventory)
allocation draft `draft`/`site_confirmed`/`partially_submitted` → (Submit; validated + committed + readback) → `submitted`. Shipping plan initial status = `draft`, `plan_version=1`, `batch_status=open`, `parent=self` (existing shipping-plan lifecycle authority; no new enum). Cancelled drafts / cancelled lines excluded. Already-submitted drafts: idempotent REUSED only under the same execution key, else CONFLICT (no double submit). Zero positive-qty lines → typed refusal (zero write). Partial (transition-unverified) → typed `SUBMIT_DRAFT_TRANSITION_UNVERIFIED`, resumable on retry.

## Idempotency + rollback contract
Execution key = `body.execution_key` (frontend stable key) else derived `SADSUB-<fnv(sorted ids+versions)>`. Same key + identical canonical fingerprint → REUSED (zero new rows, zero status rewrite); changed → CONFLICT (zero write); lock contention → IN_PROGRESS_SAME_EXECUTION_KEY (read back, never blind retry). Multi-table write safety: ScriptLock; full re-gate under lock; deterministic derived rows; readback-verify BOTH the plan write and the draft transition; no COMMITTED_UNVERIFIED terminal (typed instead); a failed plan commit returns before any draft transition (drafts stay unsubmitted); no automatic destructive retry.

## shipping_plan_lines.marketplace conclusion (H)
CONCLUSION: `marketplace` IS a canonical `shipping_plan_lines` column (production authority `11_:41`, written `11_:528`, fingerprinted). It is REQUIRED — a Combined (MULTI) plan's header marketplace is the scope marker `'MULTI'`, so each line's real marketplace cannot be recovered via the `shipping_plan_id` FK. NO production change and NO DB column added/removed. The demo-seed V3B/V3C "no line marketplace" is a demo-tool-local schema-gate (matching a live sheet that lacked the column at seed time) and does NOT govern the production Submit path. The canonical Submit derives each line's marketplace from its source allocation-draft header (a K2 draft is single-marketplace scope). Pinned by regression test `inventory-ai-plan-submit-authority-f1-7n-fa-4b` (13/H). NOTE: the LIVE sheet's column set is USER-owned; the writer appends by header NAME (a missing live column is silently omitted, never a crash) — a dedicated live migration, if desired, is a separate USER-owned step.

## Lineage handling (no schema migration)
`shipping_plans`/`_lines` have no dedicated lineage columns and this task forbids a migration. Lineage (allocation_draft_id, allocation_draft_line_id, calculation_run_id, formula_version, planning_cycle, source_data_as_of) is preserved through EXISTING columns — encoded into line `source_reason` (`allocation_draft:<id>|run:<...>|fv:<...>|cyc:<...>|line:<...>`) and stamped bidirectionally on the draft→submitted transition (`note`: `[SUBMITTED → shipping_plan <ids> · exec <key>]`) — and returned in full in the response `data.lineage`. Dedicated lineage COLUMNS on shipping_plan_lines are a proposed later additive-migration batch (NOT executed here).

## Tests / baseline
`inventory-ai-plan-submit-authority-f1-7n-fa-4b` 31/0 (idempotency REUSED/CONFLICT/CREATE/COMMITTED_UNVERIFIED/RECONCILIATION via the real classifier; server re-read; no-frontend-lines; K2 route; typed lock contention; downstream-failure→unsubmitted; no shipment; one authority; schema-H; frontend single-flight). Updated to the cutover: `shipping-plan-submit-schema-writeboundary-r6e` 19/0, `three-flag-…-submit-idempotency-r6e1` 77/0, `allocation-draft-30-28-reconcile` 26/0. `r6e1a` 96/0 unchanged. **Full sweep = known 4-test baseline (gap-job-done-notice, order-planning-monthly-projection-consumer, replen-header-toggle, supply-planning-route-inventory), 0 new.**

## Controlled live-validation plan (Flow A — USER-owned, after deploy)
1. Sync the changed `.gs` + a new Web App version. 2. Persist ONE allocation draft (Execution Plan). 3. Call `submitAllocationDraftsToShippingPlans` with that single `allocation_draft_id` + a fresh execution key → expect CREATED + 1 plan + draft `submitted`. 4. Repeat with the SAME key → expect REUSED, zero new rows, draft unchanged. 5. Repeat with a changed qty + same key → expect CONFLICT, zero write. Bulk / multi-draft Submit stays blocked until bounded-job support is added + tested. Do NOT enable `INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_` as part of this.

## Remaining downstream batches (NOT this task)
Shipping Plan approval → Shipment; shipment dispatch/receipt; reservation/deduction/reversal; documents; carrier booking; PO issue/receive; dedicated lineage columns (additive migration); bounded multi-draft Submit job.

---

# FLOW B — SOURCE-CURRENT HANDOFF (for the NEXT task F1-7N-FA-4B-FLOW-B; NOT implemented here)
Exact current state (unchanged by this commit):
- **Live Send**: `handleSendRequest` (request-order.js:3187) → `createRequestOrderDraft` → `roCreateRequestOrderCore_` (13_:733) writes `request_orders` + `request_order_lines` + `request_order_line_sources`. Idempotent (`ROEXEC-sha256(company|cycle|series|sorted draftIds)` in `request_orders.source_ref_id`), ScriptLock 30 000 ms, compensation delete on write failure.
- **Canonical source**: 53-col Flat V2 `request_order_allocation_drafts` (`KMRDV2.V2_HEADERS`, in the 90_ bundle — do NOT hand-edit); tier authority `KMRDV2.explodeSendRequestLinesFromDto` (rule `order_qty>0 && status≠cancelled`); persistence `KMRDV2P` (loadActiveFlat/loadFlatById/applyFlat/tokenForDraft). Cutover flag `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_ = true`.
- **Remaining scope (next task)**: (1) server-owned Send — `roCreateRequestOrderCore_` currently TRUSTS `body.lines`; re-read Flat V2 + derive tiers via `KMRDV2.explodeSendRequestLinesFromDto` (call the bundle global from 13_/15_; no bundle edit). (2) Frontend single-flight on `handleSendRequest` (currently none; server key only). (3) Bounded "All Request" job (currently one synchronous browser loop over T1+T2+T3) — reuse the `48_` job/cursor/lease pattern. (4) Typed lock contention → `IN_PROGRESS_SAME_EXECUTION_KEY` (currently generic `stage:'lock'`). (5) Remove residual `request_order_allocation_draft_lines` manual-path dependency (do NOT delete the legacy table). Controlled one-SKU Send remains the first live-validation target; "All Request" UI stays blocked until the job path passes source tests.

---

# F1-7N-FA-4B1 — FLOW A RELEASE-GATE & LINEAGE HARDENING (design freeze)

**Status: SOURCE-IMPLEMENTED · TEST-PROVEN · NOT LIVE-VERIFIED.** One local follow-up commit; not pushed/deployed; no live Submit / DB mutation / migration / Shipment / dispatch / document. This section is the current 4B1 authority and supersedes the marketplace claims in `project-current-state.md` §2026-07-28 and `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (both corrected in place).

## A — Physical vs logical marketplace (reconciled)
Repo evidence was contradictory: the runtime authority header (`11_:41`), writer (`11_:545`), reader (`operation-system-db-api.js:817`), fingerprint (`SP_LINE_FP_STR_` `11_:282`) and every DTO use the cleanly-spelled **logical** `marketplace`; but the frozen live-header diagnostic in the R6E/R6E1 tests shows the **deployed** `shipping_plan_lines` sheet carries physical `marketplace_seperate` (col 5) and **lacks** `marketplace`. Consequence: on the real live sheet the writer's `prodRequireColumns_(…marketplace…)` failed closed `MISSING_REQUIRED_HEADER` — Flow A Submit could never durably write a line's marketplace. The **USER-frozen authority resolves it: the physical DB column is `marketplace_seperate` (do not spell-correct).**

Divergence type = **(1) physical `marketplace_seperate` vs logical `marketplace`**. Verdict: **PHYSICAL_LOGICAL_ALIAS_REQUIRED — no migration** (`marketplace_seperate` is the frozen physical authority; J branch 1).

| Aspect | Value |
|---|---|
| Physical live header | `marketplace_seperate` (deployed, misspelled — retained) |
| Logical DTO / app field | `marketplace` |
| Accessor / mapping | `shippingPlanLineMktPhysicalCol_(sheet)` (11_): `marketplace` if present, else `marketplace_seperate`, else '' → fail closed |
| Writer field | logical `marketplace`, remapped to the resolved physical column at append (`shippingPlanApplyLineMktPhysical_`) — ONE column, never both |
| Reader field | logical `marketplace` (persisted rows normalized via `shippingPlanNormalizeLineMkt_` in `shippingPlanReadObjects_`) |
| Fingerprint field | logical `marketplace` (`spfp-1` unchanged; stable across both physical spellings) |
| Migration | **NOT required** |

## B — Physical/logical authority (frozen)
Logical `marketplace` ↔ physical `marketplace_seperate` via ONE accessor. No duplicate marketplace columns; the value is written to exactly one physical column; no silent fallback between conflicting nonblank values (a real logical value is never overwritten by the alias); the physical typo is retained as the frozen live contract. Line marketplace always holds the REAL marketplace; the header alone may be `MULTI`.

## C — Shipping-plan grouping authority (frozen)
Group key (`11_:453`) = **company + country + ship_from + destination + shipping_method** — marketplace is NOT in the key. So physically compatible lines (same route) consolidate into one plan even across marketplaces; conflicting physical route/destination groups create separate plans. Header marketplace is DERIVED from the grouped lines: one distinct → the actual marketplace; ≥2 distinct → `MULTI` (`11_:485`). Every line keeps its own real marketplace (`marketplace: lineMk`, never `MULTI`). NOTE (documented, not changed): `last_mile_delivery` / `carrier_id` / `planning_cycle` are carried from the first line's meta but are NOT part of the group KEY — a candidate refinement for the later Shipping Plan → Shipment batch if last-mile divergence must split plans.

## D — Two-lineage model (audited; corrects the task's own assumptions)
The system has **two independent lineage axes** — never conflate them:

**A. Planning / marketplace axis:** `shipping_allocation_drafts → shipping_allocation_draft_lines → shipping_plans → shipping_plan_lines → [shipments/shipment_lines]`.
- The live plan→shipment link is `shipments.shipping_plan_id` (single FK, `12_:31/497`) — operationally **one-to-one** at the header, with plan-side **parent/child fan-in** for Combined plans (`shippingPlanEffectiveOwnerIds_`).
- **`shipment_plan_links`** (the header many-to-many table) = **SPEC-DEFINED_NOT_IMPLEMENTED** — no `.gs` constant, writer or reader (`SHIPMENT_CENTER_SPEC.md:171-173`).
- Exact per-plan-line contribution IS recoverable in code via **`shipment_lines.shipping_plan_line_id`** (1:1 plan-line→shipment-line, `12_:68/542`) — the shipped code is MORE granular than the spec's SKU-aggregation/header-only model (a doc/code divergence flagged here; the spec model is not implemented). Whole-plan transfer is guaranteed (no split/partial-transfer code path); therefore Header link + plan lines is exact AND line-level lineage is additionally present → **NOT `MISSING_SHIPPING_PLAN_LINE_CONTRIBUTION_AUTHORITY`**.

**B. Procurement / supply axis:** `purchase_orders → purchase_order_lines → shipment_line_allocations → shipment_lines`.
- **`shipment_line_allocations`** (`32_:26-37`) is the **PO-line supply bridge** — FK `purchase_order_line_id`, fields `allocated_qty`/`shipped_qty`/`allocation_status`/`released_*`. It does **NOT** carry `shipping_plan_line_id` and is **NOT** the planning bridge. `allocated_qty` is written at the draft-allocation stage; `purchase_order_lines.shipped_qty` is reconciled (SET, not incremented; idempotent) only at **Confirm & Dispatch** (`slaApplyExecution_`, invoked from `22_:240`). Allocation-level `shipped_qty` is a reserved/never-written column.

Classifications: shipment_plan_links = SPEC-DEFINED_NOT_IMPLEMENTED; shipment_lines.shipping_plan_line_id (line bridge) = SOURCE-CONNECTED; shipment_line_allocations (PO bridge) = SOURCE-CONNECTED; PO shipped/remaining reconciliation = SOURCE-CONNECTED (Confirm & Dispatch only); final-output snapshots + generated_documents = SOURCE-CONNECTED (customs family readiness-BLOCKED: no legal importer-of-record owner).

## E — Flow A lineage preserved at Submit
Each generated `shipping_plan_line` preserves: source `allocation_draft_id` + `allocation_draft_line_id` (encoded in `source_reason`, `16_:1008`), real marketplace (draft header → physical column), sku/site_sku, requested/approved qty, planning_cycle + calculation lineage (`calculation_run_id`/`formula_version`), route/group authority, and a full response `data.lineage`. **Header-level lineage only** is persisted on the plan (dedicated lineage columns remain a later additive-migration batch — not claimed as line-level DB lineage). The exact draft-line FK is preserved as an encoded reference, not a dedicated FK column.

## F — Durable idempotency (proven from source)
Execution key persisted on `shipping_plans.submit_batch_id`; a fresh execution re-reads the sheet and `shippingPlanClassifyBatch_` compares the COMPLETE canonical `spfp-1` fingerprint of persisted rows → REUSED (zero write, returns before append) / CONFLICT (changed payload, zero write) / DUPLICATE_CONFLICT / RECONCILIATION_REQUIRED. Lock contention → typed `IN_PROGRESS_SAME_EXECUTION_KEY` (`16_:929`). Durable authority (sheet-persisted), **not** in-memory. A different key over already-submitted drafts → `CONFLICT` (`16_`), so a draft cannot be duplicated under a new key.

## G — True multi-table atomicity + rollback (hardened)
Phases: re-gate → **durable journal** → plan-header insert → plan-line insert → plan readback → draft/line transition → final readback → terminal. Before the first append, `shippingPlanCommitFromLines_` writes a durable Script-Property journal (`SPCFL_JOURNAL_<execKey>`) binding execution key + `spfp-1` fingerprint + intended plan ids + intended line ids + affected draft ids/before-state (via `ctx.journalExtra`) + an integrity checksum. On a plan-write readback shortfall → **inserted-only reverse-FK rollback** (`shippingPlanRollbackBatch_`: delete this batch's lines then headers by id, flush, verify) → typed **COMMIT_FAILED_ROLLED_BACK / COMMIT_FAILED_ROLLBACK_UNVERIFIED**. On a draft-transition readback failure (`16_`) → restore ONLY the draft cells this execution changed + roll back the committed plan rows → typed **POSTCHECK_FAILED_ROLLED_BACK / POSTCHECK_FAILED_ROLLBACK_UNVERIFIED**. The forbidden `COMMITTED_UNVERIFIED` post-write terminal is eliminated (it survives only as an idempotency-classifier state). Rollback is inserted-only — it never deletes a pre-existing / other-batch row (proven: `shippingPlanDeleteRowsByColumn_` targets only ids in the batch set).

## H — Version / token gate
The under-lock re-gate validates selected `allocation_draft_ids`, `expected_versions[id]` vs live `draft_version` (typed `STALE_VERSION`, zero write), submittable status, complete route/group + lineage, exact line membership, and the current canonical fingerprint. Changed data between UI selection and the under-lock re-gate → CONFLICT / STALE_VERSION, zero write.

## I — Read-only schema/lineage preflight
`handleFlowASchemaLineagePreflight_` (router action `flowASchemaLineagePreflight`) — strictly read-only; reports shipping_plans/_lines headers + hash, marketplace vs marketplace_seperate presence/index, the physical/logical mapping verdict, real/MULTI/blank line-marketplace counts, plan/line counts, FK integrity, MULTI plan count, `every_line_retains_real_marketplace`, shipment_plan_links + shipment_line_allocations presence/headers, and a `schema_lineage_verdict` ∈ {FLOW_A_SCHEMA_LINEAGE_READY, PHYSICAL_LOGICAL_ALIAS_REQUIRED, SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED, LINE_MARKETPLACE_AMBIGUOUS, DOWNSTREAM_LINEAGE_SPEC_GAP}. Zero-write confirmed.

## J/K — Migration policy + production fail-closed gate
Migration: **NOT required** (marketplace_seperate is the frozen physical authority; accessor corrects the expectation instead — J branch 1). Fail-closed: when neither physical column resolves, Submit returns typed **SHIPPING_PLAN_LINES_SCHEMA_MAPPING_REQUIRED** (zero write) before any mutation; compatibility wrappers surface the same result. Never a partial write while schema authority is ambiguous.

## Download-readiness matrix (downstream; Flow A does not build these)
AVAILABLE: shipment identity, destination, route/method, carrier, SKU, consolidated shipped qty, source PO/PO line, allocated qty, PO-level shipped qty, carton/packaging, generated file + `download_url` (SHIPDETAIL/PL). DERIVABLE: marketplace-separated source (via `shipment_lines.shipping_plan_line_id → shipping_plan_lines.marketplace(_seperate)`), header totals, declared_total_value. NOT_CONNECTED: `shipment_plan_links` multi-plan provenance (spec-only). MISSING/BLOCKED: legal importer-of-record → customs/commercial-invoice document family permanently BLOCKED (`LEGAL_IMPORTER_AUTHORITY_GAP`); only 2 doc types (SHIPDETAIL, PL) implemented. All classifications NOT_LIVE_VERIFIED.

## Flow A boundary (what is / is not this batch)
**Flow A implemented (this + prior 4B):** Allocation Draft → Shipping Plan / Shipping Plan Lines → draft submitted after verified commit; server-owned Submit; marketplace physical/logical release gate; durable-journal + inserted-only rollback; idempotency + version/token gate; read-only preflight. **Flow A creates NO** Shipment, `shipment_plan_links`, `shipment_line_allocations`, PO allocation/deduction, dispatch, receive or documents — all belong to the later Shipping Plan → Shipment → Dispatch → Document batch. PO shipped deduction never occurs merely because an Allocation Draft is submitted to a Shipping Plan.
