// Request Order supply-planning UI logic test (pure Node). Covers the RETAINED second-level helpers
// (per-tier Recommended/Suggested/Order Qty, first-shortage, carton breakdown/partial) AND source-scan
// guards proving Aging / Day-of-Supply were REMOVED from Request Order (2026-07-24 boundary cleanup).
// It does NOT test the canonical forecast formula (forecast-engine.js — unchanged).
// Run: node assets/tests/request-order-supply-ui.test.js

var fs = require('fs');
var path = require('path');
var fail = 0;
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + l); }

// ---- mirrors of the RETAINED request-order.js helpers ----
function cartonBreak(orderQty, box) {
  var q = (orderQty === '' || orderQty == null) ? NaN : Number(orderQty), b = parseFloat(box) || 0;
  if (isNaN(q)) return { isNumeric: false, isValid: false, isPartial: false };
  if (q < 0) return { isNumeric: true, isValid: false, isPartial: false };
  if (b <= 0) return { isNumeric: true, isValid: true, isPartial: false, boxUnknown: true };
  var full = Math.floor(q / b), loose = q - full * b;
  return { isNumeric: true, isValid: true, isPartial: loose !== 0, full: full, loose: loose };
}
function tierBalance(item, i) { var s = [item.shortageM1, item.shortageM2, item.shortageM3][i]; return (typeof s === 'number' && isFinite(s)) ? s : null; }
function tierRecommended(item, i) { var s = tierBalance(item, i); if (s == null) return null; return s < 0 ? Math.abs(s) : 0; }
function tierSuggested(item, i) { var r = tierRecommended(item, i); if (r == null) return null; var b = parseFloat(item.boxSize) || 0; return (b > 0 && r > 0) ? Math.ceil(r / b) * b : r; }
function effectiveOrderQty(item, i, edit) { if (edit && edit.orderQty != null && edit.orderQty !== '') return Number(edit.orderQty); var s = tierSuggested(item, i); return s == null ? null : s; }
function firstShortageTier(item) { for (var i = 0; i < 3; i++) { var s = tierBalance(item, i); if (s != null && s < 0) return i; } return null; }

// ---- G — per-tier Recommended/Suggested, first shortage, NO summing (RETAINED, B.6/B.7) ----
var item = { shortageM1: 50, shortageM2: -100, shortageM3: -250, boxSize: 12 };  // T1 covered, T2/T3 short
eq(firstShortageTier(item), 1, 'first shortage = first negative balance tier (T2, idx 1)');   // G7/B.6
eq(tierRecommended(item, 0), 0, 'T1 recommended = 0 (covered)');
eq(tierRecommended(item, 1), 100, 'T2 recommended = 100 (its own gap)');
eq(tierRecommended(item, 2), 250, 'T3 recommended = 250 (its own gap)');
eq((tierRecommended(item, 1) === (100 + 250)), false, 'Recommended is per-tier — never the summed 350 (B.7)'); // G8
eq(tierSuggested(item, 1), 108, 'T2 suggested = ceil(100/12)*12 = 108 (carton round-up)');
eq(tierSuggested(item, 2), 252, 'T3 suggested = ceil(250/12)*12 = 252');
eq(effectiveOrderQty(item, 1, undefined), 108, 'Order Qty unedited → defaults to Suggested (108)');       // G8
eq(effectiveOrderQty(item, 1, { orderQty: 96 }), 96, 'explicit edit overrides the Suggested default');
var live = { boxSize: 12 };
eq(tierRecommended(live, 0), null, 'live-DB placeholder (no calc) → Recommended null → "--" (D)');
eq(firstShortageTier(live), null, 'live: no calc → no first-shortage tier');

