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
  // NOTE (2026-07-23): appended logistics_locations / shipment_route_templates /
  // shipment_route_template_nodes / shipment_events as READ-ONLY tabs for the Global Logistics Map.
  // getOperationDb reads each tab defensively (missing tab -> [] via the catch below), so this is
  // backward-compatible; a redeploy is required for the frontend to receive these tabs.
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements', 'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot', 'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'request_orders', 'request_order_lines', 'purchase_orders', 'purchase_order_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'request_order_site_confirmations', 'request_order_line_sources', 'carriers', 'carrier_rate_cards', 'carrier_lead_times', 'sku_regional_details', 'tax_referral_rates', 'tax_rate_components', 'logistics_locations', 'shipment_route_templates', 'shipment_route_template_nodes', 'shipment_routes', 'shipment_events'];
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
  var validTabs = ['sku_details', 'product_features', 'sku_handbook_summaries', 'campaigns', 'campaign_sku_lines', 'marketplaces', 'marketplace_skus', 'pricing_list', 'pricing_change_log', 'fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'factory_stock', 'factory_stock_movements', 'warehouses', 'overseas_inventory_snapshot', 'overseas_inventory_movements', 'amazon_inventory_snapshot', 'amazon_inventory_health_snapshot', 'amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot', 'shipping_plans', 'shipping_plan_lines', 'shipments', 'shipment_lines', 'request_orders', 'request_order_lines', 'purchase_orders', 'purchase_order_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'request_order_site_confirmations', 'request_order_line_sources', 'carriers', 'carrier_rate_cards', 'carrier_lead_times', 'sku_regional_details', 'tax_referral_rates', 'tax_rate_components', 'logistics_locations', 'shipment_route_templates', 'shipment_route_template_nodes', 'shipment_routes', 'shipment_events'];

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

// Canonical lifecycle value that triggers the Factory Stock baseline ensure (SKU_DETAILS_ADD_EDIT_SPEC §15).
var SKU_RUNNING_LIFECYCLE_ = 'Running in the Market';

// Interpret a warehouses flag cell as boolean (TRUE/true/1/yes/y → true; blank/false/0/no → false).
function skuFlagTrue_(v) {
  if (v === true) return true;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'y';
}

// Normalize an incoming magnet_type value to a REAL Boolean (finalized: magnet_type is Boolean, NOT enum).
// Accepts the canonical Boolean from the UI plus legacy compatibility strings on read. Returns:
//   true  ← true / "true" / "yes" / "y" / "1" / "magnetic"
//   false ← false / "false" / "no" / "n" / "0" / "no_magnet"
//   null  ← blank / unknown (never guessed — the caller decides how to persist an unknown)
// Explicit token classification only — never JS truthiness (Boolean("false") === true is wrong here).
function skuMagnetToBool_(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = String(v == null ? '' : v).trim().toLowerCase();
  if (s === '') return null;
  if (s === 'true' || s === 'yes' || s === 'y' || s === '1' || s === 'magnetic') return true;
  if (s === 'false' || s === 'no' || s === 'n' || s === '0' || s === 'no_magnet') return false;
  return null;   // unknown value — do not coerce/guess
}

/**
 * Ensure a Factory Stock baseline for a Master SKU across eligible active Factory Warehouses.
 * Canonical (SKU_DETAILS_ADD_EDIT_SPEC §15; INVENTORY_TABLE_MAPPING_SPEC §17.3A.1):
 *   - eligibility: warehouses.is_active = TRUE AND warehouses.is_factory_warehouse = TRUE
 *   - identity: warehouse_id + Master sku (NEVER site_sku / company / marketplace / warehouse_code alone)
 *   - idempotent: create only a MISSING row; never reset/overwrite an existing stock row; no duplicates
 *   - current_stock = 0, reserved_stock = 0 (only where the column exists); no movement row for a 0 baseline
 * Fail-closed: if the warehouses/factory_stock sheets or required columns are absent, returns a
 * structured db_mapping_gap (never invents columns/tabs). Returns a structured summary; never throws.
 */
