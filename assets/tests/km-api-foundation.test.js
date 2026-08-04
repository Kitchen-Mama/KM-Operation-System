// Kitchen Mama Operation System — API FOUNDATION tests (Phase API-1, Round A).
// Run: node assets/tests/km-api-foundation.test.js
// LOCAL / SOURCE-LEVEL. Requires the real UMD foundation module directly (clean module.exports — no eval).
// Proves: Registry, Dispatcher, Feature Flag routing, Legacy Adapter backward-compat, Response Envelope,
// Error Envelope (never a bare string), Forbidden-operation fail-closed (KMSAFE mirror), memory Cache (TTL=0),
// determinism, and ZERO business logic in the module. No DOM, no live Spreadsheet, no network.

var path = require('path');
var KMAPI = require(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'));
var KMSAFE = require(path.join(__dirname, '..', 'js', 'core', 'supply-planning-production-safety.js'));

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
// normalize a promise so a rejection can't abort the flat async flow (foundation never rejects, but be safe)
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { success: false, errors: [{ code: 'REJECTED', message: String(e) }] }; }); }

// ---- a fake legacy surface (stand-in for window.KM.DB) --------------------------------------------------
function makeLegacy() {
  var calls = [];
  return {
    _calls: calls,
    getOperationDb: function (params) { calls.push(['getOperationDb', params]); return { tables: { sku_details: [] }, _sourceMode: 'mock' }; },
    updateShippingPlanStatus: function (payload) { calls.push(['updateShippingPlanStatus', payload]); return { updated: true, id: payload && payload.id }; },
    boom: function () { throw new Error('legacy exploded'); }
  };
}

