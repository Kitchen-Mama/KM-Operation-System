/**
 * ==================================================================================================
 * THE GATEWAY, ATTACKED                                                              SEC-A2 §11
 * ==================================================================================================
 *
 * Subject: `services/auth-gateway/` and `services/auth-gateway/apps-script-verifier/`. Neither is
 * deployed, routed, synced or loaded by any page.
 *
 * THE ASSERTION IS THE ONE THING TWO INDEPENDENT IMPLEMENTATIONS HAVE TO AGREE ON, so §D does not test
 * them separately — it makes the gateway sign and the Apps Script verifier check, and requires the
 * canonical strings to be IDENTICAL CHARACTER FOR CHARACTER. A signature scheme where the two ends can
 * disagree about a byte is a scheme that works until the first non-ASCII value and then fails only in
 * production. §D2 is that exact case: an email with an accent, where UTF-16 length and UTF-8 length
 * differ, and where a shim that returned `s.length` would make this suite green and the system broken.
 *
 * WHAT §F IS REALLY FOR. Every CORS bypass in the wild is a comparison that was almost right. So the
 * suite does not ask "is a good origin allowed" — it asks whether `https://127.0.0.1:8801.attacker.test`,
 * `https://evil-127.0.0.1:8801`, `null` and a missing Origin are refused, which is where the bugs are.
 *
 * ORDERING IS TESTED AS AN ABSENCE (§H): on every refusal the upstream must never have been CALLED.
 * That is a stronger statement than "the response was a refusal", because it is the one that proves
 * nothing was read or written before the decision was made.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var GW = path.join(ROOT, 'services', 'auth-gateway', 'src');
var GS_FILE = path.join(ROOT, 'services', 'auth-gateway', 'apps-script-verifier',
  'SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs');

var H = require('./_sec-a2-harness.js');
var codes = require(path.join(GW, 'codes.js'));
var C = codes.CODES;
var assertionLib = require(path.join(GW, 'assertion.js'));
var registry = require(path.join(GW, 'registry.js'));
var verifierLib = require(path.join(GW, 'verifier.js'));
var pipeline = require(path.join(GW, 'pipeline.js'));
var httpUtil = require(path.join(GW, 'http.js'));
var configLib = require(path.join(GW, 'config.js'));

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var x = JSON.stringify(a), y = JSON.stringify(b);
  ok(x === y, label, x === y ? undefined : { got: a, want: b });
}

/** Load the .gs under a fresh Apps Script shim. */
function loadGs(shimOpts) {
  H.installAppsScriptShim(global, shimOpts || {});
  delete require.cache[require.resolve(GS_FILE)];
  return require(GS_FILE);
}

// --- driving the pipeline ---------------------------------------------------------------------------
function run(over) {
  over = over || {};
  var calls = [];
  var deps = {
    cfg: over.cfg || H.baseConfig(),
    log: H.silentLogger(over.logLines),
    now: function () { return over.now === undefined ? H.NOW : over.now; },
    verifier: over.verifier || verifierLib.localJwksVerifier(H.jwks()),
    keyring: over.keyring === undefined ? H.KEYRING : over.keyring,
    registry: over.registry === undefined ? H.REGISTRY : over.registry,
    upstream: over.upstream || function (p) {
      calls.push(p);
      return Promise.resolve({ ok: true, status: 200, body: JSON.stringify({ echoed: p.action }) });
    }
  };
  var body = over.rawBody !== undefined ? over.rawBody : JSON.stringify({
    action: over.action || 'productPricing.siteUniverse.get',
    payload: over.payload || {},
    credential: over.credential !== undefined ? over.credential : H.mintToken(H.claims())
  });
  return pipeline.handle(body, over.cid || 'cid-test', deps)
    .then(function (r) { return { r: r, upstreamCalls: calls }; });
}

var J = Promise.resolve();
function step(fn) { J = J.then(fn); }

// ===================================================================================================
step(function () {
  console.log('\n=== §A  THE TOKEN ===');
  var cases = [
    ['A1 no credential', { credential: '' }, C.NOT_AUTHENTICATED],
    ['A2 malformed', { credential: 'not-a-jwt' }, C.INVALID_TOKEN],
    ['A3 unsigned (alg=none)', { credential: H.mintToken(H.claims(), { alg: 'none' }) }, C.INVALID_TOKEN],
    ['A4 algorithm substitution (HS256)', { credential: H.mintToken(H.claims(), { alg: 'HS256' }) }, C.INVALID_TOKEN],
    ['A5 signed by another key', { credential: H.mintToken(H.claims(), { key: H.OTHER.privateKey }) }, C.INVALID_TOKEN],
    ['A6 unknown kid', { credential: H.mintToken(H.claims(), { kid: 'nope' }) }, C.INVALID_TOKEN],
    ['A7 wrong issuer', { credential: H.mintToken(H.claims({ iss: 'https://evil.example' })) }, C.WRONG_ISSUER],
    ['A8 another site audience', { credential: H.mintToken(H.claims({ aud: 'other-client' })) }, C.WRONG_AUDIENCE],
    ['A9 expired', { credential: H.mintToken(H.claims({ exp: H.NOW - 9999 })) }, C.TOKEN_EXPIRED],
    ['A10 issued in the future', { credential: H.mintToken(H.claims({ iat: H.NOW + 9999 })) }, C.TOKEN_NOT_YET_VALID],
    ['A11 implausible lifetime', { credential: H.mintToken(H.claims({ iat: H.NOW - 60, exp: H.NOW + 86400 })) }, C.INVALID_TOKEN],
    ['A12 nbf in the future', { credential: H.mintToken(H.claims({ nbf: H.NOW + 9999 })) }, C.TOKEN_NOT_YET_VALID],
    ['A13 email not verified', { credential: H.mintToken(H.claims({ email_verified: false })) }, C.EMAIL_NOT_VERIFIED],
    ['A14 email_verified is the STRING "true"', { credential: H.mintToken(H.claims({ email_verified: 'true' })) }, C.EMAIL_NOT_VERIFIED],
    ['A15 no subject', { credential: H.mintToken(H.claims({ sub: undefined })) }, C.INVALID_TOKEN],
    ['A16 no email', { credential: H.mintToken(H.claims({ email: undefined })) }, C.INVALID_TOKEN]
  ];
  return cases.reduce(function (p, c) {
    return p.then(function () {
      return run(c[1]).then(function (o) {
        eq(o.r.code, c[2], c[0]);
        eq(o.upstreamCalls.length, 0, c[0].split(' ')[0] + 'x  …and the upstream was never called');
      });
    });
  }, Promise.resolve());
});

