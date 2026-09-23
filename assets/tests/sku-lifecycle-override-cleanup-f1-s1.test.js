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
/* P1-B8C-R3 — sku-overrides.js now asks km-image-reference-policy.js for every image verdict, so the
   policy is part of the environment this module is executed in, exactly as index.html loads it first.
   The fixture's host is DECLARED through the operator allowlist: §D is about the localStorage override
   capability surviving, not about which hosts are approved, and the policy ships with none. */
var IMG_POLICY = require(path.join(__dirname, '..', 'js/utils/km-image-reference-policy.js'));
IMG_POLICY.APPROVED_EXTERNAL_HOSTS = ['example'];
var windowStub = { KM_IMAGE_REFERENCE_POLICY: IMG_POLICY };
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

// S2-R4A — THE OTHER TWO OVERRIDES ARE NOW RETIRED TOO, so D asks the opposite question and asks it
// harder. The property F1-S1 actually established here is that the LIFECYCLE key cannot reach a
// rendered value; S2-R4A extends the same property to the image key and the imported-SKU key.
// "Ignored" is not "deleted", and both halves are asserted, because the ruling in sku-overrides.js
// says the keys stay readable so an operator can still see and clear their own residue.
section('D. image + imported-SKU override authority RETIRED (S2-R4A) — ignored, not deleted');
store[IMG_KEY] = JSON.stringify({ 'CO5600-RB': { image: 'http://example/x.png' } });
ok(windowStub.getNormalizedSkuImage({ sku: 'CO5600-RB' }) !== 'http://example/x.png',
  'D1 a stale image override no longer reaches the rendered image');
ok(windowStub.getNormalizedSkuImage({ sku: 'CO5600-RB', image: 'https://example/canonical.png' })
     === 'https://example/canonical.png',
  'D1a and the canonical row value is what is rendered instead');
ok(windowStub.getNormalizedSkuImage({ sku: 'CO5600-RB' }) === '',
  'D1b with no canonical value the answer is empty — the override is not a fallback either');
store[DATA_KEY] = JSON.stringify({ 'IMP-1': { productName: 'Imported' } });
ok(windowStub.getSkuDataOverrides()['IMP-1'] && windowStub.getSkuDataOverrides()['IMP-1'].productName === 'Imported',
  'D2 the imported-SKU key is still READABLE — retirement ignores it, it does not destroy it');
var _s2r4aGroups = windowStub.getAllSkuDataWithOverrides();
ok(!Object.keys(_s2r4aGroups).some(function (g) {
    return (_s2r4aGroups[g] || []).some(function (r) { return r.sku === 'IMP-1'; }); }),
  'D2a but it is no longer INJECTED — a row the server did not return is not a SKU');

section('E. source scans — lifecycle authority removed (F1-S1); image/data authority removed (S2-R4A)');
ok(!/function getSkuLifecycleOverride\b/.test(OVR) && !/function setSkuLifecycleOverride\b/.test(OVR) && !/function getSkuLifecycleOverrides\b/.test(OVR), 'E1 lifecycle override get/set functions deleted');
ok(/function getNormalizedSkuStatus/.test(OVR) && !/getSkuLifecycleOverride\(/.test(OVR), 'E2 getNormalizedSkuStatus no longer calls a lifecycle override');
// S2-R4A — the READERS survive (debugLegacySkuOverrides and resetSkuHandbookOverrides need them, and
// so does an operator who wants to see what is in their own browser); the WRITERS are deleted, because
// a writer for a store nothing may read is only an invitation to refill it. Both halves are asserted,
// so neither "kept everything" nor "deleted everything" can pass.
ok(/function getSkuImageOverrides/.test(OVR) && /function getSkuDataOverrides/.test(OVR),
  'E3 the residue READERS are preserved');
ok(!/function setSkuImageOverride\b/.test(OVR) && !/function saveSkuDataOverrides\b/.test(OVR),
  'E3a and both WRITERS are deleted — no browser path can create a new override');
ok(!/window\.setSkuImageOverride/.test(OVR),
  'E3b including the global, so a console call cannot reach it either');
// The singular reader SURVIVES as a console affordance — window.getSkuImageOverride('SKU') is how an
// operator asks what their own browser still holds — so the rule is not that it cannot exist. The rule
// is that nothing CALLS it: after S2-R4A its only occurrence in the file is its own declaration.
var _s2r4aHits = ((OVR.replace(/^\s*\/\/.*$/gm, '')).match(/getSkuImageOverride\(/g) || []).length;
ok(_s2r4aHits === 1 && /function getSkuImageOverride\(sku\)/.test(OVR),
  'E3c the image-override reader has exactly one occurrence left — its own declaration, called by nothing',
  _s2r4aHits);
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
