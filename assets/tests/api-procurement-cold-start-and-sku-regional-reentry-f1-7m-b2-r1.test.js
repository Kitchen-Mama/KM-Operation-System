// Kitchen Mama Operation System — F1-7M-B2-HOTFIX-PROCUREMENT-COLD-START-AND-SKU-REGIONAL-REENTRY-R1
// (A) Request Order Draft / Purchase Order Workspace (list) / Purchase Order Overview each gated the page on useDb()
//     = isCloudWriteEnabled() && get<X>, and isCloudWriteEnabled() requires getDataSourceMode()==='google-sheet'
//     (== broad _opDbCache already primed) → a cold F1-7L session showed "Demo mode — connect the Operation DB".
//     All three now route through the shared cache-independent KM.DB.isScopedReadEligible().
// (B) SKU Regional Details refetched the full workspace on every re-entry. loadAndInit now reuses a valid _srdReadModel
//     (render immediately, no skeleton/refetch), with an in-flight dedupe guard and an explicit invalidation seam; this-
//     surface writes keep it fresh via _srdAfterWrite; a failed load nulls it so Retry re-reads.
// Run: node assets/tests/api-procurement-cold-start-and-sku-regional-reentry-f1-7m-b2-r1.test.js
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
function runUseDb(src, win) { var window = win; var useDb; eval(src + '\nuseDb = useDb;'); return useDb(); }
function dbWin(getterName, over) {
  var db = { isScopedReadEligible: function () { return true; } };
  db[getterName] = function () { return []; };
  if (over) over(db);
  return { KM: { DB: db } };
}

// ===================================================================================================================
console.log('\n== (A) Procurement cold-start gates now cache-independent ==');
var PROC = [
  { file: 'js/pages/request-order-draft.js', getter: 'getRequestOrders', label: 'Request Order Draft' },
  { file: 'js/pages/purchase-order-list.js', getter: 'getPurchaseOrders', label: 'Purchase Order Workspace' },
  { file: 'js/pages/purchase-order-overview.js', getter: 'getPurchaseOrders', label: 'Purchase Order Overview' }
];
PROC.forEach(function (p) {
  var src = read(p.file);
  var useDb = extractFn(src, 'useDb');
  ok(runUseDb(useDb, dbWin(p.getter)) === true, p.label + ': cold cloud (isScopedReadEligible true) → ELIGIBLE');
  ok(runUseDb(useDb, dbWin(p.getter, function (db) { db.isScopedReadEligible = function () { return false; }; })) === false, p.label + ': explicit mock → NOT eligible (Demo banner preserved)');
  ok(runUseDb(useDb, dbWin(p.getter, function (db) { db.isScopedReadEligible = undefined; })) === false, p.label + ': no isScopedReadEligible → NOT eligible (safe)');
  ok(/isScopedReadEligible\(\)/.test(useDb), p.label + ': useDb uses isScopedReadEligible()');
  ok(stripComments(useDb).indexOf('isCloudWriteEnabled()') === -1, p.label + ': useDb no longer keys on isCloudWriteEnabled() (the cache-dependent trap)');
  // Canonical scoped workspace predicate is the cache-independent workspaceApiActive; page reads getWorkspace.
  ok(/workspaceApiActive\('(requestOrder|purchaseOrder)'\)/.test(src), p.label + ': canonical read = cache-independent workspaceApiActive');
  ok(/getWorkspace\('(requestOrder|purchaseOrder)'/.test(src), p.label + ': reads via scoped getWorkspace');
  ok(src.indexOf('getOperationDbFromSheet') === -1, p.label + ': never calls getOperationDbFromSheet (broad load only via legacy kill-switch loadOperationDb)');
});

// ===================================================================================================================
console.log('\n== (B) SKU Regional same-session re-entry reuse + in-flight + invalidation ==');
var SRD = read('js/pages/sku-regional-details.js');
var loadInit = extractFn(SRD, 'loadAndInit');
// re-entry reuse guard fires BEFORE the skeleton + fetch.
ok(/if \(_srdEffectiveWorkspace\(\) && _srdReadModel\) \{ render\(\); return; \}/.test(loadInit), 're-entry: valid _srdReadModel → render() immediately, no refetch');
var reuseIdx = loadInit.indexOf('_srdReadModel) { render(); return; }');
var skelIdx = loadInit.indexOf('srd-skel');
ok(reuseIdx !== -1 && skelIdx !== -1 && reuseIdx < skelIdx, 'reuse guard precedes the skeleton (no loading flash on re-entry)');
// in-flight dedupe.
ok(/if \(_srdEffectiveWorkspace\(\) && _srdInFlight\) return;/.test(loadInit), 'in-flight dedupe: concurrent re-mount does not issue a duplicate workspace request');
ok(/_srdInFlight = true;/.test(loadInit), 'sets _srdInFlight before the fetch');
ok((loadInit.match(/_srdInFlight = false;/g) || []).length >= 2, 'clears _srdInFlight in BOTH then and catch (retryable after failure)');
// explicit invalidation seam + exposure.
ok(/function _srdInvalidate_\(\) \{ _srdReadModel = null; \}/.test(SRD), '_srdInvalidate_() drops the read-model (explicit invalidation)');
ok(/window\.srdInvalidate = _srdInvalidate_;/.test(SRD), 'invalidation seam exposed as window.srdInvalidate');
// stale-response protection (seq guard) retained.
ok(/mySeq !== _srdReadSeq/.test(SRD), 'stale-response protection retained (_srdReadSeq guard in _srdWorkspaceRefresh_)');
// failed load nulls the model → Retry re-reads (no permanent empty).
ok(/function _srdRenderError_\(err\) \{\s*\n\s*_srdReadModel = null;/.test(SRD), 'failed load nulls _srdReadModel → next entry / Retry performs a fresh read');
// this-surface write refreshes the model (post-write freshness) → re-entry cannot show stale records.
ok(/_srdAfterWrite\(function \(\) \{ render\(\); \}\);/.test(SRD), 'save path calls _srdAfterWrite (re-read) → post-write freshness');
var afterWrite = extractFn(SRD, '_srdAfterWrite');
ok(/_srdWorkspaceRefresh_\(\)\.then/.test(afterWrite), '_srdAfterWrite re-reads the workspace (keeps _srdReadModel fresh across re-entry)');
// cold first-open is still a real server read (reuse only triggers when a model already exists).
ok(/_srdWorkspaceRefresh_\(\)\.then\(function \(\) \{ _srdInFlight = false;/.test(loadInit), 'cold first-open (no model) still performs the real getWorkspace read');
// f13a0b6 cold-start gate preserved.
ok(/isScopedReadEligible\(\)/.test(extractFn(SRD, 'useDb')), 'SKU Regional useDb cache-independent (f13a0b6 preserved)');

console.log('\n---------------------------------------------');
console.log('PASS ' + pass + '  FAIL ' + fail);
if (fail) process.exitCode = 1;
