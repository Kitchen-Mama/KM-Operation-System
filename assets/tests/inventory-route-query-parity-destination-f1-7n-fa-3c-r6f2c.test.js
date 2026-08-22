// F1-7N-FA-3C-DRAFT-MODEL-R6F2C — production route-query parity + destination identity + manual/auto ranking +
// multi-pool fail-closed + stage-accounting identities + the carrier-transport & destination-classifier repairs.
//   A/B  the 174→0 collapse = a rate-card TRANSPORT bug (gapReadObjects_ returns a bare ARRAY; the wrapper read .rows
//        off it → empty) + the diagnostic/production now build the SAME query → identical candidate sets.
//   C    destination identity: concrete = ONE active warehouse; logical MARKETPLACE token; a WH-looking-but-invalid id BLOCKS.
//   D    method alias authority — Truck is NOT fabricated (no runtime evidence given); diagnostic reveals raw tokens in cleartext.
//   E    manual-valid vs AI-rankable separated (ROUTE_AUTO_RANKING_INSUFFICIENT ≠ ROUTE_METHOD_UNRESOLVED).
//   F    multi-pool null-source → ROUTE_SOURCE_MULTI_POOL_UNRESOLVED (fail-closed; never guessed).
//   G/H  ONE shared Route Candidate contract (lineOutcomes) → stage identities (concrete+logical+blocked=incoming, etc.).
// Run: node assets/tests/inventory-route-query-parity-destination-f1-7n-fa-3c-r6f2c.test.js
'use strict';
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMRA = require('../js/core/supply-planning-route-authority');
var KMWRR = require('../js/core/supply-planning-weekly-route-derivation');

var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var whById = {
  SRC: { warehouse_id: 'SRC', warehouse_code: 'CN1', company: 'KM', country: 'CN', is_active: true },
  DST: { warehouse_id: 'DST', warehouse_code: 'US1', company: 'KM', country: 'US', is_active: true }
};
var cards = [{ origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: 'Air', shipping_method_label: 'Air', status: 'active', unit_rate: '5', currency: 'USD', charge_type: 'per_kg', charge_unit: 'kg', last_mile_delivery: 'FBA' }];
var lts = [{ origin_country: 'CN', destination_country: 'US', shipping_method: 'Air', avg_days: '7' }];

// =====================================================================================================
section('C — destination identity: concrete active warehouse / logical marketplace / WH-looking-invalid BLOCKS');
var cWh = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
ok(cWh.ok && cWh.route.destination_warehouse_id === 'DST', 'C1 concrete active warehouse resolves');
var cMk = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'MARKETPLACE', marketplace: 'US Amazon', country: 'US' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
ok(cMk.ok && cMk.route.destination_marketplace === 'US Amazon', 'C2 logical marketplace resolves deterministically');
var cBad = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-LOOKS-REAL' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
eq(cBad.block, 'DESTINATION_UNKNOWN', 'C3 a WH-looking id that is not a real active warehouse BLOCKS (no false resolve)');
eq(cBad.route_candidate_status, 'BLOCKED', 'C3b status BLOCKED');

// =====================================================================================================
section('E — manual-valid vs AI-rankable separated');
var eMan = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-08-03', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
eq(eMan.block, 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'E1 eligible-but-late method → AUTO_RANKING_INSUFFICIENT (not ROUTE_METHOD_UNRESOLVED)');
eq(eMan.route_candidate_status, 'MANUAL_ONLY', 'E2 status MANUAL_ONLY');
ok(eMan.manual_method_options.length === 1 && eMan.manual_method_options[0].value === 'Air', 'E3 the valid manual method is still offered');
var eNoLane = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: [], leadTimes: lts });
eq(eNoLane.block, 'ROUTE_METHOD_UNRESOLVED', 'E4 truly no eligible method (empty lane) → ROUTE_METHOD_UNRESOLVED');
var eAi = cWh;
eq(eAi.route_candidate_status, 'AI_RANKED', 'E5 on-time + comparable → AI_RANKED');
ok(eAi.auto_rankable_methods.length >= 1 && eAi.expected_arrival === '2026-08-08', 'E6 AI_RANKED carries auto_rankable_methods + expected_arrival (2026-08-01 + 7d)');

