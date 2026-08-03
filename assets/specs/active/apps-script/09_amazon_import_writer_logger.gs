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
// Incremental keyed upsert + calendar-inclusive prune. Preserves the header AND every existing
// in-window row not in this batch (never a full-table rewrite). Enhancements (2026-07-21):
//   - explicit `cutoffDate` (retention_start 'yyyy-MM-dd'): prune rows with snapshot_date < cutoffDate
//     (blank dates kept). Falls back to a calendar today−retentionDays if cutoffDate is omitted.
//   - collapses pre-existing DUPLICATE natural keys (last wins) so incomplete/duplicated dates self-repair.
//   - hash-based change detection: a key match with an identical source_row_hash counts as `unchanged`
//     (not rewritten in effect); a differing hash counts as `updated`.
// Returns { rowsWritten, updated, appended, unchanged, pruned, duplicatesRemoved, total }.
function amazonUpsertRollingSnapshot_(spreadsheetId, sheetName, destObjs, naturalKey, dateField, retentionDays, tz, cutoffDate) {
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
  // Which natural-key positions are the date field — those MUST be canonicalized to yyyy-MM-dd so that a
  // Google-Sheets Date cell and an incoming 'yyyy-MM-dd' string produce a byte-identical key (root cause of
  // duplicate appends). Non-date key parts keep the prior trim-only behavior.
  var keyIsDate = (naturalKey || []).map(function (k) { return dateColKey !== '' && String(k).toLowerCase() === dateColKey; });

  // Single shared canonical rule (delegates to amazonNormalizeDate_ — the one date normalizer): Date value
  // and valid date string for the same calendar day collapse to the same yyyy-MM-dd. Blank/invalid values
  // fall back to the prior trim-only representation so nothing else changes.
  function dateKeyPart_(v) {
    var nd = amazonNormalizeDate_(v);
    return nd.ok ? nd.value : String(v == null ? '' : v).trim();
  }

  function keyOfRowArr(rowArr) {
    var parts = [];
    for (var i = 0; i < keyCols.length; i++) {
      var ci = keyCols[i];
      var raw = (ci == null) ? '' : rowArr[ci];
      parts.push(keyIsDate[i] ? dateKeyPart_(raw) : String(raw == null ? '' : raw).trim());
    }
    return parts.join('||');
  }
  function keyOfObj(o) {
    var lower = {};
    for (var k in o) { if (o.hasOwnProperty(k)) lower[String(k).toLowerCase()] = o[k]; }
    var parts = [];
    for (var i = 0; i < naturalKey.length; i++) {
      var v = lower[String(naturalKey[i]).toLowerCase()];
      parts.push(keyIsDate[i] ? dateKeyPart_(v) : String(v == null ? '' : v).trim());
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

  var hashCol = (colIndex['source_row_hash'] != null) ? colIndex['source_row_hash'] : -1;

  // 1) existing rows — collapse pre-existing DUPLICATE natural keys (last wins). Earlier duplicates
  //    are dropped from the output (self-repair for destination duplicates), counted separately.
  var existing = (lastRow > 1) ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var merged = [];
  var rowByKey = {};
  var duplicatesRemoved = 0;
  for (var r = 0; r < existing.length; r++) {
    var kr = keyOfRowArr(existing[r]);
    if (rowByKey[kr] !== undefined) { merged[rowByKey[kr]] = existing[r]; duplicatesRemoved++; } // collapse to last
    else { rowByKey[kr] = merged.length; merged.push(existing[r]); }
  }

  // 2) upsert batch — keyed update (change-detected via source_row_hash) or append.
  var updated = 0, appended = 0, unchanged = 0;
  for (var d = 0; d < destObjs.length; d++) {
    var o = destObjs[d];
    var ko = keyOfObj(o);
    var newRow = objToRow(o);
    if (rowByKey[ko] !== undefined) {
      var idx = rowByKey[ko];
      var same = false;
      if (hashCol >= 0) {
        var oldHash = String(merged[idx][hashCol] == null ? '' : merged[idx][hashCol]).trim();
        var newHash = String(newRow[hashCol] == null ? '' : newRow[hashCol]).trim();
        same = (oldHash !== '' && oldHash === newHash);
      }
      merged[idx] = newRow;             // idempotent either way (identical when unchanged)
      if (same) unchanged++; else updated++;
    } else {
      rowByKey[ko] = merged.length; merged.push(newRow); appended++;
    }
  }

  // 3) prune rows OLDER than the retention start (snapshot_date < cutoff). Calendar-inclusive cutoff =
  //    retention_start ('yyyy-MM-dd'); blank dates are kept (cannot judge). Lexical compare is valid for yyyy-MM-dd.
  var pruned = 0;
  var cutoff = (cutoffDate && /^\d{4}-\d{2}-\d{2}$/.test(String(cutoffDate)))
    ? String(cutoffDate)
    : (retentionDays > 0 ? amazonRollingCutoffDate_(retentionDays, tz) : '');
  if (dateCol >= 0 && cutoff) {
    var kept = [];
    for (var m = 0; m < merged.length; m++) {
      // Canonicalize the stored date (Date cell OR string) before the lexical window compare — a raw
      // String(Date) would never match yyyy-MM-dd and would silently defeat retention.
      var ndv = amazonNormalizeDate_(merged[m][dateCol]);
      var dval = ndv.ok ? ndv.value : ''; // blank/invalid → treated as "cannot judge" → kept
      if (!dval || dval >= cutoff) kept.push(merged[m]); // blank kept; >= cutoff kept
      else pruned++;
    }
    merged = kept;
  }

  // 4) rewrite the DATA region only (header row 1 preserved). merged contains the preserved non-batch
  //    rows + upserts, deduped and pruned — an upsert result, not a source-only overwrite.
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  if (merged.length) sh.getRange(2, 1, merged.length, lastCol).setValues(merged);

  return {
    rowsWritten: updated + appended, updated: updated, appended: appended, unchanged: unchanged,
    pruned: pruned, duplicatesRemoved: duplicatesRemoved, total: merged.length
  };
}

/** yyyy-MM-dd of (today - retentionDays) in the given timezone (default Asia/Taipei). */
// Calendar-inclusive retention-start ('yyyy-MM-dd' in tz) = today(tz) − retentionDays. Rows with
// snapshot_date < this are expired. Equals amazonRetentionWindow_(retentionDays, tz).start. Used only
// as a fallback when the caller does not pass an explicit cutoffDate.
function amazonRollingCutoffDate_(retentionDays, tz) {
  tz = tz || 'Asia/Taipei';
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return amazonAddDaysStr_(today, -(retentionDays || 90));
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
