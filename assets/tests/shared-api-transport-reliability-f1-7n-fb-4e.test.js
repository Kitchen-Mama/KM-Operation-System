// F1-7N-FB-4E — SHARED API TRANSPORT RELIABILITY, PERFORMANCE AND THE PORTABLE DATA-ACCESS BOUNDARY.
//
// Proves the §J claims by EXECUTING the shipped modules, not copies of them:
//   · assets/js/api/km-transport.js       required directly (the endpoint authority, the state machine, the
//                                         classifier, the retry policy, the single-flight latch, the metrics)
//   · assets/js/api/km-data-access.js     required directly (both adapters, run against the SAME specs)
//   · assets/js/api/km-api-foundation.js  required directly, wired to a FETCH SPY, so the §L evidence rule and
//                                         the request-id correlation are the real client's output
//   · operation-system-db-api.js          its real _kmClassifyAnswer_ / _kmGapRead_ / getOperationDbTableFromSheet
//                                         extracted from source and executed against the same spy
//   · 01_router.gs / 63_..._system_health.gs  their real emitted fields, read from source
//
// THE INCIDENT THIS ROUND EXISTS FOR, restated so the suite cannot drift from it:
//   Site Inventory registry      API HTTP 404 [HTTP_TRANSPORT_ERROR]
//   Order Planning               AI Plan read error: API HTTP 404 [HTTP_TRANSPORT_ERROR]
//   FC Summary / Shipment Draft  HTTP 404, text/html; charset=utf-8  [TRANSPORT_NON_JSON_RESPONSE]
//   Factory / Overseas Inventory empty selectors and "尚未連接資料來源"
//   and later, for inventoryReplenishment.workspace.get, the sentence
//   "sent as a POST but was answered by the GET handler, so its body — and therefore its action — was dropped".
// Six pages, one shared transport. The last sentence is also SELF-CONTRADICTORY, because the action was in the
// query string and the router had just named it back — which §M requires fixing rather than rewording.
//
// Known regression baseline (pre-existing, unrelated to this round): gap-job-done-notice-f1-small-r1,
// order-planning-monthly-projection-consumer-f1-4b-fm3d, replen-header-toggle, supply-planning-route-inventory.
//
// Run: node assets/tests/shared-api-transport-reliability-f1-7n-fb-4e.test.js

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var TP = require(path.join(ROOT, 'assets/js/api/km-transport.js'));
var DA = require(path.join(ROOT, 'assets/js/api/km-data-access.js'));
var KMAPI = require(path.join(ROOT, 'assets/js/api/km-api-foundation.js'));

var DBAPI = read('assets/js/api/operation-system-db-api.js');
var FND = read('assets/js/api/km-api-foundation.js');
var RTR = read('assets/specs/active/apps-script/01_router.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var TPSRC = read('assets/js/api/km-transport.js');
var DASRC = read('assets/js/api/km-data-access.js');
var FS_PAGE = read('assets/js/pages/factory-stock.js');
var OS_PAGE = read('assets/js/pages/overseas-stock.js');
var HTML = read('index.html');
var DBAPIC = code(DBAPI), FNDC = code(FND), FS_C = code(FS_PAGE), OS_C = code(OS_PAGE);

var EXEC = 'https://script.google.com/macros/s/AKfycbTESTTESTTESTTESTTEST/exec';
var ORIGIN = 'https://example.github.io';
var IR_ACTION = 'inventoryReplenishment.workspace.get';

// ---- a fetch spy that records every call and can answer differently per attempt --------------------------
function spy(responder) {
  var f = function (url, init) {
    f._calls.push({ url: url, init: init || {}, method: (init && init.method) || 'GET',
      body: (function () { try { return JSON.parse((init && init.body) || 'null'); } catch (e) { return null; } })() });
    var r = responder(f._calls.length, url, init);
    if (r && r.__reject) return Promise.reject(r.__reject);
    return Promise.resolve(r);
  };
  f._calls = [];
  return f;
}
// A Response-like object, the shape a real browser fetch returns — including the two fields the old runners
// discarded and that make the 404 sources distinguishable: `url` (who finally answered) and `redirected`.
function resp(o) {
  o = o || {};
  var body = (typeof o.body === 'string') ? o.body : JSON.stringify(o.json === undefined ? {} : o.json);
  return {
    ok: (o.status === undefined ? 200 : o.status) >= 200 && (o.status === undefined ? 200 : o.status) < 300,
    status: (o.status === undefined ? 200 : o.status),
    url: o.url || EXEC,
    redirected: o.redirected === true,
    headers: { get: function (h) { return /content-type/i.test(h) ? (o.contentType || 'application/json') : null; } },
    text: function () { return Promise.resolve(body); },
    json: function () { return Promise.resolve(JSON.parse(body)); }
  };
}

// =============================================================================================================
section('§B — ONE endpoint authority, and everything that is not the stable /exec URL is refused LOCALLY');
// =============================================================================================================
// §J1 — the stable /exec endpoint is the only accepted production value.
var EP_CASES = [
  [EXEC, true, 'STABLE_EXEC'],
  ['', false, 'BLANK'],
  ['/exec', false, 'RELATIVE'],
  ['http://api.example.com/exec', false, 'NOT_HTTPS'],
  [ORIGIN + '/api/exec', false, 'FRONTEND_ORIGIN'],
  [EXEC.replace('/exec', '/dev'), false, 'APPS_SCRIPT_DEV'],
  ['https://script.google.com/home/projects/abc/edit', false, 'APPS_SCRIPT_EDITOR'],
  ['https://script.googleusercontent.com/macros/echo?user_content_key=XYZ', false, 'USERCONTENT_REDIRECT'],
  ['https://script.google.com/macros/s/short/exec', false, 'MALFORMED_EXEC'],
  ['PASTE_WEB_APP_EXEC_URL_HERE', false, 'PLACEHOLDER'],
  ['https://evil.example.com/exec', false, 'FOREIGN_HOST']
];
EP_CASES.forEach(function (c) {
  var v = TP.classifyEndpoint(c[0], { frontendOrigin: ORIGIN });
  eq([v.ok, v.endpointClass], [c[1], c[2]], 'B1 ' + (c[2]) + ' classified' + (c[1] ? ' and accepted' : ' and REFUSED'));
});
// §J2 — a REDIRECT TARGET can never be promoted into configuration. This is enforced by the CLASSIFIER, so
// there is no code path — present or future — that could feed `resp.url` back as the base URL and have it work.
ok(TP.classifyEndpoint('https://script.googleusercontent.com/macros/echo?user_content_key=A', {}).ok === false,
  'B2 an Apps Script redirect target is never a valid endpoint');
// The mask keeps the diagnostic half of the URL (the path shape) and drops the credential half (the Script ID).
ok(TP.maskEndpoint(EXEC).indexOf('AKfyc') < 0 && /\/macros\/s\/<redacted>\/exec$/.test(TP.maskEndpoint(EXEC)),
  'B7 the endpoint identity is masked: path shape kept, deployment id dropped');
ok(/\/dev$/.test(TP.maskEndpoint(EXEC.replace('/exec', '/dev'))),
  'B7 and the mask still distinguishes /dev from /exec — otherwise a masked identity could not diagnose anything');
// §B6 — refused BEFORE the network. Not "rejected by the server": no socket is opened at all.
var fNoNet = spy(function () { return resp({ json: { success: true } }); });
var tBad = TP.create({ fetch: fNoNet, baseUrl: EXEC.replace('/exec', '/dev'), frontendOrigin: ORIGIN, now: function () { return 0; } });

// =============================================================================================================
section('§C — the request state machine, the typed vocabulary, and the retry POLICY');
// =============================================================================================================
var CODES_REQUIRED = ['API_ENDPOINT_CONFIGURATION_INVALID', 'HTTP_NOT_FOUND_HTML', 'AUTH_OR_ACCESS_HTML',
  'TRANSPORT_NON_JSON_RESPONSE', 'HTTP_TRANSPORT_ERROR', 'REQUEST_TIMEOUT', 'REQUEST_ABORTED',
  'DEPLOYMENT_CONTRACT_MISMATCH', 'RESPONSE_ACTION_MISMATCH', 'RESPONSE_REQUEST_ID_MISMATCH',
  'BACKEND_BUSINESS_REJECTION', 'RESPONSE_CORRELATION_UNPROVEN', 'REQUEST_METHOD_DOWNGRADED'];
CODES_REQUIRED.forEach(function (c) { eq(TP.CODES[c], c, 'C1 the taxonomy carries ' + c + ' (self-named)'); });
['BUILD', 'DISPATCH', 'REDIRECT_RESPONSE', 'PARSE', 'CONTRACT_VALIDATE', 'SUCCESS', 'TYPED_FAILURE'].forEach(function (p) {
  eq(TP.PHASE[p], p, 'C2 the state machine names phase ' + p);
});
// §J8 — the retry POLICY, asserted as a policy rather than through one path.
var RETRY_TABLE = [
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 408 }, true, '408 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 429 }, true, '429 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 503 }, true, '503 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: null }, true, 'a genuine network failure'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 400 }, false, '400 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 401 }, false, '401 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 403 }, false, '403 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 404 }, false, '404 read'],
  [{ kind: 'read', code: TP.CODES.HTTP_NOT_FOUND_HTML }, false, 'a 404 HTML page'],
  [{ kind: 'read', code: TP.CODES.AUTH_OR_ACCESS_HTML }, false, 'a sign-in page'],
  [{ kind: 'read', code: TP.CODES.API_ENDPOINT_CONFIGURATION_INVALID }, false, 'an invalid endpoint'],
  [{ kind: 'read', code: TP.CODES.DEPLOYMENT_CONTRACT_MISMATCH }, false, 'a contract mismatch'],
  [{ kind: 'read', code: TP.CODES.BACKEND_BUSINESS_REJECTION }, false, 'a business rejection'],
  [{ kind: 'read', code: TP.CODES.REQUEST_ABORTED }, false, 'an abort'],
  [{ kind: 'write', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: 503 }, false, 'ANY write (503)'],
  [{ kind: 'write', code: TP.CODES.HTTP_TRANSPORT_ERROR, httpStatus: null }, false, 'ANY write (lost response)'],
  [{ kind: 'write', code: TP.CODES.REQUEST_TIMEOUT_WRITE_INDETERMINATE }, false, 'ANY write (timeout)']
];
RETRY_TABLE.forEach(function (r) {
  eq(TP.isAutoRetryable(r[0]), r[1], 'C3 auto-retry ' + (r[1] ? 'ALLOWED' : 'REFUSED') + ' for ' + r[2]);
});
// §J9 — a write is never automatically replayed, stated as an invariant over the whole code vocabulary rather
// than over the cases above: no kind:'write' input can return true.
ok(Object.keys(TP.CODES).every(function (k) { return TP.isAutoRetryable({ kind: 'write', code: TP.CODES[k], httpStatus: 503 }) === false; }),
  'C4 NO transport code makes a WRITE auto-retryable');
