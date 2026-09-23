/**
 * TEMP — PRICING-R2-SCHEMA-ORDER-RECONCILIATION-R1 — REPAIR pricing_list COLUMN ORDER, THEN PROVISION.
 *
 * PASTE -> RUN DRY RUN -> REVIEW -> PASTE THE THREE EXPECT_ CONSTANTS -> RUN COMMIT -> VERIFY -> REMOVE.
 * Repository-only operator tool. NOT a release file, never synced as one, no manifest row, no stamp.
 *
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN()   // reads only. Prints the map, the proofs, the hashes.
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT()    // rewrites both layouts. Refuses unless both sheets are
 *                                                  // byte-identical to what the dry run measured.
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK()  // restores BOTH tables from the PRE snapshot pair.
 *
 * TWO TABLES, ONE PLAN. 73_ requires pricing_list AND pricing_change_log to validate before it writes
 * anything, so migrating one and leaving the other is not half a fix: it is a pair that still refuses every
 * price write, while looking like progress. They are planned together, gated together, snapshotted together,
 * and if the second write fails the first is rolled back — a half-migrated pair is the one resting state
 * worse than either end.
 *
 * WHY THIS EXISTS. The provisioning dry run refused: canonical position 3 expects `sku` and the live sheet
 * has `marketplace_id`. That is not a new problem introduced by PRICING-R2 — it is historical drift that has
 * been there since the table was built, and it was invisible because nothing had ever compared the live
 * order against the canonical one. prodRequireSheet_ does:
 *
 *     for (i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) orderMismatch = true;
 *
 * So the first 30 columns must BE PRICING_LIST_HEADERS_, in order. Adding the three flag columns to a sheet
 * in this state produces one that has every required column and still refuses every price write with
 * HEADER_ORDER_MISMATCH. The order has to be repaired first, and it has to be repaired in the same operation
 * that provisions the flags, because a sheet is only writable once BOTH are true.
 *
 * WHAT MAKES A REORDER SAFE HERE, and it was checked before this file was written rather than assumed: every
 * production path into pricing_list resolves columns BY HEADER NAME at runtime. 04_ builds its row with
 * prCol(name) against a header it re-reads each run and sizes the row to prHeaders.length; 02_, 58_, 59_ and
 * 72_ build name-keyed objects from the live header; 73_ reads through prwReadSheet_ and derives every write
 * index from sheetState.col(name). No production reader or writer holds a column NUMBER. If that ever stops
 * being true, this migration stops being safe, and the census that proves it lives in the test suite beside
 * this file rather than in a comment.
 *
 * THIS FILE CARRIES NO SCHEMA OF ITS OWN. The target layout is derived, every time, from the LIVE header plus
 * PRICING_LIST_HEADERS_ as the deployed 73_ declares it. A migration that knows the schema independently is
 * how a column ends up in the wrong place, and the wrong place is the entire fault being repaired.
 *
 * EXTENSION COLUMNS ARE PRESERVED, NEVER INVENTED. Whatever non-canonical columns the live sheet carries are
 * kept, in their existing relative order, to the RIGHT of the canonical block — which is exactly where
 * classifySchemaMismatch tolerates them (extraColumnsPolicy ALLOW checks only the first expected.length
 * positions). Nothing is created because some code COULD write it: 04_ can write `asin` by name, but if the
 * live sheet has no such column then the live sheet has no such column, and adding one would be this tool
 * inventing data.
 */

// ---- THE DRIFT GATE ----------------------------------------------------------------------------------------
// COMMIT recomputes every one of these against the live sheets and refuses on any difference, so a sheet
// edited between the review and the run cannot be migrated against a stale plan.
//
// pricing_list is FROZEN from the live evidence: two consecutive dry runs on 2026-09-23 reproduced these
// values exactly, which is the only reason they are written down here rather than left blank. Reproducing
// once proves a read; reproducing twice proves the sheet is not moving under us.
var TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = '1dd810353e233545ee4a35e3e48f064e9ffb1b663c1694d34708e393c0b8c068';
var TEMP_PR2S_EXPECT_LOGICAL_HASH_ = 'a65a7638b6ba8bc8a9724192a9f6f3ef73b5adecaf89682f034fe89623bb2ba0';
var TEMP_PR2S_EXPECT_ROW_COUNT_ = 495;

// pricing_change_log is NOT frozen, and is deliberately left blank. Its live hashes have never been
// measured — the dry run that would have printed them was truncated before it got there. A constant
// invented to make a gate pass is not a gate. The next DRY RUN prints these three; paste them then.
var TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ = '';
var TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ = '';
var TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ = -1;

// ---- THE DECLARED RENAME -----------------------------------------------------------------------------------
// live header name -> canonical name. Header only; no value is ever transformed. This table is the entire
// rename authority, so a rename that is not written here does not happen, and one that is written here was
// audited before it was written. See the RENAME section in the run for what that audit found.
var TEMP_PR2S_LOG_RENAME_ = { pricing_log_id: 'log_id' };

var TEMP_PR2S_PRICE_TAB_ = 'pricing_list';
var TEMP_PR2S_LOG_TAB_ = 'pricing_change_log';
var TEMP_PR2S_SNAPSHOT_PREFIX_ = 'PRE__pricing_list__';
var TEMP_PR2S_LOG_SNAPSHOT_PREFIX_ = 'PRE__pricing_change_log__';
var TEMP_PR2S_LOCK_MS_ = 30000;

function TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN() { return tempPr2sRun_(false); }
function TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT() { return tempPr2sRun_(true); }

function tempPr2sStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tempPr2sSha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) { var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16); h += v.length === 1 ? '0' + v : v; }
  return h;
}

/**
 * THE LOGICAL HASH — pricing_id + FIELD NAME + value, with the field names SORTED.
 *
 * Sorting is what makes it survive the one thing this migration does on purpose: moving columns. A hash over
 * physical order would change simply because the migration worked, and would therefore prove nothing about
 * the values. Computed over a FIXED field list (the PRE field names) on both sides, so the three columns that
 * did not exist before cannot move the number either.
 */
function tempPr2sLogicalHash_(header, grid, fieldList) {
  var idx = {}; header.forEach(function (h, i) { idx[h] = i; });
  var fields = fieldList.slice().sort();
  var idCol = idx['pricing_id'];
  var lines = [];
  for (var r = 1; r < grid.length; r++) {
    var id = tempPr2sStr_(grid[r][idCol]);
    var parts = [];
    for (var f = 0; f < fields.length; f++) {
      var c = idx[fields[f]];
      parts.push(fields[f] + '|~|' + (c === undefined ? '' : tempPr2sStr_(grid[r][c])));
    }
    lines.push(id + '|#|' + parts.join('|#|'));
  }
  return tempPr2sSha_(lines.join('\n'));
}

