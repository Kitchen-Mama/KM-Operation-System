// Kitchen Mama Operation System — F1-4B-FM5-R4UI-R7 BLOCKED root-cause closure + 90-Day FC reference field.
// Run: node assets/tests/inventory-blocked-and-90dayfc-f1-4b-fm5r4uir7.test.js
// -----------------------------------------------------------------------------
// §1 CO1100-R BLOCKED root cause: a Sales-Driven SKU whose canonical run-rate cannot resolve fail-closes to a null
//    horizon; materialization then reported the GENERIC HORIZONS_NOT_AVAILABLE, masking the real reason. Fixes:
//      (A) recoWsExpandMarketplace_/recoWsExpandWarehouse_ stamp line.horizonsBlockedReason = the specific sales
//          reason; gapInvMapFromLines_ surfaces it verbatim (no generic mask).
//      (B) recoWsResolveSalesRate_ matches the daily/weekly snapshots by CANONICAL country (KMCID), not raw string
//          equality (the UK≡GB-class mismatch that dropped every scoped row → false SALES_BASIS_UNAVAILABLE).
// §F "90 days FC" is a USER REFERENCE field = SUM(next 3 forecast months' Base FC) + SUM(Special Event fc_qty whose
//    month ∈ those 3 months, once). NOT D90 demand, NOT Avg Sales/day, no inventory subtraction, no gap, no Target%.
// §2/§4/§5 UI: no pin/overlay (natural scroll), neutral-gray compact summary, logo scales to the 56px header.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var GAP_SRC = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var WS_SRC = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var JS = read('js/pages/inventory-replenishment.js');
var CSS = read('css/pages/inventory-replenishment.css');
var HTML = read('html/pages/inventory-replenishment.html');
var LAYOUT = read('css/layout.css');
var BASE = read('css/base.css');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- §1/§4 materialization surfaces the SPECIFIC horizon reason (no generic mask) ----
var gap = (new Function(GAP_SRC + '\n;return { map: gapInvMapFromLines_ };'))();
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };

section('§1/§4 materialization surfaces the SPECIFIC upstream horizon reason (never generic-masks it)');
var mSpecific = gap.map([{ horizons: [], horizonsBlockedReason: 'SALES_BASIS_UNAVAILABLE' }], SCOPE, 'CO1100-R', '2026-08-08');
eq(mSpecific.calculation_status, 'BLOCKED', 'N1 empty horizons → BLOCKED');
eq(mSpecific.note, 'SALES_BASIS_UNAVAILABLE', 'N2 the SPECIFIC sales reason is surfaced verbatim (not HORIZONS_NOT_AVAILABLE)');
var mAmbig = gap.map([{ horizons: [], horizonsBlockedReason: 'SALES_BASIS_AMBIGUOUS' }], SCOPE, 'CO1100-R', '2026-08-08');
eq(mAmbig.note, 'SALES_BASIS_AMBIGUOUS', 'N3 an ambiguous-channel basis surfaces SALES_BASIS_AMBIGUOUS');
var mGeneric = gap.map([{ horizons: [] }], SCOPE, 'CO1100-R', '2026-08-08');
eq(mGeneric.note, 'HORIZONS_NOT_AVAILABLE', 'N4 with NO specific reason it falls back to the generic token (backward compatible)');

