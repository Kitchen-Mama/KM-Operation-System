/**
 * TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs — S8-R4D-D1
 * PASTE · RUN · REPORT · REMOVE. Read-only paired benchmark: the R43 reader vs a Sheets API batchGet.
 * ================================================================================================================
 *
 * THIS IS NOT PRODUCT CODE. It registers no action, is not reachable from 01_router.gs, is never called by a
 * handler, and must be DELETED from the Apps Script project once the benchmark has been run — whatever the
 * result. A GO does not authorise adoption; it authorises a separate implementation round.
 *
 * WHAT IT ANSWERS
 * ---------------
 * R4D-C measured that removing 17 of 30 range reads bought 16.3% of server time, i.e. ~200 ms per round trip.
 * B1 would remove 12 more (13 -> 1), so the naive prize is ~2.4 s of a ~17.5 s read. That extrapolation is
 * WEAK: the 17 reads removed were header-only, and the 13 that remain carry the bytes. Only a paired
 * measurement settles it, and only an exact semantic diff makes the measurement worth having.
 *
 * WHAT MAKES IT READ-ONLY (§21)
 * -----------------------------
 *   - There is no write primitive in this file: no setValue(s), appendRow, insertRow(s), deleteRow(s), clear,
 *     clearContent, clearFormat, SpreadsheetApp.flush, PropertiesService, DriveApp, ScriptApp.newTrigger,
 *     MailApp or GmailApp. The zero-write test asserts this against these bytes.
 *   - No Sheet object escapes a read helper, so no caller ever holds something with a write method on it.
 *   - It calls NO product write, starts NO gap job, touches NO movement ledger, writes NO Script Property and
 *     caches nothing persistently.
 *   - It reads ONLY the thirteen approved first-layer tables. There is no fourteenth, and the allowlist is a
 *     literal in this file that a test compares against the page's own IR_FIRST_LAYER_TABLES_.
 *
 * THE DATE PROBLEM, STATED BEFORE THE CODE (§11/§12)
 * -------------------------------------------------
 * SpreadsheetApp.getValues() returns a Date object for a date cell. The live census found 41 such columns, and
 * every one renders as `...T16:00:00.000Z` because the script timezone is Asia/Taipei and a date cell is
 * local midnight. The browser then does `String(s).slice(0, 10)`, so the whole Sales Trend is calibrated on
 * that UTC-shifted date.
 *
 * values.batchGet with dateTimeRenderOption=SERIAL_NUMBER returns a NUMBER. A serial of 46222 and the integer
 * 46222 are the same bytes on the wire: **batchGet cannot tell you which columns are dates.** This benchmark
 * resolves that by taking the date-column map FROM CONTROL, which can tell, because getValues() returns a real
 * Date. That is legitimate for a benchmark — CONTROL is the oracle — and it is a FINDING for any product
 * round: a shipped B1 would need a DECLARED date-column map, or a second API call for number formats.
 * B1_DATE_COLUMN_MAP_SOURCE is reported so this cannot be forgotten.
 *
 * The coercion itself goes through Utilities.parseDate against the SPREADSHEET's timezone rather than a
 * hard-coded +08:00, so it stays correct for a timezone with DST. It is NOT allowed to "fix" anything: if the
 * coerced instant differs from CONTROL by one millisecond, that is a DIFF and the benchmark fails. The
 * existing product date semantics are the specification, including their UTC shift.
 *
 * HOW TO RUN
 * ----------
 *   1. Enable the Sheets advanced service (Apps Script: Services + -> Google Sheets API -> v4, identifier
 *      `Sheets`) and the Google Sheets API in the attached Cloud project. See the runbook in
 *      docs/planning/S8_R4D_D1_B1_BENCHMARK_HARNESS.md.
 *   2. Paste this file into the Production Apps Script project.
 *   3. Run `B1BM_runBenchmark`. It logs a JSON report.
 *   4. Copy the report out, DELETE this file, and — unless separately approved to retain — remove the service.
 */

