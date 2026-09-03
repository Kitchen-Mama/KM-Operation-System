/**
 * ================================================================================================================
 * TEMP_FC_FORECAST_YEAR_ROLLOVER_CENSUS_FC1B_E3_R2 — F1-7N-FC-1B-E3-R2 §F
 * READ-ONLY forecast-basis census over EVERY active marketplace SKU. DB_WRITES = 0.
 * ----------------------------------------------------------------------------------------------------------------
 * WHY THIS EXISTS. E3-R1 established, by executing the predicate chain rather than reading it, that the weekly AI
 * Plan refuses with HARVEST_NOT_READY because the canonical harvest produces ZERO receivers: every site is dropped
 * with FORECAST_SHARE_INCOMPLETE because its §7 demand basis — all four of M+1..M+4 — is not fully covered in
 * `fc_regular_forecast`. For RECO-2026-09 that window is 2026-10, 2026-11, 2026-12 and 2027-01, and the fourth
 * month needs a row whose `year` is 2027. The live evidence names one scope (ResUS / US / Amazon / CO1100-R,
 * 2027 → NO_ROW_FOR_YEAR). One scope is not a census, so this counts all of them.
 *
 * THE CLASSIFICATION IS THE SHIPPED READER'S OWN, NOT A NEW ONE. `recoWsRegularForecastByMonth_` (42_) keeps a
 * month only when the matching rows carry EXACTLY ONE distinct finite value, so there are four distinct causes for
 * a month to be absent from its result and they need four different responses:
 *
 *   NO_ROW_FOR_YEAR          no row at all for that scope + `year`. This is the year-rollover gap.
 *   CELL_BLANK_OR_NON_NUMERIC  the row exists and that month's cell is blank or not a number.
 *   CONFLICTING_VALUES       two or more rows for one business key DISAGREE. Never auto-resolvable.
 *   OK                       exactly one distinct finite value.
 *
 * AND `EXPLICIT_ZERO` IS REPORTED SEPARATELY FROM ALL OF THEM. A month whose value is a real 0 SURVIVES the
 * shipped reader and is a complete basis (§F forbids merging it with blank or missing, and the allocator agrees:
 * 0 is a truthful forecast, absence is not). Counting them together is what would make a solved scope look broken
 * and a broken one look solved.
 *
 * WHAT THIS FILE MAY DO. Read `getDataRange().getValues()` and report. It obtains no write capability at all: no
 * appendRow, no setValue, no deleteRow, no getRange().set*, no handler call. It never invokes the allocator, the
 * generator, the persistence deps or the migration tool. Deleting it after the run changes nothing.
 *
 * NO CLOCK. `planningCycle` is a REQUIRED parameter. There is deliberately no "current cycle" default: deriving
 * the planning horizon from the execution time would make the census's answer depend on WHEN it ran, which is the
 * class of defect E3-R1 §B ruled out for `source_data_as_of` and the same reasoning applies here.
 *
 * RUN (Apps Script editor, this spreadsheet):
 *   RUN_FC_ROLLOVER_CENSUS_ONCE()                                  // RECO-2026-09, the live evidence's cycle
 *   RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS({ planningCycle: 'RECO-2026-09' })
 *   RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS({ planningCycle: 'RECO-2026-09', company: 'ResUS', country: 'US' })
 * ================================================================================================================
 */

var TEMP_FCR_CENSUS_BUILD_ = 'F1-7N-FC-1B-E3-R2';
var TEMP_FCR_MONTH_ABBR_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function TEMP_FCR_str_(v) { return String(v == null ? '' : v).trim(); }

/** Read one tab as { headers, rows } with lower-cased headers. READ ONLY. */
function TEMP_FCR_read_(ss, tab) {
  var sh = ss.getSheetByName(tab);
  if (!sh) return { ok: false, reason: 'SHEET_NOT_FOUND', tab: tab, headers: [], rows: [] };
  var vals = sh.getDataRange().getValues();
  if (!vals || !vals.length) return { ok: true, tab: tab, headers: [], rows: [] };
  var headers = vals[0].map(function (h) { return TEMP_FCR_str_(h).toLowerCase(); });
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var o = {};
    for (var c = 0; c < headers.length; c++) o[headers[c]] = vals[i][c];
    o.__row = i + 1;
    rows.push(o);
  }
  return { ok: true, tab: tab, headers: headers, rows: rows };
}