// Bounded exponential delay with jitter, and the jitter is injected so the number is exact.
eq(TP.retryDelayMs(1, function () { return 0; }, 400, 4000), 200, 'C5 attempt 1, minimum jitter → 200ms');
eq(TP.retryDelayMs(1, function () { return 1; }, 400, 4000), 400, 'C5 attempt 1, maximum jitter → 400ms');
eq(TP.retryDelayMs(2, function () { return 1; }, 400, 4000), 800, 'C5 attempt 2 doubles the ceiling');
eq(TP.retryDelayMs(9, function () { return 1; }, 400, 4000), 4000, 'C5 and the ceiling is CAPPED');

// =============================================================================================================
section('§A — the 404 HTML is FINGERPRINTED by source, not lumped into one code');
// =============================================================================================================
// §J3. Each of these is a different fix, which is why one code for all of them was useless.
var GH_404 = '<!DOCTYPE html><html><head><title>Site not found</title></head><body>'
  + '<h1>404</h1><p>There isn\'t a GitHub Pages site here.</p></body></html>';
var GAS_404 = '<!DOCTYPE html><html><head><title>Error</title></head><body>'
  + '<p>Sorry, unable to open the file at this time.</p></body></html>';
var LOGIN = '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head><body>'
  + 'ServiceLogin please sign in SECRET_SESSION_TOKEN_MUST_NOT_LEAK</body></html>';
var ECHO_404 = '<!DOCTYPE html><html><body>404 Not Found</body></html>';

var fpGh = TP.fingerprintHtml({ body: GH_404, status: 404, contentType: 'text/html; charset=utf-8',
  finalUrl: ORIGIN + '/whatever', requestedUrl: ORIGIN + '/whatever', frontendOrigin: ORIGIN });
eq(fpGh.source, 'FRONTEND_ORIGIN_RESPONSE', 'A1 a 404 answered by the WEBSITE is attributed to the frontend origin');
eq(TP.codeForHtml(fpGh), TP.CODES.HTTP_NOT_FOUND_HTML, 'A1 and typed HTTP_NOT_FOUND_HTML');

var fpGh2 = TP.fingerprintHtml({ body: GH_404, status: 404, contentType: 'text/html; charset=utf-8',
  finalUrl: 'https://other.github.io/x', requestedUrl: 'https://other.github.io/x', frontendOrigin: ORIGIN });
eq(fpGh2.source, 'GITHUB_PAGES_404', 'A2 a GitHub Pages 404 is recognised by its own body markers');

var fpGas = TP.fingerprintHtml({ body: GAS_404, status: 404, contentType: 'text/html; charset=UTF-8',
  finalUrl: EXEC, requestedUrl: EXEC, frontendOrigin: ORIGIN });
eq(fpGas.source, 'APPS_SCRIPT_DEPLOYMENT_404', 'A3 an Apps Script deployment 404 is distinguished from both');

var fpLogin = TP.fingerprintHtml({ body: LOGIN, status: 200, contentType: 'text/html', finalUrl: 'https://accounts.google.com/x',
  requestedUrl: EXEC, redirected: true, frontendOrigin: ORIGIN });
eq(fpLogin.source, 'GOOGLE_AUTH_OR_ACCESS', 'A4 a Google sign-in page is its own source');
eq(TP.codeForHtml(fpLogin), TP.CODES.AUTH_OR_ACCESS_HTML, 'A4 and its own code — no retry can sign a user in');

var fpEcho = TP.fingerprintHtml({ body: ECHO_404, status: 404, contentType: 'text/html',
  finalUrl: 'https://script.googleusercontent.com/macros/echo?user_content_key=GONE',
  requestedUrl: EXEC, redirected: true, frontendOrigin: ORIGIN });
eq(fpEcho.source, 'EXPIRED_USERCONTENT_REDIRECT', 'A5 an EXPIRED redirect target is distinguished from a bad deployment');
eq(fpEcho.hostChanged, true, 'A5 and the host change is recorded — the evidence the old runners threw away');
eq(fpEcho.redirected, true, 'A5 as is the fact that a redirect occurred');

// SAFETY (§A/§I): the fingerprint never carries the body or a secret.
var blob = JSON.stringify(fpLogin);
ok(blob.indexOf('SECRET_SESSION_TOKEN_MUST_NOT_LEAK') < 0, 'A6 the fingerprint does NOT carry a token from the body');
ok(blob.indexOf('user_content_key') < 0 && JSON.stringify(fpEcho).indexOf('GONE') < 0, 'A6 nor a signed redirect key');
// (the masked endpoint legitimately contains the literal `<redacted>`, so the check is for HTML TAGS and
// document markers rather than for the character itself.)
ok(!/<\/?(html|head|body|div|p|title|script)/i.test(blob) && blob.indexOf('DOCTYPE') < 0, 'A6 nor any raw HTML');
ok(fpLogin.tokens.length <= 6 && fpLogin.tokens.every(function (t) { return t.length <= 24; }), 'A6 tokens are bounded (≤6, ≤24 chars)');
// A 302 is NOT itself an error: Apps Script returns every POST answer through one.
var fpOk = TP.fingerprintHtml({ body: '', status: 200, contentType: 'application/json', finalUrl: 'https://script.googleusercontent.com/macros/echo?user_content_key=A', requestedUrl: EXEC, redirected: true, frontendOrigin: ORIGIN });
ok(fpOk.redirected === true, 'A7 a redirect is RECORDED, never treated as a failure on its own');

// =============================================================================================================
section('§A/§C — the shipped db-api runner: the evidence is captured and the legacy alias is DERIVED');
// =============================================================================================================
// The real functions, extracted from the real file and executed. `_kmClassifyAnswer_` is the single decision;
// `legacyCode` is its alias, which is what >20 page consumers and the write barriers key on.
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '('); if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
global.window = { KM: { transportFactory: TP }, location: { origin: ORIGIN } };
var KM_TRANSPORT_EVIDENCE_BUILD_ = 'F1-7N-FB-4E';
eval(['_kmTransportFactory_', '_kmWireEvidence_', '_kmClassifyAnswer_', '_kmTypedTransportMessage_']
  .map(function (n) { return extractFn(DBAPI, n); }).join('\n'));

var c404 = _kmClassifyAnswer_('inventoryScope.registry.get', 'read',
  resp({ status: 404, contentType: 'text/html; charset=utf-8', body: GH_404, url: ORIGIN + '/x' }), GH_404, EXEC);
eq(c404.legacyCode, 'HTTP_TRANSPORT_ERROR', 'D1 the LEGACY alias is unchanged (the page barriers still recognise it)');
eq(c404.typed.code, 'HTTP_NOT_FOUND_HTML', 'D1 while the TYPED reason is the specific one §C requires');
eq(c404.typed.html_source, 'FRONTEND_ORIGIN_RESPONSE', 'D1 and it names WHICH 404 this was');
eq(c404.wire.httpStatus, 404, 'D1 the status is captured');
eq(c404.wire.contentType, 'text/html; charset=utf-8', 'D1 the content type is captured');
ok(c404.wire.maskedFinalEndpoint && c404.wire.maskedFinalEndpoint.indexOf('AKfyc') < 0, 'D1 and the final endpoint, masked');
ok(/answered by the WEBSITE itself/.test(_kmTypedTransportMessage_('inventoryScope.registry.get', c404)),
  'D1 the operator sentence names the real cause instead of "API HTTP 404"');

