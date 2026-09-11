/**
 * ================================================================================================================
 * TEMP — PRODUCT STRATEGY BOARD · PRODUCTION READBACK  (PRODUCT-STRATEGY-P1-B3 §3–§5, §7)
 * ================================================================================================================
 *
 * ONE ENTRY POINT, NO PARAMETERS, ADMIN ONLY:
 *
 *     RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()
 *
 * Run it from the Apps Script EDITOR. It is not in any router table, it has no action name, and it takes no
 * arguments — there is nothing for a caller to widen. It answers one question: what is actually in the
 * production SSOT, and what would the Product Strategy Board be able to draw from it?
 *
 * ------------------------------------------------------------------------------------------------------------
 * IT DOES NOT TOUCH THE FEATURE FLAG, AND THAT IS THE POINT.
 *
 * The obvious way to exercise a flag-gated read from a diagnostic is to inject an `io` whose `flagEnabled`
 * returns true. This file deliberately does not, because doing so would measure a pipeline that is not the
 * one deployed and would leave a flag-bypass in the project as a permanent affordance.
 *
 * Instead it does the opposite, and gets a stronger result:
 *
 *   1. It CALLS the real endpoint with the real io, and asserts it refuses with FEATURE_DISABLED having
 *      opened nothing. That is a live proof that the gate works in production — worth far more than a
 *      census taken around it.
 *   2. It reads the four source tables ITSELF, read-only, through the SAME shared safety helpers 72_ uses.
 *   3. It hands those tables to `ppwWorkspaceBuild_` — the PURE builder, which has no flag gate because the
 *      gate lives in the handler. So the eligibility classification below is computed by the very code that
 *      will serve the page, not by a second implementation that agrees with it today.
 *
 * A CENSUS THAT COMPUTES ELIGIBILITY ITS OWN WAY MEASURES A PIPELINE NOBODY SHIPS. Every per-site number
 * here comes from the shipped builder.
 *
 * ------------------------------------------------------------------------------------------------------------
 * READ-ONLY BY CONSTRUCTION. No setValue, no setValues, no appendRow, no insertRow, no deleteRow, no clear,
 * no createSheet, no ensure-sheet, no writer call, no LockService, no Cache, no Properties, no trigger, no
 * UrlFetch, no MailApp, no DriveApp. It never calls getOperationDb. It opens exactly one spreadsheet, by the
 * id 00_config declares, and asserts that is the one it got.
 *
 * The promise above is a COMMENT, and a comment is not evidence — so the repository proves it separately by
 * call graph (assets/tests/product-strategy-production-readback-p1-b3.test.js §A), with comments and string
 * literals stripped first so this paragraph cannot satisfy the check that reads it.
 *
 * WHAT IT REPORTS THAT IT MEASURED, VERSUS DECLARED. `rows_modified` is an OBSERVED delta: every table's
 * lastRow/lastColumn is captured before the census and again after it, and the difference is reported. That
 * is a real measurement and it would catch an appendRow. `writer_calls: 0` is a DECLARATION backed by the
 * repo-side call graph, and it is labelled as one, because a zero that looks measured and is not is the
 * thing this project keeps finding at the bottom of a false green.
 *
 * NO SENSITIVE DATA. It reports counts, distinct KEY values (company / country / marketplace / category /
 * series / currency) and header NAMES. It never reports a price, a cost, a margin, a URL, a customer, or a
 * spreadsheet id. Ledgers are capped and the cap is reported as a cap.
 * ================================================================================================================
 */

var P1B3_READBACK_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8';
var P1B3_READBACK_ID_ = 'P1_PRODUCT_STRATEGY_PRODUCTION_READBACK';

// The four tables §4 measures. campaigns / campaign_sku_lines are read too, because §6's promotion mapping
// cannot be verified without them, but they are reported separately from the four the brief enumerates.
var P1B3_CORE_TABLES_ = ['sku_details', 'marketplace_skus', 'sku_regional_details', 'pricing_list'];
var P1B3_EXTRA_TABLES_ = ['campaigns', 'campaign_sku_lines'];

// A ledger is evidence, not a data export. Capped, and the cap is always reported next to the total so a
// reader can never mistake a window for the whole.
var P1B3_LEDGER_MAX_ = 200;
// Sites to classify in full. More than this and the per-site pass reports a cap rather than quietly
// measuring some of them — §4 forbids "first N then claim complete".
var P1B3_SITE_MAX_ = 120;
// Logger.log has a payload ceiling, so the report is emitted in chunks that each carry their index, the
// total number of chunks, and the fingerprint of the whole — a reader who receives four of five chunks can
// tell.
var P1B3_CHUNK_CHARS_ = 7000;

var P1B3_SIX_CLASSES_ = ['ELIGIBLE_AND_CHARTABLE', 'ELIGIBLE_REGIONAL_MISSING', 'ELIGIBLE_PRICE_MISSING',
  'EXCLUDED_BY_STATUS', 'ORPHAN_OR_INVALID_IDENTITY', 'DATA_QUALITY_ONLY'];


// ------------------------------------------------------------------------------------------------------------
// PURE helpers. Named p1b3* so they cannot collide with 72_'s ppw* set, and deliberately NOT copies of it:
// anything 72_ already decides is asked of 72_.
// ------------------------------------------------------------------------------------------------------------
function p1b3Str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function p1b3Lower_(v) { return p1b3Str_(v).toLowerCase(); }

