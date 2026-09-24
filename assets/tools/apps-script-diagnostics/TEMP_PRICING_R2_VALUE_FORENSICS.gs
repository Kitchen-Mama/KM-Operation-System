/**
 * TEMP — PRICING-R2 VALUE FORENSICS — READ ONLY. NO LOCK. NO WRITE. NO REPAIR.
 *
 *     TEMP_PRICING_R2_VALUE_FORENSICS()
 *
 * Repository-only operator tool. NOT a release file, no manifest row, no stamp, no deployment.
 *
 * WHY. The post-verifier says base_msrp no longer matches the PRE snapshot, and the operator has seen dates
 * around 1900 where prices should be. Those two facts are consistent with FOUR different events, which need
 * four different responses, and telling them apart by looking at the sheet is exactly what does not work —
 * a number formatted as a date and a date stored as a value look identical on screen.
 *
 *     CELL_VALUE_CHANGED     the stored number is different. Data is gone. Restore.
 *     DISPLAY_FORMAT_CHANGED the number is intact; only its number format moved. Nothing is lost; repaint.
 *     DATE_SERIAL_COERCION   the cell's TYPE became date, so getValues() now hands every reader a Date
 *                            object instead of 39.99. The stored serial may still be the original number,
 *                            but every consumer is now reading a date. This is the dangerous middle case:
 *                            it survives a value-only restore, because setValues writes values, not types.
 *     TOOL_SERIALIZATION     the migration wrote something different from what it read.
 *
 * So this reads the same cells four ways — getValues (type and constructor), getDisplayValues (what a person
 * sees), getNumberFormats (what the cell is told to be), and the PRE snapshot's own three — and prints them
 * side by side for the rows that actually differ. A classification follows from the combination, not from
 * one reading.
 *
 * IT CHANGES NOTHING. It does not repair a format, does not restore a value, and does not take a lock.
 */

var PVF_PRICE_TAB_ = 'pricing_list';
var PVF_SNAP_PREFIX_ = 'PRE__pricing_list__';
var PVF_MAX_ROWS_SHOWN_ = 12;

// Every field the PRE sheet had. The drift is reported for all of them, because "base_msrp changed" is a
// finding about the field that was noticed, not a finding that the others are safe.
var PVF_PRE_FIELDS_ = [
  'pricing_id', 'marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price',
  'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price',
  'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by',
  'created_at', 'updated_by', 'updated_at', 'note'
];

function pvfStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

