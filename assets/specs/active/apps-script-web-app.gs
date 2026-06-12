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

    if (action === 'upsertMarketplaceSku') {
      return handleUpsertMarketplaceSku_(body);
    }

    if (action === 'updateMarketplaceSkuModel') {
      return handleUpdateMarketplaceSkuModel_(body);
    }

    if (action === 'importMarketplaceSkusBatch') {
      return handleImportMarketplaceSkusBatch_(body);
    }

    if (action === 'upsertMarketplace') {
      return handleUpsertMarketplace_(body);
    }

    if (action === 'importFcRegularForecastBatch') {
      return handleImportFcRegularForecastBatch_(body);
    }

    if (action === 'importOverseasInventorySnapshotBatch') {
      return handleImportOverseasInventorySnapshotBatch_(body);
    }

    if (action === 'adjustOverseasInventory') {
      return handleAdjustOverseasInventory_(body);
    }

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch, upsertMarketplace, importFcRegularForecastBatch, importOverseasInventorySnapshotBatch, adjustOverseasInventory' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}

// ========================================
// Action Handlers
// ========================================

function handleGetOperationDb_() {
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements'];
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
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements'];

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


// ========================================
// marketplace_skus Write Handlers
// ========================================

var VALID_REPLENISHMENT_MODELS_ = ['sales_driven', 'forecast_driven'];
var VALID_MARKETPLACE_SKU_STATUSES_ = ['active', 'phasing_out', 'inactive', 'discontinued'];

/**
 * Upsert a marketplace_skus row.
 * Required: sku, country, marketplace
 * Optional: site_sku, asin, currency, regular_price, minimum_price, msrp, marketplace_sku_status, replenishment_model, launch_date
 */
function handleUpsertMarketplaceSku_(body) {
  var sku = String(body.sku || '').trim();
  var country = String(body.country || '').trim();
  var marketplace = String(body.marketplace || '').trim();

  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });
  if (!country) return jsonResponse_({ success: false, error: 'Missing country' });
  if (!marketplace) return jsonResponse_({ success: false, error: 'Missing marketplace' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('marketplace_skus');
  if (!sheet) return jsonResponse_({ success: false, error: 'marketplace_skus sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return jsonResponse_({ success: false, error: 'Sheet has no header row' });

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });

  var col = function(name) { return headers.indexOf(name); };

  // Check duplicate: country + marketplace + sku
  var skuCol = col('sku');
  var countryCol = col('country');
  var mpCol = col('marketplace');

  if (skuCol === -1 || countryCol === -1 || mpCol === -1) {
    return jsonResponse_({ success: false, error: 'Required columns (sku, country, marketplace) not found in header' });
  }

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][skuCol]).trim() === sku &&
        String(data[i][countryCol]).trim() === country &&
        String(data[i][mpCol]).trim() === marketplace) {
      return jsonResponse_({ success: false, error: 'Duplicate: ' + sku + ' already exists for ' + country + '-' + marketplace });
    }
  }

  // Build new row
  var newRow = new Array(headers.length).fill('');
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Generate ID
  var id = 'MPSKU-' + country + '-' + marketplace.substring(0, 3).toUpperCase() + '-' + sku + '-' + Date.now();

  if (col('marketplace_sku_id') !== -1) newRow[col('marketplace_sku_id')] = id;
  if (skuCol !== -1) newRow[skuCol] = sku;
  if (countryCol !== -1) newRow[countryCol] = country;
  if (mpCol !== -1) newRow[mpCol] = marketplace;
  if (col('site_sku') !== -1) newRow[col('site_sku')] = String(body.site_sku || '').trim();
  if (col('asin') !== -1) newRow[col('asin')] = String(body.asin || '').trim();
  if (col('currency') !== -1) newRow[col('currency')] = String(body.currency || 'USD').trim();
  if (col('regular_price') !== -1) newRow[col('regular_price')] = body.regular_price || '';
  if (col('minimum_price') !== -1) newRow[col('minimum_price')] = body.minimum_price || '';
  if (col('msrp') !== -1) newRow[col('msrp')] = body.msrp || '';
  if (col('marketplace_sku_status') !== -1) newRow[col('marketplace_sku_status')] = String(body.marketplace_sku_status || 'active').trim();
  if (col('replenishment_model') !== -1) newRow[col('replenishment_model')] = String(body.replenishment_model || 'sales_driven').trim();
  if (col('launch_date') !== -1) newRow[col('launch_date')] = String(body.launch_date || '').trim();
  if (col('created_at') !== -1) newRow[col('created_at')] = now;
  if (col('updated_at') !== -1) newRow[col('updated_at')] = now;

  sheet.appendRow(newRow);

  return jsonResponse_({
    success: true,
    data: { marketplace_sku_id: id, sku: sku, country: country, marketplace: marketplace }
  });
}

/**
 * Update replenishment_model, launch_date, marketplace_sku_status for a marketplace_skus row.
 * Matching: marketplace_sku_id (preferred) or country + marketplace + sku (fallback).
 */
