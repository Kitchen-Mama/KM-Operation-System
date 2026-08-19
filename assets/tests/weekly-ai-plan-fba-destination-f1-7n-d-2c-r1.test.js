// Kitchen Mama Operation System — F1-7N-D-2c Weekly AI Plan FBA / platform_fulfilled logical destination.
// Run: node assets/tests/weekly-ai-plan-fba-destination-f1-7n-d-2c-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Closes WEEKLY_AI_PLAN_FBA_DESTINATION_UNRESOLVED by REUSING the frozen canonical logical destination authority
// (marketplaces.marketplace_id via KMDR; decisions D-F1-4B-FM5-R2b · D-F1-4B-E0R-1) instead of inventing a fake Amazon
// warehouse. The bounded repair is the PURE resolver KMWHA.resolveWorkspaceLineDestination + its use by the .gs harvest.
// This suite proves, all in Node:
//   • self_fulfilled/3PL destination UNCHANGED (destinationRef === warehouse_id)
//   • FBA/platform_fulfilled receives a STABLE canonical allocation destination = marketplace_id (LOGICAL node)
//   • the FBA destination is NEVER classified as a physical warehouse (and never as a CN/TW factory)
//   • Amazon + another marketplace still share the overseas pool ONCE (count-once); repeated run does NOT re-offer
//   • demandKey stays deterministic = sku|destination|windowCode; no duplicate destination/window demand
//   • persists ONLY shipping_allocation_drafts / _lines — no Request Order / PO / shipping_plan / shipment / reservation
//   • K3 identity unchanged (planning_cycle+company+country+marketplace+source_page; destination is NOT in K3)
// The Allocation Destination (marketplace_id) is deliberately NOT the final Amazon FC / carrier / appointment — those
// stay downstream Weekly-Shipping-Plan / Shipment authority (unchanged here).

var KMWHA = require('../js/core/supply-planning-weekly-harvest-adapter.js');
var KMWIA = require('../js/core/supply-planning-weekly-input-assembler.js');
var KMWRB = require('../js/core/supply-planning-weekly-recommendation-batch.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
var CFG = { CN_YOUXIN: CN, TW_SHENGYI: TW };
var WH = {
  'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_type: 'FACTORY', country: 'CN', is_factory_warehouse: true, is_active: true },
  'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', country: 'TW', is_factory_warehouse: true, is_active: true }
};
var MKT_A = 'MKT-KM-US-AMAZON-A', MKT_B = 'MKT-KM-US-AMAZON-B', WH3PL = 'WH-KM-US-3PL-X';

// =================================================================================================================
section('A resolveWorkspaceLineDestination — WAREHOUSE (self_fulfilled/3PL) UNCHANGED = warehouse_id');
var wLine = { destinationType: 'WAREHOUSE', warehouseId: WH3PL, destinationRefId: WH3PL, marketplaceId: null };
eq(KMWHA.resolveWorkspaceLineDestination(wLine), { destinationRef: WH3PL, destinationType: 'WAREHOUSE', isPhysicalWarehouse: true }, 'A WAREHOUSE line → warehouse_id, physical');

section('B resolveWorkspaceLineDestination — MARKETPLACE (FBA) = marketplace_id LOGICAL node (NOT physical)');
var mLine = { destinationType: 'MARKETPLACE', warehouseId: null, destinationRefId: MKT_A, marketplaceId: MKT_A };
eq(KMWHA.resolveWorkspaceLineDestination(mLine), { destinationRef: MKT_A, destinationType: 'MARKETPLACE', isPhysicalWarehouse: false }, 'B MARKETPLACE line → marketplace_id, NOT physical warehouse');
ok(KMWHA.resolveWorkspaceLineDestination(mLine).isPhysicalWarehouse === false, 'B FBA destination is NEVER classified as a physical warehouse');

section('C legacy/absent destinationType — bare warehouseId ⇒ WAREHOUSE; bare marketplace ref ⇒ MARKETPLACE');
eq(KMWHA.resolveWorkspaceLineDestination({ warehouseId: 'WH-Y' }), { destinationRef: 'WH-Y', destinationType: 'WAREHOUSE', isPhysicalWarehouse: true }, 'C bare warehouseId ⇒ WAREHOUSE');
eq(KMWHA.resolveWorkspaceLineDestination({ marketplaceId: MKT_B }), { destinationRef: MKT_B, destinationType: 'MARKETPLACE', isPhysicalWarehouse: false }, 'C bare marketplaceId ⇒ MARKETPLACE');
eq(KMWHA.resolveWorkspaceLineDestination({ destinationType: 'MARKETPLACE', destinationRefId: MKT_B, marketplaceId: null }), { destinationRef: MKT_B, destinationType: 'MARKETPLACE', isPhysicalWarehouse: false }, 'C MARKETPLACE via destinationRefId only');