/**
 * The required demand-basis months for a planning cycle, taken from the FROZEN window owner (KMPCX) so the census
 * cannot disagree with the harvest about what a complete basis is. No fallback: if KMPCX is not loaded the census
 * says so and stops, rather than inventing a window of its own.
 */
function TEMP_FCR_requiredMonths_(planningCycle) {
  var pc = TEMP_FCR_str_(planningCycle);
  if (!/^RECO-\d{4}-\d{2}$/.test(pc)) return { ok: false, reason: 'PLANNING_CYCLE_MALFORMED', planningCycle: pc };
  var calcMonth = pc.slice(5);                                        // 'YYYY-MM'
  if (typeof KMPCX === 'undefined' || !KMPCX || typeof KMPCX._forecastWeightMonths !== 'function') {
    return { ok: false, reason: 'FORECAST_WINDOW_OWNER_UNAVAILABLE', planningCycle: pc };
  }
  var months = KMPCX._forecastWeightMonths(calcMonth);
  if (!months || months.length < 2) return { ok: false, reason: 'FORECAST_MONTHS_UNRESOLVED', planningCycle: pc };
  var years = {};
  months.forEach(function (ym) { years[ym.slice(0, 4)] = 1; });
  return { ok: true, planningCycle: pc, calculationMonth: calcMonth, months: months, years: Object.keys(years).sort() };
}

/**
 * One scope + SKU's per-month coverage, classified exactly as `recoWsRegularForecastByMonth_` would resolve it.
 * PURE over the rows handed in; reads nothing.
 */
function TEMP_FCR_coverage_(fcRows, scope, sku, months) {
  var perMonth = [], complete = true;
  var anyRowForScope = false, dupKeys = 0;
  months.forEach(function (ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym);
    var year = Number(m[1]), abbr = TEMP_FCR_MONTH_ABBR_[Number(m[2]) - 1];
    var matching = [], distinct = {}, blanks = 0;
    (fcRows || []).forEach(function (r) {
      if (TEMP_FCR_str_(r.company) !== scope.company || TEMP_FCR_str_(r.country) !== scope.country ||
          TEMP_FCR_str_(r.marketplace) !== scope.marketplace || TEMP_FCR_str_(r.sku) !== sku) return;
      anyRowForScope = true;
      if (Number(r.year) !== year) return;
      matching.push(r);
      var v = r[abbr];
      if (v === '' || v === null || v === undefined || !isFinite(Number(v))) { blanks++; return; }
      distinct[String(Number(v))] = Number(v);
    });
    var keys = Object.keys(distinct);
    var code, value = null;
    if (!matching.length) code = 'NO_ROW_FOR_YEAR';
    else if (keys.length > 1) { code = 'CONFLICTING_VALUES'; dupKeys++; }
    else if (!keys.length) code = 'CELL_BLANK_OR_NON_NUMERIC';
    else { value = distinct[keys[0]]; code = (value === 0) ? 'EXPLICIT_ZERO' : 'OK'; }
    if (code !== 'OK' && code !== 'EXPLICIT_ZERO') complete = false;
    perMonth.push({ month: ym, year: String(year), header: abbr, code: code, value: value,
      row_count: matching.length, blank_cell_count: blanks, distinct_value_count: keys.length,
      rows: matching.map(function (r) { return r.__row; }) });
  });
  return { complete: complete, perMonth: perMonth, anyRowForScope: anyRowForScope, conflictingMonths: dupKeys };
}

/**
 * §F — the census. READ-ONLY, DB_WRITES = 0.
 * params: { planningCycle (REQUIRED), company?, country?, marketplace?, sku?, maxScopeRows? }
 */
function RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS(params) {
  params = params || {};
  var out = { build: TEMP_FCR_CENSUS_BUILD_, section: 'F1-7N-FC-1B-E3-R2 §F', db_writes: 0,
    writer_constructed: false, allocator_called: false, verdict: 'STOP', blocker: '' };
  try {
    var win = TEMP_FCR_requiredMonths_(params.planningCycle);
    if (!win.ok) {
      out.blocker = win.reason;
      out.hint = 'Pass an explicit planning cycle, e.g. { planningCycle: "RECO-2026-09" }. There is no clock default by design.';
      return TEMP_FCR_report_(out);
    }
    out.planning_cycle = win.planningCycle;
    out.calculation_month = win.calculationMonth;
    out.required_month = win.months;                     // §F output field
    out.required_year = win.years;                       // §F output field

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mps = TEMP_FCR_read_(ss, 'marketplace_skus');
    var fcs = TEMP_FCR_read_(ss, 'fc_regular_forecast');
    out.tables_read = ['marketplace_skus', 'fc_regular_forecast'];
    if (!mps.ok) { out.blocker = 'MARKETPLACE_SKUS_UNAVAILABLE'; return TEMP_FCR_report_(out); }
    if (!fcs.ok) { out.blocker = 'FC_REGULAR_FORECAST_UNAVAILABLE'; return TEMP_FCR_report_(out); }
    out.fc_row_count = fcs.rows.length;
    out.fc_headers_present = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku']
      .concat(TEMP_FCR_MONTH_ABBR_).filter(function (h) { return fcs.headers.indexOf(h) !== -1; }).length;

    // ---- the universe: ACTIVE marketplace SKUs, de-duplicated on the forecast's own business key ------------
    var wantCo = TEMP_FCR_str_(params.company), wantCn = TEMP_FCR_str_(params.country);
    var wantMp = TEMP_FCR_str_(params.marketplace), wantSku = TEMP_FCR_str_(params.sku);
    var scopes = {}, inactive = 0, incompleteMapping = 0;
    mps.rows.forEach(function (r) {
      var status = TEMP_FCR_str_(r.marketplace_sku_status).toLowerCase();
      if (status && status !== 'active') { inactive++; return; }
      var co = TEMP_FCR_str_(r.company), cn = TEMP_FCR_str_(r.country);
      var mp = TEMP_FCR_str_(r.marketplace), sk = TEMP_FCR_str_(r.sku);
      if (!co || !cn || !mp || !sk) { incompleteMapping++; return; }
      if (wantCo && co !== wantCo) return;
      if (wantCn && cn !== wantCn) return;
      if (wantMp && mp !== wantMp) return;
      if (wantSku && sk !== wantSku) return;
      scopes[[co, cn, mp, sk].join('|')] = { company: co, country: cn, marketplace: mp, sku: sk };
    });
    var keys = Object.keys(scopes).sort();
    out.total_active_scopes = keys.length;                // §F output field
    out.inactive_marketplace_sku_rows = inactive;
    out.incomplete_marketplace_sku_mappings = incompleteMapping;
    if (!keys.length) { out.blocker = 'NO_ACTIVE_SCOPES_IN_FILTER'; return TEMP_FCR_report_(out); }

    // ---- per scope coverage --------------------------------------------------------------------------------
    var complete = 0, missingYearRow = 0, blankMonth = 0, conflicting = 0, explicitZero = 0;
    var blocked = [], affected = {}, byCode = {};
    var cap = Number(params.maxScopeRows) > 0 ? Number(params.maxScopeRows) : 400;
    keys.forEach(function (k) {
      var sc = scopes[k];
      var cov = TEMP_FCR_coverage_(fcs.rows, sc, sc.sku, win.months);
      var codes = {};
      cov.perMonth.forEach(function (pm) {
        byCode[pm.code] = (byCode[pm.code] || 0) + 1;
        codes[pm.code] = (codes[pm.code] || 0) + 1;
        if (pm.code === 'NO_ROW_FOR_YEAR') missingYearRow++;
        else if (pm.code === 'CELL_BLANK_OR_NON_NUMERIC') blankMonth++;
        else if (pm.code === 'CONFLICTING_VALUES') conflicting++;
        else if (pm.code === 'EXPLICIT_ZERO') explicitZero++;
      });
      if (cov.complete) { complete++; return; }
      affected[k] = 1;
      if (blocked.length < cap) {
        // The SUGGESTED ACTION is per cause, because the four causes have four different owners: a missing
        // year row is a rollover this repository can prepare, a blank cell and a conflict are decisions only
        // the forecast owner can make, and nothing here is auto-resolvable by the tool.
        var action = codes['CONFLICTING_VALUES'] ? 'STOP — two or more forecast rows for one business key disagree. Resolve the duplicate in fc_regular_forecast first; no tool may pick a winner.'
          : (codes['CELL_BLANK_OR_NON_NUMERIC'] ? 'The row exists and a required month cell is blank or non-numeric. The forecast owner must supply a value (an explicit 0 is a valid value).'
          : (codes['NO_ROW_FOR_YEAR'] ? 'A base row for the required year is missing. This is the year-rollover gap — see TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027 (DRY RUN by default).'
          : 'Incomplete basis with no classified cause; report this — it means the classifier missed a case.'));
        blocked.push({ company: sc.company, country: sc.country, marketplace: sc.marketplace, sku: sc.sku,
          has_any_forecast_row: cov.anyRowForScope, per_month: cov.perMonth, suggested_action: action });
      }
    });
    out.forecast_basis_complete = complete;               // §F output field
    out.forecast_basis_blocked = keys.length - complete;
    out.missing_year_row_count = missingYearRow;          // §F output field
    out.blank_month_count = blankMonth;                   // §F output field
    out.conflicting_row_count = conflicting;              // §F output field
    out.explicit_zero_month_count = explicitZero;         // NEVER folded into the three above (§F)
    out.per_month_code_totals = byCode;
    out.affected_company_country_marketplace_sku = Object.keys(affected).sort();   // §F output field
    out.blocked_scopes = blocked;
    out.blocked_scopes_truncated = (keys.length - complete) > blocked.length;
    out.suggested_action = conflicting ? 'STOP_CONFLICT_MUST_BE_RESOLVED_BY_OWNER'
      : (blankMonth ? 'FORECAST_OWNER_MUST_SUPPLY_BLANK_MONTHS'
      : (missingYearRow ? 'YEAR_ROLLOVER_BASE_ROWS_REQUIRED' : 'NONE'));

    out.verdict = (out.forecast_basis_blocked === 0) ? 'FORECAST_BASIS_COMPLETE'
      : (conflicting ? 'STOP' : 'REVIEW');
    out.blocker = (out.verdict === 'FORECAST_BASIS_COMPLETE') ? '' : out.suggested_action;
    return TEMP_FCR_report_(out);
  } catch (e) {
    out.verdict = 'STOP';
    out.blocker = 'CENSUS_THREW';
    out.error = (e && e.message) ? String(e.message) : String(e);
    return TEMP_FCR_report_(out);
  }
}

