// Kitchen Mama Operation System — F1-7N-UX-WAREHOUSE-ACTIONS-MORE-OPTIONS-R1
// Factory Inventory + Overseas Inventory move their two standalone secondary actions (Import Inventory,
// Inventory Adjustment) into ONE "... More Options" dropdown, reusing the Site Inventory / SKU Details idiom
// (page-scoped trigger+list, outside-click + Escape close, keyboard nav, guarded single global-listener binding).
// Each item calls the EXISTING handler verbatim — no API / Apps Script / formula / inventory-logic change.
// Run: node assets/tests/warehouse-actions-more-options-f1-7n-r1.test.js

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var FS_HTML = read('html/pages/factory-stock.html');
var FS_JS = read('js/pages/factory-stock.js');
var FS_CSS = read('css/pages/factory-stock.css');
var OV_HTML = read('html/pages/overseas-stock.html');
var OV_JS = read('js/pages/overseas-stock.js');
var OV_CSS = read('css/pages/overseas-stock.css');
var INV_HTML = read('html/pages/inventory-replenishment.html');
var INV_JS = read('js/pages/inventory-replenishment.js');
var INDEX = read('../index.html');

// ---- FACTORY -----------------------------------------------------------------------------------------------------
section('1-5 Factory: standalone buttons removed → More Options menu → existing handlers reused once');
ok(!/id="factory-stock-import-btn"/.test(FS_HTML) && !/id="factory-stock-edit-btn"/.test(FS_HTML), '1 old standalone Factory buttons removed');
ok(!/class="btn btn-primary"[^>]*onclick="openFactoryImportModal\(\)"/.test(FS_HTML) && !/onclick="openFactoryInventoryAdjustModal\(\)"[^>]*>Inventory Adjustment/.test(FS_HTML), '1 no standalone Import/Adjustment buttons remain in the action bar');
ok(/class="fs-actions-menu"/.test(FS_HTML) && /id="factoryActionsTrigger"/.test(FS_HTML) && /⋯ More Options/.test(FS_HTML), '2 Factory More Options trigger exists');
ok(/onclick="toggleFactoryActionsMenu\(event\)"/.test(FS_HTML) && /aria-haspopup="menu"/.test(FS_HTML) && /aria-controls="factoryActionsList"/.test(FS_HTML), '2 Factory trigger wired + accessible');
ok(/onclick="runFactoryAction\('import'\)"[^<]*>Import Inventory/.test(FS_HTML), '3 Import item in the Factory menu');
ok(/onclick="runFactoryAction\('adjust'\)"[^<]*>Inventory Adjustment/.test(FS_HTML), '4 Adjustment item in the Factory menu');
// runFactoryAction reuses the EXISTING owners exactly once each
ok(/kind === 'import' && typeof openFactoryImportModal === 'function'\) return openFactoryImportModal\(\)/.test(FS_JS), '3/5 Import item → existing openFactoryImportModal (reused verbatim)');
ok(/kind === 'adjust' && typeof openFactoryInventoryAdjustModal === 'function'\) return openFactoryInventoryAdjustModal\(\)/.test(FS_JS), '4/5 Adjustment item → existing openFactoryInventoryAdjustModal (reused verbatim)');
ok((FS_JS.match(/openFactoryImportModal\(\)/g) || []).filter(function (x) { return true; }).length >= 1 && (FS_JS.match(/function openFactoryImportModal/g) || []).length === 1, '5 openFactoryImportModal still defined exactly once (no duplicate owner)');

// ---- OVERSEAS ----------------------------------------------------------------------------------------------------
section('6-9 Overseas: standalone buttons removed → More Options → existing handlers unchanged');
ok(!/id="overseas-import-btn"/.test(OV_HTML) && !/id="overseas-adjust-btn"/.test(OV_HTML), '6 old standalone Overseas buttons removed');
ok(/class="ovs-actions-menu"/.test(OV_HTML) && /id="overseasActionsTrigger"/.test(OV_HTML) && /⋯ More Options/.test(OV_HTML), '7 Overseas More Options trigger exists');
ok(/onclick="runOverseasAction\('import'\)"[^<]*>Import Inventory/.test(OV_HTML), '8 Overseas Import item present');
ok(/onclick="runOverseasAction\('adjust'\)"[^<]*>Inventory Adjustment/.test(OV_HTML), '9 Overseas Adjustment item present');
ok(/kind === 'import' && typeof openOverseasImportModal === 'function'\) return openOverseasImportModal\(\)/.test(OV_JS), '8 Import → existing openOverseasImportModal unchanged (reused verbatim)');
ok(/kind === 'adjust' && typeof openOverseasAdjustModal === 'function'\) return openOverseasAdjustModal\(\)/.test(OV_JS), '9 Adjustment → existing openOverseasAdjustModal unchanged (reused verbatim)');
ok((OV_JS.match(/function openOverseasImportModal/g) || []).length === 1 && (OV_JS.match(/function openOverseasAdjustModal/g) || []).length === 1, 'Overseas owners still defined exactly once (no FBA/import behavior change)');

