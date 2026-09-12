/**
 * ==================================================================================================
 * ABUSE AND COST GUARDS                                                          SEC-A2R §8
 * ==================================================================================================
 *
 * EVERYTHING IN THIS FILE IS INSTANCE-LOCAL AND MUST NEVER BE DESCRIBED AS A GLOBAL RATE LIMIT.
 *
 * That sentence is the reason the file exists in this shape. Cloud Run runs N instances; this counter
 * lives in the memory of one of them. With `--max-instances 4` a caller who is refused by one instance
 * is load-balanced onto another with a fresh bucket, so the real ceiling is `limit × instances`, and it
 * resets to zero every time an instance is replaced or scaled to zero. A limiter with those properties
 * is a genuinely useful COST and AVAILABILITY control and a genuinely weak SECURITY control, and the
 * failure mode is not the limiter — it is writing "rate limiting: yes" on a threat model and believing
 * a determined caller is bounded. The identifiers below are deliberately long and unpleasant so that
 * no summary of this system can quote one and sound reassuring.
 *
 * THE THREE CONTROLS, CLASSIFIED — because §8 requires the classification, not just the mechanism:
 *
 *   bestEffortInstanceLocalRateGuard   COST + AVAILABILITY. Bounds the work ONE instance will do for
 *                                      one caller. Bounds spend when combined with max-instances.
 *                                      NOT a security boundary: authorization is, and it is checked
 *                                      on every single request regardless of what this returns.
 *
 *   upstreamCircuitBreaker             AVAILABILITY + COST, for the UPSTREAM's sake. Apps Script has
 *                                      its own daily quotas; hammering a failing /exec spends them on
 *                                      nothing and can take the existing 138 actions down with it.
 *                                      Opening the circuit protects a system this gateway does not own.
 *
 *   response/request size ceilings     COST + AVAILABILITY. A bounded reply cannot exhaust memory and
 *                                      cannot become an unbounded egress bill.
 *
 * THE HARD BOUND ON SPEND IS `--max-instances`, NOT ANYTHING IN THIS FILE. A per-IP bucket cannot stop
 * a distributed flood; a max-instances ceiling stops the bill regardless of where the traffic came
 * from, by dropping requests instead of scaling. That is the control, and it is a deployment flag —
 * which is exactly why it is in the runbook and repeated in the cost model.
 *
 * INVALID TOKENS ARE COUNTED SEPARATELY AND MORE STRICTLY. Verifying a signature is the most expensive
 * thing the gateway does per request, so a flood of malformed tokens is the cheapest way to make it
 * expensive. The refusal stays byte-identical whether or not the guard tripped — see `retry_after`
 * below — because a limiter that answers differently is an oracle for how many guesses remain.
 * ==================================================================================================
 */
'use strict';

/**
 * A token bucket, per key, with a hard cap on how many keys are remembered.
 *
 * THE CAP ON DISTINCT KEYS IS NOT AN OPTIMISATION. An unbounded map keyed by remote address IS the
 * denial-of-service: a caller who varies the source address makes the gateway allocate for every one,
 * and the limiter becomes the thing that exhausts the memory it was added to protect. When the table
 * is full the OLDEST entry is evicted, which a flooder can exploit to clear their own record — so the
 * cap is set far above any plausible number of real callers, and the honest description of this
 * limiter's worst case is "it degrades to no limiter", never "it fails closed".
 */
function tokenBucket(opts) {
  var capacity = opts.capacity;                  // burst
  var refillPerSecond = opts.refillPerSecond;    // sustained rate
  var maxKeys = opts.maxKeys || 10000;
  var now = opts.now || function () { return Date.now(); };
  var buckets = new Map();

  function take(key, cost) {
    var k = String(key == null ? '' : key);
    var t = now();
    var b = buckets.get(k);
    if (!b) {
      if (buckets.size >= maxKeys) {
        /* Map preserves insertion order, so the first key is the oldest inserted. */
        var oldest = buckets.keys().next();
        if (!oldest.done) buckets.delete(oldest.value);
      }
      b = { tokens: capacity, at: t };
      buckets.set(k, b);
    }
    var elapsed = Math.max(0, (t - b.at) / 1000);
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSecond);
    b.at = t;
    var want = (cost === undefined) ? 1 : cost;
    if (b.tokens < want) {
      /* Reported for the LOG, never for the response body. */
      return { allowed: false, retryAfterSeconds: Math.ceil((want - b.tokens) / refillPerSecond) };
    }
    b.tokens -= want;
    return { allowed: true };
  }

  /**
   * Is there a token, WITHOUT spending one.
   *
   * The distinction matters in exactly one place and matters a lot there: the failed-authentication
   * budget is consulted BEFORE a signature is verified and charged only AFTER one fails. If the
   * consultation also spent a token, a legitimate operator would be paying into the flooder's budget
   * on every successful sign-in, and a busy real user would eventually lock themselves out of a
   * limiter that is supposed to be invisible to them.
   */
  function peek(key) {
    var b = buckets.get(String(key == null ? '' : key));
    if (!b) return { allowed: true };
    var t = now();
    var tokens = Math.min(capacity, b.tokens + Math.max(0, (t - b.at) / 1000) * refillPerSecond);
    if (tokens >= 1) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.ceil((1 - tokens) / refillPerSecond) };
  }

  return { take: take, peek: peek, size: function () { return buckets.size; }, _buckets: buckets };
}

