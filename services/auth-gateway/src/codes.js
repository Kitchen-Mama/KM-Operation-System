/**
 * ==================================================================================================
 * THE REFUSAL CONTRACT                                                           SEC-A2 §10
 * ==================================================================================================
 *
 * Twenty codes, three audiences, and the split is the whole design.
 *
 * SEC-A2R ADDED EXACTLY TWO, AND SAYS SO RATHER THAN OVERLOADING AN EXISTING ONE.
 *
 *   TOO_MANY_REQUESTS   §8 requires an application-level rate guard, and a guard needs a way to say
 *                       "not you, not now". Every one of the original eighteen would have been a lie:
 *                       NOT_AUTHORIZED says a permission is missing and sends a real operator to ask
 *                       for access they already have; UPSTREAM_UNAVAILABLE blames a machine that is
 *                       fine.
 *
 *   PAYLOAD_TOO_LARGE   the body limit previously answered ACTION_MISMATCH, whose public text is "The
 *                       request was altered in transit." That sentence sends somebody to look for a
 *                       network fault when the truth is that they sent too much — the precise class of
 *                       misclassification the rest of this file exists to prevent, sitting inside the
 *                       file. Found by running the production process and reading what it actually
 *                       said.
 *
 * A contract extension that is written down is a contract; one that reuses a code because the list was
 * frozen is a contract that quietly means two things.
 *
 *   `code`            goes to the client. It says what the CALLER can do about it, and nothing else.
 *   `publicMessage`   goes to a human. It never names an account, a list, a key or an endpoint.
 *   `diagnostic`      goes to the structured log, under a correlation id, and may be specific.
 *
 * TWO MISCLASSIFICATIONS ARE CALLED OUT BY NAME because both have already happened in this system's
 * history, in one form or another:
 *
 *   · an AUTH refusal reported as a transport fault. P1-B7E shipped exactly that shape — an answer that
 *     arrived, reported as an answer that did not — and it sent people to check their network. Every
 *     code in `ANSWERS` is a decision the server made on purpose.
 *   · an UPSTREAM failure reported as NOT_AUTHORIZED. That one is worse: it tells a person they lack
 *     permission when the truth is that a machine is down, and the natural response is to ask for
 *     access they already have.
 *
 * THE ENUMERATION RULE. A caller may distinguish "expired" from "wrong audience" — those are theirs to
 * fix. A caller may NOT distinguish "this account exists but lacks permission" from "this account is
 * unknown", because that difference is a list of who works here. Both are NOT_AUTHORIZED with byte
 * identical public text; the distinguishing fact lives only in `diagnostic`.
 * ==================================================================================================
 */
'use strict';

var CODES = {
  // -- authentication: the caller's credential -----------------------------------------------------
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  WRONG_ISSUER: 'WRONG_ISSUER',
  WRONG_AUDIENCE: 'WRONG_AUDIENCE',
  TOKEN_NOT_YET_VALID: 'TOKEN_NOT_YET_VALID',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  // -- authorization: what this caller may do ------------------------------------------------------
  NOT_AUTHORIZED: 'NOT_AUTHORIZED',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  FEATURE_DISABLED: 'FEATURE_DISABLED',
  // -- the gateway-to-script assertion -------------------------------------------------------------
  INVALID_GATEWAY_ASSERTION: 'INVALID_GATEWAY_ASSERTION',
  ASSERTION_EXPIRED: 'ASSERTION_EXPIRED',
  REPLAY_DETECTED: 'REPLAY_DETECTED',
  BODY_DIGEST_MISMATCH: 'BODY_DIGEST_MISMATCH',
  ACTION_MISMATCH: 'ACTION_MISMATCH',
  // -- infrastructure: nothing the caller did ------------------------------------------------------
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  IDENTITY_PROVIDER_UNAVAILABLE: 'IDENTITY_PROVIDER_UNAVAILABLE',
  GATEWAY_CONFIGURATION_ERROR: 'GATEWAY_CONFIGURATION_ERROR',
  UPSTREAM_UNAVAILABLE: 'UPSTREAM_UNAVAILABLE'
};

/**
 * Codes that are DECISIONS. A client must render these as answers — never as "the source is not
 * connected", never as a network error, never as something a retry could fix.
 */
var ANSWERS = [
  CODES.NOT_AUTHENTICATED, CODES.INVALID_TOKEN, CODES.TOKEN_EXPIRED, CODES.WRONG_ISSUER,
  CODES.WRONG_AUDIENCE, CODES.TOKEN_NOT_YET_VALID, CODES.EMAIL_NOT_VERIFIED,
  CODES.NOT_AUTHORIZED, CODES.OUT_OF_SCOPE, CODES.FEATURE_DISABLED,
  CODES.INVALID_GATEWAY_ASSERTION, CODES.ASSERTION_EXPIRED, CODES.REPLAY_DETECTED,
  CODES.BODY_DIGEST_MISMATCH, CODES.ACTION_MISMATCH, CODES.PAYLOAD_TOO_LARGE
];

/**
 * Codes that are OUTAGES. Something is down; the caller did nothing wrong and can retry.
 * Keeping these separate is what stops "the verifier is unreachable" from reading as "you are not
 * allowed", which would send a person to ask for access they already have.
 */
var OUTAGES = [
  CODES.IDENTITY_PROVIDER_UNAVAILABLE, CODES.GATEWAY_CONFIGURATION_ERROR, CODES.UPSTREAM_UNAVAILABLE
];

