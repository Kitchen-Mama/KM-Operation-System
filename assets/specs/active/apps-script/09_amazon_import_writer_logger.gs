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
