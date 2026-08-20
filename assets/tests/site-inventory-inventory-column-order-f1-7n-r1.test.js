// Kitchen Mama Operation System — F1-7N-UX-SITE-INVENTORY-INVENTORY-COLUMN-ORDER-R1
// Inventory presentation order becomes a stock-flow reading order: Current Stock → 3rd Party Stock → On the Way
// (what exists now → what sits in external/self warehouses → what is still inbound). SELF_FULFILLED keeps Current
// Stock structurally omitted, leaving 3rd Party Stock → On the Way. Presentation ORDER ONLY — the SAME one-column
// model drives header + body, so THEAD and TBODY can never drift; no formula/DTO/authority/binding change.
// Run: node assets/tests/site-inventory-inventory-column-order-f1-7n-r1.test.js

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
// index of the FIRST occurrence of needle after `from` (or -1)
function idx(hay, needle, from) { return hay.indexOf(needle, from || 0); }

var IR_JS = read('js/pages/inventory-replenishment.js');
var IR_HTML = read('html/pages/inventory-replenishment.html');
var INDEX = read('../index.html');

eval(extractFn(IR_JS, '_irInventoryColumnModel'));

// ---- 1-9 PURE model order per fulfillment_model -------------------------------------------------------------------
section('1-9 canonical presentation order (Current Stock → 3rd Party Stock → On the Way)');
eq(_irInventoryColumnModel('platform_fulfilled').columns, ['currentStock', 'thirdPartyStock', 'onTheWay'], '1/2 PLATFORM order = Current Stock, 3rd Party Stock, On the Way');
ok(_irInventoryColumnModel('platform_fulfilled').inventoryLeafSpan === 3, '3 PLATFORM colspan = 3');
eq(_irInventoryColumnModel('self_fulfilled').columns, ['thirdPartyStock', 'onTheWay'], '4/6 SELF order = 3rd Party Stock, On the Way');
ok(_irInventoryColumnModel('self_fulfilled').columns.indexOf('currentStock') === -1, '5 SELF Current Stock absent');
ok(_irInventoryColumnModel('self_fulfilled').inventoryLeafSpan === 2, '7 SELF colspan = 2');
eq(_irInventoryColumnModel('hybrid').columns, ['currentStock', 'thirdPartyStock', 'onTheWay'], '8 HYBRID order = Current Stock, 3rd Party Stock, On the Way');
ok(_irInventoryColumnModel('hybrid').inventoryLeafSpan === 3, '9 HYBRID colspan = 3');
eq(_irInventoryColumnModel('').columns, ['currentStock', 'thirdPartyStock', 'onTheWay'], 'UNKNOWN/blank fail-safe = full 3-column order');

// ---- 12 header and body physical DOM order are identical ----------------------------------------------------------
section('12 THEAD leaf order == TBODY cell order (single model; no independent reorder)');
// THEAD level-2 leaves: Current Stock, then 3rd Party Stock, then On the Way, then the Sales group leaf.
var hCur = idx(IR_HTML, 'header-cell--current-stock">Current Stock');
var h3rd = idx(IR_HTML, '>3rd Party Stock<');
var hOtw = idx(IR_HTML, '>On the Way<');
var hSales = idx(IR_HTML, '>Avg. Sales/day<');
ok(hCur > 0 && h3rd > 0 && hOtw > 0, 'header: all three Inventory leaves present');
ok(hCur < h3rd && h3rd < hOtw, '1/8 header order: Current Stock < 3rd Party Stock < On the Way');
ok(hOtw < hSales, 'header: Inventory group precedes the Sales group (no leaf escaped the group)');

// TBODY scroll-row: current-stock cell, then thirdPartyStock cell, then onTheWay cell, then avgDailySales.
var bCur = idx(IR_JS, 'replen-cell--current-stock">${item.currentInventory}');
var b3rd = idx(IR_JS, '${item.thirdPartyStock}');
var bOtw = idx(IR_JS, '${item.onTheWay}');
var bSales = idx(IR_JS, '${item.avgDailySales}');
ok(bCur > 0 && b3rd > 0 && bOtw > 0, 'body: all three Inventory cells present');
ok(bCur < b3rd && b3rd < bOtw, '2/6 body order: currentInventory < thirdPartyStock < onTheWay (matches header)');
ok(bOtw < bSales, 'body: Inventory cells precede Sales cells (aligned with header)');

// ---- 10-11-12 data bindings unchanged (only order moved, no value swap) -------------------------------------------
section('10/11/12 data bindings unchanged — no accidental value swap');
ok(/replen-cell--current-stock">\$\{item\.currentInventory\}/.test(IR_JS), '10 Current Stock still binds item.currentInventory');
ok(/title="\$\{\(item\.thirdPartyTitle \|\| ''\)\.replace\(\/"\/g, '&quot;'\)\}">\$\{item\.thirdPartyStock\}/.test(IR_JS), '11 3rd Party Stock still binds item.thirdPartyStock (+ its warehouse-grain title)');
ok(/<div class="scroll-cell">\$\{item\.onTheWay\}<\/div>/.test(IR_JS), '12 On the Way still binds item.onTheWay');

// ---- 13-17 alignment + dynamic switch preserved (unchanged one-class architecture) --------------------------------
section('13-17 structural alignment + dynamic switch preserved (no CSS offsets, no reload)');
ok(/id="replen-detail-table"/.test(IR_HTML), '13/14 detail table keeps the stable id the model toggles (expanded/empty/loading share this flex grid)');
ok(/_irApplyInventoryColumnModel\(_irScopeFulfillmentModel\(\)\)/.test(IR_JS), '15/16/17 render re-applies the model each render → marketplace switch reorders/omits with no page reload');
ok(/toggle\('ir-hide-current-stock'/.test(IR_JS), 'SELF still omits Current Stock via the SAME container class (colspan owner in sync)');

// ---- deploy — the JS change ships (token bumped) ------------------------------------------------------------------
section('deploy — inventory-replenishment.js cache token bumped');
var jsTok = INDEX.match(/inventory-replenishment\.js\?v=([A-Za-z0-9_-]+)/);
ok(jsTok && jsTok[1] !== 'ffcols-20260820', 'inventory-replenishment.js ?v= token bumped off the prior value (change deploys)');

console.log('\n----------------------------------------');
console.log('SITE INVENTORY INVENTORY-COLUMN-ORDER (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
