/**
 * TEMP_migrate_factory_stock_override_audit_r5.gs — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1 §A
 * PASTE · DRY RUN · REVIEW · COMMIT · REMOVE.
 *
 * Provisions ONE new append-only table, `factory_stock_override_audit`, and does nothing else.
 *
 *   TEMP_FSOA_R5_MIGRATE_DRY_RUN()   READ-ONLY. Prints expected headers, existing headers, missing, extra, order
 *                                    mismatch, the verdict, and the confirmation checksum. WRITES = 0.
 *   TEMP_FSOA_R5_MIGRATE_COMMIT()    THE ONLY WRITER. Refuses until a human pastes the checksum into
 *                                    TEMP_FSOA_R5_REVIEWED_CHECKSUM_ below. ADDITIVE CREATE ONLY.
 *   TEMP_FSOA_R5_VALIDATE()          READ-ONLY validator, runnable before and after. WRITES = 0.
 *
 * ==============================================================================================================
 * WHY THIS FILE EXISTS AT ALL — R5 GOT THIS WRONG AND THE CORRECTION IS THE POINT
 * ==============================================================================================================
 * R5 shipped the override audit ledger with the sentence "created additively by fcWriteEnsureSheet_ the first
 * time an overage is actually confirmed". Both halves were false, and the second half was the dangerous one.
 *
 *   1. `fcWriteEnsureSheet_` creates NOTHING. It is `prodRequireSheet_` (29_), which THROWS
 *      SCHEMA_NOT_PROVISIONED on an absent sheet — Production Safety RULE S0-3 moved every create behind an
 *      authorized migration DTO, and a standing suite asserts that no ensure-helper contains `insertSheet`.
 *   2. So the throw landed in the caller's try/catch, was recorded as `auditRows = -1`, AND THE TRANSITION
 *      CONTINUED. A plan reached Pending Approval carrying an accepted overage with no record anywhere. An
 *      override whose justification was never written is the exact thing the ledger exists to prevent.
 *
 * The runtime now REQUIRES this table before it will honour a confirmation, and refuses with
 * FACTORY_STOCK_OVERRIDE_AUDIT_SCHEMA_MISSING and zero writes when it is absent or its 25 columns do not match.
 * That refusal is safe — the plan stays in Draft — but it is also a wall, and this file is the door.
 *
 * THE FIRST REAL SUBMIT OF AN OPERATOR'S WEEK MUST NOT ALSO BE A SCHEMA MIGRATION. That is the whole argument.
 *
 * ==============================================================================================================
 * WHY THE EXPECTED SCHEMA IS READ FROM THE SHIPPED RUNTIME AND NEVER COPIED HERE
 * ==============================================================================================================
 * `FSG_OVERRIDE_AUDIT_HEADERS_` and `FSG_OVERRIDE_AUDIT_TABLE_` are read from 71_api_v1_factory_stock_guard.gs.
 * There is NO local copy and NO fallback list. A tool carrying its own copy of a schema is a tool that can
 * disagree with production, and the disagreement would be invisible: it would create 25 plausible columns that
 * the runtime then refuses, and the operator would have run a migration and still be blocked.
 *
 * So if this file is pasted into a project that has not been synced to R5-R1, it cannot find its authority and
 * it STOPS. It does not guess.
 *
 * ==============================================================================================================
 * WHAT THIS FILE WILL NEVER DO
 * ==============================================================================================================
 * It touches exactly ONE sheet name, and only when that sheet does not exist or has an empty header row. It
 * never renames, never drops, never deletes a row, never reorders a column, never appends a column to any
 * EXISTING table, and never writes a data row. It reads `warehouses`, `factory_stock`, `shipping_plans` and
 * every other canonical table exactly zero times.
 *
 * It never populates a value. The ledger is created EMPTY: one header row, no data. Every audit row is written
 * later by the runtime, inside the plan transition's own journal.
 *
 * The create goes through `prodMigrateCreateSheet_` (29_) with a full migration authorization DTO. There is no
 * bare `insertSheet` anywhere in this file — RULE S0-3 owns creation, and a migration tool that walks around
 * the rule it is subject to is not a migration tool.
 *
 * ROLLBACK. Delete the tab. The table is append-only, referenced by nothing, and joined to nothing by FK; the
 * runtime returns to refusing overage confirmations rather than to writing unrecorded ones. If it already holds
 * rows, deleting it destroys the only record of those overrides — so a rollback after real use is a decision,
 * not a cleanup.
 */

