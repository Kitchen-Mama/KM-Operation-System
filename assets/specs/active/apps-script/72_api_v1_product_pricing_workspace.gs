/**
 * 72_api_v1_product_pricing_workspace.gs
 * Kitchen Mama Operation System — API v1 · PRODUCT PRICING SITE-SCOPED READ Workspace (PRODUCT-STRATEGY-P1-B1).
 *
 * SOURCE MIRROR / requires Apps Script sync. Action = "productPricing.workspace.get" — a body-carrying READ.
 *
 * WHAT THIS OWNS, AND THE ONE THING IT DECIDES. P1-B0 §31 froze three tables with no bounded read owner —
 * pricing_list, campaigns, campaign_sku_lines — and, more importantly, named the question nobody owned:
 * WHICH SKUs EXIST ON A SITE. This action is the site-membership authority. It resolves the membership
 * universe from marketplace_skus SERVER-SIDE, and everything else in the response is enrichment OF A MEMBER.
 *
 * MEMBERSHIP IS A FACT, NOT AN INFERENCE. A SKU is sold on a site only when marketplace_skus says so, for
 * that exact company + country + marketplace. It is never inferred from sku_details, from a currency, from an
 * image_url, from a price existing, or from a SKU naming pattern. A master SKU with no marketplace_skus row
 * in scope is ABSENT — not greyed, not zero-priced, not "missing data".
 *
 * AND THE DECISION IS MADE HERE RATHER THAN IN THE BROWSER, deliberately. A client filter over everything is
 * a rendering choice: it can be widened by a payload, a stale cache or a bug, and when it is widened nothing
 * on screen says so. So an unscoped read is REFUSED rather than answered with everything.
 *
 * THE JOINS, EACH ON THE KEY THE LIVE SCHEMA ACTUALLY HAS:
 *   sku_details          by `sku`
 *   sku_regional_details by the FOUR-PART business identity sku + company + country + marketplace — NOT by
 *                        marketplace_sku_id, which that table does not have (18_sku_regional_handlers.gs:13,
 *                        :16-23). It is the one edge that does not travel on an id, so it is the one that can
 *                        silently half-match, and all four parts are taken from the membership row itself.
 *   pricing_list         by `marketplace_sku_id` ONLY. pricing_list has no `company` column, so its country /
 *                        marketplace are denormalised copies: two companies on one country|marketplace|sku
 *                        are distinguishable only by the id, and a (country, marketplace, sku) join would
 *                        silently return the other company's price.
 *   campaign_sku_lines   by `marketplace_sku_id`, then campaigns by `campaign_id`, then the campaign's own
 *                        company / country / marketplace are checked against the scope column by column.
 *
 * READ-ONLY BY CONSTRUCTION. No setValue, no setValues, no appendRow, no insertRow, no deleteRow, no clear,
 * no clearContent, no createSheet, no ensure-sheet, no writer call, no LockService. It never creates a
 * missing table: a missing source is a typed refusal, because inventing a sheet is how a schema gap becomes
 * invisible. The spreadsheet is opened only through the exact-ID production gate, and neither a spreadsheet
 * id nor a sheet name may arrive in the request.
 *
 * FLAG-GATED, AND THE GATE IS BEFORE THE DOOR. While PRODUCT_STRATEGY_ENABLED_ is false this action refuses
 * with FEATURE_DISABLED having opened nothing and read nothing. There is no RBAC in this system (P0 §13.1
 * measured it), so the flag is not a convenience — it IS the access control, and a control that runs after
 * the read is not a control.
 *
 * Testability: every builder is a pure `function` declaration (extract+eval friendly) and the impure
 * orchestrator takes an injectable `io`, so the whole contract runs against fixtures with ZERO SpreadsheetApp.
 */

// Module stamp — the ROUND this file last changed, not the deployment release.
var PPW_BUILD_VERSION_ = 'PRODUCT-STRATEGY-P1-B1';

var PPW_ACTION_ = 'productPricing.workspace.get';
var PPW_WS_SEQ_ = 0;

// The four site statuses, from 00_config.gs:12 (VALID_MARKETPLACE_SKU_STATUSES_). There is no `running`:
// "Running in the Market" is a MASTER lifecycle on sku_details and says nothing about one site.
var PPW_STATUSES_ = ['active', 'phasing_out', 'inactive', 'discontinued'];
// DEFAULT = ON SALE. `phasing_out` is still purchasable, so excluding it would understate the ladder a buyer
// actually faces; calling it active would misreport it. It is included and badged with its exact value.
var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out'];
var PPW_INACTIVE_STATUSES_ = ['inactive', 'discontinued'];

// Source-table backstop. Never silently applied — a capped source makes membership or join completeness
// unprovable, and that is a refusal rather than a shorter answer.
var PPW_SOURCE_ROW_MAX_ = 50000;
// normalizedRows is the page grain. There is no per-table pagination, on purpose: six independently pageable
// tables would let a client assemble a view no server ever agreed to.
var PPW_PAGE_DEFAULT_ = 200;
var PPW_PAGE_MAX_ = 1000;
var PPW_CAMPAIGNS_PER_SKU_MAX_ = 50;
var PPW_CURSOR_PREFIX_ = 'PPW1';

// A request field this action does not have is a request field it must REFUSE, not ignore. Ignoring
// `spreadsheetId` would mean a caller could believe it had redirected the read.
var PPW_FORBIDDEN_REQUEST_FIELDS_ = ['spreadsheetId', 'spreadsheet_id', 'sheet', 'sheetName',
  'sheet_name', 'table', 'tables', 'sql', 'query'];

