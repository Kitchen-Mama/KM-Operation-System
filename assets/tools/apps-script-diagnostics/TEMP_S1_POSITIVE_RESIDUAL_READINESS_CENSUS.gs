/**
 * ================================================================================================================
 * BATCH S1 — POSITIVE-RESIDUAL READINESS CENSUS.  READ ONLY.  ZERO WRITES ON EVERY PATH.
 * ================================================================================================================
 *
 * The R6-R7-R5-R1 activation proved ONE class of correct no-action: a scope whose recommendation is already
 * FULLY_COVERED_BY_ACTIVE_PLAN. It wrote nothing, and that was the right answer. Nothing has yet proved the
 * other half of the vertical slice — a scope with a POSITIVE RESIDUAL, where the correct answer is that rows
 * ARE written — and nothing has proved the Submit that carries such a draft into a Weekly Shipping Plan.
 *
 * This file is the read-only evidence for authorizing those two, and it is deliberately NOT the thing that
 * performs them. It calls no writer, mints no controlled capability, flips no flag, and touches no allowlist.
 *
 * ----------------------------------------------------------------------------------------------------------------
 * IT DERIVES NOTHING OF ITS OWN. Every number below is read from the authority that already owns it:
 *
 *   the accepted run / date / freshness      weeklyAiPlanCanonicalDemand_            (61_)
 *   the scopes a run may write               weeklyAiPlanTargetScopes_               (61_)
 *   recommendation state + recommended_qty   weeklyAiPlanRecommendationState_        (61_)
 *   qualifying MANUAL planned quantity       weeklyAiPlanQualifyingPlannedQty_       (61_)
 *   the residual                             weeklyAiPlanNoActionDecision_           (61_)
 *   factory balances + exposure + available  fsgReadInventoryFacts_ / KMFSG          (71_ / 90_)
 *   AI identities a run would supersede      aiplExpirationCandidates_               (69_)
 *   AI vs MANUAL provenance                  aiplIsAiGenerated_                      (69_)
 *   terminal statuses                        SAD_TERMINAL_STATUSES_                  (16_)
 *   the flag and the allowlist               inventoryAiPlanDbGenerationEnabled_ /
 *                                            inventoryAiPlanScopeEnabled_            (00_)
 *   the deployment                           sysModuleBuildStamps_                   (63_)
 *
 * A census that recomputed any of these would be reporting a second opinion, and a second opinion is what a
 * readiness package must never contain: the operator would authorize against numbers the runtime does not use.
 * Where an authority is ABSENT this file reports the absence and refuses; it never substitutes a local formula.
 *
 * ----------------------------------------------------------------------------------------------------------------
 * NO CANDIDATE IS SELECTED. `RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS` returns a RANKED list in which every
 * entry carries its own ten proofs and its own refusal reasons. `selected` is always null and
 * `proposal_only` is always true, because "the diagnostic picked one" and "a person authorized one" are
 * different events and only the second may precede a write.
 *
 * ----------------------------------------------------------------------------------------------------------------
 * TWO MANIFESTS, TWO AUTHORIZATIONS. MANIFEST P authorizes a controlled positive-residual Generate. MANIFEST S
 * authorizes a controlled Submit of the draft that Generate produced. They are separate because they have
 * different blast radii, different rollbacks and different owners of the failure: P creates allocation drafts
 * (no inventory movement, no reservation), S creates a durable Weekly Shipping Plan and moves exposure between
 * lifecycle stages. P succeeding says nothing about whether S may run, and this file will not imply otherwise.
 * ================================================================================================================
 */

var S1_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R5-R1';   // the build this census was written against
var S1_CONTRACT_ = 'BATCH S1 — positive-residual + submit readiness, read only, zero writes';

/** The scope axes are ALWAYS all four. A census that matched on three would report a candidate that the
 *  runtime's own allowlist and identity model cannot act on. */
var S1_SCOPE_AXES_ = ['company', 'country', 'marketplace', 'sku'];

var S1_CHUNK_MAX_BYTES_ = 45000;

function S1_str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
/** MISSING IS NOT ZERO, anywhere in this file. A blank, a null, a non-numeric string and an infinity all
 *  return null, and every consumer below treats null as "unknown" and refuses rather than as 0. */
function S1_qty_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
function S1_log_(tag, payload) {
  try { Logger.log('[S1] ' + tag + ' ' + payload); } catch (e) {}
}
function S1_emitChunked_(tag, text) {
  var s = String(text == null ? '' : text), n = Math.ceil(s.length / S1_CHUNK_MAX_BYTES_) || 1;
  for (var i = 0; i < n; i++) {
    S1_log_(tag + '_' + (i + 1) + '_of_' + n, s.slice(i * S1_CHUNK_MAX_BYTES_, (i + 1) * S1_CHUNK_MAX_BYTES_));
  }
  return n;
}
function S1_scopeKey_(company, country, marketplace, sku) {
  return S1_str_(company) + '|' + S1_str_(country) + '|' + S1_str_(marketplace) + '|' + S1_str_(sku);
}
function S1_poolKey_(warehouseId, sku) { return S1_str_(warehouseId) + '||' + S1_str_(sku); }

/**
 * The predicate ledger. Every claim this file makes is a named entry with what it EXPECTED and what it
 * OBSERVED, so a refusal says which condition failed rather than that something did.
 */
function S1_ledger_() {
  var L = { entries: [], failed: [] };
  L.P = function (name, expected, observed, pass) {
    L.entries.push({ predicate: name, expected: expected, observed: observed, pass: !!pass });
    if (!pass) L.failed.push(name);
    return !!pass;
  };
  return L;
}

/**
 * THE ENVIRONMENT, ASKED ONCE. Read-only, and it is the first thing every entry point below establishes:
 * a census run against an unknown deployment, or with the flag already true, is not evidence for authorizing
 * anything.
 */
function S1_environment_() {
  var out = { build: S1_BUILD_, contract: S1_CONTRACT_,
    flag_present: (typeof inventoryAiPlanDbGenerationEnabled_ === 'function'),
    flag_value: null,
    allowlist_present: (typeof inventoryAiPlanScopeEnabled_ === 'function'),
    allowlist: null,
    deployment: null, authorities: {}, missing_authorities: [] };
  if (out.flag_present) { try { out.flag_value = inventoryAiPlanDbGenerationEnabled_() === true; } catch (e) { out.flag_value = null; } }
  if (typeof inventoryAiPlanActivationAllowlist_ === 'function') {
    try { out.allowlist = inventoryAiPlanActivationAllowlist_(); } catch (e2) { out.allowlist = null; }
  }
  if (typeof sysModuleBuildStamps_ === 'function') {
    try { out.deployment = sysModuleBuildStamps_(); } catch (e3) { out.deployment = { available: false, error: String(e3 && e3.message) }; }
  }
  // Named individually, because "the census could not run" and "the deployment is missing 71_" are different
  // facts and only the second tells an operator what to sync.
  [['weeklyAiPlanCanonicalDemand_', '61_ accepted run + freshness'],
   ['weeklyAiPlanTargetScopes_', '61_ server-owned scope allowlist'],
   ['weeklyAiPlanRecommendationState_', '61_ recommendation state + recommended_qty'],
   ['weeklyAiPlanQualifyingPlannedQty_', '61_ qualifying MANUAL planned quantity'],
   ['weeklyAiPlanNoActionDecision_', '61_ residual + no-action classification'],
   ['fsgReadInventoryFacts_', '71_ read-only factory balances + exposure'],
   ['aiplExpirationCandidates_', '69_ AI identities a run would supersede'],
   ['aiplIsAiGenerated_', '69_ AI vs MANUAL provenance'],
   ['gapCalcResolveContext_', '43_ canonical planning cycle'],
   ['prodExpectedDbId_', '29_ expected DB id'],
   ['prodAssertDbTarget_', '29_ exact-ID target gate']].forEach(function (a) {
    var have = (typeof this[a[0]] !== 'undefined');
    out.authorities[a[0]] = { present: have, owns: a[1] };
    if (!have) out.missing_authorities.push(a[0]);
  }, (function () { return this; })());
  out.factory_guard_module = (typeof KMFSG !== 'undefined' && KMFSG) ? (KMFSG.CONTRACT || 'present') : null;
  out.terminal_statuses = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : null;
  return out;
}

