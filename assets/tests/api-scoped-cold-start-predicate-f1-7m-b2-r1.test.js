// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-SCOPED-COLD-START-PREDICATE-R1
// Proves the SCOPED_ACTIVE_PREDICATE_COLD_START_DEFECT is fixed by a shared, cache-INDEPENDENT cloud-read
// eligibility helper (KM.DB.isScopedReadEligible), routed through all 6 loadScopedTables scoped-active predicates.
// A cold session (window._opDbCache == null → getDataSourceMode() === 'not-loaded') is now scoped-ACTIVE, so the
// first scoped page opened no longer falls back to the legacy whole-DB loadOperationDb (getOperationDb). Explicit
// mock/demo, kill switch, helper-unavailable, and unconfigured API all keep their prior behavior. B4/B5 post-write
// bounded readback + F1-7L zero-prime invariants preserved.
// Run: node assets/tests/api-scoped-cold-start-predicate-f1-7m-b2-r1.test.js
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
function extractAssignedFn(src, marker) {
  var i = src.indexOf(marker); if (i < 0) throw new Error('not found: ' + marker);
  var k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } }
  throw new Error('unbalanced: ' + marker);
}

var DBAPI = read('js/api/operation-system-db-api.js');
var APP = read('js/app.js');

// Run an extracted scoped-active predicate against a stubbed window.
function runPredicate(src, fnName, win) {
  var window = win;                 // local — extracted fn (non-strict eval) closes over it
  var fn;
  eval(src + '\nfn = ' + fnName + ';');
  return fn();
}
// A window in which the predicate SHOULD pass (cold cloud): kill switch unset, scoped loader present, helper true.
function coldCloudWin(overrides) {
  var w = { KM_SCOPED_PAGE_READS: undefined, KM: { DB: {
    loadScopedTables: function () {}, isScopedReadEligible: function () { return true; }
  } } };
  if (overrides) overrides(w);
  return w;
}

// ===================================================================================================================
console.log('\n== §2 shared helper KM.DB.isScopedReadEligible — CONFIGURATION fact, NOT cache-load fact ==');
var ELIG = extractAssignedFn(DBAPI, 'window.KM.DB.isScopedReadEligible = function');
ok(/isOperationDbApiConfigured\(\)/.test(ELIG), 'helper keys on isOperationDbApiConfigured() (API configured)');
ok(/getOperationDbDataSourceMode\(\) !== 'mock'/.test(ELIG), "helper excludes ONLY explicit 'mock' posture (not 'not-loaded')");
ok(ELIG.indexOf('_opDbCache') === -1, 'helper does NOT read window._opDbCache directly (cache-independent)');
ok(ELIG.indexOf("=== 'google-sheet'") === -1, 'helper does NOT require google-sheet (would re-introduce the cold-start trap)');

function runEligible(cfg, mode) {
  var isOperationDbApiConfigured = function () { return cfg; };
  var getOperationDbDataSourceMode = function () { return mode; };
  var _f;
  eval(ELIG.replace('window.KM.DB.isScopedReadEligible =', '_f ='));
  return _f();
}
ok(runEligible(true, 'not-loaded') === true, 'STATE A cold cloud (configured, not-loaded) → ELIGIBLE');
ok(runEligible(true, 'google-sheet') === true, 'STATE B warm cloud (configured, google-sheet) → ELIGIBLE');
ok(runEligible(true, 'mock') === false, 'STATE D explicit mock (configured, mock) → NOT eligible');
ok(runEligible(false, 'not-loaded') === false, 'STATE F API unconfigured → NOT eligible');

// isCloudWriteEnabled is DELIBERATELY stricter (writes still need a confirmed google-sheet cache) — must be untouched.
var WRITE = extractAssignedFn(DBAPI, 'window.KM.DB.isCloudWriteEnabled = function');
ok(/getOperationDbDataSourceMode\(\) === 'google-sheet'/.test(WRITE), 'isCloudWriteEnabled STILL requires google-sheet (write posture unchanged)');

