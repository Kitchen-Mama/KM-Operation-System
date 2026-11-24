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

  var tz = config.scheduleTimezone || 'Asia/Taipei';
  var dateF = '`' + config.dateField + '`';

  // Gap-aware rolling upsert. Production site_latest uses each site's own latest completed BQ date;
  // the legacy global calendar-window reader remains available for older configs only.
  if (config.writeMode === 'rolling_upsert') {
    if (config.windowMode === 'site_latest') return amazonReadDailySiteGapAware_(config, options, cols, table, tz, dateF);
    return amazonReadDailyGapAware_(config, options, cols, table, tz, dateF);
  }

  // Non-rolling BigQuery source (none today; defensive): a simple completed-day window, no fallback.
  var windowDays = (config.lookbackDays != null) ? config.lookbackDays : 7;
  var excludeToday = (config.excludeToday === true);
  var startExpr = 'DATE_SUB(CURRENT_DATE("' + tz + '"), INTERVAL ' + windowDays + ' DAY)';
  var endExpr = excludeToday
    ? 'DATE_SUB(CURRENT_DATE("' + tz + '"), INTERVAL 1 DAY)'
    : 'CURRENT_DATE("' + tz + '")';
  var sql = 'SELECT ' + cols.join(', ') + ' FROM ' + table +
    ' WHERE DATE(' + dateF + ') BETWEEN ' + startExpr + ' AND ' + endExpr;
  var res = amazonRunBigQuery_(config.sourceProjectId, sql);
  res.isFallback = false;
  return res;
}

