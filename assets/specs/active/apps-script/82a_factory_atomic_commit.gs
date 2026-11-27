// Factory imports stage their existing domain writers in memory, then commit all business books in one Sheets API request.
var PFA_BUILD_VERSION_ = 'FACTORY-ATOMIC-2-20261127-PO200';
// The size of the ONE atomic request, counted before anything is written; a larger file is refused with no write.
// PO200 (2026-11-27): 1,800,000 -> 8,000,000. Measured on synthetic 200-row files AFTER the request was compacted
// (pfaRequests_): one PO with 200 new lines = 3.8 MB; 200 new POs of one line = 6.5 MB; 200 existing lines = 1.0 MB.
// Most of it is the audit tab (one row per field of every created row), which is kept in full. 8 MB is the measured
// worst ordinary shape plus about 20 percent. It is NOT a proven Google limit: that this size is accepted, and how
// long it takes, has only been measured in a mock. NOT_RUN on real Sheets until the isolated Sandbox run.
var PFA_MAX_BYTES_ = 8000000;

function pfaError_(code, message) { var e = new Error(message || code); e.importCode = code; throw e; }
function pfaCopy_(v) {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(pfaCopy_);
  return v;
}
function pfaSame_(a, b) {
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  return (a === undefined || a === null ? '' : a) === (b === undefined || b === null ? '' : b);
}
function pfaGridSame_(a, b) {
  if (a.length !== b.length) return false;
  for (var r = 0; r < a.length; r++) {
    var width = Math.max(a[r].length, b[r].length);
    for (var c = 0; c < width; c++) if (!pfaSame_(a[r][c], b[r][c])) return false;
  }
  return true;
}
function pfaStage_(ss, domain) {
  var cache = {}, writable = ['factory_stock', 'factory_stock_movements', IMB_RECEIPTS_, IMB_CHANGES_];
  if (domain === 'po_factory_stock') writable = writable.concat(['purchase_orders', 'purchase_order_lines']);
  var stage = {
    getId: function () { return ss.getId(); },
    getSpreadsheetTimeZone: function () { return ss.getSpreadsheetTimeZone(); },
    getSheetByName: function (name) {
      if (Object.prototype.hasOwnProperty.call(cache, name)) return cache[name] && cache[name].proxy;
      var live = ss.getSheetByName(name); if (!live) { cache[name] = null; return null; }
      var before = live.getDataRange().getValues(), grid = pfaCopy_(before), dirty = false;
      function write() { if (writable.indexOf(name) < 0) pfaError_('IMPORT_STAGE_WRITE_FORBIDDEN', name); dirty = true; }
      function range(row, col, height, width) {
        height = height || 1; width = width || 1;
        if (row < 1 || col < 1 || height < 1 || width < 1) pfaError_('IMPORT_STAGE_RANGE_INVALID');
        return {
          getValue: function () { var v = (grid[row - 1] || [])[col - 1]; return v === undefined ? '' : pfaCopy_(v); },
          getValues: function () {
            var out = []; for (var r = 0; r < height; r++) { var line = []; for (var c = 0; c < width; c++) {
              var v = (grid[row - 1 + r] || [])[col - 1 + c]; line.push(v === undefined ? '' : pfaCopy_(v));
            } out.push(line); } return out;
          },
          setValue: function (value) { return this.setValues([[value]]); },
          setValues: function (values) {
            if (values.length !== height || values.some(function (r) { return r.length !== width; })) pfaError_('IMPORT_STAGE_SIZE_INVALID');
            write(); values.forEach(function (line, r) {
              while (grid.length < row + r) grid.push([]);
              line.forEach(function (value, c) { grid[row - 1 + r][col - 1 + c] = pfaCopy_(value); });
            }); return this;
          }
        };
      }
      var proxy = {
        getName: function () { return name; }, getSheetId: function () { return live.getSheetId(); },
        getLastRow: function () { return grid.length; },
        getLastColumn: function () { return grid.reduce(function (n, r) { return Math.max(n, r.length); }, 0); },
        getDataRange: function () { return range(1, 1, grid.length, proxy.getLastColumn()); },
        getRange: range,
        appendRow: function (values) { write(); grid.push(pfaCopy_(values)); return proxy; }
      };
      cache[name] = { live: live, proxy: proxy, before: before, grid: grid, isDirty: function () { return dirty; } };
      return proxy;
    }
  };
  return { ss: stage, cache: cache };
}
function pfaCell_(value, timezone) {
  if (value instanceof Date) {
    if (!isFinite(value.getTime())) pfaError_('IMPORT_STAGE_DATE_INVALID');
    var s = Utilities.formatDate(value, timezone, 'yyyy-MM-dd HH:mm:ss'), m = /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)$/.exec(s);
    if (!m) pfaError_('IMPORT_STAGE_DATE_INVALID');
    return { userEnteredValue: { numberValue: Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 86400000 + 25569 },
      userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm:ss' } } };
  }
  if (typeof value === 'number') { if (!isFinite(value)) pfaError_('IMPORT_STAGE_NUMBER_INVALID'); return { userEnteredValue: { numberValue: value } }; }
  if (typeof value === 'boolean') return { userEnteredValue: { boolValue: value } };
  return { userEnteredValue: { stringValue: value === undefined || value === null ? '' : String(value) } };
}
function pfaRequests_(stage, timezone) {
  var requests = [], checks = [];
  Object.keys(stage.cache).forEach(function (name) {
    var t = stage.cache[name]; if (!t || !t.isDirty()) return;
    var id = t.live.getSheetId(), width = t.proxy.getLastColumn();
    if (width > t.live.getMaxColumns()) pfaError_('IMPORT_STAGE_COLUMN_GROWTH', name);
    if (t.grid.length > t.live.getMaxRows()) requests.push({ appendDimension: { sheetId: id, dimension: 'ROWS', length: t.grid.length - t.live.getMaxRows() } });
    // PO200: a row past the end of the tab as it was read is a NEW row - every cell of it belongs to this batch.
    // Runs of such rows go out as ONE updateCells block (a blank cell is an empty CellData, which leaves an empty
    // cell empty) instead of one request per run of non-blank cells. Same cells, same values, same readback checks;
    // 200 new lines were ~15,900 requests and are ~10. A new row holding a Date keeps the per-run path below, so the
    // number-format mask never touches a cell that is not a date. Rows that already existed are untouched by this:
    // only their changed cells are written, exactly as before.
    var block = null;
    function flushBlock() { if (block) { requests.push({ updateCells: { start: { sheetId: id, rowIndex: block.row, columnIndex: 0 }, rows: block.rows, fields: 'userEnteredValue' } }); block = null; } }
    t.grid.forEach(function (line, r) {
      if (r >= t.before.length && !line.some(function (v) { return v instanceof Date; })) {
        var last = -1, cells = [];
        for (var k = 0; k < line.length; k++) if (!pfaSame_(line[k], undefined)) last = k;
        for (var j = 0; j <= last; j++) {
          if (pfaSame_(line[j], undefined)) { cells.push({}); continue; }
          cells.push(pfaCell_(line[j], timezone)); checks.push({ table: name, row: r + 1, col: j + 1, value: line[j] });
        }
        if (last < 0) { flushBlock(); return; }
        if (!block || block.row + block.rows.length !== r) { flushBlock(); block = { row: r, rows: [] }; }
        block.rows.push({ values: cells });
        return;
      }
      flushBlock();
      var c = 0;
      while (c < line.length) {
        if (pfaSame_(line[c], (t.before[r] || [])[c])) { c++; continue; }
        var start = c, values = [], date = line[c] instanceof Date;
        while (c < line.length && !pfaSame_(line[c], (t.before[r] || [])[c]) && (line[c] instanceof Date) === date) {
          values.push(pfaCell_(line[c], timezone)); checks.push({ table: name, row: r + 1, col: c + 1, value: line[c] }); c++;
        }
        requests.push({ updateCells: { start: { sheetId: id, rowIndex: r, columnIndex: start }, rows: [{ values: values }],
          fields: date ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue' } });
      }
    });
    flushBlock();
  });
  // Count UTF-8 bytes conservatively without requiring a separate API or authorization scope.
  var bytes = unescape(encodeURIComponent(JSON.stringify(requests))).length;
  if (bytes > PFA_MAX_BYTES_) pfaError_('IMPORT_ATOMIC_PAYLOAD_TOO_LARGE', 'Split this file into smaller batches. Nothing was written.');
  return { requests: requests, checks: checks, bytes: bytes };
}
function pfaCheckBaseline_(stage, receiptOnly) {
  Object.keys(stage.cache).forEach(function (name) {
    var t = stage.cache[name]; if (!t || (receiptOnly && name === IMB_RECEIPTS_)) return;
    if (!pfaGridSame_(t.before, t.live.getDataRange().getValues())) pfaError_('IMPORT_PREVIEW_STALE', name + ' changed during staging. No business rows were written.');
  });
}
function pfaVerify_(ss, batch) {
  var bounds = {}, names = [], grids = {}, timezone = ss.getSpreadsheetTimeZone();
  batch.checks.forEach(function (c) {
    if (!bounds[c.table]) { names.push(c.table); bounds[c.table] = { row: 0, col: 0, firstRow: c.row, firstCol: c.col }; }
    bounds[c.table].row = Math.max(bounds[c.table].row, c.row); bounds[c.table].col = Math.max(bounds[c.table].col, c.col);
    bounds[c.table].firstRow = Math.min(bounds[c.table].firstRow, c.row); bounds[c.table].firstCol = Math.min(bounds[c.table].firstCol, c.col);
  });
  function colName(n) { var column = ''; while (n) { n--; column = String.fromCharCode(65 + n % 26) + column; n = Math.floor(n / 26); } return column; }
  var ranges = names.map(function (name) {
    var b = bounds[name];
    return "'" + name.replace(/'/g, "''") + "'!" + colName(b.firstCol) + b.firstRow + ':' + colName(b.col) + b.row;
  });
  // Use a fresh API read, not SpreadsheetApp's cached reads from before the API write.
  var response = Sheets.Spreadsheets.Values.batchGet(ss.getId(), { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' });
  if (!response || !response.valueRanges || response.valueRanges.length !== names.length) pfaError_('IMPORT_ATOMIC_READBACK_MISMATCH');
  names.forEach(function (name, i) { grids[name] = response.valueRanges[i].values || []; });
  batch.checks.forEach(function (c) {
    var expected = c.value instanceof Date ? pfaCell_(c.value, timezone).userEnteredValue.numberValue : c.value;
    var actual = (grids[c.table][c.row - bounds[c.table].firstRow] || [])[c.col - bounds[c.table].firstCol];
    if (!pfaSame_(expected, actual)) pfaError_('IMPORT_ATOMIC_READBACK_MISMATCH', c.table);
  });
}
// PO200: what this commit cost, for the person reading a test run. Numbers only, read-only, never stored: the size and
// part count of the one atomic request, the cells it checks on readback, and where the time went (milliseconds).
function pfaMetrics_(batch, t) {
  var m = { requests: batch.requests.length, bytes: batch.bytes, cells: batch.checks.length, max_bytes: PFA_MAX_BYTES_ };
  if (t.staged) m.ms_stage = t.staged - t.start;
  if (t.sent && t.answered) m.ms_request = t.answered - t.sent;
  if (t.answered && t.verified) m.ms_readback = t.verified - t.answered;
  m.ms_total = (t.verified || Date.now()) - t.start;
  try { console.log('PFA_METRICS ' + JSON.stringify(m)); } catch (e) {}
  return m;
}
function pfaCommit_(ss, dom, req, ev, liveS, row, hash) {
  var dispatched = false, intent = false, result, batch, T = { start: Date.now() };
  try {
    if (typeof Sheets === 'undefined' || !Sheets.Spreadsheets || typeof Sheets.Spreadsheets.batchUpdate !== 'function' || !Sheets.Spreadsheets.Values || typeof Sheets.Spreadsheets.Values.batchGet !== 'function')
      pfaError_('IMPORT_ATOMIC_SERVICE_UNAVAILABLE', 'Enable the Advanced Google Sheets service before factory imports. Nothing was written.');
    if (ss.getId() !== prodExpectedDbId_()) pfaError_('IMPORT_ATOMIC_DB_MISMATCH');
    var stage = pfaStage_(ss, dom.domain), S = imbSheets_(stage.ss), J = imbJournal_(), now = imbNow_();
    var ctx = { journal: J, batch_id: req.id, mode: req.mode, actor: req.actor, now: now, scope: req.scope };
    var out = dom.apply(stage.ss, ev.plan, ctx) || {}, n = 0;
    J.appendRows(S.changes, S.hc, J.changes.map(function (c) {
      return { change_id: req.id + '-' + (++n), import_batch_id: req.id, domain: dom.domain, entity_table: c.entity_table, entity_id: c.entity_id, line_id: c.line_id || '', field: c.field,
        before_value: c.before === undefined || c.before === null ? '' : String(c.before), after_value: c.after === undefined || c.after === null ? '' : String(c.after),
        result: c.result || 'APPLIED', movement_id: c.movement_id || '', created_at: ctx.now };
    }));
    result = Object.assign({ counts: (ev.preview && ev.preview.counts) || {}, audit_rows: n }, out.result || {},
      { atomic_commit: true, staged_readback_verified: true, readback_verified: false });
    var receipt = { import_batch_id: req.id, domain: dom.domain, mode: req.mode, schema_version: dom.schema_version, scope_key: imbScopeKey_(req.scope), content_hash: hash,
      status: IMB_STATUS_.COMMITTED, row_counts_json: JSON.stringify((ev.preview && ev.preview.counts) || {}), result_json: JSON.stringify(result), actor_claimed: req.actor,
      actor_source: 'CLIENT_CLAIM_UNVERIFIED', file_name: req.file_name, created_at: now, updated_at: ctx.now, committed_at: ctx.now, error: '' };
    if (receipt.result_json.length > 45000) pfaError_('IMPORT_ATOMIC_RECEIPT_TOO_LARGE');
    var plannedRow = imbSetReceipt_(S, row, receipt);
    batch = pfaRequests_(stage, ss.getSpreadsheetTimeZone()); T.staged = Date.now();
    pfaCheckBaseline_(stage, false);
    // An intent can survive interruption, but no PO, balance, movement or audit is written until the single atomic call below.
    intent = true;
    var intentReceipt = Object.assign({}, receipt, { status: IMB_STATUS_.COMMITTING, result_json: '', committed_at: '' });
    row = imbSetReceipt_(liveS, row, intentReceipt); SpreadsheetApp.flush();
    var pending = imbFindReceipt_(liveS, req.id);
    if (row !== plannedRow || !pending || pending.__sheetRow !== row || imbStr_(pending.status) !== IMB_STATUS_.COMMITTING || imbStr_(pending.content_hash) !== hash)
      pfaError_('IMPORT_ATOMIC_INTENT_MISMATCH');
    pfaCheckBaseline_(stage, true);
    dispatched = true; T.sent = Date.now();
    Sheets.Spreadsheets.batchUpdate({ requests: batch.requests }, ss.getId()); T.answered = Date.now();
    SpreadsheetApp.flush(); pfaVerify_(ss, batch); T.verified = Date.now();
    return { success: true, import_batch_id: req.id, status: IMB_STATUS_.COMMITTED, result: Object.assign({}, result, { readback_verified: true }), writes_performed: batch.checks.length, metrics: pfaMetrics_(batch, T) };
  } catch (error) {
    var msg = imbStr_(error && error.message || error);
    if (dispatched) {
      // Lost responses are reconciled, never replayed or compensated with inverse business writes.
      try {
        // This verifies the final COMMITTED receipt, content hash and result JSON as well as every business cell.
        pfaVerify_(ss, batch);
        return { success: true, recovered_response: true, import_batch_id: req.id, status: IMB_STATUS_.COMMITTED, result: Object.assign({}, result, { readback_verified: true }), writes_performed: batch.checks.length, metrics: pfaMetrics_(batch, T) };
      } catch (readError) {}
      return imbNo_('IMPORT_OUTCOME_UNKNOWN', 'The atomic request outcome could not be confirmed. Do not start a new batch or resend the import; review its receipt first. ' + msg,
        { import_batch_id: req.id, status: IMB_STATUS_.UNKNOWN_OUTCOME, retry_safe: false });
    }
    return imbNo_(intent ? 'IMPORT_BATCH_OUTCOME_UNKNOWN' : (error.importCode || 'IMPORT_FAILED_ROLLED_BACK'),
      'No business rows were written. ' + (intent ? 'An intent receipt exists; review it before another attempt. ' : '') + msg,
      { import_batch_id: req.id, writes_performed: intent ? 1 : 0, metadata_receipt_written: intent, business_writes_performed: 0, retry_safe: !intent });
  }
}
