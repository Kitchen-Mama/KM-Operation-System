/**
 * ==================================================================================================
 * SEC-A1 — THE AUTHENTICATION CONTRACT, EXECUTABLE            *** PROTOTYPE — NOT RUNTIME ***
 * ==================================================================================================
 *
 * Frozen here: the refusal vocabulary (§8), the server-derived principal (§7), the fail-closed operator
 * registry, the action permission table, the data-scope check, and the one ordering everything else
 * depends on.
 *
 * THE ORDER IS THE PRODUCT. Authenticate, authorize the action, check the data scope, check the feature
 * flag — and ONLY THEN open the database. A refusal measured after the spreadsheet is open has already
 * spent the thing it was protecting, so `gate()` reports `db_open_permitted` as a value the caller must
 * consult rather than a convention it must remember.
 *
 * EVERY REFUSAL KEEPS ITS OWN NAME, and the enumeration rule is the reason. A caller must be able to
 * tell "expired" from "wrong audience" — those are their problems to fix. A caller must NOT be able to
 * tell "this email exists but lacks permission" from "this email is unknown", because the difference is
 * a list of who works here. So both answer NOT_AUTHORIZED with identical detail, and the distinguishing
 * fact goes to the server log under a correlation id instead.
 *
 * NOTHING HERE READS THE REQUEST BODY FOR IDENTITY. `created_by`, `actor`, `email` and `role` in a
 * payload are the caller's own words; the principal is built only from verified claims. That is
 * asserted, not assumed: `buildPrincipal` takes claims and an attestation, and has no parameter through
 * which a body could reach it.
 * ==================================================================================================
 */
'use strict';

// --- §8  THE REFUSAL VOCABULARY -------------------------------------------------------------------
var CODES = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  WRONG_ISSUER: 'WRONG_ISSUER',
  WRONG_AUDIENCE: 'WRONG_AUDIENCE',
  TOKEN_NOT_YET_VALID: 'TOKEN_NOT_YET_VALID',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  IDENTITY_PROVIDER_UNAVAILABLE: 'IDENTITY_PROVIDER_UNAVAILABLE'
};

/* The codes a client must never collapse into a transport fault. NOT_AUTHENTICATED reaching a user as
   "the source is not connected" is the P1-B7E defect wearing a different hat: an answer that arrived,
   reported as an answer that did not. */
var AUTH_CODES_THAT_ARE_ANSWERS = [
  CODES.NOT_AUTHENTICATED, CODES.INVALID_TOKEN, CODES.TOKEN_EXPIRED, CODES.WRONG_ISSUER,
  CODES.WRONG_AUDIENCE, CODES.TOKEN_NOT_YET_VALID, CODES.EMAIL_NOT_VERIFIED,
  CODES.NOT_AUTHORIZED, CODES.OUT_OF_SCOPE, CODES.FEATURE_DISABLED
];

// --- ACCEPTED CONSTANTS (Google OpenID Connect, official) ------------------------------------------
var GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/* Clock skew is bounded and named. Unbounded tolerance turns `exp` into decoration; zero tolerance
   turns a correct client with a slightly fast clock into an outage. */
var MAX_CLOCK_SKEW_SECONDS = 120;

/* An ID token from Sign In With Google lives one hour. A token claiming a much longer life is not one
   of Google's, whatever else it says, so the ceiling is checked rather than trusted. */
var MAX_TOKEN_LIFETIME_SECONDS = 3600 + MAX_CLOCK_SKEW_SECONDS;

// --- REDACTION ------------------------------------------------------------------------------------
/**
 * A raw token must never reach a log, an error, an audit row or a response. It is replaced by a short
 * fingerprint so two occurrences can be correlated without the value being recoverable.
 * The fingerprint is FNV-1a over the token — the same hash shape the rest of the repository uses.
 */
function tokenFingerprint(token) {
  var s = String(token == null ? '' : token), h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'tk_' + ('0000000' + h.toString(16).toUpperCase()).slice(-8);
}

/** Defence in depth: scrub anything that looks like a JWT out of a string bound for a log. */
function redact(text) {
  return String(text == null ? '' : text)
    .replace(/[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '<redacted-token>');
}

// --- §7  THE PRINCIPAL ----------------------------------------------------------------------------
/**
 * Built ONLY from verified claims plus the attestation that verified them. There is no parameter here
 * through which a request body could contribute a field, and that is the point rather than an accident.
 *
 * IDENTITY KEY IS provider + subject, NEVER email. Google's `sub` is stable and unique; an email can be
 * renamed, reassigned to a new person, or turned into an alias. An operator registry keyed on email
 * silently follows the mailbox rather than the human.
 */
function buildPrincipal(claims, attestation, nowSeconds) {
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
    authentication_method: 'google_id_token:' + attestation.verified_by,
    identity_key: 'google:' + String(claims.sub)
  };
}

// --- VERIFICATION ---------------------------------------------------------------------------------
/**
 * @param token        the raw credential, as received in the POST body
 * @param attest       the attestation source: { verify(token) -> {ok, claims, verified_by} | {ok:false} }
 *                     THIS is the step Apps Script has no primitive for; see README.
 * @param cfg          { audience, acceptedIssuers, requiredHostedDomain|null, maxSkew }
 * @param nowSeconds   injected, so expiry is testable without waiting an hour
 */
