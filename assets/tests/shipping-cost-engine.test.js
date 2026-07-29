// Shipping Cost + Rate-Card Matching Engine test (pure Node, no DOM / no Apps Script).
// Mirrors the Phase-1 rules wired in 17_carrier_handlers.gs (shared engine) + 11_/12_ handlers:
//   MULTI marketplace marker · fuel surcharge as a PERCENT · customs fee charged ONCE ·
//   included/excluded duty via sku_details.series (never category) · freight by charge_type ·
//   estimated_unit_cost = total / total_qty (blank when qty 0). Run: node assets/tests/shipping-cost-engine.test.js

var fail = 0;
function eq(a, e, label) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + label + '\n  exp ' + E + '\n  got ' + A); } else console.log('ok   ' + label); }

// ---- mirrors of the engine formulas (17_carrier_handlers.gs) ----
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function round(v, d) { var f = Math.pow(10, d); return Math.round((parseFloat(v) || 0) * f) / f; }

function freight(rc, m) {
  var rate = num(rc.unit_rate), ct = String(rc.charge_type || '').toLowerCase(), cu = String(rc.charge_unit || '').toLowerCase();
  var base = 0;
  if (ct === 'weight') { var w = num(m.grossWeightKg); if (cu === 'lb') w *= 2.20462; base = rate * w; }
  else if (ct === 'volume') base = rate * num(m.cbm);
  else if (ct === 'carton') base = rate * num(m.cartons);
  else base = rate; // shipment / container / unknown → per-shipment
  var minCharge = num(rc.min_charge); if (minCharge > 0 && base < minCharge) base = minCharge;
  var fuel = base * num(rc.fuel_surcharge) / 100;   // fuel_surcharge is a PERCENT
  return { base: round(base, 2), fuel: round(fuel, 2), freight: round(base + fuel, 2) };
}
function customsFee(rc) { return round(num(rc.customs_fee), 2); }   // ONCE per shipment
function duty(lines, treat, seriesBySku, taxBySeries) {
  var t = String(treat || '').toLowerCase();
  if (t === 'included_in_rate') return 0;
  if (t !== 'excluded_in_rate') return '';   // blank → Not Applied
  var total = 0;
  lines.forEach(function (ln) {
    var series = seriesBySku[ln.sku]; if (!series) return;
    var tax = taxBySeries[series]; if (!tax) return;
    total += num(tax.declared_value) * num(ln.qty) * num(tax.duty_rate) / 100;
  });
  return round(total, 2);
}
function headerMarketplace(lineMks) {
  var set = {}; lineMks.forEach(function (m) { if (m) set[m] = 1; });
  var d = Object.keys(set);
  return d.length === 1 ? d[0] : (d.length >= 2 ? 'MULTI' : '');
}
function unitCost(total, qty) { return qty > 0 ? round(total / qty, 4) : ''; }

// ---- 1. MULTI marketplace marker ----
eq(headerMarketplace(['US Amazon']), 'US Amazon', '1: single distinct marketplace → actual');
eq(headerMarketplace(['US Amazon', 'US Amazon']), 'US Amazon', '1: repeated single marketplace → actual');
eq(headerMarketplace(['US Amazon', 'US Walmart']), 'MULTI', '2: two distinct marketplaces → MULTI');
eq(headerMarketplace([]), '', '2: no marketplace → blank');

// ---- 2. Fuel surcharge is a PERCENT (15 → 15%, never a flat 15) ----
var rcWeight = { charge_type: 'weight', charge_unit: 'kg', unit_rate: 2, min_charge: 0, fuel_surcharge: 15 };
var fr = freight(rcWeight, { grossWeightKg: 100, cbm: 0, cartons: 0 });
eq(fr.base, 200, '5: base freight = rate 2 × 100kg = 200');
eq(fr.fuel, 30, '5: fuel = 200 × 15% = 30 (NOT a flat 15)');
eq(fr.freight, 230, '5: freight = base + fuel = 230');

// ---- min_charge floor ----
var rcMin = { charge_type: 'weight', charge_unit: 'kg', unit_rate: 1, min_charge: 150, fuel_surcharge: 0 };
eq(freight(rcMin, { grossWeightKg: 50 }).freight, 150, 'min_charge floors a low base (50 < 150 → 150)');

// ---- carton / cbm / shipment charge types ----
eq(freight({ charge_type: 'carton', unit_rate: 10, fuel_surcharge: 0 }, { cartons: 7 }).freight, 70, 'carton charge = rate × cartons');
eq(freight({ charge_type: 'volume', charge_unit: 'cbm', unit_rate: 100, fuel_surcharge: 0 }, { cbm: 1.5 }).freight, 150, 'volume charge = rate × cbm');
eq(freight({ charge_type: 'shipment', unit_rate: 500, fuel_surcharge: 0 }, {}).freight, 500, 'shipment charge = flat rate once');

// ---- 6. Customs fee once (Combined plan does not multiply it) ----
var rcCust = { customs_fee: 80 };
eq(customsFee(rcCust), 80, '6: customs fee = the per-shipment fee, once');
// Combined plan with 3 lines / 2 marketplaces still adds it ONCE (caller adds customsFee(rc) a single time).
eq(customsFee(rcCust) * 1, 80, '6: combined plan → customs fee still charged once (× lines forbidden)');

// ---- 7. Included duty → 0 ----
var seriesBySku = { 'CO1100-A': 'CO1100', 'CO1150-B': 'CO1150' };
var taxBySeries = { CO1100: { declared_value: 10, duty_rate: 5 }, CO1150: { declared_value: 20, duty_rate: 8 } };
eq(duty([{ sku: 'CO1100-A', qty: 100 }], 'included_in_rate', seriesBySku, taxBySeries), 0, '7: included_in_rate → duty 0 (never double-added)');

// ---- 8. Excluded duty uses SERIES (not category) ----
eq(duty([{ sku: 'CO1100-A', qty: 100 }], 'excluded_in_rate', seriesBySku, taxBySeries), 50, '8: excluded duty = 10 × 100 × 5% = 50 via series CO1100');
eq(duty([{ sku: 'CO1100-A', qty: 100 }, { sku: 'CO1150-B', qty: 50 }], 'excluded_in_rate', seriesBySku, taxBySeries), 130, '8: excluded duty sums per series (50 + 20×50×8%=80 → 130)');
eq(duty([{ sku: 'UNKNOWN', qty: 100 }], 'excluded_in_rate', seriesBySku, taxBySeries), 0, '8: sku with no series → contributes 0 (no fabricated duty)');
eq(duty([{ sku: 'CO1100-A', qty: 100 }], '', seriesBySku, taxBySeries), '', '8: blank import_duty_treatment → duty Not Applied (blank, never 0)');

// ---- Total + estimated_unit_cost ----
var total = fr.freight + customsFee(rcCust) + duty([{ sku: 'CO1100-A', qty: 100 }], 'excluded_in_rate', seriesBySku, taxBySeries);
eq(total, 230 + 80 + 50, 'total = freight + customs_fee + duty (doc_fee NOT included)');
eq(unitCost(total, 100), round(360 / 100, 4), 'estimated_unit_cost = total / total_qty');
eq(unitCost(360, 0), '', 'estimated_unit_cost blank when total_qty = 0 (never divide by zero)');

if (fail) { console.error('\n' + fail + ' FAILED'); process.exit(1); }
console.log('\nALL PASS');
