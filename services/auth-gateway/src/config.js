/**
 * ==================================================================================================
 * CONFIGURATION — AND THE REFUSAL TO START WITHOUT IT                             SEC-A2 §4
 * ==================================================================================================
 *
 * Everything comes from the environment. Nothing has a working default, and that is deliberate: a
 * default for a security setting is a production deployment that silently runs with the test value.
 * `load()` returns a list of problems instead of throwing, so a misconfiguration is reported as a
 * complete list rather than one item at a time.
 *
 * SECRETS ARE READ FROM A FILE PATH BY PREFERENCE, NOT AN ENVIRONMENT VARIABLE. Cloud Run resolves a
 * secret environment variable once, at instance start, but re-reads a mounted secret volume on every
 * read — so a mounted key can be ROTATED WITHOUT A REDEPLOY, which is the difference between rotation
 * being a procedure and rotation being an outage. `readKeyring()` therefore reads at call time.
 *
 * PRODUCTION CANNOT SELECT THE TEST VERIFIER. `NODE_ENV=production` with anything but the Google
 * verifier is a configuration error, not a warning — otherwise the one path that skips Google is
 * exactly one environment variable away from being live.
 *
 * SEC-A2R ADDS THE SETTINGS THAT ARE ONLY WRONG IN PRODUCTION. Every check below that is gated on
 * `NODE_ENV === 'production'` exists because the same value is CORRECT during local development and
 * DANGEROUS once deployed: `http://localhost:8801` is the test origin and also the one origin an
 * attacker can always occupy; a plaintext upstream is how the end-to-end runs on a laptop and how an
 * assertion would be readable on the wire; an unset operator registry means "nobody" locally and
 * "nobody, permanently, silently" in production. A setting that changes meaning on deployment must be
 * CHECKED on deployment, because nothing else will ever catch it — the local run stays green.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');

function str(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

/**
 * Origins are compared with `===` against this list and never with `startsWith`, `endsWith` or a
 * regular expression. `https://evil-example.com` ends with nothing useful, but
 * `https://example.com.evil.com` starts with a prefix and `https://evilexample.com` ends with a
 * suffix — both of which a sloppy comparison admits.
 */
var VALID_NODE_ENVS = ['development', 'test', 'production'];

/**
 * The exact host an Apps Script Web App answers on. Checked as a HOST EQUALITY, never a substring:
 * `script.google.com.attacker.test` contains it, `notscript.google.com` ends with it, and a gateway
 * that signed an assertion to either of those would have handed a valid, replayable statement of a
 * real person's identity to whoever owns that name.
 */
var APPS_SCRIPT_HOST = 'script.google.com';

function isLoopbackHost(h) {
  var host = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || /^127\./.test(host);
}

/** Parse without throwing. An unparseable URL is a problem to report, not an exception to crash on. */
function parseUrl(u) {
  try { return new URL(String(u)); } catch (e) { return null; }
}

function num(v, dflt) {
  var n = Number(str(v));
  return (str(v) === '' || !isFinite(n)) ? dflt : n;
}

