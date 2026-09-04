/**
 * TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs — F1-7N-FC-1B-E3 §F
 * PASTE · RUN · REMOVE. Read-only activation census for the Inventory AI Plan.
 * ================================================================================================================
 *
 * WHAT THIS IS FOR
 * ----------------
 * §E flips INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ to true, which lets a "Generate AI Plan" click reach the
 * canonical writer. This answers the question that has to be answered BEFORE that deployment is published:
 * for one named scope and one named SKU, what would the authoritative allocator actually produce, and does it
 * agree with what the E2 round reported? If it does not agree, activation STOPS — the flag is not the thing to
 * debug, the allocator inputs are.
 *
 * WHAT MAKES IT READ-ONLY (§F.1/§F.2/§F.3)
 * ----------------------------------------
 *   • DB_WRITES = 0. There is no write in this file: no appendRow, no setValue(s), no deleteRow, no insertRow,
 *     no clear, no SpreadsheetApp.flush, no Drive, no MailApp, no property/trigger mutation.
 *   • It never obtains a writer. `weeklyAiPlanPersistenceDeps_(ss)` — the function that hands out the atomic
 *     Header+Lines writer — is NOT called, and `weeklyAiPlanGenerateK2_` (the only path from a plan to a write)
 *     is NOT called. The plan builder it does call, KMWRR.buildK2GenerationPlan, is PURE: 61_ splits its own
 *     generation into a compute pass and a write pass precisely because of that, and this file is the compute
 *     pass and nothing else.
 *   • No Sheet object escapes a read helper. `CENSUS_rows_` opens the sheet, takes values, and returns rows —
 *     the caller never holds anything with a write method on it.
 *   • It reads through the SAME production read contract the real generation reads (§F.3): the same harvest, the
 *     same mapper, the same source-line builder, the same carrier authorities, the same allocated-line adapter
 *     and the same route allocator. A census that read its own way would be measuring a different system.
 *
 * NOTHING IS HARDCODED (§F.5)
 * ---------------------------
 * Company, country, marketplace, SKU and the expected route are ALL parameters. No CO1100-R, no ResUS, no
 * Amazon, no 520, no CN factory, no sea_express appears anywhere in this file or in production.
 *
 * HOW TO RUN
 * ----------
 *   1. Paste this file into the Apps Script project (any name; it shares the one global scope).
 *   2. Edit nothing. Call the single entry point from the editor, e.g.
 *
 *        TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({
 *          company: '<company>', country: '<country>', marketplace: '<marketplace>', sku: '<sku>',
 *          expect: { qty: <n>, method: '<service>', sourceWarehouseId: '<wh id>', destination: '<token>' }
 *        });
 *
 *      `expect` is OPTIONAL. Supplied, it turns the census into a go/no-go: the verdict is PROCEED only when
 *      the allocator's own output matches it (§F.6). Omitted, the verdict is REVIEW and a human compares.
 *   3. Read the Logger output (and the returned object).
 *   4. DELETE this file from the project. It is not part of the deployment.
 *
 * F1-7N-FC-1B-E3-R1 §F/§G — A REFUSAL NO LONGER TAKES THE DIAGNOSIS WITH IT.
 * ------------------------------------------------------------------------------------------
 * The first live run answered `verdict = STOP, blocker = HARVEST_NOT_READY` and then returned, so every field
 * that could have explained the refusal was undefined: the run that most needed to report reported the least.
 * It now collects everything that is SAFE to read either way and skips only the allocator — which is the
 * right boundary, because `mapped.request` is null when readiness failed, so KMWRB/KMWRR would be running on
 * nothing. It additionally reports the FORECAST-MONTH COVERAGE that decides whether a site survives at all,
 * per month, so "the row does not exist", "the cell is blank" and "two rows disagree" are three answers with
 * three different fixes; and the full source_data_as_of derivation, naming both authorities.
 *
 * WHAT IT REPORTS (§F.4)
 * ----------------------
 *   scope · planning cycle · Suggested Qty and gap for the SKU · source warehouse candidates · available
 *   factory stock · destination resolution · matched carrier cards · the ranked route result · Method ·
 *   lead time and ETA · total allocated quantity · ambiguity/refusal codes · active allocation drafts already
 *   stored for the scope · would_create route count · and an activation verdict.
 */

// §9 — THE CENSUS WAS REPORTING A BUILD IT NO LONGER WAS. Its behaviour changed in A2-R1-R1 (it learned to
// read the harvest REFUSAL) and again in A2-R1-R2 (route intent + identity preview) while this literal stayed
// at A2-R1, so a log could not be matched to the code that produced it. It moves with the file now.
var TEMP_E3_CENSUS_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R4';

/** Read-only row reader. The Sheet object stays inside this function — the caller gets values, never a writer. */
function CENSUS_rows_(ss, name) {
  try {
    var sh = ss.getSheetByName(name);
    if (!sh) return [];
    var v = sh.getDataRange().getValues();
    if (!v || v.length < 2) return [];
    var head = v[0].map(function (h) { return String(h == null ? '' : h).trim(); });
    var out = [];
    for (var r = 1; r < v.length; r++) {
      var o = {}, blank = true;
      for (var c = 0; c < head.length; c++) {
        if (!head[c]) continue;
        o[head[c]] = v[r][c];
        if (String(v[r][c] == null ? '' : v[r][c]).trim() !== '') blank = false;
      }
      if (!blank) out.push(o);
    }
    return out;
  } catch (e) { return []; }
}

/**
 * F1-7N-FC-1B-E3-R1 §B/§G — THE FORECAST-MONTH COVERAGE FOR ONE SKU. Read-only.
 *
 * This is the census's answer to the question the first live run could not answer. The weekly harvest builds a
 * KMAF receiver per site ONLY when the §7 demand basis is complete, which means all four of M+1..M+4 must
 * resolve to exactly one finite value each in `fc_regular_forecast`. Any month that is missing, blank, or
 * present TWICE WITH DIFFERENT VALUES is omitted by the canonical reader — and the site is then dropped
 * with FORECAST_SHARE_INCOMPLETE, silently before R1. With every site dropped the harvest yields ZERO
 * receivers, KMAF answers ready:false with an EMPTY issues array, and the only thing production could say was
 * a bare HARVEST_NOT_READY.
 *
 * Reported per month so "the row does not exist", "the cell is blank" and "two rows disagree" are three
 * different answers with three different fixes. It reads the canonical table and returns COUNTS AND FLAGS
 * only — never row content.
 */
function CENSUS_forecastCoverage_(ss, scope, sku, months) {
  var ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var rows = CENSUS_rows_(ss, 'fc_regular_forecast');
  var mine = rows.filter(function (r) {
    return CENSUS_low_(r.company) === CENSUS_low_(scope.company) &&
      CENSUS_low_(r.country) === CENSUS_low_(scope.country) &&
      CENSUS_low_(r.marketplace) === CENSUS_low_(scope.marketplace) &&
      (!sku || CENSUS_low_(r.sku) === CENSUS_low_(sku));
  });
  var per = (months || []).map(function (ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return { month: ym, status: 'BAD_MONTH_TOKEN' };
    var year = Number(m[1]), abbr = ABBR[Number(m[2]) - 1];
    var yearRows = mine.filter(function (r) { return Number(r.year) === year; });
    var distinct = {}, blanks = 0;
    yearRows.forEach(function (r) {
      var v = r[abbr];
      if (v === '' || v === null || v === undefined || !isFinite(Number(v))) { blanks++; return; }
      distinct[String(Number(v))] = 1;
    });
    var n = Object.keys(distinct).length;
    return {
      month: ym, year: year, header: abbr,
      rows_for_year: yearRows.length, blank_cells: blanks, distinct_values: n,
      // the canonical reader keeps a month ONLY when exactly one distinct finite value exists for it
      resolves: n === 1,
      status: yearRows.length === 0 ? 'NO_ROW_FOR_YEAR'
        : (n === 0 ? 'CELL_BLANK_OR_NON_NUMERIC'
        : (n > 1 ? 'CONFLICTING_VALUES' : 'OK'))
    };
  });
  var missing = per.filter(function (p) { return !p.resolves; });
  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R3 §9 — THE CENSUS WAS RESTATING A GATE PRODUCTION NO LONGER HAS.
  //
  // The block above counts a month as "missing" when no row exists for its year, when the cell is blank, or
  // when two rows disagree. That WAS the gate, and E3-R3-R1 deliberately changed it: KMFCN now normalizes a
  // missing row and a blank cell to ZERO (the system demonstrably looked and found nothing), and only a
  // CONFLICT or an unreadable table still blocks. Production adopted that; this function did not.
  //
  // So the live census printed `2027-01 NO_ROW_FOR_YEAR`, `FORECAST_SHARE_INCOMPLETE` and
  // `site_would_survive_forecast_gate: false` for a site that production carried through without complaint.
  // Two authorities, one table, opposite answers — and the diagnostic was the wrong one, which is the worst
  // way round, because it sends an operator to fix data that is already fine.
  //
  // The verdict is therefore taken from KMFCN itself rather than restated. The per-month observations are KEPT
  // (they are still the useful part: they say WHICH provenance each zero has), but they no longer decide
  // anything. When KMFCN is not in the deployment the answer is a typed unavailability, never the old rule.
  var kmfcn = null, normalized = null;
  try {
    if (typeof KMFCN !== 'undefined' && KMFCN && typeof KMFCN.normalizeWindow === 'function'
      && typeof weeklyAiPlanForecastReadContext_ === 'function') {
      var _ctx = weeklyAiPlanForecastReadContext_(ss);
      var _fcScope = { company: scope.company, country: scope.country, marketplace: scope.marketplace };
      normalized = KMFCN.normalizeWindow({ context: _ctx, scope: _fcScope, sku: sku, months: months || [],
        matchingRows: KMFCN.rowsForScope(rows, _fcScope, sku) });
      kmfcn = 'KMFCN';
    }
  } catch (eK) { normalized = null; kmfcn = 'KMFCN_THREW:' + CENSUS_str_(eK && eK.message); }
  var authoritative = !!(normalized && typeof normalized.ok === 'boolean');
  return {
    source_table: 'fc_regular_forecast',
    source_headers: 'company, country, marketplace, sku, year + the month column for each required month',
    required_months: months || [],
    scope_row_count: mine.length,
    per_month: per,
    // The raw observations, renamed so nothing reads them as a verdict any more.
    months_with_no_row_or_blank: missing.map(function (p) { return p.month; }),
    months_conflicting: per.filter(function (p) { return p.status === 'CONFLICTING_VALUES'; }).map(function (p) { return p.month; }),
    // ---- THE VERDICT, from the authority production uses -------------------------------------------------
    authority: kmfcn || 'FORECAST_NORMALIZATION_AUTHORITY_UNAVAILABLE',
    normalization: authoritative ? {
      ok: normalized.ok === true, reason: normalized.reason || null, basis: normalized.basis,
      missing_row_normalized_to_zero: (normalized.counters || {}).default_zero_missing_year_count,
      blank_normalized_to_zero: (normalized.counters || {}).default_zero_blank_count,
      explicit_zero: (normalized.counters || {}).explicit_zero_count,
      actual: (normalized.counters || {}).actual_count
    } : null,
    blocking: authoritative ? (normalized.ok !== true) : null,
    site_would_survive_forecast_gate: authoritative ? (normalized.ok === true) : null,
    verdict: authoritative
      ? (normalized.ok === true ? 'FORECAST_BASIS_NORMALIZED' : ('FORECAST_BASIS_UNRESOLVED:' + (normalized.reason || '')))
      : 'FORECAST_NORMALIZATION_AUTHORITY_UNAVAILABLE'
  };
}

