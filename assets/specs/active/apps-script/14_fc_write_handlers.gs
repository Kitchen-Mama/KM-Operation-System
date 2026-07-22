// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 14_fc_write_handlers.gs — FC Summary write path (Phase 1)
//   Special Events (fc_special_events) + Target % Rules (fc_target_rules)
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER and REDEPLOY. No imports.
//
// Scope (Phase 1): read/write for fc_special_events + fc_target_rules ONLY.
//   Does NOT touch fc_regular_forecast (Edit Base FC / Add SKU / Import are Phase 2 / existing).
//   Tabs are auto-created with the documented header row on first WRITE (missing tab is [] on read).
//   Handlers: handleUpsertFcSpecialEvent_ / handleDeleteFcSpecialEvent_
//             handleUpsertFcTargetRule_   / handleDeleteFcTargetRule_
// ============================================================

// fc_special_events header. event_name / event_month / fc_qty are the task-defined columns;
// event_period + year are additional UI-continuity columns (FC Summary Event table shows/filters them).
// 2026-07-22 (ADDITIVE): campaign_id / campaign_sku_line_id link each event forecast back to its
//   parent campaign + campaign line (Special Event Builder writes campaigns → campaign_sku_lines →
//   fc_special_events); marketplace_id is the canonical marketplace identity (company-safe, since the
//   same marketplace NAME can belong to two companies); event_start_date / event_end_date are the
//   linked event-period snapshot (event_period kept as legacy/display; event_month = allocation month).
//   New columns are appended to an EXISTING sheet's header row by fcWriteEnsureColumns_ — never
//   renaming or dropping a live column (migration-safe, no redeploy assumption baked in).
var FC_SPECIAL_EVENTS_HEADERS_ = [
  'event_id', 'campaign_id', 'campaign_sku_line_id',
  'company', 'country', 'marketplace', 'marketplace_id', 'scope_type', 'scope_id',
  'sku', 'series', 'category', 'event_name',
  'event_period', 'event_start_date', 'event_end_date', 'event_month', 'year', 'fc_qty',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

// fc_target_rules header. scope_type / scope_id + jan_pct..dec_pct are the task-defined columns;
// year / category / series / sku are additional UI-continuity columns (Target table shows them and
// the effective-rule resolver matches on year + scope value).
var FC_TARGET_RULES_HEADERS_ = [
  'target_rule_id', 'company', 'country', 'marketplace', 'scope_type', 'scope_id',
  'year', 'category', 'series', 'sku', 'target_percentage',
  'jan_pct', 'feb_pct', 'mar_pct', 'apr_pct', 'may_pct', 'jun_pct',
  'jul_pct', 'aug_pct', 'sep_pct', 'oct_pct', 'nov_pct', 'dec_pct',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

function fcWriteTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

/** Get (or create with the documented header row) an FC write tab. */
function fcWriteEnsureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

/**
 * ADDITIVE column migration: ensure every header in `headers` exists in the live sheet's header row.
 * Missing headers are APPENDED to the end of row 1 (existing columns keep their position and data).
 * Never renames, reorders, or drops a live column. Safe to call on every write. Returns the count
 * of columns added. This is what lets new fields (campaign_id, marketplace_id, event_start_date, …)
 * persist on a sheet that predates them without a manual migration.
 */
function fcWriteEnsureColumns_(sheet, headers) {
  var lastCol = Math.max(1, sheet.getLastColumn());
  var live = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = [];
  headers.forEach(function (h) { if (h && live.indexOf(h) === -1 && missing.indexOf(h) === -1) missing.push(h); });
  if (!missing.length) return 0;
  sheet.getRange(1, live.length + 1, 1, missing.length).setValues([missing]);
  return missing.length;
}

/** Read a sheet as { headers, rows(values), col(name) }. */
function fcWriteReadSheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = (data[0] || []).map(function (h) { return String(h).trim(); });
  return {
    headers: headers,
    rows: data,
    col: function (n) { return headers.indexOf(n); }
  };
}

/** Append a row using the sheet's existing header row (writes only known columns). */
function fcWriteAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) {
    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {
      row[i] = obj[headers[i]];
    }
  }
  sheet.appendRow(row);
}

/**
 * Generic header-based upsert by id column. Updates the matching row's known columns (only keys
 * present in body that are also sheet headers), else appends a new row. Stamps created/updated meta.
 * Returns { id, created }.
 */
