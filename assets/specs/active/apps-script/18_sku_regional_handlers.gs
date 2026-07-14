// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 18_sku_regional_handlers.gs — SKU Domain v2.0 (Regional Details Layer 2)
// NOTE: All .gs files share ONE global scope. Copy them into the project TOGETHER. No imports.
// Implements SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md v2.0 §4/§6.
//   - handleUpsertSkuRegionalDetail_ : create/update ONE sku_regional_details row (page writer);
//     optionally sync site_sku / marketplace_product_id INTO marketplace_skus.
//   - shared helpers used by the marketplace SKU import/upsert (04_/03_) for Flow A/B sync:
//       skuRegionalLookup_          (Flow B — regional is higher-priority source)
//       skuRegionalEnsure_          (Flow A — create regional from marketplace identity if absent)
//       skuRegionalSyncIdentity_    (operational edit → regional)
// NO tax/duty/hscode/declared-value here (those live in tax_referral_rates). NO calculation.
// Match grain: sku + company + country + marketplace.
// ============================================================

// v2.0 canonical header (NO hscode/duty/declared-value; NO status/note/marketplace_sku_id).
var SKU_REGIONAL_DETAILS_HEADERS_ = [
  'regional_detail_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'product_url',
  'packaging_regulation', 'regulation_url', 'language', 'manual_version', 'label_version', 'battery_regulation',
  'created_at', 'updated_at'
];

function skuRegionalNorm_(v) { return String(v == null ? '' : v).trim(); }

// Find the regional row for (sku, company, country, marketplace). Returns
// { row, headers, col(name), siteSku, marketplaceProductId } or null. Missing-tab/header safe.
function skuRegionalFind_(ss, sku, company, country, marketplace) {
  var sh = ss.getSheetByName('sku_regional_details');
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  function col(n) { return headers.indexOf(n); }
  var cS = col('sku'), cC = col('company'), cCo = col('country'), cM = col('marketplace');
  if (cS === -1 || cCo === -1 || cM === -1) return null;
  for (var i = 1; i < data.length; i++) {
    if (skuRegionalNorm_(data[i][cS]) === skuRegionalNorm_(sku) &&
        (cC === -1 || skuRegionalNorm_(data[i][cC]) === skuRegionalNorm_(company)) &&
        skuRegionalNorm_(data[i][cCo]) === skuRegionalNorm_(country) &&
        skuRegionalNorm_(data[i][cM]) === skuRegionalNorm_(marketplace)) {
      var cSite = col('site_sku'), cPid = col('marketplace_product_id'), cAsin = col('asin');
      return {
        sheet: sh, row: i + 1, headers: headers, col: col,
        siteSku: cSite !== -1 ? skuRegionalNorm_(data[i][cSite]) : '',
        marketplaceProductId: (cPid !== -1 ? skuRegionalNorm_(data[i][cPid]) : '') || (cAsin !== -1 ? skuRegionalNorm_(data[i][cAsin]) : '')
      };
    }
  }
  return null;
}

// Flow B — regional is the higher-priority source. Returns {siteSku, marketplaceProductId} or null.
function skuRegionalLookup_(ss, sku, company, country, marketplace) {
  var f = skuRegionalFind_(ss, sku, company, country, marketplace);
  if (!f) return null;
  return { siteSku: f.siteSku, marketplaceProductId: f.marketplaceProductId };
}

// Flow A — create the regional row from marketplace identity when absent (no-op if it already exists).
// Copies identity fields only (site_sku / marketplace_product_id / product_url) — never compliance data.
function skuRegionalEnsure_(ss, obj) {
  obj = obj || {};
  var existing = skuRegionalFind_(ss, obj.sku, obj.company, obj.country, obj.marketplace);
  if (existing) return existing.row;   // already present — do not overwrite
  var sh = procurementEnsureSheet_(ss, 'sku_regional_details', SKU_REGIONAL_DETAILS_HEADERS_);
  sheetEnsureColumns_(sh, ['product_url']);   // additive: old tabs get the new identity column
  var now = procurementTimestamp_();
  procurementAppendByHeader_(sh, {
    regional_detail_id: 'SRD-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
    sku: skuRegionalNorm_(obj.sku),
    company: skuRegionalNorm_(obj.company),
    country: skuRegionalNorm_(obj.country),
    marketplace: skuRegionalNorm_(obj.marketplace),
    site_sku: skuRegionalNorm_(obj.site_sku),
    marketplace_product_id: skuRegionalNorm_(obj.marketplace_product_id),
    product_url: skuRegionalNorm_(obj.product_url),
    created_at: now, updated_at: now
  });
  return -1;
}

