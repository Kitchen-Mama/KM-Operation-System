/**
 * 73_api_v1_pricing_write.gs
 * Kitchen Mama Operation System — API v1 · THE CANONICAL PRICING WRITE OWNER (PRICING-R2).
 *
 * SOURCE MIRROR / requires Apps Script sync. Action = "pricing.update" — the ONE write path into
 * pricing_list, and the ONE writer of pricing_change_log.
 *
 * WHY THIS FILE EXISTS. Before it, pricing_list had a bounded READ owner (72_) and no write owner at all.
 * The only code that had ever written a price was 04_'s import, and it writes prices exactly once — at row
 * creation — and is explicitly forbidden from touching them again. So every price in the system was either
 * born in an import or typed into the spreadsheet by hand, and nothing recorded WHICH.
 *
 * AND THAT IS THE ACTUAL DEFECT THIS ROUND FIXES, not the missing endpoint. An FX reconciliation has to
 * answer one question per field — "may I overwrite this?" — and the schema could not answer it. It carried
 * `price_source`, which is ONE value for a WHOLE ROW: a row whose Regular was negotiated by a person and
 * whose MSRP has never been anything but the converted base price has no honest value to put in it. Pick
 * `manual_override` and FX can never refresh the MSRP; pick `auto_fx` and the next refresh silently
 * destroys the negotiated Regular. A row-level answer to a field-level question loses data either way.
 *
 * SO OWNERSHIP IS FIELD-LEVEL AND IT IS THREE-STATE, which is the part that matters most:
 *
 *   TRUE   the operator owns this field. FX must preserve it. Only a person may change it.
 *   FALSE  the system owns this field. It must equal the current auto value, and FX may refresh it.
 *   BLANK  NOBODY HAS SAID. Not false. Not "probably auto".
 *
 * The third state is not a convenience — it is the whole reason this round does not corrupt the existing
 * table. Every pricing_list row alive today has a blank flag, because the column did not exist until now.
 * Reading blank as FALSE would declare, in one deployment and with no operator ever asked, that every price
 * in the business is system-owned and may be overwritten by the next FX run. That is precisely the
 * irreversible bulk classification PRICING-R2 §10 forbids, and it would arrive disguised as a default.
 * So BLANK is UNKNOWN, it is refused rather than guessed, and pricingCensus_ counts it as AMBIGUOUS.
 *
 * THE EFFECTIVE-PRICE CONTRACT IS UNCHANGED, DELIBERATELY. regular_price / minimum_price / msrp remain the
 * values every consumer reads — FC Summary, Pricing Center, Product Strategy, the campaign snapshot. No
 * consumer learns about auto_*, no consumer gains a fallback, and no consumer is cut over. The flags decide
 * who MAINTAINS the final three fields; they never sit between a reader and a price. A reader that had to
 * resolve ownership to know what something costs would be a second pricing authority.
 *
 * WHAT IS REFUSED RATHER THAN GUESSED, because each of these is a way to invent money:
 *   - a MANUAL mode with a blank price               (blank is not zero and not a deletion)
 *   - an AUTO mode whose auto_* is blank or NA       (you cannot restore a value that does not exist)
 *   - a manual price carrying more decimals than its currency can hold
 *   - a currency that disagrees with the row's own
 *   - a marketplace_sku_id this table does not have
 *   - the same row twice in one batch
 * Any one of them refuses the ENTIRE batch before a single cell is written. A partially-applied price
 * update is worse than a rejected one: the operator has no way to know which half landed.
 *
 * SCHEMA IS OPERATOR-PROVISIONED, NEVER SELF-HEALED. Under RULE S0-2 this file validates and fails closed
 * (prodRequireSheet_ / prodRequireColumns_); it never creates a sheet and never appends a column. Until the
 * operator has added the three flag columns and change_type, pricing.update refuses with
 * MISSING_REQUIRED_HEADER having written nothing. A writer that quietly grows the schema it depends on is
 * how a migration becomes invisible.
 *
 * NOT IN THIS FILE, ON PURPOSE: no FX rate fetching, no FX conversion, no auto_* computation, no bulk
 * reconciliation, no legacy classification. PRICING_FX_DECIMALS_ below is the FROZEN storage-precision
 * contract that PRICING-R3 will convert against; this round uses it only to refuse a manual price the
 * currency cannot represent, and never to round one.
 *
 * Testability: every decision is a pure `function` declaration (extract+eval friendly) taking plain values,
 * so the whole contract runs against fixtures with ZERO SpreadsheetApp.
 */

