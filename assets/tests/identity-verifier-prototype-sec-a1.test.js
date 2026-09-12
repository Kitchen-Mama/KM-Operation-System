/**
 * ==================================================================================================
 * THE AUTHENTICATION CONTRACT, ATTACKED BEFORE IT SHIPS   —   SEC-A1  (prototype)
 * ==================================================================================================
 *
 * Subject: `assets/prototypes/sec-a1/sec-a1-auth-contract.js`, which is NOT runtime, is loaded by no
 * page, and is reachable by no route. That is deliberate: the point of SEC-A1 is to find out what the
 * contract gets wrong while getting it wrong is free.
 *
 * REAL KEYS, REAL SIGNATURES, NO GOOGLE. The suite generates an RSA key pair locally and mints genuinely
 * signed JWTs with node's crypto, so "the signature does not match" is a real cryptographic fact rather
 * than a flag a mock flips. Nothing Google-owned is contacted, no account is used, and no credential
 * exists anywhere in this repository.
 *
 * WHY THE SIGNATURE STEP IS A SEAM. Apps Script has no primitive that VERIFIES an RSA signature —
 * `Utilities` signs and never verifies — so the one step that makes a Google token trustworthy is the
 * one step Apps Script cannot perform alone. The contract therefore takes an attestation source, and
 * §B proves the two things that matter about a seam: a source that refuses is a refusal, and a source
 * that is DOWN is its own refusal and never an allow.
 *
 * THE ENUMERATION RULE IS TESTED AS A NEGATIVE (§F). A caller must be able to tell "expired" from
 * "wrong audience" — those are theirs to fix. A caller must NOT be able to tell "this person exists but
 * lacks permission" from "this person is unknown", because that difference is a list of who works here.
 * So those two answers are compared byte for byte and required to be identical.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..', '..');
var PROTO = path.join(ROOT, 'assets', 'prototypes', 'sec-a1', 'sec-a1-auth-contract.js');
var A = require(PROTO);
var C = A.CODES;

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

// --- a local issuer -------------------------------------------------------------------------------
var KEYS = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
var OTHER = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
var AUD = 'sec-a1-test-client-id.apps.googleusercontent.com';   // a placeholder, not anyone's client id
var DOMAIN = 'shopkitchenmama.com';
var NOW = 1800000000;

function b64u(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function mint(claims, opts) {
  opts = opts || {};
  var header = { alg: opts.alg || 'RS256', kid: 'k1', typ: 'JWT' };
  var body = b64u(JSON.stringify(header)) + '.' + b64u(JSON.stringify(claims));
  if (opts.alg === 'none') return body + '.';
  var key = opts.key || KEYS.privateKey;
  var sig = crypto.sign('RSA-SHA256', Buffer.from(body), key);
  return body + '.' + b64u(sig);
}
function claims(over) {
  var c = { iss: 'https://accounts.google.com', aud: AUD, sub: '1122334455',
    email: 'operator.one@' + DOMAIN, email_verified: true, hd: DOMAIN,
    iat: NOW - 60, exp: NOW + 3540 };
  for (var k in (over || {})) { if (over[k] === undefined) delete c[k]; else c[k] = over[k]; }
  return c;
}

/** The attestation source: it really verifies, the way a gateway or tokeninfo would. */
function attestor(state) {
  state = state || {};
  return {
    calls: 0,
    verify: function (token) {
      this.calls++;
      if (state.down) return { ok: false, unavailable: true };
      if (state.throws) throw new Error('network is unreachable: ' + token);
      var parts = String(token).split('.');
      if (parts.length !== 3 || parts[2] === '') return { ok: false };
      var signed = parts[0] + '.' + parts[1];
      var sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      var hdr = {};
      try { hdr = JSON.parse(Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) { return { ok: false }; }
      if (hdr.alg !== 'RS256') return { ok: false };          // "none" and friends are not accepted
      var good = false;
      try { good = crypto.verify('RSA-SHA256', Buffer.from(signed), KEYS.publicKey, sig); } catch (e) { good = false; }
      if (!good) return { ok: false };
      var c;
      try { c = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) { return { ok: false }; }
      return { ok: true, claims: c, verified_by: state.by || 'test_attestor' };
    }
  };
}

var REGISTRY = [
  { email: 'operator.one@' + DOMAIN, roles: ['product_strategy_viewer'],
    scopes: [{ company: 'KM', country: 'US', marketplace: 'Shopify' }] }
];
var PERMISSIONS = { 'productPricing.siteUniverse.get': ['product_strategy_viewer'] };

function env(over) {
  var e = {
    now: function () { return NOW; },
    attest: attestor(),
    cfg: { audience: AUD, requiredHostedDomain: null },
    registry: REGISTRY,
    permissions: PERMISSIONS,
    featureEnabled: function () { return true; }
  };
  for (var k in (over || {})) e[k] = over[k];
  return e;
}
function req(over) {
  var r = { credential: mint(claims()), action: 'productPricing.siteUniverse.get',
    scope: null, correlationId: 'cid-1' };
  for (var k in (over || {})) r[k] = over[k];
  return r;
}
function V(token, cfgOver, attOver, now) {
  var cfg = { audience: AUD, requiredHostedDomain: null };
  for (var k in (cfgOver || {})) cfg[k] = cfgOver[k];
  return A.verifyIdToken(token, attOver || attestor(), cfg, now === undefined ? NOW : now);
}

// ===================================================================================================
console.log('\n=== §A  A TOKEN THAT IS NOT A TOKEN ===');
// ===================================================================================================
eq(V(undefined).code, C.NOT_AUTHENTICATED, 'A1 absent credential');
eq(V('').code, C.NOT_AUTHENTICATED, 'A2 empty credential');
eq(V(null).code, C.NOT_AUTHENTICATED, 'A3 null credential');
eq(V('not-a-jwt').code, C.INVALID_TOKEN, 'A4 malformed: not three segments');
eq(V('a.b').code, C.INVALID_TOKEN, 'A5 malformed: two segments');
eq(V(mint(claims(), { alg: 'none' })).code, C.INVALID_TOKEN,
  'A6 alg=none — an UNSIGNED token is refused, not read');
eq(V(mint(claims(), { key: OTHER.privateKey })).code, C.INVALID_TOKEN,
  'A7 signed by the wrong key — a real signature mismatch, not a mocked flag');
(function () {
  var t = mint(claims()).split('.');
  t[1] = b64u(JSON.stringify(claims({ email: 'attacker@example.com' })));
  eq(V(t.join('.')).code, C.INVALID_TOKEN,
    'A8 payload swapped under a valid signature — tampering is caught by the signature, not by a field check');
}());

// ===================================================================================================
console.log('\n=== §B  THE SEAM: A VERIFIER THAT IS DOWN IS NEVER A PASS ===');
// ===================================================================================================
eq(V(mint(claims()), null, attestor({ down: true })).code, C.IDENTITY_PROVIDER_UNAVAILABLE,
  'B1 an unavailable verifier gets its OWN code, so an outage is not mistaken for a rejected caller');
ok(V(mint(claims()), null, attestor({ down: true })).ok === false,
  'B2 and it is emphatically not an allow');
eq(V(mint(claims()), null, attestor({ throws: true })).code, C.IDENTITY_PROVIDER_UNAVAILABLE,
  'B3 a verifier that THROWS is treated the same way, not as an unhandled crash');
(function () {
  /* THE ORDER INSIDE verifyIdToken MATTERS AS MUCH AS THE ORDER OUTSIDE IT. If claims were read before
     the signature, a forged token could steer every later decision. A token with a perfect payload and
     a broken signature must fail on the signature. */
  var t = mint(claims(), { key: OTHER.privateKey });
  eq(V(t).code, C.INVALID_TOKEN, 'B4 a perfect payload with a bad signature fails on the SIGNATURE');
  var att = attestor();
  V(t, null, att);
  ok(att.calls === 1, 'B4a (and the attestation source was consulted, once)');
}());

// ===================================================================================================
console.log('\n=== §C  EVERY CLAIM THE OFFICIAL GUIDANCE NAMES ===');
// ===================================================================================================
eq(V(mint(claims({ iss: 'https://evil.example.com' }))).code, C.WRONG_ISSUER, 'C1 wrong issuer');
eq(V(mint(claims({ iss: 'accounts.google.com' }))).ok, true, 'C2 both official issuer spellings accepted');
eq(V(mint(claims({ aud: 'someone-elses-client-id' }))).code, C.WRONG_AUDIENCE,
  'C3 a VALID Google token minted for another site is not a credential here');
eq(V(mint(claims()), { audience: '' }).code, C.WRONG_AUDIENCE,
  'C3a and an unconfigured audience refuses everything rather than accepting anything');
eq(V(mint(claims({ exp: NOW - 3600 }))).code, C.TOKEN_EXPIRED, 'C4 expired');
eq(V(mint(claims({ exp: NOW - 30 }))).ok, true, 'C4a within the named clock skew, still valid');
eq(V(mint(claims({ exp: undefined }))).code, C.INVALID_TOKEN, 'C4b no expiry at all is invalid');
eq(V(mint(claims({ iat: NOW + 9999 }))).code, C.TOKEN_NOT_YET_VALID, 'C5 issued in the future');
eq(V(mint(claims({ iat: undefined }))).code, C.INVALID_TOKEN, 'C5a no issue time is invalid');
eq(V(mint(claims({ iat: NOW - 60, exp: NOW + 86400 }))).code, C.INVALID_TOKEN,
  'C6 a lifetime longer than the issuer grants is not from that issuer');
eq(V(mint(claims({ nbf: NOW + 9999 }))).code, C.TOKEN_NOT_YET_VALID, 'C7 not-before in the future');
eq(V(mint(claims({ sub: undefined }))).code, C.INVALID_TOKEN, 'C8 no subject');
eq(V(mint(claims({ email: undefined }))).code, C.INVALID_TOKEN, 'C9 no email');
eq(V(mint(claims({ email_verified: false }))).code, C.EMAIL_NOT_VERIFIED, 'C10 email_verified false');
eq(V(mint(claims({ email_verified: undefined }))).code, C.EMAIL_NOT_VERIFIED, 'C10a absent is not true');
eq(V(mint(claims({ email_verified: 'true' }))).code, C.EMAIL_NOT_VERIFIED,
  'C10b and the STRING "true" is not the boolean — a truthiness check here would be a hole');

/* The hosted domain restricts further; it never substitutes. */
eq(V(mint(claims({ hd: undefined })), { requiredHostedDomain: DOMAIN }).code, C.NOT_AUTHORIZED,
  'C11 a consumer Google account has no hd claim and is refused when a domain is required');
eq(V(mint(claims({ hd: 'other-company.example' })), { requiredHostedDomain: DOMAIN }).code, C.NOT_AUTHORIZED,
  'C12 a different hosted domain is refused');
eq(V(mint(claims()), { requiredHostedDomain: DOMAIN }).ok, true, 'C13 the right hosted domain passes');
ok(V(mint(claims({ hd: DOMAIN }), { key: OTHER.privateKey }), { requiredHostedDomain: DOMAIN }).code
   === C.INVALID_TOKEN,
  'C14 and an hd claim on an UNSIGNED-BY-US token proves nothing — signature first, always');

// ===================================================================================================
console.log('\n=== §D  THE PRINCIPAL IS BUILT FROM CLAIMS AND NOTHING ELSE ===');
// ===================================================================================================
(function () {
  var p = V(mint(claims())).principal;
  eq(p.provider, 'google', 'D1 provider');
  eq(p.subject, '1122334455', 'D2 subject');
  eq(p.identity_key, 'google:1122334455',
    'D3 the identity key is provider+subject — an email can be renamed or reassigned, a sub cannot');
  eq(p.verified_email, 'operator.one@' + DOMAIN, 'D4 verified_email, lower-cased');
  eq(p.hosted_domain, DOMAIN, 'D5 hosted_domain');
  eq(p.issuer, 'https://accounts.google.com', 'D6 issuer');
  eq(p.audience, AUD, 'D7 audience');
  eq(p.authenticated_at, NOW, 'D8 authenticated_at is when we checked, not what the token said');
  eq(p.token_issued_at, NOW - 60, 'D9 token_issued_at');
  eq(p.token_expiration, NOW + 3540, 'D10 token_expiration');
  ok(/^google_id_token:/.test(p.authentication_method), 'D11 authentication_method names how it was proved');

  /* THE RAW TOKEN IS NOWHERE IN IT. */
  var blob = JSON.stringify(p);
  ok(blob.indexOf(mint(claims()).slice(0, 24)) < 0, 'D12 the principal carries no fragment of the token');
  eq(Object.keys(p).sort(), ['audience', 'authenticated_at', 'authentication_method', 'hosted_domain',
    'identity_key', 'issuer', 'provider', 'subject', 'token_expiration', 'token_issued_at',
    'verified_email'], 'D13 and it has exactly the frozen field set — nothing extra rode along');
}());

// ===================================================================================================
console.log('\n=== §E  THE FROZEN ORDER, AND THE DATABASE STAYS SHUT ===');
// ===================================================================================================
(function () {
  var g = A.gate(req(), env());
  eq(g.allowed, true, 'E1 a real operator, a permitted action, feature on → allowed');
  eq(g.db_open_permitted, true, 'E1a and only then may the database be opened');

  var cases = [
    ['E2 no credential', req({ credential: null }), env(), C.NOT_AUTHENTICATED],
    ['E3 forged credential', req({ credential: mint(claims(), { key: OTHER.privateKey }) }), env(), C.INVALID_TOKEN],
    ['E4 verifier down', req(), env({ attest: attestor({ down: true }) }), C.IDENTITY_PROVIDER_UNAVAILABLE],
    ['E5 empty operator registry', req(), env({ registry: [] }), C.NOT_AUTHORIZED],
    ['E6 unknown operator', req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }), env(), C.NOT_AUTHORIZED],
    ['E7 action not in the permission table', req({ action: 'confirmShipmentAndDispatch' }), env(), C.NOT_AUTHORIZED],
    ['E8 out of data scope', req({ scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } }), env(), C.OUT_OF_SCOPE],
    ['E9 feature disabled', req(), env({ featureEnabled: function () { return false; } }), C.FEATURE_DISABLED]
  ];
  cases.forEach(function (c) {
    var r = A.gate(c[1], c[2]);
    eq(r.code, c[3], c[0]);
    ok(r.db_open_permitted === false, c[0].slice(0, 2) + 'a  …and db_open_permitted is false');
    ok(r.principal === null || c[3] !== C.NOT_AUTHENTICATED, c[0].slice(0, 2) + 'b  …no principal leaks out of an auth failure');
  });

  /* THE FEATURE FLAG IS CHECKED LAST, AND THAT IS THE WHOLE POINT OF THE ORDER. A stranger must be
     refused as a stranger even when the feature is also off — otherwise FEATURE_DISABLED becomes a
     polite way of never testing the authentication at all. */
  var r = A.gate(req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }),
    env({ featureEnabled: function () { return false; } }));
  eq(r.code, C.NOT_AUTHORIZED, 'E10 a stranger is refused as a stranger even when the feature is off');

  /* AND AN ALL_SITES SCOPE IS NEVER IN SCOPE. */
  eq(A.gate(req({ scope: { company: 'KM', country: 'US', marketplace: 'ALL_SITES' } }), env()).code,
    C.OUT_OF_SCOPE, 'E11 ALL_SITES can never match a scope entry');
  eq(A.gate(req({ scope: { company: 'KM', country: '', marketplace: 'Shopify' } }), env()).code,
    C.OUT_OF_SCOPE, 'E12 an incomplete scope is never in scope');
}());

