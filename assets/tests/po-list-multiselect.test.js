// UI Runtime Small Repair Round 2 — Repair F: Purchase Order Overview (purchase-order-list) migrated to
// the shared SKU-Details-style multi-select (KM.ui.multiFilter). SOURCE-CONTRACT tests (pure Node scan) —
// NOT Browser Runtime acceptance. Browser acceptance remains USER PENDING.
// Run: node assets/tests/po-list-multiselect.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var html = read('html/pages/purchase-order-list.html');
var js = read('js/pages/purchase-order-list.js');

console.log('\n-- F1: correct owner is purchase-order-list (NOT purchase-order-overview workspace) --');
ok(/purchase-order-list-section/.test(js), 'F1: controller targets purchase-order-list-section');

console.log('\n-- F2: native <select> filter owners removed; shared mounts present --');
ok(!/<select id="pol-f-status"/.test(html) && !/<select id="pol-f-supplier"/.test(html) &&
   !/<select id="pol-f-category"/.test(html) && !/<select id="pol-f-series"/.test(html),
   'F2: native <select> Status/Supplier/Category/Series removed from filter bar');
['status', 'supplier', 'category', 'series'].forEach(function (k) {
  ok(new RegExp('id="pol-f-' + k + '-mount"').test(html), 'F3: shared-filter mount present — ' + k);
});
ok(/id="pol-f-sku"[^>]*type="text"|type="text"[^>]*id="pol-f-sku"/.test(html), 'F4: SKU stays a free-text search (not converted)');

console.log('\n-- F5: filters created via the shared component; multi-value state --');
ok(/KM\.ui\.multiFilter\.create\(/.test(js), 'F5: filters created via KM.ui.multiFilter.create');
ok(/polFilterState = \{ status: \[\], supplier: \[\], category: \[\], series: \[\] \}/.test(js),
   'F6: filter state is a multi-value array ([] = All)');
ok(/onChange: function \(vals\) \{ polFilterState\[key\] = vals; polPage = 1; renderRows\(\); \}/.test(js),
   'F7: selection flows through onChange into the existing render/query path');

console.log('\n-- F8: predicate reads the Set (OR within a filter, AND across filters) --');
ok(/var fStatus = polFilterState\.status/.test(js), 'F8: applyFilters reads polFilterState (not a native <select>.value)');
ok(/fStatus\.length && fStatus\.indexOf\(m\.status\) === -1/.test(js), 'F9: Status OR-set membership (empty = All)');
ok(/fCategory\.length && !m\.categoryList\.some\(function \(c\) \{ return fCategory\.indexOf\(c\) !== -1; \}\)/.test(js),
   'F10: Category OR across the row list-field (AND across filters via sequential returns)');
ok(!/var fStatus = val\('pol-f-status'\)/.test(js), 'F11: old scalar val(\'pol-f-status\') read removed (no dual owner)');

console.log('\n-- F12: reset + cascading option prune --');
ok(/mt\.__kmfCtl\.setSelected\(\[\]\)/.test(js), 'F12: reset clears the shared controllers');
ok(/mount\.__kmfCtl\.getSelected\(\)/.test(js), 'F13: state re-synced after setOptions prunes invalid selections (cascade cleanup)');
ok(/POL_STATUS_OPTS/.test(js) && !/value: 'draft'/.test(js.slice(js.indexOf('POL_STATUS_OPTS'), js.indexOf('POL_STATUS_OPTS') + 400)),
   'F14: Status option values preserved (draft excluded from this page, as before)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
