// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 20_campaign_write_handlers.gs — Campaign write path (Special Event Builder)
//   campaigns + campaign_sku_lines idempotent upsert.
// NOTE: All .gs files in this folder share ONE global scope in the Apps Script
//       project. Copy them into the project TOGETHER and REDEPLOY. No imports.
//       Reuses the fcWrite* helpers defined in 14_fc_write_handlers.gs
//       (fcWriteEnsureSheet_ / fcWriteEnsureColumns_ / fcWriteReadSheet_ /
//        fcWriteAppendByHeader_ / fcWriteUpsert_ / fcWriteTimestamp_).
//
// Domain ownership (DATA MODEL COMPATIBILITY §14):
//   campaigns          = campaign header, schedule, promotion type, aggregate performance.
//   campaign_sku_lines = per-marketplace-SKU price/promotion config + SKU-level performance.
//   fc_special_events  = per-SKU event forecast (written by 14_fc_write_handlers.gs, linked by
//                        campaign_id + campaign_sku_line_id).
//
// IDENTITY / SCOPE:
//   A campaign cannot be uniquely scoped by country + marketplace alone (the same marketplace name
//   can belong to two companies, e.g. KM Amazon vs ResUS Amazon), so `company` + `marketplace_id`
//   are additive identity columns on campaigns; `marketplace_sku_id` is the canonical marketplace-SKU
//   identity on campaign_sku_lines. `sku` is retained as the Master-SKU display snapshot.
//
// MIGRATION SAFETY: additive columns only. fcWriteEnsureColumns_ appends any missing header to the
//   live sheet's header row; it never renames or drops a live column. No destructive migration.
// ============================================================

// campaigns canonical header (existing columns + additive `company`, `marketplace_id`).
var CAMPAIGNS_HEADERS_ = [
  'campaign_id', 'company', 'marketplace_id', 'campaign_name', 'country', 'marketplace',
  'promotion_type', 'major_event_flag', 'event_flag', 'year', 'start_date', 'end_date', 'duration',
  'status', 'event_reporting_fee', 'commission', 'total_sales_amount', 'total_sales_units',
  'total_ad_cost', 'total_acos', 'source', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

// campaign_sku_lines canonical header (existing columns + additive `marketplace_sku_id`, `price_units`).
// promo_price = the deal/promotional price (the Special Event Builder's "Deal Price").
// price_units = the currency snapshot of the SAME pricing_list row that supplied regular_price / promo_price
//   (e.g. USD / CAD / AUD / GBP / EUR / JPY). It is a display/audit currency snapshot only — NOT a sales
//   amount and NOT an FX rate; sales_amount / sales_units local-vs-USD canonicalization is undecided elsewhere.
var CAMPAIGN_SKU_LINES_HEADERS_ = [
  'campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku', 'promo_price', 'regular_price',
  'price_units', 'discount_percent', 'special_condition', 'lps', 'line_status', 'source',
  'created_by', 'created_at', 'updated_by', 'updated_at'
];

function campaignUpper_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }

/**
 * Resolve an existing campaign_id by business key company|country|marketplace|campaign_name|year
 * (company-safe idempotency when no campaign_id is supplied). Returns '' if none.
 */
function campaignFindByKey_(sheet, key) {
  var s = fcWriteReadSheet_(sheet);
  var iId = s.col('campaign_id');
  if (iId === -1) return '';
  var iCo = s.col('company'), iCt = s.col('country'), iMk = s.col('marketplace'),
      iNm = s.col('campaign_name'), iYr = s.col('year');
  for (var i = 1; i < s.rows.length; i++) {
    var r = s.rows[i];
    if (iNm !== -1 && campaignUpper_(r[iNm]) !== campaignUpper_(key.campaign_name)) continue;
    if (iCo !== -1 && campaignUpper_(r[iCo]) !== campaignUpper_(key.company)) continue;
    if (iCt !== -1 && campaignUpper_(r[iCt]) !== campaignUpper_(key.country)) continue;
    if (iMk !== -1 && campaignUpper_(r[iMk]) !== campaignUpper_(key.marketplace)) continue;
    if (iYr !== -1 && key.year != null && String(key.year) !== '' &&
        campaignUpper_(r[iYr]) !== campaignUpper_(key.year)) continue;
    var id = String(r[iId] || '').trim();
    if (id) return id;
  }
  return '';
}

/**
 * Resolve an existing campaign_sku_line_id for a campaign line. Prefers marketplace_sku_id (canonical
 * identity); falls back to sku when the line has no marketplace_sku_id. Returns '' if none.
 */
function campaignLineFindByKey_(sheet, campaignId, marketplaceSkuId, sku) {
  var s = fcWriteReadSheet_(sheet);
  var iId = s.col('campaign_sku_line_id');
  if (iId === -1) return '';
  var iCmp = s.col('campaign_id'), iMsku = s.col('marketplace_sku_id'), iSku = s.col('sku');
  var wantMsku = campaignUpper_(marketplaceSkuId), wantSku = campaignUpper_(sku);
  for (var i = 1; i < s.rows.length; i++) {
    var r = s.rows[i];
    if (iCmp !== -1 && campaignUpper_(r[iCmp]) !== campaignUpper_(campaignId)) continue;
    if (wantMsku) {
      if (iMsku !== -1 && campaignUpper_(r[iMsku]) === wantMsku) { var a = String(r[iId] || '').trim(); if (a) return a; }
      continue;
    }
    if (iSku !== -1 && campaignUpper_(r[iSku]) === wantSku) { var b = String(r[iId] || '').trim(); if (b) return b; }
  }
  return '';
}

