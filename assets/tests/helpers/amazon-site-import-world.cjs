'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
function createAmazonWorld() {
  const tables = {}, queries = [], messages = [], changes = [], hooks = [], now = '2026-11-24T06:00:00Z';
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  const c = vm.createContext({ Date: FixedDate, Logger: { log: x => messages.push(x) },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep: () => {}, DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, text) => Array.from(crypto.createHash(alg).update(text).digest()),
      formatDate: (d, tz, fmt) => {
        const x = new Date(d.getTime() + (tz === 'UTC' ? 0 : 8 * 3600000)), s = x.toISOString();
        return fmt.includes('HH') ? s.slice(0, 19).replace('T', ' ') : s.slice(0, 10);
      } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    SpreadsheetApp: { openById: id => ({ getSheetByName: name => tables[id + '/' + name] || null }) },
    prodAssertAmazonTarget_: id => { if (id !== 'DEST') throw new Error('WRONG_SPREADSHEET_TARGET'); },
    kmSrcRevMark_: () => { hooks.push('mark'); return 'revision'; }, kmSrcRevBump_: mark => hooks.push('bump:' + mark),
    jsonResponse_: x => x, BigQuery: { Jobs: { query: () => { throw new Error('Unexpected real BigQuery boundary'); } } }
  });
  const gs = process.env.KM_AMAZON_IMPORT_GS || path.join(root, 'assets/specs/active/apps-script');
  for (const file of ['06_amazon_import_config.gs', '07_amazon_import_runner.gs', '08_amazon_import_sources.gs', '09_amazon_import_writer_logger.gs', '10_amazon_import_helpers.gs']) vm.runInContext(fs.readFileSync(path.join(gs, file), 'utf8'), c, { filename: file });
  function sheet(id, name, headers, rows = []) {
    const grid = [headers.slice(), ...rows.map(row => Array.isArray(row) ? row.slice() : headers.map(h => row[h] ?? ''))];
    const sh = { grid, getLastColumn: () => headers.length,
      getMaxRows: () => grid.length,
      insertRowsAfter: (at, n) => { changes.push(name + ':expand'); grid.splice(at, 0, ...Array.from({ length: n }, () => headers.map(() => ''))); },
      getLastRow: () => { let n = grid.length; while (n > 0 && !grid[n - 1].some(v => v !== '' && v != null)) n--; return n; },
      getDataRange: () => sh.getRange(1, 1, sh.getLastRow(), headers.length),
      appendRow: row => { changes.push(name); grid.push(Array.from(row)); },
      getRange: (r, col, n, m) => ({
        getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => grid[r + i - 1]?.[col + j - 1] ?? '')),
        clearContent: () => { changes.push(name); for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) { grid[r + i - 1] ||= []; grid[r + i - 1][col + j - 1] = ''; } },
        setValues: values => { changes.push(name); values.forEach((row, i) => { grid[r + i - 1] ||= []; row.forEach((v, j) => { grid[r + i - 1][col + j - 1] = v; }); }); }
      }) };
    tables[id + '/' + name] = sh; return sh;
  }
  function config(table) { const cfg = JSON.parse(JSON.stringify(c.IMPORT_CONFIGS.find(x => x.destinationSheetName === table))); cfg.destinationSpreadsheetId = 'DEST'; if (cfg.sourceType === 'sheet') cfg.sourceId = 'SOURCE'; return cfg; }
  function rows(table) { const sh = tables['DEST/' + table]; return sh.grid.slice(1, sh.getLastRow()).map(row => Object.fromEntries(sh.grid[0].map((h, i) => [h, row[i] ?? '']))); }
  sheet('DEST', 'import_sync_runs', ['destination_table', 'status', 'error_summary', 'rows_read', 'rows_written', 'quality_note', 'latest_source_date', 'data_window_start_date', 'data_window_end_date', 'data_age_days']);
  sheet('DEST', 'import_sync_issues', ['destination_table', 'issue_type', 'issue_level', 'field_name']);
  function sourceRow(country, date, sku = 'SKU-A', channel = 'Amazon', units = 1) {
    const cfg = config('amazon_daily_sales_snapshot'), row = Object.fromEntries(Object.values(cfg.fieldMap).map(h => [h, 0]));
    return Object.assign(row, { Marketplace: country, Date: date, Channel: channel, SKU: sku, Currency: 'USD', Sales_Units: units });
  }
  function bigQuery(source) {
    c.amazonRunBigQuery_ = (_project, sql) => {
      queries.push(sql);
      if (sql.includes('amazon_daily_site_coverage_v1')) {
        const latest = {}, byDate = {};
        for (const r of source) if (r.Date < '2026-11-24') latest[r.Marketplace] = !latest[r.Marketplace] || r.Date > latest[r.Marketplace] ? r.Date : latest[r.Marketplace];
        for (const r of source) {
          const end = latest[r.Marketplace], start = end && c.amazonAddDaysStr_(end, -89);
          if (!end || r.Date < start || r.Date > end) continue;
          const key = JSON.stringify([r.Marketplace, r.Date]); byDate[key] ||= { s0: r.Marketplace, d: r.Date, latest_date: end, cnt: 0, keys: new Set() };
          byDate[key].cnt++; byDate[key].keys.add(JSON.stringify([r.Marketplace, r.Channel, r.SKU]));
        }
        return { headers: ['s0', 'd', 'latest_date', 'cnt', 'keycnt'], rows: Object.values(byDate).map(({ keys, ...r }) => ({ ...r, keycnt: keys.size })) };
      }
      if (!sql.includes('amazon_daily_site_fetch_v1')) throw new Error('Unexpected query: ' + sql);
      // Interpret only the emitted WHERE site's literal/date pairs at the simulated BigQuery boundary.
      const clauses = sql.slice(sql.indexOf(' WHERE ') + 7).split(' OR ').map(text => ({ country: JSON.parse(text.match(/ = ("(?:[^"\\]|\\.)*") AND/)[1]), dates: [...text.matchAll(/DATE\("(\d{4}-\d{2}-\d{2})"\)/g)].map(m => m[1]) }));
      return { headers: Object.values(config('amazon_daily_sales_snapshot').fieldMap), rows: source.filter(r => clauses.some(x => x.country === r.Marketplace && x.dates.includes(r.Date))) };
    };
  }
  return { c, root, tables, queries, messages, changes, hooks, sheet, config, rows, sourceRow, bigQuery, runBigQuery: c.amazonRunBigQuery_, plain: x => JSON.parse(JSON.stringify(x)) };
}
module.exports = { createAmazonWorld };
