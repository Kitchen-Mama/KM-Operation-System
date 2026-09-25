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
 * PRICING-R3 ADDED THE FX RECONCILIATION BELOW, and left everything above it exactly as it was. The
 * reconciliation rebuilds auto_* from the base prices at a supplied rate; it may refresh an effective price
 * ONLY where that field's own flag explicitly says AUTO, it never writes an ownership flag, and it never
 * fetches a rate. What is STILL not in this file: no FX provider, no rate stored anywhere but on the row it
 * was applied to, and no legacy classification. PRICING_FX_DECIMALS_ below is the FROZEN storage-precision
 * contract — the reconciliation rounds a CONVERTED value with it, and it is still never used to round a
 * price a person typed, which is refused instead.
 *
 * Testability: every decision is a pure `function` declaration (extract+eval friendly) taking plain values,
 * so the whole contract runs against fixtures with ZERO SpreadsheetApp.
 */

// Module stamp — the ROUND this file last changed, not the deployment release.
// PRICING-R2 - first release. Registered as a REQUIRED owner in 63_ from this release, because
// 01_router.gs dispatches pricing.update to handlePricingUpdate_ and a deployment carrying the router
// without this file routes a live WRITE action to an undefined handler.
// PRICING-R3 (R22) - gained the FX reconciliation: a SECOND action, pricing.fxReconcile, in the SAME file.
// It belongs here rather than in a new owner because PRICING-R2 §7 made this the one write path into
// pricing_list; two files writing one table would hold two locks and the field-level flags would stop
// being checkable by reading a single writer.
var PRW_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R24';

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
  var storedEff = pricingReadNumber_(row[spec.field]);   // read by MANUAL; AUTO compares the raw cell
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

  // AUTO — REMOVE THE OVERRIDE. PRICING-R4G §4: the field is cleared and ownership returns to the system;
  // the resolver then answers with auto_* for as long as the cell stays empty. The supplied manual value is
  // ignored entirely (§8), so a template carrying both a price and AUTO cannot smuggle the price in.
  //
  // IT USED TO COPY auto_* IN, AND THAT IS THE DEFECT IT NOW FIXES. A copied number is a SNAPSHOT: the row
  // shows the rate of the day somebody clicked, and every FX run afterwards moves auto_* while the copy
  // sits there looking maintained. Clearing makes the row track.
  //
  // AND IT NO LONGER REFUSES ON A BLANK auto_*. That refusal was right when the action wrote a value —
  // copying a blank would have written 0, and 0 is a price. Clearing needs no value to copy, so the refusal
  // now blocks the one repair a pending_fx row has: remove the override and let the row resolve by itself
  // when the first rate arrives. "There is no auto value yet" is a reason to clear, not a reason to refuse.
  var wasBlank = pricingStr_(row[spec.field]) === '';
  var flagChangedA = storedFlag !== PRICING_OWNER_AUTO_;
  if (wasBlank && !flagChangedA) return out;   // already exactly this: no override, and the system owns it
  out.changed = true;
  out.cells[spec.field] = '';
  out.cells[spec.flag] = pricingWriteFlag_(false);
  // The log records what was REMOVED. A RETURN_TO_AUTO whose old_value is a real number is the only trace
  // that the price a site was serving is no longer stored anywhere, so it is the line an operator reads to
  // undo this by hand.
  out.log = { field_name: spec.field, change_type: 'RETURN_TO_AUTO',
    old_value: pricingStr_(row[spec.field]), new_value: '' };
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

