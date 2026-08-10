// Kitchen Mama Operation System — F1-SMALL-DEMO-CLEANUP Demo Mode retirement.
// Run: node assets/tests/demo-mode-retired-f1-small.test.js
// -----------------------------------------------------------------------------
// The Demo Mode OWNER (assets/js/utils/demo-shared-data.js) — the toggle button, the in-memory enable flag, and ALL
// fake SKU/inventory/forecast/order datasets — is deleted and no longer loaded by index.html. Every remaining per-page
// consumer guard is null-safe (window.KM.DemoData && …isEnabled()), so with the owner gone every guard is falsy and
// production always takes the real DB path. Shared/production data that merely carries a "Mock" name is preserved.

var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { try { fs.accessSync(path.join(ROOT, rel)); return true; } catch (e) { return false; } }

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var INDEX = read('index.html');
var PAGES = ['home', 'forecast', 'fc-summary', 'factory-stock', 'inventory-replenishment', 'request-order'];

section('D1/D5 — the Demo Mode OWNER file is gone and is NOT loaded by the production bootstrap');
ok(!exists('assets/js/utils/demo-shared-data.js'), 'demo-shared-data.js (toggle button + enable flag + all fake datasets) is DELETED');
ok(INDEX.indexOf('demo-shared-data') === -1, 'D5: index.html no longer includes the demo-shared-data script (no demo dataset in bootstrap)');

section('D1/D2 — no Demo Mode toggle control or badge style can be produced (owner + CSS removed)');
// The toggle element (#demo-mode-toggle) and the enable flag lived ONLY in the deleted owner file.
ok(INDEX.indexOf('demo-mode-toggle') === -1, 'no demo toggle element wired in index.html');
ok(read('assets/css/pages/inventory-replenishment.css').indexOf('demo-badge') === -1, 'D2: inventory demo-badge CSS removed');
ok(read('assets/css/pages/overseas-stock.css').indexOf('demo-badge') === -1, 'D2: overseas-stock demo-badge CSS removed');

section('D3/D4 — no storage key and no query parameter can activate Demo Mode');
// Demo state was in-memory only (never persisted); prove no remaining runtime reads a demo flag from storage/URL.
var runtime = PAGES.map(function (p) { return read('assets/js/pages/' + p + '.js'); }).join('\n') + read('assets/js/app.js');
ok(!/(localStorage|sessionStorage)\.getItem\([^)]*[Dd]emo/.test(runtime), 'D3: no runtime reads a Demo flag from local/session storage to activate demo');
ok(!/[?&]demo=|URLSearchParams[^;]*demo|location\.search[^;]*demo/i.test(runtime), 'D4: no query-string switch activates demo/mock data');

section('D9 — every remaining Demo guard is NULL-SAFE (owner gone → falsy → NO throw, production path runs)');
PAGES.forEach(function (p) {
  var src = read('assets/js/pages/' + p + '.js');
  var lines = src.split('\n');
  var bad = [];
  lines.forEach(function (ln, i) {
    if (ln.indexOf('.isEnabled()') !== -1 && !/window\.KM\.DemoData && /.test(ln)) bad.push((i + 1) + ': ' + ln.trim().slice(0, 90));
  });
  ok(bad.length === 0, p + '.js: all isEnabled() guards are null-safe (window.KM.DemoData &&)' + (bad.length ? '\n  ' + bad.join('\n  ') : ''));
});

section('D6 — production (real DB) data paths are PRESERVED');
ok(read('assets/js/pages/inventory-replenishment.js').indexOf('_getCloudReplenishmentData') !== -1, 'inventory cloud/DB path preserved');
ok(read('assets/js/pages/factory-stock.js').indexOf('_getDbFactoryStockData') !== -1, 'factory-stock DB path preserved');
ok(read('assets/js/pages/request-order.js').indexOf('_buildRequestOrderRowsFromDb') !== -1, 'request-order DB path preserved');
ok(read('assets/js/pages/home.js').indexOf('_renderEmptyHomepage') !== -1, 'home real (empty/production) render path preserved');

section('D7 — SHARED / PRODUCTION data that merely carries a "Mock" name is NOT removed');
ok(read('assets/js/pages/inventory-replenishment.js').indexOf('replenishmentMockData') !== -1, 'replenishmentMockData preserved (SHARED: production carton math + shipping-plan.js)');
ok(read('assets/js/pages/shipping-plan.js').indexOf('replenishmentMockData') !== -1, 'shipping-plan.js still consumes replenishmentMockData (cross-file production dependency intact)');
ok(read('assets/js/pages/shipping-history.js').indexOf('shippingHistoryMockData') !== -1, 'shippingHistoryMockData preserved (PRODUCTION ungated data source)');
ok(read('assets/js/pages/campaign-risk.js').indexOf('promotionMockData') !== -1, 'promotionMockData preserved (PRODUCTION real localStorage promotions)');

section('D8 — no automated test depends on the Demo owner (nothing broken by its removal)');
var testDir = path.join(__dirname);
// Owner dependency = require()-ing the deleted file or calling the KM.DemoData runtime object (NOT a mere source
// string like "getForecastRows", which shared-filter-migration asserts about forecast.js production filter options).
var demoRefs = fs.readdirSync(testDir).filter(function (f) { return /\.test\.js$/.test(f) && f !== 'demo-mode-retired-f1-small.test.js'; })
  .filter(function (f) { return /demo-shared-data|KM\.DemoData/.test(fs.readFileSync(path.join(testDir, f), 'utf8')); });
ok(demoRefs.length === 0, 'no test file requires the demo owner file or the KM.DemoData runtime' + (demoRefs.length ? ' (' + demoRefs.join(', ') + ')' : ''));

section('D10 — demo cleanup is CODE/UI-only: no live DB write was introduced by this round');
// The retirement removed a file + a script include + CSS; it added no persistence. (Data-safety §8.)
ok(!/upsert|deleteRow|\.setValues\(|removeRow/i.test(INDEX), 'no DB write in index.html change');

console.log('\n----------------------------------------');
console.log('DEMO MODE RETIRED (F1-SMALL-DEMO-CLEANUP): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
