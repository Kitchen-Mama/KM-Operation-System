// Kitchen Mama Operation System — Inventory expanded layout FINAL closure (F1-4B-FM5-R4UI-R5G).
// Run: node assets/tests/inventory-expanded-closure-f1-4b-fm5r4uir5g.test.js
// -----------------------------------------------------------------------------
// UI-only closure for the Inventory expanded SKU layout (§1 left/right bottom-baseline parity accounting for the
// horizontal scrollbar; §2 Recommendation Summary natural compact height; §3 no fixed/scroll gutter regression;
// §4 active logical-row full width; §5 fixed 4-row summary schema preserved). Deterministic source/CSS-rule scan
// (no live DOM). Proves the SHARED height owner, the explicit scrollbar accounting, and that NO Apps Script / API /
// formula file is touched by this round.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var CSS = read('css/pages/inventory-replenishment.css');
var JS = read('js/pages/inventory-replenishment.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function ruleBody(sel) { var i = CSS.indexOf(sel); if (i < 0) return ''; var b = CSS.indexOf('{', i); var e = CSS.indexOf('}', b); return CSS.slice(b + 1, e); }
// the scoped #ops-section .fixed-col base rule (the geometry owner), not the .fixed-header
function fixedColBase() { var i = CSS.indexOf('#ops-section .fixed-col {'); if (i < 0) return ''; var b = CSS.indexOf('{', i); var e = CSS.indexOf('}', b); return CSS.slice(b + 1, e); }

section('A — ONE shared final-height owner (the stretch flex row), not per-side measurement');
ok(/#ops-section \.table-body-bar \{[^}]*align-items:\s*stretch/.test(CSS), 'A1 .table-body-bar { align-items: stretch } is the shared height owner');
ok(/#ops-section \.table-body-bar > \.fixed-col,\s*\n?#ops-section \.table-body-bar > \.scroll-col \{ align-self: stretch;/.test(CSS), 'A2 both columns explicitly align-self:stretch to the shared row');
ok(/#ops-section \.replen-expand-panel--fixed \{ flex: 1 1 auto;/.test(CSS), 'A3 the LEFT expand panel fills the stretched column (flex:1 1 auto) — carries the shared height to the SKU identity block');
ok(!/offsetHeight[\s\S]{0,40}\.style\.height|\.style\.height\s*=|ResizeObserver\([\s\S]{0,80}height/.test(JS), 'A4 NO JS height sync / inline height write (CSS owns the stretch; JS never sets a panel height)');

section('§1/B — the horizontal SCROLLBAR is accounted for explicitly at the correct owner');
ok(/#ops-section \.fixed-body \{ padding-bottom: var\(--km-hscroll-gutter, 0px\);/.test(CSS), 'B1 the scrollbar-height gutter (var --km-hscroll-gutter) is reserved at the fixed COLUMN bottom (R5H §B1: .fixed-body padding-bottom, not a per-row margin)');
ok(/function _irUpdateHScrollGutter_\(\)/.test(JS) && /offsetHeight\s*-\s*col\.clientHeight/.test(JS), 'B2 the gutter = live horizontal scrollbar thickness (offsetHeight − clientHeight, overflow-y hidden → h-scrollbar only)');
ok(/setProperty\('--km-hscroll-gutter', gutter \+ 'px'\)/.test(JS), 'B3 the measured thickness is written to the --km-hscroll-gutter CSS variable');
ok(/var gutter = col \? Math\.max\(0, col\.offsetHeight - col\.clientHeight\) : 0;/.test(JS), 'B4 defaults to 0 when there is no scroll column / no scrollbar (overlay/macOS safe → identical to pure stretch)');
ok(/addEventListener\('resize', function \(\) \{ _irUpdateHScrollGutter_\(\); \}\)/.test(JS) && !/setInterval\s*\(/.test(JS), 'B5 measurement is EVENT-DRIVEN (resize) — never polling (no setInterval)');
ok(/initSalesTrendChart\(sku, skuData\);\s*\n\s*if \(typeof _irUpdateHScrollGutter_ === 'function'\) _irUpdateHScrollGutter_\(\);/.test(JS), 'B6 the gutter is refreshed after async expand content settles (post-render tick)');
ok(/_irBindHScrollGutterResizeOnce_\(\);\s*\n\s*if \(typeof _irUpdateHScrollGutter_ === 'function'\) _irUpdateHScrollGutter_\(\);/.test(JS), 'B7 mount binds the resize listener once + seeds an initial measurement');

section('C — collapse restores normal flow (no lingering panels / classes / inline height)');
ok(/existingFixedPanels\.forEach\(panel => panel\.remove\(\)\);/.test(JS) && /existingScrollPanels\.forEach\(panel => panel\.remove\(\)\);/.test(JS), 'C1 collapse removes BOTH sides\u2019 expand panels');
ok(/remove\('expanded'\)[\s\S]{0,120}remove\('is-active-selected'\)/.test(JS), 'C2 collapse clears expanded + active-selected on every pass (normal flow restored)');
ok(!/\.replen-expand-panel--fixed\s*\{[^}]*height:\s*\d+px/.test(CSS), 'C3 the fixed panel has NO hardcoded pixel height to leave stale on collapse (only margin-bottom var + flex)');

section('§2/D — Recommendation Summary: natural compact height (no min-height floor, no flex-grow)');
var recCard = ruleBody('#ops-section .replen-card--recommendation-summary {');
ok(/flex:\s*0 0 auto/.test(recCard) && /min-height:\s*150px/.test(recCard) && /justify-content:\s*flex-start/.test(recCard), 'D1 (R5H) summary card joins the 150px top-row height, no grow, content top-aligned (justify-content:flex-start)');
var topFloor = ruleBody('#ops-section .replen-card--stock,');
ok(/min-height:\s*150px/.test(topFloor), 'D2 the top-row cards share the 150px row height (R5H: Recommendation Summary now joins it → four cards, one baseline)');
ok(!/\.replen-card--recommendation-summary[^{]*\{[^}]*flex:\s*1\b/.test(CSS), 'D3 no flex-grow on the summary card (outer height may reach the row floor; content never distributes whitespace)');

section('§2/E — title/table spacing matches the compact Monthly Achievement reference');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-recsum-ws \{ padding: 0; margin: 0; line-height: 1\.3;/.test(CSS), 'E1 the summary state-wrapper has zero padding/margin + compact line-height (removes top/bottom whitespace)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-summary,\s*\n?#ops-section \.replen-card--recommendation-summary \.replen-horizon-dest \{ margin: 0;/.test(CSS), 'E2 summary/dest wrappers carry no margin inside the card');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-card__title \{ margin: 0 0 4px;/.test(CSS), 'E3 title→table gap = 4px (parity with the Monthly Achievement table margin-top:4px)');
ok(/#ops-section \.replen-achv-table \{[^}]*margin-top:\s*4px/.test(CSS), 'E4 reference: Monthly Achievement table title→table gap is 4px');

section('§5/F — fixed 4-row Recommendation Summary schema preserved (table exists before data)');
ok(/_IR_HORIZON_WINDOWS\s*=\s*\[\{ code: 'D18'[\s\S]*'D30'[\s\S]*'D45'[\s\S]*'D90'/.test(JS), 'F1 the four permanent windows (D18/D30/D45/D90) are always mapped');
ok(/function placeholderLine\(note\) \{[\s\S]*_IR_HORIZON_WINDOWS\.map/.test(JS), 'F2 every load state renders the SAME fixed 4-row skeleton (placeholderLine maps all windows) — table exists before data');
ok(/data-ir-summary="1"/.test(JS), 'F3 the outlook table carries the stable data-ir-summary skeleton marker');

section('G — only cell text is patched on data (structure never rebuilt)');
ok(/function _irRecoPatchSummaryCells/.test(JS) && /if \(_irRecoPatchSummaryCells\(card, skuData\)\) return;/.test(JS), 'G1 a materialized refetch PATCHES cells in place (returns true → skips rebuild)');
ok(/setCell\('gap'[\s\S]*setCell\('suggested'[\s\S]*setCell\('note'/.test(JS), 'G2 patching sets only the gap/suggested/note cell text');

section('§3/H — no fixed/scroll gutter regression (no phantom strip, no independent fixed scrollbar)');
ok(/#ops-section \.scroll-body \{ width: max-content; min-width: 100%;/.test(CSS), 'H1 .scroll-body spans its widest child + never narrower than the viewport (no unpainted strip)');
var fc = fixedColBase();
ok(!/overflow-x:\s*(auto|scroll)/.test(fc) && !/overflow-y:\s*(auto|scroll)/.test(fc), 'H2 the sticky .fixed-col owns NO independent scrollbar (overflow stays visible → no reserved gutter strip)');

section('§I — horizontal scroll remains owned by the right scroll container');
ok(/#ops-section \.replen-expand-scroll \{[\s\S]*flex-wrap:\s*nowrap/.test(CSS), 'I1 the expanded groups stay one non-wrapping row (the main .scroll-col provides the single horizontal scroll)');
ok(!/#ops-section \.scroll-col \{[^}]*overflow-x:\s*hidden/.test(CSS), 'I2 the page does not disable the right column horizontal scroll (base overflow-x:auto preserved)');

section('§4/J — active logical row background covers the FULL logical width (incl. off-screen cells)');
ok(/\.scroll-row\.is-active-selected \.scroll-cell,\s*\n?#ops-section \.fixed-row\.is-active-selected \.replen-suggested-cell \{ background/.test(CSS), 'J1 the active row paints every scroll cell (+ fixed suggested cell) — continuous under horizontal scroll');
ok(/#ops-section \.scroll-body \{ width: max-content; min-width: 100%;/.test(CSS), 'J2 the row box spans the full scroll-content width (no viewport-sized background hack)');

section('§K — UI-only: NO Apps Script / API / formula owner touched by this round');
ok(!/KMHP|KMTPP|KMCALC|KMMSA|KMALLOC|KMQI|KMPD/.test('function _irUpdateHScrollGutter_' + (JS.split('function _irUpdateHScrollGutter_')[1] || '').slice(0, 900)), 'K1 the new gutter code invokes NO formula owner');
ok(!/fetch\(|recalculate|\.job\.start|gapJobStart|PropertiesService|SpreadsheetApp/.test((JS.split('function _irUpdateHScrollGutter_')[1] || '').slice(0, 900)), 'K2 the new gutter code performs NO calculation / API / Apps Script call (pure layout metric)');

console.log('\n----------------------------------------');
console.log('INVENTORY EXPANDED CLOSURE (F1-4B-FM5-R4UI-R5G): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
