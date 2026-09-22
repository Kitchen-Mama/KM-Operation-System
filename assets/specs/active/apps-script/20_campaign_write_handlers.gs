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
// MIGRATION SAFETY: additive columns only; no column is ever renamed, moved or dropped.
//   HISTORICAL NOTE (corrected FC-SUMMARY-R2B-A): fcWriteEnsureColumns_ USED to append a missing header to
//   the live sheet's right edge. Production Safety Round S0.5 made it validate-only, so it appends nothing
//   today — but the appends it already performed are why the live `campaigns` header ends in company /
//   event_flag / created_by / updated_by instead of carrying them at indexes 1, 8, 21, 23. Those writes were
//   sanctioned when they ran; the schema gate is what changed underneath them. See 14_ FC_SCHEMA_BY_NAME_.
// ============================================================

// FC-SUMMARY-R2B-A3-R1 — this owner's first declared build stamp. It had none, which meant a partial
// sync of this file was invisible to system.health: an old 20_ still keys campaigns by NAME and
// ignores expected_row_version, so it answers success to every save the new one refuses, and quietly
// merges two event windows into one row. That is precisely the failure a manifest row exists to name.
var CAMPAIGN_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R20';

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

// ==============================================================================================
// FC-SUMMARY-R2B-A3-R1 §1 — THE CAMPAIGN WINDOW IS IDENTITY; THE CAMPAIGN NAME IS A LABEL.
//
// The business key used to be company|country|marketplace|campaign_name|year. Two facts made that
// wrong, in opposite directions:
//
//   · the Special Event Builder composes campaign_name as `<event flag> <year>` — "BFCM 2027" — so
//     every BFCM in a year carried the SAME name. A second BFCM window in that year resolved to the
//     FIRST campaign, overwrote its start_date and end_date, and campaignLineFindByKey_ then matched
//     the same marketplace_sku_id and overwrote its line. Two distinct events, one row. The earlier
//     one was gone and nothing in the response said so.
//   · and the reverse. Renaming an event — "BFCM" to "Black Friday" — invented a SECOND campaign for
//     a window that already had one, and the SKU lines and event forecasts split across the two.
//
// So the window joins the key and the name leaves it. The name is still stored, still displayed and
// still editable; it no longer decides which row a save lands on.
//
// DATES ARE NOT STRINGS. A window cell may hold the text '2027-11-24' or a real Date, depending on how
// the row was written and on the sheet's own coercion. Comparing String(Date) — 'Wed Nov 24 2027
// 00:00:00 GMT+0800 (…)' — against the client's '2027-11-24' never matches, and a key that never
// matches appends a new campaign on EVERY save: strictly worse than the defect being repaired. So both
// shapes reduce to the same calendar day through campaignDateKey_ before they are compared.
// ==============================================================================================
// THE KEY IS NOT INVENTED HERE. It is HEADER_IDENTITY_KEY from CAMPAIGN_PROMOTION_RECORD_CONTRACT.md
// §1.2, which is the schema owner for campaign identity and which already recorded this writer's key
// as too weak — "it can merge two different date windows that share a name and a year... a future
// implementation must pass an explicit campaign_id resolved from HEADER_IDENTITY_KEY". This is that
// implementation, so it adopts that key rather than a near-miss of it.
//
// promotion_type and event_flag are in it for the same reason the window is: a Prime Day and a
// Lightning Deal running the same seven days on the same site are two campaigns, and a key that
// carried only the window would merge them exactly the way the name-based key merged two windows.
// `year` is NOT in it — two rows sharing start_date and end_date cannot differ in year except
// through bad data, and the owner does not list it.
var CAMPAIGN_KEY_FIELDS_ = ['company', 'country', 'marketplace', 'promotion_type', 'event_flag',
  'start_date', 'end_date'];
var CAMPAIGN_LOCK_MS_ = 30000;

/** A window cell as a calendar day. Date -> yyyy-MM-dd in the script timezone (the timezone the cell
    was written in); an ISO-ish string -> its first ten characters; anything else -> trimmed upper.

    `Object.prototype.toString` rather than `instanceof Date`, and not as a style preference: an
    `instanceof` test is false for a Date that came from a DIFFERENT JavaScript realm, and a date this
    function fails to recognise falls through to String(v) — 'Wed Nov 24 2027 00:00:00 GMT+0800 (…)' —
    which matches no payload, so the campaign key never resolves and every save appends a new row. The
    brand check cannot fail that way. */
