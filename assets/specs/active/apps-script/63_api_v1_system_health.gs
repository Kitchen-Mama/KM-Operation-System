

















var SYS_API_CONTRACT_VERSION_ = '1';










































































































































































































































































































































var SYS_DEPLOYMENT_RELEASE_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71';






















































var SYS_BUILD_VERSION_ = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-S2-TAX1-DOC1-CP1-CP2-CP2A-CP2B-CP2C-PFI2-WDL1-SBX-PA1-SSK1-R2-AF1-FCA1-SC1R2-SC2-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1";













var SYS_TRANSPORT_CONTRACT_VERSION_ = 1;










































































var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 24;










































var SYS_REQUIRED_ACTION_LIST_VERSION_ = 20;




var SYS_REQUIRED_ACTIONS_ = [
{ action: 'auth.config', handler: 'paControl_', used_by: 'Password login configuration only' },
{ action: 'auth.login', handler: 'paControl_', used_by: 'Password login' },
{ action: 'auth.logout', handler: 'paControl_', used_by: 'Session revocation' },
{ action: 'siteSku.planning.list', handler: 'handleSiteSkuPlanningList_', used_by: 'Site Inventory scoped SKU editor' },
{ action: 'siteSku.planning.update', handler: 'handleSiteSkuPlanningUpdate_', used_by: 'Site Inventory model and sales status only' },



{ action: 'fxRateBook.get', handler: 'handleFxRateBookGet_', used_by: 'FX Rate Book (Administration)' },
{ action: 'fxRateBook.save', handler: 'handleFxRateBookSave_', used_by: 'FX Rate Book save' },
{ action: 'system.sourceRevision', handler: 'handleSourceRevisionGet_', used_by: 'Site Inventory held-answer check' },
{ action: 'weeklyShipping.workspace.get', handler: 'handleWeeklyShippingWorkspaceGet_', used_by: 'Weekly Shipping Plan' },
{ action: 'shipment.workspace.get', handler: 'handleShipmentWorkspaceGet_', used_by: 'Shipment Draft / Overview / Map' },
{ action: 'purchaseOrder.workspace.get', handler: 'handlePurchaseOrderWorkspaceGet_', used_by: 'Purchase Order Workspace' },
{ action: 'inventoryReplenishment.workspace.get', handler: 'handleInventoryReplenishmentWorkspaceGet_', used_by: 'Site Inventory' },


{ action: 'inventoryScope.registry.get', handler: 'handleInventoryScopeRegistryGet_', used_by: 'Site Inventory scope selectors' },
{ action: 'system.shippingAllocationSchemaDiagnostic', handler: 'handleShippingAllocationSchemaDiagnostic_', used_by: 'Execution Plan schema diagnostic' },
{ action: 'system.requestOrderSendDiagnostic', handler: 'handleRequestOrderSendDiagnostic_', used_by: 'Send Request diagnostic' },
{ action: 'system.twoVerticalFlowsDiagnostic', handler: 'handleTwoVerticalFlowsDiagnostic_', used_by: 'Two-vertical flow diagnostic' },
{ action: 'system.requestOrderSendReconcile', handler: 'handleRequestOrderSendReconcile_', used_by: 'Interrupted Send Request reconciliation' },



{ action: 'requestOrder.send.orchestrate', handler: 'handleRequestOrderSendOrchestrate_', used_by: 'Send Request (server orchestration)' },
{ action: 'requestOrder.sendWorkset.get', handler: 'handleRequestOrderSendWorksetGet_', used_by: 'Send Request (slim workset / confirmation counts)' },



{ action: 'requestOrder.send.status', handler: 'handleRequestOrderSendStatus_', used_by: 'Send Request (reload resume / progress)' },
{ action: 'requestOrder.allocationDraft.ensureAndEdit', handler: 'handleRequestOrderAllocationDraftEnsureAndEdit_', used_by: 'Order Allocation quantity edit (canonical draft create/update)' },
{ action: 'system.allocationDraftIdentityDiagnostic', handler: 'handleAllocationDraftIdentityDiagnostic_', used_by: 'Allocation-draft identity reconciliation (read-only)' },

{ action: 'upsertRequestOrderAllocationDraft', handler: 'handleUpsertRequestOrderAllocationDraft_', used_by: 'Send Request (allocation draft)' },
{ action: 'upsertRequestOrderAllocationDraftLines', handler: 'handleUpsertRequestOrderAllocationDraftLines_', used_by: 'Send Request (allocation lines)' },
{ action: 'submitRequestOrderAllocationDrafts', handler: 'handleSubmitRequestOrderAllocationDrafts_', used_by: 'Send Request (lifecycle advance)' },
{ action: 'createRequestOrderDraft', handler: 'handleCreateRequestOrderDraft_', used_by: 'Send Request (Request Order)' },
{ action: 'createPurchaseOrderFromRequest', handler: 'handleCreatePurchaseOrderFromRequest_', used_by: 'Request Order -> PO Draft' },
{ action: 'requestOrder.workspace.get', handler: 'handleRequestOrderWorkspaceGet_', used_by: 'Request Order Workspace' },


{ action: 'upsertShippingAllocationDraft', handler: 'handleUpsertShippingAllocationDraft_', used_by: 'Execution Plan route save (header)' },
{ action: 'system.executionPlanConflictDiagnostic', handler: 'handleExecutionPlanConflictDiagnostic_', used_by: 'F1-7N-FB-4A §C read-only Execution Plan identity conflict diagnostic' },
{ action: 'system.requestOrderSendDiagnosticStatus', handler: 'handleRequestOrderSendDiagnosticStatus_', used_by: 'F1-7N-FB-4A addendum §G read-only Request Order Send diagnostic ownership + cycle resolution' },
{ action: 'upsertShippingAllocationDraftLines', handler: 'handleUpsertShippingAllocationDraftLines_', used_by: 'Execution Plan route save (lines)' },






{ action: 'upsertShippingAllocationDraftAtomic', handler: 'handleUpsertShippingAllocationDraftAtomic_', used_by: 'Execution Plan route CREATE/UPDATE (atomic header + line)' },
{ action: 'getShippingAllocationDraftWorkspace', handler: 'handleGetShippingAllocationDraftWorkspace_', used_by: 'Execution Plan persisted readback' },
{ action: 'cancelShippingAllocationDraft', handler: 'handleCancelShippingAllocationDraft_', used_by: 'Execution Plan draft cancel' },
{ action: 'system.shippingAllocationDraftDiagnostic', handler: 'handleShippingAllocationDraftDiagnostic_', used_by: 'Execution Plan save diagnostic' },
{ action: 'submitAllocationDraftsToShippingPlans', handler: 'handleSubmitAllocationDraftsToShippingPlans_', used_by: 'Site Inventory Submit Plan' },



{ action: 'factoryStockGuard.get', handler: 'handleFactoryStockGuardGet_', used_by: 'Weekly Shipping Plan factory-availability indicator + operator guard preflight (read only)' },
{ action: 'confirmShipmentAndDispatch', handler: 'handleConfirmShipmentAndDispatch_', used_by: 'Confirm Shipment' },







{ action: 'createShipmentFromPlan', handler: 'handleCreateShipmentFromPlan_', used_by: 'Weekly Shipping Plan -- Retry Shipment Draft (approval recovery)' },






{ action: 'cancelShipmentDraft', handler: 'handleCancelShipmentDraft_', used_by: 'Shipment Draft -- Cancel Shipment Draft (releases the factory stock reservation)' },
{ action: 'updatePurchaseOrderStatus', handler: 'handleUpdatePurchaseOrderStatus_', used_by: 'Send PO' },
{ action: 'document.list', handler: 'handleEntityDocumentList_', used_by: 'Document Panels' },
{ action: 'document.retry', handler: 'handleDocumentRetry_', used_by: 'Document retry' },
{ action: 'document.diagnostic.purchaseOrder', handler: 'handlePoDocumentDiagnostic_', used_by: 'PO diagnostic' },
{ action: 'document.diagnostic.shipment', handler: 'handleShipmentDocumentDiagnostic_', used_by: 'Shipment diagnostic' },
{ action: 'finalizeShipmentFinalOutput', handler: 'handleFinalizeShipmentFinalOutput_', used_by: 'Shipment snapshot' },
{ action: 'import.template.get', handler: 'handleImportTemplateGet_', used_by: 'XLSX import (R67)' },
{ action: 'import.validate', handler: 'handleImportValidate_', used_by: 'XLSX import (R67)' },
{ action: 'import.commit', handler: 'handleImportCommit_', used_by: 'XLSX import (R67)' },
{ action: 'import.receipt.get', handler: 'handleImportReceiptGet_', used_by: 'XLSX import (R67)' },
{ action: 'import.history.list', handler: 'handleImportHistoryList_', used_by: 'XLSX import (R67)' },











{ action: 'shipment.eta.update', handler: 'handleUpdateShipmentEta_', used_by: 'Shipment Map ETA edit (bounded eta-only writer; owner = 31_)' },
{ action: 'shipment.route.advance', handler: 'handleAdvanceShipmentRoutePoint_', used_by: 'Shipment Map route-point advance (owner = 31_)' },
{ action: 'skuDetails.workspace.get', handler: 'handleSkuDetailsWorkspaceGet_', used_by: 'SKU Details / SKU Regional Details scoped read (owner = 59_)' },
{ action: 'system.executionPlanDuplicateLineDiagnostic', handler: 'handleExecutionPlanDuplicateLineDiagnostic_', used_by: 'F1-7N-FB-4E-R2 §3 read-only Execution Plan duplicate-line diagnostic (owner = 68_)' },



{ action: 'overseasStock.workspace.get', handler: 'handleOverseasStockWorkspaceGet_', used_by: 'Overseas Inventory scoped read (owner = 70_)' },






{ action: 'pricing.update', handler: 'handlePricingUpdate_', used_by: 'SKU Regional Details — per-field price editor + price template import (owner = 73_)' },
{ action: 'pricing.write.status', handler: 'handlePricingWriteStatus_', used_by: 'SKU Regional Details — read-only commit-receipt lookup after a lost write response (owner = 73_)' },





{ action: 'marketplace.allocationPriority.set', handler: 'handleSetMarketplaceAllocationPriority_', used_by: 'Site Priority — the bounded allocation_priority writer (canonical-collision refusal + marketplace_id identity guard + mandatory compare-and-set; owner = 03_)' },
{ action: 'upsertMarketplace', handler: 'handleUpsertMarketplace_', used_by: 'Add Marketplace — the marketplace master upsert (owner = 03_)' }







];


