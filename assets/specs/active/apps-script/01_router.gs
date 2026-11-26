


















































var RTR_BUILD_VERSION_ = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1F-R15F2-R15G-CP2C-PFI2-PA1-SSK1-R1-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1";


































var RTR_GET_BODY_MAX_ = 4000;

function rtrGetReadHandlers_() {
return {
'campaign.builder.get': handleCampaignBuilderGet_,
'campaign.builder.status': handleCampaignBuilderStatus_,
'siteSku.planning.list': handleSiteSkuPlanningList_,

'skuDetails.workspace.get': handleSkuDetailsWorkspaceGet_,
'weeklyShipping.workspace.get': handleWeeklyShippingWorkspaceGet_,
'fcSummary.workspace.get': handleFcSummaryWorkspaceGet_,
'purchaseOrder.workspace.get': handlePurchaseOrderWorkspaceGet_,
'requestOrder.workspace.get': handleRequestOrderWorkspaceGet_,
'inventoryReplenishment.workspace.get': handleInventoryReplenishmentWorkspaceGet_,
'overseasStock.workspace.get': handleOverseasStockWorkspaceGet_,
'factoryInventory.workspace.get': handleFactoryInventoryWorkspaceGet_,
'productPricing.workspace.get': handleProductPricingWorkspaceGet_,



'productPricing.siteUniverse.get': handleProductPricingSiteUniverseGet_,
'shipment.workspace.get': handleShipmentWorkspaceGet_,
'recommendation.workspace.get': handleRecommendationWorkspaceGet_,

'inventoryReplenishmentGap.get': handleGetInventoryReplenishmentGap_,
'orderPlanningGap.get': handleGetOrderPlanningGap_,
'aiPlanFirstLayer.get': handleAiPlanFirstLayerGet_,
'gapJob.status.get': handleGetGapJobStatus_,

'requestOrder.sendWorkset.get': handleRequestOrderSendWorksetGet_,
'requestOrder.send.status': handleRequestOrderSendStatus_,
'requestOrderDraft.job.status': handleGetRequestOrderDraftJobStatus_,
'requestOrderDraft.getActive': handleGetActiveRequestOrderDraftReadback_,



'pricing.write.status': handlePricingWriteStatus_,



'fxRateBook.get': handleFxRateBookGet_,

'system.requestOrderSendDiagnosticStatus': handleRequestOrderSendDiagnosticStatus_,
'system.requestOrderSendReconcile': handleRequestOrderSendReconcile_,
'system.allocationDraftIdentityDiagnostic': handleAllocationDraftIdentityDiagnostic_,

'automationSchedule.get': handleAutomationScheduleGet_,





'factoryStockGuard.get': handleFactoryStockGuardGet_,

'shipment.consolidationPolicy.get': handleShipmentConsolidationPolicyGet_,
'shipment.documentValues.check': handleShipmentDocumentValuesCheck_,
'document.diagnostic.shipment': handleShipmentDocumentDiagnostic_,
'system.sourceRevision': handleSourceRevisionGet_
};
}





var KM_SRC_REV_KEY_ = 'KM_SOURCE_REVISION', KM_SRC_PEND_ = 'KM_SRC_PEND_', KM_SRC_PEND_MS_ = 1800000;
function kmSrcRevGet_() {
try {
var p = PropertiesService.getScriptProperties().getProperties(), old = [];
for (var k in p) if (k.indexOf(KM_SRC_PEND_) === 0) { if (Date.now() - Number(p[k]) < KM_SRC_PEND_MS_) return false; old.push(k); }
return (p[KM_SRC_REV_KEY_] || 'R0') + (old.length ? '+' + old.sort().join('+') : '');
} catch (e) { return null; }
}
function kmSrcRevMark_() {
var id = KM_SRC_PEND_ + Utilities.getUuid().slice(0, 8);
try { PropertiesService.getScriptProperties().setProperty(id, String(Date.now())); } catch (e) { throw new Error('SOURCE_REVISION_UNAVAILABLE: the write was not started.'); }
return id;
}
function kmSrcRevBump_(id) {
try {
var P = PropertiesService.getScriptProperties(), p;
P.setProperty(KM_SRC_REV_KEY_, Date.now().toString(36) + '-' + Utilities.getUuid().slice(0, 8));
P.deleteProperty(id); p = P.getProperties();
for (var k in p) if (k.indexOf(KM_SRC_PEND_) === 0 && Date.now() - Number(p[k]) >= KM_SRC_PEND_MS_) P.deleteProperty(k);
} catch (e) {}
}

var RTR_POST_READS_ = ' shipment.receipt.diagnose shippingPlan.rateCardOptions getOperationDb getTable getClientCapabilities system.health inventoryScope.registry.get system.submitFlowDiagnostic system.shippingAllocationDraftDiagnostic system.executionPlanConflictDiagnostic system.executionPlanDuplicateLineDiagnostic system.shippingAllocationSchemaDiagnostic system.requestOrderSendDiagnostic system.twoVerticalFlowsDiagnostic openPoRemaining.raw.get fcSummary.raw.get rawInventory.get leadTime.raw.get overseasAllocationPreview.job.status overseasAllocationPreview.result.get getShippingMethodCandidates getShipmentFinalOutput shipmentDocument.get document.get document.export document.exportNonce shipment.rateCardOptions getShippingAllocationDraftWorkspace getRecommendationDraftToken warehouseAllocation.get factoryOperationConfig.get import.template.get import.validate import.receipt.get import.history.list factoryInventory.import.validate shipment.documentValues.check ';

// Production profile: shared-password sessions and a closed, build-bound action policy.
var RTR_PFI_SCOPE_ = "po_factory_stock|NEW_RECEIPT|OPENING_PO_FOR_EXISTING_STOCK|UPDATE_REMAINING;overseas_inventory|SET|ADD|POST_ONLY;shipment|ADD_NEW|UPDATE|ROUTE_INIT";   // SHIP-OPEN (Owner Q1)
function rtrPoFactoryScope_(action, body) {
if (!body || Array.isArray(body) || !Object.prototype.hasOwnProperty.call(RTR_PRODUCTION_PROFILE_.import_scopes, body.domain)) return false;
if (['import.template.get','import.validate','import.commit'].indexOf(action) >= 0) return RTR_PRODUCTION_PROFILE_.import_scopes[body.domain].indexOf(body.mode) >= 0;
return ['import.receipt.get','import.history.list'].indexOf(action) >= 0;
}
var RTR_CALLER_PROP_ = 'KM_CALLER_TOKEN_SHA256';
function rtrHex_(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) { var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i]; s += (b < 16 ? '0' : '') + b.toString(16); } return s; }
function rtrSha256Hex_(text) { return rtrHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)); }






