// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 02_core_sheet_db.gs — Sheet DB helpers
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

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

    case 'marketplaces':
      return rows.filter(function(r) {
        var hasId = r.marketplace_id && String(r.marketplace_id).trim() !== '';
        var hasMp = r.marketplace && String(r.marketplace).trim() !== '';
        return hasId || hasMp;
      });

    case 'marketplace_skus':
      return rows.filter(function(r) {
        return r.sku && String(r.sku).trim() !== '';
      });

    case 'pricing_list':
      return rows.filter(function(r) {
        var hasPricingId = r.pricing_id && String(r.pricing_id).trim() !== '';
        var hasMpSkuId = r.marketplace_sku_id && String(r.marketplace_sku_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasPricingId || hasMpSkuId || hasSku;
      });

    case 'pricing_change_log':
      return rows.filter(function(r) {
        var hasLogId = r.log_id && String(r.log_id).trim() !== '';
        var hasPricingId = r.pricing_id && String(r.pricing_id).trim() !== '';
        return hasLogId || hasPricingId;
      });

    case 'fc_regular_forecast':
      return rows.filter(function(r) {
        var hasForecastId = r.forecast_id && String(r.forecast_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasForecastId || hasSku;
      });

    case 'factory_stock':
      return rows.filter(function(r) {
        var hasId = r.factory_stock_id && String(r.factory_stock_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasId || hasSku;
      });

    case 'factory_stock_movements':
      return rows.filter(function(r) {
        var hasId = r.movement_id && String(r.movement_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasId || hasSku;
      });

    case 'warehouses':
      return rows.filter(function(r) {
        var hasId = r.warehouse_id && String(r.warehouse_id).trim() !== '';
        var hasName = r.warehouse_name && String(r.warehouse_name).trim() !== '';
        return hasId || hasName;
      });

    case 'overseas_inventory_snapshot':
      return rows.filter(function(r) {
        var hasWh = r.warehouse_id && String(r.warehouse_id).trim() !== '';
        var hasSku = r.sku && String(r.sku).trim() !== '';
        return hasWh && hasSku;
      });

    case 'overseas_inventory_movements':
      return rows.filter(function(r) {
        var hasId = r.movement_id && String(r.movement_id).trim() !== '';
        var hasWh = r.warehouse_id && String(r.warehouse_id).trim() !== '';
        return hasId || hasWh;
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