var SYS_SLICE_TABLES_ = [
'shipping_allocation_drafts', 'shipping_allocation_draft_lines',
'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'shipment_line_allocations',
'shipment_routes', 'shipment_events', 'shipment_final_output_snapshots', 'shipment_final_output_lines',
'shipment_final_output_line_pos', 'generated_documents', 'document_templates', 'document_template_fields',
'warehouses', 'logistics_locations'
];

function sysStr_(v) { return String(v == null ? '' : v).trim(); }

// SECURITY-63 (R71 layer; the H1 approach + the review improvements): probe names reach this module from an anonymous caller
// (system.health probe_symbols / probe_actions). A name is looked up ONLY after a strict identifier check, ONLY as an OWN property
// of the global object, and ONLY through its property descriptor: no eval, no expression, no inherited name, and a getter is never
// run (an accessor answers present). Top-level function / var declarations are own data properties of the Apps Script V8 global.
var SYS_PROBE_NAME_MAX_ = 128;
var SYS_PROBE_LIST_MAX_ = 256;   // per list (probe_actions, probe_symbols): names past it are not looked up
var SYS_PROBE_NAME_RE_ = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
function sysProbeNameValid_(name) {
return typeof name === 'string' && name.length > 0 && name.length <= SYS_PROBE_NAME_MAX_ && SYS_PROBE_NAME_RE_.test(name);
}
function sysGlobalObject_() {
return (typeof globalThis !== 'undefined') ? globalThis : (function () { return this; })();
}
function sysGlobalOwn_(name) {
if (!sysProbeNameValid_(name)) return undefined;
var d = Object.getOwnPropertyDescriptor(sysGlobalObject_(), name);
if (!d) return undefined;
return ('value' in d) ? d.value : true;
}
function sysHandlerPresent_(name) {
try { return typeof sysGlobalOwn_(name) === 'function'; } catch (e) { return false; }
}


