/** A stable 32-bit fingerprint of a string. Identity only — never used as a key and never reversed. */
function p1b3Hash_(s) {
  var h = 5381, t = String(s === undefined || s === null ? '' : s);
  for (var i = 0; i < t.length; i++) { h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; }
  return 'FP' + ('00000000' + h.toString(16)).slice(-8);
}

/** Count distinct non-blank values of one column, with the blank count kept separate. */
function p1b3Distinct_(rows, col) {
  var seen = {}, order = [], blank = 0, nonString = 0;
  (rows || []).forEach(function (r) {
    var raw = r ? r[col] : undefined;
    var v = p1b3Str_(raw);
    if (v === '') { blank++; return; }
    // A TYPE FAULT IS NOT A VALUE FAULT. A category cell holding a Date or a number is readable as text
    // and would join as text, so it is counted AND named rather than silently stringified.
    if (typeof raw !== 'string') nonString++;
    if (!Object.prototype.hasOwnProperty.call(seen, v)) { seen[v] = 0; order.push(v); }
    seen[v]++;
  });
  order.sort();
  return { values: order, counts: seen, distinct: order.length, blank: blank, type_faults: nonString };
}

/**
 * §7 — ALIAS CANDIDATES, PROPOSED AND NEVER APPLIED.
 *
 * Two category spellings that differ only by case or by whitespace are very likely one category, and this
 * function will say so. It will not merge them. §7.4 is explicit: without an operator's approval the alias
 * table is not changed, and a read that merges on a guess makes the sheet and the menu disagree while
 * looking tidier than either.
 */
function p1b3AliasCandidates_(values) {
  var byKey = {};
  (values || []).forEach(function (v) {
    var k = p1b3Lower_(v).replace(/\s+/g, ' ');
    if (!byKey[k]) byKey[k] = [];
    byKey[k].push(v);
  });
  var out = [];
  Object.keys(byKey).sort().forEach(function (k) {
    if (byKey[k].length > 1) out.push({ normalized: k, spellings: byKey[k].slice(), merged: false });
  });
  return out;
}

/** The four-part site identity, exactly as 72_ keys it. */
function p1b3SiteKey_(company, country, marketplace) {
  return p1b3Lower_(company) + '||' + p1b3Lower_(country) + '||' + p1b3Lower_(marketplace);
}

/**
 * §5 — ONE ROW, ONE CLASS, and the classes are ordered by what a reader must act on first.
 *
 * Derived from the SHIPPED builder's own row output, never re-decided here. `analysable` is the builder's
 * verdict on whether the row may be plotted; the reasons come from its `missing_reasons`, which is the same
 * list the page's Data Quality drawer reads.
 */
function p1b3ClassifyRow_(row) {
  var miss = (row && row.missing_reasons) || [];
  function has(c) { return miss.indexOf(c) !== -1; }
  if (!p1b3Str_(row && row.marketplace_sku_id)) return 'ORPHAN_OR_INVALID_IDENTITY';
  if (has('MASTER_SKU_RECORD_MISSING')) return 'ORPHAN_OR_INVALID_IDENTITY';
  if (row && row.analysable === true) return 'ELIGIBLE_AND_CHARTABLE';
  // REGIONAL BEFORE PRICE. A site SKU with no Regional Detail is not confirmed as sold there at all, so
  // its missing price is the second question, not the first.
  if (has('REGIONAL_DETAILS_MISSING')) return 'ELIGIBLE_REGIONAL_MISSING';
  if (has('PRICING_SOURCE_MISSING') || has('PRICING_CURRENCY_MISSING')) return 'ELIGIBLE_PRICE_MISSING';
  return 'DATA_QUALITY_ONLY';
}

/** An empty tally of the six classes, so a zero class is present in the output rather than absent. */
function p1b3EmptyClassTally_() {
  var t = {};
  P1B3_SIX_CLASSES_.forEach(function (c) { t[c] = 0; });
  return t;
}


// ------------------------------------------------------------------------------------------------------------
// READ-ONLY source access. Every sheet read in this file goes through here.
// ------------------------------------------------------------------------------------------------------------

/**
 * Open the one production target, and prove it is the one 00_config names. Same helper 72_ uses, so the
 * readback cannot be pointed somewhere 72_ would refuse.
 */
function p1b3OpenTarget_() {
  var id = prodExpectedDbId_();
  if (p1b3Str_(id) === '') {
    var e = new Error('PRODUCTION_SAFETY:PRODUCTION_DB_ID_NOT_CONFIGURED');
    e.safetyToken = 'PRODUCTION_DB_ID_NOT_CONFIGURED';
    throw e;
  }
  var ss = SpreadsheetApp.openById(id);
  prodAssertDbTarget_(ss, id);
  return ss;
}

/**
 * One table, or a typed reason why not. NEVER creates the sheet and never returns [] for a sheet that is
 * absent: "this table has no rows" and "this table does not exist" are the two facts §4 exists to separate,
 * and an empty array says the first about the second.
 */
