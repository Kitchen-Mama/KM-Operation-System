'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAmazonWorld } = require('./helpers/amazon-site-import-world.cjs');
const DAILY = 'amazon_daily_sales_snapshot', INV = 'amazon_inventory_snapshot';
function inventory() {
  const h = createAmazonWorld(), cfg = h.config(INV);
  const headers = Object.values(cfg.fieldMap), data = Object.fromEntries(headers.map(x => [x, 0]));
  Object.assign(data, { Date: '2026-11-23', Country: 'US', SKU: 'SKU-A', ASIN: 'ASIN-A', 'Currency code': 'USD', Available: 189 });
  h.sheet('SOURCE', 'Combined Sheet', headers, [data]);
  h.sheet('DEST', INV, Object.keys(cfg.fieldMap).concat(Object.keys(cfg.optionalFieldMap), ['marketplace', 'total_days_of_supply_including_open_shipments_is_capped', 'synced_at']), [{ snapshot_date: '2026-11-01', sku: 'OLD' }]);
  return { ...h, cfg, data };
}
function daily() {
  const h = createAmazonWorld(), cfg = h.config(DAILY), source = [];
  h.sheet('DEST', DAILY, Object.keys(cfg.fieldMap).concat(['marketplace', 'source_row_hash', 'synced_at', 'latest_source_date', 'data_window_start_date', 'data_window_end_date', 'data_age_days', 'is_fallback_used', 'fallback_reason']));
  h.bigQuery(source);
  return { ...h, cfg, source, run: (opts = {}) => h.c.runAmazonSnapshotImport_(cfg, 'fixture', opts) };
}
test('reproduces Production missing-Days-of-Supply failure, then imports the same 18-column source', () => {
  const h = inventory(), old = structuredClone(h.cfg);
  Object.assign(old.fieldMap, old.optionalFieldMap); delete old.optionalFieldMap;
  const before = h.plain(h.rows(INV)), failed = h.c.runAmazonSnapshotImport_(old, 'fixture', {});
  assert.equal(failed.status, 'failed'); assert.match(failed.error_summary, /missing_required_header/);
  assert.deepEqual(h.plain(h.rows(INV)), before);
  const ok = h.c.runAmazonSnapshotImport_(h.cfg, 'fixture', {});
  assert.equal(ok.status, 'success'); assert.equal(ok.rows_written, 1);
  const row = h.rows(INV)[0]; assert.equal(row.snapshot_date, '2026-11-23'); assert.equal(row.available_qty, 189);
  assert.equal(row.total_days_of_supply_including_open_shipments, ''); assert.equal(row.total_days_of_supply_including_open_shipments_is_capped, false);
});
test('optional supply metric remains mapped and capped when the report includes it', () => {
  const h = inventory(), name = h.cfg.optionalFieldMap.total_days_of_supply_including_open_shipments;
  h.sheet('SOURCE', 'Combined Sheet', Object.values(h.cfg.fieldMap).concat([name]), [{ ...h.data, [name]: '365+' }]);
  assert.equal(h.c.runAmazonSnapshotImport_(h.cfg, 'fixture', {}).status, 'success');
  assert.equal(h.rows(INV)[0].total_days_of_supply_including_open_shipments, 365);
  assert.equal(h.rows(INV)[0].total_days_of_supply_including_open_shipments_is_capped, true);
});
for (const field of ['Available', 'Date', 'Country', 'SKU']) test('missing core inventory header still preserves the old snapshot: ' + field, () => {
  const h = inventory(), before = h.plain(h.rows(INV));
  h.sheet('SOURCE', 'Combined Sheet', Object.values(h.cfg.fieldMap).filter(x => x !== field), [h.data]);
  const r = h.c.runAmazonSnapshotImport_(h.cfg, 'fixture', {});
  assert.equal(r.status, 'failed'); assert.deepEqual(h.plain(h.rows(INV)), before);
});
test('US and a very stale JP site retain their own exact 90 calendar days, not the global yesterday window', () => {
  const h = daily();
  for (const [site, end] of [['US', '2026-11-23'], ['JP', '2026-07-10']]) {
    for (let i = 0; i < 91; i++) h.source.push(h.sourceRow(site, h.c.amazonAddDaysStr_(end, -i)));
  }
  h.source.push(h.sourceRow('US', '2026-11-24'), h.sourceRow('JP', '2026-11-25'));
  const r = h.run(); assert.equal(r.status, 'success', JSON.stringify(r)); assert.equal(r.rows_written, 180);
  for (const [site, end] of [['US', '2026-11-23'], ['JP', '2026-07-10']]) {
    const rows = h.rows(DAILY).filter(x => x.country === site), start = h.c.amazonAddDaysStr_(end, -89);
    assert.equal(rows.length, 90); assert.equal(rows.map(x => x.snapshot_date).sort()[0], start);
    assert(rows.every(x => x.snapshot_date >= start && x.snapshot_date <= end && x.latest_source_date === end && x.data_window_start_date === start && x.data_window_end_date === end));
  }
  assert.equal(r.site_windows.length, 2); assert.match(h.rows('import_sync_runs')[0].quality_note, /window_mode=site_latest; site_windows=/);
  assert(h.queries[0].includes('MAX(DATE(`Date`))')); assert(h.queries[0].includes('< CURRENT_DATE("Asia/Taipei")'));
  assert(h.queries[0].includes('INTERVAL 89 DAY')); assert(h.queries[0].includes('GROUP BY s0) SELECT'));
});
test('missing dates and recent reconciliation are site-specific; repeat does not append duplicate keys', () => {
  const h = daily();
  for (const country of ['US', 'JP']) for (let i = 0; i < 8; i++) h.source.push(h.sourceRow(country, h.c.amazonAddDaysStr_('2026-11-23', -i)));
  h.run(); h.queries.length = 0;
  const sh = h.tables['DEST/' + DAILY], ix = Object.fromEntries(sh.grid[0].map((x, i) => [x, i]));
  sh.grid.splice(sh.grid.findIndex((r, i) => i && r[ix.country] === 'JP' && r[ix.snapshot_date] === '2026-11-17'), 1);
  const r = h.run(); assert.equal(r.status, 'success'); assert.equal(h.rows(DAILY).length, 16);
  const fetch = h.queries.find(x => x.includes('site_fetch'));
  const us = fetch.split(' OR ')[0], jp = fetch.split(' OR ')[1];
  // Keys are deterministic JSON order: JP then US.
  assert(us.includes('"JP"') && us.includes('2026-11-17')); assert(jp.includes('"US"') && !jp.includes('2026-11-17'));
  h.run(); assert.equal(h.rows(DAILY).length, 16);
});
test('a SKU or channel with an older last row does not acquire a separate site window', () => {
  const h = daily();
  h.source.push(h.sourceRow('US', '2026-11-23', 'NEW', 'Amazon'), h.sourceRow('US', '2026-08-26', 'OLD', 'Retail'), h.sourceRow('US', '2026-08-25', 'OLD', 'Retail'));
  const r = h.run(); assert.equal(r.site_windows.length, 1); assert.equal(h.rows(DAILY).length, 2);
  assert(h.rows(DAILY).every(x => x.latest_source_date === '2026-11-23' && x.data_window_start_date === '2026-08-26'));
});
test('per-site prune drops only expired/out-of-window known-site rows and preserves source-unavailable sites', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-23'), h.sourceRow('JP', '2026-07-10'));
  const sh = h.tables['DEST/' + DAILY], headers = sh.grid[0];
  for (const row of [{ country: 'US', snapshot_date: '2026-08-25' }, { country: 'JP', snapshot_date: '2026-04-11' },
    { country: 'JP', snapshot_date: '2026-04-12' }, { country: 'JP', snapshot_date: '2026-11-24' }, { country: 'CA', snapshot_date: '2025-01-01' }]) sh.grid.push(headers.map(k => ({ marketplace: 'Amazon', channel: 'Amazon', sku: 'KEEP', ...row })[k] ?? ''));
  const r = h.run(); assert.equal(r.status, 'success');
  const rows = h.rows(DAILY); assert(rows.some(x => x.country === 'CA' && x.snapshot_date === '2025-01-01'));
  assert(rows.some(x => x.country === 'JP' && x.snapshot_date === '2026-04-12'));
  assert(!rows.some(x => ['2026-08-25', '2026-04-11', '2026-11-24'].includes(x.snapshot_date)));
  assert.match(h.rows('import_sync_runs')[0].quality_note, /source_unavailable_sites=.*CA/);
});
test('no BQ source sites never borrows the global cutoff or empties destination', () => {
  const h = daily(), sh = h.tables['DEST/' + DAILY];
  sh.grid.push(sh.grid[0].map(k => ({ snapshot_date: '2025-01-01', country: 'JP', marketplace: 'Amazon', channel: 'Amazon', sku: 'KEEP' })[k] ?? ''));
  const before = h.plain(h.rows(DAILY)), r = h.run(); assert.equal(r.status, 'failed'); assert.equal(r.rows_written, 0);
  assert.match(r.error_summary, /DAILY_SOURCE_NO_COMPLETED_SITE_DATA/);
  assert.deepEqual(h.plain(h.rows(DAILY)), before); assert.equal(h.queries.length, 1);
});
test('manual backfill is anchored at each site end, not today', () => {
  const h = daily();
  for (const [country, end] of [['US', '2026-11-23'], ['JP', '2026-07-10']]) for (let i = 0; i < 8; i++) h.source.push(h.sourceRow(country, h.c.amazonAddDaysStr_(end, -i)));
  h.run(); h.queries.length = 0;
  const r = h.run({ backfillDays: 6 }); assert(r.site_windows.every(x => x.fetched_dates === 6));
  assert(h.queries[1].includes('2026-07-05')); assert(h.queries[1].includes('2026-11-18'));
});
test('half-installed writer fails closed before any daily snapshot changes', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-23'));
  h.c.AMAZON_SITE_ROLLING_VERSION_ = undefined;
  const r = h.run(); assert.equal(r.status, 'failed'); assert.match(r.error_summary, /DAILY_SITE_WRITER_UPDATE_REQUIRED/);
  assert.equal(h.rows(DAILY).length, 0);
});
test('new config with an old global-window reader refuses instead of pruning by yesterday', () => {
  const h = daily();
  h.c.amazonReadBigQuerySource_ = () => ({ headers: Object.values(h.cfg.fieldMap), rows: [], rollingMeta: { retentionStart: '2026-08-26' } });
  const r = h.run(); assert.equal(r.status, 'failed'); assert.match(r.error_summary, /DAILY_SITE_READER_UPDATE_REQUIRED/);
  assert.equal(h.changes.filter(x => x === DAILY).length, 0);
});
test('mis-scoped fetch fails closed before pruning existing data', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-23')); const original = h.c.amazonRunBigQuery_;
  h.c.amazonRunBigQuery_ = (project, sql) => sql.includes('site_fetch') ? { headers: Object.values(h.cfg.fieldMap), rows: [h.sourceRow('JP', '2026-07-10')] } : original(project, sql);
  const r = h.run(); assert.equal(r.status, 'failed'); assert.match(r.error_summary, /DAILY_SITE_FETCH_OUTSIDE_WINDOW/); assert.equal(h.rows(DAILY).length, 0);
});
test('source errors leave the existing snapshot untouched', () => {
  const h = daily(); h.c.amazonRunBigQuery_ = () => { throw new Error('BQ unavailable'); };
  const r = h.run(); assert.equal(r.status, 'failed'); assert.equal(h.changes.filter(x => x === DAILY).length, 0);
});
test('incomplete key coverage is recovered separately for a site even when another site has the same day', () => {
  const h = daily(); h.cfg.reconcileRecentDays = 0;
  for (const country of ['JP', 'US']) for (const sku of ['A', 'B']) h.source.push(h.sourceRow(country, '2026-11-20', sku));
  h.run(); const sh = h.tables['DEST/' + DAILY], idx = sh.grid[0].indexOf('country');
  sh.grid.splice(sh.grid.findIndex((r, i) => i && r[idx] === 'JP'), 1); h.queries.length = 0;
  const r = h.run(); assert.equal(r.status, 'success');
  assert.equal(r.site_windows.find(x => x.site.country === 'JP').incomplete_dates, 1);
  assert.equal(r.site_windows.find(x => x.site.country === 'US').fetched_dates, 0);
  assert(h.queries[1].includes('"JP"')); assert(!h.queries[1].includes('"US"'));
  assert.equal(h.rows(DAILY).length, 4);
});
test('Date/string duplicates are repaired without changing channel or SKU dimensions', () => {
  const h = daily(); h.cfg.reconcileRecentDays = 0;
  h.source.push(h.sourceRow('US', '2026-11-20', 'SKU', 'Amazon'), h.sourceRow('US', '2026-11-20', 'SKU', 'Retail'));
  h.run(); const sh = h.tables['DEST/' + DAILY], row = sh.grid[1].slice();
  row[sh.grid[0].indexOf('snapshot_date')] = new Date('2026-11-19T16:00:00Z'); sh.grid.push(row);
  const r = h.run(); assert.equal(r.status, 'success'); assert.equal(r.site_windows[0].incomplete_dates, 1);
  assert.equal(h.rows(DAILY).length, 2); assert.deepEqual(h.rows(DAILY).map(x => x.channel).sort(), ['Amazon', 'Retail']);
});
test('retained rows receive the new site window metadata even when their facts were not refetched', () => {
  const h = daily(); h.cfg.reconcileRecentDays = 0;
  h.source.push(h.sourceRow('US', '2026-11-20', 'OLDER')); h.run();
  h.source.push(h.sourceRow('US', '2026-11-23', 'NEWER')); h.queries.length = 0;
  assert.equal(h.run().status, 'success');
  assert(!h.queries[1].includes('2026-11-20'));
  assert(h.rows(DAILY).every(x => x.latest_source_date === '2026-11-23' && x.data_window_start_date === '2026-08-26'));
});
test('source-unavailable site duplicate rows remain untouched, not cleaned using another site source', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-23'));
  const sh = h.tables['DEST/' + DAILY];
  for (const units of [1, 2]) sh.grid.push(sh.grid[0].map(k => ({ country: 'CA', marketplace: 'Amazon', channel: 'Amazon', sku: 'KEEP', snapshot_date: '2025-01-01', sales_units: units })[k] ?? ''));
  assert.equal(h.run().status, 'success'); assert.equal(h.rows(DAILY).filter(x => x.country === 'CA').length, 2);
});
test('capacity expansion happens before clearing any existing daily data', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-22'), h.sourceRow('US', '2026-11-23'));
  const sh = h.tables['DEST/' + DAILY]; sh.grid.push(sh.grid[0].map(k => ({ country: 'US', marketplace: 'Amazon', channel: 'Amazon', sku: 'OLD', snapshot_date: '2026-11-21' })[k] ?? ''));
  const before = h.plain(h.rows(DAILY)); sh.insertRowsAfter = () => { throw new Error('sheet capacity unavailable'); };
  const r = h.run(); assert.equal(r.status, 'failed'); assert.match(r.error_summary, /sheet capacity unavailable/);
  assert.deepEqual(h.plain(h.rows(DAILY)), before);
});
test('missing destination key header cannot clear or prune daily data', () => {
  const h = daily(); h.source.push(h.sourceRow('US', '2026-11-23'));
  const sh = h.tables['DEST/' + DAILY]; sh.grid[0][sh.grid[0].indexOf('channel')] = 'wrong_header';
  assert.equal(h.run().status, 'failed'); assert.equal(h.changes.filter(x => x === DAILY).length, 0);
});
test('unfinished BigQuery job is refused instead of being treated as an empty completed source', () => {
  const h = createAmazonWorld(); let polls = 0;
  h.c.BigQuery.Jobs = { query: () => ({ jobComplete: false, jobReference: { jobId: 'FIXTURE-JOB' } }), getQueryResults: () => { polls++; return { jobComplete: false }; } };
  assert.throws(() => h.runBigQuery('fixture-project', 'SELECT 1'), /BIGQUERY_JOB_NOT_COMPLETE/); assert.equal(polls, 60);
});
test('target guard still refuses an unexpected destination before reads or writes', () => {
  const h = inventory(); h.cfg.destinationSpreadsheetId = 'WRONG';
  assert.throws(() => h.c.runAmazonSnapshotImport_(h.cfg, 'fixture', {}), /WRONG_SPREADSHEET_TARGET/); assert.equal(h.changes.length, 0);
});
test('scheduler runs other sources, preserves Production revision hooks and surfaces a failed child', () => {
  const h = createAmazonWorld(), seen = [];
  h.c.runAmazonSnapshotImport_ = cfg => { seen.push(cfg.destinationSheetName); return { destination_table: cfg.destinationSheetName, status: cfg.destinationSheetName === INV ? 'failed' : 'success', error_summary: 'fixture failure' }; };
  assert.throws(() => h.c.runAmazonSnapshotImports(), /AMAZON_IMPORT_FAILED.*amazon_inventory_snapshot/);
  assert.equal(seen.length, 4); assert.deepEqual(h.hooks, ['mark', 'bump:revision']);
  const api = h.c.handleRunAmazonSnapshotImports_({ destination_table: INV }); assert.equal(api.success, false); assert.equal(api.code, 'AMAZON_IMPORT_FAILED');
});
