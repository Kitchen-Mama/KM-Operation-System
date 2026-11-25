'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const R = require('./_cp2m-r2-map-runner.js'), PNG = require('./_cp2m-r2-png.js');
const fixture = require('./_cp2m-r3-fixtures.js').shipmentWorkspace(16);
const root = path.resolve(__dirname, '../..'), out = path.join(root, 'output/maintenance-20261125');
(async () => {
 fs.mkdirSync(out, { recursive: true });
 const pages = {}, server = R.startServer(pages, {}, {}); await new Promise(r => server.listen(0, '127.0.0.1', r)); const port = server.address().port;
 pages['/scroll-test'] = R.buildPage(port, false, 'scroll', 'void 0;');
 const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
 let checks = 0;
 try { for (const width of [1920, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:' + port + '/scroll-test', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof showSection === 'function'); await page.waitForTimeout(1000);
  await page.evaluate(data => { KM.api = KM.api || {}; KM.api.getWorkspace = async () => ({ success: true, data }); var auth = document.getElementById('km-password-access'); if (auth) auth.remove(); showSection('global-logistics-map'); }, fixture);
  await page.waitForSelector('.glm-shiplist [data-ship]', { timeout: 30000 }).catch(async e => { console.log(await page.evaluate(() => ({ text: document.body.innerText.slice(-4000), diag: KM.glmDiag && KM.glmDiag() }))); throw e; });
  await page.waitForSelector('#global-logistics-map-section canvas', { timeout: 30000 });
  const before = await page.evaluate(() => {
   var list = document.querySelector('.glm-shiplist'); list.scrollIntoView({ block: 'center' }); list.scrollTop = 350;
   var top = list.getBoundingClientRect().top, card = Array.from(list.querySelectorAll('[data-ship]')).find(c => c.getBoundingClientRect().top >= top + 8 && c.getBoundingClientRect().bottom < list.getBoundingClientRect().bottom);
   if (!card) card = list.querySelector('[data-ship]');
   window.targetShip = card.getAttribute('data-ship'); return { list: list.scrollTop, page: document.scrollingElement.scrollTop };
  });
  await page.evaluate(() => document.querySelector('[data-ship="' + targetShip + '"]').click()); await page.waitForTimeout(150);
  const after = await page.evaluate(() => ({ list: document.querySelector('.glm-shiplist').scrollTop, page: document.scrollingElement.scrollTop, selected: KM.glmSelectionDiag().selectedShipmentId === targetShip }));
  assert.equal(after.list, before.list); assert.equal(after.page, before.page); assert(after.selected); checks += 3;
  const canvas = page.locator('#global-logistics-map-section canvas').first(); await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500);
  const file = path.join(out, 'map-' + width + '.png'); await canvas.screenshot({ path: file });
  const png = PNG.decodePng(file), pixels = png.rgba || png.data; assert(pixels, 'decoded screenshot pixels');
  const colors = new Set(); for (let i = 0; i < pixels.length; i += 64) colors.add(pixels[i] + ',' + pixels[i + 1] + ',' + pixels[i + 2]);
  assert(colors.size > 60, 'globe screenshot is nonblank'); checks++;
  const shot1 = await canvas.screenshot();
  await canvas.evaluate(cv => { var r = cv.getBoundingClientRect(), x = r.left + r.width * .65, y = r.top + r.height * .5; var emit = (type, dx, buttons) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x + dx, clientY: y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons })); emit('pointerdown', 0, 1); for (var i = 1; i <= 12; i++) emit('pointermove', i * 8, 1); emit('pointerup', 96, 0); });
  await page.waitForTimeout(700); const shot2 = await canvas.screenshot(); assert(!shot1.equals(shot2), 'drag changes rendered globe'); checks++;
  await page.close();
 } } finally { await browser.close(); await new Promise(r => server.close(r)); }
 console.log('MAP_SELECTION_SCROLL_PASS ' + checks + ' actual app, synthetic reads only');
})().catch(e => { console.error(e); process.exitCode = 1; });
