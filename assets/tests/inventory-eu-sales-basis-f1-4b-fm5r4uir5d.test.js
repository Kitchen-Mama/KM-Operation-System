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
// Seven sparse selling days in the fixed 30-calendar-day window; remaining normal days are zero-sale days.
function calendarRate(units) { return units * DATES.length / 30; }

var H = (new Function(BUNDLE + '\n' + F42 + '\n return { resolveRate: recoWsResolveSalesRate_, KMCID: KMCID };'))();
function snap(h, r) { return { headers: h, rows: r }; }
var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];
var DATES = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
var CALC = '2026-08-07';

// facts(dailyRows, weeklyRows, scope) — marketplaceSkus/marketplaces seeded for the given scope country.
// CP2X-R2 D - wrapped in the read ENVELOPE, because the three per-SKU helpers now take `read`
// and reach the per-request row cache through recoWsRows_. Each call builds a fresh envelope, so
// no case shares a cache with another.
function facts(dailyRows, weeklyRows, scope) {
  return { snapshots: {
    marketplaceSkus: snap(mskHdr, [[scope.company, scope.country, scope.marketplace, 'CO1100-R', 'MSK-1', 'sales_driven']]),
    amazonDailySalesSnapshot: snap(dsHdr, dailyRows || []),
    amazonWeeklySalesSnapshot: snap(wkHdr, weeklyRows || []),
    marketplaces: snap(MKT_H, [['MP1', scope.company, scope.country, scope.marketplace]])
  } };
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
ok(A.ok === true && A.source === 'normalized_30d' && near(A.avgSalesPerDay, calendarRate(100)), 'A EU source uses fixed calendar-30 denominator');
var B = H.resolveRate(facts(dailyFor('FR', 50), [], EU), EU, 'CO1100-R', CALC);
ok(B.ok === true && near(B.avgSalesPerDay, calendarRate(50)), 'B FR source uses fixed calendar-30 denominator');

section('§5 C — EU multi-country same-day daily summed ONCE (never averaged, never double-counted)');
var C = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
ok(C.ok === true && near(C.avgSalesPerDay, calendarRate(140)), 'C member sales summed once then divided by 30');

section('EU weekly-only: unavailable under the calendar-30 policy');
var wk = [['2026-W31', '2026-08-02', 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 700], ['2026-W31', '2026-08-02', 'ES', 'Amazon', 'amazon.es', 'CO1100-R', 549]];
var D = H.resolveRate(facts([], wk, EU), EU, 'CO1100-R', CALC);
ok(D.ok === false && D.reason === 'SALES_BASIS_UNAVAILABLE', 'D weekly-only is unavailable: cannot exclude campaign days from a weekly aggregate');

section('§5 E — EU source EXCLUDES non-member / unrelated countries');
var E = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('JP', 9999)).concat(dailyFor('PL', 9999)), [], EU), EU, 'CO1100-R', CALC);
ok(E.ok === true && near(E.avgSalesPerDay, calendarRate(100)), 'E non-members excluded before calendar-30 normalization');

section('§5 F — company isolation (structural: the daily snapshot has no company column; scope.company is stamped, never used to pool)');
ok(!/amazonDailySalesSnapshot[\s\S]{0,200}r\.company/.test(F42) && /company: scope\.company/.test(F42), 'F the daily/weekly filter never reads r.company (one scope = one company); scope.company is stamped onto the series for downstream identity');

section('§5 G/H — marketplace + SKU isolation preserved under EU aggregation');
var G = H.resolveRate(facts(dailyFor('DE', 100).concat(DATES.map(function (d) { return [d, 'DE', 'Walmart', 'walmart.de', 'CO1100-R', 9999]; })), [], EU), EU, 'CO1100-R', CALC);
ok(G.ok === true && near(G.avgSalesPerDay, calendarRate(100)), 'G other marketplace excluded');
var Hh = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('DE', 9999, 'amazon.de', 'OTHER-SKU')), [], EU), EU, 'CO1100-R', CALC);
ok(Hh.ok === true && near(Hh.avgSalesPerDay, calendarRate(100)), 'H other SKU excluded');

section('§5 I — channel isolation preserved for SINGLE markets (unchanged; EU intentionally rolls up member sites)');
var DEscope = { company: 'ResEU', country: 'DE', marketplace: 'Amazon' };
var twoCh = DATES.map(function (d) { return [d, 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 100]; }).concat(DATES.map(function (d) { return [d, 'DE', 'Amazon', 'fbm.de', 'CO1100-R', 50]; }));
var I = H.resolveRate(facts(twoCh, [], DEscope), DEscope, 'CO1100-R', CALC);
ok(I.ok === false && I.reason === 'SALES_BASIS_AMBIGUOUS', 'I a single-market DE scope with 2 channels still fails closed AMBIGUOUS (single-market channel rule unchanged)');

