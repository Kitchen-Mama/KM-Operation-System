// F1-7N-FA-3C-DRAFT-MODEL-R6F2D — three candidate-parity layers, Truck authority, last-mile route-pair resolution,
// clean-scope selection (partial UK rejected; smallest clean preferred), exact marketplace scope freeze + generation.
//   A  manual_method_options ⊇ ai_rankable_route_pairs(methods) ⊇ selected_ai_route (three layers, like-for-like).
//   B  Truck ← leading 'truck' (runtime-proven), never Courier.
//   C  {method,last_mile} pairs; cost→transit→canonical ranking; indistinguishable material tie → AUTHORITY_REQUIRED.
//   D  clean scope only (fully_routed==positive, zero blocks/manual/authority); smallest positive; lexical tie.
//   E/F freeze + generation are marketplace-exact (source contracts; the .gs cannot run in Node).
// Run: node assets/tests/inventory-clean-scope-lastmile-pairs-f1-7n-fa-3c-r6f2d.test.js
'use strict';
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMRA = require('../js/core/supply-planning-route-authority');
var KMWRR = require('../js/core/supply-planning-weekly-route-derivation');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var wh = { SRC: { warehouse_id: 'SRC', country: 'CN', is_active: true }, DST: { warehouse_id: 'DST', country: 'US', is_active: true } };
function card(method, lm, rate, cur) { return { origin_country: 'CN', destination_country: 'US', marketplace: '', shipping_method: method, status: 'active', last_mile_delivery: lm, unit_rate: String(rate), currency: cur || 'USD', charge_type: 'per_kg', charge_unit: 'kg' }; }
function lt(method, lm, days) { return { origin_country: 'CN', destination_country: 'US', shipping_method: method, last_mile_delivery: lm, avg_days: String(days) }; }
function der(cards, lts, req) { return KMWRR.deriveRoute({ source: { warehouse_id: 'SRC' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'DST' }, requiredByDate: req || '2026-12-31', shipDate: '2026-08-01', warehousesById: wh, rateCards: cards, leadTimes: lts }); }

// =====================================================================================================
section('B — Truck alias (runtime-proven), never Courier');
eq(KMRA.canonicalMethodKey('truck'), 'Truck', 'B1 truck → Truck');
eq(KMRA.canonicalMethodKey('TRUCK LTL'), 'Truck', 'B2 leading truck → Truck');
eq(KMRA.canonicalMethodKey('courier'), 'Courier', 'B3 courier stays Courier (Truck not folded in)');
eq(KMRA.METHOD_ALIAS_RULES.length, 5, 'B4 five reviewed alias buckets');

