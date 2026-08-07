// Kitchen Mama Operation System — Warehouse Qualified Incoming ETA Lineage Preservation (F1-4B-FM3c-1b).
// Run: node assets/tests/warehouse-incoming-eta-preservation-f1-4b-fm3c1b.test.js
// -----------------------------------------------------------------------------
// ADDITIVE fact preservation only. Resolves the FM3c-1 WAREHOUSE bounded HALT (Outcome B): the ALREADY-KNOWN
// canonical shipment ETA (c.eta — the same value KMQI's ETA gate consumed) is now preserved through the frozen
// supply-fact pipeline (KMSF lifecycle entry → source-projection supplyRow → production supplySourceEntries) and
// a warehouse Qualified Incoming EVENT owner is surfaced from the SAME SHIPPED_IN_TRANSIT rows the handler
// already aggregates (recoWsSupplyBySku_: qualifiedIncomingQty = Σ SHIPPED_IN_TRANSIT). Events are EVIDENCE over
// existing supply, NOT additional supply. No qualification / allocation / quantity / destination / formula change,
// no monthly-projection wiring, no handler/UI. Missing ETA is never fabricated. Clockless, non-mutating, JSON-safe.

'use strict';
var path = require('path');
var fs = require('fs');
var SF = require('../js/core/supply-planning-source-facts.js');
var SP = require('../js/core/supply-planning-source-projection.js');
var PS = require('../js/core/supply-planning-production-source.js');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fixtures ---------------------------------------------------------------
var SCOPE = { company: 'KM', sku: 'CO1100-R', destinationWarehouseId: 'WH-3PL', country: 'US', marketplace: 'AMAZON_US' };
function shipInput(id, status, qty, eta, wh) {
  return { shipment: { shipmentId: id, company: 'KM', country: 'US', marketplace: 'AMAZON_US', eta: eta, status: status, destinationWarehouseId: wh || 'WH-3PL' },
           line: { shipmentLineId: id + '-L1', sku: 'CO1100-R', shipmentQty: qty } };
}
function lifecycle(inputs, requiredBy) {
  return SF.projectSupplyLifecycle({ shipments: { shipmentInputs: inputs, scope: SCOPE, requiredByDate: requiredBy || '2026-12-01' } });
}
function shipRow(id, status, qty, eta, wh) {
  return { sku: 'CO1100-R', company: 'KM', shipment_qty: qty, destination_warehouse_id: wh || 'WH-3PL',
           shipment_id: id, shipment_line_id: id + '-L1', eta: eta, status: status, source_data_as_of: '2026-08-01' };
}
function weekly(ships, over) {
  var base = {
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40',
    businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' },
    forecastMonth: 'sep', requiredByDate: '2026-12-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-3PL', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true },
                   { warehouse_id: 'WH-3PL-B', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true }],
      marketplaces: [{ marketplace: 'AMAZON_US', allocation_priority: 1 }],
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', sep: 100 }],
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', site_sku: 'ST-1', wh_available_stock: 100, snapshot_date: '2026-08-01' }],
      shipments: ships
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
  if (over) for (var k in over) base[k] = over[k];
  return base;
}
function shipEntryOf(p) { var r = p.supplySourceEntries.filter(function (x) { return x.supply_lineage_ref.indexOf('shipment:') === 0; }); return r; }
function aggQI(p) { var t = 0; p.supplySourceEntries.forEach(function (x) { if (x.lifecycle_bucket === 'SHIPPED_IN_TRANSIT') t += x.quantity; }); return t; }
function aggCS(p) { var t = 0; p.supplySourceEntries.forEach(function (x) { if (x.lifecycle_bucket === 'CURRENT_STOCK') t += x.quantity; }); return t; }
function sumEv(p) { var t = 0; p.warehouseQualifiedEvents.forEach(function (e) { t += e.eligibleQty; }); return t; }

// =============================================================================
section('A. KMSF lifecycle entry additively preserves the canonical shipment ETA (granularity-loss point resolved)');
var r1 = lifecycle([shipInput('SH1', 'shipped', 30, '2026-09-15')]);
var e1 = r1.entries[0];
ok(e1 && e1.lifecycleBucket === 'SHIPPED_IN_TRANSIT', 'A0 shipped shipment → SHIPPED_IN_TRANSIT entry');
ok(e1.eta === '2026-09-15', 'A1 KMSF entry now carries the canonical ETA (2026-09-15)');
ok(e1.supplyLineageRef === 'shipment:SH1:SH1-L1' && e1.warehouseId === 'WH-3PL' && e1.quantity === 30 && e1.poolType === 'THREE_PL',
   'A2 identity / warehouse / qty / poolType UNCHANGED (fact preservation only)');
ok(r1.entries.filter(function (e) { return e.lifecycleBucket === 'SHIPPED_IN_TRANSIT'; }).length === 1, 'A3 entry count unchanged (exactly one in-transit entry)');

