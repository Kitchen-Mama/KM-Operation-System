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

    return jsonResponse_({ success: false, error: 'Invalid POST action. Supported: updateSkuLifecycle, upsertMarketplaceSku, updateMarketplaceSkuModel, importMarketplaceSkusBatch' });

  } catch (err) {
    Logger.log(err.stack);
    return jsonResponse_({ success: false, error: err.message });
  }
}

// ========================================
// Action Handlers
// ========================================

function handleGetOperationDb_() {
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast'];
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
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast'];

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
  var skuMap = {};
  for (var i = 1; i < skuData.length; i++) {
    var s = String(skuData[i][sd_sku] || '').trim();
    if (s) {
      skuMap[s] = {
        category: sd_cat !== -1 ? String(skuData[i][sd_cat] || '').trim() : '',
        series: sd_ser !== -1 ? String(skuData[i][sd_ser] || '').trim() : '',
        sellingPrice: sd_sell !== -1 ? skuData[i][sd_sell] : '',
        minimumPrice: sd_min !== -1 ? skuData[i][sd_min] : '',
        msrp: sd_msrp !== -1 ? skuData[i][sd_msrp] : ''
      };
    }
  }

  // --- marketplace_skus: headers + existing keys ---
  var mpData = mpSheet.getDataRange().getValues();
  var mpHeaders = mpData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var mpCol = function(n) { return mpHeaders.indexOf(n); };
  var mp_id = mpCol('marketplace_sku_id'), mp_sku = mpCol('sku'),
      mp_company = mpCol('company'), mp_country = mpCol('country'), mp_mp = mpCol('marketplace');
  var mpKeyToRow = {};
  var mpIdToRow = {};
  for (var i = 1; i < mpData.length; i++) {
    var ck = [
      mp_company !== -1 ? String(mpData[i][mp_company] || '').trim() : '',
      mp_country !== -1 ? String(mpData[i][mp_country] || '').trim() : '',
      mp_mp !== -1 ? String(mpData[i][mp_mp] || '').trim() : '',
      mp_sku !== -1 ? String(mpData[i][mp_sku] || '').trim() : ''
    ].join('|');
    var existingId = mp_id !== -1 ? String(mpData[i][mp_id] || '').trim() : '';
    mpKeyToRow[ck] = { row: i + 1, id: existingId };
    if (existingId) mpIdToRow[existingId] = { row: i + 1, key: ck };
  }

  // --- pricing_list: headers + existing marketplace_sku_id set ---
  var prData = prSheet.getDataRange().getValues();
  var prHeaders = prData[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var prCol = function(n) { return prHeaders.indexOf(n); };
  var pr_mpid = prCol('marketplace_sku_id');
  var pricingMpIds = {};
  for (var i = 1; i < prData.length; i++) {
    if (pr_mpid !== -1) {
      var pv = String(prData[i][pr_mpid] || '').trim();
      if (pv) pricingMpIds[pv] = true;
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
    marketplace_skus: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'asin', 'currency', 'marketplace_sku_status', 'replenishment_model', 'launch_date', 'created_at', 'updated_at'],
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
      if (row.asin !== undefined && mpCol('asin') !== -1) mpSheet.getRange(trow, mpCol('asin') + 1).setValue(String(row.asin).trim());
      if (mpCol('currency') !== -1) mpSheet.getRange(trow, mpCol('currency') + 1).setValue(currency);
      if (row.marketplace_sku_status !== undefined && mpCol('marketplace_sku_status') !== -1) mpSheet.getRange(trow, mpCol('marketplace_sku_status') + 1).setValue(String(row.marketplace_sku_status).trim());
      if (row.replenishment_model !== undefined && mpCol('replenishment_model') !== -1) mpSheet.getRange(trow, mpCol('replenishment_model') + 1).setValue(String(row.replenishment_model).trim());
      if (row.launch_date !== undefined && mpCol('launch_date') !== -1) mpSheet.getRange(trow, mpCol('launch_date') + 1).setValue(String(row.launch_date).trim());
      if (mpCol('updated_at') !== -1) mpSheet.getRange(trow, mpCol('updated_at') + 1).setValue(now);
      results.push({ rowIndex: rowIndex, sku: sku, status: 'updated', message: 'marketplace_skus updated (pricing/forecast untouched)', marketplace_sku_id: existing.id || providedId, pricing_id: '', forecast_id: '' });
      continue;
    }

    // ---- New: create marketplace_skus + pricing_list + fc_regular_forecast ----
    var mpId = providedId || ('MPSKU-' + country + '-' + marketplace.substring(0, 3).toUpperCase() + '-' + sku + '-' + Utilities.getUuid().substring(0, 6));

    var newMp = new Array(mpHeaders.length).fill('');
    if (mpCol('marketplace_sku_id') !== -1) newMp[mpCol('marketplace_sku_id')] = mpId;
    if (mpCol('sku') !== -1) newMp[mpCol('sku')] = sku;
    if (mpCol('company') !== -1) newMp[mpCol('company')] = company;
    if (mpCol('country') !== -1) newMp[mpCol('country')] = country;
    if (mpCol('marketplace') !== -1) newMp[mpCol('marketplace')] = marketplace;
    if (mpCol('site_sku') !== -1) newMp[mpCol('site_sku')] = siteSku;
    if (mpCol('asin') !== -1) newMp[mpCol('asin')] = String(row.asin || '').trim();
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
      if (prCol('sku') !== -1) newPr[prCol('sku')] = sku;
      if (prCol('country') !== -1) newPr[prCol('country')] = country;
      if (prCol('marketplace') !== -1) newPr[prCol('marketplace')] = marketplace;
      if (prCol('site_sku') !== -1) newPr[prCol('site_sku')] = siteSku;
      if (prCol('asin') !== -1) newPr[prCol('asin')] = String(row.asin || '').trim();
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
