/**
 * ==================================================================================================
 * APPS SCRIPT SIDE OF THE SEAM        *** PROTOTYPE — NOT ROUTED, NOT DEPLOYED, NOT SYNCED ***
 * ==================================================================================================
 *                                                                                    SEC-A2 §8
 * This file is not in `assets/specs/active/apps-script/`, is in no sync package, is referenced by no
 * router branch, and defines no `doGet`/`doPost`. Pasting it into the project would add dead code and
 * nothing else — that is the intended blast radius for a first draft of security code.
 *
 * IT USES ONLY PRIMITIVES APPS SCRIPT ACTUALLY HAS. That constraint is the reason the whole
 * architecture looks the way it does:
 *
 *   Utilities.computeHmacSha256Signature   present — so an HMAC assertion can be verified
 *   Utilities.computeDigest(SHA_256)       present — so a body digest can be recomputed
 *   Utilities.base64EncodeWebSafe          present — so the encoding can match the gateway's
 *   CacheService                           present — so a nonce can be remembered
 *   PropertiesService                      present — so a secret can live outside the source
 *   (no RSA verification)                  ABSENT  — which is why a gateway exists at all
 *
 * THE COMPARISON IS CONSTANT-TIME BY HAND. Apps Script has no `timingSafeEqual`, so the loop below
 * accumulates a difference over the FULL length and never returns early. `a === b` on a signature
 * leaks, through timing, how many leading bytes were right — which is enough to reconstruct one.
 * Writing this loop is not implementing cryptography; it is refusing to leak while comparing.
 *
 * THE REPLAY DECISION, MADE EXPLICITLY BECAUSE §8 REQUIRES IT RATHER THAN ASSUMED:
 * when `CacheService` is unavailable the verifier REFUSES — for reads as well as writes. Phase one
 * serves two read-only actions behind a flag that is off, so strictness costs nothing today, and a
 * rule adopted while it is free is one nobody has to argue for later. If a real availability cost
 * ever appears, loosening it is a decision with a date and a reason; starting loose would have been
 * a decision nobody ever made.
 * ==================================================================================================
 */

var KMGA_CONTRACT_VERSION_ = 'KMGA1';
var KMGA_MAX_TTL_SECONDS_ = 300;
var KMGA_MAX_CLOCK_SKEW_SECONDS_ = 60;
var KMGA_NONCE_CACHE_PREFIX_ = 'kmga_nonce_';

/** Field order — must equal `assertion.js` FIELDS exactly. A difference here is a silent mismatch. */
var KMGA_FIELDS_ = [
  'version', 'key_id', 'issued_at', 'expires_at', 'nonce', 'http_method', 'canonical_action',
  'body_sha256', 'principal_provider', 'principal_subject', 'verified_email', 'hosted_domain',
  'correlation_id'
];

/**
 * UTF-8 byte length. `String.length` counts UTF-16 units, so 'é' would be 1 here and 2 in Node —
 * and the two sides would sign different strings for the same data. This is the single most
 * likely way for the two implementations to disagree, so it is its own function with its own test.
 */
function kmgaUtf8Length_(s) {
  return Utilities.newBlob(String(s === null || s === undefined ? '' : s)).getBytes().length;
}

/** The canonical string. Length-prefixed, so no value can contain a separator that changes the parse. */
function kmgaCanonicalString_(a) {
  var out = '';
  for (var i = 0; i < KMGA_FIELDS_.length; i++) {
    var k = KMGA_FIELDS_[i];
    var v = (a[k] === null || a[k] === undefined) ? '' : String(a[k]);
    out += kmgaUtf8Length_(v) + ':' + v + '\n';
  }
  return out;
}

/** Base64url without padding — the same encoding the gateway emits. */
function kmgaB64Url_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function kmgaHmac_(secret, canonical) {
  return kmgaB64Url_(Utilities.computeHmacSha256Signature(canonical, secret, Utilities.Charset.UTF_8));
}

/** Lowercase hex SHA-256, matching the gateway's `body_sha256` exactly. */
function kmgaSha256HexLower_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

