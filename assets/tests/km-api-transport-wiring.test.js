// Kitchen Mama Operation System — API Workspace Transport wiring tests (Hotfix T1).
// Run: node assets/tests/km-api-transport-wiring.test.js
// LOCAL / SOURCE-LEVEL. Proves the Workspace ApiTransport resolves the EXISTING canonical Web App URL at call
// time (via window.KM.DB.getApiBaseUrl — no duplicate literal), removes TRANSPORT_NOT_CONFIGURED for a valid
// URL, classifies missing/malformed URLs, sends exactly one POST with the canonical body, never double-wraps the
// envelope, never falls back to Legacy after the Workspace request starts, and keeps Legacy untouched.
// No live Spreadsheet, no network (fetch is faked).

var fs = require('fs');
var path = require('path');
var MOD = path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js');
var KMAPI = require(MOD);
var FND_SRC = fs.readFileSync(MOD, 'utf8');
var DBAPI_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');

var URL_OK = 'https://script.google.com/macros/s/AKfyc_EXAMPLE_SCRIPT_ID/exec';

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { success: false, errors: [{ code: 'REJECTED', message: String(e) }] }; }); }

function serverEnv(okFlag) {
  return { success: okFlag, data: okFlag ? { plans: [{ planId: 'SP-1' }], summary: {} } : null,
    meta: { requestId: 'REQ-SVR', serverDurationMs: 7, tablesRead: 4 },
    errors: okFlag ? [] : [{ code: 'WRONG_SPREADSHEET_TARGET', message: 'x', details: null }] };
}
// fake fetch returning a Response-like object; records calls
function makeFetch(env) { var calls = []; var f = function (url, init) { calls.push({ url: url, init: init }); return Promise.resolve({ json: function () { return Promise.resolve(env); } }); }; f._calls = calls; return f; }
function makeLegacy() { var calls = []; return { _calls: calls, getOperationDb: function () { calls.push('getOperationDb'); return { tables: {} }; }, updateShippingPlanStatus: function () { calls.push('write'); return { ok: 1 }; } }; }
// build a Workspace-enabled foundation whose URL comes from window.KM.DB.getApiBaseUrl (proves reuse)
function wsApi(fetchFn, getUrl, legacy) {
  global.window = { KM: { DB: Object.assign({ getApiBaseUrl: getUrl }, legacy || {}) } };
  return KMAPI.createApiFoundation({ fetch: fetchFn, flags: { USE_WORKSPACE_API: true }, workspaceFlags: { weeklyShipping: true } });
}