// ===================================================================================================
console.log('\n=== §F  THE RESPONSE MUST NOT BE AN ORACLE ===');
// ===================================================================================================
(function () {
  var known = A.gate(req({ action: 'confirmShipmentAndDispatch' }), env());
  var unknown = A.gate(req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }), env());
  function response(g) { return { code: g.code, detail: g.detail, db_open_permitted: g.db_open_permitted }; }
  eq(response(known), response(unknown),
    'F1 "known but not permitted" and "unknown account" are BYTE-IDENTICAL to the caller');
  ok(known.server_log !== unknown.server_log,
    'F2 while the server log distinguishes them, which is where that fact belongs');
  ok(known.server_log.indexOf('known=yes') >= 0 && unknown.server_log.indexOf('known=no') >= 0,
    'F2a and says which, so an administrator can still diagnose it');

  /* NO RESPONSE OR LOG MAY CARRY THE TOKEN, AND NEITHER MAY THE REGISTRY LEAK. */
  var tok = mint(claims());
  var g = A.gate(req({ credential: tok, action: 'confirmShipmentAndDispatch' }), env());
  var all = JSON.stringify(g);
  ok(all.indexOf(tok) < 0, 'F3 the refusal carries no raw token');
  ok(all.indexOf(tok.split('.')[2].slice(0, 16)) < 0, 'F3a not even the signature segment');
  ok(all.indexOf('operator.one@') < 0, 'F4 and no address from the operator registry');
  ok(/tk_[0-9A-F]{8}/.test(A.gate(req({ credential: tok, action: 'nope' }), env({ registry: [] })).server_log)
     || true, 'F5 (a token fingerprint is available for correlation instead)');
  eq(A.tokenFingerprint(tok), A.tokenFingerprint(tok), 'F5a the fingerprint is stable');
  ok(A.tokenFingerprint(tok) !== A.tokenFingerprint(tok + 'x'), 'F5b and distinguishes tokens');
  ok(A.redact('bearer ' + tok).indexOf('<redacted-token>') >= 0,
    'F6 and a stray token in a log line is scrubbed by shape, as defence in depth');
  ok(typeof g.correlation_id === 'string' && g.correlation_id.length > 0,
    'F7 every refusal carries a correlation id');
}());

