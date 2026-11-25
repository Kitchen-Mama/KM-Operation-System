'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/inventory-pricing-hotfix-20261125/release');
const entries = [];
function emit(relative, content) {
  const dest = path.join(out, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
  entries.push({ path: relative, sha256: crypto.createHash('sha256').update(content).digest('hex') });
}
const gs = 'assets/specs/active/apps-script/';
for (const file of ['01_router.gs', '42_api_v1_recommendation_workspace.gs', '43_api_v1_gap_materialization.gs',
  '46_api_v1_gap_materialization_job.gs', '63_api_v1_system_health.gs', '90_generated_supply_planning_bundle.gs']) {
  const text = fs.readFileSync(path.join(root, gs, file), 'utf8');
  new Function(text);
  emit('apps-script/' + file, text);
}
// Extract only the date functions: the installed 17_ has pricing helpers absent from this mirror.
const carrier = fs.readFileSync(path.join(root, gs, '17_carrier_handlers.gs'), 'utf8');
const start = carrier.indexOf('function shippingRateDay_('), end = carrier.indexOf('/**', start);
if (start < 0 || end < start) throw Error('Date patch boundaries not found');
const patch = carrier.slice(start, end).trim() + '\n';
const functions = new Function(patch + '; return [shippingRateDay_, shippingRateActive_];')();
if (functions.length !== 2 || (patch.match(/function /g) || []).length !== 2) throw Error('Unexpected date patch content');
emit('patch-installed-17-date-functions.txt', patch);
for (const file of ['index.html', 'assets/js/app.js', 'assets/js/pages/inventory-replenishment.js', 'assets/js/pages/shipping-plan.js'])
  emit('frontend/' + file, fs.readFileSync(path.join(root, file)));
emit('README.md', fs.readFileSync(path.join(root, 'docs/handoffs/INVENTORY_PRICING_LOCK_HOTFIX_20261125.md')));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
  version: 'inventory-pricing-hotfix-20261125', appsScriptDeployed: false,
  warning: 'Patch only the named date functions in the installed 17_. Never replace its whole pricing engine with the mirror.', files: entries
}, null, 2) + '\n');
console.log('Release generated: ' + out + ' (' + entries.length + ' files plus SHA-256 manifest)');
