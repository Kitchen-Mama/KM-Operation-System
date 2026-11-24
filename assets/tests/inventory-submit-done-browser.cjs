'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { root, read, guardSource } = require('./helpers/write-command-flight-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/inventory-submit-done-20261124/browser');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body>' + read('assets/html/pages/inventory-replenishment.html') + read('assets/html/pages/overseas-stock.html') + '</body></html>'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(p));
    if (!file.startsWith(root + path.sep) || !p.startsWith('/assets/')) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, bytes) => { if (err) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', 'text/javascript'); res.end(bytes); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], external = [], dialogs = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('dialog', async d => { dialogs.push(d.message()); await d.dismiss(); });
      await page.route('**/*', r => { if (!r.request().url().startsWith(base)) { external.push(r.request().url()); return r.abort(); } return r.continue(); });
      await page.goto(base);
      for (const file of ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css', 'pages/inventory-replenishment.css', 'pages/overseas-stock.css']) {
        await page.addStyleTag({ content: read('assets/css/' + file) });
      }
      await page.addStyleTag({ content: '.module-section{display:block}#ops-section,#overseas-stock-section{padding:12px}body{margin:0}' });
      await page.evaluate(() => {
        window.fixtureCalls = []; window.fixturePending = []; window.fixtureReadbacks = 0;
        window.fixtureMarkets = [{ marketplaceId: 'MP-US', marketplace: 'Amazon', company: 'KM', country: 'US', currency: 'USD', status: 'active' }];
        window.fixtureStock = [{ sku: 'SJ1210-R', siteSku: 'SJ1210-R', warehouseId: 'WH-US', warehouseName: 'KM US 3PL', company: 'KM', country: 'US', availableStock: 829 }];
        window.fixtureWrite = name => (...args) => {
          fixtureCalls.push({ name, args });
          return new Promise((resolve, reject) => fixturePending.push({ name, resolve, reject }));
        };
        window.KM = { lifecycle: { register() {} }, importFeedback: { controller: () => ({ active: () => false }) }, DB: {
          envId: () => 'FIXTURE', getMarketplaces: () => fixtureMarkets, getSkuDetails: () => [],
          importMarketplaceSkusBatch: fixtureWrite('add'), upsertMarketplaceSku: fixtureWrite('legacy'), adjustOverseasInventory: fixtureWrite('adjust')
        } };
        window.isOperationDbApiConfigured = () => true;
      });
      await page.addScriptTag({ content: guardSource + '\n_kmInstallWriteCommandGuards_();' });
      await page.addScriptTag({ url: base + '/assets/js/pages/inventory-replenishment.js' });
      await page.addScriptTag({ url: base + '/assets/js/pages/overseas-stock.js' });
      await page.evaluate(() => {
        _irEffectiveWorkspace = () => false;
        _irAfterWrite = () => { fixtureReadbacks++; };
        _getDbOverseasSnapshotData = () => fixtureStock;
        _osAfterWrite = cb => { fixtureReadbacks++; cb(); };
        _refreshOverseasFilters = () => {}; renderOverseasSnapshotTable = () => {};
        openReplenAddSkuModal();
      });
      const submit = page.locator('#replen-add-submit');
      await submit.click();
      check(width + ' invalid Add SKU does not lock or dispatch', await submit.isEnabled() && await submit.textContent() === 'Add SKU' && await page.evaluate(() => fixtureCalls.length === 0));
      await page.locator('#replen-add-marketplace').selectOption('MP-US');
      await page.locator('#replen-add-sku').fill('SJ1210-R');
      await page.locator('#replen-add-asin').fill('B0FIXTURE01');
      await page.locator('#replen-add-product-url').fill('https://www.amazon.com/dp/B0FIXTURE01');
      await page.locator('#replen-add-launch-date').fill('2026-12-01');
      await page.evaluate(() => {
        document.getElementById('replen-add-submit').click();
        window.immediateAdd = { label: document.getElementById('replen-add-submit').textContent, disabled: document.getElementById('replen-add-submit').disabled };
        for (var i = 0; i < 20; i++) { saveReplenSku(); document.getElementById('replen-add-submit').click(); }
      });
      await page.waitForFunction(() => fixturePending.length === 1);
      check(width + ' Add SKU immediately shows Adding and is disabled before dispatch settles', await page.evaluate(() => immediateAdd.label === 'Adding...' && immediateAdd.disabled) && await submit.getAttribute('aria-busy') === 'true');
      check(width + ' repeated physical and programmatic submits create exactly one write', await page.evaluate(() => fixtureCalls.length === 1));
      await page.evaluate(() => { closeReplenModal(); openReplenAddSkuModal(); });
      check(width + ' close/reopen cannot reset fields or bypass the active Add SKU lock', await page.locator('#replen-add-sku-modal').evaluate(el => el.classList.contains('is-open')) && await page.locator('#replen-add-sku').inputValue() === 'SJ1210-R');
      await submit.scrollIntoViewIfNeeded();
      check(width + ' Adding button fits its modal', await submit.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth; }));
      await page.screenshot({ path: path.join(out, 'adding-' + width + '.png'), fullPage: true });
      await page.evaluate(() => fixturePending.shift().resolve({ success: false, error: 'fixture validation rejection' }));
      await page.waitForFunction(() => !_replenSkuSavePending);
      check(width + ' business failure unlocks Add SKU and preserves the typed form', await submit.isEnabled() && await submit.textContent() === 'Add SKU' && await page.locator('#replen-add-sku').inputValue() === 'SJ1210-R');
      await submit.click(); await page.waitForFunction(() => fixturePending.length === 1);
      await page.evaluate(() => fixturePending.shift().reject(new Error('fixture offline')));
      await page.waitForFunction(() => !_replenSkuSavePending);
      check(width + ' thrown network failure unlocks without clearing form', await submit.isEnabled() && await page.locator('#replen-add-asin').inputValue() === 'B0FIXTURE01');
      await page.evaluate(() => {
        window.normalAdd = KM.DB.importMarketplaceSkusBatch;
        KM.DB.importMarketplaceSkusBatch = _kmGuardWriteCommand_('sync-throw', () => { throw new Error('fixture synchronous exception'); });
        saveReplenSku();
      });
      await page.waitForFunction(() => !_replenSkuSavePending);
      check(width + ' synchronous API throw also releases the UI lock', await submit.isEnabled() && await submit.textContent() === 'Add SKU');
      await page.evaluate(() => { KM.DB.importMarketplaceSkusBatch = normalAdd; });
      await submit.click(); await page.waitForFunction(() => fixturePending.length === 1);
      await page.evaluate(() => fixturePending.shift().resolve({ success: true, data: { results: [{ status: 'error', message: 'fixture row rejected' }] } }));
      await page.waitForFunction(() => !_replenSkuSavePending);
      check(width + ' row-level rejection is not treated as Add SKU success', await page.locator('#replen-add-sku-modal').evaluate(el => el.classList.contains('is-open')) && await page.locator('#replen-add-sku').inputValue() === 'SJ1210-R');
      await submit.click(); await page.waitForFunction(() => fixturePending.length === 1);
      await page.evaluate(() => fixturePending.shift().resolve({ success: true, data: { results: [{ status: 'created' }] } }));
      await page.waitForFunction(() => !document.getElementById('replen-add-sku-modal').classList.contains('is-open'));
      check(width + ' confirmed creation closes modal and resets only after success', await page.locator('#replen-add-sku').inputValue() === '' && await page.locator('#replen-add-asin').inputValue() === '' && await page.locator('#replen-add-product-url').inputValue() === '');
      await page.evaluate(() => {
        delete KM.DB.importMarketplaceSkusBatch; openReplenAddSkuModal();
        document.getElementById('replen-add-marketplace').value = 'MP-US'; onReplenAddMarketplaceChange();
        document.getElementById('replen-add-sku').value = 'SECOND-SKU'; document.getElementById('replen-add-asin').value = 'B0FIXTURE02';
        document.getElementById('replen-add-product-url').value = 'https://example.invalid/second';
        for (var i = 0; i < 10; i++) saveReplenSku();
      });
      await page.waitForFunction(() => fixturePending.length === 1);
      check(width + ' legacy Add SKU fallback is also single-submit', await page.evaluate(() => fixtureCalls.filter(c => c.name === 'legacy').length === 1) && await submit.textContent() === 'Adding...');
      await page.evaluate(() => fixturePending.shift().resolve({ success: true }));
      await page.waitForFunction(() => !_replenSkuSavePending);
      await page.evaluate(() => openOverseasAdjustModal());
      await page.locator('#overseas-adjust-record').selectOption('0');
      await page.locator('#overseas-adjust-new').fill('825');
      await page.locator('#overseas-adjust-note').fill('Fixture cycle count');
      const done = page.locator('#overseas-adjust-run-btn');
      await page.evaluate(() => {
        for (var i = 0; i < 20; i++) { document.getElementById('overseas-adjust-run-btn').click(); runOverseasAdjust(); }
        closeOverseasModals(); openOverseasAdjustModal();
      });
      await page.waitForFunction(() => fixturePending.length === 1);
      check(width + ' adjustment remains Applying and only one command is sent despite repeat clicks/reopen', await page.evaluate(() => fixtureCalls.filter(c => c.name === 'adjust').length === 1) && await done.isDisabled() && (await done.textContent()).startsWith('Applying'));
      check(width + ' submitted adjustment fields are locked until outcome', await page.locator('#overseas-adjust-new').isDisabled() && await page.locator('#overseas-adjust-note').isDisabled());
      await page.evaluate(() => fixturePending.shift().resolve({ success: false, error: 'fixture adjustment rejected' }));
      await page.waitForFunction(() => !_overseasAdjustSubmitting);
      check(width + ' failed adjustment unlocks fields and retains quantity for explicit retry', await done.isEnabled() && await page.locator('#overseas-adjust-new').isEnabled() && await page.locator('#overseas-adjust-new').inputValue() === '825');
      await done.click(); await page.waitForFunction(() => fixturePending.length === 1);
      await page.evaluate(() => fixturePending.shift().resolve({ success: true, data: { movement_id: 'OVMV-FIXTURE', reference_id: 'ADJ-FIXTURE', before_available: 829, after_available: 825, quantity: -4 } }));
      await page.waitForFunction(() => _overseasAdjustDone);
      check(width + ' successful adjustment shows enabled Done and authoritative result', await done.textContent() === 'Done' && await done.isEnabled() && (await page.locator('#overseas-adjust-result').textContent()).includes('OVMV-FIXTURE'));
      await done.scrollIntoViewIfNeeded();
      check(width + ' Done fits the viewport', await done.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth + 1; }));
      await page.screenshot({ path: path.join(out, 'adjustment-done-' + width + '.png'), fullPage: true });
      const beforeDone = await page.evaluate(() => fixtureCalls.length);
      await done.click();
      check(width + ' Done closes modal and overlay without sending another adjustment', await page.locator('#overseas-adjust-modal').evaluate(el => !el.classList.contains('is-open')) && await page.locator('#overseas-modal-overlay').evaluate(el => !el.classList.contains('is-open')) && await page.evaluate(() => fixtureCalls.length) === beforeDone);
      await page.evaluate(() => { runOverseasAdjust(); openOverseasAdjustModal(); });
      check(width + ' repeated Done is harmless and reopening starts a clean adjustment', await done.textContent() === 'Confirm Adjustment' && await done.isDisabled() && await page.locator('#overseas-adjust-new').inputValue() === '' && await page.locator('#overseas-adjust-note').isEnabled() && await page.evaluate(() => fixtureCalls.length) === beforeDone);
      check(width + ' no JavaScript errors or external service access', !errors.length && !external.length && dialogs.length >= 4);
      if (errors.length) console.log(errors);
      await page.close();
    }
    console.log('INVENTORY_SUBMIT_DONE_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
