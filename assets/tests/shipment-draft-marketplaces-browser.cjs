const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = 'output/shipment-draft-marketplaces-20261123';
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => { requests.push(route.request().url()); return route.abort(); });
      await page.setContent('<!DOCTYPE html><html><head></head><body><main style="padding:16px"></main></body></html>');
      for (const file of ['assets/css/base.css', 'assets/css/pages/shipping-history.css', 'assets/css/core/system-responsive.css']) {
        if (fs.existsSync(file)) await page.addStyleTag({ content: fs.readFileSync(file, 'utf8') });
      }
      await page.addScriptTag({ content: 'window.KM = { DB: {} };' });
      await page.addScriptTag({ content: fs.readFileSync('assets/js/pages/shipping-history.js', 'utf8') });
      await page.evaluate(() => {
        window.fixture = { shipmentId: 'SHIP-A', externalShipmentId: 'MERGED-SHIPMENT', shippingPlanId: 'PLAN-A',
          marketplace: 'Walmart', company: 'KM', sourceCompanies: ['KM', 'ResUS'], country: 'US',
          status: 'draft', totalQty: 120, destination: 'AMZL', shippingMethod: 'sea_express' };
        window.fixtureLines = ['Walmart', 'Target Plus', 'Shopify'].map((sourceMarketplace, index) =>
          ({ shipmentId: 'SHIP-A', shipmentLineId: 'LINE-' + index, sku: 'SKU-A', sourceCompany: 'KM',
            sourceMarketplace, qty: 40, cartonQty: 1, unitsPerCarton: 40 }));
        document.querySelector('main').innerHTML = _shRenderDbCard(fixture, fixtureLines, 'draft');
      });
      const marketplace = page.locator('.sh-card-heading__facts > span').filter({ hasText: /^Marketplace:/ });
      assert.equal(await marketplace.innerText(), 'Marketplace: Walmart / Target Plus / Shopify');
      const labelFits = await marketplace.evaluate(el => {
        const box = el.getBoundingClientRect(), expand = document.querySelector('.history-expand-btn').getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth + 1 && box.right <= innerWidth && box.right <= expand.left + 1;
      });
      assert(labelFits, 'marketplace label must wrap within its header without covering Expand');
      await page.screenshot({ path: path.join(output, 'draft-' + width + '.png'), fullPage: true });
      await page.evaluate(() => {
        document.querySelector('main').innerHTML = _shRenderDbCard(fixture,
          [{ ...fixtureLines[0], sourceMarketplace: '<img src=x onerror="window.labelXss=true">' }], 'draft');
      });
      assert.equal(await page.locator('.sh-card-heading__facts img').count(), 0);
      assert.equal(await page.evaluate(() => !!window.labelXss), false);
      assert.deepEqual(errors, []);
      assert.deepEqual(requests, [], 'display-only change must not make API or other network requests');
      console.log('PASS actual card at ' + width + ': merged labels, wrapping, escaping, zero network requests');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