// Module stamp — the ROUND this file last changed, not the deployment release.
// PRICING-R2 - first release. Registered as a REQUIRED owner in 63_ from this release, because
// 01_router.gs dispatches pricing.update to handlePricingUpdate_ and a deployment carrying the router
// without this file routes a live WRITE action to an undefined handler.
var PRW_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21';

var PRW_ACTION_ = 'pricing.update';
// The response SHAPE's own version, separate from the module build. A caller pins the shape, not the round.
var PRW_SCHEMA_CONTRACT_VERSION_ = 1;
var PRW_LOCK_MS_ = 20000;
// One request may not rewrite the whole price book by accident. A template import larger than this is a
// migration and belongs to an authorized migration tool, not to a page save.
var PRW_MAX_LINES_ = 500;

// The canonical pricing_list header, INCLUDING the three field-level ownership flags this round adds.
// `asin` is deliberately absent: marketplace_product_id is canonical and asin is a legacy read alias.
var PRICING_LIST_HEADERS_ = [
  'pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku', 'marketplace_product_id',
  'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date',
  'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status',
  'created_by', 'created_at', 'updated_by', 'updated_at', 'note'
];

// The three columns an operator must add to pricing_list before this action can write.
var PRICING_MANUAL_FLAG_COLUMNS_ = ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'];

// pricing_change_log. `change_type` is added by this round: PRICING_DATABASE_MAPPING §5 recorded
// change_reason (free text), and free text cannot be counted, filtered or relied on by a later round.
var PRICING_CHANGE_LOG_HEADERS_ = [
  'log_id', 'pricing_id', 'field_name', 'old_value', 'new_value',
  'change_type', 'changed_by', 'changed_at', 'change_reason'
];

// THE THREE PRICE FIELDS, each with the auto value it returns to and the flag that owns it. These triples
// are the only place the correspondence is written down; every loop in this file reads it from here, so a
// fourth price field is one row rather than a search for every place three was hard-coded.
var PRICING_FIELDS_ = [
  { field: 'regular_price', auto: 'auto_regular_price', base: 'base_regular_price', flag: 'regular_price_is_manual', mode: 'regular_price_mode', label: 'Regular Price' },
  { field: 'minimum_price', auto: 'auto_minimum_price', base: 'base_minimum_price', flag: 'minimum_price_is_manual', mode: 'minimum_price_mode', label: 'Minimum Price' },
  { field: 'msrp', auto: 'auto_msrp', base: 'base_msrp', flag: 'msrp_is_manual', mode: 'msrp_mode', label: 'MSRP' }
];

// §11 — FROZEN FX STORAGE PRECISION. Mathematical precision only: this is how many decimals a converted
// price may occupy, NOT a pricing strategy. There is no .99 / .95 here and there must not be — psychological
// price points are a commercial decision about what to charge, made per marketplace by a person, and burying
// one in a currency conversion would make every converted price a silent commercial claim nobody approved.
var PRICING_FX_DECIMALS_ = {
  USD: 2, CAD: 2, EUR: 2, GBP: 2, AUD: 2,
  JPY: 0, KRW: 0, TWD: 0
};

var PRICING_MODES_ = ['NO_CHANGE', 'MANUAL', 'AUTO'];
var PRICING_CHANGE_TYPES_ = ['MANUAL_SET', 'RETURN_TO_AUTO', 'AUTO_FX_REFRESH'];

// The three ownership states. UNKNOWN is a state, not a missing value.
var PRICING_OWNER_MANUAL_ = 'MANUAL';
var PRICING_OWNER_AUTO_ = 'AUTO';
var PRICING_OWNER_UNKNOWN_ = 'UNKNOWN';

// ---------------------------------------------------------------------------------------------------------
// PURE HELPERS
// ---------------------------------------------------------------------------------------------------------

function pricingStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

/** Blank means the cell holds nothing. It does NOT mean zero, and it does not mean the default. */
function pricingIsBlank_(v) { return pricingStr_(v) === ''; }

