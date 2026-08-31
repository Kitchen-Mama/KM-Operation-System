// Kitchen Mama Operation System — F1-7N-UX-SITE-INVENTORY-FULFILLMENT-AWARE-COLUMNS-R1
// SELF_FULFILLED hides the platform "Current Stock" Inventory column (structurally, via one container class driving the
// header leaf + body cell + Inventory group span) with ZERO downstream misalignment; PLATFORM/HYBRID/UNKNOWN keep the
// full 3-column Inventory group. Presentation-only: no formula/DTO/authority change. PURE model + DOM-apply via stubs.
// Run: node assets/tests/site-inventory-fulfillment-aware-columns-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}
function section(n) { console.log('\n== ' + n + ' =='); }

var IR_JS = read('js/pages/inventory-replenishment.js');
var IR_HTML = read('html/pages/inventory-replenishment.html');
var IR_CSS = read('css/pages/inventory-replenishment.css');
var INDEX = read('../index.html');

// ---- pure model ---------------------------------------------------------------------------------------------------
eval(extractFn(IR_JS, '_irInventoryColumnModel'));

section('1-10 PURE column model per fulfillment_model');
eq(_irInventoryColumnModel('platform_fulfilled').columns, ['currentStock', 'thirdPartyStock', 'onTheWay'], '1/8 PLATFORM = Current Stock + 3rd Party + On the Way (column-order-R1)');
ok(_irInventoryColumnModel('platform_fulfilled').inventoryLeafSpan === 3 && _irInventoryColumnModel('platform_fulfilled').hideCurrentStock === false, '3 PLATFORM colspan=3, Current Stock kept');
eq(_irInventoryColumnModel('self_fulfilled').columns, ['thirdPartyStock', 'onTheWay'], '4/7/8 SELF = 3rd Party + On the Way (Current Stock omitted; column-order-R1)');
ok(_irInventoryColumnModel('self_fulfilled').hideCurrentStock === true && _irInventoryColumnModel('self_fulfilled').inventoryLeafSpan === 2, '6 SELF colspan=2, Current Stock hidden');
ok(_irInventoryColumnModel('SELF_FULFILLED').hideCurrentStock === true, 'SELF is canonical-value driven (case-insensitive), not a name');
ok(_irInventoryColumnModel('hybrid').inventoryLeafSpan === 3 && _irInventoryColumnModel('hybrid').hideCurrentStock === false, '9/10 HYBRID keeps the full 3-column Inventory group');
ok(_irInventoryColumnModel('').inventoryLeafSpan === 3 && _irInventoryColumnModel('unknown_x').inventoryLeafSpan === 3, '11 UNKNOWN/blank fail-safe → full structure');

// ---- DOM apply (fake table mirroring the real header/body structure) ----------------------------------------------
section('DOM apply — one container class drives header + body + group span');
function cls() { var s = {}; return { _s: s, add: function (c) { s[c] = 1; }, remove: function (c) { delete s[c]; }, toggle: function (c, on) { if (on) s[c] = 1; else delete s[c]; }, contains: function (c) { return !!s[c]; } }; }
var tblEl = { id: 'replen-detail-table', classList: cls() };
var invGroupEl = { _attrs: {}, setAttribute: function (k, v) { this._attrs[k] = v; }, getAttribute: function (k) { return this._attrs[k]; } };
global.document = { getElementById: function (id) { return id === 'replen-detail-table' ? tblEl : null; },
  querySelector: function (sel) { return /--inventory/.test(sel) ? invGroupEl : null; } };
eval(extractFn(IR_JS, '_irApplyInventoryColumnModel'));

