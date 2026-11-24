const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const output = 'output/shipment-overview-20261124/verification';
const c = vm.createContext({});
vm.runInContext(fs.readFileSync('assets/specs/active/apps-script/57_api_v1_shipment_workspace.gs', 'utf8'), c);
const tables = {
  shipments: ['FBA19WZWNQVY', 'FBA1', 'A-LONG-EXTERNAL-SHIPMENT-ID-THAT-MUST-WRAP-AND-NOT-MOVE-THE-STATUS'].map((id, i) => ({
    shipment_id: 'S' + i, external_shipment_id: id, shipment_no: id, company: 'ResUS', country: 'US', marketplace: 'Amazon',
    status: 'in_transit', record_origin: 'IMPORT_HISTORICAL', opening_supply_mode: 'DISPLAY_ONLY',
    shipment_total_qty: 81, etd: '2026-11-13', eta: '2026-12-27', shipping_method: 'sea_express' })),
  shipment_lines: [0, 1, 2].map(i => ({ shipment_id: 'S' + i, shipment_line_id: 'L' + i, sku: 'SKU-A', shipment_qty: 81 })),
  sku_details: [{ sku: 'SKU-A', units_per_carton: 40, carton_length: 50, carton_width: 40, carton_height: 30,
    carton_dimension_unit: 'cm', carton_weight: 10, carton_weight_unit: 'kg', item_weight: 200, item_weight_unit: 'g' }]
};
const fixture = JSON.parse(JSON.stringify(c.shipWorkspaceBuild_(tables, { include: { skuLogistics: true } })));
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [3840, 1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      const errors = [], requests = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      await page.setContent('<!doctype html><html><head></head><body><main></main></body></html>');
      for (const file of ['assets/css/base.css', 'assets/css/components.css', 'assets/css/pages/shipping-history.css', 'assets/css/responsive-foundation.css']) {
        await page.addStyleTag({ content: fs.readFileSync(file, 'utf8') });
      }
      await page.addStyleTag({ content: 'body{margin:0;font:14px Arial;background:white;color:#222}main{padding:16px;min-width:0}*{box-sizing:border-box}' });
      await page.addScriptTag({ content: 'window.KM = { DB: {} };' });
      await page.addScriptTag({ content: fs.readFileSync('assets/js/api/operation-system-db-api.js', 'utf8') });
      await page.addScriptTag({ content: fs.readFileSync('assets/js/pages/shipping-history.js', 'utf8') });
      await page.evaluate(data => {
        window.fixtureData = data;
        _shReadModel = KM.DB.adaptShipmentWorkspace(data);
        document.querySelector('main').innerHTML = _shReadModel.shipments.map(s =>
          _shRenderDbCard(s, _shReadModel.shipmentLines.filter(l => l.shipmentId === s.shipmentId), 'overview')).join('');
      }, fixture);
      check(width + ' no display-only metadata clutter or empty Plan label', await page.locator('.sh-opening-badge, .sh-card-plan').count() === 0);
      check(width + ' status badges align independent of ID width', await page.locator('.sh-card-status').evaluateAll(nodes => {
        const boxes = nodes.map(n => n.getBoundingClientRect());
        return boxes.every(b => Math.abs(b.left - boxes[0].left) < 1);
      }));
      check(width + ' headers, IDs, status and Expand never overlap or overflow', await page.locator('.sh-card-heading').evaluateAll(nodes => nodes.every(n => {
        const id = n.querySelector('strong').getBoundingClientRect(), status = n.querySelector('.sh-card-status').getBoundingClientRect();
        const facts = n.querySelector('.sh-card-heading__facts').getBoundingClientRect(), expand = n.querySelector('button').getBoundingClientRect();
        const separate = (a, b) => a.right <= b.left + 1 || a.bottom <= b.top + 1 || b.right <= a.left + 1 || b.bottom <= a.top + 1;
        return separate(id, status) && separate(status, facts) && separate(facts, expand) &&
          [id, status, facts, expand].every(b => b.right <= innerWidth && b.left >= 0) && n.scrollWidth <= n.clientWidth + 1;
      })));
      await page.locator('#sh-card-S0 .history-expand-btn').click();
      check(width + ' expanded row has inferred cartons, CBM, gross and net weights', JSON.stringify(await page.locator('#sh-lines-S0 tr').first().locator('td').allTextContents()) === JSON.stringify(['SKU-A', '81', '3', '0.180', '30.00', '16.20', '--', '--']));
      check(width + ' totals use derived logistics, not the persisted blank metrics', JSON.stringify(await page.locator('#sh-lines-S0 tr').last().locator('td').allTextContents()).includes('"3","0.180","30.00","16.20"'));
      check(width + ' expand button remains interactive', await page.locator('#sh-card-S0 .history-expand-btn').getAttribute('aria-expanded') === 'true');
      check(width + ' expanded mobile layout stays within viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, 'overview-' + width + '.png'), fullPage: true });
      await page.evaluate(() => {
        const missing = KM.DB.normalizeShipmentLine({ shipment_id: 'S0', shipment_line_id: 'MISSING', sku: 'MISSING', shipment_qty: 4 });
        document.querySelector('main').innerHTML = _shRenderDbCard(_shReadModel.shipments[0], [_shReadModel.shipmentLines[0], missing], 'overview');
      });
      check(width + ' incomplete totals show unknown rather than partial or zero totals', JSON.stringify(await page.locator('#sh-lines-S0 tr').last().locator('td').allTextContents()).includes('"--","--","--","--"'));
      check(width + ' old GS response safely renders unknown metadata', await page.evaluate(() => {
        const old = { ...fixtureData }; delete old.skuLogistics;
        const model = KM.DB.adaptShipmentWorkspace(old);
        return model.skuLogistics === null && _shOverviewLogistics_(model.shipments[0], [model.shipmentLines[0]], model.skuLogistics)[0].cartonQty === '';
      }));
      check(width + ' DISPLAY_ONLY remains nonreceivable in arrival projection', await page.evaluate(() => KMLogisticsArrival.isDisplayOnly(_shReadModel.shipments[0])));
      check(width + ' input facts remain unmodified', await page.evaluate(() => _shReadModel.shipmentLines[0].cartonQty === 0 && _shReadModel.shipmentLines[0].grossWeight === '' && _shReadModel.shipments[0].openingSupplyMode === 'DISPLAY_ONLY'));
      if (width === 1440) {
        check('targeted readback merges updated SKU metadata without dropping other references', await page.evaluate(async () => {
          _shReadModel.skuLogistics.push({ sku: 'OTHER', cartonWeight: '7' });
          window._shEffectiveWorkspace = () => true;
          window._shRegion_ = () => null;
          window.renderShipmentOverview = () => {};
          var called;
          KM.api = { getWorkspace: (_name, payload) => {
            called = payload;
            return Promise.resolve({ success: true, data: { ...fixtureData, shipments: [fixtureData.shipments[0]], shipmentLines: [fixtureData.shipmentLines[0]],
              skuLogistics: [{ ...fixtureData.skuLogistics[0], carton_weight: 11 }] } });
          } };
          return await _shReadbackOne_('S0') === 'TARGETED' && called.include.skuLogistics === true &&
            _shReadModel.skuLogistics.some(d => d.sku === 'OTHER') && _shReadModel.skuLogistics.find(d => d.sku === 'SKU-A').cartonWeight === '11';
        }));
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, []);
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ checks, success: true, viewports: [3840, 1440, 390], realBusinessWrites: 0, outboundRequests: 0 }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
