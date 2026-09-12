/**
 * ==================================================================================================
 * THE PIPELINE — THE FROZEN ORDER, AS CODE                                   SEC-A2 §5 §6 §9 §10
 * ==================================================================================================
 *
 *   1 authenticate the caller           -> NOT_AUTHENTICATED / INVALID_TOKEN / ...
 *   2 authorize the action              -> NOT_AUTHORIZED
 *   3 check the company/site scope      -> OUT_OF_SCOPE
 *   4 the feature lifecycle is UPSTREAM's to enforce, and stays there — see below
 *   5 only now: sign an assertion and call the upstream
 *
 * WHY THE FEATURE FLAG IS NOT CHECKED HERE. It lives in `00_config.gs`, in the deployment that
 * answers, and that is the only copy that can be trusted — a mirror in the gateway would be a second
 * authority that could disagree with the first. SEC-A1's finding still holds and is honoured by
 * ordering rather than by location: the gateway refuses a stranger BEFORE the upstream ever gets to
 * say the feature is off, so `FEATURE_DISABLED` can never become a polite way of skipping
 * authentication.
 *
 * THE BODY IS VALIDATED BEFORE IT IS SIGNED. An assertion binds a digest of the body, so whatever is
 * signed is what the upstream will act on — which means anything we would refuse must be refused
 * before signing, not after.
 *
 * EVERY REFUSAL RETURNS THE SAME SHAPE and carries `db_open_permitted: false` in spirit: the upstream
 * is simply never called. There is no path from a refusal to a request.
 * ==================================================================================================
 */
'use strict';

var CODES = require('./codes.js').CODES;
var codes = require('./codes.js');
var registry = require('./registry.js');
var assertionLib = require('./assertion.js');

var GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
var MAX_CLOCK_SKEW_SECONDS = 120;
var MAX_TOKEN_LIFETIME_SECONDS = 3600 + MAX_CLOCK_SKEW_SECONDS;

function buildPrincipal(claims, verifiedBy, nowSeconds) {
  return {
    provider: 'google',
    subject: String(claims.sub),
    verified_email: String(claims.email).toLowerCase(),
    hosted_domain: claims.hd ? String(claims.hd).toLowerCase() : null,
    issuer: String(claims.iss),
    audience: String(claims.aud),
    authenticated_at: nowSeconds,
    token_issued_at: Number(claims.iat),
    token_expiration: Number(claims.exp),
    authentication_method: 'google_id_token:' + verifiedBy,
    identity_key: 'google:' + String(claims.sub)
  };
}

/** Policy applied to claims, identically whichever verifier produced them. */
function checkClaims(c, cfg, nowSeconds) {
  function no(code) { return { ok: false, code: code }; }
  if (GOOGLE_ISSUERS.indexOf(String(c.iss)) < 0) return no(CODES.WRONG_ISSUER);
  if (!cfg.googleClientId || String(c.aud) !== String(cfg.googleClientId)) return no(CODES.WRONG_AUDIENCE);
  if (typeof c.exp !== 'number' || !isFinite(c.exp)) return no(CODES.INVALID_TOKEN);
  if (nowSeconds > c.exp + MAX_CLOCK_SKEW_SECONDS) return no(CODES.TOKEN_EXPIRED);
  if (typeof c.iat !== 'number' || !isFinite(c.iat)) return no(CODES.INVALID_TOKEN);
  if (c.iat > nowSeconds + MAX_CLOCK_SKEW_SECONDS) return no(CODES.TOKEN_NOT_YET_VALID);
  if (c.exp - c.iat > MAX_TOKEN_LIFETIME_SECONDS) return no(CODES.INVALID_TOKEN);
  if (typeof c.nbf === 'number' && nowSeconds + MAX_CLOCK_SKEW_SECONDS < c.nbf) return no(CODES.TOKEN_NOT_YET_VALID);
  if (!c.sub || String(c.sub) === '') return no(CODES.INVALID_TOKEN);
  if (!c.email || String(c.email) === '') return no(CODES.INVALID_TOKEN);
  if (c.email_verified !== true) return no(CODES.EMAIL_NOT_VERIFIED);
  /* Hosted domain restricts FURTHER. It is checked after everything that makes the claims
     trustworthy, and it answers NOT_AUTHORIZED because it is a policy decision about a real,
     verified person — not a defect in their credential. */
  if (cfg.requiredHostedDomain) {
    var hd = c.hd ? String(c.hd).toLowerCase() : '';
    if (hd !== String(cfg.requiredHostedDomain).toLowerCase()) return no(CODES.NOT_AUTHORIZED);
  }
  return { ok: true };
}