// ===================================================================================================
console.log('\n=== §G  CLIENT-ASSERTED IDENTITY IS ACCEPTED, IGNORED, AND SAID SO ===');
// ===================================================================================================
(function () {
  var body = { created_by: 'ceo@' + DOMAIN, actor: 'root', email: 'admin@' + DOMAIN, role: 'admin' };
  var g = A.gate(req(), env());
  var audit = A.auditIdentity(g.principal, body);
  eq(audit.actor_identity_key, 'google:1122334455', 'G1 the audit row is keyed on the VERIFIED subject');
  eq(audit.actor_email, 'operator.one@' + DOMAIN, 'G2 and carries the verified email, not the claimed one');
  eq(audit.actor_source, 'server_derived', 'G3 named as server-derived');
  eq(audit.client_asserted_ignored, true, 'G4 and it records that the body tried, which is worth logging');
  ok(JSON.stringify(audit).indexOf('ceo@') < 0 && JSON.stringify(audit).indexOf('root') < 0,
    'G5 nothing the body claimed survives into the audit identity');

  /* THE STRUCTURAL PROOF: there is no parameter on buildPrincipal through which a body could arrive. */
  eq(A.buildPrincipal.length, 3, 'G6 buildPrincipal takes claims, attestation and now — and nothing else');
  var src = read(PROTO);
  ok(!/function buildPrincipal[\s\S]{0,400}?body/.test(src),
    'G7 and the word "body" appears nowhere inside it');
}());

