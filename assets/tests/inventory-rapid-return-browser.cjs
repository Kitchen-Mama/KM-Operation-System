'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { root, read, parts } = require('./helpers/write-command-flight-world.cjs');
const inventorySource = process.env.KM_INVENTORY_BASELINE_REV
  ? require('node:child_process').execFileSync('git', ['show', process.env.KM_INVENTORY_BASELINE_REV + ':assets/js/pages/inventory-replenishment.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  : read('assets/js/pages/inventory-replenishment.js');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const fixture = new Function('MKT_ID', 'MKT2_ID', 'skuOf', parts(read('assets/tests/_cp2s-r2-inplace-dom-runner.js'), ['fixtureWorkspace', 'recoLines']) + '\nreturn {fixtureWorkspace,recoLines};')('MP-US', 'MP-WMT', i => 'FIXTURE-SKU-' + String(i).padStart(3, '0'));
const out = path.join(root, 'output/inventory-rapid-return-20261124');
let checks = 0;
function check(name, value) { assert(value, name); checks++; console.log('PASS ' + name); }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const raw = fixture.fixtureWorkspace(4, false), lines = fixture.recoLines(4, 7);
  raw.warehouses[0].warehouse_type = 'FBA';
  raw.shipments = [{ shipment_id: 'S1', company: 'FixtureCo', country: 'US', marketplace: 'Amazon', status: 'in_transit', eta: '2026-12-01', destination_warehouse_id: 'WH0' }];
  raw.shipment_lines = [{ shipment_line_id: 'SL1', shipment_id: 'S1', sku: 'FIXTURE-SKU-000', shipment_qty: 45, shipment_received_qty: 0 }];
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/assets/js/pages/inventory-replenishment.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(inventorySource); return; }
    if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body><section class="module-section" id="home-section">Other Page</section>' + read('assets/html/pages/inventory-replenishment.html') + '</body></html>'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(p));
    if (!file.startsWith(root + path.sep) || !p.startsWith('/assets/')) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => { if (err) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', 'text/javascript'); res.end(data); });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } }), errors = [], external = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { if (!r.request().url().startsWith(base)) { external.push(r.request().url()); return r.abort(); } return r.continue(); });
      await page.goto(base);
      for (const css of ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css', 'pages/inventory-replenishment.css']) await page.addStyleTag({ content: read('assets/css/' + css) });
      await page.addStyleTag({ content: 'body{margin:0}.module-section{display:none}.module-section.active{display:block}#ops-section{padding:12px}' });
      for (const script of ['assets/js/core/namespace.js', 'assets/js/core/lifecycle.js', 'assets/js/core/partial-loader.js', 'assets/js/utils/inventory-compat.js', 'assets/js/core/supply-planning-active-route-classification.js', 'assets/js/api/operation-system-db-api.js', 'assets/js/pages/inventory-replenishment.js']) await page.addScriptTag({ url: base + '/' + script });
      await page.evaluate(({ raw, lines }) => {
        window.fixtureRaw = raw; window.fixtureLines = lines; window.fixtureRevision = 'r1'; window.fixtureHeld = []; window.fixtureCalls = [];
        KM.lifecycle.register('home-section', {});
        KM.api = { workspaceApiActive: () => true, getWorkspace: (name, payload, opts) => {
          fixtureCalls.push({ name, payload });
          const env = { success: true, data: name === 'recommendation' ? { lines: fixtureLines } : fixtureRaw,
            meta: { sourceRevision: fixtureRevision, recommendationWorkspaceHandlerVersion: _IR_RECO_CACHE_HANDLERS[0], calculationDate: '2026-11-24', calculationMonth: '2026-11', planningCycle: 'RECO-2026-11' } };
          return new Promise((resolve, reject) => { fixtureHeld.push({ name, payload, resolve: () => resolve(env), reject });
            if (opts && opts.signal) opts.signal.addEventListener('abort', () => reject(new Error('fixture abort'))); });
        } };
        KM.DB.probeSourceRevision = async () => fixtureRevision;
        // Keep the actual DTO normalizer, row projection, renderers, state machines and lifecycle hooks.
        _irReadModel = KM.DB.adaptInventoryReplenishmentWorkspace(raw);
        _irReadModelAt = Date.now(); _irReadModelSource = { ..._irSourceStamp_(), server: fixtureRevision };
        _irSearch.applied = { country: 'US', marketplaceId: 'MP-US' }; _irSearch.status = 'READY'; _irSearch.seq = 1;
        _irSetSelectors_(_irSearch.applied); _irRememberScope_(_irSearch.applied);
        _irRecoApplyEnvelope({ success: true, data: { lines }, meta: { recommendationWorkspaceHandlerVersion: _IR_RECO_CACHE_HANDLERS[0] } }, JSON.stringify({ company: 'FixtureCo', country: 'US', marketplace: 'Amazon' }), { company: 'FixtureCo', country: 'US', marketplace: 'Amazon' });
        _irRecoState.source = { ..._irSourceStamp_(), server: fixtureRevision };
        const key = _irExposureScopeKey_();
        _irExposureByScope[key] = { state: 'READY', model: _irReadModel, source: { ..._irSourceStamp_(), server: fixtureRevision }, indexes: _irBuildExposureIndexes_(_irReadModel) };
        window.cellSnapshot = () => Array.from(document.querySelectorAll('#replenScrollBody .scroll-row')).map(row => ({ key: row.getAttribute('data-rowkey'), sku: row.getAttribute('data-sku'),
          values: ['.replen-onway-cell', '.replen-avg-cell', '.replen-dos-cell'].map(selector => row.querySelector(selector).textContent) }));
        KM.lifecycle.switchTo('ops-section');
      }, { raw, lines });
      await page.waitForFunction(() => document.querySelector('.replen-avg-cell')?.textContent.trim().startsWith('7.0'));
      const initial = await page.evaluate(() => cellSnapshot());
      check(width + ' actual row projection has resolved all three metrics', initial.length === 4 && initial.every(r => r.values[1].startsWith('7.0') && !r.values[2].includes('...')));
      check(width + ' actual exposure projection includes a nonzero shipment', initial[0].values[0].includes('45'));
      await page.evaluate(() => { _irWarmCells = null; _irBootstrap.mode = 'COALESCED'; renderReplenishment(); });
      check(width + ' first completed paint caches metrics before any unmount', await page.evaluate(() => _irWarmCells?.hasVelocity && _irWarmCells?.hasOnway));
      await page.evaluate(async () => {
        window.rapidSamples = []; window.watchFrames = true;
        function sample() { if (KM.lifecycle.getCurrentPage() === 'ops-section') rapidSamples.push(cellSnapshot()); if (watchFrames) requestAnimationFrame(sample); }
        requestAnimationFrame(sample);
        for (let i = 0; i < 10; i++) { KM.lifecycle.switchTo('home-section'); KM.lifecycle.switchTo('ops-section'); await new Promise(r => setTimeout(r, 0)); }
      });
      await page.waitForFunction(() => rapidSamples.length > 2, null, { timeout: 10000 });
      check(width + ' rapid warm return retains each completed metric on every visible frame', await page.evaluate(expected => rapidSamples.length > 0 && rapidSamples.every(s => JSON.stringify(s) === JSON.stringify(expected)), initial));
      check(width + ' fresh unchanged source sends zero workspace requests', await page.evaluate(() => fixtureCalls.length === 0));
      await page.evaluate(() => { fixtureRevision = 'r2'; _irBootstrap.mode = 'COALESCED'; loadRecommendationWorkspace_(); });
      await page.waitForFunction(() => _irRecoState.status === 'LOADING');
      check(width + ' refresh before first return cannot erase completed cells', JSON.stringify(await page.evaluate(() => cellSnapshot())) === JSON.stringify(initial));
      await page.evaluate(async () => { for (let i = 0; i < 10; i++) { KM.lifecycle.switchTo('home-section'); KM.lifecycle.switchTo('ops-section'); await new Promise(r => setTimeout(r, 0)); } });
      await page.waitForTimeout(120);
      check(width + ' rapid return during real refresh preserves old metric cells', JSON.stringify(await page.evaluate(() => cellSnapshot())) === JSON.stringify(initial));
      check(width + ' source change has one shared primary refresh across rapid mounts', await page.evaluate(() => fixtureCalls.filter(c => c.name === 'inventoryReplenishment' && c.payload.only.length === 13).length === 1));
      await page.screenshot({ path: path.join(out, 'rapid-return-' + width + '.png'), fullPage: true });
      await page.evaluate(() => { watchFrames = false; fixtureHeld.splice(0).forEach(h => h.resolve()); });
      await page.waitForTimeout(100);
      console.log('ERRORS', errors);
      check(width + ' no runtime errors or external services', !errors.length && !external.length);
      await page.close();
    }
    console.log('INVENTORY_RAPID_RETURN_PASS ' + checks);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
