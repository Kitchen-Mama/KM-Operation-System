/**
 * TEMP — F1-7N-FB-4G-A2-R3 §F.9 — APPEND `create_idempotency_key` TO shipping_allocation_drafts.
 *
 * PASTE → RUN DRY RUN → REVIEW → RUN COMMIT → REMOVE.
 *
 * Two entry points, and the dry run is not optional:
 *
 *     TEMP_A2R3_MIGRATION_DRY_RUN()     // reads only. Prints the exact before/after header, counts, checksums.
 *     TEMP_A2R3_MIGRATION_COMMIT()      // appends ONE header cell. Refuses unless the dry run would pass.
 *
 * WHAT COMMIT DOES, EXACTLY: it writes ONE cell — the header name in row 1 of the first column to the right of
 * the current header. It appends; it never inserts, never reorders, never touches a data row, never back-fills
 * a value, never deletes. Existing rows keep a blank key, and a blank key is never read as a replay of
 * anything (see sadFindHeaderByCreateKey_, which skips blanks).
 *
 * WHY THE COLUMN IS NEEDED: A2-R3 §B.2 settles that an explicit + Add Route is always a new ticket even when
 * its From / To / Method match an existing one, so a K4 collision may no longer refuse a create. That refusal
 * was the only thing stopping a retried click from producing a second ticket — measured, with it removed the
 * same create key sent twice produced two headers. This column is where the key lives so a retry can be
 * recognised. Until it exists, a CREATE refuses with ROUTE_CREATE_IDEMPOTENCY_NOT_PERSISTABLE rather than
 * degrading to a create with no protection.
 */

var TEMP_A2R3_TAB_ = 'shipping_allocation_drafts';
var TEMP_A2R3_COLUMN_ = 'create_idempotency_key';

/** Read-only plan. Prints everything COMMIT would rely on, and decides GO / NO-GO. */
function TEMP_A2R3_MIGRATION_DRY_RUN() { return tempA2R3Run_(false); }

/** Appends the one header cell. Re-runs every dry-run check first and refuses on any NO-GO. */
function TEMP_A2R3_MIGRATION_COMMIT() { return tempA2R3Run_(true); }

