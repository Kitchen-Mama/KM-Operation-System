// F1-7N-FA-3C-DRAFT-MODEL-R6F2E — controlled-run operational gate:
//   A  FROZEN parity population rule — source/destination-unresolved (incl. multi-pool) lines are PARITY_NOT_APPLICABLE
//      (excluded, never a mismatch); a RESOLVED-lane manual-set difference stays a real blocker (never concealed).
//   B  zero-arg gate summary (may_freeze only for scoped-ready + exact JP; may_enable_flag always false).
//   C  zero-arg exact-JP freeze (CA cannot substitute; UK partial refused; cycle/count/parity/flag/checksum drift refused).
//   D  zero-arg validator persistence (read-only freeze never writes; explicit confirmed COMMIT; validator cannot widen).
// Pure helpers are extracted from the .gs and eval'd; the Apps-Script-bound wrappers are checked as source contracts.
// Run: node assets/tests/inventory-global-parity-population-zero-arg-gate-f1-7n-fa-3c-r6f2e.test.js
'use strict';
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMWRR = require('../js/core/supply-planning-weekly-route-derivation');
var KMRA = require('../js/core/supply-planning-route-authority');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var GS61 = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');

// ---- balanced-brace extractor + expression eval (repo pattern; strict mode blocks declaration leakage) -----------
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fn not found: ' + name);
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var j = i; j < src.length; j++) { var ch = src[j]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } } }
  return src.slice(start, end + 1);
}
// shared deps the eval'd helpers reference
var TEMP_str_ = eval('(' + extractFn(TEMP, 'TEMP_str_') + ')');
var TEMP_r6f2eParityMembership_ = eval('(function(){ var TEMP_R6F2E_SRC_BLOCKS_={ROUTE_SOURCE_UNKNOWN:1,ROUTE_SOURCE_INACTIVE:1,ROUTE_SOURCE_MULTI_POOL_UNRESOLVED:1}; var TEMP_R6F2E_DST_BLOCKS_={DESTINATION_MISSING:1,DESTINATION_UNKNOWN:1,DESTINATION_INACTIVE:1}; return ' + extractFn(TEMP, 'TEMP_r6f2eParityMembership_') + '; })()');
var TEMP_r6f2eResolvedLaneMismatch_ = eval('(' + extractFn(TEMP, 'TEMP_r6f2eResolvedLaneMismatch_') + ')');
var TEMP_r6f2eGateFlags_ = eval('(function(){ var TEMP_R6F2E_EXPECTED_SCOPE_={company:"ResTW",country:"JP",marketplace:"Amazon"}; return ' + extractFn(TEMP, 'TEMP_r6f2eGateFlags_') + '; })()');
var TEMP_r6f2eFreezeGate_ = eval('(function(){ var TEMP_str_=' + extractFn(TEMP, 'TEMP_str_') + '; return ' + extractFn(TEMP, 'TEMP_r6f2eFreezeGate_') + '; })()');

var EXP = { company: 'ResTW', country: 'JP', marketplace: 'Amazon', planning_cycle: 'RECO-2026-08', clean_count: 5, legacy_checksum: '8a51b860' };
function cleanChecks(over) {
  var c = { planning_cycle: 'RECO-2026-08', positive: 5, ai_ranked: 5, fully_routed: 5, blocked_total: 0, parity_mismatch_total: 0, conservation_ok: true, over_allocation: 0, duplicate_ids: 0, projected_conflict: 0, flag_false: true, legacy_checksum: '8a51b860' };
  if (over) Object.keys(over).forEach(function (k) { c[k] = over[k]; });
  return c;
}
var JP = { company: 'ResTW', country: 'JP', marketplace: 'Amazon' };
var CA = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
var UK = { company: 'ResTW', country: 'UK', marketplace: 'Amazon' };

