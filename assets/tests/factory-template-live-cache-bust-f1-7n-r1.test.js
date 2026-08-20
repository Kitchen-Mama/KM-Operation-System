// Kitchen Mama Operation System — F1-7N-UX-FACTORY-TEMPLATE-LIVE-SOURCE-MISMATCH-R1
// The template SOURCE (6946cad) is correct and has a SINGLE owner; the live XLSX stayed CN because index.html loaded
// factory-stock.js with a STALE ?v= cache token (predating the fix) → browsers/CDN served the old JS. This proves:
// (A) the cache tokens for the changed inventory-import assets are bumped OFF their pre-fix values (so a redeploy +
// refresh fetches the new code); (B) there is exactly ONE downloadFactoryImportTemplate and it is factory-scoped.
// Run: node assets/tests/factory-template-live-cache-bust-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var INDEX = read('../index.html');   // index.html lives at the repo root (read() is rooted at assets/)
var F_JS = read('js/pages/factory-stock.js');

section('A cache-version tokens bumped OFF the stale pre-fix values (deployment fix)');
// factory-stock.js: the stale token that shipped the old whIds[0]=CN generator
var fjs = INDEX.match(/assets\/js\/pages\/factory-stock\.js\?v=([A-Za-z0-9_-]+)/);
ok(!!fjs, 'factory-stock.js is included with a ?v= cache token');
ok(fjs && fjs[1] !== 'donenotice-20260811', 'factory-stock.js token bumped off the stale donenotice-20260811 (was serving old CN code)');
// overseas-stock.js: FBA-exclusion (be64223) needs its own cache bust
var ojs = INDEX.match(/assets\/js\/pages\/overseas-stock\.js\?v=([A-Za-z0-9_-]+)/);
ok(ojs && ojs[1] !== 'whimport-20260811', 'overseas-stock.js token bumped off the stale whimport-20260811 (FBA-exclusion deploys)');
// factory-stock.css: select visual parity (dfac254)
var fcss = INDEX.match(/assets\/css\/pages\/factory-stock\.css\?v=([A-Za-z0-9_-]+)/);
ok(fcss && fcss[1] !== 'donenotice-20260811', 'factory-stock.css token bumped off the stale donenotice-20260811 (select parity deploys)');

section('B each inventory-import asset is independently cache-versioned (bumped when it changes)');
// F1-7N-TW-FACTORY-OPERATIONAL-CONFIG-R1 — factory-stock.js + factory-stock.css change together this round and share
// the new token; overseas-stock.js is versioned independently (bumped in its own rounds). The invariant is "present +
// non-stale + the co-changed factory pair matches", NOT "all three forever identical".
ok(fjs && fcss && fjs[1] === fcss[1], 'the co-changed factory pair (factory-stock.js + factory-stock.css) share the SAME bumped token');
ok(ojs && /^[A-Za-z0-9_-]+$/.test(ojs[1]), 'overseas-stock.js carries its own valid ?v= token (independently versioned)');

section('C single template owner + factory-scoped source (no duplicate live path)');
var defs = (F_JS.match(/function downloadFactoryImportTemplate\(/g) || []).length;
ok(defs === 1, 'exactly ONE downloadFactoryImportTemplate definition (no duplicate/shadowing owner)');
var i = F_JS.indexOf('function downloadFactoryImportTemplate');
var body = F_JS.slice(i, F_JS.indexOf('function _fiiSplitCsvLine', i));
ok(/if \(!_fiiFactory\.warehouseId\)/.test(body), 'source gates on the selected factory (_fiiFactory)');
ok(/var selId = _fiiFactory\.warehouseId/.test(body) && /dropdown: \[selId\]/.test(body) && /exampleRow: \{ warehouse_id: selId/.test(body), 'source binds template scope to the SELECTED factory (selId), not whIds[0]');
ok(!/whIds\[0\]|WH-FACTORY-CN/.test(body), 'no legacy first-factory / hard-coded CN fallback remains in source');

console.log('\n----------------------------------------');
console.log('FACTORY TEMPLATE LIVE CACHE BUST (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