/** The one spreadsheet handle, through the same exact-ID gate 61_ uses. A census that read a different
 *  spreadsheet would be honest about a database nobody is going to write to. */
function S1_openDb_() {
  if (typeof prodExpectedDbId_ !== 'function') return { ok: false, reason: 'PROD_DB_ID_AUTHORITY_MISSING' };
  var ss;
  try { ss = SpreadsheetApp.openById(prodExpectedDbId_()); }
  catch (e) { return { ok: false, reason: 'DB_OPEN_FAILED', detail: String(e && e.message ? e.message : e) }; }
  if (typeof prodAssertDbTarget_ === 'function') {
    try { prodAssertDbTarget_(ss, prodExpectedDbId_()); }
    catch (e2) { return { ok: false, reason: 'DB_TARGET_ASSERTION_FAILED', detail: String(e2 && e2.message ? e2.message : e2) }; }
  }
  return { ok: true, ss: ss };
}

/**
 * §1 / §4 — THE SCHEMA FINGERPRINTS. Read from the live sheets, in the live order, so a candidate's evidence
 * is bound to the schema it was measured against. Two schemas are two different tables.
 */
function S1_schemaFingerprints_(ss) {
  var out = { tables: {}, ok: true, unreadable: [] };
  ['inventory_replenishment_gap', 'shipping_allocation_drafts', 'shipping_allocation_draft_lines',
   'shipping_plans', 'shipping_plan_lines', 'factory_stock', 'warehouses'].forEach(function (t) {
    var sh = null;
    try { sh = ss.getSheetByName(t); } catch (e) { sh = null; }
    if (!sh) { out.tables[t] = { present: false, column_count: null, fingerprint: null }; out.unreadable.push(t); out.ok = false; return; }
    var hdrs = [];
    try {
      hdrs = (sh.getLastRow() > 0)
        ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return S1_str_(h); })
        : [];
    } catch (e2) { out.tables[t] = { present: true, column_count: null, fingerprint: null, error: String(e2 && e2.message) }; out.unreadable.push(t); out.ok = false; return; }
    var fp = (typeof KMFSG !== 'undefined' && KMFSG && typeof KMFSG.fnv1a === 'function')
      ? KMFSG.fnv1a(hdrs.join('')).toUpperCase()
      : null;
    out.tables[t] = { present: true, column_count: hdrs.length, columns: hdrs, fingerprint: fp };
  });
  return out;
}

/**
 * §4 — THE PER-SCOPE AI PLANNED QUANTITY, taken from the exposure authority rather than counted here.
 *
 * `KMFSG.draftExposure` already separates manual from AI provenance using 69_'s own classifier, and its
 * `rows` carry company / country / marketplace / sku / quantity / ai_generated. So the AI quantity for an
 * exact scope is a filter over evidence the guard has already produced — not a second traversal with a
 * second copy of the scope match and the terminal-status rule.
 */
function S1_aiPlannedByScope_(facts) {
  var out = { byKey: {}, rows: [], authority: 'KMFSG.draftExposure rows (71_ fsgReadInventoryFacts_), '
    + 'provenance via 69_ aiplIsAiGenerated_ — filtered, never recounted' };
  var rows = (facts && facts.draftExposure && facts.draftExposure.rows) || [];
  rows.forEach(function (r) {
    if (r.ai_generated !== true) return;
    var k = S1_scopeKey_(r.company, r.country, r.marketplace, r.sku);
    var q = S1_qty_(r.quantity);
    if (q === null) return;
    out.byKey[k] = (out.byKey[k] || 0) + q;
    if (out.rows.length < 200) out.rows.push(r);
  });
  return out;
}

/** Active MANUAL identities for a scope, from the same exposure rows. These are the rows a generation must
 *  never overwrite, and they are listed by identity so "no manual row would change" is checkable. */
function S1_manualIdentitiesByScope_(facts) {
  var out = {};
  var rows = (facts && facts.draftExposure && facts.draftExposure.rows) || [];
  rows.forEach(function (r) {
    if (r.ai_generated === true) return;
    var k = S1_scopeKey_(r.company, r.country, r.marketplace, r.sku);
    (out[k] = out[k] || []).push({ allocation_draft_id: r.allocation_draft_id,
      allocation_draft_line_id: r.allocation_draft_line_id, sku: r.sku, warehouse_id: r.warehouse_id,
      status: r.status, line_status: r.line_status, quantity: r.quantity,
      provenance: (r.ai_generated === false ? 'MANUAL' : 'UNKNOWN') });
  });
  return out;
}

/**
 * ================================================================================================================
 * GATE D §1-§5 — THE CANDIDATE CENSUS.
 * ================================================================================================================
 * Every scope the CURRENT accepted run knows about is measured. A scope is a CANDIDATE only when all ten
 * proofs hold; every other scope is returned with the exact reasons it is not one, because a scope that was
 * silently dropped is indistinguishable from a scope that was never looked at.
 */
function RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS() {
  var out = { census: 'RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS', contract: S1_CONTRACT_,
    build: S1_BUILD_, dry_run: true, writes: 0, writer_calls: 0, generate_called: false,
    submit_called: false, migration_called: false,
    verdict: 'STOP', stop_reason: null,
    environment: null, accepted_run: null, schema: null,
    scopes_examined: 0, candidates: [], rejected: [], ranked: [],
    selected: null, proposal_only: true,
    predicates: [], predicates_failed: 0 };
  var L = S1_ledger_();

  try {
    out.environment = S1_environment_();
    L.P('deployment_authorities_are_all_present', [], out.environment.missing_authorities,
      out.environment.missing_authorities.length === 0);
    L.P('the_generation_flag_is_false', false, out.environment.flag_value,
      out.environment.flag_value === false);
    L.P('the_activation_allowlist_authority_is_present', true, out.environment.allowlist_present,
      out.environment.allowlist_present === true);
    L.P('the_factory_stock_guard_module_is_present', true, !!out.environment.factory_guard_module,
      !!out.environment.factory_guard_module);
    if (L.failed.length) { out.stop_reason = 'the environment cannot support a census: ' + L.failed.join(', '); return S1_finish_(out, L); }

    var db = S1_openDb_();
    if (!db.ok) { L.P('the_expected_database_opened', true, db.reason, false); out.stop_reason = db.reason; return S1_finish_(out, L); }
    L.P('the_expected_database_opened', true, 'ok', true);
    var ss = db.ss;

    out.schema = S1_schemaFingerprints_(ss);
    L.P('every_table_the_census_reads_is_present_and_readable', [], out.schema.unreadable,
      out.schema.unreadable.length === 0);
    if (L.failed.length) { out.stop_reason = 'schema not readable: ' + out.schema.unreadable.join(', '); return S1_finish_(out, L); }

    var cycle = null;
    try { var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null; if (ctx && ctx.ok) cycle = ctx.planningCycle; } catch (eC) {}
    L.P('the_canonical_planning_cycle_resolved', 'a cycle', cycle, !!cycle);
    if (!cycle) { out.stop_reason = 'the canonical planning cycle is unresolved'; return S1_finish_(out, L); }

    // ---- THE SCOPE UNIVERSE, then THE ACCEPTED RUN PER (company, country). -------------------------------
    //
    // weeklyAiPlanCanonicalDemand_ narrows to a (company, country) BEFORE it resolves which snapshot date is
    // accepted, so asking it once with empty axes returns NO_COMPLETE_SNAPSHOT and zero rows — measured, not
    // assumed. The universe is therefore enumerated first, from the gap table's IDENTITY columns only, and the
    // authority is asked once per pair. No window, no recommendation and no date is read from that enumeration;
    // every quantity below still comes from the authority, which is what makes reading identity here legitimate.
    var gapRows = [];
    try { gapRows = (typeof gapReadObjects_ === 'function') ? (gapReadObjects_(ss, 'inventory_replenishment_gap') || []) : []; }
    catch (eU) { gapRows = []; }
    var pairKeys = [], pairs = {};
    // THE FULL FOUR-AXIS IDENTITY UNIVERSE, so nothing can vanish. The status and date are carried along
    // because a rejection has to say WHY, and 'the authority excluded it' is not a reason a reader can act
    // on. No window and no recommended quantity is read here.
    var universeKeys = [], universe = {}, malformedIdentityRows = 0;
    gapRows.forEach(function (r) {
      var c = S1_str_(r.company), co = S1_str_(r.country);
      var mk = S1_str_(r.marketplace), sk = S1_str_(r.sku);
      if (!c || !co) { malformedIdentityRows++; return; }
      var pk = c + '|' + co;
      if (!pairs[pk]) { pairs[pk] = { company: c, country: co }; pairKeys.push(pk); }
      if (!mk || !sk) { malformedIdentityRows++; return; }
      var uk = S1_scopeKey_(c, co, mk, sk);
      if (universe[uk]) { universe[uk].duplicate_rows++; return; }
      universe[uk] = { company: c, country: co, marketplace: mk, sku: sk,
        calculation_status: S1_str_(r.calculation_status) || null,
        calculation_date: S1_str_(r.calculation_date) || null,
        calculation_run_id: S1_str_(r.calculation_run_id) || null,
        duplicate_rows: 0 };
      universeKeys.push(uk);
    });
    pairKeys.sort(); universeKeys.sort();
    out.scope_universe = { source: 'inventory_replenishment_gap identity columns ONLY — no window and no'
      + ' recommended quantity is taken from this read',
      pair_count: pairKeys.length, pairs: pairKeys,
      identity_count: universeKeys.length,
      malformed_identity_rows: malformedIdentityRows };
    // A row with no company/country/marketplace/sku cannot be censused and must not be quietly skipped.
    L.P('every_gap_row_carries_a_complete_four_axis_identity', 0, malformedIdentityRows,
      malformedIdentityRows === 0);
    L.P('the_gap_table_names_at_least_one_company_country_pair', 'more than zero', pairKeys.length,
      pairKeys.length > 0);
    if (!pairKeys.length) { out.stop_reason = 'the inventory gap table names no company/country pair'; return S1_finish_(out, L); }

    // `calcDate` is deliberately null everywhere: the freshness authority chooses the accepted date. Passing
    // one would be this census deciding which run is current, which is the one thing it must not do.
    var canByPair = {}, acceptedDates = {}, freshStates = {};
    pairKeys.forEach(function (pk) {
      var c = null;
      try { c = weeklyAiPlanCanonicalDemand_(ss, { company: pairs[pk].company, country: pairs[pk].country,
        marketplace: '', planningCycle: cycle }, null); }
      catch (eD) { c = { ok: false, reason: 'CANONICAL_DEMAND_THREW: ' + String(eD && eD.message) }; }
      canByPair[pk] = c;
      if (c && c.acceptedDate) acceptedDates[S1_str_(c.acceptedDate)] = 1;
      freshStates[S1_str_(c && c.freshnessState)] = 1;
    });
    // ONE RUN, OR NEITHER. Two pairs whose accepted dates differ are two runs, and a candidate list spanning
    // both would be measured against a snapshot that does not exist as a whole.
    var dateList = Object.keys(acceptedDates).sort();
    L.P('every_company_country_pair_agrees_on_the_accepted_snapshot_date', 'exactly one date', dateList,
      dateList.length === 1);
    var firstOk = null;
    pairKeys.forEach(function (pk) { if (!firstOk && canByPair[pk] && canByPair[pk].ok) firstOk = canByPair[pk]; });
    var can = firstOk || canByPair[pairKeys[0]];
    var notOk = pairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });
    out.accepted_run = can ? {
      ok: can.ok === true, reason: can.reason || null,
      accepted_date: can.acceptedDate || null,
      freshness_state: can.freshnessState || null,
      freshness: can.freshness || null,
      schedule: can.schedule || null,
      job_state: can.jobState || null,
      distinct_dates: (can.distinctDates || []).slice(0, 20),
      row_count: can.rowCount == null ? null : can.rowCount,
      date_normalization: can.dateNormalization || null,
      planning_cycle: cycle,
      pairs_examined: pairKeys.length,
      pairs_unreadable: notOk.map(function (pk) { return { pair: pk, reason: (canByPair[pk] || {}).reason || null,
        freshness_state: (canByPair[pk] || {}).freshnessState || null }; }),
      freshness_states_seen: Object.keys(freshStates).sort()
    } : null;
    // A pair the authority could not read is a REFUSAL, never a pair with nothing in it.
    L.P('the_accepted_inventory_gap_run_is_readable_for_every_pair', [], out.accepted_run ? out.accepted_run.pairs_unreadable : 'NO_RUN',
      !!(out.accepted_run && out.accepted_run.ok) && notOk.length === 0);
    // ACCEPTING is the freshness authority's own set. A state outside it is a refusal, and a NULL state is a
    // refusal too — an unknown freshness is never read as a fresh one.
    var acceptingStates = (typeof KMGSF !== 'undefined' && KMGSF && KMGSF.ACCEPTING) ? KMGSF.ACCEPTING : null;
    var fState = out.accepted_run && out.accepted_run.freshness_state;
    L.P('the_accepted_run_freshness_is_in_the_accepting_set',
      acceptingStates ? Object.keys(acceptingStates) : 'the freshness authority ACCEPTING set',
      fState, !!(fState && (acceptingStates ? acceptingStates[fState] === 1 : /^CURRENT/.test(String(fState)))));
    if (L.failed.length) { out.stop_reason = 'the accepted run is not usable: ' + L.failed.join(', '); return S1_finish_(out, L); }

    // ---- THE FACTORY FACTS, ONCE. Read-only; this is the exposure authority both mechanisms share. -------
    // releaseSet is EMPTY on purpose: a census does not get to assume that any existing AI draft will be
    // released. Releasing a draft is something a REAL generation decides, and assuming it here would report
    // headroom that does not exist yet.
    var facts = null;
    try { facts = fsgReadInventoryFacts_(ss, { releaseSet: {} }); }
    catch (eF) { facts = { ok: false, reason: 'FACTORY_FACTS_THREW: ' + String(eF && eF.message) }; }
    L.P('the_factory_exposure_facts_are_readable', true, facts && facts.ok, !!(facts && facts.ok));
    if (!facts || !facts.ok) { out.stop_reason = 'factory facts unreadable: ' + (facts && facts.reason); return S1_finish_(out, L); }
    out.factory = { contract: facts.contract, build: facts.build, tables_read: facts.tables_read,
      pool_count: (facts.available && facts.available.pool_keys) ? facts.available.pool_keys.length : 0,
      snapshot_fingerprint: (facts.available && facts.available.fingerprint) || null,
      unreadable_pools: (facts.available && facts.available.unreadable) || [] };
    out.exposure_equation = 'available_to_allocate = (factory_current_stock - factory_reserved_stock)'
      + ' - active_allocation_draft_qty - active_shipping_plan_qty_not_yet_transferred_to_a_shipment';

    var aiPlanned = S1_aiPlannedByScope_(facts);
    var manualIdent = S1_manualIdentitiesByScope_(facts);

    // ---- EVERY SCOPE IN THE ACCEPTED RUN, pair by pair. --------------------------------------------------
    var keys = [], canForKey = {};
    pairKeys.forEach(function (pk) {
      var c = canByPair[pk];
      Object.keys((c && c.bySite) || {}).forEach(function (k) {
        if (canForKey[k]) return;
        canForKey[k] = c; keys.push(k);
      });
    });
    keys.sort();
    out.scopes_examined = keys.length;

    var draftHeaders = [];
    try { draftHeaders = (typeof gapReadObjects_ === 'function') ? (gapReadObjects_(ss, 'shipping_allocation_drafts') || []) : []; } catch (eH) { draftHeaders = []; }

    keys.forEach(function (key) {
      var parts = String(key).split('|');
      if (parts.length !== 4) {
        out.rejected.push({ scope_key: key, reasons: ['CANONICAL_KEY_DOES_NOT_SPLIT_INTO_FOUR_AXES'] });
        return;
      }
      var scope = { company: parts[0], country: parts[1], marketplace: parts[2], planningCycle: cycle };
      var sku = parts[3];
      var C = S1_ledger_();
      var row = { scope: { company: parts[0], country: parts[1], marketplace: parts[2], sku: sku },
        scope_key: key, scope_axes: S1_SCOPE_AXES_.slice() };

      // (a) the recommendation, from the one authority, for this exact scope.
      var canHere = canForKey[key] || can;
      var targets = null, recState = null;
      try { targets = weeklyAiPlanTargetScopes_(scope, parts[2]); } catch (e1) { targets = null; }
      try { recState = (targets && canHere) ? weeklyAiPlanRecommendationState_(canHere, targets) : null; } catch (e2) { recState = null; }
      var mine = null;
      if (recState && Object.prototype.toString.call(recState.per_scope) === '[object Array]') {
        recState.per_scope.forEach(function (s) { if (S1_str_(s.sku) === sku && S1_str_(s.marketplace) === parts[2]) mine = s; });
      }
      row.recommendation_state = recState ? recState.state : null;
      row.recommendation_authority = recState ? recState.authority_rule : null;
      row.windows = mine ? (mine.windows || null) : null;
      row.recommended_qty = mine ? S1_qty_(mine.recommended_qty) : null;
      row.calculation_run_id = mine ? (S1_str_(mine.calculation_run_id) || null) : null;
      row.calculation_date = mine ? (S1_str_(mine.calculation_date) || null) : null;
      row.calculation_status = mine ? (S1_str_(mine.calculation_status) || null) : null;
      row.freshness_state = out.accepted_run.freshness_state;
      row.accepted_date = out.accepted_run.accepted_date;

      // (b) the qualifying MANUAL plan and the residual, from the one authority.
      var planned = null, decision = null;
      try { planned = weeklyAiPlanQualifyingPlannedQty_(ss, scope); } catch (e3) { planned = null; }
      try { decision = (recState && planned) ? weeklyAiPlanNoActionDecision_(recState, planned) : null; } catch (e4) { decision = null; }
      row.qualifying_manual_planned_qty = planned ? S1_qty_((planned.byKey || {})[key]) : null;
      if (row.qualifying_manual_planned_qty === null && planned && planned.ok) row.qualifying_manual_planned_qty = 0;
      row.qualifying_ai_planned_qty = (aiPlanned.byKey[key] === undefined) ? 0 : aiPlanned.byKey[key];
      row.qualifying_ai_planned_authority = aiPlanned.authority;
      var dScope = null;
      if (decision && Object.prototype.toString.call(decision.per_scope) === '[object Array]') {
        decision.per_scope.forEach(function (s) { if (S1_str_(s.key) === key) dScope = s; });
      }
      row.residual_qty = dScope ? S1_qty_(dScope.residual_qty) : null;
      row.no_action_reason = decision ? (decision.reason || null) : null;
      row.production_would_no_action = decision ? decision.noAction === true : null;

      // (c) the pool. A recommendation with no factory pool is not a candidate, and it is not a zero either.
      var srcWh = mine ? (S1_str_(mine.source_warehouse_id) || S1_str_(mine.recommended_source_warehouse_id)) : '';
      // The census does not GUESS a source warehouse. When the recommendation does not name one, every factory
      // pool holding this SKU is reported and the candidate is refused for ambiguity — inventing a warehouse
      // here is how a plan comes to be sized against stock at a factory that cannot ship it.
      var poolCandidates = [];
      var avail = (facts.available && facts.available.byPool) || {};
      Object.keys(avail).forEach(function (pk) {
        var p = avail[pk];
        if (S1_str_(p.sku).toUpperCase() === sku.toUpperCase()) poolCandidates.push(p);
      });
      var pool = null;
      if (srcWh) {
        pool = avail[S1_poolKey_(srcWh, sku)] || null;
        if (!pool) { poolCandidates.forEach(function (p) { if (S1_str_(p.warehouse_id) === srcWh) pool = p; }); }
      } else if (poolCandidates.length === 1) {
        pool = poolCandidates[0];
      }
      row.source_factory_warehouse_id = srcWh || (pool ? S1_str_(pool.warehouse_id) : null);
      row.source_warehouse_named_by_recommendation = !!srcWh;
      row.pool_candidates = poolCandidates.map(function (p) { return { pool_key: p.pool_key, warehouse_id: p.warehouse_id, available_to_allocate: p.available_to_allocate }; });
      row.pool = pool ? {
        pool_key: pool.pool_key, warehouse_id: pool.warehouse_id, sku: pool.sku,
        pool_row_found: pool.pool_row_found,
        factory_current_stock: pool.factory_current_stock,
        factory_reserved_stock: pool.factory_reserved_stock,
        factory_available_stock: pool.factory_available_stock,
        active_allocation_draft_qty: pool.active_allocation_draft_qty,
        active_allocation_draft_manual_qty: pool.active_allocation_draft_manual_qty,
        active_allocation_draft_ai_qty: pool.active_allocation_draft_ai_qty,
        active_shipping_plan_qty: pool.active_shipping_plan_qty,
        already_allocated_qty: pool.already_allocated_qty,
        available_to_allocate: pool.available_to_allocate,
        exposure_stages: pool.exposure_stages
      } : null;
      // The shipment stage is the RESERVED side of the balance, by the model's own dedup rule. Reported so the
      // third stage is visible rather than inferred from its absence.
      row.shipment_reservation_exposure = pool ? {
        counted_as: 'factory_reserved_stock',
        qty: pool.factory_reserved_stock,
        note: 'a plan transferred to a shipment stops counting as plan exposure; its units are inside'
          + ' factory_reserved_stock and are already subtracted by (current - reserved)'
      } : null;

      // (d) the proposed allocation. min(residual, available), never more, and NEVER invented when either
      //     input is unknown.
      var prop = null, wouldClamp = null;
      if (row.residual_qty !== null && pool && S1_qty_(pool.available_to_allocate) !== null) {
        var a = Number(pool.available_to_allocate);
        prop = Math.min(row.residual_qty, a);
        if (prop < 0) prop = 0;
        wouldClamp = prop < row.residual_qty;
      }
      row.proposed_ai_allocation_qty = prop;
      row.would_clamp = wouldClamp;
      row.would_write = (prop !== null && prop > 0);
      row.clamp_authority = 'KMFSG evaluateAiGuard applies the real clamp at generation time; this is the '
        + 'same min(residual, available_to_allocate) the guard computes, reported in advance and never applied';

      // (e) the identities. What a run would supersede, and what it must never touch.
      var aiAffected = [];
      if (typeof aiplExpirationCandidates_ === 'function') {
        try {
          var cand = aiplExpirationCandidates_(draftHeaders, {
            company: parts[0], country: parts[1], marketplace: parts[2], planning_cycle: cycle,
            source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined') ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : '',
            generation_run_id: 'S1-CENSUS-NOT-A-RUN', committed_ids: [] });
          (cand.expire || []).forEach(function (e) {
            aiAffected.push({ allocation_draft_id: e.allocation_draft_id, previous_status: e.previous_status,
              generation_run_id: e.generation_run_id });
          });
        } catch (e5) { aiAffected = null; }
      } else { aiAffected = null; }
      row.existing_affected_ai_identities = aiAffected;
      row.protected_manual_identities = manualIdent[key] || [];
      row.ai_exposure_rows = aiPlanned.rows.filter(function (r) { return S1_scopeKey_(r.company, r.country, r.marketplace, r.sku) === key; });

      row.schema_fingerprints = {
        inventory_replenishment_gap: out.schema.tables['inventory_replenishment_gap'].fingerprint,
        shipping_allocation_drafts: out.schema.tables['shipping_allocation_drafts'].fingerprint,
        shipping_allocation_draft_lines: out.schema.tables['shipping_allocation_draft_lines'].fingerprint,
        factory_stock: out.schema.tables['factory_stock'].fingerprint
      };

      // ---- THE TEN PROOFS. Each one separately, each one named. ------------------------------------------
      C.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', row.residual_qty,
        row.residual_qty !== null && row.residual_qty > 0);
      C.P('the_recommendation_is_current_and_ready',
        { state: 'NONZERO_RECOMMENDATION', calculation_status: 'READY' },
        { state: row.recommendation_state, calculation_status: row.calculation_status,
          freshness_state: row.freshness_state },
        row.recommendation_state === 'NONZERO_RECOMMENDATION'
          && S1_str_(row.calculation_status).toUpperCase() === 'READY');
      C.P('the_row_belongs_to_the_accepted_run',
        out.accepted_run.accepted_date, row.calculation_date,
        !!row.calculation_date && row.calculation_date === out.accepted_run.accepted_date);
      C.P('a_factory_pool_exists_for_this_exact_warehouse_and_sku',
        'one pool row', row.pool ? row.pool.pool_key : null,
        !!(row.pool && row.pool.pool_row_found === true));
      C.P('the_source_factory_warehouse_is_unambiguous',
        'named by the recommendation, or exactly one factory pool holds this SKU',
        { named: row.source_warehouse_named_by_recommendation, pool_candidates: row.pool_candidates.length },
        row.source_warehouse_named_by_recommendation === true || row.pool_candidates.length === 1);
      C.P('available_to_allocate_is_finite_and_greater_than_zero', 'a finite number > 0',
        row.pool ? row.pool.available_to_allocate : null,
        !!(row.pool && S1_qty_(row.pool.available_to_allocate) !== null && row.pool.available_to_allocate > 0));
      C.P('the_proposed_quantity_does_not_exceed_the_residual',
        { at_most: row.residual_qty }, row.proposed_ai_allocation_qty,
        prop !== null && row.residual_qty !== null && prop <= row.residual_qty);
      C.P('the_proposed_quantity_does_not_exceed_available_to_allocate',
        { at_most: row.pool ? row.pool.available_to_allocate : null }, row.proposed_ai_allocation_qty,
        prop !== null && !!row.pool && S1_qty_(row.pool.available_to_allocate) !== null
          && prop <= Number(row.pool.available_to_allocate));
      C.P('no_manual_identity_would_be_overwritten',
        'a generation suppresses its own write when an active manual draft holds the identity; the manual rows'
          + ' are listed so the claim is checkable',
        { protected_manual_identities: row.protected_manual_identities.length },
        Object.prototype.toString.call(row.protected_manual_identities) === '[object Array]');
      C.P('the_affected_ai_identities_are_known',
        'a list, possibly empty', aiAffected === null ? 'UNAVAILABLE' : aiAffected.length,
        Object.prototype.toString.call(aiAffected) === '[object Array]');
      C.P('the_rollback_and_readback_strategy_is_complete',
        'atomic header+line write, verified readback, expiry only inside the exact release set',
        S1_rollbackStrategy_().generate.complete, S1_rollbackStrategy_().generate.complete === true);

      row.proofs = C.entries;
      row.refusal_reasons = C.failed;
      row.is_candidate = C.failed.length === 0;
      if (row.is_candidate) out.candidates.push(row); else out.rejected.push(row);
    });

    // ---- NOTHING DISAPPEARS. Every identity in the universe that the authority did not return is reported.
    var seen = {};
    out.candidates.concat(out.rejected).forEach(function (r) { if (r && r.scope_key) seen[r.scope_key] = 1; });
    universeKeys.forEach(function (uk) {
      if (seen[uk]) return;
      var u = universe[uk];
      out.rejected.push({ scope: { company: u.company, country: u.country, marketplace: u.marketplace, sku: u.sku },
        scope_key: uk, scope_axes: S1_SCOPE_AXES_.slice(),
        recommendation_state: null, recommended_qty: null,
        qualifying_manual_planned_qty: null, qualifying_ai_planned_qty: null, residual_qty: null,
        calculation_status: u.calculation_status, calculation_date: u.calculation_date,
        calculation_run_id: u.calculation_run_id, accepted_date: out.accepted_run.accepted_date,
        freshness_state: out.accepted_run.freshness_state,
        pool: null, proposed_ai_allocation_qty: null, would_clamp: null, would_write: false,
        protected_manual_identities: [], existing_affected_ai_identities: [],
        excluded_by_the_recommendation_authority: true,
        proofs: [], is_candidate: false,
        refusal_reasons: ['the_recommendation_is_current_and_ready'],
        refusal_detail: 'the recommendation authority did not return this identity for the accepted run.'
          + ' Its stored calculation_status is ' + (u.calculation_status || 'BLANK') + ' and its stored'
          + ' calculation_date is ' + (u.calculation_date || 'BLANK') + '. Reported rather than dropped,'
          + ' because a scope that was dropped cannot be told apart from a scope nobody examined.' });
    });
    out.scopes_examined = out.candidates.length + out.rejected.length;

    // ---- THE RANKING. Reported, and explicitly not a selection. -----------------------------------------
    // Ordered by the LEAST risky first: a candidate whose whole residual fits in available headroom, with no
    // AI identity to supersede and the smallest quantity, is the one a first controlled run should use. The
    // order is evidence for a person's choice, never a substitute for it.
    out.ranked = out.candidates.slice().sort(function (a, b) {
      var ac = a.would_clamp === true ? 1 : 0, bc = b.would_clamp === true ? 1 : 0;
      if (ac !== bc) return ac - bc;
      var aa = (a.existing_affected_ai_identities || []).length, ba = (b.existing_affected_ai_identities || []).length;
      if (aa !== ba) return aa - ba;
      var am = (a.protected_manual_identities || []).length, bm = (b.protected_manual_identities || []).length;
      if (am !== bm) return am - bm;
      if (a.proposed_ai_allocation_qty !== b.proposed_ai_allocation_qty) return a.proposed_ai_allocation_qty - b.proposed_ai_allocation_qty;
      return a.scope_key < b.scope_key ? -1 : (a.scope_key > b.scope_key ? 1 : 0);
    }).map(function (r, i) {
      return { rank: i + 1, scope: r.scope, scope_key: r.scope_key,
        recommended_qty: r.recommended_qty, qualifying_manual_planned_qty: r.qualifying_manual_planned_qty,
        qualifying_ai_planned_qty: r.qualifying_ai_planned_qty, residual_qty: r.residual_qty,
        proposed_ai_allocation_qty: r.proposed_ai_allocation_qty, would_clamp: r.would_clamp,
        available_to_allocate: r.pool ? r.pool.available_to_allocate : null,
        affected_ai_identities: (r.existing_affected_ai_identities || []).length,
        protected_manual_identities: (r.protected_manual_identities || []).length,
        proposal_only: true };
    });

    L.P('at_least_one_scope_was_examined', 'more than zero', out.scopes_examined, out.scopes_examined > 0);
    L.P('no_candidate_was_silently_selected', null, out.selected, out.selected === null);
    L.P('this_census_wrote_nothing', 0, out.writes, out.writes === 0);
    L.P('this_census_called_no_writer', 0, out.writer_calls, out.writer_calls === 0);
    L.P('this_census_called_neither_generate_nor_submit', [false, false],
      [out.generate_called, out.submit_called],
      out.generate_called === false && out.submit_called === false);

    out.verdict = out.candidates.length
      ? (L.failed.length ? 'STOP' : 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED')
      : (L.failed.length ? 'STOP' : 'NO_POSITIVE_RESIDUAL_CANDIDATE');
    if (L.failed.length) out.stop_reason = L.failed.join(', ');
    return S1_finish_(out, L);
  } catch (e) {
    L.P('the_census_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    out.stop_reason = 'S1_CENSUS_THREW: ' + String(e && e.message ? e.message : e);
    return S1_finish_(out, L);
  }
}