// =========================================================================================================
// PRICING-R3 — FX RECONCILIATION. The auto_* reference values, rebuilt from the canonical base prices.
//
// WHY THIS LIVES IN 73_ AND NOT IN A NEW FILE. PRICING-R2 §7 made this the ONE write path into pricing_list
// and the ONE writer of pricing_change_log. A reconciliation is a pricing write; putting it in a second
// file would mean two owners of the same table holding two different locks, and the invariant that makes
// the field-level flags trustworthy — that nothing else writes a price — would stop being checkable.
//
// THE DIRECTION IS FROZEN, because a reciprocal is the one arithmetic error that produces a plausible
// number rather than an obvious one:
//
//     LOCAL = BASE x FX_RATE          FX_RATE means: 1 unit of base_currency buys X units of local currency.
//
// USD -> CAD at 1.35 means USD 1 = CAD 1.35. Inverting it turns a $29.99 product into $22.21 and nothing
// about the result looks wrong. pricingFxRateFor_ is the only place a rate is chosen and it never inverts.
//
// WHAT AN FX RUN MAY AND MAY NOT TOUCH — this is PRICING-R2 §1 restated as a write rule, and it is the
// whole safety argument:
//
//   auto_regular_price / auto_minimum_price / auto_msrp   ALWAYS refreshable. They are the SYSTEM REFERENCE
//        value — what the base price converts to today — and they carry no ownership claim. R3 refreshes
//        them even for a field a person owns, because an operator comparing their negotiated price against
//        a stale reference is comparing against nothing.
//
//   regular_price / minimum_price / msrp                  NEVER. PRICING-R4G §6. These are USER OVERRIDES
//        and an FX run is not a user. TRUE, FALSE and blank are all left exactly as found — the first
//        because it is a person's price, the second because there is nothing to keep in step any more, and
//        the third because PRICING-R2 §10 still forbids turning "nobody has said" into a statement.
//        A field with no override resolves through auto_* on every read, so refreshing auto_* IS the fix.
//
// AUTO_REFERENCE_REFRESH IS NOT AUTHORITY_CLASSIFICATION. This file never writes an ownership flag during a
// reconciliation — not TRUE, not FALSE, and above all not FALSE over a blank. Refreshing what the system
// thinks a price WOULD be says nothing about who owns what it IS, and a run that quietly wrote FALSE into
// every blank flag would silently classify the entire price book, which is the exact outcome R2 was built
// to prevent.
//
// A MISSING BASE PRICE WRITES NOTHING, and this is a decision rather than an oversight. Converting a blank
// must produce null and never zero (§5), and this file does that. What it then does with the null is leave
// the field alone: blanking an auto_* would, for a field whose flag says AUTO, delete the live price that
// field is currently serving. An empty cell is not an instruction to delete a price — that is the same
// reading of blank that PRICING-R2 refused everywhere else — so the field is skipped and counted as
// BASE_MISSING rather than acted on.
//
// FAIL CLOSED PER ROW, NOT PER BATCH. A row whose currency is unknown to the frozen precision contract, or
// whose currency pair has no supplied rate, is SKIPPED with a reason and nothing about it is written. It
// does not stop the rows that can be converted, because a reconciliation that refuses everything because
// one site has an unpriced currency is a reconciliation nobody can run. But a row that is skipped is
// skipped ENTIRELY: there is no half-converted row.
//
// THE RATES ARE AN INPUT, NEVER A CONSTANT. There is no FX provider in this repository and no FX rate
// table in the database (PRICING_DATABASE_MAPPING §10 — "No separate FX DB table for MVP"), so the rates
// for a run arrive WITH the request, carrying their own source and as-of date, and are recorded on every
// row and every log line they touch. A rate hard-coded into a source file would be a business fact frozen
// into a deployment, correct on the day it was written and wrong every day after.
// =========================================================================================================

var PRICING_FX_ACTION_ = 'pricing.fxReconcile';
// A whole-table reconciliation has no page-sized ceiling, but it does need a runaway guard: this bounds the
// range writes below, and a table larger than it is a data problem worth stopping on.
var PRW_FX_MAX_ROWS_ = 20000;

// The columns a reconciliation reads and writes, beyond PRICING-R2's three flags. Validated, never created.
var PRICING_FX_COLUMNS_ = [
  'currency', 'base_currency',
  'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date',
  'auto_regular_price', 'auto_minimum_price', 'auto_msrp'
];

/** The pair key. Direction is part of the identity: USD>CAD and CAD>USD are different rates, never one. */
function pricingFxPairKey_(base, quote) {
  return pricingStr_(base).toUpperCase() + '>' + pricingStr_(quote).toUpperCase();
}

/**
 * Validate and index the rate table supplied with the request. Every entry must carry its own provenance,
 * because a rate without a source and a date is a number somebody typed.
 *
 *   [ { base_currency, quote_currency, rate, source, as_of } ]
 */
