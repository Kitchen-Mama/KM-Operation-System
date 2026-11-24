// Offline browser regression over shipped helpers and Shipment Workspace service editor.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { extract } = require('./ad4/extract.cjs');
const runtime = process.env.KM_NODE_MODULES || 'C:/Program Files/WindowsApps/OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt/dependencies/node/node_modules';
const { chromium } = require(require.resolve('playwright', { paths: [runtime] }));
const root = path.join(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const api = read('assets/js/api/operation-system-db-api.js');
const helper = api.slice(api.indexOf('var CUSTOMS_TYPE_LABELS_ ='), api.indexOf('// Shipment (Execution Layer) header.'));
const names = ['_shEsc', '_shEnumDisplay_', '_shSvcHtml_', '_shSvcDeliveryTypes_', '_shSvcCarrierServices_',
    '_shSvcPairOptions_', '_shSvcServiceLabel_', '_shSvcDeclaredPairs_', '_shSvcFieldsHtml_',
    'shSvcPickService', 'shSvcCarrierChanged', '_shSvcBox_', 'shSvcSave'];
const editor = extract(read('assets/js/pages/shipping-history.js'), name => names.includes(name), name => name === 'SH_SVC_TBA_').map(p => p.text).join('\n');
const vocab = {
    version: 'offline-fixture', shipping_method: [{ value: 'truck' }, { value: 'sea' }],
    last_mile_delivery: [{ value: 'parcel' }, { value: 'truck' }],
    carriers: [
        { carrier_id: 'A', carrier_name: 'BestWay', services_known: true, services: [
            { shipping_method: 'truck', last_mile_delivery: 'parcel' },
            { shipping_method: 'sea', last_mile_delivery: 'truck' },
            { shipping_method: 'truck', last_mile_delivery: 'parcel' }] },
        { carrier_id: 'B', carrier_name: 'UPS', services_known: true, services: [{ shipping_method: 'truck', last_mile_delivery: 'truck' }] },
        { carrier_id: 'UNKNOWN', carrier_name: 'DHL', services_known: false, services: [] },
        { carrier_id: 'EMPTY', carrier_name: 'No declared services', services_known: true, services: [] }
    ]
};
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; }
(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const out = path.join(root, 'output', 'shared-enum-display');
    fs.mkdirSync(out, { recursive: true });
    try {
        for (const width of [1440, 390]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', route => route.abort());
            await page.setContent('<main style="max-width:480px;margin:24px auto;font:14px Arial"><h2>Shipment Workspace</h2><div id="editor"></div></main>');
            await page.addScriptTag({ content: 'window.KM = {};' + helper + '\n' + editor });
            await page.evaluate(v => {
                window.SH_RC_ = { S: { service_vocabulary: v, service: { carrier_id: 'A', shipping_method: 'truck', last_mile_delivery: 'parcel' }, current: { state: 'COST_PENDING_AUTO' }, customs_applicable: false } };
                window._shGetShipments = () => [];
                window._shInFlight_ = {};
                window._shExecDirty = () => [];
                window._shTok_ = () => 'fixture-version';
                window.requests = [];
                window._shUpd_ = (id, payload) => { requests.push(payload); return new Promise(() => {}); };
                document.getElementById('editor').innerHTML = _shSvcHtml_('S', SH_RC_.S);
            }, vocab);
            const picker = page.locator('.sh-svc-service');
            check(await picker.count() === 1, 'one paired service picker');
            check(await page.locator('select.sh-svc-method,select.sh-svc-lastmile,.sh-svc-dtype').count() === 0, 'no split controls for declared services');
            check(await picker.locator('option').allTextContents().then(a => JSON.stringify(a) === JSON.stringify(['-- Choose service --', 'Truck \u00b7 Parcel', 'Sea \u00b7 Truck'])), 'exact tuples deduplicated, no cross product');
            check(await page.locator('.sh-svc-method').inputValue() === 'truck', 'saved method kept as token');
            check(await page.locator('.sh-svc-lastmile').inputValue() === 'parcel', 'saved last mile kept as token');
            await picker.selectOption({ label: 'Sea \u00b7 Truck' });
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 1 && requests[0].shipping_method === 'sea' && requests[0].last_mile_delivery === 'truck' && requests[0].expected_updated_at === 'fixture-version' && !('shipping_method_label' in requests[0])), 'save exact tokens with concurrency guard, no labels');
            await page.locator('.sh-svc-carrier').selectOption('B');
            check(await picker.inputValue() === '', 'one legal tuple is not silently chosen');
            check(await page.locator('.sh-svc-method').inputValue() === '', 'invalid old tuple cleared on carrier change');
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 1), 'blank paired choice refuses save');
            await picker.selectOption({ label: 'Truck \u00b7 Truck' });
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 2 && requests[1].carrier_id === 'B' && requests[1].shipping_method === 'truck' && requests[1].last_mile_delivery === 'truck'), 'pair is selected atomically');
            await page.evaluate(() => { document.querySelector('.sh-svc-lastmile').value = 'parcel'; });
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 2), 'mismatched hidden tokens refuse save');
            await page.locator('.sh-svc-carrier').selectOption('UNKNOWN');
            check(await page.locator('select.sh-svc-method,select.sh-svc-lastmile').count() === 2, 'unknown capabilities retain legal explicit path');
            await page.locator('.sh-svc-method').selectOption('sea');
            await page.locator('.sh-svc-lastmile').selectOption('parcel');
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 3 && requests[2].carrier_id === 'UNKNOWN' && requests[2].shipping_method === 'sea' && requests[2].last_mile_delivery === 'parcel'), 'unknown path not constrained to another carrier declarations');
            await page.locator('.sh-svc-carrier').selectOption('__TO_BE_ASSIGNED__');
            check(await page.locator('.sh-svc-tba-reason').isVisible(), 'TBA reason remains explicit');
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 3), 'TBA without reason cannot save');
            await page.locator('.sh-svc-tba-reason').fill('Assign later');
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 4 && requests[3].carrier_assignment === 'TO_BE_ASSIGNED' && requests[3].carrier_assignment_reason === 'Assign later' && !('carrier_id' in requests[3])), 'TBA payload marker is unchanged, no fabricated carrier ID');
            await page.locator('.sh-svc-carrier').selectOption('EMPTY');
            check(await picker.locator('option').count() === 1 && await page.locator('select.sh-svc-method').count() === 0, 'known empty declaration is not treated as unknown');
            await page.locator('.sh-svc-save').click();
            check(await page.evaluate(() => requests.length === 4), 'empty declaration cannot save');
            await page.locator('.sh-svc-carrier').selectOption('A');
            await picker.selectOption({ label: 'Truck \u00b7 Parcel' });
            await page.screenshot({ path: path.join(out, 'shipment-service-' + width + '.png'), fullPage: true });
            check(await page.evaluate(() => [...document.querySelectorAll('select,button,input:not([type=hidden])')].every(e => e.getBoundingClientRect().right <= innerWidth)), 'controls fit viewport ' + width);
            check(errors.length === 0, 'no browser errors: ' + errors.join('; '));
            await page.close();
        }
        console.log('PASS Shipment service picker: ' + checks + ' browser assertions; desktop/mobile; network blocked; no production writes');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