/** Constant-time over the full length. Never returns early. */
function kmgaConstantTimeEquals_(a, b) {
  var A = String(a === null || a === undefined ? '' : a);
  var B = String(b === null || b === undefined ? '' : b);
  if (A.length !== B.length) return false;
  var diff = 0;
  for (var i = 0; i < A.length; i++) diff |= (A.charCodeAt(i) ^ B.charCodeAt(i));
  return diff === 0;
}

/**
 * The keyring, from Script Properties. NEVER from 00_config.gs: a secret in a source file is a secret
 * in every clone of the repository, in every paste into the editor, and in every screen share.
 */
function kmgaKeyring_(props) {
  var p = props || PropertiesService.getScriptProperties();
  function one(idKey, secretKey) {
    var id = p.getProperty(idKey), secret = p.getProperty(secretKey);
    if (!id || !secret || String(secret).length < 32) return null;
    return { key_id: String(id), secret: String(secret) };
  }
  return {
    active: one('KMGA_ACTIVE_KEY_ID', 'KMGA_ACTIVE_KEY_SECRET'),
    previous: one('KMGA_PREVIOUS_KEY_ID', 'KMGA_PREVIOUS_KEY_SECRET')
  };
}

/**
 * Nonce store over CacheService.
 * @return true (seen before) | false (fresh, and now recorded) | null (STORE UNAVAILABLE)
 * `null` is a refusal upstream. It is a distinct value rather than a thrown error precisely so the
 * caller has to decide what to do about it instead of inheriting a default.
 */
function kmgaNonceSeen_(nonce, ttlSeconds, cache) {
  var c;
  try { c = cache || CacheService.getScriptCache(); } catch (e) { return null; }
  if (!c) return null;
  var key = KMGA_NONCE_CACHE_PREFIX_ + nonce;
  try {
    if (c.get(key) !== null) return true;
    c.put(key, '1', Math.max(1, Math.min(21600, ttlSeconds)));
    /* READ BACK. A put that silently failed would leave the window open while reporting it closed. */
    if (c.get(key) === null) return null;
    return false;
  } catch (e) { return null; }
}

/**
 * Verify a gateway assertion. Returns { ok, code } — never a boolean, because "why not" is the part
 * a caller needs.
 *
 * @param assertion  the `km_assertion` object from the request body
 * @param expected   { action, body }  — body is the EXACT string whose digest was signed
 * @param io         { now, keyring, nonceSeen }  injected so this is testable without the platform
 */