var SYS_MODULE_BUILD_STAMPS_ = [
  {
    "file": "15_request_allocation_handlers.gs",
    "symbol": "RAEE_BUILD_VERSION_",
    "expected": "MANUAL-ALLOCATION-20261124",
    "owns": "Manual monthly allocation create, tier-month binding and verified flat-row readback"
  },
  {
    "file": "31_shipment_receipt_route_handlers.gs",
    "symbol": "SHIP_RECEIPT_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-SO8-AFINAL4-A2ROUTE-AD1B-AD2-AD3",
    "owns": "shipment receipt (31_ shipment.receipt.update): N1 r2 dispatch-evidence gate, edit-token version guard, zero-write REPLAYED, RECEIPT_SCOPE_UNBOUND; JR5 R4-m1 version claim before the first write"
  },
  {
    "file": "32_shipment_line_allocation_handlers.gs",
    "symbol": "SLA_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD3",
    "owns": "shipment line PO allocation (32_ generate / Confirm execution): SCF1 F3 + legacy-orphan occupancy trace, J-m1/JR4 status decision table, J-m4 SHIPMENT_CANCEL_INCOMPLETE / R3-m3 SHIPMENT_ALLOCATION_STATE_INCONSISTENT; JR5 cancel trace bound to the 12_ F1 writer"
  },
  {
    "file": "43_api_v1_gap_materialization.gs",
    "symbol": "GAP_MAT_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD1B",
    "owns": "gap materialization (43_): D5-V3 r5h (V3 gap lines, token flags); joint-r6 R72 pin (Owner pinsAll 2026-11-18)"
  },
  {
    "file": "23_recommendation_persistence_repository.gs",
    "symbol": "RPR_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72",
    "owns": "recommendation persistence repository (23_): BV1; joint-r6 R72 pin (Owner pinsAll 2026-11-18)"
  },
  {
    "file": "50_api_v1_warehouse_allocation_config.gs",
    "symbol": "WAREHOUSE_ALLOCATION_CONFIG_BUILD_VERSION_",
    "expected": "F1-7N-D-2k-R1-D5V3R5B-WA1",
    "owns": "warehouse allocation config (50_ layer-50): D5-V3; declared stamp pinned so a half-synced 50_ is visible (Owner pinsAll 2026-11-18)"
  },
  {
    "file": "39_document_runtime_service.gs",
    "symbol": "DGS_PRODUCTION_PROFILE_BUILD_VERSION_",
    "expected": "PROD1-DGS-20261112-AD3-DW1-DW2",
    "owns": "Production profile; Sandbox single-ticket recovery disabled"
  },
  {
    "file": "17_carrier_handlers.gs",
    "symbol": "CARRIER_LAYOUT_BUILD_VERSION_",
    "expected": "SC2-CLT-20261111",
    "owns": "exact known carrier lead time physical layout compatibility"
  },
  {
    "file": "36_document_template_handlers.gs",
    "symbol": "DOCUMENT_LAYOUT_BUILD_VERSION_",
    "expected": "SC2-DTF-20261111",
    "owns": "exact known document template field physical layout compatibility"
  },
  {
    "file": "84_password_access.gs",
    "symbol": "PA_BUILD_VERSION_",
    "expected": "PA1-SBX-R1-20261111-PROD1",
    "owns": "shared-password session authentication; configuration fails closed"
  },
  {
    "file": "86_site_sku_planning.gs",
    "symbol": "SSK_BUILD_VERSION_",
    "expected": "SSK1-SBX-R2-20261111",
    "owns": "scoped version-checked two-field Site SKU edit"
  },
  {
    "file": "78_api_v1_import_batch.gs",
    "symbol": "IMB_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-PFI2-WDL1-SBX-SO5",
    "owns": "shared import journal including Draft line removal undo and unknown-outcome marker"
  },
  {
    "file": "82_api_v1_po_factory_import.gs",
    "symbol": "PFI_BUILD_VERSION_",
    "expected": "PFI1-R2-SBX-20261111-AF1-IU1-IU2-IU4-PG12R3-JR4",
    "owns": "local shared PO and factory stock import; activation pending"
  },
  {
    "file": "83_api_v1_weekly_draft_lines.gs",
    "symbol": "WDL_BUILD_VERSION_",
    "expected": "WDL1-SBX-20261111-AF1",
    "owns": "Draft-only quantity/add/remove SKU transaction; Pending Approval read-only"
  },
  {
    "file": "79_api_v1_po_import.gs",
    "symbol": "PMI_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-AF1",
    "owns": "Purchase Order import: opening / historical Add New, id-based Update with row_version"
  },
  {
    "file": "80_api_v1_shipment_import.gs",
    "symbol": "SHI_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SO8-AFINAL3-A2ROUTE-AD1B-AD2-AD3",
    "owns": "Shipment import: opening / historical Add New, id-based Update on a tracking / notes whitelist"
  },
  {
    "file": "87_api_v1_shipment_route_init.gs",
    "symbol": "RTI_BUILD_VERSION_",
    "expected": "ROUTE-INIT-A2ROUTE-OD1-RV1-AD2-AD3",
    "owns": "Imported-tracking route snapshot + one reported position (Add New position, ROUTE_INIT); audited COMMITTED proof read by 31_"
  },
  {
    "file": "81_api_v1_inventory_import.gs",
    "symbol": "IMI_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-IU2-IU3",
    "owns": "Factory / Overseas inventory import: SET and ADD through the 21_ / 05_ authorities"
  },
  {
    "file": "63_api_v1_system_health.gs",
    "symbol": "SYS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-S2-TAX1-DOC1-CP1-CP2-CP2A-CP2B-CP2C-PFI2-WDL1-SBX-PA1-SSK1-R2-AF1-FCA1-SC1R2-SC2-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1",
    "owns": "this module: deployment identity, health and local PFI2/WDL1 dependency stamps"
  },
  {
    "file": "73_api_v1_pricing_write.gs",
    "symbol": "PRW_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R25",
    "owns": "the canonical pricing write AND the FX reconciliation: field-level manual ownership (three-state, blank = UNKNOWN), the per-field MANUAL / USE AUTO / NO_CHANGE contract, batch validation with zero writes until every line passes, the pricing_change_log audit writer with typed change_type, the frozen FX storage-precision table, and the auto_* rebuild that refreshes an effective price only where that field explicitly says AUTO"
  },
  {
    "file": "57_api_v1_shipment_workspace.gs",
    "symbol": "SHIP_WS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-SO7",
    "owns": "the Shipment READ workspace (shipment.workspace.get) incl. the SHIP-OPEN opening-record DTO fields recordOrigin / openingAsOf / openingSupplyMode"
  },
  {
    "file": "58_api_v1_fc_summary_workspace.gs",
    "symbol": "FCSWS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32",
    "owns": "the FC Summary READ workspace: the four primary-render tables, the bootstrap/regular/events/rules slices on one action, the server-derived filter facets that keep the page's non-cascading universes intact, one Sheets read per sheet per request, and the scoped pricing projection the Special Event group-card builder reads instead of the whole price list"
  },
  {
    "file": "00_config.gs",
    "symbol": "CONFIG_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51",
    "owns": "global constants + the feature flags of record (incl. Inventory AI Plan DB generation and, from R51, OVERSEAS_ALLOCATION_PREVIEW_ENABLED_ — the staged-OFF gate the four Preview actions check before any database is opened)"
  },
  {
    "file": "61_api_v1_weekly_ai_plan.gs",
    "symbol": "WAP_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64-V3B4-A2D14C-AD1B-AD3",
    "owns": "weekly AI Plan harvest + canonical readiness refusal + K2 generation + the KMFCN forecast normalization gate"
  },
  {
    "file": "60_api_v1_inventory_replenishment_workspace.gs",
    "symbol": "SIR_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R56-DS1",
    "owns": "the inventory workspace read + the recentWindow/only request contract + the per-table timing that names the expensive sheet + the R6-R5 router-entry/stage evidence that makes a timed-out read locatable in the execution log. R42 adds the SITE SCOPE: an exposure-only request may carry siteScope{company,country,marketplace} and is answered with a lineage reachability closure over the six exposure tables instead of every row of them. A pre-R42 copy ignores the field SILENTLY and returns every site - the same class of fault the recentWindow echo was added for, which is why this row exists rather than a comment. R43 makes ONE range read per table instead of two or three: the header validators now receive row 0 of the full-sheet read the handler already performs, so thirteen tables cost thirteen reads rather than thirty. Nothing in the request or the response moved, which is why a pre-R43 copy is SLOW rather than WRONG - and why this row is the only way an acceptance can tell which deployment it measured. R44 replaces the thirteen first-layer SpreadsheetApp reads with ONE Sheets.Spreadsheets.get and ONE Values.batchGet - measured 22,006 ms to 2,265 ms in Production. A pre-R44 copy is again merely SLOW, but this row carries a SECOND fact now: R44 is the first release whose read path depends on an ADVANCED SERVICE, so a project missing Sheets v4 does not run this file slowly, it cannot run its primary read at all - which is why runtime_authority.advanced_services attests the service by EXECUTION rather than by reading a manifest that may not be the one deployed. R45 repairs what the R44 acceptance itself caught: the declared date columns were converted with two Utilities calls per cell, which cost 74,621 ms of an 83,465 ms read while the Sheets call itself cost 3,110. The conversion is unchanged in output and now probes the spreadsheet timezone once per DISTINCT YEAR instead, falling back to the per-cell path for any year whose offset it cannot prove constant - so a pre-R45 copy is SLOW rather than wrong, and dateCellsConverted beside tzProbeCalls in the diagnostics is how an acceptance tells which one it measured, because the R44 ratio is exactly two calls per cell. R56 echoes the source revision the read started under (meta.sourceRevision)."
  },
  {
    "file": "70_api_v1_overseas_stock_workspace.gs",
    "symbol": "OSW_BUILD_VERSION_",
    "expected": "F1-7N-FB-4E-R3",
    "owns": "Overseas Stock scoped read workspace"
  },
  {
    "file": "72_api_v1_product_pricing_workspace.gs",
    "symbol": "PPW_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
    "owns": "the site-scoped Product Pricing workspace read: the marketplace_skus membership universe, the four-part regional join, the marketplace_sku_id pricing join, and the scoped category/series filter options derived from surviving rows"
  },
  {
    "file": "66_api_v1_request_order_send.gs",
    "symbol": "ROS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
    "owns": "Request Order Send orchestration + planning-cycle authority"
  },
  {
    "file": "71_api_v1_factory_stock_guard.gs",
    "symbol": "FSG_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1-AD1B-DW1",
    "owns": "the shared factory stock guard seam: the one pooled availability read, the AI hard-guard entry, the plan overage challenge/confirm gate, the REQUIRED (never lazily created) override audit ledger, and the journalled verified rollback the plan transition unwinds through"
  },
  {
    "file": "67_api_v1_allocation_draft_identity.gs",
    "symbol": "ADI_BUILD_VERSION_",
    "expected": "F1-7N-FB-3C",
    "owns": "allocation-draft identity diagnostic (unchanged since FB-3C)"
  },
  {
    "file": "68_api_v1_execution_plan_conflict_diagnostic.gs",
    "symbol": "EPC_BUILD_VERSION_",
    "expected": "F1-7N-FB-4E-R2",
    "owns": "Execution Plan identity conflict diagnostic + routed read-only duplicate-line diagnostic"
  },
  {
    "file": "34_shipment_final_output_handlers.gs",
    "symbol": "SFO_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1L-R15G-TAX1-DOC1-AD3-DW1",
    "owns": "Shipment final output snapshot (frozen document data). SANDBOX-GATE-1l: an unknown measure is UNKNOWN, never 0."
  },
  {
    "file": "35_shipment_document_renderer.gs",
    "symbol": "SDR_BUILD_VERSION_",
    "expected": "F1-AD3-SDR1",
    "owns": "Shipment document renderer (35_): document models; AD3 B round 5 Shipment Details fallback model (carrier / freight pending when unknown)"
  },
  {
    "file": "16_shipping_allocation_handlers.gs",
    "symbol": "SAD_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-A2SUB16V3-AD1B-AD3-DW2",
    "owns": "Execution Plan allocation draft header/line writer (schema-compatible 30..35 header / 30..31 line, route group keys). R56: Submit Plan resolves a blank site_sku before it commits and verifies (DC2-D5)."
  },
  {
    "file": "69_api_v1_route_identity_contract.gs",
    "symbol": "RIC_BUILD_VERSION_",
    "expected": "F1-7N-FB-4F-B3",
    "owns": "frozen route identity contract (canonical service, destination XOR, K4 key, typed schema refusals)"
  },
  {
    "file": "11_shipping_plan_handlers.gs",
    "symbol": "SP_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-WDL1-SBX-AF1-AD3-AD4-DW1-DW2",
    "owns": "Weekly status/quantity owner plus Draft SKU command delegation and unresolved transaction guard"
  },
  {
    "file": "21_factory_inventory_handlers.gs",
    "symbol": "FSTX_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71",
    "owns": "THE single factory_stock mutation authority + the canonical seven-type movement vocabulary + reserved-balance reconciliation"
  },
  {
    "file": "05_overseas_inventory_handlers.gs",
    "symbol": "OVERSEAS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71",
    "owns": "the overseas inventory snapshot import (GROSS semantic: stored available = source available - the reservation this system holds, the row refused IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE when the source reports fewer units than are already committed, and wh_reserved_stock never written by an import), the inventory adjustment handler, and the OVERSEAS RESERVATION LIFECYCLE — acquire / release / dispatch-consume over wh_available_stock and wh_reserved_stock, with ovsAllocatableTx_ as the single place the allocatable rule is written"
  },
  {
    "file": "12_shipment_handlers.gs",
    "symbol": "SHIPMENT_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-CP1-SC1R2-SCF1-N01-AD1B-AD3-AD4-DW1-DW2",
    "owns": "Shipment Draft creation + reservation acquire, pre-dispatch cancellation + reservation release, and the updateShipment status allowlist. R33 adds SOURCE DOMAIN ROUTING: the sufficiency precheck, the acquire, the cancellation release and the source-warehouse change each ask whether the source warehouse is FACTORY or OVERSEAS and forward to that domain lifecycle — composed, never merged, because factory availability is derived (current - reserved) and overseas availability is stored. A cross-domain source change is REFUSED rather than guessed"
  },
  {
    "file": "13_procurement_handlers.gs",
    "symbol": "PROC_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SC1R2-SC2-PG12R3-JR4-SO8-AD3",
    "owns": "PO receipt factory-stock handoff + the typed PO_RECEIPT_EXCEEDS_REMAINING_QTY refusal (no silent clamp) + the procurement forecast’s per-month Target Rule delegation to the shared KMPD resolver (no local matcher). R56: the receipt dedupe is read in the lock and its content verified (D3), only an issued PO receives (D6), and a PO from Send carries its factory warehouse (D2)."
  },
  {
    "file": "04_marketplace_forecast_import.gs",
    "symbol": "FCREG_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55-FCA1",
    "owns": "the Regular Forecast batch writer: validate-all-before-first-mutation, the script lock over the authoritative read and the writes, column-bounded range writes and the one append block — AND the canonical pricing_list creation contract: base_currency read from sku_details, rate 1 where the currencies are identical and the stored coefficient where they are not - read ONCE per import so a batch cannot mix versions - still fail-closed PENDING_FX when the book holds no rate, and the ownership flags written FALSE at creation so the first reconciliation can finish the row"
  },
  {
    "file": "14_fc_write_handlers.gs",
    "symbol": "FCW_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
    "owns": "the FC Summary write path: fc_special_events upsert/delete with its expected_row_version gate, its one-event-per-SKU-flag-year uniqueness refusal and unchanged short-circuit + the fc_target_rules upsert on the canonical business key, its script lock, its duplicate and identity-mismatch refusals, the single-range row write, and the saved-row receipt"
  },
  {
    "file": "20_campaign_write_handlers.gs",
    "symbol": "CAMPAIGN_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R32",
    "owns": "the campaigns + campaign_sku_lines write path: the canonical window-based campaign identity (company|country|marketplace|year|start_date|end_date), the one-time legacy adoption of a window-less row, the script lock held around the WRITE only (resolve and classify run unlocked, and every zero-write outcome answers without taking it), the duplicate-identity and identity-mismatch refusals, the expected_row_version stale-write gate applied ONLY to a real header mutation, the resolve-and-reuse branch for an identical header, and the per-line unchanged short-circuit"
  },
  {
    "file": "75_api_v1_fx_rate_book.gs",
    "symbol": "FX_BOOK_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R55",
    "owns": "the stored FX rate book: one Script Property holding rates and change history together so a half-written save cannot leave them disagreeing, a UTF-8 byte capacity guard measured BEFORE the write, strict typing of both the stored document and the request doc_version, a compare-and-swap on that version inside the script lock, a readback that refuses to report a save it cannot confirm, and a write authority that fails closed on an unidentifiable caller. It owns NO price formula and NO price: conversion and precision stay in 73_, and saving a rate moves nothing until a reconciliation runs"
  },
  {
    "file": "74_api_v1_overseas_allocation_preview_job.gs",
    "symbol": "OAP_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R51-AD1B",
    "owns": "the READ-ONLY async Overseas Allocation Preview job: lifecycle (start/status/result/cancel + continuation/self-heal), the short-lock discipline that keeps it from starving Gap Materialization on the shared script lock, and the generation-keyed chunked Script-Property result store. It owns NO allocation formula - eligibility comes from 43_, demand from allocatedForecastQty, distribution from KMMSA"
  },
  {
    "file": "42_api_v1_recommendation_workspace.gs",
    "symbol": "RECO_WS_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R68-R15G-AV1-V3A10-A2B12-AD1B",
    "owns": "the recommendation workspace READ transport: two Sheets v4 calls for the twelve tables whose date columns 60_ has proven, the per-sheet reader for the rest, the named refusals for a malformed batch reply, the capped non-silent fallback, and the bounded canonicalRead diagnostic. It owns NO formula and NO line shape - RECO_WS_HANDLER_VERSION_ names that contract and did not move. R56: the day horizons take incoming to their own cutoff (F7, answer dc2-r2-f7) and the read echoes its source revision."
  },
  {
    "file": "90_generated_supply_planning_bundle.gs",
    "symbol": "KM_BUNDLE_CONTENT_HASH_",
    "expected": "9c604f38df99c3a3c399a3a49dd77ad40cdbc8242c9fac67bd281840ee1a2242",
    "owns": "the generated shared-core bundle (60 UMD modules) incl. KMPD.resolveTargetRule — the ONE Target Rule authority every server consumer delegates to; identified by content hash, never by a hand-typed stamp"
  },
  {
    "file": "22_shipment_dispatch_handlers.gs",
    "symbol": "CSD_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-AD1B-AD2-AD3",
    "owns": "Confirm Shipment & Dispatch: deduction + reservation release through the shared authority + the cancelled-shipment dispatch refusal. R33 routes the consume by source domain: a factory line deducts current stock and releases its hold on one row, while an OVERSEAS line moves reserved DOWN and leaves wh_available_stock alone, because those units left available when they were reserved. R37 fixes WHICH warehouse is consumed: the deduct plan is built for the Shipment's DECLARED source_warehouse_id, in the domain that warehouse belongs to, decided before any inventory row is read — it no longer searches factory_stock by SKU and orders the results by warehouse_id, which could deduct a warehouse the Shipment never declared and made an OVERSEAS source unreachable"
  },
  {
    "file": "01_router.gs",
    "symbol": "RTR_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1F-R15F2-R15G-CP2C-PFI2-PA1-SSK1-R1-PROD1-AV1-IU3-IU4N1-PGSC1N1-A2S-SHTPL1-SHTPL2-AFINAL1-AFINAL2-AFINAL3-AFINAL4-A2ROUTE-AD1-AD1B-AD2-AD3-AD4-DS1-DW1-DW2-DR4-MA1",
    "owns": "doGet/doPost action routing (incl. the GET read table + cancelShipmentDraft) + typed handler/method response identity + the R6-R5 per-execution entry stamp handlers report as server evidence. R41 adds factoryStockGuard.get to the GET read table, the last approved read that still travelled on POST. It ADDS NO ACTION - the action already existed on the POST chain and keeps it - so the action-contract version stays at 18. R41 exists rather than R40 absorbing it because R40 was cut against a tree in which this file had not changed. R51 ADDS FOUR ACTIONS (the Overseas Allocation Preview job: start/status/result/cancel), which is why the action-contract version moves 18 -> 19 in this release. R52 ADDS ONE MORE - marketplace.allocationPriority.set - moving the action contract 19 -> 20; a project holding a pre-R52 router cannot route a priority write at all, and because upsertMarketplace simultaneously stops accepting the field, that is a total loss of the capability rather than a degraded one. R56 adds system.sourceRevision (contract 21 -> 22) and moves KM_SOURCE_REVISION after every non-read POST."
  },
  {
    "file": "03_master_data_handlers.gs",
    "symbol": "MD_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R52",
    "owns": "the master-data write surface: the marketplace upsert (Add Marketplace) and, from R52, the bounded marketplace.allocationPriority.set writer - the ONLY writer of marketplaces.allocation_priority, with the canonical-collision refusal, the marketplace_id identity guard, the mandatory compare-and-set and the three-column write limit. R52 also makes upsertMarketplace REFUSE any payload carrying allocation_priority, and puts both writers on the shared script lock the sheet previously had no writer taking"
  },
  {
    "file": "47_api_v1_recommendation_generation.gs",
    "symbol": "RECGEN_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R57",
    "owns": "recommendation generation + the bounded multi-scope order-draft readback. R56: both scheduled runs move the source revision after they run."
  },
  {
    "file": "56_api_v1_ai_plan_first_layer.gs",
    "symbol": "APL_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R64",
    "owns": "Order Planning AI Plan first layer + the KMFSA factory site-allocation share"
  },
  {
    "file": "59_api_v1_sku_details_workspace.gs",
    "symbol": "SKD_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21",
    "owns": "SKU Details / SKU Regional scoped read workspace, incl. the include.pricing site-price table"
  },
  {
    "file": "66_api_v1_request_order_send.gs",
    "symbol": "ROSEND_DIAG_BUILD_VERSION_",
    "expected": "F1-7N-FB-4G-A2-R4",
    "owns": "Request Order Send diagnostic status action + its configuration (single owner)"
  },
  {
    "file": "69_api_v1_ai_plan_lifecycle.gs",
    "symbol": "AIPL_BUILD_VERSION_",
    "expected": "F1-7N-FC-1B-E3-R4-A2-R1-R1-V3B3",
    "owns": "Inventory AI Plan draft lifecycle (expiration of superseded AI drafts)"
  },
  {
    "file": "TEMP_migrate_shipping_allocation_ai_lifecycle.gs",
    "symbol": "TEMP_AIMIG_BUILD_VERSION_",
    "expected": "F1-7N-FB-4C-ADDENDUM-MIGRATION",
    "owns": "AI Plan lifecycle schema migration (append-only columns + source-proven lineage backfill)",
    "optional": true
  },
  {
    "file": "37_shipment_document_file_renderer.gs",
    "symbol": "DFO_BUILD_VERSION_",
    "expected": "DW2-RENDERER-20261122",
    "owns": "Drive renderer: workbook preflight, fill, PDF and read-only probe diagnostics"
  }
];

