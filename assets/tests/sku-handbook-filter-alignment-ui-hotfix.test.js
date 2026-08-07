// Kitchen Mama Operation System — SKU Handbook filter alignment + hide Data-mode badge (UI-HOTFIX).
// Run: node assets/tests/sku-handbook-filter-alignment-ui-hotfix.test.js
// -----------------------------------------------------------------------------
// UI-only. Proves (1) the four filter groups (Product Line / Brand / Lifecycle / Search) share ONE
// control-height + label baseline so Search no longer sinks — no translateY / negative-margin / offset /
// JS-measurement hack — and (2) the "Data: Mock" data-mode badge is hidden via its own SKU-Handbook
// selector while the mock/live selection logic and the language toggle remain intact. Source-scan test.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

var CSS = read('css/pages/sku-handbook.css');
var CSSX = CSS.replace(/\/\*[\s\S]*?\*\//g, '');   // comment-stripped (comments carry example braces/props)
var JS = read('js/pages/sku-handbook.js');
var HTML = read('html/pages/sku-handbook.html');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

section('A. filter row structure — shared row owner, four groups, Search is a plain input');
ok(/<div class="skuh-filters">/.test(HTML), 'A1 .skuh-filters row present');
ok((HTML.match(/skuh-filter--dropdown/g) || []).length === 3, 'A2 three dropdown groups (Product Line / Brand / Lifecycle)');
ok(/<div class="skuh-filter">\s*<label>Search<\/label>\s*<input[^>]*id="skuh-filter-search"/.test(HTML), 'A3 Search is a plain <input> group (different control from the .kmf dropdowns → the alignment risk)');
ok(/#sku-handbook-section \.skuh-filters\s*\{[^}]*align-items:\s*flex-end/.test(CSSX), 'A4 row aligns groups by their bottom edge (align-items:flex-end)');

section('B. shared control-height + label baseline owner (Search cannot sink)');
ok(/#sku-handbook-section \.skuh-filter-mount\s*\{[^}]*height:\s*var\(--km-filter-height/.test(CSSX), 'B1 dropdown control area (.skuh-filter-mount) pinned to the shared filter height');
ok(/#sku-handbook-section \.skuh-filter > input[\s\S]*?height:\s*var\(--km-filter-height/.test(CSSX), 'B2 Search input uses the SAME shared filter-height token');
ok(/\.skuh-filter--dropdown \.kmf-trigger\s*\{[^}]*height:\s*100%/.test(CSSX), 'B3 the .kmf trigger fills the pinned mount height (== input height)');
ok(/#sku-handbook-section \.skuh-filter label\s*\{[^}]*min-height:\s*16px/.test(CSSX) && /#sku-handbook-section \.skuh-filter label\s*\{[^}]*line-height:\s*16px/.test(CSSX), 'B4 all four labels share one baseline height (stable under wrap)');

section('C. no forbidden positioning hacks in the appended block');
var NEW = CSS.slice(CSS.indexOf('UI-HOTFIX (2026-08-07)'));
ok(NEW.length > 0, 'C0 appended UI-HOTFIX block present');
ok(!/transform:\s*translate/.test(NEW), 'C1 no transform/translateY hack');
ok(!/margin[^:]*:\s*-/.test(NEW), 'C2 no negative-margin hack');
ok(!/position:\s*absolute/.test(NEW) && !/\btop:\s*-?\d/.test(NEW), 'C3 no absolute/relative-top offset hack');

section('D. Data-mode badge hidden by its own SKU-Handbook selector (no reserved space)');
ok(/#sku-handbook-section \.skuh-stat--mode\s*\{[^}]*display:\s*none/.test(CSSX), 'D1 .skuh-stat--mode is display:none (badge no longer visible)');
ok(/#sku-handbook-section \.skuh-stats\s*\{[^}]*display:\s*flex/.test(CSSX), 'D2 #skuh-stats is a flex+gap row → display:none leaves NO reserved space');

section('E. mock/live logic UNCHANGED (presentation-only hide)');
ok(/getDataSourceMode/.test(JS), 'E1 sku-handbook.js still computes the data-source mode (diagnostic intact)');
ok(/Data:\s*Mock/.test(JS) && /Data:\s*Google Sheet/.test(JS), 'E2 the mode badge is still RENDERED in JS (only CSS-hidden — logic untouched)');
ok(/skuh-stat--mode/.test(JS), 'E3 the badge markup/class is still produced by the render path (not deleted)');

section('F. language toggle preserved');
ok(/class="skuh-lang-toggle"/.test(HTML) && /setSkuhLang\('en'\)/.test(HTML) && /setSkuhLang\('zh'\)/.test(HTML), 'F1 EN / 中文 toggle markup intact');
ok(!/skuh-lang/.test(NEW), 'F2 the UI-HOTFIX block does not touch the language toggle');

console.log('\n----------------------------------------');
console.log('SKU HANDBOOK FILTER ALIGNMENT + MOCK BADGE (UI-HOTFIX): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