function ensureFactoryStockBaseline_(ss, sku) {
  var result = { triggered: true, status: 'ok', created: [], skipped: [], failed: [], eligible_count: 0, warnings: [] };
  try {
    var wh = ss.getSheetByName('warehouses');
    if (!wh) { result.status = 'db_mapping_gap'; result.warnings.push('warehouses sheet not found'); return result; }
    var whData = wh.getDataRange().getValues();
    if (whData.length < 1) { result.status = 'db_mapping_gap'; result.warnings.push('warehouses has no header row'); return result; }
    var whH = whData[0].map(function (h) { return String(h).trim(); });
    var whId = whH.indexOf('warehouse_id'), whActive = whH.indexOf('is_active'), whFactory = whH.indexOf('is_factory_warehouse');
    if (whId === -1 || whActive === -1 || whFactory === -1) {
      result.status = 'db_mapping_gap';
      result.warnings.push('warehouses missing required column(s): ' +
        [whId === -1 ? 'warehouse_id' : null, whActive === -1 ? 'is_active' : null, whFactory === -1 ? 'is_factory_warehouse' : null].filter(String).join(', '));
      return result;
    }
    var eligible = [];
    for (var r = 1; r < whData.length; r++) {
      var wid = String(whData[r][whId] || '').trim();
      if (wid && skuFlagTrue_(whData[r][whActive]) && skuFlagTrue_(whData[r][whFactory])) eligible.push(wid);
    }
    result.eligible_count = eligible.length;
    if (!eligible.length) { result.warnings.push('no eligible active factory warehouses'); return result; }

    var fs = ss.getSheetByName('factory_stock');
    if (!fs) { result.status = 'db_mapping_gap'; result.warnings.push('factory_stock sheet not found'); return result; }
    var fsData = fs.getDataRange().getValues();
    if (fsData.length < 1) { result.status = 'db_mapping_gap'; result.warnings.push('factory_stock has no header row'); return result; }
    var fsH = fsData[0].map(function (h) { return String(h).trim(); });
    var fsWid = fsH.indexOf('warehouse_id'), fsSku = fsH.indexOf('sku');
    if (fsWid === -1 || fsSku === -1) {
      result.status = 'db_mapping_gap';
      result.warnings.push('factory_stock missing required column(s): ' +
        [fsWid === -1 ? 'warehouse_id' : null, fsSku === -1 ? 'sku' : null].filter(String).join(', '));
      return result;
    }
    // Canonical fac_* headers (inventory namespace migration 2026-07-21); prefer the new header, fall back
    // to the pre-migration name until the live sheet is renamed. TEMPORARY fallback — remove the legacy
    // indexOf once live factory_stock headers are renamed + verified.
    var fsCur = fsH.indexOf('fac_current_stock'); if (fsCur === -1) fsCur = fsH.indexOf('current_stock');
    var fsRes = fsH.indexOf('fac_reserved_stock'); if (fsRes === -1) fsRes = fsH.indexOf('reserved_stock');
    var fsId = fsH.indexOf('factory_stock_id'), fsCreated = fsH.indexOf('created_at'), fsUpdated = fsH.indexOf('updated_at');

    // Existing warehouse_id+sku pairs (idempotency guard — never overwrite an existing row).
    var existing = {};
    for (var e = 1; e < fsData.length; e++) {
      existing[String(fsData[e][fsWid] || '').trim() + '|' + String(fsData[e][fsSku] || '').trim()] = true;
    }
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    for (var g = 0; g < eligible.length; g++) {
      var w = eligible[g];
      if (existing[w + '|' + sku]) { result.skipped.push(w); continue; }
      try {
        var row = new Array(fsH.length).fill('');
        row[fsWid] = w; row[fsSku] = sku;
        if (fsCur !== -1) row[fsCur] = 0;
        if (fsRes !== -1) row[fsRes] = 0;
        if (fsId !== -1) row[fsId] = 'FS-' + w + '-' + sku;
        if (fsCreated !== -1) row[fsCreated] = now;
        if (fsUpdated !== -1) row[fsUpdated] = now;
        fs.appendRow(row);
        existing[w + '|' + sku] = true;   // guard against duplicate append within this run
        result.created.push(w);
      } catch (rowErr) {
        result.failed.push({ warehouse_id: w, sku: sku, error: String(rowErr && rowErr.message ? rowErr.message : rowErr) });
      }
    }
    if (result.failed.length) { result.status = 'partial'; result.warnings.push(result.failed.length + ' warehouse baseline row(s) failed'); }
  } catch (err) {
    result.status = 'error';
    result.warnings.push('factory baseline ensure error: ' + String(err && err.message ? err.message : err));
  }
  return result;
}