// =====================================================================================================
section('A — parity population: multi-pool/source-unresolved is N/A only; resolved-lane mismatch is a blocker');
eq(TEMP_r6f2eParityMembership_('ROUTE_SOURCE_MULTI_POOL_UNRESOLVED').reason, 'PARITY_NOT_APPLICABLE_SOURCE_UNRESOLVED', 'A1 multi-pool → source N/A');
eq(TEMP_r6f2eParityMembership_('ROUTE_SOURCE_UNKNOWN').layer, 'excluded_by_source', 'A2 unknown source → excluded_by_source');
eq(TEMP_r6f2eParityMembership_('ROUTE_SOURCE_INACTIVE').eligible, false, 'A3 inactive source excluded');
eq(TEMP_r6f2eParityMembership_('DESTINATION_UNKNOWN').reason, 'PARITY_NOT_APPLICABLE_DESTINATION_UNRESOLVED', 'A4 dest unknown → dest N/A');
eq(TEMP_r6f2eParityMembership_('DESTINATION_MISSING').layer, 'excluded_by_destination', 'A5 dest missing → excluded_by_destination');
eq(TEMP_r6f2eParityMembership_('').eligible, true, 'A6 no source/dest block → eligible (resolved lane)');
eq(TEMP_r6f2eParityMembership_('ROUTE_METHOD_UNRESOLVED').eligible, true, 'A7 a METHOD block is still an ELIGIBLE lane (source+dest resolved) — not excluded');
// a resolved-lane manual-set DIFFERENCE remains a blocker; an excluded line never counts even if the sets differ
ok(TEMP_r6f2eResolvedLaneMismatch_({ eligible: true }, ['Air'], ['Air', 'Sea']) === true, 'A8 resolved-lane manual-set difference IS a blocker');
ok(TEMP_r6f2eResolvedLaneMismatch_({ eligible: false }, ['Air'], []) === false, 'A9 excluded (source-unresolved) line is NOT counted even though sets differ');
ok(TEMP_r6f2eResolvedLaneMismatch_({ eligible: true }, ['Air'], ['Air']) === false, 'A10 identical resolved-lane sets → no mismatch');

// =====================================================================================================
section('A — PRODUCTION correctness: a multi-pool source blocks with EMPTY manual options (the root of the 5)');
var wh = { SRC: { warehouse_id: 'SRC', country: 'CN', is_active: true }, DST: { warehouse_id: 'DST', country: 'US', is_active: true } };
var rc = [{ origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: 'Air', status: 'active', last_mile_delivery: 'FBA', unit_rate: '5', currency: 'USD', charge_type: 'per_kg', charge_unit: 'kg' }];
var lt = [{ origin_country: 'CN', destination_country: 'US', shipping_method: 'Air', last_mile_delivery: 'FBA', avg_days: '7' }];
var mp = KMWRR.deriveRoute({ source: { warehouse_id: '', multi_pool: true }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: wh, rateCards: rc, leadTimes: lt });
eq(mp.block, 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'A11 multi-pool source blocks at source');
eq((mp.manual_method_options || []).length, 0, 'A12 multi-pool block carries EMPTY manual_method_options (production correct)');
// the diagnostic wildcard-origin set would be NON-empty for the same lane → the pre-population false 5
var wildcard = KMRA.eligibleMethods({ originCountry: '', destinationCountry: 'US', marketplace: '' }, rc, { asOfOrdinal: null });
ok(wildcard.length > 0, 'A13 blank-origin diagnostic query is a WILDCARD (non-empty) — the pre-population mismatch source');
eq(TEMP_r6f2eParityMembership_(mp.block).eligible, false, 'A14 population rule EXCLUDES the multi-pool line (not a mismatch)');

