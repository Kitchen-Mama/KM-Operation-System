// Kitchen Mama Operation System — F1-SKU-DETAILS-DRAFT-R1 Add SKU unsaved-draft cache (frontend-only).
// Run: node assets/tests/sku-add-draft-cache-f1-sku-details-draft-r1.test.js
// -----------------------------------------------------------------------------
// A localStorage draft keeps the in-progress Add SKU form across accidental close / Cancel / navigation /
// refresh / reopen. It NEVER writes a DB record — creation stays saveSkuMasterForm's job. Cleared ONLY on a
// confirmed Create success or an explicit Clear Draft; Cancel/close/refresh/reopen preserve it. Corrupt/version-
// mismatched cache is ignored (clean form, never a thrown modal). Behavioral tests run the REAL draft helpers with
// an injected fake localStorage; source-contract assertions pin the wiring (clear-on-success, preserve-on-fail).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var SRC = read('js/pages/sku-details.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Extract the draft-helper block (SKU_ADD_DRAFT_KEY_ … just before handleClearSkuAddDraft) and bind its free vars.
// The draft-helper block now includes _skuAddDraftSanitizeUnitsFields_ (F1-SKU-DETAILS-UNIT-R1), which references
// SKU_DIM_GROUPS_ — inject a matching fixture so asRec runs end-to-end.
var DIM_GROUPS = [
  { l: 'item_length', w: 'item_width', h: 'item_height', unit: 'item_dimension_unit', wt: 'item_weight', wtUnit: 'item_weight_unit' },
  { l: 'package_length', w: 'package_width', h: 'package_height', unit: 'package_dimension_unit', wt: 'package_weight', wtUnit: 'package_weight_unit' },
  { l: 'carton_length', w: 'carton_width', h: 'carton_height', unit: 'carton_dimension_unit', wt: 'carton_weight', wtUnit: 'carton_weight_unit' }
];
function makeDraftApi(localStorage, formMode) {
  var start = SRC.indexOf('var SKU_ADD_DRAFT_KEY_');
  var end = SRC.indexOf('function handleClearSkuAddDraft');
  var block = SRC.slice(start, end);
  var expose = '\nreturn { load:_skuAddDraftLoad_, clear:_skuAddDraftClear_, asRec:_skuAddDraftAsRec_, ' +
    'collect:_skuAddDraftCollectFields_, any:_skuAddDraftAnyValue_, save:_skuAddDraftSave_, activeTab:_skuAddDraftActiveTab_ };';
  return new Function('localStorage', '_skuFormMode', 'setTimeout', 'clearTimeout', 'SKU_DIM_GROUPS_', block + expose)(localStorage, formMode, function () {}, function () {}, DIM_GROUPS);
}
function fakeLS() { var m = {}; return { getItem: function (k) { return k in m ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; }, _m: m }; }
function fakeOverlay(fields, activeTab) {
  var els = Object.keys(fields).map(function (k) { return { id: 'sku-f-' + k, value: fields[k] }; });
  return {
    querySelectorAll: function (sel) { return (String(sel).indexOf('sku-f-') >= 0) ? els : []; },
    querySelector: function (sel) { return (String(sel).indexOf('aria-selected') >= 0) ? { getAttribute: function (a) { return a === 'data-tab' ? (activeTab || 'basic') : null; } } : null; }
  };
}
var KEY = 'KM_SKU_DETAILS_ADD_DRAFT_V1';

section('save (debounced target) — ADD mode persists non-empty fields; skips empty; edit mode never saves');
(function () {
  var ls = fakeLS(), api = makeDraftApi(ls, 'add');
  api.save(fakeOverlay({ sku: 'CO9999', product_name: 'Widget', series: '', material: 'ABS + Steel' }, 'basic'));
  var d = JSON.parse(ls._m[KEY]);
  ok(d.version === 1 && d.fields.sku === 'CO9999' && d.fields.product_name === 'Widget' && d.fields.material === 'ABS + Steel' && d.activeTab === 'basic', 'A/B/C ADD save snapshots all #sku-f-* field values + active tab');
  ok(typeof d.savedAt === 'string' && d.savedAt.length > 0, 'draft carries savedAt');
})();
(function () {
  var ls = fakeLS(), api = makeDraftApi(ls, 'add');
  api.save(fakeOverlay({ sku: '', product_name: '', series: '' }, 'basic'));
  ok(ls._m[KEY] === undefined, 'an ALL-EMPTY form is NOT persisted (never clobbers a real draft with a blank paint)');
})();
(function () {
  var ls = fakeLS(), api = makeDraftApi(ls, 'edit');
  api.save(fakeOverlay({ sku: 'CO1', product_name: 'X' }, 'basic'));
  ok(ls._m[KEY] === undefined, 'EDIT mode never writes the Add draft (add-only)');
})();