// Site identity deliberately excludes SKU and channel. Their identities remain part of each row's natural key.
function amazonReadDailySiteGapAware_(config, options, cols, table, tz, dateF) {
  var fields = config.siteFields || ['country', 'marketplace'], fixed = config.fixedValues || {};
  var mapped = fields.filter(function (f) { return !fixed.hasOwnProperty(f); });
  if (!mapped.length || mapped.some(function (f) { return !config.fieldMap[f]; })) throw new Error('DAILY_SITE_FIELDS_INVALID');
  var days = config.retentionDays || 90, today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var recentN = config.reconcileRecentDays == null ? 3 : Math.max(0, config.reconcileRecentDays);
  var bf = Math.max(0, parseInt(options.backfillDays, 10) || 0);
  bf = Math.min(bf, config.lookbackDays || days, days);
  function expr(alias, f) { return 'TRIM(IFNULL(CAST(' + (alias ? alias + '.' : '') + '`' + config.fieldMap[f] + '` AS STRING), ""))'; }
  var aliases = mapped.map(function (f, i) { return 's' + i; });
  var projection = mapped.map(function (f, i) { return expr('', f) + ' AS ' + aliases[i]; });
  var identity = amazonGroupFields_(config).map(function (f, i) { return expr('r', f) + ' AS k' + i; });
  var sql = '/* amazon_daily_site_coverage_v1 */ WITH site_latest AS (SELECT ' + projection.join(', ') +
    ', MAX(DATE(' + dateF + ')) AS latest_date FROM ' + table +
    ' WHERE DATE(' + dateF + ') ' + (config.excludeToday === true ? '<' : '<=') + ' CURRENT_DATE("' + tz + '")' +
    mapped.map(function (f) { return ' AND ' + expr('', f) + ' != ""'; }).join('') +
    ' GROUP BY ' + aliases.join(', ') + ') SELECT ' + aliases.map(function (a) { return 'l.' + a; }).join(', ') +
    ', CAST(l.latest_date AS STRING) AS latest_date, CAST(DATE(r.' + dateF + ') AS STRING) AS d, COUNT(1) AS cnt,' +
    ' COUNT(DISTINCT TO_JSON_STRING(STRUCT(' + identity.join(', ') + '))) AS keycnt FROM ' + table + ' r JOIN site_latest l ON ' +
    mapped.map(function (f, i) { return expr('r', f) + ' = l.' + aliases[i]; }).join(' AND ') +
    ' WHERE DATE(r.' + dateF + ') BETWEEN DATE_SUB(l.latest_date, INTERVAL ' + (days - 1) + ' DAY) AND l.latest_date' +
    ' GROUP BY ' + aliases.map(function (a) { return 'l.' + a; }).join(', ') + ', l.latest_date, d';
  var coverage = amazonRunBigQuery_(config.sourceProjectId, sql), windows = {};
  coverage.rows.forEach(function (r) {
    var site = {}, end = String(r.latest_date || ''), date = String(r.d || '');
    fields.forEach(function (f) { site[f] = String(fixed.hasOwnProperty(f) ? fixed[f] : r[aliases[mapped.indexOf(f)]] || '').trim(); });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || end > today ||
        (config.excludeToday === true && end === today) || fields.some(function (f) { return !site[f]; })) throw new Error('DAILY_SITE_COVERAGE_INVALID');
    var key = amazonSiteKey_(fields, site), start = amazonAddDaysStr_(end, -(days - 1));
    if (date < start || date > end || (windows[key] && windows[key].end !== end)) throw new Error('DAILY_SITE_COVERAGE_INVALID');
    if (!windows[key]) windows[key] = { site: site, start: start, end: end, source: {} };
    windows[key].source[date] = { cnt: parseInt(r.cnt, 10) || 0, keycnt: parseInt(r.keycnt, 10) || 0 };
  });
  var destination = amazonReadDestSiteDateCoverage_(config, fields), keys = Object.keys(windows).sort();
  if (!keys.length) throw new Error('DAILY_SOURCE_NO_COMPLETED_SITE_DATA: existing snapshot preserved');
  var meta = { windowMode: 'site_latest', siteFields: fields.slice(), siteWindows: windows,
    retentionStart: '', retentionEnd: '', sourceAvailableDates: [], destExistingDates: [], missingDates: [], incompleteDates: [],
    recentReconciled: [], datesToFetch: [], sourceUnavailableDates: [], siteSummaries: [], sourceUnavailableSites: [] };
  keys.forEach(function (key) {
    var w = windows[key], dc = destination[key] ? destination[key].coverage : {}, dates = Object.keys(w.source).sort();
    w.missing = dates.filter(function (d) { return !dc[d]; });
    w.incomplete = dates.filter(function (d) { return dc[d] && (dc[d].dup > 0 || dc[d].keycnt < w.source[d].keycnt); });
    w.recent = recentN > 0 ? dates.slice(-recentN) : [];
    var requested = {};
    w.missing.concat(w.incomplete, w.recent).forEach(function (d) { requested[d] = true; });
    var unavailable = [];
    for (var n = 0; n < days; n++) {
      var d = amazonAddDaysStr_(w.start, n);
      if (!w.source[d]) unavailable.push(d);
      else if (bf > 0 && d >= amazonAddDaysStr_(w.end, -(bf - 1))) requested[d] = true;
    }
    w.datesToFetch = Object.keys(requested).sort();
    w.sourceUnavailableDates = unavailable;
    if (!meta.retentionStart || w.start < meta.retentionStart) meta.retentionStart = w.start;
    if (!meta.retentionEnd || w.end > meta.retentionEnd) meta.retentionEnd = w.end;
    meta.sourceAvailableDates = meta.sourceAvailableDates.concat(dates);
    meta.destExistingDates = meta.destExistingDates.concat(Object.keys(dc).filter(function (d) { return d >= w.start && d <= w.end; }));
    meta.missingDates = meta.missingDates.concat(w.missing); meta.incompleteDates = meta.incompleteDates.concat(w.incomplete);
    meta.recentReconciled = meta.recentReconciled.concat(w.recent); meta.datesToFetch = meta.datesToFetch.concat(w.datesToFetch);
    meta.sourceUnavailableDates = meta.sourceUnavailableDates.concat(unavailable);
    meta.siteSummaries.push({ site: w.site, start: w.start, end: w.end, data_age_days: amazonDateAgeDays_(w.end, today),
      source_dates: dates.length, missing_dates: w.missing.length, incomplete_dates: w.incomplete.length,
      fetched_dates: w.datesToFetch.length, unavailable_dates: unavailable.length });
  });
  Object.keys(destination).forEach(function (key) { if (!windows[key]) meta.sourceUnavailableSites.push(destination[key].site); });
  ['sourceAvailableDates', 'destExistingDates', 'missingDates', 'incompleteDates', 'recentReconciled', 'datesToFetch', 'sourceUnavailableDates'].forEach(function (p) {
    meta[p] = meta[p].filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
  });
  var headers = cols.map(function (c) { return c.replace(/`/g, ''); });
  var clauses = keys.filter(function (key) { return windows[key].datesToFetch.length > 0; }).map(function (key) {
    var w = windows[key];
    return '(' + mapped.map(function (f) { return expr('r', f) + ' = ' + JSON.stringify(w.site[f]); }).join(' AND ') +
      ' AND DATE(r.' + dateF + ') IN (' + w.datesToFetch.map(function (d) { return 'DATE("' + d + '")'; }).join(', ') + '))';
  });
  if (!clauses.length) return { headers: headers, rows: [], isFallback: false, rollingMeta: meta };
  var fetched = amazonRunBigQuery_(config.sourceProjectId, '/* amazon_daily_site_fetch_v1 */ SELECT ' +
    cols.map(function (c) { return 'r.' + c; }).join(', ') + ' FROM ' + table + ' r WHERE ' + clauses.join(' OR '));
  // Refuse a partial/mis-scoped source answer before the runner can prune or write any snapshot data.
  (fetched.rows || []).forEach(function (r) {
    var w = windows[amazonSiteKey_(fields, amazonSourceSite_(config, r))], d = amazonNormalizeDate_(r[config.dateField]);
    if (!w || !d.ok || w.datesToFetch.indexOf(d.value) < 0) throw new Error('DAILY_SITE_FETCH_OUTSIDE_WINDOW');
  });
  fetched.headers = fetched.headers && fetched.headers.length ? fetched.headers : headers;
  fetched.isFallback = false; fetched.rollingMeta = meta;
  return fetched;
}

function amazonReadDestSiteDateCoverage_(config, fields) {
  var ss = SpreadsheetApp.openById(config.destinationSpreadsheetId), sh = ss.getSheetByName(config.destinationSheetName);
  if (!sh) throw new Error('destination sheet not found: ' + config.destinationSheetName);
  var width = sh.getLastColumn(), height = sh.getLastRow(), out = {};
  if (width < 1) throw new Error('DAILY_DESTINATION_HEADERS_MISSING');
  var headers = sh.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); }), index = {};
  headers.forEach(function (h, i) { index[h] = i; });
  if (config.naturalKey.concat(fields).some(function (f) { return index[f] == null; })) throw new Error('DAILY_DESTINATION_HEADERS_MISSING');
  if (height < 2) return out;
  var rows = sh.getRange(2, 1, height - 1, width).getValues(), seen = {};
  rows.forEach(function (row) {
    var obj = {}; config.naturalKey.concat(fields).forEach(function (f) { obj[f] = row[index[f]]; });
    var nd = amazonNormalizeDate_(obj.snapshot_date); if (!nd.ok) return;
    obj.snapshot_date = nd.value;
    var key = amazonSiteKey_(fields, obj), d = nd.value;
    if (!out[key]) { var site = {}; fields.forEach(function (f) { site[f] = String(obj[f] == null ? '' : obj[f]).trim(); }); out[key] = { site: site, coverage: {} }; seen[key] = {}; }
    if (!out[key].coverage[d]) { out[key].coverage[d] = { cnt: 0, keycnt: 0, dup: 0 }; seen[key][d] = {}; }
    var cov = out[key].coverage[d], nk = amazonSiteKey_(config.naturalKey, obj); cov.cnt++;
    if (seen[key][d][nk]) cov.dup++; else { seen[key][d][nk] = true; cov.keycnt++; }
  });
  return out;
}

// ---- gap-aware daily rolling reader -------------------------------
//
// Canonical flow (task Section B):
//   compute the 90-completed-day retention window (Asia/Taipei; end=yesterday; inclusive)
//   → inspect BigQuery source coverage per date (row + distinct-natural-key counts)
//   → inspect destination coverage per date (row + distinct-key counts + duplicates)
//   → classify missing / incomplete dates (Section E: existence alone is NOT completeness)
//   → union with a recent-reconciliation window (late/revised data) + optional manual backfill_days
//   → fetch source rows ONLY for the dates that need recovery
//   → return rows + rollingMeta (the runner upserts by natural key and prunes < retention_start).
// Never fabricates rows; a calendar date with no source rows is reported source_unavailable (Section F).
function amazonReadDailyGapAware_(config, options, cols, table, tz, dateF) {
  var retentionDays = (config.retentionDays != null ? config.retentionDays : 90);
  var win = amazonRetentionWindow_(retentionDays, tz);           // { today, start, end, dates[] }
  var reconcileN = (config.reconcileRecentDays != null ? config.reconcileRecentDays : 3);

  // 1) source coverage per date, and 2) destination coverage per date (both within the window)
  var srcCov = amazonQuerySourceDateCoverage_(config, table, dateF, win.start, win.end); // {ymd:{cnt,keycnt}}
  var srcDates = Object.keys(srcCov).sort();
  var srcSet = {}; for (var s0 = 0; s0 < srcDates.length; s0++) srcSet[srcDates[s0]] = 1;
  var dstCov = amazonReadDestDateCoverage_(config, win.start, win.end);                  // {ymd:{cnt,keycnt,dup}}
  var dstDates = Object.keys(dstCov).sort();

  // 3) classify missing / incomplete (Section E: compare source vs destination distinct-key counts,
  //    and treat destination duplicates as incomplete → repaired by keyed upsert dedup).
  var missing = [], incomplete = [], dupDates = [];
  for (var i = 0; i < srcDates.length; i++) {
    var sd = srcDates[i], sc = srcCov[sd], dc = dstCov[sd];
    if (!dc) { missing.push(sd); continue; }
    if (dc.dup > 0) { incomplete.push(sd); dupDates.push(sd); continue; }
    if (dc.keycnt < sc.keycnt) incomplete.push(sd);
  }

  // recent reconciliation: always reconcile the most recent N source-available dates (absorbs
  // late-arriving / revised Amazon data without rewriting the whole window).
  var recent = srcDates.slice(Math.max(0, srcDates.length - reconcileN));

  // optional manual backfill_days: force the last N calendar dates of the window (capped at lookbackDays).
  var manual = [];
  var bf = (options && options.backfillDays != null) ? parseInt(options.backfillDays, 10) : 0;
  if (!isNaN(bf) && bf > 0) {
    var cap = (config.lookbackDays != null) ? config.lookbackDays : bf;
    bf = Math.min(bf, cap || bf);
    manual = win.dates.slice(Math.max(0, win.dates.length - bf));
  }

  // datesToFetch = (missing ∪ incomplete ∪ recent ∪ manual) ∩ source-available
  var fetchSet = {};
  [].concat(missing, incomplete, recent, manual).forEach(function (x) { if (srcSet[x]) fetchSet[x] = 1; });
  var datesToFetch = Object.keys(fetchSet).sort();

  // source_unavailable = calendar dates inside the window that the source does NOT have (report only;
  // never fabricated; re-checked on future runs while still inside the window).
  var srcUnavail = win.dates.filter(function (x) { return !srcSet[x]; });

  var rollingMeta = {
    retentionStart: win.start, retentionEnd: win.end,
    sourceAvailableDates: srcDates, destExistingDates: dstDates,
    missingDates: missing, incompleteDates: incomplete, duplicateKeyDates: dupDates,
    recentReconciled: recent.filter(function (x) { return srcSet[x]; }),
    datesToFetch: datesToFetch, sourceUnavailableDates: srcUnavail
  };

  var headers = cols.map(function (c) { return c.replace(/`/g, ''); });
  if (!datesToFetch.length) {
    // Nothing to recover — the runner still prunes expired rows and preserves the in-window data.
    return { headers: headers, rows: [], isFallback: false, rollingMeta: rollingMeta };
  }
  var inList = datesToFetch.map(function (x) { return 'DATE("' + x + '")'; }).join(', ');
  var sql = 'SELECT ' + cols.join(', ') + ' FROM ' + table +
    ' WHERE DATE(' + dateF + ') IN (' + inList + ')';
  var res = amazonRunBigQuery_(config.sourceProjectId, sql);
  res.isFallback = false;
  res.rollingMeta = rollingMeta;
  if (!res.headers || !res.headers.length) res.headers = headers; // guard for schema-less empty result
  return res;
}

