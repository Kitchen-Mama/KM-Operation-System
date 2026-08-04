// Kitchen Mama Operation System — PRODUCTION Recommendation Source Reader (Apps Script wrapper, Round 1S-P1).
// -----------------------------------------------------------------------------
// THIN, READ-ONLY SpreadsheetApp boundary. It owns ONLY SpreadsheetApp access + JSON-safe transfer; ALL logic
// (registry, schema validation, value-preserving row mapping, reader/integration projection) lives in the
// bundled pure module KMSRP (assets/js/core/supply-planning-source-reader-production.js — the ONE algorithm
// source). No business formula is duplicated here. This file performs NO writes, acquires NO LockService, adds
// NO router/Web-App route (internal, for the future orchestrator integration in Round 1S-P2), and does NOT touch
// the SOURCE_READER_PENDING stub in 24_recommendation_orchestrator.gs.
//
// SpreadsheetApp sheets natively expose getLastRow()/getLastColumn()/getDataRange().getValues(), which is exactly
// the read-only accessor shape KMSRP.readRawTableSnapshot expects — so the active spreadsheet is passed verbatim.

/**
 * Read the production Recommendation Source Facts DTO for a scope (READ-ONLY).
 * cmd = { recommendationType, planningCycle, businessScope, formulaVersion?, sourceDataAsOf? }.
 * config (optional) = { sheetNames: { <sourceType>: '<sheet>' } } to override convention sheet names.
 * Returns the pure KMSRP DTO (JSON-safe). Never writes; never locks.
 */
function readRecommendationSourceFacts_(cmd, config) {
  if (typeof KMSRP === 'undefined' || !KMSRP || typeof KMSRP.readRecommendationSourceFacts !== 'function') {
    throw new Error('KMSRP production source-reader module is not loaded in the bundle');
  }
  var ss = (config && config.spreadsheetId)
    ? SpreadsheetApp.openById(String(config.spreadsheetId))
    : SpreadsheetApp.getActiveSpreadsheet();
  return KMSRP.readRecommendationSourceFacts(ss, cmd || {}, config || null);
}

/**
 * Read a single raw table snapshot by registry sourceType (READ-ONLY diagnostic helper).
 * Returns { sourceType, sheetName, headers, rows, rowCount, sourceDataAsOfEvidence, found, issues }.
 */
function readRecommendationSourceSnapshot_(sourceType, recommendationType, config) {
  if (typeof KMSRP === 'undefined' || !KMSRP) throw new Error('KMSRP production source-reader module is not loaded in the bundle');
  var ss = (config && config.spreadsheetId) ? SpreadsheetApp.openById(String(config.spreadsheetId)) : SpreadsheetApp.getActiveSpreadsheet();
  var entries = KMSRP.registryFor(String(recommendationType), config || null);
  for (var i = 0; i < entries.length; i++) { if (entries[i].sourceType === sourceType) return KMSRP.readRawTableSnapshot(ss, entries[i]); }
  throw new Error('unknown sourceType for ' + recommendationType + ': ' + sourceType);
}
