// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R5E Inventory expanded-row structural layout repair.
// Run: node assets/tests/inventory-expanded-structure-f1-4b-fm5r4uir5e.test.js
// -----------------------------------------------------------------------------
// UI STRUCTURE / CSS only (no formula/DB/materialization/API/Apps Script change). Three fixes:
//   §1 Recommendation Summary is a TRUE fixed schema — the 4-row table exists from expand in EVERY load state;
//      loading/not-calculated/error/READY/BLOCKED only PATCH cells (stable DOM identities), never rebuild.
//   §3 left/right expanded-detail height parity owned by .table-body-bar{align-items:stretch} (no JS pixel sync).
//   §4 the SKU fixed-column right white/green gutter is removed AT SOURCE (the phantom scrollbar-gutter / per-column
//      overflow on .fixed-col + .scroll-col is gone; the page owns vertical scroll, .scroll-col owns horizontal).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var COMPONENTS = read('css/components.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Eval the IRRECO block with minimal stubs (same pattern as the gap-ui-simplification test).
var IRRECO = JS.slice(JS.indexOf('// __IRRECO_START__'), JS.indexOf('// __IRRECO_END__'));
var H = (new Function(
  'var escapeReplenHtml = function (s) { return String(s == null ? "" : s); };'
  + 'var window = {}; var document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };'
  + IRRECO
  + '\n return { outlookBody: _irMatOutlookBody, patch: _irRecoPatchSummaryCells, toLine: _irMatToLine,'
  + ' windows: _IR_HORIZON_WINDOWS, setState: function (s) { _irMatState = s; } };'))();

function countAttr(html, attr) { return (html.match(new RegExp('data-ir-' + attr + '-window="', 'g')) || []).length; }
var READY = { sku: 'CO1100-R', calculation_status: 'READY', calculation_date: '2026-08-09',
  d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 120, d30_suggested_qty: 120,
  d45_gap_qty: 600, d45_suggested_qty: 600, d90_gap_qty: 1200, d90_suggested_qty: 1200, note: 'Shortage within 30 days' };
var BLOCKED = { sku: 'CO2000-R', calculation_status: 'BLOCKED', calculation_date: '2026-08-09',
  d18_gap_qty: '', d30_gap_qty: '', d45_gap_qty: '', d90_gap_qty: '', note: 'SALES_BASIS_UNAVAILABLE' };
function stateWith(status, rows) { var by = {}; (rows || []).forEach(function (r) { by[r.sku] = r; }); return { status: status, scopeKey: 's', bySku: by, rows: rows || [], loadedOk: true, error: null }; }

// =============================================================================================================
section('§1 A/B — the fixed 4-row skeleton exists in EVERY load state (never a message-only card)');
H.setState(stateWith('LOADING', []));
var loadingBody = H.outlookBody({ sku: 'CO1100-R' });
ok(/data-ir-summary="1"/.test(loadingBody), 'A1 the outlook table skeleton exists during LOADING (not a message-only div)');
ok(countAttr(loadingBody, 'note') === 4 && countAttr(loadingBody, 'gap') === 4 && countAttr(loadingBody, 'suggested') === 4, 'B1 LOADING renders exactly four horizon rows (gap/suggested/note cells ×4)');
ok(/18 Days/.test(loadingBody) && /30 Days/.test(loadingBody) && /45 Days/.test(loadingBody) && /90 Days/.test(loadingBody) && /Loading…/.test(loadingBody), 'B2 the four window labels + a Loading… note render before any data');

H.setState(stateWith('READY', []));   // READY scope but this SKU has no stored row
var notCalcBody = H.outlookBody({ sku: 'CO1100-R' });
ok(/data-ir-summary="1"/.test(notCalcBody) && countAttr(notCalcBody, 'note') === 4 && /Not calculated/.test(notCalcBody), 'A2 a not-calculated SKU still shows the 4-row skeleton (Note="Not calculated"), no message replacement');

H.setState(stateWith('READY', [READY]));
var readyBody = H.outlookBody({ sku: 'CO1100-R' });
ok(/data-ir-summary="1"/.test(readyBody) && countAttr(readyBody, 'note') === 4, 'A3 READY renders the same 4-row skeleton');

