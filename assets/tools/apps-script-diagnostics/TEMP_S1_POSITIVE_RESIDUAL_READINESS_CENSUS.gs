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
 * S1-R2 — TWO SAFETY BOUNDARIES, TWO ENTRY POINTS, AND THEY ANSWER DIFFERENT QUESTIONS.
 *
 *   ACTIVATION READINESS   RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS. The exact four-axis activation
 *                          allowlist gate is one of the row CONDITIONS, so only an already-allowlisted
 *                          identity can be a candidate or be activation_ready. Its no-candidate verdict is
 *                          NO_POSITIVE_RESIDUAL_CANDIDATE_IN_CURRENT_ALLOWLIST, because the old name read as
 *                          a statement about the whole (company, country) pair and never was one.
 *
 *   PROPOSAL DISCOVERY     RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS. Completely read only, and it
 *                          authorizes nothing. The bootstrap runs in the order a person actually works in:
 *                          SEE which identity is worth a first controlled run, choose it, and only then move
 *                          the allowlist to that single scope — which is its own separate authorization.
 *                          Its range is still the allowlist pairs; inside such a pair every marketplace and
 *                          sku is MEASURED, because being outside the SKU allowlist is a reason a scope may
 *                          not be GENERATED and never a reason its recommendation should read as null.
 *
 * NEITHER RELAXES THE PRODUCTION GENERATE GATE. weeklyAiPlanTargetScopes_ and inventoryAiPlanScopeEnabled_
 * are untouched, are asked per row, and are reported per row; the discovery census additionally PROVES the
 * gate still refuses every non-allowlisted scope it lists. Nothing here modifies the flag, the allowlist, a
 * Script Property, a production global or a spreadsheet value — not temporarily, not by monkey-patch.
 *
 * FOUR WORDS THAT ARE NOT SYNONYMS, and every row carries all four: proposal candidate (the measurable
 * conditions hold), currently_allowlisted (the real gate admits it today), activation_ready (both), and
 * authorization_required (always true — no field returned here has a value that means "go").
 *
 * ----------------------------------------------------------------------------------------------------------------
 * TWO MANIFESTS, TWO AUTHORIZATIONS. MANIFEST P authorizes a controlled positive-residual Generate. MANIFEST S
 * authorizes a controlled Submit of the draft that Generate produced. They are separate because they have
 * different blast radii, different rollbacks and different owners of the failure: P creates allocation drafts
 * (no inventory movement, no reservation), S creates a durable Weekly Shipping Plan and moves exposure between
 * lifecycle stages. P succeeding says nothing about whether S may run, and this file will not imply otherwise.
 * ================================================================================================================
 */

var S1_BUILD_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6';   // the build this census was written against
var S1_CONTRACT_ = 'BATCH S1 — positive-residual + submit readiness, read only, zero writes';

/** The scope axes are ALWAYS all four. A census that matched on three would report a candidate that the
 *  runtime's own allowlist and identity model cannot act on. */
var S1_SCOPE_AXES_ = ['company', 'country', 'marketplace', 'sku'];

/**
 * ================================================================================================================
 * S1-R4 — THE BEFORE BASELINE A PERSON FREEZES, AND THE ONE THING IT MUST NOT BE.
 * ================================================================================================================
 *
 * MANIFEST P emits a freeze block. Until this round it had no DESTINATION, which made it a string nobody
 * could paste and an AFTER readback impossible: a readback that RE-DERIVED the before-state would compare
 * the post-write world with itself and report agreement no matter what happened.
 *
 * So the baseline lives here, as a value A PERSON pastes in from a run that said READY_TO_AUTHORIZE, and it
 * stays null until they do. `null` is the honest default: it means "no baseline has been frozen", which is a
 * refusal condition for any readback rather than an empty comparison that passes.
 *
 * IT IS NEVER WRITTEN BY CODE IN THIS FILE. Nothing here assigns it, and the suite asserts that: a baseline
 * the diagnostic can fill in for itself is not a baseline, it is a second copy of the measurement.
 */
var S1_MANIFEST_P_BEFORE_ = null;

/** The fields a frozen baseline MUST carry. A readback can only refuse a drift it has a before-value for,
 *  so an incomplete freeze is a silent hole and is refused at freeze time instead. */
var S1_FREEZE_REQUIRED_ = [
  'frozen_at', 'build', 'scope_key', 'company', 'country', 'marketplace', 'sku',
  'calculation_run_id', 'accepted_calculation_date', 'calculation_status', 'freshness_state',
  'source_data_as_of', 'planning_cycle',
  'windows', 'recommended_qty', 'qualifying_manual_planned_qty', 'qualifying_ai_planned_qty',
  'residual_qty', 'proposed_ai_allocation_qty', 'would_clamp',
  'source_factory_warehouse_id', 'pool_key', 'factory_current_stock', 'factory_reserved_stock',
  'active_allocation_draft_qty', 'active_shipping_plan_qty', 'available_to_allocate',
  'manual_header_ids', 'manual_line_ids', 'manual_planned_total', 'manual_identity_fingerprint',
  'expected_ai_identities', 'expected_ai_identity_count',
  'identity_universe_count', 'identity_universe_fingerprint', 'other_scope_identity_count',
  'schema_fingerprints', 'reservation_observation_state', 'reservation_row_count',
  'expected_max_units_written', 'expected_clamp'
];

/** A stable fingerprint over a SORTED list of identity strings. Sorted, because enumeration order is not
 *  a property of the data, and a fingerprint that changes when nothing did is a false drift alarm. */
function S1_fingerprint_(list) {
  var joined = (list || []).map(function (x) { return S1_str_(x); }).sort().join('|');
  if (typeof KMFSG !== 'undefined' && KMFSG && typeof KMFSG.fnv1a === 'function') {
    return String(KMFSG.fnv1a(joined)).toUpperCase();
  }
  // A missing hash authority is REPORTED, never substituted with a local hash: two different algorithms
  // would produce two different "fingerprints" for the same rows and a readback would refuse a clean world.
  return null;
}

// S1-R1 — 3000, NOT 45000. The sibling activation census has shipped R6R7_CHUNK_MAX_BYTES_ = 3000 for
// several rounds; this file chose 45000 with no measurement behind it, and production answered 'Logging
// output too large. Truncating output.' The pair-level reasons WERE in the payload and were unreadable,
// which is the same as not having produced them.
var S1_CHUNK_MAX_BYTES_ = 3000;

