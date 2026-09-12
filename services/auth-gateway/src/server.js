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
 *
 * SEC-A2R: EVERY RESPONSE CARRIES THE SECURITY HEADERS, INCLUDING THE ONES THAT SAY NO. `no-store` on
 * the 200 and not on the 403 would be the more comfortable half of the job and the wrong half: a
 * refusal names a correlation id and a 404 confirms a route does not exist, and both are things a
 * shared cache has no business keeping.
 *
 * THE RATE GUARD IS NOT AN AUTHORIZATION CHECK AND IS NOT PLACED WHERE ONE COULD BE MISTAKEN FOR IT.
 * Authorization runs on every admitted request exactly as before; the guard only decides whether this
 * instance is willing to do the work at all. And the limiter on FAILED AUTHENTICATION ATTEMPTS is
 * deliberately INVISIBLE — when it trips, the caller gets the same INVALID_TOKEN they were already
 * getting, byte for byte, and merely stops costing a signature verification. A limiter that announces
 * itself on the authentication path is a progress bar for whoever is guessing.
 */
'use strict';

var http = require('http');
var codes = require('./codes.js');
var CODES = codes.CODES;
var httpUtil = require('./http.js');
var guardLib = require('./guard.js');
var pipeline = require('./pipeline.js');

function createServer(deps) {
  var cfg = deps.cfg;
  var log = deps.log;

  var guard = deps.guard || null;
  var breaker = deps.breaker || null;

  function baseHeaders() {
    var h = { 'Content-Type': 'application/json; charset=utf-8' };
    for (var k in httpUtil.SECURITY_HEADERS) h[k] = httpUtil.SECURITY_HEADERS[k];
    return h;
  }

  function send(res, status, headers, obj) {
    var h = baseHeaders();
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
      /* DRAINING IS NOT READY. During shutdown the process is still answering, so liveness is true and
         readiness must not be — that gap is the whole mechanism by which the load balancer stops
         sending new work before the socket closes. */
      var drain = deps.draining ? deps.draining() : false;
      var ready = !drain && !!(deps.keyring() || {}).active;
      return send(res, ready ? 200 : 503, {}, {
        ok: ready,
        /* Shape without content: counts and flags, never a name or an address. */
        operators: deps.registryView(),
        actions: cfg.allowedActions.length,
        origins: cfg.allowedOrigins.length,
        draining: drain,
        /* A PRESENCE FLAG, NEVER THE KEY, NEVER ITS ID, NEVER ITS PATH. This endpoint is reachable by
           whoever can reach the service, and "which key is active" is a fact worth nothing to an
           operator and something to an attacker timing a rotation. */
        /* Derived from the SINGLE read above, not from a second one. Two reads of a mounted secret in
           one response can straddle a rotation, and the answer would then report ok:false alongside
           signing_key:'present' - a health endpoint disagreeing with itself, about the one fact it
           exists to report. */
        signing_key: ready ? 'present' : 'MISSING'
      });
    }

    if (req.method !== 'POST' || req.url !== '/v1/call') {
      res.writeHead(404, httpUtil.SECURITY_HEADERS); return res.end();
    }

    if (!httpUtil.originAllowed(cfg.allowedOrigins, origin)) {
      log.warn(correlationId, 'call from unknown origin', { origin: origin || '(none)' });
      return send(res, 403, {}, codes.refusal(CODES.NOT_AUTHORIZED, correlationId));
    }

    /* THE COARSE FLOOD GUARD, BEFORE ANY WORK. Instance-local and best-effort — see guard.js, which
       says so at length so that no summary of this system can call it a global rate limit. */
    if (guard) {
      var admit = guard.admitRequest(guardLib.clientAddress(req, !!cfg.trustProxy));
      if (!admit.allowed) {
        log.warn(correlationId, 'rate guard refused', { scope: 'per-ip', retry_after: admit.retryAfterSeconds });
        /* Retry-After is a HEADER, not a body field: HTTP already has a place to say this, and the
           body stays free of numbers a flooder could calibrate against. */
        return send(res, 429, { 'Retry-After': String(Math.max(1, admit.retryAfterSeconds || 1)) },
          codes.refusal(CODES.TOO_MANY_REQUESTS, correlationId));
      }
    }

    var body = '', bytes = 0, aborted = false;
    req.setEncoding('utf8');
    req.on('data', function (chunk) {
      if (aborted) return;
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > cfg.maxBodyBytes) {
        aborted = true;
        log.warn(correlationId, 'body too large', { limit: cfg.maxBodyBytes });
        /* STOP READING, ANSWER, AND ONLY THEN HANG UP — in that order.
           Destroying the request immediately after writing the response tears the socket down before
           the response has flushed, so the caller gets a connection reset and never learns why. That
           is what this did until the production-mode proof reported status 0 for this case: the limit
           was enforced correctly and the explanation was thrown away with the socket. Pausing stops
           us allocating any more; `finish` is the point at which the answer is actually on the wire. */
        req.pause();
        res.on('finish', function () { try { req.destroy(); } catch (e) { /* already gone */ } });
        send(res, 413, cors, codes.refusal(CODES.PAYLOAD_TOO_LARGE, correlationId));
        return;
      }
      body += chunk;
    });
    req.on('end', function () {
      if (aborted) return;
      pipeline.handle(body, correlationId, {
        cfg: cfg, log: log, now: deps.now,
        verifier: deps.verifier, keyring: deps.keyring(), registry: deps.registry(),
        upstream: deps.upstream,
        guard: guard, breaker: breaker,
        clientAddress: guardLib.clientAddress(req, !!cfg.trustProxy)
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