// ---- H — carton breakdown / partial (RETAINED) ----
eq(cartonBreak(108, 12).isPartial, false, 'full-carton qty (108, box 12) → no Partial (G9)');
eq(cartonBreak(108, 12).full, 9, '108/12 = 9 full cartons');
var p = cartonBreak(100, 12);
eq(p.isPartial, true, 'partial qty (100, box 12) → Partial (G10)');
eq(p.full + '/' + p.loose, '8/4', '100 = 8 cartons + 4 loose units');
eq(p.isValid, true, 'partial carton is VALID (non-blocking, saveable) (G10)');
eq(cartonBreak(-5, 12).isValid, false, 'negative qty → invalid (blocking) (G11)');
eq(cartonBreak('abc', 12).isValid, false, 'non-numeric qty → invalid (blocking) (G11)');

// ============================================================================================
// SOURCE-SCAN GUARDS — prove Aging/DOS were removed from Request Order and the 3 blocks remain.
// ============================================================================================
var roJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'pages', 'request-order.js'), 'utf8');
var roCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'pages', 'request-order.css'), 'utf8');

// G1/G2/G3 — no DOS chip / 90+ / 180+ aging rendering in Request Order
eq(/ro-dos-chip/.test(roJs), false, 'G3: request-order.js does NOT render a DOS chip');
eq(/ro-aging-badge/.test(roJs), false, 'G1/G2: request-order.js does NOT render 90+/180+ aging badges');
eq(/_roDosBand|_roAgingView|_roAgingBadgeCls|_roAgingDosFor/.test(roJs), false, 'G: RO DOS/aging helper functions removed');
// G4 — no page-level inventory-health fetch for UI aging
eq(/getAmazonInventoryHealthSnapshot/.test(roJs), false, 'G4: request-order.js does NOT call getAmazonInventoryHealthSnapshot (no UI aging fetch)');
eq(/getAmazonWeeklySalesSnapshot/.test(roJs), false, 'A9: request-order.js no longer calls getAmazonWeeklySalesSnapshot for DOS');
// G5 — RO no longer reaches into IRMap (shared helper untouched, just not called from RO for aging)
eq(/\bIRMap\b/.test(roJs), false, 'G5: request-order.js does not reference IRMap (shared helper left intact elsewhere)');
// CSS cleanup
eq(/\.ro-dos--|\.ro-aging-badge/.test(roCss), false, 'RO CSS: DOS band + aging badge styles removed');

// G6 — three decision blocks preserved (not reverted to 4-area or old 6-card v5)
eq(/ro-sku-expand-grid--v6/.test(roJs), true, 'G6: three-block v6 grid preserved');
eq(/ro-block--forecast/.test(roJs) && /ro-block--supply/.test(roJs) && /ro-block--recommend/.test(roJs), true, 'G6: Achievement&Forecast + Factory Supply + Recommendation blocks present');
eq(/ro-sku-expand-grid--v5/.test(roJs), false, 'G6: old six-card v5 grid not used');
// Retained behaviours present in source
eq(/_roCartonBreak/.test(roJs) && /_roFirstShortageTier/.test(roJs) && /_roTierSuggested/.test(roJs), true, 'retained: carton/first-shortage/suggested helpers present');
eq(/ro-partial-warn/.test(roJs) && /ro-partial-badge/.test(roJs), true, 'retained: non-blocking partial warning + badge');
// Site Stock cell reverted to a plain single value cell
eq(/<div class="scroll-cell ro-group-start">\$\{_roFmt\(item\.siteStock\)\}<\/div>/.test(roJs), true, 'A: Site Stock cell shows the canonical quantity only');

// ---- 2026-07-24 intrinsic-width + decision-UI cleanup ----
// Demand rule (mirror): Demand = Adjusted Basic FC(month) + Special Event(month); missing → null (not fake 0, not T3 copy)
function demandForMonth(basicFc, targetPct, specialQty) {
  var basic = (basicFc == null) ? null : Math.round(basicFc * (targetPct / 100));
  var special = specialQty || 0;
  if (basic == null && !special) return null;
  return (basic || 0) + special;
}
eq(demandForMonth(1000, 100, 0), 1000, 'demand = adjusted basic FC (Target 100%)');
eq(demandForMonth(1000, 80, 200), 1000, 'demand = basic*0.8 + special = 800 + 200');
eq(demandForMonth(null, 100, 0), null, 'T4 missing Month+4 source + no special → null (shows --, never fake 0)');
eq(demandForMonth(null, 100, 150), 150, 'demand from special-only when basic month absent');