/**
 * Read a stored price/FX cell. THE ONE RULE: missing and zero are different facts, and NA is a third.
 *
 *   ''      -> { present: false, na: false, value: null }   nobody has written one
 *   'NA'    -> { present: false, na: true,  value: null }   someone wrote "there is deliberately none"
 *   '0'     -> { present: true,  na: false, value: 0    }   the price is zero
 *   'abc'   -> { present: false, na: false, value: null, invalid: true }
 *
 * This replaces `parseFloat(x) || 0`, which collapses the first three into 0 and reports the fourth as a
 * price. A conversion that cannot tell "free" from "not set yet" will eventually publish one as the other.
 */
function pricingReadNumber_(v) {
  var s = pricingStr_(v);
  if (s === '') return { present: false, na: false, value: null, invalid: false };
  if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return { present: false, na: true, value: null, invalid: false };
  var n = Number(s);
  if (!isFinite(n)) return { present: false, na: false, value: null, invalid: true };
  return { present: true, na: false, value: n, invalid: false };
}

/** Decimals this currency may store, or null when the currency is outside the frozen contract. */
function pricingDecimalsFor_(currency) {
  var c = pricingStr_(currency).toUpperCase();
  return Object.prototype.hasOwnProperty.call(PRICING_FX_DECIMALS_, c) ? PRICING_FX_DECIMALS_[c] : null;
}

/**
 * §11's rounding, frozen here and applied by PRICING-R3's conversion. It is NOT applied to an operator's
 * manual price: rounding a number a person typed is overwriting it, and this round never does that — a
 * manual value the currency cannot hold is REFUSED so the person can retype it.
 */
function pricingRoundFx_(n, currency) {
  var d = pricingDecimalsFor_(currency);
  if (d === null || !isFinite(n)) return null;
  var f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/** True when `n` needs more decimals than `currency` can store. Unknown currency -> never refuses. */
function pricingExceedsPrecision_(n, currency) {
  var d = pricingDecimalsFor_(currency);
  if (d === null || !isFinite(n)) return false;
  var f = Math.pow(10, d);
  return Math.abs(Math.round(n * f) - n * f) > 1e-9;
}

/**
 * Read an ownership flag as one of three states. THE BLANK CELL IS THE POINT: it is UNKNOWN, never false.
 * Accepts the spellings a spreadsheet actually produces (checkbox booleans, TRUE/FALSE text, 1/0, yes/no).
 */
function pricingReadFlag_(v) {
  if (v === true) return PRICING_OWNER_MANUAL_;
  if (v === false) return PRICING_OWNER_AUTO_;
  var s = pricingStr_(v).toUpperCase();
  if (s === '') return PRICING_OWNER_UNKNOWN_;
  if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'MANUAL') return PRICING_OWNER_MANUAL_;
  if (s === 'FALSE' || s === '0' || s === 'NO' || s === 'N' || s === 'AUTO') return PRICING_OWNER_AUTO_;
  return PRICING_OWNER_UNKNOWN_;
}

/** The two values this file ever WRITES into a flag column. It never writes blank back. */
function pricingWriteFlag_(isManual) { return isManual ? 'TRUE' : 'FALSE'; }

/**
 * A supplied mode. BLANK IS NO_CHANGE and nothing else — §8: a blank template cell must never mean delete
 * and must never mean AUTO. The one safe reading of "the operator left it alone" is "leave it alone".
 * An unrecognised word is invalid rather than ignored, because ignoring it would silently drop an edit.
 */
function pricingReadMode_(v) {
  var s = pricingStr_(v).toUpperCase().replace(/[\s-]+/g, '_');
  if (s === '') return 'NO_CHANGE';
  return PRICING_MODES_.indexOf(s) === -1 ? null : s;
}

/** Row identity for a batch: the pricing row is addressed by marketplace_sku_id, never by master SKU. */
function pricingLineKey_(line) { return pricingStr_(line && line.marketplace_sku_id); }

/**
 * Plan ONE field of ONE row. Pure: takes the stored row and the requested mode, returns what would be
 * written and what would be logged. Writes nothing and decides nothing about other fields — §1's flags are
 * independent, so setting Regular manual must leave Minimum and MSRP exactly as they were.
 */