// Operational edit → regional. Update site_sku / marketplace_product_id / product_url on the regional
// row (create if absent). Only writes fields that are provided (non-undefined & non-blank). Never
// touches compliance fields (packaging_regulation / regulation_url / language / ... / battery_regulation).
function skuRegionalSyncIdentity_(ss, sku, company, country, marketplace, siteSku, productId, productUrl) {
  var f = skuRegionalFind_(ss, sku, company, country, marketplace);
  if (!f) {
    skuRegionalEnsure_(ss, { sku: sku, company: company, country: country, marketplace: marketplace, site_sku: siteSku, marketplace_product_id: productId, product_url: productUrl });
    return;
  }
  sheetEnsureColumns_(f.sheet, ['product_url']);
  var now = procurementTimestamp_();
  var cSite = f.col('site_sku'), cPid = f.col('marketplace_product_id'), cUrl = f.col('product_url'), cU = f.col('updated_at');
  // f.col() indices predate the ensure above; re-resolve product_url from the live header if needed.
  if (cUrl === -1) { var hh = f.sheet.getRange(1, 1, 1, f.sheet.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim().toLowerCase(); }); cUrl = hh.indexOf('product_url'); }
  if (siteSku !== undefined && siteSku !== '' && cSite !== -1) f.sheet.getRange(f.row, cSite + 1).setValue(skuRegionalNorm_(siteSku));
  if (productId !== undefined && productId !== '' && cPid !== -1) f.sheet.getRange(f.row, cPid + 1).setValue(skuRegionalNorm_(productId));
  if (productUrl !== undefined && productUrl !== '' && cUrl !== -1) f.sheet.getRange(f.row, cUrl + 1).setValue(skuRegionalNorm_(productUrl));
  if (cU !== -1) f.sheet.getRange(f.row, cU + 1).setValue(now);
}

// ---- handleUpsertSkuRegionalDetail_ (SKU Regional Details page writer) ----
/**
 * Upsert ONE sku_regional_details row (by sku+company+country+marketplace). Body:
 *   { sku, company, country, marketplace, site_sku?, marketplace_product_id?, packaging_regulation?,
 *     regulation_url?, language?, manual_version?, label_version?, battery_regulation?,
 *     sync_marketplace_sku? }
 * When sync_marketplace_sku is truthy, propagates site_sku / marketplace_product_id INTO the matching
 * marketplace_skus row (regional = higher-priority source). Returns { regional_detail_id, synced }.
 */
