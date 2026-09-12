/**
 * ==================================================================================================
 * THE HMAC ASSERTION CONTRACT                                                     SEC-A2 §7
 * ==================================================================================================
 *
 * This is the seam SEC-A1 was designed around. Apps Script cannot verify an RSA signature — `Utilities`
 * signs and never verifies — but it CAN compute an HMAC, and verifying an HMAC is computing it again
 * and comparing. So the gateway does the part Apps Script cannot, and hands across a statement Apps
 * Script can check in-process, with no outbound call and no hand-written cryptography.
 *
 * LENGTH-PREFIXED SERIALIZATION, NOT DELIMITERS. Every field is emitted as `<byteLength>:<value>\n`.
 * That removes escaping from the problem entirely: no value can contain a separator that changes the
 * parse, because the length is read before the bytes are. A delimiter-joined format would have to get
 * escaping right in JavaScript AND in Apps Script, and a signature contract where the two ends can
 * disagree about a comma is a signature contract that will one day be wrong in production only.
 *
 * BYTE LENGTH, NOT CHARACTER LENGTH. An email or a display value may be non-ASCII; `'é'.length` is 1
 * and its UTF-8 length is 2. Pinning the byte length is what makes the two implementations agree.
 *
 * THE DIGEST CASE IS PINNED. `body_sha256` is lowercase hex and an uppercase digest is REFUSED rather
 * than normalised. Accepting both would mean two distinct strings sign the same request — which is a
 * canonicalisation ambiguity, and canonicalisation ambiguities are how signature schemes are broken.
 *
 * WHAT IS SIGNED IS WHAT IS ACTED ON. The action and a digest of the body are inside the signature, so
 * a valid assertion cannot be lifted onto a different call. Without that binding, an assertion minted
 * for a harmless read would authenticate any request an attacker cared to attach it to.
 * ==================================================================================================
 */
'use strict';

var crypto = require('crypto');

var CONTRACT_VERSION = 'KMGA1';

/* Fixed order. Changing it, or adding a field, is a new CONTRACT_VERSION — never an edit, because an
   old gateway and a new script would otherwise sign different strings and blame the key. */
var FIELDS = [
  'version', 'key_id', 'issued_at', 'expires_at', 'nonce', 'http_method', 'canonical_action',
  'body_sha256', 'principal_provider', 'principal_subject', 'verified_email', 'hosted_domain',
  'correlation_id'
];

var DEFAULT_TTL_SECONDS = 120;        // an assertion is a courier, not a session
var MAX_CLOCK_SKEW_SECONDS = 60;
var MAX_TTL_SECONDS = 300;            // a long-lived assertion is a replay window with paperwork

function utf8Len(s) { return Buffer.byteLength(String(s), 'utf8'); }

/** The one serialization both ends must agree on, byte for byte. */
function canonicalString(a) {
  var out = '';
  for (var i = 0; i < FIELDS.length; i++) {
    var k = FIELDS[i];
    var v = (a[k] === null || a[k] === undefined) ? '' : String(a[k]);
    out += utf8Len(v) + ':' + v + '\n';
  }
  return out;
}