function pricingPlanField_(row, spec, mode, suppliedValue, currency) {
  var out = { field: spec.field, mode: mode, changed: false, cells: {}, log: null, error: null };
  var storedEff = pricingReadNumber_(row[spec.field]);
  var storedFlag = pricingReadFlag_(row[spec.flag]);

  if (mode === 'NO_CHANGE') return out;

  if (mode === 'MANUAL') {
    var supplied = pricingReadNumber_(suppliedValue);
    if (supplied.invalid) {
      out.error = { code: 'PRICE_NOT_NUMERIC', field: spec.field, detail: 'MANUAL requires a number; got ' + JSON.stringify(pricingStr_(suppliedValue)) };
      return out;
    }
    if (!supplied.present) {
      // Blank is not zero and NA is not zero. Either would publish a free product.
      out.error = { code: 'MANUAL_PRICE_REQUIRED', field: spec.field,
        detail: supplied.na ? 'MANUAL was requested with NA. NA is not a price.' : 'MANUAL was requested with a blank price. Blank is not zero.' };
      return out;
    }
    if (supplied.value < 0) {
      out.error = { code: 'PRICE_NEGATIVE', field: spec.field, detail: 'A price may not be negative.' };
      return out;
    }
    if (pricingExceedsPrecision_(supplied.value, currency)) {
      out.error = { code: 'PRICE_PRECISION_UNSUPPORTED', field: spec.field,
        detail: currency + ' stores ' + pricingDecimalsFor_(currency) + ' decimals; ' + supplied.value + ' needs more. Nothing was rounded.' };
      return out;
    }
    var effChanged = !storedEff.present || storedEff.value !== supplied.value;
    var flagChanged = storedFlag !== PRICING_OWNER_MANUAL_;
    if (!effChanged && !flagChanged) return out;   // already exactly this, owned by exactly this person
    out.changed = true;
    out.cells[spec.field] = supplied.value;
    out.cells[spec.flag] = pricingWriteFlag_(true);
    out.log = { field_name: spec.field, change_type: 'MANUAL_SET',
      old_value: pricingStr_(row[spec.field]), new_value: String(supplied.value) };
    return out;
  }

  // AUTO — return ownership to the system and restore the effective field FROM auto_*. The supplied manual
  // value is ignored entirely (§8), so a template that carries both a price and AUTO cannot smuggle the
  // price in through the back door.
  var auto = pricingReadNumber_(row[spec.auto]);
  if (auto.invalid) {
    out.error = { code: 'AUTO_VALUE_NOT_NUMERIC', field: spec.field, detail: spec.auto + ' is not a number, so there is nothing to restore.' };
    return out;
  }
  if (!auto.present) {
    // The only honest refusal. Restoring from a blank would write 0, and 0 is a price.
    out.error = { code: 'AUTO_VALUE_MISSING', field: spec.field,
      detail: spec.auto + ' is ' + (auto.na ? 'NA' : 'blank') + '. USE AUTO cannot restore a value that does not exist; run the FX refresh first.' };
    return out;
  }
  var effChangedA = !storedEff.present || storedEff.value !== auto.value;
  var flagChangedA = storedFlag !== PRICING_OWNER_AUTO_;
  if (!effChangedA && !flagChangedA) return out;
  out.changed = true;
  out.cells[spec.field] = auto.value;
  out.cells[spec.flag] = pricingWriteFlag_(false);
  out.log = { field_name: spec.field, change_type: 'RETURN_TO_AUTO',
    old_value: pricingStr_(row[spec.field]), new_value: String(auto.value) };
  return out;
}

/**
 * Derive the LEGACY row-level price_source from the three flags, so it stops contradicting them. It is
 * DESCRIPTIVE ONLY — nothing in this system reads it to decide ownership, and §1 forbids it being a
 * substitute for the three flags. A row that ends up mixed, or with any flag still unknown, keeps whatever
 * it had: overwriting it would be inventing a row-level answer to a field-level question all over again.
 */
function pricingDeriveLegacySource_(flagsAfter) {
  var manual = 0, auto = 0;
  PRICING_FIELDS_.forEach(function (s) {
    if (flagsAfter[s.flag] === PRICING_OWNER_MANUAL_) manual++;
    else if (flagsAfter[s.flag] === PRICING_OWNER_AUTO_) auto++;
  });
  if (manual > 0 && manual + auto === PRICING_FIELDS_.length) return 'manual_override';
  if (auto === PRICING_FIELDS_.length) return 'auto_fx';
  return null;   // mixed with an unknown, or nothing decided — say nothing rather than something wrong
}

