/**
 * TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1.gs — FC-EU-BFCM-DATA-RECONCILIATION-R1
 * PASTE · RUN · REMOVE. READ-ONLY. DRY RUN. IT WRITES NOTHING.
 * ================================================================================================================
 *
 * WHAT THIS IS FOR
 * ----------------
 * FC-SPECIAL-EVENT-WRITE-CONSISTENCY-R2 stopped the graph from acquiring a NEW hole. It did not repair the hole
 * that is already there: a campaign whose fc_special_events rows reference campaign_sku_lines that do not exist.
 * This file is the read half of that repair. It reads the current canonical rows, classifies every affected
 * event, and emits the exact repair plan a future authorized execution would carry out — and then stops.
 *
 * DRY_RUN_ONLY = YES   PRODUCTION_ROWS_WRITTEN = 0   PRODUCTION_REPAIR_EXECUTION_AUTHORIZED = NO
 *
 * WHAT MAKES IT READ-ONLY
 * -----------------------
 *   - There is no write in this file: no appendRow, no setValue(s), no deleteRow, no insertRow, no clear, no
 *     SpreadsheetApp.flush, no Drive, no MailApp, no property or trigger mutation, no LockService.
 *   - It never obtains a writer. handleUpsertCampaignSkuLines_, fcSpecialEventUpsert_ and every other write
 *     handler are NOT called. It does not require them to be present.
 *   - No Sheet object escapes a read helper. FCRC_readTable_ opens the sheet, takes values, and returns plain
 *     rows; the caller never holds anything with a write method on it.
 *
 * NOTHING IS HARDCODED
 * --------------------
 * No company, country, marketplace, event flag, campaign id or SKU appears anywhere in this file. Neither does
 * any expected row count. HARDCODED_INCIDENT_ROW_COUNT = NO: the expected line cardinality is DERIVED from the
 * authoritative current graph (the distinct campaign_sku_line_id values the surviving events reference, union
 * the lines that exist), every time it is asked for. The same code answers 4, 9 or 400.
 *
 * HOW TO RUN
 * ----------
 *   1. Paste this file into the Apps Script project bound to the production database (any name; one global scope).
 *   2. Edit nothing. Call the entry point from the editor with the campaign you are reconciling:
 *
 *        TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({ campaign_id: '<campaign id>' });
 *
 *      or, when the id is not to hand, by the campaign's own identity columns:
 *
 *        TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1({
 *          company: '<company>', country: '<country>', marketplace: '<marketplace>',
 *          event_flag: '<event flag>', year: <year>
 *        });
 *
 *      Any subset of those five is allowed; every campaign matching ALL supplied columns is reconciled, and the
 *      report names them. Supplying none of them is refused, because "reconcile every campaign" is not a request
 *      this file should be able to satisfy by accident.
 *   3. Read the returned object (and the Logger output).
 *   4. DELETE this file from the project. It is not part of the deployment.
 *
 * AFTER a future AUTHORIZED repair, the acceptance test is the second entry point:
 *
 *        TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1({ campaign_id: '<campaign id>' });
 *
 *      It re-runs the same classification and returns accepted = true only when the graph is whole. It is the
 *      same comparison the save's own graph readback performs, run once more with no write behind it.
 *
 * WHAT IT CANNOT DO, AND WHY THAT IS THE POINT
 * --------------------------------------------
 * discount_percent lives on campaign_sku_lines and on NO event column. Neither does promo_price, and neither
 * does the price snapshot the line took when it was written. They are not in the graph, so they cannot be
 * derived from it, and this file will not invent them. Every missing line therefore leaves the plan as
 * WAITING_OPERATOR_VALUE until the operator supplies them; the report groups the blanks by Series and SKU so
 * they can be filled in one pass.
 */

var FCRC_R1_ = 'FC-EU-BFCM-DATA-RECONCILIATION-R1';

