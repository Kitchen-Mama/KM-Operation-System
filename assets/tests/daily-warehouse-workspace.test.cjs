'use strict';
const fs = require('node:fs'), assert = require('node:assert/strict');
const read = file => fs.readFileSync('assets/specs/active/apps-script/' + file, 'utf8');
const H = new Function(read('90_generated_supply_planning_bundle.gs') + '\n' + read('42_api_v1_recommendation_workspace.gs') +
  '\n' + read('43_api_v1_gap_materialization.gs') +
  '\nreturn { handle: handleRecommendationWorkspaceGet_, mapper: gapInvMapFromLines_, slice: gapProcessScopeSlice_, headers: INV_GAP_HEADERS_ };')();
let checks = 0, writes = 0;
function eq(a, b) { assert.deepEqual(a, b); checks++; }
function table(rows, headers) { headers = headers || [...new Set(rows.flatMap(Object.keys))]; return { headers, rows: rows.map(r => headers.map(k => r[k] == null ? '' : r[k])) }; }
function world(options = {}) {
  const sites = ['Shopify', 'Target'];
  const snapshots = {
    marketplaceSkus: table(sites.map(marketplace => ({ company: 'KM', country: 'US', marketplace, sku: 'SKU', site_sku: 'SKU',
      marketplace_sku_status: options.inactive === marketplace ? 'Inactive' : 'Active', replenishment_model: 'forecast_driven', fulfillment_model: 'self_fulfilled' }))),
    marketplaces: table(sites.map(marketplace => ({ company: 'KM', country: 'US', marketplace,
      marketplace_id: marketplace, fulfillment_model: 'self_fulfilled', status: 'active', allocation_priority: marketplace === 'Shopify' ? 90 : options.equal ? 90 : 105 }))),
    skuDetails: table([{ sku: 'SKU', units_per_carton: 10, lifecycle: 'Running in the Market' }]),
    warehouses: table([{ warehouse_id: 'WH', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true, is_factory_warehouse: false }]),
    replenishmentDemandAllocationRules: table(sites.map(marketplace => ({ allocation_rule_id: marketplace, company: 'KM', country: 'US',
      marketplace, destination_warehouse_id: 'WH', forecast_allocation_ratio: 1, sales_allocation_ratio: 1, status: 'active' }))),
    fcRegularForecast: table(sites.flatMap(marketplace => [2026, 2027].map(year => ({
      company: 'KM', country: 'US', marketplace, sku: 'SKU', year, jan: 310, feb: 280, mar: 310, apr: 300,
      may: 310, jun: 300, jul: 310, aug: 310, sep: 300, oct: 310, nov: 300, dec: 310 })))),
    overseasInventorySnapshot: table(options.missingStock ? [] : [{ warehouse_id: 'WH', sku: 'SKU', wh_available_stock: options.stock == null ? 15 : options.stock,
      snapshot_date: '2026-11-24' }], ['warehouse_id', 'sku', 'wh_available_stock', 'snapshot_date']),
    fcSpecialEvents: table([]), fcTargetRules: table([]), amazonDailySalesSnapshot: table([]),
    shipments: table(options.shipments || []), shipmentLines: table(options.shipmentLines || [])
  };
  if (options.missingForecast) snapshots.fcRegularForecast = table([], snapshots.fcRegularForecast.headers);
  const ss = { getSheetByName: () => null };
  const shared = {};
  function handle(marketplace) {
    const r = H.handle({ requestId: 'FIXTURE', payload: { scope: { company: 'KM', country: 'US', marketplace }, pagination: { page: 1, size: 100 } } }, {
      now: () => 0, nextSeq: () => 1, openTarget: () => ss, configMonth: () => '2026-11', configDate: () => '2026-11-24',
      inventoryContextForScope: () => ({ calculationDate: '2026-11-24', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11', timezone: 'America/Los_Angeles' }),
      readCanonicalSnapshots: () => ({ snapshots, __dailyWarehouseCache: shared })
    });
    assert(r.success, JSON.stringify(r)); checks++;
    return r.data.lines[0];
  }
  return { handle, snapshots };
}
const w = world(), shop = w.handle('Shopify'), target = w.handle('Target');
assert(!shop.blocked, JSON.stringify(shop)); checks++;
eq([shop.currentStockQty, target.currentStockQty], [10, 5]);
eq(shop.horizons.map(h => h.gapQty), [170, 290, 440, 890]);
eq(target.horizons.map(h => h.gapQty), [175, 295, 445, 895]);
eq(shop.overseasAllocation.reconciliation[0].allocatedQty, 15);
eq(shop.horizonBasis.avgSalesPerDay, null); // no sales data required in Forecast Driven
const REC = require('../js/core/supply-recommendation');
const readyRow = H.mapper([shop], { company: 'KM', country: 'US', marketplace: 'Shopify' }, 'SKU', '2026-11-24');
eq(readyRow.calculation_status, 'READY');
eq([REC.generateInventoryRecommendation(readyRow).status, REC.generateInventoryRecommendation(readyRow).suggestedQty], ['READY', 170]);
const reverse = world();
eq(reverse.handle('Target').currentStockQty, 5);
eq(reverse.handle('Shopify').currentStockQty, 10);
const equal = world({ equal: true });
eq([equal.handle('Shopify').currentStockQty, equal.handle('Target').currentStockQty], [8, 7]);
const inactive = world({ inactive: 'Target' });
eq(inactive.handle('Shopify').currentStockQty, 15);
const skip = inactive.handle('Target');
eq([skip.skipped, skip.blockedReason], [true, 'SKU_INACTIVE']);
const skippedRow = H.mapper([skip], { company: 'KM', country: 'US', marketplace: 'Target' }, 'SKU', '2026-11-24');
eq([skippedRow.calculation_status, skippedRow.d18_gap_qty, skippedRow.d90_suggested_qty], ['SKIPPED', null, null]);
eq(REC.generateInventoryRecommendation(skippedRow).totalRecommendedQty, null);
const saved = H.headers.map(h => ({ company: 'KM', country: 'US', marketplace: 'Target', sku: 'SKU',
  calculation_status: 'READY', d18_gap_qty: 999, d90_suggested_qty: 999 }[h] || ''));
const stored = [saved], outputSheet = {
  getLastColumn: () => H.headers.length, getLastRow: () => stored.length + 1,
  getRange(row) { return row === 1 ? { getValues: () => [H.headers] } :
    { getValues: () => stored, setValues: values => { stored[row - 2] = values[0]; } }; },
  appendRow: row => stored.push(row)
};
const skipCounts = H.slice([{ company: 'KM', country: 'US', marketplace: 'Target' }], {
  now: () => new Date('2026-11-25T00:00:00Z'), tz: () => 'Asia/Taipei', openTarget: () => ({}),
  workspaceGet: () => ({ success: true, data: { lines: [skip] }, meta: { calculationDate: '2026-11-24',
    horizonFormula: 'SITE_DAILY_V2', warehouseAllocationVersion: 'DAILY_3PL_V1' } })
}, outputSheet, { product: 'INVENTORY', map: H.mapper }, 'SKIP-FIXTURE');
eq([skipCounts.skipped, skipCounts.blocked, skipCounts.errors], [1, 0, 0]);
eq(stored.length, 1);
eq([stored[0][H.headers.indexOf('calculation_status')], stored[0][H.headers.indexOf('d90_suggested_qty')]], ['SKIPPED', '']);
const missing = world({ missingStock: true }).handle('Shopify');
eq(missing.blocked, true); assert.match(missing.blockedReason, /STOCK|SOURCE/); checks++;
eq(world({ missingForecast: true }).handle('Shopify').blocked, true);
const sales = world({ inactive: 'Target', missingForecast: true });
sales.snapshots.marketplaceSkus.rows[0][sales.snapshots.marketplaceSkus.headers.indexOf('replenishment_model')] = 'sales_driven';
sales.snapshots.amazonDailySalesSnapshot = table([{ company: 'KM', country: 'US', marketplace: 'Shopify', channel: 'Shopify',
  sku: 'SKU', snapshot_date: '2026-11-23', sales_units: 300 }]);
const salesLine = sales.handle('Shopify');
assert(!salesLine.blocked, JSON.stringify(salesLine)); checks++;
eq(salesLine.horizonBasis.avgSalesPerDay, 10);
eq(salesLine.horizons.map(h => h.gapQty), [165, 285, 435, 885]);
const crossing = world();
crossing.snapshots.warehouses.rows[0][crossing.snapshots.warehouses.headers.indexOf('country')] = 'CA';
assert.match(crossing.handle('Shopify').blockedReason, /WAREHOUSE_SCOPE_INVALID/); checks++;
const ambiguous = world();
ambiguous.snapshots.marketplaces.rows.push(ambiguous.snapshots.marketplaces.rows[0].slice());
assert.match(ambiguous.handle('Shopify').blockedReason, /RECEIVER_UNRESOLVED/); checks++;
function objects(t) { return t.rows.map(r => Object.fromEntries(t.headers.map((k, i) => [k, r[i]]))); }
const platform = world();
const amazon = { company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'SKU' };
platform.snapshots.marketplaceSkus = table(objects(platform.snapshots.marketplaceSkus).concat({
  ...amazon, site_sku: 'SKU', marketplace_sku_status: 'Active', replenishment_model: 'forecast_driven', fulfillment_model: 'platform_fulfilled' }));
platform.snapshots.marketplaces = table(objects(platform.snapshots.marketplaces).concat({
  ...amazon, marketplace_id: 'AMAZON', fulfillment_model: 'platform_fulfilled', status: 'active', allocation_priority: 50 }));
platform.snapshots.replenishmentDemandAllocationRules = table(objects(platform.snapshots.replenishmentDemandAllocationRules).concat({
  ...amazon, allocation_rule_id: 'AMAZON', destination_warehouse_id: 'WH', forecast_allocation_ratio: 1, sales_allocation_ratio: 1, status: 'active' }));
platform.snapshots.fcRegularForecast = table(objects(platform.snapshots.fcRegularForecast).concat(
  objects(platform.snapshots.fcRegularForecast).filter(r => r.marketplace === 'Shopify').map(r => ({ ...r, marketplace: 'Amazon' }))));
platform.snapshots.amazonInventorySnapshot = table([{ ...amazon, available_qty: 0, fc_transfer_qty: 0, fc_processing_qty: 0 }]);
const shopAfterReserve = platform.handle('Shopify'), fba = platform.handle('Amazon');
assert(!shopAfterReserve.blocked, JSON.stringify(shopAfterReserve)); checks++;
eq(shopAfterReserve.currentStockQty, 5);
eq(fba.currentStockQty, 0);
eq(fba.horizons[0].gapQty, 180); // reserved 3PL is not available FBA inventory
const otherSku = world();
otherSku.snapshots.overseasInventorySnapshot = table(objects(otherSku.snapshots.overseasInventorySnapshot).concat({
  warehouse_id: 'WH', sku: 'OTHER', wh_available_stock: 99999, snapshot_date: '2026-11-24' }));
eq(otherSku.handle('Shopify').currentStockQty, 10);
const inTransit = world({ stock: 0,
  shipments: [{ shipment_id: 'SHIP', company: 'KM', country: 'US', marketplace: 'Target', status: 'in_transit',
    eta: '2026-12-13', destination_warehouse_id: 'WH', record_origin: 'IMPORT_HISTORICAL', opening_supply_mode: 'DISPLAY_ONLY' }],
  shipmentLines: [{ shipment_line_id: 'SL', shipment_id: 'SHIP', sku: 'SKU', shipment_qty: 100,
    shipment_received_qty: 20, destination_warehouse_id: 'WH' }] });
const incomingShop = inTransit.handle('Shopify'), incomingTarget = inTransit.handle('Target');
assert(!incomingTarget.blocked, JSON.stringify(incomingTarget)); checks++;
eq(incomingShop.qualifiedIncomingQty, 0);
eq(incomingTarget.qualifiedIncomingQty, 80);
eq(incomingTarget.horizons.map(h => h.incomingAddedQty), [0, 80, 80, 80]);
eq(incomingTarget.currentStockQty, 0);
eq(incomingTarget.horizons.map(h => h.gapQty), [180, 220, 370, 820]);
eq(writes, 0);
// Production incident shapes: missing data stays blocked, and self fulfillment uses 3PL rather than FBA.
const nextYearMissing = world();
nextYearMissing.snapshots.fcRegularForecast = table(objects(nextYearMissing.snapshots.fcRegularForecast).filter(r => !(r.marketplace === 'Target' && r.year === 2027)));
assert.equal(nextYearMissing.handle('Target').blockedReason, 'DAILY_ALLOCATION_DEMAND_UNKNOWN: km||us||target'); checks++;
assert.equal(nextYearMissing.handle('Shopify').blockedReason, 'DAILY_ALLOCATION_DEMAND_UNKNOWN: km||us||target'); checks++;
const unconfigured = world();
unconfigured.snapshots.replenishmentDemandAllocationRules = table(objects(unconfigured.snapshots.replenishmentDemandAllocationRules).filter(r => r.marketplace !== 'Target'));
assert.match(unconfigured.handle('Target').blockedReason, /DAILY_ALLOCATION_RECEIVER_UNRESOLVED/); checks++;
const inheritedSelf = world();
inheritedSelf.snapshots.marketplaceSkus = table(objects(inheritedSelf.snapshots.marketplaceSkus).map(r => ({ ...r, fulfillment_model: '' })));
eq(inheritedSelf.handle('Target').currentStockQty, 5); // homogeneous site-level self_fulfilled is authoritative
const hybridPlatform = world();
hybridPlatform.snapshots.marketplaces = table(objects(hybridPlatform.snapshots.marketplaces).map(r => ({ ...r, fulfillment_model: r.marketplace === 'Target' ? 'hybrid' : r.fulfillment_model })));
hybridPlatform.snapshots.marketplaceSkus = table(objects(hybridPlatform.snapshots.marketplaceSkus).map(r => ({ ...r, fulfillment_model: r.marketplace === 'Target' ? 'platform_fulfilled' : r.fulfillment_model })));
assert.equal(hybridPlatform.handle('Target').blockedReason, 'MARKETPLACE_STOCK_MISSING'); checks++;
console.log('DAILY_WAREHOUSE_WORKSPACE_PASS ' + checks + ' live_business_writes=0');
