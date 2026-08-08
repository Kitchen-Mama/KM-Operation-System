// Kitchen Mama Operation System — Inventory materialized-gap UI simplification (F1-4B-FM5-R4UI).
// Run: node assets/tests/inventory-gap-ui-simplification-f1-4b-fm5r4ui.test.js
// -----------------------------------------------------------------------------
// The normal Inventory materialized-gap view shows ONLY the fixed 4-window outlook table (Window | Gap | Suggested
// Qty | Note) under the outer "Recommendation Summary" title. Removed from the normal view: the "Replenishment
// Outlook" sub-title, the "Materialized" badge, and the panel-level note/status/calc-date/as-of — those are DEMOTED
// under a collapsed Diagnostics <details>. The per-window business Note is preserved (No shortage / Replenishment
// required / truthful BLOCKED reason). Valid zero → 0; BLOCKED → "—" + truthful Note. No formula/DB change.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var INVJS = read('js/pages/inventory-replenishment.js');
var INVCSS = read('css/pages/inventory-replenishment.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// eval the IRRECO block (contains _irMat* + the frozen outlook renderer) with minimal stubs; expose the renderers
// and a setter for _irMatState so we can drive READY / BLOCKED fixtures.
var IRRECO = INVJS.slice(INVJS.indexOf('// __IRRECO_START__'), INVJS.indexOf('// __IRRECO_END__'));
var H = (new Function(
  'var escapeReplenHtml = function (s) { return String(s == null ? "" : s); };'
  + 'var window = {}; var document = { getElementById: function () { return null; }, querySelectorAll: function () { return []; } };'
  + IRRECO
  + '\n return { outlookBody: _irMatOutlookBody, toLine: _irMatToLine, note: _irRecoHorizonNote_,'
  + ' setState: function (s) { _irMatState = s; } };'))();

var READY = { sku: 'CO1100-R', calculation_status: 'READY', calculation_date: '2026-08-07',
  d18_gap_qty: 0, d18_suggested_qty: 0, d30_gap_qty: 120, d30_suggested_qty: 120,
  d45_gap_qty: 600, d45_suggested_qty: 600, d90_gap_qty: 1200, d90_suggested_qty: 1200,
  note: 'Shortage within 30 days', calculated_at: '2026-08-07 12:00:00', updated_at: '2026-08-07 12:00:00' };
var BLOCKED = { sku: 'CO2000-R', calculation_status: 'BLOCKED', calculation_date: '2026-08-07',
  d18_gap_qty: '', d18_suggested_qty: '', note: 'MARKETPLACE_STOCK_MISSING', calculated_at: '2026-08-07 12:00:00' };

function bodyFor(row) {
  H.setState({ status: 'READY', scopeKey: 's', bySku: (function () { var m = {}; m[row.sku] = row; return m; })(), rows: [row], loadedOk: true, error: null });
  return H.outlookBody({ sku: row.sku });
}
var readyBody = bodyFor(READY);
var blockedBody = bodyFor(BLOCKED);
function preDiag(b) { return b.split('<details')[0]; }   // the NORMAL (non-diagnostics) surface

// =============================================================================================================
section('normal view — engineering labels removed; outlook table only');
ok(/replen-horizon-table--outlook/.test(readyBody), 'UI1 the fixed 4-window outlook table renders');
ok(!/Replenishment Outlook/.test(readyBody), 'UI2 no "Replenishment Outlook" sub-title in the materialized view');
ok(!/Materialized/.test(readyBody) && !/replen-horizon-dest__badge/.test(readyBody), 'UI3 no "Materialized" badge in the normal view');
var pre = preDiag(readyBody);
ok(!/status:/.test(pre) && !/calc date/.test(pre) && !/as of/.test(pre), 'UI4 no panel status / calc-date / as-of timestamp in the NORMAL view');
ok(!/replen-recsum-ws__meta[^<]*note:/.test(pre), 'UI5 no panel-level aggregate "note:" line in the NORMAL view');
ok(INVJS.indexOf('<h4 class="replen-card__title">Recommendation Summary</h4>') >= 0, 'UI6 outer card title is "Recommendation Summary" (caller-owned; the only primary title)');

section('Diagnostics — engineering metadata preserved but collapsed');
ok(/<summary>Diagnostics<\/summary>/.test(readyBody), 'DG1 a collapsed Diagnostics <details> is present');
ok(/status: READY/.test(readyBody) && /calc date: 2026-08-07/.test(readyBody) && /as of 2026-08-07 12:00:00/.test(readyBody), 'DG2 status / calc date / as-of live under Diagnostics');
ok(/note: Shortage within 30 days/.test(readyBody), 'DG3 the panel aggregate note lives under Diagnostics');

section('row-level Note preserved + fixed structure + valid zero');
ok(/18 Days/.test(readyBody) && /30 Days/.test(readyBody) && /45 Days/.test(readyBody) && /90 Days/.test(readyBody), 'RS1 all four windows always rendered (stable structure)');
ok(/No shortage/.test(pre), 'RS2 row-level Note preserved — D18 (gap 0) → "No shortage"');
ok(/Replenishment required/.test(pre), 'RS3 row-level Note preserved — D30/D45/D90 (gap>0) → "Replenishment required"');
ok(/replen-recsum-table__num">0</.test(pre), 'RS4 valid zero renders 0 (D18 gap), never "—"');
ok(/replen-recsum-table__num">1200</.test(pre) && /replen-recsum-table__num">600</.test(pre), 'RS5 stored D90/D45 gap shown verbatim (no math)');

section('BLOCKED → dash numerics + truthful Note (in the table, not only diagnostics)');
var blkPre = preDiag(blockedBody);
ok(/replen-horizon-table--outlook/.test(blkPre) && !/Materialized/.test(blockedBody), 'BK1 BLOCKED still renders the fixed outlook table, no badge');
ok(/replen-recsum-table__num">—</.test(blkPre), 'BK2 BLOCKED numeric cells show "—" (never a fabricated 0)');
ok(/replen-horizon-table__note">MARKETPLACE_STOCK_MISSING</.test(blkPre), 'BK3 BLOCKED row Note shows the truthful reason in the table (per window)');
ok(/18 Days/.test(blkPre) && /90 Days/.test(blkPre), 'BK4 all four windows still rendered for a BLOCKED row');

section('shared note helper stays backward-compatible (live workspace path unaffected)');
eq(H.note({ gapQty: 0 }), 'No shortage', 'NH1 gap 0 → No shortage (derived; live path unchanged)');
eq(H.note({ gapQty: 5 }), 'Replenishment required', 'NH2 gap>0 → Replenishment required');
eq(H.note({ gapQty: null }), '—', 'NH3 missing gap → —');
eq(H.note({ gapQty: null, note: 'BLOCKED_REASON' }), 'BLOCKED_REASON', 'NH4 explicit truthful note wins over derived');

section('containment CSS — no outer-container overflow (fixed structure)');
ok(/\.replen-horizon-tablewrap\s*\{[^}]*overflow-x:\s*auto/.test(INVCSS), 'CSS1 outlook table wrapped in an internal-scroll container (card cannot widen)');
ok(/\.replen-horizon-table--outlook\s*\{[^}]*table-layout:\s*fixed/.test(INVCSS), 'CSS2 outlook table uses fixed layout → column widths are data-independent (stable before/after data)');
ok(/\.replen-horizon-table__note\s*\{[^}]*(overflow-wrap:\s*anywhere|word-break:\s*break-word)/.test(INVCSS) && /\.replen-horizon-table__note\s*\{[^}]*max-width/.test(INVCSS), 'CSS3 Note cell wraps within a bounded max-width');
ok(/\.replen-horizon-table\s+\.replen-recsum-table__num\s*\{[^}]*white-space:\s*nowrap/.test(INVCSS), 'CSS4 numeric cells nowrap (right-aligned; large values scroll inside the wrap)');

section('no formula / no DB change in this UI round');
ok(!/Math\.(ceil|floor|round)/.test(IRRECO.slice(IRRECO.indexOf('function _irMatToLine'), IRRECO.indexOf('function _irMatOutlookBody'))), 'NF1 materialized mapping/meta has no gap/carton math (stored values shown verbatim)');

console.log('\n----------------------------------------');
console.log('INVENTORY GAP UI SIMPLIFICATION (F1-4B-FM5-R4UI): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
