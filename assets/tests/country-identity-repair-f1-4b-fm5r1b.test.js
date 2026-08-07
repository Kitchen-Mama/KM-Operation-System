// Kitchen Mama Operation System — Canonical Country Identity repair (F1-4B-FM5-R1b).
// Run: node assets/tests/country-identity-repair-f1-4b-fm5r1b.test.js
// -----------------------------------------------------------------------------
// Proves ONE canonical country-identity owner (KMCID) resolves the frozen UK ≡ GB same-market alias, that the
// canonical MARKETPLACE stock reader (KMDR) now matches a GB snapshot row from a UK scope (Site Stock =
// available + fc_transfer + fc_processing; customer orders + unsellable excluded; missing != 0; zero stays 0),
// that non-UK countries are unchanged and never alias, and that the materialized batch no longer returns
// MARKETPLACE_STOCK_MISSING for the UK/GB fixture. No page-side alias patch; no formula/DB change.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var KMCID = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-country-identity.js'));
var INVJS = read('js/pages/inventory-replenishment.js');
var KMDR_SRC = read('js/core/supply-planning-destination-runtime.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

section('KMCID · canonical country identity matrix');
[['US', 'US'], ['CA', 'CA'], ['UK', 'GB'], ['GB', 'GB'], ['DE', 'DE'], ['FR', 'FR'], ['ES', 'ES'], ['AU', 'AU'], ['JP', 'JP']].forEach(function (p) {
  eq(KMCID.canonicalCountryCode(p[0]), p[1], 'MTX canonicalCountryCode(' + p[0] + ') = ' + p[1]);
});
ok(KMCID.countryMatches('UK', 'GB') === true, 'UK1 UK == GB');
ok(KMCID.countryMatches('GB', 'UK') === true, 'UK2 GB == UK');
ok(KMCID.countryMatches('gb', ' uk ') === true, 'UK3 case/space-insensitive');
ok(KMCID.countryMatches('US', 'US') === true, 'EX1 US == US (unchanged)');
ok(KMCID.countryMatches('DE', 'DE') === true && KMCID.countryMatches('JP', 'JP') === true, 'EX2 DE/JP exact match unchanged');
ok(KMCID.countryMatches('UK', 'US') === false, 'NA1 UK != US');
ok(KMCID.countryMatches('GB', 'DE') === false, 'NA2 GB != DE');
ok(KMCID.countryMatches('US', 'CA') === false, 'NA3 US != CA (no accidental alias)');
ok(KMCID.countryMatches('', 'GB') === false && KMCID.countryMatches('GB', '') === false, 'GUARD blank on either side → false');

section('KMDR · MARKETPLACE stock resolves a GB snapshot from a UK scope (Site Stock = 233+1+0 = 234)');
global.KMCID = KMCID;   // emulate the bundle global so KMDR.countryEqv is alias-aware
var KMDR = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-destination-runtime.js'));
// amazon_inventory_snapshot stores GB; scope is UK. available 233 + fc_transfer 1 + fc_processing 0; customer
// orders 12 + unsellable 5 EXCLUDED.
var gbRow = { country: 'GB', marketplace: 'Amazon', sku: 'CO1100-R', available_qty: 233, fc_transfer_qty: 1, fc_processing_qty: 0, customer_order_qty: 12, unfulfillable_qty: 5 };
var r = KMDR.resolveMarketplaceCurrentStock({ rows: [gbRow], scope: { country: 'UK', marketplace: 'Amazon', sku: 'CO1100-R' } });
ok(r.ready === true && r.missing === false, 'STK1 UK scope matches the GB snapshot row (no MARKETPLACE_STOCK_MISSING)');
eq(r.qty, 234, 'STK2 Site Stock = 233 + 1 + 0 = 234 (customer orders + unsellable excluded)');

section('KMDR · valid zero stays 0; missing stays missing');
var zeroRow = { country: 'GB', marketplace: 'Amazon', sku: 'Z1', available_qty: 0, fc_transfer_qty: 0, fc_processing_qty: 0 };
var rz = KMDR.resolveMarketplaceCurrentStock({ rows: [zeroRow], scope: { country: 'UK', marketplace: 'Amazon', sku: 'Z1' } });
eq([rz.ready, rz.qty], [true, 0], 'ZERO explicit 0 stays 0 (not missing)');
var rmiss = KMDR.resolveMarketplaceCurrentStock({ rows: [{ country: 'GB', marketplace: 'Amazon', sku: 'M1' /* no available_qty */ }], scope: { country: 'UK', marketplace: 'Amazon', sku: 'M1' } });
ok(rmiss.ready === false && rmiss.missing === true && rmiss.qty === null, 'MISS unreadable available_qty → missing (never a fabricated 0)');

section('KMDR · non-UK unchanged + no accidental alias');
var deRow = { country: 'DE', marketplace: 'Amazon', sku: 'D1', available_qty: 50, fc_transfer_qty: 0, fc_processing_qty: 0 };
eq(KMDR.resolveMarketplaceCurrentStock({ rows: [deRow], scope: { country: 'DE', marketplace: 'Amazon', sku: 'D1' } }).qty, 50, 'DE1 DE scope resolves DE row (exact, unchanged)');
ok(KMDR.resolveMarketplaceCurrentStock({ rows: [deRow], scope: { country: 'FR', marketplace: 'Amazon', sku: 'D1' } }).missing === true, 'DE2 FR scope does NOT match a DE row');
ok(KMDR.resolveMarketplaceCurrentStock({ rows: [gbRow], scope: { country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' } }).missing === true, 'DE3 US scope does NOT alias to a GB row');

section('Fallback · KMDR without KMCID uses exact equality (isolated module = unchanged legacy)');
delete require.cache[require.resolve(path.join(__dirname, '..', 'js', 'core', 'supply-planning-destination-runtime.js'))];
delete global.KMCID;
var KMDR2 = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-destination-runtime.js'));
ok(KMDR2.resolveMarketplaceCurrentStock({ rows: [gbRow], scope: { country: 'UK', marketplace: 'Amazon', sku: 'CO1100-R' } }).missing === true, 'FB1 no KMCID loaded → exact equality (UK != GB) — safe legacy fallback');
global.KMCID = KMCID;

section('MATERIALIZED BATCH · UK/GB fixture no longer MARKETPLACE_STOCK_MISSING (end-to-end via bundle+handler)');
(function () {
  var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
  var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
  var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return { handle: handleRecommendationWorkspaceGet_ };'))();
  function makeSs(tables, c) {
    c.getSheetByName = 0;
    return { getSheetByName: function (n) { c.getSheetByName++; var t = tables[n]; if (!t) return null; var v = [t.headers].concat(t.rows);
      return { getLastRow: function () { return v.length; }, getDataRange: function () { return { getValues: function () { return v; } }; },
        getRange: function () { return { setValues: function () {}, setValue: function () {} }; }, appendRow: function () {} }; } };
  }
  function io(m, d, ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return m; }, configDate: function () { return d; }, openTarget: function () { return ss; } }; }
  var FCH = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
  // Scope = UK; snapshot country = GB. marketplaces + marketplace_skus use the domain 'UK'.
  var tables = {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku'], rows: [['KM', 'UK', 'AMAZON_UK', 'CO1100-R', 'ST']] },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'UK', 'AMAZON_UK', 'platform_fulfilled', 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'UK', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton', 'series', 'category'], rows: [['CO1100-R', 40, 'CO', 'OPENER']] },
    fc_regular_forecast: { headers: FCH, rows: [['KM', 'UK', 'AMAZON_UK', 'CO1100-R', 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 7000, 4282, 7500, 0, 'FC-1']] },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty', 'fc_transfer_qty', 'fc_processing_qty', 'customer_order_qty', 'unfulfillable_qty'], rows: [['GB', 'AMAZON_UK', 'CO1100-R', 233, 1, 0, 12, 5]] }
  };
  var cM = {};
  var env = H.handle({ requestId: 'REQ-UKGB', payload: { scope: { company: 'KM', country: 'UK', marketplace: 'AMAZON_UK' }, pagination: { page: 1, size: 100 } } }, io('2026-08', '2026-08-07', makeSs(tables, cM)));
  ok(env.success === true, 'BATCH0 request success');
  var line = env.data.lines[0];
  ok(line && line.blockedReason !== 'MARKETPLACE_STOCK_MISSING', 'BATCH1 UK scope + GB snapshot → NOT MARKETPLACE_STOCK_MISSING');
  eq(line.currentStockQty, 234, 'BATCH2 canonical Site Stock = 233 + 1 + 0 = 234 (GB row resolved from UK scope)');
})();

section('NO page-side alias patch / no formula change');
ok(/IRCountry/.test(INVJS) && !/=== ['"]GB['"]/.test(INVJS.replace(/IRCountry[\s\S]{0,0}/g, '')), 'NP1 Inventory page still delegates to IRCountry (no new hard-coded GB alias)');
ok(/countryEqv\(r\.country, country\)/.test(KMDR_SRC) && !/234/.test(KMDR_SRC), 'NP2 KMDR uses the canonical matcher; the regression number 234 is NOT hard-coded in runtime');
ok(!/Math\.(ceil|floor|round)/.test(read('js/core/supply-planning-country-identity.js')), 'NP3 country owner is identity-only (no arithmetic/formula)');

console.log('\n----------------------------------------');
console.log('COUNTRY IDENTITY REPAIR (F1-4B-FM5-R1b): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
