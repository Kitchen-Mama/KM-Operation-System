// Resizable Table Columns pilot — pure-logic tests for the reusable utility (clamp / persistence merge /
// safe corrupt-JSON fallback) + source-scan guards proving the SKU Details wiring uses STABLE column keys,
// accessible handles, and that the pilot is activated ONLY by SKU Details.
// Run: node assets/tests/resizable-columns.test.js

var fs = require('fs');
var path = require('path');
var R = require(path.join(__dirname, '..', 'js', 'utils', 'resizable-columns.js'));

var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

var COLS = [
  { key: 'sku', min: 90, max: 260, def: 120 },
  { key: 'product_name', min: 120, max: 440, def: 180 },
  { key: 'image', min: 48, max: 140, def: 64 }
];

// ---- clamp (F: min/max, rounding, NaN → min) ----
eq(R.clamp(300, 120, 440), 300, 'clamp: within range unchanged');
eq(R.clamp(50, 120, 440), 120, 'clamp: below min → min (O3 min clamp)');
eq(R.clamp(9999, 120, 440), 440, 'clamp: above max → max (O4 max clamp)');
eq(R.clamp(180.6, 120, 440), 181, 'clamp: rounds to integer px');
eq(R.clamp('abc', 120, 440), 120, 'clamp: non-numeric → min (safe)');

// ---- readGroup (G8: re-clamp on load; drop bad/unknown; corrupt → {}) ----
eq(R.readGroup({ 'sku-details': { 'master-sku-tables': { product_name: 300, image: 9999, sku: 'x', bogus: 50 } } }, 'sku-details', 'master-sku-tables', COLS),
   { product_name: 300, image: 140 }, 'readGroup: numeric kept+clamped (image→140), non-number sku dropped, unknown key ignored');
eq(R.readGroup({}, 'sku-details', 'master-sku-tables', COLS), {}, 'readGroup: missing page/group → {}');
eq(R.readGroup(null, 'sku-details', 'master-sku-tables', COLS), {}, 'readGroup: corrupt/null root → {} (O23 fallback)');

// ---- mergePersist (G5/G6: only this page/group written; others preserved) ----
var existing = { 'other-page': { 'g': { a: 10 } }, 'sku-details': { 'other-group': { z: 5 } } };
var merged = R.mergePersist(JSON.parse(JSON.stringify(existing)), 'sku-details', 'master-sku-tables', { product_name: 300 });
eq(merged['other-page'], { g: { a: 10 } }, 'mergePersist: unrelated page preserved');
eq(merged['sku-details']['other-group'], { z: 5 }, 'mergePersist: sibling group in same page preserved');
eq(merged['sku-details']['master-sku-tables'], { product_name: 300 }, 'mergePersist: target group written');

// ---- clearGroup (H2/G6/H8: removes only its group; other prefs intact) ----
var full = { 'other-page': { g: { a: 1 } }, 'sku-details': { 'master-sku-tables': { product_name: 300 }, 'other-group': { z: 5 } } };
var cleared = R.clearGroup(JSON.parse(JSON.stringify(full)), 'sku-details', 'master-sku-tables');
eq(cleared['sku-details']['master-sku-tables'], undefined, 'clearGroup: target group removed');
eq(cleared['sku-details']['other-group'], { z: 5 }, 'clearGroup: sibling group kept');
eq(cleared['other-page'], { g: { a: 1 } }, 'clearGroup: other page kept (H8)');
// group removal that empties the page also drops the empty page
var only = { 'sku-details': { 'master-sku-tables': { product_name: 300 } } };
eq(R.clearGroup(only, 'sku-details', 'master-sku-tables'), {}, 'clearGroup: empties page → page removed');

// ============================================================================================
// SOURCE-SCAN GUARDS
// ============================================================================================
var util = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'resizable-columns.js'), 'utf8');
var skuJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'sku-details.js'), 'utf8');
var skuHtml = fs.readFileSync(path.join(__dirname, '..', 'html', 'pages', 'sku-details.html'), 'utf8');

