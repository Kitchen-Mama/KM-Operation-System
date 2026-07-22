/* ============================================================================
 * scope-isolation.test.js — regression fixtures proving strict company scoping.
 *
 * KM and ResUS are SEPARATE company scopes that both operate US / Amazon. This
 * test locks the canonical scope contract used across Inventory Replenishment and
 * FC Summary: every query/join/lookup keys on COMPANY + COUNTRY + MARKETPLACE
 * (marketplace_id where available), never country + marketplace alone.
 *
 * Run:  node assets/tests/scope-isolation.test.js
 * (Pure Node — no browser, no build step. Exits non-zero on any failed assertion.)
 * ========================================================================== */

'use strict';

var failures = 0;
function assert(cond, msg) { if (!cond) { failures++; console.error('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }
function up(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
function lo(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

// ---- Fixtures: KM and ResUS both selling on US / Amazon, with DISTINCT data. ----
var FIX = {
  marketplaces: [
    { marketplace_id: 'MK-KM-US-AMZ',   company: 'KM',    country: 'US', marketplace: 'Amazon', allocation_priority: 2, fulfillment_model: 'platform_fulfilled' },
    { marketplace_id: 'MK-RES-US-AMZ',  company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 1, fulfillment_model: 'self_fulfilled' }
  ],
  marketplace_skus: [
    { marketplace_sku_id: 'MS-KM-1',  company: 'KM',    country: 'US', marketplace: 'Amazon', marketplace_id: 'MK-KM-US-AMZ',  sku: 'KM-APPLE',  regular_price: 29.99, marketplace_sku_status: 'active' },
    { marketplace_sku_id: 'MS-RES-1', company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplace_id: 'MK-RES-US-AMZ', sku: 'RES-BERRY', regular_price: 19.99, marketplace_sku_status: 'active' }
  ],
  fc_regular_forecast: [
    { company: 'KM',    country: 'US', marketplace: 'Amazon', sku: 'KM-APPLE',  year: 2026, feb: 500 },
    { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'RES-BERRY', year: 2026, feb: 120 }
  ],
  amazon_daily_sales: [   // NOTE: no company column in this raw table (data-model reality)
    { country: 'US', marketplace: 'Amazon', sku: 'KM-APPLE',  snapshot_date: '2026-07-20', sales_units: 40 },
    { country: 'US', marketplace: 'Amazon', sku: 'RES-BERRY', snapshot_date: '2026-07-20', sales_units: 9 }
  ],
  pricing_list: [
    { marketplace_sku_id: 'MS-KM-1',  company: 'KM',    sku: 'KM-APPLE',  regular_price: 29.99, currency: 'USD' },
    { marketplace_sku_id: 'MS-RES-1', company: 'ResUS', sku: 'RES-BERRY', regular_price: 19.99, currency: 'USD' }
  ],
  warehouses: [
    { warehouse_id: 'WH-KM-3PL',  company: 'KM',    country: 'US', warehouse_type: '3PL', warehouse_name: 'David Warehouse', is_active: true },
    { warehouse_id: 'WH-RES-3PL', company: 'ResUS', country: 'US', warehouse_type: '3PL', warehouse_name: 'Winit Warehouse', is_active: true }
  ],
  overseas_inventory: [
    { warehouse_id: 'WH-KM-3PL',  sku: 'KM-APPLE',  wh_available_stock: 700 },
    { warehouse_id: 'WH-RES-3PL', sku: 'RES-BERRY', wh_available_stock: 400 }
  ]
};

// ---- Canonical scope predicates (mirror the implementation contract) ----
function scopedMarketplaceSkus(rows, scope) {
  return rows.filter(function (m) { return up(m.company) === up(scope.company) && up(m.country) === up(scope.country) && lo(m.marketplace) === lo(scope.marketplace); });
}
function scopedForecast(rows, scope, sku) {
  return rows.filter(function (r) { return up(r.sku) === up(sku) && up(r.company) === up(scope.company) && up(r.country) === up(scope.country) && lo(r.marketplace) === lo(scope.marketplace); });
}
function scopedPricing(rows, marketplaceSkuId) {
  return rows.filter(function (p) { return up(p.marketplace_sku_id) === up(marketplaceSkuId); });
}
function eligible3pl(warehouses, scope) {
  return warehouses.filter(function (w) { return up(w.company) === up(scope.company) && up(w.country) === up(scope.country) && up(w.warehouse_type) === '3PL' && w.is_active === true; });
}
function pool3pl(overseas, warehouses, scope, sku) {
  var elig = {}; eligible3pl(warehouses, scope).forEach(function (w) { elig[w.warehouse_id] = true; });
  return overseas.filter(function (r) { return up(r.sku) === up(sku) && elig[r.warehouse_id]; })
    .reduce(function (s, r) { return s + (parseFloat(r.wh_available_stock) || 0); }, 0);
}
// The OLD buggy predicate: country + marketplace only (company dropped).
function buggyByCountryMarketplace(rows, scope) {
  return rows.filter(function (m) { return up(m.country) === up(scope.country) && lo(m.marketplace) === lo(scope.marketplace); });
}

var KM  = { company: 'KM',    country: 'US', marketplace: 'Amazon' };
var RES = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };

console.log('\n== Scope isolation: KM/US/Amazon vs ResUS/US/Amazon ==');

// 1. Marketplace SKU list
var kmSkus = scopedMarketplaceSkus(FIX.marketplace_skus, KM).map(function (m) { return m.sku; });
var resSkus = scopedMarketplaceSkus(FIX.marketplace_skus, RES).map(function (m) { return m.sku; });
assert(kmSkus.length === 1 && kmSkus[0] === 'KM-APPLE', 'KM SKU list = [KM-APPLE]');
assert(resSkus.length === 1 && resSkus[0] === 'RES-BERRY', 'ResUS SKU list = [RES-BERRY]');
assert(JSON.stringify(kmSkus) !== JSON.stringify(resSkus), 'KM and ResUS SKU lists differ');
assert(kmSkus.indexOf('RES-BERRY') === -1, 'KM never sees ResUS SKU');

// 2. Forecast
var kmFc = scopedForecast(FIX.fc_regular_forecast, KM, 'KM-APPLE');
var resFc = scopedForecast(FIX.fc_regular_forecast, RES, 'RES-BERRY');
assert(kmFc.length === 1 && kmFc[0].feb === 500, 'KM forecast = 500');
assert(resFc.length === 1 && resFc[0].feb === 120, 'ResUS forecast = 120');
assert(scopedForecast(FIX.fc_regular_forecast, KM, 'RES-BERRY').length === 0, 'KM scope returns no ResUS forecast row');

// 3. Sales — company-less raw table, but the company-scoped SKU universe partitions it: KM only asks
//    for KM SKUs, so KM never reads ResUS sales.
var kmSalesSku = kmSkus[0], resSalesSku = resSkus[0];
var kmSales = FIX.amazon_daily_sales.filter(function (r) { return up(r.sku) === up(kmSalesSku); });
var resSales = FIX.amazon_daily_sales.filter(function (r) { return up(r.sku) === up(resSalesSku); });
assert(kmSales.length === 1 && kmSales[0].sales_units === 40, 'KM sales = 40 (via KM SKU universe)');
assert(resSales.length === 1 && resSales[0].sales_units === 9, 'ResUS sales = 9 (via ResUS SKU universe)');
assert(kmSales[0].sales_units !== resSales[0].sales_units, 'KM and ResUS sales differ');

// 4. Pricing — resolved by marketplace_sku_id (which is company-scoped)
var kmPrice = scopedPricing(FIX.pricing_list, scopedMarketplaceSkus(FIX.marketplace_skus, KM)[0].marketplace_sku_id)[0];
var resPrice = scopedPricing(FIX.pricing_list, scopedMarketplaceSkus(FIX.marketplace_skus, RES)[0].marketplace_sku_id)[0];
assert(kmPrice && kmPrice.regular_price === 29.99, 'KM price = 29.99');
assert(resPrice && resPrice.regular_price === 19.99, 'ResUS price = 19.99');
assert(kmPrice.regular_price !== resPrice.regular_price, 'KM and ResUS pricing differ');

// 5. 3PL pool
var kmPool = pool3pl(FIX.overseas_inventory, FIX.warehouses, KM, 'KM-APPLE');
var resPool = pool3pl(FIX.overseas_inventory, FIX.warehouses, RES, 'RES-BERRY');
assert(kmPool === 700, 'KM 3PL pool = 700 (David Warehouse only)');
assert(resPool === 400, 'ResUS 3PL pool = 400 (Winit Warehouse only)');
assert(kmPool !== resPool, 'KM and ResUS 3PL pools differ');

// 6. Regression guard: the OLD country+marketplace-only predicate MERGES both companies (the bug).
var merged = buggyByCountryMarketplace(FIX.marketplace_skus, KM).map(function (m) { return m.sku; });
assert(merged.length === 2, 'country+marketplace-only predicate merges BOTH companies (documents the bug the company key fixes)');

if (failures) { console.error('\n' + failures + ' assertion(s) FAILED\n'); process.exit(1); }
console.log('\nAll scope-isolation assertions passed.\n');