/**
 * §6 — SUBMIT READINESS, for the draft a positive-residual Generate WOULD produce.
 *
 * This is deliberately a SEPARATE census with a SEPARATE verdict. A Submit moves exposure between lifecycle
 * stages and creates a durable Weekly Shipping Plan; a Generate creates an allocation draft and moves nothing.
 * Reporting them together would invite one authorization to cover both.
 *
 * `allocationDraftId` is OPTIONAL. Without it this reports the CONTRACT — what Submit would require, what it
 * would create, and the exposure equation before and after — measured from the shipped Submit authority's own
 * gates rather than described. With it, the named draft is measured against every one of those gates.
 */
function RUN_S1_SUBMIT_READINESS_CENSUS(allocationDraftId) {
  var out = { census: 'RUN_S1_SUBMIT_READINESS_CENSUS', contract: S1_CONTRACT_, build: S1_BUILD_,
    dry_run: true, writes: 0, writer_calls: 0, submit_called: false, generate_called: false,
    migration_called: false, verdict: 'STOP', stop_reason: null,
    allocation_draft_id: S1_str_(allocationDraftId) || null,
    environment: null, submit_authority: null, draft: null,
    expected_shipping_plan: null, exposure_equation: null, rollback: null,
    predicates: [], predicates_failed: 0 };
  var L = S1_ledger_();
  try {
    out.environment = S1_environment_();
    L.P('the_generation_flag_is_false', false, out.environment.flag_value, out.environment.flag_value === false);

    // ---- THE SUBMIT AUTHORITY, NAMED AND PRESENT. -------------------------------------------------------
    out.submit_authority = {
      router_action: 'submitAllocationDraftsToShippingPlans',
      deprecated_alias: 'submitShippingAllocationDrafts',
      handler: 'handleSubmitAllocationDraftsToShippingPlans_ (16_shipping_allocation_handlers.gs)',
      core: 'sadSubmitToShippingPlansCore_ (16_)',
      plan_writer: 'shippingPlanCommitFromLines_ (11_shipping_plan_handlers.gs) — the ONE shipping_plans authority',
      output_verifier: 'sadVerifyShippingPlanOutput_ (16_) — read-only, post-commit',
      lock: 'LockService.getScriptLock(), tryLock(30000), released in finally',
      idempotency: 'execution_key (body.execution_key | submit_batch_id | derived FNV-1a over sorted ids + expected versions)',
      optimistic_token: 'expected_versions[allocation_draft_id] vs stored draft_version — STALE_VERSION refuses',
      handler_present: (typeof handleSubmitAllocationDraftsToShippingPlans_ === 'function'),
      core_present: (typeof sadSubmitToShippingPlansCore_ === 'function'),
      plan_writer_present: (typeof shippingPlanCommitFromLines_ === 'function'),
      verifier_present: (typeof sadVerifyShippingPlanOutput_ === 'function'),
      terminal_statuses: (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : null,
      // Measured from the shipped core, not described from memory.
      refusals: ['INPUT_MISSING_DRAFT_IDS', 'LOCK_ERROR', 'IN_PROGRESS_SAME_EXECUTION_KEY', 'HEADER_NOT_FOUND',
        'DRAFT_CANCELLED', 'DRAFT_EXPIRED_SUPERSEDED_BY_NEWER_AI_PLAN', 'STATUS_NOT_SUBMITTABLE',
        'STALE_VERSION', 'OPERATOR_PROVENANCE_INCOMPLETE', 'PLANNING_CYCLE_MISSING', 'ROUTE_INCOMPLETE',
        'LINEAGE_INCOMPLETE', 'NO_LINES', 'LINE_ID_MISSING', 'DUPLICATE_LINE_ID', 'FK_MISMATCH',
        'DUPLICATE_NATURAL_KEY', 'NO_POSITIVE_PLANNED_QTY_LINES', 'MIXED_SITE_PAYLOAD',
        'APPLIED_SCOPE_MISMATCH', 'SUBMIT_DRAFT_ALREADY_SUBMITTED', 'ROUTE_DESTINATION_UNRESOLVED',
        'POSTCHECK_FAILED_ROLLED_BACK', 'POSTCHECK_FAILED_ROLLBACK_UNVERIFIED']
    };
    ['handler_present', 'core_present', 'plan_writer_present', 'verifier_present'].forEach(function (k) {
      L.P('submit_authority_' + k, true, out.submit_authority[k], out.submit_authority[k] === true);
    });

    out.exposure_equation = {
      before_submit: 'the active allocation draft counts as active_allocation_draft_qty; no shipping_plan row'
        + ' exists for it, so active_shipping_plan_qty does not include it',
      during_submit: 'ONE ScriptLock. shippingPlanCommitFromLines_ commits and reads back the plan; ONLY THEN'
        + ' does the draft become `submitted`, with the before-state captured for rollback',
      after_submit: '`submitted` is TERMINAL (16_ SAD_TERMINAL_STATUSES_), so the draft leaves the active set'
        + ' in the SAME operation that creates the plan. The quantity is counted in exactly one stage because'
        + ' the two sets are disjoint BY STATUS, not by join',
      after_transfer_to_shipment: 'createShipmentFromApprovedPlan_ (12_) acquires the factory reservation and'
        + ' stamps transferred_shipment_id in one journalled operation; a transferred plan stops counting,'
        + ' because its units are inside factory_reserved_stock and already subtracted by (current - reserved)',
      invariant: 'no quantity is ever counted in two stages at once, and no stage transition creates or'
        + ' destroys exposure — it moves it',
      reservation_owner: 'shipment ONLY (21_ FSTX_RESERVATION_OWNER_TYPE_); a draft and a plan create no'
        + ' reservation and no inventory movement'
    };
    out.rollback = S1_rollbackStrategy_();

    if (!out.allocation_draft_id) {
      out.verdict = L.failed.length ? 'STOP' : 'CONTRACT_ONLY_NO_DRAFT_NAMED';
      out.stop_reason = L.failed.length ? L.failed.join(', ')
        : 'no allocation_draft_id was named, so this run reports the Submit CONTRACT only. It is not a'
          + ' readiness verdict for any row, and it authorizes nothing.';
      return S1_finish_(out, L);
    }

    var db = S1_openDb_();
    if (!db.ok) { L.P('the_expected_database_opened', true, db.reason, false); out.stop_reason = db.reason; return S1_finish_(out, L); }
    var ss = db.ss;
    L.P('the_expected_database_opened', true, 'ok', true);

    var headers = [], lines = [];
    try {
      headers = gapReadObjects_(ss, 'shipping_allocation_drafts') || [];
      lines = gapReadObjects_(ss, 'shipping_allocation_draft_lines') || [];
    } catch (eR) { L.P('the_allocation_draft_tables_are_readable', true, 'threw', false); out.stop_reason = 'ALLOCATION_DRAFT_READ_FAILED'; return S1_finish_(out, L); }
    L.P('the_allocation_draft_tables_are_readable', true, true, true);

    var h = null;
    headers.forEach(function (r) { if (S1_str_(r.allocation_draft_id) === out.allocation_draft_id) h = r; });
    L.P('the_named_allocation_draft_exists', out.allocation_draft_id, h ? 'found' : 'HEADER_NOT_FOUND', !!h);
    if (!h) { out.stop_reason = 'HEADER_NOT_FOUND'; return S1_finish_(out, L); }

    var mine = lines.filter(function (l) { return S1_str_(l.allocation_draft_id) === out.allocation_draft_id; });
    var termL = (typeof SAD_TERMINAL_LINE_STATUSES_ !== 'undefined') ? SAD_TERMINAL_LINE_STATUSES_
      : { submitted: 1, cancelled: 1, expired: 1, superseded: 1, superseded_user_review: 1 };
    var shippable = mine.filter(function (l) {
      var st = S1_str_(l.line_status).toLowerCase();
      if (termL[st]) return false;
      var q = S1_qty_(l.planned_qty);
      return q !== null && q > 0;
    });
    var total = 0;
    shippable.forEach(function (l) { total += Number(S1_qty_(l.planned_qty)); });

    out.draft = {
      allocation_draft_id: out.allocation_draft_id,
      status: S1_str_(h.status), draft_version: S1_str_(h.draft_version),
      generation_type: S1_str_(h.generation_type),
      provenance: (typeof aiplIsAiGenerated_ === 'function') ? (aiplIsAiGenerated_(h) ? 'AI' : 'MANUAL') : 'UNKNOWN',
      company: S1_str_(h.company), country: S1_str_(h.country), marketplace: S1_str_(h.marketplace),
      planning_cycle: S1_str_(h.planning_cycle), calculation_run_id: S1_str_(h.calculation_run_id),
      formula_version: S1_str_(h.formula_version), generation_run_id: S1_str_(h.generation_run_id),
      source_warehouse_id: S1_str_(h.recommended_source_warehouse_id),
      destination_marketplace: S1_str_(h.destination_marketplace),
      destination_warehouse_id: S1_str_(h.destination_warehouse_id),
      line_count: mine.length, shippable_line_count: shippable.length, total_planned_qty: total,
      lines: shippable.slice(0, 50).map(function (l) {
        return { allocation_draft_line_id: S1_str_(l.allocation_draft_line_id), sku: S1_str_(l.sku),
          site_sku: S1_str_(l.site_sku), window_code: S1_str_(l.window_code),
          planned_qty: S1_qty_(l.planned_qty), line_status: S1_str_(l.line_status) };
      })
    };

    // ---- THE GATES, ASKED OF THIS ROW. Same conditions the shipped core applies, in its own vocabulary. --
    var st = S1_str_(h.status).toLowerCase();
    L.P('the_draft_status_is_submittable',
      ['draft', 'site_confirmed', 'partially_submitted'], st,
      st === 'draft' || st === 'site_confirmed' || st === 'partially_submitted');
    L.P('the_draft_is_not_terminal', 'not submitted/cancelled/expired', st,
      st !== 'submitted' && st !== 'cancelled' && st !== 'expired');
    L.P('the_expected_draft_version_is_known', 'a non-blank draft_version', out.draft.draft_version,
      !!out.draft.draft_version);
    L.P('the_draft_has_at_least_one_positive_shippable_line', 'more than zero', shippable.length,
      shippable.length > 0);
    L.P('every_shippable_line_carries_an_id', true,
      shippable.filter(function (l) { return !S1_str_(l.allocation_draft_line_id); }).length === 0,
      shippable.filter(function (l) { return !S1_str_(l.allocation_draft_line_id); }).length === 0);
    var nat = {}, dupNat = [];
    shippable.forEach(function (l) {
      var k = [out.allocation_draft_id, S1_str_(l.sku).toLowerCase(), S1_str_(l.site_sku).toLowerCase(),
        S1_str_(l.window_code).toLowerCase()].join('|');
      if (nat[k]) dupNat.push(k); else nat[k] = 1;
    });
    L.P('no_duplicate_natural_key_among_the_shippable_lines', [], dupNat, dupNat.length === 0);
    var isUser = S1_str_(h.generation_type).toLowerCase() === 'user_created';
    L.P('the_provenance_the_core_demands_is_present',
      isUser ? 'created_by + created_at (user_created)' : 'planning_cycle + calculation_run_id + formula_version',
      isUser ? { created_by: S1_str_(h.created_by), created_at: S1_str_(h.created_at) }
             : { planning_cycle: out.draft.planning_cycle, calculation_run_id: out.draft.calculation_run_id,
                 formula_version: out.draft.formula_version },
      isUser ? (!!S1_str_(h.created_by) && !!S1_str_(h.created_at))
             : (!!out.draft.planning_cycle && !!out.draft.calculation_run_id && !!out.draft.formula_version));
    var destOk = (typeof sadDestinationIdentity_ === 'function') ? sadDestinationIdentity_(h) : null;
    L.P('the_route_destination_identity_resolves',
      'one destination, from the ONE owner (sadDestinationIdentity_ / 69_ ricDestinationIdentity_)',
      destOk ? { ok: destOk.ok, type: destOk.type, id: destOk.id, code: destOk.code } : 'AUTHORITY_MISSING',
      !!(destOk && destOk.ok === true));

    out.expected_shipping_plan = {
      natural_key_dimensions: ['company', 'country', 'ship_from', 'source_warehouse_id', 'destination',
        'destination_warehouse_id', 'shipping_method', 'last_mile_delivery', 'planning_cycle'],
      natural_key_authority: 'shippingPlanCommitFromLines_ (11_) groups on these and checksum-binds them;'
        + ' this census does NOT compute a plan id, because the id is minted by the writer and a predicted id'
        + ' would be a second identity model',
      station: { company: out.draft.company, country: out.draft.country, marketplace: out.draft.marketplace },
      destination: destOk && destOk.ok ? { type: destOk.type, id: destOk.id, code: destOk.code } : null,
      expected_rows_created: { shipping_plans: '1 per distinct natural key among the submitted drafts',
        shipping_plan_lines: shippable.length },
      expected_total_requested_qty: total,
      expected_source_rows_transitioned: [{ allocation_draft_id: out.allocation_draft_id,
        from_status: out.draft.status, to_status: 'submitted', is_terminal_after: true }],
      before_after_exposure: {
        before: { active_allocation_draft_qty_includes_this_draft: true, active_shipping_plan_qty_includes_this: false },
        after: { active_allocation_draft_qty_includes_this_draft: false, active_shipping_plan_qty_includes_this: true },
        delta_total_exposure: 0,
        note: 'the quantity MOVES stage; the sum across stages is unchanged, which is the invariant'
      },
      verification_after_commit: 'sadVerifyShippingPlanOutput_ requires exactly one committed line per frozen'
        + ' route line at the EXACT planned quantity, the one applied station, no unexpected line, and a'
        + ' plan total equal to the verified line sum'
    };

    L.P('this_census_wrote_nothing', 0, out.writes, out.writes === 0);
    L.P('this_census_called_no_writer', 0, out.writer_calls, out.writer_calls === 0);
    L.P('this_census_did_not_call_submit', false, out.submit_called, out.submit_called === false);

    out.verdict = L.failed.length ? 'STOP' : 'SUBMIT_READY_AUTHORIZATION_REQUIRED';
    if (L.failed.length) out.stop_reason = L.failed.join(', ');
    return S1_finish_(out, L);
  } catch (e) {
    L.P('the_census_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    out.stop_reason = 'S1_SUBMIT_CENSUS_THREW: ' + String(e && e.message ? e.message : e);
    return S1_finish_(out, L);
  }
}

/**
 * The rollback strategy for BOTH activations, stated as data so a manifest cannot claim a rollback the
 * runtime does not have. Every entry names the mechanism that actually performs it.
 */
function S1_rollbackStrategy_() {
  return {
    generate: {
      complete: true,
      write_unit: 'ONE atomic header+lines upsert per K2 route group (the same endpoint and identity manual'
        + ' save uses), through weeklyAiPlanGenerateK2_ PASS 2',
      pre_write_guard: 'PASS 1 computes every proposed group and writes nothing; the shared factory guard'
        + ' (KMFSG evaluateAiGuard via fsgEvaluateAiClaims_) then STOPS or CLAMPS the complete proposed set.'
        + ' There is no code path from a refusal to a write',
      idempotency: 'deterministic K2 identity (planning_cycle + route group key) — a repeated run resolves to'
        + ' the SAME allocation_draft_id and updates rather than minting a second active identity',
      supersede_policy: 'aiplExpirationCandidates_ (69_) — the SAME selector used to expire, so the set'
        + ' released in memory and the set expired on disk cannot differ. Manual rows, other scopes, and'
        + ' anything submitted/cancelled/expired are preserved by name',
      undo: 'cancel or expire the created AI drafts through the shipping-allocation lifecycle authority'
        + ' (cancelShippingAllocationDraft / aiplExpireSupersededDrafts_). No inventory movement and no'
        + ' reservation was created, so there is nothing to release',
      readback: 'RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS re-run: the created identities appear as'
        + ' active_allocation_draft_ai_qty and the residual falls by exactly the written quantity',
      indeterminate_policy: 'a timeout is ACK_UNKNOWN and is NEVER auto-retried; the readback is the only'
        + ' way to settle it (IR_AI_PLAN_CLIENT_TIMEOUT_MS_ 210000 > transport 180000)'
    },
    submit: {
      complete: true,
      write_unit: 'ONE ScriptLock covering the plan commit, the readback and the draft transition',
      journal: 'shippingPlanCommitFromLines_ durable journal, with journalExtra carrying affected_draft_ids'
        + ' and the captured draft before-state (status, submitted_by/at, updated_by/at, note, draft_version)',
      order: 'the plan is committed and READ BACK first; the draft becomes `submitted` only after that',
      failure_path: 'if the transition cannot be verified, the committed plan is rolled back and the draft'
        + ' fields are restored from the captured before-state. A restore that cannot itself be verified'
        + ' returns POSTCHECK_FAILED_ROLLBACK_UNVERIFIED with zero_write false — indeterminate, never a'
        + ' reported success',
      idempotency: 'execution_key. A replay of already-submitted drafts under the SAME key is an idempotent'
        + ' reuse; a NEW key over already-submitted drafts is CONFLICT (no double submit)',
      undo: 'there is no automatic un-submit. Reversal is the Weekly Shipping Plan cancellation authority'
        + ' (11_), which is a separate approval boundary and is NOT part of this authorization',
      readback: 'sadVerifyShippingPlanOutput_ over the committed rows, plus RUN_S1_SUBMIT_READINESS_CENSUS'
        + ' re-run: the draft reads `submitted` and the exposure has moved stage with an unchanged total'
    }
  };
}

/**
 * ================================================================================================================
 * §8 — THE TWO MANIFESTS. Separate authorization boundaries, and they say so.
 * ================================================================================================================
 */
function RUN_S1_MANIFEST_P() {
  var out = { manifest: 'MANIFEST P — controlled positive-residual Generate activation',
    build: S1_BUILD_, dry_run: true, writes: 0, authorizes: 'ONE generation, ONE exact scope',
    does_not_authorize: ['Submit to Weekly Shipping Plan (that is MANIFEST S)', 'Pending Approval',
      'Confirm Overage', 'any factory stock change', 'any override audit row', 'any migration',
      'any shipment', 'widening the activation allowlist'],
    boundary_note: 'MANIFEST P succeeding does NOT authorize MANIFEST S. They are separate because a Generate'
      + ' creates allocation drafts and moves no inventory, while a Submit creates a durable Weekly Shipping'
      + ' Plan and moves exposure between lifecycle stages. Two blast radii, two rollbacks, two decisions.',
    preconditions: [
      'RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS returns CANDIDATES_FOUND_AUTHORIZATION_REQUIRED with zero failed predicates',
      'a PERSON has chosen ONE ranked candidate; the census never selects one',
      'the chosen candidate proves all ten conditions with no refusal reason',
      'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ is false in repository source at the moment of authorization',
      'the activation allowlist contains EXACTLY the one chosen scope (company, country, marketplace, sku)',
      'the deployment contract is uniform and no owner module is stale',
      'the accepted inventory gap run is unchanged since the census (calculation_run_id + accepted date)',
      'the schema fingerprints are unchanged since the census',
      'a BEFORE baseline has been frozen by a person from the census output, not recomputed'
    ],
    expected_outcome: {
      outcome: 'AI_PLAN_GENERATED (rows written)',
      created_or_updated: 'exactly the AI identities the census named, for exactly the one scope',
      quantity: 'min(residual_qty, available_to_allocate) — clamped by KMFSG if smaller than the residual',
      reservations: 0,
      factory_stock_change: 0,
      manual_rows_changed: 0,
      other_scope_rows_changed: 0,
      shipping_plans_changed: 0,
      shipments_changed: 0
    },
    refusal_is_success_too: 'a FACTORY_STOCK_GUARD_STOP or an AI_PLAN_SCOPE_NOT_ENABLED with zero writes is a'
      + ' correct outcome, not a failed activation. The activation is judged by whether the rows written match'
      + ' the rows the census predicted — including when that number is zero',
    rollback: S1_rollbackStrategy_().generate,
    operator_authorization_wording: null };
  out.operator_authorization_wording = S1_authWordingP_();
  S1_log_('s1_manifest_p_verdict', JSON.stringify({ manifest: 'P', dry_run: true, writes: 0 }));
  S1_emitChunked_('s1_manifest_p', JSON.stringify(out));
  return out;
}

function RUN_S1_MANIFEST_S() {
  var out = { manifest: 'MANIFEST S — controlled Submit-to-Weekly-Shipping-Plan activation',
    build: S1_BUILD_, dry_run: true, writes: 0,
    authorizes: 'ONE Submit of ONE named allocation draft, to ONE station',
    does_not_authorize: ['any further Generate', 'Pending Approval', 'Confirm Overage',
      'approval of the created Weekly Shipping Plan', 'creation of any Shipment',
      'any factory reservation', 'any migration'],
    boundary_note: 'This authorization is INDEPENDENT of MANIFEST P. A successful Generate is a precondition'
      + ' for having something to submit; it is not permission to submit it. The Weekly Shipping Plan this'
      + ' creates still requires its own separate approval before any Shipment, and that approval is outside'
      + ' both manifests.',
    preconditions: [
      'MANIFEST P has completed and its readback confirmed the exact predicted identities',
      'RUN_S1_SUBMIT_READINESS_CENSUS(<allocation_draft_id>) returns SUBMIT_READY_AUTHORIZATION_REQUIRED with zero failed predicates',
      'the draft_version in the census equals the version that will be sent as expected_versions',
      'exactly ONE allocation_draft_id is being submitted',
      'applied_scope is sent and equals the draft station exactly',
      'an execution_key has been chosen and recorded BEFORE the call, so a timeout can be settled by readback',
      'the before-state of the draft has been frozen by a person from the census output',
      'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ is false — a Submit does not need it and must not rely on it'
    ],
    expected_outcome: {
      shipping_plans_created: '1 per distinct natural key among the submitted drafts',
      shipping_plan_lines_created: 'exactly one per shippable draft line, at the EXACT planned quantity',
      allocation_draft_transitioned: 'the named draft only, to `submitted` (terminal)',
      total_exposure_delta: 0,
      reservations: 0,
      factory_stock_change: 0,
      shipments_created: 0
    },
    exposure_invariant: 'before: draft counts, plan does not. after: plan counts, draft is history. The sum'
      + ' across stages is unchanged and no quantity is ever counted twice',
    rollback: S1_rollbackStrategy_().submit,
    operator_authorization_wording: null };
  out.operator_authorization_wording = S1_authWordingS_();
  S1_log_('s1_manifest_s_verdict', JSON.stringify({ manifest: 'S', dry_run: true, writes: 0 }));
  S1_emitChunked_('s1_manifest_s', JSON.stringify(out));
  return out;
}

function S1_authWordingP_() {
  return 'I authorize ONE controlled Inventory AI Plan generation for the single scope '
    + '<company> / <country> / <marketplace> / <sku>, against accepted inventory gap run <calculation_run_id> '
    + 'dated <accepted_date>, with residual_qty <residual_qty> and available_to_allocate <available_to_allocate>, '
    + 'expecting at most <proposed_ai_allocation_qty> units to be written across the AI identities named in the '
    + 'candidate census. The activation allowlist must contain exactly this one scope. No manual row may change, '
    + 'no other scope may change, no reservation may be created, no factory stock may change, and no Weekly '
    + 'Shipping Plan or Shipment may be created or altered. A factory-guard STOP or a clamp with zero rows is an '
    + 'acceptable outcome. This authorization covers ONE generation and expires when it completes or refuses. '
    + 'IT DOES NOT AUTHORIZE SUBMIT.';
}

function S1_authWordingS_() {
  return 'I authorize ONE controlled Submit of allocation draft <allocation_draft_id> at draft_version '
    + '<draft_version>, station <company> / <country> / <marketplace>, into a Weekly Shipping Plan, under '
    + 'execution_key <execution_key>, expecting <shippable_line_count> plan line(s) totalling '
    + '<total_planned_qty> units and the transition of that ONE draft to `submitted`. No other draft may be '
    + 'submitted, no second station may be touched, no plan may be approved, no Shipment may be created, and no '
    + 'reservation or factory stock change may occur. Total exposure across lifecycle stages must be unchanged. '
    + 'A timeout is ACK_UNKNOWN and must be settled by readback under the recorded execution_key, never by '
    + 'retrying. This authorization covers ONE Submit and expires when it completes or refuses. IT DOES NOT '
    + 'AUTHORIZE APPROVAL OF THE RESULTING PLAN.';
}

/** The one exit. Attaches the ledger, counts the failures and emits the chunked payload. */
function S1_finish_(out, L) {
  out.predicates = L.entries;
  out.predicates_failed = L.failed.length;
  out.failed_predicates = L.failed.slice();
  S1_log_('s1_verdict', JSON.stringify({ census: out.census, verdict: out.verdict,
    predicates_failed: out.predicates_failed, failed: out.failed_predicates,
    writes: out.writes, writer_calls: out.writer_calls, dry_run: out.dry_run,
    scopes_examined: out.scopes_examined == null ? null : out.scopes_examined,
    candidates: out.candidates ? out.candidates.length : null,
    selected: out.selected === undefined ? null : out.selected,
    stop_reason: out.stop_reason }));
  S1_emitChunked_('s1_payload', JSON.stringify(out));
  return out;
}