/**
 * Upsert a sku_details row by sku (case-sensitive, trimmed — the existing DB convention).
 * mode: 'add' rejects an existing SKU (duplicate); 'edit' rejects a missing SKU (not_found); when omitted
 * the legacy upsert behavior is preserved for backward-compatible callers. Updates only the allowlisted
 * fields supplied in the body (omitted columns preserved), sets updated_at (created_at on create).
 * Factory Stock baseline is ensured ONLY when lifecycle transitions from non-running → 'Running in the
 * Market' (§15) — never on ordinary edits, marketplace/regional creation, or leaving/returning-with-rows.
 * Never creates marketplace / pricing / FC / regional rows. Body: { sku, mode?, <allowlisted field>?, ... }.
 */
function handleUpsertSkuDetail_(body) {
  var sku = String((body && body.sku) || '').trim();
  if (!sku) return jsonResponse_({ success: false, error_code: 'missing_sku', error: 'Missing sku' });
  var mode = String((body && body.mode) || '').trim().toLowerCase();  // 'add' | 'edit' | ''

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('sku_details');
  if (!sheet) return jsonResponse_({ success: false, error_code: 'sheet_missing', error: 'sku_details sheet not found' });

  // Ensure the customs columns exist on tabs that predate them (additive; never removes columns).
  if (typeof sheetEnsureColumns_ === 'function') sheetEnsureColumns_(sheet, SKU_DETAILS_UPSERT_FIELDS_);

  var data = sheet.getDataRange().getValues();
  if (data.length < 1) return jsonResponse_({ success: false, error_code: 'no_header', error: 'sku_details has no header row' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var skuCol = col('sku');
  if (skuCol === -1) return jsonResponse_({ success: false, error_code: 'no_sku_column', error: 'sku column not found in sku_details header' });
  var lcCol = col('lifecycle');
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  // Find existing row by sku (trim + case-sensitive — preserve the existing convention; no case-folding).
  var targetRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][skuCol]).trim() === sku) { targetRow = i + 1; break; }
  }

  // Mode gating (duplicate / not-found protection). Both layers required by spec §F.
  if (mode === 'add' && targetRow !== -1) {
    return jsonResponse_({ success: false, error_code: 'duplicate_sku', error: 'SKU already exists: ' + sku });
  }
  if (mode === 'edit' && targetRow === -1) {
    return jsonResponse_({ success: false, error_code: 'not_found', error: 'SKU not found (may have been removed): ' + sku });
  }

  var running = SKU_RUNNING_LIFECYCLE_;
  var savedLc;

  if (targetRow !== -1) {
    // Capture previous lifecycle BEFORE mutation for the transition test.
    var prevLc = (lcCol !== -1) ? String(data[targetRow - 1][lcCol] || '').trim() : '';
    SKU_DETAILS_UPSERT_FIELDS_.forEach(function (f) {
      if (body[f] === undefined) return;
      var c = col(f);
      if (c === -1) return;
      // magnet_type is a REAL Boolean cell (finalized). Normalize legacy inputs; write true/false, never a string.
      if (f === 'magnet_type') { var mb = skuMagnetToBool_(body[f]); sheet.getRange(targetRow, c + 1).setValue(mb === null ? '' : mb); return; }
      sheet.getRange(targetRow, c + 1).setValue(String(body[f] == null ? '' : body[f]));
    });
    if (col('updated_at') !== -1) sheet.getRange(targetRow, col('updated_at') + 1).setValue(now);
    savedLc = (body.lifecycle !== undefined) ? String(body.lifecycle == null ? '' : body.lifecycle).trim() : prevLc;
    var out = { sku: sku, updated: true };
    if (prevLc !== running && savedLc === running) out.factory_baseline = ensureFactoryStockBaseline_(ss, sku);
    return jsonResponse_({ success: true, data: out });
  }

  // Create a minimal row (sku + supplied allowlisted fields). prevLc = '' (non-running).
  var newRow = new Array(headers.length).fill('');
  newRow[skuCol] = sku;
  SKU_DETAILS_UPSERT_FIELDS_.forEach(function (f) {
    if (body[f] === undefined) return;
    var c = col(f);
    if (c === -1) return;
    if (f === 'magnet_type') { var mb = skuMagnetToBool_(body[f]); newRow[c] = (mb === null ? '' : mb); return; }   // real Boolean cell
    newRow[c] = String(body[f] == null ? '' : body[f]);
  });
  if (col('created_at') !== -1) newRow[col('created_at')] = now;
  if (col('updated_at') !== -1) newRow[col('updated_at')] = now;
  sheet.appendRow(newRow);
  savedLc = (body.lifecycle !== undefined) ? String(body.lifecycle == null ? '' : body.lifecycle).trim() : '';
  var created = { sku: sku, updated: false, created: true };
  // Trigger only if this create itself validly enters Running (§15).
  if (savedLc === running) created.factory_baseline = ensureFactoryStockBaseline_(ss, sku);
  return jsonResponse_({ success: true, data: created });
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

