// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE8 PART A: Sales-Driven D-horizon reconciliation + exclusions.
// Run: node assets/tests/sales-horizon-reconciliation-f1-4b-fm5r4jlive8.test.js
// -----------------------------------------------------------------------------
// Frozen Sales-Driven rule (owner KMHP): gapQty(DN) = max(0, round( avgSalesPerDay × N elapsed days
//   + Σ special-event preps(prepDate ≤ DN) − min(demand, SiteStock + Σ qualified incoming(ETA ≤ DN)) )).
// Site Stock (opening) = available_qty + fc_transfer_qty + fc_processing_qty (Amazon network only). Target%,
// regular FC, Factory, and Overseas/3PL are ALL excluded from this Inventory day-horizon. These are REPRESENTATIVE
// fixture numbers chosen to illustrate the CO1100-R arithmetic (Site Stock 8344, a ~4173 D90 gap) — they are NOT
// read from, nor claimed to equal, production DB values. The point is to prove the EQUATION + exclusions, and to
// pin the DoS↔horizon rate-authority divergence + the new read-only reconciliation diagnostic.

var KMHP = require('../js/core/supply-planning-horizon-projection.js');
var KMTPP = require('../js/core/supply-planning-time-phased-projection.js');
var KMCALC = require('../js/core/supply-planning-calculations.js');
var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var IR = read('js/pages/inventory-replenishment.js');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function H(res, wc) { return (res.horizons || []).filter(function (h) { return h.windowCode === wc; })[0] || {}; }

// CO1100-R-style Sales-Driven fixture (illustrative, NOT production values).
var CALC = '2026-08-07';           // D90 requiredBy = 2026-11-05 (90 elapsed days)
var SITE_STOCK = 8344;             // opening = Site Stock only
var CANON_RATE = 139.08;           // canonical normalized_30d run-rate → 139.08 × 90 = 12517.2 gross D90 demand
function base(over) {
  return Object.assign({ destination: null, calculationDate: CALC, openingSupplyQty: SITE_STOCK,
    regularFcByMonth: {}, specialEventDemands: [], incomingEvents: [], unitsPerCarton: 6,
    demandMode: 'sales_driven', avgSalesPerDay: CANON_RATE }, over || {});
}

section('§1/§8 — Sales D90 = canonical avgSalesPerDay × 90 elapsed days; gap reconciles to ~4173');
var r = KMHP.projectHorizons(base());
ok(r.ready === true, 'projection ready');
ok(H(r, 'D90').requiredByDate === '2026-11-05', 'D90 requiredBy = calcDate + 90 = 2026-11-05');
ok(H(r, 'D90').demandQty === 12517, 'D90 gross demand = round(139.08 × 90) = 12517 (flat run-rate × elapsed days)');
ok(H(r, 'D90').openingSupplyQty === 8344, 'D90 opening = Site Stock 8344 (no incoming in this case)');
ok(H(r, 'D90').gapQty === 4173, 'D90 gap = max(0, round(12517.2 − min(demand, 8344))) = 4173 — reconciles the CO1100-R-style figure');
ok(H(r, 'D18').demandQty === Math.round(CANON_RATE * 18) && H(r, 'D30').demandQty === Math.round(CANON_RATE * 30) && H(r, 'D45').demandQty === Math.round(CANON_RATE * 45), 'D18/D30/D45 gross demand = rate × elapsed days (18/30/45)');

section('§2/§3 — Target% and regular FC are EXCLUDED from the Sales-Driven base');
var rFc = KMHP.projectHorizons(base({ regularFcByMonth: { '2026-08': 999999, '2026-09': 999999, '2026-10': 999999, '2026-11': 999999 } }));
ok(H(rFc, 'D90').demandQty === 12517, 'a huge regular FC does NOT change Sales-Driven demand (FC not the base)');
ok(H(rFc, 'D90').gapQty === 4173, 'gap unchanged by regular FC (Target% has no input on this path — structurally excluded)');
ok(r.meta && r.meta.demandMode === 'sales_driven' && r.meta.avgSalesPerDay === CANON_RATE, 'meta records demandMode=sales_driven + the canonical avgSalesPerDay (the value the diagnostic must surface)');

