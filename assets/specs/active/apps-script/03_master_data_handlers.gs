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
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements', 'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot', 'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'request_orders', 'request_order_lines', 'purchase_orders', 'purchase_order_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'request_order_site_confirmations', 'request_order_line_sources', 'carriers', 'carrier_rate_cards', 'carrier_lead_times', 'sku_regional_details', 'tax_referral_rates'];
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
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements', 'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot', 'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'request_orders', 'request_order_lines', 'purchase_orders', 'purchase_order_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'request_order_site_confirmations', 'request_order_line_sources', 'carriers', 'carrier_rate_cards', 'carrier_lead_times', 'sku_regional_details', 'tax_referral_rates'];

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


// Allowlist of sku_details columns writable via handleUpsertSkuDetail_. Identity (sku) is the match
// key and is NEVER changed here. The writer only touches columns that are BOTH in this list AND
// supplied (non-undefined) in the body — omitted fields are preserved, never blanked. This is the
// full SKU Details editor field set (2026-07); `lifecycle` = the Status field edited via the modal.
// NOTE: this endpoint edits ONLY sku_details — it does NOT create marketplace_skus / pricing_list /
// FC / factory_stock rows (those side effects belong to the Inventory Replenishment Add SKU flow).
var SKU_DETAILS_UPSERT_FIELDS_ = [
  'lifecycle', 'product_name', 'product_name_cn', 'series', 'category', 'gs1_code', 'gs1_type',
  'item_length', 'item_width', 'item_height', 'item_dimension_unit', 'item_weight', 'item_weight_unit',
  'package_length', 'package_width', 'package_height', 'package_dimension_unit', 'package_weight', 'package_weight_unit',
  'carton_length', 'carton_width', 'carton_height', 'carton_dimension_unit', 'carton_weight', 'carton_weight_unit',
  'units_per_carton', 'product_use', 'material', 'battery_type', 'magnet_type',
  'minimum_price', 'msrp', 'selling_price', 'base_currency', 'pm', 'image_url'
];

/**
 * Upsert a sku_details row by sku. Updates the allowlisted fields when the SKU exists (preserving any
 * field NOT supplied in the body); creates a minimal row (sku + supplied fields) when it does not.
 * Additive: ensures the allowlisted columns exist. Never touches columns outside the allowlist, and
 * never creates marketplace / pricing / FC / factory_stock rows. Body: { sku, <allowlisted field>?, ... }.
 */
