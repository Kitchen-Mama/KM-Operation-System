// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 09_amazon_import_writer_logger.gs — snapshot writer + log writers
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ---- destination writer -------------------------------------------

function amazonWriteSnapshot_(spreadsheetId, sheetName, destObjs) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  if (!ss) throw new Error('destination spreadsheet not found: ' + spreadsheetId);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('destination sheet not found: ' + sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('destination sheet has no header row: ' + sheetName);
  var destHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });

  // clear data rows only (preserve header row 1)
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (!destObjs.length) return 0;

  var matrix = [];
  for (var i = 0; i < destObjs.length; i++) {
    var o = destObjs[i];
    var lower = {};
    for (var key in o) { if (o.hasOwnProperty(key)) lower[String(key).toLowerCase()] = o[key]; }
    var line = [];
    for (var c = 0; c < destHeaders.length; c++) {
      var hk = destHeaders[c].toLowerCase();
      var v = (lower[hk] !== undefined && lower[hk] !== null) ? lower[hk] : '';
      line.push(v);
    }
    matrix.push(line);
  }
  sh.getRange(2, 1, matrix.length, destHeaders.length).setValues(matrix);
  return matrix.length;
}

// ---- rolling incremental upsert writer (Daily Sales) --------------
//
// Incremental rolling-window write for a snapshot tab (currently amazon_daily_sales_snapshot).
// UNLIKE amazonWriteSnapshot_ (which discards all existing rows and rewrites from source), this:
//   1. reads the destination header + all existing data rows,
//   2. UPSERTs each destObj by its natural key (update the matching existing row, else append),
//   3. PRUNES rows whose dateField is older than (today - retentionDays),
//   4. preserves the header row and every existing row NOT in this batch (never a full-table wipe).
// Returns { rowsWritten, updated, appended, pruned, total }.
function amazonUpsertRollingSnapshot_(spreadsheetId, sheetName, destObjs, naturalKey, dateField, retentionDays, tz) {
  var ss = SpreadsheetApp.openById(spreadsheetId);
  if (!ss) throw new Error('destination spreadsheet not found: ' + spreadsheetId);
  var sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('destination sheet not found: ' + sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastCol < 1) throw new Error('destination sheet has no header row: ' + sheetName);

  var destHeaders = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var headerLower = destHeaders.map(function (h) { return h.toLowerCase(); });
  var colIndex = {};
  for (var c = 0; c < headerLower.length; c++) colIndex[headerLower[c]] = c;

  var keyCols = (naturalKey || []).map(function (k) { return colIndex[String(k).toLowerCase()]; });
  var dateColKey = dateField ? String(dateField).toLowerCase() : '';
  var dateCol = (dateColKey && colIndex[dateColKey] != null) ? colIndex[dateColKey] : -1;

  function keyOfRowArr(rowArr) {
    var parts = [];
    for (var i = 0; i < keyCols.length; i++) {
      var ci = keyCols[i];
      parts.push((ci == null) ? '' : String(rowArr[ci] == null ? '' : rowArr[ci]).trim());
    }
    return parts.join('||');
  }
  function keyOfObj(o) {
    var lower = {};
    for (var k in o) { if (o.hasOwnProperty(k)) lower[String(k).toLowerCase()] = o[k]; }
    var parts = [];
    for (var i = 0; i < naturalKey.length; i++) {
      var v = lower[String(naturalKey[i]).toLowerCase()];
      parts.push(String(v == null ? '' : v).trim());
    }
    return parts.join('||');
  }
  function objToRow(o) {
    var lower = {};
    for (var k in o) { if (o.hasOwnProperty(k)) lower[String(k).toLowerCase()] = o[k]; }
    var line = [];
    for (var c2 = 0; c2 < headerLower.length; c2++) {
      var v = lower[headerLower[c2]];
      line.push((v === undefined || v === null) ? '' : v);
    }
    return line;
  }

  // 1) existing rows
  var existing = (lastRow > 1) ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var merged = [];
  var rowByKey = {};
  for (var r = 0; r < existing.length; r++) {
    var kr = keyOfRowArr(existing[r]);
    // last existing row for a key wins its slot; earlier duplicates are kept but shadowed on upsert
    rowByKey[kr] = merged.length;
    merged.push(existing[r]);
  }

  // 2) upsert batch
  var updated = 0, appended = 0;
  for (var d = 0; d < destObjs.length; d++) {
    var o = destObjs[d];
    var ko = keyOfObj(o);
    var newRow = objToRow(o);
    if (rowByKey[ko] !== undefined) { merged[rowByKey[ko]] = newRow; updated++; }
    else { rowByKey[ko] = merged.length; merged.push(newRow); appended++; }
  }

  // 3) prune rows older than (today - retentionDays) by dateField (yyyy-MM-dd lexical compare)
  var pruned = 0;
  if (dateCol >= 0 && retentionDays > 0) {
    var cutoff = amazonRollingCutoffDate_(retentionDays, tz); // 'yyyy-MM-dd'
    var kept = [];
    for (var m = 0; m < merged.length; m++) {
      var dval = String(merged[m][dateCol] == null ? '' : merged[m][dateCol]).trim().slice(0, 10);
      if (!dval || dval >= cutoff) kept.push(merged[m]); // blank date kept (cannot judge); >= cutoff kept
      else pruned++;
    }
    merged = kept;
  }

  // 4) rewrite the DATA region only (header row 1 preserved). merged already contains the
  //    preserved non-batch rows, so this is an upsert result — not a source-only overwrite.
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (merged.length) sh.getRange(2, 1, merged.length, lastCol).setValues(merged);

  return { rowsWritten: updated + appended, updated: updated, appended: appended, pruned: pruned, total: merged.length };
}

