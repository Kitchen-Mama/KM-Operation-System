'use strict';
/**
 * Entry point. Its whole job is to refuse to start badly.
 *
 * A gateway that boots with a missing origin list, no signing key, or the test verifier selected in
 * production would take traffic and be wrong about every request. Every one of those is a startup
 * failure with a printed reason, not a warning to be found later in a log.
 */
var config = require('./config.js');
var httpUtil = require('./http.js');
var verifierLib = require('./verifier.js');
var registry = require('./registry.js');
var server = require('./server.js');
var fs = require('fs');

var loaded = config.load(process.env);
var log = httpUtil.makeLogger();

if (!loaded.ok) {
  loaded.problems.forEach(function (p) { log.error('startup', 'configuration', { problem: p }); });
  process.exit(78);   // EX_CONFIG
}
var cfg = loaded.cfg;

var ring = config.readKeyring(cfg);
if (!ring.active) {
  ring.problems.forEach(function (p) { log.error('startup', 'signing key', { problem: p }); });
  process.exit(78);
}

var client = null;
try {
  var OAuth2Client = require('google-auth-library').OAuth2Client;
  client = new OAuth2Client();
} catch (e) {
  log.error('startup', 'google-auth-library is not installed', { hint: 'npm install' });
  process.exit(78);
}
var verifier = verifierLib.googleVerifier({ audience: cfg.googleClientId, client: client });

/* The operator registry is a mounted JSON file for the same reason the keys are: it can be updated
   without rebuilding an image, and revoking someone should not require a deployment. */
function loadRegistry() {
  if (!cfg.registryPath) return [];
  try { return JSON.parse(fs.readFileSync(cfg.registryPath, 'utf8')); } catch (e) { return []; }
}

server.createServer({
  cfg: cfg,
  log: log,
  now: function () { return Math.floor(Date.now() / 1000); },
  verifier: verifier,
  keyring: function () { return config.readKeyring(cfg); },   // re-read: rotation without redeploy
  registry: loadRegistry,
  registryView: function () { return registry.publicView(loadRegistry()); },
  upstream: function (payload) {
    return httpUtil.postUpstream(cfg.upstreamUrl, payload, cfg.upstreamTimeoutMs);
  }
}).listen(cfg.port, function () {
  log.info('startup', 'listening', { port: cfg.port, origins: cfg.allowedOrigins.length,
    actions: cfg.allowedActions.length, verifier: verifier.name });
});