/**
 * Plan ONE row. Returns { ok, errors[], changed, cells{}, logs[], fields{} }. Pure — the caller decides
 * whether anything is written, and only after EVERY row in the batch has planned cleanly.
 */
function pricingPlanRow_(row, line) {
  var res = { ok: true, errors: [], changed: false, cells: {}, logs: [], fields: {} };
  var rowCurrency = pricingStr_(row.currency);
  var lineCurrency = pricingStr_(line.currency);

  // pricing_list.currency is the authority (72_ already says so). A template carrying a different one is
  // describing a different row, so it is refused rather than reconciled.
  if (lineCurrency && rowCurrency && lineCurrency.toUpperCase() !== rowCurrency.toUpperCase()) {
    res.ok = false;
    res.errors.push({ code: 'CURRENCY_MISMATCH', field: 'currency',
      detail: 'Row currency is ' + rowCurrency + '; the file says ' + lineCurrency + '.' });
    return res;
  }
  if (!rowCurrency) {
    res.ok = false;
    res.errors.push({ code: 'CURRENCY_MISSING', field: 'currency', detail: 'pricing_list.currency is blank for this row.' });
    return res;
  }

  var flagsAfter = {};
  PRICING_FIELDS_.forEach(function (spec) {
    flagsAfter[spec.flag] = pricingReadFlag_(row[spec.flag]);
  });

  PRICING_FIELDS_.forEach(function (spec) {
    var mode = pricingReadMode_(line[spec.mode]);
    if (mode === null) {
      res.ok = false;
      res.errors.push({ code: 'MODE_UNSUPPORTED', field: spec.field,
        detail: JSON.stringify(pricingStr_(line[spec.mode])) + ' is not one of ' + PRICING_MODES_.join(' / ') + '.' });
      return;
    }
    var p = pricingPlanField_(row, spec, mode, line[spec.field], rowCurrency);
    res.fields[spec.field] = { mode: mode, changed: p.changed };
    if (p.error) { res.ok = false; res.errors.push(p.error); return; }
    if (!p.changed) return;
    res.changed = true;
    Object.keys(p.cells).forEach(function (k) { res.cells[k] = p.cells[k]; });
    if (p.cells[spec.flag] !== undefined) {
      flagsAfter[spec.flag] = p.cells[spec.flag] === 'TRUE' ? PRICING_OWNER_MANUAL_ : PRICING_OWNER_AUTO_;
    }
    res.logs.push(p.log);
  });

  if (res.ok && res.changed) {
    var legacy = pricingDeriveLegacySource_(flagsAfter);
    if (legacy !== null) res.cells.price_source = legacy;
  }
  return res;
}

/**
 * Validate and plan a WHOLE batch against an index of stored rows. ZERO WRITES UNTIL EVERY LINE PASSES
 * (§9): a half-applied price file leaves the operator unable to tell which half landed, and the only way
 * to find out is to read every row back by hand.
 */
