'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const src = 'assets/specs/active/apps-script';
const baseCommit = 'd22fe681bf3a8d494091a25b58b0dbe837ac1cce';
const dw2 = 'output/dw2-workflow-20261122/release-4';
const r3 = 'output/carrier-document-r3-20261123/release-1';
const b1 = 'output/order-mainline-request-b1-20261123/release-1';
const ship = 'output/shipment-import-source-warehouse-20261123/release-2';
const inventory = 'output/inventory-site-sku-20261123/release-1';
const stableSandbox = 'C:/Users/viczh/kmc/pkg/phase1-next-20261113/joint-afinal-ad2-build/atests/c2/r/tests/int-trees/m/P0T-S/apps-script';
const out = path.resolve(root, process.argv[2] || 'output/order-mainline-c2-20261123/release-7');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const norm = bytes => bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const read = p => fs.readFileSync(path.resolve(root, p));
const put = (p, bytes) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); };
const privateName = name => /^(?:00_config|84_|\.env)|pin.*\.local|credential|secret/i.test(name);
const provenance = {};
assert(!fs.existsSync(out), 'Use a fresh release directory');
assert.equal(cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), baseCommit);

function verifyFrozen(dir, pin) {
  const manifest = read(dir + '/INSTALL.sha256.txt'); assert.equal(sha(manifest), pin, dir);
  const entries = new Map(norm(manifest).trim().split('\n').map(line => {
    const m = /^([a-f0-9]{64}) (?:\*| )(.+)$/.exec(line); assert(m, 'Invalid manifest row'); return [m[2], m[1]];
  }));
  const reader = relative => {
    const decoded = decodeURIComponent(relative);
    assert(!privateName(path.basename(decoded)), 'Private file excluded');
    const target = path.resolve(root, dir, decoded), base = path.resolve(root, dir) + path.sep;
    assert(target.startsWith(base), 'Frozen artifact path escape');
    const bytes = fs.readFileSync(target); assert.equal(sha(bytes), entries.get(relative), dir + '/' + relative); return bytes;
  };
  reader.paths = [...entries.keys()];
  return reader;
}
const D = verifyFrozen(dw2, '2e5be5c5d66e0a014606f7980b6adc8719e388ae909b3bfcabbf304cc8828c64');
const R = verifyFrozen(r3, 'c50dbb96b55d20fb935259514696709e512302afccc0259b31c291724115aa08');
const B = verifyFrozen(b1, '27845d6588fe982b6807e04d15a9e29a101e34c321c6a50c5fb501116eb90236');
const S = verifyFrozen(ship, '6ea02a5019cb9622214edc4160af66089823069987f77f5213f000c40bbb003f');
const inventoryManifest = read(inventory + '/MANIFEST.json');
assert.equal(sha(inventoryManifest), '591baee25ad836e8d8c8793e24905860a270e56e17b960e9951b70643230b64f');
const inventoryFiles = JSON.parse(inventoryManifest).files;

function emit(env, file, bytes, source) {
  assert(!privateName(file));
  if (file.endsWith('.gs')) new vm.Script(norm(bytes), { filename: file });
  const relative = env + '/apps-script/' + file;
  put(path.join(out, relative), bytes); provenance[relative] = { source, sha256: sha(bytes) };
}
function overlay(env, file, before, after, source) {
  const currentPath = path.join(out, env, 'apps-script', file);
  const current = fs.readFileSync(currentPath);
  if (norm(before) === norm(after)) return;
  const scratch = path.join(out, '_build', env, file);
  put(scratch + '.before', norm(before)); put(scratch + '.after', norm(after));
  const diff = cp.spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--no-color', '--', scratch + '.before', scratch + '.after'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  assert.equal(diff.status, 1);
  const hunksAt = diff.stdout.indexOf('@@'); assert(hunksAt >= 0);
  const patch = 'diff --git a/' + file + ' b/' + file + '\n--- a/' + file + '\n+++ b/' + file + '\n' + diff.stdout.slice(hunksAt);
  const directory = path.relative(root, path.dirname(currentPath)).replace(/\\/g, '/');
  const apply = cp.spawnSync('git', ['apply', '--whitespace=nowarn', '--directory=' + directory], { cwd: root, input: patch, encoding: 'utf8' });
  assert.equal(apply.status, 0, file + ': ' + apply.stderr);
  const bytes = fs.readFileSync(currentPath); new vm.Script(norm(bytes), { filename: file });
  provenance[env + '/apps-script/' + file] = { source, environment_base_sha256: sha(current), sha256: sha(bytes) };
}