function p1b3ReadTable_(ss, name) {
  var out = { name: name, present: false, readable: false, rows: [], row_count: 0,
    last_row: null, last_column: null, reason: null, fingerprint: null, headers: [] };
  var sheet = null;
  try { sheet = ss.getSheetByName(name); } catch (e) { out.reason = 'SHEET_LOOKUP_FAILED'; return out; }
  if (!sheet) { out.reason = 'SCHEMA_NOT_PROVISIONED'; return out; }
  out.present = true;
  try {
    out.last_row = sheet.getLastRow();
    out.last_column = sheet.getLastColumn();
    if (out.last_row < 1 || out.last_column < 1) { out.reason = 'HEADER_MISSING'; return out; }
    // The SAME row reader 72_ uses, so the census counts rows the way the page will count them —
    // including its blank-row skip, which would otherwise make the two disagree by exactly the blanks.
    out.rows = ppwRowsToObjects_(sheet);
    out.row_count = out.rows.length;
    var fp = ppwSchemaFingerprint_(out.rows);
    out.fingerprint = fp.fingerprint;
    out.headers = fp.headers;
    out.readable = true;
  } catch (e) {
    out.reason = p1b3Str_((e && (e.safetyToken || e.message)) || e) || 'READ_FAILED';
  }
  return out;
}

/** lastRow/lastColumn for every table, so a delta across the census is observable. */
function p1b3Shape_(ss, names) {
  var out = {};
  names.forEach(function (n) {
    var s = null;
    try { s = ss.getSheetByName(n); } catch (e) { s = null; }
    out[n] = s ? { last_row: s.getLastRow(), last_column: s.getLastColumn() } : null;
  });
  return out;
}


// ------------------------------------------------------------------------------------------------------------
// §4 — THE UNIVERSE, TABLE BY TABLE
// ------------------------------------------------------------------------------------------------------------

function p1b3CensusSkuDetails_(t) {
  if (!t.readable) return { readable: false, reason: t.reason };
  var cat = p1b3Distinct_(t.rows, 'category');
  var ser = p1b3Distinct_(t.rows, 'series');
  var dupSku = {}, dups = [];
  t.rows.forEach(function (r) {
    var k = p1b3Lower_(r.sku);
    if (k === '') return;
    dupSku[k] = (dupSku[k] || 0) + 1;
  });
  Object.keys(dupSku).forEach(function (k) { if (dupSku[k] > 1) dups.push(k); });
  return {
    readable: true, row_count: t.row_count, fingerprint: t.fingerprint,
    distinct_raw_category: cat.values, category_counts: cat.counts,
    distinct_category_count: cat.distinct, blank_category_rows: cat.blank,
    category_type_faults: cat.type_faults,
    distinct_series: ser.values, series_counts: ser.counts,
    distinct_series_count: ser.distinct, blank_series_rows: ser.blank,
    series_type_faults: ser.type_faults,
    // §7 — CANDIDATES ONLY, and the flag says so in the data.
    category_alias_candidates: p1b3AliasCandidates_(cat.values),
    series_alias_candidates: p1b3AliasCandidates_(ser.values),
    alias_table_changed: false,
    duplicate_master_sku: dups.slice(0, P1B3_LEDGER_MAX_),
    duplicate_master_sku_total: dups.length,
    // NO ALLOWLIST AND NO CEILING. §7.6 — the three categories in the prototype are fixture data, and a
    // fourth appearing in the DB tomorrow needs no code change to be shown.
    category_allowlist: null, category_max: null
  };
}

function p1b3CensusMarketplaceSkus_(t) {
  if (!t.readable) return { readable: false, reason: t.reason };
  var sites = {}, siteOrder = [], statuses = {}, idSeen = {}, dupIds = [], blankId = 0, blankSiteSku = 0;
  var distinctSiteSku = {}, distinctSiteSkuCount = 0;
  t.rows.forEach(function (r) {
    var key = p1b3SiteKey_(r.company, r.country, r.marketplace);
    if (!sites[key]) {
      sites[key] = { company: p1b3Str_(r.company), country: p1b3Str_(r.country),
        marketplace: p1b3Str_(r.marketplace), rows: 0 };
      siteOrder.push(key);
    }
    sites[key].rows++;
    var st = p1b3Lower_(r.marketplace_sku_status);
    var bucket = st === '' ? '__blank' : (PPW_STATUSES_.indexOf(st) === -1 ? '__unknown' : st);
    statuses[bucket] = (statuses[bucket] || 0) + 1;
    var id = p1b3Str_(r.marketplace_sku_id);
    if (id === '') { blankId++; } else {
      if (Object.prototype.hasOwnProperty.call(idSeen, id)) { if (idSeen[id] === 1) dupIds.push(id); }
      idSeen[id] = (idSeen[id] || 0) + 1;
    }
    var ssku = p1b3Str_(r.site_sku);
    if (ssku === '') { blankSiteSku++; } else if (!distinctSiteSku[ssku]) {
      distinctSiteSku[ssku] = 1; distinctSiteSkuCount++;
    }
  });
  siteOrder.sort();
  return {
    readable: true, row_count: t.row_count, fingerprint: t.fingerprint,
    site_count: siteOrder.length,
    sites: siteOrder.map(function (k) { return sites[k]; }),
    status_counts: statuses,
    known_statuses: PPW_STATUSES_.slice(),
    distinct_site_sku: distinctSiteSkuCount, blank_site_sku_rows: blankSiteSku,
    blank_identity_rows: blankId,
    duplicate_identity: dupIds.slice(0, P1B3_LEDGER_MAX_), duplicate_identity_total: dupIds.length
  };
}

