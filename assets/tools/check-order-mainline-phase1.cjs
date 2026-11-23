const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'output/order-mainline-phase1-20261123');
const files = [
  'order-mainline-phase1.cjs',
  'send-orchestration-and-station-scope-f1-7n-fb-3b.test.js',
  'send-request-exactly-once-f1-4b-fm6r4e5b.test.js',
  'request-order-send-missing-upc-guard-s8-r49-c.test.js',
  'request-order-flat-lifecycle-preflight-f1-7n-fa-3c-r6a.test.js',
  'api-request-order-workspace-f1-7d-r1.test.js',
  'api-purchase-order-workspace-f1-7c-r1.test.js',
  'api-procurement-cold-start-and-sku-regional-reentry-f1-7m-b2-r1.test.js',
  'po-exactly-once-f1-5a-por2.test.js',
  'po-receive-factory-stock-handoff-f1-7n-fa-3b0-pre.test.js',
  'procurement-shipment-qty-source.test.js',
  's6-r6-movement-vocabulary-and-receipt.test.js',
  'shipment-po-document-automation-and-transit-flow-f1-7n-fb-1.test.js',
  'domestic-workflow-dw2.cjs',
  'po-list-multiselect.test.js'
];

fs.mkdirSync(output, { recursive: true });
const results = files.map(file => {
  const result = cp.spawnSync(process.execPath, file === 'order-mainline-phase1.cjs'
    ? ['--test', 'assets/tests/' + file] : ['assets/tests/' + file], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4000000
  });
  const log = (result.stdout || '') + '\n' + (result.stderr || '');
  fs.writeFileSync(path.join(output, file + '.log'), log);
  return { file, exit_code: result.status, error: result.error ? result.error.message : null,
    tail: log.trim().split(/\r?\n/).slice(-8),
    diagnostics: log.split(/\r?\n/).filter(line => /^FAIL |^Error:|^ReferenceError:/.test(line)).slice(0, 25) };
});

const report = {
  stage: 'REVIEW_AND_SYNTHETIC_BASELINE_ONLY',
  acceptance: 'NOT_CLOSED_KNOWN_GAPS',
  note: 'The new 15-test audit contains nine ordinary checks, five known-defect reproductions and one source-drift probe. Passing probes mean the defects were reproduced, NOT fixed.',
  baseline_commit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  generated_at_utc: new Date().toISOString(),
  live_business_writes: 0,
  runtime_source_changes: 0,
  passed_scripts: results.filter(result => result.exit_code === 0).length,
  failed_scripts: results.filter(result => result.exit_code !== 0).length,
  results
};
fs.writeFileSync(path.join(output, 'BASELINE.json'), JSON.stringify(report, null, 2) + '\n');
for (const result of results) console.log((result.exit_code === 0 ? 'PASS ' : 'BASELINE_FAILURE ') + result.file);
console.log(JSON.stringify({ acceptance: report.acceptance, passed_scripts: report.passed_scripts,
  failed_scripts: report.failed_scripts, report: path.relative(root, path.join(output, 'BASELINE.json')) }));
// This is an audit, not a green-test wrapper. Existing failing scripts remain a nonzero result.
process.exitCode = report.failed_scripts ? 1 : 0;
