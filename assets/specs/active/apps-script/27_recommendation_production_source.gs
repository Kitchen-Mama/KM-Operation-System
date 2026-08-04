/**
 * 27_recommendation_production_source.gs
 * Kitchen Mama Operation System — PRODUCTION recommendation source read path (Phase 2C, Round 1S-P2).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Razor-thin READ-ONLY Apps Script wrapper that binds the existing Operation System
 * Database Sheets to the bundled pure runtime. It authors NO algorithm: canonical-table reading, projection,
 * identity/readiness, demand/supply assembly, lifecycle status mapping, allocation, recommendation and plan
 * construction ALL live in assets/js/core/*.js and are ported by build-apps-script-bundle.js
 * (90_generated_supply_planning_bundle.gs) as KMPS / KMSP / KMSRP / KMSR / KMSI / … .
 *
 * READ-ONLY: this file NEVER writes a Sheet (no setValues/appendRow/insertRow/deleteRow/clear), NEVER acquires a
 * LockService lock, NEVER executes a PersistencePlan, NEVER creates a Draft / Request Order / PO / Shipment, and
 * NEVER reserves or deducts inventory. It reads the canonical tables and returns a JSON-safe read-only result.
 * NO physical recommendation_source_* Sheet is read — the DTO snapshots are assembled in memory by the runtime.
 */

// Guard: the production-source + projection bundle namespaces must be present (fails closed when the bundle is absent).
function rpsBundle_() {
  if (typeof KMPS === 'undefined' || typeof KMSP === 'undefined' || typeof KMSRP === 'undefined' ||
      typeof KMSR === 'undefined' || typeof KMSI === 'undefined' || typeof KMPB === 'undefined') {
    throw new Error('Production source bundle (KMPS/KMSP/KMSRP/KMSR/KMSI/KMPB) is not present in this Apps Script ' +
      'project — Round 1S-P2 is a source mirror; the generated bundle 90_generated_supply_planning_bundle.gs must ' +
      'be loaded into the project. No algorithm is duplicated in this file.');
  }
}

// Read the raw canonical recommendation-source snapshots from the active Operation System Database Spreadsheet.
// READ-ONLY: delegates entirely to the bundled inject-testable KMPS.readCanonicalSnapshots (getValues only).
function readCanonicalRecommendationSourceSnapshots_(request) {
  rpsBundle_();
  return KMPS.readCanonicalSnapshots(SpreadsheetApp.getActiveSpreadsheet(), request && request.config);
}

// Build the read-only production RecommendationPlan (projection → production reader → whole chain → Plan Builder).
// READ-ONLY: no write, no lock, no persistence, no draft id. Returns { …, persistenceStatus: 'NOT_EXECUTED' }.
function buildProductionRecommendationSource_(request) {
  rpsBundle_();
  return KMPS.buildProductionRecommendationSource(SpreadsheetApp.getActiveSpreadsheet(), request);
}

// Optional callable read-only preview entry (JSON response). NOT registered as a public router route this round —
// the production source path is internal to the orchestrator (24_). Kept for a future authorized read-only route.
function handleRecommendationSourcePreview_(body) {
  var result = buildProductionRecommendationSource_(body);
  return jsonResponse_({ success: result.ready, data: result });
}
