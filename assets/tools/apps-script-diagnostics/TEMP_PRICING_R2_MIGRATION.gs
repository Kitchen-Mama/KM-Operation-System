/**
 * TEMP — PRICING-R3-EXECUTION-R1 §1 — PROVISION THE PRICING-R2 OWNERSHIP COLUMNS.
 *
 * PASTE INTO THE APPS SCRIPT PROJECT -> RUN DRY RUN -> REVIEW -> RUN COMMIT -> REMOVE.
 * This file is a repository-only operator tool. It is NOT part of any release and must NOT be
 * synced as one; it is pasted, run once, and deleted.
 *
 *     TEMP_PRICING_R2_MIGRATION_DRY_RUN()    // reads only. Prints the plan, the counts and the checksums.
 *     TEMP_PRICING_R2_MIGRATION_COMMIT()     // writes ONLY header cells. Refuses unless the dry run passes.
 *
 * ORDER OF OPERATIONS, AND IT IS NOT THE ONE THE TASK ASSUMES. Sync 73_ / 01_ / 59_ / 63_ into the
 * project and SAVE, then run this, then create the deployment version. Two reasons:
 *
 *   1. THE AUTHORITY MUST BE THE DEPLOYED CODE. This file refuses to carry its own copy of the header.
 *      A migration that knows the schema independently is how a column lands at the wrong index, and the
 *      index is the whole problem here (see below). It reads PRICING_LIST_HEADERS_ out of the loaded 73_.
 *
 *   2. SAVING THE FILES IS SAFE BEFORE THE COLUMNS EXIST, by design. Under RULE S0-2 both pricing actions
 *      validate and fail closed: until these columns are present they refuse with MISSING_REQUIRED_HEADER
 *      having written nothing. And a SAVED file is not a DEPLOYED one — the versioned Web App the frontend
 *      calls does not change until a new version is cut, which is step 3.
 *
 * WHY THIS IS NOT "APPEND THREE COLUMNS", which is the thing worth reading before running it.
 * prodRequireSheet_ validates through classifySchemaMismatch, and that function checks ORDER:
 *
 *     for (i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) orderMismatch = true;
 *
 * So the first 30 columns of pricing_list must be EXACTLY PRICING_LIST_HEADERS_, in order. The three flag
 * columns sit at indices 20, 21 and 22 of that list — between `msrp` and `price_source` — not at the end.
 * Appending them to the right-hand edge produces a sheet that has every required column and still fails
 * with HEADER_ORDER_MISMATCH, which is a migration that reports success and leaves every price write
 * refusing. Extra columns ARE allowed (extraColumnsPolicy defaults to ALLOW) but only to the RIGHT of
 * position 30: 04_ writes `marketplace_id`, `company` and `asin` by name lookup and none of them is in the
 * canonical list, so where they physically sit decides whether this sheet can be written to at all.
 *
 * This tool therefore does not assume a shape. It reads the live header, works out what would have to
 * happen, and proceeds ONLY if the answer is "insert these three columns at these positions". Anything
 * else is printed and blocked, because anything else is a decision a person has to make.
 *
 * SUPERSEDED FOR THE CURRENT PRODUCTION SHEET — and by its own refusal, which is the outcome it was built
 * for. Run against production it reported that canonical position 3 expects `sku` while the live sheet has
 * `marketplace_id`: pre-existing drift, older than PRICING-R2, invisible until something finally compared
 * the two orders. Provisioning alone cannot fix that, so this tool correctly refuses to try.
 * Use TEMP_PRICING_R2_SCHEMA_RECONCILE.gs instead: it repairs the ORDER and provisions the flags in one
 * operation, with a PRE snapshot and a rollback. This file stays only for a project whose pricing_list is
 * already in canonical order.
 */

var TEMP_PR2M_PRICE_TAB_ = 'pricing_list';
var TEMP_PR2M_LOG_TAB_ = 'pricing_change_log';

/** Read-only. Prints everything COMMIT relies on and decides GO / NO-GO. */
function TEMP_PRICING_R2_MIGRATION_DRY_RUN() { return tempPr2mRun_(false); }

/** Writes header cells only. Re-runs every dry-run check first and refuses on any NO-GO. */
function TEMP_PRICING_R2_MIGRATION_COMMIT() { return tempPr2mRun_(true); }