function tempPr2sRun_(commit) {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R2 SCHEMA ORDER RECONCILIATION — ' + (commit ? 'COMMIT' : 'DRY RUN'));
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // ---- AUTHORITY -------------------------------------------------------------------------------------------
  if (typeof PRICING_LIST_HEADERS_ === 'undefined' || typeof PRICING_MANUAL_FLAG_COLUMNS_ === 'undefined'
      || typeof PRICING_CHANGE_LOG_HEADERS_ === 'undefined') {
    p('AUTHORITY_NOT_LOADED — 73_api_v1_pricing_write.gs is not in this project. Sync it and SAVE first.');
    p('BLOCKED'); return done();
  }
  var CANON = PRICING_LIST_HEADERS_.slice();
  var FLAGS = PRICING_MANUAL_FLAG_COLUMNS_.slice();
  var LOGCANON = PRICING_CHANGE_LOG_HEADERS_.slice();
  p('authority 73_ build: ' + (typeof PRW_BUILD_VERSION_ === 'string' ? PRW_BUILD_VERSION_ : '(unknown)'));
  p('CANONICAL_PRICING_HEADERS (' + CANON.length + '): ' + CANON.join(', '));
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TEMP_PR2S_PRICE_TAB_);
  if (!sh) { p('BLOCKED — ' + TEMP_PR2S_PRICE_TAB_ + ' is not present.'); return done(); }

  var grid = sh.getDataRange().getValues();
  var live = (grid[0] || []).map(tempPr2sStr_);
  var rowCount = grid.length - 1;

  // ---- VALIDATE THE LIVE HEADER ITSELF -----------------------------------------------------------------------
  var dupes = {}, seenH = {}, blanks = [];
  live.forEach(function (h, i) {
    if (h === '') { blanks.push(i + 1); return; }
    if (seenH[h]) dupes[h] = 1; else seenH[h] = i + 1;
  });
  var dupNames = Object.keys(dupes);
  p('LIVE header (' + live.length + ' columns), ROW_COUNT = ' + rowCount);
  live.forEach(function (h, i) { p('  ' + String(i + 1).padStart(2) + ' ' + (h === '' ? '(BLANK)' : h)); });
  p('DUPLICATE_HEADER_NAMES = ' + dupNames.length + (dupNames.length ? ' — ' + dupNames.join(', ') : ''));
  p('UNKNOWN_LIVE_COLUMNS   = ' + blanks.length + (blanks.length ? ' at position(s) ' + blanks.join(', ') : ''));
  if (dupNames.length || blanks.length) {
    p('BLOCKED — a duplicate or blank header name makes a by-name migration ambiguous. There is no safe');
    p('automatic answer to "which of these two columns did the data mean"; a person has to decide.');
    return done();
  }

  // ---- CLASSIFY ---------------------------------------------------------------------------------------------
  var canonSet = {}; CANON.forEach(function (h) { canonSet[h] = 1; });
  var liveCanonical = live.filter(function (h) { return canonSet[h]; });
  var extensions = live.filter(function (h) { return !canonSet[h]; });
  var missingCanon = CANON.filter(function (h) { return live.indexOf(h) === -1; });
  rule();
  p('CLASSIFICATION');
  live.forEach(function (h, i) {
    p('  ' + String(i + 1).padStart(2) + ' ' + h + '  ->  ' + (canonSet[h] ? 'CANONICAL_REQUIRED' : 'EXTRA_EXTENSION'));
  });
  p('LIVE_EXTENSION_COLUMNS = ' + (extensions.length ? extensions.join(', ') : '(none)'));
  p('canonical columns absent from live = ' + (missingCanon.length ? missingCanon.join(', ') : '(none)'));
  var missingNonFlag = missingCanon.filter(function (h) { return FLAGS.indexOf(h) === -1; });
  if (missingNonFlag.length) {
    p('BLOCKED — the live sheet is missing canonical column(s) this tool does not provision: '
      + missingNonFlag.join(', ') + '. It provisions the three authority flags and nothing else.');
    return done();
  }

  // ---- TARGET LAYOUT, DERIVED --------------------------------------------------------------------------------
  var target = CANON.concat(extensions);
  rule();
  p('TARGET header (' + target.length + ' columns) = canonical ' + CANON.length
    + ' + ' + extensions.length + ' preserved extension(s), extensions to the RIGHT of the canonical block');
  target.forEach(function (h, i) { p('  ' + String(i + 1).padStart(2) + ' ' + h); });

  rule();
  p('OLD_TO_NEW_COLUMN_MAP');
  p('  OLD_COLUMN                   OLD_INDEX  NEW_INDEX  CLASSIFICATION');
  var moved = 0;
  live.forEach(function (h, i) {
    var ni = target.indexOf(h) + 1;
    if (ni !== i + 1) moved++;
    p('  ' + h + new Array(Math.max(2, 29 - h.length)).join(' ')
      + String(i + 1).padStart(6) + String(ni).padStart(11) + '     ' + (canonSet[h] ? 'CANONICAL_REQUIRED' : 'EXTRA_EXTENSION'));
  });
  FLAGS.forEach(function (h) {
    if (live.indexOf(h) !== -1) return;
    p('  ' + h + new Array(Math.max(2, 29 - h.length)).join(' ')
      + '     -' + String(target.indexOf(h) + 1).padStart(11) + '     NEW (blank / UNKNOWN)');
  });
  var wouldAdd = FLAGS.filter(function (h) { return live.indexOf(h) === -1; }).length;
  var wouldDrop = live.filter(function (h) { return target.indexOf(h) === -1; }).length;
  p('');
  p('would_move_columns = ' + moved);
  p('would_add_columns  = ' + wouldAdd);
  p('would_drop_columns = ' + wouldDrop);
  if (wouldDrop !== 0) {
    p('BLOCKED — this tool never drops a column. would_drop_columns must be 0.');
    return done();
  }

  // ---- PROJECT THE NEW GRID, BY NAME --------------------------------------------------------------------------
  // Values move by NAME, never by number. A by-number projection would be correct only by coincidence and
  // would silently mis-assign every column the moment the live order differs — which it does, which is why
  // this tool exists at all.
  var liveIdx = {}; live.forEach(function (h, i) { liveIdx[h] = i; });
  var projected = [target.slice()];
  for (var r = 1; r < grid.length; r++) {
    var row = new Array(target.length);
    for (var c = 0; c < target.length; c++) {
      var name = target[c];
      row[c] = Object.prototype.hasOwnProperty.call(liveIdx, name) ? grid[r][liveIdx[name]] : '';
    }
    projected.push(row);
  }

  // ---- HASHES --------------------------------------------------------------------------------------------------
  var preFields = live.slice();                       // the fixed field set both sides are measured over
  var liveHeaderHash = tempPr2sSha_(live.join('|#|'));
  var logicalPre = tempPr2sLogicalHash_(live, grid, preFields);
  var logicalProjected = tempPr2sLogicalHash_(target, projected, preFields);

  function idsHash(header, g) {
    var c = header.indexOf('pricing_id'), ids = [];
    for (var i = 1; i < g.length; i++) ids.push(tempPr2sStr_(g[i][c]));
    return tempPr2sSha_(ids.join('\n'));
  }
  var PRICE_FIELDS = ['currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
    'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
    'regular_price', 'minimum_price', 'msrp'];
  function priceHash(header, g) {
    var idx = {}; PRICE_FIELDS.forEach(function (f) { idx[f] = header.indexOf(f); });
    var i0 = header.indexOf('pricing_id'), lines = [];
    for (var i = 1; i < g.length; i++) {
      lines.push(tempPr2sStr_(g[i][i0]) + '|#|' + PRICE_FIELDS.map(function (f) {
        return idx[f] === -1 ? '' : tempPr2sStr_(g[i][idx[f]]);
      }).join('|#|'));
    }
    return tempPr2sSha_(lines.join('\n'));
  }

  rule();
  p('ROW_COUNT_PRE          = ' + rowCount);
  p('COLUMN_COUNT_PRE       = ' + live.length);
  p('LIVE_HEADER_HASH       = ' + liveHeaderHash);
  p('PRICING_IDS_PRE_HASH   = ' + idsHash(live, grid));
  p('PRICE_VALUES_PRE_HASH  = ' + priceHash(live, grid));
  p('FULL_LOGICAL_HASH_PRE  = ' + logicalPre);
  p('FULL_LOGICAL_HASH_PROJ = ' + logicalProjected + (logicalPre === logicalProjected ? '   MATCH' : '   *** MISMATCH ***'));
  if (logicalPre !== logicalProjected) {
    p('BLOCKED — the projection changes a value. The migration is a REARRANGEMENT; if the logical hash moves,');
    p('the projection is wrong and nothing should be written.');
    return done();
  }

  // ---- SAMPLE PROOF ---------------------------------------------------------------------------------------------
  rule();
  p('SAMPLE VALUE PROOF — OLD value vs projected NEW value, by name');
  var SAMPLE = ['pricing_id', 'sku', 'company', 'country', 'currency', 'base_regular_price', 'regular_price', 'note'];
  var shown = 0;
  for (var sr = 1; sr < grid.length && shown < 5; sr++) {
    var okRow = true, bits = [];
    SAMPLE.forEach(function (f) {
      var o = liveIdx[f] === undefined ? '(no such column)' : tempPr2sStr_(grid[sr][liveIdx[f]]);
      var n = target.indexOf(f) === -1 ? '(no such column)' : tempPr2sStr_(projected[sr][target.indexOf(f)]);
      if (o !== n) okRow = false;
      bits.push(f + ': ' + JSON.stringify(o) + (o === n ? ' == ' : ' != ') + JSON.stringify(n));
    });
    p('  row ' + (sr + 1) + (okRow ? '  ALL EQUAL' : '  *** DIFFERENCE ***'));
    bits.forEach(function (b) { p('      ' + b); });
    shown++;
  }

  // ---- pricing_change_log ------------------------------------------------------------------------------------
  // The second table, planned in the SAME reviewed operation. 73_ requires BOTH to validate before it will
  // write anything, so repairing one and leaving the other is not half a fix — it is a sheet that still
  // refuses every price write, while looking like progress.
  var logSh = ss.getSheetByName(TEMP_PR2S_LOG_TAB_);
  if (!logSh) { p('BLOCKED — ' + TEMP_PR2S_LOG_TAB_ + ' is not present.'); return done(); }
  var logGrid = logSh.getDataRange().getValues();
  var logLive = (logGrid[0] || []).map(tempPr2sStr_);
  var logRowCount = logGrid.length - 1;
  var logHeaderHash = tempPr2sSha_(logLive.join('|#|'));
  rule();
  p('LIVE pricing_change_log header (' + logLive.length + ' columns), ROW_COUNT = ' + logRowCount);
  logLive.forEach(function (h, i) { p('  ' + String(i + 1).padStart(2) + ' ' + (h === '' ? '(BLANK)' : h)); });

  var lDup = {}, lSeen = {}, lBlank = [];
  logLive.forEach(function (h, i) {
    if (h === '') { lBlank.push(i + 1); return; }
    if (lSeen[h]) lDup[h] = 1; else lSeen[h] = i + 1;
  });
  var lDupNames = Object.keys(lDup);
  p('CHANGE_LOG_DUPLICATE_HEADERS = ' + lDupNames.length + (lDupNames.length ? ' — ' + lDupNames.join(', ') : ''));
  p('CHANGE_LOG_BLANK_HEADERS     = ' + lBlank.length + (lBlank.length ? ' at position(s) ' + lBlank.join(', ') : ''));
  if (lDupNames.length || lBlank.length) {
    p('BLOCKED — a duplicate or blank header in ' + TEMP_PR2S_LOG_TAB_ + ' makes a by-name migration');
    p('ambiguous, exactly as it does in pricing_list. A person has to decide which column the data meant.');
    return done();
  }

  // ---- THE DECLARED RENAME ---------------------------------------------------------------------------------
  // Applied to the HEADER only; it never touches a value. It is a fixed table in this file rather than a
  // similarity guess, because "these two names look alike" is not evidence about what a column holds. What
  // makes THIS entry safe was established by audit before it was written, not inferred from the name:
  // pricing_log_id appears nowhere in the repository — no writer, no reader, no test, no spec — while every
  // consumer of this table's key reads log_id BY NAME, and the live table has zero rows, so there is no
  // value whose meaning could be re-assigned. If a row ever appears, RENAME_VALUE_PROOF below stops being
  // vacuous and starts being a check.
  var logEff = [], logRenames = [];
  logLive.forEach(function (h) {
    if (Object.prototype.hasOwnProperty.call(TEMP_PR2S_LOG_RENAME_, h)) {
      logRenames.push({ from: h, to: TEMP_PR2S_LOG_RENAME_[h] });
      logEff.push(TEMP_PR2S_LOG_RENAME_[h]);
    } else {
      logEff.push(h);
    }
  });
  p('RENAME_MAP = ' + (logRenames.length
    ? logRenames.map(function (r) { return r.from + ' -> ' + r.to; }).join(', ') : '(none applied)'));
  var effSeen = {}, effDup = [];
  logEff.forEach(function (h) { if (effSeen[h]) effDup.push(h); else effSeen[h] = 1; });
  if (effDup.length) {
    p('BLOCKED — after the rename, ' + effDup.join(', ') + ' would name two columns. The rename would merge');
    p('two distinct columns into one, and two columns are two facts. There is no version of this migration');
    p('allowed to decide which of them survives.');
    return done();
  }

  var logCanonSet = {}; LOGCANON.forEach(function (h) { logCanonSet[h] = 1; });
  var logExt = logEff.filter(function (h) { return !logCanonSet[h]; });
  var logMissingNonNew = LOGCANON.filter(function (h) { return h !== 'change_type' && logEff.indexOf(h) === -1; });
  p('CHANGE_LOG_EXTENSION_COLUMNS = ' + (logExt.length ? logExt.join(', ') : '(none)'));
  if (logMissingNonNew.length) {
    p('BLOCKED — pricing_change_log is missing canonical column(s) this tool does not provision: '
      + logMissingNonNew.join(', ') + '. It provisions change_type and applies the declared rename; nothing else.');
    return done();
  }
  var logTarget = LOGCANON.concat(logExt);
  p('TARGET pricing_change_log header (' + logTarget.length + '): ' + logTarget.join(', '));

  var logMoved = 0;
  logEff.forEach(function (h, i) { if (logTarget.indexOf(h) !== i) logMoved++; });
  var logAdd = LOGCANON.filter(function (h) { return logEff.indexOf(h) === -1; }).length;
  var logDrop = logEff.filter(function (h) { return logTarget.indexOf(h) === -1; }).length;
  p('change_log would_move_columns = ' + logMoved);
  p('change_log would_add_columns  = ' + logAdd);
  p('change_log would_drop_columns = ' + logDrop);
  if (logDrop !== 0) {
    p('BLOCKED — this tool never drops a column. change_log would_drop_columns must be 0.');
    return done();
  }

  // Values move by RENAMED NAME, never by number — the same rule pricing_list is projected under.
  var logEffIdx = {}; logEff.forEach(function (h, i) { logEffIdx[h] = i; });
  var logProjected = [logTarget.slice()];
  for (var lr = 1; lr < logGrid.length; lr++) {
    var lrow = new Array(logTarget.length);
    for (var lc = 0; lc < logTarget.length; lc++) {
      var ln = logTarget[lc];
      lrow[lc] = Object.prototype.hasOwnProperty.call(logEffIdx, ln) ? logGrid[lr][logEffIdx[ln]] : '';
    }
    logProjected.push(lrow);
  }

  // Measured over the POST-RENAME field names on both sides, so a rename is expected rather than flagged —
  // and a value that failed to travel with its renamed column still moves the number.
  var logPreFields = logEff.slice();
  var logLogicalPre = tempPr2sLogicalHash_(logEff, logGrid, logPreFields);
  var logLogicalProj = tempPr2sLogicalHash_(logTarget, logProjected, logPreFields);

  var renameBad = 0;
  logRenames.forEach(function (rn) {
    var fromC = logLive.indexOf(rn.from), toC = logTarget.indexOf(rn.to);
    for (var ri = 1; ri < logGrid.length; ri++) {
      if (tempPr2sStr_(logGrid[ri][fromC]) !== tempPr2sStr_(logProjected[ri][toC])) renameBad++;
    }
  });
  p('RENAME_VALUE_PROOF = ' + (!logRenames.length ? 'N/A — no rename applied'
    : (logRowCount === 0
      ? 'VACUOUS — 0 rows. Nothing is re-interpreted because there is nothing to re-interpret.'
      : (renameBad === 0 ? 'ALL ' + logRowCount + ' rows carry their value across intact'
        : renameBad + ' MISMATCH(es)'))));
  if (renameBad) {
    p('BLOCKED — the rename did not preserve every value. Nothing is written.');
    return done();
  }

  p('LOG_HEADER_HASH            = ' + logHeaderHash);
  p('LOG_FULL_LOGICAL_HASH_PRE  = ' + logLogicalPre);
  p('LOG_FULL_LOGICAL_HASH_PROJ = ' + logLogicalProj + (logLogicalPre === logLogicalProj ? '   MATCH' : '   *** MISMATCH ***'));
  if (logLogicalPre !== logLogicalProj) {
    p('BLOCKED — the change_log projection changes a value. Nothing is written.');
    return done();
  }

  // ---- WHAT THE NEW COLUMNS CONTAIN -----------------------------------------------------------------------------
  rule();
  p('MANUAL_FLAG_INITIALIZATION = BLANK / UNKNOWN, for all ' + rowCount + ' rows.');
  p('  Blank is UNKNOWN: nobody has said who owns this field. It is NOT false. Writing FALSE here would');
  p('  declare, in one migration and with no operator ever asked, that every price in the business is');
  p('  system-owned and may be overwritten by the next FX run.');
  if (logAdd > 0) {
    p('pricing_change_log gains ' + logAdd + ' canonical column(s), created BLANK for the same reason: there');
    p('  is no defensible default for a row nobody has classified.');
  } else {
    p('pricing_change_log gains NO column — every canonical column, change_type included, is already live.');
    p('  Its migration is the ORDER and the declared rename. Nothing is created and nothing is defaulted.');
  }

  // ---- COMBINED VERDICT -------------------------------------------------------------------------------------
  rule();
  p('PRICING_LIST_PROJECTION_MATCH       = ' + (logicalPre === logicalProjected ? 'YES' : 'NO'));
  p('PRICING_CHANGE_LOG_PROJECTION_MATCH = ' + (logLogicalPre === logLogicalProj ? 'YES' : 'NO'));
  p('DATA_VALUES_CHANGED                 = NO');
  p('DROP_COUNT                          = ' + (wouldDrop + logDrop));

  if (!commit) {
    rule();
    p('COMMIT_AUTHORIZED = NO — this was a DRY RUN. ZERO WRITES.');
    p('To COMMIT, paste these six into the constants at the top of this file, then run');
    p('TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT():');
    p('');
    p("  var TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = '" + liveHeaderHash + "';");
    p("  var TEMP_PR2S_EXPECT_LOGICAL_HASH_ = '" + logicalPre + "';");
    p('  var TEMP_PR2S_EXPECT_ROW_COUNT_ = ' + rowCount + ';');
    p("  var TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ = '" + logHeaderHash + "';");
    p("  var TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ = '" + logLogicalPre + "';");
    p('  var TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ = ' + logRowCount + ';');
    return done();
  }

  // ---- DRIFT GATE -------------------------------------------------------------------------------------------------
  rule();
  if (TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ !== liveHeaderHash
      || TEMP_PR2S_EXPECT_LOGICAL_HASH_ !== logicalPre
      || TEMP_PR2S_EXPECT_ROW_COUNT_ !== rowCount) {
    p('BLOCKED — pricing_list IS NOT WHAT THE DRY RUN MEASURED.   STOP_LIVE_DRIFT = YES');
    p('  expected header hash  ' + TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ + '   live ' + liveHeaderHash);
    p('  expected logical hash ' + TEMP_PR2S_EXPECT_LOGICAL_HASH_ + '   live ' + logicalPre);
    p('  expected row count    ' + TEMP_PR2S_EXPECT_ROW_COUNT_ + '   live ' + rowCount);
    p('Run the DRY RUN again, review it again, and paste the new values. A plan reviewed against one sheet');
    p('is not a plan for a different one.');
    return done();
  }
  if (TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ !== logHeaderHash
      || TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ !== logLogicalPre
      || TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ !== logRowCount) {
    p('BLOCKED — pricing_change_log IS NOT WHAT THE DRY RUN MEASURED.');
    p('  expected header hash  ' + TEMP_PR2S_EXPECT_LOG_HEADER_HASH_ + '   live ' + logHeaderHash);
    p('  expected logical hash ' + TEMP_PR2S_EXPECT_LOG_LOGICAL_HASH_ + '   live ' + logLogicalPre);
    p('  expected row count    ' + TEMP_PR2S_EXPECT_LOG_ROW_COUNT_ + '   live ' + logRowCount);
    p('A change_log that has gained rows since the review is not a reason to stop by itself — but it is a');
    p('reason to re-measure, because the projection has to be proven over the rows that now exist.');
    return done();
  }
  p('DRIFT GATE PASSED — both sheets are byte-identical to the reviewed dry run.');
  p('COMMIT_AUTHORIZED = YES');

  // ---- LOCK ---------------------------------------------------------------------------------------------------
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(TEMP_PR2S_LOCK_MS_)) {
    p('BLOCKED — could not take the script lock within ' + TEMP_PR2S_LOCK_MS_ + 'ms. Something else is writing');
    p('this spreadsheet. NOTHING WAS WRITTEN.');
    return done();
  }
  var snapName = '', logSnapName = '';
  try {
    // ---- RE-READ UNDER THE LOCK --------------------------------------------------------------------------------
    // Everything above measured an UNLOCKED sheet. Between that read and this one a write could have landed,
    // so the gate is re-run against what the lock now protects. Otherwise the lock protects the write but not
    // the decision to write, which is the half that matters.
    var rgrid = sh.getDataRange().getValues();
    var rhead = (rgrid[0] || []).map(tempPr2sStr_);
    var rlog = logSh.getDataRange().getValues();
    var rlogHead = (rlog[0] || []).map(tempPr2sStr_);
    if (tempPr2sSha_(rhead.join('|#|')) !== liveHeaderHash
        || (rgrid.length - 1) !== rowCount
        || tempPr2sLogicalHash_(rhead, rgrid, preFields) !== logicalPre
        || tempPr2sSha_(rlogHead.join('|#|')) !== logHeaderHash
        || (rlog.length - 1) !== logRowCount) {
      p('BLOCKED — a sheet changed between the plan and the lock. NOTHING WAS WRITTEN.');
      return done();
    }
    p('RE-READ UNDER LOCK — both sheets still match the plan.');

    // ---- PRE SNAPSHOT, BOTH TABLES ------------------------------------------------------------------------------
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    snapName = TEMP_PR2S_SNAPSHOT_PREFIX_ + stamp;
    var snap = sh.copyTo(ss);
    snap.setName(snapName);
    logSnapName = TEMP_PR2S_LOG_SNAPSHOT_PREFIX_ + stamp;
    var logSnap = logSh.copyTo(ss);
    logSnap.setName(logSnapName);
    p('PRE_SNAPSHOT_CREATED  = YES');
    p('PRE_SNAPSHOT_LOCATION = ' + snapName + '  and  ' + logSnapName + '  (same spreadsheet)');

    // ---- WRITE --------------------------------------------------------------------------------------------------
    // Bounded: widen once if needed, then ONE setValues over the whole block per table. Not a cell loop, and
    // not a sequence of inserts whose intermediate states are each a different broken layout.
    var writeError = null;
    try {
      var needCols = target.length - sh.getMaxColumns();
      if (needCols > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCols);
      sh.getRange(1, 1, projected.length, target.length).setValues(projected);
      var logNeed = logTarget.length - logSh.getMaxColumns();
      if (logNeed > 0) logSh.insertColumnsAfter(logSh.getMaxColumns(), logNeed);
      logSh.getRange(1, 1, logProjected.length, logTarget.length).setValues(logProjected);
      SpreadsheetApp.flush();
    } catch (werr) {
      writeError = werr;
    }
    if (writeError) {
      p('WRITE FAILED — ' + (writeError && writeError.message ? writeError.message : String(writeError)));
      tempPr2sAutoRollback_(ss, snapName, logSnapName).forEach(p);
      p('SCHEMA_RECONCILE_PASS = NO');
      return done();
    }
    p('WRITE COMPLETE — pricing_list and pricing_change_log rewritten in one bounded range each.');

    // ---- POST VALIDATOR -----------------------------------------------------------------------------------------
    var post = sh.getDataRange().getValues();
    var postHeader = (post[0] || []).map(tempPr2sStr_);
    var postRows = post.length - 1;
    var postLog = logSh.getDataRange().getValues();
    var postLogHeader = (postLog[0] || []).map(tempPr2sStr_);
    var checks = [];
    function check(label, cond, detail) { checks.push({ label: label, ok: !!cond, detail: detail }); }

    check('ROW_COUNT_POST == PRE', postRows === rowCount, postRows + ' vs ' + rowCount);
    check('canonical prefix is EXACT',
      CANON.every(function (h, i) { return postHeader[i] === h; }), postHeader.slice(0, CANON.length).join(','));
    check('extension columns preserved, in order',
      extensions.every(function (h, i) { return postHeader[CANON.length + i] === h; }),
      postHeader.slice(CANON.length).join(','));
    check('would_drop_columns == 0', live.every(function (h) { return postHeader.indexOf(h) !== -1; }));
    check('PRICING_IDS_POST_HASH == PRE', idsHash(postHeader, post) === idsHash(live, grid));
    check('PRICE_VALUES_POST_HASH == PRE', priceHash(postHeader, post) === priceHash(live, grid));
    check('FULL_LOGICAL_HASH_POST == PRE', tempPr2sLogicalHash_(postHeader, post, preFields) === logicalPre);

    var blankCounts = {};
    FLAGS.forEach(function (f) {
      var c = postHeader.indexOf(f), n = 0, falses = 0;
      for (var i = 1; i < post.length; i++) {
        var v = tempPr2sStr_(post[i][c]);
        if (v === '') n++; else if (/^false$/i.test(v)) falses++;
      }
      blankCounts[f] = n;
      check(f + ' blank on every row', n === postRows, n + ' of ' + postRows);
      check(f + ' has NO FALSE values', falses === 0, String(falses));
    });

    check('change_log ROW_COUNT_POST == PRE', (postLog.length - 1) === logRowCount);
    check('change_log canonical prefix is EXACT',
      LOGCANON.every(function (h, i) { return postLogHeader[i] === h; }), postLogHeader.slice(0, LOGCANON.length).join(','));
    check('change_log extension columns preserved, in order',
      logExt.every(function (h, i) { return postLogHeader[LOGCANON.length + i] === h; }),
      postLogHeader.slice(LOGCANON.length).join(','));
    check('change_log would_drop_columns == 0', logEff.every(function (h) { return postLogHeader.indexOf(h) !== -1; }));
    check('LOG_FULL_LOGICAL_HASH_POST == PRE',
      tempPr2sLogicalHash_(postLogHeader, postLog, logPreFields) === logLogicalPre);

    // The REAL gate, not this tool's opinion of it. What refuses pricing writes today is prodRequireSheet_,
    // so that is what has to accept the result.
    var prodPrice = tempPr2sProdCheck_(ss, TEMP_PR2S_PRICE_TAB_, CANON);
    var prodLog = tempPr2sProdCheck_(ss, TEMP_PR2S_LOG_TAB_, LOGCANON);
    check('POST prodRequireSheet_ pricing_list', prodPrice === 'PASS', prodPrice);
    check('POST prodRequireSheet_ pricing_change_log', prodLog === 'PASS', prodLog);

    rule();
    p('POST VALIDATOR');
    var allOk = true;
    checks.forEach(function (c2) {
      if (!c2.ok) allOk = false;
      p('  ' + (c2.ok ? 'PASS  ' : 'FAIL  ') + c2.label + (c2.detail ? '   [' + c2.detail + ']' : ''));
    });
    p('');
    p('ROW_COUNT_POST             = ' + postRows);
    p('PRICING_IDS_POST_HASH      = ' + idsHash(postHeader, post));
    p('PRICE_VALUES_POST_HASH     = ' + priceHash(postHeader, post));
    p('FULL_LOGICAL_HASH_POST     = ' + tempPr2sLogicalHash_(postHeader, post, preFields));
    p('LOG_ROW_COUNT_POST         = ' + (postLog.length - 1));
    p('LOG_FULL_LOGICAL_HASH_POST = ' + tempPr2sLogicalHash_(postLogHeader, postLog, logPreFields));
    p('POST_PROD_REQUIRE_SHEET pricing_list       = ' + prodPrice);
    p('POST_PROD_REQUIRE_SHEET pricing_change_log = ' + prodLog);
    FLAGS.forEach(function (f) { p('  ' + f + ' blank count = ' + blankCounts[f]); });
    p('');
    p('SCHEMA_RECONCILE_PASS = ' + (allOk ? 'YES' : 'NO'));
    if (!allOk) {
      p('*** FAILED. ***');
      tempPr2sAutoRollback_(ss, snapName, logSnapName).forEach(p);
    }
    return done();
  } finally {
    try { lock.releaseLock(); } catch (lerr) {}
  }
}