// ---- 10-12 shared behavior contract: outside-click close, guarded single binding, no write on open ---------------
section('10-12 dropdown behavior: outside-click close · no duplicate listeners · no write on open');
[['Factory', FS_JS, 'factory', '#factoryActionsMenu'], ['Overseas', OV_JS, 'overseas', '#overseasActionsMenu']].forEach(function (t) {
    var name = t[0], js = t[1], p = t[2], sel = t[3];
    ok(new RegExp("ev\\.target\\.closest\\('" + sel + "'\\)").test(js), '10 ' + name + ' outside-click closes the menu (inside-guard on ' + sel + ')');
    ok(new RegExp("if \\(_" + p + "ActionsBound\\) return;").test(js) && new RegExp("_" + p + "ActionsBound = true;").test(js), '11 ' + name + ' global listeners bound ONCE (guarded flag — repeated open/close cannot stack listeners)');
    ok(new RegExp("ev\\.key === 'Escape'[\\s\\S]{0,40}_" + p + "ActionsClose\\(true\\)").test(js), 'Escape closes ' + name + ' menu (returns focus to trigger)');
    // opening the menu only toggles hidden/aria/focus — it must NOT call any import/adjust/commit/DB owner.
    var openFn = (js.match(new RegExp("function _" + p + "ActionsOpen\\(\\)[\\s\\S]*?\\n\\}")) || [''])[0];
    ok(openFn && !/(openOverseasImportModal|openOverseasAdjustModal|openFactoryImportModal|openFactoryInventoryAdjustModal|KM\.DB\.|runOverseasImport|confirmFactoryImport)/.test(openFn), '12 ' + name + ' opening the menu performs NO inventory write / handler call');
});

// ---- 13 Site Inventory More Options unchanged --------------------------------------------------------------------
section('13 Site Inventory More Options untouched');
ok(/id="replenActionsTrigger"/.test(INV_HTML) && /onclick="toggleReplenActionsMenu\(event\)"/.test(INV_HTML), '13 Site Inventory replenActions trigger + handler intact');
ok(/function toggleReplenActionsMenu\(ev\)/.test(INV_JS) && /function runReplenAction\(kind\)/.test(INV_JS), '13 Site Inventory menu JS intact (not modified by this round)');

// ---- CSS parity + deploy -----------------------------------------------------------------------------------------
section('CSS parity (neutral #f1f5f9 / #334155 trigger) + cache tokens bumped');
ok(/#factory-stock-section \.fs-actions-menu__trigger\s*\{[^}]*background:\s*#f1f5f9[^}]*color:\s*#334155/.test(FS_CSS.replace(/\n/g, ' ')), 'Factory trigger uses the neutral More Options palette');
ok(/#overseas-stock-section \.ovs-actions-menu__trigger\s*\{[^}]*background:\s*#f1f5f9[^}]*color:\s*#334155/.test(OV_CSS.replace(/\n/g, ' ')), 'Overseas trigger uses the neutral More Options palette');
ok(/#factory-stock-section \.fs-actions-menu__list\[hidden\] \{ display: none/.test(FS_CSS) && /#overseas-stock-section \.ovs-actions-menu__list\[hidden\] \{ display: none/.test(OV_CSS), 'both menu lists hide via [hidden] (JS-toggled)');
var fjs = INDEX.match(/factory-stock\.js\?v=([A-Za-z0-9_-]+)/), ojs = INDEX.match(/overseas-stock\.js\?v=([A-Za-z0-9_-]+)/);
var fcss = INDEX.match(/factory-stock\.css\?v=([A-Za-z0-9_-]+)/), ocss = INDEX.match(/overseas-stock\.css\?v=([A-Za-z0-9_-]+)/);
ok(fjs && fjs[1] !== 'whscope-20260820', 'factory-stock.js token bumped');
ok(ojs && ojs[1] !== 'whscope-20260820', 'overseas-stock.js token bumped');
ok(fcss && fcss[1] !== 'whscope-20260820', 'factory-stock.css token bumped');
ok(ocss && ocss[1] !== 'donenotice-20260811', 'overseas-stock.css token bumped');

console.log('\n----------------------------------------');
console.log('WAREHOUSE ACTIONS MORE OPTIONS (F1-7N-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