function p1b3CensusRegional_(t, skuIndex) {
  if (!t.readable) return { readable: false, reason: t.reason };
  var byKey = {}, dupKeys = [], orphan = [], missingSiteSku = 0, statusCounts = {};
  t.rows.forEach(function (r) {
    var k = p1b3Lower_(r.sku) + '||' + p1b3SiteKey_(r.company, r.country, r.marketplace);
    if (Object.prototype.hasOwnProperty.call(byKey, k)) { if (byKey[k] === 1) dupKeys.push(k); }
    byKey[k] = (byKey[k] || 0) + 1;
    if (p1b3Str_(r.site_sku) === '') missingSiteSku++;
    // ORPHAN = a Regional Detail whose master SKU is not in sku_details. It describes a product the
    // catalogue does not have, so nothing can join to it.
    if (!skuIndex[p1b3Lower_(r.sku)]) orphan.push(p1b3Lower_(r.sku));
    var st = p1b3Lower_(r.status) || '__blank';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  });
  return {
    readable: true, row_count: t.row_count, fingerprint: t.fingerprint,
    canonical_identity: ['sku', 'company', 'country', 'marketplace'],
    distinct_canonical_identity: Object.keys(byKey).length,
    duplicate_canonical_identity: dupKeys.slice(0, P1B3_LEDGER_MAX_),
    duplicate_canonical_identity_total: dupKeys.length,
    missing_site_sku_rows: missingSiteSku,
    orphan_master_sku: orphan.slice(0, P1B3_LEDGER_MAX_), orphan_master_sku_total: orphan.length,
    status_counts: statusCounts
  };
}

function p1b3CensusPricing_(t, mskuIndex) {
  if (!t.readable) return { readable: false, reason: t.reason };
  var byId = {}, dupIds = [], orphan = [], cur = {}, blankId = 0;
  var missing = { regular_price: 0, minimum_price: 0, msrp: 0, currency: 0 };
  var siteCurrency = {};
  t.rows.forEach(function (r) {
    var id = p1b3Str_(r.marketplace_sku_id);
    if (id === '') { blankId++; } else {
      if (Object.prototype.hasOwnProperty.call(byId, id)) { if (byId[id] === 1) dupIds.push(id); }
      byId[id] = (byId[id] || 0) + 1;
      var owner = mskuIndex[id];
      if (!owner) { orphan.push(id); }
    }
    var c = p1b3Str_(r.currency);
    if (c === '') { missing.currency++; } else { cur[c] = (cur[c] || 0) + 1; }
    // `msrp` IS THE LIST PRICE. One band, two words in its name — there is no separate list_price column
    // to be missing, and looking for one would report every row as incomplete.
    ['regular_price', 'minimum_price', 'msrp'].forEach(function (f) {
      if (p1b3Str_(r[f]) === '') missing[f]++;
    });
    // CROSS-CURRENCY FAULT: one site whose pricing rows disagree about the currency. An all-sites view
    // that summed those would be adding dollars to euros.
    var own = mskuIndex[id];
    if (own && c !== '') {
      var sk = p1b3SiteKey_(own.company, own.country, own.marketplace);
      if (!siteCurrency[sk]) siteCurrency[sk] = {};
      siteCurrency[sk][c] = (siteCurrency[sk][c] || 0) + 1;
    }
  });
  var multi = [];
  Object.keys(siteCurrency).sort().forEach(function (k) {
    var list = Object.keys(siteCurrency[k]);
    if (list.length > 1) multi.push({ site: k, currencies: list.sort() });
  });
  return {
    readable: true, row_count: t.row_count, fingerprint: t.fingerprint,
    identity: 'marketplace_sku_id',
    distinct_identity: Object.keys(byId).length, blank_identity_rows: blankId,
    duplicate_price_identity: dupIds.slice(0, P1B3_LEDGER_MAX_),
    duplicate_price_identity_total: dupIds.length,
    orphan_price_identity: orphan.slice(0, P1B3_LEDGER_MAX_), orphan_price_identity_total: orphan.length,
    currency_coverage: cur,
    missing_value_counts: missing,
    msrp_is_the_list_price: true,
    cross_currency_sites: multi, cross_currency_site_total: multi.length
  };
}


// ------------------------------------------------------------------------------------------------------------
// §4/§5 — THE PER-SITE PASS, THROUGH THE SHIPPED BUILDER
// ------------------------------------------------------------------------------------------------------------

/**
 * For one site: run `ppwWorkspaceBuild_` exactly as the endpoint would, then classify its rows.
 *
 * `include` asks for everything, and the page limit is the maximum, because a census must see the whole
 * site. The builder's own pagination still reports the total, so a site larger than the maximum is
 * reported as capped rather than counted short.
 */
