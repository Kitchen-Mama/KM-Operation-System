/**
 * TEMP — PRICING-R2-SCHEMA-ORDER-RECONCILIATION-R1 — REPAIR pricing_list COLUMN ORDER, THEN PROVISION.
 *
 * PASTE -> RUN DRY RUN -> REVIEW -> PASTE THE THREE EXPECT_ CONSTANTS -> RUN COMMIT -> VERIFY -> REMOVE.
 * Repository-only operator tool. NOT a release file, never synced as one, no manifest row, no stamp.
 *
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_DRY_RUN()   // reads only. Prints the map, the proofs, the hashes.
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT()    // rewrites the layout. Refuses unless the sheet is
 *                                                  // byte-identical to what the dry run measured.
 *     TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK()  // restores pricing_list from the PRE snapshot.
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

// ---- PASTE THESE THREE FROM THE DRY RUN OUTPUT BEFORE RUNNING COMMIT --------------------------------------
// They are the drift gate. COMMIT recomputes all three against the live sheet and refuses on any difference,
// so a sheet edited between the review and the run cannot be migrated against a stale plan.
var TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = '';
var TEMP_PR2S_EXPECT_LOGICAL_HASH_ = '';
var TEMP_PR2S_EXPECT_ROW_COUNT_ = -1;

var TEMP_PR2S_PRICE_TAB_ = 'pricing_list';
var TEMP_PR2S_LOG_TAB_ = 'pricing_change_log';
var TEMP_PR2S_SNAPSHOT_PREFIX_ = 'PRE__pricing_list__';

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
  var logSh = ss.getSheetByName(TEMP_PR2S_LOG_TAB_);
  var logGrid = null, logLive = null, logTarget = null, logProjected = null;
  rule();
  if (!logSh) { p('BLOCKED — ' + TEMP_PR2S_LOG_TAB_ + ' is not present.'); return done(); }
  logGrid = logSh.getDataRange().getValues();
  logLive = (logGrid[0] || []).map(tempPr2sStr_);
  var logCanonSet = {}; LOGCANON.forEach(function (h) { logCanonSet[h] = 1; });
  var logExt = logLive.filter(function (h) { return h !== '' && !logCanonSet[h]; });
  var logMissingNonNew = LOGCANON.filter(function (h) { return h !== 'change_type' && logLive.indexOf(h) === -1; });
  p('LIVE pricing_change_log header (' + logLive.length + '): ' + logLive.join(', '));
  p('extensions: ' + (logExt.length ? logExt.join(', ') : '(none)') + '   rows: ' + (logGrid.length - 1));
  if (logMissingNonNew.length) {
    p('BLOCKED — pricing_change_log is missing canonical column(s): ' + logMissingNonNew.join(', '));
    return done();
  }
  logTarget = LOGCANON.concat(logExt);
  p('TARGET pricing_change_log header (' + logTarget.length + '): ' + logTarget.join(', '));
  var logLiveIdx = {}; logLive.forEach(function (h, i) { logLiveIdx[h] = i; });
  logProjected = [logTarget.slice()];
  for (var lr = 1; lr < logGrid.length; lr++) {
    var lrow = new Array(logTarget.length);
    for (var lc = 0; lc < logTarget.length; lc++) {
      var ln = logTarget[lc];
      lrow[lc] = Object.prototype.hasOwnProperty.call(logLiveIdx, ln) ? logGrid[lr][logLiveIdx[ln]] : '';
    }
    logProjected.push(lrow);
  }

  // ---- WHAT THE NEW COLUMNS CONTAIN -----------------------------------------------------------------------------
  rule();
  p('MANUAL_FLAG_INITIALIZATION = BLANK / UNKNOWN, for all ' + rowCount + ' rows.');
  p('  Blank is UNKNOWN: nobody has said who owns this field. It is NOT false. Writing FALSE here would');
  p('  declare, in one migration and with no operator ever asked, that every price in the business is');
  p('  system-owned and may be overwritten by the next FX run.');

  if (!commit) {
    rule();
    p('DRY RUN COMPLETE — ZERO WRITES.');
    p('To COMMIT, paste these three into the constants at the top of this file, then run');
    p('TEMP_PRICING_R2_SCHEMA_RECONCILE_COMMIT():');
    p('');
    p("  var TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ = '" + liveHeaderHash + "';");
    p("  var TEMP_PR2S_EXPECT_LOGICAL_HASH_ = '" + logicalPre + "';");
    p('  var TEMP_PR2S_EXPECT_ROW_COUNT_ = ' + rowCount + ';');
    return done();
  }

  // ---- DRIFT GATE -------------------------------------------------------------------------------------------------
  rule();
  if (TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ !== liveHeaderHash
      || TEMP_PR2S_EXPECT_LOGICAL_HASH_ !== logicalPre
      || TEMP_PR2S_EXPECT_ROW_COUNT_ !== rowCount) {
    p('BLOCKED — THE SHEET IS NOT WHAT THE DRY RUN MEASURED.');
    p('  expected header hash  ' + TEMP_PR2S_EXPECT_LIVE_HEADER_HASH_ + '   live ' + liveHeaderHash);
    p('  expected logical hash ' + TEMP_PR2S_EXPECT_LOGICAL_HASH_ + '   live ' + logicalPre);
    p('  expected row count    ' + TEMP_PR2S_EXPECT_ROW_COUNT_ + '   live ' + rowCount);
    p('Run the DRY RUN again, review it again, and paste the new values. A plan reviewed against one sheet');
    p('is not a plan for a different one.');
    return done();
  }
  p('DRIFT GATE PASSED — the sheet is byte-identical to the reviewed dry run.');

  // ---- PRE SNAPSHOT --------------------------------------------------------------------------------------------
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  var snapName = TEMP_PR2S_SNAPSHOT_PREFIX_ + stamp;
  var snap = sh.copyTo(ss);
  snap.setName(snapName);
  var logSnapName = 'PRE__pricing_change_log__' + stamp;
  var logSnap = logSh.copyTo(ss);
  logSnap.setName(logSnapName);
  p('PRE_SNAPSHOT_CREATED  = YES');
  p('PRE_SNAPSHOT_LOCATION = ' + snapName + '  and  ' + logSnapName + '  (same spreadsheet)');
  p('  Rollback: TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK() restores pricing_list from the newest snapshot.');

  // ---- WRITE ------------------------------------------------------------------------------------------------------
  // Bounded: widen once if needed, then ONE setValues over the whole block. Not a cell loop, and not a
  // sequence of inserts whose intermediate states are each a different broken layout.
  var needCols = target.length - sh.getMaxColumns();
  if (needCols > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCols);
  sh.getRange(1, 1, projected.length, target.length).setValues(projected);

  var logNeed = logTarget.length - logSh.getMaxColumns();
  if (logNeed > 0) logSh.insertColumnsAfter(logSh.getMaxColumns(), logNeed);
  logSh.getRange(1, 1, logProjected.length, logTarget.length).setValues(logProjected);
  SpreadsheetApp.flush();
  p('WRITE COMPLETE — pricing_list and pricing_change_log rewritten in one bounded range each.');

  // ---- POST VALIDATOR ------------------------------------------------------------------------------------------
  var post = sh.getDataRange().getValues();
  var postHeader = (post[0] || []).map(tempPr2sStr_);
  var postRows = post.length - 1;
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

  var postLog = logSh.getDataRange().getValues();
  check('pricing_change_log row count unchanged', (postLog.length - 1) === (logGrid.length - 1));
  check('pricing_change_log canonical prefix exact',
    LOGCANON.every(function (h, i) { return tempPr2sStr_((postLog[0] || [])[i]) === h; }));

  rule();
  p('POST VALIDATOR');
  var allOk = true;
  checks.forEach(function (c2) { if (!c2.ok) allOk = false; p('  ' + (c2.ok ? 'PASS  ' : 'FAIL  ') + c2.label + (c2.detail ? '   [' + c2.detail + ']' : '')); });
  p('');
  p('ROW_COUNT_POST          = ' + postRows);
  p('PRICING_IDS_POST_HASH   = ' + idsHash(postHeader, post));
  p('PRICE_VALUES_POST_HASH  = ' + priceHash(postHeader, post));
  p('FULL_LOGICAL_HASH_POST  = ' + tempPr2sLogicalHash_(postHeader, post, preFields));
  FLAGS.forEach(function (f) { p('  ' + f + ' blank count = ' + blankCounts[f]); });
  p('');
  p('SCHEMA_RECONCILE_PASS = ' + (allOk ? 'YES' : 'NO'));
  if (!allOk) {
    p('*** FAILED. NOTHING HERE REPAIRS IT AUTOMATICALLY. ***');
    p('The PRE snapshot is ' + snapName + '. Run TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK() to restore, then');
    p('report this output. A partial success is not treated as a success.');
  }
  return done();
}

/**
 * Restore pricing_list (and pricing_change_log) from the most recent PRE snapshot this tool created.
 * Explicit, operator-invoked, and it never runs by itself — an automatic rollback on a validator it cannot
 * fully trust would be a second unreviewed write on top of a failed one.
 */