function handleUpdateMarketplaceSkuModel_(body) {
  var id = String(body.marketplace_sku_id || '').trim();
  var sku = String(body.sku || '').trim();
  var country = String(body.country || '').trim();
  var marketplace = String(body.marketplace || '').trim();

  if (!id && (!sku || !country || !marketplace)) {
    return jsonResponse_({ success: false, error: 'Provide marketplace_sku_id or (sku + country + marketplace)' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('marketplace_skus');
  if (!sheet) return jsonResponse_({ success: false, error: 'marketplace_skus sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'Sheet is empty' });

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var col = function(name) { return headers.indexOf(name); };

  var idCol = col('marketplace_sku_id');
  var skuCol = col('sku');
  var countryCol = col('country');
  var mpCol = col('marketplace');

  // Find target row
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (id && idCol !== -1 && String(data[i][idCol]).trim() === id) {
      targetRow = i + 1;
      break;
    }
    if (!id && skuCol !== -1 && countryCol !== -1 && mpCol !== -1) {
      if (String(data[i][skuCol]).trim() === sku &&
          String(data[i][countryCol]).trim() === country &&
          String(data[i][mpCol]).trim() === marketplace) {
        targetRow = i + 1;
        break;
      }
    }
  }

  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Row not found' });

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Update allowed fields only
  if (body.replenishment_model !== undefined && col('replenishment_model') !== -1) {
    var model = String(body.replenishment_model).trim();
    if (VALID_REPLENISHMENT_MODELS_.indexOf(model) === -1) {
      return jsonResponse_({ success: false, error: 'Invalid replenishment_model. Valid: ' + VALID_REPLENISHMENT_MODELS_.join(', ') });
    }
    sheet.getRange(targetRow, col('replenishment_model') + 1).setValue(model);
  }

  if (body.launch_date !== undefined && col('launch_date') !== -1) {
    sheet.getRange(targetRow, col('launch_date') + 1).setValue(String(body.launch_date || '').trim());
  }

  if (body.marketplace_sku_status !== undefined && col('marketplace_sku_status') !== -1) {
    var status = String(body.marketplace_sku_status).trim();
    if (VALID_MARKETPLACE_SKU_STATUSES_.indexOf(status) === -1) {
      return jsonResponse_({ success: false, error: 'Invalid status. Valid: ' + VALID_MARKETPLACE_SKU_STATUSES_.join(', ') });
    }
    sheet.getRange(targetRow, col('marketplace_sku_status') + 1).setValue(status);
  }

  // Always update updated_at
  if (col('updated_at') !== -1) {
    sheet.getRange(targetRow, col('updated_at') + 1).setValue(now);
  }

  return jsonResponse_({
    success: true,
    data: { updated: true, row: targetRow }
  });
}


// ========================================
// Batch Import Handler (read-support tabs: marketplace_skus, pricing_list, fc_regular_forecast)
// ========================================

/**
 * Batch import marketplace SKUs.
 * For each row:
 *  - validate required fields + sku exists in sku_details
 *  - upsert marketplace_skus (by marketplace_sku_id, else company+country+marketplace+sku)
 *  - for NEW marketplace_skus rows: auto-create pricing_list + fc_regular_forecast base rows
 * Does NOT create Factory Stock or Request Order rows.
 * Does NOT overwrite existing pricing_list prices or fc_regular_forecast values.
 *
 * Header-based column lookup; does not depend on column order.
 * Returns row-level results.
 */
function handleImportMarketplaceSkusBatch_(body) {
  var rows = body.rows;
  if (!rows || !rows.length) {
    return jsonResponse_({ success: false, error: 'No rows provided' });
  }

  var options = body.options || {};
  var updateExisting = options.updateExisting !== false; // default true
  var priceStatusDefault = String(options.priceStatusDefault || 'draft').trim();
  var forecastStatusDefault = String(options.forecastStatusDefault || 'draft').trim();
  var createdBy = String(options.createdBy || 'import').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var skuSheet = ss.getSheetByName('sku_details');
  var mpSheet = ss.getSheetByName('marketplace_skus');
  var prSheet = ss.getSheetByName('pricing_list');
  var fcSheet = ss.getSheetByName('fc_regular_forecast');

  if (!skuSheet) return jsonResponse_({ success: false, error: 'sku_details sheet not found' });
  if (!mpSheet) return jsonResponse_({ success: false, error: 'marketplace_skus sheet not found' });
  if (!prSheet) return jsonResponse_({ success: false, error: 'pricing_list sheet not found' });
  if (!fcSheet) return jsonResponse_({ success: false, error: 'fc_regular_forecast sheet not found' });

  // --- sku_details: sku -> {category, series} ---
  var skuData = skuSheet.getDataRange().getValues();
  var skuHeaders = skuData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var sd_sku = skuHeaders.indexOf('sku');
  var sd_cat = skuHeaders.indexOf('category');
  var sd_ser = skuHeaders.indexOf('series');
  var sd_sell = skuHeaders.indexOf('selling_price');
  var sd_min = skuHeaders.indexOf('minimum_price');
  var sd_msrp = skuHeaders.indexOf('msrp');
  // ASIN lookup is OPTIONAL: prefer 'asin', fall back to 'amz_asin'; -1 means unavailable (no fail).
  var sd_asin = skuHeaders.indexOf('asin');
  if (sd_asin === -1) sd_asin = skuHeaders.indexOf('amz_asin');
  var skuMap = {};
  for (var i = 1; i < skuData.length; i++) {
    var s = String(skuData[i][sd_sku] || '').trim();
    if (s) {
      skuMap[s] = {
        category: sd_cat !== -1 ? String(skuData[i][sd_cat] || '').trim() : '',
        series: sd_ser !== -1 ? String(skuData[i][sd_ser] || '').trim() : '',
        sellingPrice: sd_sell !== -1 ? skuData[i][sd_sell] : '',
        minimumPrice: sd_min !== -1 ? skuData[i][sd_min] : '',
        msrp: sd_msrp !== -1 ? skuData[i][sd_msrp] : '',
        asin: sd_asin !== -1 ? String(skuData[i][sd_asin] || '').trim() : ''
      };
    }
  }

  // --- marketplace_skus: headers + existing keys ---
  var mpData = mpSheet.getDataRange().getValues();
  var mpHeaders = mpData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var mpCol = function(n) { return mpHeaders.indexOf(n); };
  var mp_id = mpCol('marketplace_sku_id'), mp_sku = mpCol('sku'),
      mp_company = mpCol('company'), mp_country = mpCol('country'), mp_mp = mpCol('marketplace'),
      mp_asin = mpCol('asin');
  var mpKeyToRow = {};
  var mpIdToRow = {};
  var mpAsinByComposite = {}; // company|country|marketplace|sku -> non-empty asin
  var mpAsinByIdSku = {};     // marketplace_id||sku -> non-empty asin
  for (var i = 1; i < mpData.length; i++) {
    var rowSku = mp_sku !== -1 ? String(mpData[i][mp_sku] || '').trim() : '';
    var ck = [
      mp_company !== -1 ? String(mpData[i][mp_company] || '').trim() : '',
      mp_country !== -1 ? String(mpData[i][mp_country] || '').trim() : '',
      mp_mp !== -1 ? String(mpData[i][mp_mp] || '').trim() : '',
      rowSku
    ].join('|');
    var existingId = mp_id !== -1 ? String(mpData[i][mp_id] || '').trim() : '';
    mpKeyToRow[ck] = { row: i + 1, id: existingId };
    if (existingId) mpIdToRow[existingId] = { row: i + 1, key: ck };
    // Capture existing non-empty ASINs for auto-resolution.
    var existingAsin = mp_asin !== -1 ? String(mpData[i][mp_asin] || '').trim() : '';
    if (existingAsin) {
      if (mpAsinByComposite[ck] === undefined) mpAsinByComposite[ck] = existingAsin;
      if (existingId && rowSku) mpAsinByIdSku[existingId + '||' + rowSku] = existingAsin;
    }
  }

  // --- pricing_list: headers + existing marketplace_sku_id set ---
  var prData = prSheet.getDataRange().getValues();
  var prHeaders = prData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var prCol = function(n) { return prHeaders.indexOf(n); };
  var pr_mpid = prCol('marketplace_sku_id');
  var pr_asin = prCol('asin');
  var pricingMpIds = {};
  var pricingByMpId = {}; // marketplace_sku_id -> { row, asin } for existing-row ASIN sync
  for (var i = 1; i < prData.length; i++) {
    if (pr_mpid !== -1) {
      var pv = String(prData[i][pr_mpid] || '').trim();
      if (pv) {
        pricingMpIds[pv] = true;
        if (pricingByMpId[pv] === undefined) {
          pricingByMpId[pv] = { row: i + 1, asin: pr_asin !== -1 ? String(prData[i][pr_asin] || '').trim() : '' };
        }
      }
    }
  }

  // --- fc_regular_forecast: headers + existing composite keys ---
  var fcData = fcSheet.getDataRange().getValues();
  var fcHeaders = fcData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var fcCol = function(n) { return fcHeaders.indexOf(n); };
  var fc_year = fcCol('year'), fc_company = fcCol('company'), fc_country = fcCol('country'),
      fc_mp = fcCol('marketplace'), fc_sku = fcCol('sku');
  var fcKeys = {};
  for (var i = 1; i < fcData.length; i++) {
    var fk0 = [
      fc_year !== -1 ? String(fcData[i][fc_year] || '').trim() : '',
      fc_company !== -1 ? String(fcData[i][fc_company] || '').trim() : '',
      fc_country !== -1 ? String(fcData[i][fc_country] || '').trim() : '',
      fc_mp !== -1 ? String(fcData[i][fc_mp] || '').trim() : '',
      fc_sku !== -1 ? String(fcData[i][fc_sku] || '').trim() : ''
    ].join('|');
    fcKeys[fk0] = true;
  }

  // --- Required-header validation (before any writes) ---
  // Header existence only; cell values (e.g. asin) may still be blank.
  var requiredHeaders = {
    sku_details: ['sku', 'category', 'series', 'selling_price', 'minimum_price', 'msrp'],
    marketplace_skus: ['marketplace_sku_id', 'marketplace_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'asin', 'currency', 'marketplace_sku_status', 'replenishment_model', 'launch_date', 'created_at', 'updated_at'],
    pricing_list: ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku', 'asin', 'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp', 'regular_price', 'minimum_price', 'msrp', 'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'],
    fc_regular_forecast: ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'category', 'series', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'total_fc', 'fc_share', 'forecast_status', 'source', 'created_at', 'updated_at']
  };
  var headerSets = {
    sku_details: skuHeaders,
    marketplace_skus: mpHeaders,
    pricing_list: prHeaders,
    fc_regular_forecast: fcHeaders
  };
  var missingHeaders = [];
  ['sku_details', 'marketplace_skus', 'pricing_list', 'fc_regular_forecast'].forEach(function(sheetName) {
    var hs = headerSets[sheetName];
    requiredHeaders[sheetName].forEach(function(h) {
      if (hs.indexOf(h) === -1) missingHeaders.push(sheetName + '.' + h);
    });
  });
  if (missingHeaders.length) {
    return jsonResponse_({ success: false, error: 'Missing required header(s): ' + missingHeaders.join(', ') });
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var currentYear = String(new Date().getFullYear());
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // --- marketplaces registry: resolve marketplace_id by company|country|marketplace (optional) ---
  var mpRegistryMap = {};
  var mktSheet = ss.getSheetByName('marketplaces');
  if (mktSheet) {
    var mktData = mktSheet.getDataRange().getValues();
    if (mktData.length >= 2) {
      var mktHeaders = mktData[0].map(function(h) { return String(h).trim().toLowerCase(); });
      var mk_id = mktHeaders.indexOf('marketplace_id');
      var mk_company = mktHeaders.indexOf('company');
      var mk_country = mktHeaders.indexOf('country');
      var mk_mp = mktHeaders.indexOf('marketplace');
      for (var mki = 1; mki < mktData.length; mki++) {
        var mkKey = [
          mk_company !== -1 ? String(mktData[mki][mk_company] || '').trim() : '',
          mk_country !== -1 ? String(mktData[mki][mk_country] || '').trim() : '',
          mk_mp !== -1 ? String(mktData[mki][mk_mp] || '').trim() : ''
        ].join('|');
        var mkId = mk_id !== -1 ? String(mktData[mki][mk_id] || '').trim() : '';
        if (mkId) mpRegistryMap[mkKey] = mkId;
      }
    }
  }

  var results = [];
  var batchProcessed = {};

  for (var idx = 0; idx < rows.length; idx++) {
    var row = rows[idx] || {};
    var rowIndex = idx + 1;
    var sku = String(row.sku || '').trim();
    var company = String(row.company || '').trim();
    var country = String(row.country || '').trim();
    var marketplace = String(row.marketplace || '').trim();
    var siteSku = String(row.site_sku || '').trim();
    var currency = String(row.currency || '').trim();

    // Required fields
    var missing = [];
    if (!sku) missing.push('sku');
    if (!company) missing.push('company');
    if (!country) missing.push('country');
    if (!marketplace) missing.push('marketplace');
    if (!siteSku) missing.push('site_sku');
    if (!currency) missing.push('currency');
    if (missing.length) {
      results.push({ rowIndex: rowIndex, sku: sku, status: 'error', message: 'Missing required: ' + missing.join(', '), marketplace_sku_id: '', pricing_id: '', forecast_id: '' });
      continue;
    }

    // sku must exist in sku_details
    if (!skuMap[sku]) {
      results.push({ rowIndex: rowIndex, sku: sku, status: 'error', message: 'SKU not found in sku_details', marketplace_sku_id: '', pricing_id: '', forecast_id: '' });
      continue;
    }

    var compositeKey = [company, country, marketplace, sku].join('|');

    // Duplicate within this batch
    if (batchProcessed[compositeKey]) {
      results.push({ rowIndex: rowIndex, sku: sku, status: 'skipped', message: 'Duplicate row in batch', marketplace_sku_id: '', pricing_id: '', forecast_id: '' });
      continue;
    }
    batchProcessed[compositeKey] = true;

    // Auto-resolve ASIN (user no longer supplies it):
    //   A) row.asin if provided (back-compat), B) existing by marketplace_id+sku,
    //   C) existing by company+country+marketplace+sku, D) sku_details.asin, E) blank.
    var rowMpIdForAsin = String(row.marketplace_id || '').trim() || mpRegistryMap[[company, country, marketplace].join('|')] || '';
    var resolvedAsin = String(row.asin || '').trim();
    if (!resolvedAsin && rowMpIdForAsin && mpAsinByIdSku[rowMpIdForAsin + '||' + sku]) resolvedAsin = mpAsinByIdSku[rowMpIdForAsin + '||' + sku];
    if (!resolvedAsin && mpAsinByComposite[compositeKey]) resolvedAsin = mpAsinByComposite[compositeKey];
    if (!resolvedAsin && skuMap[sku] && skuMap[sku].asin) resolvedAsin = skuMap[sku].asin;

    // Determine existing marketplace_skus row
    var providedId = String(row.marketplace_sku_id || '').trim();
    var existing = null;
    if (providedId && mpIdToRow[providedId]) existing = mpIdToRow[providedId];
    else if (mpKeyToRow[compositeKey]) existing = mpKeyToRow[compositeKey];

    // ---- Existing: update allowed marketplace fields only (no pricing/forecast change) ----
    if (existing) {
      if (!updateExisting) {
        results.push({ rowIndex: rowIndex, sku: sku, status: 'skipped', message: 'Already exists; update disabled', marketplace_sku_id: existing.id || providedId, pricing_id: '', forecast_id: '' });
        continue;
      }
      var trow = existing.row;
      if (mpCol('site_sku') !== -1) mpSheet.getRange(trow, mpCol('site_sku') + 1).setValue(siteSku);
      // ASIN: only write when we resolved a non-empty value — never clear an existing ASIN with blank.
      if (resolvedAsin && mpCol('asin') !== -1) mpSheet.getRange(trow, mpCol('asin') + 1).setValue(resolvedAsin);
      if (mpCol('currency') !== -1) mpSheet.getRange(trow, mpCol('currency') + 1).setValue(currency);
      if (row.marketplace_sku_status !== undefined && mpCol('marketplace_sku_status') !== -1) mpSheet.getRange(trow, mpCol('marketplace_sku_status') + 1).setValue(String(row.marketplace_sku_status).trim());
      if (row.replenishment_model !== undefined && mpCol('replenishment_model') !== -1) mpSheet.getRange(trow, mpCol('replenishment_model') + 1).setValue(String(row.replenishment_model).trim());
      if (row.launch_date !== undefined && mpCol('launch_date') !== -1) mpSheet.getRange(trow, mpCol('launch_date') + 1).setValue(String(row.launch_date).trim());
      if (mpCol('updated_at') !== -1) mpSheet.getRange(trow, mpCol('updated_at') + 1).setValue(now);

      // Sync resolved ASIN to the matching pricing_list row (by marketplace_sku_id), when safe.
      // Only touches asin (+ metadata); never clears, never touches prices.
      var existingMpSkuId = existing.id || providedId;
      var asinSynced = false;
      if (resolvedAsin && existingMpSkuId && pricingByMpId[existingMpSkuId] && pr_asin !== -1) {
        var prRef = pricingByMpId[existingMpSkuId];
        if (prRef.asin !== resolvedAsin) {
          prSheet.getRange(prRef.row, pr_asin + 1).setValue(resolvedAsin);
          if (prCol('updated_at') !== -1) prSheet.getRange(prRef.row, prCol('updated_at') + 1).setValue(now);
          if (prCol('updated_by') !== -1) prSheet.getRange(prRef.row, prCol('updated_by') + 1).setValue(createdBy);
          prRef.asin = resolvedAsin;
          asinSynced = true;
        }
      }

      results.push({ rowIndex: rowIndex, sku: sku, status: 'updated', message: 'marketplace_skus updated' + (asinSynced ? ' + pricing_list ASIN synced' : '') + ' (prices untouched)', marketplace_sku_id: existingMpSkuId, pricing_id: '', forecast_id: '' });
      continue;
    }

    // ---- New: create marketplace_skus + pricing_list + fc_regular_forecast ----
    var mpId = providedId || ('MPSKU-' + country + '-' + marketplace.substring(0, 3).toUpperCase() + '-' + sku + '-' + Utilities.getUuid().substring(0, 6));

    // Resolve marketplace_id: use provided value, else look up registry by company|country|marketplace.
    var resolvedMarketplaceId = String(row.marketplace_id || '').trim() || mpRegistryMap[[company, country, marketplace].join('|')] || '';

    var newMp = new Array(mpHeaders.length).fill('');
    if (mpCol('marketplace_sku_id') !== -1) newMp[mpCol('marketplace_sku_id')] = mpId;
    if (mpCol('marketplace_id') !== -1) newMp[mpCol('marketplace_id')] = resolvedMarketplaceId;
    if (mpCol('sku') !== -1) newMp[mpCol('sku')] = sku;
    if (mpCol('company') !== -1) newMp[mpCol('company')] = company;
    if (mpCol('country') !== -1) newMp[mpCol('country')] = country;
    if (mpCol('marketplace') !== -1) newMp[mpCol('marketplace')] = marketplace;
    if (mpCol('site_sku') !== -1) newMp[mpCol('site_sku')] = siteSku;
    if (mpCol('asin') !== -1) newMp[mpCol('asin')] = resolvedAsin;
    if (mpCol('currency') !== -1) newMp[mpCol('currency')] = currency;
    if (mpCol('marketplace_sku_status') !== -1) newMp[mpCol('marketplace_sku_status')] = String(row.marketplace_sku_status || 'active').trim();
    if (mpCol('replenishment_model') !== -1) newMp[mpCol('replenishment_model')] = String(row.replenishment_model || 'sales_driven').trim();
    if (mpCol('launch_date') !== -1) newMp[mpCol('launch_date')] = String(row.launch_date || '').trim();
    if (mpCol('created_at') !== -1) newMp[mpCol('created_at')] = now;
    if (mpCol('updated_at') !== -1) newMp[mpCol('updated_at')] = now;
    mpSheet.appendRow(newMp);
    mpKeyToRow[compositeKey] = { row: -1, id: mpId };
    mpIdToRow[mpId] = { row: -1, key: compositeKey };

    // pricing_list (create if missing; never overwrite existing)
    var pricingId = '';
    if (!pricingMpIds[mpId]) {
      pricingId = 'PRC-' + Utilities.getUuid().substring(0, 8);

      // Did the import row supply any pricing? If not, auto-generate from sku_details (MVP, fx_rate = 1).
      var rowProvidesPricing = (row.base_regular_price !== undefined || row.base_minimum_price !== undefined ||
                                row.base_msrp !== undefined || row.regular_price !== undefined ||
                                row.minimum_price !== undefined || row.msrp !== undefined);

      var sdRef = skuMap[sku] || {};
      var priceSource, priceStatus, priceNote, baseCurrency;
      var baseRegular, baseMinimum, baseMsrp, fxRate, fxRateDate;
      var autoRegular, autoMinimum, autoMsrp, effRegular, effMinimum, effMsrp;

      if (rowProvidesPricing) {
        // Import-provided pricing (existing behavior preserved).
        priceSource = 'import';
        priceStatus = priceStatusDefault;
        priceNote = '';
        baseCurrency = String(row.base_currency || '').trim();
        baseRegular = (row.base_regular_price !== undefined ? row.base_regular_price : '');
        baseMinimum = (row.base_minimum_price !== undefined ? row.base_minimum_price : '');
        baseMsrp = (row.base_msrp !== undefined ? row.base_msrp : '');
        fxRate = (row.fx_rate !== undefined ? row.fx_rate : '');
        fxRateDate = String(row.fx_rate_date || '').trim();
        autoRegular = (row.auto_regular_price !== undefined ? row.auto_regular_price : '');
        autoMinimum = (row.auto_minimum_price !== undefined ? row.auto_minimum_price : '');
        autoMsrp = (row.auto_msrp !== undefined ? row.auto_msrp : '');
        effRegular = (row.regular_price !== undefined ? row.regular_price : '');
        effMinimum = (row.minimum_price !== undefined ? row.minimum_price : '');
        effMsrp = (row.msrp !== undefined ? row.msrp : '');
      } else {
        // MVP fallback: derive base prices from sku_details. No real FX; fx_rate = 1.
        priceSource = 'auto_from_sku_details';
        priceStatus = 'draft';
        priceNote = 'MVP auto-generated from sku_details. FX review required.';
        baseCurrency = String(row.base_currency || 'USD').trim();
        baseRegular = (sdRef.sellingPrice !== undefined ? sdRef.sellingPrice : '');
        baseMinimum = (sdRef.minimumPrice !== undefined ? sdRef.minimumPrice : '');
        baseMsrp = (sdRef.msrp !== undefined ? sdRef.msrp : '');
        fxRate = 1;
        fxRateDate = now;
        autoRegular = baseRegular;
        autoMinimum = baseMinimum;
        autoMsrp = baseMsrp;
        effRegular = autoRegular;
        effMinimum = autoMinimum;
        effMsrp = autoMsrp;
      }

      var newPr = new Array(prHeaders.length).fill('');
      if (prCol('pricing_id') !== -1) newPr[prCol('pricing_id')] = pricingId;
      if (prCol('marketplace_sku_id') !== -1) newPr[prCol('marketplace_sku_id')] = mpId;
      if (prCol('marketplace_id') !== -1) newPr[prCol('marketplace_id')] = resolvedMarketplaceId;
      if (prCol('company') !== -1) newPr[prCol('company')] = company;
      if (prCol('sku') !== -1) newPr[prCol('sku')] = sku;
      if (prCol('country') !== -1) newPr[prCol('country')] = country;
      if (prCol('marketplace') !== -1) newPr[prCol('marketplace')] = marketplace;
      if (prCol('site_sku') !== -1) newPr[prCol('site_sku')] = siteSku;
      if (prCol('asin') !== -1) newPr[prCol('asin')] = resolvedAsin;
      if (prCol('currency') !== -1) newPr[prCol('currency')] = currency;
      if (prCol('base_currency') !== -1) newPr[prCol('base_currency')] = baseCurrency;
      if (prCol('base_regular_price') !== -1) newPr[prCol('base_regular_price')] = baseRegular;
      if (prCol('base_minimum_price') !== -1) newPr[prCol('base_minimum_price')] = baseMinimum;
      if (prCol('base_msrp') !== -1) newPr[prCol('base_msrp')] = baseMsrp;
      if (prCol('fx_rate') !== -1) newPr[prCol('fx_rate')] = fxRate;
      if (prCol('fx_rate_date') !== -1) newPr[prCol('fx_rate_date')] = fxRateDate;
      if (prCol('auto_regular_price') !== -1) newPr[prCol('auto_regular_price')] = autoRegular;
      if (prCol('auto_minimum_price') !== -1) newPr[prCol('auto_minimum_price')] = autoMinimum;
      if (prCol('auto_msrp') !== -1) newPr[prCol('auto_msrp')] = autoMsrp;
      if (prCol('regular_price') !== -1) newPr[prCol('regular_price')] = effRegular;
      if (prCol('minimum_price') !== -1) newPr[prCol('minimum_price')] = effMinimum;
      if (prCol('msrp') !== -1) newPr[prCol('msrp')] = effMsrp;
      if (prCol('price_source') !== -1) newPr[prCol('price_source')] = priceSource;
      if (prCol('price_status') !== -1) newPr[prCol('price_status')] = priceStatus;
      if (prCol('note') !== -1) newPr[prCol('note')] = priceNote;
      if (prCol('created_by') !== -1) newPr[prCol('created_by')] = createdBy;
      if (prCol('created_at') !== -1) newPr[prCol('created_at')] = now;
      if (prCol('updated_by') !== -1) newPr[prCol('updated_by')] = createdBy;
      if (prCol('updated_at') !== -1) newPr[prCol('updated_at')] = now;
      prSheet.appendRow(newPr);
      pricingMpIds[mpId] = true;
    }

    // fc_regular_forecast (create if missing for current year; never overwrite existing)
    var forecastId = '';
    var fk = [currentYear, company, country, marketplace, sku].join('|');
    if (!fcKeys[fk]) {
      forecastId = 'FC-' + currentYear + '-' + Utilities.getUuid().substring(0, 8);
      var newFc = new Array(fcHeaders.length).fill('');
      if (fcCol('forecast_id') !== -1) newFc[fcCol('forecast_id')] = forecastId;
      if (fcCol('year') !== -1) newFc[fcCol('year')] = currentYear;
      if (fcCol('company') !== -1) newFc[fcCol('company')] = company;
      if (fcCol('country') !== -1) newFc[fcCol('country')] = country;
      if (fcCol('marketplace') !== -1) newFc[fcCol('marketplace')] = marketplace;
      if (fcCol('sku') !== -1) newFc[fcCol('sku')] = sku;
      if (fcCol('category') !== -1) newFc[fcCol('category')] = skuMap[sku].category;
      if (fcCol('series') !== -1) newFc[fcCol('series')] = skuMap[sku].series;
      for (var m = 0; m < months.length; m++) {
        if (fcCol(months[m]) !== -1) newFc[fcCol(months[m])] = 0;
      }
      if (fcCol('total_fc') !== -1) newFc[fcCol('total_fc')] = 0;
      if (fcCol('fc_share') !== -1) newFc[fcCol('fc_share')] = '';
      if (fcCol('forecast_status') !== -1) newFc[fcCol('forecast_status')] = forecastStatusDefault;
      if (fcCol('source') !== -1) newFc[fcCol('source')] = 'system_auto';
      if (fcCol('created_at') !== -1) newFc[fcCol('created_at')] = now;
      if (fcCol('updated_at') !== -1) newFc[fcCol('updated_at')] = now;
      fcSheet.appendRow(newFc);
      fcKeys[fk] = true;
    }

    results.push({
      rowIndex: rowIndex,
      sku: sku,
      status: 'created',
      message: 'Created marketplace_sku' + (pricingId ? ' + pricing_list' : '') + (forecastId ? ' + fc_regular_forecast' : ''),
      marketplace_sku_id: mpId,
      pricing_id: pricingId,
      forecast_id: forecastId
    });
  }

  var summary = { total: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  results.forEach(function(r) { if (summary[r.status] !== undefined) summary[r.status]++; });

  return jsonResponse_({ success: true, data: { summary: summary, results: results, year: currentYear } });
}


// ========================================
// marketplaces Write Handler (sales-channel registry)
// ========================================

function normalizeMarketplaceIdPart_(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, '_');
}

/**
 * Upsert a marketplaces (sales-channel registry) row.
 * Required: company, country, marketplace, currency.
 * Upsert key: company + country + marketplace.
 * marketplace_id generated if missing: MKT-{COMPANY}-{COUNTRY}-{MARKETPLACE} (uppercase, spaces -> underscore).
 * Does NOT write marketplace_skus. Header-based column lookup.
 */
function handleUpsertMarketplace_(body) {
  var company = String(body.company || '').trim();
  var country = String(body.country || '').trim();
  var marketplace = String(body.marketplace || '').trim();
  var currency = String(body.currency || '').trim();

  if (!company) return jsonResponse_({ success: false, error: 'Missing company' });
  if (!country) return jsonResponse_({ success: false, error: 'Missing country' });
  if (!marketplace) return jsonResponse_({ success: false, error: 'Missing marketplace' });
  if (!currency) return jsonResponse_({ success: false, error: 'Missing currency' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('marketplaces');
  if (!sheet) return jsonResponse_({ success: false, error: 'marketplaces sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return jsonResponse_({ success: false, error: 'marketplaces sheet has no header row' });

  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var col = function(n) { return headers.indexOf(n); };

  var companyCol = col('company'), countryCol = col('country'), mpCol = col('marketplace');
  if (companyCol === -1 || countryCol === -1 || mpCol === -1) {
    return jsonResponse_({ success: false, error: 'Required columns (company, country, marketplace) not found in marketplaces header' });
  }

  var displayName = String(body.marketplace_display_name || '').trim() || marketplace;
  var status = String(body.status || 'active').trim();
  var updatedBy = String(body.updated_by || 'operation-system').trim();
  var note = body.note !== undefined ? String(body.note).trim() : '';
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Find existing by company + country + marketplace
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][companyCol]).trim() === company &&
        String(data[i][countryCol]).trim() === country &&
        String(data[i][mpCol]).trim() === marketplace) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow !== -1) {
    // Update existing: display_name, currency, status, (note), updated_by, updated_at
    if (col('marketplace_display_name') !== -1) sheet.getRange(targetRow, col('marketplace_display_name') + 1).setValue(displayName);
    if (col('currency') !== -1) sheet.getRange(targetRow, col('currency') + 1).setValue(currency);
    if (col('status') !== -1) sheet.getRange(targetRow, col('status') + 1).setValue(status);
    if (body.note !== undefined && col('note') !== -1) sheet.getRange(targetRow, col('note') + 1).setValue(note);
    if (col('updated_by') !== -1) sheet.getRange(targetRow, col('updated_by') + 1).setValue(updatedBy);
    if (col('updated_at') !== -1) sheet.getRange(targetRow, col('updated_at') + 1).setValue(now);

    var existingId = col('marketplace_id') !== -1 ? String(data[targetRow - 1][col('marketplace_id')] || '').trim() : '';
    return jsonResponse_({ success: true, data: { marketplace_id: existingId, status: 'updated', company: company, country: country, marketplace: marketplace } });
  }

  // Create new
  var id = 'MKT-' + normalizeMarketplaceIdPart_(company) + '-' + normalizeMarketplaceIdPart_(country) + '-' + normalizeMarketplaceIdPart_(marketplace);
  var newRow = new Array(headers.length).fill('');
  if (col('marketplace_id') !== -1) newRow[col('marketplace_id')] = id;
  newRow[companyCol] = company;
  newRow[countryCol] = country;
  newRow[mpCol] = marketplace;
  if (col('marketplace_display_name') !== -1) newRow[col('marketplace_display_name')] = displayName;
  if (col('currency') !== -1) newRow[col('currency')] = currency;
  if (col('status') !== -1) newRow[col('status')] = status;
  if (col('created_by') !== -1) newRow[col('created_by')] = updatedBy;
  if (col('created_at') !== -1) newRow[col('created_at')] = now;
  if (col('updated_by') !== -1) newRow[col('updated_by')] = updatedBy;
  if (col('updated_at') !== -1) newRow[col('updated_at')] = now;
  if (col('note') !== -1) newRow[col('note')] = note;
  sheet.appendRow(newRow);

  return jsonResponse_({ success: true, data: { marketplace_id: id, status: 'created', company: company, country: country, marketplace: marketplace } });
}


// ========================================
// FC Regular Forecast Batch Import Handler
// ========================================

/**
 * Batch import / upsert fc_regular_forecast rows.
 * company/country/marketplace/year are supplied by the frontend modal (resolved from the
 * marketplaces registry) — NOT from the CSV. CSV carries only sku + jan..dec.
 *
 * Business key: year + company + country + marketplace + sku.
 * - Existing key  -> update months/category/series/total_fc/source/updated_at; preserve forecast_id.
 *                    forecast_status updated only if existing blank or options.overwriteStatus === true.
 * - New key       -> create with forecast_id = FC-{year}-{8 lowercase hex}.
 * Header-validated before any write. Does NOT touch fc_special_events / fc_target_rules.
 */
function handleImportFcRegularForecastBatch_(body) {
  var rows = body.rows;
  if (!rows || !rows.length) {
    return jsonResponse_({ success: false, error: 'No rows provided' });
  }

  var options = body.options || {};
  var forecastStatusDefault = String(options.forecastStatusDefault || 'draft').trim();
  var sourceDefault = String(options.sourceDefault || 'import').trim();
  var overwriteStatus = options.overwriteStatus === true;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var fcSheet = ss.getSheetByName('fc_regular_forecast');
  var skuSheet = ss.getSheetByName('sku_details');
  if (!fcSheet) return jsonResponse_({ success: false, error: 'fc_regular_forecast sheet not found' });
  if (!skuSheet) return jsonResponse_({ success: false, error: 'sku_details sheet not found' });

  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  var fcData = fcSheet.getDataRange().getValues();
  var fcHeaders = fcData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var fcCol = function(n) { return fcHeaders.indexOf(n); };

  var skuData = skuSheet.getDataRange().getValues();
  var skuHeaders = skuData[0].map(function(h) { return String(h).trim().toLowerCase(); });

  // --- Required-header validation (before any writes) ---
  var requiredFc = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'category', 'series']
    .concat(months)
    .concat(['total_fc', 'fc_share', 'forecast_status', 'source', 'created_at', 'updated_at']);
  var requiredSku = ['sku', 'category', 'series'];
  var missingHeaders = [];
  requiredFc.forEach(function(h) { if (fcHeaders.indexOf(h) === -1) missingHeaders.push('fc_regular_forecast.' + h); });
  requiredSku.forEach(function(h) { if (skuHeaders.indexOf(h) === -1) missingHeaders.push('sku_details.' + h); });
  if (missingHeaders.length) {
    return jsonResponse_({ success: false, error: 'Missing required header(s): ' + missingHeaders.join(', ') });
  }

  // --- sku_details: sku -> {category, series} ---
  var sd_sku = skuHeaders.indexOf('sku'), sd_cat = skuHeaders.indexOf('category'), sd_ser = skuHeaders.indexOf('series');
  var skuMap = {};
  for (var i = 1; i < skuData.length; i++) {
    var s = String(skuData[i][sd_sku] || '').trim();
    if (s) skuMap[s] = { category: String(skuData[i][sd_cat] || '').trim(), series: String(skuData[i][sd_ser] || '').trim() };
  }

  // --- existing fc_regular_forecast business-key map ---
  var bk = function(y, co, cn, mp, sk) { return [y, co, cn, mp, sk].join('|'); };
  var bkToRow = {};
  for (var r = 1; r < fcData.length; r++) {
    var rsku = String(fcData[r][fcCol('sku')] || '').trim();
    if (!rsku) continue;
    var key0 = bk(
      String(fcData[r][fcCol('year')] || '').trim(),
      String(fcData[r][fcCol('company')] || '').trim(),
      String(fcData[r][fcCol('country')] || '').trim(),
      String(fcData[r][fcCol('marketplace')] || '').trim(),
      rsku
    );
    bkToRow[key0] = {
      row: r + 1,
      forecastId: String(fcData[r][fcCol('forecast_id')] || '').trim(),
      status: String(fcData[r][fcCol('forecast_status')] || '').trim()
    };
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var currentYear = String(new Date().getFullYear());
  var results = [];
  var batchSeen = {};

  for (var idx = 0; idx < rows.length; idx++) {
    var row = rows[idx] || {};
    var rowIndex = idx + 1;
    var year = String(row.year || '').trim() || currentYear;
    var company = String(row.company || '').trim();
    var country = String(row.country || '').trim();
    var marketplace = String(row.marketplace || '').trim();
    var sku = String(row.sku || '').trim();

    var baseResult = { rowIndex: rowIndex, year: year, company: company, country: country, marketplace: marketplace, sku: sku };

    var miss = [];
    if (!year) miss.push('year');
    if (!company) miss.push('company');
    if (!country) miss.push('country');
    if (!marketplace) miss.push('marketplace');
    if (!sku) miss.push('sku');
    if (miss.length) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'Missing required: ' + miss.join(', '), forecast_id: '' }));
      continue;
    }

    if (!skuMap[sku]) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'SKU not found in sku_details', forecast_id: '' }));
      continue;
    }

    var key = bk(year, company, country, marketplace, sku);
    if (batchSeen[key]) {
      results.push(Object.assign({}, baseResult, { status: 'skipped', message: 'Duplicate row in batch', forecast_id: '' }));
      continue;
    }
    batchSeen[key] = true;

    var monthVals = months.map(function(m) { var v = parseFloat(row[m]); return isNaN(v) ? 0 : v; });
    var totalFc = monthVals.reduce(function(a, b) { return a + b; }, 0);
    var meta = skuMap[sku];

    var existing = bkToRow[key];
    if (existing && existing.row !== -1) {
      var tr = existing.row;
      for (var mi = 0; mi < months.length; mi++) {
        if (fcCol(months[mi]) !== -1) fcSheet.getRange(tr, fcCol(months[mi]) + 1).setValue(monthVals[mi]);
      }
      if (fcCol('category') !== -1) fcSheet.getRange(tr, fcCol('category') + 1).setValue(meta.category);
      if (fcCol('series') !== -1) fcSheet.getRange(tr, fcCol('series') + 1).setValue(meta.series);
      if (fcCol('total_fc') !== -1) fcSheet.getRange(tr, fcCol('total_fc') + 1).setValue(totalFc);
      if (fcCol('source') !== -1) fcSheet.getRange(tr, fcCol('source') + 1).setValue(sourceDefault);
      if (fcCol('forecast_status') !== -1 && (!existing.status || overwriteStatus)) {
        fcSheet.getRange(tr, fcCol('forecast_status') + 1).setValue(forecastStatusDefault);
      }
      if (fcCol('updated_at') !== -1) fcSheet.getRange(tr, fcCol('updated_at') + 1).setValue(now);
      results.push(Object.assign({}, baseResult, { status: 'updated', message: 'Updated existing forecast', forecast_id: existing.forecastId }));
    } else {
      var fid = 'FC-' + year + '-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
      var newRow = new Array(fcHeaders.length).fill('');
      if (fcCol('forecast_id') !== -1) newRow[fcCol('forecast_id')] = fid;
      if (fcCol('year') !== -1) newRow[fcCol('year')] = year;
      if (fcCol('company') !== -1) newRow[fcCol('company')] = company;
      if (fcCol('country') !== -1) newRow[fcCol('country')] = country;
      if (fcCol('marketplace') !== -1) newRow[fcCol('marketplace')] = marketplace;
      if (fcCol('sku') !== -1) newRow[fcCol('sku')] = sku;
      if (fcCol('category') !== -1) newRow[fcCol('category')] = meta.category;
      if (fcCol('series') !== -1) newRow[fcCol('series')] = meta.series;
      for (var mj = 0; mj < months.length; mj++) {
        if (fcCol(months[mj]) !== -1) newRow[fcCol(months[mj])] = monthVals[mj];
      }
      if (fcCol('total_fc') !== -1) newRow[fcCol('total_fc')] = totalFc;
      if (fcCol('fc_share') !== -1) newRow[fcCol('fc_share')] = '';
      if (fcCol('forecast_status') !== -1) newRow[fcCol('forecast_status')] = forecastStatusDefault;
      if (fcCol('source') !== -1) newRow[fcCol('source')] = sourceDefault;
      if (fcCol('created_at') !== -1) newRow[fcCol('created_at')] = now;
      if (fcCol('updated_at') !== -1) newRow[fcCol('updated_at')] = now;
      fcSheet.appendRow(newRow);
      bkToRow[key] = { row: -1, forecastId: fid, status: forecastStatusDefault };
      results.push(Object.assign({}, baseResult, { status: 'created', message: 'Created new forecast', forecast_id: fid }));
    }
  }

  var summary = { total: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  results.forEach(function(x) { if (summary[x.status] !== undefined) summary[x.status]++; });
  return jsonResponse_({ success: true, data: { summary: summary, results: results } });
}