section('D fail-closed — no resolved canonical destination → destinationRef "" (line skipped, never guessed)');
eq(KMWHA.resolveWorkspaceLineDestination({ destinationType: null, warehouseId: null, marketplaceId: null, destinationRefId: null }), { destinationRef: '', destinationType: '', isPhysicalWarehouse: false }, 'D unresolved destination → empty ref');
eq(KMWHA.resolveWorkspaceLineDestination(null), { destinationRef: '', destinationType: '', isPhysicalWarehouse: false }, 'D null line → empty ref (no throw)');

section('E a marketplace_id destination is NEVER matched as a CN/TW factory identity (exact-id only)');
ok(KMWIA.resolveWeeklyFactoryIdentity(MKT_A, CFG) === 'UNKNOWN', 'E marketplace_id ≠ CN_YOUXIN/TW_SHENGYI factory');
ok(KMWIA.resolveWeeklyFactoryIdentity(WH3PL, CFG) === 'UNKNOWN', 'E 3PL warehouse_id ≠ factory');
ok(KMWIA.resolveWeeklyFactoryIdentity(CN, CFG) === 'CN_YOUXIN', 'E control: exact CN id resolves');

section('F demandKey deterministic = sku|destination|windowCode for BOTH a warehouse and a marketplace destination');
eq(KMWIA.weeklyDemandKey('SKU1', WH3PL, 'D18'), 'SKU1|' + WH3PL + '|D18', 'F warehouse demandKey');
eq(KMWIA.weeklyDemandKey('SKU1', MKT_A, 'D18'), 'SKU1|' + MKT_A + '|D18', 'F marketplace (FBA) demandKey — marketplace_id is a stable key');