function fcWriteUpsert_(ss, sheetName, headers, idCol, idValue, body, actor) {
  var sheet = fcWriteEnsureSheet_(ss, sheetName, headers);
  fcWriteEnsureColumns_(sheet, headers);   // ADDITIVE: back-fill any new columns onto a pre-existing sheet
  var s = fcWriteReadSheet_(sheet);
  var now = fcWriteTimestamp_();
  var idColIdx = s.col(idCol);
  if (idColIdx === -1) throw new Error(idCol + ' column not found in ' + sheetName);

  // Locate existing row by id (when an id was supplied).
  var targetRow = -1;
  if (idValue) {
    for (var i = 1; i < s.rows.length; i++) {
      if (String(s.rows[i][idColIdx]).trim() === String(idValue).trim()) { targetRow = i + 1; break; }
    }
  }

  if (targetRow === -1) {
    // Create new.
    var newId = idValue || (sheetName + '-' + Utilities.getUuid().substring(0, 12).toUpperCase());
    var createObj = {};
    createObj[idCol] = newId;
    headers.forEach(function (h) {
      if (body.hasOwnProperty(h) && h !== idCol) createObj[h] = body[h];
    });
    createObj.created_by = actor;
    createObj.created_at = now;
    createObj.updated_by = actor;
    createObj.updated_at = now;
    fcWriteAppendByHeader_(sheet, createObj);
    return { id: newId, created: true };
  }

  // Update existing: only write columns present in body that are real headers (never the id / created_*).
  function setCell(name, value) { var c = s.col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }
  headers.forEach(function (h) {
    if (h === idCol || h === 'created_by' || h === 'created_at') return;
    if (body.hasOwnProperty(h)) setCell(h, body[h]);
  });
  setCell('updated_by', actor);
  setCell('updated_at', now);
  return { id: String(idValue).trim(), created: false };
}

/** Generic hard-delete by id column. Returns { id, deleted }. */
function fcWriteDelete_(ss, sheetName, idCol, idValue) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { id: idValue, deleted: false, reason: 'sheet_not_found' };
  var s = fcWriteReadSheet_(sheet);
  var idColIdx = s.col(idCol);
  if (idColIdx === -1) return { id: idValue, deleted: false, reason: 'id_column_missing' };
  for (var i = 1; i < s.rows.length; i++) {
    if (String(s.rows[i][idColIdx]).trim() === String(idValue).trim()) {
      sheet.deleteRow(i + 1);
      return { id: idValue, deleted: true };
    }
  }
  return { id: idValue, deleted: false, reason: 'not_found' };
}

// ---- fc_special_events ----

/**
 * Create/update a special event. Body: { event_id?, campaign_id?, campaign_sku_line_id?,
 * company, country, marketplace, marketplace_id?, scope_type?, scope_id?, sku, series?, category?,
 * event_name, event_period?, event_start_date?, event_end_date?, event_month?, year?, fc_qty, note?, actor? }
 * campaign_id / campaign_sku_line_id link the forecast to its parent campaign line (written first by
 * handleUpsertCampaign_ / handleUpsertCampaignSkuLines_). Idempotent by event_id.
 */
function handleUpsertFcSpecialEvent_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  if (!String(body.sku || '').trim() && !String(body.scope_id || '').trim()) {
    return jsonResponse_({ success: false, error: 'Missing sku / scope_id for special event' });
  }
  if (!String(body.event_name || '').trim()) {
    return jsonResponse_({ success: false, error: 'Missing event_name' });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;
  try {
    result = fcWriteUpsert_(ss, 'fc_special_events', FC_SPECIAL_EVENTS_HEADERS_, 'event_id',
      String(body.event_id || '').trim(), body, actor);
  } catch (e) {
    return jsonResponse_({ success: false, error: String(e && e.message ? e.message : e) });
  }
  return jsonResponse_({ success: true, data: result });
}

/** Delete a special event by event_id. Body: { event_id }. */
function handleDeleteFcSpecialEvent_(body) {
  var id = String((body && body.event_id) || '').trim();
  if (!id) return jsonResponse_({ success: false, error: 'Missing event_id' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonResponse_({ success: true, data: fcWriteDelete_(ss, 'fc_special_events', 'event_id', id) });
}

// ---- fc_target_rules ----

/**
 * Create/update a target % rule. Body: { target_rule_id?, company?, country?, marketplace?, scope_type,
 * scope_id, year?, category?, series?, sku?, target_percentage?, jan_pct..dec_pct, note?, actor? }
 */
function handleUpsertFcTargetRule_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  if (!String(body.scope_type || '').trim()) {
    return jsonResponse_({ success: false, error: 'Missing scope_type for target rule' });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;
  try {
    result = fcWriteUpsert_(ss, 'fc_target_rules', FC_TARGET_RULES_HEADERS_, 'target_rule_id',
      String(body.target_rule_id || '').trim(), body, actor);
  } catch (e) {
    return jsonResponse_({ success: false, error: String(e && e.message ? e.message : e) });
  }
  return jsonResponse_({ success: true, data: result });
}

/** Delete a target rule by target_rule_id. Body: { target_rule_id }. */
function handleDeleteFcTargetRule_(body) {
  var id = String((body && body.target_rule_id) || '').trim();
  if (!id) return jsonResponse_({ success: false, error: 'Missing target_rule_id' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return jsonResponse_({ success: true, data: fcWriteDelete_(ss, 'fc_target_rules', 'target_rule_id', id) });
}