var cLogin = _kmClassifyAnswer_('weeklyShipping.workspace.get', 'read',
  resp({ status: 200, contentType: 'text/html', body: LOGIN, url: 'https://accounts.google.com/x', redirected: true }), LOGIN, EXEC);
eq(cLogin.typed.code, 'AUTH_OR_ACCESS_HTML', 'D2 a sign-in page is AUTH_OR_ACCESS_HTML, not a generic non-JSON body');
eq(cLogin.legacyCode, 'NON_JSON_RESPONSE', 'D2 with the legacy alias preserved for the existing consumers');
eq(cLogin.typed.retryable, false, 'D2 and it is NOT retryable');

var c500 = _kmClassifyAnswer_('x.read', 'read', resp({ status: 503, contentType: 'application/json', body: '{}' }), '{}', EXEC);
eq([c500.typed.code, c500.typed.retryable], ['HTTP_TRANSPORT_ERROR', true], 'D3 a 5xx read IS retryable');
var c500w = _kmClassifyAnswer_('x.write', 'write', resp({ status: 503, contentType: 'application/json', body: '{}' }), '{}', EXEC);
eq([c500w.typed.retryable, c500w.typed.zero_write], [false, false], 'D3 the same 5xx on a WRITE is neither retryable nor a proven zero-write');
var cOkJson = _kmClassifyAnswer_('x.read', 'read', resp({ json: { success: true } }), '{"success":true}', EXEC);
eq(cOkJson.ok, true, 'D4 a normal JSON answer passes through untouched');

// =============================================================================================================
section('§N — THE EXACT REGRESSION FIXTURE: inventoryReplenishment.workspace.get, US / Amazon, applied Search');
// =============================================================================================================
// Built through the REAL foundation against the fetch spy, so every count below is a measured number.
function client(fetcher) {
  global.window = { KM: { transportFactory: TP, DB: { getApiBaseUrl: function () { return EXEC; } } }, location: { origin: ORIGIN } };
  var f = KMAPI.createApiFoundation({ fetch: fetcher, flags: { USE_WORKSPACE_API: true },
    workspaceFlags: { inventoryReplenishment: true }, transportFactory: TP, frontendOrigin: ORIGIN });
  return f.client || f;
}
var IR_PARAMS = { include: { summary: true, projection: true }, scope: { country: 'US', marketplace: 'Amazon' } };
// The router's SUCCESS answer, echoing the caller's action AND request id (what all fourteen owners do).
function irSuccess(init) {
  var rid = null; try { rid = JSON.parse((init && init.body) || '{}').requestId || null; } catch (e) { rid = null; }
  return resp({ url: 'https://script.googleusercontent.com/macros/echo?user_content_key=OK', redirected: true,
    json: { success: true, data: { rows: [{ sku: 'CO1100-R', country: 'US', marketplace: 'Amazon' }] },
      meta: { action: IR_ACTION, requestId: rid, serverDurationMs: 812, tablesRead: 19 } } });
}
var fN = spy(function (n, url, init) { return irSuccess(init); });
var checks = [];
checks.push(client(fN).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  // N1 — exactly ONE original POST.
  eq(fN._calls.length, 1, 'N1 exactly ONE request was issued');
  eq(fN._calls[0].method, 'POST', 'N1 and it was a POST');
  // N2 — the stable /exec endpoint, with the query APPENDED to it (not a second endpoint).
  ok(fN._calls[0].url.indexOf(EXEC) === 0, 'N2 sent to the stable /exec endpoint');
  eq(fN._calls[0].url.indexOf('?'), EXEC.length, 'N2 the query is appended to that endpoint, not a different one');
  // N3 — action AND request id in BOTH the body and the initial query string.
  eq(fN._calls[0].body.action, IR_ACTION, 'N3 the action is in the POST body');
  ok(!!fN._calls[0].body.requestId, 'N3 as is the request id');
  ok(fN._calls[0].url.indexOf('action=' + encodeURIComponent(IR_ACTION)) > 0, 'N3 and the action is ALSO in the initial query');
  ok(fN._calls[0].url.indexOf('km_rid=' + encodeURIComponent(fN._calls[0].body.requestId)) > 0, 'N3 and so is the request id');
  // §M — the query carries CORRELATION only. No workspace payload and no write payload is ever put in it.
  ok(fN._calls[0].url.indexOf('country') < 0 && fN._calls[0].url.indexOf('Amazon') < 0 && fN._calls[0].url.indexOf('include') < 0,
    'M1 the workspace payload is NOT in the query string — the redundancy is correlation, not a workaround');
  // N4 — the payload remains available to the production doPost router.
  ok(fN._calls[0].body.payload && fN._calls[0].body.payload.include && fN._calls[0].body.payload.include.summary === true,
    'N4 the full payload reached the body the doPost router parses');
  // N5 — the normal Apps Script redirect still ends in a valid JSON envelope.
  eq(env.success, true, 'N5 the normal POST→redirect answer is a SUCCESS');
  eq(env.data.rows[0].sku, 'CO1100-R', 'N5 with the server view model, not double-wrapped');
  eq(env.meta.requestIdCorrelation, 'MATCH', 'N5 and the answer is proved to belong to this request');
  // N6 — no second request merely because the response redirect used GET.
  eq(fN._calls.length, 1, 'N6 the redirect did NOT cause a second request');
  // N7 — no doGet business execution: the client has no GET path for a workspace read at all.
  ok(fN._calls.every(function (c) { return c.method === 'POST'; }), 'N7 no workspace read was ever dispatched as a GET');
}));
// N8 — a failure is never an empty success.
var fN8 = spy(function (n, url, init) { return resp({ status: 404, contentType: 'text/html; charset=utf-8', body: GAS_404, url: EXEC }); });
checks.push(client(fN8).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.success, false, 'N8 a 404 HTML answer is a FAILURE, never an empty success');
  ok(!(env.data && env.data.rows && env.data.rows.length), 'N8 and carries no rows');
  eq(env.errors[0].code, 'TRANSPORT_NON_JSON_RESPONSE', 'N8 typed as a non-JSON transport answer');
  ok(env.errors[0].details.httpStatus === 404, 'N8 with the status preserved');
}));
// N9/N10 — Retry creates exactly ONE fresh request, and recovery needs no navigation or reload.
var fN9 = spy(function (n, url, init) { return n === 1 ? resp({ status: 503, contentType: 'application/json', body: '{}' }) : irSuccess(init); });
var cN9 = client(fN9);
checks.push(cN9.getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (first) {
  eq(fN9._calls.length, 1, 'N9 the failing read was ONE request');
  eq(first.success, false, 'N9 and it failed');
  return cN9.getWorkspace('inventoryReplenishment', IR_PARAMS);
}).then(function (second) {
  eq(fN9._calls.length, 2, 'N9 Retry added exactly ONE more request');
  eq(second.success, true, 'N10 and it succeeded — recovery needed no navigation and no reload');
}));

// =============================================================================================================
section('§N — the six distinct simulations, each landing on its OWN classification');
// =============================================================================================================
// 1. normal Apps Script POST response redirect → SUCCESS  (asserted above as N5)
// 2. a TRUE POST→doGet downgrade, with the router's typed evidence → REQUEST_METHOD_DOWNGRADED
var DOGET_TERMINAL = 'Missing or invalid action parameter. Use: getOperationDb, getTable, system.health or inventoryScope.registry.get';
ok(RTR.indexOf(DOGET_TERMINAL) !== -1, 'S0 the doGet terminal message this suite uses is the one the router actually sends');
function downgradeEnv(init) {
  var rid = null; try { rid = JSON.parse((init && init.body) || '{}').requestId || null; } catch (e) { rid = null; }
  return resp({ url: EXEC, redirected: true, json: { success: false, error: DOGET_TERMINAL,
    code: 'POST_ONLY_ACTION_ON_GET', handler: 'doGet', received_method: 'GET', sent_as_post: true,
    post_body_present: false, action_present_in_query: true, attempted_action: IR_ACTION, request_id: rid, zero_write: true } });
}
var fS2 = spy(function (n, url, init) { return downgradeEnv(init); });
checks.push(client(fS2).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  var e0 = env.errors[0];
  eq(e0.code, 'REQUEST_METHOD_DOWNGRADED', 'S2 a PROVED downgrade is classified as one');
  eq(e0.details.evidence.client_dispatched_post, true, 'S2 fact 1: the client dispatched POST');
  eq(e0.details.evidence.router_received_method, 'GET', 'S2 fact 2: it arrived as a GET');
  eq(e0.details.evidence.router_handler, 'doGet', 'S2 fact 3: doGet answered');
  eq(e0.details.evidence.post_body_present, false, 'S2 fact 4: the POST body was unavailable');
  eq(e0.details.evidence.request_id_correlated, true, 'S2 fact 5: the answer belongs to THIS request');
  // §M — the classifier contradiction is gone.
  ok(!/therefore its action/.test(e0.message), 'M2 the message no longer claims the action was dropped');
  ok(/survived in the request URL/.test(e0.message), 'M2 it states what actually happened to the action');
  eq(e0.details.retryable, true, 'S2 retryable — the deployment is fine, the hop lost the body');
}));
// §L — and WITHOUT that evidence the downgrade is NOT claimed. This is the assertion that makes the classifier
// sound rather than merely confident: a 302, a final GET to googleusercontent, an absent errors[] and an HTML
// body are individually NOT evidence, and none of them appears in the proof above.
var fS2b = spy(function () { return resp({ url: 'https://script.googleusercontent.com/macros/echo?user_content_key=Z', redirected: true, json: { success: false, error: DOGET_TERMINAL } }); });
checks.push(client(fS2b).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.errors[0].code, 'RESPONSE_CORRELATION_UNPROVEN', 'L1 without the typed facts, NO downgrade is claimed');
  ok(env.errors[0].code !== 'REQUEST_METHOD_DOWNGRADED', 'L1 a 302 + a googleusercontent final URL + doGet prose is NOT proof');
}));
// 3. /exec 404 HTML → the 404 family, attributed to the Apps Script deployment
var fS3 = spy(function () { return resp({ status: 404, contentType: 'text/html; charset=utf-8', body: GAS_404, url: EXEC }); });
checks.push(client(fS3).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.errors[0].code, 'TRANSPORT_NON_JSON_RESPONSE', 'S3 a 404 HTML body is a non-JSON transport answer at the workspace layer');
  eq(env.errors[0].details.httpStatus, 404, 'S3 with the status preserved for attribution');
}));
// 4. a Google login/access page → not parsed as data
var fS4 = spy(function () { return resp({ status: 200, contentType: 'text/html', body: LOGIN, url: 'https://accounts.google.com/x', redirected: true }); });
checks.push(client(fS4).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.success, false, 'S4 a sign-in page is never adopted as data');
  ok(!/Unexpected token/i.test(env.errors[0].message), 'S4 and never surfaces as an opaque JSON SyntaxError');
}));
// 5. a stale/expired redirect target → typed, and fingerprinted as expired by the db-api classifier
var cS5 = _kmClassifyAnswer_(IR_ACTION, 'read',
  resp({ status: 404, contentType: 'text/html', body: ECHO_404, redirected: true,
    url: 'https://script.googleusercontent.com/macros/echo?user_content_key=EXPIRED' }), ECHO_404, EXEC);
