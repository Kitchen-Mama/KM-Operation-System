const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), src = 'assets/specs/active/apps-script';
const baseline = 'f7843d49878b66cdf2309955cca86287209d969b';
const previous = path.join(root, 'output/order-mainline-po-documents-20261123/release-1');
const out = path.resolve(root, process.argv[2] || 'output/order-mainline-request-b1-20261123/release-1');
const files = ['13_procurement_handlers.gs', '39_document_runtime_service.gs'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const norm = b => b.toString('utf8').replace(/\r\n/g, '\n');
const put = (p, bytes) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
assert(!fs.existsSync(out), 'Choose a fresh output directory');
assert.equal(cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), baseline);
const install = fs.readFileSync(path.join(previous, 'INSTALL.sha256.txt'));
assert.equal(sha(install), 'a6d45e914f0e32c25cd6f91c90e513e1b08805fbe8da826c42260c68342aea66');
const hashes = new Map(norm(install).trim().split('\n').map(line => { const m = /^([a-f0-9]{64}) \*(.+)$/.exec(line); assert(m); return [m[2], m[1]]; }));
const patch = cp.execFileSync('git', ['diff', '--no-ext-diff', '--relative=' + src, '--', src + '/13_procurement_handlers.gs'], { cwd: root, encoding: 'utf8' });
assert(patch.includes('roLockedMutation_') && patch.includes('roTxUndo_'));
put(path.join(out, 'hotfix.patch'), patch);
const report = { release: 'ORDER-MAINLINE-REQUEST-B1', base_commit: baseline,
  runtime_changed: ['13_procurement_handlers.gs'], cumulative_po_sync: files,
  reason_for_39: 'Unchanged A1 dependency, included because Sandbox synchronization is deferred.',
  schema_changed: false, frontend_changed: false, bundle_rebuild: false, live_business_writes: 0,
  deployment_status: 'NOT_DEPLOYED_WAIT_FOR_CUMULATIVE_SANDBOX_UAT', environments: {} };
for (const env of ['Sandbox', 'Production']) {
  const dir = path.join(out, 'candidate', env, 'apps-script');
  const details = {};
  for (const name of files) {
    const p = 'candidate/' + env + '/apps-script/' + name, bytes = fs.readFileSync(path.join(previous, p));
    assert.equal(sha(bytes), hashes.get(p), p);
    if (env === 'Production') assert.equal(norm(bytes), norm(cp.execFileSync('git', ['show', baseline + ':' + src + '/' + name], { cwd: root })));
    details[name] = { previous_a1_sha256: sha(bytes) };
    put(path.join(dir, name), bytes); put(path.join(out, 'rollback', env, name), bytes);
  }
  cp.execFileSync('git', ['apply', '--whitespace=nowarn', '--directory=' + path.relative(root, dir).replace(/\\/g, '/')], { cwd: root, input: patch });
  for (const name of files) {
    const bytes = fs.readFileSync(path.join(dir, name)); new vm.Script(bytes.toString('utf8'), { filename: name });
    if (env === 'Production') assert.equal(norm(bytes), norm(fs.readFileSync(path.join(root, src, name))));
    details[name].sha256 = sha(bytes);
  }
  report.environments[env] = details;
  for (const [label, file] of [['A1', 'order-mainline-po-documents.cjs'], ['B1', 'order-mainline-request-transactions.cjs']]) {
    const run = cp.spawnSync(process.execPath, ['--test', 'assets/tests/' + file], { cwd: root, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, KM_RO_GS: dir, KM_PO_GS: dir } });
    put(path.join(out, env + '-' + label + '-TESTS.txt'), (run.stdout || '') + (run.stderr || ''));
    assert.equal(run.status, 0, env + ' ' + label + ' candidate tests failed');
  }
}
put(path.join(out, 'OWNER_STEPS.txt'), fs.readFileSync(path.join(root, 'docs/handoffs/ORDER_MAINLINE_REQUEST_B1_20261123.txt')));
put(path.join(out, 'RELEASE.json'), JSON.stringify(report, null, 2) + '\n');
const installed = ['hotfix.patch', 'OWNER_STEPS.txt', 'RELEASE.json', ...['Sandbox', 'Production'].flatMap(env =>
  [env + '-A1-TESTS.txt', env + '-B1-TESTS.txt', ...files.flatMap(name => ['candidate/' + env + '/apps-script/' + name, 'rollback/' + env + '/' + name])])];
put(path.join(out, 'INSTALL.sha256.txt'), installed.sort().map(p => sha(fs.readFileSync(path.join(out, p))) + ' *' + p).join('\n') + '\n');
console.log(JSON.stringify({ release: out, environments_verified: ['Sandbox', 'Production'], install_sha256: sha(fs.readFileSync(path.join(out, 'INSTALL.sha256.txt'))) }));
