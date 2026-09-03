/**
 * ================================================================================================================
 * TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027 — F1-7N-FC-1B-E3-R2 §H
 * DRY RUN BY DEFAULT. Adds ONLY the completely-missing forecast base rows for the required rollover year.
 * ----------------------------------------------------------------------------------------------------------------
 * §H PERMITS THIS FILE TO EXIST ONLY IF ZERO INITIALISATION IS PROVEN POLICY. It is, and by the production
 * writers rather than by inference from what the allocator tolerates:
 *
 *   1. ONE ROW PER scope + SKU + YEAR is the business key everywhere. `handleImportMarketplaceSkusBatch_` (the Add-SKU
 *      batch import, router action `importMarketplaceSkusBatch`) keys its duplicate guard on
 *      `[currentYear, company, country, marketplace, sku]`, and
 *      `handleImportFcRegularForecastBatch_` documents and uses the identical
 *      "year + company + country + marketplace + sku" as THE business key (04_).
 *   2. JAN–DEC = 0 IS THE BASE-ROW INITIALISATION. `handleImportMarketplaceSkusBatch_` writes a new forecast row with
 *      `for (m in months) newFc[fcCol(months[m])] = 0` and `total_fc = 0`. That is the shipped production writer
 *      creating a base row, not a reading of what a consumer accepts.
 *   3. IDENTITY IS `FC-{year}-{8 hex}` and the remaining columns are `source`, `forecast_status`, `created_at`,
 *      `updated_at`, with `fc_share` deliberately left blank.
 *   4. A DUPLICATE GUARD ALREADY EXISTS, on that same business key, in both writers.
 *
 * SO THIS TOOL WRITES NOTHING ITSELF. It has no appendRow and no setValue. COMMIT delegates to
 * `handleImportFcRegularForecastBatch_` — the router-registered `importFcRegularForecastBatch` action — so every
 * created row gets the official ID contract, the official header validation and the official column set. A TEMP
 * file minting its own forecast_id would be a second identity authority, which is the class of defect that put
 * three physical rows under one allocation-draft primary key.
 *
 * THE ONE HAZARD, NAMED. That official writer is an UPSERT: for a business key that already exists it OVERWRITES
 * all twelve months with the payload. A payload of zeros against an existing row would therefore ERASE real
 * forecast data. Everything below is arranged around that single fact:
 *
 *   • only keys that are MISSING after a re-read taken inside the same call are ever sent;
 *   • any CONFLICT or DUPLICATE anywhere in the required scope STOPS the whole run, before the first send;
 *   • every result must come back `created`; a single `updated` means the pre-read was stale and is reported as
 *     a hard failure with the key that did it, because that is the shape in which data would have been lost;
 *   • a readback runs BEFORE and AFTER, and the after-readback checks the twelve months really are zero.
 *
 * IDENTIFIABLE ON A PARTIAL BATCH. Every row this tool creates carries `source = 'year_rollover_2027'` via the
 * writer's own `options.sourceDefault`, so an interrupted run leaves rows that can be listed by one query
 * instead of being indistinguishable from hand-entered data.
 *
 * REPLAY IS ZERO WRITES. The missing-key set is computed from a fresh read every time, so a second run finds
 * nothing missing and sends nothing. Idempotency lives here, in the re-read, not in a hope about the writer.
 *
 * ENTRY POINTS — the DRY RUN is the only default, and COMMIT cannot be reached by accident:
 *   RUN_FC_2027_ROLLOVER_DRY_RUN()                        // zero-argument, DRY RUN, zero writes
 *   FC_2027_ROLLOVER_PLAN({ planningCycle: 'RECO-2026-09' })
 *   COMMIT_FC_2027_ROLLOVER_AFTER_REVIEW('<the token the DRY RUN prints>')    // NOT run this round
 * ================================================================================================================
 */

var TEMP_FCROLL_BUILD_ = 'F1-7N-FC-1B-E3-R2';
// §H — DRY RUN IS THE DEFAULT, AND THE FLAG IS LOAD-BEARING RATHER THAN DECORATIVE. COMMIT reads it and
// refuses while it is true, so reaching a write takes TWO deliberate and independent acts: editing this line in
// the editor, and supplying the content token the DRY RUN printed for the exact plan. A flag that nothing reads
// documents an intention instead of enforcing one, which is the failure mode this file cannot afford.
var TEMP_FCROLL_DRY_RUN = true;
var TEMP_FCROLL_SOURCE_ = 'year_rollover_2027';    // stamped on every created row so a partial batch is findable
var TEMP_FCROLL_MONTHS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function TEMP_FCROLL_str_(v) { return String(v == null ? '' : v).trim(); }
function TEMP_FCROLL_bk_(y, co, cn, mp, sk) { return [y, co, cn, mp, sk].join('|'); }

/**
 * The plan: which base rows are missing, which already exist, and which scopes are in a state no tool may touch.
 * READ-ONLY in every case — this is the whole of the DRY RUN and the pre-flight of the COMMIT.
 */
function TEMP_FCROLL_buildPlan_(params) {
  params = params || {};
  var out = { build: TEMP_FCROLL_BUILD_, section: 'F1-7N-FC-1B-E3-R2 §H', dry_run: true,
    would_create: [], skipped_existing: [], conflicts: [], writes: 0, verdict: 'STOP', blocker: '' };

  if (typeof RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS !== 'function') {
    out.blocker = 'CENSUS_UNAVAILABLE';
    out.hint = 'TEMP_FC_FORECAST_YEAR_ROLLOVER_CENSUS_FC1B_E3_R2.gs must be present — this tool never re-implements the coverage classification.';
    return out;
  }
  // The census is the SINGLE classification authority. Re-deriving "which month is missing" here would be a
  // second opinion that could disagree with the one the report was reviewed against.
  var census = RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS({
    planningCycle: params.planningCycle, company: params.company, country: params.country,
    marketplace: params.marketplace, sku: params.sku, maxScopeRows: 100000
  });
  out.census_verdict = census.verdict;
  out.planning_cycle = census.planning_cycle || '';
  out.required_year = census.required_year || [];
  out.required_month = census.required_month || [];
  out.total_active_scopes = census.total_active_scopes;
  if (!census.planning_cycle) { out.blocker = 'CENSUS_' + (census.blocker || 'UNRESOLVED'); return out; }

  // §H — A CONFLICT STOPS THE RUN, and it stops it for the WHOLE required scope rather than per row. Two
  // disagreeing rows for one business key mean the table's identity is not what this tool assumed, and a
  // creation elsewhere in the same table is not obviously safe while that is true.
  if (Number(census.conflicting_row_count) > 0) {
    out.blocker = 'CONFLICTING_FORECAST_ROWS_PRESENT';
    out.conflicts = (census.blocked_scopes || []).filter(function (s) {
      return (s.per_month || []).some(function (m) { return m.code === 'CONFLICTING_VALUES'; });
    });
    return out;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('fc_regular_forecast');
  if (!sh) { out.blocker = 'FC_REGULAR_FORECAST_SHEET_NOT_FOUND'; return out; }
  var vals = sh.getDataRange().getValues();
  var headers = (vals[0] || []).map(function (h) { return TEMP_FCROLL_str_(h).toLowerCase(); });
  // The writer validates headers itself and refuses before any write; this checks the ones the PLAN reads, so a
  // header fault is a refusal here rather than a confusing empty plan.
  var needed = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku'].concat(TEMP_FCROLL_MONTHS_);
  var missingHeaders = needed.filter(function (h) { return headers.indexOf(h) === -1; });
  if (missingHeaders.length) { out.blocker = 'MISSING_HEADERS'; out.missing_headers = missingHeaders; return out; }
  var ix = {}; headers.forEach(function (h, i) { ix[h] = i; });

  // The existing business keys, and how many rows carry each. A key carried by MORE THAN ONE ROW is a duplicate
  // even when the rows happen to agree, and it is reported rather than written near.
  var keyCount = {};
  for (var r = 1; r < vals.length; r++) {
    var sk = TEMP_FCROLL_str_(vals[r][ix.sku]); if (!sk) continue;
    var k = TEMP_FCROLL_bk_(TEMP_FCROLL_str_(vals[r][ix.year]), TEMP_FCROLL_str_(vals[r][ix.company]),
      TEMP_FCROLL_str_(vals[r][ix.country]), TEMP_FCROLL_str_(vals[r][ix.marketplace]), sk);
    keyCount[k] = (keyCount[k] || 0) + 1;
  }
  out.fc_row_count = vals.length - 1;

  // Every (active scope × required year) pair the census enumerated. `NO_ROW_FOR_YEAR` is the ONLY cause this
  // tool addresses: a blank month in a row that EXISTS is a value only the forecast owner can supply, and
  // writing a 0 over it would be this tool inventing a forecast.
  var blocked = census.blocked_scopes || [];
  var seen = {};
  blocked.forEach(function (s) {
    (s.per_month || []).forEach(function (m) {
      if (m.code !== 'NO_ROW_FOR_YEAR') return;
      var k = TEMP_FCROLL_bk_(m.year, s.company, s.country, s.marketplace, s.sku);
      if (seen[k]) return;
      seen[k] = 1;
      if (keyCount[k]) {
        // The census said no row for this year while the key index says there is one. That is a disagreement
        // about the table's contents inside a single call, and it is never resolved by writing.
        out.conflicts.push({ key: k, reason: 'CENSUS_AND_KEY_INDEX_DISAGREE', existing_row_count: keyCount[k] });
        return;
      }
      out.would_create.push({ year: m.year, company: s.company, country: s.country,
        marketplace: s.marketplace, sku: s.sku, business_key: k,
        months: 'jan..dec = 0 (04_ handleImportMarketplaceSkusBatch_ base-row contract)' });
    });
  });
  // Everything else in the required scope that already has its rows, counted so "nothing to do" is a number.
  Object.keys(keyCount).forEach(function (k) {
    var y = k.split('|')[0];
    if ((out.required_year || []).indexOf(y) === -1) return;
    if (keyCount[k] > 1) out.conflicts.push({ key: k, reason: 'DUPLICATE_BUSINESS_KEY', existing_row_count: keyCount[k] });
    else out.skipped_existing.push({ business_key: k });
  });

  if (out.conflicts.length) { out.blocker = 'CONFLICTS_PRESENT'; return out; }
  out.verdict = out.would_create.length ? 'READY_TO_COMMIT' : 'NOTHING_TO_DO';
  // The token binds a COMMIT to the exact plan a human reviewed. It is derived from the plan's CONTENT, so an
  // added or removed key changes it and the stale token is refused — never a timestamp, which would authorise
  // any plan produced in the same minute.
  out.commit_token = TEMP_FCROLL_planToken_(out.would_create);
  return out;
}

/** A content hash of the plan. Same keys in any order -> same token; a different key set -> a different token. */
function TEMP_FCROLL_planToken_(wouldCreate) {
  var keys = (wouldCreate || []).map(function (w) { return w.business_key; }).sort();
  var basis = keys.join(';');
  var h = 0;
  for (var i = 0; i < basis.length; i++) { h = ((h << 5) - h + basis.charCodeAt(i)) | 0; }
  return 'FCROLL-' + keys.length + '-' + (h >>> 0).toString(16).toUpperCase();
}

function TEMP_FCROLL_report_(o) {
  try {
    Logger.log('=== FC YEAR ROLLOVER ' + TEMP_FCROLL_BUILD_ + (o.dry_run ? ' [DRY RUN]' : ' [COMMIT]') + ' ===');
    Logger.log('verdict=' + o.verdict + '  blocker=' + (o.blocker || '(none)') + '  writes=' + o.writes);
    Logger.log('would_create=' + (o.would_create || []).length + '  skipped_existing=' + (o.skipped_existing || []).length +
      '  conflicts=' + (o.conflicts || []).length);
    Logger.log('required_year=' + JSON.stringify(o.required_year || []) + '  commit_token=' + (o.commit_token || '(none)'));
    Logger.log('FULL: ' + JSON.stringify(o));
  } catch (e) {}
  return o;
}

/** §H — THE DRY RUN. Reads, classifies, prints the exact plan and its token. Zero writes, always. */
function FC_2027_ROLLOVER_PLAN(params) {
  var o = TEMP_FCROLL_buildPlan_(params);
  o.dry_run = true; o.writes = 0;
  return TEMP_FCROLL_report_(o);
}

/** Zero-argument DRY RUN for the live evidence's cycle. */
function RUN_FC_2027_ROLLOVER_DRY_RUN() {
  return FC_2027_ROLLOVER_PLAN({ planningCycle: 'RECO-2026-09' });
}

/**
 * §H — THE COMMIT. A SEPARATE, EXPLICITLY NAMED ENTRY POINT that cannot be reached without the token the DRY RUN
 * printed for the exact plan being committed. It re-reads and re-plans first: the token proves a human reviewed
 * THIS key set, and the re-plan proves the key set is still true of the table right now.
 *
 * NOT TO BE RUN IN F1-7N-FC-1B-E3-R2. The round that adds this tool does not execute it.
 */
function COMMIT_FC_2027_ROLLOVER_AFTER_REVIEW(commitToken, params) {
  var o = TEMP_FCROLL_buildPlan_(params);
  o.dry_run = false; o.writes = 0;
  if (o.verdict === 'NOTHING_TO_DO') { o.verdict = 'NOTHING_TO_DO'; return TEMP_FCROLL_report_(o); }
  if (o.verdict !== 'READY_TO_COMMIT') { o.blocker = o.blocker || 'PLAN_NOT_COMMITTABLE'; return TEMP_FCROLL_report_(o); }
  if (TEMP_FCROLL_DRY_RUN === true) {
    o.verdict = 'STOP'; o.blocker = 'DRY_RUN_MODE_ACTIVE'; o.dry_run = true;
    o.hint = 'Set TEMP_FCROLL_DRY_RUN = false in this file to permit a write. It ships true, and F1-7N-FC-1B-E3-R2 does not change it.';
    return TEMP_FCROLL_report_(o);
  }
  if (TEMP_FCROLL_str_(commitToken) !== o.commit_token) {
    o.verdict = 'STOP'; o.blocker = 'COMMIT_TOKEN_MISMATCH';
    o.hint = 'Run RUN_FC_2027_ROLLOVER_DRY_RUN() and pass the commit_token it prints. A mismatch means the plan changed since it was reviewed.';
    return TEMP_FCROLL_report_(o);
  }
  if (typeof handleImportFcRegularForecastBatch_ !== 'function') {
    o.verdict = 'STOP'; o.blocker = 'OFFICIAL_WRITER_UNAVAILABLE';
    o.hint = 'This tool never writes directly. 04_marketplace_forecast_import.gs must be loaded.';
    return TEMP_FCROLL_report_(o);
  }

  // The payload: the official writer's own row shape, months explicitly zero (the 04_ base-row contract).
  var rows = o.would_create.map(function (w) {
    var row = { year: w.year, company: w.company, country: w.country, marketplace: w.marketplace, sku: w.sku };
    TEMP_FCROLL_MONTHS_.forEach(function (m) { row[m] = 0; });
    return row;
  });
  o.payload_row_count = rows.length;

  var res;
  try {
    // `overwriteStatus: false` — an existing row's status is never touched. It cannot matter for a CREATE, and
    // it is set explicitly so that if this ever DID reach an existing row it would still change less.
    var envelope = handleImportFcRegularForecastBatch_({
      rows: rows, options: { sourceDefault: TEMP_FCROLL_SOURCE_, forecastStatusDefault: 'draft', overwriteStatus: false }
    });
    res = JSON.parse(envelope.getContent());
  } catch (e) {
    o.verdict = 'STOP'; o.blocker = 'OFFICIAL_WRITER_THREW';
    o.error = (e && e.message) ? String(e.message) : String(e);
    return TEMP_FCROLL_report_(o);
  }
  o.writer_response_success = !!(res && res.success);
  if (!res || res.success !== true) {
    o.verdict = 'STOP'; o.blocker = 'OFFICIAL_WRITER_REFUSED';
    o.writer_error = (res && res.error) || null;
    return TEMP_FCROLL_report_(o);
  }
  var results = (res.data && res.data.results) || [];
  o.created = results.filter(function (r) { return r.status === 'created'; }).length;
  o.updated = results.filter(function (r) { return r.status === 'updated'; }).length;
  o.errored = results.filter(function (r) { return r.status === 'error'; }).length;
  o.skipped_in_batch = results.filter(function (r) { return r.status === 'skipped'; }).length;
  o.writes = o.created + o.updated;
  o.created_forecast_ids = results.filter(function (r) { return r.status === 'created'; })
    .map(function (r) { return r.forecast_id; });

  // AN `updated` IS A HARD FAILURE HERE. The plan sent only keys that did not exist a moment earlier, so an
  // update means the table changed underneath and twelve months of a real forecast were just overwritten with
  // zeros. It is named with its key rather than folded into a count.
  if (o.updated > 0) {
    o.verdict = 'STOP'; o.blocker = 'UNEXPECTED_UPDATE_EXISTING_ROW_MAY_HAVE_BEEN_OVERWRITTEN';
    o.updated_keys = results.filter(function (r) { return r.status === 'updated'; })
      .map(function (r) { return TEMP_FCROLL_bk_(r.year, r.company, r.country, r.marketplace, r.sku); });
    return TEMP_FCROLL_report_(o);
  }
  if (o.errored > 0) {
    o.verdict = 'STOP'; o.blocker = 'WRITER_REPORTED_ROW_ERRORS';
    o.row_errors = results.filter(function (r) { return r.status === 'error'; })
      .map(function (r) { return { sku: r.sku, year: r.year, message: r.message }; });
    return TEMP_FCROLL_report_(o);
  }

  // READBACK AFTER: every planned key exists exactly once, and its twelve months really are zero.
  var verify = TEMP_FCROLL_verify_(o.would_create);
  o.readback = verify;
  o.verdict = verify.ok ? 'COMMITTED_AND_VERIFIED' : 'STOP';
  if (!verify.ok) o.blocker = 'READBACK_VERIFICATION_FAILED';
  return TEMP_FCROLL_report_(o);
}

/** Read the table again and prove each planned key now exists exactly once with all twelve months at zero. */
function TEMP_FCROLL_verify_(planned) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('fc_regular_forecast');
  if (!sh) return { ok: false, reason: 'FC_REGULAR_FORECAST_SHEET_NOT_FOUND' };
  var vals = sh.getDataRange().getValues();
  var headers = (vals[0] || []).map(function (h) { return TEMP_FCROLL_str_(h).toLowerCase(); });
  var ix = {}; headers.forEach(function (h, i) { ix[h] = i; });
  var byKey = {};
  for (var r = 1; r < vals.length; r++) {
    var sk = TEMP_FCROLL_str_(vals[r][ix.sku]); if (!sk) continue;
    var k = TEMP_FCROLL_bk_(TEMP_FCROLL_str_(vals[r][ix.year]), TEMP_FCROLL_str_(vals[r][ix.company]),
      TEMP_FCROLL_str_(vals[r][ix.country]), TEMP_FCROLL_str_(vals[r][ix.marketplace]), sk);
    (byKey[k] = byKey[k] || []).push(r + 1);
  }
  var missing = [], duplicated = [], nonZero = [];
  (planned || []).forEach(function (w) {
    var hits = byKey[w.business_key] || [];
    if (!hits.length) { missing.push(w.business_key); return; }
    if (hits.length > 1) { duplicated.push({ key: w.business_key, rows: hits }); return; }
    var row = vals[hits[0] - 1];
    var bad = TEMP_FCROLL_MONTHS_.filter(function (m) { return Number(row[ix[m]]) !== 0; });
    if (bad.length) nonZero.push({ key: w.business_key, months: bad });
  });
  return { ok: !missing.length && !duplicated.length && !nonZero.length,
    verified: (planned || []).length - missing.length - duplicated.length - nonZero.length,
    missing: missing, duplicated: duplicated, non_zero_months: nonZero };
}