/**
 * ONE writer for EVERY exit, so an early return cannot be the exit that reported nothing — the defect E3-R1 §F
 * had to remove from the activation census. Serialises the whole result because a single BLOCKED line is not a
 * diagnosis.
 */
function TEMP_FCR_report_(out) {
  try {
    Logger.log('=== FC YEAR-ROLLOVER CENSUS ' + TEMP_FCR_CENSUS_BUILD_ + ' ===');
    Logger.log('verdict=' + out.verdict + '  blocker=' + (out.blocker || '(none)') + '  db_writes=' + out.db_writes);
    Logger.log('planning_cycle=' + (out.planning_cycle || '(unresolved)') +
      '  required_month=' + JSON.stringify(out.required_month || null) +
      '  required_year=' + JSON.stringify(out.required_year || null));
    Logger.log('total_active_scopes=' + out.total_active_scopes +
      '  forecast_basis_complete=' + out.forecast_basis_complete +
      '  blocked=' + out.forecast_basis_blocked);
    Logger.log('missing_year_row_count=' + out.missing_year_row_count +
      '  blank_month_count=' + out.blank_month_count +
      '  conflicting_row_count=' + out.conflicting_row_count +
      '  explicit_zero_month_count=' + out.explicit_zero_month_count);
    Logger.log('per_month_code_totals=' + JSON.stringify(out.per_month_code_totals || {}));
    Logger.log('suggested_action=' + (out.suggested_action || '(none)'));
    Logger.log('FULL: ' + JSON.stringify(out));
  } catch (e) { /* reporting must never change the answer */ }
  return out;
}

/** Zero-argument runner for the live evidence's cycle. Calls the census and nothing else. */
function RUN_FC_ROLLOVER_CENSUS_ONCE() {
  return RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS({ planningCycle: 'RECO-2026-09' });
}

/** The one blocked scope the live report names, so its four months can be read on their own. */
function RUN_FC_ROLLOVER_CENSUS_CO1100R() {
  return RUN_FC_FORECAST_YEAR_ROLLOVER_CENSUS({ planningCycle: 'RECO-2026-09',
    company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' });
}
