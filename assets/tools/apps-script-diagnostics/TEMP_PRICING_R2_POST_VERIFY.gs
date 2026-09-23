/**
 * TEMP — PRICING-R2-SCHEMA-RECONCILIATION-POST-VERIFY-R1 — READ ONLY. NO LOCK. NO WRITE. NO REPAIR.
 *
 *     TEMP_PRICING_R2_POST_VERIFY()
 *
 * Repository-only operator tool. NOT a release file, no manifest row, no stamp, no deployment.
 *
 * WHY THIS IS A SEPARATE FILE. The migration already validates itself after it writes, and that validator is
 * good — but it is part of the thing under test. A migration checked only by its own POST validator is
 * checked by code that shares every assumption the migration made, including any that were wrong: the same
 * hash, the same field list, the same idea of which column means what. If the projection and the validator
 * agree because they are two faces of one mistake, the report reads PASS.
 *
 * So this file shares NOTHING with it. Its own digest, its own logical hash, its own field groups, its own
 * name-keyed reads. It calls no tempPr2s* function even though they are loaded in the same project. Where the
 * two agree, the agreement means something.
 *
 * IT VERIFIES TWICE, FROM TWO INDEPENDENT DIRECTIONS.
 *
 *   1. AGAINST THE PRE SNAPSHOT. The migration left PRE__pricing_list__<stamp> and
 *      PRE__pricing_change_log__<stamp> in the same spreadsheet. Those are the actual bytes from before the
 *      write, so POST is compared to them row by row, BY NAME. This depends on no hash anybody transcribed
 *      and on no number typed into a report.
 *
 *   2. AGAINST THE FROZEN BASELINE. The two values measured by two consecutive live dry runs on 2026-09-23
 *      are recomputed from the POST sheet. The identity digest must reproduce exactly; the logical digest
 *      must reproduce exactly BECAUSE IT IS KEYED BY FIELD NAME over the PRE field set, so moving columns
 *      cannot move it and the three new columns cannot either. The HEADER hash is expected to differ — the
 *      layout changed on purpose, and a header hash that survived a successful migration would mean the
 *      migration had not happened.
 *
 * WHAT IT WILL NOT DO. It never writes, never takes a lock, never deletes a snapshot, never classifies a
 * blank authority flag, and never repairs anything it finds. A verifier that can fix what it measures stops
 * being a verifier.
 */

// The physical order this round was asked to prove, transcribed from the task. It is NOT the authority — 73_
// is — and that is exactly why it is here: verifying the sheet only against the same declaration the
// migration was driven from would let one wrong declaration produce a wrong sheet that verifies clean. The
// two are cross-checked below, and a disagreement between them is itself a finding.
var PV_EXPECTED_CANONICAL_ = [
  'pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku', 'marketplace_product_id',
  'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'
];
var PV_EXPECTED_EXTENSIONS_ = ['marketplace_id', 'company'];
var PV_EXPECTED_LOG_CANONICAL_ = [
  'log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
  'change_type', 'changed_by', 'changed_at', 'change_reason'
];
var PV_EXPECTED_LOG_EXTENSIONS_ = ['sku', 'country', 'marketplace', 'old_currency', 'new_currency', 'source'];

// The frozen PRE baseline. Both were reproduced by two consecutive live dry runs before the migration ran.
var PV_PRE_ROW_COUNT_ = 495;
var PV_PRE_IDS_HASH_ = 'de64de19de8b483c2ef51323ae42c6a678cf0b6f013cdd27636cdb3fdb19a63b';
var PV_PRE_LOGICAL_HASH_ = 'a65a7638b6ba8bc8a9724192a9f6f3ef73b5adecaf89682f034fe89623bb2ba0';

// The 29 field names the PRE sheet had. The logical digest is computed over THIS set on both sides, so the
// three columns that did not exist before cannot move the number, and neither can the reordering.
var PV_PRE_FIELDS_ = [
  'pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'
];