function campaignDateKey_(v) {
  if (v && Object.prototype.toString.call(v) === '[object Date]') {
    if (isNaN(v.getTime())) return '';
    var y = v.getFullYear(), mo = v.getMonth() + 1, d = v.getDate();
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  var t = String(v == null ? '' : v).trim();
  var m = /^\d{4}-\d{2}-\d{2}/.exec(t);
  return m ? m[0] : t.toUpperCase();
}

/** Numeric normalisation: '' stays '', 2027 and '2027' and '2027.0' all become '2027'. */
function campaignNum_(v) {
  var t = String(v == null ? '' : v).trim();
  if (t === '') return '';
  var n = Number(t);
  return isFinite(n) ? String(n) : t;
}

/** The canonical campaign identity. company|country|marketplace|year|start_date|end_date. */
function campaignKeyOf_(o) {
  o = o || {};
  var parts = [];
  for (var i = 0; i < CAMPAIGN_KEY_FIELDS_.length; i++) {
    var f = CAMPAIGN_KEY_FIELDS_[i];
    if (f === 'start_date' || f === 'end_date') { parts.push(campaignDateKey_(o[f])); continue; }
    parts.push(campaignUpper_(o[f]));
  }
  return parts.join('|');
}

// THE KEY FIELDS AND THE CONTENT FIELDS ARE DISJOINT, AND THAT IS THE DESIGN, NOT AN OMISSION.
//
// company, country, marketplace, year, start_date and end_date are IDENTITY: changing one does not
// edit this campaign, it names a different one, and the identity gate below refuses to repoint a row
// onto it. So they carry no information a content token needs, and the two date columns in particular
// must stay out of it — the fingerprint is computed on BOTH sides, and a sheet Date read server-side
// as the local calendar day 2027-11-24 reaches the client as the ISO instant 2027-11-23T16:00:00Z.
// A version check that fails for a timezone reason is worse than no version check, because it teaches
// operators to click past it. (Identity comparison is safe because it happens only server-side, where
// campaignDateKey_ sees the sheet's own value and the request's own string.)
//
// campaign_id identifies the row rather than describing it, and the audit columns are set BY the write,
// so either one would make every token stale the moment it was issued. The aggregate performance
// columns belong to reporting, not to this builder: a nightly sales refresh must not invalidate an
// operator's open modal.
var CAMPAIGN_FINGERPRINT_FIELDS_ = ['campaign_name', 'marketplace_id', 'major_event_flag',
  'year', 'duration', 'status'];
var CAMPAIGN_FINGERPRINT_NUMERIC_ = ['year', 'duration'];

/** The row's content fingerprint. Identical for a sheet row and for a JSON row. */
function campaignFingerprint_(o) {
  o = o || {};
  var parts = [];
  for (var i = 0; i < CAMPAIGN_FINGERPRINT_FIELDS_.length; i++) {
    var f = CAMPAIGN_FINGERPRINT_FIELDS_[i];
    parts.push(CAMPAIGN_FINGERPRINT_NUMERIC_.indexOf(f) !== -1 ? campaignNum_(o[f]) : String(o[f] == null ? '' : o[f]).trim());
  }
  return parts.join('|');
}

/** Every existing campaign as { rowNumber, id, key, name, windowless, fingerprint, updated_at, row }. */
function campaignIndexRows_(s) {
  var iId = s.col('campaign_id');
  var out = [];
  for (var i = 1; i < s.rows.length; i++) {
    var r = s.rows[i];
    if (String(r.join('')).trim() === '') continue;
    var obj = {};
    for (var h = 0; h < s.headers.length; h++) { if (s.headers[h]) obj[s.headers[h]] = r[h]; }
    out.push({
      rowNumber: i + 1,
      id: String(iId === -1 ? '' : (r[iId] == null ? '' : r[iId])).trim(),
      key: campaignKeyOf_(obj),
      name: campaignUpper_(obj.campaign_name),
      windowless: !campaignDateKey_(obj.start_date) && !campaignDateKey_(obj.end_date),
      fingerprint: campaignFingerprint_(obj),
      updated_at: String(obj.updated_at == null ? '' : obj.updated_at).trim(),
      row: obj
    });
  }
  return out;
}

/** The complete canonical row, read back FROM THE SHEET after the write — never composed from the
    request, so the receipt cannot claim a value the sheet does not hold. */
function campaignReceiptFor_(sheet, campaignId) {
  var idx = campaignIndexRows_(fcWriteReadSheet_(sheet)).filter(function (r) { return r.id === campaignId; });
  if (idx.length !== 1) return null;
  var out = {};
  CAMPAIGNS_HEADERS_.forEach(function (h) {
    var v = idx[0].row[h];
    out[h] = (v === undefined || v === null) ? '' : (v instanceof Date ? v.toISOString() : v);
  });
  out.row_version = idx[0].fingerprint;
  out.business_key = idx[0].key;
  return out;
}

/**
 * Resolve an existing campaign_id by the canonical business key
 * company|country|marketplace|year|start_date|end_date. Returns '' if none.
 *
 * LEGACY ADOPTION. A row written before the window became identity may carry no window at all. It is
 * adopted ONCE, by name, and the save that adopts it writes the window in; from then on it keys like
 * every other row. Without this, the first save after this change would append a twin beside it. The
 * adoption is deliberately narrow — it requires a blank window on BOTH ends and exactly one candidate,
 * so it can never merge two rows that a name happens to be shared by.
 */
function campaignFindByKey_(sheet, key) {
  var idx = campaignIndexRows_(fcWriteReadSheet_(sheet));
  var want = campaignKeyOf_(key);
  var hit = idx.filter(function (r) { return r.id && r.key === want; });
  if (hit.length) return hit[0].id;
  var nm = campaignUpper_(key.campaign_name);
  if (!nm) return '';
  var legacy = idx.filter(function (r) {
    return r.id && r.windowless && r.name === nm
      && campaignUpper_(r.row.company) === campaignUpper_(key.company)
      && campaignUpper_(r.row.country) === campaignUpper_(key.country)
      && campaignUpper_(r.row.marketplace) === campaignUpper_(key.marketplace)
      && campaignNum_(r.row.year) === campaignNum_(key.year);
  });
  return legacy.length === 1 ? legacy[0].id : '';
}

/**
 * Resolve an existing campaign_sku_line_id for a campaign line. Prefers marketplace_sku_id (canonical
 * identity); falls back to sku when the line has no marketplace_sku_id. Returns '' if none.
 */
/* The business key a campaign SKU line is resolved by when the caller supplies no id, as a MAP built
   once from a snapshot. The precedence is unchanged and stated in exactly one place: a
   marketplace_sku_id, when the caller gives one, is the key — and a line that names a DIFFERENT
   marketplace_sku_id is never matched on its bare sku instead. */
function campaignLineKeyMap_(index) {
  var m = { byMsku: {}, bySku: {} };
  (index || []).forEach(function (r) {
    var id = String(r.id || '').trim(); if (!id) return;
    var c = campaignUpper_(r.row.campaign_id);
    var msku = campaignUpper_(r.row.marketplace_sku_id);
    var sku = campaignUpper_(r.row.sku);
    if (msku && !m.byMsku[c + '|' + msku]) m.byMsku[c + '|' + msku] = id;
    if (sku && !m.bySku[c + '|' + sku]) m.bySku[c + '|' + sku] = id;
  });
  return m;
}
/* Add a line the CURRENT batch has just staged, so a later line in the same batch resolves to it.
   Only fills a key that is not already taken, which is the same first-wins rule campaignLineKeyMap_
   applies to the rows already on the sheet. */
function campaignLineRegisterKey_(map, campaignId, marketplaceSkuId, sku, lineId) {
  var c = campaignUpper_(campaignId);
  var msku = campaignUpper_(marketplaceSkuId);
  var sk = campaignUpper_(sku);
  if (msku && !map.byMsku[c + '|' + msku]) map.byMsku[c + '|' + msku] = lineId;
  if (sk && !map.bySku[c + '|' + sk]) map.bySku[c + '|' + sk] = lineId;
}
function campaignLineKeyLookup_(map, campaignId, marketplaceSkuId, sku) {
  var c = campaignUpper_(campaignId);
  var wantMsku = campaignUpper_(marketplaceSkuId);
  if (wantMsku) return map.byMsku[c + '|' + wantMsku] || '';
  var wantSku = campaignUpper_(sku);
  return wantSku ? (map.bySku[c + '|' + wantSku] || '') : '';
}
/* The single-lookup form, unchanged in behaviour and now expressed through the map above so the
   key rule has ONE owner. The batch handler builds the map once instead of calling this per line. */
function campaignLineFindByKey_(sheet, campaignId, marketplaceSkuId, sku) {
  var index = campaignLineIndexRows_(fcWriteReadSheet_(sheet));
  return campaignLineKeyLookup_(campaignLineKeyMap_(index), campaignId, marketplaceSkuId, sku);
}

// The fields a campaign SKU LINE means — the per-line price/promotion configuration the builder owns.
// The performance columns (sales, ad cost, acos) are reporting's, not the builder's, and are excluded
// for the same reason as on the header.
var CAMPAIGN_LINE_FINGERPRINT_FIELDS_ = ['campaign_id', 'marketplace_sku_id', 'sku', 'promo_price',
  'regular_price', 'price_units', 'discount_percent', 'special_condition', 'lps', 'line_status'];
var CAMPAIGN_LINE_FINGERPRINT_NUMERIC_ = ['promo_price', 'regular_price', 'discount_percent', 'lps'];

/** Every existing campaign_sku_line as { rowNumber, id, fingerprint, row }. */
function campaignLineIndexRows_(s) {
  var iId = s.col('campaign_sku_line_id');
  var out = [];
  for (var i = 1; i < s.rows.length; i++) {
    var r = s.rows[i];
    if (String(r.join('')).trim() === '') continue;
    var obj = {};
    for (var h = 0; h < s.headers.length; h++) { if (s.headers[h]) obj[s.headers[h]] = r[h]; }
    out.push({ rowNumber: i + 1, id: String(iId === -1 ? '' : (r[iId] == null ? '' : r[iId])).trim(),
      fingerprint: campaignLineFingerprint_(obj), row: obj });
  }
  return out;
}

function campaignLineFingerprint_(o) {
  o = o || {};
  var parts = [];
  for (var i = 0; i < CAMPAIGN_LINE_FINGERPRINT_FIELDS_.length; i++) {
    var f = CAMPAIGN_LINE_FINGERPRINT_FIELDS_[i];
    parts.push(CAMPAIGN_LINE_FINGERPRINT_NUMERIC_.indexOf(f) !== -1 ? campaignNum_(o[f]) : String(o[f] == null ? '' : o[f]).trim());
  }
  return parts.join('|');
}

// ---- campaigns ----

/**
 * Create/update a campaign header. Body: { campaign_id?, company, marketplace_id?, campaign_name,
 * country, marketplace, promotion_type?, major_event_flag?, event_flag?, year?, start_date?,
 * end_date?, status?, source?, expected_row_version?, actor? }.
 *
 * Identity is the canonical business key (the WINDOW, not the name), not the id: the same key always
 * updates the same row, a different key always creates a different campaign, and an id whose stored key
 * conflicts with a key field the body actually supplies refuses rather than silently repointing it.
 *
 * Updating an existing row requires expected_row_version — the fingerprint observed when the modal was
 * hydrated. A save composed as NEW carries none, so it can never land on a row the operator has not
 * seen. A save whose values already match the stored row writes NOTHING and says so.
 */
/**
 * FC-SUMMARY-R2B-A3-R6 §1/§2 — RESOLVE OUTSIDE THE LOCK; LOCK ONLY WHAT WRITES.
 *
 * WHAT THE OPERATOR SAW. Stage 1 of a Special Event save intermittently answered
 * CAMPAIGN_LOCK_TIMEOUT — for a save that, on the commonest path of all, writes nothing at all.
 *
 * WHY. `LockService.getScriptLock()` is ONE lock for the WHOLE Apps Script project, not one per
 * sheet and not one per handler: nineteen other handlers across eleven files take the same lock.
 * This handler took it as its first act and held it for its entire body — including the full
 * `getDataRange().getValues()` of the campaigns sheet, a second full read for the legacy key
 * fallback, and a third for the receipt — and then, on the REUSE path, returned "nothing was
 * written". So the zero-write case queued behind every other writer in the project, for the
 * duration of two to three whole-sheet reads, and failed at the 30 s bound.
 *
 * WHAT THE LOCK IS ACTUALLY FOR. Its own comment says it: "two concurrent creates must not both
 * read 'no match' and both append". That is a property of the RESOLVE-THEN-WRITE pair, and of
 * nothing else. Reading, resolving and classifying are pure; a refusal writes nothing; a reuse
 * writes nothing. None of those needs a project-wide lock, and none of them should be able to
 * time out behind a shipment import.
 *
 * SO THE HANDLER RUNS THE SAME CLASSIFICATION TWICE, AND `campaignResolveOrTerminal_` IS THE ONLY
 * COPY OF IT. Pass 1 runs unlocked and may answer any terminal outcome — reuse, or any of the five
 * refusals — without ever calling tryLock. Pass 2 runs locked and REDOES the resolve from a fresh
 * read before writing, so a classification made outside the lock is a hint and never the decision.
 * That second resolve is what keeps the create race closed: two concurrent creates of one identity
 * both see "no match" outside the lock, and inside it the second one now FINDS the row the first
 * just appended and reuses it. One canonical campaign, exactly as before.
 *
 * NOTHING ABOUT THE CONTRACT MOVES. The reuse branch is still zero-write, a header mutation still
 * requires a fresh version, a missing version is still refused, and the refusal tokens and their
 * details are byte-identical — because both passes call one function to produce them. What changed
 * is only WHEN the lock is held: around the write, and no longer around the reading.
 */
function handleUpsertCampaign_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  var name = String(body.campaign_name || body.event_name || '').trim();
  var suppliedId = String(body.campaign_id || '').trim();
  if (!name && !suppliedId) return jsonResponse_({ success: false, error: 'Missing campaign_name' });
  if (name) body.campaign_name = name;

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ---- PASS 1: READ-ONLY, NO LOCK. Only when the sheet is already structurally sound — creating a
  // sheet or appending a column IS a write, and structural repair belongs under the lock with the
  // other writes. An unready sheet simply falls through; it costs one read on a path that is taken
  // once in the life of the spreadsheet.
  var pre = ss.getSheetByName('campaigns');
  if (pre && campaignSheetReady_(pre)) {
    var early = campaignResolveOrTerminal_(pre, body, name, suppliedId);
    if (early.terminal) return early.response;
  }

  // ---- PASS 2: THE RACE-SENSITIVE SECTION. Everything that can write is inside this lock.
  var lock = LockService.getScriptLock();
  try {
    // Two concurrent creates must not both read "no match" and both append.
    if (!lock.tryLock(CAMPAIGN_LOCK_MS_)) {
      return jsonResponse_({ success: false, error: 'CAMPAIGN_LOCK_TIMEOUT',
        detail: 'Another campaign write is in progress. Nothing was written.' });
    }
    // FC-SUMMARY-R2B-A — see 14_: name-based required-column validation, order-tolerant, everything else strict.
    var sheet = fcWriteEnsureSheet_(ss, 'campaigns', CAMPAIGNS_HEADERS_, FC_SCHEMA_BY_NAME_);
    fcWriteEnsureColumns_(sheet, CAMPAIGNS_HEADERS_);
    if (fcWriteReadSheet_(sheet).col('campaign_id') === -1) {
      return jsonResponse_({ success: false, error: 'campaign_id column not found in campaigns' });
    }

    // THE RESOLVE IS REDONE HERE, from a read taken under the lock. This is the line that keeps the
    // create race closed and makes pass 1 safe to be a hint.
    var r = campaignResolveOrTerminal_(sheet, body, name, suppliedId);
    if (r.terminal) return r.response;

    var id = r.id || ('CMP-' + Utilities.getUuid().substring(0, 10).toUpperCase());

    var result;
    try {
      result = fcWriteUpsert_(ss, 'campaigns', CAMPAIGNS_HEADERS_, 'campaign_id', id, body, actor,
        FC_SCHEMA_BY_NAME_);
    } catch (e) {
      return jsonResponse_({ success: false, error: String(e && e.message ? e.message : e) });
    }
    var receipt = campaignReceiptFor_(sheet, result.id);
    return jsonResponse_({ success: true, data: { campaign_id: result.id, created: result.created,
      unchanged: false, business_key: receipt ? receipt.business_key : campaignKeyOf_(body),
      row_version: receipt ? receipt.row_version : '', row: receipt } });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Structurally sound enough to classify against without repairing anything (a repair is a write). */
function campaignSheetReady_(sheet) {
  try {
    var s = fcWriteReadSheet_(sheet);
    if (s.col('campaign_id') === -1) return false;
    for (var i = 0; i < CAMPAIGNS_HEADERS_.length; i++) {
      if (s.col(CAMPAIGNS_HEADERS_[i]) === -1) return false;
    }
    return true;
  } catch (e) { return false; }
}

/**
 * THE ONE CLASSIFIER. Pure with respect to the sheet: it reads and decides, and never writes.
 *
 * Returns { terminal: true, response } for every outcome that writes nothing — the REUSE receipt and
 * all five refusals — or { terminal: false, id, matched } for a save that must go on to write, where
 * `id` is '' for a create and the resolved campaign_id for an update.
 *
 * Both passes call this, which is what makes "classified outside the lock" and "classified under the
 * lock" the same sentence rather than two implementations that can drift apart.
 */
function campaignResolveOrTerminal_(sheet, body, name, suppliedId) {
  var s = fcWriteReadSheet_(sheet);
  var index = campaignIndexRows_(s);
  var id = '', matched = null;

  if (suppliedId) {
    // ---- UPDATE BY ID — the id may only ever address a row whose identity the body does not contradict.
    var byId = index.filter(function (r) { return r.id === suppliedId; });
    if (byId.length === 0) {
      return { terminal: true, response: jsonResponse_({ success: false, error: 'CAMPAIGN_NOT_FOUND',
        detail: 'No campaign carries campaign_id ' + suppliedId + '. Nothing was written.' }) };
    }
    if (byId.length > 1) {
      return { terminal: true, response: jsonResponse_({ success: false, error: 'DUPLICATE_CAMPAIGN_IDENTITY',
        detail: byId.length + ' rows share campaign_id ' + suppliedId
          + ' (rows ' + byId.map(function (r) { return r.rowNumber; }).join(', ') + '). Nothing was written.' }) };
    }
    // A PARTIAL update is legitimate — closing a campaign sends status and nothing else — so an
    // ABSENT key field means "unchanged", never "blank". Only a field the body actually supplies can
    // contradict the stored row, and when one does the campaign is never silently repointed.
    var conflict = '';
    CAMPAIGN_KEY_FIELDS_.forEach(function (f) {
      if (conflict) return;
      if (!Object.prototype.hasOwnProperty.call(body, f)) return;
      if (String(body[f] == null ? '' : body[f]).trim() === '') return;
      var want = (f === 'start_date' || f === 'end_date') ? campaignDateKey_(body[f]) : campaignUpper_(body[f]);
      var have = (f === 'start_date' || f === 'end_date') ? campaignDateKey_(byId[0].row[f]) : campaignUpper_(byId[0].row[f]);
      if (want !== have) conflict = f + ' (' + have + ' -> ' + want + ')';
    });
    if (conflict) {
      return { terminal: true, response: jsonResponse_({ success: false, error: 'CAMPAIGN_IDENTITY_MISMATCH',
        detail: 'campaign_id ' + suppliedId + ' belongs to ' + byId[0].key + '; this save changes '
          + conflict + '. A campaign\'s site, type or event window is never silently repointed — create the new window as its own campaign. Nothing was written.' }) };
    }
    id = suppliedId; matched = byId[0];
  } else {
    // ---- BY BUSINESS KEY — the same window updates itself instead of appending a twin -------------
    var want2 = campaignKeyOf_(body);
    var byKey = index.filter(function (r) { return r.id && r.key === want2; });
    if (byKey.length > 1) {
      return { terminal: true, response: jsonResponse_({ success: false, error: 'DUPLICATE_CAMPAIGN_IDENTITY',
        detail: byKey.length + ' rows already carry the identity ' + want2
          + ' (rows ' + byKey.map(function (r) { return r.rowNumber; }).join(', ')
          + '). Resolve the duplicate before writing. Nothing was written.' }) };
    }
    var resolved = byKey.length === 1 ? byKey[0].id : campaignFindByKey_(sheet, {
      company: body.company, country: body.country, marketplace: body.marketplace,
      promotion_type: body.promotion_type, event_flag: body.event_flag,
      campaign_name: name, year: body.year, start_date: body.start_date, end_date: body.end_date
    });
    if (resolved) {
      matched = index.filter(function (r) { return r.id === resolved; })[0] || null;
      id = resolved;
    }
  }

  // ---- RESOLVE-OR-UPDATE. Classified BEFORE the version gate, and BEFORE anything is written. ---
  //
  // FC-SUMMARY-R2B-A3-R4 — A CAMPAIGN THAT ALREADY EXISTS IS NOT AN EVENT THAT ALREADY EXISTS.
  //
  // A3-R1 put the version gate FIRST, so any save that resolved to an existing campaign and carried
  // no version was refused as stale. That is correct for an UPDATE and wrong for the commonest
  // legitimate operation there is: adding another SKU to a window that already exists. One campaign
  // header owns many campaign_sku_lines and many fc_special_events, so the operator who adds CO1150
  // to the BFCM window the CO1100 family already uses is not editing the header at all - and was
  // told 'STALE_CAMPAIGN_VERSION ... refused at stage 1 - campaigns' for a save that would have
  // written nothing to this sheet.
  //
  // So the row is classified first. IDENTICAL HEADER means there is nothing to overwrite, and a
  // version cannot protect a write that does not happen: the id is resolved, the stored version is
  // returned, and stage 2 proceeds. HEADER MUTATION is a real update and keeps the full optimistic
  // concurrency gate - a missing version still refuses, a stale version still refuses, and neither
  // touches a cell. The exemption is granted by the COMPARISON, never by the absence of a version.
  if (matched) {
    // The comparison uses the SAME normalisation the stored fingerprint was built with, so a value
    // that merely round-trips through the sheet cannot read as a mutation. An ABSENT field means
    // 'unchanged' (a partial update is legitimate), so only a field the body actually supplies can
    // make this a mutation.
    var incoming = {};
    CAMPAIGN_FINGERPRINT_FIELDS_.forEach(function (f) {
      incoming[f] = Object.prototype.hasOwnProperty.call(body, f) ? body[f] : matched.row[f];
    });
    var headerIdentical = campaignFingerprint_(incoming) === matched.fingerprint;

    if (headerIdentical) {
      // REUSE. created=false, unchanged=true, zero writes, and updated_at/row_version untouched
      // because nothing is written - the receipt is read back from the row as it already stands.
      return { terminal: true, response: jsonResponse_({ success: true, data: { campaign_id: matched.id,
        created: false, updated: false, unchanged: true, reused: true,
        business_key: matched.key, row_version: matched.fingerprint,
        row: campaignReceiptFor_(sheet, matched.id),
        summary: 'reused ' + matched.key + ' — the header already stores these values, nothing was written' } }) };
    }

    // ---- HEADER MUTATION. The version gate is unchanged and still authoritative. ---------------
    var expectedVersion = String(body.expected_row_version == null ? '' : body.expected_row_version).trim();
    if (!expectedVersion) {
      // R2B-A3-R1 — A NEW-EVENT SAVE MAY NOT SILENTLY BECOME AN UPDATE. Reaching here means the
      // save WOULD change a stored header field while quoting no version, so the read model behind
      // it is stale: applying it would overwrite values the operator has never seen.
      return { terminal: true, response: jsonResponse_({ success: false, error: 'STALE_CAMPAIGN_VERSION',
        detail: 'A campaign already exists for ' + matched.key + ' (campaign_id ' + matched.id
          + ') and this save would CHANGE its stored header. It carries no expected version and cannot be applied over one. Load the latest data and re-enter the change. Nothing was written.',
        campaign_id: matched.id,
        current_row_version: matched.fingerprint }) };
    }
    if (expectedVersion !== matched.fingerprint) {
      return { terminal: true, response: jsonResponse_({ success: false, error: 'STALE_CAMPAIGN_VERSION',
        detail: 'This campaign changed after it was loaded. Load the latest data and re-enter the change. Nothing was written.',
        campaign_id: matched.id,
        current_row_version: matched.fingerprint,
        expected_row_version: expectedVersion,
        current_updated_at: matched.updated_at,
        current: campaignReceiptFor_(sheet, matched.id) }) };
    }
  }

  return { terminal: false, id: id, matched: matched };
}

// ---- campaign_sku_lines ----

/**
 * Batch create/update campaign SKU lines for one campaign. Body: { campaign_id,
 * lines: [ { campaign_sku_line_id?, marketplace_sku_id?, sku, regular_price?, deal_price?/promo_price?,
 * discount_percent?, special_condition?, line_status?, source? } ], actor? }.
 * Idempotent per line by campaign_sku_line_id, else campaign_id + marketplace_sku_id (or + sku).
 * Returns { campaign_id, upserted, created, updated, lines: [ { campaign_sku_line_id, sku, created } ] }.
 */
/* FC-SUMMARY-SPECIAL-STAGE2-LARGE-BATCH §5 — STAGE 2 WAS A SEQUENTIAL PHYSICAL WRITER, AND THAT IS
 * WHY A 90-SKU EVENT COULD NOT BE SAVED.
 *
 * The operator's report named an expired googleusercontent redirect at stage 2 with stage 1 already
 * committed. The redirect was the SYMPTOM. Measured against the real handler with a counting
 * spreadsheet, the cost of this function was:
 *
 *     N=1    4 full-sheet reads,   7 getRange,   1 appendRow      12 physical ops
 *     N=8   25                    35             8                68
 *     N=20  61                    83            20               164
 *     N=50 151                   203            50               404
 *     N=100 301                   403           100               804
 *
 * Three full `getDataRange().getValues()` per line, plus one per line inside `fcWriteUpsert_`, plus a
 * WHOLE-SHEET RE-READ PER LINE purely to compute that line's `row_version` for the receipt. 3N+1 full
 * reads of a sheet that is itself growing. Apps Script ran long past the single-use echo target's
 * lifetime, the delivery hop 404'd, and because the cost is deterministic the transport's one licensed
 * replay did exactly the same work and died exactly the same way. Payload SIZE was never the problem.
 *
 * It is now ONE read, in-memory resolution, and range writes: constant reads, one appended block, and
 * one whole-row write per genuinely changed row. Every semantic below is the one that was here before —
 * the refusals, the business-key precedence, the unchanged rule, the fingerprints, the counts and the
 * per-index receipts — and stage 3 is untouched, as is `campaigns`.
 *
 * ONE THING IS STRICTLY SAFER RATHER THAN MERELY FASTER. The old loop validated line i only when it
 * reached it, so a bad line at index 60 refused AFTER 59 lines had already been written — the partial
 * commit this round exists to remove. The whole batch is validated before a single cell is touched,
 * which is the rule stage 3 already follows.
 */
function handleUpsertCampaignSkuLines_(body) {
  body = body || {};
  var actor = String(body.updated_by || body.actor || 'fc-summary').trim();
  var campaignId = String(body.campaign_id || '').trim();
  if (!campaignId) return jsonResponse_({ success: false, error: 'Missing campaign_id' });
  var lines = (body.lines && body.lines.length) ? body.lines : [];
  if (!lines.length) return jsonResponse_({ success: false, error: 'No campaign_sku_lines to write' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // FC-SUMMARY-R2B-A — stage 2 MUST move with stage 1. Repairing `campaigns` alone would let the campaign
  // header commit and then refuse the lines, manufacturing the partial write this round exists to avoid.
  var sheet = fcWriteEnsureSheet_(ss, 'campaign_sku_lines', CAMPAIGN_SKU_LINES_HEADERS_, FC_SCHEMA_BY_NAME_);
  fcWriteEnsureColumns_(sheet, CAMPAIGN_SKU_LINES_HEADERS_);

  // ---- STEP 1: VALIDATE THE WHOLE BATCH BEFORE TOUCHING A CELL ---------------------------------
  for (var vi = 0; vi < lines.length; vi++) {
    var vl = lines[vi] || {};
    if (!String(vl.sku || '').trim() && !String(vl.marketplace_sku_id || '').trim()) {
      return jsonResponse_({ success: false, error: 'Line ' + (vi + 1) + ': missing sku / marketplace_sku_id' });
    }
  }

  // ---- STEP 2: ONE AUTHORITATIVE READ ----------------------------------------------------------
  var s = fcWriteReadSheet_(sheet);
  var width = s.headers.length;
  var iId = s.col('campaign_sku_line_id');
  if (iId === -1) return jsonResponse_({ success: false, error: 'campaign_sku_line_id column not found in campaign_sku_lines' });
  var index = campaignLineIndexRows_(s);
  var keyMap = campaignLineKeyMap_(index);
  var byId = {};
  index.forEach(function (r) { if (r.id) byId[r.id] = r; });
  var now = fcWriteTimestamp_();

  // ---- STEP 3: RESOLVE AND STAGE, IN MEMORY ----------------------------------------------------
  // `staged` is what makes a batch that names the same line twice behave like the sequential loop did:
  // the second mention sees the first one's result, so it updates that row instead of minting a second.
  var staged = {};
  var updates = [];        // { rowNumber, values }
  var appends = [];        // values
  var out = [], created = 0, updated = 0, unchanged = 0;

  for (var i = 0; i < lines.length; i++) {
    var l = lines[i] || {};
    var sku = String(l.sku || '').trim();
    var lineId = String(l.campaign_sku_line_id || '').trim();
    if (!lineId) lineId = campaignLineKeyLookup_(keyMap, campaignId, l.marketplace_sku_id, sku);
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

    var prior = staged[lineId] || byId[lineId] || null;

    // §3 — UNCHANGED WRITES NOTHING. Re-saving an event nobody edited must not touch a single cell,
    // and must not advance updated_at: an audit column that moves when nothing changed is a lie about
    // the row's history, and it is the page's own re-save that would tell it.
    if (prior) {
      var incomingLine = {};
      CAMPAIGN_LINE_FINGERPRINT_FIELDS_.forEach(function (f) {
        incomingLine[f] = Object.prototype.hasOwnProperty.call(payload, f) ? payload[f] : prior.row[f];
      });
      if (campaignLineFingerprint_(incomingLine) === prior.fingerprint) {
        unchanged++;
        out.push({ campaign_sku_line_id: lineId, sku: sku, created: false, unchanged: true,
          row_version: prior.fingerprint });
        continue;
      }
    }

    // Build the WHOLE row, from the row that is there when there is one. The creation audit is
    // preserved exactly as fcWriteUpsert_ preserved it; everything else is the incoming value.
    var isNew = !prior;
    var values = isNew ? new Array(width) : (prior.values ? prior.values.slice() : s.rows[prior.rowNumber - 1].slice());
    if (isNew) { for (var z = 0; z < width; z++) values[z] = ''; }
    for (var c = 0; c < width; c++) {
      var h = s.headers[c];
      if (!h) continue;
      if (h === 'campaign_sku_line_id') { values[c] = lineId; continue; }
      if (h === 'created_by') { if (isNew) values[c] = actor; continue; }
      if (h === 'created_at') { if (isNew) values[c] = now; continue; }
      if (h === 'updated_by') { values[c] = actor; continue; }
      if (h === 'updated_at') { values[c] = now; continue; }
      if (!Object.prototype.hasOwnProperty.call(payload, h)) continue;
      // A CREATE SKIPS null/undefined so the cell stays blank, exactly as fcWriteAppendByHeader_ did;
      // an UPDATE writes the value it was given, exactly as fcWriteUpsert_'s setCell did. The two
      // paths differed before this round and they still differ, because changing that would silently
      // alter what a re-save does to a column the caller omitted.
      if (isNew && (payload[h] === undefined || payload[h] === null)) continue;
      values[c] = payload[h];
    }

    // The row AS IT WILL STAND, which is what the receipt's row_version has to describe.
    var obj = {};
    for (var hh = 0; hh < width; hh++) { if (s.headers[hh]) obj[s.headers[hh]] = values[hh]; }
    var fp = campaignLineFingerprint_(obj);

    if (prior && prior.slot) {
      // A row this same batch already staged — rewrite that slot rather than adding a second one.
      prior.slot.values = values;
      staged[lineId] = { id: lineId, row: obj, fingerprint: fp, values: values, slot: prior.slot,
        rowNumber: prior.rowNumber, wasNew: prior.wasNew };
      // The sequential writer counted this as an UPDATE, because by the time it reached the second
      // mention the row existed. `created` was already counted once for the first mention, and counting
      // it again would report two rows where the sheet holds one.
      updated++;
    } else if (isNew) {
      var slotA = { values: values };
      appends.push(slotA);
      created++;
      staged[lineId] = { id: lineId, row: obj, fingerprint: fp, values: values, slot: slotA, wasNew: true };
      // THE SAME BATCH MAY NAME THIS LINE AGAIN. The sequential writer found it because it re-read the
      // sheet and saw the row it had just appended; reading once means the batch has to remember. The
      // key goes into the SAME map the lookup uses, so the second mention resolves to this id and
      // updates this row rather than minting a second one for the same SKU.
      campaignLineRegisterKey_(keyMap, campaignId, payload.marketplace_sku_id, sku, lineId);
    } else {
      var slotU = { rowNumber: prior.rowNumber, values: values };
      updates.push(slotU);
      updated++;
      staged[lineId] = { id: lineId, row: obj, fingerprint: fp, values: values, slot: slotU,
        rowNumber: prior.rowNumber, wasNew: false };
    }

    out.push({ campaign_sku_line_id: lineId, sku: sku, created: isNew, unchanged: false, row_version: fp });
  }

  // ---- STEP 4: THE FIRST MUTATION --------------------------------------------------------------
  // Updates are coalesced into contiguous runs, so a re-save of an existing event writes one range
  // rather than one range per row; appends go in a SINGLE block after the last row.
  updates.sort(function (x, y) { return x.rowNumber - y.rowNumber; });
  var run = [];
  function flushRun() {
    if (!run.length) return;
    sheet.getRange(run[0].rowNumber, 1, run.length, width)
      .setValues(run.map(function (u) { return u.values; }));
    run = [];
  }
  for (var u = 0; u < updates.length; u++) {
    if (run.length && updates[u].rowNumber !== run[run.length - 1].rowNumber + 1) flushRun();
    run.push(updates[u]);
  }
  flushRun();

  if (appends.length) {
    sheet.getRange(s.rows.length + 1, 1, appends.length, width)
      .setValues(appends.map(function (ap) { return ap.values; }));
  }

  return jsonResponse_({ success: true, data: { campaign_id: campaignId, upserted: out.length,
    created: created, updated: updated, unchanged: unchanged, lines: out } });
}