/**
 * Run the REAL production gate against a post-migration sheet. Returns 'PASS' or the deterministic token it
 * threw, so a failure reads as the same word the pricing writer would have refused with.
 */
function tempPr2sProdCheck_(ss, name, expectedHeaders) {
  if (typeof prodRequireSheet_ !== 'function') return 'UNAVAILABLE — 29_production_safety_adapter.gs not loaded';
  try { prodRequireSheet_(ss, name, expectedHeaders); return 'PASS'; }
  catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }
}

/**
 * Restore BOTH tables from the snapshots this run just took, because a half-migrated pair is the one state
 * worse than either end: 73_ requires both tables to validate, so one repaired and one original refuses every
 * pricing write while looking, to a casual read, like progress.
 *
 * This is the ONE automatic write this file performs, and it is deliberate. The general objection to
 * automatic rollback — a second unreviewed write on top of a failed one — does not hold here, because the
 * snapshot is a byte-exact copy taken seconds earlier under the same lock, and the alternative resting state
 * is definitely broken rather than possibly broken. There is no automatic RETRY, which is the part that
 * would actually be reckless.
 */
function tempPr2sAutoRollback_(ss, snapName, logSnapName) {
  var out = ['AUTO_ROLLBACK — restoring BOTH tables from the snapshots taken moments ago.'];
  try {
    out = out.concat(tempPr2sRestorePair_(ss, snapName, logSnapName));
    out.push('AUTO_ROLLBACK = DONE. No automatic retry: re-run the DRY RUN, review it, and decide.');
  } catch (e) {
    out.push('*** AUTO_ROLLBACK FAILED — ' + (e && e.message ? e.message : String(e)) + ' ***');
    out.push('The snapshots ' + snapName + ' and ' + logSnapName + ' are still in the spreadsheet. Restore by');
    out.push('hand, or run TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK(). DO NOT run COMMIT again first.');
  }
  return out;
}

