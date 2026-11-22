'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(root, process.argv[2] || 'output/document-contract-r1-20261122/release-2');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
let checked = 0;
for (const line of fs.readFileSync(path.join(out, 'INSTALL.sha256.txt'), 'utf8').trim().split(/\r?\n/)) {
  const m = /^([0-9a-f]{64}) \*(.+)$/.exec(line); assert(m);
  const f = path.resolve(out, m[2]); assert(f.startsWith(out + path.sep));
  assert.equal(sha(fs.readFileSync(f)), m[1], m[2]); checked++;
}
const report = JSON.parse(fs.readFileSync(path.join(out, 'RELEASE.json'), 'utf8'));
assert.deepEqual(report.sync_files, ['36_document_template_handlers.gs', '39_document_runtime_service.gs']);
for (const env of ['Sandbox', 'Production']) {
  const dir = path.join(out, 'candidate', env, 'apps-script');
  assert.deepEqual(fs.readdirSync(dir).sort(), report.sync_files);
  for (const f of report.sync_files) {
    const b = fs.readFileSync(path.join(dir, f));
    assert.equal(sha(b), report.environments[env][f].sha256);
    new vm.Script(b.toString('utf8'), { filename: env + '/' + f });
  }
  const testEnv = { ...process.env, DOC_HOTFIX_GS: dir, DOC_HOTFIX_BASE: path.join(root, 'output/dw2-workflow-20261122/release-4/candidate', env, 'apps-script') };
  const log = cp.execFileSync(process.execPath, ['assets/tests/document-contract-hotfix-r1.cjs'], { cwd: root, env: testEnv, encoding: 'utf8' });
  assert(log.includes('DOCUMENT_CONTRACT_HOTFIX_PASS 24 live_business_writes=0'));
  console.log(env + ' ' + log.trim().split(/\r?\n/).at(-1));
}
console.log('DOCUMENT_CONTRACT_VERIFY_OK files=' + checked + ' live_business_writes=0');
