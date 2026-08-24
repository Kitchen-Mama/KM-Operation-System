// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 01_router.gs — doGet / doPost action routing
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ========================================
// Kitchen Mama Operation System - Google Apps Script Web App
// Read + Write API for Google Sheet DB
// ========================================

/**
 * Main entry point for GET requests.
 * Supports actions: getOperationDb, getTable
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'getOperationDb') {
      return handleGetOperationDb_();
    }

    if (action === 'getTable') {
      var table = (e.parameter.table || '').trim();
      return handleGetTable_(table);
    }

    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_).
    if (action === 'getClientCapabilities') {
      return handleGetClientCapabilities_();
    }

    return jsonResponse_({ success: false, error: 'Missing or invalid action parameter. Use: getOperationDb or getTable' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}

/**
 * Main entry point for POST requests.
 * Supports actions: updateSkuLifecycle
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    // F1-7N-FA-3C-R6E1-R1 — read-only client capability transport (single flag authority; see 03_). The frontend
    // reads it via the canonical POST read runner (_kmGapRead_), so it is routed here as well as in doGet.
    if (action === 'getClientCapabilities') {
      return handleGetClientCapabilities_();
    }

    if (action === 'updateSkuLifecycle') {
      return handleUpdateSkuLifecycle_(body);
    }

    if (action === 'upsertSkuDetail') {
      return handleUpsertSkuDetail_(body);
    }

    if (action === 'upsertMarketplaceSku') {
      return handleUpsertMarketplaceSku_(body);
    }

    if (action === 'updateMarketplaceSkuModel') {
      return handleUpdateMarketplaceSkuModel_(body);
    }

    if (action === 'importMarketplaceSkusBatch') {
      return handleImportMarketplaceSkusBatch_(body);
    }

    if (action === 'upsertMarketplace') {
      return handleUpsertMarketplace_(body);
    }

    if (action === 'importFcRegularForecastBatch') {
      return handleImportFcRegularForecastBatch_(body);
    }

    if (action === 'importOverseasInventorySnapshotBatch') {
      return handleImportOverseasInventorySnapshotBatch_(body);
    }

    if (action === 'adjustOverseasInventory') {
      return handleAdjustOverseasInventory_(body);
    }

    if (action === 'runAmazonSnapshotImports') {
      return handleRunAmazonSnapshotImports_(body);
    }

    if (action === 'createShippingPlansBatch') {
      return handleCreateShippingPlansBatch_(body);
    }

    if (action === 'updateShippingPlanStatus') {
      return handleUpdateShippingPlanStatus_(body);
    }

    if (action === 'updateShippingPlanLineQty') {
      return handleUpdateShippingPlanLineQty_(body);
    }

    if (action === 'appendShippingPlanNote') {
      return handleAppendShippingPlanNote_(body);
    }

    if (action === 'completeShippingPlan') {
      return handleCompleteShippingPlan_(body);
    }

    // API v1 · Weekly Shipping Plan READ-ONLY Workspace (Phase API-2). A body-carrying READ (no write); owner =
    // 40_api_v1_weekly_workspace.gs. Reads only the Weekly tables (never getOperationDb). No business logic here.
    if (action === 'weeklyShipping.workspace.get') {
      return jsonResponse_(handleWeeklyShippingWorkspaceGet_(body));
    }

    // API v1 · Purchase Order READ-ONLY Workspace (Phase F1-7C). A body-carrying READ (no write); owner =
    // 50_api_v1_purchase_order_workspace.gs. Reads only the PO tables (never getOperationDb). The only projection is
    // the canonical read-model remaining_qty = max(0, completed - shipped); no FIFO / shipment / business write here.
    if (action === 'purchaseOrder.workspace.get') {
      return jsonResponse_(handlePurchaseOrderWorkspaceGet_(body));
    }

    // API v1 · Request Order READ-ONLY Workspace (Phase F1-7D). A body-carrying READ (no write); owner =
    // 51_api_v1_request_order_workspace.gs. Reads only the RO tables + the masters the Draft page consumes (never
    // getOperationDb). Composes persisted request_orders/request_order_lines ONLY — no Gap/Forecast/Recommendation,
    // no draft generation/persistence, no RO->PO conversion. No business logic here.
    if (action === 'requestOrder.workspace.get') {
      return jsonResponse_(handleRequestOrderWorkspaceGet_(body));
    }

    // API v1 · Shipment READ-ONLY Workspace (Phase F1-7F). A body-carrying READ (no write); owner =
    // 57_api_v1_shipment_workspace.gs. Reads only the Shipment table set (never getOperationDb); the On-the-Way MAP
    // tables (routes/events/locations/templates) are returned only when the include flag is set. Composes persisted
    // shipment facts ONLY — no FIFO, no allocation reconstruction, no PO shipped/receipt/factory-stock authority. No
    // business logic here.
    if (action === 'shipment.workspace.get') {
      return jsonResponse_(handleShipmentWorkspaceGet_(body));
    }

    // API v1 · FC Summary READ-ONLY Workspace (Phase F1-7G). A body-carrying READ (no write); owner =
    // 58_api_v1_fc_summary_workspace.gs. Reads only the FC Summary primary-render table set — fc_regular_forecast,
    // fc_special_events, fc_target_rules, marketplaces (never getOperationDb). Returns raw passthrough of the FULL FC
    // tables (the page's Year dropdown + non-cascading filter universes need the complete set; client keeps all
    // filtering/pagination). Emits ONLY raw persisted forecast rows — no Target% adjustment, no blending, no Gap/
    // Recommendation, and NOT the bounded 53_ raw-fact owner. No business logic here.
    if (action === 'fcSummary.workspace.get') {
      return jsonResponse_(handleFcSummaryWorkspaceGet_(body));
    }

    // API v1 · SKU Details READ-ONLY Workspace (Phase F1-7H). A body-carrying READ (no write); owner =
    // 59_api_v1_sku_details_workspace.gs. Reads only the SKU Details master/reference table set — sku_details,
    // tax_referral_rates, tax_rate_components (BASE); marketplace_skus, sku_regional_details (include.regional) — never
    // getOperationDb. Returns raw passthrough of the FULL tables (the pages' filter/lifecycle/country universes need the
    // complete set; client keeps all filtering/pagination). Authors NO write side effects — does NOT create sku_details/
    // marketplace_skus and does NOT initialize Factory Stock (that stays with master-SKU creation). No business logic here.
    if (action === 'skuDetails.workspace.get') {
      return jsonResponse_(handleSkuDetailsWorkspaceGet_(body));
    }

    // API v1 · Inventory Replenishment READ-ONLY Workspace (Phase F1-7I). A body-carrying READ (no write); owner =
    // 60_api_v1_inventory_replenishment_workspace.gs. Reads only the Inventory Replenishment primary-render table set
    // (the 19 tables the page's main-table assembly consumes) — never getOperationDb. Returns raw passthrough of the
    // FULL tables (the page derives scope + assembles per-SKU rows client-side; server-side narrowing would risk drift).
    // Authors NO Gap/Recommendation/allocation/FIFO/PO and creates NO Request Order (FLOW-A: Gap → Recommendation →
    // Shipping Plan → Shipment). Gap/Recommendation/allocation-draft stay on their existing separate scoped owners. No
    // business logic here.
    if (action === 'inventoryReplenishment.workspace.get') {
      return jsonResponse_(handleInventoryReplenishmentWorkspaceGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW read owner (Phase F1-7E-PREREQ-1). A body-carrying READ (no write); owner =
    // 52_api_v1_open_po_remaining_owner.gs. Reads only purchase_orders + purchase_order_lines (never getOperationDb).
    // Exposes the RAW informational fact open_po_remaining_raw_qty per SKU (OPEN-PO statuses; persisted remaining_qty
    // preferred, else the current browser fallback). NOT the canonical PO remaining (50_) and NOT consumed by the AI
    // Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'openPoRemaining.raw.get') {
      return jsonResponse_(handleOpenPoRemainingRawGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW forecast read owner (Phase F1-7E-PREREQ-2). A body-carrying READ (no write); owner =
    // 53_api_v1_fc_summary_raw_owner.gs. Reads only fc_regular_forecast + fc_special_events (never getOperationDb).
    // Exposes basicFcRawT3Qty (raw fc_regular_forecast N+1..N+3 sum) + specialEventFcRawQty (raw fc_special_events
    // prep-month sum) per SKU, anchored on planning_cycle (NOT the clock). NO Target%, NO blending, NO Recommendation/
    // Gap; NOT the fcSummary workspace and NOT consumed by the AI Plan yet (composed later in PREREQ-5). No business
    // logic here.
    if (action === 'fcSummary.raw.get') {
      return jsonResponse_(handleFcSummaryRawGet_(body));
    }

    // API v1 · AI-Plan Layer-1 RAW inventory read owner (Phase F1-7E-PREREQ-3). A body-carrying READ (no write); owner =
    // 54_api_v1_raw_inventory_owner.gs. Reads only amazon_inventory_snapshot + overseas_inventory_snapshot +
    // factory_stock + warehouses (never getOperationDb). Exposes siteStockRawQty (latest snapshot) + overseasStockRawQty
    // (pooled) + factoryStockRawQty (shared per-SKU pool) — RAW pools, NO allocation, NOT the recommendation supply, and
    // NOT consumed by the AI Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'rawInventory.get') {
      return jsonResponse_(handleRawInventoryGet_(body));
    }

    // API v1 · AI-Plan Layer-1 lead-time read owner (Phase F1-7E-PREREQ-4). A body-carrying READ (no write); owner =
    // 55_api_v1_lead_time_owner.gs. Reads only supplier_price_list (never getOperationDb). Exposes leadTimeDays per SKU
    // (active + latest effective_from; null when none/blank — EMPTY != ZERO). NOT a planning engine and NOT consumed by
    // the AI Plan yet (composed later in PREREQ-5). No business logic here.
    if (action === 'leadTime.raw.get') {
      return jsonResponse_(handleLeadTimeRawGet_(body));
    }

    // API v1 · AI-Plan first-layer COMPOSER (Phase F1-7E-PREREQ-5). A body-carrying READ (no write); owner =
    // 56_api_v1_ai_plan_first_layer.gs. Reads a TARGETED table set (never getOperationDb) and REUSES the 52_/53_/54_/55_
    // pure Layer-1 fact functions to return the SAME rows the browser _buildRequestOrderRowsFromDb() builds. NO new
    // formula, NO second engine; Layer-2 Gap/Recommendation stay on their existing scoped paths. No business logic here.
    if (action === 'aiPlanFirstLayer.get') {
      return jsonResponse_(handleAiPlanFirstLayerGet_(body));
    }

    // API v1 · Recommendation READ-ONLY Workspace (Phase F1-4B-A). A body-carrying READ (no write); owner =
    // 42_api_v1_recommendation_workspace.gs. Targeted canonical tables → KMPA → KMPS → resolver (never getOperationDb,
    // never writes/persists/creates a draft). No business logic here.
    if (action === 'recommendation.workspace.get') {
      return jsonResponse_(handleRecommendationWorkspaceGet_(body));
    }

    // F1-4B-FM5 · Materialized Gap batch recalculation (owner = 43_api_v1_gap_materialization.gs). ONE bounded
    // server batch per manual button: enumerate scopes → reuse the canonical recommendation calc per scope →
    // UPSERT the latest result into inventory_replenishment_gap / order_planning_gap. Writes ONLY those two
    // tables; no new formula; fails closed if the table/header is missing. No business logic here.
    if (action === 'inventoryReplenishmentGap.recalculate.all') {
      return jsonResponse_(handleRecalculateInventoryReplenishmentGapBatch_(body));
    }
    if (action === 'orderPlanningGap.recalculate.all') {
      return jsonResponse_(handleRecalculateOrderPlanningGapBatch_(body));
    }

    // F1-4B-FM5-R1 · Materialized Gap READ (page reads STORED result; NO calculation on expand). Bounded read of
    // inventory_replenishment_gap / order_planning_gap by company/country/marketplace(/sku). No business logic here.
    if (action === 'inventoryReplenishmentGap.get') {
      return jsonResponse_(handleGetInventoryReplenishmentGap_(body));
    }
    if (action === 'orderPlanningGap.get') {
      return jsonResponse_(handleGetOrderPlanningGap_(body));
    }

    // F1-4B-FM5-R4J · Backend-owned RESUMABLE gap materialization job (owner = 46_api_v1_gap_materialization_job.gs).
    // START = a quick write that acquires the script lock, freezes the calc context, enumerates scopes, records
    // Script-Property job state (cursor=0), schedules the first one-off continuation trigger, and returns
    // IMMEDIATELY (no calculation in the request). The backend then owns the job across self-re-arming triggers,
    // independent of the browser tab. STATUS is strictly READ-ONLY. No new formula, no DB schema. No business logic here.
    if (action === 'inventoryReplenishmentGap.job.start') {
      return jsonResponse_(handleStartInventoryReplenishmentGapJob_(body));
    }
    if (action === 'orderPlanningGap.job.start') {
      return jsonResponse_(handleStartOrderPlanningGapJob_(body));
    }
    if (action === 'gapJob.status.get') {
      return jsonResponse_(handleGetGapJobStatus_(body));
    }
    // F1-4B-FM5-R4J-LIVE4 — manual CANCEL (WRITE): terminal CANCELLED for the active product job; per-product isolated.
    if (action === 'inventoryReplenishmentGap.job.cancel') {
      return jsonResponse_(handleCancelInventoryReplenishmentGapJob_(body));
    }
    if (action === 'orderPlanningGap.job.cancel') {
      return jsonResponse_(handleCancelOrderPlanningGapJob_(body));
    }

    // Weekly Plan Layer-1 (Rationale) + Layer-2 (Carrier & Cost) + Combined Plan + Method Recommendation (2026-07-28).
    if (action === 'getShippingMethodCandidates') {   // Execution Plan recommendation + Weekly L1 cascade (read-only)
      return handleGetShippingMethodCandidates_(body);
    }
    // F1-7K-HOTFIX-ROUTER-CLOSURE-R1: the Weekly Plan Layer-1 (Rationale) / Layer-2 (Carrier & Cost) / Combined-Plan
    // actions — getWeeklyPlanRateCandidates, updateShippingPlanRationale, selectShippingPlanCarrier,
    // combineShippingPlans, uncombineShippingPlans — were dispatched here but their handlers were NEVER implemented in
    // the backend (ROUTER_HANDLER_CLOSURE failure: dispatch → undefined function → ReferenceError if ever called).
    // Audited: ZERO live frontend callers (the db-api _kmShippingPost_ stubs exist but are unwired). An action must not
    // be advertised/dispatched before its handler contract exists, so these five dispatches are REMOVED to make the
    // Apps Script source a clean deployable unit. NO business functionality was implemented or changed. If a caller is
    // ever wired, its POST now falls through to the unknown-action default and returns a clean fail-closed envelope
    // (surfaced as BACKEND_ERROR by the hardened foundation) instead of a runtime ReferenceError.

    if (action === 'createShipmentFromPlan') {
      return handleCreateShipmentFromPlan_(body);
    }

    // F1-5B-SHIP-R3A — generate/reconcile DRAFT PO→FIFO→shipment_line allocations (no shipped_qty mutation).
    if (action === 'generateShipmentLineAllocations') {
      return handleGenerateShipmentLineAllocations_(body);
    }

    if (action === 'updateShipment') {
      return handleUpdateShipment_(body);
    }

    // Confirm Shipment & Dispatch — single orchestration command (2026-07-24): finalize Formal Shipment
    // (in_transit) + snapshot shipment_routes + create initial shipment_event + deduct factory_stock,
    // atomically (lock + staged-write + rollback) and idempotently. See 22_shipment_dispatch_handlers.gs.
    if (action === 'confirmShipmentAndDispatch') {
      return handleConfirmShipmentAndDispatch_(body);
    }

    // F1-5C-EXPORT-R2B — canonical immutable final-output snapshot. finalize = idempotent post-dispatch
    // materialization (bound to shipments.status=in_transit; NOT inside the dispatch transaction); get = the ONE
    // frozen read owner (no re-resolve of masters). See 34_shipment_final_output_handlers.gs.
    if (action === 'finalizeShipmentFinalOutput') {
      return handleFinalizeShipmentFinalOutput_(body);
    }
    if (action === 'getShipmentFinalOutput') {
      return handleGetShipmentFinalOutput_(body);
    }

    // F1-5C-EXPORT-R3A — render Shipping Detail / Packing List from the frozen R2B snapshot (presentation only;
    // no live-master read, no persisted generated document). See 35_shipment_document_renderer.gs.
    if (action === 'renderShipmentDocument') {
      return handleRenderShipmentDocument_(body);
    }

    // F1-5C-EXPORT-R3B — persisted document template / field-mapping / generated-document runtime. Renders via the
    // R3A renderer (snapshot only), resolves ONE active document_templates row, maps document_template_fields, and
    // idempotently upserts a generated_documents lifecycle record. See 36_document_template_handlers.gs.
    if (action === 'documentTemplate.list') {
      return handleDocumentTemplateList_(body);
    }
    if (action === 'documentTemplate.getFields') {
      return handleDocumentTemplateGetFields_(body);
    }
    if (action === 'shipmentDocument.generate') {
      return handleShipmentDocumentGenerate_(body);
    }
    if (action === 'shipmentDocument.get') {
      return handleShipmentDocumentGet_(body);
    }
    if (action === 'shipmentDocument.list') {
      return handleShipmentDocumentList_(body);
    }

    // Shipment Receipt + Route Progress (F1-SHIPMENT-RECEIPT-R1B). Receipt = cumulative write to the LIVE
    // shipment_lines.shipment_received_qty + backend-derived shipments.status; route advance = forward-only
    // current-point set on shipment_routes node statuses. See 31_shipment_receipt_route_handlers.gs.
    if (action === 'shipment.receipt.update') {
      return handleUpdateShipmentReceipt_(body);
    }
    if (action === 'shipment.route.advance') {
      return handleAdvanceShipmentRoutePoint_(body);
    }
    // F1-SHIPMENT-MAP-R10: bounded ETA-only writer (shipments.eta; never status/route/receipt).
    if (action === 'shipment.eta.update') {
      return handleUpdateShipmentEta_(body);
    }

    // Procurement Layer (Phase 1) — Request Order / Purchase Order.
    if (action === 'createRequestOrderDraft') {
      return handleCreateRequestOrderDraft_(body);
    }

    if (action === 'updateRequestOrderStatus') {
      return handleUpdateRequestOrderStatus_(body);
    }

    if (action === 'updateRequestOrderLineQty') {
      return handleUpdateRequestOrderLineQty_(body);
    }

    if (action === 'cancelRequestOrderTier') {
      return handleCancelRequestOrderTier_(body);
    }

    if (action === 'createPurchaseOrderFromRequest') {
      return handleCreatePurchaseOrderFromRequest_(body);
    }

    if (action === 'updatePurchaseOrderStatus') {
      return handleUpdatePurchaseOrderStatus_(body);
    }

    if (action === 'updatePurchaseOrderLine') {
      return handleUpdatePurchaseOrderLine_(body);
    }

    if (action === 'updatePurchaseOrderHeader') {
      return handleUpdatePurchaseOrderHeader_(body);
    }

    if (action === 'receivePurchaseOrderLines') {
      return handleReceivePurchaseOrderLines_(body);
    }

    // FC Summary write path (Phase 1) — Special Events + Target % Rules.
    if (action === 'upsertFcSpecialEvent') {
      return handleUpsertFcSpecialEvent_(body);
    }

    if (action === 'importFcSpecialEventsBatch') {
      return handleImportFcSpecialEventsBatch_(body);
    }

    if (action === 'deleteFcSpecialEvent') {
      return handleDeleteFcSpecialEvent_(body);
    }

    // event_fc_id maintenance — read-only audit + one-time manual backfill (never auto-run).
    if (action === 'auditFcSpecialEventIds') {
      return handleAuditFcSpecialEventIds_(body);
    }

    if (action === 'backfillFcSpecialEventIds') {
      return handleBackfillFcSpecialEventIds_(body);
    }

    if (action === 'upsertFcTargetRule') {
      return handleUpsertFcTargetRule_(body);
    }

    if (action === 'deleteFcTargetRule') {
      return handleDeleteFcTargetRule_(body);
    }

    // Campaign write path (Special Event Builder: campaigns → campaign_sku_lines → fc_special_events).
    if (action === 'upsertCampaign') {
      return handleUpsertCampaign_(body);
    }

    if (action === 'upsertCampaignSkuLines') {
      return handleUpsertCampaignSkuLines_(body);
    }

    if (action === 'upsertRequestOrderAllocationDraft') {
      return handleUpsertRequestOrderAllocationDraft_(body);
    }

    if (action === 'upsertRequestOrderAllocationDraftLines') {
      return handleUpsertRequestOrderAllocationDraftLines_(body);
    }

    if (action === 'submitRequestOrderAllocationDrafts') {
      return handleSubmitRequestOrderAllocationDrafts_(body);
    }

    // Inventory Replenishment second-layer Recommendation / Execution Plan drafts (16_).
    if (action === 'upsertShippingAllocationDraft') {
      return handleUpsertShippingAllocationDraft_(body);
    }

    if (action === 'upsertShippingAllocationDraftLines') {
      return handleUpsertShippingAllocationDraftLines_(body);
    }

    // F1-7N-FA-3C-R6F1 — ATOMIC Header + Lines write (one lock; validate-all-before-write; compensation/COMMITTED_
    // UNVERIFIED/fail-closed). Additive; the legacy two-call path above stays available.
    if (action === 'upsertShippingAllocationDraftAtomic') {
      return handleUpsertShippingAllocationDraftAtomic_(body);
    }

    if (action === 'submitShippingAllocationDrafts') {
      return handleSubmitShippingAllocationDrafts_(body);   // F1-7N-FA-4B DEPRECATED alias → canonical Submit authority
    }

    // F1-7N-FA-4B — the ONE canonical Inventory AI Plan Submit authority (allocation drafts → Weekly Shipping Plan).
    if (action === 'submitAllocationDraftsToShippingPlans') {
      return handleSubmitAllocationDraftsToShippingPlans_(body);
    }

    if (action === 'getShippingAllocationDraftWorkspace') {
      return handleGetShippingAllocationDraftWorkspace_(body);
    }

    if (action === 'cancelShippingAllocationDraft') {
      return handleCancelShippingAllocationDraft_(body);
    }

    if (action === 'upsertRequestOrderSiteConfirmations') {
      return handleUpsertRequestOrderSiteConfirmations_(body);
    }

    // Phase 2C Round 1G — LOCKED recommendation generation bridge: Plan Builder → Persistence Core → Persistence
    // Plan Builder → LockService keyed-delta repository apply. The ONLY recommendation persistence write that is
    // lock-enforced; delegates entirely to the generated bundle (90_generated_supply_planning_bundle.gs) via
    // 24_recommendation_orchestrator.gs. Source mirror / NOT deployed; guarded (fails closed if the bundle is
    // absent). Legacy 15_/16_ unlocked writers remain for compatibility (enforcement is a later round).
    if (action === 'generateRecommendationDraftLocked') {
      return handleGenerateRecommendationDraftLocked_(body);
    }

    // F1-4B-FM6-R4E2 — BACKEND-ONLY gap-backed MONTHLY_ORDER draft generation + active-draft read-back (47_). The
    // generation persists via the SAME locked writer (generateRecommendationDraftLocked) with recommended_qty sourced
    // VERBATIM from order_planning_gap.tN_suggested_qty (never KMSF/calculateGap). No frontend wiring / no Order
    // Allocation reroute / no Send Request change this round — these are the backend contract the next UI round calls.
    if (action === 'requestOrderDraft.generateFromGap') {
      return handleGenerateRequestOrderDraftFromGap_(body);
    }
    if (action === 'requestOrderDraft.getActive') {
      return handleGetActiveRequestOrderDraftReadback_(body);
    }

    // F1-7N-D-2b — WEEKLY AI PLAN live generation owner (61_). Harvests canonical facts → KMWHA → KMWRB
    // (company,country) batch → per-marketplace K3 shipping_allocation_drafts via the frozen orchestrator + C1
    // semantics. Generation universe = company+country (marketplace is readback context only). Persists ONLY the
    // shipping-allocation draft tables; no Request Order / PO / shipment; no inventory reservation.
    if (action === 'weeklyAiPlan.generate') {
      return handleGenerateWeeklyAiPlanDraft_(body);
    }

    // F1-4B-FM6-R4E2-B2 — REQUEST-DRIVEN resumable scope draft job (48_). ONE logical job for a scope-wide AI Plan:
    // START snapshots eligible READY-gap SKUs; the client polls CONTINUE (bounded slice each) until DONE; STATUS is
    // read-only; CANCEL is terminal (created drafts preserved). No time trigger / scheduler / browser fan-out. The
    // per-SKU authority is the SAME R4E2 locked persister (recommended_qty verbatim from order_planning_gap).
    // F1-7N-FA-3C-PRE2-R2 — the 48_ job handlers return a RAW gapBatchEnvelope_ object (same convention as the 46_
    // gap-job family); the router MUST serialize it through jsonResponse_ (ContentService.JSON) so the Web App emits
    // a CORS-readable response via the googleusercontent redirect. Returning the raw object made doPost emit a
    // non-ContentService HTML page with no Access-Control-Allow-Origin → the browser fetch CORS-rejected it and the
    // client surfaced HTTP_TRANSPORT_ERROR. Mirror the known-good orderPlanningGap.job.start dispatch above.
    if (action === 'requestOrderDraft.job.start') {
      return jsonResponse_(handleStartRequestOrderDraftJob_(body));
    }
    if (action === 'requestOrderDraft.job.continue') {
      return jsonResponse_(handleContinueRequestOrderDraftJob_(body));
    }
    if (action === 'requestOrderDraft.job.status') {
      return jsonResponse_(handleGetRequestOrderDraftJobStatus_(body));
    }
    if (action === 'requestOrderDraft.job.cancel') {
      return jsonResponse_(handleCancelRequestOrderDraftJob_(body));
    }

    // Phase 2C Round 1H — LOCKED user-decision-edit boundary (25_): edit planned_qty/order_qty/etc under
    // ScriptLock + terminal guard + optimistic token, separate from engine generation and from Submit.
    if (action === 'updateRecommendationDecisionLocked') {
      return handleUpdateRecommendationDecisionLocked_(body);
    }

    // Read-only concurrency-token getter for a Recommendation Draft (client obtains {draft_version,
    // userEditFingerprint} to send back on an edit write).
    if (action === 'getRecommendationDraftToken') {
      return handleGetRecommendationDraftToken_(body);
    }

    // One-time migration (2026-07-28): retire the display-label snapshot columns from shipping_plans /
    // shipments (shipping_method_label / customs_type_label / shipments_customs_type_label). Backfill-safe:
    // dry_run reports; live deletes only when every code cell is populated (else blocked_needs_review).
    if (action === 'retireShipmentLabelColumns') {
      return handleRetireShipmentLabelColumns_(body);
    }

    if (action === 'importCarrierRateCards') {
      return handleImportCarrierRateCards_(body);
    }

    // One-time manual carrier provisioning — 中外運 Sinotrans (CAR_SINOTRANS) CN→JP Air+Parcel. Idempotent.
    if (action === 'seedSinotransCarrier') {
      return handleSeedSinotransCarrier_(body);
    }

    if (action === 'upsertSkuRegionalDetail') {
      return handleUpsertSkuRegionalDetail_(body);
    }

    if (action === 'syncMarketplaceSkusToSkuRegionalDetails') {
      return handleSyncMarketplaceSkusToSkuRegionalDetails_(body);
    }

    if (action === 'upsertTaxReferralRate') {
      return handleUpsertTaxReferralRate_(body);
    }

    if (action === 'upsertTaxRateComponent') {
      return handleUpsertTaxRateComponent_(body);
    }

    if (action === 'adjustFactoryInventory') {
      return handleAdjustFactoryInventory_(body);
    }

    // F0-HOTFIX-FI1 — Factory Inventory Initial Stock Import (two thin actions; business logic in 21_).
    if (action === 'factoryInventory.import.validate') {
      return handleFactoryInventoryImportValidate_(body);
    }
    if (action === 'factoryInventory.import.commit') {
      return handleFactoryInventoryImportCommit_(body);
    }

    // ADMIN-AUTOMATION-R1 — Automation Schedule Settings (owner = 45_api_v1_automation_schedule.gs). Schedule config
    // lives in Script Properties (NOT the spreadsheet DB); UPDATE reconciles ONLY the owned time trigger via a strict
    // handler allowlist. No formula, no DB table, no calc. GET is read-only (opening the page mutates nothing).
    if (action === 'automationSchedule.get') {
      return jsonResponse_(handleAutomationScheduleGet_(body));
    }
    if (action === 'automationSchedule.update') {
      return jsonResponse_(handleAutomationScheduleUpdate_(body));
    }

    // F1-7N-D-2j / F1-7N-D-2k-R1 — Site Inventory Warehouse Allocation config (owner = 50_api_v1_warehouse_allocation_
    // config.gs). Scope-safe reconciliation of the SELF_FULFILLED demand-allocation for ONE (company,country,
    // marketplace); the RULE MODEL is the sole planning-membership authority. Persistence = the
    // KM_WAREHOUSE_ALLOCATION_CONFIG Script-Property blob (NOT a Sheet tab), so it survives without user-managed
    // sheet rows yet stays backend/scheduler-readable. Rejects FBA/execution warehouses; ratios each sum to 100%.
    // GET is read-only (opening the modal mutates nothing).
    if (action === 'warehouseAllocation.get') {
      return handleWarehouseAllocationConfigGet_(body);
    }
    if (action === 'replenishmentDemandAllocation.save') {
      return handleReplenishmentDemandAllocationSave_(body);
    }

    // F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1 — TW factory OPERATIONAL POLICY booleans (owner = 62_api_v1_factory_
    // operation_config.gs). Two Phase-1 policies (TW New SKU Participation / TW General Allocation) persisted in the
    // KM_FACTORY_OPERATION_CONFIG Script-Property blob (NOT a Sheet tab), read headlessly by the monthly runtime /
    // scheduler / future SKU-init runtime. GET is read-only; SAVE writes ONLY the config blob (no inventory mutation).
    if (action === 'factoryOperationConfig.get') {
      return handleFactoryOperationConfigGet_(body);
    }
    if (action === 'factoryOperationConfig.save') {
      return handleFactoryOperationConfigSave_(body);
    }

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory, adjustFactoryInventory, factoryInventory.import.validate, factoryInventory.import.commit, runAmazonSnapshotImports, createShippingPlansBatch, updateShippingPlanStatus, updateShippingPlanLineQty, appendShippingPlanNote, completeShippingPlan, createShipmentFromPlan, updateShipment, confirmShipmentAndDispatch, createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine, updatePurchaseOrderHeader, receivePurchaseOrderLines, upsertFcSpecialEvent, deleteFcSpecialEvent, upsertFcTargetRule, deleteFcTargetRule, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations, importCarrierRateCards, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, upsertTaxReferralRate, upsertTaxRateComponent, getShippingAllocationDraftWorkspace, cancelShippingAllocationDraft, warehouseAllocation.get, replenishmentDemandAllocation.save, factoryOperationConfig.get, factoryOperationConfig.save' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}