/** Copy a snapshot pair back over the live tables and prove, by hash, that what landed is what was saved. */
function tempPr2sRestorePair_(ss, snapName, logSnapName) {
  var out = [];
  [[snapName, TEMP_PR2S_PRICE_TAB_], [logSnapName, TEMP_PR2S_LOG_TAB_]].forEach(function (pair) {
    var src = pair[0] ? ss.getSheetByName(pair[0]) : null;
    if (!src) { out.push('  (no snapshot ' + pair[0] + ' — ' + pair[1] + ' left as it is)'); return; }
    var g = src.getDataRange().getValues();
    var dst = ss.getSheetByName(pair[1]);
    dst.clear();
    dst.getRange(1, 1, g.length, g[0].length).setValues(g);
    SpreadsheetApp.flush();
    var back = dst.getDataRange().getValues();
    var srcHead = (g[0] || []).map(tempPr2sStr_), backHead = (back[0] || []).map(tempPr2sStr_);
    var fields = srcHead.filter(function (h) { return h !== ''; });
    var okHead = tempPr2sSha_(srcHead.join('|#|')) === tempPr2sSha_(backHead.join('|#|'));
    var okRows = (back.length - 1) === (g.length - 1);
    var okData = tempPr2sLogicalHash_(srcHead, g, fields) === tempPr2sLogicalHash_(backHead, back, fields);
    out.push('  restored ' + pair[1] + ' from ' + pair[0]
      + '  rows ' + (back.length - 1) + '  header ' + (okHead ? 'MATCH' : '*** MISMATCH ***')
      + '  rowcount ' + (okRows ? 'MATCH' : '*** MISMATCH ***')
      + '  values ' + (okData ? 'MATCH' : '*** MISMATCH ***'));
    if (!okHead || !okRows || !okData) throw new Error('restore of ' + pair[1] + ' did not reproduce the snapshot');
  });
  return out;
}