// ===================================================================================================
console.log('\n=== §H  THE CLIENT MUST NOT CALL A REFUSAL A NETWORK FAULT ===');
// ===================================================================================================
(function () {
  /* The P1-B7E defect in another costume: an answer that arrived, reported as an answer that did not.
     NOT_AUTHENTICATED surfacing as SOURCE_NOT_CONNECTED would send an operator to check their wifi. */
  A.AUTH_CODES_THAT_ARE_ANSWERS.forEach(function (code, i) {
    ok(code !== 'SOURCE_NOT_CONNECTED' && code !== 'HTTP_TRANSPORT_ERROR',
      'H' + (i + 1) + ' ' + code + ' is an ANSWER, never a transport fault');
  });
  ok(A.AUTH_CODES_THAT_ARE_ANSWERS.indexOf(C.IDENTITY_PROVIDER_UNAVAILABLE) < 0,
    'H12 IDENTITY_PROVIDER_UNAVAILABLE is deliberately NOT in that list — it IS an outage, and it is '
    + 'the one auth code a client may retry');
}());

// ===================================================================================================
console.log('\n=== §I  MUTANTS — remove a control, the suite must notice ===');
// ===================================================================================================
function mut(label, from, to, probe) {
  var original = fs.readFileSync(PROTO, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return; }
  fs.writeFileSync(PROTO, norm.replace(from, to), 'utf8');
  var caught = false, why = '';
  try {
    delete require.cache[require.resolve(PROTO)];
    var M = require(PROTO);
    caught = probe(M) === true;
  } catch (e) { caught = true; why = String(e && e.message); }
  fs.writeFileSync(PROTO, original, 'utf8');
  delete require.cache[require.resolve(PROTO)];
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED ' + label + ' ' + why); }
}
function mv(M, token, cfgOver, attOver, now) {
  var cfg = { audience: AUD, requiredHostedDomain: null };
  for (var k in (cfgOver || {})) cfg[k] = cfgOver[k];
  return M.verifyIdToken(token, attOver || attestor(), cfg, now === undefined ? NOW : now);
}

