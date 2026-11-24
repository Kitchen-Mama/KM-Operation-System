'use strict';
// Actual GS16/40/42 + canonical KMPS/KMCALC/KMCID; offline sheets, no config/secrets or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { extract } = require('./ad4/extract.cjs');
const core = path.resolve(__dirname, '../js/core');
const gs = path.resolve(__dirname, '../specs/active/apps-script');
const productionSource = require(path.join(core, 'supply-planning-production-source.js'));
const ctx = { console, KMCALC: require(path.join(core, 'supply-planning-calculations.js')),
  KMCID: require(path.join(core, 'supply-planning-country-identity.js')) };
vm.createContext(ctx);
for (const name of ['11_shipping_plan_handlers.gs', '16_shipping_allocation_handlers.gs', '42_api_v1_recommendation_workspace.gs', '40_api_v1_weekly_workspace.gs']) {
  vm.runInContext(fs.readFileSync(path.join(gs, name), 'utf8'), ctx, { filename: name });
}
const front = fs.readFileSync(path.join(__dirname, '../js/pages/shipping-plan.js'), 'utf8');
vm.runInContext(extract(front, n => ['_spLiveSiteMetrics_', '_spLineDisplay'].includes(n), () => false).map(p => p.text).join('\n'), ctx);
const copy = x => JSON.parse(JSON.stringify(x));
const scope = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
const reads = {}, state = { canonical: 0, rate: 0, stock: 0, keys: [] };
const originalRate = ctx.recoWsResolveSalesRate_;
const originalStock = ctx.sadSiteCurrentStock1g_;
ctx.recoWsResolveSalesRate_ = (...a) => { state.rate++; return originalRate(...a); };
ctx.sadSiteCurrentStock1g_ = (...a) => { state.stock++; return originalStock(...a); };
ctx.KMPS = Object.assign({}, productionSource, { readCanonicalSnapshots(ss, options) {
  state.canonical++; state.keys.push(Array.from(options.only)); return productionSource.readCanonicalSnapshots(ss, options);
} });
// Labelled date-authority seam, not an average-sales implementation; exercise real 42_ profile/date routing.
ctx.gapCalcResolveContext_ = category => { assert.equal(category, 'INVENTORY'); return { ok: true, calculationDate: '2026-11-24', calculationMonth: '2026-11' }; };
const plan = (id = 'P', extra = {}) => Object.assign({ shipping_plan_id: id, status: 'draft', company: scope.company,
  country: scope.country, marketplace: scope.marketplace, updated_at: '2026-11-24 12:00:00' }, extra);
const line = (id = 'L', pid = 'P', extra = {}) => Object.assign({ shipping_plan_id: pid, shipping_plan_line_id: id,
  sku: 'SKU', marketplace: 'Amazon', snapshot_current_stock: '', snapshot_avg_sales_per_day: '', snapshot_days_of_supply: '',
  snapshot_avg_sales_warning: 'SITE_SOURCE_SCOPE_UNDECIDED: obsolete environment-only gate', requested_qty: 10 }, extra);
