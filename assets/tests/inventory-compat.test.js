// System Repair 1 (Round 4) — Inventory data compatibility + Weekly-Plan candidate contract.
// Deterministic Node tests of the ACTUAL shipped decision logic (assets/js/utils/inventory-compat.js)
// + source-scan wiring guards. Pure Node (no DOM / network / DB). Run: node assets/tests/inventory-compat.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
  else console.log('ok   ' + l);
}
function ids(list) { return list.map(function (w) { return w.logicalDestination ? ('LOGICAL:' + w.marketplace) : w.warehouseId; }); }
function sids(list) { return ids(list).slice().sort(); }

var mod = require(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'));
var IRCountry = mod.IRCountry, IRWarehouse = mod.IRWarehouse;

// ============================================================ UK Inventory (GB compatibility) — unchanged
console.log('\n-- UK Inventory / GB compatibility --');
eq(IRCountry.matches('GB', 'UK'), true, 'UK-1: GB matches UK scope');
eq(IRCountry.matches('US', 'UK'), false, 'UK-3: US excluded for UK');
eq(IRCountry.aliasMembers('EU'), ['EU'], 'UK-6: inventory EU scope stays exact (no expansion)');

// ============================================================ PART A — UK PHYSICAL 3rd Party breakdown
console.log('\n-- Part A: physical 3rd Party breakdown (summary == detail total) --');
// CO1100-S: physical WINIT UK = 240; virtual sitePlanningAvailable = 31 (must NOT be the card total).
var planCO1100S = { state: 'OK', sitePlanningAvailable: 31, contributions: [{ warehouseId: 'WH-WINIT-UK', warehouseName: 'WINIT UK', qty: 240 }] };
var bdA = IRWarehouse.buildPhysicalThirdPartyBreakdown(planCO1100S);
eq(bdA.total, 240, 'A-1: CO1100-S physical total = 240 (NOT 31)');
eq(bdA.rows.length === 1 && bdA.rows[0].qty, 240, 'A-1b: WINIT UK row = 240');
eq(bdA.total === 31, false, 'A-2: 31 (sitePlanningAvailable) is NOT the physical total');
eq(planCO1100S.sitePlanningAvailable, 31, 'A-3: sitePlanningAvailable preserved on plan (planning path)');
// Multi-warehouse: summary == sum of detail rows.
var planMulti = { state: 'OK', sitePlanningAvailable: 12, contributions: [{ warehouseId: 'A', warehouseName: 'A', qty: 100 }, { warehouseId: 'B', warehouseName: 'B', qty: 40 }] };
var bdM = IRWarehouse.buildPhysicalThirdPartyBreakdown(planMulti);
eq(bdM.total, 140, 'A-4: multi-warehouse total = SUM(rows) = 140');
// UK/GB same physical warehouse_id → deduped, not summed twice.
var planDup = { state: 'OK', contributions: [{ warehouseId: 'WH-WINIT-UK', warehouseName: 'WINIT UK', qty: 240 }, { warehouseId: 'WH-WINIT-UK', warehouseName: 'WINIT GB', qty: 240 }] };
eq(IRWarehouse.buildPhysicalThirdPartyBreakdown(planDup).total, 240, 'A-5: UK/GB same warehouse_id deduped (240, not 480)');
// Empty → total 0, hasRows false (caller shows No Data by state; never fallback to 31).
var bdEmpty = IRWarehouse.buildPhysicalThirdPartyBreakdown({ state: 'MISSING_SNAPSHOT', sitePlanningAvailable: 31, contributions: [] });
eq([bdEmpty.total, bdEmpty.hasRows], [0, false], 'A-6: empty breakdown → total 0, hasRows false (no fallback to 31)');
// Legal zero row stays a row.
eq(IRWarehouse.buildPhysicalThirdPartyBreakdown({ state: 'OK', contributions: [{ warehouseId: 'Z', warehouseName: 'Z', qty: 0 }] }).rows.length, 1, 'A-7: legal zero row preserved');

// ============================================================ Amazon EU Weekly Sales — unchanged (no legacy)
console.log('\n-- Amazon EU Weekly Sales (unchanged) --');
var wk = [
  { sku: 'S1', company: 'KM', country: 'IT', marketplace: 'Amazon', weekEndDate: '2026-07-05', salesUnits7d: 10 },
  { sku: 'S1', company: 'KM', country: 'DE', marketplace: 'Amazon', weekEndDate: '2026-07-05', salesUnits7d: 20 },
  { sku: 'S1', company: 'KM', country: 'ES', marketplace: 'Amazon', weekEndDate: '2026-07-05', salesUnits7d: 30 },
  { sku: 'S1', company: 'KM', country: 'FR', marketplace: 'Amazon', weekEndDate: '2026-07-05', salesUnits7d: 40 }
];
eq(IRCountry.weeklyUnits7d(wk, { sku: 'S1', company: 'KM', country: 'EU', marketplace: 'Amazon' }), 100, 'EU-1: IT+DE+ES+FR=100');
eq(IRCountry.weeklyUnits7d([{ sku: 'S1', country: 'EU', marketplace: 'Amazon', weekEndDate: 'x', salesUnits7d: 88 }], { sku: 'S1', country: 'EU', marketplace: 'Amazon' }), null, 'EU-legacy: no legacy country=EU fallback');

// ============================================================ Strict active normalization — unchanged
console.log('\n-- Strict active normalization --');
function actInc(v) {
  var w = { warehouseId: 'W', warehouseType: '3PL', company: 'KM', country: 'US', isActive: v };
  return ids(IRWarehouse.buildCandidates([w], { company: 'KM', country: 'US', marketplace: 'Amazon' }).from).indexOf('W') !== -1;
}
[true, 'true', 'TRUE', 'yes', 1, '1'].forEach(function (v) { eq(actInc(v), true, 'ACT included: ' + JSON.stringify(v)); });
[false, 'false', 0, '0', '', null, undefined, 'maybe'].forEach(function (v) { eq(actInc(v), false, 'ACT excluded: ' + JSON.stringify(v)); });

// ============================================================ PART B — Factory cross-company (Decision C)
console.log('\n-- Part B: Factory From cross-company --');
var facs = [
  { warehouseId: 'F-KM-CN', warehouseType: 'FACTORY', isFactoryWarehouse: true, company: 'KM', country: 'CN', isActive: true, warehouseName: 'KM CN Factory' },
  { warehouseId: 'F-RESUS-CN', warehouseType: 'FACTORY', isFactoryWarehouse: true, company: 'ResUS', country: 'CN', isActive: true, warehouseName: 'ResUS CN Factory' },
  { warehouseId: 'F-RESTW-TW', warehouseType: 'FACTORY', isFactoryWarehouse: true, company: 'ResTW', country: 'TW', isActive: true, warehouseName: 'ResTW TW Factory' },
  { warehouseId: 'F-KM-CN-OFF', warehouseType: 'FACTORY', isFactoryWarehouse: true, company: 'KM', country: 'CN', isActive: false, warehouseName: 'KM CN Factory inactive' }
];
var kmFac = IRWarehouse.buildCandidates(facs, { company: 'KM', country: 'US', marketplace: 'Amazon' });
eq(sids(kmFac.from), ['F-KM-CN', 'F-RESTW-TW', 'F-RESUS-CN'].sort(), 'FAC-1: KM scope From includes KM+ResUS+ResTW active factories (cross-company)');
eq(kmFac.from.filter(function (w) { return w.warehouseId === 'F-KM-CN-OFF'; }).length, 0, 'FAC-2: inactive factory excluded');
eq(ids(kmFac.to).filter(function (x) { return x.indexOf('F-') === 0; }).length, 0, 'FAC-3: no factory in To');
var shopFac = IRWarehouse.buildCandidates(facs, { company: 'ResUS', country: 'US', marketplace: 'Shopify' });
eq(sids(shopFac.from), ['F-KM-CN', 'F-RESTW-TW', 'F-RESUS-CN'].sort(), 'FAC-4: non-Amazon scope From same active factory pool (marketplace-agnostic)');

// ============================================================ PART B — Amazon single logical destination (Decision B)
console.log('\n-- Part B: Amazon logical destination --');
var whB = [
  { warehouseId: 'WH-KM-US-3PL', warehouseType: '3PL', company: 'KM', country: 'US', isActive: true, warehouseName: 'KM US 3PL' },
  { warehouseId: 'WH-KM-US-FBA-LBA4', warehouseType: 'FBA', company: 'KM', country: 'US', marketplace: 'Amazon', isActive: true, warehouseName: 'Amazon FBA LBA4' },
  { warehouseId: 'WH-KM-US-FBA-ONT8', warehouseType: 'FBA', company: 'KM', country: 'US', marketplace: 'Amazon', isActive: true, warehouseName: 'Amazon FBA ONT8' },
  { warehouseId: 'F-KM-CN', warehouseType: 'FACTORY', isFactoryWarehouse: true, company: 'KM', country: 'CN', isActive: true, warehouseName: 'KM CN Factory' }
];
var amzB = IRWarehouse.buildCandidates(whB, { company: 'KM', country: 'US', marketplace: 'Amazon' });
var logicals = amzB.to.filter(function (w) { return w.logicalDestination; });
eq(logicals.length, 1, 'AMZ-1: exactly ONE Amazon logical destination');
eq([logicals[0].warehouseId, logicals[0].marketplace, logicals[0].token], [null, 'Amazon', 'MARKETPLACE_DESTINATION:Amazon:US'], 'AMZ-2: logical dest has null warehouse_id + token');
eq(amzB.to.filter(function (w) { return !w.logicalDestination && w.warehouseType === 'FBA'; }).length, 0, 'AMZ-3: NO individual FBA warehouse rows in Weekly-Plan To');
eq(amzB.to.filter(function (w) { return w.warehouseId === 'WH-KM-US-3PL'; }).length, 1, 'AMZ-4: eligible real 3PL preserved in To');
var nonAmzB = IRWarehouse.buildCandidates(whB, { company: 'KM', country: 'US', marketplace: 'Shopify' });
eq(nonAmzB.to.filter(function (w) { return w.logicalDestination; }).length, 0, 'AMZ-5: non-Amazon has NO logical destination');
eq(sids(nonAmzB.to), ['WH-KM-US-3PL'], 'AMZ-6: non-Amazon To = eligible 3PL only');
// resolveDestinationPayload serialization
eq(IRWarehouse.resolveDestinationPayload('MARKETPLACE_DESTINATION:Amazon:US', { country: 'US' }), { marketplace: 'Amazon', country: 'US', selected_destination_warehouse_id: null }, 'AMZ-7: logical token → marketplace=Amazon + null warehouse_id');
eq(IRWarehouse.resolveDestinationPayload('WH-KM-US-3PL', {}), { selected_destination_warehouse_id: 'WH-KM-US-3PL' }, 'AMZ-8: real id → selected_destination_warehouse_id');

// ============================================================ PART B — EU warehouse compatibility (Decision D)
console.log('\n-- Part B: EU warehouse compatibility --');
eq(IRWarehouse.warehouseCountryMembers('EU').sort(), ['DE', 'ES', 'EU', 'FR', 'IT'], 'EUW-map: EU → EU/DE/ES/IT/FR');
eq(IRWarehouse.warehouseCountryMembers('DE'), ['DE'], 'EUW-map2: DE → DE only');
eq(IRWarehouse.warehouseCountryMembers('UK').sort(), ['GB', 'UK'], 'EUW-map3: UK → UK/GB');
var euWh = [
  { warehouseId: 'W-EU', warehouseType: '3PL', company: 'KM', country: 'EU', isActive: true, warehouseName: 'EU 3PL' },
  { warehouseId: 'W-DE', warehouseType: '3PL', company: 'KM', country: 'DE', isActive: true, warehouseName: 'DE 3PL' },
  { warehouseId: 'W-ES', warehouseType: '3PL', company: 'KM', country: 'ES', isActive: true, warehouseName: 'ES 3PL' },
  { warehouseId: 'W-IT', warehouseType: '3PL', company: 'KM', country: 'IT', isActive: true, warehouseName: 'IT 3PL' },
  { warehouseId: 'W-FR', warehouseType: '3PL', company: 'KM', country: 'FR', isActive: true, warehouseName: 'FR 3PL' },
  { warehouseId: 'W-UK', warehouseType: '3PL', company: 'KM', country: 'GB', isActive: true, warehouseName: 'UK 3PL' }
];
var euAgg = IRWarehouse.buildCandidates(euWh, { company: 'KM', country: 'EU', marketplace: 'Amazon' });
eq(euAgg.to.filter(function (w) { return !w.logicalDestination; }).map(function (w) { return w.warehouseId; }).sort(), ['W-DE', 'W-ES', 'W-EU', 'W-FR', 'W-IT'], 'EUW-1: Amazon EU To 3PL = EU/DE/ES/IT/FR (UK excluded)');
var deCtx = IRWarehouse.buildCandidates(euWh, { company: 'KM', country: 'DE', marketplace: 'Amazon' });
eq(deCtx.to.filter(function (w) { return !w.logicalDestination; }).map(function (w) { return w.warehouseId; }), ['W-DE'], 'EUW-2: DE context = DE only (no cross-country mixing)');
var frCtx = IRWarehouse.buildCandidates(euWh, { company: 'KM', country: 'FR', marketplace: 'Amazon' });
eq(frCtx.to.filter(function (w) { return !w.logicalDestination; }).map(function (w) { return w.warehouseId; }), ['W-FR'], 'EUW-3: FR context = FR only');

// company isolation still enforced for 3PL
var iso = IRWarehouse.buildCandidates([{ warehouseId: 'X', warehouseType: '3PL', company: 'ResUS', country: 'US', isActive: true }], { company: 'KM', country: 'US', marketplace: 'Amazon' });
eq(iso.to.filter(function (w) { return !w.logicalDestination; }).length, 0, 'ISO: other-company 3PL excluded');

// ============================================================ Wiring guards
console.log('\n-- wiring guards --');
var js = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'inventory-replenishment.js'), 'utf8');
eq(/buildPhysicalThirdPartyBreakdown\(/.test(js), true, 'wire: UK summary+detail use buildPhysicalThirdPartyBreakdown');
eq(/sitePlanningAvailable\)\.toLocaleString\(\)/.test(js), false, 'wire: summary no longer displays sitePlanningAvailable');
eq(/window\.IRWarehouse\.buildCandidates\(/.test(js), true, 'wire: candidate builder delegates to IRWarehouse.buildCandidates');
eq(/resolveDestinationPayload\(/.test(js), true, 'wire: save path serializes destination via resolveDestinationPayload');
eq(/data-wh-type="MARKETPLACE_DESTINATION"/.test(js), true, 'wire: To renders Amazon logical destination option');
var compat = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'inventory-compat.js'), 'utf8');
eq(/SALES_AGG_LEGACY/.test(compat), false, 'wire: no legacy EU sales fallback');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