// Source coverage within [start,end]: per date → { cnt (rows), keycnt (distinct natural key) }.
// Distinct key = the group fields (naturalKey minus the fixed marketplace + the date), mapped to source
// columns — equivalent to the destination's distinct natural key because marketplace is a constant.
function amazonQuerySourceDateCoverage_(config, table, dateF, start, end) {
  var groupFields = amazonGroupFields_(config);              // e.g. [country, channel, sku]
  var pieces = groupFields.map(function (f) { return 'IFNULL(CAST(`' + config.fieldMap[f] + '` AS STRING), "")'; });
  var concatArg = pieces.join(', "|", ');
  var sql = 'SELECT CAST(DATE(' + dateF + ') AS STRING) AS d, COUNT(1) AS cnt, ' +
    'COUNT(DISTINCT CONCAT(' + concatArg + ')) AS keycnt FROM ' + table +
    ' WHERE DATE(' + dateF + ') BETWEEN DATE("' + start + '") AND DATE("' + end + '") GROUP BY d';
  var res = amazonRunBigQuery_(config.sourceProjectId, sql);
  var cov = {};
  for (var i = 0; i < res.rows.length; i++) {
    var r = res.rows[i];
    var d = String(r.d == null ? '' : r.d).slice(0, 10);
    if (!d) continue;
    cov[d] = { cnt: parseInt(r.cnt, 10) || 0, keycnt: parseInt(r.keycnt, 10) || 0 };
  }
  return cov;
}

