// FC Summary — Regional Pricing + Currency small-fix tests.
// Run: node assets/tests/fc-summary-pricing.test.js
// Extracts the REAL resolveRegionalPricingContext() / _evtRoundMoney() / _evtDealPrecision() from
// fc-summary.js and runs them against pricing_list fixtures, plus SOURCE-SCAN assertions that both FC flows
// share the single resolver, price_units is persisted from the same pricing_list currency, and missing
// pricing fails closed. Browser acceptance remains USER PENDING.
'use strict';
var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var js = read('js/pages/fc-summary.js');
var gs = read('specs/active/apps-script/20_campaign_write_handlers.gs');
var html = read('html/pages/fc-summary.html');
var css = read('css/pages/fc-overview.css');

function extractFn(src, name) {
  var re = new RegExp('function ' + name + '\\s*\\(([^)]*)\\)\\s*\\{');
  var m = re.exec(src);
  if (!m) throw new Error('function not found: ' + name);
  var i = src.indexOf('{', m.index), depth = 0, end = -1;
  for (var k = i; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } } }
  return new Function(m[1], src.slice(i + 1, end));
}

// stub globals the extracted functions reference
global._fcResolveMarketplaceKey = function (mk) { return mk; };          // canonical marketplace passthrough
var PL = [];
global.window = { KM: { DB: { getPricingList: function () { return PL; } } } };
global._evtDealPrecision = extractFn(js, '_evtDealPrecision');
var resolve = extractFn(js, 'resolveRegionalPricingContext');
var round = extractFn(js, '_evtRoundMoney');

function plRow(o) {
  return { marketplaceSkuId: o.msku || '', sku: o.sku || '', siteSku: o.siteSku || '',
    country: o.country || '', marketplace: o.marketplace || '', currency: o.currency || '',
    regularPrice: parseFloat(o.regular_price) || 0, raw: { regular_price: o.regular_price } };
}