var PPW_TABLES_ = [
  { name: 'marketplace_skus', gate: null,
    requiredCols: ['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace'] },
  { name: 'sku_details', gate: null, requiredCols: ['sku'] },
  { name: 'sku_regional_details', gate: 'regional',
    requiredCols: ['sku', 'company', 'country', 'marketplace'] },
  { name: 'pricing_list', gate: 'pricing', requiredCols: ['marketplace_sku_id'] },
  { name: 'campaign_sku_lines', gate: 'campaigns', requiredCols: ['campaign_id', 'marketplace_sku_id'] },
  { name: 'campaigns', gate: 'campaigns', requiredCols: ['campaign_id'] }
];

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock, no Spreadsheet)
// --------------------------------------------------------------------------------------------------------
function ppwStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function ppwLower_(v) { return ppwStr_(v).toLowerCase(); }
function ppwIsObj_(v) { return !!v && typeof v === 'object' && !(v instanceof Array); }

/** A number, or null. Never 0 for "absent" — a missing price is not a price of zero, and that difference is
 *  the whole reason a SKU without pricing is excluded from the axis rather than drawn at the bottom of it. */
function ppwNum_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

/** FNV-1a over a string. Local and pure so a cursor can be built and verified without Utilities. */
function ppwHash_(s) {
  var h = 2166136261;
  s = String(s === undefined || s === null ? '' : s);
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return ('00000000' + h.toString(16).toUpperCase()).slice(-8);
}

/** The four-part regional key. Case-folded because a site is not a different site for being typed in caps. */
function ppwSiteKey_(sku, company, country, marketplace) {
  return ppwLower_(sku) + '||' + ppwLower_(company) + '||' + ppwLower_(country) + '||'
    + ppwLower_(marketplace);
}

function ppwRefusal_(code, detail, subject) {
  return { code: code, detail: detail === undefined ? null : detail,
    subject: subject === undefined ? null : subject };
}

function ppwEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'workspace', action: PPW_ACTION_, workspace: 'productPricing',
    build: PPW_BUILD_VERSION_, read_only: true, db_writes: 0, cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m,
    errors: ok ? [] : (errors || []) };
}

/** Cap one source array, reporting the truncation rather than performing it quietly. */
function ppwCap_(rows) {
  rows = rows || [];
  if (rows.length <= PPW_SOURCE_ROW_MAX_) {
    return { rows: rows, capped: false, total: rows.length, returned: rows.length };
  }
  return { rows: rows.slice(0, PPW_SOURCE_ROW_MAX_), capped: true, total: rows.length,
    returned: PPW_SOURCE_ROW_MAX_ };
}