function rtrIsRead_(a) { return !!rtrGetReadHandlers_()[a] || RTR_POST_READS_.indexOf(' ' + a + ' ') !== -1; }
function handleSourceRevisionGet_() {
var r = kmSrcRevGet_();
return r ? { success: true, data: { source_revision: r } } : r === false ? { success: false, code: 'SOURCE_REVISION_PENDING', error: 'A write is in flight.' }
: { success: false, code: 'SOURCE_REVISION_UNAVAILABLE', error: 'The source revision could not be read.' };
}

function rtrGetReadActionList_() {
var t = rtrGetReadHandlers_(), out = [];
for (var k in t) { if (Object.prototype.hasOwnProperty.call(t, k)) out.push(k); }
return out.sort();
}





















function rtrIsTextOutput_(v) {
return !!(v && typeof v === 'object' && typeof v.getContent === 'function' && typeof v.setMimeType === 'function');
}
function rtrEmitHandlerResult_(v) {
return rtrIsTextOutput_(v) ? v : jsonResponse_(v);
}



function rtrParseGetBody_(e, action) {
var p = (e && e.parameter) ? e.parameter : {};
var raw = (p.km_body === undefined || p.km_body === null) ? '' : String(p.km_body);
function refuse(code, message, extra) {
var out = { success: false, error: message, code: code, handler: 'doGet', received_method: 'GET',
router_build: RTR_BUILD_VERSION_, attempted_action: action, zero_write: true, rows_read: 0,
request_id: p.km_rid ? String(p.km_rid) : null,
next_action: 'This is a client-side request-construction fault. Nothing was read. Retrying the same request cannot change it.' };
if (extra) { for (var k in extra) out[k] = extra[k]; }
return { error: out };
}
if (raw.length > RTR_GET_BODY_MAX_) {
return refuse('READ_BODY_TOO_LARGE',
'The read parameters exceed the GET body limit, so the request was refused without reading anything.',
{ body_bytes: raw.length, body_bytes_max: RTR_GET_BODY_MAX_ });
}
var body;
if (raw === '') { body = {}; }
else {
try { body = JSON.parse(raw); }
catch (err) { return refuse('READ_BODY_MALFORMED', 'The read parameters were not valid JSON, so nothing was read.'); }
}
if (!body || typeof body !== 'object' || Object.prototype.toString.call(body) === '[object Array]') {
return refuse('READ_BODY_MALFORMED', 'The read parameters were not a JSON object, so nothing was read.');
}


var bodyAction = (body.action === undefined || body.action === null) ? '' : String(body.action).trim();
if (bodyAction !== '' && bodyAction !== action) {
return refuse('READ_BODY_ACTION_MISMATCH',
'The action in the URL and the action in the read parameters disagree, so nothing was read.',
{ body_action: bodyAction });
}
body.action = action;


if (!body.requestId && p.km_rid) body.requestId = String(p.km_rid);
return { body: body };
}











var RTR_ENTRY_AT_ = null;
var RTR_ENTRY_T0_ = null;
var RTR_ENTRY_METHOD_ = null;
var RTR_ENTRY_RID_ = null;
function rtrMarkEntry_(e, method) {
RTR_ENTRY_AT_ = Date.now();
RTR_ENTRY_T0_ = RTR_ENTRY_AT_;
RTR_ENTRY_METHOD_ = method;
RTR_ENTRY_RID_ = (e && e.parameter && e.parameter.km_rid) ? String(e.parameter.km_rid) : null;
return RTR_ENTRY_AT_;
}


function rtrEntryEvidence_() {
return {
routerEntryAt: RTR_ENTRY_AT_,
routerEntryMethod: RTR_ENTRY_METHOD_,
routerRequestId: RTR_ENTRY_RID_,
routerBuild: RTR_BUILD_VERSION_,



routerToHandlerMs: (RTR_ENTRY_T0_ === null) ? null : (Date.now() - RTR_ENTRY_T0_)
};
}

function doGet(e) { return jsonResponse_({ success: false, code: 'AUTH_REQUIRED', zero_write: true, business_writes: 0 }); }