// ==========================================================================
section('A. Currency comes from the SAME pricing_list row (per site)');
(function () {
  PL = [
    plRow({ msku: 'M-CA', sku: 'GA0450', country: 'CA', marketplace: 'Amazon', currency: 'CAD', regular_price: '29.99' }),
    plRow({ msku: 'M-US', sku: 'GA0450', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: '24.99' }),
    plRow({ msku: 'M-AU', sku: 'GA0450', country: 'AU', marketplace: 'Amazon', currency: 'AUD', regular_price: '39.99' })
  ];
  var ca = resolve({ company: 'KM', country: 'CA', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-CA' });
  eq([ca.regularPrice, ca.currency, ca.source, ca.found], [29.99, 'CAD', 'pricing_list', true], 'A1 CA/Amazon → 29.99 CAD from pricing_list');
  var us = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-US' });
  eq([us.regularPrice, us.currency], [24.99, 'USD'], 'A2 US/Amazon → 24.99 USD');
  var au = resolve({ company: 'KM', country: 'AU', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-AU' });
  eq([au.regularPrice, au.currency], [39.99, 'AUD'], 'A3 AU/Amazon → 39.99 AUD');
})();

section('B. Scope switch CA→US re-resolves (no cached CAD price/label)');
(function () {
  // same sku, resolver is stateless → each call reflects the current scope/identity
  var a = resolve({ country: 'CA', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-CA' });
  var b = resolve({ country: 'US', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-US' });
  ok(a.currency === 'CAD' && b.currency === 'USD' && a.regularPrice === 29.99 && b.regularPrice === 24.99, 'B1 CA→US flips price + currency (no residual CAD)');
})();

section('C. Same SKU, different country, different price — no first-match');
(function () {
  // business-identity path (no marketplace_sku_id held) must pick the country-matching row, not the first
  var us = resolve({ country: 'US', marketplace: 'Amazon', sku: 'GA0450' });
  eq([us.regularPrice, us.currency, us.marketplaceSkuId], [24.99, 'USD', 'M-US'], 'C1 business-identity picks US row (not the first CA row)');
  var au = resolve({ country: 'AU', marketplace: 'Amazon', sku: 'GA0450' });
  eq([au.regularPrice, au.currency], [39.99, 'AUD'], 'C2 business-identity picks AU row');
})();

section('D. Missing pricing row → fail-closed (null, never 0, no cross-country substitute)');
(function () {
  PL = [plRow({ msku: 'M-CA', sku: 'GA0450', country: 'CA', marketplace: 'Amazon', currency: 'CAD', regular_price: '29.99' })];
  var miss = resolve({ country: 'US', marketplace: 'Amazon', sku: 'GA0450', marketplaceSkuId: 'M-US-NONE' });
  eq([miss.regularPrice, miss.currency, miss.found], [null, null, false], 'D1 unknown marketplace_sku_id → null price + null currency (never 0)');
  var noCross = resolve({ country: 'US', marketplace: 'Amazon', sku: 'GA0450' });
  eq([noCross.regularPrice, noCross.found], [null, false], 'D2 business-identity US → null (does NOT borrow the CA row)');
  // explicit 0 / blank regular_price → treated as missing (never a 0 price)
  PL = [plRow({ msku: 'M-Z', sku: 'GA0450', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: '0' })];
  eq(resolve({ sku: 'GA0450', marketplaceSkuId: 'M-Z' }).regularPrice, null, 'D3 regular_price 0 → null (never a fabricated 0 price)');
  PL = [plRow({ msku: 'M-B', sku: 'GA0450', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: '' })];
  eq(resolve({ sku: 'GA0450', marketplaceSkuId: 'M-B' }).regularPrice, null, 'D4 blank regular_price → null');
})();

section('E. Deal Price rounding unchanged; uses the Regular currency precision');
(function () {
  eq(round(29.99 * (1 - 20 / 100), 'CAD'), 23.99, 'E1 29.99 × (1−20%) = 23.992 → 23.99 CAD (2 dp, unchanged)');
  eq(round(24.99 * (1 - 10 / 100), 'USD'), 22.49, 'E2 USD 2 dp unchanged');
  eq(round(1000 * (1 - 15 / 100), 'JPY'), 850, 'E3 JPY 0 dp (no minor unit) unchanged');
})();

section('F. Source-scan — single shared resolver, no duplicate lookup');
(function () {
  ok((js.match(/function resolveRegionalPricingContext/g) || []).length === 1, 'F1 exactly one canonical resolver defined');
  ok(/_evtSkuPricing[\s\S]{0,400}resolveRegionalPricingContext\(/.test(js), 'F2 Special Event flow (_evtSkuPricing) delegates to the shared resolver');
  ok(/source: 'pricing_list'/.test(js) && !/sku_details[\s\S]{0,60}selling_price/.test(js.slice(js.indexOf('function resolveRegionalPricingContext'), js.indexOf('function _evtSkuPricing'))), 'F3 resolver source is pricing_list only (no sku_details.selling_price)');
  // resolver body must NOT read marketplace_skus price as a fallback
  var body = js.slice(js.indexOf('function resolveRegionalPricingContext'), js.indexOf('function _evtSkuPricing'));
  ok(!/getMarketplaceSkus|m\.regularPrice|m\.raw/.test(body), 'F4 resolver never falls back to a marketplace_skus price');
})();

section('G. Persistence — price_units snapshot from the same pricing_list currency');
(function () {
  ok(/price_units: l\.currency/.test(js), 'G1 campaign_sku_lines payload writes price_units = pricing_list currency');
  ok(/currency: r\.currency/.test(js) && /currency: gr\.currency/.test(js), 'G2 both single + group line objects carry the pricing_list currency');
  ok(/'price_units'/.test(gs) && /price_units:\s*\(l\.price_units/.test(gs), 'G3 .gs campaign_sku_lines header + handler map price_units (additive, single currency column)');
  ok((gs.match(/'price_units'/g) || []).length === 1, 'G4 exactly one price_units column (no duplicate currency column)');
})();

section('H. Missing fail-closed + currency UI wiring (source-scan)');
(function () {
  ok((js.match(/MISSING_PRICING_LIST_ROW/g) || []).length >= 2, 'H1 save blocks with MISSING_PRICING_LIST_ROW (single + group)');
  ok(/class="evt-cur"/.test(js) && /<span>Cur<\/span>/.test(html), 'H2 single-row currency cell rendered (row + head)');
  ok(/MIXED CURRENCY/.test(js), 'H3 group card warns on mixed pricing_list currencies');
  ok(/grid-template-columns: 2fr 1fr 0\.8fr 1fr 1fr 44px 28px/.test(css), 'H4 single-row grid widened for the currency cell');
  // deal-price rounding uses the row's pricing_list currency, not the site currency
  ok(/_evtRoundMoney\(r\.regularPrice \* \(1 - pct \/ 100\), r\.currency\)/.test(js) && /_evtRoundMoney\(r\.regularPrice \* \(1 - num \/ 100\), r\.currency\)/.test(js), 'H5 Deal Price uses the Regular row currency (no site guess, no FX)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll FC Summary pricing/currency assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