/** Structural validation of what the browser sent. Refused before anything is signed. */
function validateRequest(parsed, cfg) {
  function no(code, why) { return { ok: false, code: code, why: why }; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return no(CODES.INVALID_GATEWAY_ASSERTION, 'body is not an object');
  var action = parsed.action;
  if (typeof action !== 'string' || !action) return no(CODES.ACTION_MISMATCH, 'no action');
  /* AN ALLOWLIST, NOT A DENYLIST. Phase one serves two actions; every other name — including a real
     one from the other 136 — is refused here and never reaches the upstream. */
  if (cfg.allowedActions.indexOf(action) < 0) return no(CODES.NOT_AUTHORIZED, 'action not served by this gateway');
  if (parsed.payload !== undefined && (typeof parsed.payload !== 'object' || parsed.payload === null || Array.isArray(parsed.payload))) {
    return no(CODES.ACTION_MISMATCH, 'payload is not an object');
  }
  if (typeof parsed.credential !== 'string' || !parsed.credential) return no(CODES.NOT_AUTHENTICATED, 'no credential');
  return { ok: true, action: action, payload: parsed.payload || {}, credential: parsed.credential };
}

/**
 * @param deps { verifier, cfg, keyring, registry, now, log, upstream }
 * @returns    { ok:true, status, body } | a refusal from codes.refusal()
 */
function handle(rawBody, correlationId, deps) {
  var cfg = deps.cfg, now = deps.now();
  function deny(code, diagnostic) {
    deps.log.warn(correlationId, 'refused', { code: code, diagnostic: diagnostic || null });
    return Promise.resolve(codes.refusal(code, correlationId));
  }

  if (!deps.keyring || !deps.keyring.active) return deny(CODES.GATEWAY_CONFIGURATION_ERROR, 'no active signing key');

  var parsed;
  try { parsed = JSON.parse(rawBody); } catch (e) { return deny(CODES.ACTION_MISMATCH, 'unparseable body'); }

  var v = validateRequest(parsed, cfg);
  if (!v.ok) return deny(v.code, v.why);

  // ---- 1  AUTHENTICATE ---------------------------------------------------------------------------
  return Promise.resolve()
    .then(function () { return deps.verifier.verify(v.credential); })
    .catch(function () { return { ok: false, unavailable: true }; })
    .then(function (att) {
      if (!att || att.ok !== true) {
        /* An unavailable verifier is an OUTAGE, not a rejected caller. Collapsing the two would tell
           a real operator they are not allowed, when the truth is that something is down. */
        if (att && att.unavailable === true) return deny(CODES.IDENTITY_PROVIDER_UNAVAILABLE, 'verifier down');
        return deny(CODES.INVALID_TOKEN, 'signature or format');
      }
      var claimCheck = checkClaims(att.claims, cfg, now);
      if (!claimCheck.ok) return deny(claimCheck.code, 'claims');

      var principal = buildPrincipal(att.claims, att.verified_by, now);

      // ---- 2  AUTHORIZE THE ACTION -----------------------------------------------------------------
      var entry = registry.find(deps.registry, principal);
      if (!registry.mayRunAction(entry, v.action)) {
        /* IDENTICAL PUBLIC ANSWER whether the account is unknown, disabled, or simply not permitted
           this action. The distinguishing fact goes to the log and nowhere else. */
        return deny(CODES.NOT_AUTHORIZED,
          'subject=' + principal.subject + ' known=' + (entry ? 'yes' : 'no')
          + ' status=' + (entry ? entry.status : 'n/a') + ' action=' + v.action);
      }

      // ---- 3  DATA SCOPE ---------------------------------------------------------------------------
      var site = v.payload && v.payload.scope ? v.payload.scope : null;
      if (site && !registry.maySeeSite(entry, site)) {
        return deny(CODES.OUT_OF_SCOPE, 'subject=' + principal.subject);
      }

      // ---- 4/5  SIGN AND FORWARD -------------------------------------------------------------------
      /* The upstream body is the CANONICAL action and payload — the Google token is not in it. */
      var upstreamBody = JSON.stringify({ action: v.action, payload: v.payload });
      var signed = assertionLib.sign(deps.keyring, {
        action: v.action, body: upstreamBody, principal: principal, correlationId: correlationId
      }, now, cfg.assertionTtlSeconds);
      if (!signed.ok) return deny(CODES.GATEWAY_CONFIGURATION_ERROR, signed.reason);

      deps.log.info(correlationId, 'forwarding', {
        action: v.action, subject: principal.subject, key_id: signed.assertion.key_id
      });

      return deps.upstream({ action: v.action, payload: v.payload, km_assertion: signed.assertion })
        .then(function (r) {
          if (!r || r.ok !== true) return deny(CODES.UPSTREAM_UNAVAILABLE, r && r.reason);
          return { ok: true, status: 200, body: r.body, correlation_id: correlationId };
        });
    });
}

module.exports = {
  handle: handle,
  buildPrincipal: buildPrincipal,
  checkClaims: checkClaims,
  validateRequest: validateRequest,
  GOOGLE_ISSUERS: GOOGLE_ISSUERS,
  MAX_CLOCK_SKEW_SECONDS: MAX_CLOCK_SKEW_SECONDS,
  MAX_TOKEN_LIFETIME_SECONDS: MAX_TOKEN_LIFETIME_SECONDS
};
