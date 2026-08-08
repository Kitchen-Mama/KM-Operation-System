// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R6 defect closeout.
// Run: node assets/tests/inventory-recalc-freeze-ui-f1-4b-fm5r4uir6.test.js
// -----------------------------------------------------------------------------
// Freezes the fresh-state recalculation invariant + locks the R6 UI defect fixes:
//   §2/§12/§13 Every recalculation is STATELESS wrt the previous gap status. The materialization map takes only
//     (lines, scope, sku, calcAuthority) — never the existing row — and gapUpsertByKey_ OVERWRITES status+values+note
//     on the SAME business-key row. Proven: BLOCKED→READY→BLOCKED→READY on one key, one row throughout, no duplicate.
//   §4  A known upstream blockedReason is PRESERVED (not collapsed into generic HORIZONS_NOT_AVAILABLE).
//   §3/§13 The frontend invalidates its materialized cache + force-refetches after a manual recalc.
//   §5  The active-row pin is a FIXED overlay clone (native position:sticky removed — it lived inside an overflow-x
//       scroll column, the wrong containing block, which no `top` patch could fix).
//   §7  Global chrome compaction: --header-height 56px (was 80) via the single canonical owner; .top-header padding trimmed.
//   §8  Inventory two-level header = 68px: row tokens 34+34 AND every tall (rowspan) cell references the re-derived total.
//   §9/§10/§11 Recommendation Summary + Monthly Achievement headers are NEUTRAL gray (no green, no warm beige); bodies white.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GAP_SRC = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var WS_SRC = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var BASE = read('css/base.css');
var LAYOUT = read('css/layout.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- load the PURE materialization helpers from 43 (no Apps Script globals touched at definition time) ----
var api = (new Function(GAP_SRC + '\n;return { map: gapInvMapFromLines_, upsert: gapUpsertByKey_, HEADERS: INV_GAP_HEADERS_, KEYS: GAP_KEY_COLS_ };'))();

// Minimal in-memory sheet honoring the getRange/getValues/setValues/appendRow surface gapUpsertByKey_ uses.
function FakeSheet(headers) { this._rows = [headers.slice()]; }
FakeSheet.prototype.getLastColumn = function () { return this._rows[0].length; };
FakeSheet.prototype.getLastRow = function () { return this._rows.length; };
FakeSheet.prototype.appendRow = function (arr) { this._rows.push(arr.slice()); };
FakeSheet.prototype.getRange = function (r, c, nr, nc) {
  var self = this;
  return {
    getValues: function () {
      var out = [];
      for (var i = 0; i < nr; i++) { var row = self._rows[r - 1 + i] || [], seg = []; for (var j = 0; j < nc; j++) seg.push(row[c - 1 + j] !== undefined ? row[c - 1 + j] : ''); out.push(seg); }
      return out;
    },
    setValues: function (vals) { for (var i = 0; i < nr; i++) self._rows[r - 1 + i] = vals[i].slice(); }
  };
};
function colVal(sheet, rowObj, col) {
  var hdr = sheet._rows[0], idx = hdr.indexOf(col);
  for (var r = 1; r < sheet._rows.length; r++) {
    var match = api.KEYS.every(function (k) { return String(sheet._rows[r][hdr.indexOf(k)]) === String(rowObj[k]); });
    if (match) return sheet._rows[r][idx];
  }
  return undefined;
}
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var SKU = 'CO1100-R';
function readyLines() {
  return [{ horizons: [
    { windowCode: 'D18', gapQty: 3, suggestedOrderQty: 3 },
    { windowCode: 'D30', gapQty: 7, suggestedOrderQty: 7 },
    { windowCode: 'D45', gapQty: 12, suggestedOrderQty: 12 },
    { windowCode: 'D90', gapQty: 40, suggestedOrderQty: 40 }
  ] }];
}
function blockedLines(reason) { return [{ blocked: true, blockedReason: reason }]; }

section('§4/§12 the map is a PURE function of (lines, scope, sku, calcDate) — never the prior row');
var mReady = api.map(readyLines(), SCOPE, SKU, '2026-08-08');
eq(mReady.calculation_status, 'READY', 'M1 valid four-window lines → READY');
eq(mReady.d90_suggested_qty, 40, 'M2 D90 suggested surfaces the furthest cumulative checkpoint');
var mBlocked = api.map(blockedLines('SALES_BASIS_MISSING'), SCOPE, SKU, '2026-08-08');
eq(mBlocked.calculation_status, 'BLOCKED', 'M3 a blocked line → BLOCKED');
eq(mBlocked.note, 'SALES_BASIS_MISSING', 'M4 the REAL upstream reason is preserved (NOT collapsed to generic HORIZONS_NOT_AVAILABLE)');
eq(mBlocked.d90_suggested_qty, null, 'M5 BLOCKED leaves qty null (missing is never fabricated as 0)');
ok(!/getRange|getLastRow|appendRow|existing\./.test(api.map.toString()), 'M6 the map body reads NO sheet / prior row — previous status can never be a calculation input');

section('§13 gapUpsertByKey_ is stateless: BLOCKED→READY→BLOCKED→READY on ONE business-key row (no carry-forward, no dup)');
var sheet = new FakeSheet(api.HEADERS);
function stamp(row) { row.calculated_at = 'ts'; row.updated_at = 'ts'; return row; }
eq(api.upsert(sheet, stamp(api.map(blockedLines('SITE_STOCK_MISSING'), SCOPE, SKU, '2026-08-08'))), 'insert', 'U1 first write inserts the row');
eq(sheet.getLastRow(), 2, 'U2 exactly one data row exists');
eq(colVal(sheet, SCOPE_SKU(), 'calculation_status'), 'BLOCKED', 'U3 stored BLOCKED');
eq(api.upsert(sheet, stamp(api.map(readyLines(), SCOPE, SKU, '2026-08-08'))), 'update', 'U4 valid facts on the next run UPDATE the same row');
eq(sheet.getLastRow(), 2, 'U5 still exactly one row (same business key — no duplicate)');
eq(colVal(sheet, SCOPE_SKU(), 'calculation_status'), 'READY', 'U6 previous BLOCKED did NOT lock the new run → now READY');
eq(colVal(sheet, SCOPE_SKU(), 'd90_suggested_qty'), 40, 'U7 the READY values overwrite the previously-blank cells');
api.upsert(sheet, stamp(api.map(blockedLines('DEMAND_NOT_READY'), SCOPE, SKU, '2026-08-08')));
eq(colVal(sheet, SCOPE_SKU(), 'calculation_status'), 'BLOCKED', 'U8 previous READY + current missing facts → BLOCKED (fresh)');
eq(colVal(sheet, SCOPE_SKU(), 'd90_suggested_qty'), '', 'U9 BLOCKED clears the previously-numeric qty (blank, not a stale 40)');
api.upsert(sheet, stamp(api.map(readyLines(), SCOPE, SKU, '2026-08-08')));
eq(colVal(sheet, SCOPE_SKU(), 'calculation_status'), 'READY', 'U10 restored facts → READY again (BLOCKED is never sticky)');
eq(sheet.getLastRow(), 2, 'U11 one business-key row across the entire B→R→B→R cycle');
function SCOPE_SKU() { return { company: SCOPE.company, country: SCOPE.country, marketplace: SCOPE.marketplace, sku: SKU }; }

section('§4 the canonical workspace still preserves the specific reason + the R5 Site-Stock horizon-opening decoupling');
ok(/blockedReason:\s*blockedReason/.test(WS_SRC), 'W1 the line carries its specific blockedReason (not a generic token)');
ok(/resolveMarketplaceCurrentStock\(\{\s*rows:\s*amazonRows/.test(WS_SRC) && /horizonOpening/.test(WS_SRC), 'W2 the Site-Stock horizon-opening fallback is present (sales-driven, no-forecast SKUs still get horizons)');

section('§3/§13 frontend invalidates the materialized cache + force-refetches after a manual recalc');
ok(/function refreshInventoryGapAfterRecalc_\(\)\s*\{[^}]*loadedOk\s*=\s*false[^}]*scopeKey\s*=\s*null[^}]*loadInventoryGap_\(true\)/.test(JS), 'C1 refreshInventoryGapAfterRecalc_ clears loadedOk+scopeKey then force-refetches (no stale BLOCKED left in memory)');

section('§2 (superseded by R7) active row + detail scroll as ONE natural unit — no pin/overlay');
ok(!/is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS) && !/\.ir-sticky-overlay\s*\{[\s\S]*?position:\s*fixed/.test(CSS), 'S1 NO pin: the real row is never position:sticky AND there is no fixed overlay (R7 §2 — a pin floats over / occludes the detail)');
ok(/is-active-selected[\s\S]{0,140}background/.test(CSS), 'S2 the active row keeps ONLY the .is-active-selected highlight (no reposition, no float)');
ok(/function _irRemoveStickyOverlay/.test(JS) && !/function _irUpdateStickyOverlay/.test(JS), 'S3 the overlay BUILDER is removed; only the teardown stub remains (clears any legacy overlay node)');
ok(/_irRemoveStickyOverlay\(\)/.test(JS) && /classList\.remove\('is-active-selected'\)/.test(JS), 'S4 collapse tears down any legacy overlay + clears the highlight');

section('§7 global chrome compaction via the single canonical owner');
ok(/--header-height:\s*56px/.test(BASE), 'H1 --header-height reduced to 56px (was 80) at its single canonical owner');
ok(/\.top-header\s*\{[^}]*padding:\s*0\.5rem 2rem/.test(LAYOUT), 'H2 .top-header vertical padding trimmed (0.5rem) so 56px is comfortable, not cramped');
ok(!/#ops-section[\s\S]*--header-height/.test(CSS) && !/top-header/.test(CSS), 'H3 the Inventory page does NOT override the shared header owner (token-based, no per-page ripple)');

section('§8 inventory two-level header = 68px: computed selector chain keyed off the re-derived total');
ok(/--km-sticky-row-1-height:\s*34px/.test(CSS) && /--km-sticky-row-2-height:\s*34px/.test(CSS), 'G1 both header rows are 34px (34+34 = 68px)');
ok(/#ops-section\s*\{[\s\S]*?--km-sticky-header-total:\s*calc\(var\(--km-sticky-row-1-height\)\s*\+\s*var\(--km-sticky-row-2-height\)/.test(CSS), 'G2 the total is RE-DERIVED from the two compacted rows (68px), not the inherited 96px');
['\\.table-header-bar', '\\.fixed-header', '--status', '--note-span', '\\.scroll-header'].forEach(function (sel) {
  ok(new RegExp(sel + '[\\s\\S]{0,220}?height:\\s*var\\(--km-sticky-header-total').test(CSS), 'G3 every tall/rowspan cell (' + sel + ') height derives from the total → all render 68px (no gray third band)');
});

section('§9/§10/§11 Recommendation Summary + Monthly Achievement — NEUTRAL gray headers, white bodies, compact');
ok(/\.replen-recsum-table thead th\s*\{[^}]*background:\s*#f1f5f9/.test(CSS), 'N1 Recommendation Summary (recsum) header is neutral gray #f1f5f9');
ok(/\.replen-horizon-table thead th\s*\{[^}]*background:\s*#f1f5f9/.test(CSS), 'N2 the rendered outlook table header is neutral gray #f1f5f9');
ok(/\.replen-achv-table thead th\s*\{[^}]*background:\s*#f1f5f9/.test(CSS), 'N3 Monthly Achievement Rate header is the SAME neutral gray');
ok(!/thead th\s*\{[^}]*background:\s*rgb\(255,\s*248,\s*240\)/.test(CSS), 'N4 the old warm-beige header fill is gone (no green, no beige)');
ok(/\.replen-recsum-ws--ready\s*\{[^}]*background:\s*#fff/.test(CSS), 'N5 the ready body stays white (no green container)');
ok(/\.replen-recsum-table\s*\{[\s\S]*?margin:\s*2px 0/.test(CSS), 'N6 recsum table margin tightened (10px→2px) for density parity with Monthly Achievement');

console.log('\n----------------------------------------');
console.log('R6 RECALC FREEZE + UI CLOSEOUT (F1-4B-FM5-R4UI-R6): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