/**
 * §B/§G — WHERE source_data_as_of COMES FROM, and which of the two authorities is which. Read-only.
 *
 * Executed finding: `harvest.sourceDataAsOf` is NOT a readiness predicate (a blank, a null and a real date all
 * produce mapped.ready:true, all else equal). It is populated ONLY from a site that SURVIVED, so a blank one is
 * a CO-SYMPTOM of the same zero-receiver drop rather than a cause of it. It does have a real downstream
 * consequence: weeklyAiPlanShipDate_ derives the ship date from it, so blank means no ship date for the lane.
 *
 * The value that is actually STORED on a generated header is a DIFFERENT authority: the GAP-INV run lineage's
 * calculationDate, resolved by the production weeklyAiPlanResolveGapRunLineage_, which BLOCKS with
 * LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE rather than storing a blank. Both are reported, neither is invented,
 * and no clock is read: there is no new Date(), no execution time, no spreadsheet modified time and no fallback
 * anywhere in this census.
 */
function CENSUS_sourceAsOfCandidates_(h, planningCycle) {
  var out = {
    harvest_source_data_as_of: CENSUS_str_(h && h.sourceDataAsOf),
    harvest_value_is_blank: !CENSUS_str_(h && h.sourceDataAsOf),
    // F1-7N-FC-1B-E3-R4-A2-R1-R3 §6/§9 — this text described the defect, and the defect is fixed. The
    // harvest no longer takes the cutoff from the first surviving workspace line; it takes it from the DONE
    // GAP-INV run lineage through weeklyAiPlanSourceDataAsOfAuthority_ and FAILS CLOSED without one. The
    // workspace value is still reported (as `workspace_source_data_as_of`) so a reader can see that it is
    // blank — but nothing depends on it any more, and this description must not keep saying it does.
    harvest_origin: 'GAP-INV run lineage calculationDate via weeklyAiPlanSourceDataAsOfAuthority_ ' +
      '(A2-R1-R3); the recommendation-workspace line value is a diagnostic only',
    consumed_by: 'weeklyAiPlanShipDate_ (ship date for the KMWRR lane) AND the header source_data_as_of — one authority for both',
    gap_run_lineage: null,
    stored_header_authority: 'weeklyAiPlanResolveGapRunLineage_().source_data_as_of (the GAP-INV run calculationDate)',
    fabrication_check: 'NO clock, NO execution time, NO spreadsheet modified time, NO fallback — a blank stays blank'
  };
  try {
    if (typeof weeklyAiPlanResolveGapRunLineage_ === 'function') {
      var lin = weeklyAiPlanResolveGapRunLineage_(planningCycle, h, { formulaVersion: 'WEEKLY_AI_PLAN_V1' });
      out.gap_run_lineage = lin && lin.ok
        ? { ok: true, run_id: CENSUS_str_(lin.run_id), source_data_as_of: CENSUS_str_(lin.source_data_as_of),
            calculated_at: CENSUS_str_(lin.calculated_at), planning_cycle: CENSUS_str_(lin.planning_cycle) }
        : { ok: false, reason: CENSUS_str_(lin && lin.reason) };
    } else {
      out.gap_run_lineage = { ok: false, reason: 'LINEAGE_RESOLVER_UNAVAILABLE_IN_THIS_DEPLOYMENT' };
    }
  } catch (e) {
    out.gap_run_lineage = { ok: false, reason: 'LINEAGE_RESOLVER_THREW: ' + CENSUS_str_(e && e.message) };
  }
  return out;
}

