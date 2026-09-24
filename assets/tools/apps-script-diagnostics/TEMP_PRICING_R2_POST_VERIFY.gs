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
 *
 * ============================================================================================
 * TWO KINDS OF MIGRATION, AND THEY CANNOT SHARE ONE ACCEPTANCE RULE
 * ============================================================================================
 *
 * The rule above — every PRE field unchanged — is correct for a migration that moves columns and
 * changes no values. It is WRONG for one that was authorised to change values, and being wrong in
 * that direction is dangerous in a specific way: it reports data loss on a correct sheet and
 * recommends restoring a snapshot over it. A verifier that can order the destruction of a good
 * migration is worse than no verifier.
 *
 *   PV_MODE_ = SCHEMA_ONLY        every PRE field must be unchanged. Nothing may move.
 *   PV_MODE_ = BASE_SOURCE_SYNC   the four fields in PV_BASE_SYNC_FIELDS_ are EXPECTED to differ
 *                                 from PRE, and are instead verified against sku_details. Every
 *                                 other PRE field must still be unchanged, exactly as before.
 *
 * THE MUTATION SET IS EXPLICIT AND NARROW. It is four named fields, not "base-ish things", and not a
 * relaxation of the comparison. The PRE check is not removed for them — it is REPLACED by a stronger
 * one: their values must equal what sku_details says, row by row, resolved through the same two-hop
 * join the workspace uses. Dropping the PRE check without adding that would leave those four columns
 * verified by nothing at all, which is how "expected to change" becomes "unchecked".
 *
 * AND THE SOURCE READ IS THIS FILE'S OWN. It does not call psf*, does not read the migration's plan,
 * and does not trust a count from a dry run. It goes to sku_details itself. Where the two agree, the
 * agreement means something.
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
//
// READ THE NEXT SENTENCE BEFORE CHANGING EITHER DIGEST FUNCTION BELOW. PV_PRE_LOGICAL_HASH_ was produced by
// the reconciliation tool, in ITS wire format. This file's own pvLogicalHash_ uses a different format on
// purpose, so comparing the frozen constant against it would compare two digests of two different
// encodings of the same data and report a mismatch on a perfectly good sheet — a false data-loss, and an
// instruction to restore a snapshot over a correct migration. That is the worst thing this file could do.
// pvBaselineHash_ therefore re-implements the frozen constant's ENCODING, from the format, not by calling
// the tool. Matching a documented wire format is not sharing an implementation.
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

// WHICH MIGRATION IS BEING VERIFIED. Set deliberately; it is not inferred from the sheet, because a
// verifier that decides for itself which rules to apply can always find a set under which it passes.
//   'SCHEMA_ONLY'       — columns moved, no value changed anywhere.
//   'BASE_SOURCE_SYNC'  — PRICING-R2-BASE-SOURCE-FINAL: the four base fields were re-sourced from
//                         sku_details on purpose, and are verified against it instead of against PRE.
var PV_MODE_ = 'BASE_SOURCE_SYNC';

// THE ENTIRE EXPECTED MUTATION SET. Four names. A field not on this list must be byte-identical to PRE
// in either mode, and a field ON it is not thereby unchecked — see PV_BASE_SOURCE_MAP_.
var PV_BASE_SYNC_FIELDS_ = ['base_regular_price', 'base_minimum_price', 'base_msrp', 'base_currency'];

// The frozen source contract, transcribed from the task and cross-checked against 04_ at run time below.
var PV_BASE_SOURCE_MAP_ = [
  { target: 'base_regular_price', source: 'selling_price', numeric: true },
  { target: 'base_minimum_price', source: 'minimum_price', numeric: true },
  { target: 'base_msrp', source: 'msrp', numeric: true },
  { target: 'base_currency', source: 'base_currency', numeric: false }
];

// Named rows the operator can check by eye against the spreadsheet. Sampling by sku rather than by row
// number, because a row number means nothing once the layout has changed.
var PV_SAMPLE_SKUS_ = ['CO1100-R', 'CO1150-AG'];

// What the AUTHORISED dry run said it would do. This is a CROSS-CHECK, not an acceptance criterion: a
// disagreement means production moved between the plan and the write, which is worth seeing, and it is
// reported as a shape finding rather than as data loss. The seal is decided by the row-by-row comparison
// against sku_details, which is a measurement rather than a number somebody typed.
var PV_EXPECTED_BASE_CENSUS_ = {
  base_regular_price: { nonblank: 493, blank: 2 },
  base_minimum_price: { nonblank: 485, blank: 10 },
  base_msrp: { nonblank: 490, blank: 5 },
  base_currency: { nonblank: 495, blank: 0 }
};

