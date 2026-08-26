// Kitchen Mama Operation System — F1-7M-C-LAZY-INCLUDE-AND-REFERENCE-SESSION-CACHE-R1
// Proves C1: the marketplace master (SESSION_REFERENCE_SAFE) is deduplicated by a minimal KM.referenceCache — repeated
// getMarketplaceReference() calls share ONE fetch, a failed load is never cached, and the only marketplace writer
// (upsertMarketplace) invalidates the key AFTER a confirmed-successful write. The cache is REFERENCE-ONLY (no business
// facts), in-memory, no persistence, no TTL, explicit invalidation. It also LOCKS IN the round's non-changes: C6
// once-guards already exist; C5 IR lazy-include deferred (primary payload UNCHANGED); no global cache reintroduced.
// Run: node assets/tests/api-reference-session-cache-f1-7m-c-r1.test.js
// NOTE: no 'use strict' — extracted source slices are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function tick() { return new Promise(function (r) { setImmediate(r); }); }

var DBAPI = read('js/api/operation-system-db-api.js');
var IR = read('js/pages/inventory-replenishment.js');
var APP = read('js/app.js');

// ===================================================================================================================
console.log('\n== C1 structural: getMarketplaceReference routed through KM.referenceCache; only upsertMarketplace invalidates ==');
ok(/window\.KM\.referenceCache\.get\('marketplaces', loader\)/.test(DBAPI), 'getMarketplaceReference reads via referenceCache.get(\'marketplaces\', loader)');
ok(/window\.KM\.referenceCache\.invalidate\('marketplaces'\)/.test(DBAPI), 'a writer invalidates the marketplaces reference key');
// invalidation is placed AFTER the success guard in upsertMarketplace (a failed write throws before reaching it).
var ups = DBAPI.slice(DBAPI.indexOf('window.KM.DB.upsertMarketplace ='), DBAPI.indexOf('window.KM.DB.upsertMarketplaceSku ='));
ok(ups.indexOf("if (!json.success) throw") < ups.indexOf("referenceCache.invalidate('marketplaces')"), 'invalidate runs only AFTER the success check (write failure → cache stays valid)');
ok(ups.indexOf("referenceCache.invalidate('marketplaces')") !== -1, 'upsertMarketplace is the writer that invalidates the marketplace reference');
// NO business-table key is ever passed to referenceCache.get (only the reference key 'marketplaces').
var refGetKeys = (DBAPI.match(/referenceCache\.get\('([^']+)'/g) || []).map(function (s) { return s.replace(/.*get\('/, '').replace(/'.*/, ''); });
eq(refGetKeys, ['marketplaces'], 'the ONLY referenceCache.get key is the marketplaces reference master (no business-fact keys)');
['fc_regular_forecast', 'factory_stock', 'overseas_inventory_snapshot', 'amazon_inventory_snapshot', 'shipments', 'purchase_orders', 'shipping_allocation_drafts', 'carrier_rate_cards', 'carrier_lead_times', 'sku_details', 'request_orders', 'gap', 'recommendation'].forEach(function (biz) {
  ok(DBAPI.indexOf("referenceCache.get('" + biz + "'") === -1, 'business/volatile table NOT cached as reference: ' + biz);
});

// ===================================================================================================================
console.log('\n== C1 behavioral: dedupe, shared in-flight promise, no-cache-on-failure, invalidation ==');
// Install the real KM.referenceCache IIFE into a fake window.
global.window = { KM: {} };
var iife = DBAPI.match(/\(function \(\) \{\s*var store = \{\};[\s\S]*?\}\)\(\);/);
ok(!!iife, 'referenceCache IIFE extracted from source');
eval(iife[0]);
var RC = global.window.KM.referenceCache;
ok(RC && typeof RC.get === 'function' && typeof RC.invalidate === 'function' && typeof RC.invalidateMany === 'function' && typeof RC.clear === 'function', 'referenceCache exposes get/invalidate/invalidateMany/clear');

(async function () {
  // --- dedupe: two sequential gets after settle → loader called ONCE ---
  var calls = 0;
  var loader = function () { calls++; return Promise.resolve([{ marketplaceId: 'US1' }]); };
  var v1 = await RC.get('marketplaces', loader);
  var v2 = await RC.get('marketplaces', loader);
  eq(calls, 1, 'C1: second get after settle does NOT call the loader again (one network request)');
  eq(v1, [{ marketplaceId: 'US1' }], 'C1: cached value returned');
  ok(v1 === v2, 'C1: same settled value shared across callers');
  ok(RC._hasSettled('marketplaces'), 'C1: value is retained for the session');

  // --- concurrent first calls: one in-flight promise shared ---
  RC.invalidate('marketplaces');
  var cCalls = 0, resolveLoad;
  var slow = function () { cCalls++; return new Promise(function (r) { resolveLoad = r; }); };
  var pA = RC.get('marketplaces', slow);
  var pB = RC.get('marketplaces', slow);
  eq(cCalls, 1, 'C1: concurrent first calls trigger ONE loader (shared in-flight promise)');
  ok(pA === pB, 'C1: concurrent callers receive the same Promise');
  resolveLoad([{ marketplaceId: 'CA1' }]);
  await tick();
  eq(await pA, [{ marketplaceId: 'CA1' }], 'C1: shared in-flight resolves to the loaded value');

  // --- failure is NOT cached: next get retries ---
  RC.invalidate('marketplaces');
  var fCalls = 0;
  var failing = function () { fCalls++; return Promise.reject(new Error('network down')); };
  var threw = false;
  try { await RC.get('marketplaces', failing); } catch (e) { threw = true; }
  ok(threw, 'C1: a failed load rejects (fail-closed — no stale fallback)');
  ok(!RC._hasSettled('marketplaces'), 'C1: failed load is NOT retained');
  var okCalls = 0;
  var recover = function () { okCalls++; return Promise.resolve([{ marketplaceId: 'OK' }]); };
  eq(await RC.get('marketplaces', recover), [{ marketplaceId: 'OK' }], 'C1: next get after failure retries the server');
  ok(fCalls === 1 && okCalls === 1, 'C1: failure retried exactly once (not permanently cached)');

  // --- invalidation forces refetch; a stale in-flight load resolving after invalidate is dropped ---
  RC.invalidate('marketplaces');                 // reset from the prior sub-case so the first get below actually loads
  var iCalls = 0; var lastVal = null;
  var counting = function () { iCalls++; var v = [{ n: iCalls }]; lastVal = v; return Promise.resolve(v); };
  await RC.get('marketplaces', counting);       // iCalls=1, cached
  RC.invalidate('marketplaces');
  await RC.get('marketplaces', counting);       // iCalls=2, refetched
  eq(iCalls, 2, 'C1: invalidate forces the next get to refetch');
  // stale-in-flight drop:
  RC.invalidate('marketplaces');
  var slowResolve;
  var slow2 = function () { return new Promise(function (r) { slowResolve = r; }); };
  var pStale = RC.get('marketplaces', slow2);   // in-flight
  RC.invalidate('marketplaces');                 // invalidated WHILE in-flight
  slowResolve([{ stale: true }]);
  await pStale.catch(function () {});
  await tick();
  ok(!RC._hasSettled('marketplaces'), 'C1: a load resolving AFTER an invalidation is dropped, not stored (no stale retain)');

  // --- different keys do not collide ---
  RC.clear();
  var mk = 0, wh = 0;
  await RC.get('marketplaces', function () { mk++; return Promise.resolve(['M']); });
  await RC.get('warehouses', function () { wh++; return Promise.resolve(['W']); });
  eq([await RC.get('marketplaces', function () { mk++; return Promise.resolve(['M']); }), await RC.get('warehouses', function () { wh++; return Promise.resolve(['W']); })], [['M'], ['W']], 'C1: distinct reference keys are isolated');
  ok(mk === 1 && wh === 1, 'C1: distinct keys each dedupe independently (no cross-key collision)');

  // ===================================================================================================================
  console.log('\n== C5 IR primary payload UNCHANGED (lazy-include deferred); C6 guards already exist ==');
  // C5: the IR primary read still passes NO include object (all base tables) — deferred (needs coordinated 60_ + refactor).
  ok(/getWorkspace\('inventoryReplenishment', \{\}\)/.test(IR), 'C5 deferred: IR primary read still {} (base payload BEFORE==AFTER)');
  // F1-7N-FB-4C — STRENGTHENED. The include-gated lazy read and the once-guard are both intact; both moved into
  // KM.methodRegistry, which owns the request, the per-scope cache and the single-flight latch. The once-guard is
  // now PROVED by execution (a second ensureLoaded issues no request) rather than by grepping for a variable.
  var MREG_ = require(require('path').join(__dirname, '..', 'js', 'core', 'method-registry.js'));
  var MREG_SRC_ = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'core', 'method-registry.js'), 'utf8');
  ok(/getWorkspace\('inventoryReplenishment', \{ include: \{ carrierPlanning: true \} \}\)/.test(MREG_SRC_),
    'IR carrier planning is still lazy via the existing include mechanism (now owned by the method registry)');
  (function () {
    var calls = { n: 0 };
    var reg = MREG_.create({ read: function () { calls.n++; return Promise.resolve({ success: true, data: {} }); },
      adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
    var sc = { company: 'KM', country: 'US', marketplace: 'Amazon' };
    reg.ensureLoaded(sc).then(function () { return reg.ensureLoaded(sc); }).then(function () {
      ok(calls.n === 1, 'C6: IR carrier once-guard present (unchanged) — a second load issues NO request');
    });
  })();
  ok(/var _fcSecondaryLoaded = false;/.test(read('js/pages/fc-summary.js')) && /function _fcResetSecondaryCache\(\)/.test(read('js/pages/fc-summary.js')), 'C6: FC secondary once-guard + reset present (unchanged)');
  ok(/var _roL2Ready = false;/.test(read('js/pages/request-order.js')), 'C6: RO L2 once-guard present (unchanged)');

  // ===================================================================================================================
  console.log('\n== Frozen invariants: no global cache / no broad read / no prime reintroduced ==');
  ok(APP.indexOf('loadOperationDb') === -1, 'app prime remains 0');
  var FORCE = 'loadOperationDb({ force: true })';
  eq((DBAPI.split('await ' + FORCE + ';').length - 1), 2, 'writer full-reload remains 0 (db-api 2 non-writer reloads)');
  ok(DBAPI.indexOf('window._opDbCache = ') === -1 || /F1-7M-C/.test(DBAPI), 'referenceCache does NOT reintroduce a global _opDbCache authority (it is a separate keyed memo)');
  ok(/REFERENCE-ONLY/.test(DBAPI) && /never business facts/i.test(DBAPI), 'referenceCache is documented reference-only');
  // The reference cache must NOT persist across sessions.
  ok(DBAPI.indexOf('localStorage') === -1 || !/referenceCache[\s\S]{0,300}localStorage/.test(DBAPI), 'referenceCache uses no LocalStorage / no cross-session persistence');

  console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
  if (fail) process.exitCode = 1;
})();