/**
 * The guard the server actually calls. Three buckets, because the three things worth bounding are
 * bounded at different rates and a single bucket would have to be as loose as the loosest.
 */
function bestEffortInstanceLocalRateGuard(opts) {
  opts = opts || {};
  var now = opts.now;
  var perIp = tokenBucket({
    capacity: opts.ipBurst || 60, refillPerSecond: opts.ipPerSecond || 2,
    maxKeys: opts.maxKeys, now: now
  });
  var perPrincipal = tokenBucket({
    capacity: opts.principalBurst || 120, refillPerSecond: opts.principalPerSecond || 4,
    maxKeys: opts.maxKeys, now: now
  });
  /* Deliberately the tightest of the three: an unauthenticated caller has proved nothing, and
     signature verification is the most expensive work here. */
  var perIpInvalid = tokenBucket({
    capacity: opts.invalidBurst || 10, refillPerSecond: opts.invalidPerSecond || 0.2,
    maxKeys: opts.maxKeys, now: now
  });

  return {
    /** Called before any verification work. */
    admitRequest: function (ip) { return perIp.take(ip); },
    /** Called after the principal is known — bounds a real operator's own traffic. */
    admitPrincipal: function (identityKey) { return perPrincipal.take(identityKey); },
    /** Consulted before verification. Spends nothing — see `peek`. */
    peekAuthAttempt: function (ip) { return perIpInvalid.peek(ip); },
    /** Charged AFTER a verification fails. Only failures pay. */
    chargeFailedAuth: function (ip) { return perIpInvalid.take(ip); },
    sizes: function () {
      return { ip: perIp.size(), principal: perPrincipal.size(), invalid: perIpInvalid.size() };
    },
    /* The name is the documentation. Anything reading this object to describe the system gets told. */
    scope: 'instance-local, best-effort; NOT a global or distributed rate limit',
    isGlobal: false
  };
}

/**
 * A circuit breaker in front of the upstream.
 *
 * CLOSED  -> normal. Consecutive failures are counted; a success resets the count to zero.
 * OPEN    -> every call is refused WITHOUT contacting the upstream, for `cooldownMs`.
 * HALF    -> exactly ONE call is allowed through to find out whether it recovered. Success closes the
 *            circuit; failure opens it again for another cooldown.
 *
 * OPENING THE CIRCUIT IS AN AVAILABILITY DECISION AND IT IS REPORTED AS AN OUTAGE, never as a refusal
 * of the caller. UPSTREAM_UNAVAILABLE is retryable and says a machine is down; if a tripped breaker
 * answered NOT_AUTHORIZED it would tell every operator simultaneously that they had lost their
 * permissions, which is both false and the single most alarming thing this system could say.
 *
 * ONLY TRANSPORT FAILURES COUNT. An upstream that answers "FEATURE_DISABLED" is working perfectly;
 * counting a legitimate refusal as a failure would let the upstream's own correct behaviour trip the
 * breaker and take the gateway down with it.
 */
function upstreamCircuitBreaker(opts) {
  opts = opts || {};
  var threshold = opts.threshold || 5;
  var cooldownMs = opts.cooldownMs || 30000;
  var now = opts.now || function () { return Date.now(); };
  var failures = 0, openedAt = 0, state = 'closed', halfOpenInFlight = false;

  function stateNow() {
    if (state === 'open' && (now() - openedAt) >= cooldownMs) { state = 'half'; halfOpenInFlight = false; }
    return state;
  }
  return {
    /** @returns {allowed:boolean, state:string} */
    admit: function () {
      var s = stateNow();
      if (s === 'closed') return { allowed: true, state: s };
      if (s === 'open') return { allowed: false, state: s };
      if (halfOpenInFlight) return { allowed: false, state: s };   // one probe at a time
      halfOpenInFlight = true;
      return { allowed: true, state: s };
    },
    recordSuccess: function () { failures = 0; state = 'closed'; halfOpenInFlight = false; },
    recordFailure: function () {
      halfOpenInFlight = false;
      failures++;
      if (state === 'half' || failures >= threshold) { state = 'open'; openedAt = now(); }
    },
    state: function () { return stateNow(); },
    failures: function () { return failures; }
  };
}

/** The address to key a bucket on. A proxy header is NOT trusted unless the deployment says to. */
function clientAddress(req, trustProxy) {
  if (trustProxy) {
    /* Cloud Run sets X-Forwarded-For and appends; the CLIENT is the first entry. Trusting it is only
       safe behind an infrastructure that overwrites it, which is why it is opt-in: read directly from
       the internet, this header is whatever the caller typed. */
    var xff = String((req.headers && req.headers['x-forwarded-for']) || '');
    if (xff) return xff.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}

module.exports = {
  tokenBucket: tokenBucket,
  bestEffortInstanceLocalRateGuard: bestEffortInstanceLocalRateGuard,
  upstreamCircuitBreaker: upstreamCircuitBreaker,
  clientAddress: clientAddress
};
