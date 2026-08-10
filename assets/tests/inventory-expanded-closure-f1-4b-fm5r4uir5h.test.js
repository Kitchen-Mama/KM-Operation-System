// Kitchen Mama Operation System — Inventory expanded geometry regression closure (F1-4B-FM5-R4UI-R5H).
// Run: node assets/tests/inventory-expanded-closure-f1-4b-fm5r4uir5h.test.js
// -----------------------------------------------------------------------------
// UI-only. Closes the R5G regressions: §B1 the scrollbar gutter must be reserved at the fixed COLUMN BOTTOM
// (.fixed-body padding-bottom) — NOT as a margin between the expanded panel and the next row — so expanding SKU A
// never changes SKU B/C/D row height and every collapsed fixed⇄scroll row stays height-equal; §B2 Recommendation
// Summary copies Monthly Achievement's vertical CARD/TABLE geometry (150px row + 4px title gap + 3px/6px cells +
// 11px font), content top-aligned; §B3 the four top-row cards share ONE 150px baseline. Deterministic source/CSS
// scan (no live DOM). NO Apps Script / API / formula file is touched by this UI phase.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var CSS = read('css/pages/inventory-replenishment.css');
var JS = read('js/pages/inventory-replenishment.js');
var COMPONENTS = read('css/components.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function rule(css, sel) { var i = css.indexOf(sel); if (i < 0) return ''; var b = css.indexOf('{', i); var e = css.indexOf('}', b); return css.slice(b + 1, e); }

section('§B1 — scrollbar gutter reserved at the fixed COLUMN BOTTOM (not a per-row margin) → no next-SKU drift');
ok(/#ops-section \.fixed-body \{ padding-bottom: var\(--km-hscroll-gutter, 0px\);/.test(CSS), 'B1a the gutter is padding-bottom on .fixed-body (column bottom) → fixed usable height == scroll usable height');
ok(!/#ops-section \.replen-expand-panel--fixed \{ margin-bottom: var\(--km-hscroll-gutter/.test(CSS), 'B1b the R5G per-row margin-bottom on the expanded fixed panel is REMOVED (it shifted every following fixed row)');
ok(/function _irUpdateHScrollGutter_/.test(JS) && /offsetHeight\s*-\s*col\.clientHeight/.test(JS), 'B1c the gutter is still the live measured horizontal-scrollbar thickness (0 when none)');

section('§U1/U2/U3 — collapsed rows stay height-equal fixed⇄scroll; expand affects ONLY SKU A; collapse restores');
var fr = rule(CSS, '#ops-section .fixed-row');
ok(/height:\s*48px/.test(fr) && /flex:\s*0 0 48px/.test(fr), 'U1 collapsed .fixed-row is a rigid 48px (flex:0 0 48px — can never grow when SKU A expands)');
var srBase = rule(COMPONENTS, '.scroll-row');
var srPage = rule(CSS, '#ops-section .scroll-row');
ok(/height:\s*48px/.test(srBase) || /height:\s*48px/.test(srPage), 'U2 the corresponding .scroll-row is the SAME 48px → collapsed rows are height-equal on both sides');
ok(/existingFixedPanels\.forEach\(panel => panel\.remove\(\)\)/.test(JS) && /existingScrollPanels\.forEach\(panel => panel\.remove\(\)\)/.test(JS), 'U3 collapse removes both expand panels (exact geometry restored; only SKU A\u2019s detail was ever added)');
ok(!/#ops-section \.fixed-row[^{]*\{[^}]*min-height/.test(CSS) && !/#ops-section \.fixed-row[^{]*\{[^}]*margin/.test(CSS), 'U2b no arbitrary min-height/margin added to following rows to compensate (rows never enlarged)');

section('§B2/§U4 — Recommendation Summary copies Monthly Achievement vertical CARD/TABLE geometry');
var recCard = rule(CSS, '#ops-section .replen-card--recommendation-summary {');
ok(/min-height:\s*150px/.test(recCard), 'B2a summary card min-height 150px (same row height as Monthly Achievement)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-card__title \{ margin: 0 0 4px;/.test(CSS), 'B2b title\u2192table gap 4px (matches base card title + achv table margin-top:4px)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook \{[^}]*font-size:\s*11px/.test(CSS) && /#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook \{[^}]*margin-top:\s*4px/.test(CSS), 'B2c outlook table font-size 11px + margin-top 4px (parity with .replen-achv-table)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook th,\s*\n?#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook td \{ padding: 3px 6px;/.test(CSS), 'B2d outlook cells 3px 6px (parity with the Monthly Achievement 3px 6px cells)');
var achv = rule(CSS, '#ops-section .replen-achv-table {');
ok(/font-size:\s*11px/.test(achv) && /margin-top:\s*4px/.test(achv), 'U4 reference confirmed: .replen-achv-table is 11px font + 4px top gap (the geometry being copied)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-recsum-ws \{ padding: 0; margin: 0;[^}]*flex:\s*0 0 auto/.test(CSS), 'B2e the summary body wrapper adds no padding/margin and does not grow (compact, top-aligned)');

section('§B3/§U7/§U8/§U9 — four top-row cards share ONE 150px baseline; content top-aligned; no giant whitespace');
var topFloor = rule(CSS, '#ops-section .replen-card--stock,');
ok(/min-height:\s*150px/.test(topFloor), 'B3a Stock / LTS / Forecast / Sales Trend / Achievement share the 150px row floor');
ok(/min-height:\s*150px/.test(recCard), 'B3b Recommendation Summary joins the SAME 150px floor → all four top cards end at one baseline');
ok(/justify-content:\s*flex-start/.test(recCard), 'U8 the summary card body is TOP-aligned (justify-content:flex-start) — content never vertically centered/whitespace-distributed');
ok(!/#ops-section \.replen-card--recommendation-summary[^{]*\{[^}]*flex:\s*1\b/.test(CSS), 'U9 no flex-grow on the summary card → no artificial internal whitespace beyond the shared row height');

section('§U5/§U6 — fixed 4-row summary schema + cell-only patch preserved');
ok(/_IR_HORIZON_WINDOWS\s*=\s*\[\{ code: 'D18'[\s\S]*'D30'[\s\S]*'D45'[\s\S]*'D90'/.test(JS) && /data-ir-summary="1"/.test(JS), 'U5 the fixed 4-row (D18/D30/D45/D90) skeleton is preserved (table exists before data)');
ok(/function _irRecoPatchSummaryCells/.test(JS) && /setCell\('gap'[\s\S]*setCell\('suggested'[\s\S]*setCell\('note'/.test(JS), 'U6 data patches gap/suggested/note cells only (no rebuild)');

section('§U10/§U11/§U12 — horizontal scroll, gutter, active-row full width preserved');
ok(/#ops-section \.replen-expand-scroll \{[\s\S]*flex-wrap:\s*nowrap/.test(CSS) && !/#ops-section \.scroll-col \{[^}]*overflow-x:\s*hidden/.test(CSS), 'U10 horizontal scroll owned by the right .scroll-col preserved (groups stay one nowrap row)');
ok(/#ops-section \.scroll-body \{ width: max-content; min-width: 100%;/.test(CSS), 'U11 no phantom gutter strip (.scroll-body spans widest child, min 100%)');
ok(/\.scroll-row\.is-active-selected \.scroll-cell,\s*\n?#ops-section \.fixed-row\.is-active-selected \.replen-suggested-cell \{ background/.test(CSS), 'U12 active logical row paints full logical width (every scroll cell)');

section('§U13 — UI-only: this phase changes NO backend/formula/API behavior');
ok(!/fetch\(|recalculate|\.job\.start|gapJobStart|PropertiesService|SpreadsheetApp|KMHP|KMTPP|KMCALC|KMMSA|KMALLOC/.test((JS.split('function _irUpdateHScrollGutter_')[1] || '').slice(0, 900)), 'U13 the gutter/layout JS performs no calc / API / Apps Script call');

console.log('\n----------------------------------------');
console.log('INVENTORY EXPANDED CLOSURE (F1-4B-FM5-R4UI-R5H): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
