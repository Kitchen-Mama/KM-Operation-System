// KMWRR route derivation + K2 partition + conservation — F1-7N-FA-3C-DRAFT-MODEL-R6F2.
// Run: node assets/tests/weekly-route-derivation-k2-partition-f1-7n-fa-3c-r6f2.test.js
var path = require('path');
var KMWRR = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-weekly-route-derivation.js'));
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function done() { console.log('\n' + '-'.repeat(40)); console.log('KMWRR ROUTE DERIVATION + K2 PARTITION (R6F2): ' + pass + ' passed, ' + fail + ' failed'); if (fail) process.exit(1); }

var WH = [
  { warehouse_id: 'WH-CN', warehouse_code: 'CN1', country: 'CN', is_active: true },
  { warehouse_id: 'WH-US', warehouse_code: 'US1', country: 'US', is_active: true },
  { warehouse_id: 'WH-OLD', warehouse_code: 'OLD', country: 'CN', is_active: false }
];
var whById = KMWRR.indexWarehouses(WH);

section('date math (pure, no clock)');
ok(KMWRR.dateToOrdinal('2026-08-02') - KMWRR.dateToOrdinal('2026-08-01') === 1, 'consecutive days differ by 1');
ok(KMWRR.dateToOrdinal('2026-03-01') - KMWRR.dateToOrdinal('2026-02-28') === 1, 'Feb→Mar boundary (2026 non-leap)');
ok(KMWRR.dateToOrdinal('bad') === null && KMWRR.dateToOrdinal('') === null, 'invalid/blank → null');

section('C1 source warehouse validation');
eq(KMWRR.deriveRoute({ source: {}, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US' }, warehousesById: whById }).block, 'ROUTE_SOURCE_UNKNOWN', 'blank source → ROUTE_SOURCE_UNKNOWN');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-ZZ' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US' }, warehousesById: whById }).block, 'ROUTE_SOURCE_UNKNOWN', 'unknown source id → ROUTE_SOURCE_UNKNOWN');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-OLD' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US' }, warehousesById: whById }).block, 'ROUTE_SOURCE_INACTIVE', 'inactive source → ROUTE_SOURCE_INACTIVE');

section('C2 destination validation (physical + logical)');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE' }, warehousesById: whById }).block, 'DESTINATION_MISSING', 'physical dest without id → DESTINATION_MISSING');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'MARKETPLACE' }, warehousesById: whById }).block, 'DESTINATION_MISSING', 'logical dest without marketplace → DESTINATION_MISSING');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-OLD' }, warehousesById: whById, rateCards: [] }).block, 'DESTINATION_INACTIVE', 'inactive dest warehouse → DESTINATION_INACTIVE');

// ---- shared carrier authorities for the method tests (CN → US lane) ----
var RATE_SEA = { origin_country: 'CN', destination_country: 'US', shipping_method: 'SEA', last_mile_delivery: 'FBA', currency: 'USD', charge_type: 'per_kg', charge_unit: 'kg', unit_rate: 3, min_charge: 100, status: 'active', effective_from: '2026-01-01', effective_to: '2026-12-31' };
var RATE_AIR = { origin_country: 'CN', destination_country: 'US', shipping_method: 'AIR', last_mile_delivery: 'FBA', currency: 'USD', charge_type: 'per_kg', charge_unit: 'kg', unit_rate: 9, min_charge: 100, status: 'active', effective_from: '2026-01-01', effective_to: '2026-12-31' };
var LT_SEA = { origin_country: 'CN', destination_country: 'US', shipping_method: 'SEA', last_mile_delivery: 'FBA', avg_days: 35 };
var LT_AIR = { origin_country: 'CN', destination_country: 'US', shipping_method: 'AIR', last_mile_delivery: 'FBA', avg_days: 7 };

