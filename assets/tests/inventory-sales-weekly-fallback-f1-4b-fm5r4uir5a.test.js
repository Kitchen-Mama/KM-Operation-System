// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5A Sales-basis weekly-fallback reachability + UI polish.
// Run: node assets/tests/inventory-sales-weekly-fallback-f1-4b-fm5r4uir5a.test.js
// -----------------------------------------------------------------------------
// §1/§2 ROOT CAUSE of the live CO1100-R BLOCKED: the Inventory UI's Avg Sales/day reads the WEEKLY snapshot
//   (salesUnits7d/7 ≈ 178.4), but the canonical recoWsResolveSalesRate_ returned SALES_BASIS_UNAVAILABLE the
//   instant there were 0 scoped DAILY rows — so the frozen "<3 NORMAL days → weekly_7d ÷ 7" rung was UNREACHABLE
//   for a weekly-only SKU. Fix: resolve the channel from daily when present, else from weekly, and only fail-close
//   when NEITHER source has rows. KMCALC then applies the ladder (empty dailySales + weekly7d → weekly7d/7),
//   reconciling the canonical rate with the UI. No forecast fallback, no fabricated value, no new engine.
// §3 the normal Recommendation Summary shows a user-safe "Calculation unavailable" (no raw internal codes).
// §7 the active-row blue highlight paints every cell (full logical row under horizontal scroll).
// §9 header logo +15% (36→41px height / 150→172px width), aspect ratio preserved.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var LAYOUT = read('css/layout.css');
var INDEX = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F42 + '\n return { resolveRate: recoWsResolveSalesRate_ };'))();
function snap(headers, rows) { return { headers: headers, rows: rows }; }
var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };   // the live scope

function facts(dailyRows, weeklyRows) {
  return {
    marketplaceSkus: snap(mskHdr, [['ResUS', 'US', 'Amazon', 'CO1100-R', 'MSK-1', 'sales_driven']]),
    amazonDailySalesSnapshot: snap(dsHdr, dailyRows || []),
    amazonWeeklySalesSnapshot: snap(wkHdr, weeklyRows || []),
    marketplaces: snap(MKT_H, [['MP1', 'ResUS', 'US', 'Amazon']])
  };
}

section('§1/§2 weekly-only SKU: 0 daily rows + a weekly row → READY via the weekly_7d rung (reconciles with the UI)');
var weeklyOnly = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'US', 'Amazon', 'amazon.com', 'CO1100-R', 1249]]), SCOPE, 'CO1100-R', '2026-08-07');
ok(weeklyOnly.ok === true, 'A1 a weekly-only Sales-Driven SKU now RESOLVES (was a false SALES_BASIS_UNAVAILABLE)');
ok(Math.abs(weeklyOnly.avgSalesPerDay - 1249 / 7) < 1e-9, 'A2 the canonical rate = weekly_7d ÷ 7 (≈178.43), the SAME source the UI Avg Sales/day uses');
ok(weeklyOnly.source === 'weekly_7d', 'A3 the selected rung is weekly_7d (the frozen <3-normal-day fallback)');

section('§1 genuinely no basis stays BLOCKED (no daily AND no weekly)');
var none = H.resolveRate(facts([], []), SCOPE, 'CO1100-R', '2026-08-07');
ok(none.ok === false && none.reason === 'SALES_BASIS_UNAVAILABLE', 'B1 no daily AND no weekly → SALES_BASIS_UNAVAILABLE (truthful)');
ok(/no daily or weekly rows/.test(none.detail || ''), 'B2 the diagnostic detail names the real gap (neither source present)');

section('§1 daily path unchanged: ≥3 normal daily days → normalized_30d (weekly not consulted)');
var d = ['2026-07-28', '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03'];
var dailyRows = d.map(function (x) { return [x, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 100]; });
var dailyReady = H.resolveRate(facts(dailyRows, []), SCOPE, 'CO1100-R', '2026-08-07');
ok(dailyReady.ok === true && dailyReady.source === 'normalized_30d' && Math.abs(dailyReady.avgSalesPerDay - 100) < 1e-9, 'C1 with ≥3 normal daily days the normalized_30d rung is used (avg 100), weekly untouched');

section('§1 ambiguous channel still fails closed (rule unchanged)');
var ambig = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'US', 'Amazon', 'amazon.com', 'CO1100-R', 700], ['2026-W31', '2026-08-02', 'US', 'Amazon', 'walmart.com', 'CO1100-R', 500]]), SCOPE, 'CO1100-R', '2026-08-07');
ok(ambig.ok === false && ambig.reason === 'SALES_BASIS_AMBIGUOUS', 'D1 weekly rows with 2 channels → SALES_BASIS_AMBIGUOUS (single-channel rule preserved)');

section('§1 the reader routes channel from daily-else-weekly (source structure)');
ok(/var chSource = daily\.length \? daily : weeklyAll;/.test(F42), 'E1 channel source = daily when present, else weekly');
ok(/if \(!chSource\.length\) return \{ ok: false, reason: 'SALES_BASIS_UNAVAILABLE'/.test(F42), 'E2 fail-closed only when NEITHER source has rows');

section('§3 normal UI shows a user-safe note (no raw internal codes)');
ok(/var reason = \(st && st !== 'READY'\) \? 'Calculation unavailable' : null;/.test(JS), 'U3 BLOCKED/ERROR rows render "Calculation unavailable" in the summary Note (raw code stays in the DB + Diagnostics)');
ok(!/h\.note = 'SALES_BASIS/.test(JS), 'U3b no raw SALES_BASIS_* string is emitted into the normal outlook Note');

section('§7 active blue highlight paints every logical-row cell (full width under horizontal scroll)');
ok(/\.scroll-row\.is-active-selected \.scroll-cell,[\s\S]*?background:\s*#EAF2FE/.test(CSS), 'U7 the active state is applied per-cell (off-screen cells stay blue after horizontal scroll)');

section('§9 header logo +15% (aspect ratio preserved)');
ok(/logo-text img\s*\{[^}]*max-height:\s*41px/.test(LAYOUT), 'U9a logo max-height 36→41px (+15%)');
ok(/logo-text img\s*\{[^}]*width:\s*auto/.test(LAYOUT), 'U9b width:auto preserves aspect ratio');
ok(/max-width:\s*172px/.test(INDEX), 'U9c logo max-width 150→172px (+15%) — both bounds scaled together');

console.log('\n----------------------------------------');
console.log('R5A SALES WEEKLY-FALLBACK + UI (F1-4B-FM5-R4UI-R5A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
