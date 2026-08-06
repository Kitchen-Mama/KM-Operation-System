// Kitchen Mama Operation System — API FOUNDATION F2 COMPATIBILITY hardening tests (Phase API-1.5).
// Run: node assets/tests/km-api-foundation-compat.test.js
// LOCAL / SOURCE-LEVEL. Proves Legacy/Foundation coexistence, load-order safety, delayed/replaced KM.DB
// resolution (the API-1.5 stale-capture fix), flag fail-closed, no dual execution, error visibility (no
// false-success), 62-Router-action guard classification, JSON-safe serialization, transport-not-configured,
// per-slice flag readiness, zero-I/O init, and 22-page source non-impact. Executes the REAL Foundation
// source. No DOM, no live Spreadsheet, no network.

var fs = require('fs');
var path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var MOD_REL = path.join('js', 'api', 'km-api-foundation.js');
var MOD_ABS = path.join(__dirname, '..', MOD_REL);
var KMAPI = require(MOD_ABS);

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { success: false, errors: [{ code: 'REJECTED', message: String(e) }] }; }); }

function makeLegacy() {
  var calls = [];
  return {
    _calls: calls,
    getOperationDb: function (p) { calls.push(['getOperationDb', p]); return { tables: {}, _sourceMode: 'mock' }; },
    updateShippingPlanStatus: function (p) { calls.push(['updateShippingPlanStatus', p]); return { updated: true, id: p && p.id }; },
    legacyFalse: function () { calls.push(['legacyFalse']); return { success: false, error: 'legacy said no' }; },
    legacyReject: function () { calls.push(['legacyReject']); return Promise.reject(new Error('legacy rejected')); },
    legacyThrow: function () { calls.push(['legacyThrow']); throw new Error('legacy threw'); },
    legacyNull: function () { calls.push(['legacyNull']); return null; },
    legacyString: function () { calls.push(['legacyString']); return 'weird'; }
  };
}