// The canonical target header, mirrored from 20_campaign_write_handlers.gs. Mirrored rather than referenced so
// this file runs even in a project where that module is absent; FCRC_headerDrift_ reports any divergence
// instead of silently planning a row against a header that has moved.
var FCRC_LINE_HEADERS_ = [
  'campaign_sku_line_id', 'campaign_id', 'marketplace_sku_id', 'sku', 'promo_price', 'regular_price',
  'price_units', 'discount_percent', 'special_condition', 'lps', 'line_status', 'source',
  'created_by', 'created_at', 'updated_by', 'updated_at'
];

// The five campaign columns a selector may filter on. campaign_id is handled separately because it is an
// identity, not a filter.
var FCRC_CAMPAIGN_SELECTOR_FIELDS_ = ['company', 'country', 'marketplace', 'event_flag', 'year'];

// What a reconstructed row gets when nothing authoritative supplies it. `source` is deliberately NOT the
// builder's own token: a row this procedure creates was not written by the Special Event Builder, and stamping
// it as though it were would put a false provenance in the audit column. The operator may override it.
var FCRC_DEFAULTS_ = { line_status: 'active', source: 'fc_reconciliation' };

function FCRC_up_(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function FCRC_str_(v) { return String(v == null ? '' : v).trim(); }

/** Read one sheet into { ok, error, headers, rows } of plain objects. The ONLY sheet access in this file. */
function FCRC_readTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return { ok: false, error: 'SHEET_NOT_FOUND', name: name, headers: [], rows: [] };
  var grid = sh.getDataRange().getValues();
  if (!grid || !grid.length) return { ok: false, error: 'SHEET_EMPTY', name: name, headers: [], rows: [] };
  var headers = grid[0].map(function (h) { return FCRC_str_(h); });
  var rows = [];
  for (var i = 1; i < grid.length; i++) {
    var o = { __row: i + 1 }, blank = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      o[headers[c]] = grid[i][c];
      if (FCRC_str_(grid[i][c]) !== '') blank = false;
    }
    if (!blank) rows.push(o);
  }
  return { ok: true, error: '', name: name, headers: headers, rows: rows };
}

/** §12 — report header drift rather than planning a row against a header that has moved. */
function FCRC_headerDrift_(actual) {
  var have = {}, missing = [], extra = [];
  (actual || []).forEach(function (h) { if (h) have[h] = true; });
  FCRC_LINE_HEADERS_.forEach(function (h) { if (!have[h]) missing.push(h); });
  (actual || []).forEach(function (h) {
    if (h && FCRC_LINE_HEADERS_.indexOf(h) === -1) extra.push(h);
  });
  return { missing_columns: missing, extra_columns: extra,
    schema_extension_required: missing.length > 0 };
}

/**
 * Resolve which campaigns this run owns. Either an explicit id (or ids), or every campaign matching ALL of the
 * supplied identity columns. An empty selector is REFUSED.
 */
function FCRC_resolveCampaigns_(campRows, opts) {
  var ids = [];
  if (opts.campaign_id) ids.push(FCRC_str_(opts.campaign_id));
  (opts.campaign_ids || []).forEach(function (v) { if (FCRC_str_(v)) ids.push(FCRC_str_(v)); });

  if (ids.length) {
    var want = {}, out = [], notFound = [];
    ids.forEach(function (id) { want[FCRC_up_(id)] = id; });
    campRows.forEach(function (r) {
      if (want[FCRC_up_(r.campaign_id)]) out.push(r);
    });
    var found = {};
    out.forEach(function (r) { found[FCRC_up_(r.campaign_id)] = true; });
    Object.keys(want).forEach(function (k) { if (!found[k]) notFound.push(want[k]); });
    return { ok: true, campaigns: out, requested_ids: ids, not_found: notFound, by: 'campaign_id' };
  }

  var filter = {};
  FCRC_CAMPAIGN_SELECTOR_FIELDS_.forEach(function (f) {
    if (opts[f] !== undefined && opts[f] !== null && FCRC_str_(opts[f]) !== '') filter[f] = FCRC_up_(opts[f]);
  });
  if (!Object.keys(filter).length) {
    return { ok: false, error: 'EMPTY_SELECTOR',
      detail: 'Supply campaign_id, or at least one of: ' + FCRC_CAMPAIGN_SELECTOR_FIELDS_.join(', ') +
        '. Reconciling every campaign is not a request this census will satisfy by default.',
      campaigns: [], requested_ids: [], not_found: [], by: 'selector' };
  }
  var matched = campRows.filter(function (r) {
    return Object.keys(filter).every(function (f) { return FCRC_up_(r[f]) === filter[f]; });
  });
  return { ok: true, campaigns: matched, requested_ids: [], not_found: [], by: 'selector', filter: filter };
}

