// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5D EU Sales-Basis region/country mapping repair.
// Run: node assets/tests/inventory-eu-sales-basis-f1-4b-fm5r4uir5d.test.js
// -----------------------------------------------------------------------------
// ROOT CAUSE: recoWsResolveSalesRate_ matched sales rows by EXACT canonical country (== scopeCountryC), so an EU
// planning scope (country='EU') never matched its DE/FR/IT/ES source rows → false SALES_BASIS_UNAVAILABLE → the
// Sales-Driven horizon fail-closed and the SKU materialized BLOCKED. FIX (marshalling only): match by canonical
// SOURCE-COUNTRY MEMBERSHIP via KMCID.sourceCountriesForScope (mirroring the FROZEN IRCountry.SALES_AGG authority
// EU=IT+DE+ES+FR, Amazon-only, no legacy country='EU' fallback), and AGGREGATE the eligible member rows ONCE
// (daily summed per date; weekly = per-member latest-week summed) before the SAME frozen KMCALC owner. No formula
// change, no forecast fallback, no UI aggregation, no new averaging engine. Single-market scopes are unchanged.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function near(a, b) { return Math.abs(a - b) < 1e-6; }

var H = (new Function(BUNDLE + '\n' + F42 + '\n return { resolveRate: recoWsResolveSalesRate_, KMCID: KMCID };'))();
function snap(h, r) { return { headers: h, rows: r }; }
var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];
var DATES = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
var CALC = '2026-08-07';

// facts(dailyRows, weeklyRows, scope) — marketplaceSkus/marketplaces seeded for the given scope country.
function facts(dailyRows, weeklyRows, scope) {
  return {
    marketplaceSkus: snap(mskHdr, [[scope.company, scope.country, scope.marketplace, 'CO1100-R', 'MSK-1', 'sales_driven']]),
    amazonDailySalesSnapshot: snap(dsHdr, dailyRows || []),
    amazonWeeklySalesSnapshot: snap(wkHdr, weeklyRows || []),
    marketplaces: snap(MKT_H, [['MP1', scope.company, scope.country, scope.marketplace]])
  };
}
function dailyFor(country, units, ch, sku) { return DATES.map(function (d) { return [d, country, 'Amazon', ch || ('amazon.' + country.toLowerCase()), sku || 'CO1100-R', units]; }); }
var EU = { company: 'ResEU', country: 'EU', marketplace: 'Amazon' };

// =============================================================================================================
section('§1 EU is a REGION, not a country alias (identity intact)');
ok(H.KMCID.canonicalCountryCode('EU') === 'EU', 'ID1 EU canonicalizes to EU (never DE/FR/IT/ES)');
ok(H.KMCID.countryMatches('EU', 'DE') === false && H.KMCID.countryMatches('EU', 'FR') === false, 'ID2 EU is NOT the same market as any member country (identity not loosened)');
var setEU = H.KMCID.sourceCountriesForScope('EU', 'Amazon');
ok(setEU.aggregate === true && setEU.members.join(',') === 'IT,DE,ES,FR', 'ID3 EU source set = IT,DE,ES,FR (frozen IRCountry.SALES_AGG authority), aggregate=true');
ok(H.KMCID.sourceCountriesForScope('EU', 'Walmart').aggregate === false, 'ID4 EU rolls up ONLY under Amazon (non-Amazon EU is not auto-aggregated)');
ok(H.KMCID.sourceCountriesForScope('US', 'Amazon').members.join(',') === 'US' && H.KMCID.sourceCountriesForScope('US', 'Amazon').aggregate === false, 'ID5 US → [US], single market');
ok(H.KMCID.sourceCountriesForScope('UK', 'Amazon').members.join(',') === 'GB', 'ID6 UK → [GB] (alias-aware), single market');

section('§5 A/B — EU scope matches member-country daily rows');
var A = H.resolveRate(facts(dailyFor('DE', 100), [], EU), EU, 'CO1100-R', CALC);
ok(A.ok === true && A.source === 'normalized_30d' && near(A.avgSalesPerDay, 100), 'A EU scope + DE daily → READY normalized_30d avg 100 (matched)');
var B = H.resolveRate(facts(dailyFor('FR', 50), [], EU), EU, 'CO1100-R', CALC);
ok(B.ok === true && near(B.avgSalesPerDay, 50), 'B EU scope + FR daily → READY avg 50 (matched)');

section('§5 C — EU multi-country same-day daily summed ONCE (never averaged, never double-counted)');
var C = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
ok(C.ok === true && near(C.avgSalesPerDay, 140), 'C DE(100)+FR(40) same 7 dates → per-day 140 → avg 140 (summed once, not 70-avg, not 100)');

section('§5 D — EU weekly-only across DE + ES → weekly fallback resolves (summed once ÷ 7)');
var wk = [['2026-W31', '2026-08-02', 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 700], ['2026-W31', '2026-08-02', 'ES', 'Amazon', 'amazon.es', 'CO1100-R', 549]];
var D = H.resolveRate(facts([], wk, EU), EU, 'CO1100-R', CALC);
ok(D.ok === true && D.source === 'weekly_7d' && near(D.avgSalesPerDay, 1249 / 7), 'D no daily + DE(700)+ES(549) weekly → weekly_7d (700+549)/7 ≈ 178.43');

