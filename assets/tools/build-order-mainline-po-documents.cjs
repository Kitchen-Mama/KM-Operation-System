const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const src = 'assets/specs/active/apps-script';
const baseline = 'e020fb4325ba43089012aa57e6b1fe8c2fefd3de';
const out = path.resolve(root, process.argv[2] || 'output/order-mainline-po-documents-20261123/release-1');
const files = ['13_procurement_handlers.gs', '39_document_runtime_service.gs'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const normal = b => b.toString('utf8').replace(/\r\n/g, '\n');
const put = (p, b) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); };
function pinned(dir, expected) {
  const bytes = fs.readFileSync(path.join(root, dir, 'INSTALL.sha256.txt')); assert.equal(sha(bytes), expected);
  const map = new Map(normal(bytes).trim().split('\n').map(line => { const m = /^([a-f0-9]{64}) \*(.+)$/.exec(line); assert(m); return [m[2], m[1]]; }));
  return (relative) => { const b = fs.readFileSync(path.join(root, dir, relative)); assert.equal(sha(b), map.get(relative), relative); return b; };
}
assert(!fs.existsSync(out), 'Choose a fresh release directory');
assert.equal(cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), baseline);
const dw = pinned('output/dw2-workflow-20261122/release-4', '2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64');
const r3 = pinned('output/carrier-document-r3-20261123/release-1', 'c50dbb96b55d20fb935259514696709e512302afccc0259b31c291724115aa08');
const patch = cp.execFileSync('git', ['diff', '--no-ext-diff', '--relative=' + src, '--', ...files.map(f => src + '/' + f)], { cwd: root, encoding: 'utf8' });
assert(patch.includes('dgsPoNumber_') && patch.includes('dgsPoReusePrepared_'));
put(path.join(out, 'hotfix.patch'), patch);
const report = { release: 'ORDER-MAINLINE-PO-DOCS-A1', base_commit: baseline,
  sync_files: files, frontend_changed: false, bundle_rebuild_required: false, schema_changed: false,
  live_business_writes: 0, apps_script_deployment: 'OWNER_REQUIRED', source_baseline: 'Verified frozen packages; not a live deployed-source assertion', environments: {} };
for (const env of ['Sandbox', 'Production']) {
  const dir = path.join(out, 'candidate', env, 'apps-script'), baseHashes = {};
  for (const f of files) {
    const b = (f.startsWith('13_') ? dw : r3)('candidate/' + env + '/apps-script/' + f);
    baseHashes[f] = sha(b); put(path.join(out, 'rollback', env, f), b); put(path.join(dir, f), b);
    if (env === 'Production') assert.equal(normal(b), normal(cp.execFileSync('git', ['show', baseline + ':' + src + '/' + f], { cwd: root })));
  }
  cp.execFileSync('git', ['apply', '--whitespace=nowarn', '--directory=' + path.relative(root, dir).replace(/\\/g, '/')], { cwd: root, input: patch });
  report.environments[env] = Object.fromEntries(files.map(f => {
    const b = fs.readFileSync(path.join(dir, f)); new vm.Script(b.toString('utf8'), { filename: f });
    if (env === 'Production') assert.equal(normal(b), normal(fs.readFileSync(path.join(root, src, f))));
    return [f, { base_sha256: baseHashes[f], sha256: sha(b) }];
  }));
  const run = cp.spawnSync(process.execPath, ['--test', 'assets/tests/order-mainline-po-documents.cjs'], {
    cwd: root, encoding: 'utf8', timeout: 120000, env: { ...process.env, KM_PO_GS: dir }
  });
  put(path.join(out, env + '-TESTS.txt'), (run.stdout || '') + (run.stderr || ''));
  assert.equal(run.status, 0, env + ' candidate regression failed');
}
put(path.join(out, 'OWNER_STEPS.txt'), fs.readFileSync(path.join(root, 'docs/handoffs/ORDER_MAINLINE_PO_DOCUMENTS_A1_20261123.txt')));
put(path.join(out, 'RELEASE.json'), JSON.stringify(report, null, 2) + '\n');
const installed = ['hotfix.patch', 'OWNER_STEPS.txt', 'RELEASE.json', 'Sandbox-TESTS.txt', 'Production-TESTS.txt',
  ...['Sandbox', 'Production'].flatMap(env => files.flatMap(f => ['candidate/' + env + '/apps-script/' + f, 'rollback/' + env + '/' + f]))];
put(path.join(out, 'INSTALL.sha256.txt'), installed.sort().map(p => sha(fs.readFileSync(path.join(out, p))) + ' *' + p).join('\n') + '\n');
console.log(JSON.stringify({ release: out, candidates_passed: ['Sandbox', 'Production'], install_sha256: sha(fs.readFileSync(path.join(out, 'INSTALL.sha256.txt'))) }));