// =====================================================================================================
section('C — last-mile route pairs: expand, rank (cost→transit), tie → AUTHORITY_REQUIRED');
// two last-mile for Air, FBA cheaper → AI_RANKED FBA; selected last_mile on the header
var rCheap = der([card('Air', 'FBA', 5), card('Air', 'AWD', 9)], [lt('Air', 'FBA', 7), lt('Air', 'AWD', 7)]);
eq(rCheap.route_candidate_status, 'AI_RANKED', 'C1 distinguishable pairs → AI_RANKED');
eq(rCheap.selected_last_mile, 'FBA', 'C2 cheaper last-mile pair selected');
eq(rCheap.route.recommended_last_mile_delivery, 'FBA', 'C3 selected last_mile is on the K2 header');
eq(rCheap.ai_rankable_route_pairs.length, 2, 'C4 both pairs are ai-rankable');
// equal cost + equal transit, materially different → AUTHORITY_REQUIRED (never arbitrary)
var rTie = der([card('Air', 'FBA', 5), card('Air', 'AWD', 5)], [lt('Air', 'FBA', 7), lt('Air', 'AWD', 7)]);
eq(rTie.block, 'LAST_MILE_SELECTION_AUTHORITY_REQUIRED', 'C5 indistinguishable material pairs → AUTHORITY_REQUIRED');
eq(rTie.route_candidate_status, 'AUTHORITY_REQUIRED', 'C6 status AUTHORITY_REQUIRED');
// same cost, DIFFERENT transit → transit breaks the tie → AI_RANKED (faster)
var rFast = der([card('Air', 'FBA', 5), card('Air', 'AWD', 5)], [lt('Air', 'FBA', 5), lt('Air', 'AWD', 9)]);
eq(rFast.route_candidate_status, 'AI_RANKED', 'C7 equal cost, different transit → AI_RANKED');
eq(rFast.selected_last_mile, 'FBA', 'C8 shortest-transit pair wins the tie-break');
// different last_mile → distinct K2 route tuples (never merged into one header)
var plan = KMWRR.buildK2GenerationPlan({ scope: { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'US Amazon', source_page: 'inventory_replenishment' },
  allocatedLines: [
    { sku: 'A', site_sku: 'A', window_code: 'W1', required_by_date: '2026-12-31', source_warehouse_id: 'SRC', planned_qty: 4, recommended_qty: 4, marketplace: 'US Amazon', destination: { kind: 'MARKETPLACE', marketplace: 'US Amazon', country: 'US' }, __lm: 'FBA' }
  ], warehousesById: wh, rateCards: [card('Air', 'FBA', 5)], leadTimes: [lt('Air', 'FBA', 7)], shipDate: '2026-08-01' });
ok(plan.groups.length >= 1 && plan.groups[0].header.recommended_last_mile_delivery === 'FBA', 'C9 the K2 header key carries the selected last_mile');

// =====================================================================================================
section('A — three parity layers are internally consistent (selected ∈ ai ∈ manual)');
var mset = {}; rCheap.manual_method_options.forEach(function (m) { mset[m.value.toLowerCase()] = 1; });
ok(rCheap.ai_rankable_route_pairs.every(function (p) { return mset[p.method.toLowerCase()]; }), 'A1 every ai-rankable pair method is a manual option');
ok(mset[rCheap.selected_ai_route.method.toLowerCase()] && rCheap.ai_rankable_route_pairs.some(function (p) { return p.method === rCheap.selected_ai_route.method && p.last_mile === rCheap.selected_ai_route.last_mile; }), 'A2 selected ∈ ai_rankable ∈ manual');
// a MANUAL_ONLY / AUTHORITY_REQUIRED / BLOCKED line still carries manual_method_options (compared like-for-like, never manual-vs-selected)
var rNoLT = der([card('Air', 'FBA', 5)], []);
ok(rNoLT.route_candidate_status === 'MANUAL_ONLY' && rNoLT.manual_method_options.length === 1, 'A3 MANUAL_ONLY still exposes manual_method_options (parity compares manual-vs-manual)');
ok(rTie.manual_method_options.length === 1, 'A4 AUTHORITY_REQUIRED still exposes manual_method_options');

// =====================================================================================================
section('D — clean-scope selection: partial rejected; smallest clean preferred; lexical tie (replicates the dry-assembly rule)');
function selectClean(mk) {
  var clean = mk.filter(function (m) { return m.clean === true; });
  clean.sort(function (a, b) { if (a.positive !== b.positive) return a.positive - b.positive; var ka = a.company + '|' + a.country + '|' + a.marketplace, kb = b.company + '|' + b.country + '|' + b.marketplace; return ka < kb ? -1 : (ka > kb ? 1 : 0); });
  return clean.length ? clean[0] : null;
}
var mkScopes = [
  { company: 'KM', country: 'CA', marketplace: 'CA Amazon', positive: 28, clean: true },
  { company: 'KM', country: 'JP', marketplace: 'JP Amazon', positive: 5, clean: true },
  { company: 'KM', country: 'UK', marketplace: 'UK Amazon', positive: 21, clean: false }   // 17/21 → 4 blocked → NOT clean
];
var sel = selectClean(mkScopes);
eq(sel.country, 'JP', 'D1 JP (5/5) preferred over CA (28/28) — smallest clean positive count');
ok(!mkScopes.filter(function (m) { return m.clean; }).some(function (m) { return m.country === 'UK'; }), 'D2 UK partial (17/21) is NOT clean and is never selectable');
// lexical tie-break at equal positive
var tieScopes = [{ company: 'KM', country: 'US', marketplace: 'US Walmart', positive: 3, clean: true }, { company: 'KM', country: 'US', marketplace: 'US Amazon', positive: 3, clean: true }];
eq(selectClean(tieScopes).marketplace, 'US Amazon', 'D3 equal positive → stable lexical company|country|marketplace tie-break');

