// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-SKU-REGIONAL-SCOPED-COLD-START-GATE-R1
// Proves the SKU Regional Details page eligibility gate (useDb) is now cache-INDEPENDENT: a cold canonical session
// (_opDbCache null, API configured, skuDetails workspace active) is eligible → the page fires the skuDetails workspace
// with include.regional=true instead of showing the "Connect the Operation DB … demo mode" banner. Explicit mock /
// unconfigured API still shows the banner (no accidental production call); the canonical workspace data contract and
// the legacy kill-switch path are unchanged; no getOperationDb on the canonical cold path.
// Run: node assets/tests/api-sku-regional-scoped-cold-start-f1-7m-b2-r1.test.js
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
var SRD = read('js/pages/sku-regional-details.js');
var USEDB = extractFn(SRD, 'useDb');

// Run useDb() against a stubbed window (cold session = _opDbCache irrelevant; gate must not read it).
function runUseDb(win) { var window = win; var useDb; eval(USEDB + '\nuseDb = useDb;'); return useDb(); }
function dbWin(over) {
  var db = { isScopedReadEligible: function () { return true; }, getSkuRegionalDetails: function () { return []; } };
  if (over) over(db);
  return { KM: { DB: db } };
}

// ===================================================================================================================
console.log('\n== Phase 2 — useDb() is cache-independent cloud eligibility ==');
ok(runUseDb(dbWin()) === true, 'cold cloud (isScopedReadEligible true, _opDbCache irrelevant) → ELIGIBLE');
ok(runUseDb(dbWin(function (db) { db.isScopedReadEligible = function () { return false; }; })) === false, 'explicit mock / unconfigured (isScopedReadEligible false) → NOT eligible (demo banner preserved)');
ok(runUseDb(dbWin(function (db) { db.isScopedReadEligible = undefined; })) === false, 'old db-api without isScopedReadEligible → NOT eligible (safe, no throw)');
ok(runUseDb(dbWin(function (db) { db.getSkuRegionalDetails = undefined; })) === false, 'no regional read path (getter absent) → NOT eligible');
ok(runUseDb({}) === false, 'no KM.DB at all → NOT eligible (no throw)');

// ===================================================================================================================
console.log('\n== source: gate no longer keys on the broad cache (getDataSourceMode / _opDbCache) ==');
ok(/typeof window\.KM\.DB\.isScopedReadEligible === 'function' &&\s*\n\s*window\.KM\.DB\.isScopedReadEligible\(\)/.test(USEDB), 'useDb() routes through KM.DB.isScopedReadEligible()');
var USEDB_CODE = USEDB.replace(/\/\/[^\n]*/g, '');   // strip comments — assert on active code only
ok(USEDB_CODE.indexOf("getDataSourceMode() === 'google-sheet'") === -1, 'useDb() no longer requires getDataSourceMode()===google-sheet (the cold-start trap)');
ok(USEDB_CODE.indexOf('_opDbCache') === -1, 'useDb() code never reads window._opDbCache');
ok(USEDB.indexOf('getSkuRegionalDetails') !== -1, 'useDb() still confirms a regional read path exists (getSkuRegionalDetails)');

// ===================================================================================================================
console.log('\n== Phase 3 — canonical workspace data contract unchanged ==');
ok(/getWorkspace\('skuDetails', \{ include: \{ regional: true \} \}\)/.test(SRD), "primary read is getWorkspace('skuDetails', { include:{ regional:true } })");
ok(/_srdReadModel = window\.KM\.DB\.adaptSkuDetailsWorkspace\(env\.data\)/.test(SRD), 'read-model built via adaptSkuDetailsWorkspace(env.data)');
var effWs = extractFn(SRD, '_srdEffectiveWorkspace');
ok(/workspaceApiActive\('skuDetails'\)/.test(effWs), '_srdEffectiveWorkspace() gates on cache-independent workspaceApiActive(skuDetails)');
// read-model exposes the 5 canonical tables
['skuRegionalDetails', 'skuDetails', 'marketplaceSkus', 'taxReferralRates', 'taxRateComponents'].forEach(function (k) {
  ok(SRD.indexOf('_srdReadModel.' + k) !== -1, 'read-model exposes ' + k);
});

// ===================================================================================================================
console.log('\n== Phase 5 — canonical cold path uses the workspace, never getOperationDb ==');
var loadInit = extractFn(SRD, 'loadAndInit');
// The workspace branch (_srdEffectiveWorkspace) precedes and is distinct from the legacy loadOperationDb branch.
ok(loadInit.indexOf('_srdEffectiveWorkspace()') !== -1, 'loadAndInit branches on _srdEffectiveWorkspace() (canonical)');
var wsIdx = loadInit.indexOf('_srdWorkspaceRefresh_'), legacyIdx = loadInit.indexOf('loadOperationDb');
ok(wsIdx !== -1 && legacyIdx !== -1 && wsIdx < legacyIdx, 'canonical workspace refresh precedes the legacy loadOperationDb fallback (kill-switch only)');
ok(SRD.indexOf('getOperationDbFromSheet') === -1, 'page never calls getOperationDbFromSheet directly (broad load only via the documented legacy kill-switch seam)');
// Write eligibility rides the SAME cache-independent gate (add button + edit) — cold canonical can edit.
ok(/if \(!useDb\(\) \|\| !window\.KM\.DB\.upsertSkuRegionalDetail\)/.test(SRD), 'edit write gate uses the (now cache-independent) useDb()');
ok(/\(useDb\(\) && window\.KM\.DB\.upsertSkuRegionalDetail\)/.test(SRD), 'add-button visibility uses the (now cache-independent) useDb()');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