function pricingPlanBatch_(lines, rowIndex) {
  var out = { ok: true, errors: [], plans: [], changed_rows: 0, unchanged_rows: 0 };
  if (!lines || !lines.length) {
    out.ok = false;
    out.errors.push({ line: 0, code: 'NO_LINES', detail: 'The request carried no pricing lines.' });
    return out;
  }
  if (lines.length > PRW_MAX_LINES_) {
    out.ok = false;
    out.errors.push({ line: 0, code: 'BATCH_TOO_LARGE', detail: lines.length + ' lines exceeds the ' + PRW_MAX_LINES_ + '-line ceiling for one request.' });
    return out;
  }

  var seen = {};
  lines.forEach(function (line, i) {
    var lineNo = i + 1;
    var key = pricingLineKey_(line);
    if (!key) {
      out.ok = false;
      out.errors.push({ line: lineNo, code: 'IDENTITY_MISSING', detail: 'marketplace_sku_id is required. A pricing row is never addressed by master SKU alone.' });
      return;
    }
    if (seen[key]) {
      out.ok = false;
      out.errors.push({ line: lineNo, code: 'DUPLICATE_IDENTITY', marketplace_sku_id: key,
        detail: 'Already present on line ' + seen[key] + '. Two rows for one identity cannot both be the final answer.' });
      return;
    }
    seen[key] = lineNo;
    var row = rowIndex[key];
    if (!row) {
      out.ok = false;
      out.errors.push({ line: lineNo, code: 'UNKNOWN_MARKETPLACE_SKU_ID', marketplace_sku_id: key,
        detail: 'No pricing_list row carries this id. This action never creates one.' });
      return;
    }
    var plan = pricingPlanRow_(row.values, line);
    plan.line = lineNo;
    plan.marketplace_sku_id = key;
    plan.pricing_id = pricingStr_(row.values.pricing_id);
    plan.rowNumber = row.rowNumber;
    if (!plan.ok) {
      out.ok = false;
      plan.errors.forEach(function (e) {
        out.errors.push({ line: lineNo, code: e.code, field: e.field, marketplace_sku_id: key, detail: e.detail });
      });
      return;
    }
    if (plan.changed) out.changed_rows++; else out.unchanged_rows++;
    out.plans.push(plan);
  });

  if (!out.ok) { out.plans = []; out.changed_rows = 0; out.unchanged_rows = 0; }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// §10 — THE LEGACY CENSUS IS NOT HERE, AND THAT IS THE DECISION RATHER THAN AN OMISSION.
//
// It counts how much of the existing price book has no recorded owner, and it is displayed on the SKU
// Regional Details screen beside the per-field badges it explains. Implementing it twice — once here and
// once there — would put the same rule in two places that can disagree, and a census contradicting the
// badges next to it is worse than no census. It lives in assets/js/pages/sku-regional-pricing.js
// (SRP.censusField / SRP.census), over the same pricing_list rows this file writes.
//
// What the SERVER needs for PRICING-R3 is not the count but the PERMISSION, and that is here already:
// pricingReadFlag_ returns AUTO only when a flag explicitly says so. A reconciliation that refreshes
// exactly those fields can never touch a manual price or an unclassified one.

// ---------------------------------------------------------------------------------------------------------
// ENVELOPE
// ---------------------------------------------------------------------------------------------------------

function prwEnvelope_(ok, payload, error) {
  var env = {
    success: !!ok,
    meta: {
      action: PRW_ACTION_,
      build: PRW_BUILD_VERSION_,
      schema_contract_version: PRW_SCHEMA_CONTRACT_VERSION_,
      server_time: (typeof Utilities !== 'undefined' && typeof Session !== 'undefined')
        ? Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss')
        : ''
    }
  };
  if (ok) env.data = payload || {};
  else { env.error = (error && error.code) || 'PRICING_WRITE_FAILED'; env.detail = (error && error.detail) || ''; env.data = payload || {}; }
  return env;
}

/** Read a sheet ONCE into { headers, col(name), rows[{rowNumber, values{}}] }. */
function prwReadSheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = (data[0] || []).map(function (h) { return pricingStr_(h).toLowerCase(); });
  function col(n) { return headers.indexOf(n); }
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var v = {};
    for (var j = 0; j < headers.length; j++) if (headers[j]) v[headers[j]] = data[i][j];
    rows.push({ rowNumber: i + 1, values: v });
  }
  return { headers: headers, col: col, rows: rows };
}

// ---------------------------------------------------------------------------------------------------------
// handlePricingUpdate_ — the ONE canonical pricing write.
// ---------------------------------------------------------------------------------------------------------
/**
 * Body:
 *   {
 *     action: 'pricing.update',
 *     dry_run: true|false,          // true = PREVIEW: plan everything, write nothing (§9)
 *     changed_by: '<operator>',
 *     change_reason: '<free text, audit only>',
 *     lines: [ { marketplace_sku_id, currency?,
 *                regular_price_mode, regular_price?,
 *                minimum_price_mode, minimum_price?,
 *                msrp_mode, msrp? } ]
 *   }
 *
 * Returns the canonical authoritative receipt: what the rows now hold, read back from the plan that was
 * actually applied — never an echo of the request.
 */
