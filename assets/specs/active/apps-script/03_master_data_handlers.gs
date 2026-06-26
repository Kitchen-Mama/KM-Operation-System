// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 03_master_data_handlers.gs — master data + marketplace handlers
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

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
 * marketplace_alias: defaults to the same value as marketplace when blank/not provided.
 *   - On create: marketplace_alias = body.marketplace_alias (if non-blank) else marketplace.
 *   - On update: auto-fill ONLY when the existing alias cell is blank; an explicit non-blank
 *     body.marketplace_alias is treated as a manual edit and saved; a non-blank existing alias
 *     is never auto-overwritten. (MVP keeps alias == marketplace; future import normalization
 *     may match source marketplace values against marketplace_alias.)
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
  var marketplaceAlias = String(body.marketplace_alias || '').trim();
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
    // Update existing: display_name, alias (blank-only auto-fill), currency, status, (note), updated_by, updated_at
    if (col('marketplace_display_name') !== -1) sheet.getRange(targetRow, col('marketplace_display_name') + 1).setValue(displayName);
    if (col('marketplace_alias') !== -1) {
      var existingAlias = String(data[targetRow - 1][col('marketplace_alias')] || '').trim();
      // Never auto-overwrite a manually-set alias. An explicit non-blank request value is a manual
      // edit (saved); otherwise auto-fill from marketplace ONLY when the existing cell is blank.
      if (marketplaceAlias) sheet.getRange(targetRow, col('marketplace_alias') + 1).setValue(marketplaceAlias);
      else if (!existingAlias) sheet.getRange(targetRow, col('marketplace_alias') + 1).setValue(marketplace);
    }
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
  // marketplace_alias defaults to marketplace when blank/not provided (MVP: alias == marketplace).
  if (col('marketplace_alias') !== -1) newRow[col('marketplace_alias')] = marketplaceAlias || marketplace;
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