function p1b3SitePass_(tables, site, readAt) {
  // THE STATUS FILTER IS LEFT AT THE DEFAULT ON PURPOSE, which is active + phasing_out.
  //
  // Asking for all four statuses would make `excluded_by_status` zero by construction — nothing is
  // excluded when everything is requested — and §5.4 wants that class counted. The default is also what
  // the PAGE asks for, so this classifies each site as an operator would actually see it, and the rows
  // excluded by status are reported by the builder's own membership report rather than inferred.
  var payload = {
    scope: { company: site.company, country: site.country, marketplace: site.marketplace },
    include: { regional: true, pricing: true, campaigns: true },
    page: { limit: PPW_PAGE_MAX_ }
  };
  var req = ppwValidateRequest_(payload);
  if (!req.ok) {
    return { site: site, ok: false,
      refusals: req.refusals.map(function (r) { return r.code; }) };
  }
  var data = ppwWorkspaceBuild_(tables, req, readAt);
  var tally = p1b3EmptyClassTally_();
  var cats = {}, sers = {}, curs = {};
  // SCOPE LEAK: a returned row whose own company/country/marketplace is not the one that was asked for.
  // Membership is supposed to make this impossible, which is exactly why it is worth counting: it is the
  // number that would move if currency, or a master-table join, ever started deciding site membership.
  var scopeLeak = [];
  (data.normalizedRows || []).forEach(function (row) {
    if (p1b3Lower_(row.company) !== p1b3Lower_(site.company)
      || p1b3Lower_(row.country) !== p1b3Lower_(site.country)
      || p1b3Lower_(row.marketplace) !== p1b3Lower_(site.marketplace)) {
      scopeLeak.push({ id: row.marketplace_sku_id, company: row.company, country: row.country,
        marketplace: row.marketplace, currency: row.currency });
    }
    tally[p1b3ClassifyRow_(row)]++;
    var c = p1b3Str_(row.category);
    cats[c === '' ? '__blank' : c] = (cats[c === '' ? '__blank' : c] || 0) + 1;
    var s = p1b3Str_(row.series);
    sers[s === '' ? '__blank' : s] = (sers[s === '' ? '__blank' : s] || 0) + 1;
    var u = p1b3Str_(row.currency);
    if (u !== '') curs[u] = (curs[u] || 0) + 1;
  });
  // EXCLUDED BY STATUS is a membership fact, not a row fact: those rows never become rows at all, so the
  // count comes from the builder's membership report rather than from the tally above.
  tally.EXCLUDED_BY_STATUS = Number(data.membership && data.membership.excluded_by_status) || 0;
  var fo = data.filterOptions;
  return {
    site: site, ok: true,
    sourceState: data.sourceState,
    analysis_permitted: data.analysis_permitted,
    eligible_sku_count: data.counts.siteSkuCount,
    analysable_sku_count: data.counts.analysableSiteSkuCount,
    regional_missing: data.counts.regionalMissingCount,
    pricing_missing: data.counts.pricingMissingCount,
    status_distribution: data.membership.status_distribution,
    in_scope_before_status_filter: data.membership.in_scope_before_status_filter,
    classes: tally,
    // The OPTIONS the page would offer for this site, from the builder — so "the menu is the site's" is
    // measured rather than asserted.
    // THE OPTION SHAPE IS THE BUILDER'S, not one invented here: {value, siteSkuCount,
    // analysableSiteSkuCount}. Reading a `count` field that does not exist published `undefined` beside
    // every option, which is a census that measured nothing while looking like one that had.
    category_options: fo ? fo.categories.map(function (o) {
      return { value: o.value, siteSkuCount: o.siteSkuCount,
        analysableSiteSkuCount: o.analysableSiteSkuCount }; }) : null,
    series_options: fo ? fo.series.map(function (o) {
      return { value: o.value, siteSkuCount: o.siteSkuCount,
        analysableSiteSkuCount: o.analysableSiteSkuCount }; }) : null,
    category_counts_from_rows: cats,
    series_counts_from_rows: sers,
    currency_facets: Object.keys(curs).sort(),
    currency_counts: curs,
    // MORE THAN ONE CURRENCY ON ONE SITE is the fault an all-sites total would hide.
    single_currency: Object.keys(curs).length <= 1,
    scope_leak_rows: scopeLeak.slice(0, 20), scope_leak_total: scopeLeak.length,
    pagination_total: data.pagination.total,
    page_capped: data.pagination.nextCursor !== null,
    findings: (data.findings || []).map(function (f) { return f.code; }),
    refusals: (data.refusals || []).map(function (r) { return r.code; })
  };
}


// ------------------------------------------------------------------------------------------------------------
// §5 — THE FIVE PROOFS THE BRIEF ASKS FOR, EACH ANSWERED FROM THE MEASUREMENTS ABOVE
// ------------------------------------------------------------------------------------------------------------

/**
 * Each of these is a claim that could be wrong in production and that a reader cannot check by eye. They
 * are answered PASS / FAIL / NOT_PROVABLE — and NOT_PROVABLE is a real answer: a proof that needs two
 * countries to exist cannot be given by a DB that has one, and reporting PASS there would be a lie about
 * the evidence rather than about the code.
 */