var TEMP_FSOA_R5_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';
var TEMP_FSOA_R5_OPERATION_ = 'R5R1-FACTORY-STOCK-OVERRIDE-AUDIT-CREATE-1';

// ==============================================================================================================
// PASTE THE CHECKSUM PRINTED BY TEMP_FSOA_R5_MIGRATE_DRY_RUN() HERE, THEN RUN THE COMMIT.
//
// The Apps Script Run selector cannot pass arguments, so the confirmation lives where the operator already is:
// ONE constant, edited by hand, in the file being run. It is not read from Script Properties on purpose — a
// persisted confirmation outlives the intent that recorded it, and this file is meant to be deleted.
//
// The checksum is RECOMPUTED LIVE at commit time, twice — once before the lock and once under it — and must
// equal this constant EXACTLY. A reviewed plan that has gone stale cannot authorise anything. A blank constant
// is a refusal. There is no default, no fallback, no `||` and no environment lookup.
// ==============================================================================================================
var TEMP_FSOA_R5_REVIEWED_CHECKSUM_ = '';

function tempFsoaStr_(v) { return String(v == null ? '' : v).trim(); }
function tempFsoaHash_(s) {
  var h = 0x811c9dc5, t = String(s == null ? '' : s);
  for (var i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}

// THE AUTHORITY, read from the shipped runtime. No local copy, no fallback.
function tempFsoaAuthority_() {
  var missing = [];
  if (typeof FSG_OVERRIDE_AUDIT_TABLE_ === 'undefined') missing.push('FSG_OVERRIDE_AUDIT_TABLE_');
  if (typeof FSG_OVERRIDE_AUDIT_HEADERS_ === 'undefined') missing.push('FSG_OVERRIDE_AUDIT_HEADERS_');
  if (typeof FSG_BUILD_VERSION_ === 'undefined') missing.push('FSG_BUILD_VERSION_');
  if (typeof prodMigrateCreateSheet_ !== 'function') missing.push('prodMigrateCreateSheet_');
  if (typeof prodExpectedDbId_ !== 'function') missing.push('prodExpectedDbId_');
  if (missing.length) {
    return { ok: false, missing_authorities: missing,
      reason: 'AUTHORITY_MISSING — this project has not been synced to ' + TEMP_FSOA_R5_BUILD_VERSION_
        + '. Sync 71_api_v1_factory_stock_guard.gs and 29_production_safety_adapter.gs first. Nothing was read '
        + 'and nothing was written.' };
  }
  return { ok: true, table: FSG_OVERRIDE_AUDIT_TABLE_, headers: FSG_OVERRIDE_AUDIT_HEADERS_.slice(),
    guard_build: FSG_BUILD_VERSION_ };
}

/**
 * THE ONE ANALYSIS BOTH ENTRY POINTS USE. READ ONLY — no branch of this function writes.
 *
 * Returns { ok, verdict, table, expected_headers, existing_headers, missing_headers, extra_headers,
 *           order_matches, row_count, checksum, plan }.
 *
 * VERDICTS
 *   NO_ACTION_ALREADY_EXACT   the table exists with all 25 columns in order. A commit does nothing.
 *   WILL_CREATE               the table is absent. A commit creates it EMPTY with the 25-column header row.
 *   WILL_WRITE_HEADER_ONLY    the tab exists but has no header row at all. A commit writes row 1 only.
 *   BLOCKED_HEADER_MISMATCH   the tab exists with a DIFFERENT header. A commit refuses — see the note.
 */
function tempFsoaAnalyze_(ss) {
  var auth = tempFsoaAuthority_();
  if (!auth.ok) return { ok: false, verdict: 'BLOCKED_AUTHORITY_MISSING', writes: 0, detail: auth };

  var out = { ok: true, writes: 0, dry_run: true,
    build: TEMP_FSOA_R5_BUILD_VERSION_, operation: TEMP_FSOA_R5_OPERATION_, guard_build: auth.guard_build,
    table: auth.table, expected_headers: auth.headers.slice(), expected_column_count: auth.headers.length,
    exists: false, existing_headers: null, existing_column_count: 0,
    missing_headers: [], extra_headers: [], order_matches: null, row_count: 0,
    verdict: null, plan: null, checksum: null, spreadsheet_id_matches_configured_db: null };

  // The exact-target gate FIRST. A migration that ran against the wrong spreadsheet is not recoverable by
  // reading a report afterwards.
  try { prodAssertDbTarget_(ss); out.spreadsheet_id_matches_configured_db = true; }
  catch (eT) {
    out.ok = false; out.verdict = 'BLOCKED_WRONG_SPREADSHEET_TARGET';
    out.spreadsheet_id_matches_configured_db = false;
    out.detail = 'The bound spreadsheet is not the configured production database. Nothing was read further.';
    return out;
  }

  var sh = null;
  try { sh = ss.getSheetByName(auth.table); } catch (e) { sh = null; }
  if (!sh) {
    out.verdict = 'WILL_CREATE';
    out.plan = 'Create ONE new sheet named `' + auth.table + '` and write its ' + auth.headers.length
      + '-column header row. No data row. No other sheet is touched.';
  } else {
    out.exists = true;
    var lastCol = 0, lastRow = 0;
    try { lastCol = sh.getLastColumn(); lastRow = sh.getLastRow(); } catch (e2) { lastCol = 0; lastRow = 0; }
    out.row_count = Math.max(0, lastRow - 1);
    var live = lastCol > 0
      ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return tempFsoaStr_(h); })
      : [];
    out.existing_headers = live;
    out.existing_column_count = live.length;
    auth.headers.forEach(function (h) { if (live.indexOf(h) === -1) out.missing_headers.push(h); });
    live.forEach(function (h) { if (h && auth.headers.indexOf(h) === -1) out.extra_headers.push(h); });
    out.order_matches = live.slice(0, auth.headers.length).join('|') === auth.headers.join('|');
    if (!live.length) {
      out.verdict = 'WILL_WRITE_HEADER_ONLY';
      out.plan = 'The tab `' + auth.table + '` exists with an EMPTY header row. Write row 1 only ('
        + auth.headers.length + ' cells). No data row is touched — there are ' + out.row_count + '.';
    } else if (!out.missing_headers.length && out.order_matches) {
      out.verdict = 'NO_ACTION_ALREADY_EXACT';
      out.plan = 'Nothing to do. The ledger is already provisioned and the runtime accepts it. A commit writes '
        + 'nothing.';
    } else {
      out.verdict = 'BLOCKED_HEADER_MISMATCH';
      out.plan = 'REFUSED. The tab exists with a different header. This file does NOT reorder or append columns '
        + 'on an existing sheet: a positional ledger with ' + out.row_count + ' row(s) already written cannot be '
        + 'reshaped without deciding what those rows mean, and that is a human decision. Rename the tab aside '
        + '(keeping it), then run the DRY RUN again — the verdict becomes WILL_CREATE.';
    }
  }

  // The confirmation checksum covers the OPERATION, the AUTHORITY and the EXACT LIVE STATE. Anything that
  // changes any of the three invalidates a reviewed plan, which is the only property that matters here.
  out.checksum = 'fsoar5-1-' + tempFsoaHash_([
    TEMP_FSOA_R5_OPERATION_, auth.guard_build, auth.table, auth.headers.join('|'),
    out.verdict, out.exists ? '1' : '0', (out.existing_headers || []).join('|'), String(out.row_count)
  ].join('~'));
  out.expected_header_hash = tempFsoaHash_(auth.headers.join(''));
  return out;
}

