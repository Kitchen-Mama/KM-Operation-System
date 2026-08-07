// Kitchen Mama Operation System — MARKETPLACE vs WAREHOUSE opening-stock authority (F1-4B-FM5-R2b supplemental).
// Run: node assets/tests/self-fulfilled-opening-stock-f1-4b-fm5r2b.test.js
// -----------------------------------------------------------------------------
// REGRESSION LOCK for the fulfillment-stock freeze: platform_fulfilled/MARKETPLACE opening = the frozen Amazon Site
// Stock owner (available + fc_transfer + fc_processing; customer orders + unsellable EXCLUDED; warehouse/overseas
// rows EXCLUDED so FBA is never re-added through the Overseas allocatable pool). self_fulfilled/WAREHOUSE opening =
// the SUM of each eligible warehouse's OWN allocated current stock, summed ONLY AFTER each warehouse is projected
// independently (warehouse isolation) — never the Amazon formula, never pool-then-invent, never reused across
// receivers. Valid-zero stays 0; missing stays null (never a fabricated 0). Handler-eval harness; no network/DB.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F42 + '\n' + F43 + '\n return {' +
  ' whOpening: recoWsWarehouseOpeningStock_,' +
  ' opMap: gapOpMapFromLines_,' +
  ' KMDR: (typeof KMDR !== "undefined" ? KMDR : null) };'))();

// isolate the self_fulfilled expander body for the leak / source assertions
var whBody = (F42.split('function recoWsExpandWarehouse_')[1] || '').split('\nfunction recoWs')[0];
var whOpeningBody = (F42.split('function recoWsWarehouseOpeningStock_')[1] || '').split('\nfunction ')[0];

// =============================================================================================================
section('PLATFORM_FULFILLED STOCK OWNER — Amazon Site Stock (available + fc_transfer + fc_processing)');
var mk = H.KMDR.resolveMarketplaceCurrentStock;
var site = mk({ scope: { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' }, rows: [
  { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', available_qty: 100, fc_transfer_qty: 20, fc_processing_qty: 5, customer_order_qty: 999, unfulfillable_qty: 777 }
] });
eq([site.ready, site.qty], [true, 125], 'PF1 Site Stock = available 100 + fc_transfer 20 + fc_processing 5 = 125 (customer orders + unsellable EXCLUDED)');
// a warehouse/overseas row (has a warehouse identity) is NOT Site Stock → FBA/overseas never re-added as Site Stock
var siteWh = mk({ scope: { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' }, rows: [
  { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', warehouse_id: 'W3PL-US', available_qty: 1000 }
] });
eq([siteWh.ready, siteWh.missing], [false, true], 'PF2 a warehouse-identified row is EXCLUDED from Site Stock (Overseas/3PL stock is an allocatable pool, not Site Stock — no double count)');
var siteMiss = mk({ scope: { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' }, rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', fc_transfer_qty: 5 }] });
eq([siteMiss.ready, siteMiss.qty, siteMiss.missing], [false, null, true], 'PF3 missing available_qty → missing (NOT a fabricated 0)');
var siteZero = mk({ scope: { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R' }, rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', available_qty: 0 }] });
eq([siteZero.ready, siteZero.qty], [true, 0], 'PF4 explicit available_qty 0 → Site Stock 0 (valid zero)');