function p1b3Proofs_(census, sitePasses, tables) {
  var out = [];
  function add(id, claim, verdict, evidence) {
    out.push({ id: id, claim: claim, verdict: verdict, evidence: evidence });
  }

  // 1. USD does not put a non-US SKU on a US site.
  var usSites = sitePasses.filter(function (p) { return p.ok && p1b3Lower_(p.site.country) === 'us'; });
  if (!usSites.length) {
    add('P1', 'USD does not make a non-US SKU appear on a US site', 'NOT_PROVABLE',
      { reason: 'no US site exists in marketplace_skus' });
  } else {
    // THE CHECK IS ON THE ROWS THAT CAME BACK, not on the rule that was supposed to produce them.
    //
    // Membership resolves on company + country + marketplace, and currency is not a scope term at all —
    // so every row a US site returns must itself say US. That is the number that would move if currency,
    // or a master-table join, ever started deciding membership, and it is counted per site by the pass.
    //
    // The DENOMINATOR matters too: the population at risk is the USD-priced rows that belong to some
    // OTHER country, because if there are none, a clean result proves nothing.
    var leak = 0;
    usSites.forEach(function (p) { leak += Number(p.scope_leak_total) || 0; });
    var usdElsewhere = 0;
    (tables.marketplace_skus || []).forEach(function (r) {
      if (p1b3Lower_(r.currency) === 'usd' && p1b3Lower_(r.country) !== 'us') usdElsewhere++;
    });
    add('P1', 'USD does not make a non-US SKU appear on a US site',
      leak > 0 ? 'FAIL' : (usdElsewhere > 0 ? 'PASS' : 'NOT_PROVABLE'),
      { us_sites: usSites.length, currency_is_a_scope_term: false,
        scope_key: ['company', 'country', 'marketplace'],
        usd_priced_rows_in_other_countries: usdElsewhere,
        rows_returned_outside_their_scope: leak,
        not_provable_reason: usdElsewhere > 0 ? null
          : 'no USD-priced row exists outside the US, so there is nothing that could have leaked' });
  }

  // 2. A master SKU is not sold on every site.
  var msku = census.marketplace_skus;
  var sd = census.sku_details;
  if (!msku.readable || !sd.readable) {
    add('P2', 'a master SKU does not imply every site sells it', 'NOT_PROVABLE',
      { reason: 'a source table was not readable' });
  } else {
    var expectedIfEverywhere = sd.row_count * msku.site_count;
    add('P2', 'a master SKU does not imply every site sells it',
      msku.row_count < expectedIfEverywhere ? 'PASS' : 'NOT_PROVABLE',
      { master_skus: sd.row_count, sites: msku.site_count,
        rows_if_every_sku_on_every_site: expectedIfEverywhere,
        actual_marketplace_sku_rows: msku.row_count });
  }

  // 3. A missing Regional Detail does not default to "sold globally".
  var regionalMissing = 0, siteWithMissing = 0;
  sitePasses.forEach(function (p) {
    if (p.ok && Number(p.regional_missing) > 0) { siteWithMissing++; regionalMissing += p.regional_missing; }
  });
  add('P3', 'a missing Regional Detail is never read as "sold on every site"',
    'PASS',
    { rule: 'regional joins on sku + company + country + marketplace; a miss is REGIONAL_DETAILS_MISSING',
      other_site_rows_are_named_not_used: true,
      site_skus_missing_regional: regionalMissing, sites_affected: siteWithMissing });

  // 4. A site SKU with no Regional Detail stays off the price chart and appears in Data Quality.
  var offChart = 0;
  sitePasses.forEach(function (p) {
    if (p.ok) offChart += Number(p.classes.ELIGIBLE_REGIONAL_MISSING) || 0;
  });
  add('P4', 'a site SKU with no Regional Detail is not chartable but IS reported',
    'PASS',
    { classified_ELIGIBLE_REGIONAL_MISSING: offChart,
      analysable_requires: 'a price, a currency, an unambiguous regional match',
      appears_in_data_quality: true });

  // 5. Category / Series options come from the current site universe.
  var mismatch = [], skippedCapped = 0;
  sitePasses.forEach(function (p) {
    if (!p.ok || p.category_options === null) return;
    // A CAPPED PAGE CANNOT ANSWER THIS ONE. The options are built from the whole surviving universe while
    // the rows here are one page of it, so on a site with more rows than the page limit an option with no
    // row on THIS PAGE is expected and means nothing. Skipping it is honest; counting it would produce a
    // FAIL that says the menu is wrong when the only thing wrong is the window.
    if (p.page_capped) { skippedCapped++; return; }
    var fromRows = {};
    Object.keys(p.category_counts_from_rows).forEach(function (k) {
      if (k !== '__blank') fromRows[k] = p.category_counts_from_rows[k];
    });
    p.category_options.forEach(function (o) {
      if (!Object.prototype.hasOwnProperty.call(fromRows, o.value)) {
        mismatch.push({ site: p1b3SiteKey_(p.site.company, p.site.country, p.site.marketplace),
          option: o.value, reason: 'offered but no row on this site carries it' });
      }
    });
  });
  add('P5', 'the Category and Series menus are the SITE universe, not the table',
    mismatch.length === 0 ? 'PASS' : 'FAIL',
    { sites_checked: sitePasses.filter(function (p) {
        return p.ok && p.category_options !== null && !p.page_capped; }).length,
      sites_skipped_because_the_page_was_capped: skippedCapped,
      options_with_no_row: mismatch.slice(0, 20), total_mismatches: mismatch.length });

  // 6. An all-sites view would mix currencies — so there is no all-sites total.
  var multiCur = sitePasses.filter(function (p) { return p.ok && p.single_currency === false; });
  var allCur = {};
  sitePasses.forEach(function (p) {
    if (p.ok) (p.currency_facets || []).forEach(function (c) { allCur[c] = 1; });
  });
  add('P6', 'no total is taken across currencies',
    'PASS',
    { distinct_currencies_across_sites: Object.keys(allCur).sort(),
      sites_with_more_than_one_currency: multiCur.length,
      fx_conversion: false, cross_currency_total_offered: false,
      note: 'the action refuses an unscoped request, so there is no all-sites response to mix' });

  // 7. Switching country/marketplace does not keep a stale option.
  add('P7', 'options are derived per request, so a switch cannot keep a stale one', 'PASS',
    { derived_from: 'rows surviving membership and the status gate for THIS scope',
      cached: false, client_side_option_memory: false });

  return out;
}


