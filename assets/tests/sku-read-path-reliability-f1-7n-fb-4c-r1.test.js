// F1-7N-FB-4C-R1 — SKU Details / SKU Regional Details read-path reliability.
//
// Proves the 16 §G claims. The behavioural ones EXECUTE the shipped API client against a FETCH SPY, so every
// "exactly one request" claim is a counted number and every classification is the real classifier's output on
// the real router response text. Structural claims run against comment-stripped source.
//
// THE FAILURE THIS ROUND EXISTS FOR, restated so the suite cannot drift from it:
//   the live banner read "Couldn't load regional details: Missing or invalid action parameter. Use:
//   getOperationDb, getTable, system.health or inventoryScope.registry.get [BACKEND_ERROR]".
//   That message is doGet's terminal answer, and doGet lists only the actions doGet itself serves — so a POST
//   was answered by the GET handler, which means a redirect follow dropped the request body and with it the
//   action. The action was never malformed at construction; the transport lost it, and the classifier then
//   called a deployment/transport fact a "backend error".
//
// Known regression baseline (pre-existing, unrelated): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/sku-read-path-reliability-f1-7n-fb-4c-r1.test.js

var fs = require('fs');
var path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var FND = read('assets/js/api/km-api-foundation.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var LOAD = read('assets/js/api/km-loading-state.js');
var SKD = read('assets/js/pages/sku-details.js');
var SRD = read('assets/js/pages/sku-regional-details.js');
var RTR = read('assets/specs/active/apps-script/01_router.gs');
var WS59 = read('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var FNDC = code(FND), DBAPIC = code(DBAPI), SKDC = code(SKD), SRDC = code(SRD), RTRC = code(RTR);

var loadState = require(path.join(ROOT, 'assets/js/api/km-loading-state.js'));
var foundation = require(path.join(ROOT, 'assets/js/api/km-api-foundation.js'));

// ---- the real router responses, verbatim from 01_router.gs ------------------------------------------------
var DOGET_TERMINAL = 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get';
ok(RTR.indexOf(DOGET_TERMINAL) !== -1, 'S0 the doGet terminal message used by this suite is the one the router actually sends');
var DOPOST_TERMINAL_RE = /Invalid POST action/;
ok(DOPOST_TERMINAL_RE.test(RTR), 'S0 and the doPost terminal message likewise');

// ---- a fetch spy + a client wired to it -------------------------------------------------------------------
var URL_OK = 'https://script.google.com/macros/s/AKfycbTESTTESTTEST/exec';
function makeFetch(responder) {
  var f = function (url, init) {
    f._calls.push({ url: url, init: init || {} });
    var r = (typeof responder === 'function') ? responder(f._calls.length, url, init) : responder;
    if (r && r.__reject) return Promise.reject(r.__reject);
    return Promise.resolve({
      ok: true, status: 200,
      headers: { get: function (h) { return /content-type/i.test(h) ? 'application/json' : null; } },
      text: function () { return Promise.resolve(JSON.stringify(r)); },
      json: function () { return Promise.resolve(r); }
    });
  };
  f._calls = [];
  return f;
}
// Built exactly the way km-api-transport-wiring.test.js builds one, so this suite exercises the SAME wiring the
// shipped page gets: the URL comes through the window.KM.DB.getApiBaseUrl authority, not a test-only injection.
function client(fetcher, urlProvider) {
  global.window = { KM: { DB: { getApiBaseUrl: urlProvider || function () { return URL_OK; } } } };
  return foundation.createApiFoundation({
    fetch: fetcher,
    flags: { USE_WORKSPACE_API: true },
    workspaceFlags: { skuDetails: true }
  });
}
function successEnv(action, extraMeta) {
  var meta = { apiVersion: '1', source: 'workspace', action: action, workspace: 'skuDetails', cached: false };
  for (var k in (extraMeta || {})) meta[k] = extraMeta[k];
  return { success: true, data: { skuDetails: [{ sku: 'KM-1' }], skuRegionalDetails: [], marketplaceSkus: [], taxReferralRates: [], taxRateComponents: [] }, meta: meta, errors: [] };
}
function routerUnknownActionEnv(text) { return { success: false, error: text }; }
function api(fetcher) { var c = client(fetcher); return (c && c.client) ? c.client : c; }

var SKU_ACTION = 'skuDetails.workspace.get';

// ================================================================================================================
section('§B — the traced call path and the exact expected action');
// ================================================================================================================
// page → loader → API client method → shared runner → HTTP → endpoint → action → router → handler → classifier → state
ok(/window\.KM\.api\.getWorkspace\('skuDetails', \{ include: \{ regional: true \} \}\)/.test(SRDC),
  'B1 SKU Regional Details loader calls getWorkspace(skuDetails, include.regional)');
ok(/window\.KM\.api\.getWorkspace\('skuDetails', params\)/.test(SKDC),
  'B1 SKU Details loader calls getWorkspace(skuDetails)');
ok(/var SKU_DETAILS_ACTION = 'skuDetails\.workspace\.get';/.test(FNDC),
  'B2 both resolve to ONE action: skuDetails.workspace.get');
ok(RTR.indexOf("action === 'skuDetails.workspace.get'") !== -1, 'B3 which the router serves — on doPost');
var doGetSrc = RTR.slice(RTR.indexOf('function doGet('), RTR.indexOf('function doPost('));
ok(doGetSrc.indexOf("action === 'skuDetails.workspace.get'") === -1,
  'B3 and NOT on doGet — which is why a downgraded POST cannot be served');
ok(/function handleSkuDetailsWorkspaceGet_/.test(WS59), 'B4 handler owner is 59_');
// one endpoint only
ok(DBAPIC.indexOf('/dev') === -1 && FNDC.indexOf('/dev') === -1, 'B5 no /dev endpoint exists anywhere in the API layer');
ok((FNDC.match(/_fetcher\(/g) || []).length === 2, 'B5 the foundation transport has exactly two fetch sites (get + post)');

// ================================================================================================================
section('§G.1/§G.2 — initial mount issues exactly ONE canonical read');
// ================================================================================================================
var checks = [];
function run(p) { return Promise.resolve(p); }

var f1 = makeFetch(successEnv(SKU_ACTION));
checks.push(api(f1).getWorkspace('skuDetails', {}).then(function (env) {
  eq(f1._calls.length, 1, 'G1 SKU Details initial mount → exactly ONE request');
  eq(f1._calls[0].init.method, 'POST', 'G1 sent as POST');
  var body = JSON.parse(f1._calls[0].init.body);
  eq(body.action, SKU_ACTION, 'G1 with the canonical action in the BODY');
  ok(/[?&]action=skuDetails\.workspace\.get(&|$)/.test(f1._calls[0].url), 'G1 and in the URL, where a redirect cannot drop it');
  ok(f1._calls[0].url.indexOf(URL_OK) === 0, 'G1 to the canonical /exec endpoint');
  eq(env.success, true, 'G1 and a valid success envelope renders normally');
  ok(!!env.meta.requestId, 'G1 carrying a request id');
}));

var f2 = makeFetch(successEnv(SKU_ACTION));
checks.push(api(f2).getWorkspace('skuDetails', { include: { regional: true } }).then(function (env) {
  eq(f2._calls.length, 1, 'G2 SKU Regional initial mount → exactly ONE request');
  var body = JSON.parse(f2._calls[0].init.body);
  eq(body.action, SKU_ACTION, 'G2 same canonical action authority as SKU Details');
  eq(body.payload.include.regional, true, 'G2 with the page include carried in the PAYLOAD, not as transport metadata');
  eq(env.success, true, 'G2 success');
}));

// ================================================================================================================
section('§G.3-§G.5 — navigation races and concurrent loaders');
// ================================================================================================================
var f3 = makeFetch(function (n) { return successEnv(SKU_ACTION, { n: n }); });
var c3 = api(f3);
checks.push(Promise.all([
  c3.getWorkspace('skuDetails', {}),                              // Details
  c3.getWorkspace('skuDetails', { include: { regional: true } })  // → Regional
]).then(function (r) {
  eq(f3._calls.length, 2, 'G3 rapid Details → Regional issues one request each, never a shared/merged one');
  eq(JSON.parse(f3._calls[0].init.body).payload.include.regional, undefined, 'G3 the first request has no regional include');
  eq(JSON.parse(f3._calls[1].init.body).payload.include.regional, true, 'G3 and the second does — payloads did not cross-contaminate');
  ok(r[0].meta.requestId !== r[1].meta.requestId, 'G3 with distinct request ids');
}));

var f4 = makeFetch(function (n) { return successEnv(SKU_ACTION, { n: n }); });
var c4 = api(f4);
checks.push(Promise.all([
  c4.getWorkspace('skuDetails', { include: { regional: true } }),
  c4.getWorkspace('skuDetails', {})
]).then(function () {
  eq(f4._calls.length, 2, 'G4 rapid Regional → Details likewise');
  eq(JSON.parse(f4._calls[0].init.body).payload.include.regional, true, 'G4 first carries regional');
  eq(JSON.parse(f4._calls[1].init.body).payload.include.regional, undefined, 'G4 second does not');
}));

// §G.5/§C.6 — shared mutable options cannot be overwritten by a concurrent mount. The include object is REUSED
// by both callers and MUTATED after the first call, which is exactly the hypothesis: a frozen payload makes it inert.
var sharedInclude = { regional: true };
var f5 = makeFetch(function (n) { return successEnv(SKU_ACTION, { n: n }); });
var c5 = api(f5);
var p5a = c5.getWorkspace('skuDetails', { include: sharedInclude });
sharedInclude.regional = false; sharedInclude.injected = 'mutated-after-construction';
var p5b = c5.getWorkspace('skuDetails', { include: sharedInclude });
checks.push(Promise.all([p5a, p5b]).then(function () {
  eq(f5._calls.length, 2, 'G5 both concurrent loaders issued their own request');
  var b0 = JSON.parse(f5._calls[0].init.body);
  eq(b0.payload.include.regional, true, 'G5 the FIRST request kept regional:true — a later mutation of the caller’s object did not reach it');
  eq(b0.payload.include.injected, undefined, 'G5 and no field injected after construction appeared in it');
  eq(b0.action, SKU_ACTION, 'G5 with the action intact');
}));

// ================================================================================================================
section('§G.6-§G.8 — construction safety: the action cannot go missing');
// ================================================================================================================
// §C.1/§G.6 — a page that fires before the API module exists. Both loaders check and refuse, without a network call.
ok(/if \(!\(window\.KM && window\.KM\.api && typeof window\.KM\.api\.getWorkspace === 'function'\)\)/.test(SRDC),
  'G6 SKU Regional refuses if the API module is not initialized');
ok(/code: 'WORKSPACE_UNAVAILABLE'/.test(SRDC), 'G6 with a named code, not a crash');
ok(/if \(!\(window\.KM && window\.KM\.api && typeof window\.KM\.api\.getWorkspace === 'function'\)\)/.test(SKDC),
  'G6 SKU Details refuses likewise');
ok(/code: 'WORKSPACE_UNAVAILABLE'/.test(SKDC), 'G6 with a named code');

// §G.7 — a blank action throws BEFORE any fetch. Executed against the exported builder.
var fBlank = makeFetch(successEnv(SKU_ACTION));
var cBlank = client(fBlank);
var builder = cBlank.buildRequestEnvelope;
ok(typeof builder === 'function', 'G7 the canonical request-envelope builder is exported');
[undefined, null, '', '   '].forEach(function (bad, i) {
  var threw = null;
  try { builder(bad, { include: {} }); } catch (e) { threw = e; }
  ok(!!threw, 'G7 a blank action (' + JSON.stringify(bad) + ') THROWS');
  eq(threw && threw.apiCode, 'CLIENT_ACTION_REQUIRED', 'G7 as CLIENT_ACTION_REQUIRED');
  eq(threw && threw.details && threw.details.retryable, false, 'G7 not automatically retryable');
  eq(threw && threw.details && threw.details.zero_write, true, 'G7 and zero-write');
});
eq(fBlank._calls.length, 0, 'G7 and NO network call was made for any of them');

// §G.8 — an options merge cannot remove the action.
var env8 = builder(SKU_ACTION, { include: { regional: true } });
eq(env8.action, SKU_ACTION, 'G8 the envelope carries the action');
try { delete env8.action; } catch (e) {}
eq(env8.action, SKU_ACTION, 'G8 delete cannot remove it (frozen)');
try { Object.assign(env8, { action: undefined }); } catch (e) {}
eq(env8.action, SKU_ACTION, 'G8 nor can an Object.assign merge overwrite it');
try { env8.payload.include.regional = false; } catch (e) {}
eq(env8.payload.include.regional, true, 'G8 and the payload is frozen too (deep)');
ok(Object.isFrozen(env8) && Object.isFrozen(env8.payload) && Object.isFrozen(env8.payload.include),
  'G8 frozen at every level, so nothing downstream can malform an in-flight request');
// the transport choke point refuses a hand-built envelope with no action, before fetch
var fChoke = makeFetch(successEnv(SKU_ACTION));
var cChoke = client(fChoke);
var asserter = cChoke.assertSendableEnvelope;
var chokeThrew = null;
try { asserter({ apiVersion: '1', payload: {} }, 'test'); } catch (e) { chokeThrew = e; }
eq(chokeThrew && chokeThrew.apiCode, 'CLIENT_ACTION_REQUIRED', 'G8 the transport choke point refuses an actionless envelope');
eq(fChoke._calls.length, 0, 'G8 with no network call');

// ================================================================================================================
section('§G.9/§G.10 — the live failure, classified');
// ================================================================================================================
// §G.10 — THE EXACT LIVE RESPONSE. This is the assertion that pins the reported defect.
var f10 = makeFetch(routerUnknownActionEnv(DOGET_TERMINAL));
checks.push(api(f10).getWorkspace('skuDetails', { include: { regional: true } }).then(function (env) {
  eq(env.success, false, 'G10 the live doGet answer is a failure');
  var e0 = env.errors[0];
  eq(e0.code, 'REQUEST_METHOD_DOWNGRADED',
    'G10 classified as a METHOD DOWNGRADE — NOT the BACKEND_ERROR the operator saw');
  eq(e0.details.received_by, 'doGet', 'G10 naming who answered');
  eq(e0.details.action, SKU_ACTION, 'G10 and which action was lost');
  ok(!!e0.details.request_id, 'G10 with the request id for correlation');
  eq(e0.details.zero_write, true, 'G10 proven zero-write');
  eq(e0.details.retryable, true, 'G10 retryable — the deployment is fine, the body was dropped');
  eq(e0.details.router_message, DOGET_TERMINAL, 'G10 keeping the router text verbatim for diagnosis');
  ok(e0.code !== 'BACKEND_ERROR', 'G10 and it is emphatically not BACKEND_ERROR any more');
}));

// §G.9 — an OLD backend that does not know the action at all.
var f9 = makeFetch(routerUnknownActionEnv('Invalid POST action. Supported: getOperationDb, getTable'));
checks.push(api(f9).getWorkspace('skuDetails', {}).then(function (env) {
  var e0 = env.errors[0];
  eq(e0.code, 'DEPLOYMENT_CONTRACT_MISMATCH', 'G9 an old backend contract → DEPLOYMENT_CONTRACT_MISMATCH');
  eq(e0.details.missing_action, SKU_ACTION, 'G9 naming the required action');
  eq(e0.details.retryable, false, 'G9 NOT retryable — retrying cannot publish a deployment');
  ok(/publish/i.test(e0.details.next_action) && /reload/i.test(e0.details.next_action), 'G9 with a publish + reload next action');
}));
// a response that answers a DIFFERENT action is refused rather than adopted
var fMis = makeFetch(successEnv('inventoryReplenishment.workspace.get'));
checks.push(api(fMis).getWorkspace('skuDetails', {}).then(function (env) {
  eq(env.success, false, 'G9 a response echoing a different action is NOT accepted as data');
  eq(env.errors[0].code, 'RESPONSE_ACTION_MISMATCH', 'G9 it is RESPONSE_ACTION_MISMATCH');
  eq(env.errors[0].details.requested_action, SKU_ACTION, 'G9 naming what was asked');
  eq(env.errors[0].details.answered_action, 'inventoryReplenishment.workspace.get', 'G9 and what came back');
}));
// an older deployment that echoes NO action is tolerated (absence is not a mismatch)
var fNoEcho = makeFetch({ success: true, data: { skuDetails: [] }, meta: { apiVersion: '1' }, errors: [] });
checks.push(api(fNoEcho).getWorkspace('skuDetails', {}).then(function (env) {
  eq(env.success, true, 'G9 a deployment that echoes no action still succeeds — absence is not a mismatch');
  eq(env.meta.serverAction, null, 'G9 and the absence is reported rather than assumed');
}));

// ================================================================================================================
section('§G.11-§G.13 — retry, stale responses and cache');
// ================================================================================================================
// §G.11 — retry produces exactly one new request.
var f11 = makeFetch(function (n) { return n === 1 ? routerUnknownActionEnv(DOGET_TERMINAL) : successEnv(SKU_ACTION); });
var c11 = api(f11);
checks.push(c11.getWorkspace('skuDetails', {}).then(function (first) {
  eq(f11._calls.length, 1, 'G11 the failing read was one request');
  eq(first.errors[0].code, 'REQUEST_METHOD_DOWNGRADED', 'G11 classified');
  return c11.getWorkspace('skuDetails', {});
}).then(function (second) {
  eq(f11._calls.length, 2, 'G11 the retry added exactly ONE more request');
  eq(second.success, true, 'G11 and succeeded');
}));

// §G.12 — an aborted request cannot repaint. The abort is not misclassified as a backend failure.
var f12 = makeFetch(successEnv(SKU_ACTION));
var ac = { aborted: true };
checks.push(Promise.resolve(api(f12).getWorkspace('skuDetails', {}, { signal: ac })).then(function (env) {
  eq(f12._calls.length, 0, 'G12 an already-aborted read issues NO request');
  ok(env && env.success === false, 'G12 and resolves as a failure envelope');
  ok(env.errors[0].code === 'ABORTED' || /abort/i.test(env.errors[0].code + env.errors[0].message),
    'G12 classified as an ABORT — never as a backend/deployment failure (got ' + env.errors[0].code + ')');
}, function (err) {
  eq(f12._calls.length, 0, 'G12 an already-aborted read issues NO request');
  eq(err && err.apiCode, 'ABORTED', 'G12 rejected as ABORTED, not as a backend failure');
}));
// the page's own sequence guard drops a stale response instead of repainting
ok(/if \(mySeq !== _srdReadSeq\) return _srdReadModel;/.test(SRDC), 'G12 SKU Regional drops a superseded response');
ok(/if \(mySeq !== _skReadSeq\) return \{ __superseded: true, model: _skReadModel \};/.test(SKDC),
  'G12 SKU Details drops a superseded response — FB-4D: announced, not returned as a null model');
ok(/if \(res && res\.__superseded\) return;/.test(SKDC),
  'G12b and the caller stands down instead of rendering from it');
ok(/if \(seq !== _srdReqSeq\) return;/.test(SRDC), 'G12 and its loader guards the render callback by sequence too');

// §G.13/§C.12/§C.13 — a failed read can never become READY from cache, and there is no fallback path.
ok(/_srdReadModel = null;/.test(SRDC), 'G13 a failed regional read NULLS the read model (no stale content survives)');
ok(/_skReadModel = null;/.test(SKDC), 'G13 a failed SKU Details read likewise');
var srdErr = SRDC.slice(SRDC.indexOf('function _srdRenderError_'), SRDC.indexOf('var SRD_READ_ACTION'));
ok(srdErr.indexOf('render()') === -1, 'G13 the regional error path never calls render() (whose accessors would read the broad cache)');
ok(srdErr.indexOf('_opDbCache') === -1, 'G13 and never touches the broad cache');
ok(srdErr.indexOf('loadOperationDb') === -1, 'G13 nor the whole-DB loader');
var skErr = SKDC.slice(SKDC.indexOf('function _skRenderError_'), SKDC.indexOf('function renderSkuDetailsTable'));
ok(skErr.indexOf('_opDbCache') === -1 && skErr.indexOf('loadOperationDb') === -1,
  'G13 the SKU Details error path has no cache or whole-DB fallback either');
// the scoped refresh itself fails closed — it throws rather than returning legacy data
ok(/throw \(env && env\.errors && env\.errors\[0\]\)/.test(SRDC), 'G13 the regional scoped read THROWS on failure');
ok(/throw \(env && env\.errors && env\.errors\[0\]\)/.test(SKDC), 'G13 as does the SKU Details scoped read');
// no demo/local fallback
['DEMO_', 'demoData', 'localStorage.getItem(\'sku', 'sampleSku'].forEach(function (bad) {
  ok(srdErr.indexOf(bad) === -1 && skErr.indexOf(bad) === -1, 'G13 no local/demo fallback on the error path: ' + bad);
});

// ================================================================================================================
section('§F — the six page states, and ERROR is not EMPTY');
// ================================================================================================================
['PRE_LOAD', 'INITIAL_LOADING', 'READY', 'EMPTY', 'ERROR', 'DEPLOYMENT_MISMATCH'].forEach(function (st) {
  ok(loadState.STATES[st] === st, 'F1 the state contract includes ' + st);
});
eq(loadState.LOADING_STATES, ['INITIAL_LOADING', 'REFRESHING'], 'F1 with two LOADING flavours');
ok(loadState.isLoadingState('INITIAL_LOADING') && loadState.isLoadingState('REFRESHING'), 'F1 both recognised as loading');
ok(loadState.isFailureState('ERROR') && loadState.isFailureState('DEPLOYMENT_MISMATCH'), 'F2 both failure states are failures');
ok(!loadState.isDataState('ERROR') && !loadState.isDataState('DEPLOYMENT_MISMATCH'), 'F2 ERROR is NOT a data state — and it is not EMPTY');
ok(loadState.isDataState('EMPTY'), 'F2 while EMPTY is a legitimate data answer');
ok(loadState.isRetryableState('ERROR'), 'F3 an ERROR may be retried');
ok(!loadState.isRetryableState('DEPLOYMENT_MISMATCH'), 'F3 a DEPLOYMENT_MISMATCH may NOT — it needs a publish');
eq(loadState.canTransition('DEPLOYMENT_MISMATCH', 'EMPTY'), false,
  'F4 a mismatch can never drift into EMPTY (that would present a publish problem as "no data")');
eq(loadState.canTransition('PRE_LOAD', 'INITIAL_LOADING'), true, 'F4 PRE_LOAD → LOADING is the normal entry');
eq(loadState.canTransition('ERROR', 'READY'), true, 'F4 and a successful retry recovers from ERROR');
// the pages actually use the new state
ok(/STATES\.DEPLOYMENT_MISMATCH/.test(SRDC), 'F5 SKU Regional sets DEPLOYMENT_MISMATCH');
ok(/STATES\.DEPLOYMENT_MISMATCH/.test(SKDC), 'F5 SKU Details sets DEPLOYMENT_MISMATCH');
// the banner names action, code and request id — and offers no retry for a mismatch
ok(/var SRD_NO_RETRY_CODES = \{ DEPLOYMENT_CONTRACT_MISMATCH: 1, CLIENT_ACTION_REQUIRED: 1 \};/.test(SRDC),
  'F6 the regional page knows which codes a retry cannot fix');
ok(/'action ' \+ esc\(action\) \+ ' · ' \+ esc\(code\)/.test(SRDC), 'F6 and its banner names the action and the code');
ok(/request ' \+ esc\(reqId\)/.test(SRDC), 'F6 plus the request id');
ok(/Retrying cannot fix this\./.test(SRDC), 'F6 saying so instead of offering a useless Retry');
ok(/var SK_NO_RETRY_CODES = \{ DEPLOYMENT_CONTRACT_MISMATCH: 1, CLIENT_ACTION_REQUIRED: 1 \};/.test(SKDC),
  'F6 the SKU Details page likewise');
ok(/code ' \+ _skEsc_\(code\)/.test(SKDC), 'F6 with the code in its banner');
ok(/action ' \+ _skEsc_\(action\)/.test(SKDC), 'F6 and the action');
ok(/'SKU Details read error'/.test(SKDC) || /SKU Details read error/.test(SKDC), 'F6 under a named label');
ok(/request ' \+ _skEsc_\(reqId\)/.test(SKDC), 'F6 plus the request id');
ok(/overflow-wrap:break-word/.test(SKDC),
  'F6 FB-4D: in a WRAPPING full-width host — the old banner was clipped by the frozen column it lived in');
ok(/SKU_DETAILS_RENDER_MODEL_FAILED/.test(SKDC),
  'F6 FB-4D: and a render-model failure is classified separately from a read failure');
// no sensitive data in the banner
[ 'spreadsheetId', 'AKfycb', 'getApiBaseUrl()', 'token' ].forEach(function (bad) {
  ok(srdErr.indexOf(bad) === -1 && skErr.indexOf(bad) === -1, 'F7 the banner exposes no sensitive value: ' + bad);
});

// ================================================================================================================
section('§D — the deployment contract is caller-driven and covers these pages');
// ================================================================================================================
ok(/'skuDetails\.workspace\.get'/.test(DBAPIC.slice(DBAPIC.indexOf('KM_REQUIRED_DEPLOYED_ACTIONS_'), DBAPIC.indexOf('KM_PAGE_REQUIRED_ACTIONS_'))),
  'D1 the SKU read action is now in the caller-driven probe list');
ok(/'skdWorkspaceBuild_'/.test(DBAPIC) && /'skdBuildEnvelope_'/.test(DBAPIC),
  'D2 with the 59_ OWNER SYMBOLS, which is what catches a file-by-file sync that still resolves the action');
ok(/KM_PAGE_REQUIRED_ACTIONS_ = \{/.test(DBAPIC) && /'sku-details':/.test(DBAPIC) && /'sku-regional-details':/.test(DBAPIC),
  'D3 and a per-page required-action map so a mismatch can name the page');
ok(/checkPageDeploymentContract = async function \(pageKey\)/.test(DBAPIC), 'D4 a page-scoped verdict exists');
var pageFn = DBAPIC.slice(DBAPIC.indexOf('checkPageDeploymentContract'), DBAPIC.indexOf('getPageRequiredActions'));
['required_actions', 'missing', 'frontend_build', 'backend_build', 'contract_version', 'request_id', 'next_action'].forEach(function (k) {
  ok(pageFn.indexOf(k) !== -1, 'D5 the mismatch verdict reports ' + k);
});
eq(/retryable: false/.test(pageFn), true, 'D6 and is explicitly NOT auto-retryable');
ok(/DEPLOYMENT_CONTRACT_MISMATCH/.test(pageFn), 'D6 with the required code');
// the probe is not self-authored: the answer is computed against OUR list
ok(/probe_actions: KM_REQUIRED_DEPLOYED_ACTIONS_, probe_symbols: KM_REQUIRED_DEPLOYED_SYMBOLS_/.test(DBAPIC),
  'D7 the probe sends OUR list — the verdict is not the backend’s self-authored missing_actions');
ok(/An empty missing_actions is therefore NOT evidence/.test(read('assets/specs/active/apps-script/63_api_v1_system_health.gs')),
  'D7 and the backend records why its own empty list proves nothing');

// ================================================================================================================
section('§B/§E — the router names a downgraded POST, and the two unknown-action authorities cannot drift');
// ================================================================================================================
ok(/code: 'POST_ONLY_ACTION_ON_GET'/.test(RTRC), 'E1 doGet names a POST-only action arriving as a GET');
ok(/received_method: 'GET'/.test(RTRC), 'E1 stating the method it actually received');
ok(/attempted_action: attempted \|\| null/.test(RTRC), 'E1 and the action it was asked for');
ok(/sent_as_post: viaPost/.test(RTRC), 'E1 plus whether the client marked it POST-originated');
ok(/zero_write: true/.test(RTRC), 'E1 with a zero-write assurance');
// the ORIGINAL message text is preserved on both branches — existing suites and the client classifier key on it
eq((RTR.match(/Missing or invalid action parameter\. Use: getOperationDb, getTable, system\.health or inventoryScope\.registry\.get/g) || []).length, 2,
  'E2 both doGet answers keep the original message text verbatim, so no existing classifier breaks');
// the duplicated pattern list must stay byte-identical to the db-api authority
var fndPatterns = (FND.match(/var UNKNOWN_ACTION_PATTERNS = \[([\s\S]*?)\];/) || [])[1] || '';
var dbPatterns = (DBAPI.match(/var KM_UNKNOWN_ACTION_PATTERNS_ = \[([\s\S]*?)\];/) || [])[1] || '';
function normPat(s) { return s.replace(/\s+/g, '').replace(/\/\/[^\n]*/g, ''); }
ok(fndPatterns && dbPatterns, 'E3 both unknown-action pattern lists were found');
eq(normPat(fndPatterns), normPat(dbPatterns),
  'E3 and they are byte-identical — the deliberate duplication cannot drift into two different opinions');

// ================================================================================================================
section('§G.15 — no business writer is called by any read path');
// ================================================================================================================
var FORBIDDEN_WRITERS = ['upsertSkuDetail', 'upsertSkuRegionalDetail', 'upsertShippingAllocationDraft',
  'updateSkuLifecycle', 'submitShippingAllocationDraft', 'requestOrder.send.orchestrate', 'shipment.eta.update'];
// Extract EXACTLY the read functions. An earlier version of this assertion sliced from the refresh function to
// srdRetry, which swallowed srdSaveEdit — the page’s legitimate WRITE handler — and failed for the right reason
// on the wrong text. The read path is these functions and nothing else.
function fnOf(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var srdRead = [fnOf(SRDC, '_srdWorkspaceRefresh_'), fnOf(SRDC, 'loadAndInit'), fnOf(SRDC, 'srdRetry')].join(' ;; ');
var skRead = [fnOf(SKDC, '_skWorkspaceRefresh_'), fnOf(SKDC, '_skLoadAndRender')].join(' ;; ');
// INVOCATION, not mention: sku-regional-details.js legitimately READS window.KM.DB.upsertSkuRegionalDetail as a
// capability check (to decide whether to show the Add button). Banning the identifier outright would fail on that
// and prove nothing; what matters is that the read path never CALLS a writer.
FORBIDDEN_WRITERS.forEach(function (w) {
  ok(srdRead.indexOf(w + '(') === -1, 'G15 the regional read path never calls ' + w);
  ok(skRead.indexOf(w + '(') === -1, 'G15 the SKU Details read path never calls ' + w);
});
ok(/READ-ONLY/.test(WS59) || /reads only/.test(WS59), 'G15 and the server owner declares itself read-only');
['appendRow', 'setValue', 'setValues', 'deleteRow'].forEach(function (w) {
  ok(WS59.indexOf(w) === -1, 'G15 59_ contains no write primitive: ' + w);
});

// ================================================================================================================
Promise.all(checks).then(function () {
  console.log('\n' + '-'.repeat(40));
  console.log('SKU READ-PATH RELIABILITY (F1-7N-FB-4C-R1): ' + pass + ' passed, ' + fail + ' failed');
  console.log('-'.repeat(40));
  if (fail) process.exit(1);
}, function (e) {
  console.error('HARNESS ERROR', e && e.stack || e);
  process.exit(1);
});
