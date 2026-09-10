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
// S1-R5A — FROZEN, AND ROTATED ONCE. This is the freeze block of the RUN_S1_MANIFEST_P executed on
// the live project at 2026-09-10 14:42:06, verdict READY_TO_AUTHORIZE, 117 predicates passed / 0
// failed, 0 writes, 0 writer calls.
//
// WHY IT MOVED. The baseline frozen here before this one measured gap run GAP-INV-20260909T132353-0001
// (accepted 2026-09-09, CURRENT_PRE_SCHEDULE). The daily Gap Job then produced a new accepted run,
// GAP-INV-20260910T132343-0001 (accepted 2026-09-10, CURRENT_AFTER_REFRESH), so the calculation
// lineage the old baseline described no longer exists. The readback CORRECTLY refused: a baseline
// whose run id has moved is a different world, and CONFLICT is the right answer to it. The refusal
// is not what was repaired. A PERSON re-ran the manifest against the current run and pasted the new
// block here. Rotation authority is the operator plus a complete new log — never the runtime
// deciding for itself that a CONFLICT it cannot explain is close enough to be a FROZEN.
//
// WHAT ACTUALLY CHANGED. Five fields, and structurally no others: frozen_at, calculation_run_id,
// accepted_calculation_date, source_data_as_of and freshness_state. Every protected surface is
// character-identical to the baseline it replaces — the scope, the recommendation and residual, the
// exact writable identities SADH-K2-A4239AC6 / SADL-K2-2FD4DCA2, the 24 other-scope row signatures,
// the factory pool fingerprint 58D7A2C7, all 95 movement ids and FC67B70E, the override audit, the
// gap-scope and draft-row universes, the schema fingerprints, and the 25-unit ceiling. That the
// write set looks unchanged is not the reason it is accepted; it is accepted because it was
// compared field by field and only the lineage moved.
//
// IT WAS NOT TYPED. The run emitted it as three log chunks of 2953 / 2953 / 129 characters; they
// were concatenated in order with nothing between them, the 77-character prose prefix the emitter
// prepends was removed, and the remaining 5958 characters are reproduced here VERBATIM on one line.
// The two chunk boundaries fall mid-token ("factory_stock_movem|ent_count" and "r|eservation_...") ,
// so a swallowed or inserted separator would break a key name. But the lengths are the real proof:
// the emitter slices at a fixed 2953-character budget, so the first two chunks are exactly full and
// only the last is short, and a lost or duplicated character changes a length. Re-serialising the
// parse reproduces the same 5958 characters, which is what says nothing was normalised, reordered
// or de-duplicated on the way in.
//
// IT IS STILL NEVER WRITTEN BY CODE. Nothing in this file assigns it; a person pasted it, exactly as
// the doctrine above requires, and the suite still asserts the single assignment.
//
// WHAT IT IS NOT. It carries no row number and no physical extent: not E3E783BF (the removal BEFORE
// fingerprint of a table that no longer exists in that shape), not the blank row-2 fingerprint
// 91702192, not 2CA4D4BE, not physical last row 97, and not the authorization sentence — that is a
// separate artefact with its own fingerprint, and it is not baseline data. The sentence measured
// alongside THIS baseline fingerprints 8A830413; the one that accompanied the superseded baseline,
// F700840D, expired with the lineage it described and can no longer authorize anything.
var S1_MANIFEST_P_BEFORE_ = {"frozen_at":"2026-09-10 14:42:06","build":"F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6","scope_key":"ResUS|US|Amazon|SP0750-M","company":"ResUS","country":"US","marketplace":"Amazon","sku":"SP0750-M","calculation_run_id":"GAP-INV-20260910T132343-0001","accepted_calculation_date":"2026-09-10","calculation_status":"READY","freshness_state":"CURRENT_AFTER_REFRESH","source_data_as_of":"2026-09-10","planning_cycle":"RECO-2026-09","windows":{"D18":0,"D30":0,"D45":0,"D90":25},"recommended_qty":25,"qualifying_manual_planned_qty":0,"qualifying_ai_planned_qty":0,"residual_qty":25,"proposed_ai_allocation_qty":25,"would_clamp":false,"source_factory_warehouse_id":"WH-TW-CN-FACTORY-YOUXIN","pool_key":"WH:WH-TW-CN-FACTORY-YOUXIN||SP0750-M","factory_current_stock":310,"factory_reserved_stock":0,"active_allocation_draft_qty":0,"active_shipping_plan_qty":0,"available_to_allocate":310,"manual_header_ids":[],"manual_line_ids":[],"manual_planned_total":0,"manual_identity_fingerprint":"811C9DC5","writeset_measurable":true,"writeset_stage":"COMPLETE","expected_header_ids":["SADH-K2-A4239AC6"],"expected_line_ids":["SADL-K2-2FD4DCA2"],"expected_k2_group_keys":["reco-2026-09|resus|us|amazon|inventory_replenishment|wh-tw-cn-factory-youxin||sea|truck|1"],"expected_create_header_count":1,"expected_update_header_count":0,"expected_create_line_count":1,"expected_update_line_count":0,"existing_active_ai_identities":[],"existing_active_ai_identity_count":0,"ai_expiration_candidates":[],"ai_expiration_candidate_count":0,"expected_post_generation_active_ai_identities":["SADH-K2-A4239AC6"],"target_manual_header_ids":[],"target_manual_line_ids":[],"target_manual_planned_total":0,"target_manual_row_signatures":[],"target_manual_combined_fingerprint":"811C9DC5","target_ai_row_signatures":[],"target_ai_combined_fingerprint":"811C9DC5","other_scope_header_count":11,"other_scope_line_count":13,"other_scope_row_signatures":["SAD-27976058-2~62304AEF","SAD-C787D1B1-D~D1388F3C","SAD-FD833D8A-E~BF0F579D","SADH-K2-179FBB0E~D36362C7","SADH-K2-7F15DD7D~9E3BA813","SADH-K2-E7AF9242~0AAEF965","SADH-K4-38523A90~2138D5D5","SADH-K4-507F3A05~59CB0B0B","SADH-K4-A3872518~D86B4917","SADH-K4-D8E6A23B~0A92D373","SADH-K4-DCF3CFC8~991CEA46","SADL-K2-0AA58729~7F6C8AD3","SADL-K2-0D2C920B~8F519999","SADL-K2-16F4E4F9~2BE6B6E3","SADL-K2-25BAA672~E0DFC918","SADL-K2-344FB2B2~54658884","SADL-K2-434B65FA~1DDB424A","SADL-K2-477B4D96~4448A09B","SADL-K2-4B150F56~36243147","SADL-K2-4ED9AD78~2B8ADD01","SADL-K2-8756129E~139D23B3","SADL-K2-92B8BAD2~77AA124E","SADL-K2-A5AF5DC0~496F0B41","SADL-K2-A9F07664~62FF48B2"],"other_scope_combined_fingerprint":"C2F89714","draft_header_live_column_count":36,"draft_line_live_column_count":31,"draft_header_excluded_fields":[],"draft_line_excluded_fields":[],"factory_pool_row_fingerprint":"58D7A2C7","factory_stock_movement_state":"SHEET_PRESENT_AND_READABLE","factory_stock_movement_count":95,"factory_stock_movement_ids":["FSMV-0332bc3c","FSMV-04e06e5c","FSMV-04e4b078","FSMV-069464ef","FSMV-070296f2","FSMV-0ab3930b","FSMV-13208649","FSMV-16f38c6f","FSMV-173b4b7c","FSMV-1cf772c6","FSMV-23c176e0","FSMV-280bb686","FSMV-281a49db","FSMV-3086d3ce","FSMV-35b6153c","FSMV-3797f9a0","FSMV-3a7c17f3","FSMV-3bb1b10c","FSMV-3d57c7bc","FSMV-3e38941b","FSMV-4545f1a9","FSMV-4626c613","FSMV-4b313b43","FSMV-4c4bd69b","FSMV-4d3cd744","FSMV-4e6b1bfe","FSMV-547dbb9b","FSMV-560cddb3","FSMV-5a6a6cd2","FSMV-5ef872d2","FSMV-63106ba1","FSMV-632a2845","FSMV-65112317","FSMV-68750b75","FSMV-6a4f8d4f","FSMV-718bfc6a","FSMV-72e17098","FSMV-73ee099d","FSMV-742eff9e","FSMV-784eed15","FSMV-7c462aa9","FSMV-7e0e60e7","FSMV-7fe0d21a","FSMV-81dfcfb7","FSMV-880b656e","FSMV-8c4dead1","FSMV-8c880ccd","FSMV-8c9fac28","FSMV-8e50938a","FSMV-8e9b2571","FSMV-8fd17704","FSMV-90f3379d","FSMV-93e7cd59","FSMV-9aeae3e9","FSMV-a317febd","FSMV-a43ddf68","FSMV-a96c6717","FSMV-ae66ac1a","FSMV-b1cc6cc0","FSMV-b3f4c867","FSMV-b54bbb5f","FSMV-b7b31d44","FSMV-ba6f52d7","FSMV-bfbe4fec","FSMV-c602f612","FSMV-c62ca13a","FSMV-c660e255","FSMV-c6f973c5","FSMV-d252da34","FSMV-d511479b","FSMV-d5990154","FSMV-d9000b82","FSMV-d940a9bb","FSMV-dae32460","FSMV-dbea7287","FSMV-dc0d673f","FSMV-dcb7e556","FSMV-e0b30169","FSMV-e104e937","FSMV-e367fb39","FSMV-e56a54f7","FSMV-e5bf1d8f","FSMV-e5d99afb","FSMV-e6e80552","FSMV-eba01818","FSMV-ed1d0a61","FSMV-ee435515","FSMV-ef2ff959","FSMV-ef3eacc6","FSMV-efc22cf3","FSMV-f33921ee","FSMV-f43a8c1d","FSMV-f77ef96f","FSMV-fd4d2bff","FSMV-fe6f1b7f"],"factory_stock_movement_fingerprint":"FC67B70E","factory_override_audit_state":"SHEET_PRESENT_AND_READABLE","factory_override_audit_count":0,"factory_override_audit_ids":[],"factory_override_audit_fingerprint":"811C9DC5","factory_stock_movement_ok_id_count":95,"factory_stock_movement_id_faults":[],"factory_override_audit_ok_id_count":0,"factory_override_audit_id_faults":[],"gap_scope_universe_population":"INVENTORY_GAP_SCOPES","gap_scope_universe_total_count":118,"gap_scope_universe_target_count":1,"gap_scope_universe_other_count":117,"gap_scope_universe_fingerprint":"D578A971","draft_row_universe_population":"ALLOCATION_DRAFT_ROWS","draft_row_universe_header_count":11,"draft_row_universe_line_count":13,"draft_row_universe_total_row_count":24,"draft_row_universe_target_manual_header_count":0,"draft_row_universe_target_manual_line_count":0,"draft_row_universe_target_ai_header_count":0,"draft_row_universe_target_ai_line_count":0,"draft_row_universe_target_row_count":0,"draft_row_universe_other_scope_row_count":24,"draft_row_universe_row_signature_count":24,"draft_row_universe_combined_fingerprint":"C2F89714","schema_fingerprints":{"inventory_replenishment_gap":"16B18595","shipping_allocation_drafts":"766AE25C","shipping_allocation_draft_lines":"BC70D284","factory_stock":"83D61B62","shipping_plans":"819C7F26","shipping_plan_lines":"B09125C1","warehouses":"6DFA468E"},"reservation_observation_state":"SHEET_ABSENT","reservation_row_count":null,"expected_max_units_written":25,"expected_clamp":false};

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
  // S1-R4C §2 - RENAMED SO A READBACK KNOWS WHICH POPULATION EACH FINGERPRINT COVERS. These three used to
  // be `identity_universe_count` / `_fingerprint` / `other_scope_identity_count`, and they count INVENTORY
  // GAP SCOPES. A live run put 118 and 117 of them beside 11 header rows and 13 line rows under one word,
  // 'identity'. The draft row population is frozen separately, below.
  'gap_scope_universe_population', 'gap_scope_universe_total_count',
  'gap_scope_universe_target_count', 'gap_scope_universe_other_count',
  'gap_scope_universe_fingerprint',
  'schema_fingerprints', 'reservation_observation_state', 'reservation_row_count',
  'expected_max_units_written', 'expected_clamp',
  // S1-R4A §A — THE THREE AI IDENTITY SETS, SEPARATELY NAMED. `expected_ai_identities` used to be here and
  // was assigned the EXISTING rows; it is gone, because a name that answered a different question than it
  // asked is not repaired by documenting it.
  'writeset_measurable', 'writeset_stage',
  'expected_header_ids', 'expected_line_ids', 'expected_k2_group_keys',
  'expected_create_header_count', 'expected_update_header_count',
  'expected_create_line_count', 'expected_update_line_count',
  'existing_active_ai_identities', 'existing_active_ai_identity_count',
  'ai_expiration_candidates', 'ai_expiration_candidate_count',
  'expected_post_generation_active_ai_identities',
  // S1-R4A §B — FULL-ROW CONTENT, so an in-place edit that leaves every id intact is still visible.
  'target_manual_header_ids', 'target_manual_line_ids', 'target_manual_planned_total',
  'target_manual_row_signatures', 'target_manual_combined_fingerprint',
  'target_ai_row_signatures', 'target_ai_combined_fingerprint',
  'other_scope_header_count', 'other_scope_line_count',
  'other_scope_row_signatures', 'other_scope_combined_fingerprint',
  // S1-R4C §2B - the DRAFT ROW universe, with its own name, its own arithmetic and its own fingerprint.
  'draft_row_universe_population', 'draft_row_universe_header_count',
  'draft_row_universe_line_count', 'draft_row_universe_total_row_count',
  'draft_row_universe_target_manual_header_count', 'draft_row_universe_target_manual_line_count',
  'draft_row_universe_target_ai_header_count', 'draft_row_universe_target_ai_line_count',
  'draft_row_universe_target_row_count', 'draft_row_universe_other_scope_row_count',
  'draft_row_universe_row_signature_count', 'draft_row_universe_combined_fingerprint',
  'draft_header_live_column_count', 'draft_line_live_column_count',
  'draft_header_excluded_fields', 'draft_line_excluded_fields',
  // S1-R4A §B.4 — the surfaces a factory move would be recorded on.
  'factory_pool_row_fingerprint',
  'factory_stock_movement_state', 'factory_stock_movement_count', 'factory_stock_movement_ids',
  'factory_stock_movement_fingerprint',
  'factory_override_audit_state', 'factory_override_audit_count', 'factory_override_audit_ids',
  'factory_override_audit_fingerprint',
  // S1-R4C §1 - the id integrity of each surface, frozen, so a blank appearing after the run is a drift the
  // readback has a before-value for rather than a number it has to trust.
  'factory_stock_movement_ok_id_count', 'factory_stock_movement_id_faults',
  'factory_override_audit_ok_id_count', 'factory_override_audit_id_faults'
];

/**
 * S1-R5 — WHICH MEASUREMENT A BASELINE IS, ignoring when it was taken.
 *
 * `frozen_at` is a clock reading, so two runs of the same unchanged world produce two baselines that
 * differ in exactly one field. Comparing whole objects would call that an overwrite; comparing nothing
 * would let a baseline measured against a DIFFERENT world replace a signed one silently. So the
 * comparison is over what the baseline is ABOUT: the build, the scope, the accepted run it was taken
 * against, every content fingerprint, and the exact identities the generation may write.
 *
 * A null in, a null out — an absent baseline has no identity, which is a different answer from an
 * identity that disagrees.
 */
function S1_freezeIdentity_(b) {
  if (!b || typeof b !== 'object') return null;
  return ['build', 'scope_key', 'calculation_run_id', 'accepted_calculation_date',
    'manual_identity_fingerprint', 'target_manual_combined_fingerprint',
    'target_ai_combined_fingerprint', 'other_scope_combined_fingerprint',
    'draft_row_universe_combined_fingerprint', 'gap_scope_universe_fingerprint',
    'factory_pool_row_fingerprint', 'factory_stock_movement_fingerprint',
    'factory_override_audit_fingerprint', 'expected_header_ids', 'expected_line_ids',
    'proposed_ai_allocation_qty', 'expected_max_units_written'
  ].map(function (k) {
    return k + '=' + JSON.stringify(b[k] === undefined ? null : b[k]);
  }).join('|');
}

/** The removal-era facts a Manifest P baseline must never carry forward, as an executable list
 *  rather than the prose one the R4J handoff publishes. */
function S1_freezeCarriesRemovalEra_(b) {
  if (!b || typeof b !== 'object') return [];
  var text = '';
  try { text = JSON.stringify(b); } catch (e) { return ['UNSERIALISABLE_BASELINE']; }
  var bad = [];
  ['E3E783BF', '91702192', '2CA4D4BE', 'I authorize'].forEach(function (t) {
    if (text.indexOf(t) !== -1) bad.push(t);
  });
  // 97 as a REQUIRED physical extent. Searched as a VALUE, never as a substring: '97' occurs inside
  // hashes and ids, and a substring hit there would be a false alarm, which is its own kind of wrong.
  Object.keys(b).forEach(function (k) { if (b[k] === 97) bad.push(k + '=97'); });
  return bad;
}

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
/** S1-R4C - A ROW COUNT THAT IS NULL IS NOT A ROW COUNT OF ZERO, AND THE SENTENCE HAS TO SAY SO.
 *  Rendering it through S1_str_ produced 'reservations SHEET_ABSENT with  row(s)' - a double space where a
 *  number should be, which reads as a typo rather than as the deliberate distinction it is. An absent table
 *  has no count, and a person signing the baseline needs to see that stated rather than inferred from a gap
 *  in the text. */
function S1_rowCountPhrase_(n) {
  return (n === null || n === undefined)
    ? 'no row count (the table is absent, which is not the same as zero rows)'
    : (String(n) + ' row(s)');
}
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
/**
 * S1-R4A — THE BOUND THAT MATTERS IS THE EMITTED LINE'S, NOT THE PAYLOAD'S.
 *
 * S1_log_ writes '[S1] ' + tag + ' ' + payload, so slicing the payload at S1_CHUNK_MAX_BYTES_ produced a LINE
 * of 3000 + 45 bytes. Measured at 3045 on the first freeze chunk as soon as the baseline grew past one chunk.
 * The chunk limit exists because the logger truncates the line, so the framing has to come out of the budget
 * rather than sit on top of it — a payload that just fits and a line that gets cut are the same failure.
 *
 * The suffix is priced at its widest (`_99_of_99`) so the budget does not depend on the chunk count that the
 * budget is being used to compute.
 */
// S1-R4D - AND THE SUFFIX IS NOW AN ARGUMENT, because a per-fault emitter numbers its lines _1_of_N where N
// is a fault COUNT rather than a chunk count, and a three-digit N is four bytes wider than the '_99_of_99'
// this was priced against. Extended rather than copied: R4A's whole point was that the framing arithmetic
// lives in ONE place, so a second emitter must not carry a second copy of it. Called with one argument it
// behaves exactly as before.
function S1_chunkBudget_(tag, suffix) {
  var framing = '[S1] '.length + String(tag).length
    + String(suffix === undefined || suffix === null ? '_99_of_99' : suffix).length + 1;
  var b = S1_CHUNK_MAX_BYTES_ - framing;
  // A tag long enough to eat the whole budget is a naming mistake, not a reason to emit one byte per line.
  return b < 500 ? 500 : b;
}
function S1_emitChunked_(tag, text) {
  var budget = S1_chunkBudget_(tag);
  var s = String(text == null ? '' : text), n = Math.ceil(s.length / budget) || 1;
  if (n > S1_LOG_MAX_CHUNKS_) {
    S1_log_(tag + '_withheld', JSON.stringify({ withheld: true, bytes: s.length, would_be_chunks: n,
      chunk_max_bytes: S1_CHUNK_MAX_BYTES_, max_chunks: S1_LOG_MAX_CHUNKS_,
      note: 'DELIBERATELY NOT LOGGED, NOT TRUNCATED. The segmented lines emitted above carry the evidence'
        + ' at the grain a reader needs it; the complete object is this function\'s return value.' }));
    return 0;
  }
  for (var i = 0; i < n; i++) {
    S1_log_(tag + '_' + (i + 1) + '_of_' + n, s.slice(i * budget, (i + 1) * budget));
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
// ================================================================================================================
// S1-R4B — THE DEPLOYMENT CONTRACT, VALIDATED AGAINST THE SHAPE 63_ ACTUALLY RETURNS.
//
// WHAT WENT WRONG, AND IT WAS NOT SUBTLE. The manifest asked `dep.available === true`, and
// `sysModuleBuildStamps_()` HAS NO `available` FIELD. Its contract is:
//
//   { deployment_build, modules, runtime_authority, absent_modules, absent_optional_modules,
//     stale_modules, mixed_deployment, verdict }
//
// So `available` read `undefined`, `undefined === true` was false, and
// `the_deployment_contract_is_readable` failed on a deployment that was demonstrably readable — the SAME run
// extracted deployment_build, mixed_deployment=false and stale_modules=0 out of the very object it had just
// declared unreadable. 87 conditions passed and the one that failed was measuring a field nobody publishes.
//
// WHERE `available` CAME FROM. It was invented HERE, as a local marker on the catch path
// (`_dep = { available: false, error: ... }`), and then read back as though 63_ had promised it. A field this
// file makes up on failure is not a field the contract provides on success.
//
// AND THE FIXTURE AGREED WITH THE INVENTION. The suite's stub returned `available: true` alongside the real
// field names, so every test passed while production could only ever fail. That is the second time this
// package has been caught agreeing with its own invented schema — the factory-audit id columns were the
// first — so the fixture no longer spells this shape at all: it EXECUTES the real 63_ function (see the
// suite's realStamps_).
//
// WHAT REPLACES IT. One helper, and it separates two questions that were being answered by one flag:
//
//   IS THE CONTRACT READABLE?   the authority exists, it returned an object, and every field the contract
//                               promises is present with the right TYPE. A shape question.
//   IS THE DEPLOYMENT HEALTHY?  build, mixed, stale, absent, per-module stamps, verdict. Separate
//                               predicates, so a shape fault and a sync fault are never one finding.
//
// The expected build comes from S1_BUILD_ — this file's own pin — and never from the object under test. An
// expectation read from the thing being checked is a comparison with itself: it cannot fail, and a gate that
// cannot fail is not a gate.
//
// NOT DONE, DELIBERATELY: the predicate is not relaxed to `true`, and the verdict string is never a sole
// pass. `verdict_is_uniform` is anchored at the START of the string (63_'s failure branch is
// 'MIXED_OR_PARTIAL_SYNC …', so a substring test for 'UNIFORM' would be a weaker check for no reason), and it
// is one of ten independent conditions rather than the gate.
// ================================================================================================================

/** The fields 63_'s contract promises, with the type each must have. A field that is absent, null or of the
 *  wrong type is a SHAPE fault and is named as one — never silently coerced into a health answer. */
var S1_DEPLOYMENT_CONTRACT_FIELDS_ = [
  { field: 'deployment_build', type: 'nonempty_string' },
  { field: 'modules', type: 'array' },
  { field: 'absent_modules', type: 'array' },
  { field: 'absent_optional_modules', type: 'array' },
  { field: 'stale_modules', type: 'array' },
  { field: 'mixed_deployment', type: 'boolean' },
  { field: 'verdict', type: 'nonempty_string' },
  { field: 'runtime_authority', type: 'object' }
];

function S1_typeOk_(v, type) {
  if (type === 'array') return Object.prototype.toString.call(v) === '[object Array]';
  if (type === 'boolean') return v === true || v === false;
  if (type === 'nonempty_string') return typeof v === 'string' && v.trim() !== '';
  if (type === 'object') return !!v && typeof v === 'object'
    && Object.prototype.toString.call(v) !== '[object Array]';
  return false;
}

/**
 * Read and validate the live deployment contract. ONE call, ONE normalized answer, every refusal named.
 *
 * Returns { readable, contract_ok, stop_reasons, … measured values … }. `readable` is the SHAPE verdict;
 * `contract_ok` additionally requires the deployment to be healthy and to be THIS build.
 */
function S1_deploymentContract_() {
  var o = {
    // ---- shape ----
    authority_present: (typeof sysModuleBuildStamps_ === 'function'),
    called: false, threw: null, returned_object: false,
    missing_fields: [], wrong_type_fields: [], readable: false,
    // ---- measured ----
    deployment_build: null, verdict: null, verdict_is_uniform: null, mixed_deployment: null,
    module_count: null, required_module_count: null, optional_module_count: null,
    stale_modules: null, stale_module_count: null,
    absent_modules: null, absent_module_count: null,
    absent_optional_modules: null, absent_optional_module_count: null,
    module_mismatches: null, module_mismatch_count: null,
    malformed_module_rows: null,
    runtime_checked: null, runtime_uniform: null, runtime_divergent: null,
    // ---- the expectation, from THIS FILE's pin ----
    expected_build: S1_BUILD_, expected_build_source: 'S1_BUILD_ (this diagnostic\'s own pin)',
    build_matches: null,
    contract_ok: false, stop_reasons: [],
    contract_fields: S1_DEPLOYMENT_CONTRACT_FIELDS_.map(function (f) { return f.field; }),
    authority: 'sysModuleBuildStamps_ (63_api_v1_system_health.gs)'
  };
  function stop(reason) { o.stop_reasons.push(reason); }

  if (!o.authority_present) {
    stop('DEPLOYMENT_CONTRACT_AUTHORITY_ABSENT: sysModuleBuildStamps_ is not present in this deployment');
    return o;
  }
  var raw = null;
  try { raw = sysModuleBuildStamps_(); o.called = true; }
  catch (e) {
    o.threw = S1_cap_(String(e && e.message ? e.message : e), 200);
    stop('DEPLOYMENT_CONTRACT_THREW: ' + o.threw);
    return o;
  }
  o.returned_object = !!raw && typeof raw === 'object'
    && Object.prototype.toString.call(raw) !== '[object Array]';
  if (!o.returned_object) {
    stop('DEPLOYMENT_CONTRACT_DID_NOT_RETURN_AN_OBJECT: got ' + (raw === null ? 'null' : typeof raw));
    return o;
  }

  // ---- SHAPE: every promised field, present and of the right type. ----
  S1_DEPLOYMENT_CONTRACT_FIELDS_.forEach(function (f) {
    if (!Object.prototype.hasOwnProperty.call(raw, f.field) || raw[f.field] === undefined
        || raw[f.field] === null) {
      o.missing_fields.push(f.field);
      return;
    }
    if (!S1_typeOk_(raw[f.field], f.type)) {
      o.wrong_type_fields.push(f.field + ' is ' + Object.prototype.toString.call(raw[f.field])
        + ', expected ' + f.type);
    }
  });
  o.readable = o.missing_fields.length === 0 && o.wrong_type_fields.length === 0;
  if (o.missing_fields.length) stop('DEPLOYMENT_CONTRACT_MISSING_FIELD: ' + o.missing_fields.join(', '));
  if (o.wrong_type_fields.length) {
    stop('DEPLOYMENT_CONTRACT_WRONG_FIELD_TYPE: ' + o.wrong_type_fields.join('; '));
  }
  // Values are read even when the shape is imperfect, because an operator needs to see WHAT was there — but
  // `readable` is already false and contract_ok cannot become true below.

  o.deployment_build = (typeof raw.deployment_build === 'string') ? raw.deployment_build.trim() : null;
  o.verdict = (typeof raw.verdict === 'string') ? raw.verdict : null;
  // ANCHORED AT THE START. 63_'s healthy verdict begins 'UNIFORM — …' and its failure branch begins
  // 'MIXED_OR_PARTIAL_SYNC …', so this is exact rather than a substring guess — and it is never the only
  // thing that has to be true.
  o.verdict_is_uniform = o.verdict === null ? null : /^UNIFORM\b/.test(o.verdict.trim());
  o.mixed_deployment = (raw.mixed_deployment === true || raw.mixed_deployment === false)
    ? raw.mixed_deployment : null;
  var mods = S1_typeOk_(raw.modules, 'array') ? raw.modules : null;
  var stale = S1_typeOk_(raw.stale_modules, 'array') ? raw.stale_modules : null;
  var absent = S1_typeOk_(raw.absent_modules, 'array') ? raw.absent_modules : null;
  var absentOpt = S1_typeOk_(raw.absent_optional_modules, 'array') ? raw.absent_optional_modules : null;
  o.stale_modules = stale === null ? null : stale.slice(0, 8);
  o.stale_module_count = stale === null ? null : stale.length;
  o.absent_modules = absent === null ? null : absent.slice(0, 8);
  o.absent_module_count = absent === null ? null : absent.length;
  o.absent_optional_modules = absentOpt === null ? null : absentOpt.slice(0, 8);
  o.absent_optional_module_count = absentOpt === null ? null : absentOpt.length;
  o.module_count = mods === null ? null : mods.length;

  // ---- THE PER-MODULE STAMPS, ROW BY ROW. 63_'s own semantics, not a re-invention of them:
  //      a REQUIRED owner must be present and match; an OPTIONAL owner may be absent (63_ §J.6 — a one-shot
  //      migration the operator was told to remove) but a present one must still match, because
  //      "a stale one is still a fault: a wrong version is never expected". ----
  if (mods === null) {
    stop('DEPLOYMENT_CONTRACT_MODULES_IS_NOT_AN_ARRAY');
  } else {
    var mism = [], malformed = [], req = 0, opt = 0;
    mods.forEach(function (r, i) {
      if (!r || typeof r !== 'object') { malformed.push('row ' + i + ' is not an object'); return; }
      var file = S1_str_(r.file) || ('row ' + i);
      if (S1_str_(r.file) === '') { malformed.push('row ' + i + ' has no file'); return; }
      if (r.present !== true && r.present !== false) {
        malformed.push(file + ' has no boolean `present`'); return;
      }
      if (r.matches_expected !== true && r.matches_expected !== false) {
        malformed.push(file + ' has no boolean `matches_expected`'); return;
      }
      var optional = r.optional === true;
      if (optional) opt++; else req++;
      if (!r.present) {
        if (!optional) {
          mism.push(file + ' is ABSENT (expected ' + S1_str_(r.expected_build) + ')');
        }
        return;                                  // an absent OPTIONAL owner is not a mismatch
      }
      if (r.matches_expected !== true) {
        mism.push(file + ' declares ' + S1_str_(r.declared_build) + ', expected '
          + S1_str_(r.expected_build));
      }
    });
    o.required_module_count = req;
    o.optional_module_count = opt;
    o.module_mismatches = mism.slice(0, 8);
    o.module_mismatch_count = mism.length;
    o.malformed_module_rows = malformed.slice(0, 8);
    if (malformed.length) {
      o.readable = false;
      stop('DEPLOYMENT_CONTRACT_MALFORMED_MODULE_ROW: ' + malformed.slice(0, 4).join('; '));
    }
    if (mism.length) stop('MODULE_STAMP_MISMATCH: ' + mism.slice(0, 4).join('; '));
    // A manifest that authorizes a write must have actually SEEN some owner rows. An empty manifest is not
    // a uniform deployment; it is a contract that measured nothing.
    if (mods.length === 0) stop('DEPLOYMENT_CONTRACT_LISTED_NO_MODULES');
  }

  // ---- THE RUNTIME HALF. 63_ folds runtime_authority.uniform into mixed_deployment, so requiring it here
  //      adds no new refusal — it names the cause when mixed_deployment is true for that reason.
  //
  //      `checked` is RECORDED AND NOT GATED ON, deliberately. 63_ keeps uniform=true when nothing could be
  //      compared ("NOT a divergence: nothing was compared, so nothing disagreed"), and an absent authority
  //      is already named by absent_modules. Gating on `checked` would make this manifest STRICTER than the
  //      contract it reads and could refuse a healthy deployment for a reason 63_ does not consider a
  //      fault — which is precisely the bug this round exists to repair, rebuilt in the other direction.
  var rt = S1_typeOk_(raw.runtime_authority, 'object') ? raw.runtime_authority : null;
  if (rt) {
    o.runtime_checked = (rt.checked === true || rt.checked === false) ? rt.checked : null;
    o.runtime_uniform = (rt.uniform === true || rt.uniform === false) ? rt.uniform : null;
    o.runtime_divergent = Object.prototype.toString.call(rt.divergent) === '[object Array]'
      ? rt.divergent.slice(0, 4) : null;
    if (o.runtime_uniform === null) {
      o.readable = false;
      stop('DEPLOYMENT_CONTRACT_RUNTIME_AUTHORITY_HAS_NO_BOOLEAN_UNIFORM');
    } else if (o.runtime_uniform !== true) {
      stop('RUNTIME_AUTHORITY_DIVERGENCE: ' + S1_cap_(S1_str_(rt.verdict), 160));
    }
  }

  // ---- HEALTH, each with its own reason. ----
  o.build_matches = o.deployment_build === null ? null : (o.deployment_build === S1_BUILD_);
  if (o.deployment_build === null) {
    stop('DEPLOYMENT_BUILD_IS_MISSING_OR_NOT_A_STRING');
  } else if (o.build_matches !== true) {
    stop('DEPLOYMENT_BUILD_IS_NOT_THE_ONE_THIS_MANIFEST_WAS_WRITTEN_AGAINST: deployment declares '
      + o.deployment_build + ', this manifest was written against ' + S1_BUILD_);
  }
  if (o.mixed_deployment === null) stop('MIXED_DEPLOYMENT_IS_NOT_A_BOOLEAN');
  else if (o.mixed_deployment !== false) stop('DEPLOYMENT_IS_MIXED: ' + S1_cap_(S1_str_(o.verdict), 160));
  if (o.stale_module_count === null) stop('STALE_MODULES_IS_NOT_AN_ARRAY');
  else if (o.stale_module_count !== 0) stop('OWNER_MODULE_IS_STALE: ' + o.stale_modules.join('; '));
  if (o.absent_module_count === null) stop('ABSENT_MODULES_IS_NOT_AN_ARRAY');
  else if (o.absent_module_count !== 0) stop('OWNER_MODULE_IS_ABSENT: ' + o.absent_modules.join('; '));
  if (o.verdict_is_uniform === null) stop('DEPLOYMENT_VERDICT_IS_MISSING_OR_NOT_A_STRING');
  else if (o.verdict_is_uniform !== true) {
    stop('DEPLOYMENT_VERDICT_IS_NOT_UNIFORM: ' + S1_cap_(S1_str_(o.verdict), 160));
  }

  o.contract_ok = o.readable && o.stop_reasons.length === 0;
  return o;
}

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
  // S1-R4B — ONE VALIDATOR, AND IT READS THE FIELDS 63_ ACTUALLY PUBLISHES.
  //
  // This used to hand-roll the summary and read `_dep.available`, a field the contract has never had — it was
  // invented on the catch path here and then read back as a promise. `undefined === true` was false, so the
  // manifest called a readable contract unreadable while extracting values out of it in the same breath.
  // S1_deploymentContract_ validates the real shape field by field and separates SHAPE from HEALTH.
  var _dc = S1_deploymentContract_();
  out.deployment = {
    // `readable` is the SHAPE answer and `contract_ok` the HEALTH answer. They are different questions and
    // one flag could not answer both, which is how a missing field came to read as a sync fault.
    readable: _dc.readable, contract_ok: _dc.contract_ok,
    authority_present: _dc.authority_present, threw: _dc.threw,
    missing_fields: _dc.missing_fields, wrong_type_fields: _dc.wrong_type_fields,
    verdict: _dc.verdict, verdict_is_uniform: _dc.verdict_is_uniform,
    deployment_build: _dc.deployment_build,
    expected_build: _dc.expected_build, expected_build_source: _dc.expected_build_source,
    build_matches: _dc.build_matches,
    mixed_deployment: _dc.mixed_deployment,
    module_count: _dc.module_count, required_module_count: _dc.required_module_count,
    optional_module_count: _dc.optional_module_count,
    stale_module_count: _dc.stale_module_count, absent_module_count: _dc.absent_module_count,
    absent_optional_module_count: _dc.absent_optional_module_count,
    stale_modules: _dc.stale_modules, absent_modules: _dc.absent_modules,
    module_mismatch_count: _dc.module_mismatch_count, module_mismatches: _dc.module_mismatches,
    malformed_module_rows: _dc.malformed_module_rows,
    runtime_checked: _dc.runtime_checked, runtime_uniform: _dc.runtime_uniform,
    runtime_divergent: _dc.runtime_divergent,
    stop_reasons: _dc.stop_reasons, authority: _dc.authority,
    note: 'SUMMARY ONLY — the per-module rows are deliberately not logged; they are what truncated the'
      + ' pair-level evidence in the first production run. Every field name here is one'
      + ' sysModuleBuildStamps_ actually publishes; `readable` is this file\'s own shape verdict.'
  };
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

// ================================================================================================================
// S1-R4A §A — THE EXACT WRITE SET, PREDICTED BY THE PRODUCTION AUTHORITIES THAT WOULD PRODUCE IT.
//
// WHAT R4 GOT WRONG, AND WHY IT WAS WORSE THAN A NAMING SLIP. The baseline carried `expected_ai_identities`,
// and the value assigned to it was `cand.existing_affected_ai_identities` — the AI rows that ALREADY EXIST and
// would be superseded. Three different things were wearing one name:
//
//   1. what is there now          (existing active AI identities)
//   2. what a run would retire    (the expiration candidates)
//   3. what a run would WRITE     (never measured at all)
//
// On the live scope there are no existing AI rows, so the field read `[]` and the count read 0 — and the
// authorization sentence said "across 0 superseded AI identities". Every word of that is true and it answers a
// question nobody asked. The operator was being asked to authorize a write whose identities had never been
// computed, so an AFTER readback had nothing to compare a created row against: any new header would be equally
// consistent with the baseline. A baseline that cannot be contradicted is not evidence.
//
// SO THE PREDICTION IS TAKEN FROM PRODUCTION, NOT REBUILT HERE. 61_'s generation splits at a documented seam:
// "PASS 1 computes every group and writes nothing; the gate then runs on the complete set of proposed
// identities; PASS 2 writes only what survived." Everything needed to name the write set exists on the PASS 1
// side of that seam, and every piece of it is pure:
//
//   weeklyAiPlanHarvest_                      the read the generation itself starts from
//   KMWHA.mapWeeklyHarvestToBatchRequest      harvest -> batch request
//   KMWRB.buildWeeklySourceLines              the source lines
//   weeklyAiPlanK2AllocatedLines_             THE ALLOCATOR. Never re-implemented here.
//   inventoryAiPlanScopeEnabled_              the same allowlist guard PASS 1 applies, per marketplace bucket
//   weeklyAiPlanReadCarrierAuthorities_ / weeklyAiPlanShipDate_
//   KMWRR.buildK2GenerationPlan               route grouping — "pure ... Deterministic + no clock/random"
//   sadK2GroupKey_ / sadK2DeterministicHeaderId_ / sadK2DeterministicLineId_    the K2 identity authority
//   sadK2ResolveActiveDraft_                  CREATE vs REUSE — 16_: "Pure; no sheet access"
//   aiplExpirationCandidates_                 the SAME selector that will actually expire them
//
// There is precedent for reaching them read-only: TEMP_migrate_request_order_draft_v2's LIVE DRY ASSEMBLY runs
// this identical chain and "NEVER calls the atomic write endpoint".
//
// AND IF ANY LINK IS ABSENT, THE ANSWER IS A REFUSAL WITH A NAME. A half-synced project would let a diagnostic
// approximate the write set from what it can still reach, and an approximate write set is the one thing this
// baseline must never contain: it would be indistinguishable from a measured one and wrong. Every authority is
// probed by name first, and a single absence is EXACT_PRODUCTION_WRITESET_NOT_MEASURABLE.
// ================================================================================================================

var S1_WRITESET_STOP_ = 'EXACT_PRODUCTION_WRITESET_NOT_MEASURABLE';
var S1_DRAFT_HEADER_TABLE_ = 'shipping_allocation_drafts';
var S1_DRAFT_LINE_TABLE_ = 'shipping_allocation_draft_lines';

/** Named one by one rather than looked up from a list of strings, because `typeof` over a computed name needs
 *  eval and a diagnostic that evals its own authority names can be made to probe the wrong thing. */
function S1_writeSetAuthorityReport_() {
  var A = [];
  function rec(name, present, kind) { A.push({ authority: name, present: present === true, provides: kind }); }
  rec('weeklyAiPlanHarvest_', typeof weeklyAiPlanHarvest_ === 'function', 'the live harvest the generation starts from');
  rec('KMWHA.mapWeeklyHarvestToBatchRequest',
    typeof KMWHA !== 'undefined' && !!KMWHA && typeof KMWHA.mapWeeklyHarvestToBatchRequest === 'function',
    'harvest -> batch request');
  rec('KMWRB.buildWeeklySourceLines',
    typeof KMWRB !== 'undefined' && !!KMWRB && typeof KMWRB.buildWeeklySourceLines === 'function',
    'the weekly source lines');
  rec('weeklyAiPlanK2AllocatedLines_', typeof weeklyAiPlanK2AllocatedLines_ === 'function',
    'THE ALLOCATOR — one allocated line per source');
  rec('inventoryAiPlanScopeEnabled_', typeof inventoryAiPlanScopeEnabled_ === 'function',
    'the activation allowlist guard PASS 1 applies');
  rec('weeklyAiPlanReadCarrierAuthorities_', typeof weeklyAiPlanReadCarrierAuthorities_ === 'function',
    'rate cards + lead times');
  rec('weeklyAiPlanShipDate_', typeof weeklyAiPlanShipDate_ === 'function', 'the ship date');
  rec('KMWRR.buildK2GenerationPlan',
    typeof KMWRR !== 'undefined' && !!KMWRR && typeof KMWRR.buildK2GenerationPlan === 'function',
    'PASS 1 route grouping — pure, deterministic');
  rec('sadK2GroupKey_', typeof sadK2GroupKey_ === 'function', 'the canonical K2 group key');
  rec('sadK2DeterministicHeaderId_', typeof sadK2DeterministicHeaderId_ === 'function',
    'the deterministic K2 header id');
  rec('sadK2DeterministicLineId_', typeof sadK2DeterministicLineId_ === 'function',
    'the deterministic K2 line id');
  rec('sadK2ResolveActiveDraft_', typeof sadK2ResolveActiveDraft_ === 'function',
    'CREATE vs REUSE over the active headers');
  rec('aiplExpirationCandidates_', typeof aiplExpirationCandidates_ === 'function',
    'the set a run would expire — the same selector the run uses');
  var missing = A.filter(function (x) { return !x.present; }).map(function (x) { return x.authority; });
  return { authorities: A, missing: missing, ok: missing.length === 0 };
}

/**
 * The exact write set for ONE allowlisted scope. Read-only: every call below is on the PASS 1 side of 61_'s
 * documented seam, and none of them touches a writer.
 *
 * Returns { measurable, stop_code, stage, route_groups, expected_header_ids, expected_line_ids,
 *           expected_k2_group_keys, create/update counts, blocked_lines, conflicts, ... }.
 */
function S1_predictedWriteSet_(ss, scope, cycle, headerRows, existingLineIds) {
  var out = { measurable: false, stop_code: null, stage: null, stage_detail: null,
    authorities: null, missing_authorities: [],
    route_groups: [], expected_header_ids: [], expected_line_ids: [], expected_k2_group_keys: [],
    expected_create_header_count: 0, expected_update_header_count: 0,
    expected_create_line_count: 0, expected_update_line_count: 0,
    expected_line_planned_total: 0, expected_line_recommended_total: 0,
    blocked_lines: [], conflicts: [], duplicate_header_ids: [],
    allocated_line_count: null, kept_line_count: null, excluded_line_count: null,
    conserved: null, ship_date: null,
    authority_note: 'Every identity here was produced by the production authorities named in `authorities`.'
      + ' Nothing in this object is a local re-implementation of the allocator, the route grouping or the'
      + ' K2 identity, and nothing is carried over from a previous run.' };

  var rep = S1_writeSetAuthorityReport_();
  out.authorities = rep.authorities;
  out.missing_authorities = rep.missing;
  if (!rep.ok) {
    out.stop_code = S1_WRITESET_STOP_;
    out.stage = 'AUTHORITY_PRESENCE';
    out.stage_detail = 'absent in this deployment: ' + rep.missing.join(', ');
    return out;
  }
  if (!ss || !scope) {
    out.stop_code = S1_WRITESET_STOP_;
    out.stage = !ss ? 'SPREADSHEET_NOT_OPENED' : 'SCOPE_NOT_MEASURED';
    return out;
  }

  var mk = S1_str_(scope.marketplace);
  try {
    // ---- the live harvest. The generation's own first read. ----
    var h = weeklyAiPlanHarvest_(ss, { company: scope.company, country: scope.country, planningCycle: cycle });
    if (!h || h.ok !== true) {
      out.stop_code = S1_WRITESET_STOP_; out.stage = 'HARVEST';
      out.stage_detail = h ? S1_cap_(JSON.stringify(h.reason || h.error || h), 300) : 'harvest returned nothing';
      return out;
    }
    var sourcePage = (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined')
      ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : 'inventory_replenishment';
    var mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
      planningCycle: cycle,
      businessScope: { company: scope.company, country: scope.country, marketplace: mk, source_page: sourcePage },
      // MANUAL_REGENERATE is the mode a controlled activation runs in. It is the mode being PREDICTED, not
      // performed: this call builds a request object and hands it to a pure builder.
      mode: 'MANUAL_REGENERATE', actor: 'S1_MANIFEST_P_READ_ONLY_PREDICTION',
      now: (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : null,
      sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
      factoryIdentityConfig: (typeof WEEKLY_AI_PLAN_FACTORY_IDENTITY_ !== 'undefined')
        ? WEEKLY_AI_PLAN_FACTORY_IDENTITY_ : null,
      warehousesById: h.warehousesById, kmaf: h.kmaf,
      horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku });
    if (!mapped || mapped.ready !== true) {
      out.stop_code = S1_WRITESET_STOP_; out.stage = 'HARVEST_MAPPING';
      out.stage_detail = mapped ? S1_cap_(JSON.stringify(mapped.issues || mapped.reason || ''), 300) : 'no mapping';
      return out;
    }
    var src = KMWRB.buildWeeklySourceLines(mapped.request);
    if (!src || src.ok !== true) {
      out.stop_code = S1_WRITESET_STOP_; out.stage = 'SOURCE_LINES';
      out.stage_detail = src ? S1_cap_(S1_str_(src.reason || src.status), 300) : 'no source lines';
      return out;
    }
    // ---- THE ALLOCATOR. Called, never copied. ----
    var allocated = weeklyAiPlanK2AllocatedLines_(src.lines, h) || [];
    out.allocated_line_count = allocated.length;

    // ---- marketplace buckets, then the SAME allowlist guard PASS 1 applies to each bucket. ----
    var byMkt = {};
    allocated.forEach(function (a) {
      var m = S1_str_(a && a.marketplace);
      (byMkt[m] = byMkt[m] || []).push(a);
    });
    if (mk) {
      var only = {};
      if (byMkt[mk]) only[mk] = byMkt[mk];
      byMkt = only;                       // a controlled run generates exactly one marketplace, never fans out
    }
    var kept = {}, keptCount = 0, excluded = 0;
    Object.keys(byMkt).forEach(function (m) {
      var inn = byMkt[m].filter(function (a) {
        var okScope = inventoryAiPlanScopeEnabled_(scope.company, scope.country, m, a && a.sku);
        if (!okScope) excluded++;
        return okScope;
      });
      if (inn.length) { kept[m] = inn; keptCount += inn.length; }
    });
    out.kept_line_count = keptCount;
    out.excluded_line_count = excluded;
    if (!keptCount) {
      // NOT a measurement failure: the authorities were all reachable and the answer is "this scope allocates
      // nothing". A candidate with a positive residual that allocates no line is a contradiction the manifest
      // must refuse, and it is refused by the predicate on the counts — not by pretending the set is unknown.
      out.measurable = true;
      out.stage = 'NO_LINE_SURVIVED_THE_ALLOWLIST_GUARD';
      return out;
    }

    var carriers = weeklyAiPlanReadCarrierAuthorities_(ss);
    var shipDate = weeklyAiPlanShipDate_(h);
    out.ship_date = shipDate || null;

    var seenHid = {}, conserved = true;
    var existingLine = existingLineIds || {};
    Object.keys(kept).sort().forEach(function (M) {
      var plan = KMWRR.buildK2GenerationPlan({
        scope: { planning_cycle: cycle, company: scope.company, country: scope.country,
          marketplace: M, source_page: sourcePage },
        allocatedLines: kept[M], warehousesById: h.warehousesById,
        rateCards: carriers.rateCards, leadTimes: carriers.leadTimes, shipDate: shipDate,
        authorizedBySkuWindow: (function () {
          var a = {};
          kept[M].forEach(function (x) {
            var k = S1_str_(x.sku).toLowerCase() + '|' + S1_str_(x.window_code).toLowerCase();
            a[k] = (a[k] || 0) + (Number(x.planned_qty) || 0);
          });
          return a;
        })(),
        sourceCeilingById: {} });
      if (plan && plan.conservation && plan.conservation.conserved === false) conserved = false;
      (plan && plan.blocked ? plan.blocked : []).forEach(function (b) {
        if (out.blocked_lines.length < 30) {
          out.blocked_lines.push({ marketplace: M, block: b.block,
            reason: b.method_unresolved_reason || b.auto_ranking_insufficient_reason || null,
            sku: S1_str_(b.line && b.line.sku) });
        }
      });
      (plan && plan.groups ? plan.groups : []).forEach(function (g) {
        // THE HEADER IS STAMPED THE WAY PASS 1 STAMPS IT, because two of the stamped fields are K2 GROUP
        // DIMENSIONS and the deterministic id is computed from them. Predicting the id from an unstamped
        // header would produce an id the writer never mints. These four are lineage/provenance only; no
        // quantity and no route field is touched here.
        g.header.generation_type = 'system_generated';
        var wantKey = sadK2GroupKey_(g.header);
        var r = sadK2ResolveActiveDraft_(headerRows || [], g.header);
        var hid = S1_str_(r && r.allocation_draft_id);
        var cls = (r && r.status === 'CREATE') ? 'CREATE'
          : ((r && r.status === 'REUSE') ? 'UPDATE' : 'BLOCKED_CONFLICT');
        if (cls === 'BLOCKED_CONFLICT') {
          out.conflicts.push({ marketplace: M, k2_group_key: wantKey,
            conflicting_ids: (r && r.conflictIds) || [] });
        }
        if (hid) {
          if (seenHid[hid]) out.duplicate_header_ids.push(hid);
          else seenHid[hid] = 1;
        }
        var lineIds = [], createL = 0, updateL = 0, plannedTotal = 0, recTotal = 0;
        (g.lines || []).forEach(function (l) {
          var lid = S1_str_(sadK2DeterministicLineId_(hid, l));
          lineIds.push(lid);
          if (existingLine[lid]) updateL++; else createL++;
          var pq = S1_qty_(l.planned_qty); if (pq !== null) plannedTotal += pq;
          var rq = S1_qty_(l.recommended_qty); if (rq !== null) recTotal += rq;
        });
        if (cls === 'CREATE') out.expected_create_header_count++;
        else if (cls === 'UPDATE') out.expected_update_header_count++;
        out.expected_create_line_count += createL;
        out.expected_update_line_count += updateL;
        out.expected_line_planned_total += plannedTotal;
        out.expected_line_recommended_total += recTotal;
        if (hid && out.expected_header_ids.indexOf(hid) === -1) out.expected_header_ids.push(hid);
        out.expected_k2_group_keys.push(wantKey);
        lineIds.forEach(function (lid) {
          if (lid && out.expected_line_ids.indexOf(lid) === -1) out.expected_line_ids.push(lid);
        });
        out.route_groups.push({ marketplace: M, group_no: g.groupNo,
          k2_group_key: wantKey, allocation_draft_id: hid, classification: cls,
          resolve_status: r ? r.status : null,
          source_warehouse_id: S1_str_(g.header.recommended_source_warehouse_id),
          destination_warehouse_id: S1_str_(g.header.recommended_destination_warehouse_id),
          destination_marketplace: S1_str_(g.header.destination_marketplace),
          shipping_method: S1_str_(g.header.recommended_shipping_method),
          last_mile_delivery: S1_str_(g.header.recommended_last_mile_delivery),
          recommendation_group_no: S1_str_(g.header.recommendation_group_no),
          line_count: (g.lines || []).length, line_ids: lineIds,
          create_line_count: createL, update_line_count: updateL,
          planned_qty_total: plannedTotal, recommended_qty_total: recTotal });
      });
    });
    out.conserved = conserved;
    out.measurable = true;
    out.stage = 'COMPLETE';
    return out;
  } catch (e) {
    // An exception is not an empty write set. It is a measurement that did not happen, and it is named as one.
    out.measurable = false;
    out.stop_code = S1_WRITESET_STOP_;
    out.stage = out.stage || 'THREW';
    out.stage_detail = 'threw: ' + S1_cap_(String(e && e.message ? e.message : e), 300);
    return out;
  }
}

// ================================================================================================================
// S1-R4A §B — FULL-ROW CONTENT FREEZING.
//
// WHY THE ID FINGERPRINT WAS NOT ENOUGH. R4 froze `identity_universe_fingerprint` over the sorted SCOPE KEYS and
// `manual_identity_fingerprint` over seven hand-picked fields. Both detect an identity appearing or disappearing
// and NEITHER detects a row being edited in place: change a `note`, a `planned_qty`, a `line_status`, an
// `updated_at`, and every id is still present and every fingerprint still matches. The readback would report a
// clean world. "No manual row changed" was being asserted from evidence that could not have shown otherwise.
//
// SO EVERY LIVE COLUMN IS IN THE FINGERPRINT — which is why `excluded_fields` is [] by construction rather than
// by promise. Note what is deliberately NOT reused here: SAD_K2_HEADER_FP_ / SAD_K2_LINE_FP_ are the REUSE
// fingerprints, and they EXCLUDE ids, audit columns and draft_version on purpose, because a REUSE decision must
// ignore them. A freeze must not: `updated_at` moving is exactly the evidence that something wrote.
// ================================================================================================================

/** One cell, canonically. The TYPE PREFIX matters: a blank cell, the number 0 and the string '0' are three
 *  different states of a sheet and a fingerprint that maps them together cannot tell a cleared cell from a
 *  zeroed one. Dates go to full ISO precision — a timestamp is often the only thing an in-place edit moves. */
function S1_canonCell_(v) {
  if (v === null || v === undefined) return '~';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var t = v.getTime();
    return isNaN(t) ? 'D:INVALID' : ('D:' + v.toISOString());
  }
  if (typeof v === 'number') return isFinite(v) ? ('N:' + String(v)) : 'N:NONFINITE';
  if (typeof v === 'boolean') return 'B:' + (v === true ? '1' : '0');
  var s = String(v).trim();
  return s === '' ? '~' : ('S:' + s);
}

/** A full-row fingerprint over EVERY live column, named and in live order. Names are included so that a column
 *  append cannot leave two different shapes hashing alike. */
function S1_rowFingerprint_(headers, row) {
  var parts = [];
  for (var i = 0; i < headers.length; i++) {
    parts.push(S1_str_(headers[i]) + '=' + S1_canonCell_(row[i]));
  }
  var joined = parts.join('|');
  if (typeof KMFSG !== 'undefined' && KMFSG && typeof KMFSG.fnv1a === 'function') {
    return String(KMFSG.fnv1a(joined)).toUpperCase();
  }
  return null;
}

/**
 * Read one table as full rows with per-row fingerprints. `authorityColumns` is the canonical column authority
 * from 16_; a live column NOT in it is UNEXPECTED and reported, because an unknown column is either a
 * half-applied migration or something writing to a table this manifest is about to declare frozen.
 */
function S1_fullRowTable_(ss, table, authorityColumns, idColumns) {
  var o = { table: table, present: false, readable: false, live_column_count: null, live_columns: [],
    authority_column_count: (authorityColumns || []).length,
    unexpected_columns: [], missing_columns: [], excluded_fields: [],
    row_count: null, rows: [], combined_fingerprint: null, hash_available: null, error: null,
    note: 'Every live column is in each row fingerprint, which is why excluded_fields is [] by construction.' };
  var sh = null;
  try { sh = ss ? ss.getSheetByName(table) : null; } catch (e) { sh = null; }
  if (!sh) return o;
  o.present = true;
  var vals = null;
  try { vals = (sh.getLastRow() > 0) ? sh.getDataRange().getValues() : []; }
  catch (e2) { o.error = String(e2 && e2.message ? e2.message : e2); return o; }
  o.readable = true;
  var hdrs = (vals && vals.length) ? vals[0].map(function (x) { return S1_str_(x); }) : [];
  while (hdrs.length && hdrs[hdrs.length - 1] === '') hdrs.pop();
  o.live_columns = hdrs;
  o.live_column_count = hdrs.length;
  (authorityColumns || []).forEach(function (c) { if (hdrs.indexOf(c) === -1) o.missing_columns.push(c); });
  hdrs.forEach(function (c) {
    if (c !== '' && (authorityColumns || []).indexOf(c) === -1) o.unexpected_columns.push(c);
  });
  var idx = {};
  hdrs.forEach(function (c, i) { if (c !== '' && idx[c] === undefined) idx[c] = i; });
  var rows = [], sig = [];
  for (var r = 1; r < (vals || []).length; r++) {
    var row = vals[r];
    var blank = true;
    for (var c = 0; c < hdrs.length; c++) { if (S1_canonCell_(row[c]) !== '~') { blank = false; break; } }
    if (blank) continue;                                  // a trailing empty sheet row is not a record
    var fp = S1_rowFingerprint_(hdrs, row);
    // S1-R4C - A ROW CAN BE NON-BLANK WITHOUT BEING A RECORD OF THIS SCHEMA. The blank test above
    // scans every live POSITION, including columns whose header cell is empty. A stray value typed
    // into an unlabelled column therefore counts as a row, and every named field of it - the id
    // included - reads blank. That is a different fault from a record that lost its id, and it has a
    // different remedy (clear the stray cell vs. repair the data), so the two are counted apart.
    var namedNonBlank = false;
    for (var nc = 0; nc < hdrs.length; nc++) {
      if (hdrs[nc] !== '' && S1_canonCell_(row[nc]) !== '~') { namedNonBlank = true; break; }
    }
    var rec = { row_number: r + 1, fingerprint: fp, named_column_nonblank: namedNonBlank };
    (idColumns || []).forEach(function (c) { rec[c] = idx[c] === undefined ? null : S1_str_(row[idx[c]]); });
    rec.__values = row;
    rec.__index = idx;
    rows.push(rec);
    sig.push(S1_str_(rec[(idColumns || [])[0]]) + '~' + S1_str_(fp));
  }
  o.rows = rows;
  o.row_count = rows.length;
  o.hash_available = rows.length === 0 ? null : (rows[0].fingerprint !== null);
  o.combined_fingerprint = S1_fingerprint_(sig);
  return o;
}

/** Read a full-row record's column by name, using the index the read already built. */
function S1_cellOf_(rec, name) {
  if (!rec || !rec.__index || rec.__index[name] === undefined) return null;
  return rec.__values[rec.__index[name]];
}

/** A row-shaped plain object, for handing to the production authorities (aiplIsAiGenerated_,
 *  sadK2ResolveActiveDraft_, aiplExpirationCandidates_) which all take header-shaped objects. */
function S1_recToObject_(rec) {
  var o = {};
  if (!rec || !rec.__index) return o;
  Object.keys(rec.__index).forEach(function (c) { o[c] = rec.__values[rec.__index[c]]; });
  o.__row = rec.row_number;
  return o;
}

// ================================================================================================================
// §B.4 — THE FACTORY WRITE SURFACES. A controlled generation must not move factory stock, and the two audit
// tables are where a move would be recorded. Freezing the pool numbers alone would miss a movement row written
// beside an unchanged total, so the count, the ids and a sorted full-content fingerprint are frozen for each.
// A table that is ABSENT stays absent: row_count null, never 0. Reading "I could not look" as "there was
// nothing there" is precisely how a readback confirms that nothing happened during a run that did something.
// ================================================================================================================
// THE ID COLUMN NAMES ARE THE PRODUCTION ONES, AND THE FIRST VERSION OF THIS GUESSED THEM.
//
// It used `movement_id` and `audit_id`. The real columns are `factory_stock_movement_id` (21_ MOV_HEADERS)
// and `override_audit_id` (71_ FSG_OVERRIDE_AUDIT_HEADERS_[0]). Against a live sheet the guessed names
// resolve to nothing, so every id in the frozen list would have been the empty string — a baseline that
// lists no identities while appearing to list them, which is worse than one that admits it cannot look.
// The fixture used the same invented names, so the tests agreed with the mistake.
//
// The audit id is taken from 71_'s own header authority when that module is present, so it cannot drift from
// the table 71_ writes. The movement id is spelled, because 21_ declares MOV_HEADERS as a local inside its
// handlers and there is no module constant to read — and an UNRESOLVED id column is reported and refused
// below rather than filled with blanks.
// ================================================================================================================
// S1-R4C §1 - AN ID COLUMN THAT RESOLVED IS NOT AN ID THAT IS THERE.
//
// THE LIVE FINDING. A READY run froze `factory_stock_movement_count = 96` beside
// `factory_stock_movement_ids[0] = ""`. Two separate defects met in that one line.
//
// FIRST, THE POSITION MEANT NOTHING. `ids` is `.sort()`ed, and the empty string sorts first, so index 0 is
// where a blank lands no matter which sheet row it came from. The one fact a person needs in order to go and
// look - the row number - had been thrown away before the value was logged.
//
// SECOND, THE BLANK WAS ACCEPTED. R4A refused an id column that could not be RESOLVED, on exactly the right
// reasoning: 'a present, readable table whose id column cannot be found would otherwise freeze a list of blank
// strings, and a readback comparing blanks to blanks passes'. But it then took a resolved column at its word.
// A column that exists and a column that is populated are two different claims, and only the first was
// checked - so one row missing its primary key produced a baseline that lists an identity which is not an
// identity, and an AFTER readback comparing '' to '' would confirm it unchanged.
//
// THE AUTHORITY IS EXPLICIT AND IT DOES NOT PERMIT A BLANK. So this is not a read-range repair and there is
// no legacy allowance to honour: it is a STOP, named, with the row numbers and full-row fingerprints that let
// a person find the row without re-running anything.
// ================================================================================================================

/** Why a blank movement id is refused rather than tolerated, recorded in the output so the refusal carries its
 *  own authority instead of asking to be trusted. Nothing here is inferred from the data being checked. */
var S1_FACTORY_ID_AUTHORITY_ = {
  'factory_stock_movements': {
    column: 'factory_stock_movement_id', required: true, unique: true, blank_permitted: false,
    schema_authority: 'SHIPMENT_DATABASE_SCHEMA.md, factory_stock_movements: factory_stock_movement_id'
      + ' | string | Required Yes | PK',
    writer_authority: 'EVERY writer sets it to FSMV-<8 hex>: 21_ handleAdjustFactoryInventory_,'
      + ' 21_ factoryStockApplyDeltaTx_ (the shared path 12_, 13_ and 22_ all delegate to), and'
      + ' 21_ factoryImportMovObj_. No production path can emit a blank one.',
    stop_code_prefix: 'FACTORY_MOVEMENT'
  },
  'factory_stock_override_audit': {
    column: null, required: true, unique: true, blank_permitted: false,
    schema_authority: '71_ FSG_OVERRIDE_AUDIT_HEADERS_[0] is the audit row identity column',
    writer_authority: '71_ writes one audit row per override with a generated id in column 0',
    stop_code_prefix: 'FACTORY_AUDIT'
  }
};

/**
 * Classify EVERY row's id in a full-row table. Four faults, counted apart because they have four remedies:
 *
 *   BLANK          a record of this schema whose primary key cell is empty
 *   WRONG_TYPE     a date, a number or a boolean where a string primary key belongs - a sheet will happily
 *                  coerce one on read, and '20260901' and a Date print alike in a log while hashing apart
 *   DUPLICATE      two rows claiming one identity, which makes the id useless as a readback key
 *   OUTSIDE_NAMED  a row that is non-blank only in an unlabelled column: not a record at all, and reading it
 *                  as one is the read-range error rather than a data error
 *
 * Row numbers and full-row fingerprints travel with every fault, because 'one of the 96 is blank' is not an
 * actionable finding and 'row 47, fingerprint 3F2A11B9' is.
 */
function S1_idIntegrity_(t, idKey) {
  var o = { id_column: idKey, checked: false, clean: false, row_count: null, ok_count: 0,
    ok_ids: null, faults: [],
    blank_id_count: 0, blank_id_rows: [],
    wrong_type_id_count: 0, wrong_type_id_rows: [],
    duplicate_id_count: 0, duplicate_ids: [], duplicate_id_rows: [],
    outside_named_columns_count: 0, outside_named_columns_rows: [],
    note: 'Row numbers are 1-based sheet rows, so a reported number can be opened directly.' };
  if (!t || !t.present || !t.readable) return o;
  if ((t.live_columns || []).indexOf(idKey) === -1) return o;   // unresolved is R4A's fault, not this one
  o.checked = true;
  o.row_count = t.row_count;
  var seen = {}, ok = [];
  (t.rows || []).forEach(function (r) {
    var sigRow = { row_number: r.row_number, fingerprint: r.fingerprint };
    if (r.named_column_nonblank === false) {
      o.outside_named_columns_count++;
      o.outside_named_columns_rows.push(sigRow);
      return;                                     // not a record of this schema; not judged as one
    }
    var raw = S1_cellOf_(r, idKey);
    var canon = S1_str_(raw);
    if (canon === '') {
      o.blank_id_count++;
      o.blank_id_rows.push(sigRow);
      return;
    }
    if (typeof raw !== 'string') {
      // Recorded AND still counted for uniqueness: a numeric id is a wrong-typed identity, not a missing one.
      o.wrong_type_id_count++;
      o.wrong_type_id_rows.push({ row_number: r.row_number, fingerprint: r.fingerprint,
        id: canon, observed_type: Object.prototype.toString.call(raw) });
    }
    if (seen[canon]) {
      o.duplicate_id_count++;
      if (o.duplicate_ids.indexOf(canon) === -1) o.duplicate_ids.push(canon);
      o.duplicate_id_rows.push({ row_number: r.row_number, fingerprint: r.fingerprint, id: canon,
        first_seen_row: seen[canon] });
    } else {
      seen[canon] = r.row_number;
    }
    ok.push(canon);
  });
  o.ok_count = ok.length;
  var pre = (S1_FACTORY_ID_AUTHORITY_[t.table] && S1_FACTORY_ID_AUTHORITY_[t.table].stop_code_prefix)
    || 'ID';
  if (o.blank_id_count) o.faults.push(pre + '_ID_BLANK');
  if (o.wrong_type_id_count) o.faults.push(pre + '_ID_WRONG_TYPE');
  if (o.duplicate_id_count) o.faults.push(pre + '_ID_DUPLICATE');
  if (o.outside_named_columns_count) o.faults.push(pre + '_ROW_OUTSIDE_NAMED_COLUMNS');
  o.clean = o.faults.length === 0;
  // THE ID LIST IS ONLY PUBLISHED WHEN IT IS A LIST OF IDENTITIES. On a fault it stays null: an array with a
  // blank in it claims an identity that does not exist, and an array with the blank quietly dropped claims a
  // completeness it does not have. Both would be frozen and both would read clean on the way back.
  o.ok_ids = o.clean ? ok.slice().sort() : null;
  return o;
}

// ================================================================================================================
// S1-R4D - THE FAULT WAS MEASURED AND NEVER PRINTED.
//
// WHAT THE LIVE RUN HANDED OVER. verdict STOP, predicates_failed 3,
// factory_id_fault_codes ["FACTORY_MOVEMENT_ID_BLANK"], movement count 96, ok id count 95. That is enough
// to know that exactly one row of ninety-six has no primary key, and not enough to open it.
//
// R4C DID measure the row number and the full-row fingerprint. It put them in two places, and the Logger is
// neither: `surf.id_fault_detail` in the return value, and the `observed` value of the failing predicate in
// the ledger. Manifest P deliberately logs a bounded SUMMARY rather than its whole return value - which is
// correct, because the baseline would blow the log bound - and the summary carried the fault CODE. So the
// same shape as R4C's third finding, one level down: a name standing in for the content it names. A code
// tells an operator what kind of problem exists; a row number is what lets them go and look.
//
// Nothing about the JUDGEMENT changes here. S1_idIntegrity_ remains the single place that decides what a
// fault is; everything below is presentation over what it already decided.
// ================================================================================================================

/** The one spelling of the movement table, so the census below, the surface spec and the id authority cannot
 *  drift apart. Asserted in the suite against S1_FACTORY_ID_AUTHORITY_'s key. */
var S1_FACTORY_MOVEMENT_TABLE_ = 'factory_stock_movements';

/** What to do about each class of fault. Named, because 'the id is blank' and 'a stray cell sits outside the
 *  schema' have different remedies and an operator should not have to infer which one they have. NONE of
 *  these is performed, prepared or staged by this diagnostic: they are the next decision, not this one. */
var S1_ID_FAULT_ACTION_ = {
  BLANK: 'PREPARE_CONTROLLED_ID_BACKFILL',
  WRONG_TYPE: 'PREPARE_CONTROLLED_ID_TYPE_NORMALIZATION',
  DUPLICATE: 'PREPARE_CONTROLLED_ID_DEDUPLICATION',
  OUTSIDE_NAMED: 'REVIEW_UNNAMED_CELL'
};

/**
 * A fingerprint of the HEADER ROW, in live order.
 *
 * S1_fingerprint_ sorts, deliberately: for a list of identities, enumeration order is not a property of the
 * data. For a header row it is - moving a column IS a change - so this reads the header row AS A ROW through
 * S1_rowFingerprint_, which keeps live order and is the same hash authority every other fingerprint in this
 * file goes through. A second algorithm would produce a second answer for the same headers.
 */
function S1_headerFingerprint_(hdrs) {
  return S1_rowFingerprint_(hdrs || [], hdrs || []);
}

/**
 * The NAMED, non-blank fields of one row, excluding the id column - which is what makes
 * `row_has_business_content` a measurement rather than a restatement of the branch the row arrived on.
 * Values are capped, and the cap SAYS so, because a log line is not the place a value gets silently cut.
 */
function S1_namedFields_(rec, skipColumn, liveColumns) {
  var out = [];
  if (!rec || !rec.__index) return out;
  (liveColumns || []).forEach(function (c, i) {
    if (c === '' || c === skipColumn) return;
    if (rec.__index[c] !== i) return;          // first occurrence only, exactly as the reader indexed it
    var raw = rec.__values[i];
    if (S1_canonCell_(raw) === '~') return;
    out.push({ field: c, value: S1_cap_(S1_str_(raw), 80),
      type: Object.prototype.toString.call(raw) });
  });
  return out;
}

/**
 * Turn what S1_idIntegrity_ decided into rows an operator can act on. One entry per fault, in SHEET ORDER,
 * each carrying everything needed to find the row without re-running anything.
 *
 * THE ROW NUMBER DOES NOT COME FROM THE ID LIST, and that is the point. `ids` is sorted, so the blank that
 * appeared at index 0 could have been any of the ninety-six rows; these row numbers come from the read
 * itself, which walks the sheet top-down. Sorting the OUTPUT by row number then makes the emitted order the
 * order a person scrolls in.
 */
function S1_idFaultRows_(t, integ, tableName, authority) {
  var out = [];
  if (!t || !integ || integ.checked !== true) return out;
  var idKey = integ.id_column;
  var pre = (authority && authority.stop_code_prefix) || 'ID';
  var hdrFp = S1_headerFingerprint_(t.live_columns);
  var namedCount = (t.live_columns || []).filter(function (c) { return c !== ''; }).length;
  var byRow = {};
  (t.rows || []).forEach(function (r) { byRow[r.row_number] = r; });

  function record(kind, code, entry) {
    var rec = byRow[entry.row_number] || null;
    var fields = S1_namedFields_(rec, idKey, t.live_columns);
    var raw = rec ? S1_cellOf_(rec, idKey) : undefined;
    out.push({
      table: tableName,
      sheet_name: tableName,                   // the sheet IS the table in this database
      fault_code: code,
      fault_class: kind,
      one_based_sheet_row_number: entry.row_number,
      id_column_name: idKey,
      observed_id_value: (raw === undefined || raw === null) ? null : S1_cap_(S1_str_(raw), 120),
      observed_id_is_blank: S1_str_(raw) === '',
      observed_id_type: Object.prototype.toString.call(raw),
      first_seen_row: (entry.first_seen_row === undefined) ? null : entry.first_seen_row,
      full_named_row_fingerprint: rec ? rec.fingerprint : null,
      fingerprint_authority: 'S1_rowFingerprint_ - the same hash the BEFORE baseline freezes, so this'
        + ' value can be matched against a frozen signature without recomputing anything',
      fingerprint_covers: 'every live column of the row, named and unnamed, as name=value in live order',
      live_column_count: t.live_column_count,
      named_column_count: namedCount,
      header_fingerprint: hdrFp,
      named_nonblank_fields: fields,
      named_nonblank_field_count: fields.length,
      // MEASURED, not inferred from which branch the row arrived on: a row whose only content sits outside
      // the named columns has no business fields, and one that lost its primary key has some.
      row_has_business_content: fields.length > 0,
      row_outside_named_columns: kind === 'OUTSIDE_NAMED',
      authoritative_id_contract: authority || null,
      recommended_next_action: S1_ID_FAULT_ACTION_[kind] || 'REVIEW',
      action_is_not_authorized_by_this_run: true,
      note: 'READ-ONLY. This diagnostic did not change, add, remove, reorder or mint anything. The'
        + ' recommended action is the NEXT decision and is not authorized, prepared or staged here.'
    });
  }

  (integ.blank_id_rows || []).forEach(function (e) { record('BLANK', pre + '_ID_BLANK', e); });
  (integ.wrong_type_id_rows || []).forEach(function (e) {
    record('WRONG_TYPE', pre + '_ID_WRONG_TYPE', e); });
  (integ.duplicate_id_rows || []).forEach(function (e) {
    record('DUPLICATE', pre + '_ID_DUPLICATE', e); });
  (integ.outside_named_columns_rows || []).forEach(function (e) {
    record('OUTSIDE_NAMED', pre + '_ROW_OUTSIDE_NAMED_COLUMNS', e); });

  out.sort(function (a, b) {
    return a.one_based_sheet_row_number - b.one_based_sheet_row_number;
  });
  return out;
}

/**
 * Emit one LINE PER FAULT, bounded, and never truncated.
 *
 * The line count is the fault count, so the numbering itself tells a reader how many exist. Above the chunk
 * bound the remainder is WITHHELD and the meta line says how many - the same rule the baseline has, for the
 * same reason. And a single fault too wide for one line keeps every field that LOCATES the row and drops the
 * wide one under a named reason, rather than being cut in the middle of a value.
 */
function S1_emitFaultRows_(tag, rows) {
  var list = rows || [];
  var n = list.length;
  if (n === 0) return 0;
  var suffix = '_' + n + '_of_' + n;
  var budget = S1_chunkBudget_(tag, suffix);
  var emit = Math.min(n, S1_LOG_MAX_CHUNKS_);
  for (var i = 0; i < emit; i++) {
    var payload = JSON.stringify(list[i]);
    if (payload.length > budget) {
      var slim = {};
      Object.keys(list[i]).forEach(function (k) {
        if (k !== 'named_nonblank_fields' && k !== 'authoritative_id_contract' && k !== 'note'
            && k !== 'fingerprint_authority' && k !== 'fingerprint_covers') slim[k] = list[i][k];
      });
      slim.detail_withheld = ['named_nonblank_fields', 'authoritative_id_contract'];
      slim.detail_withheld_reason = 'the complete fault payload is ' + payload.length + ' bytes, over the '
        + budget + '-byte line budget. Every field that LOCATES this row is still here; the withheld'
        + ' detail is in the return value, which is never truncated.';
      payload = JSON.stringify(slim);
    }
    S1_log_(tag + '_' + (i + 1) + '_of_' + n, payload);
  }
  return emit;
}

function S1_factorySurfaceSpecs_() {
  var auditId = 'override_audit_id';
  if (typeof FSG_OVERRIDE_AUDIT_HEADERS_ !== 'undefined' && FSG_OVERRIDE_AUDIT_HEADERS_
      && FSG_OVERRIDE_AUDIT_HEADERS_.length) {
    auditId = S1_str_(FSG_OVERRIDE_AUDIT_HEADERS_[0]) || auditId;
  }
  return [
    { table: S1_FACTORY_MOVEMENT_TABLE_, id: 'factory_stock_movement_id',
      id_authority: '21_ MOV_HEADERS[0] (spelled — no module constant to read)' },
    { table: 'factory_stock_override_audit', id: auditId,
      id_authority: (typeof FSG_OVERRIDE_AUDIT_HEADERS_ !== 'undefined')
        ? '71_ FSG_OVERRIDE_AUDIT_HEADERS_[0]' : 'spelled fallback — 71_ not present' }
  ];
}

function S1_factorySurfaces_(ss, poolWarehouseId, poolSku) {
  // S1-R4C - `id_faults` is separate from `unreadable` on purpose. 'I could not look at this table' and 'I
  // looked and one of its records has no primary key' are different findings with different remedies, and
  // folding the second into the first would report a data fault as a deployment fault.
  var out = { pool: null, surfaces: {}, acceptable: true, unreadable: [], id_faults: [],
    // S1-R4D - and the fault ROWS, built here because this is the only place the full-row read is still in
    // scope. Bounded by construction: there is one entry per fault, not one per row.
    id_fault_detail: {}, id_fault_rows: [] };
  // factory_stock: the authoritative quantity columns for THIS pool row, full-row fingerprinted.
  var fs = S1_fullRowTable_(ss, 'factory_stock', null, ['warehouse_id', 'sku']);
  var poolRec = null;
  (fs.rows || []).forEach(function (r) {
    if (S1_str_(r.warehouse_id) === S1_str_(poolWarehouseId) && S1_str_(r.sku) === S1_str_(poolSku)) poolRec = r;
  });
  out.pool = { table: 'factory_stock', present: fs.present, readable: fs.readable,
    pool_row_found: poolRec !== null,
    warehouse_id: S1_str_(poolWarehouseId), sku: S1_str_(poolSku),
    fac_current_stock: poolRec ? S1_qty_(S1_cellOf_(poolRec, 'fac_current_stock')) : null,
    fac_reserved_stock: poolRec ? S1_qty_(S1_cellOf_(poolRec, 'fac_reserved_stock')) : null,
    row_fingerprint: poolRec ? poolRec.fingerprint : null,
    table_row_count: fs.row_count, table_combined_fingerprint: fs.combined_fingerprint };
  if (!fs.present || !fs.readable) { out.acceptable = false; out.unreadable.push('factory_stock'); }

  S1_factorySurfaceSpecs_().forEach(function (spec) {
    var idKey = spec.id;
    var t = S1_fullRowTable_(ss, spec.table, null, [idKey]);
    // AN ID COLUMN THAT IS NOT THERE IS NOT AN EMPTY ID. A present, readable table whose id column cannot be
    // found would otherwise freeze a list of blank strings, and a readback comparing blanks to blanks passes.
    var idResolved = !t.present || !t.readable
      ? null : ((t.live_columns || []).indexOf(idKey) >= 0);
    var integ = S1_idIntegrity_(t, idKey);
    var s = { table: spec.table, present: t.present, readable: t.readable,
      id_column: idKey, id_authority: spec.id_authority, id_column_resolved: idResolved,
      observation_state: !t.present ? 'SHEET_ABSENT'
        : (t.readable ? (idResolved === true ? 'SHEET_PRESENT_AND_READABLE' : 'ID_COLUMN_UNRESOLVED')
          : 'SHEET_PRESENT_BUT_UNREADABLE'),
      // ABSENT KEEPS NULL. Not zero.
      row_count: t.present && t.readable ? t.row_count : null,
      // S1-R4C - THE ID LIST NOW COMES FROM THE INTEGRITY PASS, which publishes it only when every row
      // actually carries one. The old expression mapped and sorted whatever was in the cell, so a blank
      // became a member of the identity list and `.sort()` put it at index 0 - which is exactly how a live
      // freeze came to say `ids[0] = ""` next to `count = 96` and still call itself READY.
      ids: integ.ok_ids,
      id_integrity: integ,
      id_authority_contract: S1_FACTORY_ID_AUTHORITY_[spec.table] || null,
      combined_fingerprint: t.present && t.readable ? t.combined_fingerprint : null,
      live_column_count: t.live_column_count, live_columns: t.live_columns, error: t.error || null };
    // A present, readable table whose id column resolved must ALSO be internally consistent. The full-row
    // fingerprint above stays valid evidence either way - it is computed from the cells, not from the ids -
    // so the fingerprint is kept and it is the ID LIST that is withheld.
    if (integ.checked && !integ.clean) {
      s.observation_state = 'ID_INTEGRITY_FAULT';
      out.acceptable = false;
      integ.faults.forEach(function (f) {
        if (out.id_faults.indexOf(f) === -1) out.id_faults.push(f);
      });
      out.id_fault_detail[spec.table] = {
        faults: integ.faults, row_count: integ.row_count, ok_count: integ.ok_count,
        blank_id_count: integ.blank_id_count, blank_id_rows: integ.blank_id_rows,
        wrong_type_id_count: integ.wrong_type_id_count, wrong_type_id_rows: integ.wrong_type_id_rows,
        duplicate_id_count: integ.duplicate_id_count, duplicate_ids: integ.duplicate_ids,
        duplicate_id_rows: integ.duplicate_id_rows,
        outside_named_columns_count: integ.outside_named_columns_count,
        outside_named_columns_rows: integ.outside_named_columns_rows,
        authority: S1_FACTORY_ID_AUTHORITY_[spec.table] || null };
    }
    if (t.present && !t.readable) { out.acceptable = false; out.unreadable.push(spec.table); }
    if (idResolved === false) { out.acceptable = false; out.unreadable.push(spec.table + '#' + idKey); }
    // S1-R4D - the actionable rows. Empty on a clean surface, so this costs nothing when nothing is wrong.
    s.id_fault_rows = S1_idFaultRows_(t, integ, spec.table,
      S1_FACTORY_ID_AUTHORITY_[spec.table] || null);
    out.id_fault_rows = out.id_fault_rows.concat(s.id_fault_rows);
    out.surfaces[spec.table] = s;
  });
  return out;
}


// ================================================================================================================
// §B.1/§B.2/§B.3 — THE WHOLE DRAFT TABLE, PARTITIONED INTO WHAT MAY CHANGE AND WHAT MAY NOT.
//
// Three buckets, and the reason they are three: a controlled generation is authorized to touch AI rows in the
// target scope and nothing else. So "target manual", "target AI" and "every other scope" have different
// permissions, and collapsing them into one universe fingerprint would make a change in the protected part
// indistinguishable from the change that was authorized.
//
// Provenance comes from 69_'s aiplIsAiGenerated_ — the SAME classifier the generation and the lifecycle use.
// A local "does the id start with AI-" rule would be a second opinion, and the first thing it would get wrong
// is the row this repository already mislabelled once: rows STORED with generation_type `user_created` that
// the classifier reads as manual.
// ================================================================================================================

function S1_draftPartition_(ss, scope) {
  var hAuth = (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ !== 'undefined')
    ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ : null;
  var lAuth = (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ !== 'undefined')
    ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_ : null;
  var out = {
    header_table: S1_fullRowTable_(ss, S1_DRAFT_HEADER_TABLE_, hAuth, ['allocation_draft_id']),
    line_table: S1_fullRowTable_(ss, S1_DRAFT_LINE_TABLE_, lAuth,
      ['allocation_draft_line_id', 'allocation_draft_id', 'sku']),
    column_authority_available: !!hAuth && !!lAuth,
    target_manual: { header_ids: [], line_ids: [], header_sigs: [], line_sigs: [],
      combined_fingerprint: null, planned_total: 0, unreadable_qty_rows: 0 },
    target_ai: { header_ids: [], line_ids: [], header_sigs: [], line_sigs: [],
      combined_fingerprint: null, planned_total: 0 },
    other_scope: { header_count: 0, line_count: 0, header_sigs: [], line_sigs: [],
      combined_fingerprint: null },
    provenance_authority: (typeof aiplIsAiGenerated_ === 'function')
      ? '69_ aiplIsAiGenerated_' : 'UNAVAILABLE',
    unclassified_headers: 0, header_objects: [], active_header_objects: [], existing_line_ids: {},
    terminal_statuses: null };

  if (!out.header_table.readable || !out.line_table.readable) return out;

  var TERM = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined')
    ? SAD_TERMINAL_STATUSES_ : { submitted: 1, cancelled: 1, expired: 1 };
  out.terminal_statuses = Object.keys(TERM).sort();

  // lines grouped by their parent header, so a header's scope membership can be decided by the skus it carries
  var linesByHeader = {};
  (out.line_table.rows || []).forEach(function (lr) {
    var hid = S1_str_(lr.allocation_draft_id);
    (linesByHeader[hid] = linesByHeader[hid] || []).push(lr);
    var lid = S1_str_(lr.allocation_draft_line_id);
    if (lid) out.existing_line_ids[lid] = 1;
  });

  var sku = S1_str_(scope && scope.sku);
  (out.header_table.rows || []).forEach(function (hr) {
    var obj = S1_recToObject_(hr);
    out.header_objects.push(obj);
    var st = S1_str_(obj.status).toLowerCase();
    if (!TERM[st]) out.active_header_objects.push(obj);

    var hid = S1_str_(hr.allocation_draft_id);
    var kids = linesByHeader[hid] || [];
    // The header's OWN three axes, trimmed and compared exactly — the same shape the production scope gate
    // uses. The fourth axis lives on the line, so a header is in the target scope when its three match AND it
    // carries a line for the target sku.
    var axesMatch = S1_str_(obj.company) === S1_str_(scope && scope.company)
      && S1_str_(obj.country) === S1_str_(scope && scope.country)
      && S1_str_(obj.marketplace) === S1_str_(scope && scope.marketplace);
    var carriesSku = false;
    kids.forEach(function (lr) { if (S1_str_(lr.sku) === sku) carriesSku = true; });
    var inTarget = axesMatch && carriesSku;

    var isAi = null;
    if (typeof aiplIsAiGenerated_ === 'function') {
      try { isAi = aiplIsAiGenerated_(obj) === true; } catch (e) { isAi = null; }
    }
    if (isAi === null) out.unclassified_headers++;

    var bucket = !inTarget ? out.other_scope : (isAi === true ? out.target_ai : out.target_manual);
    if (bucket === out.other_scope) {
      out.other_scope.header_count++;
      out.other_scope.header_sigs.push(hid + '~' + S1_str_(hr.fingerprint));
      kids.forEach(function (lr) {
        out.other_scope.line_count++;
        out.other_scope.line_sigs.push(S1_str_(lr.allocation_draft_line_id) + '~' + S1_str_(lr.fingerprint));
      });
      return;
    }
    bucket.header_ids.push(hid);
    bucket.header_sigs.push(hid + '~' + S1_str_(hr.fingerprint));
    kids.forEach(function (lr) {
      var lid = S1_str_(lr.allocation_draft_line_id);
      bucket.line_ids.push(lid);
      bucket.line_sigs.push(lid + '~' + S1_str_(lr.fingerprint));
      var q = S1_qty_(S1_cellOf_(lr, 'planned_qty'));
      if (q === null) { if (bucket === out.target_manual) out.target_manual.unreadable_qty_rows++; }
      else bucket.planned_total += q;
    });
  });

  [out.target_manual, out.target_ai, out.other_scope].forEach(function (b) {
    b.header_sigs.sort(); b.line_sigs.sort();
    b.combined_fingerprint = S1_fingerprint_(b.header_sigs.concat(b.line_sigs));
  });
  return out;
}

// ================================================================================================================
// §A — THE THREE AI IDENTITY SETS, AND THE FOURTH THAT FOLLOWS FROM THEM.
//
//   existing_active_ai_identities                  what is there now
//   ai_expiration_candidates                       what a run would retire (aiplExpirationCandidates_)
//   expected_generation_writes                     what a run would create or update (the predicted write set)
//   expected_post_generation_active_ai_identities  (existing - expired) + written
//
// The fourth is derived, not measured, and is labelled as a derivation. It is what an AFTER readback should
// find, and stating it here is what makes the readback able to disagree.
// ================================================================================================================

function S1_aiIdentitySets_(part, writeSet, scope, cycle) {
  var out = {
    existing_active_ai_identities: [], existing_active_ai_identity_count: 0,
    ai_expiration_candidates: [], ai_expiration_candidate_count: 0,
    expiration_authority: (typeof aiplExpirationCandidates_ === 'function')
      ? '69_ aiplExpirationCandidates_ — the same selector a run uses to expire' : 'UNAVAILABLE',
    expected_generation_writes: null,
    expected_post_generation_active_ai_identities: [],
    expected_post_generation_derivation: '(existing active AI - expiration candidates) + expected written'
      + ' header ids. A DERIVATION, stated so a readback can contradict it.',
    ai_identities_that_will_update: [], ai_identities_that_will_expire: [],
    ai_identities_that_must_stay_unchanged: [] };

  out.existing_active_ai_identities = (part && part.target_ai ? part.target_ai.header_ids : []).slice().sort();
  out.existing_active_ai_identity_count = out.existing_active_ai_identities.length;

  if (typeof aiplExpirationCandidates_ === 'function') {
    try {
      // THE CTX IS THE ONE 61_ PASSES, field for field. aiplSameScope_ reads source_page, company, country,
      // marketplace and planning_cycle, so a ctx missing source_page would silently preserve every row for
      // being "out of scope" and the expire set would read empty for the wrong reason.
      //
      // THE RUN'S OWN ROWS ARE NOT ROWS IT SUPERSEDES, AND THAT HAS TO BE TRANSLATED, NOT DROPPED.
      //
      // 61_ calls this with `generation_run_id: generationRunId, committed_ids: []`, and its own freshly
      // written rows are excluded by SAME_GENERATION_RUN because they carry that run id. A prediction has no
      // run id to match on, so the faithful equivalent is to name the rows this run WOULD own: the predicted
      // header ids, passed as `committed_ids`, which is the other exclusion the same authority offers
      // (CURRENT_RUN_OUTPUT).
      //
      // Passing neither — which the first version of this did — makes a REUSE target appear in BOTH sets: the
      // manifest would report that it expires a row it is in fact updating. Measured on a world seeded with
      // an active draft on the predicted group key, and refused by
      // `no_identity_is_both_expired_and_written_by_the_same_run`. That refusal was correct and the input was
      // wrong.
      var dec = aiplExpirationCandidates_(part.active_header_objects || [], {
        company: scope && scope.company, country: scope && scope.country,
        marketplace: scope && scope.marketplace, planning_cycle: cycle,
        source_page: (typeof WEEKLY_AI_PLAN_SOURCE_PAGE_ !== 'undefined')
          ? WEEKLY_AI_PLAN_SOURCE_PAGE_ : 'inventory_replenishment',
        generation_run_id: '',
        committed_ids: (writeSet && writeSet.expected_header_ids) ? writeSet.expected_header_ids : [] }) || {};
      var ids = {};
      (dec.expire || []).forEach(function (c) {
        var id = S1_str_(c && c.allocation_draft_id);
        if (id) ids[id] = 1;
      });
      out.ai_expiration_candidates = Object.keys(ids).sort();
      out.ai_expiration_preserved_count = (dec.preserved || []).length;
      out.ai_expiration_detail = (dec.expire || []).slice(0, 30);
    } catch (e) {
      out.ai_expiration_candidates = null;
      out.expiration_authority += ' — THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 160);
    }
  } else {
    out.ai_expiration_candidates = null;
  }
  out.ai_expiration_candidate_count = out.ai_expiration_candidates === null
    ? null : out.ai_expiration_candidates.length;

  out.expected_generation_writes = writeSet ? {
    measurable: writeSet.measurable === true,
    expected_header_ids: (writeSet.expected_header_ids || []).slice().sort(),
    expected_line_ids: (writeSet.expected_line_ids || []).slice().sort(),
    expected_k2_group_keys: (writeSet.expected_k2_group_keys || []).slice().sort(),
    create_header_count: writeSet.expected_create_header_count,
    update_header_count: writeSet.expected_update_header_count,
    create_line_count: writeSet.expected_create_line_count,
    update_line_count: writeSet.expected_update_line_count,
    route_group_count: (writeSet.route_groups || []).length
  } : null;

  var expired = {};
  (out.ai_expiration_candidates || []).forEach(function (id) { expired[id] = 1; });
  var written = {};
  ((writeSet && writeSet.expected_header_ids) || []).forEach(function (id) { written[id] = 1; });

  var post = {};
  out.existing_active_ai_identities.forEach(function (id) { if (!expired[id]) post[id] = 1; });
  Object.keys(written).forEach(function (id) { post[id] = 1; });
  out.expected_post_generation_active_ai_identities = Object.keys(post).sort();

  out.ai_identities_that_will_expire = Object.keys(expired).sort();
  out.ai_identities_that_will_update = out.existing_active_ai_identities.filter(function (id) {
    return written[id] === 1;
  });
  // Everything protected: every manual identity in the target scope, plus every AI identity that is neither
  // written nor expired. "Must stay unchanged" is a list, because it is the claim the readback checks.
  out.ai_identities_that_must_stay_unchanged = out.existing_active_ai_identities.filter(function (id) {
    return !written[id] && !expired[id];
  });
  return out;
}

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
  // S1-R4A — the same line-length budget the chunker uses. See S1_chunkBudget_.
  var budget = S1_chunkBudget_(tag + '_freeze_paste_block');
  var n = Math.ceil(String(text).length / budget) || 1;
  if (n > S1_LOG_MAX_CHUNKS_) {
    S1_log_(tag + '_freeze_withheld', JSON.stringify({ verdict: verdict, chunks: 0, paste_into: null,
      bytes: String(text).length, would_be_chunks: n, max_chunks: S1_LOG_MAX_CHUNKS_,
      reason: 'FREEZE_BLOCK_EXCEEDS_THE_LOG_BOUND',
      note: 'A baseline is never truncated to fit: a cut baseline is a wrong baseline. This is a STOP.' }));
    return 0;
  }
  for (var i = 0; i < n; i++) {
    S1_log_(tag + '_freeze_paste_block_' + (i + 1) + '_of_' + n,
      String(text).slice(i * budget, (i + 1) * budget));
  }
  S1_log_(tag + '_freeze_paste_meta', JSON.stringify({ chunks: n, bytes: String(text).length,
    chunk_max_bytes: S1_CHUNK_MAX_BYTES_, chunk_payload_budget: budget,
    paste_into: 'S1_MANIFEST_P_BEFORE_',
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
      // S1-R4A — this used to be the whole claim, and it is a description of an intention rather than a
      // prediction: "the AI identities the census named" were the ones that already existed. The measured
      // fields below (expected_header_ids / expected_line_ids / the four create-update counts) replace it,
      // and this line now only says which of them is authoritative.
      created_or_updated: 'exactly the identities in expected_header_ids and expected_line_ids below,'
        + ' predicted by the production PASS 1 + K2 identity authorities, for exactly the one scope',
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
    // S1-R4C §2 - TWO POPULATIONS, TWO FIELDS, DECLARED AT THE TOP LEVEL for the same reason R4A declared
    // `writer_calls`: a condition that compares against a field which does not exist is not a condition.
    gap_scope_universe: null, allocation_draft_row_universe: null,
    factory_id_fault_codes: [],
    // S1-R4D - declared at the top level for the reason R4A declared `writer_calls`: a world where nothing
    // was reached must still have a field to compare against, and the emitter below reads these.
    factory_id_fault_rows: [], factory_id_fault_chunks: 0,
    // S1-R4A — declared at the top level so a condition can compare against them on a world where nothing
    // was reached. R4 shipped `writer_calls` undeclared and its own read-only gate failed by comparing
    // `undefined` to 0; a gate that fails because its field does not exist is not a gate.
    predicted_write_set: null, ai_identity_sets: null, row_content: null, factory_surfaces: null,
    writeset_stop_code: null,
    live_evidence_summary: null,
    frozen_before: null, freeze_paste_block: null, freeze_withheld_reason: null,
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [],
    operator_authorization_wording: null,
    // S1-R4C §3 - the sentence is now PRINTED and AUDITED, and both facts are part of the return value.
    authorization_chunks: 0, wording_audit: null };
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
        // S1-R4A — WHEN THE WRITE SET COULD NOT BE MEASURED, THAT IS THE HEADLINE. It is the one refusal
        // whose remedy is not "fix the data" but "this deployment cannot produce the evidence", and burying
        // it inside a list of condition names would leave an operator looking for a data problem.
        out.stop_reason = out.writeset_stop_code
          ? (out.writeset_stop_code + ' — the exact set of K2 identities a Generate would create or update'
            + ' could not be produced by the production authorities'
            + ((out.predicted_write_set && out.predicted_write_set.stage)
                ? (' (stage: ' + out.predicted_write_set.stage
                  + (out.predicted_write_set.stage_detail
                      ? '; ' + out.predicted_write_set.stage_detail : '') + ')') : '')
            + ((out.predicted_write_set && (out.predicted_write_set.missing_authorities || []).length)
                ? ('; absent: ' + out.predicted_write_set.missing_authorities.join(', ')) : '')
            + '. An approximate write set may not be substituted, and neither may a count of the rows that'
            + ' already exist. ' + L.failed.length + ' condition(s) not met: ' + L.failed.join(', '))
          : L.failed.length
          ? (L.failed.length + ' condition(s) not met: ' + L.failed.join(', ')
            + '. Nothing may be authorized while any of these is false.')
          : 'no BEFORE baseline could be frozen, so there is nothing an AFTER readback could compare'
            + ' against — which makes the activation unverifiable and therefore refused.';
      }
    }
    // The wording is only ever built from MEASURED values, and only on a READY. A sentence with a
    // placeholder in it, or one built from a refused run, is not an authorization.
    out.operator_authorization_wording = (out.verdict === 'READY_TO_AUTHORIZE')
      ? S1_authWordingP_(out.candidate, out.accepted_run, out.scope,
          out.predicted_write_set, out.ai_identity_sets, out.row_content,
          out.factory_surfaces, out.reservation_observation)
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
    // LOCK FOUR - S1-R4C §3. A SENTENCE THAT WAS FILLED IN CAN STILL LEAVE THE WRITE UNNAMED.
    //
    // LOCK THREE refuses a template that was never filled. It cannot refuse one that was filled and is
    // missing a fact, and the fact most worth losing is the one that bounds the write: the exact K2 header
    // and line ids. So every required fact is looked for IN the text by a needle built from the MEASURED
    // value - one needle per id, so a list that drops an identity is a STOP rather than a shorter list.
    if (out.verdict === 'READY_TO_AUTHORIZE') {
      out.wording_audit = S1_wordingAudit_(out.operator_authorization_wording, out.scope,
        out.accepted_run, out.candidate, out.predicted_write_set, out.ai_identity_sets,
        out.row_content, out.factory_surfaces, out.reservation_observation);
      if (!out.wording_audit.ok) {
        out.verdict = 'STOP';
        out.stop_reason = 'AUTHORIZATION_WORDING_IS_NOT_VERIFIABLE - the sentence does not carry '
          + out.wording_audit.missing.length + ' of the '
          + out.wording_audit.required_item_count + ' facts a person must be able to check against the'
          + ' evidence: ' + out.wording_audit.missing.slice(0, 12).join(', ')
          + '. A person cannot authorize a write the sentence does not name.';
        out.freeze_withheld_reason = 'WITHHELD_BECAUSE_THE_AUTHORIZATION_WORDING_IS_NOT_VERIFIABLE';
        out.freeze_paste_block = null;
        out.operator_authorization_wording = null;
      }
    }
    // LOCK FIVE - S1-R4C. A STOP CARRIES NO BASELINE BY ANY ROUTE, AND IT IS ENFORCED IN ONE PLACE.
    //
    // LOCK ONE nulls the paste block on the ordinary refusal path, where the baseline was never BUILT: the
    // freeze is only constructed when no condition has failed. LOCKS THREE and FOUR fire after a clean
    // measurement, so on those two paths the baseline HAD been built - and it survived the refusal. A run
    // that STOPped for an unusable sentence was still returning `frozen_before`, which is the same content
    // an operator would have pasted, reachable by a second route that the lock did not cover.
    //
    // Found by this round's own STOP table (Y12), which asserted the same four things about six different
    // kinds of refusal instead of about the one being worked on. Enforced here rather than repeated inside
    // each lock, so a future lock cannot forget it.
    if (out.verdict !== 'READY_TO_AUTHORIZE') {
      if (out.frozen_before && !out.freeze_withheld_reason) {
        out.freeze_withheld_reason = 'WITHHELD_BECAUSE_VERDICT_IS_' + (out.verdict || 'UNKNOWN');
      }
      out.frozen_before = null;
      out.freeze_paste_block = null;
      out.operator_authorization_wording = null;
    }
    S1_log_('s1_manifest_p_verdict', JSON.stringify({ manifest: 'P', build: out.build,
      verdict: out.verdict, predicates_passed: out.predicates_passed,
      predicates_failed: out.predicates_failed, failed: out.failed_predicates.slice(0, 20),
      dry_run: out.dry_run, writes: out.writes, writer_calls: out.writer_calls,
      authorization_wording_present: !!out.operator_authorization_wording,
      // S1-R4C - the boolean stays, but it is no longer the only thing a reader gets: the sentence is
      // printed below under s1_manifest_p_authorization_<i>_of_<n>.
      authorization_facts_present: out.wording_audit ? out.wording_audit.present_count : null,
      authorization_facts_missing: out.wording_audit ? out.wording_audit.missing.length : null,
      factory_id_fault_codes: (out.factory_id_fault_codes || []).slice(0, 8),
      allowlisted_scope: out.census ? out.census.allowlisted_scope : null,
      allowlisted_scope_refusals: out.census ? (out.census.allowlisted_scope_refusals || []).slice(0, 8) : null,
      freeze_chunks_expected: (out.verdict === 'READY_TO_AUTHORIZE' && out.freeze_paste_block)
        ? (Math.ceil(out.freeze_paste_block.length / S1_CHUNK_MAX_BYTES_) || 1) : 0,
      stop_reason: S1_cap_(out.stop_reason, 400) }));
    if (out.live_evidence_summary) {
      S1_log_('s1_manifest_p_evidence', JSON.stringify(out.live_evidence_summary));
    }
    // ---- S1-R4C §3 - THE SENTENCE ITSELF, IN THE LOG, IN BOUNDED SEGMENTS. -------------------------
    //
    // `authorization_wording_present = true` was the only thing a live operator ever saw. On a STOP there is
    // nothing to print and the meta line says so with chunks 0 - the same discipline as the freeze block,
    // for the same reason: a refused run must not hand over anything that looks signable.
    if (out.verdict === 'READY_TO_AUTHORIZE' && out.operator_authorization_wording) {
      out.authorization_chunks = S1_emitChunked_('s1_manifest_p_authorization',
        out.operator_authorization_wording);
      S1_log_('s1_manifest_p_authorization_meta', JSON.stringify({
        chunks: out.authorization_chunks,
        bytes: String(out.operator_authorization_wording).length,
        chunk_payload_budget: S1_chunkBudget_('s1_manifest_p_authorization'),
        wording_fingerprint: out.wording_audit ? out.wording_audit.fingerprint : null,
        placeholders: out.wording_audit ? out.wording_audit.placeholders : null,
        required_item_count: out.wording_audit ? out.wording_audit.required_item_count : null,
        facts_present: out.wording_audit ? out.wording_audit.present_count : null,
        facts_missing: out.wording_audit ? out.wording_audit.missing : null,
        expected_header_ids: out.predicted_write_set
          ? out.predicted_write_set.expected_header_ids : null,
        expected_line_ids: out.predicted_write_set
          ? out.predicted_write_set.expected_line_ids : null,
        note: 'Concatenate s1_manifest_p_authorization_1_of_N .. _N_of_N IN ORDER to recover the exact'
          + ' sentence; its fingerprint above is over the whole text, so a mis-assembled copy is'
          + ' detectable. Every fact listed as present was found in the text by an exact match against'
          + ' the measured value. THIS AUTHORIZES ONE GENERATION AND DOES NOT AUTHORIZE SUBMIT.' }));
    } else {
      S1_log_('s1_manifest_p_authorization_meta', JSON.stringify({
        chunks: 0, bytes: 0, wording_fingerprint: null,
        verdict: out.verdict,
        facts_missing: out.wording_audit ? out.wording_audit.missing : null,
        reason: 'NO_AUTHORIZATION_WORDING_ON_A_' + (out.verdict || 'UNKNOWN'),
        note: 'Nothing from this run may be signed, pasted or acted on. No wording was emitted and no'
          + ' baseline was released.' }));
    }
    // ---- S1-R4D §1 - THE FACTORY ID FAULT ROWS, IN THE LOG. ---------------------------------------
    //
    // This is NOT baseline and it is NOT authorization: it is where the data problem is. A STOP withholds
    // everything that could be signed or pasted and still owes the operator the row number - refusing to
    // say what is wrong is not a safety property.
    var frOut = out.factory_id_fault_rows || [];
    if (frOut.length) {
      out.factory_id_fault_chunks = S1_emitFaultRows_('s1_manifest_p_factory_id_fault', frOut);
    }
    S1_log_('s1_manifest_p_factory_id_fault_meta', JSON.stringify({
      verdict: out.verdict,
      fault_count: frOut.length,
      lines_emitted: out.factory_id_fault_chunks,
      lines_withheld: Math.max(0, frOut.length - out.factory_id_fault_chunks),
      max_lines: S1_LOG_MAX_CHUNKS_,
      fault_codes: out.factory_id_fault_codes,
      counts_by_class: (function () {
        var c = {};
        frOut.forEach(function (f) { c[f.fault_class] = (c[f.fault_class] || 0) + 1; });
        return c;
      })(),
      rows: frOut.slice(0, 40).map(function (f) { return f.one_based_sheet_row_number; }),
      recommended_next_actions: (function () {
        var a = [];
        frOut.forEach(function (f) {
          if (a.indexOf(f.recommended_next_action) === -1) a.push(f.recommended_next_action); });
        return a;
      })(),
      note: frOut.length
        ? 'One line per fault above, numbered _<i>_of_<fault count>, in SHEET ROW ORDER. Row numbers are'
          + ' 1-based sheet rows and can be opened directly. NOTHING was changed, added, removed,'
          + ' reordered or minted: the recommended action is the next decision and this run does not'
          + ' authorize, prepare or stage it.'
        : 'No factory id integrity fault was found, so there is nothing to locate. This line is emitted'
          + ' anyway, because an absent line is not an answer.' }));
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
      // S1-R4A §A — the write-set prediction chain, named module by module. Each of these is on the PASS 1
      // side of 61_'s documented "computes every group and writes nothing" seam.
      predicted_write_set: 'weeklyAiPlanHarvest_ -> KMWHA.mapWeeklyHarvestToBatchRequest ->'
        + ' KMWRB.buildWeeklySourceLines -> weeklyAiPlanK2AllocatedLines_ (THE ALLOCATOR) ->'
        + ' inventoryAiPlanScopeEnabled_ per marketplace bucket -> KMWRR.buildK2GenerationPlan (PASS 1'
        + ' route grouping, pure) (61_/90_)',
      k2_identity: 'sadK2GroupKey_ + sadK2DeterministicHeaderId_ + sadK2DeterministicLineId_ (16_)',
      create_vs_update: 'sadK2ResolveActiveDraft_ (16_) — pure, no sheet access',
      row_content: 'live full rows of shipping_allocation_drafts / _draft_lines against'
        + ' SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_ and SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_'
        + ' (16_), every live column fingerprinted with KMFSG.fnv1a',
      row_provenance: 'aiplIsAiGenerated_ (69_)',
      factory_write_surfaces: 'direct full-row observation of factory_stock, factory_stock_movements and'
        + ' factory_stock_override_audit',
      note: 'NOTHING here is a stored value from a previous run. No allocator, route-grouping or K2'
        + ' identity algorithm is re-implemented in this file; every identity below was produced by the'
        + ' production authority that would produce it during a real generation.' };

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
    // S1-R4B — SHAPE FIRST, THEN HEALTH, EACH WITH ITS OWN NAME.
    //
    // `the_deployment_contract_is_readable` used to ask for `dep.available`, which 63_ does not publish, so
    // it failed on a healthy deployment while the surrounding evidence read fine. It is now the SHAPE
    // question and nothing else: the authority exists, it returned an object, and every field the contract
    // promises is present with the right type. Health is the seven conditions after it.
    L.P('the_deployment_contract_is_readable',
      'an object carrying ' + S1_DEPLOYMENT_CONTRACT_FIELDS_.length + ' typed fields',
      dep ? { readable: dep.readable, authority_present: dep.authority_present, threw: dep.threw,
        missing_fields: dep.missing_fields, wrong_type_fields: dep.wrong_type_fields } : null,
      !!dep && dep.readable === true);
    L.P('every_module_row_in_the_contract_is_well_formed', [],
      dep ? dep.malformed_module_rows : null,
      !!dep && Object.prototype.toString.call(dep.malformed_module_rows) === '[object Array]'
        && dep.malformed_module_rows.length === 0);
    L.P('the_contract_listed_at_least_one_owner_module', 'more than zero',
      dep ? dep.module_count : null, !!dep && dep.module_count > 0);
    L.P('the_deployment_is_not_mixed', false, dep ? dep.mixed_deployment : null,
      !!dep && dep.mixed_deployment === false);
    L.P('no_owner_module_is_stale', 0, dep ? dep.stale_module_count : null,
      !!dep && dep.stale_module_count === 0);
    L.P('no_owner_module_is_absent', 0, dep ? dep.absent_module_count : null,
      !!dep && dep.absent_module_count === 0);
    // THE PER-MODULE STAMPS, not just the two summary lists. A required owner must be present AND match; an
    // optional one may be absent (63_ §J.6) but a present one must still match, because 63_ says so itself:
    // "a stale one is still a fault: a wrong version is never expected."
    L.P('every_required_module_stamp_is_present_and_matches_what_is_expected', [],
      dep ? dep.module_mismatches : null,
      !!dep && Object.prototype.toString.call(dep.module_mismatches) === '[object Array]'
        && dep.module_mismatch_count === 0);
    // THE EXPECTATION COMES FROM S1_BUILD_, NEVER FROM THE OBJECT UNDER TEST. `expected_build_source` is
    // carried so this is auditable rather than asserted.
    L.P('the_deployment_build_is_the_one_this_manifest_was_written_against', S1_BUILD_,
      dep ? { declared: dep.deployment_build, expected: dep.expected_build,
        expected_from: dep.expected_build_source } : null,
      !!dep && dep.deployment_build === S1_BUILD_ && dep.build_matches === true
        && dep.expected_build === S1_BUILD_);
    // The verdict is checked, and it is NOT a substring test and NOT the only thing that has to be true.
    L.P('the_deployment_verdict_is_uniform', true, dep ? dep.verdict_is_uniform : null,
      !!dep && dep.verdict_is_uniform === true);
    L.P('the_runtime_authority_half_of_the_contract_is_uniform', true,
      dep ? { uniform: dep.runtime_uniform, checked: dep.runtime_checked,
        divergent: dep.runtime_divergent } : null,
      !!dep && dep.runtime_uniform === true);
    // ONE LINE THAT SAYS WHETHER ANYTHING AT ALL IS WRONG, with every reason named. A reader who wants the
    // single answer gets it here; a reader who wants to act gets the list.
    L.P('the_deployment_contract_reports_no_refusal_of_its_own', [],
      dep ? dep.stop_reasons : null,
      !!dep && Object.prototype.toString.call(dep.stop_reasons) === '[object Array]'
        && dep.stop_reasons.length === 0 && dep.contract_ok === true);

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
    // ---- S1-R4C §2A - THE GAP SCOPE UNIVERSE. Named for what it actually counts. -------------------
    //
    // THE MIS-NAMING, AND WHY IT MATTERED. This block used to be called the `identity_universe`, and a live
    // run reported `identity_universe_count = 118` and `other_scope_identity_count = 117` a few lines away
    // from `other_scope_header_count = 11` and `other_scope_line_count = 13`. Four numbers, one word
    // 'identity', and TWO DIFFERENT POPULATIONS: 118 is the number of inventory-gap SCOPES the census
    // enumerated (candidates + rejected), while 11 + 13 = 24 is the number of allocation-draft ROWS that
    // belong to other scopes. A reader is invited to conclude that 117 other-scope identities exist and that
    // 24 of them are rows - and 118 was never a row count of anything.
    //
    // The two are frozen separately from here on, each with its own count, its own fingerprint and its own
    // named source, so an AFTER readback can never compare a fingerprint of gap scopes against a claim about
    // draft rows. A fingerprint whose population is ambiguous cannot refuse anything.
    var uni = cen.scope_universe || null;
    var uniKeys = (cen.candidates || []).concat(cen.rejected || [])
      .map(function (r) { return S1_str_(r && r.scope_key); }).filter(function (k) { return k !== ''; });
    var uniFp = S1_fingerprint_(uniKeys);
    var targetKey = out.scope ? S1_str_(out.scope.scope_key) : '';
    var uniTarget = uniKeys.filter(function (k) { return k === targetKey; }).length;
    out.gap_scope_universe = {
      population: 'INVENTORY_GAP_SCOPES',
      source: 'the inventory gap census of THIS run: candidates + rejected, by scope_key',
      unit: 'one entry per company|country|marketplace|sku gap scope - NOT one per draft row',
      total_scope_count: uniKeys.length,
      target_scope_count: uniTarget,
      other_scope_count: uniKeys.length - uniTarget,
      scope_fingerprint: uniFp,
      scope_keys: uniKeys.slice(0, 400),
      note: 'These are GAP SCOPES. They are not allocation draft headers, not draft lines and not draft'
        + ' identities. The draft row population is reported separately as allocation_draft_row_universe.' };
    L.P('the_gap_scope_universe_was_enumerated', 'more than zero gap scopes', uniKeys.length,
      uniKeys.length > 0);
    L.P('the_gap_scope_universe_has_a_fingerprint', 'a fingerprint', uniFp, uniFp !== null);
    // The target scope is one of the enumerated gap scopes, and the split is exact arithmetic rather than an
    // assumption: 118 = 1 + 117 is checkable, 'about 117 others' is not.
    L.P('the_target_scope_appears_exactly_once_in_the_gap_scope_universe', 1, uniTarget, uniTarget === 1);
    L.P('the_gap_scope_universe_splits_exactly_into_the_target_scope_and_the_others',
      uniKeys.length, out.gap_scope_universe.target_scope_count + out.gap_scope_universe.other_scope_count,
      out.gap_scope_universe.target_scope_count
        + out.gap_scope_universe.other_scope_count === uniKeys.length);
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
      // S1-R4C - RENAMED TO WHAT IT HOLDS. `expected_ai_identities` was removed from the freeze in R4A for
      // holding the rows that ALREADY EXIST, but the return value kept the name; a name that answers a
      // different question than it asks is not repaired by removing it from one of its two readers.
      existing_affected_ai_identities: aiAffected || [],
      existing_affected_ai_identity_count: (aiAffected || []).length,
      // S1-R4C - the gap scope counts live under gap_scope_universe now, and they are cross-referenced
      // rather than duplicated under an 'identity' name here.
      gap_scope_universe_ref: 'see out.gap_scope_universe - population INVENTORY_GAP_SCOPES',
      allocation_draft_row_universe_ref: 'see out.allocation_draft_row_universe - population DRAFT_ROWS',
      note: 'Neither universe is an "identity universe". One counts inventory gap scopes and the other'
        + ' counts allocation draft rows; they are different populations and this object names neither as'
        + ' the other. Both are represented in the freeze by COUNT plus FINGERPRINT, because carrying every'
        + ' key into the paste block would put the baseline over the log bound and a truncated baseline is'
        + ' a wrong baseline.' };

    // ---- 10b. S1-R4A §B — THE WHOLE DRAFT TABLE AS FULL ROWS, IN THREE BUCKETS. ---------------------
    //
    // The scope-key fingerprints above answer "did an identity appear or disappear". They cannot answer
    // "was a row edited in place", and that is the question a freeze exists to answer. Every live column of
    // every draft header and line is fingerprinted here, so a changed note, a changed planned_qty and a
    // moved updated_at are each visible with no id having changed at all.
    var dbP = S1_openDb_();
    var part = S1_draftPartition_(dbP.ok ? dbP.ss : null, out.scope);
    out.row_content = {
      header_table: { present: part.header_table.present, readable: part.header_table.readable,
        live_column_count: part.header_table.live_column_count,
        authority_column_count: part.header_table.authority_column_count,
        unexpected_columns: part.header_table.unexpected_columns,
        missing_columns: part.header_table.missing_columns,
        excluded_fields: part.header_table.excluded_fields,
        row_count: part.header_table.row_count,
        combined_fingerprint: part.header_table.combined_fingerprint },
      line_table: { present: part.line_table.present, readable: part.line_table.readable,
        live_column_count: part.line_table.live_column_count,
        authority_column_count: part.line_table.authority_column_count,
        unexpected_columns: part.line_table.unexpected_columns,
        missing_columns: part.line_table.missing_columns,
        excluded_fields: part.line_table.excluded_fields,
        row_count: part.line_table.row_count,
        combined_fingerprint: part.line_table.combined_fingerprint },
      target_manual: { header_ids: part.target_manual.header_ids, line_ids: part.target_manual.line_ids,
        planned_total: part.target_manual.planned_total,
        combined_fingerprint: part.target_manual.combined_fingerprint },
      target_ai: { header_ids: part.target_ai.header_ids, line_ids: part.target_ai.line_ids,
        planned_total: part.target_ai.planned_total,
        combined_fingerprint: part.target_ai.combined_fingerprint },
      other_scope: { header_count: part.other_scope.header_count,
        line_count: part.other_scope.line_count,
        combined_fingerprint: part.other_scope.combined_fingerprint },
      provenance_authority: part.provenance_authority,
      terminal_statuses: part.terminal_statuses,
      column_authority_available: part.column_authority_available,
      note: 'Three buckets because a controlled generation may touch AI rows in the target scope and'
        + ' nothing else. One universe fingerprint would make a change in the protected part'
        + ' indistinguishable from the change that was authorized.' };

    // ---- S1-R4C §2B - THE ALLOCATION DRAFT ROW UNIVERSE. A row count, from the row tables. -------
    //
    // Every number here is derived from the two draft sheets and from nothing else, and the arithmetic below
    // is what makes that checkable rather than asserted. If a future edit fed this block the gap scope count
    // - the confusion this section exists to end - the totals would stop adding up and the run would STOP.
    var duTargetHeaders = (part.target_manual.header_ids || []).length
      + (part.target_ai.header_ids || []).length;
    var duTargetLines = (part.target_manual.line_ids || []).length
      + (part.target_ai.line_ids || []).length;
    var duOtherRows = part.other_scope.header_count + part.other_scope.line_count;
    var duAllSigs = (part.target_manual.header_sigs || []).concat(part.target_manual.line_sigs || [])
      .concat(part.target_ai.header_sigs || []).concat(part.target_ai.line_sigs || [])
      .concat(part.other_scope.header_sigs || []).concat(part.other_scope.line_sigs || []).sort();
    out.allocation_draft_row_universe = {
      population: 'ALLOCATION_DRAFT_ROWS',
      source: 'the two draft sheets read as full rows: ' + S1_DRAFT_HEADER_TABLE_ + ' + '
        + S1_DRAFT_LINE_TABLE_,
      unit: 'one entry per sheet row - one header row and one line row each count as one row',
      header_count: part.header_table.row_count,
      line_count: part.line_table.row_count,
      total_row_count: part.header_table.row_count + part.line_table.row_count,
      target_manual_header_count: (part.target_manual.header_ids || []).length,
      target_manual_line_count: (part.target_manual.line_ids || []).length,
      target_ai_header_count: (part.target_ai.header_ids || []).length,
      target_ai_line_count: (part.target_ai.line_ids || []).length,
      target_row_count: duTargetHeaders + duTargetLines,
      other_scope_header_count: part.other_scope.header_count,
      other_scope_line_count: part.other_scope.line_count,
      other_scope_row_count: duOtherRows,
      row_signature_count: duAllSigs.length,
      combined_fingerprint: S1_fingerprint_(duAllSigs),
      note: 'These are DRAFT ROWS across every scope, full-row fingerprinted. They are not gap scopes. The'
        + ' combined fingerprint covers every row of both tables, so a row edited in place with no id'
        + ' changed is visible here even when every per-bucket count is identical.' };
    var du = out.allocation_draft_row_universe;

    L.P('both_draft_tables_are_present_and_readable', [true, true],
      [part.header_table.readable, part.line_table.readable],
      part.header_table.readable === true && part.line_table.readable === true);
    // ---- §2 THE ARITHMETIC. Four identities that must hold, so a mixed-up population cannot pass. ----
    L.P('the_draft_row_universe_total_is_its_header_rows_plus_its_line_rows',
      du.header_count + du.line_count, du.total_row_count,
      du.total_row_count === du.header_count + du.line_count);
    L.P('the_draft_row_universe_partitions_exactly_into_target_scope_and_other_scope_rows',
      du.total_row_count, du.target_row_count + du.other_scope_row_count,
      du.target_row_count + du.other_scope_row_count === du.total_row_count);
    L.P('the_other_scope_row_total_is_its_header_count_plus_its_line_count',
      du.other_scope_header_count + du.other_scope_line_count, du.other_scope_row_count,
      du.other_scope_row_count === du.other_scope_header_count + du.other_scope_line_count);
    // EVERY ROW HAS EXACTLY ONE FULL-ROW SIGNATURE. A signature list shorter than the row count is a row
    // protected by nothing; longer means a row was counted twice and the fingerprint is of a population
    // that does not exist.
    L.P('every_draft_row_carries_exactly_one_full_row_signature',
      du.total_row_count, du.row_signature_count, du.row_signature_count === du.total_row_count);
    L.P('the_draft_row_universe_has_a_full_content_fingerprint', 'a fingerprint',
      du.combined_fingerprint, du.combined_fingerprint !== null);
    // ---- §2 AND THE TWO POPULATIONS ARE NOT THE SAME NUMBER WEARING TWO NAMES. -----------------------
    //
    // AN EMPTY TARGET SCOPE MUST NOT ACQUIRE AN IDENTITY FROM THE OTHER UNIVERSE. When the target scope
    // holds no draft rows at all, every target-scope identity count must be zero - and the gap scope
    // universe, which has 118 entries in this deployment, must not supply one.
    L.P('the_target_scope_identity_counts_are_exactly_its_own_row_counts',
      { manual_headers: du.target_manual_header_count, ai_headers: du.target_ai_header_count },
      { manual_ids: (part.target_manual.header_ids || []).length,
        existing_ai_ids: (part.target_ai.header_ids || []).length },
      (part.target_manual.header_ids || []).length === du.target_manual_header_count
        && (part.target_ai.header_ids || []).length === du.target_ai_header_count);
    L.P('an_empty_target_scope_reports_no_existing_identities',
      'zero target rows implies zero target identities',
      { target_row_count: du.target_row_count,
        manual_ids: (part.target_manual.header_ids || []).length
          + (part.target_manual.line_ids || []).length,
        ai_ids: (part.target_ai.header_ids || []).length + (part.target_ai.line_ids || []).length },
      du.target_row_count > 0
        || ((part.target_manual.header_ids || []).length === 0
          && (part.target_manual.line_ids || []).length === 0
          && (part.target_ai.header_ids || []).length === 0
          && (part.target_ai.line_ids || []).length === 0));
    // The draft universe is a row count of the draft tables and the gap universe is a scope count of the
    // census. Asserted on the SOURCE of each number, which is the claim a mis-wiring would break.
    L.P('the_draft_row_universe_is_counted_from_the_draft_tables_and_not_from_the_gap_census',
      { header_rows: part.header_table.row_count, line_rows: part.line_table.row_count },
      { universe_header: du.header_count, universe_line: du.line_count,
        gap_scope_total: out.gap_scope_universe.total_scope_count },
      du.header_count === part.header_table.row_count
        && du.line_count === part.line_table.row_count
        && du.population === 'ALLOCATION_DRAFT_ROWS'
        && out.gap_scope_universe.population === 'INVENTORY_GAP_SCOPES');
    L.P('the_draft_column_authority_is_available_in_this_deployment', true,
      part.column_authority_available, part.column_authority_available === true);
    // AN UNKNOWN LIVE COLUMN IS A STOP. It is either a half-applied migration or something writing to a
    // table this manifest is about to declare frozen; either way the freeze would not cover it.
    L.P('no_unexpected_column_exists_on_the_draft_header_table', [],
      part.header_table.unexpected_columns, (part.header_table.unexpected_columns || []).length === 0);
    L.P('no_unexpected_column_exists_on_the_draft_line_table', [],
      part.line_table.unexpected_columns, (part.line_table.unexpected_columns || []).length === 0);
    // EVERY LIVE COLUMN IS IN THE FINGERPRINT. Asserted on the measurement, not on the intention.
    L.P('no_field_is_excluded_from_the_full_row_fingerprints', [[], []],
      [part.header_table.excluded_fields, part.line_table.excluded_fields],
      (part.header_table.excluded_fields || []).length === 0
        && (part.line_table.excluded_fields || []).length === 0);
    L.P('every_full_row_fingerprint_was_computed_by_the_hash_authority', 'a fingerprint per bucket',
      { target_manual: part.target_manual.combined_fingerprint,
        target_ai: part.target_ai.combined_fingerprint,
        other_scope: part.other_scope.combined_fingerprint },
      part.target_manual.combined_fingerprint !== null
        && part.target_ai.combined_fingerprint !== null
        && part.other_scope.combined_fingerprint !== null);
    L.P('every_draft_header_was_classified_as_manual_or_ai_generated', 0, part.unclassified_headers,
      part.unclassified_headers === 0);
    // TWO READS OF THE MANUAL ROWS MUST NOT DISAGREE. The exposure view (what the quantity arithmetic used)
    // is line-grain and scope-filtered; the full-row view reads the whole table. The full-row view is a
    // superset by construction, so CONTAINMENT is the checkable claim — and a line the arithmetic counted
    // that the freeze does not cover would be a row protected by nothing.
    var fullManualSet = {};
    (part.target_manual.line_ids || []).forEach(function (id) { fullManualSet[S1_str_(id)] = 1; });
    var uncovered = manualLineIds.filter(function (id) {
      return S1_str_(id) !== '' && !fullManualSet[S1_str_(id)];
    });
    L.P('every_manual_line_the_arithmetic_counted_is_covered_by_the_full_row_freeze', [], uncovered,
      uncovered.length === 0);

    // ---- 10c. S1-R4A §A — THE EXACT WRITE SET, FROM THE PRODUCTION AUTHORITIES. ---------------------
    var ws = S1_predictedWriteSet_(dbP.ok ? dbP.ss : null, out.scope,
      out.accepted_run ? out.accepted_run.planning_cycle : null,
      part.active_header_objects, part.existing_line_ids);
    out.predicted_write_set = ws;
    var ids = S1_aiIdentitySets_(part, ws, out.scope,
      out.accepted_run ? out.accepted_run.planning_cycle : null);
    out.ai_identity_sets = ids;

    // THE NAMED REFUSAL §A ASKS FOR. If the production authorities cannot produce the exact write set, this
    // is a STOP with its own code — never an empty array, never the candidate scope standing in for the
    // identities, and never a count of the rows that already exist.
    L.P('the_exact_production_write_set_is_measurable', true, ws.measurable,
      ws.measurable === true);
    if (ws.measurable !== true) {
      out.writeset_stop_code = ws.stop_code || S1_WRITESET_STOP_;
      L.P('the_write_set_measurement_named_no_missing_authority', [], ws.missing_authorities,
        (ws.missing_authorities || []).length === 0);
    }
    L.P('the_predicted_write_set_names_at_least_one_header_and_one_line',
      'header_ids >= 1 and line_ids >= 1',
      { headers: (ws.expected_header_ids || []).length, lines: (ws.expected_line_ids || []).length },
      (ws.expected_header_ids || []).length >= 1 && (ws.expected_line_ids || []).length >= 1);
    L.P('every_predicted_header_carries_a_deterministic_k2_identity',
      'every id non-blank and K2-prefixed', (ws.expected_header_ids || []).slice(0, 20),
      (ws.expected_header_ids || []).length > 0 && (ws.expected_header_ids || []).every(function (id) {
        return S1_str_(id).indexOf('SADH-K2-') === 0;
      }));
    L.P('every_predicted_line_carries_a_deterministic_k2_identity',
      'every id non-blank and K2-prefixed', (ws.expected_line_ids || []).slice(0, 20),
      (ws.expected_line_ids || []).length > 0 && (ws.expected_line_ids || []).every(function (id) {
        return S1_str_(id).indexOf('SADL-K2-') === 0;
      }));
    L.P('every_predicted_route_group_is_classified_as_a_create_or_an_update',
      'CREATE or UPDATE for every group',
      (ws.route_groups || []).map(function (g) { return g.classification; }),
      (ws.route_groups || []).length > 0 && (ws.route_groups || []).every(function (g) {
        return g.classification === 'CREATE' || g.classification === 'UPDATE';
      }));
    L.P('the_create_and_update_counts_account_for_every_predicted_route_group',
      (ws.route_groups || []).length,
      (ws.expected_create_header_count || 0) + (ws.expected_update_header_count || 0),
      (ws.route_groups || []).length
        === (ws.expected_create_header_count || 0) + (ws.expected_update_header_count || 0));
    L.P('the_create_and_update_line_counts_account_for_every_predicted_line',
      (ws.expected_line_ids || []).length,
      (ws.expected_create_line_count || 0) + (ws.expected_update_line_count || 0),
      (ws.expected_line_ids || []).length
        === (ws.expected_create_line_count || 0) + (ws.expected_update_line_count || 0));
    L.P('no_predicted_route_group_collides_with_two_active_drafts', [], ws.conflicts,
      (ws.conflicts || []).length === 0);
    L.P('no_two_predicted_route_groups_mint_the_same_header_id', [], ws.duplicate_header_ids,
      (ws.duplicate_header_ids || []).length === 0);
    L.P('no_line_the_generation_would_write_is_blocked_on_a_route', [],
      (ws.blocked_lines || []).map(function (b) { return b.block; }),
      (ws.blocked_lines || []).length === 0);
    L.P('the_predicted_plan_conserves_the_allocated_quantity', true, ws.conserved,
      ws.conserved === true);
    // THE PREDICTION AND THE ARITHMETIC MUST BE ABOUT THE SAME UNITS. The residual said how much is
    // missing; the write set says how much would be written. If the predicted lines total more than the
    // proposed quantity, one of the two is wrong and neither may be authorized.
    L.P('the_predicted_lines_do_not_exceed_the_proposed_quantity',
      'planned total <= ' + S1_str_(prop), ws.expected_line_planned_total,
      prop !== null && ws.expected_line_planned_total !== null
        && ws.expected_line_planned_total <= prop);
    // THE THREE SETS ARE THREE. An expiration candidate is not a write, and an existing row is not a
    // prediction; asserting they are disjoint in the ways they must be is what keeps the names honest.
    L.P('the_expiration_candidate_set_was_produced_by_the_lifecycle_authority',
      'an array from aiplExpirationCandidates_', ids.ai_expiration_candidates,
      Object.prototype.toString.call(ids.ai_expiration_candidates) === '[object Array]');
    L.P('no_identity_is_both_expired_and_written_by_the_same_run', [],
      (ids.ai_expiration_candidates || []).filter(function (id) {
        return (ws.expected_header_ids || []).indexOf(id) >= 0;
      }),
      (ids.ai_expiration_candidates || []).filter(function (id) {
        return (ws.expected_header_ids || []).indexOf(id) >= 0;
      }).length === 0);
    L.P('no_predicted_write_touches_a_manual_identity', [],
      (ws.expected_header_ids || []).filter(function (id) {
        return (part.target_manual.header_ids || []).indexOf(id) >= 0;
      }),
      (ws.expected_header_ids || []).filter(function (id) {
        return (part.target_manual.header_ids || []).indexOf(id) >= 0;
      }).length === 0);
    L.P('the_post_generation_ai_identity_set_was_derived', 'a derived array',
      ids.expected_post_generation_active_ai_identities,
      Object.prototype.toString.call(ids.expected_post_generation_active_ai_identities) === '[object Array]'
        && ids.expected_post_generation_active_ai_identities.length >= 1);

    // ---- 10d. S1-R4A §B.4 — THE FACTORY WRITE SURFACES. --------------------------------------------
    var surf = S1_factorySurfaces_(dbP.ok ? dbP.ss : null,
      cand ? cand.source_factory_warehouse_id : null, out.scope ? out.scope.sku : null);
    out.factory_surfaces = surf;
    L.P('the_factory_pool_row_was_read_as_a_full_row', 'a row fingerprint',
      surf.pool ? surf.pool.row_fingerprint : null,
      !!surf.pool && surf.pool.pool_row_found === true && surf.pool.row_fingerprint !== null);
    L.P('the_frozen_pool_quantities_match_the_ones_the_arithmetic_used',
      { current: pool ? S1_qty_(pool.factory_current_stock) : null,
        reserved: pool ? S1_qty_(pool.factory_reserved_stock) : null },
      { current: surf.pool ? surf.pool.fac_current_stock : null,
        reserved: surf.pool ? surf.pool.fac_reserved_stock : null },
      !!pool && !!surf.pool
        && S1_qty_(pool.factory_current_stock) === surf.pool.fac_current_stock
        && S1_qty_(pool.factory_reserved_stock) === surf.pool.fac_reserved_stock);
    L.P('every_factory_write_surface_is_either_readable_or_honestly_absent', [], surf.unreadable,
      (surf.unreadable || []).length === 0);
    // ---- S1-R4C §1 - THE IDS ON THOSE SURFACES ARE IDENTITIES, ONE PER ROW, EACH ITS OWN. ----------
    //
    // Five separate conditions rather than one 'ids look fine', because each names a different fault with a
    // different remedy and an operator needs to know which one they have. The row numbers and full-row
    // fingerprints are in the observed value of each condition, so the finding is actionable from the log.
    out.factory_id_fault_codes = (surf.id_faults || []).slice();
    // S1-R4D §1 - THE ROWS, so a fault code becomes a row a person can open. Emitted in fin(), which is the
    // one place every Logger line for this manifest is written.
    out.factory_id_fault_rows = (surf.id_fault_rows || []).slice();
    var idDet = surf.id_fault_detail || {};
    var blankTot = 0, dupTot = 0, wrongTot = 0, strayTot = 0, blankRows = [], dupRows = [],
      wrongRows = [], strayRows = [];
    Object.keys(idDet).forEach(function (tb) {
      var d = idDet[tb];
      blankTot += d.blank_id_count; dupTot += d.duplicate_id_count;
      wrongTot += d.wrong_type_id_count; strayTot += d.outside_named_columns_count;
      (d.blank_id_rows || []).forEach(function (r) {
        blankRows.push({ table: tb, row_number: r.row_number, fingerprint: r.fingerprint }); });
      (d.duplicate_id_rows || []).forEach(function (r) {
        dupRows.push({ table: tb, row_number: r.row_number, id: r.id,
          first_seen_row: r.first_seen_row, fingerprint: r.fingerprint }); });
      (d.wrong_type_id_rows || []).forEach(function (r) {
        wrongRows.push({ table: tb, row_number: r.row_number, id: r.id,
          observed_type: r.observed_type, fingerprint: r.fingerprint }); });
      (d.outside_named_columns_rows || []).forEach(function (r) {
        strayRows.push({ table: tb, row_number: r.row_number, fingerprint: r.fingerprint }); });
    });
    // THE ONE THE LIVE RUN HIT. `factory_stock_movement_id` is Required + PK in the shipment schema and
    // every writer generates FSMV-<8 hex>, so a blank is not a legacy allowance to be honoured - it is a
    // record with no primary key, and the manifest refuses rather than freezing '' as an identity.
    L.P('every_factory_audit_row_carries_a_non_blank_id', 0,
      { blank_id_count: blankTot, rows: blankRows.slice(0, 20) }, blankTot === 0);
    L.P('no_factory_audit_row_id_is_duplicated', 0,
      { duplicate_id_count: dupTot, rows: dupRows.slice(0, 20) }, dupTot === 0);
    // A sheet coerces on read: a numeric-looking id comes back as a number and a date-looking one as a Date.
    // Both print like a string in a log and neither compares like one on the way back.
    L.P('every_factory_audit_row_id_is_a_string_not_a_coerced_number_or_date', 0,
      { wrong_type_id_count: wrongTot, rows: wrongRows.slice(0, 20) }, wrongTot === 0);
    // AND THE READ RANGE ITSELF. A row that is non-blank only in an unlabelled column is not a record of
    // this schema; counting it inflates the row count and contributes a blank id, so it is refused as a
    // range fault under its own name rather than being reported as missing data.
    L.P('no_row_outside_the_named_columns_was_counted_as_a_factory_record', 0,
      { outside_named_columns_count: strayTot, rows: strayRows.slice(0, 20) }, strayTot === 0);
    // AND WHAT GETS FROZEN IS EITHER A COMPLETE IDENTITY LIST OR NOTHING. `ids` is published only when the
    // integrity pass is clean, so the freeze can never carry a list with a blank in it - nor one with the
    // blank silently dropped, which would claim a completeness it does not have.
    var idPublish = S1_factorySurfaceSpecs_().map(function (sp) {
      var sv = surf.surfaces[sp.table] || {};
      var ig = sv.id_integrity || {};
      return { table: sp.table, checked: ig.checked === true, clean: ig.clean === true,
        ids_published: sv.ids !== null && sv.ids !== undefined,
        row_count: sv.row_count, id_count: sv.ids ? sv.ids.length : null };
    });
    L.P('every_published_factory_id_list_is_complete_and_blank_free',
      'ids published only on a clean integrity pass, and then one id per row', idPublish,
      idPublish.every(function (p) {
        if (!p.checked) return p.ids_published === false;
        return p.clean === true && p.ids_published === true && p.id_count === p.row_count;
      }));
    L.P('the_factory_surfaces_reported_no_id_integrity_fault', [], surf.id_faults || [],
      (surf.id_faults || []).length === 0);
    // S1-R4D - A FAULT CODE WITH NO ROW BEHIND IT IS NOT ACTIONABLE. This is the condition the live run
    // could not have failed, because it did not exist: the codes were reported and the rows that produced
    // them were not. Every code claimed must be backed by at least one located row, and every located row
    // must carry the fields that locate it.
    var fr = out.factory_id_fault_rows || [];
    var codesWithRows = {};
    fr.forEach(function (f) { codesWithRows[f.fault_code] = 1; });
    var orphanCodes = (surf.id_faults || []).filter(function (c) { return !codesWithRows[c]; });
    L.P('every_reported_factory_id_fault_code_is_backed_by_a_located_row', [], orphanCodes,
      orphanCodes.length === 0);
    var unlocatable = fr.filter(function (f) {
      return !(typeof f.one_based_sheet_row_number === 'number' && f.one_based_sheet_row_number >= 2)
        || f.full_named_row_fingerprint === null || S1_str_(f.id_column_name) === ''
        || S1_str_(f.recommended_next_action) === '';
    });
    L.P('every_located_fault_row_carries_a_row_number_a_fingerprint_and_a_next_action', [],
      unlocatable.map(function (f) {
        return { row: f.one_based_sheet_row_number, code: f.fault_code,
          fingerprint: f.full_named_row_fingerprint }; }),
      unlocatable.length === 0);

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
      gap_scope_universe_fingerprint: uniFp,
      draft_row_universe_combined_fingerprint: du.combined_fingerprint,
      deployment_build: dep ? dep.deployment_build : null,
      measured_at: out.measured_at,
      // S1-R4A — the prediction and the content freeze are REQUIRED evidence, not extras. A baseline missing
      // any of these cannot refuse the drift it exists to refuse, so an absence here is a STOP.
      expected_header_ids: (ws.expected_header_ids || []).length ? ws.expected_header_ids.join(',') : null,
      expected_line_ids: (ws.expected_line_ids || []).length ? ws.expected_line_ids.join(',') : null,
      expected_k2_group_keys: (ws.expected_k2_group_keys || []).length
        ? ws.expected_k2_group_keys.join(',') : null,
      target_manual_combined_fingerprint: part.target_manual.combined_fingerprint,
      target_ai_combined_fingerprint: part.target_ai.combined_fingerprint,
      other_scope_combined_fingerprint: part.other_scope.combined_fingerprint,
      draft_header_live_column_count: part.header_table.live_column_count,
      draft_line_live_column_count: part.line_table.live_column_count,
      factory_pool_row_fingerprint: surf.pool ? surf.pool.row_fingerprint : null
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
      // S1-R4A — THE THREE SETS, SEPARATELY. `expected_ai_identity_count` used to sit here holding the
      // count of rows that already existed, which is how the wording came to say "across 0 superseded AI
      // identities" about a run whose predicted writes had never been computed.
      existing_active_ai_identity_count: ids.existing_active_ai_identity_count,
      ai_expiration_candidate_count: ids.ai_expiration_candidate_count,
      expected_create_header_count: ws.expected_create_header_count,
      expected_update_header_count: ws.expected_update_header_count,
      expected_create_line_count: ws.expected_create_line_count,
      expected_update_line_count: ws.expected_update_line_count,
      expected_header_ids: ws.expected_header_ids,
      expected_line_ids: ws.expected_line_ids,
      writeset_measurable: ws.measurable, writeset_stage: ws.stage,
      target_manual_combined_fingerprint: part.target_manual.combined_fingerprint,
      target_ai_combined_fingerprint: part.target_ai.combined_fingerprint,
      other_scope_combined_fingerprint: part.other_scope.combined_fingerprint,
      other_scope_header_count: part.other_scope.header_count,
      other_scope_line_count: part.other_scope.line_count,
      factory_stock_movement_count: surf.surfaces['factory_stock_movements']
        ? surf.surfaces['factory_stock_movements'].row_count : null,
      factory_override_audit_count: surf.surfaces['factory_stock_override_audit']
        ? surf.surfaces['factory_stock_override_audit'].row_count : null,
      // S1-R4C - BOTH POPULATIONS, BOTH NAMED. The summary is what a person reads first, so this is
      // where an ambiguous count did the most damage.
      gap_scope_universe_total_count: out.gap_scope_universe.total_scope_count,
      gap_scope_universe_other_count: out.gap_scope_universe.other_scope_count,
      draft_row_universe_total_row_count: du.total_row_count,
      draft_row_universe_header_count: du.header_count,
      draft_row_universe_line_count: du.line_count,
      draft_row_universe_target_row_count: du.target_row_count,
      draft_row_universe_other_scope_row_count: du.other_scope_row_count,
      factory_stock_movement_ok_id_count: (surf.surfaces['factory_stock_movements']
        && surf.surfaces['factory_stock_movements'].id_integrity)
        ? surf.surfaces['factory_stock_movements'].id_integrity.ok_count : null,
      factory_id_fault_codes: out.factory_id_fault_codes,
      reservation_observation_state: out.reservation_observation.observation_state,
      reservation_row_count: out.reservation_observation.row_count,
      evidence_gaps: gaps.length,
      predicates_failed_so_far: L.failed.length };

    // ---- 15. THE EXPECTED WRITE, IN NUMBERS A READBACK CAN DISAGREE WITH. ----------------------------
    out.expected_outcome.expected_max_units_written = prop;
    out.expected_outcome.expected_clamp = cand ? cand.would_clamp : null;
    out.expected_outcome.expected_superseded_ai_identities = ids.ai_expiration_candidate_count;
    out.expected_outcome.expected_manual_identities_unchanged = (manualRows || []).length;
    // S1-R4C - TWO EXPECTATIONS, because there are two populations and a Generate moves only one of them.
    // The gap scope count is unchanged by a generation; the draft row count grows by exactly the rows the
    // prediction says would be CREATED. Stated as arithmetic so a readback can disagree with it.
    out.expected_outcome.expected_gap_scope_universe_count_after = uniKeys.length;
    out.expected_outcome.expected_draft_row_universe_total_after = du.total_row_count
      + ws.expected_create_header_count + ws.expected_create_line_count;
    out.expected_outcome.expected_draft_row_universe_derivation = 'before total ' + du.total_row_count
      + ' + created headers ' + ws.expected_create_header_count
      + ' + created lines ' + ws.expected_create_line_count
      + '. Updates change content, not row count, so they are deliberately not added here.';
    out.expected_outcome.expected_reservation_row_count_after = out.reservation_observation.row_count;
    // S1-R4A — the numbers a readback counts rows against, stated as CREATE and UPDATE rather than as one
    // total. A run that updates one header and a run that creates one are the same delta and not the same
    // event, and only one of them is what was authorized.
    out.expected_outcome.expected_created_headers = ws.expected_create_header_count;
    out.expected_outcome.expected_updated_headers = ws.expected_update_header_count;
    out.expected_outcome.expected_created_lines = ws.expected_create_line_count;
    out.expected_outcome.expected_updated_lines = ws.expected_update_line_count;
    out.expected_outcome.expected_header_ids = ws.expected_header_ids;
    out.expected_outcome.expected_line_ids = ws.expected_line_ids;
    out.expected_outcome.expected_k2_group_keys = ws.expected_k2_group_keys;
    out.expected_outcome.expected_expired_ai_identities = ids.ai_expiration_candidates;
    out.expected_outcome.expected_post_generation_active_ai_identities =
      ids.expected_post_generation_active_ai_identities;
    out.expected_outcome.expected_manual_rows_full_row_identical = true;
    out.expected_outcome.expected_other_scope_rows_full_row_identical = true;
    out.expected_outcome.expected_factory_movement_count_after = surf.surfaces['factory_stock_movements']
      ? surf.surfaces['factory_stock_movements'].row_count : null;
    out.expected_outcome.expected_factory_override_audit_count_after =
      surf.surfaces['factory_stock_override_audit']
        ? surf.surfaces['factory_stock_override_audit'].row_count : null;

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
        // ---- S1-R4A §A — THE EXACT WRITE SET. What this run predicts a Generate would create or update. ----
        writeset_measurable: ws.measurable, writeset_stage: ws.stage,
        expected_header_ids: (ws.expected_header_ids || []).slice().sort(),
        expected_line_ids: (ws.expected_line_ids || []).slice().sort(),
        expected_k2_group_keys: (ws.expected_k2_group_keys || []).slice().sort(),
        expected_create_header_count: ws.expected_create_header_count,
        expected_update_header_count: ws.expected_update_header_count,
        expected_create_line_count: ws.expected_create_line_count,
        expected_update_line_count: ws.expected_update_line_count,
        // ---- the other two AI sets, which are NOT the write set ----
        existing_active_ai_identities: ids.existing_active_ai_identities,
        existing_active_ai_identity_count: ids.existing_active_ai_identity_count,
        ai_expiration_candidates: ids.ai_expiration_candidates,
        ai_expiration_candidate_count: ids.ai_expiration_candidate_count,
        expected_post_generation_active_ai_identities:
          ids.expected_post_generation_active_ai_identities,
        // ---- S1-R4A §B — FULL-ROW CONTENT. id~fingerprint per row, sorted, plus a combined fingerprint. ----
        target_manual_header_ids: part.target_manual.header_ids,
        target_manual_line_ids: part.target_manual.line_ids,
        target_manual_planned_total: part.target_manual.planned_total,
        target_manual_row_signatures: part.target_manual.header_sigs
          .concat(part.target_manual.line_sigs),
        target_manual_combined_fingerprint: part.target_manual.combined_fingerprint,
        target_ai_row_signatures: part.target_ai.header_sigs.concat(part.target_ai.line_sigs),
        target_ai_combined_fingerprint: part.target_ai.combined_fingerprint,
        other_scope_header_count: part.other_scope.header_count,
        other_scope_line_count: part.other_scope.line_count,
        other_scope_row_signatures: part.other_scope.header_sigs.concat(part.other_scope.line_sigs),
        other_scope_combined_fingerprint: part.other_scope.combined_fingerprint,
        draft_header_live_column_count: part.header_table.live_column_count,
        draft_line_live_column_count: part.line_table.live_column_count,
        draft_header_excluded_fields: part.header_table.excluded_fields,
        draft_line_excluded_fields: part.line_table.excluded_fields,
        // ---- S1-R4A §B.4 — the factory write surfaces ----
        factory_pool_row_fingerprint: surf.pool ? surf.pool.row_fingerprint : null,
        factory_stock_movement_state: surf.surfaces['factory_stock_movements']
          ? surf.surfaces['factory_stock_movements'].observation_state : null,
        factory_stock_movement_count: surf.surfaces['factory_stock_movements']
          ? surf.surfaces['factory_stock_movements'].row_count : null,
        factory_stock_movement_ids: surf.surfaces['factory_stock_movements']
          ? surf.surfaces['factory_stock_movements'].ids : null,
        factory_stock_movement_fingerprint: surf.surfaces['factory_stock_movements']
          ? surf.surfaces['factory_stock_movements'].combined_fingerprint : null,
        factory_override_audit_state: surf.surfaces['factory_stock_override_audit']
          ? surf.surfaces['factory_stock_override_audit'].observation_state : null,
        factory_override_audit_count: surf.surfaces['factory_stock_override_audit']
          ? surf.surfaces['factory_stock_override_audit'].row_count : null,
        factory_override_audit_ids: surf.surfaces['factory_stock_override_audit']
          ? surf.surfaces['factory_stock_override_audit'].ids : null,
        factory_override_audit_fingerprint: surf.surfaces['factory_stock_override_audit']
          ? surf.surfaces['factory_stock_override_audit'].combined_fingerprint : null,
        // ---- S1-R4C §1 - the id integrity of each surface as a before-value ----
        factory_stock_movement_ok_id_count: (surf.surfaces['factory_stock_movements']
          && surf.surfaces['factory_stock_movements'].id_integrity)
          ? surf.surfaces['factory_stock_movements'].id_integrity.ok_count : null,
        factory_stock_movement_id_faults: (surf.surfaces['factory_stock_movements']
          && surf.surfaces['factory_stock_movements'].id_integrity)
          ? surf.surfaces['factory_stock_movements'].id_integrity.faults : null,
        factory_override_audit_ok_id_count: (surf.surfaces['factory_stock_override_audit']
          && surf.surfaces['factory_stock_override_audit'].id_integrity)
          ? surf.surfaces['factory_stock_override_audit'].id_integrity.ok_count : null,
        factory_override_audit_id_faults: (surf.surfaces['factory_stock_override_audit']
          && surf.surfaces['factory_stock_override_audit'].id_integrity)
          ? surf.surfaces['factory_stock_override_audit'].id_integrity.faults : null,
        // ---- S1-R4C §2A - THE GAP SCOPE UNIVERSE, under a name that says what it counts. ----
        gap_scope_universe_population: out.gap_scope_universe.population,
        gap_scope_universe_total_count: out.gap_scope_universe.total_scope_count,
        gap_scope_universe_target_count: out.gap_scope_universe.target_scope_count,
        gap_scope_universe_other_count: out.gap_scope_universe.other_scope_count,
        gap_scope_universe_fingerprint: out.gap_scope_universe.scope_fingerprint,
        // ---- S1-R4C §2B - AND THE DRAFT ROW UNIVERSE, which is a different population. ----
        draft_row_universe_population: du.population,
        draft_row_universe_header_count: du.header_count,
        draft_row_universe_line_count: du.line_count,
        draft_row_universe_total_row_count: du.total_row_count,
        draft_row_universe_target_manual_header_count: du.target_manual_header_count,
        draft_row_universe_target_manual_line_count: du.target_manual_line_count,
        draft_row_universe_target_ai_header_count: du.target_ai_header_count,
        draft_row_universe_target_ai_line_count: du.target_ai_line_count,
        draft_row_universe_target_row_count: du.target_row_count,
        draft_row_universe_other_scope_row_count: du.other_scope_row_count,
        draft_row_universe_row_signature_count: du.row_signature_count,
        draft_row_universe_combined_fingerprint: du.combined_fingerprint,
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
      // S1-R4A — AND WHAT IT CARRIES MUST BE WHAT WAS MEASURED.
      //
      // Presence is not agreement. The declared-field check above passes on a baseline whose
      // `expected_header_ids` is an empty array, because [] is present — so a freeze could be built from the
      // EXISTING rows (the exact R4 defect) or from nothing at all and still satisfy every other condition.
      // Caught by a mutant that fed the freeze `ids.existing_active_ai_identities` and survived every check.
      //
      // A baseline that disagrees with the measurement is worse than no baseline: it is a wrong before-value
      // that a readback will compare against and pass.
      var fzHdr = (freeze.expected_header_ids || []).slice().sort().join(',');
      var fzLine = (freeze.expected_line_ids || []).slice().sort().join(',');
      var wsHdr = (ws.expected_header_ids || []).slice().sort().join(',');
      var wsLine = (ws.expected_line_ids || []).slice().sort().join(',');
      L.P('the_frozen_write_set_is_the_one_that_was_measured',
        { header_ids: wsHdr, line_ids: wsLine, creates: [ws.expected_create_header_count,
          ws.expected_create_line_count], updates: [ws.expected_update_header_count,
          ws.expected_update_line_count] },
        { header_ids: fzHdr, line_ids: fzLine, creates: [freeze.expected_create_header_count,
          freeze.expected_create_line_count], updates: [freeze.expected_update_header_count,
          freeze.expected_update_line_count] },
        fzHdr === wsHdr && fzLine === wsLine
          && freeze.expected_create_header_count === ws.expected_create_header_count
          && freeze.expected_create_line_count === ws.expected_create_line_count
          && freeze.expected_update_header_count === ws.expected_update_header_count
          && freeze.expected_update_line_count === ws.expected_update_line_count);
      // AND IT MUST NAME AT LEAST ONE IDENTITY. An empty write set reaching the freeze means either the
      // prediction found nothing (already refused above) or something dropped it on the way here.
      L.P('the_frozen_baseline_names_at_least_one_identity_to_be_written',
        'a non-empty header id list and line id list',
        [(freeze.expected_header_ids || []).length, (freeze.expected_line_ids || []).length],
        (freeze.expected_header_ids || []).length >= 1 && (freeze.expected_line_ids || []).length >= 1);
      // The full-row fingerprints have to be real hashes too: a null one is a bucket the readback cannot
      // compare, and three nulls would make "nothing else changed" unfalsifiable.
      L.P('every_frozen_content_fingerprint_is_a_real_hash',
        'a fingerprint for each of the three buckets',
        [freeze.target_manual_combined_fingerprint, freeze.target_ai_combined_fingerprint,
          freeze.other_scope_combined_fingerprint],
        freeze.target_manual_combined_fingerprint !== null
          && freeze.target_ai_combined_fingerprint !== null
          && freeze.other_scope_combined_fingerprint !== null);
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

    // S1-R5 — THE DESTINATION HAS TWO LEGAL STAGES, AND 'EMPTY' WAS ONLY THE FIRST ONE.
    //
    // This asked for null, which was right for exactly as long as nothing had been frozen. The moment a
    // person pasted the baseline the run told them to paste, the predicate began refusing the state it
    // had just asked for — and a gate that fails on success teaches an operator to ignore it.
    //
    // WHAT IT WAS ACTUALLY PROTECTING is unchanged and is still enforced: freezing over a baseline
    // measured against a DIFFERENT world would silently replace the one that was signed. So the stages
    // are named, and only the third is a STOP:
    //
    //   EMPTY   — nothing frozen yet. This run's block is the one to paste.
    //   FROZEN  — already holds a baseline of THIS SAME measurement. Not an overwrite; re-running the
    //             manifest against an unchanged world is a re-measurement, and it agrees.
    //   CONFLICT— holds a baseline of a DIFFERENT measurement. STOP, exactly as before.
    //
    // Sameness is `S1_freezeIdentity_`, which excludes `frozen_at` — a clock reading is not a world.
    // Everything else it compares (build, scope, accepted run, every content fingerprint, the exact
    // identities that may be written) IS the world, so a drifted table cannot pass as the same baseline.
    var destVal = (typeof S1_MANIFEST_P_BEFORE_ === 'undefined') ? undefined : S1_MANIFEST_P_BEFORE_;
    var heldIdentity = S1_freezeIdentity_(destVal);
    var measuredIdentity = S1_freezeIdentity_(out.frozen_before);
    out.baseline_stage = (destVal === undefined) ? 'SYMBOL_MISSING'
      : (destVal === null ? 'EMPTY'
        : (measuredIdentity !== null && heldIdentity !== measuredIdentity ? 'CONFLICT' : 'FROZEN'));
    out.baseline_held_identity = heldIdentity;
    out.baseline_measured_identity = measuredIdentity;
    // A frozen destination must also be free of the removal-era facts R4J's handoff forbids. The
    // handoff publishes that list as prose; here it is executed against the value actually held.
    out.baseline_removal_era_facts = S1_freezeCarriesRemovalEra_(destVal);
    L.P('the_baseline_destination_is_empty_or_holds_this_same_measurement',
      { stage: 'EMPTY or FROZEN', would_overwrite_a_different_baseline: false,
        removal_era_facts: [] },
      { stage: out.baseline_stage,
        would_overwrite_a_different_baseline: out.baseline_stage === 'CONFLICT',
        removal_era_facts: out.baseline_removal_era_facts,
        held: heldIdentity, measured: measuredIdentity },
      (out.baseline_stage === 'EMPTY' || out.baseline_stage === 'FROZEN')
        && out.baseline_removal_era_facts.length === 0);
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

/**
 * ================================================================================================================
 * S1-R4D §2 - RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS
 *
 * ONE TABLE, READ ONLY, AND IT ANSWERS EXACTLY ONE QUESTION: which rows of factory_stock_movements do not
 * carry a usable primary key, and where are they.
 *
 * WHY IT IS SEPARATE FROM MANIFEST P. Manifest P refuses on this fault, which is correct - it must not
 * authorize a generation against a table whose identities cannot be trusted - but it also runs the whole
 * candidate census, the write-set prediction and the full-row freeze to get there. An operator who has
 * already been told the fault exists should not have to re-run all of that, on a world that will refuse
 * again, to find out which row it is.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It judges nothing itself: S1_idIntegrity_ decides what a fault is, and
 * S1_fullRowTable_ / S1_canonCell_ / S1_rowFingerprint_ / S1_fingerprint_ are the same read and the same
 * hash authority the manifest and the freeze use. A second implementation would be a second opinion, and
 * the first thing two opinions do is disagree about a row nobody can then classify.
 *
 * AND IT REPAIRS NOTHING. No cell is written, no id is minted, no row is added, removed or reordered, and no
 * Factory Stock writer, migration, Generate, Submit or Gap Job is reached. `recommended_next_action` names
 * the next decision; it does not take it, prepare it or stage it.
 * ================================================================================================================
 */
// ================================================================================================================
// S1-R4E §1 - THE WHOLE COLUMN CONTRACT, NOT ONLY THE PRIMARY KEY.
//
// R4D located the row. This asks whether it can be repaired, and the first thing that requires is knowing
// what every column owes - because a row missing its primary key AND a required business field is not a
// row with one problem.
//
// TWO AUTHORITIES, AND THEY DO NOT AGREE ON SHAPE. That divergence is recorded rather than resolved here:
//
//   SHIPMENT_DATABASE_SCHEMA.md   twelve columns, and it is the only place that says REQUIRED or not.
//                                 It names `factory_name`, `before_qty` and `after_qty`.
//   21_ MOV_HEADERS               fifteen columns, and it is what the live sheet actually has (measured:
//                                 live_column_count 15, header fingerprint FDC8D1DB). It names
//                                 `warehouse_id`, `before_current_stock` / `after_current_stock`, and adds
//                                 `movement_date`, `before_reserved_stock`, `after_reserved_stock`.
//
// So the required-ness comes from the md and the NAMES come from 21_, mapped column by column below. Where
// the md has no opinion (the three 21_-era columns) the contract records `NOT_IN_SCHEMA_DOC` rather than
// inventing a requirement - and separately records that every shipped writer populates it, which is a
// weaker signal and is reported as one.
//
// WHY movement_type IS THE ONE THAT DECIDES EVERYTHING. 21_ §G makes it the LEDGER AXIS SELECTOR: it is what
// says whether this row's `qty` moved current stock or reserved stock. With it blank the row belongs to
// neither axis, which is why factoryStockReconcileReservations_ counts it as `unknown_type_rows` and
// deliberately neither adds nor drops it: 'silently ignoring a row is how a ledger and a balance drift apart
// without anybody being told'.
// ================================================================================================================

var S1_MOV_ID_PREFIX_ = 'FSMV-';

/**
 * One entry per live column, in 21_ MOV_HEADERS order.
 *   required            true only where SHIPMENT_DATABASE_SCHEMA.md says Required = Yes
 *   doc_column          the md's name for it, or null where the md has no entry
 *   every_writer_sets   true where all three 21_ writers populate it (12_/13_/22_ delegate to one of them)
 */
var S1_MOV_FIELD_CONTRACT_ = [
  { column: 'factory_stock_movement_id', required: true, doc_column: 'factory_stock_movement_id',
    doc_note: 'Yes | PK', every_writer_sets: true, role: 'PRIMARY_KEY' },
  { column: 'movement_date', required: false, doc_column: null,
    doc_note: 'NOT_IN_SCHEMA_DOC - a 21_-era column', every_writer_sets: true, role: 'WHEN' },
  { column: 'sku', required: true, doc_column: 'sku', doc_note: 'Yes',
    every_writer_sets: true, role: 'WHAT' },
  { column: 'warehouse_id', required: true, doc_column: 'factory_name',
    doc_note: 'Yes - the doc names the factory, 21_ names the warehouse; same requirement, live name',
    every_writer_sets: true, role: 'WHERE' },
  { column: 'movement_type', required: true, doc_column: 'movement_type',
    doc_note: 'Yes | enum', every_writer_sets: true, role: 'LEDGER_AXIS_SELECTOR',
    enum_authority: '21_ FSTX_MOVEMENT_TYPES_ (the canonical seven)' },
  { column: 'qty', required: true, doc_column: 'qty', doc_note: 'Yes',
    every_writer_sets: true, role: 'HOW_MUCH' },
  { column: 'related_entity_type', required: false, doc_column: 'related_entity_type',
    doc_note: 'optional | enum', every_writer_sets: true, role: 'LINEAGE' },
  { column: 'related_entity_id', required: false, doc_column: 'related_entity_id',
    doc_note: 'optional', every_writer_sets: true, role: 'LINEAGE' },
  { column: 'before_current_stock', required: false, doc_column: 'before_qty',
    doc_note: 'optional', every_writer_sets: true, role: 'CURRENT_AUDIT' },
  { column: 'after_current_stock', required: false, doc_column: 'after_qty',
    doc_note: 'optional', every_writer_sets: true, role: 'CURRENT_AUDIT' },
  { column: 'before_reserved_stock', required: false, doc_column: null,
    doc_note: 'NOT_IN_SCHEMA_DOC - a 21_-era column', every_writer_sets: true,
    role: 'RESERVED_AUDIT' },
  { column: 'after_reserved_stock', required: false, doc_column: null,
    doc_note: 'NOT_IN_SCHEMA_DOC - a 21_-era column', every_writer_sets: true,
    role: 'RESERVED_AUDIT' },
  { column: 'note', required: false, doc_column: 'note', doc_note: 'optional',
    every_writer_sets: true, role: 'FREE_TEXT' },
  { column: 'created_by', required: false, doc_column: 'created_by', doc_note: 'optional',
    every_writer_sets: true, role: 'WHO' },
  { column: 'created_at', required: true, doc_column: 'created_at', doc_note: 'Yes | datetime',
    every_writer_sets: true, role: 'WHEN' }
];

/** Which contract columns this row has, which required ones it is missing, and which writer-populated ones.
 *  The id column is judged like any other: it is required, and it is one of several. */
function S1_movFieldAudit_(rec, liveColumns) {
  var o = { contract_column_count: S1_MOV_FIELD_CONTRACT_.length,
    columns_absent_from_the_live_header: [], present: [], blank: [],
    required_present: [], required_blank: [],
    writer_populated_blank: [], optional_blank: [] };
  S1_MOV_FIELD_CONTRACT_.forEach(function (f) {
    if ((liveColumns || []).indexOf(f.column) === -1) {
      o.columns_absent_from_the_live_header.push(f.column);
      return;                                    // a column the sheet does not have is a schema question
    }
    var raw = S1_cellOf_(rec, f.column);
    var filled = S1_canonCell_(raw) !== '~';
    (filled ? o.present : o.blank).push(f.column);
    if (f.required) { (filled ? o.required_present : o.required_blank).push(f.column); }
    else if (!filled) {
      o.optional_blank.push(f.column);
      if (f.every_writer_sets) o.writer_populated_blank.push(f.column);
    }
  });
  o.present_count = o.present.length;
  o.blank_count = o.blank.length;
  return o;
}

/**
 * WHICH AXIS DID THIS ROW MOVE, AND DO ITS OWN NUMBERS AGREE?
 *
 * Every writer sets `qty` to the delta of the axis its movement_type names: factoryStockApplyDeltaTx_ writes
 * `afterCurrent = beforeCurrent + delta` with `movementQty = delta`, and factoryImportMovObj_ writes
 * `qty: afterCurrent - beforeCurrent` outright. So for a current-axis row `qty === after - before` is the
 * ledger's own invariant, and for a reserved-axis row the same holds on the reserved pair.
 *
 * With movement_type blank NEITHER reading can be evaluated, and that is the finding rather than a gap: the
 * row cannot be checked against the invariant it was written under, because nothing says which one that was.
 * Both readings are computed anyway and reported as evidence, so a person can see what each would imply.
 */
function S1_movAxisAudit_(rec) {
  var t = S1_str_(S1_cellOf_(rec, 'movement_type'));
  var o = { movement_type: t, movement_type_is_blank: t === '',
    vocabulary_authority: '21_ FSTX_MOVEMENT_TYPES_ / factoryStockIsKnownMovementType_',
    is_known_type: null, vocabulary_authority_available: null,
    axis: 'UNKNOWN', invariant: null, invariant_holds: null,
    qty: S1_qty_(S1_cellOf_(rec, 'qty')),
    before_current: S1_qty_(S1_cellOf_(rec, 'before_current_stock')),
    after_current: S1_qty_(S1_cellOf_(rec, 'after_current_stock')),
    before_reserved: S1_qty_(S1_cellOf_(rec, 'before_reserved_stock')),
    after_reserved: S1_qty_(S1_cellOf_(rec, 'after_reserved_stock')),
    readings: {} };
  // Both readings, always, so the evidence does not depend on which axis turns out to be the right one.
  o.readings.if_current_axis = (o.after_current === null || o.before_current === null) ? null
    : { expected_qty: o.after_current - o.before_current, observed_qty: o.qty,
        agrees: o.qty !== null && o.qty === o.after_current - o.before_current };
  o.readings.if_reserved_axis = (o.after_reserved === null || o.before_reserved === null) ? null
    : { expected_qty: o.after_reserved - o.before_reserved, observed_qty: o.qty,
        agrees: o.qty !== null && o.qty === o.after_reserved - o.before_reserved };
  // AN ABSENT AUTHORITY IS NOT AN INVALID VALUE, and the first version of this conflated them: with 21_ not
  // loaded, `manual_adjustment` - a member of the canonical seven - was reported as 'not in the vocabulary'.
  // Measured on a world where the vocabulary was simply not present. Both still refuse, because a row whose
  // type cannot be checked must not be classified as repairable; what changes is that the operator is told
  // which of the two it is, and only one of them is a data problem.
  o.vocabulary_authority_available = typeof factoryStockIsKnownMovementType_ === 'function';
  if (o.vocabulary_authority_available) {
    try { o.is_known_type = factoryStockIsKnownMovementType_(t) === true; } catch (e) { o.is_known_type = null; }
  }
  if (t === '') { o.axis = 'UNKNOWN_BECAUSE_MOVEMENT_TYPE_IS_BLANK'; return o; }
  if (!o.vocabulary_authority_available) {
    o.axis = 'UNCHECKABLE_BECAUSE_THE_VOCABULARY_AUTHORITY_IS_ABSENT';
    return o;
  }
  if (o.is_known_type !== true) { o.axis = 'UNKNOWN_BECAUSE_MOVEMENT_TYPE_IS_NOT_IN_THE_VOCABULARY'; return o; }
  if (typeof factoryStockIsCurrentMovement_ === 'function'
      && factoryStockIsCurrentMovement_(t) === true) {
    o.axis = 'CURRENT';
    o.invariant = 'qty === after_current_stock - before_current_stock';
    o.invariant_holds = !!(o.readings.if_current_axis && o.readings.if_current_axis.agrees);
    return o;
  }
  if (typeof factoryStockIsReservationMovement_ === 'function'
      && factoryStockIsReservationMovement_(t) === true) {
    o.axis = 'RESERVED';
    o.invariant = 'qty === after_reserved_stock - before_reserved_stock';
    o.invariant_holds = !!(o.readings.if_reserved_axis && o.readings.if_reserved_axis.agrees);
    return o;
  }
  // shipment_receipt moves neither factory axis (21_ §G lists it so the set reads closed).
  o.axis = 'NEITHER_FACTORY_AXIS';
  o.invariant = 'none - this type moves no factory quantity';
  o.invariant_holds = true;
  return o;
}

var S1_MOV_CLASS_ID_ONLY_ = 'ID_ONLY_MISSING';
var S1_MOV_CLASS_UNRESOLVED_ = 'LEGACY_ROW_CLASSIFICATION_REQUIRED';

/**
 * CAN THIS ROW BE REPAIRED BY WRITING ONE CELL?
 *
 * Only when the primary key is the ONLY thing wrong. That is a conjunction of separately checkable facts,
 * each of which is named when it fails - because 'this needs a human' is not a finding and 'movement_type is
 * blank, so the row has no ledger axis' is.
 *
 * There is no permissive default anywhere in here. An unmeasurable input classifies as UNRESOLVED, never as
 * repairable, for the same reason an absent table's row count stays null.
 */
function S1_movClassifyRow_(rec, liveColumns) {
  var o = { classification: S1_MOV_CLASS_UNRESOLVED_, id_only: false, reasons: [],
    field_audit: null, axis_audit: null,
    repairable_by_writing_one_cell: false,
    classification_authority: 'SHIPMENT_DATABASE_SCHEMA.md required-ness + 21_ MOV_HEADERS names +'
      + ' 21_ FSTX_MOVEMENT_TYPES_ vocabulary + the ledger invariant every writer writes under' };
  if (!rec) { o.reasons.push('ROW_NOT_READABLE'); return o; }
  var fa = S1_movFieldAudit_(rec, liveColumns);
  var aa = S1_movAxisAudit_(rec);
  o.field_audit = fa;
  o.axis_audit = aa;

  if (fa.columns_absent_from_the_live_header.length) {
    o.reasons.push('LIVE_HEADER_IS_MISSING_CONTRACT_COLUMNS:'
      + fa.columns_absent_from_the_live_header.join(','));
  }
  // THE PRIMARY KEY MUST BE THE MISSING THING. If it is present this is not a backfill at all.
  if (fa.required_blank.indexOf('factory_stock_movement_id') === -1) {
    o.reasons.push('THE_PRIMARY_KEY_IS_NOT_BLANK_SO_THERE_IS_NOTHING_TO_BACKFILL');
  }
  // AND IT MUST BE THE ONLY MISSING REQUIRED FIELD.
  fa.required_blank.forEach(function (c) {
    if (c !== 'factory_stock_movement_id') o.reasons.push('REQUIRED_FIELD_IS_BLANK:' + c);
  });
  // movement_type gets its own named reason even though the line above already covers it, because it is not
  // one required field among several: it is what decides which axis the row's qty moved, and a row without
  // it cannot be reconciled against any invariant at all.
  if (aa.movement_type_is_blank) {
    o.reasons.push('MOVEMENT_TYPE_IS_BLANK_SO_THE_ROW_HAS_NO_LEDGER_AXIS');
  } else if (aa.vocabulary_authority_available !== true) {
    // Not a data fault. This deployment cannot answer the question, which is its own finding and has its
    // own remedy - and reporting it as a bad value would send a person to fix a row that is fine.
    o.reasons.push('MOVEMENT_TYPE_VOCABULARY_AUTHORITY_IS_UNAVAILABLE_IN_THIS_DEPLOYMENT');
  } else if (aa.is_known_type !== true) {
    o.reasons.push('MOVEMENT_TYPE_IS_NOT_IN_THE_CANONICAL_VOCABULARY:' + aa.movement_type);
  } else if (aa.invariant_holds !== true) {
    o.reasons.push('QTY_DOES_NOT_RECONCILE_WITH_THE_BEFORE_AFTER_PAIR_ON_THE_'
      + aa.axis + '_AXIS');
  }
  // The 21_-era columns are not required by the doc, so a blank one is NOT on its own a refusal - but every
  // shipped writer populates them, so a row missing them was not written by any current writer. Reported,
  // and it is what makes the classification a legacy question rather than a formatting one.
  if (fa.writer_populated_blank.length) {
    o.reasons.push('FIELDS_EVERY_SHIPPED_WRITER_POPULATES_ARE_BLANK:'
      + fa.writer_populated_blank.join(','));
  }
  o.id_only = o.reasons.length === 0;
  o.classification = o.id_only ? S1_MOV_CLASS_ID_ONLY_ : S1_MOV_CLASS_UNRESOLVED_;
  o.repairable_by_writing_one_cell = o.id_only;
  return o;
}

/**
 * THE PROPOSED PRIMARY KEY, AND WHY IT IS NOT MINTED THE WAY A NEW ROW'S IS.
 *
 * 21_ mints `'FSMV-' + Utilities.getUuid().replace(/-/g,'').substring(0,8)` in all three of its writers, and
 * randomness is correct there: a NEW row has no prior identity, and nothing can retry into the same row.
 *
 * A BACKFILL CAN BE RETRIED, and a random id would mint a second one on the second attempt - two ids for one
 * row, which is the one thing a primary key repair must never do. So this derives the id from the row it is
 * repairing, through the same hash authority the rest of this file and 71_ already use: 71_ mints its
 * override-audit id as `'FSOA-' + KMFSG.fnv1a(<natural key>).toUpperCase()`, so a deterministic id from a
 * natural key is a shipped pattern in this very area rather than a local invention.
 *
 * THE FORMAT IS 21_'s, EXACTLY. fnv1a returns ('00000000' + h.toString(16)).slice(-8) - always eight hex
 * characters, zero-padded - so `FSMV-` + that is byte-identical in shape to what 21_ produces.
 *
 * The natural key includes the row's full-row fingerprint, which binds the proposal to the exact row state
 * that was measured. If any cell changes, the proposal changes AND the frozen fingerprint stops matching, so
 * a drifted row cannot be repaired with an id authorized for a different state of it.
 */
function S1_movProposedId_(table, rowNumber, rowFingerprint) {
  var natural = 'FSMV|' + S1_str_(table) + '|row=' + S1_str_(rowNumber)
    + '|fp=' + S1_str_(rowFingerprint);
  var o = { proposed_id: null, natural_key: natural,
    format: S1_MOV_ID_PREFIX_ + '<8 uppercase hex>',
    format_authority: '21_ MOV writers: FSMV- + 8 hex',
    derivation_authority: 'KMFSG.fnv1a over the natural key - the same authority 71_ uses for FSOA- ids,'
      + ' chosen over Utilities.getUuid because a backfill must be retry-stable',
    deterministic: true, hash_available: false };
  if (typeof KMFSG === 'undefined' || !KMFSG || typeof KMFSG.fnv1a !== 'function') {
    o.derivation_authority = 'UNAVAILABLE - KMFSG.fnv1a is not present in this deployment';
    return o;
  }
  o.hash_available = true;
  var hex = String(KMFSG.fnv1a(natural)).toUpperCase();
  o.hex = hex;
  o.proposed_id = S1_MOV_ID_PREFIX_ + hex;
  return o;
}

/** The shape a proposed id must have, checked rather than assumed. */
function S1_movIdWellFormed_(id) {
  return /^FSMV-[0-9A-F]{8}$/.test(S1_str_(id));
}

function RUN_S1_FACTORY_MOVEMENT_ID_INTEGRITY_CENSUS() {
  var out = {
    census: 'S1 FACTORY MOVEMENT ID INTEGRITY - one table, read-only, no repair',
    build: S1_BUILD_, dry_run: true, read_only: true,
    // Every one of these is a claim this function makes about itself, declared so a caller can check it
    // rather than infer it from the absence of evidence.
    writes: 0, writer_calls: 0, writer_constructed: false, submit_calls: 0,
    rows_modified: 0, rows_added: 0, rows_removed: 0, rows_reordered: false,
    ids_minted: 0, ids_backfilled: 0, cells_written: 0,
    generate_called: false, submit_called: false, migration_called: false, gap_job_called: false,
    factory_writer_called: false,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    present: null, readable: null,
    id_column: null, id_column_resolved: null, id_authority: null,
    authoritative_id_contract: S1_FACTORY_ID_AUTHORITY_[S1_FACTORY_MOVEMENT_TABLE_] || null,
    read_authority: 'S1_fullRowTable_ + S1_idIntegrity_ - the same read and the same judgement Manifest P'
      + ' uses, so the two cannot disagree about a row',
    hash_authority: 'S1_canonCell_ / S1_rowFingerprint_ / S1_fingerprint_ - the same hashes the BEFORE'
      + ' baseline freezes, so a fingerprint here is matchable against a frozen one',
    live_column_count: null, named_column_count: null, live_columns: [],
    header_fingerprint: null, table_combined_fingerprint: null,
    // S1-R4C's `ok_count` means 'the id cell was not blank', which INCLUDES a duplicate and a
    // wrong-typed one. Calling that number `valid` would be the same class of mistake this file keeps
    // finding: a name answering a different question than it asks. So both are reported, and `valid`
    // means what the word means - present, a string, and unique.
    row_count: null, non_blank_id_count: null, valid_id_count: null,
    blank_id_count: null, duplicate_id_count: null, wrong_type_id_count: null,
    outside_named_column_row_count: null,
    count_derivations: null,
    faults: [], fault_codes: [], fault_count: null, counts_by_class: {},
    recommended_next_actions: [], fault_lines_emitted: 0,
    verdict: 'STOP', stop_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [],
    row_counting_rule: 'a fully blank sheet row is not a record: it is skipped, it is not counted in'
      + ' row_count and it is not a fault',
    scope_rule: 'ONLY ' + S1_FACTORY_MOVEMENT_TABLE_ + ' is read. The clean rows are never printed: the log'
      + ' carries a summary plus one line per fault and nothing else.',
    verdict_meanings: { CLEAN: 'every row carries a unique, non-blank, string primary key',
      FAULTS_FOUND: 'the table was fully readable and at least one row does not',
      STOP: 'the headers, the id authority or the hash authority could not be read, so no judgement about'
        + ' the rows is possible - which is not the same as finding them clean' } };
  var L = S1_ledger_();
  function stop(r) { if (out.stop_reasons.indexOf(r) === -1) out.stop_reasons.push(r); }

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    // THE VERDICT IS DECIDED HERE AND NOWHERE ELSE. STOP wins: 'I could not look' must never be reported
    // as 'I looked and it was clean', which is the same rule that keeps an absent table's row_count null.
    out.verdict = (out.stop_reasons.length || L.failed.length) ? 'STOP'
      : ((out.faults || []).length ? 'FAULTS_FOUND' : 'CLEAN');
    out.fault_count = (out.faults || []).length;
    out.fault_codes = (function () {
      var c = [];
      (out.faults || []).forEach(function (f) {
        if (c.indexOf(f.fault_code) === -1) c.push(f.fault_code); });
      return c;
    })();
    out.counts_by_class = (function () {
      var c = {};
      (out.faults || []).forEach(function (f) { c[f.fault_class] = (c[f.fault_class] || 0) + 1; });
      return c;
    })();
    out.recommended_next_actions = (function () {
      var a = [];
      (out.faults || []).forEach(function (f) {
        if (a.indexOf(f.recommended_next_action) === -1) a.push(f.recommended_next_action); });
      return a;
    })();
    // ---- the summary. Bounded, and it never carries the clean rows. ----
    S1_log_('s1_factory_movement_id_census_summary', JSON.stringify({
      build: out.build, table: out.table, sheet_name: out.sheet_name,
      dry_run: out.dry_run, writes: out.writes, writer_calls: out.writer_calls,
      present: out.present, readable: out.readable,
      id_column: out.id_column, id_column_resolved: out.id_column_resolved,
      live_column_count: out.live_column_count, named_column_count: out.named_column_count,
      live_columns: (out.live_columns || []).slice(0, 40),
      live_columns_shown: Math.min((out.live_columns || []).length, 40),
      header_fingerprint: out.header_fingerprint,
      table_combined_fingerprint: out.table_combined_fingerprint,
      row_count: out.row_count, non_blank_id_count: out.non_blank_id_count,
      valid_id_count: out.valid_id_count,
      blank_id_count: out.blank_id_count, duplicate_id_count: out.duplicate_id_count,
      wrong_type_id_count: out.wrong_type_id_count,
      outside_named_column_row_count: out.outside_named_column_row_count,
      row_counting_rule: out.row_counting_rule }));
    // ---- the fault rows. One line each, in sheet order, bounded and never truncated. ----
    if ((out.faults || []).length) {
      out.fault_lines_emitted = S1_emitFaultRows_('s1_factory_movement_id_fault', out.faults);
    }
    S1_log_('s1_factory_movement_id_fault_meta', JSON.stringify({
      fault_count: out.fault_count, lines_emitted: out.fault_lines_emitted,
      lines_withheld: Math.max(0, out.fault_count - out.fault_lines_emitted),
      max_lines: S1_LOG_MAX_CHUNKS_,
      fault_codes: out.fault_codes, counts_by_class: out.counts_by_class,
      rows: (out.faults || []).slice(0, 40).map(function (f) {
        return f.one_based_sheet_row_number; }),
      recommended_next_actions: out.recommended_next_actions,
      note: 'Row numbers are 1-based sheet rows and can be opened directly. Nothing was changed, added,'
        + ' removed, reordered or minted by this run.' }));
    S1_log_('s1_factory_movement_id_census_verdict', JSON.stringify({
      verdict: out.verdict, fault_count: out.fault_count,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12),
      stop_reasons: out.stop_reasons.slice(0, 12),
      recommended_next_actions: out.recommended_next_actions,
      writes: out.writes, writer_calls: out.writer_calls, ids_minted: out.ids_minted,
      ids_backfilled: out.ids_backfilled,
      note: 'READ-ONLY CENSUS. It locates; it does not repair, and it authorizes no repair.' }));
    return out;
  }

  try {
    // ---- 1. THE ID COLUMN, FROM THE AUTHORITY THE MANIFEST ALSO USES. --------------------------
    var spec = null;
    S1_factorySurfaceSpecs_().forEach(function (sp) {
      if (sp.table === S1_FACTORY_MOVEMENT_TABLE_) spec = sp;
    });
    L.P('the_movement_id_column_authority_is_available', 'a surface spec for '
      + S1_FACTORY_MOVEMENT_TABLE_, spec ? spec.id : null, !!spec && S1_str_(spec.id) !== '');
    if (!spec || S1_str_(spec.id) === '') { stop('ID_COLUMN_AUTHORITY_MISSING'); return fin(); }
    out.id_column = spec.id;
    out.id_authority = spec.id_authority;
    // AND THE CONTRACT THAT MAKES A BLANK A FAULT RATHER THAN A STYLE. Without it there is nothing to
    // refuse against, so its absence is a STOP and not a permissive default.
    L.P('the_authoritative_id_contract_for_this_table_is_declared',
      'required, unique, blank not permitted',
      out.authoritative_id_contract,
      !!out.authoritative_id_contract && out.authoritative_id_contract.required === true
        && out.authoritative_id_contract.unique === true
        && out.authoritative_id_contract.blank_permitted === false);
    if (!out.authoritative_id_contract) { stop('ID_CONTRACT_MISSING'); return fin(); }

    // ---- 2. THE DATABASE, OPENED READ-ONLY THROUGH THE CANONICAL TARGET AUTHORITY. --------------
    var db = S1_openDb_();
    L.P('the_production_database_was_opened_and_asserted_to_be_the_expected_target', true,
      db.ok ? true : (db.reason + (db.detail ? (': ' + S1_cap_(db.detail, 120)) : '')), db.ok === true);
    if (!db.ok) { stop('DB_NOT_OPENED_' + db.reason); return fin(); }

    // ---- 3. THE TABLE, READ AS FULL ROWS. ONE SHEET, NOTHING ELSE. -----------------------------
    var t = S1_fullRowTable_(db.ss, S1_FACTORY_MOVEMENT_TABLE_, null, [spec.id]);
    out.present = t.present;
    out.readable = t.readable;
    out.live_columns = t.live_columns || [];
    out.live_column_count = t.live_column_count;
    out.named_column_count = (t.live_columns || []).filter(function (c) { return c !== ''; }).length;
    out.table_combined_fingerprint = t.readable ? t.combined_fingerprint : null;
    L.P('the_movement_table_exists', true, t.present, t.present === true);
    if (!t.present) { stop('SHEET_ABSENT'); return fin(); }
    L.P('the_movement_table_was_readable', true,
      t.readable === true ? true : ('read failed: ' + S1_cap_(t.error, 120)), t.readable === true);
    if (!t.readable) { stop('SHEET_PRESENT_BUT_UNREADABLE'); return fin(); }

    // ---- 4. THE HEADER ROW AND THE HASH AUTHORITY. A table whose schema cannot be read cannot be
    //         judged clean, and 'I could not look' is a STOP rather than a zero. -------------------
    L.P('the_header_row_names_at_least_one_column', 'a non-empty header row',
      out.named_column_count, out.named_column_count > 0);
    if (out.named_column_count === 0) { stop('HEADER_ROW_UNREADABLE'); return fin(); }
    out.id_column_resolved = (t.live_columns || []).indexOf(spec.id) >= 0;
    L.P('the_id_column_resolves_against_the_live_header_row', spec.id,
      out.id_column_resolved, out.id_column_resolved === true);
    if (!out.id_column_resolved) { stop('ID_COLUMN_UNRESOLVED'); return fin(); }
    out.header_fingerprint = S1_headerFingerprint_(t.live_columns);
    L.P('the_schema_and_row_hash_authority_answered', 'a header fingerprint and a table fingerprint',
      { header: out.header_fingerprint, table: out.table_combined_fingerprint },
      out.header_fingerprint !== null && out.table_combined_fingerprint !== null);
    if (out.header_fingerprint === null || out.table_combined_fingerprint === null) {
      stop('HASH_AUTHORITY_UNAVAILABLE'); return fin();
    }

    // ---- 5. THE JUDGEMENT. NOT MADE HERE - S1_idIntegrity_ makes it. ---------------------------
    var integ = S1_idIntegrity_(t, spec.id);
    L.P('the_shared_id_integrity_authority_examined_this_table', true, integ.checked,
      integ.checked === true);
    if (integ.checked !== true) { stop('ID_INTEGRITY_NOT_CHECKED'); return fin(); }
    out.row_count = integ.row_count;
    out.non_blank_id_count = integ.ok_count;
    out.blank_id_count = integ.blank_id_count;
    out.duplicate_id_count = integ.duplicate_id_count;
    out.wrong_type_id_count = integ.wrong_type_id_count;
    out.outside_named_column_row_count = integ.outside_named_columns_count;
    // A DUPLICATE IS NOT VALID AND NEITHER IS A COERCED NUMBER, so `valid` subtracts them. Both faults
    // leave the cell populated, which is why they are inside the non-blank count and have to come out of
    // this one.
    out.valid_id_count = integ.ok_count - integ.duplicate_id_count - integ.wrong_type_id_count;
    out.count_derivations = {
      non_blank_id_count: 'rows whose id cell is not blank - a duplicate and a wrong-typed id are both'
        + ' in here, because both are present',
      valid_id_count: 'non_blank_id_count - duplicate_id_count - wrong_type_id_count: present, a string,'
        + ' and unique',
      row_count: 'non_blank_id_count + blank_id_count + outside_named_column_row_count. A fully blank'
        + ' sheet row is in none of them because it is not a record.' };
    // The two identities that have to close, or the counts describe a population that does not exist.
    L.P('the_row_count_is_the_non_blank_ids_plus_the_blanks_plus_the_rows_outside_the_named_columns',
      out.row_count,
      out.non_blank_id_count + out.blank_id_count + out.outside_named_column_row_count,
      out.non_blank_id_count + out.blank_id_count
        + out.outside_named_column_row_count === out.row_count);
    L.P('the_valid_ids_are_the_non_blank_ones_minus_the_duplicated_and_the_wrong_typed',
      out.non_blank_id_count - out.duplicate_id_count - out.wrong_type_id_count,
      out.valid_id_count,
      out.valid_id_count === out.non_blank_id_count - out.duplicate_id_count
        - out.wrong_type_id_count && out.valid_id_count >= 0);

    // ---- 6. WHERE THEY ARE. -------------------------------------------------------------------
    out.faults = S1_idFaultRows_(t, integ, S1_FACTORY_MOVEMENT_TABLE_, out.authoritative_id_contract);
    L.P('every_fault_the_integrity_authority_found_is_located_by_a_row',
      integ.blank_id_count + integ.wrong_type_id_count + integ.duplicate_id_count
        + integ.outside_named_columns_count,
      out.faults.length,
      out.faults.length === integ.blank_id_count + integ.wrong_type_id_count
        + integ.duplicate_id_count + integ.outside_named_columns_count);
    var bad = out.faults.filter(function (f) {
      return !(typeof f.one_based_sheet_row_number === 'number' && f.one_based_sheet_row_number >= 2)
        || f.full_named_row_fingerprint === null || S1_str_(f.recommended_next_action) === '';
    });
    L.P('every_located_fault_carries_a_sheet_row_number_a_fingerprint_and_a_next_action', [], bad,
      bad.length === 0);
    // §3 - THE TWO CLASSES ARE NOT THE SAME FINDING. A real record that lost its primary key needs a
    // controlled backfill decision; a stray cell in an unnamed column needs a person to look at that cell.
    // Neither is done here, and the classification is what tells them apart.
    var misclassified = out.faults.filter(function (f) {
      if (f.fault_class === 'BLANK') {
        return f.row_has_business_content !== true || f.row_outside_named_columns !== false
          || f.recommended_next_action !== 'PREPARE_CONTROLLED_ID_BACKFILL';
      }
      if (f.fault_class === 'OUTSIDE_NAMED') {
        return f.row_has_business_content !== false || f.row_outside_named_columns !== true
          || f.recommended_next_action !== 'REVIEW_UNNAMED_CELL';
      }
      return false;
    });
    L.P('a_record_that_lost_its_key_and_a_stray_cell_are_classified_apart', [], misclassified,
      misclassified.length === 0);
    return fin();
  } catch (e) {
    L.P('the_census_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    stop('CENSUS_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  }
}

// ================================================================================================================
// S1-R4E §2 - THE CONTROLLED BACKFILL PACKAGE. TWO ENTRY POINTS, AND THE READ-ONLY ONE OWNS THE EVIDENCE.
//
// The split is the whole safety property. The MANIFEST measures and freezes; the BACKFILL verifies the frozen
// evidence against a fresh measurement and refuses on any disagreement. Nothing in the backfill computes its
// own expectation, because a check whose expectation comes from the thing being checked passes by
// construction - the defect S1-R4B was called in to repair, one table over.
//
// DEFAULT IS DRY RUN. `execute` must be exactly `true`; anything else, including absent, is a dry run.
// ================================================================================================================

/** The freeze the MANIFEST hands over and the BACKFILL consumes. A missing field is a refusal, not a gap. */
var S1_MOV_FREEZE_REQUIRED_ = [
  'frozen_at', 'build', 'table', 'sheet_name',
  'live_column_count', 'named_column_count', 'live_columns', 'header_fingerprint',
  'table_combined_fingerprint', 'row_count',
  'non_blank_id_count', 'valid_id_count', 'blank_id_count', 'duplicate_id_count',
  'wrong_type_id_count', 'outside_named_column_row_count',
  'target_row_number', 'target_id_column', 'target_id_column_index_1based',
  'target_row_fingerprint', 'target_row_cells',
  'existing_id_count', 'existing_id_universe_fingerprint',
  'classification', 'classification_reasons',
  'proposed_id', 'proposed_id_natural_key',
  'expected_after_row_fingerprint', 'expected_after',
  'authorization_wording'
];

/** Read one table's canonical cell values for a row, in live column order. Strings, so the freeze survives a
 *  JSON round-trip: a Date pasted back as an ISO string would not re-hash to the same value. */
function S1_movRowCells_(rec, liveColumns) {
  var out = [];
  (liveColumns || []).forEach(function (c, i) {
    out.push({ column: c, index_1based: i + 1, canonical: S1_canonCell_(rec.__values[i]) });
  });
  return out;
}

/** The fingerprint the row WILL have once the one cell carries the proposed id. Computed at manifest time
 *  from the live raw values with only that cell substituted, and then FROZEN - so the backfill compares a
 *  fresh measurement against an expectation it did not produce. */
function S1_movExpectedAfterFingerprint_(rec, liveColumns, idColumn, newId) {
  var vals = (rec.__values || []).slice();
  var at = (liveColumns || []).indexOf(idColumn);
  if (at === -1) return null;
  vals[at] = newId;
  return S1_rowFingerprint_(liveColumns, vals);
}

/** Every id currently in the table, as a set plus a fingerprint, so a collision is checkable and a change to
 *  the id universe between manifest and execute is detectable. */
function S1_movIdUniverse_(t, idKey) {
  var ids = [];
  (t.rows || []).forEach(function (r) {
    var v = S1_str_(S1_cellOf_(r, idKey));
    if (v !== '') ids.push(v);
  });
  return { ids: ids, count: ids.length, fingerprint: S1_fingerprint_(ids) };
}

/**
 * Read the movement table and everything the package needs to decide. Shared by both entry points so the
 * MANIFEST and the BACKFILL cannot disagree about what they read.
 */
function S1_movReadForRepair_() {
  var o = { ok: false, stop_reasons: [], ss: null, sheet: null, table: S1_FACTORY_MOVEMENT_TABLE_,
    id_column: null, id_authority: null, authoritative_id_contract:
      S1_FACTORY_ID_AUTHORITY_[S1_FACTORY_MOVEMENT_TABLE_] || null,
    t: null, integrity: null, faults: [], universe: null,
    live_columns: [], live_column_count: null, named_column_count: null,
    header_fingerprint: null, table_combined_fingerprint: null };
  function stop(r) { if (o.stop_reasons.indexOf(r) === -1) o.stop_reasons.push(r); return o; }

  var spec = null;
  S1_factorySurfaceSpecs_().forEach(function (sp) {
    if (sp.table === S1_FACTORY_MOVEMENT_TABLE_) spec = sp;
  });
  if (!spec || S1_str_(spec.id) === '') return stop('ID_COLUMN_AUTHORITY_MISSING');
  o.id_column = spec.id;
  o.id_authority = spec.id_authority;
  if (!o.authoritative_id_contract) return stop('ID_CONTRACT_MISSING');

  var db = S1_openDb_();
  if (!db.ok) return stop('DB_NOT_OPENED_' + db.reason);
  o.ss = db.ss;
  try { o.sheet = db.ss.getSheetByName(S1_FACTORY_MOVEMENT_TABLE_); } catch (e) { o.sheet = null; }
  if (!o.sheet) return stop('SHEET_ABSENT');

  var t = S1_fullRowTable_(db.ss, S1_FACTORY_MOVEMENT_TABLE_, null, [spec.id]);
  o.t = t;
  if (!t.present) return stop('SHEET_ABSENT');
  if (!t.readable) return stop('SHEET_PRESENT_BUT_UNREADABLE');
  o.live_columns = t.live_columns || [];
  o.live_column_count = t.live_column_count;
  o.named_column_count = o.live_columns.filter(function (c) { return c !== ''; }).length;
  if (o.named_column_count === 0) return stop('HEADER_ROW_UNREADABLE');
  if (o.live_columns.indexOf(spec.id) === -1) return stop('ID_COLUMN_UNRESOLVED');
  o.header_fingerprint = S1_headerFingerprint_(o.live_columns);
  o.table_combined_fingerprint = t.combined_fingerprint;
  if (o.header_fingerprint === null || o.table_combined_fingerprint === null) {
    return stop('HASH_AUTHORITY_UNAVAILABLE');
  }
  var integ = S1_idIntegrity_(t, spec.id);
  if (integ.checked !== true) return stop('ID_INTEGRITY_NOT_CHECKED');
  o.integrity = integ;
  o.faults = S1_idFaultRows_(t, integ, S1_FACTORY_MOVEMENT_TABLE_, o.authoritative_id_contract);
  o.universe = S1_movIdUniverse_(t, spec.id);
  o.ok = true;
  return o;
}

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST - READ ONLY.
 *
 * Re-measures, classifies the one fault, proposes a deterministic id, freezes an exact BEFORE, states the
 * exact AFTER a repair would produce, and writes the authorization sentence a person signs. Writes nothing.
 *
 * On a row that is NOT repairable by writing one cell it returns LEGACY_ROW_CLASSIFICATION_REQUIRED, freezes
 * NOTHING, proposes NOTHING and emits no authorization - so the backfill has nothing to consume and the
 * execute path is unreachable for that row by construction rather than by promise.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL_MANIFEST() {
  var out = {
    manifest: 'S1 FACTORY MOVEMENT ID BACKFILL - read-only measurement, classification and freeze',
    build: S1_BUILD_, dry_run: true, read_only: true,
    writes: 0, writer_calls: 0, cells_written: 0, ids_minted: 0, ids_backfilled: 0,
    rows_modified: 0, rows_added: 0, rows_removed: 0, rows_reordered: false,
    generate_called: false, submit_called: false, migration_called: false, gap_job_called: false,
    factory_writer_called: false, tables_touched: [],
    measured_at: null,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    field_contract: S1_MOV_FIELD_CONTRACT_,
    field_contract_authority: 'required-ness from SHIPMENT_DATABASE_SCHEMA.md; column NAMES from'
      + ' 21_ MOV_HEADERS, which is what the live sheet has; the two disagree on shape and the'
      + ' divergence is recorded per column rather than resolved here',
    live_column_count: null, named_column_count: null, live_columns: [],
    header_fingerprint: null, table_combined_fingerprint: null,
    row_count: null, non_blank_id_count: null, valid_id_count: null,
    blank_id_count: null, duplicate_id_count: null, wrong_type_id_count: null,
    outside_named_column_row_count: null,
    fault_count: null, faults: [],
    target: null, classification: null, classification_reasons: [],
    proposed: null, frozen_before: null, expected_after: null,
    authorization_wording: null, next_decision: null,
    verdict: 'STOP', stop_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [] };
  var L = S1_ledger_();
  function stop(r) { if (out.stop_reasons.indexOf(r) === -1) out.stop_reasons.push(r); }

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    if (out.stop_reasons.length || L.failed.length) out.verdict = 'STOP';
    // A REFUSED MANIFEST FREEZES NOTHING AND SIGNS NOTHING. Same lock as MANIFEST P's LOCK FIVE: the
    // baseline and the sentence are the same authorization by two routes, so both go.
    if (out.verdict !== 'READY_TO_AUTHORIZE_BACKFILL') {
      out.frozen_before = null;
      out.authorization_wording = null;
      if (out.verdict === 'LEGACY_ROW_CLASSIFICATION_REQUIRED' && !out.next_decision) {
        out.next_decision = 'A DATA GOVERNANCE DECISION IS REQUIRED BEFORE ANY REPAIR. This row cannot be'
          + ' repaired by writing one cell, so no repair is proposed and none is authorized.';
      }
    }
    S1_log_('s1_mov_backfill_manifest_verdict', JSON.stringify({
      build: out.build, verdict: out.verdict, table: out.table,
      classification: out.classification, classification_reasons: out.classification_reasons,
      row_count: out.row_count, blank_id_count: out.blank_id_count,
      valid_id_count: out.valid_id_count, fault_count: out.fault_count,
      header_fingerprint: out.header_fingerprint,
      table_combined_fingerprint: out.table_combined_fingerprint,
      target_row: out.target ? out.target.one_based_sheet_row_number : null,
      proposed_id: out.proposed ? out.proposed.proposed_id : null,
      frozen: !!out.frozen_before, authorization_present: !!out.authorization_wording,
      writes: out.writes, cells_written: out.cells_written, ids_minted: out.ids_minted,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12), stop_reasons: out.stop_reasons.slice(0, 12),
      next_decision: S1_cap_(out.next_decision, 300) }));
    if (out.classification_reasons && out.classification_reasons.length) {
      S1_emitChunked_('s1_mov_backfill_manifest_classification',
        JSON.stringify({ classification: out.classification,
          reasons: out.classification_reasons,
          field_audit: out.target ? out.target.field_audit : null,
          axis_audit: out.target ? out.target.axis_audit : null }));
    }
    if (out.verdict === 'READY_TO_AUTHORIZE_BACKFILL' && out.frozen_before) {
      S1_emitChunked_('s1_mov_backfill_manifest_freeze', JSON.stringify(out.frozen_before));
      S1_emitChunked_('s1_mov_backfill_manifest_authorization', out.authorization_wording);
    } else {
      S1_log_('s1_mov_backfill_manifest_freeze_withheld', JSON.stringify({
        verdict: out.verdict, chunks: 0, frozen: false, authorization_present: false,
        reason: 'NOTHING_MAY_BE_AUTHORIZED_ON_A_' + out.verdict,
        note: 'No baseline and no authorization were produced, so the backfill has nothing to consume.' }));
    }
    return out;
  }

  try {
    out.measured_at = (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : null;
    var R = S1_movReadForRepair_();
    L.P('the_movement_table_was_read_through_the_shared_authorities', [], R.stop_reasons,
      R.ok === true && R.stop_reasons.length === 0);
    if (!R.ok) { R.stop_reasons.forEach(stop); return fin(); }
    out.tables_touched = [S1_FACTORY_MOVEMENT_TABLE_];
    out.live_columns = R.live_columns;
    out.live_column_count = R.live_column_count;
    out.named_column_count = R.named_column_count;
    out.header_fingerprint = R.header_fingerprint;
    out.table_combined_fingerprint = R.table_combined_fingerprint;
    out.row_count = R.integrity.row_count;
    out.non_blank_id_count = R.integrity.ok_count;
    out.blank_id_count = R.integrity.blank_id_count;
    out.duplicate_id_count = R.integrity.duplicate_id_count;
    out.wrong_type_id_count = R.integrity.wrong_type_id_count;
    out.outside_named_column_row_count = R.integrity.outside_named_columns_count;
    out.valid_id_count = R.integrity.ok_count - R.integrity.duplicate_id_count
      - R.integrity.wrong_type_id_count;
    out.faults = R.faults;
    out.fault_count = R.faults.length;

    // ---- EXACTLY ONE FAULT, AND IT IS A BLANK PRIMARY KEY. -------------------------------------
    L.P('the_table_has_exactly_one_id_integrity_fault', 1, out.fault_count, out.fault_count === 1);
    if (out.fault_count !== 1) {
      stop(out.fault_count === 0 ? 'NO_FAULT_TO_REPAIR' : 'MORE_THAN_ONE_FAULT_IS_NOT_A_SINGLE_CELL_REPAIR');
      return fin();
    }
    var f = R.faults[0];
    L.P('the_one_fault_is_a_blank_primary_key', 'FACTORY_MOVEMENT_ID_BLANK', f.fault_code,
      f.fault_code === 'FACTORY_MOVEMENT_ID_BLANK');
    if (f.fault_code !== 'FACTORY_MOVEMENT_ID_BLANK') {
      stop('THE_FAULT_IS_NOT_A_BLANK_PRIMARY_KEY:' + f.fault_code); return fin();
    }
    var rec = null;
    (R.t.rows || []).forEach(function (r) {
      if (r.row_number === f.one_based_sheet_row_number) rec = r;
    });
    L.P('the_target_row_is_readable', true, rec !== null, rec !== null);
    if (!rec) { stop('TARGET_ROW_NOT_READABLE'); return fin(); }

    // ---- §1 CLASSIFICATION. THE WHOLE COLUMN CONTRACT, NOT ONLY THE KEY. -----------------------
    var cls = S1_movClassifyRow_(rec, R.live_columns);
    out.classification = cls.classification;
    out.classification_reasons = cls.reasons;
    out.target = {
      one_based_sheet_row_number: f.one_based_sheet_row_number,
      id_column: R.id_column,
      id_column_index_1based: R.live_columns.indexOf(R.id_column) + 1,
      row_fingerprint: rec.fingerprint,
      observed_id_value: f.observed_id_value, observed_id_type: f.observed_id_type,
      named_nonblank_fields: f.named_nonblank_fields,
      named_nonblank_field_count: f.named_nonblank_field_count,
      field_audit: cls.field_audit, axis_audit: cls.axis_audit,
      classification: cls.classification, classification_reasons: cls.reasons };
    L.P('the_target_row_is_classified_by_the_whole_column_contract',
      'ID_ONLY_MISSING or LEGACY_ROW_CLASSIFICATION_REQUIRED, from a measured field and axis audit',
      { classification: cls.classification, reasons: cls.reasons },
      cls.classification === S1_MOV_CLASS_ID_ONLY_
        || cls.classification === S1_MOV_CLASS_UNRESOLVED_);

    // THE GATE. A row that is not repairable by one cell gets no proposal, no freeze and no sentence.
    if (cls.classification !== S1_MOV_CLASS_ID_ONLY_) {
      out.verdict = S1_MOV_CLASS_UNRESOLVED_;
      out.next_decision = 'LEGACY_ROW_CLASSIFICATION_REQUIRED. Sheet row '
        + f.one_based_sheet_row_number + ' of ' + S1_FACTORY_MOVEMENT_TABLE_ + ' is missing '
        + cls.field_audit.required_blank.length + ' REQUIRED field(s) ('
        + cls.field_audit.required_blank.join(', ') + ') and '
        + cls.field_audit.writer_populated_blank.length
        + ' field(s) every shipped writer populates ('
        + cls.field_audit.writer_populated_blank.join(', ') + '). Ledger axis: '
        + cls.axis_audit.axis + '. Because movement_type decides which axis this row\'s qty moved,'
        + ' writing only the primary key would leave the row unclassifiable while SILENCING the id'
        + ' census that currently refuses it - the reconciliation would still count it as an'
        + ' unknown_type row. The next decision is a data governance one: establish what this row'
        + ' recorded, from evidence outside this table, before any cell is written.';
      // NO PROPOSAL IS EVEN COMPUTED. A frozen id for a row nobody can classify is an authorization
      // waiting to be misused.
      out.proposed = null;
      out.expected_after = null;
      return fin();
    }

    // ---- §3 THE PROPOSED KEY. Deterministic, well formed, and not already in use. ----------------
    var prop = S1_movProposedId_(S1_FACTORY_MOVEMENT_TABLE_, f.one_based_sheet_row_number,
      rec.fingerprint);
    out.proposed = prop;
    L.P('the_hash_authority_that_derives_the_proposed_id_is_available', true, prop.hash_available,
      prop.hash_available === true);
    L.P('the_proposed_id_is_well_formed', 'FSMV- plus 8 uppercase hex', prop.proposed_id,
      S1_movIdWellFormed_(prop.proposed_id));
    L.P('the_proposed_id_is_deterministic_so_a_retry_cannot_mint_a_second_one',
      prop.proposed_id,
      S1_movProposedId_(S1_FACTORY_MOVEMENT_TABLE_, f.one_based_sheet_row_number,
        rec.fingerprint).proposed_id,
      prop.proposed_id !== null
        && S1_movProposedId_(S1_FACTORY_MOVEMENT_TABLE_, f.one_based_sheet_row_number,
          rec.fingerprint).proposed_id === prop.proposed_id);
    L.P('the_proposed_id_collides_with_no_existing_id', -1,
      R.universe.ids.indexOf(S1_str_(prop.proposed_id)),
      prop.proposed_id !== null && R.universe.ids.indexOf(S1_str_(prop.proposed_id)) === -1);

    // ---- THE EXACT BEFORE, AND THE EXACT AFTER. -------------------------------------------------
    var cells = S1_movRowCells_(rec, R.live_columns);
    var afterFp = S1_movExpectedAfterFingerprint_(rec, R.live_columns, R.id_column, prop.proposed_id);
    L.P('the_expected_after_row_fingerprint_was_computed_and_differs_from_the_before_one',
      'a fingerprint that is not the BEFORE one', { before: rec.fingerprint, after: afterFp },
      afterFp !== null && afterFp !== rec.fingerprint);
    out.expected_after = {
      row_count: out.row_count,
      non_blank_id_count: out.non_blank_id_count + 1,
      valid_id_count: out.valid_id_count + 1,
      blank_id_count: 0, duplicate_id_count: 0, wrong_type_id_count: 0,
      outside_named_column_row_count: out.outside_named_column_row_count,
      header_fingerprint: out.header_fingerprint,
      target_row_id: prop.proposed_id,
      target_row_fingerprint: afterFp,
      other_columns_unchanged: out.named_column_count - 1,
      table_combined_fingerprint_changes: true,
      table_combined_fingerprint_before: out.table_combined_fingerprint,
      note: 'The TABLE fingerprint MUST change - one cell changed. What must NOT change is every other'
        + ' cell of the target row and every other row, which is why the check is the exact expected'
        + ' ROW fingerprint plus a column-by-column comparison against the frozen BEFORE cells rather'
        + ' than a table-level equality.' };

    var frozen = {
      frozen_at: out.measured_at, build: out.build,
      table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
      live_column_count: out.live_column_count, named_column_count: out.named_column_count,
      live_columns: out.live_columns, header_fingerprint: out.header_fingerprint,
      table_combined_fingerprint: out.table_combined_fingerprint, row_count: out.row_count,
      non_blank_id_count: out.non_blank_id_count, valid_id_count: out.valid_id_count,
      blank_id_count: out.blank_id_count, duplicate_id_count: out.duplicate_id_count,
      wrong_type_id_count: out.wrong_type_id_count,
      outside_named_column_row_count: out.outside_named_column_row_count,
      target_row_number: f.one_based_sheet_row_number,
      target_id_column: R.id_column,
      target_id_column_index_1based: R.live_columns.indexOf(R.id_column) + 1,
      target_row_fingerprint: rec.fingerprint,
      target_row_cells: cells,
      existing_id_count: R.universe.count,
      existing_id_universe_fingerprint: R.universe.fingerprint,
      classification: cls.classification, classification_reasons: cls.reasons,
      proposed_id: prop.proposed_id, proposed_id_natural_key: prop.natural_key,
      expected_after_row_fingerprint: afterFp,
      expected_after: out.expected_after,
      authorization_wording: null };

    frozen.authorization_wording = S1_movAuthWording_(frozen, cls);
    out.authorization_wording = frozen.authorization_wording;
    var missing = S1_MOV_FREEZE_REQUIRED_.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(frozen, k) || frozen[k] === undefined
        || frozen[k] === null;
    });
    L.P('the_frozen_baseline_carries_every_required_field', [], missing, missing.length === 0);
    var ph = (String(frozen.authorization_wording || '').match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []);
    L.P('the_authorization_wording_carries_no_placeholder', [], ph, ph.length === 0);
    var wa = S1_movWordingAudit_(frozen.authorization_wording, frozen);
    out.wording_audit = wa;
    L.P('the_authorization_wording_names_every_fact_a_person_must_check', [], wa.missing,
      wa.missing.length === 0);
    if (missing.length === 0 && ph.length === 0 && wa.missing.length === 0 && L.failed.length === 0) {
      out.frozen_before = frozen;
      out.verdict = 'READY_TO_AUTHORIZE_BACKFILL';
      out.next_decision = 'A person may now run RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL with this frozen'
        + ' baseline and this exact authorization sentence. It defaults to a DRY RUN.';
    }
    return fin();
  } catch (e) {
    L.P('the_manifest_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    stop('MANIFEST_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  }
}

/** The sentence a person signs. Built only from frozen, measured values. */
function S1_movAuthWording_(fz, cls) {
  if (!fz || !cls) return null;
  return 'I authorize ONE controlled single-cell repair of table ' + fz.table
    + ', sheet row ' + fz.target_row_number + ', column ' + fz.target_id_column
    + ' (column index ' + fz.target_id_column_index_1based + ').'
    + ' That cell is currently BLANK and will be set to the frozen deterministic identifier '
    + fz.proposed_id + ', derived from natural key ' + fz.proposed_id_natural_key + '.'
    + ' The row is classified ' + fz.classification
    + ': the primary key is the only thing missing from it, measured against the whole column'
    + ' contract, and its ledger axis is ' + cls.axis_audit.axis
    + ' with invariant ' + S1_str_(cls.axis_audit.invariant) + ' holding.'
    + ' BEFORE, frozen: the table has ' + fz.row_count + ' record(s), '
    + fz.non_blank_id_count + ' with a non-blank id, ' + fz.valid_id_count + ' valid, '
    + fz.blank_id_count + ' blank, ' + fz.duplicate_id_count + ' duplicated, '
    + fz.wrong_type_id_count + ' wrong-typed and ' + fz.outside_named_column_row_count
    + ' outside the named columns; header fingerprint ' + fz.header_fingerprint
    + ', table fingerprint ' + fz.table_combined_fingerprint
    + ', target row fingerprint ' + fz.target_row_fingerprint
    + ', and ' + fz.existing_id_count + ' existing id(s) with universe fingerprint '
    + fz.existing_id_universe_fingerprint + '.'
    + ' AFTER, expected exactly: ' + fz.expected_after.row_count + ' record(s), '
    + fz.expected_after.valid_id_count + ' valid id(s), ' + fz.expected_after.blank_id_count
    + ' blank, ' + fz.expected_after.duplicate_id_count + ' duplicated, '
    + fz.expected_after.wrong_type_id_count + ' wrong-typed, target row fingerprint '
    + fz.expected_after_row_fingerprint + ', and all '
    + fz.expected_after.other_columns_unchanged
    + ' other column(s) of that row byte-for-byte identical to the frozen BEFORE.'
    + ' EXACTLY ONE CELL MAY BE WRITTEN. No other cell, no other row, no other table: not factory_stock,'
    + ' not reservations, not an allocation draft, not a shipping plan, not a shipment and not an audit'
    + ' ledger. No row may be added, removed, reordered or moved. No other field of this row may be'
    + ' derived, defaulted or filled in. A retry must reuse this same frozen identifier and must not mint'
    + ' a second one. If the write or the readback fails, the same one cell must be restored to BLANK and'
    + ' the row fingerprint must return to ' + fz.target_row_fingerprint + '.'
    + ' THIS AUTHORIZES ONE CELL AND NOTHING ELSE. IT DOES NOT AUTHORIZE A MIGRATION, A BULK BACKFILL,'
    + ' GENERATE, SUBMIT OR ANY OTHER REPAIR.';
}

/** Every fact the sentence must carry, looked for by a needle built from the FROZEN value. */
function S1_movWordingAudit_(w, fz) {
  var o = { built: !!w, bytes: w ? String(w).length : 0, fingerprint: null,
    required_items: [], missing: [], present_count: 0, required_item_count: 0, ok: false };
  if (!w || !fz) { o.missing.push('THE_WORDING_ITSELF'); return o; }
  var text = String(w);
  o.fingerprint = S1_fingerprint_([text]);
  var req = [];
  function need(n, v) { req.push({ item: n, needle: S1_str_(v) }); }
  need('table', fz.table);
  need('target_row_number', 'sheet row ' + fz.target_row_number);
  need('target_id_column', fz.target_id_column);
  need('target_column_index', 'column index ' + fz.target_id_column_index_1based);
  need('proposed_id', fz.proposed_id);
  need('proposed_id_natural_key', fz.proposed_id_natural_key);
  need('classification', fz.classification);
  need('before_row_count', fz.row_count + ' record(s)');
  need('before_valid_id_count', fz.valid_id_count + ' valid');
  need('before_blank_id_count', fz.blank_id_count + ' blank');
  need('header_fingerprint', fz.header_fingerprint);
  need('table_fingerprint', fz.table_combined_fingerprint);
  need('target_row_fingerprint', fz.target_row_fingerprint);
  need('existing_id_universe_fingerprint', fz.existing_id_universe_fingerprint);
  need('expected_after_row_fingerprint', fz.expected_after_row_fingerprint);
  need('expected_after_valid_id_count', fz.expected_after.valid_id_count + ' valid id(s)');
  need('other_columns_unchanged', fz.expected_after.other_columns_unchanged + ' other column(s)');
  need('exactly_one_cell', 'EXACTLY ONE CELL MAY BE WRITTEN');
  need('no_other_table', 'not factory_stock');
  need('no_row_movement', 'reordered or moved');
  need('retry_reuses_the_same_id', 'must not mint');
  need('rollback_to_blank', 'restored to BLANK');
  need('scope_boundary', 'THIS AUTHORIZES ONE CELL AND NOTHING ELSE');
  req.forEach(function (r) {
    r.present = S1_needleFound_(text, r.needle);
    if (r.present) o.present_count++; else o.missing.push(r.item);
  });
  o.required_items = req.map(function (r) { return { item: r.item, present: r.present }; });
  o.required_item_count = req.length;
  o.ok = o.missing.length === 0;
  return o;
}

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL({ execute, frozen, authorization })
 *
 * DEFAULT IS A DRY RUN. `execute` must be exactly `true`; absent, false, 'true', 1 and anything else are all
 * dry runs. A dry run performs every check and writes nothing.
 *
 * IT COMPUTES NO EXPECTATION OF ITS OWN. Every BEFORE value and the expected AFTER row fingerprint come from
 * the frozen manifest; this function re-measures the sheet and compares. A check whose expectation is
 * derived from the thing being checked passes by construction, which is the defect R4B was called in to
 * repair - so the two halves are deliberately kept in different functions with the evidence passed between
 * them.
 *
 * ONE CELL. There is exactly one setValue site for the repair and exactly one for the rollback, both at
 * (frozen.target_row_number, frozen.target_id_column_index_1based), and the column index is re-resolved from
 * the live header and required to equal the frozen one - so a reordered column refuses rather than writing
 * into whatever now sits at that position.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_ID_BACKFILL(opts) {
  opts = opts || {};
  var out = {
    tool: 'S1 FACTORY MOVEMENT ID BACKFILL - single cell, frozen evidence, dry run by default',
    build: S1_BUILD_,
    // `execute` MUST be exactly true. Anything else is a dry run, including the string 'true' - a truthy
    // check here would turn a typo into a production write.
    execute_requested: opts.execute === true,
    dry_run: opts.execute !== true,
    writes: 0, cells_written: 0, cells_rolled_back: 0, ids_minted: 0,
    rows_added: 0, rows_removed: 0, rows_reordered: false, other_tables_touched: [],
    generate_called: false, submit_called: false, migration_called: false, gap_job_called: false,
    factory_writer_called: false,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    target_row_number: null, target_id_column: null, target_cell_a1: null,
    frozen_supplied: false, frozen_complete: false, authorization_supplied: false,
    authorization_matches_frozen: false,
    verification: {}, id_check: {}, readback: null, rollback: null,
    already_applied: false,
    verdict: 'REFUSED', refusal_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [] };
  var L = S1_ledger_();
  function refuse(r) { if (out.refusal_reasons.indexOf(r) === -1) out.refusal_reasons.push(r); }

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    if (out.verdict === 'REFUSED' && !out.refusal_reasons.length && L.failed.length) {
      out.refusal_reasons.push(L.failed.length + ' condition(s) not met: ' + L.failed.join(', '));
    }
    S1_log_('s1_mov_backfill_verdict', JSON.stringify({
      build: out.build, verdict: out.verdict,
      execute_requested: out.execute_requested, dry_run: out.dry_run,
      table: out.table, target_cell: out.target_cell_a1,
      writes: out.writes, cells_written: out.cells_written,
      cells_rolled_back: out.cells_rolled_back, ids_minted: out.ids_minted,
      already_applied: out.already_applied,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12),
      refusal_reasons: out.refusal_reasons.slice(0, 12),
      readback_ok: out.readback ? out.readback.ok : null,
      rollback: out.rollback ? out.rollback.outcome : null,
      note: 'A REFUSED or DRY_RUN verdict wrote nothing. Only EXECUTED_OK means one cell changed.' }));
    return out;
  }

  try {
    // ---- §10 THE FROZEN EVIDENCE IS THE INPUT, AND IT MUST BE WHOLE. ---------------------------
    var fz = opts.frozen || null;
    out.frozen_supplied = !!fz;
    L.P('a_frozen_baseline_from_the_manifest_was_supplied', true, out.frozen_supplied,
      out.frozen_supplied === true);
    if (!fz) { refuse('NO_FROZEN_BASELINE - run the MANIFEST first and pass its frozen_before'); return fin(); }
    var fzMissing = S1_MOV_FREEZE_REQUIRED_.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(fz, k) || fz[k] === undefined || fz[k] === null;
    });
    out.frozen_complete = fzMissing.length === 0;
    L.P('the_frozen_baseline_carries_every_required_field', [], fzMissing, fzMissing.length === 0);
    if (fzMissing.length) { refuse('FROZEN_BASELINE_INCOMPLETE:' + fzMissing.join(',')); return fin(); }
    out.target_row_number = fz.target_row_number;
    out.target_id_column = fz.target_id_column;
    out.target_cell_a1 = fz.sheet_name + '!row ' + fz.target_row_number
      + ', col ' + fz.target_id_column_index_1based + ' (' + fz.target_id_column + ')';

    // ---- THE AUTHORIZATION MUST BE THE EXACT SENTENCE THE MANIFEST FROZE. ----------------------
    var auth = S1_str_(opts.authorization);
    out.authorization_supplied = auth !== '';
    out.authorization_matches_frozen = auth !== '' && auth === S1_str_(fz.authorization_wording);
    L.P('an_authorization_sentence_was_supplied', true, out.authorization_supplied,
      out.authorization_supplied === true);
    L.P('the_authorization_is_byte_identical_to_the_one_the_manifest_froze', true,
      out.authorization_matches_frozen, out.authorization_matches_frozen === true);
    if (!out.authorization_matches_frozen) {
      refuse(auth === '' ? 'NO_AUTHORIZATION_SUPPLIED'
        : 'AUTHORIZATION_DOES_NOT_MATCH_THE_FROZEN_SENTENCE');
      return fin();
    }
    L.P('the_frozen_baseline_was_taken_against_this_build', S1_BUILD_, fz.build,
      S1_str_(fz.build) === S1_BUILD_);
    L.P('the_frozen_baseline_targets_the_movement_table', S1_FACTORY_MOVEMENT_TABLE_, fz.table,
      S1_str_(fz.table) === S1_FACTORY_MOVEMENT_TABLE_);
    L.P('the_frozen_classification_is_that_only_the_primary_key_is_missing',
      S1_MOV_CLASS_ID_ONLY_, fz.classification, fz.classification === S1_MOV_CLASS_ID_ONLY_);
    if (fz.classification !== S1_MOV_CLASS_ID_ONLY_) {
      refuse('FROZEN_CLASSIFICATION_IS_NOT_ID_ONLY:' + S1_str_(fz.classification)); return fin();
    }

    // ---- §2 RE-MEASURE, AND EVERY FROZEN FACT MUST STILL HOLD. ---------------------------------
    var R = S1_movReadForRepair_();
    L.P('the_movement_table_is_readable_now', [], R.stop_reasons,
      R.ok === true && R.stop_reasons.length === 0);
    if (!R.ok) { refuse('TABLE_NOT_READABLE:' + R.stop_reasons.join(',')); return fin(); }
    out.other_tables_touched = [];

    // ---- §3 IDEMPOTENCY IS ASKED FIRST, BECAUSE A RETRY IS A DIFFERENT QUESTION. ---------------
    //
    // MEASURED WRONG FIRST. This check used to sit after the pre-repair verification, and on a retry of a
    // COMPLETED repair every one of those conditions is legitimately false: the row fingerprint is now the
    // AFTER one, the blank count is 0 and the fault list is empty - so the run indexed R.faults[0] on an
    // empty array and threw, reporting TOOL_THREW for a repair that had already succeeded.
    //
    // Those conditions exist to protect a repair that is ABOUT to happen. They are the wrong questions to
    // ask about one that already did, so the retry is detected before any of them is recorded - and it is
    // CONFIRMED by readback against the frozen expected AFTER rather than merely shrugged at.
    var rec0 = null;
    (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec0 = r; });
    if (rec0 && S1_str_(S1_cellOf_(rec0, fz.target_id_column)) === S1_str_(fz.proposed_id)) {
      out.already_applied = true;
      out.readback = S1_movReadback_(fz);
      L.P('a_retry_of_a_completed_repair_writes_nothing', [0, 0],
        [out.writes, out.cells_written], out.writes === 0 && out.cells_written === 0);
      L.P('a_retry_minted_no_second_id', 0, out.ids_minted, out.ids_minted === 0);
      L.P('a_retry_confirms_the_completed_repair_against_the_frozen_expected_after', [],
        out.readback.mismatches, out.readback.ok === true);
      out.verdict = out.readback.ok === true ? 'ALREADY_APPLIED'
        : 'ALREADY_APPLIED_BUT_READBACK_MISMATCH';
      if (out.readback.ok !== true) {
        refuse('THE_CELL_HOLDS_THE_FROZEN_ID_BUT_THE_ROW_NO_LONGER_MATCHES_THE_EXPECTED_AFTER');
      }
      return fin();
    }

    var v = out.verification;
    v.header_fingerprint = { frozen: fz.header_fingerprint, now: R.header_fingerprint };
    v.live_column_count = { frozen: fz.live_column_count, now: R.live_column_count };
    v.row_count = { frozen: fz.row_count, now: R.integrity.row_count };
    v.table_combined_fingerprint = { frozen: fz.table_combined_fingerprint,
      now: R.table_combined_fingerprint };
    v.blank_id_count = { frozen: fz.blank_id_count, now: R.integrity.blank_id_count };
    v.existing_id_universe_fingerprint = { frozen: fz.existing_id_universe_fingerprint,
      now: R.universe.fingerprint };
    L.P('the_header_fingerprint_is_the_one_that_was_frozen', fz.header_fingerprint,
      R.header_fingerprint, S1_str_(fz.header_fingerprint) === S1_str_(R.header_fingerprint));
    L.P('the_live_column_count_is_the_one_that_was_frozen', fz.live_column_count,
      R.live_column_count, fz.live_column_count === R.live_column_count);
    L.P('the_id_column_still_sits_where_it_was_frozen', fz.target_id_column_index_1based,
      R.live_columns.indexOf(fz.target_id_column) + 1,
      R.live_columns.indexOf(fz.target_id_column) + 1 === fz.target_id_column_index_1based);
    L.P('the_row_count_is_the_one_that_was_frozen', fz.row_count, R.integrity.row_count,
      fz.row_count === R.integrity.row_count);
    L.P('the_table_fingerprint_is_the_one_that_was_frozen', fz.table_combined_fingerprint,
      R.table_combined_fingerprint,
      S1_str_(fz.table_combined_fingerprint) === S1_str_(R.table_combined_fingerprint));
    L.P('the_id_universe_is_the_one_that_was_frozen', fz.existing_id_universe_fingerprint,
      R.universe.fingerprint,
      S1_str_(fz.existing_id_universe_fingerprint) === S1_str_(R.universe.fingerprint));
    L.P('the_table_still_has_exactly_one_id_integrity_fault', 1, R.faults.length,
      R.faults.length === 1);
    L.P('the_table_still_has_exactly_one_blank_id_and_no_other_class_of_fault',
      { blank: 1, duplicate: 0, wrong_type: 0, outside_named: fz.outside_named_column_row_count },
      { blank: R.integrity.blank_id_count, duplicate: R.integrity.duplicate_id_count,
        wrong_type: R.integrity.wrong_type_id_count,
        outside_named: R.integrity.outside_named_columns_count },
      R.integrity.blank_id_count === 1 && R.integrity.duplicate_id_count === 0
        && R.integrity.wrong_type_id_count === 0
        && R.integrity.outside_named_columns_count === fz.outside_named_column_row_count);

    // ---- THE TARGET ROW IS STILL WHERE IT WAS, AND STILL WHAT IT WAS. -------------------------
    var rec = null;
    (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec = r; });
    L.P('the_target_sheet_row_is_still_readable', true, rec !== null, rec !== null);
    if (!rec) { refuse('TARGET_ROW_NOT_FOUND_AT_THE_FROZEN_ROW_NUMBER'); return fin(); }
    L.P('the_target_row_fingerprint_is_the_one_that_was_frozen', fz.target_row_fingerprint,
      rec.fingerprint, S1_str_(fz.target_row_fingerprint) === S1_str_(rec.fingerprint));
    // AND THE ONE BLANK IS STILL THIS ROW. A fault that moved is a different repair.
    // AN EMPTY FAULT LIST IS A STATE, NOT AN EXCEPTION. Indexing it directly is what turned a retry into a
    // TOOL_THREW; a condition that crashes instead of failing is not a condition.
    var f0 = R.faults.length ? R.faults[0] : null;
    L.P('the_one_blank_id_is_still_this_row', fz.target_row_number,
      f0 ? { row: f0.one_based_sheet_row_number, code: f0.fault_code } : 'no fault found',
      !!f0 && f0.one_based_sheet_row_number === fz.target_row_number
        && f0.fault_code === 'FACTORY_MOVEMENT_ID_BLANK');
    var liveId = S1_str_(S1_cellOf_(rec, fz.target_id_column));
    L.P('the_target_cell_is_still_blank', '', liveId, liveId === '');
    if (liveId !== '') { refuse('TARGET_CELL_IS_NO_LONGER_BLANK:' + S1_cap_(liveId, 40)); return fin(); }

    // ---- §1 THE ROW STILL CLASSIFIES AS ID-ONLY, MEASURED NOW. --------------------------------
    var cls = S1_movClassifyRow_(rec, R.live_columns);
    L.P('the_row_still_classifies_as_only_the_primary_key_missing', S1_MOV_CLASS_ID_ONLY_,
      { classification: cls.classification, reasons: cls.reasons },
      cls.classification === S1_MOV_CLASS_ID_ONLY_);
    if (cls.classification !== S1_MOV_CLASS_ID_ONLY_) {
      refuse(S1_MOV_CLASS_UNRESOLVED_ + ':' + cls.reasons.join(';')); return fin();
    }

    // ---- §3 THE ID IS THE FROZEN ONE, RE-DERIVED, WELL FORMED AND UNUSED. --------------------
    var rederived = S1_movProposedId_(S1_FACTORY_MOVEMENT_TABLE_, fz.target_row_number,
      rec.fingerprint);
    out.id_check = { frozen: fz.proposed_id, rederived: rederived.proposed_id,
      natural_key_frozen: fz.proposed_id_natural_key, natural_key_now: rederived.natural_key,
      well_formed: S1_movIdWellFormed_(fz.proposed_id),
      collides: R.universe.ids.indexOf(S1_str_(fz.proposed_id)) >= 0 };
    L.P('the_frozen_id_is_well_formed', 'FSMV- plus 8 uppercase hex', fz.proposed_id,
      out.id_check.well_formed === true);
    // NOT SELF-COMPARISON: the frozen id came from the manifest and the re-derivation comes from the sheet
    // as it is now. They agree only if the row is the row the id was authorized for.
    L.P('the_frozen_id_is_what_this_row_still_derives_to', fz.proposed_id, rederived.proposed_id,
      rederived.proposed_id !== null && S1_str_(rederived.proposed_id) === S1_str_(fz.proposed_id));
    L.P('the_natural_key_is_the_one_that_was_frozen', fz.proposed_id_natural_key,
      rederived.natural_key, S1_str_(rederived.natural_key) === S1_str_(fz.proposed_id_natural_key));
    L.P('the_frozen_id_collides_with_no_existing_id', false, out.id_check.collides,
      out.id_check.collides === false);
    L.P('this_tool_minted_no_id_of_its_own', 0, out.ids_minted, out.ids_minted === 0);

    // ---- §4 THE TARGET IS ONE CELL, NAMED. --------------------------------------------------
    var col = R.live_columns.indexOf(fz.target_id_column) + 1;
    L.P('the_write_target_is_exactly_one_named_cell',
      { row: fz.target_row_number, col: fz.target_id_column_index_1based },
      { row: fz.target_row_number, col: col },
      col === fz.target_id_column_index_1based && col >= 1);

    if (L.failed.length) { return fin(); }

    // ---- §DEFAULT: A DRY RUN STOPS HERE, HAVING WRITTEN NOTHING. ----------------------------
    if (opts.execute !== true) {
      out.verdict = 'DRY_RUN_OK';
      L.P('a_dry_run_wrote_nothing', [0, 0], [out.writes, out.cells_written],
        out.writes === 0 && out.cells_written === 0);
      return fin();
    }

    // ---- §4 THE WRITE. ONE CELL. ONE CALL. -------------------------------------------------
    var wrote = false;
    try {
      R.sheet.getRange(fz.target_row_number, col).setValue(fz.proposed_id);
      wrote = true;
      out.writes = 1;
      out.cells_written = 1;
    } catch (wErr) {
      out.verdict = 'WRITE_FAILED';
      refuse('WRITE_THREW: ' + S1_cap_(String(wErr && wErr.message ? wErr.message : wErr), 200));
      L.P('the_single_cell_write_succeeded', true, 'threw', false);
      out.rollback = S1_movRollback_(R.sheet, fz, col, 'WRITE_THREW');
      out.cells_rolled_back = out.rollback.cells_rolled_back;
      if (out.rollback.outcome !== 'RESTORED') out.verdict = 'ROLLBACK_FAILED';
      return fin();
    }

    // ---- §8 READBACK, AGAINST THE FROZEN EXPECTATION. -------------------------------------
    out.readback = S1_movReadback_(fz);
    L.P('the_readback_matched_the_frozen_expected_after', [], out.readback.mismatches,
      out.readback.ok === true);
    if (out.readback.ok !== true) {
      out.verdict = 'READBACK_FAILED';
      refuse('READBACK_MISMATCH:' + out.readback.mismatches.map(function (m) {
        return m.what; }).join(','));
      out.rollback = S1_movRollback_(R.sheet, fz, col, 'READBACK_MISMATCH');
      out.cells_rolled_back = out.rollback.cells_rolled_back;
      out.verdict = out.rollback.outcome === 'RESTORED' ? 'EXECUTED_AND_ROLLED_BACK' : 'ROLLBACK_FAILED';
      return fin();
    }
    out.verdict = 'EXECUTED_OK';
    L.P('exactly_one_cell_was_written', 1, out.cells_written, out.cells_written === 1);
    L.P('no_row_was_added_removed_or_reordered', [0, 0, false],
      [out.rows_added, out.rows_removed, out.rows_reordered],
      out.rows_added === 0 && out.rows_removed === 0 && out.rows_reordered === false);
    return fin();
  } catch (e) {
    L.P('the_tool_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    refuse('TOOL_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  }
}

/**
 * §8 - Re-read and compare against the FROZEN expectation, column by column. The table fingerprint is
 * expected to CHANGE (a cell changed); what must not change is every other cell, and that is checked as an
 * exact row fingerprint plus a per-column comparison rather than as a table-level equality.
 */
function S1_movReadback_(fz) {
  var o = { ok: false, mismatches: [], measured: {}, columns_compared: 0, columns_identical: 0 };
  var R = S1_movReadForRepair_();
  if (!R.ok) {
    o.mismatches.push({ what: 'TABLE_NOT_READABLE_ON_READBACK', detail: R.stop_reasons });
    return o;
  }
  function cmp(what, expected, actual) {
    o.measured[what] = actual;
    if (String(expected) !== String(actual)) {
      o.mismatches.push({ what: what, expected: expected, actual: actual });
    }
  }
  cmp('row_count', fz.expected_after.row_count, R.integrity.row_count);
  cmp('non_blank_id_count', fz.expected_after.non_blank_id_count, R.integrity.ok_count);
  cmp('valid_id_count', fz.expected_after.valid_id_count,
    R.integrity.ok_count - R.integrity.duplicate_id_count - R.integrity.wrong_type_id_count);
  cmp('blank_id_count', fz.expected_after.blank_id_count, R.integrity.blank_id_count);
  cmp('duplicate_id_count', fz.expected_after.duplicate_id_count, R.integrity.duplicate_id_count);
  cmp('wrong_type_id_count', fz.expected_after.wrong_type_id_count, R.integrity.wrong_type_id_count);
  cmp('outside_named_column_row_count', fz.expected_after.outside_named_column_row_count,
    R.integrity.outside_named_columns_count);
  cmp('header_fingerprint', fz.expected_after.header_fingerprint, R.header_fingerprint);
  cmp('live_column_count', fz.live_column_count, R.live_column_count);
  var rec = null;
  (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec = r; });
  if (!rec) {
    o.mismatches.push({ what: 'TARGET_ROW_MISSING_ON_READBACK', expected: fz.target_row_number,
      actual: null });
    return o;
  }
  cmp('target_row_fingerprint', fz.expected_after_row_fingerprint, rec.fingerprint);
  cmp('target_row_id', fz.expected_after.target_row_id, S1_str_(S1_cellOf_(rec, fz.target_id_column)));
  // EVERY OTHER COLUMN, ONE AT A TIME, AGAINST THE FROZEN BEFORE. A single row fingerprint would already
  // catch any change, but it would not say WHICH cell moved - and on a failed repair that is the first
  // thing a person needs.
  (fz.target_row_cells || []).forEach(function (c) {
    if (c.column === fz.target_id_column) return;
    o.columns_compared++;
    var now = S1_canonCell_(S1_cellOf_(rec, c.column));
    if (now === c.canonical) { o.columns_identical++; return; }
    o.mismatches.push({ what: 'COLUMN_CHANGED:' + c.column, expected: c.canonical, actual: now });
  });
  o.ok = o.mismatches.length === 0
    && o.columns_identical === fz.expected_after.other_columns_unchanged;
  if (!o.ok && o.columns_identical !== fz.expected_after.other_columns_unchanged) {
    o.mismatches.push({ what: 'OTHER_COLUMN_COUNT',
      expected: fz.expected_after.other_columns_unchanged, actual: o.columns_identical });
  }
  return o;
}

/**
 * §9 - The rollback restores THE SAME ONE CELL to blank and then proves it, by re-reading the row and
 * requiring its fingerprint to be the frozen BEFORE value. A rollback that is not verified is a hope.
 */
function S1_movRollback_(sheet, fz, col, why) {
  var o = { attempted: true, why: why, outcome: 'FAILED', cells_rolled_back: 0,
    restored_row_fingerprint: null, expected_row_fingerprint: fz.target_row_fingerprint,
    error: null };
  try {
    sheet.getRange(fz.target_row_number, col).setValue('');
    o.cells_rolled_back = 1;
  } catch (e) {
    o.error = 'ROLLBACK_WRITE_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 160);
    return o;
  }
  var R = S1_movReadForRepair_();
  if (!R.ok) { o.error = 'ROLLBACK_READBACK_UNREADABLE:' + R.stop_reasons.join(','); return o; }
  var rec = null;
  (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec = r; });
  if (!rec) { o.error = 'ROLLBACK_READBACK_ROW_MISSING'; return o; }
  o.restored_row_fingerprint = rec.fingerprint;
  o.outcome = S1_str_(rec.fingerprint) === S1_str_(fz.target_row_fingerprint) ? 'RESTORED'
    : 'FAILED';
  if (o.outcome !== 'RESTORED') {
    o.error = 'THE_ROW_DID_NOT_RETURN_TO_ITS_FROZEN_BEFORE_FINGERPRINT';
  }
  return o;
}

// ================================================================================================================
// S1-R4H — THE CONTROLLED LEGACY TEST-ROW REMOVAL PACKAGE.
//
// R4E proved sheet row 2 cannot be repaired by writing one cell. R4F asked the rest of the database where it
// came from and R4G repaired how that answer was stated; both ended at the same place -
// OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED, because the database does not contain the answer.
//
// THE OPERATOR HAS NOW ANSWERED, AND THE ANSWER IS AN INPUT TO THIS FILE RATHER THAN A FINDING OF IT:
// the row is early test residue, it is not a ledger record, its qty and after_current_stock are not readings
// of anything, and the correct handling is a controlled REMOVAL. Nothing below re-derives that; this package
// records the classification, names who made it, and refuses to act if the row it was issued against has
// moved. A CLASSIFICATION IS ISSUED AGAINST A STATE, NOT AGAINST A ROW NUMBER - a row number still points at
// something after the row underneath it changes, which is exactly the situation an authorization must not
// survive.
//
// TWO ENTRY POINTS, AND THE READ-ONLY ONE OWNS THE EVIDENCE. Same split as R4E's backfill package and for the
// same reason: the MANIFEST measures and freezes, the REMOVAL re-measures and compares against a frozen
// expectation it did not produce. A check whose expectation comes from the thing being checked passes by
// construction.
//
// CLEARING IS NOT DELETING, AND THE DIFFERENCE IS THE WHOLE METHOD. `deleteRow` would move every row below
// the target up by one, so every frozen row number in this file - R4E's target, R4F's chronology, this
// package's own 95 remaining row fingerprints - would silently point at a different record. The physical row
// therefore SURVIVES and is emptied in place, which is why this round is the first in the file where a
// LOGICAL RECORD COUNT and a PHYSICAL ROW COUNT are two different numbers and must be reported apart:
// 96 -> 95 logical, unchanged physical.
//
// DEFAULT IS DRY RUN. `execute` must be exactly `true`; anything else, including absent and the string
// 'true', is a dry run that performs every check and writes nothing.
// ================================================================================================================

var S1_REMOVAL_CLASSIFICATION_ = 'INVALID_NON_LEDGER_ROW';
var S1_REMOVAL_OPERATOR_BASIS_ = 'CONFIRMED_EARLY_TEST_RESIDUE';

/**
 * THE OPERATOR'S DECISION, RECORDED AS AN INPUT.
 *
 * Every field here is something a person decided, not something this file measured. It is kept as data so the
 * manifest can print it, the authorization sentence can quote it and the execute path can refuse a baseline
 * that carries a different one - and so that the one thing a reader must not confuse (a classification that
 * was supplied with one that was derived) is answered by a field rather than by tone.
 *
 * `issued_against` NAMES the frozen live state rather than repeating its values. Two copies of a fingerprint
 * is two authorities, and the first thing two authorities do is disagree.
 */
var S1_REMOVAL_DECISION_ = {
  classification: S1_REMOVAL_CLASSIFICATION_,
  operator_basis: S1_REMOVAL_OPERATOR_BASIS_,
  decided_by: 'OPERATOR',
  decided_in: 'S1-R4H',
  derived_by_this_file: false,
  issued_against: 'S1_MOV_LIVE_FROZEN_ — target_row_number and target_row_fingerprint. The values are read'
    + ' from that one pin at run time and are deliberately not repeated here.',
  qty_is_not_a_delta: true,
  after_current_stock_is_not_a_balance: true,
  reading: 'The row is early test residue. Its qty and its after_current_stock are not readings of any'
    + ' balance, so neither may be interpreted as a movement delta or as a historical stock level. The'
    + ' live factory_stock row is the correct present state and it is not being changed.',
  must_not_mint_movement_id: true,
  must_not_write_movement_type: true,
  must_not_become_a_movement: 'Filling the primary key or the ledger axis would convert a row nobody can'
    + ' classify into a row the reconciliation believes — which is the SILENCING hazard R4E named. The'
    + ' correct handling is removal, and removal is the opposite of completion.'
};

/**
 * THE METHOD, AND EVERY ALTERNATIVE THAT IS REFUSED, WITH THE REASON EACH IS REFUSED FOR.
 *
 * The refusals are spelled in string values rather than as identifiers on purpose: this file's own suite
 * scans its source with comments and string literals stripped and requires that no row-deletion API appears
 * in real code at all, so naming them anywhere but inside a string would break that check - which is the
 * check working.
 */
var S1_REMOVAL_METHOD_ = {
  method: 'CLEAR_CONTENT_OF_THE_WHOLE_TARGET_ROW_RANGE',
  api: 'Range.clearContent() — one call, on one row, across every live column',
  range_shape: 'row <target_row_number>, columns 1..live_column_count',
  physical_row_survives: true,
  logical_record_leaves: true,
  refused_row_deletion: 'deleteRow / deleteRows would shift every row below the target up by one. Every'
    + ' frozen row number in this file — R4E\'s target, R4F\'s pool chronology, and this package\'s own'
    + ' 95 remaining row fingerprints — would then point at a different record, and a baseline that'
    + ' points at the wrong record is worse than no baseline.',
  refused_row_insertion: 'insertRow / insertRows would shift rows the other way, with the same effect.',
  // S1-R4J — UNCHANGED, AND NOT CONTRADICTED BY WHAT HAPPENED. This tool still performs exactly one clear
  // and still refuses to delete or insert a row. What R4J added is RECOGNITION: an operator deleted the row
  // by hand, and a diagnostic that could only recognise its own method would have called their finished work
  // a drift. Performing a deletion and accepting one are different permissions, and only the second was given.
  s1_r4j_manual_deletion: 'A row deletion performed BY A PERSON is an accepted completion shape'
    + ' (ROW_DELETED_RECORDS_SHIFTED_UP). This tool still never performs one, and never inserts a row to'
    + ' undo one — restoring a blank spacer would be writing to the ledger to make a fingerprint agree.',
  refused_reorder: 'Sorting or moving rows would change row numbers without changing any value, so the'
    + ' identity evidence would drift while every content fingerprint stayed intact.',
  refused_quarantine_table: 'A quarantine table would be a second home for a record that is not a record.'
    + ' It would also need a schema, an owner and a retention rule, none of which exist.',
  refused_new_table: 'No table is created. There is nothing to migrate and nothing to write to.',
  refused_mint_id: 'No primary key is minted. R4E\'s deterministic id path exists and is deliberately NOT'
    + ' reachable from here: a removed row must not first be given an identity.',
  refused_fill_movement_type: 'No ledger axis is written. See S1_REMOVAL_DECISION_.must_not_become_a_movement.',
  counts_note: 'A LOGICAL RECORD COUNT AND A PHYSICAL ROW COUNT ARE TWO DIFFERENT COUNTS. The full-row read'
    + ' skips a row whose every live cell is blank, so the logical movement record count falls 96 -> 95'
    + ' while the sheet keeps exactly as many physical rows as it had. Both are reported, apart.'
};

/** The protected surfaces: tables this removal must be able to prove it did not touch. An ABSENT table is a
 *  STATE, not a zero — it is frozen as absent and must still be absent afterwards. */
var S1_REMOVAL_PROTECTED_TABLES_ = [
  'factory_stock',
  'shipping_allocation_drafts',
  'shipping_allocation_draft_lines',
  'shipping_plans',
  'shipping_plan_lines',
  'shipments',
  'shipment_lines',
  'reservations'
];

/** The fields a removal baseline MUST carry. An incomplete freeze is a hole a readback cannot see through,
 *  so it is refused at freeze time rather than discovered at execute time. */
var S1_REMOVAL_FREEZE_REQUIRED_ = [
  'frozen_at', 'build', 'table', 'sheet_name',
  'live_column_count', 'named_column_count', 'live_columns', 'header_fingerprint',
  'table_combined_fingerprint',
  'logical_movement_record_count', 'physical_last_row',
  'non_blank_id_count', 'valid_id_count', 'blank_id_count', 'duplicate_id_count',
  'wrong_type_id_count', 'outside_named_column_row_count',
  'target_row_number', 'target_range_a1', 'target_range_cell_count',
  'target_row_fingerprint', 'target_row_occurrences', 'target_row_cells',
  'target_non_blank_cell_count', 'target_id_column', 'target_movement_id_is_blank',
  'target_movement_type_is_blank',
  'classification', 'operator_basis', 'classification_issued_against',
  'remaining_record_count', 'remaining_ids', 'remaining_id_universe_fingerprint',
  'remaining_row_fingerprint_map_fingerprint',
  'pool_table', 'pool_warehouse_id', 'pool_sku', 'pool_fac_current_stock',
  'pool_fac_reserved_stock', 'pool_row_fingerprint', 'pool_table_combined_fingerprint',
  'protected_surfaces', 'protected_surface_fingerprint',
  'flag_value', 'allowlist_count', 'allowlist_fingerprint', 'deployment_build',
  'expected_after', 'authorization_wording'
];

/** A1 column letter for a 1-based column index. Spelled out because the range this package clears is named
 *  in the authorization a person signs, and 'columns 1 to 15' is not what they will see on screen. */
function S1_remColLetter_(n) {
  var k = Number(n);
  if (!isFinite(k) || k < 1) return null;
  k = Math.floor(k);
  var s = '';
  while (k > 0) {
    var r = (k - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    k = Math.floor((k - 1) / 26);
  }
  return s;
}

/** The one range this package may touch, in the notation the operator will see in the sheet. */
function S1_remRangeA1_(rowNumber, liveColumnCount) {
  var last = S1_remColLetter_(liveColumnCount);
  if (last === null || !isFinite(Number(rowNumber))) return null;
  return 'A' + String(rowNumber) + ':' + last + String(rowNumber);
}

/** How many of a frozen row's cells actually hold something. The clear touches every cell in the range; only
 *  these CHANGE. Touched and changed are different numbers and the package publishes both, because a range
 *  write's blast radius is the range rather than the cells that happened to differ. */
function S1_remNonBlankCellCount_(cells) {
  var n = 0;
  (cells || []).forEach(function (c) { if (S1_str_(c.canonical) !== '~') n++; });
  return n;
}

/** The fingerprint the target row WILL have once every live cell is empty. Computed from the live header, so
 *  a column append changes it rather than leaving a stale expectation that still passes. */
function S1_remBlankRowFingerprint_(liveColumns) {
  var blanks = (liveColumns || []).map(function () { return ''; });
  return S1_rowFingerprint_(liveColumns, blanks);
}

/** How many rows in the table carry the target's fingerprint. A removal authorized against a fingerprint that
 *  matches two rows is a removal that cannot say which row it removed. */
function S1_remFingerprintOccurrences_(t, fingerprint) {
  var n = 0;
  (t.rows || []).forEach(function (r) { if (S1_str_(r.fingerprint) === S1_str_(fingerprint)) n++; });
  return n;
}

/**
 * The 95 records that must survive, byte for byte AND row number for row number.
 *
 * `row_fingerprint_map_fingerprint` hashes `row_number~row_fingerprint` pairs, so it is one value that
 * refuses BOTH an edited cell and a moved row. A fingerprint over content alone would let a reorder pass;
 * that is precisely the failure the clear-instead-of-delete method exists to prevent, so the check has to be
 * able to see it.
 */
function S1_remRemaining_(t, idKey, targetRowNumber) {
  var ids = [], pairs = [], detail = [];
  (t.rows || []).forEach(function (r) {
    if (r.row_number === targetRowNumber) return;
    var id = S1_str_(r[idKey]);
    ids.push(id);
    pairs.push(String(r.row_number) + '~' + S1_str_(r.fingerprint));
    detail.push({ row_number: r.row_number, id: id, row_fingerprint: r.fingerprint });
  });
  return { count: ids.length, ids: ids,
    id_universe_fingerprint: S1_fingerprint_(ids),
    row_fingerprint_map_fingerprint: S1_fingerprint_(pairs),
    row_fingerprints: detail };
}

/**
 * The table fingerprint the sheet WILL have after the clear — not "it will change", but the exact value.
 *
 * S1_fullRowTable_ builds its combined fingerprint from one `id~row_fingerprint` signature per non-blank row,
 * so dropping the target's signature reproduces the AFTER value exactly. An expectation that says only "this
 * must differ" is satisfied by any damage at all.
 */
function S1_remExpectedAfterCombined_(t, idKey, targetRowNumber) {
  var sig = [];
  (t.rows || []).forEach(function (r) {
    if (r.row_number === targetRowNumber) return;
    sig.push(S1_str_(r[idKey]) + '~' + S1_str_(r.fingerprint));
  });
  return S1_fingerprint_(sig);
}

/** The pool row this removal must leave alone, and the whole table it sits in. */
function S1_remPoolObservation_(ss, warehouseId, sku) {
  var o = { table: 'factory_stock', warehouse_id: S1_str_(warehouseId), sku: S1_str_(sku),
    present: false, readable: false, row_found: false,
    fac_current_stock: null, fac_reserved_stock: null,
    row_fingerprint: null, table_row_count: null, table_combined_fingerprint: null };
  var t = S1_fullRowTable_(ss, 'factory_stock', null, ['warehouse_id', 'sku']);
  o.present = t.present;
  o.readable = t.readable;
  if (!t.present || !t.readable) return o;
  o.table_row_count = t.row_count;
  o.table_combined_fingerprint = t.combined_fingerprint;
  var rec = null;
  (t.rows || []).forEach(function (r) {
    if (S1_str_(r.warehouse_id) === o.warehouse_id && S1_str_(r.sku) === o.sku) rec = r;
  });
  if (!rec) return o;
  o.row_found = true;
  o.fac_current_stock = S1_qty_(S1_cellOf_(rec, 'fac_current_stock'));
  o.fac_reserved_stock = S1_qty_(S1_cellOf_(rec, 'fac_reserved_stock'));
  o.row_fingerprint = rec.fingerprint;
  return o;
}

/** Every protected surface, as a state plus a shape plus a content fingerprint, and one fingerprint over all
 *  of them so a single comparison can refuse a change on any one. */
function S1_remProtectedSurfaces_(ss) {
  var rows = [], sig = [];
  S1_REMOVAL_PROTECTED_TABLES_.forEach(function (name) {
    var t = S1_fullRowTable_(ss, name, null, []);
    var state = !t.present ? 'SHEET_ABSENT'
      : (t.readable ? 'SHEET_PRESENT_AND_READABLE' : 'SHEET_PRESENT_BUT_UNREADABLE');
    var e = { table: name, state: state,
      row_count: (t.present && t.readable) ? t.row_count : null,
      live_column_count: t.live_column_count,
      combined_fingerprint: (t.present && t.readable) ? t.combined_fingerprint : null };
    rows.push(e);
    sig.push(name + '~' + state + '~' + S1_rowCountPhrase_(e.row_count) + '~'
      + S1_str_(e.combined_fingerprint));
  });
  return { surfaces: rows, fingerprint: S1_fingerprint_(sig), table_count: rows.length };
}

/** The flag, the allowlist and the deployment build, frozen so the postcondition can say they did not move.
 *  The allowlist is fingerprinted over four-part scope keys rather than over an object, because a key order
 *  change is not a change to the allowlist. */
function S1_remControlSurface_() {
  var env = S1_environment_();
  var keys = [];
  (env.allowlist || []).forEach(function (e) {
    keys.push(S1_scopeKey_(e && e.company, e && e.country, e && e.marketplace, e && e.sku));
  });
  return { flag_present: env.flag_present, flag_value: env.flag_value,
    allowlist_present: env.allowlist_present,
    allowlist_count: env.allowlist ? env.allowlist.length : null,
    allowlist_scope_keys: keys, allowlist_fingerprint: S1_fingerprint_(keys),
    deployment_build: env.deployment ? env.deployment.deployment_build : null,
    deployment_readable: env.deployment ? env.deployment.readable : null };
}

/** The live expectation this package holds the sheet to. Derived from R4F's one pin and extended with the two
 *  facts R4H adds — the pool balance the operator stated and the logical record count. Extended rather than
 *  copied: a second table of the same live numbers would be a second authority. */
function S1_remLiveExpect_() {
  var e = {};
  Object.keys(S1_MOV_LIVE_FROZEN_).forEach(function (k) { e[k] = S1_MOV_LIVE_FROZEN_[k]; });
  e.logical_movement_record_count = S1_MOV_LIVE_FROZEN_.row_count;
  e.pool_fac_current_stock = 2210;
  e.pool_fac_reserved_stock = 0;
  e.target_movement_id_is_blank = true;
  e.authority = S1_MOV_LIVE_FROZEN_.authority
    + '; the pool balance and the record count are the operator\'s S1-R4H statement of the live sheet';
  return e;
}

/** The sentence a person signs. Built only from frozen, measured values — never from a default. */
function S1_remAuthWording_(fz) {
  if (!fz) return null;
  return 'I authorize ONE controlled removal of ONE legacy test row from table ' + fz.table
    + ' in the operation database.'
    + ' THE ROW: sheet row ' + fz.target_row_number + ', full-row fingerprint '
    + S1_str_(fz.target_row_fingerprint) + ', sku ' + S1_str_(fz.pool_sku)
    + ', warehouse_id ' + S1_str_(fz.pool_warehouse_id) + '.'
    + ' THE OPERATOR CLASSIFICATION: ' + S1_str_(fz.classification) + ', on the basis '
    + S1_str_(fz.operator_basis) + '. This classification was decided by a person and is an INPUT to the'
    + ' diagnostic; the diagnostic did not derive it.'
    + ' THE METHOD: clear the content of range ' + S1_str_(fz.target_range_a1) + ' — '
    + fz.target_range_cell_count + ' cells touched, of which ' + fz.target_non_blank_cell_count
    + ' currently hold a value and will change. NO row is deleted, inserted, moved or reordered; the'
    + ' physical sheet row survives and is left empty.'
    + ' NOTHING IS COMPLETED: no movement id is minted, no movement_type is written, and the row does not'
    + ' become a movement.'
    + ' THE TABLE BEFORE: ' + fz.logical_movement_record_count + ' logical movement records, '
    + fz.valid_id_count + ' valid ids, ' + fz.blank_id_count + ' blank id, '
    + fz.duplicate_id_count + ' duplicate ids, ' + fz.wrong_type_id_count + ' wrong-typed ids,'
    + ' header fingerprint ' + S1_str_(fz.header_fingerprint) + ', table fingerprint '
    + S1_str_(fz.table_combined_fingerprint) + ', over ' + fz.live_column_count + ' live columns.'
    + ' THE TABLE AFTER: ' + fz.expected_after.logical_movement_record_count
    + ' logical movement records, ' + fz.expected_after.valid_id_count + ' valid ids, '
    + fz.expected_after.blank_id_count + ' blank id, table fingerprint '
    + S1_str_(fz.expected_after.table_combined_fingerprint) + '. The remaining '
    + fz.remaining_record_count + ' records keep every identity and every row number: id universe '
    + S1_str_(fz.remaining_id_universe_fingerprint) + ', row-number map '
    + S1_str_(fz.remaining_row_fingerprint_map_fingerprint) + '.'
    + ' WHAT MUST NOT CHANGE: factory_stock ' + S1_str_(fz.pool_sku) + ' at '
    + S1_str_(fz.pool_warehouse_id) + ' stays fac_current_stock ' + fz.pool_fac_current_stock
    + ' and fac_reserved_stock ' + fz.pool_fac_reserved_stock + ' (row fingerprint '
    + S1_str_(fz.pool_row_fingerprint) + ', table fingerprint '
    + S1_str_(fz.pool_table_combined_fingerprint) + '); the ' + fz.protected_surfaces.length
    + ' protected surfaces stay at fingerprint ' + S1_str_(fz.protected_surface_fingerprint) + ';'
    + ' the generation flag stays ' + String(fz.flag_value) + ', the activation allowlist stays '
    + fz.allowlist_count + ' entry at ' + S1_str_(fz.allowlist_fingerprint)
    + ', and the build stays ' + S1_str_(fz.build) + '.'
    + ' IF ANY POSTCONDITION FAILS the same fifteen cells are restored from the frozen BEFORE under the same'
    + ' lock and the restoration is verified against fingerprint ' + S1_str_(fz.target_row_fingerprint)
    + '; the clear is never attempted a second time.';
}

/** Every fact the sentence must carry, looked for by a needle built from the FROZEN value — so a sentence
 *  that quotes a different number fails rather than reads well. */
function S1_remWordingAudit_(w, fz) {
  var text = S1_str_(w);
  var need = [
    ['table', fz.table],
    ['target_row_number', 'sheet row ' + fz.target_row_number],
    ['target_row_fingerprint', fz.target_row_fingerprint],
    ['sku', fz.pool_sku],
    ['warehouse_id', fz.pool_warehouse_id],
    ['classification', fz.classification],
    ['operator_basis', fz.operator_basis],
    ['target_range_a1', fz.target_range_a1],
    ['cells_touched', String(fz.target_range_cell_count) + ' cells touched'],
    ['cells_changed', String(fz.target_non_blank_cell_count) + ' currently hold a value'],
    ['no_row_deleted', 'NO row is deleted'],
    ['no_id_minted', 'no movement id is minted'],
    ['no_movement_type', 'no movement_type is written'],
    ['records_before', String(fz.logical_movement_record_count) + ' logical movement records'],
    ['records_after', String(fz.expected_after.logical_movement_record_count) + ' logical movement records'],
    ['header_fingerprint', fz.header_fingerprint],
    ['table_fingerprint_before', fz.table_combined_fingerprint],
    ['table_fingerprint_after', fz.expected_after.table_combined_fingerprint],
    ['remaining_count', String(fz.remaining_record_count) + ' records keep every identity'],
    ['remaining_id_fingerprint', fz.remaining_id_universe_fingerprint],
    ['remaining_row_map_fingerprint', fz.remaining_row_fingerprint_map_fingerprint],
    ['pool_current', 'fac_current_stock ' + fz.pool_fac_current_stock],
    ['pool_reserved', 'fac_reserved_stock ' + fz.pool_fac_reserved_stock],
    ['pool_row_fingerprint', fz.pool_row_fingerprint],
    ['protected_surface_fingerprint', fz.protected_surface_fingerprint],
    ['flag_value', 'generation flag stays ' + String(fz.flag_value)],
    ['allowlist_fingerprint', fz.allowlist_fingerprint],
    ['build', fz.build],
    ['rollback', 'restored from the frozen BEFORE under the same lock'],
    ['no_retry', 'never attempted a second time']
  ];
  var missing = [];
  need.forEach(function (n) {
    if (!S1_needleFound_(text, n[1])) missing.push(n[0]);
  });
  return { required_item_count: need.length, missing: missing, bytes: text.length };
}

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST(opts) — READ ONLY.
 *
 * Re-measures the deployment, the flag, the allowlist, the movement table, the target row, the 95 records
 * that must survive, the factory pool and every protected surface; confirms that the state the operator's
 * classification was issued against is still the state on the sheet; states the exact AFTER; and freezes a
 * baseline plus the sentence a person signs.
 *
 * IT WRITES NOTHING, AND IT FREEZES NOTHING UNLESS EVERY PREDICATE PASSES. A drift is a STOP: the previous
 * run's numbers are never carried forward, because a baseline assembled from two different states describes
 * no state at all.
 *
 * `opts.expect` replaces the frozen live expectation and is REPORTED as caller-supplied — the same seam R4F
 * uses, so the suite can drive a world it built while a bare live run stays pinned to the operator's freeze.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_MANIFEST(opts) {
  opts = opts || {};
  var out = {
    manifest: 'S1 FACTORY MOVEMENT LEGACY TEST-ROW REMOVAL — read-only measurement, confirmation and freeze',
    build: S1_BUILD_, dry_run: true, read_only: true,
    writes: 0, writer_calls: 0, cells_written: 0, cells_cleared: 0, cells_restored: 0,
    ids_minted: 0, movement_types_written: 0,
    rows_modified: 0, rows_added: 0, rows_removed: 0, rows_reordered: false,
    tables_created: 0, migration_called: false, gap_job_called: false,
    generate_called: false, submit_called: false, factory_writer_called: false,
    tables_touched: [],
    measured_at: null,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    method: S1_REMOVAL_METHOD_, operator_decision: S1_REMOVAL_DECISION_,
    expectation_source: null, expected: null,
    live_state_confirmation: null, live_state_confirmed: null,
    live_column_count: null, named_column_count: null, live_columns: [],
    header_fingerprint: null, table_combined_fingerprint: null,
    logical_movement_record_count: null, physical_last_row: null,
    non_blank_id_count: null, valid_id_count: null, blank_id_count: null,
    duplicate_id_count: null, wrong_type_id_count: null, outside_named_column_row_count: null,
    target: null, remaining: null, pool: null, protected_surfaces: null, control_surface: null,
    classification: S1_REMOVAL_CLASSIFICATION_, operator_basis: S1_REMOVAL_OPERATOR_BASIS_,
    classification_applies: null, classification_issued_against: null,
    expected_after: null, frozen_before: null, authorization_wording: null, wording_audit: null,
    completion: null, next_decision: null,
    verdict: 'STOP', stop_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [] };
  var L = S1_ledger_();
  function stop(r) { if (out.stop_reasons.indexOf(r) === -1) out.stop_reasons.push(r); }

  var EXP = opts.expect ? opts.expect : S1_remLiveExpect_();
  out.expectation_source = opts.expect
    ? 'CALLER_SUPPLIED — NOT the operator\'s frozen live state. This run is pinned to an expectation the'
      + ' caller provided, which is stated here so it can never be mistaken for the live freeze.'
    : 'THE_OPERATOR_FROZEN_LIVE_STATE (S1_MOV_LIVE_FROZEN_, extended by S1_remLiveExpect_)';
  out.expected = EXP;

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    if (out.stop_reasons.length || L.failed.length) out.verdict = 'STOP';
    // A REFUSED MANIFEST FREEZES NOTHING AND SIGNS NOTHING. The baseline and the sentence are the same
    // authorization by two routes, so both go together.
    if (out.verdict !== 'READY_TO_AUTHORIZE_REMOVAL') {
      out.frozen_before = null;
      out.authorization_wording = null;
      if (!out.next_decision) {
        out.next_decision = 'NOTHING IS AUTHORIZED. Fix the failed condition(s) and re-run the manifest;'
          + ' no value from this run may be pasted into a removal.';
      }
    }
    S1_log_('s1_mov_removal_manifest_verdict', JSON.stringify({
      build: out.build, verdict: out.verdict, table: out.table,
      expectation_source: S1_cap_(out.expectation_source, 90),
      live_state_confirmed: out.live_state_confirmed,
      classification: out.classification, operator_basis: out.operator_basis,
      classification_applies: out.classification_applies,
      target_row: out.target ? out.target.row_number : null,
      target_range: out.target ? out.target.range_a1 : null,
      cells_touched: out.target ? out.target.range_cell_count : null,
      cells_that_change: out.target ? out.target.non_blank_cell_count : null,
      logical_records_before: out.logical_movement_record_count,
      logical_records_after: out.expected_after ? out.expected_after.logical_movement_record_count : null,
      remaining: out.remaining ? out.remaining.count : null,
      pool_current: out.pool ? out.pool.fac_current_stock : null,
      pool_reserved: out.pool ? out.pool.fac_reserved_stock : null,
      writes: out.writes, cells_cleared: out.cells_cleared, ids_minted: out.ids_minted,
      rows_removed: out.rows_removed, rows_reordered: out.rows_reordered,
      frozen: !!out.frozen_before, authorization_present: !!out.authorization_wording,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12), stop_reasons: out.stop_reasons.slice(0, 12),
      next_decision: S1_cap_(out.next_decision, 300) }));
    if (out.verdict === 'READY_TO_AUTHORIZE_REMOVAL' && out.frozen_before) {
      S1_emitChunked_('s1_mov_removal_manifest_freeze_paste_block',
        JSON.stringify(out.frozen_before));
      S1_emitChunked_('s1_mov_removal_manifest_authorization', out.authorization_wording);
      S1_log_('s1_mov_removal_manifest_freeze_meta', JSON.stringify({
        paste_into: 'the `frozen` argument of RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL',
        authorization_into: 'the `authorization` argument of the same call',
        s1_manifest_p_before: 'UNRELATED — this baseline is NOT pasted into S1_MANIFEST_P_BEFORE_, which'
          + ' belongs to the generation manifest and stays null.',
        note: 'Concatenate the chunks IN ORDER. The removal defaults to a DRY RUN and needs both.' }));
    } else {
      S1_log_('s1_mov_removal_manifest_freeze_withheld', JSON.stringify({
        verdict: out.verdict, chunks: 0, frozen: false, authorization_present: false,
        reason: 'NOTHING_MAY_BE_AUTHORIZED_ON_A_' + out.verdict,
        note: 'No baseline and no authorization were produced, so the removal has nothing to consume.' }));
    }
    return out;
  }

  try {
    out.measured_at = (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : null;

    // ---- §2.1 THE BUILD. An expectation frozen against another build is not this build's evidence. ----
    L.P('the_build_matches_the_frozen_expectation', EXP.build, S1_BUILD_, S1_BUILD_ === EXP.build);
    if (S1_BUILD_ !== EXP.build) { stop('BUILD_DRIFTED'); return fin(); }

    // ---- §2.2 THE CONTROL SURFACE: the flag must be false and the allowlist must be the one entry. ----
    var ctl = S1_remControlSurface_();
    out.control_surface = ctl;
    L.P('the_generation_flag_is_readable_and_false', false, ctl.flag_value, ctl.flag_value === false);
    if (ctl.flag_value !== false) { stop('THE_GENERATION_FLAG_IS_NOT_FALSE'); }
    L.P('the_activation_allowlist_is_readable_and_holds_exactly_one_scope', 1, ctl.allowlist_count,
      ctl.allowlist_count === 1);
    if (ctl.allowlist_count !== 1) { stop('THE_ALLOWLIST_IS_NOT_A_SINGLE_SCOPE'); }
    // COULD A GENERATION BE WRITING TO THIS POOL WHILE THE REMOVAL RUNS? That takes BOTH an allowlisted
    // scope AND the flag, so it is asked as one question rather than two. The allowlist entry on its own
    // authorizes nothing while the flag is false, and refusing a removal for it would be refusing on a
    // fact that cannot act - the same over-reach as treating a measured-and-neutral reading as a fault.
    var allowKeys = ctl.allowlist_scope_keys || [];
    var targetSkuAllowed = false;
    allowKeys.forEach(function (k) {
      if (String(k).split('|')[3] === S1_str_(EXP.pool_sku)) targetSkuAllowed = true;
    });
    ctl.target_sku_is_on_the_activation_allowlist = targetSkuAllowed;
    ctl.concurrent_generation_possible = targetSkuAllowed === true && ctl.flag_value === true;
    ctl.concurrency_note = 'A generation could only touch this pool if the sku were allowlisted AND the'
      + ' flag were true. The allowlist membership is published either way, because a person reading a'
      + ' removal authorization should be able to see it rather than infer it from a silence.';
    L.P('no_generation_could_be_writing_to_this_pool_while_the_removal_runs', false,
      ctl.concurrent_generation_possible, ctl.concurrent_generation_possible === false);
    if (ctl.concurrent_generation_possible) { stop('A_GENERATION_COULD_BE_WRITING_TO_THIS_POOL'); }

    // ---- §2.3 THE MOVEMENT TABLE, THROUGH THE SAME READ AUTHORITY THE OTHER TWO PACKAGES USE. ----
    var R = S1_movReadForRepair_();
    L.P('the_movement_table_was_read_through_the_shared_read_authority', [], R.stop_reasons,
      R.ok === true && R.stop_reasons.length === 0);
    if (!R.ok) { R.stop_reasons.forEach(stop); return fin(); }
    out.tables_touched = [];
    out.live_columns = R.live_columns;
    out.live_column_count = R.live_column_count;
    out.named_column_count = R.named_column_count;
    out.header_fingerprint = R.header_fingerprint;
    out.table_combined_fingerprint = R.table_combined_fingerprint;
    out.logical_movement_record_count = R.integrity.row_count;
    out.non_blank_id_count = R.integrity.ok_count;
    out.blank_id_count = R.integrity.blank_id_count;
    out.duplicate_id_count = R.integrity.duplicate_id_count;
    out.wrong_type_id_count = R.integrity.wrong_type_id_count;
    out.outside_named_column_row_count = R.integrity.outside_named_columns_count;
    out.valid_id_count = R.integrity.ok_count - R.integrity.duplicate_id_count
      - R.integrity.wrong_type_id_count;
    var lastRow = null;
    try { lastRow = R.sheet.getLastRow(); } catch (e0) { lastRow = null; }
    out.physical_last_row = lastRow;
    L.P('the_physical_last_row_was_measurable', 'a number', lastRow, typeof lastRow === 'number');
    if (typeof lastRow !== 'number') { stop('PHYSICAL_ROW_EXTENT_NOT_MEASURABLE'); return fin(); }

    // ---- S1-R4J §2.3b THE REMOVAL MAY ALREADY BE DONE, AND "DRIFT" IS THE WRONG WORD FOR THAT. ----
    // Asked BEFORE the frozen comparisons, because on a completed removal every one of them is legitimately
    // false — the residue is gone, so the BEFORE table fingerprint cannot match — and reporting that as
    // LIVE_STATE_DRIFTED tells an operator their table is damaged when it is finished. Worse, it invites the
    // repair that must not happen: putting a blank row back so the old numbers agree again.
    //
    // This branch freezes nothing and authorizes nothing. It is the manifest declining to re-open a closed
    // job, and pointing at the read-only acceptance manifest instead.
    var doneChk = S1_movRemovalAlreadyComplete_(R, lastRow, EXP);
    out.completion = doneChk;
    if (doneChk.complete === true) {
      out.verdict = 'REMOVAL_ALREADY_COMPLETE';
      L.P('a_completed_removal_is_reported_as_complete_and_never_as_drift', true, true, true);
      L.P('a_completed_removal_freezes_nothing_and_authorizes_nothing',
        { frozen: null, authorization: null },
        { frozen: out.frozen_before, authorization: out.authorization_wording },
        out.frozen_before === null && out.authorization_wording === null);
      out.next_decision = 'NOTHING TO AUTHORIZE. The legacy test row is already gone ('
        + doneChk.completion_shape + '), leaving ' + S1_str_(doneChk.logical_movement_record_count)
        + ' logical records. Run RUN_S1_FACTORY_MOVEMENT_POST_MANUAL_DELETION_ACCEPTANCE_MANIFEST to accept'
        + ' the current state on its own evidence, then a FRESH RUN_S1_MANIFEST_P. Do NOT insert a blank'
        + ' row, do NOT restore the old physical extent, and do NOT re-run a removal.';
      return fin();
    }

    // ---- §2.4 EVERY FROZEN FACT, ITEM BY ITEM. ----
    var conf = [];
    function confirm(name, expected, observed) {
      var okv = S1_str_(expected) === S1_str_(observed);
      conf.push({ what: name, expected: expected, observed: observed, confirmed: okv });
      L.P('the_live_state_still_matches_the_frozen_' + name, expected, observed, okv);
      if (!okv) stop('LIVE_STATE_DRIFTED:' + name);
      return okv;
    }
    confirm('header_fingerprint', EXP.header_fingerprint, R.header_fingerprint);
    confirm('table_combined_fingerprint', EXP.table_combined_fingerprint, R.table_combined_fingerprint);
    confirm('logical_movement_record_count', EXP.logical_movement_record_count, R.integrity.row_count);
    confirm('valid_id_count', EXP.valid_id_count, out.valid_id_count);
    confirm('blank_id_count', EXP.blank_id_count, R.integrity.blank_id_count);
    confirm('duplicate_id_count', EXP.duplicate_id_count, R.integrity.duplicate_id_count);
    confirm('wrong_type_id_count', EXP.wrong_type_id_count, R.integrity.wrong_type_id_count);
    confirm('outside_named_column_row_count', EXP.outside_named_column_row_count,
      R.integrity.outside_named_columns_count);

    // ---- §2.5 THE TARGET ROW: present, unique, and still the row the classification was issued against. --
    var rec = null;
    (R.t.rows || []).forEach(function (r) { if (r.row_number === EXP.target_row_number) rec = r; });
    L.P('the_target_row_is_present_at_the_frozen_row_number', EXP.target_row_number,
      rec ? rec.row_number : null, rec !== null);
    if (!rec) { stop('TARGET_ROW_MISSING_AT_THE_FROZEN_ROW_NUMBER'); return fin(); }
    confirm('target_row_fingerprint', EXP.target_row_fingerprint, rec.fingerprint);
    var occ = S1_remFingerprintOccurrences_(R.t, rec.fingerprint);
    L.P('the_target_row_fingerprint_identifies_exactly_one_row', 1, occ, occ === 1);
    if (occ !== 1) { stop('THE_TARGET_ROW_IS_NOT_UNIQUE:' + occ + '_ROWS_SHARE_ITS_FINGERPRINT'); }
    var idBlank = S1_canonCell_(S1_cellOf_(rec, R.id_column)) === '~';
    var mtBlank = S1_canonCell_(S1_cellOf_(rec, 'movement_type')) === '~';
    L.P('the_target_movement_id_is_still_blank', EXP.target_movement_id_is_blank, idBlank,
      idBlank === EXP.target_movement_id_is_blank);
    if (idBlank !== EXP.target_movement_id_is_blank) {
      // A ROW THAT HAS ACQUIRED A KEY IS A DIFFERENT ROW TO REMOVE. This is also the interlock against
      // R4E's backfill: if that path has run, this classification no longer describes what is on the sheet.
      stop('THE_TARGET_ROW_HAS_ACQUIRED_A_PRIMARY_KEY_SINCE_THE_CLASSIFICATION_WAS_ISSUED');
    }
    L.P('the_target_movement_type_is_still_blank', EXP.target_movement_type_is_blank, mtBlank,
      mtBlank === EXP.target_movement_type_is_blank);
    if (mtBlank !== EXP.target_movement_type_is_blank) {
      stop('THE_TARGET_ROW_HAS_ACQUIRED_A_LEDGER_AXIS_SINCE_THE_CLASSIFICATION_WAS_ISSUED');
    }
    var pWh = S1_str_(S1_cellOf_(rec, 'warehouse_id')), pSku = S1_str_(S1_cellOf_(rec, 'sku'));
    confirm('pool_warehouse_id', EXP.pool_warehouse_id, pWh);
    confirm('pool_sku', EXP.pool_sku, pSku);
    out.live_state_confirmation = conf;
    out.live_state_confirmed = conf.filter(function (c) { return !c.confirmed; }).length === 0;

    // THE CLASSIFICATION APPLIES TO A STATE. Recorded as its own answer rather than folded into the drift
    // list, because 'the sheet moved' and 'the decision no longer describes this row' are different facts.
    out.classification_issued_against = { table: S1_FACTORY_MOVEMENT_TABLE_,
      row_number: EXP.target_row_number, row_fingerprint: EXP.target_row_fingerprint,
      authority: out.expectation_source };
    out.classification_applies = out.live_state_confirmed === true
      && S1_str_(rec.fingerprint) === S1_str_(EXP.target_row_fingerprint) && occ === 1;
    L.P('the_operator_classification_still_describes_the_row_on_the_sheet', true,
      out.classification_applies, out.classification_applies === true);

    var cells = S1_movRowCells_(rec, R.live_columns);
    var rangeA1 = S1_remRangeA1_(rec.row_number, R.live_column_count);
    var nonBlank = S1_remNonBlankCellCount_(cells);
    out.target = { row_number: rec.row_number, range_a1: rangeA1,
      range_cell_count: R.live_column_count, non_blank_cell_count: nonBlank,
      row_fingerprint: rec.fingerprint, occurrences: occ,
      id_column: R.id_column, movement_id_is_blank: idBlank, movement_type_is_blank: mtBlank,
      warehouse_id: pWh, sku: pSku, cells: cells,
      note: 'range_cell_count is what the clear TOUCHES; non_blank_cell_count is what it CHANGES. They are'
        + ' different numbers and a report that gave only one of them would be describing a different'
        + ' operation than the one being authorized.' };
    L.P('the_target_range_is_one_row_across_every_live_column', 'A1 over ' + R.live_column_count
      + ' columns on row ' + rec.row_number, rangeA1, rangeA1 !== null);
    if (rangeA1 === null) { stop('TARGET_RANGE_NOT_EXPRESSIBLE'); return fin(); }
    L.P('every_frozen_cell_of_the_target_row_was_captured', R.live_column_count, cells.length,
      cells.length === R.live_column_count);

    // ---- §2.6 THE 95 THAT MUST SURVIVE. ----
    var rem = S1_remRemaining_(R.t, R.id_column, rec.row_number);
    out.remaining = rem;
    L.P('the_surviving_record_count_is_the_table_minus_the_one_target',
      R.integrity.row_count - 1, rem.count, rem.count === R.integrity.row_count - 1);
    var blankAmongRemaining = rem.ids.filter(function (i) { return S1_str_(i) === ''; }).length;
    L.P('no_surviving_record_is_missing_its_primary_key', 0, blankAmongRemaining,
      blankAmongRemaining === 0);
    if (blankAmongRemaining !== 0) { stop('A_SURVIVING_RECORD_HAS_NO_PRIMARY_KEY'); }
    L.P('the_surviving_identities_are_the_valid_id_population', out.valid_id_count, rem.count,
      rem.count === out.valid_id_count);

    // ---- §2.7 THE POOL AND THE PROTECTED SURFACES. ----
    var pool = S1_remPoolObservation_(R.ss, pWh, pSku);
    out.pool = pool;
    L.P('the_factory_pool_row_for_this_sku_is_readable', true, pool.row_found, pool.row_found === true);
    if (!pool.row_found) { stop('FACTORY_POOL_ROW_NOT_FOUND'); return fin(); }
    confirm('pool_fac_current_stock', EXP.pool_fac_current_stock, pool.fac_current_stock);
    confirm('pool_fac_reserved_stock', EXP.pool_fac_reserved_stock, pool.fac_reserved_stock);
    // THE POOL IS EVIDENCE OF THE PRESENT, NOT OF THE TARGET ROW. R4G established that the live balance
    // reconciles a LATER ledger epoch, so it says nothing about row 2 - and it is frozen here for exactly
    // one purpose: to prove afterwards that the removal did not touch it.
    out.pool.role = 'FROZEN_TO_PROVE_IT_DID_NOT_CHANGE. It is not evidence about the target row: R4G'
      + ' measured that this balance reconciles a later ledger epoch and is not attributable to row '
      + rec.row_number + '.';
    var prot = S1_remProtectedSurfaces_(R.ss);
    out.protected_surfaces = prot;
    L.P('every_protected_surface_was_observed', S1_REMOVAL_PROTECTED_TABLES_.length, prot.table_count,
      prot.table_count === S1_REMOVAL_PROTECTED_TABLES_.length);
    var unreadable = prot.surfaces.filter(function (s) {
      return s.state === 'SHEET_PRESENT_BUT_UNREADABLE'; }).map(function (s) { return s.table; });
    L.P('no_protected_surface_is_present_but_unreadable', [], unreadable, unreadable.length === 0);
    if (unreadable.length) { stop('PROTECTED_SURFACE_UNREADABLE:' + unreadable.join(',')); }

    // ---- §2.8 THE EXACT AFTER. Not "it will change" — the value it will change TO. ----
    var afterCombined = S1_remExpectedAfterCombined_(R.t, R.id_column, rec.row_number);
    var blankFp = S1_remBlankRowFingerprint_(R.live_columns);
    L.P('the_expected_after_table_fingerprint_was_computed_and_differs_from_the_before_one',
      'a fingerprint that is not the BEFORE one',
      { before: R.table_combined_fingerprint, after: afterCombined },
      afterCombined !== null && afterCombined !== R.table_combined_fingerprint);
    L.P('the_expected_after_target_row_fingerprint_is_the_all_blank_row',
      'a fingerprint that is not the BEFORE one', { before: rec.fingerprint, after: blankFp },
      blankFp !== null && blankFp !== rec.fingerprint);
    out.expected_after = {
      logical_movement_record_count: R.integrity.row_count - 1,
      physical_last_row: lastRow,
      physical_rows_removed: 0, rows_added: 0, rows_reordered: false,
      non_blank_id_count: out.non_blank_id_count,
      valid_id_count: out.valid_id_count,
      blank_id_count: 0, duplicate_id_count: 0, wrong_type_id_count: 0,
      id_fault_count: 0,
      outside_named_column_row_count: out.outside_named_column_row_count,
      header_fingerprint: out.header_fingerprint,
      table_combined_fingerprint: afterCombined,
      target_row_is_a_logical_record: false,
      target_row_all_blank: true,
      target_row_raw_fingerprint: blankFp,
      cells_touched: R.live_column_count,
      cells_changed: nonBlank,
      remaining_record_count: rem.count,
      remaining_id_universe_fingerprint: rem.id_universe_fingerprint,
      remaining_row_fingerprint_map_fingerprint: rem.row_fingerprint_map_fingerprint,
      pool_fac_current_stock: pool.fac_current_stock,
      pool_fac_reserved_stock: pool.fac_reserved_stock,
      pool_row_fingerprint: pool.row_fingerprint,
      pool_table_combined_fingerprint: pool.table_combined_fingerprint,
      protected_surface_fingerprint: prot.fingerprint,
      flag_value: ctl.flag_value, allowlist_fingerprint: ctl.allowlist_fingerprint,
      build: S1_BUILD_,
      note: 'The TABLE fingerprint MUST change — a record left the population — and the value it must'
        + ' change TO is stated, because "it must differ" is satisfied by any damage at all. What must'
        + ' NOT change is every surviving row AND its row number, which is what the row-number map'
        + ' fingerprint refuses, and the physical extent of the sheet, which is why nothing is deleted.' };

    // ---- §2.9 THE FREEZE AND THE SENTENCE. ----
    var frozen = {
      frozen_at: out.measured_at, build: S1_BUILD_,
      table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
      live_column_count: out.live_column_count, named_column_count: out.named_column_count,
      live_columns: out.live_columns, header_fingerprint: out.header_fingerprint,
      table_combined_fingerprint: out.table_combined_fingerprint,
      logical_movement_record_count: out.logical_movement_record_count,
      physical_last_row: out.physical_last_row,
      non_blank_id_count: out.non_blank_id_count, valid_id_count: out.valid_id_count,
      blank_id_count: out.blank_id_count, duplicate_id_count: out.duplicate_id_count,
      wrong_type_id_count: out.wrong_type_id_count,
      outside_named_column_row_count: out.outside_named_column_row_count,
      target_row_number: rec.row_number, target_range_a1: rangeA1,
      target_range_cell_count: R.live_column_count,
      target_row_fingerprint: rec.fingerprint, target_row_occurrences: occ,
      target_row_cells: cells, target_non_blank_cell_count: nonBlank,
      target_id_column: R.id_column,
      target_movement_id_is_blank: idBlank, target_movement_type_is_blank: mtBlank,
      classification: S1_REMOVAL_CLASSIFICATION_, operator_basis: S1_REMOVAL_OPERATOR_BASIS_,
      classification_issued_against: out.classification_issued_against,
      remaining_record_count: rem.count, remaining_ids: rem.ids,
      remaining_id_universe_fingerprint: rem.id_universe_fingerprint,
      remaining_row_fingerprint_map_fingerprint: rem.row_fingerprint_map_fingerprint,
      pool_table: pool.table, pool_warehouse_id: pool.warehouse_id, pool_sku: pool.sku,
      pool_fac_current_stock: pool.fac_current_stock,
      pool_fac_reserved_stock: pool.fac_reserved_stock,
      pool_row_fingerprint: pool.row_fingerprint,
      pool_table_combined_fingerprint: pool.table_combined_fingerprint,
      protected_surfaces: prot.surfaces, protected_surface_fingerprint: prot.fingerprint,
      flag_value: ctl.flag_value, allowlist_count: ctl.allowlist_count,
      allowlist_fingerprint: ctl.allowlist_fingerprint,
      deployment_build: ctl.deployment_build,
      expected_after: out.expected_after,
      authorization_wording: null };

    frozen.authorization_wording = S1_remAuthWording_(frozen);
    out.authorization_wording = frozen.authorization_wording;
    var missing = S1_REMOVAL_FREEZE_REQUIRED_.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(frozen, k) || frozen[k] === undefined
        || frozen[k] === null;
    });
    L.P('the_frozen_baseline_carries_every_required_field', [], missing, missing.length === 0);
    var ph = (String(frozen.authorization_wording || '').match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || []);
    L.P('the_authorization_wording_carries_no_placeholder', [], ph, ph.length === 0);
    var wa = S1_remWordingAudit_(frozen.authorization_wording, frozen);
    out.wording_audit = wa;
    L.P('the_authorization_wording_names_every_fact_a_person_must_check', [], wa.missing,
      wa.missing.length === 0);

    if (missing.length === 0 && ph.length === 0 && wa.missing.length === 0
        && out.stop_reasons.length === 0 && L.failed.length === 0) {
      out.frozen_before = frozen;
      out.verdict = 'READY_TO_AUTHORIZE_REMOVAL';
      out.next_decision = 'A person may now run RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL with this'
        + ' frozen baseline and this exact authorization sentence. It defaults to a DRY RUN, and the dry'
        + ' run performs every check under the same lock while writing nothing.';
    }
    return fin();
  } catch (e) {
    L.P('the_manifest_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    stop('MANIFEST_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  }
}

/** The script lock, asked for once and reported honestly. An absent lock authority is a REFUSAL, never a
 *  reason to proceed unlocked: the whole safety property of this package is that the verification and the
 *  write happen without anything else moving in between. */
function S1_remAcquireLock_(timeoutMs) {
  var o = { authority_present: false, acquired: false, lock: null, reason: null,
    timeout_ms: timeoutMs, released: false };
  if (typeof LockService === 'undefined') { o.reason = 'LOCK_AUTHORITY_UNAVAILABLE'; return o; }
  o.authority_present = true;
  var lk = null;
  try { lk = LockService.getScriptLock(); }
  catch (e) { o.reason = 'LOCK_HANDLE_THREW:' + S1_cap_(String(e && e.message ? e.message : e), 120); return o; }
  if (!lk) { o.reason = 'LOCK_HANDLE_NULL'; return o; }
  var got = false;
  try { got = lk.tryLock(timeoutMs) === true; }
  catch (e2) { o.reason = 'LOCK_TRY_THREW:' + S1_cap_(String(e2 && e2.message ? e2.message : e2), 120); return o; }
  if (!got) { o.reason = 'LOCK_NOT_ACQUIRED_WITHIN_' + timeoutMs + 'MS'; return o; }
  o.acquired = true;
  o.lock = lk;
  return o;
}

/**
 * THE POSTCONDITION, MEASURED AGAINST THE FROZEN EXPECTATION AND NOTHING ELSE.
 *
 * Every comparison's expected side comes from `fz`, which the manifest produced from a different read. The
 * target row is checked from the RAW range rather than from the record list, because a fully blank row is
 * not a record and would simply be absent — and "absent" is what a deleted row looks like too. The whole
 * method rests on the difference, so the check has to be able to see it.
 */
function S1_remReadback_(sheet, fz) {
  var o = { ok: false, mismatches: [], measured: {},
    target_cells_read: 0, target_cells_blank: 0, target_row_raw_fingerprint: null,
    surviving_rows_compared: 0,
    // S1-R4J — which of the two accepted completion shapes this is, and the evidence that decided it.
    completion_shape: null, residue: null, shift: null, physical_last_row: null,
    target_range_checks_skipped_because: null };
  function cmp(what, expected, actual) {
    o.measured[what] = actual;
    if (String(expected) !== String(actual)) {
      o.mismatches.push({ what: what, expected: expected, actual: actual });
    }
  }
  var R = S1_movReadForRepair_();
  if (!R.ok) {
    o.mismatches.push({ what: 'TABLE_NOT_READABLE_ON_READBACK', detail: R.stop_reasons });
    return o;
  }
  var ea = fz.expected_after;
  cmp('header_fingerprint', ea.header_fingerprint, R.header_fingerprint);
  cmp('live_column_count', fz.live_column_count, R.live_column_count);
  cmp('logical_movement_record_count', ea.logical_movement_record_count, R.integrity.row_count);
  cmp('non_blank_id_count', ea.non_blank_id_count, R.integrity.ok_count);
  cmp('valid_id_count', ea.valid_id_count,
    R.integrity.ok_count - R.integrity.duplicate_id_count - R.integrity.wrong_type_id_count);
  cmp('blank_id_count', ea.blank_id_count, R.integrity.blank_id_count);
  cmp('duplicate_id_count', ea.duplicate_id_count, R.integrity.duplicate_id_count);
  cmp('wrong_type_id_count', ea.wrong_type_id_count, R.integrity.wrong_type_id_count);
  // THE FAULT THE WHOLE ROUND EXISTS FOR. The blank primary key is gone because the record is gone, not
  // because it was filled in — which is why this is checked beside a valid_id_count that did NOT rise.
  cmp('id_fault_count', ea.id_fault_count, (R.faults || []).length);
  cmp('outside_named_column_row_count', ea.outside_named_column_row_count,
    R.integrity.outside_named_columns_count);
  cmp('table_combined_fingerprint', ea.table_combined_fingerprint, R.table_combined_fingerprint);

  // ---- S1-R4J WHICH COMPLETION SHAPE IS THIS? -------------------------------------------------
  // A CLEAR and a DELETE are the same OUTCOME reached by two methods, and R4H could only recognise one of
  // them. The shape is decided by the RESIDUE and the sheet extent, never by the row number: after a
  // deletion sheet row 2 still exists and holds a legitimate movement, so "is row 2 blank" asks about the
  // spreadsheet while pretending to answer a question about the ledger.
  var lastRow = null;
  try { lastRow = sheet ? sheet.getLastRow() : null; } catch (e) { lastRow = null; }
  o.physical_last_row = lastRow;
  o.residue = S1_movResidueAbsent_(R.t, fz.target_row_fingerprint);
  if (!o.residue.absent) {
    o.completion_shape = S1_MOV_COMPLETION_NONE_;
    o.mismatches.push({ what: 'THE_LEGACY_TEST_RESIDUE_IS_STILL_PRESENT',
      expected: 0, actual: o.residue.occurrences });
  } else if (lastRow === ea.physical_last_row) {
    o.completion_shape = S1_MOV_COMPLETION_CLEARED_;
  } else if (lastRow === ea.physical_last_row - 1) {
    o.completion_shape = S1_MOV_COMPLETION_DELETED_;
  } else {
    o.completion_shape = S1_MOV_COMPLETION_UNKNOWN_;
  }
  // The physical extent is still COMPARED — against the value the shape it is in should produce. It is not
  // dropped, because an extent that matches neither shape is a layout nobody performed.
  cmp('physical_last_row',
    (o.completion_shape === S1_MOV_COMPLETION_DELETED_) ? ea.physical_last_row - 1 : ea.physical_last_row,
    lastRow);
  cmp('completion_shape_is_accepted', true,
    S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW
      .indexOf(o.completion_shape) !== -1);

  if (o.completion_shape === S1_MOV_COMPLETION_DELETED_) {
    // THE PHYSICAL ROW IS GONE, SO THERE IS NO RANGE TO READ BACK. Reading sheet row 2 and requiring it to
    // be blank would refuse a real movement for standing where the residue used to stand.
    o.target_range_checks_skipped_because = 'The physical row was deleted, so sheet row '
      + fz.target_row_number + ' now holds a legitimate movement. The residue is proved gone by CONTENT'
      + ' fingerprint instead, which is the only test that does not depend on where a row is kept.';
    cmp('the_legacy_test_residue_is_absent', 0, o.residue.occurrences);
    cmp('no_blank_spacer_row_was_inserted', ea.remaining_record_count + 1, lastRow);
  } else {
    // THE TARGET ROW, FROM THE RAW RANGE.
    var raw = null;
    try {
      raw = sheet ? sheet.getRange(fz.target_row_number, 1, 1, fz.live_column_count).getValues()[0] : null;
    } catch (e2) { raw = null; }
    if (!raw) {
      o.mismatches.push({ what: 'TARGET_RANGE_NOT_READABLE_ON_READBACK',
        expected: fz.target_range_a1, actual: null });
    } else {
      o.target_cells_read = raw.length;
      raw.forEach(function (v) { if (S1_canonCell_(v) === '~') o.target_cells_blank++; });
      o.target_row_raw_fingerprint = S1_rowFingerprint_(fz.live_columns, raw);
      cmp('target_cells_read', fz.target_range_cell_count, o.target_cells_read);
      cmp('target_cells_blank', fz.target_range_cell_count, o.target_cells_blank);
      cmp('target_row_raw_fingerprint', ea.target_row_raw_fingerprint, o.target_row_raw_fingerprint);
    }
    var stillARecord = false;
    (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) stillARecord = true; });
    cmp('target_row_is_a_logical_record', ea.target_row_is_a_logical_record, stillARecord);
  }

  // THE 95, BY IDENTITY. After a deletion the target row number belongs to a SURVIVOR, so excluding it
  // would drop a real movement from the comparison and report ninety-four.
  var remTarget = (o.completion_shape === S1_MOV_COMPLETION_DELETED_) ? null : fz.target_row_number;
  var rem = S1_remRemaining_(R.t, fz.target_id_column, remTarget);
  o.surviving_rows_compared = rem.count;
  cmp('remaining_record_count', ea.remaining_record_count, rem.count);
  cmp('remaining_id_universe_fingerprint', ea.remaining_id_universe_fingerprint,
    rem.id_universe_fingerprint);
  // AND BY ROW NUMBER — compared at the shift THIS SHAPE should have produced. Same check, same name and
  // same meaning as before R4J: a clear reproduces the frozen map at shift 0 and a deletion at shift 1, and
  // a clear that spilled onto the next row reproduces it at neither. Generalising the comparison by one
  // integer is the whole change; it does not weaken what the map refuses.
  var expShift = (o.completion_shape === S1_MOV_COMPLETION_DELETED_) ? 1 : 0;
  cmp('remaining_row_fingerprint_map_fingerprint', ea.remaining_row_fingerprint_map_fingerprint,
    S1_movShiftedRowMap_(R.t, expShift));
  // The same evidence read the other way round: WHICH shift, if any, reproduces the frozen map at all.
  o.shift = S1_movDetectUniformShift_(R.t, ea.remaining_row_fingerprint_map_fingerprint, [0, 1]);
  o.measured.current_row_fingerprint_map_fingerprint = rem.row_fingerprint_map_fingerprint;
  cmp('all_surviving_records_shifted_consistently', true, o.shift.uniform_shift_detected);
  cmp('surviving_rows_moved_up_by', expShift, o.shift.rows_moved_up_by);

  // THE POOL AND THE PROTECTED SURFACES: unchanged, and proved unchanged rather than left unmentioned.
  var pool = S1_remPoolObservation_(R.ss, fz.pool_warehouse_id, fz.pool_sku);
  cmp('pool_fac_current_stock', ea.pool_fac_current_stock, pool.fac_current_stock);
  cmp('pool_fac_reserved_stock', ea.pool_fac_reserved_stock, pool.fac_reserved_stock);
  cmp('pool_row_fingerprint', ea.pool_row_fingerprint, pool.row_fingerprint);
  cmp('pool_table_combined_fingerprint', ea.pool_table_combined_fingerprint,
    pool.table_combined_fingerprint);
  var prot = S1_remProtectedSurfaces_(R.ss);
  cmp('protected_surface_fingerprint', ea.protected_surface_fingerprint, prot.fingerprint);
  var ctl = S1_remControlSurface_();
  cmp('flag_value', ea.flag_value, ctl.flag_value);
  cmp('allowlist_fingerprint', ea.allowlist_fingerprint, ctl.allowlist_fingerprint);
  cmp('build', ea.build, S1_BUILD_);

  o.ok = o.mismatches.length === 0;
  return o;
}

/**
 * THE ROLLBACK. One call, the SAME fifteen cells, restored from values held IN MEMORY since before the clear.
 *
 * The in-memory copy is what makes this restorable at all. The frozen baseline carries the BEFORE row
 * canonically, for comparison — but a canonical form has been through JSON, and a Date pasted back as an ISO
 * string would not re-hash to the value it came from. So the restore writes the raw cells captured under this
 * same lock, and the frozen fingerprint is what PROVES the restore landed. A rollback that is not verified is
 * a hope; a rollback verified against a value it produced itself is not even that.
 */
function S1_remRollback_(sheet, fz, beforeRaw, why) {
  var o = { attempted: true, why: why, outcome: 'FAILED', cells_rolled_back: 0,
    restored_row_fingerprint: null, expected_row_fingerprint: fz.target_row_fingerprint,
    restored_table_fingerprint: null, expected_table_fingerprint: fz.table_combined_fingerprint,
    error: null };
  if (!beforeRaw || beforeRaw.length !== fz.target_range_cell_count) {
    o.error = 'NO_IN_MEMORY_BEFORE_ROW_TO_RESTORE_FROM';
    o.outcome = 'MANUAL_RECOVERY_REQUIRED';
    return o;
  }
  try {
    sheet.getRange(fz.target_row_number, 1, 1, fz.target_range_cell_count).setValues([beforeRaw]);
    o.cells_rolled_back = fz.target_range_cell_count;
  } catch (e) {
    o.error = 'ROLLBACK_WRITE_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 160);
    o.outcome = 'MANUAL_RECOVERY_REQUIRED';
    return o;
  }
  var R = S1_movReadForRepair_();
  if (!R.ok) {
    o.error = 'ROLLBACK_READBACK_UNREADABLE:' + R.stop_reasons.join(',');
    o.outcome = 'MANUAL_RECOVERY_REQUIRED';
    return o;
  }
  var rec = null;
  (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec = r; });
  if (!rec) {
    o.error = 'ROLLBACK_READBACK_ROW_IS_STILL_NOT_A_RECORD';
    o.outcome = 'MANUAL_RECOVERY_REQUIRED';
    return o;
  }
  o.restored_row_fingerprint = rec.fingerprint;
  o.restored_table_fingerprint = R.table_combined_fingerprint;
  var rowOk = S1_str_(rec.fingerprint) === S1_str_(fz.target_row_fingerprint);
  var tableOk = S1_str_(R.table_combined_fingerprint) === S1_str_(fz.table_combined_fingerprint);
  // BOTH, NOT EITHER. The row fingerprint proves the fifteen cells came back; the table fingerprint proves
  // nothing else moved while they did.
  o.outcome = (rowOk && tableOk) ? 'ROLLED_BACK_VERIFIED' : 'MANUAL_RECOVERY_REQUIRED';
  if (!rowOk) o.error = 'THE_ROW_DID_NOT_RETURN_TO_ITS_FROZEN_BEFORE_FINGERPRINT';
  else if (!tableOk) o.error = 'THE_ROW_CAME_BACK_BUT_THE_TABLE_FINGERPRINT_DID_NOT';
  return o;
}

/**
 * ================================================================================================================
 * S1-R4H-R1 — A VERDICT DECIDES WHAT MAY HAPPEN NEXT, AND IT HAS TO DECIDE IT IN ONE PLACE.
 *
 * R4H set `retryable` at eight separate branch sites inside the execute function, and one of them disagreed
 * with the contract the rest of the file states. A PROVEN zero-write after an unacknowledged clear reported
 * `NOT_APPLIED_ACK_UNKNOWN` with `retryable: true`. In isolation that reading is defensible — nothing was
 * written, so nothing is at risk — and it is still WRONG, because of who reads it.
 *
 * NOTHING IN THIS TOOL READS `retryable`. There is no caller. The reader is a PERSON, and the person is the
 * runtime: what they would do with `retryable: true` is paste the SAME frozen baseline and the SAME
 * authorization sentence straight back in. An output field that no program reads is not therefore harmless —
 * it is the field with the fewest checks between it and an action.
 *
 * THE RULE, RESTATED. An authorization is issued against a MEASURED STATE at a MOMENT, and once an execute
 * attempt has reached the write, that moment is over whatever the outcome was. A readback that proves
 * zero-write proves what is true at the instant of the readback; it does not restore the authorization's
 * currency, because the thing that spent the baseline was not the write — it was the ATTEMPT. So a proven
 * zero-write is not "retryable". It is NOT APPLIED, AND FINISHED: a future removal is still permitted, and it
 * must begin at a new manifest, a new frozen baseline and a new operator authorization.
 *
 * WHAT `retryable` MEANS HERE, EXACTLY, AND NOTHING BROADER: may THIS response be re-driven with THIS frozen
 * baseline and THIS authorization sentence, unchanged? Whether a removal may EVER happen again is a different
 * question and it now has its own field, `removal_may_be_attempted_again`. Collapsing the two is what produced
 * the contradiction: "you may try again one day" was written into a field that reads as "run this again now".
 *
 * TWO CONTRACTS STILL ANSWER YES, and they are why this is a table and not a constant `false`:
 *   DRY_RUN_OK               — the dry run exists PRECISELY so the same baseline can then be executed.
 *   REFUSED, lock contention — nothing was measured and nothing was written, so the baseline is exactly as
 *                              current as it was a second ago. The retry is a person coming back later, not
 *                              a loop; `automatic_retry_allowed` is false here too.
 * Every verdict that reached the write says no, to all four questions.
 *
 * `automatic_retry_allowed` IS NOT IN THE TABLE. It is returned as a literal `false` by the resolver, so no
 * row can grant it and a mutant has to attack the resolver itself rather than one line of data.
 * ================================================================================================================
 */
/**
 * S1-R4H-R2 — WHAT HAPPENS NEXT IS NOT THE SAME QUESTION AS WHETHER ANYTHING MAY BE REUSED.
 *
 * R4H-R1 got the reuse answers right and then gave all four ACK_UNKNOWN outcomes the SAME next_action:
 * go back to the manifest and get a new authorization. For two of them that is exactly right. For the
 * other two it is wrong in opposite directions.
 *
 *   EXECUTED_OK_AFTER_ACK_UNKNOWN — the readback PROVED the clear landed and the postcondition holds.
 *   The removal is DONE. Sending the operator back to a manifest asks them to re-open a settled case,
 *   and the natural next step from a manifest is an execute; an instruction whose obvious continuation
 *   is "clear the row again" is the wrong instruction to hand someone holding a completed removal.
 *
 *   MANUAL_RECOVERY_REQUIRED — the tool could NOT establish where it left the table. A manifest is a
 *   measurement that ends in a freeze block and an authorization sentence, i.e. the front door of the
 *   removal path. Pointing an unresolved data state at that door describes the recovery as something
 *   the tool can drive. It cannot. A person has to look first.
 *
 * So next_action is now outcome-specific, and it is checked against removal_may_be_attempted_again
 * rather than merely stated: an action that ends the case must not sit beside a permission to run the
 * removal again, and an action that sends someone back to the manifest must.
 */
var S1_REMOVAL_NEXT_MANIFEST_ = 'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION';
var S1_REMOVAL_NEXT_DONE_ = 'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE';
var S1_REMOVAL_NEXT_MANUAL_ = 'STOP_AND_PERFORM_MANUAL_RECOVERY';
/** [retryable, same_authorization_reusable, same_frozen_baseline_reusable,
 *   removal_may_be_attempted_again, next_action] */
var S1_REMOVAL_RETRY_CONTRACT_ = {
  // ---- NOTHING WAS ATTEMPTED. The baseline is still the current one. --------------------------------
  DRY_RUN_OK: [true, true, true, true,
    'RERUN_WITH_EXECUTE_TRUE_USING_THIS_FROZEN_BASELINE'],
  REFUSED_LOCK_CONTENTION: [true, true, true, true,
    'RETRY_LATER_WITH_THIS_FROZEN_BASELINE_WHEN_THE_LOCK_IS_FREE'],
  // A refusal that is a DRIFT is the opposite: the baseline is stale by definition, because being stale is
  // what the refusal detected.
  REFUSED: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],
  // ---- THE REMOVAL HAD ALREADY HAPPENED BEFORE THIS RUN. ---------------------------------------------
  // The removal is complete. It does not matter that a different run completed it: the case is the
  // same case, so it gets the same sentence as EXECUTED_OK rather than a near-synonym of its own.
  ALREADY_APPLIED: [false, false, false, false, S1_REMOVAL_NEXT_DONE_],
  ALREADY_APPLIED_BUT_READBACK_MISMATCH: [false, false, false, false,
    'INVESTIGATE_THE_TABLE_DOES_NOT_MATCH_THE_FROZEN_EXPECTED_AFTER'],
  // ---- THE WRITE WAS REACHED. FROM HERE NOTHING IS EVER REUSABLE. ------------------------------------
  EXECUTED_OK: [false, false, false, false, S1_REMOVAL_NEXT_DONE_],
  // The ACK_UNKNOWN family. All of them spend the authorization and the baseline — that is settled and
  // unchanged. S1-R4H-R2: what they ask the operator to DO NEXT is not the same for all four.
  //
  // Still unresolved when they leave this table: nobody knows where the table stands, so re-measure.
  ACK_UNKNOWN: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],
  ACK_UNKNOWN_UNRESOLVED: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],
  // RESOLVED AS APPLIED. The readback proved the clear landed and the postcondition holds, so the
  // removal is COMPLETE and there is nothing to go back for. The unacknowledged write was settled by
  // the readback that already ran — that is what "classified by readback, never by retry" means.
  EXECUTED_OK_AFTER_ACK_UNKNOWN: [false, false, false, false, S1_REMOVAL_NEXT_DONE_],
  // RESOLVED AS NOT APPLIED. The row is intact and the table is at its BEFORE fingerprint, so a removal
  // is still permitted — from a new manifest, a new baseline and a new operator authorization.
  NOT_APPLIED_ACK_UNKNOWN: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],
  // A verified rollback returned the table to its BEFORE state — the TABLE, not the authorization.
  ROLLED_BACK_VERIFIED: [false, false, false, true, S1_REMOVAL_NEXT_MANIFEST_],
  // AND THE ONE OUTCOME A TOOL MUST NOT ROUTE. The postcondition or the rollback could not be verified,
  // so where the data stands is unknown. A manifest ends in a freeze block and an authorization
  // sentence: it is the front door of the removal path, and pointing an unresolved state at it
  // describes the recovery as something this tool can drive. A person looks first.
  MANUAL_RECOVERY_REQUIRED: [false, false, false, false, S1_REMOVAL_NEXT_MANUAL_]
};
/**
 * The verdict is the key, with ONE refinement: a REFUSED that is a lock contention is a different contract
 * from a REFUSED that is a drift, because the first one never measured anything.
 *
 * AN UNKNOWN VERDICT GETS THE MOST RESTRICTIVE CONTRACT, not `undefined`. A verdict added later without a row
 * here refuses everything and reports `known: false`, rather than returning undefined fields that read as
 * false by accident and cannot be told apart from a deliberate false.
 */
function S1_remRetryContract_(verdict, contentionNotDrift) {
  var key = (S1_str_(verdict) === 'REFUSED' && contentionNotDrift === true)
    ? 'REFUSED_LOCK_CONTENTION' : S1_str_(verdict);
  var row = Object.prototype.hasOwnProperty.call(S1_REMOVAL_RETRY_CONTRACT_, key)
    ? S1_REMOVAL_RETRY_CONTRACT_[key] : null;
  if (!row) {
    return { known: false, contract_key: key, retryable: false, automatic_retry_allowed: false,
      same_authorization_reusable: false, same_frozen_baseline_reusable: false,
      removal_may_be_attempted_again: false, next_action: S1_REMOVAL_NEXT_MANIFEST_ };
  }
  return { known: true, contract_key: key,
    retryable: row[0] === true,
    // NEVER, FOR ANY VERDICT, AND NOT FROM THE TABLE. There is no automatic retry anywhere in this tool:
    // one clear site, no loop, no recursion, and the caller is a person.
    automatic_retry_allowed: false,
    same_authorization_reusable: row[1] === true,
    same_frozen_baseline_reusable: row[2] === true,
    removal_may_be_attempted_again: row[3] === true,
    next_action: row[4] };
}
/** The verdicts after which the operator MUST go back to the manifest: the outcome is unresolved, or it
 *  is resolved as "nothing stands removed" and a removal is still wanted. */
var S1_REMOVAL_MUST_REMANIFEST_ = ['ACK_UNKNOWN', 'ACK_UNKNOWN_UNRESOLVED',
  'NOT_APPLIED_ACK_UNKNOWN', 'ROLLED_BACK_VERIFIED'];
/** And the verdicts after which a manifest is the WRONG next step — two because the case is closed, one
 *  because a manifest is the front door of the removal path and this state needs a person, not a door. */
var S1_REMOVAL_MUST_NOT_REMANIFEST_ = ['EXECUTED_OK', 'EXECUTED_OK_AFTER_ACK_UNKNOWN',
  'ALREADY_APPLIED', 'MANUAL_RECOVERY_REQUIRED'];
/**
 * EVERY next_action, AND WHAT IT IMPLIES ABOUT TRYING AGAIN. These two fields answer one question from
 * two directions, so they are checked against each other on every return rather than trusted to agree:
 * an action that CLOSES the case must not sit beside a permission to run the removal again, and an
 * action that sends somebody back to the manifest must.
 */
var S1_REMOVAL_NEXT_ACTION_ALLOWS_ANOTHER_REMOVAL_ = {
  'NO_FURTHER_ACTION_THE_REMOVAL_IS_COMPLETE': false,
  'INVESTIGATE_THE_TABLE_DOES_NOT_MATCH_THE_FROZEN_EXPECTED_AFTER': false,
  'STOP_AND_PERFORM_MANUAL_RECOVERY': false,
  'RERUN_MANIFEST_AND_REQUIRE_NEW_OPERATOR_AUTHORIZATION': true,
  'RERUN_WITH_EXECUTE_TRUE_USING_THIS_FROZEN_BASELINE': true,
  'RETRY_LATER_WITH_THIS_FROZEN_BASELINE_WHEN_THE_LOCK_IS_FREE': true
};

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL({ execute, frozen, authorization, lock_timeout_ms })
 *
 * DEFAULT IS A DRY RUN. `execute` must be exactly `true`; absent, false, 'true', 1 and anything else are all
 * dry runs. A dry run takes the same lock, performs every check, and writes nothing.
 *
 * IT COMPUTES NO EXPECTATION OF ITS OWN. Every BEFORE value and every expected AFTER value comes from the
 * frozen manifest; this function re-measures and compares.
 *
 * ONE RANGE, ONE CALL, NO RETRY. There is exactly one clear site and exactly one restore site, both over
 * (frozen.target_row_number, 1) to (…, live_column_count), and the live column count is re-measured and
 * required to equal the frozen one — so a column append refuses rather than clearing a range that no longer
 * describes the row. A clear that throws is ACK_UNKNOWN: the outcome is UNKNOWN until a readback classifies
 * it, and it is never attempted again either way.
 *
 * S1-R4H-R1 — AND NOT ONLY "NOT HERE". No branch sets `retryable`; the whole retry contract is derived from
 * the verdict in fin(), from S1_REMOVAL_RETRY_CONTRACT_. Once the write has been REACHED — landed, not
 * landed, or unknowable — this frozen baseline and this authorization sentence are spent, and the response
 * says so in four fields and a next_action. A proven zero-write is NOT APPLIED AND FINISHED, not retryable:
 * a further removal is still permitted, and it starts at a new manifest.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL(opts) {
  opts = opts || {};
  var out = {
    tool: 'S1 FACTORY MOVEMENT LEGACY TEST-ROW REMOVAL — one range, frozen evidence, dry run by default',
    build: S1_BUILD_,
    // `execute` MUST be exactly true. A truthy check here would turn a typo into a production write.
    execute_requested: opts.execute === true,
    dry_run: opts.execute !== true,
    method: S1_REMOVAL_METHOD_.method,
    writes: 0, write_acknowledged: null, cells_touched: 0, cells_cleared: 0, cells_restored: 0,
    ids_minted: 0, movement_types_written: 0,
    rows_added: 0, rows_removed: 0, rows_reordered: false, tables_created: 0,
    other_tables_touched: [],
    generate_called: false, submit_called: false, migration_called: false, gap_job_called: false,
    factory_writer_called: false,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    target_row_number: null, target_range_a1: null,
    frozen_supplied: false, frozen_complete: false,
    authorization_supplied: false, authorization_matches_frozen: false,
    lock: null, verification: {}, readback: null, rollback: null,
    // S1-R4J — the residue is what "already done" means; the row NUMBER is not.
    residue: null, completion_shape: null,
    already_applied: false, attempts: 0,
    // S1-R4H-R1 — DERIVED IN fin() FROM THE VERDICT, NEVER ASSIGNED BY A BRANCH. `retryable` answers one
    // narrow question: may THIS response be re-driven with THIS baseline and THIS authorization, unchanged?
    // Whether a removal may ever happen again is `removal_may_be_attempted_again`, which is not the same
    // question and must not be answered in the same field.
    retryable: null, automatic_retry_allowed: false, retry_contract_key: null,
    same_authorization_reusable: null, same_frozen_baseline_reusable: null,
    removal_may_be_attempted_again: null, next_action: null,
    // The only refusal in this function that leaves the baseline current: a lock somebody else is holding.
    refusal_is_a_contention_not_a_drift: false,
    verdict: 'REFUSED', refusal_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [] };
  var L = S1_ledger_();
  function refuse(r) { if (out.refusal_reasons.indexOf(r) === -1) out.refusal_reasons.push(r); }

  function fin() {
    // ---- S1-R4H-R1 — THE RETRY CONTRACT IS DERIVED HERE AND NOWHERE ELSE. --------------------
    // Every return in this function goes through fin(), so no branch can disagree with the contract and no
    // branch added later can forget it. That is the whole reason it moved: R4H set `retryable` at eight
    // separate sites and one of them said the opposite of the other seven.
    var RC = S1_remRetryContract_(out.verdict, out.refusal_is_a_contention_not_a_drift === true);
    out.retry_contract_key = RC.contract_key;
    out.retryable = RC.retryable;
    out.automatic_retry_allowed = RC.automatic_retry_allowed;
    out.same_authorization_reusable = RC.same_authorization_reusable;
    out.same_frozen_baseline_reusable = RC.same_frozen_baseline_reusable;
    out.removal_may_be_attempted_again = RC.removal_may_be_attempted_again;
    out.next_action = RC.next_action;
    L.P('this_verdict_has_a_declared_retry_contract', true, RC.known, RC.known === true);
    L.P('no_verdict_of_this_tool_permits_an_automatic_retry', false, out.automatic_retry_allowed,
      out.automatic_retry_allowed === false);
    L.P('the_clear_was_attempted_at_most_once', true, out.attempts <= 1, out.attempts <= 1);
    // AN ATTEMPT THAT REACHED THE WRITE SPENT BOTH OF THEM. The authorization was issued against a measured
    // state; what ended that state's currency was the ATTEMPT, not the write, so a proven zero-write spends
    // it exactly as a landed write does.
    var spent = out.attempts >= 1;
    var anyReuse = out.retryable === true || out.same_authorization_reusable === true
      || out.same_frozen_baseline_reusable === true;
    L.P('an_attempt_that_reached_the_write_leaves_no_authorization_and_no_baseline_reusable',
      { attempt_was_made: spent, anything_reusable: false },
      { attempt_was_made: spent, anything_reusable: anyReuse },
      spent === false || anyReuse === false);
    L.P('an_unresolved_or_not_applied_outcome_is_sent_back_to_a_new_manifest',
      S1_REMOVAL_NEXT_MANIFEST_, out.next_action,
      S1_REMOVAL_MUST_REMANIFEST_.indexOf(S1_str_(out.verdict)) === -1
        || out.next_action === S1_REMOVAL_NEXT_MANIFEST_);
    // S1-R4H-R2 — AND THE OTHER HALF, WHICH THE FIRST ONE CANNOT SAY. A completed removal and a state
    // nobody can read are both wrongly served by "go back to the manifest": the first because the case
    // is closed, the second because a manifest is the front door of the removal path.
    L.P('a_completed_or_unrecoverable_outcome_is_not_sent_back_to_a_manifest',
      { verdict: out.verdict, sent_to_manifest: false },
      { verdict: out.verdict, sent_to_manifest: out.next_action === S1_REMOVAL_NEXT_MANIFEST_ },
      S1_REMOVAL_MUST_NOT_REMANIFEST_.indexOf(S1_str_(out.verdict)) === -1
        || out.next_action !== S1_REMOVAL_NEXT_MANIFEST_);
    L.P('a_state_that_needs_a_person_says_so_rather_than_naming_a_tool_to_run',
      S1_REMOVAL_NEXT_MANUAL_, out.next_action,
      S1_str_(out.verdict) !== 'MANUAL_RECOVERY_REQUIRED'
        || out.next_action === S1_REMOVAL_NEXT_MANUAL_);
    // AND THE TWO FIELDS ARE CHECKED AGAINST EACH OTHER, not merely stated side by side.
    var implied = Object.prototype.hasOwnProperty.call(
      S1_REMOVAL_NEXT_ACTION_ALLOWS_ANOTHER_REMOVAL_, S1_str_(out.next_action))
      ? S1_REMOVAL_NEXT_ACTION_ALLOWS_ANOTHER_REMOVAL_[S1_str_(out.next_action)] : null;
    L.P('the_next_action_and_the_permission_to_remove_again_agree',
      { next_action: out.next_action, removal_may_be_attempted_again: implied },
      { next_action: out.next_action,
        removal_may_be_attempted_again: out.removal_may_be_attempted_again },
      implied !== null && implied === out.removal_may_be_attempted_again);
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    if (out.verdict === 'REFUSED' && !out.refusal_reasons.length && L.failed.length) {
      out.refusal_reasons.push(L.failed.length + ' condition(s) not met: ' + L.failed.join(', '));
    }
    S1_log_('s1_mov_removal_verdict', JSON.stringify({
      build: out.build, verdict: out.verdict,
      execute_requested: out.execute_requested, dry_run: out.dry_run,
      table: out.table, target_range: out.target_range_a1,
      lock_acquired: out.lock ? out.lock.acquired : null,
      writes: out.writes, write_acknowledged: out.write_acknowledged,
      cells_touched: out.cells_touched, cells_cleared: out.cells_cleared,
      cells_restored: out.cells_restored, ids_minted: out.ids_minted,
      rows_added: out.rows_added, rows_removed: out.rows_removed,
      rows_reordered: out.rows_reordered, tables_created: out.tables_created,
      attempts: out.attempts, retryable: out.retryable, already_applied: out.already_applied,
      automatic_retry_allowed: out.automatic_retry_allowed,
      same_authorization_reusable: out.same_authorization_reusable,
      same_frozen_baseline_reusable: out.same_frozen_baseline_reusable,
      removal_may_be_attempted_again: out.removal_may_be_attempted_again,
      next_action: out.next_action,
      readback_ok: out.readback ? out.readback.ok : null,
      readback_mismatches: out.readback
        ? out.readback.mismatches.map(function (m) { return m.what; }).slice(0, 8) : null,
      rollback: out.rollback ? out.rollback.outcome : null,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12),
      refusal_reasons: out.refusal_reasons.slice(0, 12),
      note: 'A REFUSED or DRY_RUN verdict wrote nothing. Only EXECUTED_OK means the one range was cleared.' }));
    return out;
  }

  var LK = null;
  function release() {
    if (LK && LK.acquired && LK.lock) {
      try { LK.lock.releaseLock(); LK.released = true; } catch (e) { LK.released = false; }
    }
  }

  try {
    // ---- §3.1 THE FROZEN EVIDENCE IS THE INPUT, AND IT MUST BE WHOLE. --------------------------
    var fz = opts.frozen || null;
    out.frozen_supplied = !!fz;
    L.P('a_frozen_baseline_from_the_manifest_was_supplied', true, out.frozen_supplied,
      out.frozen_supplied === true);
    if (!fz) {
      refuse('NO_FROZEN_BASELINE - run the MANIFEST first and pass its frozen_before');
      return fin();
    }
    var fzMissing = S1_REMOVAL_FREEZE_REQUIRED_.filter(function (k) {
      return !Object.prototype.hasOwnProperty.call(fz, k) || fz[k] === undefined || fz[k] === null;
    });
    out.frozen_complete = fzMissing.length === 0;
    L.P('the_frozen_baseline_carries_every_required_field', [], fzMissing, fzMissing.length === 0);
    if (fzMissing.length) { refuse('FROZEN_BASELINE_INCOMPLETE:' + fzMissing.join(',')); return fin(); }
    out.target_row_number = fz.target_row_number;
    out.target_range_a1 = fz.target_range_a1;

    // ---- §3.2 THE AUTHORIZATION MUST BE THE EXACT SENTENCE THE MANIFEST FROZE. -----------------
    var auth = S1_str_(opts.authorization);
    out.authorization_supplied = auth !== '';
    out.authorization_matches_frozen = auth !== '' && auth === S1_str_(fz.authorization_wording);
    L.P('an_authorization_sentence_was_supplied', true, out.authorization_supplied,
      out.authorization_supplied === true);
    L.P('the_authorization_is_byte_identical_to_the_one_the_manifest_froze', true,
      out.authorization_matches_frozen, out.authorization_matches_frozen === true);
    if (!out.authorization_matches_frozen) {
      refuse(auth === '' ? 'NO_AUTHORIZATION_SUPPLIED'
        : 'AUTHORIZATION_DOES_NOT_MATCH_THE_FROZEN_SENTENCE');
      return fin();
    }
    L.P('the_frozen_baseline_was_taken_against_this_build', S1_BUILD_, fz.build,
      S1_str_(fz.build) === S1_BUILD_);
    L.P('the_frozen_baseline_targets_the_movement_table', S1_FACTORY_MOVEMENT_TABLE_, fz.table,
      S1_str_(fz.table) === S1_FACTORY_MOVEMENT_TABLE_);
    L.P('the_frozen_classification_is_the_operator_removal_decision',
      { classification: S1_REMOVAL_CLASSIFICATION_, basis: S1_REMOVAL_OPERATOR_BASIS_ },
      { classification: fz.classification, basis: fz.operator_basis },
      fz.classification === S1_REMOVAL_CLASSIFICATION_
        && fz.operator_basis === S1_REMOVAL_OPERATOR_BASIS_);
    if (fz.classification !== S1_REMOVAL_CLASSIFICATION_
        || fz.operator_basis !== S1_REMOVAL_OPERATOR_BASIS_) {
      refuse('FROZEN_CLASSIFICATION_IS_NOT_THE_REMOVAL_DECISION:' + S1_str_(fz.classification)
        + '/' + S1_str_(fz.operator_basis));
      return fin();
    }
    if (S1_str_(fz.build) !== S1_BUILD_ || S1_str_(fz.table) !== S1_FACTORY_MOVEMENT_TABLE_) {
      refuse('FROZEN_BASELINE_IS_FOR_A_DIFFERENT_BUILD_OR_TABLE'); return fin();
    }

    // ---- §3.3 THE LOCK, BEFORE ANY MEASUREMENT THE WRITE WILL DEPEND ON. -----------------------
    LK = S1_remAcquireLock_(Number(opts.lock_timeout_ms) > 0 ? Number(opts.lock_timeout_ms) : 30000);
    out.lock = { authority_present: LK.authority_present, acquired: LK.acquired,
      reason: LK.reason, timeout_ms: LK.timeout_ms };
    L.P('the_script_lock_authority_is_present', true, LK.authority_present,
      LK.authority_present === true);
    L.P('the_script_lock_was_acquired_before_anything_was_measured_or_written', true, LK.acquired,
      LK.acquired === true);
    if (!LK.acquired) {
      // NOT RETRIED HERE. A lock this run could not take is a lock something else is holding, and the
      // right response is to come back later with the same frozen baseline, not to spin.
      refuse('LOCK_NOT_HELD:' + S1_str_(LK.reason));
      // THE ONE REFUSAL THAT LEAVES THE BASELINE CURRENT. Nothing was measured and nothing was written, so
      // the same frozen evidence is exactly as true as it was. fin() turns this into the contract; the
      // retry is a person coming back later, and `automatic_retry_allowed` stays false here as everywhere.
      out.refusal_is_a_contention_not_a_drift = true;
      return fin();
    }

    // ---- §3.4 RE-MEASURE UNDER THE LOCK. EVERY FROZEN FACT MUST STILL HOLD. --------------------
    var R = S1_movReadForRepair_();
    L.P('the_movement_table_is_readable_now', [], R.stop_reasons,
      R.ok === true && R.stop_reasons.length === 0);
    if (!R.ok) { refuse('TABLE_NOT_READABLE:' + R.stop_reasons.join(',')); return fin(); }

    // IDEMPOTENCY IS ASKED FIRST, BECAUSE A RETRY IS A DIFFERENT QUESTION. On a completed removal every
    // pre-clear condition is legitimately false — the row is not a record, the blank id count is 0, the
    // table fingerprint is the AFTER one — so asking them about a run that already happened would report a
    // drift for a removal that succeeded.
    // S1-R4J — IDEMPOTENCY IS ASKED BY IDENTITY, NOT BY ROW NUMBER. The completed state can be reached by
    // a clear (the physical row survives, blank) or by a manual delete (the row is gone and everything below
    // it moved up one). After a delete, sheet row 2 exists and holds a real movement, so the old row-number
    // test answered "not done yet" about a removal that was finished — and the drift checks below would then
    // refuse a healthy table and invite somebody to repair it.
    //
    // NOT the residue hash ALONE, though. A header change moves every row fingerprint and an edit to the
    // target row moves its own, so "2CA4D4BE is not here" is equally what a DRIFT looks like — and answering
    // ALREADY_APPLIED to a drift would be the same error in the other direction. S1_movRemovalAlreadyComplete_
    // corroborates the absence against the population, the header and the blank-id count before believing it.
    var lastRowNow = null;
    try { lastRowNow = R.sheet.getLastRow(); } catch (eLR) { lastRowNow = null; }
    var done = S1_movRemovalAlreadyComplete_(R, lastRowNow, fz);
    out.residue = done.residue;
    var already = done.complete === true;
    if (already) {
      out.already_applied = true;
      out.readback = S1_remReadback_(R.sheet, fz);
      L.P('a_retry_of_a_completed_removal_writes_nothing', [0, 0, 0],
        [out.writes, out.cells_cleared, out.cells_restored],
        out.writes === 0 && out.cells_cleared === 0 && out.cells_restored === 0);
      L.P('a_retry_confirms_the_completed_removal_against_the_frozen_expected_after', [],
        out.readback.mismatches, out.readback.ok === true);
      out.completion_shape = out.readback.completion_shape;
      // S1-R4J — BOTH completion shapes are a completed removal. Recorded so a reader of ALREADY_APPLIED
      // can see WHICH method finished it without inferring it from a row count.
      L.P('the_completed_removal_took_one_of_the_two_accepted_shapes',
        S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW,
        out.completion_shape,
        S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW
          .indexOf(out.completion_shape) !== -1);
      out.verdict = out.readback.ok === true ? 'ALREADY_APPLIED'
        : 'ALREADY_APPLIED_BUT_READBACK_MISMATCH';
      if (out.readback.ok !== true) {
        refuse('THE_TARGET_ROW_IS_ALREADY_GONE_BUT_THE_TABLE_DOES_NOT_MATCH_THE_EXPECTED_AFTER');
      }
      return fin();
    }

    var v = out.verification;
    function chk(name, expected, observed, pass) {
      v[name] = { frozen: expected, now: observed };
      L.P('the_' + name + '_is_the_one_that_was_frozen', expected, observed, pass);
      if (!pass) refuse('DRIFT:' + name);
      return pass;
    }
    chk('header_fingerprint', fz.header_fingerprint, R.header_fingerprint,
      S1_str_(fz.header_fingerprint) === S1_str_(R.header_fingerprint));
    chk('live_column_count', fz.live_column_count, R.live_column_count,
      fz.live_column_count === R.live_column_count);
    chk('named_column_count', fz.named_column_count, R.named_column_count,
      fz.named_column_count === R.named_column_count);
    chk('table_combined_fingerprint', fz.table_combined_fingerprint, R.table_combined_fingerprint,
      S1_str_(fz.table_combined_fingerprint) === S1_str_(R.table_combined_fingerprint));
    chk('logical_movement_record_count', fz.logical_movement_record_count, R.integrity.row_count,
      fz.logical_movement_record_count === R.integrity.row_count);
    chk('blank_id_count', fz.blank_id_count, R.integrity.blank_id_count,
      fz.blank_id_count === R.integrity.blank_id_count);
    chk('duplicate_id_count', fz.duplicate_id_count, R.integrity.duplicate_id_count,
      fz.duplicate_id_count === R.integrity.duplicate_id_count);
    chk('wrong_type_id_count', fz.wrong_type_id_count, R.integrity.wrong_type_id_count,
      fz.wrong_type_id_count === R.integrity.wrong_type_id_count);
    chk('outside_named_column_row_count', fz.outside_named_column_row_count,
      R.integrity.outside_named_columns_count,
      fz.outside_named_column_row_count === R.integrity.outside_named_columns_count);
    var lastRow = null;
    try { lastRow = R.sheet.getLastRow(); } catch (e1) { lastRow = null; }
    chk('physical_last_row', fz.physical_last_row, lastRow, fz.physical_last_row === lastRow);

    // THE TARGET ROW: present, unique, unchanged, and still without a key or an axis.
    var rec = null;
    (R.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) rec = r; });
    L.P('the_target_sheet_row_is_still_a_readable_record', true, rec !== null, rec !== null);
    if (!rec) { refuse('TARGET_ROW_NOT_FOUND_AT_THE_FROZEN_ROW_NUMBER'); return fin(); }
    chk('target_row_fingerprint', fz.target_row_fingerprint, rec.fingerprint,
      S1_str_(fz.target_row_fingerprint) === S1_str_(rec.fingerprint));
    var occ = S1_remFingerprintOccurrences_(R.t, rec.fingerprint);
    chk('target_row_occurrences', fz.target_row_occurrences, occ, occ === 1 && fz.target_row_occurrences === 1);
    var idBlank = S1_canonCell_(S1_cellOf_(rec, fz.target_id_column)) === '~';
    var mtBlank = S1_canonCell_(S1_cellOf_(rec, 'movement_type')) === '~';
    chk('target_movement_id_is_blank', fz.target_movement_id_is_blank, idBlank,
      idBlank === fz.target_movement_id_is_blank);
    chk('target_movement_type_is_blank', fz.target_movement_type_is_blank, mtBlank,
      mtBlank === fz.target_movement_type_is_blank);

    // THE 95, THE POOL, THE PROTECTED SURFACES AND THE CONTROL SURFACE, ALL BEFORE ANYTHING IS WRITTEN.
    var rem = S1_remRemaining_(R.t, fz.target_id_column, fz.target_row_number);
    chk('remaining_record_count', fz.remaining_record_count, rem.count,
      fz.remaining_record_count === rem.count);
    chk('remaining_id_universe_fingerprint', fz.remaining_id_universe_fingerprint,
      rem.id_universe_fingerprint,
      S1_str_(fz.remaining_id_universe_fingerprint) === S1_str_(rem.id_universe_fingerprint));
    chk('remaining_row_fingerprint_map_fingerprint', fz.remaining_row_fingerprint_map_fingerprint,
      rem.row_fingerprint_map_fingerprint,
      S1_str_(fz.remaining_row_fingerprint_map_fingerprint)
        === S1_str_(rem.row_fingerprint_map_fingerprint));
    var pool = S1_remPoolObservation_(R.ss, fz.pool_warehouse_id, fz.pool_sku);
    chk('pool_fac_current_stock', fz.pool_fac_current_stock, pool.fac_current_stock,
      fz.pool_fac_current_stock === pool.fac_current_stock);
    chk('pool_fac_reserved_stock', fz.pool_fac_reserved_stock, pool.fac_reserved_stock,
      fz.pool_fac_reserved_stock === pool.fac_reserved_stock);
    chk('pool_row_fingerprint', fz.pool_row_fingerprint, pool.row_fingerprint,
      S1_str_(fz.pool_row_fingerprint) === S1_str_(pool.row_fingerprint));
    chk('pool_table_combined_fingerprint', fz.pool_table_combined_fingerprint,
      pool.table_combined_fingerprint,
      S1_str_(fz.pool_table_combined_fingerprint) === S1_str_(pool.table_combined_fingerprint));
    var prot = S1_remProtectedSurfaces_(R.ss);
    chk('protected_surface_fingerprint', fz.protected_surface_fingerprint, prot.fingerprint,
      S1_str_(fz.protected_surface_fingerprint) === S1_str_(prot.fingerprint));
    var ctl = S1_remControlSurface_();
    chk('flag_value', fz.flag_value, ctl.flag_value, fz.flag_value === ctl.flag_value);
    L.P('the_generation_flag_is_still_false', false, ctl.flag_value, ctl.flag_value === false);
    chk('allowlist_fingerprint', fz.allowlist_fingerprint, ctl.allowlist_fingerprint,
      S1_str_(fz.allowlist_fingerprint) === S1_str_(ctl.allowlist_fingerprint));

    // ---- §3.5 THE RANGE. RE-DERIVED FROM THE LIVE HEADER, NOT TAKEN FROM THE FREEZE. -----------
    var rangeNow = S1_remRangeA1_(fz.target_row_number, R.live_column_count);
    L.P('the_range_to_clear_is_exactly_the_one_that_was_frozen', fz.target_range_a1, rangeNow,
      rangeNow !== null && rangeNow === S1_str_(fz.target_range_a1));
    if (rangeNow === null || rangeNow !== S1_str_(fz.target_range_a1)) {
      refuse('THE_TARGET_RANGE_NO_LONGER_DESCRIBES_THE_ROW:' + S1_str_(rangeNow));
    }
    out.cells_touched = 0;

    // ---- §3.6 THE IN-MEMORY BEFORE ROW, CAPTURED UNDER THE LOCK AND PROVED TO BE THE FROZEN ONE. --
    var beforeRaw = null;
    try {
      beforeRaw = R.sheet.getRange(fz.target_row_number, 1, 1, R.live_column_count).getValues()[0];
    } catch (e2) { beforeRaw = null; }
    L.P('the_before_row_was_captured_in_memory', fz.target_range_cell_count,
      beforeRaw ? beforeRaw.length : null,
      !!beforeRaw && beforeRaw.length === fz.target_range_cell_count);
    if (!beforeRaw || beforeRaw.length !== fz.target_range_cell_count) {
      refuse('THE_BEFORE_ROW_COULD_NOT_BE_HELD_IN_MEMORY_SO_THERE_IS_NOTHING_TO_ROLL_BACK_TO');
      return fin();
    }
    var rawFp = S1_rowFingerprint_(R.live_columns, beforeRaw);
    L.P('the_in_memory_before_row_hashes_to_the_frozen_before_fingerprint',
      fz.target_row_fingerprint, rawFp, S1_str_(rawFp) === S1_str_(fz.target_row_fingerprint));
    if (S1_str_(rawFp) !== S1_str_(fz.target_row_fingerprint)) {
      refuse('THE_RANGE_READ_DOES_NOT_MATCH_THE_FROZEN_ROW');
    }
    var nonBlankNow = 0;
    beforeRaw.forEach(function (x) { if (S1_canonCell_(x) !== '~') nonBlankNow++; });
    L.P('the_number_of_cells_that_will_actually_change_is_the_frozen_one',
      fz.target_non_blank_cell_count, nonBlankNow, nonBlankNow === fz.target_non_blank_cell_count);
    if (nonBlankNow !== fz.target_non_blank_cell_count) {
      refuse('THE_NUMBER_OF_NON_BLANK_CELLS_DRIFTED:' + nonBlankNow);
    }

    if (L.failed.length || out.refusal_reasons.length) { return fin(); }

    // ---- §DEFAULT: A DRY RUN STOPS HERE, HAVING WRITTEN NOTHING. -------------------------------
    if (opts.execute !== true) {
      out.verdict = 'DRY_RUN_OK';
      L.P('a_dry_run_wrote_nothing', [0, 0, 0], [out.writes, out.cells_cleared, out.cells_restored],
        out.writes === 0 && out.cells_cleared === 0 && out.cells_restored === 0);
      L.P('a_dry_run_took_the_same_lock_and_ran_the_same_checks', true, LK.acquired,
        LK.acquired === true);
      return fin();
    }

    // ---- §3.7 THE REMOVAL. ONE RANGE. ONE CALL. NEVER TWICE. ----------------------------------
    out.attempts = 1;
    out.cells_touched = R.live_column_count;
    var ackUnknown = false;
    try {
      R.sheet.getRange(fz.target_row_number, 1, 1, R.live_column_count).clearContent();
      out.write_acknowledged = true;
      out.writes = 1;
      out.cells_cleared = nonBlankNow;
    } catch (wErr) {
      // TIMEOUT OR TRANSPORT FAILURE IS NOT A FAILED WRITE. It is an UNKNOWN one, and the difference
      // decides whether anything may be tried again. It is classified by READBACK, never by retry.
      ackUnknown = true;
      out.write_acknowledged = 'UNKNOWN';
      out.verdict = 'ACK_UNKNOWN';
      refuse('WRITE_ACK_UNKNOWN: ' + S1_cap_(String(wErr && wErr.message ? wErr.message : wErr), 200));
      L.P('the_single_range_clear_was_acknowledged', true, 'threw', false);
    }

    // ---- §3.8 READBACK, AGAINST THE FROZEN EXPECTATION. ---------------------------------------
    out.readback = S1_remReadback_(R.sheet, fz);
    if (ackUnknown) {
      // THREE OUTCOMES, AND THE ONE THAT MATTERS MOST IS THE PROVEN ZERO-WRITE.
      var recNow = null;
      var R2 = S1_movReadForRepair_();
      if (R2.ok) {
        (R2.t.rows || []).forEach(function (r) { if (r.row_number === fz.target_row_number) recNow = r; });
      }
      if (out.readback.ok === true) {
        // It landed after all. The write is real and it is exactly the authorized one.
        out.writes = 1;
        out.cells_cleared = nonBlankNow;
        out.write_acknowledged = 'RESOLVED_BY_READBACK_AS_APPLIED';
        out.verdict = 'EXECUTED_OK_AFTER_ACK_UNKNOWN';
        L.P('an_unacknowledged_write_was_classified_by_readback_and_not_by_retry', 1, out.attempts,
          out.attempts === 1);
      } else if (recNow && S1_str_(recNow.fingerprint) === S1_str_(fz.target_row_fingerprint)
          && S1_str_(R2.table_combined_fingerprint) === S1_str_(fz.table_combined_fingerprint)) {
        // A PROVEN ZERO-WRITE. The row is intact and the whole table is at its BEFORE fingerprint, so
        // nothing happened.
        //
        // S1-R4H-R1 — AND IT IS STILL NOT RETRYABLE. R4H wrote `retryable = true` here, meaning "no harm was
        // done, so a further removal is still permitted", which is true. But the field it wrote that into
        // reads as "run this same call again", and the reader is a person holding the same frozen baseline
        // and the same authorization sentence. The readback proves what was true at the instant it ran; it
        // does not make the authorization current again, because what spent the authorization was the
        // ATTEMPT. So: NOT APPLIED, AND FINISHED. The permission to try again one day is a different field.
        out.writes = 0;
        out.cells_cleared = 0;
        out.write_acknowledged = 'RESOLVED_BY_READBACK_AS_NOT_APPLIED';
        out.verdict = 'NOT_APPLIED_ACK_UNKNOWN';
        L.P('a_proven_zero_write_wrote_nothing', [0, 0], [out.writes, out.cells_cleared],
          out.writes === 0 && out.cells_cleared === 0);
        L.P('a_proven_zero_write_is_finished_and_not_repeated_under_this_authorization', 1, out.attempts,
          out.attempts === 1);
      } else {
        out.verdict = 'ACK_UNKNOWN_UNRESOLVED';
        out.rollback = S1_remRollback_(R.sheet, fz, beforeRaw, 'ACK_UNKNOWN_UNRESOLVED');
        out.cells_restored = out.rollback.cells_rolled_back;
        out.verdict = out.rollback.outcome === 'ROLLED_BACK_VERIFIED'
          ? 'ROLLED_BACK_VERIFIED' : 'MANUAL_RECOVERY_REQUIRED';
      }
      return fin();
    }

    L.P('the_readback_matched_the_frozen_expected_after', [], out.readback.mismatches,
      out.readback.ok === true);
    if (out.readback.ok !== true) {
      refuse('READBACK_MISMATCH:' + out.readback.mismatches.map(function (m) {
        return m.what; }).join(','));
      out.rollback = S1_remRollback_(R.sheet, fz, beforeRaw, 'READBACK_MISMATCH');
      out.cells_restored = out.rollback.cells_rolled_back;
      // AND THE CLEAR IS NOT ATTEMPTED AGAIN. attempts stays 1 whatever the rollback outcome.
      out.verdict = out.rollback.outcome === 'ROLLED_BACK_VERIFIED'
        ? 'ROLLED_BACK_VERIFIED' : 'MANUAL_RECOVERY_REQUIRED';
      L.P('the_clear_was_never_attempted_a_second_time', 1, out.attempts, out.attempts === 1);
      return fin();
    }

    out.verdict = 'EXECUTED_OK';
    L.P('exactly_one_range_of_the_frozen_size_was_touched', fz.target_range_cell_count,
      out.cells_touched, out.cells_touched === fz.target_range_cell_count);
    L.P('exactly_the_frozen_number_of_cells_changed', fz.target_non_blank_cell_count,
      out.cells_cleared, out.cells_cleared === fz.target_non_blank_cell_count);
    L.P('no_row_was_added_removed_or_reordered', [0, 0, false],
      [out.rows_added, out.rows_removed, out.rows_reordered],
      out.rows_added === 0 && out.rows_removed === 0 && out.rows_reordered === false);
    L.P('no_primary_key_was_minted_and_no_ledger_axis_was_written', [0, 0],
      [out.ids_minted, out.movement_types_written],
      out.ids_minted === 0 && out.movement_types_written === 0);
    L.P('the_clear_was_attempted_exactly_once', 1, out.attempts, out.attempts === 1);
    return fin();
  } catch (e) {
    L.P('the_tool_ran_to_completion', true, 'threw: ' + String(e && e.message ? e.message : e), false);
    refuse('TOOL_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  } finally {
    release();
    if (out.lock && LK) { out.lock.released = LK.released === true; }
  }
}

// ================================================================================================================
// S1-R4F — WHERE DID ROW 2 COME FROM? THE TABLE CANNOT SAY, SO EVERYTHING ELSE IS ASKED.
//
// R4D located the row. R4E proved it cannot be repaired by writing one cell, and named the reason: it is
// missing TWO required fields and the second of them decides which ledger axis its qty moved. That refusal is
// correct and it is also the end of what ONE TABLE can settle. `movement_type` is blank, so the row does not
// say what it was; `related_entity_id` is blank, so it does not say what it came from; and no shipped writer
// leaves either blank, so the row's own table holds no record of its own provenance.
//
// THIS CENSUS ASKS THE REST OF THE DATABASE. Five independent lines of evidence, each of which can answer
// without the target row's cooperation:
//
//   §1 THE LEDGER'S OWN CONTINUITY. Every writer records before/after on BOTH axes, so the row after this one
//      in the same pool carries an independent statement of what the balance was when it ran. If the next
//      row's `before_current_stock` is 12000 then something other than row 2 says 12000 was the balance -
//      and that is evidence about `after_current_stock` that did not come from `after_current_stock`.
//
//   §2 THE SHAPE OF ITS SIBLINGS. A row is not only its values; it is also WHICH CELLS ARE EMPTY. If other
//      rows share the exact blank-shape and one of them is classified, the classified one is evidence about
//      how this batch was produced. It is NEVER a source of values to copy: a sibling's movement_type is a
//      fact about the sibling.
//
//   §3 THE OTHER TABLES. factory_stock holds the balance the ledger is supposed to add up to. The PO,
//      shipment, plan and reservation tables hold the events a movement would have been written for. A
//      2026-06-12 event for CO1100-R at this factory, found anywhere else, is provenance.
//
//   §4 THE WRITERS THEMSELVES, as a contract rather than as history. Each shipped writer populates certain
//      columns unconditionally - a constant, an `||` default, or a computed number - and a row blank in any
//      of those columns CANNOT have come from it. This eliminates rather than guesses, and it is the one
//      line of evidence that needs no other table at all.
//
//   §5 THE ARITHMETIC OF EACH CANDIDATE, with its supporting AND contradicting evidence side by side.
//
// AND THE RULE THAT MAKES IT USABLE: two INDEPENDENT sources must point at the same candidate, and no
// authoritative evidence may contradict it. One equality is a coincidence with a sample size of one. The
// live row's `qty` equals its own `after_current_stock` exactly, which reads like a SET balance and is also
// exactly what a mistyped delta looks like - so that single agreement is recorded as ONE source and is not
// permitted to conclude anything on its own.
//
// NOTHING HERE REPAIRS ANYTHING. There is no execute path, no id is proposed, no cell is named for writing,
// and a verdict of READY_FOR_LEGACY_ROW_REPAIR_DECISION means a PERSON can now decide - not that a tool may.
// ================================================================================================================

/**
 * The live state R4E measured and the operator froze in the R4F authorization. Re-checked on every run,
 * because provenance evidence gathered against a sheet that has since moved is evidence about a different
 * sheet. A mismatch is a STOP: the old numbers are not re-used and no classification is published.
 */
/**
 * ================================================================================================================
 * S1-R4J — LOGICAL MOVEMENT IDENTITY vs PHYSICAL SHEET LAYOUT.
 *
 * WHAT HAPPENED. The operator did not clear A2:O2 — they DELETED sheet row 2. So the ninety-five real movements
 * each moved up one row, the sheet's last row went 97 -> 96, and every PHYSICAL fact this package had frozen
 * about the AFTER state stopped being true. Not one movement changed.
 *
 * THE REPAIR THAT WAS ALMOST MADE. R4I proposed insertRowsBefore(2, 1), putting a blank row back so the frozen
 * physical postconditions would pass again. That is editing the evidence to fit the expectation. A blank spacer
 * row is not data; the only thing it would have restored is the diagnostic's comfort, and it would have done it
 * by writing to the very table this package exists to leave alone.
 *
 * THE DEFECT WAS IN THE CONTRACT, and it is one confusion:
 *
 *     A GOOGLE SHEET ROW NUMBER IS NOT A MOVEMENT IDENTITY. It is where the row is being kept today.
 *
 * So the two are separated here and never mixed again:
 *
 *   LOGICAL IDENTITY   factory_stock_movement_id, the business content under that id, the id universe, and the
 *                      blank / duplicate / wrong-type counts. NONE of it contains a row number.
 *   PHYSICAL LAYOUT    sheet row number, physical last row, blank spacer rows. Measured and reported, and NEVER
 *                      an identity — a change here is a fact about the spreadsheet, not about the ledger.
 *
 * AND ONE THING WAS ALREADY RIGHT, which is why the deletion corrupted nothing. S1_fullRowTable_ builds
 * combined_fingerprint from one `id~row_fingerprint` signature per row, and S1_fingerprint_ SORTS before
 * hashing — so the table fingerprint never contained a row number and never depended on row order. FC67B70E,
 * the value R4H froze as the expected AFTER of a CLEAR, is the value the sheet now carries after a DELETE. The
 * two completion shapes were always going to agree on it. What disagreed were the physical predicates standing
 * next to it.
 * ================================================================================================================
 */

var S1_MOV_COMPLETION_CLEARED_ = 'CLEARED_PHYSICAL_ROW_KEPT';
var S1_MOV_COMPLETION_DELETED_ = 'ROW_DELETED_RECORDS_SHIFTED_UP';
var S1_MOV_COMPLETION_NONE_ = 'NOT_COMPLETED';
var S1_MOV_COMPLETION_UNKNOWN_ = 'COMPLETED_BUT_LAYOUT_UNRECOGNISED';

/** The two vocabularies, written down so a later round cannot quietly move a term from one to the other. */
var S1_MOV_IDENTITY_CONTRACT_ = {
  logical_identity: {
    is: ['factory_stock_movement_id', 'the business content stored under that id', 'the id universe',
      'blank_id_count', 'duplicate_id_count', 'wrong_type_id_count'],
    decides: 'whether a movement exists and whether it still says what it said',
    contains_a_row_number: false
  },
  physical_layout: {
    is: ['sheet row number', 'physical last row', 'blank spacer rows', 'row order'],
    decides: 'nothing about the data — it is where the rows are being kept',
    contains_a_row_number: true,
    may_be_an_identity: false
  },
  accepted_completions_for_an_INVALID_NON_LEDGER_ROW: [S1_MOV_COMPLETION_CLEARED_,
    S1_MOV_COMPLETION_DELETED_],
  a_shrunken_sheet_is_not_a_lost_record: 'physical_last_row 96 instead of 97, and a row map that moved, are'
    + ' PHYSICAL observations. Neither may be reported as data loss on its own, and neither may be repaired'
    + ' by inserting a row.'
};

/**
 * A record's CONTENT fingerprint with the ID COLUMN REMOVED.
 *
 * Deliberately not the full-row fingerprint. If the id were inside the content hash, a changed id would move
 * BOTH the id-universe fingerprint and the content fingerprint, and the pair could no longer say WHICH of the
 * two things went wrong. Excluded, they answer two questions: "are these the same ninety-five records" and
 * "does each of them still say the same thing".
 */
function S1_movContentFp_(rec, liveColumns, idColumn) {
  var hdrs = [], vals = [];
  (liveColumns || []).forEach(function (c, i) {
    if (c === idColumn) return;
    hdrs.push(c);
    vals.push(rec && rec.__values ? rec.__values[i] : null);
  });
  return S1_rowFingerprint_(hdrs, vals);
}

/**
 * THE LOGICAL VIEW OF THE MOVEMENT TABLE, plus the physical layout reported ALONGSIDE it rather than inside it.
 *
 * `logical_table_fingerprint` is built exactly the way S1_fullRowTable_ builds `combined_fingerprint` — sorted
 * `id~row_fingerprint` signatures — which is why the acceptance manifest can assert the two are equal. That
 * assertion is the proof that the table fingerprint this package has been quoting all along never contained a
 * row number, rather than a claim that it didn't.
 */
function S1_movLogicalIdentity_(t, idKey) {
  var liveColumns = (t && t.live_columns) || [];
  var ids = [], byId = [], sig = [], phys = [];
  ((t && t.rows) || []).forEach(function (r) {
    var id = S1_str_(r[idKey]);
    ids.push(id);
    byId.push(id + '~' + S1_str_(S1_movContentFp_(r, liveColumns, idKey)));
    sig.push(id + '~' + S1_str_(r.fingerprint));
    phys.push(String(r.row_number) + '~' + id);
  });
  return {
    record_count: ids.length,
    id_universe: ids,
    id_universe_fingerprint: S1_fingerprint_(ids),
    content_by_id_fingerprint: S1_fingerprint_(byId),
    logical_table_fingerprint: S1_fingerprint_(sig),
    physical_layout_fingerprint: S1_fingerprint_(phys),
    physical_layout_is_an_identity: false,
    note: 'content_by_id EXCLUDES the id column so that "a record vanished" and "a record was edited" cannot'
      + ' arrive as the same finding. physical_layout is reported and is never compared as identity.'
  };
}

/** The row-number map this table would produce if every row were renumbered by `shift`. */
function S1_movShiftedRowMap_(t, shift) {
  var pairs = [];
  ((t && t.rows) || []).forEach(function (r) {
    pairs.push(String(r.row_number + shift) + '~' + S1_str_(r.fingerprint));
  });
  return S1_fingerprint_(pairs);
}

/**
 * DID EVERY SURVIVING ROW MOVE BY THE SAME AMOUNT?
 *
 * The question is answered against the row map the READ-ONLY manifest published BEFORE the deletion. A uniform
 * shift is the only way every survivor can land on a new number and the SET of (number, content) pairs still
 * reproduce that map: one row moving on its own breaks it, one row changing content breaks it, and a row
 * quietly disappearing breaks it. So this is one measurement that answers "consistent" and "by how much" at
 * the same time, and it cannot be satisfied by a partial move.
 */
function S1_movDetectUniformShift_(t, expectedRowMapFingerprint, candidates) {
  var tried = [], matched = null;
  (candidates || [0, 1]).forEach(function (s) {
    var fp = S1_movShiftedRowMap_(t, s);
    var hit = fp !== null && S1_str_(fp) === S1_str_(expectedRowMapFingerprint);
    tried.push({ shift_applied: s, row_map_fingerprint: fp, matches: hit });
    if (matched === null && hit) matched = s;
  });
  return { expected_row_map_fingerprint: S1_str_(expectedRowMapFingerprint),
    candidates_tried: tried,
    uniform_shift_detected: matched !== null,
    rows_moved_up_by: matched === null ? null : matched,
    current_row_map_fingerprint: S1_movShiftedRowMap_(t, 0) };
}

/** Is the legacy test residue gone? Asked by CONTENT fingerprint, because after a deletion the row NUMBER it
 *  used to occupy holds a legitimate movement, and asking about the number would refuse that record for
 *  standing where the residue used to stand. */
function S1_movResidueAbsent_(t, residueFingerprint) {
  var rows = [];
  ((t && t.rows) || []).forEach(function (r) {
    if (S1_str_(r.fingerprint) === S1_str_(residueFingerprint)) rows.push(r.row_number);
  });
  return { residue_fingerprint: S1_str_(residueFingerprint), occurrences: rows.length,
    rows_found_at: rows, absent: rows.length === 0 };
}

/**
 * IS THE REMOVAL ALREADY DONE, AND BY WHICH METHOD? Decided by the residue and the sheet extent — never by the
 * row number.
 *
 * ABSENCE MUST BE CORROBORATED, and this is the part that is easy to get wrong. "No row hashes to 2CA4D4BE"
 * is ALSO what a header change produces (every row fingerprint moves), and what an edit to that very row
 * produces (it hashes to something else while sitting exactly where it was). A missing hash says the row is
 * not there AS IT WAS; on its own it does not say it is gone. So a completion additionally requires the
 * population to have dropped by exactly one, the header to still be the frozen one, and no blank id to
 * remain — three facts a schema drift or a row edit cannot fake.
 *
 * `complete` does not depend on the LAYOUT answer: a completion whose layout this function cannot name is
 * still a completion, and is reported as one rather than as damage.
 */
function S1_movRemovalAlreadyComplete_(R, lastRow, EXP) {
  var residue = S1_movResidueAbsent_(R ? R.t : null, EXP ? EXP.target_row_fingerprint : null);
  var now = (R && R.integrity) ? R.integrity.row_count : null;
  var expectedAfter = (EXP && typeof EXP.logical_movement_record_count === 'number')
    ? EXP.logical_movement_record_count - 1 : null;
  var headerOk = !(EXP && EXP.header_fingerprint)
    || S1_str_(R ? R.header_fingerprint : null) === S1_str_(EXP.header_fingerprint);
  var noBlankId = !!(R && R.integrity) && R.integrity.blank_id_count === 0;
  var shape = S1_MOV_COMPLETION_NONE_;
  if (residue.absent === true) {
    // AFTER A CLEAR the blank row still occupies extent (records + header + the blank one). AFTER A DELETE it
    // does not. That arithmetic is the whole difference between the two shapes.
    if (typeof lastRow === 'number' && typeof now === 'number' && lastRow === now + 1) {
      shape = S1_MOV_COMPLETION_DELETED_;
    } else if (typeof lastRow === 'number' && typeof now === 'number' && lastRow === now + 2) {
      shape = S1_MOV_COMPLETION_CLEARED_;
    } else {
      shape = S1_MOV_COMPLETION_UNKNOWN_;
    }
  }
  return { residue: residue, completion_shape: shape,
    logical_movement_record_count: now, expected_after_record_count: expectedAfter,
    physical_last_row: lastRow,
    header_matches_the_frozen_one: headerOk,
    no_blank_movement_id_remains: noBlankId,
    complete: residue.absent === true && now !== null && now === expectedAfter
      && headerOk === true && noBlankId === true,
    corroboration: 'A missing residue hash is necessary and NOT sufficient — a header change and an edit to'
      + ' the target row both produce one. The population count, the header and the blank-id count are what'
      + ' turn "not there as it was" into "gone".',
    note: 'A completed removal is not a drift. Every BEFORE fingerprint is legitimately wrong once the row is'
      + ' gone, so a manifest that compared them first would report damage to a table that is finished.' };
}

/**
 * THE POST-DELETION LIVE PIN.
 *
 * Two kinds of value, and the difference matters:
 *
 *   THE OPERATOR'S STATEMENT of the state their manual deletion left — counts, extent, balances.
 *   TWO HASHES THE READ-ONLY R4H MANIFEST PUBLISHED BEFORE THE DELETION — the expected-after table fingerprint
 *   FC67B70E and the surviving-row map 9036FD1A. Neither is an authorization and neither is a frozen removal
 *   baseline. They are published expected values, and comparing today against them is the only way "and
 *   nothing else changed" can be a measurement instead of a hope.
 *
 * WHAT IS DELIBERATELY NOT HERE: a pinned `content_by_id_fingerprint`. Nobody measured one before the
 * deletion, so there is no expected value, and inventing one now would be comparing a measurement with itself.
 * It is REPORTED by this round and becomes the pin a later round can hold the table to.
 *
 * WHAT MUST NEVER COME BACK: E3E783BF (the BEFORE fingerprint of a table that no longer exists in that shape),
 * physical last row 97 as a required condition, and the blank-row-2 fingerprint 91702192.
 */
var S1_MOV_POST_DELETION_LIVE_ = {
  authority: 'S1-R4J operator statement of the manual deletion, plus the two hashes the READ-ONLY R4H'
    + ' manifest published before it (expected-after FC67B70E, surviving-row map 9036FD1A)',
  header_row: 1,
  live_column_count: 15,
  physical_last_row: 96,
  logical_movement_record_count: 95,
  valid_id_count: 95,
  blank_id_count: 0,
  duplicate_id_count: 0,
  wrong_type_id_count: 0,
  outside_named_column_row_count: 0,
  header_fingerprint: 'FDC8D1DB',
  logical_table_fingerprint: 'FC67B70E',
  id_universe_fingerprint: '183943D3',
  pre_deletion_row_map_fingerprint: '9036FD1A',
  expected_rows_moved_up_by: 1,
  residue_row_fingerprint: '2CA4D4BE',
  pool_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
  pool_sku: 'CO1100-R',
  pool_fac_current_stock: 2210,
  pool_fac_reserved_stock: 0,
  pool_row_fingerprint: 'CEF2DBFE',
  pool_table_combined_fingerprint: 'A906EA1A',
  protected_surface_fingerprint: 'A5D988F9',
  flag_value: false,
  allowlist_count: 1,
  allowlist_fingerprint: '1CD59B3E'
};

var S1_ACCEPT_VERDICT_DELETED_ = 'MANUAL_LEGACY_TEST_ROW_DELETION_ACCEPTED';
var S1_ACCEPT_VERDICT_CLEARED_ = 'LEGACY_TEST_ROW_REMOVAL_COMPLETED_BY_CLEAR';
var S1_ACCEPT_NEXT_ = 'RUN_FRESH_S1_MANIFEST_P';
var S1_ACCEPT_NEXT_STOP_ = 'STOP_AND_INVESTIGATE_NOTHING_IS_REPAIRED_AUTOMATICALLY';

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_POST_MANUAL_DELETION_ACCEPTANCE_MANIFEST — READ ONLY, ZERO WRITES.
 *
 * Accepts the CURRENT state on its own evidence. It requires no frozen removal baseline, consumes no
 * authorization, and re-measures the live sheet from scratch. It has no execute path and no repair path: if a
 * real movement id or a movement's content is missing, it STOPS and says so, because the remedy for missing
 * ledger data is a person, not a diagnostic.
 *
 * WHAT IT WILL NOT DO, and each of these was a live proposal: insert a row, restore the physical extent to 97,
 * move a movement back to an old sheet row, roll back the operator's deletion, or clear or delete anything.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_POST_MANUAL_DELETION_ACCEPTANCE_MANIFEST(opts) {
  opts = opts || {};
  // The same seam R4F and R4H use: a caller may pin a different expectation, and the run SAYS SO in its own
  // output so a fixture's answer can never be read as the live one.
  var EXP = opts.expect ? opts.expect : S1_MOV_POST_DELETION_LIVE_;
  var out = {
    manifest: 'S1 FACTORY MOVEMENT POST-MANUAL-DELETION ACCEPTANCE — read-only re-measurement of the'
      + ' current state; no frozen baseline, no authorization, no repair path',
    build: S1_BUILD_, dry_run: true, read_only: true,
    writes: 0, writer_calls: 0, cells_written: 0, cells_cleared: 0, cells_restored: 0,
    rows_added: 0, rows_inserted: 0, rows_removed: 0, rows_reordered: false, ids_minted: 0,
    tables_created: 0, migration_called: false, gap_job_called: false,
    generate_called: false, submit_called: false, factory_writer_called: false,
    tables_touched: [],
    frozen_baseline_required: false, frozen_baseline_used: null,
    authorization_required: false, authorization_used: null,
    measured_at: null,
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    identity_contract: S1_MOV_IDENTITY_CONTRACT_,
    expectation_source: opts.expect
      ? 'CALLER_SUPPLIED — NOT the operator statement. This run is pinned to an expectation the caller'
        + ' provided, which is stated here so it can never be mistaken for the live one.'
      : 'S1_MOV_POST_DELETION_LIVE_ — the operator statement of the state their manual deletion left, plus'
        + ' the two hashes the read-only R4H manifest published before it. NOT S1_MOV_LIVE_FROZEN_, which'
        + ' describes a table that no longer exists in that shape.',
    expected: EXP,
    live_column_count: null, named_column_count: null, live_columns: [],
    header_fingerprint: null, table_combined_fingerprint: null,
    logical: null, physical: null, residue: null, shift: null, integrity: null,
    completion_shape: null,
    pool: null, protected_surfaces: null, control_surface: null,
    manifest_p_handoff: null,
    verdict: 'STOP', stop_reasons: [],
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [],
    next_action: null };
  var L = S1_ledger_();
  function stop(r) { if (out.stop_reasons.indexOf(r) === -1) out.stop_reasons.push(r); }

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    if (out.stop_reasons.length || L.failed.length) out.verdict = 'STOP';
    out.next_action = (out.verdict === S1_ACCEPT_VERDICT_DELETED_
      || out.verdict === S1_ACCEPT_VERDICT_CLEARED_) ? S1_ACCEPT_NEXT_ : S1_ACCEPT_NEXT_STOP_;
    // THIS MANIFEST NEVER REPAIRS. Stated in the return value rather than only in a comment, so a caller
    // reading a STOP cannot mistake it for something that will resolve itself on a second run.
    out.repair_path_exists = false;
    out.insert_row_considered = false;
    S1_log_('s1_mov_post_deletion_acceptance_verdict', JSON.stringify({
      build: out.build, verdict: out.verdict, next_action: out.next_action,
      completion_shape: out.completion_shape,
      writes: out.writes, rows_inserted: out.rows_inserted, rows_removed: out.rows_removed,
      frozen_baseline_used: out.frozen_baseline_used, authorization_used: out.authorization_used,
      logical_movement_record_count: out.logical ? out.logical.record_count : null,
      id_universe_fingerprint: out.logical ? out.logical.id_universe_fingerprint : null,
      content_by_id_fingerprint: out.logical ? out.logical.content_by_id_fingerprint : null,
      logical_table_fingerprint: out.logical ? out.logical.logical_table_fingerprint : null,
      physical_layout_fingerprint: out.logical ? out.logical.physical_layout_fingerprint : null,
      physical_last_row: out.physical ? out.physical.physical_last_row : null,
      rows_moved_up_by: out.shift ? out.shift.rows_moved_up_by : null,
      residue_absent: out.residue ? out.residue.absent : null,
      predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
      failed: out.failed_predicates.slice(0, 12),
      stop_reasons: out.stop_reasons.slice(0, 12) }));
    return out;
  }

  try {
    out.measured_at = (typeof procurementTimestamp_ === 'function') ? procurementTimestamp_() : null;
    // THE EXPECTATION IS THE AFTER, NEVER THE BEFORE. E3E783BF describes a table that no longer exists in
    // that shape; a run that held today's sheet to it would refuse a finished job. Asserted against
    // S1_MOV_LIVE_FROZEN_ itself rather than against the literal, so the check survives a re-pin.
    out.expectation_is_a_before_value = S1_str_(EXP.logical_table_fingerprint)
      === S1_str_(S1_MOV_LIVE_FROZEN_.table_combined_fingerprint);
    L.P('the_expectation_is_an_after_state_and_not_the_removal_BEFORE_fingerprint',
      false, out.expectation_is_a_before_value, out.expectation_is_a_before_value === false);
    if (!opts.expect) {
      L.P('the_default_pin_is_the_post_deletion_one', 'FC67B70E', EXP.logical_table_fingerprint,
        EXP.logical_table_fingerprint === 'FC67B70E');
    }
    L.P('no_frozen_removal_baseline_and_no_authorization_were_consumed',
      { frozen: null, authorization: null },
      { frozen: out.frozen_baseline_used, authorization: out.authorization_used },
      out.frozen_baseline_used === null && out.authorization_used === null);

    var R = S1_movReadForRepair_();
    L.P('the_movement_table_was_read_through_the_shared_read_authority', [], R.stop_reasons,
      R.ok === true && R.stop_reasons.length === 0);
    if (!R.ok) { R.stop_reasons.forEach(stop); return fin(); }
    out.live_columns = R.live_columns;
    out.live_column_count = R.live_column_count;
    out.named_column_count = R.named_column_count;
    out.header_fingerprint = R.header_fingerprint;
    out.table_combined_fingerprint = R.table_combined_fingerprint;
    out.integrity = { row_count: R.integrity.row_count, ok_count: R.integrity.ok_count,
      blank_id_count: R.integrity.blank_id_count, duplicate_id_count: R.integrity.duplicate_id_count,
      wrong_type_id_count: R.integrity.wrong_type_id_count,
      outside_named_columns_count: R.integrity.outside_named_columns_count,
      id_fault_count: (R.faults || []).length };

    // ---- §1 THE SCHEMA. A shifted row map is acceptable; a changed header is not. --------------------
    L.P('the_header_is_the_one_it_has_always_been', EXP.header_fingerprint, R.header_fingerprint,
      S1_str_(R.header_fingerprint) === EXP.header_fingerprint);
    if (S1_str_(R.header_fingerprint) !== EXP.header_fingerprint) { stop('HEADER_OR_SCHEMA_DRIFTED'); }
    L.P('the_live_column_count_is_unchanged', EXP.live_column_count, R.live_column_count,
      R.live_column_count === EXP.live_column_count);
    if (R.live_column_count !== EXP.live_column_count) { stop('COLUMN_COUNT_DRIFTED'); }

    // ---- §2 LOGICAL IDENTITY. Not one of these values contains a row number. ------------------------
    var logical = S1_movLogicalIdentity_(R.t, R.id_column);
    out.logical = logical;
    L.P('the_logical_record_count_is_the_ninety_five_real_movements',
      EXP.logical_movement_record_count, logical.record_count,
      logical.record_count === EXP.logical_movement_record_count);
    if (logical.record_count !== EXP.logical_movement_record_count) {
      stop('LOGICAL_RECORD_COUNT_IS_NOT_' + EXP.logical_movement_record_count);
    }
    var validNow = R.integrity.ok_count - R.integrity.duplicate_id_count - R.integrity.wrong_type_id_count;
    L.P('every_record_carries_a_valid_movement_id', EXP.valid_id_count, validNow,
      validNow === EXP.valid_id_count);
    if (validNow !== EXP.valid_id_count) { stop('VALID_ID_COUNT_IS_NOT_' + EXP.valid_id_count); }
    L.P('no_blank_movement_id_remains', EXP.blank_id_count, R.integrity.blank_id_count,
      R.integrity.blank_id_count === EXP.blank_id_count);
    if (R.integrity.blank_id_count !== EXP.blank_id_count) { stop('A_BLANK_MOVEMENT_ID_IS_PRESENT'); }
    L.P('no_duplicate_movement_id', EXP.duplicate_id_count, R.integrity.duplicate_id_count,
      R.integrity.duplicate_id_count === EXP.duplicate_id_count);
    if (R.integrity.duplicate_id_count !== EXP.duplicate_id_count) { stop('A_DUPLICATE_MOVEMENT_ID_IS_PRESENT'); }
    L.P('no_wrong_typed_movement_id', EXP.wrong_type_id_count, R.integrity.wrong_type_id_count,
      R.integrity.wrong_type_id_count === EXP.wrong_type_id_count);
    if (R.integrity.wrong_type_id_count !== EXP.wrong_type_id_count) { stop('A_WRONG_TYPED_MOVEMENT_ID_IS_PRESENT'); }
    L.P('no_row_sits_outside_the_named_columns', EXP.outside_named_column_row_count,
      R.integrity.outside_named_columns_count,
      R.integrity.outside_named_columns_count === EXP.outside_named_column_row_count);
    if (R.integrity.outside_named_columns_count !== EXP.outside_named_column_row_count) {
      stop('A_ROW_SITS_OUTSIDE_THE_NAMED_COLUMNS');
    }
    L.P('the_id_universe_is_the_complete_ninety_five', EXP.id_universe_fingerprint,
      logical.id_universe_fingerprint,
      S1_str_(logical.id_universe_fingerprint) === EXP.id_universe_fingerprint);
    if (S1_str_(logical.id_universe_fingerprint) !== EXP.id_universe_fingerprint) {
      stop('A_MOVEMENT_ID_IS_MISSING_FROM_OR_FOREIGN_TO_THE_UNIVERSE');
    }
    // CONTENT-BY-ID, PROVED THROUGH THE PUBLISHED EXPECTED-AFTER. FC67B70E is a hash over one
    // `id~full-row-content` signature per record, sorted — so if today's value equals it, the ninety-five
    // (id, content) pairs are exactly the ninety-five that were there before the deletion. Nothing was
    // edited while the rows were being moved.
    L.P('the_content_under_every_id_is_the_content_that_was_there_before_the_deletion',
      EXP.logical_table_fingerprint, logical.logical_table_fingerprint,
      S1_str_(logical.logical_table_fingerprint) === EXP.logical_table_fingerprint);
    if (S1_str_(logical.logical_table_fingerprint) !== EXP.logical_table_fingerprint) {
      stop('A_MOVEMENT_ID_SURVIVED_BUT_ITS_BUSINESS_CONTENT_CHANGED');
    }
    // AND THE FINGERPRINT THIS PACKAGE HAS BEEN QUOTING WAS ALREADY LOGICAL. Asserted rather than claimed.
    L.P('the_table_fingerprint_never_contained_a_row_number',
      logical.logical_table_fingerprint, R.table_combined_fingerprint,
      S1_str_(logical.logical_table_fingerprint) === S1_str_(R.table_combined_fingerprint));

    // ---- §3 PHYSICAL LAYOUT. Measured, reported, and not an identity. -------------------------------
    var lastRow = null;
    try { lastRow = R.sheet.getLastRow(); } catch (e0) { lastRow = null; }
    out.physical = { physical_last_row: lastRow, header_row: 1,
      physical_layout_fingerprint: logical.physical_layout_fingerprint,
      blank_spacer_rows: (typeof lastRow === 'number') ? (lastRow - 1 - logical.record_count) : null,
      is_an_identity: false,
      note: 'A physical_last_row of ' + S1_str_(lastRow) + ' is where the rows are kept. On its own it is'
        + ' never evidence of data loss, and it is never a reason to insert a row.' };
    L.P('the_physical_extent_was_measurable', 'a number', lastRow, typeof lastRow === 'number');
    if (typeof lastRow !== 'number') { stop('PHYSICAL_ROW_EXTENT_NOT_MEASURABLE'); return fin(); }

    // ---- §4 THE RESIDUE IS GONE, AND THE SURVIVORS MOVED TOGETHER. ----------------------------------
    out.residue = S1_movResidueAbsent_(R.t, EXP.residue_row_fingerprint);
    L.P('the_legacy_test_residue_is_absent', 0, out.residue.occurrences, out.residue.absent === true);
    if (!out.residue.absent) { stop('THE_LEGACY_TEST_RESIDUE_IS_STILL_ON_THE_SHEET'); }
    out.shift = S1_movDetectUniformShift_(R.t, EXP.pre_deletion_row_map_fingerprint, [0, 1]);
    L.P('all_surviving_records_shifted_consistently', true, out.shift.uniform_shift_detected,
      out.shift.uniform_shift_detected === true);
    if (out.shift.uniform_shift_detected !== true) {
      stop('THE_SURVIVING_ROWS_DID_NOT_ALL_MOVE_BY_THE_SAME_AMOUNT');
    }

    var completion = S1_movRemovalAlreadyComplete_(R, lastRow, {
      target_row_fingerprint: EXP.residue_row_fingerprint,
      header_fingerprint: EXP.header_fingerprint,
      logical_movement_record_count: EXP.logical_movement_record_count + 1 });
    out.completion_shape = completion.completion_shape;
    L.P('the_completion_shape_is_one_this_contract_accepts',
      S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW,
      out.completion_shape,
      S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW
        .indexOf(out.completion_shape) !== -1);
    if (S1_MOV_IDENTITY_CONTRACT_.accepted_completions_for_an_INVALID_NON_LEDGER_ROW
      .indexOf(out.completion_shape) === -1) {
      stop('THE_COMPLETION_SHAPE_IS_NOT_RECOGNISED:' + out.completion_shape);
    }
    if (out.completion_shape === S1_MOV_COMPLETION_DELETED_) {
      L.P('the_rows_moved_up_by_exactly_one', EXP.expected_rows_moved_up_by, out.shift.rows_moved_up_by,
        out.shift.rows_moved_up_by === EXP.expected_rows_moved_up_by);
      L.P('no_blank_spacer_row_was_inserted_to_make_the_layout_match', 0,
        out.physical.blank_spacer_rows, out.physical.blank_spacer_rows === 0);
      L.P('the_physical_extent_is_the_one_the_deletion_left', EXP.physical_last_row, lastRow,
        lastRow === EXP.physical_last_row);
    } else if (out.completion_shape === S1_MOV_COMPLETION_CLEARED_) {
      L.P('nothing_moved_because_the_physical_row_was_kept', 0, out.shift.rows_moved_up_by,
        out.shift.rows_moved_up_by === 0);
    }

    // ---- §5 EVERYTHING THIS REMOVAL WAS NEVER ALLOWED TO TOUCH. -------------------------------------
    var pool = S1_remPoolObservation_(R.ss, EXP.pool_warehouse_id, EXP.pool_sku);
    out.pool = pool;
    L.P('the_factory_stock_pool_row_is_unchanged',
      { current: EXP.pool_fac_current_stock, reserved: EXP.pool_fac_reserved_stock,
        row_fingerprint: EXP.pool_row_fingerprint },
      { current: pool.fac_current_stock, reserved: pool.fac_reserved_stock,
        row_fingerprint: pool.row_fingerprint },
      pool.fac_current_stock === EXP.pool_fac_current_stock
        && pool.fac_reserved_stock === EXP.pool_fac_reserved_stock
        && S1_str_(pool.row_fingerprint) === EXP.pool_row_fingerprint);
    if (!(pool.fac_current_stock === EXP.pool_fac_current_stock
      && pool.fac_reserved_stock === EXP.pool_fac_reserved_stock
      && S1_str_(pool.row_fingerprint) === EXP.pool_row_fingerprint)) { stop('FACTORY_STOCK_DRIFTED'); }
    L.P('the_factory_stock_table_is_unchanged', EXP.pool_table_combined_fingerprint,
      pool.table_combined_fingerprint,
      S1_str_(pool.table_combined_fingerprint) === EXP.pool_table_combined_fingerprint);
    if (S1_str_(pool.table_combined_fingerprint) !== EXP.pool_table_combined_fingerprint) {
      stop('FACTORY_STOCK_TABLE_DRIFTED');
    }
    var prot = S1_remProtectedSurfaces_(R.ss);
    out.protected_surfaces = prot;
    L.P('every_protected_surface_is_unchanged', EXP.protected_surface_fingerprint, prot.fingerprint,
      S1_str_(prot.fingerprint) === EXP.protected_surface_fingerprint);
    if (S1_str_(prot.fingerprint) !== EXP.protected_surface_fingerprint) { stop('PROTECTED_SURFACE_DRIFTED'); }
    var ctl = S1_remControlSurface_();
    out.control_surface = ctl;
    L.P('the_generation_flag_is_still_false', EXP.flag_value, ctl.flag_value,
      ctl.flag_value === EXP.flag_value);
    if (ctl.flag_value !== EXP.flag_value) { stop('THE_GENERATION_FLAG_IS_NOT_FALSE'); }
    L.P('the_activation_allowlist_is_still_the_one_scope',
      { count: EXP.allowlist_count, fingerprint: EXP.allowlist_fingerprint },
      { count: ctl.allowlist_count, fingerprint: ctl.allowlist_fingerprint },
      ctl.allowlist_count === EXP.allowlist_count
        && S1_str_(ctl.allowlist_fingerprint) === EXP.allowlist_fingerprint);
    if (!(ctl.allowlist_count === EXP.allowlist_count
      && S1_str_(ctl.allowlist_fingerprint) === EXP.allowlist_fingerprint)) { stop('ALLOWLIST_DRIFTED'); }
    L.P('the_build_is_this_files_own_pin', S1_BUILD_, ctl.deployment_build,
      S1_str_(ctl.deployment_build) === S1_BUILD_);
    if (S1_str_(ctl.deployment_build) !== S1_BUILD_) { stop('BUILD_DRIFTED'); }

    // ---- §6 THE HANDOFF. Manifest P re-measures; it inherits nothing from the removal. ---------------
    out.manifest_p_handoff = {
      next_action: S1_ACCEPT_NEXT_,
      manifest_p_must_remeasure: true,
      // S1-R5 — the handoff reports the STAGE the destination is in, not a null it will stop being.
      // `s1_manifest_p_before_is_still_null` is kept and still answers exactly what it says, because a
      // reader of an older report needs the same word to keep the same meaning; it is now beside the
      // stage, which is the fact that actually matters after the freeze.
      s1_manifest_p_before_is_still_null:
        (typeof S1_MANIFEST_P_BEFORE_ !== 'undefined' && S1_MANIFEST_P_BEFORE_ === null),
      s1_manifest_p_baseline_stage: (typeof S1_MANIFEST_P_BEFORE_ === 'undefined') ? 'SYMBOL_MISSING'
        : (S1_MANIFEST_P_BEFORE_ === null ? 'EMPTY' : 'FROZEN'),
      s1_manifest_p_baseline_carries_removal_era_facts:
        (typeof S1_MANIFEST_P_BEFORE_ === 'undefined') ? null
          : S1_freezeCarriesRemovalEra_(S1_MANIFEST_P_BEFORE_),
      live_state_manifest_p_will_measure: {
        physical_last_row: lastRow,
        logical_movement_record_count: logical.record_count,
        header_fingerprint: R.header_fingerprint,
        logical_table_fingerprint: logical.logical_table_fingerprint,
        id_universe_fingerprint: logical.id_universe_fingerprint,
        content_by_id_fingerprint: logical.content_by_id_fingerprint
      },
      must_not_be_carried_forward: [
        'the removal BEFORE table fingerprint E3E783BF',
        'physical last row 97 as a required condition',
        'the blank row-2 raw fingerprint 91702192',
        'the removal authorization sentence — it was issued against a state that no longer exists',
        'any frozen removal baseline'
      ],
      freeze_block_may_be_hand_edited: false,
      note: 'Manifest P freezes from its own read. Hand-editing an old freeze block to the new numbers would'
        + ' produce a baseline nobody measured, which is the one thing a baseline exists to prevent.'
    };
    // S1-R5 — WHAT THIS PREDICATE OWNS IS THE `must_not_be_carried_forward` LIST ABOVE, EXECUTED.
    //
    // It asked for null, which was a proxy for "Manifest P has not yet frozen anything from the
    // removal era". Manifest P has now run and frozen, so the proxy fails while the thing it stood for
    // is perfectly true — and the list right above this line is the thing it stood for. A frozen
    // baseline is fine; a frozen baseline carrying E3E783BF, 91702192, 2CA4D4BE, a physical extent of
    // 97, or the consumed authorization sentence is not, and that is now checked rather than implied.
    var mpDest = (typeof S1_MANIFEST_P_BEFORE_ === 'undefined') ? undefined : S1_MANIFEST_P_BEFORE_;
    var mpCarried = (mpDest === undefined) ? ['SYMBOL_MISSING'] : S1_freezeCarriesRemovalEra_(mpDest);
    L.P('the_manifest_p_baseline_carries_nothing_from_the_removal_era',
      { stage: 'EMPTY or FROZEN', must_not_be_carried_forward_found: [] },
      { stage: (mpDest === undefined) ? 'SYMBOL_MISSING' : (mpDest === null ? 'EMPTY' : 'FROZEN'),
        must_not_be_carried_forward_found: mpCarried },
      mpDest !== undefined && mpCarried.length === 0);

    // ---- §7 THIS RUN WROTE NOTHING, AND SAYS SO AS A MEASUREMENT. -----------------------------------
    L.P('this_manifest_wrote_nothing',
      { writes: 0, rows_inserted: 0, rows_removed: 0, cells_cleared: 0 },
      { writes: out.writes, rows_inserted: out.rows_inserted, rows_removed: out.rows_removed,
        cells_cleared: out.cells_cleared },
      out.writes === 0 && out.rows_inserted === 0 && out.rows_removed === 0 && out.cells_cleared === 0);

    if (!out.stop_reasons.length && !L.failed.length) {
      out.verdict = (out.completion_shape === S1_MOV_COMPLETION_DELETED_)
        ? S1_ACCEPT_VERDICT_DELETED_ : S1_ACCEPT_VERDICT_CLEARED_;
    }
    return fin();
  } catch (e) {
    stop('ACCEPTANCE_MANIFEST_THREW:' + S1_cap_(String(e && e.message ? e.message : e), 160));
    return fin();
  }
}

var S1_MOV_LIVE_FROZEN_ = {
  build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6',
  header_fingerprint: 'FDC8D1DB',
  table_combined_fingerprint: 'E3E783BF',
  row_count: 96,
  valid_id_count: 95,
  blank_id_count: 1,
  duplicate_id_count: 0,
  wrong_type_id_count: 0,
  outside_named_column_row_count: 0,
  target_row_number: 2,
  target_row_fingerprint: '2CA4D4BE',
  target_movement_type_is_blank: true,
  pool_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN',
  pool_sku: 'CO1100-R',
  authority: 'S1-R4E measurement, frozen by the operator in the S1-R4F authorization'
};

/**
 * WHAT EACH SHIPPED WRITER CANNOT LEAVE BLANK, AND WHAT IT ALWAYS WRITES THE SAME.
 *
 * This is a contract read off the source, not a history read off the data, and that is what makes it able to
 * ELIMINATE. `never_blank` lists only columns that are structurally unblankable: a literal constant, a value
 * behind an `||` default, a validated-required input, or a computed number (0 is a number and canonicalizes
 * to N:0, so a zero is NOT a blank - a distinction that does real work here, because both reserved columns
 * of the live row are blank rather than zero).
 *
 * `always_constant` is stronger still: a row whose value differs from the constant cannot be that writer's,
 * and a BLANK differs from every constant.
 */
var S1_MOV_WRITER_SIGNATURES_ = [
  { writer: '21_ handleAdjustFactoryInventory_',
    source: '21_factory_inventory_handlers.gs, the movObj it appends',
    always_constant: { movement_type: 'manual_adjustment', related_entity_type: 'inventory_adjustment' },
    never_blank: ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type',
      'related_entity_type', 'before_current_stock', 'after_current_stock',
      'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'],
    never_blank_because: 'id is minted; movement_date and created_at are `now`; movement_type and'
      + ' related_entity_type are literals; the four before/after cells are numbers; note is validated'
      + ' ("Note is required"); created_by is String(body.created_by || \'operation-system\')',
    invariant: 'qty === after_current_stock - before_current_stock' },
  { writer: '21_ factoryStockApplyDeltaTx_ (the shared path 12_, 13_ and 22_ delegate to)',
    source: '21_factory_inventory_handlers.gs, the fcWriteAppendByHeader_ call',
    always_constant: {},
    never_blank: ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id',
      'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock',
      'created_by', 'created_at'],
    never_blank_because: 'id is minted; movement_date is (p.movementDate || now); created_by is'
      + ' (p.createdBy || \'operation-system\'); created_at is now; the four before/after cells are numbers.'
      + ' movement_type is caller-supplied and note is (p.note || \'\'), so neither is claimed here.',
    invariant: 'qty === the delta of the axis movement_type names' },
  { writer: '21_ factoryImportMovObj_ (factoryInventory.import.commit)',
    source: '21_factory_inventory_handlers.gs, factoryImportMovObj_',
    always_constant: { movement_type: 'inventory_import',
      related_entity_type: 'factory_inventory_import' },
    never_blank: ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type',
      'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
      'before_reserved_stock', 'after_reserved_stock', 'created_by', 'created_at'],
    never_blank_because: 'id is minted; movement_date is a ternary over effectiveDate/now;'
      + ' movement_type and related_entity_type are literals; related_entity_id is the batch id;'
      + ' before/after_reserved are both beforeReserved (a number); created_by is defaulted; created_at is now',
    invariant: 'qty === after_current_stock - before_current_stock (written as exactly that expression)' }
];

/**
 * COULD ANY SHIPPED WRITER HAVE PRODUCED THIS ROW?
 *
 * Per writer, every reason it could not, named. A row that no writer could have produced was written before
 * the writers existed or written by hand - and either way its intent is not recoverable from this table,
 * which is a finding rather than a gap.
 */
function S1_movWriterElimination_(rec, liveColumns) {
  var o = { writers_examined: S1_MOV_WRITER_SIGNATURES_.length, per_writer: [],
    writers_that_could_have_written_this_row: [], eliminated_count: 0,
    authority: 'the shipped writers themselves - a contract off the source, not a pattern off the data' };
  if (!rec) { o.per_writer = []; return o; }
  var ax = S1_movAxisAudit_(rec);
  S1_MOV_WRITER_SIGNATURES_.forEach(function (sg) {
    var e = { writer: sg.writer, source: sg.source, could_have_written: true, because: [],
      never_blank_because: sg.never_blank_because, invariant: sg.invariant };
    sg.never_blank.forEach(function (c) {
      if ((liveColumns || []).indexOf(c) === -1) return;      // a column the sheet lacks is a schema question
      if (S1_canonCell_(S1_cellOf_(rec, c)) === '~') {
        e.could_have_written = false;
        e.because.push('THIS_WRITER_NEVER_LEAVES_IT_BLANK:' + c);
      }
    });
    Object.keys(sg.always_constant).forEach(function (c) {
      if ((liveColumns || []).indexOf(c) === -1) return;
      var got = S1_str_(S1_cellOf_(rec, c));
      if (got !== sg.always_constant[c]) {
        e.could_have_written = false;
        e.because.push('THIS_WRITER_ALWAYS_WRITES_' + c + '=' + sg.always_constant[c]
          + '_BUT_THE_ROW_HAS:' + (got === '' ? '<blank>' : got));
      }
    });
    // The invariant is only checkable on the current axis, and only when both cells are numbers. Where it
    // is checkable and fails, it is a further independent reason - where it is not, nothing is claimed.
    if (ax.readings.if_current_axis && ax.readings.if_current_axis.agrees === false
        && sg.invariant.indexOf('after_current_stock - before_current_stock') >= 0) {
      e.could_have_written = false;
      e.because.push('THIS_WRITER_WRITES_QTY_AS_AFTER_MINUS_BEFORE_WHICH_WOULD_BE:'
        + ax.readings.if_current_axis.expected_qty + '_BUT_THE_ROW_CARRIES:'
        + ax.readings.if_current_axis.observed_qty);
    }
    if (e.could_have_written) o.writers_that_could_have_written_this_row.push(sg.writer);
    else o.eliminated_count++;
    o.per_writer.push(e);
  });
  o.no_shipped_writer_could_have_produced_this_row =
    o.writers_that_could_have_written_this_row.length === 0;
  return o;
}

/**
 * WAS THIS ROW LEFT BEHIND BY A SCHEMA WIDENING?
 *
 * The cheapest innocent explanation for a row full of blanks is that the table used to be narrower and the
 * columns were appended later - `fcWriteEnsureColumns_` does exactly that, additively. But a widening can
 * only ever leave a CONTIGUOUS TAIL of blanks, because the appended columns are at the end. So the question
 * is decidable from the blank POSITIONS alone, and it is worth deciding: if the answer were yes, the row
 * would be a normal old record and the missing cells would be missing for a known and harmless reason.
 */
function S1_movColumnAppendHypothesis_(rec, liveColumns) {
  var cols = liveColumns || [];
  var o = { hypothesis: 'the blank cells are appended columns this row predates',
    mechanism: '21_/12_ fcWriteEnsureColumns_ appends missing canonical columns to the right',
    blank_positions_1based: [], filled_positions_1based: [],
    blanks_form_a_contiguous_trailing_block: null, first_blank_position: null,
    last_filled_position: null, supported: null, why: null };
  if (!rec) return o;
  cols.forEach(function (c, i) {
    if (c === '') return;
    (S1_canonCell_(rec.__values[i]) === '~' ? o.blank_positions_1based : o.filled_positions_1based)
      .push(i + 1);
  });
  if (!o.blank_positions_1based.length) {
    o.blanks_form_a_contiguous_trailing_block = false;
    o.supported = false;
    o.why = 'THE_ROW_HAS_NO_BLANK_NAMED_CELLS';
    return o;
  }
  o.first_blank_position = o.blank_positions_1based[0];
  o.last_filled_position = o.filled_positions_1based.length
    ? o.filled_positions_1based[o.filled_positions_1based.length - 1] : null;
  // A trailing block: every blank is to the right of every filled cell.
  o.blanks_form_a_contiguous_trailing_block =
    o.last_filled_position === null || o.first_blank_position > o.last_filled_position;
  o.supported = o.blanks_form_a_contiguous_trailing_block === true;
  o.why = o.supported
    ? 'THE_BLANKS_ARE_A_TRAILING_BLOCK_SO_A_SCHEMA_WIDENING_COULD_EXPLAIN_THEM'
    : 'THE_BLANKS_ARE_INTERLEAVED_WITH_FILLED_CELLS_AT_POSITIONS_'
      + o.blank_positions_1based.join(',') + '_SO_NO_COLUMN_APPEND_CAN_EXPLAIN_THEM';
  return o;
}

/**
 * THE TIME A ROW HAPPENED, AND WHICH COLUMN SAID SO.
 *
 * Two columns carry a time and they are not interchangeable: `created_at` is Required by the schema doc and
 * is when the ROW was written; `movement_date` is a 21_-era column and is when the MOVE is dated. A
 * chronology built by silently preferring one would be a chronology whose ordering authority is invisible,
 * so the column used is returned alongside the value and reported per row.
 *
 * A row with no parseable time gets `ms: null`. It is NOT given today's date, NOT given position zero, and
 * NOT dropped: it sorts last, keeps its sheet order among its equals, and is counted and reported - because
 * "I do not know when this happened" is the single most important thing to say about a legacy row.
 */
function S1_movTimeKey_(rec) {
  var o = { source: 'NONE', raw: null, ms: null, iso: null,
    authority: 'created_at (Required by SHIPMENT_DATABASE_SCHEMA.md) preferred over movement_date'
      + ' (a 21_-era column); neither is invented when both are blank' };
  ['created_at', 'movement_date'].forEach(function (c) {
    if (o.ms !== null) return;
    var v = S1_cellOf_(rec, c);
    if (S1_canonCell_(v) === '~') return;
    var ms = null;
    if (Object.prototype.toString.call(v) === '[object Date]') {
      var t = v.getTime();
      if (!isNaN(t)) ms = t;
    } else {
      var s = S1_str_(v);
      // Only ISO-ish shapes are accepted. A locale string parsed by Date() is a guess about the calendar.
      if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(s)) {
        var p = Date.parse(s.length === 10 ? (s + 'T00:00:00Z') : s.replace(' ', 'T'));
        if (!isNaN(p)) ms = p;
      }
    }
    if (ms !== null) {
      o.source = c; o.raw = S1_canonCell_(v); o.ms = ms;
      try { o.iso = new Date(ms).toISOString(); } catch (e) { o.iso = null; }
    }
  });
  return o;
}

/**
 * The BLANK-SHAPE of a row: which named columns are empty, as a stable ordered list plus a fingerprint.
 * Two rows produced by the same process have the same shape even when every value differs, which is what
 * makes this able to find a batch.
 *
 * AND A SECOND FINGERPRINT THAT IGNORES THE KEY AND THE TYPE, because the first one alone could never find
 * what it is looking for. The target row's blank-shape INCLUDES movement_type, so a row matching it exactly
 * is by definition also unclassified - the exact-shape search can only ever return more of the same problem.
 * The interesting sibling is the row produced by the same process that someone LATER keyed and typed: same
 * blanks everywhere else, those two cells filled. Ignoring exactly those two columns is what makes that row
 * findable, and it is the only relaxation - every other blank still has to match.
 */
var S1_MOV_SHAPE_IGNORED_ = ['factory_stock_movement_id', 'movement_type'];
function S1_movShape_(rec, liveColumns) {
  var blanks = [], filled = [], near = [];
  (liveColumns || []).forEach(function (c, i) {
    if (c === '') return;
    var isBlank = S1_canonCell_(rec.__values[i]) === '~';
    (isBlank ? blanks : filled).push(c);
    if (S1_MOV_SHAPE_IGNORED_.indexOf(c) === -1 && isBlank) near.push(c);
  });
  return { blank_columns: blanks, filled_columns: filled,
    blank_count: blanks.length, filled_count: filled.length,
    ignored_in_the_near_shape: S1_MOV_SHAPE_IGNORED_.slice(),
    shape_fingerprint: S1_fingerprint_(blanks.map(function (c) { return 'BLANK:' + c; })),
    near_shape_fingerprint: S1_fingerprint_(near.map(function (c) { return 'BLANK:' + c; })) };
}

/** The date part of a row's time, for same-day sibling matching. Null when the row has no usable time. */
function S1_movDayOf_(tk) {
  return (tk && tk.iso) ? String(tk.iso).slice(0, 10) : null;
}

/**
 * §1 — THE SAME-POOL CHRONOLOGY, WITH THE SHEET ROW KEPT.
 *
 * Sorted by time, but the original sheet row travels with every entry, because the sheet row is what an
 * operator opens and a position in a sorted list is not a fact about the data - R4C's finding, and the
 * reason `ids[0] = ""` was uninterpretable.
 *
 * Ties and unknowns are handled explicitly rather than left to the engine: entries are decorated with their
 * sheet order and the comparator falls back to it, so the ordering is deterministic without depending on
 * whether this runtime's sort is stable. Rows with no usable time sort LAST and are counted.
 */
function S1_movPoolChronology_(t, warehouseId, sku) {
  var o = { pool_key: S1_poolKey_(warehouseId, sku), warehouse_id: S1_str_(warehouseId),
    sku: S1_str_(sku), entries: [], entry_count: 0,
    rows_without_a_usable_time: 0, time_sources_used: {},
    ordering_authority: 'time ascending, ties and unknowns broken by 1-based sheet row',
    ordering_is_unambiguous: null, tied_time_groups: 0 };
  var dec = [];
  (t.rows || []).forEach(function (r, i) {
    if (S1_poolKey_(S1_cellOf_(r, 'warehouse_id'), S1_cellOf_(r, 'sku'))
        !== S1_poolKey_(warehouseId, sku)) return;
    var tk = S1_movTimeKey_(r);
    if (tk.ms === null) o.rows_without_a_usable_time++;
    o.time_sources_used[tk.source] = (o.time_sources_used[tk.source] || 0) + 1;
    dec.push({ rec: r, tk: tk, sheet_order: i });
  });
  dec.sort(function (a, b) {
    if (a.tk.ms === null && b.tk.ms === null) return a.sheet_order - b.sheet_order;
    if (a.tk.ms === null) return 1;                       // unknown time goes last, never first
    if (b.tk.ms === null) return -1;
    if (a.tk.ms !== b.tk.ms) return a.tk.ms - b.tk.ms;
    return a.sheet_order - b.sheet_order;
  });
  var byMs = {};
  dec.forEach(function (d, pos) {
    var rec = d.rec;
    if (d.tk.ms !== null) byMs[d.tk.ms] = (byMs[d.tk.ms] || 0) + 1;
    o.entries.push({
      position_in_chronology_1based: pos + 1,
      one_based_sheet_row_number: rec.row_number,
      movement_id: S1_str_(S1_cellOf_(rec, 'factory_stock_movement_id')) || null,
      movement_type: S1_str_(S1_cellOf_(rec, 'movement_type')) || null,
      created_at: S1_canonCell_(S1_cellOf_(rec, 'created_at')),
      movement_date: S1_canonCell_(S1_cellOf_(rec, 'movement_date')),
      time_source: d.tk.source, time_iso: d.tk.iso,
      qty: S1_qty_(S1_cellOf_(rec, 'qty')),
      before_current_stock: S1_qty_(S1_cellOf_(rec, 'before_current_stock')),
      after_current_stock: S1_qty_(S1_cellOf_(rec, 'after_current_stock')),
      before_reserved_stock: S1_qty_(S1_cellOf_(rec, 'before_reserved_stock')),
      after_reserved_stock: S1_qty_(S1_cellOf_(rec, 'after_reserved_stock')),
      related_entity_type: S1_str_(S1_cellOf_(rec, 'related_entity_type')) || null,
      related_entity_id: S1_str_(S1_cellOf_(rec, 'related_entity_id')) || null,
      note: S1_cap_(S1_cellOf_(rec, 'note'), 60) || null,
      created_by: S1_str_(S1_cellOf_(rec, 'created_by')) || null,
      full_named_row_fingerprint: rec.fingerprint,
      classifiable: S1_str_(S1_cellOf_(rec, 'movement_type')) !== '',
      // R4G — CLASSIFIABLE AND WRITER-PRODUCED ARE DIFFERENT QUESTIONS. `classifiable` asks only whether a
      // type is present; the epoch test (§A) needs to know whether the shipped vocabulary knows it, because
      // only a row a shipped writer produced can be claimed to carry that writer's create-path literal.
      movement_type_is_known: S1_movTypeIsKnown_(S1_cellOf_(rec, 'movement_type'))
    });
  });
  o.entry_count = o.entries.length;
  Object.keys(byMs).forEach(function (k) { if (byMs[k] > 1) o.tied_time_groups++; });
  o.ordering_is_unambiguous = o.tied_time_groups === 0 && o.rows_without_a_usable_time === 0;
  return o;
}

/**
 * R4G §A — THE LEDGER EPOCH CONTRACT. WHEN IS A `before` NOT A READING OF THE PREVIOUS `after`?
 *
 * R4F built the chain on one sentence that is true of every SHIPPED row: the later row's `before_*` is an
 * independent statement of the earlier row's `after_*`. It is true because both current-axis writers read
 * that cell out of the live `factory_stock` row before writing:
 *
 *   factoryStockApplyDeltaTx_          21_:257-258   beforeCurrent = Math.round(parseFloat(data[row][curCol]) || 0)
 *   handleFactoryInventoryImportCommit_ 21_:960       beforeCurrent = ex ? ex.current : 0
 *
 * BUT BOTH OF THOSE LINES HAVE A SECOND BRANCH, AND ON IT THE CELL IS NOT A READING AT ALL:
 *
 *   factoryStockApplyDeltaTx_          21_:244-247   targetRow === -1  ->  beforeCurrent = 0; created = true
 *   handleFactoryInventoryImportCommit_ 21_:959-960  ex === null       ->  beforeCurrent = 0  (the ternary default)
 *
 * When the pool row does not exist, `0` is a LITERAL DEFAULT STANDING IN FOR "there was nothing to read".
 * It is not a measurement of a previous balance, because there was no previous balance recorded. Comparing
 * an earlier row's `after_current_stock` against it is the same category of error this file has already
 * found twice: R4C compared a position in a sorted list with an identity, and R4E compared a fingerprint
 * with itself. YOU CANNOT COMPARE AGAINST A PLACEHOLDER FOR AN ABSENCE and call the difference a break.
 *
 * So a link into a row that carries the create-path signature is a LEDGER EPOCH BOUNDARY, and it is neither
 * AGREES nor DISAGREES. That matters in exactly the way R4F got wrong: on the live table the target row
 * closes at 12000 and the next row opens at 0, and R4F reported a broken current chain that removing the
 * target row would "repair" - when what is actually there is a boundary the target row is upstream of.
 *
 * THE SIGNATURE IS NOT `inventory_import`-SPECIFIC, and writing it that way would repeat R4F's other
 * corrected mistake (a sibling testifying by its TYPE NAME rather than by its own cells). BOTH writers
 * take the create path, so the signature is the CELL - `before_current_stock === 0` - plus a type the
 * shipped vocabulary knows, because a type no writer writes cannot be claimed to carry a writer's literal.
 *
 * AND THE SIGNATURE DOES NOT PROVE THE CREATE PATH. `before_current_stock === 0` is genuinely ambiguous:
 *   (a) CREATE  - no pool row existed, and the 0 is the ternary default. The pool's history begins here.
 *   (b) UPDATE  - the pool row existed holding a real 0, and this is an ordinary delta inside one epoch.
 * The discriminator is the EARLIER row: if the previous same-pool `after_current_stock` is also 0 then (b)
 * is fully consistent and the link is an ordinary comparable link. If it is NOT 0 then the two readings are
 * mutually exclusive AND BOTH REQUIRE SOMETHING THE RECORD DOES NOT CONTAIN - (b) an unrecorded balance
 * change from that value down to 0, (a) a pool row that did not exist even though an earlier movement in
 * the same pool claims to have written a balance into it. That is not a break and it is not a reset either;
 * it is a boundary whose kind the ledger cannot settle, so the census names it and refuses to compare.
 */
var S1_MOV_EPOCH_CONTRACT_ = {
  create_path_before_current_literal: 0,
  writer_citations: [
    '21_factory_inventory_handlers.gs:244-247 factoryStockApplyDeltaTx_ - targetRow === -1 =>'
      + ' beforeCurrent = 0; beforeReserved = 0; created = true',
    '21_factory_inventory_handlers.gs:959-960 handleFactoryInventoryImportCommit_ -'
      + ' var ex = stock.byKey[key] || null; var beforeCurrent = ex ? ex.current : 0,'
      + ' beforeReserved = ex ? ex.reserved : 0'
  ],
  comparable_path_citations: [
    '21_factory_inventory_handlers.gs:257-258 - beforeCurrent/beforeReserved are READ from the live'
      + ' factory_stock row, so they are an independent reading of the pool balance at that moment',
    '21_factory_inventory_handlers.gs:960 - ex.current, the same reading on the import path'
  ],
  both_axes_open_at_zero_is_a_strengthening_signal: true,
  a_blank_reserved_cell_does_not_disprove_the_signature: true,
  rule: 'a link INTO a row whose before_current_stock is 0 and whose type the shipped vocabulary knows is'
    + ' NOT COMPARABLE with the previous row\'s after_current_stock unless that previous after is also 0'
};

/** The vocabulary question, asked through the shipped authority and degrading to null when it is absent. */
function S1_movTypeIsKnown_(t) {
  var s = S1_str_(t);
  if (s === '') return false;
  if (typeof factoryStockIsKnownMovementType_ !== 'function') return null;
  try { return factoryStockIsKnownMovementType_(s) === true; } catch (e) { return null; }
}

/**
 * R4G §A.1 — DOES THIS ENTRY CARRY THE POOL-CREATING WRITE'S SIGNATURE?
 * Reported in full rather than as a bare boolean, because the reserved half is a STRENGTHENING signal and a
 * blank reserved cell must not be read as disproof. A blank is not a zero, and it is not a "no" either.
 */
function S1_movCreatePathSignature_(entry) {
  var o = { before_current_is_the_create_path_literal: null, before_reserved_is_zero: null,
    both_axes_open_at_zero: null, movement_type: null, movement_type_is_known: null,
    // THE SINGLE AUTHORITY ON THE VOCABULARY QUESTION. Nothing downstream re-asks it.
    writer_could_have_written_it: null,
    matches: false, undecidable: false, why: null,
    writer_citations: S1_MOV_EPOCH_CONTRACT_.writer_citations.slice() };
  if (!entry) { o.why = 'NO_ENTRY'; return o; }
  o.movement_type = entry.movement_type === undefined ? null : entry.movement_type;
  o.movement_type_is_known = S1_movTypeIsKnown_(o.movement_type);
  o.writer_could_have_written_it = o.movement_type_is_known === true;
  var bc = entry.before_current_stock === undefined ? null : entry.before_current_stock;
  var br = entry.before_reserved_stock === undefined ? null : entry.before_reserved_stock;
  o.before_current_is_the_create_path_literal =
    bc === null ? null : bc === S1_MOV_EPOCH_CONTRACT_.create_path_before_current_literal;
  o.before_reserved_is_zero = br === null ? null : br === 0;
  o.both_axes_open_at_zero = (o.before_current_is_the_create_path_literal === true)
    ? (o.before_reserved_is_zero === null ? null : o.before_reserved_is_zero) : false;
  if (o.before_current_is_the_create_path_literal !== true) {
    o.why = bc === null
      ? 'before_current_stock IS BLANK, SO THE SIGNATURE CANNOT BE READ - a blank is not a zero'
      : 'before_current_stock IS ' + bc + ', NOT THE CREATE-PATH LITERAL 0';
    return o;
  }
  if (o.writer_could_have_written_it) {
    o.matches = true;
    o.why = 'before_current_stock IS THE CREATE-PATH LITERAL 0 AND movement_type "' + o.movement_type
      + '" IS IN THE SHIPPED VOCABULARY, so this cell may be the ternary default a pool-creating write'
      + ' leaves behind rather than a reading of any previous balance'
      + (o.both_axes_open_at_zero === true ? '. BOTH AXES OPEN AT ZERO, which is what both writers do'
        + ' on the create path and strengthens the reading'
        : (o.both_axes_open_at_zero === null ? '. The reserved half is blank and so cannot strengthen or'
          + ' weaken it' : '. The reserved half is NOT zero, which the create path would not produce'));
    return o;
  }
  o.undecidable = true;
  o.why = o.movement_type_is_known === null
    ? 'before_current_stock IS 0 BUT THE VOCABULARY AUTHORITY IS ABSENT, so it cannot be confirmed that a'
      + ' shipped writer produced this row - and an ABSENT AUTHORITY IS NOT AN INVALID VALUE'
    : 'before_current_stock IS 0 BUT movement_type "' + o.movement_type + '" IS NOT IN THE SHIPPED'
      + ' VOCABULARY, so no shipped writer produced this row and the 0 cannot be claimed as a writer literal';
  return o;
}

/**
 * R4G §A.2 — ONE LINK, CLASSIFIED INTO FIVE STATES INSTEAD OF THREE.
 *
 * R4F had AGREES / DISAGREES / UNEVALUABLE. Two states are missing and their absence is what produced the
 * false break: a link across a pool-creating write, and a link whose comparability cannot be established.
 * Neither of those is an agreement and NEITHER IS A DISAGREEMENT.
 *
 * Every comparable link also carries WHY it is comparable (R4G requirement 5): the positive writer-contract
 * reason plus the arithmetic. A continuity claim that does not say what makes the two cells commensurable
 * is the claim R4F could not defend.
 */
function S1_movLinkComparability_(prevEntry, nextEntry, axisName) {
  var afterKey = axisName === 'reserved' ? 'after_reserved_stock' : 'after_current_stock';
  var beforeKey = axisName === 'reserved' ? 'before_reserved_stock' : 'before_current_stock';
  var prev = prevEntry ? prevEntry[afterKey] : null;
  var next = nextEntry ? nextEntry[beforeKey] : null;
  var o = { axis: axisName, earlier_after: prev === undefined ? null : prev,
    later_before: next === undefined ? null : next,
    state: null, comparable: null, discriminating: null, gap: null,
    comparability_basis: null, why: null, epoch_boundary: null, starts_a_new_epoch: false };
  if (o.earlier_after === null || o.later_before === null) {
    o.state = 'UNEVALUABLE'; o.comparable = false; o.discriminating = false;
    o.why = 'one side of the overlap is blank, and a blank is not a quantity';
    return o;
  }
  if (o.earlier_after === o.later_before) {
    o.state = 'AGREES'; o.comparable = true; o.discriminating = true; o.gap = 0;
    o.comparability_basis = 'BOTH_CELLS_ARE_READINGS_OF_THE_SAME_POOL_QUANTITY: '
      + S1_MOV_EPOCH_CONTRACT_.comparable_path_citations.join(' | ');
    o.why = 'the later row opens at ' + o.later_before + ', the value the earlier row says it set';
    return o;
  }
  // The two states R4F did not have. Only the current axis has a documented create-path literal; the
  // reserved axis is carried by the same writers on the same branch, so the same test applies to it.
  var sig = S1_movCreatePathSignature_(nextEntry);
  var opensAtTheCreatePathLiteral = axisName === 'reserved'
    ? (o.later_before === 0)
    : sig.before_current_is_the_create_path_literal === true;
  if (opensAtTheCreatePathLiteral && o.earlier_after !== 0) {
    if (sig.writer_could_have_written_it === true) {
      o.state = 'LEDGER_EPOCH_BOUNDARY'; o.comparable = false; o.discriminating = false;
      o.starts_a_new_epoch = true;
      o.epoch_boundary = { kind: 'POOL_CREATION_OR_UNRECORDED_BALANCE_CHANGE',
        signature: sig,
        both_readings_require_something_unrecorded: true,
        reading_a_pool_creation: 'no factory_stock row existed, so the 0 is the ternary default and this'
          + ' row begins the pool\'s recorded history - but an earlier movement in this same pool claims'
          + ' to have written a balance into that row',
        reading_b_unrecorded_change: 'the pool row existed holding a real 0, which requires the balance to'
          + ' have moved from ' + o.earlier_after + ' to 0 with no movement recording it',
        why_not_a_delta_break: 'a break is a disagreement between two readings of one quantity. Under (a)'
          + ' the later cell is not a reading at all, and under (b) the disagreement is with a change'
          + ' nobody recorded rather than with this link. Neither is a break in this link.' };
      o.why = 'LEDGER_EPOCH_BOUNDARY - ' + sig.why;
      return o;
    }
    o.state = 'NOT_COMPARABLE'; o.comparable = false; o.discriminating = false;
    o.starts_a_new_epoch = true;
    o.epoch_boundary = { kind: sig.movement_type_is_known === null
        ? 'UNDECIDABLE_THE_VOCABULARY_AUTHORITY_IS_ABSENT'
        : 'UNDECIDABLE_THE_LATER_ROW_WAS_NOT_WRITTEN_BY_A_SHIPPED_WRITER',
      signature: sig, both_readings_require_something_unrecorded: null,
      why_not_a_delta_break: 'the later row opens at 0, which is the create-path literal, and whether a'
        + ' shipped writer put it there cannot be established. Calling this a break would assert the one'
        + ' reading that has not been shown.' };
    o.why = 'NOT_COMPARABLE - ' + sig.why;
    return o;
  }
  o.state = 'DISAGREES'; o.comparable = true; o.discriminating = true;
  o.gap = o.later_before - o.earlier_after;
  o.comparability_basis = 'BOTH_CELLS_ARE_READINGS_OF_THE_SAME_POOL_QUANTITY: '
    + S1_MOV_EPOCH_CONTRACT_.comparable_path_citations.join(' | ')
    + ' || AND THIS LINK IS NOT AN EPOCH BOUNDARY: ' + (o.later_before === 0
      ? 'the later row opens at 0 but the earlier row also closes at 0, so a real zero balance explains'
        + ' it without a pool creation'
      : 'the later row opens at ' + o.later_before + ', which is not the create-path literal 0');
  o.why = 'the later row opens at ' + o.later_before + ' and the earlier row closes at ' + o.earlier_after
    + ', a difference of ' + o.gap + ', with both cells commensurable';
  return o;
}

/**
 * §1.4/§1.5 — DOES THE CHAIN JOIN UP?  (R4G: AND IS THE QUESTION EVEN ASKABLE AT THIS LINK?)
 *
 * Every SHIPPED writer records the before/after of BOTH axes on every row by READING them out of the live
 * factory_stock row, so consecutive rows in one pool overlap: the later row's `before` is an independent
 * statement of the earlier row's `after`. That is true on the branch where a pool row exists.
 *
 * R4G §A is the branch where it does not. Both writers pass a LITERAL 0 when they create the pool row, so
 * a `before_current_stock` of 0 may be a placeholder for "there was nothing to read" rather than a reading
 * of anything. A link into such a row is a LEDGER_EPOCH_BOUNDARY and is neither AGREES nor DISAGREES.
 *
 * Five states, then, not three: AGREES, DISAGREES, UNEVALUABLE (a blank on either side - a blank is not a
 * quantity), LEDGER_EPOCH_BOUNDARY, and NOT_COMPARABLE (the signature is there but it cannot be shown that
 * a shipped writer put it there). Only the first two are comparisons, and only they may discriminate.
 */
function S1_movChainContinuity_(chron) {
  var o = { links_examined: 0, links: [],
    current_axis: { checked: 0, agree: 0, disagree: 0, unevaluable: 0, epoch_boundary: 0, not_comparable: 0 },
    reserved_axis: { checked: 0, agree: 0, disagree: 0, unevaluable: 0, epoch_boundary: 0, not_comparable: 0 },
    first_break_at_position: null, first_epoch_boundary_at_position: null,
    chain_is_continuous_on_the_current_axis: null,
    chain_is_continuous_on_the_reserved_axis: null,
    every_readable_link_agrees_on_the_current_axis: null,
    every_readable_link_agrees_on_the_reserved_axis: null,
    every_comparable_link_agrees_on_the_current_axis: null,
    the_current_chain_crosses_a_ledger_epoch_boundary: null,
    rule: 'the later row\'s before_* is an independent statement of the earlier row\'s after_* ONLY WHEN'
      + ' both cells are readings of the same pool quantity. A link with a blank on either side is'
      + ' UNEVALUABLE; a link into a pool-creating write is a LEDGER_EPOCH_BOUNDARY; a link whose'
      + ' comparability cannot be established is NOT_COMPARABLE. None of those three is a break.' };
  var e = chron.entries || [];
  for (var i = 0; i + 1 < e.length; i++) {
    var a = e[i], b = e[i + 1];
    var link = { from_position: a.position_in_chronology_1based, to_position: b.position_in_chronology_1based,
      from_sheet_row: a.one_based_sheet_row_number, to_sheet_row: b.one_based_sheet_row_number,
      current: null, reserved: null, starts_a_new_epoch: false };
    ['current', 'reserved'].forEach(function (axisName) {
      var c = S1_movLinkComparability_(a, b, axisName);
      var bucket = axisName === 'current' ? o.current_axis : o.reserved_axis;
      bucket.checked++;
      if (c.state === 'AGREES') bucket.agree++;
      else if (c.state === 'DISAGREES') {
        bucket.disagree++;
        if (axisName === 'current' && o.first_break_at_position === null) {
          o.first_break_at_position = b.position_in_chronology_1based;
        }
      } else if (c.state === 'UNEVALUABLE') bucket.unevaluable++;
      else if (c.state === 'LEDGER_EPOCH_BOUNDARY') bucket.epoch_boundary++;
      else if (c.state === 'NOT_COMPARABLE') bucket.not_comparable++;
      if (axisName === 'current' && c.starts_a_new_epoch) {
        link.starts_a_new_epoch = true;
        if (o.first_epoch_boundary_at_position === null) {
          o.first_epoch_boundary_at_position = b.position_in_chronology_1based;
        }
      }
      link[axisName] = c;
    });
    o.links.push(link);
    o.links_examined++;
  }
  // R4F CORRECTED THIS ONCE AND R4G CORRECTS IT AGAIN, IN THE OPPOSITE DIRECTION.
  //
  // R4F's fix was that a chain with an UNREAD link is not continuous, however well the readable parts join
  // up - a name answering a narrower question than it asks. That fix stands. What R4F still got wrong is the
  // other half: it counted an EPOCH BOUNDARY as a disagreement, so a chain that is perfectly well-formed
  // across a pool creation was reported as broken, and `removing_it_repairs_a_break` then said the target
  // row was the cause. A boundary is not a break, and three different facts now have three different names:
  //
  //   chain_is_continuous_*                    every link read AND agreed. The strongest claim.
  //   every_readable_link_agrees_*             nothing that could be read disagreed. Silent about holes.
  //   every_comparable_link_agrees_*           nothing COMPARABLE disagreed. Silent about boundaries.
  //
  // None of them borrows another's name, and the boundary count is published beside them so a reader can
  // see which of the three they are entitled to.
  o.chain_is_continuous_on_the_current_axis =
    o.current_axis.checked > 0 && o.current_axis.agree === o.current_axis.checked;
  o.chain_is_continuous_on_the_reserved_axis =
    o.reserved_axis.checked > 0 && o.reserved_axis.agree === o.reserved_axis.checked;
  o.every_readable_link_agrees_on_the_current_axis =
    o.current_axis.agree > 0 && o.current_axis.disagree === 0;
  o.every_readable_link_agrees_on_the_reserved_axis =
    o.reserved_axis.agree > 0 && o.reserved_axis.disagree === 0;
  o.every_comparable_link_agrees_on_the_current_axis =
    (o.current_axis.agree + o.current_axis.disagree) > 0 && o.current_axis.disagree === 0;
  o.the_current_chain_crosses_a_ledger_epoch_boundary =
    (o.current_axis.epoch_boundary + o.current_axis.not_comparable) > 0;
  return o;
}

/**
 * R4G §B — THE CHRONOLOGY, SEGMENTED INTO LEDGER EPOCHS.
 *
 * An epoch is a run of movements whose before/after cells are all readings of one continuously recorded pool
 * balance. A pool-creating write starts a new one, because on that branch the writer's `before` is a literal
 * default rather than a reading (§A). Continuity, and every argument that leans on continuity, is only valid
 * WITHIN an epoch - which is exactly the constraint R4F did not have.
 */
function S1_movEpochs_(chron, targetRowNumber) {
  var chain = S1_movChainContinuity_(chron);
  var e = chron.entries || [];
  var o = { epoch_count: e.length ? 1 : 0, boundaries: [], epoch_index_by_sheet_row: {},
    epoch_index_by_position: {}, target_epoch_index: null, last_entry_epoch_index: null,
    target_is_in_the_last_epoch: null, epochs: [],
    rule: 'an epoch is a run of movements whose before/after cells are all readings of one continuously'
      + ' recorded balance. Continuity arguments are valid WITHIN an epoch and meaningless across one.' };
  var idx = e.length ? 1 : 0;
  var cur = null;
  e.forEach(function (entry, pos) {
    if (pos > 0) {
      var link = chain.links[pos - 1];
      if (link && link.starts_a_new_epoch) {
        idx++;
        o.boundaries.push({ new_epoch_index: idx,
          at_position: entry.position_in_chronology_1based,
          at_sheet_row: entry.one_based_sheet_row_number,
          from_position: chain.links[pos - 1].from_position,
          from_sheet_row: chain.links[pos - 1].from_sheet_row,
          state: link.current.state, kind: link.current.epoch_boundary
            ? link.current.epoch_boundary.kind : null,
          earlier_after_current: link.current.earlier_after,
          later_before_current: link.current.later_before,
          why: link.current.why,
          why_not_a_delta_break: link.current.epoch_boundary
            ? link.current.epoch_boundary.why_not_a_delta_break : null });
        cur = null;
      }
    }
    if (!cur) { cur = { epoch_index: idx, entry_count: 0, first_position: entry.position_in_chronology_1based,
      first_sheet_row: entry.one_based_sheet_row_number, last_position: null, last_sheet_row: null,
      opening_before_current: entry.before_current_stock, closing_after_current: null,
      sheet_rows: [] }; o.epochs.push(cur); }
    cur.entry_count++;
    cur.last_position = entry.position_in_chronology_1based;
    cur.last_sheet_row = entry.one_based_sheet_row_number;
    cur.closing_after_current = entry.after_current_stock;
    cur.sheet_rows.push(entry.one_based_sheet_row_number);
    o.epoch_index_by_sheet_row[String(entry.one_based_sheet_row_number)] = idx;
    o.epoch_index_by_position[String(entry.position_in_chronology_1based)] = idx;
    if (entry.one_based_sheet_row_number === targetRowNumber) o.target_epoch_index = idx;
  });
  o.epoch_count = idx;
  o.last_entry_epoch_index = e.length ? idx : null;
  o.target_is_in_the_last_epoch = (o.target_epoch_index !== null && o.last_entry_epoch_index !== null)
    ? o.target_epoch_index === o.last_entry_epoch_index : null;
  return o;
}

/**
 * R4G §C — THE THREE "NEXT" QUESTIONS, WHICH R4F ANSWERED WITH ONE VARIABLE.
 *
 * R4F had a single `nxt`, found by scanning forward for the first entry with a non-blank movement_type, and
 * published it as `next_same_pool_movement`. Three different questions were collapsed into it, and on the
 * live table they have three different answers:
 *
 *   next_physical_same_pool_movement      the immediate chronological successor, whatever it is
 *   next_classifiable_same_pool_movement  the first successor carrying a movement_type
 *   next_same_ledger_epoch_movement       the first successor reachable WITHOUT crossing a boundary (§B)
 *
 * The third is the only one a continuity argument may use, and it is the one that can be null while the
 * other two are found. R4F having only the second is why it could report "no classifiable movement follows"
 * about a table in which one plainly does.
 */
function S1_movNextMovements_(chron, epochs, targetRowNumber) {
  var e = chron.entries || [];
  var o = { target_position: null, target_epoch_index: epochs ? epochs.target_epoch_index : null,
    next_physical_same_pool_movement: null,
    next_classifiable_same_pool_movement: null,
    next_same_ledger_epoch_movement: null,
    next_same_ledger_epoch_movement_is_classifiable: null,
    a_later_movement_exists_in_this_pool: false,
    a_later_classifiable_movement_exists_in_this_pool: false,
    a_later_movement_exists_in_the_targets_own_epoch: false,
    a_later_classifiable_movement_exists_in_the_targets_own_epoch: false,
    epoch_boundary_immediately_after_the_target: null,
    boundaries_between_the_target_and_the_next_classifiable_movement: [],
    rule: 'THESE ARE THREE DIFFERENT QUESTIONS. A movement that follows physically is not automatically'
      + ' classifiable, and a classifiable one is not automatically in the target\'s own ledger epoch.'
      + ' Only the third may carry a continuity argument, and none of them may be reported as absent'
      + ' when a different one of them was found.' };
  var ti = -1;
  for (var i = 0; i < e.length; i++) {
    if (e[i].one_based_sheet_row_number === targetRowNumber) { ti = i; break; }
  }
  if (ti === -1) return o;
  o.target_position = e[ti].position_in_chronology_1based;
  var tEpoch = epochs && epochs.epoch_index_by_sheet_row
    ? epochs.epoch_index_by_sheet_row[String(targetRowNumber)] : null;
  if (tEpoch !== undefined && tEpoch !== null) o.target_epoch_index = tEpoch;
  if (ti + 1 < e.length) {
    o.next_physical_same_pool_movement = e[ti + 1];
    o.a_later_movement_exists_in_this_pool = true;
  }
  for (var j = ti + 1; j < e.length; j++) {
    if (e[j].classifiable) { o.next_classifiable_same_pool_movement = e[j];
      o.a_later_classifiable_movement_exists_in_this_pool = true; break; }
  }
  for (var k = ti + 1; k < e.length; k++) {
    var kEpoch = epochs && epochs.epoch_index_by_sheet_row
      ? epochs.epoch_index_by_sheet_row[String(e[k].one_based_sheet_row_number)] : null;
    if (kEpoch === undefined) kEpoch = null;
    if (o.target_epoch_index !== null && kEpoch !== o.target_epoch_index) break;   // a boundary intervenes
    o.a_later_movement_exists_in_the_targets_own_epoch = true;
    if (o.next_same_ledger_epoch_movement === null) {
      o.next_same_ledger_epoch_movement = e[k];
      o.next_same_ledger_epoch_movement_is_classifiable = e[k].classifiable === true;
    }
    if (e[k].classifiable) { o.a_later_classifiable_movement_exists_in_the_targets_own_epoch = true; break; }
  }
  (epochs && epochs.boundaries ? epochs.boundaries : []).forEach(function (b) {
    if (o.next_physical_same_pool_movement
        && b.at_sheet_row === o.next_physical_same_pool_movement.one_based_sheet_row_number
        && b.from_sheet_row === targetRowNumber) {
      o.epoch_boundary_immediately_after_the_target = b;
    }
    if (o.target_position !== null && b.at_position > o.target_position
        && (!o.next_classifiable_same_pool_movement
          || b.at_position <= o.next_classifiable_same_pool_movement.position_in_chronology_1based)) {
      o.boundaries_between_the_target_and_the_next_classifiable_movement.push(b);
    }
  });
  return o;
}

/**
 * §1.6 — WHAT THE LEDGER'S LAST WORD IS, AND WHAT factory_stock ACTUALLY HOLDS.
 *
 * The two are supposed to be equal. An agreement here is INDEPENDENT of the target row only when the target
 * is not the last row in the chain - if it were, the balance would be echoing the very cell under question,
 * which is the self-comparison this whole family of diagnostics exists to refuse. So independence is
 * computed and reported, not assumed.
 */
function S1_movBalanceReconcile_(chron, pool, targetRowNumber, epochs) {
  var e = chron.entries || [];
  var last = e.length ? e[e.length - 1] : null;
  var o = { ledger_last_position: last ? last.position_in_chronology_1based : null,
    ledger_last_sheet_row: last ? last.one_based_sheet_row_number : null,
    ledger_last_after_current: last ? last.after_current_stock : null,
    ledger_last_after_reserved: last ? last.after_reserved_stock : null,
    factory_stock_present: pool ? pool.pool_row_found === true : false,
    factory_stock_current: pool ? pool.fac_current_stock : null,
    factory_stock_reserved: pool ? pool.fac_reserved_stock : null,
    current_agrees: null, reserved_agrees: null,
    independent_of_the_target_row: null, why_not_independent: null,
    // R4G §D — the epoch attribution. This is the field whose absence let R4F score a balance agreement
    // as support for a classification of a row on the far side of a boundary.
    target_epoch_index: epochs ? epochs.target_epoch_index : null,
    ledger_last_epoch_index: epochs ? epochs.last_entry_epoch_index : null,
    epoch_count: epochs ? epochs.epoch_count : null,
    balance_is_in_the_same_epoch_as_the_target: null,
    attributable_to_the_target_row: null, why_not_attributable: null,
    what_this_proves: null };
  o.independent_of_the_target_row = !!(last && last.one_based_sheet_row_number !== targetRowNumber);
  if (!o.independent_of_the_target_row) {
    o.why_not_independent = 'THE_TARGET_ROW_IS_THE_LAST_IN_THE_CHAIN_SO_THE_BALANCE_WOULD_BE_COMPARED'
      + '_AGAINST_THE_CELL_UNDER_QUESTION';
  }
  if (o.factory_stock_current !== null && o.ledger_last_after_current !== null) {
    o.current_agrees = o.factory_stock_current === o.ledger_last_after_current;
  }
  if (o.factory_stock_reserved !== null && o.ledger_last_after_reserved !== null) {
    o.reserved_agrees = o.factory_stock_reserved === o.ledger_last_after_reserved;
  }
  // INDEPENDENCE AND ATTRIBUTION ARE TWO DIFFERENT TESTS, AND R4F ONLY HAD THE FIRST.
  //
  // Independence asks: is the balance being compared with a cell other than the one under question? On the
  // live table the answer is yes, because the last chain entry is not the target row. R4F stopped there and
  // scored the agreement as support for two of the four candidates.
  //
  // Attribution asks the question that actually matters: does this agreement say anything about THE TARGET
  // ROW? It does not, if the balance reconciles to an epoch the target row is not in. factory_stock holds
  // one number - the CURRENT balance - and the current balance is produced by the CURRENT epoch. An earlier
  // epoch's rows are upstream of a boundary the balance cannot see past. So the agreement proves the current
  // epoch is well-formed and proves NOTHING about how a row in a previous epoch should be classified.
  //
  // A balance agreement that is independent but not attributable is published, and it supports and
  // contradicts NOTHING. That is the whole of R4G requirement 4's third clause.
  if (o.target_epoch_index !== null && o.ledger_last_epoch_index !== null) {
    o.balance_is_in_the_same_epoch_as_the_target = o.target_epoch_index === o.ledger_last_epoch_index;
  }
  o.attributable_to_the_target_row = !!(o.independent_of_the_target_row
    && o.balance_is_in_the_same_epoch_as_the_target === true);
  if (!o.attributable_to_the_target_row) {
    if (!o.independent_of_the_target_row) {
      o.why_not_attributable = 'NOT_INDEPENDENT:' + o.why_not_independent;
    } else if (o.balance_is_in_the_same_epoch_as_the_target === false) {
      o.why_not_attributable = 'THE_LIVE_BALANCE_RECONCILES_TO_LEDGER_EPOCH_' + o.ledger_last_epoch_index
        + '_AND_THE_TARGET_ROW_IS_IN_EPOCH_' + o.target_epoch_index
        + '_SO_THE_AGREEMENT_IS_UPSTREAM_UNREACHABLE_FROM_THE_TARGET';
    } else {
      o.why_not_attributable = 'THE_EPOCH_OF_THE_TARGET_ROW_OR_OF_THE_LAST_CHAIN_ENTRY_COULD_NOT_BE_DETERMINED';
    }
  }
  o.what_this_proves = o.current_agrees === null
    ? 'NOTHING_MEASURED - the pool row or one of the quantities is absent'
    : (o.current_agrees === false
      ? 'THE_LEDGER_AND_THE_LIVE_BALANCE_ALREADY_DISAGREE - this row is not the only thing to settle'
      : (o.attributable_to_the_target_row
        ? 'THE_TARGETS_OWN_LEDGER_EPOCH_RECONCILES_TO_THE_LIVE_BALANCE'
        : 'ONLY_THAT_LEDGER_EPOCH_' + o.ledger_last_epoch_index + '_RECONCILES_TO_THE_LIVE_BALANCE'
          + ' - it says nothing about the target row, which is in epoch ' + o.target_epoch_index));
  return o;
}

/**
 * §2 — THE SIBLINGS. Rows produced by whatever produced the target row.
 *
 * Matched on the BLANK-SHAPE first, because the shape is what a producing process leaves behind and the
 * values are what the business put in. Same-day and same-warehouse are reported alongside as separate,
 * weaker signals rather than folded into one score.
 *
 * A sibling that IS classified is the interesting case, and it is interesting as EVIDENCE ABOUT THE BATCH -
 * never as a source of values. Copying a sibling's movement_type into the target would be inventing the one
 * fact this whole census exists because nobody recorded.
 */
function S1_movSiblings_(t, targetRec, liveColumns) {
  var tShape = S1_movShape_(targetRec, liveColumns);
  var tTk = S1_movTimeKey_(targetRec);
  var tDay = S1_movDayOf_(tTk);
  var tWh = S1_str_(S1_cellOf_(targetRec, 'warehouse_id'));
  var o = { target_shape_fingerprint: tShape.shape_fingerprint,
    target_near_shape_fingerprint: tShape.near_shape_fingerprint,
    target_blank_columns: tShape.blank_columns,
    ignored_in_the_near_shape: tShape.ignored_in_the_near_shape, target_day: tDay,
    exact_shape_match_count: 0, near_shape_match_count: 0,
    same_day_count: 0, same_warehouse_count: 0,
    same_qty_pattern_count: 0, candidates: [], candidate_count: 0,
    movement_type_distribution: {}, with_an_id: 0, without_an_id: 0,
    classified_sibling_available_as_a_template: false,
    template_use: 'PROVENANCE_EVIDENCE_ONLY - a sibling\'s values are facts about the sibling and are'
      + ' never copied into the target row',
    per_column_diff_against_the_first_classified_sibling: null,
    match_rule: 'blank-shape match, exact or ignoring only the primary key and movement_type; same-day,'
      + ' same-warehouse and same qty/before/after pattern are reported separately as weaker signals' };
  var tQty = S1_qty_(S1_cellOf_(targetRec, 'qty'));
  var tBef = S1_qty_(S1_cellOf_(targetRec, 'before_current_stock'));
  var tAft = S1_qty_(S1_cellOf_(targetRec, 'after_current_stock'));
  var firstClassified = null;
  (t.rows || []).forEach(function (r) {
    if (r.row_number === targetRec.row_number) return;
    var sh = S1_movShape_(r, liveColumns);
    var tk = S1_movTimeKey_(r);
    var day = S1_movDayOf_(tk);
    var sameShape = sh.shape_fingerprint !== null
      && sh.shape_fingerprint === tShape.shape_fingerprint;
    var nearShape = sh.near_shape_fingerprint !== null
      && sh.near_shape_fingerprint === tShape.near_shape_fingerprint;
    var sameDay = tDay !== null && day === tDay;
    var sameWh = tWh !== '' && S1_str_(S1_cellOf_(r, 'warehouse_id')) === tWh;
    var sameQtyPattern = tQty !== null
      && S1_qty_(S1_cellOf_(r, 'qty')) === tQty
      && S1_qty_(S1_cellOf_(r, 'before_current_stock')) === tBef
      && S1_qty_(S1_cellOf_(r, 'after_current_stock')) === tAft;
    if (sameShape) o.exact_shape_match_count++;
    if (nearShape) o.near_shape_match_count++;
    if (sameDay) o.same_day_count++;
    if (sameWh) o.same_warehouse_count++;
    if (sameQtyPattern) o.same_qty_pattern_count++;
    if (!nearShape && !sameDay && !sameQtyPattern) return;   // same warehouse alone is 95 rows, not a batch
    var mt = S1_str_(S1_cellOf_(r, 'movement_type'));
    var id = S1_str_(S1_cellOf_(r, 'factory_stock_movement_id'));
    if (id === '') o.without_an_id++; else o.with_an_id++;
    o.movement_type_distribution[mt === '' ? '<blank>' : mt] =
      (o.movement_type_distribution[mt === '' ? '<blank>' : mt] || 0) + 1;
    var c = { one_based_sheet_row_number: r.row_number,
      matched_on: [].concat(sameShape ? ['EXACT_BLANK_SHAPE'] : [],
        (nearShape && !sameShape) ? ['BLANK_SHAPE_IGNORING_THE_KEY_AND_THE_TYPE'] : [],
        sameDay ? ['SAME_DAY'] : [],
        sameWh ? ['SAME_WAREHOUSE'] : [], sameQtyPattern ? ['SAME_QTY_BEFORE_AFTER_PATTERN'] : []),
      movement_id: id || null, movement_type: mt || null,
      shape_fingerprint: sh.shape_fingerprint,
      near_shape_fingerprint: sh.near_shape_fingerprint, blank_count: sh.blank_count,
      time_iso: tk.iso, time_source: tk.source,
      qty: S1_qty_(S1_cellOf_(r, 'qty')),
      before_current_stock: S1_qty_(S1_cellOf_(r, 'before_current_stock')),
      after_current_stock: S1_qty_(S1_cellOf_(r, 'after_current_stock')),
      related_entity_type: S1_str_(S1_cellOf_(r, 'related_entity_type')) || null,
      created_by: S1_str_(S1_cellOf_(r, 'created_by')) || null,
      full_named_row_fingerprint: r.fingerprint };
    if (nearShape && mt !== '' && firstClassified === null) firstClassified = r;
    o.candidates.push(c);
  });
  o.candidate_count = o.candidates.length;
  o.classified_sibling_available_as_a_template = firstClassified !== null;
  if (firstClassified) {
    var sq = S1_qty_(S1_cellOf_(firstClassified, 'qty'));
    var sb2 = S1_qty_(S1_cellOf_(firstClassified, 'before_current_stock'));
    var sa = S1_qty_(S1_cellOf_(firstClassified, 'after_current_stock'));
    o.per_column_diff_against_the_first_classified_sibling = {
      sibling_sheet_row: firstClassified.row_number,
      sibling_movement_id: S1_str_(S1_cellOf_(firstClassified, 'factory_stock_movement_id')) || null,
      sibling_movement_type: S1_str_(S1_cellOf_(firstClassified, 'movement_type')) || null,
      sibling_qty: sq, sibling_before_current_stock: sb2, sibling_after_current_stock: sa,
      // Measured on the sibling's own three cells. UNREADABLE when a cell is blank and AMBIGUOUS when
      // before is 0, because then a delta and a balance are the same number and the sibling cannot
      // distinguish what the target row is being asked to distinguish.
      sibling_convention: (sq === null || sb2 === null || sa === null) ? 'UNREADABLE'
        : (sb2 === 0 ? 'AMBIGUOUS_BECAUSE_ITS_OWN_BEFORE_IS_ZERO'
          : (sq === sa - sb2 ? 'QTY_IS_A_DELTA' : (sq === sa ? 'QTY_IS_A_BALANCE' : 'NEITHER'))),
      columns: (liveColumns || []).filter(function (c) { return c !== ''; }).map(function (c) {
        var mine = S1_canonCell_(S1_cellOf_(targetRec, c));
        var theirs = S1_canonCell_(S1_cellOf_(firstClassified, c));
        return { column: c, target: mine, sibling: theirs, same: mine === theirs };
      }) };
  }
  return o;
}

/**
 * §3 — THE OTHER TABLES, READ ONLY, AND ONLY THE ONES THAT ARE ALREADY THERE.
 *
 * An absent table is reported ABSENT. It is not created, it is not treated as empty, and no job is triggered
 * to fill it: "there is no import-audit table" and "the import-audit table has no matching row" are
 * different answers to the provenance question and only one of them is evidence.
 *
 * Matching is by marker rather than by schema, because these tables do not share a key with a movement row -
 * that is the whole problem. A hit is a cell whose value equals one of the markers, reported with its table,
 * row and column so a person can go and read it.
 */
var S1_MOV_PROVENANCE_TABLES_ = [
  { table: 'factory_stock', why: 'the balance the ledger is supposed to add up to' },
  { table: 'factory_stock_override_audit', why: 'the override/guard audit trail for this factory' },
  { table: 'overseas_inventory_movements', why: 'where a shipment_receipt lands instead of factory stock' },
  { table: 'overseas_inventory_snapshot', why: 'a same-day overseas snapshot for this sku' },
  { table: 'purchase_orders', why: 'a po_receipt movement would name one of these' },
  { table: 'purchase_order_lines', why: 'the received quantity a po_receipt would carry' },
  { table: 'shipments', why: 'a shipment_out movement would name one of these' },
  { table: 'shipment_lines', why: 'the shipped quantity a shipment_out would carry' },
  { table: 'shipping_plans', why: 'a reservation_acquire is written against a plan' },
  { table: 'shipping_plan_lines', why: 'the reserved quantity a plan line would carry' },
  { table: 'reservations', why: 'the reserved-axis owner ledger' },
  { table: 'request_orders', why: 'an upstream request that could have caused an initialization' },
  { table: 'request_order_lines', why: 'the requested quantity of that request' }
];

function S1_movCrossTableScan_(ss, markers, maxHitsPerTable) {
  var cap = maxHitsPerTable === undefined ? 6 : maxHitsPerTable;
  var o = { markers: markers.slice(), tables_examined: 0, tables_present: 0, tables_absent: [],
    tables_unreadable: [], per_table: [], total_hits: 0, tables_with_a_hit: [],
    read_rule: 'only tables that already exist are read; an absent table is reported absent and is never'
      + ' created, filled or inferred to be empty. No job is triggered.' };
  var mset = {};
  markers.forEach(function (m) { mset[S1_str_(m).toLowerCase()] = true; });
  S1_MOV_PROVENANCE_TABLES_.forEach(function (spec) {
    o.tables_examined++;
    var e = { table: spec.table, why_it_could_carry_provenance: spec.why,
      present: false, readable: false, row_count: null, hits_total: 0, hits_shown: 0, hits: [],
      columns_that_matched: [] };
    var t = S1_fullRowTable_(ss, spec.table, null, []);
    e.present = t.present;
    if (!t.present) { o.tables_absent.push(spec.table); o.per_table.push(e); return; }
    o.tables_present++;
    e.readable = t.readable;
    if (!t.readable) { o.tables_unreadable.push(spec.table); o.per_table.push(e); return; }
    e.row_count = t.row_count;
    var cols = t.live_columns || [];
    (t.rows || []).forEach(function (r) {
      var matched = [];
      cols.forEach(function (c, i) {
        if (c === '') return;
        var raw = r.__values[i];
        var s = S1_canonCell_(raw);
        if (s === '~') return;
        // A date cell matches on its date part; every other cell on its trimmed text. Both are compared
        // case-insensitively, because a sku typed by hand is not reliably the same case as an imported one.
        var probe = s.indexOf('D:') === 0 ? S1_str_(s).slice(2, 12) : S1_str_(raw).toLowerCase();
        if (mset[probe] === true) matched.push({ column: c, value: S1_cap_(probe, 40) });
      });
      if (!matched.length) return;
      e.hits_total++;
      matched.forEach(function (m) {
        if (e.columns_that_matched.indexOf(m.column) === -1) e.columns_that_matched.push(m.column);
      });
      if (e.hits.length < cap) {
        e.hits.push({ one_based_sheet_row_number: r.row_number, matched: matched,
          full_row_fingerprint: r.fingerprint,
          note: S1_cap_(S1_cellOf_(r, 'note'), 60) || null,
          created_by: S1_str_(S1_cellOf_(r, 'created_by')) || null,
          created_at: S1_canonCell_(S1_cellOf_(r, 'created_at')) });
      }
    });
    e.hits_shown = e.hits.length;
    e.hits_withheld = Math.max(0, e.hits_total - e.hits_shown);
    o.total_hits += e.hits_total;
    if (e.hits_total > 0) o.tables_with_a_hit.push(spec.table);
    o.per_table.push(e);
  });
  return o;
}

/**
 * §4 CANDIDATE 4's OWN MEASUREMENT — DOES THE LEDGER STAND UP WITHOUT THIS ROW?
 *
 * If the rows either side of the target overlap each other directly, the target is not carrying any part of
 * the balance and removing it costs the chain nothing. That is real support for "this is not a ledger row".
 * If removing it BREAKS an overlap that currently holds, the opposite: the row is load-bearing.
 */
function S1_movChainWithoutTarget_(chron, targetRowNumber, epochs) {
  var kept = { entries: (chron.entries || []).filter(function (e) {
    return e.one_based_sheet_row_number !== targetRowNumber; }) };
  var without = S1_movChainContinuity_(kept);
  var withAll = S1_movChainContinuity_(chron);
  var o = { with_the_target_row: { current_agree: withAll.current_axis.agree,
      current_disagree: withAll.current_axis.disagree,
      current_unevaluable: withAll.current_axis.unevaluable,
      current_epoch_boundary: withAll.current_axis.epoch_boundary,
      current_not_comparable: withAll.current_axis.not_comparable,
      reserved_unevaluable: withAll.reserved_axis.unevaluable },
    without_the_target_row: { current_agree: without.current_axis.agree,
      current_disagree: without.current_axis.disagree,
      current_unevaluable: without.current_axis.unevaluable,
      current_epoch_boundary: without.current_axis.epoch_boundary,
      current_not_comparable: without.current_axis.not_comparable,
      reserved_unevaluable: without.reserved_axis.unevaluable },
    // R4G §E — TRI-STATE, AND THE STATE IS NEVER NULL EVEN WHEN THE BOOLEAN IS.
    removing_it_repairs_a_break: null, removing_it_repairs_a_break_state: null,
    removing_it_repairs_a_break_why: null,
    removing_it_breaks_a_link: null, removing_it_breaks_a_link_state: null,
    comparable_breaks_with_the_target: withAll.current_axis.disagree,
    comparable_breaks_without_the_target: without.current_axis.disagree,
    neighbours_overlap_each_other_directly: null,
    neighbours_overlap_state: null, neighbours_overlap_why: null,
    rule: 'a row the chain does not need is a candidate for not being a ledger row; a row whose removal'
      + ' breaks an overlap is load-bearing and cannot be dismissed. BOTH CLAIMS REQUIRE A COMPARABLE'
      + ' LINK: an epoch boundary is not a break, so removing a row cannot repair one.' };

  // WHY THIS IS THE CORRECTION R4G EXISTS FOR.
  //
  // R4F computed `removing_it_repairs_a_break` from the DISAGREE count alone, and R4F's DISAGREE count
  // included epoch boundaries. On the live table that produced the flagship false claim: the target row
  // closes at 12000, the next row opens at 0 through the create-path literal, R4F counted one disagreement,
  // removing the target row left zero links at all - and the arithmetic 1 > 0 && 0 < 1 published
  // `removing_it_repairs_a_break: true` about a chain that was never broken.
  //
  // Two things are wrong with that and both are fixed here. The count is now boundary-free, so a boundary
  // can no longer be mistaken for a break. And a reduction that comes from having FEWER LINKS rather than
  // fewer disagreements is not a repair either: deleting one of the two rows a comparison was made between
  // removes the comparison, it does not settle it.
  var brokeWith = withAll.current_axis.disagree;
  var brokeWithout = without.current_axis.disagree;
  var comparableWith = withAll.current_axis.agree + withAll.current_axis.disagree;
  var comparableWithout = without.current_axis.agree + without.current_axis.disagree;
  var boundaries = withAll.current_axis.epoch_boundary + withAll.current_axis.not_comparable;
  if (brokeWith === 0) {
    o.removing_it_repairs_a_break = boundaries > 0 ? null : false;
    o.removing_it_repairs_a_break_state = boundaries > 0
      ? 'NOT_APPLICABLE_THE_ONLY_NON_AGREEING_LINKS_ARE_LEDGER_EPOCH_BOUNDARIES'
      : 'NO_BREAK_TO_REPAIR';
    o.removing_it_repairs_a_break_why = boundaries > 0
      ? 'the current chain holds ' + boundaries + ' epoch boundary link(s) and ZERO comparable'
        + ' disagreements. A boundary is not a break, so there is nothing for the removal of any row to'
        + ' repair, and reporting true here would blame the target row for a boundary it is upstream of.'
      : 'the current chain holds no comparable disagreement, so no removal can repair one';
  } else if (brokeWithout < brokeWith && comparableWithout >= comparableWith) {
    o.removing_it_repairs_a_break = true;
    o.removing_it_repairs_a_break_state = 'YES_A_COMPARABLE_DISAGREEMENT_IS_RESOLVED_WITHOUT_IT';
    o.removing_it_repairs_a_break_why = 'comparable disagreements fall from ' + brokeWith + ' to '
      + brokeWithout + ' while the number of comparable links does not fall, so the removal resolves a'
      + ' disagreement rather than merely removing the comparison';
  } else if (brokeWithout < brokeWith) {
    o.removing_it_repairs_a_break = null;
    o.removing_it_repairs_a_break_state = 'NOT_APPLICABLE_THE_DISAGREEMENT_COUNT_ONLY_FELL_BECAUSE_'
      + 'FEWER_LINKS_REMAIN';
    o.removing_it_repairs_a_break_why = 'comparable disagreements fall from ' + brokeWith + ' to '
      + brokeWithout + ', but comparable links also fall from ' + comparableWith + ' to '
      + comparableWithout + '. Deleting one of the two rows a comparison was made between removes the'
      + ' comparison; it does not settle it.';
  } else {
    o.removing_it_repairs_a_break = false;
    o.removing_it_repairs_a_break_state = 'NO_THE_DISAGREEMENT_SURVIVES_WITHOUT_IT';
    o.removing_it_repairs_a_break_why = 'comparable disagreements are ' + brokeWith + ' with the row and '
      + brokeWithout + ' without it';
  }
  if (brokeWithout > brokeWith) {
    o.removing_it_breaks_a_link = true;
    o.removing_it_breaks_a_link_state = 'YES_REMOVING_IT_CREATES_A_COMPARABLE_DISAGREEMENT';
  } else {
    o.removing_it_breaks_a_link = false;
    o.removing_it_breaks_a_link_state = comparableWithout < comparableWith
      ? 'NO_BUT_REMOVING_IT_ALSO_REMOVES_COMPARABLE_LINKS_SO_THIS_IS_NOT_EVIDENCE_THE_ROW_IS_SPARE'
      : 'NO';
  }

  // The bridge test, now boundary-aware: neighbours that sit either side of a boundary cannot bridge,
  // because the value they would be compared on is not a reading of the same balance.
  (function () {
    var e = chron.entries || [];
    for (var i = 0; i + 2 < e.length; i++) {
      if (e[i + 1].one_based_sheet_row_number !== targetRowNumber) continue;
      var epA = epochs && epochs.epoch_index_by_sheet_row
        ? epochs.epoch_index_by_sheet_row[String(e[i].one_based_sheet_row_number)] : null;
      var epC = epochs && epochs.epoch_index_by_sheet_row
        ? epochs.epoch_index_by_sheet_row[String(e[i + 2].one_based_sheet_row_number)] : null;
      if (epA !== null && epC !== null && epA !== epC) {
        o.neighbours_overlap_each_other_directly = null;
        o.neighbours_overlap_state = 'NOT_COMPARABLE_THE_NEIGHBOURS_ARE_IN_DIFFERENT_LEDGER_EPOCHS';
        o.neighbours_overlap_why = 'sheet row ' + e[i].one_based_sheet_row_number + ' is in epoch ' + epA
          + ' and sheet row ' + e[i + 2].one_based_sheet_row_number + ' is in epoch ' + epC
          + ', so bridging them would compare readings of two different recorded balances';
        return;
      }
      var c = S1_movLinkComparability_(e[i], e[i + 2], 'current');
      if (c.state === 'AGREES' || c.state === 'DISAGREES') {
        o.neighbours_overlap_each_other_directly = c.state === 'AGREES';
        o.neighbours_overlap_state = c.state === 'AGREES'
          ? 'YES_THE_NEIGHBOURS_OVERLAP_DIRECTLY' : 'NO_THE_NEIGHBOURS_DO_NOT_OVERLAP';
        o.neighbours_overlap_why = c.why;
        return;
      }
      o.neighbours_overlap_each_other_directly = null;
      o.neighbours_overlap_state = 'NOT_COMPARABLE_' + c.state;
      o.neighbours_overlap_why = c.why;
      return;
    }
    o.neighbours_overlap_each_other_directly = null;
    o.neighbours_overlap_state = 'NOT_APPLICABLE_THE_TARGET_ROW_IS_FIRST_OR_LAST_IN_THE_CHAIN';
    o.neighbours_overlap_why = 'there is nothing on both sides of it to bridge';
  })();
  return o;
}

/**
 * §4 — THE FOUR CANDIDATES, EACH WITH WHAT SUPPORTS IT AND WHAT CONTRADICTS IT.
 *
 * No number is corrected anywhere in here. Each candidate is an interpretation of the cells as they stand,
 * and the arithmetic each one implies is stated so a person can see which cell it would make wrong.
 *
 * EVIDENCE CARRIES ITS SOURCE, and the source is what the independence rule counts. `ROW_SELF_ARITHMETIC` is
 * a source but never an independent one: an interpretation supported only by the row it interprets has a
 * sample size of one, and this file has already found one live case of a fingerprint compared with itself.
 */
var S1_MOV_PROV_SOURCES_ = {
  LEDGER_CHAIN_OVERLAP: { independent: true,
    what: 'another movement row\'s before/after pair, written by a different call at a different time' },
  FACTORY_STOCK_BALANCE: { independent: true,
    what: 'the factory_stock pool row - a different table, maintained by the same transactions' },
  SIBLING_SHAPE_BATCH: { independent: true,
    what: 'a classified row sharing the target\'s exact blank-shape, i.e. its production batch' },
  CROSS_TABLE_EVENT: { independent: true,
    what: 'a matching event in a table that is not the movement ledger' },
  WRITER_CONTRACT: { independent: true,
    what: 'what the shipped writers unconditionally populate - a contract, not a history' },
  ROW_SELF_ARITHMETIC: { independent: false,
    what: 'the target row\'s own cells. NEVER independent: it is the thing being explained' }
};

function S1_movProvEvidence_(source, statement, supports, contradicts) {
  var s = (supports || []).slice(), c = (contradicts || []).slice();
  return { source: source,
    independent: !!(S1_MOV_PROV_SOURCES_[source] && S1_MOV_PROV_SOURCES_[source].independent),
    statement: statement, supports: s, contradicts: c,
    // R4G §F — MEASURED AND NEUTRAL IS NOT THE SAME AS NOT MEASURED, and R4F had no way to say so. An
    // evidence item that names neither a candidate it supports nor one it contradicts is a MEASUREMENT
    // THAT DID NOT DISCRIMINATE. It must be published (something was read) and it must never be counted
    // as support - which is precisely the confusion that let R4F report a found row as an absent one.
    discriminates: s.length > 0 || c.length > 0 };
}

var S1_MOV_CAND_ = ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER',
  'CURRENT_DELTA_FROM_QTY', 'INVALID_NON_LEDGER_ROW'];

function S1_movCandidates_(ax, chron, chain, bal, sib, cross, elim, noTarget, targetRowNumber,
                           epochs, nextMoves) {
  var qty = ax.qty, bef = ax.before_current, aft = ax.after_current;
  var deltaFromPair = (aft === null || bef === null) ? null : (aft - bef);
  var afterFromQty = (bef === null || qty === null) ? null : (bef + qty);
  var ev = [];

  // ---- the row's own arithmetic. One source, and not an independent one. ----
  if (qty !== null && aft !== null && qty === aft) {
    ev.push(S1_movProvEvidence_('ROW_SELF_ARITHMETIC',
      'qty (' + qty + ') equals after_current_stock (' + aft + '), which is what a hand-entered ENDING'
      + ' BALANCE looks like - and also exactly what a delta typed into the wrong cell looks like',
      ['INITIAL_BALANCE_SET'], []));
  }
  if (deltaFromPair !== null && qty !== null && qty !== deltaFromPair) {
    ev.push(S1_movProvEvidence_('ROW_SELF_ARITHMETIC',
      'the before/after pair implies a delta of ' + deltaFromPair + ' and qty carries ' + qty
      + ', so exactly one of the two readings must be wrong',
      ['CURRENT_DELTA_FROM_BEFORE_AFTER', 'CURRENT_DELTA_FROM_QTY', 'INVALID_NON_LEDGER_ROW'], []));
  }
  // R4G §A applied to the TARGET ROW ITSELF. The create-path signature is what a pool initialization
  // leaves behind, and this row does not carry it - on either writer, not just the import one.
  if (bef !== null && bef !== 0) {
    ev.push(S1_movProvEvidence_('WRITER_CONTRACT',
      'before_current_stock is ' + bef + ' and not 0. BOTH current-axis writers pass beforeCurrent = 0 on'
      + ' the branch that CREATES the pool row (factoryStockApplyDeltaTx_ 21_:244-247; the import commit'
      + ' 21_:959-960), so an initialization of this pool would carry 0 here and this row does not',
      [], ['INITIAL_BALANCE_SET']));
  }

  // ---- the writer contract, as elimination. ----
  if (elim && elim.no_shipped_writer_could_have_produced_this_row) {
    ev.push(S1_movProvEvidence_('WRITER_CONTRACT',
      'no shipped writer could have produced this row (' + elim.eliminated_count + ' of '
      + elim.writers_examined + ' eliminated on columns they never leave blank), so its movement_type was'
      + ' never recorded by any code path and cannot be recovered from this table',
      ['INVALID_NON_LEDGER_ROW'], []));
  }

  // ---- R4G §C/§F the discriminator, on the ONLY successor a continuity argument may use. ----
  //
  // R4F used the next CLASSIFIABLE movement, which on the live table sits on the far side of a pool-creating
  // write. Its `before_current_stock` is the create-path literal 0, so comparing it with the target row's
  // `after_current_stock` compares a balance against a placeholder for an absence. R4F's comparison fell
  // through to its final `else`, produced an evidence item supporting and contradicting nothing, and then -
  // because the branch that names the chain reading was derived from WHETHER EVIDENCE ATTACHED rather than
  // from WHETHER A ROW WAS FOUND - every candidate reported "no classifiable movement follows this one in
  // this pool" about a table whose very next row is one, and asked for it in `missing_evidence`.
  //
  // So the successor used here is `next_same_ledger_epoch_movement`, the boundary is published as its own
  // non-discriminating fact, and the chain reading below is computed from the measured facts.
  var nm = nextMoves || {};
  var nxtEpoch = nm.next_same_ledger_epoch_movement || null;
  var nxtClass = nm.next_classifiable_same_pool_movement || null;
  var nxtPhys = nm.next_physical_same_pool_movement || null;
  var chainState = null, chainWhy = null;

  if (nxtEpoch && nxtEpoch.classifiable && nxtEpoch.before_current_stock !== null && aft !== null) {
    if (nxtEpoch.before_current_stock === aft) {
      chainState = 'CONSISTENT'; chainWhy = 'the next movement in the target\'s own ledger epoch opens at '
        + nxtEpoch.before_current_stock + ', confirming after_current_stock = ' + aft;
      ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
        'the next movement in the target\'s OWN ledger epoch (sheet row '
        + nxtEpoch.one_based_sheet_row_number + ', ' + nxtEpoch.movement_type
        + ') opens at before_current_stock = ' + nxtEpoch.before_current_stock
        + ', which independently confirms after_current_stock = ' + aft,
        ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER'], ['CURRENT_DELTA_FROM_QTY']));
    } else if (afterFromQty !== null && nxtEpoch.before_current_stock === afterFromQty) {
      chainState = 'CONTRADICTS_THE_AFTER_CELL';
      chainWhy = 'the next same-epoch movement opens at before+qty, so qty is the reliable cell';
      ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
        'the next movement in the target\'s own ledger epoch opens at ' + nxtEpoch.before_current_stock
        + ', which is before_current_stock + qty (' + bef + ' + ' + qty + '), so qty is the reliable cell'
        + ' and after_current_stock is the wrong one',
        ['CURRENT_DELTA_FROM_QTY'], ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER']));
    } else if (bef !== null && nxtEpoch.before_current_stock === bef) {
      chainState = 'THE_BALANCE_NEVER_MOVED';
      chainWhy = 'the next same-epoch movement opens at the target\'s own before_current_stock';
      ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
        'the next movement in the target\'s own ledger epoch opens at ' + nxtEpoch.before_current_stock
        + ', the target row\'s own before_current_stock, so the balance never moved and this row took no'
        + ' effect', ['INVALID_NON_LEDGER_ROW'], ['INITIAL_BALANCE_SET',
          'CURRENT_DELTA_FROM_BEFORE_AFTER', 'CURRENT_DELTA_FROM_QTY']));
    } else {
      chainState = 'MEASURED_AND_NEUTRAL';
      chainWhy = 'the next same-epoch movement opens at ' + nxtEpoch.before_current_stock
        + ', which matches none of the three readings';
      ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
        'the next movement in the target\'s own ledger epoch opens at ' + nxtEpoch.before_current_stock
        + ', which matches none of after_current_stock (' + aft + '), before+qty (' + afterFromQty
        + ') or before (' + bef + '), so the chain does not choose between the candidates either. MEASURED,'
        + ' AND IT DISCRIMINATES NOTHING - which is not the same as unmeasured.', [], []));
    }
  } else if (nxtEpoch && nxtEpoch.classifiable) {
    chainState = 'NOT_MEASURABLE_BLANK_CELL';
    chainWhy = 'the next same-epoch movement (sheet row ' + nxtEpoch.one_based_sheet_row_number
      + ') has a blank before_current_stock, or the target row has a blank after_current_stock';
  } else if (nxtClass) {
    // FOUND, AND ACROSS A BOUNDARY. This is the live case, and it is the one R4F reported as absent.
    chainState = 'NOT_COMPARABLE_ACROSS_A_BOUNDARY';
    var bl = (nm.boundaries_between_the_target_and_the_next_classifiable_movement || [])[0] || null;
    chainWhy = 'sheet row ' + nxtClass.one_based_sheet_row_number + ' (' + nxtClass.movement_type
      + ') DOES follow the target row in this pool and IS classifiable, but a ledger epoch boundary sits'
      + ' between them' + (bl ? ' at sheet row ' + bl.at_sheet_row + ' (' + bl.kind + ')' : '')
      + ', so its before_current_stock is not a reading of the balance the target row closed at';
    ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
      'THE NEXT CLASSIFIABLE MOVEMENT IN THIS POOL WAS FOUND - sheet row '
      + nxtClass.one_based_sheet_row_number + ', ' + nxtClass.movement_type + ', opening at '
      + nxtClass.before_current_stock + ' - AND IT IS NOT COMPARABLE WITH THE TARGET ROW, because a ledger'
      + ' epoch boundary separates them' + (bl ? ': ' + bl.kind : '') + '. It therefore supports and'
      + ' contradicts NOTHING about the target row. Its absence is NOT what is missing; a movement in the'
      + ' target\'s OWN epoch is.', [], []));
  } else if (nxtPhys) {
    chainState = 'NO_LATER_CLASSIFIABLE_MOVEMENT';
    chainWhy = 'sheet row ' + nxtPhys.one_based_sheet_row_number + ' follows the target row physically but'
      + ' carries no movement_type, and no later row in this pool carries one either';
  } else {
    chainState = 'NO_LATER_MOVEMENT';
    chainWhy = 'the target row is the last movement in this pool\'s chronology';
  }

  // ---- R4G §D the balance, only where it is ATTRIBUTABLE to the target row. ----
  if (bal && bal.current_agrees === true && bal.attributable_to_the_target_row === true) {
    ev.push(S1_movProvEvidence_('FACTORY_STOCK_BALANCE',
      'factory_stock holds fac_current_stock = ' + bal.factory_stock_current + ' and the ledger\'s last'
      + ' after_current_stock agrees, IN THE TARGET ROW\'S OWN LEDGER EPOCH (' + bal.target_epoch_index
      + '), so the chain the target row belongs to reconciles to the live balance',
      ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER'], []));
  } else if (bal && bal.current_agrees === true && bal.independent_of_the_target_row === true) {
    // THE REPAIR THAT MATTERS MOST. R4F scored this exact agreement as support for two candidates. It
    // reconciles ledger epoch N to the live balance, and the target row is in an earlier epoch upstream of
    // a boundary the balance cannot see past. One number, one epoch, and no statement about this row.
    ev.push(S1_movProvEvidence_('FACTORY_STOCK_BALANCE',
      'factory_stock holds fac_current_stock = ' + bal.factory_stock_current + ' and the ledger\'s last'
      + ' after_current_stock (sheet row ' + bal.ledger_last_sheet_row + ') agrees - BUT THAT IS LEDGER'
      + ' EPOCH ' + bal.ledger_last_epoch_index + ' AND THE TARGET ROW IS IN EPOCH ' + bal.target_epoch_index
      + '. factory_stock holds one number, the CURRENT balance, produced by the CURRENT epoch. This proves'
      + ' the current epoch is well-formed and proves NOTHING about how a row in a previous epoch should be'
      + ' classified, so it supports and contradicts no candidate. ' + bal.why_not_attributable, [], []));
  } else if (bal && bal.current_agrees === false) {
    ev.push(S1_movProvEvidence_('FACTORY_STOCK_BALANCE',
      'factory_stock holds fac_current_stock = ' + bal.factory_stock_current + ' and the ledger\'s last'
      + ' after_current_stock is ' + bal.ledger_last_after_current + ', so the ledger and the balance'
      + ' already disagree and this row is not the only thing to settle', [], []));
  }

  // ---- §2 the batch, when a classified sibling shares the exact shape. ----
  if (sib && sib.classified_sibling_available_as_a_template
      && sib.per_column_diff_against_the_first_classified_sibling) {
    var d = sib.per_column_diff_against_the_first_classified_sibling;
    var conv = d.sibling_convention;
    if (conv === 'QTY_IS_A_DELTA' || conv === 'QTY_IS_A_BALANCE') {
      ev.push(S1_movProvEvidence_('SIBLING_SHAPE_BATCH',
        'sheet row ' + d.sibling_sheet_row + ' shares this row\'s blank-shape apart from the key and the'
        + ' type, IS classified as ' + d.sibling_movement_type + ', and on its own cells '
        + (conv === 'QTY_IS_A_DELTA' ? 'qty equals after minus before' : 'qty equals after')
        + ' - so the batch that produced this row wrote qty as '
        + (conv === 'QTY_IS_A_DELTA' ? 'a delta' : 'a balance')
        + '. Evidence about the batch, never a value to copy.',
        [conv === 'QTY_IS_A_BALANCE' ? 'INITIAL_BALANCE_SET' : 'CURRENT_DELTA_FROM_BEFORE_AFTER'],
        [conv === 'QTY_IS_A_BALANCE' ? 'CURRENT_DELTA_FROM_BEFORE_AFTER' : 'INITIAL_BALANCE_SET']));
    } else {
      ev.push(S1_movProvEvidence_('SIBLING_SHAPE_BATCH',
        'sheet row ' + d.sibling_sheet_row + ' shares this row\'s blank-shape apart from the key and the'
        + ' type and IS classified as ' + d.sibling_movement_type + ', but its own qty matches neither a'
        + ' delta nor a balance (' + conv + '), so the batch has no readable convention to testify to',
        [], []));
    }
  }

  // ---- §3 an event in another table. ----
  if (cross && cross.total_hits > 0 && cross.tables_with_a_hit.length) {
    ev.push(S1_movProvEvidence_('CROSS_TABLE_EVENT',
      cross.total_hits + ' marker hit(s) outside the movement ledger, in: '
      + cross.tables_with_a_hit.join(','), [], []));
  }

  // ---- §4.4 whether the ledger needs this row at all - now boundary-aware (§E). ----
  if (noTarget && noTarget.neighbours_overlap_each_other_directly === true) {
    ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
      'the rows either side of the target overlap each other directly, in the same ledger epoch, so the'
      + ' target carries no part of the balance and the chain is complete without it',
      ['INVALID_NON_LEDGER_ROW'], ['INITIAL_BALANCE_SET', 'CURRENT_DELTA_FROM_BEFORE_AFTER',
        'CURRENT_DELTA_FROM_QTY']));
  } else if (noTarget && noTarget.removing_it_breaks_a_link === true) {
    ev.push(S1_movProvEvidence_('LEDGER_CHAIN_OVERLAP',
      'removing the target row breaks a COMPARABLE overlap that currently holds, so it is load-bearing',
      [], ['INVALID_NON_LEDGER_ROW']));
  }

  // ---- assemble the four candidates from that one evidence list. ----
  var cands = [
    { candidate: 'INITIAL_BALANCE_SET', number: 1,
      reading: 'this row records an opening/imported BALANCE and qty carries that balance rather than a delta',
      authoritative_ending_balance: aft,
      qty_is: qty !== null && aft !== null && qty === aft ? 'A_BALANCE_EQUAL_TO_after_current_stock'
        : 'NOT_EQUAL_TO_after_current_stock_SO_NOT_A_BALANCE_UNDER_THIS_READING',
      implies_wrong_cell: 'none - but no shipped writer stores a balance in qty: factoryImportMovObj_ writes'
        + ' qty = afterCurrent - beforeCurrent even for SET-semantics imports',
      downstream_balance_impact: 'none. No reader sums qty for the current balance; factory_stock is the'
        + ' balance authority and this reading leaves it untouched.' },
    { candidate: 'CURRENT_DELTA_FROM_BEFORE_AFTER', number: 2,
      reading: 'this is a current-axis delta and the before/after pair is right, so qty should be '
        + (deltaFromPair === null ? 'unknown' : deltaFromPair),
      computed_delta: deltaFromPair,
      implies_wrong_cell: 'qty (it would have to become ' + deltaFromPair + ')',
      downstream_balance_impact: 'none to the balance; qty is summed by factoryStockOwnerReservedTx_ only'
        + ' for reservation types, and this row is not one.' },
    { candidate: 'CURRENT_DELTA_FROM_QTY', number: 3,
      reading: 'qty is the true delta and the after cell is wrong, so after_current_stock should be '
        + (afterFromQty === null ? 'unknown' : afterFromQty),
      expected_after: afterFromQty,
      implies_wrong_cell: 'after_current_stock (it would have to become ' + afterFromQty + ')',
      downstream_balance_impact: 'this reading moves the ledger\'s statement of the balance by '
        + (afterFromQty === null || aft === null ? 'an unknown amount' : (afterFromQty - aft))
        + ' and would have to be reconciled against factory_stock.' },
    { candidate: 'INVALID_NON_LEDGER_ROW', number: 4,
      reading: 'this row is not a movement at all - a placeholder, a paste or an aborted entry - and must'
        + ' not be treated as one',
      ledger_stands_without_it: noTarget ? noTarget.neighbours_overlap_each_other_directly : null,
      ledger_stands_without_it_state: noTarget ? noTarget.neighbours_overlap_state : null,
      implies_wrong_cell: 'none - the row itself is the error',
      downstream_balance_impact: 'none today: factoryStockReconcileReservations_ already counts it as an'
        + ' unknown_type row and deliberately neither adds nor drops it.' }
  ];
  cands.forEach(function (c) {
    c.supporting_evidence = ev.filter(function (x) { return x.supports.indexOf(c.candidate) >= 0; });
    c.contradicting_evidence = ev.filter(function (x) { return x.contradicts.indexOf(c.candidate) >= 0; });
    c.supporting_sources = [];
    c.independent_supporting_sources = [];
    c.contradicting_sources = [];
    // R4G §G — ONE SOURCE CANNOT SCORE TWICE, AND THE PROOF IS PUBLISHED RATHER THAN ASSERTED.
    // The multiplicity map shows how many evidence items each source contributed; the count that gates the
    // verdict is the number of DISTINCT source names. Where a source appears more than once, the reader can
    // see it and can see that it still counted once.
    c.supporting_source_multiplicity = {};
    c.supporting_evidence.forEach(function (x) {
      c.supporting_source_multiplicity[x.source] = (c.supporting_source_multiplicity[x.source] || 0) + 1;
      if (c.supporting_sources.indexOf(x.source) === -1) c.supporting_sources.push(x.source);
      if (x.independent && c.independent_supporting_sources.indexOf(x.source) === -1) {
        c.independent_supporting_sources.push(x.source);
      }
    });
    c.contradicting_evidence.forEach(function (x) {
      if (c.contradicting_sources.indexOf(x.source) === -1) c.contradicting_sources.push(x.source);
    });
    c.independent_supporting_source_count = c.independent_supporting_sources.length;
    c.supporting_evidence_item_count = c.supporting_evidence.length;
    c.no_source_counted_more_than_once = c.supporting_sources.length
      === Object.keys(c.supporting_source_multiplicity).length;
    c.every_listed_evidence_item_discriminates_this_candidate =
      c.supporting_evidence.concat(c.contradicting_evidence).filter(function (x) {
        return x.discriminates !== true; }).length === 0;

    // R4G §F — THE CHAIN READING, DERIVED FROM WHAT WAS MEASURED RATHER THAN FROM WHAT ATTACHED.
    c.subsequent_chain_compatibility = (function () {
      switch (chainState) {
        case 'CONSISTENT':
          return 'CONSISTENT_WITH_THE_NEXT_MOVEMENT_IN_THE_SAME_LEDGER_EPOCH';
        case 'CONTRADICTS_THE_AFTER_CELL':
        case 'THE_BALANCE_NEVER_MOVED':
          return c.contradicting_sources.indexOf('LEDGER_CHAIN_OVERLAP') >= 0
            ? 'CONTRADICTED_BY_THE_NEXT_MOVEMENT_IN_THE_SAME_LEDGER_EPOCH'
            : 'CONSISTENT_WITH_THE_NEXT_MOVEMENT_IN_THE_SAME_LEDGER_EPOCH';
        case 'MEASURED_AND_NEUTRAL':
          return 'MEASURED_AND_NEUTRAL - the next movement in this epoch matches none of the readings';
        case 'NOT_COMPARABLE_ACROSS_A_BOUNDARY':
          return 'NOT_COMPARABLE_ACROSS_A_LEDGER_EPOCH_BOUNDARY - a later classifiable movement EXISTS in'
            + ' this pool and is not comparable with this row';
        case 'NOT_MEASURABLE_BLANK_CELL':
          return 'NOT_MEASURABLE - the next movement in this epoch has a blank overlap cell';
        case 'NO_LATER_CLASSIFIABLE_MOVEMENT':
          return 'NO_LATER_CLASSIFIABLE_MOVEMENT_IN_THIS_POOL - a later movement exists but carries no type';
        default:
          return 'NO_LATER_MOVEMENT_IN_THIS_POOL';
      }
    })();
    c.subsequent_chain_reading_why = chainWhy;

    c.current_factory_stock_compatibility = (!bal || bal.current_agrees === null)
      ? 'NOT_MEASURABLE - the pool row or one of the quantities is absent'
      : (bal.attributable_to_the_target_row
        ? (bal.current_agrees ? 'THE_TARGETS_OWN_LEDGER_EPOCH_RECONCILES_TO_THE_LIVE_BALANCE'
          : 'THE_LEDGER_AND_THE_LIVE_BALANCE_ALREADY_DISAGREE')
        : (bal.current_agrees === false ? 'THE_LEDGER_AND_THE_LIVE_BALANCE_ALREADY_DISAGREE'
          : 'NOT_ATTRIBUTABLE - ' + bal.why_not_attributable));
    c.current_factory_stock_reading_why = bal ? bal.what_this_proves : null;

    c.confidence_basis = c.independent_supporting_source_count === 0
      ? 'NONE - nothing outside the row itself points here'
      : (c.independent_supporting_source_count === 1
        ? 'ONE INDEPENDENT SOURCE ONLY (' + c.independent_supporting_sources.join(',')
          + ') - a single agreement is not a classification'
        : c.independent_supporting_source_count + ' INDEPENDENT SOURCES ('
          + c.independent_supporting_sources.join(',') + ')');

    // R4G §F — MISSING EVIDENCE MUST NEVER ASK FOR A ROW THE CENSUS JUST PRINTED.
    c.missing_evidence = [];
    if (chainState === 'NO_LATER_MOVEMENT') {
      c.missing_evidence.push('ANY_LATER_MOVEMENT_IN_THIS_POOL');
    } else if (chainState === 'NO_LATER_CLASSIFIABLE_MOVEMENT') {
      c.missing_evidence.push('A_LATER_CLASSIFIABLE_MOVEMENT_IN_THIS_POOL');
    } else if (chainState === 'NOT_COMPARABLE_ACROSS_A_BOUNDARY') {
      c.missing_evidence.push('A_LATER_MOVEMENT_IN_THE_TARGETS_OWN_LEDGER_EPOCH'
        + ' - a later classifiable movement EXISTS and is separated from this row by a ledger epoch'
        + ' boundary, so what is missing is not that row but a comparable one');
    } else if (chainState === 'NOT_MEASURABLE_BLANK_CELL') {
      c.missing_evidence.push('A_READABLE_OVERLAP_CELL_ON_THE_NEXT_MOVEMENT_IN_THIS_EPOCH');
    }
    if (!bal || bal.current_agrees === null) {
      c.missing_evidence.push('A_BALANCE_STATEMENT_FOR_THIS_POOL');
    } else if (!bal.attributable_to_the_target_row) {
      c.missing_evidence.push('A_BALANCE_STATEMENT_ATTRIBUTABLE_TO_THE_TARGET_ROWS_OWN_LEDGER_EPOCH'
        + ' - ' + bal.why_not_attributable);
    }
    if (!sib || !sib.classified_sibling_available_as_a_template) {
      c.missing_evidence.push('A_CLASSIFIED_ROW_FROM_THE_SAME_PRODUCTION_BATCH');
    }
    if (!cross || cross.total_hits === 0) {
      c.missing_evidence.push('AN_EVENT_IN_ANOTHER_TABLE_DATED_TO_THIS_ROW');
    }
    if (c.independent_supporting_source_count < 2) {
      c.missing_evidence.push('A_SECOND_INDEPENDENT_SOURCE_POINTING_AT_THIS_SAME_READING');
    }
  });
  var nonDisc = ev.filter(function (x) { return x.discriminates !== true; });
  return { candidates: cands, evidence: ev, evidence_count: ev.length,
    discriminating_evidence_count: ev.length - nonDisc.length,
    non_discriminating_evidence: nonDisc,
    non_discriminating_evidence_count: nonDisc.length,
    source_catalogue: S1_MOV_PROV_SOURCES_,
    computed: { delta_from_the_before_after_pair: deltaFromPair, after_implied_by_qty: afterFromQty,
      qty: qty, before_current_stock: bef, after_current_stock: aft },
    // R4G §C — all three, separately named, and never collapsed into one.
    next_physical_same_pool_movement: nxtPhys,
    next_classifiable_same_pool_movement: nxtClass,
    next_same_ledger_epoch_movement: nxtEpoch,
    chain_reading_state: chainState, chain_reading_why: chainWhy,
    independence_rule: 'a classification needs TWO DISTINCT INDEPENDENT sources agreeing and no'
      + ' authoritative contradiction. One equality is a coincidence with a sample size of one, and one'
      + ' source cannot become two by producing two evidence items.',
    attribution_rule: 'evidence counts for a candidate only where it DISCRIMINATES that candidate AND is'
      + ' ATTRIBUTABLE to the target row. A balance that reconciles a different ledger epoch is neither.' };
}

/** §5 — WHICH VERDICT THE EVIDENCE EARNS. Decided in one place, from the candidate table alone. */
function S1_movProvVerdict_(cs) {
  var o = { qualifying: [], blocked_by_contradiction: [], verdict: null, selected_candidate: null,
    rule: 'READY needs exactly one candidate with >= 2 distinct INDEPENDENT supporting sources and zero'
      + ' contradicting sources. Two qualifying candidates is ambiguity, not a choice.' };
  (cs.candidates || []).forEach(function (c) {
    if (c.independent_supporting_source_count >= 2) {
      if (c.contradicting_sources.length === 0) o.qualifying.push(c.candidate);
      else o.blocked_by_contradiction.push({ candidate: c.candidate,
        contradicted_by: c.contradicting_sources.slice() });
    }
  });
  if (o.qualifying.length === 1) {
    o.verdict = 'READY_FOR_LEGACY_ROW_REPAIR_DECISION';
    o.selected_candidate = o.qualifying[0];
  } else {
    o.verdict = 'OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED';
    o.why = o.qualifying.length === 0
      ? 'NO_CANDIDATE_HAS_TWO_INDEPENDENT_SUPPORTING_SOURCES'
      : 'MORE_THAN_ONE_CANDIDATE_QUALIFIES:' + o.qualifying.join(',');
  }
  return o;
}

/**
 * §5.B — THE QUESTIONS, AND WHAT EACH ANSWER WOULD DO TO THE DATA.
 *
 * "This needs a human" is not a finding. A question a person can answer from their own records, with the
 * consequence of each answer stated in cells, is. Every option names the exact cell it would change and the
 * exact value it would take - and none of them is applied, proposed as authorized, or defaulted to.
 */
function S1_movOperatorQuestions_(ax, cs, targetRowNumber, tableName, poolWarehouseId, poolSku) {
  var c = cs.computed;
  var qs = [];
  qs.push({ question_id: 'Q1',
    question: 'What business event does ' + tableName + ' sheet row ' + targetRowNumber + ' record?'
      + ' It carries sku=' + S1_str_(poolSku) + ', warehouse_id=' + S1_str_(poolWarehouseId)
      + ', qty=' + c.qty + ', before_current_stock=' + c.before_current_stock
      + ', after_current_stock=' + c.after_current_stock + ' and no movement_type.',
    why_only_you_can_answer: 'movement_type is the LEDGER AXIS SELECTOR and it is blank, so the row does'
      + ' not say which axis its qty moved; related_entity_id is blank, so it does not say what it came'
      + ' from; and no shipped writer leaves either blank, so no code path recorded the answer.',
    options: [
      { answer: 'An opening/imported balance (INITIAL_BALANCE_SET)',
        data_impact: 'movement_type would become inventory_import and qty would be re-read as a BALANCE.'
          + ' Note that no shipped writer stores a balance in qty, so this reading makes the row unlike'
          + ' every other row in the table and before_current_stock=' + c.before_current_stock
          + ' would still need explaining (an import that creates a pool passes beforeCurrent = 0).' },
      { answer: 'A current-stock delta, and the before/after pair is right (CURRENT_DELTA_FROM_BEFORE_AFTER)',
        data_impact: 'qty would change from ' + c.qty + ' to ' + c.delta_from_the_before_after_pair
          + ' and movement_type would have to be named. The balance is unaffected; the ledger becomes'
          + ' internally consistent.' },
      { answer: 'A current-stock delta, and qty is right (CURRENT_DELTA_FROM_QTY)',
        data_impact: 'after_current_stock would change from ' + c.after_current_stock + ' to '
          + c.after_implied_by_qty + ', which moves the ledger\'s statement of the balance and must then be'
          + ' reconciled against factory_stock and against every later row in this pool.' },
      { answer: 'Not a real movement (INVALID_NON_LEDGER_ROW)',
        data_impact: 'the row would be quarantined or removed by a separate authorized decision. Removal is'
          + ' a row deletion, which is outside every repair path this package has built and needs its own'
          + ' authorization.' },
      { answer: 'Something else, evidenced outside this database',
        data_impact: 'bring the evidence (an import file, a PO, a stock count sheet) and the classification'
          + ' becomes a measurement rather than a decision.' }
    ] });
  qs.push({ question_id: 'Q2',
    question: 'Which single cell of row ' + targetRowNumber + ' do you believe is WRONG: qty ('
      + c.qty + '), after_current_stock (' + c.after_current_stock + '), or neither?',
    why_only_you_can_answer: 'the two cells disagree by '
      + (c.qty === null || c.delta_from_the_before_after_pair === null ? 'an unknown amount'
        : (c.qty - c.delta_from_the_before_after_pair))
      + ' and the database contains no third statement that settles which one to keep.',
    options: [
      { answer: 'qty', data_impact: 'one cell changes; the balance does not move.' },
      { answer: 'after_current_stock',
        data_impact: 'one cell changes; the ledger\'s balance statement moves by '
          + (c.after_implied_by_qty === null || c.after_current_stock === null ? 'an unknown amount'
            : (c.after_implied_by_qty - c.after_current_stock)) + '.' },
      { answer: 'neither - the row should not be read as a delta at all',
        data_impact: 'no quantity cell changes; the row needs a type and a lineage, or quarantine.' }
    ] });
  qs.push({ question_id: 'Q3',
    question: 'Is a primary key wanted for this row at all, before its business meaning is settled?',
    why_only_you_can_answer: 'writing the key is arithmetically inert - no reader keys stock math or'
      + ' idempotency on the movement primary key - but it takes blank_id_count to 0 and turns the id'
      + ' census from STOP to CLEAN, which SILENCES the only detector currently refusing this row.',
    options: [
      { answer: 'No - settle the business meaning first (this package\'s reading of the evidence)',
        data_impact: 'nothing is written. The census keeps refusing, which is the behaviour that surfaced'
          + ' the row in the first place.' },
      { answer: 'Yes - key it now and track the classification separately',
        data_impact: 'one cell written; the id census goes CLEAN while movement_type stays blank, so the'
          + ' row becomes invisible to the id census and visible only to'
          + ' factoryStockReconcileReservations_ as an unknown_type row.' }
    ] });
  return { question_count: qs.length, questions: qs,
    note: 'These are questions, not proposals. Nothing in this census writes, proposes an authorized'
      + ' repair, or defaults to any of the answers above.' };
}

/**
 * ================================================================================================================
 * RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS — READ ONLY, AND THERE IS NO REPAIR ENTRY POINT.
 *
 * Reconstructs where sheet row 2 of factory_stock_movements came from, using the rest of the database and the
 * shipped writers' own contracts. Re-confirms the frozen live state first and STOPS on any drift, because
 * provenance evidence gathered against a sheet that has moved is evidence about a different sheet.
 *
 * `opts.expect` replaces the frozen expectation and is REPORTED as caller-supplied, which is how the suite
 * drives worlds that are not the live sheet. `opts.maxHitsPerTable` bounds the cross-table hit lists.
 * ================================================================================================================
 */
function RUN_S1_FACTORY_MOVEMENT_LEGACY_PROVENANCE_CENSUS(opts) {
  opts = opts || {};
  var out = {
    census: 'S1 FACTORY MOVEMENT LEGACY PROVENANCE - read-only reconstruction, no repair route',
    build: S1_BUILD_, dry_run: true, read_only: true,
    // Every claim this function makes about itself, declared rather than inferred from silence.
    writes: 0, writer_calls: 0, cells_written: 0, ids_minted: 0, ids_backfilled: 0,
    rows_modified: 0, rows_added: 0, rows_removed: 0, rows_reordered: false,
    jobs_triggered: 0, tables_created: 0, submit_calls: 0,
    generate_called: false, submit_called: false, migration_called: false, gap_job_called: false,
    factory_writer_called: false,
    has_execute_path: false, proposes_authorized_repair: false,
    repair_route: 'NONE - this census has no execute function, no authorization wording and no frozen'
      + ' baseline. A verdict of READY means a PERSON may now decide, never that a tool may act.',
    table: S1_FACTORY_MOVEMENT_TABLE_, sheet_name: S1_FACTORY_MOVEMENT_TABLE_,
    expectation_source: null, expected: null,
    live_state_confirmation: null, live_state_confirmed: null,
    target_row: null, target_row_number: null,
    field_audit: null, axis_audit: null, classification: null, classification_reasons: [],
    writer_elimination: null, column_append_hypothesis: null,
    chronology: null, chain_continuity: null, chain_without_the_target: null,
    balance_reconcile: null, siblings: null, cross_table: null,
    candidates: [], evidence: [], evidence_count: 0, computed: null,
    discriminating_evidence_count: 0, non_discriminating_evidence: [],
    non_discriminating_evidence_count: 0,
    // R4G §B/§C — the epochs, and the three successors under their own names. `next_same_pool_movement`
    // is retired: one variable answering three questions is what let a found row be reported as absent.
    ledger_epochs: null, next_movements: null, epoch_contract: null,
    next_physical_same_pool_movement: null,
    next_classifiable_same_pool_movement: null,
    next_same_ledger_epoch_movement: null,
    chain_reading_state: null, chain_reading_why: null,
    verdict: 'STOP', selected_candidate: null, verdict_detail: null, stop_reasons: [],
    operator_questions: null,
    proposed_repair_fields: null,
    predicates: [], predicates_passed: 0, predicates_failed: 0, failed_predicates: [],
    lines_emitted: 0, log_bytes_max: 0,
    verdict_meanings: {
      READY_FOR_LEGACY_ROW_REPAIR_DECISION: 'two or more INDEPENDENT authoritative sources point at the'
        + ' same classification and nothing authoritative contradicts it, so a person can decide',
      OPERATOR_BUSINESS_CLASSIFICATION_REQUIRED: 'the database does not contain the answer; the exact'
        + ' questions and the data impact of each answer are published instead',
      STOP: 'the schema, a fingerprint, the row, the table, the build, the production target or the read'
        + ' authority did not match the frozen state, so no provenance conclusion is published at all' } };
  var L = S1_ledger_();
  function stop(r) { if (out.stop_reasons.indexOf(r) === -1) out.stop_reasons.push(r); }

  var EXP = opts.expect ? opts.expect : S1_MOV_LIVE_FROZEN_;
  out.expectation_source = opts.expect
    ? 'CALLER_SUPPLIED - NOT the frozen S1-R4E authorization. This run is pinned to an expectation the'
      + ' caller provided, which is stated here so it can never be mistaken for a live measurement.'
    : 'THE_FROZEN_S1_R4E_AUTHORIZATION';
  out.expected = EXP;

  function fin() {
    out.predicates = L.entries;
    out.predicates_failed = L.failed.length;
    out.predicates_passed = L.entries.length - L.failed.length;
    out.failed_predicates = L.failed.slice();
    // STOP WINS, AND IT WINS FROM ONE PLACE. 'I could not confirm the state I was told to expect' must
    // never be published as a provenance conclusion, which is the same rule that keeps an absent table's
    // row count null rather than zero.
    if (out.stop_reasons.length || L.failed.length) {
      out.verdict = 'STOP';
      out.selected_candidate = null;
      out.proposed_repair_fields = null;
    }
    // LOCK: a STOP publishes no classification decision and no operator questions dressed as one.
    if (out.verdict === 'STOP') out.operator_questions = null;
    S1_movProvEmit_(out);
    return out;
  }

  try {
    // ---- §6.1 THE BUILD. An expectation frozen against another build is not this build's evidence. ----
    L.P('the_build_matches_the_frozen_authorization', EXP.build, S1_BUILD_, S1_BUILD_ === EXP.build);
    if (S1_BUILD_ !== EXP.build) { stop('BUILD_DRIFTED'); return fin(); }

    // ---- §6.2 THE READ, THROUGH THE SAME AUTHORITY THE MANIFEST AND THE BACKFILL USE. ----
    var R = S1_movReadForRepair_();
    L.P('the_movement_table_was_read_through_the_shared_read_authority', true,
      R.ok ? true : R.stop_reasons.join(','), R.ok === true);
    if (!R.ok) { R.stop_reasons.forEach(stop); return fin(); }
    var liveCols = R.live_columns;

    // ---- §6.3 THE FROZEN LIVE STATE, ITEM BY ITEM. ----
    var target = null;
    (R.t.rows || []).forEach(function (r) {
      if (r.row_number === EXP.target_row_number) target = r; });
    var conf = [];
    function confirm(name, expected, observed) {
      var okv = S1_str_(expected) === S1_str_(observed);
      conf.push({ what: name, expected: expected, observed: observed, confirmed: okv });
      L.P('the_live_state_still_matches_the_frozen_' + name, expected, observed, okv);
      if (!okv) stop('LIVE_STATE_DRIFTED:' + name);
      return okv;
    }
    confirm('header_fingerprint', EXP.header_fingerprint, R.header_fingerprint);
    confirm('table_combined_fingerprint', EXP.table_combined_fingerprint, R.table_combined_fingerprint);
    confirm('row_count', EXP.row_count, R.integrity.row_count);
    confirm('blank_id_count', EXP.blank_id_count, R.integrity.blank_id_count);
    confirm('duplicate_id_count', EXP.duplicate_id_count, R.integrity.duplicate_id_count);
    confirm('wrong_type_id_count', EXP.wrong_type_id_count, R.integrity.wrong_type_id_count);
    confirm('outside_named_column_row_count', EXP.outside_named_column_row_count,
      R.integrity.outside_named_columns_count);
    confirm('valid_id_count', EXP.valid_id_count,
      R.integrity.ok_count - R.integrity.duplicate_id_count - R.integrity.wrong_type_id_count);
    // THE FAULT MUST BE THE ONE THE FREEZE NAMES, AND IT MUST BE THE ONLY ONE.
    L.P('the_table_still_holds_exactly_one_id_fault', 1, R.faults.length, R.faults.length === 1);
    if (R.faults.length !== 1) stop('THE_FAULT_COUNT_IS_NO_LONGER_ONE');
    L.P('the_one_fault_is_still_a_blank_primary_key_on_the_frozen_row',
      { row: EXP.target_row_number, code: 'FACTORY_MOVEMENT_ID_BLANK' },
      R.faults.length === 1
        ? { row: R.faults[0].one_based_sheet_row_number, code: R.faults[0].fault_code } : null,
      R.faults.length === 1 && R.faults[0].one_based_sheet_row_number === EXP.target_row_number
        && R.faults[0].fault_code === 'FACTORY_MOVEMENT_ID_BLANK');
    L.P('the_frozen_target_row_is_still_present_at_its_frozen_row_number', EXP.target_row_number,
      target ? target.row_number : null, target !== null);
    if (!target) { stop('TARGET_ROW_MISSING'); return fin(); }
    confirm('target_row_fingerprint', EXP.target_row_fingerprint, target.fingerprint);
    var mtBlank = S1_canonCell_(S1_cellOf_(target, 'movement_type')) === '~';
    conf.push({ what: 'target_movement_type_is_blank', expected: EXP.target_movement_type_is_blank,
      observed: mtBlank, confirmed: mtBlank === EXP.target_movement_type_is_blank });
    L.P('the_target_rows_movement_type_is_still_in_its_frozen_state',
      EXP.target_movement_type_is_blank, mtBlank, mtBlank === EXP.target_movement_type_is_blank);
    if (mtBlank !== EXP.target_movement_type_is_blank) {
      stop('LIVE_STATE_DRIFTED:target_movement_type_is_blank');
    }
    var pWh = S1_str_(S1_cellOf_(target, 'warehouse_id')), pSku = S1_str_(S1_cellOf_(target, 'sku'));
    confirm('pool_warehouse_id', EXP.pool_warehouse_id, pWh);
    confirm('pool_sku', EXP.pool_sku, pSku);
    out.live_state_confirmation = conf;
    out.live_state_confirmed = conf.filter(function (c) { return !c.confirmed; }).length === 0;
    out.target_row_number = target.row_number;
    // §6 - THE EVIDENCE IS NOT GATHERED AGAINST A DRIFTED SHEET. Everything below reads the live rows, so
    // running it after a drift would produce a provenance report about a table nobody authorized.
    if (out.stop_reasons.length) return fin();

    // ---- §0 THE TARGET ROW ITSELF, AT THE GRAIN R4E ESTABLISHED. ----
    var fa = S1_movFieldAudit_(target, liveCols);
    var ax = S1_movAxisAudit_(target);
    var cls = S1_movClassifyRow_(target, liveCols);
    out.field_audit = fa;
    out.axis_audit = ax;
    out.classification = cls.classification;
    out.classification_reasons = cls.reasons.slice();
    out.target_row = { one_based_sheet_row_number: target.row_number,
      full_named_row_fingerprint: target.fingerprint,
      pool_key: S1_poolKey_(pWh, pSku), warehouse_id: pWh, sku: pSku,
      movement_id: S1_str_(S1_cellOf_(target, 'factory_stock_movement_id')) || null,
      movement_type: S1_str_(S1_cellOf_(target, 'movement_type')) || null,
      qty: ax.qty, before_current_stock: ax.before_current, after_current_stock: ax.after_current,
      before_reserved_stock: ax.before_reserved, after_reserved_stock: ax.after_reserved,
      time: S1_movTimeKey_(target),
      shape: S1_movShape_(target, liveCols),
      required_blank: fa.required_blank.slice(), writer_populated_blank: fa.writer_populated_blank.slice(),
      named_nonblank_field_count: fa.present_count,
      cells: S1_movRowCells_(target, liveCols) };

    // ---- §4 THE WRITER CONTRACT, AND THE CHEAP INNOCENT EXPLANATION. ----
    out.writer_elimination = S1_movWriterElimination_(target, liveCols);
    out.column_append_hypothesis = S1_movColumnAppendHypothesis_(target, liveCols);
    L.P('every_shipped_writer_was_tested_against_this_row', S1_MOV_WRITER_SIGNATURES_.length,
      out.writer_elimination.per_writer.length,
      out.writer_elimination.per_writer.length === S1_MOV_WRITER_SIGNATURES_.length);
    L.P('each_eliminated_writer_says_why_rather_than_only_that', [],
      out.writer_elimination.per_writer.filter(function (w) {
        return w.could_have_written === false && w.because.length === 0; }),
      out.writer_elimination.per_writer.filter(function (w) {
        return w.could_have_written === false && w.because.length === 0; }).length === 0);

    // ---- §1 THE CHRONOLOGY, THE CHAIN AND THE BALANCE. ----
    var chron = S1_movPoolChronology_(R.t, pWh, pSku);
    out.chronology = { pool_key: chron.pool_key, entry_count: chron.entry_count,
      rows_without_a_usable_time: chron.rows_without_a_usable_time,
      time_sources_used: chron.time_sources_used, tied_time_groups: chron.tied_time_groups,
      ordering_authority: chron.ordering_authority,
      ordering_is_unambiguous: chron.ordering_is_unambiguous,
      target_position: (function () {
        var p = null;
        chron.entries.forEach(function (e) {
          if (e.one_based_sheet_row_number === target.row_number) {
            p = e.position_in_chronology_1based; } });
        return p;
      })(),
      entries: chron.entries };
    L.P('the_target_row_is_in_its_own_pool_chronology', true,
      out.chronology.target_position !== null, out.chronology.target_position !== null);
    out.chain_continuity = S1_movChainContinuity_(chron);
    // ---- R4G §B/§C THE EPOCHS, AND THE THREE SEPARATED SUCCESSORS. ----
    var epochs = S1_movEpochs_(chron, target.row_number);
    out.ledger_epochs = epochs;
    out.next_movements = S1_movNextMovements_(chron, epochs, target.row_number);
    out.epoch_contract = S1_MOV_EPOCH_CONTRACT_;
    out.chain_without_the_target = S1_movChainWithoutTarget_(chron, target.row_number, epochs);
    var surf = S1_factorySurfaces_(R.ss, pWh, pSku);
    out.balance_reconcile = S1_movBalanceReconcile_(chron, surf.pool, target.row_number, epochs);
    // R4G REQUIREMENT 1, ENFORCED RATHER THAN STATED. The census may not report the absence of a
    // successor it found. These three predicates make that a test failure rather than a reading.
    var nmv = out.next_movements;
    L.P('a_found_later_movement_is_never_reported_as_absent',
      { later_movement_exists: nmv.a_later_movement_exists_in_this_pool,
        later_classifiable_exists: nmv.a_later_classifiable_movement_exists_in_this_pool },
      { physical: nmv.next_physical_same_pool_movement
          ? nmv.next_physical_same_pool_movement.one_based_sheet_row_number : null,
        classifiable: nmv.next_classifiable_same_pool_movement
          ? nmv.next_classifiable_same_pool_movement.one_based_sheet_row_number : null },
      nmv.a_later_classifiable_movement_exists_in_this_pool
        === (nmv.next_classifiable_same_pool_movement !== null)
      && nmv.a_later_movement_exists_in_this_pool === (nmv.next_physical_same_pool_movement !== null));
    L.P('the_three_successor_questions_are_answered_separately',
      ['next_physical_same_pool_movement', 'next_classifiable_same_pool_movement',
        'next_same_ledger_epoch_movement'],
      Object.keys(nmv).filter(function (k) { return k.indexOf('next_') === 0 && k.indexOf('_is_') === -1; }),
      Object.keys(nmv).filter(function (k) {
        return k.indexOf('next_') === 0 && k.indexOf('_is_') === -1; }).length === 3);
    L.P('a_ledger_epoch_boundary_is_never_counted_as_a_chain_break', 0,
      out.chain_continuity.links.filter(function (lk) {
        return lk.current && lk.current.starts_a_new_epoch && lk.current.state === 'DISAGREES'; }).length,
      out.chain_continuity.links.filter(function (lk) {
        return lk.current && lk.current.starts_a_new_epoch && lk.current.state === 'DISAGREES'; }).length === 0);
    // R4G REQUIREMENT 4, second clause. Where the only non-agreeing links are boundaries, the repair
    // claim may not be true - it must be false, null or a named NOT_APPLICABLE with a reason.
    L.P('removing_the_target_row_is_never_claimed_to_repair_an_epoch_boundary',
      { repairs: 'false|null', state_named: true },
      { repairs: out.chain_without_the_target.removing_it_repairs_a_break,
        state_named: S1_str_(out.chain_without_the_target.removing_it_repairs_a_break_state) !== '' },
      (out.chain_continuity.current_axis.disagree > 0
        || out.chain_without_the_target.removing_it_repairs_a_break !== true)
      && S1_str_(out.chain_without_the_target.removing_it_repairs_a_break_state) !== ''
      && S1_str_(out.chain_without_the_target.removing_it_repairs_a_break_why) !== '');
    // R4G REQUIREMENT 4, third clause. A balance that reconciles another epoch supports nothing.
    L.P('a_balance_agreement_outside_the_targets_epoch_supports_no_candidate', true,
      out.balance_reconcile.attributable_to_the_target_row === true
        || S1_str_(out.balance_reconcile.why_not_attributable) !== '',
      out.balance_reconcile.attributable_to_the_target_row === true
        || S1_str_(out.balance_reconcile.why_not_attributable) !== '');

    // ---- §2 THE SIBLINGS. ----
    out.siblings = S1_movSiblings_(R.t, target, liveCols);
    L.P('a_sibling_is_used_as_provenance_evidence_and_never_as_a_source_of_values',
      'PROVENANCE_EVIDENCE_ONLY', S1_str_(out.siblings.template_use).slice(0, 24),
      S1_str_(out.siblings.template_use).indexOf('PROVENANCE_EVIDENCE_ONLY') === 0);

    // ---- §3 THE OTHER TABLES. ----
    var markers = [];
    [pSku, pWh].forEach(function (m) { if (S1_str_(m) !== '') markers.push(S1_str_(m).toLowerCase()); });
    var day = S1_movDayOf_(out.target_row.time);
    if (day) markers.push(day);
    [ax.qty, ax.before_current, ax.after_current].forEach(function (n) {
      if (n !== null && markers.indexOf(String(n)) === -1) markers.push(String(n)); });
    var relId = S1_str_(S1_cellOf_(target, 'related_entity_id'));
    if (relId !== '') markers.push(relId.toLowerCase());
    out.cross_table = S1_movCrossTableScan_(R.ss, markers,
      opts.maxHitsPerTable === undefined ? 6 : opts.maxHitsPerTable);
    L.P('no_table_was_created_and_no_job_was_triggered_by_the_cross_table_read',
      { tables_created: 0, jobs_triggered: 0 },
      { tables_created: out.tables_created, jobs_triggered: out.jobs_triggered },
      out.tables_created === 0 && out.jobs_triggered === 0);

    // ---- §4 THE FOUR CANDIDATES. ----
    var cs = S1_movCandidates_(ax, chron, out.chain_continuity, out.balance_reconcile,
      out.siblings, out.cross_table, out.writer_elimination, out.chain_without_the_target,
      target.row_number, epochs, out.next_movements);
    out.candidates = cs.candidates;
    out.evidence = cs.evidence;
    out.evidence_count = cs.evidence_count;
    out.discriminating_evidence_count = cs.discriminating_evidence_count;
    out.non_discriminating_evidence = cs.non_discriminating_evidence;
    out.non_discriminating_evidence_count = cs.non_discriminating_evidence_count;
    out.computed = cs.computed;
    // R4G §C — the three successors are published under their own names. `next_same_pool_movement` is
    // RETIRED: it was one variable answering three questions, and that is what produced the contradiction.
    out.next_physical_same_pool_movement = cs.next_physical_same_pool_movement;
    out.next_classifiable_same_pool_movement = cs.next_classifiable_same_pool_movement;
    out.next_same_ledger_epoch_movement = cs.next_same_ledger_epoch_movement;
    out.chain_reading_state = cs.chain_reading_state;
    out.chain_reading_why = cs.chain_reading_why;
    // R4G REQUIREMENT 1, on the candidate text itself. No candidate may claim nothing follows when
    // something does - the exact sentence R4F published four times about a table containing row 3.
    var falseAbsence = out.candidates.filter(function (c) {
      return out.next_classifiable_same_pool_movement !== null
        && S1_str_(c.subsequent_chain_compatibility).indexOf('NO_LATER_CLASSIFIABLE_MOVEMENT') === 0; });
    L.P('no_candidate_reports_no_classifiable_movement_follows_while_one_was_found', [], falseAbsence,
      falseAbsence.length === 0);
    var falseMissing = out.candidates.filter(function (c) {
      return out.next_classifiable_same_pool_movement !== null
        && (c.missing_evidence || []).filter(function (m) {
          return S1_str_(m).indexOf('A_LATER_CLASSIFIABLE_MOVEMENT_IN_THIS_POOL') === 0; }).length > 0; });
    L.P('no_candidate_asks_for_a_later_classifiable_movement_that_was_found', [], falseMissing,
      falseMissing.length === 0);
    // R4G REQUIREMENT 6. One source, one score - and every listed item discriminates.
    var dbl = out.candidates.filter(function (c) { return c.no_source_counted_more_than_once !== true; });
    L.P('no_candidate_scores_one_evidence_source_twice', [], dbl, dbl.length === 0);
    var nonDisc = out.candidates.filter(function (c) {
      return c.every_listed_evidence_item_discriminates_this_candidate !== true; });
    L.P('every_listed_supporting_or_contradicting_item_discriminates_its_candidate', [], nonDisc,
      nonDisc.length === 0);
    L.P('all_four_candidates_were_measured', S1_MOV_CAND_, out.candidates.map(function (c) {
      return c.candidate; }), S1_str_(S1_MOV_CAND_.join(',')) === S1_str_(out.candidates.map(
        function (c) { return c.candidate; }).join(',')));
    var thin = out.candidates.filter(function (c) {
      return S1_str_(c.confidence_basis) === '' || !c.missing_evidence
        || S1_str_(c.subsequent_chain_compatibility) === ''
        || S1_str_(c.current_factory_stock_compatibility) === '';
    });
    L.P('every_candidate_carries_a_confidence_basis_a_chain_reading_a_balance_reading_and_its_gaps',
      [], thin, thin.length === 0);
    // §1.7 - ONE EQUALITY IS NOT A CLASSIFICATION, AND THE RULE IS ENFORCED RATHER THAN STATED.
    var oneSource = out.candidates.filter(function (c) {
      return c.independent_supporting_source_count === 1; });
    L.P('no_candidate_with_a_single_independent_source_is_treated_as_settled', [],
      oneSource.filter(function (c) {
        return S1_str_(c.confidence_basis).indexOf('ONE INDEPENDENT SOURCE ONLY') !== 0; }),
      oneSource.filter(function (c) {
        return S1_str_(c.confidence_basis).indexOf('ONE INDEPENDENT SOURCE ONLY') !== 0; }).length === 0);

    // ---- §5 THE VERDICT. ----
    var vd = S1_movProvVerdict_(cs);
    out.verdict = vd.verdict;
    out.selected_candidate = vd.selected_candidate;
    out.verdict_detail = vd;
    if (out.verdict === 'READY_FOR_LEGACY_ROW_REPAIR_DECISION') {
      var sel = null;
      out.candidates.forEach(function (c) { if (c.candidate === vd.selected_candidate) sel = c; });
      // PROPOSED FIELDS ONLY, AND THE WORD PROPOSED IS LOAD-BEARING: no id is minted, no baseline is
      // frozen, no authorization sentence is written, and there is no function in this file that could
      // consume this object.
      out.proposed_repair_fields = { candidate: vd.selected_candidate,
        one_based_sheet_row_number: target.row_number, table: S1_FACTORY_MOVEMENT_TABLE_,
        implies_wrong_cell: sel ? sel.implies_wrong_cell : null,
        supported_by: sel ? sel.independent_supporting_sources.slice() : [],
        status: 'PROPOSED_FOR_A_HUMAN_DECISION - not authorized, not frozen, not executable. This census'
          + ' has no execute path and mints nothing.',
        next_step: 'a separate authorized round would freeze a BEFORE and write the decided cells' };
    } else {
      out.operator_questions = S1_movOperatorQuestions_(ax, cs, target.row_number,
        S1_FACTORY_MOVEMENT_TABLE_, pWh, pSku);
    }
    return fin();
  } catch (e) {
    L.P('the_provenance_census_ran_to_completion', true,
      'threw: ' + String(e && e.message ? e.message : e), false);
    stop('CENSUS_THREW: ' + S1_cap_(String(e && e.message ? e.message : e), 200));
    return fin();
  }
}

/**
 * §7 — THE LOG. THE NAMED LINES, EACH BOUNDED, AND THE DETAIL IS NOT LEFT ONLY IN THE RETURN VALUE.
 *
 * One line per named section rather than one giant payload: a reader looking for the chain reading should not
 * have to scroll past the chronology to reach it. Anything that would exceed the line budget is SEGMENTED by
 * the shared emitter - never silently truncated - and the meta line says how many lines each section cost.
 */
function S1_movProvEmit_(out) {
  var emitted = 0, maxBytes = 0;
  function line(tag, obj) {
    var s = JSON.stringify(obj);
    var budget = S1_chunkBudget_(tag);
    if (s.length <= budget) {
      S1_log_(tag, s);
      emitted++;
      maxBytes = Math.max(maxBytes, '[S1] '.length + tag.length + 1 + s.length);
      return 1;
    }
    var n = S1_emitChunked_(tag, s);
    emitted += n;
    maxBytes = Math.max(maxBytes, n ? S1_CHUNK_MAX_BYTES_ : 0);
    return n;
  }
  var tr = out.target_row;
  line('s1_provenance_summary', {
    build: out.build, table: out.table, dry_run: out.dry_run, read_only: out.read_only,
    writes: out.writes, writer_calls: out.writer_calls, cells_written: out.cells_written,
    ids_minted: out.ids_minted, jobs_triggered: out.jobs_triggered, tables_created: out.tables_created,
    has_execute_path: out.has_execute_path,
    expectation_source: S1_cap_(out.expectation_source, 90),
    live_state_confirmed: out.live_state_confirmed,
    drifted: (out.live_state_confirmation || []).filter(function (c) { return !c.confirmed; })
      .map(function (c) { return c.what; }),
    classification: out.classification,
    classification_reasons: (out.classification_reasons || []).slice(0, 8),
    no_shipped_writer_could_have_produced_this_row: out.writer_elimination
      ? out.writer_elimination.no_shipped_writer_could_have_produced_this_row : null,
    column_append_hypothesis_supported: out.column_append_hypothesis
      ? out.column_append_hypothesis.supported : null,
    evidence_count: out.evidence_count,
    predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed });
  line('s1_provenance_target_row', tr === null ? { target_row: null,
    why: 'the frozen target row was not present, so there is nothing to describe' } : {
    row: tr.one_based_sheet_row_number, fingerprint: tr.full_named_row_fingerprint,
    pool_key: tr.pool_key, movement_id: tr.movement_id, movement_type: tr.movement_type,
    qty: tr.qty, before_current_stock: tr.before_current_stock,
    after_current_stock: tr.after_current_stock, before_reserved_stock: tr.before_reserved_stock,
    after_reserved_stock: tr.after_reserved_stock,
    time_source: tr.time ? tr.time.source : null, time_iso: tr.time ? tr.time.iso : null,
    required_blank: tr.required_blank, writer_populated_blank: tr.writer_populated_blank,
    named_nonblank_field_count: tr.named_nonblank_field_count,
    blank_columns: tr.shape ? tr.shape.blank_columns : null,
    shape_fingerprint: tr.shape ? tr.shape.shape_fingerprint : null,
    axis: out.axis_audit ? out.axis_audit.axis : null,
    readings: out.axis_audit ? out.axis_audit.readings : null });
  // R4G §C — THREE LINES, BECAUSE THERE ARE THREE QUESTIONS. The single R4F line said
  // "no classifiable movement follows the target row in this pool" whenever its one variable was empty,
  // and its one variable was the next CLASSIFIABLE row - so on the live table it printed that sentence
  // about a table whose next row is `inventory_import`. Each line now names its own question, says which
  // row answered it, and - where the answer is "found but not usable" - says which of the two that is.
  function movLine(tag, nx, question, absentWhy) {
    line(tag, nx === null || nx === undefined
      ? { next: null, question: question, why: absentWhy }
      : { question: question, row: nx.one_based_sheet_row_number,
          position: nx.position_in_chronology_1based,
          movement_id: nx.movement_id, movement_type: nx.movement_type,
          movement_type_is_known: nx.movement_type_is_known,
          classifiable: nx.classifiable,
          created_at: nx.created_at, movement_date: nx.movement_date,
          time_source: nx.time_source, time_iso: nx.time_iso, qty: nx.qty,
          before_current_stock: nx.before_current_stock, after_current_stock: nx.after_current_stock,
          before_reserved_stock: nx.before_reserved_stock, after_reserved_stock: nx.after_reserved_stock,
          related_entity_type: nx.related_entity_type, related_entity_id: nx.related_entity_id,
          fingerprint: nx.full_named_row_fingerprint,
          its_before_equals_the_targets_after: (tr && nx.before_current_stock !== null
            && tr.after_current_stock !== null)
            ? (nx.before_current_stock === tr.after_current_stock) : null });
  }
  var nmv = out.next_movements;
  movLine('s1_provenance_next_physical_same_pool_movement',
    out.next_physical_same_pool_movement,
    'which row follows the target row in this pool chronologically, whatever it is?',
    'the target row is the last movement in this pool');
  movLine('s1_provenance_next_classifiable_same_pool_movement',
    out.next_classifiable_same_pool_movement,
    'which is the first following row that carries a movement_type?',
    'a later row may exist but none of them carries a movement_type');
  movLine('s1_provenance_next_same_ledger_epoch_movement',
    out.next_same_ledger_epoch_movement,
    'which is the first following row in the target row\'s OWN ledger epoch - the only one a continuity'
      + ' argument may use?',
    out.next_classifiable_same_pool_movement
      ? 'A LATER CLASSIFIABLE MOVEMENT EXISTS AND IS NOT COMPARABLE WITH THIS ROW: a ledger epoch'
        + ' boundary separates them, so its before_current_stock is not a reading of the balance the'
        + ' target row closed at. What is missing is a comparable movement, NOT this one.'
      : 'no later movement exists in the target row\'s own ledger epoch');
  var ep = out.ledger_epochs;
  line('s1_provenance_ledger_epochs', ep === null || ep === undefined ? { epochs: null } : {
    epoch_count: ep.epoch_count,
    target_epoch_index: ep.target_epoch_index,
    last_entry_epoch_index: ep.last_entry_epoch_index,
    target_is_in_the_last_epoch: ep.target_is_in_the_last_epoch,
    boundaries: (ep.boundaries || []).map(function (b) {
      return { new_epoch: b.new_epoch_index, at_sheet_row: b.at_sheet_row,
        from_sheet_row: b.from_sheet_row, state: b.state, kind: b.kind,
        earlier_after_current: b.earlier_after_current, later_before_current: b.later_before_current }; }),
    epochs: (ep.epochs || []).map(function (x) {
      return { epoch: x.epoch_index, rows: x.sheet_rows, entries: x.entry_count,
        opening_before_current: x.opening_before_current,
        closing_after_current: x.closing_after_current }; }),
    contract: out.epoch_contract ? out.epoch_contract.rule : null,
    chain_reading_state: out.chain_reading_state, chain_reading_why: out.chain_reading_why });
  var ch = out.chain_continuity, wo = out.chain_without_the_target, ba = out.balance_reconcile;
  line('s1_provenance_chain_continuity', {
    pool_entries: out.chronology ? out.chronology.entry_count : null,
    target_position: out.chronology ? out.chronology.target_position : null,
    ordering_is_unambiguous: out.chronology ? out.chronology.ordering_is_unambiguous : null,
    rows_without_a_usable_time: out.chronology ? out.chronology.rows_without_a_usable_time : null,
    links: ch ? ch.links_examined : null,
    current: ch ? ch.current_axis : null, reserved: ch ? ch.reserved_axis : null,
    continuous_current: ch ? ch.chain_is_continuous_on_the_current_axis : null,
    continuous_reserved: ch ? ch.chain_is_continuous_on_the_reserved_axis : null,
    every_readable_link_agrees_current: ch ? ch.every_readable_link_agrees_on_the_current_axis : null,
    every_readable_link_agrees_reserved: ch ? ch.every_readable_link_agrees_on_the_reserved_axis : null,
    // R4G — three claims of decreasing strength, each under its own name, plus the boundary count that
    // says which of them a reader is entitled to.
    every_comparable_link_agrees_current: ch ? ch.every_comparable_link_agrees_on_the_current_axis : null,
    crosses_a_ledger_epoch_boundary: ch ? ch.the_current_chain_crosses_a_ledger_epoch_boundary : null,
    first_break_at_position: ch ? ch.first_break_at_position : null,
    first_epoch_boundary_at_position: ch ? ch.first_epoch_boundary_at_position : null,
    without_the_target: wo ? { neighbours_overlap_each_other_directly:
      wo.neighbours_overlap_each_other_directly,
      neighbours_overlap_state: wo.neighbours_overlap_state,
      removing_it_repairs_a_break: wo.removing_it_repairs_a_break,
      removing_it_repairs_a_break_state: wo.removing_it_repairs_a_break_state,
      removing_it_repairs_a_break_why: wo.removing_it_repairs_a_break_why,
      removing_it_breaks_a_link: wo.removing_it_breaks_a_link,
      removing_it_breaks_a_link_state: wo.removing_it_breaks_a_link_state,
      comparable_breaks_with_the_target: wo.comparable_breaks_with_the_target,
      comparable_breaks_without_the_target: wo.comparable_breaks_without_the_target } : null,
    balance: ba ? { factory_stock_current: ba.factory_stock_current,
      factory_stock_reserved: ba.factory_stock_reserved,
      ledger_last_after_current: ba.ledger_last_after_current,
      ledger_last_sheet_row: ba.ledger_last_sheet_row,
      current_agrees: ba.current_agrees, reserved_agrees: ba.reserved_agrees,
      independent_of_the_target_row: ba.independent_of_the_target_row,
      // R4G §D — independence is not attribution, and only attribution may score.
      target_epoch_index: ba.target_epoch_index,
      ledger_last_epoch_index: ba.ledger_last_epoch_index,
      balance_is_in_the_same_epoch_as_the_target: ba.balance_is_in_the_same_epoch_as_the_target,
      attributable_to_the_target_row: ba.attributable_to_the_target_row,
      why_not_attributable: ba.why_not_attributable,
      what_this_proves: ba.what_this_proves } : null });
  var sb = out.siblings;
  line('s1_provenance_sibling_shape_summary', sb === null ? { siblings: null } : {
    target_shape_fingerprint: sb.target_shape_fingerprint,
    target_near_shape_fingerprint: sb.target_near_shape_fingerprint,
    target_blank_columns: sb.target_blank_columns,
    ignored_in_the_near_shape: sb.ignored_in_the_near_shape,
    exact_shape_match_count: sb.exact_shape_match_count,
    near_shape_match_count: sb.near_shape_match_count, same_day_count: sb.same_day_count,
    same_warehouse_count: sb.same_warehouse_count, same_qty_pattern_count: sb.same_qty_pattern_count,
    candidate_count: sb.candidate_count, with_an_id: sb.with_an_id, without_an_id: sb.without_an_id,
    movement_type_distribution: sb.movement_type_distribution,
    classified_sibling_available_as_a_template: sb.classified_sibling_available_as_a_template,
    template_sheet_row: sb.per_column_diff_against_the_first_classified_sibling
      ? sb.per_column_diff_against_the_first_classified_sibling.sibling_sheet_row : null,
    template_movement_type: sb.per_column_diff_against_the_first_classified_sibling
      ? sb.per_column_diff_against_the_first_classified_sibling.sibling_movement_type : null,
    template_convention: sb.per_column_diff_against_the_first_classified_sibling
      ? sb.per_column_diff_against_the_first_classified_sibling.sibling_convention : null,
    differing_columns: sb.per_column_diff_against_the_first_classified_sibling
      ? sb.per_column_diff_against_the_first_classified_sibling.columns
        .filter(function (c) { return !c.same; }).map(function (c) { return c.column; }) : null,
    rows: sb.candidates.slice(0, 12).map(function (c) { return c.one_based_sheet_row_number; }),
    template_use: S1_cap_(sb.template_use, 110) });
  var ct = out.cross_table;
  line('s1_provenance_cross_table_evidence', ct === null ? { cross_table: null } : {
    markers: ct.markers, tables_examined: ct.tables_examined, tables_present: ct.tables_present,
    tables_absent: ct.tables_absent, tables_unreadable: ct.tables_unreadable,
    total_hits: ct.total_hits, tables_with_a_hit: ct.tables_with_a_hit,
    per_table: ct.per_table.filter(function (e) { return e.hits_total > 0; })
      .slice(0, 8).map(function (e) {
        return { table: e.table, row_count: e.row_count, hits_total: e.hits_total,
          hits_shown: e.hits_shown, hits_withheld: e.hits_withheld,
          columns_that_matched: e.columns_that_matched,
          rows: e.hits.map(function (h) { return h.one_based_sheet_row_number; }) }; }),
    read_rule: S1_cap_(ct.read_rule, 150) });
  (out.candidates || []).forEach(function (c) {
    line('s1_provenance_candidate_' + c.number, {
      candidate: c.candidate, reading: S1_cap_(c.reading, 200),
      authoritative_ending_balance: c.authoritative_ending_balance,
      computed_delta: c.computed_delta, expected_after: c.expected_after,
      ledger_stands_without_it: c.ledger_stands_without_it,
      implies_wrong_cell: S1_cap_(c.implies_wrong_cell, 160),
      supporting: c.supporting_evidence.map(function (x) {
        return { source: x.source, independent: x.independent, statement: S1_cap_(x.statement, 190) }; }),
      contradicting: c.contradicting_evidence.map(function (x) {
        return { source: x.source, independent: x.independent, statement: S1_cap_(x.statement, 190) }; }),
      independent_supporting_sources: c.independent_supporting_sources,
      contradicting_sources: c.contradicting_sources,
      subsequent_chain_compatibility: S1_cap_(c.subsequent_chain_compatibility, 120),
      current_factory_stock_compatibility: S1_cap_(c.current_factory_stock_compatibility, 140),
      downstream_balance_impact: S1_cap_(c.downstream_balance_impact, 200),
      confidence_basis: S1_cap_(c.confidence_basis, 160),
      missing_evidence: c.missing_evidence });
  });
  line('s1_provenance_verdict', {
    verdict: out.verdict, selected_candidate: out.selected_candidate,
    qualifying: out.verdict_detail ? out.verdict_detail.qualifying : null,
    blocked_by_contradiction: out.verdict_detail ? out.verdict_detail.blocked_by_contradiction : null,
    why: out.verdict_detail ? (out.verdict_detail.why || null) : null,
    rule: out.verdict_detail ? S1_cap_(out.verdict_detail.rule, 200) : null,
    stop_reasons: out.stop_reasons.slice(0, 10),
    predicates_passed: out.predicates_passed, predicates_failed: out.predicates_failed,
    failed: out.failed_predicates.slice(0, 8),
    proposed_repair_fields: out.proposed_repair_fields
      ? { candidate: out.proposed_repair_fields.candidate,
          status: S1_cap_(out.proposed_repair_fields.status, 150) } : null,
    writes: out.writes, cells_written: out.cells_written, ids_minted: out.ids_minted,
    has_execute_path: out.has_execute_path,
    repair_route: S1_cap_(out.repair_route, 190) });
  if (out.operator_questions) {
    (out.operator_questions.questions || []).forEach(function (q, i) {
      line('s1_provenance_operator_questions_' + (i + 1) + '_of_'
        + out.operator_questions.questions.length, {
        question_id: q.question_id, question: S1_cap_(q.question, 320),
        why_only_you_can_answer: S1_cap_(q.why_only_you_can_answer, 320),
        options: q.options.map(function (o) {
          return { answer: S1_cap_(o.answer, 90), data_impact: S1_cap_(o.data_impact, 300) }; }) });
    });
  }
  out.lines_emitted = emitted;
  out.log_bytes_max = maxBytes;
  return emitted;
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
function S1_authWordingP_(cand, acceptedRun, scope, ws, ids, content, surf, resv) {
  if (!cand || !scope) return null;
  // S1-R4A §C — A SENTENCE THAT DOES NOT NAME THE WRITE CANNOT AUTHORIZE IT. Without the predicted write
  // set there is nothing to sign for, so the sentence is REFUSED rather than written with the numbers that
  // happen to be available. This is what LOCK THREE then catches: a null wording downgrades a READY.
  if (!ws || ws.measurable !== true || !ids) return null;
  var nCreateH = ws.expected_create_header_count, nUpdateH = ws.expected_update_header_count;
  var nCreateL = ws.expected_create_line_count, nUpdateL = ws.expected_update_line_count;
  var hIds = (ws.expected_header_ids || []).slice().sort();
  var lIds = (ws.expected_line_ids || []).slice().sort();
  var lineage = (acceptedRun && acceptedRun.lineage) || {};
  var pool = cand.pool || {};
  // S1-R4C §3 - THE FACTORY BASELINE BELONGS IN THE SENTENCE, NOT ONLY IN THE FREEZE. The wording already
  // said 'no factory movement or override-audit row may be added'; a prohibition with no before-count is
  // not something a person can check afterwards. These are the numbers the readback compares against.
  var mv = (surf && surf.surfaces) ? surf.surfaces['factory_stock_movements'] : null;
  var au = (surf && surf.surfaces) ? surf.surfaces['factory_stock_override_audit'] : null;
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
    + ' units to be written (clamp ' + (cand.would_clamp === true ? 'YES' : 'NO') + ').'
    // ---- S1-R4A §C — WHAT WOULD BE WRITTEN, AS FOUR SEPARATE COUNTS. The old sentence said "across 0
    // superseded AI identities" and that number was the count of rows that ALREADY EXISTED, so a run that
    // would create a header and five lines was described as touching nothing.
    + ' This generation is predicted to CREATE ' + S1_str_(nCreateH) + ' allocation draft header(s) and '
    + S1_str_(nCreateL) + ' line(s), and to UPDATE ' + S1_str_(nUpdateH) + ' existing header(s) and '
    + S1_str_(nUpdateL) + ' existing line(s), across ' + S1_str_((ws.route_groups || []).length)
    + ' route group(s). It is predicted to EXPIRE ' + S1_str_(ids.ai_expiration_candidate_count)
    + ' existing AI identity/identities'
    + ((ids.ai_expiration_candidates || []).length
        ? ' (' + (ids.ai_expiration_candidates || []).join(', ') + ')' : '')
    + ', against ' + S1_str_(ids.existing_active_ai_identity_count)
    + ' AI identity/identities active in this scope before the run.'
    + ' The EXACT K2 identities it may write are header(s) ' + (hIds.length ? hIds.join(', ') : '(none)')
    + ' and line(s) ' + (lIds.length ? lIds.join(', ') : '(none)')
    + '; K2 group key(s) ' + ((ws.expected_k2_group_keys || []).join(', ') || '(none)')
    + '. No other identity may be created or altered.'
    // ---- and what must be BYTE-FOR-BYTE UNCHANGED, which is now a checkable claim rather than a hope ----
    + ' The ' + S1_str_(((content && content.target_manual) || {}).header_ids
        ? (content.target_manual.header_ids || []).length : 0)
    + ' manual header(s) and ' + S1_str_(((content && content.target_manual) || {}).line_ids
        ? (content.target_manual.line_ids || []).length : 0)
    + ' manual line(s) in this scope must remain FULL-ROW IDENTICAL (combined fingerprint '
    + S1_str_(((content && content.target_manual) || {}).combined_fingerprint) + '), and so must all '
    + S1_str_(((content && content.other_scope) || {}).header_count)
    + ' header(s) and ' + S1_str_(((content && content.other_scope) || {}).line_count)
    + ' line(s) belonging to every other scope (combined fingerprint '
    + S1_str_(((content && content.other_scope) || {}).combined_fingerprint)
    + ') — every column, not only the ids.'
    // ---- S1-R4C §3 - AND THE FACTORY SURFACES, AS BEFORE-VALUES A READBACK CAN SUBTRACT FROM ----
    + ' The factory write surfaces are frozen at: pool row fingerprint '
    + S1_str_(((surf && surf.pool) || {}).row_fingerprint)
    + ' (fac_current_stock ' + S1_str_(((surf && surf.pool) || {}).fac_current_stock)
    + ', fac_reserved_stock ' + S1_str_(((surf && surf.pool) || {}).fac_reserved_stock) + ')'
    + ', factory_stock_movements ' + S1_str_(mv && mv.observation_state)
    + ' with ' + S1_rowCountPhrase_(mv ? mv.row_count : null) + ' all carrying a non-blank id'
    + ' (fingerprint ' + S1_str_(mv && mv.combined_fingerprint) + ')'
    + ', factory_stock_override_audit ' + S1_str_(au && au.observation_state)
    + ' with ' + S1_rowCountPhrase_(au ? au.row_count : null)
    + ' (fingerprint ' + S1_str_(au && au.combined_fingerprint) + ')'
    + ', and reservations ' + S1_str_(resv && resv.observation_state)
    + ' with ' + S1_rowCountPhrase_(resv ? resv.row_count : null) + '.'
    + ' Every one of those five baselines must be unchanged when this generation finishes.'
    + ' The activation allowlist must contain exactly this one'
    + ' scope. No reservation may be created, no'
    + ' factory stock may change, no factory movement or override-audit row may be added, and no Weekly'
    + ' Shipping Plan or Shipment may be created or altered. A'
    + ' factory-guard STOP or a clamp with zero rows is an acceptable outcome. This authorization covers'
    + ' ONE generation and expires when it completes or refuses. IT DOES NOT AUTHORIZE SUBMIT.';
}

/**
 * ================================================================================================================
 * S1-R4C §3 - AN AUTHORIZATION NOBODY CAN READ IS NOT AN AUTHORIZATION.
 *
 * WHAT THE LIVE RUN ACTUALLY HANDED OVER. `authorization_wording_present = true`. That is the diagnostic
 * asserting that it built a sentence, in place of the sentence. A person was being asked to authorize a
 * production write on the strength of a boolean about text they had never seen - and the whole point of the
 * wording is that a HUMAN checks the numbers in it against the numbers in the evidence.
 *
 * Two things follow, and they are separate.
 *
 * FIRST, IT GETS PRINTED, in bounded segments, under `s1_manifest_p_authorization_<i>_of_<n>` plus a meta line
 * carrying the byte count, the segment count and a fingerprint of the whole text, so a reader can confirm that
 * what they reassembled is what was produced. Never truncated: over the bound it is withheld and said so.
 *
 * SECOND, IT GETS AUDITED AGAINST THE MEASUREMENT. LOCK THREE already refused a sentence with a `<placeholder>`
 * in it. That catches a template that was never filled; it does not catch a sentence that was filled and left
 * a fact out. So every fact the sentence is required to carry is looked for IN the sentence, by exact needle,
 * and a missing one is a STOP. The needles are built from the measured values - so this cannot pass by
 * agreeing with itself, and if a future edit drops the K2 identities from the text the run refuses.
 * ================================================================================================================
 */
/**
 * S1-R4E - THE EMPTY-NEEDLE RULE, IN ONE PLACE.
 *
 * `indexOf('')` is 0 on every string, so a required fact whose measured value came back empty would be
 * 'found' in any sentence at all. R4C established that rule for MANIFEST P's wording; this round added a
 * second wording audit for the backfill authorization and, with it, a second copy of the same line - which
 * is how two audits come to disagree about what counts as present. One rule, one function, both callers.
 */
function S1_needleFound_(text, needle) {
  return S1_str_(needle) !== '' && String(text).indexOf(needle) >= 0;
}

function S1_wordingAudit_(w, scope, acceptedRun, cand, ws, ids, content, surf, resv) {
  var o = { built: !!w, bytes: w ? String(w).length : 0, fingerprint: null,
    placeholders: [], required_items: [], missing: [], present_count: 0, ok: false };
  if (!w) { o.missing.push('THE_WORDING_ITSELF'); return o; }
  var text = String(w);
  o.fingerprint = S1_fingerprint_([text]);
  o.placeholders = text.match(/<[a-zA-Z_][a-zA-Z0-9_]*>/g) || [];
  var lineage = (acceptedRun && acceptedRun.lineage) || {};
  var pool = (cand && cand.pool) || {};
  var mv = (surf && surf.surfaces) ? surf.surfaces['factory_stock_movements'] : null;
  var au = (surf && surf.surfaces) ? surf.surfaces['factory_stock_override_audit'] : null;
  var req = [];
  function need(name, needle) { req.push({ item: name, needle: S1_str_(needle) }); }

  // ---- the exact scope, all four axes ----
  need('scope_company', scope && scope.company);
  need('scope_country', scope && scope.country);
  need('scope_marketplace', scope && scope.marketplace);
  need('scope_sku', scope && scope.sku);
  // ---- the calculation run this is authorized against, and how fresh it is ----
  need('calculation_run_id', lineage.run_id);
  need('accepted_calculation_date', acceptedRun && acceptedRun.accepted_date);
  need('freshness_state', acceptedRun && acceptedRun.freshness_state);
  // ---- the quantity chain, each on its own LABELLED phrase so a bare number cannot satisfy it ----
  need('recommended_qty', 'recommendation is ' + S1_str_(cand && cand.recommended_qty));
  need('qualifying_manual_planned_qty',
    S1_str_(cand && cand.qualifying_manual_planned_qty) + ' already planned manually');
  need('qualifying_ai_planned_qty', S1_str_(cand && cand.qualifying_ai_planned_qty) + ' planned by AI');
  need('residual_qty', 'residual of ' + S1_str_(cand && cand.residual_qty));
  need('available_to_allocate', 'available_to_allocate ' + S1_str_(pool.available_to_allocate));
  need('proposed_ai_allocation_qty', 'AT MOST ' + S1_str_(cand && cand.proposed_ai_allocation_qty));
  // ---- the exact identities. One entry PER ID, so a partial list is a partial list. ----
  (ws && ws.expected_header_ids ? ws.expected_header_ids : []).forEach(function (id) {
    need('expected_header_id:' + S1_str_(id), id);
  });
  (ws && ws.expected_line_ids ? ws.expected_line_ids : []).forEach(function (id) {
    need('expected_line_id:' + S1_str_(id), id);
  });
  (ws && ws.expected_k2_group_keys ? ws.expected_k2_group_keys : []).forEach(function (k) {
    need('expected_k2_group_key:' + S1_str_(k), k);
  });
  // ---- create / update / expire, as the labelled counts ----
  need('create_counts', 'CREATE ' + S1_str_(ws && ws.expected_create_header_count)
    + ' allocation draft header(s) and ' + S1_str_(ws && ws.expected_create_line_count) + ' line(s)');
  need('update_counts', 'UPDATE ' + S1_str_(ws && ws.expected_update_header_count)
    + ' existing header(s) and ' + S1_str_(ws && ws.expected_update_line_count) + ' existing line(s)');
  need('expire_count', 'EXPIRE ' + S1_str_(ids && ids.ai_expiration_candidate_count));
  need('existing_active_ai_count', S1_str_(ids && ids.existing_active_ai_identity_count)
    + ' AI identity/identities active in this scope before the run');
  // ---- what must be byte-for-byte unchanged ----
  need('protected_manual_full_row_fingerprint',
    ((content && content.target_manual) || {}).combined_fingerprint);
  need('protected_other_scope_full_row_fingerprint',
    ((content && content.other_scope) || {}).combined_fingerprint);
  // ---- and the factory / reservation baseline ----
  need('factory_pool_row_fingerprint', ((surf && surf.pool) || {}).row_fingerprint);
  // AN HONESTLY ABSENT TABLE HAS NO FINGERPRINT, AND DEMANDING ONE WOULD BE THIS ROUND'S OWN MISTAKE
  // FACING THE OTHER WAY. R4A established that SHEET_ABSENT stays absent - row_count null, never 0 - so a
  // surface that is not there cannot be asked to contribute a hash, and asking would turn an honest absence
  // into a refusal. What the sentence must carry in that case is the ABSENCE, stated. Measured on the
  // movements-absent world (W8h), which this gate refused on its first version.
  function needSurface(prefix, label, sv) {
    need(prefix + '_baseline', label + ' ' + S1_str_(sv && sv.observation_state)
      + ' with ' + S1_rowCountPhrase_(sv ? sv.row_count : null));
    if (sv && sv.observation_state === 'SHEET_PRESENT_AND_READABLE') {
      need(prefix + '_fingerprint', sv.combined_fingerprint);
    } else {
      need(prefix + '_absence_is_stated', label + ' ' + S1_str_(sv && sv.observation_state));
    }
  }
  needSurface('factory_movement', 'factory_stock_movements', mv);
  needSurface('factory_audit', 'factory_stock_override_audit', au);
  need('reservation_baseline', 'reservations ' + S1_str_(resv && resv.observation_state)
    + ' with ' + S1_rowCountPhrase_(resv ? resv.row_count : null));
  // ---- and the boundary of the authorization itself ----
  need('scope_is_exactly_one', 'exactly this one scope');
  need('does_not_authorize_submit', 'IT DOES NOT AUTHORIZE SUBMIT');

  req.forEach(function (r) {
    // A NEEDLE THAT IS ITSELF EMPTY WOULD MATCH ANYTHING. An unmeasured fact cannot be found in a sentence,
    // so it counts as missing rather than as trivially satisfied - which is how a null slips through a
    // substring check and takes the whole audit with it.
    r.present = S1_needleFound_(text, r.needle);
    if (r.present) o.present_count++; else o.missing.push(r.item);
  });
  o.required_items = req.map(function (r) { return { item: r.item, present: r.present }; });
  o.required_item_count = req.length;
  o.ok = o.missing.length === 0 && o.placeholders.length === 0;
  return o;
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