section('§1 the workspace stamps the specific reason + canonicalizes the daily/weekly country identity');
ok(/mLine\.horizonsBlockedReason = salesReason \|\| 'HORIZON_PROJECTION_UNAVAILABLE'/.test(WS_SRC), 'W1 marketplace path stamps the sales reason on the line (no silent null horizon)');
ok(/wLine\.horizonsBlockedReason = whSalesReason \|\| 'HORIZON_PROJECTION_UNAVAILABLE'/.test(WS_SRC), 'W2 warehouse path stamps the sales reason too');
ok(/recoWsCanonC\(r\.country\) === scopeCountryC/.test(WS_SRC), 'W3 daily-sales scope match uses CANONICAL country (KMCID), not raw equality (fixes the UK≡GB-class false SALES_BASIS_UNAVAILABLE)');
ok(/canonicalCountryCode/.test(WS_SRC), 'W4 the canon helper delegates to the KMCID country owner');
ok(/salesReason = \(sr\.reason \|\|/.test(WS_SRC), 'W5 the sales-rate failure reason (+ diagnostic detail) is captured (was discarded)');

section('§1 fresh-state invariant preserved (the map never reads a prior row/status)');
ok(!/getRange|getLastRow|calculation_status\s*===|existing\./.test(gap.map.toString()), 'FS1 the materialization map is a pure function of its inputs — no prior calculation_status can gate the new run');

// ---- §F 90 days FC reference field — execute the real forecast60d owner in a faithful sandbox ----
section('§F 90 days FC = 3 base FC months + scoped Special Events (once); NOT demand/avg/gap');
var slice = JS.slice(JS.indexOf('function forecast60d'), JS.indexOf('function upcomingEvents'));
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function num(v) { v = parseFloat(v); return isFinite(v) ? v : 0; }
function eqf(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
function targetPct() { return 100; }
var mod = (new Function('num', 'eq', 'MONTHS', 'targetPct', slice + '\n;return { forecast60d: forecast60d };'))(num, eqf, MONTHS, targetPct);
var f90 = mod.forecast60d;

var cm = new Date().getMonth();
var m1 = MONTHS[(cm + 1) % 12], m2 = MONTHS[(cm + 2) % 12], m3 = MONTHS[(cm + 3) % 12];
var allowedMo = ((cm + 1) % 12) + 1;          // a calendar month inside the next-3-month window
var outsideMo = ((cm + 5) % 12) + 1;          // a month outside the window
var fcRow = { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'Amazon' };
MONTHS.forEach(function (mn, i) { fcRow[mn] = (i + 1) * 10; });   // jan=10, feb=20, … dec=120 (distinct)
var base3 = fcRow[m1] + fcRow[m2] + fcRow[m3];
var scope = { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'Amazon', series: '', category: '' };

eq(f90([fcRow], [], scope, []), base3, 'F1 three next-month Base FC values summed (no Target%, no 2-month legacy)');
var evIn = { sku: 'CO1100-R', status: '', eventMonth: allowedMo, fcQty: 100 };
eq(f90([fcRow], [], scope, [evIn]), base3 + 100, 'F2 a Special Event inside the 3-month window adds its fcQty ONCE');
var evOut = { sku: 'CO1100-R', status: '', eventMonth: outsideMo, fcQty: 100 };
eq(f90([fcRow], [], scope, [evOut]), base3, 'F3 a Special Event OUTSIDE the window is excluded');
eq(f90([fcRow], [], scope, [evIn, evIn]), base3 + 200, 'F4 model-independent: same reference rule regardless of Planning Model (function takes no model)');
eq(f90([fcRow], [], scope, []), base3, 'F5 no events → Base FC only (missing event ≠ missing total when Base FC exists)');
ok(!/avgSalesPerDay|d90|demandQty|currentStock|gap/i.test(slice), 'F6 the reference owner never references avg-sales / D90 demand / current stock / gap (pure FC reference)');
eq(f90([], [], scope, [evIn]), 100, 'F7 no Base FC row → 0 base, event still counts (no inventory subtraction anywhere)');

section('§F the 3PL planning calc is DECOUPLED from the reference field (no planning formula consumes it)');
ok(/function _irForecastPlanning2mo/.test(JS), 'P1 a separate planning-only 2-month owner exists');
ok(/_irForecastPlanning2mo\(ctx\.fcRows/.test(JS), 'P2 the 3PL site-planning allocation uses the planning owner, NOT forecast60d');
ok(/90 days FC<\/div>/.test(HTML) && !/60 days FC<\/div>/.test(HTML), 'P3 the visible header is renamed 60 → 90 days FC');

section('§5 logo scales to the compacted 56px header (shared shell rule, aspect ratio preserved)');
ok(/--header-height:\s*56px/.test(BASE), 'L1 header is 56px');
ok(/\.top-header[\s\S]*?logo-text img[\s\S]*?max-height:\s*36px/.test(LAYOUT) || /logo-text img\s*\{[^}]*max-height:\s*36px/.test(LAYOUT), 'L2 the shared logo has a max-height that fits 56px');
ok(/logo-text img\s*\{[^}]*width:\s*auto/.test(LAYOUT), 'L3 width:auto preserves the aspect ratio (no distortion/crop)');

section('§2 no pin/overlay — master row + detail scroll as one natural unit');
ok(!/\.ir-sticky-overlay\s*\{[\s\S]*?position:\s*fixed/.test(CSS) && !/is-active-sticky[\s\S]*?position:\s*sticky/.test(CSS), 'U2 no fixed overlay AND no native sticky on the real row (a pin floats over / occludes the detail)');
ok(!/function _irUpdateStickyOverlay/.test(JS) && /function _irRemoveStickyOverlay/.test(JS), 'U3 overlay builder removed; teardown stub retained to clear any legacy overlay node');

section('§4 Recommendation Summary — neutral-gray header, white body, compact density parity');
ok(/\.replen-horizon-table thead th\s*\{[^}]*background:\s*#f1f5f9/.test(CSS), 'U7 outlook header neutral gray #f1f5f9');
ok(!/thead th\s*\{[^}]*background:\s*rgb\(255,\s*248,\s*240\)/.test(CSS), 'U8 no warm/green header fill remains');
ok(/\.replen-card--recommendation-summary .replen-horizon-table--outlook td,[\s\S]*?padding:\s*3px 6px/.test(CSS), 'U7b summary cell padding matches Monthly Achievement (3px 6px)');

section('§8/U1 preserved rules (header 68px; Inventory top Suggested = D90; OP top = t1+t2+t3)');
ok(/#ops-section\s*\{[\s\S]*?--km-sticky-header-total:\s*calc\(var\(--km-sticky-row-1-height\)\s*\+\s*var\(--km-sticky-row-2-height\)/.test(CSS), 'U1 inventory header total stays 34+34 = 68px');

console.log('\n----------------------------------------');
console.log('R7 BLOCKED CLOSURE + 90-DAY FC (F1-4B-FM5-R4UI-R7): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
