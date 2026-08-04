/**
 * 29_production_safety_adapter.gs
 * Kitchen Mama Operation System — SHARED Apps Script safety adapter (Production Safety Round S0.5).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Thin, pure delegators around the bundled `KMSAFE` core
 * (assets/js/core/supply-planning-production-safety.js, ported into 90_generated_supply_planning_bundle.gs).
 * This file authors NO business logic and NO schema knowledge — it only routes every active production Runtime
 * Canonical-Sheet access through the frozen S0 safety contract:
 *   - `prodAssertDbTarget_`   — RULE S0-5 exact Spreadsheet-ID gate (fail-closed, no id leaked in the message);
 *   - `prodRequireSheet_`     — RULE S0-2 validate-only sheet resolver (never creates / never repairs);
 *   - `prodRequireColumns_`   — RULE S0-2 validate-only column presence (never appends);
 *   - `prodMigrateCreateSheet_` / `prodMigrateAppendColumns_` — RULE S0-3 MIGRATION-ONLY twins that retain the
 *     legacy create/append capability but require a valid Migration authorization DTO and are UNREACHABLE from the
 *     normal router/runtime (no router action calls them).
 * Normal Runtime uses ONLY the validate-only helpers. Any mismatch throws a deterministic safety token with ZERO
 * mutation. No raw Spreadsheet id is ever placed in a surfaced error message (RULE S0-5 / router §20).
 */

// Guard: the bundled safety core must be present (fails closed when the bundle is absent).
function prodSafetyBundle_() {
  if (typeof KMSAFE === 'undefined') {
    throw new Error('Production safety core (KMSAFE) is not present in this Apps Script project — ' +
      'load the generated bundle 90_generated_supply_planning_bundle.gs. No safety logic is duplicated here.');
  }
  return KMSAFE;
}

// The ONE canonical bound-database id (empty → fail closed). Amazon passes its own id explicitly.
function prodExpectedDbId_() { return (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? PRODUCTION_DB_SPREADSHEET_ID_ : ''; }

// Deterministic safety error carrying a machine token (never a raw Spreadsheet id).
function prodSchemaError_(token, table, detail) {
  var e = new Error('PRODUCTION_SAFETY:' + token + (table ? ' [' + table + ']' : ''));
  e.safetyToken = token; e.table = table || ''; if (detail) e.schemaDetail = detail;
  return e;
}

// RULE S0-5 — exact Spreadsheet-ID gate. Fail-closed on blank config / wrong id / null Spreadsheet; NO fallback to
// active/first-open/first-sheet/fuzzy; NO id in the surfaced message.
function prodAssertDbTarget_(ss, expectedId) {
  var S = prodSafetyBundle_();
  var exp = (expectedId === undefined || expectedId === null) ? prodExpectedDbId_() : expectedId;
  try { S.assertExpectedSpreadsheetId(ss, exp); }
  catch (e) { throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null); }
  return true;
}

// RULE S0-2 — validate-only sheet resolver. Asserts the exact db target, requires the exact Sheet by exact name,
// validates the actual Header against `expectedHeaders` (extra additive columns ALLOWed = the table's additive
// contract), and returns the live Sheet. NEVER creates a Sheet, NEVER writes/repairs a Header. Throws a
// deterministic token (SCHEMA_NOT_PROVISIONED / HEADER_MISSING / HEADER_BLANK / HEADER_DUPLICATE / ...) with zero
// mutation. opts = { expectedSpreadsheetId?, extraColumnsPolicy? }.
function prodRequireSheet_(ss, name, expectedHeaders, opts) {
  var S = prodSafetyBundle_();
  prodAssertDbTarget_(ss, opts && opts.expectedSpreadsheetId);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) throw prodSchemaError_('HEADER_MISSING', name, null);
  var actual = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var report = S.classifySchemaMismatch({ exists: true, actualHeaders: actual,
    expectedHeaders: expectedHeaders || [], extraColumnsPolicy: (opts && opts.extraColumnsPolicy) || 'ALLOW' });
  if (!report.valid) throw prodSchemaError_(report.schemaStatus, name, report);
  return sheet;
}

// RULE S0-2 — validate-only column presence. Replaces the legacy additive-append behavior in normal Runtime: any
// missing REQUIRED column fails closed (MISSING_REQUIRED_HEADER) with ZERO mutation — it NEVER appends a column.
function prodRequireColumns_(sheet, requiredNames) {
  prodSafetyBundle_();
  if (!sheet || !requiredNames || !requiredNames.length) return true;
  var lastCol = typeof sheet.getLastColumn === 'function' ? sheet.getLastColumn() : 0;
  var actual = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); }) : [];
  var have = {}; actual.forEach(function (h) { have[h] = 1; });
  var missing = requiredNames.filter(function (n) { return !have[n]; });
  if (missing.length) throw prodSchemaError_('MISSING_REQUIRED_HEADER', (sheet.getName ? sheet.getName() : ''), { missing: missing });
  return true;
}

// RULE S0-5 — Amazon exact destination-id gate. Amazon import targets a PROVEN-separate destination database
// (AMAZON_DESTINATION_SPREADSHEET_ID_), so it validates against that configured id (not the bound-db id). Pure
// exact-match: fail closed (WRONG_SPREADSHEET_TARGET) on blank config or a run id that differs from configured.
function prodAssertAmazonTarget_(runDestinationId) {
  var expected = (typeof AMAZON_DESTINATION_SPREADSHEET_ID_ !== 'undefined') ? String(AMAZON_DESTINATION_SPREADSHEET_ID_ || '').trim() : '';
  var actual = String(runDestinationId || '').trim();
  if (expected === '' || actual === '' || actual !== expected) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
  return true;
}

// RULE S0-3 — MIGRATION-ONLY create (retains the legacy insertSheet + Header write). Requires a valid Migration
// authorization DTO (KMSAFE.validateMigrationAuthorization); throws MIGRATION_AUTHORIZATION_REQUIRED otherwise. NOT
// reachable from any router action — callable only from an explicitly authorized migration tool.
function prodMigrateCreateSheet_(ss, name, headers, migrationAuth) {
  var S = prodSafetyBundle_();
  var auth = S.validateMigrationAuthorization(migrationAuth);
  if (!auth.valid) throw prodSchemaError_('MIGRATION_AUTHORIZATION_REQUIRED', name, { missing: auth.missing });
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sh;
}

// RULE S0-3 — MIGRATION-ONLY additive append (retains the legacy column append). Requires a valid Migration DTO.
function prodMigrateAppendColumns_(sheet, names, migrationAuth) {
  var S = prodSafetyBundle_();
  var auth = S.validateMigrationAuthorization(migrationAuth);
  if (!auth.valid) throw prodSchemaError_('MIGRATION_AUTHORIZATION_REQUIRED', (sheet.getName ? sheet.getName() : ''), { missing: auth.missing });
  var lastCol = Math.max(1, sheet.getLastColumn());
  var live = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = []; names.forEach(function (h) { if (h && live.indexOf(h) === -1 && missing.indexOf(h) === -1) missing.push(h); });
  if (missing.length) sheet.getRange(1, live.length + 1, 1, missing.length).setValues([missing]);
  return missing.length;
}