section('load / restore — valid draft round-trips; asRec seeds the existing control builders');
(function () {
  var ls = fakeLS(); ls.setItem(KEY, JSON.stringify({ version: 1, savedAt: 't', fields: { sku: 'CO9999', lifecycle: 'Upcoming SKU', material: 'ABS + Steel', gs1_type: 'UPC' }, activeTab: 'sales' }));
  var api = makeDraftApi(ls, 'add');
  var d = api.load();
  ok(d && d.fields.sku === 'CO9999' && d.activeTab === 'sales', 'valid draft loads with fields + activeTab');
  // asRec also runs the F1-SKU-DETAILS-UNIT-R1 metric sanitizer, which normalizes the six unit tokens to cm/kg
  // (the draft here carries no dimension values, so only the canonical unit tokens are added).
  eq(api.asRec(d), { sku: 'CO9999', lifecycle: 'Upcoming SKU', raw: { sku: 'CO9999', lifecycle: 'Upcoming SKU', material: 'ABS + Steel', gs1_type: 'UPC', item_dimension_unit: 'cm', item_weight_unit: 'kg', package_dimension_unit: 'cm', package_weight_unit: 'kg', carton_dimension_unit: 'cm', carton_weight_unit: 'kg' } }, 'asRec shapes {sku, lifecycle, raw} (+ canonical cm/kg units) so _skuLoadValue(rec.raw[key]) prefills every control');
})();

section('I — corrupt / version-mismatch cache is ignored + cleared (modal always opens clean)');
(function () {
  var ls = fakeLS(); ls.setItem(KEY, '{not valid json');
  var api = makeDraftApi(ls, 'add');
  ok(api.load() === null && ls._m[KEY] === undefined, 'corrupt JSON → null + cache cleared (never throws)');
})();
(function () {
  var ls = fakeLS(); ls.setItem(KEY, JSON.stringify({ version: 99, fields: { sku: 'X' } }));
  var api = makeDraftApi(ls, 'add');
  ok(api.load() === null && ls._m[KEY] === undefined, 'unsupported version → null + cleared');
})();

section('clear + collect/any helpers');
(function () {
  var ls = fakeLS(); ls.setItem(KEY, '{}'); var api = makeDraftApi(ls, 'add');
  api.clear(); ok(ls._m[KEY] === undefined, 'clear removes the cache key');
  eq(api.collect(fakeOverlay({ sku: 'A', product_name: 'B' }, 'basic')), { sku: 'A', product_name: 'B' }, 'collect reads every #sku-f-<key> generically (obsolete keys ignored elsewhere)');
  ok(api.any({ a: '', b: '  ' }) === false && api.any({ a: '', b: 'x' }) === true, 'anyValue: all-blank → false, any non-blank → true');
})();

section('source contract — clear ONLY on confirmed Create success; preserve on cancel/close/fail');
ok(/if \(payload\.mode === 'add'\) _skuAddDraftClear_\(\);\s*\/\/ confirmed Create success/.test(SRC), 'E Create SUCCESS (.then) clears the draft — add mode only');
var thenIdx = SRC.indexOf('.then(function (data)'), catchIdx = SRC.indexOf('}).catch(function (err)', thenIdx);
var catchBody = SRC.slice(catchIdx, catchIdx + 600);
ok(catchIdx > thenIdx && !/_skuAddDraftClear_/.test(catchBody), 'D Create FAILURE (.catch) does NOT clear the draft (values preserved for retry)');
var closeIdx = SRC.indexOf('function closeSkuEdit'); var closeBody = SRC.slice(closeIdx, closeIdx + 160);
ok(!/_skuAddDraftClear_/.test(closeBody), 'G Cancel/close (closeSkuEdit) does NOT clear the draft (non-destructive)');

section('source contract — restore wiring + explicit Clear Draft + no DB/API from drafting');
ok(/_addDraft = _skuAddDraftLoad_\(\);/.test(SRC) && /rec = _skuAddDraftAsRec_\(_addDraft\)/.test(SRC), 'ADD open restores the draft into the form via the existing builders');
ok(/skuSwitchTab\(_addDraft\.activeTab\)/.test(SRC), 'restores the draft active tab when practical');
ok(/function handleClearSkuAddDraft/.test(SRC) && /id="sku-cleardraft-btn"/.test(SRC) && /onclick="handleClearSkuAddDraft\(\)"/.test(SRC), 'H explicit Clear Draft action present in the Add modal');
ok(/overlay\.addEventListener\('input'[\s\S]{0,80}_skuAddDraftSaveDebounced_/.test(SRC) && /overlay\.addEventListener\('change'[\s\S]{0,80}_skuAddDraftSaveDebounced_/.test(SRC), '§3 delegated input/change → debounced save');
ok(/setTimeout\(function \(\) \{ _skuAddDraftSave_\(overlay\); \}, 400\)/.test(SRC), '§3 debounced ~400ms (not synchronous per keystroke)');
var draftBlock = SRC.slice(SRC.indexOf('var SKU_ADD_DRAFT_KEY_'), SRC.indexOf('function handleClearSkuAddDraft'));
ok(!/KM\.DB|fetch\(|upsertSkuDetail|\.recalculate|workspace\.get/.test(draftBlock), 'J draft save/load/clear make NO API/DB call (localStorage only)');
ok(/var SKU_ADD_DRAFT_KEY_ = 'KM_SKU_DETAILS_ADD_DRAFT_V1'/.test(SRC) && /SKU_ADD_DRAFT_VERSION_ = 1/.test(SRC), '§7 cache key + version:1');

console.log('\n----------------------------------------');
console.log('SKU ADD DRAFT CACHE (F1-SKU-DETAILS-DRAFT-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