// Accessibility (I): handle is a keyboard-operable separator with valuemin/max/now + arrow/Home keys
eq(/'role', 'separator'/.test(util), true, 'handle uses role=separator');
eq(/aria-orientation/.test(util) && /aria-valuemin/.test(util) && /aria-valuemax/.test(util) && /aria-valuenow/.test(util), true, 'handle exposes aria-orientation + valuemin/max/now');
eq(/'tabindex', '0'/.test(util), true, 'handle is tabindex 0 (keyboard focusable)');
eq(/ArrowLeft/.test(util) && /ArrowRight/.test(util) && /'Home'/.test(util), true, 'keyboard: Arrow Left/Right + Home');
eq(/shiftKey \? 25 : 10/.test(util), true, 'keyboard: 10px / Shift 25px steps');
eq(/requestAnimationFrame/.test(util), true, 'F7: drag coalesced via requestAnimationFrame');
eq(/pointerdown/.test(util) && /pointerup/.test(util) && /pointercancel/.test(util), true, 'E: Pointer Events with up/cancel cleanup');
eq(/stopPropagation/.test(util), true, 'E: handle stops propagation (no sort / row Edit)');

// SKU Details wiring: stable keys (NOT index/label), correct storage identity, reset action
eq(/km\.ui\.tableWidths\.v1/.test(skuJs), true, 'storage key km.ui.tableWidths.v1');
eq(/page: 'sku-details'/.test(skuJs) && /group: 'master-sku-tables'/.test(skuJs), true, 'storage identity page/group present');
['sku', 'product_name', 'product_name_cn', 'item_dimensions', 'units_per_carton', 'selling_price'].forEach(function (k) {
  eq(new RegExp("key: '" + k + "'").test(skuJs), true, 'stable column key present: ' + k);
});
eq(/resetSkuColumnWidths/.test(skuJs) && /Reset Column Widths/.test(skuHtml), true, 'H: Reset Column Widths action wired in Display panel');
eq(/initSkuResizableColumns\(\)/.test(skuJs), true, 'pilot init hooked on mount');
eq(/_skuResizeCtl\.refresh\(\)/.test(skuJs), true, 'J: idempotent refresh (no duplicate handles/listeners)');

// Pilot ONLY on SKU Details — other pages must NOT activate the RAW engine directly (they use the
// dual-layer adapter instead). campaign-risk is intentionally excluded (it wires the shared adapter).
['request-order.js', 'inventory-replenishment.js', 'global-logistics-map.js', 'factory-stock.js', 'overseas-stock.js'].forEach(function (f) {
  var p = path.join(__dirname, '..', 'js', 'pages', f);
  if (!fs.existsSync(p)) return;
  eq(/resizableColumns/.test(fs.readFileSync(p, 'utf8')), false, 'pilot scope: ' + f + ' does NOT activate resizable columns');
});

// System Repair 2 Part E — Promotion Risk Tracker uses the SHARED resize (dual-layer adapter), not a
// page-specific drag implementation, and its scroll header carries the id the adapter targets.
var crJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'campaign-risk.js'), 'utf8');
var crHtml = fs.readFileSync(path.join(__dirname, '..', 'html', 'pages', 'campaign-risk.html'), 'utf8');
eq(/dualLayerResize\.init\(/.test(crJs), true, 'Part E: campaign-risk wires the shared dualLayerResize adapter');
eq(/scrollHeaderSel: '#cr-table-scroll-header'/.test(crJs) && /scrollBodySel: '#cr-table-scroll-body'/.test(crJs), true, 'Part E: adapter points at the Promotion Risk table id selectors');
eq(/group: 'promotion-risk'/.test(crJs), true, 'Part E: isolated storage group promotion-risk (shares km.ui.tableWidths.v1 key)');
eq(/id="cr-table-scroll-header"/.test(crHtml), true, 'Part E: scroll header carries the id the adapter needs to out-specify base widths');
eq(/_initCrColumnResize\(\)/.test(crJs), true, 'Part E: resize init invoked once on mount (header static → no duplicate handles)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
