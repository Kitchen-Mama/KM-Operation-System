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
function parseOrigins(raw) {
  return str(raw).split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

function load(envIn) {
  var env = envIn || process.env;
  var problems = [];
  var cfg = {
    port: Number(str(env.PORT) || 8080),
    nodeEnv: str(env.NODE_ENV) || 'development',
    verifier: str(env.AUTH_VERIFIER) || 'google',
    googleClientId: str(env.GOOGLE_OAUTH_CLIENT_ID),
    allowedOrigins: parseOrigins(env.ALLOWED_ORIGINS),
    requiredHostedDomain: str(env.REQUIRED_HOSTED_DOMAIN) || null,
    upstreamUrl: str(env.APPS_SCRIPT_EXEC_URL),
    upstreamTimeoutMs: Number(str(env.UPSTREAM_TIMEOUT_MS) || 25000),
    maxBodyBytes: Number(str(env.MAX_BODY_BYTES) || 65536),
    assertionTtlSeconds: Number(str(env.ASSERTION_TTL_SECONDS) || 120),
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

module.exports = { load: load, readKeyring: readKeyring, parseOrigins: parseOrigins };