function handleUpsertSkuRegionalDetail_(body) {
  var sku = skuRegionalNorm_(body && body.sku);
  var company = skuRegionalNorm_(body && body.company);
  var country = skuRegionalNorm_(body && body.country);
  var marketplace = skuRegionalNorm_(body && body.marketplace);
  if (!sku) return jsonResponse_({ success: false, error: 'Missing sku' });
  if (!country) return jsonResponse_({ success: false, error: 'Missing country' });
  if (!marketplace) return jsonResponse_({ success: false, error: 'Missing marketplace' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'sku_regional_details', SKU_REGIONAL_DETAILS_HEADERS_);
  sheetEnsureColumns_(sh, ['product_url']);   // additive: old tabs get the new identity column
  var now = procurementTimestamp_();

  var fields = ['site_sku', 'marketplace_product_id', 'product_url', 'packaging_regulation', 'regulation_url', 'language', 'manual_version', 'label_version', 'battery_regulation'];
  var found = skuRegionalFind_(ss, sku, company, country, marketplace);
  var regionalId;

  if (found) {
    regionalId = (function () { var c = found.col('regional_detail_id'); return c !== -1 ? skuRegionalNorm_(found.sheet.getRange(found.row, c + 1).getValue()) : ''; })();
    fields.forEach(function (f) {
      if (body[f] === undefined) return;
      var c = found.col(f);
      if (c !== -1) found.sheet.getRange(found.row, c + 1).setValue(skuRegionalNorm_(body[f]));
    });
    var cU = found.col('updated_at');
    if (cU !== -1) found.sheet.getRange(found.row, cU + 1).setValue(now);
  } else {
    regionalId = 'SRD-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    var rec = { regional_detail_id: regionalId, sku: sku, company: company, country: country, marketplace: marketplace, created_at: now, updated_at: now };
    fields.forEach(function (f) { if (body[f] !== undefined) rec[f] = skuRegionalNorm_(body[f]); });
    procurementAppendByHeader_(sh, rec);
  }

  // Sync identity INTO marketplace_skus (regional = higher-priority source).
  var synced = false;
  if (body && body.sync_marketplace_sku && (body.site_sku !== undefined || body.marketplace_product_id !== undefined)) {
    synced = marketplaceSkuSyncIdentity_(ss, sku, company, country, marketplace, body.site_sku, body.marketplace_product_id);
  }

  return jsonResponse_({ success: true, data: { regional_detail_id: regionalId, updated: !!found, synced: synced } });
}

// ---- handleSyncMarketplaceSkusToSkuRegionalDetails_ (idempotent, resumable backfill) ----
var SKU_REGIONAL_SYNC_DEFAULT_BATCH_ = 300;   // creates per execution (timeout guard)

/**
 * Idempotent, resumable backfill. Walks ALL marketplace_skus rows and CREATES the missing
 * sku_regional_details row for each (match key sku+company+country+marketplace).
 *
 * Performance / safety:
 *   - Existing regional keys are indexed ONCE up front (single sheet read), so per-row lookup is O(1)
 *     instead of re-reading the whole regional sheet every row (the old timeout cause).
 *   - IDEMPOTENT: a row whose key already exists is skipped immediately — never updated, never rewritten.
 *   - Each create is appended AND flushed immediately, so a later timeout never rolls back earlier rows.
 *   - BATCH LIMIT (body.batch_limit, default 300) caps CREATES per execution; when hit it stops
 *     gracefully and reports what remains. Just click Sync again to continue — already-created rows are
 *     skipped, so it converges with no duplicates.
 *
 * Never touches compliance-document fields (packaging_regulation / regulation_url / language /
 * manual_version / label_version / battery_regulation). Uses marketplace_product_id only (never asin).
 *
 * Returns { created_count, skipped_exists_count, skipped_invalid_count, remaining_count,
 *           next_start_index, finished, batch_limit, warning_count, errors, warnings }.
 */
function handleSyncMarketplaceSkusToSkuRegionalDetails_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var batchLimit = (body && parseInt(body.batch_limit, 10)) || SKU_REGIONAL_SYNC_DEFAULT_BATCH_;
  if (!(batchLimit > 0)) batchLimit = SKU_REGIONAL_SYNC_DEFAULT_BATCH_;
  if (batchLimit > 5000) batchLimit = 5000;   // hard ceiling

  var summary = {
    created_count: 0, skipped_exists_count: 0, skipped_invalid_count: 0,
    remaining_count: 0, next_start_index: null, finished: true, batch_limit: batchLimit,
    warning_count: 0, errors: [], warnings: []
  };

  var src = ss.getSheetByName('marketplace_skus');
  if (!src) {
    summary.errors.push('marketplace_skus tab not found');
    return jsonResponse_({ success: false, error: 'marketplace_skus tab not found', data: summary });
  }
  var data = src.getDataRange().getValues();
  if (data.length < 2) {
    summary.warnings.push('marketplace_skus has no data rows');
    summary.warning_count = summary.warnings.length;
    return jsonResponse_({ success: true, data: summary });
  }
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function col(n) { return h.indexOf(n); }
  var cS = col('sku'), cC = col('company'), cCo = col('country'), cM = col('marketplace');
  var cSite = col('site_sku'), cPid = col('marketplace_product_id'), cAsin = col('asin');
  if (cS === -1 || cCo === -1 || cM === -1) {
    summary.errors.push('marketplace_skus missing required header(s): sku / country / marketplace');
    return jsonResponse_({ success: false, error: 'marketplace_skus missing required headers', data: summary });
  }

  // Ensure target sheet exists, then index existing regional keys ONCE (single read).
  var tgt = procurementEnsureSheet_(ss, 'sku_regional_details', SKU_REGIONAL_DETAILS_HEADERS_);
  var seen = skuRegionalKeyIndex_(tgt);

  function keyOf(sku, company, country, marketplace) {
    return skuRegionalNorm_(sku).toLowerCase() + '||' + skuRegionalNorm_(company).toLowerCase() + '||' +
           skuRegionalNorm_(country).toLowerCase() + '||' + skuRegionalNorm_(marketplace).toLowerCase();
  }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var sku = skuRegionalNorm_(row[cS]);
    var company = cC !== -1 ? skuRegionalNorm_(row[cC]) : '';
    var country = skuRegionalNorm_(row[cCo]);
    var marketplace = skuRegionalNorm_(row[cM]);

    // (1) invalid — missing identity.
    if (!sku || !company || !country || !marketplace) {
      summary.skipped_invalid_count++;
      if (summary.warnings.length < 50) {
        summary.warnings.push('Row ' + (i + 1) + ' skipped (invalid) — missing ' +
          [!sku ? 'sku' : '', !company ? 'company' : '', !country ? 'country' : '', !marketplace ? 'marketplace' : '']
            .filter(function (x) { return x; }).join('/'));
      }
      continue;
    }

    var key = keyOf(sku, company, country, marketplace);

    // (2) already exists (in DB or created earlier this run) — skip immediately, no update.
    if (seen[key]) { summary.skipped_exists_count++; continue; }

    // (3) needs creation, but the per-execution create budget is spent — defer to a later click.
    if (summary.created_count >= batchLimit) {
      seen[key] = 1;                       // avoid double-counting duplicate source rows as remaining
      summary.remaining_count++;
      if (summary.next_start_index === null) summary.next_start_index = i;   // 0-based data index to resume
      summary.finished = false;
      continue;
    }

    // (4) create + commit immediately (so a timeout cannot roll back earlier rows).
    var siteSku = cSite !== -1 ? skuRegionalNorm_(row[cSite]) : '';
    var productId = (cPid !== -1 ? skuRegionalNorm_(row[cPid]) : '') || (cAsin !== -1 ? skuRegionalNorm_(row[cAsin]) : '');
    var now = procurementTimestamp_();
    try {
      procurementAppendByHeader_(tgt, {
        regional_detail_id: 'SRD-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
        sku: sku, company: company, country: country, marketplace: marketplace,
        site_sku: siteSku, marketplace_product_id: productId,
        created_at: now, updated_at: now
      });
      SpreadsheetApp.flush();             // persist this row before moving on
      seen[key] = 1;
      summary.created_count++;
    } catch (rowErr) {
      summary.errors.push('Row ' + (i + 1) + ' (' + sku + '/' + company + '/' + country + '/' + marketplace + '): ' + rowErr.message);
    }
  }

  summary.warning_count = summary.warnings.length;
  return jsonResponse_({ success: true, data: summary });
}