function CENSUS_str_(v) { return String(v == null ? '' : v).trim(); }
function CENSUS_num_(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function CENSUS_low_(v) { return CENSUS_str_(v).toLowerCase(); }

function CENSUS_log_(label, value) {
  try {
    Logger.log('[E3-CENSUS] ' + label + ': ' +
      (value && typeof value === 'object' ? JSON.stringify(value) : String(value)));
  } catch (e) {}
}

/**
 * THE SINGLE PUBLIC ENTRY POINT. Read-only. Returns the census; also writes it to the log.
 * @param {{company:string,country:string,marketplace:string,sku:string,expect:Object}} args
 */
function TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(args) {
  var t0 = Date.now();
  var out = {
    census: 'TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3',
    build: TEMP_E3_CENSUS_BUILD_,
    read_only: true, db_writes: 0, drive_writes: 0, status_transitions: 0, emails: 0,
    // the writer is not merely unused, it is never constructed — see the header note
    writer_constructed: false,
    ok: false, verdict: 'STOP', blockers: []
  };
  args = args || {};
  var company = CENSUS_str_(args.company), country = CENSUS_str_(args.country);
  var marketplace = CENSUS_str_(args.marketplace), sku = CENSUS_str_(args.sku);
  out.scope = { company: company, country: country, marketplace: marketplace, sku: sku };

  if (!company || !country || !marketplace) {
    out.blockers.push('SCOPE_INCOMPLETE: company, country and marketplace are all required (this census never ' +
      'defaults a scope, and never runs ALL_SITES)');
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }
  if (/^all(_sites)?$/i.test(marketplace)) {
    out.blockers.push('SCOPE_ALL_SITES_FORBIDDEN: a controlled census targets exactly one marketplace');
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  // ---- the effective flag, as the answering deployment reports it (never the repository's copy) -------------
  out.flag = {
    symbol: 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_',
    effective: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function')
      ? (inventoryAiPlanDbGenerationEnabled_() === true) : null,
    config_build: (typeof CONFIG_BUILD_VERSION_ !== 'undefined') ? CONFIG_BUILD_VERSION_ : null,
    note: 'the census is read-only and behaves identically either way; the flag is reported so the census result ' +
          'can be matched to the deployment it describes'
  };

  // ---- the production modules this census refuses to substitute for ----------------------------------------
  var need = [
    ['KMWHA', typeof KMWHA !== 'undefined' && KMWHA && typeof KMWHA.mapWeeklyHarvestToBatchRequest === 'function'],
    ['KMWRB', typeof KMWRB !== 'undefined' && KMWRB && typeof KMWRB.buildWeeklySourceLines === 'function'],
    ['KMWRR', typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.buildK2GenerationPlan === 'function'],
    ['weeklyAiPlanHarvest_', typeof weeklyAiPlanHarvest_ === 'function'],
    ['weeklyAiPlanReadCarrierAuthorities_', typeof weeklyAiPlanReadCarrierAuthorities_ === 'function'],
    ['weeklyAiPlanK2AllocatedLines_', typeof weeklyAiPlanK2AllocatedLines_ === 'function'],
    ['weeklyAiPlanShipDate_', typeof weeklyAiPlanShipDate_ === 'function'],
    ['prodExpectedDbId_', typeof prodExpectedDbId_ === 'function']
  ];
  var missing = need.filter(function (p) { return !p[1]; }).map(function (p) { return p[0]; });
  out.production_modules = { required: need.map(function (p) { return p[0]; }), missing: missing };
  if (missing.length) {
    out.blockers.push('PRODUCTION_READ_CONTRACT_UNAVAILABLE: ' + missing.join(', ') +
      ' — this census calls the production allocator or it reports nothing; it never approximates one');
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  var ss;
  try {
    ss = SpreadsheetApp.openById(prodExpectedDbId_());
    if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, prodExpectedDbId_());
  } catch (e) {
    out.blockers.push('DB_NOT_REACHABLE_OR_WRONG_TARGET: ' + CENSUS_str_(e && e.message));
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  // §3 (R4) — ESTABLISHED AS SOON AS THE DATABASE IS REACHABLE, AND NOT ONE LINE LATER.
  //
  // The parity used to be computed inside CENSUS_logAll_, so it appeared on every exit path by accident of
  // where it lived. Moving it into the census body put it after the verdict, and the early returns — the ones
  // that fire when the harvest is NOT ready — stopped reporting it at all. That is precisely the run on which
  // an operator most needs it: a mixed deployment is a likely reason the harvest failed.
  //
  // It depends on the live header row and nothing else: not the harvest, not the scope, not the allocator. So
  // it belongs here, above every early return, where it is a fact the whole rest of the census can gate on.
  out.schema_parity = (typeof CENSUS_schemaParity_ === 'function') ? CENSUS_schemaParity_() : null;

  // ---- planning cycle: the canonical one, resolved the way production resolves it --------------------------
  var planningCycle = '';
  try {
    var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
    if (ctx && ctx.ok) planningCycle = CENSUS_str_(ctx.planningCycle);
  } catch (e) {}
  out.planning_cycle = planningCycle;
  if (!planningCycle) {
    out.blockers.push('PLANNING_CYCLE_UNRESOLVED');
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }
  // The FOUR forecast months the §7 demand basis requires, from the canonical resolver (M+1..M+4 of the
  // cycle month). Not derived here and not guessed: KMPCX owns the window, and 61_ blocks a site whose basis
  // does not cover all four.
  var months = null;
  try {
    var _cm = planningCycle.slice(5);
    months = (typeof KMPCX !== 'undefined' && KMPCX && typeof KMPCX._forecastWeightMonths === 'function')
      ? KMPCX._forecastWeightMonths(_cm) : null;
  } catch (e) { months = null; }
  out.required_forecast_months = months || [];
  if (!months || months.length < 2) {
    out.blockers.push('FORECAST_MONTHS_UNRESOLVED: KMPCX._forecastWeightMonths did not resolve the M+1..M+4 ' +
      'window for ' + planningCycle + ' — the harvest fails closed on the same condition');
    out.next_blocked_stage = 'FORECAST_WINDOW';
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  // ---- harvest + map: the same two calls the generation makes ----------------------------------------------
  var h;
  try {
    // F1-7N-FC-1B-E3-R4-A2-R1-R3 §10 — THE CENSUS MUST ASK THE QUESTION PRODUCTION ASKS.
    //
    // This called the harvest WITHOUT the marketplace, so it computed the company/country universe while the
    // report it printed was headed with one site. From R3 the harvest isolates to the allowlist intersected
    // with the requested marketplace, so omitting it here would make the census and the generation compute
    // different inputs — which is the exact divergence §10 exists to forbid.
    h = weeklyAiPlanHarvest_(ss, { company: company, country: country, planningCycle: planningCycle,
      marketplace: marketplace });
  } catch (e) {
    out.blockers.push('HARVEST_THREW: ' + CENSUS_str_(e && e.message));
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }
  out.harvest = { ok: !!(h && h.ok), source_data_as_of: CENSUS_str_(h && h.sourceDataAsOf),
    warehouse_count: (function () { try { return Object.keys(h.warehousesById || {}).length; } catch (e) { return 0; } })(),
    // F1-7N-FC-1B-E3-R1 SECTNG - the counts and the per-site drop list the harvest used to discard. `site_count`
    // and `receiver_count` are the two numbers that turn "the universe came out empty" into "N sites were
    // enumerated and M survived", and `errors` names WHICH ones and WHY. `null` means this deployment predates
    // the fix, which is itself the answer.
    site_count: (h && h.site_count != null) ? h.site_count : null,
    receiver_count: (h && h.receiver_count != null) ? h.receiver_count : null,
    errors: (h && Array.isArray(h.errors)) ? h.errors : null,
    // ==========================================================================================================
    // F1-7N-FC-1B-E3-R4-A2-R1-R3 §9 — WHY THE LIVE LOG SAID freshness_state: null ON A DONE JOB.
    //
    // Not because the harvest did not know. A2-R1-R1 taught the log to read the freshness verdict out of the
    // harvest REFUSAL, and that fix was real — but on a SUCCESSFUL harvest the log reads `res.harvest`, and
    // `res.harvest` is THIS object: a hand-built summary with six fields. `snapshot_freshness`,
    // `accepted_snapshot_date`, `snapshot_distinct_dates`, `gap_schedule` and `forecast_normalization` were
    // all present on `h` and none of them was copied here, so every one of them logged as null on exactly
    // the runs that had succeeded. Same defect class as R1's discarded `kmaf.reason`, one layer out: the
    // answer was known and dropped at the boundary.
    //
    // They are carried through by name. A summary that silently omits fields its own consumer reads is not a
    // summary, it is a data loss.
    snapshot_freshness: (h && h.snapshot_freshness) || null,
    accepted_snapshot_date: (h && h.accepted_snapshot_date) || null,
    snapshot_distinct_dates: (h && h.snapshot_distinct_dates) || null,
    gap_schedule: (h && h.gap_schedule) || null,
    gap_job_state: (h && h.gap_job_state) || null,
    snapshot_date_normalization: (h && h.snapshot_date_normalization) || null,
    forecast_normalization: (h && h.forecast_normalization) || null,
    // §2/§6 — the two R3 authorities, reported so the census can be compared with production field by field.
    isolation: (h && h.isolation) || null,
    source_data_as_of_authority: (h && h.sourceDataAsOfAuthority) || null,
    workspace_source_data_as_of: (h && h.workspaceSourceDataAsOf) || null,
    gap_lineage: (h && h.gapLineage) || null };
  if (!h || !h.ok) {
    out.blockers.push('HARVEST_FAILED (fail-closed, exactly as the generation would)');
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  var mapped;
  try {
    mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
      planningCycle: planningCycle,
      businessScope: { company: company, country: country, marketplace: marketplace,
        source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined') ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : 'inventory_replenishment' },
      mode: 'MANUAL_REGENERATE', confirmRegenerateOverUserEdits: false,
      // No clock fallback, and the census's own header promises exactly that: when the canonical timestamp
      // helper is absent this stays BLANK rather than reading the execution time. The field is inert here
      // (nothing is written), and a census that invents a timestamp to look complete is the defect.
      actor: 'temp-e3-census', now: (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : '',
      sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
      factoryIdentityConfig: (typeof WEEKLY_AI_PLAN_FACTORY_IDENTITY_ !== 'undefined') ? WEEKLY_AI_PLAN_FACTORY_IDENTITY_ : null,
      warehousesById: h.warehousesById, kmaf: h.kmaf,
      horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku,
      // The harvest's own per-site drop list, exactly as 61_ passes it. Without this the census reports the
      // universe-level EFFECT (zero receivers) and not the site-level CAUSE, which is the half that names a
      // marketplace and a SKU.
      errors: Array.isArray(h.errors) ? h.errors : []
    });
  } catch (e) {
    out.blockers.push('MAP_THREW: ' + CENSUS_str_(e && e.message));
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }
  // ---- §G — THE FULL READINESS ANSWER, not a boolean. Every field the R1 mapper reports is carried
  // through: the reason, the typed issues, the non-blocking warnings, and every predicate with its true/false.
  out.mapped = {
    ready: !!(mapped && mapped.ready),
    reason: CENSUS_str_(mapped && mapped.reason),
    issues: (mapped && mapped.issues) || [],
    warnings: (mapped && mapped.warnings) || [],
    readiness_predicates: (mapped && mapped.predicates) || [],
    partial: !!(mapped && mapped.partial),
    failed_required_predicates: ((mapped && mapped.predicates) || [])
      .filter(function (p) { return p && p.required && !p.passed; })
      .map(function (p) { return p.name + ': ' + p.detail; }),
    missing_fields: ((mapped && mapped.issues) || []).map(function (i) { return CENSUS_str_(i && i.field); })
      .filter(function (x) { return !!x; }),
    // §G — the canonical field NAMES the mapper reads, so a name change is visible as a diagnosis and
    // not only as an empty result.
    mapped_field_names: ['planningCycle', 'businessScope.company', 'businessScope.country', 'sourceDataAsOf',
      'kmaf.receiverFacts', 'kmaf.planningFacts', 'kmaf.reason', 'kmaf.issues', 'horizonsByDemandRef',
      'poolsBySku', 'warehousesById', 'factoryIdentityConfig', 'errors']
  };
  // §B/§G — the timestamp derivation, both authorities, no fabrication.
  out.source_data_as_of_candidates = CENSUS_sourceAsOfCandidates_(h, planningCycle);
  // §G — the forecast coverage that decides whether a site survives at all. Read even when readiness
  // passed, because a PARTIAL run (some sites dropped, others kept) is the case nobody could see before R1.
  out.forecast_coverage = CENSUS_forecastCoverage_(ss, { company: company, country: country, marketplace: marketplace }, sku, months);

  // ---- §F.2 — A NOT-READY RESULT NO LONGER TAKES THE DIAGNOSIS WITH IT.
  //
  // Before R1 this returned immediately and every field below became undefined, so the one run that could have
  // explained the refusal reported the least. What follows is split: the SAFE read-only facts are collected
  // either way, and only the ALLOCATOR is skipped. That boundary is the point — `mapped.request` is null
  // when readiness failed, so KMWRB/KMWRR would be called on nothing, which is exactly the unsafe state
  // §G forbids.
  var notReady = !mapped || !mapped.ready;
  if (notReady) {
    out.blockers.push('HARVEST_NOT_READY: ' + (out.mapped.reason || 'canonical facts incomplete') +
      (out.mapped.missing_fields.length ? ' (field(s): ' + out.mapped.missing_fields.join(', ') + ')' : '') +
      ' — the generation refuses here too, with the same typed issues');
    out.next_blocked_stage = 'CANONICAL_READINESS';
    out.allocator_skipped_reason = 'READINESS_NOT_ESTABLISHED: mapped.request is null, so calling KMWRB / KMWRR ' +
      'would be running the allocator on nothing. Skipped deliberately, never with a substituted input.';
  }

  // ---- source lines → allocated lines → the requested marketplace only -------------------------------------
  var carriers = weeklyAiPlanReadCarrierAuthorities_(ss);
  var shipDate = notReady ? '' : weeklyAiPlanShipDate_(h);
  out.ship_date = shipDate;
  out.carrier_authorities = { rate_cards: (carriers.rateCards || []).length, lead_times: (carriers.leadTimes || []).length };

  var src = null, allocated = [], mine = [];
  if (!notReady) {
    src = KMWRB.buildWeeklySourceLines(mapped.request);
    out.source_lines = { ok: !!(src && src.ok), status: CENSUS_str_(src && src.status),
      reason: CENSUS_str_(src && src.reason), count: (src && src.lines ? src.lines.length : 0) };
    if (!src || !src.ok) {
      out.blockers.push('SOURCE_LINES_BLOCKED: ' + (out.source_lines.status || 'BLOCKED_INPUT'));
      out.next_blocked_stage = out.next_blocked_stage || 'SOURCE_LINES';
    } else {
      allocated = weeklyAiPlanK2AllocatedLines_(src.lines, h) || [];
      mine = allocated.filter(function (a) { return CENSUS_str_(a.marketplace) === marketplace; });
      out.allocated_lines = { scope_total: allocated.length, this_marketplace: mine.length };
      if (!mine.length) {
        out.blockers.push('REQUESTED_SCOPE_EMPTY: the marketplace produced no allocated lines (the generation ' +
          'fails closed with the same code — it never fans out to other marketplaces)');
        out.next_blocked_stage = out.next_blocked_stage || 'REQUESTED_SCOPE';
      }
    }
  } else {
    out.source_lines = { ok: false, status: 'NOT_ATTEMPTED', reason: 'readiness not established', count: 0 };
    out.allocated_lines = { scope_total: 0, this_marketplace: 0 };
  }

  // ---- the SKU under census: Suggested Qty, gap, sources, factory stock, destination ------------------------
  var skuLines = sku ? mine.filter(function (a) { return CENSUS_low_(a.sku) === CENSUS_low_(sku); }) : mine;
  out.sku_facts = {
    sku: sku, line_count: skuLines.length,
    suggested_qty_total: skuLines.reduce(function (s, a) { return s + CENSUS_num_(a.recommended_qty || a.planned_qty); }, 0),
    windows: skuLines.map(function (a) { return CENSUS_str_(a.window_code); }),
    required_by_dates: skuLines.map(function (a) { return CENSUS_str_(a.required_by_date); }),
    source_warehouse_candidates: (function () {
      var seen = {}, o = [];
      skuLines.forEach(function (a) {
        var id = CENSUS_str_(a.source_warehouse_id);
        if (!id || seen[id]) return;
        seen[id] = 1;
        var w = (h.warehousesById || {})[id] || null;
        o.push({ warehouse_id: id, warehouse_code: CENSUS_str_(w && (w.warehouse_code || w.code)),
          country: CENSUS_str_(w && w.country), multi_pool: a.source_multi_pool === true });
      });
      return o;
    })(),
    // §4/§9 — `weeklyAiPlanClassifyDestination_` returns `kind`, and this read `type`. So every census
    // printed a blank destination type beside a resolved marketplace, which reads like a half-resolved
    // destination and is not one. (`warehouse_id` blank for a MARKETPLACE destination is CORRECT: an FBA
    // destination is a LOGICAL node and the id belongs in destination_marketplace, never a fabricated FC.)
    destination_resolution: skuLines.map(function (a) {
      return { kind: CENSUS_str_(a.destination && a.destination.kind),
        matched_by: CENSUS_str_(a.destination && a.destination.matched_by),
        reason: CENSUS_str_(a.destination && a.destination.reason) || null,
        marketplace: CENSUS_str_(a.destination && a.destination.marketplace),
        warehouse_id: CENSUS_str_(a.destination && a.destination.warehouse_id),
        country: CENSUS_str_(a.destination && a.destination.country) };
    }),
    // §4 — which SIDE each source is on, from the warehouse master + the frozen factory identity config.
    source_roles: skuLines.map(function (a) {
      return { source_warehouse_id: CENSUS_str_(a.source_warehouse_id),
        role: CENSUS_str_(a.source_role) || null, role_reason: CENSUS_str_(a.source_role_reason) || null,
        allocated_qty: (a.source_allocated_qty == null ? null : a.source_allocated_qty),
        cartons: (a.source_cartons == null ? null : a.source_cartons),
        shipped_qty: CENSUS_num_(a.recommended_qty) };
    })
  };
  if (sku && !skuLines.length) {
    out.blockers.push('SKU_NOT_IN_SCOPE: the named SKU produced no allocated line for this marketplace');
  }

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R3 §5 — `factory_stock: []` NEXT TO `allocated_by_source: WH-TW-CN-FACTORY-YOUXIN`.
  //
  // Those two lines appeared in the same live log and only one of them was true. The reason was this filter:
  // the rows were narrowed to `source_warehouse_candidates`, which is derived from the lines that SURVIVED to
  // become allocated lines. The target SKU's line had blocked (multi-pool), so its candidate list was the 3PL
  // only, so every factory row was filtered out, and the census concluded there was no factory stock — while
  // the allocator, which had seen the same table, was allocating 460 units out of it.
  //
  // A diagnostic must never derive the INPUT it is checking from the OUTPUT of the thing it is checking. So
  // the eligible warehouses come from the authority production uses (gapOpReadSupplyPoolFacts_ → poolsBySku,
  // reached here as harvest.poolsBySku), the stock numbers come from the canonical table, and the requested /
  // allocated / remaining columns are reported per warehouse so the arithmetic is visible rather than implied.
  out.factory_stock = (function () {
    var rows = CENSUS_rows_(ss, 'factory_stock');
    var pools = ((h && h.poolsBySku && sku) ? (h.poolsBySku[sku] || {}) : {});
    var factoryPools = pools.factoryPools || [], overseasPools = pools.overseasSupplyPools || [];
    // What the allocator actually decided per source, from the allocated lines of THIS sku.
    var allocByWh = {};
    (skuLines || []).forEach(function (a) {
      var w = CENSUS_str_(a.source_warehouse_id);
      if (!w) return;
      allocByWh[w] = (allocByWh[w] || 0) + CENSUS_num_(a.recommended_qty);
    });
    var requested = (out.sku_facts && out.sku_facts.suggested_qty_total) || 0;
    function stockRow(wid) {
      var r = null;
      for (var i = 0; i < rows.length; i++) {
        if (CENSUS_str_(rows[i].warehouse_id) !== wid) continue;
        if (sku && CENSUS_low_(rows[i].master_sku || rows[i].sku) !== CENSUS_low_(sku)) continue;
        r = rows[i]; break;
      }
      if (!r) return { present_in_table: false, on_hand: null, reserved: null, available: null };
      var onHand = CENSUS_num_(r.quantity_on_hand != null ? r.quantity_on_hand
        : (r.on_hand_qty != null ? r.on_hand_qty : r.fac_current_stock));
      var reserved = CENSUS_num_(r.reserved_qty);
      return { present_in_table: true, on_hand: onHand, reserved: reserved,
        available: CENSUS_num_(r.available_qty != null ? r.available_qty : (onHand - reserved)) };
    }
    function describe(p, kind) {
      var wid = CENSUS_str_(p.warehouseId || p.warehouse_id);
      var w = (h && h.warehousesById) ? (h.warehousesById[wid] || null) : null;
      var role = (typeof weeklyAiPlanWarehouseRole_ === 'function' && h)
        ? weeklyAiPlanWarehouseRole_(wid, h.warehousesById || {},
            (typeof WEEKLY_AI_PLAN_FACTORY_IDENTITY_ !== 'undefined') ? WEEKLY_AI_PLAN_FACTORY_IDENTITY_ : {})
        : { role: null, reason: 'ROLE_AUTHORITY_UNAVAILABLE' };
      var st = stockRow(wid);
      var alloc = allocByWh[wid] || 0;
      return { pool_kind: kind, warehouse_id: wid, warehouse_code: CENSUS_str_(w && w.warehouse_code),
        country: CENSUS_str_(w && w.country), role: role.role || null, role_reason: role.reason || null,
        effective_supply_qty: CENSUS_num_(p.effectiveSupplyQty),
        on_hand: st.on_hand, reserved: st.reserved, available: st.available, present_in_table: st.present_in_table,
        requested_qty: requested, allocated_qty: alloc,
        remaining_qty: (st.available == null ? null : st.available - alloc) };
    }
    return {
      authority: 'gapOpReadSupplyPoolFacts_ → harvest.poolsBySku (the SAME input the allocator receives)',
      stock_table: 'factory_stock',
      requested_qty: requested,
      eligible_factory_warehouse_ids: factoryPools.map(function (p) { return CENSUS_str_(p.warehouseId); }),
      factory_pools: factoryPools.map(function (p) { return describe(p, 'FACTORY'); }),
      // The in-country pool is reported BESIDE the factory pools, never folded into them: the frozen
      // allocator runs it FIRST and the factory passes over its residual, so a report that omitted it could
      // not explain why the factory was asked for less than the full quantity.
      overseas_supply_pools: overseasPools.map(function (p) { return describe(p, 'THREE_PL_OR_OVERSEAS'); }),
      allocated_by_source: allocByWh,
      total_allocated: (function () { var t = 0; for (var k in allocByWh) if (allocByWh.hasOwnProperty(k)) t += allocByWh[k]; return t; })()
    };
  })();

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R3 §7 — `matched_carrier_cards: 0` AGAINST 294 CARDS, AND NOTHING TO ACT ON.
  //
  // The old block re-implemented the match by hand: `is_active` (a field the carrier schema does not use —
  // carrier rows carry a free-text `status`), a raw lowercase country compare with no wildcard rule, no
  // marketplace axis and no effective-date test. So its zero was not the transport's zero, and neither number
  // explained itself. It also took its origin countries from the surviving lines, so a blocked line produced
  // an empty origin set and therefore a vacuous match.
  //
  // The lane keys are now built from the SAME per-line source/destination the router derives from, and the
  // funnel is computed by weeklyAiPlanCarrierFunnel_, which uses KMRA's own normalize/axisOk/rateCardUsable
  // predicates. A diagnostic that cannot disagree with the transport is the only kind worth printing.
  out.carrier_lane_funnels = (function () {
    if (typeof weeklyAiPlanCarrierFunnel_ !== 'function') return 'CARRIER_FUNNEL_AUTHORITY_UNAVAILABLE';
    var asOf = (typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.dateToOrdinal === 'function' && shipDate)
      ? KMWRR.dateToOrdinal(shipDate) : null;
    var seen = {}, o = [];
    (skuLines || []).forEach(function (a) {
      var srcId = CENSUS_str_(a.source_warehouse_id);
      var srcWh = (h && h.warehousesById) ? (h.warehousesById[srcId] || null) : null;
      var d = a.destination || {};
      var q = { originCountry: CENSUS_str_(srcWh && srcWh.country),
        destinationCountry: CENSUS_str_(d.country),
        marketplace: CENSUS_low_(d.kind) === 'marketplace' ? CENSUS_str_(d.marketplace) : '' };
      var key = q.originCountry + '|' + q.destinationCountry + '|' + q.marketplace;
      if (seen[key]) return;
      seen[key] = 1;
      var f = weeklyAiPlanCarrierFunnel_(carriers.rateCards, q, asOf);
      f.for_source_warehouse_id = srcId;
      f.for_window_code = CENSUS_str_(a.window_code);
      f.ship_date = shipDate || null;
      o.push(f);
    });
    return o;
  })();
  // Kept under its historical name so an operator comparing two logs can still find the number, but it is now
  // the FINAL ELIGIBLE count from the shared authority rather than a private guess.
  out.matched_carrier_cards = (function () {
    var fs = out.carrier_lane_funnels;
    if (!fs || typeof fs === 'string') return null;
    return fs.reduce(function (n, f) { return n + (f.final_eligible || 0); }, 0);
  })();

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R4 §2/§7 — "NO CARRIER CARD" WAS A TRUE ANSWER TO HALF THE QUESTION.
  //
  // The funnel above measures carrier_rate_cards and reports NO_CARRIER_CARD_FOR_LANE, which reads as "add one
  // rate card and this lane works". It does not: carrier_rate_cards stores no transit days at all, and without
  // a carrier_lead_times row on the same lane the route refuses again with a DIFFERENT token
  // (ROUTE_AUTO_RANKING_INSUFFICIENT / NO_LEAD_TIME) pointing at a DIFFERENT table. Measured on a fixture with
  // the card added and the lead time withheld: still zero routes, still 760 unresolved.
  //
  // So readiness is asked over BOTH authorities at once, by the shared weeklyAiPlanCarrierReadiness_, and the
  // answer lists every field a person must supply per table. Nothing is written and no value is invented.
  // ==============================================================================================================
  out.carrier_readiness = (function () {
    if (typeof weeklyAiPlanCarrierReadiness_ !== 'function') return 'CARRIER_READINESS_AUTHORITY_UNAVAILABLE';
    var asOf = (typeof KMWRR !== 'undefined' && KMWRR && typeof KMWRR.dateToOrdinal === 'function' && shipDate)
      ? KMWRR.dateToOrdinal(shipDate) : null;
    var seen = {}, o = [];
    (skuLines || []).forEach(function (a) {
      var srcId = CENSUS_str_(a.source_warehouse_id);
      var srcWh = (h && h.warehousesById) ? (h.warehousesById[srcId] || null) : null;
      var d = a.destination || {};
      var q = { originCountry: CENSUS_str_(srcWh && srcWh.country),
        destinationCountry: CENSUS_str_(d.country),
        marketplace: CENSUS_low_(d.kind) === 'marketplace' ? CENSUS_str_(d.marketplace) : '' };
      var key = q.originCountry + '|' + q.destinationCountry + '|' + q.marketplace;
      if (seen[key]) return;
      seen[key] = 1;
      var r = weeklyAiPlanCarrierReadiness_(carriers.rateCards, carriers.leadTimes, q, asOf);
      r.for_source_warehouse_id = srcId;
      r.for_window_code = CENSUS_str_(a.window_code);
      r.ship_date = shipDate || null;
      o.push(r);
    });
    return o;
  })();
  out.carrier_master_data_ready = (function () {
    var rs = out.carrier_readiness;
    if (!rs || typeof rs === 'string' || !rs.length) return null;
    return rs.every(function (r) { return r.ready === true; });
  })();
  out.carrier_lane_key = (function () {
    var rs = out.carrier_readiness;
    if (!rs || typeof rs === 'string') return null;
    return rs.map(function (r) { return r.lane_key; });
  })();
  out.carrier_missing_fields = (function () {
    var rs = out.carrier_readiness;
    if (!rs || typeof rs === 'string') return [];
    var o = [];
    rs.forEach(function (r) { (r.missing_fields || []).forEach(function (m) { o.push({ lane_key: r.lane_key, table: m.table, created_by: m.created_by, fields: m.fields }); }); });
    return o;
  })();

  // ---- THE RANKED ROUTE. The production allocator, called exactly as the generation calls it. --------------
  // PURE by contract: 61_ computes every group with this call in a pass that writes nothing, then writes in a
  // second pass. This file is that first pass, and there is no second one here.
  //
  // §G — NOT CALLED IN AN UNSAFE STATE. When readiness was not established there is no request, no
  // source lines and no allocated lines; calling the allocator on an empty or substituted input would produce a
  // number that looks like an answer. Everything above this point was still collected.
  if (notReady || !mine.length) {
    out.allocator = { group_count: 0, conserved: false, conservation: null, refusals: [], routes: [],
      skipped: true, skipped_reason: out.allocator_skipped_reason ||
        'NO_ALLOCATED_LINES_FOR_THE_REQUESTED_MARKETPLACE: nothing to rank, and no input is substituted' };
    out.total_allocated_quantity = 0;
    out.would_create_route_count = 0;
    out.active_allocation_drafts = CENSUS_activeDrafts_(ss, company, country, marketplace);
    out.next_blocked_stage = out.next_blocked_stage || 'ALLOCATOR';
    out.verdict = 'STOP';
    out.elapsed_ms = Date.now() - t0;
    CENSUS_logAll_(out);
    return out;
  }
  var plan;
  try {
    plan = KMWRR.buildK2GenerationPlan({
      scope: { planning_cycle: planningCycle, company: company, country: country, marketplace: marketplace,
        source_page: (mapped.request.businessScope && mapped.request.businessScope.source_page) || 'inventory_replenishment' },
      allocatedLines: mine, warehousesById: h.warehousesById,
      rateCards: carriers.rateCards, leadTimes: carriers.leadTimes, shipDate: shipDate,
      authorizedBySkuWindow: (function () {
        var a = {};
        mine.forEach(function (x) {
          var k = CENSUS_low_(x.sku) + '|' + CENSUS_low_(x.window_code);
          a[k] = (a[k] || 0) + CENSUS_num_(x.planned_qty);
        });
        return a;
      })(),
      sourceCeilingById: {}
    });
  } catch (e) {
    out.blockers.push('ALLOCATOR_THREW: ' + CENSUS_str_(e && e.message));
    out.elapsed_ms = Date.now() - t0; CENSUS_logAll_(out); return out;
  }

  var groups = (plan && plan.groups) || [];
  var blocked = (plan && plan.blocked) || [];
  out.allocator = {
    group_count: groups.length,
    conserved: !!(plan && plan.conservation && plan.conservation.conserved),
    conservation: (plan && plan.conservation) || null,
    // §F.4 — ambiguity and refusal codes, verbatim. A tie is a REFUSAL in this allocator, not a coin flip, and
    // that is exactly the property activation depends on: it never picks the first row.
    refusals: blocked.map(function (b) { return b && b.block; }),
    routes: []
  };
  groups.forEach(function (g) {
    var head = (g && g.header) || {};
    var lines = (g && g.lines) || [];
    // F1-7N-FC-1B-E3-R4-A2-R1-R4 §4 — THIS CENSUS COULD NEVER HAVE RETURNED PROCEED.
    //
    // It read the arrival date, the transit days and the cost off the HEADER. buildGroupHeader emits none of
    // them, and correctly so: `expected_arrival` is a LINE field in the canonical model and 16_ adopts it only
    // when a save supplies one, so the header has no business carrying an AI-computed date. The plan resolved
    // all three (measured: a 4-day TRUCK lead time and a 2026-09-08 arrival on the authorized-card fixture)
    // and had nowhere to hand them over, so this block printed blank/null every time.
    //
    // That was not only a display gap. The PROCEED gate below refuses when `expected_arrival` is empty, which
    // means a correct, fully routed, conserved plan was going to be STOPPED for a field the census was
    // reading from the wrong object. KMWRR now carries the resolved values as GROUP EVIDENCE beside the
    // exact-30 lines, and they are read from there.
    var evd = (g && g.route_evidence) || {};
    var mineLines = sku ? lines.filter(function (l) { return CENSUS_low_(l.master_sku || l.sku) === CENSUS_low_(sku); }) : lines;
    if (sku && !mineLines.length) return;
    // §9 — KMWRR.buildGroupHeader emits `recommended_source_warehouse_id` and
    // `recommended_destination_warehouse_id`; this read `source_warehouse_id` and `destination_type`, neither
    // of which exists on a K2 header. So every census printed a BLANK route source next to a populated
    // conservation total, which is the other half of the contradiction §4 was asked to explain. The
    // historical key names are kept in the output (an operator compares logs across rounds) and are now read
    // from the fields that exist.
    out.allocator.routes.push({
      group_no: head.recommendation_group_no,
      source_warehouse_id: CENSUS_str_(head.recommended_source_warehouse_id),
      destination_type: CENSUS_str_(head.destination_marketplace) ? 'MARKETPLACE'
        : (CENSUS_str_(head.recommended_destination_warehouse_id) ? 'WAREHOUSE' : ''),
      destination: CENSUS_str_(head.destination_marketplace || head.recommended_destination_warehouse_id),
      method: CENSUS_str_(head.recommended_shipping_method),
      last_mile: CENSUS_str_(head.recommended_last_mile_delivery),
      expected_arrival: CENSUS_str_(evd.expected_arrival),
      // § F.4 has asked for this since E3 and it read `head.transit_days`, which no K2 header carries. It is the
      // number the ranking used, and it now travels with the route rather than being re-derived or left null.
      lead_time_days: evd.transit_days != null ? CENSUS_num_(evd.transit_days) : null,
      estimated_cost: evd.estimated_cost != null ? CENSUS_num_(evd.estimated_cost) : null,
      currency: CENSUS_str_(evd.currency),
      route_candidate_status: CENSUS_str_(evd.route_candidate_status),
      route_evidence_uniform: evd.evidence_uniform === undefined ? null : (evd.evidence_uniform === true),
      line_count: mineLines.length,
      total_qty: mineLines.reduce(function (s, l) { return s + CENSUS_num_(l.recommended_qty); }, 0)
    });
  });
  out.total_allocated_quantity = out.allocator.routes.reduce(function (s, r) { return s + r.total_qty; }, 0);
  out.would_create_route_count = out.allocator.routes.length;

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R4 §4 — THE REPORT THAT SAID `conserved: true` ABOUT 760 UNROUTED UNITS.
  //
  // The live census printed: suggested 760 · supply allocated 760 · emitted route quantity 0 · route count 0 ·
  // conserved TRUE · production_parity.blockers [] · verdict STOP. Each field was correct in isolation and the
  // set was unreadable, because `conserved` answers a SAFETY question (did anything take more than it was
  // authorized?) and was being read as a COMPLETENESS one (is the demand planned?).
  //
  // KMWRR now answers the three separately and this census reports its answer rather than deriving its own —
  // one authority, so the census and a live generation can never disagree about whether 760 units were routed.
  // The historical `total_quantity` / `conserved` keys are kept so an operator can still compare logs across
  // rounds, and each now sits beside the verdict that says what it means.
  // ==============================================================================================================
  out.completeness = (function () {
    var c = (plan && plan.completeness) || null;
    if (!c) return { authority: 'KMWRR_COMPLETENESS_UNAVAILABLE', authorized_quantity: null,
      supply_allocated_quantity: null, emitted_route_quantity: null, unresolved_quantity: null,
      supply_allocation_conserved: null, route_quantity_conserved: null, fully_routable: null, blockers: [] };
    return { authority: 'KMWRR.buildK2GenerationPlan().completeness (the SAME object a live generation gets)',
      authorized_quantity: c.authorized_quantity,
      supply_allocated_quantity: c.supply_allocated_quantity,
      emitted_route_quantity: c.emitted_route_quantity,
      unresolved_quantity: c.unresolved_quantity,
      route_count: c.route_count, blocked_line_count: c.blocked_line_count,
      unrouted_sku_window_keys: c.unrouted_sku_window_keys || [],
      supply_allocation_conserved: c.supply_allocation_conserved,
      route_quantity_conserved: c.route_quantity_conserved,
      fully_routable: c.fully_routable,
      blockers: c.blockers || [], blocker_tokens: c.blocker_tokens || [] };
  })();
  out.authorized_quantity = out.completeness.authorized_quantity;
  out.supply_allocated_quantity = out.completeness.supply_allocated_quantity;
  out.emitted_route_quantity = out.completeness.emitted_route_quantity;
  out.unresolved_quantity = out.completeness.unresolved_quantity;
  out.supply_allocation_conserved = out.completeness.supply_allocation_conserved;
  out.route_quantity_conserved = out.completeness.route_quantity_conserved;
  out.fully_routable = out.completeness.fully_routable;
  // The route blockers, plus the carrier master-data finding, as the flat token list an operator reads first.
  out.route_blockers = (function () {
    var toks = (out.completeness.blocker_tokens || []).slice();
    if (out.carrier_master_data_ready === false && toks.indexOf('USER_MASTER_DATA_REQUIRED') === -1) {
      toks.push('USER_MASTER_DATA_REQUIRED');
    }
    return toks;
  })();

  // ==============================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R3 §10 — THE PARITY BLOCK.
  //
  // Every field a production generation decides, stated in one place, so "the census and the run agree" is a
  // COMPARISON rather than a hope. This census is the production first pass by construction (it calls
  // weeklyAiPlanHarvest_, KMWRB.buildWeeklySourceLines and KMWRR.buildK2GenerationPlan, which is exactly what
  // PASS 1 of weeklyAiPlanGenerateK2_ calls), so parity is asserted by the regression suite against the real
  // generation core with its writer replaced by a spy.
  //
  // It deliberately does NOT call the generation itself. Constructing the writer here — even to throw it away
  // — would put a live write one typo from a diagnostic, and a standing mutation test fails if this file ever
  // reaches for handleUpsertShippingAllocationDraftAtomic_.
  out.production_parity = {
    contract: 'the fields a production generation decides; compared against the real core in the R3 suite',
    writer_constructed: false,
    target_sku_set: (function () { var o = {}, l = []; (mine || []).forEach(function (a) { var k = CENSUS_str_(a.sku); if (k && !o[k]) { o[k] = 1; l.push(k); } }); return l.sort(); })(),
    demand_identity: (h && h.isolation) ? {
      target_scopes: h.isolation.target_scopes, requested_marketplace: h.isolation.requested_marketplace,
      universe_site_count: h.isolation.universe_site_count,
      target_site_count: h.isolation.target_site_count, target_sku_count: h.isolation.target_sku_count,
      foreign_site_count: h.isolation.foreign_site_count, foreign_sku_count: h.isolation.foreign_sku_count,
      canonical_demand_count: h.isolation.canonical_demand_count,
      collapsed_site_count: h.isolation.collapsed_site_count
    } : null,
    source_line_count: (src && src.lines) ? src.lines.length : null,
    allocated_line_count: (mine || []).length,
    allocated_line_diagnostics: (allocated && allocated.diagnostics) || null,
    eligible_factory_stock: (out.factory_stock && out.factory_stock.eligible_factory_warehouse_ids) || null,
    source_data_as_of: CENSUS_str_(h && h.sourceDataAsOf),
    source_data_as_of_authority: (h && h.sourceDataAsOfAuthority) || null,
    ship_date: shipDate || null,
    carrier_lane_final_eligible: out.matched_carrier_cards,
    chosen_methods: out.allocator.routes.map(function (r) { return r.method; }).sort(),
    // §4 — kept under their historical names, and no longer alone. `total_quantity` is the EMITTED route
    // total and `conserved` is the SAFETY verdict; on the live fixture those are 0 and true, which is exactly
    // the pair that read as a finished plan. The three verdicts state what each one is not.
    total_quantity: out.total_allocated_quantity,
    conserved: out.allocator.conserved,
    authorized_quantity: out.authorized_quantity,
    supply_allocated_quantity: out.supply_allocated_quantity,
    emitted_route_quantity: out.emitted_route_quantity,
    unresolved_quantity: out.unresolved_quantity,
    supply_allocation_conserved: out.supply_allocation_conserved,
    route_quantity_conserved: out.route_quantity_conserved,
    fully_routable: out.fully_routable,
    carrier_master_data_ready: out.carrier_master_data_ready,
    carrier_lane_key: out.carrier_lane_key,
    duplicate_sku_window_in_group: (out.allocator.conservation && out.allocator.conservation.duplicate_sku_window_in_group) || [],
    route_count: out.would_create_route_count,
    route_intent: (typeof SAD_AI_K2_INTENT_ !== 'undefined') ? SAD_AI_K2_INTENT_ : null,
    refusals: out.allocator.refusals,
    // §4 — THIS LINE RAN BEFORE THE ROUTE VERDICT EXISTED.
    //
    // `out.blockers.slice()` took a snapshot at THIS point in the function, and NO_COMPLETE_ROUTE is pushed
    // forty lines further down. So on the live run the outer verdict was STOP with one blocker and
    // production_parity reported `blockers: []` — the parity block, the one thing a reader consults to
    // compare the census with a real generation, said the run had nothing wrong with it.
    //
    // It is assembled after the verdict instead (see `production_parity.blockers` below), which is the only
    // ordering in which it can contain the route findings. Set to null here so a partial return can never be
    // mistaken for "no blockers".
    blockers: null
  };

  // ---- what is ALREADY stored for this scope (so "would_create" is read against reality) -------------------
  out.active_allocation_drafts = CENSUS_activeDrafts_(ss, company, country, marketplace);

  // ---- §F.6 — THE VERDICT. PROCEED only against a supplied expectation that the allocator actually meets. --
  var exp = args.expect;
  out.expectation = exp || null;
  if (out.blockers.length) {
    out.verdict = 'STOP';
  } else if (!out.allocator.routes.length) {
    out.verdict = 'STOP';
    // §7 — WHEN THE ONLY THING MISSING IS MASTER DATA, SAY SO BY NAME.
    //
    // `NO_COMPLETE_ROUTE` is true and tells an operator nothing about what to do next. When every code gate
    // has passed and the single remaining fact is that a lane has no carrier authority, the blocker is a DATA
    // task with a named owner, and the census says which fields and in which table. It still STOPS —
    // fail-closed is the correct behaviour and §5 forbids routing around it — but it stops with an action.
    if (out.carrier_master_data_ready === false) {
      out.blockers.push('USER_MASTER_DATA_REQUIRED: every code gate passed and the demand cannot be routed '
        + 'because the lane has no carrier authority. Unresolved ' + out.unresolved_quantity + ' units on '
        + JSON.stringify(out.carrier_lane_key) + '. Missing: '
        + (out.carrier_readiness && out.carrier_readiness.length
            ? out.carrier_readiness.map(function (r) { return r.lane_key + ' -> ' + (r.missing || []).join('+'); }).join(' ; ')
            : '(unknown)')
        + '. Read `carrier_missing_fields` for the exact fields, and NOTE that carrier_lead_times has no '
        + 'generic write handler — that row is entered directly in the tab. No value may be invented.');
      out.blockers.push('NO_COMPLETE_ROUTE: ' + out.unresolved_quantity + ' of '
        + out.authorized_quantity + ' authorized units reached no route. Typed reasons: '
        + (out.route_blockers || []).join(', ') + '.');
    } else {
      out.blockers.push('NO_COMPLETE_ROUTE: the allocator produced no route for this SKU. Activation must not ' +
        'proceed on the assumption that a route exists — read `allocator.refusals` for the typed reason.');
    }
  } else if (!exp) {
    out.verdict = 'REVIEW';
    out.ok = true;
    out.note = 'no `expect` supplied, so this census reports and does not judge. Compare the route above with ' +
      'the one the previous round reported before publishing the activation deployment.';
  } else {
    var r0 = out.allocator.routes[0];
    var diffs = [];
    if (exp.qty != null && CENSUS_num_(exp.qty) !== r0.total_qty) diffs.push('qty: expected ' + exp.qty + ', allocator says ' + r0.total_qty);
    if (CENSUS_str_(exp.method) && CENSUS_low_(exp.method) !== CENSUS_low_(r0.method)) diffs.push('method: expected ' + exp.method + ', allocator says ' + (r0.method || '(none)'));
    if (CENSUS_str_(exp.sourceWarehouseId) && CENSUS_low_(exp.sourceWarehouseId) !== CENSUS_low_(r0.source_warehouse_id)) diffs.push('source: expected ' + exp.sourceWarehouseId + ', allocator says ' + (r0.source_warehouse_id || '(none)'));
    if (CENSUS_str_(exp.destination) && CENSUS_low_(exp.destination) !== CENSUS_low_(r0.destination)) diffs.push('destination: expected ' + exp.destination + ', allocator says ' + (r0.destination || '(none)'));
    if (!r0.method) diffs.push('method is EMPTY — an incomplete route must never be materialized');
    if (!r0.expected_arrival) diffs.push('expected_arrival is EMPTY — no lead time resolved for this lane');
    if (!out.allocator.conserved) diffs.push('conservation NOT conserved — the allocated quantity does not match the authorized quantity');
    out.differences = diffs;
    out.verdict = diffs.length ? 'STOP' : 'PROCEED';
    out.ok = !diffs.length;
    if (diffs.length) {
      out.blockers.push('ALLOCATOR_DISAGREES_WITH_EXPECTATION: activation STOPS. ' + diffs.join(' · '));
    }
  }

  // §4/§7 — assembled HERE, after the verdict, so the route findings are actually in it.
  out.production_parity.blockers = out.blockers.slice();
  out.production_parity.route_blockers = (out.route_blockers || []).slice();
  // §7 — "the only thing left is master data" is a CLAIM, so the gates it rests on are listed with their
  // observed values. A reader can check each one rather than take the summary on trust.
  out.gates_passed = {
    scope_isolated: !!(h && h.isolation && h.isolation.foreign_site_count === 0),
    harvest_ready: !!(out.mapped && out.mapped.ready),
    forecast_not_blocking: !!(out.forecast_coverage && out.forecast_coverage.blocking === false),
    snapshot_accepted: CENSUS_str_(h && h.sourceDataAsOf) !== '',
    // The authority object is CONSTRUCTED only on the resolved path (61_ returns it after checking its own
    // `ok`), so it carries no `ok` field of its own — reading one asserted a shape that does not exist and
    // reported a false failure on a healthy run. The gate reads the two facts the object actually makes:
    // which GAP-INV run dated this harvest, and the date it resolved to.
    gap_lineage_resolved: !!(h && h.sourceDataAsOfAuthority
      && CENSUS_str_(h.sourceDataAsOfAuthority.run_id) !== ''
      && CENSUS_str_(h.sourceDataAsOfAuthority.date) !== ''),
    source_lines_built: !!(out.source_lines && out.source_lines.ok),
    allocated_lines_present: (out.production_parity.allocated_line_count || 0) > 0,
    destination_resolved: !!(out.sku_facts && (out.sku_facts.destination_resolution || []).length
      && (out.sku_facts.destination_resolution || []).every(function (d) { return CENSUS_str_(d.kind || d.destination_kind) !== ''; })),
    supply_allocation_conserved: out.supply_allocation_conserved === true,
    schema_parity: (out.schema_parity == null) ? null : (out.schema_parity.agree === true),
    carrier_master_data_ready: out.carrier_master_data_ready,
    route_quantity_conserved: out.route_quantity_conserved,
    fully_routable: out.fully_routable
  };
  out.first_failing_predicate = (function () {
    var order = ['scope_isolated', 'harvest_ready', 'forecast_not_blocking', 'snapshot_accepted',
      'gap_lineage_resolved', 'source_lines_built', 'allocated_lines_present', 'destination_resolved',
      'supply_allocation_conserved', 'carrier_master_data_ready', 'route_quantity_conserved', 'fully_routable'];
    for (var i = 0; i < order.length; i++) {
      if (out.gates_passed[order[i]] === false) return order[i];
    }
    return null;
  })();
  out.elapsed_ms = Date.now() - t0;
  CENSUS_logAll_(out);
  return out;
}

/** Read-only: the ACTIVE allocation draft headers already stored for this scope. Identity fields only. */
function CENSUS_activeDrafts_(ss, company, country, marketplace) {
  var rows = CENSUS_rows_(ss, 'shipping_allocation_drafts'), o = [];
  rows.forEach(function (r) {
    if (CENSUS_low_(r.status) !== 'active') return;
    if (company && CENSUS_low_(r.company) !== CENSUS_low_(company)) return;
    if (country && CENSUS_low_(r.country) !== CENSUS_low_(country)) return;
    if (marketplace && CENSUS_str_(r.destination_marketplace) && CENSUS_low_(r.destination_marketplace) !== CENSUS_low_(marketplace)) return;
    o.push({ allocation_draft_id: CENSUS_str_(r.allocation_draft_id),
      source_warehouse_id: CENSUS_str_(r.source_warehouse_id),
      destination: CENSUS_str_(r.destination_marketplace || r.destination_warehouse_id),
      method: CENSUS_str_(r.recommended_shipping_method),
      planning_cycle: CENSUS_str_(r.planning_cycle),
      generation_run_id: CENSUS_str_(r.generation_run_id) });
  });
  return o;
}

/**
 * §G — ONE log writer, used by EVERY exit that has facts to report. Before R1 the log block sat at the
 * very bottom of the function, so the twelve early returns logged a single BLOCKED line and nothing else —
 * a run that refused reported less than a run that succeeded, which is backwards.
 */
// F1-7N-FC-1B-E3-R4-A2-R1-R4 §3 — LIFTED OUT OF THE LOGGER.
//
// This computation lived inside CENSUS_logAll_, which runs after the verdict, so the parity was a line printed
// at the end rather than a fact the census held. Nothing could gate on it: reading it from the gate list
// produced null on every run, healthy or not. A verdict input must be established before the verdict.
function CENSUS_schemaParity_() {
  var _ds = null, _dsSheet = null;
  try { _dsSheet = SpreadsheetApp.openById(prodExpectedDbId_()).getSheetByName('shipping_allocation_drafts'); } catch (eD1) { _dsSheet = null; }
  if (!(_dsSheet && typeof sadLiveHeaderNames_ === 'function' && typeof sadResolveHeaderSchema_ === 'function')) return null;
  try { _ds = sadResolveHeaderSchema_(sadLiveHeaderNames_(_dsSheet)); } catch (eD2) { return null; }
  try {
  // ==========================================================================================================
  // F1-7N-FC-1B-E3-R4-A2-R1-R4 §3 — THE DISAGREEMENT NAMED A CAUSE IT HAD NOT MEASURED.
  //
  // R3 fixed the predicate (a null lifecycle version is a disagreement, and it is) and then labelled the
  // result `LIFECYCLE_RESOLVED_NO_VERSION_LIFECYCLE_COLUMNS_INCOMPLETE`. The live log printed that token
  // beside `lifecycle_complete: true`, so the report contradicted itself in adjacent fields, and the token
  // sent the reader to look for missing columns on a sheet that has all of them.
  //
  // WHAT THE REPOSITORY ACTUALLY DOES, measured offline over the real header constants before this block was
  // touched: at 34, 35 and 36 columns the writer and the lifecycle BOTH resolve, and both name the SAME
  // version (FB4C-AI-LIFECYCLE-1, FB4F-B4-ROUTE-IDENTITY-1, FB4G-A2R3-CREATE-IDEMPOTENCY-1). aiplSchemaVersionOf_
  // has delegated to sadResolveHeaderSchema_ since R1, so in SOURCE there is one authority and no
  // disagreement is possible. §3.4 is therefore already satisfied by the code in this repository.
  //
  // WHICH LEAVES EXACTLY ONE EXPLANATION for the live pair (writer FB4G / lifecycle null), and it is not a
  // source defect: the two readings came from DIFFERENT BUILDS. Both sides here read the same sheet through
  // the same sadLiveHeaderNames_, so the input is identical by construction and the only variable is which
  // module body ran. The pre-R1 aiplSchemaVersionOf_ compared the header byte-for-byte against
  // SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_, which is frozen at 34 ON PURPOSE, and returned '' for any
  // 36-column sheet — reproducing the live output exactly. The deployed project has a current 16_ and a
  // stale 69_.
  //
  // That is a state a diagnostic MUST be able to name, because it is the dangerous one: the writer accepts
  // and the lifecycle expires nothing, so a generation writes rows that no later run can supersede. So the
  // cause is now DISCRIMINATED from the facts at hand, and each branch asserts only what it can see:
  //
  //   * the writer refuses            -> the header itself is wrong
  //   * writer ok, generation is not  -> the lifecycle columns really ARE incomplete, and they are named
  //     lifecycle_complete
  //   * writer ok, generation IS      -> the columns are present and complete, so the resolver disagreeing
  //     lifecycle_complete, and yet      with itself cannot be about columns. The expected version is
  //     the lifecycle names nothing      re-derived from the shared authority and reported beside what the
  //                                     lifecycle module returned, and the finding is a DEPLOYMENT skew.
  //
  // `shares_authority` is checked at RUNTIME rather than asserted by comment: the lifecycle resolver is
  // asked to resolve the same header and its verdict compared with the writer's, which is the only way this
  // file can tell a project with one authority from a project that merely used to have one.
  // ==========================================================================================================
  return (_ds && typeof aiplSchemaVersionOf_ === 'function')
    ? (function () {
        var _live = sadLiveHeaderNames_(_dsSheet);
        var _lv = aiplSchemaVersionOf_(_live) || null;
        var _wv = _ds.version || null;
        var _lifeRes = (typeof aiplResolveSchema_ === 'function') ? aiplResolveSchema_(_live) : null;
        // Does the lifecycle module reach the SAME resolution the writer did? Same input, same verdict.
        var _shares = !!(_lifeRes && _lifeRes.ok === _ds.ok
          && CENSUS_str_(_lifeRes.version) === CENSUS_str_(_ds.version)
          && _lifeRes.lifecycle_complete === _ds.lifecycle_complete);
        var _need = (typeof SAD_LIFECYCLE_TAIL_COLUMNS_ !== 'undefined') ? SAD_LIFECYCLE_TAIL_COLUMNS_.slice() : [];
        var _have = {}; (_live || []).forEach(function (hh) { _have[CENSUS_str_(hh)] = 1; });
        var _missingLife = _need.filter(function (c) { return !_have[c]; });
        var _agree = (_ds.ok === true) && _wv !== null && _lv !== null && _wv === _lv;
        var _dis = null;
        if (!_agree) {
          if (_ds.ok !== true) _dis = 'WRITER_REFUSES_THIS_HEADER';
          else if (_wv === null) _dis = 'WRITER_RESOLVED_NO_VERSION';
          else if (_lv === null) {
            // The ONLY branch that was previously guessed. It is now decided by whether the recognized
            // generation is lifecycle-complete — a fact this block already holds.
            _dis = (_ds.lifecycle_complete === true)
              ? 'LIFECYCLE_RESOLVER_STALE_IN_DEPLOYED_PROJECT: the recognized generation IS '
                + 'lifecycle-complete and every lifecycle column is present, so this cannot be a column '
                + 'problem. The writer and the lifecycle read the same header and returned different '
                + 'answers, which means different builds are running. Expected ' + _wv
                + ' from the shared authority; the lifecycle module returned none. Sync '
                + '69_api_v1_ai_plan_lifecycle.gs into the Apps Script project.'
              : ('LIFECYCLE_COLUMNS_INCOMPLETE: missing ' + (_missingLife.join(',') || '(none named)'));
          } else _dis = 'WRITER_AND_LIFECYCLE_NAME_DIFFERENT_VERSIONS';
        }
        return { live_header_count: (_live || []).length,
          writer_accepts: _ds.ok === true, writer_version: _wv,
          recognized_generation: _wv, lifecycle_complete: _ds.lifecycle_complete === true,
          lifecycle_version: _lv,
          lifecycle_required_columns: _need, missing_lifecycle_columns: _missingLife,
          shares_authority: _shares,
          lifecycle_resolution: _lifeRes ? { ok: _lifeRes.ok, version: _lifeRes.version,
            lifecycle_complete: _lifeRes.lifecycle_complete, reason: _lifeRes.reason || null } : null,
          supported_versions: _ds.supported_versions || null,
          agree: _agree, disagreement: _dis };
      })()
    : null;

  } catch (eS3) { return null; }
}

function CENSUS_logAll_(out) {
  CENSUS_log_('verdict', out.verdict);
  CENSUS_log_('scope', out.scope);
  CENSUS_log_('planning_cycle', out.planning_cycle);
  CENSUS_log_('required_forecast_months', out.required_forecast_months);
  CENSUS_log_('flag', out.flag);
  CENSUS_log_('harvest', out.harvest);
  CENSUS_log_('mapped.ready', out.mapped ? out.mapped.ready : null);
  CENSUS_log_('mapped.reason', out.mapped ? out.mapped.reason : null);
  CENSUS_log_('mapped.issues', out.mapped ? out.mapped.issues : null);
  CENSUS_log_('mapped.warnings', out.mapped ? out.mapped.warnings : null);
  CENSUS_log_('mapped.readiness_predicates', out.mapped ? out.mapped.readiness_predicates : null);
  CENSUS_log_('mapped.failed_required_predicates', out.mapped ? out.mapped.failed_required_predicates : null);
  CENSUS_log_('mapped.missing_fields', out.mapped ? out.mapped.missing_fields : null);
  CENSUS_log_('mapped.mapped_field_names', out.mapped ? out.mapped.mapped_field_names : null);
  CENSUS_log_('source_data_as_of_candidates', out.source_data_as_of_candidates);
  CENSUS_log_('forecast_coverage', out.forecast_coverage);
  CENSUS_log_('source_lines', out.source_lines);
  CENSUS_log_('allocated_lines', out.allocated_lines);
  CENSUS_log_('sku_facts', out.sku_facts);
  CENSUS_log_('factory_stock', out.factory_stock);
  CENSUS_log_('carrier_authorities', out.carrier_authorities);
  // §7 — `matched_carrier_cards` is now the FINAL ELIGIBLE count from the shared authority (a number),
  // not a private array, so `.length` would have printed undefined on every run.
  CENSUS_log_('matched_carrier_cards', out.matched_carrier_cards);
  CENSUS_log_('carrier_lane_funnels', out.carrier_lane_funnels);
  CENSUS_log_('schema_writer_lifecycle_parity', out.schema_parity);
  CENSUS_log_('production_parity', out.production_parity);
  CENSUS_log_('allocator', out.allocator);
  CENSUS_log_('total_allocated_quantity', out.total_allocated_quantity);
  CENSUS_log_('would_create_route_count', out.would_create_route_count);
  CENSUS_log_('active_allocation_drafts', out.active_allocation_drafts ? out.active_allocation_drafts.length : null);
  CENSUS_log_('next_blocked_stage', out.next_blocked_stage);
  CENSUS_log_('blockers', out.blockers);
  CENSUS_log_('differences', out.differences);
  CENSUS_log_('writer_constructed', out.writer_constructed);
  CENSUS_log_('db_writes', out.db_writes);
}


// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A1 §6 — THE ONE ENTRY POINT, WITH THE SCOPE ALREADY IN IT.
//
// The live census came back with scope { company: "", country: "", marketplace: "", sku: "" } and a single
// blocker, SCOPE_INCOMPLETE. The census was RIGHT to refuse — it never defaults a scope and never runs
// ALL_SITES — but the result was not an AI Plan finding of any kind. It said nothing about the forecast,
// the snapshot, the allocator or readiness, and it must not be read as though it had.
//
// The fault was the calling convention, not the census. `TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3(args)` takes a
// parameter object, and a zero-argument wrapper around it passes nothing. Asking an operator to reconstruct an
// internal args schema in a console is a design defect: the scope belongs in the function, not in the caller.
//
// So this is the only function anyone needs to run. It takes NOTHING, it carries the scope itself, and it
// asserts that scope before any harvest happens — so a future edit that changes one of the four values
// stops rather than quietly censusing a different site.
//
// READ-ONLY, and the census it delegates to is the authority on that: it never constructs a writer, never
// opens the allocation tables for writing, never runs a migration and never touches the flag. This wrapper
// adds no capability of its own; it only removes a way to call it wrong.
// ================================================================================================================
var TEMP_E3_FIXED_SCOPE_ = { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' };

function RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R() {
  var S = TEMP_E3_FIXED_SCOPE_;

  // The identity header, printed BEFORE any read, so a run can be matched to what it was asked to do even if
  // it stops on the next line.
  var planningCycle = null;
  try {
    var cc = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
    planningCycle = (cc && cc.ok) ? cc.planningCycle : null;
  } catch (e) { planningCycle = null; }
  var flagEffective = null;
  try {
    flagEffective = (typeof inventoryAiPlanDbGenerationEnabled_ === 'function')
      ? (inventoryAiPlanDbGenerationEnabled_() === true) : null;
  } catch (e2) { flagEffective = null; }

  // F1-7N-FC-1B-E3-R4-A2-R1 §5 — THE SCHEDULE IS PART OF THE HEADLINE, because it is what decides
  // whether an older snapshot is CURRENT or STALE, and the previous run of this census could not say.
  var sched = null, jobState = null, businessNow = null;
  try { sched = (typeof weeklyAiPlanGapSchedule_ === 'function') ? weeklyAiPlanGapSchedule_() : null; } catch (eS) { sched = null; }
  try { jobState = (typeof weeklyAiPlanGapJobState_ === 'function') ? weeklyAiPlanGapJobState_() : null; } catch (eJ) { jobState = null; }
  try {
    if (typeof KMSNF !== 'undefined' && KMSNF && typeof KMSNF.businessNow === 'function'
      && typeof GAP_CALC_UTC_OFFSET_MIN_ !== 'undefined' && typeof gapCalcNowMs_ === 'function') {
      businessNow = KMSNF.businessNow(gapCalcNowMs_(), GAP_CALC_UTC_OFFSET_MIN_);
    }
  } catch (eB) { businessNow = null; }

  CENSUS_log_('scope', S);
  CENSUS_log_('server_business_time', businessNow ? (businessNow.ymd + ' ' + businessNow.hhmm + ' Asia/Taipei') : null);
  CENSUS_log_('gap_schedule', sched);
  CENSUS_log_('gap_job_state', jobState);
  CENSUS_log_('planning_cycle', planningCycle);
  CENSUS_log_('read_only', true);
  CENSUS_log_('flag_effective', flagEffective);
  CENSUS_log_('activation_allowlist', (typeof inventoryAiPlanActivationAllowlist_ === 'function')
    ? inventoryAiPlanActivationAllowlist_() : null);
  CENSUS_log_('scope_in_allowlist', (typeof inventoryAiPlanScopeEnabled_ === 'function')
    ? inventoryAiPlanScopeEnabled_(S.company, S.country, S.marketplace, S.sku) : null);
  CENSUS_log_('db_writes', 0);
  CENSUS_log_('writer_constructed', false);
  CENSUS_log_('census_build', TEMP_E3_CENSUS_BUILD_);
  CENSUS_log_('deployment_build', (typeof SYS_BUILD_VERSION_ !== 'undefined') ? SYS_BUILD_VERSION_ : null);
  CENSUS_log_('workspace_build', (typeof WAP_BUILD_VERSION_ !== 'undefined') ? WAP_BUILD_VERSION_ : null);
  CENSUS_log_('freshness_authority', (typeof KMSNF !== 'undefined' && KMSNF) ? KMSNF._version : 'MISSING');

  // STOP BEFORE HARVEST if the scope is not exactly the four values this wrapper exists to run. An empty or
  // partially-edited scope is what produced the unusable log, and it must fail here rather than downstream.
  var bad = [];
  if (CENSUS_str_(S.company) !== 'ResUS') bad.push('company');
  if (CENSUS_str_(S.country) !== 'US') bad.push('country');
  if (CENSUS_str_(S.marketplace) !== 'Amazon') bad.push('marketplace');
  if (CENSUS_str_(S.sku) !== 'CO1100-R') bad.push('sku');
  if (bad.length) {
    var stop = { census: 'RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R', read_only: true, db_writes: 0,
      writer_constructed: false, ok: false, verdict: 'STOP', scope: S,
      blockers: ['FIXED_SCOPE_ALTERED: ' + bad.join(', ') + ' — this wrapper runs exactly ResUS / US / Amazon / '
        + 'CO1100-R and refuses to census a different site under the same name'] };
    CENSUS_log_('verdict', 'STOP');
    CENSUS_log_('blockers', stop.blockers);
    return stop;
  }

  // The scope is passed EXPLICITLY. Nothing is defaulted, nothing falls back to the first SKU, and ALL_SITES
  // is unreachable from here.
  var res = TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({
    company: S.company, country: S.country, marketplace: S.marketplace, sku: S.sku
  });

  // §5 — WHICH RUN WAS ADOPTED, AND WHY. "A snapshot dated yesterday was accepted" is only a defensible
  // sentence when the reason travels beside it, and the previous census reported neither.
  //
  // F1-7N-FC-1B-E3-R4-A2-R1-R1 §10 — READ THE REFUSAL, NOT ONLY THE SUCCESS.
  //
  // These five lines read a SUCCESSFUL harvest's fields, and a harvest that REFUSES does not have them: it
  // returns { ok:false, errors:[ CANONICAL_DEMAND_UNAVAILABLE ] } and carries the freshness verdict, the
  // schedule and the distinct dates INSIDE that error. So on the one run where an operator most needs to know
  // which state blocked them, the census printed freshness_state: null, accepted_snapshot_date: null and
  // snapshot_distinct_dates: null — and the live log said nothing about the LINEAGE_MISMATCH that had
  // actually stopped it. A diagnostic that goes quiet exactly when something goes wrong is worse than none.
  try {
    var h = res && res.harvest;
    // The refusal payload, when there is one. Both shapes are read so the fields are populated either way.
    var hErr = null;
    var hErrs = (h && h.errors) || (res && res.harvest_errors) || [];
    for (var _e = 0; _e < hErrs.length; _e++) {
      if (hErrs[_e] && hErrs[_e].code === 'CANONICAL_DEMAND_UNAVAILABLE') { hErr = hErrs[_e]; break; }
    }
    var fr = (h && h.snapshot_freshness) || (hErr && hErr.freshness) || null;
    CENSUS_log_('freshness_state', (fr && fr.state) || null);
    CENSUS_log_('freshness_reason', (fr && fr.reason) || (hErr && hErr.message) || null);
    CENSUS_log_('freshness_accepted', fr ? (fr.ok === true) : null);
    CENSUS_log_('accepted_snapshot_date', (h && h.accepted_snapshot_date) || (fr && fr.acceptedDate) || null);
    CENSUS_log_('accepted_snapshot_run', (h && h.gap_job_state && h.gap_job_state.runId)
      || (jobState && jobState.runId) || null);
    CENSUS_log_('snapshot_distinct_dates', (h && h.snapshot_distinct_dates)
      || (hErr && hErr.distinct_dates) || null);
    CENSUS_log_('gap_schedule_resolved', (h && h.gap_schedule) || (hErr && hErr.schedule) || sched || null);
    CENSUS_log_('forecast_normalization', (h && h.forecast_normalization) || null);
    CENSUS_log_('snapshot_date_normalization', (h && h.snapshot_date_normalization)
      || (hErr && hErr.date_normalization) || null);
  } catch (eF) {}

  // §10 — ALLOCATION SCHEMA DIAGNOSTICS. Read-only, and it CHANGES NO GATE: it reports what the shared
  // authority says about the live header so "the AI Plan refuses" and "the drafts table is at a schema this
  // build does not know" stop being the same unexplained outcome.
  try {
    var _ds = null, _dsSheet = null;
    try { _dsSheet = SpreadsheetApp.openById(prodExpectedDbId_()).getSheetByName('shipping_allocation_drafts'); } catch (eD1) { _dsSheet = null; }
    if (_dsSheet && typeof sadLiveHeaderNames_ === 'function' && typeof sadResolveHeaderSchema_ === 'function') {
      _ds = sadResolveHeaderSchema_(sadLiveHeaderNames_(_dsSheet));
    }
    CENSUS_log_('allocation_schema', _ds ? {
      observed_header_count: _ds.column_count,
      resolved_schema_version: _ds.version,
      compatible: _ds.ok === true,
      lifecycle_complete: _ds.lifecycle_complete === true,
      reason: _ds.reason || null,
      first_mismatch: _ds.first_mismatch || null,
      supported_versions: (_ds.supported_versions || []).map(function (v) { return v.version + '(' + v.column_count + ')'; })
    } : 'SCHEMA_AUTHORITY_OR_TABLE_UNAVAILABLE');
    // §9 — the parity fact itself, so a divergence is visible in the log rather than inferred later.
    // F1-7N-FC-1B-E3-R4-A2-R1-R2 §11 — WHAT THE REAL GENERATION WOULD DECLARE, WITHOUT DECLARING IT.
    //
    // Read-only, and it constructs NO writer: it reports the intent the production call site carries and
    // previews the deterministic identity the resolver would land on, so an operator can see which row a live
    // Generate would create or reconcile BEFORE pressing anything. The intent is read from the server-owned
    // constant rather than restated here, so a census cannot drift from what generation actually sends.
    CENSUS_log_('route_intent_that_generation_would_use',
      (typeof SAD_AI_K2_INTENT_ !== 'undefined') ? SAD_AI_K2_INTENT_ : 'UNKNOWN_INTENT_AUTHORITY_MISSING');
    CENSUS_log_('route_intent_is_client_grantable',
      (typeof SAD_CLIENT_GRANTABLE_INTENTS_ !== 'undefined' && typeof SAD_AI_K2_INTENT_ !== 'undefined')
        ? (SAD_CLIENT_GRANTABLE_INTENTS_[SAD_AI_K2_INTENT_] === 1) : null);
    // F1-7N-FC-1B-E3-R4-A2-R1-R3 §9 — `agree: true` WITH A NULL LIFECYCLE VERSION WAS NOT AGREEMENT.
    //
    // The old predicate compared `(writer accepted) === (writer resolved a version)`, which is two readings of
    // the SAME authority and is therefore true whenever the writer is self-consistent. The lifecycle version
    // was printed beside it and never took part, so the live log could show
    // `resolved_schema_version: FB4G-…, lifecycle_version: null, agree: true` — a parity claim asserted over
    // a value it had ignored.
    //
    // Parity now requires what the word means: the writer accepts, the lifecycle names a version, and it is
    // the SAME version. A null on either side is a DISAGREEMENT, which is the case that matters, because it
    // is exactly the mixed-deployment state where a generation writes and nothing expires.
    // R4: the runner's census result is `res`. Referencing `out` here threw straight into the empty catch
    // below, so this line silently stopped appearing in the operator's log the moment the computation moved.
    CENSUS_log_('schema_writer_lifecycle_parity', res && res.schema_parity);
  } catch (eS2) {}
  // §11 — THE DETERMINISTIC IDENTITY PREVIEW. Derived from the SAME authority the writer resolves with,
  // over the routes this census already computed. Nothing is written and no writer is constructed; this only
  // answers "which row would a live Generate touch?" before anyone presses it.
  try {
    var _prev = [];
    var _grps = (res && res.k2_preview && res.k2_preview.groups) || (res && res.groups) || [];
    for (var _p = 0; _p < _grps.length && _p < 10; _p++) {
      var _hh = _grps[_p] && (_grps[_p].header || _grps[_p]);
      if (!_hh) continue;
      _prev.push({
        group_no: _hh.recommendation_group_no || null,
        k2_group_key: (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(_hh) : null,
        deterministic_header_id: (typeof ricK4DeterministicHeaderId_ === 'function')
          ? (function () { try { return ricK4DeterministicHeaderId_(_hh); } catch (e) { return null; } })()
          : ((typeof sadK2DeterministicHeaderId_ === 'function')
              ? (function () { try { return sadK2DeterministicHeaderId_(_hh); } catch (e) { return null; } })() : null)
      });
    }
    CENSUS_log_('deterministic_identity_preview', _prev.length ? _prev : 'NO_ROUTES_COMPUTED_IN_THIS_CENSUS');
  } catch (eP) { CENSUS_log_('deterministic_identity_preview', 'PREVIEW_UNAVAILABLE'); }

  // Re-assert the read-only facts from the RESULT rather than from this function's intentions.
  CENSUS_log_('result.read_only', res && res.read_only);
  CENSUS_log_('result.db_writes', res && res.db_writes);
  CENSUS_log_('result.writer_constructed', res && res.writer_constructed);
  CENSUS_log_('result.verdict', res && res.verdict);
  return res;
}