// Production is a focused cumulative A1/B1/C2 overlay, not an environment bootstrap.
for (const file of ['13_procurement_handlers.gs', '39_document_runtime_service.gs', '51_api_v1_request_order_workspace.gs']) {
  emit('Production', file, read(src + '/' + file), 'current reviewed mainline source');
}

// Complete public Sandbox GS tree: retain its OWN safety adapters and module builds.
const allFiles = fs.readdirSync(path.join(root, dw2, 'candidate/Production/apps-script')).filter(f => !privateName(f) && /\.(gs|json)$/.test(f));
for (const file of allFiles) {
  const relative = 'candidate/Sandbox/apps-script/' + file;
  if (fs.existsSync(path.join(root, dw2, relative))) emit('Sandbox', file, D(relative), 'DW2 reviewed Sandbox');
  else {
    assert(file.endsWith('.gs')); assert(fs.existsSync(path.join(stableSandbox, file)), 'Missing own Sandbox base: ' + file);
    emit('Sandbox', file, fs.readFileSync(path.join(stableSandbox, file)), 'AD2 Sandbox public base named by DW2 builder');
  }
}
for (const file of ['12_shipment_handlers.gs', '34_shipment_final_output_handlers.gs', '36_document_template_handlers.gs', '37_shipment_document_file_renderer.gs', '39_document_runtime_service.gs']) {
  emit('Sandbox', file, R('candidate/Sandbox/apps-script/' + file), 'Carrier R3 own Sandbox candidate');
}
for (const file of ['13_procurement_handlers.gs', '39_document_runtime_service.gs']) emit('Sandbox', file, B('candidate/Sandbox/apps-script/' + file), 'A1/B1 own Sandbox candidate');
overlay('Sandbox', '13_procurement_handlers.gs', B('candidate/Production/apps-script/13_procurement_handlers.gs'), read(src + '/13_procurement_handlers.gs'), 'C2 delta on own Sandbox B1 base');
overlay('Sandbox', '51_api_v1_request_order_workspace.gs', D('candidate/Production/apps-script/51_api_v1_request_order_workspace.gs'), read(src + '/51_api_v1_request_order_workspace.gs'), 'C2 read-only capability handshake on own Sandbox workspace base');
for (const file of ['18_sku_regional_handlers.gs', '70_api_v1_overseas_stock_workspace.gs', '79_api_v1_po_import.gs', '81_api_v1_inventory_import.gs', '82_api_v1_po_factory_import.gs']) {
  const candidate = 'Production/apps-script/' + file, bytes = read(inventory + '/' + candidate);
  assert.equal(sha(bytes), inventoryFiles.find(f => f.path === candidate).sha256);
  overlay('Sandbox', file, D('candidate/Production/apps-script/' + file), bytes, 'Site-SKU delta on own Sandbox DW2/AD2 base');
}
overlay('Sandbox', '09_amazon_import_writer_logger.gs', D('candidate/Production/apps-script/09_amazon_import_writer_logger.gs'), read(src + '/09_amazon_import_writer_logger.gs'), 'Amazon health detail logging exclusion');
emit('Sandbox', '80_api_v1_shipment_import.gs', S('candidate/Sandbox/apps-script/80_api_v1_shipment_import.gs'), 'Source warehouse release-2 own Sandbox candidate');
const sbx = name => norm(fs.readFileSync(path.join(out, 'Sandbox/apps-script', name)));
assert(sbx('01_router.gs').includes('KM_SANDBOX'));
assert(sbx('63_api_v1_system_health.gs').includes('-DW2'));
assert.match(sbx('66_api_v1_request_order_send.gs'), /ROS_BUILD_VERSION_\s*=\s*['"][^'"]+-R64['"]/);
assert(!sbx('36_document_template_handlers.gs').includes('dtRequireKnownLayoutSc2_'));