section('SELF_FULFILLED STOCK OWNER — each warehouse\'s OWN current stock (NOT the Amazon formula)');
var entries = [
  { lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-A', quantity: 600 },
  { lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-B', quantity: 400 },
  { lifecycle_bucket: 'SHIPPED_IN_TRANSIT', warehouse_id: 'WH-A', quantity: 999 }   // in-transit is NOT opening stock
];
eq(H.whOpening(entries, 'WH-A'), 600, 'SF1 WH-A opening = its OWN CURRENT_STOCK (600); the 999 in-transit is NOT opening stock');
eq(H.whOpening(entries, 'WH-B'), 400, 'SF2 WH-B opening = its OWN CURRENT_STOCK (400)');
eq(H.whOpening(entries, 'WH-C'), null, 'SF3 a warehouse with no stock row → null (missing ≠ 0; KMTPP then fails closed)');
eq(H.whOpening([{ lifecycle_bucket: 'CURRENT_STOCK', warehouse_id: 'WH-Z', quantity: 0 }], 'WH-Z'), 0, 'SF4 explicit 0 stock row → 0 (valid zero)');
ok(/lifecycle_bucket.*!==.*CURRENT_STOCK/.test(whOpeningBody) && /warehouse_id.*!==.*warehouseId|recoWsStr_\(e\.warehouse_id\) !== warehouseId/.test(whOpeningBody), 'SF5 opening reads CURRENT_STOCK lifecycle rows filtered to the OWN warehouse_id (per-warehouse, never pooled)');

section('SELF_FULFILLED MULTI-WAREHOUSE ALLOCATION SUM — summed ONLY AFTER independent per-warehouse projection');
// Two warehouse lines for ONE self_fulfilled site, each already projected independently by KMTPP (opening 600 / 400).
function whLine(wh, projGap) {
  return { recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: 'CO1100-R', destinationKey: 'WAREHOUSE||KM||US||AMAZON_US||' + wh,
    monthlyProjection: [
      { tier: 'T1', month: '2026-09', remainingGapQty: projGap, suggestedOrderQty: projGap },
      { tier: 'T2', month: '2026-10', remainingGapQty: 0, suggestedOrderQty: 0 },
      { tier: 'T3', month: '2026-11', remainingGapQty: 0, suggestedOrderQty: 0 },
      { tier: 'T4', month: '2026-12', remainingGapQty: 0, suggestedOrderQty: 0 }
    ] };
}
var scope = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
// WH-A projection residual gap 200, WH-B residual gap 500 → the SITE row = SUM across the independently-projected lines.
var siteRow = H.opMap([whLine('WH-A', 200), whLine('WH-B', 500)], scope, 'CO1100-R', '2026-08');
eq([siteRow.calculation_status, siteRow.t1_gap_qty, siteRow.t1_suggested_qty], ['READY', 700, 700], 'MW1 site T1 = Σ of the two INDEPENDENTLY-projected warehouse lines (200 + 500 = 700) — sum AFTER allocation, never pool-then-invent');
eq([siteRow.t2_gap_qty, siteRow.t3_gap_qty, siteRow.t4_gap_qty], [0, 0, 0], 'MW2 later tiers aggregate the per-warehouse carried-forward projections');

section('NO CROSS-RECEIVER DOUBLE COUNT — a warehouse\'s stock belongs to exactly one warehouse_id');
eq(H.whOpening(entries, 'WH-A'), 600, 'XR1 querying WH-A returns ONLY WH-A stock (600) — WH-B\'s 400 is never folded in');
ok(H.whOpening(entries, 'WH-A') + H.whOpening(entries, 'WH-B') === 1000, 'XR2 Site X opening = WH-A 600 + WH-B 400 = 1000 (each physical warehouse counted once, under its own id)');
// the aggregator sums DISTINCT warehouse lines (distinct destinationKey) — a warehouse contributes to one line only.
ok(/WAREHOUSE\|\|KM\|\|US\|\|AMAZON_US\|\|WH-A/.test(whLine('WH-A', 1).destinationKey) && whLine('WH-A', 1).destinationKey !== whLine('WH-B', 1).destinationKey, 'XR3 each warehouse is a distinct destination line (no same physical warehouse reused across receivers)');

section('NO AMAZON STOCK FORMULA LEAK INTO SELF_FULFILLED');
ok(!/amazonInventory|resolveMarketplaceCurrentStock|resolveUnifiedDestinationRecommendation/.test(whBody), 'LK1 the WAREHOUSE expander never calls the marketplace Site Stock owner / amazon inventory');
ok(!/available_qty|fc_transfer|fc_processing/.test(whBody), 'LK2 the WAREHOUSE expander never uses the Amazon available+fc_transfer+fc_processing formula');
ok(!/available_qty|fc_transfer|fc_processing|amazonInventory/.test(whOpeningBody), 'LK3 the self_fulfilled opening owner reads lifecycle CURRENT_STOCK only (no Amazon formula)');

console.log('\n----------------------------------------');
console.log('SELF-FULFILLED OPENING STOCK (F1-4B-FM5-R2b supplemental): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
