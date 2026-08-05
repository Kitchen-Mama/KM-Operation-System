// Kitchen Mama Operation System — Production Recommendation Source Projection Runtime tests (Round 1S-P1.5B).
// Run: node assets/tests/supply-planning-source-projection.test.js
// Proves the pure in-memory Projection Runtime SHAPES snapshots of the canonical Operation DB tables into the
// frozen DTO snapshots, reuses the frozen Production Reader (KMSRP) → whole chain → Plan Builder (Weekly 96 /
// Monthly 24), and honors the frozen decisions D-1 (FACTORY_SHARED), D-2 (factory as-of), D-3 (destination
// ownership), D-4 (table-specific status mapping). No writes; no Sheets; pure/deterministic.

'use strict';
var SP = require('../js/core/supply-planning-source-projection.js');
var PB = require('../js/core/supply-planning-plan-builder.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }
function issueReasons(p) { return p.issues.map(function (x) { return x.reason; }); }
function supplyOf(p, pool) { return p.supplySourceEntries.filter(function (r) { return r.pool_type === pool; }); }

var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

// schema-accurate fake canonical DB snapshots (row-object form; value-preserving)
function weeklyCanonical() {
  return {
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE,
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-3PL', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true }],
      marketplaces: [{ marketplace: 'AMAZON_US', allocation_priority: 1 }],
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', sep: 100 }],
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', site_sku: 'ST-1', wh_available_stock: 100, snapshot_date: '2026-08-01' }]
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function monthlyCanonical() {
  return {
    recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-M08', businessScope: MSCOPE,
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-FAC', company: 'CN_YOUXIN', country: 'CN', is_factory_warehouse: true, is_active: true }],
      marketplaces: [{ marketplace: 'AMAZON_US', allocation_priority: 1 }],
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', sep: 100 }],
      factoryStock: [{ warehouse_id: 'WH-FAC', sku: 'CO1100-R', fac_current_stock: 60, last_transaction_at: '2026-08-01' }]
    },
    factoryDemandFacts: [{ demandRef: 'FC:F1', eligibleFactoryWarehouseIds: 'WH-FAC', allocationPriority: 1, requiredByDate: '2026-09-01', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', requestMonth: '2026-09', requestBucket: 'B1', netOrderNeed: 13, unitsPerCarton: 12 }]
  };
}

// ==========================================================================
section('A. Weekly full pure-runtime path: canonical snapshots → projection → reader → Plan Builder (96)');
(function () {
  var p = SP.projectRecommendationProductionSources(weeklyCanonical());
  eq([p.ready, p.recommendationType, p.reason], [true, 'WEEKLY_SHIPPING', null], 'A1 projection ready');
  eq([p.demandSourceEntries.length, p.demandSourceEntries[0].quantity, p.demandSourceEntries[0].source_ref], [1, 100, 'FC:F1'], 'A2 Regular FC month projected → demand qty 100');
  eq([p.supplySourceEntries.length, p.supplySourceEntries[0].pool_type, p.supplySourceEntries[0].quantity], [1, 'THREE_PL', 100], 'A3 3PL current-stock supply 100');
  eq(p.lineage.origin, 'PROJECTION_RUNTIME', 'A4 lineage origin tagged (in-memory only)');
  var full = SP.projectAndRead(weeklyCanonical());
  eq([full.ready, full.recommendationType], [true, 'WEEKLY_SHIPPING'], 'A5 projectAndRead ready via frozen KMSRP');
  eq(full.bridgeResult.lines[0].recommendedQty, 96, 'A6 recommendedQty 96 through the real chain');
  var cmd = PB.buildRecommendation(full.bridgeResult);
  eq(cmd.command.recommendedLines[0].recommendedQty, 96, 'A7 Plan Builder accepts projected Weekly facts → 96');
})();

section('B. Monthly full pure-runtime path (CEILING 24) + FACTORY_SHARED pool');
(function () {
  var p = SP.projectRecommendationProductionSources(monthlyCanonical());
  eq([p.ready, p.recommendationType], [true, 'MONTHLY_ORDER'], 'B1 projection ready');
  var f = supplyOf(p, 'FACTORY');
  eq([f.length, f[0].company, f[0].quantity], [1, 'FACTORY_SHARED', 60], 'B2 FACTORY pool company = FACTORY_SHARED (D-1)');
  var full = SP.projectAndRead(monthlyCanonical());
  eq(full.bridgeResult.lines[0].recommendedQty, 24, 'B3 CEILING(13/12)*12 = 24 through the real chain');
  var cmd = PB.buildRecommendation(full.bridgeResult);
  eq(cmd.command.recommendedLines[0].recommendedQty, 24, 'B4 Plan Builder accepts projected Monthly facts → 24');
})();

section('C. D-1 FACTORY_SHARED — shared pool, not duplicated per receiver company');
(function () {
  var inp = monthlyCanonical();
  var p = SP.projectRecommendationProductionSources(inp);
  var f = supplyOf(p, 'FACTORY');
  eq(f.length, 1, 'C1 one factory stock row → ONE shared supply pool (never 2× per company)');
  eq(f[0].company, 'FACTORY_SHARED', 'C2 pool company is the sentinel, not scope.company');
  ok(f[0].company !== inp.businessScope.company, 'C3 not the execution scope company (KM)');
  // warehouses.company is owner/admin context only — changing it must NOT change pool company
  var inp2 = monthlyCanonical(); inp2.sourceSnapshots.warehouses[0].company = 'RESUS';
  var f2 = supplyOf(SP.projectRecommendationProductionSources(inp2), 'FACTORY');
  eq(f2[0].company, 'FACTORY_SHARED', 'C4 warehouses.company does not change pool ownership');
  eq(f2[0].supply_lineage_ref, 'stock:FACTORY:WH-FAC:CO1100-R', 'C5 factory lineage stable (no company in lineage)');
})();

section('D. D-2 Factory source-as-of (last_transaction_at → updated_at → SOURCE_AS_OF_MISSING)');
(function () {
  var a = SP.projectRecommendationProductionSources(monthlyCanonical());
  eq(a.sourceAsOfByType.factoryStock, '2026-08-01', 'D1 last_transaction_at is primary as-of');
  var b = monthlyCanonical(); delete b.sourceSnapshots.factoryStock[0].last_transaction_at; b.sourceSnapshots.factoryStock[0].updated_at = '2026-07-30';
  eq(SP.projectRecommendationProductionSources(b).sourceAsOfByType.factoryStock, '2026-07-30', 'D2 fallback updated_at');
  var c = monthlyCanonical(); delete c.sourceSnapshots.factoryStock[0].last_transaction_at;
  var pc = SP.projectRecommendationProductionSources(c);
  ok(issueReasons(pc).indexOf('SOURCE_AS_OF_MISSING') >= 0, 'D3 both missing → SOURCE_AS_OF_MISSING');
  eq(pc.sourceAsOfByType.factoryStock, null, 'D4 factory as-of null when missing (never the clock)');
})();

section('E. D-3 Destination ownership (caller/planning-scope; else MISSING_DESTINATION_WAREHOUSE)');
(function () {
  var withRoute = SP.projectRecommendationProductionSources(weeklyCanonical());
  eq(withRoute.demandSourceEntries[0].destination_warehouse_id, 'WH-3PL', 'E1 explicit routing → destination set');
  var noRoute = weeklyCanonical(); noRoute.routing = {};
  var p = SP.projectRecommendationProductionSources(noRoute);
  ok(issueReasons(p).indexOf('MISSING_DESTINATION_WAREHOUSE') >= 0, 'E2 no destination → MISSING_DESTINATION_WAREHOUSE');
  eq(p.demandSourceEntries.length, 0, 'E3 demand blocked (excluded), never fabricated');
  // must NOT infer from country/marketplace/warehouse_code/first-match
  var infer = weeklyCanonical(); infer.routing = {}; infer.businessScope = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
  eq(SP.projectRecommendationProductionSources(infer).demandSourceEntries.length, 0, 'E4 no inference from country/marketplace');
  // frozen-scope destination (regeneration) authority
  var regen = weeklyCanonical(); regen.routing = {}; regen.businessScope = Object.assign({}, WSCOPE, { destinationWarehouseId: 'WH-3PL' });
  eq(SP.projectRecommendationProductionSources(regen).demandSourceEntries[0].destination_warehouse_id, 'WH-3PL', 'E5 persisted/frozen-scope destination honored');
})();

section('F. shipping_plans → canonical bridge (F1-3b; approved vocab; canonical lineage)');
(function () {
  // Canonical shipping_plans identity: shipping_plan_id + shipping_plan_line_id (11_ handlers); status `approved`
  // (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A). Classification is now delegated to KMSF.projectSupplyLifecycle.
  function withPlan(status) { var i = weeklyCanonical(); i.sourceSnapshots.shippingPlans = [{ status: status, sku: 'CO1100-R', company: 'KM', approved_qty: 40, destination_warehouse_id: 'WH-3PL', shipping_plan_id: 'SP1', shipping_plan_line_id: 'SPL1', source_data_as_of: '2026-08-01' }]; return SP.projectRecommendationProductionSources(i); }
  var conf = withPlan('approved').supplySourceEntries.filter(function (r) { return r.lifecycle_bucket === 'APPROVED_SHIPPING_PLAN'; });
  eq([conf.length, conf[0].quantity, conf[0].supply_lineage_ref], [1, 40, 'shipping_plan:SP1:SPL1'], 'F1 approved → APPROVED_SHIPPING_PLAN via canonical bridge + canonical lineage (11_ handlers; WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A)');
  eq(withPlan('draft').supplySourceEntries.filter(function (r) { return r.lifecycle_bucket === 'APPROVED_SHIPPING_PLAN'; }).length, 0, 'F2 draft → DRAFT bucket (visible, 0 effective — never APPROVED)');
  // site_confirmed is NOT a canonical shipping_plans status (it belongs to the allocation-draft family) → fail closed
  var sc = withPlan('site_confirmed');
  eq(sc.supplySourceEntries.filter(function (r) { return r.supply_lineage_ref.indexOf('shipping_plan:') === 0; }).length, 0, 'F3 site_confirmed is NOT a canonical shipping_plans token → no plan supply row');
  ok(issueReasons(sc).some(function (r) { return r.indexOf('UNKNOWN_STATUS') >= 0; }), 'F4 site_confirmed → UNKNOWN_STATUS fail-closed (approved is canonical; the source-projection outlier is removed)');
  // completed → OMIT_TRANSFERRED (transferred down-lineage to a Shipment; count-once)
  ok(issueReasons(withPlan('completed')).some(function (r) { return r.indexOf('LINEAGE_TRANSFERRED_DOWNSTREAM') >= 0; }), 'F5 completed → OMIT_TRANSFERRED (canonical plan→shipment count-once)');
})();

section('G. shipments → canonical bridge (F1-3b; B4-R3 lineage; SC-11.4 authorities)');
(function () {
  // Canonical shipment identity: shipment_id + shipment_line_id → B4-R3 lineage shipment:<id>:<lineId>. eta before
  // requiredByDate (2026-09-01). Classification delegated to KMSF.projectSupplyLifecycle (evaluateQualifiedIncoming).
  function withShip(extra) { var i = weeklyCanonical(); i.sourceSnapshots.shipments = [Object.assign({ sku: 'CO1100-R', company: 'KM', shipment_qty: 30, destination_warehouse_id: 'WH-3PL', shipment_id: 'SH1', shipment_line_id: 'SL1', eta: '2026-08-20', source_data_as_of: '2026-08-01' }, extra)]; return SP.projectRecommendationProductionSources(i); }
  function shipEntry(p) { var r = p.supplySourceEntries.filter(function (x) { return x.supply_lineage_ref.indexOf('shipment:') === 0; }); return r.length ? r[0] : null; }
  function bucketOf(p) { var e = shipEntry(p); return e ? e.lifecycle_bucket : null; }
  eq([bucketOf(withShip({ status: 'shipped' })), (shipEntry(withShip({ status: 'shipped' })) || {}).supply_lineage_ref], ['SHIPPED_IN_TRANSIT', 'shipment:SH1:SL1'], 'G1 shipped → SHIPPED_IN_TRANSIT + canonical B4-R3 lineage shipment:SH1:SL1');
  eq(bucketOf(withShip({ status: 'in_transit' })), 'SHIPPED_IN_TRANSIT', 'G2 in_transit → SHIPPED_IN_TRANSIT');
  eq(bucketOf(withShip({ status: 'arrived' })), 'SHIPPED_IN_TRANSIT', 'G3 arrived → SHIPPED_IN_TRANSIT (SC-11.4-B; not delivered)');
  eq(bucketOf(withShip({ status: 'ready_to_ship' })), 'APPROVED_SHIPPING_PLAN', 'G4 ready_to_ship → APPROVED_SHIPPING_PLAN');
  // received: raw status alone never a receiving authority → OMIT (SC-11.4-B/SC-11.5); not emitted, no bucket
  var recv = withShip({ status: 'received' });
  ok(bucketOf(recv) === null && issueReasons(recv).some(function (r) { return r.indexOf('RECEIVING_AUTHORITY_REQUIRED') >= 0; }), 'G5 received → OMIT (SC-11.4-B/SC-11.5: RECEIVED_NOT_REFLECTED only from receivingFacts, never raw status)');
  // closed → OMIT (belongs to the CURRENT_STOCK inventory authority)
  var closed = withShip({ status: 'closed' });
  ok(bucketOf(closed) === null && issueReasons(closed).some(function (r) { return r.indexOf('POSTED_TO_CURRENT_STOCK_AUTHORITY') >= 0; }), 'G6 closed → OMIT (posted to CURRENT_STOCK authority)');
  eq(bucketOf(withShip({ status: 'draft' })), 'DRAFT', 'G7 draft → DRAFT bucket (visible, 0 effective)');
  eq(bucketOf(withShip({ status: 'cancelled' })), 'CANCELLED_INVALID', 'G8 cancelled → CANCELLED_INVALID (visible, 0 effective)');
  // legacy + unknown tokens → UNKNOWN_STATUS fail-closed (canonical bridge; no second allowlist here)
  ['planned', 'completed', 'partial_received', 'partially_received', 'stuck', 'weird_token'].forEach(function (s) {
    ok(issueReasons(withShip({ status: s })).some(function (r) { return r.indexOf('UNKNOWN_STATUS') >= 0; }), 'G9 non-canonical ' + s + ' → UNKNOWN_STATUS fail-closed');
  });
  // malformed row lacking canonical shipment identity → fail closed via the B4-R3 adapter (never a synthetic lineage)
  var i2 = weeklyCanonical(); i2.sourceSnapshots.shipments = [{ status: 'shipped', sku: 'CO1100-R', company: 'KM', shipment_qty: 30, destination_warehouse_id: 'WH-3PL', shipment_line_id: 'SL1', source_data_as_of: '2026-08-01' }];
  var noId = SP.projectRecommendationProductionSources(i2);
  ok(shipEntry(noId) === null && issueReasons(noId).some(function (r) { return r.indexOf('ADAPT_FAILED') >= 0; }), 'G10 missing shipment_id → fail closed (ADAPT_FAILED; no unstable synthetic lineage)');
  // CURRENT_STOCK is never derived from shipment status
  eq(withShip({ status: 'shipped' }).supplySourceEntries.filter(function (x) { return x.supply_lineage_ref.indexOf('shipment:') === 0 && x.lifecycle_bucket === 'CURRENT_STOCK'; }).length, 0, 'G11 CURRENT_STOCK never derived from shipment status');
})();

section('H. Current-stock projection FBA / 3PL / FACTORY');
(function () {
  var i = weeklyCanonical();
  i.sourceSnapshots.amazonInventorySnapshot = [{ sku: 'CO1100-R', country: 'US', marketplace: 'AMAZON_US', available_qty: 20, warehouse_id: 'FBA-US', snapshot_date: '2026-08-02' }];
  var p = SP.projectRecommendationProductionSources(i);
  var fba = supplyOf(p, 'FBA');
  eq([fba.length, fba[0].quantity, fba[0].company, fba[0].supply_lineage_ref], [1, 20, 'KM', 'stock:FBA:FBA-US:CO1100-R'], 'H1 FBA current stock (company = run company)');
  eq(p.sourceAsOfByType.amazonInventorySnapshot, '2026-08-02', 'H2 FBA as-of from snapshot_date');
  // same physical 3PL stock across two marketplace rows dedups by lineage (no marketplace in physical identity)
  var i2 = weeklyCanonical();
  i2.sourceSnapshots.overseasInventorySnapshot = [
    { warehouse_id: 'WH-3PL', sku: 'CO1100-R', wh_available_stock: 100, snapshot_date: '2026-08-01' },
    { warehouse_id: 'WH-3PL', sku: 'CO1100-R', wh_available_stock: 100, snapshot_date: '2026-08-01' }
  ];
  var lineages = supplyOf(SP.projectRecommendationProductionSources(i2), 'THREE_PL').map(function (r) { return r.supply_lineage_ref; });
  eq(lineages, ['stock:THREE_PL:WH-3PL:CO1100-R', 'stock:THREE_PL:WH-3PL:CO1100-R'], 'H3 same physical pool → identical lineage (Ledger dedups count-once)');
})();

section('I. Demand projection semantics (explicit zero / blank / special event / missing)');
(function () {
  var z = weeklyCanonical(); z.sourceSnapshots.fcRegularForecast[0].sep = 0;
  eq(SP.projectRecommendationProductionSources(z).demandSourceEntries[0].quantity, 0, 'I1 explicit zero FC is valid (kept 0)');
  var b = weeklyCanonical(); b.sourceSnapshots.fcRegularForecast[0].sep = '';
  eq(SP.projectRecommendationProductionSources(b).demandSourceEntries.length, 0, 'I2 blank month stays MISSING (no fabricated 0)');
  var noMonth = weeklyCanonical(); delete noMonth.forecastMonth;
  ok(issueReasons(SP.projectRecommendationProductionSources(noMonth)).indexOf('MISSING_FORECAST') >= 0, 'I3 missing forecast month → MISSING_FORECAST');
  var evt = weeklyCanonical();
  evt.sourceSnapshots.fcSpecialEvents = [{ event_fc_id: 'E9', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', fc_qty: 30 }];
  evt.routing['EVT:E9'] = 'WH-3PL';
  var pe = SP.projectRecommendationProductionSources(evt);
  var ev = pe.demandSourceEntries.filter(function (r) { return r.demand_type === 'SPECIAL_EVENT'; });
  eq([ev.length, ev[0].event_id, ev[0].quantity, ev[0].source_ref], [1, 'E9', 30, 'EVT:E9'], 'I4 special event → distinct event_id demand');
})();

section('J. Required sources fail-closed + malformed input');
(function () {
  var noSupply = weeklyCanonical(); delete noSupply.sourceSnapshots.overseasInventorySnapshot;
  eq(SP.projectRecommendationProductionSources(noSupply).reason, 'MISSING_SNAPSHOT', 'J1 no supply → fail closed');
  var noFacts = weeklyCanonical(); noFacts.planningFacts = [];
  eq(SP.projectRecommendationProductionSources(noFacts).reason, 'SOURCE_NOT_AVAILABLE', 'J2 no planning facts → fail closed');
  throwsType(function () { SP.projectRecommendationProductionSources({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40' }); }, 'J3 missing businessScope → TypeError');
  throwsType(function () { SP.projectRecommendationProductionSources({ recommendationType: 'X', planningCycle: 'c', businessScope: {} }); }, 'J4 bad recommendationType → TypeError');
  throwsType(function () { var i = weeklyCanonical(); i.sourceSnapshots.fcRegularForecast = 42; SP.projectRecommendationProductionSources(i); }, 'J5 malformed snapshot → TypeError');
})();

section('K. Purity / determinism');
(function () {
  var inp = weeklyCanonical();
  var snap = JSON.stringify(inp);
  var a1 = SP.projectRecommendationProductionSources(inp);
  ok(JSON.stringify(inp) === snap, 'K1 input not mutated');
  var a2 = SP.projectRecommendationProductionSources(weeklyCanonical());
  eq(a1, a2, 'K2 deterministic (deep-equal; no clock/random/locale)');
  ok(a1 !== a2 && a1.supplySourceEntries !== a2.supplySourceEntries, 'K3 fresh output objects');
  // source-code purity scan (strip comments)
  var fs = require('fs'); var src = fs.readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'supply-planning-source-projection.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/SpreadsheetApp|LockService|CacheService/.test(code), 'K4 no SpreadsheetApp/LockService/CacheService');
  ok(!/Date\.now|Math\.random|localeCompare/.test(code), 'K5 no clock/random/locale');
  // full path is also deterministic
  eq(SP.projectAndRead(weeklyCanonical()).bridgeResult.lines[0].recommendedQty, SP.projectAndRead(weeklyCanonical()).bridgeResult.lines[0].recommendedQty, 'K6 full path deterministic (96)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1S-P1.5B Source Projection assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