(async function main() {

  // =====================================================================================================
  section('Module surface + constants');
  ok(typeof KMAPI.createApiFoundation === 'function', 'S1 factory exported');
  ok(typeof KMAPI.createDefault === 'function', 'S2 createDefault exported');
  ok(KMAPI.FEATURE_FLAGS_DEFAULT.USE_WORKSPACE_API === false, 'S3 USE_WORKSPACE_API default is false (production = legacy)');
  ok(KMAPI.DEFAULT_WORKSPACES.length === 7, 'S4 exactly 7 domain workspaces seeded');
  ok(KMAPI.API_ERROR_CODES.FORBIDDEN_OPERATION === 'FORBIDDEN_OPERATION', 'S5 error taxonomy present');

  // =====================================================================================================
  section('Workspace Registry');
  var api = KMAPI.createApiFoundation({ legacy: makeLegacy() });
  var names = api.registry.list().map(function (w) { return w.name; }).sort();
  ok(JSON.stringify(names) === JSON.stringify(['fcSummary', 'inventoryReplenishment', 'purchaseOrder', 'requestOrder', 'shipment', 'skuDetails', 'weeklyShipping']),
    'R1 the 7 canonical workspaces are registered');
  ok(api.registry.has('weeklyShipping') && !api.registry.has('nope'), 'R2 has() works');
  // API-2: weeklyShipping graduated to IMPLEMENTED; the other six remain REGISTERED-only.
  ok(api.registry.get('weeklyShipping').status === 'IMPLEMENTED', 'R3a weeklyShipping is IMPLEMENTED (API-2)');
  ok(api.registry.list().filter(function (w) { return w.name !== 'weeklyShipping'; }).every(function (w) { return w.status === 'REGISTERED' && w.implemented === false; }), 'R3b the other six workspaces remain REGISTERED-only');
  ok(api.registry.get('weeklyShipping').tables.indexOf('shipping_plans') >= 0, 'R4 registry carries the table set');
  api.registry.register('customWs', { tables: ['t'] });
  ok(api.registry.has('customWs'), 'R5 register() adds a new workspace');
  var rw = api.workspaceResolver.resolve('shipment');
  ok(rw.found === true && rw.implemented === false && rw.status === 'REGISTERED', 'R6 WorkspaceResolver.resolve reports registered/not-implemented');
  ok(api.workspaceResolver.resolve('ghost').found === false, 'R7 resolver reports unknown workspace');

  // =====================================================================================================
  section('Response Envelope contract { success, data, meta, errors }');
  var resp = api.responseEnvelope.build({ x: 1 }, { source: 'legacy', action: 'foo' });
  ok(resp.success === true && resp.errors.length === 0, 'E1 success envelope shape');
  ok('data' in resp && 'meta' in resp && 'errors' in resp, 'E2 has data/meta/errors');
  ok(resp.meta.apiVersion === '1' && resp.meta.cached === false, 'E3 meta carries apiVersion + cached=false (TTL 0)');
  ok(JSON.stringify(resp) === JSON.stringify(JSON.parse(JSON.stringify(resp))), 'E4 envelope is JSON-safe');

  // =====================================================================================================
  section('Error Envelope contract { code, message, details } — never a bare string');
  var er = api.errorEnvelope.build('UNKNOWN_ACTION', 'no such action', { action: 'zzz' }, { source: 'legacy' });
  ok(er.success === false && er.data === null, 'X1 error envelope success=false, data=null');
  ok(er.errors.length === 1 && er.errors[0].code === 'UNKNOWN_ACTION', 'X2 errors[0].code present');
  ok(typeof er.errors[0].message === 'string' && 'details' in er.errors[0], 'X3 message + details present');
  var ex = api.errorEnvelope.fromException(new Error('kaboom'), { action: 'a' });
  ok(ex.success === false && ex.errors[0].code === 'TRANSPORT_ERROR' && ex.errors[0].message.indexOf('kaboom') >= 0, 'X4 exception → structured envelope (no throw)');
  var exStr = api.errorEnvelope.fromException('raw string thrown', null);
  ok(exStr.success === false && typeof exStr.errors[0].message === 'string', 'X5 even a thrown STRING becomes a structured error');

  // =====================================================================================================
  section('Feature Flag routing (default legacy)');
  ok(api.getFlags().USE_WORKSPACE_API === false, 'F1 default flag false');
  var wsLegacy = await run(api.client.getWorkspace('weeklyShipping'));
  ok(wsLegacy.success === true && wsLegacy.meta.source === 'legacy' && wsLegacy.meta.mode === 'legacy', 'F2 flag OFF → getWorkspace routes to LEGACY');
  api.setWorkspaceApiEnabled(true);
  // requestOrder is still REGISTERED-only → master ON routes to the workspace path and fails closed.
  var wsWs = await run(api.client.getWorkspace('requestOrder'));
  ok(wsWs.success === false && wsWs.errors[0].code === 'WORKSPACE_NOT_IMPLEMENTED' && wsWs.meta.source === 'workspace', 'F3 flag ON → registered-only workspace returns WORKSPACE_NOT_IMPLEMENTED');
  api.setWorkspaceApiEnabled(false); // restore

  // =====================================================================================================
  section('Legacy Adapter backward-compatibility (delegates to KM.DB.*)');
  var legacy = makeLegacy();
  var api2 = KMAPI.createApiFoundation({ legacy: legacy });
  var cmd = await run(api2.client.executeCommand('updateShippingPlanStatus', { id: 'SP-1', status: 'approved' }));
  ok(cmd.success === true && cmd.data.updated === true && cmd.data.id === 'SP-1', 'L1 executeCommand delegates to the legacy method and returns its data');
  ok(legacy._calls.some(function (c) { return c[0] === 'updateShippingPlanStatus' && c[1].id === 'SP-1'; }), 'L2 the underlying legacy function was actually invoked with the payload');
  ok(cmd.meta.source === 'legacy', 'L3 meta records legacy source');
  var wsRead = await run(api2.client.getWorkspace('shipment'));
  ok(wsRead.success === true && legacy._calls.some(function (c) { return c[0] === 'getOperationDb'; }), 'L4 legacy-mode workspace read delegates to getOperationDb (today\'s behavior preserved)');
  var unknown = await run(api2.client.executeCommand('noSuchLegacyAction', {}));
  ok(unknown.success === false && unknown.errors[0].code === 'UNKNOWN_ACTION', 'L5 unknown legacy action → UNKNOWN_ACTION (fail closed, no throw)');
  var boom = await run(api2.client.executeCommand('boom', {}));
  ok(boom.success === false && boom.errors[0].code === 'TRANSPORT_ERROR' && boom.errors[0].message.indexOf('exploded') >= 0, 'L6 a throwing legacy method → structured error envelope');

  // =====================================================================================================
  section('Dispatcher routing + validation');
  var badKind = await run(api2.dispatcher.dispatch({ kind: 'nonsense' }));
  ok(badKind.success === false && badKind.errors[0].code === 'INVALID_REQUEST', 'D1 unknown request kind → INVALID_REQUEST');
  var badReq = await run(api2.dispatcher.dispatch(null));
  ok(badReq.success === false && badReq.errors[0].code === 'INVALID_REQUEST', 'D2 non-object request → INVALID_REQUEST');
  var unkWs = await run(api2.client.getWorkspace('ghostWorkspace'));
  ok(unkWs.success === false && unkWs.errors[0].code === 'UNKNOWN_WORKSPACE', 'D3 unknown workspace → UNKNOWN_WORKSPACE');

  // =====================================================================================================
  section('Forbidden operations — KMSAFE mirror, fail-closed in BOTH modes');
  var forbidden = ['createSheet', 'insertSheet', 'deleteSheet', 'appendHeader', 'modifySchema', 'migrate', 'insertColumn', 'deleteColumn', 'replaceSheet'];
  var allBlocked = true, code = 'FORBIDDEN_OPERATION';
  for (var i = 0; i < forbidden.length; i++) {
    var r = await run(api2.client.executeCommand(forbidden[i], {}));
    if (!(r.success === false && r.errors[0].code === code)) { allBlocked = false; console.error('  not blocked:', forbidden[i]); }
    ok(api2.isForbiddenAction(forbidden[i]) === true, 'G-pred ' + forbidden[i] + ' predicate=true');
  }
  ok(allBlocked, 'G1 every forbidden schema/structural op is refused with FORBIDDEN_OPERATION');
  // even with the Workspace API flag ON, forbidden stays blocked
  api2.setWorkspaceApiEnabled(true);
  var fWs = await run(api2.client.executeCommand('migrateSchema', {}));
  ok(fWs.success === false && fWs.errors[0].code === 'FORBIDDEN_OPERATION', 'G2 forbidden op still blocked with Workspace API ON');
  api2.setWorkspaceApiEnabled(false);
  ok(legacy._calls.every(function (c) { return forbidden.indexOf(c[0]) < 0; }), 'G3 no forbidden op ever reached the legacy surface');
  ok(api2.isForbiddenAction('updateShippingPlanStatus') === false && api2.isForbiddenAction('getOperationDb') === false, 'G4 normal read/write actions are NOT falsely forbidden');

  // cross-check the mirror against the real KMSAFE structural-op authority
  var safeStructural = KMSAFE.STRUCTURAL_OPS.map(function (s) { return String(s).toLowerCase(); });
  var mirrored = KMAPI.FORBIDDEN_ACTIONS.map(function (s) { return String(s).toLowerCase(); });
  var coverage = safeStructural.filter(function (s) { return mirrored.indexOf(s) >= 0 || api2.isForbiddenAction(s); });
  ok(coverage.length === safeStructural.length, 'G5 API forbidden-guard covers 100% of KMSAFE STRUCTURAL_OPS (' + coverage.length + '/' + safeStructural.length + ')');

  // =====================================================================================================
  section('Cache Layer (memory only, TTL = 0 → interface present, never caches)');
  ok(api2.cache.ttl === 0, 'C1 TTL is 0');
  api2.cache.set('k', { v: 1 });
  ok(api2.cache.get('k') === null, 'C2 get() always misses while TTL=0 (no stale data)');
  ok(api2.cache.size() === 0, 'C3 set() is a no-op while TTL=0');
  ok(typeof api2.cache.invalidate === 'function' && typeof api2.cache.clear === 'function', 'C4 invalidate/clear interface present');

  // =====================================================================================================
  section('Determinism + zero-business-logic proof');
  var a = api.responseEnvelope.build({ n: 5 }, { action: 'x' });
  var b = api.responseEnvelope.build({ n: 5 }, { action: 'x' });
  ok(JSON.stringify(a) === JSON.stringify(b), 'Z1 identical inputs → byte-identical envelopes (deterministic)');
  var srcTxt = require('fs').readFileSync(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'), 'utf8');
  ok(srcTxt.indexOf('Date.now') < 0 && srcTxt.indexOf('Math.random') < 0 && srcTxt.indexOf('localeCompare') < 0, 'Z2 no Date.now / Math.random / localeCompare');
  // zero business-logic: no domain calculation identifiers leak into the foundation
  // true business-calc identifiers (NOT table names — a read-registry legitimately names tables like
  // shipping_allocation_drafts). None of these computation fields may appear in a pure transport layer.
  var businessTokens = ['recommended_qty', 'planned_qty', 'order_qty', 'units_per_carton', 'reserved_stock', 'current_stock', 'submitRecommendation'];
  var leaked = businessTokens.filter(function (t) { return srcTxt.indexOf(t) >= 0; });
  ok(leaked.length === 0, 'Z3 no business-logic tokens in the API foundation (' + (leaked.join(',') || 'clean') + ')');

  // =====================================================================================================
  section('Backward-compat guard: module is additive + inert while flag is off');
  // A fresh default instance touches nothing until called, and calling it never mutates the legacy object shape.
  var legacy3 = makeLegacy();
  var keysBefore = Object.keys(legacy3).sort().join(',');
  var api3 = KMAPI.createApiFoundation({ legacy: legacy3 });
  ok(Object.keys(legacy3).sort().join(',') === keysBefore, 'B1 constructing the foundation does not mutate the legacy surface');
  ok(legacy3._calls.length === 0, 'B2 no legacy call happens until a client method is invoked (inert)');

  console.log('\n----------------------------------------');
  console.log('API FOUNDATION: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