function verifyIdToken(token, attest, cfg, nowSeconds) {
  function no(code, detail) { return { ok: false, code: code, detail: detail }; }

  if (token === undefined || token === null || String(token) === '') {
    return no(CODES.NOT_AUTHENTICATED, 'no credential was presented');
  }
  var raw = String(token);
  /* A shape check before anything else, so a malformed value is refused as malformed rather than
     reaching the attestation source and coming back as an outage. */
  if (raw.split('.').length !== 3) return no(CODES.INVALID_TOKEN, 'the credential is not a JWT');

  /* THE SIGNATURE IS CHECKED BEFORE ANY CLAIM IS READ. Reading claims out of an unverified token and
     acting on them — even to produce a nicer error — is how a forged token gets a foothold: every
     decision after that point is made from attacker-controlled data. */
  var att;
  try { att = attest.verify(raw); } catch (e) { att = { ok: false, unavailable: true }; }
  if (!att || att.ok !== true) {
    /* AN UNAVAILABLE VERIFIER IS NOT A FAILED VERIFICATION, and it is not a pass either. It is its own
       refusal, so an outage is diagnosable and can never be mistaken for a rejected caller. */
    if (att && att.unavailable === true) {
      return no(CODES.IDENTITY_PROVIDER_UNAVAILABLE, 'the token could not be verified at this time');
    }
    return no(CODES.INVALID_TOKEN, 'the credential is not signed by the expected issuer');
  }
  var c = att.claims || {};
  var skew = (typeof cfg.maxSkew === 'number') ? cfg.maxSkew : MAX_CLOCK_SKEW_SECONDS;

  var issuers = cfg.acceptedIssuers || GOOGLE_ISSUERS;
  if (issuers.indexOf(String(c.iss)) < 0) return no(CODES.WRONG_ISSUER, 'unexpected issuer');

  /* AUDIENCE IS WHAT STOPS A TOKEN MINTED FOR ANOTHER SITE FROM WORKING HERE. A validly signed Google
     token with a real user in it is still not a credential for THIS application. */
  if (!cfg.audience || String(c.aud) !== String(cfg.audience)) {
    return no(CODES.WRONG_AUDIENCE, 'the credential was not issued for this application');
  }

  if (typeof c.exp !== 'number' || !isFinite(c.exp)) return no(CODES.INVALID_TOKEN, 'no usable expiry');
  if (nowSeconds > c.exp + skew) return no(CODES.TOKEN_EXPIRED, 'the credential has expired');

  if (typeof c.iat !== 'number' || !isFinite(c.iat)) return no(CODES.INVALID_TOKEN, 'no usable issue time');
  if (c.iat > nowSeconds + skew) return no(CODES.TOKEN_NOT_YET_VALID, 'issued in the future');
  /* A token whose own lifetime exceeds what the issuer grants is not from that issuer. */
  if (c.exp - c.iat > MAX_TOKEN_LIFETIME_SECONDS) return no(CODES.INVALID_TOKEN, 'implausible lifetime');

  if (c.nbf !== undefined && typeof c.nbf === 'number' && nowSeconds + skew < c.nbf) {
    return no(CODES.TOKEN_NOT_YET_VALID, 'the credential is not valid yet');
  }

  if (!c.sub || String(c.sub) === '') return no(CODES.INVALID_TOKEN, 'no subject');
  if (!c.email || String(c.email) === '') return no(CODES.INVALID_TOKEN, 'no email claim');
  /* email_verified false means Google is not vouching for the address. Accepting it would let an
     unverified mailbox stand in for a person. */
  if (c.email_verified !== true) return no(CODES.EMAIL_NOT_VERIFIED, 'the email is not verified');

  /* HOSTED DOMAIN IS AN EXTRA RESTRICTION, NEVER A SUBSTITUTE FOR THE SIGNATURE. It is checked last,
     after everything that makes the claims trustworthy, and its absence means a consumer account. */
  if (cfg.requiredHostedDomain) {
    var hd = c.hd ? String(c.hd).toLowerCase() : '';
    if (hd !== String(cfg.requiredHostedDomain).toLowerCase()) {
      return no(CODES.NOT_AUTHORIZED, 'this account is not permitted');
    }
  }

  return { ok: true, principal: buildPrincipal(c, att, nowSeconds) };
}

// --- THE OPERATOR REGISTRY (fail-closed, the shape SEC-A0 pinned) ----------------------------------
/**
 * Exact, case-insensitive on email only because addresses are case-insensitive by RFC; keyed on
 * provider+subject once known. EMPTY MEANS NOBODY. No wildcard exists and none can be written: an
 * entry is an object with named fields, so there is no string an operator could set to "everyone".
 */
function findOperator(registry, principal) {
  var list = registry || [];
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    if (e.identity_key && String(e.identity_key) === principal.identity_key) return e;
    /* An entry may be seeded by email BEFORE that person has ever signed in, because their `sub` is
       not knowable in advance. It is upgraded to an identity_key on first use — see SEC-A2. */
    if (e.email && String(e.email).toLowerCase() === principal.verified_email) return e;
  }
  return null;
}