function tempA2R3Run_(commit) {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }

  p('TEMP A2-R3 MIGRATION ' + (commit ? 'COMMIT' : 'DRY RUN') + ' — ' + TEMP_A2R3_TAB_ + '.' + TEMP_A2R3_COLUMN_);
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // The canonical authority must come from the DEPLOYED 16_, never from a copy in this file: a migration that
  // carries its own idea of the schema is how a column ends up at the wrong index.
  if (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ === 'undefined') {
    p('AUTHORITY_NOT_LOADED: SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_');
    p('Open the Apps Script project that contains 16_shipping_allocation_handlers.gs and run it there.');
    p('BLOCKED');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }
  var authority = SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_;
  var wantIndex = authority.indexOf(TEMP_A2R3_COLUMN_);
  if (wantIndex === -1) {
    p('AUTHORITY_DOES_NOT_DECLARE_' + TEMP_A2R3_COLUMN_ + ' — the deployed 16_ predates A2-R3.');
    p('Sync 16_shipping_allocation_handlers.gs FIRST, then run this again.');
    p('BLOCKED');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TEMP_A2R3_TAB_);
  if (!sh) {
    p('BLOCKED — ' + TEMP_A2R3_TAB_ + ' is not present in this spreadsheet.');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  var values = sh.getDataRange().getValues();
  var rawHeader = (values && values[0]) ? values[0].map(function (x) { return String(x).trim(); }) : [];
  // Trailing all-blank cells are not real columns.
  var live = rawHeader.slice();
  while (live.length && live[live.length - 1] === '') live.pop();
  var dataRows = Math.max(0, (values ? values.length : 0) - 1);

  p('BEFORE');
  p('  live header length : ' + live.length);
  p('  data rows          : ' + dataRows);
  p('  live header        : ' + JSON.stringify(live));
  p('  canonical length   : ' + authority.length + '   (' + TEMP_A2R3_COLUMN_ + ' at index ' + wantIndex + ')');
  p('  checksum(live)     : ' + tempA2R3Checksum_(live.join('')));
  rule();

  // ---- GO / NO-GO ------------------------------------------------------------------------------------------
  var blockers = [];
  if (live.indexOf(TEMP_A2R3_COLUMN_) !== -1) {
    p('ALREADY PRESENT at index ' + live.indexOf(TEMP_A2R3_COLUMN_) + '.');
    if (live.indexOf(TEMP_A2R3_COLUMN_) !== wantIndex) {
      blockers.push('PRESENT_AT_WRONG_INDEX: found at ' + live.indexOf(TEMP_A2R3_COLUMN_) + ', canonical is ' + wantIndex);
    } else {
      p('  and at the canonical index. NOTHING TO DO.');
      p('AFTER  (unchanged)');
      p('  live header length : ' + live.length);
      p('  checksum(live)     : ' + tempA2R3Checksum_(live.join('')));
      p('CELLS_WRITTEN=0 . ROWS_INSERTED=0 . ROWS_DELETED=0 . BACKFILLS=0');
      p('NO_OP');
      Logger.log(out.join('\n'));
      return out.join('\n');
    }
  }
  // The live header must be a byte-exact PREFIX of the authority, and appending must land exactly at wantIndex.
  for (var i = 0; i < live.length; i++) {
    if (live[i] !== authority[i]) {
      blockers.push('PREFIX_MISMATCH at index ' + i + ': live "' + live[i] + '" vs canonical "' + authority[i] + '"');
      break;
    }
  }
  if (live.length !== wantIndex) {
    blockers.push('APPEND_INDEX_MISMATCH: appending would land at index ' + live.length + ', canonical is ' + wantIndex +
      (live.length < wantIndex ? ' — an EARLIER optional column is still missing and must be migrated first' : ' — the sheet already has more columns than expected'));
  }
  if (rawHeader.length > live.length) {
    // A trailing blank header cell would make the append land one column too far right.
    p('NOTE: the header row has ' + (rawHeader.length - live.length) + ' trailing BLANK cell(s); the append uses the');
    p('      trimmed length (' + live.length + '), so it writes into the first of them rather than past them.');
  }

  if (blockers.length) {
    p('NO-GO');
    blockers.forEach(function (b) { p('  · ' + b); });
    p('CELLS_WRITTEN=0 . ROWS_INSERTED=0 . ROWS_DELETED=0 . BACKFILLS=0');
    p('BLOCKED — nothing was written. Fix the shape above (or migrate the earlier optional columns) first.');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  var after = live.concat([TEMP_A2R3_COLUMN_]);
  p('GO');
  p('  action             : write ONE header cell — row 1, column ' + (live.length + 1) + ' (1-based)');
  p('  value              : "' + TEMP_A2R3_COLUMN_ + '"');
  p('  data rows touched  : 0   (existing rows keep a BLANK key; no back-fill, ever)');
  p('  AFTER header length: ' + after.length);
  p('  AFTER header       : ' + JSON.stringify(after));
  p('  checksum(after)    : ' + tempA2R3Checksum_(after.join('')));
  rule();

  if (!commit) {
    p('DRY RUN ONLY — NOTHING WAS WRITTEN.');
    p('CELLS_WRITTEN=0 . ROWS_INSERTED=0 . ROWS_DELETED=0 . BACKFILLS=0');
    p('Review the AFTER header and checksum above, then run TEMP_A2R3_MIGRATION_COMMIT().');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }

  // ---- COMMIT: exactly one cell ----------------------------------------------------------------------------
  var lock = LockService.getScriptLock();
  var haveLock = false;
  try { haveLock = lock.tryLock(30000); } catch (eL) { haveLock = false; }
  if (!haveLock) {
    p('BLOCKED — could not acquire the script lock. CELLS_WRITTEN=0. Nothing was written; try again.');
    Logger.log(out.join('\n'));
    return out.join('\n');
  }
  try {
    // Re-read under the lock: the shape must still be what the dry run approved.
    var recheck = sh.getDataRange().getValues();
    var rh = (recheck && recheck[0]) ? recheck[0].map(function (x) { return String(x).trim(); }) : [];
    var rl = rh.slice(); while (rl.length && rl[rl.length - 1] === '') rl.pop();
    if (rl.join('') !== live.join('')) {
      p('BLOCKED — the header changed between the plan and the commit. CELLS_WRITTEN=0.');
      Logger.log(out.join('\n'));
      return out.join('\n');
    }
    sh.getRange(1, live.length + 1).setValue(TEMP_A2R3_COLUMN_);
  } finally {
    try { lock.releaseLock(); } catch (eR) {}
  }

  var verify = sh.getDataRange().getValues();
  var vh = (verify && verify[0]) ? verify[0].map(function (x) { return String(x).trim(); }) : [];
  var vl = vh.slice(); while (vl.length && vl[vl.length - 1] === '') vl.pop();
  var verifiedRows = Math.max(0, (verify ? verify.length : 0) - 1);

  p('COMMITTED');
  p('  AFTER header length: ' + vl.length + '   (expected ' + after.length + ')');
  p('  AFTER header       : ' + JSON.stringify(vl));
  p('  checksum(after)    : ' + tempA2R3Checksum_(vl.join('')));
  p('  checksum expected  : ' + tempA2R3Checksum_(after.join('')));
  p('  MATCHES PLAN       : ' + (tempA2R3Checksum_(vl.join('')) === tempA2R3Checksum_(after.join(''))));
  p('  data rows          : ' + verifiedRows + '   (expected ' + dataRows + ', unchanged)');
  p('  ROWS UNCHANGED     : ' + (verifiedRows === dataRows));
  p('CELLS_WRITTEN=1 . ROWS_INSERTED=0 . ROWS_DELETED=0 . BACKFILLS=0 . VALUES_WRITTEN_TO_DATA_ROWS=0');
  p('');
  p('Remove this file from the project now that the migration has run.');

  Logger.log(out.join('\n'));
  return out.join('\n');
}

/** FNV-1a over the header names — a short, stable fingerprint of the exact shape, for the report. */
function tempA2R3Checksum_(s) {
  var h = 0x811c9dc5;
  s = String(s == null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8).toUpperCase();
}
