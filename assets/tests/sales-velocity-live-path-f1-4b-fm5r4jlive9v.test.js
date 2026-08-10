// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE9V Inventory canonical sales-velocity live-path fix.
// Run: node assets/tests/sales-velocity-live-path-f1-4b-fm5r4jlive9v.test.js
// -----------------------------------------------------------------------------
// ROOT CAUSE (proven): the canonical Sales-Driven rate (horizonBasis.avgSalesPerDay) arrives via the ASYNC
// recommendation.workspace.get, which completes AFTER the synchronous main-table render — so the Avg Sales/day +
// Days of Supply cells stay on the weekly fallback (178.4). The read's completion re-rendered only the summary
// cards + the Suggested cell, never the velocity cells. FIX: on completion, once a sales_driven canonical basis is
// loaded, re-render the main table ONCE so the velocity cells adopt the canonical rate. No formula change, no new
// calculator (renderReplenishment stays the sole owner), no Forecast-Driven change, no re-fire of the workspace read.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var IRSRC = read('js/pages/inventory-replenishment.js');
var FOUND = read('js/api/km-api-foundation.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

function fnBody(src, name) {
  var start = src.indexOf('function ' + name);
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var p = i; p < src.length; p++) { if (src[p] === '{') depth++; else if (src[p] === '}') { depth--; if (depth === 0) { end = p + 1; break; } } }
  return src.slice(start, end);
}
// Build _irRecoRefreshVelocityCells_ with its helper + injected free vars (_irRecoState, renderReplenishment).
function makeRefresh(state, renderFn) {
  var body = fnBody(IRSRC, '_irRecoHasSalesDrivenBasis_') + '\n' + fnBody(IRSRC, '_irRecoRefreshVelocityCells_') +
    '\n return _irRecoRefreshVelocityCells_;';
  return new Function('_irRecoState', 'renderReplenishment', body)(state, renderFn);
}
function salesBasisState() { return { status: 'READY', linesBySku: { 'CO1100-R': [
  { destinationType: 'WAREHOUSE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08 } },
  { destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'sales_driven', avgSalesPerDay: 139.08 } }
] } }; }

section('refresh re-renders the main table ONLY when a Sales-Driven canonical basis has loaded');
(function () {
  var n = 0; makeRefresh(salesBasisState(), function () { n++; })();
  ok(n === 1, 'READY + sales_driven basis → renderReplenishment called once (velocity cells pick up the canonical rate)');
})();
(function () {
  var n = 0; makeRefresh({ status: 'READY', linesBySku: { 'X': [{ destinationType: 'MARKETPLACE', horizonBasis: { demandMode: 'forecast_driven', avgSalesPerDay: null } }] } }, function () { n++; })();
  ok(n === 0, 'Forecast-Driven basis → NO re-render (Forecast-Driven display untouched)');
})();
(function () {
  var n = 0; makeRefresh({ status: 'LOADING', linesBySku: {} }, function () { n++; })();
  ok(n === 0, 'not READY → NO re-render');
})();
(function () {
  var n = 0; makeRefresh({ status: 'READY', linesBySku: {} }, function () { n++; })();
  ok(n === 0, 'READY but no lines → NO re-render');
})();

section('both workspace-read completion paths refresh the velocity cells');
ok((IRSRC.match(/_irRecoRefreshVelocityCells_\(\);/g) || []).length >= 2, 'network + cache-hit completion paths both call _irRecoRefreshVelocityCells_');
ok(/_irRecoUpdateSuggestedCells\(\);\s*\n\s*_irRecoRefreshVelocityCells_\(\);/.test(IRSRC), 'the refresh runs right after the existing summary/suggested patch on completion');

section('no loop + no new calculator');
// renderReplenishment must NOT re-fire the async workspace read (else the refresh would loop).
var renderBody = fnBody(IRSRC, 'renderReplenishment');
ok(!/_irRecoTrigger\(/.test(renderBody) && !/loadRecommendationWorkspace_\(/.test(renderBody), 'renderReplenishment does NOT call _irRecoTrigger / loadRecommendationWorkspace_ (no re-render loop)');
ok(!/KMCALC\.normalizedAvgSalesPerDay/.test(IRSRC), 'no page-side canonical-rate calculator introduced (still carry-only via horizonBasis)');

section('root-cause invariant: summary/suggested re-renders do NOT touch the velocity cells');
var sumBody = fnBody(IRSRC, '_irRecoRerenderSummaries'), sugBody = fnBody(IRSRC, '_irRecoUpdateSuggestedCells');
ok(!/avgDailySales|daysOfSupply/.test(sumBody) && !/avgDailySales|daysOfSupply/.test(sugBody), 'neither _irRecoRerenderSummaries nor _irRecoUpdateSuggestedCells re-renders Avg Sales/day or Days of Supply — the reason the dedicated velocity refresh is required');

section('flag is NOT the cause — recommendation workspace is canonical + default-enabled');
ok(/WORKSPACE_CANONICAL\s*=\s*\{\s*recommendation:\s*true/.test(FOUND), 'recommendation workspace is CANONICAL (master-flag-independent)');
ok(/WORKSPACE_ENABLED_DEFAULT\s*=\s*\{[^}]*recommendation:\s*true/.test(FOUND), 'recommendation workspace is ENABLED BY DEFAULT → workspaceApiActive(\'recommendation\') is true in production');

console.log('\n----------------------------------------');
console.log('SALES VELOCITY LIVE-PATH (F1-4B-FM5-R4J-LIVE9V): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
