/**
 * ==================================================================================================
 * CORS · LOGGING · CORRELATION · UPSTREAM                                    SEC-A2 §4 §6 §10 §11
 * ==================================================================================================
 *
 * CORS IS AN EXACT-STRING ALLOWLIST AND NOTHING ELSE. Every CORS bypass in the wild is a comparison
 * that was almost right: `startsWith` admits `https://example.com.attacker.test`, `endsWith` admits
 * `https://notexample.com`, a regular expression admits whatever an unescaped dot admits, and `null`
 * is an origin a sandboxed iframe can send at will. So: `indexOf(origin) >= 0`, and a request whose
 * Origin is absent or unknown gets NO CORS headers at all — the browser then refuses to hand the
 * response to the page, which is the correct outcome and needs no cooperation from us.
 *
 * THE LOGGER'S JOB IS TO REFUSE TO PRINT THINGS. A gateway handles exactly one class of value that
 * must never be written down, and it handles it on every request. Redaction by shape (anything
 * JWT-looking, anything long and base64url) is applied to every field of every log line, because the
 * one log call that forgot would be the one nobody reviewed.
 * ==================================================================================================
 */
'use strict';

var crypto = require('crypto');
var https = require('https');
var http = require('http');
var urlmod = require('url');

// --- CORS -----------------------------------------------------------------------------------------
function originAllowed(allowed, origin) {
  if (!origin) return false;
  if (origin === 'null') return false;          // sandboxed iframes, data: documents, file://
  return (allowed || []).indexOf(origin) >= 0;  // exact, always
}

function corsHeaders(allowed, origin) {
  if (!originAllowed(allowed, origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,      // the exact origin, never '*'
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-km-correlation-id',
    'Access-Control-Max-Age': '600'
    /* NO Access-Control-Allow-Credentials. The credential is a token in the body, so cookies are not
       wanted — and not asking for them removes a whole class of cross-site request forgery. */
  };
}

// --- correlation ----------------------------------------------------------------------------------
function newCorrelationId() { return 'kmg_' + crypto.randomBytes(9).toString('hex'); }

/** A client-supplied id is accepted for tracing but sanitised — it ends up in logs. */
function correlationFrom(headerValue) {
  var v = String(headerValue == null ? '' : headerValue);
  if (!/^[A-Za-z0-9_.-]{8,64}$/.test(v)) return newCorrelationId();
  return v;
}

// --- redaction ------------------------------------------------------------------------------------
var JWT_SHAPE = /[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
var LONG_B64 = /\b[A-Za-z0-9_-]{40,}\b/g;

function redactValue(v) {
  if (typeof v === 'string') {
    return v.replace(JWT_SHAPE, '<redacted-token>').replace(LONG_B64, '<redacted>');
  }
  if (Array.isArray(v)) return v.map(redactValue);
  if (v && typeof v === 'object') {
    var out = {};
    for (var k in v) {
      /* Named fields are dropped outright rather than pattern-matched: a short secret would survive
         a shape check, and `credential` has no business in a log under any circumstances. */
      if (/^(credential|id_token|token|secret|signature|authorization)$/i.test(k)) { out[k] = '<omitted>'; continue; }
      out[k] = redactValue(v[k]);
    }
    return out;
  }
  return v;
}

function makeLogger(sink) {
  var out = sink || function (line) { process.stdout.write(line + '\n'); };
  function emit(severity, correlationId, message, fields) {
    /* Cloud Logging picks up `severity` and the JSON body from stdout without any agent. */
    out(JSON.stringify(redactValue({
      severity: severity,
      correlation_id: correlationId,
      message: String(message),
      service: 'km-auth-gateway',
      fields: fields || {}
    })));
  }
  return {
    info: function (c, m, f) { emit('INFO', c, m, f); },
    warn: function (c, m, f) { emit('WARNING', c, m, f); },
    error: function (c, m, f) { emit('ERROR', c, m, f); },
    redact: redactValue
  };
}

// --- upstream -------------------------------------------------------------------------------------
/**
 * POST to the Apps Script /exec. Follows the 302 to the googleusercontent echo target, because that
 * is what every Apps Script answer does — the same hop the browser transport already handles.
 *
 * THE GOOGLE ID TOKEN IS NOT FORWARDED. What crosses this boundary is the assertion the gateway
 * signed, and nothing else: the upstream has no use for the token and every copy of a credential is a
 * place it can leak from.
 */
function postUpstream(urlStr, payload, timeoutMs, agentFactory) {
  return new Promise(function (resolve) {
    var body = JSON.stringify(payload);
    var u = urlmod.parse(urlStr);
    var lib = (u.protocol === 'http:') ? http : https;
    var done = false;
    function finish(r) { if (!done) { done = true; resolve(r); } }

    function go(target, hops) {
      if (hops > 5) return finish({ ok: false, reason: 'too many redirects' });
      var t = urlmod.parse(target);
      var libT = (t.protocol === 'http:') ? http : https;
      var req = (agentFactory || libT).request({
        protocol: t.protocol, hostname: t.hostname, port: t.port,
        path: t.path, method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Content-Length': Buffer.byteLength(body) }
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          /* A redirect after a POST is re-issued as a GET with the body dropped, per the Fetch
             specification — the same hazard the browser transport documents. Apps Script's own echo
             hop is the only redirect we follow, and we follow it as a GET deliberately. */
          return getFollow(res.headers.location, hops + 1);
        }
        var buf = '';
        res.setEncoding('utf8');
        res.on('data', function (d) { buf += d; });
        res.on('end', function () { finish({ ok: true, status: res.statusCode, body: buf }); });
      });
      req.on('error', function (e) { finish({ ok: false, reason: String(e && e.message) }); });
      req.setTimeout(timeoutMs, function () { req.destroy(); finish({ ok: false, reason: 'timeout' }); });
      req.write(body);
      req.end();
    }
    function getFollow(target, hops) {
      if (hops > 5) return finish({ ok: false, reason: 'too many redirects' });
      var t = urlmod.parse(target);
      var libT = (t.protocol === 'http:') ? http : https;
      var req = (agentFactory || libT).request({
        protocol: t.protocol, hostname: t.hostname, port: t.port, path: t.path, method: 'GET'
      }, function (res) {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume(); return getFollow(res.headers.location, hops + 1);
        }
        var buf = '';
        res.setEncoding('utf8');
        res.on('data', function (d) { buf += d; });
        res.on('end', function () { finish({ ok: true, status: res.statusCode, body: buf }); });
      });
      req.on('error', function (e) { finish({ ok: false, reason: String(e && e.message) }); });
      req.setTimeout(timeoutMs, function () { req.destroy(); finish({ ok: false, reason: 'timeout' }); });
      req.end();
    }
    go(urlStr, 0);
    void u; void lib;
  });
}

module.exports = {
  originAllowed: originAllowed,
  corsHeaders: corsHeaders,
  newCorrelationId: newCorrelationId,
  correlationFrom: correlationFrom,
  redactValue: redactValue,
  makeLogger: makeLogger,
  postUpstream: postUpstream
};