function parseOrigins(raw) {
  return str(raw).split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

function load(envIn) {
  var env = envIn || process.env;
  var problems = [];
  var cfg = {
    port: num(env.PORT, 8080),
    nodeEnv: str(env.NODE_ENV) || 'development',
    verifier: str(env.AUTH_VERIFIER) || 'google',
    googleClientId: str(env.GOOGLE_OAUTH_CLIENT_ID),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    requiredHostedDomain: str(env.REQUIRED_HOSTED_DOMAIN) || null,
    upstreamUrl: str(env.APPS_SCRIPT_EXEC_URL),
    upstreamTimeoutMs: num(env.UPSTREAM_TIMEOUT_MS, 25000),
    maxBodyBytes: num(env.MAX_BODY_BYTES, 65536),
    assertionTtlSeconds: num(env.ASSERTION_TTL_SECONDS, 120),
    clockSkewSeconds: num(env.CLOCK_SKEW_SECONDS, 120),
    requestTimeoutMs: num(env.REQUEST_TIMEOUT_MS, 30000),
    maxUpstreamBytes: num(env.MAX_UPSTREAM_BYTES, 4194304),
    activeKeyId: str(env.HMAC_ACTIVE_KEY_ID),
    activeKeyPath: str(env.HMAC_ACTIVE_KEY_FILE),
    previousKeyId: str(env.HMAC_PREVIOUS_KEY_ID),
    previousKeyPath: str(env.HMAC_PREVIOUS_KEY_FILE),
    allowedActions: parseOrigins(env.ALLOWED_ACTIONS),
    registryPath: str(env.OPERATOR_REGISTRY_FILE)
  };

  if (!cfg.googleClientId) problems.push('GOOGLE_OAUTH_CLIENT_ID is not set');
  if (!cfg.allowedOrigins.length) problems.push('ALLOWED_ORIGINS is empty — no browser could be served');
  cfg.allowedOrigins.forEach(function (o) {
    if (!/^https?:\/\/[^/]+$/.test(o)) problems.push('ALLOWED_ORIGINS entry is not a bare origin: ' + o);
    if (/\/$/.test(o)) problems.push('ALLOWED_ORIGINS entry has a trailing slash: ' + o);
  });
  if (!cfg.upstreamUrl) problems.push('APPS_SCRIPT_EXEC_URL is not set');
  if (!cfg.activeKeyId) problems.push('HMAC_ACTIVE_KEY_ID is not set');
  if (!cfg.activeKeyPath) problems.push('HMAC_ACTIVE_KEY_FILE is not set');
  if (!cfg.allowedActions.length) problems.push('ALLOWED_ACTIONS is empty — every action would be refused');
  if (cfg.previousKeyId && !cfg.previousKeyPath) problems.push('a previous key id was given with no file');
  if (cfg.previousKeyPath && !cfg.previousKeyId) problems.push('a previous key file was given with no id');
  if (cfg.previousKeyId && cfg.previousKeyId === cfg.activeKeyId) {
    problems.push('the previous key id equals the active one — rotation would be undetectable');
  }
  if (cfg.nodeEnv === 'production' && cfg.verifier !== 'google') {
    problems.push('the non-Google verifier cannot be selected in production');
  }
  if (cfg.maxBodyBytes > 1048576) problems.push('MAX_BODY_BYTES is above the 1 MiB ceiling this gateway accepts');

  // ---- SEC-A2R §5 -----------------------------------------------------------------------------
  var prod = cfg.nodeEnv === 'production';

  /* THE ENVIRONMENT MODE IS ITSELF A SETTING THAT CAN BE WRONG. `NODE_ENV=prod` is not `production`,
     and every production-only check below would silently not run — the most dangerous possible
     outcome, because the deployment would look configured and be unguarded. An unrecognised mode is
     refused rather than quietly treated as development. */
  if (VALID_NODE_ENVS.indexOf(cfg.nodeEnv) < 0) {
    problems.push('NODE_ENV must be one of ' + VALID_NODE_ENVS.join('/') + ', not: ' + cfg.nodeEnv);
  }

  /* No wildcard reaches the CORS comparison in any environment. `originAllowed` would refuse a literal
     '*' anyway — it compares exactly — but an operator who WROTE '*' believed they had opened it,
     and a configuration that silently does the opposite of what it was told is its own kind of
     failure. Refusing to start says so. */
  cfg.allowedOrigins.forEach(function (o) {
    if (o.indexOf('*') >= 0) problems.push('ALLOWED_ORIGINS may not contain a wildcard: ' + o);
  });

  if (prod) {
    cfg.allowedOrigins.forEach(function (o) {
      var u = parseUrl(o);
      if (!u) return;                                    // already reported as not-a-bare-origin
      if (u.protocol !== 'https:') problems.push('a production origin must be https: ' + o);
      if (isLoopbackHost(u.hostname)) problems.push('a production origin may not be loopback: ' + o);
    });
  }

  /* THE UPSTREAM IS WHERE THE SIGNED ASSERTION GOES. Getting this wrong does not fail closed — it
     succeeds, at the wrong address, handing a valid statement of a verified person's identity to
     whoever is listening there. Hence a scheme check, a host EQUALITY check, and a shape check on the
     path. */
  if (cfg.upstreamUrl) {
    var up = parseUrl(cfg.upstreamUrl);
    if (!up) {
      problems.push('APPS_SCRIPT_EXEC_URL is not a URL');
    } else {
      var loopbackUpstream = isLoopbackHost(up.hostname);
      if (up.protocol !== 'https:' && !(loopbackUpstream && !prod)) {
        problems.push('APPS_SCRIPT_EXEC_URL must be https (plaintext is allowed only for a non-production loopback test)');
      }
      if (prod) {
        if (up.hostname !== APPS_SCRIPT_HOST) {
          problems.push('APPS_SCRIPT_EXEC_URL host must be exactly ' + APPS_SCRIPT_HOST + ', not: ' + up.hostname);
        }
        if (!/^\/macros\/s\/[^/]+\/exec$/.test(up.pathname)) {
          problems.push('APPS_SCRIPT_EXEC_URL is not an Apps Script /exec path');
        }
      }
    }
  }

  /* An empty registry FAILS CLOSED but must still START: `registry.find` refuses everyone, and a
     process that exited instead could not answer /healthz — which is how an operator learns that the
     registry is the thing that is missing. In production the SOURCE must at least be named, because an
     unset path is indistinguishable from a mounted empty file until somebody is refused. */
  if (prod && !cfg.registryPath) {
    problems.push('OPERATOR_REGISTRY_FILE must be set in production (an empty registry is allowed; an unnamed one is not)');
  }

  if (!(cfg.assertionTtlSeconds > 0) || cfg.assertionTtlSeconds > 300) {
    problems.push('ASSERTION_TTL_SECONDS must be between 1 and 300');
  }
  if (!(cfg.clockSkewSeconds >= 0) || cfg.clockSkewSeconds > 300) {
    problems.push('CLOCK_SKEW_SECONDS must be between 0 and 300');
  }
  if (!(cfg.maxBodyBytes > 0)) problems.push('MAX_BODY_BYTES must be positive');
  if (!(cfg.port > 0 && cfg.port < 65536)) problems.push('PORT is not a port number');

  /* The upstream call must give up BEFORE the inbound request does, or the client is disconnected
     while the gateway is still waiting and the outcome of that call is never recorded anywhere. */
  if (!(cfg.upstreamTimeoutMs > 0)) problems.push('UPSTREAM_TIMEOUT_MS must be positive');
  if (cfg.upstreamTimeoutMs >= cfg.requestTimeoutMs) {
    problems.push('UPSTREAM_TIMEOUT_MS must be shorter than REQUEST_TIMEOUT_MS');
  }

  return { cfg: cfg, problems: problems, ok: problems.length === 0 };
}

/**
 * Read at CALL time, never cached, so a rotated secret volume takes effect on the next request.
 * A missing or empty key file is a hard failure: an empty secret would produce a signature every
 * other holder of an empty secret could forge.
 */
function readKeyring(cfg, readFile) {
  var rf = readFile || function (p) { return fs.readFileSync(p, 'utf8'); };
  function one(id, path) {
    if (!id || !path) return null;
    var secret;
    try { secret = String(rf(path)).replace(/\s+$/, ''); } catch (e) { return { key_id: id, secret: null, error: 'unreadable' }; }
    if (!secret) return { key_id: id, secret: null, error: 'empty' };
    if (secret.length < 32) return { key_id: id, secret: null, error: 'too short' };
    /* LENGTH IS NOT ENTROPY. `aaaaaaaa...` is forty-eight characters and one guess; so is a repeated
       word, and so is a placeholder somebody pasted out of the runbook. Counting distinct characters
       does not measure randomness, but it catches every shape a HUMAN produces by hand — which is the
       only way a weak key reaches this file, because `openssl rand -base64 48` cannot produce one. */
    var distinct = {}, d = 0;
    for (var i = 0; i < secret.length; i++) {
      if (!distinct[secret[i]]) { distinct[secret[i]] = 1; d++; }
    }
    if (d < 16) return { key_id: id, secret: null, error: 'too few distinct characters to be randomly generated' };
    if (/REPLACE_WITH|CHANGEME|PLACEHOLDER|EXAMPLE/i.test(secret)) {
      return { key_id: id, secret: null, error: 'is a placeholder' };
    }
    return { key_id: id, secret: secret };
  }
  var active = one(cfg.activeKeyId, cfg.activeKeyPath);
  var previous = one(cfg.previousKeyId, cfg.previousKeyPath);
  return {
    active: (active && active.secret) ? active : null,
    previous: (previous && previous.secret) ? previous : null,
    problems: []
      .concat(active && !active.secret ? ['active key ' + active.key_id + ' is ' + active.error] : [])
      .concat(previous && !previous.secret ? ['previous key ' + previous.key_id + ' is ' + previous.error] : [])
      .concat(active ? [] : ['no active key configured'])
  };
}

module.exports = {
  load: load, readKeyring: readKeyring, parseOrigins: parseOrigins,
  isLoopbackHost: isLoopbackHost, APPS_SCRIPT_HOST: APPS_SCRIPT_HOST,
  VALID_NODE_ENVS: VALID_NODE_ENVS
};
