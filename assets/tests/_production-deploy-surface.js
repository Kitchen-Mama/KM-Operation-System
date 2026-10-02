// Kitchen Mama Operation System — PRODUCTION APPS SCRIPT DEPLOY SURFACE (S7-R4)
//
// WHAT THIS DECLARES, AND WHY A DECLARATION RATHER THAN A SCAN.
//
// `assets/specs/active/apps-script/` is not just where the server source lives — membership in it IS the
// claim "this file is synced into the Apps Script project as runtime". 63_ says so in its own words, where
// it explains why a sibling tool gets no manifest row: "every manifest reader resolves
// assets/specs/active/apps-script/<file> and only that, because this manifest lists the files SYNCED INTO
// THE PROJECT AS RUNTIME ... the precedent is the folder, not being a migration."
//
// That makes the folder the deploy-surface owner, and it made the folder a place where a one-shot writer
// could arrive silently. SLIM-R1 measured the consequence: 808,195 bytes of TEMP source sat in the runtime
// directory, including a demo seed that writes — and clears — six business tables. A live typeof probe
// proved none of it was in the project, so the damage was potential rather than actual. Nothing structural
// was keeping it that way. "Remember not to paste these seven" is not a mechanism.
//
// S7-R4 moved all seven into assets/tools/. This module exists so the next one cannot drift back in
// unnoticed: the runtime universe is DECLARED here, by name, and a file that appears in the folder without
// a declaration is a FAILURE rather than a new member. A scan would have ratified whatever it found, which
// is the property that let the seven accumulate.
//
// The same shape as assets/tests/_boot-topology.js, and for the same reason: a census that cannot say what
// it expected can only report what is, and "what is" is exactly the thing under suspicion.
'use strict';
var fs = require('fs');
var path = require('path');

var RUNTIME_DIR = 'assets/specs/active/apps-script';

// Non-runtime tooling, by directory, with what membership means. A tool lives in exactly one of these and
// is never copied into the Production Apps Script project by the normal release.
var TOOLING_DIRS = {
  'assets/tools/apps-script-migrations': 'ONE_TIME_MIGRATION',
  'assets/tools/apps-script-diagnostics': 'DIAGNOSTIC',
  'assets/tools/apps-script-seeds': 'SEED'
};

// A file whose NAME alone marks it as non-runtime. This is a second, independent net: the declared list
// below is the primary guard, and this catches a TEMP file that someone adds to the list as well as to the
// folder. Either net alone would be defeated by a single careless edit; both together need two.
var NON_RUNTIME_NAME_RE = /^(TEMP_|.*_migrate_|.*_seed(_|\.)|migrate_)/i;