// §4 wants each group answered SEPARATELY, so a failure names which kind of value moved instead of saying
// only that something did.
var PV_GROUPS_ = [
  { key: 'PRICING_IDS', fields: ['pricing_id', 'marketplace_sku_id'] },
  { key: 'BASE_VALUES', fields: ['base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp'] },
  { key: 'FX_VALUES', fields: ['fx_rate', 'fx_rate_date', 'currency'] },
  { key: 'AUTO_VALUES', fields: ['auto_regular_price', 'auto_minimum_price', 'auto_msrp'] },
  { key: 'EFFECTIVE_VALUES', fields: ['regular_price', 'minimum_price', 'msrp'] },
  { key: 'EXTENSION_VALUES', fields: ['marketplace_id', 'company'] }
];

var PV_PRICE_TAB_ = 'pricing_list';
var PV_LOG_TAB_ = 'pricing_change_log';
var PV_SNAP_PREFIX_ = 'PRE__pricing_list__';
var PV_LOG_SNAP_PREFIX_ = 'PRE__pricing_change_log__';

function pvStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function pvSha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) {
    var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16);
    h += v.length === 1 ? '0' + v : v;
  }
  return h;
}

/** header -> {name: index}. Last occurrence wins, which is why duplicates are refused before this is used. */
function pvIndex_(header) { var m = {}; header.forEach(function (h, i) { m[h] = i; }); return m; }

/**
 * pricing_id + FIELD NAME + value, field names SORTED, over a FIXED field list. Written independently of the
 * migration tool's version on purpose; if the two disagree, one of them is wrong and that is worth knowing.
 */
function pvLogicalHash_(header, grid, fields, keyField) {
  var idx = pvIndex_(header);
  var f = fields.slice().sort();
  var keyCol = idx[keyField];
  var lines = [];
  for (var r = 1; r < grid.length; r++) {
    var parts = [];
    for (var i = 0; i < f.length; i++) {
      var c = idx[f[i]];
      parts.push(f[i] + '=' + (c === undefined ? '' : pvStr_(grid[r][c])));
    }
    lines.push(pvStr_(keyCol === undefined ? '' : grid[r][keyCol]) + '::' + parts.join(';;'));
  }
  return pvSha_(lines.join('\n'));
}

/** Blank / TRUE / FALSE / OTHER, counted from the RAW cell. A checkbox column returns booleans, not text. */
function pvFlagCensus_(header, grid, field) {
  var c = pvIndex_(header)[field];
  var out = { present: c !== undefined, blank: 0, TRUE: 0, FALSE: 0, OTHER: 0, booleanCells: 0, samples: [] };
  if (c === undefined) return out;
  for (var r = 1; r < grid.length; r++) {
    var raw = grid[r][c];
    if (typeof raw === 'boolean') out.booleanCells++;
    var v = pvStr_(raw);
    if (v === '') out.blank++;
    else if (/^true$/i.test(v)) out.TRUE++;
    else if (/^false$/i.test(v)) out.FALSE++;
    else { out.OTHER++; if (out.samples.length < 5) out.samples.push('row ' + (r + 1) + ': ' + JSON.stringify(raw)); }
  }
  return out;
}

function pvProdCheck_(ss, name, expected) {
  if (typeof prodRequireSheet_ !== 'function') return 'UNAVAILABLE — 29_production_safety_adapter.gs not loaded';
  try { prodRequireSheet_(ss, name, expected); return 'PASS'; }
  catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }
}

