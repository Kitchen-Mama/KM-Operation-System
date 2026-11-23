const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const files = ['18_sku_regional_handlers.gs', '70_api_v1_overseas_stock_workspace.gs', '79_api_v1_po_import.gs',
  '81_api_v1_inventory_import.gs', '82_api_v1_po_factory_import.gs'];
const front = ['index.html', 'assets/js/app.js', 'assets/js/api/operation-system-db-api.js',
  'assets/js/pages/factory-stock.js', 'assets/js/pages/overseas-stock.js', 'assets/js/utils/import-batch.js',
  'assets/js/utils/po-factory-import.js', 'assets/js/utils/inventory-sku-identity.js'];
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const release = 'output/inventory-site-sku-20261123/release-1';
const base = 'output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/';
const manifest = { release: 'INVENTORY-SITE-SKU-1', environment: 'Production',
  apps_script_sync_required: files, bundle_rebuild_required: false,
  schema_changes: false, live_business_writes: 0, deployment_owner: 'USER',
  deployment_note: 'Replace all five named files in Production, save, then deploy a new Web App version. Never copy these Production files into Sandbox.',
  prerequisites: 'Existing DW2 release-4 Production import/router/journal/stock writers, plus the later document-retry fixes. This is a scoped overlay, not a complete backend.',
  build_note: 'Existing build strings stay compatible; verify this overlay by these exact SHA-256 hashes.', files: [] };
function emit(source, target, kind) {
  const text = read(source);
  if (/\.(gs|js)$/.test(source)) new vm.Script(text, { filename: source });
  const abs = path.join(root, release, target); fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (fs.existsSync(abs) && fs.readFileSync(abs, 'utf8') !== text) throw Error('Refusing to overwrite frozen release file: ' + abs);
  fs.writeFileSync(abs, text); manifest.files.push({ path: target, source, kind, sha256: sha(text) });
}
for (const f of files) {
  emit('assets/specs/active/apps-script/' + f, 'Production/apps-script/' + f, 'CANDIDATE');
  emit(base + f, 'Production/rollback/' + f, 'DW2_BASE_ROLLBACK');
}
for (const f of front) emit(f, 'frontend/' + f, 'FRONTEND');
emit('docs/handoffs/INVENTORY_SITE_SKU_20261123.txt', 'INSTALL.txt', 'INSTRUCTIONS');
fs.writeFileSync(path.join(root, release, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ release, files: manifest.files.length, manifest_sha256: sha(fs.readFileSync(path.join(root, release, 'MANIFEST.json'))) }));