function fixture() {
  return {
    shipping_plans: [plan()], shipping_plan_lines: [line()], warehouses: [{ warehouse_id: 'W' }],
    carriers: [{ carrier_id: 'C' }], sku_details: [{ sku: 'SKU' }, { sku: 'OFFPAGE' }],
    marketplaces: [Object.assign({ marketplace_id: 'M-US' }, scope)],
    marketplace_skus: [Object.assign({ sku: 'SKU', marketplace_sku_id: 'MS-US' }, scope)],
    amazon_inventory_snapshot: [Object.assign({ sku: 'SKU', snapshot_date: '2026-11-23', available_qty: 100, fc_transfer_qty: 2, fc_processing_qty: 3 }, scope)],
    amazon_daily_sales_snapshot: Array.from({ length: 10 }, (_, i) => ({ sku: 'SKU', snapshot_date: `2026-11-${14 + i}`,
      sales_units: i >= 8 ? 1000 : 2, country: 'US', marketplace: 'Amazon', channel: 'Amazon.com' })),
    amazon_weekly_sales_snapshot: [],
    campaigns: [{ campaign_id: 'CAMP', status: 'active', start_date: '2026-11-23', end_date: '2026-11-23' }],
    campaign_sku_lines: [{ campaign_id: 'CAMP', marketplace_sku_id: 'MS-US', sku: 'SKU' }],
    fc_special_events: [Object.assign({ sku: 'SKU', marketplace_id: 'M-US', status: 'active', event_start_date: '2026-11-22', event_end_date: '2026-11-22' }, scope)]
  };
}
const emptyHeaders = {
  amazon_daily_sales_snapshot: ['sku', 'snapshot_date', 'sales_units', 'country', 'marketplace', 'channel'],
  amazon_weekly_sales_snapshot: ['sku', 'week_end_date', 'sales_units_7d', 'country', 'marketplace', 'channel'],
  campaigns: ['campaign_id', 'status', 'start_date', 'end_date'], campaign_sku_lines: ['campaign_id', 'marketplace_sku_id', 'sku'],
  fc_special_events: ['sku', 'marketplace_id', 'status', 'event_start_date', 'event_end_date', 'company', 'country', 'marketplace'],
  amazon_inventory_snapshot: ['sku', 'snapshot_date', 'country', 'marketplace', 'available_qty', 'fc_transfer_qty', 'fc_processing_qty'],
  marketplaces: ['company', 'country', 'marketplace', 'marketplace_id'], marketplace_skus: ['company', 'country', 'marketplace', 'sku', 'marketplace_sku_id']
};
function profile(mode = 'production') {
  ctx.RTR_SANDBOX_GATE_ = mode === 'sandbox' ? { env: 'KM_SANDBOX' } : undefined;
  ctx.RTR_PRODUCTION_PROFILE_ = mode === 'production' ? { environment: 'KM_PRODUCTION' } : mode === 'unrecognized' ? { environment: 'PROD' } : undefined;
}
function setup(data = fixture(), mode = 'production') {
  profile(mode); Object.keys(reads).forEach(k => delete reads[k]);
  state.canonical = state.rate = state.stock = 0; state.keys = [];
  const sheets = {};
  for (const [name, rows] of Object.entries(data)) {
    const headers = Array.from(new Set([...(emptyHeaders[name] || []), ...rows.flatMap(r => Object.keys(r))]));
    const values = [headers, ...rows.map(r => headers.map(h => r[h] == null ? '' : r[h]))];
    const load = () => { reads[name] = (reads[name] || 0) + 1; return values.map(row => row.slice()); };
    sheets[name] = { getName: () => name, getLastRow: () => values.length, getLastColumn: () => headers.length,
      getDataRange: () => ({ getValues: load }),
      getRange: (r, c, nr = 1, nc = 1) => ({ getValues: () => load().slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)) }),
      appendRow() { throw Error('PROHIBITED WRITE'); }, setValue() { throw Error('PROHIBITED WRITE'); }
    };
  }
  const ss = { getSheetByName: n => sheets[n] || null };
  const io = { now: () => 1, nextSeq: () => 1, openTarget: () => ss,
    readTable: (book, name, required) => { const sh = book.getSheetByName(name); assert.ok(sh, name); return ctx.weeklyRowsToObjects_(sh); },
    readSiteMetrics: book => ctx.weeklyWorkspaceDefaultIo_().readSiteMetrics(book),
    siteMetricsDate: () => ctx.weeklyWorkspaceDefaultIo_().siteMetricsDate() };
  return { data, sheets, ss, io };
}
function run(f, include = { siteMetrics: true }, extra = {}) {
  return ctx.handleWeeklyShippingWorkspaceGet_({ payload: Object.assign({ include }, extra) }, f.io);
}
const metric = (r, id = 'P', i = 0) => r.data.detailsByPlanId[id].lines[i].liveSiteMetrics;
let pass = 0;
function test(name, fn) { fn(); pass++; console.log('PASS ' + name); }
test('explicit Production and Sandbox use real canonical campaign/event-excluded metrics; snapshots immutable', () => {
  for (const mode of ['production', 'sandbox']) {
    const f = setup(fixture(), mode), original = copy(f.data.shipping_plan_lines); const result = run(f), m = metric(result);
    assert.equal(result.success, true); assert.equal(m.state, 'READY'); assert.equal(m.scopeValidated, true);
    assert.equal(m.currentStock, 105); assert.equal(m.avgSalesPerDay, 2); assert.equal(m.daysOfSupply, 52.5);
    assert.equal(m.source, 'normalized_30d'); assert.equal(m.date, '2026-11-23'); assert.equal(m.calculationDate, '2026-11-24');
    assert.equal(m.warning, ''); assert.deepEqual(f.data.shipping_plan_lines, original);
    assert.deepEqual(copy(result.data.detailsByPlanId.P.lines[0].raw), original[0]);
  }
});
test('default is opt-out; details:false or an empty returned page performs no extra canonical reads', () => {
  const f = setup();
  for (const [include, extra] of [[{}, {}], [{ siteMetrics: true, details: false }, {}], [{ siteMetrics: true }, { page: { number: 99, size: 1 } }]]) {
    const r = run(f, include, extra); assert.equal(r.success, true); assert.equal(state.canonical, 0);
    assert.equal(r.meta.tablesRead, 5);
  }
});
test('only page SKU/site pairs are returned, eight source keys once; repeated plans/SKUs do not reread or recalculate', () => {
  const data = fixture(); data.shipping_plans.push(plan('P2'), plan('OFF', { company: 'Other', updated_at: '2020-01-01' }));
  data.shipping_plan_lines.push(line('L2', 'P2'), line('LOFF', 'OFF', { sku: 'OFFPAGE' }));
  const f = setup(data), r = run(f, { siteMetrics: true }, { page: { size: 2 } });
  assert.equal(r.success, true); assert.equal(state.canonical, 1); assert.equal(state.stock, 1); assert.equal(state.rate, 1);
  assert.equal(r.meta.tablesRead, 13); assert.equal(r.meta.siteMetrics.keys, 1);
  assert.deepEqual(state.keys[0].sort(), Array.from(ctx.WEEKLY_SITE_METRICS_KEYS_).sort());
  assert.ok(Object.values(reads).every(n => n === 1)); assert.equal(r.data.detailsByPlanId.OFF, undefined);
  assert.deepEqual(Array.from(r.data.skuDetails, r => r.sku), ['SKU']);
});
test('future Submit source attribution works under Production while duplicate/blank/wrong-owner masters refuse', () => {
  const f = setup(); const co = ctx.sadSiteCompanies13_(f.ss, scope);
  assert.equal(ctx.sadSiteSourceUnknown13_(co, scope, 'SKU'), '');
  for (const rows of [['resus', 'resus'], ['resus', 'km'], ['(blank company)'], ['km'], []]) {
    assert.match(ctx.sadSiteSourceUnknown13_({ basis: 'MARKETPLACES_MASTER_1J', rows }, scope, 'SKU'), /^SITE_SOURCE_/);
  }
  const savedRead = ctx.sadReadSiteWorkspace1g_;
  ctx.sadReadSiteWorkspace1g_ = () => ({ success: true, data: { lines: [Object.assign({ sku: 'SKU', horizonBasis: {
    avgSalesPerDay: 2, source: 'normalized_30d', normalDayCount: 8, excludedDates: ['2026-11-22', '2026-11-23'] } }, scope)] } });
  try {
    const submit = [{ sku: 'SKU' }]; ctx.sadAttachSiteSnapshot_(f.ss, [{ header: scope }], submit, '');
    assert.equal(submit[0].snapshot_current_stock, 105); assert.equal(submit[0].snapshot_avg_sales_per_day, 2);
    assert.equal(submit[0].snapshot_days_of_supply, 52.5); assert.equal(submit[0].snapshot_avg_sales_warning, '');
  } finally { ctx.sadReadSiteWorkspace1g_ = savedRead; }
});
test('unknown/unrecognized deployment profile never attributes data and avoids extra reads', () => {
  for (const mode of ['none', 'unrecognized']) {
    const r = run(setup(fixture(), mode)), m = metric(r); assert.equal(r.success, true);
    assert.equal(m.state, 'UNKNOWN'); assert.equal(m.currentStock, null); assert.equal(m.avgSalesPerDay, null);
    assert.match(m.warning, /SITE_SOURCE_SCOPE_UNDECIDED/); assert.equal(state.canonical, 0);
  }
});
test('cross-company, country, marketplace and blank-country stock rows cannot leak into an exact scope', () => {
  const data = fixture();
  for (const extra of [{ company: 'KM' }, { country: 'CA' }, { marketplace: 'Walmart' }, { country: '' }]) {
    data.amazon_inventory_snapshot.push(Object.assign({}, data.amazon_inventory_snapshot[0], extra, { snapshot_date: '2026-11-24', available_qty: 99999 }));
    data.amazon_daily_sales_snapshot.push(Object.assign({}, data.amazon_daily_sales_snapshot[0], extra, { snapshot_date: '2026-11-20', sales_units: 99999 }));
  }
  const m = metric(run(setup(data))); assert.equal(m.currentStock, 105); assert.equal(m.avgSalesPerDay, 2);
});
test('distinct page sites and MULTI line marketplaces are independently guarded; malformed line scope is unknown', () => {
  const data = fixture(); data.shipping_plans.push(plan('MULTI', { marketplace: 'MULTI' }), plan('KM', { company: 'KM' }));
  data.shipping_plan_lines.push(line('LA', 'MULTI'), line('LW', 'MULTI', { marketplace: 'Walmart' }), line('LK', 'KM'), line('BAD', 'P', { company: 'KM' }));
  const r = run(setup(data));
  assert.equal(metric(r, 'MULTI', 0).currentStock, 105); assert.equal(metric(r, 'MULTI', 1).state, 'UNKNOWN');
  assert.match(metric(r, 'MULTI', 1).warning, /SITE_SOURCE_NOT_CONFIRMED/);
  assert.match(metric(r, 'KM').warning, /SITE_SOURCE_COMPANY_NOT_LISTED/);
  assert.equal(metric(r, 'P', 1).warning, 'SITE_METRICS_SCOPE_INVALID');
});
test('no stock source is unknown, not zero; valid sales can still be shown independently', () => {
  const data = fixture(); delete data.amazon_inventory_snapshot;
  const r = run(setup(data)), m = metric(r); assert.equal(r.success, true);
  assert.equal(m.currentStock, null); assert.equal(m.daysOfSupply, null); assert.equal(m.avgSalesPerDay, 2);
  assert.match(m.warning, /SITE_STOCK_ROW_NOT_FOUND/);
});
test('missing sales/contamination sources never fabricate zero and do not hide validated stock', () => {
  for (const missing of [['amazon_daily_sales_snapshot', 'amazon_weekly_sales_snapshot'], ['campaigns'], ['campaign_sku_lines'], ['fc_special_events']]) {
    const data = fixture(); missing.forEach(k => delete data[k]); const r = run(setup(data)), m = metric(r);
    assert.equal(r.success, true); assert.equal(m.currentStock, 105); assert.equal(m.state, 'READY');
    assert.equal(m.avgSalesPerDay, null); assert.equal(m.daysOfSupply, null); assert.ok(m.warning);
  }
});
test('actual zero stock and zero normalized average are retained, DoS stays unknown for zero rate', () => {
  const data = fixture(); data.amazon_inventory_snapshot[0].available_qty = data.amazon_inventory_snapshot[0].fc_transfer_qty = data.amazon_inventory_snapshot[0].fc_processing_qty = 0;
  data.amazon_daily_sales_snapshot.forEach(r => r.sales_units = 0);
  const m = metric(run(setup(data))); assert.equal(m.state, 'READY'); assert.equal(m.currentStock, 0); assert.equal(m.avgSalesPerDay, 0); assert.equal(m.daysOfSupply, null);
});
test('unresolved campaign marketplace-SKU identity cannot become a false clean rate', () => {
  const data = fixture(); data.campaign_sku_lines.push({ campaign_id: 'CAMP', marketplace_sku_id: '', sku: 'SKU' });
  const m = metric(run(setup(data))); assert.equal(m.currentStock, 105); assert.equal(m.avgSalesPerDay, null);
  assert.match(m.warning, /SALES_BASIS_CONTAMINATION_UNRESOLVED/);
});
test('weekly fallback remains canonical when there are too few normal days, including a real zero week', () => {
  for (const week of [70, 0]) {
    const data = fixture(); data.amazon_daily_sales_snapshot = [];
    data.amazon_weekly_sales_snapshot = [{ sku: 'SKU', week_end_date: '2026-11-23', sales_units_7d: week, country: 'US', marketplace: 'Amazon', channel: 'Amazon.com' }];
    const m = metric(run(setup(data))); assert.equal(m.avgSalesPerDay, week / 7); assert.equal(m.source, 'weekly_7d');
    assert.equal(m.daysOfSupply, week ? 10.5 : null);
  }
});
test('blank-marketplace-only inventory retains its stronger typed source refusal', () => {
  const data = fixture(); data.amazon_inventory_snapshot[0].marketplace = '';
  const m = metric(run(setup(data))); assert.equal(m.state, 'UNKNOWN'); assert.equal(m.currentStock, null); assert.equal(m.avgSalesPerDay, null);
  assert.match(m.warning, /^SITE_SOURCE_MARKETPLACE_BLANK/);
});
test('fresh matching READY sidecar alone recovers obsolete scope warning; stronger historical warnings stay protected', () => {
  const r = run(setup()), l = r.data.detailsByPlanId.P.lines[0];
  assert.equal(ctx._spLineDisplay(l, scope, null).currentStock, 105);
  for (const warning of ['SITE_SOURCE_COMPANY_UNKNOWN: ambiguous account', 'SITE_SOURCE_NOT_CONFIRMED: other marketplace',
    'SITE_SOURCE_SCOPE_UNDECIDED: old; SITE_SOURCE_MARKETPLACE_BLANK: protected']) {
    const blocked = Object.assign({}, l, { raw: { snapshot_avg_sales_warning: warning } });
    assert.match(ctx._spLineDisplay(blocked, scope, null).currentStock, /Not available/);
  }
  const mismatch = Object.assign({}, l, { liveSiteMetrics: Object.assign({}, l.liveSiteMetrics, { company: 'KM' }) });
  assert.match(ctx._spLineDisplay(mismatch, scope, null).currentStock, /Not available/);
});
test('42 sales resolver absence leaves independently validated stock READY, never hides plans', () => {
  const f = setup(), saved = ctx.recoWsResolveSalesRate_; ctx.recoWsResolveSalesRate_ = undefined;
  try { const r = run(f), m = metric(r); assert.equal(r.success, true); assert.equal(m.state, 'READY'); assert.equal(m.currentStock, 105);
    assert.equal(m.avgSalesPerDay, null); assert.match(m.warning, /SALES_RUNTIME_UNAVAILABLE/); }
  finally { ctx.recoWsResolveSalesRate_ = saved; }
});
test('canonical reader failure preserves successful plan list and emits a typed UNKNOWN metric', () => {
  const f = setup(); f.io.readSiteMetrics = () => { throw Error('synthetic read failure'); };
  const r = run(f); assert.equal(r.success, true); assert.equal(r.data.plans.length, 1);
  assert.equal(metric(r).state, 'UNKNOWN'); assert.equal(metric(r).currentStock, null); assert.equal(metric(r).warning, 'SITE_METRICS_READ_FAILED');
});
test('unexpected dependency/schema error cannot fail the workspace or retain a partially READY sidecar', () => {
  const f = setup(), saved = ctx.sadSiteCompanies13_; ctx.sadSiteCompanies13_ = () => { throw Error('synthetic schema exception'); };
  try { const r = run(f); assert.equal(r.success, true); assert.equal(r.data.plans.length, 1);
    assert.equal(metric(r).state, 'UNKNOWN'); assert.equal(metric(r).currentStock, null);
    assert.equal(metric(r).warning, 'SITE_METRICS_ENRICHMENT_FAILED'); assert.equal(r.meta.tablesRead, 13); }
  finally { ctx.sadSiteCompanies13_ = saved; }
});
test('bounded key backstop does not broaden scopes or compute/fetch per omitted line', () => {
  const data = fixture(); data.shipping_plan_lines.push(line('OTHER', 'P', { sku: 'OTHER' }));
  const saved = ctx.WEEKLY_SITE_METRICS_MAX_KEYS_; ctx.WEEKLY_SITE_METRICS_MAX_KEYS_ = 1;
  try { const r = run(setup(data)); assert.equal(metric(r, 'P', 1).warning, 'SITE_METRICS_PAGE_LIMIT');
    assert.equal(r.meta.siteMetrics.keys, 1); assert.equal(state.stock, 1); assert.equal(state.rate, 1); assert.equal(state.canonical, 1); }
  finally { ctx.WEEKLY_SITE_METRICS_MAX_KEYS_ = saved; }
});
console.log(`PASS ${pass} weekly live-site metrics tests (actual canonical calculations, offline)`);
