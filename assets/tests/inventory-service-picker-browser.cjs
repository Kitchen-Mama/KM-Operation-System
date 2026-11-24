'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, read } = require('./helpers/write-command-flight-world.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1123-915-0_26.1123.915.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const out = path.join(root, 'output/shipping-service-upgrade-20261124');
const scope = { company: 'Fixture', country: 'US', marketplace: 'Amazon' };
const cards = [20, 50, 100].flatMap(tier => [
  { rate_card_id: 'TRUCK-' + tier, carrier_id: 'C1', origin_country: 'CN', destination_country: 'US', shipping_method: 'sea_express', last_mile_delivery: 'truck', shipping_method_label: 'Fast Sea Truck', weight_tier: tier, status: 'active' },
  { rate_card_id: 'PARCEL-' + tier, carrier_id: 'C1', origin_country: 'CN', destination_country: 'US', shipping_method: 'sea_express', last_mile_delivery: 'parcel', shipping_method_label: 'Fast Sea Parcel', weight_tier: tier, status: 'active' }
]);
let checks = 0;
const check = (name, value) => { assert(value, name); checks++; console.log('PASS ' + name); };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => r.abort());
      await page.setContent('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><section id="ops-section"><div class="ir-exec-plan"><div class="ir-exec-plan__grid ir-exec-plan__grid--head"><span>From</span><span>To</span><span>Qty</span><span>Shipping Service</span><span>Expected Arrival</span><span>Action</span></div><div id="shipping-methods-TEST"></div></div></section>');
      for (const f of ['base.css', 'components.css', 'layout.css', 'responsive-foundation.css', 'pages/inventory-replenishment.css']) await page.addStyleTag({ content: read('assets/css/' + f) });
      await page.addStyleTag({ content: 'body{padding:12px;margin:0;background:white}#ops-section{display:block}.ir-exec-plan{max-width:900px;margin:auto;overflow-x:auto}.ir-exec-plan__grid{min-width:540px}' });
      await page.addScriptTag({ content: 'window.KM={lifecycle:{register(){}}};' });
      for (const f of ['assets/js/utils/inventory-compat.js', 'assets/js/core/supply-planning-country-identity.js', 'assets/js/api/operation-system-db-api.js', 'assets/js/core/method-registry.js', 'assets/js/pages/inventory-replenishment.js']) await page.addScriptTag({ content: read(f) });
      await page.evaluate(({ scope, cards }) => {
        window.fixtureScope = scope;
        window.fixtureModel = KM.DB.adaptInventoryReplenishmentWorkspace({ carrier_rate_cards: cards, carrier_lead_times: [] });
        KM.methodRegistry.adopt(scope, fixtureModel);
        _irMethodScope_ = _replenSelectedScope = () => scope;
        _execWarehouseCandidates = () => ({ from: [{ warehouseId: 'FROM', country: 'CN' }], to: [{ warehouseId: 'TO', country: 'US', warehouseCode: 'DEST' }] });
        _execRoutePickers_ = (c, a, from, to) => ({
          from: [{ value: 'FROM', label: 'CN Factory', name: 'CN Factory', code: 'CN1', type: 'FACTORY', country: 'CN', selected: !!from }],
          to: [{ value: 'TO', label: 'US Warehouse', name: 'US Warehouse', code: 'DEST', type: 'FBA', country: 'US', selected: !!to }],
          selectedFromId: from || '', selectedToId: to || '', fromEmpty: false, toEmpty: false
        });
        _execFromAvailFor_ = () => null; _execFromAvailabilityRefresh_ = () => {};
        _irRouteEtaFor = () => ({ available: false, date: '', text: '--', source: 'NO_LEAD_TIME' });
        getReplenishmentData = () => [];
        window.fixtureEdits = [];
        onExecutionRouteEdit = () => {
          const row = document.querySelector('.exec-route-row');
          fixtureEdits.push({ method: row.querySelector('[data-field="shipping_method"]').value, lastMile: row.querySelector('[data-field="last_mile_delivery"]').value });
        };
        _renderExecutionRoute('TEST', { route_provenance: 'USER_EXPLICIT_ADD_ROUTE', source_warehouse_id: 'FROM', destination_warehouse_id: 'TO', qty: 100, shipping_method: 'sea_express', last_mile_delivery: 'truck' });
      }, { scope, cards });
      const picker = page.locator('select[data-field="shipping_service"]');
      check(width + ' one service control, no independent last-mile picker', await picker.count() === 1 && await page.locator('select[data-field="last_mile_delivery"]').count() === 0);
      check(width + ' weight rows collapse to two distinct service labels', JSON.stringify(await picker.locator('option').allTextContents()) === JSON.stringify(['Shipping service...', 'Fast Sea Parcel', 'Fast Sea Truck']));
      check(width + ' stored method/lastmile pair restores the correct label', await picker.locator('option:checked').textContent() === 'Fast Sea Truck');
      await picker.selectOption({ label: 'Fast Sea Parcel' });
      check(width + ' actual change handler delivers separate canonical fields', await page.evaluate(() => fixtureEdits.length === 1 && fixtureEdits[0].method === 'sea_express' && fixtureEdits[0].lastMile === 'parcel'));
      await page.evaluate(() => _execRebuildMethodOptions('TEST'));
      check(width + ' async catalogue repaint retains chosen pair without authoring another edit', await picker.locator('option:checked').textContent() === 'Fast Sea Parcel' && await page.evaluate(() => fixtureEdits.length === 1));
      await page.evaluate(() => { window.realResolver = _execResolveMethods; _execResolveMethods = () => ({ status: 'LOADING', methods: [] }); _execRebuildMethodOptions('TEST'); });
      check(width + ' pending catalogue does not discard canonical saved intent', await picker.isDisabled() && await page.locator('[data-field="shipping_method"]').inputValue() === 'sea_express' && await page.locator('[data-field="last_mile_delivery"]').inputValue() === 'parcel');
      await page.evaluate(() => { _execResolveMethods = realResolver; _execRebuildMethodOptions('TEST'); });
      check(width + ' resolved catalogue restores the complete service', await picker.locator('option:checked').textContent() === 'Fast Sea Parcel');
      check(width + ' renderer has six aligned fixed-format tracks', await page.locator('.exec-route-row').evaluate(row => row.children.length === 6 && getComputedStyle(row).gridTemplateColumns.split(' ').length === 6));
      await page.screenshot({ path: path.join(out, 'inventory-service-' + width + '.png'), fullPage: true });
      check(width + ' no runtime errors', errors.length === 0);
      await page.close();
    }
    console.log('INVENTORY_SERVICE_PICKER_PASS ' + checks);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
