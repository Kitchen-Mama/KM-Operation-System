'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { world, fixture, plain, root } = require('./warehouse-lifecycle.test.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const out = path.join(root, 'output/warehouse-lifecycle-20261125/browser');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
(async () => {
  fs.mkdirSync(out, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const c = world(), t = fixture(), page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], outbound = [];
      t.warehouses.forEach(w => { w.warehouse_name = w.warehouse_id === 'F' ? 'Factory' : 'Overseas'; w.country = 'US'; });
      t.sku_details = [{ sku: 'A', category: 'Test', series: 'A' }, { sku: 'NEW', category: 'Test', series: 'NEW' }];
      t.purchase_order_lines.push({ purchase_order_line_id: 'NEWPL', purchase_order_id: 'P', sku: 'NEW', ordered_qty: 30, completed_qty: 0 });
      t.shipment_lines.push({ shipment_line_id: 'NEWSL', shipment_id: 'S', sku: 'NEW', shipment_qty: 20, shipment_received_qty: 0 });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => r.request().url() === 'http://fixture.test/'
        ? r.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><body>' +
          read('assets/html/pages/factory-stock.html') + read('assets/html/pages/overseas-stock.html') + '</body>' })
        : (outbound.push(r.request().url()), r.abort()));
      await page.goto('http://fixture.test/');
      for (const file of ['assets/css/base.css', 'assets/css/components.css', 'assets/css/layout.css', 'assets/css/responsive-foundation.css', 'assets/css/pages/factory-stock.css', 'assets/css/pages/overseas-stock.css']) await page.addStyleTag({ content: read(file) });
      await page.addStyleTag({ content: 'body{font:14px Arial;margin:16px;color:#172f46}.module-section{display:block!important}.fi-kpi-row{max-width:100%}' });
      await page.addScriptTag({ content: read('assets/js/api/operation-system-db-api.js') });
      await page.evaluate(t => { window.fixtureTables = t; window.counts = { factory: 0, overseas: 0 }; }, plain(t));
      await page.exposeFunction('factoryBackend', () => plain(c.handleFactoryInventoryWorkspaceGet_({}, { openTarget: () => ({}), readTable: (ss, name) => t[name] || [] })));
      await page.exposeFunction('overseasBackend', () => plain(c.handleOverseasStockWorkspaceGet_({ payload: { include: { lifecycle: true } } }, { now: () => 0, openTarget: () => ({}), readTable: (ss, name) => t[name] || [] })));
      await page.evaluate(() => {
        KM.api = { getWorkspace: name => { if (name === 'factoryInventory') { counts.factory++; return factoryBackend(); } counts.overseas++; return overseasBackend(); } };
        KM.DB.isScopedReadEligible = () => true;
        KM.deferredRead = { define() {}, state: () => 'IDLE', invalidate() {} };
      });
      for (const file of ['assets/js/pages/factory-stock.js', 'assets/js/pages/overseas-stock.js']) await page.addScriptTag({ content: read(file) });
      await page.evaluate(() => { initFactoryStockPage(); initOverseasStockPage(); });
      await page.waitForFunction(() => _fsLoad.status === 'READY' && _osLoad.status === 'READY');
      check(width + ' real client normalizers preserve lifecycle DTO and one workspace per page', await page.evaluate(() => counts.factory === 1 && counts.overseas === 1));
      check(width + ' production and pending KPIs use backend joins', await page.locator('#fi-kpi-inproduction').innerText() === '90' && await page.locator('#fi-kpi-pendingshipout').innerText() === '10');
      check(width + ' physical KPI never adds production or pending', await page.locator('#fi-kpi-current').innerText() === '100' && await page.locator('#fi-kpi-available').innerText() === '90');
      check(width + ' new PO-only SKU is visible without invented physical stock', await page.evaluate(() => { const r = _getDbFactoryStockData().find(r => r.sku === 'NEW'); return r.inProduction === 30 && r.currentStock === null; }));
      check(width + ' overseas uses remaining shipments, not snapshot 999', await page.evaluate(() => _getDbOverseasSnapshotData().find(r => r.sku === 'A').onTheWayQty === 80));
      check(width + ' incoming-only SKU is visible, not inserted into physical snapshot', await page.evaluate(() => { const r = _getDbOverseasSnapshotData().find(r => r.sku === 'NEW'); return r.onTheWayQty === 20 && r.availableStock === null && _osReadModel.overseasInventorySnapshot.length === 1; }));
      await page.screenshot({ path: path.join(out, 'warehouse-' + width + '.png'), fullPage: true });
      await page.evaluate(() => { _fsRearmOnEntry_(); _osRearmOnEntry_(); initFactoryStockPage(); initOverseasStockPage(); });
      await page.waitForFunction(() => _fsLoad.status === 'READY' && _osLoad.status === 'READY');
      check(width + ' fresh navigation rereads once, not a render loop', await page.evaluate(() => counts.factory === 2 && counts.overseas === 2));
      t.shipment_lines[0].shipment_received_qty = 100; t.factory_stock[0].fac_reserved_stock = 9;
      await page.evaluate(async () => { await _fsAfterWrite(() => initFactoryStockPage()); await _osAfterWrite(() => initOverseasStockPage()); });
      check(width + ' readback updates received shipment and reservation mismatch', await page.evaluate(() => _getDbOverseasSnapshotData().find(r => r.sku === 'A').onTheWayQty === 0) && await page.locator('#fi-kpi-pendingshipout').innerText() === '—');
      await page.evaluate(() => { _fsReadModel.warehouseLifecycle = null; _osReadModel.warehouseLifecycle = null; renderFactoryStockTable(); renderOverseasSnapshotTable(); });
      check(width + ' old deployment does not manufacture lifecycle zeros', await page.locator('#fi-kpi-inproduction').innerText() === '—' && await page.evaluate(() => _getDbOverseasSnapshotData()[0].onTheWayQty === null));
      check(width + ' no browser errors, live requests or business writes', errors.length === 0 && outbound.length === 0);
      await page.close();
    }
    console.log('WAREHOUSE_LIFECYCLE_BROWSER_PASS ' + checks + ' live_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
