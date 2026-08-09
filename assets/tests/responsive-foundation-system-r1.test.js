// Kitchen Mama Operation System — SYSTEM-RESPONSIVE-R1 responsive foundation (structural authority tests).
// Run: node assets/tests/responsive-foundation-system-r1.test.js
// -----------------------------------------------------------------------------
// Foundation-only round: CSS tokens + safe guards + opt-in utilities + a frozen doc. These tests prove the ONE
// breakpoint authority, the shared containment/overflow/fixed-column/card/filter contracts, and that NO business
// logic / DB / API / scheduler dependency was introduced. No visual PASS is claimed here (screenshots = USER_VERIFY).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function readRoot(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }
var FND = read('css/responsive-foundation.css');
var BASE = read('css/base.css');
var LAYOUT = read('css/layout.css');
var COMPONENTS = read('css/components.css');
var INVCSS = read('css/pages/inventory-replenishment.css');
var ROCSS = read('css/pages/request-order.css');
var DOC = read('../docs/design/RESPONSIVE_FOUNDATION.md');
var INDEX = readRoot('index.html');

// Every page CSS file (to prove the breakpoint tokens are defined in exactly ONE place).
var pageCssDir = path.join(__dirname, '..', 'css');
function allCss(dir) {
  var out = [];
  fs.readdirSync(dir).forEach(function (n) {
    var p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) out = out.concat(allCss(p));
    else if (/\.css$/.test(n)) out.push(p);
  });
  return out;
}

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =============================================================================================================
section('A — ONE breakpoint authority (tokens defined once; frozen in the doc)');
ok(/--km-bp-tablet:\s*1024px/.test(FND) && /--km-bp-compact:\s*1280px/.test(FND) && /--km-bp-laptop:\s*1440px/.test(FND) && /--km-bp-desktop:\s*1680px/.test(FND) && /--km-bp-xl:\s*1920px/.test(FND), 'A1 the five semantic breakpoint tiers are defined in responsive-foundation.css');
var bpDefiners = allCss(pageCssDir).filter(function (p) { return /--km-bp-(tablet|compact|laptop|desktop|xl)\s*:/.test(fs.readFileSync(p, 'utf8')); });
ok(bpDefiners.length === 1 && /responsive-foundation\.css$/.test(bpDefiners[0]), 'A2 the breakpoint tokens are DEFINED in exactly one file (no per-page re-invention) — got ' + bpDefiners.map(function (p) { return path.basename(p); }).join(','));
ok(/Tablet\s*\|\s*`max-width:1024`/.test(DOC) && /Compact\s*\|\s*`max-width:1280`/.test(DOC) && /XL\s*\|\s*`≥ 1681`/.test(DOC), 'A3 the doc freezes the same five tiers');