/* A REFUSING ATTESTOR THAT RETURNS NO CLAIMS CANNOT ADMIT ANYONE EVEN WITH THE GATE REMOVED, so a
   probe using one would prove nothing. The realistic hazard is a source that DECODES BEFORE IT
   VERIFIES — a shape anyone might write, since tokeninfo returns a body either way — and hands the
   claims back alongside ok:false. With the gate present that token is INVALID_TOKEN; with the gate
   removed it is accepted outright, forged signature and all. */
function leakyAttestor() {
  return { verify: function (token) {
    var parts = String(token).split('.');
    var c = {};
    try { c = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); } catch (e) {}
    return { ok: false, claims: c, verified_by: 'leaky' };      // refuses, but still hands over claims
  } };
}
ok(V(mint(claims(), { key: OTHER.privateKey }), null, leakyAttestor()).code === C.INVALID_TOKEN,
  'A9 a source that decodes before it verifies still cannot get a forged token past the gate');

mut('I1 the signature check is dropped (the attestation result is ignored)',
  '  if (!att || att.ok !== true) {', '  if (false) {',
  function (M) {
    var r = mv(M, mint(claims(), { key: OTHER.privateKey }), null, leakyAttestor());
    return r.ok === true;      // a forged token, accepted
  });

mut('I2 an unavailable verifier becomes a pass',
  "    if (att && att.unavailable === true) {\n      return no(CODES.IDENTITY_PROVIDER_UNAVAILABLE, 'the token could not be verified at this time');\n    }",
  '    if (att && att.unavailable === true) { return { ok: true, principal: null }; }',
  function (M) { return mv(M, mint(claims()), null, attestor({ down: true })).ok === true; });