/** yyyy-MM-dd of (today - retentionDays) in the given timezone (default Asia/Taipei). */
function amazonRollingCutoffDate_(retentionDays, tz) {
  tz = tz || 'Asia/Taipei';
  var cutoff = new Date(new Date().getTime() - retentionDays * 24 * 60 * 60 * 1000);
  return Utilities.formatDate(cutoff, tz, 'yyyy-MM-dd');
}

// ---- logging (best-effort; header-based) --------------------------

function amazonLogRun_(spreadsheetId, run) {
  try {
    var sh = SpreadsheetApp.openById(spreadsheetId).getSheetByName('import_sync_runs');
    if (!sh) { Logger.log('[import_sync_runs missing] ' + JSON.stringify(run)); return; }
    amazonAppendByHeader_(sh, run);
  } catch (e) { Logger.log('amazonLogRun_ failed: ' + e + ' :: ' + JSON.stringify(run)); }
}

function amazonLogIssues_(spreadsheetId, issues) {
  try {
    var sh = SpreadsheetApp.openById(spreadsheetId).getSheetByName('import_sync_issues');
    if (!sh) { Logger.log('[import_sync_issues missing] ' + JSON.stringify(issues)); return; }
    for (var i = 0; i < issues.length; i++) amazonAppendByHeader_(sh, issues[i]);
  } catch (e) { Logger.log('amazonLogIssues_ failed: ' + e); }
}

function amazonAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) return;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var lower = {};
  for (var key in obj) { if (obj.hasOwnProperty(key)) lower[String(key).toLowerCase()] = obj[key]; }
  var row = [];
  for (var c = 0; c < headers.length; c++) { var v = lower[headers[c]]; row.push((v === undefined || v === null) ? '' : v); }
  sheet.appendRow(row);
}

// ---- small helpers ------------------------------------------------

function amazonAddIssue_(ctx, type, level, fieldName, sourceValue, expectedRule, actionTaken, sourceKey, message, sourceRowNumber) {
  ctx.issues.push({
    issue_id: 'ISS-' + Utilities.getUuid().substring(0, 12),
    sync_run_id: ctx.syncRunId,
    sync_batch_id: ctx.syncBatchId,
    destination_table: ctx.config.destinationSheetName,
    source_file_id: ctx.sourceFileId,
    source_sheet_name: ctx.sourceSheetName,
    source_row_number: (sourceRowNumber === undefined ? '' : sourceRowNumber),
    source_key: sourceKey || '',
    issue_type: type,
    issue_level: level,
    field_name: fieldName || '',
    source_value: (sourceValue === undefined || sourceValue === null) ? '' : String(sourceValue),
    expected_rule: expectedRule || '',
    action_taken: actionTaken || '',
    error_message: message || '',
    created_at: amazonTimestamp_(),
    resolved_status: 'open',
    resolved_by: '',
    resolved_at: '',
    note: ''
  });
}
