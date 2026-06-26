// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 04_marketplace_forecast_import.gs — marketplace_skus + fc batch import
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
//       Structure-only split — no behavior change vs apps-script-web-app.gs.
// ============================================================

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