/** The line identity 20_ resolves by: campaign + marketplace_sku_id, falling back to campaign + sku. */
function FCRC_lineIdentityKeys_(campaignId, marketplaceSkuId, sku) {
  var c = FCRC_up_(campaignId), out = [];
  if (FCRC_up_(marketplaceSkuId)) out.push('MSKU:' + c + '|' + FCRC_up_(marketplaceSkuId));
  if (FCRC_up_(sku)) out.push('SKU:' + c + '|' + FCRC_up_(sku));
  return out;
}

/**
 * THE CLASSIFIER. One state per event, derived — never assumed. Returns the whole picture for one campaign.
 *
 * The states are FC-EU-BFCM-DATA-RECONCILIATION-R1 §3's, and they are evaluated in an order that makes each
 * one mean what it says: a missing campaign is reported as MISSING_CAMPAIGN and NOT additionally as a missing
 * line, because with no campaign there is nothing to attach a line to and the repair is a different repair.
 */
function FCRC_classifyCampaign_(campaignId, campaignRow, lineRows, eventRows) {
  var cid = FCRC_up_(campaignId);
  var lines = lineRows.filter(function (r) { return FCRC_up_(r.campaign_id) === cid; });
  var events = eventRows.filter(function (r) { return FCRC_up_(r.campaign_id) === cid; });

  // Every line id in the WHOLE table, so a reference that resolves under a DIFFERENT campaign is reported as a
  // mismatch rather than as a hole. The difference matters: one is reconstructed, the other is refused.
  var lineById = {}, lineIdCount = {};
  lineRows.forEach(function (r) {
    var id = FCRC_up_(r.campaign_sku_line_id);
    if (!id) return;
    lineIdCount[id] = (lineIdCount[id] || 0) + 1;
    if (!lineById[id]) lineById[id] = r;
  });

  // Identity occupancy under THIS campaign, for the duplicate-identity refusal.
  var identityOwner = {};
  lines.forEach(function (r) {
    FCRC_lineIdentityKeys_(r.campaign_id, r.marketplace_sku_id, r.sku).forEach(function (k) {
      if (!identityOwner[k]) identityOwner[k] = FCRC_str_(r.campaign_sku_line_id);
    });
  });

  // Event uniqueness key, mirrored from 14_: company|country|marketplace|sku|event_name|year.
  var evtKeyCount = {};
  events.forEach(function (r) {
    var k = [r.company, r.country, r.marketplace, r.sku, r.event_name, r.year]
      .map(function (v) { return FCRC_up_(v); }).join('|');
    if (k.split('|').some(function (p) { return p === ''; })) return;
    evtKeyCount[k] = (evtKeyCount[k] || 0) + 1;
  });

  var classified = [], counts = {};
  function bump(state) { counts[state] = (counts[state] || 0) + 1; }

  events.forEach(function (e) {
    var refId = FCRC_str_(e.campaign_sku_line_id);
    var refUp = FCRC_up_(refId);
    var evtKey = [e.company, e.country, e.marketplace, e.sku, e.event_name, e.year]
      .map(function (v) { return FCRC_up_(v); }).join('|');
    var state;

    if (!campaignRow) {
      state = 'MISSING_CAMPAIGN';
    } else if (!refUp) {
      // No id to reconstruct UNDER, and §4 forbids minting one. Nothing here is repairable by this procedure.
      state = 'UNKNOWN';
    } else if (evtKeyCount[evtKey] > 1) {
      state = 'DUPLICATE_EVENT';
    } else if (lineIdCount[refUp] > 1) {
      state = 'DUPLICATE_LINE';
    } else if (!lineById[refUp]) {
      state = 'MISSING_CAMPAIGN_SKU_LINE';
    } else if (FCRC_up_(lineById[refUp].campaign_id) !== cid) {
      state = 'CAMPAIGN_MISMATCH';
    } else if (FCRC_up_(lineById[refUp].sku) && FCRC_up_(e.sku) &&
               FCRC_up_(lineById[refUp].sku) !== FCRC_up_(e.sku)) {
      state = 'IDENTITY_MISMATCH';
    } else {
      state = 'VALID_GRAPH';
    }

    bump(state);
    classified.push({
      event_fc_id: FCRC_str_(e.event_fc_id), campaign_id: FCRC_str_(e.campaign_id),
      campaign_sku_line_id: refId, sku: FCRC_str_(e.sku), series: FCRC_str_(e.series),
      category: FCRC_str_(e.category), event_name: FCRC_str_(e.event_name), year: FCRC_str_(e.year),
      company: FCRC_str_(e.company), country: FCRC_str_(e.country),
      marketplace: FCRC_str_(e.marketplace), marketplace_id: FCRC_str_(e.marketplace_id),
      state: state, sheet_row: e.__row
    });
  });

  // DERIVED cardinality. Expected = every line the graph says should exist: the distinct ids the events
  // reference, plus the lines that already exist under this campaign (a line with no special event is still a
  // legitimate line and must not be counted as surplus).
  var expectedIds = {}, missingIds = [];
  classified.forEach(function (c) {
    if (c.campaign_sku_line_id) expectedIds[FCRC_up_(c.campaign_sku_line_id)] = c.campaign_sku_line_id;
  });
  lines.forEach(function (r) {
    var id = FCRC_str_(r.campaign_sku_line_id);
    if (id) expectedIds[FCRC_up_(id)] = id;
  });
  Object.keys(expectedIds).forEach(function (k) { if (!lineById[k]) missingIds.push(expectedIds[k]); });
  missingIds.sort();

  var orphans = classified.filter(function (c) { return c.state === 'MISSING_CAMPAIGN_SKU_LINE'; });

  return {
    campaign_id: campaignId, campaign_found: !!campaignRow,
    campaign: campaignRow ? {
      campaign_id: FCRC_str_(campaignRow.campaign_id), company: FCRC_str_(campaignRow.company),
      country: FCRC_str_(campaignRow.country), marketplace: FCRC_str_(campaignRow.marketplace),
      marketplace_id: FCRC_str_(campaignRow.marketplace_id), campaign_name: FCRC_str_(campaignRow.campaign_name),
      event_flag: FCRC_str_(campaignRow.event_flag), year: FCRC_str_(campaignRow.year),
      start_date: FCRC_str_(campaignRow.start_date), end_date: FCRC_str_(campaignRow.end_date)
    } : null,
    lines: lines, events: events, classified: classified, state_counts: counts,
    line_count: lines.length, event_count: events.length,
    expected_line_count: Object.keys(expectedIds).length,
    missing_line_ids: missingIds, missing_line_count: missingIds.length,
    orphan_event_count: orphans.length,
    line_id_count: lineIdCount, line_by_id: lineById, identity_owner: identityOwner
  };
}

