'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'output/daily-warehouse-allocation-20261125/release-v1');
const files = [], gs = 'assets/specs/active/apps-script/';
function emit(relative, data) {
  const file = path.join(out, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data);
  files.push({ path: relative, sha256: crypto.createHash('sha256').update(data).digest('hex') });
}
for (const name of ['01_router.gs', '42_api_v1_recommendation_workspace.gs', '43_api_v1_gap_materialization.gs',
  '46_api_v1_gap_materialization_job.gs', '63_api_v1_system_health.gs', '90_generated_supply_planning_bundle.gs']) {
  const data = fs.readFileSync(path.join(root, gs, name), 'utf8'); new Function(data); emit('apps-script/' + name, data);
}
for (const name of ['index.html', 'assets/js/app.js', 'assets/js/pages/inventory-replenishment.js', 'assets/js/utils/gap-recalc-transport.js']) {
  emit('frontend/' + name, fs.readFileSync(path.join(root, name)));
}
emit('README.md', fs.readFileSync(path.join(root, 'docs/handoffs/SITE_INVENTORY_DAILY_3PL_20261125.md')));
emit('manifest.json', JSON.stringify({ version: 'DAILY_3PL_V1', productionDeployed: false, files: files.slice() }, null, 2) + '\n');
console.log('DAILY_WAREHOUSE_RELEASE ' + out + ' files=' + files.length);