var mSelf = _irApplyInventoryColumnModel('self_fulfilled');
ok(tblEl.classList.contains('ir-hide-current-stock') === true, 'SELF → container gets ir-hide-current-stock (hides header leaf + body cell via CSS)');
ok(invGroupEl.getAttribute('data-leaf-span') === '2', '13 SELF → Inventory group data-leaf-span=2 (colspan owner in sync)');
var mPlat = _irApplyInventoryColumnModel('platform_fulfilled');
ok(tblEl.classList.contains('ir-hide-current-stock') === false, '14/15 switch → PLATFORM removes the class (Current Stock returns) — no reload, no stale column');
ok(invGroupEl.getAttribute('data-leaf-span') === '3', 'PLATFORM → Inventory group colspan=3');
_irApplyInventoryColumnModel('self_fulfilled'); _irApplyInventoryColumnModel('platform_fulfilled'); _irApplyInventoryColumnModel('self_fulfilled');
ok(tblEl.classList.contains('ir-hide-current-stock') === true && invGroupEl.getAttribute('data-leaf-span') === '2', 'Amazon→Shopify→Amazon→Shopify converges to the current selection (no stale/duplicate)');

section('16/12 header+body use the SAME model (single container class); alignment by structure not offset');
// HTML: current-stock header leaf + detail table id present
ok(/id="replen-detail-table"/.test(IR_HTML), 'detail table carries the stable id the model toggles');
ok(/km-table__header-cell--current-stock">Current Stock/.test(IR_HTML), 'Current Stock level-2 header leaf is class-tagged for structural omission');
// JS body cell tagged + apply wired into the render path
// F1-7N-FB-4E-R4B-R3 - the row moved out of a template literal into _irScrollRowHtml_; what matters is that
// the body cell carries the SAME class the header leaf carries, next to the value it renders.
ok(/scroll-cell replen-cell--current-stock[^]{0,40}item\.currentInventory/.test(IR_JS), '5 body Current Stock cell is class-tagged (same column the header hides)');
ok(/_irApplyInventoryColumnModel\(_irScopeFulfillmentModel\(\)\)/.test(IR_JS), '19/22 render applies the resolved model (marketplace switch re-applies on each render, no reload)');
ok(/_replenDarFulfillmentOf\(_replenDarReadMarketplaces\(\), scope\.marketplaceId\)/.test(IR_JS), '3 fulfillment authority = canonical getMarketplaces read-model (no name inference)');
// CSS: one class removes the SAME 120px from header leaf + body cell, and shrinks the group 360→240 (alignment)
ok(/#replen-detail-table\.ir-hide-current-stock \.km-table__header-cell--inventory\s*\{[^}]*width:\s*240px/.test(IR_CSS), '20/21 SELF Inventory group shrinks 360→240 (downstream groups stay aligned)');
ok(/\.ir-hide-current-stock \.km-table__header-cell--current-stock,\s*#ops-section #replen-detail-table\.ir-hide-current-stock \.replen-cell--current-stock\s*\{\s*display: none/.test(IR_CSS), '12 header leaf + body cell hidden by the SAME container class (no drift, no empty occupying cell)');

section('23-28 presentation-only — no data/DTO/backend/schema/formula change surface');
var applyFn = extractFn(IR_JS, '_irApplyInventoryColumnModel') + extractFn(IR_JS, '_irInventoryColumnModel') + extractFn(IR_JS, '_irScopeFulfillmentModel');
ok(!/currentInventory\s*=|current_stock\s*=|thirdParty\w*\s*=|onTheWay\s*=|calculateGap|forecast|allocation/.test(applyFn), '23/24 column model computes NO stock/gap/forecast/allocation value (presentation only)');
ok(!/KM\.DB\.|fetch\(|getOperationDb/.test(applyFn), '25/26 no backend/API call added by the column model');

section('deploy — cache tokens bumped so the change goes live');
var jsTok = INDEX.match(/inventory-replenishment\.js\?v=([A-Za-z0-9_-]+)/);
var cssTok = INDEX.match(/inventory-replenishment\.css\?v=([A-Za-z0-9_-]+)/);
ok(jsTok && jsTok[1] !== 'donenotice-20260811', 'inventory-replenishment.js ?v= token bumped off the stale value (deploys)');
ok(cssTok && cssTok[1] !== 'toolbarui-20260811', 'inventory-replenishment.css ?v= token bumped off the stale value (deploys)');

console.log('\n----------------------------------------');
console.log('SITE INVENTORY FULFILLMENT-AWARE COLUMNS (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