/**
 * F1-7N-D-2j / F1-7N-D-2k-R1 — Warehouse Allocation SAVE (Site Inventory → More Options → Warehouse Allocation writer).
 * -----------------------------------------------------------------------------------------------------------------
 * Scope-safe reconciliation of the SELF_FULFILLED demand-allocation for ONE (company,country,marketplace): the
 * selected warehouses' ratios become the scope's active membership; unselected previously-active warehouses are
 * dropped (deactivated). The demand-allocation RULE MODEL remains the SOLE planning-membership authority
 * (D-F1-4B-E0R-3 / D-F1-7N-D-2i-R1). Execution warehouses (FBA/RETURN/FACTORY) are rejected as destinations (they are
 * shipment-execution FCs, never self planning destinations); a future non-3PL self-operated inventory warehouse is
 * admitted (exclusion, not a 3PL-only inclusion) pending the Phase-2 durable eligibility authority. Ratios follow the
 * frozen contract (each of forecast & sales sums to exactly 100% in integer basis points).
 *
 * F1-7N-D-2k-R1 STORAGE OWNER: persistence moved from the `replenishment_demand_allocation_rules` Google Sheet tab to
 * the `KM_WAREHOUSE_ALLOCATION_CONFIG` Script-Property JSON blob (owner: 50_api_v1_warehouse_allocation_config.gs) so
 * the setting persists WITHOUT a user-managed Sheet tab yet stays backend/scheduler-readable with no browser session
 * (Weekly AI Plan + automation read the SAME blob). The RULE MODEL is unchanged (materialized to the same rule rows
 * KMDA consumes). PURE planner `replenDemandAllocationPlan_` is Node-verified; this shell does warehouse-sheet reads
 * (canonical destination validation) + Script-Property blob I/O only. No formula, no DB table, no calc.
 */
