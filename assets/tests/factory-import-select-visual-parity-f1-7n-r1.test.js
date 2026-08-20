// Kitchen Mama Operation System — F1-7N-UX-FACTORY-IMPORT-SELECT-VISUAL-PARITY-R1
// UI-only: the Factory Import <select> reuses the EXACT Overseas Import select box styling (Company/Country/Warehouse),
// and the existing factory picker AUTHORITY (is_factory_warehouse=TRUE + active, no name/country/hard-coded-ID heuristic,
// option value = warehouse_id) is verified UNCHANGED. Source/CSS assertions only — no pixel snapshots.
// Run: node assets/tests/factory-import-select-visual-parity-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function section(n) { console.log('\n== ' + n + ' =='); }
function fn(src, name) { var i = src.indexOf('function ' + name + '('); if (i < 0) return ''; var d = 0, s = i, started = false; for (; i < src.length; i++) { var c = src[i]; if (c === '{') { d++; started = true; } else if (c === '}') { d--; if (started && d === 0) return src.slice(s, i + 1); } } return ''; }

var F_JS = read('js/pages/factory-stock.js');
var F_HTML = read('html/pages/factory-stock.html');
var F_CSS = read('css/pages/factory-stock.css');
var O_CSS = read('css/pages/overseas-stock.css');
var GS = read('specs/active/apps-script/21_factory_inventory_handlers.gs');

// =================================================================================================================
section('1-4 VERIFY existing Factory picker authority (unchanged, canonical)');
var elig = fn(F_JS, '_fiiEligibleFactories');
var pop = fn(F_JS, '_fiiPopulateFactories');
ok(/_fsGet\('warehouses'\)/.test(elig), '3 factory option SOURCE = canonical warehouses read-model (_fsGet)');
ok(/isFactoryWarehouse !== true\) return false/.test(elig), '2/4 membership authority = is_factory_warehouse === TRUE');
ok(/isActive === false\) return false/.test(elig), '5 inactive warehouses excluded');
ok(/warehouseType[\s\S]{0,60}!== 'FACTORY'\) return false/.test(elig), 'canonical warehouse_type=FACTORY (when present) — no name heuristic');
ok(!/CN_YOUXIN|TW_SHENGYI|WH-CN|WH-TW/.test(elig) && !/CN_YOUXIN|TW_SHENGYI/.test(pop), '6 NO hard-coded factory ids in the picker logic');
ok(/country/i.test(elig) === false, 'no country inference in the eligibility predicate');
ok(/value="' \+ _fiiEsc\(w\.warehouseId\)/.test(pop), '4 option VALUE remains warehouse_id');

// =================================================================================================================
section('5 selector reuses the Overseas modal select pattern (ovs-form-group > label + select)');
var selRow = F_HTML.slice(F_HTML.indexOf('factory-import-factory') - 200, F_HTML.indexOf('factory-import-factory') + 240);
ok(/class="ovs-form-row"/.test(selRow) && /class="ovs-form-group"/.test(selRow), '5 Factory selector wrapped in ovs-form-row / ovs-form-group (same as Overseas)');
ok(/<label for="factory-import-factory">Factory \*<\/label>/.test(selRow), 'label "Factory *" associated with the select');
ok(/<select id="factory-import-factory"/.test(selRow), 'native <select> (same control type as Overseas Company/Country/Warehouse)');

// =================================================================================================================
section('6/7 CSS box parity — factory .ovs-form-group select now mirrors Overseas EXACTLY');
// Overseas source of truth
ok(/#overseas-stock-section \.ovs-form-group input,\s*#overseas-stock-section \.ovs-form-group select\s*\{[^}]*height:\s*36px[^}]*border:\s*1px solid var\(--filter-border-color, #cbd5e0\)[^}]*border-radius:\s*6px[^}]*font-size:\s*13px/.test(O_CSS), '11 (reference) Overseas styles input+select together (unchanged)');
// factory now includes select in the same box rule
var facSelRule = F_CSS.slice(F_CSS.indexOf('.ovs-form-group select { height'), F_CSS.indexOf('.ovs-form-group select { height') + 200);
ok(/#factory-stock-section \.ovs-form-group input,\s*#factory-stock-section \.ovs-form-group select\s*\{/.test(F_CSS), '5/6 factory box rule now targets input AND select (parity)');
ok(/\.ovs-form-group select \{ height: 36px;/.test(F_CSS), '6 height 36px (matches Overseas)');
ok(/border: 1px solid var\(--filter-border-color, #cbd5e0\)/.test(facSelRule), '7 border 1px #cbd5e0 (matches Overseas)');
ok(/border-radius: 6px/.test(facSelRule), '7 border-radius 6px (matches Overseas)');
ok(/padding: 6px 10px/.test(facSelRule), '7 padding 6px 10px (matches Overseas)');
ok(/font-size: 13px/.test(facSelRule), '7 font-size 13px (matches Overseas)');
ok(/box-sizing: border-box/.test(facSelRule), '7 box-sizing border-box (matches Overseas)');
ok(/#factory-stock-section \.ovs-form-group select:disabled/.test(F_CSS), 'disabled state parity present');

// =================================================================================================================
section('8 full-width layout preserved (ovs-form-group flex fills the row)');
ok(/#factory-stock-section \.ovs-form-group \{ flex: 1 1 200px/.test(F_CSS), '8 ovs-form-group flex 1 1 200px (single control fills the row)');

// =================================================================================================================
section('9/10/11 behavior + validation + Overseas unchanged (UI-only round)');
ok(/factoryInventoryImportValidate\(\{[^}]*scope: _scope/.test(F_JS) && /factoryInventoryImportCommit\(\{[^}]*scope:/.test(F_JS), '9 import validate/commit wiring (with scope) unchanged');
ok(/id="factory-import-file"[^>]*onchange="_fiiOnFileChosen\(\)"/.test(F_HTML) && /id="factory-import-confirm-btn"[^>]*onclick="confirmFactoryImport\(\)"/.test(F_HTML), '9 file + confirm wiring unchanged');
ok(/function factoryImportScopeCheck_/.test(GS) && /function factoryImportEvaluateBatch_/.test(GS) && /handleFactoryInventoryImportCommit_/.test(GS), '10 factory server validation (scope gate + evaluator + commit) unchanged');
ok(/downloadFactoryImportTemplate/.test(F_HTML), 'Download Template behavior retained');
ok(/#overseas-stock-section \.ovs-form-group select \{[\s\S]{0,10}|input,\s*#overseas-stock-section \.ovs-form-group select/.test(O_CSS), '11 Overseas Import CSS left intact');

console.log('\n----------------------------------------');
console.log('FACTORY IMPORT SELECT VISUAL PARITY (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