// --------------------------------------------------------------------------------------------------------
// §1 REQUEST VALIDATION — everything that can be decided without touching a table is decided here, so a
// malformed or unscoped request costs ZERO reads instead of being narrowed after the fact.
// --------------------------------------------------------------------------------------------------------
function ppwValidateRequest_(payload) {
  payload = ppwIsObj_(payload) ? payload : {};
  var refusals = [];
  var rawScope = ppwIsObj_(payload.scope) ? payload.scope : {};
  var scope = { company: ppwStr_(rawScope.company), country: ppwStr_(rawScope.country),
    marketplace: ppwStr_(rawScope.marketplace) };

  // NO DEFAULTS, AND NO DERIVATION. A country is not implied by a currency and a company is not implied by a
  // marketplace name — the same marketplace name belongs to two companies, which is exactly why
  // marketplace_skus carries company at all.
  var missing = [];
  ['company', 'country', 'marketplace'].forEach(function (k) { if (scope[k] === '') missing.push(k); });
  if (missing.length) {
    refusals.push(ppwRefusal_('SCOPE_INCOMPLETE',
      'company, country and marketplace are all required and none may be defaulted or derived', missing));
  }

  PPW_FORBIDDEN_REQUEST_FIELDS_.forEach(function (f) {
    if (Object.prototype.hasOwnProperty.call(payload, f)) {
      refusals.push(ppwRefusal_('UNSUPPORTED_REQUEST_FIELD',
        'this action reads a fixed table set from the exact production target; a caller may not name a'
        + ' spreadsheet, a sheet or a query', f));
    }
  });

  var rawFilters = ppwIsObj_(payload.filters) ? payload.filters : {};
  var includeInactive = rawFilters.include_inactive === true;
  var statuses = null;
  if (rawFilters.statuses !== undefined && rawFilters.statuses !== null) {
    if (!(rawFilters.statuses instanceof Array)) {
      refusals.push(ppwRefusal_('INVALID_STATUS_FILTER', 'statuses must be an array', null));
    } else {
      var unknown = [];
      statuses = [];
      rawFilters.statuses.forEach(function (s) {
        var v = ppwLower_(s);
        if (PPW_STATUSES_.indexOf(v) === -1) { unknown.push(ppwStr_(s)); return; }
        if (statuses.indexOf(v) === -1) statuses.push(v);
      });
      // FAIL CLOSED ON AN UNKNOWN STATUS. Dropping it would answer a narrower question than the one asked,
      // and the caller would have no way to notice.
      if (unknown.length) {
        refusals.push(ppwRefusal_('UNKNOWN_STATUS_VALUE',
          'the only site statuses are ' + PPW_STATUSES_.join(', '), unknown));
        statuses = null;
      } else if (!statuses.length) {
        refusals.push(ppwRefusal_('INVALID_STATUS_FILTER', 'statuses was empty', null));
        statuses = null;
      }
    }
  }
  var effectiveStatuses = statuses
    ? statuses.slice()
    : (includeInactive ? PPW_DEFAULT_STATUSES_.concat(PPW_INACTIVE_STATUSES_)
      : PPW_DEFAULT_STATUSES_.slice());

  var rawInclude = ppwIsObj_(payload.include) ? payload.include : {};
  var include = {
    // regional and pricing default ON because the response's own counts (regionalMissingCount,
    // pricingMissingCount, analysableSiteSkuCount) are unanswerable without them. campaigns defaults OFF
    // because an un-requested include must cost no read.
    regional: rawInclude.regional === undefined ? true : rawInclude.regional === true,
    pricing: rawInclude.pricing === undefined ? true : rawInclude.pricing === true,
    campaigns: rawInclude.campaigns === true
  };

  var rawPage = ppwIsObj_(payload.page) ? payload.page : {};
  var limit = PPW_PAGE_DEFAULT_;
  if (rawPage.limit !== undefined && rawPage.limit !== null && rawPage.limit !== '') {
    var n = Number(rawPage.limit);
    if (!isFinite(n) || n <= 0 || Math.floor(n) !== n) {
      refusals.push(ppwRefusal_('INVALID_PAGE_LIMIT', 'limit must be a positive integer', rawPage.limit));
    } else if (n > PPW_PAGE_MAX_) {
      refusals.push(ppwRefusal_('PAGE_LIMIT_EXCEEDS_MAXIMUM', 'the hard maximum is ' + PPW_PAGE_MAX_, n));
    } else {
      limit = n;
    }
  }

  // THE CURSOR IS BOUND TO THE SCOPE IT WAS ISSUED FOR. A cursor that survived a scope change would page
  // through one site's rows using another site's offsets, which is cross-site contamination arriving by the
  // back door.
  var identity = ppwHash_(JSON.stringify({
    company: ppwLower_(scope.company), country: ppwLower_(scope.country),
    marketplace: ppwLower_(scope.marketplace),
    category: ppwLower_(rawFilters.category), series: ppwLower_(rawFilters.series),
    statuses: effectiveStatuses.slice().sort(), include: include
  }));
  var offset = 0;
  var cursor = ppwStr_(rawPage.cursor);
  if (cursor !== '') {
    var parts = cursor.split('-');
    if (parts.length !== 3 || parts[0] !== PPW_CURSOR_PREFIX_) {
      refusals.push(ppwRefusal_('INVALID_CURSOR', 'the cursor is not one this action issued', cursor));
    } else if (parts[1] !== identity) {
      refusals.push(ppwRefusal_('CURSOR_SCOPE_MISMATCH',
        'this cursor was issued for a different scope or filter set', cursor));
    } else {
      var off = Number(parts[2]);
      if (!isFinite(off) || off < 0 || Math.floor(off) !== off) {
        refusals.push(ppwRefusal_('INVALID_CURSOR', 'the cursor offset is not a whole number', cursor));
      } else { offset = off; }
    }
  }

  return {
    ok: refusals.length === 0,
    refusals: refusals,
    scope: scope,
    filters: { category: ppwStr_(rawFilters.category) || null,
      series: ppwStr_(rawFilters.series) || null,
      statuses: effectiveStatuses, include_inactive: includeInactive,
      statuses_were_explicit: statuses !== null },
    include: include,
    page: { limit: limit, offset: offset, cursor: cursor === '' ? null : cursor, identity: identity }
  };
}

/** Which tables this request will read, in order. The membership pair is always read; the rest are gated. */
function ppwTablesFor_(include) {
  return PPW_TABLES_.filter(function (t) {
    return t.gate === null || include[t.gate] === true;
  });
}

// --------------------------------------------------------------------------------------------------------
// §2 MEMBERSHIP — the universe, resolved from marketplace_skus and from nothing else.
// --------------------------------------------------------------------------------------------------------
function ppwMembership_(marketplaceSkus, scope, statuses) {
  var wantedCompany = ppwLower_(scope.company);
  var wantedCountry = ppwLower_(scope.country);
  var wantedMarketplace = ppwLower_(scope.marketplace);
  var inScope = [], byId = {}, dupIds = {}, statusCounts = {}, excludedByStatus = 0, blankId = 0;
  PPW_STATUSES_.forEach(function (s) { statusCounts[s] = 0; });
  statusCounts.__unknown = 0;

  (marketplaceSkus || []).forEach(function (r) {
    if (ppwLower_(r.company) !== wantedCompany) return;
    if (ppwLower_(r.country) !== wantedCountry) return;
    if (ppwLower_(r.marketplace) !== wantedMarketplace) return;
    var id = ppwStr_(r.marketplace_sku_id);
    if (id === '') { blankId++; return; }        // a site SKU with no id cannot be joined to anything
    var status = ppwLower_(r.marketplace_sku_status);
    if (PPW_STATUSES_.indexOf(status) === -1) statusCounts.__unknown++;
    else statusCounts[status]++;
    if (statuses.indexOf(status) === -1) { excludedByStatus++; return; }
    if (Object.prototype.hasOwnProperty.call(byId, id)) {
      dupIds[id] = (dupIds[id] || 1) + 1;
      return;
    }
    byId[id] = r;
    inScope.push(id);
  });

  // DETERMINISTIC ORDER, so a page boundary is a property of the data and not of the sheet's row order.
  inScope.sort(function (a, b) { return a < b ? -1 : (a > b ? 1 : 0); });

  return { ids: inScope, byId: byId, count: inScope.length,
    duplicate_ids: Object.keys(dupIds), blank_id_rows: blankId,
    status_counts: statusCounts, excluded_by_status: excludedByStatus };
}