section('§4/§5 — Factory + Overseas/3PL are EXCLUDED from the Inventory horizon opening (Site Stock only)');
// KMHP has NO factory/overseas input — opening is Site-Stock-only. The 42_ owner passes horizonOpening = Site Stock
// (L.currentStockQty), NOT the overseas/factory-inclusive composition used for the monthly (Order Planning) path.
ok(/var horizonOpening = recoWsNum_\(L\.currentStockQty\)/.test(F42), '§4/§5 Inventory horizon opening = L.currentStockQty (Site Stock), never the overseas/factory composition');
ok(/openingSupplyComposition/.test(F42) && /recoWsBuildMonthlyProjection_\(months, composition\.openingSupplyQty/.test(F42), 'the overseas/factory-inclusive composition is used ONLY by the monthly (Order Planning) projection, not the day-horizon');

section('§6 — qualified incoming within the horizon is counted ONCE');
var rInc = KMHP.projectHorizons(base({ incomingEvents: [{ incomingId: 'SHIP-1', eta: '2026-09-01', qty: 1000, sourceType: 'SHIPPED_IN_TRANSIT' }] }));
ok(H(rInc, 'D90').incomingAddedQty === 1000, 'one qualified incoming (ETA ≤ D90) adds exactly its qty once');
ok(H(rInc, 'D90').gapQty === 3173, 'gap drops by exactly 1000 (4173 → 3173): incoming counted once, never doubled');
ok(H(rInc, 'D18').incomingAddedQty === 0, 'an incoming with ETA after D18 does NOT cover D18 (applied on its ETA)');

section('§7/A4 — DoS uses a SEPARATE weekly rate owner → SALES_DOS_HORIZON_AUTHORITY_DIVERGENCE (documented, not silently equal)');
ok(/function avgSalesPerDay\(/.test(IR) && /sales_units_7d|salesUnits7d/.test(IR), 'Inventory UI DoS owner = IR.avgSalesPerDay reads the WEEKLY snapshot (sales_units_7d / 7)');
ok(/normalizedAvgSalesPerDay/.test(F42), 'the canonical horizon rate owner = KMCALC.normalizedAvgSalesPerDay (§22 ladder) — a DIFFERENT owner than the DoS weekly rate');

section('A2 — the new READ-ONLY reconciliation diagnostic surfaces the canonical inputs (no formula/schema change)');
ok(/mLine\.horizonBasis = \{/.test(F42), 'recommendation.workspace.get now attaches mLine.horizonBasis (additive diagnostic)');
ok(/demandMode: planModel/.test(F42) && /avgSalesPerDay: \(planModel === 'sales_driven' \? salesRate : null\)/.test(F42) && /horizonOpeningQty: horizonOpening/.test(F42), 'horizonBasis exposes demandMode + resolved avgSalesPerDay + Site-Stock opening (the inputs to reconcile a stored D-gap)');
ok(/if \(mHz\) \{[\s\S]*mLine\.horizons = mHz/.test(F42), 'diagnostic is guarded by mHz — additive only, never fabricated when horizons are absent');

section('§9/A5 — stored gap row is READ latest; no page-side recalculation');
ok(/INV_GAP_HEADERS_/.test(F43) && /d90_gap_qty/.test(F43), 'inventory_replenishment_gap stores the final d90_gap_qty (materialized owner 43_)');
ok(!/d90_demand_qty/.test(F43), 'the row stores gap/suggested only — no demand snapshot (self-reconciliation needs the diagnostic, per R7 §7 HALT)');

console.log('\n----------------------------------------');
console.log('SALES HORIZON RECONCILIATION (F1-4B-FM5-R4J-LIVE8 PART A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