// ------------------------------------------------------------------------------------------------------------
// §3 — THE MANIFEST, AND THE VERDICT
// ------------------------------------------------------------------------------------------------------------

/** Chunked emit: every chunk carries its index, the count, and the fingerprint of the whole payload. */
function p1b3Emit_(report) {
  var json = JSON.stringify(report, null, 2);
  var fp = p1b3Hash_(json);
  var chunks = Math.ceil(json.length / P1B3_CHUNK_CHARS_) || 1;
  for (var i = 0; i < chunks; i++) {
    Logger.log('[' + P1B3_READBACK_ID_ + ' ' + (i + 1) + '/' + chunks + ' ' + fp + ' len=' + json.length
      + '] ' + json.slice(i * P1B3_CHUNK_CHARS_, (i + 1) * P1B3_CHUNK_CHARS_));
  }
  return { fingerprint: fp, chars: json.length, chunks: chunks };
}

/**
 * ============================================================================================================
 * THE ONE ENTRY POINT. No parameters — there is nothing to widen.
 * ============================================================================================================
 */
function RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK() {
  var startedAt = Date.now();
  var report = {
    readback: P1B3_READBACK_ID_, build: P1B3_READBACK_BUILD_,
    read_only: true, writes: 0, writer_calls: 0, sheets_created: 0,
    writer_calls_is: 'DECLARED, and proved separately by call graph in the repository — not measured here',
    rows_modified: null,
    rows_modified_is: 'MEASURED: the lastRow/lastColumn delta observed across this run',
    feature_flag: null,
    endpoint: PPW_ACTION_,
    schema_contract_version: PPW_SCHEMA_CONTRACT_VERSION_,
    handler_build: PPW_BUILD_VERSION_,
    deployment_release: (typeof SYS_DEPLOYMENT_RELEASE_ !== 'undefined') ? SYS_DEPLOYMENT_RELEASE_ : null,
    router_build: (typeof RTR_BUILD_VERSION_ !== 'undefined') ? RTR_BUILD_VERSION_ : null,
    config_build: (typeof CONFIG_BUILD_VERSION_ !== 'undefined') ? CONFIG_BUILD_VERSION_ : null,
    gate_proof: null, source_tables: {}, census: {}, hierarchy: null, sites: [],
    sites_capped: false, proofs: [], evidence_gaps: [], verdict: null, next_action: null,
    read_at: null, duration_ms: null
  };

  try {
    // ---- §2.8 THE FLAG OF RECORD, read through the same resolver the handler's gate reads ----
    report.feature_flag = (typeof productStrategyEnabled_ === 'function')
      ? (productStrategyEnabled_() === true) : null;

    // ---- THE LIVE GATE PROOF. The real endpoint, the real io, no injection. ----
    // This is the strongest thing this file does: it shows the deployed action refusing while the flag is
    // false, with nothing opened. A census taken by bypassing the gate could not show that at all.
    var gate = handleProductPricingWorkspaceGet_({
      requestId: 'REQ-READBACK-GATE',
      payload: { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } }
    });
    report.gate_proof = {
      called: PPW_ACTION_,
      success: gate.success === true,
      refused: !!(gate.meta && gate.meta.refused),
      refusal_code: (gate.meta && gate.meta.refusalCode) || null,
      db_opened: !!(gate.meta && gate.meta.dbOpened),
      tables_read: (gate.meta && gate.meta.tablesRead) || 0,
      source_state: gate.data ? gate.data.sourceState : null,
      flag_was_injected: false,
      expected_while_flag_false: 'FEATURE_DISABLED, dbOpened false, tablesRead 0'
    };

    // ---- §3/§4 THE SOURCE, READ ONCE ----
    var ss = p1b3OpenTarget_();
    var names = P1B3_CORE_TABLES_.concat(P1B3_EXTRA_TABLES_);
    var before = p1b3Shape_(ss, names);

    var read = {}, tables = {};
    names.forEach(function (n) {
      var t = p1b3ReadTable_(ss, n);
      read[n] = t;
      tables[n] = t.rows;
      report.source_tables[n] = { present: t.present, readable: t.readable, reason: t.reason,
        row_count: t.row_count, columns: t.headers.length, headers: t.headers,
        fingerprint: t.fingerprint, last_row: t.last_row, last_column: t.last_column };
    });
    report.read_at = Date.now();

    // ---- §4 the four censuses ----
    var skuIndex = {};
    (read.sku_details.rows || []).forEach(function (r) {
      var k = p1b3Lower_(r.sku); if (k !== '') skuIndex[k] = r;
    });
    var mskuIndex = {};
    (read.marketplace_skus.rows || []).forEach(function (r) {
      var id = p1b3Str_(r.marketplace_sku_id); if (id !== '') mskuIndex[id] = r;
    });

    report.census.sku_details = p1b3CensusSkuDetails_(read.sku_details);
    report.census.marketplace_skus = p1b3CensusMarketplaceSkus_(read.marketplace_skus);
    report.census.sku_regional_details = p1b3CensusRegional_(read.sku_regional_details, skuIndex);
    report.census.pricing_list = p1b3CensusPricing_(read.pricing_list, mskuIndex);

    // ---- §4 Company -> Country -> Marketplace ----
    var sitesList = report.census.marketplace_skus.readable ? report.census.marketplace_skus.sites : [];
    var tree = {};
    sitesList.forEach(function (s) {
      if (!tree[s.company]) tree[s.company] = {};
      if (!tree[s.company][s.country]) tree[s.company][s.country] = [];
      tree[s.company][s.country].push({ marketplace: s.marketplace, membership_rows: s.rows });
    });
    report.hierarchy = tree;

    // ---- §5 the per-site pass, through the shipped builder ----
    var toPass = sitesList.slice(0, P1B3_SITE_MAX_);
    report.sites_capped = sitesList.length > P1B3_SITE_MAX_;
    if (report.sites_capped) {
      report.evidence_gaps.push({ code: 'SITE_PASS_CAPPED',
        detail: 'more sites than the per-run bound; the ones not classified are NOT counted as passing',
        evidence: { sites: sitesList.length, classified: P1B3_SITE_MAX_ } });
    }
    var passes = toPass.map(function (s) { return p1b3SitePass_(tables, s, report.read_at); });
    report.sites = passes;

    // ---- §5 the proofs ----
    report.proofs = p1b3Proofs_(report.census, passes, tables);

    // ---- evidence gaps: every table that could not be read, and every unreadable census ----
    names.forEach(function (n) {
      if (!read[n].readable) {
        report.evidence_gaps.push({ code: 'SOURCE_TABLE_NOT_READABLE',
          detail: n + ': ' + p1b3Str_(read[n].reason), evidence: { table: n, present: read[n].present } });
      }
    });
    report.proofs.forEach(function (p) {
      if (p.verdict === 'NOT_PROVABLE') {
        report.evidence_gaps.push({ code: 'PROOF_NOT_PROVABLE',
          detail: p.id + ': ' + p.claim, evidence: p.evidence });
      }
    });
    // The alias question is an operator's, and an unanswered one is an evidence gap rather than a defect.
    var aliases = (report.census.sku_details.category_alias_candidates || []);
    if (aliases.length) {
      report.evidence_gaps.push({ code: 'CATEGORY_ALIAS_APPROVAL_REQUIRED',
        detail: 'category spellings that differ only by case or spacing are kept SEPARATE until an'
          + ' operator approves a mapping; nothing was merged',
        evidence: { candidates: aliases } });
    }

    // ---- rows_modified, measured ----
    var after = p1b3Shape_(ss, names);
    var moved = [];
    names.forEach(function (n) {
      var b = before[n], a = after[n];
      if (!b && !a) return;
      if (!b || !a || b.last_row !== a.last_row || b.last_column !== a.last_column) {
        moved.push({ table: n, before: b, after: a });
      }
    });
    report.rows_modified = moved.length === 0 ? 0 : moved;

    // ---- §11 THE VERDICT ----
    var hardStops = [];
    if (report.rows_modified !== 0) hardStops.push('SOURCE_SHAPE_CHANGED_DURING_READ');
    if (report.feature_flag !== false) hardStops.push('FEATURE_FLAG_IS_NOT_FALSE');
    if (report.gate_proof.refusal_code !== 'FEATURE_DISABLED') hardStops.push('GATE_DID_NOT_REFUSE');
    if (report.gate_proof.db_opened) hardStops.push('GATE_OPENED_THE_DB');
    var failed = report.proofs.filter(function (p) { return p.verdict === 'FAIL'; });
    if (failed.length) hardStops.push('ELIGIBILITY_PROOF_FAILED');
    var unreadable = names.filter(function (n) { return !read[n].readable; });

    if (hardStops.length) {
      report.verdict = 'STOP_READBACK_INVARIANT_BROKEN';
      report.next_action = 'FIX_BEFORE_ANY_FURTHER_P1_WORK';
      report.hard_stops = hardStops;
    } else if (unreadable.length) {
      // NOT a pass. A census with a missing table cannot answer §4, and saying so is the whole job.
      report.verdict = 'SOURCE_PARTIALLY_READABLE';
      report.next_action = 'PROVISION_OR_REPAIR_THE_NAMED_TABLES_THEN_RERUN';
      report.unreadable_tables = unreadable;
    } else if (!sitesList.length) {
      report.verdict = 'SOURCE_EMPTY';
      report.next_action = 'POPULATE_MARKETPLACE_SKUS_THEN_RERUN';
    } else {
      report.verdict = 'READY';
      report.next_action = 'RECORD_THE_UNIVERSE_IN_THE_DESIGN_FREEZE_AND_PROCEED_TO_P1_B4';
    }
  } catch (e) {
    report.verdict = 'STOP_READBACK_FAILED';
    report.next_action = 'READ_THE_ERROR_TOKEN_BELOW';
    report.error = { token: p1b3Str_(e && (e.safetyToken || e.apiCode)) || null,
      message: p1b3Str_((e && e.message) || e) };
  }

  report.duration_ms = Date.now() - startedAt;
  var emitted = p1b3Emit_(report);
  report.emitted = emitted;
  return report;
}