// --------------------------------------------------------------------------------------------------------
// §3 INDEXES — each built on the key the live schema actually has.
// --------------------------------------------------------------------------------------------------------
function ppwIndexBySku_(skuDetails) {
  var m = {};
  (skuDetails || []).forEach(function (r) {
    var k = ppwLower_(r.sku);
    if (k === '') return;
    if (!Object.prototype.hasOwnProperty.call(m, k)) m[k] = r;
  });
  return m;
}

/** Regional rows grouped by the FOUR-PART identity, plus every row that matched the sku but NOT the site —
 *  kept apart so a cross-site row can be REPORTED as contract evidence instead of quietly used. */
function ppwIndexRegional_(regional, scope) {
  var bySite = {}, otherSiteBySku = {};
  var wantedCompany = ppwLower_(scope.company);
  var wantedCountry = ppwLower_(scope.country);
  var wantedMarketplace = ppwLower_(scope.marketplace);
  (regional || []).forEach(function (r) {
    var sku = ppwLower_(r.sku);
    if (sku === '') return;
    var sameSite = ppwLower_(r.company) === wantedCompany
      && ppwLower_(r.country) === wantedCountry
      && ppwLower_(r.marketplace) === wantedMarketplace;
    if (sameSite) {
      var k = ppwSiteKey_(r.sku, r.company, r.country, r.marketplace);
      if (!bySite[k]) bySite[k] = [];
      bySite[k].push(r);
    } else {
      if (!otherSiteBySku[sku]) otherSiteBySku[sku] = [];
      otherSiteBySku[sku].push({ company: ppwStr_(r.company), country: ppwStr_(r.country),
        marketplace: ppwStr_(r.marketplace) });
    }
  });
  return { bySite: bySite, otherSiteBySku: otherSiteBySku };
}

function ppwIndexPricing_(pricing) {
  var m = {};
  (pricing || []).forEach(function (r) {
    var id = ppwStr_(r.marketplace_sku_id);
    if (id === '') return;
    if (!m[id]) m[id] = [];
    m[id].push(r);
  });
  return m;
}

/** Campaign lines by marketplace_sku_id, with the parent campaign resolved and its own scope columns checked
 *  one by one. A campaign is not uniquely scoped by country+marketplace (20_:27) — the same marketplace name
 *  belongs to two companies — so company is checked too, and an unverifiable column is reported, not assumed. */
function ppwIndexCampaigns_(lines, campaigns, scope) {
  var byCampaign = {};
  (campaigns || []).forEach(function (c) {
    var id = ppwStr_(c.campaign_id);
    if (id === '') return;
    if (!Object.prototype.hasOwnProperty.call(byCampaign, id)) byCampaign[id] = c;
  });
  var wanted = { company: ppwLower_(scope.company), country: ppwLower_(scope.country),
    marketplace: ppwLower_(scope.marketplace) };
  var bySku = {}, outOfScope = 0, orphanLines = 0;
  (lines || []).forEach(function (ln) {
    var id = ppwStr_(ln.marketplace_sku_id);
    if (id === '') return;
    var cid = ppwStr_(ln.campaign_id);
    var camp = cid !== '' ? byCampaign[cid] : null;
    if (!camp) { orphanLines++; return; }
    var checks = [], scoped = true, unverifiable = [];
    ['company', 'country', 'marketplace'].forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(camp, k) || ppwStr_(camp[k]) === '') {
        unverifiable.push(k);
        return;
      }
      var same = ppwLower_(camp[k]) === wanted[k];
      checks.push({ column: k, campaign_value: ppwStr_(camp[k]), scope_value: scope[k], matches: same });
      if (!same) scoped = false;
    });
    if (!scoped) { outOfScope++; return; }
    if (!bySku[id]) bySku[id] = [];
    bySku[id].push({
      campaign_id: cid,
      campaign_sku_line_id: ppwStr_(ln.campaign_sku_line_id) || null,
      campaign_name: ppwStr_(camp.campaign_name) || null,
      status: ppwStr_(camp.status) || null,
      line_status: ppwStr_(ln.line_status) || null,
      start_date: ppwStr_(camp.start_date) || null,
      end_date: ppwStr_(camp.end_date) || null,
      promo_price: ppwNum_(ln.promo_price),
      regular_price_snapshot: ppwNum_(ln.regular_price),
      price_units: ppwStr_(ln.price_units) || null,
      discount_percent: ppwNum_(ln.discount_percent),
      // A DEAL IS OFFICIAL OR IT IS NOTHING. This record carries only persisted campaign columns; a proposal
      // has no path into it, and there is no write API in this round that could create one.
      source: 'campaigns + campaign_sku_lines',
      scope_checks: checks,
      unverifiable_scope_columns: unverifiable.length ? unverifiable : null
    });
  });
  return { bySku: bySku, out_of_scope_lines: outOfScope, orphan_lines: orphanLines,
    campaign_count: Object.keys(byCampaign).length };
}

