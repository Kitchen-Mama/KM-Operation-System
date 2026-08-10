// Kitchen Mama Operation System — F1-SMALL Inventory Add SKU: clear leaked form fields on confirmed success.
// Run: node assets/tests/inventory-add-sku-clear-on-success-f1-small.test.js
// -----------------------------------------------------------------------------
// The Inventory Replenishment Add SKU modal has NO draft cache; closeReplenModal()/open reset only SKU + Site SKU,
// so ASIN / Product URL / Launch Date / Planning Model / Fulfillment leaked across a successful create (the next
// Add SKU silently inherited the previous SKU's values). resetReplenAddSkuForm() clears exactly those leaked DOM
// fields and is called ONLY after a CONFIRMED backend success — never in closeReplenModal (Cancel) nor the failure
// branches (unsaved / failed values preserved for retry). No cache, no storage clear, no page-filter clear.

var fs = require('fs'), path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'js/pages/inventory-replenishment.js'), 'utf8');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function fnText(name) {
  var s = SRC.indexOf('function ' + name);
  if (s < 0) throw new Error('not found: ' + name);
  var i = SRC.indexOf('{', s), depth = 0, end = -1;
  for (var p = i; p < SRC.length; p++) { if (SRC[p] === '{') depth++; else if (SRC[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return SRC.slice(s, end);
}

// Fake DOM: id → element. Text inputs have {value, dataset}; selects add {options, selectedIndex}.
function makeDoc(fields) {
  var els = {};
  Object.keys(fields).forEach(function (id) { els[id] = fields[id]; });
  return { getElementById: function (id) { return els[id] || null; } };
}
function input(v) { return { value: v, dataset: {} }; }
function select(idx, n) { return { value: '', dataset: {}, options: new Array(n || 3), selectedIndex: idx }; }

var reset = new Function('document', 'window', fnText('resetReplenAddSkuForm') + '\n return resetReplenAddSkuForm;')(undefined, {});

section('behavioral — resetReplenAddSkuForm blanks EXACTLY the leaked fields (text → "", selects → default option 0)');
(function () {
  var f = {
    'replen-add-sku': input('CO2000'),
    'replen-add-site-sku': input('CO2000'),
    'replen-add-asin': input('B0ABCD1234'),
    'replen-add-product-url': input('https://example.com/p/1'),
    'replen-add-launch-date': input('2026-03-01'),
    'replen-add-model': select(2),
    'replen-add-fulfillment': select(1)
  };
  var doc = makeDoc(f);
  new Function('document', 'window', fnText('resetReplenAddSkuForm') + '\n resetReplenAddSkuForm();')(doc, {});
  ok(f['replen-add-sku'].value === '' && f['replen-add-site-sku'].value === '', 'SKU + Site SKU blanked');
  ok(f['replen-add-asin'].value === '' && f['replen-add-product-url'].value === '' && f['replen-add-launch-date'].value === '', 'ASIN + Product URL + Launch Date blanked (the leaked carry-over fields)');
  ok(f['replen-add-model'].selectedIndex === 0 && f['replen-add-fulfillment'].selectedIndex === 0, 'Planning Model + Fulfillment reset to the existing default option (index 0 — no invented default)');
  ok(f['replen-add-site-sku'].dataset.autofill === '1', 'Site SKU autofill flag restored (re-prefills from SKU on next open)');
})();

section('behavioral — reset is null-safe when a field is absent (never throws)');
(function () {
  var threw = false; try { new Function('document', 'window', fnText('resetReplenAddSkuForm') + '\n resetReplenAddSkuForm();')(makeDoc({}), {}); } catch (e) { threw = true; }
  ok(!threw, 'missing fields → no throw');
})();

section('B/D source contract — reset runs on the CONFIRMED-success branch (after closeReplenModal, after error guards)');
var saveFn = fnText('saveReplenSku');
ok((saveFn.match(/resetReplenAddSkuForm\(\);/g) || []).length === 3, 'reset called on all 3 success branches (import batch / legacy upsert / in-memory)');
ok(/closeReplenModal\(\);\s*\n\s*resetReplenAddSkuForm\(\);/.test(saveFn), 'reset runs immediately AFTER closeReplenModal on success (correct sequence)');
// The success reset must sit AFTER the failure guards that early-return.
var batchThen = saveFn.slice(saveFn.indexOf('.then(function(result)'), saveFn.indexOf('.catch'));
var errGuardIdx = batchThen.indexOf("result.success === false");
var successResetIdx = batchThen.indexOf('resetReplenAddSkuForm');
ok(errGuardIdx !== -1 && successResetIdx !== -1 && successResetIdx > errGuardIdx, 'C: success reset is positioned AFTER the "result.success === false" failure guard (failure returns before reset)');

section('C source contract — failure branches do NOT reset (values preserved for retry)');
// Each "Could not add SKU." failure alert is immediately followed by return; with no reset before it.
var failSegments = saveFn.split('Could not add SKU.');
ok(failSegments.length >= 3, 'both API/validation failure branches present');
// No "resetReplenAddSkuForm" appears between a failure alert and its return.
ok(/alert\('Could not add SKU\.[^\n]*\n\s*return;/.test(saveFn) || /Could not add SKU[\s\S]{0,120}?return;/.test(saveFn), 'failure branch returns without clearing the form');

section('A/Cancel source contract — closeReplenModal (Cancel) is UNCHANGED: resets only SKU + Site SKU, never full-form');
var closeFn = fnText('closeReplenModal');
ok(!/resetReplenAddSkuForm/.test(closeFn), 'Cancel/close does NOT call resetReplenAddSkuForm (unsaved fields preserved on manual close — Cancel semantics unchanged)');
ok(/replen-add-sku/.test(closeFn) && !/replen-add-asin|replen-add-product-url|replen-add-launch-date/.test(closeFn), 'close still touches only SKU/Site SKU (no new field wiping on Cancel)');

section('A source contract — open does NOT full-reset (accidental-close → reopen still shows the un-reset fields)');
var openFn = fnText('openReplenAddSkuModal');
ok(!/resetReplenAddSkuForm/.test(openFn), 'openReplenAddSkuModal does not call the success reset (does not wipe leaked fields on open) — before-success behavior unchanged');

section('E / negative constraints — reset makes NO cache/storage/filter/DB write (no new draft architecture)');
var resetFn = fnText('resetReplenAddSkuForm');
ok(!/localStorage|sessionStorage/.test(resetFn), 'reset touches NO local/session storage (no cache cleared — there is none)');
ok(!/KM\.DB|fetch\(|importMarketplaceSkus|upsert/.test(resetFn), 'reset makes NO backend/DB call');
ok(!/filter|country|marketplace|expand|recommendation|gap/i.test(resetFn), 'reset does NOT touch page filters / country / marketplace filter / expanded rows / recommendation / gap caches');
ok(!/km_replen_alloc_draft_v1|allShippingPlans/.test(resetFn), 'reset does NOT touch the shipping-allocation working draft or any unrelated cache');

console.log('\n----------------------------------------');
console.log('INVENTORY ADD SKU CLEAR-ON-SUCCESS (F1-SMALL): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