var REPLEN_DAR_EXEC_TYPES_ = { FBA: 1, RETURN: 1, FACTORY: 1 };   // execution/source warehouse types — never a SELF planning destination

function replenDarBool_(v) { if (v === true) return true; var t = String(v === undefined || v === null ? '' : v).trim().toLowerCase(); return t === 'true' || t === '1' || t === 'yes' || t === 'y'; }
function replenDarStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function replenDarRatioBp_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); if (!isFinite(n) || n < 0 || n > 1) return null; return Math.round(n * 10000); }

/**
 * PURE planner. Returns { ok, error?, upserts:[{destinationWarehouseId, forecastRatio, salesRatio, allocationRuleId}],
 * deactivates:[destinationWarehouseId...] }. Never mutates inputs; no I/O. `existingActiveInScope` = the currently
 * active rows for the scope (snake_case). `whById` = { warehouse_id → raw warehouse row }. `desired` = requested rows.
 */
function replenDemandAllocationPlan_(scope, desired, existingActiveInScope, whById) {
  scope = scope || {}; desired = desired || []; existingActiveInScope = existingActiveInScope || []; whById = whById || {};
  var company = replenDarStr_(scope.company), country = replenDarStr_(scope.country), marketplace = replenDarStr_(scope.marketplace);
  if (!company || !country || !marketplace) return { ok: false, error: 'MISSING_SCOPE: company + country + marketplace required' };
  if (!desired.length) return { ok: false, error: 'NO_WAREHOUSE_SELECTED: at least one self warehouse must be selected (allocation rules are the membership authority; to clear a scope, deactivate its rows explicitly)' };

  var seen = {}, upserts = [], fBp = 0, sBp = 0;
  for (var i = 0; i < desired.length; i++) {
    var d = desired[i] || {};
    var whId = replenDarStr_(d.destination_warehouse_id || d.destinationWarehouseId);
    if (!whId) return { ok: false, error: 'DESTINATION_WAREHOUSE_INVALID: blank destination_warehouse_id' };
    if (seen[whId]) return { ok: false, error: 'DEMAND_ALLOCATION_DESTINATION_CONFLICT: duplicate destination ' + whId };
    seen[whId] = 1;
    var w = whById[whId];
    if (!w) return { ok: false, error: 'DESTINATION_WAREHOUSE_INVALID: not a canonical warehouse: ' + whId };
    if (!replenDarBool_(w.is_active)) return { ok: false, error: 'DESTINATION_WAREHOUSE_INVALID: inactive warehouse: ' + whId };
    if (replenDarStr_(w.company) && replenDarStr_(w.company) !== company) return { ok: false, error: 'DESTINATION_WAREHOUSE_INVALID: cross-company warehouse: ' + whId };
    if (replenDarBool_(w.is_factory_warehouse) || REPLEN_DAR_EXEC_TYPES_[replenDarStr_(w.warehouse_type).toUpperCase()]) {
      return { ok: false, error: 'SELF_DESTINATION_INELIGIBLE: ' + whId + ' is an execution/source warehouse (' + replenDarStr_(w.warehouse_type) + ') — not a self-fulfilled planning destination' };
    }
    var f = replenDarRatioBp_(d.forecast_ratio !== undefined ? d.forecast_ratio : d.forecastRatio);
    var s = replenDarRatioBp_(d.sales_ratio !== undefined ? d.sales_ratio : d.salesRatio);
    if (f === null) return { ok: false, error: 'DEMAND_ALLOCATION_RATIO_INVALID: forecast_allocation_ratio for ' + whId + ' must be a number in [0,1]' };
    if (s === null) return { ok: false, error: 'DEMAND_ALLOCATION_RATIO_INVALID: sales_allocation_ratio for ' + whId + ' must be a number in [0,1]' };
    fBp += f; sBp += s;
    upserts.push({ destinationWarehouseId: whId, forecastRatio: f / 10000, salesRatio: s / 10000,
      allocationRuleId: 'RDAR-' + company.toUpperCase() + '-' + country.toUpperCase() + '-' + marketplace.toUpperCase().replace(/\s+/g, '_') + '-' + whId });
  }
  if (fBp !== 10000) return { ok: false, error: 'DEMAND_ALLOCATION_RATIO_TOTAL_INVALID: forecast ratios sum to ' + (fBp / 100) + '% (must be exactly 100%)' };
  if (sBp !== 10000) return { ok: false, error: 'DEMAND_ALLOCATION_RATIO_TOTAL_INVALID: sales ratios sum to ' + (sBp / 100) + '% (must be exactly 100%)' };

  var deactivates = [];
  for (var e = 0; e < existingActiveInScope.length; e++) {
    var ex = replenDarStr_(existingActiveInScope[e].destination_warehouse_id);
    if (ex && !seen[ex]) deactivates.push(ex);
  }
  return { ok: true, upserts: upserts, deactivates: deactivates };
}