section('B — shared content containment');
ok(/\.module-section\s*\{\s*min-width:\s*0/.test(FND), 'B1 .module-section can shrink (min-width:0) → no forced page overflow');
ok(/\.km-content-constrained\s*\{[^}]*max-width:\s*var\(--km-content-max\)/.test(FND), 'B2 opt-in .km-content-constrained caps form/dashboard width at --km-content-max');
ok(/--km-content-max:\s*1680px/.test(FND), 'B3 --km-content-max token present');

section('C — intentional table horizontal scroll (scroller owns overflow, not the page)');
ok(/\.km-table-scroll\s*\{[^}]*overflow-x:\s*auto/.test(FND), 'C1 .km-table-scroll owns horizontal overflow');
ok(/\.dual-layer-table\s*\{[\s\S]*?max-width:\s*100%/.test(COMPONENTS) && /\.scroll-col\s*\{[\s\S]*?overflow-x:\s*auto/.test(COMPONENTS), 'C2 the shared dual-layer table + .scroll-col scroller are preserved (proven owners)');
ok(/overflow-x:\s*auto/.test(ROCSS), 'C3 Order Planning wide table keeps an internal horizontal scroller');

section('D — numeric nowrap');
ok(/\.km-num\s*\{[^}]*white-space:\s*nowrap[^}]*\}/.test(FND) && /\.km-num\s*\{[^}]*tabular-nums/.test(FND), 'D1 .km-num never wraps mid-number (tabular figures)');

section('E — long text wraps');
ok(/\.km-wrap\s*\{[^}]*overflow-wrap:\s*anywhere/.test(FND), 'E1 .km-wrap wraps long text inside its cell');

section('F — fixed-column alignment contract (documented + owners intact)');
ok(/#ops-section \.scroll-body\s*\{\s*width:\s*max-content/.test(INVCSS), 'F1 the fixed/scroll contract: .scroll-body spans max-content (row background continuous, no white gutter)');
ok(/#ops-section \.table-body-bar\s*\{\s*align-items:\s*stretch/.test(INVCSS), 'F2 .table-body-bar shared-height owner (fixed + scroll layers stay aligned)');
ok(/Fixed first column \+ scroll columns/.test(DOC) && /width:max-content/.test(DOC), 'F3 the doc freezes the fixed-column rule');

section('G — grouped 2-row header containment');
ok(/\.dual-layer-table\s*\{[\s\S]*?max-width:\s*100%/.test(COMPONENTS) && /min-width:\s*max-content/.test(COMPONENTS), 'G1 grouped-header dual-layer table stays contained (max-width:100% + scroll-header max-content)');

section('H — filter / action controlled wrapping (never overlap)');
ok(/\.km-responsive-bar\s*\{[^}]*flex-wrap:\s*wrap/.test(FND) && /\.km-action-bar\s*\{[^}]*flex-wrap:\s*wrap/.test(FND), 'H1 canonical filter/action bars wrap (flex-wrap:wrap)');

section('I — no page-level overflow rule conflict');
ok(/\.main-content\s*\{[\s\S]*?overflow-x:\s*hidden/.test(LAYOUT), 'I1 the single page-level guard .main-content{overflow-x:hidden} is intact (layout.css owns it)');
ok(/body\s*\{[\s\S]*?overflow:\s*hidden/.test(BASE), 'I2 body{overflow:hidden} fixed-shell guard intact');
ok(!/\.main-content\s*\{[^}]*overflow-x:\s*(auto|scroll)/.test(FND) && !/\bbody\s*\{[^}]*overflow/.test(FND), 'I3 the foundation NEVER reintroduces a page-level horizontal scroller on body/.main-content');

section('J — Inventory expanded-detail containment (no reopening the sticky-row redesign)');
ok(/#ops-section \.replen-expand-scroll\s*\{[\s\S]*?overflow:\s*visible/.test(INVCSS), 'J1 expanded detail scrolls with the main table (no nested scrollbar; overflow:visible)');
ok(/#ops-section \.scroll-row\.is-active-selected \.scroll-cell,/.test(INVCSS), 'J2 the off-screen logical-row selected background is preserved');
ok(!/is-active-sticky[\s\S]{0,80}position:\s*sticky/.test(INVCSS), 'J3 the deferred sticky-row redesign is NOT reopened');

section('K — Order Planning wide-table containment');
ok(/\.ro-table-wrapper\s*\{/.test(ROCSS) && /overflow-x:\s*auto/.test(ROCSS), 'K1 OP uses a contained wide-table wrapper with an internal scroller');
ok(/\.ro-table \.scroll-header/.test(ROCSS) && /\.ro-table \.fixed-header/.test(ROCSS), 'K2 OP reuses the shared dual-layer fixed/scroll structure (one contract)');

section('L — future extra-column safe (content-driven, not a fixed column count)');
ok(/--km-table-min-col:\s*96px/.test(FND) && /\.km-table-min\s*\{[^}]*min-width:\s*var\(--km-min-safe-width\)/.test(FND), 'L1 min-column + min-safe-width tokens (add a column without redesign)');
ok(/Future columns/.test(DOC) && /must not require a page redesign/i.test(DOC), 'L2 the doc freezes the future-column rule');

section('M — shared header/sidebar offsets remain aligned (single --header-height owner)');
ok(/--header-height:\s*56px/.test(BASE), 'M1 --header-height is the single offset owner (base.css)');
ok(/\.top-header\s*\{[\s\S]*?min-height:\s*var\(--header-height\)/.test(LAYOUT) && /\.app-layout\s*\{[\s\S]*?margin-top:\s*var\(--header-height\)/.test(LAYOUT), 'M2 header height + app-layout offset both derive from the one token');
ok(/\.sidebar\s*\{[\s\S]*?top:\s*var\(--header-height\)[\s\S]*?height:\s*calc\(100vh - var\(--header-height\)\)/.test(LAYOUT) && /\.main-content\s*\{[\s\S]*?height:\s*calc\(100vh - var\(--header-height\)\)/.test(LAYOUT), 'M3 sidebar + main-content viewport heights derive from the same token (no drift/overlap)');
ok(/index\.html/.test('index.html') && /responsive-foundation\.css/.test(INDEX), 'M4 the foundation stylesheet is loaded by index.html');

section('N — no business logic / formula modified by this round');
ok(!/function\b/.test(FND) && !/\bfetch\b|KM\.DB|action\s*[:=]/.test(FND), 'N1 responsive-foundation.css is pure CSS — no JS/formula/handler');
ok(/RESPONSIVE FOUNDATION/.test(FND) && /docs\/design\/RESPONSIVE_FOUNDATION\.md/.test(FND), 'N2 the foundation references its single authority doc');

section('O — no DB / API / scheduler dependency introduced');
ok(!/inventoryReplenishmentGap|automationSchedule|recommendation\.workspace|orderPlanningGap|\/exec|script\.google/.test(FND), 'O1 the foundation names no API action / endpoint / scheduler');
ok(!/getOperationDb|SpreadsheetApp|PropertiesService/.test(FND), 'O2 the foundation touches no DB / Script service');

console.log('\n----------------------------------------');
console.log('RESPONSIVE FOUNDATION (SYSTEM-RESPONSIVE-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
