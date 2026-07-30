// UI Runtime Small Repair Round 3 — Repair A: Inventory Replenishment Category TRUE reconstruction.
// SOURCE-CONTRACT tests (pure Node, DOM-relationship based — comments are stripped before structural
// assertions so a mention of a forbidden class in a comment can never pass/fail a check). They prove the
// single-compact-shell structure, independent replen-category-* class ownership, no expansion properties,
// the All(0) render path, and route-re-entry idempotency. They do NOT prove rendered pixels — Browser
// acceptance remains USER PENDING.
// Run: node assets/tests/category-bar-rebuild.test.js
'use strict';
var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function stripComments(s) { return s.replace(/<!--[\s\S]*?-->/g, ''); }

var htmlRaw = read('html/pages/inventory-replenishment.html');
var html = stripComments(htmlRaw);           // structural checks run on comment-free markup
var js = read('js/pages/inventory-replenishment.js');
var css = read('css/pages/inventory-replenishment.css');
var roHtml = stripComments(read('html/pages/request-order.html'));

console.log('\n-- A1: single compact shell + rail (2-layer), NOT the Round 2 panel→card→rail (3-layer) --');
ok((html.match(/id="replenCategoryPanel"/g) || []).length === 1, 'A1: exactly ONE #replenCategoryPanel');
ok((html.match(/id="replenCategoryTabs"/g) || []).length === 1, 'A2: exactly ONE #replenCategoryTabs');
// Rail is the DIRECT (and only) child of the shell — a single 2-layer nest.
var shellRe = /<div class="replen-category-shell" id="replenCategoryPanel">\s*<div class="replen-category-rail" id="replenCategoryTabs"><\/div>\s*<\/div>/;
ok(shellRe.test(html), 'A3: shell → rail is a single 2-layer nest (rail is the shell\'s direct child)');
ok(!/replen-category-panel/.test(html) && !/replen-category-card/.test(html) && !/replen-category-tabs/.test(html),
   'A4: Round 2 three-layer classes (panel/card/tabs) fully removed from markup');
ok(!/\.replen-category-panel\s*>\s*\.replen-category-card/.test(css),
   'A5: no `.replen-category-panel > .replen-category-card` rule survives in CSS');

console.log('\n-- A6: independent class ownership — no ro-* / km-category-card / km-tab-rail on Inventory --');
ok(!/\bkm-category-card\b/.test(html), 'A6: markup uses NO km-category-card (comments stripped)');
ok(!/\bkm-category-card__rail\b/.test(html) && !/\bkm-tab-rail\b/.test(html), 'A7: markup uses NO km-category-card__rail / km-tab-rail');
ok(!/class="[^"]*\bro-(panel|header|tabs)[^"]*"/.test(html), 'A8: markup uses NO ro-panel / ro-header / ro-tabs classes');
// The JS rail-tab markup emits Inventory's OWN classes, not the shared km-tab-rail__* ones.
ok(/class="replen-category-rail__tab/.test(js) && !/class="km-tab-rail__tab/.test(js),
   'A9: renderReplenCategoryTabs emits replen-category-rail__tab (not km-tab-rail__tab)');
ok(/replen-category-rail__count/.test(js) && /replen-category-rail__label/.test(js), 'A10: own __label / __count chip classes');

console.log('\n-- A11: Order Planning reference is a SINGLE element with several classes (not 3 nested divs) --');
ok(/class="ro-panel ro-header km-category-card"/.test(roHtml), 'A11: Order Planning outer = one element, classes ro-panel ro-header km-category-card');

console.log('\n-- A12: shell is a SIBLING of the table, never wraps results/table/list --');
var idxShellClose = html.indexOf('id="replenCategoryTabs"');
var idxTable = html.indexOf('dual-layer-table');
ok(idxShellClose !== -1 && idxTable !== -1 && idxTable > idxShellClose, 'A12: dual-layer-table appears AFTER the category shell (sibling, not child)');
// The exact-match shellRe already proves the shell contains ONLY the empty rail (no table/list inside).
ok(shellRe.test(html) && !/replen-category-shell[\s\S]*?dual-layer-table[\s\S]*?replen-category-rail/.test(html),
   'A13: category shell does not contain the results/table/list container');