// --------------------------------------------------------------------------------------------------------
// §4 NORMALIZE — one row per marketplace_sku_id, and never anything else.
// --------------------------------------------------------------------------------------------------------
function ppwNormalizeRow_(id, msku, skuIdx, regIdx, priceIdx, campIdx, include) {
  var sourceStatus = [], missing = [], findings = [];
  var masterSku = ppwStr_(msku.sku);
  var master = skuIdx[ppwLower_(masterSku)] || null;
  if (!master) missing.push('MASTER_SKU_RECORD_MISSING');

  // ---- regional, on the four-part identity taken from the MEMBERSHIP row ----
  var regional = null, regionalAmbiguous = false;
  if (include.regional) {
    var key = ppwSiteKey_(masterSku, msku.company, msku.country, msku.marketplace);
    var hits = regIdx.bySite[key] || [];
    if (hits.length === 0) {
      sourceStatus.push('REGIONAL_DETAILS_MISSING');
      missing.push('REGIONAL_DETAILS_MISSING');
      var elsewhere = regIdx.otherSiteBySku[ppwLower_(masterSku)] || [];
      if (elsewhere.length) {
        // NAMED, NOT USED. Answering a question about this site with another site's row would be a wrong
        // answer that looks like a complete one.
        findings.push({ code: 'CONTRACT_MISMATCH',
          detail: 'sku_regional_details rows exist for this SKU on other sites and are NOT used',
          evidence: elsewhere.slice(0, 5) });
      }
    } else if (hits.length === 1) {
      regional = hits[0];
    } else {
      regionalAmbiguous = true;
      sourceStatus.push('AMBIGUOUS_SITE_IDENTITY');
      findings.push({ code: 'AMBIGUOUS_SITE_IDENTITY',
        detail: 'more than one sku_regional_details row matches this exact four-part site identity',
        evidence: { matches: hits.length } });
    }
  } else {
    sourceStatus.push('REGIONAL_NOT_REQUESTED');
  }

  // ---- pricing, on marketplace_sku_id ONLY ----
  var price = null, pricingAmbiguous = false, currency = null;
  if (include.pricing) {
    var prows = priceIdx[id] || [];
    if (prows.length === 0) {
      sourceStatus.push('PRICING_SOURCE_MISSING');
      missing.push('PRICING_SOURCE_MISSING');
    } else if (prows.length === 1) {
      price = prows[0];
    } else {
      pricingAmbiguous = true;
      sourceStatus.push('AMBIGUOUS_PRICING_SOURCE');
      findings.push({ code: 'AMBIGUOUS_PRICING_SOURCE',
        detail: 'pricing_list is one row per marketplace_sku_id (PRICING_DATABASE_MAPPING §4) and this id'
          + ' has more than one; no rule in the contract picks a winner, so none is picked',
        evidence: { rows: prows.length,
          pricing_ids: prows.map(function (p) { return ppwStr_(p.pricing_id); }).slice(0, 5) } });
    }
    if (price) {
      currency = ppwStr_(price.currency) || null;
      if (currency === null) { missing.push('PRICING_CURRENCY_MISSING'); }
      var siteCurrency = ppwStr_(msku.currency);
      if (currency !== null && siteCurrency !== '' && ppwLower_(siteCurrency) !== ppwLower_(currency)) {
        // pricing_list WINS, and the disagreement is a finding rather than a tiebreak. The two are a copy
        // made at creation (PRICING_DATABASE_MAPPING §4), so they can drift, and a silent overwrite would
        // hide the drift for as long as nobody compared them.
        findings.push({ code: 'CURRENCY_SOURCE_CONFLICT',
          detail: 'pricing_list.currency is the authority; marketplace_skus.currency disagrees',
          evidence: { pricing_list: currency, marketplace_skus: siteCurrency } });
      }
    }
  } else {
    sourceStatus.push('PRICING_NOT_REQUESTED');
  }

  // ---- images and variant grouping ----
  var image = master ? (ppwStr_(master.image_url) || null) : null;
  if (image === null) { sourceStatus.push('IMAGE_SOURCE_MISSING'); missing.push('IMAGE_SOURCE_MISSING'); }
  // NO SKU-STRING SURGERY. `series` is the only product-family column the live schema can prove, and where it
  // is blank the grouping is reported as unprovable rather than invented from the SKU text.
  var series = master ? (ppwStr_(master.series) || null) : null;
  var variantGroup = series;
  if (variantGroup === null) { missing.push('VARIANT_GROUPING_SOURCE_MISSING'); }

  var campaigns = [];
  if (include.campaigns) {
    campaigns = (campIdx.bySku[id] || []).slice(0, PPW_CAMPAIGNS_PER_SKU_MAX_);
    if ((campIdx.bySku[id] || []).length > PPW_CAMPAIGNS_PER_SKU_MAX_) {
      findings.push({ code: 'CAMPAIGN_RECORDS_CAPPED',
        detail: 'more campaign lines than the per-SKU bound', evidence: { cap: PPW_CAMPAIGNS_PER_SKU_MAX_ } });
    }
  }

  // ANALYSABLE MEANS "MAY BE PLOTTED AND COMPARED". A price with no currency is not a coordinate, and an
  // ambiguous source is not a price at all.
  var analysable = include.pricing === true && price !== null && currency !== null
    && ppwNum_(price.regular_price) !== null && !pricingAmbiguous && !regionalAmbiguous;

  return {
    identity: 'MSKU:' + id,
    marketplace_sku_id: id,
    master_sku: masterSku || null,
    site_sku: ppwStr_(msku.site_sku) || null,
    product_name: master ? (ppwStr_(master.product_name) || null) : null,
    category: master ? (ppwStr_(master.category) || null) : null,
    series: series,
    variant_group: variantGroup,
    // NO AUTHORITATIVE COLUMN EXISTS for a variant name (§28.5 is still open), so it is null rather than a
    // guess dressed as data.
    variant_name: null,
    company: ppwStr_(msku.company),
    country: ppwStr_(msku.country),
    marketplace: ppwStr_(msku.marketplace),
    marketplace_sku_status: ppwStr_(msku.marketplace_sku_status) || null,
    // DISPLAY ONLY. It is a statement about the product, never about membership of this site.
    lifecycle: master ? (ppwStr_(master.lifecycle) || null) : null,
    currency: currency,
    regular_price: price ? ppwNum_(price.regular_price) : null,
    minimum_price: price ? ppwNum_(price.minimum_price) : null,
    msrp: price ? ppwNum_(price.msrp) : null,
    product_image: image,
    regional: regional ? {
      regional_detail_id: ppwStr_(regional.regional_detail_id) || null,
      site_sku: ppwStr_(regional.site_sku) || null,
      marketplace_product_id: ppwStr_(regional.marketplace_product_id) || null,
      product_url: ppwStr_(regional.product_url) || null,
      packaging_regulation: ppwStr_(regional.packaging_regulation) || null,
      language: ppwStr_(regional.language) || null
    } : null,
    campaigns: campaigns,
    analysable: analysable,
    source_status: sourceStatus,
    missing_reasons: missing,
    findings: findings,
    provenance: {
      membership: 'marketplace_skus (company + country + marketplace)',
      master: master ? 'sku_details by sku' : null,
      regional: include.regional
        ? (regional ? 'sku_regional_details by sku + company + country + marketplace' : null)
        : 'not requested',
      pricing: include.pricing ? (price ? 'pricing_list by marketplace_sku_id' : null) : 'not requested',
      campaigns: include.campaigns ? 'campaign_sku_lines by marketplace_sku_id → campaigns by campaign_id'
        : 'not requested',
      currency_authority: 'pricing_list.currency',
      price_status_raw: price ? (ppwStr_(price.price_status) || null) : null,
      price_source_raw: price ? (ppwStr_(price.price_source) || null) : null,
      variant_group_source: variantGroup === null ? null : 'sku_details.series',
      fx_applied: false
    }
  };
}