// =====================================================================================================
section('F — multi-pool null-source is a distinct fail-closed block (never guessed)');
var fMp = KMWRR.deriveRoute({ source: { warehouse_id: '', multi_pool: true }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
eq(fMp.block, 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'F1 blank source + multi_pool → ROUTE_SOURCE_MULTI_POOL_UNRESOLVED');
var fUnk = KMWRR.deriveRoute({ source: { warehouse_id: '' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '2026-08-01', warehousesById: whById, rateCards: cards, leadTimes: lts });
eq(fUnk.block, 'ROUTE_SOURCE_UNKNOWN', 'F2 blank source WITHOUT multi_pool → ROUTE_SOURCE_UNKNOWN (distinct)');

// =====================================================================================================
section('D — method alias: Truck is NOT fabricated (no runtime evidence supplied to confirm it)');
eq(KMRA.canonicalMethodKey('Truck'), '', 'D1 Truck is unmapped (fail-closed) — never auto-mapped to Courier');
eq(KMRA.canonicalMethodKey('truck freight'), '', 'D2 leading truck is unmapped until an explicit reviewed rule is confirmed');
ok(KMRA.METHOD_ALIAS_RULES.every(function (r) { return r.canonical !== 'Truck'; }), 'D3 no Truck rule was added this round');

// =====================================================================================================
section('B/A — production candidate set == diagnostic KMRA candidate set for the same normalized query (parity)');
var q = { originCountry: 'CN', destinationCountry: 'US', marketplace: '' };
var diagSet = KMRA.eligibleMethods(q, cards, { asOfOrdinal: null }).map(function (m) { return m.value; }).sort();
var prodSet = KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: '2026-12-31', shipDate: '', warehousesById: whById, rateCards: cards, leadTimes: lts }).manual_method_options.map(function (m) { return m.value; }).sort();
eq(JSON.stringify(prodSet), JSON.stringify(diagSet), 'B1 production KMWRR manual_method_options == KMRA.eligibleMethods (byte-identical)');

// =====================================================================================================
section('G/H — ONE shared lineOutcomes contract + stage identities over a mixed plan');
var allocatedLines = [
  { sku: 'A', site_sku: 'A1', window_code: 'W1', required_by_date: '2026-12-31', source_warehouse_id: 'SRC', planned_qty: 10, recommended_qty: 10, marketplace: 'US Amazon', destination: { kind: 'WAREHOUSE', warehouse_id: 'DST', country: 'US' } },              // AI_RANKED concrete
  { sku: 'B', site_sku: 'B1', window_code: 'W1', required_by_date: '2026-08-03', source_warehouse_id: 'SRC', planned_qty: 5, recommended_qty: 5, marketplace: 'US Amazon', destination: { kind: 'WAREHOUSE', warehouse_id: 'DST', country: 'US' } },               // MANUAL_ONLY (late)
  { sku: 'C', site_sku: 'C1', window_code: 'W1', required_by_date: '2026-12-31', source_warehouse_id: 'SRC', planned_qty: 5, recommended_qty: 5, marketplace: 'US Amazon', destination: { kind: 'WAREHOUSE', warehouse_id: 'BOGUS', country: 'US' } },            // DESTINATION_UNKNOWN
  { sku: 'D', site_sku: 'D1', window_code: 'W1', required_by_date: '2026-12-31', source_warehouse_id: '', source_multi_pool: true, planned_qty: 5, recommended_qty: 5, marketplace: 'US Amazon', destination: { kind: 'WAREHOUSE', warehouse_id: 'DST', country: 'US' } }, // MULTI_POOL
  { sku: 'E', site_sku: 'E1', window_code: 'W1', required_by_date: '2026-12-31', source_warehouse_id: 'SRC', planned_qty: 7, recommended_qty: 7, marketplace: 'US Amazon', destination: { kind: 'MARKETPLACE', marketplace: 'US Amazon', country: 'US' } }        // AI_RANKED logical
];
var plan = KMWRR.buildK2GenerationPlan({ scope: { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'US Amazon', source_page: 'inventory_replenishment' }, allocatedLines: allocatedLines, warehousesById: whById, rateCards: cards, leadTimes: lts, shipDate: '2026-08-01' });
ok(Array.isArray(plan.lineOutcomes) && plan.lineOutcomes.length === 5, 'G1 buildK2GenerationPlan exposes a per-line lineOutcomes contract');
// replicate the dry-assembly stage tally
var T = { src_in: 0, src_ok: 0, src_bl: 0, d_in: 0, d_c: 0, d_l: 0, d_bl: 0, m_in: 0, m_ai: 0, m_man: 0, m_bl: 0, lm_in: 0, lm_ok: 0, lm_bl: 0 };
var SRCB = { ROUTE_SOURCE_UNKNOWN: 1, ROUTE_SOURCE_INACTIVE: 1, ROUTE_SOURCE_MULTI_POOL_UNRESOLVED: 1 };
var DSTB = { DESTINATION_MISSING: 1, DESTINATION_UNKNOWN: 1, DESTINATION_INACTIVE: 1 };
var LMB = { LAST_MILE_UNRESOLVED: 1, LAST_MILE_AMBIGUOUS: 1, OVERRIDE_INVALID: 1 };
plan.lineOutcomes.forEach(function (o) {
  var tok = o.block || ''; T.src_in++;
  if (SRCB[tok]) { T.src_bl++; return; } T.src_ok++; T.d_in++;
  if (DSTB[tok]) { T.d_bl++; return; }
  if (o.destination_kind === 'WAREHOUSE') T.d_c++; else if (o.destination_kind === 'MARKETPLACE') T.d_l++;
  T.m_in++;
  if (tok === 'ROUTE_METHOD_UNRESOLVED') { T.m_bl++; return; }
  if (tok === 'ROUTE_AUTO_RANKING_INSUFFICIENT') { T.m_man++; return; }
  T.m_ai++; T.lm_in++; if (LMB[tok]) { T.lm_bl++; return; } T.lm_ok++;
});
eq(T.src_in, 5, 'H1 source incoming = 5'); eq(T.src_bl, 1, 'H2 source blocked = 1 (multi-pool)'); eq(T.src_ok, 4, 'H3 source resolved = 4');
ok(T.d_c + T.d_l + T.d_bl === T.d_in && T.d_in === T.src_ok, 'H4 concrete+logical+blocked = destination incoming = source resolved');
eq(T.d_c, 2, 'H5 destination concrete = 2 (A,B)'); eq(T.d_l, 1, 'H6 destination logical = 1 (E)'); eq(T.d_bl, 1, 'H7 destination blocked = 1 (C bogus id)');
ok(T.m_ai + T.m_man + T.m_bl === T.m_in && T.m_in === (T.d_c + T.d_l), 'H8 ai_ranked+manual_only+blocked = method incoming');
eq(T.m_ai, 2, 'H9 method AI-ranked = 2 (A,E)'); eq(T.m_man, 1, 'H10 method manual-only = 1 (B)'); eq(T.m_bl, 0, 'H11 method no-method = 0');
ok(T.lm_ok + T.lm_bl === T.lm_in && T.lm_in === T.m_ai, 'H12 last-mile resolved+blocked = last-mile incoming = AI-ranked');
eq(plan.groups.reduce(function (n, g) { return n + g.lines.length; }, 0), 2, 'H13 fully-routed group lines = 2 (== last-mile-resolved)');
ok(plan.groups.length >= 1, 'H14 an AI-rankable scope still produces K2 groups despite the multi-pool + manual-only + bogus-dest lines (scoped-safe)');

// =====================================================================================================
section('B — carrier TRANSPORT + adapter classifier source contracts (61_ handler cannot run in Node)');
var GS61 = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
ok(/Array\.isArray\(o\) \? o : \(\(o && Array\.isArray\(o\.rows\)\) \? o\.rows : \[\]\)/.test(GS61), 'B2 weeklyAiPlanReadCarrierAuthorities_ accepts the bare-array shape gapReadObjects_ returns (the 174→0 transport fix)');
ok(/function weeklyAiPlanClassifyDestination_/.test(GS61) && /kind: 'MARKETPLACE'/.test(GS61) && /DESTINATION_UNRESOLVED/.test(GS61), 'B3 destination is classified at the adapter (concrete active warehouse | logical marketplace | BLOCK)');
ok(/source_multi_pool: multiPool/.test(GS61), 'B4 multi-pool null-source lines are tagged for the distinct fail-closed block');
ok(/var destination = weeklyAiPlanClassifyDestination_\(l, whById\)/.test(GS61) && !/if \(d && s\(d\.destinationKind\)/.test(GS61), 'B5 the allocated-line builder classifies at the adapter (weeklyAiPlanClassifyDestination_), not the broken resolveWorkspaceLineDestination/destinationKind path');

var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
ok(/route_query_parity/.test(TEMP) && /candidate_set_mismatch_count/.test(TEMP), 'B6 diagnostic reports a route_query_parity section');
ok(/unmapped_method_raw_tokens_CLEARTEXT/.test(TEMP), 'B7 diagnostic reveals unmapped raw method tokens in cleartext (so Truck etc. can be confirmed)');
ok(/stage_tally/.test(TEMP) && /method_ai_ranked/.test(TEMP) && /method_manual_only/.test(TEMP), 'B8 dry assembly carries the ai_ranked/manual_only stage tally');
ok(/perScope\.scoped_safe = \(perScope\.fully_routed_lines > 0 && perScope\.conserved !== false\)/.test(TEMP), 'B9 scoped-safe needs ≥1 AI-rankable conserved line; unrelated blocked lines do not disqualify');

console.log('\n----------------------------------------');
console.log('R6F2C ROUTE-QUERY PARITY + DESTINATION IDENTITY: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
