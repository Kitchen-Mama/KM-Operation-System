// Kitchen Mama Operation System — F1-7M-E (backend read-cost) — 42_ recommendation REUSE_MAP
// Proves the per-request row-object memoizer recoWsRows_ is OUTPUT-IDENTICAL to the prior per-SKU
// recoWsToRowObjects_(snaps.X) materialization, and that the MARKETPLACE/WAREHOUSE expanders now route their
// loop-invariant (constant-across-SKU) snapshots through it — eliminating the O(N_skus x M_tables) re-materialization
// without changing any recommendation output. End-to-end output-equivalence is additionally guarded by the existing
// recommendation regression suites (full run).
// Run: node assets/tests/api-recommendation-reuse-map-f1-7m-e-r1.test.js
// NOTE: no 'use strict' — extracted pure fns are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var RECO = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
eval(extractFn(RECO, 'recoWsStr_'));
eval(extractFn(RECO, 'recoWsIsObj_'));
eval(extractFn(RECO, 'recoWsToRowObjects_'));
eval(extractFn(RECO, 'recoWsRows_'));

function J(x) { return JSON.stringify(x); }

// A representative multi-table snapshot set ({headers, rows}) as the resolver builds it.
var snapshots = {
  marketplaces: { headers: ['company', 'country', 'marketplace', 'marketplace_id'], rows: [['KM', 'US', 'AMZ', 'M1'], ['KM', 'CA', 'AMZ', 'M2']] },
  warehouses: { headers: ['warehouse_id', 'company', 'country'], rows: [['WH-1', 'KM', 'US'], ['WH-2', 'KM', 'CA']] },
  skuDetails: { headers: ['sku', 'series', 'category', 'units_per_carton'], rows: [['KM-1', 'S', 'C', '12'], ['KM-2', 'S', 'C', '24']] },
  fcRegularForecast: { headers: ['sku', 'company', 'year', 'jan'], rows: [['KM-1', 'KM', '2026', '10']] }
};
var read1 = { snapshots: snapshots };

// ===================================================================================================================
console.log('\n== recoWsRows_ is deep-equal to fresh recoWsToRowObjects_ (output-identical) ==');
Object.keys(snapshots).forEach(function (k) {
  ok(J(recoWsRows_(read1, k)) === J(recoWsToRowObjects_(snapshots[k])), 'recoWsRows_(read,"' + k + '") deep-equals recoWsToRowObjects_(snaps.' + k + ')');
});
// Value shape is the header->cell object map.
ok(J(recoWsRows_(read1, 'warehouses')[0]) === J({ warehouse_id: 'WH-1', company: 'KM', country: 'US' }), 'row-object shape preserved (headers -> cells)');

// ===================================================================================================================
console.log('\n== memoized: same reference across calls within one request (no re-materialization) ==');
var a = recoWsRows_(read1, 'marketplaces');
var b = recoWsRows_(read1, 'marketplaces');
ok(a === b, 'second call returns the SAME array reference (materialized once per request)');
ok(read1.__rowCache && read1.__rowCache.marketplaces === a, 'cache stored on read.__rowCache (per-request, mirrors read.__slCandidates)');

// ===================================================================================================================
console.log('\n== per-request isolation + absent-snapshot safety ==');
var read2 = { snapshots: snapshots };
ok(recoWsRows_(read2, 'marketplaces') !== a, 'a different `read` gets its OWN cache (no cross-request sharing)');
ok(J(recoWsRows_(read2, 'marketplaces')) === J(a), '...but the same deep value');
ok(J(recoWsRows_(read1, 'doesNotExist')) === J([]), 'absent snapshot -> [] (identical to recoWsToRowObjects_(undefined))');
ok(J(recoWsRows_({}, 'marketplaces')) === J([]), 'missing read.snapshots -> [] (no throw)');

// ===================================================================================================================
console.log('\n== source wiring: both expanders route loop-invariant snapshots through recoWsRows_ ==');
var mkt = extractFn(RECO, 'recoWsExpandMarketplace_');
var wh = extractFn(RECO, 'recoWsExpandWarehouse_');
['marketplaces', 'warehouses', 'amazonInventorySnapshot', 'fcRegularForecast', 'skuDetails', 'fcTargetRules', 'fcSpecialEvents'].forEach(function (k) {
  ok(mkt.indexOf("recoWsRows_(read, '" + k + "')") !== -1, 'MARKETPLACE expander uses recoWsRows_(read, "' + k + '")');
});
['warehouses', 'replenishmentDemandAllocationRules', 'fcRegularForecast', 'skuDetails', 'fcTargetRules', 'fcSpecialEvents'].forEach(function (k) {
  ok(wh.indexOf("recoWsRows_(read, '" + k + "')") !== -1, 'WAREHOUSE expander uses recoWsRows_(read, "' + k + '")');
});
// The expander hot path no longer re-materializes these constant snapshots directly.
ok(mkt.indexOf('recoWsToRowObjects_(snaps.marketplaces)') === -1 && mkt.indexOf('recoWsToRowObjects_(snaps.warehouses)') === -1, 'MARKETPLACE expander no longer re-materializes marketplaces/warehouses per SKU');
ok(wh.indexOf('recoWsToRowObjects_(snaps.warehouses)') === -1 && wh.indexOf('recoWsToRowObjects_(snaps.skuDetails)') === -1, 'WAREHOUSE expander no longer re-materializes warehouses/skuDetails per SKU');

// ===================================================================================================================
console.log('\n== guardrail: no output/authority/formula surface touched; getOperationDb still never called ==');
ok(RECO.indexOf('getOperationDb') === -1 || /NEVER calls getOperationDb/.test(RECO), '42_ never calls getOperationDb (scoped/targeted read owner preserved)');
ok(/function recoWsToRowObjects_\(snap\)/.test(RECO), 'recoWsToRowObjects_ pure materializer unchanged (memoizer wraps it, does not replace it)');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