section('§5 J/K/L — non-EU scopes UNCHANGED');
var US = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
var J = H.resolveRate(facts(dailyFor('US', 100, 'amazon.com'), [], US), US, 'CO1100-R', CALC);
ok(J.ok === true && J.source === 'normalized_30d' && near(J.avgSalesPerDay, calendarRate(100)), 'J US uses the same calendar-30 normalization');
var CA = { company: 'ResCA', country: 'CA', marketplace: 'Amazon' };
var K = H.resolveRate(facts(dailyFor('CA', 80, 'amazon.ca'), [], CA), CA, 'CO1100-R', CALC);
ok(K.ok === true && near(K.avgSalesPerDay, calendarRate(80)), 'K CA uses the same calendar-30 normalization');
var UK = { company: 'ResUK', country: 'UK', marketplace: 'Amazon' };
var L = H.resolveRate(facts(dailyFor('GB', 60, 'amazon.co.uk'), [], UK), UK, 'CO1100-R', CALC);
ok(L.ok === true && near(L.avgSalesPerDay, calendarRate(60)), 'L UK/GB identity preserved under calendar-30 normalization');

section('§5 M — Forecast-Driven never reaches the sales resolver  [RESTATED S8-R5-B / R46]');
// S8-R5-B — THIS ASSERTED THE DEFECT AS IF IT WERE THE CONTRACT, AND R46 IS THE ROUND THAT SAYS SO.
//
// The original M asserted that recoWsResolveSalesRate_ sits behind `planModel === 'sales_driven'` on BOTH
// paths, and called that "forecast-driven untouched". It was a faithful description of the code — but the
// thing it was protecting is exactly what made Forecast-Driven Avg Sales impossible: the resolver was never
// CALLED, so there was no historical rate in existence to display. Avg Sales is a HISTORICAL metric and
// never depended on the Planning Model.
//
// What this suite is actually FOR — EU/CA/UK scope isolation and the sales-driven PLANNING basis — is
// untouched by R46 and is still asserted by §§1-4 above, unchanged. So M is restated to assert the thing
// that still matters here and is still true: Forecast-Driven planning demand never acquires a sales basis.
ok(/if \(planModel === 'sales_driven'\) \{ if \(sr\.ok\) salesRate = sr\.avgSalesPerDay;/.test(F42),
  'M  the sales PLANNING basis (salesRate) is still assigned only under planModel === sales_driven — '
  + 'Forecast-Driven demand is untouched, which is what this suite protects');
ok(/^\s*var sr = recoWsResolveSalesRate_\(/m.test(F42),
  'M1 ...while the RESOLVER itself is no longer gated (R46) — it runs for every SKU so the historical rate '
  + 'can be DISPLAYED in both modes, which is a different question from which demand drives planning');
// S8-B3-R3-CP2S-R1 - SUPERSEDED, AND THE OLD ASSERTION DESCRIBED THE GAP RATHER THAN A RULE. "The warehouse
// path publishes no horizonBasis, so there was no reason to touch it" was true and was the reason a
// self_fulfilled site - routed to the WAREHOUSE lane and so producing no marketplace line at all - showed the
// same dash for "no historical average was sent" as for "this site had no sales". The resolver now runs for
// BOTH modes in that lane too. What this suite actually protects is untouched and is asserted immediately
// above: the PLANNING basis (whSalesRate) is still assigned only under sales_driven, so Forecast-Driven
// demand still never acquires one.
// CP2X-R2 D - `snaps` -> `read`, for the reason above; the claim is about the WAREHOUSE lane calling
// the resolver for both modes, and that is unchanged.
ok(/var wsr = recoWsResolveSalesRate_\(read, scope, sku, calc\.calculationDate\);/.test(F42),
  'M2 the WAREHOUSE lane resolves the historical rate for BOTH modes (CP2S-R1) - displaying a rate and '
  + 'driving demand with it are different questions');
ok(/if \(whPlanModel === 'sales_driven'\) \{ if \(wsr\.ok\) whSalesRate = wsr\.avgSalesPerDay;/.test(F42),
  'M2a while whSalesRate - the PLANNING input - is still assigned only under sales_driven');

section('§5 N — identical recalc → identical READY result (deterministic)');
var n1 = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
var n2 = H.resolveRate(facts(dailyFor('DE', 100).concat(dailyFor('FR', 40)), [], EU), EU, 'CO1100-R', CALC);
ok(JSON.stringify(n1) === JSON.stringify(n2), 'N two identical EU recalcs return byte-identical results');

section('§4 — missing ≠ zero; genuinely no EU source stays BLOCKED');
var none = H.resolveRate(facts([], [], EU), EU, 'CO1100-R', CALC);
ok(none.ok === false && none.reason === 'SALES_BASIS_UNAVAILABLE' && /EU source set \[IT,DE,ES,FR\]/.test(none.detail || ''), 'Z no eligible daily AND no eligible weekly → truthful SALES_BASIS_UNAVAILABLE (never a fabricated 0)');
var zero = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'DE', 'Amazon', 'amazon.de', 'CO1100-R', 0]], EU), EU, 'CO1100-R', CALC);
ok(zero.ok === false && zero.reason === 'SALES_BASIS_UNAVAILABLE', 'Z2 a weekly zero cannot prove a calendar-30 daily zero');

console.log('\n----------------------------------------');
console.log('R5D EU SALES BASIS (F1-4B-FM5-R4UI-R5D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