function operatorMayRunAction(operator, action, permissions) {
  if (!operator) return false;
  var roles = operator.roles || [];
  var allowed = (permissions || {})[action];
  if (!allowed || !allowed.length) return false;     // an unlisted action is permitted to nobody
  for (var i = 0; i < roles.length; i++) {
    if (allowed.indexOf(roles[i]) >= 0) return true;
  }
  return false;
}

/** Exact four-part-style scope match. An empty scope list permits nothing, never everything. */
function operatorMayTouchScope(operator, scope) {
  if (!operator) return false;
  var list = operator.scopes || [];
  if (!list.length) return false;
  var c = String((scope || {}).company || '').trim();
  var k = String((scope || {}).country || '').trim();
  var m = String((scope || {}).marketplace || '').trim();
  if (!c || !k || !m) return false;                  // an incomplete scope is never in scope
  if (/^all(_sites)?$/i.test(m) || /^all(_sites)?$/i.test(c) || /^all(_sites)?$/i.test(k)) return false;
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    if (String(e.company) === c && String(e.country) === k && String(e.marketplace) === m) return true;
  }
  return false;
}

// --- THE GATE — the frozen order, as a value rather than a convention -----------------------------
/**
 * Returns { allowed, code, detail, db_open_permitted, principal, correlation_id, server_log }.
 *
 * `db_open_permitted` is false on every refusal, and it is the ONLY thing a handler is allowed to
 * consult before opening the spreadsheet. A boolean that has to be returned is harder to forget than
 * an order that has to be remembered.
 */
function gate(req, env) {
  var cid = String((req && req.correlationId) || 'no-correlation-id');
  function deny(code, detail, logExtra) {
    return {
      allowed: false, code: code, detail: detail, db_open_permitted: false, principal: null,
      correlation_id: cid,
      /* The distinguishing fact lives HERE, not in the response, so an administrator can diagnose what
         a caller must not be able to enumerate. */
      server_log: redact('[' + cid + '] ' + code + (logExtra ? ' :: ' + logExtra : ''))
    };
  }

  // 1 — AUTHENTICATION
  var v = verifyIdToken(req.credential, env.attest, env.cfg, env.now());
  if (!v.ok) return deny(v.code, v.detail, 'token=' + tokenFingerprint(req.credential));
  var p = v.principal;

  // 2 — ACTION PERMISSION
  var op = findOperator(env.registry, p);
  if (!operatorMayRunAction(op, req.action, env.permissions)) {
    /* IDENTICAL ANSWER FOR "not on the list" AND "on the list but not for this action". Any difference
       here — a code, a word, a response time the caller can measure — is an oracle for who works here. */
    return deny(CODES.NOT_AUTHORIZED, 'this account may not perform this action',
      'subject=' + p.subject + ' known=' + (op ? 'yes' : 'no') + ' action=' + req.action);
  }

  // 3 — DATA SCOPE
  if (req.scope && !operatorMayTouchScope(op, req.scope)) {
    return deny(CODES.OUT_OF_SCOPE, 'this account may not act on that site', 'subject=' + p.subject);
  }

  // 4 — FEATURE LIFECYCLE
  if (env.featureEnabled(req.action) !== true) {
    return deny(CODES.FEATURE_DISABLED, 'the feature is disabled in the deployment that answered',
      'action=' + req.action);
  }

  // 5 — only now
  return {
    allowed: true, code: null, detail: null, db_open_permitted: true, principal: p,
    correlation_id: cid, server_log: '[' + cid + '] allowed subject=' + p.subject
  };
}

// --- §7  AUDIT IDENTITY, DERIVED FROM THE PRINCIPAL ONLY ------------------------------------------
/**
 * The body is accepted as an argument and deliberately ignored, because the function that could have
 * read it is the right place to prove it does not. Anything the caller claimed is dropped here.
 */
function auditIdentity(principal, body) {
  return {
    actor_identity_key: principal.identity_key,
    actor_email: principal.verified_email,
    actor_authenticated_at: principal.authenticated_at,
    actor_source: 'server_derived',
    client_asserted_ignored: !!(body && (body.created_by || body.actor || body.email || body.role))
  };
}

module.exports = {
  CODES: CODES,
  AUTH_CODES_THAT_ARE_ANSWERS: AUTH_CODES_THAT_ARE_ANSWERS,
  GOOGLE_ISSUERS: GOOGLE_ISSUERS,
  MAX_CLOCK_SKEW_SECONDS: MAX_CLOCK_SKEW_SECONDS,
  MAX_TOKEN_LIFETIME_SECONDS: MAX_TOKEN_LIFETIME_SECONDS,
  tokenFingerprint: tokenFingerprint,
  redact: redact,
  buildPrincipal: buildPrincipal,
  verifyIdToken: verifyIdToken,
  findOperator: findOperator,
  operatorMayRunAction: operatorMayRunAction,
  operatorMayTouchScope: operatorMayTouchScope,
  gate: gate,
  auditIdentity: auditIdentity
};
