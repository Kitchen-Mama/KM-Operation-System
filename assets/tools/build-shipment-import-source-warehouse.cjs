'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/shipment-import-source-warehouse-20261123/release-2');
const baseline = 'd613c0be4d9703b1d1ab7d4051aa86f131f2b8f5';
const name = '80_api_v1_shipment_import.gs';
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const read = file => norm(fs.readFileSync(path.join(root, file), 'utf8'));
const old = file => norm(cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const files = [];
function emit(target, content) {
  if (/\.(gs|js)$/.test(target)) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to change frozen package: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, sha256: hash(content) });
}
const source = 'assets/specs/active/apps-script/' + name;
for (const env of ['Production', 'Sandbox']) {
  const envBase = read('output/dw2-workflow-20261122/release-4/candidate/' + env + '/apps-script/' + name);
  if (envBase !== old(source)) throw Error(env + ' 80_ baseline diverges; review its environment-specific differences first');
  emit('candidate/' + env + '/apps-script/' + name, read(source));
  emit('rollback/' + env + '/apps-script/' + name, envBase);
}
for (const file of ['index.html', 'assets/js/pages/shipping-history.js']) {
  emit('candidate/frontend/' + file, read(file)); emit('rollback/frontend/' + file, old(file));
}
emit('INSTALL.txt', read('docs/handoffs/SHIPMENT_IMPORT_SOURCE_WAREHOUSE_20261123.txt'));
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
fs.writeFileSync(path.join(out, 'INSTALL.sha256.txt'), manifest);
console.log(JSON.stringify({ out, files: files.length, manifestSha256: hash(manifest), appsScriptSyncRequired: [name] }, null, 2));