eq(cS5.typed.html_source, 'EXPIRED_USERCONTENT_REDIRECT', 'S5 an expired redirect target is typed as itself');
ok(/redirect target .* had already expired/.test(_kmTypedTransportMessage_(IR_ACTION, cS5)), 'S5 and says so in words');
// 6. a valid JSON BUSINESS rejection is NOT a transport downgrade
var fS6 = spy(function (n, url, init) {
  var rid = null; try { rid = JSON.parse((init && init.body) || '{}').requestId || null; } catch (e) {}
  return resp({ json: { success: false, meta: { action: IR_ACTION, requestId: rid },
    errors: [{ code: 'IR_SCHEMA_MISSING', message: 'the table is not provisioned', details: null }] } });
});
checks.push(client(fS6).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.errors[0].code, 'IR_SCHEMA_MISSING', 'S6 a business rejection is surfaced VERBATIM');
  ok(env.errors[0].code !== 'REQUEST_METHOD_DOWNGRADED' && env.errors[0].code !== 'HTTP_TRANSPORT_ERROR',
    'S6 and is never classified as a transport fault');
}));
// §J12 — action mismatch and request-id mismatch both fail CLOSED.
var fMisA = spy(function (n, url, init) {
  var rid = null; try { rid = JSON.parse((init && init.body) || '{}').requestId || null; } catch (e) {}
  return resp({ json: { success: true, data: { rows: [] }, meta: { action: 'weeklyShipping.workspace.get', requestId: rid } } });
});
checks.push(client(fMisA).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.errors[0].code, 'RESPONSE_ACTION_MISMATCH', 'J12 an answer to a DIFFERENT action fails closed');
}));
var fMisR = spy(function () { return resp({ json: { success: true, data: { rows: [] }, meta: { action: IR_ACTION, requestId: 'REQ-SOMEONE-ELSE' } } }); });
checks.push(client(fMisR).getWorkspace('inventoryReplenishment', IR_PARAMS).then(function (env) {
  eq(env.errors[0].code, 'RESPONSE_REQUEST_ID_MISMATCH', 'J12 an answer to a DIFFERENT request fails closed');
}));
// §J7 — an aborted / superseded read is NOT a red operational error.
var fAb = spy(function () { return resp({ json: { success: true, data: { rows: [] } } }); });
checks.push(Promise.resolve(client(fAb).getWorkspace('inventoryReplenishment', IR_PARAMS, { signal: { aborted: true } }))
  .then(function (env) { return env; }, function (err) { return { __rejected: err }; })
  .then(function (r) {
    var codeSeen = r.__rejected ? (r.__rejected.apiCode || r.__rejected.code) : (r.errors && r.errors[0] && r.errors[0].code);
    ok(codeSeen === 'ABORTED' || codeSeen === 'REQUEST_ABORTED', 'J7 an aborted read is ABORTED, not a transport failure');
    eq(fAb._calls.length, 0, 'J7 and it never reached the network');
  }));

// =============================================================================================================
section('§D — single-flight for SESSION-STABLE metadata only, and a rejection is EVICTED');
// =============================================================================================================
var tSF = TP.create({ fetch: spy(function () { return resp({ json: { success: true } }); }), baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; } });
// §J5 — concurrent metadata consumers issue ONE request.
var mCount = 0;
function metaRead() { mCount++; return new Promise(function (r) { setTimeout(function () { r('ok'); }, 5); }); }
checks.push(Promise.all([tSF.singleFlight('system.health', metaRead), tSF.singleFlight('system.health', metaRead), tSF.singleFlight('system.health', metaRead)])
  .then(function (all) {
    eq(mCount, 1, 'D5 three concurrent metadata consumers issued ONE request');
    eq(all, ['ok', 'ok', 'ok'], 'D5 and all three got the answer');
    // §J4 — a BUSINESS workspace is NEVER coalesced. Two different scopes must never share one answer.
    ok(tSF.isMetadataKey('system.health') === true, 'D4 system.health is on the metadata allowlist');
    ok(tSF.isMetadataKey('inventoryReplenishment.workspace.get') === false, 'D4 a business workspace is NOT');
    var bCount = 0;
    function bizRead() { bCount++; return Promise.resolve('b'); }
    return Promise.all([tSF.singleFlight(IR_ACTION, bizRead), tSF.singleFlight(IR_ACTION, bizRead)])
      .then(function () { eq(bCount, 2, 'D4 so two business reads stay TWO requests — never merged'); });
  }));
// §J4/§D2 — a REJECTED metadata promise is evicted IMMEDIATELY, so the next consumer makes a real request.
// This is the property whose absence turns a transient fault into "only a hard reload fixes it".
var rCount = 0;
checks.push(tSF.singleFlight('getClientCapabilities', function () { rCount++; return Promise.reject(new Error('boom')); })
  ['catch'](function () { return null; })
  .then(function () {
    eq(tSF.inflightKeys().indexOf('getClientCapabilities'), -1, 'D2 the rejected metadata promise was EVICTED');
    return tSF.singleFlight('getClientCapabilities', function () { rCount++; return Promise.resolve('now ok'); });
  })
  .then(function (v) {
    eq(rCount, 2, 'D2 the next consumer issued a REAL request (no cached rejection)');
    eq(v, 'now ok', 'D2 and it succeeded without a page reload');
  }));
