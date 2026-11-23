'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/order-mainline-c1-20261123/release-1');
const baseline = '7e88da6793173a1d4a796d92a78d65d8ff6c0cf6';
const files = ['index.html', 'assets/css/pages/procurement.css', 'assets/js/pages/purchase-order-list.js'];
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
const entries = [];
function write(relative, content) {
  const dest = path.join(out, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  entries.push({ file: relative, sha256: hash(fs.readFileSync(dest)) });
}
for (const file of files) {
  write('candidate/frontend/' + file, fs.readFileSync(path.join(root, file)));
  write('rollback/frontend/' + file, cp.execFileSync('git', ['show', baseline + ':' + file], { cwd: root, maxBuffer: 8 * 1024 * 1024 }));
}
write('INSTALL.txt', [
  'ORDER MAINLINE CHECKPOINT C1 - 2026-11-23',
  'Frontend-only delta. Baseline Git commit: ' + baseline,
  '',
  'Files: index.html, assets/css/pages/procurement.css, assets/js/pages/purchase-order-list.js.',
  'Keep the index.html/CSS/JS cache tokens together. No business DB rows are changed by installing these assets.',
  'The candidate index is the current repository entrypoint; review environment wiring before any manual copy to a separately hosted Sandbox.',
  'Never replace a Sandbox config, endpoint, router, PIN or credentials with Production values.',
  '',
  'APPS_SCRIPT_SYNC_REQUIRED: NONE (this checkpoint only).',
  'BUNDLE_REBUILD_REQUIRED: NO.',
  'Prior A1/B1 GS updates are still separate pending owner deployment. This package does not replace them.',
  'Sandbox last synchronization baseline: UNKNOWN; owner will verify before cumulative deployment.',
  'This is NOT the cumulative Sandbox GS package, not a deployment, and not live acceptance.',
  '',
  'Rollback files are exact Git blobs from the baseline above. Do not overlay them over newer unrelated owner edits.',
  'Tests: node assets/tests/order-mainline-browser-c1.cjs',
  'See docs/handoffs/ORDER_MAINLINE_BROWSER_C1_20261123.txt for evidence, boundaries and remaining work.',
  ''
].join('\n'));
const manifest = entries.sort((a, b) => a.file.localeCompare(b.file)).map(e => e.sha256 + '  ' + e.file).join('\n') + '\n';
fs.writeFileSync(path.join(out, 'INSTALL.sha256.txt'), manifest);
console.log(JSON.stringify({ path: out, files: entries.length, manifestSha256: hash(manifest), appsScriptFiles: 0 }, null, 2));