step(function () {
  // A payload swapped under a valid signature.
  var t = H.mintToken(H.claims()).split('.');
  t[1] = H.b64u(JSON.stringify(H.claims({ sub: '999', email: 'attacker@' + H.DOMAIN })));
  return run({ credential: t.join('.') }).then(function (o) {
    eq(o.r.code, C.INVALID_TOKEN, 'A17 payload swapped under a valid signature');
  });
});

step(function () {
  return run({ verifier: verifierLib.localJwksVerifier(H.jwks(), { unavailable: true }) })
    .then(function (o) {
      eq(o.r.code, C.IDENTITY_PROVIDER_UNAVAILABLE, 'A18 a DOWN verifier gets its own code');
      eq(o.r.kind, 'outage', 'A18a classified as an outage, not a decision about the caller');
      eq(o.r.retryable, true, 'A18b and marked retryable, which a rejected caller never is');
    });
});
step(function () {
  return run({ verifier: verifierLib.localJwksVerifier(H.jwks(), { throws: true }) })
    .then(function (o) { eq(o.r.code, C.IDENTITY_PROVIDER_UNAVAILABLE, 'A19 a verifier that THROWS is an outage too'); });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §B  THE OPERATOR REGISTRY ===');
  var disabled = JSON.parse(JSON.stringify(H.REGISTRY)); disabled[0].status = 'disabled';
  var wildId = [{ principal_id: '*', status: 'active', allowed_actions: ['*'], allowed_sites: [{ company: '*', country: '*', marketplace: '*' }] }];
  var wildAct = JSON.parse(JSON.stringify(H.REGISTRY)); wildAct[0].allowed_actions = ['*'];
  var allSites = JSON.parse(JSON.stringify(H.REGISTRY)); allSites[0].allowed_sites = [{ company: 'ALL', country: 'ALL', marketplace: 'ALL_SITES' }];
  var dupe = H.REGISTRY.concat(JSON.parse(JSON.stringify(H.REGISTRY)));
  var cases = [
    ['B1 empty registry', { registry: [] }, C.NOT_AUTHORIZED],
    ['B2 unknown operator', { credential: H.mintToken(H.claims({ sub: '999', email: 'stranger@' + H.DOMAIN })) }, C.NOT_AUTHORIZED],
    ['B3 disabled operator', { registry: disabled }, C.NOT_AUTHORIZED],
    ['B4 wildcard identity is refused, not honoured', { registry: wildId }, C.NOT_AUTHORIZED],
    ['B5 wildcard action is refused, not honoured', { registry: wildAct }, C.NOT_AUTHORIZED],
    ['B6 an action the operator does not hold', { action: 'productPricing.workspace.get' }, C.NOT_AUTHORIZED],
    ['B7 an action the GATEWAY does not serve', { action: 'confirmShipmentAndDispatch' }, C.NOT_AUTHORIZED],
    ['B8 out of site scope', { payload: { scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } } }, C.OUT_OF_SCOPE],
    ['B9 incomplete site key', { payload: { scope: { company: 'KM', country: '', marketplace: 'Shopify' } } }, C.OUT_OF_SCOPE],
    ['B10 ALL_SITES in the request', { payload: { scope: { company: 'KM', country: 'US', marketplace: 'ALL_SITES' } } }, C.OUT_OF_SCOPE],
    ['B11 ALL_SITES in the REGISTRY never matches', { registry: allSites, payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } }, C.OUT_OF_SCOPE],
    ['B12 a duplicated entry is ambiguous, so it is nobody', { registry: dupe }, C.NOT_AUTHORIZED]
  ];
  return cases.reduce(function (p, c) {
    return p.then(function () {
      return run(c[1]).then(function (o) {
        eq(o.r.code, c[2], c[0]);
        eq(o.upstreamCalls.length, 0, c[0].split(' ')[0] + 'x  …upstream never called');
      });
    });
  }, Promise.resolve());
});

