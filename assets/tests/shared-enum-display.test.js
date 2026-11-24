// Run: node assets/tests/shared-enum-display.test.js
// Runs shipped presentation code offline; no API transport or production data is loaded.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8');
const api = read('api/operation-system-db-api.js');
const history = read('pages/shipping-history.js');
const map = read('pages/global-logistics-map.js');
const rates = read('pages/carrier-rate-card.js');
let passed = 0;
function eq(actual, expected) { assert.deepEqual(actual, expected); passed++; }
function ok(value) { assert.ok(value); passed++; }
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function fn(source, name) {
    const start = source.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, 'missing function ' + name);
    for (let end = source.indexOf('}', start); end !== -1; end = source.indexOf('}', end + 1)) {
        const candidate = source.slice(start, end + 1);
        try { new vm.Script('(' + candidate + ')'); return candidate; } catch (_) {}
    }
    throw new Error('Could not parse function ' + name);
}
const ctx = vm.createContext({ window: { KM: {} } });
vm.runInContext(api.slice(api.indexOf('var CUSTOMS_TYPE_LABELS_ ='), api.indexOf('// Shipment (Execution Layer) header.')), ctx);
const display = ctx.window.KM.display;

for (const [token, label] of [['truck', 'Truck'], ['parcel', 'Parcel'], ['air', 'Air'], ['sea', 'Sea'],
    ['sea_express', 'Sea Express'], ['SeaExpress', 'Sea Express'], ['SEA EXPRESS', 'Sea Express']]) {
    eq(display.shippingMethod(token), label);
    eq(display.enumLabel(token), label);
    eq(display.shippingMethod(label), label);
}
eq(display.lastMileDelivery('parcel'), 'Parcel');
eq(display.lastMileDelivery('TRUCK'), 'Truck');
eq(display.enumLabel('parcel', 'lastMileDelivery'), 'Parcel');
eq(display.status('in_transit'), 'In Transit');
eq(display.status('partially_received'), 'Partially Received');
eq(display.status('COMPLETED'), 'Completed');
eq(display.enumLabel('SPD'), 'SPD');
eq(display.lastMileDelivery('ltl'), 'LTL');
eq(display.shippingMethod('lcl'), 'LCL');
for (const token of ['UPS', 'DHL', 'Amazon', 'BestWay', 'iPhone Express', 'CR_truck_01', 'custom_Method', '<b>truck</b>']) {
    eq(display.enumLabel(token), token);
    eq(display.shippingMethod(token), token);
    eq(display.lastMileDelivery(token), token);
}
for (const blank of [null, undefined, '']) eq(display.enumLabel(blank), '');
eq(display.enumLabel('__proto__'), '__proto__');
eq(display.enumLabel('constructor'), 'constructor');
eq(display.enumLabel('truck', 'not-a-scope'), 'truck');
eq(display.customsType('formal_customs'), '\u6b63\u5f0f\u5831\u95dc');

const service = Object.freeze({ shipping_method: 'truck', last_mile_delivery: 'parcel', carrier_id: 'CR_truck_01' });
eq(display.shippingService(service), 'Truck \u00b7 Parcel');
eq(display.shippingService({ shippingMethod: 'sea_express', lastMileDelivery: 'truck' }), 'Sea Express \u00b7 Truck');
eq(display.shippingService({ ...service, shipping_method_label: 'BestWay LTL' }), 'BestWay LTL');
eq(display.shippingService({ ...service, shippingMethodLabel: ' UPS SPD ' }), ' UPS SPD ');
eq(display.shippingService({ ...service, shipping_method_label: '   ' }), 'Truck \u00b7 Parcel');
eq(display.shippingService({ shipping_method: 'truck' }), 'Truck');
eq(display.shippingService(null), '');
eq(service.shipping_method, 'truck');
eq(service.last_mile_delivery, 'parcel');

vm.runInContext(fn(api, 'normalizeShippingPlanRecord'), ctx);
const raw = Object.freeze({ shipping_plan_id: 'SP_truck_1', shipping_method: 'sea_express', last_mile_delivery: 'parcel', status: 'in_transit', carrier_id: 'UPS' });
const plan = ctx.normalizeShippingPlanRecord(raw);
eq(plan.shippingMethod, 'sea_express');
eq(plan.lastMileDelivery, 'parcel');
eq(plan.status, 'in_transit');
eq(plan.carrierId, 'UPS');
eq(plan.shippingPlanId, 'SP_truck_1');
eq(plan.shippingMethodDisplay, 'Sea Express');
eq(plan.lastMileDeliveryDisplay, 'Parcel');
eq(plan.raw, raw);

