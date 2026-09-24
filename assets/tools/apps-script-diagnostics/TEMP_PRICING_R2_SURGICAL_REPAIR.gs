/**
 * TEMP — PRICING-R2 SURGICAL REPAIR — restore base_msrp from PRE, then complete the canonical schema.
 *
 *     TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN()   // reads only. Proves the damage is what we think it is.
 *     TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT()    // one bounded repair. Refuses unless the dry run still holds.
 *
 * Repository-only operator tool. NOT a release file, no manifest row, no stamp, no deployment.
 *
 * ================================================================================================
 * ROOT CAUSE — proven, and it predicts the one thing that makes it credible: WHY ONLY base_msrp.
 * ================================================================================================
 *
 * setValues moves VALUES. A cell's number format belongs to the CELL, and stays where it is. So a
 * reorder that writes a new field into an old field's physical column hands that field the old
 * column's formatting — or, when the new field is a date, gives that physical column a DATE format
 * it will keep afterwards.
 *
 * Three physical columns received a date-typed field in the target layout:
 *
 *     physical 14   PRE base_msrp   (NUMERIC)  <- fx_rate_date   ** the only numeric one **
 *     physical 27   PRE updated_by  (text)     <- created_at
 *     physical 29   PRE note        (text)     <- updated_at
 *
 * Text is not coerced by a date format. A NUMBER is. base_msrp is the only numeric field whose
 * physical column received a date field, which is precisely why it is the only casualty — the
 * mechanism predicts the singularity rather than merely accommodating it.
 *
 * Then the rollback restored VALUES ONLY into those same cells, so base_msrp's numbers landed back
 * in a column that had become date-formatted, and getValues() now hands every reader a Date.
 *
 * THE QUANTITY SURVIVED, AND THE ARITHMETIC PROVES IT. Sheets' epoch is 1899-12-30, so serial 35 is
 * 1900-02-03 and serial 40 is 1900-02-08 — exactly the values the operator reported seeing for
 * prices of 35 and 40. The number was never altered; its TYPE was. That is still corruption, because
 * every consumer of getValues() now reads a Date where a price belongs — but it means the PRE
 * snapshot is a perfect source and nothing has to be reconstructed or estimated.
 *
 * ================================================================================================
 * THE FIX, AND WHY IT IS NOT "WRITE THE NUMBERS BACK"
 * ================================================================================================
 *
 * Writing the numbers back into date-formatted cells reproduces the fault. This tool sets the
 * NUMBER FORMAT of every target column FIRST, derived per FIELD NAME from the PRE snapshot, and
 * writes values after. Formats travel with the field, not with the physical column.
 *
 * WHAT IT WILL NOT DO. It never takes base_msrp from the effective `msrp` column — effective MSRP is
 * downstream of FX and of manual ownership and may legitimately differ from the base. PRE is the
 * only authority. It writes no pricing_change_log row, runs no FX, classifies no authority flag,
 * and refuses entirely unless base_msrp is the ONLY PRE field that differs.
 */

var PSR_PRICE_TAB_ = 'pricing_list';
var PSR_LOG_TAB_ = 'pricing_change_log';
var PSR_SNAP_PREFIX_ = 'PRE__pricing_list__';
var PSR_REPAIR_SNAP_PREFIX_ = 'PREREPAIR__pricing_list__';
var PSR_LOCK_MS_ = 30000;

// The single field this tool is allowed to take from the snapshot. Anything else differing is a
// different incident and stops the run.
var PSR_REPAIR_FIELD_ = 'base_msrp';

// Every field the PRE sheet had, so "only base_msrp differs" is a claim about all of them.
var PSR_PRE_FIELDS_ = [
  'pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'
];

// Paste from the DRY RUN before COMMIT.
var PSR_EXPECT_LIVE_HEADER_HASH_ = '';
var PSR_EXPECT_ROW_COUNT_ = -1;
var PSR_EXPECT_REPAIR_HASH_ = '';

function psrStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function psrSha_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var h = '';
  for (var i = 0; i < b.length; i++) {
    var v = (b[i] < 0 ? b[i] + 256 : b[i]).toString(16);
    h += v.length === 1 ? '0' + v : v;
  }
  return h;
}

function psrIndex_(header) { var m = {}; header.forEach(function (h, i) { m[h] = i; }); return m; }

