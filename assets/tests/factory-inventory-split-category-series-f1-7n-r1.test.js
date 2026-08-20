// Kitchen Mama Operation System — F1-7N-UX-FACTORY-INVENTORY-SPLIT-CATEGORY-SERIES-R1
// The Factory Inventory table's combined "Category / Series" column is split into TWO independent columns, Category
// and Series, reusing the row model's EXISTING structured item.category / item.series fields (no string parsing, no
// concatenation in the two cells, no new DB field). Presentation-only: stock values, warehouse, filters, formulas,
// API, schema all unchanged. Run: node assets/tests/factory-inventory-split-category-series-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var FS_HTML = read('html/pages/factory-stock.html');
var FS_JS = read('js/pages/factory-stock.js');
var FS_CSS = read('css/pages/factory-stock.css');
var INDEX = read('../index.html');

// Snapshot table header block only (before the Movement Log panel).
var hdrStart = FS_HTML.indexOf('factory-stock-scroll-header');
var hdrEnd = FS_HTML.indexOf('table-body-bar');
var HDR = FS_HTML.slice(hdrStart, hdrEnd > hdrStart ? hdrEnd : FS_HTML.length);
// The snapshot scroll-row body template in renderFactoryStockTable.
var rowStart = FS_JS.indexOf('scrollBody.innerHTML = data.map');
var ROW = FS_JS.slice(rowStart, FS_JS.indexOf('.join(\'\');', rowStart) + 8);

section('1-3 headers — combined gone, Category + Series present');
ok(!/Category \/ Series/.test(FS_HTML), '1 "Category / Series" combined header no longer exists');
ok(/header-cell header-cell--category">Category</.test(HDR), '2 Category header exists');
ok(/header-cell header-cell--series">Series</.test(HDR), '3 Series header exists');

section('4-6 body cells — independent category / series (no concatenation), reusing structured fields');
ok(/scroll-cell scroll-cell--category">\$\{_fmvEscapeHtml\(item\.category\) \|\| na\}/.test(ROW), '4/5 Category cell binds item.category ONLY (empty→na)');
ok(/scroll-cell scroll-cell--series">\$\{_fmvEscapeHtml\(item\.series\) \|\| na\}/.test(ROW), '5 Series cell binds item.series ONLY (empty→na)');
ok(!/item\.categorySeries/.test(ROW), '4/6 the two table cells never render the concatenated item.categorySeries (no "Cat / Series" string)');
// data source: row model already carries structured category + series (from the sku_details join) — not parsed from a string
ok(/category: (cat|meta\.category|r\.category)/.test(FS_JS) && /series: (ser|meta\.series|r\.series)/.test(FS_JS), '6 row model exposes structured item.category + item.series (CO1100-R → Electric Can Opener | CO1100)');

section('7 header/body column counts match (10 total: SKU + 9 scroll)');
// scroll header cells (snapshot): Warehouse, Category, Series, Current, Reserved, Available, In Production, Pending Shipout, Last Movement = 9
var hdrCells = (HDR.match(/class="header-cell/g) || []).length;
ok(hdrCells === 9, '7 scroll header has 9 cells (was 8 + 1 from the split) — got ' + hdrCells);
var rowCells = (ROW.match(/class="scroll-cell/g) || []).length;
ok(rowCells === 9, '7 scroll row body has 9 cells (matches header) — got ' + rowCells);

section('8 empty/loading rows — div-grid (no fixed colspan to drift)');
ok(/scrollBody\.innerHTML = '<div style="[^"]*text-align:center[^"]*">No data found<\/div>'/.test(FS_JS), '8 empty state is a single full-width message div (no numeric colspan that could mismatch the new column count)');

section('9-10 filters unchanged (separate Category + Series filters still work)');
ok(/filters\.category\.length > 0 && !filters\.category\.includes\(item\.category\)/.test(FS_JS), '9 Category filter predicate intact');
ok(/filters\.series\.length > 0 && !filters\.series\.includes\(item\.series\)/.test(FS_JS), '10 Series filter predicate intact');
ok(/data-filter="category"/.test(FS_HTML) && /data-filter="series"/.test(FS_HTML), '9/10 top Category + Series filter controls unchanged');

section('11-12 regression guards — stock + warehouse cells unchanged');
ok(/scroll-cell scroll-cell--num">\$\{item\.currentStock\.toLocaleString\(\)\}/.test(ROW) && /\$\{item\.reservedStock\.toLocaleString\(\)\}/.test(ROW) && /\$\{item\.availableStock\.toLocaleString\(\)\}/.test(ROW), '11 Current/Reserved/Available cells unchanged');
ok(/<div class="scroll-cell">\$\{_fmvEscapeHtml\(item\.factory\)\}<\/div>/.test(ROW), '12 Warehouse cell unchanged');
ok(/\$\{_fmvEscapeHtml\(item\.lastMovement\) \|\| na\}/.test(ROW), '11 Last Movement cell unchanged');

section('13 no API/schema/formula surface — presentation only');
ok(!/KM\.DB\.|action:|factory_stock\s*=|availableStock\s*=\s*Math|new field/.test(ROW), '13 the split touched no API call / calculation / schema');

section('layout — Category wider, Series narrower; header+body share widths (alignment)');
ok(/\.header-cell--category,\s*#factory-stock-section \.scroll-cell\.scroll-cell--category \{\s*width: 160px/.test(FS_CSS.replace(/\n/g, ' ')) || /scroll-cell--category \{[^}]*width: 160px/.test(FS_CSS.replace(/\n/g, ' ')), 'Category column widened (160px) for "Electric Can Opener"');
ok(/scroll-cell--series \{[^}]*width: 100px/.test(FS_CSS.replace(/\n/g, ' ')), 'Series column narrower (100px)');

section('15 deploy — factory-stock.js/.css tokens bumped');
var fjs = INDEX.match(/factory-stock\.js\?v=([A-Za-z0-9_-]+)/), fcss = INDEX.match(/factory-stock\.css\?v=([A-Za-z0-9_-]+)/);
ok(fjs && fjs[1] !== 'rmcompany-20260820', 'factory-stock.js token bumped');
ok(fcss && fcss[1] === fjs[1], 'factory-stock.css shares the bumped token (co-changed pair)');

console.log('\n----------------------------------------');
console.log('FACTORY INVENTORY SPLIT CATEGORY/SERIES (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
