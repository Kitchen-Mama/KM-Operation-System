/**
 * TEMP_migrate_fc_target_rules_header_r2ba2.gs — FC-SUMMARY-R2B-A2-R1 (paste-ready, USER-run migration tooling).
 *
 * PASTE-READY / NOT PERMANENT RUNTIME / NOT ROUTED. No router action reaches anything in this file; the only way
 * to run it is the Apps Script Run dropdown. After the migration is applied and accepted, this file is removed.
 *
 * WHAT IT REPAIRS, AND WHY A VALIDATOR CHANGE CANNOT.
 * Target Rule saves were refused with `PRODUCTION_SAFETY:HEADER_MISSING [fc_target_rules]`. That is a DIFFERENT
 * fault from the Special Event `HEADER_ORDER_MISMATCH` that FC-SUMMARY-R2B-A repaired. The live header row holds
 * 28 columns, but three of the canonical REQUIRED columns are genuinely absent:
 *
 *     scope_type          (the live sheet carries a legacy `scope` instead — a different column name)
 *     scope_id            (absent entirely)
 *     target_percentage   (absent entirely)
 *
 * Order tolerance cannot conjure a column that is not there. Worse, the writer resolves every cell by LIVE header
 * name, so if the gate were simply relaxed the values for those three fields would not be misplaced — they would
 * silently vanish, and a save would report success having dropped them. The columns have to actually exist.
 *
 * WHAT IT DOES NOT DO. It never renames a column, never reorders one, never deletes one, never touches a data
 * row, never creates a sheet, never writes outside `fc_target_rules`, and never syncs or deploys anything. The
 * three missing columns are appended at the RIGHT EDGE, which shifts no existing column index; and the table
 * currently holds zero data rows, so there is additionally no row whose values could be displaced.
 *
 * The legacy `scope`, `status` and `priority` columns are LEFT IN PLACE and left unwritten. They are additive
 * extras under the table's contract. `scope` in particular becomes a dormant twin of `scope_type` — recorded in
 * the report rather than quietly resolved, because deciding the fate of a live column is a schema decision and
 * this tool only appends.
 *
 * RUN THESE from the Apps Script Run dropdown (no arguments; the public entrypoints do NOT end with `_`):
 *   TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader()    — READS ONLY. Logs row 1 verbatim, the actual/expected/missing
 *                                                 table, the resulting header, both header hashes and the data
 *                                                 row count. Writes NOTHING.
 *   TEMP_R2BA2_EXECUTE_FcTargetRulesHeader()    — appends ONLY the genuinely missing required columns, once.
 *   TEMP_R2BA2_VALIDATE_FcTargetRulesHeader()   — READ-ONLY post-check, runnable any number of times.
 *
 * RUN ORDER: DRY RUN -> (read the log) -> EXECUTE -> VALIDATE. Never jump straight to EXECUTE.
 *
 * NO OAUTH SCOPE IS REQUIRED BEYOND WHAT THE PROJECT ALREADY HOLDS. This file calls no Session API: the
 * migration actor is the reviewed constant TEMP_R2BA2_MIGRATION_ACTOR_ below, and it is printed in the
 * DRY RUN, EXECUTE and VALIDATE logs so the evidence records who authorized the change.
 *
 * IDEMPOTENT BY CONSTRUCTION: EXECUTE recomputes the missing set from the live header every time. A second run
 * finds nothing missing and returns NO_OP without calling the migrator at all, so it cannot duplicate a header.
 */

