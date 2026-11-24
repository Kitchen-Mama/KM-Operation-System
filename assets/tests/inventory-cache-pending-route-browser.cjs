'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '../..');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const out = path.join(root, 'output/site-inventory-cache-pending-route-20261124/browser');
let checks = 0;
function check(name, v) { assert(v, name); console.log('PASS ' + name); checks++; }
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://localhost').pathname;
    if (p === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"></head><body>' + read('assets/html/pages/inventory-replenishment.html') + '</body></html>'); return; }
    const file = path.resolve(root, '.' + decodeURIComponent(p));
    if (!file.startsWith(root + path.sep) || !p.startsWith('/assets/')) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, bytes) => { if (err) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(bytes); });
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
      for (const file of ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css', 'core/km-sticky-header.css', 'pages/inventory-replenishment.css']) {
        await page.addStyleTag({ content: read('assets/css/' + file) });
      }
      await page.addStyleTag({ content: 'body{margin:0}.module-section{display:block}#ops-section{padding:12px}' });
      await page.evaluate(() => {
        window.KM = { lifecycle: { register(id, hooks) { window.inventoryHooks = hooks; } }, DB: {}, api: {} };
        window.isOperationDbApiConfigured = () => false;
      });
      await page.addScriptTag({ url: base + '/assets/js/core/supply-planning-active-route-classification.js' });
      await page.addScriptTag({ url: base + '/assets/js/pages/inventory-replenishment.js' });
      await page.evaluate(() => {
        window.fixtureScope = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
        window.fixtureCalls = []; window.fixtureHeld = []; window.fixtureRate = 2.5; window.fixtureDos = 80;
        window.fixtureModel = { getMarketplaces: [
          { marketplaceId: 'US-A', marketplace_id: 'US-A', ...fixtureScope, status: 'active' },
          { marketplaceId: 'JP-A', marketplace_id: 'JP-A', company: 'ResTW', country: 'JP', marketplace: 'Amazon', status: 'active' }
        ] };
        Object.keys(IR_EXPOSURE_GETTER_TABLE_).forEach(k => fixtureModel[k] = []);
        window.fixtureStamp = () => ({ planning: 1, exposure: 1, day: _irTaipeiDay_(Date.now()), server: 'revision-1' });
        KM.DB.sourceWriteEpoch = () => ({ planning: 1, exposure: 1 });
        KM.DB.probeSourceRevision = async () => 'revision-1';
        KM.DB.adaptInventoryReplenishmentWorkspace = () => fixtureModel;
        KM.api.getWorkspace = (name, payload) => {
          fixtureCalls.push({ name, payload });
          return new Promise((resolve, reject) => fixtureHeld.push({ name, resolve, reject }));
        };
        _irEffectiveWorkspace = () => true;
        _replenDemoOn = () => false;
        _irRecommendationWorkspaceEnabled = () => true;
        _irRecoScopeRequest = () => fixtureScope;
        // Data projection is the boundary: real render, cache, revision, loaders and cell painters run below.
        _getCloudReplenishmentData = () => ['MANUAL', 'AI', 'EMPTY', 'LOCAL', 'CANCELLED', 'SUBMITTED', 'FOREIGN'].map(sku => ({
          sku, company: fixtureScope.company, country: fixtureScope.country, marketplace: fixtureScope.marketplace,
          category: 'Fixture', replenishmentModel: 'sales_driven', currentInventory: 200, thirdPartyStock: 10,
          avgDailySales: _irRecoState.loadedOk ? fixtureRate : '...', daysOfSupply: _irRecoState.loadedOk ? fixtureDos : '...',
          avgSalesCellState: _irRecoState.loadedOk ? 'READY' : 'PENDING', forecast60d: 300, upcomingEventQty: 0,
          cnStock: 183, twStock: 0, suggestedQty: 160
        }));
        _irSuggestedCellHtml = () => '160';
        _irRecoRerenderSummaries = () => {};
        _irRecoUpdateSuggestedCells = () => {};
        _inventoryReplenStaticInit = () => {};
        _restoreAllocationDraftFromSession = () => {};
        bindReplenFilterDependencies = () => {};
        initReplenRecoContext = () => {};
        _irResumeGapJobOnMount_ = () => {};
        _irMountGen = 1;
        _irReadModel = fixtureModel; _irReadModelAt = Date.now(); _irReadModelSource = fixtureStamp();
        _irSearch.applied = { country: 'US', marketplaceId: 'US-A', ltsFilter: '' };
        _irSearch.status = 'READY'; _irSearch.seq = 1;
        _irSetSelectors_(_irSearch.applied); _irRememberScope_(_irSearch.applied);
        _irRecoState = { ..._irRecoBlank('READY'), loadedOk: true, appliedScopeKey: _irAppliedScopeKey_(),
          contextKey: JSON.stringify(fixtureScope), scope: fixtureScope, source: fixtureStamp(), linesBySku: {} };
        var key = _irExposureScopeKey_();
        _irExposureByScope[key] = { state: 'READY', model: fixtureModel, source: fixtureStamp(),
          indexes: { shipDisplayByReceiver: { [_irReceiverKey('ResUS', 'US', 'Amazon', 'MANUAL')]: { d0_18: 45 } } } };
        window.fixtureDraft = (id, status, company = 'ResUS') => ({ allocationDraftId: id, company, country: 'US', marketplace: 'Amazon', status });
        window.fixtureLine = (id, sku, status = 'active') => ({ allocationDraftId: id, allocationDraftLineId: 'L-' + id, lineStatus: status,
          raw: { allocation_draft_id: id, allocation_draft_line_id: 'L-' + id, sku, line_status: status } });
        fixtureModel.getShippingAllocationDrafts = [fixtureDraft('M', 'draft'), fixtureDraft('A', 'site_confirmed'),
          fixtureDraft('C', 'cancelled'), fixtureDraft('S', 'submitted'), fixtureDraft('F', 'draft', 'Other')];
        fixtureModel.getShippingAllocationDraftLines = [fixtureLine('M', 'MANUAL'), fixtureLine('A', 'AI'), fixtureLine('C', 'CANCELLED'), fixtureLine('S', 'SUBMITTED'), fixtureLine('F', 'FOREIGN')];
        replenAllocationDraft = { context: fixtureScope, bySku: { EMPTY: [{ route_kind: 'MANUAL_COMPOSER' }], LOCAL: [{ client_route_instance_id: 'local-1', route_incomplete: true }] } };
        renderReplenishment();
      });
      const cell = sku => page.locator('.scroll-row[data-sku="' + sku + '"] .ai-action-cell');
      check(width + ' manual and AI persisted routes show Pending Route without expanding', await cell('MANUAL').textContent() === 'Pending Route' && await cell('AI').textContent() === 'Pending Route');
      check(width + ' local real route shows pending, composer and inactive/foreign routes stay blank', await cell('LOCAL').textContent() === 'Pending Route' && (await Promise.all(['EMPTY', 'CANCELLED', 'SUBMITTED', 'FOREIGN'].map(s => cell(s).textContent()))).every(t => t === ''));
      check(width + ' column renamed AI Plan, no misleading recommendation action', (await page.locator('.km-table__header-cell--note-span').allTextContents()).includes('AI Plan') && await page.locator('.ai-action-cell[role="button"]').count() === 0);
      await page.evaluate(() => {
        replenAllocationDraft.bySku.SUBMITTED = [{ allocation_draft_id: 'S' }];
        replenAllocationDraft.bySku.CANCELLED = [{ allocation_draft_id: 'C' }];
        replenAllocationDraft.bySku.FOREIGN = [{ allocation_draft_id: 'F' }]; _persistAllocationDraft();
      });
      check(width + ' stale local recovery cannot resurrect a submitted, cancelled or foreign header', (await Promise.all(['SUBMITTED', 'CANCELLED', 'FOREIGN'].map(s => cell(s).textContent()))).every(t => t === ''));
      await page.evaluate(() => { fixtureModel.getShippingAllocationDraftLines[0].lineStatus = 'cancelled'; _irPaintPendingRoutes_(); });
      check(width + ' authoritative line cancellation clears Pending Route', await cell('MANUAL').textContent() === '');
      await page.evaluate(() => { fixtureModel.getShippingAllocationDraftLines[0].lineStatus = 'active'; _irTerminalDraftIds_.M = 'submitted'; _irPaintPendingRoutes_(); });
      check(width + ' submit acknowledgement clears Pending Route before stale exposure readback', await cell('MANUAL').textContent() === '');
      await page.evaluate(() => { delete _irTerminalDraftIds_.M; _irPaintPendingRoutes_(); });
      await page.evaluate(() => { delete replenAllocationDraft.bySku.LOCAL; _persistAllocationDraft(); });
      check(width + ' route deletion updates first layer without rebuilding row', await cell('LOCAL').textContent() === '');
      await page.evaluate(() => { replenAllocationDraft.context = { ...fixtureScope, company: 'Other' }; replenAllocationDraft.bySku.LOCAL = [{ client_route_instance_id: 'foreign' }]; _persistAllocationDraft(); });
      check(width + ' local route from another company cannot mark this site', await cell('LOCAL').textContent() === '');
      await page.evaluate(() => {
        window.beforeCells = Array.from(document.querySelectorAll('.scroll-row')).map(r => ['.replen-onway-cell', '.replen-avg-cell', '.replen-dos-cell'].map(s => r.querySelector(s).textContent));
        _irCaptureWarmCells_(); _irRecoCancelInFlight_('DISABLED'); _irMountGen++;
        _irReadModelAt -= 11 * 60 * 1000;
        _irBootstrapScope_();
      });
      await page.waitForFunction(() => fixtureHeld.length > 0 && _irBootstrap.exposureSourceCheck === 'CURRENT');
      check(width + ' expired same-site result immediately restored, no Searching', await page.locator('.scroll-row').count() === 7 && await page.locator('.replen-search-loading').count() === 0);
      check(width + ' unchanged revision does not re-read On the Way or recommendation', await page.evaluate(() => fixtureCalls.every(c => c.name === 'inventoryReplenishment' && c.payload.only.length === 13)));
      check(width + ' all three completed columns remain unchanged while primary refresh waits', await page.evaluate(() => JSON.stringify(beforeCells) === JSON.stringify(Array.from(document.querySelectorAll('.scroll-row')).map(r => ['.replen-onway-cell', '.replen-avg-cell', '.replen-dos-cell'].map(s => r.querySelector(s).textContent)))));
      await page.evaluate(() => { fixtureHeld.shift().reject(new Error('fixture offline')); });
      await page.waitForFunction(() => _irBootstrap.revalidateFailed);
      check(width + ' quiet refresh failure retains rows with an honest cached notice', await page.locator('.scroll-row').count() === 7 && (await page.locator('#replenCacheStatus').textContent()).includes('Update failed'));
      await page.evaluate(() => { KM.DB.probeSourceRevision = async () => 'revision-2'; _irBootstrapScope_(); });
      await page.waitForFunction(() => fixtureHeld.length === 3 && _irRecoState.status === 'LOADING' && _irExposureStateForRender_() === 'LOADING');
      check(width + ' actual revision change revalidates each family once, not once per SKU', await page.evaluate(() => fixtureHeld.filter(x => x.name === 'recommendation').length === 1 && fixtureCalls.filter(c => c.payload.only?.length === 6).length === 1));
      await page.evaluate(() => renderReplenishment());
      check(width + ' secondary refresh never replaces completed cells with placeholders', await page.evaluate(() => JSON.stringify(beforeCells) === JSON.stringify(Array.from(document.querySelectorAll('.scroll-row')).map(r => ['.replen-onway-cell', '.replen-avg-cell', '.replen-dos-cell'].map(s => r.querySelector(s).textContent)))));
      check(width + ' cached secondary values are visibly attributed, not business-model fallback', await page.locator('[data-cached-result="true"]').count() === 21 && await page.evaluate(() => !_irRecoState.loadedOk && _irExposureStateForRender_() === 'LOADING'));
      await page.evaluate(() => {
        fixtureRate = 4; fixtureDos = 50;
        fixtureHeld.splice(0).forEach(p => p.resolve({ success: true, meta: { sourceRevision: 'revision-2', handlerVersion: _IR_RECO_CACHE_HANDLERS[0], calculationMonth: '2026-11', planningCycle: 'RECO-2026-11', calculationDate: '2026-11-24' },
          data: p.name === 'recommendation' ? { lines: ['MANUAL', 'AI', 'EMPTY', 'LOCAL', 'CANCELLED', 'SUBMITTED', 'FOREIGN'].map(sku => ({ sku, horizonBasis: { avgSalesPerDay: 4 } })) } : {} }));
      });
      await page.waitForFunction(() => _irRecoState.loadedOk && _irBootstrap.revalidated && _irExposureStateForRender_() === 'READY');
      check(width + ' successful revalidation installs new numbers, clears cached attribution and notice', await page.locator('.replen-avg-cell').first().textContent() === '4' && await page.locator('.replen-dos-cell').first().textContent() === '50' && await page.locator('[data-cached-result="true"]').count() === 0 && await page.locator('#replenCacheStatus').isHidden());
      await page.evaluate(() => { document.querySelector('#replenScrollBody').closest('.scroll-col').scrollLeft = 9999; });
      check(width + ' Pending Route fits its stable-width cell', await cell('MANUAL').evaluate(el => el.scrollWidth <= el.clientWidth && el.textContent === 'Pending Route'));
      check(width + ' controls do not overflow viewport', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(out, 'restored-pending-route-' + width + '.png'), fullPage: true });
      await page.evaluate(() => {
        _irSearch.applied = { country: 'JP', marketplaceId: 'JP-A' }; _irSearch.seq++;
        _irSearch.status = 'LOADING'; renderReplenishment();
      });
      check(width + ' another site never inherits cached numbers or route badges', await page.locator('.scroll-row').count() === 0 && await page.locator('.replen-search-loading').count() === 1 && await page.locator('#replenCacheStatus').isHidden());
      await page.evaluate(() => {
        _irReadModel = null; _irReadModelAt = 0;
        window.coldResult = _irRestorableResult_({ country: 'US', marketplaceId: 'US-A' });
        window.markupResolve = null;
        _ensureInventoryReplenishmentMarkup = () => new Promise(r => window.markupResolve = r);
        inventoryHooks.mount(); inventoryHooks.unmount();
        window.callsBeforeAbandonedMount = fixtureCalls.length; markupResolve(true);
      });
      await page.waitForTimeout(50);
      check(width + ' cold cache is not promoted and abandoned async mount cannot bootstrap', await page.evaluate(() => !coldResult.ok && fixtureCalls.length === callsBeforeAbandonedMount));
      check(width + ' browser has no runtime errors or external service access', !errors.length && !external.length);
      if (errors.length) console.log(errors);
      await page.close();
    }
    console.log('INVENTORY_CACHE_PENDING_ROUTE_BROWSER_PASS ' + checks + ' live_business_writes=0');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(err => { console.error(err); process.exitCode = 1; });
