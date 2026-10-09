// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE9 Inventory sales-velocity authority unification.
// Run: node assets/tests/sales-velocity-authority-f1-4b-fm5r4jlive9.test.js
// -----------------------------------------------------------------------------
// Closes SALES_DOS_HORIZON_AUTHORITY_DIVERGENCE: the Inventory main table's Sales-Driven Avg Sales/day + Days of
// Supply must CONSUME the SAME canonical rate the D18/D30/D45/D90 horizon uses (horizonBasis.avgSalesPerDay,
// KMCALC-normalized), carried verbatim from recommendation.workspace.get — NOT the weekly sales_units_7d/7, and
// NEVER recomputed on the page. Forecast-Driven + the weekly Sales Trend chart are untouched. Unavailable canonical
// rate → '--' (no silent weekly fallback); when no basis resolves (workspace off) the weekly display is preserved.
//
// -----------------------------------------------------------------------------------------------
// S8-R47-A3 — §2 WAS ASSERTING A CONTRACT R46 DELIBERATELY REPLACED.
//
// THE OLD CONTRACT (pre-R46), as this suite asserted it:
//     "§2 override applies ONLY when the canonical basis is sales_driven (Forecast-Driven untouched)"
//     matched against the source text `_canonBasis && _canonBasis.demandMode === 'sales_driven'`.
//
// THE R46 CONTRACT, which is what ships today:
//     Normalized Avg. Sales is a HISTORICAL metric and is displayed in BOTH planning models. The
//     release is titled "AVG SALES STOPS BEING GATED ON THE PLANNING MODEL"; the page now emits
//     `avgDailySales: _avgDisplay,  // the canonical §22 rate for BOTH demand modes`. The
//     demandMode gate was REMOVED on purpose, so the old assertion could never pass again.
//
// WHAT DID NOT CHANGE, and is still asserted below: planning demand stays mode-governed
// (Sales-Driven inputs remain Sales-Driven-only, Forecast-Driven demand remains Forecast-governed),
// horizons[].demandQty and suggestedOrderQty are untouched, a missing canonical rate renders '--'
// rather than a fabricated 0, and the F1A stale-scope guard stays active.
//
// The old assertion is not deleted quietly — X1 below RESTORES the deleted gate as a mutant, so the
// suite still fails if anyone re-introduces it. The behaviour is now EXECUTED rather than regexed:
// the render block is extracted structurally and run under both planning models.
// -----------------------------------------------------------------------------------------------

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
  // S8-R47-A — _irCanonicalSalesBasis_ calls the F1A scope guard, which lives outside this slice.
  // new Function() sees only globals and its own parameters, so the guard goes into the body.
  var GUARD = require('./_f1a-scope-guard.js').guardPreamble(src);
  return new Function('_irRecoState', GUARD + '\n' + body + '\nreturn _irCanonicalSalesBasis_;');
}
var makeBasis = extractBasisFn(IRSRC);
// S8-R47-A3 — a REAL applied scope, keyed by the shipped resolver. Stamping '' would satisfy the
// guard while proving nothing, because '' is also what an unconfigured page returns.
var F1A = require('./_f1a-scope-guard.js');
var SCOPE_KEY = F1A.applyScope('US', 'Amazon', IRSRC);

section('_irCanonicalSalesBasis_ — CARRIES the MARKETPLACE line horizonBasis (never recomputes)');
(function () {
  // S8-R47-A — F1A requires a result to carry the scope it was produced for; an unstamped state is a
  // MISMATCH by design, never a pass. This fixture declares "produced for the applied scope" rather
  // than disabling the guard, and the negatives below prove the guard is doing real work.
  var state = { appliedScopeKey: SCOPE_KEY, scope: { country: 'US' }, linesBySku: { 'CO1100-R': [
    { destinationType: 'WAREHOUSE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 999 } },   // must be ignored
    { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08, horizonOpeningQty: 8344, qualifiedIncomingCount: 0 } }
  ] } };
  var fn = makeBasis(state);
  eq(fn('CO1100-R'), { demandMode: 'sales_driven', avgSalesPerDay: 139.08, horizonOpeningQty: 8344, qualifiedIncomingCount: 0 }, 'A resolves the MARKETPLACE line horizonBasis (ignores WAREHOUSE lines)');
  ok(makeBasis({ scope: null, linesBySku: {} })('CO1100-R') === null, 'B no scope loaded → null (caller keeps weekly display)');
  ok(makeBasis({ scope: {}, linesBySku: { X: [{ destinationType: 'MARKETPLACE', horizonBasis: null }] } })('X') === null, 'C MARKETPLACE line without horizonBasis → null');
  ok(makeBasis({ scope: {}, linesBySku: {} })('CO1100-R') === null, 'D SKU absent → null');

  // S8-R47-A3 — THE SCOPE GUARD, PROVED LIVE. Identical lines, identical horizonBasis; only the
  // scope stamp differs. A resolves 139.08 from this shape, so if the guard were absent, stubbed or
  // satisfied by the mere presence of a key, E and F would resolve 139.08 too.
  var LINES = { 'CO1100-R': [
    { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08, horizonOpeningQty: 8344, qualifiedIncomingCount: 0 } }
  ] };
  ok(makeBasis({ appliedScopeKey: F1A.MISMATCHED_SCOPE_KEY, scope: { country: 'US' }, linesBySku: LINES })('CO1100-R') === null,
    'E STALE SCOPE: a basis stamped for another scope resolves null, never another site\'s rate');
  ok(makeBasis({ scope: { country: 'US' }, linesBySku: LINES })('CO1100-R') === null,
    'F MISSING STAMP: an unstamped result is a mismatch too — absence is never a pass');
  ok(makeBasis({ appliedScopeKey: SCOPE_KEY, scope: { country: 'US' }, linesBySku: LINES })('CO1100-R') !== null,
    'G ... while the correctly-stamped twin still resolves — the guard discriminates, it does not just refuse');
})();

