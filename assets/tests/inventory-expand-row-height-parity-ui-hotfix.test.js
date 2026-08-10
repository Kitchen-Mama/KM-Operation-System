// Kitchen Mama Operation System — Inventory Replenishment expanded-row LEFT/RIGHT height parity (UI-HOTFIX).
// Run: node assets/tests/inventory-expand-row-height-parity-ui-hotfix.test.js
// -----------------------------------------------------------------------------
// UI/layout-only. Proves the expanded SKU row's LEFT (sticky SKU identity) column and RIGHT (detail canvas)
// share ONE height owner — the .table-body-bar flex row with align-items:stretch, where the RIGHT .scroll-col
// is the natural content-height authority and the LEFT .fixed-col → expand panel stretches to match — with
// NO fixed pixel height and NO JS height measurement, and the sticky/expand behaviour preserved.
// Source-scan test (repo has no visual-snapshot harness).

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var CSS = read('css/pages/inventory-replenishment.css');
var JS = read('js/pages/inventory-replenishment.js');
var HTML = read('html/pages/inventory-replenishment.html');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function ruleBody(css, selector) {
  var i = css.indexOf(selector); if (i < 0) return null;
  var open = css.indexOf('{', i), close = css.indexOf('}', open);
  return (open < 0 || close < 0) ? null : css.slice(open + 1, close);
}

section('A. shared height OWNER — one container, both sides stretch');
ok(/<div class="table-body-bar">[\s\S]*<div class="fixed-col">[\s\S]*<div class="scroll-col">/.test(HTML), 'A1 DOM: .table-body-bar wraps BOTH .fixed-col (left) and .scroll-col (right)');
ok(/#ops-section \.table-body-bar\s*\{[^}]*align-items:\s*stretch/.test(CSS), 'A2 #ops-section .table-body-bar explicitly owns height via align-items:stretch');

section('B. RIGHT is the natural content-height authority; LEFT stretches to it');
var fixedCol = ruleBody(CSS, '#ops-section .fixed-col');
ok(fixedCol && /display:\s*flex/.test(fixedCol) && /flex-direction:\s*column/.test(fixedCol), 'B1 sticky .fixed-col is a flex column (passes stretch down)');
ok(fixedCol && /position:\s*sticky/.test(fixedCol), 'B2 sticky frozen-column positioning preserved on .fixed-col');
var CSSX = CSS.replace(/\/\*[\s\S]*?\*\//g, '');   // strip comments (some carry literal { } braces)
ok(/#ops-section \.fixed-body\s*\{[^}]*flex:\s*1 1 auto/.test(CSSX), 'B3 .fixed-body fills the stretched .fixed-col (flex:1 1 auto)');
var panelFixed = ruleBody(CSS, '#ops-section .replen-expand-panel--fixed');
ok(panelFixed && /flex:\s*1 1 auto/.test(panelFixed), 'B4 .replen-expand-panel--fixed absorbs the stretch (flex:1 1 auto)');
ok(/#ops-section \.replen-expand-panel--fixed[^}]*align-items:\s*stretch/.test(CSS), 'B5 left panel stretches its inner identity block (align-items:stretch)');
ok(/#ops-section \.replen-expand-fixed\s*\{[^}]*min-height:\s*100%/.test(CSS), 'B6 inner identity block fills the stretched panel (min-height:100%)');
ok(/#ops-section \.replen-expand-panel--fixed\s*\{[^}]*background:\s*#fff/i.test(CSS), 'B7 the visible left column stays white to the bottom (no early-ending gray strip)');

section('C. continuous bottom divider owned once, on BOTH panels');
var panelBase = ruleBody(CSS, '#ops-section .replen-expand-panel {');
ok(panelBase && /border-bottom:/.test(panelBase), 'C1 shared .replen-expand-panel owns the bottom divider (applies to --fixed AND --scroll → one continuous line)');

section('D. NO fixed-pixel height hack on the expanded row/panels');
['#ops-section .replen-expand-panel', '#ops-section .replen-expand-panel--fixed', '#ops-section .replen-expand-fixed', '#ops-section .replen-expand-scroll'].forEach(function (sel) {
  var b = ruleBody(CSS, sel);
  ok(b === null || !/(^|[^-])height:\s*\d+px/.test(b), 'D:' + sel + ' has no hard-coded pixel height');
});

section('E. NO JS height measurement / sync in the expand path; collapse behaviour intact');
var toggle = JS.slice(JS.indexOf('function toggleReplenRow'), JS.indexOf('function updatePlannedQty'));
ok(toggle.length > 0, 'E0 toggleReplenRow extracted');
ok(!/offsetHeight|getBoundingClientRect|ResizeObserver/.test(toggle), 'E1 no JS height measurement (offsetHeight/getBoundingClientRect/ResizeObserver) in toggleReplenRow');
ok(!/\.style\.height\s*=/.test(toggle), 'E2 no inline height writes in the expand path');
ok(/_irNextExpandedKey\(currentExpandedRow, sku\)/.test(toggle) && /classList\.add\('expanded'\)/.test(toggle), 'E3 expand/collapse click behaviour preserved');

section('F. collapsed data-row geometry unchanged; no forbidden positioning hacks in the new block');
var fixedRow = ruleBody(CSS, '#ops-section .fixed-row');
ok(fixedRow && /height:\s*48px/.test(fixedRow) && /flex:\s*0 0 48px/.test(fixedRow), 'F1 collapsed .fixed-row stays 48px (regression guard)');
var NEW = CSS.slice(CSS.indexOf('UI-HOTFIX (2026-08-07)'));   // the appended equal-height block
ok(NEW.length > 0, 'F1a appended UI-HOTFIX block present');
ok(!/transform:\s*translate/.test(NEW), 'F2 no transform hack');
ok(!/margin[^:]*:\s*-/.test(NEW), 'F3 no negative-margin hack');
ok(!/position:\s*absolute/.test(NEW) && !/[^a-z-]top:\s*-?\d/.test(NEW), 'F4 no absolute/relative-top offset hack (the `top:` property; margin-top/padding-top are not positioning hacks)');

console.log('\n----------------------------------------');
console.log('INVENTORY EXPAND-ROW HEIGHT PARITY (UI-HOTFIX): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