function pricingBuildRateTable_(entries) {
  var out = { ok: true, errors: [], byPair: {}, pairs: [] };
  var list = (entries && entries.length !== undefined) ? entries : [];
  if (!list.length) {
    out.ok = false;
    out.errors.push({ code: 'FX_RATES_REQUIRED',
      detail: 'No FX rates were supplied. This action never invents, estimates or re-uses a previous rate.' });
    return out;
  }
  list.forEach(function (e, i) {
    var n = i + 1;
    e = e || {};
    var base = pricingStr_(e.base_currency).toUpperCase();
    var quote = pricingStr_(e.quote_currency).toUpperCase();
    var source = pricingStr_(e.source);
    var asOf = pricingStr_(e.as_of);
    if (!base || !quote) {
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_PAIR_INCOMPLETE', detail: 'base_currency and quote_currency are both required.' });
      return;
    }
    if (!source) {
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_SOURCE_REQUIRED', pair: pricingFxPairKey_(base, quote),
        detail: 'A rate with no named source cannot be audited or reproduced.' });
      return;
    }
    if (!asOf) {
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_AS_OF_REQUIRED', pair: pricingFxPairKey_(base, quote),
        detail: 'A rate with no as-of date cannot be told from a stale one.' });
      return;
    }
    var r = pricingReadNumber_(e.rate);
    if (r.invalid || !r.present) {
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_RATE_NOT_NUMERIC', pair: pricingFxPairKey_(base, quote),
        detail: 'rate must be a number; got ' + JSON.stringify(pricingStr_(e.rate)) + '.' });
      return;
    }
    if (!(r.value > 0)) {
      // Zero would convert every price to nothing and a negative one is not a rate.
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_RATE_NOT_POSITIVE', pair: pricingFxPairKey_(base, quote),
        detail: 'A rate must be greater than zero; got ' + r.value + '.' });
      return;
    }
    if (base === quote && r.value !== 1) {
      // Same currency is an identity, not a conversion. A supplied 1.02 here is a data error, and applying
      // it would silently reprice a whole domestic site.
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_IDENTITY_RATE_INVALID', pair: pricingFxPairKey_(base, quote),
        detail: base + ' to ' + quote + ' is the same currency; the only valid rate is 1, not ' + r.value + '.' });
      return;
    }
    var key = pricingFxPairKey_(base, quote);
    if (Object.prototype.hasOwnProperty.call(out.byPair, key)) {
      out.ok = false;
      out.errors.push({ entry: n, code: 'FX_PAIR_DUPLICATED', pair: key,
        detail: 'Supplied more than once. Two rates for one pair cannot both be the rate for this run.' });
      return;
    }
    out.byPair[key] = { pair: key, base_currency: base, quote_currency: quote,
      rate: r.value, source: source, as_of: asOf };
    out.pairs.push(key);
  });
  if (!out.ok) { out.byPair = {}; out.pairs = []; }
  return out;
}

/**
 * The rate for one row's conversion. SAME CURRENCY IS RESOLVED HERE AND NEVER LOOKED UP (§4): a site whose
 * base and local currency agree needs no rate, no provider and no network, and requiring one would make a
 * domestic site un-reconcilable on a day nobody fetched its own currency against itself.
 */
function pricingFxRateFor_(table, baseCurrency, localCurrency) {
  var b = pricingStr_(baseCurrency).toUpperCase();
  var q = pricingStr_(localCurrency).toUpperCase();
  if (!b || !q) return null;
  if (b === q) return { pair: pricingFxPairKey_(b, q), base_currency: b, quote_currency: q,
    rate: 1, source: 'IDENTITY', as_of: null, identity: true };
  var hit = (table && table.byPair) ? table.byPair[pricingFxPairKey_(b, q)] : null;
  return hit ? hit : null;
}

/**
 * Convert ONE base value. Returns the raw product and the stored value separately, so §6's
 * FX_RAW_VALUE / FX_ROUNDED_VALUE are both reportable and the rounding is inspectable rather than implied.
 *
 *   absent base  -> { present: false }            nothing to convert, and nothing is written
 *   invalid base -> { present: false, invalid }   a typo is not a price
 */
function pricingFxConvert_(baseCell, rate, localCurrency) {
  var b = pricingReadNumber_(baseCell);
  if (b.invalid) return { present: false, invalid: true, raw: null, value: null };
  if (!b.present) return { present: false, invalid: false, na: b.na, raw: null, value: null };
  if (b.value < 0) return { present: false, invalid: true, negative: true, raw: null, value: null };
  var raw = b.value * rate;
  var rounded = pricingRoundFx_(raw, localCurrency);
  if (rounded === null) return { present: false, invalid: false, unsupported: true, raw: raw, value: null };
  return { present: true, invalid: false, base: b.value, raw: raw, value: rounded };
}

/**
 * THE CANONICAL RESOLVED-PRICE RESOLVER (PRICING-R4F §1, implemented by PRICING-R4G). Server side, and the
 * only implementation of this rule anywhere on this side of the wire.
 *
 * WHAT THE THREE COLUMNS MEAN NOW. `regular_price` / `minimum_price` / `msrp` are USER OVERRIDES and
 * nothing else. Blank means NO OVERRIDE EXISTS — not zero, not a missing business price, not an error. It
 * is the ordinary state of a healthy row, and it is what a newly created row looks like.
 *
 *   override is a number   -> RESOLVED = the override.                          source OVERRIDE
 *   override is blank      -> RESOLVED = auto_*, when auto_* is a number.       source AUTO
 *   override is NA         -> RESOLVED = null, and NA does NOT fall back.       source NA
 *   neither is a number    -> RESOLVED = null. "Not Set". NEVER 0.              source NOT_SET
 *
 * WHAT CHANGED IN R4G, AND WHY IT IS ONE CONDITION. R3 made this substitution only when the field's flag
 * explicitly read AUTO — correct under the stored-effective model, where a blank flag meant "nobody has
 * said" and resolving it to auto_* would have been reclassification carried out through the screen. Under
 * the nullable-override model the BLANK CELL ITSELF is the statement: there is no override, so there is
 * nothing to reclassify and nothing a fallback could overwrite. The flag no longer gates resolution.
 *
 * NA IS STILL NOT A GAP. "This band does not apply" is a decision someone made, and answering it with the
 * converted base price would turn a deliberate absence into a number. That guard stays exactly as it was.
 *
 * THE FLAG IS NO LONGER CONSULTED HERE AT ALL, and `writable_by_fx` is gone with it: after §6 an FX run
 * writes no override column under any authority, so a property claiming otherwise could only mislead. The
 * authority is still REPORTED, because the editing UI shows it — it just decides nothing.
 */
