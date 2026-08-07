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
var COMP = read('css/components.css');
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

section('B. ONE shared control-geometry owner for BOTH the <input> and the .kmf trigger');
// rev2: a single rule governs the Search input AND the dropdown trigger (height + box-sizing + margin:0).
// Extract the rev2 shared rule from the appended block (comment-stripped) so we don't match the ORIGINAL
// `.skuh-filter > input, .skuh-filter > select` rule earlier in the file.
var NEWX = CSS.slice(CSS.indexOf('UI-HOTFIX (2026-08-07')).replace(/\/\*[\s\S]*?\*\//g, '');
ok(/#sku-handbook-section \.skuh-filter > input,\s*#sku-handbook-section \.skuh-filter--dropdown \.kmf-trigger\s*\{/.test(NEWX), 'B1 one shared selector targets BOTH the <input> and the .kmf trigger');
var shared = NEWX.slice(NEWX.indexOf('.kmf-trigger {')); shared = shared.slice(0, shared.indexOf('}') + 1);
ok(/height:\s*var\(--km-filter-height/.test(shared), 'B2 shared owner sets one control height (--km-filter-height)');
ok(/box-sizing:\s*border-box/.test(shared), 'B3 shared owner sets one box-sizing (border-box)');
ok(/margin:\s*0\b/.test(shared), 'B4 shared owner ZEROES margin — neutralizes the inherited global button{margin:4px} on the .kmf trigger (the real root cause)');
// §4: the rev1 wrapper/label compensation patches must be GONE (one final owner, not stacked).
ok(!/#sku-handbook-section \.skuh-filter-mount\s*\{[^}]*height:\s*var\(--km-filter-height/.test(CSSX), 'B5 obsolete rev1 .skuh-filter-mount fixed-height patch removed');
ok(!/#sku-handbook-section \.skuh-filter label\s*\{[^}]*min-height/.test(CSSX), 'B6 obsolete rev1 label min-height/line-height patch removed');
// the global button margin really is unqualified in components.css (documents the inherited authority).
var COMPX = COMP.replace(/\/\*[\s\S]*?\*\//g, '');
ok(/(^|\})\s*button\s*\{[^}]*margin:\s*4px/.test(COMPX), 'B7 confirms the global button{margin:4px} authority the fix neutralizes');

section('C. no forbidden positioning hacks / Search-only offset in the block');
var NEW = CSS.slice(CSS.indexOf('UI-HOTFIX (2026-08-07'));
ok(NEW.length > 0, 'C0 appended UI-HOTFIX block present');
ok(!/transform:\s*translate/.test(NEW), 'C1 no transform/translateY hack');
ok(!/margin[^:]*:\s*-/.test(NEW), 'C2 no negative-margin hack');
ok(!/position:\s*absolute/.test(NEW) && !/\btop:\s*-?\d/.test(NEW), 'C3 no absolute/relative-top offset hack');
ok(!/margin-top|margin-bottom/.test(NEW) && !/#skuh-filter-search\b/.test(NEW), 'C4 no Search-only vertical compensation (no per-field margin / #skuh-filter-search offset)');

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
