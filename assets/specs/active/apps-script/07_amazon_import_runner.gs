// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 07_amazon_import_runner.gs — runners + entry points
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ---- entry points -------------------------------------------------

/** Run all configured Amazon snapshot imports. Safe to attach to a time-based trigger.
 *  Scheduler passes no options → Daily Sales (rolling_upsert) reads its incremental default
 *  (1 completed day = yesterday). */
function runAmazonSnapshotImports() {
  var summaries = [];
  for (var i = 0; i < IMPORT_CONFIGS.length; i++) {
    summaries.push(runAmazonSnapshotImport_(IMPORT_CONFIGS[i], 'scheduler', {}));
  }
  Logger.log(JSON.stringify(summaries, null, 2));
  return summaries;
}

/** POST handler: run all, or a single source via body.destination_table.
 *  body.backfill_days = N re-reads the last N completed days for rolling_upsert configs
 *  (Daily Sales) and UPSERTs them (still no full-table rewrite). */
function handleRunAmazonSnapshotImports_(body) {
  var only = (body && body.destination_table) ? String(body.destination_table).trim() : '';
  var triggeredBy = (body && body.triggered_by) ? String(body.triggered_by).trim() : 'api';
  var backfillDays = (body && body.backfill_days != null) ? parseInt(body.backfill_days, 10) : null;
  if (backfillDays != null && (isNaN(backfillDays) || backfillDays <= 0)) backfillDays = null;
  var options = { backfillDays: backfillDays };
  var summaries = [];
  for (var i = 0; i < IMPORT_CONFIGS.length; i++) {
    var cfg = IMPORT_CONFIGS[i];
    if (only && cfg.destinationSheetName !== only) continue;
    summaries.push(runAmazonSnapshotImport_(cfg, triggeredBy, options));
  }
  return jsonResponse_({ success: true, data: { runs: summaries } });
}

/**
 * MANUAL TEST CLEANUP ONLY — clears data rows from the import log tabs.
 * Run by hand from the Apps Script editor. NOT wired into any importer, trigger, or POST action.
 * - Clears data rows only (preserves the header row) for: import_sync_runs, import_sync_issues.
 * - Does NOT touch snapshot tabs. Never deletes a sheet. Never clears the header row.
 * - Missing tab → log and skip. Header-only tab → nothing to clear.
 */
function clearAmazonImportTestLogs() {
  var LOG_TABS = ['import_sync_runs', 'import_sync_issues'];
  var ss = SpreadsheetApp.openById(AMAZON_DESTINATION_SPREADSHEET_ID_);
  var results = [];
  for (var i = 0; i < LOG_TABS.length; i++) {
    var name = LOG_TABS[i];
    var sh = ss.getSheetByName(name);
    if (!sh) { Logger.log('[clearAmazonImportTestLogs] tab not found, skipped: ' + name); results.push(name + ': missing (skipped)'); continue; }
    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow <= 1 || lastCol < 1) { Logger.log('[clearAmazonImportTestLogs] header-only / empty, nothing to clear: ' + name); results.push(name + ': header-only (no change)'); continue; }
    sh.getRange(2, 1, lastRow - 1, lastCol).clearContent(); // data rows only; header row 1 preserved
    results.push(name + ': cleared ' + (lastRow - 1) + ' data row(s)');
  }
  Logger.log('[clearAmazonImportTestLogs] ' + results.join(' | '));
  return results;
}

// ---- per-source importer ------------------------------------------

