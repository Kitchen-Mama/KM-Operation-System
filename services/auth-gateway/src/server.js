/**
 * ==================================================================================================
 * THE GATEWAY SERVER                                                             SEC-A2 §4 §6
 * ==================================================================================================
 *
 * Four routes and nothing else. An unknown path is 404 with no CORS headers, so a browser cannot even
 * read the refusal — an API with one job should have one door.
 *
 *   POST /v1/call     the only route that does anything
 *   OPTIONS /v1/call  the preflight, answered correctly, because Apps Script never could
 *   GET  /healthz     liveness: is the process up
 *   GET  /readyz      readiness: is it CONFIGURED — a different question, and the one that matters
 *
 * `/readyz` FAILS WHEN THE SIGNING KEY IS UNREADABLE. A gateway that is running but cannot sign would
 * otherwise take traffic and refuse all of it with a configuration error; failing readiness instead
 * keeps a broken revision out of the load balancer, which is what rollback is for.
 *
 * THE BODY LIMIT IS ENFORCED WHILE READING, NOT AFTER. Checking `Content-Length` alone trusts a header;
 * counting bytes as they arrive and destroying the socket at the limit does not.
 *
 * `createServer` TAKES ITS DEPENDENCIES so the whole gateway can be driven in a test without a
 * network, a clock or a secret.
 */
'use strict';

var http = require('http');
var codes = require('./codes.js');
var CODES = codes.CODES;
var httpUtil = require('./http.js');
var pipeline = require('./pipeline.js');

function createServer(deps) {
  var cfg = deps.cfg;
  var log = deps.log;

  function send(res, status, headers, obj) {
    var h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    for (var k in headers) h[k] = headers[k];
    res.writeHead(status, h);
    res.end(JSON.stringify(obj));
  }

  return http.createServer(function (req, res) {
    var origin = req.headers.origin || '';
    var cors = httpUtil.corsHeaders(cfg.allowedOrigins, origin);
    var correlationId = httpUtil.correlationFrom(req.headers['x-km-correlation-id']);

    if (req.method === 'OPTIONS' && req.url === '/v1/call') {
      /* An unknown origin gets 403 and no CORS headers. Answering 204 without them would be equally
         safe in a browser but says nothing in a log; this way a misconfigured origin is diagnosable. */
      if (!httpUtil.originAllowed(cfg.allowedOrigins, origin)) {
        log.warn(correlationId, 'preflight from unknown origin', { origin: origin || '(none)' });
        res.writeHead(403); return res.end();
      }
      res.writeHead(204, cors); return res.end();
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      return send(res, 200, {}, { ok: true, service: 'km-auth-gateway' });
    }

    if (req.method === 'GET' && req.url === '/readyz') {
      var ready = !!(deps.keyring() || {}).active;
      return send(res, ready ? 200 : 503, {}, {
        ok: ready,
        /* Shape without content: counts and flags, never a name or an address. */
        operators: deps.registryView(),
        actions: cfg.allowedActions.length,
        origins: cfg.allowedOrigins.length,
        signing_key: ready ? 'present' : 'MISSING'
      });
    }

    if (req.method !== 'POST' || req.url !== '/v1/call') {
      res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end();
    }

    if (!httpUtil.originAllowed(cfg.allowedOrigins, origin)) {
      log.warn(correlationId, 'call from unknown origin', { origin: origin || '(none)' });
      return send(res, 403, {}, codes.refusal(CODES.NOT_AUTHORIZED, correlationId));
    }

    var body = '', bytes = 0, aborted = false;
    req.setEncoding('utf8');
    req.on('data', function (chunk) {
      if (aborted) return;
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > cfg.maxBodyBytes) {
        aborted = true;
        log.warn(correlationId, 'body too large', { limit: cfg.maxBodyBytes });
        send(res, 413, cors, codes.refusal(CODES.ACTION_MISMATCH, correlationId));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', function () {
      if (aborted) return;
      pipeline.handle(body, correlationId, {
        cfg: cfg, log: log, now: deps.now,
        verifier: deps.verifier, keyring: deps.keyring(), registry: deps.registry(),
        upstream: deps.upstream
      }).then(function (r) {
        if (r.ok) return send(res, 200, cors, { ok: true, correlation_id: correlationId, body: r.body });
        return send(res, r.http_status, cors, r);
      }).catch(function (e) {
        /* An unexpected throw is a 500 with nothing in it. The detail goes to the log. */
        log.error(correlationId, 'unhandled', { error: String(e && e.message) });
        send(res, 500, cors, codes.refusal(CODES.GATEWAY_CONFIGURATION_ERROR, correlationId));
      });
    });
  });
}

module.exports = { createServer: createServer };
