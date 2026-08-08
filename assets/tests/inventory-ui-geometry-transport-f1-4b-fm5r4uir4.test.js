// Kitchen Mama Operation System — Inventory header geometry + sticky + fixed summary + transport recovery (R4).
// Run: node assets/tests/inventory-ui-geometry-transport-f1-4b-fm5r4uir4.test.js
// -----------------------------------------------------------------------------
// Structure/logic regressions for F1-4B-FM5-R4UI-R4 §1/§2/§3/§4/§6/§7 (deterministic; no live DOM/network):
//   §1 the three rowspan/tall header cells (SKU / Planning Model / AI Action) span EXACTLY the compact two-row
//      header total (token-driven; no stale hardcoded height → no gray third band).
//   §2 the active row is highlighted (not repositioned) on expand; sticky positioning is deferred to scroll.
//   §3 Recommendation Summary is a FIXED 4-row schema with stable data-ir-* cell identities + cell-patching; the
//      normal card hides Diagnostics/status/date/as-of behind a debug flag.
//   §6/§7 both manual-recalc handlers treat a transport error as "server result unknown" → refetch the READ, never
//      re-run the WRITE, and confirm from calculated_at (never a fabricated success).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var RO = read('js/pages/request-order.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function cssRule(sel) { var i = CSS.indexOf(sel); if (i < 0) return ''; var b = CSS.indexOf('{', i); var e = CSS.indexOf('}', b); return CSS.slice(b, e); }