for (const name of ['_shEsc', '_shEnumDisplay_', '_shSvcPairOptions_', '_shSetFilterOptions', 'shSvcSave']) {
    vm.runInContext(fn(history, name), ctx);
}
let options;
ctx.shOverviewFilterState = { method: [] };
ctx.document = { getElementById: () => ({ __kmfCtl: {
    setOptions: value => { options = plain(value); }, getSelected: () => ['sea_express']
} }) };
ctx._shSetFilterOptions('method', 'mount', ['sea_express', 'truck', 'DHL']);
eq(options, [{ value: 'sea_express', label: 'Sea Express' }, { value: 'truck', label: 'Truck' }, { value: 'DHL', label: 'DHL' }]);
eq(plain(ctx.shOverviewFilterState.method), ['sea_express']);
let html = ctx._shSvcPairOptions_(['parcel', 'truck', 'DHL'], ['parcel'], 'parcel', 'lastMileDelivery');
ok(html.includes('value="parcel" selected>Parcel</option>'));
ok(!html.includes('value="Parcel"'));
ok(!html.includes('value="truck"'));
html = ctx._shSvcPairOptions_(['<truck>'], null, '', 'shippingMethod');
ok(html.includes('value="&lt;truck&gt;"'));
ok(!html.includes('<truck>'));

let payload;
const fields = { '.sh-svc-note': { style: {} }, '.sh-svc-carrier': { value: 'UPS' },
    '.sh-svc-method': { value: 'truck' }, '.sh-svc-lastmile': { value: 'parcel' } };
Object.assign(ctx, { _shSvcBox_: () => ({ querySelector: s => fields[s] || null }), _shInFlight_: {},
    _shExecDirty: () => [], _shTok_: () => 'version_1', SH_SVC_TBA_: '__TO_BE_ASSIGNED__',
    _shUpd_: (sid, p) => { payload = plain(p); return new Promise(() => {}); } });
ctx.shSvcSave('SHIP_truck_1');
eq(payload, { shipment_id: 'SHIP_truck_1', actor: 'operation-system', shipping_method: 'truck',
    last_mile_delivery: 'parcel', expected_updated_at: 'version_1', carrier_id: 'UPS' });

for (const name of ['_crcEnumDisplay_', '_crcMethodLabel', '_crcMethodOpts', '_crcLtLane', 'up']) vm.runInContext(fn(rates, name), ctx);
eq(plain(ctx._crcMethodOpts(['sea_express', 'UPS'])), [{ value: 'sea_express', label: 'Sea Express' }, { value: 'UPS', label: 'UPS' }]);
eq(ctx._crcLtLane({ shippingMethod: 'truck', lastMileDelivery: 'parcel', originCountry: 'US', destinationCountry: 'CA' }), 'Truck \u00b7 US \u00b7 CA \u00b7 Parcel');
eq(ctx._crcLtLane({}), '(no method) \u00b7 (any origin) \u00b7 (any destination) \u00b7 (any last mile)');
for (const name of ['enumDisplay', 'optPairs', 'selHtml', 'esc']) vm.runInContext(fn(map, name), ctx);
const pairs = ctx.optPairs([{ method: 'truck' }, { method: 'sea_express' }], v => v.method, v => ctx.enumDisplay('shippingMethod', v.method));
html = ctx.selHtml('Method', 'method', pairs, 'truck');
ok(html.includes('value="truck" selected>Truck</option>'));
ok(html.includes('value="sea_express">Sea Express</option>'));
ok(map.includes("if (f.method && v.method !== f.method) return false;"));
ok(map.includes("method: s.shippingMethod || s.shippingMethodDisplay || ''"));
ok(rates.includes("dash(_crcEnumDisplay_('lastMileDelivery', c.lastMileDelivery))"));
ok(rates.includes("esc(_crcEnumDisplay_('lastMileDelivery', lt.lastMileDelivery) || '(any)')"));
ok(history.includes("_shEsc(_shEnumDisplay_('shippingMethod', s.shippingMethod) || '--')"));
ok(!rates.includes('CRC_METHOD_LABELS'));
ctx.window.KM.display = undefined;
eq(ctx._shEnumDisplay_('shippingMethod', 'truck'), 'truck');
eq(ctx._crcMethodLabel('UPS'), 'UPS');
eq(ctx.enumDisplay('status', 'in_transit'), 'in_transit');
console.log('PASS shared enum display: ' + passed + ' assertions (offline, no writes)');