console.log('\n-- A14: no expansion — shell/rail carry no height / min-height / flex-grow --');
function cssBlock(sel) {
  var i = css.indexOf(sel);
  if (i === -1) return '';
  var open = css.indexOf('{', i), close = css.indexOf('}', open);
  return css.slice(open, close);
}
var shellCss = cssBlock('#ops-section .replen-category-shell');
ok(/background:\s*#fff/i.test(shellCss), 'A14: single compact shell carries the ONE white surface (background:#fff)');
ok(!/height\s*:/.test(shellCss) && !/min-height\s*:/.test(shellCss) && !/flex\s*:\s*1/.test(shellCss),
   'A15: shell has NO height / min-height / flex:1 (cannot expand into a large white region)');
var railCss = cssBlock('#ops-section .replen-category-rail ');
ok(!/background:\s*#fff/i.test(railCss), 'A16: rail is NOT a second white card (bordered frame, no white fill)');
ok(!/z-index:\s*9{4,}/.test(shellCss), 'A17: no arbitrary huge z-index hack on the shell');

console.log('\n-- A18: no inline display:none empty-gate --');
ok(!/id="replenCategoryTabs"[^>]*style="[^"]*display:\s*none|style="[^"]*display:\s*none"[^>]*id="replenCategoryTabs"/.test(htmlRaw),
   'A18: #replenCategoryTabs carries NO inline display:none in raw markup');
ok(!/bar\.style\.display\s*=\s*'none'/.test(js) && !/bar\.style\.display\s*=\s*"none"/.test(js),
   'A19: render never sets bar.style.display = none');
ok(/bar\.style\.display\s*=\s*''/.test(js), 'A20: render actively clears any stale inline display');

console.log('\n-- A21: empty dataset still renders All (0); counts computed BEFORE the category filter --');
ok(/var rows = allData \|\| \[\]/.test(js), 'A21: empty allData normalized to [] (no early hide-return)');
ok(/name:\s*'All',\s*count:\s*rows\.length/.test(js), 'A22: All tab count = rows.length (0 when empty → All (0))');
ok(js.indexOf('renderReplenCategoryTabs(allData)') !== -1 &&
   js.indexOf('renderReplenCategoryTabs(allData)') < js.indexOf('const data = (replenCategoryTab'),
   'A23: category render runs BEFORE the category filter (counts are upstream-scoped)');

console.log('\n-- A24: category source is DB-driven (not hardcoded); active-invalid resets to All --');
ok(/_replenCategoryOf\(it\)/.test(js) && /rows\.forEach\(function \(it\) \{[\s\S]*?categoryList\.push\(c\)/.test(js),
   'A24: categories derived from the row data (item.category), not a hardcoded list');
ok(/if \(replenCategoryTab !== 'All' && categoryList\.indexOf\(replenCategoryTab\) === -1\) replenCategoryTab = 'All'/.test(js),
   'A25: active category no longer present → safely reset to All');

console.log('\n-- A26: selection + route re-entry idempotency --');
ok(/function setReplenCategoryTab\(category\)\s*\{[\s\S]*?replenCategoryTab = category;[\s\S]*?renderReplenishment\(\);/.test(js),
   'A26: clicking a category sets replenCategoryTab and re-renders rows');
ok(/onclick="setReplenCategoryTab/.test(js) && !/getElementById\('replenCategoryTabs'\)\.addEventListener/.test(js),
   'A27: tab clicks via rebuilt inline onclick (no accumulating rail listeners across re-entry)');
ok(/bar\.innerHTML = tabs\.map/.test(js), 'A28: rail is rebuilt via innerHTML each render (no duplicate DOM on re-entry)');

console.log('\n-- A29: render is decoupled from the table-body guard (rail renders on empty/loading/remount) --');
// renderReplenCategoryTabs(allData) must be called BEFORE the `if (!fixedBody || !scrollBody) return;`
// guard, so the shell is never left empty when the table body is absent/late.
// Both markers are unique to renderReplenishment; compare their positions in source order.
var iCatRender = js.indexOf('renderReplenCategoryTabs(allData)');
var iGuard = js.indexOf('if (!fixedBody || !scrollBody) return;');
ok(iCatRender !== -1 && iGuard !== -1 && iCatRender < iGuard,
   'A29: renderReplenCategoryTabs runs BEFORE the table-body early-return guard');

console.log('\n-- A30: category shell is sticky at the canonical offset (no magic-number top) --');
ok(/position:\s*sticky/.test(shellCss), 'A30: shell is position:sticky');
ok(/top:\s*var\(--km-sticky-top-base/.test(shellCss), 'A31: shell pins at var(--km-sticky-top-base) (canonical offset, not a magic number)');
ok(/z-index:\s*var\(--km-sticky-z-cat-rail/.test(shellCss), 'A32: shell z-index uses the shared --km-sticky-z-cat-rail token');
var headerCss = cssBlock('#ops-section .table-header-bar');
ok(/top:\s*calc\(var\(--km-sticky-top-base[^)]*\)\s*\+\s*var\(--km-replen-cat-rail-h/.test(headerCss),
   'A33: table header pins BELOW the rail via calc(base + --km-replen-cat-rail-h) — rail never covered');
ok(/setProperty\('--km-replen-cat-rail-h'/.test(js), 'A34: JS sets --km-replen-cat-rail-h from the live rail height (derived, not hardcoded)');
ok(!/position:\s*fixed/.test(shellCss), 'A35: shell uses sticky, NOT position:fixed');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS') + ' (' + pass + ' assertions)');
process.exit(fail ? 1 : 0);