/**
 * Restore pricing_list AND pricing_change_log from the most recent PRE snapshot pair this tool created.
 * Explicit and operator-invoked. It reproves the restore by hash rather than trusting that a write that was
 * asked for is a write that happened, and it never relies on Google Sheets revision history, which is not a
 * backup anybody has verified.
 */
function TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(TEMP_PR2S_SNAPSHOT_PREFIX_) === 0; }).sort();
  p('ROLLBACK — snapshots found: ' + (snaps.length ? snaps.join(', ') : '(none)'));
  if (!snaps.length) { p('BLOCKED — no snapshot to restore from.'); return done(); }
  var newest = snaps[snaps.length - 1];
  var stamp = newest.substring(TEMP_PR2S_SNAPSHOT_PREFIX_.length);
  var logSnapName = TEMP_PR2S_LOG_SNAPSHOT_PREFIX_ + stamp;
  if (!ss.getSheetByName(logSnapName)) {
    p('WARNING — pricing_list has a snapshot at ' + stamp + ' but pricing_change_log does not. Only');
    p('pricing_list will be restored, which leaves the pair inconsistent. Read this before continuing.');
  }
  try {
    tempPr2sRestorePair_(ss, newest, logSnapName).forEach(p);
    p('ROLLBACK COMPLETE — restored content reproduces the snapshot hashes.');
    p('The snapshot sheets are left in place. Delete them by hand once you are satisfied.');
  } catch (e) {
    p('*** ROLLBACK FAILED — ' + (e && e.message ? e.message : String(e)) + ' ***');
    p('The snapshots are untouched. Do not run COMMIT. Report this output.');
  }
  return done();
}
