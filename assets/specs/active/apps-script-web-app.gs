// ========================================
// Kitchen Mama Operation System - Google Apps Script Web App
// Read + Write API for Google Sheet DB
// ========================================

/**
 * Main entry point for GET requests.
 * Supports actions: getOperationDb, getTable
 */
function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';

    if (action === 'getOperationDb') {
      return handleGetOperationDb_();
    }

    if (action === 'getTable') {
      var table = (e.parameter.table || '').trim();
      return handleGetTable_(table);
    }

    return jsonResponse_({ success: false, error: 'Missing or invalid action parameter. Use: getOperationDb or getTable' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}

/**
 * Main entry point for POST requests.
 * Supports actions: updateSkuLifecycle
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action || '';

    if (action === 'updateSkuLifecycle') {
      return handleUpdateSkuLifecycle_(body);
    }

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}

// ========================================
// Action Handlers
// ========================================

function handleGetOperationDb_() {
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines'];
  var data = {};

  validTabs.forEach(function(tabName) {
    try {
      var rows = readSheetAsObjects_(tabName);
      data[tabName] = filterRows_(tabName, rows);
    } catch (err) {
      Logger.log('Error reading tab ' + tabName + ': ' + err.message);
      data[tabName] = [];
    }
  });

  return jsonResponse_({ success: true, data: data });
}

function handleGetTable_(tableName) {
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines'];

  if (!tableName || validTabs.indexOf(tableName) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid table name. Valid tables: ' + validTabs.join(', ') });
  }

  var rows = readSheetAsObjects_(tableName);
  var filtered = filterRows_(tableName, rows);

  return jsonResponse_({ success: true, data: { table: tableName, rows: filtered } });
}

// ========================================
// Core: Read Sheet as Objects
// ========================================

/**
 * Reads a sheet tab and returns array of objects.
 * Uses first row as header. Does not depend on column order.
 * Skips completely empty rows.
 */
function readSheetAsObjects_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet tab not found: ' + sheetName);
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  // First row = headers
  var headers = data[0].map(function(h) {
    return String(h).trim().toLowerCase();
  });

  var results = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Skip completely empty rows
    var isEmpty = row.every(function(cell) {
      return cell === '' || cell === null || cell === undefined;
    });
    if (isEmpty) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (headers[j]) {
        obj[headers[j]] = formatValue_(row[j]);
      }
    }
    results.push(obj);
  }

  return results;
}

// ========================================
// Row Skip Rules
// ========================================

/**
 * Filters rows based on tab-specific skip rules.
 */
function filterRows_(tabName, rows) {
  if (!rows || rows.length === 0) return [];

  switch (tabName) {
    case 'sku_details':
      return rows.filter(function(r) {
        return r.sku && String(r.sku).trim() !== '';
      });

    case 'product_features':
      return rows.filter(function(r) {
        // Skip if feature_id is empty AND scope_type/scope_id are also empty
        var hasFeatureId = r.feature_id && String(r.feature_id).trim() !== '';
        var hasScopeType = r.scope_type && String(r.scope_type).trim() !== '';
        var hasScopeId = r.scope_id && String(r.scope_id).trim() !== '';
        return hasFeatureId || hasScopeType || hasScopeId;
      });

    case 'sku_handbook_summaries':
      return rows.filter(function(r) {
        // Skip if summary_id is empty AND sku is also empty
        var hasSummaryId = r.summary_id && String(r.summary_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasSummaryId || hasSku;
      });

    case 'campaigns':
      return rows.filter(function(r) {
        return r.campaign_id && String(r.campaign_id).trim() !== '';
      });

    case 'campaign_sku_lines':
      return rows.filter(function(r) {
        return r.campaign_sku_line_id && String(r.campaign_sku_line_id).trim() !== '';
      });

    default:
      return rows;
  }
}

// ========================================
// Helpers
// ========================================

/**
 * Formats cell values.
 * - Date objects → yyyy-MM-dd string
 * - null/undefined → empty string
 * - Others → as-is
 */
function formatValue_(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

/**
 * Returns a JSON response with proper content type.
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========================================
// POST Handlers
// ========================================

var VALID_LIFECYCLES_ = ['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other'];

/**
 * Updates lifecycle field for a single SKU in sku_details.
 */
function handleUpdateSkuLifecycle_(body) {
  var sku = String(body.sku || '').trim();
  var lifecycle = String(body.lifecycle || '').trim();

  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });
  if (!lifecycle) return jsonResponse_({ success: false, error: 'Missing lifecycle' });
  if (VALID_LIFECYCLES_.indexOf(lifecycle) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid lifecycle. Valid: ' + VALID_LIFECYCLES_.join(', ') });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('sku_details');
  if (!sheet) return jsonResponse_({ success: false, error: 'sku_details sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'Sheet is empty' });

  // Find column indices by header
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var skuCol = headers.indexOf('sku');
  var lifecycleCol = headers.indexOf('lifecycle');
  var updatedAtCol = headers.indexOf('updated_at');

  if (skuCol === -1) return jsonResponse_({ success: false, error: 'sku column not found in header' });
  if (lifecycleCol === -1) return jsonResponse_({ success: false, error: 'lifecycle column not found in header' });

  // Find the row with matching SKU
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][skuCol]).trim() === sku) {
      targetRow = i + 1; // Sheet rows are 1-indexed
      break;
    }
  }

  if (targetRow === -1) return jsonResponse_({ success: false, error: 'SKU not found: ' + sku });

  // Update lifecycle
  sheet.getRange(targetRow, lifecycleCol + 1).setValue(lifecycle);

  // Update updated_at if column exists
  if (updatedAtCol !== -1) {
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    sheet.getRange(targetRow, updatedAtCol + 1).setValue(now);
  }

  return jsonResponse_({
    success: true,
    data: { sku: sku, lifecycle: lifecycle }
  });
}