function TEMP_PRICING_R2_SCHEMA_RECONCILE_ROLLBACK() {
  var out = [];
  function p(s) { out.push(String(s)); }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(TEMP_PR2S_SNAPSHOT_PREFIX_) === 0; }).sort();
  p('ROLLBACK — snapshots found: ' + (snaps.length ? snaps.join(', ') : '(none)'));
  if (!snaps.length) { p('BLOCKED — no snapshot to restore from.'); Logger.log(out.join('\n')); return out.join('\n'); }
  var newest = snaps[snaps.length - 1];
  var stamp = newest.substring(TEMP_PR2S_SNAPSHOT_PREFIX_.length);
  var src = ss.getSheetByName(newest);
  var dst = ss.getSheetByName(TEMP_PR2S_PRICE_TAB_);
  var g = src.getDataRange().getValues();
  dst.clear();
  dst.getRange(1, 1, g.length, g[0].length).setValues(g);
  p('restored ' + TEMP_PR2S_PRICE_TAB_ + ' from ' + newest + '  (' + (g.length - 1) + ' rows, ' + g[0].length + ' columns)');
  var logSnap = ss.getSheetByName('PRE__pricing_change_log__' + stamp);
  if (logSnap) {
    var lg = logSnap.getDataRange().getValues();
    var ldst = ss.getSheetByName(TEMP_PR2S_LOG_TAB_);
    ldst.clear();
    ldst.getRange(1, 1, lg.length, lg[0].length).setValues(lg);
    p('restored ' + TEMP_PR2S_LOG_TAB_ + ' from PRE__pricing_change_log__' + stamp);
  }
  SpreadsheetApp.flush();
  p('ROLLBACK COMPLETE. The snapshot sheets are left in place — delete them by hand once you are satisfied.');
  Logger.log(out.join('\n'));
  return out.join('\n');
}