function doPost(e) {
var _rtrAct = null, _rtrMark = null;
var _rtrOut = (function () {
try {
rtrMarkEntry_(e, 'POST');
var _prodBody = rtrProductionRequestBody_(e); if (_prodBody.error) return jsonResponse_(_prodBody.error);
var body = _prodBody.body;
var action = body.action || '';
_rtrAct = action;
if (typeof paControl_ !== 'function' || typeof paSessionCheck_ !== 'function') return jsonResponse_({ success: false, code: 'AUTH_MODULE_MISSING', zero_write: true });
var _paControl = paControl_(body); if (_paControl) return jsonResponse_(_paControl);
var _paDenied = paSessionCheck_(body); if (_paDenied) return jsonResponse_(_paDenied);
delete body.access_session; // Never expose credentials to business validation, audits or receipts.

var _prodAction = rtrActionGate_(action, body); if (_prodAction) return rtrGateRefusal_(_prodAction, 'doPost', action);
var _prodTarget = rtrProductionTargetCheck_(); if (_prodTarget) return rtrGateRefusal_(_prodTarget, 'doPost', action);
if (action === 'getOperationDb') return handleGetOperationDb_();
if (action === 'getTable') return handleGetTable_(String(body.table || '').trim());
var _paReads = rtrGetReadHandlers_();
if (Object.prototype.hasOwnProperty.call(_paReads, action)) { body.__km_handler = 'doPost'; return rtrEmitHandlerResult_(_paReads[action](body)); }
if (!rtrIsRead_(action)) { try { _rtrMark = kmSrcRevMark_(); } catch (eM) { return jsonResponse_({ success: false, code: 'SOURCE_REVISION_UNAVAILABLE', error: eM.message, zero_write: true }); } }
if (action === 'siteSku.planning.list') return jsonResponse_(handleSiteSkuPlanningList_(body));
if (action === 'siteSku.planning.update') return jsonResponse_(handleSiteSkuPlanningUpdate_(body));



if (action === 'getClientCapabilities') {
return rtrWithProductionGate_(handleGetClientCapabilities_());
}


if (action === 'system.health') {
body.__km_handler = 'doPost';
return handleSystemHealth_(body);
}
if (action === 'system.submitFlowDiagnostic') {
return handleSubmitFlowDiagnostic_(body);
}



if (action === 'system.shippingAllocationDraftDiagnostic') {
return handleShippingAllocationDraftDiagnostic_(body);
}




if (action === 'system.executionPlanConflictDiagnostic') {
return jsonResponse_(handleExecutionPlanConflictDiagnostic_(body));
}



if (action === 'system.requestOrderSendDiagnosticStatus') {
return jsonResponse_(handleRequestOrderSendDiagnosticStatus_(body));
}




















if (action === 'system.executionPlanDuplicateLineDiagnostic') {
body.__km_handler = 'doPost';
return jsonResponse_(handleExecutionPlanDuplicateLineDiagnostic_(body));
}
if (action === 'inventoryScope.registry.get') {
return handleInventoryScopeRegistryGet_(body);
}


if (action === 'system.shippingAllocationSchemaDiagnostic') {
return handleShippingAllocationSchemaDiagnostic_(body);
}
if (action === 'system.requestOrderSendDiagnostic') {
return handleRequestOrderSendDiagnostic_(body);
}
if (action === 'system.twoVerticalFlowsDiagnostic') {
return handleTwoVerticalFlowsDiagnostic_(body);
}


if (action === 'system.requestOrderSendReconcile') {
return handleRequestOrderSendReconcile_(body);
}









if (action === 'requestOrder.sendWorkset.get') {
return jsonResponse_(handleRequestOrderSendWorksetGet_(body));
}
if (action === 'requestOrder.send.orchestrate') {
return jsonResponse_(handleRequestOrderSendOrchestrate_(body));
}


if (action === 'requestOrder.send.status') {
return jsonResponse_(handleRequestOrderSendStatus_(body));
}


if (action === 'pricing.write.status') {
return jsonResponse_(handlePricingWriteStatus_(body));
}




if (action === 'requestOrder.allocationDraft.ensureAndEdit') {
return handleRequestOrderAllocationDraftEnsureAndEdit_(body);
}


if (action === 'system.allocationDraftIdentityDiagnostic') {
return handleAllocationDraftIdentityDiagnostic_(body);
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








if (action === 'marketplace.allocationPriority.set') {
return handleSetMarketplaceAllocationPriority_(body);
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
if (action === 'shippingPlan.mixedCartons.save') {
if (body.packing_version !== 'MIXED_CARTONS_V1' || !Array.isArray(body.mixed_cartons) || !Array.isArray(body.line_edits)) return jsonResponse_({success:false,zero_write:true,code:'MIXED_PACKING_VERSION_INVALID'});
return handleWeeklyDraftLines_(body);
}
if (action === 'campaign.builder.save') return handleCampaignBuilderSave_(body);
if (action === 'shippingPlan.rateCardOptions') {   // SANDBOX-GATE-1f (read)
return handleShippingPlanRateCardOptions_(body);
}
if (action === 'shippingPlan.selectRateCard') {   // SANDBOX-GATE-1f (write; allow-listed in the Sandbox gate)
return handleShippingPlanSelectRateCard_(body);
}

if (action === 'shipment.consolidationPolicy.get') return handleShipmentConsolidationPolicyGet_();
if (action === 'shipment.consolidationPolicy.save') return handleShipmentConsolidationPolicySave_(body);
if (action === 'appendShippingPlanNote') {
return handleAppendShippingPlanNote_(body);
}

if (action === 'completeShippingPlan') {
return handleCompleteShippingPlan_(body);
}



if (action === 'weeklyShipping.workspace.get') {
return jsonResponse_(handleWeeklyShippingWorkspaceGet_(body));
}




if (action === 'purchaseOrder.workspace.get') {
return jsonResponse_(handlePurchaseOrderWorkspaceGet_(body));
}





if (action === 'requestOrder.workspace.get') {
return jsonResponse_(handleRequestOrderWorkspaceGet_(body));
}






if (action === 'shipment.workspace.get') {
return jsonResponse_(handleShipmentWorkspaceGet_(body));
}
if (action === 'shipment.receipt.diagnose') {   // A final4 P0: read-only, company-scoped
return jsonResponse_(handleShipmentReceiptDiagnose_(body));
}







if (action === 'fcSummary.workspace.get') {
return jsonResponse_(handleFcSummaryWorkspaceGet_(body));
}











if (action === 'overseasStock.workspace.get') {
return jsonResponse_(handleOverseasStockWorkspaceGet_(body));
}
if (action === 'factoryInventory.workspace.get') {
return jsonResponse_(handleFactoryInventoryWorkspaceGet_(body));
}
if (action === 'skuDetails.workspace.get') {
return jsonResponse_(handleSkuDetailsWorkspaceGet_(body));
}








if (action === 'productPricing.workspace.get') {
return jsonResponse_(handleProductPricingWorkspaceGet_(body));
}








if (action === 'productPricing.siteUniverse.get') {
return jsonResponse_(handleProductPricingSiteUniverseGet_(body));
}








if (action === 'inventoryReplenishment.workspace.get') {
return jsonResponse_(handleInventoryReplenishmentWorkspaceGet_(body));
}






if (action === 'openPoRemaining.raw.get') {
return jsonResponse_(handleOpenPoRemainingRawGet_(body));
}







if (action === 'fcSummary.raw.get') {
return jsonResponse_(handleFcSummaryRawGet_(body));
}






if (action === 'rawInventory.get') {
return jsonResponse_(handleRawInventoryGet_(body));
}





if (action === 'leadTime.raw.get') {
return jsonResponse_(handleLeadTimeRawGet_(body));
}





if (action === 'aiPlanFirstLayer.get') {
return jsonResponse_(handleAiPlanFirstLayerGet_(body));
}




if (action === 'recommendation.workspace.get') {
return jsonResponse_(handleRecommendationWorkspaceGet_(body));
}





if (action === 'inventoryReplenishmentGap.recalculate.all') {
return jsonResponse_(handleRecalculateInventoryReplenishmentGapBatch_(body));
}
if (action === 'orderPlanningGap.recalculate.all') {
return jsonResponse_(handleRecalculateOrderPlanningGapBatch_(body));
}



if (action === 'inventoryReplenishmentGap.get') {
return jsonResponse_(handleGetInventoryReplenishmentGap_(body));
}
if (action === 'orderPlanningGap.get') {
return jsonResponse_(handleGetOrderPlanningGap_(body));
}






if (action === 'inventoryReplenishmentGap.job.start') {
return jsonResponse_(handleStartInventoryReplenishmentGapJob_(body));
}
if (action === 'orderPlanningGap.job.start') {
return jsonResponse_(handleStartOrderPlanningGapJob_(body));
}
if (action === 'gapJob.status.get') {
return jsonResponse_(handleGetGapJobStatus_(body));
}

if (action === 'inventoryReplenishmentGap.job.cancel') {
return jsonResponse_(handleCancelInventoryReplenishmentGapJob_(body));
}
if (action === 'orderPlanningGap.job.cancel') {
return jsonResponse_(handleCancelOrderPlanningGapJob_(body));
}









if (action === 'overseasAllocationPreview.job.start') {
return jsonResponse_(handleStartOverseasAllocationPreviewJob_(body));
}
if (action === 'overseasAllocationPreview.job.status') {
return jsonResponse_(handleGetOverseasAllocationPreviewJobStatus_(body));
}
if (action === 'overseasAllocationPreview.result.get') {
return jsonResponse_(handleGetOverseasAllocationPreviewResult_(body));
}
if (action === 'overseasAllocationPreview.job.cancel') {
return jsonResponse_(handleCancelOverseasAllocationPreviewJob_(body));
}


if (action === 'getShippingMethodCandidates') {
return handleGetShippingMethodCandidates_(body);
}














if (action === 'shipment.removePlanFromConsolidated') return handleShipmentRemovePlanFromConsolidated_(body);   // XCO-R15G H2
if (action === 'cancelShipmentDraft') {
return handleCancelShipmentDraft_(body);
}
if (action === 'createShipmentFromPlan') {
return handleCreateShipmentFromPlan_(body);
}


if (action === 'generateShipmentLineAllocations') {
return handleGenerateShipmentLineAllocations_(body);
}

if (action === 'updateShipment') {
return handleUpdateShipment_(body);
}




if (action === 'confirmShipmentAndDispatch') {
return handleConfirmShipmentAndDispatch_(body);
}




if (action === 'finalizeShipmentFinalOutput') {
return handleFinalizeShipmentFinalOutput_(body);
}
if (action === 'getShipmentFinalOutput') {
return handleGetShipmentFinalOutput_(body);
}
if (action === 'shipment.documentValues.check') {   // R15d: READ ONLY - the pre-dispatch document value gate for one shipment (39_)
return handleShipmentDocumentValuesCheck_(body);
}



if (action === 'renderShipmentDocument') {
return handleRenderShipmentDocument_(body);
}




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





if (action === 'document.list') {
return handleEntityDocumentList_(body);
}
if (action === 'document.exportNonce') {
return handleDocumentExportNonce_();
}
if (action === 'shipment.rateCardOptions') {
return handleShipmentRateCardOptions_(body);
}
if (action === 'shipment.selectRateCard') {
return handleShipmentSelectRateCard_(body);
}
if (action === 'shipment.assignCarrier') {   // AD3 (Author B CONTRACT sec.12; write): fill a BLANK carrier later (owner = 12_)
return handleShipmentAssignCarrier_(body);
}
if (action === 'document.export') {
return handleDocumentExport_(body);
}
if (action === 'document.get') {
return handleGeneratedDocumentGet_(body);
}
if (action === 'document.retry') {
return handleDocumentRetry_(body);
}
if (action === 'document.diagnostic.purchaseOrder') {
return handlePoDocumentDiagnostic_(body);
}
if (action === 'document.diagnostic.shipment') {
return handleShipmentDocumentDiagnostic_(body);
}




if (action === 'shipment.receipt.update') {
return handleUpdateShipmentReceipt_(body);
}
if (action === 'shipment.route.advance') {
return handleAdvanceShipmentRoutePoint_(body);
}

if (action === 'shipment.eta.update') {
return handleUpdateShipmentEta_(body);
}


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


if (action === 'upsertFcSpecialEvent') {
return handleUpsertFcSpecialEvent_(body);
}

if (action === 'importFcSpecialEventsBatch') {
return handleImportFcSpecialEventsBatch_(body);
}

if (action === 'deleteFcSpecialEvent') {
return handleDeleteFcSpecialEvent_(body);
}


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


if (action === 'upsertShippingAllocationDraft') {
return handleUpsertShippingAllocationDraft_(body);
}

if (action === 'upsertShippingAllocationDraftLines') {
return handleUpsertShippingAllocationDraftLines_(body);
}



if (action === 'upsertShippingAllocationDraftAtomic') {







var _rIntent = String((body && (body.intent || (body.header && body.header.intent))) || '').trim();
if (_rIntent && typeof SAD_CLIENT_GRANTABLE_INTENTS_ !== 'undefined' && !SAD_CLIENT_GRANTABLE_INTENTS_[_rIntent]) {
return jsonResponse_({ success: false, error: 'ROUTE_INTENT_NOT_CLIENT_GRANTABLE',
code: 'ROUTE_INTENT_NOT_CLIENT_GRANTABLE', stage: 'intent', zero_write: true,
data: { received_intent: _rIntent,
client_grantable: Object.keys(SAD_CLIENT_GRANTABLE_INTENTS_),
message: 'this route intent is server-owned and cannot be declared by a request (zero rows written)' } });
}
return handleUpsertShippingAllocationDraftAtomic_(body);
}

if (action === 'submitShippingAllocationDrafts') {
return handleSubmitShippingAllocationDrafts_(body);
}


if (action === 'submitAllocationDraftsToShippingPlans') {
return handleSubmitAllocationDraftsToShippingPlans_(body);
}


if (action === 'flowASchemaLineagePreflight') {
return handleFlowASchemaLineagePreflight_(body);
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






if (action === 'generateRecommendationDraftLocked') {
return handleGenerateRecommendationDraftLocked_(body);
}





if (action === 'requestOrderDraft.generateFromGap') {
return handleGenerateRequestOrderDraftFromGap_(body);
}
if (action === 'requestOrderDraft.getActive') {
return handleGetActiveRequestOrderDraftReadback_(body);
}





if (action === 'weeklyAiPlan.generate') {
return handleGenerateWeeklyAiPlanDraft_(body);
}










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



if (action === 'updateRecommendationDecisionLocked') {
return handleUpdateRecommendationDecisionLocked_(body);
}



if (action === 'getRecommendationDraftToken') {
return handleGetRecommendationDraftToken_(body);
}




if (action === 'retireShipmentLabelColumns') {
return handleRetireShipmentLabelColumns_(body);
}

if (action === 'importCarrierRateCards') {
if (body.quick_edit === true) {
if (typeof handleCarrierRateCardsQuick_ !== 'function') return jsonResponse_({ success: false, code: 'RATE_MAINTENANCE_NOT_DEPLOYED', error: 'Install 17b_carrier_rate_card_maintenance.gs first.', data: { zero_write: true } });
return handleCarrierRateCardsQuick_(body);
}
return handleImportCarrierRateCards_(body);
}







if (action === 'carrierLeadTime.upsert') {
return handleUpsertCarrierLeadTime_(body);
}
if (action === 'carrierLeadTime.duplicateCensus') {
return handleCarrierLeadTimeDuplicateCensus_(body);
}
if (action === 'seedSinotransCarrier') {
return handleSeedSinotransCarrier_(body);
}

if (action === 'upsertSkuRegionalDetail') {
return handleUpsertSkuRegionalDetail_(body);
}







if (action === 'pricing.update') {
return jsonResponse_(handlePricingUpdate_(body));
}






if (action === 'pricing.fxReconcile') {
return jsonResponse_(handlePricingFxReconcile_(body));
}





if (action === 'fxRateBook.save') {
return jsonResponse_(handleFxRateBookSave_(body));
}



if (action === 'fxRateBook.get') {
return jsonResponse_(handleFxRateBookGet_(body));
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


if (action === 'import.template.get') return handleImportTemplateGet_(body);
if (action === 'import.validate') return handleImportValidate_(body);
if (action === 'import.commit') return handleImportCommit_(body);
if (action === 'import.receipt.get') return handleImportReceiptGet_(body);
if (action === 'import.history.list') return handleImportHistoryList_(body);


if (action === 'factoryInventory.import.validate') {
return handleFactoryInventoryImportValidate_(body);
}
if (action === 'factoryInventory.import.commit') {
return handleFactoryInventoryImportCommit_(body);
}




if (action === 'automationSchedule.get') {
return jsonResponse_(handleAutomationScheduleGet_(body));
}
if (action === 'automationSchedule.update') {
return jsonResponse_(handleAutomationScheduleUpdate_(body));
}







if (action === 'warehouseAllocation.get') {
return handleWarehouseAllocationConfigGet_(body);
}
if (action === 'replenishmentDemandAllocation.save') {
return handleReplenishmentDemandAllocationSave_(body);
}





if (action === 'factoryOperationConfig.get') {
return handleFactoryOperationConfigGet_(body);
}
if (action === 'factoryOperationConfig.save') {
return handleFactoryOperationConfigSave_(body);
}








if (action === 'factoryStockGuard.get') {
return handleFactoryStockGuardGet_(body);
}
if (action === 'system.sourceRevision') return jsonResponse_(handleSourceRevisionGet_(body));

return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertSkuDetail, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, marketplace.allocationPriority.set, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory, adjustFactoryInventory, factoryInventory.import.validate, factoryInventory.import.commit, runAmazonSnapshotImports, createShippingPlansBatch, updateShippingPlanStatus, updateShippingPlanLineQty, appendShippingPlanNote, completeShippingPlan, createShipmentFromPlan, cancelShipmentDraft, updateShipment, confirmShipmentAndDispatch, createRequestOrderDraft, updateRequestOrderStatus, updateRequestOrderLineQty, cancelRequestOrderTier, createPurchaseOrderFromRequest, updatePurchaseOrderStatus, updatePurchaseOrderLine, updatePurchaseOrderHeader, receivePurchaseOrderLines, upsertFcSpecialEvent, deleteFcSpecialEvent, upsertFcTargetRule, deleteFcTargetRule, upsertRequestOrderAllocationDraft, upsertRequestOrderAllocationDraftLines, submitRequestOrderAllocationDrafts, upsertRequestOrderSiteConfirmations, importCarrierRateCards, carrierLeadTime.upsert, carrierLeadTime.duplicateCensus, upsertSkuRegionalDetail, syncMarketplaceSkusToSkuRegionalDetails, pricing.update, pricing.fxReconcile, fxRateBook.save, fxRateBook.get, upsertTaxReferralRate, upsertTaxRateComponent, getShippingAllocationDraftWorkspace, cancelShippingAllocationDraft, warehouseAllocation.get, replenishmentDemandAllocation.save, factoryOperationConfig.get, factoryOperationConfig.save, factoryStockGuard.get',


handler: 'doPost', received_method: 'POST', router_build: RTR_BUILD_VERSION_,
post_body_present: true, action_present_in_query: !!(e && e.parameter && e.parameter.action), zero_write: true });

} catch (err) {
Logger.log(err.stack);
return jsonResponse_({ success: false, error: err.message, handler: 'doPost', received_method: 'POST', router_build: RTR_BUILD_VERSION_ });
}
})();

if (_rtrMark) kmSrcRevBump_(_rtrMark);
return _rtrOut;
}
// R15F2-STAMPS (sbx-r15f2 step 23): patched

// XCO-R15G H2: shipment.removePlanFromConsolidated (12_). Not added to RTR_SANDBOX_GATE_.allow (the Sandbox gate list is Owner-controlled).
// XCO-R15G-01 (xco-r15g-impl): patched

// XCO-R15G xco-01-allow: four Sandbox actions opened (Owner option A, local Sandbox candidate only).
// XCO-R15G-01-ALLOW (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched

var RTR_PRODUCTION_PROFILE_ = {
  "profile_id": "KM-PRODUCTION-PHASE1-20261112-R2-AV1-IU3-IU4N1-PGSC1N1",
  "environment": "KM_PRODUCTION",
  "endpoint": "https://script.google.com/macros/s/AKfycbzQSU0ZR4EW5F79EzpOoBvUDxjJNLZkLrPkFjuaCBwiWXZMBPR4jnxvIS0FZnjNnp9Q/exec",
  "endpoint_sha256": "11ba59bcde9a7cc2fe5ddb5934b0780dfa3a518ab1e220368ae9b319cd42f290",
  "db_fp": "8fa2c42600619bf8",
  "allowed": [
    "adjustOverseasInventory",
    "aiPlanFirstLayer.get",
    "appendShippingPlanNote",
    "auditFcSpecialEventIds",
    "automationSchedule.get",
    "cancelRequestOrderTier",
    "cancelShipmentDraft",
    "cancelShippingAllocationDraft",
    "carrierLeadTime.upsert",
    "completeShippingPlan",
    "confirmShipmentAndDispatch",
    "createPurchaseOrderFromRequest",
    "createRequestOrderDraft",
    "createShipmentFromPlan",
    "createShippingPlansBatch",
    "deleteFcSpecialEvent",
    "deleteFcTargetRule",
    "document.diagnostic.shipment",
    "document.export",
    "document.exportNonce",
    "document.get",
    "document.list",
    "document.retry",
    "documentTemplate.getFields",
    "documentTemplate.list",
    "factoryStockGuard.get",
    "fcSummary.raw.get",
    "fcSummary.workspace.get",
    "finalizeShipmentFinalOutput",
    "fxRateBook.get",
    "gapJob.status.get",
    "generateShipmentLineAllocations",
    "getClientCapabilities",
    "getOperationDb",
    "getRecommendationDraftToken",
    "getShipmentFinalOutput",
    "getShippingAllocationDraftWorkspace",
    "getShippingMethodCandidates",
    "getTable",
    "import.commit",
    "import.history.list",
    "import.receipt.get",
    "import.template.get",
    "import.validate",
    "importCarrierRateCards",
    "importFcRegularForecastBatch",
    "importFcSpecialEventsBatch",
    "importMarketplaceSkusBatch",
    "importOverseasInventorySnapshotBatch",
    "inventoryReplenishment.workspace.get",
    "inventoryReplenishmentGap.get",
    "inventoryReplenishmentGap.job.cancel",
    "inventoryReplenishmentGap.job.start",
    "inventoryReplenishmentGap.recalculate.all",
    "inventoryScope.registry.get",
    "leadTime.raw.get",
    "openPoRemaining.raw.get",
    "orderPlanningGap.get",
    "orderPlanningGap.job.cancel",
    "orderPlanningGap.job.start",
    "orderPlanningGap.recalculate.all",
    "overseasStock.workspace.get",
    "factoryInventory.workspace.get",
    "pricing.update",
    "pricing.write.status",
    "productPricing.siteUniverse.get",
    "productPricing.workspace.get",
    "purchaseOrder.workspace.get",
    "rawInventory.get",
    "receivePurchaseOrderLines",
    "recommendation.workspace.get",
    "renderShipmentDocument",
    "replenishmentDemandAllocation.save",
    "requestOrder.allocationDraft.ensureAndEdit",
    "requestOrder.send.orchestrate",
    "requestOrder.send.status",
    "requestOrder.sendWorkset.get",
    "requestOrder.workspace.get",
    "requestOrderDraft.getActive",
    "shipment.assignCarrier",
    "shipment.consolidationPolicy.get",
    "shipment.consolidationPolicy.save",
    "shipment.documentValues.check",
    "shipment.eta.update",
    "shipment.rateCardOptions",
    "shipment.receipt.diagnose",
    "shipment.receipt.update",
    "shipment.removePlanFromConsolidated",
    "shipment.route.advance",
    "shipment.selectRateCard",
    "shipment.workspace.get",
    "shipmentDocument.generate",
    "shipmentDocument.get",
    "shipmentDocument.list",
    "shippingPlan.rateCardOptions",
    "shippingPlan.selectRateCard",
    "siteSku.planning.list",
    "siteSku.planning.update",
    "skuDetails.workspace.get",
    "submitAllocationDraftsToShippingPlans",
    "submitRequestOrderAllocationDrafts",
    "submitShippingAllocationDrafts",
    "syncMarketplaceSkusToSkuRegionalDetails",
    "system.health",
    "system.sourceRevision",
    "updateMarketplaceSkuModel",
    "updatePurchaseOrderHeader",
    "updatePurchaseOrderLine",
    "updatePurchaseOrderStatus",
    "updateRecommendationDecisionLocked",
    "updateRequestOrderLineQty",
    "updateRequestOrderStatus",
    "updateShipment",
    "updateShippingPlanLineQty",
    "shippingPlan.mixedCartons.save",
    "updateShippingPlanStatus",
    "updateSkuLifecycle",
    "upsertCampaign",
    "upsertCampaignSkuLines",
    "upsertFcSpecialEvent",
    "upsertFcTargetRule",
    "upsertMarketplace",
    "upsertMarketplaceSku",
    "upsertRequestOrderAllocationDraft",
    "upsertRequestOrderAllocationDraftLines",
    "upsertRequestOrderSiteConfirmations",
    "upsertShippingAllocationDraft",
    "upsertShippingAllocationDraftAtomic",
    "upsertShippingAllocationDraftLines",
    "upsertSkuDetail",
    "upsertSkuRegionalDetail",
    "upsertTaxRateComponent",
    "upsertTaxReferralRate",
    "warehouseAllocation.get",
    "weeklyShipping.workspace.get",
    "campaign.builder.get",
    "campaign.builder.status",
    "campaign.builder.save"
  ],
  "reads": [
    "aiPlanFirstLayer.get",
    "automationSchedule.get",
    "document.diagnostic.shipment",
    "document.export",
    "document.exportNonce",
    "document.get",
    "factoryStockGuard.get",
    "fcSummary.raw.get",
    "fcSummary.workspace.get",
    "fxRateBook.get",
    "gapJob.status.get",
    "getClientCapabilities",
    "getOperationDb",
    "getRecommendationDraftToken",
    "getShipmentFinalOutput",
    "getShippingAllocationDraftWorkspace",
    "getShippingMethodCandidates",
    "getTable",
    "import.history.list",
    "import.receipt.get",
    "import.template.get",
    "import.validate",
    "inventoryReplenishment.workspace.get",
    "inventoryReplenishmentGap.get",
    "inventoryScope.registry.get",
    "leadTime.raw.get",
    "openPoRemaining.raw.get",
    "orderPlanningGap.get",
    "overseasStock.workspace.get",
    "factoryInventory.workspace.get",
    "pricing.write.status",
    "productPricing.siteUniverse.get",
    "productPricing.workspace.get",
    "purchaseOrder.workspace.get",
    "rawInventory.get",
    "recommendation.workspace.get",
    "requestOrder.send.status",
    "requestOrder.sendWorkset.get",
    "requestOrder.workspace.get",
    "requestOrderDraft.getActive",
    "shipment.consolidationPolicy.get",
    "shipment.documentValues.check",
    "shipment.rateCardOptions",
    "shipment.receipt.diagnose",
    "shipment.workspace.get",
    "shipmentDocument.get",
    "shippingPlan.rateCardOptions",
    "siteSku.planning.list",
    "skuDetails.workspace.get",
    "system.health",
    "system.sourceRevision",
    "warehouseAllocation.get",
    "weeklyShipping.workspace.get",
    "campaign.builder.get",
    "campaign.builder.status"
  ],
  "blocked": [
    "adjustFactoryInventory",
    "automationSchedule.update",
    "backfillFcSpecialEventIds",
    "carrierLeadTime.duplicateCensus",
    "document.diagnostic.purchaseOrder",
    "factoryInventory.import.commit",
    "factoryInventory.import.validate",
    "factoryOperationConfig.get",
    "factoryOperationConfig.save",
    "flowASchemaLineagePreflight",
    "fxRateBook.save",
    "generateRecommendationDraftLocked",
    "marketplace.allocationPriority.set",
    "overseasAllocationPreview.job.cancel",
    "overseasAllocationPreview.job.start",
    "overseasAllocationPreview.job.status",
    "overseasAllocationPreview.result.get",
    "pricing.fxReconcile",
    "requestOrderDraft.generateFromGap",
    "requestOrderDraft.job.cancel",
    "requestOrderDraft.job.continue",
    "requestOrderDraft.job.start",
    "requestOrderDraft.job.status",
    "retireShipmentLabelColumns",
    "runAmazonSnapshotImports",
    "seedSinotransCarrier",
    "system.allocationDraftIdentityDiagnostic",
    "system.executionPlanConflictDiagnostic",
    "system.executionPlanDuplicateLineDiagnostic",
    "system.requestOrderSendDiagnostic",
    "system.requestOrderSendDiagnosticStatus",
    "system.requestOrderSendReconcile",
    "system.shippingAllocationDraftDiagnostic",
    "system.shippingAllocationSchemaDiagnostic",
    "system.submitFlowDiagnostic",
    "system.twoVerticalFlowsDiagnostic",
    "weeklyAiPlan.generate"
  ],
  "import_domain": "po_factory_stock",
  "import_modes": [
    "NEW_RECEIPT",
    "OPENING_PO_FOR_EXISTING_STOCK",
    "UPDATE_REMAINING"
  ],
  "administration_enabled": false,
  "ai_plan_enabled": false,
  "module_stamps": [
    {"symbol":"PARTY_BUILD_VERSION_","expected":"PARTY-WAREHOUSE-DESTINATION-20261126-V1","optional":false},
    {
      "symbol": "CORE_DB_BUILD_VERSION_",
      "expected": "CORE-DB-RATE-VERSION-20261126",
      "optional": false
    },
    {
      "symbol": "CRC_QUICK_BUILD_VERSION_",
      "expected": "CRC-QUICK-V2-20261126",
      "optional": false
    },
    {
      "symbol": "RAEE_BUILD_VERSION_",
      "expected": "MANUAL-ALLOCATION-20261124",
      "optional": false
    },
    {
      "symbol": "SHIP_WS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-SO7-DG1-TD1",
      "optional": false
    },
    {
      "symbol": "SHIP_RECEIPT_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-SO8-AFINAL4-A2ROUTE-AD1B-AD2-AD3",
      "optional": false
    },
    {
      "symbol": "SLA_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD3",
      "optional": false
    },
    {
      "symbol": "GAP_MAT_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD1B",
      "optional": false
    },
    {
      "symbol": "RPR_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72",
      "optional": false
    },
    {
      "symbol": "WAREHOUSE_ALLOCATION_CONFIG_BUILD_VERSION_",
      "expected": "F1-7N-D-2k-R1-D5V3R5B-WA1",
      "optional": false
    },
    {
      "symbol": "DGS_PRODUCTION_PROFILE_BUILD_VERSION_",
      "expected": "PROD1-DGS-20261112-AD3-DW1-DW2-MC1-WH1-DG1-EUD1",
      "optional": false
    },
    {
      "symbol": "CARRIER_LAYOUT_BUILD_VERSION_",
      "expected": "SC2-CLT-20261111",
      "optional": false
    },
    {
      "symbol": "DOCUMENT_LAYOUT_BUILD_VERSION_",
      "expected": "SC2-DTF-20261111-WH1-CS1",
      "optional": false
    },
    {
      "symbol": "PA_BUILD_VERSION_",
      "expected": "PA1-SBX-R1-20261111-PROD1",
      "optional": false
    },
    {
      "symbol": "SSK_BUILD_VERSION_",
      "expected": "SSK1-SBX-R2-20261111",
      "optional": false
    },
    {
      "symbol": "IMB_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-PFI2-WDL1-SBX-SO5-CB1",
      "optional": false
    },
    {
      "symbol": "PFI_BUILD_VERSION_",
      "expected": "PFI1-R2-SBX-20261111-AF1-IU1-IU2-IU4-PG12R3-JR4",
      "optional": false
    },
    {
      "symbol": "WDL_BUILD_VERSION_",
      "expected": "WDL1-AUTO-REPRICE-20261126-V2",
      "optional": false
    },
    {
      "symbol": "PMI_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-AF1",
      "optional": false
    },
    {
      "symbol": "SHI_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SO8-AFINAL3-A2ROUTE-AD1B-AD2-AD3-MC1",
      "optional": false
    },
    {
      "symbol": "RTI_BUILD_VERSION_",
      "expected": "ROUTE-INIT-A2ROUTE-OD1-RV1-AD2-AD3",
      "optional": false
    },
    {
      "symbol": "IMI_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-IU2-IU3",
      "optional": false
    },
    {
      "symbol": "SYS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-S2-TAX1-DOC1-CP1-CP2-CP2A-CP2B-CP2C-PFI2-WDL1-SBX-PA1-SSK1-R2-AF1-FCA1-SC1R2-SC2-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1",
      "optional": false
    },
    {
      "symbol": "PRW_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25",
      "optional": false
    },
    {
      "symbol": "FCSWS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32",
      "optional": false
    },
    {
      "symbol": "CONFIG_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51",
      "optional": false
    },
    {
      "symbol": "WAP_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64-V3B4-A2D14C-AD1B-AD3",
      "optional": false
    },
    {
      "symbol": "SIR_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R56-DS1",
      "optional": false
    },
    {
      "symbol": "OSW_BUILD_VERSION_",
      "expected": "WAREHOUSE-LIFECYCLE-20261125-V1",
      "optional": false
    },
    {
      "symbol": "FIW_BUILD_VERSION_",
      "expected": "WAREHOUSE-LIFECYCLE-20261125-V1",
      "optional": false
    },
    {
      "symbol": "PPW_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
      "optional": false
    },
    {
      "symbol": "ROS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
      "optional": false
    },
    {
      "symbol": "FSG_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1-AD1B-DW1",
      "optional": false
    },
    {
      "symbol": "ADI_BUILD_VERSION_",
      "expected": "F1-7N-FB-3C",
      "optional": false
    },
    {
      "symbol": "EPC_BUILD_VERSION_",
      "expected": "F1-7N-FB-4E-R2",
      "optional": false
    },
    {
      "symbol": "SFO_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1L-R15G-TAX1-DOC1-AD3-DW1-MC1-WH1",
      "optional": false
    },
    {
      "symbol": "SDR_BUILD_VERSION_",
      "expected": "F1-AD3-SDR1-MC1",
      "optional": false
    },
    {
      "symbol": "SAD_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-A2SUB16V3-AD1B-AD3-DW2",
      "optional": false
    },
    {
      "symbol": "RIC_BUILD_VERSION_",
      "expected": "F1-7N-FB-4F-B3",
      "optional": false
    },
    {
      "symbol": "SP_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-WDL1-SBX-AF1-AD3-AD4-DW1-DW2-MC1",
      "optional": false
    },
    {
      "symbol": "FSTX_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71",
      "optional": false
    },
    {
      "symbol": "OVERSEAS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71",
      "optional": false
    },
    {
      "symbol": "SHIPMENT_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-CP1-SC1R2-SCF1-N01-AD1B-AD3-AD4-DW1-DW2-MC1-REVIEW1-EUD1-NR1",
      "optional": false
    },
    {
      "symbol": "PROC_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SC1R2-SC2-PG12R3-JR4-SO8-AD3",
      "optional": false
    },
    {
      "symbol": "FCREG_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55-FCA1",
      "optional": false
    },
    {
      "symbol": "FCW_BUILD_VERSION_",
      "expected": "FCW-CAMPAIGN-NORMAL-20261125-V1",
      "optional": false
    },
    {
      "symbol": "CAMPAIGN_BUILD_VERSION_",
      "expected": "CAMPAIGN-BUILDER-APPEND-20261126-V2",
      "optional": false
    },
    {
      "symbol": "FX_BOOK_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55",
      "optional": false
    },
    {
      "symbol": "OAP_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51-AD1B",
      "optional": false
    },
    {
      "symbol": "RECO_WS_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R68-R15G-AV1-V3A10-A2B12-AD1B",
      "optional": false
    },
    {
      "symbol": "KM_BUNDLE_CONTENT_HASH_",
      "expected": "a2899f18b09e16b24292dc49718b1b2003e726fbe85fa88741eb73e8efc81518",
      "optional": false
    },
    {
      "symbol": "CSD_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-AD1B-AD2-AD3",
      "optional": false
    },
    {
      "symbol": "RTR_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1F-R15F2-R15G-CP2C-PFI2-PA1-SSK1-R1-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1",
      "optional": false
    },
    {
      "symbol": "MD_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52",
      "optional": false
    },
    {
      "symbol": "RECGEN_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R57",
      "optional": false
    },
    {
      "symbol": "APL_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
      "optional": false
    },
    {
      "symbol": "SKD_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21",
      "optional": false
    },
    {
      "symbol": "ROSEND_DIAG_BUILD_VERSION_",
      "expected": "F1-7N-FB-4G-A2-R4",
      "optional": false
    },
    {
      "symbol": "AIPL_BUILD_VERSION_",
      "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R1-V3B3",
      "optional": false
    },
    {
      "symbol": "TEMP_AIMIG_BUILD_VERSION_",
      "expected": "F1-7N-FB-4C-ADDENDUM-MIGRATION",
      "optional": true
    },
    {
      "symbol": "DFO_BUILD_VERSION_",
      "expected": "DW2-RENDERER-20261122",
      "optional": false
    }
  ],
  "import_scopes": {
    "po_factory_stock": [
      "NEW_RECEIPT",
      "OPENING_PO_FOR_EXISTING_STOCK",
      "UPDATE_REMAINING"
    ],
    "overseas_inventory": [
      "SET",
      "ADD"
    ],
    "shipment": [
      "ADD_NEW",
      "UPDATE",
      "ROUTE_INIT"
    ]
  },
  "policy_sha256": "f1e0bdd348032e242d335b2e4496e573734672849237069cb23fff0f256b8762"
};
function rtrProductionRequestBody_(e) {
  var p = e && e.parameter || {};
  if (['access_session', 'password', 'password_key', 'km_ct'].some(function (k) { return Object.prototype.hasOwnProperty.call(p, k); })) {
    return { error: { success: false, code: 'PRODUCTION_CREDENTIAL_IN_URL', zero_write: true } };
  }
  var body;
  try { body = JSON.parse(e && e.postData && e.postData.contents || ''); } catch (ignore) {
    return { error: { success: false, code: 'INVALID_REQUEST_BODY', zero_write: true } };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action !== 'string' || !body.action ||
      (p.action && p.action !== body.action)) return { error: { success: false, code: 'REQUEST_ACTION_MISMATCH', zero_write: true } };
  return { body: body };
}
function rtrProductionTargetCheck_() {
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active || rtrSha256Hex_(active.getId()).slice(0, 16) !== RTR_PRODUCTION_PROFILE_.db_fp ||
        active.getId() !== prodExpectedDbId_()) return { code: 'PRODUCTION_TARGET_MISMATCH' };
  } catch (ignore) { return { code: 'PRODUCTION_TARGET_UNAVAILABLE' }; }
  if (typeof sysGlobalValue_ !== 'function') return { code: 'PRODUCTION_MODULE_MISMATCH' };
  var wrong = RTR_PRODUCTION_PROFILE_.module_stamps.filter(function (m) {
    var value = sysGlobalValue_(m.symbol);
    return value == null ? !m.optional : String(value) !== m.expected;
  });
  if (wrong.length) return { code: 'PRODUCTION_MODULE_MISMATCH', modules: wrong.map(function (m) { return m.symbol; }) };
  if (typeof requestOrderDraftV2FlatCutoverEnabled_ !== 'function' || requestOrderDraftV2FlatCutoverEnabled_() !== true) return { code: 'PRODUCTION_FLAT_V2_REQUIRED' };
  return null;
}
function rtrProductionGateInfo_() {
  var ready = !rtrProductionTargetCheck_();
  return { environment: 'KM_PRODUCTION', profile_id: RTR_PRODUCTION_PROFILE_.profile_id,
    policy_sha256: RTR_PRODUCTION_PROFILE_.policy_sha256, db_fp: RTR_PRODUCTION_PROFILE_.db_fp,
    bound_equals_constant: ready, module_stamps_ok: ready, flat_v2: ready, administration_enabled: false, ai_plan_enabled: false };
}
function rtrWithProductionGate_(out) {
  var j;
  try { j = JSON.parse(out.getContent()); } catch (ignore) { return out; }
  j.production_gate = rtrProductionGateInfo_();
  if (j.data) { j.data.inventoryAiPlanDbGenerationEnabled = false; j.data.productionProfile = RTR_PRODUCTION_PROFILE_.profile_id; }
  return jsonResponse_(j);
}
function rtrShipmentDocumentRetryScope_(body) {
  return !!body && !Array.isArray(body) && body.related_entity_type === 'shipment' &&
    typeof body.related_entity_id === 'string' && !!body.related_entity_id.trim() &&
    ['entity_type', 'entity_id', 'shipment_id', 'purchase_order_id'].every(function (k) { return !Object.prototype.hasOwnProperty.call(body, k); });
}
function rtrActionGate_(action, body) {
  if (RTR_PRODUCTION_PROFILE_.allowed.indexOf(String(action || '')) < 0) return { code: 'PRODUCTION_ACTION_NOT_ENABLED' };
  if (action === 'updateRecommendationDecisionLocked' && !rtrMonthlyAllocationEditScope_(body)) return { code: 'PRODUCTION_ALLOCATION_EDIT_SCOPE_REFUSED' };
  if (action === 'document.retry' && !rtrShipmentDocumentRetryScope_(body)) return { code: 'PRODUCTION_DOCUMENT_RETRY_SCOPE_REFUSED' };
  if (/^import\./.test(String(action || '')) && !rtrPoFactoryScope_(action, body)) return { code: 'PRODUCTION_IMPORT_SCOPE_REFUSED' };
  return null;
}
function rtrMonthlyAllocationEditScope_(body) {
  return !!body && body.recommendationType === 'MONTHLY_ORDER' &&
    typeof body.draftId === 'string' && /^RD::MONTHLY_ORDER::\d{4}-\d{2}::/.test(body.draftId) &&
    !body.reconcile && !body.allowInsert && body.expectedToken && typeof body.expectedToken === 'object' && !Array.isArray(body.expectedToken) &&
    Array.isArray(body.edits) && body.edits.length > 0 && body.edits.length <= 3 && body.edits.every(function (edit) {
      if (!edit || Object.keys(edit).some(function (k) { return ['naturalKey', 'fields'].indexOf(k) < 0; })) return false;
      var key = edit.naturalKey, fields = edit.fields;
      return key && ['T1', 'T2', 'T3'].indexOf(key.request_bucket) >= 0 && /^\d{4}-\d{2}$/.test(key.request_month) &&
        Object.keys(key).every(function (k) { return ['request_month', 'request_bucket'].indexOf(k) >= 0; }) &&
        fields && Object.keys(fields).length > 0 && Object.keys(fields).every(function (k) {
          return k === 'order_qty' ? typeof fields[k] === 'number' && isFinite(fields[k]) && fields[k] >= 0 : k === 'note' && typeof fields[k] === 'string';
        });
    });
}
function rtrGateRefusal_(r, handler, action) {
  return jsonResponse_({ success: false, code: r.code, zero_write: true, business_writes: 0,
    handler: handler, action: String(action || ''), modules: r.modules || [], error: 'This action is not available in this release. Nothing was written.' });
}