/* TOO_MANY_REQUESTS is NEITHER an answer about the caller's rights NOR an outage. It is the server
   declining to spend more on this caller right now, and the only honest thing to tell them is to come
   back — so it is retryable, and it is the one code that is `kind: 'throttle'`. Filing it under
   ANSWERS would let a client render "you may not do this"; filing it under OUTAGES would let a client
   report a fault that does not exist. */
var THROTTLES = [CODES.TOO_MANY_REQUESTS];

/** Codes a client may retry. Deliberately a subset of OUTAGES: a configuration error is not transient. */
var RETRYABLE = [CODES.IDENTITY_PROVIDER_UNAVAILABLE, CODES.UPSTREAM_UNAVAILABLE, CODES.TOO_MANY_REQUESTS];

/**
 * Public text. Deliberately dull, deliberately identical for the two NOT_AUTHORIZED cases, and
 * deliberately free of anything that could be enumerated.
 */
var PUBLIC_MESSAGE = {
  NOT_AUTHENTICATED: 'Sign in to continue.',
  INVALID_TOKEN: 'Your sign-in could not be verified. Sign in again.',
  TOKEN_EXPIRED: 'Your sign-in has expired. Sign in again.',
  WRONG_ISSUER: 'Your sign-in could not be verified. Sign in again.',
  WRONG_AUDIENCE: 'Your sign-in could not be verified. Sign in again.',
  TOKEN_NOT_YET_VALID: 'Your sign-in could not be verified. Sign in again.',
  EMAIL_NOT_VERIFIED: 'This Google account has no verified email address.',
  NOT_AUTHORIZED: 'This account may not perform this action.',
  OUT_OF_SCOPE: 'This account may not act on that site.',
  FEATURE_DISABLED: 'This feature is not enabled.',
  /* NO NUMBERS. A message carrying "try again in 37 seconds" hands a flooder a progress bar, and one
     carrying a quota tells them exactly how large a burst is free. */
  TOO_MANY_REQUESTS: 'Too many requests. Try again shortly.',
  /* No limit is quoted. The caller already knows they sent too much; the exact ceiling is only useful
     to someone probing for the largest thing that gets through. */
  PAYLOAD_TOO_LARGE: 'The request was too large.',
  INVALID_GATEWAY_ASSERTION: 'The request could not be authenticated end to end.',
  ASSERTION_EXPIRED: 'The request took too long to reach the server. Try again.',
  REPLAY_DETECTED: 'This request was already processed.',
  BODY_DIGEST_MISMATCH: 'The request was altered in transit.',
  ACTION_MISMATCH: 'The request was altered in transit.',
  IDENTITY_PROVIDER_UNAVAILABLE: 'Sign-in cannot be verified right now. Try again shortly.',
  GATEWAY_CONFIGURATION_ERROR: 'The service is misconfigured. This has been logged.',
  UPSTREAM_UNAVAILABLE: 'The data service is unavailable. Try again shortly.'
};

/** HTTP status. 401 for "who are you", 403 for "not you", 503 for "not now". */
var HTTP_STATUS = {
  NOT_AUTHENTICATED: 401, INVALID_TOKEN: 401, TOKEN_EXPIRED: 401, WRONG_ISSUER: 401,
  WRONG_AUDIENCE: 401, TOKEN_NOT_YET_VALID: 401, EMAIL_NOT_VERIFIED: 401,
  NOT_AUTHORIZED: 403, OUT_OF_SCOPE: 403, FEATURE_DISABLED: 403,
  TOO_MANY_REQUESTS: 429, PAYLOAD_TOO_LARGE: 413,
  INVALID_GATEWAY_ASSERTION: 401, ASSERTION_EXPIRED: 401, REPLAY_DETECTED: 409,
  BODY_DIGEST_MISMATCH: 400, ACTION_MISMATCH: 400,
  IDENTITY_PROVIDER_UNAVAILABLE: 503, GATEWAY_CONFIGURATION_ERROR: 500, UPSTREAM_UNAVAILABLE: 503
};

function isAnswer(code) { return ANSWERS.indexOf(code) >= 0; }
function isOutage(code) { return OUTAGES.indexOf(code) >= 0; }
function isThrottle(code) { return THROTTLES.indexOf(code) >= 0; }
function isRetryable(code) { return RETRYABLE.indexOf(code) >= 0; }

/** The only shape a refusal may leave the gateway in. `diagnostic` is NOT part of it. */
function refusal(code, correlationId) {
  return {
    ok: false,
    code: code,
    message: PUBLIC_MESSAGE[code] || 'The request was refused.',
    kind: isThrottle(code) ? 'throttle' : (isOutage(code) ? 'outage' : 'answer'),
    retryable: isRetryable(code),
    correlation_id: correlationId,
    http_status: HTTP_STATUS[code] || 400
  };
}

module.exports = {
  CODES: CODES, ANSWERS: ANSWERS, OUTAGES: OUTAGES, THROTTLES: THROTTLES, RETRYABLE: RETRYABLE,
  PUBLIC_MESSAGE: PUBLIC_MESSAGE, HTTP_STATUS: HTTP_STATUS,
  isAnswer: isAnswer, isOutage: isOutage, isThrottle: isThrottle,
  isRetryable: isRetryable, refusal: refusal
};
