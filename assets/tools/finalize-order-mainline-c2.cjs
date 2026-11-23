'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const release = path.resolve(root, process.argv[2] || 'output/order-mainline-c2-20261123/release-7');
const report = JSON.parse(fs.readFileSync(path.join(release, 'RELEASE.json'), 'utf8'));
const verification = JSON.parse(fs.readFileSync(path.join(release, 'VERIFICATION.json'), 'utf8'));
assert(verification.success && verification.results.length === 9 && verification.results.every(r => r.status === 0));
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const privateName = name => /^(?:00_config|84_|\.env)|pin.*\.local|credential|secret/i.test(name);
function files(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    assert(!entry.isSymbolicLink() && !privateName(entry.name), 'Private/unexpected payload: ' + entry.name);
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    return entry.isDirectory() ? files(dir, relative) : [relative];
  }).sort();
}
for (const [relative, proof] of Object.entries(report.source_provenance)) assert.equal(sha(fs.readFileSync(path.join(release, relative))), proof.sha256, relative);
const archives = [];
for (const environment of ['Production', 'Sandbox']) {
  const dir = path.join(release, environment);
  fs.writeFileSync(path.join(dir, 'INSTALL.txt'), fs.readFileSync(path.join(root, 'docs/handoffs/ORDER_MAINLINE_C2_INSTALL_20261123.txt')));
  fs.writeFileSync(path.join(dir, 'SOURCE_MANIFEST.json'), JSON.stringify({ environment, release: report.release,
    base_commit: report.base_commit, private_config_included: false, owner_deployment_required: true,
    source_provenance: Object.fromEntries(Object.entries(report.source_provenance).filter(([p]) => p.startsWith(environment + '/'))),
    verification: verification.results.filter(r => r.environment === environment) }, null, 2) + '\n');
  const list = files(dir).filter(f => f !== 'SHA256SUMS.txt');
  const manifest = list.map(f => sha(fs.readFileSync(path.join(dir, f))) + ' *' + f).join('\n') + '\n';
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), manifest);
  const zip = path.join(release, environment === 'Production' ? 'Production-Order-Mainline-C2.zip' : 'Sandbox-Cumulative-C2.zip');
  assert(!fs.existsSync(zip), 'Frozen zip already exists');
  cp.execFileSync('C:/Windows/System32/tar.exe', ['-a', '-c', '-f', zip, '-C', dir, '.']);
  const roundtrip = path.join(release, 'archive-check', environment);
  fs.mkdirSync(roundtrip, { recursive: true });
  cp.execFileSync('C:/Windows/System32/tar.exe', ['-x', '-f', zip, '-C', roundtrip]);
  for (const f of list.concat('SHA256SUMS.txt')) assert.equal(sha(fs.readFileSync(path.join(roundtrip, f))), sha(fs.readFileSync(path.join(dir, f))), 'ZIP roundtrip: ' + f);
  assert.equal(files(roundtrip).length, list.length + 1);
  archives.push({ environment, path: path.basename(zip), files: list.length + 1, bytes: fs.statSync(zip).size, sha256: sha(fs.readFileSync(zip)) });
}
fs.writeFileSync(path.join(release, 'INSTALL.txt'), fs.readFileSync(path.join(root, 'docs/handoffs/ORDER_MAINLINE_C2_INSTALL_20261123.txt')));
fs.writeFileSync(path.join(release, 'ARCHIVES.json'), JSON.stringify({ archives, roundtripVerified: true, liveBusinessWrites: 0, deployments: 0 }, null, 2) + '\n');
fs.writeFileSync(path.join(release, 'SHA256SUMS.txt'), archives.map(a => a.sha256 + ' *' + a.path).join('\n') + '\n');
console.log(JSON.stringify({ archives, roundtripVerified: true }));