H.setState(stateWith('READY', [BLOCKED]));
var blockedBody = H.outlookBody({ sku: 'CO2000-R' });
ok(/data-ir-summary="1"/.test(blockedBody) && countAttr(blockedBody, 'note') === 4, 'A4 BLOCKED renders the SAME 4-row skeleton (cells only), never a rebuilt/replaced table');

section('§1 C/D/E — data load PATCHES the stable cells in place (no rebuild)');
function makeCard() {
  var cells = {};
  var table = { querySelector: function (sel) { var m = sel.match(/data-ir-(\w+)-window="(\w+)"/); if (!m) return null; var k = m[1] + ':' + m[2]; if (!cells[k]) cells[k] = { textContent: '' }; return cells[k]; } };
  var innerHTMLSet = { count: 0 };
  return { _cells: cells, _table: table, _innerHTMLSet: innerHTMLSet,
    querySelector: function (sel) { return sel === '[data-ir-summary]' ? table : null; },
    set innerHTML(v) { innerHTMLSet.count++; }, get innerHTML() { return ''; } };
}
H.setState(stateWith('READY', [READY]));
var card = makeCard();
var patched = H.patch(card, { sku: 'CO1100-R' });
ok(patched === true, 'C1 patch returns true (patched an existing skeleton — no rebuild required)');
ok(card._cells['gap:D30'].textContent === '120' && card._cells['suggested:D90'].textContent === '1200', 'C2 stored values patched into the stable data-ir cells (D30 gap 120, D90 suggested 1200)');
ok(card._cells['gap:D18'].textContent === '0', 'C3 a valid zero patches as "0", never dropped/"—"');
ok(card._innerHTMLSet.count === 0, 'D1 the whole summary DOM was NOT replaced (card.innerHTML never written during patch)');
// BLOCKED patches cells (dash + user-safe note), still no rebuild.
H.setState(stateWith('READY', [BLOCKED]));
var cardB = makeCard();
var patchedB = H.patch(cardB, { sku: 'CO2000-R' });
ok(patchedB === true && cardB._cells['gap:D30'].textContent === '—', 'E1 BLOCKED patches cells to "—" in place (no rebuild)');
ok(cardB._cells['note:D30'].textContent === 'Calculation unavailable' && cardB._innerHTMLSet.count === 0, 'E2 BLOCKED Note is the user-safe cell text; the table is not rebuilt');
// not-calculated for this SKU also patches (never falls through to a rebuild once the skeleton exists).
H.setState(stateWith('READY', []));
var cardN = makeCard();
ok(H.patch(cardN, { sku: 'ZZZ' }) === true && cardN._cells['note:D18'].textContent === 'Not calculated' && cardN._innerHTMLSet.count === 0, 'E3 a not-calculated SKU patches cells (Note="Not calculated"), never rebuilds');

