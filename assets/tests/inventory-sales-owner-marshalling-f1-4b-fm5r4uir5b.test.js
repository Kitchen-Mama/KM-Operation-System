// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5B canonical sales-basis owner marshalling repair.
// Run: node assets/tests/inventory-sales-owner-marshalling-f1-4b-fm5r4uir5b.test.js
// -----------------------------------------------------------------------------
// LIVE CO1100-R still wrote `SALES_BASIS_UNAVAILABLE: run-rate owner error` — the R7V catch(e2) branch, i.e. the
// frozen KMCALC.normalizedAvgSalesPerDay THREW even on the no-contamination retry. Root cause = the CALLER fed
// KMCALC inputs its strict identity contract rejects. Two proven marshalling defects fixed (owner math untouched):
//   1. snapshot_date passed as a Sheet JS Date object / 'YYYY/MM/DD' / 'M/D/YYYY' → KMCALC._parseIso throws
//      ("strict YYYY-MM-DD"). Fix: coerce to strict YYYY-MM-DD before the owner call (valid YMD unchanged).
//   2. a WEEKLY-ONLY basis (0 daily rows) with a BLANK channel → KMCALC's required-channel identity throws, even
//      though the weekly_7d rung's result never depends on channel. Fix: a stable 'WEEKLY_ONLY' token for that
//      exact case (daily-driven paths keep the real channel — identity NOT loosened).
// Plus: the real owner exception message is now surfaced in the detail (no more opaque "run-rate owner error").

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + F42 + '\n return { resolveRate: recoWsResolveSalesRate_ };'))();
function snap(h, r) { return { headers: h, rows: r }; }
var mskHdr = ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id', 'replenishment_model'];
var dsHdr = ['snapshot_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units'];
var wkHdr = ['snapshot_week', 'week_end_date', 'country', 'marketplace', 'channel', 'sku', 'sales_units_7d'];
var MKT_H = ['marketplace_id', 'company', 'country', 'marketplace'];
var SCOPE = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
function facts(dailyRows, weeklyRows) {
  return {
    marketplaceSkus: snap(mskHdr, [['ResUS', 'US', 'Amazon', 'CO1100-R', 'MSK-1', 'sales_driven']]),
    amazonDailySalesSnapshot: snap(dsHdr, dailyRows || []),
    amazonWeeklySalesSnapshot: snap(wkHdr, weeklyRows || []),
    marketplaces: snap(MKT_H, [['MP1', 'ResUS', 'US', 'Amazon']])
  };
}

section('§1 defect 2 — WEEKLY-ONLY basis with a BLANK channel now RESOLVES (the exact live run-rate-owner-error case)');
var blankCh = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'US', 'Amazon', '', 'CO1100-R', 1249]]), SCOPE, 'CO1100-R', '2026-08-07');
ok(blankCh.ok === true, 'A1 weekly-only + blank channel → READY (no more "run-rate owner error")');
ok(Math.abs(blankCh.avgSalesPerDay - 1249 / 7) < 1e-9 && blankCh.source === 'weekly_7d', 'A2 result = weekly_7d ÷ 7 ≈ 178.43 (channel irrelevant to the weekly rung)');

section('§1 defect 1 — a Sheet JS Date snapshot_date is coerced to strict YYYY-MM-DD (owner no longer throws)');
var d = [new Date(2026, 6, 28), new Date(2026, 6, 29), new Date(2026, 6, 30), new Date(2026, 6, 31), new Date(2026, 7, 1)];
var dateObjRows = d.map(function (x) { return [x, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 100]; });
var dateObj = H.resolveRate(facts(dateObjRows, []), SCOPE, 'CO1100-R', '2026-08-07');
ok(dateObj.ok === true && dateObj.source === 'normalized_30d' && Math.abs(dateObj.avgSalesPerDay - 100) < 1e-9, 'A3 daily rows with Date-OBJECT snapshot_date → READY normalized_30d (avg 100), not a false owner-error block');
var slashRows = ['2026/07/28', '2026/07/29', '2026/07/30', '2026/07/31', '2026/08/01'].map(function (x) { return [x, 'US', 'Amazon', 'amazon.com', 'CO1100-R', 50]; });
ok(H.resolveRate(facts(slashRows, []), SCOPE, 'CO1100-R', '2026-08-07').ok === true, 'A4 YYYY/MM/DD dates are also coerced → READY');

section('§1 the real owner exception is SURFACED (opaque "run-rate owner error" → named cause)');
var badDate = H.resolveRate(facts([['not-a-date', 'US', 'Amazon', 'amazon.com', 'CO1100-R', 100]], []), SCOPE, 'CO1100-R', '2026-08-07');
ok(badDate.ok === false && /^SALES_BASIS/.test(badDate.reason), 'A5 an unparseable date still fails closed (never fabricated)');
ok(/run-rate owner error: /.test(badDate.detail || '') && /YYYY-MM-DD/.test(badDate.detail || ''), 'A6 the detail now NAMES the exact owner exception (self-diagnosing live note)');

section('§1 identity NOT loosened — a DAILY-driven blank channel still fails closed (sentinel is weekly-only)');
var dailyBlank = ['2026-07-28', '2026-07-29', '2026-07-30'].map(function (x) { return [x, 'US', 'Amazon', '', 'CO1100-R', 100]; });
var dbc = H.resolveRate(facts(dailyBlank, []), SCOPE, 'CO1100-R', '2026-08-07');
ok(dbc.ok === false && /channel/.test(dbc.detail || ''), 'A7 daily rows with a blank channel → BLOCKED (surfaced channel-identity error) — the sentinel applies ONLY to the weekly-only path');

section('§1 unchanged behaviors preserved');
ok(H.resolveRate(facts([], []), SCOPE, 'CO1100-R', '2026-08-07').reason === 'SALES_BASIS_UNAVAILABLE', 'A8 no daily AND no weekly → SALES_BASIS_UNAVAILABLE');
var zero = H.resolveRate(facts([], [['2026-W31', '2026-08-02', 'US', 'Amazon', 'amazon.com', 'CO1100-R', 0]]), SCOPE, 'CO1100-R', '2026-08-07');
ok(zero.ok === true && zero.avgSalesPerDay === 0, 'A9 weekly valid-zero → 0/day (valid zero, not a block)');

section('§1 source structure — marshalling fixes present, owner untouched');
ok(/function toYmd\(v\)/.test(F42) && /calcDate: calcYmd/.test(F42), 'S1 date coercion helper + normalized calcDate wired into the owner call');
ok(/var kmcalcChannel = \(!daily\.length && !channel\) \? 'WEEKLY_ONLY' : channel;/.test(F42), 'S2 the blank-channel sentinel is gated to the weekly-only path');
ok(/channel: kmcalcChannel,/.test(F42), 'S3 the owner scope uses the sentinel-safe channel');
ok(/run-rate owner error: ' \+ ownerErr\(e2\)/.test(F42), 'S4 the real owner exception message is surfaced');

console.log('\n----------------------------------------');
console.log('R5B SALES OWNER MARSHALLING (F1-4B-FM5-R4UI-R5B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