function handleUpsertSkuDetail_(body) {
  var sku = String((body && body.sku) || '').trim();
  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('sku_details');
  if (!sheet) return jsonResponse_({ success: false, error: 'sku_details sheet not found' });

  // Ensure the customs columns exist on tabs that predate them (additive; never removes columns).
  if (typeof sheetEnsureColumns_ === 'function') sheetEnsureColumns_(sheet, SKU_DETAILS_UPSERT_FIELDS_);

  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return jsonResponse_({ success: false, error: 'sku_details has no header row' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var skuCol = col('sku');
  if (skuCol === -1) return jsonResponse_({ success: false, error: 'sku column not found in sku_details header' });
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  // Find existing row by sku.
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][skuCol]).trim() === sku) { targetRow = i + 1; break; }
  }

  if (targetRow !== -1) {
    SKU_DETAILS_UPSERT_FIELDS_.forEach(function (f) {
      if (body[f] === undefined) return;
      var c = col(f);
      if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(String(body[f] == null ? '' : body[f]));
    });
    if (col('updated_at') !== -1) sheet.getRange(targetRow, col('updated_at') + 1).setValue(now);
    return jsonResponse_({ success: true, data: { sku: sku, updated: true } });
  }

  // Create a minimal row (sku + supplied allowlisted fields).
  var newRow = new Array(headers.length).fill('');
  newRow[skuCol] = sku;
  SKU_DETAILS_UPSERT_FIELDS_.forEach(function (f) {
    if (body[f] === undefined) return;
    var c = col(f);
    if (c !== -1) newRow[c] = String(body[f] == null ? '' : body[f]);
  });
  if (col('created_at') !== -1) newRow[col('created_at')] = now;
  if (col('updated_at') !== -1) newRow[col('updated_at')] = now;
  sheet.appendRow(newRow);
  return jsonResponse_({ success: true, data: { sku: sku, updated: false, created: true } });
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

  // SKU Domain v2.0: Flow B — regional is higher-priority. If a matching sku_regional_details row exists,
  // adopt its site_sku / marketplace_product_id.
  var company = String(body.company || '').trim();
  var siteSkuVal = String(body.site_sku || '').trim();
  var productIdVal = String(body.marketplace_product_id || body.asin || '').trim();   // accept legacy input; never write asin
  try {
    var regLk = (typeof skuRegionalLookup_ === 'function') ? skuRegionalLookup_(ss, sku, company, country, marketplace) : null;
    if (regLk) { if (regLk.siteSku) siteSkuVal = regLk.siteSku; if (regLk.marketplaceProductId) productIdVal = regLk.marketplaceProductId; }
  } catch (e) {}

  if (col('marketplace_sku_id') !== -1) newRow[col('marketplace_sku_id')] = id;
  if (skuCol !== -1) newRow[skuCol] = sku;
  if (col('company') !== -1) newRow[col('company')] = company;
  if (countryCol !== -1) newRow[countryCol] = country;
  if (mpCol !== -1) newRow[mpCol] = marketplace;
  if (col('site_sku') !== -1) newRow[col('site_sku')] = siteSkuVal;
  // Canonical marketplace_product_id (never write legacy asin).
  if (col('marketplace_product_id') !== -1) newRow[col('marketplace_product_id')] = productIdVal;
  if (col('currency') !== -1) newRow[col('currency')] = String(body.currency || 'USD').trim();
  if (col('regular_price') !== -1) newRow[col('regular_price')] = body.regular_price || '';
  if (col('minimum_price') !== -1) newRow[col('minimum_price')] = body.minimum_price || '';
  if (col('msrp') !== -1) newRow[col('msrp')] = body.msrp || '';
  if (col('marketplace_sku_status') !== -1) newRow[col('marketplace_sku_status')] = String(body.marketplace_sku_status || 'active').trim();
  if (col('replenishment_model') !== -1) newRow[col('replenishment_model')] = String(body.replenishment_model || 'sales_driven').trim();
  // Fulfillment model (SKU-level). Written only if the column exists; blank when not supplied.
  if (col('fulfillment_model') !== -1) newRow[col('fulfillment_model')] = String(body.fulfillment_model || '').trim();
  if (col('launch_date') !== -1) newRow[col('launch_date')] = String(body.launch_date || '').trim();
  if (col('created_at') !== -1) newRow[col('created_at')] = now;
  if (col('updated_at') !== -1) newRow[col('updated_at')] = now;

  sheet.appendRow(newRow);

  // SKU Domain v2.0 — Flow A: ensure a matching sku_regional_details row (copy identity; no overwrite).
  try {
    if (typeof skuRegionalEnsure_ === 'function') {
      skuRegionalEnsure_(ss, { sku: sku, company: company, country: country, marketplace: marketplace, site_sku: siteSkuVal, marketplace_product_id: productIdVal });
    }
  } catch (e) {}

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

  if (body.fulfillment_model !== undefined && col('fulfillment_model') !== -1) {
    var ffm = String(body.fulfillment_model).trim();
    var VALID_SKU_FULFILLMENT_MODELS_ = ['platform_fulfilled', 'self_fulfilled', 'hybrid'];
    if (ffm && VALID_SKU_FULFILLMENT_MODELS_.indexOf(ffm) === -1) {
      return jsonResponse_({ success: false, error: 'Invalid fulfillment_model. Valid: ' + VALID_SKU_FULFILLMENT_MODELS_.join(', ') });
    }
    sheet.getRange(targetRow, col('fulfillment_model') + 1).setValue(ffm);
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
  // Fulfillment model (platform_fulfilled | self_fulfilled | hybrid). Written only if the column
  // exists. allocation_priority is optional (numeric; higher = higher priority).
  var fulfillmentModel = String(body.fulfillment_model || '').trim();
  var VALID_FULFILLMENT_MODELS_ = ['platform_fulfilled', 'self_fulfilled', 'hybrid'];
  if (fulfillmentModel && VALID_FULFILLMENT_MODELS_.indexOf(fulfillmentModel) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid fulfillment_model. Valid: ' + VALID_FULFILLMENT_MODELS_.join(', ') });
  }
  var allocationPriority = (body.allocation_priority !== undefined && body.allocation_priority !== '') ? body.allocation_priority : '';
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
    if (fulfillmentModel && col('fulfillment_model') !== -1) sheet.getRange(targetRow, col('fulfillment_model') + 1).setValue(fulfillmentModel);
    if (allocationPriority !== '' && col('allocation_priority') !== -1) sheet.getRange(targetRow, col('allocation_priority') + 1).setValue(allocationPriority);
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
  if (col('fulfillment_model') !== -1) newRow[col('fulfillment_model')] = fulfillmentModel;
  if (col('allocation_priority') !== -1 && allocationPriority !== '') newRow[col('allocation_priority')] = allocationPriority;
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