/** READ-ONLY. Prints the plan and the confirmation checksum. WRITES = 0 on every path. */
function TEMP_FSOA_R5_MIGRATE_DRY_RUN() {
  var out = tempFsoaAnalyze_(SpreadsheetApp.getActiveSpreadsheet());
  out.next_action = (out.verdict === 'WILL_CREATE' || out.verdict === 'WILL_WRITE_HEADER_ONLY')
    ? ('Paste this checksum into TEMP_FSOA_R5_REVIEWED_CHECKSUM_ and run TEMP_FSOA_R5_MIGRATE_COMMIT(): '
      + out.checksum)
    : 'No commit is required or permitted for this verdict.';
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * THE ONLY WRITER. Additive create (or an empty header row) — nothing else, ever.
 *
 * `execute` defaults to FALSE. Reaching the write requires all four of:
 *   1. a verdict of WILL_CREATE or WILL_WRITE_HEADER_ONLY,
 *   2. TEMP_FSOA_R5_REVIEWED_CHECKSUM_ equal to the checksum recomputed BEFORE the lock,
 *   3. the same checksum recomputed again UNDER the lock and still equal,
 *   4. a complete migration authorization DTO accepted by prodMigrateCreateSheet_.
 */
function tempFsoaMigrate_(ss, opts) {
  opts = opts || {};
  var execute = opts.execute === true;                     // DEFAULT FALSE. Never inferred from anything else.
  var out = { build: TEMP_FSOA_R5_BUILD_VERSION_, operation: TEMP_FSOA_R5_OPERATION_,
    execute: execute, dry_run: !execute, writes: 0, verdict: null, committed: false, detail: null };

  var pre = tempFsoaAnalyze_(ss);
  out.analysis = pre;
  if (!pre.ok) { out.verdict = pre.verdict; out.detail = 'Analysis refused; nothing was written.'; return out; }
  if (pre.verdict === 'NO_ACTION_ALREADY_EXACT') {
    out.verdict = 'NO_ACTION'; out.detail = 'The ledger is already provisioned exactly. Nothing was written.';
    return out;
  }
  if (pre.verdict === 'BLOCKED_HEADER_MISMATCH') {
    out.verdict = 'REFUSED_HEADER_MISMATCH'; out.detail = pre.plan; return out;
  }
  if (!execute) {
    out.verdict = 'DRY_RUN_ONLY';
    out.detail = 'execute is false (the default). ' + pre.plan;
    return out;
  }

  var reviewed = tempFsoaStr_(TEMP_FSOA_R5_REVIEWED_CHECKSUM_);
  if (!reviewed) {
    out.verdict = 'REFUSED_NO_REVIEWED_CHECKSUM';
    out.detail = 'TEMP_FSOA_R5_REVIEWED_CHECKSUM_ is blank. Run TEMP_FSOA_R5_MIGRATE_DRY_RUN(), read the plan, '
      + 'paste its checksum into that constant, then run this again. A blank constant is a refusal.';
    return out;
  }
  if (reviewed !== pre.checksum) {
    out.verdict = 'REFUSED_STALE_OR_WRONG_CHECKSUM';
    out.detail = 'The reviewed checksum does not match the live one. The database or the authority has moved '
      + 'since the plan was reviewed, so the review no longer authorises anything.';
    out.reviewed = reviewed; out.live = pre.checksum;
    return out;
  }

  var lock = LockService.getScriptLock(), locked = false;
  try { locked = lock.tryLock(30000); } catch (eL) { locked = false; }
  if (!locked) {
    out.verdict = 'REFUSED_LOCK_UNAVAILABLE';
    out.detail = 'Another writer holds the script lock. Nothing was written.';
    return out;
  }
  try {
    // RECOMPUTED UNDER THE LOCK. The state a review authorised has to still be the state being written.
    var mid = tempFsoaAnalyze_(ss);
    out.analysis_under_lock = mid;
    if (!mid.ok || mid.checksum !== reviewed) {
      out.verdict = 'REFUSED_STATE_MOVED_UNDER_LOCK';
      out.detail = 'The live state changed between the pre-lock read and the locked read. Nothing was written.';
      return out;
    }
    var auth = tempFsoaAuthority_();
    var dto = {
      migrationId: TEMP_FSOA_R5_OPERATION_,
      expectedSpreadsheetId: prodExpectedDbId_(),
      expectedSheetName: auth.table,
      // The table does not exist yet, so there is no OLD header. The hash of the empty header is the honest
      // value, and it is what makes "this DTO authorises a CREATE" checkable rather than asserted.
      expectedOldHeaderHash: tempFsoaHash_((mid.existing_headers || []).join('')),
      expectedNewHeaderHash: tempFsoaHash_(auth.headers.join('')),
      backupReference: 'NONE_REQUIRED — a create of an empty append-only table destroys no existing data; the '
        + 'rollback is deleting the tab. Reviewed checksum ' + reviewed,
      execute: true,
      actor: 'TEMP_FSOA_R5_MIGRATE_COMMIT'
    };
    out.migration_authorization = { migrationId: dto.migrationId, expectedSheetName: dto.expectedSheetName,
      expectedOldHeaderHash: dto.expectedOldHeaderHash, expectedNewHeaderHash: dto.expectedNewHeaderHash,
      execute: dto.execute, actor: dto.actor };

    // RULE S0-3 owns creation. This file does not contain insertSheet and does not want to.
    var sheet = prodMigrateCreateSheet_(ss, auth.table, auth.headers, dto);
    out.writes = 1;
    try { SpreadsheetApp.flush(); } catch (eF) {}

    // ---- READ IT BACK. A migration that reports success without reading the result is a claim.
    var post = tempFsoaAnalyze_(ss);
    out.analysis_after = post;
    if (post.verdict !== 'NO_ACTION_ALREADY_EXACT') {
      out.verdict = 'COMMIT_UNVERIFIED';
      out.detail = 'The create was issued but the read-back does not show an exact 25-column ledger. This is '
        + 'reported as UNVERIFIED rather than as a success. Inspect the tab before doing anything else.';
      return out;
    }
    if (post.row_count !== 0) {
      out.verdict = 'COMMIT_VERIFIED_WITH_UNEXPECTED_ROWS';
      out.detail = 'The header is exact but the tab already carries ' + post.row_count + ' data row(s), which '
        + 'this migration did not write. Reported rather than removed.';
      out.committed = true;
      return out;
    }
    out.committed = true;
    out.verdict = 'COMMIT_VERIFIED';
    out.detail = 'The ledger exists with ' + post.expected_column_count + ' columns in order and zero data '
      + 'rows. The runtime will now accept a confirmed overage. Delete this file from the project.';
    out.sheet_name = sheet && sheet.getName ? sheet.getName() : auth.table;
    return out;
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }
}

/** The COMMIT entry point. execute:true is passed HERE and nowhere else in this file. */
function TEMP_FSOA_R5_MIGRATE_COMMIT() {
  var out = tempFsoaMigrate_(SpreadsheetApp.getActiveSpreadsheet(), { execute: true });
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/**
 * READ-ONLY VALIDATOR. Runnable before the migration (expect ABSENT) and after (expect READY). WRITES = 0.
 *
 * It reports its own independent verdict AND, when 71_ is present, the runtime's own — because the only thing
 * worth validating is whether the RUNTIME will accept the table, and a validator that answers that question
 * from its own copy of the rule is validating itself.
 */
function TEMP_FSOA_R5_VALIDATE() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = { build: TEMP_FSOA_R5_BUILD_VERSION_, writes: 0, dry_run: true,
    tool_analysis: tempFsoaAnalyze_(ss),
    runtime_validator: (typeof fsgValidateOverrideAuditSchema_ === 'function')
      ? fsgValidateOverrideAuditSchema_(ss) : { unavailable: 'fsgValidateOverrideAuditSchema_ (71_) not synced' },
    runtime_would_accept: (typeof fsgRequireOverrideAuditSheet_ === 'function')
      ? fsgRequireOverrideAuditSheet_(ss).ok : null,
    rollback: 'Delete the `' + (typeof FSG_OVERRIDE_AUDIT_TABLE_ !== 'undefined' ? FSG_OVERRIDE_AUDIT_TABLE_ : 'factory_stock_override_audit')
      + '` tab. It is append-only, referenced by nothing and joined by no FK, so removing it undoes this '
      + 'migration completely — and returns the runtime to REFUSING overage confirmations rather than to '
      + 'writing unrecorded ones. If it already holds rows, deleting it destroys the only record of those '
      + 'overrides: that is a decision, not a cleanup.' };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