// =====================================================================================================
section('A — the TEMP diagnostic exposes the frozen denominator/exclusion contract');
ok(/global_positive_lines/.test(TEMP) && /route_query_parity_eligible/.test(TEMP), 'A15 exposes global_positive_lines + route_query_parity_eligible');
ok(/route_query_parity_excluded_by_source/.test(TEMP) && /route_query_parity_excluded_by_destination/.test(TEMP), 'A16 exposes route-query source/destination exclusions');
ok(/manual_parity_eligible/.test(TEMP) && /manual_parity_excluded_by_source/.test(TEMP) && /manual_parity_excluded_by_destination/.test(TEMP), 'A17 exposes manual-parity eligible + exclusions');
ok(/real_manual_method_mismatch_count/.test(TEMP) && /real_ai_pair_mismatch_count/.test(TEMP) && /ai_pair_parity_eligible/.test(TEMP), 'A18 exposes REAL manual + ai-pair mismatch counts + ai-pair eligible');
ok(/exclusion_reason_counts/.test(TEMP) && /PARITY_NOT_APPLICABLE_SOURCE_UNRESOLVED/.test(TEMP) && /PARITY_NOT_APPLICABLE_DESTINATION_UNRESOLVED/.test(TEMP), 'A19 exposes exclusion_reason_counts with the two N/A reasons');
ok(/naive_manual_method_option_mismatch_count/.test(TEMP), 'A20 retains the naive pre-population count for the before/after reconciliation');
ok(/resolved_lane_mismatches/.test(TEMP) && /BLOCKER/.test(TEMP), 'A21 resolved-lane mismatches are surfaced as blockers (not concealed)');
ok(/a\.__company = sc\.company/.test(TEMP), 'A22 diagnostic harvest carries company for per-line exclusion reporting');