// ---- campaigns ----

/**
 * Create/update a campaign header. Body: { campaign_id?, company, marketplace_id?, campaign_name,
 * country, marketplace, promotion_type?, major_event_flag?, event_flag?, year?, start_date?,
 * end_date?, status?, source?, actor? }. Idempotent by campaign_id, else by
 * company|country|marketplace|campaign_name|year. Returns { campaign_id, created }.
 */
function handleUpsertCampaign_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  var name = String(body.campaign_name || body.event_name || '').trim();
  if (!name) return jsonResponse_({ success: false, error: 'Missing campaign_name' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = fcWriteEnsureSheet_(ss, 'campaigns', CAMPAIGNS_HEADERS_);
  fcWriteEnsureColumns_(sheet, CAMPAIGNS_HEADERS_);

  var id = String(body.campaign_id || '').trim();
  if (!id) {
    id = campaignFindByKey_(sheet, {
      company: body.company, country: body.country, marketplace: body.marketplace,
      campaign_name: name, year: body.year
    });
  }
  if (!id) id = 'CMP-' + Utilities.getUuid().substring(0, 10).toUpperCase();

  body.campaign_name = name;
  var result;
  try {
    result = fcWriteUpsert_(ss, 'campaigns', CAMPAIGNS_HEADERS_, 'campaign_id', id, body, actor);
  } catch (e) {
    return jsonResponse_({ success: false, error: String(e && e.message ? e.message : e) });
  }
  return jsonResponse_({ success: true, data: { campaign_id: result.id, created: result.created } });
}

// ---- campaign_sku_lines ----

/**
 * Batch create/update campaign SKU lines for one campaign. Body: { campaign_id,
 * lines: [ { campaign_sku_line_id?, marketplace_sku_id?, sku, regular_price?, deal_price?/promo_price?,
 * discount_percent?, special_condition?, line_status?, source? } ], actor? }.
 * Idempotent per line by campaign_sku_line_id, else campaign_id + marketplace_sku_id (or + sku).
 * Returns { campaign_id, upserted, created, updated, lines: [ { campaign_sku_line_id, sku, created } ] }.
 */
function handleUpsertCampaignSkuLines_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  var campaignId = String(body.campaign_id || '').trim();
  if (!campaignId) return jsonResponse_({ success: false, error: 'Missing campaign_id' });
  var lines = (body.lines && body.lines.length) ? body.lines : [];
  if (!lines.length) return jsonResponse_({ success: false, error: 'No campaign_sku_lines to write' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = fcWriteEnsureSheet_(ss, 'campaign_sku_lines', CAMPAIGN_SKU_LINES_HEADERS_);
  fcWriteEnsureColumns_(sheet, CAMPAIGN_SKU_LINES_HEADERS_);

  var out = [], created = 0, updated = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i] || {};
    var sku = String(l.sku || '').trim();
    if (!sku && !String(l.marketplace_sku_id || '').trim()) {
      return jsonResponse_({ success: false, error: 'Line ' + (i + 1) + ': missing sku / marketplace_sku_id' });
    }
    var lineId = String(l.campaign_sku_line_id || '').trim();
    if (!lineId) lineId = campaignLineFindByKey_(sheet, campaignId, l.marketplace_sku_id, sku);
    if (!lineId) lineId = 'CSL-' + Utilities.getUuid().substring(0, 10).toUpperCase();

    var payload = {
      campaign_id: campaignId,
      marketplace_sku_id: String(l.marketplace_sku_id || '').trim(),
      sku: sku,
      // promo_price = deal price (accept either key).
      promo_price: (l.deal_price != null && l.deal_price !== '') ? l.deal_price : l.promo_price,
      regular_price: l.regular_price,
      // price_units = pricing_list currency snapshot (accept price_units or legacy currency key).
      price_units: (l.price_units != null && l.price_units !== '') ? l.price_units : l.currency,
      discount_percent: l.discount_percent,
      special_condition: l.special_condition,
      line_status: String(l.line_status || 'active').trim(),
      source: String(l.source || 'fc_summary_builder').trim()
    };
    var result;
    try {
      result = fcWriteUpsert_(ss, 'campaign_sku_lines', CAMPAIGN_SKU_LINES_HEADERS_,
        'campaign_sku_line_id', lineId, payload, actor);
    } catch (e) {
      return jsonResponse_({ success: false, error: 'Line ' + (i + 1) + ' (' + sku + '): ' +
        String(e && e.message ? e.message : e) });
    }
    if (result.created) created++; else updated++;
    out.push({ campaign_sku_line_id: result.id, sku: sku, created: result.created });
  }
  return jsonResponse_({ success: true, data: { campaign_id: campaignId, upserted: out.length,
    created: created, updated: updated, lines: out } });
}