var PV_PRICE_TAB_ = 'pricing_list';
var PV_LOG_TAB_ = 'pricing_change_log';
var PV_MSKU_TAB_ = 'marketplace_skus';
var PV_SKU_TAB_ = 'sku_details';
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

/**
 * The FROZEN BASELINE digest, in the encoding PV_PRE_LOGICAL_HASH_ was measured in:
 *     pricing_id + '|#|' + (field + '|~|' + value) joined by '|#|', fields SORTED, lines joined by newline.
 * Written from that format rather than by calling tempPr2sLogicalHash_, so a defect in the reconciliation
 * tool's implementation cannot reproduce itself here — but the number stays comparable to the one the
 * operator froze before the migration ran, which is the only check that survives a deleted snapshot.
 */
function pvBaselineHash_(header, grid, fields) {
  var idx = pvIndex_(header);
  var f = fields.slice().sort();
  var idCol = idx['pricing_id'];
  var lines = [];
  for (var r = 1; r < grid.length; r++) {
    var parts = [];
    for (var i = 0; i < f.length; i++) {
      var c = idx[f[i]];
      parts.push(f[i] + '|~|' + (c === undefined ? '' : pvStr_(grid[r][c])));
    }
    lines.push(pvStr_(idCol === undefined ? '' : grid[r][idCol]) + '|#|' + parts.join('|#|'));
  }
  return pvSha_(lines.join('\n'));
}

/** Blank / TRUE / FALSE / OTHER, counted from the RAW cell. A checkbox column returns booleans, not text. */
/** A number, or null. Blank is not zero and a Date is not a price. */
function pvNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var s = pvStr_(v);
  if (s === '') return null;
  var n = Number(s.replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : null;
}