/** What a cell actually IS, not what it looks like. */
function pvfKind_(v) {
  if (v === '' || v === null || v === undefined) return 'blank';
  if (v instanceof Date) return 'Date';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

function pvfDescribe_(v) {
  var k = pvfKind_(v);
  if (k === 'Date') {
    // The serial is what a number silently became. Sheets' epoch is 1899-12-30, so 39.99 reads as early 1900
    // — which is the tell the operator saw.
    var serial = (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
    return 'Date(' + v.toISOString().slice(0, 19) + ')  serial≈' + (Math.round(serial * 10000) / 10000);
  }
  return k + '(' + JSON.stringify(k === 'string' ? String(v) : v) + ')';
}

function TEMP_PRICING_R2_VALUE_FORENSICS() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R2 VALUE FORENSICS — READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PVF_PRICE_TAB_);
  if (!sh) { p('BLOCKED — ' + PVF_PRICE_TAB_ + ' is not present.'); return done(); }

  var names = ss.getSheets().map(function (s) { return s.getName(); });
  var snaps = names.filter(function (n) { return n.indexOf(PVF_SNAP_PREFIX_) === 0; }).sort();
  if (!snaps.length) {
    p('BLOCKED — no ' + PVF_SNAP_PREFIX_ + '* snapshot. There is nothing to compare against, and this tool');
    p('will not guess what the values used to be.');
    return done();
  }
  var snapName = snaps[snaps.length - 1];
  var snap = ss.getSheetByName(snapName);
  p('LIVE     ' + PVF_PRICE_TAB_ + '   rows ' + (sh.getLastRow() - 1) + '   columns ' + sh.getLastColumn());
  p('SNAPSHOT ' + snapName + '   rows ' + (snap.getLastRow() - 1) + '   columns ' + snap.getLastColumn());

  function readAll(sheet) {
    var r = sheet.getLastRow(), c = sheet.getLastColumn();
    var rg = sheet.getRange(1, 1, r, c);
    return {
      values: rg.getValues(),
      display: rg.getDisplayValues(),
      formats: rg.getNumberFormats(),
      header: sheet.getRange(1, 1, 1, c).getValues()[0].map(pvfStr_)
    };
  }
  var L = readAll(sh), S = readAll(snap);
  var lIdx = {}; L.header.forEach(function (h, i) { lIdx[h] = i; });
  var sIdx = {}; S.header.forEach(function (h, i) { sIdx[h] = i; });

  // ---- 1. WHICH FIELDS DIFFER, BY NAME ------------------------------------------------------------------------
  rule();
  p('1 · DRIFT BY FIELD NAME — live against the PRE snapshot, row for row');
  var idL = lIdx['pricing_id'], idS = sIdx['pricing_id'];
  var rowsN = Math.min(L.values.length, S.values.length);
  var sameOrder = true;
  for (var q = 1; q < rowsN; q++) {
    if (pvfStr_(L.values[q][idL]) !== pvfStr_(S.values[q][idS])) { sameOrder = false; break; }
  }
  p('  ROW_ORDER_MATCHES = ' + (sameOrder ? 'YES' : 'NO — the row-for-row comparison below is not meaningful'));

  var drift = [];
  PVF_PRE_FIELDS_.forEach(function (f) {
    if (lIdx[f] === undefined) { drift.push({ field: f, n: -1, note: 'ABSENT FROM LIVE' }); return; }
    if (sIdx[f] === undefined) { drift.push({ field: f, n: -1, note: 'ABSENT FROM SNAPSHOT' }); return; }
    var n = 0, firstRows = [];
    for (var r = 1; r < rowsN; r++) {
      if (pvfStr_(L.values[r][lIdx[f]]) !== pvfStr_(S.values[r][sIdx[f]])) {
        n++; if (firstRows.length < PVF_MAX_ROWS_SHOWN_) firstRows.push(r);
      }
    }
    if (n) drift.push({ field: f, n: n, rows: firstRows });
  });
  if (!drift.length) p('  NO FIELD DIFFERS. Every PRE field matches the snapshot row for row.');
  drift.forEach(function (d) {
    p('  ' + (d.field + '                        ').slice(0, 24)
      + (d.note ? d.note : d.n + ' of ' + (rowsN - 1) + ' rows differ'));
  });

  // ---- 2. THE FOUR READINGS, FOR THE ROWS THAT DIFFER --------------------------------------------------------
  drift.forEach(function (d) {
    if (d.note || !d.rows || !d.rows.length) return;
    rule();
    p('2 · ' + d.field + ' — the same cells read four ways');
    p('     row | SNAPSHOT value            | LIVE value                | snap format | live format');
    d.rows.forEach(function (r) {
      var sv = S.values[r][sIdx[d.field]], lv = L.values[r][lIdx[d.field]];
      p('  ' + String(r + 1).padStart(6) + ' | ' + (pvfDescribe_(sv) + '                          ').slice(0, 25)
        + ' | ' + (pvfDescribe_(lv) + '                          ').slice(0, 25)
        + ' | ' + (S.formats[r][sIdx[d.field]] + '            ').slice(0, 11)
        + ' | ' + L.formats[r][lIdx[d.field]]);
      p('         displayed: snapshot ' + JSON.stringify(S.display[r][sIdx[d.field]])
        + '   live ' + JSON.stringify(L.display[r][lIdx[d.field]]));
    });

    // ---- CLASSIFY ------------------------------------------------------------------------------------------
    var kinds = { snap: {}, live: {} };
    var sameNumber = 0, bothNumeric = 0, differentNumber = 0;
    for (var r2 = 1; r2 < rowsN; r2++) {
      var a = S.values[r2][sIdx[d.field]], b = L.values[r2][lIdx[d.field]];
      kinds.snap[pvfKind_(a)] = (kinds.snap[pvfKind_(a)] || 0) + 1;
      kinds.live[pvfKind_(b)] = (kinds.live[pvfKind_(b)] || 0) + 1;
      // A Date is compared by the serial it would have been, so a number that BECAME a date is recognised
      // as the same underlying quantity rather than as a different one.
      function num(v) {
        if (typeof v === 'number') return v;
        if (v instanceof Date) return (v.getTime() - Date.UTC(1899, 11, 30)) / 86400000;
        var f = parseFloat(v); return isNaN(f) ? null : f;
      }
      var na = num(a), nb = num(b);
      if (na !== null && nb !== null) {
        bothNumeric++;
        if (Math.abs(na - nb) < 1e-9) sameNumber++; else differentNumber++;
      }
    }
    function kindStr(o) { return Object.keys(o).map(function (k) { return k + '×' + o[k]; }).join(' '); }
    p('  snapshot cell kinds : ' + kindStr(kinds.snap));
    p('  live     cell kinds : ' + kindStr(kinds.live));
    p('  underlying quantity : ' + sameNumber + ' identical, ' + differentNumber + ' different, of '
      + bothNumeric + ' comparable');

    var snapHasDate = !!kinds.snap['Date'], liveHasDate = !!kinds.live['Date'];
    var verdict;
    if (differentNumber > 0 && sameNumber === 0) {
      verdict = 'CELL_VALUE_CHANGED — the underlying quantity is different. Data is gone.';
    } else if (!snapHasDate && liveHasDate && differentNumber === 0) {
      verdict = 'DATE_SERIAL_COERCION — the quantity survived, the TYPE did not. getValues() now hands every '
        + 'reader a Date where a number belongs. A value-only restore will NOT fix this: setValues writes '
        + 'values, not types, so the cell has to be reformatted as well.';
    } else if (differentNumber === 0 && sameNumber > 0) {
      verdict = 'DISPLAY_FORMAT_CHANGED — the stored quantity is identical on every row; only the format '
        + 'differs. Nothing is lost.';
    } else if (differentNumber > 0 && sameNumber > 0) {
      verdict = 'MIXED — some rows kept their quantity and some did not. Treat as CELL_VALUE_CHANGED until '
        + 'the differing rows are explained individually.';
    } else {
      verdict = 'UNCLASSIFIED — the readings do not fit a single mechanism. Report this output rather than '
        + 'acting on a guess.';
    }
    p('  VERDICT_' + d.field + ' = ' + verdict);
  });

  // ---- 3. COLUMN FORMATS, BOTH SHEETS -------------------------------------------------------------------------
  // A date format sitting on a numeric column is the mechanism behind the dangerous middle case, so it is
  // printed whether or not that column currently differs.
  rule();
  p('3 · NUMBER FORMAT OF ROW 2, BY COLUMN — a date format on a price column is the thing to look for');
  p('     column                    | snapshot format | live format');
  PVF_PRE_FIELDS_.forEach(function (f) {
    var sf = sIdx[f] === undefined ? '(absent)' : S.formats[1][sIdx[f]];
    var lf = lIdx[f] === undefined ? '(absent)' : L.formats[1][lIdx[f]];
    var flag = (String(lf).indexOf('y') !== -1 || String(lf).indexOf('d') !== -1) && String(sf) !== String(lf)
      ? '   <== date-shaped format, and it changed' : '';
    p('  ' + (f + '                          ').slice(0, 26) + '| ' + (sf + '                ').slice(0, 16)
      + '| ' + lf + flag);
  });

  rule();
  p('READ ONLY — nothing was written, no format was repaired, no lock was taken.');
  p('Take this output back to the round that decides what to restore.');
  return done();
}
