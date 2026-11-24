'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/amazon-inventory-site-window-20261124/release-1');
const baseline = 'af65c092';
const norm = s => s.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const hash = s => crypto.createHash('sha256').update(s).digest('hex');
const names = ['06_amazon_import_config.gs', '07_amazon_import_runner.gs', '08_amazon_import_sources.gs', '09_amazon_import_writer_logger.gs', '10_amazon_import_helpers.gs'];
const givenPath = process.argv[2];
if (!givenPath) throw Error('Pass the Owner-supplied Production 07_ file path as the first argument (rollback baseline).');
const given = norm(fs.readFileSync(path.resolve(givenPath), 'utf8'));
new vm.Script(given, { filename: 'provided-production-07.gs' });
if (!given.includes('kmSrcRevMark_()') || !given.includes('kmSrcRevBump_(_m)')) throw Error('Expected the Owner Production revision wrapper in rollback 07_.');
const files = [];
function emit(target, content) {
  if (target.endsWith('.gs')) new vm.Script(content, { filename: target });
  const dest = path.join(out, target); fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.readFileSync(dest, 'utf8') !== content) throw Error('Refusing to overwrite frozen release: ' + target);
  fs.writeFileSync(dest, content); files.push({ file: target, bytes: Buffer.byteLength(content), sha256: hash(content) });
}
for (const name of names) {
  const source = 'assets/specs/active/apps-script/' + name;
  emit('Production/apps-script/' + name, norm(fs.readFileSync(path.join(root, source), 'utf8')));
  emit('rollback/apps-script/' + name, name.startsWith('07_') ? given : norm(cp.execFileSync('git', ['show', baseline + ':' + source], { cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })));
}
emit('INSTALL.txt', norm(fs.readFileSync(path.join(root, 'docs/handoffs/AMAZON_INVENTORY_SITE_WINDOW_20261124.md'), 'utf8')));
emit('RELEASE.json', JSON.stringify({ release: 'AMAZON-INVENTORY-SITE-WINDOW-20261124', baseline, environment: 'Production',
  apps_script_update_required: names, install_config_last: true, frontend_changed: false, auto_deployed: false,
  new_db_columns: [], source_or_destination_ids_changed: false, sandbox_changed: false, live_import_executed: false,
  provided_07_baseline_sha256: hash(given) }, null, 2) + '\n');
const manifest = files.sort((a, b) => a.file.localeCompare(b.file)).map(f => f.sha256 + '  ' + f.file).join('\n') + '\n';
const manifestPath = path.join(out, 'SHA256SUMS.txt');
if (fs.existsSync(manifestPath) && fs.readFileSync(manifestPath, 'utf8') !== manifest) throw Error('Frozen manifest differs');
fs.writeFileSync(manifestPath, manifest);
for (const f of files) if (!f.bytes || hash(fs.readFileSync(path.join(out, f.file))) !== f.sha256) throw Error('Package verification failed: ' + f.file);
console.log(JSON.stringify({ out, files, manifest_sha256: hash(manifest) }, null, 2));
