// Kitchen Mama Operation System — Planning Model demand split (F1-4B-FM5-R4UI-R3).
// Run: node assets/tests/planning-model-demand-split-f1-4b-fm5r4uir3.test.js
// -----------------------------------------------------------------------------
// The canonical day-horizon owner (KMHP) now splits demand on the SKU's replenishment_model:
//   • sales_driven    — daily demand = the canonical KMCALC.normalizedAvgSalesPerDay run-rate (FLAT per elapsed day);
//                       monthly regular FC + Target% NEVER enter this path.
//   • forecast_driven — daily demand = monthly Target%-adjusted regular FC ÷ that month's real days (unchanged).
// Special-event prep-dated demand is additive in BOTH paths, count-once. An unknown mode, or a sales_driven call
// with no finite avgSalesPerDay, FAILS CLOSED (no fabricated 0, no silent substitution). This is the pure heart of
// R4UI-R3: it proves the OLD forecast-derived D45 (=2804) cannot occur for a Sales-Driven SKU.

var KMHP = require('../js/core/supply-planning-horizon-projection.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function byW(hr) { var m = {}; (hr.horizons || []).forEach(function (h) { m[h.windowCode] = h; }); return m; }

var CALC = '2026-08-07';   // fixed calc date (no clock)
var UPC = 12;

// -------------------------------------------------------------------------------------------------------------
section('A/C — Sales-Driven uses the canonical run-rate; regular FC + Target% never enter the path');
// A Sales-Driven SKU: avg 178.4/day. Provide a DELIBERATELY LARGE regularFcByMonth that WOULD dominate the forecast
// path — it must be ignored entirely under sales_driven.
var salesRes = KMHP.projectHorizons({
  destination: null, calculationDate: CALC, openingSupplyQty: 7850,
  regularFcByMonth: { '2026-08': 999999, '2026-09': 999999, '2026-10': 999999, '2026-11': 999999 },   // must be ignored
  demandMode: 'sales_driven', avgSalesPerDay: 178.4, incomingEvents: [], unitsPerCarton: UPC
});
ok(salesRes.ready === true, 'A1 sales_driven projection is ready');
eq(salesRes.meta.demandMode, 'sales_driven', 'A2 meta records demandMode=sales_driven');
eq(salesRes.meta.avgSalesPerDay, 178.4, 'A3 meta records the resolved run-rate (trace)');
var S = byW(salesRes);
// demand = avg × N (flat run-rate), independent of the huge FC.
eq(S.D18.demandQty, Math.round(178.4 * 18), 'A4 D18 demand = avg×18 (NOT the 999999 FC)');
eq(S.D30.demandQty, Math.round(178.4 * 30), 'A5 D30 demand = avg×30');
eq(S.D45.demandQty, Math.round(178.4 * 45), 'A6 D45 demand = avg×45');
eq(S.D90.demandQty, Math.round(178.4 * 90), 'A7 D90 demand = avg×90');
ok(S.D45.demandQty === 8028, 'C1 D45 sales demand is the run-rate 8028 (Target% never applied)');

section('L — CO1100-R Sales-Driven D45 regression: the OLD forecast D45=2804 authority is gone');
// Same opening/incoming, but drive the FORECAST path with an FC curve tuned so the forecast D45 ≈ 2804. Then prove
// the sales path yields a DIFFERENT, run-rate-derived D45 — i.e. the mode actually changes which authority produces
// the number, and 2804 can no longer appear for a Sales-Driven SKU unless the run-rate legitimately produces it.
var fcCurve = { '2026-08': 6000, '2026-09': 6000, '2026-10': 6000, '2026-11': 6000 };   // ~197/day → forecast D45 ≈ 8873 gross
var fcRes = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 7850, regularFcByMonth: fcCurve, demandMode: 'forecast_driven', incomingEvents: [], unitsPerCarton: UPC });
var F = byW(fcRes);
ok(fcRes.ready === true, 'L1 forecast_driven projection ready (control)');
ok(F.D45.gapQty !== S.D45.gapQty, 'L2 forecast D45 gap ≠ sales D45 gap (the mode changes the demand authority)');
// Sales D45: gross 8028 vs opening 7850 → gap ≈ 178, NOT ~2804. Prove it is the run-rate result, not a forecast one.
eq(S.D45.gapQty, Math.max(0, 8028 - 7850), 'L3 sales D45 gap = max(0, avg×45 − Site Stock) = 178 (run-rate, not forecast)');
ok(S.D45.gapQty !== 2804, 'L4 sales D45 gap is NOT the old forecast-derived 2804');
ok(S.D45.gapQty === 178, 'L5 sales D45 gap is exactly the run-rate net (178)');