/**
 * §5 / §7 — build ONE proposed row, with its field matrix and its status. Every field says where it came from,
 * and a field with no authoritative source says so rather than acquiring a plausible value.
 */
function FCRC_proposeLine_(lineId, view, mskuRows, pricingRows) {
  var refEvents = view.classified.filter(function (c) {
    return FCRC_up_(c.campaign_sku_line_id) === FCRC_up_(lineId);
  });

  var matrix = [], conflicts = [], notes = [];
  function put(field, source, deterministic, operatorRequired, defaultAllowed, value) {
    matrix.push({ field: field, source: source, deterministic: deterministic,
      operator_required: operatorRequired, default_allowed: defaultAllowed, value: value });
  }

  // ---- §7 CONFLICT CHECKS, before anything is proposed --------------------------------------------------
  if (!view.campaign_found) conflicts.push('CAMPAIGN_NOT_FOUND');
  if (view.line_by_id[FCRC_up_(lineId)]) conflicts.push('LINE_ALREADY_EXISTS');
  if (!refEvents.length) conflicts.push('NO_EVENT_REFERENCES_THIS_LINE_ID');

  var distinctCampaigns = {}, distinctSkus = {};
  refEvents.forEach(function (e) {
    distinctCampaigns[FCRC_up_(e.campaign_id)] = true;
    if (FCRC_up_(e.sku)) distinctSkus[FCRC_up_(e.sku)] = FCRC_str_(e.sku);
  });
  if (Object.keys(distinctCampaigns).length > 1) conflicts.push('EVENTS_DISAGREE_ON_CAMPAIGN');
  if (Object.keys(distinctCampaigns).length === 1 &&
      Object.keys(distinctCampaigns)[0] !== FCRC_up_(view.campaign_id)) conflicts.push('EVENT_CAMPAIGN_MISMATCH');
  if (Object.keys(distinctSkus).length > 1) conflicts.push('EVENTS_DISAGREE_ON_SKU');

  var sku = Object.keys(distinctSkus).length === 1 ? distinctSkus[Object.keys(distinctSkus)[0]] : '';
  var e0 = refEvents[0] || {};

  // ---- marketplace_sku_id: derived, and only when the derivation is one-to-one ---------------------------
  var mskuMatches = (mskuRows || []).filter(function (m) {
    return FCRC_up_(m.sku) === FCRC_up_(sku) &&
      FCRC_up_(m.company) === FCRC_up_(e0.company) &&
      FCRC_up_(m.country) === FCRC_up_(e0.country) &&
      FCRC_up_(m.marketplace) === FCRC_up_(e0.marketplace);
  });
  var msku = '', mskuDet = 'NO', mskuOp = 'YES';
  if (mskuMatches.length === 1) {
    msku = FCRC_str_(mskuMatches[0].marketplace_sku_id); mskuDet = 'YES'; mskuOp = 'NO';
  } else if (mskuMatches.length === 0) {
    notes.push('marketplace_skus has no row for this sku in this company/country/marketplace');
  } else {
    notes.push('marketplace_skus has ' + mskuMatches.length + ' rows for this sku in this scope');
    conflicts.push('MARKETPLACE_SKU_AMBIGUOUS');
  }

  // ---- identity occupancy: would this row duplicate an identity a DIFFERENT line already holds? ----------
  FCRC_lineIdentityKeys_(view.campaign_id, msku, sku).forEach(function (k) {
    var owner = view.identity_owner[k];
    if (owner && FCRC_up_(owner) !== FCRC_up_(lineId)) conflicts.push('IDENTITY_HELD_BY_' + owner);
  });

  // ---- price snapshot: TODAY's pricing_list is not the snapshot the lost row held --------------------------
  var priceRow = null;
  if (msku) {
    var pm = (pricingRows || []).filter(function (p) { return FCRC_up_(p.marketplace_sku_id) === FCRC_up_(msku); });
    if (pm.length === 1) priceRow = pm[0];
    else if (pm.length > 1) notes.push('pricing_list has ' + pm.length + ' rows for this marketplace_sku_id');
  }

  put('campaign_sku_line_id', 'fc_special_events.campaign_sku_line_id (the surviving reference)', 'YES', 'NO', 'NO', lineId);
  put('campaign_id', 'fc_special_events.campaign_id', 'YES', 'NO', 'NO', FCRC_str_(view.campaign_id));
  put('sku', 'fc_special_events.sku', Object.keys(distinctSkus).length === 1 ? 'YES' : 'NO', 'NO', 'NO', sku);
  put('marketplace_sku_id', 'marketplace_skus by sku + company/country/marketplace', mskuDet, mskuOp, 'NO', msku);
  put('promo_price', 'NONE — the deal price is on the line and on no event column', 'NO', 'YES', 'NO', '');
  put('regular_price', "pricing_list TODAY — NOT the snapshot the lost row held", 'NO', 'YES', 'NO',
    priceRow ? priceRow.regular_price : '');
  put('price_units', "pricing_list.currency TODAY — NOT the snapshot the lost row held", 'NO', 'YES', 'NO',
    priceRow ? priceRow.currency : '');
  put('discount_percent', 'NONE — on the line and on no event column', 'NO', 'YES', 'NO', '');
  put('special_condition', 'NONE', 'NO', 'NO', 'YES', '');
  put('lps', 'NONE', 'NO', 'NO', 'YES', '');
  put('line_status', 'default', 'NO', 'NO', 'YES', FCRC_DEFAULTS_.line_status);
  put('source', 'default — NOT the builder token; this row was not written by the builder', 'NO', 'NO', 'YES', FCRC_DEFAULTS_.source);
  put('created_by', 'the repair actor, at execution', 'NO', 'NO', 'YES', '');
  put('created_at', 'the repair TIME — not the original creation time, which is unrecoverable', 'NO', 'NO', 'YES', '');
  put('updated_by', 'the repair actor, at execution', 'NO', 'NO', 'YES', '');
  put('updated_at', 'the repair TIME', 'NO', 'NO', 'YES', '');

  var waiting = matrix.filter(function (m) {
    return m.operator_required === 'YES' && FCRC_str_(m.value) === '';
  }).map(function (m) { return m.field; });

  var status;
  if (conflicts.length) status = 'REFUSED_CONFLICT';
  else if (!sku) status = 'UNKNOWN';
  else if (waiting.length) status = 'WAITING_OPERATOR_VALUE';
  else status = 'READY_FOR_REPAIR';

  return {
    campaign_sku_line_id: lineId, campaign_id: FCRC_str_(view.campaign_id), sku: sku,
    series: FCRC_str_(e0.series), category: FCRC_str_(e0.category),
    company: FCRC_str_(e0.company), country: FCRC_str_(e0.country),
    marketplace: FCRC_str_(e0.marketplace), marketplace_id: FCRC_str_(e0.marketplace_id),
    marketplace_sku_id: msku,
    referenced_by_event_ids: refEvents.map(function (e) { return e.event_fc_id; }),
    field_matrix: matrix, waiting_fields: waiting, conflicts: conflicts, notes: notes,
    status: status,
    reason: conflicts.length ? conflicts.join('; ')
      : (status === 'UNKNOWN' ? 'the referencing events do not agree on a single SKU'
        : (waiting.length ? 'operator must supply: ' + waiting.join(', ')
          : 'every field is determined')),
    // §9 — the row's own canonical id IS the idempotency key. A second execution finds the line present at the
    // pre-check and skips it; it does not re-derive, and it never overwrites.
    idempotency_key: lineId
  };
}