// ================================================================================================================
// THE APPROVED SET. Thirteen tables, no fourteenth. requiredCols mirrors SIR_WORKSPACE_TABLES_ exactly; a test
// compares both against the shipped 60_ rather than trusting this copy.
// ================================================================================================================
var B1BM_TABLES_ = [
  { name: 'marketplaces', requiredCols: ['marketplace_id'], optional: false },
  { name: 'marketplace_skus', requiredCols: ['sku'], optional: false },
  { name: 'sku_details', requiredCols: ['sku'], optional: false },
  { name: 'warehouses', requiredCols: ['warehouse_id'], optional: false },
  { name: 'amazon_inventory_snapshot', requiredCols: [], optional: true },
  { name: 'amazon_inventory_health_snapshot', requiredCols: [], optional: true },
  { name: 'amazon_daily_sales_snapshot', requiredCols: [], optional: true },
  { name: 'amazon_weekly_sales_snapshot', requiredCols: [], optional: true },
  { name: 'fc_regular_forecast', requiredCols: [], optional: true },
  { name: 'fc_target_rules', requiredCols: [], optional: true },
  { name: 'fc_special_events', requiredCols: [], optional: true },
  { name: 'overseas_inventory_snapshot', requiredCols: [], optional: true },
  { name: 'factory_stock', requiredCols: [], optional: true }
];

var B1BM_PAIRS_ = 5;
// §18 - ALTERNATING, because a fixed order hands the second arm a warmed spreadsheet handle every single pair.
// With production variance running 19.0-40.9 s on one build, a systematic warm-up advantage is easily larger
// than the ~2.4 s being measured.
var B1BM_PAIR_ORDER_ = ['CONTROL_FIRST', 'B1_FIRST', 'CONTROL_FIRST', 'B1_FIRST', 'CONTROL_FIRST'];

// The four states a table read can settle in. They are kept APART: an absent sheet and an empty one are
// different facts and collapsing them is the defect this whole line of work exists to prevent.
var B1BM_STATE_ = { VALID: 'VALID', ABSENT: 'ABSENT', EMPTY: 'EMPTY', FAILED: 'FAILED' };

function b1bmErr_(token, table, detail) {
  var e = new Error('B1BM:' + token + (table ? ' [' + table + ']' : ''));
  e.b1bmToken = token; e.table = table || ''; if (detail) e.detail = detail;
  return e;
}
function b1bmTrim_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

// ================================================================================================================
// SHARED CONVERSION — used by BOTH arms, so a difference can never be an artefact of two different converters.
// This is byte-equivalent to 60_'s sirWsRowsFromValues_ at R43.
// ================================================================================================================
function b1bmHeaderFromValues_(data) {
  if (!data || !data.length || !data[0]) return [];
  return data[0].map(function (h) { return String(h).trim(); });
}
function b1bmRowsFromValues_(data) {
  if (!data || data.length < 2) return [];
  var headers = b1bmHeaderFromValues_(data);
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      o[headers[c]] = data[r][c];
      if (String(data[r][c]).trim() !== '') blank = false;
    }
    if (!blank) out.push(o);
  }
  return out;
}

// §14 - PAD TO HEADER WIDTH. values.batchGet omits TRAILING EMPTY CELLS, so a row comes back shorter than its
// header. Three tables end in an all-blank column today (marketplaces.note, amazon_weekly_sales_snapshot.note,
// overseas_inventory_snapshot.note), and without padding data[r][c] is `undefined`, String(undefined) is
// "undefined", which is not empty - so the all-blank-row DROP silently inverts and every row gains
// note: undefined. Padding is not a tidy-up; it is the fix for a semantic inversion.
function b1bmPadRows_(values, width) {
  var out = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r] ? values[r].slice() : [];
    while (row.length < width) row.push('');
    out.push(row);
  }
  return out;
}

// §12 - SERIAL -> DATE, against the SPREADSHEET's own timezone. Not a hard-coded offset: Utilities.parseDate
// re-interprets a wall-clock string in a named zone, so a zone with DST stays correct. The sheet epoch is
// 1899-12-30. Rounded to the millisecond because a serial is a float and 0.5 of a day must not drift.
function b1bmSerialToDate_(serial, tz) {
  var ms = Math.round(Number(serial) * 86400000);
  var wall = new Date(Date.UTC(1899, 11, 30) + ms);
  var s = Utilities.formatDate(wall, 'UTC', 'yyyy-MM-dd HH:mm:ss');
  return Utilities.parseDate(s, tz, 'yyyy-MM-dd HH:mm:ss');
}