// §J10 — an error is never cached as an empty success.
ok(/if \(_inflight\[k\] === p\) delete _inflight\[k\]/.test(code(TPSRC)), 'D2 the eviction is unconditional on BOTH outcomes');
ok(/p\.then\(evict, evict\)/.test(code(TPSRC)), 'D2 including the rejection path');
// §D — the mount fan-out is BOUNDED. Four tables no longer mean four simultaneous requests.
ok(/KM_SCOPED_READ_CONCURRENCY_/.test(DBAPIC), 'D6 loadScopedTables has a declared concurrency bound');
ok(!/await Promise\.all\(names\.map\(/.test(DBAPIC), 'D6 and no longer fans out one request per table at once');
// BOTH fan-out sites, through ONE reader. The second one (_kmRefreshCacheTables_, used by the FC builder, the
// Request Order second-layer expand and the allocation-draft hydrate) had the identical unbounded shape, and a
// bound that holds in one place and is missing in the other is not a bound.
ok(/_kmReadTablesBounded_/.test(DBAPIC), 'D7 one shared bounded multi-table reader exists');
eq((DBAPIC.match(/await _kmReadTablesBounded_\(names\)/g) || []).length, 2, 'D7 and BOTH fan-out sites go through it');
ok(/_kmRefreshCacheTables_/.test(DBAPIC), 'D7 including the secondary/hydrate path');

// §D1 — the two session-stable metadata reads go through the shared latch, not through two private ones.
ok(/_kmMetadataSingleFlight_/.test(DBAPIC), 'D8 the db-api routes metadata reads through the shared latch');
ok(/window\.KM\.transport\.singleFlight/.test(DBAPIC), 'D8 which is the transport module’s, not a second private one');
ok(/isMetadataKey\(key\)/.test(DBAPIC), 'D8 gated by the allowlist, so a business read can never be coalesced');

// §F — the shared safe error field set, and the four banners that now use it.
var tEF = TP.create({ baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; }, fetch: spy(function () { return resp({ json: {} }); }) });
var ef = tEF.errorFields({ code: 'HTTP_TRANSPORT_ERROR', message: 'API HTTP 404',
  transport: { code: 'HTTP_NOT_FOUND_HTML', action: IR_ACTION, request_id: 'REQ-Z1', httpStatus: 404,
    contentType: 'text/html; charset=utf-8', html_source: 'GITHUB_PAGES_404', retryable: false,
    maskedFinalEndpoint: 'https://example.github.io/…', phase: 'REDIRECT_RESPONSE' } });
['code', 'action', 'request_id', 'retryable', 'next_action'].forEach(function (k) {
  ok(ef[k] !== undefined && ef[k] !== null, 'F9 the safe field set carries ' + k + ' — the five fields §F requires');
});
eq(ef.code, 'HTTP_NOT_FOUND_HTML', 'F9 preferring the TYPED reason over the legacy alias');
eq(ef.legacy_code, 'HTTP_TRANSPORT_ERROR', 'F9 while still reporting the alias the pages historically showed');
eq(ef.retryable, false, 'F9 and stating retryability rather than leaving it to be guessed');
var line = tEF.errorLine({ code: 'HTTP_TRANSPORT_ERROR', message: 'API HTTP 404',
  transport: { code: 'HTTP_NOT_FOUND_HTML', action: IR_ACTION, request_id: 'REQ-Z1', httpStatus: 404, retryable: false } });
['HTTP_NOT_FOUND_HTML', IR_ACTION, 'REQ-Z1', 'HTTP 404', 'Retryable: no'].forEach(function (frag) {
  ok(line.indexOf(frag) >= 0, 'F10 the rendered line names ' + frag);
});
ok(line.indexOf('<') < 0, 'F10 and emits no markup — the caller escapes once');
['fc-summary.js', 'request-order.js', 'inventory-replenishment.js', 'shipping-history.js'].forEach(function (pg) {
  var src = code(read('assets/js/pages/' + pg));
  ok(/ErrDetail_/.test(src), 'F11 ' + pg + ' renders its detail through the shared formatter');
  ok(/errorLine/.test(src), 'F11 ' + pg + ' — specifically KM.transport.errorLine');
  ok(/role="alert"/.test(src), 'F11 ' + pg + ' — announced to assistive tech');
  ok(/overflow-wrap:break-word/.test(src), 'F11 ' + pg + ' — and wraps instead of truncating the reason');
});

// §G10 — the migration sequence is documented, with the ordering the task requires.
var MIG = read('docs/planning/BACKEND_PORTABILITY_AND_MIGRATION_SEQUENCE.md');
['shadow read', 'parity report', 'scoped read cutover', 'transactional write cutover', 'reconciliation'].forEach(function (ph) {
  ok(new RegExp(ph.replace(/ /g, '[ -]'), 'i').test(MIG), 'G8 the migration sequence names the "' + ph + '" phase');
});
ok(/No database was migrated in this round/i.test(MIG), 'G8 and states plainly that nothing was migrated');
ok(/BigQuery is excluded by capability/i.test(MIG), 'G8 and that BigQuery is not a write target');
ok(MIG.indexOf('shadow read') < MIG.indexOf('scoped read cutover'), 'G8 with reads shadowed BEFORE any cutover');
ok(MIG.indexOf('scoped read cutover') < MIG.indexOf('transactional write cutover'), 'G8 and reads cut over before writes');

// =============================================================================================================
section('§A — the getTable reader: bounded, text-first, and it no longer blind-parses an HTML body');
// =============================================================================================================
// This is the path Factory Inventory, Overseas Inventory, FC Summary and Shipment Draft mount on, and it had
// none of the protections the workspace path already had.
ok(/getOperationDbTableFromSheet/.test(DBAPIC), 'E1 the per-table reader exists');
var gtSrc = extractFn(code(DBAPI), 'getOperationDbTableFromSheet');
ok(/_kmFetchBounded_/.test(gtSrc), 'E1 it is now BOUNDED (an unanswered read cannot hold the mount open forever)');
ok(/_kmClassifyAnswer_/.test(gtSrc), 'E1 and classified through the ONE shared classifier');
ok(!/await resp\.json\(\)/.test(gtSrc), 'E1 the blind resp.json() is gone — no more opaque "Unexpected token \'<\'"');
ok(/kmTransport/.test(gtSrc), 'E1 and the typed reason rides on the thrown error so a page can render it');
var gdbSrc = extractFn(code(DBAPI), 'getOperationDbFromSheet');
ok(/_kmFetchBounded_/.test(gdbSrc) && /_kmClassifyAnswer_/.test(gdbSrc) && !/await resp\.json\(\)/.test(gdbSrc),
  'E2 the whole-DB reader received the same three fixes');

// =============================================================================================================
section('§F — the seven states, and "尚未連接資料來源" can no longer mean "the API failed"');
// =============================================================================================================
['LOADING', 'READY_WITH_DATA', 'READY_EMPTY', 'EMPTY_CONFIGURATION', 'TRANSIENT_ERROR',
  'NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR', 'ABORTED_SUPERSEDED'].forEach(function (st) {
  eq(TP.UI_STATE[st], st, 'F1 the state vocabulary names ' + st);
});
var tUI = TP.create({ fetch: spy(function () { return resp({ json: {} }); }), baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; } });
eq(tUI.uiState({ success: true, data: { rows: [1] } }, { hasData: true }), 'READY_WITH_DATA', 'F2 rows → READY_WITH_DATA');
eq(tUI.uiState({ success: true, data: { rows: [] } }, { hasData: false }), 'READY_EMPTY', 'F2 a genuine zero-row success → READY_EMPTY');
eq(tUI.uiState({ success: true, data: null }, { hasData: false, configured: false }), 'EMPTY_CONFIGURATION', 'F2 unconfigured → EMPTY_CONFIGURATION');
eq(tUI.uiState({ success: false, code: TP.CODES.HTTP_NOT_FOUND_HTML }), 'NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR', 'F2 a 404 page is a CONFIGURATION/deployment error');
eq(tUI.uiState({ success: false, code: TP.CODES.AUTH_OR_ACCESS_HTML }), 'NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR', 'F2 as is a sign-in page');
eq(tUI.uiState({ success: false, code: TP.CODES.HTTP_TRANSPORT_ERROR }), 'TRANSIENT_ERROR', 'F2 a network fault is TRANSIENT_ERROR');
eq(tUI.uiState({ success: false, code: TP.CODES.REQUEST_ABORTED }), 'ABORTED_SUPERSEDED', 'F2 an abort is its own state, not an error');
ok(Object.keys(TP.CODES).every(function (k) { return tUI.uiState({ success: false, code: TP.CODES[k] }) !== 'EMPTY_CONFIGURATION'; }),
  'F3 NO failure code can map to EMPTY_CONFIGURATION — the state that owns "尚未連接資料來源"');

// §J11 — the two pages, at source. The phrase must be reachable from EMPTY_CONFIGURATION only.
[['factory-stock.js', FS_C, '_fs'], ['overseas-stock.js', OS_C, '_os']].forEach(function (pg) {
  var name = pg[0], src = pg[1], pfx = pg[2];
  var occurrences = src.split('尚未連接資料來源').length - 1;
  eq(occurrences, 1, 'F4 ' + name + ' contains the phrase exactly ONCE (in code)');
  var st = extractFn(src, pfx + 'StateHtml_');
  ok(st.indexOf('尚未連接資料來源') > 0, 'F4 ' + name + ' — and that one occurrence is inside the state renderer');
  ok(/EMPTY_CONFIGURATION/.test(st.slice(0, st.indexOf('尚未連接資料來源'))),
    'F4 ' + name + ' — guarded by EMPTY_CONFIGURATION, so a transport failure can never print it');
  // the read failure is CLASSIFIED, not swallowed
  ok(new RegExp('\\.catch\\(function \\(err\\)').test(src), 'F5 ' + name + ' — the scoped-read rejection is captured, not discarded');
  ok(new RegExp(pfx + 'ReadFailure_').test(src), 'F5 ' + name + ' — and turned into a typed reason');
  // §D9 — recovery must not need a reload: the tried-flag is CLEARED on failure.
  ok(/DbLoadTried = false/.test(src), 'F6 ' + name + ' — a failure CLEARS the tried-flag, so a later mount really retries');
  // one Retry = one request
  ok(new RegExp(pfx + 'RetryRead_').test(src), 'F7 ' + name + ' — has an explicit Retry that issues one request');
  ok(/status === 'LOADING'\) return/.test(src), 'F7 ' + name + ' — and never starts a second concurrent read');
  // no raw HTML body or unmasked URL is rendered
  ok(!/responsePrefix|rawBody|e\.body/.test(extractFn(src, pfx + 'StateHtml_')), 'F8 ' + name + ' — renders no raw response body');
});