/** THE ENTRY POINT. Read, classify, plan, report. Writes nothing. */
function TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1(opts) {
  opts = opts || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var tCamp = FCRC_readTable_(ss, 'campaigns');
  var tLine = FCRC_readTable_(ss, 'campaign_sku_lines');
  var tEvt = FCRC_readTable_(ss, 'fc_special_events');
  var tMsku = FCRC_readTable_(ss, 'marketplace_skus');
  var tPrice = FCRC_readTable_(ss, 'pricing_list');

  var unreadable = [tCamp, tLine, tEvt].filter(function (t) { return !t.ok; })
    .map(function (t) { return t.name + ':' + t.error; });
  if (unreadable.length) {
    var refusal = { task: FCRC_R1_, verdict: 'STOP', blocker: 'AUTHORITATIVE_TABLE_UNREADABLE',
      unreadable: unreadable, dry_run_only: 'YES', production_rows_written: 0, db_writes: 0 };
    Logger.log(JSON.stringify(refusal, null, 2));
    return refusal;
  }

  var sel = FCRC_resolveCampaigns_(tCamp.rows, opts);
  if (!sel.ok) {
    var bad = { task: FCRC_R1_, verdict: 'STOP', blocker: sel.error, detail: sel.detail,
      dry_run_only: 'YES', production_rows_written: 0, db_writes: 0 };
    Logger.log(JSON.stringify(bad, null, 2));
    return bad;
  }

  var drift = FCRC_headerDrift_(tLine.headers);
  var campaigns = [], plan = [], discountRows = [];
  var totals = { line_count: 0, event_count: 0, expected_line_count: 0, missing_line_count: 0,
    orphan_event_count: 0, states: {} };

  sel.campaigns.forEach(function (campRow) {
    var view = FCRC_classifyCampaign_(FCRC_str_(campRow.campaign_id), campRow, tLine.rows, tEvt.rows);
    totals.line_count += view.line_count;
    totals.event_count += view.event_count;
    totals.expected_line_count += view.expected_line_count;
    totals.missing_line_count += view.missing_line_count;
    totals.orphan_event_count += view.orphan_event_count;
    Object.keys(view.state_counts).forEach(function (k) {
      totals.states[k] = (totals.states[k] || 0) + view.state_counts[k];
    });

    view.missing_line_ids.forEach(function (id) {
      var row = FCRC_proposeLine_(id, view, tMsku.rows, tPrice.rows);
      plan.push(row);
      if (row.status === 'WAITING_OPERATOR_VALUE' || row.status === 'READY_FOR_REPAIR') {
        discountRows.push({ series: row.series || '(no series on the event)', sku: row.sku,
          campaign_sku_line_id: row.campaign_sku_line_id, campaign_id: row.campaign_id,
          discount_percent: '', promo_price: '', regular_price: '', price_units: '' });
      }
    });

    campaigns.push({
      campaign_id: view.campaign_id, campaign: view.campaign,
      line_count: view.line_count, event_count: view.event_count,
      expected_line_count: view.expected_line_count, missing_line_count: view.missing_line_count,
      orphan_event_count: view.orphan_event_count, state_counts: view.state_counts,
      missing_line_ids: view.missing_line_ids, classified: view.classified
    });
  });

  // §6 — group the blanks the operator must fill, by Series then SKU. Two Series are NOT assumed to share a
  // discount: every row carries its own blank, and the grouping is a convenience, not a claim.
  var bySeries = {};
  discountRows.forEach(function (r) {
    var k = r.series || '(no series on the event)';
    (bySeries[k] = bySeries[k] || []).push(r);
  });

  function countStatus(s) { return plan.filter(function (p) { return p.status === s; }).length; }

  var report = {
    task: FCRC_R1_,
    mode: 'READ_ONLY_DRY_RUN',
    selected_by: sel.by, selector: sel.filter || null,
    requested_campaign_ids: sel.requested_ids, campaign_ids_not_found: sel.not_found,

    current_campaign_count: sel.campaigns.length,
    current_event_count: totals.event_count,
    current_line_count: totals.line_count,
    expected_line_count: totals.expected_line_count,
    missing_line_count: totals.missing_line_count,
    orphan_event_count: totals.orphan_event_count,
    graph_classification: totals.states,

    // §4 — the repair mints NOTHING. Asserted here so the report itself carries the claim.
    new_campaign_id_count: 0, new_event_id_count: 0, new_line_id_mint_count: 0,
    // §11 — reconstruct-missing-only.
    delete_campaign_count: 0, delete_event_count: 0, delete_valid_line_count: 0,

    discount_recoverable: 'NO',
    discount_recoverable_reason: 'discount_percent, promo_price and the price snapshot exist on ' +
      'campaign_sku_lines and on no fc_special_events column; the graph cannot supply them',
    operator_required_discount_rows: discountRows,
    operator_required_discount_by_series: bySeries,

    repair_plan: plan,
    ready_for_repair_count: countStatus('READY_FOR_REPAIR'),
    waiting_operator_value_count: countStatus('WAITING_OPERATOR_VALUE'),
    refused_conflict_count: countStatus('REFUSED_CONFLICT'),
    unknown_count: countStatus('UNKNOWN'),

    repair_idempotency_key: 'campaign_sku_line_id',
    duplicate_repair_effect: 'NO_OP — the pre-check finds the line present and skips it; no cell is touched',

    new_table_required: 'NO',
    new_columns_required: drift.missing_columns.length ? drift.missing_columns : 'NONE',
    schema_extension_required: drift.schema_extension_required ? 'YES' : 'NO',
    db_migration_required: 'NO',
    line_header_drift: drift,

    dry_run_only: 'YES',
    production_rows_written: 0,
    db_writes: 0,
    production_repair_execution_authorized: 'NO',
    campaigns: campaigns
  };

  report.verdict = (report.refused_conflict_count || report.unknown_count) ? 'REVIEW'
    : (report.missing_line_count ? 'PLAN_READY' : 'GRAPH_ALREADY_WHOLE');

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * §10 — THE ACCEPTANCE TEST, for the future authorized execution. Run AFTER the repair. It re-runs the same
 * classification and accepts only a whole graph. It writes nothing either.
 */
function TEMP_FC_EU_BFCM_RECONCILIATION_VERIFY_R1(opts) {
  var pre = TEMP_FC_EU_BFCM_RECONCILIATION_DRY_RUN_R1(opts || {});
  if (pre.verdict === 'STOP') return pre;

  var s = pre.graph_classification || {};
  function n(k) { return s[k] || 0; }
  var checks = {
    campaign_present: pre.current_campaign_count > 0,
    zero_missing_lines: pre.missing_line_count === 0,
    zero_orphan_events: pre.orphan_event_count === 0,
    zero_missing_campaign: n('MISSING_CAMPAIGN') === 0,
    zero_campaign_mismatch: n('CAMPAIGN_MISMATCH') === 0,
    zero_duplicate_line: n('DUPLICATE_LINE') === 0,
    zero_duplicate_event: n('DUPLICATE_EVENT') === 0,
    zero_identity_mismatch: n('IDENTITY_MISMATCH') === 0,
    zero_unknown: n('UNKNOWN') === 0,
    line_count_meets_expected: pre.current_line_count >= pre.expected_line_count,
    every_event_valid: n('VALID_GRAPH') === pre.current_event_count
  };
  var failed = Object.keys(checks).filter(function (k) { return !checks[k]; });

  var out = { task: FCRC_R1_, mode: 'READ_ONLY_ACCEPTANCE',
    accepted: failed.length === 0, failed_checks: failed, checks: checks,
    current_campaign_count: pre.current_campaign_count,
    current_event_count: pre.current_event_count,
    current_line_count: pre.current_line_count,
    expected_line_count: pre.expected_line_count,
    missing_line_count: pre.missing_line_count,
    orphan_event_count: pre.orphan_event_count,
    graph_classification: pre.graph_classification,
    production_rows_written: 0, db_writes: 0 };
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}