section('C3 method selection — on-time + lowest comparable cost');
(function () {
  // required in 60 days → both SEA(35) and AIR(7) on-time → cheaper SEA chosen
  var r = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [RATE_SEA, RATE_AIR], leadTimes: [LT_SEA, LT_AIR] });
  ok(r.ok === true, 'C3 both on-time → OK');
  eq(r.route.recommended_shipping_method, 'SEA', 'C3 lowest comparable cost chosen (SEA 3 < AIR 9)');
  eq(r.route.recommended_last_mile_delivery, 'FBA', 'C3 last-mile resolved (single FBA)');
  eq(r.route.recommended_source_warehouse_id, 'WH-CN', 'C3 source carried');
  eq(r.route.recommended_destination_warehouse_id, 'WH-US', 'C3 destination carried');
})();

section('C3 no on-time option → MANUAL_ONLY / ROUTE_AUTO_RANKING_INSUFFICIENT (R6F2C: a valid manual method still exists)');
(function () {
  // required in 10 days → SEA(35) and AIR(7)... AIR is on-time (7<=10). Make required 5 days → neither on-time.
  var r = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-08-05', warehousesById: whById, rateCards: [RATE_SEA, RATE_AIR], leadTimes: [LT_SEA, LT_AIR] });
  eq(r.block, 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'R6F2C: none on-time → AI cannot auto-rank (a valid manual method still exists), NOT a hard no-method block');
  eq(r.route_candidate_status, 'MANUAL_ONLY', 'status MANUAL_ONLY');
  eq(r.auto_ranking_insufficient_reason, 'NO_ON_TIME', 'reason NO_ON_TIME');
  ok(r.manual_method_options && r.manual_method_options.length >= 1, 'manual method options are still offered');
  eq(r.advisory.fastest_method, 'AIR', 'advisory names the fastest (AIR 7d) — evidence only, not auto-chosen');
  ok(!r.route, 'no auto route returned');
})();

section('C3 incomparable currency → MANUAL_ONLY / ROUTE_AUTO_RANKING_INSUFFICIENT (COST_NOT_COMPARABLE)');
(function () {
  var airEUR = JSON.parse(JSON.stringify(RATE_AIR)); airEUR.currency = 'EUR';
  var r = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [RATE_SEA, airEUR], leadTimes: [LT_SEA, LT_AIR] });
  eq(r.block, 'ROUTE_AUTO_RANKING_INSUFFICIENT', 'two on-time methods, different currency → AI cannot rank (manual valid)');
  eq(r.auto_ranking_insufficient_reason, 'COST_NOT_COMPARABLE', 'reason COST_NOT_COMPARABLE');
})();

section('C3 no lane / no method → ROUTE_METHOD_UNRESOLVED');
eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [], leadTimes: [] }).block, 'ROUTE_METHOD_UNRESOLVED', 'empty rate cards → ROUTE_METHOD_UNRESOLVED');

section('C3 manual override — valid + invalid');
(function () {
  var rOk = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [RATE_SEA, RATE_AIR], leadTimes: [LT_SEA, LT_AIR], override: { shipping_method: 'AIR' } });
  ok(rOk.ok === true && rOk.route.recommended_shipping_method === 'AIR' && rOk.evidence.override === true, 'valid override honored (AIR even though SEA cheaper)');
  eq(KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [RATE_SEA, RATE_AIR], leadTimes: [LT_SEA, LT_AIR], override: { shipping_method: 'TRUCK' } }).block, 'OVERRIDE_INVALID', 'override method not on lane → OVERRIDE_INVALID');
})();

section('C4 last-mile — ambiguous / unresolved');
(function () {
  var seaFBA = RATE_SEA, seaMER = JSON.parse(JSON.stringify(RATE_SEA)); seaMER.last_mile_delivery = 'MERCHANT';
  var r = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [seaFBA, seaMER], leadTimes: [LT_SEA] });
  eq(r.block, 'LAST_MILE_AMBIGUOUS', 'two last-mile options for the chosen method → LAST_MILE_AMBIGUOUS');
})();