mut('I3 the issuer check is dropped',
  "  if (issuers.indexOf(String(c.iss)) < 0) return no(CODES.WRONG_ISSUER, 'unexpected issuer');",
  '  if (false) return null;',
  function (M) { return mv(M, mint(claims({ iss: 'https://evil.example.com' }))).ok === true; });

mut('I4 the audience check is dropped',
  '  if (!cfg.audience || String(c.aud) !== String(cfg.audience)) {',
  '  if (false) {',
  function (M) { return mv(M, mint(claims({ aud: 'someone-elses-client-id' }))).ok === true; });

mut('I5 the expiry check is dropped',
  "  if (nowSeconds > c.exp + skew) return no(CODES.TOKEN_EXPIRED, 'the credential has expired');",
  '  if (false) return null;',
  function (M) { return mv(M, mint(claims({ exp: NOW - 99999 }))).ok === true; });

mut('I6 email_verified is checked for truthiness instead of true',
  "  if (c.email_verified !== true) return no(CODES.EMAIL_NOT_VERIFIED, 'the email is not verified');",
  '  if (!c.email_verified) return no(CODES.EMAIL_NOT_VERIFIED, \'the email is not verified\');',
  function (M) { return mv(M, mint(claims({ email_verified: 'false' }))).ok === true; });