function kmgaVerifyAssertion_(assertion, expected, io) {
  function no(code) { return { ok: false, code: code }; }
  var now = io.now();

  if (!assertion || typeof assertion !== 'object') return no('INVALID_GATEWAY_ASSERTION');
  if (String(assertion.version) !== KMGA_CONTRACT_VERSION_) return no('INVALID_GATEWAY_ASSERTION');

  var ring = io.keyring();
  if (!ring || (!ring.active && !ring.previous)) return no('GATEWAY_CONFIGURATION_ERROR');

  /* Explicit key selection. Trying every key would make a revoked one indistinguishable from a live
     one, and "unknown key id" is exactly the signal a rotation gone wrong should produce. */
  var key = null;
  if (ring.active && ring.active.key_id === String(assertion.key_id)) key = ring.active;
  else if (ring.previous && ring.previous.key_id === String(assertion.key_id)) key = ring.previous;
  if (!key) return no('INVALID_GATEWAY_ASSERTION');

  var iat = Number(assertion.issued_at), exp = Number(assertion.expires_at);
  if (!isFinite(iat) || !isFinite(exp)) return no('INVALID_GATEWAY_ASSERTION');
  if (exp - iat > KMGA_MAX_TTL_SECONDS_) return no('INVALID_GATEWAY_ASSERTION');
  if (now > exp + KMGA_MAX_CLOCK_SKEW_SECONDS_) return no('ASSERTION_EXPIRED');
  if (iat > now + KMGA_MAX_CLOCK_SKEW_SECONDS_) return no('INVALID_GATEWAY_ASSERTION');

  if (!assertion.nonce || String(assertion.nonce).length < 16) return no('INVALID_GATEWAY_ASSERTION');
  if (String(assertion.http_method) !== 'POST') return no('INVALID_GATEWAY_ASSERTION');
  if (String(assertion.canonical_action) !== String(expected.action)) return no('ACTION_MISMATCH');

  if (!/^[0-9a-f]{64}$/.test(String(assertion.body_sha256))) return no('INVALID_GATEWAY_ASSERTION');
  if (kmgaSha256HexLower_(expected.body) !== String(assertion.body_sha256)) return no('BODY_DIGEST_MISMATCH');

  if (!assertion.principal_provider || !assertion.principal_subject || !assertion.verified_email) {
    return no('INVALID_GATEWAY_ASSERTION');
  }

  /* SIGNATURE BEFORE NONCE. Spending a nonce from an unverified assertion would let anyone burn a
     legitimate caller's nonce by replaying noise at the endpoint. */
  var expectSig = kmgaHmac_(key.secret, kmgaCanonicalString_(assertion));
  if (!kmgaConstantTimeEquals_(expectSig, String(assertion.signature || ''))) {
    return no('INVALID_GATEWAY_ASSERTION');
  }

  var seen = io.nonceSeen(String(assertion.nonce), Math.max(1, (exp - iat) + KMGA_MAX_CLOCK_SKEW_SECONDS_));
  if (seen === null) return no('REPLAY_DETECTED');   // store unavailable -> fail closed, see header
  if (seen === true) return no('REPLAY_DETECTED');

  return {
    ok: true,
    key_id: key.key_id,
    principal: {
      provider: String(assertion.principal_provider),
      subject: String(assertion.principal_subject),
      verified_email: String(assertion.verified_email),
      hosted_domain: assertion.hosted_domain ? String(assertion.hosted_domain) : null,
      identity_key: String(assertion.principal_provider) + ':' + String(assertion.principal_subject)
    },
    correlation_id: String(assertion.correlation_id || '')
  };
}

/**
 * The full gate, in the frozen order, expressed as the shape a handler would call.
 * `db_open_permitted` is returned as a VALUE the caller must consult — a boolean that has to be
 * returned is harder to forget than an order that has to be remembered.
 */
function kmgaGate_(request, io) {
  function deny(code) { return { allowed: false, code: code, db_open_permitted: false, principal: null }; }

  var v = kmgaVerifyAssertion_(request.km_assertion,
    { action: request.action, body: request.rawUpstreamBody }, io);
  if (!v.ok) return deny(v.code);

  if (!io.mayRunAction(v.principal, request.action)) return deny('NOT_AUTHORIZED');
  if (request.site && !io.maySeeSite(v.principal, request.site)) return deny('OUT_OF_SCOPE');
  if (io.featureEnabled(request.action) !== true) return deny('FEATURE_DISABLED');

  return { allowed: true, code: null, db_open_permitted: true, principal: v.principal,
    correlation_id: v.correlation_id };
}

/** The audit identity. Derived from the assertion only; the body is taken and deliberately ignored. */
function kmgaAuditIdentity_(principal, body) {
  return {
    actor_identity_key: principal.identity_key,
    actor_email: principal.verified_email,
    actor_source: 'gateway_verified',
    client_asserted_ignored: !!(body && (body.created_by || body.actor || body.email || body.role))
  };
}

/* Node-side export so the test suite can drive this file directly and prove the two implementations
   agree byte for byte. Apps Script ignores it: `module` is undefined there. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    KMGA_FIELDS_: KMGA_FIELDS_,
    kmgaCanonicalString_: kmgaCanonicalString_,
    kmgaVerifyAssertion_: kmgaVerifyAssertion_,
    kmgaGate_: kmgaGate_,
    kmgaAuditIdentity_: kmgaAuditIdentity_,
    kmgaConstantTimeEquals_: kmgaConstantTimeEquals_,
    kmgaSha256HexLower_: kmgaSha256HexLower_,
    kmgaHmac_: kmgaHmac_,
    kmgaUtf8Length_: kmgaUtf8Length_,
    kmgaNonceSeen_: kmgaNonceSeen_,
    kmgaKeyring_: kmgaKeyring_
  };
}
