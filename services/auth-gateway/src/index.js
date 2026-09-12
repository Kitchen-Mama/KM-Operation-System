'use strict';
/**
 * ==================================================================================================
 * ENTRY POINT — ITS WHOLE JOB IS TO REFUSE TO START BADLY, AND THEN TO STOP WELL
 * ==================================================================================================
 *
 * A gateway that boots with a missing origin list, no signing key, a plaintext upstream, or the test
 * verifier selected in production would take traffic and be wrong about every request. Every one of
 * those is a startup failure with a printed reason, not a warning to be found later in a log.
 *
 * SEC-A2R ADDED THE OTHER END: STOPPING. Cloud Run sends SIGTERM and waits — then kills. A process
 * that ignores SIGTERM has every in-flight request cut mid-answer on EVERY deploy and every scale-in,
 * and the caller sees a transport error that no log explains, because the process that was handling it
 * no longer exists. Draining is not politeness; it is the difference between a routine revision change
 * and a handful of unexplained failures each time. READINESS FLIPS FIRST so the load balancer stops
 * sending new work before the socket closes, and only then does the process wait for what it already
 * accepted. The hard deadline exists because a drain that never finishes is a SIGKILL with extra steps.
 * ==================================================================================================
 */
var config = require('./config.js');
var httpUtil = require('./http.js');
var verifierLib = require('./verifier.js');
var registry = require('./registry.js');
var guardLib = require('./guard.js');
var server = require('./server.js');
var fs = require('fs');

var loaded = config.load(process.env);
var log = httpUtil.makeLogger();

if (!loaded.ok) {
  loaded.problems.forEach(function (p) { log.error('startup', 'configuration', { problem: p }); });
  process.exit(78);   // EX_CONFIG
}
var cfg = loaded.cfg;
cfg.trustProxy = String(process.env.TRUST_PROXY || '') === 'true';

var ring = config.readKeyring(cfg);
if (!ring.active) {
  ring.problems.forEach(function (p) { log.error('startup', 'signing key', { problem: p }); });
  process.exit(78);
}

/* PRODUCTION LOADS GOOGLE'S LIBRARY OR DOES NOT RUN. A gateway that started without it would answer
   every request with an outage code, which looks like a Google problem and is not one. */
var client = null;
try {
  var OAuth2Client = require('google-auth-library').OAuth2Client;
  client = new OAuth2Client();
} catch (e) {
  log.error('startup', 'google-auth-library is not installed', { hint: 'npm ci --omit=dev' });
  process.exit(78);
}
var verifier = verifierLib.googleVerifier({ audience: cfg.googleClientId, client: client });

/* The operator registry is a mounted JSON file for the same reason the keys are: it can be updated
   without rebuilding an image, and revoking someone should not require a deployment. */
function loadRegistry() {
  if (!cfg.registryPath) return [];
  try { return JSON.parse(fs.readFileSync(cfg.registryPath, 'utf8')); } catch (e) { return []; }
}

var guard = guardLib.bestEffortInstanceLocalRateGuard({});
var breaker = guardLib.upstreamCircuitBreaker({});

/* Set BEFORE the server is created, so /readyz can report draining without a second flag to forget. */
var draining = false;

var srv = server.createServer({
  cfg: cfg,
  log: log,
  now: function () { return Math.floor(Date.now() / 1000); },
  verifier: verifier,
  keyring: function () { return config.readKeyring(cfg); },   // re-read: rotation without redeploy
  registry: loadRegistry,
  registryView: function () { return registry.publicView(loadRegistry()); },
  guard: guard,
  breaker: breaker,
  draining: function () { return draining; },
  upstream: function (payload) {
    return httpUtil.postUpstream(cfg.upstreamUrl, payload, cfg.upstreamTimeoutMs, null, {
      maxBytes: cfg.maxUpstreamBytes
    });
  }
});

/* A SLOW CLIENT MUST NOT BE ABLE TO HOLD A CONNECTION OPEN FOREVER. Without these, a caller who sends
   one header byte per minute occupies a socket indefinitely, and enough of them occupy the instance —
   the classic slowloris, which costs the attacker nothing and needs no valid token. */
srv.requestTimeout = cfg.requestTimeoutMs;
srv.headersTimeout = Math.min(cfg.requestTimeoutMs, 20000);
srv.keepAliveTimeout = 5000;

srv.listen(cfg.port, function () {
  log.info('startup', 'listening', {
    port: cfg.port, origins: cfg.allowedOrigins.length,
    actions: cfg.allowedActions.length, verifier: verifier.name,
    node_env: cfg.nodeEnv, rate_guard: guard.scope
  });
});

// --- graceful shutdown ----------------------------------------------------------------------------
var shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  draining = true;                       // /readyz answers 503 from here on
  log.info('shutdown', 'draining', { signal: signal });

  /* The grace period is deliberately SHORTER than Cloud Run's, so the process chooses its own exit
     rather than being killed in the middle of one. */
  var deadline = setTimeout(function () {
    log.warn('shutdown', 'drain deadline reached; exiting anyway', {});
    process.exit(0);
  }, Number(process.env.SHUTDOWN_GRACE_MS || 8000));
  deadline.unref();

  /* THE PAUSE BETWEEN "NOT READY" AND "NOT LISTENING" IS THE ONLY THING THAT MAKES THE FLIP REAL.
     Closing the socket in the same tick means no probe can ever observe the 503, and a request already
     in flight from the router arrives at a closed port and becomes a connection error with no
     explanation anywhere. This was MEASURED: before the pause, a readiness probe sent during the drain
     got no answer at all rather than a 503, which is how a flag that looked correct turned out to be
     unobservable. A quarter of a second is invisible on a deploy and is the difference between a
     readiness signal and a comment. */
  setTimeout(function () {
    srv.close(function () {
      log.info('shutdown', 'closed cleanly', {});
      clearTimeout(deadline);
      process.exit(0);
    });
    /* Idle keep-alive sockets would otherwise hold `close` open for the full keepAliveTimeout. */
    if (typeof srv.closeIdleConnections === 'function') srv.closeIdleConnections();
  }, Number(process.env.SHUTDOWN_PREDRAIN_MS || 250));
}
process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });
