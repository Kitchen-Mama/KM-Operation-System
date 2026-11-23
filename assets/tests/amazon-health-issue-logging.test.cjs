const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const gs = path.join(__dirname, '../specs/active/apps-script');
const health = 'amazon_inventory_health_snapshot';

function host() {
  const tabs = {};
  const opened = [];
  const messages = [];
  const c = vm.createContext({
    Logger: { log: message => messages.push(message) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate: () => '2026-11-23',
      DigestAlgorithm: { MD5: 'md5' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (algorithm, value) => Array.from(crypto.createHash(algorithm).update(value).digest())
    },
    SpreadsheetApp: {
      openById: id => {
        opened.push(id);
        assert.equal(id, 'fixture-db');
        return { getSheetByName: name => tabs[name] || null };
      }
    },
    prodAssertAmazonTarget_: id => assert.equal(id, 'fixture-db')
  });
  for (const file of ['06_amazon_import_config.gs', '07_amazon_import_runner.gs',
    '09_amazon_import_writer_logger.gs', '10_amazon_import_helpers.gs']) {
    vm.runInContext(fs.readFileSync(path.join(gs, file), 'utf8'), c, { filename: file });
  }
  function sheet(name, headers, rows = []) {
    const grid = [headers.slice(), ...rows.map(row => row.slice())];
    tabs[name] = {
      grid,
      getLastRow: () => grid.length,
      getLastColumn: () => headers.length,
      appendRow: row => grid.push(Array.from(row)),
      getRange: (r, col, n, m) => ({
        getValues: () => Array.from({ length: n }, (_, i) =>
          Array.from({ length: m }, (_, j) => (grid[r - 1 + i] || [])[col - 1 + j] ?? '')),
        clearContent: () => {
          for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) grid[r - 1 + i][col - 1 + j] = '';
        },
        setValues: values => values.forEach((row, i) => {
          grid[r - 1 + i] ||= [];
          row.forEach((value, j) => { grid[r - 1 + i][col - 1 + j] = value; });
        })
      })
    };
    return tabs[name];
  }
  const issues = sheet('import_sync_issues', ['destination_table', 'issue_type', 'issue_level']);
  const runs = sheet('import_sync_runs', ['destination_table', 'status', 'error_summary', 'rows_error', 'rows_duplicate']);
  return { c, tabs, opened, messages, sheet, issues, runs };
}

function fixture(table = health) {
  const h = host();
  const config = JSON.parse(JSON.stringify(h.c.IMPORT_CONFIGS.find(x => x.destinationSheetName === table)));
  config.destinationSpreadsheetId = 'fixture-db';
  const headers = Object.values(config.fieldMap).concat(Object.values(config.optionalFieldMap || {}));
  const row = Object.fromEntries(headers.map(name => [name, 1]));
  Object.assign(row, { Date: '2026-11-22', Country: 'JP', SKU: 'FIXTURE-SKU', ASIN: 'FIXTURE-ASIN' });
  const source = { headers, rows: [row] };
  h.c.amazonReadSheetSource_ = () => source;
  const destHeaders = Object.keys(config.fieldMap).concat(Object.keys(config.optionalFieldMap || {}));
  const snapshot = h.sheet(table, destHeaders, [destHeaders.map(() => 'existing-value')]);
  return { ...h, config, source, row, snapshot, run: () => h.c.runAmazonSnapshotImport_(config, 'fixture', {}) };
}

test('health detail of every severity is omitted before opening the DB', () => {
  const h = host();
  h.c.amazonLogIssues_('fixture-db', ['warning', 'error', 'critical'].map(issue_level =>
    ({ destination_table: health, issue_level })));
  assert.equal(h.opened.length, 0);
  assert.equal(h.issues.grid.length, 1);
});

test('mixed batches retain all other tables and leave caller issues unchanged', () => {
  const h = host();
  const batch = [health, 'amazon_inventory_snapshot', 'amazon_daily_sales_snapshot',
    'amazon_weekly_sales_snapshot', health].map(destination_table =>
    Object.freeze({ destination_table, issue_type: 'invalid_number', issue_level: 'warning' }));
  Object.freeze(batch);
  h.c.amazonLogIssues_('fixture-db', batch);
  assert.deepEqual(h.issues.grid.slice(1).map(row => row[0]), batch.slice(1, 4).map(x => x.destination_table));
  assert.equal(batch.length, 5);
});