function tempPr2mSha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) { var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16); h += v.length === 1 ? '0' + v : v; }
  return h;
}
function tempPr2mStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function tempPr2mRun_(commit) {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R2 COLUMN PROVISION — ' + (commit ? 'COMMIT' : 'DRY RUN'));
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // ---- AUTHORITY: the deployed 73_, never a copy in this file ---------------------------------------------
  if (typeof PRICING_LIST_HEADERS_ === 'undefined' || typeof PRICING_MANUAL_FLAG_COLUMNS_ === 'undefined'
      || typeof PRICING_CHANGE_LOG_HEADERS_ === 'undefined') {
    p('AUTHORITY_NOT_LOADED — 73_api_v1_pricing_write.gs is not in this project.');
    p('Sync 73_ / 01_ / 59_ / 63_ and SAVE first, then run this again. Saving is safe before the columns');
    p('exist: both pricing actions fail closed with MISSING_REQUIRED_HEADER until they do.');
    p('BLOCKED');
    return done();
  }
  var CANON = PRICING_LIST_HEADERS_.slice();
  var FLAGS = PRICING_MANUAL_FLAG_COLUMNS_.slice();
  var LOGCANON = PRICING_CHANGE_LOG_HEADERS_.slice();
  p('authority 73_ build: ' + (typeof PRW_BUILD_VERSION_ === 'string' ? PRW_BUILD_VERSION_ : '(unknown)'));
  p('canonical pricing_list columns: ' + CANON.length);
  p('flag columns to provision:      ' + FLAGS.join(', '));
  p('canonical change_log columns:   ' + LOGCANON.length);
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  p('spreadsheet: ' + ss.getName() + '  id=' + ss.getId());
  var sh = ss.getSheetByName(TEMP_PR2M_PRICE_TAB_);
  if (!sh) { p('BLOCKED — ' + TEMP_PR2M_PRICE_TAB_ + ' is not present.'); return done(); }
  var logSh = ss.getSheetByName(TEMP_PR2M_LOG_TAB_);
  if (!logSh) { p('BLOCKED — ' + TEMP_PR2M_LOG_TAB_ + ' is not present.'); return done(); }

  // ---- PRE state -------------------------------------------------------------------------------------------
  var values = sh.getDataRange().getValues();
  var liveHeader = (values[0] || []).map(tempPr2mStr_);
  var dataRows = values.length - 1;

  p('LIVE pricing_list header (' + liveHeader.length + ' columns):');
  liveHeader.forEach(function (h, i) { p('  [' + (i + 1) + '] ' + (h === '' ? '(blank)' : h)); });
  rule();

  function colOf(header, name) { return header.indexOf(name); }
  var idIdx = colOf(liveHeader, 'pricing_id');
  var mskuIdx = colOf(liveHeader, 'marketplace_sku_id');
  if (idIdx === -1 || mskuIdx === -1) {
    p('BLOCKED — pricing_id / marketplace_sku_id not found. This is not the table this tool provisions.');
    return done();
  }

  // The price values the migration must not change, hashed by identity so a reordering of COLUMNS cannot
  // hide a change of VALUES — the hash is built from named lookups, not from positions.
  var PRICE_FIELDS = ['currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
    'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
    'regular_price', 'minimum_price', 'msrp'];
  function snapshot(header, grid) {
    var idx = {}; PRICE_FIELDS.forEach(function (f) { idx[f] = colOf(header, f); });
    var i0 = colOf(header, 'pricing_id');
    var ids = [], vals = [];
    for (var r = 1; r < grid.length; r++) {
      var id = tempPr2mStr_(grid[r][i0]);
      ids.push(id);
      var cells = PRICE_FIELDS.map(function (f) { return idx[f] === -1 ? '' : tempPr2mStr_(grid[r][idx[f]]); });
      vals.push(id + '' + cells.join(''));
    }
    return { ids: ids, idsHash: tempPr2mSha_(ids.join('\n')), valuesHash: tempPr2mSha_(vals.join('\n')) };
  }
  var pre = snapshot(liveHeader, values);

  p('ROW_COUNT_PRE          = ' + dataRows);
  p('PRICING_IDS_PRE_HASH   = ' + pre.idsHash);
  p('PRICE_VALUES_PRE_HASH  = ' + pre.valuesHash);
  rule();

  // ---- WHAT WOULD HAVE TO HAPPEN ---------------------------------------------------------------------------
  // The target is not "these columns exist" but "the first N columns ARE the canonical list, in order",
  // because that is what prodRequireSheet_ actually checks.
  var already = FLAGS.filter(function (f) { return colOf(liveHeader, f) !== -1; });
  var missing = FLAGS.filter(function (f) { return colOf(liveHeader, f) === -1; });
  p('flag columns already present: ' + (already.length ? already.join(', ') : '(none)'));
  p('flag columns missing:         ' + (missing.length ? missing.join(', ') : '(none)'));

  // Remove the flags from the live header and compare what is left against the canonical list with the
  // flags removed. If those agree position for position, the ONLY thing missing is the three inserts.
  var canonNoFlags = CANON.filter(function (h) { return FLAGS.indexOf(h) === -1; });
  var liveNoFlags = liveHeader.filter(function (h) { return FLAGS.indexOf(h) === -1; });
  var prefixOk = true, firstBad = -1;
  for (var i = 0; i < canonNoFlags.length; i++) {
    if (liveNoFlags[i] !== canonNoFlags[i]) { prefixOk = false; firstBad = i; break; }
  }
  if (!prefixOk) {
    p('');
    p('BLOCKED — THE LIVE COLUMN ORDER IS NOT THE CANONICAL ORDER, and that has to be settled by a person.');
    p('  first disagreement at canonical position ' + (firstBad + 1));
    p('    canonical expects: ' + canonNoFlags[firstBad]);
    p('    live has:          ' + (liveNoFlags[firstBad] === undefined ? '(nothing)' : liveNoFlags[firstBad]));
    p('');
    p('  prodRequireSheet_ compares the first ' + CANON.length + ' positions IN ORDER, so this sheet would');
    p('  refuse every pricing write with HEADER_ORDER_MISMATCH even after the flag columns are added.');
    p('  NEXT: run TEMP_PRICING_R2_SCHEMA_RECONCILE.gs, which repairs the order and provisions the flags in');
    p('  one operation, with a PRE snapshot and a rollback. Do not hand-edit the column order.');
    p('  Columns 04_ writes by name but that are NOT canonical — marketplace_id, company, asin — are allowed,');
    p('  but only to the RIGHT of position ' + CANON.length + '. Report this output before changing anything.');
    return done();
  }
  var extras = liveNoFlags.slice(canonNoFlags.length).filter(function (h) { return h !== ''; });
  p('canonical prefix agrees for all ' + canonNoFlags.length + ' non-flag columns.');
  p('extra columns to the right (allowed): ' + (extras.length ? extras.join(', ') : '(none)'));
  rule();

  // Insert positions, computed from the canonical list rather than assumed.
  var plan = [];
  missing.forEach(function (f) { plan.push({ column: f, at: CANON.indexOf(f) + 1 }); });
  plan.sort(function (a, b) { return a.at - b.at; });
  p('PLAN — insert into pricing_list (1-based positions, applied left to right):');
  if (!plan.length) p('  (nothing: all three flag columns already exist)');
  plan.forEach(function (x) { p('  insert column at ' + x.at + '  ->  ' + x.column); });
  p('  INSERT, not append: these belong between `msrp` and `price_source`. Appending them to the right');
  p('  would satisfy "the column exists" and still fail the order check.');

  // change_log
  var logHeader = (logSh.getDataRange().getValues()[0] || []).map(tempPr2mStr_);
  var logMissing = LOGCANON.filter(function (h) { return logHeader.indexOf(h) === -1; });
  var logPrefixOk = true, logBad = -1;
  var logCanonNoNew = LOGCANON.filter(function (h) { return logMissing.indexOf(h) === -1; });
  var logLiveNoNew = logHeader.filter(function (h) { return logMissing.indexOf(h) === -1; });
  for (var j = 0; j < logCanonNoNew.length; j++) {
    if (logLiveNoNew[j] !== logCanonNoNew[j]) { logPrefixOk = false; logBad = j; break; }
  }
  p('');
  p('LIVE pricing_change_log header (' + logHeader.length + '): ' + logHeader.join(', '));
  p('change_log columns missing: ' + (logMissing.length ? logMissing.join(', ') : '(none)'));
  if (!logPrefixOk) {
    p('BLOCKED — pricing_change_log column order disagrees at canonical position ' + (logBad + 1)
      + ' (expects ' + logCanonNoNew[logBad] + ', has ' + (logLiveNoNew[logBad] === undefined ? '(nothing)' : logLiveNoNew[logBad]) + ').');
    return done();
  }
  var logPlan = logMissing.map(function (f) { return { column: f, at: LOGCANON.indexOf(f) + 1 }; })
    .sort(function (a, b) { return a.at - b.at; });
  logPlan.forEach(function (x) { p('  insert column at ' + x.at + '  ->  ' + x.column); });
  rule();

  // ---- WHAT THE EXISTING ROWS GET ---------------------------------------------------------------------------
  p('EVERY EXISTING ROW RECEIVES A BLANK FLAG, AND BLANK IS THE POINT.');
  p('  blank = UNKNOWN: nobody has said who owns this field. It is NOT false.');
  p('  Writing FALSE into these ' + dataRows + ' rows would declare, in one migration and with no operator');
  p('  ever asked, that every price in the business is system-owned and may be overwritten by the next FX');
  p('  run. This tool writes header cells ONLY — it never touches a data row, never back-fills a value.');
  rule();

  if (!commit) {
    p('DRY RUN COMPLETE.');
    p('VERDICT: ' + (plan.length || logPlan.length ? 'GO — run TEMP_PRICING_R2_MIGRATION_COMMIT()' : 'NOTHING TO DO — already provisioned'));
    p('Expected after COMMIT: ROW_COUNT unchanged, PRICING_IDS_POST_HASH == PRE, PRICE_VALUES_POST_HASH == PRE,');
    p('UNKNOWN_*_COUNT == ' + dataRows + ' for each of the three flags.');
    return done();
  }

  // ---- COMMIT ------------------------------------------------------------------------------------------------
  p('COMMITTING.');
  plan.forEach(function (x) {
    sh.insertColumnBefore(x.at);
    sh.getRange(1, x.at).setValue(x.column);
    p('  inserted pricing_list column ' + x.at + ' = ' + x.column);
  });
  logPlan.forEach(function (x) {
    logSh.insertColumnBefore(x.at);
    logSh.getRange(1, x.at).setValue(x.column);
    p('  inserted pricing_change_log column ' + x.at + ' = ' + x.column);
  });
  SpreadsheetApp.flush();

  // ---- POST validation ---------------------------------------------------------------------------------------
  var postValues = sh.getDataRange().getValues();
  var postHeader = (postValues[0] || []).map(tempPr2mStr_);
  var post = snapshot(postHeader, postValues);
  var postRows = postValues.length - 1;

  var unknown = {};
  FLAGS.forEach(function (f) {
    var c = postHeader.indexOf(f), n = 0;
    for (var r = 1; r < postValues.length; r++) if (c !== -1 && tempPr2mStr_(postValues[r][c]) === '') n++;
    unknown[f] = n;
  });

  rule();
  p('ROW_COUNT_PRE          = ' + dataRows);
  p('ROW_COUNT_POST         = ' + postRows);
  p('PRICING_IDS_PRE_HASH   = ' + pre.idsHash);
  p('PRICING_IDS_POST_HASH  = ' + post.idsHash);
  p('PRICE_VALUES_PRE_HASH  = ' + pre.valuesHash);
  p('PRICE_VALUES_POST_HASH = ' + post.valuesHash);
  p('UNKNOWN_REGULAR_COUNT  = ' + unknown['regular_price_is_manual']);
  p('UNKNOWN_MINIMUM_COUNT  = ' + unknown['minimum_price_is_manual']);
  p('UNKNOWN_MSRP_COUNT     = ' + unknown['msrp_is_manual']);
  rule();

  var ok = (postRows === dataRows) && (post.idsHash === pre.idsHash) && (post.valuesHash === pre.valuesHash)
    && FLAGS.every(function (f) { return unknown[f] === postRows; });
  p('DB_MIGRATION_PASS = ' + (ok ? 'YES' : 'NO'));
  if (!ok) {
    p('The row count, the identities, the price values or the blank-flag count did not come back as expected.');
    p('Nothing here repairs that automatically. Report this output before running anything else.');
  }
  return done();
}
