/**
 * ==================================================================================================
 * GOOGLE ID TOKEN VERIFICATION                                                    SEC-A2 §5
 * ==================================================================================================
 *
 * Three implementations of ONE interface — `verify(token) -> {ok, claims, verified_by}` — because the
 * seam is the point. SEC-A1 built the contract around a replaceable attestation source so that moving
 * between them changes nothing else; this file is that promise being kept.
 *
 *   googleVerifier      PRODUCTION. `google-auth-library`, Google's own client, per their explicit
 *                       recommendation not to write the verification by hand. Declared in package.json
 *                       and NOT vendored into this repository.
 *   localJwksVerifier   TESTS. Real RSA verification against a locally generated key set, using node's
 *                       built-in `crypto`. Genuinely cryptographic — a wrong key really fails — but it
 *                       contacts nothing and needs nothing installed.
 *   staticVerifier      unit tests that need a specific failure on demand.
 *
 * `localJwksVerifier` IS NOT A RELAXED PRODUCTION PATH AND MUST NEVER BECOME ONE. It takes its keys as
 * an argument; there is no code path by which it could fetch Google's. `config.js` refuses to start in
 * production unless the Google verifier is the one selected.
 *
 * THE CLAIM CHECKS LIVE IN `sec-a1-auth-contract.js` AND ARE NOT DUPLICATED HERE. A verifier answers
 * exactly one question — "is this really signed by who it says?" — and everything downstream of that
 * answer (issuer, audience, expiry, email_verified, hosted domain) is policy the gateway applies
 * uniformly, whichever verifier produced the claims. Two copies of a security check are two chances
 * for them to differ.
 * ==================================================================================================
 */
'use strict';

var crypto = require('crypto');

/* The exact wrapper google-auth-library puts around ANY failure to obtain Google's signing
   certificates. Matched before the cause is inspected — see the classification note in
   `googleVerifier` for why the order matters. */
var CERT_FETCH_FAILURE = /Failed to retrieve verification certificates/i;

/** Decode a JWT segment without trusting it. Used only AFTER a signature has been established. */
function decodeSegment(seg) {
  return JSON.parse(Buffer.from(String(seg).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    .toString('utf8'));
}

/**
 * PRODUCTION. A deliberately thin wrapper: everything that could be got wrong is inside Google's
 * library, and what is left here is the mapping onto the interface.
 *
 * `library` is injected rather than required at module load, so this file — and therefore the whole
 * gateway — can be loaded and tested in a repository that has installed nothing.
 */
function googleVerifier(opts) {
  var audience = opts.audience;
  var client = opts.client || null;
  return {
    name: 'google-auth-library',
    verify: function (token) {
      if (!client) {
        /* A verifier that cannot be constructed is an OUTAGE, never a pass. */
        return Promise.resolve({ ok: false, unavailable: true, reason: 'verifier not constructed' });
      }
      return client.verifyIdToken({ idToken: String(token), audience: audience })
        .then(function (ticket) {
          var payload = ticket.getPayload();
          if (!payload) return { ok: false, reason: 'no payload' };
          return { ok: true, claims: payload, verified_by: 'google-auth-library' };
        })
        .catch(function (err) {
          /* A NETWORK FAILURE AND A FORGED TOKEN MUST NOT LOOK THE SAME. The library throws for both,
             so the distinction is drawn here: anything that smells of transport is an outage, and an
             outage is still a refusal — just a differently named one.

             SEC-A2R, MEASURED AGAINST THE INSTALLED LIBRARY: google-auth-library fetches Google's
             signing certificates BEFORE it parses the token, and wraps every failure of that fetch —
             DNS, refused connection, timeout, a 500 from Google, an unparseable cert document — in the
             single message `Failed to retrieve verification certificates: <cause>`. Only some of those
             causes contain a transport-looking word. Classifying by the cause text alone therefore
             reports GOOGLE BEING DOWN as A FORGED TOKEN, which tells a real operator to sign in again
             forever. The wrapper text is matched FIRST and unconditionally: a failure to obtain the
             certificates is never a statement about the caller's token, because the token was never
             looked at. */
          var m = String((err && err.message) || '');
          if (CERT_FETCH_FAILURE.test(m)) return { ok: false, unavailable: true, reason: 'certificates' };
          var transport = /getaddrinfo|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|network|fetch failed|certificate/i.test(m);
          if (transport) return { ok: false, unavailable: true, reason: 'transport' };
          /* ONLY THE CLASSIFICATION ESCAPES, NEVER THE MESSAGE. The library embeds the WHOLE JWT in
             `Invalid token signature: <token>` and the whole payload in `Token used too late: {...}`,
             so `err.message` is a credential. It is read here, in memory, and dropped. */
          return { ok: false, reason: 'rejected' };
        });
    }
  };
}

/**
 * TESTS. Real RSA-SHA256 verification against an explicit key set. No network, no dependency.
 * @param keys { kid: <public key or PEM> }
 */
function localJwksVerifier(keys, state) {
  state = state || {};
  return {
    name: 'local-jwks',
    verify: function (token) {
      if (state.unavailable) {
        return Promise.resolve({ ok: false, unavailable: true, reason: 'verifier offline' });
      }
      if (state.throws) return Promise.reject(new Error('network is unreachable'));
      var parts = String(token).split('.');
      if (parts.length !== 3 || parts[2] === '') return Promise.resolve({ ok: false, reason: 'malformed' });
      var header;
      try { header = decodeSegment(parts[0]); } catch (e) { return Promise.resolve({ ok: false, reason: 'malformed header' }); }
      /* `alg` IS CHECKED AGAINST AN ALLOWLIST, NEVER TRUSTED AS AN INSTRUCTION. "alg": "none" and the
         HMAC-substitution trick both die here. */
      if (header.alg !== 'RS256') return Promise.resolve({ ok: false, reason: 'unacceptable alg' });
      var key = keys[header.kid];
      if (!key) return Promise.resolve({ ok: false, reason: 'unknown kid' });
      var signed = parts[0] + '.' + parts[1];
      var sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      var good = false;
      try { good = crypto.verify('RSA-SHA256', Buffer.from(signed, 'utf8'), key, sig); } catch (e) { good = false; }
      if (!good) return Promise.resolve({ ok: false, reason: 'bad signature' });
      var claims;
      try { claims = decodeSegment(parts[1]); } catch (e) { return Promise.resolve({ ok: false, reason: 'malformed payload' }); }
      return Promise.resolve({ ok: true, claims: claims, verified_by: 'local-jwks' });
    }
  };
}

/** A verifier with a fixed answer, for the cases that are about what the gateway does next. */
function staticVerifier(result) {
  return { name: 'static', verify: function () { return Promise.resolve(result); } };
}

module.exports = {
  googleVerifier: googleVerifier,
  localJwksVerifier: localJwksVerifier,
  staticVerifier: staticVerifier,
  decodeSegment: decodeSegment
};