section('B. source-projection supplyRow carries the preserved ETA (semantics otherwise unchanged)');
var p = SP.projectRecommendationProductionSources(weekly([shipRow('SH1', 'shipped', 30, '2026-09-15')]));
var srow = shipEntryOf(p)[0];
ok(srow && srow.eta === '2026-09-15', 'B1 supplyRow carries ETA 2026-09-15');
ok(srow.lifecycle_bucket === 'SHIPPED_IN_TRANSIT' && srow.quantity === 30 && srow.warehouse_id === 'WH-3PL' && srow.pool_type === 'THREE_PL',
   'B2 supplyRow bucket / qty / warehouse / poolType unchanged');
ok(srow.supply_lineage_ref === 'shipment:SH1:SH1-L1', 'B3 supply_lineage_ref (incoming identity) unchanged');

section('C. production-source read-only result surfaces warehouseQualifiedEvents + ETA-bearing supplySourceEntries');
var reqPS = weekly([shipRow('SH1', 'shipped', 30, '2026-09-15')]);
var snaps = reqPS.sourceSnapshots; delete reqPS.sourceSnapshots; reqPS.preReadSnapshots = snaps;
var psRes = PS.buildProductionRecommendationSource({}, reqPS);
ok(Array.isArray(psRes.warehouseQualifiedEvents) && psRes.warehouseQualifiedEvents.length === 1 && psRes.warehouseQualifiedEvents[0].eta === '2026-09-15',
   'C1 production read-only result surfaces warehouseQualifiedEvents with ETA (FM3c-2 ready)');
ok(psRes.supplySourceEntries.filter(function (x) { return x.supply_lineage_ref === 'shipment:SH1:SH1-L1'; })[0].eta === '2026-09-15',
   'C2 production supplySourceEntries carry the preserved ETA (no strip on the FM3c-2 path)');

section('D. ETA authority = the shipment ETA — never a derived date (required-by / source-as-of)');
var pd = SP.projectRecommendationProductionSources(weekly([shipRow('SH1', 'shipped', 30, '2026-09-15')], { requiredByDate: '2026-11-11', sourceDataAsOf: '2026-01-01' }));
var evd = pd.warehouseQualifiedEvents[0];
ok(evd.eta === '2026-09-15' && evd.eta !== '2026-11-11' && evd.eta !== '2026-01-01', 'D ETA is the shipment ETA, never required-by / source-as-of / any derived date');

section('N–S. warehouse qualifiedEvents owner — surfaced from existing facts, exact contract');
ok(Array.isArray(p.warehouseQualifiedEvents) && p.warehouseQualifiedEvents.length === 1, 'N warehouseQualifiedEvents exists (1 event)');
var ev = p.warehouseQualifiedEvents[0];
ok(ev.incomingId === 'shipment:SH1:SH1-L1', 'O incomingId = canonical count-once lineage (supply_lineage_ref)');
ok(ev.eta === '2026-09-15', 'P ETA = canonical source ETA');
ok(ev.eligibleQty === 30, 'Q eligibleQty = existing SHIPPED_IN_TRANSIT quantity (already counted)');
ok(ev.warehouseId === 'WH-3PL', 'R warehouse identity preserved on the event');
ok(ev.sourceType === 'KM' && ev.state === 'QUALIFIED', 'S sourceType + state preserved');
ok(Object.keys(ev).sort().join(',') === 'eligibleQty,eta,incomingId,sourceType,state,warehouseId', 'S2 event contract = {incomingId, eta, eligibleQty, warehouseId, sourceType, state}');

section('T–K. conservation — events are EVIDENCE over existing supply, not additional supply');
ok(aggQI(p) === sumEv(p) && aggQI(p) === 30, 'T Σ event eligibleQty == Σ SHIPPED_IN_TRANSIT aggregate (== 30) — no double count');
ok(aggCS(p) === 100, 'K CURRENT_STOCK aggregate unchanged (100)');
ok(p.warehouseQualifiedEvents.every(function (e) { return e.incomingId.indexOf('stock:') !== 0; }), 'K2 CURRENT_STOCK rows never surfaced as qualified incoming events');

section('U–V. no duplicate events + permutation invariance (deterministic sort)');
var pm = SP.projectRecommendationProductionSources(weekly([shipRow('SH1', 'shipped', 30, '2026-09-15', 'WH-3PL'), shipRow('SH2', 'shipped', 20, '2026-09-20', 'WH-3PL-B')]));
var seenKey = {}; var noDup = pm.warehouseQualifiedEvents.every(function (e) { var k = e.warehouseId + '|' + e.incomingId; if (seenKey[k]) return false; seenKey[k] = 1; return true; });
ok(noDup && pm.warehouseQualifiedEvents.length === 2, 'U each lineage×warehouse appears once (2 distinct events)');
var pm2 = SP.projectRecommendationProductionSources(weekly([shipRow('SH2', 'shipped', 20, '2026-09-20', 'WH-3PL-B'), shipRow('SH1', 'shipped', 30, '2026-09-15', 'WH-3PL')]));
ok(JSON.stringify(pm.warehouseQualifiedEvents) === JSON.stringify(pm2.warehouseQualifiedEvents), 'V reorder input → identical events (permutation invariant)');

