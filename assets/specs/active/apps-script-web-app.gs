// ============================================================
// Kitchen Mama Operation System — Google Apps Script Web App
// INDEX FILE ONLY — no runtime behavior lives here anymore.
// ============================================================
//
// The runtime source has been MODULARIZED under:
//   assets/specs/active/apps-script/
//
// Google Apps Script treats every .gs file in a project as ONE shared
// global scope (no import/export). The modules below must be copied into
// the Apps Script project TOGETHER — order does not matter, but all must
// be present. This split is structure-only: no behavior, logic, DB headers,
// mappings, routes, or function names changed.
//
// Modules (load all):
//   00_config.gs                      — global constants / spreadsheet IDs / enums
//                                        (VALID_LIFECYCLES_, VALID_REPLENISHMENT_MODELS_,
//                                         VALID_MARKETPLACE_SKU_STATUSES_,
//                                         AMAZON_DESTINATION_SPREADSHEET_ID_)
//   01_router.gs                      — doGet(e) / doPost(e) action routing
//   02_core_sheet_db.gs               — readSheetAsObjects_, filterRows_, formatValue_, jsonResponse_
//   03_master_data_handlers.gs        — handleGetOperationDb_, handleGetTable_,
//                                        handleUpdateSkuLifecycle_, handleUpsertMarketplaceSku_,
//                                        handleUpdateMarketplaceSkuModel_, handleUpsertMarketplace_,
//                                        normalizeMarketplaceIdPart_
//   04_marketplace_forecast_import.gs — handleImportMarketplaceSkusBatch_,
//                                        handleImportFcRegularForecastBatch_
//   05_overseas_inventory_handlers.gs — handleImportOverseasInventorySnapshotBatch_,
//                                        handleAdjustOverseasInventory_
//   06_amazon_import_config.gs        — IMPORT_CONFIGS, AMAZON_TEXT_FIELDS_
//   07_amazon_import_runner.gs        — runAmazonSnapshotImports, handleRunAmazonSnapshotImports_,
//                                        runAmazonSnapshotImport_, clearAmazonImportTestLogs
//   08_amazon_import_sources.gs       — amazonReadSheetSource_, amazonReadBigQuerySource_, amazonRunBigQuery_
//   09_amazon_import_writer_logger.gs — amazonWriteSnapshot_, amazonLogRun_, amazonLogIssues_,
//                                        amazonAppendByHeader_, amazonAddIssue_
//   11_shipping_plan_handlers.gs      — handleCreateShippingPlansBatch_,
//                                        handleUpdateShippingPlanStatus_, handleUpdateShippingPlanLineQty_
//                                        (Weekly Shipping Plan / Decision Layer writes)
//   10_amazon_import_helpers.gs       — amazonKeyOf_, amazonRowHash_, amazonNormalizeDate_,
//                                        amazonDeriveWeekParts_, amazonQualityScore_,
//                                        amazonNormalizeNumeric_, amazonGroupFields_,
//                                        amazonApplyDailyWindow_, amazonParseYmd_, amazonDateAgeDays_,
//                                        amazonIsBlank_, amazonPad2_, amazonTimestamp_
//
// Public entry points (unchanged): doGet, doPost, runAmazonSnapshotImports,
//   clearAmazonImportTestLogs (manual test-cleanup only).
// Supported POST actions (unchanged): getOperationDb, getTable, updateSkuLifecycle,
//   upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch,
//   upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch,
//   adjustOverseasInventory, runAmazonSnapshotImports, createShippingPlansBatch,
//   updateShippingPlanStatus, updateShippingPlanLineQty.
//
// Requires (unchanged): Advanced Google Service "BigQuery API" enabled in the
//   Apps Script project + BigQuery API enabled in the Google Cloud project.
//
// ============================================================
