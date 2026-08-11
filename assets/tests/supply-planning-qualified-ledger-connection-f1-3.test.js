// Kitchen Mama Operation System — F1-3 Qualified-Incoming → Supply-Ledger PRODUCTION connection tests (Phase F1-3b).
// Run: node assets/tests/supply-planning-qualified-ledger-connection-f1-3.test.js
// -----------------------------------------------------------------------------
// Proves the F1-3 production connection: the production supply builder (KMSP.projectRecommendationProductionSources)
// now classifies shipping_plans + shipments ONLY through the canonical bridge KMSF.projectSupplyLifecycle
// (§2E evaluateQualifiedIncoming ten-gate + §39.5 lifecycle + buildSupplyLedger), with Current Stock kept direct.
// It owns NO second status/lifecycle authority. Delivery / receiving / external buckets require their own canonical
// authorities. All proofs are pure/deterministic — no Sheet/DB/API, no clock/random, no writes.
//
// Authority: RECOMMENDATION_SOURCE_CONTRACT_SPEC.md SC-11.4-B/C, SC-11.5; WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A;
// SHIPMENT_CENTER_SPEC §535; OVERSEAS_INBOUND_SPEC §10.6/§303; SUPPLY_PLANNING_CALCULATION_RULES §2E/§2F/§39.

