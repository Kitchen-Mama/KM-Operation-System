'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
let checks = 0;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const out = path.join(root, 'output/site-inventory-daily-20261125'); fs.mkdirSync(out, { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: width === 1440 ? 'Asia/Taipei' : 'America/New_York' });
      await page.route('**/*', r => r.abort());
      await page.setContent(read('assets/html/pages/inventory-replenishment.html'));
      for (const css of ['base.css', 'components.css', 'layout.css', 'pages/inventory-replenishment.css']) {
        const p = path.join(root, 'assets/css', css); if (fs.existsSync(p)) await page.addStyleTag({ content: fs.readFileSync(p, 'utf8') });
      }
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      for (const file of ['assets/js/core/supply-planning-planning-demand.js', 'assets/js/core/supply-planning-site-calendar.js', 'assets/js/pages/inventory-replenishment.js']) await page.addScriptTag({ content: read(file) });
      const result = await page.evaluate(() => {
        const now = Date.parse('2026-11-25T00:30:00Z'); Date.now = () => now;
        const ev = { company: 'C', country: 'US', marketplace: 'Amazon', sku: 'SKU', event: 'BFCM', eventStartDate: '2026-11-19', eventEndDate: '2026-11-30', fcQty: 240 };
        const scope = { company: 'C', country: 'US', marketplace: 'Amazon', sku: 'SKU' };
        const us = IRMap.upcomingEvents([ev], scope, now);
        const eu = IRMap.upcomingEvents([{ ...ev, country: 'EU' }], { ...scope, country: 'EU' }, now);
        const otherCompany = IRMap.upcomingEventQty([ev], { ...scope, company: 'OTHER' }, now);
        const ended = IRMap.upcomingEvents([{ ...ev, eventEndDate: '2026-11-24' }], scope, now);
        const bad = IRMap.upcomingEvents([{ ...ev, eventEndDate: '2026-02-30' }], scope, now);
        const total = IRMap.upcomingEventQty([ev, { ...ev, event: 'Future', eventStartDate: '2026-12-01', eventEndDate: '2026-12-10', fcQty: 100 }], scope, now);
        const shipmentFacts = _irShipmentDisplayReconcile(['US','EU'].map(country => ({ shipmentId: country, company: 'C', country, marketplace: 'Amazon', status: 'in_transit', eta: '2026-12-13' })),
          ['US','EU'].map(country => ({ shipmentLineId: 'L-' + country, shipmentId: country, sku: 'SKU', shipmentQty: 10, shipmentReceivedQty: 0 })), Date.UTC(2026,10,25), {}, now);
        const oldRow = { calculation_status: 'READY', country: 'US', calculation_date: '2026-11-24', d18_gap_qty: 999, d18_suggested_qty: 1000, note: 'old formula' };
        const newRow = { ...oldRow, d18_gap_qty: 0, d18_suggested_qty: 0, note: 'CALC FORMULA=SITE_DAILY_V2' };
        const panel = document.createElement('section'); panel.id = 'verified-upcoming';
        panel.style.cssText = 'position:fixed;inset:0;z-index:999999;background:white;padding:24px;overflow:auto;';
        panel.innerHTML = '<h3>Upcoming Event</h3><h4>US</h4>' + _irRenderUpcoming(us) + '<h4>EU</h4>' + _irRenderUpcoming(eu);
        const fractional = [9.714285714286, 2.285714285714, 0.571428571428, 10, 0];
        const displayed = fractional.map(n => {
          const el = document.createElement('div');
          el.innerHTML = _irScrollRowHtml_({ sku: 'SKU', company: 'C', country: 'AU', marketplace: 'Amazon', upcomingEventQty: n,
            avgDailySales: 1, daysOfSupply: 1, thirdPartyStock: 0, currentInventory: 1, forecast60d: 1 }, {});
          return el.querySelectorAll('.scroll-cell')[8].textContent;
        });
        const fractionHtml = _irRenderUpcoming(fractional.map((fcQty, i) => ({ event: 'Fraction ' + i, fcQty })));
        panel.innerHTML += '<h4>Rounded Event FC</h4>' + fractionHtml;
        const fractionEl = document.createElement('div'); fractionEl.innerHTML = fractionHtml;
        const detailDisplayed = [...fractionEl.querySelectorAll('.replen-card__value')].map(e => e.textContent);
        const banner = _irSrcBanner15_({ srcUnknown13: true, srcWhy15: 'SITE_SOURCE_NOT_CONFIRMED', srcKind15: 'UNKNOWN' });
        const ops = document.getElementById('ops-section'); ops.style.display = 'block'; ops.appendChild(panel);
        return { us: us[0].fcQty, eu: eu[0].fcQty, otherCompany, ended: ended.length, invalid: bad[0].fcQty, total,
          displayed, detailDisplayed, fractional, banner,
          sourceUnchanged: ev.fcQty, old: _irMatToLine(oldRow).horizons[0], zero: _irMatToLine(newRow).horizons[0],
          oldStale: _irMatIsStale(oldRow), newStale: _irMatIsStale(newRow), text: panel.innerText,
          cacheDates: [_irSiteCalculationDateCurrent_('2026-11-24',scope),_irSiteCalculationDateCurrent_('2026-11-23',scope)],
          etaBuckets: shipmentFacts.map(f => f.eta_bucket), overflow: panel.scrollWidth > panel.clientWidth };
      });
      assert.equal(result.us, 120); checks++;
      assert.equal(result.eu, 100); checks++;
      assert.equal(result.otherCompany, 0); checks++;
      assert.equal(result.ended, 0); checks++;
      assert.equal(result.invalid, null); checks++;
      assert.equal(result.total, 220); checks++;
      assert.equal(result.sourceUnchanged, 240); checks++;
      assert.deepEqual(result.displayed, ['10', '3', '1', '10', '0']); checks++;
      assert.deepEqual(result.detailDisplayed, ['10', '3', '1', '10', '0']); checks++;
      assert.equal(result.fractional[0], 9.714285714286); checks++;
      assert.equal(result.banner, ''); checks++;
      assert.equal(result.old.gapQty, null); checks++;
      assert.equal(result.old.note, 'Recalculate required'); checks++;
      assert.equal(result.zero.gapQty, 0); checks++;
      assert.equal(result.oldStale, true); checks++;
      assert.equal(result.newStale, false); checks++;
      assert.match(result.text, /120/); checks++;
      assert.match(result.text, /100/); checks++;
      assert.equal(result.overflow, false); checks++;
      assert.deepEqual(result.etaBuckets, ['d19_30','d0_18']); checks++;
      assert.deepEqual(result.cacheDates, [true,false]); checks++;
      assert.deepEqual(errors, []); checks++;
      await page.screenshot({ path: path.join(out, 'upcoming-' + width + '.png') });
      await page.close();
    }
    console.log('Site Inventory browser: ' + checks + ' checks passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