// ================================================================================================================
// CONTROL — the R43 reader. Thirteen SpreadsheetApp range reads, one per table, exactly as 60_ performs them.
// ================================================================================================================
function b1bmControlRead_(ss) {
  var calls = { getValues: 0, getSheetByName: 0, getDataRange: 0 };
  var out = {};
  for (var i = 0; i < B1BM_TABLES_.length; i++) {
    var spec = B1BM_TABLES_[i], name = spec.name;
    calls.getSheetByName++;
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      if (spec.optional) { out[name] = { state: B1BM_STATE_.ABSENT, rows: [], headers: [] }; continue; }
      out[name] = { state: B1BM_STATE_.FAILED, token: 'SCHEMA_NOT_PROVISIONED', rows: [], headers: [] };
      continue;
    }
    if (sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
      out[name] = { state: B1BM_STATE_.FAILED, token: 'HEADER_MISSING', rows: [], headers: [] };
      continue;
    }
    calls.getDataRange++; calls.getValues++;
    var data = sheet.getDataRange().getValues();
    var header = b1bmHeaderFromValues_(data);
    var bad = b1bmValidateHeader_(header, spec.requiredCols);
    if (bad) { out[name] = { state: B1BM_STATE_.FAILED, token: bad, rows: [], headers: header }; continue; }
    var rows = b1bmRowsFromValues_(data);
    out[name] = { state: rows.length ? B1BM_STATE_.VALID : B1BM_STATE_.EMPTY, rows: rows, headers: header };
  }
  return { tables: out, calls: calls };
}

// The same checks 60_ runs, expressed over the header ARRAY - which is how classifySchemaMismatch has always
// worked. Kept local so the benchmark does not depend on the product safety bundle being loaded.
function b1bmValidateHeader_(header, requiredCols) {
  if (!header.length) return 'HEADER_MISSING';
  var seen = {};
  for (var i = 0; i < header.length; i++) {
    if (header[i] === '') return 'HEADER_BLANK';
    if (seen[header[i]]) return 'HEADER_DUPLICATE';
    seen[header[i]] = 1;
  }
  for (var q = 0; q < (requiredCols || []).length; q++) {
    if (!seen[requiredCols[q]]) return 'MISSING_REQUIRED_HEADER';
  }
  return null;
}