// ========================================
// Overseas Inventory Snapshot Batch Import Handler
// ========================================

/**
 * Batch import / upsert overseas_inventory_snapshot rows.
 * CSV carries: warehouse_id, sku, available_stock, reserved_stock, damaged_stock,
 *              on_the_way_qty, on_the_way_eta, note.
 * company / country / warehouse_name / warehouse_type are NOT in the CSV — they are
 * resolved from the `warehouses` registry by warehouse_id (and are NOT written onto the
 * snapshot row; the snapshot only stores warehouse_id and joins warehouses at read time).
 *
 * Business key: warehouse_id + sku.
 * - Existing key -> update stock fields / on_the_way_eta / note / updated_at; preserve snapshot_id + site_sku.
 * - New key      -> create with snapshot_id = OISN-{8hex}.
 * Quantities must be numeric and >= 0; decimals are rounded UP (CEILING). Non-numeric -> row error.
 * warehouse_id must exist in `warehouses`. Header-validated before any write.
 * Snapshot-only refresh: this importer does NOT write overseas_inventory_movements rows.
 */
function handleImportOverseasInventorySnapshotBatch_(body) {
  var rows = body.rows;
  if (!rows || !rows.length) {
    return jsonResponse_({ success: false, error: 'No rows provided' });
  }

  var options = body.options || {};
  var createdBy = String(options.createdBy || body.created_by || 'operation-system').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
  var whSheet = ss.getSheetByName('warehouses');
  if (!snapSheet) return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot sheet not found' });
  if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found' });

  var qtyFields = ['available_stock', 'reserved_stock', 'damaged_stock', 'on_the_way_qty'];

  var snapData = snapSheet.getDataRange().getValues();
  var snapHeaders = snapData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var snCol = function(n) { return snapHeaders.indexOf(n); };

  var whData = whSheet.getDataRange().getValues();
  var whHeaders = whData[0].map(function(h) { return String(h).trim().toLowerCase(); });

  // --- Required-header validation (before any writes) ---
  var requiredSnap = ['snapshot_id', 'warehouse_id', 'sku', 'site_sku']
    .concat(qtyFields)
    .concat(['on_the_way_eta', 'note', 'created_at', 'updated_at']);
  var missingHeaders = [];
  requiredSnap.forEach(function(h) { if (snapHeaders.indexOf(h) === -1) missingHeaders.push('overseas_inventory_snapshot.' + h); });
  if (whHeaders.indexOf('warehouse_id') === -1) missingHeaders.push('warehouses.warehouse_id');
  if (missingHeaders.length) {
    return jsonResponse_({ success: false, error: 'Missing required header(s): ' + missingHeaders.join(', ') });
  }

  // --- warehouses: set of valid warehouse_id ---
  var wh_id = whHeaders.indexOf('warehouse_id');
  var validWarehouses = {};
  for (var w = 1; w < whData.length; w++) {
    var wid = String(whData[w][wh_id] || '').trim();
    if (wid) validWarehouses[wid] = true;
  }

  // --- existing snapshot business-key map (warehouse_id|sku) ---
  var sn_wh = snCol('warehouse_id'), sn_sku = snCol('sku');
  var bkToRow = {};
  for (var r = 1; r < snapData.length; r++) {
    var rwh = String(snapData[r][sn_wh] || '').trim();
    var rsku = String(snapData[r][sn_sku] || '').trim();
    if (!rwh || !rsku) continue;
    var k0 = rwh + '|' + rsku;
    if (bkToRow[k0] === undefined) {
      bkToRow[k0] = { row: r + 1, snapshotId: snCol('snapshot_id') !== -1 ? String(snapData[r][snCol('snapshot_id')] || '').trim() : '' };
    }
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var results = [];
  var batchSeen = {};

  for (var idx = 0; idx < rows.length; idx++) {
    var row = rows[idx] || {};
    var rowIndex = idx + 1;
    var warehouseId = String(row.warehouse_id || '').trim();
    var sku = String(row.sku || '').trim();
    var baseResult = { rowIndex: rowIndex, warehouse_id: warehouseId, sku: sku };

    var miss = [];
    if (!warehouseId) miss.push('warehouse_id');
    if (!sku) miss.push('sku');
    if (miss.length) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'Missing required: ' + miss.join(', '), snapshot_id: '' }));
      continue;
    }

    if (!validWarehouses[warehouseId]) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'warehouse_id not found in warehouses', snapshot_id: '' }));
      continue;
    }

    // Numeric (>= 0, CEILING) validation for quantity fields.
    var qtyVals = {};
    var badQty = null;
    for (var qi = 0; qi < qtyFields.length; qi++) {
      var f = qtyFields[qi];
      var rawVal = row[f];
      var sv = String(rawVal == null ? '' : rawVal).trim();
      if (sv === '') { qtyVals[f] = 0; continue; }
      if (!/^\d+(\.\d+)?$/.test(sv)) { badQty = { field: f, val: sv }; break; }
      qtyVals[f] = Math.ceil(parseFloat(sv));
    }
    if (badQty) {
      results.push(Object.assign({}, baseResult, { status: 'error', message: 'Invalid (must be number >= 0): ' + badQty.field + '="' + badQty.val + '"', snapshot_id: '' }));
      continue;
    }

    var key = warehouseId + '|' + sku;
    if (batchSeen[key]) {
      results.push(Object.assign({}, baseResult, { status: 'skipped', message: 'Duplicate row in batch', snapshot_id: '' }));
      continue;
    }
    batchSeen[key] = true;

    var etaVal = String(row.on_the_way_eta || '').trim();
    var noteVal = row.note !== undefined ? String(row.note).trim() : '';

    var existing = bkToRow[key];
    if (existing && existing.row !== -1) {
      var tr = existing.row;
      qtyFields.forEach(function(f) { if (snCol(f) !== -1) snapSheet.getRange(tr, snCol(f) + 1).setValue(qtyVals[f]); });
      if (snCol('on_the_way_eta') !== -1) snapSheet.getRange(tr, snCol('on_the_way_eta') + 1).setValue(etaVal);
      if (row.note !== undefined && snCol('note') !== -1) snapSheet.getRange(tr, snCol('note') + 1).setValue(noteVal);
      if (snCol('updated_at') !== -1) snapSheet.getRange(tr, snCol('updated_at') + 1).setValue(now);
      results.push(Object.assign({}, baseResult, { status: 'updated', message: 'Snapshot updated', snapshot_id: existing.snapshotId }));
    } else {
      var sid = 'OISN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
      var newRow = new Array(snapHeaders.length).fill('');
      if (snCol('snapshot_id') !== -1) newRow[snCol('snapshot_id')] = sid;
      if (snCol('warehouse_id') !== -1) newRow[snCol('warehouse_id')] = warehouseId;
      if (snCol('sku') !== -1) newRow[snCol('sku')] = sku;
      qtyFields.forEach(function(f) { if (snCol(f) !== -1) newRow[snCol(f)] = qtyVals[f]; });
      if (snCol('on_the_way_eta') !== -1) newRow[snCol('on_the_way_eta')] = etaVal;
      if (snCol('note') !== -1) newRow[snCol('note')] = noteVal;
      if (snCol('created_at') !== -1) newRow[snCol('created_at')] = now;
      if (snCol('updated_at') !== -1) newRow[snCol('updated_at')] = now;
      snapSheet.appendRow(newRow);
      bkToRow[key] = { row: -1, snapshotId: sid };
      results.push(Object.assign({}, baseResult, { status: 'created', message: 'Snapshot created', snapshot_id: sid }));
    }
  }

  var summary = { total: rows.length, created: 0, updated: 0, skipped: 0, error: 0 };
  results.forEach(function(x) { if (summary[x.status] !== undefined) summary[x.status]++; });
  return jsonResponse_({ success: true, data: { summary: summary, results: results } });
}

