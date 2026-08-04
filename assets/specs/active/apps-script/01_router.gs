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

    // Weekly Plan Layer-1 (Rationale) + Layer-2 (Carrier & Cost) + Combined Plan + Method Recommendation (2026-07-28).
    if (action === 'getShippingMethodCandidates') {   // Execution Plan recommendation + Weekly L1 cascade (read-only)
      return handleGetShippingMethodCandidates_(body);
    }
    if (action === 'getWeeklyPlanRateCandidates') {   // Weekly L2 rough candidates (user picks; never auto-selected)
      return handleGetWeeklyPlanRateCandidates_(body);
    }
    if (action === 'updateShippingPlanRationale') {   // Weekly L1 write (clears carrier/cost, bumps version)
      return handleUpdateShippingPlanRationale_(body);
    }
    if (action === 'selectShippingPlanCarrier') {     // Weekly L2 write (snapshot carrier+rate+cost; NO rate_card_id)
      return handleSelectShippingPlanCarrier_(body);
    }
    if (action === 'combineShippingPlans') {
      return handleCombineShippingPlans_(body);
    }
    if (action === 'uncombineShippingPlans') {
      return handleUncombineShippingPlans_(body);
    }

    if (action === 'createShipmentFromPlan') {
      return handleCreateShipmentFromPlan_(body);
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

    if (action === 'submitShippingAllocationDrafts') {
      return handleSubmitShippingAllocationDrafts_(body);
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

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory, adjustFactoryInventory, runAmazonSnapshotImports, createShippingPlansBatch, updateShippingPlanStatus, updateShippingPlanLineQty, appendShippingPlanNote, completeShippingPlan, createShipmentFromPlan, updateShipment, confirmShipmentAndDispatch, createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine, updatePurchaseOrderHeader, receivePurchaseOrderLines, upsertFcSpecialEvent, deleteFcSpecialEvent, upsertFcTargetRule, deleteFcTargetRule, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations, importCarrierRateCards, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, upsertTaxReferralRate, upsertTaxRateComponent' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}