function pvKind_(v) {
  if (v === '' || v === null || v === undefined) return 'blank';
  if (v instanceof Date) return 'Date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

/** Does this number format make a numeric cell come back as a Date? */
function pvIsDateFormat_(f) {
  var s = pvStr_(f);
  if (s === '' || s === '@') return false;
  if (/^[0#.,$%\s]+$/.test(s)) return false;
  return /y{2,}|d{1,2}\/|m{1,2}\/|dd|mmm/.test(s);
}

/**
 * THIS FILE'S OWN JOIN. pricing_list -> marketplace_skus -> sku_details, on the ids, the way
 * 72_api_v1_product_pricing_workspace.gs:1031-1034 resolves site membership. It is written here rather
 * than called from the migration tool for the same reason the digests are: if the verifier resolves the
 * source through the migration's own code, then a join that attached to the wrong product would verify
 * clean against itself.
 *
 * A duplicate on either hop is AMBIGUOUS and is never resolved by taking the first candidate.
 */
function pvResolveSource_(priceGrid, pIdx, mGrid, mIdx, dGrid, dIdx) {
  var byId = {}, dupId = {};
  for (var i = 1; i < mGrid.length; i++) {
    var id = pvStr_(mGrid[i][mIdx['marketplace_sku_id']]);
    if (id === '') continue;
    if (Object.prototype.hasOwnProperty.call(byId, id)) dupId[id] = 1; else byId[id] = mGrid[i];
  }
  var bySku = {}, dupSku = {};
  for (var j = 1; j < dGrid.length; j++) {
    var sk = pvStr_(dGrid[j][dIdx['sku']]).toLowerCase();
    if (sk === '') continue;
    if (Object.prototype.hasOwnProperty.call(bySku, sk)) dupSku[sk] = 1; else bySku[sk] = dGrid[j];
  }
  var rows = [];
  for (var r = 1; r < priceGrid.length; r++) {
    var mid = pvStr_(priceGrid[r][pIdx['marketplace_sku_id']]);
    var rec = { row: r, pricing_id: pvStr_(priceGrid[r][pIdx['pricing_id']]), msku: mid,
      sku: '', status: '', src: null };
    if (mid === '') { rec.status = 'NO_IDENTITY'; rows.push(rec); continue; }
    if (dupId[mid]) { rec.status = 'AMBIGUOUS_MARKETPLACE_SKU'; rows.push(rec); continue; }
    var m = byId[mid];
    if (!m) { rec.status = 'NO_MARKETPLACE_SKU'; rows.push(rec); continue; }
    rec.sku = pvStr_(m[mIdx['sku']]);
    if (rec.sku === '') { rec.status = 'NO_MASTER_SKU'; rows.push(rec); continue; }
    var key = rec.sku.toLowerCase();
    if (dupSku[key]) { rec.status = 'AMBIGUOUS_SKU_DETAILS'; rows.push(rec); continue; }
    var d = bySku[key];
    if (!d) { rec.status = 'NO_SKU_DETAILS'; rows.push(rec); continue; }
    rec.status = 'MATCHED'; rec.src = d;
    rows.push(rec);
  }
  return { rows: rows, dupIds: Object.keys(dupId), dupSkus: Object.keys(dupSku) };
}

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
  p('PV_MODE_ = ' + PV_MODE_);
  var syncMode = PV_MODE_ === 'BASE_SOURCE_SYNC';
  if (syncMode) {
    p('  BASE_SOURCE_SYNC: ' + PV_BASE_SYNC_FIELDS_.join(', '));
    p('  those four are EXPECTED to differ from PRE and are verified against sku_details instead.');
    p('  Every other PRE field must still be byte-identical to the snapshot.');
  } else {
    p('  SCHEMA_ONLY: every PRE field must be byte-identical. No value may have moved.');
  }
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
  var idsOnly = [];
  var idCol = pvIndex_(head)['pricing_id'];
  for (var r = 1; r < grid.length; r++) idsOnly.push(pvStr_(grid[r][idCol]));
  var postIdsHash = pvSha_(idsOnly.join('\n'));
  // TWO digests over the same rows, in two encodings, for two different jobs. The baseline one is
  // comparable to the number frozen before the migration; the independent one is what the snapshot
  // comparison below uses, and it is deliberately NOT the reconciliation tool's encoding.
  var postLogical = pvBaselineHash_(head, grid, PV_PRE_FIELDS_);
  var postIndependent = pvLogicalHash_(head, grid, PV_PRE_FIELDS_, 'pricing_id');
  p('  PRICING_IDS_POST_HASH  = ' + postIdsHash);
  p('    expected (frozen)    = ' + PV_PRE_IDS_HASH_ + (postIdsHash === PV_PRE_IDS_HASH_ ? '   MATCH' : '   *** MISMATCH ***'));
  p('  FULL_LOGICAL_HASH_POST = ' + postLogical + '   (baseline encoding)');
  p('    expected (frozen)    = ' + PV_PRE_LOGICAL_HASH_ + (postLogical === PV_PRE_LOGICAL_HASH_ ? '   MATCH' : '   *** MISMATCH ***'));
  p('  INDEPENDENT_DIGEST     = ' + postIndependent + '   (this file\'s own encoding — not comparable to the frozen value, and not meant to be)');
  p('  (the HEADER hash is EXPECTED to differ — the layout changed on purpose. A header hash that survived');
  p('   this migration would mean the migration had not happened.)');
  // Identity is untouched in BOTH modes, so this stays binding and stays snapshot-independent. It is the
  // only value anchor that survives a deleted snapshot, which is why it is checked first.
  valueCheck('PRICING_IDS_HASH == frozen PRE', postIdsHash === PV_PRE_IDS_HASH_);
  if (syncMode) {
    p('  FULL_LOGICAL_HASH is EXPECTED to differ here. The frozen constant covers every PRE field,');
    p('  including the base prices this round was authorised to change, so comparing against it');
    p('  would report data loss on a correct sheet. The binding comparisons are the NON-BASE subset');
    p('  below and the row-by-row check against sku_details.');
    check('FULL_LOGICAL_HASH differs from frozen PRE (expected after a base sync)',
      postLogical !== PV_PRE_LOGICAL_HASH_,
      postLogical === PV_PRE_LOGICAL_HASH_ ? 'IDENTICAL — no base value changed; did the sync run?' : '');
  } else {
    valueCheck('FULL_LOGICAL_HASH == frozen PRE', postLogical === PV_PRE_LOGICAL_HASH_);
  }

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
      var expectedToMove = syncMode && g.key === 'BASE_VALUES';
      p('  ' + (g.key + '                    ').slice(0, 20) + ' '
        + (a === b ? 'UNCHANGED' : (expectedToMove ? 'CHANGED (expected — base sync)' : '*** CHANGED ***')));
      if (expectedToMove) {
        // Not skipped. A base sync that changed NOTHING is also a finding: it means the write did not do
        // what it was authorised to do, and the seal would be sealing the old data.
        check('BASE_VALUES changed from PRE (expected in BASE_SOURCE_SYNC mode)', a !== b,
          a === b ? 'identical to PRE — the base sync appears not to have run' : '');
      } else {
        valueCheck(g.key + '_UNCHANGED', a === b, a === b ? '' : a + ' vs ' + b);
      }
    });

    // Every PRE column, not only the grouped ones — so a field nobody thought to group cannot slip through.
    var movedFields = [], movedExpected = [];
    PV_PRE_FIELDS_.forEach(function (f) {
      var x = pvLogicalHash_(snapHead, snapGrid, [f], 'pricing_id');
      var y = pvLogicalHash_(head, grid, [f], 'pricing_id');
      if (x === y) return;
      if (syncMode && PV_BASE_SYNC_FIELDS_.indexOf(f) !== -1) movedExpected.push(f);
      else movedFields.push(f);
    });
    // Narrowed by the four declared names and by nothing else. A field outside that list is still data
    // loss, still names itself, and still asks for the snapshot back.
    var scopeLabel = syncMode
      ? 'EVERY PRE field OUTSIDE the declared mutation set is unchanged'
      : 'EVERY one of the ' + PV_PRE_FIELDS_.length + ' PRE fields is unchanged';
    valueCheck(scopeLabel, movedFields.length === 0, movedFields.join(','));
    if (syncMode) {
      p('  EXPECTED mutation observed in: ' + (movedExpected.join(', ') || '(none — see the finding above)'));
      p('  UNEXPECTED mutation observed in: ' + (movedFields.join(', ') || '(none)'));
    }
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

  // ---- 4B. BASE VALUES AGAINST sku_details ------------------------------------------------------------------------
  // THE CHECK THAT REPLACES "unchanged from PRE". Without it the four declared fields would be verified by
  // nothing at all, and "expected to change" would quietly mean "unchecked".
  var baseStats = { matched: 0, unmatched: 0, ambiguous: 0, noIdentity: 0, fields: {}, ran: false };
  var dateCounts = { base_msrp: { date: 0, number: 0, blank: 0, other: 0 } };
  var numericFmtBad = 0;
  var baseFieldDateTypes = {};
  if (syncMode) {
    rule();
    p('4B · BASE VALUES verified against ' + PV_SKU_TAB_ + ' — row by row, resolved on the ids');

    // §1 — the contract, re-derived rather than taken from the task text.
    var contractProblems = [];
    if (typeof handleImportMarketplaceSkusBatch_ === 'function') {
      var src04 = String(handleImportMarketplaceSkusBatch_);
      [['selling_price', 'base_regular_price'], ['minimum_price', 'base_minimum_price'],
       ['msrp', 'base_msrp']].forEach(function (pair) {
        if (src04.indexOf("indexOf('" + pair[0] + "')") === -1) contractProblems.push('04_ no longer reads sku_details.' + pair[0]);
        if (src04.indexOf("prCol('" + pair[1] + "')") === -1) contractProblems.push('04_ no longer writes pricing_list.' + pair[1]);
      });
    } else {
      contractProblems.push('04_marketplace_forecast_import.gs is not loaded — the map could not be re-derived');
    }

    var msh = ss.getSheetByName(PV_MSKU_TAB_), dsh = ss.getSheetByName(PV_SKU_TAB_);
    if (!msh || !dsh) {
      // In this mode the base columns have no other verifier. A missing source table is therefore data
      // that cannot be checked at all, not a cosmetic gap, and it must not seal.
      valueCheck('base source tables present (' + PV_MSKU_TAB_ + ', ' + PV_SKU_TAB_ + ')', false,
        (!msh ? PV_MSKU_TAB_ : '') + ' ' + (!dsh ? PV_SKU_TAB_ : ''));
      p('  BLOCKED for the base layer: with no source table the four declared fields are verified by');
      p('  nothing. This is reported as a VALUE failure, because unverified is not the same as correct.');
    } else {
      var mGrid = msh.getDataRange().getValues();
      var dGrid = dsh.getDataRange().getValues();
      var mIdx = pvIndex_((mGrid[0] || []).map(pvStr_));
      var dIdx = pvIndex_((dGrid[0] || []).map(pvStr_));
      var pIdx = pvIndex_(head);

      var joinCols = [[PV_MSKU_TAB_, mIdx, ['marketplace_sku_id', 'sku']],
                      [PV_SKU_TAB_, dIdx, ['sku']], [PV_PRICE_TAB_, pIdx, ['marketplace_sku_id']]];
      var joinMissing = [];
      joinCols.forEach(function (t) {
        t[2].forEach(function (c) { if (t[1][c] === undefined) joinMissing.push(t[0] + '.' + c); });
      });
      var srcMissing = PV_BASE_SOURCE_MAP_.filter(function (m) { return dIdx[m.source] === undefined; })
        .map(function (m) { return PV_SKU_TAB_ + '.' + m.source; });

      p('BASE_SOURCE_CONTRACT_AGREES = ' + (contractProblems.length === 0 && srcMissing.length === 0 ? 'YES' : 'NO'));
      contractProblems.forEach(function (x) { p('  ! ' + x); });
      srcMissing.forEach(function (x) { p('  ! missing source column ' + x); });
      p('BASE_SOURCE_JOIN_AGREES = ' + (joinMissing.length === 0 ? 'YES' : 'NO')
        + (joinMissing.length ? '   missing: ' + joinMissing.join(', ') : ''));
      check('BASE_SOURCE_CONTRACT_AGREES', contractProblems.length === 0 && srcMissing.length === 0,
        contractProblems.concat(srcMissing).join('; '));
      check('BASE_SOURCE_JOIN_AGREES', joinMissing.length === 0, joinMissing.join(', '));

      if (joinMissing.length || srcMissing.length) {
        valueCheck('base values verifiable against ' + PV_SKU_TAB_, false, 'the join or the source map is incomplete');
      } else {
        var J = pvResolveSource_(grid, pIdx, mGrid, mIdx, dGrid, dIdx);
        J.rows.forEach(function (rec) {
          if (rec.status === 'MATCHED') baseStats.matched++;
          else if (rec.status === 'NO_IDENTITY') baseStats.noIdentity++;
          else if (rec.status.indexOf('AMBIGUOUS') === 0) baseStats.ambiguous++;
          else baseStats.unmatched++;
        });
        baseStats.ran = true;
        p('SKU_DETAILS_MATCHED = ' + baseStats.matched);
        p('SKU_DETAILS_UNMATCHED = ' + baseStats.unmatched);
        p('JOIN_AMBIGUITY_COUNT = ' + baseStats.ambiguous
          + (J.dupIds.length ? '   dup marketplace_sku_id: ' + J.dupIds.slice(0, 5).join(',') : '')
          + (J.dupSkus.length ? '   dup sku_details.sku: ' + J.dupSkus.slice(0, 5).join(',') : ''));
        p('ROWS_WITH_NO_JOIN_IDENTITY = ' + baseStats.noIdentity);
        check('SKU_DETAILS_MATCHED == ' + rowCount, baseStats.matched === rowCount, String(baseStats.matched));
        valueCheck('JOIN_AMBIGUITY_COUNT == 0', baseStats.ambiguous === 0, String(baseStats.ambiguous));

        // PER FIELD. A nonblank source must be reproduced; a blank source must leave a blank target.
        // Those are two different correct outcomes and they are counted apart, so "490 match" can never
        // be read as "490 rows have a price".
        PV_BASE_SOURCE_MAP_.forEach(function (m) {
          var st = { match: 0, blankMatch: 0, mismatch: 0, unmatchedRows: 0, samples: [] };
          J.rows.forEach(function (rec) {
            if (rec.status !== 'MATCHED') { st.unmatchedRows++; return; }
            var sv = rec.src[dIdx[m.source]];
            var tv = grid[rec.row][pIdx[m.target]];
            var sBlank = pvStr_(sv) === '', tBlank = pvStr_(tv) === '';
            var okRow;
            if (sBlank) {
              okRow = tBlank;
            } else if (m.numeric) {
              var a = pvNum_(sv), b = pvNum_(tv);
              okRow = a !== null && b !== null && Math.abs(a - b) < 1e-9;
            } else {
              okRow = pvStr_(sv) === pvStr_(tv);
            }
            if (!okRow) {
              st.mismatch++;
              if (st.samples.length < 12) {
                st.samples.push(rec.pricing_id + ' | ' + rec.sku + ' | source '
                  + JSON.stringify(sv instanceof Date ? sv.toISOString() : sv) + ' (' + pvKind_(sv) + ')'
                  + ' | pricing_list ' + JSON.stringify(tv instanceof Date ? tv.toISOString() : tv)
                  + ' (' + pvKind_(tv) + ')');
              }
            } else if (sBlank) { st.blankMatch++; } else { st.match++; }
          });
          baseStats.fields[m.target] = st;
          var KEY = m.target.replace('base_', 'BASE_').replace('_price', '').toUpperCase();
          p(KEY + '_MATCH_COUNT = ' + st.match
            + '   ' + KEY + '_BLANK_MATCH_COUNT = ' + st.blankMatch
            + '   ' + KEY + '_MISMATCH_COUNT = ' + st.mismatch);
          st.samples.forEach(function (s2) { p('    MISMATCH  ' + s2); });
          valueCheck(m.target + ' matches ' + PV_SKU_TAB_ + '.' + m.source + ' on every matched row',
            st.mismatch === 0, st.mismatch + ' mismatched');

          // The authorised plan's census, as a CROSS-CHECK. A disagreement means production moved between
          // the plan and the write; it is worth seeing and it is not by itself data loss.
          var exp = PV_EXPECTED_BASE_CENSUS_[m.target];
          if (exp) {
            check(m.target + ' census agrees with the authorised dry run',
              st.match === exp.nonblank && st.blankMatch === exp.blank,
              'measured ' + st.match + '/' + st.blankMatch + '  planned ' + exp.nonblank + '/' + exp.blank);
          }
        });

        // §3 — TYPE AND FORMAT. Read the RAW cell and the number format, never the displayed text.
        rule();
        p('4C · BASE TYPE / FORMAT PROOF — raw values and number formats, not display');
        var fmts = sh.getRange(1, 1, grid.length, head.length).getNumberFormats();
        ['base_regular_price', 'base_minimum_price', 'base_msrp'].forEach(function (f) {
          var c = pIdx[f];
          var st2 = { date: 0, number: 0, blank: 0, other: 0, dateFmt: 0 };
          for (var r2 = 1; r2 <= rowCount; r2++) {
            var v = grid[r2][c];
            var k = pvKind_(v);
            if (k === 'Date') st2.date++;
            else if (k === 'number') st2.number++;
            else if (k === 'blank') st2.blank++;
            else st2.other++;
            if (pvIsDateFormat_((fmts[r2] || [])[c])) st2.dateFmt++;
          }
          baseFieldDateTypes[f] = st2;
          numericFmtBad += st2.dateFmt;
          p('  ' + f + '   number=' + st2.number + '  blank=' + st2.blank + '  Date=' + st2.date
            + '  other=' + st2.other + '  cells with a DATE FORMAT=' + st2.dateFmt);
          valueCheck(f.toUpperCase() + '_DATE_VALUE_COUNT == 0', st2.date === 0, String(st2.date));
          valueCheck(f.toUpperCase() + '_OTHER_TYPE_COUNT == 0', st2.other === 0, String(st2.other));
          check(f + ' has no cell carrying a date number format', st2.dateFmt === 0, String(st2.dateFmt));
        });
        dateCounts.base_msrp = baseFieldDateTypes['base_msrp'];
        valueCheck('NUMERIC_BASE_FIELDS_WITH_DATE_FORMAT == 0', numericFmtBad === 0, String(numericFmtBad));

        // Named rows an operator can open the spreadsheet and check by eye.
        p('  SAMPLES (by master sku, because a row number means nothing after a reorder)');
        PV_SAMPLE_SKUS_.forEach(function (want) {
          var hit = null;
          J.rows.forEach(function (rec) {
            if (!hit && rec.status === 'MATCHED' && rec.sku.toLowerCase() === want.toLowerCase()) hit = rec;
          });
          if (!hit) { p('    ' + want + '   NOT FOUND in this spreadsheet'); return; }
          var sM = hit.src[dIdx['msrp']], tM = grid[hit.row][pIdx['base_msrp']];
          p('    ' + want + '   sku_details.msrp = ' + JSON.stringify(sM) + ' (' + pvKind_(sM) + ')'
            + '   pricing_list.base_msrp = ' + JSON.stringify(tM instanceof Date ? tM.toISOString() : tM)
            + ' (' + pvKind_(tM) + ')'
            + '   format ' + JSON.stringify((fmts[hit.row] || [])[pIdx['base_msrp']]));
        });
      }
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

  // ---- THE BASE LAYER, reported under the names the task asks for ------------------------------------------
  if (syncMode) {
    rule();
    p('BASE LAYER');
    function passOf(label) {
      var row = null;
      checks.forEach(function (c) { if (c.label === label) row = c; });
      return !row ? 'NOT MEASURED' : (row.ok ? 'PASS' : 'FAIL');
    }
    p('SKU_DETAILS_MATCHED             = ' + (baseStats.ran ? baseStats.matched : 'NOT MEASURED'));
    p('SKU_DETAILS_UNMATCHED           = ' + (baseStats.ran ? baseStats.unmatched : 'NOT MEASURED'));
    p('JOIN_AMBIGUITY_COUNT            = ' + (baseStats.ran ? baseStats.ambiguous : 'NOT MEASURED'));
    PV_BASE_SOURCE_MAP_.forEach(function (m) {
      var st = baseStats.fields[m.target];
      var KEY = (m.target.replace('base_', 'BASE_').replace('_price', '') + '_MATCH_PASS').toUpperCase();
      p((KEY + '                                ').slice(0, 32) + '= '
        + passOf(m.target + ' matches ' + PV_SKU_TAB_ + '.' + m.source + ' on every matched row')
        + (st ? '   match=' + st.match + ' blankMatch=' + st.blankMatch + ' mismatch=' + st.mismatch : ''));
    });
    var bm = baseFieldDateTypes['base_msrp'];
    p('BASE_MSRP_DATE_VALUE_COUNT      = ' + (bm ? bm.date : 'NOT MEASURED'));
    p('BASE_MSRP_NONBLANK_NUMBER_COUNT = ' + (bm ? bm.number : 'NOT MEASURED'));
    p('BASE_MSRP_BLANK_COUNT           = ' + (bm ? bm.blank : 'NOT MEASURED'));
    p('BASE_MSRP_OTHER_TYPE_COUNT      = ' + (bm ? bm.other : 'NOT MEASURED'));
    p('NUMERIC_BASE_FIELDS_WITH_DATE_FORMAT = ' + (baseStats.ran ? numericFmtBad : 'NOT MEASURED'));

    var baseAllOk = baseStats.ran;
    PV_BASE_SOURCE_MAP_.forEach(function (m) {
      if (passOf(m.target + ' matches ' + PV_SKU_TAB_ + '.' + m.source + ' on every matched row') !== 'PASS') baseAllOk = false;
    });
    if (bm && (bm.date > 0 || bm.other > 0)) baseAllOk = false;
    if (numericFmtBad > 0) baseAllOk = false;
    p('BASE_SOURCE_MATCH_PASS          = ' + (baseAllOk ? 'YES' : 'NO'));
    // The base layer seals on its own evidence. A schema fault does not make the base data wrong, and a
    // base mismatch does not make the schema wrong; reporting one verdict for both would hide whichever
    // of them was fine.
    p('PRICING_R2_BASE_LAYER           = ' + (baseAllOk ? 'SEALED' : 'NOT SEALED'));
  } else {
    rule();
    p('BASE LAYER                      = NOT APPLICABLE (PV_MODE_ = ' + PV_MODE_ + ')');
  }

  // A value invariant failing means data is gone and the snapshot is the way back. A shape invariant failing
  // with every value intact does not: restoring would discard a correct migration to fix a cosmetic fault,
  // and re-running the reconciliation is both cheaper and reversible. The two are not the same event and are
  // not reported as one.
  p('ROLLBACK_REQUIRED               = ' + (valueFailures.length ? 'YES — ' + valueFailures.join('; ')
    : (allOk ? 'NO' : 'NO — every VALUE invariant passed; the failures above are shape, not data')));
  if (syncMode) {
    p('  base_* differing from PRE is NOT on that list and cannot get onto it: in this mode the PRE');
    p('  comparison for those four fields is not a value invariant at all. What IS on the list is a');
    p('  base value that disagrees with sku_details, which is the stronger claim it was replaced by.');
  }
  p('');
  if (allOk) {
    p('PRICING_R2_DB_SCHEMA = SEALED');
  } else {
    p('PRICING_R2_DB_SCHEMA = NOT SEALED');
    p('STOP. Nothing here repairs anything. Report this output.');
  }
  return done();
}
