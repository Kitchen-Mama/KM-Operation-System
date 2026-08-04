/**
 * 28_recommendation_verification_diagnostics.gs
 * Kitchen Mama Operation System — READ-ONLY production verification diagnostics (Phase 2C, Round 1S-P4-U).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Razor-thin READ-ONLY admin diagnostics for USER-OPERATED live verification of the
 * recommendation persistence path. It authors NO algorithm — namespace/load checks, Draft-table readiness, and the
 * Active-Draft Composite-Key audit all live in the bundled pure module KMVD (assets/js/core/
 * supply-planning-verification-diagnostics.js). These functions are run from the Apps Script editor (no router
 * route added) and NEVER write a Sheet (no setValues/appendRow/insertRow/deleteRow/clear), NEVER acquire a lock,
 * NEVER persist, and NEVER create downstream records. They only INSPECT and return JSON-safe reports.
 */

// Guard: the diagnostics + runtime bundle namespaces must be present (fails closed when the bundle is absent).
function rvdBundle_() {
  if (typeof KMVD === 'undefined' || typeof KMPR === 'undefined' || typeof KMPW === 'undefined') {
    throw new Error('Verification diagnostics bundle (KMVD/KMPR/KMPW) is not present in this Apps Script project — ' +
      'Round 1S-P4-U is a source mirror; the generated bundle 90_generated_supply_planning_bundle.gs must be loaded.');
  }
}

// (1) Namespace + bundle-load smoke report (READ-ONLY). Run this FIRST after deploying the bundle.
function verifyRecommendationRuntimeNamespaces_() {
  rvdBundle_();
  var env = {
    KMSP: (typeof KMSP !== 'undefined') ? KMSP : undefined, KMPS: (typeof KMPS !== 'undefined') ? KMPS : undefined,
    KMPW: (typeof KMPW !== 'undefined') ? KMPW : undefined, KMPR: (typeof KMPR !== 'undefined') ? KMPR : undefined,
    KMPL: (typeof KMPL !== 'undefined') ? KMPL : undefined, KMORCH: (typeof KMORCH !== 'undefined') ? KMORCH : undefined,
    KMSRP: (typeof KMSRP !== 'undefined') ? KMSRP : undefined, KMSR: (typeof KMSR !== 'undefined') ? KMSR : undefined,
    KMSI: (typeof KMSI !== 'undefined') ? KMSI : undefined, KMPB: (typeof KMPB !== 'undefined') ? KMPB : undefined,
    KMPPB: (typeof KMPPB !== 'undefined') ? KMPPB : undefined, KMPC: (typeof KMPC !== 'undefined') ? KMPC : undefined,
    KM_BUNDLE_INFO: (typeof KM_BUNDLE_INFO !== 'undefined') ? KM_BUNDLE_INFO : undefined
  };
  var report = KMVD.namespaceReport(env);
  Logger.log(JSON.stringify(report));
  return report;
}

// (2) Five-table readiness + Active-Draft Composite-Key audit (READ-ONLY). Run BEFORE any generation.
function auditRecommendationDraftTables_() {
  rvdBundle_();
  var report = KMVD.auditDraftTables(SpreadsheetApp.getActiveSpreadsheet(), {});
  Logger.log(JSON.stringify(report));
  return report;
}

// (3) Single controlled-scope Composite-Key audit (READ-ONLY). query = {recommendationType, planningCycle,
// businessScope}. Decision: AUTHORIZED_CREATE_TEST / AUTHORIZED_REUSE_TEST / BLOCKED_CONFLICT_HALT (>1 → HALT).
function auditActiveDraftForScope_(query) {
  rvdBundle_();
  var report = KMVD.activeDraftAudit(SpreadsheetApp.getActiveSpreadsheet(), query);
  Logger.log(JSON.stringify(report));
  return report;
}