// ========================================
// Overseas Inventory Manual Adjustment Handler
// ========================================

/**
 * Manual stock adjustment for one overseas_inventory_snapshot row.
 * Input: warehouse_id, sku, adjustment_qty (integer, may be negative), reason, note.
 * - Adjusts the `available_stock` bucket (MVP target).
 * - quantity_before = current available_stock; quantity_after = before + adjustment_qty.
 *   Result must be >= 0 (else error; no write).
 * - Updates snapshot.available_stock + last_movement_at + updated_at.
 * - Inserts an overseas_inventory_movements row (movement_type = 'manual_adjustment').
 * The snapshot row must already exist (created via Import). warehouse_name / company etc.
 * are NOT written onto the movement row — they join from `warehouses` by warehouse_id.
 */
function handleAdjustOverseasInventory_(body) {
  var warehouseId = String(body.warehouse_id || '').trim();
  var sku = String(body.sku || '').trim();
  var reason = String(body.reason || '').trim();
  var note = body.note !== undefined ? String(body.note).trim() : '';
  var createdBy = String(body.created_by || 'operation-system').trim();

  if (!warehouseId) return jsonResponse_({ success: false, error: 'Missing warehouse_id' });
  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });

  var adjRaw = String(body.adjustment_qty == null ? '' : body.adjustment_qty).trim();
  if (adjRaw === '') return jsonResponse_({ success: false, error: 'Missing adjustment_qty' });
  if (!/^-?\d+$/.test(adjRaw)) return jsonResponse_({ success: false, error: 'adjustment_qty must be a whole number (may be negative)' });
  var adjustmentQty = parseInt(adjRaw, 10);
  if (adjustmentQty === 0) return jsonResponse_({ success: false, error: 'adjustment_qty cannot be 0' });
  if (!reason) return jsonResponse_({ success: false, error: 'Missing reason' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
  var movSheet = ss.getSheetByName('overseas_inventory_movements');
  var whSheet = ss.getSheetByName('warehouses');
  if (!snapSheet) return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot sheet not found' });
  if (!movSheet) return jsonResponse_({ success: false, error: 'overseas_inventory_movements sheet not found' });
  if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found' });

  // Validate warehouse exists.
  var whData = whSheet.getDataRange().getValues();
  var whHeaders = whData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var wh_id = whHeaders.indexOf('warehouse_id');
  if (wh_id === -1) return jsonResponse_({ success: false, error: 'warehouses.warehouse_id column not found' });
  var whExists = false;
  for (var w = 1; w < whData.length; w++) {
    if (String(whData[w][wh_id] || '').trim() === warehouseId) { whExists = true; break; }
  }
  if (!whExists) return jsonResponse_({ success: false, error: 'warehouse_id not found in warehouses' });

  // Locate snapshot row by warehouse_id + sku.
  var snapData = snapSheet.getDataRange().getValues();
  var snapHeaders = snapData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var snCol = function(n) { return snapHeaders.indexOf(n); };
  if (snCol('warehouse_id') === -1 || snCol('sku') === -1 || snCol('available_stock') === -1) {
    return jsonResponse_({ success: false, error: 'overseas_inventory_snapshot missing required columns (warehouse_id, sku, available_stock)' });
  }

  var targetRow = -1, siteSku = '', snapshotId = '';
  for (var r = 1; r < snapData.length; r++) {
    if (String(snapData[r][snCol('warehouse_id')] || '').trim() === warehouseId &&
        String(snapData[r][snCol('sku')] || '').trim() === sku) {
      targetRow = r + 1;
      siteSku = snCol('site_sku') !== -1 ? String(snapData[r][snCol('site_sku')] || '').trim() : '';
      snapshotId = snCol('snapshot_id') !== -1 ? String(snapData[r][snCol('snapshot_id')] || '').trim() : '';
      break;
    }
  }
  if (targetRow === -1) {
    return jsonResponse_({ success: false, error: 'No snapshot row found for warehouse_id + sku. Import the snapshot first.' });
  }

  var quantityBefore = Math.round(parseFloat(snapData[targetRow - 1][snCol('available_stock')]) || 0);
  var quantityAfter = quantityBefore + adjustmentQty;
  if (quantityAfter < 0) {
    return jsonResponse_({ success: false, error: 'Resulting available_stock would be negative (' + quantityBefore + ' + ' + adjustmentQty + ' = ' + quantityAfter + ')' });
  }

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // Update snapshot.
  snapSheet.getRange(targetRow, snCol('available_stock') + 1).setValue(quantityAfter);
  if (snCol('last_movement_at') !== -1) snapSheet.getRange(targetRow, snCol('last_movement_at') + 1).setValue(now);
  if (snCol('updated_at') !== -1) snapSheet.getRange(targetRow, snCol('updated_at') + 1).setValue(now);

  // Insert movement row.
  var movData = movSheet.getDataRange().getValues();
  var movHeaders = movData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var mvCol = function(n) { return movHeaders.indexOf(n); };
  var movementId = 'OVMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
  var movRow = new Array(movHeaders.length).fill('');
  if (mvCol('movement_id') !== -1) movRow[mvCol('movement_id')] = movementId;
  if (mvCol('movement_date') !== -1) movRow[mvCol('movement_date')] = now;
  if (mvCol('warehouse_id') !== -1) movRow[mvCol('warehouse_id')] = warehouseId;
  if (mvCol('sku') !== -1) movRow[mvCol('sku')] = sku;
  if (mvCol('site_sku') !== -1) movRow[mvCol('site_sku')] = siteSku;
  if (mvCol('movement_type') !== -1) movRow[mvCol('movement_type')] = 'adjustment';
  // Stock-direction (MVP: manual adjustment targets the available bucket). Written only if columns exist.
  if (mvCol('from_stock_type') !== -1) movRow[mvCol('from_stock_type')] = 'none';
  if (mvCol('to_stock_type') !== -1) movRow[mvCol('to_stock_type')] = 'available';
  if (mvCol('quantity') !== -1) movRow[mvCol('quantity')] = adjustmentQty;
  if (mvCol('quantity_before') !== -1) movRow[mvCol('quantity_before')] = quantityBefore;
  if (mvCol('quantity_after') !== -1) movRow[mvCol('quantity_after')] = quantityAfter;
  if (mvCol('reference_type') !== -1) movRow[mvCol('reference_type')] = 'manual';
  if (mvCol('reference_id') !== -1) movRow[mvCol('reference_id')] = '';
  if (mvCol('source_module') !== -1) movRow[mvCol('source_module')] = 'overseas_stock';
  if (mvCol('created_by') !== -1) movRow[mvCol('created_by')] = createdBy;
  if (mvCol('created_at') !== -1) movRow[mvCol('created_at')] = now;
  // reason is stored in note (prefixed) when there is no dedicated reason column.
  var noteOut = reason ? ('[' + reason + ']' + (note ? ' ' + note : '')) : note;
  if (mvCol('reason') !== -1) {
    movRow[mvCol('reason')] = reason;
    if (mvCol('note') !== -1) movRow[mvCol('note')] = note;
  } else if (mvCol('note') !== -1) {
    movRow[mvCol('note')] = noteOut;
  }
  movSheet.appendRow(movRow);

  return jsonResponse_({
    success: true,
    data: {
      movement_id: movementId,
      snapshot_id: snapshotId,
      warehouse_id: warehouseId,
      sku: sku,
      quantity: adjustmentQty,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter
    }
  });
}