function handlePricingUpdate_(body) {
  body = body || {};
  var dryRun = body.dry_run === true || pricingStr_(body.dry_run).toLowerCase() === 'true';
  var actor = pricingStr_(body.changed_by) || 'pricing-editor';
  var reason = pricingStr_(body.change_reason);
  var lines = (body.lines && body.lines.length !== undefined) ? body.lines : [];

  var ss, priceSheet, logSheet;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    // RULE S0-2 — validate, never provision. The three flag columns and change_type are an OPERATOR
    // migration; until they exist this refuses with MISSING_REQUIRED_HEADER and zero mutation.
    priceSheet = prodRequireSheet_(ss, 'pricing_list', PRICING_LIST_HEADERS_);
    prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_);
    logSheet = prodRequireSheet_(ss, 'pricing_change_log', PRICING_CHANGE_LOG_HEADERS_);
    prodRequireColumns_(logSheet, ['change_type']);
  } catch (e) {
    return prwEnvelope_(false, { written: 0, rows: [] },
      { code: e && e.safetyToken ? e.safetyToken : 'SCHEMA_UNAVAILABLE',
        detail: (e && e.message ? e.message : String(e)) + ' — nothing was written.' });
  }

  var sheetState = prwReadSheet_(priceSheet);
  var index = {};
  sheetState.rows.forEach(function (r) {
    var k = pricingStr_(r.values.marketplace_sku_id);
    if (k && !index[k]) index[k] = r;
  });

  var plan = pricingPlanBatch_(lines, index);
  if (!plan.ok) {
    return prwEnvelope_(false, { written: 0, validated: lines.length, errors: plan.errors, rows: [] },
      { code: 'VALIDATION_FAILED', detail: plan.errors.length + ' problem(s). ZERO rows were written.' });
  }

  var receipt = plan.plans.map(function (p) {
    return { line: p.line, marketplace_sku_id: p.marketplace_sku_id, pricing_id: p.pricing_id,
      changed: p.changed, fields: p.fields };
  });

  if (dryRun) {
    return prwEnvelope_(true, { dry_run: true, written: 0, validated: lines.length,
      changed_rows: plan.changed_rows, unchanged_rows: plan.unchanged_rows, rows: receipt, errors: [] });
  }

  var lock = LockService.getScriptLock();
  var written = 0, logged = 0;
  try {
    if (!lock.tryLock(PRW_LOCK_MS_)) {
      return prwEnvelope_(false, { written: 0, rows: [] },
        { code: 'PRICING_LOCK_TIMEOUT', detail: 'Another pricing write is in progress. Nothing was written.' });
    }
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    var logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0]
      .map(function (h) { return pricingStr_(h); });
    var logRows = [];

    plan.plans.forEach(function (p) {
      if (!p.changed) return;
      Object.keys(p.cells).forEach(function (name) {
        var c = sheetState.col(name);
        if (c === -1) return;   // an optional legacy column (price_source) the sheet does not carry
        priceSheet.getRange(p.rowNumber, c + 1).setValue(p.cells[name]);
      });
      var cUB = sheetState.col('updated_by'), cUA = sheetState.col('updated_at');
      if (cUB !== -1) priceSheet.getRange(p.rowNumber, cUB + 1).setValue(actor);
      if (cUA !== -1) priceSheet.getRange(p.rowNumber, cUA + 1).setValue(now);
      written++;

      p.logs.forEach(function (entry) {
        var rec = {
          log_id: 'PCL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
          pricing_id: p.pricing_id, field_name: entry.field_name,
          old_value: entry.old_value, new_value: entry.new_value,
          change_type: entry.change_type, changed_by: actor, changed_at: now, change_reason: reason
        };
        logRows.push(logHeaders.map(function (h) { return Object.prototype.hasOwnProperty.call(rec, h) ? rec[h] : ''; }));
      });
    });

    // The audit is written in ONE range write, after the prices it describes. A log that outran the write
    // it records would describe a change that a later failure never made.
    if (logRows.length) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logHeaders.length).setValues(logRows);
      logged = logRows.length;
    }
    SpreadsheetApp.flush();
  } catch (e) {
    return prwEnvelope_(false, { written: written, logged: logged, rows: receipt },
      { code: 'PRICING_WRITE_FAILED', detail: (e && e.message ? e.message : String(e)) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }

  return prwEnvelope_(true, { dry_run: false, written: written, logged: logged, validated: lines.length,
    changed_rows: plan.changed_rows, unchanged_rows: plan.unchanged_rows, rows: receipt, errors: [] });
}