// --------------------------------------------------------------------------------------------------------
// §5 THE BUILDER — raw tables in, ONE site-scoped read model out.
// --------------------------------------------------------------------------------------------------------
function ppwWorkspaceBuild_(tables, req) {
  tables = tables || {};
  var include = req.include, scope = req.scope, filters = req.filters;
  var refusals = req.refusals.slice();

  var src = {};
  ppwTablesFor_(include).forEach(function (t) { src[t.name] = ppwCap_(tables[t.name] || []); });
  function capOf(n) { return src[n] ? src[n].capped : null; }
  function rowsOf(n) { return src[n] ? src[n].rows : []; }

  var mem = ppwMembership_(rowsOf('marketplace_skus'), scope, filters.statuses);
  var skuIdx = ppwIndexBySku_(rowsOf('sku_details'));
  var regIdx = include.regional
    ? ppwIndexRegional_(rowsOf('sku_regional_details'), scope) : { bySite: {}, otherSiteBySku: {} };
  var priceIdx = include.pricing ? ppwIndexPricing_(rowsOf('pricing_list')) : {};
  var campIdx = include.campaigns
    ? ppwIndexCampaigns_(rowsOf('campaign_sku_lines'), rowsOf('campaigns'), scope)
    : { bySku: {}, out_of_scope_lines: 0, orphan_lines: 0, campaign_count: 0 };

  var findings = [];
  if (mem.duplicate_ids.length) {
    findings.push({ code: 'AMBIGUOUS_SITE_IDENTITY',
      detail: 'more than one marketplace_skus row shares a marketplace_sku_id in this scope',
      evidence: { ids: mem.duplicate_ids.slice(0, 10) } });
  }
  if (mem.blank_id_rows) {
    findings.push({ code: 'SITE_SKU_WITHOUT_IDENTITY',
      detail: 'marketplace_skus rows in this scope carry no marketplace_sku_id and cannot be joined',
      evidence: { rows: mem.blank_id_rows } });
  }
  if (mem.status_counts.__unknown) {
    findings.push({ code: 'UNKNOWN_SITE_STATUS_VALUE',
      detail: 'marketplace_sku_status values outside the four the schema defines',
      evidence: { rows: mem.status_counts.__unknown } });
  }

  // ---- ALL rows first, so the counts are TOTALS and the page is a window onto them ----
  var all = [];
  mem.ids.forEach(function (id) {
    var row = ppwNormalizeRow_(id, mem.byId[id], skuIdx, regIdx, priceIdx, campIdx, include);
    // CATEGORY AND SERIES NARROW **AFTER** MEMBERSHIP, never instead of it. They are a view of the site's
    // SKUs, and a SKU that is not on the site cannot be filtered into one.
    if (filters.category !== null && ppwLower_(row.category) !== ppwLower_(filters.category)) return;
    if (filters.series !== null && ppwLower_(row.series) !== ppwLower_(filters.series)) return;
    all.push(row);
  });

  var counts = {
    siteSkuCount: all.length,
    activeSiteSkuCount: 0, phasingOutSiteSkuCount: 0,
    inactiveSiteSkuCount: 0, discontinuedSiteSkuCount: 0,
    regionalMissingCount: include.regional ? 0 : null,
    pricingMissingCount: include.pricing ? 0 : null,
    analysableSiteSkuCount: 0
  };
  var KEY = { active: 'activeSiteSkuCount', phasing_out: 'phasingOutSiteSkuCount',
    inactive: 'inactiveSiteSkuCount', discontinued: 'discontinuedSiteSkuCount' };
  all.forEach(function (r) {
    var k = KEY[ppwLower_(r.marketplace_sku_status)];
    if (k) counts[k]++;
    if (include.regional && r.source_status.indexOf('REGIONAL_DETAILS_MISSING') !== -1) {
      counts.regionalMissingCount++;
    }
    if (include.pricing && r.source_status.indexOf('PRICING_SOURCE_MISSING') !== -1) {
      counts.pricingMissingCount++;
    }
    if (r.analysable) counts.analysableSiteSkuCount++;
  });

  // ---- pagination over normalizedRows, the page grain ----
  var total = all.length;
  var start = Math.min(req.page.offset, total);
  var page = all.slice(start, start + req.page.limit);
  var nextOffset = start + page.length;
  var nextCursor = nextOffset < total
    ? (PPW_CURSOR_PREFIX_ + '-' + req.page.identity + '-' + nextOffset) : null;

  var capped = {
    marketplaceSkus: capOf('marketplace_skus'), skuDetails: capOf('sku_details'),
    skuRegionalDetails: capOf('sku_regional_details'), pricingList: capOf('pricing_list'),
    campaigns: capOf('campaigns'), campaignSkuLines: capOf('campaign_sku_lines'),
    normalizedRows: nextCursor !== null
  };
  var cappedSources = [];
  ['marketplace_skus', 'sku_details', 'sku_regional_details', 'pricing_list', 'campaigns',
    'campaign_sku_lines'].forEach(function (n) { if (capOf(n) === true) cappedSources.push(n); });
  if (cappedSources.length) {
    // A CAPPED SOURCE MAKES MEMBERSHIP OR JOIN COMPLETENESS UNPROVABLE, and an answer that cannot prove its
    // own completeness must not be handed over looking analytics-ready.
    refusals.push(ppwRefusal_('CAPPED_RESULT',
      'a source table exceeded the row cap, so membership or join completeness cannot be proved',
      cappedSources));
  }

  return {
    scope: scope,
    filtersApplied: {
      category: filters.category, series: filters.series,
      statuses: filters.statuses.slice(), include_inactive: filters.include_inactive,
      statuses_were_explicit: filters.statuses_were_explicit,
      applied_after_membership: ['category', 'series'],
      applied_during_membership: ['statuses']
    },
    normalizedRows: page,
    sources: {
      marketplaceSkus: { rows: mem.count, total_in_table: src.marketplace_skus.total },
      skuDetails: { rows: rowsOf('sku_details').length, total_in_table: src.sku_details.total },
      skuRegionalDetails: include.regional
        ? { rows: rowsOf('sku_regional_details').length, total_in_table: src.sku_regional_details.total }
        : null,
      pricingList: include.pricing
        ? { rows: rowsOf('pricing_list').length, total_in_table: src.pricing_list.total } : null,
      campaigns: include.campaigns
        ? { rows: rowsOf('campaigns').length, total_in_table: src.campaigns.total } : null,
      campaignSkuLines: include.campaigns
        ? { rows: rowsOf('campaign_sku_lines').length, total_in_table: src.campaign_sku_lines.total } : null
    },
    counts: counts,
    capped: capped,
    pagination: { limit: req.page.limit, offset: start, returned: page.length, total: total,
      cursor: req.page.cursor, nextCursor: nextCursor, scope_identity: req.page.identity,
      sort: 'marketplace_sku_id ascending' },
    findings: findings,
    refusals: refusals,
    // SUCCESS IS NOT THE SAME AS USABLE, and this is the field that says so.
    analysis_permitted: refusals.length === 0,
    membership: {
      authority: 'marketplace_skus',
      scope_key: ['company', 'country', 'marketplace'],
      site_sku_identity: 'marketplace_sku_id',
      resolved_server_side: true,
      in_scope_before_status_filter: mem.count + mem.excluded_by_status,
      excluded_by_status: mem.excluded_by_status,
      status_distribution: mem.status_counts,
      lifecycle_participates: false,
      inferred_from: []
    },
    provenance: {
      action: PPW_ACTION_, build: PPW_BUILD_VERSION_,
      connected: true, read_only: true, db_writes: 0,
      tables_read: ppwTablesFor_(include).map(function (t) { return t.name; }),
      joins: {
        master: 'sku_details.sku = marketplace_skus.sku',
        regional: 'sku_regional_details(sku, company, country, marketplace)'
          + ' = marketplace_skus(sku, company, country, marketplace)',
        pricing: 'pricing_list.marketplace_sku_id = marketplace_skus.marketplace_sku_id',
        campaign_lines: 'campaign_sku_lines.marketplace_sku_id = marketplace_skus.marketplace_sku_id',
        campaign_parent: 'campaigns.campaign_id = campaign_sku_lines.campaign_id, then company/country/'
          + 'marketplace checked column by column'
      },
      campaign_scope: include.campaigns
        ? { out_of_scope_lines_dropped: campIdx.out_of_scope_lines, orphan_lines: campIdx.orphan_lines,
            campaigns_seen: campIdx.campaign_count } : null,
      currency_authority: 'pricing_list.currency',
      fx_conversion: false,
      price_status_filtering: false,
      preview_fallback: false
    }
  };
}