function pricingResolveEffective_(row, spec) {
  var stored = pricingReadNumber_(row ? row[spec.field] : null);
  var auto = pricingReadNumber_(row ? row[spec.auto] : null);
  var authority = pricingReadFlag_(row ? row[spec.flag] : null);
  var value = null;
  var source;
  if (stored.present) { value = stored.value; source = 'OVERRIDE'; }
  else if (stored.na) { source = 'NA'; }
  else if (auto.present) { value = auto.value; source = 'AUTO'; }
  else { source = 'NOT_SET'; }
  return {
    field: spec.field, value: value, source: source, authority: authority,
    override: stored.present ? stored.value : null,
    override_is_na: stored.na === true,
    auto: auto.present ? auto.value : null
  };
}

/**
 * Plan the FX refresh for ONE row. Pure. Returns what would be written and why each field was or was not.
 * Fields are planned INDEPENDENTLY (§5, §7): a missing base minimum never stops regular or msrp.
 */
function pricingPlanFxRow_(row, table) {
  var res = { ok: true, skip: null, changed: false, cells: {}, logs: [], fields: {},
    rate: null, converted: false };

  var localCurrency = pricingStr_(row.currency).toUpperCase();
  var baseCurrency = pricingStr_(row.base_currency).toUpperCase();

  if (!localCurrency) { res.ok = false; res.skip = 'MISSING_LOCAL_CURRENCY'; return res; }
  if (!baseCurrency) { res.ok = false; res.skip = 'MISSING_BASE_CURRENCY'; return res; }
  if (pricingDecimalsFor_(localCurrency) === null) {
    // §4 — fail closed for the row. The frozen precision contract does not know how many decimals this
    // currency stores, and a converted price written at the wrong precision is a wrong price.
    res.ok = false; res.skip = 'UNSUPPORTED_CURRENCY'; res.currency = localCurrency; return res;
  }

  var rate = pricingFxRateFor_(table, baseCurrency, localCurrency);
  if (!rate) { res.ok = false; res.skip = 'MISSING_FX_RATE'; res.pair = pricingFxPairKey_(baseCurrency, localCurrency); return res; }
  res.rate = rate;
  res.identity = !!rate.identity;

  PRICING_FIELDS_.forEach(function (spec) {
    var eff = pricingResolveEffective_(row, spec);
    var conv = pricingFxConvert_(row[spec.base], rate.rate, localCurrency);
    // `resolved_follows` is NOT a write. It records that this field's override is blank, so moving auto_*
    // moves what the site DISPLAYS without a single cell of the override column being touched. That is the
    // number an operator wants before running a reconciliation — "how many prices will look different
    // afterwards" — and under the old model it was the same question as "how many cells will you write".
    // It no longer is, and keeping the two apart is the point of reporting it separately.
    var view = { authority: eff.authority, auto_changed: false, resolved_follows: false, reason: null,
      raw: conv.raw, value: conv.value };

    if (!conv.present) {
      view.reason = conv.invalid ? (conv.negative ? 'BASE_NEGATIVE' : 'BASE_INVALID')
        : (conv.unsupported ? 'UNSUPPORTED_CURRENCY' : (conv.na ? 'BASE_NA' : 'BASE_MISSING'));
      res.fields[spec.field] = view;
      return;
    }

    var storedAuto = pricingReadNumber_(row[spec.auto]);
    var autoMoved = !storedAuto.present || storedAuto.value !== conv.value;
    if (autoMoved) {
      view.auto_changed = true;
      res.cells[spec.auto] = conv.value;
      res.logs.push({ field_name: spec.auto, change_type: 'AUTO_FX_REFRESH',
        old_value: pricingStr_(row[spec.auto]), new_value: String(conv.value) });
    } else {
      view.reason = 'AUTO_ALREADY_CURRENT';
    }

    // PRICING-R4G §6 — AN FX RUN WRITES NO OVERRIDE COLUMN. Not for TRUE, not for FALSE, not for blank.
    //
    // Under the stored-effective model this branch had to exist: a FALSE field was DEFINED to equal auto_*,
    // so a run that moved auto_* and left the effective cell behind broke the invariant it had just
    // asserted. Under the nullable model there is nothing to keep in step — a field with no override
    // resolves through auto_* on every read, so the reconciliation's job ends when auto_* is correct.
    //
    // THIS IS THE CHANGE THAT MAKES A CLEARED OVERRIDE MEAN SOMETHING. If FX still wrote the column, the
    // next run would refill what `Use Auto Price` had just emptied, and the two features would spend the
    // table between them. One writer per meaning: the operator owns the override, FX owns the reference.
    if (!eff.override_is_na && eff.override === null) view.resolved_follows = true;
    res.fields[spec.field] = view;
  });

  res.converted = true;
  // The rate is recorded on every converted row, even one whose prices did not move: "this row was
  // reconciled on this date at this rate" is the fact an auditor needs, and it is not the same fact as
  // "this row's price changed".
  res.cells.fx_rate = rate.rate;
  res.cells.fx_rate_date = rate.identity ? pricingStr_(table && table.runDate) : rate.as_of;
  res.changed = Object.keys(res.cells).length > 0;
  return res;
}

/**
 * Plan the WHOLE table and produce §11's census in the same pass, so the counts describe exactly the plan
 * that would be applied rather than a second walk that could disagree with it.
 */
function pricingPlanFxBatch_(rows, table) {
  var c = {
    PRICING_ROWS_TOTAL: 0, SAME_CURRENCY_ROWS: 0, FX_CONVERTIBLE_ROWS: 0,
    BASE_REGULAR_PRESENT: 0, BASE_MINIMUM_PRESENT: 0, BASE_MSRP_PRESENT: 0,
    AUTO_REGULAR_WOULD_UPDATE: 0, AUTO_MINIMUM_WOULD_UPDATE: 0, AUTO_MSRP_WOULD_UPDATE: 0,
    // PRICING-R4G — these counted CELLS THIS RUN WOULD WRITE into the effective columns. It writes none
    // now, so the counter would be a permanent zero. They count the same operator-facing fact instead:
    // fields whose override is blank, where moving auto_* moves the displayed price with no write at all.
    RESOLVED_REGULAR_WOULD_FOLLOW: 0, RESOLVED_MINIMUM_WOULD_FOLLOW: 0, RESOLVED_MSRP_WOULD_FOLLOW: 0,
    MANUAL_REGULAR_PRESERVED: 0, MANUAL_MINIMUM_PRESERVED: 0, MANUAL_MSRP_PRESERVED: 0,
    UNKNOWN_AUTHORITY_FIELDS: 0, UNKNOWN_AUTHORITY_ROWS: 0,
    UNSUPPORTED_CURRENCY_ROWS: 0, MISSING_BASE_CURRENCY_ROWS: 0, MISSING_LOCAL_CURRENCY_ROWS: 0,
    MISSING_FX_RATE_ROWS: 0, DUPLICATE_IDENTITY_ROWS: 0, IDENTITY_MISSING_ROWS: 0
  };
  var out = { ok: true, errors: [], plans: [], skipped: [], census: c, pairsUsed: {} };

  if (!rows || !rows.length) {
    out.ok = false;
    out.errors.push({ code: 'NO_PRICING_ROWS', detail: 'pricing_list carried no data rows.' });
    return out;
  }
  if (rows.length > PRW_FX_MAX_ROWS_) {
    out.ok = false;
    out.errors.push({ code: 'TABLE_TOO_LARGE', detail: rows.length + ' rows exceeds the ' + PRW_FX_MAX_ROWS_ + '-row guard.' });
    return out;
  }

  var seen = {};
  var MANUAL_KEY = { regular_price: 'MANUAL_REGULAR_PRESERVED', minimum_price: 'MANUAL_MINIMUM_PRESERVED', msrp: 'MANUAL_MSRP_PRESERVED' };
  var AUTO_KEY = { regular_price: 'AUTO_REGULAR_WOULD_UPDATE', minimum_price: 'AUTO_MINIMUM_WOULD_UPDATE', msrp: 'AUTO_MSRP_WOULD_UPDATE' };
  var EFF_KEY = { regular_price: 'RESOLVED_REGULAR_WOULD_FOLLOW', minimum_price: 'RESOLVED_MINIMUM_WOULD_FOLLOW', msrp: 'RESOLVED_MSRP_WOULD_FOLLOW' };
  var BASE_KEY = { base_regular_price: 'BASE_REGULAR_PRESENT', base_minimum_price: 'BASE_MINIMUM_PRESENT', base_msrp: 'BASE_MSRP_PRESENT' };

  rows.forEach(function (r) {
    c.PRICING_ROWS_TOTAL++;
    var v = r.values;
    var id = pricingStr_(v.marketplace_sku_id);

    PRICING_FIELDS_.forEach(function (spec) {
      if (pricingReadNumber_(v[spec.base]).present) c[BASE_KEY[spec.base]]++;
    });

    // THE AUTHORITY CENSUS DESCRIBES THE TABLE, NOT THE PLAN, so it is taken before the guards below and
    // counts rows this run cannot act on. "How much of the price book has no recorded owner" is the number
    // an operator reads to decide whether reconciling is safe at all, and a duplicated or unidentified row
    // is still part of the price book. What those guards decide is only whether the row can be WRITTEN.
    var rowUnknown = false;
    PRICING_FIELDS_.forEach(function (spec) {
      var a = pricingReadFlag_(v[spec.flag]);
      if (a === PRICING_OWNER_UNKNOWN_) { c.UNKNOWN_AUTHORITY_FIELDS++; rowUnknown = true; }
      else if (a === PRICING_OWNER_MANUAL_) c[MANUAL_KEY[spec.field]]++;
    });
    if (rowUnknown) c.UNKNOWN_AUTHORITY_ROWS++;

    if (!id) { c.IDENTITY_MISSING_ROWS++; out.skipped.push({ rowNumber: r.rowNumber, reason: 'IDENTITY_MISSING' }); return; }
    if (seen[id]) {
      // pricing_list is one row per marketplace_sku_id. Two rows for one id means no rule picks a winner,
      // so BOTH are skipped: converting the first would make the duplicate invisible.
      c.DUPLICATE_IDENTITY_ROWS++;
      out.skipped.push({ rowNumber: r.rowNumber, marketplace_sku_id: id, reason: 'DUPLICATE_IDENTITY', first_seen_row: seen[id] });
      return;
    }
    seen[id] = r.rowNumber;

    var plan = pricingPlanFxRow_(v, table);
    plan.rowNumber = r.rowNumber;
    plan.marketplace_sku_id = id;
    plan.pricing_id = pricingStr_(v.pricing_id);

    if (!plan.ok) {
      if (plan.skip === 'UNSUPPORTED_CURRENCY') c.UNSUPPORTED_CURRENCY_ROWS++;
      else if (plan.skip === 'MISSING_BASE_CURRENCY') c.MISSING_BASE_CURRENCY_ROWS++;
      else if (plan.skip === 'MISSING_LOCAL_CURRENCY') c.MISSING_LOCAL_CURRENCY_ROWS++;
      else if (plan.skip === 'MISSING_FX_RATE') c.MISSING_FX_RATE_ROWS++;
      out.skipped.push({ rowNumber: r.rowNumber, marketplace_sku_id: id, reason: plan.skip,
        currency: plan.currency || null, pair: plan.pair || null });
      return;
    }

    if (plan.identity) c.SAME_CURRENCY_ROWS++; else c.FX_CONVERTIBLE_ROWS++;
    if (plan.rate) out.pairsUsed[plan.rate.pair] = plan.rate;

    PRICING_FIELDS_.forEach(function (spec) {
      var f = plan.fields[spec.field];
      if (!f) return;
      if (f.auto_changed) c[AUTO_KEY[spec.field]]++;
      if (f.auto_changed && f.resolved_follows) c[EFF_KEY[spec.field]]++;
    });

    out.plans.push(plan);
  });

  return out;
}

