'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createReceiptWorld } = require('./helpers/map-amazon-receipt-world.cjs');
const { root, read } = require('./helpers/order-mainline-world.cjs');
const PNG = require('./_cp2m-r2-png.js');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/map-country-amazon-receipt-20261124/browser');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
const scripts = ['assets/js/data/world-land-110m.js', 'assets/js/data/world-countries-110m.js', 'assets/js/data/geo-names-zh-hant.js', 'assets/js/data/geo-display-aliases-zh-tw.js',
  'assets/js/data/geo-admin1-display-names-zh-tw.js', 'assets/js/core/geo-name-resolver.js', 'assets/js/lib/km-geo-topology.js',
  'assets/js/lib/km-globe.js', 'assets/js/pages/shipping-history.js', 'assets/js/pages/global-logistics-map.js'];
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><link rel="icon" href="data:,"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + read('assets/html/pages/global-logistics-map.html') + '</body></html>'); return; }
    const file = path.resolve(root, '.' + p);
    if (!file.startsWith(root + path.sep) || !/^\/assets\/(?:js|css|img|html)\//.test(p)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, bytes) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream'); res.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const h = createReceiptWorld(), stock = h.stock(), writes = [], errors = [], remote = [];
      const ships = h.tables.shipments, fields = ships.grid[0];
      ships.grid.push(fields.map(k => ({ ...h.rows('shipments')[0], shipment_id: 'AMZ-US', shipment_no: 'AMZ-US', external_shipment_id: 'FBA-US-FIXTURE', country: 'US', destination_warehouse_id: 'RESUS-3PL', warehouse_id: 'RESUS-3PL' })[k] ?? ''));
      h.tables.shipment_lines.grid.push(h.tables.shipment_lines.grid[0].map(k => ({ shipment_line_id: 'US-LINE', shipment_id: 'AMZ-US', sku: 'SKU-C', shipment_qty: 80, shipment_received_qty: 0 })[k] ?? ''));
      const page = await browser.newPage({ viewport: { width, height: 950 } });
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { if (!r.request().url().startsWith(base)) { remote.push(r.request().url()); return r.abort(); } return r.continue(); });
      await page.exposeFunction('fixtureRead', () => h.model());
      await page.exposeFunction('fixtureReceive', body => { writes.push(body); return h.c.handleUpdateShipmentReceipt_(body); });
      await page.goto(base);
      await page.addStyleTag({ content: read('assets/css/pages/global-logistics-map.css') });
      await page.addStyleTag({ content: '*{box-sizing:border-box}body{margin:0;font:14px Arial;background:#fff}button,input,select{font:inherit}#global-logistics-map-section{max-width:100%}' });
      await page.evaluate(async () => {
        window.fixtureModel = await fixtureRead(); window._opDbCache = {};
        window.KM = { lifecycle: { register(id, hooks) { window.mapHooks = hooks; } }, DB: {
          getDataSourceMode: () => 'google-sheet',
          loadOperationDb: async () => { window.fixtureModel = await fixtureRead(); },
          updateShipmentReceipt: async body => { const r = await fixtureReceive(body); window.fixtureModel = await fixtureRead(); return r; }
        } };
        const keys = { Shipments: 'shipments', ShipmentLines: 'shipmentLines', ShipmentRoutes: 'shipmentRoutes', ShipmentEvents: 'shipmentEvents', Warehouses: 'warehouses',
          LogisticsLocations: 'logisticsLocations', ShipmentRouteTemplates: 'shipmentRouteTemplates', ShipmentRouteTemplateNodes: 'shipmentRouteTemplateNodes' };
        Object.entries(keys).forEach(([name, key]) => { KM.DB['get' + name] = () => fixtureModel[key]; });
      });
      for (const script of scripts) await page.addScriptTag({ url: base + '/' + script });
      await page.evaluate(() => mapHooks.mount());
      await page.waitForFunction(() => KM.glmDiag().globeAlive && document.querySelectorAll('.glm-ship').length === 2).catch(async e => {
        console.error(JSON.stringify({ errors, diag: await page.evaluate(() => KM.glmDiag()), text: (await page.locator('body').textContent()).slice(0, 1000) })); throw e;
      });
      const country = page.locator('[data-filter="destCountry"]');
      if (!(await country.count())) await page.locator('[data-act="toggle-map-panel"]').click();
      check(width + ' country options include physical DE, not regional EU; warehouse filter is gone', (await country.locator('option').allTextContents()).includes('DE') && !(await country.locator('option').allTextContents()).includes('EU') && await page.locator('[data-filter="destWarehouse"]').count() === 0);
      await country.selectOption('DE');
      check(width + ' destination-country filter narrows cards, not origin', await page.locator('.glm-ship').count() === 1 && await page.locator('.glm-ship').getAttribute('data-ship') === 'AMZ-DE');
      await page.locator('[data-act="clear-filters"]').click();
      check(width + ' Clear Filters restores both countries', await page.locator('.glm-ship').count() === 2);
      await page.locator('[data-filter="destCountry"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(out, 'destination-country-' + width + '.png'), fullPage: true });
      await page.locator('[data-act="toggle-map-panel"]').click();
      await page.locator('.glm-globe-host canvas').first().scrollIntoViewIfNeeded();
      const canvas = page.locator('canvas').first(); await canvas.waitFor();
      const beforePath = path.join(out, 'globe-before-' + width + '.png');
      await page.screenshot({ path: beforePath, fullPage: true });
      const box = await canvas.boundingBox(), image = PNG.decodePng(beforePath), pageOffset = await page.evaluate(() => scrollY);
      const desc = PNG.describeRegion(image, box.x, box.y + pageOffset, box.width, box.height, { step: 4 });
      check(width + ' actual WebGL globe is nonblank and framed', box.width > 200 && box.height > 200 && desc.distinctColours > 100 && desc.nonBackgroundFraction > 0.08);
      const screenshotBefore = await canvas.screenshot();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
      await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.58, { steps: 12 }); await page.mouse.up();
      await page.waitForTimeout(600);
      check(width + ' globe responds to pointer drag', !screenshotBefore.equals(await canvas.screenshot()));
      await page.locator('[data-ship="AMZ-DE"]').first().click();
      if (!(await page.locator('[data-glm="receiving-details"]').count())) await page.locator('[data-act="sel-details"]').click();
      await page.locator('[data-glm="receiving-details"] summary').click();
      check(width + ' Amazon drawer has editable receiving and honest no-stock notice', await page.locator('[data-recv-line]').count() === 2 && (await page.locator('[data-glm="drawer-body"]').textContent()).includes('不增加 Current Stock'));
      await page.locator('[data-recv-line="LINE-A"]').fill('40');
      await page.locator('[data-act="receipt-save"]').click();
      await page.waitForFunction(() => document.querySelector('[data-recv-line="LINE-A"]')?.getAttribute('data-prev') === '40');
      check(width + ' partial receipt remains on map with 110 remaining and auto-expanded receiving', await page.locator('[data-ship="AMZ-DE"]').first().locator('[data-glm="receipt-progress"]').textContent() === 'Received 40 / 150 · Remaining 110' && await page.locator('[data-glm="receiving-details"]').getAttribute('open') !== null);
      await page.waitForFunction(() => { const r = document.querySelector('[data-glm="drawer"]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
      await page.locator('[data-act="receipt-save"]').scrollIntoViewIfNeeded();
      check(width + ' receiving fields and Save fit the drawer', await page.locator('[data-recv-line], [data-act="receipt-save"]').evaluateAll(nodes => nodes.every(n => { const b = n.getBoundingClientRect(); return b.width > 0 && b.left >= 0 && b.right <= innerWidth + 1; })));
      await page.screenshot({ path: path.join(out, 'partial-receipt-' + width + '.png'), fullPage: true });
      const countBefore = writes.length;
      await page.locator('[data-act="receive-all"]').click();
      check(width + ' Receive All fills drafts without a write', writes.length === countBefore && await page.locator('[data-recv-line="LINE-A"]').inputValue() === '100' && await page.locator('[data-recv-line="LINE-B"]').inputValue() === '50');
      await page.locator('[data-act="receipt-save"]').click();
      await page.waitForFunction(() => !document.querySelector('.glm-ship[data-ship="AMZ-DE"]'));
      check(width + ' full receipt exits map and card list after authoritative readback', await page.locator('.glm-ship').count() === 1 && h.rows('shipments')[0].status === 'received');
      check(width + ' Received Today remains a statistic, not a way to reopen completed cards', await page.locator('[data-kpi="deliveredToday"]').count() === 0);
      check(width + ' Amazon Current Stock, overseas/factory stock, PO and allocations never changed', h.stock() === stock);
      check(width + ' responsive layout and controls fit without page errors or external requests', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && errors.length === 0 && remote.length === 0);
      await page.screenshot({ path: path.join(out, 'fully-received-' + width + '.png'), fullPage: true });
      await page.close();
    }
    console.log('MAP_COUNTRY_AMAZON_RECEIPT_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