// THE PRODUCTION APPS SCRIPT RUNTIME UNIVERSE — every file eligible to exist in the Production project.
// This is NOT the per-release sync set; it is the set a sync set may draw from. appsscript.json is the
// project manifest and is listed separately because it is not a .gs source file.
var DECLARED_RUNTIME = [
  '00_config.gs',
  '01_router.gs',
  '02_core_sheet_db.gs',
  '03_master_data_handlers.gs',
  '04_marketplace_forecast_import.gs',
  '05_overseas_inventory_handlers.gs',
  '06_amazon_import_config.gs',
  '07_amazon_import_runner.gs',
  '08_amazon_import_sources.gs',
  '09_amazon_import_writer_logger.gs',
  '10_amazon_import_helpers.gs',
  '11_shipping_plan_handlers.gs',
  '12_shipment_handlers.gs',
  '13_procurement_handlers.gs',
  '14_fc_write_handlers.gs',
  '15_request_allocation_handlers.gs',
  '16_request_site_confirmation_handlers.gs',
  '16_shipping_allocation_handlers.gs',
  '17_carrier_handlers.gs',
  '18_sku_regional_handlers.gs',
  '19_tax_handlers.gs',
  '20_campaign_write_handlers.gs',
  '21_factory_inventory_handlers.gs',
  '22_shipment_dispatch_handlers.gs',
  '23_recommendation_persistence_repository.gs',
  '24_recommendation_orchestrator.gs',
  '25_recommendation_user_edit.gs',
  '26_recommendation_source_reader.gs',
  '27_recommendation_production_source.gs',
  '28_recommendation_verification_diagnostics.gs',
  '29_production_safety_adapter.gs',
  '31_shipment_receipt_route_handlers.gs',
  '32_shipment_line_allocation_handlers.gs',
  '33_party_authority_handlers.gs',
  '34_shipment_final_output_handlers.gs',
  '35_shipment_document_renderer.gs',
  '36_document_template_handlers.gs',
  '37_shipment_document_file_renderer.gs',
  '38_document_output_folder_resolver.gs',
  '39_document_runtime_service.gs',
  '40_api_v1_weekly_workspace.gs',
  '41_shipping_allocation_schema_audit.gs',
  '42_api_v1_recommendation_workspace.gs',
  '43_api_v1_gap_materialization.gs',
  '44_gap_materialization_scheduler.gs',
  '45_api_v1_automation_schedule.gs',
  '46_api_v1_gap_materialization_job.gs',
  '47_api_v1_recommendation_generation.gs',
  '48_api_v1_request_order_draft_job.gs',
  '49_api_v1_weekly_recommendation_job.gs',
  '50_api_v1_purchase_order_workspace.gs',
  '50_api_v1_warehouse_allocation_config.gs',
  '51_api_v1_request_order_workspace.gs',
  '52_api_v1_open_po_remaining_owner.gs',
  '53_api_v1_fc_summary_raw_owner.gs',
  '54_api_v1_raw_inventory_owner.gs',
  '55_api_v1_lead_time_owner.gs',
  '56_api_v1_ai_plan_first_layer.gs',
  '57_api_v1_shipment_workspace.gs',
  '58_api_v1_fc_summary_workspace.gs',
  '59_api_v1_sku_details_workspace.gs',
  '60_api_v1_inventory_replenishment_workspace.gs',
  '61_api_v1_weekly_ai_plan.gs',
  '62_api_v1_factory_operation_config.gs',
  '63_api_v1_system_health.gs',
  '64_api_v1_scope_registry.gs',
  '65_api_v1_flow_diagnostics.gs',
  '66_api_v1_request_order_send.gs',
  '67_api_v1_allocation_draft_identity.gs',
  '68_api_v1_execution_plan_conflict_diagnostic.gs',
  '69_api_v1_ai_plan_lifecycle.gs',
  '69_api_v1_route_identity_contract.gs',
  '70_api_v1_overseas_stock_workspace.gs',
  '71_api_v1_factory_stock_guard.gs',
  '72_api_v1_product_pricing_workspace.gs',
  '73_api_v1_pricing_write.gs',
  '90_generated_supply_planning_bundle.gs'
];

var PROJECT_MANIFEST = 'appsscript.json';

function listDir(repoRoot, rel, filter) {
  var abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs).filter(filter).sort();
}

function isGs(f) { return /\.gs$/.test(f); }

// surface(repoRoot) — the whole census in one object, so a suite asserts on fields rather than re-deriving.
function surface(repoRoot) {
  var live = listDir(repoRoot, RUNTIME_DIR, isGs);
  var declared = DECLARED_RUNTIME.slice().sort();
  var liveSet = {}, decSet = {};
  live.forEach(function (f) { liveSet[f] = 1; });
  declared.forEach(function (f) { decSet[f] = 1; });

  var tooling = {}, toolingCount = 0, toolingByClass = {};
  Object.keys(TOOLING_DIRS).forEach(function (d) {
    var fs_ = listDir(repoRoot, d, isGs);
    tooling[d] = fs_;
    toolingCount += fs_.length;
    toolingByClass[TOOLING_DIRS[d]] = (toolingByClass[TOOLING_DIRS[d]] || 0).valueOf() + fs_.length;
  });

  return {
    declaredCount: declared.length,
    liveCount: live.length,
    live: live,
    declared: declared,
    // a .gs in the runtime folder that nobody declared — the gate that stops a silent new member
    undeclared: live.filter(function (f) { return !decSet[f]; }),
    // a declared runtime owner that has vanished from the folder
    missing: declared.filter(function (f) { return !liveSet[f]; }),
    // a file in the runtime folder whose NAME marks it non-runtime, declared or not
    nonRuntimeInRuntimeDir: live.filter(function (f) { return NON_RUNTIME_NAME_RE.test(f); }),
    // a tool that is declared runtime AND sits in a tooling directory — a file cannot be both
    doubleClaimed: Object.keys(tooling).reduce(function (a, d) {
      return a.concat(tooling[d].filter(function (f) { return decSet[f]; }));
    }, []),
    tooling: tooling,
    toolingCount: toolingCount,
    toolingByClass: toolingByClass,
    projectManifestPresent: fs.existsSync(path.join(repoRoot, RUNTIME_DIR, PROJECT_MANIFEST))
  };
}

module.exports = {
  RUNTIME_DIR: RUNTIME_DIR,
  TOOLING_DIRS: TOOLING_DIRS,
  NON_RUNTIME_NAME_RE: NON_RUNTIME_NAME_RE,
  DECLARED_RUNTIME: DECLARED_RUNTIME,
  PROJECT_MANIFEST: PROJECT_MANIFEST,
  surface: surface
};
