'use strict';
// Offline execution over a separately captured read-only source snapshot. No network or DB writer.
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../..');
const calc = require('../js/core/supply-planning-calculations');
const country = require('../js/core/supply-planning-country-identity');
const calendar = require('../js/core/supply-planning-site-calendar');
const [inputPath, outputPath, instantText] = process.argv.slice(2);
if (!inputPath || !outputPath || !Number.isFinite(Date.parse(instantText))) throw Error('Usage: node audit-site-sales.cjs input.json report.json instant-ISO');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const source = fs.readFileSync(path.join(root, 'assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs'), 'utf8');
const resolve = new Function('KMCALC', 'KMCID', source + '\nreturn recoWsResolveSalesRate_;')(calc, country);
const names = { amazon_daily_sales_snapshot: 'amazonDailySalesSnapshot', amazon_weekly_sales_snapshot: 'amazonWeeklySalesSnapshot',
  fc_special_events: 'fcSpecialEvents', campaigns: 'campaigns', campaign_sku_lines: 'campaignSkuLines', marketplace_skus: 'marketplaceSkus', marketplaces: 'marketplaces' };
const snapshots = {};
for (const [tab, rs] of Object.entries(data)) {
  if (!names[tab] || !rs.length) continue;
  const headers = Object.keys(rs[0]); snapshots[names[tab]] = { headers, rows: rs.map(r => headers.map(k => r[k] ?? '')) };
}
const rows = [], summary = {};
for (const mapping of data.marketplace_skus) {
  if (!mapping.company || !mapping.country || !mapping.marketplace) continue;
  const scope = { company: mapping.company, country: mapping.country, marketplace: mapping.marketplace };
  const calculationDate = calendar.localDate(Date.parse(instantText), scope.country);
  const result = resolve({ snapshots }, scope, mapping.sku, calculationDate);
  if (result.ok) {
    const members = country.sourceCountriesForScope(scope.country, scope.marketplace).members;
    const excluded = new Set(result.excludedDates);
    const units = data.amazon_daily_sales_snapshot.filter(r => r.sku === mapping.sku && r.marketplace === scope.marketplace
      && members.includes(country.canonicalCountryCode(r.country)) && r.snapshot_date >= result.windowStart
      && r.snapshot_date <= result.windowEnd && !excluded.has(r.snapshot_date)).reduce((s, r) => s + Number(r.sales_units), 0);
    const days = 30 - excluded.size, expected = units / days;
    result.reconciliation = { normalSalesUnits: units, normalDayCount: days, expectedAvg: expected,
      agrees: days === result.normalDayCount && units === result.normalSalesUnits && Math.abs(expected - result.avgSalesPerDay) < 1e-12 };
    if (!result.reconciliation.agrees) throw Error('SALES_RECONCILIATION_FAILED: ' + [scope.company, scope.country, scope.marketplace, mapping.sku].join('/'));
  }
  rows.push({ ...scope, sku: mapping.sku, calculationDate, ...result });
  const key = [scope.company, scope.country, scope.marketplace].join('/');
  const group = summary[key] || (summary[key] = { total: 0, ready: 0, unavailable: 0, reasons: {} });
  group.total++; group[result.ok ? 'ready' : 'unavailable']++;
  if (!result.ok) { const why = result.reason; group.reasons[why] = (group.reasons[why] || 0) + 1; }
}
fs.writeFileSync(outputPath, JSON.stringify({ instant: instantText, readOnly: true, summary, rows }, null, 2));
console.log(JSON.stringify({ summary, verifiedMath: rows.filter(r => r.reconciliation && r.reconciliation.agrees).length }, null, 2));
