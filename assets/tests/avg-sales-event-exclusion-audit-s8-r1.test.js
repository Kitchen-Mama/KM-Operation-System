// S8-AVG-SALES-EVENT-EXCLUSION-AUDIT-R1 — does Avg. Sales/day exclude Special Event and Campaign dates?
//
// Run: node assets/tests/avg-sales-event-exclusion-audit-s8-r1.test.js
//
// AUDIT SUITE. It asserts the BEHAVIOUR of the shipped §22 engine
// (assets/js/core/supply-planning-calculations.js -> normalizedAvgSalesPerDay), executed, plus the page-side
// wiring that decides what the Site Inventory column actually shows.
//
// The dated scenario the audit asked for is §B: synthetic sales covering 2026-10-06 and 2026-10-07, including
// dates with no imported row at all, against calcDate 2026-10-08 (window = [2026-07-10, 2026-10-07]).
// Nothing is written anywhere; every fixture is local to this file.
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var KMCALC = require('../js/core/supply-planning-calculations.js');
var passed = 0, failed = 0;
function ok(c, m) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }
function near(a, b, m) { ok(typeof a === 'number' && Math.abs(a - b) < 1e-9, m + '  (got ' + a + ', want ' + b + ')'); }

var IR = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');

// ---- fixture builders --------------------------------------------------------------------------------------
var SCOPE = { marketplaceSkuId: 'MSKU-1', marketplaceId: 'MP-US-AMZ', sku: 'SKU-A',
  company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' };
var CALC = '2026-10-08';                       // "today" — excluded from the window by contract

function iso(d) { return d.toISOString().slice(0, 10); }
function daysBack(from, n) { var d = new Date(from + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return iso(d); }

// 30 completed days ending 2026-10-07 (= calc − 1), 10 units each unless overridden.
function dailyRun(overrides, omit) {
  var rows = [];
  for (var n = 1; n <= 30; n++) {
    var date = daysBack(CALC, n);
    if (omit && omit.indexOf(date) !== -1) continue;              // a MISSING source date — not a zero
    var units = (overrides && Object.prototype.hasOwnProperty.call(overrides, date)) ? overrides[date] : 10;
    rows.push({ date: date, sku: 'SKU-A', units: units, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' });
  }
  return rows;
}
function campaign(start, end, extra) {
  var c = { status: 'active', start: start, end: end,
    skuLines: [{ marketplaceSkuId: 'MSKU-1', sku: 'SKU-A' }] };
  return Object.assign(c, extra || {});
}
function event(start, end, extra) {
  var e = { status: 'active', start: start, end: end, sku: 'SKU-A', marketplaceId: 'MP-US-AMZ' };
  return Object.assign(e, extra || {});
}
function run(o) {
  return KMCALC.normalizedAvgSalesPerDay({
    calcDate: CALC, scope: SCOPE, weekly7d: (o && o.weekly7d != null) ? o.weekly7d : 700,
    dailySales: (o && o.dailySales) || dailyRun(), campaigns: (o && o.campaigns) || [], events: (o && o.events) || []
  });
}

// =============================================================================================================
section('A — THE WINDOW AND THE BASELINE');
// =============================================================================================================
var base = run({});
eq(base.source, 'normalized_30d', 'A1  with 30 clean days the source is normalized_30d, not weekly_7d');
eq(base.warning, '', 'A2  and carries no warning');
eq(base.normalDayCount, 30, 'A3  all 30 completed days are eligible');
near(base.avgSalesPerDay, 10, 'A4  avg = sum / ACTUAL normal_day_count');
eq(base.excludedDates, [], 'A5  no contamination -> ZERO excluded dates (not a weekly fallback)');

// Today is excluded; the far boundary is inclusive.
var withToday = dailyRun().concat([{ date: CALC, sku: 'SKU-A', units: 9999, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' }]);
near(run({ dailySales: withToday }).avgSalesPerDay, 10, 'A6  the calc date itself (2026-10-08) is NEVER sampled');
var d90 = daysBack(CALC, 90), d91 = daysBack(CALC, 91);
var edge = dailyRun().concat([
  { date: d90, sku: 'SKU-A', units: 100, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' },
  { date: d91, sku: 'SKU-A', units: 100, company: 'KM', country: 'US', marketplace: 'Amazon', channel: 'Amazon' }]);
var edgeRes = run({ dailySales: edge });
eq(edgeRes.normalDayCount, 30, 'A7  the sample is capped at the LATEST 30 eligible days (' + d90 + ' is in-window but not selected)');
near(edgeRes.avgSalesPerDay, 10, 'A8  ... so an older in-window day cannot dilute the latest-30 sample');

// =============================================================================================================
section('B — THE DATED SCENARIO: 2026-10-06 and 2026-10-07, with missing days');
// =============================================================================================================
var SPIKE = { '2026-10-06': 100, '2026-10-07': 200 };

// B0 — what the number would be if nothing were excluded. This is the defect the rule exists to prevent.
var contaminated = run({ dailySales: dailyRun(SPIKE) });
near(contaminated.avgSalesPerDay, (28 * 10 + 100 + 200) / 30, 'B0  UNEXCLUDED, the two spike days pull the rate to 19.33');

// B1 — a Campaign on 2026-10-06 and a Special Event on 2026-10-07, both for THIS marketplace SKU.
var b1 = run({ dailySales: dailyRun(SPIKE),
  campaigns: [campaign('2026-10-06', '2026-10-06')],
  events: [event('2026-10-07', '2026-10-07')] });
eq(b1.excludedDates, ['2026-10-06', '2026-10-07'], 'B1  BOTH dates are excluded, and named as evidence');
eq(b1.normalDayCount, 28, 'B2  the denominator drops to the ACTUAL eligible count (28), not a fixed 30');
near(b1.avgSalesPerDay, 10, 'B3  numerator AND denominator both drop -> the spike cannot inflate the rate');
eq(b1.source, 'normalized_30d', 'B4  still normalized_30d');

// B4b — a date with NO imported row is not a zero and is not an eligible day.
var b4 = run({ dailySales: dailyRun(SPIKE, ['2026-10-05']),
  campaigns: [campaign('2026-10-06', '2026-10-06')], events: [event('2026-10-07', '2026-10-07')] });
eq(b4.normalDayCount, 27, 'B5  a MISSING source date is simply absent from the sample');
near(b4.avgSalesPerDay, 10, 'B6  ... and is never counted as a zero-sales day (the rate is unchanged)');

// B4c — a CONFIRMED zero-sales day IS eligible and DOES lower the rate. The two must not behave alike.
var zero = {}; Object.keys(SPIKE).forEach(function (k) { zero[k] = SPIKE[k]; }); zero['2026-10-05'] = 0;
var b7 = run({ dailySales: dailyRun(zero),
  campaigns: [campaign('2026-10-06', '2026-10-06')], events: [event('2026-10-07', '2026-10-07')] });
eq(b7.normalDayCount, 28, 'B7  a confirmed zero-sales row IS an eligible day');
near(b7.avgSalesPerDay, 270 / 28, 'B8  ... and lowers the average — missing and zero are NOT the same');

// =============================================================================================================
section('C — SCOPE ISOLATION: only this SKU and this site');
// =============================================================================================================
// C1 — a campaign line for a DIFFERENT marketplace SKU must not contaminate this one.
var c1 = run({ dailySales: dailyRun(SPIKE),
  campaigns: [campaign('2026-10-06', '2026-10-06', { skuLines: [{ marketplaceSkuId: 'MSKU-2', sku: 'SKU-A' }] })] });
eq(c1.excludedDates, [], 'C1  another marketplace SKU\'s campaign excludes NOTHING here (matched by marketplace_sku_id, never master sku)');

// C2 — an event for another site (different marketplace_id) must not contaminate.
var c2 = run({ dailySales: dailyRun(SPIKE), events: [event('2026-10-07', '2026-10-07', { marketplaceId: 'MP-CA-AMZ' })] });
eq(c2.excludedDates, [], 'C2  another site\'s event excludes NOTHING (marketplace_id is authoritative)');

// C3 — an event for another master SKU must not contaminate.
var c3 = run({ dailySales: dailyRun(SPIKE), events: [event('2026-10-07', '2026-10-07', { sku: 'SKU-B' })] });
eq(c3.excludedDates, [], 'C3  another SKU\'s event excludes NOTHING');

// C4 — another company's daily rows are never sampled (US holds both KM and ResUS).
var c4rows = dailyRun().concat([{ date: '2026-10-07', sku: 'SKU-A', units: 5000, company: 'ResUS', country: 'US', marketplace: 'Amazon', channel: 'Amazon' }]);
var threw = null; try { run({ dailySales: c4rows }); } catch (e) { threw = String(e.message); }
ok(threw && /ambiguous|duplicate/i.test(threw), 'C4  two companies on ONE source natural key FAIL CLOSED rather than silently merging  (' + (threw || 'no throw') + ')');

// =============================================================================================================
section('D — STATUS, OVERLAP AND BOUNDARIES');
// =============================================================================================================
// D1 — a cancelled campaign/event removes nothing.
var d1 = run({ dailySales: dailyRun(SPIKE),
  campaigns: [campaign('2026-10-06', '2026-10-06', { status: 'cancelled' })],
  events: [event('2026-10-07', '2026-10-07', { status: 'cancelled' })] });
eq(d1.excludedDates, [], 'D1  a cancelled Campaign and a cancelled Event exclude NOTHING');
near(d1.avgSalesPerDay, (28 * 10 + 100 + 200) / 30, 'D2  ... so the contaminated rate is returned, by rule');

// D3 — overlap counted ONCE.
var d3 = run({ dailySales: dailyRun(SPIKE),
  campaigns: [campaign('2026-10-06', '2026-10-07')], events: [event('2026-10-06', '2026-10-07')] });
eq(d3.excludedDates, ['2026-10-06', '2026-10-07'], 'D3  a Campaign and an Event over the SAME dates exclude them exactly once');
eq(d3.normalDayCount, 28, 'D4  ... and the denominator drops by 2, never by 4');

// D5 — range inclusivity at BOTH ends.
var d5 = run({ dailySales: dailyRun(), campaigns: [campaign('2026-10-05', '2026-10-07')] });
eq(d5.excludedDates, ['2026-10-05', '2026-10-06', '2026-10-07'], 'D5  start and end dates are BOTH inclusive');

// D6 — a range reaching past the window edge is clipped to the window.
var d6 = run({ dailySales: dailyRun(), events: [event('2026-10-07', '2026-12-31')] });
eq(d6.excludedDates, ['2026-10-07'], 'D6  a range extending beyond the window is clipped, not rejected');

// =============================================================================================================
section('E — THE FALLBACK LADDER (§22.3)');
// =============================================================================================================
function ladder(eligibleDays) {
  // Contaminate every day except `eligibleDays` of them.
  var rows = dailyRun();
  var keep = rows.slice(0, eligibleDays).map(function (r) { return r.date; });
  var camps = rows.filter(function (r) { return keep.indexOf(r.date) === -1; })
    .map(function (r) { return campaign(r.date, r.date); });
  return run({ dailySales: rows, campaigns: camps, weekly7d: 700 });
}
var e7 = ladder(7);
eq(e7.source, 'normalized_30d', 'E1  7 eligible days -> normalized_30d');
eq(e7.warning, '', 'E2  ... with no warning');
var e5 = ladder(5);
eq(e5.source, 'normalized_30d', 'E3  5 eligible days -> still normalized_30d');
eq(e5.warning, 'low_sample_warning', 'E4  ... with low_sample_warning');
var e2 = ladder(2);
eq(e2.source, 'weekly_7d', 'E5  2 eligible days -> weekly_7d fallback');
eq(e2.warning, 'insufficient_normal_days', 'E6  ... with insufficient_normal_days');
near(e2.avgSalesPerDay, 100, 'E7  ... and the value is weekly7d / 7');

// =============================================================================================================
section('F — WHAT THE SITE INVENTORY COLUMN ACTUALLY SHOWS (page wiring, source-read)');
// =============================================================================================================
ok(!/KMCALC\.normalizedAvgSalesPerDay/.test(IR), 'F1  the page authors NO rate of its own — it carries the server value');
ok(/horizonBasis: \(L\.horizonBasis/.test(IR), 'F2  the canonical basis is carried from the workspace read');
// The fields the page KEEPS from horizonBasis.
var hb = IR.slice(IR.indexOf('horizonBasis: (L.horizonBasis'), IR.indexOf('horizonBasis: (L.horizonBasis') + 420);
ok(/demandMode/.test(hb) && /avgSalesPerDay/.test(hb), 'F3  demandMode and avgSalesPerDay ARE carried');
// S8-AVG-SALES-DISPLAY-R2 — F4-F9 RECORDED FOUR DIFFS AND A DEFAULT. ALL FIVE ARE NOW REPAIRED, so these
// assertions flip from "this is broken" to "this stays fixed". The audit that found them is kept above it in
// full: §A-§E still execute the engine, and they are what proves the fix did not change the maths.
var hbCarry = IR.slice(IR.indexOf('horizonBasis: (L.horizonBasis'), IR.indexOf('horizonBasis: (L.horizonBasis') + 1600);
ok(/\bsource:/.test(hbCarry), 'F4  FIXED: `source` is carried — normalized_30d can be told from weekly_7d');
ok(/\bwarning:/.test(hbCarry), 'F5  FIXED: `warning` is carried — low_sample_warning reaches the screen');
ok(/normalDayCount:/.test(hbCarry), 'F6  FIXED: `normalDayCount` is carried — the ACTUAL denominator is visible');
ok(/excludedDates:/.test(hbCarry), 'F7  FIXED: `excludedDates` is carried — the exclusion evidence is visible');
// §22.3 keeps source and warning as INDEPENDENT fields; they must not be fused into one token on the way out.
ok(!/source.{0,40}warning.{0,10}:/.test(hbCarry.replace(/\s+/g, ' ')) || /source:[\s\S]{0,200}warning:/.test(hbCarry),
  'F7a ... and they remain separate fields, never combined into one token (§22.3)');
// The weekly default is gone from the display path.
ok(!/var _avgDisplay = avg\.toFixed\(1\);/.test(IR),
  'F8  FIXED: the column no longer DEFAULTS to the weekly rate (sales_units_7d / 7)');
ok(/var _avgDisplay = '--';/.test(IR), 'F8a ... it opens at -- until a canonical rate exists');
ok(!/_canonBasis && _canonBasis\.demandMode === 'sales_driven'/.test(IR),
  'F9  FIXED: the canonical rate is no longer gated on demand mode — §22.4 applies it to Forecast-Driven too');
ok(/if \(_cr != null\)/.test(IR),
  'F10 a SKU with no canonical rate shows -- rather than a silent weekly number');

console.log('\nPASS ' + passed + '  FAIL ' + failed);
if (failed) process.exitCode = 1;