// ===================================================================================================================
console.log('\n== §0/§3 all 6 scoped-active predicates route through the shared helper (cold cloud → ACTIVE) ==');
var PAGES = [
  { file: 'js/pages/factory-stock.js', fn: '_fsScopedActive' },
  { file: 'js/pages/overseas-stock.js', fn: '_osScopedActive' },
  { file: 'js/pages/campaign-risk.js', fn: '_crScopedActive' },
  { file: 'js/pages/carrier-rate-card.js', fn: '_crcScopedActive' },
  { file: 'js/pages/sku-handbook.js', fn: '_skuhScopedActive' },
  { file: 'js/pages/overseas-ops-preview.js', fn: '_oopScopedActive' }
];
PAGES.forEach(function (p) {
  var src = extractFn(read(p.file), p.fn);
  // Source shape: uses the helper, no longer the active getDataSourceMode conjunct (comment mention is fine).
  ok(/isScopedReadEligible && window\.KM\.DB\.isScopedReadEligible\(\)/.test(src), p.fn + ': predicate calls the shared helper');
  ok(src.indexOf('getDataSourceMode &&') === -1, p.fn + ': active getDataSourceMode conjunct removed');
  // STATE A — cold cloud (_opDbCache irrelevant; helper true) → ACTIVE
  ok(runPredicate(src, p.fn, coldCloudWin()) === true, p.fn + ': STATE A cold cloud → scoped ACTIVE');
  // STATE C — explicit kill switch → Legacy
  ok(runPredicate(src, p.fn, coldCloudWin(function (w) { w.KM_SCOPED_PAGE_READS = false; })) === false, p.fn + ': STATE C kill switch → NOT active');
  // STATE E — scoped loader unavailable → safe fallback
  ok(runPredicate(src, p.fn, coldCloudWin(function (w) { w.KM.DB.loadScopedTables = undefined; })) === false, p.fn + ': STATE E loadScopedTables missing → NOT active');
  // helper unavailable → NOT active (falsy via short-circuit, never throws)
  ok(!runPredicate(src, p.fn, coldCloudWin(function (w) { w.KM.DB.isScopedReadEligible = undefined; })), p.fn + ': helper unavailable → NOT active');
  // eligibility false (mock/unconfigured) → NOT active
  ok(runPredicate(src, p.fn, coldCloudWin(function (w) { w.KM.DB.isScopedReadEligible = function () { return false; }; })) === false, p.fn + ': eligibility false → NOT active');
});

// ===================================================================================================================
console.log('\n== §5/§6 cold canonical init takes the SCOPED branch BEFORE any legacy loadOperationDb ==');
var FS = read('js/pages/factory-stock.js');
var OS = read('js/pages/overseas-stock.js');
function stripComments(s) { return s.replace(/\/\/[^\n]*/g, ''); }
var fsInit = stripComments(extractFn(FS, 'initFactoryStockPage'));
var osInit = stripComments(extractFn(OS, 'initOverseasStockPage'));
// Scoped branch (loadScopedTables) precedes the legacy branch (loader({ force: true }) → loadOperationDb). Comment
// text is stripped first so a "→ broad loadOperationDb" comment above the scoped branch cannot fool the ordering.
ok(fsInit.indexOf('loadScopedTables(') !== -1 && fsInit.indexOf('loadScopedTables(') < fsInit.indexOf('loader({ force: true })'), 'factory init: scoped loadScopedTables precedes legacy loadOperationDb');
// F1-7N-FB-4E-R3 — Overseas Stock was cut over to ONE scoped workspace read, so its mount now calls
// _osLoadPrimary_() instead of loadScopedTables directly. The invariant is unchanged and is what is asserted:
// the SCOPED branch still precedes the legacy whole-DB branch, and the scoped branch is still what runs first.
ok(osInit.indexOf('_osLoadPrimary_(') !== -1 && osInit.indexOf('_osLoadPrimary_(') < osInit.indexOf('loader({ force: true })'),
  'overseas init: the scoped read precedes the legacy loadOperationDb branch');
ok(/loadOverseasStockWorkspace/.test(stripComments(extractFn(OS, '_osLoadPrimary_'))),
  'overseas init: and the scoped read is the ONE-request workspace action');
