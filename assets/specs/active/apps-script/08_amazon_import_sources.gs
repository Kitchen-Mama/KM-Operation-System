// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 08_amazon_import_sources.gs — sheet + BigQuery source readers
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

// ---- source readers -----------------------------------------------

function amazonReadSheetSource_(config) {
  var ss = SpreadsheetApp.openById(config.sourceId);
  if (!ss) throw new Error('source spreadsheet not found: ' + config.sourceId);
  var sh = ss.getSheetByName(config.sourceSheetName);
  if (!sh) throw new Error('source sheet not found: ' + config.sourceSheetName);
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 1) return { headers: [], rows: [] };
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var allEmpty = true;
    for (var c = 0; c < row.length; c++) { if (String(row[c] == null ? '' : row[c]).trim() !== '') { allEmpty = false; break; } }
    if (allEmpty) continue;
    var obj = {};
    for (var h2 = 0; h2 < headers.length; h2++) obj[headers[h2]] = row[h2];
    obj.__rowNum = i + 1;
    rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

function amazonReadBigQuerySource_(config, options) {
  if (typeof BigQuery === 'undefined') {
    throw new Error('BigQuery Advanced Service not enabled. Enable "BigQuery API" in Apps Script Services and in the Google Cloud project.');
  }
  options = options || {};
  var cols = [];
  for (var k in config.fieldMap) { if (config.fieldMap.hasOwnProperty(k)) cols.push('`' + config.fieldMap[k] + '`'); }
  var table = '`' + config.sourceProjectId + '.' + config.sourceDataset + '.' + config.sourceTable + '`';

  // Completed-day window length.
  //   - rolling_upsert (Daily Sales): default = incrementalDefaultDays (1 = yesterday). A POST
  //     backfill_days override reads the last N completed days (capped at lookbackDays if set).
  //   - all other configs: legacy behaviour (lookbackDays, default 7) — full snapshot rewrite.
  var windowDays;
  if (config.writeMode === 'rolling_upsert') {
    var incDefault = (config.incrementalDefaultDays != null) ? config.incrementalDefaultDays : 1;
    var bf = (options.backfillDays != null) ? parseInt(options.backfillDays, 10) : 0;
    if (isNaN(bf) || bf <= 0) bf = 0;
    var cap = (config.lookbackDays != null) ? config.lookbackDays : bf;
    windowDays = bf > 0 ? Math.min(bf, cap || bf) : incDefault;
    if (windowDays < 1) windowDays = 1;
  } else {
    windowDays = (config.lookbackDays != null) ? config.lookbackDays : 7;
  }
  var excludeToday = (config.excludeToday === true);
  var tz = config.scheduleTimezone || 'Asia/Taipei';
  var dateF = '`' + config.dateField + '`';

  // Default: past N completed days (N = windowDays), EXCLUDING today (Asia/Taipei),
  // to avoid partial same-day Amazon data. windowDays=1 -> just yesterday (incremental daily).
  var startExpr = 'DATE_SUB(CURRENT_DATE("' + tz + '"), INTERVAL ' + windowDays + ' DAY)';
  var endExpr = excludeToday
    ? 'DATE_SUB(CURRENT_DATE("' + tz + '"), INTERVAL 1 DAY)'
    : 'CURRENT_DATE("' + tz + '")';
  var rollingSql = 'SELECT ' + cols.join(', ') + ' FROM ' + table +
    ' WHERE DATE(' + dateF + ') BETWEEN ' + startExpr + ' AND ' + endExpr;
  var rolling = amazonRunBigQuery_(config.sourceProjectId, rollingSql);
  if (rolling.rows.length) {
    rolling.isFallback = false;
    return rolling;
  }

  // Fallback: completed window empty → latest-available data PER GROUP (country/marketplace/channel/sku,
  // excluding the fixed marketplace + the date field). Each group gets its OWN N-completed-day window
  // ENDING ON that group's latest date (INTERVAL windowDays-1 DAY = N days inclusive). Never use one
  // global latest date; never fabricate rows; only return rows that exist.
  var groupFields = amazonGroupFields_(config);             // dest field names
  var groupSrc = groupFields.map(function (f) { return '`' + config.fieldMap[f] + '`'; });
  var tcols = cols.map(function (c) { return 't.' + c; });
  var groupSel = groupSrc.join(', ');
  var joinOn = groupSrc.map(function (g) { return 't.' + g + ' = l.' + g; }).join(' AND ');
  var fbSpan = (windowDays > 0 ? windowDays - 1 : 0);       // inclusive span ending on group latest
  var fallbackSql =
    'SELECT ' + tcols.join(', ') + ' FROM ' + table + ' t ' +
    'JOIN ( SELECT ' + groupSel + ', MAX(DATE(' + dateF + ')) AS __grp_latest FROM ' + table +
    ' GROUP BY ' + groupSel + ' ) l ON ' + joinOn +
    ' WHERE DATE(t.' + dateF + ') BETWEEN DATE_SUB(l.__grp_latest, INTERVAL ' + fbSpan + ' DAY) AND l.__grp_latest';
  var fb = amazonRunBigQuery_(config.sourceProjectId, fallbackSql);
  fb.isFallback = true;
  return fb;
}

/** Run a BigQuery SQL job, wait for completion, page through results → {headers, rows}. */
function amazonRunBigQuery_(projectId, sql) {
  var queryResults = BigQuery.Jobs.query({ query: sql, useLegacySql: false }, projectId);
  var jobId = queryResults.jobReference.jobId;
  var guard = 0;
  while (!queryResults.jobComplete && guard < 60) { Utilities.sleep(500); queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId); guard++; }

  var fields = (queryResults.schema && queryResults.schema.fields) ? queryResults.schema.fields : [];
  var headers = fields.map(function (f) { return f.name; });
  var rawRows = queryResults.rows || [];
  var pageToken = queryResults.pageToken;
  while (pageToken) {
    var more = BigQuery.Jobs.getQueryResults(projectId, jobId, { pageToken: pageToken });
    if (more.rows) rawRows = rawRows.concat(more.rows);
    pageToken = more.pageToken;
  }
  var rows = [];
  for (var i = 0; i < rawRows.length; i++) {
    var cells = rawRows[i].f || [];
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = cells[c] ? cells[c].v : null;
    obj.__rowNum = i + 1;
    rows.push(obj);
  }
  return { headers: headers, rows: rows };
}

