// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE9 Inventory sales-velocity authority unification.
// Run: node assets/tests/sales-velocity-authority-f1-4b-fm5r4jlive9.test.js
// -----------------------------------------------------------------------------
// Closes SALES_DOS_HORIZON_AUTHORITY_DIVERGENCE: the Inventory main table's Sales-Driven Avg Sales/day + Days of
// Supply must CONSUME the SAME canonical rate the D18/D30/D45/D90 horizon uses (horizonBasis.avgSalesPerDay,
// KMCALC-normalized), carried verbatim from recommendation.workspace.get — NOT the weekly sales_units_7d/7, and
// NEVER recomputed on the page. Forecast-Driven + the weekly Sales Trend chart are untouched. Unavailable canonical
// rate → '--' (no silent weekly fallback); when no basis resolves (workspace off) the weekly display is preserved.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var IRSRC = read('js/pages/inventory-replenishment.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { if (JSON.stringify(a) !== JSON.stringify(e)) { fail++; console.error('FAIL ' + l + '\n  exp ' + JSON.stringify(e) + '\n  got ' + JSON.stringify(a)); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Extract the self-contained resolver and bind its free `_irRecoState` to an injected fake (no window needed).
function extractBasisFn(src) {
  var start = src.indexOf('function _irCanonicalSalesBasis_');
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var p = i; p < src.length; p++) { if (src[p] === '{') depth++; else if (src[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  var body = src.slice(start, end);
  return new Function('_irRecoState', body + '\nreturn _irCanonicalSalesBasis_;');
}
var makeBasis = extractBasisFn(IRSRC);

section('_irCanonicalSalesBasis_ — CARRIES the MARKETPLACE line horizonBasis (never recomputes)');
(function () {
  var state = { scope: { country: 'US' }, linesBySku: { 'CO1100-R': [
    { destinationType: 'WAREHOUSE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 999 } },   // must be ignored
    { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08, horizonOpeningQty: 8344, qualifiedIncomingCount: 0 } }
  ] } };
  var fn = makeBasis(state);
  eq(fn('CO1100-R'), { demandMode: 'sales_driven', avgSalesPerDay: 139.08, horizonOpeningQty: 8344, qualifiedIncomingCount: 0 }, 'A resolves the MARKETPLACE line horizonBasis (ignores WAREHOUSE lines)');
  ok(makeBasis({ scope: null, linesBySku: {} })('CO1100-R') === null, 'B no scope loaded → null (caller keeps weekly display)');
  ok(makeBasis({ scope: {}, linesBySku: { X: [{ destinationType: 'MARKETPLACE', horizonBasis: null }] } })('X') === null, 'C MARKETPLACE line without horizonBasis → null');
  ok(makeBasis({ scope: {}, linesBySku: {} })('CO1100-R') === null, 'D SKU absent → null');
})();

section('display-override arithmetic — canonical rate wins for Sales-Driven; 139.08 → 139.1 (≠ weekly 178.4)');
(function () {
  function avgDisplay(cr) { return (Math.round(cr * 10) / 10).toFixed(1); }
  function dos(stock, rate) { if (!rate || rate <= 0) return null; return Math.round((stock / rate) * 10) / 10; }
  ok(avgDisplay(139.08) === '139.1', 'canonical Avg Sales/day rounds 139.08 → 139.1 (spec §6A)');
  ok(avgDisplay(139.08) !== (178.4).toFixed(1), 'canonical (139.1) differs from the old weekly display (178.4) — divergence closed');
  var d = dos(8344, 139.08); ok(Math.abs(d - 60.0) < 0.05, 'Days of Supply = 8344 / 139.08 ≈ 60.0 (coherent: SiteStock / Avg Sales/day, §7)');
  ok(dos(8344, 0) === null, 'rate 0 → DoS null → renders "--" (safe no-demand, §3)');
})();

section('source contract — Avg Sales/day + DoS consume the canonical basis (§2/§3)');
var render = IRSRC.slice(IRSRC.indexOf('var _avgDisplay = avg.toFixed(1);'), IRSRC.indexOf('var _avgDisplay = avg.toFixed(1);') + 900);
ok(/_canonBasis && _canonBasis\.demandMode === 'sales_driven'/.test(render), '§2 override applies ONLY when the canonical basis is sales_driven (Forecast-Driven untouched)');
ok(/_cr == null\) \{ _avgDisplay = '--'; _dosDisplay = '--'; \}/.test(render), '§3 unavailable canonical rate → "--" (no silent weekly fallback)');
ok(/IR\.daysOfSupply\(currentStock, _cr\)/.test(render), '§3 DoS = SiteStock / canonicalRate via the EXISTING IR.daysOfSupply helper (no new calculator)');
ok(/avgDailySales: _avgDisplay/.test(IRSRC) && /daysOfSupply: _dosDisplay/.test(IRSRC), 'row DTO emits the canonical-aware Avg Sales/day + Days of Supply');

section('source contract — carry-not-recompute wiring (§1) + no new calculator (§8)');
ok(/horizonBasis:\s*\(L\.horizonBasis/.test(IRSRC), '§1 _irRecoMapLine carries horizonBasis from the workspace response');
ok(/function _irRecoTrigger\(\)[\s\S]{0,600}loadRecommendationWorkspace_\(\);\s*\n\}/.test(IRSRC), '§1 _irRecoTrigger issues the workspace read (sources horizonBasis even in materialized mode)');
ok(/destinationType === 'MARKETPLACE' && lines\[i\]\.horizonBasis/.test(IRSRC), 'basis is marketplace-grain (warehouse lines carry none)');
ok(!/KMCALC\.normalizedAvgSalesPerDay/.test(IRSRC), '§8 NO page-side canonical-rate calculator (KMCALC.normalizedAvgSalesPerDay never called on the page)');

section('§4/§5/§8 — no formula change: weekly owner + Sales Trend chart untouched');
ok(/function avgSalesPerDay\(weeklyRows, scope\)/.test(IRSRC) && /Math\.round\(\(units \/ 7\) \* 10\) \/ 10/.test(IRSRC), 'the weekly avgSalesPerDay owner is unchanged (still sales_units_7d/7 — used for Forecast-Driven + fallback display)');
ok(/function salesTrend7d\(/.test(IRSRC), '§5 Sales Trend (Past Week) owner untouched (observational history, not conflated with planning velocity)');

console.log('\n----------------------------------------');
console.log('SALES VELOCITY AUTHORITY (F1-4B-FM5-R4J-LIVE9): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