/** The answer a refused request gets: the same shape, zero rows, and a reason that is not a zero. */
function ppwRefusedData_(req, extraRefusals) {
  var refusals = req.refusals.concat(extraRefusals || []);
  return {
    scope: req.scope,
    filtersApplied: { category: req.filters.category, series: req.filters.series,
      statuses: req.filters.statuses.slice(), include_inactive: req.filters.include_inactive,
      statuses_were_explicit: req.filters.statuses_were_explicit,
      applied_after_membership: ['category', 'series'], applied_during_membership: ['statuses'] },
    normalizedRows: [],
    sources: { marketplaceSkus: null, skuDetails: null, skuRegionalDetails: null,
      pricingList: null, campaigns: null, campaignSkuLines: null },
    // NOT ZERO. Nothing was counted, and a count nobody took is null, because a real site with no SKUs must
    // remain distinguishable from a request that never ran.
    counts: { siteSkuCount: null, activeSiteSkuCount: null, phasingOutSiteSkuCount: null,
      inactiveSiteSkuCount: null, discontinuedSiteSkuCount: null, regionalMissingCount: null,
      pricingMissingCount: null, analysableSiteSkuCount: null },
    capped: { marketplaceSkus: null, skuDetails: null, skuRegionalDetails: null, pricingList: null,
      campaigns: null, campaignSkuLines: null, normalizedRows: null },
    pagination: { limit: req.page.limit, offset: 0, returned: 0, total: null, cursor: req.page.cursor,
      nextCursor: null, scope_identity: req.page.identity, sort: 'marketplace_sku_id ascending' },
    findings: [],
    refusals: refusals,
    analysis_permitted: false,
    membership: { authority: 'marketplace_skus', scope_key: ['company', 'country', 'marketplace'],
      site_sku_identity: 'marketplace_sku_id', resolved_server_side: true,
      in_scope_before_status_filter: null, excluded_by_status: null, status_distribution: null,
      lifecycle_participates: false, inferred_from: [] },
    provenance: { action: PPW_ACTION_, build: PPW_BUILD_VERSION_, connected: false, read_only: true,
      db_writes: 0, tables_read: [], joins: null, campaign_scope: null,
      currency_authority: 'pricing_list.currency', fx_conversion: false, price_status_filtering: false,
      preview_fallback: false }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io. NEVER calls getOperationDb, never takes a lock, never writes.
// --------------------------------------------------------------------------------------------------------
function ppwRowsToObjects_(sheet) {
  var data = sheet.getDataRange().getValues();
  if (!data || data.length < 2) return [];
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) {
      o[headers[c]] = data[r][c];
      if (String(data[r][c]).trim() !== '') blank = false;
    }
    if (!blank) out.push(o);
  }
  return out;
}