test('missing log tab fallback does not leak excluded health details', () => {
  const h = host();
  delete h.tabs.import_sync_issues;
  h.c.amazonLogIssues_('fixture-db', [
    { destination_table: health, error_message: 'excluded-detail' },
    { destination_table: 'amazon_inventory_snapshot', error_message: 'retained-detail' }
  ]);
  assert.equal(h.messages.length, 1);
  assert.match(h.messages[0], /retained-detail/);
  assert.doesNotMatch(h.messages[0], /excluded-detail/);
});

test('empty issue batch performs no DB access', () => {
  const h = host();
  h.c.amazonLogIssues_('fixture-db', []);
  assert.equal(h.opened.length, 0);
});

test('logger remains best-effort for a malformed batch', () => {
  const h = host();
  assert.doesNotThrow(() => h.c.amazonLogIssues_('fixture-db', null));
  assert.equal(h.opened.length, 0);
  assert.match(h.messages[0], /amazonLogIssues_ failed/);
});

test('health numeric warning still blanks invalid values and writes snapshot/run', () => {
  const h = fixture();
  h.row['inv-age-181-to-270-days'] = 'unexpected-date-value';
  const result = h.run();
  assert.equal(result.status, 'success');
  assert.equal(result.rows_written, 1);
  assert.equal(result.issues, 1);
  assert.equal(h.issues.grid.length, 1);
  assert.equal(h.runs.grid[1][1], 'success');
  const index = h.snapshot.grid[0].indexOf('inv_age_181_to_270_days');
  assert.equal(h.snapshot.grid[1][index], '');
});

test('health missing required header still fails and preserves the existing snapshot', () => {
  const h = fixture();
  h.source.headers = h.source.headers.filter(name => name !== 'SKU');
  const before = JSON.stringify(h.snapshot.grid);
  const result = h.run();
  assert.equal(result.status, 'failed');
  assert.equal(result.issues, 1);
  assert.equal(JSON.stringify(h.snapshot.grid), before);
  assert.equal(h.issues.grid.length, 1);
  assert.match(h.runs.grid[1][2], /missing_required_header: SKU/);
});

test('health key errors and duplicates remain counted and skipped', () => {
  const h = fixture();
  h.source.rows.push({ ...h.row }, { ...h.row, SKU: '' });
  const result = h.run();
  assert.equal(result.status, 'partial_success');
  assert.equal(result.rows_written, 1);
  assert.equal(result.rows_error, 1);
  assert.equal(result.rows_duplicate, 1);
  assert.equal(result.issues, 2);
  assert.equal(h.issues.grid.length, 1);
  assert.deepEqual(h.runs.grid[1].slice(3), [1, 1]);
});

test('health source-read failure remains visible in run log', () => {
  const h = fixture();
  h.c.amazonReadSheetSource_ = () => { throw new Error('fixture-source-unavailable'); };
  assert.equal(h.run().status, 'failed');
  assert.match(h.runs.grid[1][2], /source_read_error: fixture-source-unavailable/);
  assert.equal(h.issues.grid.length, 1);
});

test('health destination-write failure remains visible in run log', () => {
  const h = fixture();
  h.c.amazonWriteSnapshot_ = () => { throw new Error('fixture-destination-unwritable'); };
  assert.equal(h.run().status, 'failed');
  assert.match(h.runs.grid[1][2], /destination_write_error: fixture-destination-unwritable/);
  assert.equal(h.issues.grid.length, 1);
});

test('inventory report missing required header still logs detail and fails', () => {
  const h = fixture('amazon_inventory_snapshot');
  h.source.headers = h.source.headers.filter(name => name !== 'SKU');
  assert.equal(h.run().status, 'failed');
  assert.equal(h.issues.grid.length, 2);
  assert.deepEqual(h.issues.grid[1], ['amazon_inventory_snapshot', 'missing_required_header', 'error']);
});
