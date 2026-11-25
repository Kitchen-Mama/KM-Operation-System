'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { rows, scope, root } = require('./inventory-forecast-year.test.cjs');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
let checks = 0;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true }), out = path.join(root, 'output/forecast-year-20261125');
  fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [1440,390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 }, timezoneId: width === 1440 ? 'Asia/Taipei' : 'America/Los_Angeles' }), errors = [], outbound = [];
      page.on('pageerror', e => errors.push(e.message)); await page.route('**/*', r => { outbound.push(r.request().url()); return r.abort(); });
      await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1">' + read('assets/html/pages/inventory-replenishment.html'));
      for (const file of ['base.css','components.css','layout.css','responsive-foundation.css','pages/inventory-replenishment.css']) await page.addStyleTag({ content: read('assets/css/' + file) });
      for (const file of ['assets/js/api/operation-system-db-api.js','assets/js/core/supply-planning-planning-demand.js','assets/js/core/supply-planning-site-calendar.js','assets/js/pages/inventory-replenishment.js']) await page.addScriptTag({ content: read(file) });
      const result = await page.evaluate(({ fc, scope }) => {
        Date.now = () => Date.parse('2026-11-25T00:30:00Z');
        _irRenderScope_ = () => ({ marketplaceId: 'AU-AMZ', country: 'AU', ltsFilter: '' });
        _irEffectiveWorkspace = () => true; _irExposureStateForRender_ = () => 'IDLE';
        _irReadModel = { getMarketplaces: [{ ...scope, marketplaceId: 'AU-AMZ' }],
          getMarketplaceSkus: [{ ...scope, marketplaceId: 'AU-AMZ', replenishmentModel: 'forecast_driven' }],
          getSkuDetails: [{ sku: scope.sku, category: scope.category, series: scope.series }],
          getFcRegularForecast: fc.map(normalizeFcRegularForecastRecord) };
        const mapped = _getCloudReplenishmentData()[0];
        const host = document.createElement('section'); host.id = 'forecast-proof';
        host.style.cssText = 'position:fixed;inset:0;background:white;padding:20px;overflow:auto;z-index:999999';
        host.innerHTML = '<h2>Forecast Breakdown</h2><article class="replen-card" style="width:230px;max-width:100%">' + _irForecastBreakdownHtml_(mapped) + '</article>';
        const ops = document.getElementById('ops-section'); ops.style.display = 'block'; ops.appendChild(host);
        const first = [...host.querySelectorAll('.replen-card__label')].map(e => e.textContent);
        const values = [...host.querySelectorAll('.replen-card__value')].map(e => e.textContent);
        const labelsFit = [...host.querySelectorAll('.replen-card__row')].every(row => {
          const label = row.querySelector('.replen-card__label'), value = row.querySelector('.replen-card__value');
          return label.scrollWidth <= label.clientWidth + 1 && label.getBoundingClientRect().right <= value.getBoundingClientRect().left;
        });
        _irReadModel.getFcRegularForecast = _irReadModel.getFcRegularForecast.filter(r => r.year === '2026');
        const missing = _getCloudReplenishmentData()[0];
        const unavailable = document.createElement('article'); unavailable.className = 'replen-card'; unavailable.style.cssText = 'width:230px;max-width:100%;margin-top:16px';
        unavailable.innerHTML = '<h4>Missing Next-Year FC</h4>' + _irForecastBreakdownHtml_(missing); host.appendChild(unavailable);
        return { first, values, labelsFit, total: mapped.forecast60d, missing: missing.forecast60d,
          missingValues: [...unavailable.querySelectorAll('.replen-card__value')].map(e => e.textContent), overflow: host.scrollWidth > host.clientWidth };
      }, { fc: rows(), scope });
      assert.deepEqual(result.first, ['Dec. 2026','Jan. 2027','Feb. 2027','Total']); checks++;
      assert.deepEqual(result.values, ['112','201','202','515']); checks++;
      assert.equal(result.total, 515); checks++;
      assert.equal(result.missing, null); checks++;
      assert.deepEqual(result.missingValues, ['112','—','—','—']); checks++;
      assert.equal(result.overflow, false); checks++;
      assert.equal(result.labelsFit, true); checks++;
      assert.deepEqual(errors, []); checks++; assert.deepEqual(outbound, []); checks++;
      await page.screenshot({ path: path.join(out, 'forecast-' + width + '.png'), fullPage: true }); await page.close();
    }
    console.log('INVENTORY_FORECAST_YEAR_BROWSER_PASS ' + checks + ' live_writes=0');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