/** Cap a string for a LOG line, and say so when it was cut. A silently truncated value is a wrong value. */
function S1_cap_(v, n) {
  var t = S1_str_(v);
  return t.length <= n ? t : (t.slice(0, n) + '\u2026[+' + (t.length - n) + ']');
}

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
// S1-R2 — AND A BOUND ON HOW MANY CHUNKS. R1 fixed the chunk SIZE and left the chunk COUNT unbounded, so the
// candidate census — whose payload carries a row per identity in the pair — emitted 189 payload lines in
// production. 189 lines of 3000 bytes is not more readable than one line of 45000; the evidence is equally
// lost, just differently. Above the bound the payload is WITHHELD AND SAID SO: never silently truncated, and
// never the thing a reader has to scroll past to reach the verdict. The full object is the RETURN VALUE.
var S1_LOG_MAX_CHUNKS_ = 12;
function S1_emitChunked_(tag, text) {
  var s = String(text == null ? '' : text), n = Math.ceil(s.length / S1_CHUNK_MAX_BYTES_) || 1;
  if (n > S1_LOG_MAX_CHUNKS_) {
    S1_log_(tag + '_withheld', JSON.stringify({ withheld: true, bytes: s.length, would_be_chunks: n,
      chunk_max_bytes: S1_CHUNK_MAX_BYTES_, max_chunks: S1_LOG_MAX_CHUNKS_,
      note: 'DELIBERATELY NOT LOGGED, NOT TRUNCATED. The segmented lines emitted above carry the evidence'
        + ' at the grain a reader needs it; the complete object is this function\'s return value.' }));
    return 0;
  }
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
 * ================================================================================================================
 * S1-R2 §5 — THE NO-ACTION CLASS OF ONE SCOPE, AND IT REFUSES BEFORE IT GUESSES.
 * ================================================================================================================
 *
 * Production reported scopes whose `residual_qty` was null sitting beside `FULLY_COVERED_BY_ACTIVE_PLAN`. A
 * null residual and a residual of zero are not the same fact and must never print the same word: the first
 * says nobody measured this scope, the second says somebody measured it and the operator has already planned
 * all of it. Reading the first as the second is how a scope that needs attention comes to be reported as
 * finished.
 *
 * SO ALL THREE QUANTITIES MUST BE FINITE BEFORE ANY CLASS IS NAMED. The VALID_ZERO / FULLY_COVERED split then
 * keys off the recommendation STATE exactly as weeklyAiPlanNoActionDecision_ does, because a state this file
 * classified differently from the runtime would be a second opinion — and an unrecognised state is a refusal,
 * so a future enum value cannot be quietly absorbed into the coverage branch.
 */
var S1_NO_ACTION_CLASSES_ = {
  VALID_ZERO: 'VALID_ZERO_RECOMMENDATION',
  FULLY_COVERED: 'FULLY_COVERED_BY_ACTIVE_PLAN',
  RESIDUAL_REMAINS: 'RESIDUAL_REMAINS',
  MISSING: 'MISSING_RECOMMENDATION',
  UNKNOWN: 'UNKNOWN'
};
/** The three recommendation states, PINNED. Compared against the production enum by the suite rather than
 *  read from it, because a check that takes its expectation from the thing it checks cannot fail. */
var S1_RECOMMENDATION_STATES_ = ['VALID_ZERO_RECOMMENDATION', 'NONZERO_RECOMMENDATION', 'MISSING_RECOMMENDATION'];
function S1_rowNoActionClass_(state, recommendedQty, qualifyingQty, residualQty) {
  var out = { class: S1_NO_ACTION_CLASSES_.UNKNOWN, refusal: null,
    grain: 'THIS EXACT (company, country, marketplace, sku) — never the target set\'s aggregate',
    inputs: { recommendation_state: (state === undefined || state === null) ? null : S1_str_(state),
      recommended_qty: recommendedQty === undefined ? null : recommendedQty,
      qualifying_planned_qty: qualifyingQty === undefined ? null : qualifyingQty,
      residual_qty: residualQty === undefined ? null : residualQty } };
  var st = S1_str_(state);
  if (st === '') {
    out.class = S1_NO_ACTION_CLASSES_.MISSING;
    out.refusal = 'THE_RECOMMENDATION_AUTHORITY_RETURNED_NO_STATE_FOR_THIS_SCOPE';
    return out;
  }
  if (S1_RECOMMENDATION_STATES_.indexOf(st) === -1) {
    out.refusal = 'RECOMMENDATION_STATE_IS_NOT_ONE_THIS_CENSUS_RECOGNISES: ' + S1_cap_(st, 60);
    return out;
  }
  if (st === S1_NO_ACTION_CLASSES_.MISSING) {
    out.class = S1_NO_ACTION_CLASSES_.MISSING;
    out.refusal = 'THE_RECOMMENDATION_AUTHORITY_COULD_NOT_READ_THIS_SCOPE';
    return out;
  }
  // MISSING IS NOT ZERO — the whole reason this function exists. Each input is named separately so a refusal
  // says WHICH number was absent, not that something was.
  var r = S1_qty_(recommendedQty), q = S1_qty_(qualifyingQty), d = S1_qty_(residualQty);
  if (r === null) { out.refusal = 'RECOMMENDED_QTY_IS_NOT_A_FINITE_NUMBER'; return out; }
  if (q === null) { out.refusal = 'QUALIFYING_PLANNED_QTY_IS_NOT_A_FINITE_NUMBER'; return out; }
  if (d === null) { out.refusal = 'RESIDUAL_QTY_IS_NOT_A_FINITE_NUMBER'; return out; }
  if (r < 0) { out.refusal = 'RECOMMENDED_QTY_IS_NEGATIVE'; return out; }
  if (q < 0) { out.refusal = 'QUALIFYING_PLANNED_QTY_IS_NEGATIVE'; return out; }
  if (d < 0) { out.refusal = 'RESIDUAL_QTY_IS_NEGATIVE'; return out; }
  if (d > 0) { out.class = S1_NO_ACTION_CLASSES_.RESIDUAL_REMAINS; return out; }
  out.class = (st === S1_NO_ACTION_CLASSES_.VALID_ZERO)
    ? S1_NO_ACTION_CLASSES_.VALID_ZERO : S1_NO_ACTION_CLASSES_.FULLY_COVERED;
  return out;
}

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
  // S1-R1 — A SUMMARY, NOT THE WHOLE MANIFEST. The full contract carries a row per module and it was going
  // into the same log entry as everything else, which is how the pair-level reasons came to be truncated.
  // The full object is still available to a caller that wants it; it is simply not logged.
  if (typeof sysModuleBuildStamps_ === 'function') {
    var _dep = null;
    try { _dep = sysModuleBuildStamps_(); } catch (e3) { _dep = { available: false, error: S1_cap_(e3 && e3.message, 120) }; }
    out.deployment = _dep ? {
      available: _dep.available === true, verdict: _dep.verdict || null,
      deployment_build: _dep.deployment_build || null,
      mixed_deployment: _dep.mixed_deployment === true,
      module_count: (_dep.modules || []).length,
      stale_module_count: (_dep.stale_modules || []).length,
      absent_module_count: (_dep.absent_modules || []).length,
      stale_modules: (_dep.stale_modules || []).slice(0, 6),
      absent_modules: (_dep.absent_modules || []).slice(0, 6),
      error: _dep.error || null,
      note: 'SUMMARY ONLY — the per-module rows are deliberately not logged; they are what truncated the'
        + ' pair-level evidence in the first production run'
    } : null;
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

/**
 * ================================================================================================================
 * S1-R1 §5 — THE ELIGIBLE (company, country) UNIVERSE, TAKEN FROM THE AUTHORITY THAT DECIDES WHAT MAY BE
 * WRITTEN, NOT FROM EVERY ROW IN THE GAP TABLE.
 * ================================================================================================================
 *
 * WHAT WENT WRONG, AND IT WAS THIS FILE'S FAULT. The first version enumerated (company, country) pairs from
 * `inventory_replenishment_gap` and then required that EVERY ONE of them be readable by
 * `weeklyAiPlanCanonicalDemand_`. Production answered STOP on exactly that predicate.
 *
 * PRODUCTION HAS NO SUCH REQUIREMENT AND CANNOT HAVE ONE. `handleGenerateWeeklyAiPlanDraft_` requires a
 * company AND a country on the request and refuses without them (INVALID_SCOPE); the generation universe is
 * ONE (company, country). `weeklyAiPlanCanonicalDemand_` narrows to that pair BEFORE it resolves which
 * snapshot date is accepted. So a pair that some other company's rows created in the same table is not a
 * pair this activation can write, and its readability was never a precondition for anything.
 *
 * THE AUTHORITY IS THE ACTIVATION ALLOWLIST. `weeklyAiPlanTargetScopes_` (61_:2283) builds the scopes a run
 * may write by walking `inventoryAiPlanActivationAllowlist_()`, keeping only entries whose company AND
 * country equal the request's, and re-asking `inventoryAiPlanScopeEnabled_` per entry rather than trusting
 * the list. `inventoryAiPlanScopeEnabled_` (00_) is an exact, case-sensitive, four-part match with no
 * wildcard, no prefix, no ALL and no empty-means-any. The eligible pairs are therefore the DISTINCT
 * (company, country) of the allowlist — and nothing else can ever be written.
 *
 * THIS IS A NARROWING OF WHICH PAIRS ARE REQUIRED, NEVER A WAIVER. An ELIGIBLE pair that is unreadable still
 * STOPS the census, with the same fail-closed force as before. Non-eligible pairs are still enumerated and
 * still have their readability REPORTED — they are simply not allowed to veto a scope they cannot affect.
 * Dropping them from the report would be the other error.
 */
function S1_eligiblePairs_() {
  var out = { ok: false, reason: null,
    authority: 'inventoryAiPlanActivationAllowlist_ (00_), re-gated per entry through'
      + ' inventoryAiPlanScopeEnabled_ — the same two authorities weeklyAiPlanTargetScopes_ (61_) uses to'
      + ' decide which scopes a generation may write',
    allowlist_entry_count: 0, scopes: [], pairs: [], pair_index: {} };
  if (typeof inventoryAiPlanActivationAllowlist_ !== 'function'
    || typeof inventoryAiPlanScopeEnabled_ !== 'function') {
    out.reason = 'AI_PLAN_SCOPE_GUARD_UNAVAILABLE';
    return out;
  }
  var list = null;
  try { list = inventoryAiPlanActivationAllowlist_() || []; } catch (e) { out.reason = 'ALLOWLIST_READ_FAILED'; return out; }
  out.allowlist_entry_count = list.length;
  list.forEach(function (e) {
    var c = S1_str_(e && e.company), k = S1_str_(e && e.country),
      m = S1_str_(e && e.marketplace), sk = S1_str_(e && e.sku);
    // The gate is RE-ASKED, exactly as 61_ does it, so a blank or ALL entry can never become eligible even
    // if one were added to the config by hand.
    if (!inventoryAiPlanScopeEnabled_(c, k, m, sk)) return;
    out.scopes.push({ company: c, country: k, marketplace: m, sku: sk });
    var pk = c + '|' + k;
    if (!out.pair_index[pk]) { out.pair_index[pk] = { company: c, country: k }; out.pairs.push(pk); }
  });
  out.pairs.sort();
  out.ok = out.scopes.length > 0;
  if (!out.ok) out.reason = 'AI_PLAN_SCOPE_NOT_ENABLED';
  return out;
}

/**
 * The GAP RUN LINEAGE, from its own authority. `inventory_replenishment_gap` has NO calculation_run_id
 * column (INV_GAP_HEADERS_, 43_) — the run id lives in the GAP_JOB_INVENTORY script property and is resolved
 * by weeklyAiPlanResolveGapRunLineage_ (61_). The first version of this census read `r.calculation_run_id`
 * off the row and therefore reported null for every identity, which reads as 'the run id is unknown' when
 * the truth is 'it was asked of the wrong thing'.
 */
function S1_gapLineage_(cycle) {
  if (typeof weeklyAiPlanResolveGapRunLineage_ !== 'function') {
    return { ok: false, reason: 'LINEAGE_AUTHORITY_MISSING', authority: null };
  }
  var r = null;
  try { r = weeklyAiPlanResolveGapRunLineage_(cycle, null, null); }
  catch (e) { return { ok: false, reason: 'LINEAGE_THREW: ' + S1_cap_(e && e.message, 120), authority: 'weeklyAiPlanResolveGapRunLineage_ (61_)' }; }
  return { ok: !!(r && r.ok), reason: (r && r.reason) || null,
    authority: 'weeklyAiPlanResolveGapRunLineage_ (61_) over the GAP_JOB_INVENTORY script property',
    run_id: (r && r.calculation_run_id) || null,
    source_data_as_of: (r && r.source_data_as_of) || null,
    calculated_at: (r && r.calculated_at) || null,
    planning_cycle: (r && r.planning_cycle) || null };
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
 * The qualifying MANUAL plan, ASKED ONCE PER (company, country). weeklyAiPlanQualifyingPlannedQty_ filters
 * headers on company and country only, and its `byKey` is already keyed by the header own marketplace and
 * the line own sku, so ONE call answers for every identity in the pair. The old census asked it once per
 * identity: 118 identities meant 236 reads of the same two tables for the same answer.
 */
function S1_qualifyingFor_(E, company, country) {
  var ck = S1_str_(company) + '|' + S1_str_(country);
  if (Object.prototype.hasOwnProperty.call(E.plannedCache, ck)) return E.plannedCache[ck];
  var p = null;
  try {
    p = weeklyAiPlanQualifyingPlannedQty_(E.ss, { company: company, country: country,
      marketplace: '', planningCycle: E.cycle });
  } catch (e) { p = null; }
  E.plannedCache[ck] = p;
  return p;
}

/**
 * ================================================================================================================
 * S1-R2 §1/§5 — ONE IDENTITY, MEASURED AT ROW GRAIN, BY BOTH CENSUSES THROUGH THE SAME CODE.
 * ================================================================================================================
 *
 * WHAT WENT WRONG, AND IT WAS THIS FILE FAULT AGAIN. `weeklyAiPlanRecommendationState_().state` and
 * `weeklyAiPlanNoActionDecision_().reason` are properties of the WHOLE authorized TARGET SET. This census
 * asked the authority ONCE — with the allowlist target set, which in production holds exactly one scope —
 * and then printed that single answer onto all 118 identities of the pair. So 100 identities the authority
 * had never evaluated came back carrying NONZERO_RECOMMENDATION and FULLY_COVERED_BY_ACTIVE_PLAN, with
 * their own residual_qty sitting at null in the same row. A claim at the wrong grain is indistinguishable
 * from a false one, and this one said FULLY COVERED about scopes nobody had looked at.
 *
 * EVERY NUMBER BELOW IS THEREFORE THIS IDENTITY OWN, obtained by asking the SAME authority about a
 * SINGLE-SCOPE target set so that its aggregate and its per-scope entry are the same grain. The target set
 * aggregate is still reported, under `target_set`, where it cannot be read as this row answer.
 *
 * THE TWO MODES DIFFER IN ONE THING ONLY: whether the exact four-axis allowlist gate is a CONDITION.
 *   ALLOWLIST  the candidate census. The gate is one of the PROOFS, so a scope outside it can never be a
 *              candidate and never be activation_ready.
 *   PROPOSAL   the discovery census. The gate is still asked and still reported per row, but it does not
 *              decide whether the row is LISTED — listing is what discovery is for.
 *
 * NOTHING HERE WIDENS A GATE. No flag, allowlist, script property, production global or spreadsheet value
 * is modified, monkey-patched or shadowed; no writer, capability, Generate or Submit is reached. The only
 * thing that differs between the modes is which identities get measured.
 */
function S1_identityRow_(E, ident, mode) {
  var ss = E.ss, cycle = E.cycle, can = E.can, canForKey = E.canForKey || {},
    facts = E.facts, aiPlanned = E.aiPlanned, manualIdent = E.manualIdent,
    draftHeaders = E.draftHeaders || [];
  // A two-key shim, so the extracted body reads the schema and the accepted run exactly as it did inside
  // the census and cannot reach anything else on the census object.
  var out = { schema: E.schema, accepted_run: E.acceptedRun };
  var parts = [S1_str_(ident.company), S1_str_(ident.country), S1_str_(ident.marketplace), S1_str_(ident.sku)];
  var key = ident.scope_key || S1_scopeKey_(parts[0], parts[1], parts[2], parts[3]);
  var scope = { company: parts[0], country: parts[1], marketplace: parts[2], planningCycle: cycle };
  var sku = parts[3];
  var C = S1_ledger_();
  var row = { scope: { company: parts[0], country: parts[1], marketplace: parts[2], sku: sku },
    scope_key: key, scope_axes: S1_SCOPE_AXES_.slice(),
    boundary: mode === 'PROPOSAL' ? 'PROPOSAL_DISCOVERY' : 'ACTIVATION_READINESS',
    measurement_grain: 'one exact four-axis identity; the aggregate over the authorized target set is'
      + ' reported separately under target_set and is never this row' };

  // (a) the recommendation, from the one authority, for this exact scope.
  var canHere = canForKey[key] || can;
  // THE PRODUCTION GATE, ASKED EXACTLY AS PRODUCTION ASKS IT, IN BOTH MODES. In ALLOWLIST mode its scope
  // set is what a real generation would be permitted to write. In PROPOSAL mode it is asked anyway,
  // because whether the real gate admits this identity is the most important fact a proposal row carries.
  var targets = null;
  try { targets = weeklyAiPlanTargetScopes_(scope, parts[2]); } catch (e1) { targets = null; }
  row.currently_allowlisted = false;
  if (typeof inventoryAiPlanScopeEnabled_ === 'function') {
    try { row.currently_allowlisted = inventoryAiPlanScopeEnabled_(parts[0], parts[1], parts[2], sku) === true; }
    catch (eG) { row.currently_allowlisted = false; }
  }
  row.allowlist_gate_authority = 'inventoryAiPlanScopeEnabled_ (00_), exact and case-sensitive on all four'
    + ' axes, asked directly rather than inferred from whether the authority returned a quantity';
  // THE TARGET SET AGGREGATE, KEPT WHERE IT CANNOT BE READ AS THIS ROW. This is the value that used to BE
  // row.recommendation_state, and printing it at row grain is what made 100 identities the authority had
  // never evaluated claim NONZERO_RECOMMENDATION and FULLY_COVERED_BY_ACTIVE_PLAN.
  var setState = null;
  try { setState = (targets && canHere) ? weeklyAiPlanRecommendationState_(canHere, targets) : null; } catch (e2) { setState = null; }
  var setPlanned = S1_qualifyingFor_(E, parts[0], parts[1]);
  var setDecision = null;
  try { setDecision = (setState && setPlanned) ? weeklyAiPlanNoActionDecision_(setState, setPlanned) : null; }
  catch (e2b) { setDecision = null; }
  row.target_set = { authority: 'weeklyAiPlanTargetScopes_ (61_), the allowlist-derived scope set',
    ok: targets ? targets.ok === true : null, reason: targets ? (targets.reason || null) : null,
    scope_count: targets ? ((targets.scopes || []).length) : null,
    recommendation_state: setState ? setState.state : null,
    no_action_reason: setDecision ? (setDecision.reason || null) : null,
    grain: 'THE WHOLE AUTHORIZED SCOPE SET, NOT THIS ROW. Reported so the two grains can be compared,'
      + ' never as this identity own answer' };
  // ---- THIS IDENTITY OWN ANSWER, from the same authority, asked about ONE scope. --------------------
  // A single-scope target set makes the authority aggregate and its per-scope entry the SAME grain, so no
  // state, quantity or residual has to be re-derived here. The scope set is the only thing that differs,
  // and it is an argument to a pure read-only mapping from snapshot to quantities: it is not a gate, it
  // reaches no writer, and it cannot widen what a generation may write.
  var oneTarget = { ok: true, reason: null,
    scopes: [{ company: parts[0], country: parts[1], marketplace: parts[2], sku: sku }],
    requested_marketplace: parts[2], synthesized_read_only: true };
  var recState = null;
  try { recState = canHere ? weeklyAiPlanRecommendationState_(canHere, oneTarget) : null; } catch (e2c) { recState = null; }
  var mine = null;
  if (recState && Object.prototype.toString.call(recState.per_scope) === '[object Array]') {
    recState.per_scope.forEach(function (s) { if (S1_str_(s.key) === key) mine = s; });
  }
  row.recommendation_state = recState ? recState.state : null;
  row.recommendation_state_grain = 'a single-scope ask of weeklyAiPlanRecommendationState_ about this'
    + ' identity alone';
  row.not_evaluated_reason = mine ? (mine.reason || null) : 'NOT_RETURNED_BY_THE_RECOMMENDATION_AUTHORITY';
  row.recommendation_authority = recState ? recState.authority_rule : null;
  row.windows = mine ? (mine.windows || null) : null;
  row.recommended_qty = mine ? S1_qty_(mine.recommended_qty) : null;
  // FROM THE LINEAGE AUTHORITY. The gap row has no such column (43_ INV_GAP_HEADERS_), so reading it off
  // the row reported null for everything and made a resolvable run id look unknown.
  row.calculation_run_id = (out.accepted_run.lineage && out.accepted_run.lineage.run_id) || null;
  row.calculation_date = mine ? (S1_str_(mine.calculation_date) || null) : null;
  row.calculation_status = mine ? (S1_str_(mine.calculation_status) || null) : null;
  row.freshness_state = out.accepted_run.freshness_state;
  row.accepted_date = out.accepted_run.accepted_date;

  // (b) the qualifying MANUAL plan and the residual, from the one authority.
  var planned = setPlanned, decision = null;
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
  // S1-R2 §5 — THE CLASS IS COMPUTED FROM THIS ROW OWN THREE NUMBERS, AND IT REFUSES BEFORE IT GUESSES.
  // `decision.reason` used to be copied straight in. At the target set grain that is a true statement
  // about a different thing, and printed beside a null residual it read as FULLY_COVERED_BY_ACTIVE_PLAN:
  // the census reported a scope as finished that it had not measured.
  var cls = S1_rowNoActionClass_(row.recommendation_state, row.recommended_qty,
    row.qualifying_manual_planned_qty, row.residual_qty);
  row.no_action_reason = cls.class;
  row.no_action_reason_refusal = cls.refusal;
  row.no_action_reason_inputs = cls.inputs;
  row.no_action_reason_grain = cls.grain;
  // The authority own answer AT THIS GRAIN (the single-scope ask), reported for comparison. Where the two
  // differ this census reports the STRICTER one and names the input that forced it: the decision authority
  // reads an unreadable plan table as a planned zero, which is right for a runtime that must still answer
  // and wrong for a readiness claim that may refuse.
  row.authority_no_action_reason = decision ? (decision.reason || null) : null;
  row.no_action_reason_stricter_than_authority =
    !!(row.authority_no_action_reason && row.no_action_reason !== row.authority_no_action_reason);
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

  // ---- THE PROOFS. Each one separately, each one named. -----------------------------------------------
  // S1-R2 §7 — the four-axis identity and the schema first: a quantity measured against an unknown schema,
  // or attached to an identity missing an axis, is not evidence about anything.
  var axesPresent = parts.filter(function (p) { return S1_str_(p) !== ''; }).length;
  C.P('the_identity_carries_all_four_axes', 4, axesPresent, axesPresent === 4);
  var fpMissing = ['inventory_replenishment_gap', 'shipping_allocation_drafts',
    'shipping_allocation_draft_lines', 'factory_stock'].filter(function (t) {
    return !(row.schema_fingerprints && row.schema_fingerprints[t]);
  });
  C.P('every_schema_fingerprint_this_row_depends_on_is_present', [], fpMissing, fpMissing.length === 0);
  // S1-R2 §5/§7 — EACH QUANTITY SEPARATELY FINITE. These were reachable only through the residual proof,
  // so an absent recommendation and an absent plan produced the same sentence about the residual. They are
  // different facts: one says the run did not measure this scope, the other says the plan table did not
  // read. Neither is a zero.
  C.P('recommended_qty_is_a_finite_number', 'a finite number', row.recommended_qty,
    S1_qty_(row.recommended_qty) !== null);
  C.P('qualifying_manual_planned_qty_is_a_finite_number', 'a finite number',
    row.qualifying_manual_planned_qty, S1_qty_(row.qualifying_manual_planned_qty) !== null);
  C.P('qualifying_ai_exposure_qty_is_a_finite_number', 'a finite number',
    row.qualifying_ai_planned_qty, S1_qty_(row.qualifying_ai_planned_qty) !== null);
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
  // A proposal of zero is not a proposal. min(residual, available) can land on zero with both inputs
  // finite and positive-looking, and a row that would write nothing must never be offered as one that
  // would write something.
  C.P('the_proposed_quantity_is_finite_and_greater_than_zero', 'a finite number > 0',
    row.proposed_ai_allocation_qty, S1_qty_(row.proposed_ai_allocation_qty) !== null
      && row.proposed_ai_allocation_qty > 0);
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

  // S1-R2 §9 — THE BOUNDARY, AS A NAMED CONDITION RATHER THAN AN ACCIDENT.
  // Before this round a non-allowlisted identity was refused only because the authority had not returned a
  // quantity for it, which surfaced as 'the recommendation is not current and ready' — a true sentence
  // about the wrong thing. The exact four-axis gate is now its own condition, so a scope outside the
  // allowlist is refused for being outside the allowlist, by name, and can never be activation_ready.
  if (mode !== 'PROPOSAL') {
    C.P('the_scope_is_in_the_current_activation_allowlist',
      'inventoryAiPlanScopeEnabled_ admits this exact company, country, marketplace and sku',
      row.currently_allowlisted, row.currently_allowlisted === true);
  }
  row.proofs = C.entries;
  row.refusal_reasons = C.failed;
  row.is_candidate = C.failed.length === 0;
  // ACTIVATION READY IS CANDIDACY *AND* THE REAL GATE. In PROPOSAL mode candidacy alone is never enough:
  // moving the allowlist to the chosen scope is a separate, explicit authorization a person has to give.
  row.activation_ready = row.is_candidate === true && row.currently_allowlisted === true;
  row.authorization_required = true;
  row.proposal_only = mode === 'PROPOSAL';
  return row;
}

/**
 * ================================================================================================================
 * S1-R4 — WAS A RESERVATION CREATED? THREE STATES, AND "I DID NOT LOOK" IS ONE OF THEM.
 * ================================================================================================================
 *
 * A generation reserves nothing — 61_'s own activation manifest lists `reservations` among the tables it
 * cannot mutate. That is a STRUCTURAL guarantee and it is the strongest evidence available, but it is not a
 * COUNT, and a baseline needs a count to compare an AFTER against.
 *
 * So the table is observed, and the observation reports WHICH of three things happened. The distinction that
 * matters is the last one: a table that is absent, or present and unreadable, has a row count of NULL and not
 * of zero. Reading "I could not look" as "there was nothing there" is how a readback comes to confirm that no
 * reservation was created by a run that created one.
 */
var S1_RESERVATION_TABLE_ = 'reservations';
function S1_reservationObservation_(ss) {
  var o = { table: S1_RESERVATION_TABLE_, observation_state: null, authority: null,
    server_guarantee: false, row_count: null, column_count: null, acceptable: false, reason: null };
  try {
    var man = (typeof weeklyAiPlanActivationManifest_ === 'function') ? weeklyAiPlanActivationManifest_() : null;
    o.server_guarantee = !!man && (man.tables_guaranteed_zero_mutation || [])
      .indexOf(S1_RESERVATION_TABLE_) !== -1;
    o.server_reservation_expected = man ? (man.reservation_expected === true) : null;
  } catch (eM) { o.server_guarantee = false; }
  if (!ss) {
    o.observation_state = 'DB_NOT_OPENED'; o.authority = 'NONE';
    o.reason = 'the database was never opened, so nothing was observed. Not observing is not observing zero.';
    return o;
  }
  var sh = null;
  try { sh = ss.getSheetByName(S1_RESERVATION_TABLE_); }
  catch (eL) {
    o.observation_state = 'SHEET_PRESENT_BUT_UNREADABLE'; o.authority = 'NONE';
    o.reason = 'LOOKUP_THREW: ' + S1_cap_(eL && eL.message, 120);
    return o;
  }
  if (!sh) {
    // ABSENT is acceptable ONLY on the server's own structural guarantee, and the row count stays null.
    o.observation_state = 'SHEET_ABSENT';
    o.authority = o.server_guarantee ? 'SERVER_MANIFEST_GUARANTEED_ZERO_MUTATION' : 'NONE';
    o.acceptable = o.server_guarantee === true;
    o.reason = o.server_guarantee
      ? 'the table does not exist in this database, and 61_ lists it among the tables a generation cannot'
        + ' mutate — a structural guarantee, not a count. row_count stays null.'
      : 'the table does not exist AND 61_ does not declare it zero-mutation, so nothing carries this claim';
    return o;
  }
  try {
    var last = sh.getLastRow(), cols = sh.getLastColumn();
    o.observation_state = 'SHEET_PRESENT_AND_READABLE';
    o.authority = 'OBSERVED_ROWS';
    o.acceptable = true;
    o.row_count = Math.max(0, last - 1);
    o.column_count = cols;
    o.reason = 'observed directly: a row count an AFTER readback can be compared against';
  } catch (eR) {
    o.observation_state = 'SHEET_PRESENT_BUT_UNREADABLE'; o.authority = 'NONE';
    o.row_count = null;
    o.reason = 'READ_THREW: ' + S1_cap_(eR && eR.message, 120);
  }
  return o;
}

/**
 * S1-R4 — THE FREEZE EMITTER, WITH THE TWO LOCKS THE SIBLING CENSUS PROVED IT NEEDS.
 *
 * A freeze block is an AUTHORIZATION TO PROCEED: it is the thing an operator copies out and pastes in before
 * pressing Generate. The sibling activation census emitted one on every run, refused ones included, and the
 * shape that produced was the worst a diagnostic can take — the refusal scrolls past, the numbered chunks
 * look like the output, and the operator freezes a baseline the manifest declined to sign.
 *
 * LOCK ONE nulls the block whenever the verdict is not READY_TO_AUTHORIZE. LOCK TWO is here: nothing is
 * emitted unless the FINAL verdict says READY, whatever the caller believed. Either alone can be removed by
 * a later edit; both together mean a single edit cannot leak a block.
 *
 * AND THE LOG BOUND IS A REFUSAL, NOT A TRUNCATION. A baseline that does not fit is not shortened — a cut
 * baseline is a wrong baseline, and a readback against one would compare the write to a fiction.
 */
function S1_emitFreeze_(tag, text, verdict, withheldReason) {
  var ready = verdict === 'READY_TO_AUTHORIZE';
  if (!ready || !text) {
    S1_log_(tag + '_freeze_withheld', JSON.stringify({ verdict: verdict || null, chunks: 0,
      paste_into: null, bytes: 0,
      reason: withheldReason || ('WITHHELD_BECAUSE_VERDICT_IS_' + (verdict || 'UNKNOWN')),
      note: 'No freeze block was emitted and nothing from this run may be pasted into'
        + ' S1_MANIFEST_P_BEFORE_. Fix the failed condition(s) and freeze from a run that says'
        + ' READY_TO_AUTHORIZE.' }));
    return 0;
  }
  var n = Math.ceil(String(text).length / S1_CHUNK_MAX_BYTES_) || 1;
  if (n > S1_LOG_MAX_CHUNKS_) {
    S1_log_(tag + '_freeze_withheld', JSON.stringify({ verdict: verdict, chunks: 0, paste_into: null,
      bytes: String(text).length, would_be_chunks: n, max_chunks: S1_LOG_MAX_CHUNKS_,
      reason: 'FREEZE_BLOCK_EXCEEDS_THE_LOG_BOUND',
      note: 'A baseline is never truncated to fit: a cut baseline is a wrong baseline. This is a STOP.' }));
    return 0;
  }
  for (var i = 0; i < n; i++) {
    S1_log_(tag + '_freeze_paste_block_' + (i + 1) + '_of_' + n,
      String(text).slice(i * S1_CHUNK_MAX_BYTES_, (i + 1) * S1_CHUNK_MAX_BYTES_));
  }
  S1_log_(tag + '_freeze_paste_meta', JSON.stringify({ chunks: n, bytes: String(text).length,
    chunk_max_bytes: S1_CHUNK_MAX_BYTES_, paste_into: 'S1_MANIFEST_P_BEFORE_',
    note: 'Concatenate the chunks IN ORDER, paste the result into S1_MANIFEST_P_BEFORE_ in this file, and'
      + ' save BEFORE pressing Generate.' }));
  return n;
}

/**
 * ================================================================================================================
 * GATE D §1-§5 — THE CANDIDATE CENSUS.
 * ================================================================================================================
 * Every scope the CURRENT accepted run knows about is measured. A scope is a CANDIDATE only when all ten
 * proofs hold; every other scope is returned with the exact reasons it is not one, because a scope that was
 * silently dropped is indistinguishable from a scope that was never looked at.
 */
// S1-R4 — `opts.quiet` suppresses THIS census's own log segments when it is being run as MANIFEST P's
// measurement rather than as an operator's entry point. The returned object is identical either way:
// quiet changes what is LOGGED, never what is measured or decided.
function RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS(opts) {
  var S1_QUIET_ = !!(opts && opts.quiet === true);
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

    // ---- S1-R1 — WHICH PAIRS ARE ELIGIBLE. From the allowlist authority; see S1_eligiblePairs_.
    var elig = S1_eligiblePairs_();
    out.eligible_universe = { ok: elig.ok, reason: elig.reason, authority: elig.authority,
      allowlist_entry_count: elig.allowlist_entry_count,
      eligible_pairs: elig.pairs.slice(), eligible_scope_count: elig.scopes.length,
      gap_table_pairs: pairKeys.slice(0, 40), gap_table_pair_count: pairKeys.length };
    L.P('the_eligible_pair_universe_is_derived_from_the_activation_allowlist',
      'at least one allowlisted scope, re-gated through inventoryAiPlanScopeEnabled_',
      { ok: elig.ok, reason: elig.reason, pairs: elig.pairs, scopes: elig.scopes.length }, elig.ok === true);
    // AN ELIGIBLE PAIR THE GAP TABLE DOES NOT HOLD is its own refusal: the scope is authorized and there is
    // nothing materialized for it, which is a DATA question and never a reason to look at another pair.
    var eligMissingFromGap = elig.pairs.filter(function (pk) { return pairKeys.indexOf(pk) === -1; });
    L.P('every_eligible_pair_has_rows_in_the_inventory_gap_table', [], eligMissingFromGap,
      elig.ok === true && eligMissingFromGap.length === 0);
    var eligiblePairKeys = elig.pairs.filter(function (pk) { return pairKeys.indexOf(pk) !== -1; });
    out.eligible_universe.eligible_pairs_present_in_gap = eligiblePairKeys.slice();
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
    // ONE RUN, OR NEITHER — ACROSS THE ELIGIBLE PAIRS. Two ELIGIBLE pairs whose accepted dates differ are two
    // runs and a candidate list spanning both would be measured against a snapshot that does not exist as a
    // whole. A non-eligible pair sitting at another date is a different company's business and cannot make
    // this one ambiguous.
    var eligDates = {};
    eligiblePairKeys.forEach(function (pk) {
      var c = canByPair[pk];
      if (c && c.acceptedDate) eligDates[S1_str_(c.acceptedDate)] = 1;
    });
    var dateList = Object.keys(eligDates).sort();
    var allDateList = Object.keys(acceptedDates).sort();
    L.P('every_eligible_pair_agrees_on_the_accepted_snapshot_date', 'exactly one date', dateList,
      dateList.length === 1);
    // THE ACCEPTED RUN IS THE ELIGIBLE PAIR'S RUN. Taking it from whichever pair happened to sort first was
    // the second half of the same defect: the freshness that got reported could belong to a pair this
    // activation can never write.
    var firstOk = null;
    eligiblePairKeys.forEach(function (pk) { if (!firstOk && canByPair[pk] && canByPair[pk].ok) firstOk = canByPair[pk]; });
    var can = firstOk || canByPair[eligiblePairKeys[0]] || canByPair[pairKeys[0]];
    var notOk = eligiblePairKeys.filter(function (pk) { return !(canByPair[pk] && canByPair[pk].ok === true); });
    // Every pair's readability is still REPORTED. Only the eligible ones gate the verdict.
    out.pair_readability = pairKeys.slice(0, 40).map(function (pk) {
      var c = canByPair[pk] || {};
      return { pair: pk, eligible: eligiblePairKeys.indexOf(pk) !== -1,
        readable: c.ok === true, reason: c.reason || null,
        accepted_date: c.acceptedDate || null, freshness_state: c.freshnessState || null,
        row_count: c.rowCount == null ? null : c.rowCount };
    });
    out.non_eligible_unreadable_pairs = pairKeys.filter(function (pk) {
      return eligiblePairKeys.indexOf(pk) === -1 && !(canByPair[pk] && canByPair[pk].ok === true);
    }).slice(0, 40);
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
      eligible_pairs_examined: eligiblePairKeys.length,
      accepted_dates_across_all_pairs: allDateList,
      eligible_pairs_unreadable: notOk.map(function (pk) { return { pair: pk, reason: (canByPair[pk] || {}).reason || null,
        freshness_state: (canByPair[pk] || {}).freshnessState || null }; }),
      lineage: S1_gapLineage_(cycle),
      freshness_states_seen: Object.keys(freshStates).sort()
    } : null;
    // AN ELIGIBLE pair the authority could not read is a REFUSAL, never a pair with nothing in it. Renamed,
    // because the old name promised something about every pair in the table and that promise was wrong.
    L.P('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair', [],
      out.accepted_run ? out.accepted_run.eligible_pairs_unreadable : 'NO_RUN',
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
    eligiblePairKeys.forEach(function (pk) {
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

    // ---- EVERY IDENTITY, MEASURED AT ITS OWN GRAIN, THROUGH THE SHARED MEASUREMENT. -------------------
    var E = { ss: ss, cycle: cycle, can: can, canForKey: canForKey, facts: facts,
      aiPlanned: aiPlanned, manualIdent: manualIdent, plannedCache: {}, schema: out.schema,
      acceptedRun: out.accepted_run, draftHeaders: draftHeaders };
    keys.forEach(function (key) {
      var parts = String(key).split('|');
      if (parts.length !== 4) {
        out.rejected.push({ scope_key: key, reasons: ['CANONICAL_KEY_DOES_NOT_SPLIT_INTO_FOUR_AXES'] });
        return;
      }
      var row = S1_identityRow_(E, { company: parts[0], country: parts[1], marketplace: parts[2],
        sku: parts[3], scope_key: key }, 'ALLOWLIST');
      if (row.is_candidate) out.candidates.push(row); else out.rejected.push(row);
    });

    // ---- NOTHING DISAPPEARS. Every identity in the universe that the authority did not return is reported.
    var seen = {};
    out.candidates.concat(out.rejected).forEach(function (r) { if (r && r.scope_key) seen[r.scope_key] = 1; });
    universeKeys.forEach(function (uk) {
      if (seen[uk]) return;
      var u = universe[uk];
      // Only an ELIGIBLE pair's identities belong in this census's lists. A non-eligible pair's rows are
      // reported at PAIR grain in out.pair_readability and are not candidates by construction.
      if (eligiblePairKeys.indexOf(u.company + '|' + u.country) === -1) return;
      out.rejected.push({ scope: { company: u.company, country: u.country, marketplace: u.marketplace, sku: u.sku },
        scope_key: uk, scope_axes: S1_SCOPE_AXES_.slice(),
        recommendation_state: null, recommended_qty: null,
        qualifying_manual_planned_qty: null, qualifying_ai_planned_qty: null, residual_qty: null,
        calculation_status: u.calculation_status, calculation_date: u.calculation_date,
        // inventory_replenishment_gap has NO calculation_run_id column; the run id has its own authority.
        calculation_run_id: (out.accepted_run.lineage && out.accepted_run.lineage.run_id) || null,
        accepted_date: out.accepted_run.accepted_date,
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

    // S1-R2 §6 — THE VERDICT NAMES ITS OWN SCOPE. `NO_POSITIVE_RESIDUAL_CANDIDATE` read as a statement
    // about the whole (company, country) pair. It never was one: this census can only answer for the
    // identities the EXACT four-axis allowlist admits, which in production is one SKU. The wider question
    // has its own entry point, RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS, and its own boundary.
    out.scope_of_this_verdict = { boundary: 'ACTIVATION_READINESS',
      answers: 'whether an identity INSIDE the current exact four-axis activation allowlist is a'
        + ' positive-residual candidate',
      does_not_answer: 'whether some other identity in the same (company, country) pair is one. That is'
        + ' RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS, which lists proposals and authorizes nothing.',
      allowlisted_identity_count: out.candidates.concat(out.rejected).filter(function (r) {
        return r && r.currently_allowlisted === true; }).length };
    out.activation_ready_count = out.candidates.filter(function (r) { return r.activation_ready === true; }).length;
    out.verdict = out.candidates.length
      ? (L.failed.length ? 'STOP' : 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED')
      : (L.failed.length ? 'STOP' : 'NO_POSITIVE_RESIDUAL_CANDIDATE_IN_CURRENT_ALLOWLIST');
    if (L.failed.length) out.stop_reason = L.failed.join(', ');
    if (!S1_QUIET_) S1_emitCensusSegments_(out);
    return S1_finish_(out, L, S1_QUIET_);
  } catch (e) {
    L.P('the_census_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    out.stop_reason = 'S1_CENSUS_THREW: ' + String(e && e.message ? e.message : e);
    return S1_finish_(out, L);
  }
}

/**
 * S1-R2 §8 — THE ROLL-UP OF WHY THINGS WERE REFUSED, keyed by the FIRST failed condition. The proofs run in a
 * fixed order, so the first failure is deterministic and is the one an operator would act on. The complete
 * per-identity list is kept on the returned object; only the COUNTS are logged.
 */
function S1_rejectionRollup_(rows, sampleMax) {
  var out = { by_first_reason: {}, reason_count: 0, total: 0, index: [], samples: [] };
  (rows || []).forEach(function (r) {
    out.total++;
    var why = (r && r.refusal_reasons && r.refusal_reasons.length) ? r.refusal_reasons[0]
      : ((r && r.reasons && r.reasons.length) ? r.reasons[0] : 'NO_REASON_RECORDED');
    if (!Object.prototype.hasOwnProperty.call(out.by_first_reason, why)) { out.by_first_reason[why] = 0; out.reason_count++; }
    out.by_first_reason[why]++;
    // ONE LINE PER IDENTITY, so nothing disappears, and small enough that 118 of them are still a return
    // value rather than a log flood.
    out.index.push({ scope_key: r && r.scope_key, first_reason: why,
      allowlisted: r ? r.currently_allowlisted === true : null,
      state: r ? (r.recommendation_state || null) : null,
      residual_qty: r ? (r.residual_qty === undefined ? null : r.residual_qty) : null });
    if (out.samples.length < (sampleMax || 8)) {
      out.samples.push({ scope_key: r && r.scope_key, first_reason: why,
        all_reasons: (r && r.refusal_reasons ? r.refusal_reasons.slice(0, 6) : null),
        allowlisted: r ? r.currently_allowlisted === true : null,
        recommendation_state: r ? (r.recommendation_state || null) : null,
        not_evaluated_reason: r ? (r.not_evaluated_reason || null) : null,
        no_action_reason: r ? (r.no_action_reason || null) : null,
        no_action_reason_refusal: r ? (r.no_action_reason_refusal || null) : null,
        recommended_qty: r ? (r.recommended_qty === undefined ? null : r.recommended_qty) : null,
        qualifying_manual_planned_qty: r ? (r.qualifying_manual_planned_qty === undefined ? null : r.qualifying_manual_planned_qty) : null,
        residual_qty: r ? (r.residual_qty === undefined ? null : r.residual_qty) : null });
    }
  });
  return out;
}

/** One compact line per candidate. The full row stays on the returned object. */
function S1_candidateLine_(r) {
  return { scope: r.scope, scope_key: r.scope_key,
    currently_allowlisted: r.currently_allowlisted === true,
    activation_ready: r.activation_ready === true,
    authorization_required: true, proposal_only: r.proposal_only === true,
    recommendation_state: r.recommendation_state || null,
    no_action_reason: r.no_action_reason || null,
    recommended_qty: r.recommended_qty, qualifying_manual_planned_qty: r.qualifying_manual_planned_qty,
    qualifying_ai_planned_qty: r.qualifying_ai_planned_qty, residual_qty: r.residual_qty,
    available_to_allocate: r.pool ? r.pool.available_to_allocate : null,
    source_factory_warehouse_id: r.source_factory_warehouse_id || null,
    proposed_ai_allocation_qty: r.proposed_ai_allocation_qty, would_clamp: r.would_clamp,
    affected_ai_identities: (r.existing_affected_ai_identities || []).length,
    protected_manual_identities: (r.protected_manual_identities || []).length,
    calculation_status: r.calculation_status || null, calculation_date: r.calculation_date || null,
    calculation_run_id: r.calculation_run_id || null };
}

/** The candidate census, in lines a reader can reach: a summary, one line per candidate, the refusal
 *  COUNTS, and nothing else. The 118-row payload is what produced 189 log lines in production. */
function S1_emitCensusSegments_(out) {
  var roll = S1_rejectionRollup_(out.rejected, 6);
  out.rejection_counts = roll.by_first_reason;
  out.rejection_index = roll.index;
  out.rejection_samples = roll.samples;
  S1_log_('s1_candidate_summary', JSON.stringify({ census: out.census, build: out.build,
    boundary: 'ACTIVATION_READINESS', dry_run: out.dry_run, writes: out.writes,
    writer_calls: out.writer_calls, verdict: out.verdict,
    eligible_pairs: out.eligible_universe ? out.eligible_universe.eligible_pairs : null,
    eligible_scope_count: out.eligible_universe ? out.eligible_universe.eligible_scope_count : null,
    scopes_examined: out.scopes_examined, candidates: out.candidates.length,
    activation_ready: out.activation_ready_count == null ? null : out.activation_ready_count,
    rejected: out.rejected.length, distinct_rejection_reasons: roll.reason_count,
    accepted_date: out.accepted_run ? out.accepted_run.accepted_date : null,
    freshness_state: out.accepted_run ? out.accepted_run.freshness_state : null }));
  var M = out.candidates.length;
  out.candidates.forEach(function (r, i) {
    S1_log_('s1_candidate_' + (i + 1) + '_of_' + M, JSON.stringify(S1_candidateLine_(r)));
  });
  S1_log_('s1_rejection_counts', JSON.stringify({ total: roll.total,
    by_first_reason: roll.by_first_reason, samples: roll.samples.slice(0, 3) }));
}

/**
 * ================================================================================================================
 * S1-R2 §1/§2/§9 — PROPOSAL DISCOVERY. READ ONLY. IT AUTHORIZES NOTHING, AND IT CANNOT.
 * ================================================================================================================
 *
 * THE TWO BOUNDARIES ARE DIFFERENT AND THIS FILE NOW HAS ONE ENTRY POINT FOR EACH.
 *
 *   ACTIVATION READINESS  RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS. The exact four-axis allowlist gate is a
 *                         CONDITION. Only an already-allowlisted identity can be a candidate, and its verdict
 *                         says so in its own name. Nothing about the production Generate gate is relaxed.
 *
 *   PROPOSAL DISCOVERY    this census. It exists because the bootstrap runs in the other order: a person has
 *                         to SEE which identity is worth a first controlled run before anybody moves the
 *                         allowlist to it. Answering that with a census that can only look inside the current
 *                         allowlist is answering a different question, and reporting the answer as
 *                         NO_POSITIVE_RESIDUAL_CANDIDATE made it sound like the pair had nothing in it.
 *
 * THE DISCOVERY RANGE IS STILL DERIVED FROM THE ALLOWLIST, and this is the part that must not be misread. The
 * (company, country) PAIRS come from `inventoryAiPlanActivationAllowlist_`, re-gated per entry, exactly as
 * S1_eligiblePairs_ derives them for the readiness census — in production that is the single pair ResUS|US.
 * Inside such a pair every (marketplace, sku) the accepted run holds is MEASURED, because a scope being
 * outside the current SKU allowlist is a reason it may not be GENERATED and never a reason its recommendation
 * should read as null. A pair no allowlist entry names is not examined at all.
 *
 * WHAT THIS CENSUS IS INCAPABLE OF. It assigns no capability and mints no token; it never calls Generate,
 * Submit, a writer, a migration or the Gap Job; it does not touch
 * INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_, INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_, any Script Property, any
 * production global or any spreadsheet value — not temporarily, not by monkey-patch, not by shadowing.
 * `selected` is ALWAYS null and `proposal_only` is ALWAYS true, and every row states whether the real gate
 * currently admits it. A proposal is a thing to read, and then a person decides.
 *
 * FOUR WORDS THAT ARE NOT SYNONYMS, and every row carries all four:
 *   proposal_candidate       the ten-odd measurable conditions hold for this identity.
 *   currently_allowlisted    inventoryAiPlanScopeEnabled_ admits it TODAY, on all four axes.
 *   activation_ready         both of the above. Anything else is false, and false is the default.
 *   authorization_required   always true. There is no value of this field that means "go".
 */
function RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS() {
  var out = { census: 'RUN_S1_POSITIVE_RESIDUAL_PROPOSAL_CENSUS', contract: S1_CONTRACT_, build: S1_BUILD_,
    boundary: 'PROPOSAL_DISCOVERY',
    boundary_note: 'READ ONLY, AND IT AUTHORIZES NOTHING. A listed proposal is a thing to read. Moving the'
      + ' activation allowlist to a chosen scope is a separate, explicit authorization, and until it is'
      + ' given every row here has activation_ready false.',
    dry_run: true, writes: 0, writer_calls: 0, generate_called: false, submit_called: false,
    migration_called: false, gap_job_called: false,
    allowlist_modified: false, flag_modified: false, script_properties_modified: false,
    verdict: 'STOP', stop_reason: null,
    environment: null, eligible_universe: null, discovery_universe: null, accepted_run: null, schema: null,
    identities_examined: 0, proposals: [], proposal_count: 0, activation_ready_count: 0,
    rejection_counts: {}, rejection_samples: [], rejection_index: [],
    selected: null, proposal_only: true,
    predicates: [], predicates_failed: 0, failed_predicates: [] };
  var L = S1_ledger_();

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.failed_predicates = L.failed.slice();
    out.proposal_count = out.proposals.length;
    // ---- SEGMENT 1: the summary. Counts and one-line facts only.
    S1_log_('s1_proposal_summary', JSON.stringify({ census: out.census, build: out.build,
      boundary: out.boundary, dry_run: out.dry_run, writes: out.writes, writer_calls: out.writer_calls,
      generate_called: out.generate_called, submit_called: out.submit_called,
      allowlist_modified: out.allowlist_modified, flag_modified: out.flag_modified,
      selected: out.selected, proposal_only: out.proposal_only,
      eligible_pairs: out.eligible_universe ? out.eligible_universe.eligible_pairs : null,
      allowlist_entry_count: out.eligible_universe ? out.eligible_universe.allowlist_entry_count : null,
      accepted_date: out.accepted_run ? out.accepted_run.accepted_date : null,
      freshness_state: out.accepted_run ? out.accepted_run.freshness_state : null,
      calculation_run_id: (out.accepted_run && out.accepted_run.lineage) ? out.accepted_run.lineage.run_id : null,
      identities_examined: out.identities_examined, proposals: out.proposals.length,
      activation_ready: out.activation_ready_count,
      rejected: out.rejection_index.length }));
    // ---- SEGMENT 2: one line PER PROPOSAL. This is the list a person chooses from.
    var M = out.proposals.length;
    out.proposals.forEach(function (r, i) {
      S1_log_('s1_proposal_candidate_' + (i + 1) + '_of_' + M, JSON.stringify(S1_candidateLine_(r)));
    });
    // ---- SEGMENT 3: the refusals as CLASSIFIED COUNTS plus a bounded sample. Never 118 objects: that is
    //      what filled the log last time, and a count is what a reader actually needs from a refusal set.
    S1_log_('s1_proposal_rejection_counts', JSON.stringify({ total: out.rejection_index.length,
      by_first_reason: out.rejection_counts, samples: out.rejection_samples.slice(0, 3) }));
    // ---- SEGMENT 4: the verdict, and what a person may do with it.
    S1_log_('s1_proposal_verdict', JSON.stringify({ verdict: out.verdict,
      stop_reason: S1_cap_(out.stop_reason, 300),
      selected: out.selected, proposal_only: out.proposal_only,
      activation_ready: out.activation_ready_count,
      next_action: S1_cap_(out.next_action, 400) }));
    // ---- SEGMENT 5: only when something failed. An empty failure line is noise.
    if (L.failed.length) {
      S1_log_('s1_proposal_failed', JSON.stringify({ failed: L.failed.slice(0, 20), count: L.failed.length }));
    }
    return out;
  }

  try {
    out.environment = S1_environment_();
    L.P('deployment_authorities_are_all_present', [], out.environment.missing_authorities,
      out.environment.missing_authorities.length === 0);
    // THE FLAG MUST BE FALSE EVEN FOR A PROPOSAL. A discovery run against a project where generation is
    // already armed is not read-only in any sense that matters: the next click writes.
    L.P('the_generation_flag_is_false', false, out.environment.flag_value,
      out.environment.flag_value === false);
    L.P('the_activation_allowlist_authority_is_present', true, out.environment.allowlist_present,
      out.environment.allowlist_present === true);
    L.P('the_factory_stock_guard_module_is_present', true, !!out.environment.factory_guard_module,
      !!out.environment.factory_guard_module);
    if (L.failed.length) {
      out.stop_reason = 'the environment cannot support a proposal census: ' + L.failed.join(', ');
      out.next_action = 'Resolve the environment. A proposal read against an armed or unknown deployment is'
        + ' not evidence.';
      return fin();
    }

    var db = S1_openDb_();
    L.P('the_expected_database_opened', true, db.ok ? 'ok' : db.reason, db.ok === true);
    if (!db.ok) { out.stop_reason = db.reason; return fin(); }
    var ss = db.ss;

    out.schema = S1_schemaFingerprints_(ss);
    L.P('every_table_the_census_reads_is_present_and_readable', [], out.schema.unreadable,
      out.schema.unreadable.length === 0);
    if (L.failed.length) { out.stop_reason = 'schema not readable: ' + out.schema.unreadable.join(', '); return fin(); }

    var cycle = null;
    try { var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
      if (ctx && ctx.ok) cycle = ctx.planningCycle; } catch (eC) {}
    L.P('the_canonical_planning_cycle_resolved', 'a cycle', cycle, !!cycle);
    if (!cycle) { out.stop_reason = 'the canonical planning cycle is unresolved'; return fin(); }

    // ---- THE DISCOVERY RANGE. The SAME authority the readiness census uses, and no wider. ---------------
    var elig = S1_eligiblePairs_();
    out.eligible_universe = { ok: elig.ok, reason: elig.reason, authority: elig.authority,
      allowlist_entry_count: elig.allowlist_entry_count,
      eligible_pairs: elig.pairs.slice(), eligible_scope_count: elig.scopes.length,
      allowlisted_scopes: elig.scopes.slice(0, 20),
      note: 'THE PAIRS ARE THE ALLOWLIST PAIRS. An empty or unreadable allowlist yields NO pairs and this'
        + ' census examines nothing; it never falls back to the gap table, because a discovery range that'
        + ' widens when the guard goes missing is the opposite of a guard.' };
    L.P('the_discovery_range_is_derived_from_the_activation_allowlist',
      'at least one allowlisted scope, re-gated through inventoryAiPlanScopeEnabled_',
      { ok: elig.ok, reason: elig.reason, pairs: elig.pairs, scopes: elig.scopes.length },
      elig.ok === true);
    if (!elig.ok) {
      out.stop_reason = 'the discovery range is empty: ' + (elig.reason || 'AI_PLAN_SCOPE_NOT_ENABLED');
      out.next_action = 'There is no allowlisted (company, country) to explore. This census does not choose'
        + ' one, and an absent guard is never read as permission to look everywhere.';
      return fin();
    }

    // ---- THE ACCEPTED RUN, PER ELIGIBLE PAIR. Same authority, same freshness rule, same fail-closed. ----
    var canByPair = {}, dates = {}, unreadable = [];
    elig.pairs.forEach(function (pk) {
      var pr = elig.pair_index[pk], c = null;
      try { c = weeklyAiPlanCanonicalDemand_(ss, { company: pr.company, country: pr.country,
        marketplace: '', planningCycle: cycle }, null); }
      catch (eD) { c = { ok: false, reason: 'CANONICAL_DEMAND_THREW: ' + String(eD && eD.message) }; }
      canByPair[pk] = c;
      if (c && c.acceptedDate) dates[S1_str_(c.acceptedDate)] = 1;
      if (!(c && c.ok === true)) unreadable.push({ pair: pk, reason: (c && c.reason) || null,
        freshness_state: (c && c.freshnessState) || null });
    });
    var dateList = Object.keys(dates).sort();
    var firstOk = null;
    elig.pairs.forEach(function (pk) { if (!firstOk && canByPair[pk] && canByPair[pk].ok) firstOk = canByPair[pk]; });
    var can = firstOk || canByPair[elig.pairs[0]] || null;
    out.accepted_run = can ? { ok: can.ok === true, reason: can.reason || null,
      accepted_date: can.acceptedDate || null, freshness_state: can.freshnessState || null,
      freshness: can.freshness || null, schedule: can.schedule || null, job_state: can.jobState || null,
      distinct_dates: (can.distinctDates || []).slice(0, 20),
      row_count: can.rowCount == null ? null : can.rowCount,
      planning_cycle: cycle, eligible_pairs_examined: elig.pairs.length,
      eligible_pairs_unreadable: unreadable,
      accepted_dates_across_eligible_pairs: dateList,
      lineage: S1_gapLineage_(cycle) } : null;
    L.P('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair', [], unreadable,
      !!(out.accepted_run && out.accepted_run.ok) && unreadable.length === 0);
    L.P('every_eligible_pair_agrees_on_the_accepted_snapshot_date', 'exactly one date', dateList,
      dateList.length === 1);
    var acceptingStates = (typeof KMGSF !== 'undefined' && KMGSF && KMGSF.ACCEPTING) ? KMGSF.ACCEPTING : null;
    var fState = out.accepted_run && out.accepted_run.freshness_state;
    L.P('the_accepted_run_freshness_is_in_the_accepting_set',
      acceptingStates ? Object.keys(acceptingStates) : 'the freshness authority ACCEPTING set',
      fState, !!(fState && (acceptingStates ? acceptingStates[fState] === 1 : /^CURRENT/.test(String(fState)))));
    if (L.failed.length) {
      out.stop_reason = 'the accepted run is not usable: ' + L.failed.join(', ');
      out.next_action = 'Run RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC() and read its root_cause_class'
        + ' before asking the proposal question again.';
      return fin();
    }

    // ---- THE FACTORY FACTS, ONCE, read-only, releaseSet EMPTY for the same reason as the readiness census.
    var facts = null;
    try { facts = fsgReadInventoryFacts_(ss, { releaseSet: {} }); }
    catch (eF) { facts = { ok: false, reason: 'FACTORY_FACTS_THREW: ' + String(eF && eF.message) }; }
    L.P('the_factory_exposure_facts_are_readable', true, facts && facts.ok, !!(facts && facts.ok));
    if (!facts || !facts.ok) { out.stop_reason = 'factory facts unreadable: ' + (facts && facts.reason); return fin(); }
    var aiPlanned = S1_aiPlannedByScope_(facts), manualIdent = S1_manualIdentitiesByScope_(facts);
    var draftHeaders = [];
    try { draftHeaders = (typeof gapReadObjects_ === 'function') ? (gapReadObjects_(ss, 'shipping_allocation_drafts') || []) : []; }
    catch (eH) { draftHeaders = []; }

    // ---- EVERY IDENTITY THE ACCEPTED RUN HOLDS FOR AN ELIGIBLE PAIR. ------------------------------------
    var keys = [], canForKey = {};
    elig.pairs.forEach(function (pk) {
      var c = canByPair[pk];
      Object.keys((c && c.bySite) || {}).forEach(function (k) {
        if (canForKey[k]) return;
        canForKey[k] = c; keys.push(k);
      });
    });
    keys.sort();
    out.discovery_universe = { source: 'the accepted run snapshot for the eligible (company, country)'
      + ' pairs — every marketplace and sku it holds',
      identity_count: keys.length, pairs: elig.pairs.slice(),
      note: 'A scope being outside the current SKU allowlist is a reason it may not be GENERATED. It is'
        + ' never a reason its recommendation should read as null, which is what the readiness census'
        + ' reported for it.' };

    var E = { ss: ss, cycle: cycle, can: can, canForKey: canForKey, facts: facts,
      aiPlanned: aiPlanned, manualIdent: manualIdent, plannedCache: {}, schema: out.schema,
      acceptedRun: out.accepted_run, draftHeaders: draftHeaders };
    var rejected = [];
    keys.forEach(function (key) {
      var parts = String(key).split('|');
      if (parts.length !== 4) { rejected.push({ scope_key: key, reasons: ['CANONICAL_KEY_DOES_NOT_SPLIT_INTO_FOUR_AXES'] }); return; }
      var row = S1_identityRow_(E, { company: parts[0], country: parts[1], marketplace: parts[2],
        sku: parts[3], scope_key: key }, 'PROPOSAL');
      if (row.is_candidate) out.proposals.push(row); else rejected.push(row);
    });
    out.identities_examined = out.proposals.length + rejected.length;

    // ---- THE ORDER IS EVIDENCE FOR A CHOICE, NOT A CHOICE. Least risky first: already allowlisted, then
    //      unclamped, then fewest identities disturbed, then smallest quantity, then the key.
    out.proposals.sort(function (a, b) {
      var aw = a.currently_allowlisted === true ? 0 : 1, bw = b.currently_allowlisted === true ? 0 : 1;
      if (aw !== bw) return aw - bw;
      var ac = a.would_clamp === true ? 1 : 0, bc = b.would_clamp === true ? 1 : 0;
      if (ac !== bc) return ac - bc;
      var aa = (a.existing_affected_ai_identities || []).length, ba = (b.existing_affected_ai_identities || []).length;
      if (aa !== ba) return aa - ba;
      var am = (a.protected_manual_identities || []).length, bm = (b.protected_manual_identities || []).length;
      if (am !== bm) return am - bm;
      if (a.proposed_ai_allocation_qty !== b.proposed_ai_allocation_qty) return a.proposed_ai_allocation_qty - b.proposed_ai_allocation_qty;
      return a.scope_key < b.scope_key ? -1 : (a.scope_key > b.scope_key ? 1 : 0);
    });
    out.proposals.forEach(function (r, i) { r.proposal_rank = i + 1; });
    out.activation_ready_count = out.proposals.filter(function (r) { return r.activation_ready === true; }).length;
    out.not_currently_allowlisted = out.proposals.filter(function (r) { return r.currently_allowlisted !== true; })
      .map(function (r) { return r.scope_key; });

    var roll = S1_rejectionRollup_(rejected, 8);
    out.rejection_counts = roll.by_first_reason;
    out.rejection_index = roll.index;
    out.rejection_samples = roll.samples;

    // ---- THE BOUNDARY, RE-STATED AS CONDITIONS RATHER THAN PROSE. --------------------------------------
    L.P('no_proposal_was_silently_selected', null, out.selected, out.selected === null);
    L.P('every_row_is_marked_proposal_only', true,
      out.proposals.filter(function (r) { return r.proposal_only !== true; }).length, 
      out.proposals.filter(function (r) { return r.proposal_only !== true; }).length === 0);
    // THE ONE THAT MATTERS: a proposal outside the allowlist may be LISTED and may NEVER be activation_ready.
    var readyButNotAllowlisted = out.proposals.filter(function (r) {
      return r.activation_ready === true && r.currently_allowlisted !== true; });
    L.P('no_proposal_outside_the_allowlist_is_marked_activation_ready', [],
      readyButNotAllowlisted.map(function (r) { return r.scope_key; }), readyButNotAllowlisted.length === 0);
    // AND THE GATE IS PROVED STILL SHUT, by asking production own scope authority about each listed row
    // that is not allowlisted. If weeklyAiPlanTargetScopes_ ever returned one of these, the gate would have
    // moved and this census would be describing a world it did not measure.
    var leaked = [];
    out.proposals.forEach(function (r) {
      if (r.currently_allowlisted === true) return;
      var t = null;
      try { t = weeklyAiPlanTargetScopes_({ company: r.scope.company, country: r.scope.country,
        marketplace: r.scope.marketplace, planningCycle: cycle }, r.scope.marketplace); } catch (eT) { t = null; }
      var admits = !!(t && t.ok && (t.scopes || []).filter(function (x) {
        return S1_scopeKey_(x.company, x.country, x.marketplace, x.sku) === r.scope_key; }).length);
      if (admits) leaked.push(r.scope_key);
    });
    L.P('the_production_scope_gate_still_refuses_every_non_allowlisted_proposal', [], leaked, leaked.length === 0);
    L.P('this_census_wrote_nothing', 0, out.writes, out.writes === 0);
    L.P('this_census_called_no_writer', 0, out.writer_calls, out.writer_calls === 0);
    L.P('this_census_called_neither_generate_nor_submit', [false, false],
      [out.generate_called, out.submit_called],
      out.generate_called === false && out.submit_called === false);
    L.P('this_census_changed_neither_the_flag_nor_the_allowlist', [false, false],
      [out.flag_modified, out.allowlist_modified],
      out.flag_modified === false && out.allowlist_modified === false);

    out.verdict = L.failed.length ? 'STOP'
      : (out.proposals.length ? 'PROPOSALS_FOUND_AUTHORIZATION_REQUIRED'
        : 'NO_PROPOSAL_CANDIDATE_IN_ELIGIBLE_PAIRS');
    if (L.failed.length) out.stop_reason = L.failed.join(', ');
    out.next_action = out.proposals.length
      ? ('Read s1_proposal_candidate_* and CHOOSE one. Nothing here is authorized. A chosen scope that is'
        + ' not currently_allowlisted needs its own explicit authorization to move'
        + ' INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ to that single scope; only then can'
        + ' RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS report it activation_ready, and only then does'
        + ' MANIFEST P become answerable.')
      : ('No identity in the eligible pairs meets the conditions. Read s1_proposal_rejection_counts: the'
        + ' first reason is the one to act on, and it names which of data readiness, factory headroom or'
        + ' an already-covered plan is the cause.');
    return fin();
  } catch (e) {
    L.P('the_census_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    out.stop_reason = 'S1_PROPOSAL_CENSUS_THREW: ' + String(e && e.message ? e.message : e);
    out.next_action = 'The exception is the finding. No proposal may be read out of a run that threw.';
    return fin();
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
/**
 * ================================================================================================================
 * S1-R4 — MANIFEST P IS AN ACTIVATION MANIFEST, NOT A CONTRACT PRINTER.
 * ================================================================================================================
 *
 * WHAT IT DID, AND IT WAS THIS FILE'S FAULT. It printed a static object — preconditions as PROSE, an expected
 * outcome with no measured numbers in it, an authorization sentence still carrying <company> / <sku> /
 * <residual_qty> placeholders — and logged `{ manifest: "P", dry_run: true, writes: 0 }`. There was no
 * verdict, because nothing had been decided; no evidence, because nothing had been measured; and no freeze
 * block, because there was nothing to freeze. A production run of it produced exactly that, and the only
 * correct reading of that output is STOP.
 *
 * A manifest whose preconditions are sentences asks a PERSON to verify nine things by eye and then trust
 * their own memory of numbers that were measured on some other day. That is the failure mode the whole
 * readiness package exists to remove.
 *
 * ----------------------------------------------------------------------------------------------------------------
 * SO IT RE-MEASURES, EVERY RUN, FROM THE LIVE AUTHORITIES — and it does that by RUNNING THE CANDIDATE CENSUS
 * rather than by reading a stored candidate or re-deriving anything.
 *
 * That choice is the point. The census is the thing whose measurements the operator has already reviewed;
 * a manifest that measured independently could disagree with it, and two readiness answers for one scope is
 * the one failure a readiness package cannot have. So the manifest asks the census, and then adds the gates
 * that are about AUTHORIZING rather than about measuring: is the allowlist exactly one scope, is that scope
 * the candidate, is the deployment uniform, is the flag still false, is every piece of evidence readable.
 *
 * NOTHING IS CARRIED OVER FROM A PREVIOUS RUN. There is no stored candidate, no remembered quantity and no
 * default anywhere in it: every number below comes from this run, and an authority that cannot be reached is
 * a STOP rather than a blank.
 *
 * ----------------------------------------------------------------------------------------------------------------
 * READY_TO_AUTHORIZE emits a BEFORE baseline in numbered chunks with a destination. STOP emits nothing
 * pasteable and says so. The two locks live in S1_emitFreeze_ and in the verdict assignment below, and
 * either one alone is enough to withhold — because a single later edit must not be able to leak one.
 */
function RUN_S1_MANIFEST_P() {
  var out = { manifest: 'MANIFEST P — controlled positive-residual Generate activation',
    build: S1_BUILD_, dry_run: true,
    // S1-R4 — THE FIVE ZEROES AT THE TOP LEVEL, where the conditions below read them. The static
    // contract declared `writes` and nothing else, so `this_manifest_called_no_writer` compared
    // undefined against 0 and failed on a run where no writer had been reached. Measured, not supposed.
    writes: 0, writer_calls: 0, writer_constructed: false, submit_calls: 0, route_save_calls: 0,
    authorizes: 'ONE generation, ONE exact scope',
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
    // ---- S1-R4: THE LIVE HALF. Every field below is measured on THIS run or the manifest STOPs. --------
    measured_at: null, measurement_authorities: null,
    verdict: 'STOP', stop_reason: null,
    dry_run_proof: { generate_called: false,
      submit_called: false, migration_called: false, gap_job_called: false,
      flag_modified: false, allowlist_modified: false, script_properties_modified: false },
    census: null, environment: null, deployment: null, allowlist: null, scope: null,
    accepted_run: null, lineage: null, schema: null, factory: null, candidate: null,
    identities: null, reservation_observation: null, evidence_gaps: null,
    live_evidence_summary: null,
    frozen_before: null, freeze_paste_block: null, freeze_withheld_reason: null,
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [],
    operator_authorization_wording: null };
  var L = S1_ledger_();

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    // THE VERDICT IS DECIDED HERE AND NOWHERE ELSE, so no earlier branch can hand out a READY.
    out.verdict = (L.failed.length === 0 && out.frozen_before && out.freeze_paste_block)
      ? 'READY_TO_AUTHORIZE' : 'STOP';
    if (out.verdict !== 'READY_TO_AUTHORIZE') {
      // LOCK ONE. A refused run holds no pasteable baseline at all, so there is nothing left to emit.
      if (out.freeze_paste_block) {
        out.freeze_withheld_reason = 'WITHHELD_BECAUSE_VERDICT_IS_STOP — a freeze block is an authorization'
          + ' to proceed and this run did not give one.';
      }
      out.freeze_paste_block = null;
      if (!out.stop_reason) {
        out.stop_reason = L.failed.length
          ? (L.failed.length + ' condition(s) not met: ' + L.failed.join(', ')
            + '. Nothing may be authorized while any of these is false.')
          : 'no BEFORE baseline could be frozen, so there is nothing an AFTER readback could compare'
            + ' against — which makes the activation unverifiable and therefore refused.';
      }
    }
    // The wording is only ever built from MEASURED values, and only on a READY. A sentence with a
    // placeholder in it, or one built from a refused run, is not an authorization.
    out.operator_authorization_wording = (out.verdict === 'READY_TO_AUTHORIZE')
      ? S1_authWordingP_(out.candidate, out.accepted_run, out.scope)
      : null;
    // LOCK THREE — A READY WITH NOTHING TO SIGN IS NOT A READY, and neither is one whose sentence still
    // carries a placeholder. This is the exact shape the round was called to repair: a manifest that
    // printed `<company> / <sku> / <residual_qty>` and called itself an authorization. Making it a runtime
    // refusal rather than a test-only assertion means it cannot come back through an edit that the suite
    // happens not to cover.
    if (out.verdict === 'READY_TO_AUTHORIZE') {
      var w = out.operator_authorization_wording;
      var placeholders = w ? (String(w).match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []) : [];
      if (!w || placeholders.length) {
        out.verdict = 'STOP';
        out.stop_reason = !w
          ? 'the authorization wording could not be built from the measured values, so there is nothing a'
            + ' person could sign — refused rather than emitted without it'
          : 'the authorization wording still contains placeholders (' + placeholders.join(', ')
            + '), which means it was not built from the measured values';
        out.freeze_withheld_reason = 'WITHHELD_BECAUSE_THE_AUTHORIZATION_WORDING_IS_NOT_USABLE';
        out.freeze_paste_block = null;
        out.operator_authorization_wording = null;
        out.wording_refusal = { built: !!w, placeholders: placeholders };
      }
    }
    S1_log_('s1_manifest_p_verdict', JSON.stringify({ manifest: 'P', build: out.build,
      verdict: out.verdict, predicates_passed: out.predicates_passed,
      predicates_failed: out.predicates_failed, failed: out.failed_predicates.slice(0, 20),
      dry_run: out.dry_run, writes: out.writes, writer_calls: out.writer_calls,
      authorization_wording_present: !!out.operator_authorization_wording,
      allowlisted_scope: out.census ? out.census.allowlisted_scope : null,
      allowlisted_scope_refusals: out.census ? (out.census.allowlisted_scope_refusals || []).slice(0, 8) : null,
      freeze_chunks_expected: (out.verdict === 'READY_TO_AUTHORIZE' && out.freeze_paste_block)
        ? (Math.ceil(out.freeze_paste_block.length / S1_CHUNK_MAX_BYTES_) || 1) : 0,
      stop_reason: S1_cap_(out.stop_reason, 400) }));
    if (out.live_evidence_summary) {
      S1_log_('s1_manifest_p_evidence', JSON.stringify(out.live_evidence_summary));
    }
    // LOCK TWO, inside the emitter: it refuses unless the verdict it is HANDED says READY.
    S1_emitFreeze_('s1_manifest_p', out.freeze_paste_block, out.verdict, out.freeze_withheld_reason);
    return out;
  }

  try {
    out.measured_at = (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : null;
    L.P('the_measurement_timestamp_came_from_the_canonical_authority', 'procurementTimestamp_',
      (typeof procurementTimestamp_ === 'function') ? 'procurementTimestamp_' : 'UNAVAILABLE',
      typeof procurementTimestamp_ === 'function');
    out.measurement_authorities = {
      scope: 'inventoryAiPlanActivationAllowlist_ + inventoryAiPlanScopeEnabled_ (00_)',
      accepted_run: 'weeklyAiPlanCanonicalDemand_ (61_)',
      run_lineage: 'weeklyAiPlanResolveGapRunLineage_ (61_) over the GAP_JOB_INVENTORY script property',
      windows_and_recommendation: 'weeklyAiPlanRecommendationState_ (61_), single-scope',
      qualifying_manual: 'weeklyAiPlanQualifyingPlannedQty_ (61_)',
      qualifying_ai: 'KMFSG.draftExposure rows via fsgReadInventoryFacts_ (71_/90_), provenance from 69_',
      residual: 'weeklyAiPlanNoActionDecision_ (61_)',
      factory: 'fsgReadInventoryFacts_ / KMFSG pooled availability (71_/90_)',
      superseded_identities: 'aiplExpirationCandidates_ (69_)',
      deployment: 'sysModuleBuildStamps_ (63_)',
      schema: 'live sheet headers, fingerprinted with KMFSG.fnv1a',
      reservations: 'direct observation, with 61_ weeklyAiPlanActivationManifest_ as the structural claim',
      note: 'NOTHING here is a stored value from a previous run.' };

    // ---- 1. THE CENSUS, RUN LIVE. The manifest does not measure independently of it. ------------------
    var cen = RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS({ quiet: true });
    out.census = { verdict: cen.verdict, predicates_failed: cen.predicates_failed,
      failed_predicates: (cen.failed_predicates || []).slice(0, 20),
      scopes_examined: cen.scopes_examined, candidates: (cen.candidates || []).length,
      activation_ready_count: cen.activation_ready_count == null ? null : cen.activation_ready_count,
      selected: cen.selected, writes: cen.writes, writer_calls: cen.writer_calls,
      ran_live: true };
    L.P('the_candidate_census_was_re_run_live_and_found_candidates',
      'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED with zero failed predicates',
      { verdict: cen.verdict, failed: cen.predicates_failed },
      cen.verdict === 'CANDIDATES_FOUND_AUTHORIZATION_REQUIRED' && cen.predicates_failed === 0);
    L.P('the_census_itself_wrote_nothing', [0, 0], [cen.writes, cen.writer_calls],
      cen.writes === 0 && cen.writer_calls === 0);
    out.environment = cen.environment || null;
    out.schema = cen.schema || null;
    out.accepted_run = cen.accepted_run || null;
    out.lineage = (cen.accepted_run && cen.accepted_run.lineage) || null;
    out.factory = cen.factory || null;

    // ---- 2. THE FLAG AND THE ALLOWLIST, at the moment of authorization. ------------------------------
    L.P('the_generation_flag_is_false_at_this_moment', false,
      out.environment ? out.environment.flag_value : null,
      !!out.environment && out.environment.flag_value === false);
    var list = (out.environment && out.environment.allowlist) || null;
    out.allowlist = { entries: list, entry_count: list ? list.length : null,
      authority: 'inventoryAiPlanActivationAllowlist_ (00_)' };
    L.P('the_activation_allowlist_holds_exactly_one_scope', 1, out.allowlist.entry_count,
      out.allowlist.entry_count === 1);
    var one = (list && list.length === 1) ? list[0] : null;
    out.scope = one ? { company: S1_str_(one.company), country: S1_str_(one.country),
      marketplace: S1_str_(one.marketplace), sku: S1_str_(one.sku),
      scope_key: S1_scopeKey_(one.company, one.country, one.marketplace, one.sku) } : null;
    var axesOk = !!out.scope && [out.scope.company, out.scope.country, out.scope.marketplace, out.scope.sku]
      .filter(function (v) { return v !== ''; }).length === 4;
    L.P('the_one_allowlisted_scope_carries_all_four_axes', 4,
      out.scope ? [out.scope.company, out.scope.country, out.scope.marketplace, out.scope.sku] : null, axesOk);
    // THE GATE IS RE-ASKED. A list entry is not permission; the gate is.
    var gateOk = false;
    if (out.scope && typeof inventoryAiPlanScopeEnabled_ === 'function') {
      try {
        gateOk = inventoryAiPlanScopeEnabled_(out.scope.company, out.scope.country,
          out.scope.marketplace, out.scope.sku) === true;
      } catch (eG) { gateOk = false; }
    }
    L.P('the_production_scope_gate_admits_that_exact_scope', true, gateOk, gateOk === true);

    // ---- 3. THE CANDIDATE IS THAT SCOPE. No selection, and no ambiguity to resolve. -------------------
    var cands = cen.candidates || [];
    // WHY, NOT JUST WHETHER. When the allowlisted identity was measured and refused, the reasons are the
    // operator's next action; when it was not measured at all, that absence is itself the finding.
    var wantKey = out.scope ? out.scope.scope_key : null;
    var refusedRow = null;
    (cen.rejected || []).forEach(function (r) { if (r && r.scope_key === wantKey) refusedRow = r; });
    out.census.allowlisted_scope = wantKey;
    out.census.allowlisted_scope_was_measured = !!refusedRow || cands.filter(function (r) {
      return r.scope_key === wantKey; }).length > 0;
    out.census.allowlisted_scope_refusals = refusedRow ? (refusedRow.refusal_reasons || []) : [];
    out.census.allowlisted_scope_refusal_detail = refusedRow ? {
      recommendation_state: refusedRow.recommendation_state || null,
      no_action_reason: refusedRow.no_action_reason || null,
      no_action_reason_refusal: refusedRow.no_action_reason_refusal || null,
      not_evaluated_reason: refusedRow.not_evaluated_reason || null,
      calculation_status: refusedRow.calculation_status || null,
      recommended_qty: refusedRow.recommended_qty === undefined ? null : refusedRow.recommended_qty,
      qualifying_manual_planned_qty: refusedRow.qualifying_manual_planned_qty === undefined
        ? null : refusedRow.qualifying_manual_planned_qty,
      residual_qty: refusedRow.residual_qty === undefined ? null : refusedRow.residual_qty,
      available_to_allocate: (refusedRow.pool && refusedRow.pool.available_to_allocate !== undefined)
        ? refusedRow.pool.available_to_allocate : null,
      proposed_ai_allocation_qty: refusedRow.proposed_ai_allocation_qty === undefined
        ? null : refusedRow.proposed_ai_allocation_qty,
      source_warehouse_named_by_recommendation: refusedRow.source_warehouse_named_by_recommendation,
      pool_candidate_count: (refusedRow.pool_candidates || []).length
    } : null;
    L.P('the_allowlisted_scope_was_measured_by_the_census', true,
      out.census.allowlisted_scope_was_measured,
      out.census.allowlisted_scope_was_measured === true);
    L.P('the_allowlisted_scope_has_no_refusal_of_its_own', [],
      out.census.allowlisted_scope_refusals, out.census.allowlisted_scope_refusals.length === 0);
    L.P('exactly_one_candidate_was_measured', 1, cands.length, cands.length === 1);
    var cand = cands.length === 1 ? cands[0] : null;
    // ATTACHED, because the authorization wording and the whole report are built FROM it. It was measured
    // and then not carried, so the READY run emitted a freeze block and a null sentence beside it.
    out.candidate = cand;
    L.P('the_single_candidate_is_the_single_allowlisted_scope',
      out.scope ? out.scope.scope_key : null, cand ? cand.scope_key : null,
      !!cand && !!out.scope && cand.scope_key === out.scope.scope_key);
    L.P('the_candidate_is_activation_ready', true, cand ? cand.activation_ready : null,
      !!cand && cand.activation_ready === true);
    L.P('the_candidate_has_no_refusal_reason', [], cand ? (cand.refusal_reasons || []) : 'NO_CANDIDATE',
      !!cand && (cand.refusal_reasons || []).length === 0);
    // AND EVERY ONE OF ITS OWN CONDITIONS PASSED, named individually rather than summarised.
    var badProofs = cand ? (cand.proofs || []).filter(function (x) { return x.pass !== true; })
      .map(function (x) { return x.predicate; }) : 'NO_CANDIDATE';
    L.P('every_candidate_condition_passed', [], badProofs,
      !!cand && (cand.proofs || []).length > 0 && badProofs.length === 0);

    // ---- 4. THE DEPLOYMENT. Evidence measured on another build does not transfer to this one. ---------
    var dep = out.environment ? out.environment.deployment : null;
    out.deployment = dep;
    L.P('the_deployment_contract_is_readable', true, dep ? dep.available : null,
      !!dep && dep.available === true);
    L.P('the_deployment_is_not_mixed', false, dep ? dep.mixed_deployment : null,
      !!dep && dep.mixed_deployment === false);
    L.P('no_owner_module_is_stale', 0, dep ? dep.stale_module_count : null,
      !!dep && dep.stale_module_count === 0);
    L.P('no_owner_module_is_absent', 0, dep ? dep.absent_module_count : null,
      !!dep && dep.absent_module_count === 0);
    L.P('the_deployment_build_is_the_one_this_manifest_was_written_against', S1_BUILD_,
      dep ? dep.deployment_build : null, !!dep && dep.deployment_build === S1_BUILD_);

    // ---- 5. THE SCHEMA. A quantity is only evidence about the schema it was measured against. ---------
    L.P('every_table_this_manifest_reads_is_present_and_readable', [],
      out.schema ? out.schema.unreadable : 'NO_SCHEMA',
      !!out.schema && (out.schema.unreadable || []).length === 0);
    var fpTables = ['inventory_replenishment_gap', 'shipping_allocation_drafts',
      'shipping_allocation_draft_lines', 'factory_stock', 'shipping_plans', 'shipping_plan_lines',
      'warehouses'];
    var fps = {}, fpMissing = [], colCounts = {};
    fpTables.forEach(function (t) {
      var row = (out.schema && out.schema.tables) ? out.schema.tables[t] : null;
      fps[t] = row ? row.fingerprint : null;
      colCounts[t] = row ? row.column_count : null;
      if (!row || !row.fingerprint || !row.column_count) fpMissing.push(t);
    });
    L.P('every_schema_fingerprint_and_column_count_is_present', [], fpMissing, fpMissing.length === 0);

    // ---- 6. THE RUN LINEAGE AND THE ACCEPTED SNAPSHOT. -----------------------------------------------
    L.P('the_gap_run_lineage_resolves_to_a_run_id', 'a run id',
      out.lineage ? { ok: out.lineage.ok, reason: out.lineage.reason, run_id: out.lineage.run_id } : null,
      !!out.lineage && out.lineage.ok === true && !!out.lineage.run_id);
    L.P('the_run_lineage_names_the_source_data_it_was_built_from', 'a source_data_as_of',
      out.lineage ? out.lineage.source_data_as_of : null,
      !!out.lineage && !!out.lineage.source_data_as_of);
    L.P('the_accepted_run_is_readable', true, out.accepted_run ? out.accepted_run.ok : null,
      !!out.accepted_run && out.accepted_run.ok === true);
    L.P('the_accepted_snapshot_names_a_date', 'a date',
      out.accepted_run ? out.accepted_run.accepted_date : null,
      !!out.accepted_run && !!out.accepted_run.accepted_date);
    var accepting = (typeof KMGSF !== 'undefined' && KMGSF && KMGSF.ACCEPTING) ? KMGSF.ACCEPTING : null;
    var fState = out.accepted_run ? out.accepted_run.freshness_state : null;
    L.P('the_snapshot_freshness_is_in_the_accepting_set',
      accepting ? Object.keys(accepting) : 'the freshness authority ACCEPTING set', fState,
      !!(fState && (accepting ? accepting[fState] === 1 : /^CURRENT/.test(String(fState)))));
    L.P('the_candidate_row_belongs_to_the_accepted_snapshot_date',
      out.accepted_run ? out.accepted_run.accepted_date : null, cand ? cand.calculation_date : null,
      !!cand && !!out.accepted_run && cand.calculation_date === out.accepted_run.accepted_date);
    L.P('the_candidate_calculation_status_is_ready', 'READY', cand ? cand.calculation_status : null,
      !!cand && S1_str_(cand.calculation_status).toUpperCase() === 'READY');
    L.P('the_candidate_carries_the_resolved_run_id',
      out.lineage ? out.lineage.run_id : null, cand ? cand.calculation_run_id : null,
      !!cand && !!out.lineage && cand.calculation_run_id === out.lineage.run_id);

    // ---- 7. THE FOUR WINDOWS, each a stored finite non-negative number. -------------------------------
    var W = (cand && cand.windows) ? cand.windows : null;
    var wNames = ['D18', 'D30', 'D45', 'D90'], wMissing = [], wNegative = [], wVals = {};
    wNames.forEach(function (w) {
      var v = W ? S1_qty_(W[w]) : null;
      wVals[w] = v;
      if (v === null) wMissing.push(w); else if (v < 0) wNegative.push(w);
    });
    L.P('all_four_windows_are_stored_finite_numbers', [], wMissing, wMissing.length === 0);
    L.P('no_window_is_negative', [], wNegative, wNegative.length === 0);

    // ---- 8. THE QUANTITIES. Each finite, each separately named. ---------------------------------------
    var rec = cand ? S1_qty_(cand.recommended_qty) : null;
    var man = cand ? S1_qty_(cand.qualifying_manual_planned_qty) : null;
    var aiq = cand ? S1_qty_(cand.qualifying_ai_planned_qty) : null;
    var res = cand ? S1_qty_(cand.residual_qty) : null;
    var prop = cand ? S1_qty_(cand.proposed_ai_allocation_qty) : null;
    L.P('the_recommendation_state_is_nonzero', 'NONZERO_RECOMMENDATION',
      cand ? cand.recommendation_state : null,
      !!cand && cand.recommendation_state === 'NONZERO_RECOMMENDATION');
    L.P('recommended_qty_is_finite_and_greater_than_zero', 'a finite number > 0', rec,
      rec !== null && rec > 0);
    L.P('qualifying_manual_planned_qty_is_finite', 'a finite number', man, man !== null);
    L.P('qualifying_ai_planned_qty_is_finite', 'a finite number', aiq, aiq !== null);
    L.P('residual_qty_is_finite_and_greater_than_zero', 'a finite number > 0', res,
      res !== null && res > 0);
    L.P('the_no_action_class_is_residual_remains', 'RESIDUAL_REMAINS',
      cand ? cand.no_action_reason : null, !!cand && cand.no_action_reason === 'RESIDUAL_REMAINS');

    // ---- 9. THE FACTORY. One pool, one warehouse, a finite headroom, and the clamp decision. ----------
    var pool = cand ? cand.pool : null;
    var avail = pool ? S1_qty_(pool.available_to_allocate) : null;
    L.P('the_source_factory_warehouse_is_unambiguous',
      'named by the recommendation, or exactly one factory pool holds this sku',
      cand ? { named: cand.source_warehouse_named_by_recommendation,
        pool_candidates: (cand.pool_candidates || []).length } : null,
      !!cand && (cand.source_warehouse_named_by_recommendation === true
        || (cand.pool_candidates || []).length === 1));
    L.P('the_source_factory_warehouse_is_identified', 'a warehouse id',
      cand ? cand.source_factory_warehouse_id : null,
      !!cand && S1_str_(cand.source_factory_warehouse_id) !== '');
    L.P('a_factory_pool_row_exists_for_that_warehouse_and_sku', true,
      pool ? pool.pool_row_found : null, !!pool && pool.pool_row_found === true);
    L.P('available_to_allocate_is_finite_and_greater_than_zero', 'a finite number > 0', avail,
      avail !== null && avail > 0);
    L.P('the_proposed_quantity_is_the_minimum_of_residual_and_available',
      (res !== null && avail !== null) ? Math.max(0, Math.min(res, avail)) : null, prop,
      res !== null && avail !== null && prop !== null && prop === Math.max(0, Math.min(res, avail)));
    L.P('the_proposed_quantity_is_greater_than_zero', 'a finite number > 0', prop,
      prop !== null && prop > 0);
    L.P('the_clamp_decision_is_a_stated_boolean', [true, false], cand ? cand.would_clamp : null,
      !!cand && (cand.would_clamp === true || cand.would_clamp === false));

    // ---- 10. THE IDENTITIES. What a run would supersede, and what it must never touch. ---------------
    var manualRows = (cand && cand.protected_manual_identities) ? cand.protected_manual_identities : null;
    var aiAffected = (cand && cand.existing_affected_ai_identities) ? cand.existing_affected_ai_identities : null;
    L.P('the_manual_identities_for_this_scope_are_enumerated', 'an array, possibly empty',
      manualRows === null ? 'UNAVAILABLE' : manualRows.length,
      Object.prototype.toString.call(manualRows) === '[object Array]');
    L.P('the_ai_identities_a_run_would_supersede_are_known', 'an array, possibly empty',
      aiAffected === null ? 'UNAVAILABLE' : aiAffected.length,
      Object.prototype.toString.call(aiAffected) === '[object Array]');
    var manualHeaderIds = (manualRows || []).map(function (r) { return S1_str_(r.allocation_draft_id); });
    var manualLineIds = (manualRows || []).map(function (r) { return S1_str_(r.allocation_draft_line_id); });
    var manualTotal = 0, manualBlank = 0;
    (manualRows || []).forEach(function (r) {
      var q = S1_qty_(r.quantity);
      if (q === null) manualBlank++; else manualTotal += q;
    });
    L.P('no_manual_row_carries_an_unreadable_quantity', 0, manualBlank, manualBlank === 0);
    // THE WHOLE IDENTITY UNIVERSE, so an AFTER readback can see a row appear where none was authorized.
    var uni = cen.scope_universe || null;
    var uniKeys = (cen.candidates || []).concat(cen.rejected || [])
      .map(function (r) { return S1_str_(r && r.scope_key); }).filter(function (k) { return k !== ''; });
    var uniFp = S1_fingerprint_(uniKeys);
    L.P('the_identity_universe_was_enumerated', 'more than zero identities', uniKeys.length,
      uniKeys.length > 0);
    L.P('the_identity_universe_has_a_fingerprint', 'a fingerprint', uniFp, uniFp !== null);
    L.P('no_gap_row_is_missing_an_axis', 0, uni ? uni.malformed_identity_rows : null,
      !!uni && uni.malformed_identity_rows === 0);
    var manualFp = S1_fingerprint_((manualRows || []).map(function (r) {
      return [S1_str_(r.allocation_draft_id), S1_str_(r.allocation_draft_line_id), S1_str_(r.sku),
        S1_str_(r.warehouse_id), S1_str_(r.status), S1_str_(r.line_status), S1_str_(r.quantity)].join('~');
    }));
    L.P('the_manual_identity_snapshot_has_a_fingerprint', 'a fingerprint', manualFp,
      manualFp !== null || manualHeaderIds.length === 0);
    out.identities = { manual_header_ids: manualHeaderIds, manual_line_ids: manualLineIds,
      manual_row_count: (manualRows || []).length, manual_planned_total: manualTotal,
      manual_identity_fingerprint: manualFp,
      manual_rows: (manualRows || []).slice(0, 50),
      expected_ai_identities: aiAffected || [],
      expected_ai_identity_count: (aiAffected || []).length,
      identity_universe_count: uniKeys.length,
      identity_universe_fingerprint: uniFp,
      identity_universe_keys: uniKeys.slice(0, 400),
      other_scope_identity_count: uniKeys.filter(function (k) {
        return !out.scope || k !== out.scope.scope_key; }).length,
      note: 'The universe list is bounded in the RETURN VALUE and represented in the freeze by its COUNT'
        + ' and FINGERPRINT. A fingerprint over the sorted keys detects any identity appearing or'
        + ' disappearing; carrying every key into the paste block would put the baseline over the log'
        + ' bound, and a truncated baseline is a wrong baseline.' };

    // ---- 11. RESERVATIONS. Observed, with ABSENT never read as ZERO. ---------------------------------
    var db = S1_openDb_();
    out.reservation_observation = S1_reservationObservation_(db.ok ? db.ss : null);
    L.P('the_reservation_evidence_is_acceptable',
      'observed rows, or an absent table 61_ declares zero-mutation',
      { state: out.reservation_observation.observation_state,
        authority: out.reservation_observation.authority,
        row_count: out.reservation_observation.row_count },
      out.reservation_observation.acceptable === true);

    // ---- 12. NO UNKNOWN OR UNREADABLE EVIDENCE. ------------------------------------------------------
    // A named list, because "everything is fine" is not checkable and a list of fields is. Every entry
    // here is a value the BEFORE baseline carries, so a null one is a hole in the baseline rather than a
    // cosmetic gap — and a readback cannot refuse a drift it has no before-value for.
    var required = {
      scope_key: out.scope ? out.scope.scope_key : null,
      calculation_run_id: out.lineage ? out.lineage.run_id : null,
      accepted_calculation_date: out.accepted_run ? out.accepted_run.accepted_date : null,
      calculation_status: cand ? cand.calculation_status : null,
      freshness_state: fState,
      source_data_as_of: out.lineage ? out.lineage.source_data_as_of : null,
      planning_cycle: out.accepted_run ? out.accepted_run.planning_cycle : null,
      D18: wVals.D18, D30: wVals.D30, D45: wVals.D45, D90: wVals.D90,
      recommended_qty: rec, qualifying_manual_planned_qty: man, qualifying_ai_planned_qty: aiq,
      residual_qty: res, proposed_ai_allocation_qty: prop,
      would_clamp: cand ? cand.would_clamp : null,
      source_factory_warehouse_id: cand ? cand.source_factory_warehouse_id : null,
      pool_key: pool ? pool.pool_key : null,
      factory_current_stock: pool ? S1_qty_(pool.factory_current_stock) : null,
      factory_reserved_stock: pool ? S1_qty_(pool.factory_reserved_stock) : null,
      active_allocation_draft_qty: pool ? S1_qty_(pool.active_allocation_draft_qty) : null,
      active_shipping_plan_qty: pool ? S1_qty_(pool.active_shipping_plan_qty) : null,
      available_to_allocate: avail,
      identity_universe_fingerprint: uniFp,
      deployment_build: dep ? dep.deployment_build : null,
      measured_at: out.measured_at
    };
    var gaps = Object.keys(required).filter(function (k) {
      var v = required[k];
      return v === null || v === undefined || v === '';
    });
    out.evidence_gaps = { required_field_count: Object.keys(required).length, gaps: gaps,
      note: 'A gap is a STOP. An unknown value is not a small imperfection in a baseline: it is a drift'
        + ' the readback will be unable to detect.' };
    L.P('every_required_piece_of_evidence_is_present_and_readable', [], gaps, gaps.length === 0);

    // ---- 13. THIS MANIFEST WROTE NOTHING AND REACHED NO WRITER. --------------------------------------
    L.P('this_manifest_wrote_nothing', 0, out.writes, out.writes === 0);
    L.P('this_manifest_called_no_writer', 0, out.writer_calls, out.writer_calls === 0);
    L.P('this_manifest_constructed_no_writer', false, out.writer_constructed,
      out.writer_constructed === false);
    L.P('this_manifest_called_no_submit_and_saved_no_route', [0, 0],
      [out.submit_calls, out.route_save_calls],
      out.submit_calls === 0 && out.route_save_calls === 0);
    L.P('this_manifest_called_neither_generate_nor_submit', [false, false],
      [out.dry_run_proof.generate_called, out.dry_run_proof.submit_called],
      out.dry_run_proof.generate_called === false && out.dry_run_proof.submit_called === false);
    L.P('this_manifest_called_neither_migration_nor_the_gap_job', [false, false],
      [out.dry_run_proof.migration_called, out.dry_run_proof.gap_job_called],
      out.dry_run_proof.migration_called === false && out.dry_run_proof.gap_job_called === false);
    L.P('this_manifest_modified_neither_the_flag_nor_the_allowlist_nor_a_script_property',
      [false, false, false],
      [out.dry_run_proof.flag_modified, out.dry_run_proof.allowlist_modified,
        out.dry_run_proof.script_properties_modified],
      out.dry_run_proof.flag_modified === false && out.dry_run_proof.allowlist_modified === false
        && out.dry_run_proof.script_properties_modified === false);

    // ---- 14. THE LIVE EVIDENCE SUMMARY. Small enough to read, complete enough to judge. --------------
    out.live_evidence_summary = {
      build: out.build, measured_at: out.measured_at,
      deployment_build: dep ? dep.deployment_build : null,
      deployment_verdict: dep ? dep.verdict : null,
      mixed_deployment: dep ? dep.mixed_deployment : null,
      stale_modules: dep ? dep.stale_module_count : null,
      flag_value: out.environment ? out.environment.flag_value : null,
      allowlist_entry_count: out.allowlist.entry_count,
      scope: out.scope,
      calculation_run_id: required.calculation_run_id,
      accepted_calculation_date: required.accepted_calculation_date,
      calculation_status: required.calculation_status,
      freshness_state: required.freshness_state,
      planning_cycle: required.planning_cycle,
      windows: wVals,
      recommended_qty: rec, qualifying_manual_planned_qty: man, qualifying_ai_planned_qty: aiq,
      residual_qty: res, available_to_allocate: avail,
      proposed_ai_allocation_qty: prop, would_clamp: cand ? cand.would_clamp : null,
      source_factory_warehouse_id: required.source_factory_warehouse_id, pool_key: required.pool_key,
      manual_identity_count: (manualRows || []).length, manual_planned_total: manualTotal,
      expected_ai_identity_count: (aiAffected || []).length,
      identity_universe_count: uniKeys.length,
      reservation_observation_state: out.reservation_observation.observation_state,
      reservation_row_count: out.reservation_observation.row_count,
      evidence_gaps: gaps.length,
      predicates_failed_so_far: L.failed.length };

    // ---- 15. THE EXPECTED WRITE, IN NUMBERS A READBACK CAN DISAGREE WITH. ----------------------------
    out.expected_outcome.expected_max_units_written = prop;
    out.expected_outcome.expected_clamp = cand ? cand.would_clamp : null;
    out.expected_outcome.expected_superseded_ai_identities = (aiAffected || []).length;
    out.expected_outcome.expected_manual_identities_unchanged = (manualRows || []).length;
    out.expected_outcome.expected_identity_universe_count_after = uniKeys.length;
    out.expected_outcome.expected_reservation_row_count_after = out.reservation_observation.row_count;

    // ---- 16. THE BEFORE BASELINE. Built only from measured values, and only when nothing failed. -----
    if (L.failed.length === 0) {
      var freeze = {
        frozen_at: out.measured_at, build: out.build,
        scope_key: out.scope.scope_key, company: out.scope.company, country: out.scope.country,
        marketplace: out.scope.marketplace, sku: out.scope.sku,
        calculation_run_id: required.calculation_run_id,
        accepted_calculation_date: required.accepted_calculation_date,
        calculation_status: required.calculation_status,
        freshness_state: required.freshness_state,
        source_data_as_of: required.source_data_as_of,
        planning_cycle: required.planning_cycle,
        windows: wVals,
        recommended_qty: rec, qualifying_manual_planned_qty: man, qualifying_ai_planned_qty: aiq,
        residual_qty: res, proposed_ai_allocation_qty: prop, would_clamp: cand.would_clamp,
        source_factory_warehouse_id: required.source_factory_warehouse_id,
        pool_key: required.pool_key,
        factory_current_stock: required.factory_current_stock,
        factory_reserved_stock: required.factory_reserved_stock,
        active_allocation_draft_qty: required.active_allocation_draft_qty,
        active_shipping_plan_qty: required.active_shipping_plan_qty,
        available_to_allocate: avail,
        manual_header_ids: manualHeaderIds, manual_line_ids: manualLineIds,
        manual_planned_total: manualTotal, manual_identity_fingerprint: manualFp,
        expected_ai_identities: (aiAffected || []).map(function (x) { return x.allocation_draft_id; }),
        expected_ai_identity_count: (aiAffected || []).length,
        identity_universe_count: uniKeys.length, identity_universe_fingerprint: uniFp,
        other_scope_identity_count: out.identities.other_scope_identity_count,
        schema_fingerprints: fps,
        reservation_observation_state: out.reservation_observation.observation_state,
        reservation_row_count: out.reservation_observation.row_count,
        expected_max_units_written: prop, expected_clamp: cand.would_clamp
      };
      // A BASELINE WITH A HOLE IN IT IS NOT A BASELINE. Checked field by field against the declared list,
      // and `undefined` is a missing field while an explicit null (a legitimately absent reservation count)
      // is a measured state — so only ABSENCE fails, not falsity.
      var missing = S1_FREEZE_REQUIRED_.filter(function (k) {
        return !Object.prototype.hasOwnProperty.call(freeze, k) || freeze[k] === undefined;
      });
      L.P('the_frozen_baseline_carries_every_required_field', [], missing, missing.length === 0);
      if (missing.length === 0) {
        out.frozen_before = freeze;
        out.freeze_paste_block = 'Paste this into S1_MANIFEST_P_BEFORE_ in this file BEFORE pressing'
          + ' Generate: ' + JSON.stringify(freeze);
        var wouldChunk = Math.ceil(out.freeze_paste_block.length / S1_CHUNK_MAX_BYTES_) || 1;
        L.P('the_frozen_baseline_fits_in_the_log_bound',
          'at most ' + S1_LOG_MAX_CHUNKS_ + ' chunks', wouldChunk, wouldChunk <= S1_LOG_MAX_CHUNKS_);
      }
    } else {
      out.freeze_withheld_reason = 'NOT_BUILT — the baseline is only constructed when every condition has'
        + ' already passed, so a refused run has nothing to withhold and nothing to leak.';
    }

    // THE BASELINE DESTINATION MUST STILL BE EMPTY. A value already sitting in S1_MANIFEST_P_BEFORE_ is a
    // baseline from an EARLIER run, and freezing over it would silently replace the one that was signed.
    L.P('the_baseline_destination_is_empty_so_nothing_is_being_overwritten', null,
      (typeof S1_MANIFEST_P_BEFORE_ === 'undefined') ? 'SYMBOL_MISSING' : S1_MANIFEST_P_BEFORE_,
      typeof S1_MANIFEST_P_BEFORE_ !== 'undefined' && S1_MANIFEST_P_BEFORE_ === null);
    return fin();
  } catch (e) {
    L.P('the_manifest_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    out.stop_reason = 'S1_MANIFEST_P_THREW: ' + String(e && e.message ? e.message : e)
      + '. The exception is the finding; nothing may be authorized from a run that threw.';
    out.frozen_before = null;
    out.freeze_paste_block = null;
    return fin();
  }
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

/**
 * S1-R4 — THE AUTHORIZATION SENTENCE, WITH THE MEASUREMENTS IN IT.
 *
 * It used to read `<company> / <country> / <marketplace> / <sku>` against run `<calculation_run_id>`. A
 * person cannot authorize that: there is nothing in it to agree or disagree with, and the placeholders are
 * an invitation to fill them in from memory — which is how a scope gets authorized against yesterday's run.
 *
 * It is now built from the values THIS run measured, and it REFUSES to exist without them: called without a
 * candidate it returns null rather than a template. A sentence that still contained a placeholder would be
 * the defect back again, so the suite asserts there is no `<` in it at all.
 */
function S1_authWordingP_(cand, acceptedRun, scope) {
  if (!cand || !scope) return null;
  var lineage = (acceptedRun && acceptedRun.lineage) || {};
  var pool = cand.pool || {};
  return 'I authorize ONE controlled Inventory AI Plan generation for the single scope '
    + scope.company + ' / ' + scope.country + ' / ' + scope.marketplace + ' / ' + scope.sku
    + ', against accepted inventory gap run ' + S1_str_(lineage.run_id)
    + ' dated ' + S1_str_(acceptedRun && acceptedRun.accepted_date)
    + ' (freshness ' + S1_str_(acceptedRun && acceptedRun.freshness_state) + ', status '
    + S1_str_(cand.calculation_status) + '), whose recommendation is ' + S1_str_(cand.recommended_qty)
    + ' units with ' + S1_str_(cand.qualifying_manual_planned_qty)
    + ' already planned manually and ' + S1_str_(cand.qualifying_ai_planned_qty)
    + ' planned by AI, leaving a residual of ' + S1_str_(cand.residual_qty)
    + ' against available_to_allocate ' + S1_str_(pool.available_to_allocate)
    + ' at factory warehouse ' + S1_str_(cand.source_factory_warehouse_id)
    + ', expecting AT MOST ' + S1_str_(cand.proposed_ai_allocation_qty)
    + ' units to be written (clamp ' + (cand.would_clamp === true ? 'YES' : 'NO') + ') across '
    + S1_str_((cand.existing_affected_ai_identities || []).length)
    + ' superseded AI identities, with ' + S1_str_((cand.protected_manual_identities || []).length)
    + ' manual identities that must not change. The activation allowlist must contain exactly this one'
    + ' scope. No manual row may change, no other scope may change, no reservation may be created, no'
    + ' factory stock may change, and no Weekly Shipping Plan or Shipment may be created or altered. A'
    + ' factory-guard STOP or a clamp with zero rows is an acceptable outcome. This authorization covers'
    + ' ONE generation and expires when it completes or refuses. IT DOES NOT AUTHORIZE SUBMIT.';
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


/**
 * ================================================================================================================
 * S1-R1 — RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC.  READ ONLY.  ZERO WRITES.  SMALL LOGS.
 * ================================================================================================================
 *
 * The first production run of the candidate census answered STOP with one predicate name and nothing else,
 * because the payload carried the whole deployment manifest and Apps Script truncated the entry that held the
 * pair-level reasons. A diagnostic whose evidence does not fit in its own output has not produced evidence.
 *
 * THIS ENTRY POINT EXISTS TO ANSWER ONE QUESTION IN LOGS THAT FIT: for each (company, country) pair, is the
 * accepted inventory gap run readable, and if not, WHY. It then classifies the root cause so the next action
 * is decidable rather than guessed:
 *
 *   ELIGIBLE_PAIRS_READABLE           every allowlisted pair reads; the earlier STOP was the census's own
 *                                     too-wide universe, and nothing about production data is blocking
 *   DATA_NOT_READY                    an ELIGIBLE pair is unreadable; the reason is the freshness authority's
 *                                     own state, and the fix is the Gap Job, not this file
 *   DIAGNOSTIC_UNIVERSE_TOO_WIDE      only NON-eligible pairs are unreadable — this file's defect, and the
 *                                     one that produced the reported STOP
 *   SCOPE_GUARD_UNAVAILABLE           the allowlist authority is absent, so eligibility cannot be decided
 *                                     and NOTHING is assumed
 *   AUTHORITY_OR_SCHEMA_MISSING       61_/43_ is not synced in this project
 *
 * IT NEVER STARTS A REFRESH. It never calls the Gap Job, never writes, never mutates a script property, and
 * never decides that an unreadable pair is an empty one.
 */
function RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC() {
  var out = { census: 'RUN_S1_ACCEPTED_GAP_RUN_READABILITY_DIAGNOSTIC', build: S1_BUILD_,
    dry_run: true, writes: 0, writer_calls: 0, generate_called: false, submit_called: false,
    migration_called: false, refresh_started: false,
    verdict: 'STOP', root_cause_class: null, stop_reason: null, next_action: null,
    cycle: null, lineage: null, eligible: null, pairs: [], scopes: [],
    failed_predicates: [] };
  var L = S1_ledger_();
  function fin() {
    out.failed_predicates = L.failed.slice();
    // ---- SEGMENT 1: the summary. Deliberately small: counts and one-line facts only.
    S1_log_('s1_gap_readability_summary', JSON.stringify({
      build: out.build, dry_run: out.dry_run, writes: out.writes, writer_calls: out.writer_calls,
      cycle: out.cycle,
      lineage: out.lineage ? { ok: out.lineage.ok, reason: out.lineage.reason, run_id: out.lineage.run_id,
        source_data_as_of: out.lineage.source_data_as_of, planning_cycle: out.lineage.planning_cycle } : null,
      allowlist_entry_count: out.eligible ? out.eligible.allowlist_entry_count : null,
      eligible_pairs: out.eligible ? out.eligible.eligible_pairs : null,
      eligible_scope_count: out.eligible ? out.eligible.eligible_scope_count : null,
      gap_pair_count: out.gap_pair_count == null ? null : out.gap_pair_count,
      gap_row_count: out.gap_row_count == null ? null : out.gap_row_count,
      accepted_dates_seen: out.accepted_dates_seen || null,
      pair_lines: out.pairs.length, scope_lines: out.scopes.length
    }));
    // ---- SEGMENT 2: one line PER PAIR. This is the evidence that was truncated before.
    var M = out.pairs.length;
    out.pairs.forEach(function (pr, i) {
      S1_log_('s1_gap_pair_' + (i + 1) + '_of_' + M, JSON.stringify(pr));
    });
    // ---- SEGMENT 3: one line per ELIGIBLE SCOPE — the four windows, stored or not.
    var K = out.scopes.length;
    out.scopes.forEach(function (sc, i) {
      S1_log_('s1_gap_scope_' + (i + 1) + '_of_' + K, JSON.stringify(sc));
    });
    // ---- SEGMENT 4: the verdict, and what to do next.
    S1_log_('s1_gap_readability_verdict', JSON.stringify({ verdict: out.verdict,
      root_cause_class: out.root_cause_class, stop_reason: S1_cap_(out.stop_reason, 300),
      next_action: S1_cap_(out.next_action, 400) }));
    // ---- SEGMENT 5: only when something failed. An empty failure line is noise.
    if (L.failed.length) {
      S1_log_('s1_gap_failed', JSON.stringify({ failed: L.failed.slice(0, 20),
        count: L.failed.length }));
    }
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    return out;
  }

  try {
    // ---- THE AUTHORITIES THIS DIAGNOSTIC CANNOT SUBSTITUTE FOR. ------------------------------------------
    var need = ['weeklyAiPlanCanonicalDemand_', 'weeklyAiPlanTargetScopes_',
      'weeklyAiPlanRecommendationState_', 'gapCalcResolveContext_', 'gapReadObjects_', 'prodExpectedDbId_'];
    var missing = need.filter(function (n) { return typeof this[n] !== 'function'; }, (function () { return this; })());
    L.P('every_authority_this_diagnostic_reads_is_present', [], missing, missing.length === 0);
    if (missing.length) {
      out.root_cause_class = 'AUTHORITY_OR_SCHEMA_MISSING';
      out.stop_reason = 'this project does not carry: ' + missing.join(', ');
      out.next_action = 'Sync 61_api_v1_weekly_ai_plan.gs and 43_api_v1_gap_materialization.gs, then re-run.';
      return fin();
    }

    var db = S1_openDb_();
    L.P('the_expected_database_opened', true, db.ok ? 'ok' : db.reason, db.ok === true);
    if (!db.ok) {
      out.root_cause_class = 'AUTHORITY_OR_SCHEMA_MISSING';
      out.stop_reason = db.reason;
      out.next_action = 'Resolve the spreadsheet target before any readiness question is meaningful.';
      return fin();
    }
    var ss = db.ss;

    try { var ctx = gapCalcResolveContext_('INVENTORY'); if (ctx && ctx.ok) out.cycle = ctx.planningCycle; } catch (eC) {}
    L.P('the_canonical_planning_cycle_resolved', 'a cycle', out.cycle, !!out.cycle);
    out.lineage = S1_gapLineage_(out.cycle);
    // The lineage is REPORTED whether or not it resolves. It is not a gate here: this entry point's job is to
    // say what the state IS, and 'the run id is unresolvable' is one of the things it must be able to say.
    L.P('the_gap_run_lineage_resolves', true,
      { ok: out.lineage.ok, reason: out.lineage.reason }, out.lineage.ok === true);

    // ---- ELIGIBILITY, FROM THE ALLOWLIST AUTHORITY. -------------------------------------------------------
    var elig = S1_eligiblePairs_();
    out.eligible = { ok: elig.ok, reason: elig.reason, authority: S1_cap_(elig.authority, 220),
      allowlist_entry_count: elig.allowlist_entry_count,
      eligible_pairs: elig.pairs.slice(), eligible_scope_count: elig.scopes.length,
      eligible_scopes: elig.scopes.slice(0, 20) };
    L.P('the_eligible_pair_universe_is_derived_from_the_activation_allowlist',
      'at least one allowlisted scope', { ok: elig.ok, reason: elig.reason, pairs: elig.pairs }, elig.ok === true);
    if (!elig.ok) {
      out.root_cause_class = 'SCOPE_GUARD_UNAVAILABLE';
      out.stop_reason = 'eligibility cannot be decided: ' + (elig.reason || 'UNKNOWN');
      out.next_action = 'Sync 00_config.gs so the activation allowlist and its gate are present. Nothing is'
        + ' assumed about any pair while eligibility is unknown.';
      return fin();
    }

    // ---- THE GAP TABLE, IDENTITY COLUMNS ONLY. -----------------------------------------------------------
    var rows = [];
    try { rows = gapReadObjects_(ss, 'inventory_replenishment_gap') || []; }
    catch (eR) {
      L.P('the_inventory_gap_table_is_readable', true, 'threw: ' + S1_cap_(eR && eR.message, 120), false);
      out.root_cause_class = 'AUTHORITY_OR_SCHEMA_MISSING';
      out.stop_reason = 'inventory_replenishment_gap could not be read';
      out.next_action = 'Check the table exists and its header row matches WAP_GAP_REQUIRED_COLS_.';
      return fin();
    }
    L.P('the_inventory_gap_table_is_readable', true, true, true);
    out.gap_row_count = rows.length;

    var pairIdx = {}, pairList = [];
    rows.forEach(function (r) {
      var c = S1_str_(r.company), k = S1_str_(r.country);
      if (!c || !k) return;
      var pk = c + '|' + k;
      if (!pairIdx[pk]) { pairIdx[pk] = { company: c, country: k, rows: 0, dates: {}, statuses: {} }; pairList.push(pk); }
      var e = pairIdx[pk];
      e.rows++;
      e.dates[S1_str_(r.calculation_date) || 'BLANK'] = 1;
      e.statuses[S1_str_(r.calculation_status) || 'BLANK'] = 1;
    });
    pairList.sort();
    out.gap_pair_count = pairList.length;
    L.P('the_gap_table_names_at_least_one_company_country_pair', 'more than zero', pairList.length,
      pairList.length > 0);

    // ---- ONE CANONICAL READ PER PAIR, and one small line each. ---------------------------------------------
    var acceptedSeen = {}, eligUnreadable = [], nonEligUnreadable = [], eligReadable = [];
    pairList.forEach(function (pk) {
      var isElig = elig.pairs.indexOf(pk) !== -1;
      var c = null, threw = null;
      try {
        c = weeklyAiPlanCanonicalDemand_(ss, { company: pairIdx[pk].company, country: pairIdx[pk].country,
          marketplace: '', planningCycle: out.cycle }, null);
      } catch (e) { threw = S1_cap_(e && e.message, 140); }
      var readable = !!(c && c.ok === true);
      var acc = c ? (S1_str_(c.acceptedDate) || null) : null;
      if (acc) acceptedSeen[acc] = 1;
      var fresh = c ? (c.freshness || null) : null;
      // ONE LINE PER PAIR, and every field on it is short. The freshness reason is the resolver's own
      // sentence and is the single most useful thing here, so it gets the largest cap.
      out.pairs.push({
        pair: pk, eligible: isElig, readable: readable,
        unreadable_reason: readable ? null : (threw ? ('THREW: ' + threw) : (S1_str_(c && c.reason) || null)),
        freshness_state: c ? (S1_str_(c.freshnessState) || null) : null,
        freshness_reason: S1_cap_(fresh && fresh.reason, 200) || null,
        accepted_date: acc,
        gap_row_count: pairIdx[pk].rows,
        distinct_dates: Object.keys(pairIdx[pk].dates).sort().slice(0, 6),
        calculation_statuses: Object.keys(pairIdx[pk].statuses).sort().slice(0, 6),
        rows_at_accepted_date: c && c.dateIndex && acc ? (c.dateIndex[acc] || null) : null,
        business_now: fresh && fresh.businessNow ? (S1_str_(fresh.businessNow.date) + ' '
          + S1_str_(fresh.businessNow.time)) : null,
        scheduled_start: fresh && fresh.scheduledStart ? S1_str_(fresh.scheduledStart.hhmm) : null,
        overdue_after_minute_of_day: fresh && fresh.overdueAfter ? fresh.overdueAfter.minuteOfDay : null,
        job_state: c && c.jobState ? S1_cap_(JSON.stringify(c.jobState), 200) : null
      });
      if (isElig) { if (readable) eligReadable.push(pk); else eligUnreadable.push(pk); }
      else if (!readable) nonEligUnreadable.push(pk);

      // ---- THE FOUR WINDOWS, for the ELIGIBLE scopes of a READABLE eligible pair. ------------------------
      if (!isElig || !readable) return;
      var target = null, recState = null;
      try { target = weeklyAiPlanTargetScopes_({ company: pairIdx[pk].company, country: pairIdx[pk].country,
        planningCycle: out.cycle }, ''); } catch (e1) { target = null; }
      try { recState = (target && target.ok) ? weeklyAiPlanRecommendationState_(c, target) : null; }
      catch (e2) { recState = null; }
      var W = ['D18', 'D30', 'D45', 'D90'];
      ((recState && recState.per_scope) || []).forEach(function (sc) {
        var stored = {}, missingW = [], nonFinite = [], negative = [];
        W.forEach(function (w) {
          var v = (sc.windows || {})[w];
          if (v === undefined) { missingW.push(w); stored[w] = null; return; }
          stored[w] = v === null ? null : v;
          var n = S1_qty_(v);
          if (n === null) { nonFinite.push(w); return; }
          if (n < 0) negative.push(w);
        });
        out.scopes.push({
          scope: S1_str_(sc.company) + '|' + S1_str_(sc.country) + '|' + S1_str_(sc.marketplace)
            + '|' + S1_str_(sc.sku),
          evaluated: sc.evaluated === true,
          per_scope_reason: S1_str_(sc.reason) || null,
          calculation_status: S1_str_(sc.calculation_status) || null,
          calculation_date: S1_str_(sc.calculation_date) || null,
          windows_stored: stored,
          windows_missing: missingW, windows_non_finite: nonFinite, windows_negative: negative,
          all_four_stored_finite_nonnegative: missingW.length === 0 && nonFinite.length === 0
            && negative.length === 0,
          recommended_qty: sc.recommended_qty === undefined ? null : sc.recommended_qty,
          recommendation_state: recState ? S1_str_(recState.state) : null
        });
      });
    });
    out.accepted_dates_seen = Object.keys(acceptedSeen).sort().slice(0, 8);

    // ---- THE GATES. Only ELIGIBLE pairs decide; every pair is reported. -----------------------------------
    var eligMissingFromGap = elig.pairs.filter(function (pk) { return pairList.indexOf(pk) === -1; });
    L.P('every_eligible_pair_has_rows_in_the_inventory_gap_table', [], eligMissingFromGap,
      eligMissingFromGap.length === 0);
    L.P('the_accepted_inventory_gap_run_is_readable_for_every_eligible_pair', [], eligUnreadable,
      eligUnreadable.length === 0);
    var eligAcc = {};
    eligReadable.forEach(function (pk) {
      out.pairs.forEach(function (pr) { if (pr.pair === pk && pr.accepted_date) eligAcc[pr.accepted_date] = 1; });
    });
    L.P('every_eligible_pair_agrees_on_the_accepted_snapshot_date', 'exactly one date',
      Object.keys(eligAcc).sort(), Object.keys(eligAcc).length === 1);
    L.P('this_diagnostic_wrote_nothing', 0, out.writes, out.writes === 0);
    L.P('this_diagnostic_started_no_refresh', false, out.refresh_started, out.refresh_started === false);

    // ---- THE CLASSIFICATION. This is the deliverable: which of the two root causes it is. -----------------
    out.eligible_readable = eligReadable.slice();
    out.eligible_unreadable = eligUnreadable.slice();
    out.non_eligible_unreadable = nonEligUnreadable.slice(0, 40);
    if (eligMissingFromGap.length) {
      out.verdict = 'STOP';
      out.root_cause_class = 'DATA_NOT_READY';
      out.stop_reason = 'an ELIGIBLE pair has no row in inventory_replenishment_gap: '
        + eligMissingFromGap.join(', ');
      out.next_action = 'The authorized scope has nothing materialized. This is a Gap Job question, NOT a'
        + ' diagnostic one. Do not start a refresh from here — see the Gap Job section of the S1-R1 report.';
    } else if (eligUnreadable.length) {
      out.verdict = 'STOP';
      out.root_cause_class = 'DATA_NOT_READY';
      out.stop_reason = 'the accepted run is not readable for the ELIGIBLE pair(s): ' + eligUnreadable.join(', ')
        + '. Each pair line carries the freshness authority\'s own state and reason.';
      out.next_action = 'Read s1_gap_pair_* for the named pair. The state is the freshness resolver\'s, so the'
        + ' fix is the Inventory Gap materialization, not this file. Do not start it from here.';
    } else if (nonEligUnreadable.length) {
      out.verdict = 'ELIGIBLE_PAIRS_READABLE';
      out.root_cause_class = 'DIAGNOSTIC_UNIVERSE_TOO_WIDE';
      out.stop_reason = null;
      out.next_action = 'Every ELIGIBLE pair reads. The pair(s) ' + nonEligUnreadable.slice(0, 6).join(', ')
        + ' are outside the activation allowlist and can never be written by this activation; the earlier'
        + ' STOP was this census requiring them. Re-run RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS().';
    } else {
      out.verdict = 'ELIGIBLE_PAIRS_READABLE';
      out.root_cause_class = 'ELIGIBLE_PAIRS_READABLE';
      out.next_action = 'Every pair in the table reads. Re-run RUN_S1_POSITIVE_RESIDUAL_CANDIDATE_CENSUS().';
    }
    // A failed predicate outranks a hopeful verdict, always.
    if (L.failed.length && out.verdict !== 'STOP') {
      out.verdict = 'STOP';
      out.stop_reason = (out.stop_reason ? out.stop_reason + ' — ' : '') + 'unmet: ' + L.failed.join(', ');
    }
    return fin();
  } catch (e) {
    L.P('the_diagnostic_ran_to_completion', true, 'threw: ' + S1_cap_(e && e.message, 160), false);
    out.root_cause_class = 'AUTHORITY_OR_SCHEMA_MISSING';
    out.stop_reason = 'S1_GAP_READABILITY_THREW: ' + S1_cap_(e && e.message, 200);
    out.next_action = 'The exception is the finding. Nothing about production data may be concluded from it.';
    return fin();
  }
}
/** The one exit. Attaches the ledger, counts the failures and emits the chunked payload. */
function S1_finish_(out, L, quiet) {
  out.predicates = L.entries;
  out.predicates_failed = L.failed.length;
  out.failed_predicates = L.failed.slice();
  // S1-R4 — a sub-measurement returns its object and logs nothing. Its caller owns the report.
  if (quiet === true) return out;
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