// Engine T4 demand projection (mirror): t4Fc = fcMonth4*tf + campaign4*ctf; null when no source; no shortage
function t4Fc(fcMonth4, tf4, c4, ctf4) { return (fcMonth4 == null) ? null : ((fcMonth4 * tf4) + (c4 * ctf4)); }
eq(t4Fc(1000, 1, 0, 1), 1000, 'engine t4Fc = fcMonth4*tf + campaign*ctf');
eq(t4Fc(1200, 0.8, 100, 1), 1060, 'engine t4Fc applies target + campaign factors');
eq(t4Fc(null, 1, 0, 1), null, 'engine t4Fc null when Month+4 not provided (no fake 0)');

// B — Demand Summary T1–T4 (T4 = Month+4); Order Allocation T1–T3, NO Recommended column
eq(/Demand Summary/.test(roJs), true, 'B: Demand Summary subsection present');
eq(/\['T1', 'T2', 'T3', 'T4'\]/.test(roJs), true, 'B: Demand Summary covers T1–T4');
eq(/_roNextMonths\(4\)/.test(roJs), true, 'B: T4 uses the Month+4 window (next 4 months)');
eq(/ro-demand-table/.test(roJs), true, 'B: demand table rendered');
var recHeader = (roJs.match(/ro-rec-table[\s\S]{0,220}?<\/tr>/) || [''])[0];
eq(/Recommended/.test(recHeader), false, 'A: Order Allocation has NO visible Recommended column');
eq(/Suggested/.test(recHeader) && /Order Qty/.test(recHeader) && /Carton/.test(recHeader) && /Note/.test(recHeader), true, 'A: Order Allocation columns = Suggested / Order Qty / Carton / Note');

// Engine source: T4 demand output only; T1–T3 recursion intact; no T4 shortage
var engineJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'forecast-engine.js'), 'utf8');
eq(/t4Fc/.test(engineJs), true, 'engine: t4Fc demand projection added');
eq(/shortageMonth4/.test(engineJs), false, 'engine: NO shortageMonth4 (T4 is not a Request Bucket)');
eq(/shortageMonth1/.test(engineJs) && /shortageMonth2/.test(engineJs) && /shortageMonth3/.test(engineJs), true, 'engine: T1–T3 recursion intact');

// D — Basic/Special FC stacked (no side-by-side subgrid in the panel markup)
eq(/ro-expand-fc-split/.test(roJs), false, 'D: Basic/Special FC stacked — no side-by-side fc-split');

// E — auxiliary prose removed from the user-facing panel
['live-DB forecast-engine connection not enabled', 'Evidence shown in Demo Data', 'there is no T4 term',
 'gaps are never summed', 'not a full-month recalculation', 'Replenishment Model',
 'never written to factory_stock', 'Special Event FC stays traceable'].forEach(function (p) {
  eq(roJs.indexOf(p) === -1, true, 'E: prose removed → "' + p.slice(0, 30) + '…"');
});

// Intrinsic width: grid uses content-growing tracks (not minmax(0,fr)) + panel grows to content
eq(/minmax\(300px, max-content\)/.test(roCss), true, 'C: v6 grid tracks grow to content (no minmax(0,fr) collapse)');
eq(/minmax\(0, 34fr\)/.test(roCss), false, 'C: old collapsing minmax(0,fr) tracks removed');

