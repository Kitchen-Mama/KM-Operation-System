'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const release = path.resolve(root, process.argv[2] || 'output/order-mainline-c2-20261123/release-7');
assert.equal(JSON.parse(fs.readFileSync(path.join(release, 'RELEASE.json'), 'utf8')).release, 'ORDER-MAINLINE-C2-20261123', 'Build must have completed before verification');
const results = [];
for (const environment of ['Production', 'Sandbox']) {
  const dir = path.join(release, environment, 'apps-script');
  const env = { ...process.env, KM_MAINLINE_GS: dir, KM_RO_GS: dir, KM_PO_GS: dir,
    KM_MAINLINE_SITE: path.join(release, environment, 'site-delta'),
    KM_SITE_GS: dir, CARRIER_R3_GS: dir, KM_SHIPMENT_IMPORT_GS: path.join(release, 'Sandbox/apps-script/80_api_v1_shipment_import.gs') };
  const suites = [
    ['mainline', ['--test', 'assets/tests/order-mainline-po-documents.cjs', 'assets/tests/order-mainline-request-transactions.cjs',
      'assets/tests/order-mainline-purchase-setup.cjs', 'assets/tests/order-planning-mainline.cjs']],
    ['browser-c2', ['assets/tests/order-mainline-browser-c2.cjs']],
    ['browser-c1', ['assets/tests/order-mainline-browser-c1.cjs']]
  ];
  if (environment === 'Sandbox') suites.push(['inventory', ['--test', 'assets/tests/inventory-site-sku.cjs']],
    ['carrier', ['assets/tests/carrier-document-r3.cjs']], ['shipment-source', ['--test', 'assets/tests/shipment-import-source-warehouse.cjs']]);
  for (const [name, args] of suites) {
    const output = path.join(release, 'verification', environment, name);
    const result = cp.spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 180000,
      env: { ...env, KM_BROWSER_OUTPUT: output } });
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'TESTS.txt'), (result.stdout || '') + (result.stderr || ''));
    console.log(environment + ' ' + name + ' status=' + result.status);
    results.push({ environment, suite: name, status: result.status });
    if (result.status !== 0) console.log((result.stdout || '').slice(-4500) + (result.stderr || '').slice(-4500));
    assert.equal(result.status, 0, environment + ' ' + name);
  }
}
fs.writeFileSync(path.join(release, 'VERIFICATION.json'), JSON.stringify({ success: true, liveBusinessWrites: 0, deployments: 0, results }, null, 2) + '\n');
console.log('C2_BOTH_ENVIRONMENT_CANDIDATES_VERIFIED live_business_writes=0 deployments=0');