/**
 * BUILD THE PHYSICAL WRITES, AND PROVE THEM BEFORE MAKING THEM.
 *
 * §14 — one range write per COLUMN, not one per row and never one per cell. Every column this run touches
 * is written once over the whole data span, so the number of spreadsheet calls scales with the number of
 * columns (a constant) rather than with the number of SKUs.
 *
 * That speed is bought with a risk, and this function is where the risk is paid for: writing a whole column
 * means writing back every row the run did NOT change, so a defect in building the array would overwrite an
 * override with an auto value and leave no trace of what it replaced. So the array is not trusted.
 *
 * PRICING-R4G MADE THIS AUDIT STRICTER BY MAKING THE RULE SIMPLER. It used to re-read each effective cell's
 * flag and demand that any row not explicitly AUTO be byte-identical — a per-row judgement, because the
 * planner was allowed to write some of those cells. The planner is now allowed to write NONE of them, so
 * the audit no longer has a judgement to make: an override column appearing in the write set AT ALL is the
 * violation, whatever the flag says and whatever the value would be.
 *
 * It is still a second opinion rather than a restatement: the planner decides field by field from
 * pricingResolveEffective_, the audit decides from the set of column names about to be sent, and a bug
 * would have to occur identically in both to pass.
 */
function pricingFxBuildColumns_(sheetState, plans) {
  var byRow = {};
  plans.forEach(function (p) { if (p.changed) byRow[p.rowNumber] = p; });

  var touched = {};
  plans.forEach(function (p) { if (p.changed) Object.keys(p.cells).forEach(function (k) { touched[k] = 1; }); });

  var columns = [];
  var violations = [];
  var effectiveNames = {};
  PRICING_FIELDS_.forEach(function (s) { effectiveNames[s.field] = s; });

  Object.keys(touched).forEach(function (name) {
    var idx = sheetState.col(name);
    if (idx === -1) return;            // a column this sheet does not carry is not created here
    var values = [];
    sheetState.rows.forEach(function (r) {
      var p = byRow[r.rowNumber];
      var original = r.values[name];
      var next = (p && Object.prototype.hasOwnProperty.call(p.cells, name)) ? p.cells[name] : original;

      if (Object.prototype.hasOwnProperty.call(effectiveNames, name)) {
        // PRICING-R4G §6 — reached only if the planner put an override column in the write set, which it
        // may never do. Reported per row so the refusal names the rows rather than only the column.
        var spec = effectiveNames[name];
        violations.push({ rowNumber: r.rowNumber, field: name,
          authority: pricingReadFlag_(r.values[spec.flag]),
          was: pricingStr_(original), would_be: pricingStr_(next),
          reason: 'FX_MAY_NOT_WRITE_MANUAL_OVERRIDE' });
      }
      values.push([next]);
    });
    columns.push({ name: name, columnIndex: idx + 1, values: values });
  });

  return { columns: columns, violations: violations, rowCount: sheetState.rows.length };
}