(async function main() {

  // =====================================================================================================
  section('§2 Script load-order (index.html)');
  var html = read('../index.html');
  // match the actual <script src="…"> tags (quoted) so an earlier code-comment mention can't skew positions
  var pNs = html.indexOf('"assets/js/core/namespace.js"'), pDb = html.indexOf('"assets/js/api/operation-system-db-api.js"'),
      pFn = html.indexOf('"assets/js/api/km-api-foundation.js"'), pApp = html.indexOf('"assets/js/app.js"');
  ok(pNs >= 0 && pFn >= 0, 'LO1 namespace.js + foundation both present');
  ok(pNs < pFn, 'LO2 namespace.js loads BEFORE the Foundation (window.KM exists first)');
  ok(pDb >= 0 && pDb < pFn, 'LO3 operation-system-db-api.js (KM.DB) loads BEFORE the Foundation');
  ok(pApp > pFn, 'LO4 app.js loads AFTER the Foundation');
  ok((html.match(/api\/km-api-foundation\.js/g) || []).length === 1, 'LO5 exactly ONE Foundation <script> tag (no duplicate load)');
  ok(html.indexOf('km-api-foundation.js" defer') < 0 && html.indexOf('km-api-foundation.js" async') < 0, 'LO6 Foundation tag is not defer/async (deterministic order)');

  // =====================================================================================================
  section('§3 Namespace + delayed/replaced KM.DB (API-1.5 stale-capture fix)');
  // A/B: construct with KM.DB absent, attach AFTER → adapter resolves the LIVE authority at call time
  var g = global; g.window = g; g.window.KM = {};
  var apiLive = KMAPI.createApiFoundation({});      // no injected legacy → resolves window.KM.DB live
  ok(g.window.KM.api === undefined || typeof g.window.KM.api === 'object', 'NS0 namespace intact');
  g.window.KM.DB = { getOperationDb: function () { return { v: 'V1' }; } };
  var r1 = await run(apiLive.client.getWorkspace('weeklyShipping'));
  ok(r1.success === true && r1.data.v === 'V1', 'NS1 KM.DB attached AFTER construction is resolved (no stale capture)');
  g.window.KM.DB = { getOperationDb: function () { return { v: 'V2' }; } };   // D: replaced later
  var r2 = await run(apiLive.client.getWorkspace('weeklyShipping'));
  ok(r2.success === true && r2.data.v === 'V2', 'NS2 REPLACED KM.DB is resolved on the next call (call-time authority)');
  // namespace preservation: loading the module did not clobber a pre-existing KM member
  g.window.KM.somethingExisting = 42;
  var reloaded = (function () { delete require.cache[require.resolve(MOD_ABS)]; return require(MOD_ABS); })();
  reloaded; // re-require executes the UMD again
  ok(g.window.KM.somethingExisting === 42, 'NS3 re-loading the Foundation preserves existing KM members');
  ok(g.window.KM.api !== undefined, 'NS4 window.KM.api present after (re)load');

  // E: double-load guard — window.KM.api is not overwritten by a second load
  var firstApi = g.window.KM.api;
  (function () { delete require.cache[require.resolve(MOD_ABS)]; require(MOD_ABS); })();
  ok(g.window.KM.api === firstApi, 'NS5 double-load does NOT overwrite the existing window.KM.api (idempotent attach)');
  delete g.window; // clean up global pollution for the rest of the suite

  // =====================================================================================================
  section('§4 Feature Flag — false parity, true fail-closed, no dual execution');
  var lg = makeLegacy();
  var api = KMAPI.createApiFoundation({ legacy: lg });
  ok(api.getFlags().USE_WORKSPACE_API === false, 'FF1 default false (production)');
  var c1 = await run(api.client.executeCommand('updateShippingPlanStatus', { id: 'A' }));
  ok(c1.success === true && c1.data.updated === true && c1.meta.source === 'legacy', 'FF2 flag false → legacy delegation (parity)');
  var legacyCallsAfter = lg._calls.filter(function (x) { return x[0] === 'updateShippingPlanStatus'; }).length;
  ok(legacyCallsAfter === 1, 'FF3 exactly ONE legacy invocation (no dual execution)');
  api.setWorkspaceApiEnabled(true);
  // requestOrder remains REGISTERED-only (weeklyShipping graduated to IMPLEMENTED in API-2) → master ON fails closed.
  var w1 = await run(api.client.getWorkspace('requestOrder'));
  ok(w1.success === false && w1.errors[0].code === 'WORKSPACE_NOT_IMPLEMENTED', 'FF4 flag true + unimplemented → fail-closed WORKSPACE_NOT_IMPLEMENTED');
  var legacyReadCalls = lg._calls.filter(function (x) { return x[0] === 'getOperationDb'; }).length;
  ok(legacyReadCalls === 0, 'FF5 workspace-mode did NOT fall back to legacy (no silent dual/fallback execution)');
  var w2 = await run(api.client.getWorkspace('ghost'));
  ok(w2.success === false && w2.errors[0].code === 'UNKNOWN_WORKSPACE', 'FF6 flag true + unknown workspace → UNKNOWN_WORKSPACE');
  api.setWorkspaceApiEnabled(false);

  // per-slice flag readiness classification: the flag is currently a single GLOBAL boolean
  ok(typeof api.flags.USE_WORKSPACE_API === 'boolean' && Object.keys(api.getFlags()).length === 1, 'FF7 global master remains a single boolean; per-workspace map is separate (getWorkspaceFlags)');
  ok(Object.keys(api.getWorkspaceFlags()).length === 8 && api.getWorkspaceFlags().weeklyShipping === false && api.getWorkspaceFlags().recommendation === false, 'FF8 per-workspace flag map present (8 incl. recommendation), all default false (API-2/F1-4B-A)');

  // =====================================================================================================
  section('§5/§6 Legacy parity + error visibility — NO false success');
  var api2 = KMAPI.createApiFoundation({ legacy: lg });
  // resolved legacy {success:false} is PRESERVED verbatim in data (business status not lost, not converted)
  var f1 = await run(api2.client.executeCommand('legacyFalse', {}));
  ok(f1.success === true && f1.data && f1.data.success === false && f1.data.error === 'legacy said no',
    'ER1 resolved legacy {success:false} preserved verbatim in data (envelope success=transport-level, business status intact)');
  // a legacy REJECTION becomes an envelope success:false (never masked as success)
  var f2 = await run(api2.client.executeCommand('legacyReject', {}));
  ok(f2.success === false && f2.errors.length >= 1 && f2.errors[0].message.indexOf('rejected') >= 0, 'ER2 legacy REJECTION → envelope success:false (not masked)');
  var f3 = await run(api2.client.executeCommand('legacyThrow', {}));
  ok(f3.success === false && f3.errors[0].message.indexOf('threw') >= 0, 'ER3 legacy THROW → envelope success:false');
  // malformed / empty legacy responses do not crash and are not fabricated into a richer success
  var f4 = await run(api2.client.executeCommand('legacyNull', {}));
  ok(f4.success === true && f4.data === null, 'ER4 legacy null preserved as data:null (no crash, no fabrication)');
  var f5 = await run(api2.client.executeCommand('legacyString', {}));
  ok(f5.success === true && f5.data === 'weird', 'ER5 legacy string preserved as data');
  // EVERY failure envelope carries a deterministic error code (frontend distinguishes without parsing text)
  var failures = [f2, f3, await run(api2.client.executeCommand('noSuchAction', {}))];
  ok(failures.every(function (r) { return r.success === false && r.errors[0] && typeof r.errors[0].code === 'string' && r.errors[0].code.length > 0; }), 'ER6 all failures expose a machine-readable errors[].code');

  // =====================================================================================================
  section('§9/§19 Forbidden-op guard vs all Router actions (from live 01_router.gs)');
  var routerSrc = read('specs/active/apps-script/01_router.gs');
  var actions = {}; var m, re = /action === '([a-zA-Z0-9_]+)'/g;
  while ((m = re.exec(routerSrc)) !== null) { actions[m[1]] = true; }
  var actionList = Object.keys(actions).sort();
  ok(actionList.length >= 60, 'GD1 extracted the full Router action set (' + actionList.length + ' actions)');
  var blocked = actionList.filter(function (a) { return api2.isForbiddenAction(a); });
  ok(blocked.length === 0, 'GD2 ZERO business Router actions falsely blocked (' + (blocked.join(',') || 'none') + ')');
  // true structural/schema ops ARE blocked (case/spacing variants covered)
  ok(api2.isForbiddenAction('createSheet') && api2.isForbiddenAction('CREATESHEET') && api2.isForbiddenAction('  migrate  ') && api2.isForbiddenAction('appendHeader'), 'GD3 structural/schema ops blocked incl. case/space variants');
  ok(!api2.isForbiddenAction('createRequestOrderDraft') && !api2.isForbiddenAction('createPurchaseOrderFromRequest') && !api2.isForbiddenAction('createShippingPlansBatch'), 'GD4 business "create*" domain actions are NOT false-positives');

  // =====================================================================================================
  section('§10 Active-page source non-impact (all page modules)');
  var pagesDir = path.join(__dirname, '..', 'js', 'pages');
  var pageFiles = fs.readdirSync(pagesDir).filter(function (f) { return /\.js$/.test(f); });
  // API-3A: shipping-plan.js is the ONLY page cut over to KM.api (READ path). Every OTHER page stays independent.
  var CUTOVER_PAGES = { 'shipping-plan.js': 1 };
  var referencing = pageFiles.filter(function (f) { return !CUTOVER_PAGES[f] && /KM\.api\b|apiFoundation|km-api-foundation/.test(fs.readFileSync(path.join(pagesDir, f), 'utf8')); });
  ok(referencing.length === 0, 'PG1 only the API-3A cutover page uses KM.api; the other ' + (pageFiles.length - 1) + ' pages remain independent (' + (referencing.join(',') || 'clean') + ')');
  // and the cutover page uses KM.api for READ only (getWorkspace/workspaceApiActive) — never a write command
  var spSrc = fs.readFileSync(path.join(pagesDir, 'shipping-plan.js'), 'utf8');
  ok(/KM\.api\.getWorkspace/.test(spSrc) && spSrc.indexOf('KM.api.executeCommand') < 0, 'PG1b the cutover page uses KM.api for READ only (no executeCommand / no workspace write)');
  var appSrc = read('js/app.js');
  ok(!/KM\.api\b|apiFoundation/.test(appSrc), 'PG2 app.js does not reference the Foundation');

  // =====================================================================================================
  section('§14 Cache TTL=0 + §15 JSON-safe serialization');
  api2.cache.set('k', { big: 1 });
  ok(api2.cache.get('k') === null && api2.cache.size() === 0 && api2.cache.ttl === 0, 'CA1 cache TTL=0: set no-op, get miss');
  var okData = await run(api2.client.executeCommand('updateShippingPlanStatus', { id: 'Z' }));
  ok(okData.meta.cached === false, 'CA2 meta.cached is false');
  // serialization: envelopes for odd inputs stay JSON-safe / structured (no crash)
  var circular = {}; circular.self = circular;
  var s1 = api2.responseEnvelope.build(undefined, { action: 'x' });
  ok(JSON.stringify(s1) === JSON.stringify(JSON.parse(JSON.stringify(s1))) && s1.data === null, 'SZ1 undefined data → null, JSON-safe');
  var s2 = api2.errorEnvelope.build('INTERNAL_ERROR', 'e', { nonFinite: 1 / 0 }, {});   // Infinity → JSON null (no crash)
  ok(JSON.parse(JSON.stringify(s2)).errors[0].details.nonFinite === null, 'SZ2 non-finite detail serializes to null (no crash, no hidden success)');
  var threw = false; try { JSON.stringify(api2.errorEnvelope.build('X', 'm', circular, {})); } catch (e) { threw = true; }
  ok(threw === true, 'SZ3 a genuinely circular detail throws at JSON.stringify (caller-visible, not silently "successful")');

  // =====================================================================================================
  section('§16 Transport readiness (no live fetch)');
  var apiT = KMAPI.createApiFoundation({ legacy: lg });   // no baseUrl, no fetch
  ok(apiT.transport.configured() === false, 'TR1 transport not configured during dormant init');
  var tg = await run(apiT.transport.get({ action: 'x' }));
  ok(tg.errors && tg.errors[0].code === 'REJECTED' || (tg.apiCode === 'TRANSPORT_NOT_CONFIGURED'), 'TR2 GET without config rejects (TRANSPORT_NOT_CONFIGURED)');
  var tp = await run(apiT.transport.post({ a: 1 }));
  ok(tp.errors && tp.errors[0].code === 'REJECTED', 'TR3 POST without config rejects');

  // =====================================================================================================
  section('§18 Zero-I/O initialization');
  var lg2 = makeLegacy();
  KMAPI.createApiFoundation({ legacy: lg2 });   // construct only
  ok(lg2._calls.length === 0, 'IO1 constructing the Foundation issues ZERO legacy calls (zero-I/O init)');
  var srcTxt = read(MOD_REL);
  ok(srcTxt.indexOf('Date.now') < 0 && srcTxt.indexOf('Math.random') < 0, 'IO2 no wall-clock / RNG in source');

  console.log('\n----------------------------------------');
  console.log('API FOUNDATION F2 COMPAT: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