function ppwDefaultIo_() {
  return {
    now: function () { return Date.now(); },
    nextSeq: function () { PPW_WS_SEQ_++; return PPW_WS_SEQ_; },
    flagEnabled: function () {
      // THE ONE RESOLVER. Not a copy of the constant, not a payload field, not a query parameter.
      return typeof productStrategyEnabled_ === 'function' && productStrategyEnabled_() === true;
    },
    openTarget: function () {
      var id = prodExpectedDbId_();
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);
      return ss;
    },
    readTable: function (ss, name, requiredCols) {
      // FAIL CLOSED. A missing sheet or a missing required column is a typed schema error, never an empty
      // array and never a sheet this action creates on the way past.
      var sheet = prodRequireSheet_(ss, name, []);
      prodRequireColumns_(sheet, requiredCols);
      return ppwRowsToObjects_(sheet);
    }
  };
}

function handleProductPricingWorkspaceGet_(body, io) {
  io = io || ppwDefaultIo_();
  var t0 = io.now();
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  var reqId = ppwStr_(body && body.requestId) || ('REQ-P' + ('000000' + seq).slice(-6));
  var payload = (body && body.payload) || {};
  try {
    // ---- §1 THE FLAG, BEFORE THE DOOR. ----------------------------------------------------------
    // Not after the open and not after the read. There is no RBAC in this system, so this gate is the access
    // control; a control that runs after the data has been read has already failed at the only job it had.
    if (io.flagEnabled() !== true) {
      var reqD = ppwValidateRequest_(payload);
      return ppwEnvelope_(true,
        ppwRefusedData_(reqD, [ppwRefusal_('FEATURE_DISABLED',
          'PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered', null)]),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: 'FEATURE_DISABLED' });
    }

    // ---- §2/§3 THE REQUEST AND THE COMPLETE SCOPE, BEFORE ANY TABLE IS TOUCHED. -------------------
    var req = ppwValidateRequest_(payload);
    if (!req.ok) {
      return ppwEnvelope_(true, ppwRefusedData_(req, []),
        [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, dbOpened: false,
          refused: true, refusalCode: req.refusals[0].code });
    }

    // ---- §4 THE EXACT PRODUCTION TARGET. ---------------------------------------------------------
    var ss = io.openTarget();
    var specs = ppwTablesFor_(req.include);
    var tables = {}, readCount = 0;
    for (var i = 0; i < specs.length; i++) {
      tables[specs[i].name] = io.readTable(ss, specs[i].name, specs[i].requiredCols);
      readCount++;
    }

    var data = ppwWorkspaceBuild_(tables, req);
    return ppwEnvelope_(true, data, [], { requestId: reqId, serverDurationMs: (io.now() - t0),
      tablesRead: readCount, dbOpened: true, refused: data.refusals.length > 0,
      refusalCode: data.refusals.length ? data.refusals[0].code : null });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode))
      || 'PRODUCT_PRICING_WORKSPACE_BUILD_FAILED';
    return ppwEnvelope_(false, null,
      [{ code: code, message: String((e && e.message) || e), details: (e && e.schemaDetail) || null }],
      { requestId: reqId, serverDurationMs: (io.now() - t0), refused: true, refusalCode: code });
  }
}