// =====================================================================================================
section('B — zero-arg gate summary: may_freeze gating + may_enable_flag always false');
ok(/function TEMP_R6F2E_SUMMARIZE_CONTROLLED_INVENTORY_GATE\(\)/.test(TEMP), 'B1 zero-arg gate summary present');
var f1 = TEMP_r6f2eGateFlags_('READY_FOR_SCOPED_CONTROLLED_INVENTORY_AI_PLAN', { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, JP);
ok(f1.may_freeze === true && f1.may_enable_flag === false, 'B2 scoped-ready + exact JP → may_freeze true, may_enable_flag false');
var f2 = TEMP_r6f2eGateFlags_('READY_FOR_SCOPED_CONTROLLED_INVENTORY_AI_PLAN', { company: 'ResTW', country: 'CA', marketplace: 'Amazon' }, JP);
ok(f2.may_freeze === false, 'B3 scoped-ready but CA scope → may_freeze false');
var f3 = TEMP_r6f2eGateFlags_('HALT', { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, JP);
ok(f3.may_freeze === false, 'B4 HALT verdict → may_freeze false');
var f4 = TEMP_r6f2eGateFlags_('READY_FOR_CONTROLLED_INVENTORY_AI_PLAN', { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, JP);
ok(f4.may_freeze === false, 'B5 may_freeze ONLY for the SCOPED-ready verdict');
ok(/may_enable_flag: flags\.may_enable_flag/.test(TEMP) && /may_enable_flag: false/.test(TEMP), 'B6 gate summary reports may_enable_flag (helper hard-codes false)');
ok(/legacy_header_checksum: pre\.empty_header_classification_checksum/.test(TEMP), 'B7 gate summary carries the legacy-header checksum');
ok(/calculation_run_id_fingerprint/.test(TEMP) && /planning_cycle/.test(TEMP), 'B8 gate summary carries planning_cycle + calc-run-id fingerprint');

// =====================================================================================================
section('C — zero-arg exact-JP freeze gate: JP passes; CA/UK/drift refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks(), EXP).verdict, 'CONTROLLED_SCOPE_FROZEN_READ_ONLY', 'C1 JP + all-clean → frozen read-only');
eq(TEMP_r6f2eFreezeGate_(CA, cleanChecks(), EXP).ok, false, 'C2 CA cannot be substituted');
ok(TEMP_r6f2eFreezeGate_(CA, cleanChecks(), EXP).drift_reasons.indexOf('SCOPE_NOT_EXACT_EXPECTED') >= 0, 'C2b CA → SCOPE_NOT_EXACT_EXPECTED');
// UK partial (17/21): counts drift + not clean
var ukChecks = cleanChecks({ positive: 21, ai_ranked: 17, fully_routed: 17, blocked_total: 4 });
var ukGate = TEMP_r6f2eFreezeGate_(UK, ukChecks, EXP);
ok(ukGate.ok === false && ukGate.drift_reasons.indexOf('COUNT_DRIFT') >= 0 && ukGate.drift_reasons.indexOf('SCOPE_NOT_CLEAN') >= 0, 'C3 UK partial → COUNT_DRIFT + SCOPE_NOT_CLEAN');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ planning_cycle: 'RECO-2026-07' }), EXP).drift_reasons.indexOf('PLANNING_CYCLE_DRIFT') >= 0, true, 'C4 planning-cycle drift refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ positive: 4 }), EXP).drift_reasons.indexOf('COUNT_DRIFT') >= 0, true, 'C5 count drift refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ parity_mismatch_total: 1 }), EXP).drift_reasons.indexOf('PARITY_MISMATCH') >= 0, true, 'C6 parity mismatch refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ flag_false: false }), EXP).drift_reasons.indexOf('INVENTORY_FLAG_NOT_FALSE') >= 0, true, 'C7 flag true refused at freeze time');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ legacy_checksum: 'deadbeef' }), EXP).drift_reasons.indexOf('LEGACY_HEADER_CHECKSUM_DRIFT') >= 0, true, 'C8 legacy-checksum drift refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ over_allocation: 2 }), EXP).drift_reasons.indexOf('OVER_ALLOCATION') >= 0, true, 'C9 over-allocation refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ duplicate_ids: 1 }), EXP).drift_reasons.indexOf('DUPLICATE_DETERMINISTIC_IDS') >= 0, true, 'C10 duplicate id refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ projected_conflict: 1 }), EXP).drift_reasons.indexOf('PROJECTED_CONFLICT') >= 0, true, 'C11 projected conflict refused');
eq(TEMP_r6f2eFreezeGate_(JP, cleanChecks({ conservation_ok: false }), EXP).drift_reasons.indexOf('CONSERVATION_NOT_OK') >= 0, true, 'C12 non-conservation refused');
// C source contracts
ok(/function TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE\(\)/.test(TEMP), 'C13 zero-arg freeze entrypoint present');
ok(/FREEZE_REFUSED_LIVE_DRIFT/.test(TEMP), 'C14 refuses drift with FREEZE_REFUSED_LIVE_DRIFT');
ok(/TEMP_R6F2A_FREEZE_CONTROLLED_INVENTORY_SCOPE\(\{ company: e\.company, country: e\.country, marketplace: e\.marketplace \}\)/.test(TEMP), 'C15 calls the canonical parameterized freeze internally with the EXACT expected scope');
ok(/CONTROLLED_SCOPE_FROZEN_READ_ONLY/.test(TEMP) && /freeze_version/.test(TEMP), 'C16 emits the compact freeze envelope + freeze_version');
ok(/pre_run_db_header_rows/.test(TEMP) && /pre_run_db_line_rows/.test(TEMP) && /unrelated_scope_active_row_checksum/.test(TEMP), 'C17 envelope carries pre-run DB counts + unrelated-scope checksum');
ok(/expected_header_ids_sorted/.test(TEMP) && /expected_line_ids_sorted/.test(TEMP), 'C18 envelope carries sorted expected header + line ids');
ok(/chunk_index/.test(TEMP) && /chunk_total/.test(TEMP) && /freeze_checksum: envelope\.freeze_checksum/.test(TEMP), 'C19 full line evidence logged in numbered chunks with freeze_checksum');
ok(/R6F2E_FREEZE_ENVELOPE/.test(TEMP), 'C20 compact envelope always logged in one entry');

// =====================================================================================================
section('C/freeze — zero spreadsheet writes (read-only): no setValue/setValues/appendRow/atomic call in the freeze');
var freezeFn = extractFn(TEMP, 'TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE');
ok(!/setValue|setValues|appendRow|deleteRow|handleUpsertShippingAllocationDraftAtomic_|setProperty/.test(freezeFn), 'C21 zero-arg freeze performs ZERO writes (no setValue/appendRow/atomic/setProperty)');
ok(/STRICTLY READ-ONLY/.test(freezeFn) || /read-only/.test(freezeFn), 'C22 freeze declares read-only');