/** The rate-input template an operator fills in for a run. One row per pair actually needed by the table. */
function pricingFxRequiredPairs_(rows) {
  var need = {};
  (rows || []).forEach(function (r) {
    var b = pricingStr_(r.values.base_currency).toUpperCase();
    var q = pricingStr_(r.values.currency).toUpperCase();
    if (!b || !q || b === q) return;           // identity pairs need no supplied rate
    need[pricingFxPairKey_(b, q)] = { base_currency: b, quote_currency: q, rate: '', source: '', as_of: '' };
  });
  return Object.keys(need).sort().map(function (k) { return need[k]; });
}

// ---------------------------------------------------------------------------------------------------------
// handlePricingFxReconcile_ — the FX run. DRY RUN IS THE DEFAULT.
// ---------------------------------------------------------------------------------------------------------
/**
 * Body:
 *   {
 *     action: 'pricing.fxReconcile',
 *     dry_run: true,                 // ANY value other than an explicit false is a dry run
 *     changed_by: '<operator>',
 *     run_date: 'YYYY-MM-DD',        // the execution date; supplied, never taken from a browser clock
 *     rates: [ { base_currency, quote_currency, rate, source, as_of } ]
 *   }
 *
 * DRY RUN IS THE DEFAULT AND IT IS DELIBERATE. `dry_run: false` has to be written out in full to write
 * anything. A reconciliation is the one action in this file that can touch every row in the table, so the
 * failure mode of a forgotten parameter must be "counted nothing" and never "repriced everything".
 */