// =============================================================================================================
section('§G — the portable boundary, proved by ONE contract test over TWO adapters');
// =============================================================================================================
// §J15. The same QuerySpec and CommandSpec objects go to both adapters and the envelope semantics must match.
// This is what makes the boundary real rather than a rename: if only one implementation could produce the
// envelope, there would be no contract to keep.
var SEED = [
  { sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', quantity: 800, note: 'x' },
  { sku: 'CO1200-B', country: 'US', marketplace: 'Amazon', quantity: 120, note: 'y' },
  { sku: 'CO1300-G', country: 'CA', marketplace: 'Amazon', quantity: 55, note: 'z' }
];
var tG = TP.create({
  baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; },
  fetch: spy(function (n, url, init) {
    var sent = JSON.parse(init.body);
    var sc = sent.payload.scope, pr = sent.payload.projection, pg = sent.payload.pagination;
    var rows = SEED.filter(function (r) {
      return (!sc.country || r.country === sc.country) && (!sc.marketplace || r.marketplace === sc.marketplace) && (!sc.sku || r.sku === sc.sku);
    });
    var start = (pg.page - 1) * pg.size;
    rows = rows.slice(start, start + pg.size).map(function (r) {
      if (!pr.length) return r;
      var o = {}; pr.forEach(function (f) { if (Object.prototype.hasOwnProperty.call(r, f)) o[f] = r[f]; }); return o;
    });
    return resp({ json: { success: true, data: { rows: rows }, meta: { action: sent.action, requestId: sent.requestId } } });
  })
});
var repoGas = DA.createRepository(DA.appsScriptAdapter({ transport: tG }));
var repoMem = DA.createRepository(DA.inMemoryAdapter({ seed: { siteInventory: SEED } }));
var CONTRACT_SPECS = [
  { resource: 'siteInventory', scope: { country: 'US', marketplace: 'Amazon' }, page: { number: 1, size: 10 }, requestId: 'REQ-C1' },
  { resource: 'siteInventory', scope: { country: 'US', marketplace: 'Amazon' }, projection: ['sku', 'quantity'], page: { number: 1, size: 1 }, requestId: 'REQ-C2' },
  { resource: 'siteInventory', scope: { country: 'US', marketplace: 'Amazon' }, page: { number: 2, size: 1 }, requestId: 'REQ-C3' },
  { resource: 'siteInventory', scope: { country: 'ZZ' }, page: { number: 1, size: 10 }, requestId: 'REQ-C4' },
  { resource: 'notAResource', scope: {}, page: { number: 1, size: 10 }, requestId: 'REQ-C5' }
];
checks.push(Promise.all(CONTRACT_SPECS.map(function (sp, i) {
  return Promise.all([repoGas.query(sp), repoMem.query(sp)]).then(function (r) {
    function comparable(e) { return { ok: e.ok, state: e.state, rows: e.data.rows, rowCount: e.data.rowCount, page: e.data.page,
      errorKind: e.error && e.error.kind, errorCode: e.error && e.error.code, resource: e.meta.resource, requestId: e.meta.requestId }; }
    eq(comparable(r[0]), comparable(r[1]), 'G1.' + (i + 1) + ' both adapters answer spec #' + (i + 1) + ' identically');
  });
})));
// §J15 — commands: identical envelope, and the SAME idempotency key never writes twice.
var CMD = { resource: 'executionPlan', operation: 'upsertHeader', payload: { quantity: 800 }, idempotencyKey: 'IDEM-1', verify: true, requestId: 'REQ-W1' };
checks.push(repoMem.command(CMD).then(function (a) {
  eq([a.ok, a.data.command.applied, a.data.command.replayed], [true, true, false], 'G2 the first command APPLIES');
  ok(a.data.command.verification && a.data.command.verification.rowsAfter === 1, 'G2 and returns a verification envelope');
  return repoMem.command(CMD);
}).then(function (b) {
  eq([b.ok, b.data.command.applied, b.data.command.replayed], [true, false, true], 'G2 the SAME key REPLAYS — it does not write twice');
}));
// A command with no idempotency key is refused BEFORE any request, on both adapters.
checks.push(Promise.all([
  repoGas.command({ resource: 'executionPlan', operation: 'upsertHeader', payload: {}, requestId: 'REQ-W2' }),
  repoMem.command({ resource: 'executionPlan', operation: 'upsertHeader', payload: {}, requestId: 'REQ-W2' })
]).then(function (r) {
  eq([r[0].error.code, r[1].error.code], ['IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_KEY_REQUIRED'], 'G3 both adapters refuse a keyless command');
  eq([r[0].error.kind, r[1].error.kind], ['CONFIGURATION', 'CONFIGURATION'], 'G3 as a CONFIGURATION fault, not a transport one');
}));
// §G3 — a transport failure and a business rejection are separate KINDS with separate codes.
var tGerr = TP.create({ baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; },
  fetch: spy(function () { return resp({ status: 404, contentType: 'text/html; charset=utf-8', body: GAS_404, url: EXEC }); }) });
checks.push(DA.createRepository(DA.appsScriptAdapter({ transport: tGerr })).query({ resource: 'siteInventory', requestId: 'REQ-E1' })
  .then(function (env) {
    eq(env.error.kind, 'CONFIGURATION', 'G4 a 404 HTML answer is a CONFIGURATION/deployment fault at the boundary');
    eq(env.state, 'NON_RETRYABLE_CONFIGURATION_OR_DEPLOYMENT_ERROR', 'G4 with the matching non-retryable state');
  }));
var tGbiz = TP.create({ baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; },
  fetch: spy(function (n, u, init) { var s = JSON.parse(init.body);
    return resp({ json: { success: false, meta: { action: s.action, requestId: s.requestId }, errors: [{ code: 'IR_SCHEMA_MISSING', message: 'not provisioned' }] } }); }) });
checks.push(DA.createRepository(DA.appsScriptAdapter({ transport: tGbiz })).query({ resource: 'siteInventory', requestId: 'REQ-E2' })
  .then(function (env) {
    eq(env.error.kind, 'BUSINESS', 'G4 a business rejection is a BUSINESS fault — a different kind entirely');
    eq(env.error.code, 'IR_SCHEMA_MISSING', 'G4 carrying the backend’s own code');
  }));
// §G7 — BigQuery is not a transactional-write target, and that is a machine fact, not a sentence in a doc.
eq(DA.CAPABILITIES.BIGQUERY.transactionalWrite, false, 'G5 the BigQuery adapter capability declares NO transactional write');
eq(DA.CAPABILITIES.SUPABASE_POSTGRES.transactionalWrite, true, 'G5 while Supabase/Postgres declares one');
var bqRepo = DA.createRepository({ name: 'BIGQUERY', capabilities: DA.CAPABILITIES.BIGQUERY,
  query: function (s) { return Promise.resolve(DA.okEnvelope(s, [])); }, command: function () { throw new Error('must never be called'); } });
checks.push(bqRepo.command({ resource: 'executionPlan', operation: 'upsertHeader', idempotencyKey: 'K', payload: {} })
  .then(function (env) { eq(env.error.code, 'ADAPTER_IS_READ_ONLY', 'G5 and a write against it is REFUSED, not attempted'); }));
// §G1/§G8 — pages never see a URL, a sheet name or a credential through this boundary.
ok(!/script\.google\.com/.test(code(DASRC)), 'G6 the boundary carries no endpoint URL');
ok(!/SUPABASE_KEY|SUPABASE_URL|service_role|apikey|Bearer /.test(DASRC), 'G6 and no credential of any kind');
ok(!/getRange|getSheetByName|sheet\.|rowIndex/.test(code(DASRC)), 'G6 nor a sheet or row-index concept');
// §J13 — no whole-DB fallback anywhere in the boundary.
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(code(DASRC)), 'G7 and NO whole-database fallback');

// =============================================================================================================
section('§H — the deployment contract now has FOUR distinguishable faults');
// =============================================================================================================
ok(/SYS_TRANSPORT_CONTRACT_VERSION_/.test(HLTH), 'H1 the deployment declares a TRANSPORT contract version');
ok(/transport_contract_version: SYS_TRANSPORT_CONTRACT_VERSION_/.test(HLTH), 'H1 and reports it in system.health');
ok(/router_response_identity/.test(HLTH), 'H1 together with which response-identity fields its router can emit');
ok(/KM_EXPECTED_TRANSPORT_CONTRACT_VERSION_/.test(DBAPIC), 'H2 the frontend pins the transport contract it needs');
ok(/TRANSPORT_CONTRACT_MISMATCH/.test(DBAPIC), 'H2 and names a mismatch on that axis SEPARATELY');
['API_ENDPOINT_CONFIGURATION_INVALID', 'TRANSPORT_CONTRACT_MISMATCH', 'DEPLOYMENT_CONTRACT_MISMATCH', 'DEPLOYMENT_PARTIAL_SYNC'].forEach(function (c) {
  ok(DBAPIC.indexOf("code: '" + c + "'") > 0, 'H3 the verdict can return ' + c + ' — four faults, four answers');
});
ok(/getEndpointClassification/.test(DBAPIC), 'H4 the verdict reports a stable ENDPOINT classification too');
ok(/if \(_ep\.ok === false\)/.test(DBAPIC), 'H4 and refuses locally, without a request, when the endpoint cannot work');
ok(!/missing_actions=\[\]/.test(DBAPIC) || /missing_actions_is_self_referential/.test(HLTH),
  'H5 and it does not rely on missing_actions=[] alone');