function sysGlobalValue_(name) {
try { return sysGlobalOwn_(name); }
catch (e) { return undefined; }
}

function sysModuleBuildStamps_() {
var rows = SYS_MODULE_BUILD_STAMPS_.map(function (m) {
var v = sysGlobalValue_(m.symbol);
var present = (v !== undefined && v !== null && String(v) !== '');
return {
file: m.file, symbol: m.symbol, owns: m.owns, optional: m.optional === true,
expected_build: m.expected,
present: present,
declared_build: present ? String(v) : null,
matches_expected: present ? (String(v) === m.expected) : false
};
});


var absent = rows.filter(function (r) { return !r.present && !r.optional; });
var absent_optional = rows.filter(function (r) { return !r.present && r.optional; });
var stale = rows.filter(function (r) { return r.present && !r.matches_expected; });

var runtime = sysRuntimeAuthorityChecks_();
return {
deployment_build: SYS_DEPLOYMENT_RELEASE_,
modules: rows,
runtime_authority: runtime,



advanced_services: runtime.advanced_services || null,
advanced_services_ok: !!(runtime.advanced_services
&& runtime.advanced_services.advanced_sheets_runtime_mode === 'RESOLVED'),
absent_modules: absent.map(function (r) { return r.file; }),
absent_optional_modules: absent_optional.map(function (r) { return r.file; }),
stale_modules: stale.map(function (r) { return r.file + ' declares ' + r.declared_build + ', expected ' + r.expected_build; }),


mixed_deployment: (absent.length + stale.length) > 0 || runtime.uniform !== true,
verdict: ((absent.length + stale.length) === 0 && runtime.uniform === true)
? 'UNIFORM — every probed owner file declares the build its manifest entry expects, AND the writer and '
+ 'lifecycle resolve identically at every known schema generation'
: (runtime.uniform !== true
? 'MIXED_OR_PARTIAL_SYNC (RUNTIME) — ' + runtime.verdict
: 'MIXED_OR_PARTIAL_SYNC — at least one owner file is absent from, or older than, what this deployment expects. Re-copy the files listed and publish a NEW deployment version.')
};
}