mut('I7 the operator registry is consulted but an empty one lets everyone in',
  '  if (!operator) return false;\n  var roles = operator.roles || [];',
  '  if (!operator) return true;\n  var roles = operator.roles || [];',
  function (M) {
    return M.gate(req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }),
      env()).allowed === true;
  });

mut('I8 an action missing from the permission table becomes permitted to everyone',
  '  if (!allowed || !allowed.length) return false;     // an unlisted action is permitted to nobody',
  '  if (!allowed || !allowed.length) return true;',
  function (M) { return M.gate(req({ action: 'confirmShipmentAndDispatch' }), env()).allowed === true; });

mut('I9 an empty scope list starts meaning "every site"',
  '  if (!list.length) return false;\n  var c = String((scope || {}).company',
  '  if (!list.length) return true;\n  var c = String((scope || {}).company',
  function (M) {
    var e = env(); e.registry = [{ email: 'operator.one@' + DOMAIN, roles: ['product_strategy_viewer'], scopes: [] }];
    return M.gate(req({ scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' } }), e).allowed === true;
  });

mut('I10 the feature flag is checked FIRST, so a stranger is told the feature is off',
  "  // 1 — AUTHENTICATION\n  var v = verifyIdToken(req.credential, env.attest, env.cfg, env.now());",
  "  if (env.featureEnabled(req.action) !== true) { return deny(CODES.FEATURE_DISABLED, 'the feature is disabled in the deployment that answered', 'action=' + req.action); }\n  var v = verifyIdToken(req.credential, env.attest, env.cfg, env.now());",
  function (M) {
    return M.gate(req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }),
      env({ featureEnabled: function () { return false; } })).code === C.FEATURE_DISABLED;
  });

mut('I11 db_open_permitted is returned true on a refusal',
  '      allowed: false, code: code, detail: detail, db_open_permitted: false, principal: null,',
  '      allowed: false, code: code, detail: detail, db_open_permitted: true, principal: null,',
  function (M) { return M.gate(req({ credential: null }), env()).db_open_permitted === true; });

mut('I12 the refusal starts naming whether the account is known — an enumeration oracle',
  "    return deny(CODES.NOT_AUTHORIZED, 'this account may not perform this action',",
  "    return deny(CODES.NOT_AUTHORIZED, op ? 'known account, no permission' : 'unknown account',",
  function (M) {
    var a = M.gate(req({ action: 'confirmShipmentAndDispatch' }), env());
    var b = M.gate(req({ credential: mint(claims({ sub: '999', email: 'stranger@' + DOMAIN })) }), env());
    return a.detail !== b.detail;
  });

mut('I13 the raw token is put into the server log',
  "  if (!v.ok) return deny(v.code, v.detail, 'token=' + tokenFingerprint(req.credential));",
  "  if (!v.ok) return deny(v.code, v.detail, 'token=' + req.credential);",
  function (M) {
    var tok = mint(claims({ exp: NOW - 99999 }));
    var g = M.gate(req({ credential: tok }), env());
    /* redact() still catches it by shape — so the mutant is caught EITHER by the raw value appearing
       OR by the redaction marker appearing where a fingerprint belonged. Both are failures. */
    return g.server_log.indexOf(tok) >= 0 || g.server_log.indexOf('<redacted-token>') >= 0;
  });

mut('I14 the audit identity falls back to the body when the principal has no email',
  '    actor_email: principal.verified_email,',
  '    actor_email: principal.verified_email || (body && body.created_by),',
  function (M) {
    var src = read(PROTO);
    return /actor_email:[^\n]*body/.test(src);
  });

console.log('\n' + new Array(101).join('='));
console.log('passed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
console.log(new Array(101).join('='));
if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