(async function main() {

  // =====================================================================================================
  section('Single URL authority — no duplicate literal, canonical getter');
  ok(/window\.KM\.DB\.getApiBaseUrl\s*=\s*function/.test(DBAPI_SRC) && /OP_DB_API_BASE_URL/.test(DBAPI_SRC), 'U1 operation-system-db-api.js exposes the canonical getApiBaseUrl() (reuses OP_DB_API_BASE_URL)');
  ok(FND_SRC.indexOf('macros/s/') < 0 && FND_SRC.indexOf('AKfyc') < 0, 'U2 the Foundation contains NO duplicated literal Web App URL / Script ID');
  ok(/window\.KM\.DB\.getApiBaseUrl/.test(FND_SRC) && /resolveBaseUrl/.test(FND_SRC), 'U3 the Foundation resolves the URL through the KM.DB authority');

  // =====================================================================================================
  section('Call-time resolution + delayed KM.DB availability');
  var f1 = makeFetch(serverEnv(true));
  // construct with KM.DB.getApiBaseUrl returning '' (not ready), then make it ready → next call must work
  var notReady = '';
  var api = wsApi(f1, function () { return notReady; });
  var early = await run(api.client.getWorkspace('weeklyShipping'));
  ok(early.success === false && early.errors[0].code === 'TRANSPORT_NOT_CONFIGURED', 'CT1 URL not ready → TRANSPORT_NOT_CONFIGURED');
  notReady = URL_OK;   // URL becomes available AFTER construction/first call
  var later = await run(api.client.getWorkspace('weeklyShipping'));
  ok(later.success === true && later.meta.source === 'workspace', 'CT2 URL resolved at CALL TIME → next request works (no stale capture)');
  ok(f1._calls.length === 1, 'CT3 exactly ONE network request issued (only the ready call)');

  // =====================================================================================================
  section('Valid URL → one canonical POST, no TRANSPORT_NOT_CONFIGURED');
  var f2 = makeFetch(serverEnv(true));
  var api2 = wsApi(f2, function () { return URL_OK; });
  var r = await run(api2.client.getWorkspace('weeklyShipping', { requestId: 'REQ-USER7' }));
  ok(r.success === true && !(r.errors && r.errors.length), 'TX1 valid URL → success, no TRANSPORT_NOT_CONFIGURED');
  ok(f2._calls.length === 1, 'TX2 exactly one request (no dual request)');
  ok(f2._calls[0].url === URL_OK && f2._calls[0].init.method === 'POST' && /text\/plain/.test(f2._calls[0].init.headers['Content-Type']), 'TX3 POST to the canonical Web App URL, text/plain');
  var body = JSON.parse(f2._calls[0].init.body);
  ok(body.action === 'weeklyShipping.workspace.get' && body.requestId === 'REQ-USER7' && body.payload, 'TX4 body carries action + requestId + payload (doPost contract)');
  ok(r.meta.requestId === 'REQ-USER7', 'TX5 requestId preserved through the response');
  ok(r.data && r.data.plans && r.data.plans[0].planId === 'SP-1', 'TX6 envelope NOT double-wrapped (data = server view model)');

  // =====================================================================================================
  section('Apps Script failure stays an outer failure; no silent Legacy fallback');
  var lg = makeLegacy(); var f3 = makeFetch(serverEnv(false));
  var api3 = wsApi(f3, function () { return URL_OK; }, lg);
  var rf = await run(api3.client.getWorkspace('weeklyShipping'));
  ok(rf.success === false && rf.errors[0].code === 'WRONG_SPREADSHEET_TARGET', 'AS1 server success:false → outer failure (not masked)');
  ok(lg._calls.indexOf('getOperationDb') < 0, 'AS2 NO silent Legacy fallback after the Workspace request started');

  // transport error also does not fall back to Legacy
  var lg2 = makeLegacy(); var f4 = makeFetch(serverEnv(true));
  var api4 = wsApi(f4, function () { return ''; }, lg2);
  var rNoUrl = await run(api4.client.getWorkspace('weeklyShipping'));
  ok(rNoUrl.success === false && rNoUrl.errors[0].code === 'TRANSPORT_NOT_CONFIGURED' && lg2._calls.indexOf('getOperationDb') < 0, 'AS3 transport-not-configured → visible error, no Legacy fallback, no fetch');
  ok(f4._calls.length === 0, 'AS4 no request attempted when URL missing');

  // =====================================================================================================
  section('URL validation classes');
  var f5 = makeFetch(serverEnv(true));
  var apiBad = wsApi(f5, function () { return 'ftp://nope.example/exec'; });
  var rBad = await run(apiBad.client.getWorkspace('weeklyShipping'));
  ok(rBad.success === false && rBad.errors[0].code === 'TRANSPORT_URL_INVALID', 'UV1 non-https URL → TRANSPORT_URL_INVALID');
  ok(f5._calls.length === 0, 'UV2 malformed URL never issues a request');
  var apiLocal = wsApi(makeFetch(serverEnv(true)), function () { return 'http://localhost:8080/exec'; });
  ok(apiLocal.transport.configured() === true, 'UV3 localhost http allowed for dev');
  var apiHttps = wsApi(makeFetch(serverEnv(true)), function () { return URL_OK; });
  ok(apiHttps.transport.configured() === true, 'UV4 https configured');

  // =====================================================================================================
  section('getTransportStatus diagnostic (masked, no Script ID)');
  var st = apiHttps.getTransportStatus();
  ok(st.configured === true && st.source === 'KM.DB', 'DS1 status: configured + source KM.DB');
  ok(st.maskedEndpoint.indexOf('AKfyc') < 0 && st.maskedEndpoint.indexOf('EXAMPLE_SCRIPT_ID') < 0 && /script\.google\.com\/\.\.\.\/exec/.test(st.maskedEndpoint), 'DS2 endpoint masked (no Script ID)');
  ok(st.weeklyEnabled === true, 'DS3 weeklyEnabled reflects the effective flag');
  delete global.window;   // clear leaked window so the default instance has no URL authority
  var stOff = KMAPI.createApiFoundation({}).getTransportStatus();
  ok(stOff.configured === false && stOff.weeklyEnabled === true, 'DS4 default instance (no URL authority): not configured; weeklyShipping canonical-enabled (reads fail-closed until configured, never legacy)');

  // =====================================================================================================
  section('Production defaults + Legacy non-impact + safety');
  var def = KMAPI.createApiFoundation({ legacy: makeLegacy() });
  ok(def.getFlags().USE_WORKSPACE_API === false && def.getWorkspaceFlags().weeklyShipping === true, 'PD1 production: master flag stays false; weeklyShipping is canonical-enabled (F1-7B cutover)');
  ok(/window\.KM\.DB\.getApiBaseUrl = function\(\) \{ return isOperationDbApiConfigured\(\)/.test(DBAPI_SRC), 'LG1 getter is read-only (returns URL when configured, else "")');
  ok(/getOperationDb/.test(DBAPI_SRC) && /OP_DB_API_BASE_URL \+ '\?action=getOperationDb/.test(DBAPI_SRC), 'LG2 Legacy getOperationDb transport unchanged');
  ok(FND_SRC.indexOf('Date.now') < 0 && FND_SRC.indexOf('Math.random') < 0, 'SAFE1 no wall-clock / RNG added');
  var biz = ['recommended_qty', 'planned_qty', 'order_qty', 'units_per_carton', 'reserved_stock', 'submitRecommendation'];
  ok(biz.every(function (t) { return FND_SRC.indexOf(t) < 0; }), 'SAFE2 no business-logic tokens added to the Foundation');

  // load-order / double-load safety: resolveBaseUrl tolerates window absent
  delete global.window;
  var apiNoWin = KMAPI.createApiFoundation({ fetch: makeFetch(serverEnv(true)), flags: { USE_WORKSPACE_API: true }, workspaceFlags: { weeklyShipping: true } });
  var rNoWin = await run(apiNoWin.client.getWorkspace('weeklyShipping'));
  ok(rNoWin.success === false && rNoWin.errors[0].code === 'TRANSPORT_NOT_CONFIGURED', 'LO1 window absent → TRANSPORT_NOT_CONFIGURED (no crash)');

  console.log('\n----------------------------------------');
  console.log('API TRANSPORT WIRING: ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