function sysRuntimeAuthorityChecks_() {





var out = { checked: false, checks: [], divergent: [], missing_authority: [], uniform: true,
contract: 'where both authorities are present they must resolve the SAME version from the SAME header, at every known generation' };
var haveSad = (typeof sadResolveHeaderSchema_ === 'function');
var haveAipl = (typeof aiplSchemaVersionOf_ === 'function');
if (!haveSad) out.missing_authority.push('sadResolveHeaderSchema_ (16_shipping_allocation_handlers.gs)');
if (!haveAipl) out.missing_authority.push('aiplSchemaVersionOf_ (69_api_v1_ai_plan_lifecycle.gs)');
if (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ === 'undefined'
|| typeof SAD_HEADER_OPTIONAL_TAIL_COLUMNS_ === 'undefined') {
out.missing_authority.push('SHIPPING_ALLOCATION_DRAFTS_HEADERS_ / SAD_HEADER_OPTIONAL_TAIL_COLUMNS_');
}
if (out.missing_authority.length) {

out.verdict = 'RUNTIME_AUTHORITY_NOT_CHECKED — ' + out.missing_authority.join('; ')
+ ' (absent owners are reported by the module manifest, not duplicated here)';
return out;
}
out.checked = true;
var full = SHIPPING_ALLOCATION_DRAFTS_HEADERS_.concat(SAD_HEADER_OPTIONAL_TAIL_COLUMNS_);
var shapes = [];
for (var i = 0; i < (typeof SAD_SCHEMA_GENERATIONS_ !== 'undefined' ? SAD_SCHEMA_GENERATIONS_.length : 0); i++) {
var g = SAD_SCHEMA_GENERATIONS_[i];
shapes.push(SHIPPING_ALLOCATION_DRAFTS_HEADERS_.concat(g.appended || []).length);
}
if (!shapes.length) shapes = [full.length];
shapes.forEach(function (n) {
var hdr = full.slice(0, n);
var w = null, l = null, err = null;
try { w = sadResolveHeaderSchema_(hdr); } catch (e1) { err = String(e1 && e1.message || e1); }
try { l = aiplSchemaVersionOf_(hdr) || null; } catch (e2) { err = (err || '') + ' ' + String(e2 && e2.message || e2); }
var writerVersion = (w && w.ok) ? w.version : null;
var lifecycleComplete = !!(w && w.lifecycle_complete);



var expectLifecycle = (writerVersion && lifecycleComplete) ? writerVersion : null;
var agree = (l === expectLifecycle) && !err;
var row = { column_count: n, writer_version: writerVersion, writer_lifecycle_complete: lifecycleComplete,
lifecycle_version: l, expected_lifecycle_version: expectLifecycle, agree: agree, error: err };
out.checks.push(row);
if (!agree) {
out.uniform = false;
out.divergent.push('at ' + n + ' columns the writer resolves ' + (writerVersion || '(none)')
+ ' and the lifecycle resolves ' + (l || '(none)'));
}
});










var sheetsResolves = false;
try {
sheetsResolves = (typeof Sheets !== 'undefined') && !!(Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values);
} catch (eAdv) { sheetsResolves = false; }
out.advanced_services = {
advanced_sheets_required: true,
advanced_sheets_manifest_expected: { userSymbol: 'Sheets', serviceId: 'sheets', version: 'v4' },
advanced_sheets_runtime_mode: sheetsResolves ? 'RESOLVED' : 'MISSING',
verdict: sheetsResolves
? 'ADVANCED_SHEETS_RESOLVED — the deployment can serve the first-layer read'
: 'ADVANCED_SHEETS_MISSING — add the Sheets v4 advanced service (identifier Sheets) to this Apps Script '
+ 'project; the first-layer read cannot run without it'
};






out.verdict = out.uniform
? 'UNIFORM — the writer and the lifecycle resolve identically at every known schema generation'
: 'RUNTIME_AUTHORITY_DIVERGENCE — the deployed lifecycle body does not share the writer\'s schema authority. '
+ 'Re-copy 69_api_v1_ai_plan_lifecycle.gs (and 16_shipping_allocation_handlers.gs) and publish a NEW '
+ 'deployment version. Version strings may look correct and be stale.';
return out;
}




function sysProbeRequested_(body) {
var dropped = { actions: 0, symbols: 0 };
function arr(v, k) { if (!v) return []; if (!Array.isArray(v)) v = [v]; if (v.length > SYS_PROBE_LIST_MAX_) { dropped[k] = v.length - SYS_PROBE_LIST_MAX_; v = v.slice(0, SYS_PROBE_LIST_MAX_); } return v.map(sysStr_).filter(function (x) { return !!x; }); }
var wantActions = arr(body && (body.probe_actions || body.probeActions), 'actions');
var wantSymbols = arr(body && (body.probe_symbols || body.probeSymbols), 'symbols');
if (!wantActions.length && !wantSymbols.length) return null;
var byAction = {};
for (var i = 0; i < SYS_REQUIRED_ACTIONS_.length; i++) byAction[SYS_REQUIRED_ACTIONS_[i].action] = SYS_REQUIRED_ACTIONS_[i].handler;
var actions = wantActions.map(function (a) {
var handler = Object.prototype.hasOwnProperty.call(byAction, a) ? byAction[a] : null;


var present = handler ? (sysGlobalValue_(handler) !== undefined) : false;
return { action: a, known_to_this_build: !!handler, handler: handler, handler_present: present, available: !!handler && present };
});
var symbols = wantSymbols.map(function (n) { var r = { symbol: n, present: sysGlobalValue_(n) !== undefined }; if (!sysProbeNameValid_(n)) r.rejected = 'PROBE_NAME_INVALID'; return r; });
var missingActions = actions.filter(function (a) { return !a.available; }).map(function (a) { return a.action; });
var missingSymbols = symbols.filter(function (sy) { return !sy.present; }).map(function (sy) { return sy.symbol; });
var sysProbeOut_ = {
requested_by_caller: true,
actions: actions, symbols: symbols,
missing_actions: missingActions, missing_symbols: missingSymbols,
all_present: missingActions.length === 0 && missingSymbols.length === 0 && !dropped.actions && !dropped.symbols,
note: 'Computed against the CALLER\'s list, not against this deployment\'s own required-action list, so it is NOT self-referential.'
};
if (dropped.actions || dropped.symbols) sysProbeOut_.probe_limit = { max_names_per_list: SYS_PROBE_LIST_MAX_, dropped_actions: dropped.actions, dropped_symbols: dropped.symbols, note: 'names past the limit were not looked up; all_present is false' };
return sysProbeOut_;
}

function sysRouterReadiness_() {
var rows = [], missing = [];
for (var i = 0; i < SYS_REQUIRED_ACTIONS_.length; i++) {
var a = SYS_REQUIRED_ACTIONS_[i];
var present = sysHandlerPresent_(a.handler);
rows.push({ action: a.action, available: present, used_by: a.used_by });
if (!present) missing.push(a.action);
}
return { entrypoints: { doGet: sysHandlerPresent_('doGet'), doPost: sysHandlerPresent_('doPost') },
actions: rows, missing_actions: missing, all_available: missing.length === 0 };
}

function sysSchemaReadiness_(ss) {
var out = [], missing = 0;
for (var i = 0; i < SYS_SLICE_TABLES_.length; i++) {
var name = SYS_SLICE_TABLES_[i], sheet = null;
try { sheet = ss.getSheetByName(name); } catch (e) { sheet = null; }
if (!sheet) { out.push({ table: name, present: false, header_count: 0, row_count: 0 }); missing++; continue; }
var lastRow = 0, lastCol = 0;
try { lastRow = sheet.getLastRow(); lastCol = sheet.getLastColumn(); } catch (e2) {}
out.push({ table: name, present: true, header_count: lastCol, row_count: Math.max(0, lastRow - 1) });
}
return { tables: out, missing_table_count: missing, all_present: missing === 0 };
}





