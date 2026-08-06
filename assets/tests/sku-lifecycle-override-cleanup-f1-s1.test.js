// Kitchen Mama Operation System — SKU Lifecycle Override Cleanup (F1-S1).
// Run: node assets/tests/sku-lifecycle-override-cleanup-f1-s1.test.js
// -----------------------------------------------------------------------------
// Proves lifecycle authority is sku_details.lifecycle ONLY: the browser lifecycle override
// (km_sku_lifecycle_overrides_v1) is purged on load and is NEVER consulted for grouping or the status
// badge, even when a stale value is present — while the UNRELATED image + imported-SKU data overrides are
// preserved. sku-overrides.js is executed inside a stubbed window/localStorage (it assigns its API onto
// window); the adapter + page are source-scanned for the removed persistence.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var OVR = read('js/utils/sku-overrides.js');
var ADAPTER = read('js/api/operation-system-db-api.js');
var PAGE = read('js/pages/sku-details.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- run sku-overrides.js with stubbed globals (bare window/localStorage/document = the params) ----
var LC_KEY = 'km_sku_lifecycle_overrides_v1';
var IMG_KEY = 'km_sku_image_overrides_v1';
var DATA_KEY = 'km_sku_data_overrides_v1';
var store = {};
store[LC_KEY] = JSON.stringify({ 'CO5600-RB': { lifecycle: 'Upcoming SKU' } });   // seeded STALE override
var localStorageStub = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
var windowStub = {};
var documentStub = { getElementById: function () { return null; }, createElement: function () { return {}; } };
new Function('window', 'localStorage', 'document', OVR)(windowStub, localStorageStub, documentStub);

section('A. one-time purge of the stale lifecycle override');
ok(!Object.prototype.hasOwnProperty.call(store, LC_KEY), 'A1 km_sku_lifecycle_overrides_v1 is purged from localStorage on load');
ok(typeof windowStub.getNormalizedSkuStatus === 'function' && typeof windowStub.getAllSkuDataWithOverrides === 'function', 'A2 override module still exposes the render helpers');
ok(windowStub.getSkuLifecycleOverride === undefined && windowStub.setSkuLifecycleOverride === undefined, 'A3 lifecycle override getters/setters are no longer exposed on window');

section('B. lifecycle comes ONLY from sku_details.lifecycle — stale override ignored even if present');
store[LC_KEY] = JSON.stringify({ 'CO5600-RB': { lifecycle: 'Upcoming SKU' } });   // re-seed to prove it is IGNORED
ok(windowStub.getNormalizedSkuStatus({ sku: 'CO5600-RB', lifecycle: 'Running in the Market' }) === 'Running in the Market', 'B1 status = sheet lifecycle (Running), NOT the stale override (Upcoming)');
ok(windowStub.getNormalizedSkuStatus({ sku: 'X', lifecycle: 'Phasing Out' }) === 'Phasing Out', 'B2 Phasing Out maps through');
ok(windowStub.getNormalizedSkuStatus({ sku: 'Y', lifecycle: 'Upcoming SKU' }) === 'Upcoming SKU', 'B3 a genuine Upcoming sheet value still maps to Upcoming');

section('C. grouping + status badge share the sku_details source');
windowStub.KM = { DB: { getSkuDetails: function () { return [
  { sku: 'CO5600-RB', lifecycle: 'Running in the Market' },
  { sku: 'NEW-1', lifecycle: 'Upcoming SKU' },
  { sku: 'OLD-1', lifecycle: 'Phasing Out' }
]; } } };
var groups = windowStub.getAllSkuDataWithOverrides();
function inGroup(g, sku) { return (groups[g] || []).some(function (r) { return r.sku === sku; }); }
ok(inGroup('Running in the Market', 'CO5600-RB') && !inGroup('Upcoming SKU', 'CO5600-RB'), 'C1 CO5600-RB grouped under Running (sheet), never Upcoming (stale override ignored)');
ok(inGroup('Upcoming SKU', 'NEW-1') && inGroup('Phasing Out', 'OLD-1'), 'C2 other SKUs group by their sheet lifecycle');
var co = (groups['Running in the Market'] || []).filter(function (r) { return r.sku === 'CO5600-RB'; })[0];
ok(co && co.lifecycle === 'Running in the Market', 'C3 the merged row lifecycle is the sheet value (never rewritten by an override)');

section('D. unrelated override capability preserved (image + imported-SKU data)');
store[IMG_KEY] = JSON.stringify({ 'CO5600-RB': { image: 'http://example/x.png' } });
ok(windowStub.getNormalizedSkuImage({ sku: 'CO5600-RB' }) === 'http://example/x.png', 'D1 image override still applied (image capability untouched)');
store[DATA_KEY] = JSON.stringify({ 'IMP-1': { productName: 'Imported' } });
ok(windowStub.getSkuDataOverrides()['IMP-1'] && windowStub.getSkuDataOverrides()['IMP-1'].productName === 'Imported', 'D2 imported-SKU data override still readable (km_sku_data_overrides_v1 kept)');

section('E. source scans — override authority removed, image/data kept');
ok(!/function getSkuLifecycleOverride\b/.test(OVR) && !/function setSkuLifecycleOverride\b/.test(OVR) && !/function getSkuLifecycleOverrides\b/.test(OVR), 'E1 lifecycle override get/set functions deleted');
ok(/function getNormalizedSkuStatus/.test(OVR) && !/getSkuLifecycleOverride\(/.test(OVR), 'E2 getNormalizedSkuStatus no longer calls a lifecycle override');
ok(/function getSkuImageOverride/.test(OVR) && /function setSkuImageOverride/.test(OVR) && /function getSkuDataOverrides/.test(OVR), 'E3 image + data override functions preserved');
ok(/_skuPurgeLegacyLifecycleOverride/.test(OVR) && /localStorage\.removeItem\(SKU_LIFECYCLE_KEY\)/.test(OVR), 'E4 one-time purge of the legacy lifecycle key present');
var updFn = ADAPTER.slice(ADAPTER.indexOf('window.KM.DB.updateSkuLifecycle = async function'), ADAPTER.indexOf('async function updateSkuLifecycleInSheet'));
ok(updFn.length > 0 && !/setSkuLifecycleOverride/.test(updFn) && !/localStorage\.setItem/.test(updFn), 'E5 updateSkuLifecycle no longer writes any browser lifecycle persistence');
ok(/updateSkuLifecycleInSheet/.test(updFn) && /_opDbCache\.skuDetails/.test(updFn), 'E6 cloud path writes the sheet; mock path patches only the in-memory cache (no persistence)');
var hscFn = PAGE.slice(PAGE.indexOf('function handleSkuStatusChange'), PAGE.indexOf('function showSkuStatusToast'));
ok(hscFn.length > 0 && !/setSkuLifecycleOverride/.test(hscFn), 'E7 SKU Details status-change no longer falls back to a localStorage lifecycle write');
ok(/updateSkuLifecycle/.test(hscFn), 'E8 SKU Details status-change routes through the DB authority (updateSkuLifecycle)');

console.log('\n----------------------------------------');
console.log('SKU LIFECYCLE OVERRIDE CLEANUP (F1-S1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
