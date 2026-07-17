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

    if (action === 'createShipmentFromPlan') {
      return handleCreateShipmentFromPlan_(body);
    }

    if (action === 'updateShipment') {
      return handleUpdateShipment_(body);
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

    if (action === 'deleteFcSpecialEvent') {
      return handleDeleteFcSpecialEvent_(body);
    }

    if (action === 'upsertFcTargetRule') {
      return handleUpsertFcTargetRule_(body);
    }

    if (action === 'deleteFcTargetRule') {
      return handleDeleteFcTargetRule_(body);
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

    if (action === 'upsertRequestOrderSiteConfirmations') {
      return handleUpsertRequestOrderSiteConfirmations_(body);
    }

    if (action === 'importCarrierRateCards') {
      return handleImportCarrierRateCards_(body);
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

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory, runAmazonSnapshotImports, createShippingPlansBatch, updateShippingPlanStatus, updateShippingPlanLineQty, appendShippingPlanNote, completeShippingPlan, createShipmentFromPlan, updateShipment, createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine, updatePurchaseOrderHeader, receivePurchaseOrderLines, upsertFcSpecialEvent, deleteFcSpecialEvent, upsertFcTargetRule, deleteFcTargetRule, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations, importCarrierRateCards, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, upsertTaxReferralRate, upsertTaxRateComponent' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}