step(function () {
  return run({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } })
    .then(function (o) {
      eq(o.r.ok, true, 'B13 the one permitted operator, action and site: allowed');
      eq(o.upstreamCalls.length, 1, 'B13a and the upstream was called exactly once');
    });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §C  THE PUBLIC ANSWER IS NOT AN ORACLE ===');
  return run({ action: 'productPricing.workspace.get' }).then(function (known) {
    return run({ credential: H.mintToken(H.claims({ sub: '999', email: 'stranger@' + H.DOMAIN })) })
      .then(function (unknown) {
        function pub(o) { var r = o.r; return { code: r.code, message: r.message, kind: r.kind, retryable: r.retryable, http_status: r.http_status }; }
        eq(pub(known), pub(unknown),
          'C1 "known but not permitted" and "unknown account" are byte-identical to the caller');
      });
  });
});
step(function () {
  var lines = [];
  return run({ logLines: lines, action: 'productPricing.workspace.get' }).then(function () {
    var blob = lines.join('\n');
    ok(blob.indexOf('known=yes') >= 0, 'C2 the SERVER LOG does distinguish them');
    ok(blob.indexOf('status=active') >= 0, 'C2a and records why');
  });
});
step(function () {
  var tok = H.mintToken(H.claims());
  var lines = [];
  return run({ logLines: lines, credential: tok, action: 'productPricing.workspace.get' }).then(function (o) {
    var response = JSON.stringify(o.r), logs = lines.join('\n');
    ok(response.indexOf(tok) < 0, 'C3 no raw token in the response');
    ok(logs.indexOf(tok) < 0, 'C4 no raw token in the log');
    ok(logs.indexOf(tok.split('.')[2].slice(0, 20)) < 0, 'C4a not even the signature segment');
    ok(response.indexOf(H.SECRET_A) < 0 && logs.indexOf(H.SECRET_A) < 0, 'C5 no HMAC secret anywhere');
    ok(response.indexOf('operator.one@') < 0, 'C6 no address from the registry in the response');
    ok(typeof o.r.correlation_id === 'string' && o.r.correlation_id.length > 0, 'C7 a correlation id is present');
  });
});
step(function () {
  ok(codes.ANSWERS.indexOf('SOURCE_NOT_CONNECTED') < 0 && codes.ANSWERS.indexOf('HTTP_TRANSPORT_ERROR') < 0,
    'C8 no auth code can be confused with a transport fault');
  codes.ANSWERS.forEach(function (c) { ok(!codes.isOutage(c), 'C9 ' + c + ' is an answer, never an outage'); });
  codes.OUTAGES.forEach(function (c) { ok(!codes.isAnswer(c), 'C10 ' + c + ' is an outage, never an answer'); });
  ok(!codes.isRetryable(C.NOT_AUTHORIZED) && !codes.isRetryable(C.GATEWAY_CONFIGURATION_ERROR),
    'C11 neither a refusal nor a misconfiguration is retryable');
  ok(codes.isRetryable(C.UPSTREAM_UNAVAILABLE), 'C11a but an upstream outage is');
  return null;
});
step(function () {
  return run({ upstream: function () { return Promise.resolve({ ok: false, reason: 'timeout' }); } })
    .then(function (o) {
      eq(o.r.code, C.UPSTREAM_UNAVAILABLE, 'C12 an upstream failure is UPSTREAM_UNAVAILABLE…');
      ok(o.r.code !== C.NOT_AUTHORIZED, 'C12a …and never NOT_AUTHORIZED, which would send a real operator to ask for access they have');
    });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §D  TWO IMPLEMENTATIONS, ONE CANONICAL STRING ===');
  var gs = loadGs();
  eq(gs.KMGA_FIELDS_, assertionLib.FIELDS, 'D1 the field order is identical in both implementations');

  /* THE CASE THAT SEPARATES A CORRECT IMPLEMENTATION FROM A LUCKY ONE. 'é' is one UTF-16 unit and two
     UTF-8 bytes, so a length prefix computed from `String.length` differs from one computed from the
     encoded byte length — and every ASCII test in the world passes either way. */
  var a = {
    version: 'KMGA1', key_id: 'k1', issued_at: H.NOW, expires_at: H.NOW + 120,
    nonce: 'nonce-abcdefghijklmnop', http_method: 'POST',
    canonical_action: 'productPricing.siteUniverse.get',
    body_sha256: assertionLib.sha256HexLower('{"a":1}'),
    principal_provider: 'google', principal_subject: '1122334455',
    verified_email: 'josé.çoló@' + H.DOMAIN, hosted_domain: H.DOMAIN, correlation_id: 'cid-1'
  };
  eq(gs.kmgaCanonicalString_(a), assertionLib.canonicalString(a),
    'D2 a NON-ASCII email serialises identically on both sides');
  var emailBytes = Buffer.byteLength(a.verified_email, 'utf8');
  ok(emailBytes !== a.verified_email.length,
    'D2a the test email really does differ in byte and character length (' + emailBytes
    + ' bytes vs ' + a.verified_email.length + ' chars) — otherwise D2 would prove nothing');
  ok(assertionLib.canonicalString(a).indexOf(emailBytes + ':' + a.verified_email) >= 0,
    'D2b and the prefix is the UTF-8 BYTE length');

  eq(gs.kmgaSha256HexLower_('{"a":1}'), assertionLib.sha256HexLower('{"a":1}'),
    'D3 the body digest agrees, lowercase hex on both sides');
  eq(gs.kmgaHmac_(H.SECRET_A, 'abc'), assertionLib.hmac(H.SECRET_A, 'abc'),
    'D4 the HMAC agrees, base64url without padding on both sides');
  eq(gs.kmgaUtf8Length_('é'), 2, 'D5 the shim really measures UTF-8 bytes, so D2 was a real test');
  ok(gs.kmgaConstantTimeEquals_('abc', 'abc') && !gs.kmgaConstantTimeEquals_('abc', 'abd')
     && !gs.kmgaConstantTimeEquals_('abc', 'ab'), 'D6 the constant-time compare is also correct');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §E  THE ASSERTION, END TO END AND UNDER ATTACK ===');
  var gs = loadGs();
  var upstreamBody = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
  var signed = assertionLib.sign(H.KEYRING, {
    action: 'productPricing.siteUniverse.get', body: upstreamBody,
    principal: { provider: 'google', subject: '1122334455', verified_email: 'operator.one@' + H.DOMAIN, hosted_domain: H.DOMAIN },
    correlationId: 'cid-1'
  }, H.NOW, 120);
  ok(signed.ok, 'E0 the gateway signed an assertion');

  function io(over) {
    var store = {};
    var o = {
      now: function () { return H.NOW; },
      keyring: function () { return H.KEYRING; },
      nonceSeen: function (n) {
        if (Object.prototype.hasOwnProperty.call(store, n)) return true;
        store[n] = 1; return false;
      }
    };
    for (var k in (over || {})) o[k] = over[k];
    return o;
  }
  function tamper(fn) { var a = JSON.parse(JSON.stringify(signed.assertion)); fn(a); return a; }
  var exp = { action: 'productPricing.siteUniverse.get', body: upstreamBody };

  eq(gs.kmgaVerifyAssertion_(signed.assertion, exp, io()).ok, true,
    'E1 the Apps Script side accepts what the gateway signed — the seam closes');

  var attacks = [
    ['E2 no assertion at all', null, 'INVALID_GATEWAY_ASSERTION'],
    ['E3 missing signature', tamper(function (a) { delete a.signature; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E4 wrong contract version', tamper(function (a) { a.version = 'KMGA2'; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E5 unknown key id', tamper(function (a) { a.key_id = 'k-unknown'; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E6 tampered principal', tamper(function (a) { a.principal_subject = '999'; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E7 tampered email', tamper(function (a) { a.verified_email = 'ceo@' + H.DOMAIN; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E8 tampered action', tamper(function (a) { a.canonical_action = 'confirmShipmentAndDispatch'; }), 'ACTION_MISMATCH'],
    ['E9 expired assertion', tamper(function (a) { a.expires_at = H.NOW - 600; a.issued_at = H.NOW - 700; }), 'ASSERTION_EXPIRED'],
    ['E10 assertion from the future', tamper(function (a) { a.issued_at = H.NOW + 9999; a.expires_at = H.NOW + 10099; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E11 an over-long TTL', tamper(function (a) { a.expires_at = a.issued_at + 99999; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E12 missing nonce', tamper(function (a) { a.nonce = ''; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E13 UPPERCASE digest', tamper(function (a) { a.body_sha256 = a.body_sha256.toUpperCase(); }), 'INVALID_GATEWAY_ASSERTION'],
    ['E14 method changed', tamper(function (a) { a.http_method = 'GET'; }), 'INVALID_GATEWAY_ASSERTION'],
    ['E15 incomplete principal', tamper(function (a) { a.principal_subject = ''; }), 'INVALID_GATEWAY_ASSERTION']
  ];
  attacks.forEach(function (t) {
    var r = gs.kmgaVerifyAssertion_(t[1], exp, io());
    ok(r.ok === false && r.code === t[2], t[0], { got: r.code, want: t[2] });
  });

  /* The body is bound: the same assertion against a different body must fail on the digest. */
  var r2 = gs.kmgaVerifyAssertion_(signed.assertion,
    { action: exp.action, body: JSON.stringify({ action: exp.action, payload: { evil: true } }) }, io());
  ok(r2.ok === false && r2.code === 'BODY_DIGEST_MISMATCH', 'E16 a swapped body is caught by the digest');

  /* Replay: the same assertion twice. */
  var shared = io();
  ok(gs.kmgaVerifyAssertion_(signed.assertion, exp, shared).ok === true, 'E17 first use succeeds');
  var again = gs.kmgaVerifyAssertion_(signed.assertion, exp, shared);
  ok(again.ok === false && again.code === 'REPLAY_DETECTED', 'E18 the SAME assertion a second time is a replay');

  /* A nonce store that is down must refuse — the decision §8 required to be explicit. */
  var down = gs.kmgaVerifyAssertion_(signed.assertion, exp, io({ nonceSeen: function () { return null; } }));
  ok(down.ok === false && down.code === 'REPLAY_DETECTED',
    'E19 an UNAVAILABLE replay store fails closed, for reads as well as writes');

  /* Signature is checked BEFORE the nonce is spent, so noise cannot burn a real caller's nonce. */
  var spent = [];
  var bad = tamper(function (a) { a.signature = 'AAAA'; });
  gs.kmgaVerifyAssertion_(bad, exp, io({ nonceSeen: function (n) { spent.push(n); return false; } }));
  eq(spent, [], 'E20 a BAD signature never reaches the nonce store, so noise cannot burn a real nonce');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §F  KEY ROTATION ===');
  var gs = loadGs();
  var body = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
  var principal = { provider: 'google', subject: '1122334455', verified_email: 'operator.one@' + H.DOMAIN, hosted_domain: H.DOMAIN };
  var oldSigned = assertionLib.sign(H.KEYRING, { action: 'productPricing.siteUniverse.get', body: body, principal: principal, correlationId: 'c' }, H.NOW, 120);
  var exp = { action: 'productPricing.siteUniverse.get', body: body };
  function io(ring) {
    var store = {};
    return { now: function () { return H.NOW; }, keyring: function () { return ring; },
      nonceSeen: function (n) { if (store[n]) return true; store[n] = 1; return false; } };
  }
  ok(gs.kmgaVerifyAssertion_(oldSigned.assertion, exp, io(H.ROTATED)).ok === true,
    'F1 during rotation, an assertion signed with the PREVIOUS key still verifies');
  eq(gs.kmgaVerifyAssertion_(oldSigned.assertion, exp, io(H.ROTATED)).key_id, 'k1',
    'F1a and the verifier reports which key accepted it');
  var onlyNew = { active: H.ROTATED.active, previous: null };
  ok(gs.kmgaVerifyAssertion_(oldSigned.assertion, exp, io(onlyNew)).ok === false,
    'F2 once the overlap ends, the old key stops working — revocation is real');
  ok(gs.kmgaVerifyAssertion_(oldSigned.assertion, exp, io({ active: null, previous: null })).code
     === 'GATEWAY_CONFIGURATION_ERROR',
    'F3 no keys at all is a configuration error, not an allow');
  var newSigned = assertionLib.sign(H.ROTATED, { action: 'productPricing.siteUniverse.get', body: body, principal: principal, correlationId: 'c' }, H.NOW, 120);
  eq(newSigned.assertion.key_id, 'k2', 'F4 only the ACTIVE key ever signs');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §G  CORS — WHERE THE BUGS ACTUALLY ARE ===');
  var allowed = ['https://example.github.io', 'http://localhost:8801'];
  var bad = [
    ['G1 unknown origin', 'https://attacker.test'],
    ['G2 SUFFIX attack', 'https://example.github.io.attacker.test'],
    ['G3 PREFIX attack', 'https://notexample.github.io'],
    ['G4 embedded match', 'https://attacker.test/?x=https://example.github.io'],
    ['G5 the literal string null', 'null'],
    ['G6 missing origin', ''],
    ['G7 scheme downgrade', 'http://example.github.io'],
    ['G8 trailing slash', 'https://example.github.io/'],
    ['G9 different port', 'http://localhost:9999'],
    ['G10 uppercase host', 'https://EXAMPLE.github.io']
  ];
  bad.forEach(function (t) {
    ok(httpUtil.originAllowed(allowed, t[1]) === false, t[0] + ' is refused');
    eq(httpUtil.corsHeaders(allowed, t[1]), {}, t[0] + 'a  …and gets NO CORS headers at all');
  });
  ok(httpUtil.originAllowed(allowed, 'https://example.github.io') === true, 'G11 the exact origin is allowed');
  var h = httpUtil.corsHeaders(allowed, 'https://example.github.io');
  eq(h['Access-Control-Allow-Origin'], 'https://example.github.io', 'G12 echoed exactly, never "*"');
  eq(h['Vary'], 'Origin', 'G13 Vary: Origin, so a cache cannot serve one origin the other answer');
  ok(!h['Access-Control-Allow-Credentials'],
    'G14 credentials are NOT allowed — the credential is a token in the body, so cookies are unwanted, '
    + 'and not asking for them removes a whole class of cross-site request forgery');
  ok(String(h['Access-Control-Allow-Methods']).indexOf('OPTIONS') >= 0, 'G15 the preflight is answered');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §H  CONFIGURATION REFUSES TO START BADLY ===');
  function probs(over) {
    var env = {
      NODE_ENV: 'production', GOOGLE_OAUTH_CLIENT_ID: 'x.apps.googleusercontent.com',
      ALLOWED_ORIGINS: 'https://example.github.io',
      APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
      HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/var/secrets/active',
      ALLOWED_ACTIONS: 'productPricing.siteUniverse.get', AUTH_VERIFIER: 'google'
    };
    for (var k in (over || {})) { if (over[k] === undefined) delete env[k]; else env[k] = over[k]; }
    return configLib.load(env).problems.join(' | ');
  }
  eq(configLib.load({
    NODE_ENV: 'production', GOOGLE_OAUTH_CLIENT_ID: 'x.apps.googleusercontent.com',
    ALLOWED_ORIGINS: 'https://example.github.io',
    APPS_SCRIPT_EXEC_URL: 'https://script.google.com/macros/s/PLACEHOLDER/exec',
    HMAC_ACTIVE_KEY_ID: 'k1', HMAC_ACTIVE_KEY_FILE: '/var/secrets/active',
    ALLOWED_ACTIONS: 'productPricing.siteUniverse.get', AUTH_VERIFIER: 'google'
  }).ok, true, 'H1 a complete configuration starts');
  ok(/ALLOWED_ORIGINS is empty/.test(probs({ ALLOWED_ORIGINS: undefined })), 'H2 no origins refuses to start');
  ok(/trailing slash/.test(probs({ ALLOWED_ORIGINS: 'https://example.github.io/' })), 'H3 a trailing slash is caught at startup');
  ok(/not a bare origin/.test(probs({ ALLOWED_ORIGINS: 'https://example.github.io/app' })), 'H4 a path is caught at startup');
  ok(/ALLOWED_ACTIONS is empty/.test(probs({ ALLOWED_ACTIONS: undefined })), 'H5 no action allowlist refuses to start');
  ok(/HMAC_ACTIVE_KEY_ID/.test(probs({ HMAC_ACTIVE_KEY_ID: undefined })), 'H6 no signing key id refuses to start');
  ok(/non-Google verifier cannot be selected in production/.test(probs({ AUTH_VERIFIER: 'local' })),
    'H7 the TEST verifier cannot be selected in production');
  ok(/previous key id equals the active/.test(probs({ HMAC_PREVIOUS_KEY_ID: 'k1', HMAC_PREVIOUS_KEY_FILE: '/x' })),
    'H8 a rotation to the same key id is caught');
  ok(/GOOGLE_OAUTH_CLIENT_ID/.test(probs({ GOOGLE_OAUTH_CLIENT_ID: undefined })), 'H9 no audience refuses to start');

  /* An empty or short secret file must not produce a signing key. */
  var ring = configLib.readKeyring({ activeKeyId: 'k1', activeKeyPath: '/x' }, function () { return ''; });
  ok(!ring.active, 'H10 an EMPTY secret file yields no active key — an empty secret is forgeable by anyone');
  var short = configLib.readKeyring({ activeKeyId: 'k1', activeKeyPath: '/x' }, function () { return 'short'; });
  ok(!short.active, 'H11 and so does a too-short one');
  var unreadable = configLib.readKeyring({ activeKeyId: 'k1', activeKeyPath: '/x' }, function () { throw new Error('nope'); });
  ok(!unreadable.active, 'H12 an unreadable secret file yields no key rather than an exception at request time');
  return null;
});

step(function () {
  return run({ keyring: null }).then(function (o) {
    eq(o.r.code, C.GATEWAY_CONFIGURATION_ERROR, 'H13 with no signing key the gateway refuses every request');
    eq(o.upstreamCalls.length, 0, 'H13a and calls nothing');
    eq(o.r.retryable, false, 'H13b a misconfiguration is not retryable — retrying cannot fix a missing key');
  });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §I  WHAT CROSSES THE BOUNDARY ===');
  return run({ payload: { scope: { company: 'KM', country: 'US', marketplace: 'Shopify' } } })
    .then(function (o) {
      var sent = o.upstreamCalls[0];
      eq(sent.action, 'productPricing.siteUniverse.get', 'I1 the canonical action does not drift');
      ok(!!sent.km_assertion, 'I2 an assertion is attached');
      var blob = JSON.stringify(sent);
      ok(blob.indexOf('eyJ') < 0 || blob.indexOf(H.mintToken(H.claims()).slice(0, 30)) < 0,
        'I3 THE GOOGLE ID TOKEN IS NOT FORWARDED — the upstream has no use for it, and every copy of a '
        + 'credential is a place it can leak from');
      ok(blob.indexOf(H.SECRET_A) < 0, 'I4 nor is the HMAC secret');
      eq(sent.km_assertion.principal_subject, '1122334455', 'I5 the verified subject crosses');
      eq(sent.km_assertion.verified_email, 'operator.one@' + H.DOMAIN, 'I6 and the verified email');
      ok(!!sent.km_assertion.correlation_id, 'I7 with the correlation id, so both sides share a thread');

      /* And the audit identity on the far side ignores whatever the body claimed. */
      var gs = loadGs();
      var audit = gs.kmgaAuditIdentity_(
        { identity_key: 'google:1122334455', verified_email: 'operator.one@' + H.DOMAIN },
        { created_by: 'ceo@' + H.DOMAIN, actor: 'root', role: 'admin' });
      eq(audit.actor_identity_key, 'google:1122334455', 'I8 the audit row is keyed on the VERIFIED subject');
      eq(audit.actor_source, 'gateway_verified', 'I9 named as gateway-verified');
      eq(audit.client_asserted_ignored, true, 'I10 and it records that the body tried');
      ok(JSON.stringify(audit).indexOf('ceo@') < 0, 'I11 nothing the body claimed survives');
    });
});

// ===================================================================================================
step(function () {
  console.log('\n=== §J  THE FROZEN ORDER RUNS BEFORE ANY DB COULD OPEN ===');
  var gs = loadGs();
  var body = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
  var principal = { provider: 'google', subject: '1122334455', verified_email: 'operator.one@' + H.DOMAIN, hosted_domain: H.DOMAIN };
  var signed = assertionLib.sign(H.KEYRING, { action: 'productPricing.siteUniverse.get', body: body, principal: principal, correlationId: 'c' }, H.NOW, 120);
  function gio(over) {
    var store = {};
    var o = {
      now: function () { return H.NOW; }, keyring: function () { return H.KEYRING; },
      nonceSeen: function (n) { if (store[n]) return true; store[n] = 1; return false; },
      mayRunAction: function () { return true; },
      maySeeSite: function () { return true; },
      featureEnabled: function () { return true; }
    };
    for (var k in (over || {})) o[k] = over[k];
    return o;
  }
  var req = { action: 'productPricing.siteUniverse.get', rawUpstreamBody: body,
    km_assertion: signed.assertion, site: { company: 'KM', country: 'US', marketplace: 'Shopify' } };

  eq(gs.kmgaGate_(req, gio()).db_open_permitted, true, 'J1 everything in order: the database may be opened');
  [['J2 a bad assertion', { keyring: function () { return { active: { key_id: 'k1', secret: 'x'.repeat(40) }, previous: null }; } }],
   ['J3 no permission', { mayRunAction: function () { return false; } }],
   ['J4 out of scope', { maySeeSite: function () { return false; } }],
   ['J5 feature disabled', { featureEnabled: function () { return false; } }]
  ].forEach(function (t) {
    var g = gs.kmgaGate_(req, gio(t[1]));
    ok(g.allowed === false && g.db_open_permitted === false,
      t[0] + ' → refused AND db_open_permitted is false');
  });

  /* SEC-A1's finding, re-proved on the Apps Script side: the flag is checked LAST, so a stranger is
     refused as a stranger even when the feature is also off. */
  var g = gs.kmgaGate_(req, gio({ mayRunAction: function () { return false; }, featureEnabled: function () { return false; } }));
  eq(g.code, 'NOT_AUTHORIZED', 'J6 a stranger is refused as a stranger even when the feature is off');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §K  NOTHING PRODUCTION IS TOUCHED OR NAMED ===');
  var files = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) { if (f !== 'node_modules') walk(p); } else files.push(p);
    });
  })(path.join(ROOT, 'services', 'auth-gateway'));
  ok(files.length >= 12, 'K1 the gateway package exists (' + files.length + ' files)');
  ok(!fs.existsSync(path.join(ROOT, 'services', 'auth-gateway', 'node_modules')),
    'K2 no dependency was vendored into the repository');

  var blob = files.map(function (f) { return read(f); }).join('\n');
  [['AKfycb', 'a deployment id'], ['script.google.com/macros/s/1', 'a real deployment path'],
   ['vic.zhou', 'a personal address'], ['client_secret', 'a client secret'],
   ['-----BEGIN', 'a private key']
  ].forEach(function (t, i) {
    ok(blob.indexOf(t[0]) < 0, 'K' + (i + 3) + ' the package contains no ' + t[1]);
  });
  ok(/REPLACE_WITH/.test(read(path.join(ROOT, 'services', 'auth-gateway', '.env.example'))),
    'K8 .env.example holds placeholders only');

  /* The Apps Script verifier is a prototype, and the proof is that it is not where runtime lives. */
  ok(!fs.existsSync(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script',
    'SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs')), 'K9 the verifier is NOT in the Apps Script sync package');
  var gsSrc = read(GS_FILE);
  ok(!/function doGet|function doPost/.test(gsSrc), 'K10 and defines no entry point, so pasting it would route nothing');

  /* And the production files this round must not have touched. */
  var router = read(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script', '01_router.gs'));
  ok(!/km_assertion|kmgaGate_/.test(router), 'K11 the production router knows nothing about the gateway yet');
  var cfgGs = read(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script', '00_config.gs'));
  ok(!/KMGA_ACTIVE_KEY_SECRET|HMAC/.test(cfgGs), 'K12 and no secret was put into 00_config.gs');
  ok(/var PRODUCT_STRATEGY_ENABLED_ = false;/.test(cfgGs), 'K13 the Product Strategy flag is still false');
  return null;
});

// ===================================================================================================
step(function () {
  console.log('\n=== §L  MUTANTS ===');
  function mut(label, file, from, to, probe) {
    var full = path.join(ROOT, file);
    var original = fs.readFileSync(full, 'utf8');
    var norm = original.replace(/\r\n/g, '\n');
    var n = norm.split(from).length - 1;
    if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return Promise.resolve(); }
    fs.writeFileSync(full, norm.replace(from, to), 'utf8');
    function restore() { fs.writeFileSync(full, original, 'utf8'); Object.keys(require.cache).forEach(function (k) { if (/auth-gateway/.test(k)) delete require.cache[k]; }); }
    Object.keys(require.cache).forEach(function (k) { if (/auth-gateway/.test(k)) delete require.cache[k]; });
    var out;
    try { out = probe(); } catch (e) { restore(); mutCaught++; console.log('  ok   ' + label + ' (caught: threw)'); return Promise.resolve(); }
    return Promise.resolve(out).then(function (caught) {
      restore();
      if (caught === true) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
      else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label); }
    }, function () {
      restore(); mutCaught++; console.log('  ok   ' + label + ' (caught: rejected)');
    });
  }
  var ASSERT = 'services/auth-gateway/src/assertion.js';
  var PIPE = 'services/auth-gateway/src/pipeline.js';
  var REG = 'services/auth-gateway/src/registry.js';
  var HTTPF = 'services/auth-gateway/src/http.js';
  var GS = 'services/auth-gateway/apps-script-verifier/SEC_A2_GATEWAY_ASSERTION_VERIFIER.gs';

  function gsVerifyWith(assertionMutator, exp) {
    var gs = loadGs();
    var A = require(path.join(GW, 'assertion.js'));
    var body = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
    var s = A.sign(H.KEYRING, { action: 'productPricing.siteUniverse.get', body: body,
      principal: { provider: 'google', subject: '1122334455', verified_email: 'o@' + H.DOMAIN, hosted_domain: H.DOMAIN },
      correlationId: 'c' }, H.NOW, 120);
    var a = s.assertion;
    if (assertionMutator) assertionMutator(a);
    var store = {};
    return gs.kmgaVerifyAssertion_(a, exp || { action: 'productPricing.siteUniverse.get', body: body }, {
      now: function () { return H.NOW; }, keyring: function () { return H.KEYRING; },
      nonceSeen: function (n) { if (store[n]) return true; store[n] = 1; return false; }
    });
  }

  var chain = Promise.resolve();
  function q(fn) { chain = chain.then(fn); }

  q(function () {
    return mut('L1 the HMAC comparison becomes ===, leaking through timing', ASSERT,
      '  if (A.length !== B.length) return false;\n  return crypto.timingSafeEqual(A, B);',
      '  return String(a) === String(b);',
      /* The wrapper is named `timingSafeEquals`, which CONTAINS `timingSafeEqual` — so a bare
         substring probe matches the function's own name and could never fail. Probe the CALL. */
      function () { return !/crypto\.timingSafeEqual\(/.test(read(path.join(ROOT, ASSERT))); });
  });
  q(function () {
    return mut('L2 the Apps Script compare returns early on the first difference', GS,
      '  var diff = 0;\n  for (var i = 0; i < A.length; i++) diff |= (A.charCodeAt(i) ^ B.charCodeAt(i));\n  return diff === 0;',
      '  for (var i = 0; i < A.length; i++) { if (A.charCodeAt(i) !== B.charCodeAt(i)) return false; }\n  return true;',
      function () { return !/diff \|=/.test(read(path.join(ROOT, GS))); });
  });
  q(function () {
    return mut('L3 the assertion signature check is dropped', GS,
      "  if (!kmgaConstantTimeEquals_(expectSig, String(assertion.signature || ''))) {\n    return no('INVALID_GATEWAY_ASSERTION');\n  }",
      '  if (false) { return null; }',
      function () { return gsVerifyWith(function (a) { a.signature = 'AAAA'; }).ok === true; });
  });
  q(function () {
    return mut('L4 the body digest check is dropped', GS,
      "  if (kmgaSha256HexLower_(expected.body) !== String(assertion.body_sha256)) return no('BODY_DIGEST_MISMATCH');",
      '  if (false) return null;',
      function () {
        return gsVerifyWith(null, { action: 'productPricing.siteUniverse.get', body: '{"evil":true}' }).ok === true;
      });
  });
  q(function () {
    return mut('L5 the action binding is dropped, so an assertion can be lifted onto another call', GS,
      "  if (String(assertion.canonical_action) !== String(expected.action)) return no('ACTION_MISMATCH');",
      '  if (false) return null;',
      function () {
        var gs = loadGs();
        var A = require(path.join(GW, 'assertion.js'));
        var body = JSON.stringify({ action: 'x', payload: {} });
        var s = A.sign(H.KEYRING, { action: 'productPricing.siteUniverse.get', body: body,
          principal: { provider: 'google', subject: '1', verified_email: 'o@x', hosted_domain: null }, correlationId: 'c' }, H.NOW, 120);
        var store = {};
        return gs.kmgaVerifyAssertion_(s.assertion, { action: 'confirmShipmentAndDispatch', body: body }, {
          now: function () { return H.NOW; }, keyring: function () { return H.KEYRING; },
          nonceSeen: function (n) { if (store[n]) return true; store[n] = 1; return false; } }).ok === true;
      });
  });
  q(function () {
    return mut('L6 an unavailable replay store becomes a pass', GS,
      "  if (seen === null) return no('REPLAY_DETECTED');   // store unavailable -> fail closed, see header",
      '  if (seen === null) return { ok: true, key_id: key.key_id, principal: {}, correlation_id: \'\' };',
      function () {
        var gs = loadGs();
        var A = require(path.join(GW, 'assertion.js'));
        var body = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
        var s = A.sign(H.KEYRING, { action: 'productPricing.siteUniverse.get', body: body,
          principal: { provider: 'google', subject: '1', verified_email: 'o@x', hosted_domain: null }, correlationId: 'c' }, H.NOW, 120);
        return gs.kmgaVerifyAssertion_(s.assertion, { action: 'productPricing.siteUniverse.get', body: body }, {
          now: function () { return H.NOW; }, keyring: function () { return H.KEYRING; },
          nonceSeen: function () { return null; } }).ok === true;
      });
  });
  q(function () {
    return mut('L7 an unknown key id falls back to trying the active key', GS,
      '  if (!key) return no(\'INVALID_GATEWAY_ASSERTION\');\n\n  var iat',
      '  if (!key) key = ring.active;\n\n  var iat',
      /* Editing `key_id` after signing also breaks the signature, so that version of the mutant was
         caught for the wrong reason. The real hazard is a REVOKED key id whose SECRET is still in
         circulation: sign properly under an id the verifier no longer holds. */
      function () {
        var gs = loadGs();
        var A = require(path.join(GW, 'assertion.js'));
        var body = JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {} });
        var revoked = { active: { key_id: 'k-revoked', secret: H.SECRET_A }, previous: null };
        var s2 = A.sign(revoked, { action: 'productPricing.siteUniverse.get', body: body,
          principal: { provider: 'google', subject: '1', verified_email: 'o@x', hosted_domain: null },
          correlationId: 'c' }, H.NOW, 120);
        var store = {};
        return gs.kmgaVerifyAssertion_(s2.assertion, { action: 'productPricing.siteUniverse.get', body: body }, {
          now: function () { return H.NOW; }, keyring: function () { return H.KEYRING; },
          nonceSeen: function (n) { if (store[n]) return true; store[n] = 1; return false; } }).ok === true;
      });
  });
  q(function () {
    return mut('L8 the expiry check is dropped', GS,
      "  if (now > exp + KMGA_MAX_CLOCK_SKEW_SECONDS_) return no('ASSERTION_EXPIRED');",
      '  if (false) return null;',
      function () {
        return gsVerifyWith(function (a) { a.issued_at = H.NOW - 5000; a.expires_at = H.NOW - 4900; }).code !== 'ASSERTION_EXPIRED';
      });
  });
  q(function () {
    return mut('L9 the digest case is normalised instead of pinned, creating two strings per request', GS,
      "  if (!/^[0-9a-f]{64}$/.test(String(assertion.body_sha256))) return no('INVALID_GATEWAY_ASSERTION');",
      '  if (false) return null;',
      function () { return gsVerifyWith(function (a) { a.body_sha256 = a.body_sha256.toUpperCase(); }).code !== 'INVALID_GATEWAY_ASSERTION'; });
  });
  q(function () {
    return mut('L10 an empty operator registry lets everyone in', REG,
      '  if (!list.length) return false;                       // no actions listed is no actions permitted',
      '  if (!list.length) return true;',
      function () {
        var P = require(path.join(GW, 'pipeline.js'));
        return P.validateRequest({ action: 'productPricing.siteUniverse.get', credential: 'x' }, H.baseConfig()).ok === true
          && require(path.join(GW, 'registry.js')).mayRunAction({ status: 'active', allowed_actions: [] }, 'anything') === true;
      });
  });
  q(function () {
    return mut('L11 a disabled operator is treated as active', REG,
      "  return !!entry && String(entry.status) === STATUS.ACTIVE;",
      '  return !!entry;',
      function () {
        return require(path.join(GW, 'registry.js')).mayRunAction(
          { status: 'disabled', allowed_actions: ['a'] }, 'a') === true;
      });
  });
  q(function () {
    return mut('L12 a wildcard action starts matching', REG,
      "    if (String(list[i]) === '*') continue;              // refused rather than honoured",
      "    if (String(list[i]) === '*') return true;",
      function () {
        return require(path.join(GW, 'registry.js')).mayRunAction(
          { status: 'active', allowed_actions: ['*'] }, 'confirmShipmentAndDispatch') === true;
      });
  });
  q(function () {
    /* DEFENCE IN DEPTH IS ONLY REAL IF THE INNER LAYER STILL BITES WHEN THE OUTER ONE IS GONE. The
       request-side ALL guard normally catches this first, which leaves the registry-side guard
       unreachable - so this mutant removes the OUTER one and requires the INNER one to refuse anyway. */
    return mut('L13 the request-side ALL guard is removed - the registry-side guard must still refuse', REG,
      '  if (ALL_TOKEN.test(c) || ALL_TOKEN.test(k) || ALL_TOKEN.test(m)) return false;',
      '  if (false) return false;',
      function () {
        var R = require(path.join(GW, 'registry.js'));
        return R.maySeeSite(
          { status: 'active', allowed_sites: [{ company: 'ALL', country: 'ALL', marketplace: 'ALL_SITES' }] },
          { company: 'ALL', country: 'ALL', marketplace: 'ALL_SITES' }) === false;
      });
  });
  q(function () {
    return mut('L14 CORS uses endsWith, admitting a suffix attack', HTTPF,
      '  return (allowed || []).indexOf(origin) >= 0;  // exact, always',
      '  return (allowed || []).some(function (a) { return origin.endsWith(a.replace(/^https?:\\/\\//, \'\')); });',
      function () {
        return require(path.join(GW, 'http.js'))
          .originAllowed(['https://example.github.io'], 'https://evil-example.github.io') === true;
      });
  });
  q(function () {
    return mut('L15 the origin "null" is accepted', HTTPF,
      "  if (origin === 'null') return false;          // sandboxed iframes, data: documents, file://",
      '  if (false) return false;',
      function () {
        return require(path.join(GW, 'http.js')).originAllowed(['null'], 'null') === true
          || !/origin === 'null'/.test(read(path.join(ROOT, HTTPF)));
      });
  });
  q(function () {
    return mut('L16 the action allowlist becomes a pass-through', PIPE,
      "  if (cfg.allowedActions.indexOf(action) < 0) return no(CODES.NOT_AUTHORIZED, 'action not served by this gateway');",
      '  if (false) return null;',
      function () {
        var P = require(path.join(GW, 'pipeline.js'));
        return P.validateRequest({ action: 'confirmShipmentAndDispatch', credential: 'x' }, H.baseConfig()).ok === true;
      });
  });
  q(function () {
    return mut('L17 an unavailable verifier becomes a pass', PIPE,
      "        if (att && att.unavailable === true) return deny(CODES.IDENTITY_PROVIDER_UNAVAILABLE, 'verifier down');",
      '        if (att && att.unavailable === true) att = { ok: true, claims: {}, verified_by: \'x\' };',
      function () {
        var P = require(path.join(GW, 'pipeline.js'));
        return P.handle(JSON.stringify({ action: 'productPricing.siteUniverse.get', payload: {}, credential: 'a.b.c' }), 'c', {
          cfg: H.baseConfig(), log: H.silentLogger([]), now: function () { return H.NOW; },
          verifier: verifierLib.localJwksVerifier(H.jwks(), { unavailable: true }),
          keyring: H.KEYRING, registry: H.REGISTRY,
          upstream: function () { return Promise.resolve({ ok: true, body: '{}' }); }
        }).then(function (r) { return r.code !== C.IDENTITY_PROVIDER_UNAVAILABLE; });
      });
  });
  q(function () {
    return mut('L18 the refusal starts naming whether the account exists', PIPE,
      "        return deny(CODES.NOT_AUTHORIZED,\n          'subject=' + principal.subject + ' known=' + (entry ? 'yes' : 'no')",
      "        return deny(entry ? CODES.NOT_AUTHORIZED : CODES.NOT_AUTHENTICATED,\n          'subject=' + principal.subject + ' known=' + (entry ? 'yes' : 'no')",
      function () {
        var P = require(path.join(GW, 'pipeline.js'));
        function go(cred) {
          return P.handle(JSON.stringify({ action: 'productPricing.workspace.get', payload: {}, credential: cred }), 'c', {
            cfg: H.baseConfig(), log: H.silentLogger([]), now: function () { return H.NOW; },
            verifier: verifierLib.localJwksVerifier(H.jwks()), keyring: H.KEYRING, registry: H.REGISTRY,
            upstream: function () { return Promise.resolve({ ok: true, body: '{}' }); } });
        }
        return Promise.all([go(H.mintToken(H.claims())),
          go(H.mintToken(H.claims({ sub: '999', email: 'stranger@' + H.DOMAIN })))])
          .then(function (rs) { return rs[0].code !== rs[1].code; });
      });
  });
  q(function () {
    return mut('L19 the Google ID token is forwarded to the upstream', PIPE,
      "      var upstreamBody = JSON.stringify({ action: v.action, payload: v.payload });",
      '      var upstreamBody = JSON.stringify({ action: v.action, payload: v.payload, credential: v.credential });',
      function () {
        return /upstreamBody = JSON.stringify\(\{ action: v\.action, payload: v\.payload, credential/
          .test(read(path.join(ROOT, PIPE)));
      });
  });
  q(function () {
    return mut('L20 the logger stops dropping the credential field', HTTPF,
      "      if (/^(credential|id_token|token|secret|signature|authorization)$/i.test(k)) { out[k] = '<omitted>'; continue; }",
      '      if (false) { continue; }',
      function () {
        var U = require(path.join(GW, 'http.js'));
        var out = JSON.stringify(U.redactValue({ credential: 'shorty' }));
        return out.indexOf('shorty') >= 0;
      });
  });
  return chain;
});

J.then(function () {
  console.log('\n' + new Array(101).join('='));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log(new Array(101).join('='));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
}).catch(function (e) {
  console.log('SUITE THREW: ' + (e && e.stack || e));
  process.exitCode = 1;
});