section('C2 logical marketplace destination');
(function () {
  var rateMkt = { origin_country: 'CN', destination_country: 'US', marketplace: 'Amazon', shipping_method: 'SEA', last_mile_delivery: 'FBA', currency: 'USD', charge_type: 'per_kg', charge_unit: 'kg', unit_rate: 3, status: 'active' };
  var r = KMWRR.deriveRoute({ source: { warehouse_id: 'WH-CN' }, destination: { kind: 'MARKETPLACE', marketplace: 'Amazon', country: 'US' }, shipDate: '2026-08-01', requiredByDate: '2026-09-30', warehousesById: whById, rateCards: [rateMkt], leadTimes: [LT_SEA] });
  ok(r.ok === true && r.route.destination_kind === 'MARKETPLACE' && r.route.destination_marketplace === 'Amazon', 'logical marketplace destination resolves via the marketplace lane');
})();

section('D deterministic group numbering + partition (incompatible routes never merged)');
(function () {
  var scope = { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment' };
  function route(src, method) { return { source_warehouse_id: src, destination_kind: 'WAREHOUSE', destination_warehouse_id: 'WH-US', destination_marketplace: '', recommended_source_warehouse_id: src, recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: method, recommended_last_mile_delivery: 'FBA' }; }
  var routed = [
    { line: { sku: 'B', window_code: 'W1', planned_qty: 5 }, route: route('WH-CN', 'SEA') },
    { line: { sku: 'A', window_code: 'W1', planned_qty: 3 }, route: route('WH-CN', 'SEA') },
    { line: { sku: 'C', window_code: 'W1', planned_qty: 2 }, route: route('WH-CN', 'AIR') },
    { line: { sku: 'D', window_code: 'W1', planned_qty: 0 }, block: 'ROUTE_NO_ON_TIME_OPTION', advisory: { fastest_method: 'AIR' } }
  ];
  var p = KMWRR.partitionRoutedLines(scope, routed);
  eq(p.groups.length, 2, 'D: 2 distinct routes (SEA, AIR) → 2 groups; blocked line excluded');
  eq(p.blocked.length, 1, 'D: blocked line captured (no header/lines)');
  // deterministic ordinal: groups sorted by route tuple; group_no 1..N stable
  var rerun = KMWRR.partitionRoutedLines(scope, routed.slice().reverse());
  eq(p.groups.map(function (g) { return g.routeKey + '#' + g.groupNo; }), rerun.groups.map(function (g) { return g.routeKey + '#' + g.groupNo; }), 'D: group numbering stable regardless of input order');
  ok(p.groups[0].header.recommendation_group_no === '1' && p.groups[1].header.recommendation_group_no === '2', 'D: recommendation_group_no = 1..N');
  ok(p.groups[0].header.recommended_shipping_method !== p.groups[1].header.recommended_shipping_method, 'D: incompatible routes are separate headers');
})();

section('D quantity conservation + source ceiling + duplicate detection');
(function () {
  var scope = { planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' };
  function route(src) { return { source_warehouse_id: src, destination_kind: 'WAREHOUSE', destination_warehouse_id: 'WH-US', destination_marketplace: '', recommended_source_warehouse_id: src, recommended_destination_warehouse_id: 'WH-US', recommended_shipping_method: 'SEA', recommended_last_mile_delivery: 'FBA' }; }
  // SKU X split across two sources: 40 from WH-CN + 60 from WH-US = 100 authorized
  var routed = [
    { line: { sku: 'X', window_code: 'W1', planned_qty: 40 }, route: route('WH-CN') },
    { line: { sku: 'X', window_code: 'W1', planned_qty: 60 }, route: route('WH-US') }
  ];
  var p = KMWRR.partitionRoutedLines(scope, routed);
  var okCons = KMWRR.checkConservation({ 'x|w1': 100 }, p.groups, { 'wh-cn': 50, 'wh-us': 100 });
  ok(okCons.conserved === true, 'D: split 40+60 == authorized 100, both sources within ceiling → conserved');
  var overAuth = KMWRR.checkConservation({ 'x|w1': 90 }, p.groups, { 'wh-cn': 50, 'wh-us': 100 });
  ok(overAuth.conserved === false && overAuth.over_authorized.length === 1, 'D: allocated 100 > authorized 90 → over_authorized');
  var overSrc = KMWRR.checkConservation({ 'x|w1': 100 }, p.groups, { 'wh-cn': 30, 'wh-us': 100 });
  ok(overSrc.conserved === false && overSrc.over_source.length === 1 && overSrc.over_source[0].source_warehouse_id === 'wh-cn', 'D: WH-CN 40 > ceiling 30 → over_source');
})();

section('D zero-qty / zero recommendation creates no line-group side effects');
(function () {
  var scope = { planning_cycle: 'C', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inv' };
  var p = KMWRR.partitionRoutedLines(scope, []);
  eq(p.groups.length, 0, 'D: no routed lines → zero groups (zero recommendations create no header/lines)');
})();

section('E buildK2GenerationPlan — end-to-end (route → partition → conservation)');
(function () {
  var scope = { planning_cycle: 'RECO-2026-08', company: 'KM', country: 'US', marketplace: 'AMZ', source_page: 'inventory_replenishment' };
  var input = {
    scope: scope, warehouses: WH, shipDate: '2026-08-01',
    rateCards: [RATE_SEA, RATE_AIR], leadTimes: [LT_SEA, LT_AIR],
    allocatedLines: [
      // SKU X split 40 (WH-CN) + 60 (WH-US, same-country lane has no rate → will BLOCK) — test mixed OK/BLOCK
      { sku: 'X', site_sku: 'X-US', window_code: 'W1', required_by_date: '2026-09-30', source_warehouse_id: 'WH-CN', source_warehouse_code_snapshot: 'CN1', planned_qty: 40, recommended_qty: 40, units_per_carton: 10, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' } },
      { sku: 'Y', site_sku: 'Y-US', window_code: 'W1', required_by_date: '2026-09-30', source_warehouse_id: 'WH-CN', source_warehouse_code_snapshot: 'CN1', planned_qty: 20, recommended_qty: 20, units_per_carton: 5, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' } },
      // a source with no active row → BLOCK (inactive source)
      { sku: 'Z', site_sku: 'Z-US', window_code: 'W1', required_by_date: '2026-09-30', source_warehouse_id: 'WH-OLD', source_warehouse_code_snapshot: 'OLD', planned_qty: 5, recommended_qty: 5, units_per_carton: 1, destination: { kind: 'WAREHOUSE', warehouse_id: 'WH-US', country: 'US' } }
    ],
    authorizedBySkuWindow: { 'x|w1': 40, 'y|w1': 20 },
    sourceCeilingById: { 'wh-cn': 100 }
  };
  var plan = KMWRR.buildK2GenerationPlan(input);
  eq(plan.groups.length, 1, 'E: X + Y share the same CN→US SEA route → ONE K2 group header');
  eq(plan.groups[0].lines.length, 2, 'E: 2 SKU/window lines under that header');
  eq(plan.groups[0].header.recommended_shipping_method, 'SEA', 'E: header carries the derived route method');
  eq(plan.groups[0].header.recommendation_group_no, '1', 'E: deterministic group_no = 1');
  eq(plan.blocked.length, 1, 'E: the inactive-source line is BLOCKED (no header/lines)');
  eq(plan.blocked[0].block, 'ROUTE_SOURCE_INACTIVE', 'E: block token surfaced');
  ok(plan.conservation.conserved === true, 'E: 40+20 within authorized + WH-CN 60 within ceiling 100 → conserved');
  ok(plan.ok === true, 'E: plan ok when conserved and all resolvable lines grouped');
  // line payload is the exact-30 grain (no route fields on the line)
  ok(!('recommended_shipping_method' in plan.groups[0].lines[0]), 'E: line carries NO route field (route is header-level)');
  ok(plan.groups[0].lines[0].source_warehouse_id === 'WH-CN' && plan.groups[0].lines[0].source_warehouse_code_snapshot === 'CN1', 'E: line carries its source evidence');
})();

done();