// ================================================================================================================
// CANDIDATE — two remote calls. One metadata read for EXISTENCE and WIDTH, one batchGet for the values.
//
// §9 - the widths come from metadata, never from a literal. The schema contract runs with
// extraColumnsPolicy ALLOW, so columns may be added; a hard-coded A:AP would silently truncate column 43 and
// that is the exact silent-undercount class three rounds have been spent removing.
// ================================================================================================================
function b1bmColumnLetter_(n) {
  var s = '';
  while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function b1bmCandidateRead_(spreadsheetId, tz) {
  if (typeof Sheets === 'undefined' || !Sheets || !Sheets.Spreadsheets) {
    throw b1bmErr_('SHEETS_ADVANCED_SERVICE_UNAVAILABLE', '',
      'Enable the Sheets advanced service (v4) and the Google Sheets API in the attached Cloud project.');
  }
  var remoteCalls = 0;
  // CALL 1 - existence and width together. fields= keeps the response to properties, not grid data.
  remoteCalls++;
  var meta = Sheets.Spreadsheets.get(spreadsheetId, { fields: 'sheets.properties(title,gridProperties)' });
  var width = {}, present = {};
  ((meta && meta.sheets) || []).forEach(function (s) {
    var p = (s && s.properties) || {};
    if (!p.title) return;
    present[p.title] = true;
    width[p.title] = (p.gridProperties && p.gridProperties.columnCount) || 0;
  });

  // §10 - only EXISTING sheets become ranges. An absent optional sheet is recorded as ABSENT and simply is not
  // asked for; it must not take the other twelve down, which is what a batchGet naming it would do.
  var ranges = [], order = [], out = {};
  for (var i = 0; i < B1BM_TABLES_.length; i++) {
    var spec = B1BM_TABLES_[i], name = spec.name;
    if (!present[name]) {
      out[name] = spec.optional
        ? { state: B1BM_STATE_.ABSENT, rows: [], headers: [] }
        : { state: B1BM_STATE_.FAILED, token: 'SCHEMA_NOT_PROVISIONED', rows: [], headers: [] };
      continue;
    }
    var cols = width[name] > 0 ? width[name] : 1;
    ranges.push("'" + name.replace(/'/g, "''") + "'!A:" + b1bmColumnLetter_(cols));
    order.push(spec);
  }

  // CALL 2 - the values. UNFORMATTED_VALUE keeps numbers numeric and booleans boolean, which is required for
  // IDENTITY as much as for arithmetic: sku_details.sku and overseas_inventory_snapshot.sku are mixed
  // number/string columns today, and FORMATTED_VALUE would stringify them and change row identity.
  var resp = { valueRanges: [] };
  if (ranges.length) {
    remoteCalls++;
    resp = Sheets.Spreadsheets.Values.batchGet(spreadsheetId, {
      ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER'
    });
  }
  var vrs = (resp && resp.valueRanges) || [];
  for (var k = 0; k < order.length; k++) {
    var sp = order[k], nm = sp.name;
    var values = (vrs[k] && vrs[k].values) || null;
    if (!values || !values.length) { out[nm] = { state: B1BM_STATE_.FAILED, token: 'HEADER_MISSING', rows: [], headers: [] }; continue; }
    var hdr = b1bmHeaderFromValues_(values);
    var bad = b1bmValidateHeader_(hdr, sp.requiredCols);
    if (bad) { out[nm] = { state: B1BM_STATE_.FAILED, token: bad, rows: [], headers: hdr }; continue; }
    var padded = b1bmPadRows_(values, hdr.length);
    var rows = b1bmRowsFromValues_(padded);
    out[nm] = { state: rows.length ? B1BM_STATE_.VALID : B1BM_STATE_.EMPTY, rows: rows, headers: hdr, tz: tz };
  }
  return { tables: out, remoteCalls: remoteCalls, rangeCount: ranges.length };
}

// ================================================================================================================
// THE DIFF. §16 - one diff is enough to reject B1, and there is no exception list.
//
// The date-column map comes from CONTROL because CONTROL is the only arm that CAN know (see the header note).
// Coercion is applied ONLY to columns CONTROL proves are Dates; a serial left in any other column is a DIFF,
// not something to coerce away.
// ================================================================================================================
function b1bmDateColumns_(controlTable) {
  var map = {};
  var rows = controlTable.rows || [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    for (var h in row) {
      if (!Object.prototype.hasOwnProperty.call(row, h)) continue;
      if (row[h] instanceof Date) map[h] = true;
    }
  }
  return map;
}

function b1bmValueDiff_(a, b, isDateCol, tz) {
  // a = CONTROL value, b = CANDIDATE value
  if (a instanceof Date) {
    if (!isDateCol) return 'CONTROL_DATE_IN_NON_DATE_COLUMN';
    if (typeof b !== 'number') return 'CANDIDATE_NOT_A_SERIAL(' + (typeof b) + ')';
    var d = b1bmSerialToDate_(b, tz);
    if (!(d instanceof Date) || isNaN(d.getTime())) return 'SERIAL_COERCION_FAILED';
    return d.getTime() === a.getTime() ? null
      : 'DATE_MS_DIFF(' + (d.getTime() - a.getTime()) + ')';
  }
  if (typeof a !== typeof b) return 'TYPE(' + (typeof a) + ' vs ' + (typeof b) + ')';
  if (typeof a === 'number') return a === b ? null : 'NUMBER(' + a + ' vs ' + b + ')';
  if (typeof a === 'boolean') return a === b ? null : 'BOOLEAN(' + a + ' vs ' + b + ')';
  return String(a) === String(b) ? null : 'STRING';
}

function b1bmDiff_(control, candidate, tz) {
  var diffs = [], counts = { date: 0, identity: 0, trailingBlank: 0, type: 0, other: 0 };
  for (var i = 0; i < B1BM_TABLES_.length; i++) {
    var name = B1BM_TABLES_[i].name;
    var c = control.tables[name], b = candidate.tables[name];
    if (!c || !b) { diffs.push({ table: name, kind: 'MISSING_ARM' }); counts.other++; continue; }
    if (c.state !== b.state) { diffs.push({ table: name, kind: 'STATE', control: c.state, candidate: b.state }); counts.other++; continue; }
    if ((c.token || null) !== (b.token || null)) { diffs.push({ table: name, kind: 'TOKEN', control: c.token, candidate: b.token }); counts.other++; continue; }
    if (c.headers.join('\u0001') !== b.headers.join('\u0001')) { diffs.push({ table: name, kind: 'HEADERS' }); counts.other++; continue; }
    if (c.rows.length !== b.rows.length) {
      diffs.push({ table: name, kind: 'ROW_COUNT', control: c.rows.length, candidate: b.rows.length });
      counts.trailingBlank++; continue;
    }
    var dateCols = b1bmDateColumns_(c);
    for (var r = 0; r < c.rows.length; r++) {
      for (var h = 0; h < c.headers.length; h++) {
        var col = c.headers[h];
        var d = b1bmValueDiff_(c.rows[r][col], b.rows[r][col], !!dateCols[col], tz);
        if (!d) continue;
        if (d.indexOf('DATE') === 0 || d.indexOf('SERIAL') === 0 || d.indexOf('CANDIDATE_NOT_A_SERIAL') === 0) counts.date++;
        else if (col === 'sku' || col.slice(-3) === '_id') counts.identity++;
        else if (d.indexOf('TYPE(') === 0) counts.type++;
        else counts.other++;
        if (diffs.length < 50) diffs.push({ table: name, row: r, column: col, kind: d });
      }
    }
  }
  var total = counts.date + counts.identity + counts.trailingBlank + counts.type + counts.other;
  return { total: total, counts: counts, sample: diffs };
}

// ================================================================================================================
// THE RUN. §18 - paired, alternating, every pair recorded, nothing discarded for being slow.
// §20 - a failure is EXPOSED as a typed benchmark failure. It is never turned into [] or an empty table, and
// there is NO fallback inside a measured arm: falling back would silently time the wrong implementation.
// ================================================================================================================
function B1BM_runBenchmark() {
  var started = new Date();
  var id = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? PRODUCTION_DB_SPREADSHEET_ID_ : '';
  if (!id) throw b1bmErr_('NO_CONFIGURED_SPREADSHEET_ID', '', 'PRODUCTION_DB_SPREADSHEET_ID_ is not defined.');
  var ss = SpreadsheetApp.openById(id);
  if (String(ss.getId()) !== String(id)) throw b1bmErr_('WRONG_SPREADSHEET_TARGET', '', null);
  var tz = ss.getSpreadsheetTimeZone();

  var pairs = [], failures = [];
  for (var p = 0; p < B1BM_PAIRS_; p++) {
    var order = B1BM_PAIR_ORDER_[p % B1BM_PAIR_ORDER_.length];
    var controlMs = null, b1Ms = null, diff = null, err = null, cal = null, cand = null;
    try {
      if (order === 'CONTROL_FIRST') {
        var t0 = Date.now(); cal = b1bmControlRead_(ss); controlMs = Date.now() - t0;
        var t1 = Date.now(); cand = b1bmCandidateRead_(id, tz); b1Ms = Date.now() - t1;
      } else {
        var t2 = Date.now(); cand = b1bmCandidateRead_(id, tz); b1Ms = Date.now() - t2;
        var t3 = Date.now(); cal = b1bmControlRead_(ss); controlMs = Date.now() - t3;
      }
      diff = b1bmDiff_(cal, cand, tz);
    } catch (e) {
      err = { token: (e && e.b1bmToken) || 'BENCHMARK_FAILED', message: String(e && e.message || e),
        detail: (e && e.detail) || null };
      failures.push(err);
    }
    pairs.push({
      pair: p + 1, order: order, controlMs: controlMs, b1Ms: b1Ms,
      semanticDiffCount: diff ? diff.total : null,
      diffCounts: diff ? diff.counts : null,
      controlCalls: cal ? cal.calls : null,
      b1RemoteCalls: cand ? cand.remoteCalls : null,
      b1RangeCount: cand ? cand.rangeCount : null,
      rowCounts: cal ? b1bmRowCounts_(cal) : null,
      error: err
    });
  }

  var clean = pairs.filter(function (x) { return !x.error && x.controlMs !== null && x.b1Ms !== null; });
  var cMs = clean.map(function (x) { return x.controlMs; });
  var bMs = clean.map(function (x) { return x.b1Ms; });
  var savings = clean.map(function (x) { return x.controlMs - x.b1Ms; });
  var worstDiff = pairs.reduce(function (a, x) {
    return (x.semanticDiffCount !== null && x.semanticDiffCount > a) ? x.semanticDiffCount : a; }, 0);
  var firstDiffSample = null;
  for (var q = 0; q < pairs.length; q++) { if (pairs[q].semanticDiffCount) { firstDiffSample = pairs[q]; break; } }

  var report = {
    tool: 'TEMP_S8_R4D_B1_ADVANCED_SHEETS_BENCHMARK.gs',
    startedAt: started.toISOString(), spreadsheetTimeZone: tz,
    B1_DATE_COLUMN_MAP_SOURCE: 'CONTROL_ORACLE — batchGet+SERIAL_NUMBER cannot self-identify a date column; '
      + 'a PRODUCT B1 would need a DECLARED date-column map or a second call for number formats',
    valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER',
    READ_TABLE_COUNT: B1BM_TABLES_.length, WRITE_TABLE_COUNT: 0, DELETE_TABLE_COUNT: 0,
    CONTROL_SERVICE_CALL_COUNT: clean.length ? clean[0].controlCalls.getValues : null,
    B1_REMOTE_CALL_COUNT: clean.length ? clean[0].b1RemoteCalls : null,
    BENCHMARK_PAIR_COUNT: B1BM_PAIRS_, PAIR_ORDER: B1BM_PAIR_ORDER_.slice(),
    pairs: pairs,
    CONTROL_MEDIAN_MS: b1bmMedian_(cMs), B1_MEDIAN_MS: b1bmMedian_(bMs),
    PAIRED_MEDIAN_SAVING_MS: b1bmMedian_(savings),
    PAIRED_MEDIAN_SAVING_PERCENT: (b1bmMedian_(cMs) ? Math.round(1000 * b1bmMedian_(savings) / b1bmMedian_(cMs)) / 10 : null),
    PAIR_WIN_COUNT_B1: savings.filter(function (v) { return v > 0; }).length,
    PAIR_WIN_COUNT_CONTROL: savings.filter(function (v) { return v < 0; }).length,
    SEMANTIC_RESULT_DIFF_COUNT: worstDiff,
    DATE_SEMANTIC_DIFF_COUNT: b1bmSumCount_(pairs, 'date'),
    IDENTITY_TYPE_DIFF_COUNT: b1bmSumCount_(pairs, 'identity'),
    TRAILING_BLANK_SEMANTIC_DIFF_COUNT: b1bmSumCount_(pairs, 'trailingBlank'),
    TYPE_DIFF_COUNT: b1bmSumCount_(pairs, 'type'),
    diffSample: firstDiffSample ? firstDiffSample : null,
    failures: failures,
    // §16 - ONE diff rejects it. The verdict is computed here rather than left to the reader.
    B1_BENCHMARK_SEMANTIC_PASS: (worstDiff === 0 && failures.length === 0) ? 'YES' : 'NO',
    NOTE: 'PASTE / RUN / REPORT / REMOVE. A GO here does NOT authorise product adoption; that is a separate round.'
  };
  Logger.log(JSON.stringify(report, null, 1));
  return report;
}

function b1bmRowCounts_(arm) {
  var o = {};
  for (var i = 0; i < B1BM_TABLES_.length; i++) {
    var n = B1BM_TABLES_[i].name;
    o[n] = (arm.tables[n] && arm.tables[n].rows) ? arm.tables[n].rows.length : 0;
  }
  return o;
}
function b1bmSumCount_(pairs, key) {
  var t = 0;
  for (var i = 0; i < pairs.length; i++) { if (pairs[i].diffCounts) t += (pairs[i].diffCounts[key] || 0); }
  return t;
}
function b1bmMedian_(a) {
  if (!a || !a.length) return null;
  var s = a.slice().sort(function (x, y) { return x - y; });
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
}
