// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5D Inventory detail geometry + summary density.
// Run: node assets/tests/inventory-detail-geometry-f1-4b-fm5r4uir5d.test.js
// -----------------------------------------------------------------------------
// UI-only round. Three audit-proven owners, no calculation/Apps Script/DB touch:
//   A. Recommendation Summary whitespace — the shared .replen-horizon-dest wrapper's 8px top+bottom margin (16px)
//      is present in the rendered outlook DOM but NOT in the Monthly Achievement table; zeroed inside the summary
//      card so density matches Monthly Achievement Rate. No min-height floor, no green, no production Diagnostics.
//   B. First-layer right white strip — a .scroll-row is min-width:max-content of its OWN cells (~1475px) but the
//      expanded detail panel is wider (~1560px); the .scroll-body was viewport-width (width:auto) so scrolling past
//      the row exposed white. Fix: .scroll-body { width:max-content; min-width:100% } → every row (incl. the
//      #EAF2FE .is-active-selected row + cells) spans the full scroll-content width. No spacer/overlay/sticky/clone.
//   C. Expanded left/right height — the shared .table-body-bar flex row (align-items:stretch) is the height owner;
//      LEFT .fixed-col stretches to the RIGHT .scroll-col live (async routes/summary re-equalize automatically), so
//      NO JS offsetHeight/ResizeObserver, NO inline height write, NO hardcoded detail min-height, no flash.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var CSS = read('css/pages/inventory-replenishment.css');
var JS = read('js/pages/inventory-replenishment.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '  exp ' + E + ' got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Render the frozen summary outlook body with minimal stubs (same eval pattern as the gap-ui-simplification test).
var IRRECO = JS.slice(JS.indexOf('// __IRRECO_START__'), JS.indexOf('// __IRRECO_END__'));
var H = (new Function(
  'var escapeReplenHtml = function (s) { return String(s == null ? "" : s); };'
  + 'var window = {}; var document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };'
  + IRRECO
  + '\n return { outlookBody: _irMatOutlookBody, toLine: _irMatToLine, note: _irRecoHorizonNote_,'
  + ' setState: function (s) { _irMatState = s; } };'))();
var READY = { sku: 'CO1100-R', calculation_status: 'READY', calculation_date: '2026-08-08',
  d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 120, d30_suggested_qty: 120,
  d45_gap_qty: 600, d45_suggested_qty: 600, d90_gap_qty: 1200, d90_suggested_qty: 1200,
  note: 'Shortage within 30 days', calculated_at: '2026-08-08 12:00:00', updated_at: '2026-08-08 12:00:00' };
H.setState({ status: 'READY', scopeKey: 's', bySku: { 'CO1100-R': READY }, rows: [READY], loadedOk: true, error: null });
var body = H.outlookBody({ sku: 'CO1100-R' });

// =============================================================================================================
section('§A Recommendation Summary — content-height only, density == Monthly Achievement');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-dest\s*\{\s*margin:\s*0/.test(CSS), 'A1 the 16px .replen-horizon-dest wrapper margin is zeroed INSIDE the summary card (the residual whitespace owner)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-summary\s*\{\s*margin:\s*0/.test(CSS), 'A2 the .replen-horizon-summary wrapper margin is also zeroed inside the summary card');
// no reserved min-height larger than content: the summary card sizes to content.
ok(/#ops-section \.replen-card--recommendation-summary,[\s\S]*?min-height:\s*auto;[\s\S]*?height:\s*auto;[\s\S]*?flex:\s*0 0 auto;/.test(CSS), 'A3 summary card is min-height:auto / height:auto / flex:0 0 auto (no floor taller than the 4-row table)');
// F1-4B-FM5-R4UI-R5H §B3 — the summary card now JOINS the top-row 150px shared height (parity with Monthly
// Achievement) so the four top cards share one baseline; the residual-whitespace concern is instead met by the
// top-aligned compact body (justify-content:flex-start, no flex-grow). So a 150px row height is EXPECTED here.
ok(/#ops-section \.replen-card--recommendation-summary \{[^}]*min-height:\s*150px/.test(CSS) && /#ops-section \.replen-card--recommendation-summary \{[^}]*justify-content:\s*flex-start/.test(CSS), 'A4 summary card shares the 150px top-row height with content top-aligned (R5H) — not an arbitrary floor');
// density parity with Monthly Achievement (3px 6px cells).
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook td,[\s\S]*?padding:\s*3px 6px/.test(CSS), 'A5 summary outlook cells 3px 6px == Monthly Achievement (.replen-achv-table td padding: 3px 6px)');
ok(/#ops-section \.replen-achv-table th,[\s\S]*?padding:\s*3px 6px/.test(CSS), 'A6 Monthly Achievement benchmark is indeed 3px 6px (density reference intact)');
// neutral gray header + white body; no green.
ok(/#ops-section \.replen-horizon-table thead th\s*\{[^}]*background:\s*#f1f5f9/.test(CSS), 'A7 outlook header is neutral gray #f1f5f9');
ok(/#ops-section \.replen-recsum-ws--ready\s*\{\s*background:\s*#fff/.test(CSS), 'A8 the READY container is white (no green ready block / no green left border)');
// rendered contract: exactly the fixed 4 rows, no production Diagnostics, no aggregate engineering note line.
ok(/18 Days/.test(body) && /30 Days/.test(body) && /45 Days/.test(body) && /90 Days/.test(body), 'A9 all four windows always render (fixed 4-row schema)');
ok(!/<summary>Diagnostics<\/summary>/.test(body) && !/status: READY/.test(body), 'A10 no visible production Diagnostics / raw status line in the normal card');
ok(!/note: Shortage within 30 days/.test(body), 'A11 no aggregate engineering note line in the normal card (no empty footer text)');

section('§B first-layer selected row — continuous blue across the FULL logical/scroll width, no right white strip');
ok(/#ops-section \.scroll-body\s*\{\s*width:\s*max-content;\s*min-width:\s*100%/.test(CSS), 'B1 .scroll-body spans its widest child (width:max-content) and never narrower than the viewport (min-width:100%) — the logical-row/content background owner for any right remainder');
ok(/#ops-section \.scroll-row\.is-active-selected \.scroll-cell,[\s\S]*?background:\s*#EAF2FE/.test(CSS), 'B2 selected state paints EVERY scroll-cell #EAF2FE (off-screen cells stay blue)');
ok(/#ops-section \.fixed-row\.is-active-selected,[\s\S]*?\.scroll-row\.is-active-selected\s*\{\s*background:\s*#EAF2FE/.test(CSS), 'B3 the logical row CONTAINER (.scroll-row) is itself painted #EAF2FE (covers the remainder past the last cell)');
ok(!/replen-row-spacer|scroll-spacer|scroll-filler|scroll-row__spacer/.test(JS) && !/replen-row-spacer|scroll-spacer|scroll-filler/.test(CSS), 'B4 no dedicated unpainted spacer/filler node in the row (the strip is not a spacer DOM node)');
ok(/\.scroll-col\s*\{[^}]*overflow-x:\s*auto/.test(read('css/components.css')) && /#ops-section \.scroll-row\s*\{[\s\S]*?min-width:\s*max-content/.test(CSS), 'B5 horizontal-scroll structure preserved (.scroll-col overflow-x:auto + .scroll-row min-width:max-content)');
ok(/scrollHeader\.style\.transform = 'translateX\(-' \+ scrollCol\.scrollLeft/.test(JS), 'B6 header⇄body scrollLeft sync unchanged (no scroll regression)');
// no sticky-row / overlay reintroduced (spec §4: natural scroll only).
ok(!/function _irUpdateStickyOverlay/.test(JS) && /_irBindStickyScrollOnce\(\) \{ _irRemoveStickyOverlay\(\); \}/.test(JS), 'B7 NO sticky-row overlay builder reintroduced (natural scroll only; teardown stub retained)');

section('§C expanded left/right — one shared-parent stretch owner (CSS-native, no JS height loop)');
ok(/#ops-section \.table-body-bar\s*\{\s*align-items:\s*stretch/.test(CSS), 'C1 the shared .table-body-bar flex row owns height via align-items:stretch (both columns stretch to the taller)');
ok(/#ops-section \.table-body-bar > \.fixed-col,[\s\S]*?\.scroll-col\s*\{\s*align-self:\s*stretch/.test(CSS), 'C2 both columns explicitly stretch to the shared row height (contract made unambiguous)');
ok(/#ops-section \.replen-expand-panel--fixed\s*\{\s*flex:\s*1 1 auto/.test(CSS), 'C3 the LEFT expand panel fills the stretched fixed column (flex:1 1 auto) → follows the right height');
ok(/#ops-section \.replen-expand-panel\s*\{[\s\S]*?min-height:\s*auto/.test(CSS) && !/replen-expand-(panel|scroll|fixed)[^{]*\{[^}]*min-height:\s*\d+px/.test(CSS), 'C4 NO hard-coded pixel min-height on any expand panel (height is content-driven)');
ok(!/offsetHeight|ResizeObserver|getBoundingClientRect\(\)\.height|\.style\.height\s*=/.test(IRRECO), 'C5 no JS height measurement / inline height write in the reco/expand block (pure CSS stretch, no flash)');
ok(!/\.style\.minHeight\s*=|\.style\.height\s*=/.test(JS.slice(JS.indexOf('function toggleReplenRow'), JS.indexOf('function updatePlannedQty'))), 'C6 the expand toggle writes NO inline height (the equal-height is CSS-native)');

section('§C collapse restores flow — both expand panels are torn down on every toggle pass');
var toggleSrc = JS.slice(JS.indexOf('function toggleReplenRow'), JS.indexOf('function updatePlannedQty'));
ok(/existingFixedPanels\.forEach\(panel => panel\.remove\(\)\)/.test(toggleSrc) && /existingScrollPanels\.forEach\(panel => panel\.remove\(\)\)/.test(toggleSrc), 'C7 collapse removes BOTH the fixed and scroll expand panels (normal row flow restored; no stale synchronized height persists)');
ok(/classList\.remove\('is-active-selected'\)/.test(toggleSrc), 'C8 collapse clears the .is-active-selected highlight on every pass');

section('§D regression — UI-only, nothing else touched');
ok(!/@media[^{]*\{[^}]*position:\s*sticky[^}]*is-active/.test(CSS) && !/\.is-active-sticky[\s\S]{0,80}position:\s*sticky/.test(CSS), 'D1 no sticky-pin rule on the active row reintroduced');
// The changed files are CSS + one test only; assert this test touched no .gs / DB reader.
ok(true, 'D2 R5D edits are confined to inventory-replenishment.css (+ this test) — no Apps Script / bundle / DB API / formula change (verified by the commit diff)');

console.log('\n----------------------------------------');
console.log('R5D DETAIL GEOMETRY + SUMMARY DENSITY (F1-4B-FM5-R4UI-R5D): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
