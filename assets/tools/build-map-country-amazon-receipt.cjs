'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/map-country-amazon-receipt-20261124/release-1');
const baseline = '53122973237cdcbc5b1a729fa5929c48ce101165';
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = file => norm(fs.readFileSync(path.join(root, file), 'utf8'));
const files = [];
function emit(target, content) {
  if (/\.(?:gs|js)$/.test(target)) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to overwrite frozen package: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, bytes: Buffer.byteLength(content), sha256: hash(content) });
}
for (const file of ['assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs', 'assets/specs/active/apps-script/80_api_v1_shipment_import.gs',
  'assets/js/app.js', 'assets/js/pages/global-logistics-map.js', 'assets/js/pages/shipping-history.js', 'index.html']) {
  const target = file.endsWith('.gs') ? 'apps-script/' + path.basename(file) : 'site/' + file;
  emit('Production/' + target, read(file));
  emit('rollback/' + target, norm(cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })));
}
emit('INSTALL.txt', read('docs/handoffs/MAP_COUNTRY_AMAZON_RECEIPT_20261124.md'));
emit('RELEASE.json', JSON.stringify({ release: 'MAP-COUNTRY-AMAZON-RECEIPT-20261124', baseline, environment: 'Production',
  apps_script_update_required: ['31_shipment_receipt_route_handlers.gs', '80_api_v1_shipment_import.gs'], frontend_update_required: true,
  auto_deployed: false, sandbox_modified: false, live_business_writes: 0, new_db_columns: [], api_actions_changed: false, credentials_changed: false }, null, 2) + '\n');
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
const manifestPath = path.join(out, 'SHA256SUMS.txt');
if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') !== manifest) throw Error('Frozen manifest differs');
fs.writeFileSync(manifestPath, manifest);
for (const f of files) if (!f.bytes || hash(fs.readFileSync(path.join(out, f.file))) !== f.sha256) throw Error('Package verification failed: ' + f.file);
console.log(JSON.stringify({ out, files, manifest_sha256: hash(manifest) }, null, 2));