function TEMP_PRICING_R2_POST_VERIFY() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  var checks = [];
  function check(label, cond, detail) { checks.push({ label: label, ok: !!cond, detail: detail }); }
  // A value invariant failing is a different kind of event from a shape invariant failing: one means data is
  // gone, the other means the layout needs another pass. Only the first is a reason to restore a snapshot.
  var valueFailures = [];
  function valueCheck(label, cond, detail) {
    checks.push({ label: label, ok: !!cond, detail: detail });
    if (!cond) valueFailures.push(label);
  }

  p('TEMP PRICING-R2 SCHEMA RECONCILIATION — POST VERIFY (READ ONLY)');
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  if (typeof PRICING_LIST_HEADERS_ === 'undefined' || typeof PRICING_MANUAL_FLAG_COLUMNS_ === 'undefined'
      || typeof PRICING_CHANGE_LOG_HEADERS_ === 'undefined') {
    p('AUTHORITY_NOT_LOADED — 73_api_v1_pricing_write.gs is not in this project. Sync it and SAVE first.');
    p('BLOCKED'); return done();
  }
  var CANON = PRICING_LIST_HEADERS_.slice();
  var FLAGS = PRICING_MANUAL_FLAG_COLUMNS_.slice();
  var LOGCANON = PRICING_CHANGE_LOG_HEADERS_.slice();
  p('authority 73_ build: ' + (typeof PRW_BUILD_VERSION_ === 'string' ? PRW_BUILD_VERSION_ : '(unknown)'));

  // ---- THE TWO DECLARATIONS MUST AGREE ------------------------------------------------------------------------
  // The runtime authority is 73_. The transcribed expectation is the task. If they differ, the sheet cannot be
  // verified against "the" canonical order, because there are two of them.
  var declMatch = CANON.length === PV_EXPECTED_CANONICAL_.length
    && CANON.every(function (h, i) { return h === PV_EXPECTED_CANONICAL_[i]; });
  var logDeclMatch = LOGCANON.length === PV_EXPECTED_LOG_CANONICAL_.length
    && LOGCANON.every(function (h, i) { return h === PV_EXPECTED_LOG_CANONICAL_[i]; });
  p('DECLARATION_CROSS_CHECK pricing_list       = ' + (declMatch ? 'AGREE' : '*** DISAGREE ***'));
  p('DECLARATION_CROSS_CHECK pricing_change_log = ' + (logDeclMatch ? 'AGREE' : '*** DISAGREE ***'));
  if (!declMatch || !logDeclMatch) {
    p('BLOCKED — the deployed authority and the order this round was asked to prove are not the same list.');
    p('  73_ pricing_list  : ' + CANON.join(', '));
    p('  expected          : ' + PV_EXPECTED_CANONICAL_.join(', '));
    p('  73_ change_log    : ' + LOGCANON.join(', '));
    p('  expected          : ' + PV_EXPECTED_LOG_CANONICAL_.join(', '));
    p('Nothing is verified against a contested list. Resolve which one is right first.');
    return done();
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PV_PRICE_TAB_);
  var logSh = ss.getSheetByName(PV_LOG_TAB_);
  if (!sh || !logSh) {
    p('BLOCKED — ' + (!sh ? PV_PRICE_TAB_ : PV_LOG_TAB_) + ' is not present.');
    return done();
  }

  // ---- 1. pricing_list PHYSICAL SCHEMA -------------------------------------------------------------------------
  var grid = sh.getDataRange().getValues();
  var head = (grid[0] || []).map(pvStr_);
  var rowCount = grid.length - 1;
  rule();
  p('1 · pricing_list PHYSICAL SCHEMA');
  head.forEach(function (h, i) { p('  ' + String(i + 1).padStart(2) + ' ' + (h === '' ? '(BLANK)' : h)); });

  var seen = {}, dupes = [], blanks = [];
  head.forEach(function (h, i) {
    if (h === '') { blanks.push(i + 1); return; }
    if (seen[h]) dupes.push(h); else seen[h] = 1;
  });
  var extensions = head.slice(CANON.length);
  var unknownExt = extensions.filter(function (h) { return PV_EXPECTED_EXTENSIONS_.indexOf(h) === -1; });

  check('ROW_COUNT_POST == 495', rowCount === PV_PRE_ROW_COUNT_, rowCount + ' vs ' + PV_PRE_ROW_COUNT_);
  check('COLUMN_COUNT_POST == 32', head.length === CANON.length + PV_EXPECTED_EXTENSIONS_.length, String(head.length));
  check('canonical positions 1..30 EXACT',
    CANON.every(function (h, i) { return head[i] === h; }), head.slice(0, CANON.length).join(','));
  check('marketplace_id at position 31', head[30] === 'marketplace_id', String(head[30]));
  check('company at position 32', head[31] === 'company', String(head[31]));
  check('DUPLICATE_HEADER_NAMES == 0', dupes.length === 0, dupes.join(','));
  check('BLANK_HEADER_NAMES == 0', blanks.length === 0, blanks.join(','));
  check('UNKNOWN_EXTENSIONS == 0', unknownExt.length === 0, unknownExt.join(','));
  p('ROW_COUNT_POST = ' + rowCount + '   COLUMN_COUNT_POST = ' + head.length);
  p('EXTENSIONS = ' + (extensions.length ? extensions.join(', ') : '(none)'));

  // ---- 2. MANUAL AUTHORITY INITIALIZATION ----------------------------------------------------------------------
  rule();
  p('2 · MANUAL AUTHORITY — three-state census, read from the RAW cell');
  var flagCounts = {};
  FLAGS.forEach(function (f) {
    var c = pvFlagCensus_(head, grid, f);
    flagCounts[f] = c;
    p('  ' + f + '  blank=' + c.blank + '  TRUE=' + c.TRUE + '  FALSE=' + c.FALSE + '  OTHER=' + c.OTHER
      + (c.booleanCells ? '   [' + c.booleanCells + ' cells are BOOLEAN, not text — the column is formatted as a checkbox]' : ''));
    c.samples.forEach(function (s) { p('      OTHER ' + s); });
    check(f + ' blank on all ' + rowCount + ' rows', c.present && c.blank === rowCount, c.blank + ' of ' + rowCount);
    check(f + ' TRUE == 0', c.TRUE === 0, String(c.TRUE));
    // FALSE is the one that matters. Blank is UNKNOWN — nobody has said who owns this field. FALSE is a
    // claim that the system owns it and the next FX run may overwrite it, made for the whole price book at
    // once, with no operator ever asked.
    check(f + ' FALSE == 0 (blank must stay UNKNOWN)', c.FALSE === 0, String(c.FALSE));
    check(f + ' OTHER == 0', c.OTHER === 0, String(c.OTHER));
  });

  // ---- 3. pricing_change_log ------------------------------------------------------------------------------------
  var logGrid = logSh.getDataRange().getValues();
  var logHead = (logGrid[0] || []).map(pvStr_);
  var logRows = logGrid.length - 1;
  rule();
  p('3 · pricing_change_log');
  p('  header (' + logHead.length + '): ' + logHead.join(', '));
  p('  ROW_COUNT = ' + logRows);
  var logSeen = {}, logDupes = [];
  logHead.forEach(function (h) { if (h !== '' && logSeen[h]) logDupes.push(h); else logSeen[h] = 1; });
  var logExt = logHead.slice(LOGCANON.length);
  var logUnknownExt = logExt.filter(function (h) { return PV_EXPECTED_LOG_EXTENSIONS_.indexOf(h) === -1; });

  check('change_log COLUMN_COUNT == 15',
    logHead.length === LOGCANON.length + PV_EXPECTED_LOG_EXTENSIONS_.length, String(logHead.length));
  check('change_log canonical positions 1..9 EXACT',
    LOGCANON.every(function (h, i) { return logHead[i] === h; }), logHead.slice(0, LOGCANON.length).join(','));
  check('change_log PK is log_id at position 1', logHead[0] === 'log_id', String(logHead[0]));
  check('pricing_log_id NO LONGER EXISTS', logHead.indexOf('pricing_log_id') === -1);
  check('change_log extensions exact, in order',
    PV_EXPECTED_LOG_EXTENSIONS_.every(function (h, i) { return logExt[i] === h; }), logExt.join(','));
  check('change_log UNKNOWN_EXTENSIONS == 0', logUnknownExt.length === 0, logUnknownExt.join(','));
  check('change_log DUPLICATE_HEADER_NAMES == 0', logDupes.length === 0, logDupes.join(','));
  // 0 was the PRE count. A row appearing between the migration and this verification is not a fault, but it
  // is a fact that has to be seen rather than averaged away.
  check('change_log ROW_COUNT == 0', logRows === 0, String(logRows));

  // ---- 4. VALUE PRESERVATION, PROVEN TWICE -----------------------------------------------------------------------
  rule();
  p('4 · VALUE PRESERVATION — by NAME, never by column number');

  // (a) against the FROZEN BASELINE
  var postIds = pvLogicalHash_(head, grid, ['pricing_id'], 'pricing_id');
  var idsOnly = [];
  var idCol = pvIndex_(head)['pricing_id'];
  for (var r = 1; r < grid.length; r++) idsOnly.push(pvStr_(grid[r][idCol]));
  var postIdsHash = pvSha_(idsOnly.join('\n'));
  var postLogical = pvLogicalHash_(head, grid, PV_PRE_FIELDS_, 'pricing_id');
  p('  PRICING_IDS_POST_HASH  = ' + postIdsHash);
  p('    expected (frozen)    = ' + PV_PRE_IDS_HASH_ + (postIdsHash === PV_PRE_IDS_HASH_ ? '   MATCH' : '   *** MISMATCH ***'));
  p('  FULL_LOGICAL_HASH_POST = ' + postLogical);
  p('    expected (frozen)    = ' + PV_PRE_LOGICAL_HASH_ + (postLogical === PV_PRE_LOGICAL_HASH_ ? '   MATCH' : '   *** MISMATCH ***'));
  p('  (the HEADER hash is EXPECTED to differ — the layout changed on purpose. A header hash that survived');
  p('   this migration would mean the migration had not happened.)');
  valueCheck('PRICING_IDS_HASH == frozen PRE', postIdsHash === PV_PRE_IDS_HASH_);
  valueCheck('FULL_LOGICAL_HASH == frozen PRE', postLogical === PV_PRE_LOGICAL_HASH_);

  // (b) against the PRE SNAPSHOT — the actual bytes from before the write, compared field by field
  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(PV_SNAP_PREFIX_) === 0; }).sort();
  var logSnaps = names.filter(function (n) { return n.indexOf(PV_LOG_SNAP_PREFIX_) === 0; }).sort();
  var snapName = snaps.length ? snaps[snaps.length - 1] : '';
  var stamp = snapName ? snapName.substring(PV_SNAP_PREFIX_.length) : '';
  var logSnapName = stamp && names.indexOf(PV_LOG_SNAP_PREFIX_ + stamp) !== -1 ? PV_LOG_SNAP_PREFIX_ + stamp : '';

  rule();
  p('  SNAPSHOT COMPARISON — POST against the bytes that existed before the write');
  if (!snapName) {
    p('  NO PRE SNAPSHOT FOUND. The frozen-baseline proof above still stands, but it rests on two numbers');
    p('  transcribed from a dry run; the snapshot would have been independent of them. Do not delete');
    p('  snapshots before this verification runs.');
    check('PRE snapshot available for independent comparison', false, 'none found');
  } else {
    var snapGrid = ss.getSheetByName(snapName).getDataRange().getValues();
    var snapHead = (snapGrid[0] || []).map(pvStr_);
    p('  snapshot ' + snapName + '  (' + (snapGrid.length - 1) + ' rows, ' + snapHead.length + ' columns)');
    check('snapshot ROW_COUNT == POST ROW_COUNT', (snapGrid.length - 1) === rowCount,
      (snapGrid.length - 1) + ' vs ' + rowCount);

    // Row identity first: the comparison below is positional between the two grids, so it only means
    // anything if row N is the same row on both sides.
    var snapIdx = pvIndex_(snapHead);
    var sameOrder = true;
    for (var q = 1; q < Math.min(snapGrid.length, grid.length); q++) {
      if (pvStr_(snapGrid[q][snapIdx['pricing_id']]) !== pvStr_(grid[q][idCol])) { sameOrder = false; break; }
    }
    valueCheck('row order preserved (pricing_id matches row for row)', sameOrder);

    PV_GROUPS_.forEach(function (g) {
      var missing = g.fields.filter(function (f) { return snapIdx[f] === undefined; });
      if (missing.length) {
        check(g.key + ' present in the snapshot', false, 'absent: ' + missing.join(','));
        return;
      }
      var a = pvLogicalHash_(snapHead, snapGrid, g.fields, 'pricing_id');
      var b = pvLogicalHash_(head, grid, g.fields, 'pricing_id');
      p('  ' + (g.key + '                    ').slice(0, 20) + ' ' + (a === b ? 'UNCHANGED' : '*** CHANGED ***'));
      valueCheck(g.key + '_UNCHANGED', a === b, a === b ? '' : a + ' vs ' + b);
    });

    // Every PRE column, not only the grouped ones — so a field nobody thought to group cannot slip through.
    var allSame = true, movedFields = [];
    PV_PRE_FIELDS_.forEach(function (f) {
      var x = pvLogicalHash_(snapHead, snapGrid, [f], 'pricing_id');
      var y = pvLogicalHash_(head, grid, [f], 'pricing_id');
      if (x !== y) { allSame = false; movedFields.push(f); }
    });
    valueCheck('EVERY one of the ' + PV_PRE_FIELDS_.length + ' PRE fields is unchanged', allSame, movedFields.join(','));
  }

  if (logSnapName) {
    var lsg = ss.getSheetByName(logSnapName).getDataRange().getValues();
    p('  snapshot ' + logSnapName + '  (' + (lsg.length - 1) + ' rows, ' + ((lsg[0] || []).length) + ' columns)');
    check('change_log snapshot ROW_COUNT == POST ROW_COUNT', (lsg.length - 1) === logRows,
      (lsg.length - 1) + ' vs ' + logRows);
    if (logRows > 0) {
      // The rename only means what it claims if the values came across it.
      var lsHead = (lsg[0] || []).map(pvStr_);
      var preFieldsLog = lsHead.map(function (h) { return h === 'pricing_log_id' ? 'log_id' : h; });
      var la = pvLogicalHash_(preFieldsLog, lsg, preFieldsLog.filter(function (h) { return h !== ''; }), 'log_id');
      var lb = pvLogicalHash_(logHead, logGrid, preFieldsLog.filter(function (h) { return h !== ''; }), 'log_id');
      valueCheck('change_log values unchanged across the rename', la === lb);
    } else {
      p('  change_log had 0 rows and has 0 rows — the rename re-interpreted nothing, because there was');
      p('  nothing to re-interpret. That is a vacuous proof, and it is reported as one.');
    }
  }

  // ---- 5. THE REAL RUNTIME VALIDATOR ------------------------------------------------------------------------------
  rule();
  p('5 · prodRequireSheet_ — the gate that actually refuses pricing writes');
  var prodPrice = pvProdCheck_(ss, PV_PRICE_TAB_, CANON);
  var prodLog = pvProdCheck_(ss, PV_LOG_TAB_, LOGCANON);
  p('  pricing_list       = ' + prodPrice);
  p('  pricing_change_log = ' + prodLog);
  check('prodRequireSheet_ pricing_list PASS', prodPrice === 'PASS', prodPrice);
  check('prodRequireSheet_ pricing_change_log PASS', prodLog === 'PASS', prodLog);

  // ---- 6. SNAPSHOTS ------------------------------------------------------------------------------------------------
  rule();
  p('6 · PRE SNAPSHOTS — left in place. Do not delete them yet.');
  snaps.concat(logSnaps).forEach(function (n) {
    var g2 = ss.getSheetByName(n).getDataRange().getValues();
    p('  ' + n + '   ' + (g2.length - 1) + ' rows, ' + ((g2[0] || []).length) + ' columns');
  });
  if (!snaps.length && !logSnaps.length) p('  (none found)');

  // ---- VERDICT -----------------------------------------------------------------------------------------------------
  rule();
  p('RESULTS');
  var allOk = true;
  checks.forEach(function (c) {
    if (!c.ok) allOk = false;
    p('  ' + (c.ok ? 'PASS  ' : 'FAIL  ') + c.label + (c.detail ? '   [' + c.detail + ']' : ''));
  });

  rule();
  p('§7 REPORT');
  p('PRICING_SCHEMA_MIGRATION_PASS = ' + (allOk ? 'YES' : 'NO'));
  p('ROW_COUNT_POST                = ' + rowCount);
  p('COLUMN_COUNT_POST             = ' + head.length);
  p('PRICING_LIST_CANONICAL_ORDER  = ' + (CANON.every(function (h, i) { return head[i] === h; }) ? 'EXACT 1..30' : 'MISMATCH'));
  p('PRICING_LIST_EXTENSIONS       = ' + (extensions.length ? extensions.join(', ') : '(none)'));
  p('MANUAL_FLAGS_BLANK_COUNTS     = ' + FLAGS.map(function (f) {
    return f + ':' + flagCounts[f].blank + '/' + rowCount
      + (flagCounts[f].TRUE || flagCounts[f].FALSE || flagCounts[f].OTHER
        ? ' (TRUE=' + flagCounts[f].TRUE + ' FALSE=' + flagCounts[f].FALSE + ' OTHER=' + flagCounts[f].OTHER + ')' : '');
  }).join('  '));
  p('CHANGE_LOG_ROW_COUNT          = ' + logRows);
  p('CHANGE_LOG_COLUMN_COUNT       = ' + logHead.length);
  p('CHANGE_LOG_PK                 = ' + logHead[0] + (logHead.indexOf('pricing_log_id') === -1 ? '   (pricing_log_id GONE)' : '   *** pricing_log_id STILL PRESENT ***'));
  p('CHANGE_LOG_CANONICAL_ORDER    = ' + (LOGCANON.every(function (h, i) { return logHead[i] === h; }) ? 'EXACT 1..9' : 'MISMATCH'));
  PV_GROUPS_.forEach(function (g) {
    var row = checks.filter(function (c) { return c.label === g.key + '_UNCHANGED'; })[0];
    p((g.key + '_UNCHANGED                 ').slice(0, 30) + '= ' + (!row ? 'NOT MEASURED (no snapshot)' : (row.ok ? 'YES' : 'NO')));
  });
  p('PRICING_LIST_PROD_REQUIRE_SHEET = ' + prodPrice);
  p('CHANGE_LOG_PROD_REQUIRE_SHEET   = ' + prodLog);
  p('PRE_SNAPSHOT_TABS               = ' + (snaps.concat(logSnaps).join(', ') || '(none)'));

  // A value invariant failing means data is gone and the snapshot is the way back. A shape invariant failing
  // with every value intact does not: restoring would discard a correct migration to fix a cosmetic fault,
  // and re-running the reconciliation is both cheaper and reversible. The two are not the same event and are
  // not reported as one.
  p('ROLLBACK_REQUIRED               = ' + (valueFailures.length ? 'YES — ' + valueFailures.join('; ')
    : (allOk ? 'NO' : 'NO — every VALUE invariant passed; the failures above are shape, not data')));
  p('');
  if (allOk) {
    p('PRICING_R2_DB_SCHEMA = SEALED');
  } else {
    p('PRICING_R2_DB_SCHEMA = NOT SEALED');
    p('STOP. Nothing here repairs anything. Report this output.');
  }
  return done();
}
