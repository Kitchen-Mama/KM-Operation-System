'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/po-factory-unproduced-20261124/release-2');
const baseline = 'a5225611c7ea9012c9eceaa1876dd2a332fdca90';
const gs = ['32_shipment_line_allocation_handlers.gs', '82_api_v1_po_factory_import.gs'];
const site = ['index.html', 'assets/js/pages/factory-stock.js', 'assets/js/pages/purchase-order-list.js', 'assets/js/utils/po-factory-import.js'];
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = file => norm(fs.readFileSync(path.join(root, file), 'utf8'));
const old = file => norm(cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
const files = [];
function emit(target, content) {
  if (/\.(?:gs|js)$/.test(target)) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to overwrite frozen package: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, bytes: Buffer.byteLength(content), sha256: hash(content) });
}
for (const name of gs) {
  const source = 'assets/specs/active/apps-script/' + name;
  emit('Production/apps-script/' + name, read(source)); emit('rollback/apps-script/' + name, old(source));
}
for (const file of site) { emit('Production/site-delta/' + file, read(file)); emit('rollback/site-delta/' + file, old(file)); }
emit('INSTALL.txt', read('docs/handoffs/PO_FACTORY_UNPRODUCED_20261124.md'));
emit('RELEASE.json', JSON.stringify({ release: 'STOCKPO-UNPRODUCED-20261124', baseline, environment: 'Production',
  apps_script_update_required: gs, frontend: site, auto_deployed_gs: false, sandbox_modified: false,
  db_migration_required: false, config_or_scope_changes: false }, null, 2) + '\n');
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
const dest = path.join(out, 'SHA256SUMS.txt');
if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== manifest) throw Error('Frozen manifest differs');
fs.writeFileSync(dest, manifest);
for (const file of files) if (hash(fs.readFileSync(path.join(out, file.file))) !== file.sha256 || file.bytes === 0) throw Error('Package verification failed: ' + file.file);
console.log(JSON.stringify({ out, count: files.length, files, manifest_sha256: hash(manifest) }, null, 2));