section('B/D — Forecast-Driven still consumes regular FC (Target% applied upstream); backward compatible default');
// D18 forecast demand = daily (6000/31 for Aug days) accumulated — must be > 0 and driven by FC, not a flat rate.
ok(F.D18.demandQty > 0 && F.D18.demandQty !== Math.round(178.4 * 18), 'B1 forecast D18 demand comes from the FC curve, not a sales rate');
var defRes = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 7850, regularFcByMonth: fcCurve, incomingEvents: [], unitsPerCarton: UPC });   // no demandMode
eq(defRes.meta.demandMode, 'forecast_driven', 'B2 absent demandMode defaults to forecast_driven (backward compatible)');
eq(byW(defRes).D45.demandQty, F.D45.demandQty, 'B3 default path is identical to explicit forecast_driven');

section('E/F — Special-event prep demand additive ONCE in BOTH paths (count-once)');
var sev = [{ prepDate: '2026-08-20', qty: 500 }];   // within D18 (Aug 7 +18 = Aug 25) → hits D18/D30/D45/D90
var salesSev = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 0, regularFcByMonth: {}, demandMode: 'sales_driven', avgSalesPerDay: 100, specialEventDemands: sev, incomingEvents: [], unitsPerCarton: UPC });
var SS = byW(salesSev);
eq(SS.D18.demandQty, Math.round(100 * 18) + 500, 'E1 sales D18 demand = run-rate×18 + one 500 event (additive once)');
eq(SS.D90.demandQty, Math.round(100 * 90) + 500, 'E2 sales D90 still includes the SAME event exactly once (not re-added per window)');
var fcSev = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 0, regularFcByMonth: { '2026-08': 310, '2026-09': 300, '2026-10': 310, '2026-11': 300 }, demandMode: 'forecast_driven', specialEventDemands: sev, incomingEvents: [], unitsPerCarton: UPC });
var FS = byW(fcSev), fcNoSev = byW(KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 0, regularFcByMonth: { '2026-08': 310, '2026-09': 300, '2026-10': 310, '2026-11': 300 }, demandMode: 'forecast_driven', incomingEvents: [], unitsPerCarton: UPC }));
eq(FS.D18.demandQty - fcNoSev.D18.demandQty, 500, 'F1 forecast D18 adds the event exactly once (delta = 500)');
eq(FS.D90.demandQty - fcNoSev.D90.demandQty, 500, 'F2 forecast D90 adds the SAME event exactly once (no double count across windows)');

section('G — unknown / missing Planning Model fails CLOSED (never guessed)');
var unk = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 10, regularFcByMonth: {}, demandMode: 'whatever', unitsPerCarton: UPC });
ok(unk.ready === false && unk.issues[0].code === 'PLANNING_MODEL_UNKNOWN', 'G1 unknown demandMode → PLANNING_MODEL_UNKNOWN (fail closed)');
var noRate = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 10, regularFcByMonth: {}, demandMode: 'sales_driven', unitsPerCarton: UPC });
ok(noRate.ready === false && noRate.issues[0].code === 'SALES_BASIS_UNAVAILABLE', 'G2 sales_driven with no avgSalesPerDay → SALES_BASIS_UNAVAILABLE (never a fabricated 0)');
var negRate = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 10, regularFcByMonth: {}, demandMode: 'sales_driven', avgSalesPerDay: -5, unitsPerCarton: UPC });
ok(negRate.ready === false && negRate.issues[0].code === 'SALES_BASIS_UNAVAILABLE', 'G3 negative run-rate → SALES_BASIS_UNAVAILABLE');

section('valid-zero — a genuine 0 run-rate is a real value, never fail-closed');
var zero = KMHP.projectHorizons({ destination: null, calculationDate: CALC, openingSupplyQty: 100, regularFcByMonth: {}, demandMode: 'sales_driven', avgSalesPerDay: 0, unitsPerCarton: UPC });
ok(zero.ready === true, 'Z1 avgSalesPerDay=0 is a valid rate (ready)');
eq(byW(zero).D90.demandQty, 0, 'Z2 zero run-rate → zero demand (no shortage), not a block');

section('suggested qty stays the KMCALC carton owner (no page/second math)');
ok(S.D90.suggestedOrderQty !== null && S.D90.suggestedOrderQty % UPC === 0, 'SQ1 sales D90 suggested is a carton multiple (KMCALC owner)');
eq(S.D30.suggestedOrderQty, 0, 'SQ2 sales D30 gap 0 → suggested 0');

console.log('\n----------------------------------------');
console.log('PLANNING MODEL DEMAND SPLIT (F1-4B-FM5-R4UI-R3): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