section('§2 F/G/H — spacing matches Monthly Achievement; no green; no min-height/flex spacer');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-table--outlook td,[\s\S]*?padding:\s*3px 6px/.test(CSS), 'F1 summary outlook cells 3px 6px == Monthly Achievement');
ok(/#ops-section \.replen-achv-table th,[\s\S]*?padding:\s*3px 6px/.test(CSS), 'F2 Monthly Achievement reference is 3px 6px (density benchmark)');
ok(/#ops-section \.replen-card--recommendation-summary \.replen-horizon-dest\s*\{\s*margin:\s*0/.test(CSS), 'F3 the .replen-horizon-dest wrapper margin is zeroed inside the summary (no dead vertical space)');
ok(/#ops-section \.replen-recsum-ws--ready\s*\{\s*background:\s*#fff/.test(CSS), 'G1 the READY container is white (no green panel/border)');
// F1-4B-FM5-R4UI-R5H §B2/§B3 — the summary card now shares the top-row 150px height (Monthly Achievement parity)
// with a TOP-ALIGNED compact body (no flex-grow, no whitespace distribution), superseding the R5E natural-height
// contract. The fixed 4-row skeleton + cell-only patch (the true R5E invariants) remain proven elsewhere in this file.
ok(/#ops-section \.replen-card--recommendation-summary \{[^}]*min-height:\s*150px/.test(CSS) && /#ops-section \.replen-card--recommendation-summary \{[^}]*justify-content:\s*flex-start/.test(CSS) && !/#ops-section \.replen-card--recommendation-summary[^{]*\{[^}]*flex:\s*1\b/.test(CSS), 'H1 summary card shares the 150px top-row height, content top-aligned, NO flex-grow (R5H: no whitespace distribution)');

section('§3 I — one shared stretch parent owns left/right detail height (no JS pixel sync)');
ok(/#ops-section \.table-body-bar\s*\{\s*align-items:\s*stretch/.test(CSS), 'I1 .table-body-bar{align-items:stretch} is the shared-height owner');
ok(/#ops-section \.table-body-bar > \.fixed-col,[\s\S]*?\.scroll-col\s*\{\s*align-self:\s*stretch/.test(CSS) && /#ops-section \.replen-expand-panel--fixed\s*\{\s*flex:\s*1 1 auto/.test(CSS), 'I2 both columns stretch + the fixed expand panel fills (flex:1 1 auto) → left follows the taller right');
var irrecoSlice = IRRECO;
ok(!/offsetHeight|ResizeObserver|getBoundingClientRect\(\)\.height|\.style\.height\s*=|\.style\.minHeight\s*=/.test(irrecoSlice), 'I3 no JS height measurement / inline height write in the reco block (CSS owns parity)');

section('§4 J/K — SKU fixed-column right gutter removed AT SOURCE');
var fixedColBlock = CSS.slice(CSS.indexOf('#ops-section .fixed-col {'), CSS.indexOf('#ops-section .fixed-body'));
ok(!/overflow-y:\s*auto/.test(fixedColBlock) && !/overflow-x:\s*auto/.test(fixedColBlock) && !/scrollbar-gutter/.test(fixedColBlock), 'J1 .fixed-col owns NO independent scroll and reserves NO scrollbar gutter (source of the strip removed)');
ok(!/#ops-section \.scroll-col\s*\{\s*scrollbar-gutter:\s*stable/.test(CSS), 'K1 the matching phantom scrollbar-gutter on .scroll-col is removed too');
ok(/border-right:\s*1px solid #dbe3ea/.test(fixedColBlock) && /box-shadow:/.test(fixedColBlock), 'K2 the intentional separator (border-right + soft box-shadow) is preserved');

section('§5 L — active-row background stays per-cell / full logical width (no R5A regression)');
ok(/#ops-section \.scroll-row\.is-active-selected \.scroll-cell,/.test(CSS), 'L1 per-cell active background preserved (off-screen cells stay blue)');
ok(/#ops-section \.scroll-body\s*\{\s*width:\s*max-content;\s*min-width:\s*100%/.test(CSS), 'L2 .scroll-body spans max-content → the active row is continuous across the full logical width');

section('§ M — horizontal scroll remains available');
ok(/\.scroll-col\s*\{[\s\S]*?overflow-x:\s*auto/.test(COMPONENTS), 'M1 the shared .scroll-col keeps overflow-x:auto (horizontal scroll intact)');
ok(/scrollHeader\.style\.transform = 'translateX\(-' \+ scrollCol\.scrollLeft/.test(JS), 'M2 the header⇄body scrollLeft sync is unchanged');

section('§ N — the functions changed this round touch no formula / API / server');
var outlookFn = JS.slice(JS.indexOf('function _irMatOutlookBody'), JS.indexOf('function loadInventoryGap_'));
var patchFn = JS.slice(JS.indexOf('function _irRecoPatchSummaryCells'), JS.indexOf('function _irRecoUpdateSuggestedCells'));
ok(!/KMCALC|KMHP|KMTPP|KMPD|recommendation\.workspace\.get|fetch\(|automationSchedule|Math\.(ceil|floor|round)/.test(outlookFn + patchFn), 'N1 the changed renderers (_irMatOutlookBody + _irRecoPatchSummaryCells) reference no formula owner / API action / fetch / gap math — DOM + stored-value display only');

console.log('\n----------------------------------------');
console.log('R5E EXPANDED STRUCTURE (F1-4B-FM5-R4UI-R5E): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