section('§X0 — MUTANT: the scope guard itself');
(function () {
  // Required mutant: remove/bypass the scope guard. Rebuild the resolver with the guard forced true.
  var start = IRSRC.indexOf('function _irCanonicalSalesBasis_');
  var i = IRSRC.indexOf('{', start), depth = 0, end = -1;
  for (var p = i; p < IRSRC.length; p++) { if (IRSRC[p] === '{') depth++; else if (IRSRC[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  var body = IRSRC.slice(start, end);
  var bypassed = 'function _irResultMatchesAppliedScope_(st) { return true; }\n' + body;
  var crashed = false, leaked = null;
  try {
    var fn = new Function('_irRecoState', bypassed + '\nreturn _irCanonicalSalesBasis_;')(
      { appliedScopeKey: F1A.MISMATCHED_SCOPE_KEY, scope: { country: 'US' }, linesBySku: {
        'CO1100-R': [{ destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08 } }] } });
    leaked = fn('CO1100-R');
  } catch (e) { crashed = true; }
  // A crash is not a kill: the mutant must RUN and be caught by behaviour.
  if (crashed) { fail++; console.error('FAIL X0 CRASHED (not a valid kill): scope-guard bypass'); }
  else if (leaked === null) { fail++; console.error('FAIL X0 SURVIVED: guard bypass changed nothing — E/F are not actually guard-sensitive'); }
  else { pass++; console.log('ok   X0 killed — bypassing the guard leaks another scope\'s rate, which E/F catch'); }
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

section('§2/§3 — the canonical render block, EXECUTED (both planning models)');

// S8-R47-A3 — STRUCTURAL EXTRACTION, replacing a 900-character window off a vanished anchor.
// The old anchor `var _avgDisplay = avg.toFixed(1);` no longer exists (R46 removed it), so
// indexOf returned -1 and the window was slice(-1, 899) — a ONE-CHARACTER string. Every regex
// below it failed against that, including one whose text is still present in the shipped file.
// A fixed-length window is re-armed every time the block grows; these are real boundaries.
function cutBlock(src, startAnchor, endAnchor) {
  var s = src.indexOf(startAnchor), s2 = src.indexOf(startAnchor, s + 1);
  var e = src.indexOf(endAnchor), e2 = src.indexOf(endAnchor, e + 1);
  if (s < 0) throw new Error('render block START anchor absent: ' + startAnchor);
  if (e < 0) throw new Error('render block END anchor absent: ' + endAnchor);
  if (s2 !== -1) throw new Error('render block START anchor AMBIGUOUS: ' + startAnchor);
  if (e2 !== -1) throw new Error('render block END anchor AMBIGUOUS: ' + endAnchor);
  if (e <= s) throw new Error('render block anchors out of order');
  return src.slice(s, e);
}
var BLOCK = null, blockErr = null;
try { BLOCK = cutBlock(IRSRC, 'var _avgDisplay = ', 'var _avgSource = '); } catch (e) { blockErr = e; }
// FAIL CLOSED. An extraction that could not be made proves nothing about the page, and a suite that
// quietly tests an empty string is exactly the failure this round exists to end.
ok(blockErr === null, '§2x the render block extracts from unique, unambiguous anchors' + (blockErr ? ' — ' + blockErr.message : ''));
ok(BLOCK && BLOCK.indexOf('_irCanonicalSalesBasis_(mp.sku)') !== -1 && BLOCK.indexOf('IR.daysOfSupply') !== -1,
  '§2x2 ... and the extracted text is the shipped implementation, not a fragment');

// Execute it. Requirement: behaviour, not source-text presence, wherever behaviour is testable.
function runBlock(basis, stock, src) {
  var calls = [];
  var f = new Function('mp', 'currentStock', 'IR', '_irCanonicalSalesBasis_',
    (src || BLOCK) + '\nreturn { avg: _avgDisplay, dos: _dosDisplay };');
  var out = f({ sku: 'CO1100-R' }, stock,
    { daysOfSupply: function (s, r) { calls.push([s, r]); return (!r || r <= 0) ? null : Math.round((s / r) * 10) / 10; } },
    function () { return basis; });
  out.calls = calls; return out;
}
var SALES = { demandMode: 'sales_driven', avgSalesPerDay: 139.08 };
var FORECAST = { demandMode: 'forecast_driven', avgSalesPerDay: 139.08 };

var rSales = runBlock(SALES, 8344);
var rFcst = runBlock(FORECAST, 8344);
eq(rSales.avg, '139.1', '§2a Sales-Driven displays the canonical normalized rate');
eq(rFcst.avg, '139.1', '§2b Forecast-Driven displays it TOO — R46 removed the demandMode gate');
eq(rFcst.avg, rSales.avg, '§2c both planning models display the SAME canonical rate');
eq(rFcst.dos, rSales.dos, '§2d ... and the same Days of Supply');
eq(rSales.calls[0][1], 139.08, '§3a IR.daysOfSupply is called with the CANONICAL rate, not the weekly 178.4');
eq(rSales.dos, '60', '§3b DoS = 8344 / 139.08 → 60 via the existing helper (no new calculator)');

var rMissing = runBlock(null, 8344);
eq(rMissing.avg, '--', '§3c a missing canonical rate renders "--" — never a fabricated zero');
eq(rMissing.dos, '--', '§3d ... and Days of Supply is "--" too');
ok(rMissing.avg !== '0' && rMissing.avg !== '0.0', '§3e explicitly: missing is NOT 0');
eq(rMissing.calls.length, 0, '§3f ... and no DoS is computed at all when there is no rate');

var rZero = runBlock({ demandMode: 'sales_driven', avgSalesPerDay: 0 }, 8344);
eq(rZero.avg, '0.0', '§3g a CONFIRMED zero rate is 0.0 — distinct from missing');
eq(rZero.dos, '--', '§3h ... with DoS "--" (no division by zero)');

// R46 changed DISPLAY only. These two keep that boundary honest from the display side.
ok(BLOCK.indexOf('demandMode') === -1,
  '§2e the display block no longer reads demandMode AT ALL — the gate was removed, not merely widened');
ok(BLOCK.indexOf('demandQty') === -1 && BLOCK.indexOf('suggestedOrderQty') === -1 && BLOCK.indexOf('suggestedQty') === -1,
  '§2f ... and it writes no planning quantity — demand stays mode-governed where it belongs');
// ... while the basis still CARRIES demandMode, so planning consumers keep what display gave up.
eq(makeBasis({ appliedScopeKey: SCOPE_KEY, scope: { country: 'US' }, linesBySku: { 'CO1100-R': [
  { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'forecast_driven', avgSalesPerDay: 139.08 } }] } })('CO1100-R').demandMode,
  'forecast_driven', '§2g the resolved basis still carries demandMode verbatim for the planning path');

ok(/avgDailySales: _avgDisplay/.test(IRSRC) && /daysOfSupply: _dosDisplay/.test(IRSRC), 'row DTO emits the canonical-aware Avg Sales/day + Days of Supply');

section('§X — MUTANTS against the executed render block');
var mut = 0, surv = 0;
// Every mutant below runs against an in-memory copy of the block. Nothing is written to disk, so a
// killed run cannot leave a mutated source file behind. A CRASH is never counted as a kill: a mutant
// that cannot execute tells us nothing about whether the assertions would have caught it.
function withSrc(mutated) { return function (b, s) { return runBlock(b, s, mutated); }; }

// X1 — restore the Sales-Driven-only gate R46 deleted. Forecast-Driven must stop displaying.
var m1 = BLOCK.replace('var _cr = _canonBasis ? _canonBasis.avgSalesPerDay : null;',
  "var _cr = (_canonBasis && _canonBasis.demandMode === 'sales_driven') ? _canonBasis.avgSalesPerDay : null;");
mut++; (function () {
  var r = withSrc(m1)(FORECAST, 8344);
  if (r.avg === '139.1') { surv++; fail++; console.error('FAIL X' + mut + ' SURVIVED: Sales-Driven-only gate restored'); }
  else { pass++; console.log('ok   X' + mut + ' killed — a restored demandMode gate blanks Forecast-Driven'); }
})();

// X2 — swap the canonical rate for the raw weekly sales_units_7d / 7 (178.4).
var m2 = BLOCK.replace('_canonBasis.avgSalesPerDay', '178.4');
mut++; (function () {
  var r = withSrc(m2)(SALES, 8344);
  if (r.avg === '139.1') { surv++; fail++; console.error('FAIL X' + mut + ' SURVIVED: weekly rate substituted'); }
  else { pass++; console.log('ok   X' + mut + ' killed — the raw weekly 178.4 is not the canonical 139.1'); }
})();

// X3 — turn a missing canonical rate into a silent zero.
var m3 = BLOCK.replace("var _avgDisplay = '--';", "var _avgDisplay = '0.0';");
mut++; (function () {
  var r = withSrc(m3)(null, 8344);
  if (r.avg === '--') { surv++; fail++; console.error('FAIL X' + mut + ' SURVIVED: missing->zero'); }
  else { pass++; console.log('ok   X' + mut + ' killed — a missing rate silently becoming 0.0 is caught'); }
})();

// X4 — break Days of Supply by feeding it something other than the canonical rate.
var m4 = BLOCK.replace('IR.daysOfSupply(currentStock, _cr)', 'IR.daysOfSupply(currentStock, 1)');
mut++; (function () {
  var r = withSrc(m4)(SALES, 8344);
  if (r.dos === '60' && r.calls[0][1] === 139.08) { surv++; fail++; console.error('FAIL X' + mut + ' SURVIVED: DoS rate broken'); }
  else { pass++; console.log('ok   X' + mut + ' killed — DoS computed from a non-canonical rate is caught'); }
})();

section('source contract — carry-not-recompute wiring (§1) + no new calculator (§8)');
ok(/horizonBasis:\s*\(L\.horizonBasis/.test(IRSRC), '§1 _irRecoMapLine carries horizonBasis from the workspace response');
ok(/function _irRecoTrigger\(\)[\s\S]{0,600}loadRecommendationWorkspace_\(\);\s*\n\}/.test(IRSRC), '§1 _irRecoTrigger issues the workspace read (sources horizonBasis even in materialized mode)');
ok(/destinationType === 'MARKETPLACE' && lines\[i\]\.horizonBasis/.test(IRSRC), 'basis is marketplace-grain (warehouse lines carry none)');
ok(!/KMCALC\.normalizedAvgSalesPerDay/.test(IRSRC), '§8 NO page-side canonical-rate calculator (KMCALC.normalizedAvgSalesPerDay never called on the page)');

section('§4/§5/§8 — no formula change: weekly owner + Sales Trend chart untouched');
ok(/function avgSalesPerDay\(weeklyRows, scope\)/.test(IRSRC) && /Math\.round\(\(units \/ 7\) \* 10\) \/ 10/.test(IRSRC), 'the weekly avgSalesPerDay owner is unchanged (still sales_units_7d/7 — used for Forecast-Driven + fallback display)');
ok(/function salesTrend7d\(/.test(IRSRC), '§5 Sales Trend (Past Week) owner untouched (observational history, not conflated with planning velocity)');

console.log('\n----------------------------------------');
console.log('SALES VELOCITY AUTHORITY (F1-4B-FM5-R4J-LIVE9): ' + pass + ' passed, ' + fail + ' failed, '
  + (mut + 1) + ' mutants, ' + surv + ' survived, ' + (mut >= 4 ? 'vacuity clean' : 'VACUOUS'));
if (fail > 0) { process.exitCode = 1; }