function handleSystemHealth_(body) {
var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('HEALTH-' + Utilities.getUuid().substring(0, 8).toUpperCase());
var started = Date.now();
var router = sysRouterReadiness_();
var schema = { tables: [], missing_table_count: null, all_present: null, error: '' };
var dbReachable = false;
try {
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
dbReachable = true;
schema = sysSchemaReadiness_(ss);
} catch (e) {

schema.error = 'DB_NOT_REACHABLE';
}
var ok = router.all_available && dbReachable && schema.all_present === true;
var moduleStamps = sysModuleBuildStamps_();
var callerProbe = sysProbeRequested_(body);
if (moduleStamps.mixed_deployment) ok = false;
if (callerProbe && !callerProbe.all_present) ok = false;
return jsonResponse_({
success: true,
ok: ok,





build_id: SYS_DEPLOYMENT_RELEASE_,
deployment_release: SYS_DEPLOYMENT_RELEASE_,



system_health_module_build: SYS_BUILD_VERSION_,
workspace_module_build: (typeof SIR_BUILD_VERSION_ !== 'undefined') ? SIR_BUILD_VERSION_ : null,
contract_version: SYS_API_CONTRACT_VERSION_,




transport_contract_version: SYS_TRANSPORT_CONTRACT_VERSION_,
router_build: (typeof RTR_BUILD_VERSION_ !== 'undefined') ? RTR_BUILD_VERSION_ : null,
router_response_identity: {
emits_handler: true, emits_received_method: true, emits_post_body_present: true,
emits_action_present_in_query: true, emits_router_build: true
},


handler: (body && body.__km_handler) ? String(body.__km_handler) : 'doPost',
received_method: (body && body.__km_handler === 'doGet') ? 'GET' : 'POST',
request_order_send_diagnostic_owner: (typeof ROSEND_DIAG_OWNER_FILE_ !== 'undefined') ? ROSEND_DIAG_OWNER_FILE_ : null,
deployed_action_contract_version: SYS_DEPLOYED_ACTION_CONTRACT_VERSION_,
inventory_registry_projection_version: (typeof SCOPEREG_PROJECTION_VERSION_ !== 'undefined') ? SCOPEREG_PROJECTION_VERSION_ : null,





inventory_ai_plan_db_generation_enabled: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function')
? (inventoryAiPlanDbGenerationEnabled_() === true) : null,



product_strategy_enabled: (typeof productStrategyEnabled_ === 'function')
? (productStrategyEnabled_() === true) : null,
config_build: (typeof CONFIG_BUILD_VERSION_ !== 'undefined') ? CONFIG_BUILD_VERSION_ : null,
required_action_list_version: SYS_REQUIRED_ACTION_LIST_VERSION_,
required_action_count: SYS_REQUIRED_ACTIONS_.length,


missing_actions_is_self_referential: true,



module_build_stamps: moduleStamps,
mixed_deployment: moduleStamps.mixed_deployment,
deployment_uniformity_verdict: moduleStamps.verdict,
caller_probe: callerProbe,
api_contract_version: SYS_API_CONTRACT_VERSION_,

build_version: SYS_DEPLOYMENT_RELEASE_,
environment_mode: 'production',
router_ready: router.all_available,
entrypoints: router.entrypoints,
required_actions: router.actions,
missing_actions: router.missing_actions,
db_reachable: dbReachable,
schema_ready: schema.all_present,
schema: { missing_table_count: schema.missing_table_count, tables: schema.tables, error: schema.error },
server_timestamp: (typeof shipmentTimestamp_ === 'function') ? shipmentTimestamp_() : new Date().toISOString(),
server_ms: Date.now() - started,
request_id: requestId,
read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0
});
}