section('W–Z. multi-warehouse isolation + split conservation');
var evA = pm.warehouseQualifiedEvents.filter(function (e) { return e.warehouseId === 'WH-3PL'; });
var evB = pm.warehouseQualifiedEvents.filter(function (e) { return e.warehouseId === 'WH-3PL-B'; });
ok(evA.length === 1 && evA[0].incomingId === 'shipment:SH1:SH1-L1' && evA[0].eligibleQty === 30 && evA[0].eta === '2026-09-15', 'W WH-3PL event isolated (SH1 / 30 / 2026-09-15)');
ok(evB.length === 1 && evB[0].incomingId === 'shipment:SH2:SH2-L1' && evB[0].eligibleQty === 20 && evB[0].eta === '2026-09-20', 'X WH-3PL-B event isolated (SH2 / 20 / 2026-09-20)');
ok(evA[0].eligibleQty !== evB[0].eligibleQty && evA[0].eta !== evB[0].eta && evA[0].incomingId !== evB[0].incomingId, 'Y no cross-warehouse leak of ETA/qty/identity');
ok(sumEv(pm) === 50 && aggQI(pm) === 50, 'Z split total conserved (30 + 20 = 50 == Σ SHIPPED_IN_TRANSIT)');

section('AB. missing ETA — never fabricated; row still counted in the aggregate, but not a dated event');
var pne = SP.projectRecommendationProductionSources(weekly([shipRow('SH9', 'shipped', 15, '')]));
var sne = pne.supplySourceEntries.filter(function (x) { return x.supply_lineage_ref === 'shipment:SH9:SH9-L1'; })[0];
ok(sne && sne.eta === null && sne.lifecycle_bucket === 'SHIPPED_IN_TRANSIT' && sne.quantity === 15, 'AB missing-ETA in-transit row: eta null, still SHIPPED_IN_TRANSIT with qty 15');
ok(pne.warehouseQualifiedEvents.length === 0, 'AB2 missing-ETA row NOT a dated qualified event (no fabricated date)');
ok(aggQI(pne) === 15, 'AB3 aggregate still counts the missing-ETA in-transit row (evidence ≠ supply)');

section('AC. late incoming — bucket + aggregate unchanged; preserved ETA equals source ETA');
var pl = SP.projectRecommendationProductionSources(weekly([shipRow('SH1', 'shipped', 30, '2026-09-15')], { requiredByDate: '2026-09-01' }));
var srowL = shipEntryOf(pl)[0];
ok(srowL && srowL.lifecycle_bucket === 'SHIPPED_IN_TRANSIT' && srowL.eta === '2026-09-15', 'AC late incoming (eta > required-by): bucket unchanged, ETA = source ETA');
ok(aggQI(pl) === 30, 'AC2 late-incoming aggregate unchanged (30)');

section('AD. external/CURRENT_STOCK never surfaced as usable warehouse events');
ok(p.warehouseQualifiedEvents.every(function (e) { return e.sourceType === 'KM'; }), 'AD only KM-source in-transit events (external/quarantine never a usable warehouse event)');
ok(p.supplySourceEntries.filter(function (x) { return x.lifecycle_bucket === 'CURRENT_STOCK'; }).length > 0, 'AD2 CURRENT_STOCK rows exist but are excluded from qualifiedEvents');

section('AE. valid explicit zero quantity — row valid, ETA preserved');
var pz = SP.projectRecommendationProductionSources(weekly([shipRow('SH0', 'shipped', 0, '2026-09-15')]));
var srowZ = pz.supplySourceEntries.filter(function (x) { return x.supply_lineage_ref === 'shipment:SH0:SH0-L1'; })[0];
ok(srowZ && srowZ.quantity === 0 && srowZ.eta === '2026-09-15', 'AE explicit 0-qty in-transit row valid, ETA preserved');

section('L. no shipments → no fabricated events; additive owner does not disturb current stock');
var pNoShip = SP.projectRecommendationProductionSources(weekly([]));
ok(pNoShip.warehouseQualifiedEvents.length === 0, 'L no shipments → warehouseQualifiedEvents empty (not fabricated)');
ok(aggCS(pNoShip) === 100, 'L2 current-stock aggregate unaffected by the additive event owner (100)');

section('AF–AH. clockless / non-mutating / JSON-safe');
var srcProj = read('js/core/supply-planning-source-projection.js').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
var srcFacts = read('js/core/supply-planning-source-facts.js').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(srcProj), 'AF1 source-projection stays clockless / RNG-free');
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(srcFacts), 'AF2 source-facts stays clockless / RNG-free');
var input = weekly([shipRow('SH1', 'shipped', 30, '2026-09-15')]);
var snap = JSON.stringify(input);
SP.projectRecommendationProductionSources(input);
ok(JSON.stringify(input) === snap, 'AG input object not mutated');
ok(JSON.stringify(p.warehouseQualifiedEvents).indexOf('2026-09-15') >= 0, 'AH events are JSON-safe');

console.log('\n----------------------------------------');
console.log('WAREHOUSE INCOMING ETA PRESERVATION (F1-4B-FM3c-1b): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