function sha256HexLower(body) {
  return crypto.createHash('sha256').update(Buffer.from(String(body), 'utf8')).digest('hex');
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function hmac(secret, canonical) {
  return b64url(crypto.createHmac('sha256', Buffer.from(String(secret), 'utf8'))
    .update(Buffer.from(canonical, 'utf8')).digest());
}

/**
 * @param keyring { active: {key_id, secret}, previous: {key_id, secret}|null }
 * Only the ACTIVE key ever signs. The previous key exists so that a rotation has an overlap during
 * which requests signed a moment ago still verify — rotation is a window, not an instant.
 */
function sign(keyring, parts, nowSeconds, ttlSeconds) {
  if (!keyring || !keyring.active || !keyring.active.secret || !keyring.active.key_id) {
    return { ok: false, reason: 'no active signing key' };
  }
  var ttl = Math.min(Math.max(1, ttlSeconds || DEFAULT_TTL_SECONDS), MAX_TTL_SECONDS);
  var a = {
    version: CONTRACT_VERSION,
    key_id: keyring.active.key_id,
    issued_at: nowSeconds,
    expires_at: nowSeconds + ttl,
    nonce: b64url(crypto.randomBytes(18)),
    http_method: 'POST',
    canonical_action: parts.action,
    body_sha256: sha256HexLower(parts.body),
    principal_provider: parts.principal.provider,
    principal_subject: parts.principal.subject,
    verified_email: parts.principal.verified_email,
    hosted_domain: parts.principal.hosted_domain || '',
    correlation_id: parts.correlationId
  };
  a.signature = hmac(keyring.active.secret, canonicalString(a));
  return { ok: true, assertion: a };
}

/** Constant-time compare over equal-length buffers; length mismatch short-circuits without leaking. */
function timingSafeEquals(a, b) {
  var A = Buffer.from(String(a), 'utf8'), B = Buffer.from(String(b), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

/**
 * The verification the Apps Script side performs, expressed here so the two implementations can be
 * tested against each other. Every failure is fail-closed and named.
 *
 * @param nonceStore { seen(nonce) -> true|false|null }  — null means the store is UNAVAILABLE, which
 *                   is a refusal and never a pass. See `apps-script-verifier` for that decision.
 */
function verify(keyring, assertion, expected, nowSeconds, nonceStore) {
  function no(reason) { return { ok: false, reason: reason }; }
  if (!assertion || typeof assertion !== 'object') return no('MISSING_ASSERTION');
  if (assertion.version !== CONTRACT_VERSION) return no('WRONG_CONTRACT_VERSION');

  /* KEY SELECTION IS EXPLICIT AND UNKNOWN KEYS FAIL CLOSED. Trying every key we hold would make a
     revoked key indistinguishable from a current one. */
  var key = null;
  if (keyring && keyring.active && keyring.active.key_id === assertion.key_id) key = keyring.active;
  else if (keyring && keyring.previous && keyring.previous.key_id === assertion.key_id) key = keyring.previous;
  if (!key || !key.secret) return no('UNKNOWN_KEY_ID');

  if (typeof assertion.issued_at !== 'number' || typeof assertion.expires_at !== 'number') {
    return no('MALFORMED_TIMESTAMPS');
  }
  if (assertion.expires_at - assertion.issued_at > MAX_TTL_SECONDS) return no('TTL_TOO_LONG');
  if (nowSeconds > assertion.expires_at + MAX_CLOCK_SKEW_SECONDS) return no('ASSERTION_EXPIRED');
  if (assertion.issued_at > nowSeconds + MAX_CLOCK_SKEW_SECONDS) return no('ASSERTION_FROM_THE_FUTURE');

  if (!assertion.nonce || String(assertion.nonce).length < 16) return no('MISSING_NONCE');

  if (String(assertion.http_method) !== 'POST') return no('WRONG_METHOD');
  if (String(assertion.canonical_action) !== String(expected.action)) return no('ACTION_MISMATCH');

  /* Lowercase hex, checked rather than normalised — see the header. */
  if (!/^[0-9a-f]{64}$/.test(String(assertion.body_sha256))) return no('MALFORMED_DIGEST');
  if (sha256HexLower(expected.body) !== String(assertion.body_sha256)) return no('BODY_DIGEST_MISMATCH');

  if (!assertion.principal_subject || !assertion.principal_provider || !assertion.verified_email) {
    return no('INCOMPLETE_PRINCIPAL');
  }

  /* THE SIGNATURE IS CHECKED BEFORE THE NONCE IS SPENT. Recording a nonce from an unverified assertion
     would let anyone burn a legitimate caller's nonce by replaying garbage at us. */
  var expectSig = hmac(key.secret, canonicalString(assertion));
  if (!timingSafeEquals(expectSig, String(assertion.signature || ''))) return no('BAD_SIGNATURE');

  if (nonceStore) {
    var seen = nonceStore.seen(String(assertion.nonce));
    if (seen === null) return no('REPLAY_STORE_UNAVAILABLE');   // fail closed, always
    if (seen === true) return no('REPLAY_DETECTED');
  }
  return { ok: true, key_id: key.key_id };
}

module.exports = {
  CONTRACT_VERSION: CONTRACT_VERSION,
  FIELDS: FIELDS,
  DEFAULT_TTL_SECONDS: DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS: MAX_TTL_SECONDS,
  MAX_CLOCK_SKEW_SECONDS: MAX_CLOCK_SKEW_SECONDS,
  canonicalString: canonicalString,
  sha256HexLower: sha256HexLower,
  b64url: b64url,
  hmac: hmac,
  sign: sign,
  verify: verify,
  timingSafeEquals: timingSafeEquals
};