// Build an O(1) lookup of existing sku_regional_details keys (sku|company|country|marketplace,
// lowercased). Single sheet read. Missing-tab/header safe (returns {}).
function skuRegionalKeyIndex_(sheet) {
  var idx = {};
  if (!sheet) return idx;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return idx;
  var headers = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cS = headers.indexOf('sku'), cC = headers.indexOf('company'),
      cCo = headers.indexOf('country'), cM = headers.indexOf('marketplace');
  if (cS === -1 || cCo === -1 || cM === -1) return idx;
  for (var i = 1; i < data.length; i++) {
    var k = skuRegionalNorm_(data[i][cS]).toLowerCase() + '||' +
            (cC !== -1 ? skuRegionalNorm_(data[i][cC]).toLowerCase() : '') + '||' +
            skuRegionalNorm_(data[i][cCo]).toLowerCase() + '||' +
            skuRegionalNorm_(data[i][cM]).toLowerCase();
    idx[k] = 1;
  }
  return idx;
}

// Propagate identity INTO marketplace_skus (used by regional → operational sync). Writes canonical
// marketplace_product_id only (never asin). Returns true when a matching row was updated.
function marketplaceSkuSyncIdentity_(ss, sku, company, country, marketplace, siteSku, productId) {
  var sh = ss.getSheetByName('marketplace_skus');
  if (!sh) return false;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return false;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function col(n) { return h.indexOf(n); }
  var cS = col('sku'), cC = col('company'), cCo = col('country'), cM = col('marketplace');
  if (cS === -1 || cCo === -1 || cM === -1) return false;
  var cSite = col('site_sku'), cPid = col('marketplace_product_id'), cU = col('updated_at');
  var now = procurementTimestamp_();
  var updated = false;
  for (var i = 1; i < data.length; i++) {
    if (skuRegionalNorm_(data[i][cS]) === skuRegionalNorm_(sku) &&
        (cC === -1 || skuRegionalNorm_(data[i][cC]) === skuRegionalNorm_(company)) &&
        skuRegionalNorm_(data[i][cCo]) === skuRegionalNorm_(country) &&
        skuRegionalNorm_(data[i][cM]) === skuRegionalNorm_(marketplace)) {
      if (siteSku !== undefined && siteSku !== '' && cSite !== -1) sh.getRange(i + 1, cSite + 1).setValue(skuRegionalNorm_(siteSku));
      if (productId !== undefined && productId !== '' && cPid !== -1) sh.getRange(i + 1, cPid + 1).setValue(skuRegionalNorm_(productId));
      if (cU !== -1) sh.getRange(i + 1, cU + 1).setValue(now);
      updated = true;
    }
  }
  return updated;
}
