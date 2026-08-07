// Kitchen Mama Operation System — Canonical Planning-Demand Owner (KMPD) — F1-4B-FM3f-1 (A/D/E/F).
// Run: node assets/tests/supply-planning-planning-demand-f1-4b-fm3f1.test.js
// -----------------------------------------------------------------------------
// Proves the canonical runtime planning-demand owner replicates the frozen page owners WITHOUT page-side math:
// E Target% (fc_target_rules matching + {month}_pct/target_percentage/100 fallback), F special-event prep-month
// (start−30d, 100%, counted once), D current-month remaining demand (adjusted daily × remaining days + prep-in-
// window special). Full precision; missing regular FC → omitted (never fabricated 0). Deterministic; clockless.

'use strict';
var KMPD = require('../js/core/supply-planning-planning-demand.js');
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
var SKU = 'CO1100-R';
var SKU_META = { sku: 'CO1100-R', series: 'CO', category: 'OPENER', company: 'KM' };
// fc_regular_forecast raw rows (month-abbrev columns). Aug 3100, Sep 7000, Oct 4282, Nov 7500, Dec 0.
function fcRows() { return [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', year: 2026, aug: 3100, sep: 7000, oct: 4282, nov: 7500, dec: 0 }]; }

// =============================================================================
section('E · Target % (frozen matching + fallback)');
ok(KMPD.resolveTargetPct([], SKU_META, SCOPE, '2026-09') === 100, 'E1 no rules → 100 (frozen default)');
ok(KMPD.resolveTargetPct([{ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', year: 2026, sep_pct: 80 }], SKU_META, SCOPE, '2026-09') === 80, 'E2 matching rule sep_pct=80 → 80');
ok(KMPD.resolveTargetPct([{ scope_id: 'CO1100-R', target_percentage: 90 }], SKU_META, SCOPE, '2026-09') === 90, 'E3 scope_id match, target_percentage fallback → 90');
ok(KMPD.resolveTargetPct([{ series: 'CO', target_percentage: 70 }], SKU_META, SCOPE, '2026-09') === 70, 'E4 series-scoped rule matches via skuMeta.series');
ok(KMPD.resolveTargetPct([{ sku: 'CO1100-R', country: 'ALL', target_percentage: 60 }], SKU_META, SCOPE, '2026-09') === 60, 'E5 country=ALL wildcard matches');
ok(KMPD.resolveTargetPct([{ sku: 'CO1100-R', company: 'OTHER', target_percentage: 50 }], SKU_META, SCOPE, '2026-09') === 100, 'E6 company mismatch → no match → 100');
ok(KMPD.resolveTargetPct([{ sku: 'CO1100-R', year: 2025, target_percentage: 50 }], SKU_META, SCOPE, '2026-09') === 100, 'E7 year mismatch → no match → 100');
var adj = KMPD.adjustedRegularFc(fcRows(), [{ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', year: 2026, sep_pct: 80 }], SKU_META, SCOPE, SKU, '2026-09');
ok(adj.base === 7000 && adj.targetPct === 80 && adj.adjusted === 5600, 'E8 adjusted Sep = round(7000 × 80%) = 5600');
ok(KMPD.adjustedRegularFc(fcRows(), [], SKU_META, SCOPE, SKU, '2026-12').adjusted === 0, 'E9 explicit 0 base @ 100% → 0 (valid zero, not missing)');
ok(KMPD.adjustedRegularFc(fcRows(), [], SKU_META, SCOPE, SKU, '2027-01') === null, 'E10 missing month FC → null (never fabricated 0)');

section('F · Special-event prep-month (start − 30d; 100%; once)');
ok(KMPD.eventPrepMonth({ event_start_date: '2026-09-25' }).ym === '2026-08', 'F1 start 2026-09-25 → prep month 2026-08 (−30d = 2026-08-26)');
ok(KMPD.eventPrepMonth({ event_start_date: '2026-09-25' }).prepDate === '2026-08-26', 'F2 prep date exact');
var evtSep = [{ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', event_start_date: '2026-10-01', fc_qty: 500, status: 'active' }]; // prep 2026-09-01
ok(KMPD.specialEventFcForMonth(evtSep, SCOPE, SKU, '2026-09') === 500, 'F3 event prep in Sep → +500 for Sep');
ok(KMPD.specialEventFcForMonth(evtSep, SCOPE, SKU, '2026-10') === 0, 'F4 not double-counted into the event month (only prep month)');
ok(KMPD.specialEventFcForMonth([{ sku: 'CO1100-R', event_start_date: '2026-10-01', fc_qty: 500, status: 'cancelled' }], SCOPE, SKU, '2026-09') === 0, 'F5 cancelled event excluded');
ok(KMPD.specialEventFcForMonth([{ sku: 'OTHER', event_start_date: '2026-10-01', fc_qty: 500, status: 'active' }], SCOPE, SKU, '2026-09') === 0, 'F6 other-SKU event excluded (no cross-SKU leak)');

section('canonical demand by month = adjusted regular + special (100% on special)');
var dm = KMPD.planningDemandByMonth({ fcRegularRows: fcRows(), fcTargetRuleRows: [{ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', year: 2026, sep_pct: 80 }], fcSpecialEventRows: evtSep, scope: SCOPE, sku: SKU, skuMeta: SKU_META, months: ['2026-09', '2026-10', '2026-11', '2026-12'] });
ok(dm['2026-09'].adjustedRegular === 5600 && dm['2026-09'].special === 500 && dm['2026-09'].demand === 6100, 'DM1 Sep demand = adjusted 5600 + special 500 = 6100 (special NOT target-adjusted)');
ok(dm['2026-10'].demand === 4282 && dm['2026-10'].targetPct === 100, 'DM2 Oct = 4282 @ 100% (no rule matches Oct → default)');
ok(!('2027-01' in dm), 'DM3 month without regular FC omitted (caller surfaces truthfully)');

section('D · current-month remaining demand (calc-date; daily; real month length)');
var cmr = KMPD.currentMonthRemainingDemand({ calculationDate: '2026-08-07', fcRegularRows: fcRows(), fcTargetRuleRows: [], fcSpecialEventRows: [], scope: SCOPE, sku: SKU, skuMeta: SKU_META });
ok(cmr.ready && cmr.ym === '2026-08' && cmr.daysInMonth === 31 && cmr.remainingDays === 24, 'D1 Aug: 31 days, remaining after the 7th = 24 (Aug 8–31)');
ok(cmr.dailyRate === 3100 / 31 && cmr.regularRemaining === (3100 / 31) * 24, 'D2 dailyRate = adjusted 3100/31; remaining = rate × 24 (full precision)');
ok(Math.round(cmr.regularRemaining) === 2400, 'D3 rounds to 2400 (100/day × 24)');
var cmrEvt = KMPD.currentMonthRemainingDemand({ calculationDate: '2026-08-07', fcRegularRows: fcRows(), fcTargetRuleRows: [], fcSpecialEventRows: [{ sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', event_start_date: '2026-09-19', fc_qty: 300, status: 'active' }], scope: SCOPE, sku: SKU, skuMeta: SKU_META });
ok(cmrEvt.special === 300, 'D4 special with prep 2026-08-20 (after the 7th) enters current-month remaining');
var febLeap = KMPD.currentMonthRemainingDemand({ calculationDate: '2028-02-10', fcRegularRows: [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R', year: 2028, feb: 2900 }], fcTargetRuleRows: [], scope: SCOPE, sku: SKU, skuMeta: SKU_META });
ok(febLeap.daysInMonth === 29 && febLeap.remainingDays === 19 && febLeap.dailyRate === 2900 / 29, 'D5 leap Feb-2028: 29 days, remaining 19, rate 100/day');

section('CO1100-R corrected planning inputs (source-proven fixture)');
var co = KMPD.planningDemandByMonth({ fcRegularRows: fcRows(), fcTargetRuleRows: [], fcSpecialEventRows: [], scope: SCOPE, sku: SKU, skuMeta: SKU_META, months: ['2026-09', '2026-10', '2026-11', '2026-12'] });
ok(co['2026-09'].demand === 7000 && co['2026-10'].demand === 4282 && co['2026-11'].demand === 7500 && co['2026-12'].demand === 0, 'CO T1–T4 demand @100% no special = 7000/4282/7500/0 (matches live monthly FC)');

section('clockless / non-mutating');
var srcP = read('js/core/supply-planning-planning-demand.js').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/Date\.now\(|new Date\(|Math\.random\(/.test(srcP), 'clockless (no Date.now/new Date/Math.random)');
var inp = { fcRegularRows: fcRows(), scope: SCOPE, sku: SKU, skuMeta: SKU_META, months: ['2026-09'] }; var snap = JSON.stringify(inp); KMPD.planningDemandByMonth(inp);
ok(JSON.stringify(inp) === snap, 'input not mutated');

console.log('\n----------------------------------------');
console.log('CANONICAL PLANNING-DEMAND (F1-4B-FM3f-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