const front = ['assets/js/api/operation-system-db-api.js', 'assets/js/app.js', 'assets/js/pages/request-order-draft.js',
  'assets/js/pages/purchase-order-list.js', 'assets/css/pages/procurement.css', 'assets/js/pages/shipping-history.js',
  'assets/js/pages/factory-stock.js', 'assets/js/pages/overseas-stock.js', 'assets/js/utils/import-batch.js',
  'assets/js/utils/po-factory-import.js', 'assets/js/utils/inventory-sku-identity.js'];
// All tracked common public assets support an older Sandbox frontend; environment entry/guard still come from Sandbox.
const publicAssets = cp.execFileSync('git', ['ls-files', '-z', '--', 'assets/js', 'assets/css', 'assets/html', 'assets/vendor', 'assets/img', 'assets/images', 'assets/fonts', 'assets/icons'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  .split('\0').filter(f => f && !f.split('/').some(privateName));
for (const file of publicAssets) put(path.join(out, 'Sandbox/site-delta', file), read(file));
for (const file of D.paths.filter(p => p.startsWith('candidate/Sandbox/site/')).map(p => p.slice('candidate/Sandbox/site/'.length))) {
  put(path.join(out, 'Sandbox/site-delta', decodeURIComponent(file)), D('candidate/Sandbox/site/' + file));
}
for (const file of front) {
  const bytes = read(file); if (file.endsWith('.js')) new vm.Script(norm(bytes), { filename: file });
  for (const env of ['Production', 'Sandbox']) put(path.join(out, env, 'site-delta', file), bytes);
}
put(path.join(out, 'Production/site-delta/index.html'), read('index.html'));
let index = norm(D('candidate/Sandbox/site/index.html'));
const currentIndex = norm(read('index.html'));
for (const file of front) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const current = new RegExp(escaped + '(?:\\?v=[^"\\s]+)?').exec(currentIndex);
  if (current && new RegExp(escaped).test(index)) index = index.replace(new RegExp(escaped + '(?:\\?v=[^"\\s]+)?', 'g'), current[0]);
}
if (!index.includes('assets/js/utils/inventory-sku-identity.js')) {
  const tag = currentIndex.split('\n').find(l => l.includes('src="assets/js/utils/inventory-sku-identity.js'));
  assert(tag); index = index.replace(/(^.*src="assets\/js\/api\/operation-system-db-api.js[^\n]+$)/m, tag + '\n$1');
}
assert(!index.includes('production-config.js'));
assert(index.includes('sandbox-guard.js') && index.includes('inventory-sku-identity.js') && index.includes('po-mainline-c2-20261123'));
put(path.join(out, 'Sandbox/site-delta/index.html'), index);
put(path.join(out, 'Sandbox/site-delta/sandbox-guard.js'), D('candidate/Sandbox/site/sandbox-guard.js'));
for (const file of ['expected/expected-health-sbx-dw2.json', 'tools/check-sbx-health-dw2.cjs', 'tools/SANDBOX_HEALTH_COPY_A2.v3_1.js']) put(path.join(out, 'Sandbox', file), D(file));

const report = { release: 'ORDER-MAINLINE-C2-20261123', base_commit: baseCommit,
  production_sync: ['13_procurement_handlers.gs', '39_document_runtime_service.gs', '51_api_v1_request_order_workspace.gs'],
  sandbox_full_public_gs_files: allFiles, private_config_included: false, keep_existing_environment_config: true,
  sandbox_common_public_assets: publicAssets.length,
  source_provenance: provenance, bundle_rebuilt: false, sandbox_existing_frozen_bundle_included: true,
  user_reported_sandbox_health: { editor_only: true, build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71', action_contract: 24, required_list_version: 20 },
  health_environment_note: 'Old health environment_mode is hardcoded production even in the own Sandbox source; validate Sandbox router gate and actual /exec, not this label alone.',
  schema_migration: false, live_business_writes: 0, apps_script_deployments: 0, owner_uat_required: true,
  constraints: ['Not a backup of current remote scripts or DB.', 'Retain own 00_config and 84 private adapters; never copy Production ones.',
    'Sandbox router/guard are NOT Production policy.', 'Production package requires the previously installed DW2/R3/DR4/import baselines.'] };
put(path.join(out, 'RELEASE.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ release: out, production_files: 3, sandbox_files: allFiles.length, bundle_rebuild: false }));
