// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-SHAPE2-COLD-START-RESIDUAL-R1
// Closes the remaining Shape-2 cold-start eligibility defects after F1-7L: Order Planning / Request Order
// (request-order.js::_roUseDb) and Carrier Rate Card (carrier-rate-card.js::useDb) each gated their canonical
// first-open on getDataSourceMode()==='google-sheet' (== broad _opDbCache already primed), so a cold canonical
// session showed a "Connect the Operation DB … demo mode" banner and never fired the scoped composer / scoped read.
// Both now route through the shared cache-independent KM.DB.isScopedReadEligible() (same posture as 1ca7d13 / f13a0b6).
// Run: node assets/tests/api-shape2-cold-start-residual-f1-7m-b2-r1.test.js
// NOTE: no 'use strict' — extracted fns are eval'd into local scope with a stubbed `window`.

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
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, ''); }

var RO = read('js/pages/request-order.js');
var CRC = read('js/pages/carrier-rate-card.js');
var SRD = read('js/pages/sku-regional-details.js');

// Run an extracted eligibility predicate (single-name) against a stubbed window.
function runPred(src, name, win) { var window = win; var fn; eval(src + '\nfn = ' + name + ';'); return fn(); }
function dbWin(getterName, over) {
  var db = { isScopedReadEligible: function () { return true; } };
  db[getterName] = function () { return []; };
  if (over) over(db);
  return { KM: { DB: db } };
}

// ===================================================================================================================
console.log('\n== Request Order _roUseDb — cache-independent ==');
var roUseDb = extractFn(RO, '_roUseDb');
ok(runPred(roUseDb, '_roUseDb', dbWin('getMarketplaceSkus')) === true, 'cold cloud (isScopedReadEligible true) → ELIGIBLE');
ok(runPred(roUseDb, '_roUseDb', dbWin('getMarketplaceSkus', function (db) { db.isScopedReadEligible = function () { return false; }; })) === false, 'explicit mock → NOT eligible (Demo/empty preserved)');
ok(runPred(roUseDb, '_roUseDb', dbWin('getMarketplaceSkus', function (db) { db.isScopedReadEligible = undefined; })) === false, 'no isScopedReadEligible → NOT eligible (safe)');
ok(runPred(roUseDb, '_roUseDb', { KM: { DB: { isScopedReadEligible: function () { return true; } } } }) === false, 'no getMarketplaceSkus read path → NOT eligible');
ok(stripComments(roUseDb).indexOf("getDataSourceMode() === 'google-sheet'") === -1, '_roUseDb code no longer keys on the broad-cache mode');
ok(/isScopedReadEligible\(\)/.test(roUseDb), '_roUseDb uses isScopedReadEligible()');

// ===================================================================================================================
console.log('\n== Carrier Rate Card useDb — cache-independent (SAME_COLD_START_DEFECT confirmed + fixed) ==');
var crcUseDb = extractFn(CRC, 'useDb');
ok(runPred(crcUseDb, 'useDb', dbWin('getCarrierRateCards')) === true, 'cold cloud → ELIGIBLE');
ok(runPred(crcUseDb, 'useDb', dbWin('getCarrierRateCards', function (db) { db.isScopedReadEligible = function () { return false; }; })) === false, 'explicit mock → NOT eligible (demo banner preserved)');
ok(runPred(crcUseDb, 'useDb', dbWin('getCarrierRateCards', function (db) { db.isScopedReadEligible = undefined; })) === false, 'no isScopedReadEligible → NOT eligible (safe)');
ok(stripComments(crcUseDb).indexOf("getDataSourceMode() === 'google-sheet'") === -1, 'carrier useDb code no longer keys on the broad-cache mode');
ok(/isScopedReadEligible\(\)/.test(crcUseDb), 'carrier useDb uses isScopedReadEligible()');
// The banner gate precedes the scoped branch — fixing useDb un-blocks the 1ca7d13 _crcScopedActive path.
var crcInit = stripComments(extractFn(CRC, 'loadAndInit'));
ok(crcInit.indexOf('!useDb()') !== -1 && crcInit.indexOf('_crcScopedActive()') !== -1 && crcInit.indexOf('!useDb()') < crcInit.indexOf('_crcScopedActive()'), 'loadAndInit: useDb gate precedes the canonical _crcScopedActive scoped branch');

// ===================================================================================================================
console.log('\n== Request Order canonical composer path fires on cold; never getOperationDb ==');
var roInit = stripComments(extractFn(RO, 'initRequestOrderSection'));
ok(/if \(_roUseDb\(\)\)/.test(roInit), 'initRequestOrderSection gates the canonical block on _roUseDb()');
ok(roInit.indexOf('_opLoadFirstLayerComposer_') !== -1, 'canonical block fires the scoped first-layer composer');
var composer = extractFn(RO, '_opLoadFirstLayerComposer_');
ok(/getAiPlanFirstLayer/.test(composer), 'composer sources rows from getAiPlanFirstLayer (scoped 56_), not broad getters');
ok(RO.indexOf('getOperationDbFromSheet') === -1, 'request-order never calls getOperationDbFromSheet; broad load only via the documented legacy kill-switch loadOperationDb branch');
// _buildRequestOrderRowsFromDb stays null-safe (returns [] before the cache/getters are populated).
var buildRows = extractFn(RO, '_buildRequestOrderRowsFromDb');
ok(/if \(!_roUseDb\(\)\) return \[\];/.test(buildRows) && /getMarketplaceSkus\(\) \|\| \[\];\s*\n\s*if \(!mskus\.length\) return \[\];/.test(buildRows), '_buildRequestOrderRowsFromDb is null-safe ([] when getters empty) — safe under cache-independent _roUseDb');

// ===================================================================================================================
console.log('\n== Phase 4 — SKU Regional f13a0b6 contract preserved (regression guard) ==');
ok(/isScopedReadEligible\(\)/.test(extractFn(SRD, 'useDb')), 'SKU Regional useDb still cache-independent (f13a0b6 intact)');
ok(/getWorkspace\('skuDetails', \{ include: \{ regional: true \} \}\)/.test(SRD), "SKU Regional still reads getWorkspace('skuDetails',{include:{regional:true}})");

// ===================================================================================================================
console.log('\n== Phase 5 — no ACTIVE canonical cache-dependent read-eligibility predicate remains ==');
// Scan the page eligibility predicates; the only permitted google-sheet cache check is the WRITE posture
// (isCloudWriteEnabled) in the db-api, which must stay strict. Page-level read gates must be cache-independent.
['js/pages/request-order.js', 'js/pages/carrier-rate-card.js', 'js/pages/sku-regional-details.js',
 'js/pages/factory-stock.js', 'js/pages/overseas-stock.js', 'js/pages/campaign-risk.js',
 'js/pages/overseas-ops-preview.js', 'js/pages/sku-handbook.js'].forEach(function (f) {
  ok(stripComments(read(f)).indexOf("getDataSourceMode() === 'google-sheet'") === -1, f.split('/').pop() + ': no active getDataSourceMode()===google-sheet read gate');
});
// The write posture is deliberately preserved.
ok(/isCloudWriteEnabled = function\(\) \{\s*\n?\s*return isOperationDbApiConfigured\(\) && getOperationDbDataSourceMode\(\) === 'google-sheet';/.test(read('js/api/operation-system-db-api.js')), 'isCloudWriteEnabled (WRITE posture) still requires a confirmed google-sheet cache (unchanged)');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
