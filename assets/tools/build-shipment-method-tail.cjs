'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/shipment-method-tail-20261124/release-2');
const baseline = '491b3c8525f8edf9650278bf1e1038ed10c0e8be';
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = file => norm(fs.readFileSync(path.join(root, file), 'utf8'));
const files = [];
function emit(target, content) {
  if (target.endsWith('.gs') || target.endsWith('.js')) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to overwrite frozen package: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, bytes: Buffer.byteLength(content), sha256: hash(content) });
}
for (const file of ['assets/specs/active/apps-script/80_api_v1_shipment_import.gs', 'assets/js/pages/purchase-order-overview.js', 'assets/js/pages/shipping-history.js', 'assets/css/pages/procurement.css', 'assets/html/pages/purchase-order-overview.html', 'index.html']) {
  const isGs = file.endsWith('.gs'), target = isGs ? 'apps-script/' + path.basename(file) : 'site/' + file;
  emit('Production/' + target, read(file));
  emit('rollback/' + target, norm(cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })));
}
emit('INSTALL.txt', read('docs/handoffs/SHIPMENT_METHOD_TAIL_ACTIVE_PO_20261124.md'));
emit('RELEASE.json', JSON.stringify({ release: 'SHIPMENT-METHOD-TAIL-ACTIVE-PO-20261124', baseline, environment: 'Production',
  apps_script_update_required: ['80_api_v1_shipment_import.gs'], frontend_update_required: true, auto_deployed: false,
  sandbox_modified: false, config_or_scope_changes: false, db_migration_required: false }, null, 2) + '\n');
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
const manifestPath = path.join(out, 'SHA256SUMS.txt');
if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') !== manifest) throw Error('Frozen manifest differs');
fs.writeFileSync(manifestPath, manifest);
for (const f of files) if (hash(fs.readFileSync(path.join(out, f.file))) !== f.sha256 || f.bytes === 0) throw Error('Package verification failed: ' + f.file);
console.log(JSON.stringify({ out, files, manifest_sha256: hash(manifest) }, null, 2));
