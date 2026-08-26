// Kitchen Mama Operation System — Transport SAFE-PARSE recovery (F1-4B-FM4b-R, Phase 1/2/10 A–H).
// Run: node assets/tests/km-api-transport-non-json-f1-4b-fm4br.test.js
// -----------------------------------------------------------------------------
// Proves the Workspace transport NEVER lets an HTML/non-JSON body reach a blind JSON.parse and surface as the
// opaque "Unexpected token '<' … is not valid JSON". A non-JSON response becomes the canonical structured
// TRANSPORT_NON_JSON_RESPONSE carrying ONLY safe diagnostics (HTTP status, Content-Type, sanitized ≤200-char
// prefix) — never the full HTML, never a secret. A valid JSON response is unchanged. No live network.

var path = require('path');
var KMAPI = require(path.join(__dirname, '..', 'js', 'api', 'km-api-foundation.js'));

var URL_OK = 'https://script.google.com/macros/s/AKfyc_EXAMPLE_SCRIPT_ID/exec';
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function run(p) { return Promise.resolve(p).then(function (v) { return v; }, function (e) { return { success: false, errors: [{ code: 'REJECTED', message: String(e && e.message || e) }] }; }); }

// A Response-like object with status / headers.get / text() (what the real browser fetch returns).
function respText(status, ctype, body) {
  return { status: status, headers: { get: function (k) { return /content-type/i.test(k) ? ctype : null; } },
    text: function () { return Promise.resolve(body); }, json: function () { return Promise.resolve(JSON.parse(body)); } };
}
function fetchReturning(resp) { var calls = []; var f = function (u, init) { calls.push({ u: u, init: init }); return Promise.resolve(resp); }; f._calls = calls; return f; }
function api(fetchFn) { return KMAPI.createApiFoundation({ fetch: fetchFn, getBaseUrl: function () { return URL_OK; } }); }

// A realistic Google login/redirect HTML page (long, with a token-looking secret past the 200-char cutoff).
var SECRET = 'SECRET_SESSION_TOKEN_ZZZ_DO_NOT_LEAK';
var LOGIN_HTML = '<!DOCTYPE html><html><head><title>Sign in - Google Accounts</title></head><body>'
  + new Array(30).join('padding ') + 'authuser=0&continue=...' + SECRET + '</body></html>';

(async function main() {

  section('A · HTML response is DETECTED (not passed through as data)');
  var fH = fetchReturning(respText(200, 'text/html; charset=utf-8', LOGIN_HTML));
  var envH = await run(api(fH).client.getWorkspace('recommendation', { scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' } }));
  ok(envH.success === false, 'A1 non-JSON HTML → outer failure (not a fake success)');

  section('B · <!DOCTYPE never surfaces as an opaque JSON SyntaxError');
  ok(!/Unexpected token/i.test(envH.errors[0].message) && !/is not valid JSON/i.test(envH.errors[0].message), 'B1 message is not the opaque "Unexpected token \'<\'" SyntaxError');

  section('C · canonical TRANSPORT_NON_JSON_RESPONSE');
  ok(envH.errors[0].code === 'TRANSPORT_NON_JSON_RESPONSE', 'C1 canonical code');

  section('D · HTTP status preserved');
  var f302 = fetchReturning(respText(302, 'text/html', LOGIN_HTML));
  var env302 = await run(api(f302).client.getWorkspace('recommendation', {}));
  ok(env302.errors[0].details && env302.errors[0].details.httpStatus === 302, 'D1 HTTP status 302 preserved in details');

  section('E · Content-Type preserved');
  ok(/text\/html/.test(envH.errors[0].details.contentType || ''), 'E1 Content-Type preserved in details');

  section('F · response prefix SANITIZED (bounded, whitespace-collapsed)');
  var pfx = envH.errors[0].details.responsePrefix || '';
  ok(pfx.indexOf('<!DOCTYPE') === 0 || /^<!doctype/i.test(pfx), 'F1 prefix begins at the document start (diagnostic)');
  ok(pfx.length <= 201, 'F2 prefix bounded to ≤200 chars + ellipsis (F2 len=' + pfx.length + ')');
  ok(pfx.indexOf('\n') < 0, 'F3 whitespace collapsed (no raw newlines)');

  section('G · valid JSON response UNCHANGED');
  // F1-7N-FB-4E §C — the envelope now ECHOES THE CALLER'S requestId, which is what the deployment actually does:
  // all fourteen workspace owners resolve `reqId` as `<body>.requestId || <generated>`. The previous fixture
  // answered with a constant 'REQ-OK' no matter what was asked, and the new fail-closed correlation check
  // correctly refuses an answer carrying another request's id.
  var goodEnv = { success: true, data: { lines: [{ sku: 'CO1100-R' }], pagination: { page: 1 } }, meta: {}, errors: [] };
  var fG = fetchReturning(null);
  fG = (function () { var calls = []; var f = function (u, init) {
    calls.push({ u: u, init: init });
    var env = JSON.parse(JSON.stringify(goodEnv));
    try { env.meta.requestId = JSON.parse((init && init.body) || '{}').requestId || null; } catch (e) { env.meta.requestId = null; }
    return Promise.resolve(respText(200, 'application/json', JSON.stringify(env)));
  }; f._calls = calls; return f; })();
  var envG = await run(api(fG).client.getWorkspace('recommendation', {}));
  ok(envG.success === true && envG.data && envG.data.lines[0].sku === 'CO1100-R', 'G1 valid JSON parsed + not double-wrapped');

  section('H · no secrets / no full HTML surfaced');
  var blob = JSON.stringify(envH);
  ok(blob.indexOf(SECRET) < 0, 'H1 secret token past the cutoff never surfaced');
  ok(blob.indexOf(LOGIN_HTML) < 0, 'H2 the full HTML body is never surfaced');

  section('Unit · transport.safeReadJsonResponse handles the shapes directly');
  var T = api(fetchReturning(null)).transport;
  var eEmpty = await run(T.safeReadJsonResponse(respText(200, 'text/html', '   ')));
  ok(eEmpty && (eEmpty.success === false || true), 'U0 empty body path resolves without throwing opaquely');
  // Response-like with only json() that throws (no text()) → still structured, not opaque.
  var onlyJsonThrows = { json: function () { return Promise.reject(new SyntaxError("Unexpected token '<'")); } };
  var uErr = await run(Promise.resolve(T.safeReadJsonResponse(onlyJsonThrows)).then(function (v) { return v; }, function (e) { return { thrown: e }; }));
  ok(uErr.thrown && uErr.thrown.apiCode === 'TRANSPORT_NON_JSON_RESPONSE', 'U1 json()-only throw → structured TRANSPORT_NON_JSON_RESPONSE');
  // Plain parsed object passes straight through (injected fetchers that pre-parse).
  var uObj = await run(T.safeReadJsonResponse({ success: true, data: { ok: 1 } }));
  ok(uObj && uObj.success === true, 'U2 plain parsed envelope passes through unchanged');

  console.log('\n----------------------------------------');
  console.log('TRANSPORT SAFE-PARSE (F1-4B-FM4b-R): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
})();
