const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/shipment-overview-20261124/release-1');
const gs = 'assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs';
const baseCommit = '30267ee835bc8e5abba47685e73c5e67e3659441';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const norm = b => b.toString().replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
assert(!fs.existsSync(out), 'Use a fresh release directory');
const baseline = cp.execFileSync('git', ['show', baseCommit + ':' + gs], { cwd: root });
assert.equal(hash(norm(baseline)), 'e152f8c21ab82f609142b7ca108482401ffd5715e3dd6d508132f91ddee44b20');
new vm.Script(fs.readFileSync(path.join(root, gs), 'utf8'));
const files = {};
function emit(relative, bytes) {
  const target = path.join(out, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  files[relative] = { bytes: bytes.length, sha256: hash(bytes) };
  assert.equal(hash(fs.readFileSync(target)), files[relative].sha256);
}
emit('Production/apps-script/57_api_v1_shipment_workspace.gs', fs.readFileSync(path.join(root, gs)));
for (const f of ['index.html', 'assets/js/pages/shipping-history.js', 'assets/js/api/operation-system-db-api.js', 'assets/css/pages/shipping-history.css']) {
  emit('Production/site-delta/' + f, fs.readFileSync(path.join(root, f)));
}
emit('INSTALL.txt', Buffer.from([
  'SHIPMENT OVERVIEW - 2026-11-24 - Production overlay',
  '',
  '1. Back up the current Production Apps Script source/deployment.',
  '2. Replace ONLY 57_api_v1_shipment_workspace.gs with this package file.',
  '3. Save, then update the EXISTING Web App deployment to a NEW version; keep its URL unchanged.',
  '4. Frontend changes publish via the authorized GitHub push. Refresh the page (Ctrl+F5).',
  '5. Expand an imported shipment whose SKU Details contain carton and item weight metadata.',
  '',
  'Cartons = ceil(quantity / units_per_carton). CBM = cartons * carton volume in cubic metres.',
  'Gross kg = cartons * carton weight. Net kg = quantity * item weight (not package weight).',
  'Persisted logistics totals win. Missing or ambiguous reference data shows --, including incomplete totals.',
  'These estimates are display-only, not writes or a retroactive packing snapshot.',
  'No reimport, schema migration, backfill, initialization or bundle rebuild is needed.',
  'Do NOT replace config, router, auth, environment guard, DB binding or PIN.',
  'No supply eligibility, stock deduction, allocations, receipts, routes or document generation rules changed.',
  'Existing coarse health module stamp stays SO7 for compatibility. It alone cannot prove this overlay is live.',
  'The /exec shipment.workspace.get response includes skuLogistics when include.skuLogistics=true after deployment.',
  'The old backend remains readable, but cannot supply inferred Overview logistics until 57_ is deployed.',
  'The running local Sandbox and the frozen cumulative Sandbox package are NOT modified by this overlay.',
  '',
  'Tests use synthetic Sheets/Drive only, not live Production operations.',
  'Two retired receipt tests cannot start because their old PURE block markers are absent in the unchanged baseline 31_.',
  'This release does not claim live Production receipt UAT or those retired tests passed.',
  ''
].join('\n')));
emit('RELEASE.json', Buffer.from(JSON.stringify({ release: 'SHIPMENT-OVERVIEW-20261124', baseCommit,
  gsFiles: ['57_api_v1_shipment_workspace.gs'], liveBusinessWrites: 0, files: { ...files } }, null, 2) + '\n'));
fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), Object.entries(files).map(([f, meta]) => meta.sha256 + '  ' + f).join('\n') + '\n');
console.log(JSON.stringify({ out, files: Object.keys(files).length, gsFiles: 1, manifestSha256: hash(fs.readFileSync(path.join(out, 'SHA256SUMS.txt'))) }));
