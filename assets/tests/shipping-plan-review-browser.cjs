'use strict';
// Actual partial, page code, DB display helpers and CSS. All requests blocked; writer is a recording stub.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const { extract } = require('./ad4/extract.cjs');
const root = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const out = path.join(root, 'output/shipping-plan-review-20261124');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }

(async () => {
    fs.mkdirSync(out, { recursive: true });
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        for (const width of [1440, 1024, 390]) {
            const page = await browser.newPage({ viewport: { width, height: 900 }, timezoneId: 'America/Los_Angeles' });
            const errors = [], requests = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('**/*', r => { requests.push(r.request().url()); return r.abort(); });
            await page.setContent(read('assets/html/pages/shipping-plan.html'));
            await page.addStyleTag({ content: ':root{--space-sm:8px;--space-md:16px;--space-lg:24px;--border-light:#e2e8f0;--radius-sm:4px;--radius-md:8px;--text-primary:#263238;--text-muted:#64748b;--soft-green:#76a75b}body{margin:12px;font:14px Arial}*{box-sizing:border-box}' });
            await page.addStyleTag({ content: read('assets/css/pages/shipping-plan.css') });
            await page.addScriptTag({ content: read('assets/js/api/operation-system-db-api.js') });
            await page.addScriptTag({ content: read('assets/js/pages/shipping-plan.js') });
            const mapperNames = ['weeklyWsStr_', 'weeklyWsNum_', 'weeklyWsLc_', 'weeklyStatusLabel_', 'weeklyWarehouseRef_', 'weeklyMapPlan_'];
            const mapper = extract(read('assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs'), n => mapperNames.includes(n), n => n === 'WEEKLY_WS_STATUS_LABELS_');
            assert.equal(mapper.length, mapperNames.length + 1);
            await page.addScriptTag({ content: mapper.map(p => p.text).join('\n') });
            await page.evaluate(() => {
                window.writes = [];
                window.alert = () => {};
                KM.DB.getWarehouses = () => [{ warehouseId: 'W1', warehouseName: 'Canonical US warehouse' }];
                window.fixturePlan = _spWorkspacePlanRecord({ planId: 'P', company: 'Identity retained', country: 'US', marketplace: 'Amazon',
                    status: 'draft', shippingMethod: 'truck', lastMileDelivery: 'truck', planVersion: 2, updatedAt: '2026-11-24T00:00:00Z',
                    carrier: { id: 'C1', name: 'Carrier One' }, raw: { ship_from: 'Outdated snapshot', source_warehouse_id: 'W1',
                        destination: 'FBA', submitted_at: '2026-11-23T16:30:00Z', created_at: '2026-11-22', estimated_total_cost: '' } });
                window.vocabulary = { shipping_method: [{ value: 'truck' }, { value: 'air' }], last_mile_delivery: [{ value: 'truck' }, { value: 'parcel' }],
                    carriers: [{ carrier_id: 'C1', carrier_name: 'Carrier One', services_known: true, services: [
                        { shipping_method: 'truck', last_mile_delivery: 'truck' }, { shipping_method: 'air', last_mile_delivery: 'parcel', shipping_method_label: 'Air Express' }] },
                    { carrier_id: 'C2', carrier_name: 'Carrier Two', services_known: true, services: [{ shipping_method: 'truck', last_mile_delivery: 'parcel' }] },
                    { carrier_id: 'C3', carrier_name: 'Unknown services', services_known: false, services: [] }] };
                window.domestic = { success: true, lane: { customs_applicable: false }, options: [], service_vocabulary: vocabulary,
                    current: { carrier_id: 'C1', shipping_method: 'truck', last_mile_delivery: 'truck', state: 'NOT_PRICED' } };
                KM.DB.getShippingPlanRateCardOptions = async () => domestic;
                KM.DB.selectShippingPlanRateCardWithCustoms = async (...args) => { writes.push(args); return { success: true, ...args[1], priced: false }; };
                // Exercise the real Save validation and registered writer, isolate unrelated command/readback UI.
                _spRunCommand_ = (key, invoke) => Promise.resolve().then(invoke);
                const lines = [30, 20].map((qty, i) => ({ shippingPlanLineId: 'L' + i, shippingPlanId: 'P', sku: ['SKU10','SKU2'][i],
                    approvedQty: qty, cartonQty: qty / 10, unitsPerCarton: 10, snapshotCurrentStock: 100, snapshotAvgSalesPerDay: 2 }));
                _spLastModel = { source: 'workspace', plans: [fixturePlan], lines };
                _spRenderDbSection('shippingPlanCards', [fixturePlan], 'draft', { P: lines }, '', null);
            });
            const summary = page.locator('#sp-card-P .sp-card-summary');
            check(width + ' ordinary shipping rows use natural alphanumeric SKU order',
                (await page.locator('#sp-card-P .sp-sku-table tbody tr td:first-child').allTextContents()).join(',') === 'SKU2,SKU10');
            const notesChecks = await page.evaluate(() => {
                const receipt = '[WDL1] ' + JSON.stringify({ request: 'WDL-1', edits: [{ op: 'add', sku: 'SKU1', quantity: 10 }] });
                const packing = '[KMPACK1:' + encodeURIComponent(JSON.stringify({ version: 'MIXED_CARTONS_V1', ref: 'L1', groups: [] })) + ']';
                const pending = '[WDL1-PENDING:WDL-2]';
                const human = 'Factory instruction\n[REJECTED v2 @2026-11-26 12:07:28] Adjust shipping\n[NOTE @2026-11-26 12:08:00 by operation-system] Change quantity\nKeep this second line <img src=x onerror=alert(1)>\n[UNKNOWN] Keep this note\nDiscuss [WDL1] with factory';
                const raw = [receipt, human, packing, pending].join('\r\n');
                fixturePlan.note = raw;
                const lines = _spLastModel.lines;
                _spRenderDbSection('shippingPlanCards', [fixturePlan], 'draft', { P: lines }, '', null);
                const el = document.querySelector('#sp-card-P .sp-human-notes');
                const result = { humanPreserved: el.textContent === 'Notes:\n' + human,
                    noInjectedElements: !el.querySelector('img'), originalUnchanged: fixturePlan.note === raw,
                    unknownPreserved: _spVisibleNotes_('[WDL1] not JSON\n[WDL1] {"message":"human example"}') === '[WDL1] not JSON\n[WDL1] {"message":"human example"}' };
                fixturePlan.note = [receipt, packing, pending].join('\n');
                _spRenderDbSection('shippingPlanCards', [fixturePlan], 'draft', { P: lines }, '', null);
                result.systemOnlyHidden = !document.querySelector('#sp-card-P .sp-human-notes');
                fixturePlan.note = human;
                _spRenderDbSection('shippingPlanCards', [fixturePlan], 'draft', { P: lines }, '', null);
                return result;
            });
            Object.entries(notesChecks).forEach(([name, value]) => check(width + ' notes ' + name, value));
            assert.deepEqual(await summary.locator('.sp-summary-label').allTextContents(), [
                'Status', 'Submitted Date', 'Country', 'Marketplace', 'Shipping Method', 'Ship From', 'Destination', 'Total Pcs', 'Total Cartons', 'Total Cost']);
            check(width + ' exact metadata order and Company hidden', !(await summary.innerText()).includes('Identity retained'));
            check(width + ' Taipei date, display enum, canonical warehouse, pending cost', await page.evaluate(() => {
                const values = [...document.querySelectorAll('#sp-card-P .sp-summary-value')].map(e => e.textContent);
                return values[1] === '2026-11-24' && values[4] === 'Truck' && values[5] === 'Canonical US warehouse' && values[7] === '50' && values[8] === '5' && values[9] === 'Cost pending' && fixturePlan.company === 'Identity retained';
            }));
            check(width + ' exactly two metadata rows', await summary.locator('.sp-summary-item').evaluateAll(items => new Set(items.map(e => Math.round(e.getBoundingClientRect().top))).size === 2));
            check(width + ' date-only and Taipei wall-clock stable; invalid and blank absent', await page.evaluate(() =>
                _spSubmittedDate_({ submittedAt: '2026-11-24' }) === '2026-11-24' &&
                _spSubmittedDate_({ submittedAt: '2026-11-24 00:30:00' }) === '2026-11-24' &&
                _spSubmittedDate_({ submittedAt: '2026-02-30' }) === '--' && _spSubmittedDate_({ submittedAt: '2026-11-24 25:00:00' }) === '--' &&
                _spSubmittedDate_({ submittedAt: 'invalid' }) === '--' && _spSubmittedDate_({}) === '--'));
            check(width + ' unknown source never invents warehouse', await page.evaluate(() =>
                _spResolveShipFrom_({ sourceWarehouseId: 'MISSING', shipFrom: 'Factory' }) === 'MISSING' && _spResolveShipFrom_({}) === '--'));
            check(width + ' actual 40 mapper source ref renders cold without broad master', await page.evaluate(() => {
                const vm = weeklyMapPlan_({ shipping_plan_id: 'COLD', source_warehouse_id: 'COLD-WH', status: 'draft' },
                    { 'COLD-WH': { warehouse_code: 'COLD-CODE', warehouse_name: 'Cold canonical warehouse' } }, {}, {});
                const saved = KM.DB.getWarehouses;
                KM.DB.getWarehouses = () => { throw new Error('Unexpected broad master read'); };
                try {
                    const plan = _spWorkspacePlanRecord(vm);
                    const onlyRef = _spWorkspacePlanRecord({ ...vm, raw: {} });
                    return plan.sourceWarehouse === vm.sourceWarehouse && onlyRef.sourceWarehouseId === 'COLD-WH' &&
                        _spResolveShipFrom_(plan) === 'Cold canonical warehouse' && _spResolveShipFrom_(onlyRef) === 'Cold canonical warehouse';
                } finally { KM.DB.getWarehouses = saved; }
            }));
            check(width + ' mismatched source ref ignored and duplicate projection beats ref', await page.evaluate(() => {
                const plan = _spWorkspacePlanRecord({ planId: 'COLD', sourceWarehouse: { id: 'COLD-WH', name: 'Cold canonical warehouse' } });
                const wrong = _spResolveShipFrom_({ ...plan, sourceWarehouseId: 'MISSING' });
                _spLastModel.warehouses = [{ warehouse_id: 'COLD-WH' }, { warehouse_id: 'COLD-WH' }];
                try { return wrong === 'MISSING' && _spResolveShipFrom_(plan) === 'COLD-WH'; }
                finally { delete _spLastModel.warehouses; }
            }));
            check(width + ' scoped warehouse projection wins; duplicates stay unresolved', await page.evaluate(() => {
                _spLastModel.warehouses = [{ warehouse_id: 'W1', warehouse_name: 'Scoped warehouse' }];
                const scoped = _spResolveShipFrom_(fixturePlan);
                _spLastModel.warehouses.push({ warehouse_id: 'W1', warehouse_name: 'Duplicate' });
                const duplicate = _spResolveShipFrom_(fixturePlan); delete _spLastModel.warehouses;
                return scoped === 'Scoped warehouse' && duplicate === 'W1';
            }));
            const metricsChecks = await page.evaluate(() => {
                const warning = 'SITE_SOURCE_SCOPE_UNDECIDED: old environment gate';
                const metrics = { company: 'Identity retained', country: 'US', marketplace: 'Amazon', sku: 'METRIC-SKU',
                    state: 'READY', currentStock: 96, avgSalesPerDay: 1.2, daysOfSupply: 80 };
                const line = _spWorkspaceLineRecord({ lineId: 'METRIC-LINE', planId: 'P', sku: 'METRIC-SKU', marketplace: 'Amazon',
                    liveSiteMetrics: metrics, raw: { snapshot_avg_sales_warning: warning, snapshot_current_stock: '', snapshot_avg_sales_per_day: '' } }, 'P');
                const display = (patch, plan = fixturePlan) => _spLineDisplay({ ...line, liveSiteMetrics: { ...metrics, ...patch } }, plan, null);
                const fresh = display({});
                const zero = display({ currentStock: 0, avgSalesPerDay: 0, daysOfSupply: 0 });
                const snapshotZero = _spLineDisplay(_spWorkspaceLineRecord({ sku: 'METRIC-SKU', raw: {
                    snapshot_current_stock: 0, snapshot_avg_sales_per_day: 0, snapshot_days_of_supply: 0 } }, 'P'), fixturePlan, null);
                const errorWithSnapshot = _spLineDisplay(_spWorkspaceLineRecord({ sku: 'METRIC-SKU', liveSiteMetrics: { ...metrics, state: 'ERROR' }, raw: {
                    snapshot_current_stock: 21, snapshot_avg_sales_per_day: 3, snapshot_days_of_supply: 7 } }, 'P'), fixturePlan, null);
                const rejected = ['company', 'country', 'marketplace', 'sku'].every(key =>
                    String(display({ [key]: 'WRONG' }).currentStock).includes('Not available') &&
                    String(display({ [key]: '' }).currentStock).includes('Not available'));
                const errors = ['ERROR', 'READ_FAILED', 'PENDING', 'REFUSED'].every(state => String(display({ state }).avgSales).includes('Not available'));
                const protectedWarnings = ['COMPANY_UNKNOWN', 'COMPANY_NOT_LISTED', 'NO_MARKETPLACE_SKU', 'NO_MARKETPLACE_ROW', 'NOT_CONFIRMED', 'MARKETPLACE_BLANK'].every(code =>
                    String(_spLineDisplay({ ...line, raw: { snapshot_avg_sales_warning: 'SITE_SOURCE_' + code } }, fixturePlan, null).currentStock).includes('Not available'));
                const missing = display({ currentStock: null, avgSalesPerDay: '', daysOfSupply: null });
                const partial = display({ currentStock: null, avgSalesPerDay: 0, daysOfSupply: null });
                const invalid = display({ currentStock: false, avgSalesPerDay: 'not numeric', daysOfSupply: -1 });
                const wrongLineSite = _spLineDisplay({ ...line, marketplace: 'Shopify' }, fixturePlan, null);
                const legacyLive = { inv: _spLatestMap([{ company: fixturePlan.company, country: 'US', marketplace: 'Amazon', sku: 'METRIC-SKU', availableQty: 96, fcTransferQty: 0, fcProcessingQty: 0 }]),
                    weekly: _spLatestMap([{ company: fixturePlan.company, country: 'US', marketplace: 'Amazon', sku: 'METRIC-SKU', salesUnits7d: 14 }]) };
                const legacyWrongSite = _spLineDisplay({ ...line, marketplace: 'Shopify', liveSiteMetrics: null, raw: {} }, fixturePlan, legacyLive);
                _spRenderDbSection('pendingApprovalCards', [fixturePlan], 'pending_approval', { P: [line] }, '', null);
                const cells = [...document.querySelectorAll('#pendingApprovalCards .sp-sku-table tbody td')].map(e => e.textContent);
                document.getElementById('pendingApprovalCards').innerHTML = '';
                return { carried: line.liveSiteMetrics === metrics,
                    rendered: cells[1] === '96' && cells[2] === '1.2' && cells[3] === '80.0',
                    fresh: fresh.currentStock === 96 && fresh.avgSales === '1.2' && fresh.daysOfSupply === '80.0',
                    zero: zero.currentStock === 0 && zero.avgSales === '0.0' && zero.daysOfSupply === '0.0',
                    snapshotZero: snapshotZero.currentStock === 0 && snapshotZero.avgSales === '0.0' && snapshotZero.daysOfSupply === 0,
                    errorWithSnapshot: errorWithSnapshot.currentStock === 21 && errorWithSnapshot.avgSales === '3.0' && errorWithSnapshot.daysOfSupply === 7,
                    mixedGuard: String(_spLineDisplay({ ...line, raw: { snapshot_avg_sales_warning: warning + '; SITE_SOURCE_COMPANY_UNKNOWN' } }, fixturePlan, null).currentStock).includes('Not available'),
                    incompletePlanScope: String(display({}, { ...fixturePlan, company: '' }).currentStock).includes('Not available'),
                    rejected, errors, protectedWarnings,
                    missing: String(missing.currentStock).includes('Not available') && String(invalid.currentStock).includes('Not available'),
                    partial: String(partial.currentStock).includes('unknown, not zero') && partial.avgSales === '0.0' && partial.daysOfSupply === '--',
                    wrongLineSite: String(wrongLineSite.currentStock).includes('Not available'),
                    legacyWrongSite: typeof legacyWrongSite.currentStock === 'string' && legacyWrongSite.currentStock.includes('unknown, not 0') && legacyWrongSite.avgSales.includes('unknown, not 0'),
                    immutable: line.raw.snapshot_avg_sales_warning === warning && line.raw.snapshot_current_stock === '' };
            });
            for (const [name, passed] of Object.entries(metricsChecks)) check(width + ' exact-site live metrics ' + name, passed);
            await page.locator('#sp-card-P .sp-btn-expand').click();
            await page.locator('.sp-svc-service').waitFor();
            check(width + ' one paired service control; canonical tokens hidden', await page.locator('.sp-svc select').count() === 2 &&
                await page.locator('.sp-svc-method').getAttribute('type') === 'hidden' && await page.locator('.sp-svc-lastmile').getAttribute('type') === 'hidden');
            const labels = await page.locator('.sp-svc-service option').allTextContents();
            check(width + ' real label preferred and known enums initial capped', labels.includes('Air Express') && labels.some(s => s.includes('Truck') && !s.includes('truck')));
            await page.locator('.sp-svc-carrier').selectOption('C2');
            check(width + ' carrier change clears both canonical tokens', await page.locator('.sp-svc-method').inputValue() === '' && await page.locator('.sp-svc-lastmile').inputValue() === '');
            assert.deepEqual(await page.locator('.sp-svc-service option').evaluateAll(a => a.map(o => o.value).filter(Boolean)), ['["truck","parcel"]']);
            check(width + ' declared tuples only, no Cartesian product', true);
            await page.locator('.sp-svc-service').selectOption('["truck","parcel"]');
            await page.locator('.sp-svc-save').click();
            await page.waitForFunction(() => writes.length === 1);
            const saved = await page.evaluate(() => writes[0]);
            check(width + ' update persists only canonical service and expected token', saved[0] === 'P' && saved[1].carrier_id === 'C2' && saved[1].shipping_method === 'truck' && saved[1].last_mile_delivery === 'parcel' && saved[1].explicit_service === true && saved[3] === '2026-11-24T00:00:00Z' && !('shipping_method_label' in saved[1]));
            await page.evaluate(() => { document.querySelector('.sp-svc-lastmile').value = 'truck'; return spSvcSave('P'); });
            check(width + ' tampered invalid pair is not sent', await page.evaluate(() => writes.length === 1));
            await page.locator('.sp-svc-carrier').selectOption('C3');
            check(width + ' unknown carrier services are not fabricated', await page.locator('.sp-svc-service option').count() === 1);
            await page.locator('.sp-svc-save').click();
            check(width + ' empty service cannot be saved', await page.evaluate(() => writes.length === 1));
            await page.locator('.sp-svc-carrier').selectOption('C1');
            await page.locator('.sp-svc-service').selectOption('["truck","truck"]');
            await page.evaluate(() => {
                fixturePlan.updatedAt = ''; _spReadbackAfterWrite_ = () => Promise.resolve(); return spSvcSave('P');
            });
            check(width + ' missing edit token blocks service update', await page.evaluate(() => writes.length === 1 && document.querySelector('.sp-svc-note').textContent.includes('no edit token')));
            await page.evaluate(() => { fixturePlan.updatedAt = '2026-11-24T00:00:00Z'; spSvcServiceChanged('P'); });
            const layout = await page.evaluate(() => {
                const s = document.querySelector('.sp-card-summary').getBoundingClientRect(), a = document.querySelector('.sp-card-actions').getBoundingClientRect();
                return { fits: document.documentElement.scrollWidth <= innerWidth + 1, separate: a.top >= s.bottom - 1 || a.left >= s.right - 1,
                    overflow: [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).map(e => e.className).slice(0, 15) };
            });
            if (!layout.fits || !layout.separate) console.log(layout);
            check(width + ' no page overflow or metadata/action overlap', layout.fits && layout.separate);
            await page.screenshot({ path: path.join(out, 'domestic-' + width + '.png'), fullPage: true });
            await page.evaluate(() => {
                const line = _spWorkspaceLineRecord({ lineId: 'LIVE-LINE', planId: 'P', sku: 'LIVE', marketplace: 'Amazon',
                    approvedQty: 50, cartonQty: 5, unitsPerCarton: 10,
                    liveSiteMetrics: { company: fixturePlan.company, country: fixturePlan.country, marketplace: 'Amazon', sku: 'LIVE',
                        state: 'READY', currentStock: 96, avgSalesPerDay: 1.2, daysOfSupply: 80 },
                    raw: { snapshot_current_stock: '', snapshot_avg_sales_per_day: '', snapshot_days_of_supply: '',
                        snapshot_avg_sales_warning: 'SITE_SOURCE_SCOPE_UNDECIDED: old environment gate' } }, 'P');
                _spLastModel.lines = [line];
                _spRenderDbSection('shippingPlanCards', [fixturePlan], 'draft', { P: [line] }, '', null);
                toggleSpDbCard('P');
            });
            await page.locator('#sp-card-P .sp-svc-service').waitFor();
            const metricCells = page.locator('#sp-card-P .sp-sku-table tbody tr').first().locator('td');
            assert.deepEqual((await metricCells.allTextContents()).slice(0, 4), ['LIVE', '96', '1.2', '80.0']);
            check(width + ' full-card screenshot renders READY stock / average / Days of Supply', true);
            check(width + ' all three rendered metric cells visible inside full-card screenshot', await metricCells.evaluateAll(cells => {
                const section = cells[0].closest('.sp-section').getBoundingClientRect();
                return cells.slice(1, 4).every(cell => {
                    const rect = cell.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0 && rect.left >= section.left && rect.right <= section.right;
                });
            }));
            await page.screenshot({ path: path.join(out, 'metrics-' + width + '.png'), fullPage: true });
            await page.evaluate(() => {
                const quote = (id, total, lm = 'truck') => ({ rate_card_id: id, carrier_id: 'C1', carrier_name: 'Carrier One', shipping_method: 'truck', last_mile_delivery: lm,
                    shipping_method_label: 'Ground Freight', quote: { priced: true, total, currency: 'USD' } });
                SP_RC_.P = { success: true, lane: { customs_applicable: true, customs: [] },
                    current: { carrier_id: 'C1', shipping_method: 'truck', last_mile_delivery: 'truck', state: 'PRICED' }, options: [quote('R1', 1), quote('R2', 50)] };
                const host = document.getElementById('sp-rc-P'); host.removeAttribute('data-sel-carrier'); host.removeAttribute('data-sel-card');
                _spRcRenderBase13_('P');
            });
            check(width + ' multiple tiers never select cheapest or first', await page.locator('.sp-rc-method').inputValue() === '' && await page.locator('.sp-rc-save').isDisabled());
            await page.locator('.sp-rc-method').selectOption('1');
            check(width + ' explicit quote choice remains selectable', await page.locator('.sp-rc-method').inputValue() === '1');
            await page.locator('.sp-rc-method').selectOption('');
            check(width + ' clearing quote does not coerce option zero or remember it', await page.locator('.sp-rc-method').inputValue() === '' && await page.locator('.sp-rc-save').isDisabled() && await page.evaluate(() => SP_RC_SEL_.P.rate_card_id === ''));
            await page.evaluate(() => { SP_RC_.P.options = [SP_RC_.P.options[0], { ...SP_RC_.P.options[1], last_mile_delivery: 'parcel' }]; document.getElementById('sp-rc-P').removeAttribute('data-sel-card'); _spRcRenderBase13_('P'); });
            check(width + ' saved exact pair restored, not different last mile', await page.locator('.sp-rc-method').inputValue() === '0');
            await page.evaluate(() => { SP_RC_.P.current.last_mile_delivery = 'unknown'; document.getElementById('sp-rc-P').removeAttribute('data-sel-card'); _spRcRenderBase13_('P'); });
            check(width + ' no method-only fallback for mismatched last mile', await page.locator('.sp-rc-method').inputValue() === '');
            await page.evaluate(() => { SP_RC_.P.current.carrier_id = ''; document.getElementById('sp-rc-P').removeAttribute('data-sel-carrier'); _spRcRenderBase13_('P'); });
            check(width + ' persisted carrier required, frontend does not choose one', await page.locator('.sp-rc-carrier').inputValue() === '');
            await page.evaluate(() => {
                SP_RC_.P = { ...domestic, lane: { customs_applicable: true, customs: [{ id: 'formal_customs', label: 'Formal customs' }] } };
                _spRcRenderBase13_('P');
            });
            await page.locator('.sp-svc-service').selectOption('["truck","truck"]');
            await page.locator('.sp-svc-save').click();
            check(width + ' customs guard retained for international manual service', await page.evaluate(() => writes.length === 1 && document.querySelector('.sp-svc-note').textContent.includes('Choose a customs')));
            // Set the control without its preview-refresh handler; exercise the real service Save guard/writer.
            await page.evaluate(() => { document.querySelector('.sp-rc-customs').value = 'formal_customs'; return spSvcSave('P'); });
            check(width + ' chosen customs travels with canonical service update', await page.evaluate(() => writes.length === 2 && writes[1][4] === 'formal_customs' && writes[1][1].shipping_method === 'truck' && writes[1][1].last_mile_delivery === 'truck'));
            check(width + ' no browser exceptions or network calls', errors.length === 0 && requests.length === 0);
            await page.close();
        }
        console.log('SHIPPING_PLAN_REVIEW_BROWSER_PASS ' + checks + ' live_business_writes=0');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