// Destination coverage within [start,end]: per snapshot_date → { cnt, keycnt (distinct), dup }.
// Read-only inspection of the destination sheet.
function amazonReadDestDateCoverage_(config, start, end) {
  var cov = {};
  var ss = SpreadsheetApp.openById(config.destinationSpreadsheetId);
  var sh = ss ? ss.getSheetByName(config.destinationSheetName) : null;
  if (!sh) return cov;
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return cov;
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var colIndex = {}; for (var c = 0; c < headers.length; c++) colIndex[headers[c]] = c;
  var dateCol = colIndex['snapshot_date'];
  if (dateCol == null) return cov;
  var keyCols = config.naturalKey
    .filter(function (k) { return k !== 'snapshot_date'; })
    .map(function (k) { return colIndex[String(k).toLowerCase()]; });
  var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var seenByDate = {};
  for (var i = 0; i < data.length; i++) {
    // Canonicalize the destination date cell (Date OR string) so an existing Date-typed row is NOT
    // mis-classified as missing (which forces a needless re-fetch → re-append). Same one normalizer.
    var ndv = amazonNormalizeDate_(data[i][dateCol]);
    var d = ndv.ok ? ndv.value : '';
    if (!d || d < start || d > end) continue;
    if (!cov[d]) { cov[d] = { cnt: 0, keycnt: 0, dup: 0 }; seenByDate[d] = {}; }
    cov[d].cnt++;
    var parts = [];
    for (var kc = 0; kc < keyCols.length; kc++) {
      var ci = keyCols[kc];
      parts.push(ci == null ? '' : String(data[i][ci] == null ? '' : data[i][ci]).trim());
    }
    var kk = parts.join('||');
    if (seenByDate[d][kk]) cov[d].dup++;
    else { seenByDate[d][kk] = 1; cov[d].keycnt++; }
  }
  return cov;
}

/** Run a BigQuery SQL job, wait for completion, page through results → {headers, rows}. */
function amazonRunBigQuery_(projectId, sql) {
  var queryResults = BigQuery.Jobs.query({ query: sql, useLegacySql: false }, projectId);
  var jobId = queryResults.jobReference.jobId;
  var guard = 0;
  while (!queryResults.jobComplete && guard < 60) { Utilities.sleep(500); queryResults = BigQuery.Jobs.getQueryResults(projectId, jobId); guard++; }
  if (!queryResults.jobComplete) throw new Error('BIGQUERY_JOB_NOT_COMPLETE: ' + jobId);

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