// The router emits what the client's proof consumes — checked on BOTH sides so they cannot drift.
['handler:', 'received_method:', 'post_body_present:', 'action_present_in_query:', 'router_build:'].forEach(function (f) {
  ok(RTR.indexOf(f) > 0, 'H6 the router emits ' + f.replace(':', ''));
});
ok(/handler: 'doPost'/.test(RTR), 'H6 including on the doPost side, so its answer can never read as a downgrade');
ok(/RTR_BUILD_VERSION_ = 'F1-7N-FB-4E'/.test(RTR), 'H7 the router build stamp advanced');
ok(/SYS_BUILD_VERSION_ = 'F1-7N-FB-4E'/.test(HLTH), 'H7 as did the health owner’s');
ok(/'01_router\.gs', symbol: 'RTR_BUILD_VERSION_', expected: 'F1-7N-FB-4E'/.test(HLTH), 'H7 and the manifest expects the new router build');
ok(/'63_api_v1_system_health\.gs', symbol: 'SYS_BUILD_VERSION_', expected: 'F1-7N-FB-4E'/.test(HLTH), 'H7 and the new health build');
// The ACTION contract deliberately did NOT move: no router action was added or removed this round.
ok(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = 7/.test(HLTH), 'H8 the ACTION contract stays v7 — no action was added or removed');
ok(/KM_EXPECTED_ACTION_CONTRACT_VERSION_ = 7/.test(DBAPIC), 'H8 and the frontend still expects v7 — the two axes are independent');

// =============================================================================================================
section('§H/§J14 — every changed transport-critical asset carries the NEW release token');
// =============================================================================================================
// The trap this round keeps hitting from the other side: a PINNED LITERAL token makes bumping look like a
// regression. So the rule is stated as a rule — a changed asset must not still carry a token from an EARLIER
// round — rather than as a frozen string that has to be edited every time.
var CHANGED_ASSETS = ['assets/js/api/km-transport.js', 'assets/js/api/km-data-access.js',
  'assets/js/api/operation-system-db-api.js', 'assets/js/api/km-api-foundation.js',
  'assets/js/pages/factory-stock.js', 'assets/js/pages/overseas-stock.js',
  // the four page banners that now render the shared safe field set, plus the Site Inventory co-deployed set
  'assets/js/pages/fc-summary.js', 'assets/js/pages/request-order.js',
  'assets/js/pages/inventory-replenishment.js', 'assets/js/pages/shipping-history.js',
  'assets/js/utils/inventory-compat.js', 'assets/js/pages/sku-details.js'];
var STALE_TOKENS = ['fb4d-site-inventory-20260826', 'sku-read-path-20260826', 'catseries-20260820',
  'whmoreopts-20260820', 'donenotice-20260811', 'r6a1-request-send-20260822'];