section('§5 E — EU source EXCLUDES non-member / unrelated countries');
var E = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('JP', 9999)).concat(dailyFor('PL', 9999)), [], EU), EU, 'CO1100-R', CALC);
ok(E.ok === true && near(E.avgSalesPerDay, 100), 'E JP + PL rows (non-members) excluded → avg stays 100 (DE only)');

section('§5 F — company isolation (structural: the daily snapshot has no company column; scope.company is stamped, never used to pool)');
ok(!/amazonDailySalesSnapshot[\s\S]{0,200}r\.company/.test(F42) && /company: scope\.company/.test(F42), 'F the daily/weekly filter never reads r.company (one scope = one company); scope.company is stamped onto the series for downstream identity');

section('§5 G/H — marketplace + SKU isolation preserved under EU aggregation');
var G = H.resolveRate(facts(dailyFor('DE', 100).concat(DATES.map(function (d) { return [d, 'DE', 'Walmart', 'walmart.de', 'CO1100-R', 9999]; })), [], EU), EU, 'CO1100-R', CALC);
ok(G.ok === true && near(G.avgSalesPerDay, 100), 'G a DE/Walmart row is excluded from an EU/Amazon scope (marketplace isolation)');
var Hh = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('DE', 9999, 'amazon.de', 'OTHER-SKU')), [], EU), EU, 'CO1100-R', CALC);
ok(Hh.ok === true && near(Hh.avgSalesPerDay, 100), 'H a different-SKU DE row is excluded (SKU isolation)');

section('§5 I — channel isolation preserved for SINGLE markets (unchanged; EU intentionally rolls up member sites)');
var DEscope = { company: 'ResEU', country: 'DE', marketplace: 'Amazon' };
var twoCh = DATES.map(function (d) { return [d, 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 100]; }).concat(DATES.map(function (d) { return [d, 'DE', 'Amazon', 'fbm.de', 'CO1100-R', 50]; }));
var I = H.resolveRate(facts(twoCh, [], DEscope), DEscope, 'CO1100-R', CALC);
ok(I.ok === false && I.reason === 'SALES_BASIS_AMBIGUOUS', 'I a single-market DE scope with 2 channels still fails closed AMBIGUOUS (single-market channel rule unchanged)');

section('§5 J/K/L — non-EU scopes UNCHANGED');
var US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var J = H.resolveRate(facts(dailyFor('US', 100, 'amazon.com'), [], US), US, 'CO1100-R', CALC);
ok(J.ok === true && J.source === 'normalized_30d' && near(J.avgSalesPerDay, 100), 'J US scope + US daily → READY avg 100 (unchanged)');
var CA = { company: 'ResCA', country: 'CA', marketplace: 'Amazon' };
var K = H.resolveRate(facts(dailyFor('CA', 80, 'amazon.ca'), [], CA), CA, 'CO1100-R', CALC);
ok(K.ok === true && near(K.avgSalesPerDay, 80), 'K CA scope + CA daily → READY avg 80 (unchanged)');
var UK = { company: 'ResUK', country: 'UK', marketplace: 'Amazon' };
var L = H.resolveRate(facts(dailyFor('GB', 60, 'amazon.co.uk'), [], UK), UK, 'CO1100-R', CALC);
ok(L.ok === true && near(L.avgSalesPerDay, 60), 'L UK scope + GB daily → READY avg 60 (UK≡GB alias unchanged)');

section('§5 M — Forecast-Driven never reaches the sales resolver');
ok(/planModel === 'sales_driven'\) \{ var sr = recoWsResolveSalesRate_/.test(F42) && /whPlanModel === 'sales_driven'\) \{ var wsr = recoWsResolveSalesRate_/.test(F42), 'M recoWsResolveSalesRate_ is gated behind planModel === sales_driven on BOTH the marketplace + warehouse paths (forecast-driven untouched)');

section('§5 N — identical recalc → identical READY result (deterministic)');
var n1 = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
var n2 = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
ok(JSON.stringify(n1) === JSON.stringify(n2), 'N two identical EU recalcs return byte-identical results');

section('§4 — missing ≠ zero; genuinely no EU source stays BLOCKED');
var none = H.resolveRate(facts([], [], EU), EU, 'CO1100-R', CALC);
ok(none.ok === false && none.reason === 'SALES_BASIS_UNAVAILABLE' && /EU source set \[IT,DE,ES,FR\]/.test(none.detail || ''), 'Z no eligible daily AND no eligible weekly → truthful SALES_BASIS_UNAVAILABLE (never a fabricated 0)');
var zero = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 0]], EU), EU, 'CO1100-R', CALC);
ok(zero.ok === true && zero.avgSalesPerDay === 0, 'Z2 a real zero-sales EU weekly row → 0/day (valid zero, not a block)');

console.log('\n----------------------------------------');
console.log('R5D EU SALES BASIS (F1-4B-FM5-R4UI-R5D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