'use strict';
var SP = require('../js/core/supply-planning-source-projection.js');
var KMSF = require('../js/core/supply-planning-source-facts.js');
var KMQI = require('../js/core/supply-planning-qualified-incoming.js');
var KMPS = require('../js/core/supply-planning-production-source.js');
var buildKm = require('../js/core/supply-planning-supply-candidates.js').buildKmShipmentSupplyCandidate;
var adaptKm = require('../js/core/supply-planning-incoming-adapters.js').adaptKmShipmentIncomingCandidate;
var fs = require('fs'), path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- production-path fixtures (canonical DB row-object snapshots; single-SKU weekly run) --------------------
var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
function weekly() {
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
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', wh_available_stock: 100, snapshot_date: '2026-08-01' }]
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function issueReasons(p) { return p.issues.map(function (x) { return String(x.reason); }); }
function hasIssue(p, sub) { return issueReasons(p).some(function (r) { return r.indexOf(sub) >= 0; }); }
function entryByLineage(p, prefix) { var r = p.supplySourceEntries.filter(function (x) { return String(x.supply_lineage_ref).indexOf(prefix) === 0; }); return r.length ? r[0] : null; }
function withPlan(status, extra) { var i = weekly(); i.sourceSnapshots.shippingPlans = [Object.assign({ status: status, sku: 'CO1100-R', company: 'KM', approved_qty: 40, destination_warehouse_id: 'WH-3PL', shipping_plan_id: 'SP1', shipping_plan_line_id: 'SPL1', source_data_as_of: '2026-08-01' }, extra)]; return SP.projectRecommendationProductionSources(i); }
// R7C: shipment INCOMING physical grain = shipment_lines; the header carries the specific {KM,US,AMAZON_US}
// receiver (blank lineage → header fallback → scope receiver). `extra` applies to the header (status, etc.).
function withShip(status, extra) {
  var i = weekly();
  i.sourceSnapshots.shipments = [Object.assign({ status: status, company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', shipment_id: 'SH1', eta: '2026-08-20', source_data_as_of: '2026-08-01' }, extra)];
  i.sourceSnapshots.shipmentLines = [{ shipment_id: 'SH1', shipment_line_id: 'SL1', sku: 'CO1100-R', shipment_qty: 30 }];
  return SP.projectRecommendationProductionSources(i);
}

// ---- canonical-bridge fixtures (direct KMSF.projectSupplyLifecycle / KMQI) ----------------------------------
function shipInput(id, status, qty, eta) {
  return { shipment: { shipmentId: id, company: 'KM', country: 'US', marketplace: 'AMAZON_US', eta: eta || '2026-08-15', status: status, destinationWarehouseId: 'WH1' },
           line: { shipmentLineId: id + '-L1', sku: 'CO1100-R', shipmentQty: qty } };
}
function lifeShip(inputs, extra) { var s = { shipmentInputs: inputs, scope: { company: 'KM', sku: 'CO1100-R', destinationWarehouseId: 'WH1', country: 'US', marketplace: 'AMAZON_US' }, requiredByDate: '2026-09-01' }; if (extra) for (var k in extra) s[k] = extra[k]; return s; }
function planLifeRow(ref, status, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, status: status }; }
function eventRow(ref, evt, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, eventType: evt }; }
function recvRow(ref, status, qty) { return { supplyLineageRef: ref, company: 'KM', masterSku: 'CO1100-R', warehouseId: 'WH1', poolType: 'THREE_PL', quantity: qty, status: status }; }

// =====================================================================================================
section('A. Production path — two-path result (Current Stock direct; incoming via canonical bridge)');
(function () {
  // 1. Current Stock stays a DIRECT CURRENT_STOCK entry (stock: lineage) — never routed through Qualified Incoming.
  var base = SP.projectRecommendationProductionSources(weekly());
  var cs = base.supplySourceEntries.filter(function (r) { return r.lifecycle_bucket === 'CURRENT_STOCK'; });
  eq([cs.length, cs[0].pool_type, cs[0].supply_lineage_ref.indexOf('stock:') === 0], [1, 'THREE_PL', true], '1 Current Stock stays direct CURRENT_STOCK (stock: lineage; not via Qualified Incoming)');

  // 2. Approved shipping plan reaches the canonical lifecycle path (APPROVED_SHIPPING_PLAN + canonical lineage).
  var appr = entryByLineage(withPlan('approved'), 'shipping_plan:');
  eq([appr && appr.lifecycle_bucket, appr && appr.quantity, appr && appr.supply_lineage_ref], ['APPROVED_SHIPPING_PLAN', 40, 'shipping_plan:SP1:SPL1'], '2 approved shipping plan → APPROVED_SHIPPING_PLAN via canonical bridge (§3.2A / 11_ handlers)');

  // 3. site_confirmed is NOT a hidden second authority — it fails closed (UNKNOWN_STATUS), emits no plan supply row.
  var sc = withPlan('site_confirmed');
  ok(entryByLineage(sc, 'shipping_plan:') === null && hasIssue(sc, 'UNKNOWN_STATUS'), '3 site_confirmed → fail-closed UNKNOWN_STATUS (no hidden second plan authority; approved is canonical)');

  // 4/5/6. shipped / in_transit / arrived shipment → SHIPPED_IN_TRANSIT via the canonical lifecycle path.
  eq((entryByLineage(withShip('shipped'), 'shipment:') || {}).lifecycle_bucket, 'SHIPPED_IN_TRANSIT', '4 shipped shipment → SHIPPED_IN_TRANSIT (canonical lifecycle path)');
  eq((entryByLineage(withShip('in_transit'), 'shipment:') || {}).lifecycle_bucket, 'SHIPPED_IN_TRANSIT', '5 in_transit shipment → SHIPPED_IN_TRANSIT');
  eq((entryByLineage(withShip('arrived'), 'shipment:') || {}).lifecycle_bucket, 'SHIPPED_IN_TRANSIT', '6 arrived shipment → SHIPPED_IN_TRANSIT (SC-11.4-B)');

  // 7. Arrived alone never creates DELIVERED_NOT_RECEIVED (SC-11.4-C).
  ok(withShip('arrived').supplySourceEntries.filter(function (x) { return x.lifecycle_bucket === 'DELIVERED_NOT_RECEIVED'; }).length === 0, '7 arrived alone never creates DELIVERED_NOT_RECEIVED (SC-11.4-C)');

  // 10. Raw received matches the active owner: OMIT (a confirmed receiving authority is mandatory; SC-11.4-B/SC-11.5).
  var rec = withShip('received');
  ok(entryByLineage(rec, 'shipment:') === null && hasIssue(rec, 'RECEIVING_AUTHORITY_REQUIRED'), '10 raw received → OMIT (SC-11.4-B/SC-11.5: RECEIVED_NOT_REFLECTED needs a receiving authority, never raw status)');

  // 18. Canonical B4-R3 shipment lineage shipment:<id>:<lineId> — never the old ship:<lineId> format.
  eq((entryByLineage(withShip('shipped'), 'shipment:') || {}).supply_lineage_ref, 'shipment:SH1:SL1', '18 canonical B4-R3 shipment lineage shipment:SH1:SL1 (not ship:SL1)');

  // 19. Unresolvable shipment identity → fail closed; no synthetic/unstable lineage. R7C: a shipment_line whose
  // shipment_id matches no shipment header fails closed (SHIPMENT_NOT_FOUND) — never a fabricated entry.
  var noId = withShip('shipped', { shipment_id: '' });
  ok(entryByLineage(noId, 'shipment:') === null && (hasIssue(noId, 'SHIPMENT_NOT_FOUND') || hasIssue(noId, 'ADAPT_FAILED')), '19 unresolvable shipment identity → fail closed (no synthetic lineage)');
})();

// =====================================================================================================
section('B. Count-once (canonical bridge = the production classifier for plans + shipments)');
(function () {
  // 11. Plan→shipment ownership transfer counts ONCE: a `completed` plan is omitted (OMIT_TRANSFERRED); the shipment
  //     alone counts. Total physical quantity is NOT doubled (40, not 80).
  var transfer = KMSF.projectSupplyLifecycle({
    approvedShippingPlans: [planLifeRow('shipping_plan:SP1:SPL1', 'completed', 40)],
    shipments: lifeShip([shipInput('SH1', 'shipped', 40)])
  });
  eq([transfer.ledger.totalEffectiveSupplyQty, transfer.issues.some(function (x) { return String(x.reason).indexOf('LINEAGE_TRANSFERRED_DOWNSTREAM') === 0; })], [40, true], '11 plan→shipment transfer counts ONCE (completed plan omitted; shipment 40; not 80)');

  // 12. Exact-duplicate shipment lineage counts ONCE (buildSupplyLedger dedup).
  var dup = KMSF.projectSupplyLifecycle({ shipments: lifeShip([shipInput('SHD', 'shipped', 50), shipInput('SHD', 'shipped', 50)]) });
  eq(dup.ledger.totalEffectiveSupplyQty, 50, '12 exact-duplicate shipment lineage counts ONCE (50, not 100)');

  // 13. Same lineage across incompatible buckets → SUPPLY_LINEAGE_CONFLICT → fail closed (effective 0).
  var conflict = KMSF.projectSupplyLifecycle({ approvedShippingPlans: [planLifeRow('dup:LINE', 'approved', 40), planLifeRow('dup:LINE', 'draft', 40)] });
  eq([conflict.ready, conflict.ledger.blockedCount > 0, conflict.ledger.totalEffectiveSupplyQty], [false, true, 0], '13 cross-bucket same-lineage conflict → fail closed (BLOCKED, effective 0, not double-counted)');

  // 14. Incoming already posted to Current Stock is omitted (Gate 9); counts once as CURRENT_STOCK (30, not 60).
  var posted = KMSF.projectSupplyLifecycle({
    shipments: lifeShip([shipInput('SHP', 'shipped', 30)], { postedToCurrentStockLineageKeys: ['shipment:SHP:SHP-L1'] }),
    currentStockFacts: [{ poolType: 'THREE_PL', warehouseId: 'WH1', quantity: 30, supplyLineageRef: 'stock:THREE_PL:WH1:CO1100-R' }],
    masterSku: 'CO1100-R', company: 'KM'
  });
  eq([posted.ledger.totalEffectiveSupplyQty, posted.issues.some(function (x) { return String(x.reason).indexOf('COUNT_ONCE_OWNED_ELSEWHERE') === 0; })], [30, true], '14 posted-to-current-stock incoming omitted via Gate 9; counts once as CURRENT_STOCK (30, not 60)');
})();

// =====================================================================================================
section('C. Delivery / receiving require their canonical authority (never raw shipment status)');
(function () {
  // 8. A true delivery-event authority (routeEvents `delivered`) → DELIVERED_NOT_RECEIVED.
  eq(KMSF.projectSupplyLifecycle({ routeEvents: [eventRow('rt:1', 'delivered', 100)] }).entries[0].lifecycleBucket, 'DELIVERED_NOT_RECEIVED', '8 true delivery-event authority (routeEvents delivered) → DELIVERED_NOT_RECEIVED');
  // 9. A true receiving authority (receivingFacts `confirmed`) → RECEIVED_NOT_REFLECTED.
  eq(KMSF.projectSupplyLifecycle({ receivingFacts: [recvRow('rf:1', 'confirmed', 100)] }).entries[0].lifecycleBucket, 'RECEIVED_NOT_REFLECTED', '9 true receiving authority (receivingFacts confirmed) → RECEIVED_NOT_REFLECTED');
})();

// =====================================================================================================
section('D. ETA / Required-By — late supply is ledger-VISIBLE but contributes 0 to coverage (§2F)');
(function () {
  // 15. ETA > Required-By → coverage (timelyQualifiedIncoming) = 0; the quantity is reported as late-risk (not covering).
  var lateAdapter = adaptKm({ candidate: buildKm(shipInput('SHL', 'shipped', 100, '2026-12-31')), scope: { company: 'KM', sku: 'CO1100-R', destinationWarehouseId: 'WH1' } });
  var qi = KMQI.evaluateQualifiedIncoming({ requiredByDate: '2026-09-01', kmShipmentResults: [lateAdapter] });
  eq([qi.qualifiedIncomingQuantity, qi.lateRiskQuantity], [0, 100], '15 ETA>Required-By → coverage timelyQualifiedIncoming = 0; late-risk 100 (calculateGap unchanged)');
  // 16. The same late shipment stays ledger-VISIBLE (SHIPPED_IN_TRANSIT 100) through the lifecycle bridge.
  var lateLife = KMSF.projectSupplyLifecycle({ shipments: lifeShip([shipInput('SHL', 'shipped', 100, '2026-12-31')]) });
  eq([lateLife.ledger.totalEffectiveSupplyQty, (lateLife.entries[0] || {}).lifecycleBucket], [100, 'SHIPPED_IN_TRANSIT'], '16 late incoming remains ledger-VISIBLE (SHIPPED_IN_TRANSIT 100) — visible-but-not-covering');
})();

// =====================================================================================================
section('E. External-origin quarantine — cannot become effective supply via the F1-3b connection');
(function () {
  // 17. External authority observations contribute 0 to planning (reported separately); only the KM shipment qualifies.
  var ext = { adapterType: 'EXTERNAL_INCOMING_AUTHORITY', planningEligible: false, adapterEligibleQuantity: 0, observedQuantity: 500, stateClass: 'QUARANTINED_UNLINKED', candidate: null };
  var kmR = adaptKm({ candidate: buildKm(shipInput('SHE', 'shipped', 30)), scope: { company: 'KM', sku: 'CO1100-R', destinationWarehouseId: 'WH1' } });
  var qiExt = KMQI.evaluateQualifiedIncoming({ requiredByDate: '2026-09-01', kmShipmentResults: [kmR], externalAuthorityResults: [ext] });
  eq([qiExt.qualifiedIncomingQuantity, qiExt.externalObservedQuantity], [30, 500], '17 external-origin stays quarantined: contributes 0 to planning (external 500 reported separately; only KM 30 qualifies)');
  // 17b. The production reader wires NO external-origin table, so external data has no admission path at all.
  ok(!KMPS.CANONICAL_TABLES.some(function (e) { return /external/i.test(e.sheet) || /external/i.test(e.key); }), '17b production source reads no external-origin table (external cannot enter the production supply path)');
})();

// =====================================================================================================
section('F. Single canonical authority + quantity-neutral connection');
(function () {
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-source-projection.js'), 'utf8');
  var code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  // 20. source-projection no longer OWNS a second plan/shipment status vocabulary.
  ok(!/SHIPPING_PLAN_STATUS\s*=/.test(code) && !/SHIPMENT_STATUS\s*=/.test(code) && !/LEGACY_STATUS\s*=/.test(code), '20 source-projection defines NO SHIPPING_PLAN_STATUS / SHIPMENT_STATUS / LEGACY_STATUS map (single canonical authority)');
  // 21. source-projection invokes the canonical projectSupplyLifecycle (→ evaluateQualifiedIncoming) path.
  ok(/KMSF\.projectSupplyLifecycle\(/.test(code), '21 source-projection invokes KMSF.projectSupplyLifecycle → evaluateQualifiedIncoming (Qualified Incoming is on the production supply path)');
  // 22. Quantity-neutral: the current-stock → recommendation path is unchanged (Weekly still 96).
  eq(SP.projectAndRead(weekly()).bridgeResult.lines[0].recommendedQty, 96, '22 quantity-neutral: base current-stock → recommendation unchanged (Weekly 96; full Golden verified separately)');
})();

// =====================================================================================================
if (fail === 0) console.log('\nAll F1-3 Qualified-Incoming → Supply-Ledger production connection assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