section('§1 header rowspan/tall cells span the compact two-row total (token-driven; no stale height → no gray band)');
ok(/--km-sticky-row-1-height:\s*34px/.test(CSS) && /--km-sticky-row-2-height:\s*34px/.test(CSS), 'A1 the two header rows are compacted to 34px each (68px total)');
ok(/\.fixed-header\s*\{[^}]*height:\s*var\(--km-sticky-header-total/.test(CSS), 'A2 SKU column header height = var(--km-sticky-header-total) (spans both rows)');
ok(/--status\s*\{[^}]*height:\s*var\(--km-sticky-header-total/.test(CSS), 'A3 Planning Model corner cell height = var(--km-sticky-header-total)');
ok(/--note-span\s*\{[^}]*height:\s*var\(--km-sticky-header-total/.test(CSS), 'A4 AI Action / note-span cell height = var(--km-sticky-header-total) (no hardcoded 96px → aligned bottom, no gray third band)');
ok(!/--note-span\s*\{[^}]*height:\s*96px/.test(CSS) && !/--status\s*\{[^}]*height:\s*96px/.test(CSS), 'B1 no stale hardcoded 96px height on the tall cells');

section('§2 active row highlight on expand (no reposition); sticky deferred to scroll');
ok(/is-active-selected'\)/.test(JS) && /_irBindStickyScrollOnce\(\)/.test(JS), 'C1 expand adds .is-active-selected (highlight) + binds the scroll handler — no position change → no jump');
ok(!/classList\.add\('is-active-sticky'\)/.test(JS.slice(JS.indexOf('function toggleReplenRow'), JS.indexOf('function toggleReplenRow') + 2500)), 'C2 toggleReplenRow does NOT add position:sticky at expand (that caused the immediate jump)');
ok(/addEventListener\('scroll'[\s\S]*?is-active-sticky/.test(JS), 'C3 the scroll handler promotes the active row to .is-active-sticky only once the user scrolls');
ok(/\.is-active-selected\s*,?\s*\n?[^}]*\{[^}]*background/.test(CSS) || /is-active-selected[\s\S]{0,120}background/.test(CSS), 'D1 .is-active-selected is a subtle background highlight (no position/reposition)');
ok(/\.fixed-row\.is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS), 'D2 .is-active-sticky remains the position:sticky owner (added on scroll)');
ok(/remove\('is-active-sticky'\)[\s\S]*?remove\('is-active-selected'\)/.test(JS) || (/remove\('is-active-selected'\)/.test(JS) && /remove\('is-active-sticky'\)/.test(JS)), 'E1 collapse clears BOTH classes (exactly one active row; switching transfers cleanly)');

section('§3 Recommendation Summary — fixed 4-row schema + stable cell identities + cell patching');
ok(/data-ir-summary="1"/.test(JS), 'F1 the outlook table carries a data-ir-summary marker (stable skeleton)');
ok(/data-ir-gap-window="'\s*\+\s*w\.code/.test(JS) && /data-ir-suggested-window="'\s*\+\s*w\.code/.test(JS) && /data-ir-note-window="'\s*\+\s*w\.code/.test(JS), 'F2 each window cell has a stable data-ir-{gap,suggested,note}-window identity');
ok(/_IR_HORIZON_WINDOWS\s*=\s*\[\{ code: 'D18'[\s\S]*'D30'[\s\S]*'D45'[\s\S]*'D90'/.test(JS), 'F3 all four windows (D18/D30/D45/D90) are always mapped → 4 rows always exist');
ok(/function _irRecoPatchSummaryCells/.test(JS) && /if \(_irRecoPatchSummaryCells\(card, skuData\)\) return;/.test(JS), 'G1 a materialized-READY refetch PATCHES cells in place (patch returns true → skips the full innerHTML rebuild)');
ok(/setCell\('gap'[\s\S]*setCell\('suggested'[\s\S]*setCell\('note'/.test(JS), 'G2 patching sets only the gap/suggested/note cell text (structure untouched)');
ok(/function _irRecoDebugDiagnosticsEnabled/.test(JS) && /if \(!_irRecoDebugDiagnosticsEnabled\(\)\) return stale;/.test(JS), 'H1 Diagnostics (status/calc date/as-of/note) are HIDDEN in normal UI — emitted only behind the explicit debug flag');
ok(/IR_DEBUG_DIAGNOSTICS/.test(JS), 'H2 the debug flag gate is window.KM_FLAGS.IR_DEBUG_DIAGNOSTICS (off by default)');

section('§6/§7 transport-error recovery — refetch READ, never re-run WRITE, never fabricate success (both buttons)');
ok(/_irIsTransportError_/.test(JS) && /HTTP_TRANSPORT_ERROR/.test(JS), 'T1 inventory recognises a transport error distinctly from a business error');
ok(/_irRecalcTransportRecovery_/.test(JS) && /refreshInventoryGapAfterRecalc_/.test(JS), 'T2 inventory recovery refetches the materialized READ (not the write batch)');
var invHandler = JS.slice(JS.indexOf('function handleRecalcAllInventoryGap'), JS.indexOf('window.handleRecalcAllInventoryGap'));
ok(!/recalculateInventoryReplenishmentGapAll/.test(invHandler.slice(invHandler.indexOf('_irIsTransportError_'))), 'T3 inventory NEVER re-invokes the WRITE batch on transport failure (no automatic duplicate recalc)');
ok(/postMax[\s\S]*preMax[\s\S]*completed/.test(JS), 'T4 completion is inferred from a NEWER stored calculated_at (never assumed) — else "could not be confirmed"');
var roHandler = RO.slice(RO.indexOf('function handleRecalcAllOrderPlanningGap'), RO.indexOf('window.handleRecalcAllOrderPlanningGap'));
ok(/HTTP_TRANSPORT_ERROR/.test(roHandler) && /refreshOrderPlanningGapAfterRecalc_/.test(roHandler), 'T5 Order Planning uses the SAME contract: transport error → refetch READ');
ok(!/recalculateOrderPlanningGapAll/.test(roHandler.slice(roHandler.indexOf('isTransport'))), 'T6 Order Planning NEVER re-runs the WRITE batch on transport failure');
ok(/could not be confirmed/.test(JS) && /could not be confirmed/.test(RO), 'T7 both buttons show a truthful "could not be confirmed" message when the READ shows no newer result (no fabricated success)');

console.log('\n----------------------------------------');
console.log('INVENTORY UI GEOMETRY + TRANSPORT (F1-4B-FM5-R4UI-R4): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