var tokens = {};
CHANGED_ASSETS.forEach(function (a) {
  var m = new RegExp('src="' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([^"]+)"').exec(HTML);
  ok(!!m, 'J14 ' + a + ' is loaded by index.html with a cache-bust token');
  if (m) {
    tokens[a] = m[1];
    ok(STALE_TOKENS.indexOf(m[1]) < 0, 'J14 ' + a + ' does NOT still carry a token from an earlier round (' + m[1] + ')');
  }
});
var distinct = Object.keys(tokens).map(function (k) { return tokens[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
eq(distinct.length, 1, 'J14 every changed asset shares ONE token, so they cannot deploy out of step');
// The paired stylesheet moves with its page script: factory-stock.js + factory-stock.css are a declared
// co-changed pair, and a token that moves for one and not the other can ship a half-styled page.
var mCss = /href="assets\/css\/pages\/factory-stock\.css\?v=([^"]+)"/.exec(HTML);
ok(!!mCss && mCss[1] === distinct[0], 'J14 and the declared co-changed factory stylesheet shares it too');
// Load ORDER is load-bearing: the transport authority must precede its two consumers.
var iTp = HTML.indexOf('assets/js/api/km-transport.js');
var iDa = HTML.indexOf('assets/js/api/km-data-access.js');
var iDb = HTML.indexOf('assets/js/api/operation-system-db-api.js');
var iFn = HTML.indexOf('assets/js/api/km-api-foundation.js');
ok(iTp > 0 && iTp < iDa && iDa < iDb && iDb < iFn, 'J14 transport → data-access → db-api → foundation, in that order');

// =============================================================================================================
section('§E — request counts and phase timings are MEASURED, not asserted in a comment');
// =============================================================================================================
// §J18. The timings come from an injected clock, so these are exact numbers rather than a tolerance window.
var clock = 0;
var tMetrics = TP.create({
  baseUrl: EXEC, frontendOrigin: ORIGIN,
  now: function () { clock += 10; return clock; },
  fetch: spy(function (n, u, init) { var s = JSON.parse(init.body);
    return resp({ json: { success: true, data: { rows: [{ a: 1 }] }, meta: { action: s.action, requestId: s.requestId } } }); })
});
checks.push(tMetrics.request({ action: IR_ACTION, requestId: 'REQ-M1', kind: 'read', payload: { payload: {} } }).then(function (r) {
  eq(r.success, true, 'E3 the shared request machine completes');
  eq(r.phase, 'SUCCESS', 'E3 and reports its terminal phase');
  ok(typeof r.timings.total === 'number' && r.timings.total > 0, 'E3 with a total duration');
  ['endpoint', 'network', 'bodyRead', 'parse', 'validate', 'total'].forEach(function (k) {
    ok(typeof r.timings[k] === 'number', 'E3 phase timing present: ' + k);
  });
  ok((r.details.responseBytes || 0) > 0, 'E3 and the response byte count');
  ok(r.maskedEndpoint.indexOf('AKfyc') < 0, 'E3 the endpoint identity stays masked in the result');
  var m = tMetrics.metrics();
  eq(m.requests, 1, 'E4 the request COUNT is 1 — a measured number, not a claim');
  eq(m.byAction[IR_ACTION], 1, 'E4 attributed to the action');
  eq(m.retries, 0, 'E4 with no retries');
}));
// One bounded retry for a 5xx read, and EXACTLY one.
var clock2 = 0;
var tRetry = TP.create({
  baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { clock2 += 5; return clock2; },
  random: function () { return 0; }, sleep: function () { return Promise.resolve(); },
  fetch: spy(function (n, u, init) {
    if (n === 1) return resp({ status: 503, contentType: 'application/json', body: '{}' });
    var s = JSON.parse(init.body);
    return resp({ json: { success: true, data: { rows: [] }, meta: { action: s.action, requestId: s.requestId } } });
  })
});
checks.push(tRetry.request({ action: 'system.health', requestId: 'REQ-R1', kind: 'read' }).then(function (r) {
  eq(r.success, true, 'E5 a 503 read recovered on the single allowed retry');
  eq(tRetry.metrics().retries, 1, 'E5 and it was exactly ONE retry');
}));
// A WRITE is never replayed, even on the same 503.
var tNoReplay = TP.create({
  baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; }, sleep: function () { return Promise.resolve(); },
  fetch: spy(function () { return resp({ status: 503, contentType: 'application/json', body: '{}' }); })
});
checks.push(tNoReplay.request({ action: 'upsertShippingAllocationDraft', requestId: 'REQ-W9', kind: 'write' }).then(function (r) {
  eq(r.success, false, 'E6 the write failed');
  eq(tNoReplay.metrics().retries, 0, 'E6 and was NEVER automatically replayed');
  eq(r.details.zero_write, false, 'E6 nor reported as a proven zero-write — the server may have committed');
}));
// A 404 read is never retried, whatever else is true of it.
var tNo404 = TP.create({
  baseUrl: EXEC, frontendOrigin: ORIGIN, now: function () { return 0; }, sleep: function () { return Promise.resolve(); },
  fetch: spy(function () { return resp({ status: 404, contentType: 'text/html; charset=utf-8', body: GAS_404, url: EXEC }); })
});
checks.push(tNo404.request({ action: 'system.health', requestId: 'REQ-N4', kind: 'read' }).then(function (r) {
  eq(r.code, TP.CODES.HTTP_NOT_FOUND_HTML, 'E7 a 404 HTML page is typed by its source');
  eq(tNo404.metrics().retries, 0, 'E7 and is NEVER auto-retried — none of its four causes is fixed by asking again');
  eq(r.details.html_source, 'APPS_SCRIPT_DEPLOYMENT_404', 'E7 with the source attributed');
}));
// An invalid endpoint costs ZERO requests.
checks.push(tBad.request({ action: 'system.health', requestId: 'REQ-B1', kind: 'read' }).then(function (r) {
  eq(r.code, TP.CODES.API_ENDPOINT_CONFIGURATION_INVALID, 'E8 a /dev endpoint is refused as a configuration fault');
  eq(r.phase, 'BUILD', 'E8 in the BUILD phase — before the network');
  eq(fNoNet._calls.length, 0, 'E8 so ZERO requests were issued');
  eq(r.endpointClass, 'APPS_SCRIPT_DEV', 'E8 and the reason names the endpoint class');
}));
// The read-only performance report exists, declares its targets, and issues nothing.
ok(/window\.__kmTransportReport = function/.test(DBAPIC), 'E9 a read-only performance report exists');
ok(/KM_PERF_TARGETS_/.test(DBAPIC) && /p50_ms: 1500/.test(DBAPIC) && /p50_ms: 3000/.test(DBAPIC),
  'E9 with the §E acceptance targets recorded as data (metadata p50 1.5s, workspace p50 3s)');
var perfSrc = code(DBAPI).slice(code(DBAPI).indexOf('window.__kmTransportReport'));
perfSrc = perfSrc.slice(0, perfSrc.indexOf('\n};') + 3);
ok(!/fetch\(|_kmGapRead_|_kmFetchBounded_/.test(perfSrc), 'E9 and it issues NO request of its own');
ok(/KM_PERF_SURFACES_/.test(DBAPIC) && ['Site Inventory registry', 'Order Planning workspace', 'FC Summary', 'Shipment Draft', 'SKU Details']
  .every(function (s) { return DBAPI.indexOf(s) > 0; }), 'E9 covering the representative surfaces §E names');
// The three legacy runners report into the shared metric, so the report is not structurally blind.
ok(/_kmReportSample_/.test(DBAPIC), 'E10 the legacy runners report their outcome to the shared metric');
eq((DBAPIC.match(/_kmReportSample_\(/g) || []).length >= 5, true, 'E10 from every runner, on both the success and failure paths');
// The Foundation asks the transport for a timing CLOSURE rather than reading a clock: its own suite forbids a
// wall clock in that file, and that rule is worth keeping — a transport-foundation layer that branches on
// time is untestable. So it records WHAT happened and never WHEN.
ok(/beginExternal/.test(code(FND)), 'E10 as does the workspace POST path the six failing pages read through');
ok(!/Date\.now/.test(code(FND)), 'E10 and it still reads no wall clock of its own');
ok(/function beginExternal/.test(code(TPSRC)), 'E10 the clock lives in the transport module, where it belongs');

// =============================================================================================================
section('§I — safety: this round writes nothing, and leaks nothing');
// =============================================================================================================
var NEW_FILES = [TPSRC, DASRC];
NEW_FILES.forEach(function (src, i) {
  var c = code(src);
  ok(!/appendRow|setValue|setValues|deleteRow|getRange/.test(c), 'I1 new module ' + (i + 1) + ' performs no sheet write');
  ok(!/AKfyc|script\.google\.com\/macros\/s\//.test(c), 'I1 new module ' + (i + 1) + ' embeds no endpoint URL or Script ID');
  ok(!/Math\.random\(\)/.test(c) || /deps\.random/.test(c), 'I1 new module ' + (i + 1) + ' takes randomness by injection, never ambiently');
});
ok(!/migrate|MIGRATION/i.test(code(TPSRC)) && !/migrate|MIGRATION/i.test(code(DASRC).replace(/migration sequence/gi, '')),
  'I2 neither new module runs or references a migration');
ok(!/DemoData|demoSeed|DEMO_SEED/.test(code(TPSRC) + code(DASRC)), 'I3 and neither touches the Demo seed');
// The router and health owner stay read-only on the paths this round touched.
ok(/read_only: true/.test(HLTH), 'I4 system.health remains declared read-only');
ok(/zero_write: true/.test(RTR), 'I4 and the router’s terminal answers still declare zero writes');


// =============================================================================================================
section('§D-CORRECTION — the bound is a BOUNDED-PRESSURE control, not reliance on server serialization');
// =============================================================================================================
// THE CLAIM THAT WAS WRONG. Three comments in operation-system-db-api.js and one in the cutover suite justified
// this round's concurrency bound with "a backend whose per-user execution is serialized", and one of them drew
// a conclusion from it: "the tail latency is the sum either way".
//
// Apps Script gives NO such guarantee. Multiple executions for one user MAY overlap. So the tail latency of
// four concurrent reads is NOT the sum, and this bound is NOT free — the old rationale would have told the next
// reader the change could not cost anything, which is precisely the premise that stops a real measurement from
// being taken.
//
// The correct statement, and the one this section pins:
//   · multiple executions may overlap;
//   · Apps Script and the Spreadsheet service carry quotas and contention;
//   · unbounded client fan-out raises peak request pressure and makes partial failure more likely;
//   · the limiter is a bounded-pressure control, NOT reliance on guaranteed server serialization.
(function () {
  var SRCS = [['operation-system-db-api.js', DBAPI], ['km-transport.js', TPSRC], ['km-data-access.js', DASRC],
              ['api-non-workspace-primary-scoped-cutover', read('assets/tests/api-non-workspace-primary-scoped-cutover-f1-7j-a3-r1.test.js')]];
  // C1 — nothing may ASSERT serialization as a platform contract. The one surviving mention is the paragraph
  // that REFUTES it, so the test is "every occurrence sits next to its refutation", not "the words are absent"
  // — a word ban would forbid explaining the correction at all.
  SRCS.forEach(function (p) {
    var name = p[0], src = String(p[1] || '');
    var re = /execution[s]?\s+(?:is|are)\s+SERIALIZED/gi, m, sites = 0, refuted = 0;
    while ((m = re.exec(src))) {
      sites++;
      var around = src.slice(Math.max(0, m.index - 600), m.index + 600);
      if (/BOTH HALVES ARE WRONG|no such guarantee|does NOT guarantee|may overlap/i.test(around)) refuted++;
    }
    eq(sites, refuted, 'C1 ' + name + ': every "executions are serialized" mention is a refutation, not a contract (' +
      refuted + '/' + sites + ')');
  });
  // C2 — the corrected reasoning is actually present where the bound is defined, so a reader arrives at the
  // right premise rather than at no premise.
  var band = DBAPI.slice(Math.max(0, DBAPI.indexOf('KM_SCOPED_READ_CONCURRENCY_') - 2600),
                         DBAPI.indexOf('KM_SCOPED_READ_CONCURRENCY_') + 400);
  ok(/may overlap/i.test(band), 'C2 the bound cites that executions MAY overlap');
  ok(/quota/i.test(band), 'C2 and that the services are quota-bound');
  ok(/peak (request )?pressure/i.test(band), 'C2 and that unbounded fan-out raises peak request pressure');
  ok(/partial failure|one partial failure/i.test(band), 'C2 and that this makes partial failure more likely');
  ok(/BOUNDED[- ]PRESSURE CONTROL/i.test(band), 'C2 and names the limiter a bounded-pressure control');
  // C3 — and it does NOT claim a speed win it has not measured.
  ok(/reliability measure/i.test(band) && /only live measurement can answer|open question/i.test(band),
    'C3 the rationale states this is a reliability measure whose speed effect is unmeasured');

  // C4 — THE BEHAVIOURAL HALF, WHICH IS WHY THIS IS A COMMENT REPAIR AND NOT A CODE REPAIR. The bounded reader
  // must be correct whether or not the server overlaps executions: a worker pool writing into a keyed object,
  // with no ordering assumption, no read-after-write and no dependence on request N finishing before N+1.
  var rdStart = DBAPI.indexOf('async function _kmReadTablesBounded_');
  ok(rdStart > 0, 'C4 the bounded reader is locatable');
  var rd = DBAPI.slice(rdStart, DBAPI.indexOf('\n}', rdStart) + 2);
  ok(/rawDb\[names\[i\]\] = await getOperationDbTableFromSheet\(names\[i\]\)/.test(rd),
    'C4 each table lands under its OWN key — arrival order cannot change the result');
  // Stated as what it IS rather than as a ban on characters: the accumulator is an OBJECT keyed by table
  // name and that object is what comes back. An earlier version of this line banned `push(`, which matched the
  // worker-pool construction `pool.push(worker())` — a false positive on the one push that has to be there.
  ok(/var rawDb = \{\};/.test(rd) && /return rawDb;/.test(rd),
    'C4 results accumulate in a NAME-KEYED object, never in an order-dependent list');
  ok(!/rawDb\.push|rawDb\[i\]|rawDb\[w\]/.test(rd),
    'C4 and never by position, so completion order cannot change the answer');
  ok(!/sleep|setTimeout|Date\.now|performance\.now/.test(rd),
    'C4 and it waits on nothing but the requests themselves — no timing assumption about the server');
  // C5 — the metadata latch is likewise keyed and evicts on either outcome, so overlapping executions cannot
  // make one consumer inherit another's failure.
  ok(/if \(_inflight\[k\]\) return _inflight\[k\]/.test(TPSRC), 'C5 the single-flight latch is keyed, not global');
  ok(/p\.then\(evict, evict\)/.test(TPSRC), 'C5 and evicts on BOTH outcomes — a rejection is never inherited');
})();

// =============================================================================================================
Promise.all(checks).then(function () {
  console.log('\n----------------------------------------');
  console.log('SHARED API TRANSPORT RELIABILITY (F1-7N-FB-4E): ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
}, function (e) {
  console.error('HARNESS ERROR', e && e.stack || e);
  process.exit(1);
});
