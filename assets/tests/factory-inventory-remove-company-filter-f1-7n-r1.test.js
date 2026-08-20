// Kitchen Mama Operation System — F1-7N-UX-FACTORY-INVENTORY-REMOVE-COMPANY-FILTER-R1
// The USER-facing Company filter is removed from the Factory Inventory filter bar (factory-warehouse identity already
// carries company context). Presentation-only: factory_stock company DATA, warehouse identity, backend scopes, and
// planning logic are unchanged. No stale company predicate may hide rows. New order: Factory, Country, Category,
// Series, Stock Status, SKU. Run: node assets/tests/factory-inventory-remove-company-filter-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var FS_HTML = read('html/pages/factory-stock.html');
var FS_JS = read('js/pages/factory-stock.js');
var INDEX = read('../index.html');

// Restrict HTML checks to the SNAPSHOT filter bar (before the Movement Log panel + modals).
var barStart = FS_HTML.indexOf('fc-filter-bar');
var barEnd = FS_HTML.indexOf('Factory Stock Table');
var BAR = FS_HTML.slice(barStart, barEnd > barStart ? barEnd : FS_HTML.length);

section('1-4 filter bar — Company gone, Factory/Country present, correct remaining order');
ok(barStart >= 0, 'factory filter bar located');
ok(!/data-filter="company"/.test(BAR), '1 Company filter control is absent from the Factory Inventory bar');
ok(!/<label>Company<\/label>/.test(BAR), '1 no "Company" filter label in the bar');
ok(/data-filter="factory"/.test(BAR) && /<label>Factory<\/label>/.test(BAR), '2 Factory filter present');
ok(/data-filter="country"/.test(BAR) && /<label>Country<\/label>/.test(BAR), '3 Country filter present');
// remaining order: Factory < Country < Category < Series < Stock Status < SKU
var order = ['factory', 'country', 'category', 'series', 'stockStatus'].map(function (t) { return BAR.indexOf('data-filter="' + t + '"'); });
var skuIdx = BAR.indexOf('filter-group--sku');
var ordered = true; for (var i = 1; i < order.length; i++) { if (!(order[i - 1] >= 0 && order[i] > order[i - 1])) ordered = false; }
ok(ordered && order[order.length - 1] < skuIdx, '4 remaining filter order = Factory, Country, Category, Series, Stock Status, SKU');

section('5-8 behavior — Factory/Country still filter; no stale company predicate hides rows');
// the render filter object no longer builds a company facet, and the filter loop no longer applies a company predicate
ok(!/company:\s*getFilters\('company'\)/.test(FS_JS), '8 render filters object no longer reads a company facet');
ok(!/filters\.company/.test(FS_JS), '8 no filters.company predicate remains (cannot hide rows by a removed filter)');
ok(/if \(filters\.factory\.length > 0 && !filters\.factory\.includes\(item\.factory\)\) return false;/.test(FS_JS), '5 Factory predicate intact');
ok(/if \(filters\.country\.length > 0 && !filters\.country\.includes\(item\.country\)\) return false;/.test(FS_JS), '6 Country predicate intact');
ok(/if \(filters\.category\.length > 0/.test(FS_JS) && /if \(filters\.series\.length > 0/.test(FS_JS) && /if \(filters\.stockStatus\.length > 0/.test(FS_JS) && /if \(filters\.sku &&/.test(FS_JS), '7 Category/Series/Stock Status/SKU predicates intact');
// init + rebuild no longer touch a company panel (no dangling UI plumbing)
ok(/\['factory', 'country', 'category', 'series', 'stockStatus'\]\.forEach/.test(FS_JS), '8 filter-init loop no longer includes company');
ok(!/rebuild\('company'/.test(FS_JS), '8 rebuild no longer targets a company panel');

section('9-10 data authority + backend UNCHANGED (only the UI filter removed)');
ok(/company: wh\.company \|\| r\.company \|\| ''/.test(FS_JS), '9 factory_stock row still carries item.company (data authority untouched)');
ok(/set\('factory-adjust-company', rec\.company/.test(FS_JS), '9 Inventory Adjustment modal still displays the record company (data preserved)');
// Audit: Factory Inventory filtering is CLIENT-SIDE over the in-memory _factoryData set — the company facet was never
// part of any server request contract, so its removal needs NO backend/API/.gs change (frontend-only).
ok(/_factoryData\.filter\(item =>/.test(FS_JS), '10 filtering is client-side over in-memory _factoryData (no server request carried the company filter → backend/API unchanged)');

section('11 deploy — factory-stock.js cache token bumped (no alignment/CSS regression; flex bar reflows)');
var fjs = INDEX.match(/factory-stock\.js\?v=([A-Za-z0-9_-]+)/);
ok(fjs && fjs[1] !== 'twfacop-20260820', 'factory-stock.js ?v= token bumped (removal deploys)');

console.log('\n----------------------------------------');
console.log('FACTORY INVENTORY REMOVE COMPANY FILTER (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