// =================================================================================================================
// End-to-end mixed universe: two Amazon (platform_fulfilled → marketplace_id) + one self_fulfilled (warehouse_id).
function rf(ref, mkt, dest) { return { demandRef: ref, demandKey: ref, marketplace: mkt, destinationWarehouseId: dest, fulfillmentModel: (mkt === 'wh_3pl' ? 'self_fulfilled' : 'platform_fulfilled'), dailyDemand: 0, allocationPriority: 5, demandWeight: (mkt === 'amz_a' ? 0.5 : mkt === 'amz_b' ? 0.3 : 0.2), eligiblePoolTypes: ['THREE_PL'] }; }
function pf(ref, siteSku) { return { demandRef: ref, sku: 'SKU1', masterSku: 'SKU1', siteSku: siteSku, unitsPerCarton: 1, windowCode: 'RECO-2026-08' }; }
var REF_A = 'KM|US|amz_a|SKU1|' + MKT_A, REF_B = 'KM|US|amz_b|SKU1|' + MKT_B, REF_W = 'KM|US|wh_3pl|SKU1|' + WH3PL;
function harvest() {
  return {
    planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', source_page: 'inventory_replenishment' },
    mode: 'SCHEDULED_REFRESH', sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH,
    kmaf: {
      ready: true, issues: [],
      receiverFacts: [rf(REF_A, 'amz_a', MKT_A), rf(REF_B, 'amz_b', MKT_B), rf(REF_W, 'wh_3pl', WH3PL)],
      planningFacts: [pf(REF_A, 'SA'), pf(REF_B, 'SB'), pf(REF_W, 'SW')]
    },
    horizonsByDemandRef: {
      'KM|US|amz_a|SKU1|MKT-KM-US-AMAZON-A': { cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01' } },
      'KM|US|amz_b|SKU1|MKT-KM-US-AMAZON-B': { cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01' } },
      'KM|US|wh_3pl|SKU1|WH-KM-US-3PL-X': { cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01' } }
    },
    poolsBySku: { SKU1: { overseasSupplyPools: [{ poolKey: 'OV', poolType: 'THREE_PL', warehouseId: 'W-OV', effectiveSupplyQty: 60 }], factoryPools: [] } }
  };
}

section('G harvest→request — FBA lanes carry marketplace_id; 3PL lane carries warehouse_id (destinations distinct)');
var H = KMWHA.mapWeeklyHarvestToBatchRequest(harvest());
ok(H.ready === true, 'G harvest ready');
var lanes = H.request.skus[0].lanes;
eq(lanes.length, 3, 'G three lanes (2 FBA + 1 self_fulfilled)');
var laneA = lanes.filter(function (l) { return l.marketplace === 'amz_a'; })[0];
var laneW = lanes.filter(function (l) { return l.marketplace === 'wh_3pl'; })[0];
eq(laneA.destinationWarehouseId, MKT_A, 'G FBA lane destination = marketplace_id (stable canonical allocation destination)');
eq(laneW.destinationWarehouseId, WH3PL, 'G self_fulfilled lane destination = warehouse_id (UNCHANGED)');

section('H KMWIA — FBA marketplace_id destination produces a canonical demandKey + no duplicate destination/window');
var asm = KMWIA.assembleWeeklySourceAllocationInput({
  planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US' }, masterSku: 'SKU1',
  factoryIdentityConfig: CFG, warehousesById: WH, overseasSupplyPools: [{ poolKey: 'OV', poolType: 'THREE_PL', warehouseId: 'W-OV', effectiveSupplyQty: 60 }], factoryPools: [], lanes: lanes
});
ok(asm.ready === true, 'H assembler ready (marketplace_id destination accepted — no MISSING_DESTINATION_WAREHOUSE)');
var keys = asm.builderInput.weeklyPlanningFacts.map(function (f) { return f.demandKey; }).sort();
eq(keys, ['SKU1|' + MKT_A + '|D18', 'SKU1|' + MKT_B + '|D18', 'SKU1|' + WH3PL + '|D18'], 'H one canonical demandKey per (sku,destination,window) — FBA keyed by marketplace_id');
var uniq = {}; var dup = false; keys.forEach(function (k) { if (uniq[k]) dup = true; uniq[k] = 1; });
ok(!dup, 'H no duplicate destination/window demand');
ok(asm.issues.filter(function (i) { return i.reason === 'MISSING_DESTINATION_WAREHOUSE'; }).length === 0, 'H FBA lane NOT rejected as missing-destination');

section('I batch — Amazon + another marketplace share the overseas pool ONCE (count-once); per-marketplace K3');
var caps = { plans: [] };
var deps = { loadActiveContext: function () { return { status: 'CREATE' }; }, loadPriorSnapshot: function () { return null; }, lockedApply: function (p) { caps.plans.push(p); return { status: 'COMPLETED' }; } };
var B1 = KMWRB.generateWeeklyShippingRecommendationBatch(H.request, deps);
eq(B1.status, 'COMPLETED', 'I batch COMPLETED');
eq(B1.marketplaceCount, 3, 'I three per-marketplace K3 drafts (amz_a, amz_b, wh_3pl)');
eq(B1.recommendedQtyTotal, 60, 'I shared overseas pool 60 rationed ONCE across all sites (0.5/0.3/0.2 → 30/18/12)');
ok(caps.plans.length === 3, 'I three persistence plans (one per marketplace)');

section('J repeated invocation does NOT re-offer supply (stateless compute rations once per run)');
var caps2 = { plans: [] };
var deps2 = { loadActiveContext: function () { return { status: 'CREATE' }; }, loadPriorSnapshot: function () { return null; }, lockedApply: function (p) { caps2.plans.push(p); return { status: 'COMPLETED' }; } };
var B2 = KMWRB.generateWeeklyShippingRecommendationBatch(harvest().kmaf ? KMWHA.mapWeeklyHarvestToBatchRequest(harvest()).request : null, deps2);
eq(B2.recommendedQtyTotal, 60, 'J second run still totals 60 (pool NOT re-offered / not accumulated)');
eq(JSON.stringify(B1.marketplaceResults.map(function (r) { return r.marketplace; }).sort()), JSON.stringify(B2.marketplaceResults.map(function (r) { return r.marketplace; }).sort()), 'J identical marketplace set across runs');

section('K K3 identity unchanged (marketplace axis; NO destination in K3) + writes ONLY shipping_allocation drafts');
caps.plans.forEach(function (p, i) {
  eq(p.sourceTables, { header: 'shipping_allocation_drafts', lines: 'shipping_allocation_draft_lines' }, 'K plan[' + i + '] targets ONLY the shipping_allocation draft tables');
  var ak = String(p.activeKey || '');
  ok(ak.indexOf('WEEKLY_SHIPPING::RECO-2026-08::company=KM|country=US|marketplace=') === 0 && ak.indexOf('|source_page=inventory_replenishment') !== -1, 'K plan[' + i + '] K3 activeKey = planning_cycle+company+country+marketplace+source_page');
  ok(ak.indexOf('destination') === -1, 'K plan[' + i + '] K3 carries NO destination axis');
});
// The LOGICAL FBA destination (marketplace_id) is an allocation-internal identity ONLY — it must NEVER be persisted as
// a physical destination/warehouse value (no fabricated Amazon warehouse reaches the draft).
var planJson = JSON.stringify(caps.plans);
ok(planJson.indexOf(MKT_A) === -1 && planJson.indexOf(MKT_B) === -1, 'K marketplace_id destination is NOT persisted into any draft column (never a physical warehouse)');
['purchase_order', 'request_order', 'shipping_plans', 'shipment_lines', 'shipments', 'reservation', 'inventory_ledger'].forEach(function (tok) {
  ok(planJson.indexOf(tok) === -1, 'K persistence writes NO ' + tok + ' (weekly draft only; no PO/shipment/reservation/inventory mutation)');
});

section('L determinism — identical harvest → identical request');
eq(KMWHA.mapWeeklyHarvestToBatchRequest(harvest()), KMWHA.mapWeeklyHarvestToBatchRequest(harvest()), 'L deterministic request');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN FBA DESTINATION (F1-7N-D-2c): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