function handleSubmitFlowDiagnostic_(body) {
var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('FLOW-' + Utilities.getUuid().substring(0, 8).toUpperCase());
var draftIds = (body && body.allocation_draft_ids) || [];
if (!Array.isArray(draftIds)) draftIds = [draftIds];
draftIds = draftIds.map(sysStr_).filter(function (x) { return !!x; });
var out = {
success: true, request_id: requestId,
read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0,
api_contract_version: SYS_API_CONTRACT_VERSION_, build_version: SYS_DEPLOYMENT_RELEASE_
};
var router = sysRouterReadiness_();
out.router_ready = router.all_available;
out.missing_actions = router.missing_actions;
var ss;
try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
catch (e) { out.verdict = 'BLOCKED'; out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE' }]; return jsonResponse_(out); }
out.schema = sysSchemaReadiness_(ss);


var drafts = [];
try {
var sh = ss.getSheetByName('shipping_allocation_drafts');
if (sh) {
var d = sh.getDataRange().getValues();
if (d.length > 1) {
var h = d[0].map(function (x) { return sysStr_(x).toLowerCase(); });
var cId = h.indexOf('allocation_draft_id'), cStatus = h.indexOf('status');
for (var r = 1; r < d.length; r++) {
var id = cId === -1 ? '' : sysStr_(d[r][cId]);
if (!id) continue;
if (draftIds.length && draftIds.indexOf(id) === -1) continue;
drafts.push({ allocation_draft_id: id, status: cStatus === -1 ? '' : sysStr_(d[r][cStatus]) });
}
}
}
} catch (e2) { }
out.requested_draft_ids = draftIds;
out.matched_drafts = drafts.length;
out.drafts = drafts.slice(0, 20);


out.expected_write_manifest = [
{ table: 'shipping_plans', operation: 'INSERT', rows: 'one per (country, marketplace, shipping_method) group' },
{ table: 'shipping_plan_lines', operation: 'INSERT', rows: 'one per submitted SKU line, each referencing its persisted shipping_plan_id' }
];
out.expected_visibility_after_submit = [
{ page: 'Weekly Shipping Plan', shows: 'the new plan in the Draft group, read through weeklyShipping.workspace.get' },
{ page: 'Shipment Draft', shows: 'nothing yet — a shipment exists only after the plan is approved and transferred' },
{ page: 'On-the-Way Map', shows: 'nothing yet — the map needs a shipment with routes/events, created by Confirm Shipment' }
];
var blockers = [];
if (!router.all_available) blockers.push({ reason: 'ROUTER_ACTION_MISSING', detail: router.missing_actions.join(',') });
if (!out.schema.all_present) blockers.push({ reason: 'SCHEMA_TABLE_MISSING', detail: String(out.schema.missing_table_count) + ' table(s) absent' });
if (draftIds.length && !drafts.length) blockers.push({ reason: 'ALLOCATION_DRAFT_NOT_FOUND', detail: 'none of the supplied allocation_draft_id values exist' });
if (!draftIds.length && !drafts.length) blockers.push({ reason: 'NO_PERSISTED_ALLOCATION_DRAFT', detail: 'Submit re-reads persisted drafts; adjust the Execution Plan first so one is saved.' });
out.blocking_reasons = blockers;
out.verdict = blockers.length ? 'BLOCKED' : 'READY';
return jsonResponse_(out);
}



var TEMP_FLOW_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';

function TEMP_SYSTEM_HEALTH_CHECK() {
var h = {};
try { h = JSON.parse(handleSystemHealth_({}).getContent()); } catch (e) { Logger.log('[SYS-HEALTH] UNPARSEABLE'); return; }
Logger.log('[SYS-HEALTH][identity] build_id=' + h.build_id +
' contract_version=' + h.contract_version +
' deployed_action_contract_version=' + h.deployed_action_contract_version +
' inventory_registry_projection_version=' + h.inventory_registry_projection_version +
' required_action_list_version=' + h.required_action_list_version +
' required_action_count=' + h.required_action_count);
Logger.log('[SYS-HEALTH][identity] NOTE: missing_actions is computed from the DEPLOYED code\'s own required-action ' +
'list, so an EMPTY list is NOT proof that this deployment is complete. Compare the version fields above.');
Logger.log('[SYS-HEALTH][identity] NOTE: running this wrapper in the EDITOR proves the code is SAVED. It does NOT ' +
'prove the /exec WEB APP serves it — that requires a new deployment version.');
Logger.log('[SYS-HEALTH] ok=' + h.ok +
' contract=' + h.api_contract_version + ' build=' + h.build_version + ' env=' + h.environment_mode +
' | router_ready=' + h.router_ready + ' doGet=' + (h.entrypoints && h.entrypoints.doGet) + ' doPost=' + (h.entrypoints && h.entrypoints.doPost) +
' missing_actions=[' + (h.missing_actions || []).join(',') + ']' +
' | db_reachable=' + h.db_reachable + ' schema_ready=' + h.schema_ready +
' missing_tables=' + (h.schema && h.schema.missing_table_count) +
' | server_ms=' + h.server_ms + ' request_id=' + h.request_id +
' | READ_ONLY=' + h.read_only + ' DB_WRITES=' + h.db_writes + ' DRIVE_WRITES=' + h.drive_writes +
' STATUS_TRANSITIONS=' + h.status_transitions + ' EMAILS=' + h.emails + ' DEMO_MUTATIONS=' + h.demo_mutations);
((h.schema && h.schema.tables) || []).forEach(function (t) {
if (!t.present) Logger.log('[SYS-HEALTH][table] MISSING ' + t.table);
});
}

function TEMP_SUBMIT_FLOW_DIAGNOSE() {
var raw = sysStr_(TEMP_FLOW_DIAGNOSTIC_ALLOCATION_DRAFT_ID_);
var ids = (!raw || raw.indexOf('PASTE_') === 0) ? [] : [raw];
var d = {};
try { d = JSON.parse(handleSubmitFlowDiagnostic_({ allocation_draft_ids: ids }).getContent()); }
catch (e) { Logger.log('[SUBMIT-FLOW] UNPARSEABLE'); return; }
Logger.log('[SUBMIT-FLOW] verdict=' + d.verdict +
' | router_ready=' + d.router_ready + ' missing_actions=[' + (d.missing_actions || []).join(',') + ']' +
' | schema_ready=' + (d.schema && d.schema.all_present) + ' missing_tables=' + (d.schema && d.schema.missing_table_count) +
' | requested_drafts=[' + (d.requested_draft_ids || []).join(',') + '] matched=' + d.matched_drafts +
' | blocked_by=[' + (d.blocking_reasons || []).map(function (b) { return b.reason; }).join(',') + ']' +
' | request_id=' + d.request_id +
' | READ_ONLY=' + d.read_only + ' DB_WRITES=' + d.db_writes + ' DRIVE_WRITES=' + d.drive_writes +
' STATUS_TRANSITIONS=' + d.status_transitions + ' EMAILS=' + d.emails + ' DEMO_MUTATIONS=' + d.demo_mutations);
(d.expected_write_manifest || []).forEach(function (m) {
Logger.log('[SUBMIT-FLOW][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows);
});
(d.expected_visibility_after_submit || []).forEach(function (v) {
Logger.log('[SUBMIT-FLOW][visibility] ' + v.page + ' — ' + v.shows);
});
(d.blocking_reasons || []).forEach(function (b) { Logger.log('[SUBMIT-FLOW][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
}

















































var TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_ = 'PASTE_ALLOCATION_DRAFT_ID_HERE_OR_LEAVE_BLANK';


var TEMP_SAD_DIAGNOSTIC_HEADER_ = {
planning_cycle: '',
source_page: 'inventory_replenishment',
company: 'PASTE_COMPANY_OR_LEAVE_BLANK',
country: 'PASTE_COUNTRY_OR_LEAVE_BLANK',
marketplace: 'PASTE_MARKETPLACE_OR_LEAVE_BLANK',
recommended_source_warehouse_id: '',
recommended_destination_warehouse_id: '',
destination_marketplace: '',
recommended_shipping_method: '',
recommended_last_mile_delivery: ''
};

var TEMP_SAD_DIAGNOSTIC_LINE_ = { sku: '', planned_qty: 0, required_by_date: '' };

function sadDiagPlaceholder_(v) {
var s = sysStr_(v);
return s === '' || s.indexOf('PASTE_') === 0;
}
function sadDiagClean_(obj) {
var out = {};
for (var k in obj) { if (!Object.prototype.hasOwnProperty.call(obj, k)) continue; out[k] = sadDiagPlaceholder_(obj[k]) ? '' : sysStr_(obj[k]); }
return out;
}

function sadDiagSchemaGate_(ss, table, headers) {
var res = { table: table, present: false, gate: 'UNKNOWN', safety_token: '', missing_headers: [], header_count: 0 };
var sheet = null;
try { sheet = ss.getSheetByName(table); } catch (e) { sheet = null; }
if (!sheet) { res.gate = 'BLOCKED'; res.safety_token = 'SCHEMA_NOT_PROVISIONED'; res.missing_headers = (headers || []).slice(); return res; }
res.present = true;
try { res.header_count = sheet.getLastColumn(); } catch (e2) {}

try {
prodRequireSheet_(ss, table, headers || []);
res.gate = 'PASS';
} catch (gateErr) {
res.gate = 'BLOCKED';
var m = sysStr_(gateErr && gateErr.message);
var tok = m.match(/PRODUCTION_SAFETY:([A-Z_]+)/);
res.safety_token = tok ? tok[1] : 'SCHEMA_REFUSED';
}

try {
var lastCol = sheet.getLastColumn();
var actual = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return sysStr_(h); }) : [];
var have = {}; actual.forEach(function (h) { have[h] = 1; });
res.missing_headers = (headers || []).filter(function (h) { return !have[h]; });
} catch (e3) {}
return res;
}

function sadDiagIdExists_(ss, table, column, value) {
if (!sysStr_(value)) return null;
try {
var sh = ss.getSheetByName(table); if (!sh) return false;
var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
var h = d[0].map(function (x) { return sysStr_(x).toLowerCase(); });
var c = h.indexOf(String(column).toLowerCase()); if (c === -1) return false;
for (var r = 1; r < d.length; r++) { if (sysStr_(d[r][c]) === sysStr_(value)) return true; }
return false;
} catch (e) { return false; }
}

function handleShippingAllocationDraftDiagnostic_(body) {
var requestId = sysStr_(body && (body.requestId || body.request_id)) || ('SADDIAG-' + Utilities.getUuid().substring(0, 8).toUpperCase());
var header = sadDiagClean_((body && body.header) || {});
var line = (body && body.line) ? body.line : null;
var draftId = sysStr_(body && (body.allocation_draft_id || body.allocationDraftId));
var out = {
success: true, request_id: requestId,
read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0, demo_mutations: 0,
api_contract_version: SYS_API_CONTRACT_VERSION_, build_version: SYS_DEPLOYMENT_RELEASE_,
evaluator: 'production (prodRequireSheet_ + sadHeaderRouteIsComplete_ + sadResolveActiveDraftK2OrK3_ + sadLegacyReconcileReason_)'
};
var blockers = [];


var router = sysRouterReadiness_();


var wanted = ['upsertShippingAllocationDraft', 'upsertShippingAllocationDraftLines', 'upsertShippingAllocationDraftAtomic', 'getShippingAllocationDraftWorkspace', 'submitAllocationDraftsToShippingPlans'];
out.actions = router.actions.filter(function (a) { return wanted.indexOf(a.action) !== -1; });
out.actions_all_available = out.actions.length === wanted.length && out.actions.every(function (a) { return a.available; });
if (!out.actions_all_available) blockers.push({ reason: 'ROUTER_ACTION_OR_HANDLER_MISSING', detail: 'a required allocation-draft action is not present in the DEPLOYED code (partial Apps Script sync)' });

var ss;
try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
catch (e) {
out.verdict = 'BLOCKED';
out.blocking_reasons = [{ reason: 'DB_NOT_REACHABLE', detail: 'the configured production database could not be opened' }];
return jsonResponse_(out);
}


out.schema_gate = [
sadDiagSchemaGate_(ss, 'shipping_allocation_drafts', (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_ : []),
sadDiagSchemaGate_(ss, 'shipping_allocation_draft_lines', (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ : [])
];
out.schema_mode = 'EXACT_LIVE_30_COL_AUTHORITY (C2-D1R; order-sensitive, no additive tolerance in normal runtime)';
for (var i = 0; i < out.schema_gate.length; i++) {
var g = out.schema_gate[i];
if (g.gate !== 'PASS') blockers.push({ reason: 'PRODUCTION_SAFETY:' + (g.safety_token || 'SCHEMA_REFUSED'), detail: g.table + (g.missing_headers.length ? (' — missing header(s): ' + g.missing_headers.join(', ')) : ' — header row does not match the canonical authority in the expected order') });
}


if (typeof auditShippingAllocationSchemaReadOnly === 'function') {
try {
var audit = auditShippingAllocationSchemaReadOnly();
out.schema_audit = ((audit && audit.tables) || []).map(function (t) {
return { table: t.table, exists: t.exists, column_count: t.columnCount, exact_match: t.exactMatch,
first_mismatch_index: t.firstMismatchIndex, missing_headers: t.missingHeaders || [],
extra_headers: t.extraHeaders || [], reordered_headers: t.reorderedHeaders || [],
migration_classification: t.migrationClassification };
});
if (audit && audit.error) out.schema_audit_error = sysStr_(audit.error);
} catch (auditErr) { out.schema_audit_error = 'AUDIT_UNAVAILABLE'; }
}


var routeFields = ['company', 'country', 'marketplace', 'recommended_source_warehouse_id',
'recommended_destination_warehouse_id', 'destination_marketplace', 'recommended_shipping_method'];
var present = {}, absent = [];
routeFields.forEach(function (f) { var v = sysStr_(header[f]); present[f] = v !== ''; if (v === '') absent.push(f); });
out.payload_field_contract = { supplied: present, absent: absent,
note: 'destination_marketplace is an ACCEPTED payload field but is NOT a stored column — it makes an Amazon logical destination a valid To.' };


var routeComplete = (typeof sadHeaderRouteIsComplete_ === 'function') ? sadHeaderRouteIsComplete_(header) : null;
out.route_complete = routeComplete;
out.source_destination_readiness = {
source_warehouse_id: sysStr_(header.recommended_source_warehouse_id) || null,
source_exists_in_warehouses: sadDiagIdExists_(ss, 'warehouses', 'warehouse_id', header.recommended_source_warehouse_id),
destination_warehouse_id: sysStr_(header.recommended_destination_warehouse_id) || null,
destination_exists_in_warehouses: sadDiagIdExists_(ss, 'warehouses', 'warehouse_id', header.recommended_destination_warehouse_id),
destination_is_logical_marketplace: sysStr_(header.destination_marketplace) !== '',
shipping_method: sysStr_(header.recommended_shipping_method) || null
};
if (routeComplete === false) blockers.push({ reason: 'PLAN_HEADER_INCOMPLETE', detail: 'a Draft route requires From + To + Method (an Amazon logical destination counts as To); a partial route is refused with zero rows written' });
if (out.source_destination_readiness.source_exists_in_warehouses === false) blockers.push({ reason: 'FK_SOURCE_WAREHOUSE_NOT_FOUND', detail: 'the supplied source warehouse_id is not present in warehouses' });
if (out.source_destination_readiness.destination_exists_in_warehouses === false) blockers.push({ reason: 'FK_DESTINATION_WAREHOUSE_NOT_FOUND', detail: 'the supplied destination warehouse_id is not present in warehouses' });


out.pk_readiness = { deterministic: false, expected_allocation_draft_id: null, basis: null };
out.idempotency = { keyed_by: 'the deterministic K2 shipment-group hash of the header route dims (sadK2DeterministicHeaderId_), so a retry UPDATES the same row instead of inserting a duplicate', resolution: null };
var dsh = null;
try { dsh = ss.getSheetByName('shipping_allocation_drafts'); } catch (e4) { dsh = null; }
if (dsh && typeof sadResolveActiveDraftK2OrK3_ === 'function') {
try {
if (draftId && !sadDiagPlaceholder_(draftId)) {

var found = (typeof procurementFindRow_ === 'function') ? procurementFindRow_(dsh, 'allocation_draft_id', draftId) : null;
out.pk_readiness = { deterministic: true, expected_allocation_draft_id: draftId, basis: 'explicit allocation_draft_id supplied by the caller' };
out.expected_classification = found ? 'UPDATE' : 'INSERT';
out.idempotency.resolution = found ? 'EXISTING_ROW' : 'ID_NOT_FOUND';
if (found && typeof sadLegacyReconcileReason_ === 'function') {

var legR = sadLegacyReconcileReason_(dsh, found, false, header);
out.reconcile_guard = legR || 'PASS';
if (legR) blockers.push({ reason: legR, detail: (typeof sadReconcileMessage_ === 'function') ? sadReconcileMessage_(legR) : 'requires an explicit user migration' });
}
} else {
var res = sadResolveActiveDraftK2OrK3_(dsh, header, { allowLegacyReconcile: false });
out.idempotency.resolution = res.status + (res.k2 ? ' (K2 shipment group)' : ' (K3 scope)');
if (res.status === 'CREATE' || res.status === 'REUSE') {
out.pk_readiness = { deterministic: true, expected_allocation_draft_id: sysStr_(res.id) || null,
basis: res.k2 ? 'deterministic K2 shipment-group hash of the header route dims' : 'existing active draft for this scope' };
out.expected_classification = (res.status === 'CREATE') ? 'INSERT' : 'UPDATE';
} else if (res.status === 'CONFLICT') {
out.expected_classification = 'BLOCKED';
blockers.push({ reason: 'BLOCKED_CONFLICT', detail: 'more than one active Draft for this ' + (res.k2 ? 'shipment group (K2)' : 'scope (K3)') + '; resolve manually (zero rows written)' });
} else {
out.expected_classification = 'BLOCKED';
blockers.push({ reason: sysStr_(res.reason) || 'BLOCK', detail: 'the real draft-resolution authority refuses this payload with zero rows written' });
}
}
} catch (resErr) {
out.idempotency.resolution = 'EVALUATION_FAILED';
blockers.push({ reason: 'DRAFT_RESOLUTION_EVALUATION_FAILED', detail: 'the resolver could not be evaluated against the live table' });
}
}


if (line && (sysStr_(line.sku) || Number(line.planned_qty) > 0)) {
var lineOk = (typeof sadLineIsComplete_ === 'function') ? sadLineIsComplete_(line) : null;
var canonDate = (typeof sadCanonDate_ === 'function' && sysStr_(line.required_by_date)) ? sadCanonDate_(line.required_by_date) : '';
out.line_readiness = { sku_present: sysStr_(line.sku) !== '', planned_qty: Number(line.planned_qty) || 0,
complete: lineOk, required_by_date_canonical: canonDate || null,


date_valid: sysStr_(line.required_by_date) === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(canonDate) };
if (lineOk === false) blockers.push({ reason: 'PLAN_LINE_INCOMPLETE', detail: 'a persistable line needs a SKU and a quantity greater than zero' });
if (out.line_readiness.date_valid === false) blockers.push({ reason: 'LINE_DATE_NOT_CANONICAL', detail: 'required_by_date is not canonicalizable to YYYY-MM-DD' });
}


out.expected_write_manifest = (blockers.length)
? [{ table: '(none)', operation: 'ZERO_WRITE', rows: 'every reason above is a pre-write refusal — no cell would be touched' }]
: [
{ table: 'shipping_allocation_drafts', operation: out.expected_classification || 'INSERT_OR_UPDATE', rows: 'exactly one header row, keyed by the deterministic allocation_draft_id above' },
{ table: 'shipping_allocation_draft_lines', operation: 'UPSERT_BY_LINE_ID', rows: 'one row per COMPLETE Execution Plan line; recommendation-snapshot columns are preserved when the payload omits them' }
];
out.blocking_reasons = blockers;
out.verdict = blockers.length ? 'BLOCKED' : 'READY';
out.exact_blocking_reason = blockers.length ? (blockers[0].reason + ' — ' + (blockers[0].detail || '')) : '';
return jsonResponse_(out);
}

function TEMP_SHIPPING_ALLOCATION_DRAFT_DIAGNOSE() {
var hdr = sadDiagClean_(TEMP_SAD_DIAGNOSTIC_HEADER_);
var did = sadDiagPlaceholder_(TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_) ? '' : sysStr_(TEMP_SAD_DIAGNOSTIC_ALLOCATION_DRAFT_ID_);
var d = {};
try {
d = JSON.parse(handleShippingAllocationDraftDiagnostic_({
header: hdr, line: TEMP_SAD_DIAGNOSTIC_LINE_, allocation_draft_id: did
}).getContent());
} catch (e) { Logger.log('[SAD-DIAG] UNPARSEABLE'); return; }

Logger.log('[SAD-DIAG] verdict=' + d.verdict + ' | exact_blocking_reason=' + (d.exact_blocking_reason || '(none)'));
Logger.log('[SAD-DIAG] evaluator=' + d.evaluator);
Logger.log('[SAD-DIAG] actions_all_available=' + d.actions_all_available);
(d.actions || []).forEach(function (a) { Logger.log('[SAD-DIAG][action] ' + a.action + ' available=' + a.available); });
(d.schema_gate || []).forEach(function (g) {
Logger.log('[SAD-DIAG][schema-gate] ' + g.table + ' present=' + g.present + ' gate=' + g.gate +
' token=' + (g.safety_token || '-') + ' header_count=' + g.header_count +
' missing=[' + (g.missing_headers || []).join(',') + ']');
});
Logger.log('[SAD-DIAG] schema_mode=' + d.schema_mode);
(d.schema_audit || []).forEach(function (t) {
Logger.log('[SAD-DIAG][header-drift] ' + t.table + ' exists=' + t.exists + ' cols=' + t.column_count +
' exact=' + t.exact_match + ' first_mismatch_index=' + t.first_mismatch_index +
' missing=[' + (t.missing_headers || []).join(',') + '] extra=[' + (t.extra_headers || []).join(',') +
'] reordered=[' + (t.reordered_headers || []).join(',') + '] classification=' + t.migration_classification);
});
if (d.schema_audit_error) Logger.log('[SAD-DIAG][header-drift] error=' + d.schema_audit_error);
Logger.log('[SAD-DIAG] payload absent_fields=[' + ((d.payload_field_contract && d.payload_field_contract.absent) || []).join(',') + ']');
Logger.log('[SAD-DIAG] route_complete=' + d.route_complete);
var sd = d.source_destination_readiness || {};
Logger.log('[SAD-DIAG] from=' + sd.source_warehouse_id + ' fk_ok=' + sd.source_exists_in_warehouses +
' | to=' + sd.destination_warehouse_id + ' fk_ok=' + sd.destination_exists_in_warehouses +
' logical_marketplace_to=' + sd.destination_is_logical_marketplace + ' | method=' + sd.shipping_method);
var pk = d.pk_readiness || {};
Logger.log('[SAD-DIAG] pk_deterministic=' + pk.deterministic + ' expected_id=' + pk.expected_allocation_draft_id + ' basis=' + pk.basis);
Logger.log('[SAD-DIAG] idempotency=' + ((d.idempotency && d.idempotency.resolution) || '-') + ' expected_classification=' + d.expected_classification);
if (d.reconcile_guard) Logger.log('[SAD-DIAG] reconcile_guard=' + d.reconcile_guard);
if (d.line_readiness) Logger.log('[SAD-DIAG] line complete=' + d.line_readiness.complete + ' qty=' + d.line_readiness.planned_qty +
' date_canonical=' + d.line_readiness.required_by_date_canonical + ' date_valid=' + d.line_readiness.date_valid);
(d.expected_write_manifest || []).forEach(function (m) { Logger.log('[SAD-DIAG][would-write] ' + m.table + ' ' + m.operation + ' — ' + m.rows); });
(d.blocking_reasons || []).forEach(function (b) { Logger.log('[SAD-DIAG][blocker] ' + b.reason + ' — ' + (b.detail || '')); });
Logger.log('[SAD-DIAG] request_id=' + d.request_id);
Logger.log('READ_ONLY = ' + d.read_only);
Logger.log('DB_WRITES = ' + d.db_writes);
Logger.log('DRIVE_WRITES = ' + d.drive_writes);
Logger.log('STATUS_TRANSITIONS = ' + d.status_transitions);
Logger.log('EMAILS = ' + d.emails);
Logger.log('DEMO_MUTATIONS = ' + d.demo_mutations);
}
// R15F2-STAMPS (sbx-r15f2 step 23): patched
// R15G-STAMPS (final candidate): patched