// ============================================================================================
// B1 — Whole-row expand (delegated; interactive controls excluded; keyboard + ARIA)
// ============================================================================================
eq(/_roBindRowExpandDelegation/.test(roJs), true, 'B1: delegated row-expand binder present');
// Event delegation (bound once to the persistent body containers, not per row)
eq(/getElementById\('ro-fixed-body'\)|'ro-fixed-body'/.test(roJs) && /_roExpandBound/.test(roJs), true, 'B1: delegation bound once on the body containers (survives re-render)');
// Interactive-control exclusions — clicking these must NOT toggle the row
eq(/_roIsInteractiveTarget/.test(roJs), true, 'B1: interactive-target guard present');
var interTags = (roJs.match(/RO_INTERACTIVE_TAGS = \{[\s\S]{0,160}?\}/) || [''])[0];
['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'].forEach(function (t) {
  eq(new RegExp('\\b' + t + '\\b').test(interTags), true, 'B1: interactive tag excluded — ' + t);
});
eq(/isContentEditable/.test(roJs), true, 'B1: contentEditable excluded from row toggle');
eq(/role === 'button'|role === 'link'|role === 'checkbox'|role === 'radio'/.test(roJs), true, 'B1: ARIA interactive roles excluded from row toggle');
// Keyboard: Enter / Space
eq(/event\.key==='Enter'\|\|event\.key===' '/.test(roJs) || /e\.key !== 'Enter' && e\.key !== ' '/.test(roJs), true, 'B1: Enter/Space activates expand');
// ARIA disclosure state on the toggle control + aria-controls → panel id
eq(/aria-expanded="\$\{isExpanded \? 'true' : 'false'\}"/.test(roJs), true, 'B1: toggle carries aria-expanded synced to state');
eq(/aria-controls="\$\{panelId\}"/.test(roJs), true, 'B1: toggle aria-controls points at the panel id');
eq(/_roPanelId/.test(roJs), true, 'B1: stable panel id helper present');
eq(/role="button"/.test(roJs), true, 'B1: disclosure toggle exposed as a button');
// The gear affordance no longer carries its own onclick (whole-row delegation handles it → no double toggle)
eq(/ro-request-order-icon[^>]*onclick/.test(roJs), false, 'B1: gear icon has no inline onclick (row delegation toggles it)');

// ============================================================================================
// B2 — Base FC / Special FC unified matrix (grouped headers; multiple events; Special never × Target%)
// ============================================================================================
eq(/ro-forward-fc-table/.test(roJs), true, 'B2: single Forward Forecast matrix table rendered');
eq(/colspan="2" class="ff-group ff-group-base">Base FC/.test(roJs), true, 'B2: grouped header — Base FC spans FC Qty + Target %');
eq(/colspan="4" class="ff-group ff-group-special">Special FC/.test(roJs), true, 'B2: grouped header — Special FC spans Event/Date/Prep/FC Qty');
eq(/rowspan="' \+ span \+ '"/.test(roJs), true, 'B2: Month + Base cells rowspan the event rows (month shown once, demand not duplicated)');
eq(/Math\.max\(1, evs\.length\)/.test(roJs), true, 'B2: multiple events in a month → one row each (span = event count)');
// Visible label is "Base FC", the old separate "Basic FC" table/subtitle is gone
eq(/Basic FC · Adjusted by Target %/.test(roJs), false, 'B2: old separate "Basic FC" subtitle removed');
eq(/Forward Forecast · Base FC/.test(roJs), true, 'B2: unified matrix subtitle uses "Base FC"');
// The old standalone events table markup is no longer rendered by the panel
eq(/ro-expand-table--events/.test(roJs), false, 'B2: standalone Special-Event FC table removed (merged into the matrix)');
// Special FC region uses the raw event qty (never multiplied by Target%); Target% lives on the Base side only
var ffBuilder = (roJs.match(/var ffRows = next3\.map[\s\S]{0,1400}?\}\)\.join\(''\);/) || [''])[0];
eq(ffBuilder.length > 0, true, 'B2: Forward Forecast matrix builder located');
eq(/_roTargetPct\(item, mo\)/.test(ffBuilder), true, 'B2: Base FC column applies Target %');
eq(/ev\.qty > 0/.test(ffBuilder), true, 'B2: Special FC shows the raw event qty (never × Target%)');

console.log('\n' + (fail ? fail + ' FAILURE(S)' : 'ALL PASS'));
process.exit(fail ? 1 : 0);