ok(/if \(_fsScopedActive\(\)/.test(fsInit) || /_fsScopedActive\(\) &&/.test(fsInit), 'factory scoped branch guarded by _fsScopedActive()');
ok(/_osScopedActive\(\) &&/.test(osInit), 'overseas scoped branch guarded by _osScopedActive()');
ok(/!_fsScopedActive\(\)/.test(fsInit), 'factory legacy branch guarded by !_fsScopedActive() (only when NOT scoped)');
ok(/!_osScopedActive\(\)/.test(osInit), 'overseas legacy branch guarded by !_osScopedActive() (only when NOT scoped)');

// ===================================================================================================================
console.log('\n== §7 Overseas cold first-open requests the 4 canonical tables (no Movement-specific hardening) ==');
ok(/var _OS_TABLES = \['overseas_inventory_snapshot', 'overseas_inventory_movements', 'warehouses', 'sku_details'\];/.test(OS), '_OS_TABLES unchanged: the 4 canonical Overseas tables');
// F1-7N-FB-4E — the resolve arm additionally records a READ STATE, because the previous
// `.catch(function () { init(); })` swallowed the failure and the page then printed
// "尚未連接資料來源" for what was an HTTP 404. The claim this assertion makes — the cold first open
// loads _OS_TABLES through the scoped read and re-enters the page — is unchanged and is asserted on both arms.
ok(/loadScopedTables\(_OS_TABLES\)/.test(OS), 'overseas cold first-open loads _OS_TABLES via scoped read');
ok(/_osReadModel = m;[\s\S]{0,120}initOverseasStockPage\(\);/.test(OS), 'overseas: the success arm adopts the model and re-enters the page');
ok(/\.catch\(function \(err\) \{[\s\S]{0,400}initOverseasStockPage\(\);/.test(OS), 'overseas: the failure arm re-enters too — but now with a classified reason');
ok(/_overseasDbLoadTried = false;/.test(OS), 'overseas: and it CLEARS the tried-flag, so recovery needs no browser reload');

// ===================================================================================================================
console.log('\n== §8/§4 B4/B5 post-write bounded readback contracts preserved (2 mutable tables + merge) ==');
var fsAfter = extractFn(FS, '_fsAfterWrite');
ok(/loadScopedTables\(\['factory_stock', 'factory_stock_movements'\]\)/.test(fsAfter), 'B4: factory post-write re-reads ONLY the 2 mutable tables');
ok(/Object\.assign\(\{\}, _fsReadModel, \{ factoryStock: m\.factoryStock, factoryStockMovements: m\.factoryStockMovements \}\)/.test(fsAfter), 'B4: factory merges the 2 fresh slices onto the retained model (static kept)');
var osAfter = extractFn(OS, '_osAfterWrite');
ok(/loadScopedTables\(_OS_MUTABLE_TABLES\)/.test(osAfter), 'B5: overseas post-write re-reads ONLY the 2 mutable tables');
ok(/Object\.assign\(\{\}, _osReadModel, \{ overseasInventorySnapshot: m\.overseasInventorySnapshot, overseasInventoryMovements: m\.overseasInventoryMovements \}\)/.test(osAfter), 'B5: overseas merges the 2 fresh slices onto the retained model (static kept)');
ok(/var _OS_MUTABLE_TABLES = \['overseas_inventory_snapshot', 'overseas_inventory_movements'\];/.test(OS), 'B5: _OS_MUTABLE_TABLES unchanged (2 mutable tables)');

// ===================================================================================================================
console.log('\n== §5 F1-7L zero-prime invariants preserved ==');
ok(APP.indexOf('loadOperationDb') === -1, 'CANONICAL_STARTUP_WHOLE_DB_PRIME = 0: app.js still makes no whole-DB prime');
ok(!/setTimeout\([^)]*loadOperationDb|setInterval\([^)]*loadOperationDb/.test(APP), 'APP_PRIME_READ_DEPENDENCY = 0: no delayed/background prime');
// The scoped branch itself performs NO whole-DB read (loadScopedTables only, no getOperationDb).
// F1-7N-FB-4E-R3 — the scoped path is now the workspace read, with the four-table getTable fan-out kept only
// as the deployment-window fallback. Neither is a whole-DB read, which is the property this asserts.
var osPrimary = stripComments(extractFn(OS, '_osLoadPrimary_'));
ok(/loadOverseasStockWorkspace/.test(osPrimary), 'overseas scoped path is the ONE-request scoped workspace read');
ok(/loadScopedTables\(_OS_TABLES\)/.test(osPrimary), 'and its only fallback is the bounded getTable fan-out');
ok(!/getOperationDbFromSheet/.test(OS) && !/loadOperationDb\(/.test(osPrimary),
  'overseas scoped path never reaches a whole-DB read');
// The helper made scoped ACTIVE cold, so canonical cold first-open no longer reaches loadOperationDb:
//   predicate true (cold cloud) → scoped branch → return → legacy branch unreachable this mount.
ok(runPredicate(extractFn(OS, '_osScopedActive'), '_osScopedActive', coldCloudWin()) === true, 'CANONICAL_COLD_GET_OPERATION_DB_COUNT → 0: overseas cold predicate is ACTIVE, so scoped branch wins over legacy');
ok(runPredicate(extractFn(FS, '_fsScopedActive'), '_fsScopedActive', coldCloudWin()) === true, 'factory cold predicate is ACTIVE, so scoped branch wins over legacy');

// ===================================================================================================================
console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