// FC-SUMMARY-R2B-A2-R1-F1 — THE MIGRATION ACTOR, AND WHY IT IS A CONSTANT RATHER THAN A LOOKUP.
//
// The first live EXECUTE threw before it wrote anything:
//
//     Specified permissions are not sufficient to call Session.getActiveUser.
//     Required permission: https://www.googleapis.com/auth/userinfo.email
//
// The DTO asked the platform who was running it. That was the wrong question to ask HERE. Answering it
// needs the userinfo.email OAuth scope, and this project deliberately does not hold it: adding a scope to
// appsscript.json re-prompts every user for consent on the NEXT deployment and widens what the whole web
// app may do, permanently, so that a temporary helper could fill in one audit string. That is a production
// authorization change bought to serve a throwaway file, and the trade is not close.
//
// Session.getEffectiveUser() is NOT used either. It is documented to require the same userinfo.email scope
// for a bound script, so substituting it would be a guess dressed as a fix — and a guess that fails the
// same way, at the same line, on the next run. No Session API is called anywhere in this file.
//
// WHAT THE DTO ACTUALLY NEEDS. `actor` is an audit field: it records who authorized this one schema change.
// For a manually executed, unrouted, single-use migration the authorizing party is known BEFORE the run —
// it is the person who reviewed the plan and pressed Run — so it is a reviewed constant, not something to
// discover at runtime. This is the shape the repository already uses for exactly this situation:
// DEMO4A_ACTOR_ (TEMP_demo_shipping_shipment_map_seed_v2.gs:39), S1_CG_ACTOR_ and R6R6R3_ACTOR_ are all
// module-level fixed strings in USER-run TEMP files. No new pattern is invented here.
//
// IT IS NEVER SUPPLIED FROM OUTSIDE. Not from a request payload, not from a query string, not from
// localStorage, not from the browser, and not from a function argument. Nothing routes to this file, so
// there is no request for a value to arrive on; and because it is a `var` in this file alone, its blast
// radius is this file alone. It is removed with the file when the helper is retired.
var TEMP_R2BA2_MIGRATION_ACTOR_ = 'vic.zhou@shopkitchenmama.com';

// The canonical required contract. Read from the single authority in 14_ rather than restated here — a second
// copy of a header contract is how the original drift happened.
function tgtR2ba2Required_() {
  if (typeof FC_TARGET_RULES_HEADERS_ === 'undefined') {
    throw new Error('FC_TARGET_RULES_HEADERS_ is not present — sync 14_fc_write_handlers.gs into this project first.');
  }
  return FC_TARGET_RULES_HEADERS_.slice();
}

function tgtR2ba2Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

/** Read row 1 verbatim plus the shape facts the decision depends on. Pure read. */
function tgtR2ba2Snapshot_(sheet) {
  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  var actual = (lastRow >= 1 && lastCol >= 1)
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(tgtR2ba2Str_)
    : [];
  var seen = {}, duplicates = [], blanks = [];
  actual.forEach(function (h, i) {
    if (h === '') { blanks.push(i); return; }
    if (seen[h]) { if (duplicates.indexOf(h) === -1) duplicates.push(h); } else { seen[h] = 1; }
  });
  return { actual: actual, lastRow: lastRow, lastCol: lastCol,
    dataRows: Math.max(0, lastRow - 1), duplicates: duplicates, blanks: blanks };
}

/**
 * The migration core. `execute:false` (the DEFAULT — an omitted or malformed opts stays a DRY RUN) reads only.
 */