/** The serial a cell would have as a number, whatever type it is wearing. */
function psrSerial_(v) {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
  var f = parseFloat(v);
  return isNaN(f) ? null : f;
}

function psrKind_(v) {
  if (v === '' || v === null || v === undefined) return 'blank';
  if (v instanceof Date) return 'Date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

function psrLogicalHash_(header, grid, fields) {
  var idx = psrIndex_(header);
  var f = fields.slice().sort();
  var idCol = idx['pricing_id'];
  var lines = [];
  for (var r = 1; r < grid.length; r++) {
    var parts = [];
    for (var i = 0; i < f.length; i++) {
      var c = idx[f[i]];
      parts.push(f[i] + '|~|' + (c === undefined ? '' : psrStr_(grid[r][c])));
    }
    lines.push(psrStr_(idCol === undefined ? '' : grid[r][idCol]) + '|#|' + parts.join('|#|'));
  }
  return psrSha_(lines.join('\n'));
}

function TEMP_PRICING_R2_SURGICAL_REPAIR_DRY_RUN() { return psrRun_(false); }
function TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT() { return psrRun_(true); }

function psrRun_(commit) {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R2 SURGICAL REPAIR — ' + (commit ? 'COMMIT' : 'DRY RUN'));
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

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PSR_PRICE_TAB_);
  if (!sh) { p('BLOCKED — ' + PSR_PRICE_TAB_ + ' is not present.'); return done(); }

  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(PSR_SNAP_PREFIX_) === 0; }).sort();
  if (!snaps.length) {
    p('BLOCKED — no ' + PSR_SNAP_PREFIX_ + '* snapshot. PRE is the only authority for base_msrp and this');
    p('tool will not reconstruct a price from anything else. In particular it will NEVER take base_msrp');
    p('from the effective msrp column: effective MSRP is downstream of FX and of manual ownership, so a');
    p('row where they legitimately differ would be silently rewritten to agree.');
    return done();
  }
  var snapName = snaps[snaps.length - 1];
  var snap = ss.getSheetByName(snapName);
  p('PRE snapshot in use: ' + snapName);

  // ---- READ BOTH, VALUES AND FORMATS ---------------------------------------------------------------------
  function readSheet(sheet) {
    var r = sheet.getLastRow(), c = sheet.getLastColumn();
    var rg = sheet.getRange(1, 1, r, c);
    return { values: rg.getValues(), formats: rg.getNumberFormats(),
      header: sheet.getRange(1, 1, 1, c).getValues()[0].map(psrStr_) };
  }
  var L = readSheet(sh), S = readSheet(snap);
  var lIdx = psrIndex_(L.header), sIdx = psrIndex_(S.header);
  var rowCount = L.values.length - 1;
  var liveHeaderHash = psrSha_(L.header.join('|#|'));

  rule();
  p('LIVE     ' + PSR_PRICE_TAB_ + '   rows ' + rowCount + '   columns ' + L.header.length);
  p('SNAPSHOT ' + snapName + '   rows ' + (S.values.length - 1) + '   columns ' + S.header.length);
  p('LIVE_HEADER_HASH = ' + liveHeaderHash);

  if ((S.values.length - 1) !== rowCount) {
    p('BLOCKED — the snapshot has ' + (S.values.length - 1) + ' rows and the live sheet has ' + rowCount + '.');
    p('A row-for-row repair needs the same rows on both sides.');
    return done();
  }

  // ---- ROW IDENTITY --------------------------------------------------------------------------------------
  var idL = lIdx['pricing_id'], idS = sIdx['pricing_id'];
  if (idL === undefined || idS === undefined) { p('BLOCKED — pricing_id missing on one side.'); return done(); }
  var misaligned = 0, firstMis = -1;
  for (var r = 1; r <= rowCount; r++) {
    if (psrStr_(L.values[r][idL]) !== psrStr_(S.values[r][idS])) {
      misaligned++; if (firstMis === -1) firstMis = r + 1;
    }
  }
  p('ROW_IDENTITY_MATCHES = ' + (misaligned === 0 ? 'YES, row for row' : 'NO — ' + misaligned + ' rows differ, first at row ' + firstMis));
  if (misaligned) {
    p('BLOCKED — the repair is positional between the two grids and means nothing unless row N is the');
    p('same row on both sides.');
    return done();
  }

  // ---- WHICH FIELDS DIFFER -------------------------------------------------------------------------------
  rule();
  p('DRIFT CENSUS — every PRE field, live against the snapshot');
  var differing = [];
  PSR_PRE_FIELDS_.forEach(function (f) {
    if (lIdx[f] === undefined || sIdx[f] === undefined) {
      p('  ' + (f + '                      ').slice(0, 24) + 'ABSENT on one side');
      differing.push(f); return;
    }
    var n = 0;
    for (var i = 1; i <= rowCount; i++) {
      if (psrStr_(L.values[i][lIdx[f]]) !== psrStr_(S.values[i][sIdx[f]])) n++;
    }
    if (n) { differing.push(f); p('  ' + (f + '                      ').slice(0, 24) + n + ' of ' + rowCount + ' rows differ'); }
  });
  if (!differing.length) {
    p('  NO FIELD DIFFERS — there is nothing to repair. Run the schema migration, not this.');
    return done();
  }
  p('DIFFERING_FIELDS = ' + differing.join(', '));
  if (differing.length !== 1 || differing[0] !== PSR_REPAIR_FIELD_) {
    p('BLOCKED — this tool repairs exactly one field, ' + PSR_REPAIR_FIELD_ + ', and only when it is the ONLY');
    p('thing that differs. Anything else is a different incident and needs its own diagnosis before a write.');
    return done();
  }

  // ---- PROVE THE DAMAGE IS THE KNOWN DAMAGE --------------------------------------------------------------
  // The claim is that the quantity survived and only the type changed. If a serial does NOT match the
  // snapshot's number, something else happened and the repair premise is wrong.
  rule();
  p('DAMAGE PROOF — ' + PSR_REPAIR_FIELD_ + ': did the quantity survive?');
  var kinds = { live: {}, snap: {} };
  var serialMatch = 0, serialDiffer = 0, unreadable = 0, examples = [];
  for (var q = 1; q <= rowCount; q++) {
    var lv = L.values[q][lIdx[PSR_REPAIR_FIELD_]], sv = S.values[q][sIdx[PSR_REPAIR_FIELD_]];
    kinds.live[psrKind_(lv)] = (kinds.live[psrKind_(lv)] || 0) + 1;
    kinds.snap[psrKind_(sv)] = (kinds.snap[psrKind_(sv)] || 0) + 1;
    var a = psrSerial_(lv), b = psrSerial_(sv);
    if (a === null || b === null) { unreadable++; }
    else if (Math.abs(a - b) < 1e-9) {
      serialMatch++;
      if (examples.length < 6 && psrKind_(lv) !== psrKind_(sv)) {
        examples.push('  row ' + (q + 1) + '  snapshot ' + psrKind_(sv) + '(' + b + ')  ->  live '
          + psrKind_(lv) + '(' + (lv instanceof Date ? lv.toISOString().slice(0, 10) : String(lv)) + ')');
      }
    } else { serialDiffer++; }
  }
  function kindStr(o) { return Object.keys(o).map(function (k) { return k + '×' + o[k]; }).join(' '); }
  p('  snapshot cell kinds : ' + kindStr(kinds.snap));
  p('  live     cell kinds : ' + kindStr(kinds.live));
  p('  underlying quantity : ' + serialMatch + ' identical, ' + serialDiffer + ' different, '
    + unreadable + ' unreadable');
  examples.forEach(function (e) { p(e); });
  if (serialDiffer > 0) {
    p('BLOCKED — ' + serialDiffer + ' row(s) hold a DIFFERENT quantity, not the same quantity wearing the');
    p('wrong type. That is a different failure and this tool will not paper over it.');
    return done();
  }
  p('  VERDICT = the quantity survived on every row; the TYPE did not. PRE is a faithful source.');

  // ---- TARGET LAYOUT -------------------------------------------------------------------------------------
  var canonSet = {}; CANON.forEach(function (h) { canonSet[h] = 1; });
  var extensions = L.header.filter(function (h) { return h !== '' && !canonSet[h]; });
  var missingNonFlag = CANON.filter(function (h) { return L.header.indexOf(h) === -1 && FLAGS.indexOf(h) === -1; });
  if (missingNonFlag.length) {
    p('BLOCKED — canonical column(s) absent that this tool does not provision: ' + missingNonFlag.join(', '));
    return done();
  }
  var target = CANON.concat(extensions);
  rule();
  p('TARGET header (' + target.length + ') = canonical ' + CANON.length + ' + ' + extensions.length + ' extension(s)');
  p('  ' + target.join(', '));

  // ---- BUILD VALUES AND FORMATS, BY FIELD NAME -----------------------------------------------------------
  // THE WHOLE POINT. Formats are built by NAME from the PRE snapshot and applied BEFORE the values, so a
  // field never inherits the formatting of whatever used to occupy its new physical column. That
  // inheritance is what turned 35 into 1900-02-03.
  var projected = [target.slice()];
  var formats = [target.map(function () { return '@'; })];   // the header row is text
  var DEFAULT_FMT = '0.00';
  for (var rr = 1; rr <= rowCount; rr++) {
    var row = new Array(target.length), fmt = new Array(target.length);
    for (var c = 0; c < target.length; c++) {
      var name = target[c];
      if (name === PSR_REPAIR_FIELD_) {
        row[c] = S.values[rr][sIdx[name]];                    // PRE is the authority for this one field
        fmt[c] = S.formats[rr][sIdx[name]];
      } else if (lIdx[name] !== undefined) {
        row[c] = L.values[rr][lIdx[name]];
        // The PRE snapshot's format for this field is the trustworthy one; the live sheet's may already
        // be the inherited format that caused this.
        fmt[c] = (sIdx[name] !== undefined) ? S.formats[rr][sIdx[name]] : L.formats[rr][lIdx[name]];
      } else {
        // A column being created. Plain text, so a blank stays blank and nothing coerces it.
        row[c] = '';
        fmt[c] = '@';
      }
    }
    projected.push(row); formats.push(fmt);
  }

  // The repaired grid must reproduce the snapshot exactly over every PRE field — that is the proof the
  // repair restores rather than edits.
  var repairHash = psrLogicalHash_(target, projected, PSR_PRE_FIELDS_);
  var snapHash = psrLogicalHash_(S.header, S.values, PSR_PRE_FIELDS_);
  rule();
  p('REPAIRED_LOGICAL_HASH = ' + repairHash);
  p('SNAPSHOT_LOGICAL_HASH = ' + snapHash + (repairHash === snapHash ? '   MATCH' : '   *** MISMATCH ***'));
  if (repairHash !== snapHash) {
    p('BLOCKED — the repaired grid does not reproduce the PRE snapshot over the PRE fields. The repair');
    p('would be an edit, not a restore. Nothing is written.');
    return done();
  }

  p('MANUAL_FLAG_INITIALIZATION = BLANK / UNKNOWN for all ' + rowCount + ' rows, format @ (plain text).');
  p('  Blank is UNKNOWN. Writing FALSE would declare the whole price book system-owned, unasked.');

  if (!commit) {
    rule();
    p('DRY RUN COMPLETE — ZERO WRITES.');
    p('Paste these three, then run TEMP_PRICING_R2_SURGICAL_REPAIR_COMMIT():');
    p('');
    p("  var PSR_EXPECT_LIVE_HEADER_HASH_ = '" + liveHeaderHash + "';");
    p('  var PSR_EXPECT_ROW_COUNT_ = ' + rowCount + ';');
    p("  var PSR_EXPECT_REPAIR_HASH_ = '" + repairHash + "';");
    return done();
  }

  // ---- DRIFT GATE ----------------------------------------------------------------------------------------
  rule();
  if (PSR_EXPECT_LIVE_HEADER_HASH_ !== liveHeaderHash || PSR_EXPECT_ROW_COUNT_ !== rowCount
      || PSR_EXPECT_REPAIR_HASH_ !== repairHash) {
    p('BLOCKED — the sheet is not what the dry run measured.');
    p('  expected header hash ' + PSR_EXPECT_LIVE_HEADER_HASH_ + '   live ' + liveHeaderHash);
    p('  expected row count   ' + PSR_EXPECT_ROW_COUNT_ + '   live ' + rowCount);
    p('  expected repair hash ' + PSR_EXPECT_REPAIR_HASH_ + '   live ' + repairHash);
    return done();
  }
  p('DRIFT GATE PASSED.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(PSR_LOCK_MS_)) {
    p('BLOCKED — could not take the script lock. NOTHING WAS WRITTEN.');
    return done();
  }
  try {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    var mySnapName = PSR_REPAIR_SNAP_PREFIX_ + stamp;
    sh.copyTo(ss).setName(mySnapName);
    p('PRE_REPAIR_SNAPSHOT = ' + mySnapName + '   (the PRE__ snapshot is left untouched)');

    var needCols = target.length - sh.getMaxColumns();
    if (needCols > 0) sh.insertColumnsAfter(sh.getMaxColumns(), needCols);
    var rg = sh.getRange(1, 1, projected.length, target.length);
    // BOTH are applied — that is the fix; a value-only write is what produced the fault. The ORDER is not
    // what makes it correct (the number is stored either way and the format decides what comes back); it is
    // chosen for the crash window. If this dies between the two calls, formats-first leaves correct formats
    // over the old values, and values-first would leave new values wearing whatever format the physical
    // column happened to carry — which is exactly the state being repaired.
    rg.setNumberFormats(formats);
    rg.setValues(projected);
    SpreadsheetApp.flush();
    p('WRITE COMPLETE — formats then values, one bounded range.');

    // ---- POST VALIDATOR ----------------------------------------------------------------------------------
    var post = sh.getDataRange().getValues();
    var postHeader = (post[0] || []).map(psrStr_);
    var checks = [];
    function check(l, c2, d) { checks.push({ label: l, ok: !!c2, detail: d }); }

    check('ROW_COUNT_POST == PRE', (post.length - 1) === rowCount, (post.length - 1) + ' vs ' + rowCount);
    check('canonical prefix EXACT', CANON.every(function (h, i) { return postHeader[i] === h; }));
    check('extensions preserved in order',
      extensions.every(function (h, i) { return postHeader[CANON.length + i] === h; }));
    check('logical hash reproduces the PRE snapshot',
      psrLogicalHash_(postHeader, post, PSR_PRE_FIELDS_) === snapHash);

    // THE REGRESSION THIS TOOL EXISTS FOR: a price must read back as a number, not as a Date.
    var pIdx = psrIndex_(postHeader);
    var NUMERIC_PRICE_FIELDS = ['base_regular_price', 'base_minimum_price', 'base_msrp', 'fx_rate',
      'auto_regular_price', 'auto_minimum_price', 'auto_msrp', 'regular_price', 'minimum_price', 'msrp'];
    NUMERIC_PRICE_FIELDS.forEach(function (f) {
      if (pIdx[f] === undefined) return;
      var dates = 0;
      for (var i = 1; i < post.length; i++) if (post[i][pIdx[f]] instanceof Date) dates++;
      check(f + ' holds NO Date values', dates === 0, dates + ' Date cells');
    });

    FLAGS.forEach(function (f) {
      var c3 = pIdx[f], blank = 0, nonblank = 0;
      for (var i = 1; i < post.length; i++) {
        if (psrStr_(post[i][c3]) === '') blank++; else nonblank++;
      }
      check(f + ' blank on every row', blank === (post.length - 1), blank + ' of ' + (post.length - 1));
      check(f + ' has nothing non-blank', nonblank === 0, String(nonblank));
    });

    function prodCheck(name, expected) {
      if (typeof prodRequireSheet_ !== 'function') return 'UNAVAILABLE';
      try { prodRequireSheet_(ss, name, expected); return 'PASS'; }
      catch (e) { return 'FAIL ' + (e && e.message ? e.message : String(e)); }
    }
    var pp = prodCheck(PSR_PRICE_TAB_, CANON), pl = prodCheck(PSR_LOG_TAB_, LOGCANON);
    check('prodRequireSheet_ pricing_list PASS', pp === 'PASS', pp);
    check('prodRequireSheet_ pricing_change_log PASS', pl === 'PASS', pl);

    rule();
    p('POST VALIDATOR');
    var allOk = true;
    checks.forEach(function (c4) {
      if (!c4.ok) allOk = false;
      p('  ' + (c4.ok ? 'PASS  ' : 'FAIL  ') + c4.label + (c4.detail ? '   [' + c4.detail + ']' : ''));
    });
    p('');
    p('SURGICAL_REPAIR_PASS = ' + (allOk ? 'YES' : 'NO'));
    if (!allOk) {
      p('*** FAILED. Nothing here repairs it automatically. ***');
      p('Restore from ' + mySnapName + ' by hand, or from ' + snapName + ' for the PRE state, and report');
      p('this output. A partial success is not a success.');
    } else {
      p('Now run TEMP_PRICING_R2_POST_VERIFY() — the independent verifier — before calling this sealed.');
    }
    return done();
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}