function handlePricingFxReconcile_(body) {
  body = body || {};
  var wantsWrite = body.dry_run === false || pricingStr_(body.dry_run).toLowerCase() === 'false';
  var dryRun = !wantsWrite;
  var actor = pricingStr_(body.changed_by) || 'fx-reconciliation';
  var runDate = pricingStr_(body.run_date);

  var ss, priceSheet, logSheet;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    // RULE S0-2 — validate, never provision, exactly as pricing.update does. The flags are PRICING-R2's
    // migration and the FX columns are pre-existing; either missing means this refuses having written none.
    priceSheet = prodRequireSheet_(ss, 'pricing_list', PRICING_LIST_HEADERS_);
    prodRequireColumns_(priceSheet, PRICING_MANUAL_FLAG_COLUMNS_);
    prodRequireColumns_(priceSheet, PRICING_FX_COLUMNS_);
    logSheet = prodRequireSheet_(ss, 'pricing_change_log', PRICING_CHANGE_LOG_HEADERS_);
    prodRequireColumns_(logSheet, ['change_type']);
  } catch (e) {
    return prwEnvelope_(false, { written: 0, rows_written: 0 },
      { code: e && e.safetyToken ? e.safetyToken : 'SCHEMA_UNAVAILABLE',
        detail: (e && e.message ? e.message : String(e)) + ' — nothing was written.' });
  }

  var sheetState = prwReadSheet_(priceSheet);

  if (!runDate) {
    return prwEnvelope_(false, { written: 0, required_pairs: pricingFxRequiredPairs_(sheetState.rows) },
      { code: 'RUN_DATE_REQUIRED',
        detail: 'run_date is the execution date of this reconciliation and is recorded on every row it '
          + 'touches. It is supplied, never defaulted, so a run can never be dated by whichever clock '
          + 'happened to answer.' });
  }

  var table = pricingBuildRateTable_(body.rates);
  table.runDate = runDate;
  if (!table.ok) {
    // The refusal carries the template: the pairs this table actually needs, so the operator's next step
    // is filling a list rather than guessing which currencies are live.
    return prwEnvelope_(false, { written: 0, errors: table.errors,
      required_pairs: pricingFxRequiredPairs_(sheetState.rows) },
      { code: 'FX_RATES_INVALID', detail: table.errors.length + ' problem(s) with the supplied rates. ZERO rows were written.' });
  }

  var batch = pricingPlanFxBatch_(sheetState.rows, table);
  if (!batch.ok) {
    return prwEnvelope_(false, { written: 0, errors: batch.errors },
      { code: 'FX_PLAN_FAILED', detail: batch.errors.map(function (e) { return e.code; }).join(', ') });
  }

  var build = pricingFxBuildColumns_(sheetState, batch.plans);
  if (build.violations.length) {
    // Unreachable by design, and checked anyway. If it ever fires, a manual price was one write away from
    // being replaced by a converted one, and the only safe response is to write nothing at all.
    return prwEnvelope_(false, { written: 0, violations: build.violations.slice(0, 20),
      violation_count: build.violations.length, census: batch.census },
      { code: 'MANUAL_PRICE_WOULD_BE_OVERWRITTEN',
        detail: build.violations.length + ' field(s) not owned by the system would have changed. '
          + 'The entire run was refused and nothing was written.' });
  }

  var pairsUsed = Object.keys(batch.pairsUsed).sort().map(function (k) {
    var p = batch.pairsUsed[k];
    return { pair: p.pair, rate: p.rate, source: p.source, as_of: p.as_of, identity: !!p.identity };
  });
  var logCount = batch.plans.reduce(function (n, p) { return n + p.logs.length; }, 0);

  var summary = {
    run_date: runDate,
    fx_direction: 'LOCAL = BASE x FX_RATE (1 base_currency = rate local_currency)',
    pairs_used: pairsUsed,
    census: batch.census,
    rows_planned: batch.plans.length,
    rows_changed: batch.plans.filter(function (p) { return p.changed; }).length,
    skipped: batch.skipped.slice(0, 200),
    skipped_count: batch.skipped.length,
    log_rows: logCount,
    manual_fields_overwritten: 0,
    columns_to_write: build.columns.map(function (c) { return c.name; })
  };

  if (dryRun) {
    return prwEnvelope_(true, prwMerge_({ dry_run: true, written: 0, rows_written: 0,
      physical_range_writes: 0 }, summary));
  }

  var lock = LockService.getScriptLock();
  var rangeWrites = 0, rowsWritten = 0, logged = 0;
  try {
    if (!lock.tryLock(PRW_LOCK_MS_)) {
      return prwEnvelope_(false, { written: 0 },
        { code: 'PRICING_LOCK_TIMEOUT', detail: 'Another pricing write is in progress. Nothing was written.' });
    }
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    // updated_by / updated_at travel with the prices, as columns, for the rows that actually changed.
    var changedRows = {};
    batch.plans.forEach(function (p) { if (p.changed) changedRows[p.rowNumber] = 1; });
    rowsWritten = Object.keys(changedRows).length;

    ['updated_by', 'updated_at'].forEach(function (name) {
      var idx = sheetState.col(name);
      if (idx === -1) return;
      var v = [];
      sheetState.rows.forEach(function (r) {
        v.push([changedRows[r.rowNumber] ? (name === 'updated_by' ? actor : now) : r.values[name]]);
      });
      build.columns.push({ name: name, columnIndex: idx + 1, values: v });
    });

    if (build.rowCount > 0) {
      build.columns.forEach(function (c) {
        priceSheet.getRange(2, c.columnIndex, build.rowCount, 1).setValues(c.values);
        rangeWrites++;
      });
    }

    var logHeaders = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0]
      .map(function (h) { return pricingStr_(h); });
    var logRows = [];
    batch.plans.forEach(function (p) {
      if (!p.logs.length) return;
      // §13 — enough metadata to reconstruct the run without joining anything: date, source, pair, rate.
      var reason = 'FX ' + runDate + ' ' + p.rate.pair + ' @' + p.rate.rate
        + ' src=' + p.rate.source + (p.rate.as_of ? ' as_of=' + p.rate.as_of : '');
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
    if (logRows.length) {
      logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logHeaders.length).setValues(logRows);
      logged = logRows.length;
      rangeWrites++;
    }
    SpreadsheetApp.flush();
  } catch (e) {
    return prwEnvelope_(false, { written: rowsWritten, logged: logged, physical_range_writes: rangeWrites },
      { code: 'PRICING_WRITE_FAILED', detail: (e && e.message ? e.message : String(e)) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }

  return prwEnvelope_(true, prwMerge_({ dry_run: false, written: rowsWritten, rows_written: rowsWritten,
    logged: logged, physical_range_writes: rangeWrites }, summary));
}

/** Shallow merge, so the dry run and the real run report the SAME summary shape from the same builder. */
function prwMerge_(target, extra) {
  Object.keys(extra || {}).forEach(function (k) { target[k] = extra[k]; });
  return target;
}
