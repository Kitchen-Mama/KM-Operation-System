// Kitchen Mama Operation System — Inventory compact UI + sticky active row (F1-4B-FM5-R4UI-R3).
// Run: node assets/tests/inventory-ui-compaction-f1-4b-fm5r4uir3.test.js
// -----------------------------------------------------------------------------
// Deterministic structure checks for the Inventory above-the-fold density work: Target Days removed from the normal
// UI (internal constant retained for the legacy snapshot), page-scoped compaction of the filter/category/table-header,
// and the sticky active-expanded master SKU row (real row, class-toggled). No formula/DB change. Global header
// compaction is intentionally HALTED (shared owner) — asserted NOT touched by this page's CSS.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var HTML = read('html/pages/inventory-replenishment.html');
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var LAYOUT = read('css/layout.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

section('§9 Target Days removed from the normal UI (internal constant retained)');
ok(!/id="replenTargetDays"/.test(HTML), 'P1 no visible Target Days control in the Inventory HTML');
ok(!/<label>\s*Target Days\s*<\/label>/.test(HTML), 'P2 no "Target Days" label in the filter bar');
ok(/var REPLEN_TARGET_DAYS = 90;/.test(JS), 'P3 internal REPLEN_TARGET_DAYS = 90 constant preserved (legacy snapshot consumer)');
ok(/_tdEl \? _tdEl\.value : REPLEN_TARGET_DAYS/.test(JS), 'P4 Submit-Plan reads the constant when the (removed) control is absent — never throws on a null element');
ok(/getElementById\('replenTargetDays'\) \|\| \{\}\)\.value \|\| REPLEN_TARGET_DAYS/.test(JS), 'P5 allocation-draft target-days falls back to the constant');
ok(!/document\.getElementById\('replenTargetDays'\)\.value/.test(JS), 'P6 no un-guarded .value read on the removed control remains');

section('§10 filter bar — compact + content-width LTS');
ok(/filter-group--lts/.test(HTML), 'Q1 LTS filter group carries the content-width modifier class');
ok(/\.filter-group--lts\s*\{[^}]*flex:\s*0 0 auto/.test(CSS), 'Q2 LTS group is content-width (flex:0 0 auto), not the fixed 160px group');
ok(/#ops-section \.replen-control-panel\s*\{[^}]*padding:\s*10px 16px/.test(CSS), 'Q3 control panel vertical padding reduced (16px→10px)');

section('§11 category strip — reduced vertical padding, behaviour preserved');
ok(/#ops-section \.replen-category-shell\s*\{\s*padding:\s*8px 14px/.test(CSS), 'Q4 category shell padding reduced (16px 20px → 8px 14px)');
ok(/#ops-section \.replen-category-rail\s*\{[^}]*padding:\s*4px/.test(CSS), 'Q5 category rail padding reduced (6px→4px)');
ok(/overflow-x:\s*auto/.test(CSS), 'Q6 horizontal scroll on the rail preserved (containment unchanged)');

section('§12 two-level table header — compacted via the shared sticky tokens (geometry stays aligned)');
ok(/#ops-section\s*\{[^}]*--km-sticky-row-1-height:\s*34px[^}]*--km-sticky-row-2-height:\s*34px/.test(CSS.replace(/\n/g, '')), 'Q7 header row heights reduced to 34px each (96px→68px total) — page-scoped token override');
ok(/km-table__header-cell--note-span[\s\S]*?height:\s*var\(--km-sticky-header-total/.test(CSS), 'Q8 the note-span corner cell now uses the total token (was a hardcoded 96px) so it stays aligned after compaction');
ok(/Inventory \/ Sales \/ Replenishment/.test(CSS) || /header-cell--inventory/.test(CSS), 'Q9 two-level group semantics retained (group cells still present)');

section('§13 sticky active expanded master SKU row (real row, class-toggled)');
ok(/\.fixed-row\.is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS), 'R1 active fixed master row is position:sticky');
ok(/\.scroll-row\.is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS), 'R2 active scroll master row is position:sticky');
ok(/is-active-sticky[\s\S]*?top:\s*calc\([\s\S]*?--km-sticky-header-total/.test(CSS), 'R3 sticky top offset includes the header total → row pins BELOW the two-level header (never covers it)');
ok(/is-active-sticky[\s\S]*?z-index:\s*calc\(var\(--km-sticky-z-col/.test(CSS), 'R4 sticky row z sits just above the row/left-column layer, below the header rows');
ok(/fixedRow\.classList\.add\('is-active-sticky'\)/.test(JS) && /scrollRow\.classList\.add\('is-active-sticky'\)/.test(JS), 'R5 both real rows get the sticky class on expand (no detached clone)');
ok(/classList\.remove\('is-active-sticky'\)/.test(JS), 'R6 collapse pass removes the sticky class from every row (only the active row is ever sticky)');

section('§16 overflow containment preserved (no outer-container overflow)');
ok(/\.replen-horizon-tablewrap\s*\{[^}]*overflow-x:\s*auto/.test(CSS), 'S1 Recommendation Summary table wrapped in an internal-scroll container (card cannot widen)');
ok(/\.replen-horizon-table--outlook\s*\{[^}]*table-layout:\s*fixed/.test(CSS), 'S2 fixed table layout retained (data-independent widths)');

section('§14 global header compaction HALTED — the shared owner is NOT touched by this page');
ok(/\.top-header/.test(LAYOUT) && /--header-height/.test(read('css/base.css')), 'H1 the shared header owner exists (layout.css .top-header + base.css --header-height)');
ok(!/top-header/.test(CSS) && !/--header-height/.test(CSS), 'H2 the Inventory page CSS does NOT override the shared header (HALT respected — no cross-page ripple)');

console.log('\n----------------------------------------');
console.log('INVENTORY UI COMPACTION (F1-4B-FM5-R4UI-R3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