function runAmazonSnapshotImport_(config, triggeredBy, options) {
  options = options || {};
  var startedAt = amazonTimestamp_();
  var syncRunId = 'RUN-' + Utilities.getUuid().substring(0, 12);
  var syncBatchId = 'SYNC-' + config.destinationSheetName + '-' + Utilities.getUuid().substring(0, 8);
  var sourceFileId = (config.sourceType === 'bigquery')
    ? (config.sourceProjectId + '.' + config.sourceDataset + '.' + config.sourceTable)
    : config.sourceId;
  var sourceSheetName = (config.sourceType === 'bigquery') ? config.sourceTable : config.sourceSheetName;

  var ctx = {
    config: config, syncRunId: syncRunId, syncBatchId: syncBatchId,
    sourceFileId: sourceFileId, sourceSheetName: sourceSheetName,
    issues: [], rowsRead: 0, rowsWritten: 0, rowsError: 0, rowsDuplicate: 0, rowsPruned: 0,
    // Phase 3A: placeholder + data-window governance (daily sales / capping)
    placeholderCount: 0, isFallback: false, fallbackGroupCount: 0,
    runLatestDate: '', runWindowStart: '', runWindowEnd: '', dataAgeDays: '',
    // Gap-aware rolling sync (Daily Sales) — 2026-07-21
    rollingMeta: null, rowsInserted: 0, rowsUpdated: 0, rowsUnchanged: 0, rowsDuplicateKeys: 0
  };

  // Concurrency guard (rolling_upsert only): a script lock so two triggers cannot inspect/prune/upsert
  // Daily Sales simultaneously. Acquired before the source read; released in finalize() on every exit.
  var lock = null;
  function releaseLock_() { if (lock) { try { lock.releaseLock(); } catch (_e) {} lock = null; } }

  function finalize(status, errorSummary) {
    releaseLock_();
    var rm = ctx.rollingMeta;
    function j_(v) { try { return JSON.stringify(v); } catch (_) { return ''; } }
    function n_(a) { return (a && a.length != null) ? a.length : 0; }
    var rowsSkipped = ctx.rowsError + ctx.rowsDuplicate;
    var run = {
      sync_run_id: syncRunId,
      sync_batch_id: syncBatchId,
      import_job_name: 'amazon_snapshot_import',
      source_type: config.sourceType,
      source_system: config.sourceSystem,
      source_report: config.sourceReport,
      destination_table: config.destinationSheetName,
      schedule_type: triggeredBy,
      scheduled_at: '',
      started_at: startedAt,
      finished_at: amazonTimestamp_(),
      status: status,
      rows_read: ctx.rowsRead,
      rows_written: ctx.rowsWritten,
      rows_skipped: rowsSkipped,
      rows_error: ctx.rowsError,
      rows_duplicate: ctx.rowsDuplicate,
      triggered_by: triggeredBy,
      error_summary: errorSummary || '',
      created_at: amazonTimestamp_(),
      note: 'quality_score=' + amazonQualityScore_(ctx.rowsRead, ctx.rowsWritten, ctx.rowsError, ctx.rowsDuplicate),
      // Phase 3A governance fields (written only if the header exists in import_sync_runs)
      latest_source_date: ctx.runLatestDate,
      data_window_start_date: ctx.runWindowStart,
      data_window_end_date: ctx.runWindowEnd,
      is_fallback_used: ctx.isFallback,
      fallback_group_count: ctx.fallbackGroupCount,
      normalized_placeholder_count: ctx.placeholderCount,
      data_age_days: ctx.dataAgeDays,
      // Gap-aware rolling-sync run fields (written only if the header exists in import_sync_runs;
      // otherwise a compact summary is folded into quality_note below so nothing is lost).
      retention_start_date: rm ? rm.retentionStart : '',
      retention_end_date: rm ? rm.retentionEnd : '',
      source_available_dates: rm ? j_(rm.sourceAvailableDates) : '',
      destination_existing_dates: rm ? j_(rm.destExistingDates) : '',
      missing_dates_detected: rm ? j_(rm.missingDates) : '',
      incomplete_dates_detected: rm ? j_(rm.incompleteDates) : '',
      recent_dates_reconciled: rm ? j_(rm.recentReconciled) : '',
      dates_imported: rm ? j_(rm.datesToFetch) : '',
      source_unavailable_dates: rm ? j_(rm.sourceUnavailableDates) : '',
      dates_pruned: ctx.rowsPruned,
      rows_inserted: ctx.rowsInserted,
      rows_updated: ctx.rowsUpdated,
      rows_unchanged: ctx.rowsUnchanged,
      duplicate_keys_detected: ctx.rowsDuplicateKeys,
      completed_at: amazonTimestamp_(),
      quality_note: 'quality_score=' + amazonQualityScore_(ctx.rowsRead, ctx.rowsWritten, ctx.rowsError, ctx.rowsDuplicate) +
        '; placeholders=' + ctx.placeholderCount +
        (config.writeMode === 'rolling_upsert'
          ? ('; write_mode=rolling_upsert; rows_pruned=' + ctx.rowsPruned +
             '; ins=' + ctx.rowsInserted + '; upd=' + ctx.rowsUpdated + '; unch=' + ctx.rowsUnchanged +
             '; dupkeys=' + ctx.rowsDuplicateKeys +
             (rm ? ('; window=' + rm.retentionStart + '..' + rm.retentionEnd +
                    '; missing=' + n_(rm.missingDates) + '; incomplete=' + n_(rm.incompleteDates) +
                    '; imported=' + n_(rm.datesToFetch) + '; src_unavail=' + n_(rm.sourceUnavailableDates)) : ''))
          : '') +
        (ctx.isFallback ? ('; fallback=' + ctx.fallbackGroupCount + ' groups (rolling_window_empty)') : '')
    };
    amazonLogRun_(config.destinationSpreadsheetId, run);
    if (ctx.issues.length) amazonLogIssues_(config.destinationSpreadsheetId, ctx.issues);
    return {
      destination_table: config.destinationSheetName, status: status,
      rows_read: ctx.rowsRead, rows_written: ctx.rowsWritten,
      rows_error: ctx.rowsError, rows_duplicate: ctx.rowsDuplicate,
      issues: ctx.issues.length, sync_run_id: syncRunId, sync_batch_id: syncBatchId
    };
  }

  // 0) Concurrency lock (rolling_upsert only). Covers coverage-inspection + prune/upsert so two runs
  //    cannot write Daily Sales at once. Fail safe: if the lock can't be taken, do NOT touch the data.
  if (config.writeMode === 'rolling_upsert') {
    try {
      lock = LockService.getScriptLock();
      if (!lock.tryLock(30000)) {
        lock = null;
        amazonAddIssue_(ctx, 'lock_unavailable', 'warning', '', '', 'another import holds the lock', 'stopped_import', '', 'Could not acquire script lock within 30s');
        return finalize('failed', 'lock_unavailable: another Daily Sales import is running');
      }
    } catch (le) {
      lock = null;
      return finalize('failed', 'lock_error: ' + (le && le.message ? le.message : le));
    }
  }

  // 1) Read source (rolling_upsert: gap-aware — computes the 90-day window, inspects source+destination
  //    coverage, and fetches ONLY missing/incomplete/recent dates; attaches src.rollingMeta).
  var src;
  try {
    src = (config.sourceType === 'bigquery') ? amazonReadBigQuerySource_(config, options) : amazonReadSheetSource_(config);
  } catch (e) {
    amazonAddIssue_(ctx, 'source_read_error', 'critical', '', '', 'source must be readable', 'stopped_import', '', String(e && e.message ? e.message : e));
    return finalize('failed', 'source_read_error: ' + (e && e.message ? e.message : e));
  }
  if (src && src.rollingMeta) ctx.rollingMeta = src.rollingMeta;

  // 2) Header validation — every fieldMap (REQUIRED) source header must exist.
  //    optionalFieldMap headers are intentionally EXCLUDED here: a missing optional header
  //    must NOT raise missing_required_header or stop the source (it maps to blank instead).
  var requiredHeaders = [];
  for (var k in config.fieldMap) { if (config.fieldMap.hasOwnProperty(k)) requiredHeaders.push(config.fieldMap[k]); }
  var headerSet = {};
  for (var h = 0; h < src.headers.length; h++) headerSet[String(src.headers[h]).trim()] = true;
  var missing = [];
  for (var r2 = 0; r2 < requiredHeaders.length; r2++) { if (!headerSet[requiredHeaders[r2]]) missing.push(requiredHeaders[r2]); }
  if (missing.length) {
    for (var mi = 0; mi < missing.length; mi++) {
      amazonAddIssue_(ctx, 'missing_required_header', 'error', missing[mi], '', 'required source header must be present', 'stopped_import', '', 'Missing source header: ' + missing[mi]);
    }
    // Do NOT write partial data; existing snapshot is left intact.
    return finalize('failed', 'missing_required_header: ' + missing.join(', '));
  }

  // 3) Map + validate + dedup rows
  ctx.rowsRead = src.rows.length;
  var nowTs = amazonTimestamp_();
  var seen = {};
  var destObjs = [];

  for (var i = 0; i < src.rows.length; i++) {
    var sr = src.rows[i];
    var srcRowNum = sr.__rowNum || (i + 1);
    var dest = {};

    // fixed values
    if (config.fixedValues) { for (var fk in config.fixedValues) { if (config.fixedValues.hasOwnProperty(fk)) dest[fk] = config.fixedValues[fk]; } }
    // mapped fields (by header name) — REQUIRED source headers (validated above)
    for (var df in config.fieldMap) {
      if (!config.fieldMap.hasOwnProperty(df)) continue;
      var raw = sr[config.fieldMap[df]];
      dest[df] = (raw === null || raw === undefined) ? '' : (typeof raw === 'string' ? raw.trim() : raw);
    }
    // optional mapped fields — map ONLY if the source header exists; otherwise set blank.
    // optionalFieldMap headers are NOT required and never trigger missing_required_header.
    if (config.optionalFieldMap) {
      for (var odf in config.optionalFieldMap) {
        if (!config.optionalFieldMap.hasOwnProperty(odf)) continue;
        var oHeader = config.optionalFieldMap[odf];
        if (headerSet[oHeader]) {
          var oraw = sr[oHeader];
          dest[odf] = (oraw === null || oraw === undefined) ? '' : (typeof oraw === 'string' ? oraw.trim() : oraw);
        } else {
          dest[odf] = ''; // optional source header absent -> blank destination (safe for rowHash + dedup)
        }
      }
    }

    // weekly derived fields
    if (config.weekField && config.derivedFields) {
      var wk = amazonDeriveWeekParts_(dest[config.weekField]);
      if (wk.ok) { dest.snapshot_month = wk.month; dest.week_start_date = wk.start; dest.week_end_date = wk.end; }
      else {
        dest.snapshot_month = ''; dest.week_start_date = ''; dest.week_end_date = '';
        if (!amazonIsBlank_(dest[config.weekField])) {
          amazonAddIssue_(ctx, 'invalid_date', 'warning', config.weekField, dest[config.weekField], 'Week must be yyyy-MM-dd~yyyy-MM-dd', 'logged_only', amazonKeyOf_(config, dest), 'Could not parse week range', srcRowNum);
        }
      }
    }

    // normalize required date fields
    var dateBad = false;
    var dfs = config.dateFields || [];
    for (var d2 = 0; d2 < dfs.length; d2++) {
      var dfName = dfs[d2];
      if (!dest.hasOwnProperty(dfName)) continue;
      if (amazonIsBlank_(dest[dfName])) continue; // emptiness handled by natural-key check
      var nd = amazonNormalizeDate_(dest[dfName]);
      if (!nd.ok) {
        amazonAddIssue_(ctx, 'invalid_date', 'error', dfName, dest[dfName], 'date must be yyyy-MM-dd', 'skipped_row', amazonKeyOf_(config, dest), 'Invalid date value', srcRowNum);
        dateBad = true; break;
      }
      dest[dfName] = nd.value;
    }
    if (dateBad) { ctx.rowsError++; continue; }

    // Amazon numeric placeholder normalization (non-key, non-text). Runs BEFORE invalid_number.
    //   "N+"  -> N, set companion *_is_capped = TRUE, NO issue (counted as placeholder)
    //   "/"   -> blank/null, NO issue (counted)
    //   blank -> blank/null, NO issue (not counted)
    //   "1,234"/"12%" -> 1234/12, NO issue (counted as formatted cleanup)
    //   anything else non-numeric -> blank + invalid_number warning
    var cappedFields = config.cappedFields || {};
    var companionSet = {};
    for (var cfk in cappedFields) { if (cappedFields.hasOwnProperty(cfk)) companionSet[cappedFields[cfk]] = false; }
    for (var nf in dest) {
      if (!dest.hasOwnProperty(nf)) continue;
      if (AMAZON_TEXT_FIELDS_[nf]) continue;
      if (/_is_capped$/.test(nf)) continue;
      var norm = amazonNormalizeNumeric_(dest[nf]);
      if (norm.kind === 'blank') { continue; }
      else if (norm.kind === 'null') { dest[nf] = ''; ctx.placeholderCount++; }
      else if (norm.kind === 'number') { dest[nf] = norm.value; if (norm.counted) ctx.placeholderCount++; }
      else if (norm.kind === 'capped') { dest[nf] = norm.value; ctx.placeholderCount++; if (cappedFields[nf]) companionSet[cappedFields[nf]] = true; }
      else { // unexpected non-numeric
        amazonAddIssue_(ctx, 'invalid_number', 'warning', nf, dest[nf], 'value should be numeric', 'converted_to_null', amazonKeyOf_(config, dest), 'Unexpected non-numeric value set to blank', srcRowNum);
        dest[nf] = '';
      }
    }
    // apply companion capped flags (set after the numeric loop so they are not re-processed)
    for (var ck in companionSet) { if (companionSet.hasOwnProperty(ck)) dest[ck] = companionSet[ck]; }

    // natural-key required values
    var keyMissing = false;
    for (var nk = 0; nk < config.naturalKey.length; nk++) {
      if (amazonIsBlank_(dest[config.naturalKey[nk]])) { keyMissing = true;
        amazonAddIssue_(ctx, 'missing_required_value', 'error', config.naturalKey[nk], '', 'natural key field required', 'skipped_row', amazonKeyOf_(config, dest), 'Missing required key field: ' + config.naturalKey[nk], srcRowNum);
        break;
      }
    }
    if (keyMissing) { ctx.rowsError++; continue; }

    // dedup by natural key (keep first)
    var keyStr = amazonKeyOf_(config, dest);
    if (seen[keyStr]) {
      amazonAddIssue_(ctx, 'duplicate_row', 'warning', '', '', 'duplicate natural key in one import', 'kept_first_row', keyStr, 'Duplicate row skipped', srcRowNum);
      ctx.rowsDuplicate++; continue;
    }
    seen[keyStr] = true;

    // system metadata
    dest.source_system = config.sourceSystem;
    dest.source_report = config.sourceReport;
    dest.source_file_id = sourceFileId;
    dest.source_sheet_name = sourceSheetName;
    dest.sync_batch_id = syncBatchId;
    dest.synced_at = nowTs;
    dest.created_at = nowTs;
    dest.updated_at = nowTs;
    dest.source_row_hash = amazonRowHash_(config.rowHashFields, dest);

    destObjs.push(dest);
  }

  // 3b) Daily Sales: compute data-window / fallback metadata per row + run-level rollup.
  if (config.sourceType === 'bigquery') {
    amazonApplyDailyWindow_(ctx, config, destObjs, !!src.isFallback);
  }

  // 4) Write to destination.
  //    - rolling_upsert (Daily Sales): incremental UPSERT by natural key + prune to retentionDays
  //      (preserves the header AND every existing row not in this batch — no full-table rewrite).
  //    - all other configs: full snapshot rewrite (preserve header, clear + rewrite data rows).
  try {
    if (config.writeMode === 'rolling_upsert') {
      var up = amazonUpsertRollingSnapshot_(
        config.destinationSpreadsheetId, config.destinationSheetName, destObjs,
        config.naturalKey, (config.dateFields && config.dateFields[0]) || 'snapshot_date',
        (config.retentionDays != null ? config.retentionDays : 90),
        config.scheduleTimezone,
        (ctx.rollingMeta && ctx.rollingMeta.retentionStart) ? ctx.rollingMeta.retentionStart : ''
      );
      ctx.rowsWritten = up.rowsWritten;
      ctx.rowsPruned = up.pruned;
      ctx.rowsInserted = up.appended || 0;
      ctx.rowsUpdated = up.updated || 0;
      ctx.rowsUnchanged = up.unchanged || 0;
      ctx.rowsDuplicateKeys = up.duplicatesRemoved || 0;
    } else {
      ctx.rowsWritten = amazonWriteSnapshot_(config.destinationSpreadsheetId, config.destinationSheetName, destObjs);
    }
  } catch (e2) {
    amazonAddIssue_(ctx, 'destination_write_error', 'critical', '', '', 'destination must be writable', 'stopped_import', '', String(e2 && e2.message ? e2.message : e2));
    return finalize('failed', 'destination_write_error: ' + (e2 && e2.message ? e2.message : e2));
  }

  var status = (ctx.rowsError > 0) ? 'partial_success' : 'success';
  return finalize(status, '');
}