// =====================================================================================================
section('D/source — the dry assembly computes mk.clean and selects the smallest clean scope');
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
ok(/mk\.clean = \(mk\.positive > 0 && mk\.ai_ranked === mk\.positive && mk\.manual_only === 0 && mk\.authority_required === 0 && mk\.no_method === 0/.test(TEMP), 'D4 a clean marketplace scope requires every positive line AI-ranked + zero manual/authority/no-method blocks');
ok(/cleanScopes\.sort\(function \(a, b\) \{[\s\S]*?a\.positive - b\.positive/.test(TEMP), 'D5 clean scopes sorted by smallest positive first');
ok(/method_authority_required/.test(TEMP), 'D6 the stage tally tracks the AUTHORITY_REQUIRED bucket');

// =====================================================================================================
section('E — freeze refuses aggregated/non-clean scope; freezes marketplace-exact line-level detail (source contract)');
ok(/MARKETPLACE_SCOPE_REQUIRED/.test(TEMP) && /an aggregated company\/country is refused/.test(TEMP), 'E1 freeze refuses an aggregated company/country scope');
ok(/SCOPE_NOT_CLEAN/.test(TEMP) && /is not a Preflight clean marketplace scope/.test(TEMP), 'E2 freeze refuses a scope that is not a Preflight clean marketplace scope (UK partial)');
ok(/SCOPE_HAS_NON_AI_RANKED_LINES/.test(TEMP), 'E3 freeze double-guards: refuses if any line is not AI_RANKED');
ok(/expected_header_id: hid/.test(TEMP) && /expected_line_ids: lineIds/.test(TEMP) && /route_evidence_fp/.test(TEMP) && /scope_checksum/.test(TEMP), 'E4 freeze emits exact K2 header/line ids + route-evidence fingerprints + checksum');

// =====================================================================================================
section('F — controlled generation is marketplace-exact; applied == requested; ALL_SITES forbidden (source contract)');
var GS61 = read('specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
ok(/SCOPE_ALL_SITES_FORBIDDEN/.test(GS61) && /never ALL_SITES/.test(GS61), 'F1 a controlled run must target one marketplace, never ALL_SITES');
ok(/only\[requestedMkt\] = byMkt\[requestedMkt\]; byMkt = only/.test(GS61), 'F2 generation restricts to exactly the requested marketplace (no fan-out)');
ok(/APPLIED_SCOPE_WIDENED/.test(GS61) && /applied_equals_requested/.test(GS61), 'F3 applied scope must equal requested scope or the run fails closed');
ok(/REQUESTED_SCOPE_EMPTY/.test(GS61), 'F4 a requested marketplace that produced no lines fails closed');

// =====================================================================================================
section('regression — deterministic K2 ids + conservation + flag-false zero writes (source contracts)');
ok(/planned_qty: al\.planned_qty, recommended_qty: al\.recommended_qty/.test(read('js/core/supply-planning-weekly-route-derivation.js')), 'R1 line qty carried for conservation');
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_/.test(GS61) || /inventoryAiPlanDbGenerationEnabled_/.test(GS61), 'R2 generation remains flag-gated');

console.log('\n----------------------------------------');
console.log('R6F2D CLEAN SCOPE + LAST-MILE PAIRS: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