/**
 * Router action `replenishmentDemandAllocation.save`. body = { company, country, marketplace,
 * allocations:[{destination_warehouse_id, forecast_ratio, sales_ratio}], updated_by? }.
 * F1-7N-D-2k-R1: persists to the KM_WAREHOUSE_ALLOCATION_CONFIG Script-Property blob (via
 * 50_api_v1_warehouse_allocation_config.gs), NOT the replenishment_demand_allocation_rules Sheet tab. The warehouses
 * sheet is still read to VALIDATE destinations (canonical / active / same-company / non-execution) via the PURE
 * planner. The scope's membership is REPLACED atomically (unselected previously-active warehouses are dropped).
 */
function handleReplenishmentDemandAllocationSave_(body) {
  body = body || {};
  var scope = { company: replenDarStr_(body.company), country: replenDarStr_(body.country), marketplace: replenDarStr_(body.marketplace) };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock (another save in progress)' });
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var whSheet = ss.getSheetByName('warehouses');
    if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found' });

    // warehouses index (raw rows) by warehouse_id — canonical destination-validation authority for the planner.
    var whData = whSheet.getDataRange().getValues();
    var whHdr = whData[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var whById = {};
    for (var wr = 1; wr < whData.length; wr++) {
      var row = {}; for (var wc = 0; wc < whHdr.length; wc++) row[whHdr[wc]] = whData[wr][wc];
      var id = replenDarStr_(row.warehouse_id); if (id) whById[id] = row;
    }

    // existing scope membership = materialized from the Script-Property config (the SSOT), not a Sheet tab.
    var io = warehouseAllocationConfigIo_();
    var cfg = warehouseAllocationParseConfig_(io.getConfig());
    var existingActiveInScope = warehouseAllocationConfigToRuleRows_(cfg, scope);   // snake rows for THIS scope

    var plan = replenDemandAllocationPlan_(scope, body.allocations || [], existingActiveInScope, whById);
    if (!plan.ok) return jsonResponse_({ success: false, error: plan.error });

    var actor = replenDarStr_(body.updated_by) || 'operation-system';
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var nextCfg = warehouseAllocationUpsertScope_(cfg, scope, plan.upserts, actor, today);
    io.setConfig(warehouseAllocationSerializeConfig_(nextCfg));

    return jsonResponse_({ success: true, data: {
      company: scope.company, country: scope.country, marketplace: scope.marketplace,
      active: plan.upserts.map(function (u) { return { destination_warehouse_id: u.destinationWarehouseId, forecast_allocation_ratio: u.forecastRatio, sales_allocation_ratio: u.salesRatio, allocation_rule_id: u.allocationRuleId, status: 'active' }; }),
      deactivated: plan.deactivates
    } });
  } catch (err) {
    return jsonResponse_({ success: false, error: (err && err.message) ? String(err.message) : String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_e) {}
  }
}