// =====================================================================================================
section('D — zero-arg validator persistence: DRY_RUN first, confirmed COMMIT, read-only validate, cannot widen');
ok(/function TEMP_R6F2E_PERSIST_FROZEN_SCOPE_DRY_RUN\(\)/.test(TEMP), 'D1 DRY_RUN entrypoint present');
ok(/function TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT\(\)/.test(TEMP), 'D2 COMMIT entrypoint present');
ok(/function TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE\(\)/.test(TEMP), 'D3 zero-arg validator entrypoint present');
ok(/function TEMP_R6F2E_CLEAR_CONTROLLED_FROZEN_SCOPE\(\)/.test(TEMP), 'D4 cleanup entrypoint present');
var dryFn = extractFn(TEMP, 'TEMP_R6F2E_PERSIST_FROZEN_SCOPE_DRY_RUN');
ok(!/setProperty|deleteProperty/.test(dryFn), 'D5 DRY_RUN writes NOTHING');
var commitFn = extractFn(TEMP, 'TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT');
ok(/setProperty/.test(commitFn), 'D6 COMMIT is the only writer (setProperty)');
ok(/COMMIT_REFUSED_CONFIRMATION_REQUIRED/.test(commitFn) && /PASTE_FREEZE_SCOPE_CHECKSUM_HERE/.test(TEMP), 'D7 COMMIT refuses until the USER pastes the confirmed checksum');
ok(/COMMIT_REFUSED_CHECKSUM_MISMATCH/.test(commitFn), 'D8 COMMIT refuses on checksum mismatch');
ok(/COMMIT_REFUSED_FLAG_NOT_FALSE/.test(commitFn), 'D9 COMMIT refuses if the inventory flag is not false');
ok(/mutates_business_table\s*=\s*false/.test(commitFn) && /stores_spreadsheet_data\s*=\s*false/.test(commitFn), 'D10 COMMIT stores metadata only (no spreadsheet data, no business table)');
var freezeReadOnly = extractFn(TEMP, 'TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE');
ok(!/setProperty/.test(freezeReadOnly), 'D11 the read-only freeze never writes a Script Property (write is separate/explicit)');
var valFn = extractFn(TEMP, 'TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE');
ok(!/setProperty|deleteProperty|setValue/.test(valFn) && /getProperty/.test(valFn), 'D12 validator is read-only (reads the stored token; never writes)');
ok(/scope_widening_possible = false/.test(valFn) && /TEMP_R6F2_VALIDATE_INVENTORY_K2_PACKAGE\(frozen\)/.test(valFn), 'D13 validator cannot widen scope; delegates to the canonical parameterized validator');
ok(/NO_FROZEN_SCOPE_STORED/.test(valFn), 'D14 validator reports NO_FROZEN_SCOPE_STORED before a token exists');
var clearFn = extractFn(TEMP, 'TEMP_R6F2E_CLEAR_CONTROLLED_FROZEN_SCOPE');
ok(/deleteProperty/.test(clearFn), 'D15 cleanup deletes the stored token');

// =====================================================================================================
section('regression — no generation triggered; flag stays false; no K3 write path restored');
ok(/generation_triggered\s*=\s*false/.test(TEMP), 'R1 COMMIT explicitly asserts no generation is triggered');
ok(!/inventoryAiPlanDbGenerationEnabled_\s*=\s*true|setInventoryAiPlanDbGenerationEnabled|INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true/.test(TEMP), 'R2 no flag flip anywhere in the TEMP tooling');
ok(!/persistWeeklyPlanK3|writeK3|K3_WRITE|legacy_k3_write/.test(TEMP), 'R3 no legacy K3 write path referenced in the TEMP tooling');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_/.test(GS61) || /inventoryAiPlanDbGenerationEnabled_/.test(GS61), 'R4 generation remains flag-gated in 61_');

console.log('\n----------------------------------------');
console.log('R6F2E GLOBAL PARITY + ZERO-ARG GATE: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
