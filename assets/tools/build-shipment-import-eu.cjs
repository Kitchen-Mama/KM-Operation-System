'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/shipment-import-eu-20261124/release-1');
const baseline = '38abd04ce7d384496140964add42ca6ac11291f1';
const names = ['22_shipment_dispatch_handlers.gs', '80_api_v1_shipment_import.gs'];
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = file => norm(fs.readFileSync(path.join(root, file), 'utf8'));
const old = file => norm(cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
const files = [];
function emit(target, content) {
  if (target.endsWith('.gs')) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to overwrite frozen package: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, bytes: Buffer.byteLength(content), sha256: hash(content) });
}
for (const name of names) {
  const source = 'assets/specs/active/apps-script/' + name;
  emit('Production/apps-script/' + name, read(source));
  emit('rollback/apps-script/' + name, old(source));
}
emit('INSTALL.txt', read('docs/handoffs/SHIPMENT_IMPORT_EU_20261124.md'));
emit('RELEASE.json', JSON.stringify({ release: 'SHIPMENT-IMPORT-EU-20261124', baseline, environment: 'Production',
  apps_script_update_required: names, frontend_update_required: false, auto_deployed: false,
  sandbox_modified: false, config_or_scope_changes: false, db_migration_required: false }, null, 2) + '\n');
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
const manifestPath = path.join(out, 'SHA256SUMS.txt');
if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') !== manifest) throw Error('Frozen manifest differs');
fs.writeFileSync(manifestPath, manifest);
for (const file of files) if (hash(fs.readFileSync(path.join(out, file.file))) !== file.sha256 || file.bytes === 0) throw Error('Package verification failed: ' + file.file);
console.log(JSON.stringify({ out, files, manifest_sha256: hash(manifest) }, null, 2));
