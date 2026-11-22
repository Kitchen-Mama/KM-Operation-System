'use strict';
// Generate a public, two-file overlay against each environment's frozen DW2 base.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const base = path.join(root, 'output/dw2-workflow-20261122/release-4');
const out = path.resolve(root, process.argv[2] || 'output/document-contract-r1-20261122/release-2');
const source = 'assets/specs/active/apps-script';
const files = ['36_document_template_handlers.gs', '39_document_runtime_service.gs'];
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const put = (f, b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, b); };
assert(!fs.existsSync(out), 'Use a fresh output directory');
const basePin = '2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64';
assert.equal(sha(fs.readFileSync(path.join(base, 'INSTALL.sha256.txt'))), basePin);
const manifest = new Map(fs.readFileSync(path.join(base, 'INSTALL.sha256.txt'), 'utf8').trim().split(/\r?\n/).map(l => { const m = /^([0-9a-f]{64}) \*(.+)$/.exec(l); assert(m); return [m[2].replace(/%20/g, ' '), m[1]]; }));
const patch = cp.execFileSync('git', ['diff', '--no-ext-diff', '--relative=' + source, '--', ...files.map(f => source + '/' + f)], { cwd: root, encoding: 'utf8' });
assert(patch.includes('DOC-CONTRACT-R1'), 'Build before the hotfix commit from the reviewed working diff');
put(path.join(out, 'hotfix.patch'), patch);
const report = { release: 'r6.10.1-document-contract-r1', base: 'DW2 release-4', base_install_sha256: basePin, sync_files: files, live_business_writes: 0, schema_changes: false, bundle_rebuild: false, frontend_changes: false, apps_script_deployment: 'OWNER_REQUIRED', environments: {} };
for (const env of ['Sandbox', 'Production']) {
  const dir = path.join(out, 'candidate', env, 'apps-script'), old = {};
  for (const f of files) {
    const key = 'candidate/' + env + '/apps-script/' + f, b = fs.readFileSync(path.join(base, key));
    assert.equal(sha(b), manifest.get(key), 'Frozen source checksum ' + key);
    old[f] = sha(b); put(path.join(dir, f), b);
  }
  cp.execFileSync('git', ['apply', '--whitespace=nowarn', '--directory=' + path.relative(root, dir).replace(/\\/g, '/')], { cwd: root, input: patch });
  report.environments[env] = Object.fromEntries(files.map(f => {
    let b = fs.readFileSync(path.join(dir, f));
    if (env === 'Production') {
      const mirror = fs.readFileSync(path.join(root, source, f));
      assert.equal(b.toString('utf8').replace(/\r\n/g, '\n'), mirror.toString('utf8').replace(/\r\n/g, '\n'), 'Production mirror ' + f);
      b = mirror; put(path.join(dir, f), b);
    }
    return [f, { base_sha256: old[f], sha256: sha(b) }];
  }));
}
put(path.join(out, 'OWNER_STEPS.md'), fs.readFileSync(path.join(root, 'docs/planning/DOCUMENT_CONTRACT_HOTFIX_R1_20261122.md')));
put(path.join(out, 'RELEASE.json'), JSON.stringify(report, null, 2) + '\n');
const listing = ['hotfix.patch', 'OWNER_STEPS.md', 'RELEASE.json', ...['Sandbox', 'Production'].flatMap(env => files.map(f => 'candidate/' + env + '/apps-script/' + f))];
put(path.join(out, 'INSTALL.sha256.txt'), listing.sort().map(f => sha(fs.readFileSync(path.join(out, f))) + ' *' + f).join('\n') + '\n');
console.log('DOCUMENT_CONTRACT_BUILD_OK ' + out + '\nINSTALL_SHA256 ' + sha(fs.readFileSync(path.join(out, 'INSTALL.sha256.txt'))));