function TEMP_migrateFcTargetRulesHeader_(opts) {
  var execute = !!(opts && opts.execute === true);
  var S = (typeof KMSAFE !== 'undefined') ? KMSAFE : null;
  if (!S) throw new Error('KMSAFE is not present — sync 90_generated_supply_planning_bundle.gs into this project.');

  var expectedId = prodExpectedDbId_();
  if (!expectedId) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
  var ss = SpreadsheetApp.openById(expectedId);
  prodAssertDbTarget_(ss, expectedId);

  var NAME = 'fc_target_rules';
  var sheet = ss.getSheetByName(NAME);
  if (!sheet) throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', NAME, null);

  var required = tgtR2ba2Required_();
  var snap = tgtR2ba2Snapshot_(sheet);
  var report = {
    migrationId: 'FC-SUMMARY-R2B-A2-R1-fc_target_rules-additive-header',
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    // FC-SUMMARY-R2B-A2-R1-F1 — printed on EVERY path, including every refusal, and NOT read from anywhere.
    migrationActor: tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_),
    migrationActorSource: 'TEMP_R2BA2_MIGRATION_ACTOR_ (reviewed module constant in this file)',
    sheet: NAME,
    row1Verbatim: snap.actual.slice(),
    actualColumnCount: snap.actual.length,
    expectedRequiredCount: required.length,
    dataRowCount: snap.dataRows,
    duplicateHeaders: snap.duplicates,
    blankHeaderIndexes: snap.blanks,
    applied: false,
    outcome: ''
  };

  // ---- refusals that must happen BEFORE any decision, let alone any write --------------------------------
  if (!snap.actual.length) {
    report.outcome = 'REFUSED_NO_HEADER_ROW — the tab exists but carries no header row. That is a PROVISIONING '
      + 'step (write the full canonical header once), not an additive append, and it is deliberately not '
      + 'something this tool will do. Stop and re-decide.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }
  if (snap.duplicates.length || snap.blanks.length) {
    report.outcome = 'REFUSED_AMBIGUOUS_HEADER — a duplicate or blank header makes column identity ambiguous, so '
      + 'no append can be proven safe. Resolve the header by hand first.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  var have = {}; snap.actual.forEach(function (h) { have[h] = 1; });
  var missing = required.filter(function (h) { return !have[h]; });
  var extra = snap.actual.filter(function (h) { return required.indexOf(h) === -1; });
  var resulting = snap.actual.concat(missing);

  report.missingRequired = missing;
  report.extraBeyondContract = extra;
  report.resultingHeader = resulting;
  report.resultingColumnCount = resulting.length;
  report.oldHeaderHash = S.headerHash(snap.actual);
  report.newHeaderHash = S.headerHash(resulting);
  // Every required column, with where it is (or will be) — the dry-run table a reviewer actually reads.
  report.columnPlan = required.map(function (h) {
    var at = snap.actual.indexOf(h);
    return { column: h, presentNow: at !== -1, liveIndex: at, willSitAt: at !== -1 ? at : resulting.indexOf(h) };
  });

  if (!missing.length) {
    report.outcome = 'NO_OP — every required column is already present exactly once. Nothing to append. '
      + '(This is also what a SECOND execute returns, which is what makes the migration idempotent.)';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  if (!execute) {
    report.outcome = 'DRY_RUN_OK — ' + missing.length + ' required column(s) would be appended at the right edge: '
      + missing.join(', ') + '. No existing column moves; no data row is touched. Nothing was written.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  // ---- EXECUTE --------------------------------------------------------------------------------------------
  // FC-SUMMARY-R2B-A2-R1-F1 — the authorizing actor is a REQUIRED field of the migration DTO. If the constant
  // has been blanked, the migration is unauthorized and must stop here, before the re-read and before the
  // mutation, rather than reaching the adapter and throwing past this report.
  if (tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_) === '') {
    report.outcome = 'REFUSED_MIGRATION_ACTOR_MISSING — TEMP_R2BA2_MIGRATION_ACTOR_ is empty. `actor` is a '
      + 'required field of the migration authorization DTO and records who authorized this schema change. '
      + 'Set the reviewed constant at the top of this file. Nothing was written.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  // This tool was designed against a table with ZERO data rows. A populated table is a different decision and
  // deserves a fresh one, so it is refused rather than assumed to be equivalent.
  if (snap.dataRows !== 0) {
    report.outcome = 'REFUSED_UNEXPECTED_DATA_ROWS — this migration was authorized against an empty table and '
      + 'found ' + snap.dataRows + ' data row(s). Re-verify and re-authorize before appending.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  // The authorization DTO. `prodMigrateAppendColumns_` validates its SHAPE; the hashes below are additionally
  // verified against the live sheet here, because a DTO that merely looks well-formed proves nothing about the
  // sheet it is about to change.
  var auth = {
    migrationId: report.migrationId,
    expectedSpreadsheetId: expectedId,
    expectedSheetName: NAME,
    expectedOldHeaderHash: report.oldHeaderHash,
    expectedNewHeaderHash: report.newHeaderHash,
    backupReference: 'row1-verbatim-snapshot recorded in this report and in the FC-SUMMARY-R2B-A2-R1 release '
      + 'record; the table holds zero data rows, so row 1 IS the entire recoverable state',
    execute: true,
    // FC-SUMMARY-R2B-A2-R1-F1 — was `Session.getActiveUser().getEmail()`, which needs an OAuth scope this
    // project does not hold and threw here before a single header cell was written. See the constant above.
    actor: TEMP_R2BA2_MIGRATION_ACTOR_
  };

  // Re-read immediately before mutating and confirm the header has not moved under us since the snapshot.
  var confirm = tgtR2ba2Snapshot_(sheet);
  if (S.headerHash(confirm.actual) !== report.oldHeaderHash) {
    report.outcome = 'REFUSED_HEADER_CHANGED_DURING_RUN — the live header no longer hashes to the value this run '
      + 'planned against. Nothing was written. Re-run the DRY RUN.';
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  var appended = prodMigrateAppendColumns_(sheet, missing, auth);

  // ---- post-conditions, verified rather than assumed -------------------------------------------------------
  var after = tgtR2ba2Snapshot_(sheet);
  var post = {
    appendedCount: appended,
    row1After: after.actual.slice(),
    columnCountAfter: after.actual.length,
    dataRowCountAfter: after.dataRows,
    newHeaderHashActual: S.headerHash(after.actual),
    everyRequiredPresentExactlyOnce: required.every(function (h) {
      var n = 0; after.actual.forEach(function (x) { if (x === h) n++; }); return n === 1;
    }),
    noPreExistingHeaderMoved: snap.actual.every(function (h, i) { return after.actual[i] === h; }),
    noDataRowFabricated: after.dataRows === snap.dataRows,
    hashMatchesPlan: S.headerHash(after.actual) === report.newHeaderHash
  };
  report.postConditions = post;
  report.applied = true;
  report.outcome = (post.everyRequiredPresentExactlyOnce && post.noPreExistingHeaderMoved
      && post.noDataRowFabricated && post.hashMatchesPlan)
    ? 'APPLIED_OK — ' + appended + ' column(s) appended; every post-condition verified. Run '
      + 'TEMP_R2BA2_VALIDATE_FcTargetRulesHeader() to confirm independently.'
    : 'APPLIED_BUT_POST_CONDITION_FAILED — read postConditions and STOP. Do not run a Target Rule save.';
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/** READ-ONLY independent validator. Safe to run any number of times, before or after EXECUTE. */
function TEMP_validateFcTargetRulesHeader_() {
  var expectedId = prodExpectedDbId_();
  var ss = SpreadsheetApp.openById(expectedId);
  prodAssertDbTarget_(ss, expectedId);
  var sheet = ss.getSheetByName('fc_target_rules');
  if (!sheet) throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', 'fc_target_rules', null);
  var required = tgtR2ba2Required_(), snap = tgtR2ba2Snapshot_(sheet);
  var counts = {}; snap.actual.forEach(function (h) { counts[h] = (counts[h] || 0) + 1; });
  var out = {
    migrationActor: tgtR2ba2Str_(TEMP_R2BA2_MIGRATION_ACTOR_),
    migrationActorSource: 'TEMP_R2BA2_MIGRATION_ACTOR_ (reviewed module constant in this file)',
    row1: snap.actual, columnCount: snap.actual.length, dataRows: snap.dataRows,
    missingRequired: required.filter(function (h) { return !counts[h]; }),
    requiredAppearingMoreThanOnce: required.filter(function (h) { return counts[h] > 1; }),
    blankHeaderIndexes: snap.blanks, duplicateHeaders: snap.duplicates,
    extraBeyondContract: snap.actual.filter(function (h) { return required.indexOf(h) === -1; })
  };
  out.verdict = (!out.missingRequired.length && !out.requiredAppearingMoreThanOnce.length
    && !out.blankHeaderIndexes.length && !out.duplicateHeaders.length)
    ? 'CONTRACT_SATISFIED — every required column present exactly once; the write gate will now admit a Target Rule save.'
    : 'CONTRACT_NOT_SATISFIED — see the fields above. The write gate will continue to refuse, correctly.';
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

// ---- USER-runnable public entrypoints (no arguments; visible in the Apps Script Run dropdown) -----------------
// EXECUTE is the only path that can write, and it passes execute:true explicitly — so a Run with a forgotten
// argument can never fall into an ambiguous mode.
function TEMP_R2BA2_DRY_RUN_FcTargetRulesHeader() { return TEMP_migrateFcTargetRulesHeader_({ execute: false }); }
function TEMP_R2BA2_EXECUTE_FcTargetRulesHeader() { return TEMP_migrateFcTargetRulesHeader_({ execute: true }); }
function TEMP_R2BA2_VALIDATE_FcTargetRulesHeader() { return TEMP_validateFcTargetRulesHeader_(); }
